class BoothItemDetector {
  constructor() {
    this.urlPatterns = [
      /^https?:\/\/.*\.booth\.pm\/items\/(\d+)/,
      /^https?:\/\/booth\.pm\/.*\/items\/(\d+)/
    ];
  }

  isBoothItemPage() {
    const url = window.location.href;
    return this.urlPatterns.some(pattern => pattern.test(url));
  }

  extractItemId() {
    const url = window.location.href;
    for (const pattern of this.urlPatterns) {
      const match = url.match(pattern);
      if (match) {
        return match[1];
      }
    }
    return null;
  }

  init() {
    if (this.isBoothItemPage()) {
      const itemId = this.extractItemId();
      window.debugLogger?.log('AssetConnect Item Management: Item detected, ID:', itemId);
      return itemId;
    }
    return null;
  }
}

// Initialize managers with error handling
const storageManager = new StorageManager();
const uiManager = new UIManager();
const pageParser = new PageParser();

// Set up error handler for UI
window.errorHandler.addEventListener((error) => {
  if (error.type === 'ui' || error.type === 'clipboard') {
    const message = window.errorHandler.getUserFriendlyMessage(error.type);
    uiManager.showNotification(message);
  }
});

// Make managers globally accessible
window.storageManager = storageManager;
window.uiManager = uiManager;

const detector = new BoothItemDetector();
const currentItemId = detector.init();

// Page analysis and item detection logic
async function handlePageAnalysis() {
  return await window.errorHandler.safeExecute(async () => {
    window.debugLogger?.log('Analyzing page for BOOTH items...');
    
    // Parse the page for BOOTH item URLs
    const { parseResult, itemsToFetch } = await pageParser.fetchItemsFromPage();
  
  // Show management window
  uiManager.showWindow();
  
  
  // Load existing items first
  await loadExistingItems();
  
  // Check if current page item is already saved
  await checkAndDisplayCurrentPageItem();
  
  if (itemsToFetch.length > 0) {
    // Check which items are already saved
    const newItems = [];
    for (const item of itemsToFetch) {
      const exists = await storageManager.hasItem(item.id);
      if (!exists) {
        newItems.push(item);
      } else {
        window.debugLogger?.log(`Item ${item.id} already exists in saved items`);
      }
    }
    
    if (newItems.length > 0) {
      window.debugLogger?.log(`Found ${newItems.length} new BOOTH items in page content`);
      
      // Store only new items for processing
      window.boothItemsToFetch = newItems;
      
      // Show found items notification with URLs
      uiManager.showFoundItemsNotification(newItems);
      
      // Listen for user choice to fetch items
      document.addEventListener('boothFetchItem', async (event) => {
        if (event.detail.action === 'fetch') {
          window.debugLogger?.log('User chose to fetch BOOTH items from page content');
          await handleItemFetch();
        }
      }, { once: true });
      
      // Listen for item removal
      document.addEventListener('boothItemRemoved', (event) => {
        const removedItemId = event.detail.itemId;
        window.boothItemsToFetch = window.boothItemsToFetch.filter(item => item.id !== removedItemId);
        window.debugLogger?.log(`Item ${removedItemId} removed from fetch list`);
      });
    } else {
      window.debugLogger?.log('All found items are already saved');
    }
  } else {
    window.debugLogger?.log('No BOOTH items found in page content');
  }
  }, window.errorHandler.errorTypes.PARSE, { source: 'page-analysis' });
}

