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
    
    // ファイル名の取得: legacy-list-item 内の <b> 要素から抽出
    const legacyItem = downloadLink.closest('.legacy-list-item');
    if (!legacyItem) {
      console.error("Order: legacy-list-item not found");
      return;
    }
    const fileNameElement = legacyItem.querySelector('b');
    if (!fileNameElement) {
      console.error("Order: File name element not found");
      return;
    }
    const fileName = fileNameElement.textContent.trim();
    
    // 注文ページ上部のタイトルリンクから、タイトルと BoothID を取得
    const titleLink = document.querySelector('div.u-tpg-title4 a.nav');
    if (!titleLink) {
      console.error("Order: Title link not found");
      return;
    }
    const title = titleLink.textContent.trim();
    
    // BoothID の抽出（例："https://namekuji1337.booth.pm/items/6594498" から "6594498"）
    const idMatch = titleLink.href.match(/\/items\/(\d+)/);
    const boothID = idMatch ? idMatch[1] : null;
    if (!boothID) {
      console.error("Order: boothID not found");
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
      url: titleLink.href,
      free: false
    };
    
    // 既存の "downloadHistory" から、同じ boothID と filename のエントリを除外してから追加
    chrome.storage.local.get("downloadHistory", function(result) {
      let history = result.downloadHistory || [];
      history = history.filter(entry => !(entry.boothID === newEntry.boothID && entry.filename === newEntry.filename));
      history.push(newEntry);
      chrome.storage.local.set({ downloadHistory: history }, function() {
        console.log("Order entry saved:", newEntry);
        // ダウンロードリンクの URL に遷移
        window.location.href = downloadLink.href;
      });
    });
  });
  