import { describe, it, expect } from "vitest";
import {
  extractNaturalPaperQuestionsAsync,
  parseSingleNaturalQuestion,
} from "../src/core/siyuanDocImporter";

describe("巨型题库文档提取分块异步分片 (ECO-01 / TODO-05)", () => {
  const docMeta = {
    docId: "doc-huge-101",
    title: "操作系统与数据结构综合题库",
    hpath: "/考研专业课/综合题库",
  };

  it("1. parseSingleNaturalQuestion 准确识别各题型单项", () => {
    const singleRaw = "1. 下列协议中运行在网络层的是？ A. HTTP B. TCP C. IP D. FTP 答案: C 【解析】IP为网络层核心协议。";
    const q1 = parseSingleNaturalQuestion(singleRaw, docMeta);
    expect(q1).not.toBeNull();
    expect(q1?.type).toBe("single");
    expect(q1?.answer).toBe("C");
    expect(q1?.options).toEqual(["HTTP", "TCP", "IP", "FTP"]);
    expect(q1?.analysis).toBe("IP为网络层核心协议。");

    const judgeRaw = "2. 所有的二叉树都是二叉平衡树。( × ) 【解析】平衡二叉树要求左右子树高度差不超过1。";
    const q2 = parseSingleNaturalQuestion(judgeRaw, docMeta);
    expect(q2).not.toBeNull();
    expect(q2?.type).toBe("judge");
    expect(q2?.answer).toBe("错");
  });

  it("2. extractNaturalPaperQuestionsAsync 异步分片切题并准确触发进度百分比回调", async () => {
    // 构造包含 30 道题的大型题库文本
    const items: string[] = [];
    for (let i = 1; i <= 30; i++) {
      items.push(`${i}. 测试题目编号第 ${i} 题？\nA. 选项甲\nB. 选项乙\nC. 选项丙\nD. 选项丁\n答案: A\n【解析】解析内容第 ${i} 条。`);
    }
    const hugeDocText = items.join("\n\n");

    const progressReports: Array<{ processed: number; total: number; percent: number }> = [];
    const questions = await extractNaturalPaperQuestionsAsync(
      hugeDocText,
      docMeta,
      (p) => {
        progressReports.push(p);
      },
      10, // 每批 10 题
    );

    expect(questions.length).toBe(30);
    expect(progressReports.length).toBeGreaterThanOrEqual(3);
    const lastProgress = progressReports[progressReports.length - 1];
    expect(lastProgress.percent).toBe(100);
    expect(lastProgress.total).toBe(30);
  });
});
