import type { Question } from "@/core/types";
import type { PracticeSession, PracticeSubmitResult } from "@/core/session";
import type { ExamApp } from "@/app";
import { queueKindOf } from "@/core/queueIdentity";
import { createQuestionVersionSnapshot } from "@/core/revision";
import { trailChanged, type AnswerTrail } from "@/core/answerTrail";
import { abandonedExposureInputs, helpFromExposure } from "@/core/exposure";
import { emitExamEvent, computeWeakKnowledgePoints } from "@/core/bus";

export interface RecordAttemptOptions {
  app: ExamApp;
  session: PracticeSession;
  q: Question;
  submitResult: PracticeSubmitResult;
  timeMs: number;
  confidenceSel?: "sure" | "fuzzy" | "guess" | "";
  helpMode?: string;
  isRecalled?: boolean;
  exposures?: string[];
  trail?: AnswerTrail;
}

/**
 * 记录单次练习作答流水事件并写入 App
 */
export function recordSessionAttempt(options: RecordAttemptOptions): void {
  const { app, session, q, submitResult, timeMs, confidenceSel, helpMode, isRecalled, exposures, trail } = options;
  const g = submitResult.grade;

  app.recordAttempt({
    qid: q.id,
    kind: "practice",
    mode: session.state.mode,
    verdict: g.verdict,
    myAnswer: g.myAnswer,
    sessionId: session.id,
    queue: queueKindOf(session.state.mode),
    timeMs,
    qVersion: createQuestionVersionSnapshot(q),
    delayedReview: submitResult.isDelayedReview || undefined,
    confidence: confidenceSel || undefined,
    help: helpMode as any,
    recall: isRecalled || undefined,
    exposure: exposures && exposures.length ? [...exposures] : undefined,
    ...(trail && trailChanged(trail) ? { firstAnswer: trail.first, edits: trail.edits } : {}),
  });

  if (g.verdict === "wrong") {
    void app.triggerWrongQuestionAutomation(q);
  }
}

export interface SessionDoneSummary {
  total: number;
  correct: number;
  wrong: number;
  initialTotal?: number;
  initialCorrect?: number;
  delayedTotal?: number;
  delayedRecovered?: number;
  totalTimeS: number;
  avgTimeS: number;
  weakKnowledgePoints: string[];
}

/**
 * 计算练习会话完成时的统计结算与弱项分析
 */
export function calculateSessionDoneSummary(
  session: PracticeSession,
  questions: Question[],
): SessionDoneSummary {
  const finished = session.finish();
  const breakdown = session.breakdown();
  const times = session.answered.map((a) => a.timeMs).filter((t) => t > 0);
  const totalTimeS = Math.round(times.reduce((s, t) => s + t, 0) / 1000);
  const avgTimeS = times.length ? Math.round(times.reduce((s, t) => s + t, 0) / 1000 / times.length) : 0;

  const answeredKps = session.answered.map((a) => {
    const targetQ = questions.find((q) => q.id === a.qid);
    return { kp: targetQ?.kp, verdict: a.grade.verdict };
  });
  const weakKnowledgePoints = computeWeakKnowledgePoints(answeredKps);

  return {
    ...finished,
    ...breakdown,
    totalTimeS,
    avgTimeS,
    weakKnowledgePoints,
  };
}

/**
 * 广播会话结束事件（内部总线 + window 生态事件）
 */
export function broadcastSessionEnded(
  session: PracticeSession,
  summary: SessionDoneSummary,
  win: Window = typeof window !== "undefined" ? window : ({} as Window),
): void {
  emitExamEvent("session-ended", {
    sessionId: session.id,
    mode: session.state.mode,
    total: summary.total,
    correct: summary.correct,
    wrong: summary.wrong,
    weakKnowledgePoints: summary.weakKnowledgePoints,
  });

  if (typeof win.dispatchEvent === "function") {
    win.dispatchEvent(
      new CustomEvent("lv-exam:session-ended", {
        detail: {
          v: 1,
          source: "siyuan-exam",
          at: Date.now(),
          payload: {
            sessionId: session.id,
            mode: session.state.mode,
            total: summary.total,
            correct: summary.correct,
            accuracy: summary.total > 0 ? Math.round((summary.correct / summary.total) * 100) : 0,
            weakKnowledgePoints: summary.weakKnowledgePoints,
          },
        },
      }),
    );
  }
}

