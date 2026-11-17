// ============================================================
// 思源文档导入、划重点挖空出题与断点恢复服务（docImportClozeService.ts）
// 承接思源多文档提取、划重点/高亮挖空、导入断点检查与丢弃
// 纯逻辑解耦，不绑定 Svelte 渲染态
// ============================================================

import type { ImportReport, ImportCheckpoint } from "@/importer/pipeline";
import { parseClozeText, clozeItemsToQuestions, type ParsedClozeItem } from "@/core/cloze";
import { newBatchId } from "@/core/ids";

export interface SiyuanDocCandidate {
  id: string;
  title: string;
  hpath: string;
  box: string;
}

export interface DocExtractResult {
  report: ImportReport | null;
  message: string;
  isError: boolean;
}

/** 检索思源文档候选列表（支持空搜索词自动加载全部最近文档） */
export async function searchSiyuanDocCandidates(
  app: any,
  query: string,
): Promise<SiyuanDocCandidate[]> {
  if (!app || typeof app.searchSiyuanDocs !== "function" || !query.trim()) return [];
  return (await app.searchSiyuanDocs(query.trim())) as SiyuanDocCandidate[];
}

/** 从选中的单个思源文档提取题目 */
export async function extractFromSingleSiyuanDoc(
  app: any,
  docId: string,
  title: string,
  options?: any,
): Promise<DocExtractResult> {
  if (!app || !docId) {
    return { report: null, message: "参数错误", isError: true };
  }
  const report = (await app.importFromSiyuanDoc(docId, options)) as ImportReport;
  if (!report.ok.length) {
    const rawReason = report.errors[0]?.reason || "";
    const reason = /缺少 ANSWER 行|Aiken/i.test(rawReason)
      ? `《${title}》内未检索到题目内容（支持选择题、表格题表、==高亮挖空== 或 **术语** 定义）`
      : (rawReason || "文档内未检索到题目格式内容");
    return { report: null, message: reason, isError: false };
  }
  return {
    report,
    message: `从《${title}》成功提取 ${report.ok.length} 道试题，请在下方预览并确认入库！`,
    isError: false,
  };
}

/** 批量从多个思源文档提取题目 */
export async function extractFromBatchSiyuanDocs(
  app: any,
  docIds: string[],
  options?: any,
): Promise<DocExtractResult> {
  if (!app || !docIds.length) {
    return { report: null, message: "未选择任何文档", isError: true };
  }
  const report = (await app.importFromSiyuanDocBatch(docIds, options)) as ImportReport;
  if (!report.ok.length) {
    const rawReason = report.errors[0]?.reason || "";
    const reason = /缺少 ANSWER 行|Aiken/i.test(rawReason)
      ? "所选文档内未检索到题目内容（支持选择题、表格题表、==高亮挖空== 或 **术语** 定义）"
      : (rawReason || "所选文档内未检索到题目格式内容");
    return { report: null, message: reason, isError: false };
  }
  return {
    report,
    message: `从已选 ${docIds.length} 篇文档中成功批量提取 ${report.ok.length} 道试题，请在下方预览并确认入库！`,
    isError: false,
  };
}

/** 解析正文划重点挖空 */
export function parseClozeItems(
  text: string,
  modes: ("highlight" | "curly" | "bracket")[],
  t: (k: string) => string,
): { items: ParsedClozeItem[]; emptyNotice?: string } {
  if (!text.trim()) return { items: [] };
  const items = parseClozeText(text, { modes });
  if (!items.length) {
    return { items: [], emptyNotice: t("cloze.empty") };
  }
  return { items };
}

/** 组装挖空题目为导入报告包 */
export function assembleClozeImportReport(items: ParsedClozeItem[]): {
  report: ImportReport;
  count: number;
} {
  const qs = clozeItemsToQuestions(items, { kp: "笔记挖空", source: "正文划重点" });
  const report: ImportReport = {
    ok: qs,
    errors: [],
    duplicates: 0,
    batch: newBatchId() + "-cloze",
  };
  return { report, count: qs.length };
}

/** 检查题库未完成导入任务的断点快照 */
export async function checkImportCheckpointAux(
  app: any,
  activeBankId: string,
): Promise<ImportCheckpoint | null> {
  if (!app || !activeBankId) return null;
  try {
    return (await app.loadImportCheckpoint(activeBankId)) as ImportCheckpoint;
  } catch {
    return null;
  }
}

/** 丢弃导入断点快照 */
export async function discardImportCheckpointAux(app: any): Promise<void> {
  if (!app) return;
  try {
    await app.clearImportCheckpoint();
  } catch {
    // 容错静默
  }
}

/** 将检查点快照还原为恢复导入报告与已确认ID */
export function buildResumeCheckpointReport(cp: ImportCheckpoint): {
  report: ImportReport;
  confirmedIds: string[];
} {
  return {
    report: {
      ok: cp.pendingQuestions,
      errors: [],
      duplicates: 0,
      batch: cp.batch,
    },
    confirmedIds: [...cp.confirmedIds],
  };
}

export type ClozeModeKey = "highlight" | "curly" | "bracket";

/**
 * 切换挖空语法支持模式（至少保留一种模式）
 */
export function toggleClozeSupportMode(
  currentModes: ClozeModeKey[],
  mode: ClozeModeKey,
): ClozeModeKey[] {
  if (currentModes.includes(mode)) {
    return currentModes.length > 1 ? currentModes.filter((m) => m !== mode) : currentModes;
  }
  return [...currentModes, mode];
}

/**
 * 切换全选/清空思源文档候选项字典
 */
export function toggleSelectAllDocCandidates(
  candidates: Array<{ id: string }>,
  currentSelected: Record<string, boolean>,
): Record<string, boolean> {
  const count = Object.keys(currentSelected).length;
  if (count === candidates.length && candidates.length > 0) {
    return {};
  }
  const next: Record<string, boolean> = {};
  for (const doc of candidates) next[doc.id] = true;
  return next;
}


