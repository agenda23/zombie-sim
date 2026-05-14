# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Status

実装済み: TypeScript ソースは `extension/src/`、ビルド成果物は `extension/dist/`（`npm run build`）。仕様の正本は `spec/`。

## What This Is

**X クソリプ表示拡張** — a Chrome Manifest V3 extension that injects fake "impression zombie" replies into X (twitter.com / x.com) post detail pages for the local user only. No server-side changes; no effect on other users.

## Planned Tech Stack

- TypeScript, bundled for Chrome MV3（`esbuild` / `npm run build`）
- OpenAI-compatible LLM API (user-provided credentials)
- `chrome.storage.local`, `chrome.runtime` messaging, optional `declarativeNetRequest`

ソース配置と成果物は `spec/design.md` のディレクトリ案に従う（ビルド出力は `extension/dist/`）。

```
extension/
  manifest.json
  src/
    background.ts   # Service Worker — LLM calls, caching, secret-keeping
    content.ts      # Content Script — DOM extraction, insertion, MutationObserver
    options.ts      # Settings UI controller
    presets.ts      # Bundled fallback reply strings
    types.ts        # Shared TS interfaces
  options.html
  styles/content.css
```

## Architecture

Three loosely-coupled components communicate only through `chrome.storage.local` and `chrome.runtime.sendMessage`:

1. **Options UI** (`options.html` + `options.ts`) — reads/writes settings (API key, base URL, model, reply count, toggle) to `chrome.storage.local`.

2. **Service Worker** (`background.ts`) — 唯一 API キーを読み LLM へ `fetch` する。`GENERATE_REPLIES` を受け取り、キャッシュ（24h TTL）→ LLM → **プリセット選定**の結果を文字列配列で返す。プリセット選定時もキャッシュに保存する。

3. **Content Script** (`content.ts`) — `https://x.com/*/status/*` および `https://twitter.com/*/status/*` のみ。本文抽出、`GENERATE_REPLIES` のメッセージ送信、**公式ポスト行に寄せた DOM**（`specification.md` §5）の挿入、`MutationObserver`（デバウンス・再試行上限）。ルートに `data-zombie-sim-root` を付与。

**Reply generation priority**: キャッシュ → LLM（有効かつキーあり）→ **SW 内プリセット**（Fisher–Yates 等）。コンテンツスクリプトは LLM を直接呼ばない。

## Key Design Constraints

- API key must never be logged or passed to the content script (see `spec/design.md` security section).
- XSS risk: all LLM-generated text must be inserted as `textContent`, never `innerHTML`.
- MutationObserver must debounce and cap retries to avoid infinite loops (X re-renders aggressively).
- DOM: 偽リプは **公式ツイート行と同型の階層**に寄せる（`specification.md` §5）。ページからの読み取り用 `data-testid` は抽出にのみ使い、生成ノードに `data-testid="tweet"` 等を重ねない。X の `r-*` / `css-*` クラスには依存しない。
- DOM selectors for post text extraction will break when X updates its markup — isolate them in a single extractor function.
- Phase 2 (optional): `declarativeNetRequest` to suppress live update requests; defer unless explicitly requested.

## Spec Files

| File | Contents |
|---|---|
| `spec/requirements.md` | Background, use cases, functional (R-01–R-05) and non-functional requirements |
| `spec/specification.md` | Detailed behavior spec: URL patterns, ON/OFF state, DOM insertion, caching, settings UI, permissions |
| `spec/design.md` | Component diagram, messaging protocol, LLM request/response contract, risk table, directory structure |
