import type { Question } from "./types";
import { hasBlankPlaceholder } from "./questionLinter";

export type ReviewQueueState = "confirmed" | "pending" | "warning";

export interface ClassifiedReviewItem<T extends Question = Question> {
  question: T;
  index: number;
  state: ReviewQueueState;
  warnings: string[];
}

export interface ReviewQueueCounts {
  all: number;
  confirmed: number;
  pending: number;
  warning: number;
}

export interface ReviewQueueSummary<T extends Question = Question> {
  items: ClassifiedReviewItem<T>[];
  counts: ReviewQueueCounts;
  filterBy: (filter: "all" | ReviewQueueState) => ClassifiedReviewItem<T>[];
}

function toIdSet(confirmedIds?: ReadonlySet<string> | readonly string[]): ReadonlySet<string> {
  if (!confirmedIds) return new Set<string>();
  return confirmedIds instanceof Set ? confirmedIds : new Set(confirmedIds);
}

/**
 * 核查单题在审核队列中的异常警告项（缺答案、选项重复、空题干、选项数异常、填空缺占位符等）
 */
export function getQuestionReviewWarnings(q: Question): string[] {
  const warnings: string[] = [];
  const pushUnique = (msg: string) => {
    const clean = msg.trim();
    if (clean && !warnings.includes(clean)) warnings.push(clean);
  };

  const stem = String(q.stem ?? "").trim();
  if (!stem) {
    pushUnique("空题干");
  }

  const opts = Array.isArray(q.options) ? q.options : [];
  if (q.type === "single" || q.type === "multiple") {
    if (opts.length < 2) {
      pushUnique("选项不足（至少需要 2 个选项）");
    }
    if (opts.length > 4) {
      pushUnique(`选项异常偏多（${opts.length} 项）`);
    }
    const seen = new Set<string>();
    for (const rawOpt of opts) {
      const norm = String(rawOpt ?? "").trim().toLowerCase();
      if (!norm) {
        pushUnique("存在空选项");
        continue;
      }
      if (seen.has(norm)) {
        pushUnique("选项重复");
      } else {
        seen.add(norm);
      }
    }
  }

  if (q.type === "single" || q.type === "multiple" || q.type === "judge") {
    if (!String(q.answer ?? "").trim()) {
      pushUnique("缺答案");
    }
  }

  if (q.type === "fill" && stem && !hasBlankPlaceholder(stem)) {
    pushUnique("填空题干缺少挖空占位符");
  }

  if (Array.isArray(q.lintIssues)) {
    for (const issue of q.lintIssues) {
      if (typeof issue === "string") pushUnique(issue);
    }
  }

  return warnings;
}

export function classifyReviewQuestion<T extends Question>(
  q: T,
  opts: { confirmedIds?: ReadonlySet<string> | readonly string[]; index?: number } = {},
): ClassifiedReviewItem<T> {
  const confirmed = toIdSet(opts.confirmedIds);
  const warnings = getQuestionReviewWarnings(q);
  let state: ReviewQueueState;
  if (warnings.length > 0) {
    state = "warning";
  } else if (confirmed.has(q.id)) {
    state = "confirmed";
  } else {
    state = "pending";
  }
  return {
    question: q,
    index: opts.index ?? 0,
    state,
    warnings,
  };
}

export function classifyReviewQueue<T extends Question>(
  questions: readonly T[],
  opts: { confirmedIds?: ReadonlySet<string> | readonly string[] } = {},
): ReviewQueueSummary<T> {
  const confirmed = toIdSet(opts.confirmedIds);
  const items: ClassifiedReviewItem<T>[] = [];
  let confirmedCount = 0;
  let pendingCount = 0;
  let warningCount = 0;

  for (let i = 0; i < questions.length; i++) {
    const item = classifyReviewQuestion(questions[i]!, { confirmedIds: confirmed, index: i });
    items.push(item);
    if (item.state === "confirmed") confirmedCount++;
    else if (item.state === "warning") warningCount++;
    else pendingCount++;
  }

  const counts: ReviewQueueCounts = {
    all: items.length,
    confirmed: confirmedCount,
    pending: pendingCount,
    warning: warningCount,
  };

  return {
    items,
    counts,
    filterBy: (filter) => (filter === "all" ? items : items.filter((it) => it.state === filter)),
  };
}

/**
 * 一键批量确认全部无警告题目（自动跳过有警告的题目）
 */
export function batchConfirmNonWarning(
  questions: readonly Question[],
  existingConfirmedIds: Iterable<string> = [],
): { nextConfirmedIds: string[]; addedCount: number; skippedWarningCount: number } {
  const nextSet = new Set<string>(existingConfirmedIds);
  let addedCount = 0;
  let skippedWarningCount = 0;
  for (const q of questions) {
    const warnings = getQuestionReviewWarnings(q);
    if (warnings.length > 0) {
      nextSet.delete(q.id);
      skippedWarningCount++;
      continue;
    }
    if (!nextSet.has(q.id)) {
      nextSet.add(q.id);
      addedCount++;
    }
  }
  return {
    nextConfirmedIds: [...nextSet],
    addedCount,
    skippedWarningCount,
  };
}
