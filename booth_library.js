// booth_library.js

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

document.addEventListener('click', function(e) {
  const downloadLink = e.target.closest('a[href^="https://booth.pm/downloadables/"]');
  if (!downloadLink) return;
  
  // ページ遷移を防ぐ
  e.preventDefault();

  // ダウンロードエントリの取得（ファイル名が含まれる部分）
  const downloadEntry = downloadLink.closest('div.desktop\\:flex.desktop\\:justify-between.desktop\\:items-center');
  if (!downloadEntry) {
    console.error("Library: Download entry not found");
    return;
  }
  
  // ファイル名の取得
  const fileNameElement = downloadEntry.querySelector('div.min-w-0.break-words.whitespace-pre-line > div.typography-14');
  if (!fileNameElement) {
    console.error("Library: File name element not found");
    return;
  }
  const fileName = fileNameElement.textContent.trim();

  // 外側コンテナの取得
  const outerContainer = downloadLink.closest('div.mb-16');
  if (!outerContainer) {
    console.error("Library: Outer container not found");
    return;
  }
  
  // タイトルの取得：外側コンテナ内の指定要素から取得
  const titleElement = outerContainer.querySelector(
    'div[class*="text-text-default"][class*="font-bold"][class*="typography-16"][class*="mb-8"][class*="break-all"]'
  );
  const title = titleElement ? titleElement.textContent.trim() : '不明';

  // boothID の取得：外側コンテナ内のアイテムリンクから抽出
  const itemLink = outerContainer.querySelector('a[href*="/items/"]');
  if (!itemLink) {
    console.error("Library: Item link not found");
    return;
  }
  const idMatch = itemLink.href.match(/\/items\/(\d+)/);
  const boothID = idMatch ? idMatch[1] : null;
  if (!boothID) {
    console.error("Library: boothID not found");
    return;
  }

  const timestamp = formatDate(new Date());

  const newEntry = {
    title: title,
    boothID: boothID,
    filename: fileName,
    timestamp: timestamp,
    url: itemLink.href,
    free: false
  };

  // 既存の "downloadHistory" に同一 boothID & filename があれば除外して追加
  chrome.storage.local.get("downloadHistory", function(result) {
    let history = result.downloadHistory || [];
    history = history.filter(entry => !(entry.boothID === newEntry.boothID && entry.filename === newEntry.filename));
    history.push(newEntry);
    chrome.storage.local.set({ downloadHistory: history }, function() {
      window.location.href = downloadLink.href;
    });
  });
});

