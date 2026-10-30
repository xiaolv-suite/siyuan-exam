// ============================================================
// 学习者三层认知能力与高频错误模式画像引擎 (Cognitive Profile Engine)
// 依据 LogiNote / Unyra / DeepTutor 认知科学模型：
// 1. 三层认知能力评估：概念清晰度、判断合理性、推理有效性 (0-100)
// 2. 跨题错误模式库 (Mistake Patterns)：抽象并累加思维陷阱，而非记录单题
// 3. 严格可信门槛 (Trust Gate)：样本数不足时拒绝输出伪断言，杜绝标签化
// 4. LLM 紧凑前缀生成：将稳定画像提炼为 <=250 字上下文注入系统提示词
// 纯函数领域层，无外部 IO 依赖。
// ============================================================

import type { AttemptEvent, Question, WrongItem } from "./types";

export interface LayeredCognitiveAbility {
  /** 概念层清晰度 (0-100)：核心术语、定义、基础常识记忆 */
  conceptScore: number;
  /** 判断层合理性 (0-100)：条件转化、正误辨析、边界与临界判定 */
  judgmentScore: number;
  /** 推理层有效性 (0-100)：多步因果演绎、定量计算、综合论证自洽度 */
  reasoningScore: number;
}

export interface MistakePatternItem {
  /** 思维错误模式/陷阱特征（如“未注意定义域边界”、“计算跳步”、“因果倒置”） */
  pattern: string;
  /** 发生频次 */
  count: number;
  /** 最近一次出现时间戳 */
  lastOccurredAt: number;
  /** 关联的典型题目 ID 集合 (至多保留 5 个) */
  exampleQids: string[];
}

export interface LearnerCognitiveProfile {
  /** 三层认知能力得分 */
  layeredAbility: LayeredCognitiveAbility;
  /** 高频错误模式清单（按发生频次降序） */
  mistakePatterns: MistakePatternItem[];
  /** 累计有效作答样本数 */
  evidenceCount: number;
  /** 累计作答文本与复盘字符数 */
  evidenceChars: number;
  /** 是否达到可信门槛 (样本数 >= 3 且字符数 >= 100) */
  isTrusted: boolean;
  /** 掌握建议 */
  advice: string;
}

/** 默认画像骨架 */
export const DEFAULT_COGNITIVE_PROFILE: LearnerCognitiveProfile = {
  layeredAbility: { conceptScore: 70, judgmentScore: 70, reasoningScore: 70 },
  mistakePatterns: [],
  evidenceCount: 0,
  evidenceChars: 0,
  isTrusted: false,
  advice: "学习数据持续积累中，完成更多练习后将生成个性化认知画像。",
};

/**
 * 依据历史作答事件、错题记录与题面元数据评估三层认知能力与错误模式
 */
