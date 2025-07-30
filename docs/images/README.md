# 画像フォルダ

このフォルダにはAssetConnectのドキュメントで使用する画像を配置します。

## 必要な画像一覧

### トップページ (index.html)
- `main-window.png` - AssetConnect拡張機能のポップアップ画面（全機能が見える状態）

### 導入方法 (intro/index.html)
- `github-releases.png` - GitHub Releasesページでのダウンロード画面
- `chrome-extensions.png` - Chrome拡張機能ページでデベロッパーモード有効化
- `load-extension.png` - 拡張機能の読み込み手順
- `extension-installed.png` - インストール完了状態の拡張機能一覧
- `browser-toolbar.png` - ブラウザツールバーのAssetConnectアイコン
- `download-folder-setting.png` - ダウンロードフォルダ設定画面
- `filtering-options.png` - フィルタリングオプション設定画面

### 使い方 (tutorial/index.html)
- `popup-overview.png` - AssetConnectポップアップの全体概要（各UI要素にラベル付き）
- `booth-library.png` - BOOTHライブラリページの表示
- `download-tracking.png` - ダウンロード追跡の様子を示す画面
- `download-history.png` - ダウンロード履歴リストの表示例
- `export-buttons.png` - エクスポートボタンの表示
- `csv-export.png` - CSV形式でのエクスポート結果
- `json-export.png` - JSON形式でのエクスポート結果
- `history-filtering.png` - 履歴フィルタリング機能の表示
- `settings-area.png` - 設定エリアの表示状態

### BOOTHページでの動作例
- `booth-shop-page.png` - BOOTH商品ページでのダウンロード
- `booth-order-page.png` - BOOTH注文履歴ページでのダウンロード
- `booth-gift-page.png` - BOOTHギフトページでのダウンロード
- `download-link-click.png` - ダウンロードリンクをクリックする様子

## 画像の要件

### 技術的要件
- **形式**: PNG推奨（ブラウザUIのため透明背景が有効）
- **解像度**: 最低1280x720px、高DPI対応のため1920x1080px推奨
- **ファイルサイズ**: ウェブ表示のため1MB以下推奨

### 内容要件
- **UI要素**: 重要なボタンやフィールドが明確に見える
- **テキスト**: 日本語UIの場合は日本語で表示
- **データ**: 実際のBOOTHダウンロードデータが表示されている状態
- **状態**: 各機能が動作している状態を撮影

### 撮影のコツ
1. **ブラウザ環境**: Chrome/Edgeの明るいテーマを使用
2. **クリーンな状態**: 不要なタブや拡張機能は非表示にする
3. **適切なズーム**: 文字が読める程度にズーム（100-125%推奨）
4. **実データ**: 実際のBOOTHダウンロードデータを使用
5. **一貫性**: 同じブラウザ環境・設定で撮影

## ファイル命名規則
- 小文字とハイフンを使用: `popup-overview.png`
- 内容が分かりやすい名前
- 連番が必要な場合: `step-01.png`, `step-02.png`

## ロゴファイル
- `AssetConnect_Logo.png` - AssetConnectのメインロゴ
- `icon-16.png`, `icon-48.png`, `icon-128.png` - 拡張機能アイコン各サイズ