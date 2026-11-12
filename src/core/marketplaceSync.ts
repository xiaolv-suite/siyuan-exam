/**
 * 题库与闪卡集市增量差量同步与发布打包核心
 * (Marketplace Delta Sync & Packaging Engine)
 *
 * 核心能力：
 * 1. 语义化版本比对 (SemVer Comparison)；
 * 2. 本地题库与集市远端版本的细粒度差量比对（新增、修订、无变动）；
 * 3. 非破坏性增量合并（Patch & Merge）：保留答题记录与错题标记，仅更新题目文本；
 * 4. 题库发布向导：隐私脱敏扫描与标准集市源 JSON 构建。
 */

import type { Question } from "./types";
import type { MarketplaceCategory, MarketplaceItem, MarketplaceCatalog } from "./marketplace";

export interface QuestionDeltaReport {
  hasUpdates: boolean;
  addedCount: number;
  updatedCount: number;
  unchangedCount: number;
  added: Question[];
  updated: Array<{
    local: Question;
    remote: Question;
    changedFields: Array<"stem" | "options" | "answer" | "analysis" | "expansion" | "kp">;
  }>;
  unchanged: Question[];
}

export interface PrivacySanitizeWarning {
  questionId: string;
  field: "stem" | "analysis" | "expansion";
  type: "absolute_path" | "internal_uri" | "private_id";
  snippet: string;
  suggestion: string;
}

export interface BankPackagingOptions {
  id: string;
  title: string;
  subtitle?: string;
  description: string;
  category: MarketplaceCategory;
  tags: string[];
  authorName: string;
  authorUrl?: string;
  version: string;
  license: "CC0" | "CC-BY-4.0" | "CC-BY-NC-4.0" | "Public Domain" | "MIT";
  questions: readonly Question[];
}

/**
 * 比较两组语义化版本号
 * 返回: 1 代表 v1 > v2; -1 代表 v1 < v2; 0 代表相等
 */
export function compareSemVer(v1: string, v2: string): number {
  const parse = (v: string) =>
    v
      .replace(/^v/, "")
      .split(".")
      .map((n) => parseInt(n, 10) || 0);

  const [maj1 = 0, min1 = 0, pat1 = 0] = parse(v1);
  const [maj2 = 0, min2 = 0, pat2 = 0] = parse(v2);

  if (maj1 !== maj2) return maj1 > maj2 ? 1 : -1;
  if (min1 !== min2) return min1 > min2 ? 1 : -1;
  if (pat1 !== pat2) return pat1 > pat2 ? 1 : -1;
  return 0;
}

/**
 * 规范化文本比对（去除多余首尾空白与换行格式差异）
 */
function normalizeText(text?: string): string {
  return (text || "").replace(/\r\n/g, "\n").trim();
}

/**
 * 比对本地题目集与远端新版本题目集的差异（Delta Analysis）
 */
export function calculateQuestionDelta(
  localQuestions: readonly Question[],
  remoteQuestions: readonly Question[],
): QuestionDeltaReport {
  const localMap = new Map<string, Question>();
  const localStemMap = new Map<string, Question>();

  for (const q of localQuestions) {
    localMap.set(q.id, q);
    localStemMap.set(normalizeText(q.stem), q);
  }

  const added: Question[] = [];
  const updated: QuestionDeltaReport["updated"] = [];
  const unchanged: Question[] = [];

  for (const remote of remoteQuestions) {
    // 优先依据稳定 ID 匹配，其次依据题干全文比对
    const local = localMap.get(remote.id) || localStemMap.get(normalizeText(remote.stem));

    if (!local) {
      added.push(remote);
      continue;
    }

    const changedFields: Array<"stem" | "options" | "answer" | "analysis" | "expansion" | "kp"> = [];

    if (normalizeText(local.stem) !== normalizeText(remote.stem)) {
      changedFields.push("stem");
    }

    const localOpts = (local.options || []).map((o) => normalizeText(o)).join("§");
    const remoteOpts = (remote.options || []).map((o) => normalizeText(o)).join("§");
    if (localOpts !== remoteOpts) {
      changedFields.push("options");
    }

    if (normalizeText(local.answer) !== normalizeText(remote.answer)) {
      changedFields.push("answer");
    }

    if (normalizeText(local.analysis) !== normalizeText(remote.analysis)) {
      changedFields.push("analysis");
    }

    if (normalizeText(local.expansion) !== normalizeText(remote.expansion)) {
      changedFields.push("expansion");
    }

    if (normalizeText(local.kp) !== normalizeText(remote.kp)) {
      changedFields.push("kp");
    }

    if (changedFields.length > 0) {
      updated.push({
        local,
        remote,
        changedFields,
      });
    } else {
      unchanged.push(local);
    }
  }

  return {
    hasUpdates: added.length > 0 || updated.length > 0,
    addedCount: added.length,
    updatedCount: updated.length,
    unchangedCount: unchanged.length,
    added,
    updated,
    unchanged,
  };
}

