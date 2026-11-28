// ============================================================
// 题库管理中心统计、置顶、排序与筛选服务（bankStatsService.ts）
// - 并发限流 + 短期缓存批量拉取各题库「总题数 / 待复习 / 错题数」
// - 置顶星标、最近使用时间戳、视图/排序偏好的本地持久化
// - 纯函数筛选与排序，支持 20~50+ 题库流畅管理
// ============================================================

import type { BankInfo } from "@/domain/bankService";
import type { AttemptEvent, Question } from "@/core/types";
import { deckNameForBank } from "@/core/memory";
import { calculateRetrievability } from "@/core/forgettingRisk";

export type BankMetricsStatus = "loading" | "ready" | "error";

export interface BankMetrics {
  status: BankMetricsStatus;
  total: number | null;
  due: number | null;
  wrong: number | null;
  updatedAt: number;
}

export type BankCategoryFilter = "all" | "exam" | "higher" | "language" | "teaching" | "general";
export type BankSortMode = "recent" | "count" | "name";
export type BankViewMode = "grid" | "list";

export const PINNED_BANKS_KEY = "lv-exam/pinned-banks";
export const RECENT_BANKS_KEY = "lv-exam/bank-recent-at";
export const BANK_VIEW_MODE_KEY = "lv-exam/bank-view-mode";
export const BANK_SORT_MODE_KEY = "lv-exam/bank-sort-mode";

