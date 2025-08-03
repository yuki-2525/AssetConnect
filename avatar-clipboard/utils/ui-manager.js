/**
 * 対応アバター一括コピー機能のUI管理を行うクラス
 * 管理ウィンドウの表示、アイテムの追加・編集・削除、通知表示などを管理
 */
class UIManager {
  constructor() {
    this.managementWindow = null;                // 管理ウィンドウのDOM要素
    this.windowId = 'booth-clipboard-manager';   // ウィンドウのID
    this.nameEditTimeouts = new Map();          // デバウンス用タイマー管理
    this.currentItemId = null;                  // 現在表示中の商品ID
    this.initializeCurrentItemId();             // 商品ID取得
  }

  /**
   * 現在のページURLからBOOTH商品IDを取得して初期化
   */
  initializeCurrentItemId() {
    // URLから商品IDを取得するための正規表現パターン
    const urlPatterns = [
      /^https?:\/\/.*\.booth\.pm\/items\/(\d+)/, // サブドメイン形式
      /^https?:\/\/booth\.pm\/.*\/items\/(\d+)/   // パス形式
    ];
    
    const url = window.location.href;
    for (const pattern of urlPatterns) {
      const match = url.match(pattern);
      if (match) {
        this.currentItemId = match[1]; // マッチした最初のキャプチャグループ（商品ID）
        break;
      }
    }
  }


  /**
   * 管理ウィンドウを作成し、DOMに追加する
   * @returns {HTMLElement} 作成された管理ウィンドウの要素
   */
  createManagementWindow() {
    if (this.managementWindow) {
      return this.managementWindow; // 既に存在する場合はそのまま返す
    }

    const windowContainer = document.createElement('div');
    windowContainer.id = this.windowId;
    windowContainer.className = 'booth-clipboard-manager';
    
    windowContainer.innerHTML = `
      <div class="booth-manager-header">
        <h3>対応アバター一括コピー</h3>
        <button class="booth-manager-close" type="button">×</button>
      </div>
      <div class="booth-manager-content">
        <div class="booth-manager-notification" id="booth-notification" style="display: none;">
          <p>未登録のアイテムが見つかりました!!</p>
          <div class="booth-found-items" id="booth-found-items" style="display: none;"></div>
          <div class="booth-notification-actions">
            <button class="booth-fetch-btn" type="button">アイテム情報を取得</button>
          </div>
        </div>
        <div class="booth-manager-sections">
          <div class="booth-section" id="saved-section">
            <h4 class="booth-section-header collapsed" data-section="saved">
              <span class="booth-section-toggle">▶</span>
              保存済み
              <span class="booth-section-count" id="saved-count">0</span>
            </h4>
            <div class="booth-items-list" id="saved-items" style="display: none;"></div>
          </div>
          <div class="booth-section" id="unsaved-section">
            <h4 class="booth-section-header" data-section="unsaved">
              <span class="booth-section-toggle">▼</span>
              新規
              <span class="booth-section-count" id="unsaved-count">0</span>
            </h4>
            <div class="booth-items-list" id="unsaved-items"></div>
          </div>
          <div class="booth-section" id="excluded-section">
            <h4 class="booth-section-header" data-section="excluded">
              <span class="booth-section-toggle">▼</span>
              除外
              <span class="booth-section-count" id="excluded-count">0</span>
            </h4>
            <div class="booth-items-list" id="excluded-items"></div>
          </div>
        </div>
        <div class="booth-manager-actions">
          <button class="booth-export-btn" type="button">クリップボードにコピー</button>
          <button class="booth-manual-add-toggle-btn" type="button">手動追加</button>
        </div>
      </div>
    `;

    this.attachEventListeners(windowContainer);
    document.body.appendChild(windowContainer);
    this.managementWindow = windowContainer;
    
    return windowContainer;
  }

