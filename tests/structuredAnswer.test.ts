import { describe, it, expect } from "vitest";
import { parseNumeric, gradeNumeric, gradeWithSpec, gradeMultiBlank, splitBlanks, formatDisplayAnswer } from "../src/core/structuredAnswer";
import { grade } from "../src/core/answer";
import type { Question } from "../src/core/types";

const spec = {
  v: 1 as const,
  kind: "numeric" as const,
  unit: "km",
  absTol: 0.01,
  altUnits: [{ unit: "m", factor: 0.001 }],
};

function numQ(answer: string): Question {
  return {
    id: "q-num0001",
    type: "fill",
    stem: "求距离（km）",
    options: [],
    answer,
    score: 1,
    origin: "manual",
    hash: "h",
    answerSpec: spec,
  };
}

describe("54-02 数值解析", () => {
  it("半角/全角小数点、千分位、负号、科学计数法（含 ×10^）", () => {
    expect(parseNumeric("1.5")).toBe(1.5);
    expect(parseNumeric("1．5")).toBe(1.5);
    expect(parseNumeric("1,234.5")).toBe(1234.5);
    expect(parseNumeric("-2.5")).toBe(-2.5);
    expect(parseNumeric("1e-3")).toBe(0.001);
    expect(parseNumeric("3×10^8")).toBe(3e8);
    expect(parseNumeric("85%")).toBe(85);
    expect(parseNumeric("85.5％")).toBe(85.5);
    expect(parseNumeric("abc")).toBeNull();
  });

  it("有理分数、带分数与 LaTeX 分数解析 (Perseus 标准)", () => {
    expect(parseNumeric("3/4")).toBe(0.75);
    expect(parseNumeric("-1/2")).toBe(-0.5);
    expect(parseNumeric("1 1/2")).toBe(1.5);
    expect(parseNumeric("-2 3/4")).toBe(-2.75);
    expect(parseNumeric("\\frac{3}{4}")).toBe(0.75);
    expect(parseNumeric("\\frac{-5}{2}")).toBe(-2.5);
  });

  it("π 倍数与符号解析", () => {
    expect(parseNumeric("\\pi")).toBeCloseTo(Math.PI);
    expect(parseNumeric("pi")).toBeCloseTo(Math.PI);
    expect(parseNumeric("2pi")).toBeCloseTo(2 * Math.PI);
    expect(parseNumeric("-pi")).toBeCloseTo(-Math.PI);
    expect(parseNumeric("pi/2")).toBeCloseTo(Math.PI / 2);
    expect(parseNumeric("-pi/4")).toBeCloseTo(-Math.PI / 4);
    expect(parseNumeric("\\frac{\\pi}{2}")).toBeCloseTo(Math.PI / 2);
    expect(parseNumeric("\\frac{3\\pi}{4}")).toBeCloseTo(0.75 * Math.PI);
  });
});

describe("54-02 数值判分（54-02 验收 fixtures：边界/负数/小数分隔/等价单位）", () => {
  it("精确命中 exact；绝对容差边界含入", () => {
    expect(gradeNumeric(spec, "42.0", "42").reason).toBe("exact");
    expect(gradeNumeric(spec, "1.00", "1.01").correct).toBe(true); // |0.01| ≤ absTol
    expect(gradeNumeric(spec, "1.00", "1.02").correct).toBe(false);
  });

  it("相对容差：未配 absTol 时按百分比", () => {
    const rel = { v: 1 as const, kind: "numeric" as const, relTolerance: 5 };
    expect(gradeNumeric(rel, "100", "103").reason).toBe("relative-tolerance");
    expect(gradeNumeric(rel, "100", "106").correct).toBe(false);
    // 零期望值：相对容差无定义 → 不命中（不以浮点直接相等的口径兜底 absTol 缺省）
    expect(gradeNumeric(rel, "0", "0.0001").correct).toBe(false);
  });

  it("等价单位换算：m→km 因子换算后判分；单位后缀剥离", () => {
    expect(gradeNumeric(spec, "1", "1000 m").reason).toBe("unit-converted");
    expect(gradeNumeric(spec, "1", "1000m").correct).toBe(true);
    expect(gradeNumeric(spec, "1 km", "1 km").correct).toBe(true);
    expect(gradeNumeric(spec, "1 km", "1000 m").correct).toBe(true);
    expect(gradeNumeric(spec, "1", "999 m").correct).toBe(true); // 999m=0.999km，在 absTol 0.01km 内
    expect(gradeNumeric(spec, "1", "900 m").correct).toBe(false); // 0.9km 超容差
  });

  it("负数与小数分隔：-2.5＝-2.5 exact；不可解析如实 unparseable", () => {
    expect(gradeNumeric(spec, "-2.5", "-2.5").reason).toBe("exact");
    expect(gradeNumeric(spec, "-2.5", "abc").reason).toBe("unparseable");
  });
});

