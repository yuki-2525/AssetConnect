// booth_library.js
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
  
    // 外側コンテナの取得（ショップ情報などが含まれる部分）
    const outerContainer = downloadLink.closest('div.mb-16');
    if (!outerContainer) {
      console.error("Library: Outer container not found");
      return;
    }
    
    // タイトルの取得：外側コンテナ内で、クラス属性に "text-text-default", "font-bold", "typography-16", "mb-8", "break-all" を含む要素
    const titleElement = outerContainer.querySelector(
      'div[class*="text-text-default"][class*="font-bold"][class*="typography-16"][class*="mb-8"][class*="break-all"]'
    );
    const title = titleElement ? titleElement.textContent.trim() : '不明';
  
    // boothID の取得：外側コンテナ内の a[href*="/items/"] から抽出
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
  
    console.log('Library Page - title:', title);
    console.log('Library Page - fileName:', fileName);
    console.log('Library Page - boothID:', boothID);
  
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
        console.log("Library entry saved:", newEntry);
        // 保存完了後、元のダウンロードURLへ遷移
        window.location.href = downloadLink.href;
      });
    });
  });
  