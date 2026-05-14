import {
  DEFAULT_SETTINGS,
  MESSAGE_GENERATE_REPLIES,
  SETTINGS_STORAGE_KEY,
  type GenerateRepliesPayload,
  type GenerateRepliesResult,
  type ZombieSettings,
} from "./types";

const ROOT_ATTR = "data-zombie-sim-root";
const CS_TRUNCATE = 8_000;

const DEBOUNCE_MS = 200;
const RETRY_WINDOW_MS = 60_000;
const MAX_RETRIES_PER_WINDOW = 45;

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let observer: MutationObserver | null = null;
let lastNormalizedUrl = "";
const retryState = { windowStart: 0, count: 0 };

function isStatusDetailPage(urlStr: string): boolean {
  try {
    const u = new URL(urlStr);
    if (u.protocol !== "https:") return false;
    const host = u.hostname;
    if (host !== "x.com" && host !== "twitter.com") return false;
    const path = u.pathname;
    return /\/status\/\d+/.test(path);
  } catch {
    return false;
  }
}

function normalizeDetailUrl(href: string): string {
  try {
    const u = new URL(href);
    u.hash = "";
    u.search = "";
    return u.toString();
  } catch {
    return href;
  }
}

function bumpRetryBudget(): boolean {
  const now = Date.now();
  if (now - retryState.windowStart > RETRY_WINDOW_MS) {
    retryState.windowStart = now;
    retryState.count = 0;
  }
  retryState.count += 1;
  return retryState.count <= MAX_RETRIES_PER_WINDOW;
}

async function loadSettings(): Promise<ZombieSettings> {
  const raw = await chrome.storage.local.get(SETTINGS_STORAGE_KEY);
  const s = raw[SETTINGS_STORAGE_KEY] as Partial<ZombieSettings> | undefined;
  return { ...DEFAULT_SETTINGS, ...s };
}

/** X の DOM 変更に備え、抽出ロジックはこの関数に集約する */
function extractMainPostText(): string {
  const main = document.querySelector("main");
  if (!main) return "";
  const rootTweet = main.querySelector('article[data-testid="tweet"]');
  const cell =
    rootTweet?.querySelector('[data-testid="tweetText"]') ??
    main.querySelector('[data-testid="tweetText"]');
  const text = cell?.textContent?.trim() ?? "";
  return text.length > CS_TRUNCATE ? text.slice(0, CS_TRUNCATE) : text;
}

function removeZombieRoot(): void {
  document.querySelectorAll(`[${ROOT_ATTR}]`).forEach((el) => el.remove());
}

function findInsertAnchor(): Element | null {
  const main = document.querySelector("main");
  if (!main) return null;
  const article = main.querySelector("article");
  return article ?? null;
}

/**
 * X の表示モードに合わせる。
 * 公式ツイート本文の算出 color が最も信頼できる（背景が透明なケースが多い）。
 */
function inferThreadTheme(): "dark" | "light" {
  const sampleText = document.querySelector(
    'main article[data-testid="tweet"] [data-testid="tweetText"], main [data-testid="tweetText"]'
  ) as HTMLElement | null;
  if (sampleText) {
    const rgb = parseCssRgb(getComputedStyle(sampleText).color);
    if (rgb) {
      const lum = relativeLuminance(rgb[0], rgb[1], rgb[2]);
      if (lum > 0.55) return "dark";
      if (lum < 0.38) return "light";
    }
  }

  const candidates: HTMLElement[] = [];
  const pc = document.querySelector('[data-testid="primaryColumn"]');
  if (pc) candidates.push(pc as HTMLElement);
  const main = document.querySelector("main");
  if (main) candidates.push(main as HTMLElement);
  candidates.push(document.body, document.documentElement);

  let minL: number | null = null;
  for (const el of candidates) {
    const rgb = parseCssRgb(getComputedStyle(el).backgroundColor);
    if (!rgb) continue;
    const lum = relativeLuminance(rgb[0], rgb[1], rgb[2]);
    minL = minL === null ? lum : Math.min(minL, lum);
  }
  if (minL !== null && minL < 0.22) return "dark";
  if (minL !== null && minL > 0.55) return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function parseCssRgb(css: string): [number, number, number] | null {
  const m = css
    .trim()
    .match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([^)]+))?\s*\)$/i);
  if (!m) return null;
  const alphaRaw = m[4]?.trim();
  const alpha = alphaRaw === undefined ? 1 : parseAlphaChannel(alphaRaw);
  if (alpha < 0.08) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function parseAlphaChannel(s: string): number {
  if (s.endsWith("%")) return Number(s.slice(0, -1)) / 100;
  const n = Number(s);
  return Number.isFinite(n) ? n : 1;
}

