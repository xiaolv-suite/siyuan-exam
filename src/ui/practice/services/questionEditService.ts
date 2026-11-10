// ============================================================
// 题目内联编辑与生命周期更新服务（questionEditService.ts）
// 承接 43-01 题目内容修改、数值规格反填/重构、生命周期状态切换
// 纯逻辑解耦，不绑定 Svelte 渲染态
// ============================================================

import type { Question, QuestionLifecycleStatus } from "@/core/types";
import type { ExamApp } from "@/app";
import type { AnswerSpec, NumericAnswerSpec } from "@/core/structuredAnswer";
import { getQuestionLifecycle } from "@/core/revision";
import { buildNumericAnswerSpec, type NumericSpecParams } from "./manualStudioService";
import { changeQuestionLifecycle } from "./disputeGovernanceService";
import type { MessageReporter } from "./printPaperService";

export interface QuestionEditDraft {
  stem: string;
  options: string[];
  answer: string;
  analysis: string;
  kp: string;
  difficulty: string;
  status?: QuestionLifecycleStatus;
  answerSpec?: NumericAnswerSpec;
}

/**
 * 从题目现有规格中提取供编辑表单展示的数值字段
 */
export function extractNumericSpecFields(spec: AnswerSpec | undefined): {
  unit: string;
  absTol: string;
  relPct: string;
  altUnits: string;
} {
  if (spec?.kind !== "numeric") {
    return { unit: "", absTol: "", relPct: "", altUnits: "" };
  }
  return {
    unit: spec.unit ?? "",
    absTol: spec.absTol != null ? String(spec.absTol) : "",
    relPct: spec.relTolerance != null ? String(Math.round(spec.relTolerance * 10000) / 100) : "",
    altUnits: spec.altUnits?.map((a) => a.unit).join(", ") ?? "",
  };
}

/**
 * 构造题目编辑表单草稿对象
 */
export function createQuestionEditDraft(q: Question): QuestionEditDraft {
  return {
    stem: q.stem,
    options: [...q.options],
    answer: q.answer,
    analysis: q.analysis ?? "",
    kp: q.kp ?? "",
    difficulty: q.difficulty != null ? String(q.difficulty) : "",
    status: getQuestionLifecycle(q),
    answerSpec: q.answerSpec?.kind === "numeric" ? q.answerSpec : undefined,
  };
}

/**
 * 校验并持久化题目的内容修订变更
 */
export async function executeSaveQuestionEdit(
  app: ExamApp,
  q: Question & { blockId: string },
  draft: QuestionEditDraft,
  numericParams: NumericSpecParams,
  t: (k: string) => string,
): Promise<{ next?: Partial<Question>; error?: string }> {
  if (!draft.stem.trim()) {
    return { error: t("edit.needStem") };
  }
  if (q.type !== "material" && !draft.answer.trim()) {
    return { error: t("edit.needAnswer") };
  }

  const builtNumericSpec = buildNumericAnswerSpec(numericParams);
  const answerSpec =
    builtNumericSpec !== undefined
      ? builtNumericSpec
      : q.answerSpec?.kind === "numeric"
        ? null
        : undefined;
  const next = await app.updateQuestionContent(q, {
    stem: draft.stem.trim(),
    options: draft.options,
    answer: draft.answer.trim(),
    analysis: draft.analysis.trim(),
    kp: draft.kp.trim(),
    difficulty: draft.difficulty ? parseInt(draft.difficulty, 10) || undefined : undefined,
    status: draft.status,
    answerSpec,
  });

  return { next };
}

/**
 * 切换题目作者生命周期状态并提示通知
 */
export async function executeChangeQuestionLifecycle(
  app: ExamApp,
  q: Question & { blockId: string },
  nextStatus: QuestionLifecycleStatus,
  showMessage: MessageReporter,
  t: (k: string) => string,
): Promise<Partial<Question>> {
  return changeQuestionLifecycle(app, q, nextStatus, showMessage, t);
}
