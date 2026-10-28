// ============================================================
// 试题入库提交与更新式重导执行服务（importExecutionService.ts）
// 承接底层批量入库、读回核验、断点重试池沉淀与答案差量更新
// 纯逻辑解耦，不绑定 Svelte 渲染态
// ============================================================

import type { ImportReport } from "@/importer/pipeline";
import type { Question } from "@/core/types";

export interface ImportCommitResultView {
  written: number;
  confirmed: number;
  missing: number;
  verified: boolean;
  cancelled: boolean;
  unprocessed: number;
  pendingIndex: number;
}

export interface CommitExecutionResult {
  importResult: ImportCommitResultView;
  retryPool: Question[];
  retryBatch: string;
  retryBankId: string;
  cancelled: boolean;
}

export interface AnswerUpdatesExecutionResult {
  updateResult: {
    ok: number;
    failed: number;
    missing: number;
    unprocessed?: number;
  };
  hasIssue: boolean;
  message: string;
  messageType: "info" | "error";
}

/** 执行主入库管道写入与读回核验 */
export async function executeCommitImport(
  app: any,
  targetBankId: string,
  report: ImportReport,
  trialConfirmedCount = 0,
  options?: {
    onProgress?: (done: number, total: number) => void;
    isCancelled?: () => boolean;
  },
): Promise<CommitExecutionResult> {
  const r = await app.commitImport(targetBankId, report, options);
  const isCancelled = r.cancelled === true || (options?.isCancelled ? options.isCancelled() : false);

  const importResult: ImportCommitResultView = {
    written: r.written + trialConfirmedCount,
    confirmed: r.readback.confirmed.length + trialConfirmedCount,
    missing: r.readback.missing.length,
    verified: r.readback.verified || !report.ok.length,
    cancelled: isCancelled,
    unprocessed: r.unprocessed?.length ?? 0,
    pendingIndex: r.pendingIndex?.length ?? 0,
  };

  const retryPool = report.ok.filter((q) => r.readback.missing.includes(q.id));

  return {
    importResult,
    retryPool,
    retryBatch: report.batch,
    retryBankId: targetBankId,
    cancelled: isCancelled,
  };
}

/** 执行差量答案与解析更新（38-03 更新式重导） */
export async function executeAnswerUpdates(
  app: any,
  targetBankId: string,
  updates: Array<{ row: number; q: Question }>,
  targetQuestions: Question[],
  t: (k: string) => string,
  options?: {
    onProgress?: (done: number, total: number) => void;
    isCancelled?: () => boolean;
  },
): Promise<AnswerUpdatesExecutionResult> {
  const updatedQuestions = (await app.listQuestions(targetBankId)) as Question[];
  const r2 = await app.applyAnswerUpdates(
    updates,
    [...targetQuestions, ...updatedQuestions],
    options,
  );

  const hasIssue = Boolean(r2.failed || r2.missing || r2.unprocessed);
  const message = t("import.updatesDone")
    .replace("{ok}", String(r2.ok))
    .replace("{f}", String(r2.failed))
    .replace("{m}", String(r2.missing));

  return {
    updateResult: r2,
    hasIssue,
    message,
    messageType: hasIssue ? "error" : "info",
  };
}

/** 构造未读回试题的重试提交报告 */
export function buildRetryMissingReport(
  retryPool: Question[],
  retryBatch: string,
  updates?: any[],
): ImportReport {
  return {
    ok: retryPool,
    errors: [],
    duplicates: 0,
    batch: retryBatch,
    updates,
  };
}

