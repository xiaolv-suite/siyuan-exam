// ============================================================
// 试题版本历史与回滚服务 (questionRevisionService.ts)
// 承接试题修订记录查询、版本快照加载与回滚恢复流
// 纯逻辑解耦，不绑定 Svelte 渲染态
// ============================================================

import type { ExamApp } from "@/app";
import type { Question } from "@/core/types";
import { questionDraftFromRevision, type QuestionRevision } from "@/core/revision";
import { escapeHtml } from "@/libs/sanitize";
import type { MessageReporter } from "./printPaperService";

export interface RevisionRestoreResult {
  next?: Partial<Question>;
  reloaded?: QuestionRevision[];
  cancelled?: boolean;
}

/**
 * 加载单题版本修订历史列表
 */
export async function executeLoadQuestionRevisions(
  app: ExamApp,
  qid: string,
): Promise<QuestionRevision[]> {
  return await app.questionRevisions(qid);
}

/**
 * 执行历史版本回滚确认与写入
 */
export async function executeRestoreQuestionRevision(options: {
  app: ExamApp;
  q: Question & { blockId: string };
  rev: QuestionRevision;
  t: (k: string) => string;
  showMessage: MessageReporter;
}): Promise<RevisionRestoreResult> {
  const { app, q, rev, t, showMessage } = options;
  const { confirmDialogSync } = await import("@/libs/dialog");
  const confirmContent = rev.summary
    ? t("rev.restoreConfirmFull").replace("{summary}", rev.summary)
    : t("rev.restoreConfirm").replace("{a}", escapeHtml(rev.answer));
  const ok = await confirmDialogSync({
    title: t("rev.restoreTitle"),
    content: confirmContent,
  });
  if (!ok) return { cancelled: true };

  const next = await app.updateQuestionContent(q, questionDraftFromRevision(q, rev));
  showMessage(t("rev.restored"), 2400, "info");

  let reloaded: QuestionRevision[] | undefined;
  try {
    reloaded = await app.questionRevisions(q.id);
  } catch {
    // 写入成功后若重读失败，不阻断主流程
  }

  return { next, reloaded };
}
