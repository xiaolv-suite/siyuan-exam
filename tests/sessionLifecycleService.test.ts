import { describe, it, expect, vi } from "vitest";
import {
  recordSessionAttempt,
  calculateSessionDoneSummary,
  broadcastSessionEnded,
  flushAbandonedSessionExposures,
  executeUndoLastAttempt,
  extractSessionWrongQuestions,
  resolveQuestionRestorationState,
  recordExposureFact,
  getExposureHelpMode,
  toggleQuestionUserTag,
  executeSessionExit,
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

  it("5. executeUndoLastAttempt：撤销上一题作答与流水回滚", () => {
    const mockApp = {
      undoLastAttempt: vi.fn(),
    } as unknown as ExamApp;

    const mockSession = {
      id: "sess-1",
      undoLastSubmit: vi.fn().mockReturnValue({ qid: "q-1", restoredAnswer: "A" }),
    } as unknown as PracticeSession;

    const res = executeUndoLastAttempt(mockSession, mockApp);
    expect(res.undone).toBe(true);
    expect(res.restoredAnswer).toBe("A");
    expect(mockApp.undoLastAttempt).toHaveBeenCalledWith("sess-1", "q-1");

    // 无法撤回时返回 false
    const failSession = {
      id: "sess-1",
      undoLastSubmit: vi.fn().mockReturnValue(null),
    } as unknown as PracticeSession;
    expect(executeUndoLastAttempt(failSession, mockApp).undone).toBe(false);
  });

  it("6. extractSessionWrongQuestions：过滤错题并筛选带有效块ID的对象", () => {
    const mockSession = {
      answered: [
        { qid: "q-1", grade: { verdict: "correct" } },
        { qid: "q-2", grade: { verdict: "wrong" } },
        { qid: "q-3", grade: { verdict: "wrong" } },
      ],
    } as unknown as PracticeSession;

    const qMap = new Map<string, Question>([
      ["q-2", { id: "q-2", blockId: "b-2", rootId: "doc-2" } as any],
      ["q-3", { id: "q-3" } as any], // 缺少 blockId
    ]);

    const wrongs = extractSessionWrongQuestions(mockSession, qMap);
    expect(wrongs).toHaveLength(1);
    expect(wrongs[0].id).toBe("q-2");
  });

  it("7. resolveQuestionRestorationState：计算切题恢复时的草稿与反馈", () => {
    const mockSession = {
      state: { cursor: 1, answered: [{ pos: 1, myAnswer: "B", verdict: "correct" }] },
      getDraft: vi.fn().mockReturnValue("B"),
    } as unknown as PracticeSession;

    const state = resolveQuestionRestorationState(mockSession, { id: "q-1" } as any, true);
    expect(state.selected).toBe("B");
    expect(state.feedback?.verdict).toBe("correct");
  });

  it("8. recordExposureFact 与 getExposureHelpMode：记录与派生受助曝光", () => {
    const exposures = new Map<string, Set<string>>();
    recordExposureFact(exposures, "q-1", "hint");
    recordExposureFact(exposures, "q-1", "explain");

    expect(exposures.get("q-1")?.has("hint")).toBe(true);
    expect(exposures.get("q-1")?.has("explain")).toBe(true);
    expect(getExposureHelpMode(exposures, "q-1")).toBe("explain");
    expect(getExposureHelpMode(exposures, "q-2")).toBeUndefined();
  });

  it("9. toggleQuestionUserTag：切换用户自定义标签", async () => {
    const mockApp = {
      tagQuestion: vi.fn().mockResolvedValue({ userTags: ["易错", "高频"] }),
    };

    const res = await toggleQuestionUserTag(mockApp, { id: "q-1", blockId: "b-1" } as any, "高频");
    expect(res).toEqual(["易错", "高频"]);
    expect(mockApp.tagQuestion).toHaveBeenCalled();

    // 无 blockId 时跳过
    expect(await toggleQuestionUserTag(mockApp, { id: "q-1" } as any, "高频")).toBeNull();
  });

  it("10. executeSessionExit：处理退出确认与曝光保全", async () => {
    const dummyT = (k: string) => `[${k}]`;
    const mockApp = {
      recordAttempt: vi.fn(),
      saveSession: vi.fn().mockResolvedValue(undefined),
      flush: vi.fn().mockResolvedValue(undefined),
    };

    const mockSession = {
      id: "sess-1",
      state: { mode: "quick" },
      answered: [{ qid: "q-1" }],
    } as any;

    // 1. 中途退出，用户取消
    const confirmCancel = vi.fn().mockResolvedValue(false);
    const cancelRes = await executeSessionExit(mockApp, mockSession, new Map(), false, confirmCancel, dummyT);
    expect(cancelRes).toBe(false);
    expect(mockApp.saveSession).not.toHaveBeenCalled();

    // 2. 中途退出，用户确认
    const confirmOk = vi.fn().mockResolvedValue(true);
    const okRes = await executeSessionExit(mockApp, mockSession, new Map(), false, confirmOk, dummyT);
    expect(okRes).toBe(true);
    expect(mockApp.saveSession).toHaveBeenCalled();
    expect(mockApp.flush).toHaveBeenCalled();
  });
});
