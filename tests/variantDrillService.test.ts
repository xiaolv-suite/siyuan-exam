import { describe, it, expect, vi } from "vitest";
import {
  fetchVariantDrillQuestions,
  fetchFoundationMotherQuestion,
  pickSameKpDrillQuestions,
  executeVariantDrillLookup,
  executeMotherQuestionLookup,
  executeDrillVariantWorkflow,
  executeMotherQuestionWorkflow,
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

  it("3. pickSameKpDrillQuestions：从错题或种子提炼同考点题目", () => {
    const mockApp = {
      sameKpDrill: vi.fn().mockReturnValue([fakeQuestion]),
    };

    const res = pickSameKpDrillQuestions(mockApp, [fakeQuestion], {
      answered: [{ qid: "q-1", grade: { verdict: "wrong" } }],
      state: { qids: [] },
    });

    expect(res.questions).toHaveLength(1);
    expect(res.errorKey).toBeUndefined();

    // 无法命中考点题时返回 errorKey
    mockApp.sameKpDrill.mockReturnValueOnce([]);
    const emptyRes = pickSameKpDrillQuestions(mockApp, [fakeQuestion], null);
    expect(emptyRes.errorKey).toBe("state.noSameKp");
  });

  it("4. executeVariantDrillLookup：变式题钻研流程提示", async () => {
    const mockApp = {
      pickVariantQuestions: vi.fn().mockResolvedValue({
        questions: [fakeQuestion],
        reason: "同考点二次函数变式",
      }),
    };

    const res = await executeVariantDrillLookup(mockApp, fakeQuestion, 5);
    expect(res.questions).toHaveLength(1);
    expect(res.toastMessage).toContain("同考点二次函数变式");

    mockApp.pickVariantQuestions.mockResolvedValueOnce({ questions: [], reason: "" });
    const emptyRes = await executeVariantDrillLookup(mockApp, fakeQuestion, 5);
    expect(emptyRes.questions).toHaveLength(0);
    expect(emptyRes.emptyNotice).toContain("未检索到相关考点");
  });

  it("5. executeMotherQuestionLookup：基础母题溯源流程提示", async () => {
    const mockApp = {
      findFoundationMotherQuestion: vi.fn().mockResolvedValue({
        motherQuestion: fakeQuestion,
        reason: "溯源至概念母题",
      }),
    };

    const res = await executeMotherQuestionLookup(mockApp, fakeQuestion);
    expect(res.motherQuestion?.id).toBe("q-1");
    expect(res.toastMessage).toContain("溯源至概念母题");

    mockApp.findFoundationMotherQuestion.mockResolvedValueOnce({
      motherQuestion: null,
      reason: "该题已是基础概念",
    });
    const emptyRes = await executeMotherQuestionLookup(mockApp, fakeQuestion);
    expect(emptyRes.motherQuestion).toBeNull();
    expect(emptyRes.emptyNotice).toBe("该题已是基础概念");
  });

  it("6. executeDrillVariantWorkflow：变式特训启动工作流", async () => {
    const mockApp = {
      pickVariantQuestions: vi.fn().mockResolvedValue({
        questions: [fakeQuestion],
        reason: "同考点变式题",
      }),
    };
    const showMessage = vi.fn();
    const startPractice = vi.fn().mockResolvedValue(undefined);

    await executeDrillVariantWorkflow({
      app: mockApp,
      q: fakeQuestion,
      showMessage,
      startPractice,
    });

    expect(startPractice).toHaveBeenCalledWith([fakeQuestion], "⚡ 同考点变式题");
  });

  it("7. executeMotherQuestionWorkflow：母题溯源启动工作流", async () => {
    const mockApp = {
      findFoundationMotherQuestion: vi.fn().mockResolvedValue({
        motherQuestion: fakeQuestion,
        reason: "溯源至基础母题",
      }),
    };
    const showMessage = vi.fn();
    const startPractice = vi.fn().mockResolvedValue(undefined);

    await executeMotherQuestionWorkflow({
      app: mockApp,
      target: fakeQuestion,
      showMessage,
      startPractice,
    });

    expect(startPractice).toHaveBeenCalledWith([fakeQuestion], "🌱 溯源至基础母题");
  });
});
