// ============================================================
// AI 考点变式衍生题机（AI Variant Question Generator）
// 核心哲学：自测易产生"看懂了/记住了选项"的虚假自信。
// 本模块基于原题核心考点，提供 4 维换元变式能力：
//   1. numeric (数值换元): 同公式/逻辑，置换数值与条件；
//   2. reverse (逆向推导): 互换已知条件与待求结论，反向考查；
//   3. distractor_swap (干扰项混淆): 保留考点内核，精心重构思维陷阱与常见误区干扰项；
//   4. near_transfer (情境置换): 相同解题模型，置换全新情境背景与应用载体。
// 纯函数领域层，支持离线 5 级降级与容错解析。
// ============================================================

import type { Question, QuestionType, QuestionFamilyRef } from "./types";
import { newQuestionId } from "./ids";
import { questionHash, normalizeAnswer } from "./answer";

export type VariantKind = "numeric" | "reverse" | "distractor_swap" | "near_transfer";

export interface VariantKindMeta {
  kind: VariantKind;
  label: string;
  badge: string;
  icon: string;
  summary: string;
  instruction: string;
}

export const VARIANT_KINDS: Record<VariantKind, VariantKindMeta> = {
  numeric: {
    kind: "numeric",
    label: "数值换元",
    badge: "🔢 数值换元",
    icon: "hash",
    summary: "置换参数与数值，考查真实计算与推导",
    instruction: "保持解题原理与计算逻辑完全一致，全面置换题干中的具体数值、比例、时间、数量等参数，重新计算出精确唯一的答案，考验真实解题而非死记数字。",
  },
  reverse: {
    kind: "reverse",
    label: "逆向推导",
    badge: "🔄 逆向推导",
    icon: "repeat",
    summary: "互换前提与结论，打破单向因果死记",
    instruction: "颠倒解题方向。将原题的已知条件设为待求问题，将原题的答案或结论作为已知条件，考查考生双向推导与逻辑互逆能力。",
  },
  distractor_swap: {
    kind: "distractor_swap",
    label: "干扰混淆",
    badge: "🎭 干扰混淆",
    icon: "alert-triangle",
    summary: "重构思维陷阱与高仿干扰项，辨析概念误区",
    instruction: "保留原题主干考点内核，精心重构 3~4 个具有高度迷惑性的干扰项，分别对应考生的常见认知偏误、概念偷换、张冠李戴或粗心遗漏，并在解析中逐一剖析每个干扰项的致错原因。",
  },
  near_transfer: {
    kind: "near_transfer",
    label: "情境迁移",
    badge: "🌐 情境迁移",
    icon: "compass",
    summary: "置换全新应用场景，考验知识迁移活用",
    instruction: "保持底层概念、判定规则与解题模型完全一致，将表面情境和应用背景做全新置换（例如从学术定义换为生活场景、从古代案例换为现代工程场景），考查知识的迁移应用能力。",
  },
};

export interface VariantGenerationPrompt {
  systemPrompt: string;
  userPrompt: string;
}

/**
 * 构建向大模型请求生成变式题的高质量结构化提示词
 */
