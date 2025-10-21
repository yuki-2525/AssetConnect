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
    id: 'export-saved-items',
    title: translations.exportSavedItems || '保存済みアバターデータをエクスポート',
    contexts: ['action']
  });
  
  chrome.contextMenus.create({
    id: 'import-saved-items',
    title: translations.importSavedItems || 'アバターデータをインポート',
    contexts: ['action']
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
  
  chrome.contextMenus.update('export-saved-items', {
    title: translations.exportSavedItems || '保存済みアバターデータをエクスポート'
  });
  
  chrome.contextMenus.update('import-saved-items', {
    title: translations.importSavedItems || 'アバターデータをインポート'
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
  } else if (info.menuItemId === 'export-saved-items') {
    // Export saved items to file
    exportSavedItemsToFile();
  } else if (info.menuItemId === 'import-saved-items') {
    // Import items from file
    importItemsFromFile();
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

async function exportSavedItemsToFile() {
  try {
    debugLog('Starting export process...');
    
    const result = await chrome.storage.local.get(['boothItems']);
    const boothItems = result.boothItems || {};
    debugLog('Retrieved storage data:', Object.keys(boothItems).length, 'items');
    
    // Get only saved items
    const savedItems = Object.values(boothItems).filter(item => item.category === 'saved');
    debugLog('Found saved items:', savedItems.length);
    
    if (savedItems.length === 0) {
      debugLog('No saved items to export');
      return;
    }
    
    // Format as JSON matching the provided structure
    const exportData = {
      exportDate: new Date().toISOString(),
      version: "1.0",
      items: savedItems.map(item => ({
        id: item.id,
        name: item.name || `Item ${item.id}`
      }))
    };
    
    debugLog('Export data prepared:', exportData.items.length, 'items');
    
    const jsonString = JSON.stringify(exportData, null, 2);
    debugLog('JSON string length:', jsonString.length);
    
    // Generate filename with current date
    const now = new Date();
    const dateString = now.toISOString().split('T')[0]; // YYYY-MM-DD
    const filename = `booth-items-${dateString}.json`;
    debugLog('Generated filename:', filename);
    
    // Create data URL for download
    const dataUrl = 'data:application/json;charset=utf-8,' + encodeURIComponent(jsonString);
    debugLog('Data URL created, length:', dataUrl.length);
    
    // Download the file
    debugLog('Attempting download...');
    const downloadId = await chrome.downloads.download({
      url: dataUrl,
      filename: filename,
      saveAs: true
    });
    
    debugLog(`Export completed successfully. Download ID: ${downloadId}, exported ${savedItems.length} items to ${filename}`);
    
  } catch (error) {
    console.error('Export error:', error);
    debugLog('Export failed:', error.message);
  }
}

async function importItemsFromFile() {
  try {
    // Create file input element (this won't work in service worker context)
    // We need to create an HTML page for file import
    chrome.tabs.create({
      url: chrome.runtime.getURL('storage-management/import.html')
    });
    
  } catch (error) {
    console.error('Import error:', error);
  }
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
  } else if (request.action === 'languageChanged') {
    // Update context menus when language changes
    updateContextMenusLanguage(request.language);
    sendResponse({ success: true });
    return true;
  }
});

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
    console.error('Background fetch error:', error);
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