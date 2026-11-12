// ============================================================
// 练习与背诵键盘交互调度服务（practiceKeyboardService.ts）
// 承接全局快捷键意图判定、输入法屏蔽与无障碍按键解析
// 纯函数调度，不依赖 DOM 渲染环境
// ============================================================

import type { Question } from "@/core/types";
import { isChoiceQuestion } from "@/core/answerChoices";

export type WrongReasonKey = "careless" | "unknown" | "trap";
export type ConfidenceKey = "sure" | "fuzzy" | "guess";
export type ReciteRatingKey = 1 | 2 | 3 | 4;

export type KeyboardAction =
  | { type: "help" }
  | { type: "exit_session" }
  | { type: "undo_submit" }
  | { type: "next_question" }
  | { type: "prev_question" }
  | { type: "toggle_scratchpad" }
  | { type: "record_wrong_reason"; reason: WrongReasonKey }
  | { type: "pick_choice"; key: string }
  | { type: "set_confidence"; confidence: ConfidenceKey }
  | { type: "toggle_fav" }
  | { type: "submit_answer" }
  | { type: "tts_speak" }
  | { type: "reveal_recite" }
  | { type: "recite_hint" }
  | { type: "recite_rate"; rating: ReciteRatingKey };

export interface KeyboardEventLike {
  key: string;
  keyCode?: number;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  isComposing?: boolean;
  defaultPrevented?: boolean;
}

export interface SessionContext {
  hasSession: boolean;
  isSessionDone: boolean;
  currentQuestion?: Question | null;
  hasFeedback: boolean;
  feedbackVerdict?: string;
  canSubmit: boolean;
  doneCount: number;
  choiceCount?: number;
}

export interface ReciteContext {
  isDone: boolean;
  hasQueue: boolean;
  hasCurrentQuestion: boolean;
  revealed: boolean;
  hintLevel: number;
  hasAnalysis: boolean;
}

export interface KeyboardDispatchContext {
  event: KeyboardEventLike;
  view: string;
  session?: SessionContext;
  recite?: ReciteContext;
}

/** 判定按键是否应该被忽略（例如中文输入法中、组合键等） */
export function shouldIgnoreKeyEvent(e: KeyboardEventLike): boolean {
  if (e.defaultPrevented) return true;
  if (e.isComposing || e.keyCode === 229) return true;
  return false;
}

/**
 * 判定事件目标是否属于输入性交互控件（应避免快捷键劫持）
 */
export function isInputTarget(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false;
  if (target.closest('input, textarea, select, [contenteditable="true"]') || target.isContentEditable) return true;
  return false;
}

/**
 * 判定当前页面焦点或模态状态是否应该拦截全局快捷键
 */
export function shouldBlockGlobalHotkeys(options: {
  tabRoot: HTMLElement | null;
  target: EventTarget | null;
  defaultPrevented?: boolean;
  paletteOpen?: boolean;
  railOpen?: boolean;
  hasModalDialog?: boolean;
}): boolean {
  const { tabRoot, target, defaultPrevented, paletteOpen, railOpen, hasModalDialog } = options;
  if (!tabRoot?.getClientRects().length || defaultPrevented || paletteOpen || railOpen || hasModalDialog) {
    return true;
  }
  if (target instanceof HTMLElement) {
    if (target !== document.body && !tabRoot.contains(target)) return true;
    if (isInputTarget(target)) return true;
  }
  return false;
}


