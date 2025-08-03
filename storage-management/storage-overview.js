// AssetConnect Storage overview page JavaScript
let currentTranslations = {};
let currentLanguage = 'ja';
const SUPPORTED_LANGUAGES = ['ja', 'en', 'ko'];

document.addEventListener('DOMContentLoaded', async () => {
    await initializeTranslations();
    await loadStorageData();
    setupEventListeners();
});

async function initializeTranslations() {
    try {
        // Get the current language setting
        const result = await chrome.storage.local.get(['selectedLanguage']);
        const selectedLang = result.selectedLanguage || chrome.i18n.getUILanguage().substring(0, 2);
        currentLanguage = SUPPORTED_LANGUAGES.includes(selectedLang) ? selectedLang : 'en';
        
        await loadTranslations(currentLanguage);
        updateUITexts();
    } catch (error) {
        console.error('Failed to initialize translations:', error);
    }
}

async function loadTranslations(lang) {
    try {
        const response = await fetch(chrome.runtime.getURL(`_locales/${lang}/messages.json`));
        if (!response.ok) throw new Error(`Failed to load translations for ${lang}`);
        const translations = await response.json();
        
        // Convert to simple key-value pairs
        currentTranslations = {};
        for (const [key, value] of Object.entries(translations)) {
            currentTranslations[key] = value.message;
        }
        return currentTranslations;
    } catch (error) {
        console.error('Translation loading error:', error);
        if (lang !== 'en') {
            return await loadTranslations('en');
        }
        return {};
    }
}

function getMessage(key, replacements = {}) {
    let message = currentTranslations[key] || chrome.i18n.getMessage(key) || key;
    
    // Replace placeholders like {count}, {key}, {error}
    for (const [placeholder, value] of Object.entries(replacements)) {
        message = message.replace(new RegExp(`{${placeholder}}`, 'g'), value);
    }
    
    return message;
}

function updateUITexts() {
    document.querySelectorAll('[data-i18n]').forEach(function (el) {
        const key = el.getAttribute('data-i18n');
        const message = getMessage(key);
        if (message) {
            if (el.tagName === 'TITLE') {
                // For title tags, only update the span content if it exists
                const span = el.querySelector('span[data-i18n]');
                if (span) {
                    span.textContent = message;
                } else {
                    el.textContent = `AssetConnect - ${message}`;
                }
            } else {
                el.textContent = message;
            }
        }
    });
}

function createBoothUrl(itemId) {
    return `https://booth.pm/${currentLanguage}/items/${itemId}`;
}

async function loadStorageData() {
    try {
        // Get all storage data
        const result = await chrome.storage.local.get(null);
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
        document.getElementById('storage-size').textContent = formatBytes(storageSize);
        
        // Show clear button if there is data
        if (boothStats.total > 0 || downloadHistory.length > 0) {
            document.getElementById('clear-storage').style.display = 'block';
        }
        
        // Hide loading
        document.getElementById('loading').style.display = 'none';
        
    } catch (error) {
        console.error('Error loading storage data:', error);
        document.getElementById('loading').textContent = getMessage('loadingError');
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
    document.getElementById('total-booth-items').textContent = boothStats.total;
    document.getElementById('saved-count').textContent = boothStats.saved;
    document.getElementById('unsaved-count').textContent = boothStats.unsaved;
    document.getElementById('excluded-count').textContent = boothStats.excluded;
    document.getElementById('download-history-count').textContent = downloadStats.total;
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
            document.getElementById(categoryData.section).style.display = 'block';
            displayCategoryItems(categoryData.items, categoryData.container, categoryName);
        }
    });
    
    // Show "no items" message if needed
    if (!hasBoothItems) {
        document.getElementById('no-booth-items').style.display = 'block';
    }
}

function displayDownloadHistory(downloadHistory) {
    if (downloadHistory.length === 0) {
        document.getElementById('no-download-history').style.display = 'block';
        return;
    }
    
    document.getElementById('download-history-section').style.display = 'block';
    const container = document.getElementById('download-history-items');
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
    const container = document.getElementById(containerId);
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
    const itemDiv = document.createElement('div');
    itemDiv.className = `item ${category}`;
    
    const itemUrl = createBoothUrl(item.id);
    
    itemDiv.innerHTML = `
        <div class="item-info">
            <div class="item-name">${escapeHtml(item.name || getMessage('itemNameUnknown'))}</div>
            <div class="item-details">
                ID: ${item.id} | ${getMessage('category')}: ${category}
                ${item.previousCategory ? ` | ${getMessage('originalCategory')}: ${item.previousCategory}` : ''}
            </div>
        </div>
        <a href="${itemUrl}" target="_blank" class="item-link">${getMessage('openInBooth')}</a>
    `;
    
    return itemDiv;
}

function createDownloadHistoryElement(item) {
    const itemDiv = document.createElement('div');
    itemDiv.className = 'item download';
    
    const itemUrl = item.url || createBoothUrl(item.boothID);
    
    itemDiv.innerHTML = `
        <div class="item-info">
            <div class="item-name">${escapeHtml(item.title || getMessage('titleUnknown'))}</div>
            <div class="item-details">
                ID: ${item.boothID} | ${getMessage('fileName')}: ${escapeHtml(item.filename || getMessage('none'))} | 
                ${getMessage('dateTime')}: ${item.timestamp} | 
                ${getMessage('free')}: ${item.free ? getMessage('yes') : getMessage('no')} | 
                ${getMessage('registered')}: ${item.registered === true ? getMessage('yes') : (item.registered === false ? getMessage('no') : getMessage('unknown'))}
            </div>
        </div>
        <a href="${itemUrl}" target="_blank" class="item-link">${getMessage('openInBooth')}</a>
    `;
    
    return itemDiv;
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
    document.getElementById('clear-storage').addEventListener('click', async () => {
        if (confirm(getMessage('confirmClearStorage'))) {
            try {
                await chrome.storage.local.clear();
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
        document.getElementById('no-raw-storage').style.display = 'block';
        return;
    }
    
    document.getElementById('raw-storage-section').style.display = 'block';
    const container = document.getElementById('raw-storage-items');
    container.innerHTML = '';
    
    // Sort keys alphabetically
    rawStorageKeys.sort().forEach(key => {
        const value = allStorageData[key];
        const itemElement = createRawStorageElement(key, value);
        container.appendChild(itemElement);
    });
}

function createRawStorageElement(key, value) {
    const itemDiv = document.createElement('div');
    itemDiv.className = 'item raw-key';
    
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
    
    itemDiv.innerHTML = `
        <div class="item-info">
            <div class="item-name">${escapeHtml(key)}</div>
            <div class="item-details">
                ${getMessage('dataType')}: ${dataType} | ${getMessage('size')}: ${formatBytes(new Blob([JSON.stringify(value)]).size)}
                <br>
                <code style="background: #f1f1f1; padding: 2px 4px; border-radius: 3px; font-size: 0.8em; white-space: pre-wrap;">${escapeHtml(valuePreview)}</code>
            </div>
        </div>
        <button class="download-btn" data-key="${escapeHtml(key)}" type="button">${getMessage('download')}</button>
    `;
    
    // Add event listener for download button
    const downloadBtn = itemDiv.querySelector('.download-btn');
    downloadBtn.addEventListener('click', () => downloadStorageKey(key));
    
    return itemDiv;
}

async function downloadStorageKey(keyName) {
    try {
        // Get the specific storage key data
        const result = await chrome.storage.local.get([keyName]);
        const keyData = result[keyName];
        
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
    document.getElementById(tabId).classList.add('active');
}