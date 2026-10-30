/**
 * 艾宾浩斯记忆遗忘衰退评估与考点急救引擎 (Ebbinghaus Forgetting Risk Evaluator)
 * 职责：
 * 1. 依据艾宾浩斯记忆遗忘曲线（1天、2天、4天、7天、15天衰退周期）计算考点记忆保持率；
 * 2. 结合各考点历史答对率与最近作答距今天数，三级量化遗忘风险（critical 高危临界 / warning 需巩固 / fresh 良好）；
 * 3. 产出今日最急需抢救的薄弱考点与候选题目集合；
 * 4. 纯函数领域层，支持导出记忆衰退诊断报告（Markdown）。
 */

import type { Question, AttemptEvent } from "./types";

export type ForgettingRiskTier = "critical" | "warning" | "fresh";

export interface KpRetentionItem {
  kp: string;
  totalQuestions: number;
  practicedCount: number;
  lastAttemptAt: number | null;
  daysSinceLast: number; // 距今天数
  estimatedRetentionPct: number; // 预估保持率 (0 - 100)
  riskTier: ForgettingRiskTier;
  candidateQids: string[];
  advice: string;
}

export interface ForgettingRiskReport {
  evaluatedKpCount: number;
  criticalCount: number;
  warningCount: number;
  freshCount: number;
  urgentRescueKps: KpRetentionItem[]; // 紧急度最高的前 5 个考点
  overallRetentionAverage: number;
  summary: string;
  items: KpRetentionItem[];
}

/**
 * 现代记忆动力学 DSR 状态模型 (Difficulty, Stability, Retrievability)
 * 遵循 FSRS 规范与认知记忆科学，用于精准评估单题/单考点的遗忘速度与最佳复习点。
 */
export interface DsrState {
  /** 认知难度 (1-10，初始 5.0) */
  difficulty: number;
  /** 记忆稳定性/半衰期 (天数，初始 2.0，最低 0.2，最高 365) */
  stability: number;
  /** 当前瞬时可提取度 (0-1) */
  retrievability: number;
  /** 上次作答复习时间戳 (ms) */
  lastReviewedAt: number | null;
  /** 累计复习次数 */
  reviewCount: number;
  /** 连续答对次数 */
  consecutiveCorrect: number;
  /** 连续答错次数 */
  consecutiveWrong: number;
}

export const DEFAULT_DSR_STATE: DsrState = {
  difficulty: 5.0,
  stability: 2.0,
  retrievability: 1.0,
  lastReviewedAt: null,
  reviewCount: 0,
  consecutiveCorrect: 0,
  consecutiveWrong: 0,
};

/** 计算当前可提取度 R ∈ (0, 1] */
export function calculateRetrievability(stability: number, elapsedDays: number): number {
  const safeStability = Math.max(0.2, stability);
  const safeDays = Math.max(0, elapsedDays);
  return Math.exp(-safeDays / safeStability);
}

/** 基于目标保留率反推最佳复习间隔天数（FSRS 规范：R(I) = desiredRetention） */
export function optimalReviewInterval(stability: number, desiredRetention = 0.90): number {
  const r = Math.min(0.99, Math.max(0.70, desiredRetention));
  const s = Math.max(0.2, stability);
  // R = exp(-t/S) => t = -S * ln(R)
  const interval = -s * Math.log(r);
  return Math.max(1, Math.round(interval));
}