describe("54-01 grade 接线与向后兼容", () => {
  it("带 spec 的题走数值判分（含单位换算）；无 spec 完全走旧口径", () => {
    const withSpec = numQ("1");
    expect(grade(withSpec, "1000 m").verdict).toBe("correct");
    expect(grade(withSpec, "0.5").verdict).toBe("wrong");
    const plain: Question = { ...numQ("1"), answerSpec: undefined };
    expect(grade(plain, "1").verdict).toBe("correct"); // 字符串口径
    expect(grade(plain, "1000 m").verdict).toBe("wrong"); // 不做数值巧合
  });

  it("版本不符或未知 kind → null 按旧口径（不误判）", () => {
    const future = { ...numQ("1"), answerSpec: { v: 2, kind: "numeric", absTol: 0.01 } as unknown as Question["answerSpec"] };
    expect(gradeWithSpec(future, "1")).toBeNull();
    expect(grade(future, "1").verdict).toBe("correct");
  });
});

describe("54-03 多空题逐空判分", () => {
  const mbSpec = {
    v: 1 as const,
    kind: "multiBlank" as const,
    blanks: [
      { answers: ["H2O"] },
      { answers: ["氧", "O"], caseSensitive: false },
      { answers: ["2"] },
    ],
  };
  const mbQ: Question = { ...numQ(";;"), answerSpec: mbSpec, stem: "水的化学式是____，由氢和____组成，一个分子含____个氢原子。", options: [] };

  it("全对 → correct；逐空明细齐备", () => {
    const v = gradeMultiBlank(mbSpec, "H2O;;氧;;2");
    expect(v.allCorrect).toBe(true);
    expect(v.correctCount).toBe(3);
    expect(v.blanks.map((b) => b.correct)).toEqual([true, true, true]);
  });

  it("部分作答可逐空解释：缺段=空白 incorrect；大小写策略与别名生效", () => {
    const v = gradeMultiBlank(mbSpec, "H2O;;o;;"); // 第 2 空别名小写命中、第 3 空空白
    expect(v.allCorrect).toBe(false);
    expect(v.filledCount).toBe(2);
    expect(v.blanks[1].correct).toBe(true); // 别名 O + 大小写不敏感
    expect(v.blanks[2].correct).toBe(false);
    expect(v.blanks[2].empty).toBe(true);
  });

  it("多空 spec 经 grade 接线：全对 correct、部分 wrong（逐空解释在 gradeMultiBlank）", () => {
    expect(grade(mbQ, "H2O;;氧;;2").verdict).toBe("correct");
    expect(grade(mbQ, "CO2;;氧;;2").verdict).toBe("wrong");
  });

  it("54-01：版本不符的 multiBlank spec 不误判（回退旧口径）", () => {
    const future = { ...mbQ, answerSpec: { v: 2, kind: "multiBlank", blanks: [] } as unknown as Question["answerSpec"] };
    // 回退旧口径：fill 按整串匹配 → wrong（而非抛错或误判 correct）
    expect(grade(future, "H2O;;氧;;2").verdict).toBe("wrong");
  });

  it("中文连续全角分号；；自动归一化为半角;;，顺利判定全对", () => {
    const v = gradeMultiBlank(mbSpec, "H2O；；氧；；2");
    expect(v.allCorrect).toBe(true);
    expect(v.correctCount).toBe(3);
  });

  describe("orderIndependent 无序可交换多空判分与防作弊验证 (Khan/Perseus 规范)", () => {
    const unorderedSpec = {
      v: 1 as const,
      kind: "multiBlank" as const,
      orderIndependent: true,
      blanks: [
        { answers: ["光反应"] },
        { answers: ["暗反应"] },
      ],
    };

    it("顺序颠倒作答顺利判定全对", () => {
      const v = gradeMultiBlank(unorderedSpec, "暗反应;;光反应");
      expect(v.allCorrect).toBe(true);
      expect(v.correctCount).toBe(2);
      expect(v.blanks[0].correct).toBe(true);
      expect(v.blanks[1].correct).toBe(true);
    });

    it("严防作弊：重复填同一词不能重复得分", () => {
      // 两个空都填“光反应”，只有第一个得分，第二个不能重复匹配
      const v = gradeMultiBlank(unorderedSpec, "光反应;;光反应");
      expect(v.allCorrect).toBe(false);
      expect(v.correctCount).toBe(1);
      expect(v.blanks[0].correct).toBe(true);
      expect(v.blanks[1].correct).toBe(false);
    });

    it("漏答其中一空判定部分对但 allCorrect 为 false", () => {
      const v = gradeMultiBlank(unorderedSpec, "暗反应");
      expect(v.allCorrect).toBe(false);
      expect(v.correctCount).toBe(1);
      expect(v.blanks[0].correct).toBe(true);
      expect(v.blanks[1].empty).toBe(true);
    });

    it("splitBlanks 支持中英文分号与换行容差切分", () => {
      expect(splitBlanks("苹果；香蕉", 2)).toEqual(["苹果", "香蕉"]);
      expect(splitBlanks("第一空\n第二空", 2)).toEqual(["第一空", "第二空"]);
      expect(splitBlanks(" A ;; B ", 2)).toEqual(["A", "B"]);
    });

    it("formatDisplayAnswer 优雅格式化多空填空答案，彻底消除原始 ;; 符号", () => {
      expect(formatDisplayAnswer("80 ;; 100")).toBe("空①: 80 · 空②: 100");
      expect(formatDisplayAnswer("H2O；；氧；；2")).toBe("空①: H2O · 空②: 氧 · 空③: 2");
      expect(formatDisplayAnswer("单一标准答案")).toBe("单一标准答案");
      expect(formatDisplayAnswer(null)).toBe("");
    });
  });
});
