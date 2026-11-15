/**
 * 标准 Agent 题卡（QCard）编解码与互操作协议
 * 借鉴先进教研与智能题库规范，面向 AI Agent 与跨平台工具提供通用结构化题卡标准
 */

import type { Question, QuestionType } from "./types";
import { makeQuestion } from "./blockTemplate";

export const QCARD_PROTOCOL_VERSION = 1;
export const QCARD_BUNDLE_TYPE = "qcard-bundle" as const;

export interface QCardItem {
  id?: string;
  type: QuestionType;
  stem: string;
  options?: string[];
  answer: string;
  analysis?: string;
  kp?: string;
  secondaryKps?: string[];
  difficulty?: number;
  score?: number;
  rubric?: unknown;
  source?: string;
  tags?: string[];
}

export interface QCardBundle {
  version: number;
  type: typeof QCARD_BUNDLE_TYPE;
  generator: string;
  title: string;
  exportedAt: string;
  total: number;
  cards: QCardItem[];
}

/**
 * 将题目列表导出为标准 Agent 题卡 JSON 字符串
 */
export function exportQCardsJson(
  title: string,
  questions: readonly Question[],
): string {
  const cards: QCardItem[] = questions.map((q) => ({
    id: q.id,
    type: q.type,
    stem: q.stem,
    options: q.options && q.options.length ? [...q.options] : undefined,
    answer: q.answer,
    analysis: q.analysis || undefined,
    kp: q.kp || undefined,
    secondaryKps: q.secondaryKps && q.secondaryKps.length ? [...q.secondaryKps] : undefined,
    difficulty: q.difficulty || 2,
    score: q.score || 1,
    rubric: q.rubric || undefined,
    source: q.source || title,
    tags: q.userTags && q.userTags.length ? [...q.userTags] : undefined,
  }));

  const bundle: QCardBundle = {
    version: QCARD_PROTOCOL_VERSION,
    type: QCARD_BUNDLE_TYPE,
    generator: "小驴考试 (siyuan-exam)",
    title: title || "题库试题精选",
    exportedAt: new Date().toISOString(),
    total: cards.length,
    cards,
  };

  return JSON.stringify(bundle, null, 2);
}

const VALID_TYPES = new Set<string>(["single", "multiple", "judge", "fill", "short", "material"]);

/**
 * 解析标准 Agent 题卡 JSON 并转换为 Question 数组
 */
export function parseQCardsJson(jsonText: string): {
  valid: boolean;
  title?: string;
  questions: Question[];
  count: number;
  error?: string;
} {
  const raw = String(jsonText ?? "").trim();
  if (!raw) {
    return { valid: false, questions: [], count: 0, error: "题卡数据为空" };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return {
      valid: false,
      questions: [],
      count: 0,
      error: `JSON 格式解析失败: ${String(err instanceof Error ? err.message : err)}`,
    };
  }

  // 既支持包裹在 bundle 中的格式，也支持直接传入 QCardItem[] 数组
  let cards: unknown[] = [];
  let bundleTitle = "导入题卡";

  if (Array.isArray(parsed)) {
    cards = parsed;
  } else if (parsed && typeof parsed === "object") {
    const obj = parsed as Record<string, unknown>;
    if (Array.isArray(obj.cards)) {
      cards = obj.cards;
    } else if (Array.isArray(obj.questions)) {
      cards = obj.questions;
    }
    if (typeof obj.title === "string" && obj.title.trim()) {
      bundleTitle = obj.title.trim();
    }
  }

  if (!cards.length) {
    return { valid: false, questions: [], count: 0, error: "未在 JSON 中找到可用的题目列表 (cards / questions)" };
  }

  const validQuestions: Question[] = [];

  for (let i = 0; i < cards.length; i++) {
    const item = cards[i];
    if (!item || typeof item !== "object") continue;
    const c = item as Record<string, unknown>;

    const stem = String(c.stem || c.content || c.question || "").trim();
    if (!stem) continue;

    let typeStr = String(c.type || "single").toLowerCase().trim();
    if (!VALID_TYPES.has(typeStr)) {
      // 容错映射
      if (typeStr.includes("单选")) typeStr = "single";
      else if (typeStr.includes("多选")) typeStr = "multiple";
      else if (typeStr.includes("判断")) typeStr = "judge";
      else if (typeStr.includes("填空")) typeStr = "fill";
      else if (typeStr.includes("简答") || typeStr.includes("问答")) typeStr = "short";
      else typeStr = "single";
    }
    const type = typeStr as QuestionType;

    const answer = String(c.answer || c.key || "").trim();
    const rawOptions = Array.isArray(c.options) ? c.options.map((o) => String(o ?? "").trim()).filter(Boolean) : [];

    const q = makeQuestion({
      type,
      stem,
      options: rawOptions,
      answer,
      analysis: typeof c.analysis === "string" ? c.analysis : "",
      kp: typeof c.kp === "string" && c.kp.trim() ? c.kp.trim() : bundleTitle,
      difficulty: typeof c.difficulty === "number" ? Math.max(1, Math.min(5, Math.round(c.difficulty))) : 2,
      rubric: c.rubric && typeof c.rubric === "object" ? (c.rubric as Question["rubric"]) : undefined,
      source: typeof c.source === "string" && c.source.trim() ? c.source.trim() : bundleTitle,
    });

    if (typeof c.score === "number" && c.score > 0) {
      q.score = c.score;
    }

    if (Array.isArray(c.secondaryKps)) {
      q.secondaryKps = c.secondaryKps.map((s) => String(s).trim()).filter(Boolean);
    }
    if (Array.isArray(c.tags)) {
      q.userTags = c.tags.map((t) => String(t).trim()).filter(Boolean);
    }

    validQuestions.push(q);
  }

  if (!validQuestions.length) {
    return { valid: false, questions: [], count: 0, error: "有效题卡数量为 0（请检查题干与答案必填项）" };
  }

  return {
    valid: true,
    title: bundleTitle,
    questions: validQuestions,
    count: validQuestions.length,
  };
}
