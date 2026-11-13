import { describe, it, expect, vi } from "vitest";
import {
  createAiChannel,
  formatEnvStatusLine,
  nextHintStepSync,
  getHintButtonLabel,
  executeAiExplain,
  executeAiHint,
  executeAiFollowUp,
  saveExplainToQuestionDoc,
  convertSingleQuestionToCard,
  formatHintLayersDisplay,
  formatFollowUpInteractionText,
  applyLeakedHintToState,
  executeAiFollowUpWorkflow,
} from "@/ui/practice/services/aiWorkflowService";
import type { KernelApiClient } from "@/kernel/client";
import type { Question } from "@/core/types";

describe("AI 互动与试题导学服务 (aiWorkflowService)", () => {
  const fakeQuestion: Question = {
    id: "q-101",
    type: "single",
    stem: "关于测试题目的题干内容",
    options: ["A选项", "B选项", "C选项", "D选项"],
    answer: "A",
    status: "published",
    origin: "manual",
    hash: "h-101",
  };

  it("1. formatEnvStatusLine：格式化信封状态与错误文本", () => {
    const t = (k: string) => `[${k}]`;

    // ok 状态
    expect(formatEnvStatusLine({ status: "ok", summary: "完成" }, t)).toBe("[ai.emptyResponse]");
    // unsupported 状态
    expect(formatEnvStatusLine({ status: "unsupported", summary: "不支持", error: "模型不可用" }, t)).toBe("[ai.taskUnsupported]: 模型不可用");
    // error 状态
    expect(formatEnvStatusLine({ status: "error", summary: "失败", error: "429 限流" }, t)).toBe("[ai.taskFailed]: 429 限流");
  });

  it("2. nextHintStepSync 与 getHintButtonLabel：阶梯式提示与按钮文案", () => {
    const t = (k: string) => `[${k}]`;

    // 4 选项题目：L1 -> L2 -> L3 -> reveal
    expect(nextHintStepSync(0, 4)).toEqual({ kind: "hint", level: 1 });
    expect(nextHintStepSync(1, 4)).toEqual({ kind: "hint", level: 2 });
    expect(nextHintStepSync(2, 4)).toEqual({ kind: "hint", level: 3 });
    expect(nextHintStepSync(3, 4)).toEqual({ kind: "reveal" });

    // 2 选项题目（判断题）：L2 之后直接转 reveal（防止三层提示泄题）
    expect(nextHintStepSync(2, 2)).toEqual({ kind: "reveal" });

    // 按钮文案
    expect(getHintButtonLabel(0, 4, t)).toBe("[explain.hint]");
    expect(getHintButtonLabel(1, 4, t)).toBe("[explain.hintNext]");
    expect(getHintButtonLabel(3, 4, t)).toBe("[explain.hintTop]");
  });

  it("3. createAiChannel：通道分流策略", async () => {
    const mockClient = {} as unknown as KernelApiClient;

    // 1. 无有效 key -> SiyuanAiChannel
    const ch1 = await createAiChannel(mockClient, {});
    expect(ch1.id).toBe("siyuan");

    // 2. 有 endpoint + key -> OpenAiChannel
    const ch2 = await createAiChannel(mockClient, {
      endpoint: "https://api.openai.com/v1",
      apiKey: "sk-123",
      model: "gpt-4o",
    });
    expect(ch2.id).toBe("openai");
  });

  it("4. executeAiExplain 与 executeAiHint 与 executeAiFollowUp 任务流转", async () => {
    const mockClient = {
      aiChat: vi.fn().mockResolvedValue({
        status: "ok",
        content: "这是 AI 生成的试题讲解",
      }),
    } as unknown as KernelApiClient;

    // 1. 试题讲解
    const explainRes = await executeAiExplain({
      q: fakeQuestion,
      mode: "explain",
      learnerAnswer: "B",
      sessionId: "s-1",
      client: mockClient,
      aiConfig: {},
    });
    expect(explainRes.reqCtx.qid).toBe("q-101");
    expect(explainRes.messages.length).toBeGreaterThan(0);

    // 2. 一次一层提示
    const hintRes = await executeAiHint({
      q: fakeQuestion,
      learnerAnswer: null,
      submitted: false,
      sessionId: "s-1",
      shownLevel: 0,
      shownTexts: [],
      client: mockClient,
      aiConfig: {},
    });
    expect(hintRes.kind).toBe("hint");
    if (hintRes.kind === "hint") {
      expect(hintRes.step.level).toBe(1);
    }

    // 3. 追问
    const followRes = await executeAiFollowUp({
      q: fakeQuestion,
      learnerAnswer: "A",
      submitted: true,
      sessionId: "s-1",
      history: [{ role: "user", content: "前置问题" }],
      prompt: "为什么选 A？",
      client: mockClient,
      aiConfig: {},
    });
    expect(followRes.messages.length).toBeGreaterThanOrEqual(2);
  });

  it("5. saveExplainToQuestionDoc：保存讲解笔记到思源文档块", async () => {
    const t = (k: string) => `[${k}]`;
    const msgs: string[] = [];
    const showMessage = (m: string) => msgs.push(m);

    const mockApp = {
      appendQuestionNote: vi.fn().mockResolvedValue(undefined),
    };

    const res = await saveExplainToQuestionDoc(
      mockApp,
      fakeQuestion,
      "这是完整的 AI 试题深度解析内容",
      showMessage,
      t,
    );

    expect(res.success).toBe(true);
    expect(mockApp.appendQuestionNote).toHaveBeenCalledWith(
      "q-101",
      undefined,
      "这是完整的 AI 试题深度解析内容",
      "ai-explain",
    );
    expect(msgs).toContain("[explain.saved]");
  });

  it("6. convertSingleQuestionToCard：单题闪卡转卡调用", async () => {
    const t = (k: string) => `[${k}]`;
    const mockApp = {
      convertToCards: vi.fn().mockResolvedValue(1),
    };

    const res = await convertSingleQuestionToCard(mockApp, "bank-1", "题库", fakeQuestion, t);
    expect(res.isError).toBe(false);
    expect(res.resultText).toBe("[memory.toCardDone]");
    expect(mockApp.convertToCards).toHaveBeenCalledWith("bank-1", "题库", [fakeQuestion]);
  });

  it("7. formatHintLayersDisplay：多层递进提示排版", () => {
    const t = (k: string) => `[${k}]`;
    const res = formatHintLayersDisplay(["第一层提示", "第二层提示"], t);
    expect(res).toContain("第一层提示");
    expect(res).toContain("第二层提示");
  });

  it("8. formatFollowUpInteractionText：追问历史记录排版", () => {
    const res = formatFollowUpInteractionText("基础讲解", "请问这一步依据？", "依据是定理1", "【追问】");
    expect(res).toContain("基础讲解");
    expect(res).toContain("【追问】请问这一步依据？\n依据是定理1");
  });

  it("9. applyLeakedHintToState：显式揭示被拦截的提示并更新层级与状态", () => {
    const t = (k: string) => `[${k}]`;
    const hintLevels = new Map<string, 0 | 1 | 2 | 3>();
    const hintTexts = new Map<string, string[]>();

    const res = applyLeakedHintToState(
      "q-101",
      { level: 2, text: "第二层被拦截的提示", reasons: "包含关键词" },
      hintLevels,
      hintTexts,
      t,
    );

    expect(res.helpMode).toBe("reveal");
    expect(res.explainText).toContain("第二层被拦截的提示");
    expect(hintLevels.get("q-101")).toBe(2);
    expect(hintTexts.get("q-101")).toEqual(["第二层被拦截的提示"]);
  });

  it("10. executeAiFollowUpWorkflow：多轮追问交互流程", async () => {
    const t = (k: string) => `[${k}]`;
    const mockClient = {
      aiChat: vi.fn().mockResolvedValue({
        status: "ok",
        content: "依据是勾股定理 a^2+b^2=c^2。",
      }),
    } as unknown as KernelApiClient;

    const res = await executeAiFollowUpWorkflow({
      q: fakeQuestion,
      learnerAnswer: "A",
      submitted: true,
      sessionId: "s-1",
      history: [{ role: "user", content: "请问这道题怎么做？" }],
      prompt: "定理依据是什么？",
      client: mockClient,
      aiConfig: {},
      currentExplainText: "基础讲解文本",
      t,
    });

    expect(res.reply).toBe("依据是勾股定理 a^2+b^2=c^2。");
    expect(res.updatedMessages).toHaveLength(3);
    expect(res.newExplainText).toContain("基础讲解文本");
    expect(res.newExplainText).toContain("依据是勾股定理 a^2+b^2=c^2。");
  });
});
