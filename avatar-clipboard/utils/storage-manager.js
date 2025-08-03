/**
 * BOOTHアイテムのストレージ管理を行うクラス
 * Chromeのlocal storageを使用してアイテム情報を保存・管理する
 */
class StorageManager {
  constructor() {
    this.storageKey = 'boothItems'; // ストレージキー
  }

  /**
   * アイテムをストレージに保存する
   * @param {string} itemId - アイテムID
   * @param {Object} itemData - アイテムデータ
   * @returns {Promise<boolean>} 保存成功時true
   */
  async saveItem(itemId, itemData) {
    try {
      const existingData = await this.getAllItems();
      
      // 最小限のアイテムデータを構築
      const minimalItem = {
        id: itemId,
        name: itemData.name,
        category: itemData.category || 'unsaved'
      };
      
      // 編集中アイテム（未保存/除外）にcurrentPageIdを追加
      if (itemData.currentPageId && (minimalItem.category === 'unsaved' || minimalItem.category === 'excluded')) {
        minimalItem.currentPageId = itemData.currentPageId;
      }
      
      // 除外アイテムのみにpreviousCategoryを追加
      if (minimalItem.category === 'excluded' && itemData.previousCategory) {
        minimalItem.previousCategory = itemData.previousCategory;
      }
      
      existingData[itemId] = minimalItem;
      
      await chrome.storage.local.set({ [this.storageKey]: existingData });
      
      return true;
    } catch (error) {
      window.errorHandler?.handleStorageError(error, 'save', itemId);
      return false;
    }
  }


  /**
   * 指定したアイテムIDのアイテムを取得する
   * @param {string} itemId - アイテムID
   * @returns {Promise<Object|null>} アイテムデータ、見つからない場合はnull
   */
  async getItem(itemId) {
    try {
      const data = await chrome.storage.local.get(this.storageKey);
      const items = data[this.storageKey] || {};
      return items[itemId] || null;
    } catch (error) {
      window.errorHandler?.handleStorageError(error, 'get', itemId);
      return null;
    }
  }

  /**
   * 全てのアイテムを取得する
   * @returns {Promise<Object>} 全アイテムのオブジェクト（キー: アイテムID）
   */
  async getAllItems() {
    try {
      const data = await chrome.storage.local.get(this.storageKey);
      return data[this.storageKey] || {};
    } catch (error) {
      window.errorHandler?.handleStorageError(error, 'getAll');
      return {};
    }
  }

  /**
   * 指定したアイテムを更新する、存在しない場合は新規作成
   * @param {string} itemId - アイテムID
   * @param {Object} updateData - 更新データ
   * @returns {Promise<boolean>} 更新成功時true
   */
  async updateItem(itemId, updateData) {
    try {
      const existingItem = await this.getItem(itemId);
      
      if (!existingItem) {
        // 存在しない場合は新規アイテムを作成（例: 除外処理用）
        const newItem = {
          id: itemId,
          name: updateData.name || '',
          category: updateData.category || 'unsaved'
        };
        
        // 編集中アイテム（未保存/除外）にcurrentPageIdを追加
        if (updateData.currentPageId && (newItem.category === 'unsaved' || newItem.category === 'excluded')) {
          newItem.currentPageId = updateData.currentPageId;
        }
        
        
        // 除外アイテムのみにpreviousCategoryを追加
        if (newItem.category === 'excluded' && updateData.previousCategory) {
          newItem.previousCategory = updateData.previousCategory;
        }
        
        const allItems = await this.getAllItems();
        allItems[itemId] = newItem;
        await chrome.storage.local.set({ [this.storageKey]: allItems });
        
        return true;
      }

      // 最小限のフィールドで既存アイテムを更新
      const updatedItem = {
        id: itemId,
        name: updateData.name !== undefined ? updateData.name : existingItem.name,
        category: updateData.category !== undefined ? updateData.category : existingItem.category
      };
      
      // 編集中アイテムのcurrentPageIdを処理
      if (updatedItem.category === 'unsaved' || updatedItem.category === 'excluded') {
        if (updateData.currentPageId !== undefined) {
          updatedItem.currentPageId = updateData.currentPageId;
        } else if (existingItem.currentPageId) {
          updatedItem.currentPageId = existingItem.currentPageId;
        }
      }
      // 保存済みカテゴリに移動する際にcurrentPageIdを削除
      else if (updatedItem.category === 'saved') {
        // 保存済みアイテムのcurrentPageIdは自動的に省略される
      }
      
      
      // previousCategoryロジックを処理
      if (updatedItem.category === 'excluded') {
        updatedItem.previousCategory = updateData.previousCategory || existingItem.previousCategory;
      }
      // 保存済みカテゴリに移動する際にpreviousCategoryを削除
      else if (updatedItem.category === 'saved' && existingItem.previousCategory) {
        // 保存済みアイテムのpreviousCategoryは自動的に省略される
      }

      const allItems = await this.getAllItems();
      allItems[itemId] = updatedItem;
      
      await chrome.storage.local.set({ [this.storageKey]: allItems });
      
      return true;
    } catch (error) {
      window.errorHandler?.handleStorageError(error, 'update', itemId);
      return false;
    }
  }

  /**
   * 指定したアイテムを削除する
   * @param {string} itemId - 削除するアイテムID
   * @returns {Promise<boolean>} 削除成功時true
   */
  async deleteItem(itemId) {
    try {
      const allItems = await this.getAllItems();
      delete allItems[itemId];
      
      await chrome.storage.local.set({ [this.storageKey]: allItems });
      return true;
    } catch (error) {
      window.errorHandler?.handleStorageError(error, 'delete', itemId);
      return false;
    }
  }

  /**
   * 指定したアイテムが存在するかどうかをチェック
   * @param {string} itemId - チェックするアイテムID
   * @returns {Promise<boolean>} 存在する場合true
   */
  async hasItem(itemId) {
    const item = await this.getItem(itemId);
    return item !== null;
  }

  /**
   * 現在のページに関連するアイテムを取得する
   * 保存済みアイテムは全て、編集中アイテムは現在のページのもののみを返す
   * @param {string} currentPageId - 現在のページID
   * @returns {Promise<Object>} ページ関連アイテムのオブジェクト
   */
  async getItemsForCurrentPage(currentPageId) {
    try {
      const allItems = await this.getAllItems();
      const pageItems = {};
      
      Object.entries(allItems).forEach(([itemId, item]) => {
        // 保存済みアイテムを含める（currentPageId制限なし）
        if (item.category === 'saved') {
          pageItems[itemId] = item;
        }
        // 編集中アイテム（未保存/除外）は現在のページのもののみ含める
        else if ((item.category === 'unsaved' || item.category === 'excluded') && 
                 item.currentPageId === currentPageId) {
          pageItems[itemId] = item;
        }
      });
      
      return pageItems;
    } catch (error) {
      window.errorHandler?.handleStorageError(error, 'getItemsForCurrentPage', currentPageId);
      return {};
    }
  }

  /**
   * 全てのアイテムをストレージから削除する
   * @returns {Promise<boolean>} 削除成功時true
   */
  async clearAll() {
    try {
      await chrome.storage.local.remove(this.storageKey);
      return true;
    } catch (error) {
      console.error('Error clearing storage:', error);
      return false;
    }
  }
}