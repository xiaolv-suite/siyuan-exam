// ============================================================
// SessionFlowService: 刷题与作答引擎领域服务（S5 切片架构解耦）
// - 从 ExamApp 上帝类抽离 activeSession 编排与作答流水调度
// - 会话启动、中断恢复（resumeSession）、草稿落盘与放弃
// - 错题/刷题流水记录与同步通知
// ============================================================
import type { AttemptEvent, Question, ReplayResult, SessionState } from "../core/types";
import { SESSION_KEY } from "../constants";
import { PracticeSession, groupAdjacent } from "../core/session";
import { interleaveGroups } from "../core/interleave";
import { randomSeedId } from "../core/random";
import { ELIMINATE_STREAK, replay } from "../core/replayer";
import type { AttemptLog } from "../core/attemptLog";
import type { StorageGateway } from "../storage/storageGateway";

/** 过期草稿（TODO 2.4）：7 天隐藏不再续做入口，30 天清理（流水保留） */
const DRAFT_HIDE_MS = 7 * 86_400_000;
const DRAFT_DROP_MS = 30 * 86_400_000;

export interface SessionFlowDeps {
  storage: StorageGateway;
  attempts: AttemptLog;
  now?: () => number;
  onSyncQuestionStudyState?: (qid: string) => Promise<void>;
  onInvalidate?: () => void;
}

export class SessionFlowService {
  private activeSession: PracticeSession | null = null;
  private replayCache: ReplayResult | null = null;
  private replayCacheKey = "";
  lastResumeMissing: string[] = [];

  constructor(private readonly deps: SessionFlowDeps) {}

  invalidateReplay(): void {
    this.replayCache = null;
    this.replayCacheKey = "";
  }

  derived(
    options: { eliminateStreak?: number; reopenAt?: ReadonlyMap<string, number> } | undefined,
    activeReopenAt: ReadonlyMap<string, number> | undefined,
    getEliminateStreak?: () => number,
  ): ReplayResult {
    const reopenAt = options?.reopenAt ?? activeReopenAt;
    if (options?.eliminateStreak !== undefined || options?.reopenAt !== undefined) {
      return replay(this.deps.attempts.all(), {
        eliminateStreak: options?.eliminateStreak ?? getEliminateStreak?.() ?? ELIMINATE_STREAK,
        reopenAt,
      });
    }
    const threshold = Math.max(1, Number(getEliminateStreak?.() ?? ELIMINATE_STREAK) || ELIMINATE_STREAK);
    const cacheKey = `${threshold}|${reopenAt ? [...reopenAt.entries()].map(([k, v]) => `${k}@${v}`).sort().join(",") : ""}`;
    if (!this.replayCache || this.replayCacheKey !== cacheKey) {
      this.replayCache = replay(this.deps.attempts.all(), { eliminateStreak: threshold, reopenAt });
      this.replayCacheKey = cacheKey;
    }
    return this.replayCache;
  }

  undoLastAttempt(sessionId: string, qid?: string): AttemptEvent | null {
    const popped = this.deps.attempts.popLatest(sessionId, qid);
    if (popped) this.deps.onInvalidate?.();
    return popped;
  }

  async updateMockAttemptSelfRating(
    sessionId: string,
    qid: string,
    factor: number,
    myAnswer?: string | null,
  ): Promise<AttemptEvent> {
    const verdict: AttemptEvent["verdict"] = factor >= 0.6 ? "correct" : "wrong";
    const selfRating = factor >= 0.99 ? 4 : factor >= 0.6 ? 3 : factor > 0 ? 2 : 1;
    let ev = this.deps.attempts.updateSessionAttempt(sessionId, qid, { verdict, selfRating });
    if (!ev) {
      ev = this.deps.attempts.append({
        qid,
        kind: "mock",
        mode: "paper",
        verdict,
        myAnswer: myAnswer ?? null,
        selfRating,
        sessionId,
        examId: sessionId,
        queue: "normal",
      });
    }
    this.deps.onInvalidate?.();
    await this.deps.attempts.flush();
    if (this.deps.onSyncQuestionStudyState) {
      void this.deps.onSyncQuestionStudyState(qid).catch(() => undefined);
    }
    return ev;
  }

