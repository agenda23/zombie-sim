import {
  DEFAULT_SETTINGS,
  SETTINGS_STORAGE_KEY,
  type ZombieSettings,
} from "./types";

async function load(): Promise<ZombieSettings> {
  const raw = await chrome.storage.local.get(SETTINGS_STORAGE_KEY);
  const s = raw[SETTINGS_STORAGE_KEY] as Partial<ZombieSettings> | undefined;
  return { ...DEFAULT_SETTINGS, ...s };
}

async function save(settings: ZombieSettings): Promise<void> {
  await chrome.storage.local.set({ [SETTINGS_STORAGE_KEY]: settings });
}

function bind(settings: ZombieSettings): void {
  const form = document.getElementById("form") as HTMLFormElement;
  const enabled = document.getElementById("enabled") as HTMLInputElement;
  const llmEnabled = document.getElementById("llmEnabled") as HTMLInputElement;
  const apiKey = document.getElementById("apiKey") as HTMLInputElement;
  const apiBaseUrl = document.getElementById("apiBaseUrl") as HTMLInputElement;
  const model = document.getElementById("model") as HTMLInputElement;
  const replyCount = document.getElementById("replyCount") as HTMLInputElement;
  const emptyPostBehavior = document.getElementById(
    "emptyPostBehavior"
  ) as HTMLSelectElement;
  const status = document.getElementById("status") as HTMLParagraphElement;

  enabled.checked = settings.enabled;
  llmEnabled.checked = settings.llmEnabled;
  apiKey.value = settings.apiKey;
  apiBaseUrl.value = settings.apiBaseUrl;
  model.value = settings.model;
  replyCount.value = String(settings.replyCount);
  emptyPostBehavior.value = settings.emptyPostBehavior;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const next: ZombieSettings = {
      enabled: enabled.checked,
      llmEnabled: llmEnabled.checked,
      apiKey: apiKey.value.trim(),
      apiBaseUrl: apiBaseUrl.value.trim() || DEFAULT_SETTINGS.apiBaseUrl,
      model: model.value.trim() || DEFAULT_SETTINGS.model,
      replyCount: Math.max(1, Math.min(50, Number(replyCount.value) || 5)),
      emptyPostBehavior:
        emptyPostBehavior.value === "llm" ? "llm" : "preset",
    };
    await save(next);
    status.textContent = "保存しました";
    setTimeout(() => {
      status.textContent = "";
    }, 2000);
  });
}

void load().then(bind);
