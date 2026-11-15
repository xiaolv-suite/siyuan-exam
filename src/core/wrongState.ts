// ============================================================
// 39-05 错题状态机与手动处置覆盖层时效契约（Wrongbook State & Overlay Semantics）
// 验收要求（TODO 39-05）：
//   1) 错→对→错→对仍在册，错→对→对才消灭；
//   2) 重复 eid 幂等去重不增计；
//   3) 手动处置（已掌握 mastered / 移除 removed / 暂缓 snoozed / 归档 archived）后再错
//      按约定恢复：只要最近一次答错时间（lastWrongAt）晚于手动处置时刻（at），
//      或错次（wrongCount）增加，覆盖层立即失效，错题自动重回活跃列表；
//   4) 刷新与重算一致（纯函数无 IO）。
//
// 既有缺陷根因：此前 app.ts:1053 仅以 `w.wrongCount > o.wrongCount` 判断覆盖时效。
// 但 replayer:102 在消灭后再错时按「新一轮错次」重置为 1（与 replay.test.ts:57 对齐），
// 导致一旦 o.wrongCount >= 1，`1 > o.wrongCount` 恒为 false，手动处置后再错永远无法
// 恢复在册（与 39-05 验收直接违背）。本模块依据 types.ts:116 契约声明：
// 「lastWrongAt: 最近一次答错时间（手动覆盖层时效判断依据）」，引入双保险判定。
// ============================================================

import type { WrongItem } from "./types";

/** 手动处置覆盖记录（持久化在 aux 键 wrongbook/overlays） */
export interface WrongOverlayRecord {
  status: "mastered" | "removed" | "snoozed" | "archived" | string;
  /** 手动处置发生的时间戳（毫秒） */
  at: number;
  /** 处置当时的错次快照 */
  wrongCount: number;
  /** 暂缓（snoozed）到期时间戳（毫秒） */
  until?: number;
}

export type WrongOverlayMap = ReadonlyMap<string, WrongOverlayRecord>;

/**
 * 判断某道题的手动覆盖是否当前依然有效。
 *
 * 核心失效规则（39-05 核心验收：手动处置后再错按约定恢复）：
 *   1) 处置后再次答错（w.lastWrongAt > o.at，允许时钟容差）→ 覆盖立即失效，重回收录；
 *   2) 错次高于处置快照（w.wrongCount > o.wrongCount）→ 覆盖立即失效；
 *   3) snoozed 到期（now >= o.until）→ 覆盖失效，恢复在册。
 * 纯函数无 IO。
 */
export function isOverlayEffective(
  overlay: WrongOverlayRecord | null | undefined,
  item: Pick<WrongItem, "lastWrongAt" | "wrongCount"> | null | undefined,
  now: number = Date.now(),
  clockToleranceMs = 0,
): boolean {
  if (!overlay) return false;

  // 处置后再错按约定恢复：只要发生过晚于处置时刻的答错，或错次递增，覆盖均告失效
  if (item) {
    if (item.lastWrongAt > overlay.at + clockToleranceMs) return false;
    if (item.wrongCount > overlay.wrongCount) return false;
  }

  // 状态分支
  if (overlay.status === "snoozed") {
    return (overlay.until ?? 0) > now;
  }
  if (overlay.status === "mastered" || overlay.status === "removed" || overlay.status === "archived") {
    return true;
  }
  return false;
}

/**
 * 过滤出真正活跃的错题（排除生效中的 mastered/removed/snoozed/archived 覆盖，
 * 并纳入被 active 覆盖手动恢复在册的消灭题）。
 * 满足 39-05 验收：手动处置后再错的题必然出现在本列表中。
 */
