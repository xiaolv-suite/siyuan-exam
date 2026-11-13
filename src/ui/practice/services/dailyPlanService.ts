import type { Question } from "@/core/types";
import type { ExamApp } from "@/app";
import {
  planToday,
  remainingPlan,
  parseExamProfiles,
  nearestUpcoming,
  nextPlanTrace,
  type PlanResult,
  type PlanTrace,
  type ExamProfile,
} from "@/core/planner";
import { estimatePlanMinutes, avgMsByType, type TimeEstimate } from "@/core/timeBudget";
import { localDateKeyOf } from "@/core/checkinBridge";

export interface PlanReasonData {
  days: number;
  cram: number;
  stubborn: number;
  due: number;
}

/**
 * 本地化格式化今日计划卡片的原因说明文案
 */
export function formatPlanReason(p: PlanResult, t: (k: string) => string): string {
  const d = p.reasonData ?? { days: 0, cram: 0, stubborn: 0, due: 0 };
  if (p.reasonKind === "sprint") {
    return t("plan.sprint").replace("{d}", String(d.days)).replace("{n}", String(d.cram)).replace("{m}", String(d.stubborn));
  }
  if (p.reasonKind === "due") {
    return t("plan.due").replace("{n}", String(d.due));
  }
  return t("plan.reflow").replace("{m}", String(d.stubborn));
}

export interface RebuildPlanOptions {
  app: ExamApp;
  questions: Question[];
  examDate?: string;
  sprintDays?: number;
  dailyGoal?: number;
  examProfilesRaw?: string;
  dueFirst?: Question[];
}

/**
 * 重新聚合计算今日备考目标计划与时间预算
 */
export function buildDailyPlanSchedule(options: RebuildPlanOptions): {
  plan: PlanResult;
  planTime: TimeEstimate;
  examProfileList: ExamProfile[];
} {
  const { app, questions, examDate, sprintDays, dailyGoal, examProfilesRaw, dueFirst } = options;
  const examProfileList = parseExamProfiles(String(examProfilesRaw ?? ""));
  const nearest = nearestUpcoming(examProfileList);
  const effectiveExamDate = nearest?.date ?? (examDate || undefined);

  const wrongCounts = new Map<string, number>();
  for (const w of app.derived().wrongbook.values()) {
    wrongCounts.set(w.qid, w.wrongCount);
  }
  const activeWrongIds = new Set(app.wrongItems().map((w) => w.qid));

  const freshPlan = planToday({
    examDate: effectiveExamDate,
    sprintDays: Number.isFinite(sprintDays) && sprintDays! > 0 ? sprintDays! : 14,
    dailyGoal: Number.isFinite(dailyGoal) && dailyGoal! > 0 ? dailyGoal! : 10,
    all: questions,
    wrongCounts,
    activeWrongIds,
    wrongReasons: app.wrongReasonMap() ?? undefined,
    dueFirst: dueFirst ?? [],
  });

  const today = localDateKeyOf(Date.now());
  const completedToday = new Set(
    app.attempts
      .all()
      .filter((event) => event.verdict !== "not_attempted" && localDateKeyOf(event.ts) === today)
      .map((event) => event.qid),
  );

  const finalPlan = remainingPlan(freshPlan, completedToday);
  const typeOf = new Map(questions.map((q) => [q.id, q.type] as const));
  const planTime = estimatePlanMinutes(finalPlan.queue, avgMsByType(app.attempts.all(), (qid) => typeOf.get(qid)));

  return {
    plan: finalPlan,
    planTime,
    examProfileList,
  };
}

/**
 * 刷新并持久化昨日计划追踪轨迹
 */
export async function updateDailyPlanTrace(
  app: ExamApp,
  currentQueueLength: number,
): Promise<PlanTrace> {
  const prev = ((await app.loadAux<PlanTrace | null>("plan/trace")) ?? null);
  const yesterday = new Date(Date.now() - 86_400_000);
  const yKey = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, "0")}-${String(yesterday.getDate()).padStart(2, "0")}`;
  const doneY = app.attempts
    .all()
    .filter((e) => e.verdict !== "not_attempted" && localDateKeyOf(e.ts) === yKey).length;
  const trace = nextPlanTrace(prev, localDateKeyOf(Date.now()), currentQueueLength, doneY);
  await app.saveAux("plan/trace", trace);
  return trace;
}

/**
 * 根据计划队列与可用题目计算今日练习队列（传入计划时优先遵循计划，未生成计划时前 10 题兜底）
 */
export function resolveDailyStudyQueue(available: Question[], planned?: Question[]): Question[] {
  const source = planned !== undefined ? planned : available.slice(0, 10);
  return source.filter((q) => q.type !== "material");
}

/**
 * 提取艾宾浩斯临界遗忘风险考点的特训急救题目列表
 */
export function extractCriticalForgettingRescueQuestions(
  criticalKps: Array<{ candidateQids: string[] }>,
  questionMap: Map<string, Question>,
  limit = 10,
): Question[] {
  const qids = criticalKps.flatMap((k) => k.candidateQids).slice(0, limit);
  return qids.map((id) => questionMap.get(id)).filter((q): q is Question => Boolean(q));
}

/**
 * 格式化周度趋势图表单日星期标签
 */
export function formatWeekDayLabel(dateKey: string): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  return ["日", "一", "二", "三", "四", "五", "六"][new Date(year, month - 1, day, 12).getDay()];
}

/**
 * 提取今日已作答题目 ID 集合
 */
export function queryTodayAnsweredIds(app: ExamApp | null | undefined, nowMs: number = Date.now()): Set<string> {
  const today = localDateKeyOf(nowMs);
  const ids = new Set<string>();
  if (!app) return ids;
  try {
    for (const event of app.attempts.all()) {
      if (event.verdict !== "not_attempted" && localDateKeyOf(event.ts) === today) {
        ids.add(event.qid);
      }
    }
  } catch {
    // 读取异常保持空集合
  }
  return ids;
}

/**
 * 组装今日推荐练习队列
 */
export function computeTodayPracticeQueue(options: {
  plan: PlanResult | null;
  practiceQuestions: Question[];
  todayAnsweredIds: Set<string>;
  groupAdjacentFn: (qs: Question[]) => Question[];
}): Question[] {
  const { plan, practiceQuestions, todayAnsweredIds, groupAdjacentFn } = options;
  if (!plan) {
    return groupAdjacentFn(resolveDailyStudyQueue(practiceQuestions));
  }
  const remaining = remainingPlan(plan, todayAnsweredIds);
  return groupAdjacentFn(resolveDailyStudyQueue(practiceQuestions, remaining.queue));
}
