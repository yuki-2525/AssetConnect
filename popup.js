document.addEventListener('DOMContentLoaded', function () {
  // 共通の定数と変数
  const ELEMENTS = {
    toggleFree: document.getElementById("toggleFree"),
    toggleUnregistered: document.getElementById("toggleUnregistered"),
    toggleGroup: document.getElementById("toggleGroup"),
    toggleBulkRegister: document.getElementById("toggleBulkRegister"),
    folderInput: document.getElementById("downloadFolder"),
    saveFolderBtn: document.getElementById("saveFolder"),
    languageSelect: document.getElementById("languageSelect"),
    historyList: document.getElementById("history-list"),
    csvInput: document.getElementById("csvInput"),
    // exportAe: document.getElementById("export-ae"), // Removed
    btnCsvExport: document.getElementById("btn-csv-export"),
    btnImport: document.getElementById("btn-import"),
    btnDownloadSupported: document.getElementById("btn-download-supported"),
    btnImportSupported: document.getElementById("btn-import-supported"),
    jsonInput: document.getElementById("jsonInput"),
    btnClear: document.getElementById("btn-clear"),
    feedbackButton: document.getElementById("feedback-button"),
    bulkRegisterToggle: document.getElementById("bulkRegisterToggle"),
    updateHistoryBtn: document.getElementById("btn-update-history"),
    updateHistoryModal: document.getElementById("update-history-modal"),
    updateHistoryClose: document.querySelector("#update-history-modal .close"),
    // 設定モーダル要素
    settingsBtn: document.getElementById("btn-settings"),
    settingsModal: document.getElementById("settings-modal"),
    settingsModalClose: document.querySelector("#settings-modal .close"),
    hideAvatarClipboard: document.getElementById("hideAvatarClipboard"),
    // 支援モーダル要素
    supportBtn: document.getElementById("btn-support"),
    supportModal: document.getElementById("support-modal"),
    supportModalClose: document.querySelector("#support-modal .close")
  };

  // 翻訳システム
  let currentTranslations = {};
  let currentLanguage = 'ja';
  const SUPPORTED_LANGUAGES = ['ja', 'en', 'ko'];

  // 共通のスタイル設定
  const STYLES = {
    button: {
      fontSize: "1em",
      padding: "6px 12px",
      minWidth: "130px",
      cursor: "pointer"
    },
    unregisteredButton: {
      fontSize: "1em",
      padding: "6px 12px",
      minWidth: "130px",
      cursor: "pointer",
      backgroundColor: "#FF8C00",  // ダークオレンジ
      color: "white",
      border: "1px solid #FF8C00",
    },
    entry: {
      display: "flex",
      flexDirection: "column",
      borderBottom: "1px solid #ccc",
      padding: "5px 0",
      marginBottom: "4px"
    },
    titleLink: {
      fontSize: "0.9em",
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis"
    },
    infoText: {
      fontSize: "0.9em",
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis",
      flexGrow: "1"
    },
    btnContainer: {
      display: "flex",
      gap: "10px",
      flexShrink: "0"
    }
  };

  // 翻訳関数
  async function loadTranslations(lang) {
    try {
      const response = await fetch(chrome.runtime.getURL(`_locales/${lang}/messages.json`));
      if (!response.ok) throw new Error(`Failed to load translations for ${lang}`);
      const translations = await response.json();
      currentTranslations = translations;
      return translations;
    } catch (error) {
      console.error('Translation loading error:', error);
      if (lang !== 'en') {
        return await loadTranslations('en');
      }
      return {};
    }
  }

  function getMessage(key, replacements = {}) {
    let message = currentTranslations[key]?.message || chrome.i18n.getMessage(key) || key;

    // Placeholder replacement (e.g. {count}, $COUNT$, etc.)
    for (const [placeholder, value] of Object.entries(replacements)) {
      // {key} format
      message = message.replace(new RegExp(`{${placeholder}}`, 'g'), value);
      // $KEY$ format (case insensitive)
      message = message.replace(new RegExp(`\\$${placeholder}\\$`, 'gi'), value);
    }
    return message;
  }

  function updateUITexts() {
    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      const key = el.getAttribute('data-i18n');
      let message = getMessage(key);

      // Special handling for dynamic placeholders
      if (key === 'hideAvatarClipboardNote') {
        const menuTitle = getMessage('showAvatarClipboard');
        if (menuTitle) {
          message = message.replace(/\$1/g, menuTitle);
        }
      }

      if (message) {
        el.textContent = message;
      }
    });
  }

  async function changeLanguage(lang) {
    if (!SUPPORTED_LANGUAGES.includes(lang)) return;

    currentLanguage = lang;
    await loadTranslations(lang);
    updateUITexts();

    chrome.storage.local.set({ selectedLanguage: lang });

    // Notify background script to update context menus
    chrome.runtime.sendMessage({
      action: 'languageChanged',
      language: lang
    }).catch(error => {
      console.error('Failed to notify background script of language change:', error);
    });

    renderHistory();
  }

  // ヘルパー関数
  const Helpers = {
    formatTimestamp(ts) {
      const date = new Date(ts);
      const pad = n => n.toString().padStart(2, '0');
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
    },

    escapeCSV(value) {
      if (value == null) return "";
      let str = value.toString();
      str = str.replace(/"/g, '""');
      return `"${str}"`;
    },

    showFolderNotSetAlert() {
      // 翻訳キーがあればそれを使い、なければ日本語のデフォルト文言を使う
      const translated = currentTranslations?.saveFolderNotSet?.message || chrome.i18n.getMessage("saveFolderNotSet");
      const message = (translated && translated !== "saveFolderNotSet") ? translated : "ダウンロード先フォルダが設定されていません。設定のフォルダ入力欄から設定してください。\n設定画面に移動しますか？";
      console.debug('Helpers.showFolderNotSetAlert:', message);

      if (confirm(message)) {
        if (ELEMENTS.settingsModal) {
          ELEMENTS.settingsModal.style.display = "block";
        }
      }
    },

    createButton(text, onClick, isUnregistered = false) {
      const button = document.createElement("button");
      button.textContent = text;
      Object.assign(button.style, isUnregistered ? STYLES.unregisteredButton : STYLES.button);
      button.addEventListener("click", onClick);
      return button;
    },

    createAssetButton(text, protocol, paramName, entries, boothID, isUnregistered = false) {
      return this.createButton(text, function (event) {
        event.stopPropagation();
        event.preventDefault();
        chrome.storage.local.get("downloadFolderPath", function (result) {
          const path = result.downloadFolderPath || "";
          if (path.trim() === "") {
            Helpers.showFolderNotSetAlert();
            return;
          }
          const pathParams = entries
            .map(entry => `${paramName}=${encodeURIComponent(path + "/" + entry.filename)}`)
            .join("&");
          const assetUrl = `${protocol}://addAsset?${pathParams}&id=${boothID}`;

          // 登録状態を更新
          chrome.storage.local.get("downloadHistory", function (result) {
            let history = result.downloadHistory || [];
            entries.forEach(entry => {
              const index = history.findIndex(h =>
                h.boothID === entry.boothID &&
                h.filename === entry.filename
              );
              if (index !== -1) {
                history[index].registered = true;
              }
            });
            chrome.storage.local.set({ downloadHistory: history }, function () {
              window.location.href = assetUrl;
            });
          });
        });
      }, isUnregistered);
    }
  };

  // 履歴の初期化
  async function initializeHistory() {
    // 設定と履歴をまとめて読み込む
    chrome.storage.local.get([
      "selectedLanguage",
      "downloadFolderPath",
      "downloadHistory",
      "filterFree",
      "filterUnregistered",
      "groupItems",
      "bulkRegister",
      "hideAvatarClipboard"
    ], async function (result) {
      // 言語設定
      const savedLang = result.selectedLanguage || chrome.i18n.getUILanguage().substring(0, 2);
      currentLanguage = SUPPORTED_LANGUAGES.includes(savedLang) ? savedLang : 'en';

      await loadTranslations(currentLanguage);
      ELEMENTS.languageSelect.value = currentLanguage;
      updateUITexts();

      // フォルダパス
      if (result.downloadFolderPath) {
        ELEMENTS.folderInput.value = result.downloadFolderPath;
      }

      // チェックボックスの状態
      if (result.filterFree !== undefined) ELEMENTS.toggleFree.checked = result.filterFree;
      if (result.filterUnregistered !== undefined) ELEMENTS.toggleUnregistered.checked = result.filterUnregistered;
      if (result.groupItems !== undefined) ELEMENTS.toggleGroup.checked = result.groupItems;
      if (result.bulkRegister !== undefined) ELEMENTS.toggleBulkRegister.checked = result.bulkRegister;
      if (result.hideAvatarClipboard !== undefined) ELEMENTS.hideAvatarClipboard.checked = result.hideAvatarClipboard;

      // UI状態の更新
      ELEMENTS.bulkRegisterToggle.style.display = ELEMENTS.toggleGroup.checked ? 'flex' : 'none';

      // 履歴データのマイグレーションと描画
      let history = result.downloadHistory || [];
      let updated = false;
      for (let i = 0; i < history.length; i++) {
        if (history[i].free === undefined || history[i].free === null || history[i].free === "") {
          history[i].free = false;
          updated = true;
        }
      }
      if (updated) {
        chrome.storage.local.set({ downloadHistory: history }, renderHistory);
      } else {
        renderHistory();
      }
    });
  }

  // 履歴の描画
  function renderHistory() {
    chrome.storage.local.get("downloadHistory", function (result) {
      let history = result.downloadHistory || [];
      if (ELEMENTS.toggleFree.checked) {
        history = history.filter(item => item.free);
      }
      if (ELEMENTS.toggleUnregistered.checked) {
        history = history.filter(item => item.registered === false);
      }
      history.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

      const container = ELEMENTS.historyList;
      container.innerHTML = "";

      if (history.length === 0) {
        container.innerHTML = `<p>${getMessage("noHistory")}</p>`;
        return;
      }

      if (ELEMENTS.toggleGroup.checked) {
        renderGroupedHistory(history);
      } else {
        renderIndividualHistory(history);
      }
    });
  }

  // グループ化された履歴の描画
  function renderGroupedHistory(history) {
    const groupedHistory = {};
    history.forEach(entry => {
      if (!groupedHistory[entry.boothID]) {
        groupedHistory[entry.boothID] = {
          title: entry.title,
          url: entry.url,
          boothID: entry.boothID,
          entries: [],
          latestTimestamp: new Date(entry.timestamp)
        };
      }
      groupedHistory[entry.boothID].entries.push(entry);
      const entryTime = new Date(entry.timestamp);
      if (entryTime > groupedHistory[entry.boothID].latestTimestamp) {
        groupedHistory[entry.boothID].latestTimestamp = entryTime;
      }
    });

    const sortedGroups = Object.values(groupedHistory).sort((a, b) =>
      b.latestTimestamp - a.latestTimestamp
    );

    // 一括登録モードの場合でも全てのグループを表示する（アイテム数によるフィルタリングを廃止）
    const filteredGroups = sortedGroups;

    filteredGroups.forEach(group => {
      group.entries.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      const latestEntry = group.entries[0];
      group.title = latestEntry.title;
      group.url = latestEntry.url;

      if (ELEMENTS.toggleBulkRegister.checked) {
        renderBulkGroup(group);
      } else {
        renderIndividualGroup(group);
      }
    });
  }

  // 一括登録グループの描画
  function renderBulkGroup(group) {
    const entryDiv = createEntryDiv();
    const titleLine = createTitleLine(group);
    const infoLine = createBulkInfoLine(group);

    entryDiv.appendChild(titleLine);
    entryDiv.appendChild(infoLine);
    ELEMENTS.historyList.appendChild(entryDiv);
  }

  // 個別グループの描画
  function renderIndividualGroup(group) {
    const entryDiv = createEntryDiv();
    const titleLine = createTitleLine(group);
    entryDiv.appendChild(titleLine);

    group.entries.forEach(entry => {
      const infoLine = createIndividualInfoLine(entry);
      entryDiv.appendChild(infoLine);
    });

    ELEMENTS.historyList.appendChild(entryDiv);
  }

  // 個別履歴の描画
  function renderIndividualHistory(history) {
    history.forEach(entry => {
      const entryDiv = createEntryDiv();
      const titleLine = createTitleLine(entry);
      const infoLine = createIndividualInfoLine(entry);

      entryDiv.appendChild(titleLine);
      entryDiv.appendChild(infoLine);
      ELEMENTS.historyList.appendChild(entryDiv);
    });
  }

  // 共通のUI要素作成関数
  function createEntryDiv() {
    const div = document.createElement("div");
    div.className = "entry";
    Object.assign(div.style, STYLES.entry);
    return div;
  }

  function createTitleLine(data) {
    const div = document.createElement("div");
    const link = document.createElement("a");
    link.href = data.url && data.url.trim() ? data.url : createBoothUrl(data.boothID);
    link.target = "_blank";
    link.textContent = data.title;
    link.title = data.title; // マウスオーバーで全文表示
    Object.assign(link.style, STYLES.titleLink);
    div.appendChild(link);
    return div;
  }

  function createBoothUrl(itemId) {
    return `https://booth.pm/${currentLanguage}/items/${itemId}`;
  }

  function createBulkInfoLine(group) {
    const infoLine = document.createElement("div");
    infoLine.style.display = "flex";
    infoLine.style.alignItems = "flex-start";
    infoLine.style.marginTop = "2px";

    const fileListDiv = document.createElement("div");
    fileListDiv.style.flexGrow = "1";
    fileListDiv.style.fontSize = "0.9em";
    fileListDiv.style.overflow = "hidden"; // 親要素にもoverflow: hiddenを設定
    fileListDiv.style.minWidth = "0"; // flexboxの子要素で縮小を許可するために必要

    group.entries.forEach(entry => {
      const fileEntry = document.createElement("div");
      fileEntry.style.whiteSpace = "nowrap";
      fileEntry.style.overflow = "hidden";
      fileEntry.style.textOverflow = "ellipsis";

      const text = `[${Helpers.formatTimestamp(entry.timestamp)}] ${entry.filename}`;
      fileEntry.textContent = text;
      fileEntry.title = text; // マウスオーバーで全文表示

      fileListDiv.appendChild(fileEntry);
    });

    const btnContainer = document.createElement("div");
    Object.assign(btnContainer.style, STYLES.btnContainer);
    btnContainer.style.marginLeft = "10px";

    // boothIDが数字の場合のみボタンを表示
    if (/^\d+$/.test(group.boothID)) {
      // 未登録状態を確認（registeredが明示的にfalseの場合のみ）
      const isUnregistered = group.entries.some(entry => entry.registered === false);
      const AEBtn = Helpers.createAssetButton("AvatarExplorer", "vrcae", "dir", group.entries, group.boothID, isUnregistered);
      const KABtn = Helpers.createAssetButton("KonoAsset", "konoasset", "path", group.entries, group.boothID, isUnregistered);

      btnContainer.appendChild(AEBtn);
      btnContainer.appendChild(KABtn);
    }
    infoLine.appendChild(fileListDiv);
    infoLine.appendChild(btnContainer);

    return infoLine;
  }

  function createIndividualInfoLine(entry) {
    const infoLine = document.createElement("div");
    infoLine.style.display = "flex";
    infoLine.style.alignItems = "center";
    infoLine.style.marginTop = "2px";

    const infoText = document.createElement("span");
    infoText.textContent = `[${Helpers.formatTimestamp(entry.timestamp)}] ${entry.filename}`;
    Object.assign(infoText.style, STYLES.infoText);

    const btnContainer = document.createElement("div");
    Object.assign(btnContainer.style, STYLES.btnContainer);

    if ((entry.filename || "").trim() !== "" && /^\d+$/.test(entry.boothID)) {
      // 未登録状態を確認（registeredが明示的にfalseの場合のみ）
      const isUnregistered = entry.registered === false;
      const AEBtn = Helpers.createAssetButton("AvatarExplorer", "vrcae", "dir", [entry], entry.boothID, isUnregistered);
      const KABtn = Helpers.createAssetButton("KonoAsset", "konoasset", "path", [entry], entry.boothID, isUnregistered);
      btnContainer.appendChild(AEBtn);
      btnContainer.appendChild(KABtn);
    }

    infoLine.appendChild(infoText);
    infoLine.appendChild(btnContainer);
    return infoLine;
  }

  // イベントリスナーの設定
  function setupEventListeners() {
    ELEMENTS.toggleFree.addEventListener("change", function () {
      chrome.storage.local.set({ filterFree: this.checked });
      renderHistory();
      window.scrollTo(0, 0);
    });
    ELEMENTS.toggleUnregistered.addEventListener("change", function () {
      chrome.storage.local.set({ filterUnregistered: this.checked });
      renderHistory();
      window.scrollTo(0, 0);
    });
    ELEMENTS.toggleGroup.addEventListener("change", function () {
      chrome.storage.local.set({ groupItems: this.checked });
      renderHistory();
      ELEMENTS.bulkRegisterToggle.style.display = this.checked ? 'flex' : 'none';
      window.scrollTo(0, 0);
    });
    ELEMENTS.toggleBulkRegister.addEventListener("change", function () {
      chrome.storage.local.set({ bulkRegister: this.checked });
      renderHistory();
      window.scrollTo(0, 0);
    });
    ELEMENTS.hideAvatarClipboard.addEventListener("change", function () {
      chrome.storage.local.set({ hideAvatarClipboard: this.checked });
    });
    ELEMENTS.languageSelect.addEventListener("change", function () {
      changeLanguage(this.value);
    });
    ELEMENTS.saveFolderBtn.addEventListener("click", function () {
      const folderPath = ELEMENTS.folderInput.value.trim();
      if (folderPath) {
        chrome.storage.local.set({ downloadFolderPath: folderPath });
      }
    });

    // 初期表示時の状態を反映
    ELEMENTS.bulkRegisterToggle.style.display = ELEMENTS.toggleGroup.checked ? 'flex' : 'none';

    // アップデート履歴モーダルの制御
    ELEMENTS.updateHistoryBtn.addEventListener("click", function () {
      fetch(chrome.runtime.getURL('CHANGELOG.json'))
        .then(response => response.json())
        .then(data => {
          const modalBody = document.querySelector('.modal-body');
          modalBody.innerHTML = '';

          data.versions.forEach(version => {
            const entry = document.createElement('div');
            entry.className = 'update-entry';

            const title = document.createElement('h3');
            title.textContent = `v${version.version}`;

            const date = document.createElement('p');
            date.textContent = version.date;

            const changes = document.createElement('ul');
            version.changes.forEach(change => {
              const li = document.createElement('li');
              li.textContent = change;
              changes.appendChild(li);
            });

            entry.appendChild(title);
            entry.appendChild(date);
            entry.appendChild(changes);
            modalBody.appendChild(entry);
          });

          ELEMENTS.updateHistoryModal.style.display = "block";
        })
        .catch(error => {
          console.error('アップデート履歴の読み込みに失敗しました:', error);
          alert(getMessage("updateHistoryLoadError") || 'アップデート履歴の読み込みに失敗しました。');
        });
    });

    ELEMENTS.updateHistoryClose.addEventListener("click", function () {
      ELEMENTS.updateHistoryModal.style.display = "none";
    });

    // モーダル外をクリックしたら閉じる
    window.addEventListener("click", function (event) {
      if (event.target === ELEMENTS.updateHistoryModal) {
        ELEMENTS.updateHistoryModal.style.display = "none";
      }
      if (event.target === ELEMENTS.supportModal) {
        ELEMENTS.supportModal.style.display = "none";
      }
      if (event.target === ELEMENTS.settingsModal) {
        ELEMENTS.settingsModal.style.display = "none";
      }
    });

    // 設定モーダルの制御
    if (ELEMENTS.settingsBtn && ELEMENTS.settingsModal && ELEMENTS.settingsModalClose) {
      ELEMENTS.settingsBtn.addEventListener("click", function () {
        ELEMENTS.settingsModal.style.display = "block";
      });

      ELEMENTS.settingsModalClose.addEventListener("click", function () {
        ELEMENTS.settingsModal.style.display = "none";
      });
    }

    // 支援モーダルの制御
    if (ELEMENTS.supportBtn && ELEMENTS.supportModal && ELEMENTS.supportModalClose) {
      ELEMENTS.supportBtn.addEventListener("click", function () {
        ELEMENTS.supportModal.style.display = "block";
      });

      ELEMENTS.supportModalClose.addEventListener("click", function () {
        ELEMENTS.supportModal.style.display = "none";
      });
    }
  }

  // 初期化
  initializeHistory();
  setupEventListeners();


  /*
  // JSON 出力 (AE Tools形式)
  ELEMENTS.exportAe.addEventListener("click", () => {
    chrome.storage.local.get("downloadHistory", function (result) {
      const history = result.downloadHistory || [];
      const grouped = {};
      history.forEach(entry => {
        const { title, boothID, filename, timestamp } = entry;
        if (!filename) return;
        if (!grouped[boothID]) {
          grouped[boothID] = {
            id: boothID,
            title: title,
            files: [filename],
            timestamp: timestamp
          };
        } else {
          grouped[boothID].files.push(filename);
          if (new Date(timestamp) > new Date(grouped[boothID].timestamp)) {
            grouped[boothID].title = title;
            grouped[boothID].timestamp = timestamp;
          }
        }
      });
      const outputArray = Object.values(grouped)
        .filter(group => group.files && group.files.length > 0)
        .map(group => ({
          title: group.title,
          id: Number(group.id),
          files: group.files
        }));
      const jsonContent = JSON.stringify(outputArray, null, 2);
      const blob = new Blob([jsonContent], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      chrome.downloads.download({
        url: url,
        filename: "downloadHistory_AE.json",
        conflictAction: "overwrite",
        saveAs: true
      }, (downloadId) => {
        setTimeout(() => URL.revokeObjectURL(url), 10000);
      });
    });
  });
  */

  // CSV 出力ボタン
  ELEMENTS.btnCsvExport.addEventListener("click", () => {
    chrome.storage.local.get("downloadHistory", function (result) {
      let history = result.downloadHistory || [];
      // タイムスタンプの降順にソート（最新のものが先頭になるように）
      history.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

      // CSVヘッダー
      const header = ['URL', 'timestamp', 'boothID', 'title', 'fileName', 'free', 'registered'].map(Helpers.escapeCSV).join(',');
      const lines = [header];

      history.forEach(entry => {
        // URLが空の場合は現在の言語設定でbooth.pm/(lang)/items/で埋める
        const url = entry.url && entry.url.trim() ? entry.url : createBoothUrl(entry.boothID);
        const line = [
          url,
          entry.timestamp,
          entry.boothID,
          entry.title,
          entry.filename,
          entry.free,
          entry.registered === true ? "true" : (entry.registered === false ? "false" : "")  // registeredが未設定の場合は空文字列
        ].map(Helpers.escapeCSV).join(',');
        lines.push(line);
      });

      const csvContent = lines.join('\n');
      // BOMを付与してUTF-8で出力
      const csvContentWithBom = "\uFEFF" + csvContent;
      const blob = new Blob([csvContentWithBom], { type: "text/csv;charset=UTF-8" });
      const urlBlob = URL.createObjectURL(blob);

      chrome.downloads.download({
        url: urlBlob,
        filename: "downloadHistory.csv",
        conflictAction: "overwrite",
        saveAs: true
      }, (downloadId) => {
        setTimeout(() => URL.revokeObjectURL(urlBlob), 10000);
      });
    });
  });

  // 対応アバターデータのダウンロード (JSON)
  ELEMENTS.btnDownloadSupported.addEventListener("click", () => {
    chrome.storage.local.get(['boothItems'], (result) => {
      const boothItems = result.boothItems || {};
      const savedItems = Object.values(boothItems).filter(item => item.category === 'saved');

      if (savedItems.length === 0) {
        alert(getMessage('noBoothItems') || 'No supported avatar data');
        return;
      }

      const exportData = {
        exportDate: new Date().toISOString(),
        version: "1.0",
        items: savedItems.map(item => ({
          id: item.id,
          name: item.name || `Item ${item.id}`
        }))
      };

      const jsonString = JSON.stringify(exportData, null, 2);
      const blob = new Blob([jsonString], { type: "application/json" });
      const urlBlob = URL.createObjectURL(blob);

      const now = new Date();
      const dateString = now.toISOString().split('T')[0];
      const filename = `booth-items-${dateString}.json`;

      chrome.downloads.download({
        url: urlBlob,
        filename: filename,
        saveAs: true
      }, () => {
        setTimeout(() => URL.revokeObjectURL(urlBlob), 10000);
      });
    });
  });

  // 対応アバターデータのインポート (JSON)
  ELEMENTS.btnImportSupported.addEventListener("click", () => {
    ELEMENTS.jsonInput.click();
  });

  ELEMENTS.jsonInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.type !== 'application/json' && !file.name.endsWith('.json')) {
      alert(getMessage('selectJsonFile') || 'Please select a JSON file.');
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const jsonData = JSON.parse(event.target.result);

        // Validate JSON
        if (!jsonData.items || !Array.isArray(jsonData.items)) {
          alert(getMessage('invalidJsonFormat') || 'Invalid JSON format.');
          return;
        }

        const validItems = [];
        jsonData.items.forEach(item => {
          if (item.id && item.name) {
            validItems.push({
              id: String(item.id),
              name: String(item.name),
              category: 'saved'
            });
          }
        });

        if (validItems.length === 0) {
          alert(getMessage('noValidItems') || 'No valid items found.');
          return;
        }

        const confirmMessage = getMessage('importReady', { count: validItems.length }) || `${validItems.length} items ready for import.`;
        if (!confirm(confirmMessage + '\n' + (getMessage('replaceDuplicates') || 'Existing items will be updated.'))) {
          return;
        }

        // Import logic (Simplified: Merge/Upsert)
        const result = await chrome.storage.local.get(['boothItems']);
        const existingItems = result.boothItems || {};

        let importedCount = 0;
        let updatedCount = 0;

        validItems.forEach(item => {
          if (existingItems[item.id]) {
            existingItems[item.id] = { ...existingItems[item.id], name: item.name, category: 'saved' };
            updatedCount++;
          } else {
            existingItems[item.id] = item;
            importedCount++;
          }
        });

        await chrome.storage.local.set({ boothItems: existingItems });

        let resultMsg = getMessage('importComplete') || 'Import complete: ';
        const results = [];
        if (importedCount > 0) results.push(getMessage('newItemsAdded', { count: importedCount }) || `${importedCount} added`);
        if (updatedCount > 0) results.push(getMessage('itemsUpdated', { count: updatedCount }) || `${updatedCount} updated`);

        alert(resultMsg + results.join(', '));

        // Reset input
        ELEMENTS.jsonInput.value = '';

      } catch (error) {
        console.error('Import error:', error);
        alert((getMessage('jsonParseError') || 'JSON Parse Error') + ': ' + error.message);
      }
    };
    reader.readAsText(file);
  });

  // CSVインポート処理
  ELEMENTS.btnImport.addEventListener("click", function () {
    ELEMENTS.csvInput.click();
  });
  ELEMENTS.csvInput.addEventListener("change", function (e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (event) {
      const text = event.target.result;
      importCSV(text);
    };
    reader.readAsText(file, "UTF-8");
  });

  // CSVをパースしてchrome.storage.localに追記する関数
  function importCSV(csvText) {
    const lines = csvText.split(/\r?\n/);
    if (lines.length === 0) return;
    // ヘッダー判定: 1行目が "URL","timestamp","boothID","title","fileName","free","registered" なら新形式
    let headerLine = lines[0].trim().replace(/^\uFEFF/, '');
    const headerColumns = headerLine.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(s => s.replace(/^"|"$/g, '').trim());
    let importedEntries = [];
    if (headerColumns.join(',') === "URL,timestamp,boothID,title,fileName,free,registered") {
      // v1.3.3以降の形式（registeredフラグを含む）
      for (let i = 1; i < lines.length; i++) {
        let line = lines[i].trim();
        if (!line) continue;
        const columns = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
        if (columns.length < 7) {
          console.error("CSVインポート: カラム数不足", line);
          continue;
        }
        const urlField = columns[0].replace(/^"|"$/g, '').trim();
        const timestamp = columns[1].replace(/^"|"$/g, '').trim();
        const boothID = columns[2].replace(/^"|"$/g, '').trim();
        const title = columns[3].replace(/^"|"$/g, '').trim();
        const fileName = columns[4].replace(/^"|"$/g, '').trim();
        const free = columns[5].replace(/^"|"$/g, '').trim().toLowerCase() === "true";
        const registeredValue = columns[6].replace(/^"|"$/g, '').trim();
        const registered = registeredValue === "" ? undefined : registeredValue.toLowerCase() === "true";
        importedEntries.push({ url: urlField, timestamp, boothID, title, filename: fileName, free, registered });
      }
    } else if (headerColumns.join(',') === "URL,timestamp,boothID,title,fileName,free") {
      // v1.3.3以前の形式（registeredフラグなし）
      for (let i = 1; i < lines.length; i++) {
        let line = lines[i].trim();
        if (!line) continue;
        const columns = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
        if (columns.length < 6) {
          console.error("CSVインポート: カラム数不足", line);
          continue;
        }
        const urlField = columns[0].replace(/^"|"$/g, '').trim();
        const timestamp = columns[1].replace(/^"|"$/g, '').trim();
        const boothID = columns[2].replace(/^"|"$/g, '').trim();
        const title = columns[3].replace(/^"|"$/g, '').trim();
        const fileName = columns[4].replace(/^"|"$/g, '').trim();
        const free = columns[5].replace(/^"|"$/g, '').trim().toLowerCase() === "true";
        importedEntries.push({ url: urlField, timestamp, boothID, title, filename: fileName, free });
      }
    } else {
      // "booth無料ダウンロード履歴"形式のCSVパース処理
      for (let i = 0; i < lines.length; i++) {
        let line = lines[i].trim();
        if (!line) continue;
        // 最初の行でboothIDが抽出できなければヘッダー行とみなしスキップ
        const tempIdMatch = line.match(/\/items\/(\d+)/);
        if (i === 0 && (!tempIdMatch || !tempIdMatch[1])) {
          continue;
        }
        // 改良版正規表現: 各フィールド内でダブルクオートが現れる場合、""として許容する
        const match = line.match(/^\s*"((?:[^"]|"")*)"\s*,\s*"((?:[^"]|"")*)"\s*$/);
        if (!match) {
          console.error("CSVインポート従来形式: パース失敗", line);
          continue;
        }
        // 各フィールド内の""を"に置換
        const urlField = match[1].replace(/""/g, '"');
        const manageName = match[2].replace(/""/g, '"');

        const idMatch = urlField.match(/\/items\/(\d+)/);
        const boothID = idMatch ? idMatch[1] : null;
        if (!boothID) {
          console.error("CSVインポート従来形式: boothID抽出失敗", urlField);
          continue;
        }
        const tsMatch = manageName.match(/^\s*\[([^\]]+)\]/);
        const timestamp = tsMatch ? tsMatch[1] : "";
        let rest = manageName.replace(/^\s*\[[^\]]+\]\s*/, "");
        const lastSlashIndex = rest.lastIndexOf("/");
        let title = lastSlashIndex !== -1 ? rest.substring(0, lastSlashIndex).trim() : rest.trim();
        const free = true;
        importedEntries.push({ url: urlField, timestamp, boothID, title, filename: "", free });
      }
    }
    // 既存の履歴とマージ（重複判定は boothID と filename で行う）
    chrome.storage.local.get("downloadHistory", function (result) {
      let history = result.downloadHistory || [];
      importedEntries.forEach(newEntry => {
        // まず、同じ boothID のエントリについて、マージ条件でフィルタする
        history = history.filter(existing => {
          if (existing.boothID !== newEntry.boothID) {
            return true; // boothIDが異なるならそのまま残す
          }
          const newFN = (newEntry.filename || "").trim();
          const existFN = (existing.filename || "").trim();
          if (newFN === "" && existFN === "") {
            // 両方とも空の場合は重複とする（既存を削除）
            return false;
          } else if (newFN === "" && existFN !== "") {
            // newEntryは空で既存はnon-empty → 既存を優先するので新Entryは追加しない（既存はそのまま残す）
            return true;
          } else if (newFN !== "" && existFN === "") {
            // newEntryはnon-emptyで既存が空 → 既存を削除
            return false;
          } else {
            // 両方non-empty：同じなら重複（削除）、異なるなら別のエントリとして残す
            return newFN !== existFN;
          }
        });
        // さらに、もし newEntry の filename が空で、既に同じ boothID のエントリで non-empty filename が存在する場合は、newEntry を追加しない
        if ((newEntry.filename || "").trim() === "") {
          const existsNonEmpty = history.some(entry => entry.boothID === newEntry.boothID && (entry.filename || "").trim() !== "");
          if (existsNonEmpty) {
            return; // スキップして新Entryを追加しない
          }
        }
        history.push(newEntry);
      });
      chrome.storage.local.set({ downloadHistory: history }, function () {
        renderHistory();
      });
    });
  }

  // 履歴全削除ボタン
  ELEMENTS.btnClear.addEventListener("click", function () {
    if (confirm(getMessage("confirmClearHistory"))) {
      chrome.storage.local.remove("downloadHistory", function () {
        renderHistory();
      });
    }
  });

  // 広告バナーのロード処理
  async function loadAdBanner() {
    const adContent = document.getElementById('ad-content');
    const adIndicators = document.getElementById('ad-indicators');
    const prevBtn = document.getElementById('ad-prev');
    const nextBtn = document.getElementById('ad-next');
    const adBanner = document.getElementById('ad-banner');

    if (!adContent) return;

    let adImages = [];
    try {
      const response = await fetch('https://ads.sakurayuki.dev/ads.json');
      if (response.ok) {
        adImages = await response.json();
      } else {
        console.warn('Failed to load ads.json');
      }
    } catch (error) {
      console.error('Error loading ads.json:', error);
    }

    // 画像がない場合はプレースホルダーを表示
    if (!adImages || adImages.length === 0) {
      const placeholder = document.createElement('div');
      placeholder.className = 'ad-slide active';
      placeholder.style.color = '#888';
      placeholder.style.fontSize = '12px';
      placeholder.textContent = 'Advertising Space (728x90)';
      adContent.appendChild(placeholder);

      // ナビゲーション非表示
      if (prevBtn) prevBtn.style.display = 'none';
      if (nextBtn) nextBtn.style.display = 'none';
      return;
    }

    // ランダムな開始位置を決定
    let currentIndex = Math.floor(Math.random() * adImages.length);
    let slideInterval;
    const intervalTime = 5000; // 5秒ごとに切り替え

    // 画像要素の生成
    adImages.forEach((adData, index) => {
      const imageFile = adData.src;
      const linkUrl = adData.url;

      // スライド
      const slide = document.createElement('div');
      slide.className = `ad-slide ${index === currentIndex ? 'active' : ''}`;

      // リンクがある場合はaタグを作成
      let contentContainer = slide;
      if (linkUrl) {
        const link = document.createElement('a');
        link.href = linkUrl;
        link.target = '_blank';
        link.style.display = 'block';
        link.style.width = '100%';
        link.style.height = '100%';
        link.title = linkUrl;
        slide.appendChild(link);
        contentContainer = link;
      }

      const img = document.createElement('img');
      if (imageFile.startsWith('http://') || imageFile.startsWith('https://')) {
        img.src = imageFile;
      } else {
        img.src = `assets/ads/${imageFile}`;
      }
      img.alt = 'Advertisement';
      img.onerror = function () {
        this.style.display = 'none';
        // 画像読み込みエラー時は親要素（slideまたはaタグ）にテキストを表示
        // aタグの場合はクリック可能にするためテキストを表示
        const errorText = document.createElement('div');
        errorText.textContent = 'Image not found';
        errorText.style.color = '#888';
        errorText.style.display = 'flex';
        errorText.style.justifyContent = 'center';
        errorText.style.alignItems = 'center';
        errorText.style.height = '100%';
        contentContainer.appendChild(errorText);
      };

      contentContainer.appendChild(img);
      adContent.appendChild(slide);

      // インジケーター
      const dot = document.createElement('div');
      dot.className = `ad-dot ${index === currentIndex ? 'active' : ''}`;
      dot.addEventListener('click', () => {
        goToSlide(index);
        resetTimer();
      });
      adIndicators.appendChild(dot);
    });

    // 画像が1枚だけの場合はナビゲーション非表示
    if (adImages.length <= 1) {
      if (prevBtn) prevBtn.style.display = 'none';
      if (nextBtn) nextBtn.style.display = 'none';
      if (adIndicators) adIndicators.style.display = 'none';
      return; // タイマーも設定しない
    }

    function showSlide(index) {
      const slides = adContent.querySelectorAll('.ad-slide');
      const dots = adIndicators.querySelectorAll('.ad-dot');

      slides.forEach(slide => slide.classList.remove('active'));
      dots.forEach(dot => dot.classList.remove('active'));

      slides[index].classList.add('active');
      dots[index].classList.add('active');
      currentIndex = index;
    }

    function nextSlide() {
      let newIndex = currentIndex + 1;
      if (newIndex >= adImages.length) {
        newIndex = 0;
      }
      showSlide(newIndex);
    }

    function prevSlide() {
      let newIndex = currentIndex - 1;
      if (newIndex < 0) {
        newIndex = adImages.length - 1;
      }
      showSlide(newIndex);
    }

    function goToSlide(index) {
      showSlide(index);
    }

    function startTimer() {
      slideInterval = setInterval(nextSlide, intervalTime);
    }

    function stopTimer() {
      clearInterval(slideInterval);
    }

    function resetTimer() {
      stopTimer();
      startTimer();
    }

    // イベントリスナー
    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        nextSlide();
        resetTimer();
      });
    }

    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        prevSlide();
        resetTimer();
      });
    }

    // ホバーでタイマー停止
    if (adBanner) {
      adBanner.addEventListener('mouseenter', stopTimer);
      adBanner.addEventListener('mouseleave', startTimer);
    }

    // 開始
    startTimer();
  }

  loadAdBanner();
});
