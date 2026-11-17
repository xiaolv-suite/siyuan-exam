// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import {
  loadRubricArchiveAux,
  calculateCurrentRubricScore,
  recordRubricAssessmentAux,
  autoAlignRubricEvaluation,
  exportRubricBreakdownCsvFile,
  executeRecordRubricAssessment,
  RUBRIC_ARCHIVE_KEY,
} from "@/ui/practice/services/rubricAssessmentService";
import type { Question } from "@/core/types";
import type { ExamApp } from "@/app";
import type { RubricSpec } from "@/core/rubric";

describe("主观题量规与自评管理服务 (rubricAssessmentService)", () => {
  const fakeRubric: RubricSpec = {
    v: 1,
    revision: 1,
    fullScore: 10,
    criteria: [
      {
        id: "c1",
        label: "要点明确",
        weight: 0.6,
      },
      {
        id: "c2",
        label: "论证充分",
        weight: 0.4,
      },
    ],
  };

  const fakeQuestion: Question = {
    id: "q-sub-1",
    type: "short",
    stem: "简述牛顿三大定律的核心内容",
    answer: "第一定律惯性，第二定律F=ma，第三定律作用反作用",
    options: [],
    score: 10,
    rubric: fakeRubric,
  } as any;

  it("1. loadRubricArchiveAux：正常载入与容错回退", async () => {
    // 1. 正常返回存档
    const mockApp = {
      loadAux: vi.fn().mockResolvedValue({
        "q-sub-1": { finalScore: 8, fullScore: 10 },
      }),
    } as unknown as ExamApp;

    const res = await loadRubricArchiveAux(mockApp);
    expect(res["q-sub-1"]).toBeDefined();
    expect(res["q-sub-1"].finalScore).toBe(8);

    // 2. 异常回退空对象
    const failApp = {
      loadAux: vi.fn().mockRejectedValue(new Error("磁盘错误")),
    } as unknown as ExamApp;
    const fallback = await loadRubricArchiveAux(failApp);
    expect(fallback).toEqual({});
  });

  it("2. calculateCurrentRubricScore：按打分等级核算总分与未评项", () => {
    // 1. 无 rubric 题目返回 null
    expect(calculateCurrentRubricScore({} as Question, {}, {})).toBeNull();

    // 2. 全部评定
    const ratings = { c1: "full" as const, c2: "partial" as const };
    const notes = { c1: "条理清楚", c2: "缺少反作用力公式" };
    const score = calculateCurrentRubricScore(fakeQuestion, ratings, notes);

    expect(score).not.toBeNull();
    // c1(6*1=6) + c2(4*0.5=2) = 8
    expect(score?.finalScore).toBe(8);
    expect(score?.fullScore).toBe(10);
    expect(score?.unratedCount).toBe(0);

    // 3. 部分评定
    const partialScore = calculateCurrentRubricScore(fakeQuestion, { c1: "partial" as const }, {});
    expect(partialScore).not.toBeNull();
    expect(partialScore?.unratedCount).toBe(1);
  });

  it("3. recordRubricAssessmentAux：快照生成与持久化存储", async () => {
    let savedKey = "";
    let savedVal: any = null;
    const mockApp = {
      saveAux: vi.fn().mockImplementation((k, v) => {
        savedKey = k;
        savedVal = v;
        return Promise.resolve();
      }),
    } as unknown as ExamApp;

    const score = calculateCurrentRubricScore(fakeQuestion, { c1: "full" as const, c2: "full" as const }, {})!;
    const archive = {};

    const { nextArchive, snapshot } = await recordRubricAssessmentAux(mockApp, archive, fakeQuestion, score);
    expect(savedKey).toBe(RUBRIC_ARCHIVE_KEY);
    expect(nextArchive["q-sub-1"]).toBe(snapshot);
    expect(snapshot.finalScore).toBe(10);
    expect(savedVal["q-sub-1"]).toBeDefined();
  });

  it("4. autoAlignRubricEvaluation：根据学生作答自动对齐打分", () => {
    const studentAnswer = "第一定律惯性，第二定律牛顿力学公式 F=ma，第三定律作用力与反作用力相等。";
    const evalRes = autoAlignRubricEvaluation(fakeQuestion, studentAnswer);

    expect(evalRes).toBeDefined();
    expect(evalRes.recommendedRatings).toBeDefined();
    expect(evalRes.matchRatio).toBeTypeOf("number");
  });

  it("5. exportRubricBreakdownCsvFile：导出 CSV 文件并不报错", () => {
    const score = calculateCurrentRubricScore(fakeQuestion, { c1: "full" as const, c2: "half" as const }, {})!;
    // 验证在 JSDOM 下执行无抛错
    expect(() => exportRubricBreakdownCsvFile(score)).not.toThrow();
  });

  it("6. executeRecordRubricAssessment：自评持久化全流程与通知", async () => {
    const showMessage = vi.fn();
    const t = (k: string) => `[${k}]`;
    const mockApp = {
      saveAux: vi.fn().mockResolvedValue(undefined),
    } as unknown as ExamApp;
    const score = calculateCurrentRubricScore(fakeQuestion, { c1: "full" as const, c2: "full" as const }, {})!;

    const res = await executeRecordRubricAssessment({
      app: mockApp,
      rubricArchive: {},
      q: fakeQuestion,
      rubricScore: score,
      showMessage,
      t,
    });

    expect(res.saved).toBe(true);
    expect(res.nextArchive["q-sub-1"]).toBeDefined();
    expect(showMessage).toHaveBeenCalledWith(expect.stringContaining("[rubric.recordedFinal]"), 2600, "info");
  });
});
