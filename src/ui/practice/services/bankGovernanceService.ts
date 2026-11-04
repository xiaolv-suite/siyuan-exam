import type { Question } from "@/core/types";
import type { ExamApp } from "@/app";
import { gapsToCsv, type SyllabusNode, type SyllabusMeta } from "@/core/syllabus";
import { errataTemplateCsv, parseErrataCsv, planErrata, type ErrataPlan } from "@/core/errata";
import type { BatchPlan, BatchChange } from "@/core/batchEdit";
import { planKpMerge, planEmptyKpFill } from "@/core/kpGovernance";
import { buildQuestionSheet, buildAnswerSheet, buildAnswerCardSheet } from "@/core/printSheet";
import { parsePaperAnswers, gradePaper, type PaperGradeItem } from "@/core/paperRecall";
import { createQuestionVersionSnapshot } from "@/core/revision";
import {
  bankHealthReport,
  answerDistribution,
  unreviewedStats,
  coverageStats,
  detectOrphans,
  type BankHealthReport,
  type OrphanDiagnosis,
} from "@/core/bankHealth";
import { escapeHtml } from "@/libs/sanitize";
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
  setTimeout(() => URL.revokeObjectURL(a.href), 0);
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
  setTimeout(() => URL.revokeObjectURL(a.href), 0);
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

export interface PaperRecallPreview {
  errors: Array<{ row: number; reason: string }>;
  items: PaperGradeItem[];
  outOfRange: number[];
}

/**
 * 计算纸笔回录的预览结果
 */
export function computePaperRecallPreview(
  text: string,
  filteredQuestions: Question[],
): PaperRecallPreview | null {
  if (!text.trim()) return null;
  const { rows, errors } = parsePaperAnswers(text);
  const { items, outOfRange } = gradePaper(filteredQuestions, rows);
  return { errors, items, outOfRange };
}

/**
 * 应用纸笔回录流水
 */
export function executeApplyPaperRecall(
  app: ExamApp,
  items: PaperGradeItem[],
  t: (k: string) => string,
): { count: number; note: string } {
  const count = recordPaperRecallAttempts(app, items);
  if (!count) {
    return { count: 0, note: t("paper.none") };
  }
  return {
    count,
    note: t("paper.applied").replace("{n}", String(count)),
  };
}

export interface ApplyErrataResult {
  ok: number;
  failed: number;
  undo: { changes: BatchChange[]; bankId: string; at: number };
  note: string;
}

/**
 * 应用勘误计划到题库，生成逆向撤销计划与反馈提示
 */
export async function executeApplyErrata(
  app: ExamApp,
  plan: ErrataPlan,
  activeBankId: string,
  t: (k: string) => string,
): Promise<ApplyErrataResult> {
  const r = await app.applyBatchEdit(plan.changes);
  const undo = { changes: plan.changes, bankId: activeBankId, at: Date.now() };
  const note = t("errata.applied").replace("{ok}", String(r.ok)).replace("{f}", String(r.failed));
  return { ok: r.ok, failed: r.failed, undo, note };
}

export interface ApplyKpPlanResult {
  ok: number;
  failed: number;
  undo: { changes: BatchChange[]; bankId: string; at: number };
  note: string;
}

/**
 * 应用考点治理批量修改，生成可撤销基线与反馈提示
 */
export async function executeApplyKpPlan(
  app: ExamApp,
  plan: BatchPlan,
  activeBankId: string,
  t: (k: string) => string,
): Promise<ApplyKpPlanResult> {
  const r = await app.applyBatchEdit(plan.changes);
  const undo = { changes: plan.changes, bankId: activeBankId, at: Date.now() };
  const note = t("batch.applied").replace("{n}", String(r.ok)).replace("{f}", String(r.failed));
  return { ok: r.ok, failed: r.failed, undo, note };
}

export interface BankHealthMetricsBundle {
  health: BankHealthReport | null;
  answerDist: ReturnType<typeof answerDistribution> | null;
  unreviewed: ReturnType<typeof unreviewedStats> | null;
  coverage: ReturnType<typeof coverageStats> | null;
  orphanDiag: OrphanDiagnosis | null;
}

/**
 * 诊断孤儿题目与材料引用完整性
 */
export function diagnoseQuestionOrphans(
  app: ExamApp | null,
  questions: Question[],
): OrphanDiagnosis | null {
  if (!questions.length) return null;
  const knownMaterialIds = new Set(app?.listMaterials().map((m) => m.id) ?? []);
  const links = new Map<string, string>();
  if (app) {
    for (const q of questions) {
      const ref = app.questionMaterialRef(q.id);
      if (ref?.materialId) links.set(q.id, ref.materialId);
    }
  }
  return detectOrphans(questions, {
    knownMaterialIds,
    questionMaterialLinks: links,
  });
}

/**
 * 计算题库已做考点覆盖概览
 */
export function computeBankCoverageStats(
  app: ExamApp | null,
  questions: Question[],
): ReturnType<typeof coverageStats> | null {
  if (!questions.length || !app) return null;
  const attempted = new Set<string>();
  for (const e of app.attempts.all()) {
    if (e.verdict !== "not_attempted") attempted.add(e.qid);
  }
  return coverageStats(questions, attempted);
}

