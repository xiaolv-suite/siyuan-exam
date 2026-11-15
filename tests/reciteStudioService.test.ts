import { describe, it, expect, vi } from "vitest";
import {
  assembleReciteQueue,
  executeReciteRating,
  extractForgotReciteQuestions,
  pushForgotReciteToCards,
  pushForgotReciteToActions,
  initReciteSession,
  advanceReciteState,
  getReciteTtsPayload,
  prepareRetryForgotState,
} from "@/ui/practice/services/reciteStudioService";
import type { ExamApp } from "@/app";
import type { Question } from "@/core/types";
import { RatingGuard } from "@/core/ratingOutcome";

describe("艾宾浩斯背题工作台服务 (reciteStudioService)", () => {
  const fakeQuestions: Question[] = [
    {
      id: "q-1",
      type: "single",
      stem: "题目1",
      options: ["A", "B"],
      answer: "A",
      status: "published",
      origin: "manual",
      hash: "h-1",
    },
    {
      id: "q-2",
      type: "single",
      stem: "题目2",
      options: ["A", "B"],
      answer: "B",
      status: "published",
      origin: "manual",
      hash: "h-2",
    },
  ];

  it("1. assembleReciteQueue：错题优先与题量组大小控制", () => {
    const mockApp = {
      wrongDrill: vi.fn().mockReturnValue([fakeQuestions[0]]),
      quickDrill: vi.fn().mockImplementation((pool, size) => pool.slice(0, size)),
    } as unknown as ExamApp;

    const queue = assembleReciteQueue(mockApp, fakeQuestions, 10);
    expect(mockApp.wrongDrill).toHaveBeenCalledWith(fakeQuestions);
    expect(queue).toHaveLength(1);
    expect(queue[0].id).toBe("q-1");
  });

  it("2. executeReciteRating：防重入与评分写回", async () => {
    const guard = new RatingGuard();
    const mockOutcome = { status: "recorded" as const, terminal: true, retryable: false, userHint: "" };
    const mockApp = {
      reciteAnswer: vi.fn().mockResolvedValue(mockOutcome),
    } as unknown as ExamApp;

    const res = await executeReciteRating({
      app: mockApp,
      bankName: "演示库",
      q: fakeQuestions[0],
      rating: 3,
      sessionId: "s-recite-1",
      guard,
    });

    expect(res).not.toBeNull();
    expect(res?.outcome.status).toBe("recorded");

    // 同题重复评分防重入拦截
    const repeatRes = await executeReciteRating({
      app: mockApp,
      bankName: "演示库",
      q: fakeQuestions[0],
      rating: 3,
      sessionId: "s-recite-1",
      guard,
    });
    expect(repeatRes).toBeNull();
  });

  it("3. extractForgotReciteQuestions / pushForgotReciteToCards / pushForgotReciteToActions 遗忘项闭环", async () => {
    // 1. 提取评级为 1 的遗忘题
    const forgot = extractForgotReciteQuestions(fakeQuestions, [1, 3]);
    expect(forgot).toHaveLength(1);
    expect(forgot[0].id).toBe("q-1");

    // 2. 遗忘题推送到闪卡
    const msgs: string[] = [];
    const showMessage = (m: string) => msgs.push(m);
    const t = (k: string) => `[${k}]`;

    const mockApp = {
      convertToCards: vi.fn().mockResolvedValue(1),
      addActions: vi.fn().mockResolvedValue({ added: 1, skipped: 0 }),
    } as unknown as ExamApp;

    const count = await pushForgotReciteToCards(mockApp, "bank-1", "演示库", forgot, showMessage, t);
    expect(count).toBe(1);
    expect(msgs[0]).toContain("[memory.toCardDone]");

    // 3. 遗忘题推送到行动清单
    const actionRes = await pushForgotReciteToActions(mockApp, forgot, "s-1", t);
    expect(actionRes.added).toBe(1);
    expect(mockApp.addActions).toHaveBeenCalled();
  });

  it("4. initReciteSession 与 prepareRetryForgotState：背题与遗忘重练会话初始化", () => {
    const mockApp = {
      wrongDrill: vi.fn().mockReturnValue(fakeQuestions),
      quickDrill: vi.fn().mockImplementation((p, s) => p.slice(0, s)),
    } as unknown as ExamApp;

    // 1. 初始化会话
    const session = initReciteSession(mockApp, fakeQuestions, 10);
    expect(session).not.toBeNull();
    expect(session?.cursor).toBe(0);
    expect(session?.revealed).toBe(false);
    expect(session?.done).toBe(false);
    expect(session?.ratings).toEqual([]);
    expect(session?.sessionId).toMatch(/^s-recite-/);

    // 2. 空题库返回 null
    const emptyApp = {
      wrongDrill: vi.fn().mockReturnValue([]),
      quickDrill: vi.fn().mockReturnValue([]),
    } as unknown as ExamApp;
    expect(initReciteSession(emptyApp, [], 10)).toBeNull();

    // 3. 遗忘重练会话
    const retrySession = prepareRetryForgotState(fakeQuestions, [1, 3]);
    expect(retrySession).not.toBeNull();
    expect(retrySession?.queue).toHaveLength(1);
    expect(retrySession?.queue[0].id).toBe("q-1");

    // 无遗忘题时返回 null
    expect(prepareRetryForgotState(fakeQuestions, [3, 4])).toBeNull();
  });

  it("5. advanceReciteState：评价推进后游标步进与会话结束判定", () => {
    // 1. 第一题打分后推进到第二题
    const res1 = advanceReciteState(0, fakeQuestions.length, [], 3, fakeQuestions);
    expect(res1.nextCursor).toBe(1);
    expect(res1.done).toBe(false);
    expect(res1.revealed).toBe(false);
    expect(res1.ratings).toEqual([3]);
    expect(res1.nextQuestion?.id).toBe("q-2");

    // 2. 最后一题打分后标记完成
    const res2 = advanceReciteState(1, fakeQuestions.length, [3], 4, fakeQuestions);
    expect(res2.nextCursor).toBe(1);
    expect(res2.done).toBe(true);
    expect(res2.ratings).toEqual([3, 4]);
    expect(res2.nextQuestion).toBeNull();
  });

  it("6. getReciteTtsPayload：题干与答案语音朗读参数组装", () => {
    const q: Question = {
      id: "q-en",
      type: "single",
      stem: "What is an apple?",
      answer: "A fruit",
      options: [],
      studyMeta: { lang: "en-US" },
    } as any;

    // 1. 题干朗读
    const stemTts = getReciteTtsPayload(q, "stem", true);
    expect(stemTts).not.toBeNull();
    expect(stemTts?.text).toBe("What is an apple?");
    expect(stemTts?.options.lang).toBe("en-US");
    expect(stemTts?.options.rate).toBe(0.85);

    // 2. 答案朗读（常规语速）
    const ansTts = getReciteTtsPayload(q, "answer", false);
    expect(ansTts).not.toBeNull();
    expect(ansTts?.text).toBe("A fruit");
    expect(ansTts?.options.rate).toBe(1);

    // 3. 空对象或无内容返回 null
    expect(getReciteTtsPayload(undefined, "stem")).toBeNull();
    expect(getReciteTtsPayload({ stem: "  " } as any, "stem")).toBeNull();
  });
});
