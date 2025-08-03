// AssetConnect Storage overview page JavaScript
// DOM要素キャッシュ
const domCache = new Map();

// Storage データキャッシュ
let storageDataCache = null;
let storageDataCacheTimestamp = null;
const STORAGE_CACHE_DURATION = 30000; // 30秒間キャッシュ

/**
 * DOM要素をキャッシュ付きで取得
 * @param {string} id - 要素ID
 * @returns {HTMLElement|null} DOM要素
 */
function getCachedElement(id) {
    if (!domCache.has(id)) {
        domCache.set(id, document.getElementById(id));
    }
    const element = domCache.get(id);
    // 要素がDOMから削除されている場合はキャッシュをクリア
    if (element && !document.contains(element)) {
        domCache.delete(id);
        const newElement = document.getElementById(id);
        if (newElement) {
            domCache.set(id, newElement);
        }
        return newElement;
    }
    return element;
}

/**
 * Storage データをキャッシュ付きで取得
 * @param {string[]|null} keys - 取得するキー（nullで全取得）
 * @param {boolean} forceRefresh - キャッシュを無視して強制更新
 * @returns {Promise<Object>} Storage データ
 */
async function getCachedStorageData(keys = null, forceRefresh = false) {
    const now = Date.now();
    
    // 全データ取得でキャッシュが有効な場合はキャッシュを返す
    if (!forceRefresh && keys === null && storageDataCache && 
        storageDataCacheTimestamp && 
        (now - storageDataCacheTimestamp) < STORAGE_CACHE_DURATION) {
        return storageDataCache;
    }
    
    // Storage から取得
    const result = await chrome.storage.local.get(keys);
    
    // 全データ取得の場合はキャッシュに保存
    if (keys === null) {
        storageDataCache = result;
        storageDataCacheTimestamp = now;
    }
    
    return result;
}

/**
 * Storage キャッシュをクリア
 */
function clearStorageCache() {
    storageDataCache = null;
    storageDataCacheTimestamp = null;
}

document.addEventListener('DOMContentLoaded', async () => {
    await initializeTranslations();
    updateUITexts();
    await loadStorageData();
    setupEventListeners();
});

function createBoothUrl(itemId) {
    return window.translationManager.createBoothUrl(itemId);
}

/**
 * 統一されたHTML要素生成ヘルパー
 * @param {Object} config - 設定オブジェクト
 * @param {string} config.className - CSS クラス名
 * @param {string} config.name - アイテム名
 * @param {string} config.details - アイテム詳細
 * @param {Object} config.action - アクション要素設定
 * @param {string} config.action.type - 'link' または 'button'
 * @param {string} config.action.href - リンクURL (type='link'の場合)
 * @param {string} config.action.text - 表示テキスト
 * @param {string} config.action.onClick - クリックハンドラー (type='button'の場合)
 * @param {Object} config.action.dataset - data属性 (type='button'の場合)
 * @returns {HTMLElement} 生成されたHTML要素
 */
function createUnifiedItemElement(config) {
    const itemDiv = document.createElement('div');
    itemDiv.className = `item ${config.className}`;
    
    let actionElement = '';
    if (config.action.type === 'link') {
        actionElement = `<a href="${config.action.href}" target="_blank" class="item-link">${config.action.text}</a>`;
    } else if (config.action.type === 'button') {
        let dataAttrs = '';
        if (config.action.dataset) {
            dataAttrs = Object.entries(config.action.dataset)
                .map(([key, value]) => `data-${key}="${escapeHtml(value)}"`)
                .join(' ');
        }
        actionElement = `<button class="${config.action.className || 'action-btn'}" ${dataAttrs} type="button">${config.action.text}</button>`;
    }
    
    itemDiv.innerHTML = `
        <div class="item-info">
            <div class="item-name">${escapeHtml(config.name)}</div>
            <div class="item-details">${config.details}</div>
        </div>
        ${actionElement}
    `;
    
    return itemDiv;
}

async function loadStorageData() {
    try {
        // Get all storage data with caching
        const result = await getCachedStorageData(null);
        const boothItems = result.boothItems || {};
        const downloadHistory = result.downloadHistory || [];
        
        // Calculate statistics
        const boothStats = calculateBoothStats(boothItems);
        const downloadStats = calculateDownloadStats(downloadHistory);
        updateStatistics(boothStats, downloadStats);
        
        // Display items by category
        displayBoothItemsByCategory(boothItems);
        displayDownloadHistory(downloadHistory);
        displayRawStorage(result);
        
        // Calculate storage size
        const storageSize = calculateStorageSize(result);
        getCachedElement('storage-size').textContent = formatBytes(storageSize);
        
        // Show clear button if there is data
        if (boothStats.total > 0 || downloadHistory.length > 0) {
            getCachedElement('clear-storage').style.display = 'block';
        }
        
        // Hide loading
        getCachedElement('loading').style.display = 'none';
        
    } catch (error) {
        console.error('Error loading storage data:', error);
        getCachedElement('loading').textContent = getMessage('loadingError');
    }
}

