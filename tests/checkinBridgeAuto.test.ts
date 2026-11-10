import { describe, it, expect, vi } from "vitest";
import {
  autoResolveCheckinItem,
  syncCheckin,
  type CheckinApiV5,
} from "../src/core/checkinBridge";
import { runCheckinSync } from "../src/ui/practice/services/checkinBridgeService";
import type { ExamApp } from "../src/app";

describe("打卡项免配置智能匹配 (autoResolveCheckinItem)", () => {
  it("强关键字优先匹配（刷题/做题/考试/考备/备考）", () => {
    const api = {
      protocol: "siyuan-checkin",
      queryItems: () => [
        { id: "item-read", name: "每日阅读", archived: false },
        { id: "item-exercise", name: "考备每日刷题", archived: false },
        { id: "item-run", name: "晨跑", archived: false },
      ],
    } as unknown as CheckinApiV5;

    const matched = autoResolveCheckinItem(api);
    expect(matched?.id).toBe("item-exercise");
    expect(matched?.name).toBe("考备每日刷题");
  });

  it("无强关键字时匹配次级学习关键字（学习/复习/打卡）", () => {
    const api = {
      protocol: "siyuan-checkin",
      getItems: () => [
        { id: "item-cook", name: "做饭", archived: false },
        { id: "item-study", name: "专业课复习", archived: false },
      ],
    } as unknown as CheckinApiV5;

    const matched = autoResolveCheckinItem(api);
    expect(matched?.id).toBe("item-study");
    expect(matched?.name).toBe("专业课复习");
  });

  it("只有唯一活跃项时兜底采纳", () => {
    const api = {
      protocol: "siyuan-checkin",
      queryItems: () => [
        { id: "item-single", name: "习惯坚持", archived: false },
      ],
    } as unknown as CheckinApiV5;

    const matched = autoResolveCheckinItem(api);
    expect(matched?.id).toBe("item-single");
  });

  it("未配置 itemId 时 syncCheckin 保持关闭", async () => {
    const recordMock = vi.fn().mockReturnValue({ eventId: "e-auto" });
    const api = {
      protocol: "siyuan-checkin",
      hasCapability: () => true,
      queryItems: () => [
        { id: "item-auto", name: "公考刷题打卡", archived: false },
      ],
      recordEvent: recordMock,
    } as unknown as CheckinApiV5;

    const res = await syncCheckin(api, { itemId: "", threshold: 5 }, 10, Date.now(), 10);
    expect(res.status).toBe("disabled");
    expect(res.autoResolvedItem).toBeUndefined();
    expect(recordMock).not.toHaveBeenCalled();
  });

  it("runCheckinSync 不在未配置时自动绑定", async () => {
    const mockApp = {
      attempts: {
        all: () => [
          { qid: "q1", ts: Date.now(), verdict: "correct" },
          { qid: "q2", ts: Date.now(), verdict: "correct" },
        ],
      },
      saveAux: vi.fn().mockResolvedValue(undefined),
    } as unknown as ExamApp;

    const mockWin = {
      siyuanCheckin: {
        protocol: "siyuan-checkin",
        hasCapability: () => true,
        queryItems: () => [{ id: "item-bound", name: "每日做题打卡", archived: false }],
        recordEvent: vi.fn().mockReturnValue({ eventId: "ev-1" }),
      },
    } as unknown as Window;

    let boundId = "";
    const res = await runCheckinSync(
      mockApp,
      { checkinThreshold: 1 },
      mockWin,
      (item) => { boundId = item.id; },
    );

    expect(res.status).toBe("disabled");
    expect(boundId).toBe("");
  });
});
