import type { Question } from "@/core/types";
import type { ExamApp } from "@/app";
import { recentlySeen } from "@/core/exposure";
import type { MessageReporter } from "./printPaperService";

export interface DrillPickOptions {
  app: ExamApp;
  questions: Question[];
  mode: string;
  sessionSeed: string;
  dailyGoal?: number;
  quickAvoidDays?: number;
  dueFirst?: Question[];
}

/**
 * 根据刷题模式（标签/错题/冲刺/收藏/每日/快速）精准调度题目列表
 */
export function pickDrillQuestions(options: DrillPickOptions): {
  picked: Question[];
  error?: string;
  info?: string;
} {
  const { app, questions, mode, sessionSeed, dailyGoal, quickAvoidDays, dueFirst } = options;
  const qs = questions.filter((q) => q.type !== "material");
  if (!qs.length) return { picked: [], info: "state.emptyBank" };

  if (mode.startsWith("tag:")) {
    const targetTag = mode.slice(4);
    const picked = qs.filter((q) => (q.userTags || []).includes(targetTag));
    if (!picked.length) return { picked: [], info: "当前标签下暂无题目" };
    return { picked };
  }

  if (mode === "wrong") {
    const picked = app.wrongDrill(qs);
    if (!picked.length) return { picked: [], info: "state.noWrong" };
    return { picked };
  }

  if (mode === "cram") {
    const picked = app.cramDrill(qs);
    if (!picked.length) return { picked: [], info: "state.noCram" };
    return { picked };
  }

  if (mode === "fav") {
    const picked = app.favDrill(qs);
    if (!picked.length) return { picked: [], info: "state.noFav" };
    return { picked };
  }

  if (mode === "daily") {
    const goal = Number.isFinite(dailyGoal) && dailyGoal! > 0 ? dailyGoal! : 10;
    const dueList = Array.isArray(dueFirst) ? dueFirst : [];
    // 若有到期闪卡优先入列；无到期卡且已有作答历史时采用 DSR 记忆模型加权抽样
    const attempts = app.attempts.all();
    const picked = !dueList.length && attempts.length > 0 && typeof (app as any).dsrDailyDrill === "function"
      ? (app as any).dsrDailyDrill(qs, goal)
      : app.dailyDrill(qs, dueList, goal);
    if (!picked.length) return { picked: [], error: "state.emptyBank" };
    return { picked };
  }

  // 快速刷题模式（支持配置避开近 N 天已答题目）
  const avoidDays = Number(quickAvoidDays ?? 3);
  const seen = avoidDays > 0 ? recentlySeen(app.attempts.all(), avoidDays * 86_400_000, Date.now()) : undefined;
  const picked = seen ? app.quickDrill(qs, 20, sessionSeed, { avoid: seen }) : app.quickDrill(qs, 20, sessionSeed);
  return { picked };
}

/**
 * 提取指定单题错题
 */
export function pickSingleWrongQuestion(allQuestions: Question[], qid: string): Question | null {
  return allQuestions.find((x) => x.id === qid) ?? null;
}

/**
 * 提取同考点举一反三变式练习题列表
 */
export function pickSameKpQuestions(allQuestions: Question[], qid: string): Question[] {
  const target = allQuestions.find((x) => x.id === qid);
  if (!target?.kp) return [];
  return allQuestions.filter((x) => x.id !== qid && x.kp === target.kp);
}

/**
 * 切换题目星标收藏状态并更新属性
 */
export async function toggleQuestionFavorite(
  app: ExamApp,
  q: Question & { blockId?: string; fav?: boolean },
  showMessage: MessageReporter,
  offline: boolean,
  t: (k: string) => string,
): Promise<boolean> {
  try {
    const nextFav = await app.toggleFav(q);
    showMessage(nextFav ? t("session.favAdded") : t("session.favRemoved"), 2000, "info");
    return nextFav;
  } catch (e) {
    showMessage(
      t("session.favFailed").replace(
        "{message}",
        offline ? t("state.offlineHint") : String(e instanceof Error ? e.message : e),
      ),
      4200,
      "error",
    );
    throw e;
  }
}

