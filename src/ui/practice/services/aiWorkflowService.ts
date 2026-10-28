import type { KernelApiClient } from "@/kernel/client";
import type { Question } from "@/core/types";
import { questionFingerprint, type AiTaskContext } from "@/ai/task";

export interface AiChannelConfig {
  endpoint?: string;
  apiKey?: string;
  model?: string;
}

/**
 * 构造统一 AI 调用通道（优先 OpenAI 兼容端点，回退思源内置 AI）
 */
export async function createAiChannel(client: KernelApiClient, config: AiChannelConfig) {
  const { SiyuanAiChannel, OpenAiChannel } = await import("@/ai/client");
  const endpoint = String(config.endpoint ?? "").trim();
  const apiKey = String(config.apiKey ?? "").trim();
  const model = String(config.model ?? "gpt-4o-mini").trim();

  if (endpoint && apiKey) {
    return new OpenAiChannel({ endpoint, apiKey, model }, (u, i) => fetch(u, i));
  }
  return new SiyuanAiChannel(client);
}

/**
 * AI 任务信封状态格式化行
 */
export function formatEnvStatusLine(
  env: { status: string; summary: string; error?: string },
  t: (k: string) => string,
): string {
  const line =
    env.status === "ok" ? t("ai.emptyResponse") : env.status === "unsupported" ? t("ai.taskUnsupported") : t("ai.taskFailed");
  return line + (env.error ? ": " + env.error : "");
}

/**
 * 同步计算下一层提示阶段（L1 -> L2 -> L3/揭示）
 */
export function nextHintStepSync(
  shown: 0 | 1 | 2 | 3,
  optionCount: number,
): { kind: "hint"; level: 1 | 2 | 3 } | { kind: "reveal" } {
  if (shown === 0) return { kind: "hint", level: 1 };
  if (shown === 1) return { kind: "hint", level: 2 };
  if (shown === 2 && optionCount <= 2) return { kind: "reveal" };
  if (shown === 2) return { kind: "hint", level: 3 };
  return { kind: "reveal" };
}

/**
 * 计算提示按钮动态文案
 */
export function getHintButtonLabel(
  shown: 0 | 1 | 2 | 3,
  optionCount: number,
  t: (k: string) => string,
): string {
  const step = nextHintStepSync(shown, optionCount);
  if (step.kind === "reveal") return t("explain.hintTop");
  if (step.level === 1) return t("explain.hint");
  return t("explain.hintNext").replace("{n}", String(step.level));
}

export interface ExplainRequestOptions {
  q: Question;
  mode: "explain" | "hint" | "socratic";
  learnerAnswer: string | null;
  sessionId: string;
  client: KernelApiClient;
  aiConfig: AiChannelConfig;
}

/**
 * 执行 AI 试题详解或苏格拉底导学
 */
export async function executeAiExplain(options: ExplainRequestOptions) {
  const { q, mode, learnerAnswer, sessionId, client, aiConfig } = options;
  const { buildExplainMessages } = await import("@/ai/explain");
  const { AiTaskRunner } = await import("@/ai/task");

  const reqCtx: AiTaskContext = {
    templateId: mode === "explain" ? "practice.explain" : mode === "hint" ? "practice.hint" : "practice.socratic",
    templateVersion: 2,
    qid: q.id,
    questionRevision: questionFingerprint(q),
    learnerAnswer,
    submitted: true,
    mode: "practice",
    sessionId,
  };

  const ch = await createAiChannel(client, aiConfig);
  const messages = buildExplainMessages(q, learnerAnswer, mode);
  const runner = new AiTaskRunner(ch);
  const env = await runner.run(reqCtx, messages);

  return { env, ch, messages, reqCtx };
}

export interface HintRequestOptions {
  q: Question;
  learnerAnswer: string | null;
  submitted: boolean;
  sessionId: string;
  shownLevel: 0 | 1 | 2 | 3;
  shownTexts: string[];
  client: KernelApiClient;
  aiConfig: AiChannelConfig;
}

/**
 * 执行一次一层递进式 AI 试题提示申请（含泄露检测）
 */