/**
 * 集中聚合计算题库健康体检指标（重复聚类、答案分布、未审校统计、考点覆盖与孤儿诊断）
 */
export function computeBankHealthMetricsBundle(
  app: ExamApp | null,
  questions: Question[],
  healthOpen: boolean,
): BankHealthMetricsBundle {
  if (!healthOpen || !questions.length) {
    return {
      health: null,
      answerDist: null,
      unreviewed: null,
      coverage: null,
      orphanDiag: null,
    };
  }
  return {
    health: bankHealthReport(questions),
    answerDist: answerDistribution(questions),
    unreviewed: unreviewedStats(questions),
    coverage: computeBankCoverageStats(app, questions),
    orphanDiag: diagnoseQuestionOrphans(app, questions),
  };
}

/**
 * 执行批次回滚（带二次确认与提示）
 */
export async function executeRollbackBatchWithConfirm(options: {
  app: ExamApp;
  activeBankId: string;
  batch: string;
  questions: Question[];
  confirmDialogSync: (opts: { title: string; content: string }) => Promise<boolean>;
  showMessage: MessageReporter;
  offline: boolean;
  t: (k: string) => string;
}): Promise<boolean> {
  const { app, activeBankId, batch, questions, confirmDialogSync, showMessage, offline, t } = options;
  const n = questions.filter((q) => q.batch === batch).length;
  const ok = await confirmDialogSync({
    title: t("import.rollback"),
    content: t("import.rollbackConfirm").replace("{n}", String(n)).replace("{b}", escapeHtml(batch.slice(0, 16))),
  });
  if (!ok) return false;

  try {
    const r = await app.rollbackBatch(activeBankId, batch);
    showMessage(
      t("import.rollbackDone").replace("{d}", String(r.deleted)).replace("{f}", String(r.failed)),
      4600,
      r.failed ? "error" : "info",
    );
    return true;
  } catch (e) {
    showMessage(offline ? t("state.offlineHint") : String(e instanceof Error ? e.message : e), 4600, "error");
    return false;
  }
}

export interface BatchApplyResult {
  ok: number;
  failed: number;
  appliedChanges: BatchChange[];
  undo: { changes: BatchChange[]; bankId: string; at: number } | null;
  note: string;
}

/**
 * 执行批量编辑修改或撤销修改
 */
export async function executeApplyBatchChanges(options: {
  app: ExamApp;
  changes: BatchChange[];
  undo: boolean;
  activeBankId: string;
  t: (k: string) => string;
}): Promise<BatchApplyResult> {
  const { app, changes, undo, activeBankId, t } = options;
  const r = await app.applyBatchEdit(changes);
  const note = undo
    ? t("batch.undone").replace("{n}", String(r.ok)).replace("{f}", String(r.failed))
    : t("batch.applied").replace("{n}", String(r.ok)).replace("{f}", String(r.failed));
  return {
    ok: r.ok,
    failed: r.failed,
    appliedChanges: undo ? [] : changes,
    undo: undo ? null : { changes, bankId: activeBankId, at: Date.now() },
    note,
  };
}

/**
 * 加载最近一次批量修改撤销快照
 */
export async function loadBatchUndoAux(
  app: ExamApp,
): Promise<{ changes: BatchChange[]; bankId: string; at: number } | null> {
  try {
    const v = await app.loadAux<any>("batchedit/last");
    return v && Array.isArray(v.changes) ? v : null;
  } catch {
    return null;
  }
}

/**
 * 持久化保存批量修改撤销快照
 */
export async function saveBatchUndoAux(app: ExamApp, data: any): Promise<void> {
  try {
    await app.saveAux("batchedit/last", data);
  } catch {
    // 容错静默
  }
}

/**
 * 汇总考点覆盖与独立掌握统计字典（kp → { 题数, 已独立掌握, 缺来源 }）
 */
export function computeSyllabusKpStats(
  app: ExamApp | null,
  questions: Question[],
): Record<string, { total: number; learned: number; noSource: number }> {
  if (!app) return {};
  const independentCorrect = new Set(
    app.attempts.all().filter((e) => e.verdict === "correct" && !e.help).map((e) => e.qid),
  );
  const stats: Record<string, { total: number; learned: number; noSource: number }> = {};
  for (const q of questions) {
    const k = (q.kp || "").trim();
    if (!k) continue;
    const s = (stats[k] ??= { total: 0, learned: 0, noSource: 0 });
    s.total++;
    if (independentCorrect.has(q.id)) s.learned++;
    if (!q.source) s.noSource++;
  }
  return stats;
}

/**
 * 读取并规划勘误文件内容
 */
export async function parseErrataFileInput(
  file: File,
  questions: Array<Question & { blockId?: string }>,
): Promise<{ plan: ErrataPlan | null; errors: Array<{ row: number; reason: string }> }> {
  const text = await file.text();
  return planErrataFromText(text, questions);
}