function relativeLuminance(r: number, g: number, b: number): number {
  const lin = [r, g, b].map((v) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lin[0]! + 0.7152 * lin[1]! + 0.0722 * lin[2]!;
}

const FAKE_IDENTITIES: readonly { name: string; handle: string }[] = [
  { name: "いいね職人", handle: "local_zmb_01" },
  { name: "共感マシーン", handle: "local_zmb_02" },
  { name: "TLの住人", handle: "local_zmb_03" },
  { name: "読むだけ勢", handle: "local_zmb_04" },
  { name: "拍手担当", handle: "local_zmb_05" },
  { name: "深夜テンション", handle: "local_zmb_06" },
  { name: "感謝の気持ち", handle: "local_zmb_07" },
  { name: "エモさ検知器", handle: "local_zmb_08" },
  { name: "保存勢代表", handle: "local_zmb_09" },
  { name: "布教おじさん", handle: "local_zmb_10" },
];

/** X のツールバー SVG と同系の path（viewBox 0 0 24 24） */
const ICON_PATH_REPLY =
  "M1.751 10c0-4.42 3.584-8 8.005-8h4.366c4.49 0 8.129 3.64 8.129 8.13 0 2.96-1.607 5.68-4.196 7.11l-8.054 4.46v-3.69h-.067c-4.49.1-8.183-3.51-8.183-8.01zm8.005-6c-3.317 0-6.005 2.69-6.005 6 0 3.37 2.77 6.08 6.138 6.01l.351-.01h1.761v2.3l5.087-2.81c1.951-1.08 3.163-3.13 3.163-5.36 0-3.39-2.744-6.13-6.129-6.13H9.756z";
const ICON_PATH_RETWEET =
  "M4.5 3.88l4.432 4.14-1.364 1.46L5.5 7.55V16c0 1.1.896 2 2 2H13v2H7.5c-2.209 0-4-1.79-4-4V7.55L1.432 9.48.068 8.02 4.5 3.88zM16.5 6H11V4h5.5c2.209 0 4 1.79 4 4v8.45l2.068-1.93 1.364 1.46-4.432 4.14-4.432-4.14 1.364-1.46 2.068 1.93V8c0-1.1-.896-2-2-2z";
const ICON_PATH_LIKE =
  "M16.697 5.5c-1.222-.06-2.679.51-3.89 2.16l-.805 1.09-.806-1.09C9.984 6.01 8.526 5.44 7.304 5.5c-1.243.07-2.349.78-2.91 1.91-.552 1.12-.633 2.78.479 4.82 1.074 1.97 3.257 4.27 7.129 6.61 3.87-2.34 6.052-4.64 7.126-6.61 1.111-2.04 1.03-3.7.477-4.82-.561-1.13-1.666-1.84-2.908-1.91zm4.187 7.69c-1.351 2.48-4.001 5.12-8.379 7.67l-.503.3-.504-.3c-4.379-2.55-7.029-5.19-8.382-7.67-1.36-2.5-1.41-4.86-.514-6.67.887-1.79 2.647-2.91 4.601-3.01 1.651-.09 3.368.56 4.798 2.01 1.429-1.45 3.146-2.1 4.796-2.01 1.954.1 3.714 1.22 4.601 3.01.896 1.81.846 4.17-.514 6.67z";
const ICON_PATH_ANALYTICS =
  "M8.75 21V3h2v18h-2zM18 21V8.5h2V21h-2zM4 21l.004-10h2L6 21H4zm9.248 0v-7h2v7h-2z";
const ICON_PATH_BOOKMARK =
  "M4 4.5C4 3.12 5.119 2 6.5 2h11C18.881 2 20 3.12 20 4.5v18.44l-8-5.71-8 5.71V4.5zM6.5 4c-.276 0-.5.22-.5.5v14.56l6-4.29 6 4.29V4.5c0-.28-.224-.5-.5-.5h-11z";
const ICON_PATH_SHARE =
  "M12 2.59l5.7 5.7-1.41 1.42L13 6.41V16h-2V6.41l-3.3 3.3-1.41-1.42L12 2.59zM21 15l-.02 3.51c0 1.38-1.12 2.49-2.5 2.49H5.5C4.11 21 3 19.88 3 18.5V15h2v3.5c0 .28.22.5.5.5h12.98c.28 0 .5-.22.5-.5L19 15h2z";
const ICON_PATH_VERIFIED =
  "M20.396 11c-.018-.646-.215-1.275-.57-1.816-.354-.54-.852-.972-1.438-1.246.223-.607.27-1.264.14-1.897-.131-.634-.437-1.218-.882-1.687-.47-.445-1.053-.75-1.687-.882-.633-.13-1.29-.083-1.897.14-.273-.587-.704-1.086-1.245-1.44S11.647 1.62 11 1.604c-.646.017-1.273.213-1.813.568s-.969.854-1.24 1.44c-.608-.223-1.267-.272-1.902-.14-.635.13-1.22.436-1.69.882-.445.47-.749 1.055-.878 1.688-.13.633-.08 1.29.144 1.896-.587.274-1.087.705-1.443 1.245-.356.54-.555 1.17-.574 1.817.02.647.218 1.276.574 1.817.356.54.856.972 1.443 1.245-.224.606-.274 1.263-.144 1.896.13.634.433 1.218.877 1.688.47.443 1.054.747 1.687.878.633.132 1.29.084 1.897-.136.274.586.705 1.084 1.246 1.439.54.354 1.17.551 1.816.569.647-.016 1.276-.213 1.817-.567s.972-.854 1.245-1.44c.604.239 1.266.296 1.903.164.636-.132 1.22-.447 1.68-.907.46-.46.776-1.044.908-1.681s.075-1.299-.165-1.903c.586-.274 1.084-.705 1.439-1.246.354-.54.551-1.17.569-1.816zM9.662 14.85l-3.429-3.428 1.293-1.302 2.072 2.072 4.4-4.794 1.347 1.246z";

function svgIcon(pathD: string, viewBox = "0 0 24 24"): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", viewBox);
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("class", "zombie-sim-actionSvg");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", pathD);
  svg.appendChild(path);
  return svg;
}

