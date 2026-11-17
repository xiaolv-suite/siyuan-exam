import type { ExamApp } from "@/app";
import { localDateKeyOf, probeCheckinApi } from "@/core/checkinBridge";
import type { CheckinPluginSettings } from "./checkinBridgeService";
import { withSessionCheckinLock } from "@/libs/session-checkin-lock";
import { SESSION_CHECKIN_KEY, validateSessionLedger, type SessionLedger } from "@/core/sessionCheckinLedger";
export { SESSION_CHECKIN_KEY } from "@/core/sessionCheckinLedger";


/** Immutable per-session deltas. Never send a daily cumulative value under one event identity. */
export function syncSessionCheckin(
  app: ExamApp, settings: CheckinPluginSettings,
  session?: { id: string; total: number; correct: number; endedAt?: number },
  win: Window = window,
): Promise<{ status: "disabled" | "below-threshold" | "pending" | "synced"; note: string }> {
  const completedAt = session?.endedAt ?? Date.now();
  return withSessionCheckinLock(async () => {
    const itemId = String(settings.checkinItemId ?? "").trim();
    if (!itemId) return { status: "disabled", note: "" };
    // loadAux has no shared in-memory cache; this read is inside the origin lock.
    const raw = await app.loadAux<SessionLedger | null>(SESSION_CHECKIN_KEY);
    const ledger = validateSessionLedger(raw);
    if (session?.id && session.total > 0) {
      const at = completedAt;
      const date = localDateKeyOf(at);
      const ref = `exam:session:${itemId}:${session.id}`;
      if (!ledger.delivered.includes(ref) && !ledger.pending.some(x => x.event.externalRef === ref)) {
        ledger.pending.push({ ready: false, event: { itemId, value: session.total, unit: "题", source: "api", externalRef: ref,
          occurredAt: new Date(at).toISOString(), note: `小驴考试 · 本场完成 ${session.total} 题，答对 ${session.correct} 题` } });
      }
      const threshold = Math.max(1, Number(settings.checkinThreshold || settings.dailyGoal || 10));
      const todayAttempts = app.attempts.all().filter(e => localDateKeyOf(e.ts) === date && e.verdict !== "not_attempted").length;
      if (todayAttempts >= threshold) {
        for (const pending of ledger.pending) if (pending.event.itemId === itemId && localDateKeyOf(Date.parse(pending.event.occurredAt)) === date) pending.ready = true;
      }
      await app.saveAux(SESSION_CHECKIN_KEY, ledger);
      const readback = await app.loadAux<SessionLedger>(SESSION_CHECKIN_KEY);
      if (JSON.stringify(readback) !== JSON.stringify(ledger)) throw new Error("Session check-in ledger readback failed");
    }
    const ready = ledger.pending.filter(x => x.ready && x.event.itemId === itemId);
    if (!ready.length) return { status: "below-threshold", note: "" };
    const api = probeCheckinApi(win);
    if (!api) return { status: "pending", note: ready[0].event.externalRef };
    try {
      let timer: ReturnType<typeof setTimeout> | undefined;
      let isReady: unknown;
      try {
        isReady = await Promise.race([Promise.resolve(api.whenReady?.()), new Promise<false>(resolve => { timer = setTimeout(() => resolve(false), 2500); })]);
      } finally { if (timer) clearTimeout(timer); }
      if ((isReady as unknown) === false || !api.hasCapability?.("events.record.batch") || typeof api.recordEventsBatch !== "function") return { status: "pending", note: ready[0].event.externalRef };
      for (const pending of ready) {
        // Only batch recording preserves the original occurredAt on a later-day retry.
        const receipt = (await api.recordEventsBatch([pending.event]))[0];
        if (!receipt || !["recorded", "duplicate"].includes(receipt.kind) || !receipt.eventId) return { status: "pending", note: pending.event.externalRef };
        ledger.pending = ledger.pending.filter(x => x.event.externalRef !== pending.event.externalRef);
        ledger.delivered.push(pending.event.externalRef);
        await app.saveAux(SESSION_CHECKIN_KEY, ledger);
      }
      return { status: "synced", note: "" };
    } catch {
      return { status: "pending", note: ready[0].event.externalRef };
    }
  });
}
