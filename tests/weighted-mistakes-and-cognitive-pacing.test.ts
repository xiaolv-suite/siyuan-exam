import { describe, expect, it } from "vitest";
import {
  calculateMistakePriorityScore,
  selectWeightedMistakesForPractice,
} from "../src/core/wrongState";
import {
  orchestrateCognitivePacingWave,
  measurePacingRhythm,
} from "../src/core/adaptiveMockAssembler";
import type { WrongItem, Question } from "../src/core/types";

describe("Station 6: Weighted Mistake Practice & Cognitive Pacing Orchestrator", () => {
  describe("1. 错题本遗忘曲线智能加权复练调度引擎", () => {
    const now = 1762590000000; // 固定基准时间
    const ONE_DAY_MS = 86400000;

    it("精准识别艾宾浩斯遗忘临界窗口 (1天 / 3天 / 7天)", () => {
      // 1 天前做错的题 (约 1.0 天)
      const w1: WrongItem = {
        qid: "q-1d",
        lastWrongAt: now - ONE_DAY_MS,
        wrongCount: 1,
        status: "active",
        streakCorrect: 0,
        tags: [],
      };
      const res1 = calculateMistakePriorityScore(w1, now);
      expect(res1.tier).toBe("critical_spaced");
      expect(res1.urgencyReason).toContain("第1临界期");
      expect(res1.score).toBeGreaterThan(100);

      // 3 天前做错的题
      const w3: WrongItem = {
        qid: "q-3d",
        lastWrongAt: now - 3 * ONE_DAY_MS,
        wrongCount: 1,
        status: "active",
        streakCorrect: 0,
        tags: [],
      };
      const res3 = calculateMistakePriorityScore(w3, now);
      expect(res3.tier).toBe("critical_spaced");
      expect(res3.urgencyReason).toContain("第2临界期");

      // 10 天前做错的题（超出临界窗口，进入常规积压）
      const w10: WrongItem = {
        qid: "q-10d",
        lastWrongAt: now - 10 * ONE_DAY_MS,
        wrongCount: 1,
        status: "active",
        streakCorrect: 0,
        tags: [],
      };
      const res10 = calculateMistakePriorityScore(w10, now);
      expect(res10.tier).toBe("normal_backlog");
      expect(res10.score).toBeLessThan(res1.score);
    });

    it("顽疾重难点错次 >= 3 自动升格为 persistent_leech", () => {
      const wLeech: WrongItem = {
        qid: "q-leech",
        lastWrongAt: now - 5 * ONE_DAY_MS,
        wrongCount: 4, // 错 4 次
        status: "active",
        streakCorrect: 0,
        tags: [],
      };
      const res = calculateMistakePriorityScore(wLeech, now);
      expect(res.tier).toBe("persistent_leech");
      expect(res.urgencyReason).toContain("顽疾重难点");
      expect(res.urgencyReason).toContain("4 次");
      expect(res.score).toBeGreaterThan(90);
    });

    it("selectWeightedMistakesForPractice 正确按优先级排序并打散同考点题目", () => {
      const wrongs: WrongItem[] = [
        { qid: "q-a1", lastWrongAt: now - ONE_DAY_MS, wrongCount: 1, status: "active", kp: "刑法/总则" },
        { qid: "q-a2", lastWrongAt: now - ONE_DAY_MS, wrongCount: 3, status: "active", kp: "刑法/总则" },
        { qid: "q-b1", lastWrongAt: now - 3 * ONE_DAY_MS, wrongCount: 2, status: "active", kp: "民法/合同" },
        { qid: "q-c1", lastWrongAt: now - 15 * ONE_DAY_MS, wrongCount: 1, status: "active", kp: "商法/公司" },
      ];

      const selected = selectWeightedMistakesForPractice(wrongs, 3, { now });
      expect(selected).toHaveLength(3);
      // 第一道应该是权重最高的 q-a2 (1天前错且错了3次)
      expect(selected[0].item.qid).toBe("q-a2");
      // 第二道由于考点离散化，应当避开同为刑法的 q-a1，优先挑出民法的 q-b1
      expect(selected[1].item.qid).toBe("q-b1");
      // 第三道再挑 q-a1
      expect(selected[2].item.qid).toBe("q-a1");
    });
  });

  describe("2. 认知波浪难度梯度智能组卷编排器", () => {
    const makeQ = (id: string, kp: string, diff = 3): Question => ({
      id,
      stem: `题目 ${id}`,
      type: "single",
      answer: "A",
      options: ["A", "B", "C", "D"],
      kp,
      difficulty: diff,
    });

    it("orchestrateCognitivePacingWave 优先将低难度巩固题置于开局", () => {
      const items = [
        { question: makeQ("q1", "刑法", 5), tier: "critical_blindspot" as const, reason: "严重盲区" },
        { question: makeQ("q2", "刑法", 4), tier: "confusing_wrong" as const, reason: "易混淆" },
        { question: makeQ("q3", "民法", 2), tier: "reinforce_common" as const, reason: "常考巩固" },
        { question: makeQ("q4", "商法", 3), tier: "fallback_fill" as const, reason: "补充" },
      ];

      const paced = orchestrateCognitivePacingWave(items, 2);
      expect(paced).toHaveLength(4);
      // 第一道题应该优先被安排为常考巩固题 q3 以建立初始答题信心
      expect(paced[0].question.id).toBe("q3");
    });

    it("measurePacingRhythm 量化评估考卷相邻考点与题族平滑度", () => {
      // 冲突序列（两道相邻刑法题）
      const clashSequence = [
        { question: makeQ("q1", "刑法") },
        { question: makeQ("q2", "刑法") },
        { question: makeQ("q3", "民法") },
      ];
      const resClash = measurePacingRhythm(clashSequence);
      expect(resClash.clashKps).toBe(1);
      expect(resClash.rhythmScore).toBeLessThan(100);

      // 平滑序列（刑法、民法、商法各不相邻）
      const smoothSequence = [
        { question: makeQ("q1", "刑法") },
        { question: makeQ("q3", "民法") },
        { question: makeQ("q2", "商法") },
      ];
      const resSmooth = measurePacingRhythm(smoothSequence);
      expect(resSmooth.clashKps).toBe(0);
      expect(resSmooth.rhythmScore).toBe(100);
    });
  });
});
