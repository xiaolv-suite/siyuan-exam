import { describe, it, expect, vi } from "vitest";
import {
  formatPlanReason,
  buildDailyPlanSchedule,
  updateDailyPlanTrace,
  resolveDailyStudyQueue,
  extractCriticalForgettingRescueQuestions,
  formatWeekDayLabel,
  queryTodayAnsweredIds,
  computeTodayPracticeQueue,
} from "@/ui/practice/services/dailyPlanService";
import type { ExamApp } from "@/app";
import type { Question } from "@/core/types";
import type { PlanResult } from "@/core/planner";

describe("今日备考计划与目标调度服务 (dailyPlanService)", () => {
  it("1. formatPlanReason：格式化各种模式的原因文案", () => {
    const t = (k: string) => `[${k}]`;

    // 1. 冲刺模式
    const sprintPlan: PlanResult = {
      queue: [],
      reasonKind: "sprint",
      reasonData: { days: 5, cram: 10, stubborn: 2, due: 0 },
      mode: "sprint",
      targetCount: 12,
    };
    expect(formatPlanReason(sprintPlan, t)).toBe("[plan.sprint]");

    // 2. 到期复习模式
    const duePlan: PlanResult = {
      queue: [],
      reasonKind: "due",
      reasonData: { days: 0, cram: 0, stubborn: 0, due: 8 },
      mode: "regular",
      targetCount: 8,
    };
    expect(formatPlanReason(duePlan, t)).toBe("[plan.due]");

    // 3. 回流模式
    const reflowPlan: PlanResult = {
      queue: [],
      reasonKind: "reflow",
      reasonData: { days: 0, cram: 0, stubborn: 3, due: 0 },
      mode: "regular",
      targetCount: 3,
    };
    expect(formatPlanReason(reflowPlan, t)).toBe("[plan.reflow]");
  });

  it("2. buildDailyPlanSchedule：聚合计算每日备考与时间预算", () => {
    const fakeQuestions: Question[] = [
      {
        id: "q-1",
        type: "single",
        stem: "题目1",
        options: ["A", "B"],
        answer: "A",
        status: "published",
        origin: "manual",
        hash: "h-1",
      },
    ];

    const mockApp = {
      derived: () => ({ wrongbook: new Map() }),
      wrongItems: () => [],
      wrongReasonMap: () => new Map(),
      attempts: {
        all: () => [],
      },
    } as unknown as ExamApp;

    const res = buildDailyPlanSchedule({
      app: mockApp,
      questions: fakeQuestions,
      examDate: "2026-11-15",
      sprintDays: 14,
      dailyGoal: 10,
    });

    expect(res.plan).toBeDefined();
    expect(res.planTime).toBeDefined();
    expect(res.planTime.minutes).toBeGreaterThanOrEqual(0);
  });

  it("3. updateDailyPlanTrace：更新并持久化计划追踪轨迹", async () => {
    let savedTrace: any = null;
    const mockApp = {
      loadAux: vi.fn().mockResolvedValue(null),
      saveAux: vi.fn().mockImplementation((_k, val) => {
        savedTrace = val;
        return Promise.resolve();
      }),
      attempts: {
        all: () => [],
      },
    } as unknown as ExamApp;

    const trace = await updateDailyPlanTrace(mockApp, 5);
    expect(trace).toBeDefined();
    expect(mockApp.saveAux).toHaveBeenCalledWith("plan/trace", expect.any(Object));
    expect(savedTrace).toBe(trace);
  });

  it("4. resolveDailyStudyQueue：计划队列与可用题目的排版解析", () => {
    const qs = [
      { id: "q-1", type: "single" },
      { id: "q-2", type: "material" },
      { id: "q-3", type: "judge" },
    ] as Question[];

    // 1. 无计划时前 10 题兜底并过滤 material
    const fallback = resolveDailyStudyQueue(qs);
    expect(fallback).toHaveLength(2);
    expect(fallback.map((x) => x.id)).toEqual(["q-1", "q-3"]);

    // 2. 提供计划队列时遵循计划队列
    const planned = [{ id: "q-3", type: "judge" }] as Question[];
    const withPlan = resolveDailyStudyQueue(qs, planned);
    expect(withPlan).toHaveLength(1);
    expect(withPlan[0].id).toBe("q-3");
  });

  it("5. extractCriticalForgettingRescueQuestions：提取艾宾浩斯临界题", () => {
    const map = new Map<string, Question>([
      ["q-1", { id: "q-1", stem: "题1" } as any],
      ["q-2", { id: "q-2", stem: "题2" } as any],
    ]);
    const criticalKps = [{ candidateQids: ["q-1", "q-missing", "q-2"] }];

    const res = extractCriticalForgettingRescueQuestions(criticalKps, map, 10);
    expect(res).toHaveLength(2);
    expect(res.map((x) => x.id)).toEqual(["q-1", "q-2"]);
  });

  it("6. formatWeekDayLabel：星期标签格式化", () => {
    // 2026-10-25 是周日
    expect(formatWeekDayLabel("2026-10-25")).toBe("日");
    // 2026-10-26 是周一
    expect(formatWeekDayLabel("2026-10-26")).toBe("一");
  });

  it("7. queryTodayAnsweredIds：过滤提取今日已答题目集合", () => {
    const fixedNow = new Date(2026, 9, 29, 12, 0, 0).getTime();
    const mockApp = {
      attempts: {
        all: () => [
          { qid: "q-1", ts: fixedNow, verdict: "correct" },
          { qid: "q-2", ts: fixedNow, verdict: "not_attempted" }, // 排除
          { qid: "q-3", ts: fixedNow - 86400000 * 2, verdict: "correct" }, // 排除旧事件
        ],
      },
    } as unknown as ExamApp;

    const ids = queryTodayAnsweredIds(mockApp, fixedNow);
    expect(ids.has("q-1")).toBe(true);
    expect(ids.has("q-2")).toBe(false);
    expect(ids.has("q-3")).toBe(false);
  });

  it("8. computeTodayPracticeQueue：根据计划与今日已答题目组装最终推荐题", () => {
    const groupAdjacentFn = (qs: any[]) => qs;
    const practiceQuestions = [{ id: "q-1", type: "single" }, { id: "q-2", type: "single" }] as any;

    // 1. 无计划时直接兜底
    const fallback = computeTodayPracticeQueue({
      plan: null,
      practiceQuestions,
      todayAnsweredIds: new Set(),
      groupAdjacentFn,
    });
    expect(fallback).toHaveLength(2);

    // 2. 有计划时扣除今日已答
    const fakePlan: any = {
      queue: [{ id: "q-1", type: "single" }, { id: "q-2", type: "single" }],
      queueKinds: [],
    };
    const withPlan = computeTodayPracticeQueue({
      plan: fakePlan,
      practiceQuestions,
      todayAnsweredIds: new Set(["q-1"]),
      groupAdjacentFn,
    });
    expect(withPlan).toHaveLength(1);
    expect(withPlan[0].id).toBe("q-2");
  });
});
