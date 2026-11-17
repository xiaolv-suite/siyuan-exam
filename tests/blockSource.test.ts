import { describe, expect, it } from "vitest";
import { combineBlockSources } from "../src/core/blockSource";
import { makeQuestion, questionToMarkdown, questionFromBlock, parseIal } from "../src/core/blockTemplate";

describe("块材料合并", () => {
  it("保留 Markdown 内容并去掉思源块包装和属性", () => {
    const result = combineBlockSources([
      '{{{row\n标题\n- A. 选项\n}}}\n{: custom-exam-answer="A" custom-exam-analysis="内部解析"}',
    ]);
    expect(result).toMatchObject({ text: "标题\n- A. 选项", blocks: 1, truncated: false });
  });

  it("合并多块并在超限时返回明确的截断标记", () => {
    const result = combineBlockSources(["第一块", "第二块"], 6);
    expect(result.text).toBe("第一块\n\n第");
    expect(result.blocks).toBe(2);
    expect(result.truncated).toBe(true);
  });

  it("空块不生成材料", () => {
    expect(combineBlockSources(["", '{: custom-id="x"}'])).toEqual({ text: "", blocks: 0, truncated: false });
  });

  it("Question 携带 studyMeta 时正确序列化为 IAL 并由 questionFromBlock 无损还原", () => {
    const q = makeQuestion({
      type: "single",
      stem: "“唔该”的粤拼是什么？",
      options: ["m4 goi1", "m4 goi2"],
      answer: "A",
      studyMeta: {
        lang: "zh-HK",
        phonetic: "m4 goi1",
      },
    });

    const md = questionToMarkdown(q);
    expect(md).toContain('custom-exam-study-meta="');
    expect(md).toContain("zh-HK");
    expect(md).toContain("m4 goi1");

    // 提取 IAL 并通过 questionFromBlock 还原
    const ialString = md.slice(md.lastIndexOf("{: ") + 3).replace(/\}\s*$/, "");
    const attrs = parseIal(ialString);
    const restored = questionFromBlock({
      attrs,
      text: "“唔该”的粤拼是什么？\n- A. m4 goi1\n- B. m4 goi2",
    });

    expect(restored).not.toBeNull();
    expect(restored?.studyMeta).toEqual({
      lang: "zh-HK",
      phonetic: "m4 goi1",
    });
  });

  it("Question 携带 expansion（思路拓展与秒杀技巧）时正确序列化为 IAL 并由 questionFromBlock 无损还原 (AUTH-02)", () => {
    const q = makeQuestion({
      type: "single",
      stem: "已知函数 f(x) 为奇函数，f(2) = 3，则 f(-2) = ？",
      options: ["3", "-3", "0", "无法确定"],
      answer: "B",
      analysis: "由奇函数性质 f(-x) = -f(x)，得 f(-2) = -f(2) = -3。",
      expansion: "【秒杀技巧】奇函数在对称点处函数值互为相反数，直接取负号秒选 B！",
    });

    const md = questionToMarkdown(q);
    expect(md).toContain('custom-exam-expansion="');
    expect(md).toContain("秒杀技巧");

    const ialString = md.slice(md.lastIndexOf("{: ") + 3).replace(/\}\s*$/, "");
    const attrs = parseIal(ialString);
    const restored = questionFromBlock({
      attrs,
      text: "已知函数 f(x) 为奇函数，f(2) = 3，则 f(-2) = ？\n- A. 3\n- B. -3\n- C. 0\n- D. 无法确定",
    });

    expect(restored).not.toBeNull();
    expect(restored?.expansion).toBe("【秒杀技巧】奇函数在对称点处函数值互为相反数，直接取负号秒选 B！");
  });
});
