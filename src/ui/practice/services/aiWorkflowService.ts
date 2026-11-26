import type { KernelApiClient } from "@/kernel/client";
import type { Question } from "@/core/types";
import { questionFingerprint, type AiTaskContext, type ExplainTemplateId } from "@/ai/task";

export interface AiChannelConfig {
  endpoint?: string;
  apiKey?: string;
  model?: string;
}

/**
 * 构造统一 AI 调用通道（优先 OpenAI 兼容端点 / 统一 AI 网关，回退思源内置 AI）
 */
export async function createAiChannel(client: KernelApiClient, config: AiChannelConfig, source = "考试") {
  const { SiyuanAiChannel, OpenAiChannel, LvGatewayAiChannel } = await import("@/ai/client");
  const { lvAi } = await import("@/libs/lv-notice-kit");

  const endpoint = String(config.endpoint ?? "").trim();
  const apiKey = String(config.apiKey ?? "").trim();
  const model = String(config.model ?? "").trim();

  // 1. 若本插件已配置专属端点与 Key，同步更新至统一网关并使用
  if (endpoint && apiKey) {
    try {
      lvAi.setConfig({ endpoint, apiKey, model: model || "gpt-4o-mini" });
    } catch { /* ignore */ }
    return new OpenAiChannel({ endpoint, apiKey, model: model || "gpt-4o-mini" }, (u, i) => fetch(u, i));
  }

  // 2. 统一 AI 网关 (lvAi)：若全生态已存在共享 Key 且当前无客户端专属代理，免填 Key 自动继承复用
  const shared = lvAi.getConfig();
  const hasSharedSecret = Boolean(
    shared?.apiKey ||
    shared?.hasSecret ||
    (typeof window !== "undefined" && (window as { hasTier2SecretConfigured?: () => boolean }).hasTier2SecretConfigured?.()),
  );
  if (hasSharedSecret && !client?.aiChat) {
    return new LvGatewayAiChannel(source);
  }

  // 3. 回退思源内置 AI 代理通道
  return new SiyuanAiChannel(client);
}

/**
 * AI 任务失败后的解决方案指引（真机反馈：只报错不给路径，用户无从下手）。
 * 识别超时/网络/鉴权类错误并附上可操作的排查与替代通道建议。
 */
