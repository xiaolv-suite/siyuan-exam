import { describe, it, expect, vi } from "vitest";
import {
  generateFlashCandidates,
  commitFlashCards,
  executeCommitFlashCardsWithConfirm,
} from "@/ui/practice/services/flashCandidateService";
import type { ExamApp } from "@/app";
import type { Question } from "@/core/types";
import type { KernelApiClient } from "@/kernel/client";

describe("AI 闪卡候选与入库服务 (flashCandidateService)", () => {
  const fakeQuestion: Question = {
    id: "q-flash-1",
    type: "single",
    stem: "测试闪卡生成的错题题干",
    options: ["A", "B"],
    answer: "A",
    status: "published",
    origin: "manual",
    hash: "h-flash-1",
  };

  it("1. generateFlashCandidates：成功解析并提取卡片", async () => {
    const mockApp = {
      loadWrongReflection: vi.fn().mockResolvedValue({ text: "我的反思内容" }),
    } as unknown as ExamApp;

    const mockClient = {
      aiChat: vi.fn().mockResolvedValue({
        status: "ok",
        content: JSON.stringify({
          cards: [
            { type: "qa", front: "正面知识点1", back: "背面核心定义1", source: "反思" },
          ],
          splitReason: "概念拆分解耦",
        }),
      }),
    } as unknown as KernelApiClient;

    const t = (k: string) => `[${k}]`;

    const res = await generateFlashCandidates({
      q: fakeQuestion,
      client: mockClient,
      app: mockApp,
      aiConfig: {},
      t,
    });

    expect(res.channelId).toBe("siyuan");
    expect(res.tokens).toBeGreaterThanOrEqual(0);
    expect(mockApp.loadWrongReflection).toHaveBeenCalledWith("q-flash-1");
  });

  it("2. commitFlashCards：将生成的卡片提交至题库", async () => {
    const mockApp = {
      createFlashCards: vi.fn().mockResolvedValue({
        blockIds: ["b-card-1", "b-card-2"],
      }),
    } as unknown as ExamApp;

    const cards = [
      { front: "正面1", back: "背面1", reason: "理由1" },
      { front: "正面2", back: "背面2", reason: "理由2" },
    ];

    const blockIds = await commitFlashCards(mockApp, "bank-1", "测试题库", cards);
    expect(mockApp.createFlashCards).toHaveBeenCalledWith("bank-1", "测试题库", cards);
    expect(blockIds).toEqual(["b-card-1", "b-card-2"]);
  });

  it("3. executeCommitFlashCardsWithConfirm：带确认弹窗的入库提交", async () => {
    const t = (k: string) => `[${k}]`;
    const mockApp = {
      createFlashCards: vi.fn().mockResolvedValue({
        blockIds: ["b-card-1"],
      }),
    } as unknown as ExamApp;
    const cards = [{ front: "正面", back: "背面", reason: "理由" }];

    // 1. 用户取消
    const cancelConfirm = vi.fn().mockResolvedValue(false);
    const cancelRes = await executeCommitFlashCardsWithConfirm(mockApp, "b1", "题库", cards, cancelConfirm, t);
    expect(cancelRes.confirmed).toBe(false);

    // 2. 用户确认
    const agreeConfirm = vi.fn().mockResolvedValue(true);
    const agreeRes = await executeCommitFlashCardsWithConfirm(mockApp, "b1", "题库", cards, agreeConfirm, t);
    expect(agreeRes.confirmed).toBe(true);
    expect(agreeRes.blockIds).toEqual(["b-card-1"]);
    expect(agreeRes.toast).toBe("[flash.done]");
  });
});
