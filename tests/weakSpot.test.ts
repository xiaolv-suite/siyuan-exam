import { describe, it, expect } from "vitest";
import type { Question } from "../src/core/types";
import { kpRoot, kpMatchesRoot, rankWeakTags, sampleWeakSpotDrill } from "../src/core/weakSpot";

function q(id: string, kp?: string): Question {
  return {
    id,
    type: "single",
    stem: `题干 ${id}`,
    options: ["A", "B", "C", "D"],
    answer: "A",
    kp,
    origin: "manual",
    score: 1,
    hash: `h-${id}`,
  } as Question;
}

describe("薄弱标签诊断与智能抽样特训 (weakSpot, benchmark-fusion)", () => {
  it("kpRoot 取首层考点；空值安全", () => {
    expect(kpRoot("资料分析/比重计算")).toBe("资料分析");
    expect(kpRoot("循环系统")).toBe("循环系统");
    expect(kpRoot("  ")).toBe("");
    expect(kpRoot(undefined)).toBe("");
  });

  it("kpMatchesRoot 层级前缀匹配", () => {
    expect(kpMatchesRoot("循环系统/心脏", "循环系统")).toBe(true);
    expect(kpMatchesRoot("循环系统", "循环系统")).toBe(true);
    expect(kpMatchesRoot("循环系统学", "循环系统")).toBe(false);
    expect(kpMatchesRoot(undefined, "循环系统")).toBe(false);
  });

  it("rankWeakTags 聚合根考点、只收正确率低于阈值的标签、最弱优先", () => {
    const stats = [
      { kp: "几何/三角形", total: 10, correct: 2, wrong: 8 },   // 20%
      { kp: "几何/圆", total: 10, correct: 5, wrong: 5 },       // 50% → 同根聚合 35%
      { kp: "代数/方程", total: 10, correct: 9, wrong: 1 },     // 90% 不入榜
      { kp: "概率", total: 4, correct: 2, wrong: 2 },           // 50% 入榜
    ];
    const rank = rankWeakTags(stats);
    expect(rank.map((r) => r.root)).toEqual(["几何", "概率"]);
    expect(rank[0]).toMatchObject({ root: "几何", total: 20, correct: 7 });
    expect(rank[0].accuracy).toBeCloseTo(0.35);
  });

  it("rankWeakTags 自定义阈值与同率按题量排序", () => {
    const stats = [
      { kp: "A", total: 10, correct: 8, wrong: 2 }, // 80%
      { kp: "B", total: 5, correct: 4, wrong: 1 },  // 80%
    ];
    const rank = rankWeakTags(stats, 0.9);
    expect(rank.map((r) => r.root)).toEqual(["A", "B"]); // 同率时题量多（证据更充分）者靠前
  });

  it("sampleWeakSpotDrill 三层抽样：历史错题优先 → 未做新题 → 已做对兜底", () => {
    const bank = [
      q("w1", "循环/心脏"), q("w2", "循环/心脏"),          // 历史错题
      q("n1", "循环/血管"), q("n2", "循环/血管"),          // 未做新题
      q("s1", "循环/肺"),                                  // 已做对兜底
      q("x1", "代数"),                                     // 非薄弱标签，绝不入卷
    ];
    const picked = sampleWeakSpotDrill({
      bank,
      weakRoots: ["循环"],
      wrongQids: new Set(["w1", "w2"]),
      attemptedQids: new Set(["s1", "x1"]),
      count: 10,
      rng: () => 0.5, // 洗牌确定化；断言只看层级相对次序，不看层内洗牌细节
    });
    const idx = (id: string) => picked.findIndex((p) => p.id === id);
    const wrongMax = Math.max(idx("w1"), idx("w2"));
    const unseenMin = Math.min(idx("n1"), idx("n2"));
    const unseenMax = Math.max(idx("n1"), idx("n2"));
    // 层级优先级：错题层整体先于未做层，未做层整体先于兜底层
    expect(wrongMax).toBeLessThan(unseenMin);
    expect(unseenMax).toBeLessThan(idx("s1"));
    // 非薄弱标签绝不入卷
    expect(picked.some((p) => p.id === "x1")).toBe(false);
    expect(picked).toHaveLength(5);
  });

  it("count 截断优先保留错题层，去重幂等", () => {
    const bank = [q("w1", "K"), q("w2", "K"), q("n1", "K"), q("s1", "K")];
    const picked = sampleWeakSpotDrill({
      bank,
      weakRoots: ["K"],
      wrongQids: new Set(["w1", "w2"]),
      attemptedQids: new Set(["s1"]),
      count: 2,
      rng: () => 0.5,
    });
    expect(picked).toHaveLength(2);
    expect(new Set(picked.map((p) => p.id)).has("w1")).toBe(true);
    expect(new Set(picked.map((p) => p.id)).has("w2")).toBe(true);
  });

  it("无薄弱标签或题库为空返回空卷", () => {
    expect(sampleWeakSpotDrill({ bank: [q("a", "K")], weakRoots: [] })).toEqual([]);
    expect(sampleWeakSpotDrill({ bank: [], weakRoots: ["K"] })).toEqual([]);
  });

  it("rng 确定性：同种子同结果", () => {
    const bank = Array.from({ length: 12 }, (_, i) => q(`t${i}`, "K"));
    const mulberry = (seed: number) => () => {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const a = sampleWeakSpotDrill({ bank, weakRoots: ["K"], count: 5, rng: mulberry(42) });
    const b = sampleWeakSpotDrill({ bank, weakRoots: ["K"], count: 5, rng: mulberry(42) });
    expect(a.map((p) => p.id)).toEqual(b.map((p) => p.id));
    expect(a).toHaveLength(5);
  });
});
