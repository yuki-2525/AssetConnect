document.addEventListener('DOMContentLoaded', function() {
  const toggleCheckbox = document.getElementById("toggleFree");

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

  // 履歴一覧を描画する関数（toggleCheckboxがチェックなら free:true のものだけ表示）
  function renderHistory() {
    chrome.storage.local.get("downloadHistory", function(result) {
      let history = result.downloadHistory || [];
      if (toggleCheckbox.checked) {
        history = history.filter(entry => entry.free === true);
      }
      // 最新のエントリが上になるようにソート
      history.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      const container = document.getElementById("history-list");
      container.innerHTML = "";
      if (history.length === 0) {
        container.innerHTML = "<p>履歴なし</p>";
        return;
      }
      history.forEach(entry => {
        // 既存の timestamp をフォーマットして表示
        const formattedTime = formatTimestamp(entry.timestamp);
        // URL属性がない場合は https://booth.pm/ja/items/{boothID} を埋め込む
        const url = entry.url && entry.url.trim() ? entry.url : `https://booth.pm/ja/items/${entry.boothID}`;
        const div = document.createElement("div");
        div.className = "entry";
        // 表示形式: [タイムスタンプ] タイトル（タイトルはリンク）
        div.innerHTML = `<span>[${formattedTime}]</span> <a href="${url}" target="_blank">${entry.title}</a>`;
        container.appendChild(div);
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

  // 全項目JSON出力ボタン
  document.getElementById("export-full").addEventListener("click", () => {
    chrome.storage.local.get("downloadHistory", function(result) {
      const history = result.downloadHistory || [];
      const jsonContent = JSON.stringify(history, null, 2);
      const blob = new Blob([jsonContent], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      chrome.downloads.download({
        url: url,
        filename: "downloadHistory_full.json",
        conflictAction: "uniquify",
        saveAs: true
      }, (downloadId) => {
        console.log("全項目JSON 出力完了, downloadId:", downloadId);
        setTimeout(() => URL.revokeObjectURL(url), 10000);
      });
    });
  });

  // CSV 出力ボタン
  document.getElementById("btn-csv-export").addEventListener("click", () => {
    chrome.storage.local.get("downloadHistory", function(result) {
      const history = result.downloadHistory || [];
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
      // BOMを付与してUTF-8でエクスポート
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
        const free = columns[5].replace(/^"|"$/g, '').trim().toLowerCase() === "true";
        importedEntries.push({ url: urlField, timestamp, boothID, title, filename: fileName, free });
      }
    } else {
      // 従来形式（2カラム形式）としてパース
      for (let i = 0; i < lines.length; i++) {
        let line = lines[i].trim();
        if (!line) continue;
        const match = line.match(/^\s*"([^"]+)"\s*,\s*"([^"]+)"\s*$/);
        if (!match) {
          console.error("CSVインポート従来形式: パース失敗", line);
          continue;
        }
        const urlField = match[1];
        const manageName = match[2];
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
    // 既存の履歴とマージ（重複エントリは boothID と filename が同じ場合は置き換え）
    chrome.storage.local.get("downloadHistory", function(result) {
      let history = result.downloadHistory || [];
      importedEntries.forEach(newEntry => {
        history = history.filter(entry => !(entry.boothID === newEntry.boothID && entry.filename === newEntry.filename));
        history.push(newEntry);
      });      
      chrome.storage.local.set({ downloadHistory: history }, function() {
        console.log("CSVインポート完了。インポート件数:", importedEntries.length);
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