  currentSession(): PracticeSession | null {
    return this.activeSession;
  }

  async startSession(
    questions: Question[],
    mode: string,
    bankId?: string,
    opts?: { interleave?: boolean; seed?: string },
  ): Promise<PracticeSession> {
    if (this.activeSession && this.activeSession.phase === "running") {
      throw new Error("已有进行中的会话：请先继续或放弃");
    }
    const ordered = opts?.interleave ? interleaveGroups(questions) : groupAdjacent(questions);
    this.activeSession = new PracticeSession(ordered, mode, undefined, this.deps.now ?? (() => Date.now()));
    if (bankId) this.activeSession.state.bankId = bankId;
    this.activeSession.state.order = opts?.interleave ? "interleaved" : "adjacent";
    this.activeSession.state.seed = opts?.seed ?? randomSeedId();
    await this.saveSession();
    return this.activeSession;
  }

  async resumeSession(
    questionLoader: (qids: string[]) => Promise<Question[]>,
    expectedBankId?: string,
  ): Promise<PracticeSession | null> {
    this.lastResumeMissing = [];
    if (this.activeSession?.phase === "running") {
      const bankId = this.activeSession.state.bankId;
      return bankId && expectedBankId && bankId !== expectedBankId ? null : this.activeSession;
    }
    try {
      const saved = await this.deps.storage.load<SessionState>(SESSION_KEY);
      if (!saved?.qids?.length || saved.finishedAt) return null;
      if (saved.bankId && expectedBankId && saved.bankId !== expectedBankId) return null;
      const now = this.deps.now ?? Date.now;
      const age = now() - (saved.updatedAt || saved.startedAt);
      if (age > DRAFT_DROP_MS) {
        await this.deps.storage.save(SESSION_KEY, null);
        return null;
      }
      if (age > DRAFT_HIDE_MS) return null;
      const found = Array.isArray(saved.inlineQuestions) && saved.inlineQuestions.length > 0
        ? saved.inlineQuestions
        : await questionLoader(saved.qids);
      const foundIds = new Set(found.map((q) => q.id));
      this.lastResumeMissing = saved.qids.filter((id) => !foundIds.has(id));
      const positions = new Map<number, number>();
      const qids: string[] = [];
      saved.qids.forEach((id, pos) => {
        if (!foundIds.has(id)) return;
        positions.set(pos, qids.length);
        qids.push(id);
      });
      if (!qids.length) return null;
      const sanitized: SessionState = this.lastResumeMissing.length ? {
        ...saved,
        qids,
        cursor: [...positions.keys()].filter((pos) => pos < saved.cursor).length,
        answered: saved.answered?.flatMap((a) => {
          const pos = positions.get(a.pos);
          return pos == null || saved.qids[a.pos] !== a.qid ? [] : [{ ...a, pos }];
        }),
        drafts: Object.fromEntries(Object.entries(saved.drafts).filter(([id]) => foundIds.has(id))),
        requeued: saved.requeued?.filter((id) => foundIds.has(id)),
      } : saved;
      this.activeSession = new PracticeSession(found, saved.mode, sanitized, now);
      return this.activeSession;
    } catch {
      return null;
    }
  }

  async saveSession(): Promise<void> {
    const s = this.activeSession;
    if (!s) return;
    if (s.phase === "finished") {
      await this.deps.storage.save(SESSION_KEY, null);
    } else {
      const snapshot: SessionState = {
        ...s.state,
        qids: [...s.state.qids],
        drafts: { ...s.state.drafts },
        answered: s.state.answered?.map((a) => ({ ...a })),
        requeued: s.state.requeued ? [...s.state.requeued] : undefined,
      };
      await this.deps.storage.save(SESSION_KEY, snapshot);
    }
  }

  async discardSession(): Promise<void> {
    const previous = this.activeSession;
    this.activeSession = null;
    try {
      await this.deps.storage.save(SESSION_KEY, null);
    } catch (e) {
      this.activeSession = previous;
      throw e;
    }
  }

  recordAttempt(input: Parameters<AttemptLog["append"]>[0]): AttemptEvent {
    this.deps.onInvalidate?.();
    const ev = this.deps.attempts.append(input);
    void this.deps.onSyncQuestionStudyState?.(input.qid);
    return ev;
  }
}
