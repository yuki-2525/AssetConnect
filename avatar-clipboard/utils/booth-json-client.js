/**
 * BOOTHアイテムの情報をJSON API経由で取得するクライアントクラス
 * アイテムURLをJSON API URLに変換し、アイテム名や情報を取得する
 */
class BoothJsonClient {
  constructor() {
    this.baseUrl = 'https://booth.pm'; // BOOTHのベースURL
    this.currentLanguage = null; // 言語設定（初期化前はnull）
    this.languageInitialized = false; // 言語初期化フラグ
    this.SUPPORTED_LANGUAGES = ['ja', 'en', 'ko']; // サポート対象言語
    this.initializeLanguage(); // 言語設定を初期化
  }

  /**
   * 現在の言語設定を初期化
   */
  async initializeLanguage() {
    try {
      const result = await chrome.storage.local.get(['selectedLanguage']);
      const selectedLang = result.selectedLanguage || chrome.i18n.getUILanguage().substring(0, 2);
      this.currentLanguage = this.SUPPORTED_LANGUAGES.includes(selectedLang) ? selectedLang : 'ja';
      this.languageInitialized = true;
    } catch (error) {
      console.error('Failed to initialize language for BoothJsonClient:', error);
      this.currentLanguage = 'ja'; // フォールバック
      this.languageInitialized = true;
    }
  }

  /**
   * 現在の言語設定が利用可能であることを保証
   */
  async ensureLanguageLoaded() {
    if (!this.languageInitialized) {
      await this.initializeLanguage();
    }
  }

  /**
   * 指定したアイテムURLからアイテムデータを取得する
   * @param {string} itemUrl - BOOTHアイテムのURL
   * @returns {Promise<Object>} 取得結果（success, name, errorなど）
   */
  async fetchItemData(itemUrl) {
    try {
      // 言語設定が読み込まれていることを確認
      await this.ensureLanguageLoaded();
      const jsonUrl = await this.convertToJsonUrl(itemUrl);
      window.debugLogger?.log('Fetching JSON from:', jsonUrl);
      
      // まず直接フェッチを試行
      let response;
      try {
        response = await fetch(jsonUrl, {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
          },
          mode: 'cors',
          credentials: 'omit'
        });
      } catch (fetchError) {
        window.debugLogger?.log('Direct fetch failed, will try background script:', fetchError.message);
        
        // エラーとして報告すべきでないCORS関連エラーかどうかをチェック
        const isCorsError = this.isCorsRelatedError(fetchError.message);
        
        return {
          success: false,
          error: fetchError.message,
          needsBackgroundFetch: true,
          originalUrl: itemUrl,
          isCorsError: isCorsError
        };
      }

      if (!response.ok) {
        window.debugLogger?.log(`HTTP ${response.status} for ${jsonUrl}, will try background script`);
        return {
          success: false,
          error: `HTTP ${response.status}: ${response.statusText}`,
          needsBackgroundFetch: true,
          originalUrl: itemUrl,
          isCorsError: false
        };
      }

      const jsonData = await response.json();
      return this.processJsonResponse(jsonData);

    } catch (error) {
      // CORS関連エラーでない場合のみエラーハンドラーに報告
      const isCorsError = this.isCorsRelatedError(error.message);
      if (!isCorsError) {
        window.errorHandler?.handleNetworkError(error, itemUrl, 'GET');
      }
      return this.handleFetchError(error, itemUrl);
    }
  }

  async convertToJsonUrl(itemUrl) {
    // 言語設定が利用可能であることを確認
    await this.ensureLanguageLoaded();
    
    // さまざまなBOOTH URLフォーマットからアイテムIDを抽出
    const itemId = this.extractItemId(itemUrl);
    if (!itemId) {
      // ID抽出に失敗した場合は元のURL + .jsonにフォールバック
      if (itemUrl.endsWith('.json')) {
        return itemUrl;
      }
      if (itemUrl.endsWith('/')) {
        return itemUrl.slice(0, -1) + '.json';
      }
      return itemUrl + '.json';
    }
    
    // 現在の言語設定に基づいて標準化されたbooth.pm/(lang)/items/(id).jsonフォーマットを使用
    return `https://booth.pm/${this.currentLanguage}/items/${itemId}.json`;
  }

  extractItemId(itemUrl) {
    // さまざまなBOOTH URLパターンにマッチ
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

  processJsonResponse(jsonData) {
    try {
      const itemName = this.extractItemName(jsonData);
      
      return {
        success: true,
        name: itemName,
        rawData: jsonData,
        extractedAt: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error processing JSON response:', error);
      return {
        success: false,
        error: 'Failed to extract item name from JSON response',
        rawData: jsonData
      };
    }
  }

  extractItemName(jsonData) {
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

  handleFetchError(error, originalUrl) {
    const errorResponse = {
      success: false,
      error: error.message,
      originalUrl: originalUrl,
      timestamp: new Date().toISOString()
    };

    // バックグラウンドフェッチが必要な一般的なCORS/ネットワークエラーをチェック
    const corsIndicators = [
      'CORS',
      'Failed to fetch',
      'Access to fetch',
      'No \'Access-Control-Allow-Origin\'',
      'Cross-Origin Request Blocked',
      'net::ERR_FAILED'
    ];

    const needsBackground = corsIndicators.some(indicator => 
      error.message.includes(indicator)
    );

    if (needsBackground) {
      errorResponse.suggestion = 'CORS/Network error - using background script';
      errorResponse.needsBackgroundFetch = true;
    } else if (error.message.includes('404')) {
      errorResponse.suggestion = 'Item not found or JSON endpoint unavailable';
    } else if (error.message.includes('403')) {
      errorResponse.suggestion = 'Access denied - may need authentication';
    }

    return errorResponse;
  }

  isCorsRelatedError(errorMessage) {
    const corsIndicators = [
      'CORS',
      'Failed to fetch',
      'Access to fetch',
      'Access-Control-Allow-Origin',
      'Cross-Origin Request Blocked',
      'net::ERR_FAILED',
      'TypeError: Failed to fetch'
    ];

    return corsIndicators.some(indicator => 
      errorMessage.includes(indicator)
    );
  }
}