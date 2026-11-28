// ============================================================
// 轨道 A 启动分级存储与生态常量定义 (docs/07 v4 & msg#1640)
// ============================================================

export const TIER1_STORE_KEYS: readonly string[] = Object.freeze([
  "setting",
] as const);

export const TIER2_STORE_KEYS: readonly string[] = Object.freeze([
  "attempts/log",
  "wrongbook/overlays",
  "wrongbook/reasons",
  "wrongbook/reflections",
  "wrongbook/diagnosis",
  "banks",
] as const);

export const ALL_STORE_KEYS: readonly string[] = Object.freeze([
  ...TIER1_STORE_KEYS,
  ...TIER2_STORE_KEYS,
] as const);

export const BANK_REGISTRY_KEY = "banks";
export const SESSION_KEY = "session/active";
export const WRONG_REASON_KEY = "wrongbook/reasons";
export const WRONG_OVERLAY_KEY = "wrongbook/overlays";
export const WRONG_REFLECTION_KEY = "wrongbook/reflections";
export const WRONG_DIAGNOSIS_KEY = "wrongbook/diagnosis";
export const REVISIONS_KEY = "revisions";
export const MOCK_RUN_KEY = "mock/run";
export const ACTIONS_KEY = "actions/items";
export const MATERIALS_KEY = "materials/registry";
export const MATERIAL_NOTES_KEY = "materials/notes";
export const MATERIAL_QREFS_KEY = "materials/qrefs";
export const MISDIAGNOSIS_KEY = "ai/misdiagnosis";
export const SYLLABUS_KEY = "syllabus/tree";
export const KP_RELATIONS_KEY = "kp/relations";
export const PENDING_RATING_KEY = "riff/pending-ratings";
