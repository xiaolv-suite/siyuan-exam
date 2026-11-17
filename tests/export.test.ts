import { describe, it, expect } from "vitest";
import { wrongbookToMarkdown } from "../src/core/exportMd";
import { makeQuestion } from "../src/core/blockTemplate";
import type { WrongItem } from "../src/core/types";
import { ExamApp, type MockRecord } from "../src/app";
import { MemoryStorage } from "../src/core/attemptLog";
import { KernelApiClient } from "../src/kernel/client";
import type { KernelTransport } from "../src/kernel/client";
import type { MockRunSnapshot } from "../src/core/mock";

const q = makeQuestion({
  type: "single",
  stem: "1+1等于几？",
  options: ["1", "2"],
  answer: "B",
  analysis: "基础加法。",
  kp: "算术",
  source: "测试卷 2026",
});
const wrong: WrongItem = {
  qid: q.id,
  firstWrongAt: 1,
  wrongCount: 3,
  streakCorrect: 0,
  reason: "careless",
  myAnswer: "A",
  status: "active",
};

describe("错题册导出 Markdown", () => {
  it("含标题/计数/题面/选项/双方答案/解析/错因", () => {
    const md = wrongbookToMarkdown([{ wrong, q }], { bankName: "公考题库", exportedAt: new Date(2026, 9, 2) });
    expect(md).toContain("# 错题册 · 公考题库");
    expect(md).toContain("共 1 题");
    expect(md).toContain("1+1等于几？");
    expect(md).toContain("- A. 1");
    expect(md).toContain("✕ 我的答案：A");
    expect(md).toContain("✓ 正确答案：B");
    expect(md).toContain("💡 基础加法");
    expect(md).toContain("错因：粗心");
    expect(md).toContain("错 3 次");
  });
  it("空错题册", () => {
    const md = wrongbookToMarkdown([], { bankName: "X", exportedAt: new Date() });
    expect(md).toContain("错题本为空");
  });
  it("含思源源题块引用 ((blockId)) 与来源笔记块引用 ((sourceBlockId))", () => {
    const qWithBlocks = {
      ...q,
      blockId: "20261031100000-qblock1",
      sourceBlockId: "20261031090000-noteblk",
    };
    const md = wrongbookToMarkdown([{ wrong, q: qWithBlocks, reflection: "审题时漏看了条件" }], {
      bankName: "公考题库",
      exportedAt: new Date(2026, 9, 2),
    });
    expect(md).toContain('((20261031100000-qblock1 "🔗 定位源题块"))');
    expect(md).toContain('((20261031090000-noteblk "📖 来源笔记"))');
    expect(md).toContain("审题时漏看了条件");
  });
});

import {
  formatSiyuanBlockRef,
  buildSiyuanBankOverviewDocMarkdown,
  buildSiyuanActionJournalDocMarkdown,
} from "../src/core/siyuanSyncDoc";

describe("思源常驻文档生成引擎（题库总览与行动复盘日志）", () => {
  it("生成《00 题库总览与考纲导航》与《03 备考行动与复盘日志》含原生块引用与任务块", () => {
    const qLinked = { ...q, blockId: "20261031100000-qblock1", kp: "算术/四则运算" };
    expect(formatSiyuanBlockRef(qLinked.blockId, "1+1等于几？")).toBe('((20261031100000-qblock1 "1+1等于几？"))');

    const overviewMd = buildSiyuanBankOverviewDocMarkdown({
      bankName: "公考题库",
      bankId: "nb-1",
      questions: [qLinked],
      totalAttempts: 10,
      correctAttempts: 8,
      activeWrongCount: 1,
      eliminatedWrongCount: 2,
      mockCount: 1,
    });
    expect(overviewMd).toContain("# 🧭 公考题库 · 题库总览与考纲导航");
    expect(overviewMd).toContain('((20261031100000-qblock1 "1+1等于几？"))');
    expect(overviewMd).toContain('custom-exam-wrong-status="active"');

    const journalMd = buildSiyuanActionJournalDocMarkdown({
      bankName: "公考题库",
      actions: [
        {
          id: "act-1",
          kind: "redo",
          qid: qLinked.id,
          detail: "重练：算术/四则运算",
          status: "open",
          createdAt: Date.now(),
        },
      ],
      reflections: [
        {
          qid: qLinked.id,
          text: "注意进位规则",
          at: Date.now(),
          reason: "careless",
        },
      ],
      questionMap: new Map([[qLinked.id, qLinked]]),
    });
    expect(journalMd).toContain("# 📋 公考题库 · 备考行动与复盘日志");
    expect(journalMd).toContain('- [ ] 重练：算术/四则运算 · ((20261031100000-qblock1 "1+1等于几？"))');
    expect(journalMd).toContain('custom-exam-act-id="act-1"');
    expect(journalMd).toContain("注意进位规则");
  });
});

