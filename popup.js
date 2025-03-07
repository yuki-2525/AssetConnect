// popup.js

// JSON 出力(AE Tools形式)ボタン：同一 boothID ごとにグループ化して、最新のタイトルを採用し、files 配列にまとめる（timestamp は除外）
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
            timestamp: timestamp  // 最新かどうかの判断用
          };
        } else {
          grouped[boothID].files.push(filename);
          // タイムスタンプが新しい場合はタイトルを更新
          if (new Date(timestamp) > new Date(grouped[boothID].timestamp)) {
            grouped[boothID].title = title;
            grouped[boothID].timestamp = timestamp;
          }
        }
      });
  
      // 出力形式：timestamp を除去
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
  
  // タイムスタンプ付きJSON出力ボタン：保存されたすべてのエントリをそのまま出力
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
        console.log("タイムスタンプ付きJSON出力完了, downloadId:", downloadId);
        setTimeout(() => URL.revokeObjectURL(url), 10000);
      });
    });
  });
  
  // 履歴全削除ボタン：chrome.storage.local の "downloadHistory" を空にする
  document.getElementById("clear").addEventListener("click", () => {
    chrome.storage.local.remove("downloadHistory", () => {
      console.log("ダウンロード履歴を全削除しました");
      alert("ダウンロード履歴を全削除しました");
    });
  });
  