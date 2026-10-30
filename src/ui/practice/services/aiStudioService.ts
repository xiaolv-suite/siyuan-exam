import type { Question } from "@/core/types";
import type { ExamApp } from "@/app";
import type { KernelApiClient } from "@/kernel/client";
import type { GenOptions, GenIssue } from "@/ai/gen";
import { generate, repairIssues } from "@/ai/gen";
import { CountingChannel } from "@/ai/counting";
import { createAiChannel, type AiChannelConfig } from "./aiWorkflowService";
import { normalizeAnswer, questionHash } from "@/core/answer";
import { validate } from "@/importer/pipeline";
import { escapeHtml } from "@/libs/sanitize";
import { redactUrlForDisplay } from "@/core/urlRedaction";

export const REVIEW_QUEUE_KEY = "ai/review-queue";

export interface AiReviewQueueState {
  queue: Question[];
  rejected: Array<{ index: number; reason: string; raw?: string }>;
  duplicates: number;
  bankId: string;
  material?: string;
  options?: GenOptions | null;
}

/**
 * 持久化 AI 审核队列状态
 */
export async function persistReviewQueue(app: ExamApp, state: AiReviewQueueState): Promise<void> {
  await app.saveAux(REVIEW_QUEUE_KEY, state);
}

/**
 * 恢复上次未审批完的 AI 候选队列
 */
export async function restoreReviewQueue(app: ExamApp): Promise<AiReviewQueueState | null> {
  try {
    const v = await app.loadAux<AiReviewQueueState>(REVIEW_QUEUE_KEY);
    if (v?.queue?.length || v?.rejected?.length) return v;
    return null;
  } catch {
    return null;
  }
}

/**
 * 记录生成用量并刷新用量总计
 */
export async function recordGenerationUsage(
  app: ExamApp,
  channelId: string,
  tokens: number,
  calls: number,
): Promise<{ totalTokens: number; totalCalls: number } | null> {
  await app.recordAiUsage(channelId, tokens, calls);
  return app.aiUsage();
}

/**
 * 执行批量生成题目任务
 */
export async function executeAiQuestionGeneration(options: {
  client: KernelApiClient;
  aiConfig: AiChannelConfig;
  material: string;
  genOptions: GenOptions;
  signal?: { aborted: boolean };
}) {
  const { client, aiConfig, material, genOptions, signal } = options;
  const rawChannel = await createAiChannel(client, aiConfig);
  const counting = new CountingChannel(rawChannel);
  const result = await generate(counting, material, { ...genOptions, signal });

  return {
    pending: result.pending,
    rejected: result.rejected,
    duplicates: result.duplicates,
    approxTokens: counting.approxTokens,
    calls: counting.calls,
    channelId: counting.id,
  };
}

/**
 * 执行被否决题目的重试修复
 */
export async function executeAiIssueRepair(options: {
  client: KernelApiClient;
  aiConfig: AiChannelConfig;
  rejected: GenIssue[];
  source: string;
  genOptions: GenOptions;
  signal?: { aborted: boolean };
}) {
  const { client, aiConfig, rejected, source, genOptions, signal } = options;
  const rawChannel = await createAiChannel(client, aiConfig);
  const counting = new CountingChannel(rawChannel);
  const result = await repairIssues(counting, rejected, source, { ...genOptions, signal });

  return {
    pending: result.pending,
    rejected: result.rejected,
    duplicates: result.duplicates,
    approxTokens: counting.approxTokens,
    calls: counting.calls,
    channelId: counting.id,
  };
}

/**
 * 单题审核通过并写入题库
 */
export async function approveSingleQuestion(
  app: ExamApp,
  bankId: string,
  q: Question,
): Promise<void> {
  await app.writeManualQuestion(bankId, q);
}

/**
 * 批量审批入库，返回成功入库与失败的题目列表
 */
export async function approveBatchQuestions(
  app: ExamApp,
  bankId: string,
  queue: Question[],
): Promise<{ approved: Question[]; failed: Question[] }> {
  const approved: Question[] = [];
  const failed: Question[] = [];

  for (const q of queue) {
    try {
      await app.writeManualQuestion(bankId, q);
      approved.push(q);
    } catch {
      failed.push(q);
    }
  }

  return { approved, failed };
}

/**
 * 从当前编辑器活动文档提取 Markdown 题源材料
 */
export async function fetchCurrentEditorDocContent(
  client: KernelApiClient,
  editorRootId?: string,
): Promise<{ title: string; content: string } | null> {
  if (!editorRootId) return null;
  const { title, content } = await client.exportDocMarkdown(editorRootId);
  if (!content) return null;
  return { title, content };
}

/**
 * 校验并应用 AI 候选题目的手动编辑修改
 */
export function validateAndApplyCandidateEdit(
  original: Question,
  draft: { stem: string; options: string[]; answer: string; analysis: string },
): { valid: boolean; question?: Question; error?: string } {
  const stem = draft.stem.trim();
  const options = draft.options.map((o) => o.trim());
  const answer = normalizeAnswer(original.type, draft.answer) ?? "";
  const analysis = draft.analysis.trim();

  const edited: Question = {
    ...original,
    stem,
    options,
    answer,
    analysis,
    hash: questionHash(stem, options),
  };

  const bad = validate(edited);
  if (bad) {
    return { valid: false, error: bad };
  }

  return { valid: true, question: edited };
}

/**
 * 队列归属题库与当前活动题库对账
 */
