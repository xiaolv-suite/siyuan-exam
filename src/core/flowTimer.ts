// ============================================================
// 专注心流与有效研学驻留计时器 (Flow Dwell Tracker)
// 依据 Unyra 探索式学习专注准则：
// 1. 只有「前台处于激活态 + 60秒内有操作 + 未静坐挂机」的时间才计入真实有效学习时长
// 2. 窗口失焦或离开时自动结算并暂停，切回前台恢复计时，彻底过滤挂机水分
// 纯函数与计时状态机，无外部重依赖。
// ============================================================

export class FlowDwellTracker {
  private activeMs = 0;
  private lastActivityTs = 0;
  private isVisible = true;
  private readonly idleThresholdMs: number;

  constructor(idleThresholdMs = 60_000) {
    this.idleThresholdMs = Math.max(5_000, idleThresholdMs);
  }

  /** 记录用户一次交互活动（键盘敲击、点击、作答、滚动） */
  recordActivity(now = Date.now()): void {
    if (this.isVisible && this.lastActivityTs > 0) {
      const delta = now - this.lastActivityTs;
      if (delta > 0 && delta <= this.idleThresholdMs) {
        this.activeMs += delta;
      }
    }
    this.lastActivityTs = now;
  }

  /** 设置页面/窗口可见性 (切换标签页或应用前后台) */
  setVisibility(visible: boolean, now = Date.now()): void {
    if (!visible) {
      // 切后台时结算截至目前的有效时间
      this.recordActivity(now);
      this.lastActivityTs = 0;
    } else {
      this.lastActivityTs = now;
    }
    this.isVisible = visible;
  }

  /** 获取截至当前的累计有效专注学习时长 (毫秒) */
  getActiveDurationMs(now = Date.now()): number {
    let current = this.activeMs;
    if (this.isVisible && this.lastActivityTs > 0) {
      const delta = now - this.lastActivityTs;
      if (delta > 0 && delta <= this.idleThresholdMs) {
        current += delta;
      }
    }
    return current;
  }

  /** 获取有效专注学习时长 (秒) */
  getActiveDurationSeconds(now = Date.now()): number {
    return Math.round(this.getActiveDurationMs(now) / 1000);
  }

  /** 判定当前是否处于静置挂机超时状态 (超过 60s 未交互) */
  isStalled(now = Date.now()): boolean {
    if (!this.isVisible || this.lastActivityTs === 0) return true;
    return now - this.lastActivityTs > this.idleThresholdMs;
  }

  /** 重置计时器 */
  reset(): void {
    this.activeMs = 0;
    this.lastActivityTs = 0;
  }
}
