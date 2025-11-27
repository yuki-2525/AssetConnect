// booth_library.js

// Debug logging function
let debugMode = false;

// Initialize debug mode from storage
chrome.storage.local.get(['debugMode'], (result) => {
    debugMode = result.debugMode || false;
});

// Listen for debug mode changes
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'debugModeChanged') {
        debugMode = request.debugMode;
        debugLog('Debug mode changed to:', debugMode);
    }
});

function debugLog(...args) {
    if (debugMode) {
        console.log('[LIBRARY DEBUG]', ...args);
    }
}

// ヘルパー関数：日付を "YYYY-MM-DD HH:mm:ss" 形式にフォーマット
function formatDate(date) {
  const pad = n => n.toString().padStart(2, '0');
  return date.getFullYear() + '-' +
    pad(date.getMonth() + 1) + '-' +
    pad(date.getDate()) + ' ' +
    pad(date.getHours()) + ':' +
    pad(date.getMinutes()) + ':' +
    pad(date.getSeconds());
}

document.addEventListener('click', function (e) {
  // 形式: .js-download-button (data-href属性を持つ)
  const downloadButton = e.target.closest('.js-download-button[data-href^="https://booth.pm/downloadables/"]');
  
  if (!downloadButton) return;

  const url = downloadButton.dataset.href;
  debugLog('Library: Download link detected:', url);

  // ページ遷移を防ぐ
  e.preventDefault();
  e.stopPropagation();

  // フォールバックデータを初期化
  let fileName = "何らかの理由でデータを取得できませんでした。作者に報告してください。";
  let title = "何らかの理由でデータを取得できませんでした。作者に報告してください。";
  let boothID = "unknown";
  let itemUrl = "https://forms.gle/otwhoXKzc5EQQDti8";

  // ダウンロードエントリの取得（ファイル名が含まれる部分）
  const downloadEntry = downloadButton.closest('.mt-16.desktop\\:flex');
  if (downloadEntry) {
    // ファイル名の取得
    const fileNameElement = downloadEntry.querySelector('div.min-w-0.break-words.whitespace-pre-line > div.text-14');
    if (fileNameElement) {
      fileName = fileNameElement.textContent.trim();
    } else {
      debugLog("Library: File name element not found - using fallback data");
    }
  } else {
    debugLog("Library: Download entry not found - using fallback data");
  }

  // 外側コンテナの取得
  const outerContainer = downloadButton.closest('.mb-16.bg-white.p-16');
  if (outerContainer) {
    // タイトルの取得：外側コンテナ内の指定要素から取得
    const titleElement = outerContainer.querySelector('.font-bold.text-16.break-all');
    if (titleElement) {
      title = titleElement.textContent.trim();
    } else {
      debugLog("Library: Title element not found - using fallback data");
    }

    // BOOTHID の取得：外側コンテナ内のアイテムリンクから抽出
    const itemLink = outerContainer.querySelector('a[href*="/items/"]');
    if (itemLink) {
      const idMatch = itemLink.href.match(/\/items\/(\d+)/);
      if (idMatch && idMatch[1]) {
        boothID = idMatch[1];
        itemUrl = itemLink.href;
      } else {
        debugLog("Library: BOOTHID not found in item link - using fallback data");
      }
    } else {
      debugLog("Library: Item link not found - using fallback data");
    }
  } else {
    debugLog("Library: Outer container not found - using fallback data");
  }

  const timestamp = formatDate(new Date());

  const newEntry = {
    title: title,
    boothID: boothID,
    filename: fileName,
    timestamp: timestamp,
    url: itemUrl,
    free: false,
    registered: false
  };

  debugLog('Library: Created download entry:', newEntry);

  // 既存の "downloadHistory" に同一 BOOTHID & filename があれば除外して追加
  chrome.storage.local.get("downloadHistory", function (result) {
    let history = result.downloadHistory || [];
    const originalLength = history.length;
    history = history.filter(entry => !(entry.boothID === newEntry.boothID && entry.filename === newEntry.filename));
    const filteredCount = originalLength - history.length;
    if (filteredCount > 0) {
        debugLog(`Library: Removed ${filteredCount} duplicate entries`);
    }
    history.push(newEntry);
    debugLog(`Library: Saving to downloadHistory, total entries: ${history.length}`);
    chrome.storage.local.set({ downloadHistory: history }, function () {
      debugLog('Library: Download history saved, redirecting to:', url);
      window.location.href = url;
    });
  });
}, true);
