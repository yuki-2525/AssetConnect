// background.js
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "navigate" && sender.tab && message.url) {
      chrome.tabs.update(sender.tab.id, { url: message.url });
    }
  });
  