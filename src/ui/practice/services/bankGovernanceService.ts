import type { Question } from "@/core/types";
import type { ExamApp } from "@/app";
import { gapsToCsv, type SyllabusNode, type SyllabusMeta } from "@/core/syllabus";
import { errataTemplateCsv, parseErrataCsv, planErrata, type ErrataPlan } from "@/core/errata";
import type { BatchPlan } from "@/core/batchEdit";
import { planKpMerge, planEmptyKpFill } from "@/core/kpGovernance";
import { buildQuestionSheet, buildAnswerSheet, buildAnswerCardSheet } from "@/core/printSheet";
import type { PaperGradeItem } from "@/core/paperRecall";
import { createQuestionVersionSnapshot } from "@/core/revision";
import type { MessageReporter } from "./printPaperService";

/**
 * 递归计算大纲节点总数
 */
export function countSyllabusNodes(nodes: import("@/core/syllabus").SyllabusNode[]): number {
  return nodes.reduce((s, n) => s + 1 + countSyllabusNodes(n.children), 0);
}

/**
 * 导出考纲缺口清单 CSV
 */
export function exportSyllabusGapsCsv(
  roots: import("@/core/syllabus").SyllabusNode[],
  kpStats: Record<string, { total: number; learned: number; noSource: number }>,
): void {
  if (!roots.length) return;
  const csv = "\uFEFF" + gapsToCsv(roots, kpStats);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `考纲缺口清单 ${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

/**
 * 导出题库勘误模板 CSV
 */
export function exportErrataTemplateCsv(questions: Question[], bankName: string): void {
  const csv = "\uFEFF" + errataTemplateCsv(questions);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `勘误模板 ${bankName || "题库"} ${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

/**
 * 打印题册/答案册/答题卡窗口助手（带自动调用 window.print 挂钩）
 */
const LT = "\u003c";
const PRINT_HOOK = `${LT}script>window.onload = function () { window.print(); }${LT}/script>`;
const BODY_CLOSE = `${LT}/body>`;

export function openPrintSheetWindow(html: string, showMessage: MessageReporter, blockedMsg = "浏览器弹窗被拦截"): void {
  const w = window.open("", "_blank");
  if (!w) {
    showMessage(blockedMsg, 3600, "error");
    return;
  }
  w.document.open();
  w.document.write(html.replace(/<\/body>/, PRINT_HOOK + BODY_CLOSE));
  w.document.close();
}

/**
 * 打印当前筛选全集的题册
 */
export function printFilteredQuestionSheet(bankName: string, questions: Question[], showMessage: MessageReporter): void {
  if (!questions.length) {
    showMessage("当前筛选范围无题目", 2200, "info");
    return;
  }
  openPrintSheetWindow(buildQuestionSheet(`${bankName} · 试题册`, questions), showMessage);
}

/**
 * 打印当前筛选全集的答案册
 */
export function printFilteredAnswerSheet(bankName: string, questions: Question[], showMessage: MessageReporter): void {
  if (!questions.length) {
    showMessage("当前筛选范围无题目", 2200, "info");
    return;
  }
  openPrintSheetWindow(buildAnswerSheet(`${bankName} · 答案册`, questions), showMessage);
}

/**
 * 打印当前筛选全集的标准答题卡
 */
export function printFilteredAnswerCard(bankName: string, questions: Question[], showMessage: MessageReporter): void {
  if (!questions.length) {
    showMessage("当前筛选范围无题目", 2200, "info");
    return;
  }
  openPrintSheetWindow(buildAnswerCardSheet(`${bankName} · 答题卡`, questions), showMessage);
}

/**
 * 执行纸笔答卷作答回录判分与流水入库
 */
export function recordPaperRecallAttempts(
  app: ExamApp,
  items: PaperGradeItem[],
): number {
  const graded = items.filter((i) => i.verdict !== "not_attempted");
  if (!graded.length) return 0;
  const sessionId = `s-paper-${Date.now().toString(36)}`;
  for (const it of graded) {
    app.recordAttempt({
      qid: it.q.id,
      kind: "practice",
      mode: "paper",
      verdict: it.verdict,
      myAnswer: it.given,
      sessionId,
      queue: "normal",
      qVersion: createQuestionVersionSnapshot(it.q),
    });
  }
  return graded.length;
}

/**
 * 考纲文本语法解析预览
 */
export function previewSyllabusText(
  app: ExamApp,
  text: string,
  t: (key: string) => string,
): { roots: SyllabusNode[] | null; error: string } {
  try {
    const roots = app.previewSyllabus(text);
    if (!roots.length) {
      return { roots: null, error: t("syl.empty") };
    }
    return { roots, error: "" };
  } catch (e) {
    return { roots: null, error: String(e instanceof Error ? e.message : e) };
  }
}

/**
 * 导入并保存考纲大纲树
 */
export async function importSyllabusToApp(
  app: ExamApp,
  roots: SyllabusNode[],
  meta: SyllabusMeta,
  t: (key: string) => string,
): Promise<{ note: string; error: string }> {
  try {
    await app.setSyllabusDoc(meta, roots);
    const count = countSyllabusNodes(roots);
    return {
      note: t("syl.imported").replace("{n}", String(count)),
      error: "",
    };
  } catch (e) {
    return {
      note: "",
      error: String(e instanceof Error ? e.message : e),
    };
  }
}

/**
 * 解析并生成题库勘误变更计划
 */
export function planErrataFromText(
  text: string,
  questions: (Question & { blockId?: string })[],
): { plan: ErrataPlan | null; errors: { row: number; reason: string }[] } {
  try {
    const { rows, errors } = parseErrataCsv(text);
    const plan = rows.length ? planErrata(rows, questions) : null;
    return { plan, errors };
  } catch (err) {
    return {
      plan: null,
      errors: [{ row: 0, reason: String(err instanceof Error ? err.message : err) }],
    };
  }
}

/**
 * 预览考点合并计划
 */
export function previewKpMergePlan(
  questions: Question[],
  from: string,
  to: string,
  t: (key: string) => string,
): { plan: BatchPlan | null; note: string } {
  const f = from.trim();
  const tgt = to.trim();
  if (!f || !tgt) return { plan: null, note: t("kp.needBoth") };
  if (f === tgt) return { plan: null, note: t("kp.sameValue") };
  return { plan: planKpMerge(questions, f, tgt).plan, note: "" };
}

/**
 * 预览空考点回填计划
 */
export function previewKpFillPlan(
  questions: Question[],
  fillKp: string,
  t: (key: string) => string,
): { plan: BatchPlan | null; note: string } {
  const kp = fillKp.trim();
  if (!kp) return { plan: null, note: t("kp.needBoth") };
  return { plan: planEmptyKpFill(questions, kp).plan, note: "" };
}

/**
 * 执行重复簇题目合并到目标主题目并迁移作答流水（43-07）
 */
export async function executeClusterMergeToTarget(
  app: ExamApp,
  targetQ: Question & { blockId: string },
  clusterIds: string[],
  questionMap: Map<string, Question>,
  confirmFn: (opts: { title: string; content: string }) => Promise<boolean>,
  t: (k: string) => string,
): Promise<{ success: boolean; othersCount: number; mergedAttemptsCount: number }> {
  if (!app) return { success: false, othersCount: 0, mergedAttemptsCount: 0 };
  const others = clusterIds
    .filter((id) => id !== targetQ.id)
    .map((id) => questionMap.get(id))
    .filter((q): q is Question & { blockId: string; rootId: string } => !!q && !!q.blockId);
  if (!others.length) return { success: false, othersCount: 0, mergedAttemptsCount: 0 };

  const confirmed = await confirmFn({
    title: t("health.mergeConfirmTitle"),
    content: `${t("health.mergeConfirmBody")}\n\n保留题目：[${targetQ.id}] ${targetQ.stem.slice(0, 40)}\n合并并清理：${others.length} 道重复题。`,
  });
  if (!confirmed) return { success: false, othersCount: 0, mergedAttemptsCount: 0 };

  let totalMergedAttempts = 0;
  for (const other of others) {
    const res = await app.mergeDuplicateQuestions(targetQ, other);
    totalMergedAttempts += res.mergedEventsCount;
  }

  return {
    success: true,
    othersCount: others.length,
    mergedAttemptsCount: totalMergedAttempts,
  };
}


