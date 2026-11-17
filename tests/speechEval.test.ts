import { describe, it, expect } from "vitest";
import { evaluateSpeechSimilarity, levenshteinDistance } from "../src/core/speechEval";

describe("多语言跟读发音评测算法 (speechEval)", () => {
  it("levenshteinDistance 正确计算编辑距离", () => {
    expect(levenshteinDistance("", "")).toBe(0);
    expect(levenshteinDistance("cat", "cat")).toBe(0);
    expect(levenshteinDistance("cat", "hat")).toBe(1);
    expect(levenshteinDistance("kitten", "sitting")).toBe(3);
  });

  it("evaluateSpeechSimilarity 准确判定完全匹配", () => {
    const res = evaluateSpeechSimilarity("ubiquitous", "ubiquitous");
    expect(res.score).toBe(100);
    expect(res.grade).toBe("excellent");
    expect(res.feedback).toContain("完全契合");
  });

  it("evaluateSpeechSimilarity 自动过滤标点与大小写", () => {
    const res = evaluateSpeechSimilarity("Ubiquitous!", "ubiquitous.");
    expect(res.score).toBe(100);
    expect(res.grade).toBe("excellent");
  });

  it("evaluateSpeechSimilarity 处理轻微发音差异", () => {
    // 少量音节拼写差异
    const res = evaluateSpeechSimilarity("ubiquitos", "ubiquitous");
    expect(res.score).toBeGreaterThanOrEqual(80);
    expect(res.grade).toBe("excellent");
  });

  it("evaluateSpeechSimilarity 处理较大发音偏离", () => {
    const res = evaluateSpeechSimilarity("apple", "ubiquitous");
    expect(res.score).toBeLessThan(55);
    expect(res.grade).toBe("practice");
    expect(res.feedback).toContain("多听两遍");
  });

  it("evaluateSpeechSimilarity 优雅处理空输入", () => {
    const res = evaluateSpeechSimilarity("", "hello");
    expect(res.score).toBe(0);
    expect(res.grade).toBe("practice");
  });
});
