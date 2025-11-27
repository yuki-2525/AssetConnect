// booth_order.js

// Debug logging function
let debugMode = false;

// Initialize debug mode from storage
chrome.storage.local.get(['debugMode'], (result) => {
    debugMode = result.debugMode || false;
});

// Listen for debug mode changes
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'debugModeChanged') {
        debugMode = request.debugMode;
        debugLog('Debug mode changed to:', debugMode);
    }
});

function debugLog(...args) {
    if (debugMode) {
        console.log('[ORDER DEBUG]', ...args);
    }
}

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

// ダウンロード情報を抽出するヘルパー関数
function getDownloadInfo(downloadButton) {
  const url = downloadButton.dataset.href;
  
  // フォールバックデータを初期化
  let fileName = "何らかの理由でデータを取得できませんでした。作者に報告してください。";
  let title = "何らかの理由でデータを取得できませんでした。作者に報告してください。";
  let boothID = "unknown";
  let itemUrl = "https://discord.gg/6gvucjC4FE";

  // クリックされたリンクが含まれる .legacy-list-item を取得
  const legacyItem = downloadButton.closest('.legacy-list-item');
  if (legacyItem) {
    // ファイル名は <b>要素 に入っている
    const fileNameElement = legacyItem.querySelector('b');
    if (fileNameElement) {
      fileName = fileNameElement.textContent.trim();
    } else {
      debugLog("Order: File name element not found");
    }
  } else {
    debugLog("Order: legacy-list-item not found");
  }

  // この .legacy-list-item が属する .sheet を探す
  const sheet = downloadButton.closest('.sheet');

  if (sheet) {
    const productLink = sheet.querySelector('b a.nav[href*="/items/"]');
    if (productLink) {
      title = productLink.textContent.trim();
      itemUrl = productLink.href;
      const idMatch = /\/items\/(\d+)/.exec(itemUrl);
      boothID = idMatch ? idMatch[1] : "unknown";
    } else {
      debugLog("Order: productLink (title link) not found - using fallback data");
    }
  } else {
    debugLog("Order: sheet not found - using fallback data");
  }

  return { url, fileName, title, boothID, itemUrl };
}

// 履歴を保存するヘルパー関数
function saveDownloadHistory(info) {
    return new Promise((resolve) => {
        const timestamp = formatDate(new Date());
        const newEntry = {
            title: info.title,
            boothID: info.boothID,
            filename: info.fileName,
            timestamp: timestamp,
            url: info.itemUrl,
            free: false,
            registered: false
        };

        debugLog('Order: Created download entry:', newEntry);

        // 既存の "downloadHistory" から、同じ BOOTHID と filename のエントリを除外してから追加
        chrome.storage.local.get("downloadHistory", function (result) {
            let history = result.downloadHistory || [];
            const originalLength = history.length;
            history = history.filter(entry => !(entry.boothID === newEntry.boothID && entry.filename === newEntry.filename));
            const filteredCount = originalLength - history.length;
            if (filteredCount > 0) {
                debugLog(`Order: Removed ${filteredCount} duplicate entries`);
            }
            history.push(newEntry);
            debugLog(`Order: Saving to downloadHistory, total entries: ${history.length}`);
            chrome.storage.local.set({ downloadHistory: history }, resolve);
        });
    });
}

document.addEventListener('click', function (e) {
  // ダウンロードリンク（"https://booth.pm/downloadables/" で始まるもの）を検知
  // 形式: .js-download-button (data-href属性を持つ)
  const downloadButton = e.target.closest('.js-download-button[data-href^="https://booth.pm/downloadables/"]');
  
  if (!downloadButton) return;

  const url = downloadButton.dataset.href;

  debugLog('Order: Download link detected:', url);

  // ページ遷移を防ぐ
  e.preventDefault();
  e.stopPropagation();

  const info = getDownloadInfo(downloadButton);

  saveDownloadHistory(info).then(() => {
      debugLog('Order: Download history saved, redirecting to:', url);
      window.location.href = url;
  });
}, true);

// 一括ダウンロードボタンを追加する関数
function addDownloadAllButtons() {
    // 商品シートを取得
    const sheets = document.querySelectorAll('.sheet');
    
    sheets.forEach(sheet => {
        // 既にボタンが追加されているかチェック
        if (sheet.querySelector('.asset-connect-download-all')) return;

        const buttons = sheet.querySelectorAll('.js-download-button[data-href^="https://booth.pm/downloadables/"]');
        if (buttons.length < 2) return;

        // 挿入位置を探す (ダウンロードリストのコンテナ)
        const listContainer = sheet.querySelector('.list.list--collapse');
        if (!listContainer) return;

        // ボタンコンテナを作成
        const btnContainer = document.createElement('div');
        btnContainer.className = 'mt-16 mb-16 flex justify-end asset-connect-download-all';
        // BOOTHのスタイルに合わせるためのマージン調整
        btnContainer.style.marginBottom = '10px';
        
        // 独自のボタンを作成
        const newBtn = document.createElement('button');
        newBtn.type = 'button';
        newBtn.textContent = '一括ダウンロード';
        
        // スタイルを適用
        Object.assign(newBtn.style, {
            backgroundColor: '#475569', // Slate-600
            color: '#ffffff',
            border: 'none',
            borderRadius: '24px',
            padding: '8px 20px',
            fontSize: '14px',
            fontWeight: 'bold',
            cursor: 'pointer',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
            transition: 'all 0.2s',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            lineHeight: '1.5'
        });

        // ホバー効果
        newBtn.onmouseover = () => {
            if (!newBtn.disabled) newBtn.style.backgroundColor = '#334155'; // Slate-700
        };
        newBtn.onmouseout = () => {
            if (!newBtn.disabled) newBtn.style.backgroundColor = '#475569';
        };
        
        newBtn.onclick = async (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            if (!confirm(`${buttons.length}個のファイルを一括ダウンロードしますか？\n(ポップアップブロックが有効な場合、許可してください)`)) return;
            
            newBtn.disabled = true;
            newBtn.style.opacity = '0.7';
            newBtn.style.cursor = 'wait';
            const originalText = newBtn.textContent;
            newBtn.textContent = '処理中...';
            
            try {
                for (const button of buttons) {
                    const info = getDownloadInfo(button);
                    await saveDownloadHistory(info);
                    
                    // iframeを使用してダウンロード
                    const iframe = document.createElement('iframe');
                    iframe.style.display = 'none';
                    iframe.src = info.url;
                    document.body.appendChild(iframe);
                    
                    // サーバー負荷軽減のため少し待機
                    await new Promise(r => setTimeout(r, 1500));
                    
                    // iframeは残しておいてもいいが、掃除したほうがいいかも？
                    setTimeout(() => {
                        if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
                    }, 60000);
                }
            } catch (err) {
                console.error(err);
                alert('エラーが発生しました: ' + err.message);
            } finally {
                newBtn.disabled = false;
                newBtn.style.opacity = '1';
                newBtn.style.cursor = 'pointer';
                newBtn.textContent = originalText;
            }
        };

        btnContainer.appendChild(newBtn);
        
        // リストの直前に挿入
        listContainer.parentNode.insertBefore(btnContainer, listContainer);
    });
}

// ページ読み込み完了時に実行
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', addDownloadAllButtons);
} else {
    addDownloadAllButtons();
}