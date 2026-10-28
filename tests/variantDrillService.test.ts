import { describe, it, expect, vi } from "vitest";
import {
  fetchVariantDrillQuestions,
  fetchFoundationMotherQuestion,
} from "@/ui/practice/services/variantDrillService";
import type { ExamApp } from "@/app";
import type { Question } from "@/core/types";

describe("变式题训练与母题溯源服务 (variantDrillService)", () => {
  const fakeQuestion: Question = {
    id: "q-1",
    type: "single",
    stem: "母题题干",
    options: ["A", "B"],
    answer: "A",
    status: "published",
    origin: "manual",
    hash: "h-1",
  };

  it("1. fetchVariantDrillQuestions：调用 pickVariantQuestions 检索变式", async () => {
    const mockApp = {
      pickVariantQuestions: vi.fn().mockResolvedValue({
        questions: [fakeQuestion],
        reason: "同考点变式题",
      }),
    } as unknown as ExamApp;

    const res = await fetchVariantDrillQuestions(mockApp, fakeQuestion, 5);
    expect(mockApp.pickVariantQuestions).toHaveBeenCalledWith(fakeQuestion, 5);
    expect(res.questions).toHaveLength(1);
    expect(res.reason).toBe("同考点变式题");
  });

  it("2. fetchFoundationMotherQuestion：调用 findFoundationMotherQuestion 溯源母题", async () => {
    const mockApp = {
      findFoundationMotherQuestion: vi.fn().mockResolvedValue({
        motherQuestion: fakeQuestion,
        reason: "溯源到基础因式分解母题",
      }),
    } as unknown as ExamApp;

    const res = await fetchFoundationMotherQuestion(mockApp, fakeQuestion);
    expect(mockApp.findFoundationMotherQuestion).toHaveBeenCalledWith(fakeQuestion);
    expect(res.motherQuestion?.id).toBe("q-1");
    expect(res.reason).toContain("母题");
  });
});
