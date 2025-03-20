// booth_shoppage.js

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

  // タイトルの取得：h2.font-bold または summary 内の h2 を試す
  let titleElement = document.querySelector('h2.font-bold');
  if (!titleElement) {
    titleElement = document.querySelector('div.summary h2');
  }
  const title = titleElement ? titleElement.textContent.trim() : '不明';

  // boothID の取得：URL から /items/数字 を抽出
  const idMatch = window.location.href.match(/\/items\/(\d+)/);
  const boothID = idMatch ? idMatch[1] : null;
  if (!boothID) {
    console.error("Shop: boothID not found");
    return;
  }
  
  // ファイル名の取得：ダウンロードリンクの title 属性を利用
  const fileName = downloadLink.getAttribute('title') || '不明';

  const timestamp = formatDate(new Date());

  const newEntry = {
    title: title,
    boothID: boothID,
    filename: fileName,
    timestamp: timestamp,
    url: window.location.href,
    free: true
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
