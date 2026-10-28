import type { Question } from "@/core/types";
import type { PracticeSession, PracticeSubmitResult } from "@/core/session";
import type { ExamApp } from "@/app";
import { queueKindOf } from "@/core/queueIdentity";
import { createQuestionVersionSnapshot } from "@/core/revision";
import { trailChanged, type AnswerTrail } from "@/core/answerTrail";
import { abandonedExposureInputs } from "@/core/exposure";
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
