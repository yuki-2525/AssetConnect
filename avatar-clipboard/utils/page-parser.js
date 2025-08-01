class PageParser {
  constructor() {
    this.boothUrlPatterns = [
      /https?:\/\/(?:[\w-]+\.)?booth\.pm\/(?:[\w-]+\/)?items\/(\d+)/g,
      /https?:\/\/booth\.pm\/(?:[\w-]+\/)?items\/(\d+)/g
    ];
  }

  extractBoothItemUrls() {
    const foundUrls = new Map();
    
    // Determine target selector based on URL pattern
    const currentUrl = window.location.href;
    let targetSelector;
    
    if (currentUrl.match(/^https?:\/\/booth\.pm\/.*\/items\/\d+/)) {
      // booth.pm/*/items/(id) pattern: use div.u-pt-600.flex
      targetSelector = 'div.u-pt-600.flex';
    } else if (currentUrl.match(/^https?:\/\/.*\.booth\.pm\/items\/\d+/)) {
      // *.booth.pm/items/(id) pattern: use div.main-info-column
      targetSelector = 'div.main-info-column';
    } else {
      // Default fallback
      targetSelector = 'div.main-info-column';
    }
    
    window.debugLogger?.log(`Using selector: ${targetSelector} for URL: ${currentUrl}`);
    const targetSection = document.querySelector(targetSelector);
    
    if (!targetSection) {
      window.debugLogger?.log(`Target section with selector "${targetSelector}" not found`);
      return [];
    }

    window.debugLogger?.log('Found target section, searching for BOOTH URLs...');

    // Get text content from the target section
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

    // Also check href attributes in links within the target section
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

  // These methods are no longer used since we only search in the target div
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
    // Remove query parameters and fragments for cleaner URLs
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
    
    // Filter out the current page's item if we're on a BOOTH page
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
}