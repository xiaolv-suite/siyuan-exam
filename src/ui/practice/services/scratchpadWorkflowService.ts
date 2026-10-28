// ============================================================
// 演算草稿纸工作流服务（scratchpadWorkflowService.ts）
// 承接草稿纸文本检索、模式切换与系统剪贴板拷贝
// 纯逻辑解耦，不绑定 Svelte 渲染态
// ============================================================

import {
  getScratchpadText,
  type ScratchpadStore,
  type ScratchpadMode,
} from "@/core/scratchpad";

/**
 * 获取当前题目的草稿纸内容
 */
export function getQuestionScratchpadContent(
  store: ScratchpadStore,
  qid: string | undefined,
  mode: ScratchpadMode,
  sharedText: string,
): string {
  if (!qid) return "";
  return getScratchpadText(store, qid, mode, sharedText);
}

/**
 * 拷贝草稿纸内容至剪贴板
 */
export async function copyScratchpadText(
  text: string,
  showMessage: (msg: string, time?: number, type?: string) => void,
  t: (k: string) => string,
): Promise<boolean> {
  const content = text.trim();
  if (!content) return false;

  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(content);
      showMessage(t("scratchpad.copied"), 2000, "info");
      return true;
    }
    return false;
  } catch {
    return false;
  }
}
