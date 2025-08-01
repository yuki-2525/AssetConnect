class BoothJsonClient {
  constructor() {
    this.baseUrl = 'https://booth.pm';
  }

  async fetchItemData(itemUrl) {
    try {
      const jsonUrl = this.convertToJsonUrl(itemUrl);
      window.debugLogger?.log('Fetching JSON from:', jsonUrl);
      
      // Try direct fetch first
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
        
        // Check if this is a CORS-related error that should not be reported as an error
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
      // Only report to error handler if it's not a CORS-related error
      const isCorsError = this.isCorsRelatedError(error.message);
      if (!isCorsError) {
        window.errorHandler?.handleNetworkError(error, itemUrl, 'GET');
      }
      return this.handleFetchError(error, itemUrl);
    }
  }

  convertToJsonUrl(itemUrl) {
    // Extract item ID from various BOOTH URL formats
    const itemId = this.extractItemId(itemUrl);
    if (!itemId) {
      // Fallback to original URL + .json if ID extraction fails
      if (itemUrl.endsWith('.json')) {
        return itemUrl;
      }
      if (itemUrl.endsWith('/')) {
        return itemUrl.slice(0, -1) + '.json';
      }
      return itemUrl + '.json';
    }
    
    // Always use the standardized booth.pm/ja/items/(id).json format
    return `https://booth.pm/ja/items/${itemId}.json`;
  }

  extractItemId(itemUrl) {
    // Match various BOOTH URL patterns
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

    // Check for common CORS/network errors that require background fetch
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

  async testConnection() {
    try {
      const testUrl = 'https://booth.pm/items/1.json';
      const response = await fetch(testUrl, { method: 'HEAD' });
      return {
        success: response.ok,
        status: response.status,
        available: true
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        available: false
      };
    }
  }
}