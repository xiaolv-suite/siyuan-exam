import { describe, it, expect } from "vitest";
import { buildInteractiveReviewSheetPro } from "../src/core/printPro";
import type { Question } from "../src/core/types";

describe("离线交互式讲题自测卷 (buildInteractiveReviewSheetPro)", () => {
  const sampleQuestions: Question[] = [
    {
      id: "q-single-1",
      type: "single",
      stem: "已知函数 $f(x) = x^2 - 2x + 1$，其对称轴方程是？",
      options: ["x = 1", "x = -1", "x = 2", "x = 0"],
      answer: "A",
      analysis: "根据二次函数对称轴公式 $x = -b / (2a)$，代入得 $x = 1$。",
      expansion: "一题多解与秒杀：利用配方法 $f(x)=(x-1)^2$ 顶点为 $(1,0)$，立即得出对称轴为 $x=1$。",
      kp: "高中数学/二次函数",
      score: 5,
      origin: "manual",
      hash: "h1",
    },
    {
      id: "q-judge-1",
      type: "judge",
      stem: "奇函数的图象关于原点中心对称。",
      options: [],
      answer: "对",
      analysis: "由奇函数定义 $f(-x) = -f(x)$ 可知其关于原点中心对称。",
      kp: "高中数学/函数性质",
      score: 3,
      origin: "manual",
      hash: "h2",
    },
    {
      id: "q-fill-1",
      type: "fill",
      stem: "光在真空中的传播速度约为____m/s，声音在空气中约为____m/s。",
      options: [],
      answer: "3×10^8;;340",
      analysis: "常识性物理常数数值填空。",
      kp: "物理常识",
      score: 4,
      origin: "manual",
      hash: "h3",
    },
    {
      id: "q-short-1",
      type: "short",
      stem: "简述牛顿第一定律的核心内容及其物理意义。",
      options: [],
      answer: "一切物体在没有受到力的作用时，总保持静止状态或匀速直线运动状态。",
      analysis: "指出力是改变物体运动状态的原因，而非维持运动的原因。",
      kp: "高中物理/牛顿力学",
      score: 8,
      origin: "manual",
      hash: "h4",
      rubric: {
        total: 8,
        criteria: [
          { name: "定律表述", points: 4, desc: "准确描述不受力时保持静止或匀速直线运动" },
          { name: "惯性本质", points: 2, desc: "揭示物体固有惯性属性" },
          { name: "力的本质", points: 2, desc: "明确力是改变运动状态的原因" },
        ],
      },
    },
  ];

  it("1. 基础结构完备：生成离线独立单文件，含讲评模式与自测模式切换器", () => {
    const html = buildInteractiveReviewSheetPro("高考数理综合特训卷", sampleQuestions);
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("高考数理综合特训卷 · 交互式讲题自测卷");
    expect(html).toContain("共 4 题");
    expect(html).toContain("总计 20 分");
    expect(html).toContain("btn-mode-lecture");
    expect(html).toContain("btn-mode-test");
    expect(html).toContain("scoreboard");
  });

  it("2. 题型渲染完备：选择题、判断题、多空填空与带采分点简答题", () => {
    const html = buildInteractiveReviewSheetPro("测试卷", sampleQuestions);
    // 单选
    expect(html).toContain("q-single-1");
    expect(html).toContain("x = 1");
    // 判断
    expect(html).toContain("正确 (True)");
    expect(html).toContain("错误 (False)");
    // 填空多空显示
    expect(html).toContain("空①: 3×10^8 · 空②: 340");
    // 采分点标准
    expect(html).toContain("官方采分点细则标准");
    expect(html).toContain("定律表述");
    expect(html).toContain("4分");
  });

  it("3. 包含离线即时自测评分与答案揭晓客户端逻辑", () => {
    const html = buildInteractiveReviewSheetPro("测试卷", sampleQuestions);
    expect(html).toContain("function submitSelfTest()");
    expect(html).toContain("function toggleAnswer(btn)");
    expect(html).toContain("function toggleAllAnswers(expand)");
    expect(html).toContain("scoreboard");
    expect(html).toContain("is-correct");
    expect(html).toContain("is-wrong");
  });

  it("4. 支持四层结构之「💡 思路拓展与秒杀技巧」独立卡片渲染 (AUTH-02)", () => {
    const html = buildInteractiveReviewSheetPro("测试卷", sampleQuestions);
    expect(html).toContain("💡 思路拓展与秒杀技巧");
    expect(html).toContain("利用配方法");
  });

  it("5. 包含自测作答书写留白区与 @media print 智能防截断分页 (EXAM-02 / EXAM-03)", () => {
    const html = buildInteractiveReviewSheetPro("测试卷", sampleQuestions);
    expect(html).toContain("test-answer-space");
    expect(html).toContain("✍️ 作答书写留白区");
    expect(html).toContain("break-inside: avoid");
    expect(html).toContain("page-break-inside: avoid");
  });
});
