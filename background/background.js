// Background service worker for AssetConnect extension
chrome.runtime.onInstalled.addListener(async () => {
  // console.log('AssetConnect extension installed');

  // Initialize context menus with proper i18n support
  await initializeContextMenus();

  // Initialize debug mode state
  chrome.storage.local.get(['debugMode'], (result) => {
    const debugMode = result.debugMode || false;
    updateContextMenuTitle(debugMode);
  });

  // Cleanup editing items on installation/update
  cleanupAllEditingItems();
});

async function initializeContextMenus() {
  // Get the current language setting
  const result = await chrome.storage.local.get(['selectedLanguage']);
  const selectedLang = result.selectedLanguage || chrome.i18n.getUILanguage().substring(0, 2);
  const lang = ['ja', 'en', 'ko'].includes(selectedLang) ? selectedLang : 'en';

  // Load translations for the selected language
  const translations = await loadTranslations(lang);

  // Create context menus with translated titles
  chrome.contextMenus.create({
    id: 'debug-mode-toggle',
    title: translations.debugModeToggle || 'デバッグモード切り替え',
    contexts: ['action']
  });

  chrome.contextMenus.create({
    id: 'show-storage-overview',
    title: translations.showStorageOverview || 'ストレージ一覧・データ量を表示',
    contexts: ['action']
  });

  chrome.contextMenus.create({
    id: 'show-avatar-clipboard',
    title: translations.showAvatarClipboard || 'AssetConnect 一括コピーのウィンドウを表示する',
    contexts: ['page'],
    documentUrlPatterns: ["https://*.booth.pm/items/*", "https://booth.pm/*/items/*"]
  });
}

async function loadTranslations(lang) {
  try {
    const response = await fetch(chrome.runtime.getURL(`_locales/${lang}/messages.json`));
    if (!response.ok) throw new Error(`Failed to load translations for ${lang}`);
    const translations = await response.json();

    // Convert to simple key-value pairs
    const messages = {};
    for (const [key, value] of Object.entries(translations)) {
      messages[key] = value.message;
    }
    return messages;
  } catch (error) {
    console.error('Translation loading error:', error);
    if (lang !== 'en') {
      return await loadTranslations('en');
    }
    return {};
  }
}

async function updateContextMenusLanguage(lang) {
  const translations = await loadTranslations(lang);

  // Update all context menu titles
  chrome.contextMenus.update('debug-mode-toggle', {
    title: translations.debugModeToggle || 'デバッグモード切り替え'
  });

  chrome.contextMenus.update('show-storage-overview', {
    title: translations.showStorageOverview || 'ストレージ一覧・データ量を表示'
  });

  chrome.contextMenus.update('show-avatar-clipboard', {
    title: translations.showAvatarClipboard || 'AssetConnect 一括コピーのウィンドウを表示する'
  });

  // Update debug mode title with proper translation
  chrome.storage.local.get(['debugMode'], (result) => {
    const debugMode = result.debugMode || false;
    updateContextMenuTitle(debugMode, translations);
  });
}

// Cleanup editing items on browser startup
chrome.runtime.onStartup.addListener(() => {
  debugLog('Browser startup - cleaning up all editing items...');
  cleanupAllEditingItems();
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'debug-mode-toggle') {
    chrome.storage.local.get(['debugMode'], (result) => {
      const currentDebugMode = result.debugMode || false;
      const newDebugMode = !currentDebugMode;

      chrome.storage.local.set({ debugMode: newDebugMode }, () => {
        updateContextMenuTitle(newDebugMode);

        // Notify content scripts of debug mode change
        if (tab && tab.id) {
          chrome.tabs.sendMessage(tab.id, {
            action: 'debugModeChanged',
            debugMode: newDebugMode
          }).catch(() => {
            // Ignore errors if content script not loaded
          });
        }
      });
    });
  } else if (info.menuItemId === 'show-storage-overview') {
    // Open storage overview page
    chrome.tabs.create({
      url: chrome.runtime.getURL('storage-management/storage-overview.html')
    });
  } else if (info.menuItemId === 'show-avatar-clipboard') {
    // Show avatar clipboard window
    if (tab && tab.id) {
      chrome.tabs.sendMessage(tab.id, {
        action: 'showAvatarClipboard'
      }).catch(() => {
        // Ignore errors if content script not loaded
      });
    }
  }
});