export function filterEffectiveActiveWrongs(
  items: readonly WrongItem[],
  overlays: WrongOverlayMap,
  now: number = Date.now(),
): WrongItem[] {
  const result: WrongItem[] = [];
  for (const w of items) {
    const o = overlays.get(w.qid);
    if (w.status === "active") {
      if (!o || !isOverlayEffective(o, w, now)) {
        result.push(w);
      }
    } else if (w.status === "eliminated" || w.status === "mastered") {
      // 原生已被消灭或掌握：若用户手动执行过"恢复在册"（overlay status 为 active）
      if (o && o.status === "active") {
        result.push({
          ...w,
          status: "active",
        });
      }
    }
  }
  return result;
}

/** 检查某题是否处于手动抑制中（mastered 或 removed，且覆盖依然有效） */
export function isWrongSuppressed(
  overlay: WrongOverlayRecord | null | undefined,
  item: Pick<WrongItem, "lastWrongAt" | "wrongCount"> | null | undefined,
): boolean {
  if (!overlay) return false;
  if (overlay.status !== "mastered" && overlay.status !== "removed") return false;
  return isOverlayEffective(overlay, item);
}

/** 检查某题是否处于暂缓中（snoozed 且未到期、且未再次答错） */
export function isWrongSnoozed(
  overlay: WrongOverlayRecord | null | undefined,
  item: Pick<WrongItem, "lastWrongAt" | "wrongCount"> | null | undefined,
  now: number = Date.now(),
): boolean {
  if (!overlay || overlay.status !== "snoozed") return false;
  return isOverlayEffective(overlay, item, now);
}

/** 检查某题是否处于封存归档中（archived 且未再次答错） */
export function isWrongArchived(
  overlay: WrongOverlayRecord | null | undefined,
  item: Pick<WrongItem, "lastWrongAt" | "wrongCount"> | null | undefined,
): boolean {
  if (!overlay || overlay.status !== "archived") return false;
  return isOverlayEffective(overlay, item);
}

/**
 * 39-05 错题消灭判定纯函数（状态转移）：
 * 错→对→错→对仍在册（streakCorrect=1，未达标）；
 * 错→对→对才消灭（streakCorrect=2 >= threshold）；
 * 中间一旦答错立即归零。
 */
export function nextStreakCorrect(
  prevStreak: number,
  verdict: "correct" | "wrong" | "not_attempted",
): { streak: number; eliminated: boolean; threshold: number } {
  const threshold = 2;
  if (verdict === "wrong") {
    return { streak: 0, eliminated: false, threshold };
  }
  if (verdict === "correct") {
    const next = prevStreak + 1;
    return { streak: next, eliminated: next >= threshold, threshold };
  }
  return { streak: prevStreak, eliminated: prevStreak >= threshold, threshold };
}

export type MistakeUrgencyTier =
  | "critical_spaced"   // 遗忘临界窗口 (1天 / 3天 / 7天左右，急需巩固)
  | "persistent_leech"  // 顽疾重难点 (累计做错 >= 3 次)
  | "recent_wrong"      // 近期新错题 (24小时内)
  | "normal_backlog";   // 常规积压错题

export interface MistakePriorityScoreResult {
  score: number;
  tier: MistakeUrgencyTier;
  urgencyReason: string;
  daysSinceLastWrong: number;
}

export interface MistakePracticeWeights {
  frequencyWeight?: number; // 默认 1.5
  spacingWeight?: number;   // 默认 2.0
  consecutiveDiscount?: number; // 默认 20 (连续对1次轻微降权让路)
}

export interface SelectedMistakeItem {
  item: WrongItem;
  priorityScore: number;
  tier: MistakeUrgencyTier;
  urgencyReason: string;
}

/**
 * 计算错题攻坚优先级权重（结合艾宾浩斯遗忘临界期与错误频次模型）
 */