/** 状态转移：根据作答结果、自评打分与受助标记更新 DSR 状态 */
export function updateDsrState(
  prev: DsrState,
  verdict: "correct" | "wrong",
  options?: {
    selfRating?: number; // 1: Again, 2: Hard, 3: Good, 4: Easy
    helped?: boolean; // 是否受助作答 (提示/苏格拉底)
    elapsedDays?: number;
  },
): DsrState {
  const elapsedDays = options?.elapsedDays ?? (prev.lastReviewedAt ? Math.max(0, (Date.now() - prev.lastReviewedAt) / 86_400_000) : 0);
  const currentR = calculateRetrievability(prev.stability, elapsedDays);
  const isCorrect = verdict === "correct";
  const reviewCount = prev.reviewCount + 1;
  const rating = options?.selfRating ?? (isCorrect ? 3 : 1);

  // 1. 难度 D 更新 (1~10)
  const ratingDelta = rating === 1 ? 0.4 : rating === 2 ? 0.15 : rating === 3 ? -0.1 : -0.3;
  const newD = Math.min(10, Math.max(1, prev.difficulty + ratingDelta));

  // 2. 稳定性 S 更新
  let newS: number;
  if (isCorrect) {
    const difficultyFactor = (11 - newD) / 6; // D=5时为1.0
    const recallBonus = 1 + 1.2 * (1 - currentR) * difficultyFactor;
    let gain = Math.max(1.1, recallBonus);

    // 受助作答降权（Perseus / LogiNote 准则：看了解析或线索才做对，增益打折）
    if (options?.helped) {
      gain = 1 + (gain - 1) * 0.4; // 增益缩减 60%
    }

    if (rating === 4) gain *= 1.3;
    if (rating === 2) gain *= 0.85;

    newS = Math.min(365, prev.stability * gain);
  } else {
    // 答错（遗忘）：稳定性大幅回落
    newS = Math.max(0.4, Math.min(prev.stability * 0.3, 1.5));
  }

  return {
    difficulty: Math.round(newD * 10) / 10,
    stability: Math.round(newS * 10) / 10,
    retrievability: 1.0,
    lastReviewedAt: Date.now(),
    reviewCount,
    consecutiveCorrect: isCorrect ? prev.consecutiveCorrect + 1 : 0,
    consecutiveWrong: isCorrect ? 0 : prev.consecutiveWrong + 1,
  };
}

/** 艾宾浩斯标准保留率经验公式：R(t) = exp(-t / S) * 100 */
export function computeEbbinghausRetention(days: number, stabilityFactor = 5): number {
  if (days <= 0) return 100;
  // 简化的衰减模型：t=1天约60%，t=3天约45%，t=7天约28%，t=14天约18%
  const retention = Math.exp(-days / stabilityFactor) * 100;
  return Math.max(10, Math.min(100, Math.round(retention)));
}

/**
 * 评估各考点的遗忘风险与抢救优先级
 */