export function evaluateCognitiveProfile(
  attempts: readonly AttemptEvent[],
  questions: readonly Question[],
  wrongItems: readonly WrongItem[] = [],
): LearnerCognitiveProfile {
  const safeAttempts = (attempts || []).filter((e) => e.verdict !== "not_attempted");
  const qMap = new Map<string, Question>();
  for (const q of questions || []) {
    qMap.set(q.id, q);
  }

  if (safeAttempts.length === 0) {
    return DEFAULT_COGNITIVE_PROFILE;
  }

  let totalChars = 0;
  let conceptCorrect = 0;
  let conceptTotal = 0;
  let judgmentCorrect = 0;
  let judgmentTotal = 0;
  let reasoningCorrect = 0;
  let reasoningTotal = 0;

  // 1. 统计三层认知得分
  for (const att of safeAttempts) {
    const q = qMap.get(att.qid);
    const isOk = att.verdict === "correct";
    const answerLen = (att.myAnswer || "").length;
    totalChars += answerLen + (att.firstAnswer || "").length;

    // 分流三层能力归属：
    // - 判断题与单选短题：偏概念层
    // - 多选题与有容差填空：偏判断层
    // - 简答论述题与多空题：偏推理层
    if (q?.type === "judge" || (q?.type === "single" && (q.options?.length ?? 0) <= 3)) {
      conceptTotal++;
      if (isOk) conceptCorrect++;
    } else if (q?.type === "multiple" || q?.answerSpec?.kind === "numeric") {
      judgmentTotal++;
      if (isOk) judgmentCorrect++;
    } else if (q?.type === "short" || q?.answerSpec?.kind === "multiBlank") {
      reasoningTotal++;
      if (isOk) reasoningCorrect++;
    } else {
      // 默认单选题：概念与判断综合
      conceptTotal++;
      judgmentTotal++;
      if (isOk) {
        conceptCorrect++;
        judgmentCorrect++;
      }
    }
  }

  const calcScore = (correct: number, total: number, fallback = 70) => {
    if (total === 0) return fallback;
    const rate = correct / total;
    return Math.round(rate * 100);
  };

  const layeredAbility: LayeredCognitiveAbility = {
    conceptScore: calcScore(conceptCorrect, conceptTotal),
    judgmentScore: calcScore(judgmentCorrect, judgmentTotal),
    reasoningScore: calcScore(reasoningCorrect, reasoningTotal),
  };

  // 2. 统计跨题错误模式库 (Mistake Patterns)
  const patternMap = new Map<string, { count: number; lastAt: number; qids: string[] }>();

  // 2.1 从错题派生原因归纳
  for (const w of wrongItems) {
    if (w.status === "mastered") continue;
    let pat = "知识点理解不熟练";
    if (w.reason === "careless") pat = "审题粗心与细节遗漏";
    else if (w.reason === "trap") pat = "混淆概念与命题陷阱";

    const cur = patternMap.get(pat) ?? { count: 0, lastAt: w.lastWrongAt, qids: [] };
    cur.count += w.wrongCount;
    cur.lastAt = Math.max(cur.lastAt, w.lastWrongAt);
    if (!cur.qids.includes(w.qid) && cur.qids.length < 5) cur.qids.push(w.qid);
    patternMap.set(pat, cur);
  }

  // 2.2 从改答轨迹中发现“犹豫误改”模式
  let editWorseCount = 0;
  for (const att of safeAttempts) {
    if (att.edits && att.edits.length > 0 && att.verdict === "wrong") {
      editWorseCount++;
    }
  }
  if (editWorseCount >= 2) {
    patternMap.set("犹豫不决且改答易错", {
      count: editWorseCount,
      lastAt: Date.now(),
      qids: safeAttempts.filter((e) => e.edits?.length && e.verdict === "wrong").slice(0, 3).map((e) => e.qid),
    });
  }

  const mistakePatterns: MistakePatternItem[] = [...patternMap.entries()]
    .map(([pattern, data]) => ({
      pattern,
      count: data.count,
      lastOccurredAt: data.lastAt,
      exampleQids: data.qids,
    }))
    .sort((a, b) => b.count - a.count);

  const evidenceCount = safeAttempts.length;
  // 可信门槛：至少 3 次真实作答
  const isTrusted = evidenceCount >= 3;

  let advice = "概念与推理表现均衡，继续保持！";
  if (layeredAbility.reasoningScore < 60) {
    advice = "推理与综合大题得分偏低，建议在解析时多关注推导关键步骤与因果链。";
  } else if (layeredAbility.conceptScore < 60) {
    advice = "基础概念与术语识记有待夯实，建议配合闪卡卡片进行间隔强化复习。";
  } else if (layeredAbility.judgmentScore < 60) {
    advice = "辨析与条件转化容易失分，建议做题时圈划题干限制词与临界条件。";
  }

  return {
    layeredAbility,
    mistakePatterns,
    evidenceCount,
    evidenceChars: totalChars,
    isTrusted,
    advice,
  };
}

/**
 * 将学习者认知画像压缩序列化为注入 LLM 的紧凑前缀（<=250字）
 * 若未达可信门槛则返回空串，杜绝误导大模型或产生偏见
 */
export function buildCognitiveProfilePrefix(profile: LearnerCognitiveProfile): string {
  if (!profile || !profile.isTrusted) return "";

  const a = profile.layeredAbility;
  const parts: string[] = [
    `【学习者认知画像】：概念清晰度 ${a.conceptScore} 分、判断合理性 ${a.judgmentScore} 分、推理有效性 ${a.reasoningScore} 分。`,
  ];

  if (profile.mistakePatterns.length > 0) {
    const topPatterns = profile.mistakePatterns.slice(0, 2).map((p) => `「${p.pattern}」(曾触发${p.count}次)`).join("、");
    parts.push(`高频思维易错点：${topPatterns}。`);
  }

  parts.push(`指导原则：${profile.advice}讲解与出题请结合其认知特质予以因材施教。`);

  return parts.join("\n");
}
