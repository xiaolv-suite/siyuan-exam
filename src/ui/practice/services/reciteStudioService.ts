import type { Question } from "@/core/types";
import type { ExamApp } from "@/app";
import { ratingAttemptKey, type RatingOutcomeView, type RatingGuard } from "@/core/ratingOutcome";
import type { MessageReporter } from "./printPaperService";

export const RECITE_ACTIVE_KEY = "recite/active";

export interface RecitePersistedSnapshot {
  v: 1;
  bankId: string;
  qids: string[];
  cursor: number;
  revealed: boolean;
  done: boolean;
  hint: number;
  ratings: number[];
  sessionId: string;
  updatedAt: number;
}

/**
 * 组装艾宾浩斯背题会话题目队列（优先未毕业错题，排除争议题与已毕业题，控制容量在 5–50）
 */
export function assembleReciteQueue(
  app: ExamApp,
  allQuestions: Question[],
  groupSize = 15,
): Question[] {
  if (!allQuestions.length) return [];
  const size = Math.max(5, Math.min(50, groupSize));
  if (typeof app.recitePool === "function") {
    const candidate = app.recitePool(allQuestions);
    if (candidate.length === 0) return [];
    const primary = app.quickDrill(candidate, size);
    if (primary.length >= size || primary.length >= allQuestions.length) return primary;
    const pickedIds = new Set(primary.map((q) => q.id));
    const restPool = app.recitePool(allQuestions.filter((q) => !pickedIds.has(q.id)));
    const supplement = app.quickDrill(restPool, size - primary.length);
    return [...primary, ...supplement];
  }
  const wrongQs = app.wrongDrill(allQuestions);
  const pool = wrongQs.length > 0 ? wrongQs : allQuestions;
  if (!pool.length) return [];
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
  timeMs?: number;
}): Promise<{ outcome: RatingOutcomeView; attemptKey: string } | null> {
  const { app, bankName, q, rating, sessionId, guard, timeMs } = options;
  const attemptKey = ratingAttemptKey(sessionId, q.id, rating);
  if (!guard.tryAcquire(attemptKey)) return null;

  try {
    const elapsed = Math.max(0, Math.round(timeMs ?? 0));
    const outcome = await app.reciteAnswer(bankName, q, rating, sessionId, elapsed);
    guard.settle(attemptKey, outcome.terminal);
    return { outcome, attemptKey };
  } catch (e) {
    guard.settle(attemptKey, false);
    throw e;
  }
}

export async function saveReciteSnapshot(
  app: ExamApp | null,
  bankId: string,
  state: ReciteSessionState,
): Promise<void> {
  if (!app || !bankId || !state.queue.length || state.done) return;
  const snap: RecitePersistedSnapshot = {
    v: 1,
    bankId,
    qids: state.queue.map((q) => q.id),
    cursor: state.cursor,
    revealed: state.revealed,
    done: state.done,
    hint: state.hint,
    ratings: [...state.ratings],
    sessionId: state.sessionId,
    updatedAt: Date.now(),
  };
  await app.saveAux(RECITE_ACTIVE_KEY, snap);
}

export async function clearReciteSnapshot(app: ExamApp | null): Promise<void> {
  if (!app) return;
  await app.saveAux(RECITE_ACTIVE_KEY, null);
}