/** 解析键盘事件对应的业务动作意图 */
export function resolveKeyboardAction(ctx: KeyboardDispatchContext): KeyboardAction | null {
  const { event: e, view, session, recite } = ctx;

  if (shouldIgnoreKeyEvent(e)) return null;

  // 1. 帮助浮层快捷键（?）
  if (e.key === "?" && !e.ctrlKey && !e.metaKey && !e.altKey) {
    return { type: "help" };
  }

  // 2. 练习做题会话（Session）视图下的交互
  if (view === "session" && session && session.hasSession && !session.isSessionDone && session.currentQuestion) {
    const q = session.currentQuestion;

    // 快捷撤销作答（Ctrl+Z / Meta+Z / 单键 u）
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && session.hasFeedback) {
      return { type: "undo_submit" };
    }

    // 忽略其他附带 Ctrl/Meta/Alt 的按键
    if (e.ctrlKey || e.metaKey || e.altKey) return null;

    if (e.key === "Escape") {
      return { type: "exit_session" };
    }

    // 反馈态（Feedback）下的快捷流
    if (session.hasFeedback) {
      if (e.key === "Enter" || e.key === " " || e.key.toLowerCase() === "j") {
        return { type: "next_question" };
      }
      if (e.key.toLowerCase() === "k") {
        return { type: "prev_question" };
      }
      if (e.key.toLowerCase() === "u") {
        return { type: "undo_submit" };
      }
      if (e.shiftKey && e.key.toUpperCase() === "S") {
        return { type: "toggle_scratchpad" };
      }
      if (session.feedbackVerdict === "wrong" && /^[1-3]$/.test(e.key)) {
        const reasons: WrongReasonKey[] = ["careless", "unknown", "trap"];
        return { type: "record_wrong_reason", reason: reasons[Number(e.key) - 1] };
      }
      return null;
    }

    // 答题态下的快捷流
    const upperKey = e.key.toUpperCase();
    const choiceCount = session.choiceCount ?? (q.options?.length || (isChoiceQuestion(q) ? 4 : 0));
    const choiceIdx = upperKey.charCodeAt(0) - 65;

    if (q.type === "judge") {
      if (e.key === "1" || upperKey === "T") return { type: "pick_choice", key: "对" };
      if (e.key === "2" || upperKey === "F") return { type: "pick_choice", key: "错" };
    }

    if (isChoiceQuestion(q) && /^[A-J]$/.test(upperKey) && choiceIdx >= 0 && choiceIdx < choiceCount) {
      return { type: "pick_choice", key: upperKey };
    }

    // G 键直标「猜测」（Moodle CBM 标杆，benchmark-fusion）：仅当 G 未被选项键位占用时生效——
    // 选项数 ≤ 6 时 A-F 已覆盖全部选项，G 空闲；7 选项及以上 G 仍是选项键，置信度用 3 键。
    // 分类消费口径见 core/cbm.ts（guess/fuzzy 答对→脆弱伪掌握）。
    if (e.key.toLowerCase() === "g" && (!isChoiceQuestion(q) || choiceCount < 7)) {
      return { type: "set_confidence", confidence: "guess" };
    }

    if (/^[1-3]$/.test(e.key)) {
      const confidences: ConfidenceKey[] = ["sure", "fuzzy", "guess"];
      return { type: "set_confidence", confidence: confidences[Number(e.key) - 1] };
    }

    if (e.key.toLowerCase() === "e") {
      return { type: "toggle_fav" };
    }

    if (e.shiftKey && e.key.toUpperCase() === "S") {
      return { type: "toggle_scratchpad" };
    }

    if (e.key === "Enter" || e.key === " ") {
      if (session.canSubmit) {
        return { type: "submit_answer" };
      }
      return null;
    }

    if (e.key.toLowerCase() === "k" && session.doneCount > 0) {
      return { type: "prev_question" };
    }
  }

  // 3. 背诵模式（Recite）视图下的交互
  if (view === "recite" && recite && !recite.isDone && recite.hasQueue) {
    if (e.key === "Escape" && !e.ctrlKey && !e.metaKey && !e.altKey) {
      return { type: "exit_session" };
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return null;

    if (e.key.toLowerCase() === "v" && recite.hasCurrentQuestion) {
      return { type: "tts_speak" };
    }

    if (!recite.revealed && e.key === " ") {
      return { type: "reveal_recite" };
    }

    if (!recite.revealed && recite.hintLevel === 1 && e.key.toLowerCase() === "h" && recite.hasAnalysis) {
      return { type: "recite_hint" };
    }

    if (recite.revealed && /^[1-4]$/.test(e.key)) {
      return { type: "recite_rate", rating: Number(e.key) as ReciteRatingKey };
    }
  }

  return null;
}

export interface SwipeGestureState {
  startX: number;
  startY: number;
  startTime: number;
}

/**
 * WAI-ARIA tabs 方向键导航：给定当前 tab 索引与按键，返回下一个聚焦索引。
 * ArrowRight/ArrowLeft 循环移动，Home/End 跳两端；非方向键返回 -1（调用方不处理）。
 * 配合 roving tabindex（选中 tab tabIndex=0，其余 -1）保证整个 tablist 仅占一个 Tab 停靠。
 */
export function tablistNextIndex(key: string, current: number, length: number): number {
  if (length <= 0 || current < 0 || current >= length) return -1;
  switch (key) {
    case "ArrowRight":
      return (current + 1) % length;
    case "ArrowLeft":
      return (current - 1 + length) % length;
    case "Home":
      return 0;
    case "End":
      return length - 1;
    default:
      return -1;
  }
}

/**
 * tablist 容器统一键盘处理（WAI-ARIA tabs，automatic activation）：
 * 方向键在 [role=tab] 间移动焦点并触发 click 激活，Home/End 跳两端。
 * 返回 true 表示已消费；未命中方向键或焦点不在 tab 按钮上时返回 false，不打扰其它快捷键。
 * 配合各 tab 的 roving tabindex（仅选中 tab tabIndex=0）保持整个 tablist 单 Tab 停靠。
 */
export function handleTablistKeydown(e: KeyboardEvent): boolean {
  const target = e.target as HTMLElement | null;
  if (!target || !(target instanceof HTMLButtonElement) || target.getAttribute("role") !== "tab") return false;
  const container = e.currentTarget;
  if (!(container instanceof HTMLElement)) return false;
  const tabs = Array.from(container.querySelectorAll<HTMLButtonElement>("[role='tab']"));
  const next = tablistNextIndex(e.key, tabs.indexOf(target), tabs.length);
  if (next < 0) return false;
  e.preventDefault();
  tabs[next]?.focus();
  tabs[next]?.click(); // automatic activation：tab 数量少，焦点到达即切换面板
  return true;
}

/**
 * 检测移动端左右滑动手势（用于切题导航）
 */
export function detectHorizontalSwipe(
  e: TouchEvent,
  startState: SwipeGestureState,
): "next" | "prev" | null {
  if (e.changedTouches.length !== 1) return null;
  const touch = e.changedTouches[0];
  const deltaX = touch.clientX - startState.startX;
  const deltaY = touch.clientY - startState.startY;
  const deltaTime = Date.now() - startState.startTime;

  if (Math.abs(deltaX) > 60 && Math.abs(deltaX) > Math.abs(deltaY) * 2 && deltaTime < 600) {
    return deltaX < 0 ? "next" : "prev";
  }
  return null;
}

/**
 * 轮转自习字号设置（normal -> large -> xlarge -> normal）
 */
export function getNextStudyFontSize(
  current: "normal" | "large" | "xlarge",
): "normal" | "large" | "xlarge" {
  if (current === "normal") return "large";
  if (current === "large") return "xlarge";
  return "normal";
}
