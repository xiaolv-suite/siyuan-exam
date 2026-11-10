import type { Question } from "@/core/types";
import type { ExamApp } from "@/app";
import type { KernelApiClient } from "@/kernel/client";
import type { AiChannelConfig } from "./aiWorkflowService";
import { createAiChannel, formatEnvStatusLine } from "./aiWorkflowService";
import type { MessageReporter } from "./printPaperService";

/**
 * 弹出输入对话框编辑并保存针对单题的复盘反思
 */
export async function editQuestionReflection(
  app: ExamApp,
  qid: string,
  t: (k: string) => string,
): Promise<{ text: string; at: number } | null> {
  const cur = await app.loadWrongReflection(qid);
  const { inputDialogSync } = await import("@/libs/dialog");
  const text = await inputDialogSync({
    title: t("reflection.title"),
    placeholder: t("reflection.placeholder"),
    defaultText: cur?.text ?? "",
  });
  if (text == null) return null; // 取消操作

  await app.saveWrongReflection(qid, text);
  if (text.trim()) {
    return { text: text.trim(), at: Date.now() };
  }
  return { text: "", at: Date.now() };
}

/**
 * 批量加载本次做题会话中有错题或受助记录的反思
 */
export async function loadSessionReflections(
  app: ExamApp,
  answered: Array<{ qid: string; grade: { verdict: string } }>,
  isHelped: (qid: string) => boolean,
): Promise<Record<string, { text: string; at: number }>> {
  const result: Record<string, { text: string; at: number }> = {};
  for (const a of answered) {
    if (a.grade.verdict === "correct" && !isHelped(a.qid)) continue;
    const r = await app.loadWrongReflection(a.qid);
    if (r) result[a.qid] = r;
  }
  return result;
}

/**
 * 从流水中提取指定题目在当前会话的置信度与受助状态
 */
export function queryAttemptMeta(
  app: ExamApp,
  sessionId: string,
  qid: string,
): { confidence?: "sure" | "fuzzy" | "guess"; helped?: boolean } {
  const events = app.attempts.all().filter((e) => e.qid === qid && e.sessionId === sessionId);
  const last = events[events.length - 1];
  return { confidence: last?.confidence, helped: !!last?.help };
}

export interface MisdiagnosisOptions {
  q: Question;
  myAnswer: string | null;
  timeMs: number;
  sessionId: string;
  meta: { confidence?: "sure" | "fuzzy" | "guess"; helped?: boolean };
  userThought?: string;
  client: KernelApiClient;
  aiConfig: AiChannelConfig;
  app: ExamApp;
  t: (k: string) => string;
}

/**
 * 调度 AI 生成错因假设并独立持久化
 */
export async function executeMisdiagnosisTask(options: MisdiagnosisOptions): Promise<{
  text: string;
  error: string;
  tokens: number;
  channelId: string;
}> {
  const { q, myAnswer, timeMs, sessionId, meta, userThought, client, aiConfig, app, t } = options;
  const { buildMisdiagnosisMessages } = await import("@/ai/misdiagnosis");
  const { AiTaskRunner, questionFingerprint } = await import("@/ai/task");

  const ch = await createAiChannel(client, aiConfig, "考试");
  const messages = buildMisdiagnosisMessages(q, {
    myAnswer,
    confidence: meta.confidence,
    timeMs,
    helped: meta.helped,
    userThought,
  });

  const reqCtx: import("@/ai/task").AiTaskContext = {
    templateId: "practice.misdiagnosis",
    templateVersion: 1,
    qid: q.id,
    questionRevision: questionFingerprint(q),
    learnerAnswer: myAnswer,
    submitted: true,
    mode: "practice",
    sessionId,
  };

  const env = await new AiTaskRunner(ch).run(reqCtx, messages);

  if (env.status === "ok" && env.data.text) {
    const text = env.data.text;
    void app.saveMisdiagnosis({
      qid: q.id,
      text,
      at: Date.now(),
      sessionId,
      templateVersion: 1,
      evidence: { myAnswer, confidence: meta.confidence, timeMs, helped: meta.helped },
    }).catch(() => undefined);

    return { text, error: "", tokens: env.tokens, channelId: ch.id };
  }

  return {
    text: "",
    error: formatEnvStatusLine(env, t),
    tokens: env.tokens,
    channelId: ch.id,
  };
}

/**
 * 采纳 AI 错因假设并合并入用户自主复盘反思
 */
export async function mergeAdoptedMisdiagnosis(
  app: ExamApp,
  qid: string,
  hypothesis: string,
  t: (k: string) => string,
  showMessage: MessageReporter,
): Promise<{ text: string; at: number }> {
  const cur = await app.loadWrongReflection(qid);
  const merged = (cur?.text ? cur.text + "\n\n" : "") + t("ai.misdiagnosisTag") + "\n" + hypothesis;
  await app.saveWrongReflection(qid, merged);
  void app.markMisdiagnosisAdopted(qid).catch(() => undefined);
  showMessage(t("reflection.saved"), 2000, "info");
  return { text: merged, at: Date.now() };
}

/**
 * 纯函数更新自诊断复盘状态映射字典（内容为空时自动清理键）
 */
export function updateReflectionMapState(
  current: Record<string, { text: string; at: number }>,
  qid: string,
  entry: { text: string; at: number } | null,
): Record<string, { text: string; at: number }> {
  if (!entry) return current;
  if (entry.text) {
    return { ...current, [qid]: entry };
  }
  const next = { ...current };
  delete next[qid];
  return next;
}

export interface MisdiagnosisWorkflowOptions {
  app: ExamApp;
  q: Question;
  myAnswer: string | null;
  timeMs: number;
  sessionId: string;
  meta: { confidence?: "sure" | "fuzzy" | "guess"; helped?: boolean };
  userThought?: string;
  aiConfig: AiChannelConfig;
  t: (k: string) => string;
}

/**
 * 调度 AI 错因假设完整流程（含生成、用量记账与错误包装）
 */
export async function executeMisdiagnosisWorkflow(
  options: MisdiagnosisWorkflowOptions,
): Promise<{ text: string; error: string }> {
  const { app, q, myAnswer, timeMs, sessionId, meta, userThought, aiConfig, t } = options;
  const res = await executeMisdiagnosisTask({
    q,
    myAnswer,
    timeMs,
    sessionId,
    meta,
    userThought,
    client: app.deps.client,
    aiConfig,
    app,
    t,
  });

  if (res.text) {
    void app.recordAiUsage(res.channelId, res.tokens, 1).catch(() => undefined);
    return { text: res.text, error: "" };
  }

  return { text: "", error: res.error };
}

/**
 * 提取指定题目的最近做题回执列表与最新错因假设
 */
export function queryQuestionReceipts(
  app: ExamApp,
  qid: string,
): {
  receipts: import("@/core/types").AttemptEvent[];
  storedMisdiagnosis: { text: string; at: number; adoptedAt?: number } | null;
} {
  const receipts = app.attempts.all().filter((e) => e.qid === qid).slice(-10).reverse();
  const rec = app.latestMisdiagnosis(qid);
  const storedMisdiagnosis = rec ? { text: rec.text, at: rec.at, adoptedAt: rec.adoptedAt } : null;
  return { receipts, storedMisdiagnosis };
}


