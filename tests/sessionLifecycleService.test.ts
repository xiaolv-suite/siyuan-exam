import { describe, it, expect, vi } from "vitest";
import {
  recordSessionAttempt,
  calculateSessionDoneSummary,
  broadcastSessionEnded,
  flushAbandonedSessionExposures,
} from "@/ui/practice/services/sessionLifecycleService";
import type { ExamApp } from "@/app";
import type { Question } from "@/core/types";
import type { PracticeSession } from "@/core/session";

describe("练习会话生命周期与结算广播服务 (sessionLifecycleService)", () => {
  const fakeQuestion: Question = {
    id: "q-1",
    type: "single",
    stem: "单选题干",
    options: ["A", "B"],
    answer: "A",
    kp: "数学/代数",
    status: "published",
    origin: "manual",
    hash: "h-1",
  };

  it("1. recordSessionAttempt：构造完整作答流水并落盘", () => {
    let recorded: any = null;
    const mockApp = {
      recordAttempt: vi.fn().mockImplementation((event) => {
        recorded = event;
      }),
    } as unknown as ExamApp;

    const mockSession = {
      id: "sess-1",
      state: { mode: "quick" },
    } as unknown as PracticeSession;

    recordSessionAttempt({
      app: mockApp,
      session: mockSession,
      q: fakeQuestion,
      submitResult: {
        grade: { verdict: "correct", myAnswer: "A" },
        isDelayedReview: false,
      },
      timeMs: 3200,
      confidenceSel: "sure",
      helpMode: "hint",
      isRecalled: true,
      exposures: ["hint", "analysis"],
    });

    expect(mockApp.recordAttempt).toHaveBeenCalled();
    expect(recorded.qid).toBe("q-1");
    expect(recorded.verdict).toBe("correct");
    expect(recorded.confidence).toBe("sure");
    expect(recorded.help).toBe("hint");
    expect(recorded.recall).toBe(true);
    expect(recorded.timeMs).toBe(3200);
  });

  it("2. calculateSessionDoneSummary：计算完成总览与用时平均值", () => {
    const mockSession = {
      finish: () => ({ total: 2, correct: 1, wrong: 1 }),
      breakdown: () => ({ initialTotal: 2, initialCorrect: 1 }),
      answered: [
        { qid: "q-1", timeMs: 4000, grade: { verdict: "correct" } },
        { qid: "q-2", timeMs: 6000, grade: { verdict: "wrong" } },
      ],
    } as unknown as PracticeSession;

    const summary = calculateSessionDoneSummary(mockSession, [fakeQuestion]);
    expect(summary.total).toBe(2);
    expect(summary.correct).toBe(1);
    expect(summary.totalTimeS).toBe(10);
    expect(summary.avgTimeS).toBe(5);
  });

  it("3. broadcastSessionEnded：广播内部总线与 window 全局事件", () => {
    const mockSession = {
      id: "sess-1",
      state: { mode: "quick" },
    } as unknown as PracticeSession;

    const dispatchMock = vi.fn();
    const mockWin = {
      dispatchEvent: dispatchMock,
    } as unknown as Window;

    broadcastSessionEnded(
      mockSession,
      {
        total: 10,
        correct: 8,
        wrong: 2,
        totalTimeS: 60,
        avgTimeS: 6,
        weakKnowledgePoints: ["数学/代数"],
      },
      mockWin,
    );

    expect(dispatchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "lv-exam:session-ended",
      }),
    );
  });

  it("4. flushAbandonedSessionExposures：放弃会话时保全提示/材料真实曝光", () => {
    const mockApp = {
      recordAttempt: vi.fn(),
    } as unknown as ExamApp;

    const mockSession = {
      id: "sess-1",
      state: { mode: "quick" },
      answered: [], // 未作答直接退出
    } as unknown as PracticeSession;

    const exposures = new Map<string, Set<string>>([
      ["q-1", new Set(["hint", "material"])],
    ]);

    flushAbandonedSessionExposures(mockApp, mockSession, exposures);
    expect(mockApp.recordAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        qid: "q-1",
        verdict: "not_attempted",
      }),
    );
  });
});
