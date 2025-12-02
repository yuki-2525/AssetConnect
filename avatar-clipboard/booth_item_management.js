/**
 * BOOTHアイテムページの検出とアイテムID抽出を行うクラス
 */
class BoothItemDetector {
  constructor() {
    // BOOTHアイテムページのURLパターン
    this.urlPatterns = [
      /^https?:\/\/.*\.booth\.pm\/items\/(\d+)/, // サブドメイン形式: shop.booth.pm/items/123
      /^https?:\/\/booth\.pm\/.*\/items\/(\d+)/   // パス形式: booth.pm/ja/items/123
    ];
  }

  /**
   * 現在のページがBOOTHアイテムページかどうかを判定
   * @returns {boolean} BOOTHアイテムページの場合true
   */
  isBoothItemPage() {
    const url = window.location.href;
    return this.urlPatterns.some(pattern => pattern.test(url));
  }

  /**
   * 現在のページのURLからBOOTHアイテムIDを抽出
   * @returns {string|null} アイテムID（数字）、見つからない場合はnull
   */
  extractItemId() {
    const url = window.location.href;
    for (const pattern of this.urlPatterns) {
      const match = url.match(pattern);
      if (match) {
        return match[1]; // 正規表現の最初のキャプチャグループ（アイテムID）
      }
    }
    return null;
  }

  /**
   * 検出器を初期化し、現在のページがBOOTHアイテムページの場合はアイテムIDを返す
   * @returns {string|null} アイテムID、BOOTHアイテムページでない場合はnull
   */
  init() {
    if (this.isBoothItemPage()) {
      const itemId = this.extractItemId();
      window.debugLogger?.log('AssetConnect Item Management: Item detected, ID:', itemId);
      return itemId;
    }
    return null;
  }
}

// 各種マネージャーの初期化（エラーハンドリング付き）
const storageManager = new StorageManager(); // ストレージ管理
const uiManager = new UIManager();           // UI管理
const pageParser = new PageParser();         // ページ解析

// 共有翻訳マネージャーを使用
const translationManager = window.translationManager;




// UIエラーハンドラーの設定
window.errorHandler.addEventListener((error) => {
  if (error.type === 'ui' || error.type === 'clipboard') {
    const message = window.errorHandler.getUserFriendlyMessage(error.type);
    uiManager.showNotification(message);
  }
});

// マネージャーをグローバルからアクセス可能にする
window.storageManager = storageManager;
window.uiManager = uiManager;
window.pageParser = pageParser;

const detector = new BoothItemDetector();
const currentItemId = detector.init();

/**
 * ページ解析とアイテム検出のメイン処理
 * BOOTHアイテムURLを検索し、管理ウィンドウを表示する
 */