function calculateBoothStats(items) {
    const stats = {
        saved: 0,
        unsaved: 0,
        excluded: 0,
        total: 0
    };
    
    Object.values(items).forEach(item => {
        if (item.category === 'saved') {
            stats.saved++;
        } else if (item.category === 'excluded') {
            stats.excluded++;
        } else {
            stats.unsaved++;
        }
        stats.total++;
    });
    
    return stats;
}

function calculateDownloadStats(downloadHistory) {
    return {
        total: downloadHistory.length,
        free: downloadHistory.filter(item => item.free === true).length,
        registered: downloadHistory.filter(item => item.registered === true).length
    };
}

function updateStatistics(boothStats, downloadStats) {
    getCachedElement('total-booth-items').textContent = boothStats.total;
    getCachedElement('saved-count').textContent = boothStats.saved;
    getCachedElement('unsaved-count').textContent = boothStats.unsaved;
    getCachedElement('excluded-count').textContent = boothStats.excluded;
    getCachedElement('download-history-count').textContent = downloadStats.total;
}

function displayBoothItemsByCategory(items) {
    const categories = {
        saved: { items: [], container: 'saved-items', section: 'saved-section' },
        unsaved: { items: [], container: 'unsaved-items', section: 'unsaved-section' },
        excluded: { items: [], container: 'excluded-items', section: 'excluded-section' }
    };
    
    // Categorize items
    Object.entries(items).forEach(([itemId, item]) => {
        const category = item.category || 'unsaved';
        if (categories[category]) {
            categories[category].items.push({ id: itemId, ...item });
        }
    });
    
    // Display each category
    let hasBoothItems = false;
    Object.entries(categories).forEach(([categoryName, categoryData]) => {
        if (categoryData.items.length > 0) {
            hasBoothItems = true;
            getCachedElement(categoryData.section).style.display = 'block';
            displayCategoryItems(categoryData.items, categoryData.container, categoryName);
        }
    });
    
    // Show "no items" message if needed
    if (!hasBoothItems) {
        getCachedElement('no-booth-items').style.display = 'block';
    }
}

function displayDownloadHistory(downloadHistory) {
    if (downloadHistory.length === 0) {
        getCachedElement('no-download-history').style.display = 'block';
        return;
    }
    
    getCachedElement('download-history-section').style.display = 'block';
    const container = getCachedElement('download-history-items');
    container.innerHTML = '';
    
    // Sort by timestamp (newest first)
    const sortedHistory = [...downloadHistory].sort((a, b) => 
        new Date(b.timestamp) - new Date(a.timestamp)
    );
    
    sortedHistory.forEach(item => {
        const itemElement = createDownloadHistoryElement(item);
        container.appendChild(itemElement);
    });
}

function displayCategoryItems(items, containerId, category) {
    const container = getCachedElement(containerId);
    container.innerHTML = '';
    
    // Sort items by name (alphabetical)
    items.sort((a, b) => {
        const nameA = (a.name || '').toLowerCase();
        const nameB = (b.name || '').toLowerCase();
        return nameA.localeCompare(nameB);
    });
    
    items.forEach(item => {
        const itemElement = createItemElement(item, category);
        container.appendChild(itemElement);
    });
}

function createItemElement(item, category) {
    const itemUrl = createBoothUrl(item.id);
    const details = `ID: ${item.id} | ${getMessage('category')}: ${category}${item.previousCategory ? ` | ${getMessage('originalCategory')}: ${item.previousCategory}` : ''}`;
    
    return createUnifiedItemElement({
        className: category,
        name: item.name || getMessage('itemNameUnknown'),
        details: details,
        action: {
            type: 'link',
            href: itemUrl,
            text: getMessage('openInBooth')
        }
    });
}

function createDownloadHistoryElement(item) {
    const itemUrl = item.url || createBoothUrl(item.boothID);
    const registeredText = item.registered === true ? getMessage('yes') : (item.registered === false ? getMessage('no') : getMessage('unknown'));
    const details = `ID: ${item.boothID} | ${getMessage('fileName')}: ${escapeHtml(item.filename || getMessage('none'))} | ${getMessage('dateTime')}: ${item.timestamp} | ${getMessage('free')}: ${item.free ? getMessage('yes') : getMessage('no')} | ${getMessage('registered')}: ${registeredText}`;
    
    return createUnifiedItemElement({
        className: 'download',
        name: item.title || getMessage('titleUnknown'),
        details: details,
        action: {
            type: 'link',
            href: itemUrl,
            text: getMessage('openInBooth')
        }
    });
}

function calculateStorageSize(data) {
    return new Blob([JSON.stringify(data)]).size;
}