export function verifyQueueBankMatch(
  queueBankId: string,
  currentBankId: string,
  t: (k: string) => string,
): { matched: boolean; errorMessage?: string } {
  if (queueBankId && currentBankId !== queueBankId) {
    return {
      matched: false,
      errorMessage: t("ai.queueWrongBank"),
    };
  }
  return { matched: true };
}

export const AI_CONSENT_KEY = "lv-exam-ai-consent";

/**
 * 首次调用 AI 数据流确认与端点绑定隐私闸（26.2 P0 / 41-06）
 */
export async function ensureAiEndpointConsent(
  rawEndpoint: string,
  confirmFn: (opts: { title: string; content: string }) => Promise<boolean>,
  readLocal: (k: string) => string | null,
  writeLocal: (k: string, v: string) => void,
  t: (k: string) => string,
): Promise<boolean> {
  const currentEndpoint = rawEndpoint.trim() || "(内置)";
  let consented = readLocal(AI_CONSENT_KEY);

  try {
    const parsed = JSON.parse(consented ?? "") as { endpoint?: string } | null;
    if (parsed?.endpoint) consented = parsed.endpoint;
    else consented = null;
  } catch {
    if (consented !== null && consented !== "1") consented = null;
    else if (consented === "1") consented = "(legacy)";
  }

  if (consented !== currentEndpoint) {
    const ep = rawEndpoint.trim();
    const msg = ep
      ? `${t("ai.consentTitle")}<br>${t("ai.consentCustom")} ${escapeHtml(redactUrlForDisplay(ep))}`
      : `${t("ai.consentTitle")}<br>${t("ai.consentSiyuan")}`;

    const ok = await confirmFn({
      title: t("ai.consentTitle"),
      content: `${msg}<br><br>${t("ai.consentScope")}`,
    });

    if (!ok) return false;
    writeLocal(AI_CONSENT_KEY, JSON.stringify({ endpoint: currentEndpoint }));
  }

  return true;
}

export interface GenOptionsSnapshotParams {
  count: number;
  difficulty: "easy" | "medium" | "hard" | "mixed";
  kp: string;
  sourceTitle: string;
  preset: any;
  quality: "standard" | "economy";
  pluginCustomHint?: string;
  userCustomHint?: string;
  locator?: { materialId?: string; page?: number; quote?: string };
  profilePrefix?: string;
}

/**
 * 构建出题参数快照
 */
export function buildGenOptionsSnapshot(params: GenOptionsSnapshotParams): GenOptions {
  const customHint = [
    (params.pluginCustomHint ?? "").trim(),
    (params.userCustomHint ?? "").trim(),
  ]
    .filter(Boolean)
    .join("\n");

  return {
    types: ["single", "multiple", "judge"],
    count: params.count,
    difficulty: params.difficulty,
    kp: params.kp,
    sourceTitle: params.sourceTitle,
    preset: params.preset,
    quality: params.quality,
    customHint: customHint || undefined,
    locator: params.locator,
    profilePrefix: params.profilePrefix,
  };
}

export interface CandidateEditDraft {
  stem: string;
  options: string[];
  answer: string;
  analysis: string;
}

/**
 * 构造 AI 候选题目的编辑草稿
 */
export function createAiCandidateEditDraft(q: Question): CandidateEditDraft {
  return {
    stem: q.stem,
    options: [...q.options],
    answer: q.answer,
    analysis: q.analysis ?? "",
  };
}

/**
 * 执行 AI 候选题目单题重新生成
 */
export async function executeRegenSingleCandidate(options: {
  client: KernelApiClient;
  aiConfig: AiChannelConfig;
  material: string;
  genOptions: GenOptions;
  targetQuestion: Question;
  signal?: { aborted: boolean };
}): Promise<{
  newQuestion?: Question;
  rejectReason?: string;
  approxTokens: number;
  calls: number;
  channelId: string;
}> {
  const { client, aiConfig, material, genOptions, targetQuestion, signal } = options;
  const requestOptions: GenOptions = {
    ...genOptions,
    types: [targetQuestion.type],
    count: 1,
    kp: targetQuestion.kp,
  };
  const r = await executeAiQuestionGeneration({
    client,
    aiConfig,
    material,
    genOptions: requestOptions,
    signal,
  });
  return {
    newQuestion: r.pending[0],
    rejectReason: r.rejected[0]?.reason,
    approxTokens: r.approxTokens,
    calls: r.calls,
    channelId: r.channelId,
  };
}

/**
 * 从思源活动编辑器提取文档源码并格式化材料来源与提示
 */
export async function extractAiSourceFromEditor(
  plugin: any,
  client: KernelApiClient,
  t: (k: string) => string,
): Promise<{
  content: string;
  sourceOrigin: string;
  suggestedKp: string;
  toast: string;
} | null> {
  const sApp = plugin.app ?? plugin;
  const ed = sApp?.ui?.currentEditor ?? sApp?.ui?.lastEditor ?? null;
  const rootId: string | undefined = ed?.protyle?.block?.rootID;
  const res = await fetchCurrentEditorDocContent(client, rootId);
  if (!res) return null;
  const displayTitle = res.title || rootId!.slice(0, 8);
  return {
    content: res.content,
    sourceOrigin: t("ai.sourceFromDocument").replace("{title}", displayTitle),
    suggestedKp: res.title || "",
    toast: `${t("ai.sourceLoaded")} ${displayTitle}`,
  };
}