export function loadPinnedBankIds(readLocal: (k: string) => string | null): string[] {
  try {
    const raw = readLocal(PINNED_BANKS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string" && x.length > 0) : [];
  } catch {
    return [];
  }
}

export function savePinnedBankIds(writeLocal: (k: string, v: string) => void, ids: string[]): void {
  try {
    writeLocal(PINNED_BANKS_KEY, JSON.stringify([...new Set(ids)]));
  } catch {
    /* ignore storage preference errors */
  }
}

export function togglePinnedBankId(
  current: string[],
  bankId: string,
  writeLocal?: (k: string, v: string) => void,
): string[] {
  const exists = current.includes(bankId);
  const next = exists ? current.filter((id) => id !== bankId) : [bankId, ...current];
  if (writeLocal) savePinnedBankIds(writeLocal, next);
  return next;
}

export function loadBankRecentMap(readLocal: (k: string) => string | null): Record<string, number> {
  try {
    const raw = readLocal(RECENT_BANKS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

export function recordBankRecentUse(
  current: Record<string, number>,
  bankId: string,
  at = Date.now(),
  writeLocal?: (k: string, v: string) => void,
): Record<string, number> {
  if (!bankId) return current;
  const next = { ...current, [bankId]: at };
  if (writeLocal) {
    try {
      writeLocal(RECENT_BANKS_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }
  return next;
}

export function loadBankViewMode(readLocal: (k: string) => string | null): BankViewMode {
  const raw = readLocal(BANK_VIEW_MODE_KEY);
  return raw === "list" ? "list" : "grid";
}

export function saveBankViewMode(writeLocal: (k: string, v: string) => void, mode: BankViewMode): void {
  try {
    writeLocal(BANK_VIEW_MODE_KEY, mode);
  } catch {
    /* ignore */
  }
}

export function loadBankSortMode(readLocal: (k: string) => string | null): BankSortMode {
  const raw = readLocal(BANK_SORT_MODE_KEY);
  if (raw === "count" || raw === "name" || raw === "recent") return raw;
  return "recent";
}

export function saveBankSortMode(writeLocal: (k: string, v: string) => void, mode: BankSortMode): void {
  try {
    writeLocal(BANK_SORT_MODE_KEY, mode);
  } catch {
    /* ignore */
  }
}

export function matchesBankCategoryFilter(bank: Pick<BankInfo, "category">, filter: BankCategoryFilter): boolean {
  const cat = bank.category || "general";
  switch (filter) {
    case "all":
      return true;
    case "exam":
      return cat === "exam" || cat === "certificate";
    case "higher":
      return cat === "higher" || cat === "k12";
    case "language":
      return cat === "language";
    case "teaching":
      return cat === "teaching";
    case "general":
      return cat === "general";
  }
}

export function filterAndSortBanks(
  banks: BankInfo[],
  metricsMap: Record<string, BankMetrics | undefined>,
  options: {
    category: BankCategoryFilter;
    keyword: string;
    sortBy: BankSortMode;
    pinnedIds: string[];
    recentMap: Record<string, number>;
    activeBankId?: string;
  },
): BankInfo[] {
  const { category, keyword, sortBy, pinnedIds, recentMap, activeBankId } = options;
  const kw = keyword.trim().toLowerCase();
  const pinnedSet = new Set(pinnedIds);

  const filtered = banks.filter((b) => {
    if (!matchesBankCategoryFilter(b, category)) return false;
    if (kw && !b.name.toLowerCase().includes(kw)) return false;
    return true;
  });

  const recentScore = (b: BankInfo): number => {
    const recorded = recentMap[b.id];
    if (typeof recorded === "number") return recorded;
    return b.createdAt || 0;
  };

  return [...filtered].sort((a, b) => {
    const aPinned = pinnedSet.has(a.id);
    const bPinned = pinnedSet.has(b.id);
    if (aPinned !== bPinned) return aPinned ? -1 : 1;

    if (sortBy === "count") {
      const aTotal = metricsMap[a.id]?.total ?? -1;
      const bTotal = metricsMap[b.id]?.total ?? -1;
      if (bTotal !== aTotal) return bTotal - aTotal;
    } else if (sortBy === "name") {
      return a.name.localeCompare(b.name, "zh-CN");
    }

    const aHasRecent = typeof recentMap[a.id] === "number";
    const bHasRecent = typeof recentMap[b.id] === "number";
    if (aHasRecent !== bHasRecent) return aHasRecent ? -1 : 1;
    if (!aHasRecent && !bHasRecent && activeBankId) {
      if (a.id === activeBankId && b.id !== activeBankId) return -1;
      if (b.id === activeBankId && a.id !== activeBankId) return 1;
    }

    const rDiff = recentScore(b) - recentScore(a);
    if (rDiff !== 0) return rDiff;
    return a.name.localeCompare(b.name, "zh-CN");
  });
}

export function summarizeBankMetrics(
  banks: BankInfo[],
  metricsMap: Record<string, BankMetrics | undefined>,
): {
  bankCount: number;
  totalQuestions: number;
  totalDue: number;
  totalWrong: number;
  countedBanks: number;
  hasUncounted: boolean;
} {
  let totalQuestions = 0;
  let totalDue = 0;
  let totalWrong = 0;
  let countedBanks = 0;
  let hasUncounted = false;

  for (const b of banks) {
    const m = metricsMap[b.id];
    if (m && m.status === "ready" && m.total !== null) {
      countedBanks++;
      totalQuestions += m.total;
      totalDue += m.due ?? 0;
      totalWrong += m.wrong ?? 0;
    } else {
      hasUncounted = true;
    }
  }

  return {
    bankCount: banks.length,
    totalQuestions,
    totalDue,
    totalWrong,
    countedBanks,
    hasUncounted,
  };
}

export function formatBankCategoryTagLabel(category?: string | null): string {
  switch (category) {
    case "exam":
      return "备考";
    case "certificate":
      return "考证";
    case "k12":
      return "基础";
    case "higher":
      return "学术";
    case "language":
      return "语言";
    case "teaching":
      return "教研";
    case "general":
    default:
      return "通识";
  }
}

export interface BankMetricsAppLike {
  kernelOnline?: boolean;
  listQuestions(bankId: string): Promise<(Question & { blockId?: string })[]>;
  wrongItems(): Array<{ qid: string }>;
  attempts: { all(): readonly AttemptEvent[] };
  bridge?: {
    getRiffDecks?(): Promise<Array<{ id: string; name: string }>>;
    getDueCards?(deckId: string): Promise<Array<{ blockID?: string }>>;
  };
}

interface AttemptSummary {
  lastAt: number;
  lastVerdict: string;
  wrongCount: number;
}

function buildAttemptSummaryMap(attempts: readonly AttemptEvent[]): Map<string, AttemptSummary> {
  const map = new Map<string, AttemptSummary>();
  for (const a of attempts) {
    const prev = map.get(a.qid);
    const isWrong = a.verdict === "wrong" || (a.selfRating != null && a.selfRating <= 2);
    if (!prev) {
      map.set(a.qid, {
        lastAt: a.ts,
        lastVerdict: a.verdict,
        wrongCount: isWrong ? 1 : 0,
      });
    } else {
      if (a.ts >= prev.lastAt) {
        prev.lastAt = a.ts;
        prev.lastVerdict = a.verdict;
      }
      if (isWrong) prev.wrongCount += 1;
    }
  }
  return map;
}

function computeLocalDueCount(
  practiceQuestions: Question[],
  activeWrongQids: Set<string>,
  attemptMap: Map<string, AttemptSummary>,
  nowMs: number,
): number {
  let due = 0;
  for (const q of practiceQuestions) {
    if (activeWrongQids.has(q.id)) {
      due++;
      continue;
    }
    const stat = attemptMap.get(q.id);
    if (!stat) continue;
    const elapsedDays = Math.max(0, (nowMs - stat.lastAt) / 86_400_000);
    const stability = stat.lastVerdict === "wrong" ? 1.0 : Math.max(1.5, 5.0 - stat.wrongCount * 0.8);
    if (calculateRetrievability(stability, elapsedDays) < 0.9) {
      due++;
    }
  }
  return due;
}

/**
 * 并发限流 + 缓存批量统计各题库指标（总题数 / 待复习 / 错题数）。
 * 不主动创建 Riff 卡组（仅只读查询已有卡组），避免被动读触发写操作。
 */
export async function fetchBanksMetricsBatch(
  app: BankMetricsAppLike,
  banks: BankInfo[],
  options: {
    activeBankId?: string;
    activeQuestions?: (Question & { blockId?: string })[];
    activeQuestionsLoaded?: boolean;
    existingMetrics?: Record<string, BankMetrics>;
    cacheTtlMs?: number;
    concurrency?: number;
    now?: () => number;
    force?: boolean;
    onProgress?: (snapshot: Record<string, BankMetrics>) => void;
  } = {},
): Promise<Record<string, BankMetrics>> {
  const {
    activeBankId,
    activeQuestions = [],
    activeQuestionsLoaded = false,
    existingMetrics = {},
    cacheTtlMs = 20_000,
    concurrency = 4,
    now = () => Date.now(),
    force = false,
    onProgress,
  } = options;

  const result: Record<string, BankMetrics> = { ...existingMetrics };
  if (!banks.length) return result;

  const nowMs = now();
  const activeWrongQids = new Set(app.wrongItems().map((w) => w.qid));
  const attemptMap = buildAttemptSummaryMap(app.attempts.all());

  // 仅查询一次已存在的 Riff 卡组，避免 N 次冗余调用或意外建卡
  const deckIdByName = new Map<string, string>();
  if (app.kernelOnline && typeof app.bridge?.getRiffDecks === "function") {
    try {
      const decks = await app.bridge.getRiffDecks();
      for (const d of decks) {
        if (d?.name && d?.id) deckIdByName.set(d.name, d.id);
      }
    } catch {
      /* 降级到本地复习估算 */
    }
  }

  const queue: BankInfo[] = [];
  for (const b of banks) {
    if (b.id === activeBankId && activeQuestionsLoaded) {
      const practiceQs = activeQuestions.filter((q) => q.type !== "material");
      const wrong = practiceQs.filter((q) => activeWrongQids.has(q.id)).length;
      const deckId = deckIdByName.get(deckNameForBank(b.name));
      if (!deckId || !practiceQs.length) {
        result[b.id] = {
          status: "ready",
          total: practiceQs.length,
          due: practiceQs.length ? computeLocalDueCount(practiceQs, activeWrongQids, attemptMap, nowMs) : 0,
          wrong,
          updatedAt: nowMs,
        };
        continue;
      }
      // 有 Riff 卡组时仍走异步查询精确到期数
      queue.push(b);
      continue;
    }

    const prev = existingMetrics[b.id];
    if (!force && prev && prev.status === "ready" && nowMs - prev.updatedAt < cacheTtlMs) {
      result[b.id] = prev;
      continue;
    }

    if (!prev || prev.status !== "ready") {
      result[b.id] = {
        status: "loading",
        total: prev?.total ?? null,
        due: prev?.due ?? null,
        wrong: prev?.wrong ?? null,
        updatedAt: prev?.updatedAt ?? 0,
      };
    }
    queue.push(b);
  }

  onProgress?.({ ...result });
  if (!queue.length) return result;

  const workerCount = Math.max(1, Math.min(concurrency, queue.length));
  let cursor = 0;

  const runWorker = async () => {
    while (cursor < queue.length) {
      const idx = cursor++;
      const bank = queue[idx];
      try {
        const qs =
          bank.id === activeBankId && activeQuestionsLoaded
            ? activeQuestions
            : await app.listQuestions(bank.id);
        const practiceQs = qs.filter((q) => q.type !== "material");
        const total = practiceQs.length;
        const wrong = practiceQs.filter((q) => activeWrongQids.has(q.id)).length;

        let due = 0;
        if (total > 0) {
          const deckId = deckIdByName.get(deckNameForBank(bank.name));
          let riffDueResolved = false;
          if (deckId && app.kernelOnline && typeof app.bridge?.getDueCards === "function") {
            try {
              const dueCards = await app.bridge.getDueCards(deckId);
              const dueBlockIds = new Set(
                dueCards.map((c) => String(c?.blockID ?? "")).filter(Boolean),
              );
              const riffDue = practiceQs.filter((q) => q.blockId && dueBlockIds.has(q.blockId)).length;
              const localDue = computeLocalDueCount(practiceQs, activeWrongQids, attemptMap, now());
              due = Math.max(riffDue, localDue);
              riffDueResolved = true;
            } catch {
              /* 回退本地统计 */
            }
          }
          if (!riffDueResolved) {
            due = computeLocalDueCount(practiceQs, activeWrongQids, attemptMap, now());
          }
        }

        result[bank.id] = {
          status: "ready",
          total,
          due,
          wrong,
          updatedAt: now(),
        };
      } catch {
        const prev = existingMetrics[bank.id];
        result[bank.id] = prev && prev.status === "ready"
          ? prev
          : {
              status: "error",
              total: null,
              due: null,
              wrong: null,
              updatedAt: now(),
            };
      }
      onProgress?.({ ...result });
    }
  };

  await Promise.all(Array.from({ length: workerCount }, () => runWorker()));
  return result;
}