/**
 * 提前放弃或退出会话时，保全看过提示/材料的真实曝光事实
 */
export function flushAbandonedSessionExposures(
  app: ExamApp,
  session: PracticeSession,
  exposures: Map<string, Set<string>> | { get(qid: string): Set<string> | undefined },
): void {
  const answeredQids = session.answered.map((a) => a.qid);
  const inputs = abandonedExposureInputs(
    answeredQids,
    exposures as any,
    { kind: "practice", mode: session.state.mode, sessionId: session.id },
  );

  for (const input of inputs) {
    try {
      app.recordAttempt(input);
    } catch {
      // 尽力而为落库
    }
  }
}

/**
 * 44-09 撤销作答：在会话与 App 流水层同步撤销上一题提交并恢复原草稿
 */
export function executeUndoLastAttempt(
  session: PracticeSession,
  app: ExamApp,
): { undone: boolean; restoredAnswer?: string; qid?: string } {
  const undone = session.undoLastSubmit();
  if (!undone) return { undone: false };
  app.undoLastAttempt(session.id, undone.qid);
  return {
    undone: true,
    restoredAnswer: undone.restoredAnswer,
    qid: undone.qid,
  };
}

/**
 * 提取结算页错题列表并确保具备思源块级坐标
 */
export function extractSessionWrongQuestions(
  session: PracticeSession,
  questionMap: Map<string, Question>,
): Array<Question & { blockId: string; rootId: string }> {
  return session.answered
    .filter((a) => a.grade.verdict === "wrong")
    .map((a) => questionMap.get(a.qid))
    .filter((q): q is Question & { blockId: string; rootId: string } => !!q && !!q.blockId && !!q.rootId);
}

export interface QuestionRestoredState {
  feedback: { verdict: string; myAnswer: string } | null;
  selected: string;
  draftLive: string;
}

/**
 * 切题或恢复时计算题目控件草稿与已作答反馈状态
 */
export function resolveQuestionRestorationState(
  session: PracticeSession | null,
  q: Question | undefined,
  isChoice: boolean,
): QuestionRestoredState {
  const saved = session?.state.answered?.find((a) => a.pos === session.state.cursor);
  const feedback = saved ? { verdict: saved.verdict, myAnswer: saved.myAnswer } : null;
  const draft = q && session ? session.getDraft(q.id) : "";
  const existingAnswer = saved?.myAnswer ?? draft;

  return {
    feedback,
    selected: isChoice ? existingAnswer : "",
    draftLive: !isChoice ? existingAnswer : "",
  };
}

/**
 * 记录题目曝光事实节点（如 hint / explain / socratic / reveal / analysis）
 */
export function recordExposureFact(
  exposures: Map<string, Set<string>>,
  qid: string,
  node: string,
): void {
  let set = exposures.get(qid);
  if (!set) {
    set = new Set<string>();
    exposures.set(qid, set);
  }
  set.add(node);
}

/**
 * 读取题目的受助暴露事实（提示/讲解/揭示任一）
 */
export function getExposureHelpMode(
  exposures: Map<string, Set<string>>,
  qid: string,
): "explain" | "hint" | "socratic" | "reveal" | undefined {
  const set = exposures.get(qid);
  if (!set) return undefined;
  if (set.has("explain") || set.has("socratic") || set.has("hint") || set.has("reveal")) {
    return (helpFromExposure(set) ?? "hint") as any;
  }
  return undefined;
}

/**
 * 切换题目用户自定义标签（思源块属性）
 */
export async function toggleQuestionUserTag(
  app: any,
  q: Question | undefined,
  tag: string,
): Promise<string[] | null> {
  if (!q || !q.blockId || !app) return null;
  const updated = await app.tagQuestion(q, tag);
  return updated?.userTags ?? null;
}

/**
 * 退出当前练习会话（含未结算确认、放弃曝光保全与落盘）
 */
