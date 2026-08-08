(() => {
  const VALID_METHODS = new Set(['normal', 'booth-library-manager', 'avatar-explorer']);
  let currentMethod = 'normal';

  function getMessage(key, substitutions, fallback) {
    return chrome.i18n.getMessage(key, substitutions) || fallback;
  }

  function findTextNode(button) {
    const walker = document.createTreeWalker(button, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (node.textContent.trim()) return node;
    }
    return null;
  }

  function findRegularDownload(dropdown) {
    let container = dropdown.parentElement;
    while (container && container !== document.body) {
      const regular = container.querySelector(
        '.js-download-button[data-href^="https://booth.pm/downloadables/"], ' +
        'a[href^="https://booth.pm/downloadables/"]'
      );
      if (regular) return regular;
      container = container.parentElement;
    }
    return null;
  }

  function findDropdownForRegular(regular) {
    let container = regular?.parentElement;
    while (container && container !== document.body) {
      const dropdown = container.querySelector('[data-test="other-downloads-button"]');
      if (dropdown) return dropdown;
      container = container.parentElement;
    }
    return null;
  }

  function getNormalUrl(regular) {
    return regular?.dataset?.href || regular?.href || '';
  }

  function getLibraryManagerUrl(dropdown) {
    try {
      const items = JSON.parse(dropdown.dataset.dropdownItems || '[]');
      return items.find(item =>
        item.deeplinkDownloadableUrl?.includes('client=booth-library-manager')
      )?.deeplinkDownloadableUrl || '';
    } catch (error) {
      window.debugLogger?.error('[DOWNLOAD METHOD] Invalid dropdown data:', error);
      return '';
    }
  }

  async function saveHistory(regular, registered = false) {
    const adapter = window.assetConnectDownloadAdapter;
    if (!adapter || !regular) return;
    try {
      const info = adapter.getInfo(regular);
      info.registered = registered;
      await adapter.save(info);
    } catch (error) {
      window.debugLogger?.warn('[DOWNLOAD METHOD] History save failed:', error);
    }
  }

  function launchUrl(url) {
    const link = document.createElement('a');
    link.href = url;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  async function launchMethod(method, dropdown, regular) {
    if (method === 'normal') {
      const normalUrl = getNormalUrl(regular);
      if (!normalUrl) throw new Error('Normal download URL was not found');
      saveHistory(regular, false);
      launchUrl(normalUrl);
      return;
    }

    const deeplinkUrl = getLibraryManagerUrl(dropdown);
    if (!deeplinkUrl) throw new Error('BOOTH deeplink URL was not found');
    saveHistory(regular, true);

    if (method === 'booth-library-manager') {
      launchUrl(deeplinkUrl);
      return;
    }

    const response = await chrome.runtime.sendMessage({
      action: 'fetchAvatarExplorerDeeplink',
      deeplinkUrl
    });
    if (!response?.success || !response.deeplink) {
      throw new Error(response?.error || 'AvatarExplorer deeplink could not be created');
    }
    launchUrl(response.deeplink);
  }

  function updateDropdown(dropdown) {
    const regular = findRegularDownload(dropdown);
    if (!regular) return;

    const button = regular.matches('a') ? regular : regular.querySelector('button');
    if (button) {
      let textNode = button._assetConnectLabelNode;
      if (!textNode?.isConnected) {
        textNode = findTextNode(button);
        button._assetConnectLabelNode = textNode;
        button._assetConnectNormalLabel = textNode?.textContent;
      }
      if (textNode) {
        const methodName = currentMethod === 'booth-library-manager'
          ? 'BOOTH Library Manager'
          : 'AvatarExplorer';
        const label = currentMethod === 'normal'
          ? button._assetConnectNormalLabel
          : getMessage('downloadWithMethod', [methodName], `${methodName}でダウンロード`);
        if (textNode.textContent !== label) textNode.textContent = label;
      }
    }

    const existing = dropdown.querySelector('.asset-connect-normal-download');
    if (currentMethod === 'normal') {
      existing?.remove();
      return;
    }
    if (existing) return;

    const menu = dropdown.querySelector('.absolute.top-full');
    const sourceRow = menu && Array.from(menu.children).find(row =>
      row.textContent.includes('BOOTH Library Manager')
    );
    if (!sourceRow) return;

    const normalRow = sourceRow.cloneNode(true);
    normalRow.classList.add('asset-connect-normal-download');
    const textNode = Array.from(normalRow.childNodes).find(node =>
      node.nodeType === Node.TEXT_NODE && node.textContent.trim()
    );
    if (textNode) {
      textNode.textContent = getMessage('normalDownload', null, '通常ダウンロード');
    }
    menu.insertBefore(normalRow, menu.firstElementChild);
  }

  function updatePage() {
    document.querySelectorAll('[data-test="other-downloads-button"][data-dropdown-items]')
      .forEach(updateDropdown);
    document.querySelectorAll('.asset-connect-download-all button').forEach(button => {
      const label = window.assetConnectDefaultDownload?.getBulkButtonLabel();
      if (!button.disabled && label && button.textContent !== label) {
        button.textContent = label;
      }
    });
  }

  window.assetConnectDefaultDownload = {
    getMethod() {
      return currentMethod;
    },
    getBulkButtonLabel() {
      if (currentMethod === 'normal') {
        return getMessage('downloadAllButton', null, '一括ダウンロード');
      }
      const methodName = currentMethod === 'booth-library-manager'
        ? 'BOOTH Library Manager'
        : 'AvatarExplorer';
      return getMessage(
        'bulkDownloadWithMethod',
        [methodName],
        `${methodName}で一括ダウンロード`
      );
    },
    async launchForRegular(regular) {
      const dropdown = findDropdownForRegular(regular);
      if (!dropdown) throw new Error('Other download methods were not found');
      return launchMethod(currentMethod, dropdown, regular);
    }
  };

  document.addEventListener('click', event => {
    const normalRow = event.target.closest('.asset-connect-normal-download');
    const menuRow = event.target.closest('[data-test="other-downloads-button"] .cursor-pointer');
    const libraryManagerRow = menuRow &&
      !normalRow &&
      !menuRow.classList.contains('asset-connect-avatar-explorer-download') &&
      menuRow.textContent.includes('BOOTH Library Manager')
        ? menuRow
        : null;
    const regular = event.target.closest(
      '.js-download-button[data-href^="https://booth.pm/downloadables/"], ' +
      'a[href^="https://booth.pm/downloadables/"]'
    );
    if (!normalRow && !libraryManagerRow && (!regular || currentMethod === 'normal')) return;

    const dropdown = normalRow || libraryManagerRow
      ? (normalRow || libraryManagerRow).closest('[data-test="other-downloads-button"]')
      : (() => {
          let container = regular.parentElement;
          while (container && container !== document.body) {
            const found = container.querySelector('[data-test="other-downloads-button"]');
            if (found) return found;
            container = container.parentElement;
          }
          return null;
        })();
    if (!dropdown) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    const method = normalRow
      ? 'normal'
      : libraryManagerRow
        ? 'booth-library-manager'
        : currentMethod;
    launchMethod(method, dropdown, regular || findRegularDownload(dropdown))
      .catch(error => {
        window.debugLogger?.error('[DOWNLOAD METHOD] Launch failed:', error);
        alert(`ダウンロード方法の起動に失敗しました。\n${error.message}`);
      });
  }, true);

  chrome.storage.local.get('defaultDownloadMethod', result => {
    currentMethod = VALID_METHODS.has(result.defaultDownloadMethod)
      ? result.defaultDownloadMethod
      : 'normal';
    updatePage();
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local' || !changes.defaultDownloadMethod) return;
    currentMethod = VALID_METHODS.has(changes.defaultDownloadMethod.newValue)
      ? changes.defaultDownloadMethod.newValue
      : 'normal';
    updatePage();
  });

  new MutationObserver(updatePage).observe(document.documentElement, {
    childList: true,
    subtree: true
  });
})();
