// booth_order.js

const debugLog = (...args) => window.debugLogger?.log('[ORDER]', ...args);

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
            registered: info.registered === true
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

window.assetConnectDownloadAdapter = {
  getInfo: getDownloadInfo,
  save: saveDownloadHistory
};

document.addEventListener('click', function (e) {
  // ダウンロードリンク（"https://booth.pm/downloadables/" で始まるもの）を検知
  // 形式: .js-download-button (data-href属性を持つ)
  const downloadButton = e.target.closest(
    '.js-download-button[data-test="downloadable"]' +
    '[data-href^="https://booth.pm/downloadables/"]'
  );
  
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
async function addDownloadAllButtons() {
    // 翻訳システムの初期化
    await initializeTranslations();

    // 商品シートを取得
    const sheets = document.querySelectorAll('.sheet');
    
    sheets.forEach(sheet => {
        // 既にボタンが追加されているかチェック
        if (sheet.querySelector('.asset-connect-download-all')) return;

        const buttons = sheet.querySelectorAll(
            '.js-download-button[data-test="downloadable"]' +
            '[data-href^="https://booth.pm/downloadables/"]'
        );
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
        
        // リストの直前に挿入
        listContainer.parentNode.insertBefore(btnContainer, listContainer);
    });
}

// 「その他のDL方法」にAvatarExplorer連携を追加する
function addAvatarExplorerDownloadButtons(root = document) {
    const dropdowns = root.querySelectorAll(
        '.js-download-button[data-test="other-downloads-button"][data-dropdown-items]'
    );

    dropdowns.forEach(dropdown => {
        if (dropdown.querySelector('.asset-connect-avatar-explorer-download')) return;

        let items;
        try {
            items = JSON.parse(dropdown.dataset.dropdownItems);
        } catch (error) {
            debugLog('Order: Failed to parse other download methods:', error);
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
                    window.debugLogger?.warn('[ORDER] AvatarExplorer deeplink failed:', response);
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

                const regularDownloadButton = dropdown.closest('.legacy-list-item')
                    ?.querySelector(
                        '.js-download-button[data-test="downloadable"]' +
                        '[data-href^="https://booth.pm/downloadables/"]'
                    );
                if (regularDownloadButton) {
                    const info = getDownloadInfo(regularDownloadButton);
                    info.registered = true;
                    saveDownloadHistory(info).catch(error => {
                        window.debugLogger?.warn('[ORDER] Download history save failed:', error);
                    });
                }
            } catch (error) {
                launchWindow?.close();
                window.debugLogger?.error('[ORDER] AvatarExplorer download failed:', error);
                alert(`AvatarExplorerの起動に失敗しました。\n${error.message}`);
            } finally {
                avatarExplorerRow.style.pointerEvents = '';
            }
        }, true);

        sourceRow.insertAdjacentElement('afterend', avatarExplorerRow);
    });
}

const orderObserver = new MutationObserver(() => {
    addAvatarExplorerDownloadButtons();
});
orderObserver.observe(document.documentElement, { childList: true, subtree: true });

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
