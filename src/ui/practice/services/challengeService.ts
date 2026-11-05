import type { Question } from "@/core/types";
import type { ExamApp } from "@/app";
import { makeQuestion } from "@/core/blockTemplate";
import type { MessageReporter } from "./printPaperService";

export interface ChallengePaperData {
  v: 1;
  title: string;
  durationS: number;
  questions: Array<{
    stem: string;
    options: string[];
    answer: string;
    type: Question["type"];
    kp?: string;
  }>;
}

/**
 * 组装友谊赛/对决试卷（截取非材料题前 50 题）
 */
export function buildChallengePaper(questions: Question[], bankName: string): ChallengePaperData {
  const pool = questions.filter((q) => q.type !== "material").slice(0, 50);
  return {
    v: 1 as const,
    title: `${bankName || "题库"} 挑战`,
    durationS: 600,
    questions: pool.map((q) => ({
      stem: q.stem,
      options: q.options,
      answer: q.answer,
      type: q.type,
      kp: q.kp,
    })),
  };
}

/**
 * 复制挑战码到剪贴板
 */
export async function copyChallengeCode(
  questions: Question[],
  bankName: string,
  showMessage: MessageReporter,
  t: (k: string) => string,
): Promise<void> {
  const paper = buildChallengePaper(questions, bankName);
  if (!paper.questions.length) {
    showMessage(t("state.emptyBank"), 2800, "info");
    return;
  }
  try {
    const { encodeChallengeCopy } = await import("@/core/challenge");
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(encodeChallengeCopy(paper));
      showMessage(t("challenge.copied"), 3600, "info");
    } else {
      showMessage(t("mock.summaryCopyFailed"), 3600, "error");
    }
  } catch (e) {
    showMessage(String(e instanceof Error ? e.message : e), 4200, "error");
  }
}

/**
 * 解析挑战码并创建挑战练习会话
 */
export async function parseAndStartChallenge(
  app: ExamApp,
  code: string,
  activeBankId: string,
  t: (k: string) => string,
) {
  const { decodeChallenge } = await import("@/core/challenge");
  const paper = decodeChallenge(code.trim());
  if (!paper) throw new Error(t("challenge.badCode"));

  const qs: Question[] = paper.questions.map((q) =>
    makeQuestion({
      type: q.type,
      stem: q.stem,
      options: q.options,
      answer: q.answer,
      kp: q.kp,
    }),
  );

  const session = await app.startSession(qs, "challenge", activeBankId);
  if (session?.state) {
    session.state.inlineQuestions = qs;
  }
  if (typeof app.saveSession === "function") {
    await app.saveSession();
  }
  return session;
}
