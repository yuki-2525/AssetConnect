// booth_gift.js

const debugLog = (...args) => window.debugLogger?.log('[GIFT]', ...args);

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

    // クリックされたリンクが含まれる要素を取得
    const downloadContainer = downloadButton.closest('.desktop\\:flex');
    if (downloadContainer) {
        // ファイル名は text-14 クラスを持つ要素に入っている
        const fileNameElement = downloadContainer.querySelector('.text-14');
        if (fileNameElement) {
            fileName = fileNameElement.textContent.trim();
        } else {
            debugLog("Gift: File name element not found - using fallback data");
        }
    } else {
        debugLog("Gift: download container not found - using fallback data");
    }

    // 商品タイトルとURLを取得
    const titleLink = document.querySelector('a[href*="/items/"]');
    if (titleLink) {
        title = titleLink.textContent.trim();
        itemUrl = titleLink.href;
        const idMatch = itemUrl.match(/\/items\/(\d+)/);
        if (idMatch && idMatch[1]) {
            boothID = idMatch[1];
        } else {
            debugLog("Gift: BOOTHID not found in titleLink.href - using fallback data");
        }
    } else {
        debugLog("Gift: title link not found - using fallback data");
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

        debugLog('Gift: Created download entry:', newEntry);

        // 既存の "downloadHistory" から、同じ BOOTHID と filename のエントリを除外してから追加
        chrome.storage.local.get("downloadHistory", function (result) {
            let history = result.downloadHistory || [];
            const originalLength = history.length;
            history = history.filter(entry => !(entry.boothID === newEntry.boothID && entry.filename === newEntry.filename));
            const filteredCount = originalLength - history.length;
            if (filteredCount > 0) {
                debugLog(`Gift: Removed ${filteredCount} duplicate entries`);
            }
            history.push(newEntry);
            debugLog(`Gift: Saving to downloadHistory, total entries: ${history.length}`);
            chrome.storage.local.set({ downloadHistory: history }, resolve);
        });
    });
}

window.assetConnectDownloadAdapter = {
    getInfo: getDownloadInfo,
    save: saveDownloadHistory
};

document.addEventListener('click', function (e) {
    // 形式: .js-download-button (data-href属性を持つ)
    const downloadButton = e.target.closest('.js-download-button[data-href^="https://booth.pm/downloadables/"]');
    
    if (!downloadButton) return;

    const url = downloadButton.dataset.href;
    debugLog('Gift: Download link detected:', url);

    // ページ遷移を防ぐ
    e.preventDefault();
    e.stopPropagation();

    const info = getDownloadInfo(downloadButton);

    saveDownloadHistory(info).then(() => {
        debugLog('Gift: Download history saved, redirecting to:', url);
        window.location.href = url;
    });
}, true);

// 一括ダウンロードボタンを追加する関数
async function addDownloadAllButton() {
    // 翻訳システムの初期化
    await initializeTranslations();

    const buttons = document.querySelectorAll('.js-download-button[data-href^="https://booth.pm/downloadables/"]');
    if (buttons.length < 2) return;

    // 挿入位置を探す
    const firstItem = buttons[0].closest('.desktop\\:flex');
    if (!firstItem) return;
    
    const listContainer = firstItem.parentElement;
    if (!listContainer) return;

    // ボタンコンテナを作成
    const btnContainer = document.createElement('div');
    btnContainer.className = 'mt-16 mb-16 flex justify-end';
    
    // 独自のボタンを作成（公式と区別するため独自スタイル）
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
                
                // サーバー負荷軽減のため少し待機
                await new Promise(r => setTimeout(r, 500));
                
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
            debugLog('Gift: Failed to parse other download methods:', error);
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
                    window.debugLogger?.warn('[GIFT] AvatarExplorer deeplink failed:', response);
                    throw new Error(response?.error || 'AvatarExplorer deeplink could not be created');
                }
                debugLog('AvatarExplorer deeplink converted:', {
                    downloadableId,
                    scheme: response.deeplink.split(':', 1)[0]
                });

                debugLog('Launching AvatarExplorer:', { downloadableId });
                window.launchAvatarExplorer(response.deeplink, launchWindow);

                const regularDownloadButton = dropdown.closest('.desktop\\:flex')
                    ?.querySelector('.js-download-button[data-href^="https://booth.pm/downloadables/"]');
                if (regularDownloadButton) {
                    const info = getDownloadInfo(regularDownloadButton);
                    info.registered = true;
                    saveDownloadHistory(info).catch(error => {
                        window.debugLogger?.warn('[GIFT] Download history save failed:', error);
                    });
                }
            } catch (error) {
                launchWindow?.close();
                window.debugLogger?.error('[GIFT] AvatarExplorer download failed:', error);
                alert(`AvatarExplorerの起動に失敗しました。\n${error.message}`);
            } finally {
                avatarExplorerRow.style.pointerEvents = '';
            }
        }, true);

        sourceRow.insertAdjacentElement('afterend', avatarExplorerRow);
    });
}

const giftObserver = new MutationObserver(() => {
    addAvatarExplorerDownloadButtons();
});
giftObserver.observe(document.documentElement, { childList: true, subtree: true });

// ページ読み込み完了時に実行
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        addDownloadAllButton();
        addAvatarExplorerDownloadButtons();
    });
} else {
    addDownloadAllButton();
    addAvatarExplorerDownloadButtons();
}
