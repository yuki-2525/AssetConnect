class ClipboardManager {
  constructor() {
    this.supportedFormats = {
      'plain': 'text/plain',
      'html': 'text/html'
    };
  }

  async copyToClipboard(text, format = 'plain') {
    try {
      if (!navigator.clipboard) {
        // Fallback for older browsers
        return await this.fallbackCopyToClipboard(text);
      }

      if (format === 'plain') {
        await navigator.clipboard.writeText(text);
      } else if (format === 'html') {
        const clipboardItem = new ClipboardItem({
          'text/html': new Blob([text], { type: 'text/html' }),
          'text/plain': new Blob([this.stripHtml(text)], { type: 'text/plain' })
        });
        await navigator.clipboard.write([clipboardItem]);
      }

      return {
        success: true,
        message: 'クリップボードにコピーしました'
      };

    } catch (error) {
      window.errorHandler?.handleClipboardError(error, 'copy');
      
      if (error.name === 'NotAllowedError') {
        return {
          success: false,
          error: 'クリップボードへのアクセスが許可されていません'
        };
      }
      
      return {
        success: false,
        error: `コピーに失敗しました: ${error.message}`
      };
    }
  }

  async fallbackCopyToClipboard(text) {
    try {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.left = '-9999px';
      textArea.style.top = '-9999px';
      
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      
      const successful = document.execCommand('copy');
      document.body.removeChild(textArea);
      
      if (successful) {
        return {
          success: true,
          message: 'クリップボードにコピーしました（フォールバック）'
        };
      } else {
        throw new Error('execCommand copy failed');
      }
    } catch (error) {
      return {
        success: false,
        error: `フォールバック コピーに失敗しました: ${error.message}`
      };
    }
  }

  formatItemsForExport(items, format = 'list') {
    if (!items || items.length === 0) {
      return '';
    }

    switch (format) {
      case 'list':
        return items.map(item => item.name || `Item ${item.id}`).join('\n');
      
      case 'urls':
        return items.map(item => `https://booth.pm/ja/items/${item.id}`).join('\n');
      
      case 'detailed':
        return items.map(item => 
          `${item.name || 'Unnamed'} - https://booth.pm/ja/items/${item.id}`
        ).join('\n');
      
      case 'csv':
        const csvHeader = 'Name,URL,Category\n';
        const csvRows = items.map(item => 
          `"${(item.name || '').replace(/"/g, '""')}","https://booth.pm/ja/items/${item.id}","${item.category || 'unknown'}"`
        ).join('\n');
        return csvHeader + csvRows;
      
      case 'json':
        return JSON.stringify(items, null, 2);
      
      default:
        return items.map(item => item.name || `Item ${item.id}`).join('\n');
    }
  }

  stripHtml(html) {
    const temp = document.createElement('div');
    temp.innerHTML = html;
    return temp.textContent || temp.innerText || '';
  }


  async getClipboardPermissions() {
    try {
      const permissions = await navigator.permissions.query({ name: 'clipboard-write' });
      return {
        granted: permissions.state === 'granted',
        state: permissions.state
      };
    } catch (error) {
      // console.log('Permissions API not supported:', error);
      return {
        granted: true, // Assume granted if can't check
        state: 'unknown'
      };
    }
  }

  async exportSavedAndNewItems(storageManager) {
    try {
      const currentItemId = window.uiManager?.currentItemId;
      if (!currentItemId) {
        return {
          success: false,
          error: '現在のページIDが取得できません'
        };
      }
      
      const pageItems = await storageManager.getItemsForCurrentPage(currentItemId);
      
      // Get saved items (all pages) and unsaved items (current page only) for clipboard export
      const savedItems = Object.values(pageItems).filter(item => item.category === 'saved');
      const newItems = Object.values(pageItems).filter(item => item.category === 'unsaved');
      const excludedItems = Object.values(pageItems).filter(item => item.category === 'excluded');
      
      const exportItems = [...savedItems, ...newItems];
      
      if (exportItems.length === 0) {
        return {
          success: false,
          error: '保存済み・新規カテゴリにアイテムがありません'
        };
      }

      // Format items as list (names only, separated by newlines)
      const formattedText = this.formatItemsForExport(exportItems, 'list');
      const result = await this.copyToClipboard(formattedText);
      
      if (result.success) {
        result.itemCount = exportItems.length;
        
        // Process post-export actions (only for current page items)
        const persistResult = await this.processPostExportActions(storageManager, newItems, excludedItems, currentItemId);
        result.persistenceResult = persistResult;
        
        if (!persistResult.success) {
          console.warn('Export succeeded but persistence failed:', persistResult.error);
          result.warning = 'エクスポートは成功しましたが、データの保存に問題がありました';
        }
      }
      
      return result;

    } catch (error) {
      console.error('Export saved and new items error:', error);
      return {
        success: false,
        error: `エクスポート中にエラーが発生しました: ${error.message}`
      };
    }
  }

  async exportItemsByCategory(storageManager, category, format = 'list', persistAfterExport = true) {
    try {
      const allItems = await storageManager.getAllItems();
      const categoryItems = Object.values(allItems).filter(item => 
        item.category === category
      );

      if (categoryItems.length === 0) {
        return {
          success: false,
          error: `${category}カテゴリにアイテムがありません`
        };
      }

      const formattedText = this.formatItemsForExport(categoryItems, format);
      const result = await this.copyToClipboard(formattedText);
      
      if (result.success) {
        result.itemCount = categoryItems.length;
        result.category = category;
        
        // Persist data after successful export
        if (persistAfterExport) {
          const persistResult = await this.persistExportedItems(storageManager, categoryItems, category);
          result.persistenceResult = persistResult;
          
          if (!persistResult.success) {
            console.warn('Export succeeded but persistence failed:', persistResult.error);
            result.warning = 'エクスポートは成功しましたが、データの保存に問題がありました';
          }
        }
      }
      
      return result;

    } catch (error) {
      console.error('Export by category error:', error);
      return {
        success: false,
        error: `エクスポート中にエラーが発生しました: ${error.message}`
      };
    }
  }

  async processPostExportActions(storageManager, newItems, excludedItems, currentPageId) {
    try {
      const timestamp = new Date().toISOString();
      let successCount = 0;
      let failedItems = [];

      // 1. Move new items to saved category (remove currentPageId as they become global)
      for (const item of newItems) {
        try {
          const updateData = {
            category: 'saved',
            lastExported: timestamp,
            exportCount: (item.exportCount || 0) + 1,
            currentPageId: undefined // Remove currentPageId when moving to saved
          };

          const success = await storageManager.updateItem(item.id, updateData);
          if (success) {
            successCount++;
          } else {
            failedItems.push(item.id);
          }
        } catch (itemError) {
          console.error(`Failed to update new item ${item.id}:`, itemError);
          failedItems.push(item.id);
        }
      }

      // 2. Delete current page excluded items
      for (const item of excludedItems) {
        try {
          const success = await storageManager.deleteItem(item.id);
          if (success) {
            successCount++;
          } else {
            failedItems.push(item.id);
          }
        } catch (itemError) {
          console.error(`Failed to delete excluded item ${item.id}:`, itemError);
          failedItems.push(item.id);
        }
      }

      // 3. Delete all editing items from other pages (not current page)
      const allItems = await storageManager.getAllItems();
      for (const [itemId, item] of Object.entries(allItems)) {
        // Delete editing items that belong to other pages
        if ((item.category === 'unsaved' || item.category === 'excluded') && 
            item.currentPageId && item.currentPageId !== currentPageId) {
          try {
            const success = await storageManager.deleteItem(itemId);
            if (success) {
              successCount++;
              console.log(`Deleted editing item ${itemId} from other page ${item.currentPageId}`);
            } else {
              failedItems.push(itemId);
            }
          } catch (itemError) {
            console.error(`Failed to delete editing item ${itemId} from other page:`, itemError);
            failedItems.push(itemId);
          }
        }
      }


      return {
        success: failedItems.length === 0,
        successCount: successCount,
        failedCount: failedItems.length,
        failedItems: failedItems,
        timestamp: timestamp,
        processedNew: newItems.length,
        processedExcluded: excludedItems.length
      };

    } catch (error) {
      console.error('Post-export actions error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async persistExportedItems(storageManager, exportedItems, category) {
    try {
      const timestamp = new Date().toISOString();
      let successCount = 0;
      let failedItems = [];

      // Update each exported item with export metadata
      for (const item of exportedItems) {
        try {
          const updateData = {
            lastExported: timestamp,
            exportedAs: category,
            exportCount: (item.exportCount || 0) + 1
          };

          // Handle different categories according to new specifications
          if (category === 'unsaved') {
            // New items: move to saved when exported
            updateData.category = 'saved';
            updateData.previousCategory = category;
          } else if (category === 'excluded') {
            // Excluded items: don't save, and delete if exists in saved
            updateData.shouldDelete = true;
          }
          // Saved items: just update export metadata

          if (updateData.shouldDelete) {
            // Delete excluded items from storage
            const success = await storageManager.deleteItem(item.id);
            if (success) {
              successCount++;
            } else {
              failedItems.push(item.id);
            }
          } else {
            // Update item normally
            const success = await storageManager.updateItem(item.id, updateData);
            if (success) {
              successCount++;
            } else {
              failedItems.push(item.id);
            }
          }
        } catch (itemError) {
          console.error(`Failed to update item ${item.id}:`, itemError);
          failedItems.push(item.id);
        }
      }

      return {
        success: failedItems.length === 0,
        successCount: successCount,
        failedCount: failedItems.length,
        failedItems: failedItems,
        timestamp: timestamp
      };

    } catch (error) {
      console.error('Persistence error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async rollbackExportOperation(storageManager, exportedItems, originalCategory) {
    try {
      // console.log('Rolling back export operation...');
      let rollbackCount = 0;

      for (const item of exportedItems) {
        try {
          const rollbackData = {
            category: originalCategory,
            lastExported: null,
            exportedAs: null
          };

          const success = await storageManager.updateItem(item.id, rollbackData);
          if (success) {
            rollbackCount++;
          }
        } catch (itemError) {
          console.error(`Failed to rollback item ${item.id}:`, itemError);
        }
      }

      return {
        success: rollbackCount > 0,
        rollbackCount: rollbackCount
      };

    } catch (error) {
      console.error('Rollback error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}