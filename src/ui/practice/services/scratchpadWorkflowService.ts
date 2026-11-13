// ============================================================
// 演算草稿纸工作流服务（scratchpadWorkflowService.ts）
// 承接草稿纸文本检索、模式切换与系统剪贴板拷贝
// 纯逻辑解耦，不绑定 Svelte 渲染态
// ============================================================

import {
  getScratchpadText,
  updateScratchpadText,
  clearCurrentScratchpad,
  type ScratchpadStore,
  type ScratchpadMode,
} from "@/core/scratchpad";

export { updateScratchpadText, clearCurrentScratchpad, type ScratchpadStore, type ScratchpadMode };

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
    showMessage("当前环境不支持自动剪贴板，请手动选中文本复制", 3000, "error");
    return false;
  } catch {
    showMessage("复制失败，请检查剪贴板权限或手动复制", 3000, "error");
    return false;
  }
}

/**
 * 更新题目草稿纸并返回新状态
 */
export function applyScratchpadInput(
  store: ScratchpadStore,
  qid: string | undefined,
  text: string,
  mode: ScratchpadMode,
  sharedText: string,
): { store: ScratchpadStore; sharedText: string } | null {
  if (!qid) return null;
  return updateScratchpadText(store, qid, text, mode, sharedText);
}

/**
 * 清除题目草稿纸并返回新状态
 */
export function applyClearScratchpad(
  store: ScratchpadStore,
  qid: string | undefined,
  mode: ScratchpadMode,
  sharedText: string,
): { store: ScratchpadStore; sharedText: string } | null {
  if (!qid) return null;
  return clearCurrentScratchpad(store, qid, mode, sharedText);
}
