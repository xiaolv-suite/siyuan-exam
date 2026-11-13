import { describe, it, expect } from "vitest";
import type { Question } from "../src/core/types";
import {
  compareSemVer,
  calculateQuestionDelta,
  mergeQuestionDelta,
  scanPrivacyIssues,
  buildMarketplaceItemFromBank,
  buildMarketplaceCatalogJson,
} from "../src/core/marketplaceSync";

describe("集市增量差量同步与发布向导 (marketplaceSync)", () => {
  it("1. compareSemVer 正确比较语义化版本号", () => {
    expect(compareSemVer("1.2.0", "1.1.0")).toBe(1);
    expect(compareSemVer("v1.0.1", "1.0.2")).toBe(-1);
    expect(compareSemVer("2.0.0", "2.0.0")).toBe(0);
    expect(compareSemVer("1.10.0", "1.9.0")).toBe(1);
  });

  const localList: Question[] = [
    {
      id: "q-1",
      type: "single",
      stem: "1 + 1 = ?",
      options: ["1", "2", "3", "4"],
      answer: "B",
      analysis: "基础算术",
      origin: "imported",
      score: 1,
      hash: "h-1",
    },
    {
      id: "q-2",
      type: "single",
      stem: "地球是平的吗？",
      options: ["是", "否"],
      answer: "B",
      analysis: "常识",
      origin: "imported",
      score: 1,
      hash: "h-2",
    },
  ];

  it("2. calculateQuestionDelta 准确识别新增题与修订题", () => {
    const remoteList: Question[] = [
      // q-1 未改动
      { ...localList[0] },
      // q-2 解析和秒杀拓展更新
      {
        ...localList[1],
        analysis: "地球近似为两极稍扁、赤道略鼓的不规则椭球体。",
        expansion: "【秒杀常识】麦哲伦环球航行已充分证实地球是球体。",
      },
      // q-3 新增题
      {
        id: "q-3",
        type: "single",
        stem: "水的化学式是？",
        options: ["H2O", "CO2", "NaCl"],
        answer: "A",
        analysis: "常见化合物分子式",
        origin: "imported",
        score: 1,
        hash: "h-3",
      },
    ];

    const delta = calculateQuestionDelta(localList, remoteList);
    expect(delta.hasUpdates).toBe(true);
    expect(delta.unchangedCount).toBe(1);
    expect(delta.updatedCount).toBe(1);
    expect(delta.addedCount).toBe(1);

    expect(delta.updated[0].local.id).toBe("q-2");
    expect(delta.updated[0].changedFields).toContain("analysis");
    expect(delta.updated[0].changedFields).toContain("expansion");

    expect(delta.added[0].id).toBe("q-3");
  });

  it("3. mergeQuestionDelta 能够安全合入修订并不破坏本地元数据", () => {
    const remoteList: Question[] = [
      { ...localList[0] },
      {
        ...localList[1],
        analysis: "更新后的详细解析",
      },
      {
        id: "q-3",
        type: "single",
        stem: "新题目",
        options: ["A", "B"],
        answer: "A",
        origin: "imported",
        score: 1,
        hash: "h-3",
      },
    ];

    const delta = calculateQuestionDelta(localList, remoteList);
    const merged = mergeQuestionDelta(localList, delta);

    expect(merged.length).toBe(3);
    expect(merged[0].id).toBe("q-1");
    expect(merged[1].id).toBe("q-2");
    expect(merged[1].analysis).toBe("更新后的详细解析");
    expect(merged[2].id).toBe("q-3");
  });

  it("4. scanPrivacyIssues 检出本地绝对文件路径与思源块内链", () => {
    const leakQuestions: Question[] = [
      {
        id: "q-leak-1",
        type: "single",
        stem: "请参考本地文件：D:\\私有笔记\\资料.docx 中的说明。",
        options: ["A", "B"],
        answer: "A",
        origin: "imported",
        score: 1,
        hash: "h-leak-1",
      },
      {
        id: "q-leak-2",
        type: "single",
        stem: "这道题来源于块引用 ((siyuan://blocks/202611031020-abc1234))。",
        options: ["A", "B"],
        answer: "A",
        origin: "imported",
        score: 1,
        hash: "h-leak-2",
      },
      {
        id: "q-clean",
        type: "single",
        stem: "纯净公共题目，无任何私有绝对路径。",
        options: ["A", "B"],
        answer: "A",
        origin: "imported",
        score: 1,
        hash: "h-clean",
      },
    ];

    const warnings = scanPrivacyIssues(leakQuestions);
    expect(warnings.length).toBe(2);
    expect(warnings.some((w) => w.type === "absolute_path")).toBe(true);
    expect(warnings.some((w) => w.type === "internal_uri")).toBe(true);
  });

  it("5. buildMarketplaceItemFromBank 构建标准集市资源并导出合规 Catalog JSON", () => {
    const item = buildMarketplaceItemFromBank({
      id: "my-custom-bank",
      title: "我的原创法考核心真题",
      description: "民法典物权法精选",
      category: "qualification",
      tags: ["法考", "民法典"],
      authorName: "张三",
      version: "1.0.0",
      license: "Public Domain",
      questions: localList,
    });

    expect(item.id).toBe("my-custom-bank");
    expect(item.itemCount).toBe(2);
    expect(item.author.name).toBe("张三");
    expect(item.embeddedQuestions?.length).toBe(2);
    expect(item.previewItems?.length).toBe(2);

    const json = buildMarketplaceCatalogJson("张三的个人集市", "精选备考", [item]);
    expect(json).toContain("张三的个人集市");
    expect(json).toContain("my-custom-bank");

    const parsed = JSON.parse(json);
    expect(parsed.v).toBe(1);
    expect(parsed.items.length).toBe(1);
  });
});