describe("模考成绩持久化", () => {
  const setup = async () => {
    const transport: KernelTransport = {
      async post() {
        throw new Error("offline");
      },
    };
    const app = new ExamApp({ client: new KernelApiClient(transport), storage: new MemoryStorage() });
    await app.init("d-t");
    return app;
  };
  it("save/list 往返 + FIFO 上限", async () => {
    const app = await setup();
    for (let i = 1; i <= 205; i++) {
      const rec: MockRecord = {
        id: "bp",
        name: "卷" + i,
        startedAt: i,
        total: Math.min(i, 100),
        full: 100,
        // percent is a bounded percentage; keep the FIFO fixture valid while
        // still varying each record's total/identity.
        percent: Math.min(i, 100),
        pass: i >= 60,
      };
      await app.saveMockResult(rec);
    }
    const list = await app.listMockResults();
    expect(list).toHaveLength(200);
    expect(list[0].name).toBe("卷6"); // 最老的被挤出
    expect(list[199].name).toBe("卷205");
  });
  it("空历史", async () => {
    const app = await setup();
    expect(await app.listMockResults()).toEqual([]);
  });

  it("同一 run 重试保存会更新成绩而不重复占历史", async () => {
    const app = await setup();
    const rec: MockRecord = { id: "bp", runId: "run-1", name: "卷", startedAt: 1, total: 6, full: 10, percent: 60, pass: true };
    await app.saveMockResult(rec);
    await app.saveMockResult({ ...rec, total: 7, percent: 70 });
    const list = await app.listMockResults();
    expect(list).toHaveLength(1);
    expect(list[0].total).toBe(7);
  });

  it("并发快照写入按顺序落盘，保留最新状态", async () => {
    let releaseFirst!: () => void;
    let markFirstStarted!: () => void;
    let holdFirst = true;
    const firstStarted = new Promise<void>((resolve) => { markFirstStarted = resolve; });
    const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve; });
    class DelayedStorage extends MemoryStorage {
      override async save(key: string, value: unknown) {
        if (key === "mock/run" && holdFirst) {
          holdFirst = false;
          markFirstStarted();
          await firstGate;
        }
        await super.save(key, value);
      }
    }
    const transport: KernelTransport = { async post() { throw new Error("offline"); } };
    const storage = new DelayedStorage();
    const app = new ExamApp({ client: new KernelApiClient(transport), storage });
    await app.init("d-t");
    const snapshot = (savedAt: number): MockRunSnapshot => ({
      v: 1,
      runId: "run-1",
      bp: { id: "bp", name: "卷", durationS: 3600, passLine: 60, shuffleOptions: false, sectionTimed: false, sections: [] },
      qids: [], sectionOf: {}, scoreOf: {}, indefinite: [], startedAt: 1, savedAt,
      answers: [], flags: [], cursor: 0, sectionStart: {}, screenSwitches: 0,
    });
    const first = app.saveMockRun(snapshot(1));
    await firstStarted;
    const latest = app.saveMockRun(snapshot(2));
    releaseFirst();
    await Promise.all([first, latest]);
    expect((await storage.load("mock/run") as MockRunSnapshot).savedAt).toBe(2);
  });

  it("清除快照等待先前写入完成，避免结束后恢复已结束的模考", async () => {
    let releaseFirst!: () => void;
    let markFirstStarted!: () => void;
    const firstStarted = new Promise<void>((resolve) => { markFirstStarted = resolve; });
    const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve; });
    class DelayedStorage extends MemoryStorage {
      private delayFirst = true;
      override async save(key: string, value: unknown) {
        if (key === "mock/run" && this.delayFirst) {
          this.delayFirst = false;
          markFirstStarted();
          await firstGate;
        }
        await super.save(key, value);
      }
    }
    const transport: KernelTransport = { async post() { throw new Error("offline"); } };
    const storage = new DelayedStorage();
    const app = new ExamApp({ client: new KernelApiClient(transport), storage });
    await app.init("d-t");
    const snapshot: MockRunSnapshot = {
      v: 1,
      runId: "run-1",
      bp: { id: "bp", name: "卷", durationS: 3600, passLine: 60, shuffleOptions: false, sectionTimed: false, sections: [] },
      qids: [], sectionOf: {}, scoreOf: {}, indefinite: [], startedAt: 1, savedAt: 1,
      answers: [], flags: [], cursor: 0, sectionStart: {}, screenSwitches: 0,
    };
    const first = app.saveMockRun(snapshot);
    await firstStarted;
    const clear = app.clearMockRun();
    releaseFirst();
    await Promise.all([first, clear]);
    expect(await storage.load("mock/run")).toBeNull();
  });
});
