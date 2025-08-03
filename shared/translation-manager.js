/**
 * 共有翻訳マネージャー
 * 拡張機能全体で翻訳システムを一元管理するシングルトンクラス
 */
class TranslationManager {
  constructor() {
    if (TranslationManager.instance) {
      return TranslationManager.instance;
    }

    this.currentTranslations = {};              // 現在の翻訳データ
    this.currentLanguage = 'ja';                // 現在の言語設定
    this.SUPPORTED_LANGUAGES = ['ja', 'en', 'ko']; // サポート対象言語
    this.isInitialized = false;                 // 初期化フラグ
    this.initializationPromise = null;          // 初期化Promise

    TranslationManager.instance = this;
  }

  /**
   * シングルトンインスタンスを取得
   * @returns {TranslationManager} インスタンス
   */
  static getInstance() {
    if (!TranslationManager.instance) {
      TranslationManager.instance = new TranslationManager();
    }
    return TranslationManager.instance;
  }

  /**
   * 翻訳システムを初期化
   * 複数回呼び出されても安全（初回のみ実行）
   * @returns {Promise} 初期化完了のPromise
   */
  async initialize() {
    if (this.isInitialized) {
      return Promise.resolve();
    }

    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = this._performInitialization();
    return this.initializationPromise;
  }

  /**
   * 実際の初期化処理を実行
   * @private
   */
  async _performInitialization() {
    try {
      // 保存された言語設定を読み込み
      const result = await chrome.storage.local.get(['selectedLanguage']);
      const selectedLang = result.selectedLanguage || chrome.i18n.getUILanguage().substring(0, 2);
      this.currentLanguage = this.SUPPORTED_LANGUAGES.includes(selectedLang) ? selectedLang : 'ja';
      
      await this.loadTranslations(this.currentLanguage);
      this.isInitialized = true;
    } catch (error) {
      console.error('Translation initialization failed:', error);
      // フォールバック: 日本語を使用
      this.currentLanguage = 'ja';
      this.currentTranslations = {};
      this.isInitialized = true;
    }
  }

  /**
   * 翻訳データを読み込み
   * @param {string} lang - 言語コード
   * @returns {Promise<Object>} 翻訳データ
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
   * 現在の言語コードを取得
   * @returns {string} 言語コード
   */
  getCurrentLanguage() {
    return this.currentLanguage;
  }

  /**
   * 言語を変更
   * @param {string} lang - 新しい言語コード
   * @returns {Promise} 言語変更完了のPromise
   */
  async changeLanguage(lang) {
    if (!this.SUPPORTED_LANGUAGES.includes(lang)) {
      throw new Error(`Unsupported language: ${lang}`);
    }

    if (this.currentLanguage === lang) {
      return; // 既に同じ言語の場合は何もしない
    }

    await this.loadTranslations(lang);
    
    // 言語設定を保存
    await chrome.storage.local.set({ selectedLanguage: lang });
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
   * 初期化状態を取得
   * @returns {boolean} 初期化済みかどうか
   */
  isReady() {
    return this.isInitialized;
  }

  /**
   * UI要素の翻訳テキストを更新
   * data-i18n属性を持つ要素に翻訳テキストを設定
   */
  updateUITexts() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      const message = this.getMessage(key);
      if (message) {
        if (el.tagName === 'TITLE') {
          // titleタグの場合、span要素があれば更新、なければ全体を更新
          const span = el.querySelector('span[data-i18n]');
          if (span) {
            span.textContent = message;
          } else {
            el.textContent = `AssetConnect - ${message}`;
          }
        } else {
          el.textContent = message;
        }
      }
    });
  }
}

// グローバル関数として便利なヘルパーを提供
window.translationManager = TranslationManager.getInstance();

/**
 * 翻訳マネージャーを初期化するヘルパー関数
 * @returns {Promise} 初期化完了のPromise
 */
async function initializeTranslations() {
  return await window.translationManager.initialize();
}

/**
 * 翻訳メッセージを取得するヘルパー関数
 * @param {string} key - 翻訳キー
 * @param {Object} replacements - プレースホルダー置換用のオブジェクト
 * @returns {string} 翻訳されたメッセージ
 */
function getMessage(key, replacements = {}) {
  return window.translationManager.getMessage(key, replacements);
}

/**
 * UI要素の翻訳テキストを更新するヘルパー関数
 */
function updateUITexts() {
  return window.translationManager.updateUITexts();
}