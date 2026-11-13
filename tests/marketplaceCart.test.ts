import { describe, it, expect } from "vitest";
import { DEFAULT_MARKETPLACE_CATALOG } from "../src/core/marketplace";
import {
  extractCartItemsFromMarketplaceItem,
  addToCart,
  addManyToCart,
  removeFromCart,
  isInCart,
  cartItemsToQuestions,
  cartItemsToLvCardsPackage,
  calculateItemQualityMetrics,
  buildMarketplaceKpTree,
  type MarketplaceCartItem,
} from "../src/core/marketplaceCart";

describe("集市试题篮与品质画像分析 (marketplaceCart)", () => {
  const mathItem = DEFAULT_MARKETPLACE_CATALOG.items.find((i) => i.id === "math-highschool-theorems")!;
  const csItem = DEFAULT_MARKETPLACE_CATALOG.items.find((i) => i.id === "computer-networks-os")!;

  it("1. extractCartItemsFromMarketplaceItem 能够正确提取内嵌试题", () => {
    const mathCartItems = extractCartItemsFromMarketplaceItem(mathItem);
    expect(mathCartItems.length).toBeGreaterThan(0);
    expect(mathCartItems[0].sourceItemId).toBe("math-highschool-theorems");
    expect(mathCartItems[0].sourceCategory).toBe("math");
    expect(mathCartItems[0].stem).toContain("已知函数");
    expect(mathCartItems[0].options.length).toBe(4);
  });

  it("2. 试题篮单题添加、去重与状态判断", () => {
    let cart: MarketplaceCartItem[] = [];
    const [q1, q2] = extractCartItemsFromMarketplaceItem(mathItem);

    cart = addToCart(cart, q1);
    expect(cart.length).toBe(1);
    expect(isInCart(cart, q1.id)).toBe(true);
    expect(isInCart(cart, q2.id)).toBe(false);

    // 重复添加不增加
    cart = addToCart(cart, q1);
    expect(cart.length).toBe(1);

    // 添加第二题
    cart = addToCart(cart, q2);
    expect(cart.length).toBe(2);
    expect(isInCart(cart, q2.id)).toBe(true);

    // 移除单题
    cart = removeFromCart(cart, q1.id);
    expect(cart.length).toBe(1);
    expect(isInCart(cart, q1.id)).toBe(false);
  });

  it("3. 试题篮跨学科批量添加与合并", () => {
    const mathQuestions = extractCartItemsFromMarketplaceItem(mathItem).slice(0, 2);
    const csQuestions = extractCartItemsFromMarketplaceItem(csItem).slice(0, 2);

    let cart: MarketplaceCartItem[] = [];
    cart = addManyToCart(cart, mathQuestions);
    expect(cart.length).toBe(2);

    // 跨学科合并
    cart = addManyToCart(cart, csQuestions);
    expect(cart.length).toBe(4);

    const categories = new Set(cart.map((c) => c.sourceCategory));
    expect(categories.has("math")).toBe(true);
    expect(categories.has("computer")).toBe(true);
  });

  it("4. cartItemsToQuestions 转换为标准 Question 实体", () => {
    const mathQuestions = extractCartItemsFromMarketplaceItem(mathItem).slice(0, 2);
    const qs = cartItemsToQuestions(mathQuestions);

    expect(qs.length).toBe(2);
    expect(qs[0].id).toBe(mathQuestions[0].id);
    expect(qs[0].origin).toBe("imported");
    expect(qs[0].score).toBe(1);
    expect(qs[0].source).toContain("集市挑选");
    expect(qs[0].hash).toContain(mathQuestions[0].id);
  });

  it("5. cartItemsToLvCardsPackage 一键打包为跨学科 .lvcards 闪卡包", () => {
    const mathQuestions = extractCartItemsFromMarketplaceItem(mathItem).slice(0, 1);
    const csQuestions = extractCartItemsFromMarketplaceItem(csItem).slice(0, 1);
    const cart = [...mathQuestions, ...csQuestions];

    const pkg = cartItemsToLvCardsPackage(cart, "考研数计综合精选题卡");
    expect(pkg.format).toBe("lvcards.v1");
    expect(pkg.deck.name).toBe("考研数计综合精选题卡");
    expect(pkg.cards.length).toBe(2);
    expect(pkg.cards[0].question).toBeDefined();
    expect(pkg.cards[0].answer).toBeDefined();
  });

  it("6. calculateItemQualityMetrics 计算题型构成与难度画像", () => {
    const metrics = calculateItemQualityMetrics(mathItem);
    expect(metrics.totalCount).toBeGreaterThan(0);
    expect(metrics.typeDistribution.length).toBeGreaterThan(0);
    expect(metrics.difficultyDistribution.length).toBeGreaterThan(0);
    expect(metrics.expansionRatio).toBeGreaterThanOrEqual(0);
    expect(metrics.topKps.length).toBeGreaterThanOrEqual(0);

    // 题型百分比之和应大致为 100%
    const typePctSum = metrics.typeDistribution.reduce((acc, cur) => acc + cur.pct, 0);
    expect(typePctSum).toBeGreaterThanOrEqual(95);
    expect(typePctSum).toBeLessThanOrEqual(105);
  });

  it("7. buildMarketplaceKpTree 能够正确将试题按考点层级聚合为全景树", () => {
    const mathCartItems = extractCartItemsFromMarketplaceItem(mathItem);
    const tree = buildMarketplaceKpTree(mathCartItems);

    expect(tree.length).toBeGreaterThan(0);
    const topNode = tree[0];
    expect(topNode.name).toBeDefined();
    expect(topNode.count).toBeGreaterThan(0);
    expect(topNode.questionIds.length).toBe(topNode.count);
  });
});
