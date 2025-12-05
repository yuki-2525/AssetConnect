// booth_library.js

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
        console.log('[LIBRARY DEBUG]', ...args);
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

  // ダウンロードエントリの取得（ファイル名が含まれる部分）
  const downloadEntry = downloadButton.closest('.mt-16.desktop\\:flex');
  if (downloadEntry) {
    // ファイル名の取得
    const fileNameElement = downloadEntry.querySelector('div.min-w-0.break-words.whitespace-pre-line > div.text-14');
    if (fileNameElement) {
      fileName = fileNameElement.textContent.trim();
    } else {
      debugLog("Library: File name element not found - using fallback data");
    }
  } else {
    debugLog("Library: Download entry not found - using fallback data");
  }

  // 外側コンテナの取得
  const outerContainer = downloadButton.closest('.mb-16.bg-white.p-16');
  if (outerContainer) {
    // タイトルの取得：外側コンテナ内の指定要素から取得
    const titleElement = outerContainer.querySelector('.font-bold.text-16.break-all');
    if (titleElement) {
      title = titleElement.textContent.trim();
    } else {
      debugLog("Library: Title element not found - using fallback data");
    }

    // BOOTHID の取得：外側コンテナ内のアイテムリンクから抽出
    const itemLink = outerContainer.querySelector('a[href*="/items/"]');
    if (itemLink) {
      const idMatch = itemLink.href.match(/\/items\/(\d+)/);
      if (idMatch && idMatch[1]) {
        boothID = idMatch[1];
        itemUrl = itemLink.href;
      } else {
        debugLog("Library: BOOTHID not found in item link - using fallback data");
      }
    } else {
      debugLog("Library: Item link not found - using fallback data");
    }
  } else {
    debugLog("Library: Outer container not found - using fallback data");
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

        debugLog('Library: Created download entry:', newEntry);

        // 既存の "downloadHistory" から、同じ BOOTHID と filename のエントリを除外してから追加
        chrome.storage.local.get("downloadHistory", function (result) {
            let history = result.downloadHistory || [];
            const originalLength = history.length;
            history = history.filter(entry => !(entry.boothID === newEntry.boothID && entry.filename === newEntry.filename));
            const filteredCount = originalLength - history.length;
            if (filteredCount > 0) {
                debugLog(`Library: Removed ${filteredCount} duplicate entries`);
            }
            history.push(newEntry);
            debugLog(`Library: Saving to downloadHistory, total entries: ${history.length}`);
            chrome.storage.local.set({ downloadHistory: history }, resolve);
        });
    });
}

document.addEventListener('click', function (e) {
  // 形式: .js-download-button (data-href属性を持つ)
  const downloadButton = e.target.closest('.js-download-button[data-href^="https://booth.pm/downloadables/"]');
  
  if (!downloadButton) return;

  const url = downloadButton.dataset.href;
  debugLog('Library: Download link detected:', url);

  // ページ遷移を防ぐ
  e.preventDefault();
  e.stopPropagation();

  const info = getDownloadInfo(downloadButton);

  saveDownloadHistory(info).then(() => {
      debugLog('Library: Download history saved, redirecting to:', url);
      window.location.href = url;
  });
}, true);

// 一括ダウンロードボタンを追加する関数
async function addDownloadAllButtons() {
    // 翻訳システムの初期化
    await initializeTranslations();

    // 商品コンテナを取得
    const itemContainers = document.querySelectorAll('.mb-16.bg-white.p-16');
    
    itemContainers.forEach(container => {
        // 既にボタンが追加されているかチェック
        if (container.querySelector('.asset-connect-download-all')) return;

        const buttons = container.querySelectorAll('.js-download-button[data-href^="https://booth.pm/downloadables/"]');
        if (buttons.length < 2) return;

        // 挿入位置を探す (ダウンロードリストのコンテナ)
        // ヘッダーの次の要素がダウンロードリストのコンテナになっているはず
        const header = container.querySelector('.border-b.border-border300');
        if (!header) return;
        
        const listContainer = header.nextElementSibling;
        if (!listContainer || !listContainer.classList.contains('mt-16')) return;

        // ボタンコンテナを作成
        const btnContainer = document.createElement('div');
        btnContainer.className = 'mt-16 mb-16 flex justify-end asset-connect-download-all';
        
        // 独自のボタンを作成（公式と区別するため独自スタイル）
        const newBtn = document.createElement('button');
        newBtn.type = 'button';
        newBtn.textContent = getMessage('downloadAllButton');
        
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
            
            if (!confirm(getMessage('downloadAllConfirm', { count: buttons.length }))) return;
            
            newBtn.disabled = true;
            newBtn.style.cursor = 'wait';
            const originalText = newBtn.textContent;
            
            let processedCount = 0;
            const totalCount = buttons.length;
            
            const updateProgress = () => {
                const percent = Math.round((processedCount / totalCount) * 100);
                newBtn.textContent = getMessage('downloadProcessingCount', { current: processedCount, total: totalCount });
                // 進捗バーとして背景グラデーションを使用 (Slate-700 for progress, Slate-600 for remaining)
                newBtn.style.background = `linear-gradient(to right, #334155 ${percent}%, #475569 ${percent}%)`;
            };
            
            updateProgress();
            
            try {
                for (const button of buttons) {
                    const info = getDownloadInfo(button);
                    await saveDownloadHistory(info);
                    
                    // iframeを使用してダウンロード
                    const iframe = document.createElement('iframe');
                    iframe.style.display = 'none';
                    iframe.src = info.url;
                    document.body.appendChild(iframe);
                    
                    processedCount++;
                    updateProgress();
                    
                    // サーバー負荷軽減のため少し待機
                    await new Promise(r => setTimeout(r, 500));
                    
                    // iframeは残しておいてもいいが、掃除したほうがいいかも？
                    setTimeout(() => {
                        if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
                    }, 60000);
                }
            } catch (err) {
                console.error(err);
                alert(getMessage('downloadError') + err.message);
            } finally {
                newBtn.disabled = false;
                newBtn.style.cursor = 'pointer';
                newBtn.style.background = '';
                newBtn.style.backgroundColor = '#475569';
                newBtn.textContent = originalText;
            }
        };

        btnContainer.appendChild(newBtn);
        
        // リストの先頭に挿入
        listContainer.insertBefore(btnContainer, listContainer.firstChild);
    });
}

// ページ読み込み完了時に実行
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', addDownloadAllButtons);
} else {
    addDownloadAllButtons();
}
