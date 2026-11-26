/**
 * 全生态统一折叠与局部 UI 记忆存储（lv_ui_prefs_folds_v1）
 * - 使用单一 localStorage 键 `lv_ui_prefs_folds_v1`，LRU 上限 500 项，严禁散落多键与写入 petal。
 * - 支持隐私/无 localStorage 环境安全降级。
 */

export const LV_UI_FOLDS_KEY = "lv_ui_prefs_folds_v1";
export const LV_UI_FOLDS_MAX_ENTRIES = 500;

export type FoldPrefsMap = Record<string, boolean>;

function readStore(): FoldPrefsMap {
  try {
    const raw = globalThis.localStorage?.getItem(LV_UI_FOLDS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: FoldPrefsMap = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof k === "string" && typeof v === "boolean") {
        out[k] = v;
      }
    }
    return out;
  } catch {
    return {};
  }
}

function writeStore(map: FoldPrefsMap): void {
  try {
    const entries = Object.entries(map);
    const trimmed =
      entries.length > LV_UI_FOLDS_MAX_ENTRIES
        ? Object.fromEntries(entries.slice(entries.length - LV_UI_FOLDS_MAX_ENTRIES))
        : map;
    globalThis.localStorage?.setItem(LV_UI_FOLDS_KEY, JSON.stringify(trimmed));
  } catch {
    /* 隐私模式或无 localStorage 时静默降级 */
  }
}

export function getUiFoldPref(key: string, defaultValue = false): boolean {
  if (!key) return defaultValue;
  const store = readStore();
  if (Object.prototype.hasOwnProperty.call(store, key)) {
    const val = Boolean(store[key]);
    // Read-aware LRU: 命中时更新访问顺序至尾部，避免高频旧键被 500 上限淘汰
    const keys = Object.keys(store);
    if (keys[keys.length - 1] !== key) {
      delete store[key];
      store[key] = val;
      writeStore(store);
    }
    return val;
  }
  return defaultValue;
}

export function setUiFoldPref(key: string, collapsed: boolean): void {
  if (!key) return;
  const store = readStore();
  // LRU touch: 删除旧位后重新插入到尾部
  delete store[key];
  store[key] = Boolean(collapsed);
  writeStore(store);
}

export function clearUiFoldPrefsByPrefix(prefix: string): void {
  const store = readStore();
  let changed = false;
  for (const k of Object.keys(store)) {
    if (k.startsWith(prefix)) {
      delete store[k];
      changed = true;
    }
  }
  if (changed) writeStore(store);
}

/** 判断解析文本是否属于超长解析（>8 行或 >360 字） */
export function isLongAnalysisText(text?: string | null): boolean {
  if (!text) return false;
  const lines = text.split(/\r?\n/);
  return lines.length > 8 || text.length > 360;
}

/** 截取超长解析折叠态预览文本（前 4 行或前 180 字） */
export function previewLongAnalysisText(text: string): string {
  const lines = text.split(/\r?\n/);
  if (lines.length > 4) {
    const head = lines.slice(0, 4).join("\n").trimEnd();
    return head.length > 200 ? head.slice(0, 200).trimEnd() + "…" : head + "\n…";
  }
  return text.length > 180 ? text.slice(0, 180).trimEnd() + "…" : text;
}
