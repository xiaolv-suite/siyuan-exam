import { describe, it, expect, vi } from "vitest";
import {
  persistReviewQueue,
  restoreReviewQueue,
  recordGenerationUsage,
  approveSingleQuestion,
  approveBatchQuestions,
  fetchCurrentEditorDocContent,
  validateAndApplyCandidateEdit,
  verifyQueueBankMatch,
  ensureAiEndpointConsent,
  buildGenOptionsSnapshot,
  createAiCandidateEditDraft,
  executeRegenSingleCandidate,
  extractAiSourceFromEditor,
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

  it("5. validateAndApplyCandidateEdit 与 verifyQueueBankMatch：编辑校验与题库防错写", () => {
    const t = (k: string) => `[${k}]`;

    // 1. 合法编辑
    const editRes = validateAndApplyCandidateEdit(fakeQuestion, {
      stem: "修改后的题干？",
      options: ["A. 1", "B. 2"],
      answer: "B",
      analysis: "修改后的解析",
    });
    expect(editRes.valid).toBe(true);
    if (editRes.valid) {
      expect(editRes.question.stem).toBe("修改后的题干？");
      expect(editRes.question.answer).toBe("B");
    }

    // 2. 非法编辑（题干为空）
    const badRes = validateAndApplyCandidateEdit(fakeQuestion, {
      stem: "   ",
      options: ["A. 1", "B. 2"],
      answer: "A",
      analysis: "",
    });
    expect(badRes.valid).toBe(false);

    // 3. 题库一致与不一致对账
    expect(verifyQueueBankMatch("bank-1", "bank-1", t).matched).toBe(true);
    const mismatch = verifyQueueBankMatch("bank-1", "bank-2", t);
    expect(mismatch.matched).toBe(false);
    expect(mismatch.errorMessage).toBe("[ai.queueWrongBank]");
  });

  it("6. ensureAiEndpointConsent：端点隐私授权与绑定", async () => {
    const t = (k: string) => `[${k}]`;
    const storage = new Map<string, string>();
    const readLocal = (k: string) => storage.get(k) ?? null;
    const writeLocal = (k: string, v: string) => { storage.set(k, v); };

    // 1. 首次调用弹出确认，用户同意
    const confirmAgree = vi.fn().mockResolvedValue(true);
    const ok = await ensureAiEndpointConsent("https://api.openai.com/v1", confirmAgree, readLocal, writeLocal, t);
    expect(ok).toBe(true);
    expect(confirmAgree).toHaveBeenCalled();
    expect(storage.get("lv-exam-ai-consent")).toContain("https://api.openai.com/v1");

    // 2. 相同端点再次调用不弹窗
    const confirmIgnore = vi.fn().mockResolvedValue(true);
    const ok2 = await ensureAiEndpointConsent("https://api.openai.com/v1", confirmIgnore, readLocal, writeLocal, t);
    expect(ok2).toBe(true);
    expect(confirmIgnore).not.toHaveBeenCalled();

    // 3. 切换端点重新弹窗，用户拒绝
    const confirmReject = vi.fn().mockResolvedValue(false);
    const ok3 = await ensureAiEndpointConsent("https://api.deepseek.com", confirmReject, readLocal, writeLocal, t);
    expect(ok3).toBe(false);
    expect(confirmReject).toHaveBeenCalled();
  });

  it("7. buildGenOptionsSnapshot：组装出题参数快照", () => {
    const opts = buildGenOptionsSnapshot({
      count: 10,
      difficulty: "hard",
      kp: "高中数学",
      sourceTitle: "课本第3章",
      preset: "default",
      quality: "standard",
      pluginCustomHint: "避免多重否定句",
      userCustomHint: "多出综合分析题",
      locator: { quote: "核心概念引文" },
      profilePrefix: "【学习者画像】",
    });

    expect(opts.count).toBe(10);
    expect(opts.difficulty).toBe("hard");
    expect(opts.customHint).toContain("避免多重否定句\n多出综合分析题");
    expect(opts.locator?.quote).toBe("核心概念引文");
    expect(opts.profilePrefix).toBe("【学习者画像】");
  });

  it("8. createAiCandidateEditDraft 与 executeRegenSingleCandidate：草稿构造与单题重出", async () => {
    // 1. 草稿构造
    const draft = createAiCandidateEditDraft(fakeQuestion);
    expect(draft.stem).toBe("AI 生成测试题目");
    expect(draft.options).toEqual(["A", "B"]);
    expect(draft.answer).toBe("A");

    // 2. 单题重出
    const mockClient = {
      aiChat: vi.fn().mockResolvedValue({
        status: "ok",
        content: JSON.stringify([
          {
            stem: "新重出的单选题",
            options: ["A. 1", "B. 2"],
            answer: "B",
          },
        ]),
      }),
    } as unknown as KernelApiClient;

    const res = await executeRegenSingleCandidate({
      client: mockClient,
      aiConfig: {},
      material: "测试材料",
      genOptions: { types: ["single"], count: 1, difficulty: "medium", kp: "集合", sourceTitle: "测试", preset: "default", quality: "standard" },
      targetQuestion: fakeQuestion,
    });

    expect(res.channelId).toBe("siyuan");
    expect(res.approxTokens).toBeGreaterThanOrEqual(0);
  });

  it("9. extractAiSourceFromEditor：从活动编辑器提取内容与格式化出处", async () => {
    const t = (k: string) => (k === "ai.sourceFromDocument" ? "来自文档：{title}" : `[${k}]`);
    const mockClient = {
      exportDocMarkdown: vi.fn().mockResolvedValue({
        title: "高三一轮复习",
        content: "# 正文内容",
      }),
    } as unknown as KernelApiClient;

    const mockPlugin = {
      app: {
        ui: {
          currentEditor: {
            protyle: { block: { rootID: "root-doc-12345" } },
          },
        },
      },
    };

    const res = await extractAiSourceFromEditor(mockPlugin, mockClient, t);
    expect(res).not.toBeNull();
    expect(res?.content).toBe("# 正文内容");
    expect(res?.suggestedKp).toBe("高三一轮复习");
    expect(res?.sourceOrigin).toContain("高三一轮复习");
    expect(res?.toast).toContain("高三一轮复习");
  });
});
