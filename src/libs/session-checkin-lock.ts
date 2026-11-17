let fallbackQueue: Promise<unknown> = Promise.resolve();
/** One origin lock protects fresh read, ledger mutation and the immutable external event. */
export function withSessionCheckinLock<T>(task: () => Promise<T>): Promise<T> {
  if (typeof navigator !== "undefined" && navigator.locks?.request) return navigator.locks.request("lv-exam:session-checkin-ledger-v1", task);
  if (typeof window !== "undefined") return Promise.reject(new Error("Cross-window check-in lock unavailable; no event sent"));
  const next = fallbackQueue.catch(() => undefined).then(task);
  fallbackQueue = next;
  return next;
}
