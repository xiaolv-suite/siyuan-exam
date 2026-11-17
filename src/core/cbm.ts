// ============================================================
// Moodle CBM 确定度基准分类 (Certainty-Based Marking, benchmark-fusion)
// 痛点：传统刷题只看"做对/做错"，无法区分「胸有成竹做对」与「蒙对（伪掌握）」，
//       也无法区分「粗心看错」与「概念完全颠倒（高危盲区）」。
// 口径（与 44-02 lite 报告下钻一致，流水唯一真相，可随时重算）：
//   - fragile   脆弱伪掌握：自评 模糊/猜测 (fuzzy|guess) 却答对——运气或直觉，需复核真实掌握
//   - highrisk  高危盲区：自评 确定 (sure) 却答错——概念性误区，错题本置顶高亮
// 同 qid 以最近一次带确定度自评的判分作答为准（后写覆盖）；无自评的事件不参与分类。
// 挑战码（友谊赛）作答不入错题本（13 组审计同口径），同样不参与 CBM 分类。
// 纯函数领域层，无外部 IO 依赖。
// ============================================================

import type { AttemptEvent } from "./types";

export type CbmCategory = "fragile" | "highrisk";

export interface CbmSignal {
  qid: string;
  category: CbmCategory;
  confidence: "sure" | "fuzzy" | "guess";
  verdict: "correct" | "wrong";
  myAnswer: string | null;
  ts: number;
}

export interface CbmScanResult {
  highrisk: CbmSignal[];
  fragile: CbmSignal[];
}

/**
 * 扫描作答流水，产出 CBM 双维信号（每 qid 仅保留最近一次有效自评作答）。
 * 分类互斥：一道题只会落入 highrisk / fragile 之一或两者皆不属。
 */
export function cbmScan(events: readonly AttemptEvent[]): CbmScanResult {
  const latest = new Map<string, AttemptEvent>();
  for (const e of events) {
    if (!e || typeof e.qid !== "string" || !e.qid) continue;
    if (e.kind !== "practice" && e.kind !== "mock") continue;
    if (e.mode === "challenge") continue; // 挑战码（友谊赛）不入错题本（13 组审计同口径），同样不入 CBM
    if (e.verdict !== "correct" && e.verdict !== "wrong") continue;
    if (e.confidence !== "sure" && e.confidence !== "fuzzy" && e.confidence !== "guess") continue;
    const prev = latest.get(e.qid);
    if (!prev || e.ts > prev.ts || (e.ts === prev.ts && (e.seq ?? 0) > (prev.seq ?? 0))) {
      latest.set(e.qid, e);
    }
  }

  const highrisk: CbmSignal[] = [];
  const fragile: CbmSignal[] = [];
  for (const e of latest.values()) {
    if (e.verdict === "wrong" && e.confidence === "sure") {
      highrisk.push({
        qid: e.qid,
        category: "highrisk",
        confidence: e.confidence,
        verdict: "wrong",
        myAnswer: e.myAnswer ?? null,
        ts: e.ts,
      });
    } else if (e.verdict === "correct" && (e.confidence === "fuzzy" || e.confidence === "guess")) {
      fragile.push({
        qid: e.qid,
        category: "fragile",
        confidence: e.confidence,
        verdict: "correct",
        myAnswer: e.myAnswer ?? null,
        ts: e.ts,
      });
    }
  }
  highrisk.sort((a, b) => b.ts - a.ts);
  fragile.sort((a, b) => b.ts - a.ts);
  return { highrisk, fragile };
}

/**
 * 结算口径：将 cbmScan 结果按"本次会话作答过的题"过滤，
 * 供结算页一句式归集提示（蒙对 N 题已归入脆弱伪掌握 / 自信答错 M 题标为高危盲区）。
 */
export function cbmSettleSummary(
  scan: CbmScanResult,
  sessionQids: ReadonlySet<string>,
): { fragile: CbmSignal[]; highrisk: CbmSignal[] } {
  return {
    fragile: scan.fragile.filter((s) => sessionQids.has(s.qid)),
    highrisk: scan.highrisk.filter((s) => sessionQids.has(s.qid)),
  };
}