async function handlePageAnalysis() {
  return await window.errorHandler.safeExecute(async () => {
    window.debugLogger?.log('Analyzing page for BOOTH items...');
    
    // ページからBOOTHアイテムURLを解析
    const { parseResult, itemsToFetch } = await pageParser.fetchItemsFromPage();
  
  // 管理ウィンドウを表示
  uiManager.showWindow();
  
  
  // 既存アイテムを最初に読み込み
  await loadExistingItems();
  
  // 現在のページアイテムが既に保存済みかチェック
  await checkAndDisplayCurrentPageItem();
  
  if (itemsToFetch.length > 0) {
    // 常に除外されたアイテムIDを取得
    const permanentlyExcludedIds = await storageManager.getPermanentlyExcludedItemIds();
    
    // どのアイテムが既に保存されているか、または常に除外されているかをチェック
    const newItems = [];
    for (const item of itemsToFetch) {
      // 常に除外されたアイテムはスキップ
      if (permanentlyExcludedIds.has(item.id)) {
        window.debugLogger?.log(`Item ${item.id} is permanently excluded, skipping`);
        continue;
      }
      
      const exists = await storageManager.hasItem(item.id);
      if (!exists) {
        newItems.push(item);
      } else {
        window.debugLogger?.log(`Item ${item.id} already exists in saved items`);
      }
    }
    
    if (newItems.length > 0) {
      window.debugLogger?.log(`Found ${newItems.length} new BOOTH items in page content`);
      
      // 処理用に新しいアイテムのみを保存
      window.boothItemsToFetch = newItems;
      
      // 新しいアイテムの通知をURL付きで表示
      uiManager.showFoundItemsNotification(newItems);
      
      // ユーザーのアイテム取得選択をリスン
      document.addEventListener('boothFetchItem', async (event) => {
        if (event.detail.action === 'fetch') {
          window.debugLogger?.log('User chose to fetch BOOTH items from page content');
          await handleItemFetch();
        }
      }, { once: true });
      
      // アイテム削除イベントをリスン
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

/**
 * 選択されたBOOTHアイテムの情報を取得する処理
 * @param {string} itemId - アイテムID（未使用）
 */
async function handleItemFetch(itemId) {
  return await window.errorHandler.safeExecute(async () => {
    window.debugLogger?.log('Fetching selected BOOTH items...');
    // UIから残っているアイテムを取得（ユーザーが削除した後）
    const remainingItems = uiManager.getRemainingFoundItems();
    const itemsToFetch = window.boothItemsToFetch?.filter(item => 
      remainingItems.some(remaining => remaining.id === item.id)
    ) || [];
    
    window.debugLogger?.log(`Processing ${itemsToFetch.length} selected BOOTH items`);
    
    if (itemsToFetch.length === 0) {
      uiManager.showNotification(translationManager.getMessage('noItemsToProcess'));
      return;
    }

    // シンプルなレート制限で各アイテムを処理
    const boothClient = new BoothJsonClient();
    let successCount = 0;
    let failedItems = []; // 手動入力推奨のために失敗アイテムを追跡
    const DELAY_BETWEEN_ITEMS = 300; // アイテム間の0.3秒遅延
    
    // 進行状況通知を表示
    uiManager.showNotification(translationManager.getMessage('processingItems', { count: itemsToFetch.length }).replace('{count}', '0'));
    
    for (let i = 0; i < itemsToFetch.length; i++) {
      const item = itemsToFetch[i];
      try {
        // アイテムが既に存在するかチェック
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
          // フェッチ失敗はデバッグログとして処理（HTTPエラーは想定内）
          window.debugLogger?.log(`Fetch failed for item ${item.id}:`, result.error);
          
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
                window.debugLogger?.log(`Background fetch also failed for item ${item.id}`);
                failedItems.push({
                  id: item.id,
                  error: 'Background fetch failed'
                });
              }
            } catch (bgError) {
              window.debugLogger?.log(`Background fetch error for item ${item.id}:`, bgError.message);
              failedItems.push({
                id: item.id,
                error: bgError.message
              });
            }
          } else {
            // CORS/ネットワーク問題の兆候なしに直接フェッチが失敗
            failedItems.push({
              id: item.id,
              error: result.error
            });
          }
        }
        
        // アイテム間の短い遅延（最後のアイテム以外）
        if (i < itemsToFetch.length - 1) {
          await delay(DELAY_BETWEEN_ITEMS);
        }
        
      } catch (error) {
        window.debugLogger?.log(`Error processing item ${item.id}:`, error.message);
      }
    }
    
    uiManager.hideNotification();
    
    // 完了メッセージを表示し、失敗アイテムを処理
    if (successCount > 0 && failedItems.length === 0) {
      uiManager.showNotification(translationManager.getMessage('itemsFetched', { count: successCount }));
      setTimeout(() => uiManager.hideNotification(), 3000);
    } else if (successCount > 0 && failedItems.length > 0) {
      uiManager.showNotification(translationManager.getMessage('itemsFetched', { count: successCount }) + ' ' + translationManager.getMessage('itemsFetchFailed', { count: failedItems.length }));
      setTimeout(() => {
        uiManager.hideNotification();
        handleFailedItemsPrompt(failedItems);
      }, 3000);
    } else if (failedItems.length > 0) {
      uiManager.showNotification(translationManager.getMessage('fetchFailed'));
      setTimeout(() => {
        uiManager.hideNotification();
        handleFailedItemsPrompt(failedItems);
      }, 3000);
    } else {
      uiManager.showNotification(translationManager.getMessage('noItemsProcessed'));
      setTimeout(() => uiManager.hideNotification(), 3000);
    }
    
  }, window.errorHandler.errorTypes.NETWORK, { source: 'item-fetch' });
}

/**
 * 取得に失敗したアイテムの手動入力プロンプトを表示
 * @param {Array} failedItems - 失敗したアイテムの配列
 */
async function handleFailedItemsPrompt(failedItems) {
  window.debugLogger?.log('Handling failed items:', failedItems);
  
  if (failedItems.length === 0) return;
  
  try {
    // 管理ウィンドウが非表示の場合は表示
    uiManager.showWindow();
    
    // 失敗アイテヤ確認モーダルを表示
    uiManager.showFailedItemsModal(failedItems);
    
  } catch (error) {
    console.error('Error in failed items prompt:', error);
  }
}

/**
 * CORS回避のためにバックグラウンドスクリプト経由でアイテム情報を取得
 * @param {string} itemId - アイテムID
 * @param {string} itemUrl - アイテムURL
 * @returns {Promise} 取得結果のPromise
 */
async function handleBackgroundFetch(itemId, itemUrl) {
  window.debugLogger?.log('Attempting background fetch for CORS bypass');
  
  return new Promise((resolve, reject) => {
    // ハングを防ぐためのタイムアウトを追加
    const timeout = setTimeout(() => {
      resolve({ success: false, error: 'Background fetch timeout' });
    }, 10000); // 10秒タイムアウト
    
    try {
      // バックグラウンドスクリプトにメッセージを送信
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
          window.debugLogger?.log('Background fetch failed:', response?.error);
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


/**
 * 既存のアイテムを現在のページから読み込み、UIに表示する
 */
async function loadExistingItems() {
  const pageItems = await storageManager.getItemsForCurrentPage(currentItemId);
  window.debugLogger?.log('Loading existing items for current page:', Object.keys(pageItems).length);
  
  // 現在のページで見つかったアイテムを取得
  const { parseResult } = await pageParser.fetchItemsFromPage();
  const pageItemIds = new Set();
  
  // 現在のページのアイテムIDが存在する場合は追加
  if (currentItemId) {
    pageItemIds.add(currentItemId);
  }
  
  // ページで見つかった全アイテムを追加
  parseResult.externalItems.forEach(item => {
    pageItemIds.add(item.itemId);
  });
  
  window.debugLogger?.log('Items found on current page:', Array.from(pageItemIds));
  
  // 現在のページに存在するアイテムのみ表示
  Object.values(pageItems).forEach(item => {
    if (pageItemIds.has(item.id)) {
      const category = item.category || 'unsaved';
      uiManager.addItemToSection(category, item);
      window.debugLogger?.log(`Added item ${item.id} to ${category} category`);
    }
  });
}

/**
 * 現在のページのアイテムが既に保存済みかどうかをチェックし、UIに表示する
 */
async function checkAndDisplayCurrentPageItem() {
  if (!currentItemId) {
    window.debugLogger?.log('Not on a BOOTH item page, skipping current item check');
    return;
  }
  
  window.debugLogger?.log(`Checking if current page item ${currentItemId} is already saved...`);
  
  const existingItem = await storageManager.getItem(currentItemId);
  if (existingItem) {
    window.debugLogger?.log(`Current page item ${currentItemId} found in database:`, existingItem.name);
    
    // アイテムが既にUIに表示されているかチェック（loadExistingItemsからのものであるはず）
    const existingElement = document.querySelector(`[data-item-id="${currentItemId}"]`);
    if (!existingElement) {
      // アイテムがデータベースには存在するがUIに表示されていない場合、追加
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

/**
 * 遅延処理用のユーティリティ関数
 * @param {number} ms - 遅延時間（ミリ秒）
 * @returns {Promise} 指定した時間後に解決されるPromise
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 翻訳システムを初期化してからページ解析を実行
(async () => {
  await translationManager.initialize();
  handlePageAnalysis();
})();