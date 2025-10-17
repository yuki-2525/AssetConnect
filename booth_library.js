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

document.addEventListener('click', function (e) {
  const downloadLink = e.target.closest('a[href^="https://booth.pm/downloadables/"]');
  if (!downloadLink) return;

  // ページ遷移を防ぐ
  e.preventDefault();

  // フォールバックデータを初期化
  let fileName = "何らかの理由でデータを取得できませんでした。作者に報告してください。";
  let title = "何らかの理由でデータを取得できませんでした。作者に報告してください。";
  let boothID = "unknown";
  let itemUrl = "https://forms.gle/otwhoXKzc5EQQDti8";

  // ダウンロードエントリの取得（ファイル名が含まれる部分）
  const downloadEntry = downloadLink.closest('.mt-16.desktop\\:flex');
  if (downloadEntry) {
    // ファイル名の取得
    const fileNameElement = downloadEntry.querySelector('div.min-w-0.break-words.whitespace-pre-line > div.text-14');
    if (fileNameElement) {
      fileName = fileNameElement.textContent.trim();
    } else {
      console.warn("Library: File name element not found - using fallback data");
    }
  } else {
    console.warn("Library: Download entry not found - using fallback data");
  }

  // 外側コンテナの取得
  const outerContainer = downloadLink.closest('div.mb-16');
  if (outerContainer) {
    // タイトルの取得：外側コンテナ内の指定要素から取得
    const titleElement = outerContainer.querySelector('.font-bold.text-16.break-all');
    if (titleElement) {
      title = titleElement.textContent.trim();
    } else {
      console.warn("Library: Title element not found - using fallback data");
    }

    // BOOTHID の取得：外側コンテナ内のアイテムリンクから抽出
    const itemLink = outerContainer.querySelector('a[href*="/items/"]');
    if (itemLink) {
      const idMatch = itemLink.href.match(/\/items\/(\d+)/);
      if (idMatch && idMatch[1]) {
        boothID = idMatch[1];
        itemUrl = itemLink.href;
      } else {
        console.warn("Library: BOOTHID not found in item link - using fallback data");
      }
    } else {
      console.warn("Library: Item link not found - using fallback data");
    }
  } else {
    console.warn("Library: Outer container not found - using fallback data");
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

  // 既存の "downloadHistory" に同一 BOOTHID & filename があれば除外して追加
  chrome.storage.local.get("downloadHistory", function (result) {
    let history = result.downloadHistory || [];
    history = history.filter(entry => !(entry.boothID === newEntry.boothID && entry.filename === newEntry.filename));
    history.push(newEntry);
    chrome.storage.local.set({ downloadHistory: history }, function () {
      window.location.href = downloadLink.href;
    });
  });
});

