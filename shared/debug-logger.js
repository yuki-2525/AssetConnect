class DebugLogger {
  constructor() {
    this.debugMode = false;
    this.initializeDebugMode();
    
    // Listen for debug mode changes from background script
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === 'debugModeChanged') {
        this.debugMode = request.debugMode;
        this.log('Debug mode changed to:', this.debugMode);
      }
    });
  }

  async initializeDebugMode() {
    try {
      const result = await chrome.storage.local.get(['debugMode']);
      this.debugMode = result.debugMode || false;
    } catch (error) {
      // Silently fail if storage is not available
      this.debugMode = false;
    }
  }

  log(...args) {
    if (this.debugMode) {
      console.log('[AC DEBUG]', ...args);
    }
  }

  error(...args) {
    if (this.debugMode) {
      console.error('[AC DEBUG ERROR]', ...args);
    }
  }

  warn(...args) {
    if (this.debugMode) {
      console.warn('[AC DEBUG WARN]', ...args);
    }
  }

  info(...args) {
    if (this.debugMode) {
      console.info('[AC DEBUG INFO]', ...args);
    }
  }

  // Get current debug mode state
  isDebugMode() {
    return this.debugMode;
  }
}

// Create global debug logger instance
window.debugLogger = new DebugLogger();