export function buildVariantPrompt(
  seed: Question,
  kind: VariantKind = "near_transfer",
): VariantGenerationPrompt {
  const meta = VARIANT_KINDS[kind] ?? VARIANT_KINDS.near_transfer;
  const optionsText = seed.options && seed.options.length > 0
    ? seed.options.map((opt, i) => `  ${String.fromCharCode(65 + i)}. ${opt}`).join("\n")
    : "（无选项，非客观单选）";

  const systemPrompt = [
    "你是一位资深国家级考试命题专家与高考/公考/研考命题顾问。",
    "你的任务是针对考生做错的原始题目，严格围绕相同知识点本质，衍生出一道高质量的「变式强化训练题」，终结死记硬背与虚假自信。",
    "【变式维度要求】",
    `当前选定变式维度：${meta.badge} - ${meta.label}`,
    `具体指导：${meta.instruction}`,
    "【命题质量铁律】",
    "1. 考点同核：变式题考查的核心考点与原题完全一致，但绝不能让考生凭对原题选项/答案的记忆直接选出；",
    "2. 题型一致：除非特殊声明，原则上保持题型（单选/多选/判断/填空）与原题一致；单选题必须有且仅有 4 个选项 (A, B, C, D) 且只有一个正确答案；",
    "3. 严禁逻辑硬伤：数值必须自洽无矛盾，答案必须唯一可辩护；",
    "4. 输出格式：必须只输出符合 JSON 语法的纯 JSON 文本，严禁包含任何前缀闲聊或 Markdown 代码块外的杂音。",
  ].join("\n");

  const userPrompt = [
    "【原始错题信息】",
    `- 题目类型：${seed.type}`,
    `- 考点章节：${seed.kp || "未分类"}`,
    `- 原题题干：\n${seed.stem}`,
    `- 原题选项：\n${optionsText}`,
    `- 原题答案：${seed.answer}`,
    seed.analysis ? `- 原题解析：\n${seed.analysis}` : "",
    "",
    "【变式生成要求】",
    `请按「${meta.badge}」维度，衍生出 1 道全新变式题，严格按以下 JSON Schema 格式输出：`,
    `{
  "stem": "变式后的完整题干（支持 Markdown 与 LaTeX 公式）",
  "type": "${seed.type}",
  "options": ["选项A内容", "选项B内容", "选项C内容", "选项D内容"],
  "answer": "正确选项字母（如 A 或 CD）或填空文本",
  "analysis": "详尽解析，指出解题步骤及各干扰项的误区",
  "variantExplanation": "【变式剖析】一句话简明说明本题相比原题做出了怎样的换元或情境置换，引导考生举一反三",
  "difficulty": "${seed.difficulty || "medium"}",
  "kp": "${seed.kp || ""}"
}`,
  ].filter(Boolean).join("\n");

  return { systemPrompt, userPrompt };
}

export interface RawVariantResponse {
  stem: string;
  type?: QuestionType;
  options?: string[];
  answer: string;
  analysis?: string;
  variantExplanation?: string;
  difficulty?: "easy" | "medium" | "hard";
  kp?: string;
}

/**
 * 容错清洗并解析 AI 输出的 JSON 结果
 */
export function extractAndParseVariantJson(rawText: string): RawVariantResponse {
  if (!rawText || !rawText.trim()) {
    throw new Error("AI 未返回任何内容");
  }

  let text = rawText.trim();
  // 剥离 ```json ... ``` 代码块标记
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (codeBlockMatch) {
    text = codeBlockMatch[1].trim();
  }

  // 找到第一个 { 与最后一个 }
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    text = text.substring(firstBrace, lastBrace + 1);
  }

  try {
    const parsed = JSON.parse(text) as RawVariantResponse;
    if (!parsed.stem || typeof parsed.stem !== "string") {
      throw new Error("AI 变式题缺少 stem 题干字段");
    }
    if (!parsed.answer && parsed.answer !== "0") {
      throw new Error("AI 变式题缺少 answer 答案字段");
    }
    return parsed;
  } catch (err: any) {
    throw new Error(`变式题 JSON 解析失败: ${err?.message || err}\n原始返回:\n${rawText.slice(0, 300)}`);
  }
}

function parseDifficulty(diff: any, seedDiff?: number): number {
  if (typeof diff === "number" && Number.isFinite(diff)) {
    return Math.min(5, Math.max(1, Math.round(diff)));
  }
  if (diff === "easy") return 2;
  if (diff === "hard") return 4;
  if (diff === "medium") return 3;
  return seedDiff ?? 3;
}

/**
 * 根据原始题和 AI 返回的变式数据，构造标准 Question 对象
 */
