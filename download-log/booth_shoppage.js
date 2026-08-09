// booth_shoppage.js

const debugLog = (...args) => window.debugLogger?.log('[SHOP]', ...args);

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
            registered: info.registered === true
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

window.assetConnectDownloadAdapter = {
  getInfo: getDownloadInfo,
  save: saveDownloadHistory
};

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
async function addDownloadAllButtons() {
    // 翻訳システムの初期化
    await initializeTranslations();

    // バリエーションアイテムを取得
    const variationItems = document.querySelectorAll('.variation-item');
    const buttons = document.querySelectorAll(
        '.variation-item a[href^="https://booth.pm/downloadables/"]'
    );
    if (variationItems.length === 0 || buttons.length < 2) return;
    if (document.querySelector('.asset-connect-download-all')) return;

    const item = variationItems[0];

        // 挿入位置を探す（バリエーション一覧）
        const variationsContainer = item.parentElement;
        if (!variationsContainer) return;

        // ボタンコンテナを作成
        const btnContainer = document.createElement('div');
        btnContainer.className = 'mt-4 mb-4 flex justify-end asset-connect-download-all';
        btnContainer.style.width = '100%';
        btnContainer.style.marginBottom = '8px';
        
        // 独自のボタンを作成
        const newBtn = document.createElement('button');
        newBtn.type = 'button';
        newBtn.textContent = window.assetConnectDefaultDownload?.getBulkButtonLabel()
            || getMessage('downloadAllButton');
        
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
                    const method = window.assetConnectDefaultDownload?.getMethod() || 'normal';
                    if (method === 'normal') {
                        const info = getDownloadInfo(button);
                        await saveDownloadHistory(info);

                        const iframe = document.createElement('iframe');
                        iframe.style.display = 'none';
                        iframe.src = info.url;
                        document.body.appendChild(iframe);

                        setTimeout(() => {
                            if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
                        }, 60000);
                    } else {
                        await window.assetConnectDefaultDownload.launchForRegular(button);
                    }
                    
                    processedCount++;
                    updateProgress();
                    
                    // 通常ダウンロードはリダイレクト処理の間隔を1秒確保する
                    await new Promise(r => setTimeout(r, method === 'normal' ? 1000 : 500));
                    
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
        
        // 商品内の全ファイルを対象にするため、一覧の先頭に1つだけ挿入
        variationsContainer.insertBefore(btnContainer, item);
}

// 「その他のDL方法」にAvatarExplorer連携を追加する
function addAvatarExplorerDownloadButtons(root = document) {
    const dropdowns = root.querySelectorAll(
        '[data-test="other-downloads-button"][data-dropdown-items]'
    );

    dropdowns.forEach(dropdown => {
        if (dropdown.querySelector('.asset-connect-avatar-explorer-download')) return;

        let items;
        try {
            items = JSON.parse(dropdown.dataset.dropdownItems);
        } catch (error) {
            debugLog('Shop: Failed to parse other download methods:', error);
            return;
        }

        const libraryManagerItem = items.find(item =>
            item.deeplinkDownloadableUrl &&
            item.deeplinkDownloadableUrl.includes('client=booth-library-manager')
        );
        if (!libraryManagerItem) return;

        const menu = dropdown.querySelector('.absolute.top-full');
        if (!menu) return;

        const sourceRow = Array.from(menu.children).find(row =>
            row.textContent.includes('BOOTH Library Manager')
        );
        if (!sourceRow) return;

        const avatarExplorerRow = sourceRow.cloneNode(true);
        avatarExplorerRow.classList.add('asset-connect-avatar-explorer-download');

        const textNode = Array.from(avatarExplorerRow.childNodes).find(node =>
            node.nodeType === Node.TEXT_NODE && node.textContent.includes('BOOTH Library Manager')
        );
        if (textNode) textNode.textContent = 'AvatarExplorerでDL';

        avatarExplorerRow.addEventListener('click', async event => {
            event.preventDefault();
            event.stopPropagation();

            const launchWindow = window.prepareAvatarExplorerLaunch();
            avatarExplorerRow.style.pointerEvents = 'none';
            try {
                const downloadableId = /\/downloadables\/(\d+)/.exec(
                    libraryManagerItem.deeplinkDownloadableUrl
                )?.[1];
                debugLog('AvatarExplorer deeplink requested:', { downloadableId });
                const response = await chrome.runtime.sendMessage({
                    action: 'fetchAvatarExplorerDeeplink',
                    deeplinkUrl: libraryManagerItem.deeplinkDownloadableUrl
                });
                if (!response?.success || !response.deeplink) {
                    window.debugLogger?.warn('[SHOP] AvatarExplorer deeplink failed:', response);
                    throw new Error(response?.error || 'AvatarExplorer deeplink could not be created');
                }
                debugLog('AvatarExplorer deeplink converted:', {
                    downloadableId,
                    scheme: response.launchMode === 'firefox-navigation-redirect'
                        ? 'vrcae (via Firefox redirect)'
                        : response.deeplink.split(':', 1)[0]
                });

                debugLog('Launching AvatarExplorer:', { downloadableId });
                window.launchAvatarExplorer(response.deeplink, launchWindow);

                const regularDownloadLink = dropdown.closest('.variation-item')
                    ?.querySelector('a[href^="https://booth.pm/downloadables/"]');
                if (regularDownloadLink) {
                    const info = getDownloadInfo(regularDownloadLink);
                    info.registered = true;
                    saveDownloadHistory(info).catch(error => {
                        window.debugLogger?.warn('[SHOP] Download history save failed:', error);
                    });
                }
            } catch (error) {
                launchWindow?.close();
                window.debugLogger?.error('[SHOP] AvatarExplorer download failed:', error);
                alert(`AvatarExplorerの起動に失敗しました。\n${error.message}`);
            } finally {
                avatarExplorerRow.style.pointerEvents = '';
            }
        }, true);

        sourceRow.insertAdjacentElement('afterend', avatarExplorerRow);
    });
}

let shopUpdateScheduled = false;
const shopObserver = new MutationObserver(() => {
    if (shopUpdateScheduled) return;
    shopUpdateScheduled = true;
    queueMicrotask(() => {
        shopUpdateScheduled = false;
        addDownloadAllButtons();
        addAvatarExplorerDownloadButtons();
    });
});
shopObserver.observe(document.documentElement, { childList: true, subtree: true });

// ページ読み込み完了時に実行
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        addDownloadAllButtons();
        addAvatarExplorerDownloadButtons();
    });
} else {
    addDownloadAllButtons();
    addAvatarExplorerDownloadButtons();
}
