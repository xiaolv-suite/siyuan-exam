import type { Question, QuestionLifecycleStatus } from "@/core/types";
import type { DisputeReason } from "@/core/dispute";
import type { ExamApp } from "@/app";
import { LIFECYCLE_LABELS } from "@/core/revision";
import { exportItemAnalysisCsv, type ItemAnalysisReport } from "@/core/itemAnalysis";
import { downloadBlobFile } from "./bankExportService";
import type { MessageReporter } from "./printPaperService";

/**
 * 变更题目生命周期状态（draft <-> review <-> published <-> deprecated）
 */
export async function changeQuestionLifecycle(
  app: ExamApp,
  q: Question & { blockId: string },
  nextStatus: QuestionLifecycleStatus,
  showMessage: MessageReporter,
  t: (k: string) => string,
): Promise<Partial<Question>> {
  const next = await app.updateQuestionLifecycle(q, nextStatus);
  showMessage(t("lifecycle.changed").replace("{status}", LIFECYCLE_LABELS[nextStatus] ?? nextStatus), 2800, "info");
  return next;
}

/**
 * 标记题目争议状态（多解/缺条件/答案存疑/资料过期）
 */
export async function flagQuestionDispute(
  app: ExamApp,
  q: Question & { blockId: string },
  reason: DisputeReason,
  note: string,
  showMessage: MessageReporter,
  t: (k: string) => string,
): Promise<Partial<Question>> {
  const updated = await app.flagQuestionDispute(q, reason, note.trim());
  showMessage(t("dispute.flagSuccess"), 3200, "info");
  return updated;
}

/**
 * 登记题目争议处置结论单
 */
export async function resolveQuestionDispute(
  app: ExamApp,
  q: Question & { blockId: string },
  resolution: string,
  showMessage: MessageReporter,
  t: (k: string) => string,
): Promise<Partial<Question>> {
  const updated = await app.resolveQuestionDispute(q, resolution.trim());
  showMessage(t("dispute.resolveSuccess"), 3200, "info");
  return updated;
}

/**
 * 清除题目争议标记
 */
export async function clearQuestionDispute(
  app: ExamApp,
  q: Question & { blockId: string },
  showMessage: MessageReporter,
  t: (k: string) => string,
): Promise<Partial<Question>> {
  const updated = await app.clearQuestionDispute(q);
  showMessage(t("dispute.clearSuccess"), 2800, "info");
  return updated;
}

/**
 * 导出单题 CTT 选项分析 CSV
 */
export function exportItemAnalysisReportCsv(report: ItemAnalysisReport): void {
  const csv = exportItemAnalysisCsv(report);
  downloadBlobFile(csv, `题目分析-${report.qid}-${new Date().toISOString().slice(0, 10)}.csv`, "text/csv;charset=utf-8");
}
