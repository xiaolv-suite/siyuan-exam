import { describe, it, expect, vi } from "vitest";
import {
  createAiChannel,
  formatEnvStatusLine,
  nextHintStepSync,
  getHintButtonLabel,
  executeAiExplain,
  executeAiHint,
  executeAiFollowUp,
} from "@/ui/practice/services/aiWorkflowService";
import type { KernelApiClient } from "@/kernel/client";
import type { Question } from "@/core/types";

describe("AI 互动与试题导学服务 (aiWorkflowService)", () => {
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
});
