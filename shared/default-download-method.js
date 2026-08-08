(() => {
  const VALID_METHODS = new Set(['normal', 'booth-library-manager', 'avatar-explorer']);
  let currentMethod = 'normal';

  function getMessage(key, substitutions, fallback) {
    return chrome.i18n.getMessage(key, substitutions) || fallback;
  }

  function findTextNode(button) {
    if (!button) return null;
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
        '.js-download-button[data-test="downloadable"]' +
        '[data-href^="https://booth.pm/downloadables/"], ' +
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

  function prepareAvatarExplorerLaunch() {
    // 302取得後に現在のBOOTHページから直接起動するため、事前タブは不要。
    return null;
  }

  function launchUrl(url, preparedWindow = null) {
    const link = document.createElement('a');
    link.href = url;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  // 各ダウンロードページのAvatarExplorerボタンから共通利用する。
  window.prepareAvatarExplorerLaunch = prepareAvatarExplorerLaunch;
  window.launchAvatarExplorer = launchUrl;

  async function launchMethod(method, dropdown, regular) {
    const downloadableId = /\/downloadables\/(\d+)/.exec(
      getLibraryManagerUrl(dropdown)
    )?.[1];
    window.debugLogger?.log('[DOWNLOAD METHOD] Launch requested:', {
      method,
      downloadableId
    });

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

    const preparedWindow = prepareAvatarExplorerLaunch();
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'fetchAvatarExplorerDeeplink',
        deeplinkUrl
      });
      if (!response?.success || !response.deeplink) {
        throw new Error(response?.error || 'AvatarExplorer deeplink could not be created');
      }
      window.debugLogger?.log('[DOWNLOAD METHOD] AvatarExplorer deeplink converted:', {
        downloadableId,
        scheme: response.deeplink.split(':', 1)[0]
      });
      launchUrl(response.deeplink, preparedWindow);
    } catch (error) {
      preparedWindow?.close();
      throw error;
    }
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
    document.querySelectorAll('.js-download-button[data-test="browsable"]').forEach(browsable => {
      const textNode = findTextNode(browsable.querySelector('button'));
      const label = browsable.dataset.label;
      if (textNode && label && textNode.textContent !== label) {
        textNode.textContent = label;
      }
    });

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
    const avatarExplorerRow = event.target.closest('.asset-connect-avatar-explorer-download');
    const menuRow = event.target.closest('[data-test="other-downloads-button"] .cursor-pointer');
    const libraryManagerRow = menuRow &&
      !normalRow &&
      !avatarExplorerRow &&
      menuRow.textContent.includes('BOOTH Library Manager')
        ? menuRow
        : null;
    const regular = event.target.closest(
      '.js-download-button[data-test="downloadable"]' +
      '[data-href^="https://booth.pm/downloadables/"], ' +
      'a[href^="https://booth.pm/downloadables/"]'
    );
    if (!normalRow && !avatarExplorerRow && !libraryManagerRow &&
        (!regular || currentMethod === 'normal')) return;

    const dropdown = normalRow || avatarExplorerRow || libraryManagerRow
      ? (normalRow || avatarExplorerRow || libraryManagerRow)
          .closest('[data-test="other-downloads-button"]')
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
      : avatarExplorerRow
        ? 'avatar-explorer'
        : libraryManagerRow
          ? 'booth-library-manager'
          : currentMethod;
    window.debugLogger?.log('[DOWNLOAD METHOD] Click captured:', {
      method,
      delegatedRow: Boolean(normalRow || avatarExplorerRow || libraryManagerRow),
      hasRegularDownload: Boolean(regular || findRegularDownload(dropdown))
    });
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

  chrome.runtime.onMessage.addListener(request => {
    if (request.action !== 'probeBoothDeeplink' || !request.requestUrl) return;

    const probeUrl = new URL(request.requestUrl);
    const requestId = probeUrl.searchParams.get('_asset_connect_request_id');
    window.debugLogger?.log('[DOWNLOAD METHOD] Deeplink probe received:', {
      requestId: requestId?.slice(0, 8),
      downloadableId: /\/downloadables\/(\d+)/.exec(probeUrl.pathname)?.[1]
    });

    // redirect: manualで元のbooth-library-manager://への遷移を止める。
    // Locationの取得はbackgroundのwebRequest監視が担当する。
    fetch(request.requestUrl, {
      method: 'GET',
      credentials: 'include',
      redirect: 'manual'
    }).then(response => {
      window.debugLogger?.log('[DOWNLOAD METHOD] Deeplink probe completed:', {
        requestId: requestId?.slice(0, 8),
        status: response.status,
        type: response.type,
        redirected: response.redirected
      });
    }).catch(error => {
      // カスタムスキームへの302はfetch上ではERR_UNSAFE_REDIRECTになる。
      // LocationはbackgroundのwebRequestで取得するため、これは想定動作。
      window.debugLogger?.log('[DOWNLOAD METHOD] Deeplink probe ended at external redirect:', {
        requestId: requestId?.slice(0, 8),
        error: error.message
      });
    });
  });

  new MutationObserver(updatePage).observe(document.documentElement, {
    childList: true,
    subtree: true
  });
})();
