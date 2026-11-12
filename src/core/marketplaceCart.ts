/**
 * 题库与闪卡集市「试题篮」与题库品质画像分析核心
 * (Marketplace Cart & Quality Metrics)
 *
 * 核心能力：
 * 1. 试题篮跨学科挑题 (Cart & Selective Stash) 纯函数管理；
 * 2. 试题篮数据与 Question 领域模型/LvCardsPackage 闪卡包双向桥接；
 * 3. 题库品质画像、题型构成与难度梯队分布统计引擎。
 */

import type { Question, QuestionType } from "./types";
import type { MarketplaceCategory, MarketplaceItem } from "./marketplace";
import type { LvCardsPackage } from "./lvcardsBridge";
import { questionsToLvCardsPackage } from "./lvcardsBridge";

export interface MarketplaceCartItem {
  id: string;
  sourceItemId: string;
  sourceTitle: string;
  sourceCategory: MarketplaceCategory;
  stem: string;
  type: QuestionType;
  options: string[];
  answer: string;
  analysis?: string;
  expansion?: string;
  difficulty?: number;
  kp?: string;
  tags?: string[];
}

export interface TypeDistributionItem {
  type: QuestionType | "other";
  label: string;
  count: number;
  pct: number; // 0 - 100
  color: string;
}

export interface DifficultyDistributionItem {
  level: "easy" | "medium" | "hard";
  label: string;
  count: number;
  pct: number;
  color: string;
}

export interface MarketplaceQualityMetrics {
  totalCount: number;
  typeDistribution: TypeDistributionItem[];
  difficultyDistribution: DifficultyDistributionItem[];
  expansionRatio: number; // 0 - 100
  topKps: Array<{ kp: string; count: number }>;
}

/**
 * 从集市条目中无损提取可加入试题篮的试题列表
 */
export function extractCartItemsFromMarketplaceItem(
  item?: MarketplaceItem,
): MarketplaceCartItem[] {
  if (!item) return [];
  if (item.embeddedQuestions && item.embeddedQuestions.length > 0) {
    return item.embeddedQuestions.map((q) => ({
      id: q.id,
      sourceItemId: item.id,
      sourceTitle: item.title,
      sourceCategory: item.category,
      stem: q.stem,
      type: q.type,
      options: [...(q.options || [])],
      answer: q.answer || "",
      analysis: q.analysis,
      expansion: q.expansion,
      difficulty: q.difficulty ?? 3,
      kp: q.kp || (item.tags[0] ? `${item.title}/${item.tags[0]}` : item.title),
      tags: q.tags && q.tags.length > 0 ? [...q.tags] : [...item.tags],
    }));
  }

  // 若无完整内嵌题，由预览微题生成规范试题
  if (item.previewItems && item.previewItems.length > 0) {
    return item.previewItems.map((prev, idx) => {
      const isJudge = !prev.options?.length && (prev.answer === "对" || prev.answer === "错");
      const hasOptions = Array.isArray(prev.options) && prev.options.length > 0;
      const type: QuestionType = isJudge ? "judge" : hasOptions ? "single" : "fill";
      return {
        id: `${item.id}-prev-${idx + 1}`,
        sourceItemId: item.id,
        sourceTitle: item.title,
        sourceCategory: item.category,
        stem: prev.stem,
        type,
        options: prev.options ? [...prev.options] : [],
        answer: prev.answer || "见解析",
        analysis: prev.analysis,
        difficulty: 3,
        kp: item.tags[0] ? `${item.title}/${item.tags[0]}` : item.title,
        tags: [...item.tags],
      };
    });
  }

  return [];
}

/**
 * 试题篮单题添加（去重）
 */
export function addToCart(
  cart: readonly MarketplaceCartItem[],
  newItem: MarketplaceCartItem,
): MarketplaceCartItem[] {
  if (cart.some((c) => c.id === newItem.id)) {
    return [...cart];
  }
  return [...cart, newItem];
}

/**
 * 试题篮批量添加（去重）
 */
export function addManyToCart(
  cart: readonly MarketplaceCartItem[],
  newItems: readonly MarketplaceCartItem[],
): MarketplaceCartItem[] {
  const existingIds = new Set(cart.map((c) => c.id));
  const additions: MarketplaceCartItem[] = [];
  for (const item of newItems) {
    if (!existingIds.has(item.id)) {
      existingIds.add(item.id);
      additions.push(item);
    }
  }
  return [...cart, ...additions];
}

/**
 * 试题篮移除指定题目
 */
export function removeFromCart(
  cart: readonly MarketplaceCartItem[],
  id: string,
): MarketplaceCartItem[] {
  return cart.filter((c) => c.id !== id);
}

/**
 * 判断指定题目是否在试题篮中
 */
export function isInCart(
  cart: readonly MarketplaceCartItem[],
  id: string,
): boolean {
  return cart.some((c) => c.id === id);
}

/**
 * 将试题篮中的项目转换为标准的 Question 实体集合（供开练或写入题库）
 */
export function cartItemsToQuestions(
  cart: readonly MarketplaceCartItem[],
): Question[] {
  return cart.map((item, index) => ({
    id: item.id ? item.id : `q-cart-${index + 1}-${Date.now().toString(36)}`,
    type: item.type,
    stem: item.stem,
    options: [...item.options],
    answer: item.answer,
    analysis: item.analysis,
    expansion: item.expansion,
    difficulty: item.difficulty ?? 3,
    score: 1,
    kp: item.kp || item.sourceTitle,
    tags: item.tags ? [...item.tags] : [],
    origin: "imported",
    source: `集市挑选 · ${item.sourceTitle}`,
    hash: `h-cart-${item.id}`,
  }));
}

