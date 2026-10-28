import type { ExamApp } from "@/app";
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