/**
 * 批量将错题标记为已掌握
 */
export async function executeMasterAllWrong(
  app: ExamApp,
  wrongList: Array<{ qid: string }>,
  showMessage: MessageReporter,
  t: (k: string) => string,
): Promise<{ ok: number; failed: number }> {
  let ok = 0;
  let failed = 0;
  for (const w of wrongList) {
    try {
      await app.setWrongStatus(w.qid, "mastered");
      ok++;
    } catch {
      failed++;
    }
  }
  const message = failed
    ? t("wrongbook.masterAllPartial").replace("{ok}", String(ok)).replace("{failed}", String(failed))
    : t("wrongbook.masterAllDone").replace("{n}", String(ok));
  showMessage(message, 4200, failed ? "error" : "info");

  return { ok, failed };
}

/**
 * 批量标记全部错题为已掌握（经弹窗确认）
 */
export async function executeMasterAllWrongWithConfirm(
  app: ExamApp,
  wrongList: Array<{ qid: string }>,
  confirmFn: (opts: { title: string; content: string }) => Promise<boolean>,
  showMessage: MessageReporter,
  t: (k: string) => string,
): Promise<{ confirmed: boolean; ok: number; failed: number }> {
  if (!wrongList.length) return { confirmed: false, ok: 0, failed: 0 };
  const ok = await confirmFn({
    title: t("wrongbook.masterAllTitle"),
    content: t("wrongbook.masterAllConfirm").replace("{n}", String(wrongList.length)),
  });
  if (!ok) return { confirmed: false, ok: 0, failed: 0 };

  const res = await executeMasterAllWrong(app, wrongList, showMessage, t);
  return { confirmed: true, ...res };
}

/**
 * 单题标记为已掌握（经弹窗确认）
 */
export async function executeMasterSingleWrongWithConfirm(options: {
  app: ExamApp;
  qid: string;
  stem: string;
  confirmFn: (opts: { title: string; content: string }) => Promise<boolean>;
  showMessage: MessageReporter;
  t: (k: string) => string;
  offline: boolean;
}): Promise<boolean> {
  const { app, qid, stem, confirmFn, showMessage, t, offline } = options;
  const ok = await confirmFn({
    title: t("wrongbook.masterOneTitle"),
    content: t("wrongbook.masterOneConfirm").replace("{question}", stem),
  });
  if (!ok) return false;
  try {
    await app.setWrongStatus(qid, "mastered");
    showMessage(t("wrongbook.masteredDone"), 2400, "info");
    return true;
  } catch (e) {
    showMessage(
      t("wrongbook.masterFailed").replace(
        "{message}",
        offline ? t("state.offlineHint") : String(e instanceof Error ? e.message : e),
      ),
      4600,
      "error",
    );
    return false;
  }
}

/**
 * 校验并提取外部移交的题目列表与缺失计数提示
 */
export function resolveExternalTargetQuestions(
  allQuestions: Question[],
  qids: string[],
  t: (k: string) => string,
): { picked: Question[]; missingNotice?: string; emptyNotice?: string } {
  const byId = new Map(allQuestions.map((q) => [q.id, q]));
  const picked = qids.flatMap((id) => {
    const q = byId.get(id);
    return q && q.type !== "material" ? [q] : [];
  });
  if (!picked.length) {
    return { picked: [], emptyNotice: t("query.empty") };
  }
  const missingCount = qids.length - picked.length;
  const missingNotice = missingCount > 0 ? t("query.missing").replace("{n}", String(missingCount)) : undefined;
  return { picked, missingNotice };
}

/**
 * 提取错题队列中有效题目的完整对象列表
 */
export function resolveFilteredWrongDrillQuestions(
  allQuestions: Question[],
  wrongQueue: Array<{ qid: string }>,
): Question[] {
  const map = new Map(allQuestions.map((q) => [q.id, q]));
  return wrongQueue.map((w) => map.get(w.qid)).filter((q): q is Question => Boolean(q));
}

