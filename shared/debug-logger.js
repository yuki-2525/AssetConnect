class DebugLogger {
  constructor() {
    this.debugMode = false;
    // Initialize loggers based on default debugMode
    this._updateLoggers();
    this.initializeDebugMode();

    // Listen for debug mode changes from background script
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === 'debugModeChanged') {
        this.debugMode = request.debugMode;
        this._updateLoggers();
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
    this._updateLoggers();
  }

  _updateLoggers() {
    if (this.debugMode) {
      // Use bind to preserve the original call site in the console
      this.log = console.log.bind(window.console, '[AC DEBUG]');
      this.error = console.error.bind(window.console, '[AC DEBUG ERROR]');
      this.warn = console.warn.bind(window.console, '[AC DEBUG WARN]');
      this.info = console.info.bind(window.console, '[AC DEBUG INFO]');
    } else {
      // No-op functions when debug mode is off
      const noop = () => { };
      this.log = noop;
      this.error = noop;
      this.warn = noop;
      this.info = noop;
    }
  }

  // Get current debug mode state
  isDebugMode() {
    return this.debugMode;
  }
}

// Create global debug logger instance
window.debugLogger = new DebugLogger();