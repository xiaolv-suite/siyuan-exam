import { describe, it, expect, vi } from "vitest";
import {
  changeQuestionLifecycle,
  flagQuestionDispute,
  resolveQuestionDispute,
  clearQuestionDispute,
  exportItemAnalysisReportCsv,
  initDisputeFormValues,
  validateAndFlagDispute,
  validateAndResolveDispute,
  handleClearDispute,
} from "@/ui/practice/services/disputeGovernanceService";
import type { ExamApp } from "@/app";
import type { Question } from "@/core/types";
import type { ItemAnalysisReport } from "@/core/itemAnalysis";

describe("题目生命周期与争议处置单服务 (disputeGovernanceService)", () => {
  const fakeQuestion = {
    id: "q-1",
    blockId: "b-1",
    type: "single",
    stem: "争议题目题干",
    options: ["A", "B"],
    answer: "A",
    status: "published",
    origin: "manual",
    hash: "h-1",
  } as Question & { blockId: string };

  it("1. changeQuestionLifecycle：变更生命周期并提示成功", async () => {
    const msgs: string[] = [];
    const showMessage = (m: string) => msgs.push(m);
    const t = (k: string) => `[${k}]`;

    const mockApp = {
      updateQuestionLifecycle: vi.fn().mockResolvedValue({ status: "review" }),
    } as unknown as ExamApp;

    const res = await changeQuestionLifecycle(mockApp, fakeQuestion, "review", showMessage, t);
    expect(mockApp.updateQuestionLifecycle).toHaveBeenCalledWith(fakeQuestion, "review");
    expect(res.status).toBe("review");
    expect(msgs).toHaveLength(1);
  });

  it("2. flagQuestionDispute / resolveQuestionDispute / clearQuestionDispute 争议状态机流转", async () => {
    const msgs: string[] = [];
    const showMessage = (m: string) => msgs.push(m);
    const t = (k: string) => `[${k}]`;

    const mockApp = {
      flagQuestionDispute: vi.fn().mockResolvedValue({
        dispute: { status: "flagged", reason: "wrong_answer", note: "答案有误" },
      }),
      resolveQuestionDispute: vi.fn().mockResolvedValue({
        dispute: { status: "resolved", resolution: "已更正解析" },
      }),
      clearQuestionDispute: vi.fn().mockResolvedValue({
        dispute: undefined,
      }),
    } as unknown as ExamApp;

    // 1. 标记争议
    const r1 = await flagQuestionDispute(mockApp, fakeQuestion, "wrong_answer", "答案有误", showMessage, t);
    expect(mockApp.flagQuestionDispute).toHaveBeenCalledWith(fakeQuestion, "wrong_answer", "答案有误");
    expect(r1.dispute?.status).toBe("flagged");
    expect(msgs).toContain("[dispute.flagSuccess]");

    // 2. 处置争议
    const r2 = await resolveQuestionDispute(mockApp, fakeQuestion, "已更正解析", showMessage, t);
    expect(mockApp.resolveQuestionDispute).toHaveBeenCalledWith(fakeQuestion, "已更正解析");
    expect(r2.dispute?.status).toBe("resolved");
    expect(msgs).toContain("[dispute.resolveSuccess]");

    // 3. 清除争议
    const r3 = await clearQuestionDispute(mockApp, fakeQuestion, showMessage, t);
    expect(mockApp.clearQuestionDispute).toHaveBeenCalledWith(fakeQuestion);
    expect(r3.dispute).toBeUndefined();
    expect(msgs).toContain("[dispute.clearSuccess]");
  });

  it("3. exportItemAnalysisReportCsv：生成单题 CTT 分析 CSV", () => {
    vi.useFakeTimers();
    const createObjectURLMock = vi.fn().mockReturnValue("blob:csv");
    const revokeObjectURLMock = vi.fn();
    const clickMock = vi.fn();

    vi.stubGlobal("document", {
      createElement: vi.fn().mockReturnValue({
        href: "",
        download: "",
        click: clickMock,
      }),
    });
    vi.stubGlobal("URL", class extends URL {
      static createObjectURL = createObjectURLMock;
      static revokeObjectURL = revokeObjectURLMock;
    });

    const fakeReport: ItemAnalysisReport = {
      qid: "q-1",
      stem: "测试题干",
      type: "single",
      options: ["A", "B"],
      correctAnswer: "A",
      totalAttempts: 10,
      correctRate: 0.8,
      optionStats: [
        { label: "A", text: "A", count: 8, rate: 0.8, isCorrect: true },
        { label: "B", text: "B", count: 2, rate: 0.2, isCorrect: false },
      ],
      deadDistractors: [],
      lowSampleWarning: false,
    };

    exportItemAnalysisReportCsv(fakeReport);
    expect(createObjectURLMock).toHaveBeenCalled();
    expect(clickMock).toHaveBeenCalled();
    vi.runAllTimers();
    expect(revokeObjectURLMock).toHaveBeenCalled();

    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("4. initDisputeFormValues：初始化争议表单状态", () => {
    // 1. 无已有争议
    expect(initDisputeFormValues({} as Question)).toEqual({
      reason: "wrong_answer",
      note: "",
      resolution: "",
    });

    // 2. 有已有争议
    const qWithDispute: Question = {
      id: "q-1",
      dispute: {
        reason: "outdated",
        note: "旧大纲题目",
        resolution: "已剔除",
        status: "resolved",
      },
    } as any;
    expect(initDisputeFormValues(qWithDispute)).toEqual({
      reason: "outdated",
      note: "旧大纲题目",
      resolution: "已剔除",
    });
  });

  it("5. validateAndFlagDispute / validateAndResolveDispute / handleClearDispute：输入校验与包装", async () => {
    const showMessage = vi.fn();
    const t = (k: string) => `[${k}]`;
    const mockApp = {
      flagQuestionDispute: vi.fn().mockResolvedValue({ dispute: { status: "flagged" } }),
      resolveQuestionDispute: vi.fn().mockResolvedValue({ dispute: { status: "resolved" } }),
      clearQuestionDispute: vi.fn().mockResolvedValue({ dispute: undefined }),
    } as unknown as ExamApp;

    // 1. 空备注拦截
    const emptyFlag = await validateAndFlagDispute({
      app: mockApp,
      q: fakeQuestion,
      reason: "wrong_answer",
      note: "  ",
      showMessage,
      t,
    });
    expect(emptyFlag.error).toBe("[dispute.notePlaceholder]");
    expect(mockApp.flagQuestionDispute).not.toHaveBeenCalled();

    // 2. 正常标记
    const okFlag = await validateAndFlagDispute({
      app: mockApp,
      q: fakeQuestion,
      reason: "wrong_answer",
      note: "答案解析冲突",
      showMessage,
      t,
    });
    expect(okFlag.updated).toBeDefined();

    // 3. 空结论拦截
    const emptyResolve = await validateAndResolveDispute({
      app: mockApp,
      q: fakeQuestion,
      resolution: "   ",
      showMessage,
      t,
    });
    expect(emptyResolve.error).toBe("[dispute.resolutionPlaceholder]");
    expect(mockApp.resolveQuestionDispute).not.toHaveBeenCalled();

    // 4. 正常解决
    const okResolve = await validateAndResolveDispute({
      app: mockApp,
      q: fakeQuestion,
      resolution: "已重新核验",
      showMessage,
      t,
    });
    expect(okResolve.updated).toBeDefined();

    // 5. 清除
    const okClear = await handleClearDispute({
      app: mockApp,
      q: fakeQuestion,
      showMessage,
      t,
    });
    expect(okClear.updated).toBeDefined();
  });
});
