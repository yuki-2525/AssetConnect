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
    this.translationManager = window.translationManager; // 共有翻訳マネージャー
    
    // DOM要素キャッシュ
    this.notificationEl = null;
    this.foundItemsEl = null;
    this.domCache = new Map(); // 汎用DOM要素キャッシュ
    
    // 遅延時間定数（ミリ秒）
    this.DELAYS = {
      NOTIFICATION_SHORT: 3000,     // 短い通知
      NOTIFICATION_LONG: 5000,      // 長い通知  
      NOTIFICATION_HELPER: 4000,    // ヘルパー通知
      NOTIFICATION_REMAINING: 4500, // 残りアイテム通知
      FOCUS_DELAY: 100,             // フォーカス遅延
      MODAL_DELAY: 200,             // モーダル処理遅延
      DEBOUNCE_INPUT: 500           // 入力デバウンス
    };
    
    // セクション定数
    this.SECTIONS = ['saved', 'unsaved', 'excluded', 'permanentlyExcluded'];
    this.TAG_SECTIONS = ['saved-tags', 'unsaved-tags', 'excluded-tags', 'permanentlyExcluded-tags'];
    
    // モーダル要素セレクター定数
    this.MODAL_SELECTORS = {
      CLOSE: '.booth-manual-add-modal-close',
      CANCEL: '.booth-manual-add-cancel-btn',
      ADD: '.booth-manual-add-btn',
      CONFIRM: '.booth-failed-items-confirm-btn'
    };
    
    // モーダルID定数
    this.MODAL_IDS = {
      FAILED_ITEMS: 'booth-failed-items-modal',
      MANUAL_ADD: 'booth-manual-add-modal'
    };
    
    // ストレージキー定数
    this.STORAGE_KEYS = {
      WINDOW_SIZE: 'boothClipboardWindowSize'
    };
    
    // 要素ID定数
    this.ELEMENT_IDS = {
      MANUAL_ITEM_ID: 'modal-manual-item-id',
      MANUAL_ITEM_NAME: 'modal-manual-item-name'
    };
    
    // CSSクラス名定数
    this.CSS_CLASSES = {
      REMOVE_ITEM_BTN: 'booth-remove-item-btn',
      FOUND_ITEM: 'booth-found-item',
      FOUND_ITEM_URL: 'booth-found-item-url',
      FOUND_ITEM_INFO: 'booth-found-item-info',
      FOUND_ITEM_ID: 'booth-found-item-id',
      BOOTH_ITEM: 'booth-item',
      ITEM_MAIN: 'booth-item-main',
      ITEM_URL: 'booth-item-url',
      URL_LINK: 'booth-url-link',
      SECTION_TOGGLE: 'booth-section-toggle',
      MANAGER_CLOSE: 'booth-manager-close',
      FETCH_BTN: 'booth-fetch-btn',
      EXPORT_BTN: 'booth-export-btn',
      MANUAL_ADD_TOGGLE_BTN: 'booth-manual-add-toggle-btn',
      SECTION_HEADER: 'booth-section-header',
      EXCLUDE_BTN: 'booth-exclude-btn',
      PERMANENTLY_EXCLUDE_BTN: 'booth-permanently-exclude-btn',
      RESTORE_BTN: 'booth-restore-btn',
      ITEM_NAME: 'booth-item-name',
      ITEMS_LIST: 'booth-items-list',
      FAILED_ITEMS_MESSAGE: 'booth-failed-items-message',
      FAILED_ITEMS_LIST: 'booth-failed-items-list',
      MANUAL_ADD_FORM: 'booth-manual-add-form',
      MANUAL_INPUTS: 'booth-manual-inputs',
      MANUAL_INPUT: 'booth-manual-input',
      TAB_BTN: 'booth-tab-btn',
      TAB_CONTENT: 'booth-tab-content'
    };
    
    // エンティティタイプ設定（アイテムとタグの統一処理用）
    this.ENTITY_CONFIG = {
      item: {
        storageGet: 'getItem',
        storageUpdate: 'updateItem',
        storageSave: 'saveItem',
        idAttr: 'data-item-id',
        sectionSuffix: '',
        logPrefix: 'Item'
      },
      tag: {
        storageGet: 'getTag',
        storageUpdate: 'updateTag',
        storageSave: 'saveTag',
        idAttr: 'data-tag-id',
        sectionSuffix: '-tags',
        logPrefix: 'Tag'
      }
    };
    
    this.initializeCurrentItemId();             // 商品ID取得
    this.currentTab = 'items'; // デフォルトタブ
    this.tagsFetched = false;  // タグが既にフェッチされたかどうか
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
   * 翻訳されたメッセージを取得
   * @param {string} key - 翻訳キー
   * @param {Object} replacements - プレースホルダー置換用のオブジェクト
   * @returns {string} 翻訳されたメッセージ
   */
  getMessage(key, replacements = {}) {
    return this.translationManager.getMessage(key, replacements);
  }

  /**
   * 地域別BOOTH URLを生成
   * @param {string} itemId - アイテムID
   * @returns {string} 地域別BOOTH URL
   */
  createBoothUrl(itemId) {
    return this.translationManager.createBoothUrl(itemId);
  }

  /**
   * 通知を指定時間後に自動非表示するヘルパーメソッド
   * @param {string} message - 通知メッセージ
   * @param {number} delay - 自動非表示までの遅延時間（デフォルト: 短い通知）
   * @param {string} itemUrl - アイテムURL（オプション）
   */
  showNotificationWithTimeout(message, delay = this.DELAYS.NOTIFICATION_SHORT, itemUrl = null) {
    this.showNotification(message, itemUrl);
    setTimeout(() => this.hideNotification(), delay);
  }

  /**
   * バリデーションエラー表示用のヘルパーメソッド
   * @param {string} message - エラーメッセージ
   * @param {HTMLElement} inputElement - フォーカスする入力要素
   * @param {number} delay - 通知表示時間（デフォルト: 短い通知）
   */
  showValidationError(message, inputElement, delay = this.DELAYS.NOTIFICATION_SHORT) {
    this.showNotificationWithTimeout(message, delay);
    if (inputElement) {
      inputElement.focus();
    }
  }

  /**
   * DOM要素をキャッシュ付きで取得するヘルパーメソッド
   * @param {string} id - 要素のID
   * @returns {HTMLElement|null} DOM要素
   */
  getCachedElement(id) {
    if (!this.domCache.has(id)) {
      this.domCache.set(id, document.getElementById(id));
    }
    const element = this.domCache.get(id);
    // 要素がDOMから削除されている場合はキャッシュをクリア
    if (element && !document.contains(element)) {
      this.domCache.delete(id);
      const newElement = document.getElementById(id);
      if (newElement) {
        this.domCache.set(id, newElement);
      }
      return newElement;
    }
    return element;
  }

  /**
   * storageManagerの存在を確認し、存在しない場合はエラー表示するヘルパーメソッド
   * @returns {Object|null} storageManagerまたはnull
   */
  validateStorageManager() {
    const storageManager = window.storageManager;
    if (!storageManager) {
      this.showNotification(this.getMessage('storageManagerUnavailable'));
      return null;
    }
    return storageManager;
  }

  /**
   * モーダル要素を取得するヘルパーメソッド
   * @param {HTMLElement} modal - モーダルコンテナー
   * @param {string} selector - セレクター
   * @returns {HTMLElement|null} 要素
   */
  getModalElement(modal, selector) {
    return modal.querySelector(selector);
  }

  /**
   * 共通モーダル用の基本構造を作成するヘルパーメソッド
   * @param {string} modalId - モーダルID
   * @param {string} title - モーダルタイトル
   * @param {string} content - モーダルコンテンツHTML
   * @returns {HTMLElement} モーダル要素
   */
  createModalBase(modalId, title, content) {
    const modalOverlay = document.createElement('div');
    modalOverlay.className = 'booth-manual-add-modal-overlay';
    modalOverlay.id = modalId;
    
    modalOverlay.innerHTML = `
      <div class="booth-manual-add-modal">
        <div class="booth-manual-add-modal-header">
          <h3>${title}</h3>
          <button class="booth-manual-add-modal-close" type="button">×</button>
        </div>
        <div class="booth-manual-add-modal-content">
          ${content}
        </div>
      </div>
    `;
    
    return modalOverlay;
  }

  /**
   * モーダル内の指定された要素にフォーカスするヘルパーメソッド
   * @param {HTMLElement} modal - モーダル要素
   * @param {string} selector - フォーカスする要素のセレクター
   */
  focusModalElement(modal, selector) {
    setTimeout(() => {
      const element = modal ? modal.querySelector(selector) : this.getCachedElement(selector.replace('#', ''));
      if (element) element.focus();
    }, this.DELAYS.FOCUS_DELAY);
  }

  /**
   * 要素からカテゴリ名を抽出するヘルパーメソッド
   * @param {HTMLElement} element - DOM要素
   * @returns {string} カテゴリ名
   */
  extractCategoryFromElement(element) {
    const itemsList = element.closest(`.${this.CSS_CLASSES.ITEMS_LIST}`);
    return itemsList ? itemsList.id.replace('-items', '') : 'unsaved';
  }

  /**
   * 汎用エンティティ名前編集ハンドラ（アイテム・タグ共通）
   * @param {string} entityType - 'item' または 'tag'
   * @param {string} entityId - エンティティID
   * @param {string} newName - 新しい名前
   */
  async handleEntityNameEdit(entityType, entityId, newName) {
    // デバウンス: 既存のタイマーをクリア
    const timeoutKey = `${entityType}-${entityId}`;
    if (this.nameEditTimeouts.has(timeoutKey)) {
      clearTimeout(this.nameEditTimeouts.get(timeoutKey));
    }
    
    const config = this.ENTITY_CONFIG[entityType];
    const timeoutId = setTimeout(async () => {
      try {
        const storageManager = this.validateStorageManager();
        if (storageManager) {
          const success = await storageManager[config.storageUpdate](entityId, { name: newName });
          if (success) {
            window.debugLogger?.log(`UIManager: ${config.logPrefix} ${entityId} name updated to: ${newName}`);
          }
        }
        this.nameEditTimeouts.delete(timeoutKey);
      } catch (error) {
        window.errorHandler?.handleUIError(error, `${entityType}-name-edit`, entityId);
        this.nameEditTimeouts.delete(timeoutKey);
      }
    }, this.DELAYS.DEBOUNCE_INPUT);
    
    this.nameEditTimeouts.set(timeoutKey, timeoutId);
  }

  /**
   * 汎用エンティティ除外ハンドラ（アイテム・タグ共通）
   * @param {string} entityType - 'item' または 'tag'
   * @param {string} entityId - エンティティID
   * @param {string} currentCategory - 現在のカテゴリ
   */
  async handleEntityExclude(entityType, entityId, currentCategory) {
    const config = this.ENTITY_CONFIG[entityType];
    window.debugLogger?.log(`UIManager: ${config.logPrefix} excluded:`, entityId, 'from', currentCategory);
    
    try {
      const storageManager = this.validateStorageManager();
      if (storageManager) {
        const success = await storageManager[config.storageUpdate](entityId, { 
          category: 'excluded',
          previousCategory: currentCategory,
          currentPageId: entityType === 'item' ? this.currentItemId : (this.currentItemId || window.location.href)
        });
        if (!success) {
          window.errorHandler?.handleUIError(new Error(`Failed to update ${entityType} category in storage`), `${entityType}-exclude`, entityId);
          return;
        }
      }
      
      this.refreshItemDisplay();
      window.debugLogger?.log(`UIManager: ${config.logPrefix} ${entityId} moved to excluded section`);
    } catch (error) {
      window.errorHandler?.handleUIError(error, `${entityType}-exclude`, entityId);
    }
  }

  /**
   * 汎用エンティティ復元ハンドラ（アイテム・タグ共通）
   * @param {string} entityType - 'item' または 'tag'
   * @param {string} entityId - エンティティID
   * @param {string} originalCategory - 元のカテゴリ
   */
  async handleEntityRestore(entityType, entityId, originalCategory) {
    const config = this.ENTITY_CONFIG[entityType];
    window.debugLogger?.log(`UIManager: ${config.logPrefix} restored:`, entityId, 'to', originalCategory);
    
    try {
      const storageManager = this.validateStorageManager();
      if (storageManager) {
        const currentPageId = originalCategory === 'unsaved' 
          ? (entityType === 'item' ? this.currentItemId : (this.currentItemId || window.location.href))
          : undefined;
        
        const success = await storageManager[config.storageUpdate](entityId, { 
          category: originalCategory,
          previousCategory: null,
          currentPageId
        });
        if (!success) {
          window.errorHandler?.handleUIError(new Error(`Failed to restore ${entityType} category in storage`), `${entityType}-restore`, entityId);
          return;
        }
      }
      
      this.refreshItemDisplay();
      window.debugLogger?.log(`UIManager: ${config.logPrefix} ${entityId} restored to ${originalCategory} section`);
    } catch (error) {
      window.errorHandler?.handleUIError(error, `${entityType}-restore`, entityId);
    }
  }

  /**
   * 汎用エンティティ常時除外ハンドラ（アイテム・タグ共通）
   * @param {string} entityType - 'item' または 'tag'
   * @param {string} entityId - エンティティID
   */
  async handleEntityPermanentlyExclude(entityType, entityId) {
    const config = this.ENTITY_CONFIG[entityType];
    window.debugLogger?.log(`UIManager: ${config.logPrefix} permanently excluded:`, entityId);
    
    try {
      const storageManager = this.validateStorageManager();
      if (storageManager) {
        const currentEntity = await storageManager[config.storageGet](entityId);
        const previousCategory = currentEntity?.previousCategory || currentEntity?.category || 'unsaved';
        
        const success = await storageManager[config.storageUpdate](entityId, { 
          category: 'permanentlyExcluded',
          previousCategory: previousCategory,
          currentPageId: undefined
        });
        if (!success) {
          window.errorHandler?.handleUIError(new Error(`Failed to permanently exclude ${entityType} in storage`), `${entityType}-permanently-exclude`, entityId);
          return;
        }
      }
      
      this.refreshItemDisplay();
      window.debugLogger?.log(`UIManager: ${config.logPrefix} ${entityId} permanently excluded`);
    } catch (error) {
      window.errorHandler?.handleUIError(error, `${entityType}-permanently-exclude`, entityId);
    }
  }

  /**
   * バリデーション処理を行うヘルパーメソッド
   * @param {string} itemId - アイテムID
   * @param {string} itemName - アイテム名
   * @param {HTMLElement} idInput - ID入力要素
   * @param {HTMLElement} nameInput - 名前入力要素
   * @returns {boolean} バリデーション結果
   */
  validateManualInput(itemId, itemName, idInput, nameInput) {
    if (!itemId) {
      this.showValidationError(this.getMessage('enterItemId'), idInput);
      return false;
    }

    if (!itemName) {
      this.showValidationError(this.getMessage('enterItemName'), nameInput);
      return false;
    }

    if (!/^\d+$/.test(itemId)) {
      this.showValidationError(this.getMessage('itemIdNumbersOnly'), idInput);
      return false;
    }

    return true;
  }

  /**
   * アイテムの保存後処理を行うヘルパーメソッド
   * @param {string} itemId - アイテムID
   * @param {string} itemName - アイテム名
   * @param {HTMLElement} idInput - ID入力要素
   * @param {HTMLElement} nameInput - 名前入力要素
   * @param {Object} itemData - アイテムデータ
   */
  handleItemSaveSuccess(itemId, itemName, idInput, nameInput, itemData) {
    window.debugLogger?.log(`UIManager: Manual item ${itemId} saved: ${itemName}`);
    
    // UIに追加
    this.addItemToSection('unsaved', itemData);
    
    // 成功メッセージを表示
    this.showNotificationWithTimeout(this.getMessage('itemAdded', { name: itemName }));
    
    // 残りの失敗アイテム処理
    this.handleRemainingFailedItems(idInput, nameInput);
  }

  /**
   * 残りの失敗アイテムを処理するヘルパーメソッド
   * @param {HTMLElement} idInput - ID入力要素
   * @param {HTMLElement} nameInput - 名前入力要素
   */
  handleRemainingFailedItems(idInput, nameInput) {
    if (window.remainingFailedItems && window.remainingFailedItems.length > 0) {
      const nextItem = window.remainingFailedItems.shift();
      idInput.value = nextItem.id;
      nameInput.value = '';
      nameInput.focus();
      
      this.showNotificationWithTimeout(this.getMessage('nextItemSet', { id: nextItem.id, count: window.remainingFailedItems.length }));
    } else {
      // 入力をクリアしてモーダルを閉じる
      idInput.value = '';
      nameInput.value = '';
      this.hideManualAddModal();
    }
  }

  /**
   * 全セクションをクリアするヘルパーメソッド
   */
  clearAllSections() {
    const allSections = [...this.SECTIONS, ...this.TAG_SECTIONS];
    allSections.forEach(section => {
      const container = this.getCachedElement(`${section}-items`);
      if (container) {
        container.innerHTML = '';
      }
    });
  }

  /**
   * 現在のページで見つかったアイテムIDを取得するヘルパーメソッド
   * @returns {Promise<Set>} ページアイテムIDのセット
   */
  async getPageItemIds() {
    const pageItemIds = new Set();
    
    // 現在のページアイテムIDが存在する場合は追加
    if (this.currentItemId) {
      pageItemIds.add(this.currentItemId);
    }
    
    try {
      const pageParser = window.pageParser || new PageParser();
      const { parseResult } = await pageParser.fetchItemsFromPage();
      
      // ページで見つかった全アイテムを追加
      parseResult.externalItems.forEach(item => {
        pageItemIds.add(item.itemId);
      });
      
      window.debugLogger?.log('RefreshItemDisplay: Items found on current page:', Array.from(pageItemIds));
    } catch (error) {
      window.debugLogger?.log('getPageItemIds: Error fetching page items:', error);
    }
    
    return pageItemIds;
  }

  /**
   * セクションHTML生成ヘルパーメソッド
   * @param {string} sectionId - セクションID
   * @param {string} labelKey - ラベル翻訳キー
   * @param {boolean} collapsed - 折りたたみ状態
   * @returns {string} セクションHTML
   */
  generateSectionHtml(sectionId, labelKey, collapsed = false) {
    const collapsedClass = collapsed ? ' collapsed' : '';
    const toggleIcon = collapsed ? '▶' : '▼';
    const displayStyle = collapsed ? ' style="display: none;"' : '';
    const label = this.getMessage(labelKey) || labelKey;
    
    return `
      <div class="booth-section" id="${sectionId}-section">
        <h4 class="booth-section-header${collapsedClass}" data-section="${sectionId}">
          <span class="booth-section-toggle">${toggleIcon}</span>
          ${label}
          <span class="booth-section-count" id="${sectionId}-count">0</span>
        </h4>
        <div class="booth-items-list" id="${sectionId}-items"${displayStyle}></div>
      </div>
    `;
  }

  /**
   * タブコンテンツ用のセクションHTML一括生成
   * @param {string} suffix - タグ用の場合は '-tags'
   * @returns {string} セクションHTML
   */
  generateAllSectionsHtml(suffix = '') {
    const sections = [
      { id: `saved${suffix}`, labelKey: 'savedSection', collapsed: true },
      { id: `unsaved${suffix}`, labelKey: 'unsavedSection', collapsed: false },
      { id: `excluded${suffix}`, labelKey: 'excludedSection', collapsed: false },
      { id: `permanentlyExcluded${suffix}`, labelKey: 'permanentlyExcludedSection', collapsed: true }
    ];
    
    return sections.map(s => this.generateSectionHtml(s.id, s.labelKey, s.collapsed)).join('');
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
        <div class="booth-manager-controls">
          <a href="https://assetconnect.sakurayuki.dev/tutorial#avatar-copy" target="_blank" class="booth-help-btn" title="Help">
            <svg class="help-icon" viewBox="0 0 24 24" width="16" height="16">
              <path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75l-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H8c0-2.21 1.79-4 4-4s4 1.79 4 4c0 .88-.36 1.68-.93 2.25z"/>
            </svg>
          </a>
          <button class="booth-manager-close" type="button">×</button>
        </div>
      </div>
      <div class="booth-manager-tabs">
        <button class="booth-tab-btn active" data-tab="items">${this.getMessage('avatarsTab') || 'Avatars'}</button>
        <button class="booth-tab-btn" data-tab="tags">${this.getMessage('tagsTab') || 'Tags'}</button>
      </div>
      <div class="booth-manager-content">
        <div id="items-tab-content" class="booth-tab-content active">
          <div class="booth-manager-notification" id="booth-notification" style="display: none;">
            <p>${this.getMessage('unregisteredItemsFound')}</p>
            <div class="booth-found-items" id="booth-found-items" style="display: none;"></div>
            <div class="booth-notification-actions">
              <button class="booth-fetch-btn" type="button">${this.getMessage('fetchItemInfo')}</button>
            </div>
          </div>
          <div class="booth-manager-sections">
            ${this.generateAllSectionsHtml()}
          </div>
        </div>
        <div id="tags-tab-content" class="booth-tab-content" style="display: none;">
          <div class="booth-manager-notification booth-tags-notification" id="booth-tags-notification" style="display: none;">
            <p></p>
          </div>
          <div class="booth-manager-sections">
            ${this.generateAllSectionsHtml('-tags')}
          </div>
        </div>
      </div>
      <div class="booth-manager-actions">
        <button class="booth-export-btn" type="button">${this.getMessage('copyToClipboard')}</button>
        <button class="booth-manual-add-toggle-btn" type="button">${this.getMessage('manualAdd')}</button>
      </div>
    `;
  // start minimized (タイトルのみ表示)
  windowContainer.classList.add('minimized');

  // リサイズハンドルを追加
  this.addResizeHandles(windowContainer);

  this.attachEventListeners(windowContainer);
    document.body.appendChild(windowContainer);
    this.managementWindow = windowContainer;
    
    // DOM要素をキャッシュ（アバター用）
    this.notificationEl = this.getCachedElement('booth-notification');
    this.foundItemsEl = this.getCachedElement('booth-found-items');
    // DOM要素をキャッシュ（タグ用）
    this.tagsNotificationEl = this.getCachedElement('booth-tags-notification');
    
    return windowContainer;
  }

  /**
   * リサイズハンドルを追加
   * @param {HTMLElement} container - ウィンドウコンテナ
   */
  addResizeHandles(container) {
    // 上辺のリサイズハンドル
    const topHandle = document.createElement('div');
    topHandle.className = 'booth-resize-handle booth-resize-handle-top';
    container.appendChild(topHandle);

    // 左辺のリサイズハンドル
    const leftHandle = document.createElement('div');
    leftHandle.className = 'booth-resize-handle booth-resize-handle-left';
    container.appendChild(leftHandle);

    // 左上角のリサイズハンドル
    const cornerHandle = document.createElement('div');
    cornerHandle.className = 'booth-resize-handle booth-resize-handle-corner';
    container.appendChild(cornerHandle);

    // リサイズイベントを設定
    this.setupResizeEvents(topHandle, 'top');
    this.setupResizeEvents(leftHandle, 'left');
    this.setupResizeEvents(cornerHandle, 'corner');
  }

  /**
   * リサイズイベントを設定
   * @param {HTMLElement} handle - リサイズハンドル
   * @param {string} direction - リサイズ方向 ('top', 'left', 'corner')
   */
  setupResizeEvents(handle, direction) {
    let isResizing = false;
    let startX, startY, startWidth, startHeight, startBottom, startRight;

    const onMouseDown = (e) => {
      // 最小化状態ではリサイズ不可
      if (this.managementWindow.classList.contains('minimized')) return;
      
      isResizing = true;
      startX = e.clientX;
      startY = e.clientY;
      
      const rect = this.managementWindow.getBoundingClientRect();
      startWidth = rect.width;
      startHeight = rect.height;
      startBottom = window.innerHeight - rect.bottom;
      startRight = window.innerWidth - rect.right;

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
      
      // テキスト選択を防ぐ
      e.preventDefault();
    };

    const onMouseMove = (e) => {
      if (!isResizing) return;

      const deltaX = startX - e.clientX;
      const deltaY = startY - e.clientY;

      if (direction === 'top' || direction === 'corner') {
        // 上方向へのリサイズ（高さを増やす）
        const newHeight = Math.min(Math.max(startHeight + deltaY, 200), 1300);
        this.managementWindow.style.height = `${newHeight}px`;
        // max-heightは設定しない（flexboxで管理）
        this.updateContentMaxHeight(newHeight);
      }

      if (direction === 'left' || direction === 'corner') {
        // 左方向へのリサイズ（幅を増やす）
        const newWidth = Math.min(Math.max(startWidth + deltaX, 300), 600);
        this.managementWindow.style.width = `${newWidth}px`;
      }
    };

    const onMouseUp = () => {
      isResizing = false;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      
      // リサイズ完了時にサイズを保存
      this.saveWindowSize();
    };

    handle.addEventListener('mousedown', onMouseDown);
  }

  /**
   * ウィンドウサイズをストレージに保存
   */
  async saveWindowSize() {
    if (!this.managementWindow) return;
    
    const rect = this.managementWindow.getBoundingClientRect();
    const size = {
      width: rect.width,
      height: rect.height
    };
    
    try {
      await chrome.storage.local.set({ [this.STORAGE_KEYS.WINDOW_SIZE]: size });
      window.debugLogger?.log('UIManager: Window size saved:', size);
    } catch (error) {
      window.debugLogger?.log('UIManager: Failed to save window size:', error);
    }
  }

  /**
   * 保存されたウィンドウサイズを読み込んで適用
   */
  async loadWindowSize() {
    if (!this.managementWindow) return;
    
    try {
      const result = await chrome.storage.local.get(this.STORAGE_KEYS.WINDOW_SIZE);
      const size = result[this.STORAGE_KEYS.WINDOW_SIZE];
      
      if (size && size.width && size.height) {
        // 保存されたサイズを適用（制限内に収める）
        const width = Math.min(Math.max(size.width, 300), 600);
        const height = Math.min(Math.max(size.height, 200), 1300);
        
        this.managementWindow.style.width = `${width}px`;
        this.managementWindow.style.height = `${height}px`;
        // max-heightは設定しない（flexboxで管理）
        this.updateContentMaxHeight(height);
        
        window.debugLogger?.log('UIManager: Window size loaded:', { width, height });
      }
    } catch (error) {
      window.debugLogger?.log('UIManager: Failed to load window size:', error);
    }
  }

  /**
   * コンテンツ領域の最大高さを更新
   * @param {number} windowHeight - ウィンドウ全体の高さ
   */
  updateContentMaxHeight(windowHeight) {
    const content = this.managementWindow.querySelector('.booth-manager-content');
    if (content) {
      // header(44px) + tabs(42px) + actions(60px) = 146px
      const contentHeight = windowHeight - 146;
      content.style.height = `${Math.max(contentHeight, 50)}px`;
    }
  }

  attachEventListeners(container) {
    const eventHandlers = [
      { selector: `.${this.CSS_CLASSES.MANAGER_CLOSE}`, handler: () => this.hideWindow() },
      { selector: `.${this.CSS_CLASSES.FETCH_BTN}`, handler: () => this.handleFetchItem() },
      { selector: `.${this.CSS_CLASSES.EXPORT_BTN}`, handler: () => this.handleExport() },
      { selector: `.${this.CSS_CLASSES.MANUAL_ADD_TOGGLE_BTN}`, handler: () => this.showManualAddModal() }
    ];
    
    eventHandlers.forEach(({ selector, handler }) => {
      const element = container.querySelector(selector);
      if (element) element.addEventListener('click', handler);
    });

    // タブ切り替え
    const tabBtns = container.querySelectorAll(`.${this.CSS_CLASSES.TAB_BTN}`);
    tabBtns.forEach(btn => {
      btn.addEventListener('click', (e) => this.handleTabChange(e.target));
    });

    // タブバー領域クリックで展開（最小化はしない）
    const tabsEl = container.querySelector('.booth-manager-tabs');
    if (tabsEl) {
      tabsEl.addEventListener('click', (e) => {
        // 最小化状態の場合のみ展開する
        if (this.managementWindow && this.managementWindow.classList.contains('minimized')) {
          this.expandWindow();
        }
        // 展開状態の場合は何もしない（最小化しない）
      });
    }

    // セクショントグル機能
    const sectionHeaders = container.querySelectorAll(`.${this.CSS_CLASSES.SECTION_HEADER}`);
    sectionHeaders.forEach(header => {
      header.addEventListener('click', () => this.handleSectionToggle(header));
    });

    // タイトル部クリックで最小化/展開を切り替える（コントロール部とタブ領域のクリックは無視）
    const headerEl = container.querySelector('.booth-manager-header');
    if (headerEl) {
      headerEl.addEventListener('click', (e) => {
        // ヘッダ内のコントロール（help, close ボタン等）のクリックはトグル動作を阻害しない
        if (e.target.closest('.booth-manager-controls')) return;
        this.toggleMinimized();
      });
    }
  }

  handleTabChange(targetBtn) {
    const tabName = targetBtn.getAttribute('data-tab');
    if (this.currentTab === tabName) return;

    this.currentTab = tabName;

    // タブボタンのスタイル更新
    const tabBtns = this.managementWindow.querySelectorAll(`.${this.CSS_CLASSES.TAB_BTN}`);
    tabBtns.forEach(btn => {
      if (btn.getAttribute('data-tab') === tabName) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    // タブコンテンツの表示切り替え
    const itemsContent = this.managementWindow.querySelector('#items-tab-content');
    const tagsContent = this.managementWindow.querySelector('#tags-tab-content');
    const manualAddBtn = this.managementWindow.querySelector(`.${this.CSS_CLASSES.MANUAL_ADD_TOGGLE_BTN}`);

    if (tabName === 'items') {
      itemsContent.style.display = 'block';
      itemsContent.classList.add('active');
      tagsContent.style.display = 'none';
      tagsContent.classList.remove('active');
      // アバタータブでは手動追加ボタンを表示
      if (manualAddBtn) manualAddBtn.style.display = 'inline-block';
    } else {
      itemsContent.style.display = 'none';
      itemsContent.classList.remove('active');
      tagsContent.style.display = 'block';
      tagsContent.classList.add('active');
      // タグタブでは手動追加ボタンを非表示
      if (manualAddBtn) manualAddBtn.style.display = 'none';
      
      // タグタブへの初回切り替え時のみタグをフェッチ
      if (!this.tagsFetched) {
        this.fetchAndDisplayTags();
      }
    }
  }

  attachFoundItemsEventListeners() {
    if (!this.foundItemsEl) return;
    
    const removeButtons = this.foundItemsEl.querySelectorAll(`.${this.CSS_CLASSES.REMOVE_ITEM_BTN}`);
    removeButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const itemId = e.target.getAttribute('data-item-id');
        this.removeFoundItem(itemId);
      });
    });
  }

  removeFoundItem(itemId) {
    const itemDiv = this.foundItemsEl?.querySelector(`[data-item-id="${itemId}"].${this.CSS_CLASSES.FOUND_ITEM}`);
    if (itemDiv) {
      itemDiv.remove();
      
      // 通知メッセージを更新
      const remainingItems = this.foundItemsEl.querySelectorAll(`.${this.CSS_CLASSES.FOUND_ITEM}`);
      
      const messageEl = this.notificationEl.querySelector('p');
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
    if (!this.foundItemsEl) return [];
    
    const itemDivs = this.foundItemsEl.querySelectorAll(`.${this.CSS_CLASSES.FOUND_ITEM}`);
    return Array.from(itemDivs).map(div => {
      const itemId = div.getAttribute('data-item-id');
      const urlLink = div.querySelector(`.${this.CSS_CLASSES.FOUND_ITEM_URL}`);
      return {
        id: itemId,
        url: urlLink ? urlLink.href : ''
      };
    });
  }

  async showWindow() {
    if (!this.managementWindow) {
      this.createManagementWindow();
    }
    // 表示時はデフォルトで最小化状態（タイトルのみ）にする
    this.managementWindow.style.display = 'block';
    this.managementWindow.classList.add('minimized');
    // リサイズで設定されたインラインスタイルをクリア（高さのみ）
    this.managementWindow.style.height = '';
    this.managementWindow.style.maxHeight = '';
    
    // 保存された幅を適用
    try {
      const result = await chrome.storage.local.get(this.STORAGE_KEYS.WINDOW_SIZE);
      const size = result[this.STORAGE_KEYS.WINDOW_SIZE];
      if (size && size.width) {
        const width = Math.min(Math.max(size.width, 300), 600);
        this.managementWindow.style.width = `${width}px`;
      }
    } catch (error) {
      window.debugLogger?.log('UIManager: Failed to load window width:', error);
    }
  }

  async expandWindow() {
    if (!this.managementWindow) return;
    this.managementWindow.classList.remove('minimized');
    
    // 保存されたサイズを読み込んで適用
    await this.loadWindowSize();
    
    const content = this.managementWindow.querySelector('.booth-manager-content');
    const actions = this.managementWindow.querySelector('.booth-manager-actions');
    if (content) {
      content.style.display = 'block';
    }
    if (actions) {
      actions.style.display = 'flex';
    }
  }

  hideWindow() {
    if (this.managementWindow) {
      this.managementWindow.style.display = 'none';
    }
  }

  /**
   * Toggle minimized/expanded state for the management window
   */
  async toggleMinimized() {
    if (!this.managementWindow) return;
    const isNowMinimized = this.managementWindow.classList.toggle('minimized');

    // 最小化時はリサイズで設定されたインラインスタイルをクリア
    if (isNowMinimized) {
      this.managementWindow.style.height = '';
      this.managementWindow.style.maxHeight = '';
    } else {
      // 展開時は保存されたサイズを読み込んで適用
      await this.loadWindowSize();
    }

    const content = this.managementWindow.querySelector('.booth-manager-content');
    const actions = this.managementWindow.querySelector('.booth-manager-actions');
    if (content) {
      if (isNowMinimized) {
        content.style.display = 'none';
        content.style.maxHeight = '';
      } else {
        content.style.display = 'block';
        // フォーカスやスクロールの微調整を行う
        content.scrollTop = 0;
      }
    }
    if (actions) {
      if (isNowMinimized) {
        actions.style.display = 'none';
      } else {
        actions.style.display = 'flex';
      }
    }
  }

  showNotification(message, itemUrl = null) {
    if (this.notificationEl) {
      this.notificationEl.style.display = 'block';
      const messageEl = this.notificationEl.querySelector('p');
      if (messageEl) {
        if (itemUrl) {
          messageEl.innerHTML = `${message}<br><small class="${this.CSS_CLASSES.ITEM_URL}">${itemUrl}</small>`;
        } else {
          messageEl.innerHTML = message; // Use innerHTML to support HTML in progress messages
        }
      }
      
      // 他の通知を表示する際に見つかったアイテムリストを非表示
      if (this.foundItemsEl) {
        this.foundItemsEl.style.display = 'none';
      }
    }
  }

  showFoundItemsNotification(itemsToFetch) {
    if (this.notificationEl && this.foundItemsEl) {
      this.notificationEl.style.display = 'block';
      this.foundItemsEl.style.display = 'block';
      
      const messageEl = this.notificationEl.querySelector('p');
      if (messageEl) {
        messageEl.textContent = this.getMessage('boothItemsFoundInPage', { count: itemsToFetch.length });
      }
      
      // 前のアイテムをクリア
      this.foundItemsEl.innerHTML = '';
      
      // 削除ボタン付きで各見つかったアイテムを追加
      itemsToFetch.forEach((item) => {
        const itemDiv = document.createElement('div');
        itemDiv.className = this.CSS_CLASSES.FOUND_ITEM;
        itemDiv.setAttribute('data-item-id', item.id);
        
        itemDiv.innerHTML = `
          <div class="${this.CSS_CLASSES.FOUND_ITEM_INFO}">
            <span class="${this.CSS_CLASSES.FOUND_ITEM_ID}">ID: ${item.id}</span>
            <a href="${item.url}" target="_blank" class="${this.CSS_CLASSES.FOUND_ITEM_URL}">${item.url}</a>
          </div>
          <button class="${this.CSS_CLASSES.REMOVE_ITEM_BTN}" data-item-id="${item.id}" type="button">×</button>
        `;
        
        this.foundItemsEl.appendChild(itemDiv);
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
    if (this.notificationEl) {
      this.notificationEl.style.display = 'none';
    }
  }

  // タグ用通知メソッド（シンプル版）
  showTagsNotification(message) {
    if (this.tagsNotificationEl) {
      this.tagsNotificationEl.style.display = 'block';
      const messageEl = this.tagsNotificationEl.querySelector('p');
      if (messageEl) {
        messageEl.innerHTML = message;
      }
    }
  }

  showTagsNotificationWithTimeout(message, delay = this.DELAYS.NOTIFICATION_SHORT) {
    this.showTagsNotification(message);
    setTimeout(() => this.hideTagsNotification(), delay);
  }

  hideTagsNotification() {
    if (this.tagsNotificationEl) {
      this.tagsNotificationEl.style.display = 'none';
    }
  }

  handleFetchItem() {
    window.debugLogger?.log('UIManager: Fetching item information...');
    this.hideNotification();
    
    // アイテム取得イベントを発火
    const event = new CustomEvent('boothFetchItem', { 
      detail: { action: 'fetch' } 
    });
    document.dispatchEvent(event);
  }

  async handleExport() {
    window.debugLogger?.log('UIManager: Exporting to clipboard...');
    
    try {
      const clipboardManager = new ClipboardManager();
      const storageManager = this.validateStorageManager();
      if (!storageManager) return;

      let result;
      if (this.currentTab === 'tags') {
        result = await clipboardManager.exportSavedAndNewTags(storageManager);
      } else {
        result = await clipboardManager.exportSavedAndNewItems(storageManager);
      }
      
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
            window.debugLogger?.log(`UIManager: ${persistResult.successCount}個のアイテムを処理しました`);
          }
        }
        
        this.showNotificationWithTimeout(message);
      } else {
        this.showNotificationWithTimeout(result.error, this.DELAYS.NOTIFICATION_LONG);
      }
      
    } catch (error) {
      window.errorHandler?.handleUIError(error, 'export-handler', 'clipboard-export');
      this.showNotificationWithTimeout(this.getMessage('exportError'), this.DELAYS.NOTIFICATION_LONG);
    }
  }

  showFailedItemsModal(failedItems) {
    // モーダルを表示するためにウィンドウを展開
    this.expandWindow();

    // 既存のモーダルがある場合は削除
    this.hideFailedItemsModal();
    
    const failedItemsList = failedItems.map(item => `・ID: ${item.id}`).join('<br>');
    const content = `
      <div class="${this.CSS_CLASSES.FAILED_ITEMS_MESSAGE}">
        <p>${this.getMessage('itemFetchFailedMessage')}</p>
        <div class="${this.CSS_CLASSES.FAILED_ITEMS_LIST}">
          ${failedItemsList}
        </div>
        <p>${this.getMessage('manualInputPrompt')}</p>
      </div>
      <div class="booth-manual-add-modal-actions">
        <button class="booth-failed-items-confirm-btn" type="button">${this.getMessage('confirmManualInput')}</button>
        <button class="booth-manual-add-cancel-btn" type="button">${this.getMessage('cancel')}</button>
      </div>
    `;
    
    const modalOverlay = this.createModalBase(
      this.MODAL_IDS.FAILED_ITEMS,
      this.getMessage('failedItemsTitle'),
      content
    );
    
    this.managementWindow.appendChild(modalOverlay);
    
    // 失敗アイテムモーダル用のイベントリスナーを接続
    this.attachFailedItemsModalEventListeners(modalOverlay, failedItems);
    
    // 確認ボタンにフォーカス
    this.focusModalElement(modalOverlay, '.booth-failed-items-confirm-btn');
  }

  /**
   * 汎用モーダル非表示メソッド
   * @param {string} modalId - モーダルID
   */
  hideModal(modalId) {
    const existingModal = document.getElementById(modalId);
    if (existingModal) {
      existingModal.remove();
      this.domCache.delete(modalId);
    }
  }

  hideFailedItemsModal() {
    this.hideModal(this.MODAL_IDS.FAILED_ITEMS);
  }

  /**
   * 汎用モーダルイベントリスナー設定
   * @param {HTMLElement} modal - モーダル要素
   * @param {Function} hideCallback - 非表示コールバック
   * @param {Function} confirmCallback - 確認コールバック（オプション）
   */
  attachCommonModalEventListeners(modal, hideCallback, confirmCallback = null) {
    // 閉じるボタン
    const closeBtn = this.getModalElement(modal, this.MODAL_SELECTORS.CLOSE);
    if (closeBtn) {
      closeBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        hideCallback();
      });
    }
    
    // キャンセルボタン
    const cancelBtn = this.getModalElement(modal, this.MODAL_SELECTORS.CANCEL);
    if (cancelBtn) {
      cancelBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        hideCallback();
      });
    }
    
    // 確認ボタン
    if (confirmCallback) {
      const confirmBtn = this.getModalElement(modal, this.MODAL_SELECTORS.CONFIRM);
      if (confirmBtn) {
        confirmBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          hideCallback();
          confirmCallback();
        });
      }
    }
    
    // 外側クリックで閉じる
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        hideCallback();
      }
    });
  }

  attachFailedItemsModalEventListeners(modal, failedItems) {
    this.attachCommonModalEventListeners(
      modal,
      () => this.hideFailedItemsModal(),
      () => this.handleFailedItemsConfirm(failedItems)
    );
  }

  handleFailedItemsConfirm(failedItems) {
    // 残りの失敗アイテムをクイックアクセス用に保存
    window.remainingFailedItems = failedItems.slice(1);
    
    // 最初の失敗アイテムで手動追加モーダルを表示
    setTimeout(() => {
      this.showManualAddModal();
      this.setupFailedItemModal(failedItems);
    }, this.DELAYS.FOCUS_DELAY);
  }

  /**
   * 失敗アイテムモーダルの初期設定を行うヘルパーメソッド
   * @param {Array} failedItems - 失敗アイテム配列
   */
  setupFailedItemModal(failedItems) {
    setTimeout(() => {
      const idInput = this.getCachedElement(this.ELEMENT_IDS.MANUAL_ITEM_ID);
      const nameInput = this.getCachedElement(this.ELEMENT_IDS.MANUAL_ITEM_NAME);
      
      if (idInput && failedItems.length > 0) {
        idInput.value = failedItems[0].id;
        
        // IDが既に入力されているため名前入力にフォーカス
        if (nameInput) {
          nameInput.focus();
        }
        
        // ヘルパー通知を表示
        this.showNotificationWithTimeout(this.getMessage('itemIdSet', { id: failedItems[0].id }), this.DELAYS.NOTIFICATION_HELPER);
        
        // 残りアイテム処理用のヘルパーを表示
        if (failedItems.length > 1) {
          setTimeout(() => {
            this.showNotificationWithTimeout(this.getMessage('remainingItemsHelper', { count: failedItems.length - 1 }));
          }, this.DELAYS.NOTIFICATION_REMAINING);
        }
      }
    }, this.DELAYS.MODAL_DELAY);
  }

  showManualAddModal() {
    // モーダルを表示するためにウィンドウを展開
    this.expandWindow();

    // 既存のモーダルがある場合は削除
    this.hideManualAddModal();
    
    const content = `
      <div class="${this.CSS_CLASSES.MANUAL_ADD_FORM}">
        <div class="${this.CSS_CLASSES.MANUAL_INPUTS}">
          <input type="text" id="${this.ELEMENT_IDS.MANUAL_ITEM_ID}" placeholder="${this.getMessage('itemId')}" class="${this.CSS_CLASSES.MANUAL_INPUT}">
          <input type="text" id="${this.ELEMENT_IDS.MANUAL_ITEM_NAME}" placeholder="${this.getMessage('itemName')}" class="${this.CSS_CLASSES.MANUAL_INPUT}">
        </div>
        <div class="booth-manual-add-modal-actions">
          <button class="booth-manual-add-btn" type="button">${this.getMessage('add')}</button>
          <button class="booth-manual-add-cancel-btn" type="button">${this.getMessage('cancel')}</button>
        </div>
      </div>
    `;
    
    const modalOverlay = this.createModalBase(
      this.MODAL_IDS.MANUAL_ADD,
      this.getMessage('manualAdd'),
      content
    );
    
    this.managementWindow.appendChild(modalOverlay);
    
    // モーダル用のイベントリスナーを接続
    this.attachModalEventListeners(modalOverlay);
    
    // ID入力にフォーカス
    this.focusModalElement(modalOverlay, `#${this.ELEMENT_IDS.MANUAL_ITEM_ID}`);
  }

  hideManualAddModal() {
    this.hideModal(this.MODAL_IDS.MANUAL_ADD);
  }

  attachModalEventListeners(modal) {
    this.attachCommonModalEventListeners(modal, () => this.hideManualAddModal());
    
    // 追加ボタン
    const addBtn = this.getModalElement(modal, this.MODAL_SELECTORS.ADD);
    if (addBtn) {
      addBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.handleModalManualAdd();
      });
    }
    
    // エンターキーサポート
    const idInput = this.getCachedElement(this.ELEMENT_IDS.MANUAL_ITEM_ID);
    const nameInput = this.getCachedElement(this.ELEMENT_IDS.MANUAL_ITEM_NAME);
    
    [idInput, nameInput].forEach(input => {
      if (input) {
        input.addEventListener('keypress', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            this.handleModalManualAdd();
          }
        });
      }
    });
  }

  async handleModalManualAdd() {
    window.debugLogger?.log('UIManager: Modal manual add item requested');
    
    try {
      const idInput = this.getCachedElement(this.ELEMENT_IDS.MANUAL_ITEM_ID);
      const nameInput = this.getCachedElement(this.ELEMENT_IDS.MANUAL_ITEM_NAME);
      
      if (!idInput || !nameInput) {
        this.showNotification(this.getMessage('enterItemId'));
        return;
      }

      const itemId = idInput.value.trim();
      const itemName = nameInput.value.trim();

      // バリデーション
      if (!this.validateManualInput(itemId, itemName, idInput, nameInput)) {
        return;
      }

      const storageManager = this.validateStorageManager();
      if (!storageManager) return;

      // アイテムが既に存在するかチェック
      const existingItem = await storageManager.getItem(itemId);
      if (existingItem) {
        this.showValidationError(this.getMessage('itemIdAlreadyExists', { id: itemId }), idInput);
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
        this.handleItemSaveSuccess(itemId, itemName, idInput, nameInput, itemData);
      } else {
        this.showNotificationWithTimeout(this.getMessage('itemSaveFailed'));
      }

    } catch (error) {
      window.errorHandler?.handleUIError(error, 'modal-manual-add', 'item-addition');
      this.showNotificationWithTimeout(this.getMessage('itemAddError'));
    }
  }

  handleSectionToggle(header) {
    const sectionId = header.getAttribute('data-section');
    const itemsList = this.getCachedElement(`${sectionId}-items`);
    const toggleIcon = header.querySelector(`.${this.CSS_CLASSES.SECTION_TOGGLE}`);
    
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
    
    window.debugLogger?.log(`UIManager: Section ${sectionId} ${isCollapsed ? 'expanded' : 'collapsed'}`);
  }

  /**
   * セクションのアイテム数を更新するヘルパーメソッド
   */
  updateSectionCounts() {
    const allSections = [...this.SECTIONS, ...this.TAG_SECTIONS];
    allSections.forEach(sectionId => {
      const itemsList = this.getCachedElement(`${sectionId}-items`);
      const countElement = this.getCachedElement(`${sectionId}-count`);
      
      if (itemsList && countElement) {
        const itemCount = itemsList.querySelectorAll(`.${this.CSS_CLASSES.BOOTH_ITEM}`).length;
        countElement.textContent = itemCount;
      }
    });
  }

  /**
   * エンティティ用ボタンHTMLを生成するヘルパーメソッド
   * @param {string} entityType - 'item' または 'tag'
   * @param {string} sectionId - セクションID
   * @param {Object} entityData - エンティティデータ
   * @returns {string} ボタンHTML
   */
  generateEntityButtons(entityType, sectionId, entityData) {
    const dataTypeAttr = entityType === 'tag' ? ' data-type="tag"' : '';
    const baseSectionId = sectionId.replace('-tags', '');
    
    if (baseSectionId === 'excluded') {
      // 除外: 復元ボタンと常に除外ボタンを表示
      return `
        <button class="${this.CSS_CLASSES.RESTORE_BTN}"${dataTypeAttr} data-original-category="${entityData.previousCategory || 'unsaved'}">${this.getMessage('restore')}</button>
        <button class="${this.CSS_CLASSES.PERMANENTLY_EXCLUDE_BTN}"${dataTypeAttr}>${this.getMessage('alwaysExclude')}</button>
      `;
    } else if (baseSectionId === 'permanentlyExcluded') {
      // 常に除外: 復元ボタンのみ表示
      return `
        <button class="${this.CSS_CLASSES.RESTORE_BTN}"${dataTypeAttr} data-original-category="${entityData.previousCategory || 'unsaved'}">${this.getMessage('restore')}</button>
      `;
    } else if (baseSectionId === 'unsaved' && entityType === 'tag') {
      // 新規タグ: 除外ボタンと常に除外ボタンを表示
      return `
        <button class="${this.CSS_CLASSES.EXCLUDE_BTN}"${dataTypeAttr} data-target="excluded">${this.getMessage('exclude')}</button>
        <button class="${this.CSS_CLASSES.PERMANENTLY_EXCLUDE_BTN}"${dataTypeAttr}>${this.getMessage('alwaysExclude')}</button>
      `;
    } else {
      // 保存済み・新規アイテム: 除外ボタンのみ表示
      return `
        <button class="${this.CSS_CLASSES.EXCLUDE_BTN}"${dataTypeAttr} data-target="excluded">${this.getMessage('exclude')}</button>
      `;
    }
  }

  /**
   * 汎用エンティティイベントリスナー設定
   * @param {string} entityType - 'item' または 'tag'
   * @param {HTMLElement} entityEl - エンティティ要素
   */
  attachEntityEventListeners(entityType, entityEl) {
    const config = this.ENTITY_CONFIG[entityType];
    const entityId = entityEl.getAttribute(config.idAttr);
    
    // 名前入力
    const nameInput = entityEl.querySelector(`.${this.CSS_CLASSES.ITEM_NAME}`);
    if (nameInput) {
      nameInput.addEventListener('input', (e) => {
        this.handleEntityNameEdit(entityType, entityId, e.target.value);
      });
    }

    // 除外ボタン
    const excludeBtn = entityEl.querySelector(`.${this.CSS_CLASSES.EXCLUDE_BTN}`);
    if (excludeBtn) {
      excludeBtn.addEventListener('click', () => {
        let currentCategory = this.extractCategoryFromElement(entityEl);
        if (entityType === 'tag') {
          currentCategory = currentCategory.replace('-tags', '');
        }
        this.handleEntityExclude(entityType, entityId, currentCategory);
      });
    }

    // 常に除外ボタン
    const permanentlyExcludeBtn = entityEl.querySelector(`.${this.CSS_CLASSES.PERMANENTLY_EXCLUDE_BTN}`);
    if (permanentlyExcludeBtn) {
      permanentlyExcludeBtn.addEventListener('click', () => {
        this.handleEntityPermanentlyExclude(entityType, entityId);
      });
    }

    // 復元ボタン
    const restoreBtn = entityEl.querySelector(`.${this.CSS_CLASSES.RESTORE_BTN}`);
    if (restoreBtn) {
      restoreBtn.addEventListener('click', (e) => {
        const originalCategory = e.target.getAttribute('data-original-category');
        this.handleEntityRestore(entityType, entityId, originalCategory);
      });
    }
  }

  addItemToSection(sectionId, itemData) {
    const section = this.getCachedElement(`${sectionId}-items`);
    if (!section) return;

    const itemEl = document.createElement('div');
    itemEl.className = this.CSS_CLASSES.BOOTH_ITEM;
    itemEl.setAttribute('data-item-id', itemData.id);
    
    const buttonsHtml = this.generateEntityButtons('item', sectionId, itemData);
    const itemUrl = this.createBoothUrl(itemData.id);
    
    itemEl.innerHTML = `
      <div class="${this.CSS_CLASSES.ITEM_MAIN}">
        <input type="text" class="${this.CSS_CLASSES.ITEM_NAME}" value="${itemData.name || ''}" placeholder="${this.getMessage('itemName')}">
        <div class="${this.CSS_CLASSES.ITEM_URL}">
          <a href="${itemUrl}" target="_blank" class="${this.CSS_CLASSES.URL_LINK}">${itemUrl}</a>
        </div>
      </div>
      <div class="booth-item-actions">
        ${buttonsHtml}
      </div>
    `;

    this.attachEntityEventListeners('item', itemEl);
    section.appendChild(itemEl);
    this.updateSectionCounts();
  }

  addTagToSection(sectionId, tagData) {
    const section = this.getCachedElement(`${sectionId}-items`);
    if (!section) return;

    const tagEl = document.createElement('div');
    tagEl.className = this.CSS_CLASSES.BOOTH_ITEM;
    tagEl.setAttribute('data-tag-id', tagData.id);
    
    const buttonsHtml = this.generateEntityButtons('tag', sectionId, tagData);
    
    tagEl.innerHTML = `
      <div class="${this.CSS_CLASSES.ITEM_MAIN}">
        <input type="text" class="${this.CSS_CLASSES.ITEM_NAME}" value="${tagData.name || ''}" placeholder="${this.getMessage('tagName') || 'Tag Name'}">
      </div>
      <div class="booth-item-actions">
        ${buttonsHtml}
      </div>
    `;

    this.attachEntityEventListeners('tag', tagEl);
    section.appendChild(tagEl);
    this.updateSectionCounts();
  }

  /**
   * タグをフェッチして表示する（初回のみ）
   */
  async fetchAndDisplayTags() {
    try {
      const storageManager = this.validateStorageManager();
      if (!storageManager) return;

      // タグセクションをクリア
      this.TAG_SECTIONS.forEach(section => {
        const container = this.getCachedElement(`${section}-items`);
        if (container) {
          container.innerHTML = '';
        }
      });

      // ページタグを取得して表示
      const { tagsToFetch } = await (window.pageParser || new PageParser()).fetchTagsFromPage();
      const storedTags = await storageManager.getAllTags();
      
      tagsToFetch.forEach(tag => {
        const stored = storedTags[tag.id];
        const tagToDisplay = stored ? stored : { ...tag, category: 'unsaved' };
        const category = tagToDisplay.category || 'unsaved';
        const sectionId = `${category}-tags`;
        this.addTagToSection(sectionId, tagToDisplay);
      });
      
      this.tagsFetched = true;
      window.debugLogger?.log('UIManager: Tags fetched and displayed');
    } catch (error) {
      window.errorHandler?.handleUIError(error, 'fetch-and-display-tags', 'tag-fetch');
    }
  }

  /**
   * アイテムをフェッチして表示する
   */
  async fetchAndDisplayItems() {
    try {
      const storageManager = this.validateStorageManager();
      if (!storageManager) return;

      // アイテムセクションをクリア
      this.SECTIONS.forEach(section => {
        const container = this.getCachedElement(`${section}-items`);
        if (container) {
          container.innerHTML = '';
        }
      });

      // ページアイテムを取得して表示
      if (this.currentItemId) {
        const pageItemIds = await this.getPageItemIds();
        const pageItems = await storageManager.getItemsForCurrentPage(this.currentItemId);
        
        Object.values(pageItems).forEach(item => {
          if (pageItemIds.has(item.id)) {
            const category = item.category || 'unsaved';
            this.addItemToSection(category, item);
          }
        });
      }
      
      window.debugLogger?.log('UIManager: Items fetched and displayed');
    } catch (error) {
      window.errorHandler?.handleUIError(error, 'fetch-and-display-items', 'item-fetch');
    }
  }

  async refreshItemDisplay() {
    try {
      const storageManager = this.validateStorageManager();
      if (!storageManager) return;

      // 現在のタブに応じてリフレッシュ
      if (this.currentTab === 'tags') {
        await this.fetchAndDisplayTags();
      } else {
        await this.fetchAndDisplayItems();
      }
      
      window.debugLogger?.log('UIManager: Display refreshed for current tab');
    } catch (error) {
      window.errorHandler?.handleUIError(error, 'refresh-item-display', 'display-refresh');
    }
  }
}