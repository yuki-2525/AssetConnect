document.addEventListener('DOMContentLoaded', function () {
  // 共通の定数と変数
  const ELEMENTS = {
    toggleFree: document.getElementById("toggleFree"),
    toggleGroup: document.getElementById("toggleGroup"),
    toggleBulkRegister: document.getElementById("toggleBulkRegister"),
    folderInput: document.getElementById("downloadFolder"),
    saveFolderBtn: document.getElementById("saveFolder"),
    historyList: document.getElementById("history-list"),
    csvInput: document.getElementById("csvInput"),
    exportAe: document.getElementById("export-ae"),
    btnCsvExport: document.getElementById("btn-csv-export"),
    btnImport: document.getElementById("btn-import"),
    btnClear: document.getElementById("btn-clear"),
    feedbackButton: document.getElementById("feedback-button"),
    bulkRegisterToggle: document.getElementById("bulkRegisterToggle"),
    updateHistoryBtn: document.getElementById("btn-update-history"),
    updateHistoryModal: document.getElementById("update-history-modal"),
    updateHistoryClose: document.querySelector("#update-history-modal .close")
  };

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
      alert(chrome.i18n.getMessage("saveFolderNotSet"));
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
  function initializeHistory() {
    // 保存済みのフォルダパスを読み込む
    chrome.storage.local.get("downloadFolderPath", function (result) {
      if (result.downloadFolderPath) {
        ELEMENTS.folderInput.value = result.downloadFolderPath;
      }
    });

    chrome.storage.local.get("downloadHistory", function (result) {
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
        history = history.filter(entry => entry.free === true);
      }
      history.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

      const container = ELEMENTS.historyList;
      container.innerHTML = "";

      if (history.length === 0) {
        container.innerHTML = `<p>${chrome.i18n.getMessage("noHistory")}</p>`;
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

    // 一括登録モードの場合、複数アイテムのグループのみをフィルタリング
    const filteredGroups = ELEMENTS.toggleBulkRegister.checked
      ? sortedGroups.filter(group => group.entries.length > 1)
      : sortedGroups;

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
    link.href = data.url && data.url.trim() ? data.url : `https://booth.pm/ja/items/${data.boothID}`;
    link.target = "_blank";
    link.textContent = data.title;
    Object.assign(link.style, STYLES.titleLink);
    div.appendChild(link);
    return div;
  }

  function createBulkInfoLine(group) {
    const infoLine = document.createElement("div");
    infoLine.style.display = "flex";
    infoLine.style.alignItems = "flex-start";
    infoLine.style.marginTop = "2px";

    const fileListDiv = document.createElement("div");
    fileListDiv.style.flexGrow = "1";
    fileListDiv.style.fontSize = "0.9em";
    group.entries.forEach(entry => {
      const fileEntry = document.createElement("div");
      fileEntry.style.whiteSpace = "nowrap";
      fileEntry.style.overflow = "hidden";
      fileEntry.style.textOverflow = "ellipsis";
      fileEntry.textContent = `[${Helpers.formatTimestamp(entry.timestamp)}] ${entry.filename}`;
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
    ELEMENTS.toggleFree.addEventListener("change", renderHistory);
    ELEMENTS.toggleGroup.addEventListener("change", function () {
      renderHistory();
      ELEMENTS.bulkRegisterToggle.style.display = this.checked ? 'flex' : 'none';
      if (!this.checked) {
        ELEMENTS.toggleBulkRegister.checked = false;
      }
    });
    ELEMENTS.toggleBulkRegister.addEventListener("change", renderHistory);
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
          alert('アップデート履歴の読み込みに失敗しました。');
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
    });
  }

  // 初期化
  initializeHistory();
  setupEventListeners();

  //HTML 内の data-i18n 属性をもつ要素のテキストを置換する
  document.querySelectorAll('[data-i18n]').forEach(function (el) {
    var msg = chrome.i18n.getMessage(el.getAttribute('data-i18n'));
    if (msg) {
      el.textContent = msg;
    }
  });

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
        // URLが空の場合はbooth.pm/(lang)/items/で埋める
        const uiLang = chrome.i18n.getUILanguage();
        let lang;
        if (uiLang.startsWith("ja")) {
          lang = "ja";
        } else if (uiLang.startsWith("ko")) {
          lang = "ko";
        } else {
          lang = "en";
        }
        const url = entry.url && entry.url.trim() ? entry.url : `https://booth.pm/${lang}/items/${entry.boothID}`;
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
    if (confirm(chrome.i18n.getMessage("confirmClearHistory"))) {
      chrome.storage.local.remove("downloadHistory", function () {
        renderHistory();
      });
    }
  });

  const uiLang = chrome.i18n.getUILanguage();
  let feedbackUrl;
  if (uiLang.startsWith("en")) {
    feedbackUrl = "https://forms.gle/U6GDvbx5n3zDRpTh9";  // 英語用のURL
  } else {
    feedbackUrl = "https://forms.gle/otwhoXKzc5EQQDti8";  // 日本語用のURL
  }
  ELEMENTS.feedbackButton.href = feedbackUrl;
});
