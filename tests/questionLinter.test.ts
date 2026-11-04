import { describe, it, expect } from "vitest";
import {
  lintQuestion,
  autoFixQuestion,
  pruneQuestionOptions,
  convertQuestionToShort,
  convertFillWithoutBlankToShort,
} from "@/core/questionLinter";
import { decodeCompactAnswerMatrix, autoHealExamText } from "@/importer/examSegmenter";
import type { Question } from "@/core/types";

describe("试题质检巡检与置信度评分引擎 (questionLinter)", () => {
  it("1. 完美单选题：结构严谨，评分为 100 分且为 high 等级", () => {
    const q: Partial<Question> = {
      type: "single",
      stem: "计算机中负责算术逻辑运算的部件是什么？",
      options: ["控制器", "运算器 (ALU)", "内存储器", "寄存器"],
      answer: "B",
      analysis: "ALU 是负责算术和逻辑运算的核心部件。",
    };

    const report = lintQuestion(q);
    expect(report.score).toBe(100);
    expect(report.level).toBe("high");
    expect(report.issues).toHaveLength(0);
  });

  it("2. 异常质检：缺少答案、选项过少、答案越界及空题干告警", () => {
    // 缺少答案
    const noAnsReport = lintQuestion({
      type: "single",
      stem: "这是一道缺少答案的选择题？",
      options: ["选项A", "选项B"],
      answer: "",
    });
    expect(noAnsReport.score).toBeLessThan(80);
    expect(noAnsReport.level).not.toBe("high");
    expect(noAnsReport.issues.some((i) => i.code === "MISSING_ANSWER")).toBe(true);

    // 选项只有 1 项且答案超出选项范围
    const outOfBoundsReport = lintQuestion({
      type: "single",
      stem: "这是一道选项不全且答案越界的题目？",
      options: ["仅有的选项A"],
      answer: "D",
    });
    expect(outOfBoundsReport.issues.some((i) => i.code === "FEW_OPTIONS")).toBe(true);
    expect(outOfBoundsReport.issues.some((i) => i.code === "ANSWER_OUT_OF_BOUNDS")).toBe(true);

    // 存在重复选项
    const dupeOptsReport = lintQuestion({
      type: "single",
      stem: "有重复选项的试题？",
      options: ["相同内容", "相同内容", "不同内容"],
      answer: "A",
    });
    expect(dupeOptsReport.issues.some((i) => i.code === "DUPLICATE_OPTIONS")).toBe(true);
  });

  it("3. 判断题质检：答案异常格式检测", () => {
    const judgeReport = lintQuestion({
      type: "judge",
      stem: "质数只能被 1 和自身整除。",
      answer: "也许正确",
    });
    expect(judgeReport.issues.some((i) => i.code === "INVALID_JUDGE_ANSWER")).toBe(true);
  });

  it("4. autoFixQuestion 自动纠偏：大小写归一、判断题答案修正与负数选项保护", () => {
    const rawQ: Question = {
      id: "q-test-fix",
      type: "single",
      stem: "关于负数计算：\n\n\n-3 + (-1) = (   )\n\n",
      options: ["-4", "-2", "4", "2"],
      answer: "a", // 小写 a
      score: 3,
      origin: "imported",
      hash: "hash-raw",
    };

    const { question: fixedQ, fixedIssues } = autoFixQuestion(rawQ);

    // 答案小写转大写
    expect(fixedQ.answer).toBe("A");
    expect(fixedIssues.some((msg) => msg.includes("大写"))).toBe(true);
    // 题干多余空行被压缩
    expect(fixedQ.stem).not.toContain("\n\n\n");
    // 选项中的负号 "-4" 和 "-2" 完好无损，没有被错误当作列表连字符误删！
    expect(fixedQ.options[0]).toBe("-4");
    expect(fixedQ.options[1]).toBe("-2");
    // 置信度重新刷新
    expect(fixedQ.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it("5. 判断题 autoFixQuestion：'正确' 归一化为 '对'", () => {
    const rawJudge: Question = {
      id: "q-judge-fix",
      type: "judge",
      stem: "地球是圆的。",
      options: [],
      answer: "正确",
      score: 2,
      origin: "imported",
      hash: "hash-judge",
    };

    const { question: fixedJudge } = autoFixQuestion(rawJudge);
    expect(fixedJudge.answer).toBe("对");
  });

  it("5. 异常超量选项（10+选项）质检降权与自动裁切", () => {
    const rawExcess: Question = {
      id: "q-excess",
      type: "single",
      stem: "这是一道误将12个列表项当成选项的题目：",
      options: ["项1", "项2", "项3", "项4", "项5", "项6", "项7", "项8", "项9", "项10", "项11", "项12"],
      answer: "B",
      score: 1,
      origin: "imported",
      hash: "hash-excess",
    };

    const report = lintQuestion(rawExcess);
    expect(report.issues.some((i) => i.code === "TOO_MANY_OPTIONS")).toBe(true);

    const { question: fixedQ } = autoFixQuestion(rawExcess);
    expect(fixedQ.options.length).toBeLessThanOrEqual(6);
    expect(fixedQ.analysis).toContain("裁切的多余选项归档");

    // 单独测试 pruneQuestionOptions
    const pruned = pruneQuestionOptions(rawExcess, 4);
    expect(pruned.options).toHaveLength(4);
    expect(pruned.analysis).toContain("项5");
  });

  it("6. 无有效答案的超量选项题一键安全降级转为简答题", () => {
    const malformed: Question = {
      id: "q-malformed",
      type: "single",
      stem: "这是一份没有答案的大纲清单：",
      options: ["条目1", "条目2", "条目3", "条目4", "条目5", "条目6", "条目7"],
      answer: "",
      score: 1,
      origin: "imported",
      hash: "hash-malformed",
    };

    const converted = convertQuestionToShort(malformed);
    expect(converted.type).toBe("short");
    expect(converted.options).toHaveLength(0);
    expect(converted.answer).toContain("条目1");
  });

  it("7. 填空题题干缺失挖空占位符质检告警与自愈纠偏至简答题", () => {
    // 问答句式无挖空
    const pseudoFill: Question = {
      id: "q-pseudo-fill-1",
      type: "fill",
      stem: "什么是死锁？",
      options: [],
      answer: "死锁是指多个进程因争夺资源造成的互相等待。",
      score: 2,
      origin: "imported",
      hash: "hash-pseudo-1",
    };

    const report = lintQuestion(pseudoFill);
    expect(report.issues.some((i) => i.code === "FILL_WITHOUT_BLANK")).toBe(true);
    expect(report.score).toBeLessThanOrEqual(80);

    // autoFixQuestion 自动纠偏为简答题
    const { question: fixedQ, fixedIssues } = autoFixQuestion(pseudoFill);
    expect(fixedQ.type).toBe("short");
    expect(fixedIssues.some((m) => m.includes("简答题"))).toBe(true);
    expect(fixedQ.confidence).toBeGreaterThanOrEqual(0.85);

    // convertFillWithoutBlankToShort 显式转换
    const explicitConverted = convertFillWithoutBlankToShort(pseudoFill);
    expect(explicitConverted.type).toBe("short");

    // 真正带挖空的填空题不应告警
    const genuineFill: Question = {
      id: "q-genuine-fill",
      type: "fill",
      stem: "死锁是指多个进程因争夺资源造成的（   ）。",
      options: [],
      answer: "互相等待",
      score: 2,
      origin: "imported",
      hash: "hash-genuine",
    };
    const genuineReport = lintQuestion(genuineFill);
    expect(genuineReport.issues.some((i) => i.code === "FILL_WITHOUT_BLANK")).toBe(false);
    expect(genuineReport.score).toBe(100);
  });
});

describe("密集型与矩阵式答案卡解码器 (decodeCompactAnswerMatrix)", () => {
  it("1. 支持 1-5: A B C D A 及 6-10: C B A D D 范围型展开", () => {
    const text = `
【参考答案】
1-5: A B C D A
6-10: C B A D D
`;
    const matrix = decodeCompactAnswerMatrix(text);
    expect(matrix.get(1)).toBe("A");
    expect(matrix.get(2)).toBe("B");
    expect(matrix.get(3)).toBe("C");
    expect(matrix.get(4)).toBe("D");
    expect(matrix.get(5)).toBe("A");
    expect(matrix.get(6)).toBe("C");
    expect(matrix.get(7)).toBe("B");
    expect(matrix.get(8)).toBe("A");
    expect(matrix.get(9)).toBe("D");
    expect(matrix.get(10)).toBe("D");
  });

  it("2. 支持无空格连续字符串：1~5 BACDA", () => {
    const text = `
【答案】
1~5 BACDA
`;
    const matrix = decodeCompactAnswerMatrix(text);
    expect(matrix.get(1)).toBe("B");
    expect(matrix.get(2)).toBe("A");
    expect(matrix.get(3)).toBe("C");
    expect(matrix.get(4)).toBe("D");
    expect(matrix.get(5)).toBe("A");
  });

  it("3. 支持单行密集题号键值对：1.A 2.B 3.C 4.D 5.A", () => {
    const text = "1.A  2.B  3.C  4.D  5.A";
    const matrix = decodeCompactAnswerMatrix(text);
    expect(matrix.size).toBe(5);
    expect(matrix.get(1)).toBe("A");
    expect(matrix.get(3)).toBe("C");
    expect(matrix.get(5)).toBe("A");
  });

  it("4. 支持判断题符号紧凑列表：1-3: √ × √", () => {
    const text = "1-3: √ × √";
    const matrix = decodeCompactAnswerMatrix(text);
    expect(matrix.get(1)).toBe("√");
    expect(matrix.get(2)).toBe("×");
    expect(matrix.get(3)).toBe("√");
  });
});

describe("OCR 与试卷文本自愈清洗机 (autoHealExamText)", () => {
  it("修复全角点与 OCR 识别错误题号", () => {
    const raw = `
1．第一题题干
l. 第二题题干误把数字1识别为小写l
I. 第三题题干误把数字1识别为大写I
`;
    const healed = autoHealExamText(raw);
    expect(healed).toContain("1. 第一题题干");
    expect(healed).toContain("1. 第二题题干");
    expect(healed).toContain("1. 第三题题干");
  });
});
