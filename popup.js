document.addEventListener('DOMContentLoaded', function() {
  const toggleCheckbox = document.getElementById("toggleFree");

  // ヘルパー関数: タイムスタンプを "YYYY-MM-DD HH:mm:ss" 形式にフォーマット
  function formatTimestamp(ts) {
    const date = new Date(ts);
    const pad = n => n.toString().padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  }

  function renderHistory() {
    chrome.storage.local.get("downloadHistory", function(result) {
      let history = result.downloadHistory || [];
      if (document.getElementById("toggleFree").checked) {
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
        // 既に保存されている timestamp を新しい形式に変換して表示
        const formattedTime = formatTimestamp(entry.timestamp);
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
      const outputArray = Object.values(grouped).map(group => ({
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

  // 全項目JSON出力
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
});
