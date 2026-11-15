// ============================================================
// 薄弱标签诊断与智能抽样特训组卷 (Kangaroo 标杆, benchmark-fusion)
// - rankWeakTags: 会话考点分布 → 正确率低于阈值（默认 60%）的考点根标签排行（最弱优先）
// - sampleWeakSpotDrill: 薄弱标签内的三层加权抽样——历史错题优先 → 未做新题补充 → 已做对兜底，
//   确定性 rng 可复现（与 65-05 会话 seed 同思路）。
// 考点根口径：kp 以 "/" 分层（"资料分析/比重计算" 的根 = "资料分析"），与掌握度排行一致。
// 纯函数领域层，无外部 IO 依赖。
// ============================================================

import type { Question } from "./types";

export interface KpStat {
  kp: string;
  total: number;
  correct: number;
  wrong: number;
}

export interface WeakTagEntry {
  root: string;
  total: number;
  correct: number;
  /** 0..1 */
  accuracy: number;
}

/** 考点根段（首层）；空/异常输入返回空串 */
export function kpRoot(kp?: string): string {
  const s = String(kp ?? "").trim();
  if (!s) return "";
  const i = s.indexOf("/");
  return i > 0 ? s.slice(0, i) : s;
}

/** 考点根匹配：完全相等或层级前缀（"循环系统" 匹配 "循环系统/心脏"） */
export function kpMatchesRoot(kp: string | undefined, root: string): boolean {
  const k = String(kp ?? "").trim();
  if (!k || !root) return false;
  return k === root || k.startsWith(root + "/");
}

/**
 * 薄弱标签排行：按根考点聚合对错，正确率 < threshold 的根标签按"最弱优先"排序；
 * 同正确率时题量多者靠前（证据更充分）。全对或高于阈值不入榜。
 */
export function rankWeakTags(stats: readonly KpStat[], threshold = 0.6): WeakTagEntry[] {
  const acc = new Map<string, { total: number; correct: number }>();
  for (const s of stats) {
    const root = kpRoot(s.kp);
    if (!root) continue;
    const b = acc.get(root) ?? { total: 0, correct: 0 };
    b.total += s.total;
    b.correct += s.correct;
    acc.set(root, b);
  }
  const out: WeakTagEntry[] = [];
  for (const [root, b] of acc) {
    if (b.total <= 0) continue;
    const accuracy = b.correct / b.total;
    if (accuracy < threshold) out.push({ root, total: b.total, correct: b.correct, accuracy });
  }
  return out.sort((a, b) => a.accuracy - b.accuracy || b.total - a.total);
}

/**
 * 薄弱项特训抽样：只从薄弱根标签下的题库题中抽，三层优先级：
 *   1) 历史错题（wrongQids 命中）——复仇优先
 *   2) 未做过的新题（attemptedQids 未命中）——补盲
 *   3) 做过且已答对的题——兜底凑数
 * 同层内用 rng 洗牌；去重；总数 cap 到 count。无薄弱标签或题库为空返回 []。
 */
export function sampleWeakSpotDrill(options: {
  bank: readonly Question[];
  weakRoots: readonly string[];
  wrongQids?: ReadonlySet<string>;
  attemptedQids?: ReadonlySet<string>;
  count?: number;
  rng?: () => number;
}): Question[] {
  const { bank, weakRoots, wrongQids, attemptedQids, count = 10, rng = Math.random } = options;
  const roots = new Set(
    weakRoots.map((r) => String(r ?? "").trim()).filter(Boolean),
  );
  if (!roots.size || !bank.length) return [];
  const cap = Math.max(1, Math.floor(count));

  const wrong = wrongQids ?? new Set<string>();
  const attempted = attemptedQids ?? new Set<string>();
  const tierWrong: Question[] = [];
  const tierUnseen: Question[] = [];
  const tierSeen: Question[] = [];
  for (const q of bank) {
    if (!roots.has(kpRoot(q.kp))) continue;
    if (wrong.has(q.id)) tierWrong.push(q);
    else if (!attempted.has(q.id)) tierUnseen.push(q);
    else tierSeen.push(q);
  }

  const shuffled = (arr: Question[]): Question[] => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  const seen = new Set<string>();
  const out: Question[] = [];
  for (const q of [...shuffled(tierWrong), ...shuffled(tierUnseen), ...shuffled(tierSeen)]) {
    if (out.length >= cap) break;
    if (seen.has(q.id)) continue;
    seen.add(q.id);
    out.push(q);
  }
  return out;
}
