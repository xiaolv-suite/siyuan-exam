import type { CheckinEventInput } from "./checkinBridge";
export const SESSION_CHECKIN_KEY = "checkin/bridge/sessions-v1";
export interface PendingSession { event: CheckinEventInput; ready: boolean; }
export interface SessionLedger { v: 1; pending: PendingSession[]; delivered: string[]; }

/** Fail closed on corrupted identity/value data; never invent replacement external references. */
export function validateSessionLedger(raw: unknown): SessionLedger {
  if (raw == null) return { v: 1, pending: [], delivered: [] };
  const data = raw as SessionLedger;
  if (data.v !== 1 || !Array.isArray(data.pending) || !Array.isArray(data.delivered)) throw new Error("Invalid session check-in ledger");
  const refs = new Set<string>();
  for (const ref of data.delivered) {
    if (typeof ref !== "string" || !ref.startsWith("exam:session:") || refs.has(ref)) throw new Error("Invalid delivered session identity");
    refs.add(ref);
  }
  for (const entry of data.pending) {
    const e = entry?.event;
    if (!e || typeof entry.ready !== "boolean" || typeof e.itemId !== "string" || !e.itemId.trim() || e.source !== "api" || e.unit !== "题"
      || !Number.isSafeInteger(e.value) || e.value <= 0 || typeof e.externalRef !== "string" || !e.externalRef.startsWith(`exam:session:${e.itemId}:`)
      || refs.has(e.externalRef) || !Number.isFinite(Date.parse(e.occurredAt))) throw new Error("Invalid pending session identity or value");
    refs.add(e.externalRef);
  }
  return structuredClone(data);
}

export function assertSafeSessionLedgerRestore(currentRaw: unknown, nextRaw: unknown): SessionLedger {
  const current = validateSessionLedger(currentRaw), next = validateSessionLedger(nextRaw);
  const nextDelivered = new Set(next.delivered), pending = new Map(next.pending.map(x => [x.event.externalRef, x]));
  for (const ref of current.delivered) if (!nextDelivered.has(ref)) throw new Error("Restore would regress a delivered session");
  for (const item of current.pending) {
    if (nextDelivered.has(item.event.externalRef)) continue;
    const restored = pending.get(item.event.externalRef);
    if (!restored || JSON.stringify(restored.event) !== JSON.stringify(item.event) || (item.ready && !restored.ready)) throw new Error("Restore would lose or change a pending session");
  }
  return next;
}
