class StorageManager {
  constructor() {
    this.storageKey = 'boothItems';
    this.downloadHistoryKey = 'downloadHistory'; // AssetConnect compatibility
  }

  async saveItem(itemId, itemData) {
    try {
      const existingData = await this.getAllItems();
      
      // Build minimal item data
      const minimalItem = {
        id: itemId,
        name: itemData.name,
        category: itemData.category || 'unsaved'
      };
      
      // Add currentPageId for editing items (unsaved/excluded)
      if (itemData.currentPageId && (minimalItem.category === 'unsaved' || minimalItem.category === 'excluded')) {
        minimalItem.currentPageId = itemData.currentPageId;
      }
      
      
      // Add previousCategory only for excluded items
      if (minimalItem.category === 'excluded' && itemData.previousCategory) {
        minimalItem.previousCategory = itemData.previousCategory;
      }
      
      existingData[itemId] = minimalItem;
      
      await chrome.storage.local.set({ [this.storageKey]: existingData });
      
      // Also add to AssetConnect download history if saved
      if (minimalItem.category === 'saved') {
        await this.addToDownloadHistory(itemData);
      }
      
      return true;
    } catch (error) {
      window.errorHandler?.handleStorageError(error, 'save', itemId);
      return false;
    }
  }

  async addToDownloadHistory(itemData) {
    try {
      const history = await this.getDownloadHistory();
      
      const historyEntry = {
        title: itemData.name,
        boothID: itemData.id,
        filename: '', // No specific file for item management
        timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
        url: `https://booth.pm/ja/items/${itemData.id}`,
        free: true, // Assume free items for now
        registered: false // Not registered to external tools yet
      };
      
      // Remove duplicates based on boothID
      const filteredHistory = history.filter(entry => entry.boothID !== itemData.id);
      filteredHistory.push(historyEntry);
      
      await chrome.storage.local.set({ [this.downloadHistoryKey]: filteredHistory });
      return true;
    } catch (error) {
      window.errorHandler?.handleStorageError(error, 'addToDownloadHistory', itemData.id);
      return false;
    }
  }

  async getDownloadHistory() {
    try {
      const data = await chrome.storage.local.get(this.downloadHistoryKey);
      return data[this.downloadHistoryKey] || [];
    } catch (error) {
      window.errorHandler?.handleStorageError(error, 'getDownloadHistory');
      return [];
    }
  }

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

  async getAllItems() {
    try {
      const data = await chrome.storage.local.get(this.storageKey);
      return data[this.storageKey] || {};
    } catch (error) {
      window.errorHandler?.handleStorageError(error, 'getAll');
      return {};
    }
  }

  async updateItem(itemId, updateData) {
    try {
      const existingItem = await this.getItem(itemId);
      
      if (!existingItem) {
        // Create new item if it doesn't exist (e.g., for exclusions)
        const newItem = {
          id: itemId,
          name: updateData.name || '',
          category: updateData.category || 'unsaved'
        };
        
        // Add currentPageId for editing items (unsaved/excluded)
        if (updateData.currentPageId && (newItem.category === 'unsaved' || newItem.category === 'excluded')) {
          newItem.currentPageId = updateData.currentPageId;
        }
        
        
        // Add previousCategory only for excluded items
        if (newItem.category === 'excluded' && updateData.previousCategory) {
          newItem.previousCategory = updateData.previousCategory;
        }
        
        const allItems = await this.getAllItems();
        allItems[itemId] = newItem;
        await chrome.storage.local.set({ [this.storageKey]: allItems });
        
        // Add to download history if saved
        if (newItem.category === 'saved') {
          await this.addToDownloadHistory(newItem);
        }
        
        return true;
      }

      // Update existing item with minimal fields
      const updatedItem = {
        id: itemId,
        name: updateData.name !== undefined ? updateData.name : existingItem.name,
        category: updateData.category !== undefined ? updateData.category : existingItem.category
      };
      
      // Handle currentPageId for editing items
      if (updatedItem.category === 'unsaved' || updatedItem.category === 'excluded') {
        if (updateData.currentPageId !== undefined) {
          updatedItem.currentPageId = updateData.currentPageId;
        } else if (existingItem.currentPageId) {
          updatedItem.currentPageId = existingItem.currentPageId;
        }
      }
      // Remove currentPageId when moving to saved category
      else if (updatedItem.category === 'saved') {
        // currentPageId is automatically omitted for saved items
      }
      
      
      // Handle previousCategory logic
      if (updatedItem.category === 'excluded') {
        updatedItem.previousCategory = updateData.previousCategory || existingItem.previousCategory;
      }
      // Remove previousCategory when moving to saved category
      else if (updatedItem.category === 'saved' && existingItem.previousCategory) {
        // previousCategory is automatically omitted for saved items
      }

      const allItems = await this.getAllItems();
      allItems[itemId] = updatedItem;
      
      await chrome.storage.local.set({ [this.storageKey]: allItems });
      
      // Add to download history if category changed to saved
      if (updateData.category === 'saved' && existingItem.category !== 'saved') {
        await this.addToDownloadHistory(updatedItem);
      }
      
      return true;
    } catch (error) {
      window.errorHandler?.handleStorageError(error, 'update', itemId);
      return false;
    }
  }

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

  async hasItem(itemId) {
    const item = await this.getItem(itemId);
    return item !== null;
  }

  async getItemsForCurrentPage(currentPageId) {
    try {
      const allItems = await this.getAllItems();
      const pageItems = {};
      
      Object.entries(allItems).forEach(([itemId, item]) => {
        // Include saved items (no currentPageId restriction)
        if (item.category === 'saved') {
          pageItems[itemId] = item;
        }
        // Include editing items (unsaved/excluded) only if they match current page
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