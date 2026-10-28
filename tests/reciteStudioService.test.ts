import { describe, it, expect, vi } from "vitest";
import {
  assembleReciteQueue,
  executeReciteRating,
  extractForgotReciteQuestions,
  pushForgotReciteToCards,
  pushForgotReciteToActions,
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
});
