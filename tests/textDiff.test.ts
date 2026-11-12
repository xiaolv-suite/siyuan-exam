import { describe, it, expect } from "vitest";
import { computeTextDiff, computeStemSimilarity, splitRawOptionsText } from "@/core/textDiff";

describe("文本版本差异对比引擎 (textDiff - CAND-08)", () => {
  it("无变动文本返回单个 equal 片段", () => {
    const diff = computeTextDiff("已知函数 f(x) 为连续函数", "已知函数 f(x) 为连续函数");
    expect(diff).toEqual([{ op: "equal", text: "已知函数 f(x) 为连续函数" }]);
  });

  it("纯新增与纯删除边界", () => {
    expect(computeTextDiff("", "新增内容")).toEqual([{ op: "insert", text: "新增内容" }]);
    expect(computeTextDiff("旧内容", "")).toEqual([{ op: "delete", text: "旧内容" }]);
  });

  it("修改单字或单词能够精确标出增删", () => {
    const diff = computeTextDiff(
      "下列关于资产减值的说法中，错误的是",
      "下列关于资产减值的说法中，正确的是",
    );
    // 找出 delete 和 insert
    const del = diff.find((d) => d.op === "delete");
    const ins = diff.find((d) => d.op === "insert");
    expect(del?.text).toBe("错误");
    expect(ins?.text).toBe("正确");
  });

  it("支持英文单词与数学符号混排差异", () => {
    const diff = computeTextDiff("calculate x + 1", "calculate x + 2");
    expect(diff.some((d) => d.op === "delete" && d.text === "1")).toBe(true);
    expect(diff.some((d) => d.op === "insert" && d.text === "2")).toBe(true);
  });

  describe("题干相似度即时查重 (computeStemSimilarity)", () => {
    it("剥除首部题号与标点后准确识别高度相似题", () => {
      const s1 = "1. 什么是操作系统的死锁？";
      const s2 = "【单选题】什么是操作系统的死锁";
      expect(computeStemSimilarity(s1, s2)).toBe(1.0);
    });

    it("问法微调（包含关系）命中高相似度", () => {
      const s1 = "简述进程与线程的区别与联系";
      const s2 = "简述进程与线程的区别";
      expect(computeStemSimilarity(s1, s2)).toBeGreaterThanOrEqual(0.75);
    });

    it("不同题目相似度低", () => {
      const s1 = "简述进程与线程的区别";
      const s2 = "求解二次函数的顶点坐标";
      expect(computeStemSimilarity(s1, s2)).toBeLessThan(0.3);
    });
  });

  describe("选项整段智能秒拆 (splitRawOptionsText)", () => {
    it("一行多个选项标准拆分 (A. ... B. ... C. ... D. ...)", () => {
      const raw = "A. 选项甲 B. 选项乙 C. 选项丙 D. 选项丁 答案: B";
      const res = splitRawOptionsText(raw);
      expect(res.options).toEqual(["选项甲", "选项乙", "选项丙", "选项丁"]);
      expect(res.answer).toBe("B");
    });

    it("带圆圈序号选项拆分 (①... ②...)", () => {
      const raw = "① 苹果 ② 香蕉 ③ 橘子";
      const res = splitRawOptionsText(raw);
      expect(res.options).toEqual(["苹果", "香蕉", "橘子"]);
    });

    it("多行换行选项拆分", () => {
      const raw = "A. 第一项\nB. 第二项\nC. 第三项";
      const res = splitRawOptionsText(raw);
      expect(res.options).toEqual(["第一项", "第二项", "第三项"]);
    });
  });
});
