import type { ExamApp } from "@/app";
import {
  probeCheckinApi,
  syncCheckin,
  localDateKeyOf,
  bridgeEnabled,
  fetchStreak,
  type CheckinSyncStatus,
  type CheckinEventInput,
  type CheckinBridgeConfig,
} from "@/core/checkinBridge";

export const CHECKIN_PENDING_KEY = "checkin/bridge/pending";

export interface CheckinPluginSettings {
  checkinItemId?: string;
  checkinThreshold?: number;
  dailyGoal?: number;
}

/**
 * 读取打卡桥配置对象
 */
export function getCheckinConfig(settings: CheckinPluginSettings): CheckinBridgeConfig {
  return {
    itemId: String(settings.checkinItemId ?? "").trim(),
    threshold: Number(settings.checkinThreshold ?? 0) || 0,
  };
}

/**
 * 执行练习结算打卡同步并写入待重试存储
 */
export async function runCheckinSync(
  app: ExamApp,
  settings: CheckinPluginSettings,
  win: Window = typeof window !== "undefined" ? window : ({} as Window),
): Promise<{ status: CheckinSyncStatus; note: string }> {
  const cfg = getCheckinConfig(settings);
  const api = probeCheckinApi(win);
  const today = localDateKeyOf(Date.now());
  const attempts = app.attempts
    .all()
    .filter((e) => localDateKeyOf(e.ts) === today && e.verdict !== "not_attempted").length;
  const goal = Number(settings.dailyGoal ?? 10) || 10;

  const st = await syncCheckin(api, cfg, attempts, Date.now(), goal);
  await app.saveAux(CHECKIN_PENDING_KEY, st.event ?? null);

  return {
    status: st.status,
    note: st.status === "pending" ? String(st.event?.externalRef ?? "") : "",
  };
}

/**
 * 重载时补写上次尚未投递成功的打卡记录
 */
export async function retryPendingCheckin(
  app: ExamApp,
  win: Window = typeof window !== "undefined" ? window : ({} as Window),
): Promise<boolean> {
  const pending = await app.loadAux<CheckinEventInput | null>(CHECKIN_PENDING_KEY);
  if (!pending) return false;

  const api = probeCheckinApi(win);
  if (!api) return false;

  try {
    await api.whenReady?.();
    if (api.hasCapability && !api.hasCapability("events.record")) return false;
    const result = api.recordEvent?.(pending);
    if (result !== undefined) {
      await app.saveAux(CHECKIN_PENDING_KEY, null);
      return true;
    }
  } catch {
    // 失败保留待重试，下次重载继续
  }
  return false;
}

/**
 * 读取连续打卡天数投影
 */
export async function queryCheckinStreak(
  settings: CheckinPluginSettings,
  win: Window = typeof window !== "undefined" ? window : ({} as Window),
): Promise<number | null> {
  const cfg = getCheckinConfig(settings);
  if (!bridgeEnabled(cfg)) return null;

  const s = await fetchStreak(probeCheckinApi(win), cfg.itemId);
  return s?.current ?? null;
}

/**
 * 会话结算后安全异步上报打卡事件（48-03 lite）
 */
export async function postSessionCheckinSafely(
  checkinItemId: string,
  total: number,
  correct: number,
): Promise<void> {
  if (!checkinItemId || total <= 0) return;
  const { logCheckinEventSafely } = await import("@/libs/ecosystem-bridge-kit");
  const accuracy = Math.round((correct / total) * 100);
  const today = new Date().toISOString().slice(0, 10);
  try {
    await logCheckinEventSafely({
      itemId: checkinItemId,
      value: total,
      unit: "题",
      externalRef: `exam:${checkinItemId}:${today}`,
      note: `完成备考刷题 ${total} 题（正确率 ${accuracy}%）`,
    });
  } catch {
    // 优雅静默
  }
}

