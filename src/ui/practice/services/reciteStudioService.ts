import type { Question } from "@/core/types";
import type { ExamApp } from "@/app";
import { ratingAttemptKey, type RatingOutcomeView, type RatingGuard } from "@/core/ratingOutcome";
import type { MessageReporter } from "./printPaperService";

/**
 * 组装艾宾浩斯背题会话题目队列（优先错题，控制容量在 5–50）
 */
export function assembleReciteQueue(
  app: ExamApp,
  allQuestions: Question[],
  groupSize = 15,
): Question[] {
  const wrongQs = app.wrongDrill(allQuestions);
  const pool = wrongQs.length > 0 ? wrongQs : allQuestions;
  if (!pool.length) return [];
  const size = Math.max(5, Math.min(50, groupSize));
  return app.quickDrill(pool, size);
}

/**
 * 执行背题自评（Again=1, Hard=2, Good=3, Easy=4）与 Riff 算法写回
 */
export async function executeReciteRating(options: {
  app: ExamApp;
  bankName: string;
  q: Question & { blockId?: string };
  rating: 1 | 2 | 3 | 4;
  sessionId: string;
  guard: RatingGuard;
}): Promise<{ outcome: RatingOutcomeView; attemptKey: string } | null> {
  const { app, bankName, q, rating, sessionId, guard } = options;
  const attemptKey = ratingAttemptKey(sessionId, q.id, rating);
  if (!guard.tryAcquire(attemptKey)) return null;

  try {
    const outcome = await app.reciteAnswer(bankName, q, rating, sessionId, 0);
    guard.settle(attemptKey, outcome.terminal);
    return { outcome, attemptKey };
  } catch (e) {
    guard.settle(attemptKey, false);
    throw e;
  }
}

/**
 * 提取当前背题会话中标记为遗忘（Again/1）的题目列表
 */
export function extractForgotReciteQuestions(
  queue: Question[],
  ratings: number[],
): Question[] {
  const forgotIndices = ratings.map((r, i) => (r === 1 ? i : -1)).filter((i) => i >= 0);
  return forgotIndices.map((i) => queue[i]).filter(Boolean);
}

/**
 * 将背题遗忘项一键推送到小驴闪卡卡包
 */
export async function pushForgotReciteToCards(
  app: ExamApp,
  bankId: string,
  bankName: string,
  forgotQuestions: Question[],
  showMessage: MessageReporter,
  t: (k: string) => string,
): Promise<number> {
  if (!bankId || !forgotQuestions.length) return 0;
  try {
    const n = await app.convertToCards(bankId, bankName, forgotQuestions);
    showMessage(n ? `${t("memory.toCardDone")} (${n})` : t("memory.toCardMissing"), 3200, n ? "info" : "error");
    return n;
  } catch (e) {
    showMessage(String(e instanceof Error ? e.message : e), 4200, "error");
    return 0;
  }
}

/**
 * 将背题遗忘项一键推送到行动清单
 */
export async function pushForgotReciteToActions(
  app: ExamApp,
  forgotQuestions: Question[],
  sessionId: string,
  t: (k: string) => string,
): Promise<{ added: number; skipped: number }> {
  if (!forgotQuestions.length) return { added: 0, skipped: 0 };
  const items = forgotQuestions.map((q) => ({
    kind: "redo" as const,
    qid: q.id,
    sessionId,
    detail: `${t("action.kind.redo")}：${(q.kp ?? q.stem ?? q.id).slice(0, 40)}`,
  }));
  return app.addActions(items);
}
