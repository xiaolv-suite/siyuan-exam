// ============================================================
// 错题消除阶梯与出库状态机（Elimination Ladder Engine）
// 核心哲学：告别盲目刷题，将错题划分为三个量化阶梯（待攻克 -> 强化中 -> 已掌握）
// 规则：
//   1. 🔴 待攻克 (Level 1, to_conquer)：近期做错，连对数 streakCorrect == 0；
//   2. 🟡 强化中 (Level 2, strengthening)：在变式或复习训练中独立答对 1 次 (0 < streakCorrect < eliminateThreshold)；
//   3. 🟢 已掌握 (Level 3, mastered)：再次独立答对 (streakCorrect >= eliminateThreshold)，达到消除门槛，自动移出常驻在册池；
//   4. 强化中若再次答错：连对数归零，立即回退至 🔴 待攻克，严守认知闭环，避免虚假自信；
//   5. 受助答对（查看提示/解析/AI指导）保持当前在册阶梯，不增加独立连续答对计数。
// 纯函数领域层，零外部宿主依赖。
// ============================================================

import type { WrongItem } from "./types";
import type { WrongOverlayMap } from "./wrongState";

export type EliminationStage = "to_conquer" | "strengthening" | "mastered";

export interface EliminationStageConfig {
  key: EliminationStage;
  label: string;
  badge: string;
  color: string;
  themeVar: string;
  description: string;
}

export const ELIMINATION_STAGES: Record<EliminationStage, EliminationStageConfig> = {
  to_conquer: {
    key: "to_conquer",
    label: "待攻克",
    badge: "🔴 待攻克",
    color: "#EF4444",
    themeVar: "var(--lv-red, #EF4444)",
    description: "近期做错，尚未建立答对基线，属于核心失分薄弱点，需重点攻坚",
  },
  strengthening: {
    key: "strengthening",
    label: "强化中",
    badge: "🟡 强化中",
    color: "#F59E0B",
    themeVar: "var(--lv-amber, #F59E0B)",
    description: "已在独立复习或变式题中答对 1 次，需再连续答对以彻底出库",
  },
  mastered: {
    key: "mastered",
    label: "已掌握",
    badge: "🟢 已掌握",
    color: "#10B981",
    themeVar: "var(--lv-green, #10B981)",
    description: "已达成连续答对标准或经变式检验，成功出库移出常驻错题池",
  },
};

/**
 * 判定单道错题当前所处的消除阶梯阶段
 */
export function getEliminationStage(
  item: Pick<WrongItem, "status" | "streakCorrect">,
  eliminateThreshold = 2,
  isOverlayMastered = false,
): EliminationStage {
  if (isOverlayMastered) return "mastered";
  if (item.status === "eliminated" || item.status === "mastered") {
    return "mastered";
  }
  const threshold = Math.max(1, eliminateThreshold);
  const streak = item.streakCorrect ?? 0;
  if (streak >= threshold) {
    return "mastered";
  }
  if (streak > 0) {
    return "strengthening";
  }
  return "to_conquer";
}

export interface LadderProgressItem {
  qid: string;
  stage: EliminationStage;
  streakCorrect: number;
  threshold: number;
  progressPct: number;
  remainingToMaster: number;
}

/**
 * 计算单道错题在消除阶梯上的详细进度
 */
export function getLadderProgress(
  item: Pick<WrongItem, "qid" | "status" | "streakCorrect">,
  eliminateThreshold = 2,
  isOverlayMastered = false,
): LadderProgressItem {
  const threshold = Math.max(1, eliminateThreshold);
  const stage = getEliminationStage(item, threshold, isOverlayMastered);
  const streak = isOverlayMastered || stage === "mastered"
    ? threshold
    : Math.min(threshold, Math.max(0, item.streakCorrect ?? 0));

  const progressPct = stage === "mastered"
    ? 100
    : Math.round((streak / threshold) * 100);

  const remainingToMaster = stage === "mastered"
    ? 0
    : Math.max(0, threshold - streak);

  return {
    qid: item.qid,
    stage,
    streakCorrect: streak,
    threshold,
    progressPct,
    remainingToMaster,
  };
}

