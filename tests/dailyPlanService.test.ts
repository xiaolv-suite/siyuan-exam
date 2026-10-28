import { describe, it, expect, vi } from "vitest";
import {
  formatPlanReason,
  buildDailyPlanSchedule,
  updateDailyPlanTrace,
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
});
