import type { ExamApp } from "@/app";
import type { Question } from "@/core/types";
import { isStubbornWrong } from "@/core/stubborn";
import type { MessageReporter } from "./printPaperService";

/**
 * 错题归档：移出在册复练队列，移入历史归档
 */
export async function archiveWrongItem(
  app: ExamApp,
  qid: string,
  showMessage: MessageReporter,
  t: (k: string) => string,
): Promise<void> {
  if (!app) return;
  try {
    await app.archiveWrong(qid);
    showMessage(t("wrongbook.archivedSuccess"), 2800, "info");
  } catch (e) {
    showMessage(String(e instanceof Error ? e.message : e), 4200, "error");
  }
}

/**
 * 解除错题归档：重新激活回到在册错题库
 */
export async function unarchiveWrongItem(
  app: ExamApp,
  qid: string,
  showMessage: MessageReporter,
  t: (k: string) => string,
): Promise<void> {
  if (!app) return;
  try {
    await app.unarchiveWrong(qid);
    showMessage(t("wrongbook.unarchivedSuccess"), 2800, "info");
  } catch (e) {
    showMessage(String(e instanceof Error ? e.message : e), 4200, "error");
  }
}

/**
 * 错题延期复习 (Snooze)：延后 N 天提醒，避免集中挤压认知负荷
 */
export async function snoozeWrongItem(
  app: ExamApp,
  qid: string,
  days: number,
  showMessage: MessageReporter,
  t: (k: string) => string,
): Promise<void> {
  if (!app) return;
  try {
    await app.snoozeWrong(qid, days);
    showMessage(t("wrongbook.snoozeDone"), 2800, "info");
  } catch (e) {
    showMessage(String(e instanceof Error ? e.message : e), 4200, "error");
  }
}

/**
 * 将错题重置恢复为 active 在册状态
 */
export async function restoreWrongItemToActive(
  app: ExamApp,
  qid: string,
  showMessage: MessageReporter,
): Promise<void> {
  if (!app) return;
  try {
    await app.setWrongStatus(qid, "active");
    showMessage("已将该题重新收录入在册错题库", 2800, "info");
  } catch (e) {
    showMessage(String(e instanceof Error ? e.message : e), 4200, "error");
  }
}

/**
 * 手动将错题标记为已消灭/已掌握 (Mastered)
 */
export async function markWrongMastered(
  app: ExamApp,
  qid: string,
  showMessage: MessageReporter,
  t: (k: string) => string,
  offline: boolean,
): Promise<void> {
  if (!app) return;
  try {
    await app.setWrongStatus(qid, "mastered");
    showMessage(t("wrongbook.masteredDone"), 2400, "info");
  } catch (e) {
    showMessage(
      t("wrongbook.masterFailed").replace(
        "{message}",
        offline ? t("state.offlineHint") : String(e instanceof Error ? e.message : e),
      ),
      4600,
      "error",
    );
  }
}

export interface WrongQueueFilterCriteria {
  reasonFilter: string;
  filterStubborn: boolean;
  kpFilter: string;
  sortMode: string;
  highriskQids?: ReadonlySet<string>;
  tagFilter?: string;
  docFilter?: string;
}

/**
 * 提取错题队列中的一级考点根分类选项
 */
export function extractWrongQueueKpOptions(
  wrongQueue: Array<{ qid: string }>,
  questionMap: Map<string, Question>,
): string[] {
  const set = new Set<string>();
  for (const w of wrongQueue) {
    const q = questionMap.get(w.qid);
    if (q?.kp) set.add(q.kp.split("/")[0]);
  }
  return Array.from(set).sort();
}

/**
 * 提取错题队列中包含的所有标签（含模考专场标签 mock-run-* 与自定义速记标签）
 */
export function extractWrongQueueTagOptions(
  wrongQueue: Array<{ qid: string }>,
  questionMap: Map<string, Question>,
): string[] {
  const set = new Set<string>();
  for (const w of wrongQueue) {
    const q = questionMap.get(w.qid);
    if (q?.userTags?.length) {
      for (const t of q.userTags) set.add(t);
    }
  }
  return Array.from(set).sort();
}

/**
 * 根据错因、顽疾错题、考点以及排序规则过滤错题队列
 */
export function filterAndSortWrongQueue<T extends { qid: string; wrongCount?: number }>(
  wrongQueue: T[],
  questionMap: Map<string, Question>,
  reasonOf: (qid: string) => string | undefined,
  criteria: WrongQueueFilterCriteria,
): T[] {
  let list = wrongQueue;
  if (criteria.reasonFilter !== "all") {
    list = list.filter((w) => reasonOf(w.qid) === criteria.reasonFilter);
  }
  if (criteria.filterStubborn) {
    list = list.filter((w) => isStubbornWrong(w as any));
  }
  if (criteria.kpFilter) {
    list = list.filter((w) => questionMap.get(w.qid)?.kp?.startsWith(criteria.kpFilter));
  }
  if (criteria.tagFilter) {
    list = list.filter((w) => questionMap.get(w.qid)?.userTags?.includes(criteria.tagFilter!));
  }
  if (criteria.docFilter) {
    list = list.filter((w) => {
      const q = questionMap.get(w.qid);
      const docId = q?.rootId || (q as any)?.docId;
      return docId === criteria.docFilter;
    });
  }
  if (criteria.sortMode === "wrongCount") {
    list = [...list].sort((a, b) => (b.wrongCount || 0) - (a.wrongCount || 0));
  } else if (criteria.sortMode === "kp") {
    list = [...list].sort((a, b) =>
      String(questionMap.get(a.qid)?.kp || "").localeCompare(String(questionMap.get(b.qid)?.kp || "")),
    );
  } else if (criteria.highriskQids && criteria.highriskQids.size > 0) {
    const hr = criteria.highriskQids;
    list = [...list].sort((a, b) => (hr.has(b.qid) ? 1 : 0) - (hr.has(a.qid) ? 1 : 0));
  }
  return list;
}

