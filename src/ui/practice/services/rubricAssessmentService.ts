// ============================================================
// 主观题逐采分点自评与存档管理服务（rubricAssessmentService.ts）
// 承接 55-05 采分点打分核算、自评快照持久化、AI自动对齐与CSV导出
// 纯逻辑解耦，不绑定 Svelte 渲染态
// ============================================================

import type { Question } from "@/core/types";
import type { ExamApp } from "@/app";
import {
  scoreRubric,
  createRubricAssessmentSnapshot,
  isRubricDrifted,
  exportRubricBreakdownCsv,
  type RubricSpec,
  type CriterionAssessment,
  type CriterionRating,
  type RubricAssessmentSnapshot,
  type RubricScoreResult,
} from "@/core/rubric";
import { evaluateStudentAnswerAgainstRubric, type RubricEvaluationResult } from "@/core/rubricEvaluator";

export const RUBRIC_ARCHIVE_KEY = "rubric/assessments";

/**
 * 载入自评存档快照
 */
export async function loadRubricArchiveAux(
  app: ExamApp,
): Promise<Record<string, RubricAssessmentSnapshot>> {
  if (!app) return {};
  try {
    const v = await app.loadAux<Record<string, RubricAssessmentSnapshot>>(RUBRIC_ARCHIVE_KEY);
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

/**
 * 计算当前题目在当前评分输入下的采分点得分（未评项不计入分母）
 */
export function calculateCurrentRubricScore(
  q: Question | undefined | null,
  ratings: Record<string, CriterionRating>,
  notes: Record<string, string>,
): RubricScoreResult | null {
  if (!q?.rubric) return null;
  const assessments: CriterionAssessment[] = Object.entries(ratings).map(([criterionId, rating]) => ({
    criterionId,
    rating,
    note: notes[criterionId] || undefined,
  }));
  return scoreRubric(q.rubric as RubricSpec, assessments, q.score);
}

/**
 * 保存当前题目的自评快照并持久化
 */
export async function recordRubricAssessmentAux(
  app: ExamApp,
  archive: Record<string, RubricAssessmentSnapshot>,
  q: Question,
  score: RubricScoreResult,
): Promise<{ nextArchive: Record<string, RubricAssessmentSnapshot>; snapshot: RubricAssessmentSnapshot }> {
  const snap = createRubricAssessmentSnapshot(score, q.rubric as RubricSpec);
  const nextArchive = { ...archive, [q.id]: snap };
  await app.saveAux(RUBRIC_ARCHIVE_KEY, nextArchive);
  return { nextArchive, snapshot: snap };
}

/**
 * 自动对齐学生作答与采分点量规
 */
export function autoAlignRubricEvaluation(
  q: Question,
  studentAnswer: string,
): RubricEvaluationResult {
  return evaluateStudentAnswerAgainstRubric({
    studentAnswer,
    rubric: q.rubric,
    fallbackAnalysis: q.analysis || q.answer,
  });
}

/**
 * 导出当前题目的采分点自评结果为 CSV 文件
 */
export function exportRubricBreakdownCsvFile(rubricScore: RubricScoreResult): void {
  if (typeof document === "undefined") return;
  const blob = new Blob([exportRubricBreakdownCsv(rubricScore)], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  const url = URL.createObjectURL(blob);
  a.href = url;
  a.download = `小驴考试-主观题自评-${new Date().toISOString().slice(0, 10)}.csv`;
  a.hidden = true;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 0);
}

export { isRubricDrifted };

/**
 * 执行自评快照持久化并返回结果与通知
 */
export async function executeRecordRubricAssessment(options: {
  app: ExamApp;
  rubricArchive: Record<string, RubricAssessmentSnapshot>;
  q: Question;
  rubricScore: RubricScoreResult | null;
  showMessage: (msg: string, time?: number, type?: string) => void;
  t: (k: string) => string;
}): Promise<{ nextArchive: Record<string, RubricAssessmentSnapshot>; saved: boolean }> {
  const { app, rubricArchive, q, rubricScore, showMessage, t } = options;
  if (!q?.rubric || !rubricScore) return { nextArchive: rubricArchive, saved: false };
  try {
    const { nextArchive, snapshot } = await recordRubricAssessmentAux(app, rubricArchive, q, rubricScore);
    const msg =
      snapshot.finalScore != null
        ? t("rubric.recordedFinal").replace("{score}", String(snapshot.finalScore)).replace("{full}", String(snapshot.fullScore))
        : t("rubric.recordedPartial").replace("{n}", String(snapshot.unratedCount));
    showMessage(msg, 2600, "info");
    return { nextArchive, saved: true };
  } catch (e) {
    showMessage(t("rubric.recordFailed").replace("{message}", String(e instanceof Error ? e.message : e)), 3200, "error");
    return { nextArchive: rubricArchive, saved: false };
  }
}
