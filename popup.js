document.addEventListener('DOMContentLoaded', function() {
  const toggleCheckbox = document.getElementById("toggleFree");
  const folderInput = document.getElementById("downloadFolder");
  const saveFolderBtn = document.getElementById("saveFolder");

  // 初回起動時に free 属性が空のエントリを false に更新
  chrome.storage.local.get("downloadHistory", function(result) {
    let history = result.downloadHistory || [];
    let updated = false;
    for (let i = 0; i < history.length; i++) {
      if (history[i].free === undefined || history[i].free === null || history[i].free === "") {
        history[i].free = false;
        updated = true;
      }
    }
    if (updated) {
      chrome.storage.local.set({ downloadHistory: history }, function() {
        console.log("free属性の未設定エントリをfalseに更新しました");
        renderHistory();
      });
    } else {
      renderHistory();
    }
  });

  // ヘルパー関数: タイムスタンプを "YYYY-MM-DD HH:mm:ss" 形式にフォーマット
  function formatTimestamp(ts) {
    const date = new Date(ts);
    const pad = n => n.toString().padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  }

  // CSVフィールド用のエスケープ関数
  function escapeCSV(value) {
    if (value == null) return "";
    let str = value.toString();
    str = str.replace(/"/g, '""');
    return `"${str}"`;
  }

  // 保存済みのフォルダパスを読み込む
  chrome.storage.local.get("downloadFolderPath", function(result) {
    if (result.downloadFolderPath) {
      folderInput.value = result.downloadFolderPath;
    }
  });

  // 「保存」ボタンのクリックイベントで値を保存
  saveFolderBtn.addEventListener("click", function() {
    const folderPath = folderInput.value.trim();
    chrome.storage.local.set({ downloadFolderPath: folderPath }, function() {
      console.log("ダウンロードフォルダのパスを保存しました:", folderPath);
    });
  });

  // 履歴一覧を描画する関数（toggleCheckboxがチェックなら free:true のものだけ表示）
  function renderHistory() {
    chrome.storage.local.get("downloadHistory", function(result) {
      let history = result.downloadHistory || [];
      if (toggleCheckbox.checked) {
        history = history.filter(entry => entry.free === true);
      }
      // タイムスタンプ降順にソート（最新が先頭）
      history.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      const container = document.getElementById("history-list");
      container.innerHTML = "";
      if (history.length === 0) {
        container.innerHTML = "<p>履歴なし</p>";
        return;
      }
      
      history.forEach(entry => {
        const formattedTime = formatTimestamp(entry.timestamp);
        const linkUrl = entry.url && entry.url.trim() ? entry.url : `https://booth.pm/ja/items/${entry.boothID}`;
        
        // エントリ全体のコンテナ（2段表示）
        const entryDiv = document.createElement("div");
        entryDiv.className = "entry";
        entryDiv.style.display = "flex";
        entryDiv.style.flexDirection = "column";
        entryDiv.style.borderBottom = "1px solid #ccc";
        entryDiv.style.padding = "5px 0";
        entryDiv.style.marginBottom = "4px";
        
        // 上段：タイトル（リンク付き）
        const titleLine = document.createElement("div");
        const titleLink = document.createElement("a");
        titleLink.href = linkUrl;
        titleLink.target = "_blank";
        titleLink.textContent = entry.title;
        titleLink.style.fontSize = "0.9em";
        titleLink.style.whiteSpace = "nowrap";
        titleLink.style.overflow = "hidden";
        titleLink.style.textOverflow = "ellipsis";
        titleLine.appendChild(titleLink);
        
        // 下段：タイムスタンプ、ファイル名、ボタン群
        const infoLine = document.createElement("div");
        infoLine.style.display = "flex";
        infoLine.style.alignItems = "center";
        infoLine.style.marginTop = "2px";
        
        // 左側：タイムスタンプとファイル名
        const infoText = document.createElement("span");
        infoText.textContent = `[${formattedTime}] ${entry.filename}`;
        infoText.style.fontSize = "0.9em";
        infoText.style.whiteSpace = "nowrap";
        infoText.style.overflow = "hidden";
        infoText.style.textOverflow = "ellipsis";
        infoText.style.flexGrow = "1";
        
        // 右側：ボタン群（ファイル名が空でない場合のみ追加）
        const btnContainer = document.createElement("div");
        btnContainer.style.display = "flex";
        btnContainer.style.gap = "10px";
        btnContainer.style.flexShrink = "0";
        if ((entry.filename || "").trim() !== "") {
          // 共通ボタンスタイル
          const btnStyle = {
            fontSize: "1em",
            padding: "6px 12px",
            minWidth: "130px",
            cursor: "pointer"
          };
          
          // AvatarExplorerボタン
          const avatarBtn = document.createElement("button");
          avatarBtn.textContent = "AvatarExplorer";
          Object.assign(avatarBtn.style, btnStyle);
          avatarBtn.addEventListener("click", function(event) {
            event.stopPropagation();
            event.preventDefault();
            chrome.storage.local.get("downloadFolderPath", function(result) {
              const dir = result.downloadFolderPath || "";
              if (dir.trim() === "") {
                alert("ダウンロード先フォルダが設定されていません。上部のフォルダ入力欄から設定してください。");
                return;
              }
              const assetUrl = `VRCAE://addAsset?dir=${encodeURIComponent(dir + "/" + entry.filename)}&id=${entry.boothID}`;
              window.location.href = assetUrl;
            });
          });
          
          // KonoAssetボタン
          const konoBtn = document.createElement("button");
          konoBtn.textContent = "KonoAsset";
          Object.assign(konoBtn.style, btnStyle);
          konoBtn.addEventListener("click", function(event) {
            event.stopPropagation();
            event.preventDefault();
            chrome.storage.local.get("downloadFolderPath", function(result) {
              const dir = result.downloadFolderPath || "";
              if (dir.trim() === "") {
                alert("ダウンロード先フォルダが設定されていません。上部のフォルダ入力欄から設定してください。");
                return;
              }
              const assetUrl = `konoasset://addAsset?dir=${encodeURIComponent(dir + "/" + entry.filename)}&id=${entry.boothID}`;
              window.location.href = assetUrl;
            });
          });
          
          btnContainer.appendChild(avatarBtn);
          btnContainer.appendChild(konoBtn);
        }
        
        infoLine.appendChild(infoText);
        infoLine.appendChild(btnContainer);
        
        entryDiv.appendChild(titleLine);
        entryDiv.appendChild(infoLine);
        
        container.appendChild(entryDiv);
      });
    });
  }  

  // トグル変更時に再描画
  toggleCheckbox.addEventListener("change", function() {
    renderHistory();
  });

  // JSON 出力 (AE Tools形式)
  document.getElementById("export-ae").addEventListener("click", () => {
    chrome.storage.local.get("downloadHistory", function(result) {
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
        conflictAction: "uniquify",
        saveAs: true
      }, (downloadId) => {
        console.log("JSON 出力(AE Tools形式)完了, downloadId:", downloadId);
        setTimeout(() => URL.revokeObjectURL(url), 10000);
      });
    });
  });

  // CSV 出力ボタン
  document.getElementById("btn-csv-export").addEventListener("click", () => {
    chrome.storage.local.get("downloadHistory", function(result) {
      let history = result.downloadHistory || [];
      // タイムスタンプの降順にソート（最新のものが先頭になるように）
      history.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      
      // CSVヘッダー
      const header = ['URL', 'timestamp', 'boothID', 'title', 'fileName', 'free'].map(escapeCSV).join(',');
      const lines = [header];
      
      history.forEach(entry => {
        // URLが空の場合はデフォルトで埋める
        const url = entry.url && entry.url.trim() ? entry.url : `https://booth.pm/ja/items/${entry.boothID}`;
        const line = [
          url,
          entry.timestamp,
          entry.boothID,
          entry.title,
          entry.filename,
          entry.free
        ].map(escapeCSV).join(',');
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
        conflictAction: "uniquify",
        saveAs: true
      }, (downloadId) => {
        console.log("CSV 出力完了, downloadId:", downloadId);
        setTimeout(() => URL.revokeObjectURL(urlBlob), 10000);
      });
    });
  });


  // CSVインポート処理
  const csvInput = document.getElementById("csvInput");
  document.getElementById("btn-import").addEventListener("click", function() {
    csvInput.click();
  });
  csvInput.addEventListener("change", function(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(event) {
      const text = event.target.result;
      importCSV(text);
    };
    reader.readAsText(file, "UTF-8");
  });

  // CSVをパースしてchrome.storage.localに追記する関数
  function importCSV(csvText) {
    const lines = csvText.split(/\r?\n/);
    if (lines.length === 0) return;
    // ヘッダー判定: 1行目が "URL","timestamp","boothID","title","fileName","free" なら新形式
    let headerLine = lines[0].trim().replace(/^\uFEFF/, '');
    const headerColumns = headerLine.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(s => s.replace(/^"|"$/g, '').trim());
    let importedEntries = [];
    if (headerColumns.join(',') === "URL,timestamp,boothID,title,fileName,free") {
      // 新形式
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
        // free属性は新形式の場合も、CSV側の値をそのまま利用
        const free = columns[5].replace(/^"|"$/g, '').trim().toLowerCase() === "true";
        importedEntries.push({ url: urlField, timestamp, boothID, title, filename: fileName, free });
      }
    } else {
      // 従来形式のCSVパース処理（改良版）
      for (let i = 0; i < lines.length; i++) {
        let line = lines[i].trim();
        if (!line) continue;
        // 最初の行でboothIDが抽出できなければヘッダー行とみなしスキップ
        const tempIdMatch = line.match(/\/items\/(\d+)/);
        if (i === 0 && (!tempIdMatch || !tempIdMatch[1])) {
          console.log("ヘッダー行としてスキップ:", line);
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
        // 従来形式は全て free:true とする
        const free = true;
        importedEntries.push({ url: urlField, timestamp, boothID, title, filename: "", free });
      }
    }
    // 既存の履歴とマージ（重複判定は boothID と filename で行う）
    chrome.storage.local.get("downloadHistory", function(result) {
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
      chrome.storage.local.set({ downloadHistory: history }, function() {
        console.log("CSVインポート完了。インポート件数:", importedEntries.length);
        // 表示更新
        renderHistory();
      });
    });
  }


  // 履歴全削除ボタン
  document.getElementById("btn-clear").addEventListener("click", function() {
    if (confirm("履歴を全削除しますか？")) {
      chrome.storage.local.remove("downloadHistory", function() {
        renderHistory();
      });
    }
  });
  
});
