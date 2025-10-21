// booth_gift.js

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
        console.log('[GIFT DEBUG]', ...args);
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

    debugLog('Gift: Download link detected:', downloadLink.href);

    // ページ遷移を防ぐ
    e.preventDefault();

    // フォールバックデータを初期化
    let fileName = "何らかの理由でデータを取得できませんでした。作者に報告してください。";
    let title = "何らかの理由でデータを取得できませんでした。作者に報告してください。";
    let boothID = "unknown";
    let itemUrl = "https://forms.gle/otwhoXKzc5EQQDti8";

    // クリックされたリンクが含まれる要素を取得
    const downloadContainer = downloadLink.closest('.desktop\\:flex');
    if (downloadContainer) {
        // ファイル名は text-14 クラスを持つ要素に入っている
        const fileNameElement = downloadContainer.querySelector('.text-14');
        if (fileNameElement) {
            fileName = fileNameElement.textContent.trim();
        } else {
            debugLog("Gift: File name element not found - using fallback data");
        }
    } else {
        debugLog("Gift: download container not found - using fallback data");
    }

    // 商品タイトルとURLを取得
    const titleLink = document.querySelector('a[href^="https://"][href*="/items/"]');
    if (titleLink) {
        title = titleLink.textContent.trim();
        itemUrl = titleLink.href;
        const idMatch = itemUrl.match(/\/items\/(\d+)/);
        if (idMatch && idMatch[1]) {
            boothID = idMatch[1];
        } else {
            debugLog("Gift: BOOTHID not found in titleLink.href - using fallback data");
        }
    } else {
        debugLog("Gift: title link not found - using fallback data");
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

    debugLog('Gift: Created download entry:', newEntry);

    // 既存の "downloadHistory" から、同じ BOOTHID と filename のエントリを除外してから追加
    chrome.storage.local.get("downloadHistory", function (result) {
        let history = result.downloadHistory || [];
        const originalLength = history.length;
        history = history.filter(entry => !(entry.boothID === newEntry.boothID && entry.filename === newEntry.filename));
        const filteredCount = originalLength - history.length;
        if (filteredCount > 0) {
            debugLog(`Gift: Removed ${filteredCount} duplicate entries`);
        }
        history.push(newEntry);
        debugLog(`Gift: Saving to downloadHistory, total entries: ${history.length}`);
        chrome.storage.local.set({ downloadHistory: history }, function () {
            debugLog('Gift: Download history saved, redirecting to:', downloadLink.href);
            window.location.href = downloadLink.href;
        });
    });
});
