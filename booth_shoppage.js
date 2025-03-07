// booth_shoppage.js
document.addEventListener('click', function(e) {
  // ダウンロードリンク（https://booth.pm/downloadables/...）がクリックされたかを検出
  const downloadLink = e.target.closest('a[href^="https://booth.pm/downloadables/"]');
  if (!downloadLink) return;
  
  // ページ遷移を防ぐ
  e.preventDefault();

  // タイトルの取得
  // まず h2.font-bold を試す。例: <h2 class="font-bold leading-[32px] m-0 text-[24px] break-all">...</h2>
  let titleElement = document.querySelector('h2.font-bold');
  // フォールバック: summary 内の h2
  if (!titleElement) {
    titleElement = document.querySelector('div.summary h2');
  }
  const title = titleElement ? titleElement.textContent.trim() : '不明';

  // boothID の取得：URL から /items/数字 を抽出（どちらの形式にも対応）
  const idMatch = window.location.href.match(/\/items\/(\d+)/);
  const boothID = idMatch ? idMatch[1] : null;
  if (!boothID) {
    console.error("Shop: boothID not found");
    return;
  }
  
  // ファイル名の取得：ダウンロードリンクの title 属性を利用
  const fileName = downloadLink.getAttribute('title') || '不明';

  console.log('Shop Page - title:', title);
  console.log('Shop Page - fileName:', fileName);
  console.log('Shop Page - boothID:', boothID);

  // 新規エントリ作成
  const newEntry = {
    title: title,
    boothID: boothID,
    filename: fileName,
    timestamp: new Date().toISOString()
  };

  // 保存処理：既存の "downloadHistory" から同一 boothID & filename のエントリを削除してから追加
  chrome.storage.local.get("downloadHistory", function(result) {
    let history = result.downloadHistory || [];
    // 同一の boothID と filename があれば削除
    history = history.filter(entry => !(entry.boothID === newEntry.boothID && entry.filename === newEntry.filename));
    history.push(newEntry);
    chrome.storage.local.set({ downloadHistory: history }, function() {
      console.log("Library entry saved:", newEntry);
      // 保存完了後、元のダウンロードURLへ遷移
      window.location.href = downloadLink.href;
    });
  });
});
