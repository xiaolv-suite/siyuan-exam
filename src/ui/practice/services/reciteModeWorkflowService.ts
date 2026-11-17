// ============================================================
// 考前背题模式与纯听题工作流服务（reciteModeWorkflowService.ts）
// 承接突击背题模式持久化开关、自动切题揭示判定与 TTS 朗读文本拼装
// 纯逻辑解耦，不绑定 Svelte 渲染态
// ============================================================

import type { Question } from "@/core/types";

export const RECITE_MODE_STORAGE_KEY = "lv-exam/reciteMode";

/**
 * 读取考前背题模式开关状态
 */
export function loadReciteModeSetting(readLocal: (k: string) => string | null): boolean {
  return readLocal(RECITE_MODE_STORAGE_KEY) === "1";
}

/**
 * 持久化考前背题模式开关状态
 */
export function saveReciteModeSetting(
  writeLocal: (k: string, v: string) => void,
  enabled: boolean,
): void {
  writeLocal(RECITE_MODE_STORAGE_KEY, enabled ? "1" : "0");
}

/**
 * 拼装题目与选项用于 TTS 语音播报
 */
export function buildQuestionTtsText(q: Question | undefined | null): string {
  if (!q) return "";
  const parts = [q.stem || "", ...(Array.isArray(q.options) ? q.options : [])].filter(Boolean);
  return parts.join(" ");
}

export interface ReciteSubmitGuardContext {
  view: string;
  session: any;
  targetSession: any;
  targetQuestionId?: string;
  targetCursor?: number;
  reciteToggle: boolean;
  hasFeedback: boolean;
  exitBusy: boolean;
}

/**
 * 校验背题模式下是否应当安全调度自动提交（防竞态与退出冲突）
 */
export function canScheduleReciteSubmit(ctx: ReciteSubmitGuardContext): boolean {
  const {
    view,
    session,
    targetSession,
    targetQuestionId,
    targetCursor,
    reciteToggle,
    hasFeedback,
    exitBusy,
  } = ctx;

  if (view !== "session" || !targetSession || !session) return false;
  if (!reciteToggle || hasFeedback || exitBusy) return false;
  if (session !== targetSession) return false;

  if (targetQuestionId != null && session.current?.id !== targetQuestionId) {
    return false;
  }

  if (targetCursor != null && session.state?.cursor !== targetCursor) {
    return false;
  }

  return true;
}
