/**
 * 小驴考试 · 全生态统一通知适配层
 * 统一出口智能分流、答题轻量化 (inline/capsule)、交卷成绩单与复习提醒卡片 (card)
 */

import { lvNotify, lvLaunchpad, type LvNoticeLevel, type LvNoticeAction } from "./lv-notice-kit";
export { lvNotify, type LvNoticeLevel, type LvNoticeAction };

export const EXAM_NOTICE_SOURCE = "小驴考试";
export const CATEGORY_DAILY_REVIEW = "exam-daily-review";

/**
 * 统一出口智能分流包装器（对标 showMessage，降噪防打扰）
 */
export function showExamNotice(
  message: string,
  timeout = 2500,
  type: "info" | "error" | "warn" | "success" = "info",
): string {
  if (type === "error") {
    return lvNotify.card({
      source: EXAM_NOTICE_SOURCE,
      title: "小驴考试提醒",
      message,
      level: "error",
      duration: Math.max(timeout, 6000),
    });
  }

  return lvNotify.capsule({
    source: EXAM_NOTICE_SOURCE,
    message,
    level: type === "warn" ? "warn" : type === "success" ? "success" : "info",
    duration: timeout,
  });
}

export const showMessage = showExamNotice;

/**
 * 原位微动效（用于答题过程中按钮交互、选项标记、星标等，坚决不遮挡题干）
 */
export function notifyInline(
  target: HTMLElement | null | undefined,
  tipText?: string,
  isSuccess = true,
): void {
  lvNotify.inline(target, tipText, isSuccess);
}

/**
 * 瞬时微胶囊（2.5 秒自然淡出，适合单行轻量反馈，避让视线）
 */
export function notifyCapsule(
  message: string,
  duration = 2000,
  level: LvNoticeLevel = "info",
): string {
  return lvNotify.capsule({
    source: EXAM_NOTICE_SOURCE,
    message,
    duration,
    level,
  });
}

export interface MockFinishCardOptions {
  paperName: string;
  totalScore: number;
  fullScore: number;
  percent: number;
  pass: boolean;
  wrongCount: number;
  onViewWrongbook?: () => void;
  onViewReport?: () => void;
}

/**
 * 模考交卷成功成绩单通知卡片
 * 展示得分与【查看错题本】、【全卷复盘】操作按钮
 */
export function notifyMockFinishCard(opts: MockFinishCardOptions): string {
  lvLaunchpad.haptic(10);
  const actions: LvNoticeAction[] = [];

  if (opts.wrongCount > 0 && opts.onViewWrongbook) {
    actions.push({
      label: "查看错题解析",
      primary: true,
      onClick: opts.onViewWrongbook,
    });
  }

  if (opts.onViewReport) {
    actions.push({
      label: "全卷复盘",
      primary: opts.wrongCount === 0,
      onClick: opts.onViewReport,
    });
  }

  const passLabel = opts.pass ? "🎉 及格" : "⚠️ 未及格";
  const message = `得分：${opts.totalScore} / ${opts.fullScore}（${opts.percent}% · ${passLabel}）· 发现错题 ${opts.wrongCount} 道`;

  return lvNotify.card({
    source: EXAM_NOTICE_SOURCE,
    category: "mock-finish",
    title: `《${opts.paperName || "模拟考试"}》已完成交卷`,
    message,
    level: opts.pass ? (opts.wrongCount === 0 ? "success" : "info") : "warn",
    duration: 12000,
    actions,
  });
}

export interface PracticeFinishCardOptions {
  bankName: string;
  total: number;
  correct: number;
  wrong: number;
  onViewWrongbook?: () => void;
  onReviewWrongs?: () => void;
}

/**
 * 练习会话结算成绩单通知卡片
 * 展示得分与【查看错题本】、【错题消灭特训】操作按钮
 */
export function notifyPracticeFinishCard(opts: PracticeFinishCardOptions): string {
  lvLaunchpad.haptic(10);
  const actions: LvNoticeAction[] = [];

  if (opts.wrong > 0) {
    if (opts.onViewWrongbook) {
      actions.push({
        label: "查看错题解析",
        primary: true,
        onClick: opts.onViewWrongbook,
      });
    }
    if (opts.onReviewWrongs) {
      actions.push({
        label: "立即消灭错题",
        onClick: opts.onReviewWrongs,
      });
    }
  }

  const accuracy = opts.total > 0 ? Math.round((opts.correct / opts.total) * 100) : 0;
  const message = `本次完成 ${opts.total} 题，答对 ${opts.correct} 题（正确率 ${accuracy}%）${opts.wrong > 0 ? `，${opts.wrong} 道错题已归集入库` : "，全部答对！"}`;

  return lvNotify.card({
    source: EXAM_NOTICE_SOURCE,
    category: "practice-finish",
    title: `《${opts.bankName || "专项练习"}》已完成结算`,
    message,
    level: opts.wrong === 0 ? "success" : "info",
    duration: 10000,
    actions,
  });
}

export interface DailyReviewReminderOptions {
  dueCount: number;
  onStartReview: () => void;
}

/**
 * 定时每日错题复习到期提醒卡片
 * 支持【立即复习】、【稍后提醒 (30分钟/2小时)】与【今日免打扰】
 */
export function notifyDailyReviewCard(opts: DailyReviewReminderOptions): string | null {
  if (opts.dueCount <= 0) return null;
  if (lvNotify.isMutedToday(CATEGORY_DAILY_REVIEW)) {
    return null;
  }

  return lvNotify.card({
    source: EXAM_NOTICE_SOURCE,
    category: CATEGORY_DAILY_REVIEW,
    title: "每日错题复习到期提醒",
    message: `题库中尚有 ${opts.dueCount} 道待消灭错题处于记忆临界期，及时复盘可巩固记忆！`,
    level: "warn",
    duration: 0, // 重点提醒常驻等待处理，或用户选择稍后/免打扰
    actions: [
      {
        label: `立即攻坚 (${opts.dueCount})`,
        primary: true,
        onClick: opts.onStartReview,
      },
    ],
    snooze: {
      options: [
        { label: "稍后提醒 (30分钟)", durationMs: 30 * 60 * 1000 },
        { label: "稍后提醒 (2小时)", durationMs: 2 * 60 * 60 * 1000 },
        { label: "今日免打扰", muteToday: true },
        { label: "未来3天不通知", muteDays: 3 },
        { label: "未来一周不通知", muteDays: 7 },
      ],
    },
  });
}

/**
 * 触发跨插件联动 (lvAutomation)：用户答错题加入错题本时广播联动事件
 */
export async function triggerWrongQuestionAutomation(q: {
  id: string;
  title?: string;
  stem?: string;
  analysis?: string;
  docId?: string;
  blockId?: string;
  rootId?: string;
}): Promise<{ triggered: number; success: number }> {
  try {
    const { lvAutomation } = await import("./lv-notice-kit");
    return await lvAutomation.trigger("siyuan-exam", "wrong-question", {
      questionId: q.id,
      title: q.title || (q.stem ? q.stem.slice(0, 50).trim() : ""),
      analysis: q.analysis || "",
      docId: q.docId || q.blockId || q.rootId || "",
    });
  } catch (e) {
    console.warn("[LvExam] trigger wrong-question automation failed:", e);
    return { triggered: 0, success: 0 };
  }
}