export function appendAiFailureGuidance(message: string): string {
  const m = message || "";
  const timeout = /timeout|超时/i.test(m);
  const network = /ECONN|network|fetch failed|failed to fetch|connection reset|socket/i.test(m);
  if (timeout || network) {
    return m +
      "\n\n【解决方案】思源 AI 通道响应异常：" +
      "\n① 打开思源 设置 →【AI 服务】，确认已启用并配置可用的模型与 API Key；" +
      "\n② 或在 小驴考试 → 设置 → AI 配置 填写专属端点 + API Key（直连更快更稳，绕开思源代理）；" +
      "\n③ 使用全生态统一 AI 网关时，确认网关 Key 有效且有余额；" +
      "\n④ 网络波动导致的超时，可直接重新点击该按钮再试一次（现已支持 120 秒长超时与自动重试）。";
  }
  if (/401|403|未授权|Unauthorized|invalid[ _-]?(api[ _-]?)?key|api[ _-]?key/i.test(m)) {
    return m +
      "\n\n【解决方案】AI 鉴权失败：检查 API Key 是否有效、是否有额度；" +
      "思源内置 AI 需在 设置 →【AI 服务】配置；插件专属端点在 小驴考试 → 设置 → AI 配置 中修改。";
  }
  return m;
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
  return appendAiFailureGuidance(line + (env.error ? ": " + env.error : ""));
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

import type { ExplainMode } from "@/ai/explain";

export interface ExplainRequestOptions {
  q: Question;
  mode: ExplainMode;
  learnerAnswer: string | null;
  sessionId: string;
  client: KernelApiClient;
  aiConfig: AiChannelConfig;
  profilePrefix?: string;
  submitted?: boolean;
  signal?: AbortSignal;
}

/**
 * 执行 AI 试题详解、双环解题、STORM 破题或苏格拉底导学
 */
export async function executeAiExplain(options: ExplainRequestOptions) {
  const { q, mode, learnerAnswer, sessionId, client, aiConfig, profilePrefix, submitted, signal } = options;
  const { buildExplainMessages } = await import("@/ai/explain");
  const { AiTaskRunner } = await import("@/ai/task");

  const templateMap: Record<ExplainMode, ExplainTemplateId> = {
    explain: "practice.explain",
    "dual-loop": "practice.dual-loop",
    storm: "practice.storm",
    hint: "practice.hint",
    socratic: "practice.socratic",
  };

  const isSubmitted = submitted ?? (mode === "socratic" || mode === "hint" ? false : true);

  const reqCtx: AiTaskContext = {
    templateId: templateMap[mode] || "practice.explain",
    templateVersion: 2,
    qid: q.id,
    questionRevision: questionFingerprint(q),
    learnerAnswer,
    submitted: isSubmitted,
    mode: "practice",
    sessionId,
  };

  const ch = await createAiChannel(client, aiConfig, "考试");
  const messages = buildExplainMessages(q, learnerAnswer, mode, { profilePrefix });
  const runner = new AiTaskRunner(ch);
  const env = await runner.run(reqCtx, messages, signal);

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
  signal?: AbortSignal;
}

/**
 * 执行一次一层递进式 AI 试题提示申请（含泄露检测）
 */
export async function executeAiHint(options: HintRequestOptions) {
  const { q, learnerAnswer, submitted, sessionId, shownLevel, shownTexts, client, aiConfig, signal } = options;
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

  const ch = await createAiChannel(client, aiConfig, "考试");
  const messages = buildHintMessages(q, learnerAnswer, step.level, shownTexts);
  const env = await new AiTaskRunner(ch).run(reqCtx, messages, signal);

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
  signal?: AbortSignal;
}

/**
 * 执行 AI 互动追问与多轮对话
 */
export async function executeAiFollowUp(options: FollowUpRequestOptions) {
  const { q, learnerAnswer, submitted, sessionId, history, prompt, client, aiConfig, signal } = options;
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
  const env = await runner.run(reqCtx, messages, signal);

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

/**
 * 显式揭示被拦截的泄露提示并推进层级与文本展示
 */
export function applyLeakedHintToState(
  qId: string,
  leakPending: { level: 1 | 2 | 3; text: string; reasons: string },
  hintLevels: Map<string, 0 | 1 | 2 | 3>,
  hintTexts: Map<string, string[]>,
  t: (k: string) => string,
): { explainText: string; helpMode: "reveal" } {
  hintLevels.set(qId, leakPending.level);
  const updatedTexts = [...(hintTexts.get(qId) ?? []), leakPending.text];
  hintTexts.set(qId, updatedTexts);
  return {
    explainText: formatHintLayersDisplay(updatedTexts, t),
    helpMode: "reveal",
  };
}

export interface AiFollowUpResult {
  reply?: string;
  updatedMessages?: import("@/ai/client").AiMessage[];
  newExplainText?: string;
  env?: any;
  error?: string;
  chId?: string;
  tokens?: number;
}

/**
 * 完整处理 AI 多轮追问交互逻辑并更新对话历史与文本
 */
export async function executeAiFollowUpWorkflow(options: {
  q: Question;
  learnerAnswer: string | null;
  submitted: boolean;
  sessionId: string;
  history: import("@/ai/client").AiMessage[];
  prompt: string;
  client: KernelApiClient;
  aiConfig: AiChannelConfig;
  currentExplainText: string;
  t: (k: string) => string;
  signal?: AbortSignal;
}): Promise<AiFollowUpResult> {
  const { q, learnerAnswer, submitted, sessionId, history, prompt, client, aiConfig, currentExplainText, t, signal } = options;
  const res = await executeAiFollowUp({
    q,
    learnerAnswer,
    submitted,
    sessionId,
    history,
    prompt,
    client,
    aiConfig,
    signal,
  });

  if (res.env.status === "ok" && res.env.data.text) {
    const reply = res.env.data.text;
    const updatedMessages = [...res.messages, { role: "assistant" as const, content: reply }];
    const newExplainText = formatFollowUpInteractionText(currentExplainText, prompt, reply, t("ai.followupTag"));
    return {
      reply,
      updatedMessages,
      newExplainText,
      env: res.env,
      chId: res.ch.id,
      tokens: res.env.tokens,
    };
  }

  const errorLine = (currentExplainText ? currentExplainText + "\n\n" : "") + formatEnvStatusLine(res.env, t);
  return {
    error: errorLine,
    env: res.env,
  };
}

/**
 * 导学与启发异步请求调度器（epoch/token 状态守卫）
 *
 * 核心设计：
 * 彻底消除异步竞态（Race Conditions）：
 * 1. 发起请求时递增 epoch 生成唯一 token；
 * 2. 关闭 (closeExplain)、切题 (next/previous)、生命周期重置 (restoreControls) 时递增 epoch；
 * 3. 异步 Promise resolve / catch / finally 返回时，必须严格满足双重校验：
 *    - token === currentEpoch (当前请求依然是最新的，未被后续请求或关闭动作作废)
 *    - currentQid === requestQid (当前题目依然处于发起该请求的同一道题目)
 * 杜绝旧题目晚返回的解析内容覆盖新题，杜绝旧 finally 把新题的 busy 状态提前清零。
 */
export class ExplainRequestCoordinator {
  private epoch = 0;
  private activeQid = "";

  get currentEpoch(): number {
    return this.epoch;
  }

  get currentQid(): string {
    return this.activeQid;
  }

  /**
   * 发起请求：推进 epoch 并记录当前发起的题目 ID，返回对应的 request token
   */
  startRequest(qid: string): number {
    this.activeQid = qid;
    return ++this.epoch;
  }

  /**
   * 使在途请求彻底失效：递增 epoch 并清空 activeQid
   */
  invalidate(): number {
    this.activeQid = "";
    return ++this.epoch;
  }

  /**
   * 核验证明：token 与当前题目是否依然合法有效
   */
  isCurrent(token: number, currentQid: string | null | undefined, requestQid: string): boolean {
    return token === this.epoch && Boolean(currentQid) && currentQid === requestQid;
  }
}




