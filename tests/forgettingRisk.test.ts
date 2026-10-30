import { describe, it, expect } from "vitest";
import type { Question, AttemptEvent } from "../src/core/types";
import {
  auditForgettingRisks,
  exportForgettingRiskMarkdown,
  calculateRetrievability,
  optimalReviewInterval,
  updateDsrState,
  DEFAULT_DSR_STATE,
} from "../src/core/forgettingRisk";

describe("艾宾浩斯记忆遗忘衰退评估与考点急救引擎 (forgettingRisk)", () => {
  const now = new Date("2026-10-23T12:00:00Z").getTime();
  const dayMs = 86_400_000;

  const qs: Question[] = [
    { id: "q1", type: "single", stem: "考点A题1", options: ["A", "B"], answer: "A", kp: "考点A" },
    { id: "q2", type: "single", stem: "考点A题2", options: ["A", "B"], answer: "A", kp: "考点A" },
    { id: "q3", type: "single", stem: "考点B题1", options: ["A", "B"], answer: "A", kp: "考点B" },
    { id: "q4", type: "single", stem: "考点C题1", options: ["A", "B"], answer: "A", kp: "考点C" }, // 从未练过
  ];

  it("auditForgettingRisks 准确量化考点遗忘风险分级与急救候选题", () => {
    // 模拟流水：
    // 考点A：昨天刚做过 (1天前)，正确率 100% -> fresh
    // 考点B：10天前做过，且做错 -> critical
    // 考点C：从未做过 -> critical
    const attempts: AttemptEvent[] = [
      { v: 1, eid: "e1", qid: "q1", verdict: "correct", ts: now - 1 * dayMs },
      { v: 1, eid: "e2", qid: "q3", verdict: "wrong", ts: now - 10 * dayMs },
    ];

    const report = auditForgettingRisks(qs, attempts, now);

    expect(report.evaluatedKpCount).toBe(3);
    expect(report.criticalCount).toBeGreaterThanOrEqual(2); // 考点B 和 考点C
    expect(report.freshCount).toBeGreaterThanOrEqual(1); // 考点A

    const kpB = report.items.find((k) => k.kp === "考点B");
    expect(kpB?.riskTier).toBe("critical");
    expect(kpB?.daysSinceLast).toBe(10);
    expect(kpB?.estimatedRetentionPct).toBeLessThan(40);
    expect(kpB?.advice).toContain("临界衰退区");
    expect(kpB?.candidateQids).toContain("q3");

    const kpA = report.items.find((k) => k.kp === "考点A");
    expect(kpA?.riskTier).toBe("fresh");
    expect(kpA?.daysSinceLast).toBe(1);
    expect(kpA?.estimatedRetentionPct).toBeGreaterThanOrEqual(60);

    // 紧急抢救清单排在最前
    expect(report.urgentRescueKps.length).toBeGreaterThanOrEqual(2);
    expect(["考点B", "考点C"]).toContain(report.urgentRescueKps[0].kp);

    // 导出 Markdown 报告
    const md = exportForgettingRiskMarkdown(report);
    expect(md).toContain("艾宾浩斯记忆衰退与考点遗忘风险预警报告");
    expect(md).toContain("优先抢救考点清单");
    expect(md).toContain("考点B");
  });

  describe("现代记忆动力学 DSR 模型 (FSRS 规范)", () => {
    it("calculateRetrievability 幂律遗忘衰减正确性", () => {
      // 0 天时可提取度为 1.0
      expect(calculateRetrievability(5, 0)).toBe(1.0);
      // 5 天稳定性在第 5 天时降为 1/e ≈ 0.368
      expect(calculateRetrievability(5, 5)).toBeCloseTo(Math.exp(-1), 2);
      // 稳定性越高，同天数下保留率越高
      expect(calculateRetrievability(10, 5)).toBeGreaterThan(calculateRetrievability(2, 5));
    });

    it("optimalReviewInterval 依据目标保留率反推最佳间隔", () => {
      // 稳定性为 10 天，目标 90% 保留率时，间隔应约为 1 天
      const iv = optimalReviewInterval(10, 0.90);
      expect(iv).toBeGreaterThanOrEqual(1);
      // 目标保留率越低（容忍更多遗忘），允许间隔天数越长
      expect(optimalReviewInterval(10, 0.70)).toBeGreaterThan(optimalReviewInterval(10, 0.90));
    });

    it("updateDsrState 答对稳定性跃升，答错大幅重置", () => {
      const state0 = { ...DEFAULT_DSR_STATE, stability: 3.0 };

      // 独立答对：稳定性跃升
      const s1 = updateDsrState(state0, "correct", { selfRating: 3 });
      expect(s1.stability).toBeGreaterThan(state0.stability);
      expect(s1.consecutiveCorrect).toBe(1);

      // 答错：稳定性回落重置
      const sWrong = updateDsrState(s1, "wrong");
      expect(sWrong.stability).toBeLessThan(s1.stability);
      expect(sWrong.consecutiveWrong).toBe(1);
      expect(sWrong.consecutiveCorrect).toBe(0);
    });

    it("受助作答（helped）答对增益显著打折（Perseus / LogiNote 准则）", () => {
      const state = { ...DEFAULT_DSR_STATE, stability: 4.0 };
      const solo = updateDsrState(state, "correct", { helped: false });
      const helped = updateDsrState(state, "correct", { helped: true });

      // 受助后稳定性提升幅度明显低于独立回忆答对
      expect(helped.stability).toBeLessThan(solo.stability);
      expect(helped.stability).toBeGreaterThan(state.stability);
    });
  });
});
