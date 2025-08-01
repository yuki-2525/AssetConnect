// AssetConnect Import page JavaScript
document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
});

let importData = null;

function setupEventListeners() {
    const fileDropArea = document.getElementById('file-drop-area');
    const fileInput = document.getElementById('file-input');
    const importButton = document.getElementById('import-button');

    // File drop area click
    fileDropArea.addEventListener('click', () => {
        fileInput.click();
    });

    // File input change
    fileInput.addEventListener('change', (e) => {
        handleFileSelect(e.target.files[0]);
    });

    // Drag and drop events
    fileDropArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        fileDropArea.classList.add('dragover');
    });

    fileDropArea.addEventListener('dragleave', () => {
        fileDropArea.classList.remove('dragover');
    });

    fileDropArea.addEventListener('drop', (e) => {
        e.preventDefault();
        fileDropArea.classList.remove('dragover');
        const file = e.dataTransfer.files[0];
        if (file) {
            handleFileSelect(file);
        }
    });

    // Import button click
    importButton.addEventListener('click', handleImport);
}

function handleFileSelect(file) {
    if (!file) return;

    if (file.type !== 'application/json' && !file.name.endsWith('.json')) {
        showStatus('error', 'JSONファイルを選択してください。');
        return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const jsonData = JSON.parse(e.target.result);
            validateAndPreviewData(jsonData, file.name);
        } catch (error) {
            showStatus('error', `JSONファイルの解析に失敗しました: ${error.message}`);
        }
    };
    reader.readAsText(file);
}

function validateAndPreviewData(data, filename) {
    // Validate JSON structure
    if (!data.items || !Array.isArray(data.items)) {
        showStatus('error', 'JSONファイルの形式が正しくありません。items配列が見つかりません。');
        return;
    }

    // Validate each item
    const validItems = [];
    const invalidItems = [];

    data.items.forEach((item, index) => {
        if (item.id && item.name) {
            validItems.push({
                id: String(item.id),
                name: String(item.name)
            });
        } else {
            invalidItems.push(`Item ${index + 1}: IDまたは名前が不正`);
        }
    });

    if (validItems.length === 0) {
        showStatus('error', '有効なアイテムが見つかりません。');
        return;
    }

    importData = {
        items: validItems,
        exportDate: data.exportDate,
        version: data.version,
        filename: filename
    };

    showPreview(validItems, invalidItems);
    showStatus('info', `${validItems.length}個のアイテムをインポート準備完了`);
    
    const importButton = document.getElementById('import-button');
    importButton.disabled = false;
    importButton.textContent = `${validItems.length}個のアイテムをインポート`;
}

function showPreview(validItems, invalidItems) {
    const previewArea = document.getElementById('preview-area');
    const previewStats = document.getElementById('preview-stats');
    const previewItems = document.getElementById('preview-items');

    let statsText = `有効なアイテム: ${validItems.length}個`;
    if (invalidItems.length > 0) {
        statsText += ` | 無効なアイテム: ${invalidItems.length}個`;
    }
    previewStats.textContent = statsText;

    previewItems.innerHTML = '';
    validItems.forEach(item => {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'preview-item';
        itemDiv.textContent = `ID: ${item.id} - ${item.name}`;
        previewItems.appendChild(itemDiv);
    });

    previewArea.style.display = 'block';
}

async function handleImport() {
    if (!importData) {
        showStatus('error', 'インポートするデータがありません。');
        return;
    }

    const importButton = document.getElementById('import-button');
    importButton.disabled = true;
    importButton.textContent = 'インポート中...';

    showStatus('info', 'データをインポート中...');

    try {
        // Get merge mode
        const mergeMode = document.querySelector('input[name="merge-mode"]:checked').value;
        
        // Get existing data
        const result = await chrome.storage.local.get(['boothItems']);
        const existingItems = result.boothItems || {};

        let importedCount = 0;
        let skippedCount = 0;
        let updatedCount = 0;

        // Process each item
        for (const item of importData.items) {
            const existingItem = existingItems[item.id];
            
            if (existingItem) {
                if (mergeMode === 'skip') {
                    skippedCount++;
                    continue;
                } else if (mergeMode === 'replace') {
                    // Update existing item while preserving internal fields
                    existingItems[item.id] = {
                        ...existingItem,
                        name: item.name
                    };
                    updatedCount++;
                }
            } else {
                // Add new item
                existingItems[item.id] = {
                    id: item.id,
                    name: item.name,
                    category: 'saved'
                };
                importedCount++;
            }
        }

        // Save updated data
        await chrome.storage.local.set({ boothItems: existingItems });

        // Show results
        let resultMessage = `インポート完了: `;
        const results = [];
        if (importedCount > 0) results.push(`${importedCount}個を新規追加`);
        if (updatedCount > 0) results.push(`${updatedCount}個を更新`);
        if (skippedCount > 0) results.push(`${skippedCount}個をスキップ`);
        
        resultMessage += results.join(', ');

        showStatus('success', resultMessage);
        
        // Reset UI after delay
        setTimeout(() => {
            importButton.disabled = false;
            importButton.textContent = 'インポート完了';
            
            // Optionally close the tab after successful import
            setTimeout(() => {
                const confirm = window.confirm('インポートが完了しました。このタブを閉じますか？');
                if (confirm) {
                    window.close();
                }
            }, 2000);
        }, 1000);

    } catch (error) {
        console.error('Import error:', error);
        showStatus('error', `インポート中にエラーが発生しました: ${error.message}`);
        
        importButton.disabled = false;
        importButton.textContent = `${importData.items.length}個のアイテムをインポート`;
    }
}

function showStatus(type, message) {
    const statusArea = document.getElementById('status-area');
    
    // Remove existing status classes
    statusArea.classList.remove('status-success', 'status-error', 'status-info');
    
    // Add new status class
    statusArea.classList.add(`status-${type}`);
    
    // Set message
    statusArea.textContent = message;
    
    // Show status area
    statusArea.style.display = 'block';
    
    // Auto-hide info messages after 5 seconds
    if (type === 'info') {
        setTimeout(() => {
            statusArea.style.display = 'none';
        }, 5000);
    }
}