/**
 * 将试题篮中的题目一键打包为标准的 .lvcards (lvcards.v1) 闪卡包
 */
export function cartItemsToLvCardsPackage(
  cart: readonly MarketplaceCartItem[],
  packName?: string,
): LvCardsPackage {
  const questions = cartItemsToQuestions(cart);
  const nowStr = new Date().toISOString().slice(0, 10);
  const distinctSources = Array.from(new Set(cart.map((c) => c.sourceTitle)));
  const title = packName || `小驴精选题卡集 (${nowStr})`;
  const description = `由小驴考试公共集市挑选组卷，汇集 ${distinctSources.join("、")} 等 ${cart.length} 道精选题卡。`;

  return questionsToLvCardsPackage(
    {
      id: `cart-deck-${Date.now()}`,
      name: title,
      description,
    },
    questions,
  );
}

/**
 * 计算题库品质画像、题型占比与难度梯队分布
 */
export function calculateItemQualityMetrics(
  item: MarketplaceItem,
): MarketplaceQualityMetrics {
  const questions = extractCartItemsFromMarketplaceItem(item);
  const total = questions.length;

  if (total === 0) {
    return {
      totalCount: 0,
      typeDistribution: [],
      difficultyDistribution: [],
      expansionRatio: 0,
      topKps: [],
    };
  }

  // 1. 题型分布
  const typeMap: Record<string, number> = {};
  for (const q of questions) {
    typeMap[q.type] = (typeMap[q.type] || 0) + 1;
  }

  const typeConfig: Record<string, { label: string; color: string }> = {
    single: { label: "单选", color: "var(--lv-brand, #3b82f6)" },
    multiple: { label: "多选", color: "var(--lv-data-accent, #0ea5e9)" },
    judge: { label: "判断", color: "var(--lv-green, #10b981)" },
    fill: { label: "填空", color: "var(--lv-accent, #f59e0b)" },
    short: { label: "简答", color: "var(--lv-brand-secondary, #8b5cf6)" },
  };

  const typeDistribution: TypeDistributionItem[] = Object.keys(typeMap).map((k) => {
    const count = typeMap[k] || 0;
    const cfg = typeConfig[k] || { label: "其他", color: "var(--lv-text-3, #94a3b8)" };
    return {
      type: k as QuestionType,
      label: cfg.label,
      count,
      pct: Math.round((count / total) * 100),
      color: cfg.color,
    };
  });

  // 2. 难度梯队
  let easy = 0;
  let medium = 0;
  let hard = 0;
  let withExpansion = 0;
  const kpCountMap: Record<string, number> = {};

  for (const q of questions) {
    const diff = q.difficulty ?? 3;
    if (diff <= 2) easy++;
    else if (diff <= 4) medium++;
    else hard++;

    if (q.expansion && q.expansion.trim().length > 0) {
      withExpansion++;
    }

    if (q.kp) {
      kpCountMap[q.kp] = (kpCountMap[q.kp] || 0) + 1;
    }
  }

  const difficultyDistribution: DifficultyDistributionItem[] = (
    [
      {
        level: "easy" as const,
        label: "基础 (★1-2)",
        count: easy,
        pct: Math.round((easy / total) * 100),
        color: "var(--lv-green, #10b981)",
      },
      {
        level: "medium" as const,
        label: "进阶 (★3-4)",
        count: medium,
        pct: Math.round((medium / total) * 100),
        color: "var(--lv-brand, #3b82f6)",
      },
      {
        level: "hard" as const,
        label: "拔高 (★5)",
        count: hard,
        pct: Math.round((hard / total) * 100),
        color: "var(--lv-accent-seal, #ef4444)",
      },
    ] as const
  )
    .filter((d) => d.count > 0)
    .map((d) => ({ ...d }));

  // 3. Top Kp
  const topKps = Object.entries(kpCountMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([kp, count]) => ({ kp, count }));

  return {
    totalCount: total,
    typeDistribution,
    difficultyDistribution,
    expansionRatio: Math.round((withExpansion / total) * 100),
    topKps,
  };
}

export interface MarketplaceKpNode {
  name: string;
  count: number;
  questionIds: string[];
  children: MarketplaceKpNode[];
}

/**
 * 纯函数：将集市题目聚合为两级章节/考点大纲树
 */
export function buildMarketplaceKpTree(
  items: readonly MarketplaceCartItem[],
): MarketplaceKpNode[] {
  const rootMap = new Map<
    string,
    {
      count: number;
      questionIds: string[];
      subMap: Map<string, { count: number; questionIds: string[] }>;
    }
  >();

  for (const item of items) {
    const rawKp = item.kp || item.tags?.[0] || "通用考点";
    const parts = rawKp.split(/[/／]/).map((p) => p.trim()).filter(Boolean);
    const top = parts[0] || "综合考点";
    const sub = parts[1] || "";

    if (!rootMap.has(top)) {
      rootMap.set(top, { count: 0, questionIds: [], subMap: new Map() });
    }
    const rootEntry = rootMap.get(top)!;
    rootEntry.count++;
    rootEntry.questionIds.push(item.id);

    if (sub) {
      if (!rootEntry.subMap.has(sub)) {
        rootEntry.subMap.set(sub, { count: 0, questionIds: [] });
      }
      const subEntry = rootEntry.subMap.get(sub)!;
      subEntry.count++;
      subEntry.questionIds.push(item.id);
    }
  }

  return Array.from(rootMap.entries()).map(([name, data]) => ({
    name,
    count: data.count,
    questionIds: data.questionIds,
    children: Array.from(data.subMap.entries()).map(([subName, subData]) => ({
      name: subName,
      count: subData.count,
      questionIds: subData.questionIds,
      children: [],
    })),
  }));
}