export async function executeAiHint(options: HintRequestOptions) {
  const { q, learnerAnswer, submitted, sessionId, shownLevel, shownTexts, client, aiConfig } = options;
  const step = nextHintStepSync(shownLevel, q.options.length);
  if (step.kind === "reveal") {
    return { kind: "reveal" as const, step };
  }

  const { buildHintMessages, findHintLeaks } = await import("@/ai/hint");
  const { AiTaskRunner } = await import("@/ai/task");

  const reqCtx: AiTaskContext = {
    templateId: "practice.hint",
    templateVersion: 2,
    qid: q.id,
    questionRevision: questionFingerprint(q),
    learnerAnswer,
    submitted,
    mode: "practice",
    sessionId,
  };

  const ch = await createAiChannel(client, aiConfig);
  const messages = buildHintMessages(q, learnerAnswer, step.level, shownTexts);
  const env = await new AiTaskRunner(ch).run(reqCtx, messages);

  let leakReasons = "";
  if (env.status === "ok" && env.data.text && !submitted) {
    const leaks = findHintLeaks(env.data.text, q);
    if (leaks.length > 0) {
      leakReasons = leaks.map((l) => l.detail).join("、");
    }
  }

  return {
    kind: "hint" as const,
    step,
    env,
    ch,
    messages,
    reqCtx,
    leakReasons,
  };
}

export interface FollowUpRequestOptions {
  q: Question;
  learnerAnswer: string | null;
  submitted: boolean;
  sessionId: string;
  history: import("@/ai/client").AiMessage[];
  prompt: string;
  client: KernelApiClient;
  aiConfig: AiChannelConfig;
}

/**
 * 执行 AI 互动追问与多轮对话
 */
export async function executeAiFollowUp(options: FollowUpRequestOptions) {
  const { q, learnerAnswer, submitted, sessionId, history, prompt, client, aiConfig } = options;
  const { continueExplainMessages } = await import("@/ai/explain");
  const { AiTaskRunner } = await import("@/ai/task");

  const reqCtx: AiTaskContext = {
    templateId: "practice.socratic",
    templateVersion: 2,
    qid: q.id,
    questionRevision: questionFingerprint(q),
    learnerAnswer,
    submitted,
    mode: "practice",
    sessionId,
  };

  const ch = await createAiChannel(client, aiConfig);
  const messages = continueExplainMessages(history, prompt.trim());
  const runner = new AiTaskRunner(ch);
  const env = await runner.run(reqCtx, messages);

  return { env, ch, messages, reqCtx };
}

/**
 * 将 AI 讲解内容持久化追加保存至思源试题原文文档块中
 */
export async function saveExplainToQuestionDoc(
  app: any,
  q: Question,
  body: string,
  showMessage: (msg: string, time?: number, type?: string) => void,
  t: (k: string) => string,
): Promise<{ success: boolean; error?: string }> {
  if (!app || !q || !body.trim()) return { success: false };

  try {
    await app.appendQuestionNote(q.id, q.blockId, body.trim(), "ai-explain");
    showMessage(t("explain.saved"), 2400, "info");
    return { success: true };
  } catch (e) {
    const error = String(e instanceof Error ? e.message : e);
    return { success: false, error };
  }
}

/**
 * 将当前题目单题转卡加入思源闪卡队列
 */
export async function convertSingleQuestionToCard(
  app: any,
  bankId: string,
  bankName: string,
  q: Question,
  t: (k: string) => string,
): Promise<{ resultText: string; isError: boolean }> {
  if (!app || !q) return { resultText: "", isError: false };

  try {
    const n = await app.convertToCards(bankId, bankName, [q]);
    return {
      resultText: n ? t("memory.toCardDone") : t("memory.toCardMissing"),
      isError: false,
    };
  } catch (e) {
    return {
      resultText: String(e instanceof Error ? e.message : e),
      isError: true,
    };
  }
}

/**
 * 格式化多层渐进式提示展示文本（第 N 层提示：...）
 */
export function formatHintLayersDisplay(
  texts: string[],
  t: (k: string) => string,
): string {
  return texts
    .map((s, i) => `${t("explain.hintLayer").replace("{n}", String(i + 1))}：${s}`)
    .join("\n");
}

/**
 * 格式化追问答复交互历史文本
 */
export function formatFollowUpInteractionText(
  currentText: string,
  prompt: string,
  reply: string,
  followUpTag: string,
): string {
  const prefix = currentText.endsWith(reply) ? currentText : (currentText ? currentText + "\n\n" : "");
  return prefix + followUpTag + prompt + "\n" + reply;
}


