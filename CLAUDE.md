# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Status

実装済み: TypeScript ソースは `extension/src/`、ビルド成果物は `extension/dist/`（`npm run build`）。仕様の正本は `spec/`。

## What This Is

**X クソリプ表示拡張** — a Chrome Manifest V3 extension that injects fake "impression zombie" replies into X (twitter.com / x.com) post detail pages for the local user only. No server-side changes; no effect on other users.

## Tech Stack

- TypeScript → esbuild → Chrome MV3 (`npm run build` → `extension/dist/`)
- OpenAI-compatible LLM API (user-provided credentials; default model `gpt-4o-mini`)
- `chrome.storage.local` + `chrome.runtime.sendMessage`

```
extension/
  manifest.json
  src/
    background.ts   # Service Worker — LLM calls, caching, secret-keeping
    content.ts      # Content Script — DOM extraction, insertion, MutationObserver
    options.ts      # Settings UI controller
    presets.ts      # 37 bundled fallback reply strings (Fisher-Yates shuffle)
    types.ts        # ZombieSettings, message types, CacheEntry, DEFAULT_SETTINGS
  options.html
  styles/content.css
dist/               # built output (gitignored)
docs/               # end-user distribution guides (Japanese)
```

## Architecture

Three components communicate only through `chrome.storage.local` and `chrome.runtime.sendMessage`:

1. **Options UI** (`options.html` + `options.ts`) — reads/writes `ZombieSettings` to `chrome.storage.local` under key `zombieSim:settings`. Defaults: `enabled=true`, `llmEnabled=false`, `replyCount=5`.

2. **Service Worker** (`background.ts`) — only component that reads the API key or calls `fetch`. On `GENERATE_REPLIES`: checks cache (`zombieSim:cache:<url>`, 24 h TTL) → calls LLM → falls back to `pickPresetReplies`. Writes to cache in all cases (including preset path). Truncates post text to 12 000 chars before sending to LLM.

3. **Content Script** (`content.ts`) — matches `https://x.com/*/status/*` and `https://twitter.com/*/status/*`. Extracts post text via `extractMainPostText()`, sends `GENERATE_REPLIES`, inserts `section[data-zombie-sim-root]` after the first `article` in `main`. Re-insertion via `MutationObserver` on `main` subtree; debounce 200 ms, cap 45 retries/min. SPA navigation detected by 500 ms `setInterval` comparing `location.href`. 10 built-in fake identities (`local_zmb_01`–`local_zmb_10`).

**Reply generation priority**: cache → LLM (if `llmEnabled` and `apiKey` set) → SW-side presets. Content script never calls LLM directly.

## Key Design Constraints

- API key must never be logged or passed to the content script.
- All LLM-generated text inserted as `textContent` only — `innerHTML` is forbidden.
- MutationObserver debounces at 200 ms and stops after 45 retries per 60 s window.
- DOM: generated nodes use `zombie-sim-*` classes only. `data-testid` attributes from the page are used for **reading only** — never assigned to generated nodes. No dependency on X's `r-*` / `css-*` hashed classes.
- `extractMainPostText()` is the single choke-point for X DOM selectors — isolate breakage there.
- Phase 2 (optional): `declarativeNetRequest` to suppress live updates; defer unless explicitly requested.

## Spec Files

| File | Contents |
|---|---|
| `spec/requirements.md` | Background, use cases, functional (R-01–R-05) and non-functional requirements |
| `spec/specification.md` | Detailed behavior spec: URL patterns, ON/OFF state, DOM insertion, caching, settings UI, permissions |
| `spec/design.md` | Component diagram, messaging protocol, LLM request/response contract, risk table, directory structure |

## Distribution Docs (`docs/`)

| File | Contents |
|---|---|
| `docs/install.md` | End-user installation guide (developer mode / sideload) |
| `docs/settings.md` | Options page reference |
| `docs/troubleshooting.md` | Common issues and fixes |