function createVerifiedBadge(): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 22 22");
  svg.setAttribute("class", "zombie-sim-verifiedSvg");
  svg.setAttribute("aria-label", "認証済みアカウント");
  svg.setAttribute("role", "img");
  const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", ICON_PATH_VERIFIED);
  g.appendChild(path);
  svg.appendChild(g);
  return svg;
}

function fakeTimeLabel(index: number): { label: string; iso: string } {
  const now = Date.now();
  const pick = index % 5;
  if (pick === 0) {
    const m = 3 + ((index * 17) % 55);
    const t = new Date(now - m * 60 * 1000);
    return { label: `${m}分`, iso: t.toISOString() };
  }
  if (pick === 1) {
    const h = 1 + ((index * 5) % 23);
    const t = new Date(now - h * 60 * 60 * 1000);
    return { label: `${h}時間`, iso: t.toISOString() };
  }
  if (pick === 2) {
    const t = new Date(now - 30 * 60 * 60 * 1000);
    return { label: "昨日", iso: t.toISOString() };
  }
  const t = new Date(now - (1 + (index % 6)) * 24 * 60 * 60 * 1000);
  return { label: `${t.getMonth() + 1}月${t.getDate()}日`, iso: t.toISOString() };
}

function fakeEngagement(index: number): {
  replies: number;
  retweets: number;
  likes: number;
  views: number;
} {
  const salt = (index * 991 + 7) % 2048;
  return {
    replies: salt % 12,
    retweets: (salt >> 3) % 8,
    likes: 1 + (salt * 13) % 240,
    views: 8 + (salt * 17) % 8000,
  };
}

function createActionItem(ariaLabel: string, pathD: string, count: string | null): HTMLElement {
  const item = document.createElement("div");
  item.className = "zombie-sim-actionItem";
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "zombie-sim-actionBtn";
  btn.setAttribute("aria-label", ariaLabel);
  btn.tabIndex = -1;
  const iconWrap = document.createElement("div");
  iconWrap.className = "zombie-sim-actionIconWrap";
  iconWrap.appendChild(svgIcon(pathD));
  btn.appendChild(iconWrap);
  if (count !== null && count !== "") {
    const countWrap = document.createElement("div");
    countWrap.className = "zombie-sim-actionCount";
    const span = document.createElement("span");
    span.className = "zombie-sim-actionCountText";
    span.textContent = count;
    countWrap.appendChild(span);
    btn.appendChild(countWrap);
  }
  item.appendChild(btn);
  return item;
}