/**
 * 非破坏性增量合并（Non-destructive Patch Merge）
 * 保留本地 blockId 与属性，仅合入远端修订字段，并追加新题目
 */
export function mergeQuestionDelta(
  localQuestions: readonly Question[],
  delta: QuestionDeltaReport,
): Question[] {
  const updatedMap = new Map<string, Question>();
  for (const item of delta.updated) {
    const patched: Question = {
      ...item.local,
      stem: item.remote.stem,
      options: [...(item.remote.options || [])],
      answer: item.remote.answer,
      analysis: item.remote.analysis,
      expansion: item.remote.expansion,
      kp: item.remote.kp || item.local.kp,
    };
    updatedMap.set(item.local.id, patched);
  }

  const result: Question[] = [];
  for (const local of localQuestions) {
    if (updatedMap.has(local.id)) {
      result.push(updatedMap.get(local.id)!);
    } else {
      result.push(local);
    }
  }

  // 追加新增题目
  for (const add of delta.added) {
    result.push({
      ...add,
      origin: "imported",
    });
  }

  return result;
}

/**
 * 题库发布前隐私与脱敏扫描
 * 检查本地绝对路径、思源块内链与私有标记
 */
export function scanPrivacyIssues(
  questions: readonly Question[],
): PrivacySanitizeWarning[] {
  const warnings: PrivacySanitizeWarning[] = [];

  const checkText = (text: string | undefined, qid: string, field: "stem" | "analysis" | "expansion") => {
    if (!text) return;

    // 1. 扫描 Windows/Unix 本地文件路径
    const absPathRegex = /(?:[a-zA-Z]:\\|\/Users\/|\/home\/)[^\s")'>]+/g;
    let match: RegExpExecArray | null;
    while ((match = absPathRegex.exec(text)) !== null) {
      warnings.push({
        questionId: qid,
        field,
        type: "absolute_path",
        snippet: match[0].slice(0, 40),
        suggestion: "包含本地绝对文件路径，他人无法打开，建议转换为相对资源或公网外链。",
      });
    }

    // 2. 扫描思源私有块超链接 siyuan://blocks/...
    const siyuanLinkRegex = /siyuan:\/\/blocks\/[a-zA-Z0-9_-]+/g;
    while ((match = siyuanLinkRegex.exec(text)) !== null) {
      warnings.push({
        questionId: qid,
        field,
        type: "internal_uri",
        snippet: match[0],
        suggestion: "包含思源笔记私有块超链接，其他用户的思源笔记本无法解析该块。",
      });
    }
  };

  for (const q of questions) {
    checkText(q.stem, q.id, "stem");
    checkText(q.analysis, q.id, "analysis");
    checkText(q.expansion, q.id, "expansion");
  }

  return warnings;
}

/**
 * 将本地题库打包为符合规范的集市条目 (MarketplaceItem)
 */
export function buildMarketplaceItemFromBank(
  options: BankPackagingOptions,
): MarketplaceItem {
  const previewItems = options.questions.slice(0, 3).map((q) => ({
    stem: q.stem,
    options: q.options && q.options.length ? [...q.options] : undefined,
    answer: q.answer,
    analysis: q.analysis,
  }));

  const safeEmbedded: Question[] = options.questions.map((q) => ({
    id: q.id,
    type: q.type,
    stem: q.stem,
    options: [...(q.options || [])],
    answer: q.answer,
    analysis: q.analysis,
    expansion: q.expansion,
    difficulty: q.difficulty ?? 3,
    score: q.score || 1,
    kp: q.kp,
    tags: q.tags ? [...q.tags] : [],
    origin: "imported",
    hash: q.hash || `h-${q.id}`,
  }));

  return {
    id: options.id.trim(),
    title: options.title.trim(),
    subtitle: options.subtitle?.trim(),
    description: options.description.trim(),
    kind: "both",
    category: options.category,
    tags: [...options.tags],
    author: {
      name: options.authorName.trim(),
      url: options.authorUrl?.trim(),
    },
    version: options.version.trim() || "1.0.0",
    itemCount: safeEmbedded.length,
    license: options.license,
    downloadUrl: `embedded:${options.id.trim()}`,
    verified: false,
    updatedAt: new Date().toISOString().slice(0, 10),
    previewItems,
    embeddedQuestions: safeEmbedded,
  };
}

/**
 * 将单个集市条目包装为可用于订阅源分发的规范 JSON
 */
export function buildMarketplaceCatalogJson(
  catalogName: string,
  catalogDesc: string,
  items: MarketplaceItem[],
): string {
  const catalog: MarketplaceCatalog = {
    v: 1,
    name: catalogName.trim(),
    description: catalogDesc.trim(),
    updatedAt: new Date().toISOString().slice(0, 10),
    items,
  };
  return JSON.stringify(catalog, null, 2);
}
