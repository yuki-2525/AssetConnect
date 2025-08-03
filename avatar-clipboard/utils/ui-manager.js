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
    this.currentTranslations = {};              // 現在の翻訳データ
    this.currentLanguage = 'ja';                // 現在の言語設定
    this.SUPPORTED_LANGUAGES = ['ja', 'en', 'ko']; // サポート対象言語
    this.initializeCurrentItemId();             // 商品ID取得
    this.initializeTranslations();              // 翻訳システム初期化
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
   * 翻訳システムを初期化
   */
  async initializeTranslations() {
    try {
      // 保存された言語設定を読み込み
      const result = await chrome.storage.local.get(['selectedLanguage']);
      const selectedLang = result.selectedLanguage || chrome.i18n.getUILanguage().substring(0, 2);
      this.currentLanguage = this.SUPPORTED_LANGUAGES.includes(selectedLang) ? selectedLang : 'ja';
      
      await this.loadTranslations(this.currentLanguage);
    } catch (error) {
      console.error('Translation initialization failed:', error);
      // フォールバック: 日本語を使用
      this.currentLanguage = 'ja';
      this.currentTranslations = {};
    }
  }

  /**
   * 翻訳データを読み込み
   * @param {string} lang - 言語コード
   */
  async loadTranslations(lang) {
    try {
      const response = await fetch(chrome.runtime.getURL(`_locales/${lang}/messages.json`));
      if (!response.ok) throw new Error(`Failed to load translations for ${lang}`);
      const translations = await response.json();
      
      // 簡単なkey-valueペアに変換
      this.currentTranslations = {};
      for (const [key, value] of Object.entries(translations)) {
        this.currentTranslations[key] = value.message;
      }
      
      this.currentLanguage = lang;
      return this.currentTranslations;
    } catch (error) {
      console.error('Translation loading error:', error);
      if (lang !== 'ja') {
        return await this.loadTranslations('ja');
      }
      return {};
    }
  }

  /**
   * 翻訳されたメッセージを取得
   * @param {string} key - 翻訳キー
   * @param {Object} replacements - プレースホルダー置換用のオブジェクト
   * @returns {string} 翻訳されたメッセージ
   */
  getMessage(key, replacements = {}) {
    let message = this.currentTranslations[key] || chrome.i18n.getMessage(key) || key;
    
    // プレースホルダー置換 (例: {count}, {id}, {name})
    for (const [placeholder, value] of Object.entries(replacements)) {
      message = message.replace(new RegExp(`{${placeholder}}`, 'g'), value);
    }
    
    return message;
  }

  /**
   * 地域別BOOTH URLを生成
   * @param {string} itemId - アイテムID
   * @returns {string} 地域別BOOTH URL
   */
  createBoothUrl(itemId) {
    return `https://booth.pm/${this.currentLanguage}/items/${itemId}`;
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
        <h3>${this.getMessage('avatarClipboardTitle')}</h3>
        <button class="booth-manager-close" type="button">×</button>
      </div>
      <div class="booth-manager-content">
        <div class="booth-manager-notification" id="booth-notification" style="display: none;">
          <p>${this.getMessage('unregisteredItemsFound')}</p>
          <div class="booth-found-items" id="booth-found-items" style="display: none;"></div>
          <div class="booth-notification-actions">
            <button class="booth-fetch-btn" type="button">${this.getMessage('fetchItemInfo')}</button>
          </div>
        </div>
        <div class="booth-manager-sections">
          <div class="booth-section" id="saved-section">
            <h4 class="booth-section-header collapsed" data-section="saved">
              <span class="booth-section-toggle">▶</span>
              ${this.getMessage('savedSection')}
              <span class="booth-section-count" id="saved-count">0</span>
            </h4>
            <div class="booth-items-list" id="saved-items" style="display: none;"></div>
          </div>
          <div class="booth-section" id="unsaved-section">
            <h4 class="booth-section-header" data-section="unsaved">
              <span class="booth-section-toggle">▼</span>
              ${this.getMessage('unsavedSection')}
              <span class="booth-section-count" id="unsaved-count">0</span>
            </h4>
            <div class="booth-items-list" id="unsaved-items"></div>
          </div>
          <div class="booth-section" id="excluded-section">
            <h4 class="booth-section-header" data-section="excluded">
              <span class="booth-section-toggle">▼</span>
              ${this.getMessage('excludedSection')}
              <span class="booth-section-count" id="excluded-count">0</span>
            </h4>
            <div class="booth-items-list" id="excluded-items"></div>
          </div>
        </div>
        <div class="booth-manager-actions">
          <button class="booth-export-btn" type="button">${this.getMessage('copyToClipboard')}</button>
          <button class="booth-manual-add-toggle-btn" type="button">${this.getMessage('manualAdd')}</button>
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
      
      // 通知メッセージを更新
      const foundItemsEl = document.getElementById('booth-found-items');
      const remainingItems = foundItemsEl.querySelectorAll('.booth-found-item');
      
      const messageEl = document.querySelector('#booth-notification p');
      if (messageEl) {
        messageEl.textContent = this.getMessage('boothItemsFoundInPage', { count: remainingItems.length });
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
      
      // 他の通知を表示する際に見つかったアイテムリストを非表示
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
        messageEl.textContent = this.getMessage('boothItemsFoundInPage', { count: itemsToFetch.length });
      }
      
      // 前のアイテムをクリア
      foundItemsEl.innerHTML = '';
      
      // 削除ボタン付きで各見つかったアイテムを追加
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
      
      // 削除ボタンリスナーを接続
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
      ${currentItem ? `<br><small>${this.getMessage('processing', { item: currentItem })}</small>` : ''}
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

    // 除外ボタン（×ボタン）
    const excludeBtn = itemEl.querySelector('.booth-exclude-btn');
    if (excludeBtn) {
      excludeBtn.addEventListener('click', (e) => {
        const targetSection = e.target.getAttribute('data-target');
        const currentCategory = itemEl.closest('.booth-items-list').id.replace('-items', '');
        this.handleItemExclude(itemEl.getAttribute('data-item-id'), currentCategory);
      });
    }

    // 復元ボタン
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
    
    // アイテム取得イベントを発火
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
        this.showNotification(this.getMessage('storageManagerUnavailable'));
        return;
      }

      const result = await clipboardManager.exportSavedAndNewItems(storageManager);
      
      if (result.success) {
        let message = this.getMessage('itemsCopiedToClipboard', { count: result.itemCount });
        
        // 永続化に失敗した場合は警告を表示
        if (result.warning) {
          message += `\n注意: ${result.warning}`;
        }
        
        // アイテムが移動または削除された場合はUIを更新
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
      this.showNotification(this.getMessage('exportError'));
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
        // ストレージ内のアイテム名を更新
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
      
      // 正しいボタンを表示するために表示を更新
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
      
      // 正しいボタンを表示するために表示を更新
      this.refreshItemDisplay();
      
      // console.log(`Item ${itemId} restored to ${originalCategory} section`);
    } catch (error) {
      console.error('Error restoring item:', error);
    }
  }


  showFailedItemsModal(failedItems) {
    // 既存のモーダルがある場合は削除
    this.hideFailedItemsModal();
    
    const modalOverlay = document.createElement('div');
    modalOverlay.className = 'booth-manual-add-modal-overlay';
    modalOverlay.id = 'booth-failed-items-modal';
    
    const failedItemsList = failedItems.map(item => `・ID: ${item.id}`).join('<br>');
    
    modalOverlay.innerHTML = `
      <div class="booth-manual-add-modal">
        <div class="booth-manual-add-modal-header">
          <h3>${this.getMessage('failedItemsTitle')}</h3>
          <button class="booth-manual-add-modal-close" type="button">×</button>
        </div>
        <div class="booth-manual-add-modal-content">
          <div class="booth-failed-items-message">
            <p>${this.getMessage('itemFetchFailedMessage')}</p>
            <div class="booth-failed-items-list">
              ${failedItemsList}
            </div>
            <p>${this.getMessage('manualInputPrompt')}</p>
          </div>
          <div class="booth-manual-add-modal-actions">
            <button class="booth-failed-items-confirm-btn" type="button">${this.getMessage('confirmManualInput')}</button>
            <button class="booth-manual-add-cancel-btn" type="button">${this.getMessage('cancel')}</button>
          </div>
        </div>
      </div>
    `;
    
    this.managementWindow.appendChild(modalOverlay);
    
    // 失敗アイテムモーダル用のイベントリスナーを接続
    this.attachFailedItemsModalEventListeners(modalOverlay, failedItems);
    
    // 確認ボタンにフォーカス
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
    // 閉じるボタン
    const closeBtn = modal.querySelector('.booth-manual-add-modal-close');
    closeBtn.addEventListener('click', () => this.hideFailedItemsModal());
    
    // キャンセルボタン
    const cancelBtn = modal.querySelector('.booth-manual-add-cancel-btn');
    cancelBtn.addEventListener('click', () => this.hideFailedItemsModal());
    
    // 確認ボタン
    const confirmBtn = modal.querySelector('.booth-failed-items-confirm-btn');
    confirmBtn.addEventListener('click', () => {
      this.hideFailedItemsModal();
      this.handleFailedItemsConfirm(failedItems);
    });
    
    // 外側クリックで閉じる
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        this.hideFailedItemsModal();
      }
    });
    
    // エスケープキーで閉じる
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.hideFailedItemsModal();
      }
    });
  }

  handleFailedItemsConfirm(failedItems) {
    // 残りの失敗アイテムをクイックアクセス用に保存
    window.remainingFailedItems = failedItems.slice(1);
    
    // 最初の失敗アイテムで手動追加モーダルを表示
    setTimeout(() => {
      this.showManualAddModal();
      
      // モーダル作成後に最初の失敗アイテムIDを設定
      setTimeout(() => {
        const idInput = document.getElementById('modal-manual-item-id');
        const nameInput = document.getElementById('modal-manual-item-name');
        
        if (idInput && failedItems.length > 0) {
          idInput.value = failedItems[0].id;
          
          // IDが既に入力されているため名前入力にフォーカス
          if (nameInput) {
            nameInput.focus();
          }
          
          // ヘルパー通知を表示
          this.showNotification(this.getMessage('itemIdSet', { id: failedItems[0].id }));
          setTimeout(() => this.hideNotification(), 4000);
          
          // 残りアイテム処理用のヘルパーを追加
          if (failedItems.length > 1) {
            setTimeout(() => {
              this.showNotification(this.getMessage('remainingItemsHelper', { count: failedItems.length - 1 }));
              setTimeout(() => this.hideNotification(), 3000);
            }, 4500);
          }
        }
      }, 200);
    }, 100);
  }

  showManualAddModal() {
    // 既存のモーダルがある場合は削除
    this.hideManualAddModal();
    
    const modalOverlay = document.createElement('div');
    modalOverlay.className = 'booth-manual-add-modal-overlay';
    modalOverlay.id = 'booth-manual-add-modal';
    
    modalOverlay.innerHTML = `
      <div class="booth-manual-add-modal">
        <div class="booth-manual-add-modal-header">
          <h3>${this.getMessage('manualAdd')}</h3>
          <button class="booth-manual-add-modal-close" type="button">×</button>
        </div>
        <div class="booth-manual-add-modal-content">
          <div class="booth-manual-add-form">
            <div class="booth-manual-inputs">
              <input type="text" id="modal-manual-item-id" placeholder="${this.getMessage('itemId')}" class="booth-manual-input">
              <input type="text" id="modal-manual-item-name" placeholder="${this.getMessage('itemName')}" class="booth-manual-input">
            </div>
            <div class="booth-manual-add-modal-actions">
              <button class="booth-manual-add-btn" type="button">${this.getMessage('add')}</button>
              <button class="booth-manual-add-cancel-btn" type="button">${this.getMessage('cancel')}</button>
            </div>
          </div>
        </div>
      </div>
    `;
    
    this.managementWindow.appendChild(modalOverlay);
    
    // モーダル用のイベントリスナーを接続
    this.attachModalEventListeners(modalOverlay);
    
    // ID入力にフォーカス
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
    // 閉じるボタン
    const closeBtn = modal.querySelector('.booth-manual-add-modal-close');
    closeBtn.addEventListener('click', () => this.hideManualAddModal());
    
    // キャンセルボタン
    const cancelBtn = modal.querySelector('.booth-manual-add-cancel-btn');
    cancelBtn.addEventListener('click', () => this.hideManualAddModal());
    
    // 追加ボタン
    const addBtn = modal.querySelector('.booth-manual-add-btn');
    addBtn.addEventListener('click', () => this.handleModalManualAdd());
    
    // 外側クリックで閉じる
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        this.hideManualAddModal();
      }
    });
    
    // エンターキーサポート
    const idInput = modal.querySelector('#modal-manual-item-id');
    const nameInput = modal.querySelector('#modal-manual-item-name');
    
    [idInput, nameInput].forEach(input => {
      input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          this.handleModalManualAdd();
        }
      });
    });
    
    // エスケープキーで閉じる
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

      // バリデーション
      if (!itemId) {
        this.showNotification(this.getMessage('enterItemId'));
        setTimeout(() => this.hideNotification(), 3000);
        idInput.focus();
        return;
      }

      if (!itemName) {
        this.showNotification(this.getMessage('enterItemName'));
        setTimeout(() => this.hideNotification(), 3000);
        nameInput.focus();
        return;
      }

      // ID形式をバリデーション
      if (!/^\d+$/.test(itemId)) {
        this.showNotification(this.getMessage('itemIdNumbersOnly'));
        setTimeout(() => this.hideNotification(), 3000);
        idInput.focus();
        return;
      }

      const storageManager = window.storageManager;
      if (!storageManager) {
        this.showNotification(this.getMessage('storageManagerUnavailable'));
        return;
      }

      // アイテムが既に存在するかチェック
      const existingItem = await storageManager.getItem(itemId);
      if (existingItem) {
        this.showNotification(this.getMessage('itemIdAlreadyExists', { id: itemId }));
        setTimeout(() => this.hideNotification(), 3000);
        idInput.focus();
        return;
      }

      // アイテムデータを作成
      const itemData = {
        id: itemId,
        name: itemName,
        category: 'unsaved',
        currentPageId: this.currentItemId
      };

      // ストレージに保存
      const saved = await storageManager.saveItem(itemId, itemData);
      if (saved) {
        // console.log(`Manual item ${itemId} saved: ${itemName}`);
        
        // UIに追加
        this.addItemToSection('unsaved', itemData);
        
        // 成功メッセージを表示
        this.showNotification(this.getMessage('itemAdded', { name: itemName }));
        setTimeout(() => this.hideNotification(), 3000);
        
        // 処理すべき残りの失敗アイテムがあるかチェック
        if (window.remainingFailedItems && window.remainingFailedItems.length > 0) {
          const nextItem = window.remainingFailedItems.shift();
          idInput.value = nextItem.id;
          nameInput.value = '';
          nameInput.focus();
          
          this.showNotification(this.getMessage('nextItemSet', { id: nextItem.id, count: window.remainingFailedItems.length }));
          setTimeout(() => this.hideNotification(), 3000);
        } else {
          // 入力をクリアしてモーダルを閉じる
          idInput.value = '';
          nameInput.value = '';
          this.hideManualAddModal();
        }
      } else {
        this.showNotification(this.getMessage('itemSaveFailed'));
        setTimeout(() => this.hideNotification(), 3000);
      }

    } catch (error) {
      window.errorHandler?.handleUIError(error, 'modal-manual-add', 'item-addition');
      this.showNotification(this.getMessage('itemAddError'));
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
      // セクションを展開
      itemsList.style.display = 'block';
      toggleIcon.textContent = '▼';
      header.classList.remove('collapsed');
    } else {
      // セクションを折りたたみ
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
        <button class="booth-restore-btn" data-original-category="${itemData.previousCategory || 'unsaved'}">${this.getMessage('restore')}</button>
      `;
    } else {
      // 保存済み・新規アイテム: 除外ボタン（×）のみ表示
      buttonsHtml = `
        <button class="booth-exclude-btn" data-target="excluded">${this.getMessage('exclude')}</button>
      `;
    }
    
    const itemUrl = this.createBoothUrl(itemData.id);
    
    itemEl.innerHTML = `
      <div class="booth-item-main">
        <input type="text" class="booth-item-name" value="${itemData.name || ''}" placeholder="${this.getMessage('itemName')}">
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
    
    // セクションカウントを更新
    this.updateSectionCounts();
  }

  async refreshItemDisplay() {
    try {
      const storageManager = window.storageManager;
      if (!storageManager || !this.currentItemId) return;

      // 全セクションをクリア
      const sections = ['saved', 'unsaved', 'excluded'];
      sections.forEach(section => {
        const container = document.getElementById(`${section}-items`);
        if (container) {
          container.innerHTML = '';
        }
      });

      // 全アイテムと現在のページで見つかったアイテムを取得
      const pageItems = await storageManager.getItemsForCurrentPage(this.currentItemId);
      const pageParser = window.pageParser || new PageParser();
      const { parseResult } = await pageParser.fetchItemsFromPage();
      const pageItemIds = new Set();
      
      // 現在のページアイテムIDが存在する場合は追加
      if (this.currentItemId) {
        pageItemIds.add(this.currentItemId);
      }
      
      // ページで見つかった全アイテムを追加
      parseResult.externalItems.forEach(item => {
        pageItemIds.add(item.itemId);
      });
      
      window.debugLogger?.log('RefreshItemDisplay: Items found on current page:', Array.from(pageItemIds));
      
      // 現在のページに存在するアイテムのみ表示
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