# インストールガイド

Chrome Web Store には公開されていません。以下の手順で開発者モードを使って読み込みます。

## 事前準備

- **Node.js 18 以上**（ビルドに必要）
- **Chrome 120 以上**

## 手順

### 1. リポジトリを取得

```bash
git clone https://github.com/agenda23/zombie-sim.git
cd zombie-sim
```

または [Releases](https://github.com/agenda23/zombie-sim/releases) からソース ZIP をダウンロードして展開してください。

### 2. ビルド

```bash
npm install
npm run build
```

`extension/dist/` に `background.js`, `content.js`, `options.js`, `manifest.json` 等が生成されます。

### 3. Chrome に読み込む

1. Chrome アドレスバーに `chrome://extensions` と入力して開きます。
2. 右上の **「デベロッパーモード」** をオンにします。
3. **「パッケージ化されていない拡張機能を読み込む」** をクリックします。
4. ファイル選択ダイアログで `extension/dist/` フォルダを選択します。
5. 拡張機能一覧に「X インプレゾンビ表示（ローカル演出）」が表示されれば完了です。

## Chrome 再起動時の警告について

デベロッパーモードで読み込んだ拡張機能がある場合、Chrome 起動時に  
**「デベロッパーモードの拡張機能を無効にする」** というダイアログが表示されることがあります。  
**「拡張機能を有効のままにする」** を選択してください。

> デベロッパーモードを無効にすると拡張機能も無効になります。  
> Chrome Web Store 経由でインストールした拡張機能ではないため、この確認は起動のたびに表示される場合があります。

## 更新

```bash
git pull
npm run build
```

ビルド後、`chrome://extensions` で拡張機能の **更新ボタン（↻）** をクリックするか、ページをリロードすると最新版が適用されます。

## アンインストール

`chrome://extensions` で拡張機能カードの **「削除」** をクリックします。  
`chrome.storage.local` に保存された設定・キャッシュも同時に削除されます。
