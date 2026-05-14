import { pickPresetReplies } from "./presets";
import {
  CACHE_STORAGE_PREFIX,
  CACHE_TTL_MS,
  DEFAULT_SETTINGS,
  MESSAGE_GENERATE_REPLIES,
  SETTINGS_STORAGE_KEY,
  type CacheEntry,
  type GenerateRepliesPayload,
  type GenerateRepliesResult,
  type ZombieSettings,
} from "./types";

const MAX_POST_CHARS = 12_000;

function joinApiPath(base: string, subpath: string): string {
  const b = base.trim().replace(/\/+$/, "");
  const p = subpath.startsWith("/") ? subpath : `/${subpath}`;
  return `${b}${p}`;
}

async function loadSettings(): Promise<ZombieSettings> {
  const raw = await chrome.storage.local.get(SETTINGS_STORAGE_KEY);
  const s = raw[SETTINGS_STORAGE_KEY] as Partial<ZombieSettings> | undefined;
  return { ...DEFAULT_SETTINGS, ...s };
}

function cacheKeyForUrl(normalizedUrl: string): string {
  return `${CACHE_STORAGE_PREFIX}${normalizedUrl}`;
}

async function readCache(normalizedUrl: string): Promise<CacheEntry | null> {
  const key = cacheKeyForUrl(normalizedUrl);
  const got = await chrome.storage.local.get(key);
  const entry = got[key] as CacheEntry | undefined;
  if (!entry || !Array.isArray(entry.replies) || typeof entry.createdAt !== "number") {
    return null;
  }
  if (Date.now() - entry.createdAt > CACHE_TTL_MS) {
    await chrome.storage.local.remove(key);
    return null;
  }
  return entry;
}

async function writeCache(normalizedUrl: string, replies: string[]): Promise<void> {
  const key = cacheKeyForUrl(normalizedUrl);
  const entry: CacheEntry = { replies, createdAt: Date.now() };
  await chrome.storage.local.set({ [key]: entry });
}

function truncatePost(text: string): string {
  if (text.length <= MAX_POST_CHARS) return text;
  return text.slice(0, MAX_POST_CHARS);
}

function parseRepliesJson(content: string): string[] | null {
  const trimmed = content.trim();
  try {
    const data = JSON.parse(trimmed) as unknown;
    if (!data || typeof data !== "object") return null;
    const replies = (data as { replies?: unknown }).replies;
    if (!Array.isArray(replies)) return null;
    const strings = replies
      .filter((x): x is string => typeof x === "string")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    return strings.length ? strings : null;
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return parseRepliesJson(trimmed.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

async function callLlm(
  settings: ZombieSettings,
  postText: string,
  desiredCount: number
): Promise<string[] | null> {
  const apiKey = settings.apiKey.trim();
  if (!apiKey) return null;

  const url = joinApiPath(settings.apiBaseUrl.trim(), "/chat/completions");
  const system = [
    "あなたは短文の返信文案ジェネレータです。",
    "インプレッション目的の「ゾンビリプ」風：浅い共感、テンプレ感、絵文字を少し混ぜる。",
    "元ポストの主張には踏み込みすぎず、安全で無害なトーン。",
    `出力は必ず次の JSON 形式のみ（説明文禁止）: {"replies":["...","..."]}`,
    `replies は日本語で最大 ${desiredCount} 件、各 1〜3 文程度。`,
  ].join("\n");

  const userPayload = {
    post_text: postText,
    count: desiredCount,
  };

  const body = {
    model: settings.model.trim() || DEFAULT_SETTINGS.model,
    temperature: 0.85,
    messages: [
      { role: "system", content: system },
      { role: "user", content: JSON.stringify(userPayload) },
    ],
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    return null;
  }

  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = json.choices?.[0]?.message?.content;
  if (typeof content !== "string") return null;
  return parseRepliesJson(content);
}

async function handleGenerate(
  payload: GenerateRepliesPayload
): Promise<GenerateRepliesResult> {
  const settings = await loadSettings();
  if (!settings.enabled) {
    return { ok: false, code: "DISABLED" };
  }

  const desired = Math.max(1, Math.min(50, Math.floor(payload.desiredCount || 1)));
  const normalizedUrl = payload.normalizedUrl;

  const cached = await readCache(normalizedUrl);
  if (cached) {
    let replies = cached.replies.slice(0, desired);
    if (replies.length < desired) {
      const extra = pickPresetReplies(desired - replies.length);
      replies = [...replies, ...extra].slice(0, desired);
      await writeCache(normalizedUrl, replies);
    }
    return { ok: true, replies, source: "cache" };
  }

  const postText = truncatePost(payload.postText ?? "");
  const allowEmptyLlm = settings.emptyPostBehavior === "llm";

  const tryLlm =
    settings.llmEnabled &&
    settings.apiKey.trim().length > 0 &&
    (postText.length > 0 || allowEmptyLlm);

  if (tryLlm) {
    try {
      const replies = await callLlm(settings, postText, desired);
      if (replies && replies.length > 0) {
        const trimmed = replies.slice(0, desired);
        await writeCache(normalizedUrl, trimmed);
        return { ok: true, replies: trimmed, source: "llm" };
      }
    } catch {
      // ログに本文・キーを出さない
    }
  }

  const presets = pickPresetReplies(desired);
  await writeCache(normalizedUrl, presets);
  return { ok: true, replies: presets, source: "preset" };
}

chrome.runtime.onMessage.addListener(
  (message: unknown, _sender, sendResponse: (r: GenerateRepliesResult) => void) => {
    if (!message || typeof message !== "object") return;
    const m = message as { type?: string };
    if (m.type !== MESSAGE_GENERATE_REPLIES) return;

    const payload = message as GenerateRepliesPayload;
    void handleGenerate(payload).then(sendResponse);
    return true;
  }
);

