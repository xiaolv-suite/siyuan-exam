import { describe, expect, it, vi } from "vitest";
import { syncCheckin } from "../src/core/checkinBridge";
import { assembleReciteQueue } from "../src/ui/practice/services/reciteStudioService";
import { syncSessionCheckin } from "../src/ui/practice/services/sessionCheckinService";
import { ExamApp } from "../src/app";
import { MemoryStorage } from "../src/core/attemptLog";

describe("2026-11-09 audit regression", () => {
  it("empty configuration never selects or writes an unrelated sole check-in", async () => {
    const write = vi.fn();
    const result = await syncCheckin({ protocol: "siyuan-checkin", queryItems: () => [{ id: "run", name: "晨跑" }], hasCapability: () => true, recordEvent: write }, { itemId: "", threshold: 1 }, 10, Date.now(), 1);
    expect(result.status).toBe("disabled");
    expect(write).not.toHaveBeenCalled();
  });
  it("an empty graduated pool remains empty", () => {
    const q = { id: "graduated" } as any;
    expect(assembleReciteQueue({ recitePool: () => [], quickDrill: (xs: any[]) => xs } as any, [q])).toEqual([]);
  });
  it("two sessions enqueue below threshold and later deliver exact deltas with stable retry identities", async () => {
    const store = new Map<string, any>(); let attempts = 5;
    const app = { loadAux: async (k: string) => store.get(k), saveAux: async (k: string, v: any) => { store.set(k, structuredClone(v)); },
      attempts: { all: () => Array.from({ length: attempts }, () => ({ ts: Date.now(), verdict: "correct" })) } } as any;
    const received = new Map<string, number>();
    const recordEvent = vi.fn(async ([event]: any[]) => { if (!received.has(event.externalRef)) received.set(event.externalRef, event.value); return [{ kind: "recorded", eventId: "event" }]; });
    const win = { siyuanCheckin: { protocol: "siyuan-checkin", whenReady: async () => true, hasCapability: () => true, recordEventsBatch: recordEvent } } as any;
    const settings = { checkinItemId: "study", dailyGoal: 10 };
    expect((await syncSessionCheckin(app, settings, { id: "s1", total: 5, correct: 4 }, win)).status).toBe("below-threshold");
    expect(recordEvent).not.toHaveBeenCalled();
    attempts = 20;
    await syncSessionCheckin(app, settings, { id: "s2", total: 15, correct: 12 }, win);
    await syncSessionCheckin(app, settings, { id: "s1", total: 5, correct: 4 }, win);
    expect([...received.values()]).toEqual([5, 15]);
    expect(recordEvent).toHaveBeenCalledTimes(2);
  });
  it("backup, restore and retry keep the original pending identity without duplicate facts", async () => {
    const original = new ExamApp({ client: { sql: async () => [] } as any, storage: new MemoryStorage() });
    const { SESSION_CHECKIN_KEY } = await import("../src/core/sessionCheckinLedger");
    const event = { itemId: "study", value: 5, unit: "题", source: "api", externalRef: "exam:session:study:s1", occurredAt: new Date().toISOString() };
    await original.saveAux(SESSION_CHECKIN_KEY, { v: 1, pending: [{ event, ready: true }], delivered: [] });
    const bundle = await original.dumpData();
    const restored = new ExamApp({ client: { sql: async () => [] } as any, storage: new MemoryStorage() });
    expect(await restored.restoreData({ sessionCheckin: bundle.sessionCheckin })).toBe(true);
    const facts = new Set<string>();
    const recordEvent = vi.fn(async ([input]: any[]) => { facts.add(input.externalRef); return [{ kind: "recorded", eventId: "e1" }]; });
    const win = { siyuanCheckin: { protocol: "siyuan-checkin", whenReady: async () => true, hasCapability: () => true, recordEventsBatch: recordEvent } } as any;
    expect((await syncSessionCheckin(restored, { checkinItemId: "study" }, undefined, win)).status).toBe("synced");
    await syncSessionCheckin(restored, { checkinItemId: "study" }, undefined, win);
    expect(facts.size).toBe(1);
    expect(recordEvent).toHaveBeenCalledTimes(1);
    expect(await restored.restoreData({ sessionCheckin: bundle.sessionCheckin })).toBe(false); // cannot regress delivered to pending
    expect(await restored.restoreData({ sessionCheckin: { v: 1, pending: [{ event: { ...event, value: -1 }, ready: true }], delivered: [] } })).toBe(false);
  });
  it("a next-day retry uses batch occurredAt and retains blocked work", async () => {
    const { SESSION_CHECKIN_KEY } = await import("../src/core/sessionCheckinLedger");
    const { validateSessionLedger, assertSafeSessionLedgerRestore } = await import("../src/core/sessionCheckinLedger");
    const app = new ExamApp({ client: { sql: async () => [] } as any, storage: new MemoryStorage() });
    const yesterday = new Date(Date.now() - 86_400_000).toISOString();
    const event = { itemId: "study", value: 5, unit: "题", source: "api", externalRef: "exam:session:study:yesterday", occurredAt: yesterday };
    await app.saveAux(SESSION_CHECKIN_KEY, { v: 1, pending: [{ event, ready: true }], delivered: [] });
    const recordEventsBatch = vi.fn(async (_events: any[]) => [{ kind: "blocked", reason: "test" }]);
    const win = { siyuanCheckin: { protocol: "siyuan-checkin", whenReady: async () => true, hasCapability: () => true, recordEventsBatch } } as any;
    expect((await syncSessionCheckin(app, { checkinItemId: "study" }, undefined, win)).status).toBe("pending");
    expect(recordEventsBatch.mock.calls[0][0][0].occurredAt).toBe(yesterday);
    const ledger = validateSessionLedger(await app.loadAux(SESSION_CHECKIN_KEY));
    expect(ledger.pending).toHaveLength(1);
    expect(() => assertSafeSessionLedgerRestore(ledger, { v: 1, pending: [], delivered: [] })).toThrow();
  });
  it("two app instances serialize a shared ledger without dropping either pending session", async () => {
    const shared = new Map<string, any>();
    const app = () => ({ loadAux: async (key: string) => shared.get(key), saveAux: async (key: string, data: unknown) => { await Promise.resolve(); shared.set(key, structuredClone(data)); }, attempts: { all: () => [] } } as any);
    const settings = { checkinItemId: "study", dailyGoal: 10 };
    await Promise.all([syncSessionCheckin(app(), settings, { id: "left", total: 5, correct: 4 }, {} as Window), syncSessionCheckin(app(), settings, { id: "right", total: 5, correct: 4 }, {} as Window)]);
    const { SESSION_CHECKIN_KEY } = await import("../src/core/sessionCheckinLedger");
    expect(shared.get(SESSION_CHECKIN_KEY).pending).toHaveLength(2);
  });
});
