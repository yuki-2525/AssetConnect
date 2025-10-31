// booth_order.js

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
        console.log('[ORDER DEBUG]', ...args);
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
  // ダウンロードリンク（"https://booth.pm/downloadables/" で始まるもの）を検知
  const downloadLink = e.target.closest('a[href^="https://booth.pm/downloadables/"]');
  if (!downloadLink) return;

  debugLog('Order: Download link detected:', downloadLink.href);

  // ページ遷移を防ぐ
  e.preventDefault();

  // クリックされたリンクが含まれる .legacy-list-item を取得
  const legacyItem = downloadLink.closest('.legacy-list-item');
  if (!legacyItem) {
    debugLog("Order: legacy-list-item not found");
    return;
  }

  // ファイル名は <b>要素 に入っている
  const fileNameElement = legacyItem.querySelector('b');
  if (!fileNameElement) {
    debugLog("Order: File name element not found");
    return;
  }
  const fileName = fileNameElement.textContent.trim();

  // この .legacy-list-item が属する .sheet を探す
  // → そのシート内のタイトルリンク (.u-tpg-title4 a.nav) を取得
  const sheet = downloadLink.closest('.sheet');
  let title = "何らかの理由でデータを取得できませんでした。作者に報告してください。";
  let boothID = "unknown";
  let itemUrl = "https://forms.gle/otwhoXKzc5EQQDti8";

  if (sheet) {
    const productLink = sheet.querySelector('b a.nav[href*="/items/"]');
    if (productLink) {
      title = productLink.textContent.trim();
      itemUrl = productLink.href;
      const idMatch = itemUrl.match(/\/items\/(\d+)/);
      boothID = idMatch ? idMatch[1] : "unknown";
    } else {
      debugLog("Order: productLink (title link) not found - using fallback data");
    }
  } else {
    debugLog("Order: sheet not found - using fallback data");
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

  debugLog('Order: Created download entry:', newEntry);

  // 既存の "downloadHistory" から、同じ BOOTHID と filename のエントリを除外してから追加
  chrome.storage.local.get("downloadHistory", function (result) {
    let history = result.downloadHistory || [];
    const originalLength = history.length;
    history = history.filter(entry => !(entry.boothID === newEntry.boothID && entry.filename === newEntry.filename));
    const filteredCount = originalLength - history.length;
    if (filteredCount > 0) {
        debugLog(`Order: Removed ${filteredCount} duplicate entries`);
    }
    history.push(newEntry);
    debugLog(`Order: Saving to downloadHistory, total entries: ${history.length}`);
    chrome.storage.local.set({ downloadHistory: history }, function () {
      debugLog('Order: Download history saved, redirecting to:', downloadLink.href);
      window.location.href = downloadLink.href;
    });
  });
});