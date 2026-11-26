import { fetchSyncPost } from "siyuan";

/** 73-03 读取侧密钥适配：宿主密钥优先，运行时会话缓存次之，旧设置仅作兼容回退。 */
export const AI_SECRET_NAME = "lv-exam-ai-key";

export type AiKeyHost = {
  getSecret?: (name: string) => unknown;
  settingUtils?: { get?: (key: string) => unknown };
};

export type SecretApiPost = (url: string, data?: unknown) => Promise<{ code?: number; msg?: string; data?: unknown }>;

let runtimeAiSecret: string | null = null;

export function setRuntimeAiSecret(secret: string | null): void {
  const trimmed = typeof secret === "string" ? secret.trim() : "";
  runtimeAiSecret = trimmed || null;
}

export function clearRuntimeAiSecret(): void {
  runtimeAiSecret = null;
}

export function resolveAiKey(host: AiKeyHost | null | undefined): string {
  let secret: string;
  try {
    secret = String(host?.getSecret?.(AI_SECRET_NAME) ?? "").trim();
  } catch {
    secret = "";
  }
  if (secret) return secret;
  if (runtimeAiSecret) return runtimeAiSecret;
  try {
    return String(host?.settingUtils?.get?.("aiKey") ?? "").trim();
  } catch {
    return "";
  }
}

/**
 * 将 AI Key 安全写入思源宿主 `/api/setting/setSecrets` 加密密钥库（保留用户其他已有密钥），
 * 严禁明文落盘至插件 `settings.json` 或 DOM。
 */
export async function saveAiSecretToHost(
  value: string,
  postApi: SecretApiPost = (url, data) => fetchSyncPost(url, data),
): Promise<void> {
  const trimmed = String(value ?? "").trim();
  let existingItems: Array<{ name?: string | null; value?: string | null; allowedHosts?: string[] | null }> = [];
  try {
    const confRes = await postApi("/api/system/getConf", {});
    const conf = (confRes?.data as { conf?: { secrets?: { items?: unknown[] } }; secrets?: { items?: unknown[] } } | undefined);
    const rawItems = conf?.conf?.secrets?.items ?? conf?.secrets?.items;
    if (Array.isArray(rawItems)) {
      existingItems = rawItems.filter(
        (item): item is { name?: string | null; value?: string | null; allowedHosts?: string[] | null } =>
          Boolean(item) && typeof item === "object",
      );
    }
  } catch {
    existingItems = [];
  }

  const nextItems = existingItems.filter((item) => item.name !== AI_SECRET_NAME);
  if (trimmed) {
    nextItems.push({ name: AI_SECRET_NAME, value: trimmed });
  }

  const res = await postApi("/api/setting/setSecrets", { items: nextItems });
  if (res && typeof res.code === "number" && res.code !== 0) {
    throw new Error(res.msg || "写入思源密钥库失败");
  }
  setRuntimeAiSecret(trimmed || null);
}

/**
 * 自动迁移旧版 settings.json 中残留的明文 `aiKey` 至思源加密密钥库并从 settings.json 彻底抹除。
 */
export async function migrateLegacyAiKey(
  plugin: {
    getSecret?: (name: string) => unknown;
    saveData?: (file: string, data: unknown) => Promise<void>;
    data?: Record<string, unknown>;
  } | null | undefined,
  loadedData: unknown,
  postApi?: SecretApiPost,
): Promise<boolean> {
  if (!plugin || !loadedData || typeof loadedData !== "object") return false;
  const record = loadedData as Record<string, unknown>;
  if (!("aiKey" in record)) return false;

  const legacyKey = typeof record.aiKey === "string" ? record.aiKey.trim() : "";
  const existingSecret = (() => {
    try {
      return String(plugin.getSecret?.(AI_SECRET_NAME) ?? "").trim();
    } catch {
      return "";
    }
  })();

  if (legacyKey && !existingSecret) {
    setRuntimeAiSecret(legacyKey);
    await saveAiSecretToHost(legacyKey, postApi);
  }

  const sanitized = { ...record };
  delete sanitized.aiKey;
  if (plugin.data && typeof plugin.data === "object" && plugin.data.settings && typeof plugin.data.settings === "object") {
    delete (plugin.data.settings as Record<string, unknown>).aiKey;
  }
  if (typeof plugin.saveData === "function") {
    await plugin.saveData("settings.json", sanitized);
  }
  return true;
}

/**
 * 设置保存前兜底确认：仅当旧明文 aiKey 为空、已存入思源密钥库、或本次迁移成功落盘后，
 * 才允许从 settings.json 剥离 aiKey；离线/迁移失败时保留原文避免静默丢失。
 */
export async function ensureLegacyAiKeyMigratedForSave(
  plugin: AiKeyHost | null | undefined,
  legacyKeyRaw: unknown,
  postApi?: SecretApiPost,
): Promise<boolean> {
  const legacyKey = typeof legacyKeyRaw === "string" ? legacyKeyRaw.trim() : "";
  if (!legacyKey) return true;
  try {
    const existing = String(plugin?.getSecret?.(AI_SECRET_NAME) ?? "").trim();
    if (existing) return true;
    setRuntimeAiSecret(legacyKey);
    await saveAiSecretToHost(legacyKey, postApi);
    return true;
  } catch {
    return false;
  }
}
