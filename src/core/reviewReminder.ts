/**
 * 定时错题复习提醒与巡检调度核心 (Daily Review Reminder Engine)
 * 基于艾宾浩斯临界衰减期与在册错题，提供防打扰、稍后提醒与今日免打扰能力
 */

import type { ExamApp } from "@/app";
import type { WrongItem } from "@/core/types";
import { notifyDailyReviewCard, lvNotify, CATEGORY_DAILY_REVIEW } from "@/libs/notice";
import { lvTicker } from "@/libs/lv-notice-kit";

export interface ReviewReminderStats {
  totalActiveWrongs: number;
  criticalDueCount: number; // 处于黄金抢救期(<=1天)或拐点期(<=3天)的急需复习错题
  items: WrongItem[];
}

/**
 * 评估当前题库中处于艾宾浩斯临界衰减期的待复习错题
 */
export function evaluateReviewWrongs(app: ExamApp, now: number = Date.now()): ReviewReminderStats {
  if (!app) {
    return { totalActiveWrongs: 0, criticalDueCount: 0, items: [] };
  }

  const allWrongs = app.wrongItems().filter((w) => w.status === "active");
  const dueItems: WrongItem[] = [];

  for (const w of allWrongs) {
    const lastWrongAt = w.lastWrongAt || now;
    const days = Math.max(0, (now - lastWrongAt) / 86400000);
    // 超过 12 小时且处于艾宾浩斯复习周期 (<= 30 天) 的错题需要复习巩固
    if (days >= 0.5 && days <= 30) {
      dueItems.push(w);
    }
  }

  return {
    totalActiveWrongs: allWrongs.length,
    criticalDueCount: dueItems.length > 0 ? dueItems.length : allWrongs.length,
    items: dueItems.length > 0 ? dueItems : allWrongs,
  };
}

export interface ReviewReminderController {
  checkAndNotify: (force?: boolean) => string | null;
  dispose: () => void;
}

const REMINDER_LAST_NOTIFIED_KEY = "lv_exam_review_reminder_last_ts";
const MIN_NOTIFICATION_INTERVAL_MS = 4 * 3600 * 1000; // 提醒冷却间隔：至少 4 小时

/**
 * 启动每日错题复习提醒周期调度器 (Epoch 7 Phase 2: lvTicker 统一心跳与零点跨日)
 * @param app 考试应用实例
 * @param onStartReview 用户点击【立即攻坚】时的回调
 * @param onDateCross 可选零点跨日回调，用于更新今日待复习错题集
 * @param isEnabled 可选持久化开关判定（免疫重启与端口隔离，彻底静默）
 */
export function startReviewReminderScheduler(
  app: ExamApp,
  onStartReview: () => void,
  onDateCross?: (todayKey: string) => void,
  isEnabled?: () => boolean,
): ReviewReminderController {
  // 启动即主动预热拉取磁盘免打扰表，确保端口漂移后第一时间感知持久化配置
  if (typeof lvNotify.syncMuteFromDisk === "function") {
    void lvNotify.syncMuteFromDisk();
  }

  const checkAndNotify = (force = false): string | null => {
    if (!app) return null;
    // 物理持久化配置硬门禁（读取插件配置落盘文件，关闭后彻底静默）
    if (typeof isEnabled === "function" && !isEnabled()) return null;
    try {
      if (localStorage.getItem("lv_exam_review_reminder_disabled") === "true") return null;
    } catch { /* ignore */ }
    if (lvNotify.isMutedToday(CATEGORY_DAILY_REVIEW) || lvNotify.isCategoryMuted?.(CATEGORY_DAILY_REVIEW)) return null;
    if (lvNotify.isCategorySnoozed?.(CATEGORY_DAILY_REVIEW)) return null;

    const now = Date.now();
    const nowDate = new Date(now);
    const hour = nowDate.getHours();

    // 深夜防打扰 (23:00 ~ 08:00)：非强制时不主动弹送复习提醒卡片
    if (!force && (hour >= 23 || hour < 8)) {
      return null;
    }

    // 冷却防抖：检查上次通知时间，防止每分钟心跳或定时器重复拉起高频弹出
    try {
      const last = Number(localStorage.getItem(REMINDER_LAST_NOTIFIED_KEY) || "0");
      if (!force && last > 0 && now - last < MIN_NOTIFICATION_INTERVAL_MS) {
        return null;
      }
    } catch { /* ignore */ }

    const stats = evaluateReviewWrongs(app, now);
    if (stats.criticalDueCount <= 0) {
      return null;
    }

    const cardId = notifyDailyReviewCard({
      dueCount: stats.criticalDueCount,
      onStartReview,
    });

    if (cardId) {
      try {
        localStorage.setItem(REMINDER_LAST_NOTIFIED_KEY, String(now));
      } catch { /* ignore */ }
    }

    return cardId;
  };

  // 延迟 5 秒进行首次轻量静默探测，避免阻塞插件启动瞬间的高峰渲染
  const initialTimeout = window.setTimeout(() => {
    checkAndNotify(false);
  }, 5000);

  // 接入 lvTicker.onMinute：对齐全局主心跳，彻底拔除分散的 setInterval
  const unsubMinute = lvTicker.onMinute("siyuan-exam", () => {
    checkAndNotify(false);
  });

  // 接入 lvTicker.onDateCross：零点自动跨日更新今日待复习错题集（静默更新，不打破深夜防打扰）
  const unsubDateCross = lvTicker.onDateCross("siyuan-exam", (todayKey) => {
    try {
      onDateCross?.(todayKey);
    } catch (e) {
      console.warn("[LvExam] onDateCross handler error:", e);
    }
    // 零点跨日更新内部待复习统计，但不强制立即弹出卡片（深夜防打扰保全）
    checkAndNotify(false);
  });

  return {
    checkAndNotify,
    dispose: () => {
      if (initialTimeout) clearTimeout(initialTimeout);
      unsubMinute?.();
      unsubDateCross?.();
    },
  };
}
