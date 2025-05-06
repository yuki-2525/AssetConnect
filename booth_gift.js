// booth_gift.js

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

    // ページ遷移を防ぐ
    e.preventDefault();

    // クリックされたリンクが含まれる要素を取得
    const downloadContainer = downloadLink.closest('.desktop\\:flex');
    if (!downloadContainer) {
        console.error("Gift: download container not found");
        return;
    }

    // ファイル名は typography-14 クラスを持つ要素に入っている
    const fileNameElement = downloadContainer.querySelector('.typography-14');
    if (!fileNameElement) {
        console.error("Gift: File name element not found");
        return;
    }
    const fileName = fileNameElement.textContent.trim();

    // 商品タイトルとURLを取得
    const titleLink = document.querySelector('a[href^="https://"][href*="/items/"]');
    if (!titleLink) {
        console.error("Gift: title link not found");
        return;
    }

    const title = titleLink.textContent.trim();
    const itemUrl = titleLink.href;
    const idMatch = itemUrl.match(/\/items\/(\d+)/);
    const boothID = idMatch ? idMatch[1] : null;
    if (!boothID) {
        console.error("Gift: BOOTHID not found in titleLink.href:", itemUrl);
        return;
    }

    const timestamp = formatDate(new Date());

    const newEntry = {
        title: title,
        boothID: boothID,
        filename: fileName,
        timestamp: timestamp,
        url: itemUrl,
        free: false
    };

    // 既存の "downloadHistory" から、同じ BOOTHID と filename のエントリを除外してから追加
    chrome.storage.local.get("downloadHistory", function (result) {
        let history = result.downloadHistory || [];
        history = history.filter(entry => !(entry.boothID === newEntry.boothID && entry.filename === newEntry.filename));
        history.push(newEntry);
        chrome.storage.local.set({ downloadHistory: history }, function () {
            window.location.href = downloadLink.href;
        });
    });
});
