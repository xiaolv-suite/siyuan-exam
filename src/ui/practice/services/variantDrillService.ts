import type { Question } from "@/core/types";
import type { ExamApp } from "@/app";

/**
 * 检索同考点或同族的举一反三变式题
 */
export async function fetchVariantDrillQuestions(
  app: ExamApp,
  q: Question,
  count = 5,
): Promise<{ questions: Question[]; reason: string }> {
  if (!q || !app) return { questions: [], reason: "" };
  return app.pickVariantQuestions(q, count);
}

/**
 * 根因溯源：寻找该题目的前置概念基础母题
 */
export async function fetchFoundationMotherQuestion(
  app: ExamApp,
  target: Question,
): Promise<{ motherQuestion: Question | null; reason: string }> {
  if (!target || !app) return { motherQuestion: null, reason: "" };
  return app.findFoundationMotherQuestion(target);
}

/**
 * 练习中举一反三：基于会话内错题或当前题，挑选同考点题目开启特训（37-05）
 */
export function pickSameKpDrillQuestions(
  app: any,
  allQuestions: Question[],
  session: any,
  count = 10,
): { questions: Question[]; errorKey?: string } {
  if (!allQuestions.length) {
    return { questions: [], errorKey: "state.noSameKp" };
  }

  const wrongs = session?.answered?.filter((a: any) => a.grade?.verdict === "wrong") ?? [];
  const exclude = new Set<string>(session?.state?.qids ?? []);
  const seed = allQuestions.find((q) => q.id === wrongs[0]?.qid) ?? session?.current ?? allQuestions[0];

  const picked = app.sameKpDrill(allQuestions, seed, count, exclude);
  if (!picked?.length) {
    return { questions: [], errorKey: "state.noSameKp" };
  }

  return { questions: picked };
}

export interface VariantDrillLookupResult {
  questions: Question[];
  toastMessage?: string;
  emptyNotice?: string;
}

/**
 * 检索并准备举一反三变式训练
 */
export async function executeVariantDrillLookup(
  app: any,
  q: Question,
  count = 5,
): Promise<VariantDrillLookupResult> {
  const res = await fetchVariantDrillQuestions(app, q, count);
  if (!res.questions?.length) {
    return {
      questions: [],
      emptyNotice: "未检索到相关考点或同族的变式题",
    };
  }

  return {
    questions: res.questions,
    toastMessage: `⚡ ${res.reason}`,
  };
}

export interface MotherQuestionLookupResult {
  motherQuestion: Question | null;
  toastMessage?: string;
  emptyNotice?: string;
}

/**
 * 检索前置母题溯源
 */
export async function executeMotherQuestionLookup(
  app: any,
  target: Question,
): Promise<MotherQuestionLookupResult> {
  const res = await fetchFoundationMotherQuestion(app, target);
  if (!res.motherQuestion) {
    return {
      motherQuestion: null,
      emptyNotice: res.reason,
    };
  }

  return {
    motherQuestion: res.motherQuestion,
    toastMessage: `🌱 ${res.reason}`,
  };
}

/**
 * 完整举一反三变式训练调度工作流
 */
export async function executeDrillVariantWorkflow(options: {
  app: any;
  q: Question;
  showMessage: (msg: string, time?: number, type?: string) => void;
  startPractice: (qs: Question[], toast?: string) => Promise<void>;
}): Promise<void> {
  const { app, q, showMessage, startPractice } = options;
  if (!q) return;
  try {
    const res = await executeVariantDrillLookup(app, q, 5);
    if (res.emptyNotice) { showMessage(res.emptyNotice, 2500, "info"); return; }
    await startPractice(res.questions, res.toastMessage);
  } catch (e) {
    showMessage(String(e instanceof Error ? e.message : e), 3000, "error");
  }
}

/**
 * 完整母题溯源调度工作流
 */
export async function executeMotherQuestionWorkflow(options: {
  app: any;
  target: Question;
  showMessage: (msg: string, time?: number, type?: string) => void;
  startPractice: (qs: Question[], toast?: string) => Promise<void>;
}): Promise<void> {
  const { app, target, showMessage, startPractice } = options;
  if (!target || !app) return;
  try {
    const res = await executeMotherQuestionLookup(app, target);
    if (res.emptyNotice) { showMessage(res.emptyNotice, 3000, "info"); return; }
    await startPractice([res.motherQuestion!], res.toastMessage);
  } catch (e) {
    showMessage(String(e instanceof Error ? e.message : e), 3500, "error");
  }
}

