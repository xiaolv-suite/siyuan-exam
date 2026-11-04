/**
 * 小驴考试 · 长会话进度保护 (Mobile Spec v1 核心护城河)
 * 参照快门弹射坞 armSheetHistory / disarmSheetHistory 模式：
 * 答题/模考进行中时向 history 压入占位态 ({ lvExam: true }, "")。
 * 当用户按 Android 返回手势/返回键时触发 popstate，拦截并弹出确认框：
 * 「考试进行中，确认退出？（进度将保存至草稿）」。
 * - 用户确认：保存进度草稿，清理监听并退出；
 * - 用户取消：重新 pushState 恢复占位，继续考试；
 * 正常交卷后调用 disarmExamHistory() 回退一步 history 清理占位。
 */

export interface ExamHistoryGuardConfig {
  /** 判定当前是否处于活跃未交卷状态 */
  isActive: () => boolean;
  /** 保存进度草稿 */
  onSaveDraft: () => Promise<void> | void;
  /** 确认退出后的回调 */
  onExit: () => Promise<void> | void;
  confirmTitle?: string;
  confirmPrompt?: string;
}

let currentGuard: ExamHistoryGuardConfig | null = null;
let examHistoryArmed = false;
let examPopHandler: (() => void) | undefined;
let isConfirming = false;

export function isExamHistoryArmed(): boolean {
  return examHistoryArmed;
}

export function getCurrentGuard(): ExamHistoryGuardConfig | null {
  return currentGuard;
}

/**
 * 启动考试长会话进度保护
 */
export function armExamHistory(config: ExamHistoryGuardConfig): void {
  if (typeof window === "undefined") return;
  currentGuard = config;
  if (examHistoryArmed) return;

  try {
    const hist = window.history;
    if (!hist || typeof hist.pushState !== "function") return;
    hist.pushState({ lvExam: true }, "");
    examHistoryArmed = true;

    examPopHandler = async () => {
      // popstate 触发表示占位态已被浏览器 pop 出栈
      examHistoryArmed = false;
      if (!currentGuard || !currentGuard.isActive()) {
        disarmExamHistory();
        return;
      }

      if (isConfirming) return;
      isConfirming = true;

      try {
        const { confirmDialogSync } = await import("@/libs/dialog");
        const ok = await confirmDialogSync({
          title: currentGuard.confirmTitle || "退出确认",
          content: currentGuard.confirmPrompt || "考试进行中，确认退出？（进度将保存至草稿）",
        });

        if (ok) {
          const cfg = currentGuard;
          disarmExamHistory();
          try {
            await cfg?.onSaveDraft();
            await cfg?.onExit();
          } catch (err) {
            console.error("[LvExam] onExit error after back confirm:", err);
          }
        } else {
          // 用户取消退出：恢复占位态继续考试
          try {
            window.history.pushState({ lvExam: true }, "");
            examHistoryArmed = true;
          } catch {
            /* ignore */
          }
        }
      } finally {
        isConfirming = false;
      }
    };

    window.addEventListener("popstate", examPopHandler);
  } catch {
    /* 历史不可用环境静默 */
  }
}

/**
 * 解除考试长会话进度保护（正常交卷或确认退出时调用）
 */
export function disarmExamHistory(): void {
  if (typeof window === "undefined") return;
  if (examPopHandler) {
    try {
      window.removeEventListener("popstate", examPopHandler);
    } catch {
      /* ignore */
    }
    examPopHandler = undefined;
  }

  if (examHistoryArmed) {
    examHistoryArmed = false;
    try {
      const hist = window.history as History & { state?: { lvExam?: boolean } };
      if (hist?.state?.lvExam && typeof hist.back === "function") {
        hist.back();
      }
    } catch {
      /* ignore */
    }
  }
  currentGuard = null;
}

/**
 * 手动退出请求拦截保护（供弹窗关闭按钮、下滑手势或统一浮层栈 Esc 调用）
 */
export async function requestExitExamWithConfirm(onConfirmedExit?: () => Promise<void> | void): Promise<boolean> {
  if (!currentGuard || !currentGuard.isActive()) {
    disarmExamHistory();
    if (onConfirmedExit) await onConfirmedExit();
    return true;
  }

  if (isConfirming) return false;
  isConfirming = true;

  try {
    const { confirmDialogSync } = await import("@/libs/dialog");
    const ok = await confirmDialogSync({
      title: currentGuard.confirmTitle || "退出确认",
      content: currentGuard.confirmPrompt || "考试进行中，确认退出？（进度将保存至草稿）",
    });

    if (ok) {
      const cfg = currentGuard;
      disarmExamHistory();
      try {
        await cfg?.onSaveDraft();
        await cfg?.onExit();
        if (onConfirmedExit) await onConfirmedExit();
      } catch (err) {
        console.error("[LvExam] requestExitExamWithConfirm error:", err);
      }
      return true;
    }
    return false;
  } finally {
    isConfirming = false;
  }
}
