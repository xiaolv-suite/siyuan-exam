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
