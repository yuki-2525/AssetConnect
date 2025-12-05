/**
 * BOOTHアイテムページからアイテムURLを抽出・解析するクラス
 * ページ内のテキストやリンクからBOOTHアイテムのURLを検出し、アイテムIDを抽出する
 */
class PageParser {
  constructor() {
    // BOOTHアイテムURLのマッチングパターン
    this.boothUrlPatterns = [
      /https?:\/\/(?:[\w-]+\.)?booth\.pm\/(?:[\w-]+\/)?items\/(\d+)/g, // サブドメイン対応
      /https?:\/\/booth\.pm\/(?:[\w-]+\/)?items\/(\d+)/g                // メインドメイン
    ];
  }

  /**
   * ページからBOOTHアイテムURLを抽出する
   * @returns {Array} 見つかったアイテムURLの配列
   */
  extractBoothItemUrls() {
    const foundUrls = new Map();
    
    // URLパターンに基づいてターゲットセレクタを決定
    const currentUrl = window.location.href;
    let targetSelector;
    
    if (currentUrl.match(/^https?:\/\/booth\.pm\/.*\/items\/\d+/)) {
      // booth.pm/*/items/(id) パターン: div.u-pt-600.flexを使用
      targetSelector = 'div.u-pt-600.flex';
    } else if (currentUrl.match(/^https?:\/\/.*\.booth\.pm\/items\/\d+/)) {
      // *.booth.pm/items/(id) パターン: div.main-info-columnを使用
      targetSelector = 'div.main-info-column';
    } else {
      // デフォルトフォールバック
      targetSelector = 'div.main-info-column';
    }
    
    window.debugLogger?.log(`Using selector: ${targetSelector} for URL: ${currentUrl}`);
    const targetSection = document.querySelector(targetSelector);
    
    if (!targetSection) {
      window.debugLogger?.log(`Target section with selector "${targetSelector}" not found`);
      return [];
    }

    window.debugLogger?.log('Found target section, searching for BOOTH URLs...');

    // ターゲットセクションからテキストコンテンツを取得
    const text = targetSection.textContent || targetSection.innerText || '';
    const urls = this.findBoothUrlsInText(text);
    
    urls.forEach(urlData => {
      if (!foundUrls.has(urlData.itemId)) {
        foundUrls.set(urlData.itemId, {
          ...urlData,
          source: 'main-info-column',
          sourceElement: targetSection
        });
      }
    });

    // ターゲットセクション内のリンクのhref属性もチェック
    const linkElements = targetSection.querySelectorAll('a[href*="booth.pm"]');
    linkElements.forEach(link => {
      const href = link.href;
      const urls = this.findBoothUrlsInText(href);
      
      urls.forEach(urlData => {
        if (!foundUrls.has(urlData.itemId)) {
          foundUrls.set(urlData.itemId, {
            ...urlData,
            source: 'main-info-column-link',
            sourceElement: link,
            linkText: link.textContent?.trim()
          });
        }
      });
    });

    return Array.from(foundUrls.values());
  }

  // ターゲットdiv内でのみ検索するようになったため、これらのメソッドは使用されなくなった
  getDescriptionElements() {
    return [];
  }

  getContentElements() {
    return [];
  }

  getLinkElements() {
    return [];
  }

  findBoothUrlsInText(text) {
    const urls = [];
    
    this.boothUrlPatterns.forEach(pattern => {
      let match;
      const regex = new RegExp(pattern.source, pattern.flags);
      
      while ((match = regex.exec(text)) !== null) {
        const fullUrl = match[0];
        const itemId = match[1];
        
        if (itemId && !urls.some(u => u.itemId === itemId)) {
          urls.push({
            itemId: itemId,
            url: fullUrl,
            cleanUrl: this.cleanUrl(fullUrl)
          });
        }
      }
    });

    return urls;
  }

  cleanUrl(url) {
    // よりクリーンなURLのためにクエリパラメータとフラグメントを削除
    try {
      const urlObj = new URL(url);
      return `${urlObj.protocol}//${urlObj.host}${urlObj.pathname}`;
    } catch (error) {
      return url;
    }
  }

  async parsePageForBoothItems() {
    window.debugLogger?.log('Parsing page for BOOTH item URLs...');
    
    const foundItems = this.extractBoothItemUrls();
    window.debugLogger?.log(`Found ${foundItems.length} BOOTH item URLs on page`);
    
    // BOOTHページにいる場合は現在のページのアイテムをフィルタリングで除外
    const currentUrl = window.location.href;
    const currentItemId = this.getCurrentPageItemId();
    
    const externalItems = foundItems.filter(item => {
      return item.itemId !== currentItemId;
    });

    window.debugLogger?.log(`External BOOTH items found: ${externalItems.length}`);
    
    return {
      totalFound: foundItems.length,
      externalItems: externalItems,
      currentPageItem: currentItemId
    };
  }

  getCurrentPageItemId() {
    const currentUrl = window.location.href;
    for (const pattern of this.boothUrlPatterns) {
      const regex = new RegExp(pattern.source, 'i');
      const match = currentUrl.match(regex);
      if (match) {
        return match[1];
      }
    }
    return null;
  }

  async fetchItemsFromPage() {
    const parseResult = await this.parsePageForBoothItems();
    const itemsToFetch = [];

    for (const item of parseResult.externalItems) {
      try {
        window.debugLogger?.log(`Processing item: ${item.itemId} from ${item.url}`);
        
        itemsToFetch.push({
          id: item.itemId,
          url: item.cleanUrl,
          source: item.source,
          linkText: item.linkText || '',
          category: 'unsaved'
        });
        
      } catch (error) {
        console.error(`Error processing item ${item.itemId}:`, error);
      }
    }

    return {
      parseResult,
      itemsToFetch
    };
  }

  getCurrentPageTagId() {
      const match = window.location.href.match(/\/tags\/([^/?#]+)/);
      return match ? decodeURIComponent(match[1]) : null;
  }

  /**
   * ページのJSONデータからタグを取得する
   * @returns {Promise<Array>} タグ情報の配列
   */
  async fetchTagsFromJson() {
    const itemId = this.getCurrentPageItemId();
    if (!itemId) return [];

    try {
      // 現在のURLをベースにJSON URLを構築
      let url = window.location.href.split(/[?#]/)[0];
      if (!url.endsWith('.json')) {
        url += '.json';
      }

      window.debugLogger?.log(`Fetching tags from JSON: ${url}`);
      
      const response = await fetch(url);
      if (!response.ok) {
        return [];
      }

      const data = await response.json();
      if (!data.tags || !Array.isArray(data.tags)) {
        return [];
      }

      return data.tags.map(tag => ({
        id: tag.name,
        name: tag.name,
        url: tag.url,
        cleanUrl: `${window.location.origin}/tags/${encodeURIComponent(tag.name)}`
      }));

    } catch (error) {
      window.debugLogger?.log('Error fetching tags from JSON:', error);
      return [];
    }
  }

  async fetchTagsFromPage() {
    // JSONからタグを取得（アイテムページの場合）
    const tags = await this.fetchTagsFromJson();
    
    const currentTagId = this.getCurrentPageTagId();
    
    const externalTags = tags.filter(tag => tag.id !== currentTagId);
    
    const tagsToFetch = externalTags.map(tag => ({
        id: tag.id,
        name: tag.name,
        url: tag.cleanUrl || tag.url,
        category: 'unsaved'
    }));

    return {
        totalFound: tags.length,
        tagsToFetch
    };
  }
}