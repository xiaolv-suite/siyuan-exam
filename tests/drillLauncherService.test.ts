import { describe, it, expect, vi } from "vitest";
import {
  pickDrillQuestions,
  pickSingleWrongQuestion,
  pickSameKpQuestions,
  toggleQuestionFavorite,
  executeMasterAllWrong,
  executeMasterAllWrongWithConfirm,
  executeMasterSingleWrongWithConfirm,
  resolveExternalTargetQuestions,
  resolveFilteredWrongDrillQuestions,
} from "@/ui/practice/services/drillLauncherService";
import type { ExamApp } from "@/app";
import type { Question } from "@/core/types";

describe("练习会话调度与定向刷题服务 (drillLauncherService)", () => {
  const fakeQuestions: Question[] = [
    {
      id: "q-1",
      type: "single",
      stem: "题目一",
      options: ["A", "B"],
      answer: "A",
      kp: "数学/代数",
      userTags: ["重点"],
      status: "published",
      origin: "manual",
      hash: "h-1",
    },
    {
      id: "q-2",
      type: "single",
      stem: "题目二同考点",
      options: ["A", "B"],
      answer: "B",
      kp: "数学/代数",
      status: "published",
      origin: "manual",
      hash: "h-2",
    },
    {
      id: "q-3",
      type: "material",
      stem: "材料大题",
      options: [],
      answer: "",
      status: "published",
      origin: "manual",
      hash: "h-3",
    },
  ];

  it("1. pickDrillQuestions：多模式精准调度（标签/错题/快速/每日）", () => {
    const mockApp = {
      wrongDrill: vi.fn().mockReturnValue([fakeQuestions[0]]),
      cramDrill: vi.fn().mockReturnValue([fakeQuestions[1]]),
      favDrill: vi.fn().mockReturnValue([]),
      dailyDrill: vi.fn().mockReturnValue([fakeQuestions[0], fakeQuestions[1]]),
      quickDrill: vi.fn().mockReturnValue([fakeQuestions[0]]),
      attempts: { all: () => [] },
    } as unknown as ExamApp;

    // 1. 标签模式
    const rTag = pickDrillQuestions({
      app: mockApp,
      questions: fakeQuestions,
      mode: "tag:重点",
      sessionSeed: "seed-1",
    });
    expect(rTag.picked).toHaveLength(1);
    expect(rTag.picked[0].id).toBe("q-1");

    // 2. 错题模式
    const rWrong = pickDrillQuestions({
      app: mockApp,
      questions: fakeQuestions,
      mode: "wrong",
      sessionSeed: "seed-1",
    });
    expect(rWrong.picked).toHaveLength(1);
    expect(mockApp.wrongDrill).toHaveBeenCalled();

    // 3. 收藏模式（无收藏题目时返回 info 提示）
    const rFav = pickDrillQuestions({
      app: mockApp,
      questions: fakeQuestions,
      mode: "fav",
      sessionSeed: "seed-1",
    });
    expect(rFav.picked).toHaveLength(0);
    expect(rFav.info).toBe("state.noFav");

    // 4. 快速刷题模式
    const rQuick = pickDrillQuestions({
      app: mockApp,
      questions: fakeQuestions,
      mode: "quick",
      sessionSeed: "seed-1",
    });
    expect(rQuick.picked).toHaveLength(1);
    expect(mockApp.quickDrill).toHaveBeenCalled();
  });

  it("2. pickSingleWrongQuestion 与 pickSameKpQuestions：定向单题与举一反三变式题", () => {
    // 1. 定向错题
    const single = pickSingleWrongQuestion(fakeQuestions, "q-2");
    expect(single?.id).toBe("q-2");

    // 2. 举一反三同考点
    const sameKp = pickSameKpQuestions(fakeQuestions, "q-1");
    expect(sameKp).toHaveLength(1);
    expect(sameKp[0].id).toBe("q-2");
  });

  it("3. toggleQuestionFavorite：切换收藏并提示", async () => {
    const msgs: string[] = [];
    const showMessage = (m: string) => msgs.push(m);
    const t = (k: string) => `[${k}]`;

    const mockApp = {
      toggleFav: vi.fn().mockResolvedValue(true),
    } as unknown as ExamApp;

    const nextFav = await toggleQuestionFavorite(mockApp, fakeQuestions[0], showMessage, false, t);
    expect(nextFav).toBe(true);
    expect(mockApp.toggleFav).toHaveBeenCalledWith(fakeQuestions[0]);
    expect(msgs[0]).toBe("[session.favAdded]");
  });

  it("4. executeMasterAllWrong：批量标记已掌握", async () => {
    const msgs: string[] = [];
    const showMessage = (m: string) => msgs.push(m);
    const t = (k: string) => `[${k}]`;

    const mockApp = {
      setWrongStatus: vi.fn().mockResolvedValue(undefined),
    } as unknown as ExamApp;

    const res = await executeMasterAllWrong(mockApp, [{ qid: "q-1" }, { qid: "q-2" }], showMessage, t);
    expect(res.ok).toBe(2);
    expect(res.failed).toBe(0);
    expect(msgs[0]).toBe("[wrongbook.masterAllDone]");
  });

  it("5. executeMasterAllWrongWithConfirm：带弹窗确认的批量掌握处理", async () => {
    const msgs: string[] = [];
    const showMessage = (m: string) => msgs.push(m);
    const t = (k: string) => `[${k}]`;
    const mockApp = { setWrongStatus: vi.fn().mockResolvedValue(undefined) } as unknown as ExamApp;

    // 1. 取消
    const cancelConfirm = vi.fn().mockResolvedValue(false);
    const resCancel = await executeMasterAllWrongWithConfirm(mockApp, [{ qid: "q-1" }], cancelConfirm, showMessage, t);
    expect(resCancel.confirmed).toBe(false);

    // 2. 确认
    const agreeConfirm = vi.fn().mockResolvedValue(true);
    const resAgree = await executeMasterAllWrongWithConfirm(mockApp, [{ qid: "q-1" }], agreeConfirm, showMessage, t);
    expect(resAgree.confirmed).toBe(true);
    expect(resAgree.ok).toBe(1);
  });

  it("6. executeMasterSingleWrongWithConfirm：单题确认并标为已掌握", async () => {
    const msgs: string[] = [];
    const showMessage = (m: string) => msgs.push(m);
    const t = (k: string) => `[${k}]`;
    const mockApp = { setWrongStatus: vi.fn().mockResolvedValue(undefined) } as unknown as ExamApp;

    // 1. 取消
    const cancelConfirm = vi.fn().mockResolvedValue(false);
    const resCancel = await executeMasterSingleWrongWithConfirm({
      app: mockApp,
      qid: "q-1",
      stem: "题目内容",
      confirmFn: cancelConfirm,
      showMessage,
      t,
      offline: false,
    });
    expect(resCancel).toBe(false);

    // 2. 确认
    const agreeConfirm = vi.fn().mockResolvedValue(true);
    const resAgree = await executeMasterSingleWrongWithConfirm({
      app: mockApp,
      qid: "q-1",
      stem: "题目内容",
      confirmFn: agreeConfirm,
      showMessage,
      t,
      offline: false,
    });
    expect(resAgree).toBe(true);
    expect(mockApp.setWrongStatus).toHaveBeenCalledWith("q-1", "mastered");
    expect(msgs).toContain("[wrongbook.masteredDone]");
  });

  it("7. resolveExternalTargetQuestions：提取外部题目与缺题提示", () => {
    const t = (k: string) => `[${k}]`;
    const qs = [
      { id: "q-1", type: "single" },
      { id: "q-2", type: "material" },
      { id: "q-3", type: "judge" },
    ] as Question[];

    // 1. 全部空
    const emptyRes = resolveExternalTargetQuestions(qs, ["q-not-found", "q-2"], t);
    expect(emptyRes.picked).toHaveLength(0);
    expect(emptyRes.emptyNotice).toBe("[query.empty]");

    // 2. 部分匹配并报缺失
    const partialRes = resolveExternalTargetQuestions(qs, ["q-1", "q-4"], t);
    expect(partialRes.picked).toHaveLength(1);
    expect(partialRes.picked[0].id).toBe("q-1");
    expect(partialRes.missingNotice).toBe("[query.missing]");
  });

  it("8. resolveFilteredWrongDrillQuestions：根据错题队列提取完整题目列表", () => {
    const qs = [
      { id: "q-1", stem: "题1" },
      { id: "q-2", stem: "题2" },
    ] as Question[];

    const wrongQueue = [{ qid: "q-2" }, { qid: "q-not-exist" }];
    const res = resolveFilteredWrongDrillQuestions(qs, wrongQueue);
    expect(res).toHaveLength(1);
    expect(res[0].id).toBe("q-2");
  });
});