export function assembleVariantQuestion(
  raw: RawVariantResponse,
  seed: Question,
  kind: VariantKind,
): Question {
  const type: QuestionType = raw.type || seed.type || "single";
  const stem = raw.stem.trim();
  const rawAnswer = String(raw.answer || "").trim();

  // 清洗选项前缀 A. B. C. 等
  let options = raw.options;
  if (options && Array.isArray(options)) {
    options = options.map((opt) => opt.replace(/^[A-J][.、)）\s]+/, "").trim());
  } else {
    options = [];
  }

  // 规范化答案
  const answer = normalizeAnswer(type, rawAnswer) || rawAnswer;

  const family: QuestionFamilyRef = {
    parentId: seed.id,
    variantKind: kind,
    verified: true,
  };

  const id = newQuestionId();
  const fullAnalysis = [
    raw.variantExplanation ? `> 💡 **变式考法剖析**：${raw.variantExplanation}` : "",
    raw.analysis || "",
  ].filter(Boolean).join("\n\n");

  return {
    id,
    type,
    stem,
    options: options ?? [],
    answer,
    analysis: fullAnalysis || undefined,
    kp: raw.kp || seed.kp,
    difficulty: parseDifficulty(raw.difficulty, seed.difficulty),
    score: seed.score ?? 1,
    origin: "ai",
    family,
    hash: questionHash(stem, options),
    rootId: seed.rootId,
    sourceBlockId: seed.sourceBlockId || seed.blockId,
    tags: seed.tags ? [...seed.tags, "AI变式题"] : ["AI变式题"],
  };
}

/**
 * 离线/降级模式下的确定性变式衍生（保证断网时仍 100% 可用）
 */
export function generateOfflineVariantFallback(
  seed: Question,
  kind: VariantKind,
): Question {
  const meta = VARIANT_KINDS[kind];
  const stemPrefix = `【变式训练 · ${meta.badge}】`;
  let stem = `${stemPrefix}\n（原题考点：${seed.kp || "基础核心知识点"}）\n\n`;

  if (kind === "numeric") {
    // 启发式数字变动
    stem += seed.stem.replace(/\b(\d+)\b/g, (_m, n) => {
      const num = parseInt(n, 10);
      return String(num > 10 ? num * 2 : num + 5);
    });
  } else if (kind === "reverse") {
    stem += `已知原题结论为：“${seed.answer}”，请反推在满足何种前置约束或临界条件时，该结论恒成立？\n原题干情景参考：\n${seed.stem}`;
  } else if (kind === "distractor_swap") {
    stem += `${seed.stem}\n（提示：请特别警惕相近概念偷换与边界条件混淆）`;
  } else {
    // near_transfer
    stem += `${seed.stem}\n（拓展思考：若将本题考点迁移至实际工程/综合案例中，核心逻辑应如何运用？）`;
  }

  const options = seed.options ? [...seed.options] : [];
  // 单选题打乱选项顺序以防记忆位置
  let answer = seed.answer;
  if (options.length > 1 && seed.type === "single") {
    const letters = ["A", "B", "C", "D", "E", "F"];
    const origIndex = letters.indexOf(seed.answer.toUpperCase());
    if (origIndex !== -1 && origIndex < options.length) {
      // 倒序轮换
      const targetIndex = (origIndex + 1) % options.length;
      const temp = options[origIndex];
      options[origIndex] = options[targetIndex];
      options[targetIndex] = temp;
      answer = letters[targetIndex];
    }
  }

  const family: QuestionFamilyRef = {
    parentId: seed.id,
    variantKind: kind,
    verified: false,
  };

  return {
    id: newQuestionId(),
    type: seed.type,
    stem,
    options,
    answer,
    analysis: `【离线变式提示】本题基于原题进行「${meta.label}」衍生。建议对照原题解析深入复盘核心公式与考点推导。\n\n${seed.analysis || ""}`,
    kp: seed.kp,
    difficulty: seed.difficulty ?? 3,
    score: seed.score ?? 1,
    origin: "ai",
    family,
    hash: questionHash(stem, options),
    rootId: seed.rootId,
    sourceBlockId: seed.sourceBlockId || seed.blockId,
    tags: seed.tags ? [...seed.tags, "变式巩固"] : ["变式巩固"],
  };
}
