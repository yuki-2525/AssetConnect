// booth_shoppage.js

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
        console.log('[SHOP DEBUG]', ...args);
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
function getDownloadInfo(downloadLink) {
  const url = downloadLink.href;
  
  // フォールバックデータを初期化
  let title = "何らかの理由でデータを取得できませんでした。作者に報告してください。";
  let boothID = "unknown";
  let itemUrl = "https://discord.gg/6gvucjC4FE";
  let fileName = "何らかの理由でデータを取得できませんでした。作者に報告してください。";

  // タイトルの取得：h2.font-bold または summary 内の h2 を試す
  let titleElement = document.querySelector('h2.font-bold');
  if (!titleElement) {
    titleElement = document.querySelector('div.summary h2');
  }
  if (titleElement) {
    title = titleElement.textContent.trim();
  } else {
    debugLog("Shop: Title element not found - using fallback data");
  }

  // boothID の取得：URL から /items/数字 を抽出
  const idMatch = window.location.href.match(/\/items\/(\d+)/);
  if (idMatch && idMatch[1]) {
    boothID = idMatch[1];
    itemUrl = window.location.href;
  } else {
    debugLog("Shop: BOOTHID not found - using fallback data");
  }

  // ファイル名の取得：ダウンロードリンクの title 属性を利用
  const fileNameFromTitle = downloadLink.getAttribute('title');
  if (fileNameFromTitle) {
    fileName = fileNameFromTitle;
  } else {
    debugLog("Shop: File name not found - using fallback data");
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
            free: true,
            registered: false
        };

        debugLog('Shop: Created download entry:', newEntry);

        // 既存の "downloadHistory" から、同じ BOOTHID と filename のエントリを除外してから追加
        chrome.storage.local.get("downloadHistory", function (result) {
            let history = result.downloadHistory || [];
            const originalLength = history.length;
            history = history.filter(entry => !(entry.boothID === newEntry.boothID && entry.filename === newEntry.filename));
            const filteredCount = originalLength - history.length;
            if (filteredCount > 0) {
                debugLog(`Shop: Removed ${filteredCount} duplicate entries`);
            }
            history.push(newEntry);
            debugLog(`Shop: Saving to downloadHistory, total entries: ${history.length}`);
            chrome.storage.local.set({ downloadHistory: history }, resolve);
        });
    });
}

document.addEventListener('click', function (e) {
  const downloadLink = e.target.closest('a[href^="https://booth.pm/downloadables/"]');
  if (!downloadLink) return;

  debugLog('Shop: Download link detected:', downloadLink.href);

  // ページ遷移を防ぐ
  e.preventDefault();

  const info = getDownloadInfo(downloadLink);

  saveDownloadHistory(info).then(() => {
      debugLog('Shop: Download history saved, redirecting to:', downloadLink.href);
      window.location.href = downloadLink.href;
  });
});

// 一括ダウンロードボタンを追加する関数
function addDownloadAllButtons() {
    // バリエーションアイテムを取得
    const variationItems = document.querySelectorAll('.variation-item');
    
    variationItems.forEach(item => {
        // 既にボタンが追加されているかチェック
        if (item.querySelector('.asset-connect-download-all')) return;

        const buttons = item.querySelectorAll('a[href^="https://booth.pm/downloadables/"]');
        if (buttons.length < 2) return;

        // 挿入位置を探す (variation-cart内)
        const cartContainer = item.querySelector('.variation-cart');
        if (!cartContainer) return;

        // ボタンコンテナを作成
        const btnContainer = document.createElement('div');
        btnContainer.className = 'mt-4 mb-4 flex justify-end asset-connect-download-all';
        btnContainer.style.width = '100%';
        btnContainer.style.marginBottom = '8px';
        
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
            justifyContent: 'center',
            gap: '8px',
            lineHeight: '1.5',
            width: '100%', // 幅いっぱいに
            marginTop: '8px'
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
        
        // カートコンテナの先頭に挿入
        cartContainer.insertBefore(btnContainer, cartContainer.firstChild);
    });
}

// ページ読み込み完了時に実行
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', addDownloadAllButtons);
} else {
    addDownloadAllButtons();
}