async function updateContextMenuTitle(debugMode, translations = null) {
  if (!translations) {
    // Get current language and load translations
    const result = await chrome.storage.local.get(['selectedLanguage']);
    const selectedLang = result.selectedLanguage || chrome.i18n.getUILanguage().substring(0, 2);
    const lang = ['ja', 'en', 'ko'].includes(selectedLang) ? selectedLang : 'en';
    translations = await loadTranslations(lang);
  }

  const title = debugMode
    ? (translations.debugModeOn || 'デバッグモード: ON → OFF')
    : (translations.debugModeOff || 'デバッグモード: OFF → ON');

  chrome.contextMenus.update('debug-mode-toggle', { title });
}



async function cleanupAllEditingItems() {
  try {
    const result = await chrome.storage.local.get(['boothItems']);
    const boothItems = result.boothItems || {};

    let removedCount = 0;
    const cleanedItems = {};

    for (const [itemId, item] of Object.entries(boothItems)) {
      // Keep only saved items, remove all editing items (unsaved/excluded)
      if (item.category === 'saved') {
        cleanedItems[itemId] = item;
      } else if (item.category === 'unsaved' || item.category === 'excluded') {
        removedCount++;
        debugLog(`Removing editing item: ${itemId} (${item.category})`);
      } else {
        // Keep items with unknown categories for safety
        cleanedItems[itemId] = item;
      }
    }

    if (removedCount > 0) {
      await chrome.storage.local.set({ boothItems: cleanedItems });
      debugLog(`Cleaned up ${removedCount} editing items on browser startup`);
    } else {
      debugLog('No editing items found for cleanup');
    }


  } catch (error) {
    console.error('Error during editing items cleanup:', error);
  }
}


// Handle cross-origin requests from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'fetchItemData') {
    handleCrossOriginFetch(request.itemUrl, request.itemId)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({
        success: false,
        error: error.message
      }));

    // Return true to indicate async response
    return true;
  } else if (request.action === 'fetchAvatarExplorerDeeplink') {
    debugLog('Deeplink: message received', {
      tabId: sender.tab?.id,
      downloadableId: /\/downloadables\/(\d+)/.exec(request.deeplinkUrl || '')?.[1]
    });
    handleAvatarExplorerDeeplink(request.deeplinkUrl, sender.tab?.id)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({
        success: false,
        error: error.message
      }));
    return true;
  } else if (request.action === 'languageChanged') {
    // Update context menus when language changes
    updateContextMenusLanguage(request.language);
    sendResponse({ success: true });
    return true;
  }
});

const pendingDeeplinkRequests = new Map();

function resolvePendingDeeplink(requestUrl, location, source, statusCode) {
  const requestId = new URL(requestUrl).searchParams.get('_asset_connect_request_id');
  const resolve = requestId && pendingDeeplinkRequests.get(requestId);
  debugLog('Deeplink: webRequest event', {
    requestId: requestId?.slice(0, 8),
    source,
    statusCode,
    pending: Boolean(resolve),
    hasLocation: Boolean(location),
    locationScheme: location?.split(':', 1)[0]
  });
  if (resolve && location) resolve(location);
}

chrome.webRequest.onHeadersReceived.addListener(
  details => {
    const locationHeader = details.responseHeaders?.find(
      header => header.name.toLowerCase() === 'location'
    );
    resolvePendingDeeplink(
      details.url,
      locationHeader?.value,
      'onHeadersReceived',
      details.statusCode
    );
  },
  { urls: ['https://booth.pm/downloadables/*/deeplink*'] },
  ['responseHeaders', 'extraHeaders']
);

chrome.webRequest.onBeforeRedirect.addListener(
  details => resolvePendingDeeplink(
    details.url,
    details.redirectUrl,
    'onBeforeRedirect',
    details.statusCode
  ),
  { urls: ['https://booth.pm/downloadables/*/deeplink*'] }
);

