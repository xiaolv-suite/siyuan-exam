// ============================================================
// 考试→打卡最小单向桥（TODO 48-03 lite）：契约来源 小驴打卡/docs/api-v5.md（稳定版，2026-10-04 核对）
// - 探测三步：window.siyuanCheckin + protocol==="siyuan-checkin" → whenReady() → hasCapability("events.record")
// - 写入：source 恒为 "api"（写入仅接受 "api"）；返回 undefined 一律=未写入，须以原 externalRef 重试
// - 幂等：externalRef = "exam:<itemId>:<localDate>"（每日一次；前缀 "exam:" 尚未在打卡侧登记——
//   identity-and-merge.md 治理步骤待办，见 TODO 48-03 注记）
// - 红线：失败保留原引用重试（不生成新随机引用）；用户未配置 itemId 时桥不生效
// ============================================================

export interface CheckinBridgeConfig {
  /** 打卡项目 ID（用户在设置中填写；空 = 桥关闭） */
  itemId: string;
  /** 每日达标题数（≤0 时回退调用方的每日目标） */
  threshold: number;
}

export interface CheckinEventInput {
  itemId: string;
  value: number;
  unit: string;
  source: "api";
  externalRef: string;
  note?: string;
  occurredAt: string;
}

export function localDateKeyOf(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** 桥是否生效（用户配置了 itemId 才算开启；阈值 ≤0 回退默认值由调用方决定） */
export function bridgeEnabled(cfg: CheckinBridgeConfig): boolean {
  return cfg.itemId.trim().length > 0;
}

/** 达标判定：当日作答题数 ≥ 阈值 */
export function shouldCheckin(todayAttempts: number, cfg: CheckinBridgeConfig, fallbackGoal: number): boolean {
  const threshold = cfg.threshold > 0 ? cfg.threshold : Math.max(1, fallbackGoal);
  return todayAttempts >= threshold;
}

/** 构造打卡事件（幂等身份：exam:<itemId>:<localDate>，同日永远同一引用） */
export function buildCheckinEvent(
  cfg: CheckinBridgeConfig,
  todayAttempts: number,
  nowMs: number,
): CheckinEventInput {
  const localDate = localDateKeyOf(nowMs);
  return {
    itemId: cfg.itemId.trim(),
    value: todayAttempts,
    unit: "题",
    source: "api",
    externalRef: `exam:${cfg.itemId.trim()}:${localDate}`,
    note: "小驴考试 · 每日练习",
    occurredAt: new Date(nowMs).toISOString(),
  };
}

export interface CheckinItemSummary {
  id: string;
  name: string;
  unit?: string;
  kind?: string;
  archived?: boolean;
}

/** 打卡公开 API 的最小消费面（防御性 typing；完整契约见打卡 docs/api-v5.md） */
export interface CheckinApiV5 {
  protocol: string;
  whenReady?: () => Promise<void> | void;
  hasCapability?: (name: string) => boolean;
  recordEvent?: (input: CheckinEventInput) => CheckinEventRecord | undefined | Promise<CheckinEventRecord | undefined>;
  recordEventsBatch?: (inputs: CheckinEventInput[]) => Promise<Array<{ kind: "recorded" | "duplicate" | "discarded" | "blocked" | "rejected"; eventId?: string }>>;
  queryItems?: (options?: { includeArchived?: boolean; limit?: number }) => CheckinItemSummary[];
  getItems?: () => CheckinItemSummary[];
}

export interface CheckinEventRecord {
  id?: string;
  eventId?: string;
}

export type CheckinSyncStatus =
  | "disabled" // 用户未配置 itemId 且未发现匹配项
  | "no-api" // 打卡未安装/协议不符
  | "no-capability" // 未开放 events.record
  | "below-threshold" // 当日未达标
  | "synced" // 新写入
  | "duplicate" // 幂等命中（当日已同步过）
  | "pending"; // 写入失败 → 保留原引用待重试

/**
 * 自动从打卡插件中发现合适的刷题打卡项：
 * 1. 优先匹配名称含「刷题」、「做题」、「考试」、「考备」、「备考」的活跃项目
 * 2. 其次匹配名称含「学习」、「复习」的项目
 * 3. 如仅有一个活跃项目，采纳该项目
 */
export function autoResolveCheckinItem(api: CheckinApiV5 | null): CheckinItemSummary | null {
  if (!api) return null;
  try {
    const rawItems = typeof api.queryItems === "function"
      ? api.queryItems({ includeArchived: false, limit: 50 })
      : typeof api.getItems === "function"
      ? api.getItems()
      : [];
    if (!Array.isArray(rawItems) || !rawItems.length) return null;
    const items = rawItems.filter((it) => it && it.id && !it.archived);
    if (!items.length) return null;

    // 1. 强关键字优先
    const strongMatch = items.find((it) =>
      /刷题|做题|小驴考试|考试|考备|备考/.test(it.name || "")
    );
    if (strongMatch) return strongMatch;

    // 2. 次级关键字
    const studyMatch = items.find((it) =>
      /学习|复习|打卡/.test(it.name || "")
    );
    if (studyMatch) return studyMatch;

    // 3. 只有一个活跃项目时兜底采纳
    if (items.length === 1) return items[0];
    return null;
  } catch {
    return null;
  }
}

/** 探测并返回可用 API（多别名支持 + 协议不符 → null） */
export function probeCheckinApi(w: unknown): CheckinApiV5 | null {
  const host = w as {
    siyuanCheckin?: CheckinApiV5;
    LvCheckin?: CheckinApiV5;
    xiaolvCheckin?: CheckinApiV5;
    lvCheckin?: CheckinApiV5;
  } | undefined;
  const api = host?.siyuanCheckin || host?.LvCheckin || host?.xiaolvCheckin || host?.lvCheckin;
  if (!api || api.protocol !== "siyuan-checkin") return null;
  return api;
}

/** @deprecated Legacy daily aggregate adapter. Production settlement uses sessionCheckinService. */
export async function syncCheckin(
  api: CheckinApiV5 | null,
  cfg: CheckinBridgeConfig,
  todayAttempts: number,
  nowMs: number,
  fallbackGoal: number,
): Promise<{ status: CheckinSyncStatus; event?: CheckinEventInput; autoResolvedItem?: CheckinItemSummary }> {
  let effectiveCfg = cfg;
  let autoResolvedItem: CheckinItemSummary | undefined;
  // Discovery is a read-only suggestion. Empty configuration always means off.
  if (!bridgeEnabled(effectiveCfg)) return { status: "disabled" };
  if (!shouldCheckin(todayAttempts, effectiveCfg, fallbackGoal)) return { status: "below-threshold" };
  if (!api) return { status: "no-api" };
  try {
    await api.whenReady?.();
    if (api.hasCapability && !api.hasCapability("events.record")) return { status: "no-capability" };
    if (typeof api.recordEvent !== "function") return { status: "no-capability" };
    const event = buildCheckinEvent(effectiveCfg, todayAttempts, nowMs);
    const result = await api.recordEvent(event); // undefined = 未写入（保留原 externalRef 重试，不换新引用）
    if (result === undefined) return { status: "pending", event, autoResolvedItem };
    return { status: "synced", event, autoResolvedItem }; // 新写入与幂等命中都视为已同步（duplicate 返回已有副本）
  } catch {
    return { status: "pending", event: buildCheckinEvent(effectiveCfg, todayAttempts, nowMs), autoResolvedItem };
  }
}

// ---------- 打卡→考试只读投影（TODO 48-04 lite）：连续天数展示，只读、失败安静 ----------

export interface CheckinStreakApiV5 extends CheckinApiV5 {
  getStreaks?: (itemIds?: string[]) => Array<{ itemId: string; current: number; longest: number }>;
}

/** 读取配置项目的连续打卡（48-04 lite；metrics.read 能力缺失/异常 → null，不影响刷题）。
 *  红线：连续数由打卡单一实现计算，考试侧不自算；仅用户配置了桥 itemId 时才读取 */
export async function fetchStreak(
  api: CheckinApiV5 | null,
  itemId: string,
): Promise<{ current: number; longest: number } | null> {
  if (!api || !itemId.trim()) return null;
  try {
    await api.whenReady?.();
    if (api.hasCapability && !api.hasCapability("metrics.read")) return null;
    const api2 = api as CheckinStreakApiV5;
    if (typeof api2.getStreaks !== "function") return null;
    const list = api2.getStreaks([itemId.trim()]);
    const s = list?.find((x) => x.itemId === itemId.trim());
    return s ? { current: s.current, longest: s.longest } : null;
  } catch {
    return null;
  }
}