function createActionBar(index: number): HTMLElement {
  const e = fakeEngagement(index);
  const wrap = document.createElement("div");
  wrap.className = "zombie-sim-actions";
  const row = document.createElement("div");
  row.className = "zombie-sim-actionRow";
  row.setAttribute("role", "group");

  const fmtViews = (n: number) => (n >= 10000 ? `${Math.floor(n / 1000)}K` : String(n));

  row.append(
    createActionItem(
      `${e.replies} 件の返信。返信する`,
      ICON_PATH_REPLY,
      e.replies > 0 ? String(e.replies) : ""
    ),
    createActionItem(
      `${e.retweets} 件のリポスト。リポスト`,
      ICON_PATH_RETWEET,
      e.retweets > 0 ? String(e.retweets) : ""
    ),
    createActionItem(
      `${e.likes} 件のいいね。いいねする`,
      ICON_PATH_LIKE,
      String(e.likes)
    ),
    createActionItem(
      `${e.views} 件の表示。ポストアナリティクスを表示`,
      ICON_PATH_ANALYTICS,
      fmtViews(e.views)
    ),
    createActionItem("ブックマーク", ICON_PATH_BOOKMARK, null),
    createActionItem("ポストを共有", ICON_PATH_SHARE, null)
  );
  wrap.appendChild(row);
  return wrap;
}

/**
 * X の cellInnerDiv → article[data-testid=tweet] 構造に近いマークアップ。
 * 公式の data-testid / r-* / css-* には依存しない（衝突・破損を避ける）。
 */
function createReplyCell(text: string, index: number): HTMLElement {
  const id = FAKE_IDENTITIES[index % FAKE_IDENTITIES.length]!;
  const initial = id.name.slice(0, 1);

  const cell = document.createElement("div");
  cell.className = "zombie-sim-cell";
  cell.setAttribute("data-zombie-sim-cell", "1");

  const inner = document.createElement("div");
  inner.className = "zombie-sim-cellInner";

  const article = document.createElement("article");
  article.className = "zombie-sim-tweetArticle";
  article.setAttribute("role", "article");
  article.setAttribute("tabindex", "-1");
  article.setAttribute("data-zombie-sim-tweet", "1");

  const layout = document.createElement("div");
  layout.className = "zombie-sim-tweetLayout";

  const avatarRail = document.createElement("div");
  avatarRail.className = "zombie-sim-avatarRail";
  avatarRail.setAttribute("aria-hidden", "true");

  const avatarHost = document.createElement("div");
  avatarHost.className = "zombie-sim-avatarHost";

  const avatar = document.createElement("div");
  avatar.className = "zombie-sim-avatar";
  const initialEl = document.createElement("span");
  initialEl.className = "zombie-sim-avatar-initial";
  initialEl.textContent = initial;
  avatar.appendChild(initialEl);
  avatarHost.appendChild(avatar);
  avatarRail.appendChild(avatarHost);

  const contentCol = document.createElement("div");
  contentCol.className = "zombie-sim-contentCol";

  const userName = document.createElement("div");
  userName.className = "zombie-sim-userName";
  userName.setAttribute("data-zombie-sim-user-name", "1");

  const userRow = document.createElement("div");
  userRow.className = "zombie-sim-userNameRow";

  const displayName = document.createElement("span");
  displayName.className = "zombie-sim-displayName";
  displayName.textContent = id.name;
  userRow.appendChild(displayName);

  if (index % 3 !== 0) {
    userRow.appendChild(createVerifiedBadge());
  }

  const handle = document.createElement("span");
  handle.className = "zombie-sim-handleInline";
  handle.textContent = ` @${id.handle}`;

  const dot = document.createElement("span");
  dot.className = "zombie-sim-metaSep";
  dot.setAttribute("aria-hidden", "true");
  dot.textContent = " · ";

  const timeInfo = fakeTimeLabel(index);
  const timeWrap = document.createElement("span");
  timeWrap.className = "zombie-sim-timeWrap";
  const timeEl = document.createElement("time");
  timeEl.dateTime = timeInfo.iso;
  timeEl.textContent = timeInfo.label;
  timeWrap.appendChild(timeEl);

  userRow.append(handle, dot, timeWrap);
  userName.appendChild(userRow);

  const tweetText = document.createElement("div");
  tweetText.className = "zombie-sim-tweetText";
  tweetText.setAttribute("data-zombie-sim-tweet-text", "1");
  tweetText.setAttribute("dir", "auto");
  tweetText.setAttribute("lang", "ja");
  tweetText.textContent = text;

  contentCol.append(userName, tweetText, createActionBar(index));
  layout.append(avatarRail, contentCol);
  article.appendChild(layout);
  inner.appendChild(article);
  cell.appendChild(inner);
  return cell;
}