async function handleAvatarExplorerDeeplink(deeplinkUrl, tabId) {
  const url = new URL(deeplinkUrl);
  if (url.origin !== 'https://booth.pm' || !/^\/downloadables\/\d+\/deeplink$/.test(url.pathname)) {
    throw new Error('Invalid BOOTH deeplink URL');
  }

  // 同時リクエストを区別し、webRequest側でこの302だけを捕捉する。
  const requestId = crypto.randomUUID();
  url.searchParams.set('_asset_connect_request_id', requestId);
  const requestUrl = url.href;
  debugLog('Deeplink: request prepared', {
    requestId: requestId.slice(0, 8),
    tabId,
    downloadableId: /\/downloadables\/(\d+)/.exec(url.pathname)?.[1]
  });
  let timeoutId;
  let resolveLocation;
  let rejectLocation;
  const locationPromise = new Promise((resolve, reject) => {
    resolveLocation = resolve;
    rejectLocation = reject;
    pendingDeeplinkRequests.set(requestId, resolveLocation);
    debugLog('Deeplink: pending request registered', {
      requestId: requestId.slice(0, 8),
      pendingCount: pendingDeeplinkRequests.size
    });
    timeoutId = setTimeout(() => {
      debugLog('Deeplink: request timed out', {
        requestId: requestId.slice(0, 8),
        tabId,
        pendingCount: pendingDeeplinkRequests.size
      });
      reject(new Error(`BOOTH deeplink request timed out (${requestId.slice(0, 8)})`));
    }, 10000);
  });

  try {
    if (!tabId) throw new Error('BOOTH tab was not found');

    // ログイン済みBOOTHタブをリクエスト元にすることで、認証Cookieを確実に利用する。
    chrome.tabs.sendMessage(tabId, {
      action: 'probeBoothDeeplink',
      requestUrl
    }).then(() => {
      debugLog('Deeplink: probe dispatched to tab', {
        requestId: requestId.slice(0, 8),
        tabId
      });
    }).catch(error => {
      debugLog('Deeplink: probe dispatch failed', {
        requestId: requestId.slice(0, 8),
        error: error.message
      });
      rejectLocation(new Error(`BOOTH deeplink probe failed: ${error.message}`));
    });

    const location = await locationPromise;
    debugLog('Deeplink: Location received', {
      requestId: requestId.slice(0, 8),
      scheme: location.split(':', 1)[0]
    });

    if (!location.startsWith('booth-library-manager://')) {
      throw new Error('BOOTH Library Manager deeplink was not returned');
    }

    return {
      success: true,
      deeplink: location.replace(/^booth-library-manager:\/\//, 'vrcae://')
    };
  } finally {
    clearTimeout(timeoutId);
    pendingDeeplinkRequests.delete(requestId);
    debugLog('Deeplink: request cleaned up', {
      requestId: requestId.slice(0, 8),
      pendingCount: pendingDeeplinkRequests.size
    });
  }
}

async function handleCrossOriginFetch(itemUrl, itemId) {
  try {
    const jsonUrl = await convertToJsonUrl(itemUrl);
    // Debug log - will be controlled by debug mode
    debugLog('Background fetching:', jsonUrl);

    const response = await fetch(jsonUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (compatible; AssetConnect-Extension)'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const jsonData = await response.json();
    const itemName = extractItemName(jsonData);

    return {
      success: true,
      name: itemName,
      itemId: itemId,
      fetchedVia: 'background'
    };

  } catch (error) {
    console.warn('Background fetch error:', error);
    return {
      success: false,
      error: error.message,
      itemId: itemId
    };
  }
}

async function convertToJsonUrl(itemUrl) {
  // Extract item ID from various BOOTH URL formats
  const itemId = extractItemId(itemUrl);
  if (!itemId) {
    // Fallback to original URL + .json if ID extraction fails
    if (itemUrl.endsWith('.json')) {
      return itemUrl;
    }
    if (itemUrl.endsWith('/')) {
      return itemUrl.slice(0, -1) + '.json';
    }
    return itemUrl + '.json';
  }

  // Get current language setting for API calls
  try {
    const result = await chrome.storage.local.get(['selectedLanguage']);
    const selectedLang = result.selectedLanguage || chrome.i18n.getUILanguage().substring(0, 2);
    const lang = ['ja', 'en', 'ko'].includes(selectedLang) ? selectedLang : 'ja';
    return `https://booth.pm/${lang}/items/${itemId}.json`;
  } catch (error) {
    // Fallback to Japanese if unable to get language setting
    return `https://booth.pm/ja/items/${itemId}.json`;
  }
}

function extractItemId(itemUrl) {
  // Match various BOOTH URL patterns
  const patterns = [
    /https?:\/\/(?:[\w-]+\.)?booth\.pm\/(?:[\w-]+\/)?items\/(\d+)/,
    /https?:\/\/booth\.pm\/(?:[\w-]+\/)?items\/(\d+)/
  ];

  for (const pattern of patterns) {
    const match = itemUrl.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }

  return null;
}

function extractItemName(jsonData) {
  if (!jsonData) {
    throw new Error('No JSON data provided');
  }

  if (jsonData.name) {
    return jsonData.name;
  }

  if (jsonData.item && jsonData.item.name) {
    return jsonData.item.name;
  }

  if (jsonData.title) {
    return jsonData.title;
  }

  throw new Error('Could not find name field in JSON response');
}

// Debug logging function
async function debugLog(...args) {
  try {
    const result = await chrome.storage.local.get(['debugMode']);
    if (result.debugMode) {
      console.log('[AC DEBUG]', ...args);
    }
  } catch (error) {
    // Silently fail if storage is not available
  }
}
