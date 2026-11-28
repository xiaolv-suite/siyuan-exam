/**
 * 小驴考试 · 错题深度穿透与原块溯源服务 (Error Notebook Deep Traceback)
 * 1. 定位：错题卡来源行增加「📍 笔记原块上下文」穿透按钮
 * 2. 分流：桌面 openTab (带脉冲高亮) / 移动 openMobileFileById
 * 3. 容错：原笔记被删除时捕获异常并微胶囊提示「原笔记已移出，题目在考试库中安全保留」
 * 4. 聚合：错题集来源文档去重聚合 (docId + hpath) 供筛选栏组合过滤
 */

import { openTab, openMobileFileById, type App } from "siyuan";
import { lvNotify, lvLaunchpad } from "@/libs/lv-notice-kit";
import type { Question } from "@/core/types";

export interface TracebackOptions {
  plugin: any;
  blockId: string;
  rootId?: string;
  isMobile?: boolean;
}

export interface WrongDocOption {
  docId: string;
  label: string;
  count: number;
}

const TRACE_OVERLAY_ATTR = "data-lv-exam-trace-overlay";
const PROTECTED_EDITOR_SELECTOR = ".protyle-wysiwyg, .protyle-attr, [contenteditable='true']";

let activeOverlayCleanup: (() => void) | null = null;
let activeOverlay: HTMLElement | null = null;

function isOwnedBodyOverlay(node: Element | null): node is HTMLElement {
  if (!node || typeof document === "undefined" || !document.body) return false;
  if (node.parentElement !== document.body) return false;
  if (node.getAttribute(TRACE_OVERLAY_ATTR) !== "1") return false;
  if (node.closest(PROTECTED_EDITOR_SELECTOR)) return false;
  return true;
}

/**
 * 清除所有残留的原块溯源悬浮高亮框（Zero-Touch 脱离式挂载在 document.body）
 * 严格限定仅清理模块持有的 activeOverlay 及 document.body 直接子元素中的插件自有浮层，
 * 严禁全局 querySelectorAll 触碰编辑器受保护子树。
 */
export function clearTracePulseOverlays(): void {
  if (activeOverlayCleanup) {
    activeOverlayCleanup();
    activeOverlayCleanup = null;
  }
  if (activeOverlay) {
    if (isOwnedBodyOverlay(activeOverlay)) {
      activeOverlay.remove();
    }
    activeOverlay = null;
  }
  if (typeof document !== "undefined" && document.body) {
    for (const el of Array.from(document.body.children)) {
      if (
        el.getAttribute(TRACE_OVERLAY_ATTR) === "1" &&
        !el.closest(PROTECTED_EDITOR_SELECTOR)
      ) {
        el.remove();
      }
    }
  }
}

/**
 * 错题原块高亮脉冲：100% Zero-Touch .protyle-wysiwyg，
 * 仅读取 getBoundingClientRect() 并在 document.body 挂载脱离式悬浮高亮框，
 * 到时、滚动、尺寸变化或销毁时自动移除。
 */
