import type { Question } from "@/core/types";
import type { ExamApp } from "@/app";
import { gapsToCsv } from "@/core/syllabus";
import { errataTemplateCsv } from "@/core/errata";
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
