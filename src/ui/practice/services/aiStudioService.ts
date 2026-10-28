import type { Question } from "@/core/types";
import type { ExamApp } from "@/app";
import type { KernelApiClient } from "@/kernel/client";
import type { GenOptions, GenIssue } from "@/ai/gen";
import { generate, repairIssues } from "@/ai/gen";
import { CountingChannel } from "@/ai/counting";
import { createAiChannel, type AiChannelConfig } from "./aiWorkflowService";

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
