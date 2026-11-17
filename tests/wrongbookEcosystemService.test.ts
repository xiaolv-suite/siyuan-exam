import { describe, it, expect, vi } from "vitest";
import {
  pushWrongsToCards,
  pushSingleWrongToCard,
  pushSessionWrongsToActions,
  assembleAndLaunchWrongMock,
  countEliminatedWrongs,
  calculateClearPercentage,
  queryArchivedWrongList,
  queryEliminatedWrongList,
} from "@/ui/practice/services/wrongbookEcosystemService";
import type { ExamApp } from "@/app";
import type { Question } from "@/core/types";

describe("错题生态联动服务 (wrongbookEcosystemService)", () => {
  const fakeQuestion: Question = {
    id: "q-1",
    type: "single",
    stem: "错题题干",
    options: ["A", "B"],
    answer: "A",
    status: "published",
    origin: "manual",
    hash: "h-1",
  };

  it("1. pushWrongsToCards：未安装闪卡插件提示，已安装则批量推送", async () => {
    const msgs: string[] = [];
    const showMessage = (m: string) => msgs.push(m);

    const mockApp = {
      convertToCards: vi.fn().mockResolvedValue(3),
    } as unknown as ExamApp;

    // 1. 无闪卡插件
    const n1 = await pushWrongsToCards(mockApp, "bank-1", "演示库", [fakeQuestion], false, showMessage);
    expect(n1).toBe(0);
    expect(msgs[0]).toContain("未检测到小驴闪卡插件");

    // 2. 有闪卡插件
    const n2 = await pushWrongsToCards(mockApp, "bank-1", "演示库", [fakeQuestion], true, showMessage);
    expect(n2).toBe(3);
    expect(mockApp.convertToCards).toHaveBeenCalledWith("bank-1", "演示库", [fakeQuestion]);
    expect(msgs[1]).toContain("已将 3 道错题同步推送");
  });

  it("2. pushSingleWrongToCard：单题推送到闪卡", async () => {
    const msgs: string[] = [];
    const showMessage = (m: string) => msgs.push(m);

    const mockApp = {
      convertToCards: vi.fn().mockResolvedValue(1),
    } as unknown as ExamApp;

    const ok = await pushSingleWrongToCard(mockApp, "bank-1", "演示库", fakeQuestion, true, showMessage);
    expect(ok).toBe(true);
    expect(msgs[0]).toContain("已将 1 道顽疾错题同步推送");
  });

  it("3. pushSessionWrongsToActions：错题加入持久化行动清单", async () => {
    const qMap = new Map<string, Question>([["q-1", fakeQuestion]]);
    const mockApp = {
      addActions: vi.fn().mockResolvedValue({ added: 1, skipped: 0 }),
    } as unknown as ExamApp;
    const t = (k: string) => `[${k}]`;

    const res = await pushSessionWrongsToActions(mockApp, [{ qid: "q-1" }], qMap, "sess-1", t);
    expect(res.added).toBe(1);
    expect(mockApp.addActions).toHaveBeenCalledWith([
      expect.objectContaining({
        kind: "redo",
        qid: "q-1",
        sessionId: "sess-1",
      }),
    ]);
  });

  it("4. assembleAndLaunchWrongMock：组装错题模考卷并进入考场", async () => {
    const msgs: string[] = [];
    const showMessage = (m: string) => msgs.push(m);
    const openMockMock = vi.fn();
    const t = (k: string) => `[${k}]`;

    // 1. 有错题组卷成功
    const mockApp = {
      assembleWrongbookExam: vi.fn().mockResolvedValue({ totalCount: 15 }),
    } as unknown as ExamApp;

    const count = await assembleAndLaunchWrongMock(mockApp, "bank-1", openMockMock, showMessage, t);
    expect(count).toBe(15);
    expect(openMockMock).toHaveBeenCalled();
    expect(msgs[0]).toContain("已为 15 道错题生成专属限时特训卷");

    // 2. 无可用错题
    const emptyApp = {
      assembleWrongbookExam: vi.fn().mockResolvedValue({ totalCount: 0 }),
    } as unknown as ExamApp;
    const c2 = await assembleAndLaunchWrongMock(emptyApp, "bank-1", openMockMock, showMessage, t);
    expect(c2).toBe(0);
    expect(msgs[1]).toBe("[wrongbook.noFiltered]");
  });

  it("5. countEliminatedWrongs, calculateClearPercentage, queryArchivedWrongList 与 queryEliminatedWrongList", () => {
    const questions = [{ id: "q-1" }, { id: "q-2" }];
    const mockApp = {
      derived: vi.fn().mockReturnValue({
        wrongbook: new Map([
          ["q-1", { qid: "q-1", status: "eliminated", lastWrongAt: 200 }],
          ["q-other", { qid: "q-other", status: "eliminated", lastWrongAt: 100 }],
        ]),
      }),
      listArchivedWrongs: vi.fn().mockReturnValue([
        { qid: "q-1" },
        { qid: "q-foreign" },
      ]),
    } as unknown as ExamApp;

    // 1. 已消灭计数（只统计当前题库下的题目）
    const count = countEliminatedWrongs(mockApp, questions);
    expect(count).toBe(1);
    expect(countEliminatedWrongs(null, questions)).toBe(0);

    // 2. 消灭率百分比
    expect(calculateClearPercentage(1, 3)).toBe(25); // 1 / (1 + 3) = 25%
    expect(calculateClearPercentage(0, 0)).toBe(0);

    // 3. 归档列表
    const archived = queryArchivedWrongList(mockApp, questions);
    expect(archived).toHaveLength(1);
    expect(archived[0].qid).toBe("q-1");
    expect(queryArchivedWrongList(null, questions)).toEqual([]);

    // 4. 已消灭列表
    const eliminated = queryEliminatedWrongList(mockApp, questions);
    expect(eliminated).toHaveLength(1);
    expect(eliminated[0].qid).toBe("q-1");
    expect(queryEliminatedWrongList(null, questions)).toEqual([]);
  });
});
