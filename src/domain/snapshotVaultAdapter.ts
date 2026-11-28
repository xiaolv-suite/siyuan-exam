import type { LvVaultPluginAdapter } from "../libs/lv-notice-kit";
import { emitExamEvent } from "../core/bus";

export const EXAM_VAULT_PLUGIN_ID = "siyuan-exam";
export const EXAM_VAULT_LABEL = "小驴考试";
export const EXAM_VAULT_SCHEMA_VERSION = 1;

export const SAFE_PREFERENCE_KEYS = [
  "examDate",
  "sprintDays",
  "dailyGoal",
  "reciteGroupSize",
  "perQuestionTimeoutS",
  "feedbackTiming",
  "materialInterleave",
  "examProfiles",
  "quickAvoidDays",
  "eliminateStreak",
  "reviewReminderEnabled",
  "desiredRetention",
  "aiCustomHint",
  "ttsLang",
  "ttsRate",
  "soundEnabled",
  "speechEvalEnabled",
  "checkinItemId",
  "checkinThreshold",
] as const;

export const VAULT_TRIGGER_STORAGE_KEYS = new Set<string>([
  "banks",
  "attempts/log",
  "wrongbook/overlays",
  "wrongbook/reasons",
  "wrongbook/reflections",
  "wrongbook/diagnosis",
  "actions/items",
  "mock/blueprint",
  "mock/results",
  "estimate/history",
  "import/mappings",
  "browse/smartViews",
  "materials/registry",
  "materials/notes",
  "materials/qrefs",
  "syllabus/tree",
  "kp/relations",
  "ai/misdiagnosis",
  "session/checkin-ledger",
]);

const SECRET_KEY_RE =
  /^(?:ai[-_]?key|api[-_]?key|fallback[-_]?key|access[-_]?token|refresh[-_]?token|auth[-_]?token|bearer[-_]?token|gist[-_]?token|bot[-_]?token|client[-_]?secret|app[-_]?secret|secret[-_]?key|private[-_]?key|password|passwd|credential|backupKey|wereadApiKey|webhookUrl|barkUrl|token|secret)$/i;

const SECRET_VALUE_RES = [
  /\bsk-[A-Za-z0-9_-]{8,}\b/g,
  /\bBearer\s+[A-Za-z0-9._-]{6,}/gi,
  /\bghp_[A-Za-z0-9]{10,}\b/g,
  /\bxox[baprs]-[A-Za-z0-9-]{8,}\b/g,
];

function redactSecretStrings(text: string): string {
  let out = text;
  for (const re of SECRET_VALUE_RES) {
    out = out.replace(re, "[REDACTED]");
  }
  return out;
}

/**
 * 深度剥离任何 AI API Key / Token / 密钥凭证字段，确保快照 100% 零明文密钥
 */
export function stripSecretsForVault<T>(value: T): T {
  if (value == null) return value;
  if (typeof value === "string") {
    return redactSecretStrings(value) as unknown as T;
  }
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) {
    return value.map((item) => stripSecretsForVault(item)) as unknown as T;
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (SECRET_KEY_RE.test(k)) continue;
    if (typeof v === "string" && /(?:token|secret|key|password|credential)$/i.test(k) && !/(?:count|limit|budget|usage|slot|slots|name|label|mode|type|hash|bank)$/i.test(k)) {
      continue;
    }
    out[k] = stripSecretsForVault(v);
  }
  return out as T;
}

export function extractSafePreferences(settingsRaw: unknown): Record<string, unknown> {
  if (!settingsRaw || typeof settingsRaw !== "object" || Array.isArray(settingsRaw)) {
    return {};
  }
  const src = settingsRaw as Record<string, unknown>;
  const safe: Record<string, unknown> = {};
  for (const key of SAFE_PREFERENCE_KEYS) {
    if (src[key] !== undefined && src[key] !== "") {
      safe[key] = stripSecretsForVault(src[key]);
    }
  }
  return safe;
}

export interface ExamSnapshotBreakdown {
  banks: number;
  attempts: number;
  wrong: number;
  mocks: number;
  actions: number;
  materials: number;
  templates: number;
  estimates: number;
}

