// ============================================================
// 试题改答轨迹服务 (answerTrailService.ts)
// 承接作答过程中的答案变更记录、原因询问状态判定与原因反标
// 纯逻辑解耦，不绑定 Svelte 渲染态
// ============================================================

import {
  startTrail,
  recordEdit,
  trailValue,
  withLastEditReason,
  type AnswerTrail,
} from "@/core/answerTrail";

export { type AnswerTrail };

/**
 * 记录作答轨迹并判定是否需要提示询问修改原因
 */
export function recordAnswerTrailInput(
  trails: Map<string, AnswerTrail>,
  qid: string,
  value: string,
): { promptReason: boolean } {
  const v = String(value ?? "");
  if (!v) return { promptReason: false };
  const existing = trails.get(qid);
  if (!existing) {
    trails.set(qid, startTrail(v));
    return { promptReason: false };
  }
  const before = trailValue(existing);
  if (v === before) return { promptReason: false };
  const next = recordEdit(existing, v);
  if (next !== existing) {
    trails.set(qid, next);
    return { promptReason: next.edits.length > existing.edits.length };
  }
  return { promptReason: false };
}

/**
 * 标记并持久化最后一次改答的原因
 */
export function assignLastEditReason(
  trails: Map<string, AnswerTrail>,
  qid: string,
  reason: "unsure" | "evidence" | "misclick",
): void {
  const t = trails.get(qid);
  if (t) {
    trails.set(qid, withLastEditReason(t, reason));
  }
}
