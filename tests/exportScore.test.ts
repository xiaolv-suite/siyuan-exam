import { describe, it, expect } from "vitest";
import { scoreToMarkdown } from "../src/core/exportScore";
import { MockSession, type Blueprint } from "../src/core/mock";

const bp: Blueprint = {
  id: "bp",
  name: "行测模拟",
  durationS: 3600,
  passLine: 60,
  shuffleOptions: false,
  sectionTimed: false,
  sections: [{ name: "言语", count: 2, scoreEach: 1, source: "mixed", types: ["single"] }],
};

describe("成绩单导出 Markdown", () => {
  it("含总分/判定/分模块表/行为数据", () => {
    const qs = [makeQ("A"), makeQ("A")];
    const r = {
      paper: qs,
      sectionOf: new Map([
        [qs[0].id, "言语"],
        [qs[1].id, "言语"],
      ]),
      scoreOf: new Map([
        [qs[0].id, 1],
        [qs[1].id, 1],
      ]),
      shortages: [],
    };
    const s = new MockSession(bp, qs, r, 1_700_000_000_000);
    s.setAnswer(qs[0].id, "A", 1_700_001_000);
    s.toggleFlag(qs[0].id);
    s.submit(1_700_003_600_000);
    const score = s.score();
    const md = scoreToMarkdown(bp, score, 1_700_000_000_000);
    expect(md).toContain("# 模考成绩单 · 行测模拟");
    expect(md).toContain("❌ 未通过");
    expect(md).toContain("| 言语 | 1 | 2 | 1/2 |");
    expect(md).toContain("标旗 1");
    expect(md).toContain("最后 20 分钟");
  });

  it("含失分与标旗存疑题目的思源原生块引用 ((blockId)) 复盘清单", () => {
    const q1 = { ...makeQ("A"), stem: "微分方程通解计算", kp: "高数/微分方程", blockId: "20261031120000-abcdef1" };
    const q2 = { ...makeQ("B"), stem: "矩阵特征值性质判定", kp: "线代/特征值", blockId: "20261031120000-abcdef2" };
    const r = {
      paper: [q1, q2],
      sectionOf: new Map([
        [q1.id, "言语"],
        [q2.id, "言语"],
      ]),
      scoreOf: new Map([
        [q1.id, 1],
        [q2.id, 1],
      ]),
      shortages: [],
    };
    const s = new MockSession(bp, [q1, q2], r, 1_700_000_000_000);
    s.setAnswer(q1.id, "B", 1_700_001_000);
    s.setAnswer(q2.id, "B", 1_700_002_000);
    s.toggleFlag(q2.id);
    s.submit(1_700_003_600_000);
    const score = s.score();
    const md = scoreToMarkdown(bp, score, 1_700_000_000_000, {
      wrongItems: [{ q: q1, myAnswer: "B", flagged: false }],
      flaggedItems: [{ q: q2, myAnswer: "B" }],
    });
    expect(md).toContain("## 本场失分题目订正清单");
    expect(md).toContain('((20261031120000-abcdef1 "微分方程通解计算"))');
    expect(md).toContain("## 考场标旗存疑但蒙对题目");
    expect(md).toContain('((20261031120000-abcdef2 "矩阵特征值性质判定"))');
  });
});

import { makeQuestion } from "../src/core/blockTemplate";
function makeQ(answer: string) {
  return makeQuestion({ type: "single", stem: "x", options: ["A文本", "B文本"], answer });
}
