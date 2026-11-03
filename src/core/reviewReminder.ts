/**
 * 定时错题复习提醒与巡检调度核心 (Daily Review Reminder Engine)
 * 基于艾宾浩斯临界衰减期与在册错题，提供防打扰、稍后提醒与今日免打扰能力
 */

import type { ExamApp } from "@/app";
import type { WrongItem } from "@/core/types";
import { notifyDailyReviewCard, lvNotify, CATEGORY_DAILY_REVIEW } from "@/libs/notice";

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
 * 启动每日错题复习提醒周期调度器
 * @param app 考试应用实例
 * @param onStartReview 用户点击【立即攻坚】时的回调
 * @param intervalMs 巡检周期，默认每小时检查一次
 */
export function startReviewReminderScheduler(
  app: ExamApp,
  onStartReview: () => void,
  intervalMs: number = 3600_000,
): ReviewReminderController {
  let timer: number | null = null;

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

  // 启动周期性巡检
  timer = window.setInterval(() => {
    checkAndNotify();
  }, intervalMs);

  return {
    checkAndNotify,
    dispose: () => {
      if (initialTimeout) clearTimeout(initialTimeout);
      if (timer) clearInterval(timer);
      timer = null;
    },
  };
}