export async function executeSessionExit(
  app: any,
  session: PracticeSession | null,
  exposures: any,
  isSessionDone: boolean,
  confirmFn: (opts: { title: string; content: string }) => Promise<boolean>,
  t: (k: string) => string,
): Promise<boolean> {
  if (!session) return true;

  if (!isSessionDone && session.answered?.length) {
    const ok = await confirmFn({
      title: t("session.exit"),
      content: t("session.exitConfirm"),
    });
    if (!ok) return false;
  }

  flushAbandonedSessionExposures(app, session, exposures);
  await app.saveSession();
  await app.flush();
  return true;
}

export interface SessionKpBreakdownItem {
  kp: string;
  correct: number;
  total: number;
  wrong: number;
}

/**
 * 聚合会话作答结果按考点维度的对错分布（按正确率升序排序，薄弱考点优先呈现）
 */
export function computeSessionKpBreakdown(
  answered: Array<{ qid: string; grade: { verdict: string } }>,
  questionMap: Map<string, Question>,
): SessionKpBreakdownItem[] {
  const map = new Map<string, SessionKpBreakdownItem>();

  for (const a of answered) {
    const q = questionMap.get(a.qid);
    const key = q?.kp?.trim() ?? "";
    if (!key) continue;
    const e = map.get(key) ?? { kp: key, correct: 0, total: 0, wrong: 0 };
    e.total++;
    if (a.grade.verdict === "correct") e.correct++;
    else if (a.grade.verdict === "wrong") e.wrong++;
    map.set(key, e);
  }

  return [...map.values()].sort((a, b) => a.correct / a.total - b.correct / b.total);
}

export interface SessionResumeResult {
  session: PracticeSession | null;
  sessionDone: any;
  missingCount: number;
}

/**
 * 恢复中断的练习会话并推进游标
 */
export async function executeSessionResume(
  app: any,
  loadQuestionsFn: () => Promise<Question[]>,
  activeBankId: string,
): Promise<SessionResumeResult> {
  const s = await app.resumeSession(async (qids: string[]) => {
    const all = await loadQuestionsFn();
    return qids.map((id) => all.find((q) => q.id === id)).filter(Boolean) as Question[];
  }, activeBankId);

  if (!s) {
    return { session: null, sessionDone: null, missingCount: 0 };
  }

  s.advancePastAnswered();
  const sessionDone = s.allAnswered() ? s.finish() : null;

  return {
    session: s,
    sessionDone,
    missingCount: app.lastResumeMissing?.length ?? 0,
  };
}

export interface SessionFinishResult {
  summary: any;
  settleMode: string;
}

/**
 * 执行练习会话结束结算（汇总计算、事件广播与会话落盘）
 */
export async function executeSessionFinish(
  app: any,
  session: PracticeSession,
  questions: Question[],
  win: Window = typeof window !== "undefined" ? window : ({} as Window),
): Promise<SessionFinishResult> {
  const summary = calculateSessionDoneSummary(session, questions);
  broadcastSessionEnded(session, summary, win);

  await app.saveSession();
  await app.flush();

  return {
    summary,
    settleMode: session.state.mode,
  };
}

/**
 * 启动练习会话并处理冲突协商（若有已存在会话则弹窗确认放弃并重开）
 */
export async function executeNegotiateSessionStart(options: {
  app: any;
  questions: Question[];
  mode: string;
  bankId: string;
  interleave: boolean;
  seed: string;
  confirmDialogSync: (opts: { title: string; content: string }) => Promise<boolean>;
  t: (k: string) => string;
}): Promise<{ session: PracticeSession | null; error?: string }> {
  const { app, questions, mode, bankId, interleave, seed, confirmDialogSync, t } = options;
  try {
    const session = await app.startSession(questions, mode, bankId, { interleave, seed });
    return { session };
  } catch (e) {
    const msg = String(e instanceof Error ? e.message : e);
    if (!msg.includes("已有进行中的会话")) {
      return { session: null, error: msg };
    }
    const ok = await confirmDialogSync({
      title: t("session.conflictTitle"),
      content: t("session.conflictBody"),
    });
    if (!ok) return { session: null };
    await app.discardSession();
    try {
      const session = await app.startSession(questions, mode, bankId, { interleave });
      return { session };
    } catch (e2) {
      return { session: null, error: String(e2 instanceof Error ? e2.message : e2) };
    }
  }
}




