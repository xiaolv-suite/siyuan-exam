import { describe, expect, it } from "vitest";
import { removeChoiceOption, answerChoices, shuffleAnswerChoices } from "../src/core/answerChoices";
import { makeQuestion } from "../src/core/blockTemplate";
import { grade } from "../src/core/answer";

describe("删除选项时迁移正确答案", () => {
  const options = ["甲", "乙", "丙", "丁"];

  it("单选删除前方选项，答案字母前移但仍指向原正确内容", () => {
    const next = removeChoiceOption("single", options, "C", 0);
    expect(next).toEqual({ options: ["乙", "丙", "丁"], answer: "B" });
    const q = makeQuestion({ type: "single", stem: "选择丙", ...next });
    expect(q.options[q.answer.charCodeAt(0) - 65]).toBe("丙");
    expect(grade(q, "B").verdict).toBe("correct");
    expect(grade(q, "C").verdict).toBe("wrong");
    expect(options).toEqual(["甲", "乙", "丙", "丁"]);
  });

  it("单选删除正确项清空答案，删除后方选项保留答案", () => {
    expect(removeChoiceOption("single", options, "B", 1).answer).toBe("");
    expect(removeChoiceOption("single", options, "B", 3).answer).toBe("B");
    expect(removeChoiceOption("single", options, "", 0).answer).toBe("");
  });

  it("多选删掉正确项时仅移除该项，同时前移后面的正确字母", () => {
    const next = removeChoiceOption("multiple", options, "ACD", 2);
    expect(next).toEqual({ options: ["甲", "乙", "丁"], answer: "AC" });
    const q = makeQuestion({ type: "multiple", stem: "选择甲和丁", ...next });
    expect([...q.answer].map((letter) => q.options[letter.charCodeAt(0) - 65])).toEqual(["甲", "丁"]);
    expect(grade(q, "AC").verdict).toBe("correct");
  });

  it("多选删除干扰项时保持正确内容，全删正确项后答案为空", () => {
    const next = removeChoiceOption("multiple", options, "BD", 0);
    expect(next.answer).toBe("AC");
    const one = removeChoiceOption("multiple", next.options, next.answer, 0);
    expect(one.answer).toBe("B");
    expect(removeChoiceOption("multiple", one.options, one.answer, 1).answer).toBe("");
  });

  it("处理手工输入的答案大小写与全角字母；非法删除索引不更改数据", () => {
    expect(removeChoiceOption("multiple", options, "ｄｂ", 0).answer).toBe("AC");
    for (const index of [-1, 4, 0.5, NaN]) {
      expect(removeChoiceOption("single", options, "C", index)).toEqual({ options, answer: "C" });
    }
    expect(removeChoiceOption("judge", options, "对", 0).answer).toBe("对");
  });

  it("填空题判分清洗：自动过滤零宽字符（\\u200B/\\u200C/\\u200D/\\uFEFF），避免同字误判", () => {
    const q = makeQuestion({
      type: "fill",
      stem: "我国的根本政治制度是____。",
      answer: "人民\u200B代表大会\uFEFF制度",
    });
    expect(grade(q, "人民代表大会制度").verdict).toBe("correct");
  });

  describe("选项随机打乱算法 (shuffleAnswerChoices - FLOW-03)", () => {
    const rawChoices = [
      { letter: "A", text: "选项一", value: "A" },
      { letter: "B", text: "选项二", value: "B" },
      { letter: "C", text: "选项三", value: "C" },
      { letter: "D", text: "选项四", value: "D" },
    ];

    it("空种子或单项时不打乱", () => {
      expect(shuffleAnswerChoices(rawChoices, "")).toEqual(rawChoices);
      expect(shuffleAnswerChoices([rawChoices[0]], "seed-1")).toEqual([rawChoices[0]]);
    });

    it("同一题目特征种子打乱结果严格确定且可复现", () => {
      const s1 = shuffleAnswerChoices(rawChoices, "qid-algebra-101");
      const s2 = shuffleAnswerChoices(rawChoices, "qid-algebra-101");
      expect(s1).toEqual(s2);
    });

    it("打乱后显示字母始终按 A, B, C, D 顺序呈现，但各选项原始 value 完整保留", () => {
      const shuffled = shuffleAnswerChoices(rawChoices, "qid-math-202");
      // 显示字母必为 A, B, C, D
      expect(shuffled.map((c) => c.letter)).toEqual(["A", "B", "C", "D"]);
      // 原始 value 集合完全不变
      expect(shuffled.map((c) => c.value).sort()).toEqual(["A", "B", "C", "D"]);
      // 文本与原始 value 映射未被破坏
      for (const item of shuffled) {
        const orig = rawChoices.find((r) => r.value === item.value);
        expect(orig?.text).toBe(item.text);
      }
    });

    it("结合 grade 判分：打乱后考生点击新字母选项，利用其 value 能准确命中真题答案", () => {
      const q = makeQuestion({
        type: "single",
        stem: "若 x+1=3，则 x 等于？",
        options: ["1", "2", "3", "4"],
        answer: "B", // 原答案是 B ("2")
      });
      const choices = answerChoices(q);
      const shuffled = shuffleAnswerChoices(choices, q.id);
      // 找到包含 "2" 的选项项
      const targetChoice = shuffled.find((c) => c.text === "2");
      expect(targetChoice).toBeDefined();
      expect(targetChoice?.value).toBe("B");
      // 提交它的 value 进行判分，依然精准判定为正确！
      expect(grade(q, targetChoice!.value).verdict).toBe("correct");
    });
  });
});
