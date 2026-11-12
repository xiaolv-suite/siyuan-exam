import { describe, it, expect, vi } from "vitest";
import {
  getCheckinConfig,
  runCheckinSync,
  retryPendingCheckin,
  queryCheckinStreak,
  CHECKIN_PENDING_KEY,
} from "@/ui/practice/services/checkinBridgeService";
import type { ExamApp } from "@/app";

describe("打卡桥服务 (checkinBridgeService)", () => {
  it("1. getCheckinConfig：正确解析配置对象", () => {
    const cfg = getCheckinConfig({
      checkinItemId: "item-123",
      checkinThreshold: 5,
    });
    expect(cfg.itemId).toBe("item-123");
    expect(cfg.threshold).toBe(5);

    const emptyCfg = getCheckinConfig({});
    expect(emptyCfg.itemId).toBe("");
    expect(emptyCfg.threshold).toBe(0);
  });

  it("2. runCheckinSync：无桥接插件或配置未开启时安静返回", async () => {
    const mockApp = {
      attempts: {
        all: () => [
          { qid: "q1", ts: Date.now(), verdict: "right" },
          { qid: "q2", ts: Date.now(), verdict: "wrong" },
        ],
      },
      saveAux: vi.fn().mockResolvedValue(undefined),
    } as unknown as ExamApp;

    const res = await runCheckinSync(mockApp, {}, {} as Window);
    expect(res.status).toBe("disabled");
    expect(res.note).toBe("");
    expect(mockApp.saveAux).toHaveBeenCalledWith(CHECKIN_PENDING_KEY, null);
  });

  it("3. retryPendingCheckin：有待重试项但 API 不可用时安全跳过", async () => {
    const mockApp = {
      loadAux: vi.fn().mockResolvedValue({
        itemId: "item-1",
        value: 1,
        occurredAt: 123456,
        externalRef: "ref-1",
      }),
      saveAux: vi.fn().mockResolvedValue(undefined),
    } as unknown as ExamApp;

    // 伪造无 checkin API 的 window
    const handled = await retryPendingCheckin(mockApp, {} as Window);
    expect(handled).toBe(false);
    expect(mockApp.saveAux).not.toHaveBeenCalled();
  });

  it("4. retryPendingCheckin：API 具备 recordEvent 能力时完成补写并清除缓存", async () => {
    const mockApp = {
      loadAux: vi.fn().mockResolvedValue({
        itemId: "item-1",
        value: 1,
        occurredAt: 123456,
        externalRef: "ref-1",
      }),
      saveAux: vi.fn().mockResolvedValue(undefined),
    } as unknown as ExamApp;

    const recordEventMock = vi.fn().mockReturnValue({ eventId: "e1" });
    const mockWin = {
      siyuanCheckin: {
        protocol: "siyuan-checkin",
        whenReady: vi.fn().mockResolvedValue(undefined),
        hasCapability: vi.fn().mockReturnValue(true),
        recordEvent: recordEventMock,
      },
    } as unknown as Window;

    const handled = await retryPendingCheckin(mockApp, mockWin);
    expect(handled).toBe(true);
    expect(recordEventMock).toHaveBeenCalled();
    expect(mockApp.saveAux).toHaveBeenCalledWith(CHECKIN_PENDING_KEY, null);
  });

  it("5. queryCheckinStreak：桥未开启回退 null，开启后查询当前连击天数", async () => {
    // 1. 未开启
    const s1 = await queryCheckinStreak({}, {} as Window);
    expect(s1).toBeNull();

    // 2. 开启并 mock 连击
    const mockWin = {
      siyuanCheckin: {
        protocol: "siyuan-checkin",
        whenReady: vi.fn().mockResolvedValue(undefined),
        hasCapability: vi.fn().mockReturnValue(true),
        getStreaks: vi.fn().mockReturnValue([
          { itemId: "item-1", current: 7, longest: 15 },
        ]),
      },
    } as unknown as Window;

    const s2 = await queryCheckinStreak({ checkinItemId: "item-1" }, mockWin);
    expect(s2).toBe(7);
  });

  it("6. postSessionCheckinSafely：会话结算异步打卡上报", async () => {
    const { postSessionCheckinSafely } = await import("@/ui/practice/services/checkinBridgeService");
    // 空 itemId 时静默跳过
    await expect(postSessionCheckinSafely("", 10, 8)).resolves.toBeUndefined();
    // 零题目时静默跳过
    await expect(postSessionCheckinSafely("item-1", 0, 0)).resolves.toBeUndefined();
    // 正常传入时正常完成且无抛错
    await expect(postSessionCheckinSafely("item-1", 5, 4)).resolves.toBeUndefined();
  });

  it("7. extractCheckinSettingsFromPlugin：从插件设置读取打卡配置", async () => {
    const { extractCheckinSettingsFromPlugin } = await import("@/ui/practice/services/checkinBridgeService");
    const mockPlugin = {
      settingUtils: {
        get: vi.fn().mockImplementation((key) => {
          if (key === "checkinItemId") return "  item-999  ";
          if (key === "checkinThreshold") return 5;
          if (key === "dailyGoal") return 20;
          return null;
        }),
      },
    };

    const s = extractCheckinSettingsFromPlugin(mockPlugin);
    expect(s.checkinItemId).toBe("item-999");
    expect(s.checkinThreshold).toBe(5);
    expect(s.dailyGoal).toBe(20);
  });
});
