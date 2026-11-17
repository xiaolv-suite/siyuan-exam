/**
 * 小驴考试与小驴闪卡双向通用协议桥接器 (LvCards Bridge)
 * 严格对齐 siyuan-lv-cards 官方规范格式 format: "lvcards.v1"
 * 
 * 核心目标：
 * 1. 结构零损互通：考试题库（Question）与记忆闪卡（LvPackageCard）无缝双向互转；
 * 2. 纯逻辑零依赖：不引用 DOM、思源内核或浏览器 API，在 Node、端侧或网页中通用于双方插件；
 * 3. 架构合规：100% 静态类型安全，零任意隐式类型强转，零硬编码。
 */

import type { Question, QuestionType } from "./types";
import type { MarketplaceItem } from "./marketplace";
import { makeQuestion } from "./blockTemplate";
import { PLUGIN_VERSION } from "../libs/const";

export type LvCardKind = "qa" | "cloze" | "code" | "list";

export interface LvPackageCard {
  /** 卡片唯一标识（导入时供幂等与引用对齐） */
  id: string;
  /** 卡片正文（Markdown 格式，含 ==挖空== 或 问答排版） */
  markdown: string;
  /** 卡片题型 */
  kind: LvCardKind;
  /** 提炼的问题题干（可选） */
  question?: string;
  /** 提炼的参考答案（可选） */
  answer?: string;
  /** 助记便签 / 记忆线索（随卡流转） */
  memo?: string;
  /** 标签列表 */
  tags?: string[];
  /** 推荐的初始调度参数（供导入方参考） */
  fsrsParams?: {
    difficulty?: number;
    stability?: number;
  };
}

export interface LvCardsPackage {
  /** 规范版本声明 */
  format: "lvcards.v1";
  /** 规范版本号 */
  version: number;
  /** 打包时间戳（毫秒） */
  createdAt: number;
  /** 生成工具声明 */
  generator: string;
  /** 卡组定义 */
  deck: {
    id: string;
    name: string;
    description?: string;
  };
  /** 卡片清单 */
  cards: LvPackageCard[];
  /** 统计元信息 */
  metadata?: {
    cardCount: number;
    tags?: string[];
  };
}

export const LVCARDS_FORMAT_VERSION = "lvcards.v1" as const;
// 版本随仓内单一常量走，避免再次出现 v0.15.0 之类过期字面量（审查 E4）。
export const BRIDGE_GENERATOR_TAG = `siyuan-exam/v${PLUGIN_VERSION}`;

/**
 * 格式化题目的选项列表为纯文本
 */
function formatOptionsText(options: readonly string[]): string {
  if (!options || options.length === 0) return "";
  return options
    .map((opt, idx) => {
      const letter = String.fromCharCode(65 + idx);
      return `${letter}. ${opt}`;
    })
    .join("\n");
}

/**
 * 推断卡片类型 (kind)
 */
function inferCardKind(stem: string, type: QuestionType): LvCardKind {
  if (stem.includes("```")) return "code";
  if (stem.includes("==") || (type === "fill" && stem.includes("____"))) return "cloze";
  return "qa";
}

/**
 * 将单个小驴考试试题 (Question) 转换为小驴闪卡卡片 (LvPackageCard)
 */