function createZombieRoot(replies: string[]): HTMLElement {
  const root = document.createElement("section");
  root.setAttribute(ROOT_ATTR, "1");
  root.setAttribute("lang", "ja");
  const theme = inferThreadTheme();
  root.className =
    theme === "dark" ? "zombie-sim-root zombie-sim-root--dark" : "zombie-sim-root zombie-sim-root--light";

  replies.forEach((line, i) => {
    root.appendChild(createReplyCell(line, i));
  });
  return root;
}

function mountRoot(anchor: Element, root: HTMLElement): void {
  anchor.insertAdjacentElement("afterend", root);
}

async function fetchReplies(
  postText: string,
  desiredCount: number,
  normalizedUrl: string
): Promise<GenerateRepliesResult> {
  const payload: GenerateRepliesPayload = {
    type: MESSAGE_GENERATE_REPLIES,
    postText,
    desiredCount,
    normalizedUrl,
  };
  return chrome.runtime.sendMessage(payload) as Promise<GenerateRepliesResult>;
}

async function applyZombieSim(): Promise<void> {
  try {
    const href = window.location.href;
    const normalizedUrl = normalizeDetailUrl(href);

    if (!isStatusDetailPage(href)) {
      removeZombieRoot();
      lastNormalizedUrl = "";
      observer?.disconnect();
      observer = null;
      return;
    }

    if (normalizedUrl !== lastNormalizedUrl) {
      lastNormalizedUrl = normalizedUrl;
      retryState.windowStart = 0;
      retryState.count = 0;
    }

    const settings = await loadSettings();
    if (!settings.enabled) {
      removeZombieRoot();
      observer?.disconnect();
      observer = null;
      return;
    }

    const existing = document.querySelector(`[${ROOT_ATTR}]`);
    if (existing?.isConnected) {
      return;
    }

    const anchor = findInsertAnchor();
    if (!anchor) {
      return;
    }

    const postText = extractMainPostText();
    const desired = Math.max(1, Math.min(50, settings.replyCount));

    if (!bumpRetryBudget()) {
      observer?.disconnect();
      observer = null;
      return;
    }

    const result = await fetchReplies(postText, desired, normalizedUrl);

    if (!result.ok && result.code === "DISABLED") {
      removeZombieRoot();
      return;
    }

    if (!result.ok) {
      return;
    }

    if (document.querySelector(`[${ROOT_ATTR}]`)?.isConnected) {
      return;
    }

    const anchorAgain = findInsertAnchor();
    if (!anchorAgain) return;

    const root = createZombieRoot(result.replies);
    mountRoot(anchorAgain, root);
  } finally {
    ensureObserver();
  }
}

function scheduleApply(): void {
  if (debounceTimer !== null) {
    clearTimeout(debounceTimer);
  }
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    void applyZombieSim();
  }, DEBOUNCE_MS);
}

function ensureObserver(): void {
  if (observer) return;
  const main = document.querySelector("main");
  if (!main) {
    scheduleApply();
    return;
  }
  observer = new MutationObserver(() => {
    const root = document.querySelector(`[${ROOT_ATTR}]`);
    if (!root || !root.isConnected) {
      scheduleApply();
    }
  });
  observer.observe(main, { childList: true, subtree: true });
}

function bootstrap(): void {
  void applyZombieSim();
}

bootstrap();

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes[SETTINGS_STORAGE_KEY]) {
    scheduleApply();
  }
});

let lastHref = window.location.href;
setInterval(() => {
  if (window.location.href !== lastHref) {
    lastHref = window.location.href;
    removeZombieRoot();
    scheduleApply();
  }
}, 500);