export async function loadReciteSnapshot(
  app: ExamApp | null,
  bankId: string,
  allQuestions: Question[],
): Promise<ReciteSessionState | null> {
  if (!app || !bankId || !allQuestions.length) return null;
  const snap = await app.loadAux<RecitePersistedSnapshot | null>(RECITE_ACTIVE_KEY);
  if (!snap || snap.bankId !== bankId || snap.done || !Array.isArray(snap.qids) || !snap.qids.length) {
    return null;
  }
  const byId = new Map(allQuestions.map((q) => [q.id, q]));
  const queue = snap.qids.map((id) => byId.get(id)).filter((q): q is Question => Boolean(q));
  if (!queue.length) return null;
  const cursor = Math.min(Math.max(0, snap.cursor ?? 0), queue.length - 1);
  return {
    queue,
    cursor,
    revealed: Boolean(snap.revealed),
    done: false,
    hint: snap.hint ?? 0,
    ratings: Array.isArray(snap.ratings) ? snap.ratings.slice(0, cursor) : [],
    sessionId: snap.sessionId || `s-recite-${Date.now().toString(36)}`,
  };
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
  showMessage?: MessageReporter,
): Promise<{ added: number; skipped: number }> {
  if (!forgotQuestions.length) return { added: 0, skipped: 0 };
  const items = forgotQuestions.map((q) => ({
    kind: "redo" as const,
    qid: q.id,
    sessionId,
    detail: `${t("action.kind.redo")}：${(q.kp ?? q.stem ?? q.id).slice(0, 40)}`,
  }));
  try {
    const r = await app.addActions(items);
    if (showMessage) {
      showMessage(`已成功添加 ${r.added} 条背诵重练待办（跳过重复 ${r.skipped} 条）`, 3200, "info");
    }
    return r;
  } catch (e) {
    if (showMessage) {
      showMessage(String(e instanceof Error ? e.message : e), 4200, "error");
    }
    return { added: 0, skipped: 0 };
  }
}

export interface ReciteSessionState {
  queue: Question[];
  cursor: number;
  revealed: boolean;
  done: boolean;
  hint: number;
  ratings: number[];
  sessionId: string;
}

/**
 * 初始化艾宾浩斯背题会话状态
 */
export function initReciteSession(
  app: ExamApp,
  questions: Question[],
  groupSize = 15,
): ReciteSessionState | null {
  const queue = assembleReciteQueue(app, questions, groupSize);
  if (!queue.length) return null;
  return {
    queue,
    cursor: 0,
    revealed: false,
    done: false,
    hint: 0,
    ratings: [],
    sessionId: `s-recite-${Date.now().toString(36)}`,
  };
}

export interface ReciteAdvanceResult {
  nextCursor: number;
  revealed: boolean;
  done: boolean;
  hint: number;
  ratings: number[];
  nextQuestion: Question | null;
}

/**
 * 推进背题进度（评价推进后游标+1或结束会话）
 */
export function advanceReciteState(
  cursor: number,
  queueLength: number,
  ratings: number[],
  rating: number,
  queue: Question[],
): ReciteAdvanceResult {
  const newRatings = [...ratings, rating];
  if (cursor < queueLength - 1) {
    const nextCursor = cursor + 1;
    return {
      nextCursor,
      revealed: false,
      done: false,
      hint: 0,
      ratings: newRatings,
      nextQuestion: queue[nextCursor] ?? null,
    };
  }
  return {
    nextCursor: cursor,
    revealed: false,
    done: true,
    hint: 0,
    ratings: newRatings,
    nextQuestion: null,
  };
}

/**
 * 获取背题朗读文本与语音参数
 */
export function getReciteTtsPayload(
  q: Question | undefined,
  mode: "stem" | "answer",
  slowRate = false,
): { text: string; options: { lang?: string; rate: number } } | null {
  if (!q) return null;
  const text = mode === "stem" ? q.stem : String(q.answer ?? "");
  if (!text || !text.trim()) return null;
  return {
    text,
    options: {
      lang: q.studyMeta?.lang,
      rate: slowRate ? 0.85 : 1,
    },
  };
}

/**
 * 提取遗忘项重组重练会话状态
 */
export function prepareRetryForgotState(
  queue: Question[],
  ratings: number[],
): ReciteSessionState | null {
  const forgot = extractForgotReciteQuestions(queue, ratings);
  if (!forgot.length) return null;
  return {
    queue: forgot,
    cursor: 0,
    revealed: false,
    done: false,
    hint: 0,
    ratings: [],
    sessionId: `s-recite-${Date.now().toString(36)}`,
  };
}

