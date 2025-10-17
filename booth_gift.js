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
            console.warn("Gift: File name element not found - using fallback data");
        }
    } else {
        console.warn("Gift: download container not found - using fallback data");
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
            console.warn("Gift: BOOTHID not found in titleLink.href - using fallback data");
        }
    } else {
        console.warn("Gift: title link not found - using fallback data");
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
