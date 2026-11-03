import type { Question } from "@/core/types";
import type { ExamApp } from "@/app";
import type { MessageReporter } from "./printPaperService";

/**
 * 将错题本中的错题批量同步推送到小驴闪卡（siyuan-lv-cards）
 */
export async function pushWrongsToCards(
  app: ExamApp,
  bankId: string,
  bankName: string,
  wrongQs: Question[],
  hasCardsPlugin: boolean,
  showMessage: (msg: string, timeout?: number, type?: "info" | "error") => void,
): Promise<number> {
  if (!hasCardsPlugin) {
    showMessage("[小驴考试] 未检测到小驴闪卡插件（siyuan-lv-cards），可前往思源集市安装以开启卡包同步；当前内置错题重练已就绪！", 3500, "info");
    return 0;
  }
  if (!wrongQs.length) {
    showMessage("[小驴考试] 当前筛选下没有可推送到闪卡的错题", 2500, "info");
    return 0;
  }
  try {
    const n = await app.convertToCards(bankId, bankName, wrongQs);
    showMessage(`[小驴考试] 已将 ${n} 道错题同步推送到小驴闪卡卡包 ✓`, 3500, "info");
    return n;
  } catch (e) {
    showMessage(`[小驴考试] 推送闪卡失败：${String(e instanceof Error ? e.message : e)}`, 4000, "error");
    return 0;
  }
}

/**
 * 将单道顽疾错题同步推送到小驴闪卡
 */
export async function pushSingleWrongToCard(
  app: ExamApp,
  bankId: string,
  bankName: string,
  q: Question | undefined,
  hasCardsPlugin: boolean,
  showMessage: (msg: string, timeout?: number, type?: "info" | "error") => void,
): Promise<boolean> {
  if (!hasCardsPlugin) {
    showMessage("[小驴考试] 未检测到小驴闪卡插件（siyuan-lv-cards），可前往思源集市安装以开启卡包同步；当前内置错题重练已就绪！", 3500, "info");
    return false;
  }
  if (!q) {
    showMessage("[小驴考试] 未找到该题目对象", 2500, "info");
    return false;
  }
  try {
    const n = await app.convertToCards(bankId, bankName, [q]);
    showMessage(`[小驴考试] 已将 ${n} 道顽疾错题同步推送到小驴闪卡卡包 ✓`, 3500, "info");
    return n > 0;
  } catch (e) {
    showMessage(`[小驴考试] 推送闪卡失败：${String(e instanceof Error ? e.message : e)}`, 4000, "error");
    return false;
  }
}

/**
 * 结算页错题批量加入持久化行动清单（去重）
 */
export async function pushSessionWrongsToActions(
  app: ExamApp,
  wrongAnswered: Array<{ qid: string }>,
  questionMap: Map<string, Question>,
  sessionId: string,
  t: (k: string) => string,
): Promise<{ added: number; skipped: number }> {
  const items = wrongAnswered.map((a) => {
    const q = questionMap.get(a.qid);
    return {
      kind: "redo" as const,
      qid: a.qid,
      sessionId,
      detail: `${t("action.kind.redo")}：${(q?.kp ?? q?.stem ?? a.qid).slice(0, 40)}`,
    };
  });
  return app.addActions(items);
}

/**
 * 为错题组装专属限时模考特训卷
 */
export async function assembleAndLaunchWrongMock(
  app: ExamApp,
  bankId: string,
  openMock: ((blueprint?: import("@/core/mock").Blueprint) => void) | undefined,
  showMessage: MessageReporter,
  t: (k: string) => string,
): Promise<number> {
  try {
    const result = await app.assembleWrongbookExam(bankId);
    if (!result.totalCount) {
      showMessage(t("wrongbook.noFiltered"), 2500, "info");
      return 0;
    }
    openMock?.(result.blueprint);
    showMessage(`已为 ${result.totalCount} 道错题生成专属限时特训卷！正在进入模考考场…`, 3500, "info");
    return result.totalCount;
  } catch (e) {
    showMessage(String(e instanceof Error ? e.message : e), 3500, "error");
    return 0;
  }
}

/**
 * 计算已消灭错题数（status="eliminated" 且属于当前题库）
 */
export function countEliminatedWrongs(
  app: ExamApp | null | undefined,
  questions: Array<{ id: string }>,
): number {
  if (!app) return 0;
  const ids = new Set(questions.map((q) => q.id));
  try {
    const overlay = (app as any).wrongOverlay as Map<string, any> | undefined;
    return [...app.derived().wrongbook.values()].filter(
      (w) => ids.has(w.qid) && w.status === "eliminated" && overlay?.get(w.qid)?.status !== "active",
    ).length;
  } catch {
    return 0;
  }
}

/**
 * 计算错题消灭率百分比（0-100）
 */
export function calculateClearPercentage(
  eliminatedCount: number,
  activeWrongCount: number,
): number {
  const total = eliminatedCount + activeWrongCount;
  return total > 0 ? Math.round((eliminatedCount / total) * 100) : 0;
}

/**
 * 获取当前题库的已归档错题列表
 */
export function queryArchivedWrongList(
  app: ExamApp | null | undefined,
  questions: Array<{ id: string }>,
): any[] {
  if (!app) return [];
  const ids = new Set(questions.map((q) => q.id));
  return app.listArchivedWrongs().filter((w) => ids.has(w.qid));
}

/**
 * 获取当前题库的已消灭错题列表（按最近错误时间降序）
 */
export function queryEliminatedWrongList(
  app: ExamApp | null | undefined,
  questions: Array<{ id: string }>,
): any[] {
  if (!app) return [];
  const ids = new Set(questions.map((q) => q.id));
  try {
    const overlay = (app as any).wrongOverlay as Map<string, any> | undefined;
    return [...app.derived().wrongbook.values()]
      .filter((w) => ids.has(w.qid) && w.status === "eliminated" && overlay?.get(w.qid)?.status !== "active")
      .sort((a, b) => b.lastWrongAt - a.lastWrongAt);
  } catch {
    return [];
  }
}

