import { describe, it, expect } from "vitest";
import { diagnoseQuestionRootCauses } from "../src/core/diagnosticEngine";
import type { Question } from "../src/core/types";

describe("错题自适应先修根因溯源与攻克诊断引擎 (diagnosticEngine - DIAG-01/02/03)", () => {
  const bankQuestions: Question[] = [
    {
      id: "q-target",
      type: "single",
      stem: "已知二次函数 f(x) = ax^2 + bx + c 恒大于0，求参数范围",
      options: ["A", "B", "C", "D"],
      answer: "A",
      kp: "高中数学/函数/二次函数",
      prerequisites: ["一元二次方程判别式", "完全平方公式"],
      origin: "manual",
      score: 5,
      hash: "h-target",
    },
    {
      id: "q-prereq-1",
      type: "single",
      stem: "若方程 x^2 - 4x + k = 0 有两个不等实根，则判别式 Δ > 0",
      options: ["A", "B", "C", "D"],
      answer: "B",
      kp: "一元二次方程判别式",
      origin: "manual",
      score: 3,
      hash: "h-p1",
    },
    {
      id: "q-prereq-2",
      type: "single",
      stem: "展开 (a + b)^2",
      options: ["A", "B", "C", "D"],
      answer: "C",
      kp: "完全平方公式",
      origin: "manual",
      score: 2,
      hash: "h-p2",
    },
  ];

  it("1. 显式先修声明：准确追踪前置知识点并生成根因溯源报告", () => {
    // 假设考生在「一元二次方程判别式」上 3 错 0 对（正确率 0%）
    // 在「完全平方公式」上 2 对 1 错（正确率 67%）
    const attempts = [
      { questionId: "q-prereq-1", correct: false, kp: "一元二次方程判别式" },
      { questionId: "q-prereq-1", correct: false, kp: "一元二次方程判别式" },
      { questionId: "q-prereq-1", correct: false, kp: "一元二次方程判别式" },
      { questionId: "q-prereq-2", correct: true, kp: "完全平方公式" },
      { questionId: "q-prereq-2", correct: false, kp: "完全平方公式" },
      { questionId: "q-prereq-2", correct: true, kp: "完全平方公式" },
    ];
    const wrongQids = new Set(["q-prereq-1"]);

    const report = diagnoseQuestionRootCauses(bankQuestions[0], bankQuestions, attempts, wrongQids);

    expect(report.targetQid).toBe("q-target");
    expect(report.targetKp).toBe("高中数学/函数/二次函数");

    // 核心断言：一元二次方程判别式被准确识别为薄弱根因
    expect(report.rootCauses.length).toBe(1);
    expect(report.rootCauses[0].kp).toBe("一元二次方程判别式");
    expect(report.rootCauses[0].status).toBe("root_cause");
    expect(report.rootCauses[0].reason).toContain("薄弱根因");

    // 核心断言：完全平方公式被识别为不稳考点
    expect(report.shakyNodes.length).toBe(1);
    expect(report.shakyNodes[0].kp).toBe("完全平方公式");
    expect(report.shakyNodes[0].status).toBe("shaky");

    // 验证学习路径规划：先修在先（阶段 1 根因 -> 阶段 2 巩固 -> 阶段 3 父级摸底 -> 阶段 4 冲刺目标）
    expect(report.learningPath.length).toBe(4);
    expect(report.learningPath[0].stage).toBe(1);
    expect(report.learningPath[0].kp).toBe("一元二次方程判别式");
    expect(report.learningPath[1].stage).toBe(2);
    expect(report.learningPath[1].kp).toBe("完全平方公式");
    expect(report.learningPath[2].stage).toBe(3);
    expect(report.learningPath[2].kp).toBe("高中数学/函数");
    expect(report.learningPath[3].stage).toBe(4);
    expect(report.learningPath[3].kp).toBe("高中数学/函数/二次函数");
  });

  it("2. 自动从斜杠层级考点提炼前置父考点", () => {
    const qWithoutPrereqs: Question = {
      id: "q-geo",
      type: "single",
      stem: "全等三角形判定定理应用",
      options: ["A", "B"],
      answer: "A",
      kp: "初中数学/平面几何/全等三角形",
      origin: "manual",
      score: 3,
      hash: "h-geo",
    };

    const report = diagnoseQuestionRootCauses(qWithoutPrereqs, [qWithoutPrereqs], []);
    // 自动提取到 "初中数学/平面几何"
    const foundParent = report.learningPath.some((p) => p.kp === "初中数学/平面几何");
    expect(foundParent).toBe(true);
  });
});
