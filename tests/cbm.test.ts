import { describe, it, expect } from "vitest";
import type { AttemptEvent } from "../src/core/types";
import { cbmScan, cbmSettleSummary } from "../src/core/cbm";

/** 构造一条带确定度自评的判分作答事件 */
function ev(overrides: Partial<AttemptEvent> & { qid: string; eid?: string }): AttemptEvent {
  return {
    v: 1,
    eid: overrides.eid ?? `e-${overrides.qid}-${Math.random().toString(36).slice(2, 8)}`,
    ts: 1_700_000_000_000,
    kind: "practice",
    mode: "single",
    verdict: "correct",
    myAnswer: "B",
    sessionId: "s-1",
    queue: "normal",
    device: "d-1",
    seq: 1,
    ...overrides,
  } as AttemptEvent;
}

describe("Moodle CBM 确定度基准分类 (cbmScan)", () => {
  it("guess/fuzzy 答对 → fragile（脆弱伪掌握/蒙对）；sure 答错 → highrisk（高危盲区）", () => {
    const { fragile, highrisk } = cbmScan([
      ev({ qid: "q-lucky", verdict: "correct", confidence: "guess" }),
      ev({ qid: "q-fuzzy", verdict: "correct", confidence: "fuzzy" }),
      ev({ qid: "q-blind", verdict: "wrong", confidence: "sure", myAnswer: "A" }),
    ]);
    expect(fragile.map((s) => s.qid).sort()).toEqual(["q-fuzzy", "q-lucky"]);
    expect(highrisk).toHaveLength(1);
    expect(highrisk[0].qid).toBe("q-blind");
    expect(highrisk[0].myAnswer).toBe("A");
    expect(highrisk[0].category).toBe("highrisk");
  });

  it("sure 答对 / guess 答错 / 无自评事件均不产生信号", () => {
    const { fragile, highrisk } = cbmScan([
      ev({ qid: "q-solid", verdict: "correct", confidence: "sure" }),
      ev({ qid: "q-honest-wrong", verdict: "wrong", confidence: "guess" }),
      ev({ qid: "q-noself", verdict: "correct" }),
      ev({ qid: "q-noself-wrong", verdict: "wrong" }),
    ]);
    expect(fragile).toHaveLength(0);
    expect(highrisk).toHaveLength(0);
  });

  it("同 qid 以最近一次带自评作答为准（先蒙对后确定答对 → 出清 fragile）", () => {
    const { fragile, highrisk } = cbmScan([
      ev({ eid: "e-old", qid: "q-x", verdict: "correct", confidence: "guess", ts: 1_000 }),
      ev({ eid: "e-new", qid: "q-x", verdict: "correct", confidence: "sure", ts: 2_000 }),
    ]);
    expect(fragile).toHaveLength(0);
    expect(highrisk).toHaveLength(0);
  });

  it("同 qid 反转：先自信答错后蒙对 → 高危出清、落入 fragile（最新态口径）", () => {
    const { fragile, highrisk } = cbmScan([
      ev({ eid: "e-old", qid: "q-y", verdict: "wrong", confidence: "sure", ts: 1_000 }),
      ev({ eid: "e-new", qid: "q-y", verdict: "correct", confidence: "fuzzy", ts: 2_000 }),
    ]);
    expect(highrisk).toHaveLength(0);
    expect(fragile).toHaveLength(1);
    expect(fragile[0].confidence).toBe("fuzzy");
  });

  it("同 ts 时按 seq 决定最新（乱序输入确定性）", () => {
    const { fragile } = cbmScan([
      ev({ eid: "e-late-seq", qid: "q-z", verdict: "correct", confidence: "sure", ts: 5_000, seq: 9 }),
      ev({ eid: "e-early-seq", qid: "q-z", verdict: "correct", confidence: "guess", ts: 5_000, seq: 2 }),
    ]);
    expect(fragile).toHaveLength(0); // seq 9 的 sure 胜出
  });

  it("挑战码（challenge 模式）作答不入 CBM；recite 自评事件不入", () => {
    const { fragile, highrisk } = cbmScan([
      ev({ qid: "q-c1", verdict: "correct", confidence: "guess", mode: "challenge" }),
      ev({ qid: "q-c2", verdict: "wrong", confidence: "sure", mode: "challenge" }),
      ev({ qid: "q-c3", kind: "recite", verdict: "correct", confidence: "guess" } as any),
    ]);
    expect(fragile).toHaveLength(0);
    expect(highrisk).toHaveLength(0);
  });

  it("not_attempted 与 mock 类型正常参与口径（mock 在列）", () => {
    const { highrisk } = cbmScan([
      ev({ qid: "q-m", kind: "mock", verdict: "wrong", confidence: "sure" }),
      ev({ qid: "q-na", kind: "practice", verdict: "not_attempted", confidence: "sure" } as any),
    ]);
    expect(highrisk.map((s) => s.qid)).toEqual(["q-m"]);
  });

  it("列表按时间倒序（最近优先）", () => {
    const { fragile } = cbmScan([
      ev({ qid: "q-1", verdict: "correct", confidence: "guess", ts: 1_000 }),
      ev({ qid: "q-2", verdict: "correct", confidence: "guess", ts: 3_000 }),
      ev({ qid: "q-3", verdict: "correct", confidence: "fuzzy", ts: 2_000 }),
    ]);
    expect(fragile.map((s) => s.qid)).toEqual(["q-2", "q-3", "q-1"]);
  });

  it("cbmSettleSummary 只保留本次会话作答过的题", () => {
    const scan = cbmScan([
      ev({ qid: "q-in", verdict: "correct", confidence: "guess" }),
      ev({ qid: "q-out", verdict: "correct", confidence: "guess" }),
    ]);
    const settled = cbmSettleSummary(scan, new Set(["q-in"]));
    expect(settled.fragile.map((s) => s.qid)).toEqual(["q-in"]);
    expect(settled.highrisk).toHaveLength(0);
  });
});