export function auditForgettingRisks(
  questions: readonly Question[],
  attempts: readonly AttemptEvent[],
  nowMs: number = Date.now(),
): ForgettingRiskReport {
  // 1. 按考点归集题目
  const kpQuestionsMap = new Map<string, Question[]>();
  for (const q of questions) {
    if (q.type === "material") continue;
    const kp = (q.kp || "未分类考点").trim();
    const list = kpQuestionsMap.get(kp) ?? [];
    list.push(q);
    kpQuestionsMap.set(kp, list);
  }

  // 2. 建立各题目的最新作答时间与战绩
  const qLastAttemptMap = new Map<string, { lastAt: number; isCorrect: boolean }>();
  for (const e of attempts) {
    if (e.verdict === "not_attempted") continue;
    const prev = qLastAttemptMap.get(e.qid);
    if (!prev || e.ts > prev.lastAt) {
      qLastAttemptMap.set(e.qid, {
        lastAt: e.ts,
        isCorrect: e.verdict === "correct",
      });
    }
  }

  const items: KpRetentionItem[] = [];
  let criticalCount = 0;
  let warningCount = 0;
  let freshCount = 0;
  let totalRetentionSum = 0;

  for (const [kp, qs] of kpQuestionsMap) {
    // 寻找该考点中被练过题目的最新作答时间
    let lastKpAttemptAt: number | null = null;
    let practicedCount = 0;
    let correctCount = 0;
    const candidateQids: string[] = [];

    for (const q of qs) {
      const att = qLastAttemptMap.get(q.id);
      if (att) {
        practicedCount++;
        if (att.isCorrect) correctCount++;
        if (lastKpAttemptAt === null || att.lastAt > lastKpAttemptAt) {
          lastKpAttemptAt = att.lastAt;
        }
      } else {
        candidateQids.push(q.id);
      }
    }

    // 优先抢救做错过的题目
    for (const q of qs) {
      const att = qLastAttemptMap.get(q.id);
      if (att && !att.isCorrect && !candidateQids.includes(q.id)) {
        candidateQids.unshift(q.id);
      }
    }

    const daysSinceLast = lastKpAttemptAt !== null ? Math.max(0, Math.floor((nowMs - lastKpAttemptAt) / 86_400_000)) : 99;

    // 稳定性因子：若历史正确率高，衰退较慢；正确率低则衰退极快
    const accuracy = practicedCount > 0 ? correctCount / practicedCount : 0.5;
    const stability = accuracy >= 0.8 ? 7 : accuracy >= 0.5 ? 4 : 2;

    const retention = lastKpAttemptAt !== null ? computeEbbinghausRetention(daysSinceLast, stability) : 15;
    totalRetentionSum += retention;

    let riskTier: ForgettingRiskTier = "fresh";
    let advice = "近期复习过，记忆稳固。";

    if (daysSinceLast >= 7 || retention < 35 || (practicedCount === 0 && qs.length > 0)) {
      riskTier = "critical";
      criticalCount++;
      advice = daysSinceLast >= 99
        ? `🚨 从未练习过该考点，建议立即启动第一轮记忆！`
        : `🚨 距上次练习已过去 ${daysSinceLast} 天，记忆留存估值仅 ${retention}%，处于艾宾浩斯临界衰退区！`;
    } else if (daysSinceLast >= 3 || retention < 60) {
      riskTier = "warning";
      warningCount++;
      advice = `⚠️ 记忆开始进入衰减期（距今 ${daysSinceLast} 天），建议安排 5 题快速激活唤醒。`;
    } else {
      freshCount++;
    }

    items.push({
      kp,
      totalQuestions: qs.length,
      practicedCount,
      lastAttemptAt: lastKpAttemptAt,
      daysSinceLast,
      estimatedRetentionPct: retention,
      riskTier,
      candidateQids: candidateQids.length > 0 ? candidateQids : qs.map((q) => q.id),
      advice,
    });
  }

  // 紧急度排序：高危 > 预警 > 新鲜，同等级按留存率升序
  items.sort((a, b) => {
    const tierWeight: Record<ForgettingRiskTier, number> = { critical: 3, warning: 2, fresh: 1 };
    if (tierWeight[b.riskTier] !== tierWeight[a.riskTier]) {
      return tierWeight[b.riskTier] - tierWeight[a.riskTier];
    }
    return a.estimatedRetentionPct - b.estimatedRetentionPct;
  });

  const evaluatedKpCount = items.length;
  const overallRetentionAverage = evaluatedKpCount > 0 ? Math.round(totalRetentionSum / evaluatedKpCount) : 100;

  let summary = "记忆状态良好，大部分考点记忆保持在安全线以上。";
  if (criticalCount >= 3) {
    summary = `🚨 检测到 ${criticalCount} 个考点已进入高危遗忘临界区，建议立即启动艾宾浩斯考点急救！`;
  } else if (warningCount >= 3) {
    summary = `⚠️ 部分考点记忆开始衰退，建议今日集中安排 10-15 分钟温故知新。`;
  }

  return {
    evaluatedKpCount,
    criticalCount,
    warningCount,
    freshCount,
    urgentRescueKps: items.slice(0, 5),
    overallRetentionAverage,
    summary,
    items,
  };
}

/**
 * 导出艾宾浩斯遗忘风险与考点抢救清单 Markdown
 */
export function exportForgettingRiskMarkdown(report: ForgettingRiskReport): string {
  const lines: string[] = [];
  lines.push(`# 🧠 艾宾浩斯记忆衰退与考点遗忘风险预警报告`);
  lines.push(`> 综合记忆留存率：**${report.overallRetentionAverage}%** | 评估考点：**${report.evaluatedKpCount}** 个 | 高危临界考点：**${report.criticalCount}** 个\n`);
  lines.push(`> **复习建议**：${report.summary}\n`);

  lines.push(`## 🚨 优先抢救考点清单`);
  lines.push(`| 考点名称 | 题量覆盖 | 距上次天数 | 记忆留存估值 | 风险状态 | 抢救建议 |`);
  lines.push(`|---|---|---|---|---|---|`);

  for (const it of report.urgentRescueKps) {
    const statusText = it.riskTier === "critical" ? "🔴 高危临界" : it.riskTier === "warning" ? "🟡 需巩固" : "🟢 良好";
    const daysText = it.daysSinceLast >= 99 ? "未练习" : `${it.daysSinceLast} 天前`;
    lines.push(`| ${it.kp} | ${it.practicedCount}/${it.totalQuestions} | ${daysText} | ${it.estimatedRetentionPct}% | ${statusText} | ${it.advice} |`);
  }

  return lines.join("\n");
}