async function handleItemFetch(itemId) {
  return await window.errorHandler.safeExecute(async () => {
    window.debugLogger?.log('Fetching selected BOOTH items...');
    // Get remaining items from UI (after user removals)
    const remainingItems = uiManager.getRemainingFoundItems();
    const itemsToFetch = window.boothItemsToFetch?.filter(item => 
      remainingItems.some(remaining => remaining.id === item.id)
    ) || [];
    
    window.debugLogger?.log(`Processing ${itemsToFetch.length} selected BOOTH items`);
    
    if (itemsToFetch.length === 0) {
      uiManager.showNotification('処理するアイテムがありません');
      return;
    }

    // Process each found item with simple rate limiting
    const boothClient = new BoothJsonClient();
    let successCount = 0;
    let failedItems = []; // Track failed items for manual input suggestion
    const DELAY_BETWEEN_ITEMS = 300; // 0.3 second delay between individual items
    
    // Show progress notification
    uiManager.showNotification(`0/${itemsToFetch.length}個のアイテムを処理中...`);
    
    for (let i = 0; i < itemsToFetch.length; i++) {
      const item = itemsToFetch[i];
      try {
        // Check if item already exists
        const exists = await storageManager.hasItem(item.id);
        if (exists) {
          window.debugLogger?.log(`Item ${item.id} already exists, skipping`);
          continue;
        }

        window.debugLogger?.log(`Fetching data for item: ${item.id} from ${item.url}`);
        uiManager.showProgressNotification(successCount, itemsToFetch.length, `ID: ${item.id}`);
        
        const result = await boothClient.fetchItemData(item.url);
        
        if (result.success) {
          const itemData = {
            id: item.id,
            name: result.name,
            category: 'unsaved', // 新規取得アイテムは「新規」カテゴリに配置
            currentPageId: currentItemId
          };
          
          const saved = await storageManager.saveItem(item.id, itemData);
          if (saved) {
            window.debugLogger?.log(`Item ${item.id} saved: ${result.name}`);
            uiManager.addItemToSection('unsaved', itemData);
            successCount++;
          }
        } else {
          // Only log as error if it's not a CORS-related error
          if (result.isCorsError) {
            window.debugLogger?.log(`CORS fetch failed for item ${item.id}, trying background:`, result.error);
          } else {
            console.error(`Failed to fetch item ${item.id}:`, result.error);
          }
          
          if (result.needsBackgroundFetch || result.error.includes('CORS') || result.error.includes('Failed to fetch')) {
            window.debugLogger?.log(`Trying background fetch for item ${item.id} (CORS/Network error detected)`);
            try {
              const bgResult = await handleBackgroundFetch(item.id, item.url);
              if (bgResult && bgResult.success) {
                const itemData = {
                  id: item.id,
                  name: bgResult.name,
                  category: 'unsaved',
                  currentPageId: currentItemId
                };
                
                const saved = await storageManager.saveItem(item.id, itemData);
                if (saved) {
                  window.debugLogger?.log(`Item ${item.id} saved via background: ${bgResult.name}`);
                  uiManager.addItemToSection('unsaved', itemData);
                  successCount++;
                }
              } else {
                console.error(`Background fetch also failed for item ${item.id}`);
                failedItems.push({
                  id: item.id,
                  error: 'Background fetch failed'
                });
              }
            } catch (bgError) {
              console.error(`Background fetch error for item ${item.id}:`, bgError);
              failedItems.push({
                id: item.id,
                error: bgError.message
              });
            }
          } else {
            // Direct fetch failed without CORS/Network indication
            failedItems.push({
              id: item.id,
              error: result.error
            });
          }
        }
        
        // Short delay between items (except for the last item)
        if (i < itemsToFetch.length - 1) {
          await delay(DELAY_BETWEEN_ITEMS);
        }
        
      } catch (error) {
        console.error(`Error processing item ${item.id}:`, error);
      }
    }
    
    uiManager.hideNotification();
    
    // Show completion message and handle failed items
    if (successCount > 0 && failedItems.length === 0) {
      uiManager.showNotification(`${successCount}個のアイテムを取得しました`);
      setTimeout(() => uiManager.hideNotification(), 3000);
    } else if (successCount > 0 && failedItems.length > 0) {
      uiManager.showNotification(`${successCount}個のアイテムを取得しました。${failedItems.length}個のアイテムで取得に失敗しました。`);
      setTimeout(() => {
        uiManager.hideNotification();
        handleFailedItemsPrompt(failedItems);
      }, 3000);
    } else if (failedItems.length > 0) {
      uiManager.showNotification('アイテムの取得に失敗しました');
      setTimeout(() => {
        uiManager.hideNotification();
        handleFailedItemsPrompt(failedItems);
      }, 3000);
    } else {
      uiManager.showNotification('処理するアイテムがありませんでした');
      setTimeout(() => uiManager.hideNotification(), 3000);
    }
    
  }, window.errorHandler.errorTypes.NETWORK, { source: 'item-fetch' });
}

