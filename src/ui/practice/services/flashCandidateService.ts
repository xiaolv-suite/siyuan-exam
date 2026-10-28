import type { Question } from "@/core/types";
import type { ExamApp } from "@/app";
import type { KernelApiClient } from "@/kernel/client";
import type { AiChannelConfig } from "./aiWorkflowService";
import { createAiChannel, formatEnvStatusLine } from "./aiWorkflowService";
import type { FlashCandidateResult } from "@/ai/flashCandidates";

export interface GenerateFlashOptions {
  q: Question;
  client: KernelApiClient;
  app: ExamApp;
  aiConfig: AiChannelConfig;
  t: (k: string) => string;
}

/**
 * 请求 AI 分析错题并生成拆解闪卡候选（含泄题安全拦截）
 */
export async function generateFlashCandidates(options: GenerateFlashOptions): Promise<{
  result: FlashCandidateResult | null;
  error: string;
  tokens: number;
  channelId: string;
}> {
  const { q, client, app, aiConfig, t } = options;
  const { buildFlashCandidateMessages, parseFlashCandidates, findCardLeaks } = await import("@/ai/flashCandidates");
  const { AiTaskRunner, questionFingerprint } = await import("@/ai/task");

  const reflection = (await app.loadWrongReflection(q.id))?.text;
  const messages = buildFlashCandidateMessages(q, { reflection });

  const reqCtx: import("@/ai/task").AiTaskContext = {
    templateId: "practice.flash",
    templateVersion: 1,
    qid: q.id,
    questionRevision: questionFingerprint(q),
    learnerAnswer: null,
    submitted: true,
    mode: "practice",
    sessionId: "",
  };

  const ch = await createAiChannel(client, aiConfig);
  const runner = new AiTaskRunner(ch);
  const env = await runner.run(reqCtx, messages);

  if (env.status === "ok" && env.data.text) {
    const parsed = parseFlashCandidates(env.data.text);
    const leaks = findCardLeaks(parsed.cards);
    if (leaks.length > 0) {
      return {
        result: null,
        error: t("flash.leak").replace("{r}", leaks.join("、")),
        tokens: env.tokens,
        channelId: ch.id,
      };
    }
    return {
      result: parsed,
      error: "",
      tokens: env.tokens,
      channelId: ch.id,
    };
  }

  return {
    result: null,
    error: formatEnvStatusLine(env, t),
    tokens: env.tokens,
    channelId: ch.id,
  };
}

/**
 * 确认入库生成的闪卡候选到当前题库
 */
export async function commitFlashCards(
  app: ExamApp,
  bankId: string,
  bankName: string,
  cards: import("@/ai/flashCandidates").FlashCardCandidate[],
): Promise<string[]> {
  const { blockIds } = await app.createFlashCards(bankId, bankName, cards);
  return blockIds;
}

/**
 * 确认入库生成的闪卡候选（经弹窗确认后写块）
 */
export async function executeCommitFlashCardsWithConfirm(
  app: ExamApp,
  bankId: string,
  bankName: string,
  cards: import("@/ai/flashCandidates").FlashCardCandidate[],
  confirmFn: (opts: { title: string; content: string }) => Promise<boolean>,
  t: (k: string) => string,
): Promise<{ confirmed: boolean; blockIds: string[]; toast?: string }> {
  const { escapeHtml } = await import("@/libs/sanitize");
  const ok = await confirmFn({
    title: t("flash.confirmTitle").replace("{n}", String(cards.length)),
    content: cards.map((c) => `・${escapeHtml(c.front)}`).join("<br>"),
  });
  if (!ok) return { confirmed: false, blockIds: [] };

  const blockIds = await commitFlashCards(app, bankId, bankName, cards);
  return {
    confirmed: true,
    blockIds,
    toast: t("flash.done").replace("{n}", String(blockIds.length)),
  };
}