export function highlightTracePulse(blockId: string, durationMs = 2000): void {
  if (typeof document === "undefined" || !blockId) return;

  clearTracePulseOverlays();

  let pollCount = 0;
  let cancelled = false;
  let pollTimer: ReturnType<typeof setTimeout> | null = null;
  let rafId: number | null = null;
  const maxPolls = 20;

  const cancelPendingPoll = () => {
    cancelled = true;
    if (pollTimer !== null) {
      clearTimeout(pollTimer);
      pollTimer = null;
    }
    if (rafId !== null && typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  };

  activeOverlayCleanup = cancelPendingPoll;

  const mountOverlay = (el: HTMLElement) => {
    if (cancelled || !document.body) return;

    const overlay = document.createElement("div");
    overlay.className = "lv-exam-trace-overlay";
    overlay.setAttribute(TRACE_OVERLAY_ATTR, "1");
    overlay.setAttribute("aria-hidden", "true");
    overlay.dataset.traceBlockId = blockId;

    const syncPos = (): boolean => {
      if (!el.isConnected) return false;
      const rect = el.getBoundingClientRect();
      const pad = 4;
      overlay.style.position = "fixed";
      overlay.style.pointerEvents = "none";
      overlay.style.left = `${Math.max(0, rect.left - pad)}px`;
      overlay.style.top = `${Math.max(0, rect.top - pad)}px`;
      overlay.style.width = `${Math.max(0, rect.width + pad * 2)}px`;
      overlay.style.height = `${Math.max(0, rect.height + pad * 2)}px`;
      return true;
    };

    syncPos();
    document.body.appendChild(overlay);
    activeOverlay = overlay;

    const createdAt = Date.now();
    let cleaned = false;
    let expireTimer: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      cancelPendingPoll();
      if (expireTimer !== null) {
        clearTimeout(expireTimer);
        expireTimer = null;
      }
      if (isOwnedBodyOverlay(overlay)) {
        overlay.remove();
      }
      if (activeOverlay === overlay) {
        activeOverlay = null;
      }
      if (typeof window !== "undefined") {
        window.removeEventListener("scroll", onScroll, true);
        window.removeEventListener("wheel", cleanup, true);
        window.removeEventListener("touchmove", cleanup, true);
        window.removeEventListener("resize", cleanup);
        window.removeEventListener("pagehide", cleanup);
      }
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (activeOverlayCleanup === cleanup) {
        activeOverlayCleanup = null;
      }
    };

    const onScroll = () => {
      // scrollIntoView({ behavior: "smooth" }) 初始约 400ms 内同步跟框，之后任何滚动立即移除
      if (Date.now() - createdAt <= 450) {
        if (!syncPos()) cleanup();
      } else {
        cleanup();
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") cleanup();
    };

    activeOverlayCleanup = cleanup;
    expireTimer = setTimeout(cleanup, durationMs);

    if (typeof window !== "undefined") {
      window.addEventListener("scroll", onScroll, { capture: true, passive: true });
      window.addEventListener("wheel", cleanup, { capture: true, passive: true });
      window.addEventListener("touchmove", cleanup, { capture: true, passive: true });
      window.addEventListener("resize", cleanup, { passive: true });
      window.addEventListener("pagehide", cleanup);
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
  };

  const tryApply = () => {
    if (cancelled) return;
    const el = document.querySelector<HTMLElement>(`[data-node-id="${blockId}"]`);
    if (el) {
      try {
        el.scrollIntoView({
          behavior:
            typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches
              ? "auto"
              : "smooth",
          block: "center",
        });
      } catch {
        /* fail-soft */
      }
      mountOverlay(el);
      return;
    }

    pollCount++;
    if (pollCount < maxPolls) {
      pollTimer = setTimeout(tryApply, 100);
    }
  };

  if (typeof requestAnimationFrame === "function") {
    rafId = requestAnimationFrame(tryApply);
  } else {
    pollTimer = setTimeout(tryApply, 50);
  }
}

/**
 * 执行错题到思源笔记原块的穿透定位
 */
export async function tracebackToSourceBlock(options: TracebackOptions): Promise<boolean> {
  const { plugin, blockId } = options;
  if (!blockId) return false;

  // 1. 若内核在线，先行利用 SQL 探测原块是否存在
  if (plugin?.examApp?.kernelOnline && plugin?.examApp?.bridge?.sql) {
    try {
      const rows = await plugin.examApp.bridge.sql(
        `SELECT id, root_id FROM blocks WHERE id = '${blockId.replace(/'/g, "''")}' LIMIT 1`
      );
      if (!rows || rows.length === 0) {
        lvNotify.capsule({
          source: "小驴考试",
          message: "原笔记已移出，题目在考试库中安全保留",
          duration: 3500,
        });
        return false;
      }
    } catch {
      // SQL 失败不阻断，继续尝试原生打开
    }
  }

  const hostApp = plugin?.app;
  const isMobile = options.isMobile ?? Boolean(
    plugin?.isMobile ||
    lvLaunchpad.isMobileFrontend() ||
    (typeof document !== "undefined" && document.getElementById("mobileTopBar"))
  );

  // 2. 移动端穿透执行：先经退出确认收起全屏考试弹窗，再调用 openMobileFileById 露出底层笔记
  if (isMobile) {
    try {
      if (plugin?.closeMobileDialog) {
        const closed = await plugin.closeMobileDialog();
        if (closed === false) return false;
      } else if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("lv-exam:close-mobile-dialog"));
      }
      if (typeof openMobileFileById === "function") {
        openMobileFileById(hostApp as App, blockId);
        return true;
      }
      if (typeof window !== "undefined") {
        window.open(`siyuan://blocks/${blockId}`);
        return true;
      }
    } catch (err) {
      console.warn("[LvExam] mobile traceback error:", err);
      lvNotify.capsule({
        source: "小驴考试",
        message: "原笔记已移出，题目在考试库中安全保留",
        duration: 3500,
      });
      return false;
    }
  }

  // 3. 桌面端穿透执行：openTab({app, doc:{id: blockId}, keepCursor:false})
  try {
    if (typeof openTab === "function") {
      const tab = await openTab({
        app: hostApp as App,
        doc: { id: blockId },
        keepCursor: false,
      });
      if (!tab) {
        lvNotify.capsule({
          source: "小驴考试",
          message: "原笔记已移出，题目在考试库中安全保留",
          duration: 3500,
        });
        return false;
      }
      highlightTracePulse(blockId);
      return true;
    }
  } catch (err) {
    console.warn("[LvExam] desktop traceback error:", err);
    lvNotify.capsule({
      source: "小驴考试",
      message: "原笔记已移出，题目在考试库中安全保留",
      duration: 3500,
    });
    return false;
  }

  // 兜底回退
  if (typeof window !== "undefined") {
    try {
      window.open(`siyuan://blocks/${blockId}`);
      return true;
    } catch {
      lvNotify.capsule({
        source: "小驴考试",
        message: "原笔记已移出，题目在考试库中安全保留",
        duration: 3500,
      });
      return false;
    }
  }
  return false;
}

/**
 * 错题本来源文档聚合选项提取（数据源：错题集内去重 docId + hpath）
 */
export function extractWrongQueueDocOptions<T extends { qid: string }>(
  wrongQueue: T[],
  questionMap: Map<string, Question>,
): WrongDocOption[] {
  const map = new Map<string, WrongDocOption>();
  for (const w of wrongQueue) {
    const q = questionMap.get(w.qid);
    if (!q) continue;
    const docId = q.rootId || (q as any).docId || "";
    if (!docId) continue;
    const label = q.hpath || q.source || `文档 ${docId.slice(0, 8)}`;
    const existing = map.get(docId);
    if (existing) {
      existing.count++;
    } else {
      map.set(docId, { docId, label, count: 1 });
    }
  }
  return Array.from(map.values()).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}
