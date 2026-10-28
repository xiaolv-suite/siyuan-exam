import { describe, it, expect, vi } from "vitest";
import {
  persistReviewQueue,
  restoreReviewQueue,
  recordGenerationUsage,
  approveSingleQuestion,
  approveBatchQuestions,
  fetchCurrentEditorDocContent,
  type AiReviewQueueState,
} from "@/ui/practice/services/aiStudioService";
import type { ExamApp } from "@/app";
import type { Question } from "@/core/types";
import type { KernelApiClient } from "@/kernel/client";

describe("AI 出题工作台队列与审批服务 (aiStudioService)", () => {
  const fakeQuestion: Question = {
    id: "q-ai-1",
    type: "single",
    stem: "AI 生成测试题目",
    options: ["A", "B"],
    answer: "A",
    status: "published",
    origin: "imported",
    hash: "h-ai-1",
  };

  it("1. persistReviewQueue 与 restoreReviewQueue：队列持久化保存与恢复", async () => {
    let savedState: any = null;
    const mockApp = {
      saveAux: vi.fn().mockImplementation((key, val) => {
        savedState = val;
        return Promise.resolve();
      }),
      loadAux: vi.fn().mockImplementation(() => Promise.resolve(savedState)),
    } as unknown as ExamApp;

    const state: AiReviewQueueState = {
      queue: [fakeQuestion],
      rejected: [{ index: 0, reason: "选项太少" }],
      duplicates: 1,
      bankId: "bank-1",
      material: "素材文章内容",
      options: null,
    };

    await persistReviewQueue(mockApp, state);
    expect(mockApp.saveAux).toHaveBeenCalledWith("ai/review-queue", state);

    const restored = await restoreReviewQueue(mockApp);
    expect(restored).not.toBeNull();
    expect(restored?.queue).toHaveLength(1);
    expect(restored?.bankId).toBe("bank-1");
  });

  it("2. recordGenerationUsage：记录 token 用量并返回统计", async () => {
    const mockApp = {
      recordAiUsage: vi.fn().mockResolvedValue(undefined),
      aiUsage: vi.fn().mockResolvedValue({ totalTokens: 1500, totalCalls: 3 }),
    } as unknown as ExamApp;

    const total = await recordGenerationUsage(mockApp, "siyuan", 500, 1);
    expect(mockApp.recordAiUsage).toHaveBeenCalledWith("siyuan", 500, 1);
    expect(total?.totalTokens).toBe(1500);
    expect(total?.totalCalls).toBe(3);
  });

  it("3. approveSingleQuestion 与 approveBatchQuestions：单题与批量审批入库", async () => {
    const writtenIds: string[] = [];
    const mockApp = {
      writeManualQuestion: vi.fn().mockImplementation((_b, q) => {
        if (q.id === "q-fail") throw new Error("写入失败");
        writtenIds.push(q.id);
        return Promise.resolve();
      }),
    } as unknown as ExamApp;

    // 1. 单题审批
    await approveSingleQuestion(mockApp, "bank-1", fakeQuestion);
    expect(writtenIds).toContain("q-ai-1");

    // 2. 批量审批（含失败容错隔离）
    const qSuccess = { ...fakeQuestion, id: "q-ok" };
    const qFail = { ...fakeQuestion, id: "q-fail" };

    const batchRes = await approveBatchQuestions(mockApp, "bank-1", [qSuccess, qFail]);
    expect(batchRes.approved).toHaveLength(1);
    expect(batchRes.approved[0].id).toBe("q-ok");
    expect(batchRes.failed).toHaveLength(1);
    expect(batchRes.failed[0].id).toBe("q-fail");
  });

  it("4. fetchCurrentEditorDocContent：从活动文档提取材料", async () => {
    const mockClient = {
      exportDocMarkdown: vi.fn().mockResolvedValue({
        title: "备考笔记",
        content: "# 备考内容\n详细知识点说明...",
      }),
    } as unknown as KernelApiClient;

    // 1. 有有效 rootId
    const res = await fetchCurrentEditorDocContent(mockClient, "doc-123");
    expect(res).not.toBeNull();
    expect(res?.title).toBe("备考笔记");
    expect(res?.content).toContain("详细知识点");

    // 2. 无 rootId
    const emptyRes = await fetchCurrentEditorDocContent(mockClient, "");
    expect(emptyRes).toBeNull();
  });
});
