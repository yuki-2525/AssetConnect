// booth_order.js

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
  // ダウンロードリンク（"https://booth.pm/downloadables/" で始まるもの）を検知
  const downloadLink = e.target.closest('a[href^="https://booth.pm/downloadables/"]');
  if (!downloadLink) return;
  
  // ページ遷移を防ぐ
  e.preventDefault();
  
  // クリックされたリンクが含まれる .legacy-list-item を取得
  const legacyItem = downloadLink.closest('.legacy-list-item');
  if (!legacyItem) {
    console.error("Order: legacy-list-item not found");
    return;
  }
  
  // ファイル名は <b>要素 に入っている
  const fileNameElement = legacyItem.querySelector('b');
  if (!fileNameElement) {
    console.error("Order: File name element not found");
    return;
  }
  const fileName = fileNameElement.textContent.trim();
  
  // この .legacy-list-item が属する .sheet を探す
  // → そのシート内のタイトルリンク (.u-tpg-title4 a.nav) を取得
  const sheet = downloadLink.closest('.sheet');
  if (!sheet) {
    console.error("Order: sheet not found");
    return;
  }
  const productLink = sheet.querySelector('.u-tpg-title4 a.nav');
  if (!productLink) {
    console.error("Order: productLink (title link) not found");
    return;
  }
  
  // タイトルと BoothID を取得
  const title = productLink.textContent.trim();
  const itemUrl = productLink.href;
  const idMatch = itemUrl.match(/\/items\/(\d+)/);
  const boothID = idMatch ? idMatch[1] : null;
  if (!boothID) {
    console.error("Order: boothID not found in productLink.href:", itemUrl);
    return;
  }
  
  console.log('Order Page - title:', title);
  console.log('Order Page - fileName:', fileName);
  console.log('Order Page - boothID:', boothID);
  
  const timestamp = formatDate(new Date());
  
  const newEntry = {
    title: title,
    boothID: boothID,
    filename: fileName,
    timestamp: timestamp,
    url: itemUrl,
    free: false
  };
  
  // 既存の "downloadHistory" から、同じ boothID と filename のエントリを除外してから追加
  chrome.storage.local.get("downloadHistory", function(result) {
    let history = result.downloadHistory || [];
    history = history.filter(entry => !(entry.boothID === newEntry.boothID && entry.filename === newEntry.filename));
    history.push(newEntry);
    chrome.storage.local.set({ downloadHistory: history }, function() {
      console.log("Order entry saved:", newEntry);
      // ダウンロードリンクの URL に遷移（実際のダウンロードを実行）
      window.location.href = downloadLink.href;
    });
  });
});
