/**
 * 小驴考试 · 错题深度穿透与原块溯源服务 (Error Notebook Deep Traceback)
 * 1. 定位：错题卡来源行增加「📍 笔记原块上下文」穿透按钮
 * 2. 分流：桌面 openTab (带脉冲高亮) / 移动 openMobileFileById
 * 3. 容错：原笔记被删除时捕获异常并微胶囊提示「原笔记已移出，题目在考试库中安全保留」
 * 4. 聚合：错题集来源文档去重聚合 (docId + hpath) 供筛选栏组合过滤
 */

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

/**
 * 错题原块高亮脉冲：为 DOM 目标块添加临时类名并在 2 秒后清除恢复
 */
export function highlightTracePulse(blockId: string, durationMs = 2000): void {
  if (typeof document === "undefined" || !blockId) return;

  let pollCount = 0;
  const maxPolls = 20;

  const tryApply = () => {
    const el = document.querySelector<HTMLElement>(`[data-node-id="${blockId}"]`);
    if (el) {
      try {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      } catch {
        /* fail-soft */
      }
      el.classList.add("lv-exam-trace-pulse");

      setTimeout(() => {
        el.classList.remove("lv-exam-trace-pulse");
        // 联动契约：动画结束后若无其他类，恢复原类属性，避免污染思源块渲染
        if (!el.getAttribute("class") || el.classList.length === 0) {
          el.removeAttribute("class");
        }
      }, durationMs);
      return;
    }

    pollCount++;
    if (pollCount < maxPolls) {
      setTimeout(tryApply, 100);
    }
  };

  if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(tryApply);
  } else {
    setTimeout(tryApply, 50);
  }
}

/**
 * 执行错题到思源笔记原块的穿透定位
 */
export async function tracebackToSourceBlock(options: TracebackOptions): Promise<boolean> {
  const { plugin, blockId } = options;
  if (!blockId) return false;

  // 1. 若内核在线，先行利用 SQL 探测原块是否存在
  if (plugin?.examApp?.kernelOnline && plugin?.examApp?.deps?.client?.sql) {
    try {
      const rows = await plugin.examApp.deps.client.sql(
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

  // 2. 移动端穿透执行：openMobileFileById 并主动收起全屏考试弹窗，露出底层笔记
  if (isMobile) {
    try {
      const siyuanMod = await import("siyuan");
      if (typeof siyuanMod.openMobileFileById === "function") {
        siyuanMod.openMobileFileById(hostApp, blockId);
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("lv-exam:close-mobile-dialog"));
        }
        return true;
      }
      if (typeof window !== "undefined") {
        window.open(`siyuan://blocks/${blockId}`);
        window.dispatchEvent(new CustomEvent("lv-exam:close-mobile-dialog"));
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
    const siyuanMod = await import("siyuan");
    if (typeof siyuanMod.openTab === "function") {
      const tab = await siyuanMod.openTab({
        app: hostApp,
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
