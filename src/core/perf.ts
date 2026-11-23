// ============================================================
// 启动性能度量工具：安全封装 performance.mark / performance.measure
// ============================================================

export function safePerfMark(name: string): void {
  if (typeof performance !== "undefined" && typeof performance.mark === "function") {
    try {
      performance.mark(name);
    } catch {
      /* ignore */
    }
  }
}

export function safePerfMeasure(name: string, startMark: string, endMark: string): void {
  if (typeof performance !== "undefined" && typeof performance.measure === "function") {
    try {
      performance.measure(name, startMark, endMark);
    } catch {
      /* ignore */
    }
  }
}