  attachEventListeners(container) {
    const closeBtn = container.querySelector('.booth-manager-close');
    closeBtn.addEventListener('click', () => this.hideWindow());

    const fetchBtn = container.querySelector('.booth-fetch-btn');
    fetchBtn.addEventListener('click', () => this.handleFetchItem());

    const exportBtn = container.querySelector('.booth-export-btn');
    exportBtn.addEventListener('click', () => this.handleExport());

    const manualAddToggleBtn = container.querySelector('.booth-manual-add-toggle-btn');
    manualAddToggleBtn.addEventListener('click', () => this.showManualAddModal());


    // セクショントグル機能
    const sectionHeaders = container.querySelectorAll('.booth-section-header');
    sectionHeaders.forEach(header => {
      header.addEventListener('click', () => this.handleSectionToggle(header));
    });
  }

  attachFoundItemsEventListeners() {
    const removeButtons = document.querySelectorAll('.booth-remove-item-btn');
    removeButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const itemId = e.target.getAttribute('data-item-id');
        this.removeFoundItem(itemId);
      });
    });
  }

  removeFoundItem(itemId) {
    const itemDiv = document.querySelector(`[data-item-id="${itemId}"].booth-found-item`);
    if (itemDiv) {
      itemDiv.remove();
      
      // Update notification message
      const foundItemsEl = document.getElementById('booth-found-items');
      const remainingItems = foundItemsEl.querySelectorAll('.booth-found-item');
      
      const messageEl = document.querySelector('#booth-notification p');
      if (messageEl) {
        messageEl.textContent = `ページ内に${remainingItems.length}個のBOOTHアイテムが見つかりました!!`;
      }
      
      // アイテムが残っていない場合は通知を非表示
      if (remainingItems.length === 0) {
        this.hideNotification();
      }
      
      // コンテンツスクリプトのアイテムリストを更新するイベントを発行
      const event = new CustomEvent('boothItemRemoved', {
        detail: { itemId: itemId }
      });
      document.dispatchEvent(event);
    }
  }

  getRemainingFoundItems() {
    const foundItemsEl = document.getElementById('booth-found-items');
    if (!foundItemsEl) return [];
    
    const itemDivs = foundItemsEl.querySelectorAll('.booth-found-item');
    return Array.from(itemDivs).map(div => {
      const itemId = div.getAttribute('data-item-id');
      const urlLink = div.querySelector('.booth-found-item-url');
      return {
        id: itemId,
        url: urlLink ? urlLink.href : ''
      };
    });
  }

  showWindow() {
    if (!this.managementWindow) {
      this.createManagementWindow();
    }
    this.managementWindow.style.display = 'block';
  }

  hideWindow() {
    if (this.managementWindow) {
      this.managementWindow.style.display = 'none';
    }
  }

  showNotification(message, itemUrl = null) {
    const notification = document.getElementById('booth-notification');
    if (notification) {
      notification.style.display = 'block';
      const messageEl = notification.querySelector('p');
      if (messageEl) {
        if (itemUrl) {
          messageEl.innerHTML = `${message}<br><small class="booth-item-url">${itemUrl}</small>`;
        } else {
          messageEl.innerHTML = message; // Use innerHTML to support HTML in progress messages
        }
      }
      
      // Hide found items list when showing other notifications
      const foundItemsEl = document.getElementById('booth-found-items');
      if (foundItemsEl) {
        foundItemsEl.style.display = 'none';
      }
    }
  }

  showFoundItemsNotification(itemsToFetch) {
    const notification = document.getElementById('booth-notification');
    const foundItemsEl = document.getElementById('booth-found-items');
    
    if (notification && foundItemsEl) {
      notification.style.display = 'block';
      foundItemsEl.style.display = 'block';
      
      const messageEl = notification.querySelector('p');
      if (messageEl) {
        messageEl.textContent = `ページ内に${itemsToFetch.length}個のBOOTHアイテムが見つかりました!!`;
      }
      
      // Clear previous items
      foundItemsEl.innerHTML = '';
      
      // Add each found item with remove button
      itemsToFetch.forEach((item, index) => {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'booth-found-item';
        itemDiv.setAttribute('data-item-id', item.id);
        
        itemDiv.innerHTML = `
          <div class="booth-found-item-info">
            <span class="booth-found-item-id">ID: ${item.id}</span>
            <a href="${item.url}" target="_blank" class="booth-found-item-url">${item.url}</a>
          </div>
          <button class="booth-remove-item-btn" data-item-id="${item.id}" type="button">×</button>
        `;
        
        foundItemsEl.appendChild(itemDiv);
      });
      
      // Attach remove button listeners
      this.attachFoundItemsEventListeners();
    }
  }

  showProgressNotification(current, total, currentItem = '') {
    const percentage = Math.round((current / total) * 100);
    const progressBar = `
      <div class="progress-container">
        <div class="progress-bar" style="width: ${percentage}%"></div>
      </div>
      <span class="progress-text">${current}/${total} (${percentage}%)</span>
      ${currentItem ? `<br><small>処理中: ${currentItem}</small>` : ''}
    `;
    this.showNotification(progressBar);
  }

  hideNotification() {
    const notification = document.getElementById('booth-notification');
    if (notification) {
      notification.style.display = 'none';
    }
  }


  attachItemEventListeners(itemEl) {
    const nameInput = itemEl.querySelector('.booth-item-name');
    nameInput.addEventListener('input', (e) => {
      this.handleNameEdit(itemEl.getAttribute('data-item-id'), e.target.value);
    });

    // Exclude button (× button)
    const excludeBtn = itemEl.querySelector('.booth-exclude-btn');
    if (excludeBtn) {
      excludeBtn.addEventListener('click', (e) => {
        const targetSection = e.target.getAttribute('data-target');
        const currentCategory = itemEl.closest('.booth-items-list').id.replace('-items', '');
        this.handleItemExclude(itemEl.getAttribute('data-item-id'), currentCategory);
      });
    }

    // Restore button
    const restoreBtn = itemEl.querySelector('.booth-restore-btn');
    if (restoreBtn) {
      restoreBtn.addEventListener('click', (e) => {
        const originalCategory = e.target.getAttribute('data-original-category');
        this.handleItemRestore(itemEl.getAttribute('data-item-id'), originalCategory);
      });
    }
  }

  handleFetchItem() {
    // console.log('Fetching item information...');
    this.hideNotification();
    
    // Trigger item fetching event
    const event = new CustomEvent('boothFetchItem', { 
      detail: { action: 'fetch' } 
    });
    document.dispatchEvent(event);
  }

  async handleExport() {
    // console.log('Exporting to clipboard...');
    
    try {
      const clipboardManager = new ClipboardManager();
      const storageManager = window.storageManager;
      
      if (!storageManager) {
        this.showNotification('ストレージマネージャーが利用できません');
        return;
      }

      const result = await clipboardManager.exportSavedAndNewItems(storageManager);
      
      if (result.success) {
        let message = `${result.itemCount}個のアイテムをクリップボードにコピーしました`;
        
        // Show warning if persistence failed
        if (result.warning) {
          message += `\n注意: ${result.warning}`;
        }
        
        // Update UI if items were moved or deleted
        if (result.persistenceResult && result.persistenceResult.success) {
          const persistResult = result.persistenceResult;
          if (persistResult.successCount > 0) {
            this.refreshItemDisplay();
            // console.log(`${persistResult.successCount}個のアイテムを処理しました`);
          }
        }
        
        this.showNotification(message);
        setTimeout(() => this.hideNotification(), 3000);
      } else {
        this.showNotification(result.error);
        setTimeout(() => this.hideNotification(), 5000);
      }
      
    } catch (error) {
      window.errorHandler?.handleUIError(error, 'export-handler', 'clipboard-export');
      this.showNotification('エクスポート中にエラーが発生しました');
      setTimeout(() => this.hideNotification(), 5000);
    }
  }

  async handleNameEdit(itemId, newName) {
    // デバウンス: 既存のタイマーをクリア
    if (this.nameEditTimeouts.has(itemId)) {
      clearTimeout(this.nameEditTimeouts.get(itemId));
    }
    
    // 500ms後に実行するタイマーを設定
    const timeoutId = setTimeout(async () => {
      try {
        // Update item name in storage
        const storageManager = window.storageManager;
        if (storageManager) {
          const success = await storageManager.updateItem(itemId, { name: newName });
          if (success) {
            // console.log(`Item ${itemId} name updated to: ${newName}`);
          }
        }
        // タイマー完了後にMapから削除
        this.nameEditTimeouts.delete(itemId);
      } catch (error) {
        window.errorHandler?.handleUIError(error, 'name-edit', itemId);
        this.nameEditTimeouts.delete(itemId);
      }
    }, 500); // 500ms待機
    
    this.nameEditTimeouts.set(itemId, timeoutId);
  }

  async handleItemExclude(itemId, currentCategory) {
    // console.log('Item excluded:', itemId, 'from', currentCategory);
    
    try {
      const storageManager = window.storageManager;
      if (storageManager) {
        const success = await storageManager.updateItem(itemId, { 
          category: 'excluded',
          previousCategory: currentCategory,
          currentPageId: this.currentItemId
        });
        if (!success) {
          console.error('Failed to update item category in storage');
          return;
        }
      }
      
      // Refresh display to show correct buttons
      this.refreshItemDisplay();
      
      // console.log(`Item ${itemId} moved to excluded section`);
    } catch (error) {
      console.error('Error excluding item:', error);
    }
  }

  async handleItemRestore(itemId, originalCategory) {
    // console.log('Item restored:', itemId, 'to', originalCategory);
    
    try {
      const storageManager = window.storageManager;
      if (storageManager) {
        const success = await storageManager.updateItem(itemId, { 
          category: originalCategory,
          previousCategory: null,
          currentPageId: originalCategory === 'unsaved' ? this.currentItemId : undefined
        });
        if (!success) {
          console.error('Failed to restore item category in storage');
          return;
        }
      }
      
      // Refresh display to show correct buttons
      this.refreshItemDisplay();
      
      // console.log(`Item ${itemId} restored to ${originalCategory} section`);
    } catch (error) {
      console.error('Error restoring item:', error);
    }
  }


  showFailedItemsModal(failedItems) {
    // Remove existing modal if any
    this.hideFailedItemsModal();
    
    const modalOverlay = document.createElement('div');
    modalOverlay.className = 'booth-manual-add-modal-overlay';
    modalOverlay.id = 'booth-failed-items-modal';
    
    const failedItemsList = failedItems.map(item => `・ID: ${item.id}`).join('<br>');
    
    modalOverlay.innerHTML = `
      <div class="booth-manual-add-modal">
        <div class="booth-manual-add-modal-header">
          <h3>取得失敗アイテム</h3>
          <button class="booth-manual-add-modal-close" type="button">×</button>
        </div>
        <div class="booth-manual-add-modal-content">
          <div class="booth-failed-items-message">
            <p>以下のアイテムで情報取得に失敗しました：</p>
            <div class="booth-failed-items-list">
              ${failedItemsList}
            </div>
            <p>手動でアイテム名を入力しますか？</p>
          </div>
          <div class="booth-manual-add-modal-actions">
            <button class="booth-failed-items-confirm-btn" type="button">手動入力する</button>
            <button class="booth-manual-add-cancel-btn" type="button">キャンセル</button>
          </div>
        </div>
      </div>
    `;
    
    this.managementWindow.appendChild(modalOverlay);
    
    // Attach event listeners for failed items modal
    this.attachFailedItemsModalEventListeners(modalOverlay, failedItems);
    
    // Focus on confirm button
    setTimeout(() => {
      const confirmBtn = modalOverlay.querySelector('.booth-failed-items-confirm-btn');
      if (confirmBtn) confirmBtn.focus();
    }, 100);
  }

  hideFailedItemsModal() {
    const existingModal = document.getElementById('booth-failed-items-modal');
    if (existingModal) {
      existingModal.remove();
    }
  }

  attachFailedItemsModalEventListeners(modal, failedItems) {
    // Close button
    const closeBtn = modal.querySelector('.booth-manual-add-modal-close');
    closeBtn.addEventListener('click', () => this.hideFailedItemsModal());
    
    // Cancel button
    const cancelBtn = modal.querySelector('.booth-manual-add-cancel-btn');
    cancelBtn.addEventListener('click', () => this.hideFailedItemsModal());
    
    // Confirm button
    const confirmBtn = modal.querySelector('.booth-failed-items-confirm-btn');
    confirmBtn.addEventListener('click', () => {
      this.hideFailedItemsModal();
      this.handleFailedItemsConfirm(failedItems);
    });
    
    // Click outside to close
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        this.hideFailedItemsModal();
      }
    });
    
    // Escape key to close
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.hideFailedItemsModal();
      }
    });
  }

  handleFailedItemsConfirm(failedItems) {
    // Store remaining failed items for quick access
    window.remainingFailedItems = failedItems.slice(1);
    
    // Show manual add modal with first failed item
    setTimeout(() => {
      this.showManualAddModal();
      
      // Populate the first failed item ID after modal is created
      setTimeout(() => {
        const idInput = document.getElementById('modal-manual-item-id');
        const nameInput = document.getElementById('modal-manual-item-name');
        
        if (idInput && failedItems.length > 0) {
          idInput.value = failedItems[0].id;
          
          // Focus on name input since ID is already filled
          if (nameInput) {
            nameInput.focus();
          }
          
          // Show helper notification
          this.showNotification(`ID ${failedItems[0].id} を設定しました。アイテム名を入力してください。`);
          setTimeout(() => this.hideNotification(), 4000);
          
          // Add helper for processing remaining items
          if (failedItems.length > 1) {
            setTimeout(() => {
              this.showNotification(`残り${failedItems.length - 1}個のアイテムも続けて入力できます。`);
              setTimeout(() => this.hideNotification(), 3000);
            }, 4500);
          }
        }
      }, 200);
    }, 100);
  }

  showManualAddModal() {
    // Remove existing modal if any
    this.hideManualAddModal();
    
    const modalOverlay = document.createElement('div');
    modalOverlay.className = 'booth-manual-add-modal-overlay';
    modalOverlay.id = 'booth-manual-add-modal';
    
    modalOverlay.innerHTML = `
      <div class="booth-manual-add-modal">
        <div class="booth-manual-add-modal-header">
          <h3>手動追加</h3>
          <button class="booth-manual-add-modal-close" type="button">×</button>
        </div>
        <div class="booth-manual-add-modal-content">
          <div class="booth-manual-add-form">
            <div class="booth-manual-inputs">
              <input type="text" id="modal-manual-item-id" placeholder="アイテムID" class="booth-manual-input">
              <input type="text" id="modal-manual-item-name" placeholder="アイテム名" class="booth-manual-input">
            </div>
            <div class="booth-manual-add-modal-actions">
              <button class="booth-manual-add-btn" type="button">追加</button>
              <button class="booth-manual-add-cancel-btn" type="button">キャンセル</button>
            </div>
          </div>
        </div>
      </div>
    `;
    
    this.managementWindow.appendChild(modalOverlay);
    
    // Attach event listeners for modal
    this.attachModalEventListeners(modalOverlay);
    
    // Focus on ID input
    setTimeout(() => {
      const idInput = modalOverlay.querySelector('#modal-manual-item-id');
      if (idInput) idInput.focus();
    }, 100);
  }

  hideManualAddModal() {
    const existingModal = document.getElementById('booth-manual-add-modal');
    if (existingModal) {
      existingModal.remove();
    }
  }

  attachModalEventListeners(modal) {
    // Close button
    const closeBtn = modal.querySelector('.booth-manual-add-modal-close');
    closeBtn.addEventListener('click', () => this.hideManualAddModal());
    
    // Cancel button
    const cancelBtn = modal.querySelector('.booth-manual-add-cancel-btn');
    cancelBtn.addEventListener('click', () => this.hideManualAddModal());
    
    // Add button
    const addBtn = modal.querySelector('.booth-manual-add-btn');
    addBtn.addEventListener('click', () => this.handleModalManualAdd());
    
    // Click outside to close
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        this.hideManualAddModal();
      }
    });
    
    // Enter key support
    const idInput = modal.querySelector('#modal-manual-item-id');
    const nameInput = modal.querySelector('#modal-manual-item-name');
    
    [idInput, nameInput].forEach(input => {
      input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          this.handleModalManualAdd();
        }
      });
    });
    
    // Escape key to close
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.hideManualAddModal();
      }
    });
  }

  async handleModalManualAdd() {
    // console.log('Modal manual add item requested');
    
    try {
      const idInput = document.getElementById('modal-manual-item-id');
      const nameInput = document.getElementById('modal-manual-item-name');
      
      if (!idInput || !nameInput) {
        this.showNotification('入力フィールドが見つかりません');
        return;
      }

      const itemId = idInput.value.trim();
      const itemName = nameInput.value.trim();

      // Validation
      if (!itemId) {
        this.showNotification('アイテムIDを入力してください');
        setTimeout(() => this.hideNotification(), 3000);
        idInput.focus();
        return;
      }

      if (!itemName) {
        this.showNotification('アイテム名を入力してください');
        setTimeout(() => this.hideNotification(), 3000);
        nameInput.focus();
        return;
      }

      // Validate ID format
      if (!/^\d+$/.test(itemId)) {
        this.showNotification('アイテムIDは数字のみで入力してください');
        setTimeout(() => this.hideNotification(), 3000);
        idInput.focus();
        return;
      }

      const storageManager = window.storageManager;
      if (!storageManager) {
        this.showNotification('ストレージマネージャーが利用できません');
        return;
      }

      // Check if item already exists
      const existingItem = await storageManager.getItem(itemId);
      if (existingItem) {
        this.showNotification(`アイテムID ${itemId} は既に登録されています`);
        setTimeout(() => this.hideNotification(), 3000);
        idInput.focus();
        return;
      }

      // Create item data
      const itemData = {
        id: itemId,
        name: itemName,
        category: 'unsaved',
        currentPageId: this.currentItemId
      };

      // Save to storage
      const saved = await storageManager.saveItem(itemId, itemData);
      if (saved) {
        // console.log(`Manual item ${itemId} saved: ${itemName}`);
        
        // Add to UI
        this.addItemToSection('unsaved', itemData);
        
        // Show success message
        this.showNotification(`アイテム「${itemName}」を追加しました`);
        setTimeout(() => this.hideNotification(), 3000);
        
        // Check if there are remaining failed items to process
        if (window.remainingFailedItems && window.remainingFailedItems.length > 0) {
          const nextItem = window.remainingFailedItems.shift();
          idInput.value = nextItem.id;
          nameInput.value = '';
          nameInput.focus();
          
          this.showNotification(`次のアイテム ID ${nextItem.id} を設定しました。残り${window.remainingFailedItems.length}個`);
          setTimeout(() => this.hideNotification(), 3000);
        } else {
          // Clear inputs and close modal
          idInput.value = '';
          nameInput.value = '';
          this.hideManualAddModal();
        }
      } else {
        this.showNotification('アイテムの保存に失敗しました');
        setTimeout(() => this.hideNotification(), 3000);
      }

    } catch (error) {
      window.errorHandler?.handleUIError(error, 'modal-manual-add', 'item-addition');
      this.showNotification('アイテム追加中にエラーが発生しました');
      setTimeout(() => this.hideNotification(), 3000);
    }
  }

  handleSectionToggle(header) {
    const sectionId = header.getAttribute('data-section');
    const itemsList = document.getElementById(`${sectionId}-items`);
    const toggleIcon = header.querySelector('.booth-section-toggle');
    
    if (!itemsList || !toggleIcon) return;
    
    const isCollapsed = itemsList.style.display === 'none';
    
    if (isCollapsed) {
      // Expand section
      itemsList.style.display = 'block';
      toggleIcon.textContent = '▼';
      header.classList.remove('collapsed');
    } else {
      // Collapse section
      itemsList.style.display = 'none';
      toggleIcon.textContent = '▶';
      header.classList.add('collapsed');
    }
    
    // console.log(`Section ${sectionId} ${isCollapsed ? 'expanded' : 'collapsed'}`);
  }

  updateSectionCounts() {
    const sections = ['saved', 'unsaved', 'excluded'];
    
    sections.forEach(sectionId => {
      const itemsList = document.getElementById(`${sectionId}-items`);
      const countElement = document.getElementById(`${sectionId}-count`);
      
      if (itemsList && countElement) {
        const itemCount = itemsList.querySelectorAll('.booth-item').length;
        countElement.textContent = itemCount;
        window.debugLogger?.log(`UIManager: Updated ${sectionId} count to ${itemCount}`);
      }
    });
  }

  addItemToSection(sectionId, itemData) {
    const section = document.getElementById(`${sectionId}-items`);
    if (!section) return;

    const itemEl = document.createElement('div');
    itemEl.className = 'booth-item';
    itemEl.setAttribute('data-item-id', itemData.id);
    
    // 現在のカテゴリに基づいてボタンを生成
    let buttonsHtml = '';
    if (sectionId === 'excluded') {
      // 除外アイテム: 復元ボタンを表示
      buttonsHtml = `
        <button class="booth-restore-btn" data-original-category="${itemData.previousCategory || 'unsaved'}">戻す</button>
      `;
    } else {
      // 保存済み・新規アイテム: 除外ボタン（×）のみ表示
      buttonsHtml = `
        <button class="booth-exclude-btn" data-target="excluded">×</button>
      `;
    }
    
    const itemUrl = `https://booth.pm/ja/items/${itemData.id}`;
    
    itemEl.innerHTML = `
      <div class="booth-item-main">
        <input type="text" class="booth-item-name" value="${itemData.name || ''}" placeholder="アイテム名">
        <div class="booth-item-url">
          <a href="${itemUrl}" target="_blank" class="booth-url-link">${itemUrl}</a>
        </div>
      </div>
      <div class="booth-item-actions">
        ${buttonsHtml}
      </div>
    `;

    this.attachItemEventListeners(itemEl);
    section.appendChild(itemEl);
    
    // Update section count
    this.updateSectionCounts();
  }

  async refreshItemDisplay() {
    try {
      const storageManager = window.storageManager;
      if (!storageManager || !this.currentItemId) return;

      // Clear all sections
      const sections = ['saved', 'unsaved', 'excluded'];
      sections.forEach(section => {
        const container = document.getElementById(`${section}-items`);
        if (container) {
          container.innerHTML = '';
        }
      });

      // Get all items and items found on current page
      const pageItems = await storageManager.getItemsForCurrentPage(this.currentItemId);
      const pageParser = window.pageParser || new PageParser();
      const { parseResult } = await pageParser.fetchItemsFromPage();
      const pageItemIds = new Set();
      
      // Add current page item ID if exists
      if (this.currentItemId) {
        pageItemIds.add(this.currentItemId);
      }
      
      // Add all items found on page
      parseResult.externalItems.forEach(item => {
        pageItemIds.add(item.itemId);
      });
      
      window.debugLogger?.log('RefreshItemDisplay: Items found on current page:', Array.from(pageItemIds));
      
      // Display only items that exist on the current page
      Object.values(pageItems).forEach(item => {
        if (pageItemIds.has(item.id)) {
          const category = item.category || 'unsaved';
          this.addItemToSection(category, item);
          window.debugLogger?.log(`RefreshItemDisplay: Added item ${item.id} to ${category} category`);
        }
      });

      // console.log('Item display refreshed for current page');
    } catch (error) {
      console.error('Error refreshing item display:', error);
    }
  }

  removeFromDOM() {
    if (this.managementWindow) {
      this.managementWindow.remove();
      this.managementWindow = null;
    }
  }
}