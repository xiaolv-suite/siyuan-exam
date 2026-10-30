import { describe, it, expect } from "vitest";
import { FlowDwellTracker } from "../src/core/flowTimer";
import { startFocusNoise, stopFocusNoise, isFocusNoiseActive } from "../src/libs/sound";

describe("专注心流与有效驻留计时器 (flowTimer)", () => {
  it("在连续交互中累加有效时长", () => {
    const tracker = new FlowDwellTracker(60_000);
    const t0 = 1_000_000;

    tracker.recordActivity(t0);
    // 5秒后点击下一题
    tracker.recordActivity(t0 + 5_000);
    expect(tracker.getActiveDurationMs(t0 + 5_000)).toBe(5_000);

    // 10秒后再次作答
    tracker.recordActivity(t0 + 15_000);
    expect(tracker.getActiveDurationMs(t0 + 15_000)).toBe(15_000);
    expect(tracker.getActiveDurationSeconds(t0 + 15_000)).toBe(15);
  });

  it("超过 60 秒挂机静置时自动暂停，不计入挂机水分", () => {
    const tracker = new FlowDwellTracker(60_000);
    const t0 = 1_000_000;

    tracker.recordActivity(t0);
    // 挂机 10 分钟 (600 秒)
    const tLate = t0 + 600_000;
    expect(tracker.isStalled(tLate)).toBe(true);

    // 挂机期间由于无操作且超过阈值，不累计这 10 分钟
    tracker.recordActivity(tLate);
    expect(tracker.getActiveDurationMs(tLate)).toBe(0);
  });

  it("切换窗口/失焦时结算并冻结", () => {
    const tracker = new FlowDwellTracker(60_000);
    const t0 = 1_000_000;

    tracker.recordActivity(t0);
    // 学习 20 秒后切出应用
    tracker.setVisibility(false, t0 + 20_000);
    expect(tracker.getActiveDurationSeconds(t0 + 20_000)).toBe(20);

    // 切出 5 分钟后切回
    tracker.setVisibility(true, t0 + 320_000);
    // 切出期间不增加时间
    expect(tracker.getActiveDurationSeconds(t0 + 320_000)).toBe(20);
  });

  it("reset 重置为 0", () => {
    const tracker = new FlowDwellTracker(60_000);
    tracker.recordActivity(100);
    tracker.recordActivity(5000);
    expect(tracker.getActiveDurationMs(5000)).toBe(4900);
    tracker.reset();
    expect(tracker.getActiveDurationMs()).toBe(0);
  });
});

describe("专注心流白噪音开关 (sound)", () => {
  it("stopFocusNoise 与 isFocusNoiseActive 安全运行", () => {
    expect(isFocusNoiseActive()).toBe(false);
    // 启动与停止容错
    startFocusNoise("rain", 0.05);
    stopFocusNoise();
    expect(isFocusNoiseActive()).toBe(false);
  });
});