async function handleFailedItemsPrompt(failedItems) {
  window.debugLogger?.log('Handling failed items:', failedItems);
  
  if (failedItems.length === 0) return;
  
  try {
    // Show the management window if not already visible
    uiManager.showWindow();
    
    // Show failed items confirmation modal
    uiManager.showFailedItemsModal(failedItems);
    
  } catch (error) {
    console.error('Error in failed items prompt:', error);
  }
}

async function handleBackgroundFetch(itemId, itemUrl) {
  window.debugLogger?.log('Attempting background fetch for CORS bypass');
  
  return new Promise((resolve, reject) => {
    // Add timeout to prevent hanging
    const timeout = setTimeout(() => {
      resolve({ success: false, error: 'Background fetch timeout' });
    }, 10000); // 10 second timeout
    
    try {
      // Send message to background script
      chrome.runtime.sendMessage({
        action: 'fetchItemData',
        itemId: itemId,
        itemUrl: itemUrl
      }, (response) => {
        clearTimeout(timeout);
        
        if (chrome.runtime.lastError) {
          window.debugLogger?.error('Background fetch message error:', chrome.runtime.lastError);
          resolve({ success: false, error: chrome.runtime.lastError.message });
          return;
        }
        
        if (response && response.success) {
          window.debugLogger?.log('Background fetch successful:', response.name);
          resolve(response);
        } else {
          window.debugLogger?.error('Background fetch failed:', response?.error);
          resolve({ success: false, error: response?.error || 'Unknown error' });
        }
      });
    } catch (error) {
      clearTimeout(timeout);
      window.debugLogger?.error('Background fetch exception:', error);
      resolve({ success: false, error: error.message });
    }
  });
}


async function loadExistingItems() {
  const pageItems = await storageManager.getItemsForCurrentPage(currentItemId);
  window.debugLogger?.log('Loading existing items for current page:', Object.keys(pageItems).length);
  
  // Get items found on current page
  const { parseResult } = await pageParser.fetchItemsFromPage();
  const pageItemIds = new Set();
  
  // Add current page item ID if exists
  if (currentItemId) {
    pageItemIds.add(currentItemId);
  }
  
  // Add all items found on page
  parseResult.externalItems.forEach(item => {
    pageItemIds.add(item.itemId);
  });
  
  window.debugLogger?.log('Items found on current page:', Array.from(pageItemIds));
  
  // Display items that exist on the current page
  Object.values(pageItems).forEach(item => {
    if (pageItemIds.has(item.id)) {
      const category = item.category || 'unsaved';
      uiManager.addItemToSection(category, item);
      window.debugLogger?.log(`Added item ${item.id} to ${category} category`);
    }
  });
}

async function checkAndDisplayCurrentPageItem() {
  if (!currentItemId) {
    window.debugLogger?.log('Not on a BOOTH item page, skipping current item check');
    return;
  }
  
  window.debugLogger?.log(`Checking if current page item ${currentItemId} is already saved...`);
  
  const existingItem = await storageManager.getItem(currentItemId);
  if (existingItem) {
    window.debugLogger?.log(`Current page item ${currentItemId} found in database:`, existingItem.name);
    
    // Check if item is already displayed in UI (it should be from loadExistingItems)
    const existingElement = document.querySelector(`[data-item-id="${currentItemId}"]`);
    if (!existingElement) {
      // Item exists in database but not displayed in UI, add it
      const category = existingItem.category || 'saved';
      uiManager.addItemToSection(category, existingItem);
      window.debugLogger?.log(`Added current page item ${currentItemId} to ${category} category`);
    } else {
      window.debugLogger?.log(`Current page item ${currentItemId} already displayed in UI`);
    }
  } else {
    window.debugLogger?.log(`Current page item ${currentItemId} not found in database`);
  }
}

// Utility function for delays
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Initialize page analysis
handlePageAnalysis();