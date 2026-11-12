import { describe, it, expect, vi } from "vitest";
import {
  extractNumericSpecFields,
  createQuestionEditDraft,
  executeSaveQuestionEdit,
  executeChangeQuestionLifecycle,
} from "@/ui/practice/services/questionEditService";
import type { Question } from "@/core/types";
import type { ExamApp } from "@/app";

describe("题目内联编辑与生命周期更新服务 (questionEditService)", () => {
  const dummyT = (k: string) => `[${k}]`;

  it("1. extractNumericSpecFields：提取数值题目规格展示字段", () => {
    // 1. 无 spec 或非 numeric
    expect(extractNumericSpecFields(undefined)).toEqual({ unit: "", absTol: "", relPct: "", altUnits: "" });
    expect(extractNumericSpecFields({ kind: "multiBlank", blanks: [] } as any)).toEqual({
      unit: "",
      absTol: "",
      relPct: "",
      altUnits: "",
    });

    // 2. 有效 numeric 规格
    const spec = {
      v: 1 as const,
      kind: "numeric" as const,
      unit: "kg",
      absTol: 0.05,
      relTolerance: 0.02,
      altUnits: [{ unit: "g", factor: 1 }],
    };
    const fields = extractNumericSpecFields(spec);
    expect(fields.unit).toBe("kg");
    expect(fields.absTol).toBe("0.05");
    expect(fields.relPct).toBe("2");
    expect(fields.altUnits).toBe("g");
  });

  it("2. createQuestionEditDraft：组装题目编辑草稿", () => {
    const q: Question = {
      id: "q-1",
      type: "single",
      stem: "原题干",
      options: ["A", "B"],
      answer: "A",
      analysis: "原解析",
      kp: "数学/几何",
      difficulty: 3,
      status: "published",
    } as any;

    const draft = createQuestionEditDraft(q);
    expect(draft.stem).toBe("原题干");
    expect(draft.options).toEqual(["A", "B"]);
    expect(draft.answer).toBe("A");
    expect(draft.difficulty).toBe("3");
    expect(draft.status).toBe("published");
  });

  it("3. executeSaveQuestionEdit：校验缺失项与更新内容", async () => {
    const mockApp = {
      updateQuestionContent: vi.fn().mockResolvedValue({ stem: "新题干", answer: "B" }),
    } as unknown as ExamApp;

    const q: any = { id: "q-1", type: "single", blockId: "b-1" };

    // 1. 缺题干
    const resNoStem = await executeSaveQuestionEdit(
      mockApp,
      q,
      { stem: "  ", options: [], answer: "A", analysis: "", kp: "", difficulty: "", status: "draft" },
      {},
      dummyT,
    );
    expect(resNoStem.error).toBe("[edit.needStem]");

    // 2. 缺答案（非材料题）
    const resNoAns = await executeSaveQuestionEdit(
      mockApp,
      q,
      { stem: "有效题干", options: [], answer: "  ", analysis: "", kp: "", difficulty: "", status: "draft" },
      {},
      dummyT,
    );
    expect(resNoAns.error).toBe("[edit.needAnswer]");

    // 3. 正常保存
    const resOk = await executeSaveQuestionEdit(
      mockApp,
      q,
      {
        stem: "新题干",
        options: ["A", "B"],
        answer: "B",
        analysis: "新解析",
        kp: "新考点",
        difficulty: "4",
        status: "published",
      },
      { absTol: "0.01", unit: "m" },
      dummyT,
    );
    expect(resOk.error).toBeUndefined();
    expect(resOk.next?.stem).toBe("新题干");
    expect(mockApp.updateQuestionContent).toHaveBeenCalledWith(q, expect.objectContaining({
      stem: "新题干",
      answer: "B",
      difficulty: 4,
    }));

    // 4. 原有 numeric 规格被清空时传入 answerSpec: null 以清除旧规格
    const numQ: any = {
      id: "q-num",
      type: "fill",
      blockId: "b-num",
      answerSpec: { v: 1, kind: "numeric", unit: "m/s", absTol: 0.5 },
    };
    await executeSaveQuestionEdit(
      mockApp,
      numQ,
      { stem: "速度为多少", options: [], answer: "10", analysis: "", kp: "", difficulty: "", status: "published" },
      { unit: "", absTol: "", relPct: "", altUnits: "" },
      dummyT,
    );
    expect(mockApp.updateQuestionContent).toHaveBeenLastCalledWith(
      numQ,
      expect.objectContaining({ answerSpec: null }),
    );
  });

  it("4. executeChangeQuestionLifecycle：流转生命周期", async () => {
    const mockApp = {
      updateQuestionLifecycle: vi.fn().mockResolvedValue({ status: "review" }),
    } as unknown as ExamApp;
    const showMessage = vi.fn();
    const q: any = { id: "q-1", blockId: "b-1" };

    const res = await executeChangeQuestionLifecycle(mockApp, q, "review", showMessage, dummyT);
    expect(res.status).toBe("review");
    expect(showMessage).toHaveBeenCalled();
  });
});
