/**
 * ============================================================
 * 外部知识图谱与课程分类体系适配器 (Taxonomy Adapter)
 * 适配标准：Marble os-taxonomy / cn-math-taxonomy / CnK12Taxonomy 规范
 * 能力：将外部学科知识点、先修边与诊断题转换为小驴考试考纲树、关系图与标准题目
 * ============================================================
 */

import type { Question, QuestionType } from "./types";
import type { SyllabusNode } from "./syllabus";
import type { KpRelation } from "./kpRelations";
import { questionHash } from "./answer";
import { newQuestionId } from "./ids";

export interface TaxonomyTopic {
  id: string;
  name: string;
  domain?: string;
  grade?: number;
  semester?: string;
  chapter?: string;
  type?: string;
  description?: string;
  mastery_criteria?: string[];
  diagnostic_question?: {
    question: string;
    answer: string;
    options?: string[];
    analysis?: string;
  };
  standards?: Array<{
    id: string;
    confidence?: string;
    note?: string;
  }>;
}

export interface TaxonomyDependency {
  topicId: string;
  prerequisiteId: string;
  strength?: "hard" | "soft";
  reason?: string;
}

export interface TaxonomyQuestionItem {
  id?: string;
  topic_id?: string;
  topicId?: string;
  stem?: string;
  question?: string;
  type?: string;
  options?: string[];
  answer: string | number;
  analysis?: string;
  difficulty?: string | number;
}

/**
 * 将外部扁平知识点数组解析构建为小驴考试分层考纲树 (SyllabusNode[])
 * 层次结构：大领域 (domain) -> 教材章节 (chapter) -> 微知识点 (title)
 */
export function convertTaxonomyToSyllabus(topics: readonly TaxonomyTopic[]): SyllabusNode[] {
  if (!topics || !topics.length) return [];

  const rootMap = new Map<string, { node: SyllabusNode; chapterMap: Map<string, SyllabusNode> }>();
  let domainSeq = 1;

  for (const topic of topics) {
    const domain = (topic.domain || "综合学科").trim();
    const chapter = (topic.chapter || "基础章节").trim();
    const name = (topic.name || topic.id).trim();

    // 1. 获取或创建领域根节点
    let domainEntry = rootMap.get(domain);
    if (!domainEntry) {
      const domainNode: SyllabusNode = {
        id: `d-${domainSeq++}`,
        title: domain,
        kpPrefix: domain,
        children: [],
      };
      domainEntry = { node: domainNode, chapterMap: new Map() };
      rootMap.set(domain, domainEntry);
    }

    // 2. 获取或创建章节子节点
    let chapterNode = domainEntry.chapterMap.get(chapter);
    if (!chapterNode) {
      const chIdx = domainEntry.node.children.length + 1;
      chapterNode = {
        id: `${domainEntry.node.id}-c${chIdx}`,
        title: chapter,
        kpPrefix: `${domain}/${chapter}`,
        children: [],
      };
      domainEntry.chapterMap.set(chapter, chapterNode);
      domainEntry.node.children.push(chapterNode);
    }

    // 3. 追加知识点叶子节点
    const leafIdx = chapterNode.children.length + 1;
    const leafNode: SyllabusNode = {
      id: `${chapterNode.id}-k${leafIdx}`,
      title: name,
      kpPrefix: `${domain}/${chapter}/${name}`,
      children: [],
    };
    chapterNode.children.push(leafNode);
  }

  return Array.from(rootMap.values()).map((e) => e.node);
}

/**
 * 构建知识点 ID 到小驴考试标准化考点路径 (kp) 的映射字典
 * 格式示例: "数与代数/七上 第一章 有理数/正数和负数"
 */
export function buildTaxonomyKpMap(topics: readonly TaxonomyTopic[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const t of topics) {
    const parts = [
      (t.domain || "综合").trim(),
      (t.chapter || "").trim(),
      (t.name || t.id).trim(),
    ].filter(Boolean);
    map.set(t.id, parts.join("/"));
  }
  return map;
}

/**
 * 将外部先修依赖数组转换为小驴考试先修关系集合 (KpRelation[])
 */
export function convertTaxonomyDependencies(
  dependencies: readonly TaxonomyDependency[],
  topicKpMap: ReadonlyMap<string, string>,
  options: { hardOnly?: boolean; nowMs?: number } = {},
): KpRelation[] {
  if (!dependencies || !dependencies.length) return [];

  const relations: KpRelation[] = [];
  const seen = new Set<string>();
  const createdAt = options.nowMs ?? Date.now();

  for (const dep of dependencies) {
    if (options.hardOnly && dep.strength === "soft") {
      continue;
    }

    const fromKp = topicKpMap.get(dep.topicId);
    const toPrereqKp = topicKpMap.get(dep.prerequisiteId);

    if (!fromKp || !toPrereqKp || fromKp === toPrereqKp) {
      continue;
    }

    const key = `${fromKp}-->${toPrereqKp}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);

    relations.push({
      from: fromKp,
      to: toPrereqKp,
      kind: "prereq",
      source: "syllabus",
      confirmed: true,
      createdAt,
    });
  }

  return relations;
}

/**
 * 将外部学科题库题目数组转换为小驴考试标准题目集合 (Question[])
 */
export function convertTaxonomyQuestions(
  rawQuestions: readonly TaxonomyQuestionItem[],
  topicKpMap: ReadonlyMap<string, string>,
  options: { source?: string; defaultScore?: number } = {},
): Question[] {
  if (!rawQuestions || !rawQuestions.length) return [];

  const questions: Question[] = [];

  for (const raw of rawQuestions) {
    const stem = (raw.stem || raw.question || "").trim();
    if (!stem) continue;

    const topicId = raw.topic_id || raw.topicId || "";
    const kp = (topicId ? topicKpMap.get(topicId) : "") || "通识/基础";

    let optionsList: string[] = [];
    let qType: QuestionType;
    let answerStr = String(raw.answer ?? "").trim();

    if (Array.isArray(raw.options) && raw.options.length > 0) {
      optionsList = raw.options.map((opt) => String(opt).trim());
      qType = "single";
      // 若答案是数字索引（0, 1, 2, 3），转换为大写字母 A, B, C, D
      if (/^\d+$/.test(answerStr)) {
        const idx = parseInt(answerStr, 10);
        if (idx >= 0 && idx < 26) {
          answerStr = String.fromCharCode(65 + idx);
        }
      }
    } else if (raw.type === "choice" || raw.type === "single") {
      qType = "single";
    } else if (raw.type === "judge") {
      qType = "judge";
    } else if (raw.type === "short") {
      qType = "short";
    } else {
      qType = "fill";
    }

    let diffLevel = 3;
    if (typeof raw.difficulty === "number") {
      diffLevel = Math.max(1, Math.min(5, Math.round(raw.difficulty)));
    } else if (raw.difficulty === "basic") {
      diffLevel = 2;
    } else if (raw.difficulty === "standard") {
      diffLevel = 3;
    } else if (raw.difficulty === "advanced") {
      diffLevel = 4;
    }

    const q: Question = {
      id: raw.id || newQuestionId(),
      type: qType,
      stem,
      options: optionsList,
      answer: answerStr,
      analysis: raw.analysis || "",
      kp,
      difficulty: diffLevel,
      score: options.defaultScore ?? (qType === "single" ? 2 : qType === "short" ? 10 : 3),
      source: options.source || "中国学科知识图谱精选",
      status: "published",
      origin: "imported",
      hash: questionHash(stem, optionsList),
    };

    questions.push(q);
  }

  return questions;
}
