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
  checkAndNotify: () => string | null;
  dispose: () => void;
}

/**
 * 启动每日错题复习提醒周期调度器 (Epoch 7 Phase 2: lvTicker 统一心跳与零点跨日)
 * @param app 考试应用实例
 * @param onStartReview 用户点击【立即攻坚】时的回调
 * @param onDateCross 可选零点跨日回调，用于更新今日待复习错题集
 */
export function startReviewReminderScheduler(
  app: ExamApp,
  onStartReview: () => void,
  onDateCross?: (todayKey: string) => void,
): ReviewReminderController {
  const checkAndNotify = (): string | null => {
    if (!app || lvNotify.isMutedToday(CATEGORY_DAILY_REVIEW)) {
      return null;
    }

    const stats = evaluateReviewWrongs(app);
    if (stats.criticalDueCount <= 0) {
      return null;
    }

    return notifyDailyReviewCard({
      dueCount: stats.criticalDueCount,
      onStartReview,
    });
  };

  // 延迟 5 秒进行首次轻量静默探测，避免阻塞插件启动瞬间的高峰渲染
  const initialTimeout = window.setTimeout(() => {
    checkAndNotify();
  }, 5000);

  // 接入 lvTicker.onMinute：对齐全局主心跳，彻底拔除分散的 setInterval
  const unsubMinute = lvTicker.onMinute("siyuan-exam", () => {
    checkAndNotify();
  });

  // 接入 lvTicker.onDateCross：零点自动跨日更新今日待复习错题集并重新触发巡检
  const unsubDateCross = lvTicker.onDateCross("siyuan-exam", (todayKey) => {
    try {
      onDateCross?.(todayKey);
    } catch (e) {
      console.warn("[LvExam] onDateCross handler error:", e);
    }
    checkAndNotify();
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
