/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { evaluateReviewWrongs, startReviewReminderScheduler } from "../src/core/reviewReminder";
import { lvNotify } from "../src/libs/lv-notice-kit";
import { CATEGORY_DAILY_REVIEW } from "../src/libs/notice";
import type { WrongItem } from "../src/core/types";

describe("ReviewReminder 每日定时错题复习提醒引擎单元测试", () => {
  beforeEach(() => {
    localStorage.clear();
    const host = document.getElementById("lv-notice-host");
    if (host) host.remove();
    delete (window as any).__LV_NOTICE_HUB__;
  });

  afterEach(() => {
    const hub = (window as any).__LV_NOTICE_HUB__;
    if (hub) hub.destroy();
  });

  function createMockApp(wrongItems: WrongItem[]) {
    return {
      wrongItems: () => wrongItems,
    } as any;
  }

  it("evaluateReviewWrongs 正确识别处于艾宾浩斯周期的错题", () => {
    const now = 1700000000000;
    const dayMs = 86400000;

    const items: WrongItem[] = [
      // 刚做错 2 小时：暂不属于临界期（>= 12 小时才算入第一轮复习）
      { qid: "q-fresh", status: "active", wrongCount: 1, firstWrongAt: now - 7200000, lastWrongAt: now - 7200000 },
      // 做错 1 天：处于黄金抢救期
      { qid: "q-1d", status: "active", wrongCount: 2, firstWrongAt: now - 2 * dayMs, lastWrongAt: now - dayMs },
      // 做错 3 天：处于拐点期
      { qid: "q-3d", status: "active", wrongCount: 1, firstWrongAt: now - 3 * dayMs, lastWrongAt: now - 3 * dayMs },
      // 做错 50 天：超过 30 天周期
      { qid: "q-old", status: "active", wrongCount: 1, firstWrongAt: now - 50 * dayMs, lastWrongAt: now - 50 * dayMs },
      // 已归档掌握：不应计入
      { qid: "q-mastered", status: "mastered" as any, wrongCount: 1, firstWrongAt: now - dayMs, lastWrongAt: now - dayMs },
    ];

    const app = createMockApp(items);
    const stats = evaluateReviewWrongs(app, now);

    expect(stats.totalActiveWrongs).toBe(4);
    expect(stats.criticalDueCount).toBe(2);
    expect(stats.items.map((i) => i.qid)).toEqual(["q-1d", "q-3d"]);
  });

  it("evaluateReviewWrongs 当无严格临界错题但有活跃错题时兜底使用活跃错题", () => {
    const now = 1700000000000;
    const items: WrongItem[] = [
      { qid: "q-fresh", status: "active", wrongCount: 1, firstWrongAt: now - 1000, lastWrongAt: now - 1000 },
    ];

    const app = createMockApp(items);
    const stats = evaluateReviewWrongs(app, now);

    expect(stats.totalActiveWrongs).toBe(1);
    expect(stats.criticalDueCount).toBe(1);
    expect(stats.items.length).toBe(1);
  });

  it("startReviewReminderScheduler 支持静默探测并在免打扰时跳过", () => {
    vi.useFakeTimers();
    let reviewTriggered = false;

    const items: WrongItem[] = [
      { qid: "q-due", status: "active", wrongCount: 1, firstWrongAt: Date.now() - 86400000, lastWrongAt: Date.now() - 86400000 },
    ];
    const app = createMockApp(items);

    // 设置今日免打扰
    lvNotify.muteToday(CATEGORY_DAILY_REVIEW);

    const scheduler = startReviewReminderScheduler(app, () => {
      reviewTriggered = true;
    });

    // 延迟 5 秒探测
    vi.advanceTimersByTime(6000);
    const host = document.getElementById("lv-notice-host");
    expect(host?.querySelector(".lv-notice-card")).toBeNull();
    expect(reviewTriggered).toBe(false);

    scheduler.dispose();
    vi.useRealTimers();
  });

  it("startReviewReminderScheduler 未免打扰时正常弹出提醒并在点击时跳转", () => {
    vi.useFakeTimers();
    let reviewTriggered = false;

    const items: WrongItem[] = [
      { qid: "q-due", status: "active", wrongCount: 1, firstWrongAt: Date.now() - 86400000, lastWrongAt: Date.now() - 86400000 },
    ];
    const app = createMockApp(items);

    const scheduler = startReviewReminderScheduler(app, () => {
      reviewTriggered = true;
    });

    vi.advanceTimersByTime(5500);
    const host = document.getElementById("lv-notice-host");
    const card = host?.querySelector(".lv-notice-card");
    expect(card).not.toBeNull();
    expect(card?.textContent).toContain("每日错题复习到期提醒");

    const btn = card?.querySelector(".lv-notice-btn--primary") as HTMLButtonElement;
    btn.click();
    expect(reviewTriggered).toBe(true);

    scheduler.dispose();
    vi.useRealTimers();
  });

  it("lvTicker.onDateCross 能够成功触发跨日回调并重新计算复习集", () => {
    vi.useFakeTimers();
    let crossedDate = "";
    const items: WrongItem[] = [
      { qid: "q-1", status: "active", wrongCount: 1, firstWrongAt: Date.now() - 86400000, lastWrongAt: Date.now() - 86400000 },
    ];
    const app = createMockApp(items);

    const scheduler = startReviewReminderScheduler(
      app,
      () => {},
      (dateKey) => {
        crossedDate = dateKey;
      },
    );

    // 将虚拟时间前进 25 小时（触发跨日零点 tick 广播）
    vi.advanceTimersByTime(25 * 3600 * 1000);

    expect(crossedDate).not.toBe("");
    scheduler.dispose();
    vi.useRealTimers();
  });

  it("withDocLock 能够将针对同一文档的并发写入任务严格排队串行化", async () => {
    const { withDocLock } = await import("../src/libs/lv-notice-kit");
    const docId = "doc-test-concurrent-lock";
    const log: string[] = [];

    const task1 = withDocLock(docId, async () => {
      log.push("start-1");
      await new Promise((resolve) => setTimeout(resolve, 50));
      log.push("end-1");
      return "res-1";
    });

    const task2 = withDocLock(docId, async () => {
      log.push("start-2");
      await new Promise((resolve) => setTimeout(resolve, 20));
      log.push("end-2");
      return "res-2";
    });

    const [r1, r2] = await Promise.all([task1, task2]);

    expect(r1).toBe("res-1");
    expect(r2).toBe("res-2");
    // 任务 1 必须完整结束后，任务 2 才能开始（串行排队）
    expect(log).toEqual(["start-1", "end-1", "start-2", "end-2"]);
  });
});
