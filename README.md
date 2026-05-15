# X インプレゾンビ表示（ローカル演出）

X (Twitter) のポスト詳細ページに、自分の画面だけで偽のインプレゾンビ風リプライを表示する Chrome 拡張です。  
サーバー・他者の表示には一切影響しません。

> **注意**: 本機能はローカル演出です。スクリーンショット等で第三者を誤認させる用途は利用者の責任となります。

## インストール

Chrome Web Store には公開されていません。開発者モードで読み込む野良拡張です。  
→ **[インストールガイド](docs/install.md)** を参照してください。

## 開発

```bash
# 依存パッケージのインストール
npm install

# ビルド（extension/dist/ に出力）
npm run build

# 監視ビルド
npm run watch
```

**動作確認**: ビルド後 `chrome://extensions` → デベロッパーモード ON → `extension/dist/` を読み込む。

## 設定

拡張アイコンを右クリック → **オプション** から設定できます。  
→ **[設定ガイド](docs/settings.md)**

| 項目 | 既定値 | 説明 |
|------|--------|------|
| 拡張を有効にする | ON | オフで挿入停止・既存ノード除去 |
| LLM で生成する | OFF | ON + API キー設定時に LLM を使用 |
| API キー | — | OpenAI 互換エンドポイントのキー（ローカル保存） |
| API ベース URL | `https://api.openai.com/v1` | 末尾 `/v1` まで |
| モデル名 | `gpt-4o-mini` | — |
| 偽リプ件数 | `5` | 1〜50 |
| 空本文時の動作 | プリセット | 本文取得失敗時の挙動 |

API キーを設定しなくてもプリセット文言（37 種）で動作します。

## 仕組み

- **対象**: `https://x.com/*/status/*`・`https://twitter.com/*/status/*` のみ
- **生成優先度**: キャッシュ（24 h TTL）→ LLM API → プリセット
- **DOM**: `section[data-zombie-sim-root]` を先頭 `article` 直後に挿入。`zombie-sim-*` クラスのみ使用
- **再挿入**: `MutationObserver` でノード消失を検知して自動復帰（上限 45 回/分）
- **SPA 対応**: 500 ms ポーリングで URL 変化を検知

## ドキュメント

| | |
|---|---|
| [インストールガイド](docs/install.md) | 野良拡張の読み込み手順 |
| [設定ガイド](docs/settings.md) | オプション画面の各項目 |
| [トラブルシューティング](docs/troubleshooting.md) | よくある問題と対処法 |
| [要件定義](spec/requirements.md) | R-01〜R-05、非機能要件 |
| [機能仕様](spec/specification.md) | URL パターン、DOM 挿入、キャッシュ仕様 |
| [設計](spec/design.md) | コンポーネント図、メッセージプロトコル、リスク表 |
