import { describe, it, expect } from "vitest";
import { segmentExamPaper } from "@/importer/examSegmenter";

describe("整卷智能切题与答案反向缝合引擎 (examSegmenter)", () => {
  it("1. 标准试卷切分：大题标题识别、题型继承、单行水平多选项与分值解析", () => {
    const rawExam = `
注意事项：请将答案填写在答题卡上，严禁在试卷上作答。

一、单项选择题（本大题共2小题，每题3分）
1. 已知集合 A = {1, 2}, B = {2, 3}，则 A ∩ B 为（   ）
A. {1}    B. {2}    C. {3}    D. {1, 2, 3}
【答案】B
【解析】交集表示公共元素，公共元素为 2。

2. 函数 f(x) = x^2 - 1 的零点个数为（ A ）
A. 2
B. 1
C. 0
D. 无数个
解析：令 x^2 - 1 = 0 得 x = ±1，共两个零点。

二、填空题（每题4分）
3. 计算：2^3 + (-1)^2 = ____。
【答案】9
【解析】原式 = 8 + 1 = 9。

三、解答题（每题10分）
4. 解方程：2x + 5 = 11。
【答案】x = 3
【解析】移项得 2x = 6，系数化为 1 得 x = 3。
`;

    const result = segmentExamPaper(rawExam, { source: "2026年期末统一质量监测" });

    expect(result.warnings.some((w) => w.includes("注意事项"))).toBe(true);
    expect(result.sections).toHaveLength(3);
    expect(result.sections[0].title).toContain("单项选择题");
    expect(result.sections[1].title).toContain("填空题");
    expect(result.sections[2].title).toContain("解答题");

    expect(result.questions).toHaveLength(4);

    // 第 1 题（单选，单行水平切分 A/B/C/D）
    const q1 = result.questions[0];
    expect(q1.type).toBe("single");
    expect(q1.stem).toContain("已知集合 A");
    expect(q1.options).toEqual(["{1}", "{2}", "{3}", "{1, 2, 3}"]);
    expect(q1.answer).toBe("B");
    expect(q1.analysis).toContain("公共元素为 2");
    expect(q1.score).toBe(3);

    // 第 2 题（括号内自动挖空并将 A 提取为答案）
    const q2 = result.questions[1];
    expect(q2.type).toBe("single");
    expect(q2.stem).toContain("函数 f(x) = x^2 - 1 的零点个数为（   ）");
    expect(q2.options).toEqual(["2", "1", "0", "无数个"]);
    expect(q2.answer).toBe("A");
    expect(q2.analysis).toContain("两个零点");

    // 第 3 题（填空题）
    const q3 = result.questions[2];
    expect(q3.type).toBe("fill");
    expect(q3.answer).toBe("9");
    expect(q3.score).toBe(4);

    // 第 4 题（解答题）
    const q4 = result.questions[3];
    expect(q4.type).toBe("short");
    expect(q4.answer).toBe("x = 3");
    expect(q4.score).toBe(10);
  });

  it("2. 试卷正文与文末参考答案跨段反向自动缝合 (Cross-Section Stitching)", () => {
    const rawExamSeparate = `
一、选择题
1. 下列实数中是无理数的是（   ）
A. 0.5    B. 根号2    C. 0    D. -3
2. 绝对值等于 5 的数是（   ）
A. 5    B. -5    C. ±5    D. 25

二、判断题
3. 平行四边形的对角线互相平分。

【参考答案与详细解析】
1. B
【解析】根号 2 是无限不循环小数，属于无理数。
2. C
【解析】正负 5 的绝对值都是 5。
3. 对
【解析】这是平行四边形的基本性质定理之一。
`;

    const result = segmentExamPaper(rawExamSeparate);
    expect(result.questions).toHaveLength(3);

    // 第 1 题自动缝合文末答案 B 与解析
    const q1 = result.questions[0];
    expect(q1.stem).toContain("无理数");
    expect(q1.options).toEqual(["0.5", "根号2", "0", "-3"]);
    expect(q1.answer).toBe("B");
    expect(q1.analysis).toContain("无限不循环小数");

    // 第 2 题自动缝合文末答案 C 与解析
    const q2 = result.questions[1];
    expect(q2.answer).toBe("C");
    expect(q2.analysis).toContain("正负 5 的绝对值都是 5");

    // 第 3 题自动缝合判断题答案“对”
    const q3 = result.questions[2];
    expect(q3.type).toBe("judge");
    expect(q3.answer).toBe("对");
    expect(q3.analysis).toContain("平行四边形的基本性质");
  });

  it("3. 防误判：排查数学小数与异常空输入", () => {
    // 带有 3.14 和 1.5 的题目不应该被错误切题
    const raw = `
一、选择题
1. 圆周率 π 约等于 3.14159，在计算半圆周长时半径为 1.5 厘米，则周长约为多少？
A. 3.14    B. 6.28    C. 4.71    D. 7.71
【答案】D
`;
    const res = segmentExamPaper(raw);
    expect(res.questions).toHaveLength(1);
    expect(res.questions[0].stem).toContain("3.14159");
    expect(res.questions[0].stem).toContain("1.5 厘米");
    expect(res.questions[0].answer).toBe("D");

    // 空输入
    const emptyRes = segmentExamPaper("");
    expect(emptyRes.questions).toHaveLength(0);
    expect(emptyRes.warnings).toHaveLength(1);
  });

  it("4. 容错增强：支持带括号题号 (1)/（1）、带括号选项 (A) 与【参考答案及解析】专区", () => {
    const rawExam = `
一、单项选择题
(1) 设集合 M = {x | x > 0}，则下列属于集合 M 的是（   ）
(A) -1    (B) 0    (C) 1    (D) -3

（2） 已知函数 y = 2x + 1，当 x = 2 时，y 的值为（   ）
（A） 3    （B） 4    （C） 5    （D） 6

【参考答案及解析】
1. C
【解析】1 大于 0，属于集合 M。
2. C
【解析】代入 x = 2，y = 2*2 + 1 = 5。
`;

    const res = segmentExamPaper(rawExam);
    expect(res.questions).toHaveLength(2);

    const q1 = res.questions[0];
    expect(q1.options).toEqual(["-1", "0", "1", "-3"]);
    expect(q1.answer).toBe("C");
    expect(q1.analysis).toContain("属于集合 M");

    const q2 = res.questions[1];
    expect(q2.options).toEqual(["3", "4", "5", "6"]);
    expect(q2.answer).toBe("C");
    expect(q2.analysis).toContain("y = 2*2 + 1 = 5");
  });

  it("5. 缺答案保护：单选题与判断题无答案时降级为 draft 草稿，杜绝伪造假答案", () => {
    const rawNoAnswer = `
一、单项选择题
1. 某未知题目没有提供参考答案
A. 选项一
B. 选项二

二、判断题
2. 某未提供答案的判断题。
`;
    const res = segmentExamPaper(rawNoAnswer);
    expect(res.questions).toHaveLength(2);

    const q1 = res.questions[0];
    expect(q1.answer).toBe("");
    expect(q1.status).toBe("draft");

    const q2 = res.questions[1];
    expect(q2.answer).toBe("");
    expect(q2.status).toBe("draft");

    expect(res.warnings.some((w) => w.includes("降级为草稿"))).toBe(true);
  });
});