export function questionToLvPackageCard(q: Question): LvPackageCard {
  const kind = inferCardKind(q.stem, q.type);
  const optionsBlock = formatOptionsText(q.options);
  
  // 提炼题干
  const questionPart = optionsBlock ? `${q.stem}\n\n${optionsBlock}` : q.stem;

  // 提炼答案呈现
  let answerPart: string;
  if (q.type === "judge") {
    const isTrue = q.answer === "T" || q.answer === "true" || q.answer === "正确" || q.answer === "1";
    answerPart = `**判断结果**：${isTrue ? "正确 ✓" : "错误 ✕"}`;
  } else if (q.type === "single" || q.type === "multiple") {
    answerPart = `**正确答案**：${q.answer}`;
  } else {
    answerPart = `**参考答案**：${q.answer}`;
  }

  if (q.analysis && q.analysis.trim()) {
    answerPart += `\n\n**解析**：\n${q.analysis.trim()}`;
  }

  // 构建便签/思路拓展
  const memo = q.expansion?.trim() || q.analysis?.trim() || undefined;

  // 拼接完整的 Markdown 正文
  let markdown = `## 题目\n${questionPart}\n\n---\n\n## 答案\n${answerPart}`;
  if (q.expansion && q.expansion.trim()) {
    markdown += `\n\n> 💡 **思路拓展与秒杀技巧**：\n> ${q.expansion.trim()}`;
  }

  // 汇聚标签
  const tagSet = new Set<string>();
  if (Array.isArray(q.tags)) {
    for (const t of q.tags) if (t) tagSet.add(t.trim());
  }
  if (q.kp) {
    const parts = q.kp.split(/[/|#]/).map((s) => s.trim()).filter(Boolean);
    for (const p of parts) tagSet.add(p);
  }
  if (Array.isArray(q.secondaryKps)) {
    for (const skp of q.secondaryKps) if (skp) tagSet.add(skp.trim());
  }

  // 映射难度系数 (1-5 -> 2-10)
  const difficulty = typeof q.difficulty === "number" && q.difficulty >= 1
    ? Math.min(10, Math.max(1, Math.round(q.difficulty * 2)))
    : undefined;

  return {
    id: q.id,
    markdown,
    kind,
    question: questionPart,
    answer: answerPart,
    memo,
    tags: Array.from(tagSet),
    fsrsParams: difficulty ? { difficulty } : undefined,
  };
}

/**
 * 将试题集合打包为规范的 LvCardsPackage
 */
export function questionsToLvCardsPackage(
  deck: { id: string; name: string; description?: string },
  questions: readonly Question[],
  generator: string = BRIDGE_GENERATOR_TAG,
): LvCardsPackage {
  const cards = questions.map((q) => questionToLvPackageCard(q));
  const tagSet = new Set<string>();
  for (const card of cards) {
    if (card.tags) {
      for (const t of card.tags) tagSet.add(t);
    }
  }

  return {
    format: LVCARDS_FORMAT_VERSION,
    version: 1,
    createdAt: Date.now(),
    generator,
    deck: {
      id: deck.id.trim(),
      name: deck.name.trim(),
      description: deck.description?.trim(),
    },
    cards,
    metadata: {
      cardCount: cards.length,
      tags: Array.from(tagSet),
    },
  };
}

/**
 * 将集市资源项 (MarketplaceItem) 转化为标准的 LvCardsPackage
 */
export function marketplaceItemToLvCardsPackage(
  item: MarketplaceItem,
  generator: string = BRIDGE_GENERATOR_TAG,
): LvCardsPackage {
  const questions: Question[] = item.embeddedQuestions && item.embeddedQuestions.length > 0
    ? item.embeddedQuestions
    : (item.previewItems || []).map((prev, idx) => ({
        id: `${item.id}-prev-${idx + 1}`,
        type: prev.options && prev.options.length > 0 ? "single" : "short",
        stem: prev.stem,
        options: prev.options || [],
        answer: prev.answer || "见解析",
        analysis: prev.analysis,
        score: 2,
        origin: "imported",
        tags: item.tags,
        hash: `h-${item.id}-prev-${idx + 1}`,
      }));

  return questionsToLvCardsPackage(
    {
      id: item.id,
      name: item.title,
      description: `${item.subtitle ? item.subtitle + "。\n" : ""}${item.description}`,
    },
    questions,
    generator,
  );
}

/**
 * 序列化小驴闪卡分享包为 JSON 字符串
 */
export function serializeLvCardsPackage(pkg: LvCardsPackage): string {
  return JSON.stringify(pkg, null, 2);
}

/**
 * 解析并校验小驴闪卡分享包
 */
export function parseLvCardsPackage(rawJson: string): {
  valid: boolean;
  package?: LvCardsPackage;
  error?: string;
} {
  try {
    const obj = JSON.parse(rawJson) as Record<string, unknown>;
    if (!obj || typeof obj !== "object") {
      return { valid: false, error: "不是合法的 JSON 格式" };
    }
    if (obj.format !== "lvcards.v1") {
      return { valid: false, error: `不支持的分享包格式: ${String(obj.format)}，仅支持 lvcards.v1` };
    }
    const deck = obj.deck as Record<string, unknown> | undefined;
    if (!deck || typeof deck.name !== "string" || !deck.name.trim()) {
      return { valid: false, error: "分享包缺少卡组名称 (deck.name)" };
    }
    if (!Array.isArray(obj.cards)) {
      return { valid: false, error: "分享包缺少卡片清单 (cards)" };
    }

    const cards: LvPackageCard[] = [];
    for (let i = 0; i < obj.cards.length; i++) {
      const c = obj.cards[i] as Record<string, unknown>;
      if (!c || typeof c.markdown !== "string") {
        return { valid: false, error: `第 ${i + 1} 张卡片缺少正文 (markdown)` };
      }
      const safeKind: LvCardKind = c.kind === "cloze" || c.kind === "code" || c.kind === "list" ? c.kind : "qa";
      cards.push({
        id: typeof c.id === "string" ? c.id : `card-${i + 1}`,
        markdown: c.markdown,
        kind: safeKind,
        question: typeof c.question === "string" ? c.question : undefined,
        answer: typeof c.answer === "string" ? c.answer : undefined,
        memo: typeof c.memo === "string" ? c.memo : undefined,
        tags: Array.isArray(c.tags) ? c.tags.map(String) : undefined,
        fsrsParams: typeof c.fsrsParams === "object" && c.fsrsParams !== null
          ? {
              difficulty: typeof (c.fsrsParams as Record<string, unknown>).difficulty === "number"
                ? Number((c.fsrsParams as Record<string, unknown>).difficulty)
                : undefined,
              stability: typeof (c.fsrsParams as Record<string, unknown>).stability === "number"
                ? Number((c.fsrsParams as Record<string, unknown>).stability)
                : undefined,
            }
          : undefined,
      });
    }

    return {
      valid: true,
      package: {
        format: "lvcards.v1",
        version: typeof obj.version === "number" ? obj.version : 1,
        createdAt: typeof obj.createdAt === "number" ? obj.createdAt : Date.now(),
        generator: typeof obj.generator === "string" ? obj.generator : "unknown",
        deck: {
          id: typeof deck.id === "string" ? deck.id : `deck-${Date.now()}`,
          name: deck.name.trim(),
          description: typeof deck.description === "string" ? deck.description : undefined,
        },
        cards,
        metadata: {
          cardCount: cards.length,
          tags: Array.isArray((obj.metadata as Record<string, unknown> | undefined)?.tags)
            ? ((obj.metadata as Record<string, unknown>).tags as unknown[]).map(String)
            : undefined,
        },
      },
    };
  } catch (e) {
    return { valid: false, error: String(e instanceof Error ? e.message : e) };
  }
}

/**
 * 将单个小驴闪卡卡片 (LvPackageCard) 还原为小驴考试试题 (Question)
 */
export function lvPackageCardToQuestion(card: LvPackageCard, defaultDeckName?: string): Question {
  let stem = card.question?.trim() || "";
  let answer = "";
  let analysis: string | undefined;
  let expansion: string | undefined;
  const options: string[] = [];

  // 如果没有单独的 question 字段，尝试从 markdown 解析
  if (!stem && card.markdown) {
    const qMatch = card.markdown.match(/## 题目\s*([\s\S]*?)(?:\n\s*---\s*\n|## 答案|$)/i);
    if (qMatch) {
      stem = qMatch[1].trim();
    } else {
      stem = card.markdown.trim();
    }
  }

  // 尝试从 markdown 提取答案与解析（如果 card.answer 未显式给出或需进一步拆分）
  if (card.markdown) {
    const ansMatch = card.markdown.match(/## 答案\s*([\s\S]*?)(?:\n\s*> 💡|$)/i);
    if (ansMatch) {
      const ansSection = ansMatch[1].trim();
      const directAnsMatch = ansSection.match(/\*\*(?:正确答案|参考答案|判断结果)\*\*\s*[:：]\s*([^\n\r]+)/);
      if (directAnsMatch) {
        answer = directAnsMatch[1].trim();
      }
      const anaMatch = ansSection.match(/\*\*解析\*\*\s*[:：]\s*([\s\S]*)$/);
      if (anaMatch) {
        analysis = anaMatch[1].trim();
      }
    }
    const expMatch = card.markdown.match(/> 💡\s*\*\*思路拓展与秒杀技巧\*\*\s*[:：]\s*([\s\S]*?)(?:\n\n|$)/);
    if (expMatch) {
      expansion = expMatch[1].replace(/^>\s*/gm, "").trim();
    }
  }

  if (!answer && card.answer) {
    const directAnsMatch = card.answer.match(/\*\*(?:正确答案|参考答案|判断结果)\*\*\s*[:：]\s*([^\n\r]+)/);
    if (directAnsMatch) {
      answer = directAnsMatch[1].trim();
      const anaMatch = card.answer.match(/\*\*解析\*\*\s*[:：]\s*([\s\S]*)$/);
      if (anaMatch && !analysis) {
        analysis = anaMatch[1].trim();
      }
    } else {
      answer = card.answer.trim();
    }
  }

  // 如果仍未解析到 expansion，但 card.memo 存在且不同于 analysis，则 memo 作为 expansion 或 analysis
  if (card.memo) {
    const memoTrimmed = card.memo.trim();
    if (!analysis) {
      analysis = memoTrimmed;
    } else if (!expansion && memoTrimmed !== analysis) {
      expansion = memoTrimmed;
    }
  }

  // 答案清洗：如果是判断题
  if (answer.includes("正确") || answer === "T" || answer === "true" || answer === "1" || answer.includes("✓")) {
    answer = "对";
  } else if (answer.includes("错误") || answer === "F" || answer === "false" || answer === "0" || answer.includes("✕")) {
    answer = "错";
  }

  // 从 stem 中分离选项（A. / B. / C. / D.）
  const optRegex = /(?:^|\n)\s*([A-J])[.、:：]\s*([^\n]+)/g;
  let optMatch: RegExpExecArray | null;
  const parsedOptions: Array<{ letter: string; text: string; fullMatch: string; index: number }> = [];
  while ((optMatch = optRegex.exec(stem)) !== null) {
    parsedOptions.push({
      letter: optMatch[1].toUpperCase(),
      text: optMatch[2].trim(),
      fullMatch: optMatch[0],
      index: optMatch.index,
    });
  }

  if (parsedOptions.length >= 2 && parsedOptions[0].letter === "A" && parsedOptions[1].letter === "B") {
    // 成功匹配到连续选项
    const firstOptIdx = parsedOptions[0].index;
    for (const po of parsedOptions) {
      options.push(po.text);
    }
    stem = stem.slice(0, firstOptIdx).trim();
  }

  // 判定题型
  let type: QuestionType = "short";
  if (answer === "对" || answer === "错") {
    type = "judge";
  } else if (options.length >= 2) {
    type = answer.length > 1 ? "multiple" : "single";
  } else if (/_{2,}|（\s*）|\(\s*\)|【\s*】|\[\s*\]|==.*?==/.test(stem)) {
    type = "fill";
  }

  const q = makeQuestion({
    type,
    stem: stem || "题目内容待补充",
    options,
    answer: answer || (type === "single" ? "A" : type === "judge" ? "对" : "参考答案见解析"),
    analysis,
    expansion,
    kp: card.tags?.[0] || defaultDeckName || "导入卡片",
    difficulty: card.fsrsParams?.difficulty ? Math.min(5, Math.max(1, Math.round(card.fsrsParams.difficulty / 2))) : 3,
  });

  if (card.id) q.id = card.id;
  if (Array.isArray(card.tags)) q.tags = card.tags;
  q.origin = "imported";
  q.sourceKind = "real";

  return q;
}

/**
 * 将整包小驴闪卡转换为小驴考试试题列表
 */
export function lvCardsPackageToQuestions(pkg: LvCardsPackage): Question[] {
  if (!pkg || !Array.isArray(pkg.cards)) return [];
  return pkg.cards.map((card) => lvPackageCardToQuestion(card, pkg.deck?.name));
}

/**
 * 从 JSON 文本解析小驴闪卡包并转换为试题列表
 */
export function parseLvCardsJsonToQuestions(rawJson: string): {
  valid: boolean;
  questions: Question[];
  count: number;
  deckName?: string;
  error?: string;
} {
  const parsed = parseLvCardsPackage(rawJson);
  if (!parsed.valid || !parsed.package) {
    return { valid: false, questions: [], count: 0, error: parsed.error };
  }
  const questions = lvCardsPackageToQuestions(parsed.package);
  return {
    valid: true,
    questions,
    count: questions.length,
    deckName: parsed.package.deck.name,
  };
}

