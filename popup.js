document.addEventListener('DOMContentLoaded', function() {
  const toggleCheckbox = document.getElementById("toggleFree");

  // ヘルパー関数: タイムスタンプを "YYYY-MM-DD HH:mm:ss" 形式にフォーマット
  function formatTimestamp(ts) {
    const date = new Date(ts);
    const pad = n => n.toString().padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  }

  // 履歴一覧を描画する関数（toggleCheckbox がチェックなら free:true のものだけ表示）
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
        div.innerHTML = `<span>[${formattedTime}]</span> <a href="${url}" target="_blank">${entry.title}</a>`;
        container.appendChild(div);
      });
    });
  }

  // 初期レンダリング
  renderHistory();

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
        // filenameがnullや空の場合はスキップ
        if (!filename) return;
        if (!grouped[boothID]) {
          grouped[boothID] = {
            id: boothID,
            title: title,
            files: [filename],
            timestamp: timestamp
          };
        } else {
          // filenameが有効なら追加
          if (filename) {
            grouped[boothID].files.push(filename);
          }
          // タイムスタンプが新しい場合はタイトルとtimestampを更新
          if (new Date(timestamp) > new Date(grouped[boothID].timestamp)) {
            grouped[boothID].title = title;
            grouped[boothID].timestamp = timestamp;
          }
        }
      });
      // filesがnullまたは空のグループは除外
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

  // 履歴全削除ボタン
  document.getElementById("btn-clear").addEventListener("click", function() {
    if (confirm("履歴を全削除しますか？")) {
      chrome.storage.local.remove("downloadHistory", function() {
        renderHistory();
      });
    }
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

  // CSVをパースして chrome.storage.local に追記する関数
  function importCSV(csvText) {
    const lines = csvText.split(/\r?\n/);
    const importedEntries = [];
    lines.forEach(line => {
      if (!line.trim()) return;
      // 簡易CSVパース（カンマ区切り、各フィールドはダブルクオーテーションで囲まれていると想定）
      const match = line.match(/^\s*"([^"]+)"\s*,\s*"([^"]+)"\s*$/);
      if (!match) {
        console.error("CSVパース失敗:", line);
        return;
      }
      const urlField = match[1];
      const manageName = match[2];
  
      // boothID: URLの/items/の後ろの数字を抽出
      const idMatch = urlField.match(/\/items\/(\d+)/);
      const boothID = idMatch ? idMatch[1] : null;
      if (!boothID) {
        console.error("boothID抽出失敗:", urlField);
        return;
      }
      // タイムスタンプ抽出: 管理名称の先頭の角括弧内
      const tsMatch = manageName.match(/^\s*\[([^\]]+)\]/);
      const timestamp = tsMatch ? tsMatch[1] : "";
      // 管理名称から角括弧とその後の空白を除去
      let rest = manageName.replace(/^\s*\[[^\]]+\]\s*/, "");
      // タイトルは、rest の最後の "/" の手前まで（最後の "/" より前の文字列）
      const lastSlashIndex = rest.lastIndexOf("/");
      let title = lastSlashIndex !== -1 ? rest.substring(0, lastSlashIndex).trim() : rest.trim();
  
      // free属性: CSV インポートの場合は全て true にする
      const free = true;
  
      const newEntry = {
        url: urlField,
        boothID: boothID,
        timestamp: timestamp,  // 既に "YYYY-MM-DD HH:mm:ss" 形式であると仮定
        title: title,
        free: free
      };
      importedEntries.push(newEntry);
    });
  
    // 既存の履歴とマージ（重複エントリは boothID と title が同じ場合は置き換え）
    chrome.storage.local.get("downloadHistory", function(result) {
      let history = result.downloadHistory || [];
      importedEntries.forEach(newEntry => {
        history = history.filter(entry => !(entry.boothID === newEntry.boothID && entry.title === newEntry.title));
        history.push(newEntry);
      });
      chrome.storage.local.set({ downloadHistory: history }, function() {
        console.log("CSVインポート完了。インポート件数:", importedEntries.length);
        renderHistory();
      });
    });
  }  
});
