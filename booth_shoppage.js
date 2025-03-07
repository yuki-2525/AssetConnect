// booth_shoppage.js
document.addEventListener('click', function(e) {
    const downloadLink = e.target.closest('a[href^="https://booth.pm/downloadables/"]');
    if (!downloadLink) return;
    
    // ページ遷移を防ぐ
    e.preventDefault();
  
    // タイトルの取得：ショップページの構造上、<h2 class="font-bold ..."> がタイトルと想定
    const titleElement = document.querySelector('h2.font-bold');
    const title = titleElement ? titleElement.textContent.trim() : '不明';
  
    // boothID の取得：URL から抽出
    const idMatch = window.location.href.match(/\/items\/(\d+)/);
    const boothID = idMatch ? idMatch[1] : null;
    if (!boothID) {
      console.error("Shop: boothID not found");
      return;
    }
    
    // ファイル名の取得：ダウンロードボタンの title 属性を利用
    const fileName = downloadLink.getAttribute('title') || '不明';
  
    console.log('Shop Page - title:', title);
    console.log('Shop Page - fileName:', fileName);
    console.log('Shop Page - boothID:', boothID);
  
    const newEntry = {
      title: title,
      boothID: boothID,
      filename: fileName,
      timestamp: new Date().toISOString()
    };
  
    // 保存処理：既存の "downloadHistory" に追記
    chrome.storage.local.get("downloadHistory", function(result) {
      const history = result.downloadHistory || [];
      history.push(newEntry);
      chrome.storage.local.set({ downloadHistory: history }, function() {
        console.log("Shop entry saved:", newEntry);
        // 保存完了後、元のダウンロードURLへ遷移
        window.location.href = downloadLink.href;
      });
    });
  });
  