export interface EliminationLadderSummary {
  total: number;
  toConquerCount: number;
  strengtheningCount: number;
  masteredCount: number;
  /** 纯掌握出库率 (0-100) */
  masteryRate: number;
  /** 加权攻克度: 待攻克 0% + 强化中 50% + 已掌握 100% (0-100) */
  weightedProgress: number;
  byStage: {
    to_conquer: WrongItem[];
    strengthening: WrongItem[];
    mastered: WrongItem[];
  };
}

/**
 * 汇总错题消除阶梯全景分布与出库统计
 */
export function summarizeEliminationLadder(
  items: readonly WrongItem[],
  overlays?: WrongOverlayMap,
  eliminateThreshold = 2,
): EliminationLadderSummary {
  const byStage: Record<EliminationStage, WrongItem[]> = {
    to_conquer: [],
    strengthening: [],
    mastered: [],
  };

  const threshold = Math.max(1, eliminateThreshold);

  for (const item of items) {
    const o = overlays?.get(item.qid);
    const isOverlayMastered = o?.status === "mastered";
    const stage = getEliminationStage(item, threshold, isOverlayMastered);
    byStage[stage].push(item);
  }

  const toConquerCount = byStage.to_conquer.length;
  const strengtheningCount = byStage.strengthening.length;
  const masteredCount = byStage.mastered.length;
  const total = toConquerCount + strengtheningCount + masteredCount;

  const masteryRate = total > 0 ? Math.round((masteredCount / total) * 100) : 0;
  const weightedProgress = total > 0
    ? Math.round(((strengtheningCount * 0.5 + masteredCount * 1.0) / total) * 100)
    : 0;

  return {
    total,
    toConquerCount,
    strengtheningCount,
    masteredCount,
    masteryRate,
    weightedProgress,
    byStage,
  };
}

export interface LadderTransitionResult {
  nextItem: WrongItem;
  previousStage: EliminationStage;
  nextStage: EliminationStage;
  promoted: boolean;
  demoted: boolean;
  unaltered: boolean;
}

/**
 * 模拟或应用一次针对错题的作答（或变式题作答）对阶梯产生的影响
 */
export function transitionLadderAttempt(
  item: WrongItem,
  verdict: "correct" | "wrong",
  isIndependent = true,
  eliminateThreshold = 2,
): LadderTransitionResult {
  const threshold = Math.max(1, eliminateThreshold);
  const previousStage = getEliminationStage(item, threshold);

  if (verdict === "wrong") {
    // 答错：连对数归零，立即回退至待攻克
    const nextItem: WrongItem = {
      ...item,
      wrongCount: item.wrongCount + 1,
      streakCorrect: 0,
      status: "active",
      lastWrongAt: Date.now(),
    };
    const nextStage = getEliminationStage(nextItem, threshold);
    return {
      nextItem,
      previousStage,
      nextStage,
      promoted: false,
      demoted: previousStage !== "to_conquer",
      unaltered: previousStage === "to_conquer",
    };
  }

  // verdict === "correct"
  if (!isIndependent) {
    // 受助答对（查看提示或AI导学）：保持当前状态，不计入独立连续答对
    return {
      nextItem: { ...item },
      previousStage,
      nextStage: previousStage,
      promoted: false,
      demoted: false,
      unaltered: true,
    };
  }

  // 独立答对：连续答对递增
  const nextStreak = (item.streakCorrect ?? 0) + 1;
  const isMastered = nextStreak >= threshold;
  const nextItem: WrongItem = {
    ...item,
    streakCorrect: nextStreak,
    status: isMastered ? "eliminated" : "active",
  };
  const nextStage = getEliminationStage(nextItem, threshold);

  return {
    nextItem,
    previousStage,
    nextStage,
    promoted: previousStage !== nextStage,
    demoted: false,
    unaltered: previousStage === nextStage,
  };
}
