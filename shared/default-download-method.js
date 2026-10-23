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
    const key = getDownloadKey(getLibraryManagerUrl(dropdown));
    if (!key) return null;
    let container = dropdown.parentElement;
    while (container && container !== document.body) {
      const regular = findMatchingDownload(container.querySelectorAll(
        '.js-download-button[data-test="downloadable"]' +
        '[data-href^="https://booth.pm/downloadables/"], ' +
        'a[href^="https://booth.pm/downloadables/"]'
      ), key, getNormalUrl);
      if (regular) return regular;
      container = container.parentElement;
    }
    return null;
  }

  function findDropdownForRegular(regular) {
    const key = getDownloadKey(getNormalUrl(regular));
    if (!key) return null;
    let container = regular?.parentElement;
    while (container && container !== document.body) {
      const dropdown = findMatchingDownload(container.querySelectorAll(
        '[data-test="other-downloads-button"]'
      ), key, getLibraryManagerUrl);
      if (dropdown) return dropdown;
      container = container.parentElement;
    }
    return null;
  }

  function getNormalUrl(regular) {
    return regular?.dataset?.href || regular?.href || '';
  }

  function getDownloadKey(url) {
    try {
      const parsed = new URL(url);
      const id = /^\/downloadables\/(\d+)(?:\/deeplink)?\/?$/.exec(parsed.pathname)?.[1];
      return id ? { id, variationId: parsed.searchParams.get('variation_id') || '' } : null;
    } catch {
      return null;
    }
  }

  function findMatchingDownload(candidates, key, getUrl) {
    const matches = Array.from(candidates).map(element => ({
      element,
      key: getDownloadKey(getUrl(element))
    })).filter(candidate => candidate.key?.id === key.id);

    // 購入済みページでは通常URLとdeeplinkでvariation_idの有無が異なる。
    // 両方にある場合は一致を優先し、片方にない場合は同じファイルが一意なら対応付ける。
    const exact = matches.find(candidate => candidate.key.variationId === key.variationId);
    if (exact) return exact.element;
    const compatible = matches.filter(candidate =>
      !key.variationId || !candidate.key.variationId
    );
    return compatible.length === 1 ? compatible[0].element : null;
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
      await saveHistory(regular, false);
      launchUrl(normalUrl);
      return;
    }

    const deeplinkUrl = getLibraryManagerUrl(dropdown);
    if (!deeplinkUrl) throw new Error('BOOTH deeplink URL was not found');
    await saveHistory(regular, true);

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
        scheme: response.launchMode === 'firefox-navigation-redirect'
          ? 'vrcae (via Firefox redirect)'
          : response.deeplink.split(':', 1)[0]
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

  let currentAeBulkFormat = 'v0';
  const SCHEMA_INTERVAL_MS = 750;
  const MAX_URI_LENGTH = 2000;

  function buildBulkItemImportUrl(itemId, itemsChunk) {
    const json = JSON.stringify(itemsChunk);
    return `vrcae://bulk-item-import?v=1&item_id=${encodeURIComponent(itemId)}&items=${encodeURIComponent(json)}`;
  }

  function chunkItemsForUri(itemId, items, maxLength = MAX_URI_LENGTH) {
    const chunks = [];
    let currentChunk = [];

    for (const item of items) {
      const candidate = [...currentChunk, item];
      const url = buildBulkItemImportUrl(itemId, candidate);
      if (url.length <= maxLength || currentChunk.length === 0) {
        currentChunk.push(item);
      } else {
        chunks.push(currentChunk);
        currentChunk = [item];
      }
    }

    if (currentChunk.length > 0) {
      chunks.push(currentChunk);
    }

    return chunks;
  }

  function getItemId(regular) {
    const adapter = window.assetConnectDownloadAdapter;
    const info = adapter?.getInfo?.(regular);
    if (info?.boothID && info.boothID !== 'unknown') {
      return String(info.boothID);
    }
    let container = regular?.parentElement;
    while (container && container !== document.body) {
      const link = container.querySelector('a[href*="/items/"]');
      const match = link?.href?.match(/\/items\/(\d+)/);
      if (match) return match[1];
      container = container.parentElement;
    }
    const pageMatch = window.location?.href?.match(/\/items\/(\d+)/);
    if (pageMatch) return pageMatch[1];
    const anyLink = document.querySelector('a[href*="/items/"]');
    const anyMatch = anyLink?.href?.match(/\/items\/(\d+)/);
    if (anyMatch) return anyMatch[1];
    return '';
  }

  function getVariationId(regular) {
    const normalKey = getDownloadKey(getNormalUrl(regular));
    if (normalKey?.variationId) return normalKey.variationId;
    const dropdown = findDropdownForRegular(regular);
    if (dropdown) {
      const libraryKey = getDownloadKey(getLibraryManagerUrl(dropdown));
      if (libraryKey?.variationId) return libraryKey.variationId;
    }
    return '';
  }

  function getDownloadableFilename(regular) {
    const info = window.assetConnectDownloadAdapter?.getInfo?.(regular);
    if (info?.fileName && !info.fileName.includes('何らかの理由でデータを取得できませんでした')) {
      return info.fileName;
    }
    const title = regular.getAttribute?.('title');
    if (title) return title;
    const itemContainer = regular.closest?.('.variation-item, .sheet, .bg-white, .desktop\\:flex');
    const nameEl = itemContainer?.querySelector?.('.text-14, b');
    if (nameEl?.textContent?.trim()) return nameEl.textContent.trim();
    return '';
  }

  async function launchAvatarExplorerV0Bulk(regulars, onProgress = null) {
    if (!regulars || regulars.length === 0) return;
    let processedCount = 0;
    for (let i = 0; i < regulars.length; i++) {
      const regular = regulars[i];
      await window.assetConnectDefaultDownload.launchForRegular(regular);
      processedCount++;
      if (typeof onProgress === 'function') {
        onProgress(processedCount, regulars.length);
      }
      if (i < regulars.length - 1) {
        await new Promise(resolve => setTimeout(resolve, SCHEMA_INTERVAL_MS));
      }
    }
  }

  async function launchAvatarExplorerV1Bulk(regulars, onProgress = null) {
    if (!regulars || regulars.length === 0) return;

    const itemsByItem = new Map();
    for (const regular of regulars) {
      const itemId = getItemId(regular);
      const itemData = {
        variation_id: String(getVariationId(regular) || '').trim(),
        downloadable_filename: String(getDownloadableFilename(regular) || '').trim(),
        dlurl: String(getNormalUrl(regular) || '').trim()
      };
      if (!itemsByItem.has(itemId)) {
        itemsByItem.set(itemId, []);
      }
      itemsByItem.get(itemId).push({ regular, data: itemData });
      await saveHistory(regular, true);
    }

    let processedCount = 0;
    let isFirstLaunch = true;

    for (const [itemId, entries] of itemsByItem) {
      const itemsData = entries.map(e => e.data);
      const chunks = chunkItemsForUri(itemId, itemsData, MAX_URI_LENGTH);

      for (const chunk of chunks) {
        if (!isFirstLaunch) {
          await new Promise(resolve => setTimeout(resolve, SCHEMA_INTERVAL_MS));
        }
        isFirstLaunch = false;

        const url = buildBulkItemImportUrl(itemId, chunk);
        window.debugLogger?.log('[DOWNLOAD METHOD] AvatarExplorer bulk schema launched:', {
          itemId,
          itemCount: chunk.length,
          urlLength: url.length
        });
        launchUrl(url);

        processedCount += chunk.length;
        if (typeof onProgress === 'function') {
          onProgress(processedCount, regulars.length);
        }
      }
    }
  }

  async function launchBulk(regulars, onProgress = null) {
    if (!regulars || regulars.length === 0) return;
    const method = currentMethod;

    if (method === 'avatar-explorer') {
      if (currentAeBulkFormat === 'v1') {
        return launchAvatarExplorerV1Bulk(regulars, onProgress);
      }
      return launchAvatarExplorerV0Bulk(regulars, onProgress);
    }

    let processedCount = 0;
    for (let i = 0; i < regulars.length; i++) {
      const regular = regulars[i];
      if (method === 'normal') {
        const adapter = window.assetConnectDownloadAdapter;
        const info = adapter?.getInfo?.(regular);
        if (info) {
          await adapter.save?.(info);
        }
        const normalUrl = getNormalUrl(regular);
        if (normalUrl) {
          const iframe = document.createElement('iframe');
          iframe.style.display = 'none';
          iframe.src = normalUrl;
          document.body.appendChild(iframe);
          setTimeout(() => {
            if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
          }, 60000);
        }
      } else {
        await window.assetConnectDefaultDownload.launchForRegular(regular);
      }

      processedCount++;
      if (typeof onProgress === 'function') {
        onProgress(processedCount, regulars.length);
      }

      if (i < regulars.length - 1) {
        await new Promise(resolve => setTimeout(
          resolve,
          method === 'normal' ? 1000 : SCHEMA_INTERVAL_MS
        ));
      }
    }
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
    getAeBulkFormat() {
      return currentAeBulkFormat;
    },
    setAeBulkFormat(format) {
      currentAeBulkFormat = format === 'v1' ? 'v1' : 'v0';
    },
    async launchForRegular(regular) {
      const dropdown = findDropdownForRegular(regular);
      if (!dropdown) throw new Error('Other download methods were not found');
      return launchMethod(currentMethod, dropdown, regular);
    },
    async launchBulk(regulars, onProgress) {
      return launchBulk(regulars, onProgress);
    },
    buildBulkItemImportUrl,
    chunkItemsForUri
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
      : findDropdownForRegular(regular);
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

  chrome.storage.local.get(['defaultDownloadMethod', 'aeBulkDownloadFormat'], result => {
    currentMethod = VALID_METHODS.has(result.defaultDownloadMethod)
      ? result.defaultDownloadMethod
      : 'normal';
    currentAeBulkFormat = result.aeBulkDownloadFormat === 'v1' ? 'v1' : 'v0';
    updatePage();
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') return;
    if (changes.defaultDownloadMethod) {
      currentMethod = VALID_METHODS.has(changes.defaultDownloadMethod.newValue)
        ? changes.defaultDownloadMethod.newValue
        : 'normal';
      updatePage();
    }
    if (changes.aeBulkDownloadFormat) {
      currentAeBulkFormat = changes.aeBulkDownloadFormat.newValue === 'v1' ? 'v1' : 'v0';
    }
  });

  chrome.runtime.onMessage.addListener(request => {
    if (request.action !== 'probeBoothDeeplink' || !request.requestUrl) return;

    const probeUrl = new URL(request.requestUrl);
    const requestId = probeUrl.searchParams.get('_asset_connect_request_id');
    window.debugLogger?.log('[DOWNLOAD METHOD] Deeplink probe received:', {
      requestId: requestId?.slice(0, 8),
      downloadableId: /\/downloadables\/(\d+)/.exec(probeUrl.pathname)?.[1]
    });

    // 元のbooth-library-manager://への遷移を止める。
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
    characterData: true,
    subtree: true
  });
})();