export function summarizeExamSnapshotBreakdown(snapshot: Record<string, unknown> | null | undefined): ExamSnapshotBreakdown {
  if (!snapshot || typeof snapshot !== "object") {
    return { banks: 0, attempts: 0, wrong: 0, mocks: 0, actions: 0, materials: 0, templates: 0, estimates: 0 };
  }
  const banks = Array.isArray(snapshot.banks) ? snapshot.banks.length : 0;

  let attempts = 0;
  if (Array.isArray(snapshot.attempts)) {
    attempts = snapshot.attempts.length;
  } else if (snapshot.attempts && typeof snapshot.attempts === "object") {
    const ev = (snapshot.attempts as { events?: unknown }).events;
    if (Array.isArray(ev)) attempts = ev.length;
  }

  const wrongIds = new Set<string>();
  for (const field of ["wrongbookOverlays", "wrongReasons", "wrongReflections", "wrongDiagnosis"]) {
    const mapObj = snapshot[field];
    if (mapObj && typeof mapObj === "object" && !Array.isArray(mapObj)) {
      for (const k of Object.keys(mapObj as Record<string, unknown>)) {
        if (k) wrongIds.add(k);
      }
    }
  }

  const mocks = Array.isArray(snapshot.mockResults) ? snapshot.mockResults.length : 0;
  const actions = Array.isArray(snapshot.actions) ? snapshot.actions.length : 0;

  let materials = 0;
  if (snapshot.materials && typeof snapshot.materials === "object") {
    const matItems = (snapshot.materials as { items?: unknown }).items;
    if (Array.isArray(matItems)) materials = matItems.length;
  }

  const smartViewsCount = Array.isArray(snapshot.smartViews) ? snapshot.smartViews.length : 0;
  const mappingsCount = Array.isArray(snapshot.importMappings) ? snapshot.importMappings.length : 0;
  const templates = smartViewsCount + mappingsCount;
  const estimates = Array.isArray(snapshot.estimateHistory) ? snapshot.estimateHistory.length : 0;

  return {
    banks,
    attempts,
    wrong: wrongIds.size,
    mocks,
    actions,
    materials,
    templates,
    estimates,
  };
}

export function countExamSnapshotRecords(snapshot: Record<string, unknown> | null | undefined): number {
  const b = summarizeExamSnapshotBreakdown(snapshot);
  return b.banks + b.attempts + b.wrong + b.mocks + b.actions + b.materials + b.templates + b.estimates;
}

export interface ExamVaultHost {
  dumpData: () => Promise<Record<string, unknown>>;
  restoreData: (data: Record<string, unknown>) => Promise<boolean>;
  readSafePreferences?: () => Promise<Record<string, unknown>> | Record<string, unknown>;
  mergeSafePreferences?: (prefs: Record<string, unknown>) => Promise<void> | void;
  invalidateApp?: () => void;
  dispatchPublicStats?: () => void;
}

export function createExamVaultAdapter(host: ExamVaultHost): LvVaultPluginAdapter {
  const buildSnapshot = async (): Promise<Record<string, unknown>> => {
    const raw = await host.dumpData();
    const prefs = host.readSafePreferences ? await host.readSafePreferences() : {};
    const safePrefs = extractSafePreferences(prefs);
    return stripSecretsForVault({
      ...raw,
      vaultSchemaVersion: EXAM_VAULT_SCHEMA_VERSION,
      preferences: safePrefs,
    });
  };

  return {
    pluginId: EXAM_VAULT_PLUGIN_ID,
    label: EXAM_VAULT_LABEL,
    schemaVersion: EXAM_VAULT_SCHEMA_VERSION,
    countRecords: (snapshot) => countExamSnapshotRecords(snapshot),
    exportSnapshot: () => buildSnapshot(),
    previewDiff: async (incoming) => {
      const current = await buildSnapshot();
      const curB = summarizeExamSnapshotBreakdown(current);
      const incB = summarizeExamSnapshotBreakdown(incoming);
      const currentCount = countExamSnapshotRecords(current);
      const incomingCount = countExamSnapshotRecords(incoming);
      const summary =
        `当前 题库 ${curB.banks} / 错题 ${curB.wrong} / 刷题 ${curB.attempts} / 模考 ${curB.mocks} / 模板 ${curB.templates}` +
        ` ⇄ 快照 题库 ${incB.banks} / 错题 ${incB.wrong} / 刷题 ${incB.attempts} / 模考 ${incB.mocks} / 模板 ${incB.templates}`;
      return {
        currentCount,
        incomingCount,
        summary,
      };
    },
    importMerge: async (incoming) => {
      if (!incoming || typeof incoming !== "object") return false;
      const sanitizedIncoming = stripSecretsForVault(incoming);
      const ok = await host.restoreData(sanitizedIncoming);
      if (!ok) return false;
      if (host.mergeSafePreferences && sanitizedIncoming.preferences && typeof sanitizedIncoming.preferences === "object") {
        const safePrefs = extractSafePreferences(sanitizedIncoming.preferences);
        if (Object.keys(safePrefs).length > 0) {
          await host.mergeSafePreferences(safePrefs);
        }
      }
      try {
        host.invalidateApp?.();
      } catch {
        /* ignore */
      }
      emitExamEvent("bank-changed", { bank: "" });
      try {
        host.dispatchPublicStats?.();
      } catch {
        /* ignore */
      }
      return true;
    },
  };
}