export function calculateMistakePriorityScore(
  item: WrongItem,
  now: number = Date.now(),
  weights: MistakePracticeWeights = {}
): MistakePriorityScoreResult {
  const freqWeight = weights.frequencyWeight ?? 1.5;
  const spacingWeight = weights.spacingWeight ?? 2.0;
  const consecutiveDiscount = weights.consecutiveDiscount ?? 20;

  const msDiff = Math.max(0, now - (item.lastWrongAt || now));
  const days = msDiff / 86400000;

  const baseScore = 50;
  let tier: MistakeUrgencyTier = "normal_backlog";
  let reason = "常规在册错题";

  // 1. 遗忘临界窗口判定（Ebbinghaus Spaced Intervals: 1天 / 3天 / 7天）
  let spacingScore = 0;
  if (days >= 0.8 && days <= 1.6) {
    spacingScore = 40 * spacingWeight;
    tier = "critical_spaced";
    reason = "遗忘第1临界期 (做错约1天，急需打铁巩固)";
  } else if (days >= 2.5 && days <= 4.0) {
    spacingScore = 30 * spacingWeight;
    tier = "critical_spaced";
    reason = "遗忘第2临界期 (做错约3天，需及时抗遗忘)";
  } else if (days >= 6.0 && days <= 8.5) {
    spacingScore = 25 * spacingWeight;
    tier = "critical_spaced";
    reason = "遗忘第3临界期 (做错约1周，需周期强化)";
  } else if (days < 0.8) {
    tier = "recent_wrong";
    reason = "今日/近期新错题";
  }

  // 2. 顽疾重难点加权 (错次 >= 3)
  const wrongCount = Math.max(1, item.wrongCount || 1);
  const freqScore = Math.min(60, (wrongCount - 1) * 15) * freqWeight;
  if (wrongCount >= 3) {
    tier = "persistent_leech";
    reason = `顽疾重难点 (累计做错 ${wrongCount} 次)`;
  }

  // 3. 连续答对降权保护（如果上次练习已答对1次，稍许降权给其他更急迫的题目让路）
  const streak = item.streakCorrect || 0;
  const discount = streak * consecutiveDiscount;

  const totalScore = Math.max(1, Math.round(baseScore + spacingScore + freqScore - discount));

  return {
    score: totalScore,
    tier,
    urgencyReason: reason,
    daysSinceLastWrong: Math.round(days * 10) / 10,
  };
}

/**
 * 筛选并排序错题攻坚复练批次（支持按考点隔离打散与题量预算截取）
 */
export function selectWeightedMistakesForPractice(
  activeWrongs: readonly WrongItem[],
  batchLimit: number = 15,
  options: {
    now?: number;
    weights?: MistakePracticeWeights;
    targetKps?: readonly string[];
  } = {}
): SelectedMistakeItem[] {
  if (!activeWrongs || activeWrongs.length === 0) return [];
  const now = options.now ?? Date.now();

  // 过滤考点（若指定了 targetKps）
  let candidates = [...activeWrongs];
  if (options.targetKps && options.targetKps.length > 0) {
    const kpSet = new Set(options.targetKps);
    candidates = candidates.filter((item) => !item.kp || kpSet.has(item.kp));
  }

  // 计算每道错题的优先级
  const scoredList = candidates.map((item) => {
    const res = calculateMistakePriorityScore(item, now, options.weights);
    return {
      item,
      priorityScore: res.score,
      tier: res.tier,
      urgencyReason: res.urgencyReason,
    };
  });

  // 按得分降序排列
  scoredList.sort((a, b) => b.priorityScore - a.priorityScore || a.item.qid.localeCompare(b.item.qid));

  // 考点离散化打散（同一个细分考点尽量不连续紧挨）
  const result: SelectedMistakeItem[] = [];
  const pool = [...scoredList];

  while (pool.length > 0 && result.length < batchLimit) {
    const lastKp = result[result.length - 1]?.item.kp;
    let pickedIdx = 0;

    if (lastKp) {
      // 优先找不同考点的最高分题
      const diffKpIdx = pool.findIndex((it) => it.item.kp && it.item.kp !== lastKp);
      if (diffKpIdx >= 0) {
        pickedIdx = diffKpIdx;
      }
    }

    result.push(pool.splice(pickedIdx, 1)[0]);
  }

  return result;
}
