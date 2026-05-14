/** オプション・ストレージに保存する設定 */
export interface ZombieSettings {
  /** 拡張全体の ON/OFF */
  enabled: boolean;
  /** LLM 経由の生成を試みるか */
  llmEnabled: boolean;
  apiKey: string;
  /** 末尾スラッシュなし想定（例: https://api.openai.com/v1） */
  apiBaseUrl: string;
  model: string;
  /** 表示する偽リプの最大件数 */
  replyCount: number;
  /** 本文が空のとき LLM を試すか、即プリセットか */
  emptyPostBehavior: "llm" | "preset";
}

export const DEFAULT_SETTINGS: ZombieSettings = {
  enabled: true,
  llmEnabled: false,
  apiKey: "",
  apiBaseUrl: "https://api.openai.com/v1",
  model: "gpt-4o-mini",
  replyCount: 5,
  emptyPostBehavior: "preset",
};

export const SETTINGS_STORAGE_KEY = "zombieSim:settings";
export const CACHE_STORAGE_PREFIX = "zombieSim:cache:";
export const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export const MESSAGE_GENERATE_REPLIES = "GENERATE_REPLIES" as const;

export interface GenerateRepliesPayload {
  type: typeof MESSAGE_GENERATE_REPLIES;
  /** 切り詰め済み本文 */
  postText: string;
  desiredCount: number;
  /** 正規化したポスト詳細 URL */
  normalizedUrl: string;
}

export type GenerateRepliesResult =
  | { ok: true; replies: string[]; source: "llm" | "cache" | "preset" }
  | { ok: false; code: "DISABLED" };

export interface CacheEntry {
  replies: string[];
  createdAt: number;
}