function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatDate(dateString) {
    try {
        const date = new Date(dateString);
        return date.toLocaleDateString('ja-JP') + ' ' + date.toLocaleTimeString('ja-JP');
    } catch (error) {
        return dateString;
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function setupEventListeners() {
    // Tab switching
    document.querySelectorAll('.tab-button').forEach(button => {
        button.addEventListener('click', () => {
            const tabId = button.dataset.tab;
            switchTab(tabId);
        });
    });
    
    // Clear storage button
    getCachedElement('clear-storage').addEventListener('click', async () => {
        if (confirm(getMessage('confirmClearStorage'))) {
            try {
                await chrome.storage.local.clear();
                clearStorageCache(); // キャッシュもクリア
                alert(getMessage('storageCleared'));
                location.reload();
            } catch (error) {
                console.error('Error clearing storage:', error);
                alert(getMessage('storageClearError'));
            }
        }
    });
}

function displayRawStorage(allStorageData) {
    const rawStorageKeys = Object.keys(allStorageData);
    
    if (rawStorageKeys.length === 0) {
        getCachedElement('no-raw-storage').style.display = 'block';
        return;
    }
    
    getCachedElement('raw-storage-section').style.display = 'block';
    const container = getCachedElement('raw-storage-items');
    container.innerHTML = '';
    
    // Sort keys alphabetically
    rawStorageKeys.sort().forEach(key => {
        const value = allStorageData[key];
        const itemElement = createRawStorageElement(key, value);
        container.appendChild(itemElement);
    });
}

function createRawStorageElement(key, value) {
    // Value preview processing
    let valuePreview = '';
    let dataType = '';
    
    try {
        if (typeof value === 'object' && value !== null) {
            if (Array.isArray(value)) {
                dataType = `${getMessage('arrayType')} (${value.length}${getMessage('items')})`;
                valuePreview = value.length > 0 ? JSON.stringify(value.slice(0, 2), null, 1) : '[]';
            } else {
                const keys = Object.keys(value);
                dataType = `${getMessage('objectType')} (${keys.length}${getMessage('keys')})`;
                const preview = {};
                keys.slice(0, 3).forEach(k => preview[k] = value[k]);
                valuePreview = JSON.stringify(preview, null, 1);
            }
            if (valuePreview.length > 200) {
                valuePreview = valuePreview.substring(0, 200) + '...';
            }
        } else {
            dataType = typeof value;
            valuePreview = String(value);
            if (valuePreview.length > 100) {
                valuePreview = valuePreview.substring(0, 100) + '...';
            }
        }
    } catch (error) {
        dataType = getMessage('parseError');
        valuePreview = getMessage('dataParseError');
    }
    
    const details = `${getMessage('dataType')}: ${dataType} | ${getMessage('size')}: ${formatBytes(new Blob([JSON.stringify(value)]).size)}<br><code style="background: #f1f1f1; padding: 2px 4px; border-radius: 3px; font-size: 0.8em; white-space: pre-wrap;">${escapeHtml(valuePreview)}</code>`;
    
    const itemDiv = createUnifiedItemElement({
        className: 'raw-key',
        name: key,
        details: details,
        action: {
            type: 'button',
            className: 'download-btn',
            text: getMessage('download'),
            dataset: { key: key }
        }
    });
    
    // Add event listener for download button
    const downloadBtn = itemDiv.querySelector('.download-btn');
    downloadBtn.addEventListener('click', () => downloadStorageKey(key));
    
    return itemDiv;
}

async function downloadStorageKey(keyName) {
    try {
        // Try to get from cache first, fallback to specific key request
        let keyData;
        if (storageDataCache && storageDataCache.hasOwnProperty(keyName)) {
            keyData = storageDataCache[keyName];
        } else {
            const result = await getCachedStorageData([keyName]);
            keyData = result[keyName];
        }
        
        if (keyData === undefined) {
            alert(getMessage('storageKeyNotFound', { key: keyName }));
            return;
        }
        
        // Format the data for download
        const exportData = {
            exportDate: new Date().toISOString(),
            keyName: keyName,
            data: keyData
        };
        
        const jsonString = JSON.stringify(exportData, null, 2);
        
        // Generate filename with current date and key name
        const now = new Date();
        const dateString = now.toISOString().split('T')[0]; // YYYY-MM-DD
        const safeKeyName = keyName.replace(/[^a-zA-Z0-9_-]/g, '_'); // Sanitize filename
        const filename = `storage-${safeKeyName}-${dateString}.json`;
        
        // Create data URL for download
        const dataUrl = 'data:application/json;charset=utf-8,' + encodeURIComponent(jsonString);
        
        // Create temporary download link
        const downloadLink = document.createElement('a');
        downloadLink.href = dataUrl;
        downloadLink.download = filename;
        downloadLink.style.display = 'none';
        document.body.appendChild(downloadLink);
        
        // Trigger download
        downloadLink.click();
        
        // Clean up
        document.body.removeChild(downloadLink);
        
        console.log(`Storage key "${keyName}" downloaded as ${filename}`);
        
    } catch (error) {
        console.error('Download error:', error);
        alert(getMessage('downloadError', { error: error.message }));
    }
}

function switchTab(tabId) {
    // Update tab buttons
    document.querySelectorAll('.tab-button').forEach(button => {
        button.classList.remove('active');
    });
    document.querySelector(`[data-tab="${tabId}"]`).classList.add('active');
    
    // Update tab content
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    getCachedElement(tabId).classList.add('active');
}