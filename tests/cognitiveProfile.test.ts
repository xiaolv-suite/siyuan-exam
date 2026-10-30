import { describe, it, expect } from "vitest";
import type { Question, AttemptEvent, WrongItem } from "../src/core/types";
import {
  evaluateCognitiveProfile,
  buildCognitiveProfilePrefix,
  DEFAULT_COGNITIVE_PROFILE,
} from "../src/core/cognitiveProfile";
import { makeQuestion } from "../src/core/blockTemplate";

describe("学习者三层认知能力与错误模式画像引擎 (cognitiveProfile)", () => {
  const qConcept: Question = { ...makeQuestion({ type: "judge", stem: "判断题1", answer: "对" }), id: "qc1" };
  const qJudge: Question = { ...makeQuestion({ type: "multiple", stem: "多选题1", options: ["A", "B", "C"], answer: "AB" }), id: "qj1" };
  const qReasoning: Question = { ...makeQuestion({ type: "short", stem: "简答论述题1", answer: "详述因果链" }), id: "qr1" };

  it("空作答记录时安全返回默认画像且处于未激活状态 (isTrusted: false)", () => {
    const profile = evaluateCognitiveProfile([], []);
    expect(profile).toEqual(DEFAULT_COGNITIVE_PROFILE);
    expect(profile.isTrusted).toBe(false);
    expect(buildCognitiveProfilePrefix(profile)).toBe("");
  });

  it("evaluateCognitiveProfile 准确评估三层认知能力与高频错误模式", () => {
    const attempts: AttemptEvent[] = [
      // 概念题答对
      { v: 1, eid: "e1", qid: "qc1", verdict: "correct", ts: 1000, seq: 1, device: "d1", sessionId: "s1", queue: "normal" },
      // 判断题答错并发生改答
      {
        v: 1,
        eid: "e2",
        qid: "qj1",
        verdict: "wrong",
        myAnswer: "AC",
        firstAnswer: "A",
        edits: [{ to: "AC", reason: "unsure" }],
        ts: 2000,
        seq: 2,
        device: "d1",
        sessionId: "s1",
        queue: "normal",
      },
      // 另一道判断题答错并改答
      {
        v: 1,
        eid: "e3",
        qid: "qj1",
        verdict: "wrong",
        myAnswer: "BC",
        edits: [{ to: "BC", reason: "misclick" }],
        ts: 3000,
        seq: 3,
        device: "d1",
        sessionId: "s1",
        queue: "normal",
      },
      // 推理题答对
      { v: 1, eid: "e4", qid: "qr1", verdict: "correct", myAnswer: "深入推理内容", ts: 4000, seq: 4, device: "d1", sessionId: "s1", queue: "normal" },
    ];

    const wrongs: WrongItem[] = [
      { qid: "qj1", firstWrongAt: 2000, lastWrongAt: 3000, wrongCount: 2, streakCorrect: 0, reason: "trap", myAnswer: "BC", status: "active" },
    ];

    const profile = evaluateCognitiveProfile(attempts, [qConcept, qJudge, qReasoning], wrongs);

    expect(profile.isTrusted).toBe(true);
    expect(profile.evidenceCount).toBe(4);
    // 概念层得分高于判断层（判断层答错两次）
    expect(profile.layeredAbility.conceptScore).toBeGreaterThan(profile.layeredAbility.judgmentScore);
    expect(profile.layeredAbility.reasoningScore).toBe(100);

    // 错误模式库捕获陷阱题与改答易错
    expect(profile.mistakePatterns.length).toBeGreaterThanOrEqual(1);
    const trapPattern = profile.mistakePatterns.find((p) => p.pattern.includes("陷阱"));
    expect(trapPattern).toBeDefined();
    expect(trapPattern?.count).toBe(2);

    // 序列化紧凑前缀
    const prefix = buildCognitiveProfilePrefix(profile);
    expect(prefix).toContain("【学习者认知画像】");
    expect(prefix).toContain("概念清晰度");
    expect(prefix).toContain("判断合理性");
    expect(prefix).toContain("推理有效性");
    expect(prefix.length).toBeLessThan(250);
  });

  it("未达样本门槛 (isTrusted=false) 坚决不输出前缀，杜绝标签化", () => {
    // 仅 1 条作答记录
    const fewAttempts: AttemptEvent[] = [
      { v: 1, eid: "e1", qid: "qc1", verdict: "correct", ts: 1000, seq: 1, device: "d1", sessionId: "s1", queue: "normal" },
    ];

    const profile = evaluateCognitiveProfile(fewAttempts, [qConcept]);
    expect(profile.isTrusted).toBe(false);
    expect(buildCognitiveProfilePrefix(profile)).toBe("");
  });
});
