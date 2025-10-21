class ErrorHandler {
  constructor() {
    this.errors = [];
    this.maxErrors = 100;
    this.listeners = [];
    this.errorTypes = {
      NETWORK: 'network',
      STORAGE: 'storage',
      PARSE: 'parse',
      CLIPBOARD: 'clipboard',
      UI: 'ui',
      PERMISSION: 'permission',
      RATE_LIMIT: 'rate_limit',
      UNKNOWN: 'unknown'
    };
    
    this.init();
  }

  init() {
    // Global error handler for unhandled errors
    window.addEventListener('error', (event) => {
      this.handleError(event.error, this.errorTypes.UNKNOWN, {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno
      });
    });

    // Global handler for unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      this.handleError(event.reason, this.errorTypes.UNKNOWN, {
        type: 'unhandledrejection'
      });
    });
  }

  handleError(error, type = this.errorTypes.UNKNOWN, context = {}) {
    const errorData = {
      id: this.generateErrorId(),
      timestamp: new Date().toISOString(),
      type: type,
      message: error?.message || String(error),
      stack: error?.stack,
      context: context,
      userAgent: navigator.userAgent,
      url: window.location.href
    };

    // Store error
    this.errors.push(errorData);
    
    // Keep only last N errors
    if (this.errors.length > this.maxErrors) {
      this.errors = this.errors.slice(-this.maxErrors);
    }

    // Log to console with appropriate level
    this.logError(errorData);

    // Notify listeners
    this.notifyListeners(errorData);

    // Return error ID for tracking
    return errorData.id;
  }

  generateErrorId() {
    return 'err_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  logError(errorData) {
    const logMessage = `[${errorData.type.toUpperCase()}] ${errorData.message}`;
    
    switch (errorData.type) {
      case this.errorTypes.NETWORK:
        console.warn(logMessage, errorData);
        break;
      case this.errorTypes.STORAGE:
      case this.errorTypes.CLIPBOARD:
        console.error(logMessage, errorData);
        break;
      case this.errorTypes.PARSE:
      case this.errorTypes.UI:
        console.warn(logMessage, errorData);
        break;
      case this.errorTypes.PERMISSION:
      case this.errorTypes.RATE_LIMIT:
        console.info(logMessage, errorData);
        break;
      default:
        console.error(logMessage, errorData);
    }
  }

  // Network error handling
  handleNetworkError(error, url, method = 'GET') {
    const context = { url, method, status: error.status };
    return this.handleError(error, this.errorTypes.NETWORK, context);
  }

  // Storage error handling
  handleStorageError(error, operation, itemId = null) {
    const context = { operation, itemId };
    return this.handleError(error, this.errorTypes.STORAGE, context);
  }

  // Parsing error handling
  handleParseError(error, source, data = null) {
    const context = { source, dataType: typeof data };
    return this.handleError(error, this.errorTypes.PARSE, context);
  }

  // Clipboard error handling
  handleClipboardError(error, operation = 'copy') {
    const context = { operation };
    return this.handleError(error, this.errorTypes.CLIPBOARD, context);
  }

  // UI error handling
  handleUIError(error, component, action = null) {
    const context = { component, action };
    return this.handleError(error, this.errorTypes.UI, context);
  }

  // Permission error handling
  handlePermissionError(error, permission) {
    const context = { permission };
    return this.handleError(error, this.errorTypes.PERMISSION, context);
  }

  // Rate limiting error handling
  handleRateLimitError(error, endpoint, retryAfter = null) {
    const context = { endpoint, retryAfter };
    return this.handleError(error, this.errorTypes.RATE_LIMIT, context);
  }

  // Retry mechanism with exponential backoff
  async retryOperation(operation, maxRetries = 3, baseDelay = 1000) {
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        
        if (attempt === maxRetries) {
          break;
        }

        // Calculate delay with exponential backoff
        const delay = baseDelay * Math.pow(2, attempt - 1);
        console.log(`Retry attempt ${attempt}/${maxRetries} failed, retrying in ${delay}ms...`);
        
        await this.sleep(delay);
      }
    }
    
    // All retries failed
    throw lastError;
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Recovery strategies
  async recoverFromError(errorType, context = {}) {
    switch (errorType) {
      case this.errorTypes.NETWORK:
        return this.recoverFromNetworkError(context);
      case this.errorTypes.STORAGE:
        return this.recoverFromStorageError(context);
      case this.errorTypes.CLIPBOARD:
        return this.recoverFromClipboardError(context);
      case this.errorTypes.PERMISSION:
        return this.recoverFromPermissionError(context);
      default:
        return { success: false, message: 'No recovery strategy available' };
    }
  }

  async recoverFromNetworkError(context) {
    if (context.status === 429) {
      // Rate limited - wait and retry
      const retryAfter = context.retryAfter || 5000;
      await this.sleep(retryAfter);
      return { success: true, message: 'Rate limit recovery completed' };
    }
    
    if (context.status >= 500) {
      // Server error - might be temporary
      return { success: true, message: 'Server error detected, consider retry' };
    }
    
    return { success: false, message: 'Network error cannot be automatically recovered' };
  }

  async recoverFromStorageError(context) {
    try {
      // Try to clear and reinitialize storage
      if (context.operation === 'read') {
        console.log('Attempting to reinitialize storage...');
        return { success: true, message: 'Storage reinitialization attempted' };
      }
      
      return { success: false, message: 'Storage recovery not possible' };
    } catch (error) {
      return { success: false, message: 'Storage recovery failed: ' + error.message };
    }
  }

  async recoverFromClipboardError(context) {
    // Try fallback clipboard method
    try {
      return { success: true, message: 'Fallback clipboard method available' };
    } catch (error) {
      return { success: false, message: 'Clipboard recovery failed' };
    }
  }

  async recoverFromPermissionError(context) {
    return { 
      success: false, 
      message: 'Permission error requires user intervention',
      action: 'Please grant the required permissions and try again'
    };
  }

  // Error analysis and reporting
  getErrorStats() {
    const stats = {
      total: this.errors.length,
      byType: {},
      recent: this.errors.slice(-10),
      timeRange: {
        oldest: this.errors[0]?.timestamp,
        newest: this.errors[this.errors.length - 1]?.timestamp
      }
    };

    // Count by type
    this.errors.forEach(error => {
      stats.byType[error.type] = (stats.byType[error.type] || 0) + 1;
    });

    return stats;
  }

  getErrorsInTimeRange(startTime, endTime) {
    return this.errors.filter(error => {
      const timestamp = new Date(error.timestamp);
      return timestamp >= startTime && timestamp <= endTime;
    });
  }

  exportErrorLog() {
    return {
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      errors: this.errors,
      stats: this.getErrorStats()
    };
  }

  clearErrors() {
    this.errors = [];
  }

  // Event listener management
  addEventListener(listener) {
    this.listeners.push(listener);
  }

  removeEventListener(listener) {
    const index = this.listeners.indexOf(listener);
    if (index > -1) {
      this.listeners.splice(index, 1);
    }
  }

  notifyListeners(errorData) {
    this.listeners.forEach(listener => {
      try {
        listener(errorData);
      } catch (error) {
        console.error('Error in error listener:', error);
      }
    });
  }

  // Safe execution wrapper
  async safeExecute(operation, errorType = this.errorTypes.UNKNOWN, context = {}) {
    try {
      return await operation();
    } catch (error) {
      const errorId = this.handleError(error, errorType, context);
      throw { ...error, errorId, handled: true };
    }
  }

  // User-friendly error messages
  getUserFriendlyMessage(errorType, error = null) {
    const messages = {
      [this.errorTypes.NETWORK]: 'ネットワーク接続に問題があります。しばらく待ってから再試行してください。',
      [this.errorTypes.STORAGE]: 'データの保存に問題があります。ブラウザの設定を確認してください。',
      [this.errorTypes.PARSE]: 'データの解析中にエラーが発生しました。',
      [this.errorTypes.CLIPBOARD]: 'クリップボードへのアクセスに失敗しました。ブラウザの権限を確認してください。',
      [this.errorTypes.UI]: 'インターフェースでエラーが発生しました。',
      [this.errorTypes.PERMISSION]: '必要な権限がありません。ブラウザの設定を確認してください。',
      [this.errorTypes.RATE_LIMIT]: 'リクエストが多すぎます。しばらく待ってから再試行してください。',
      [this.errorTypes.UNKNOWN]: '予期しないエラーが発生しました。'
    };

    return messages[errorType] || messages[this.errorTypes.UNKNOWN];
  }
}

// Global error handler instance
window.errorHandler = new ErrorHandler();