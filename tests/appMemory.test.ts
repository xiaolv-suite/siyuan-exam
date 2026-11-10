import { describe, it, expect } from "vitest";
import { ExamApp } from "../src/app";
import { MemoryStorage } from "../src/core/attemptLog";
import type { KernelApiClient } from "../src/kernel/client";
import type { Question } from "../src/core/types";
import { makeQuestion } from "../src/core/blockTemplate";

/** stub 内核：riff/SQL/属性写 全记录 */
function stubClient(opts: { decks?: { id: string; name: string }[]; failAttrOn?: Set<string> } = {}) {
  const calls = {
    addRiffCards: [] as { deckId: string; blockIds: string[] }[],
    reviewRiffCard: [] as { cardId: string; deckId: string; rating: number }[],
    setExamAttrs: [] as { blockId: string; attrs: Record<string, string> }[],
    appendBlock: [] as { parentId: string; md: string }[],
    createRiffDeck: [] as string[],
  };
  let decks = opts.decks ?? [];
  const client = {
    sql: async () => [],
    getRiffDecks: async () => decks,
    createRiffDeck: async (name: string) => {
      calls.createRiffDeck.push(name);
      decks = [...decks, { id: "deck-1", name }];
      return "deck-1";
    },
    addRiffCards: async (deckId: string, blockIds: string[]) => {
      calls.addRiffCards.push({ deckId, blockIds });
    },
    getCardIDsByBlockIDs: async (blockIds: string[]) => new Map(blockIds.map((b) => [b, `card-${b}`])),
    reviewRiffCard: async (cardId: string, deckId: string, rating: number) => {
      calls.reviewRiffCard.push({ cardId, deckId, rating });
    },
    setExamAttrs: async (blockId: string, attrs: Record<string, string>) => {
      if (opts.failAttrOn?.has(blockId)) throw new Error("attr write failed");
      calls.setExamAttrs.push({ blockId, attrs });
    },
    appendBlock: async (parentId: string, md: string) => {
      calls.appendBlock.push({ parentId, md });
      return ["id1"];
    },
  } as unknown as KernelApiClient;
  return { client, calls, setDecks: (d: { id: string; name: string }[]) => (decks = d) };
}

const mkApp = (client: KernelApiClient, kernelOnline = true) => {
  const app = new ExamApp({ client, storage: new MemoryStorage(), now: () => 1_800_000_000_000 });
  app.kernelOnline = kernelOnline;
  return app;
};

const qWithBlock = (id: string): Question & { blockId?: string } => ({
  ...makeQuestion({ type: "single", stem: id, options: ["1", "2"], answer: "A" }),
  id,
  blockId: `b-${id}`,
});

describe("应用层记忆/写入路径（应用编排层测试补盲）", () => {
  it("reciteAnswer：自评落流水（客观对错由 selfRating 承载）且已转卡题同步 riff 评级", async () => {
    const { client, calls } = stubClient({ decks: [{ id: "deck-1", name: "小驴考试/公考" }] });
    const app = mkApp(client);
    const q = qWithBlock("q1");
    await app.reciteAnswer("公考", q, 2, "s1"); // 有点难（Hard）
    await app.reciteAnswer("公考", q, 4, "s1"); // 很容易（Easy）
    const events = app.attempts.all();
    expect(events).toHaveLength(2);
    // 39-04：recite 是自评场景，不再把自评伪装成客观对错——verdict 只表示「发生过作答」
    expect(events[0]).toMatchObject({ kind: "recite", verdict: "not_attempted", selfRating: 2 });
    expect(events[1]).toMatchObject({ kind: "recite", verdict: "not_attempted", selfRating: 4 });
    expect(calls.reviewRiffCard).toHaveLength(2);
    // 39-01：对齐上游 riff.Rating（Again=1/Hard=2/Good=3/Easy=4），非旧 0-3 偏移值
    expect(calls.reviewRiffCard[0].rating).toBe(2); // 2模糊 → Hard(2)
    expect(calls.reviewRiffCard[1].rating).toBe(4); // 4熟知 → Easy(4)
  });

  it("39-04：Hard 不清零背诵连击，Again 才清零（费力但成功回忆≠失败）", async () => {
    const { client } = stubClient({ decks: [{ id: "deck-1", name: "小驴考试/公考" }] });
    const app = mkApp(client);
    const q = qWithBlock("q1");
    // Good → 连击 1；Hard → 保持 1（旧实现会清零）；Good → 2；Again → 清零
    await app.reciteAnswer("公考", q, 3, "s1");
    await app.reciteAnswer("公考", q, 2, "s1");
    await app.reciteAnswer("公考", q, 3, "s1");
    expect(app.derived().reciteStreak.get(q.id)).toBe(2);
    await app.reciteAnswer("公考", q, 1, "s1");
    expect(app.derived().reciteStreak.get(q.id)).toBe(0);
  });

  it("convertToCards：只送有块 ID 的题；无块返回 0 不调内核", async () => {
    const { client, calls } = stubClient();
    const app = mkApp(client);
    const n1 = await app.convertToCards("bank1", "公考", [
      qWithBlock("a"),
      qWithBlock("b"),
      { ...makeQuestion({ type: "single", stem: "noblock", options: [], answer: "A" }), id: "c" },
    ]);
    expect(n1).toBe(2);
    expect(calls.addRiffCards[0].blockIds).toEqual(["b-a", "b-b"]);
    const n2 = await app.convertToCards("bank1", "公考", [
      { ...makeQuestion({ type: "single", stem: "x", options: [], answer: "A" }), id: "d" },
    ]);
    expect(n2).toBe(0);
    expect(calls.addRiffCards).toHaveLength(1);
  });

  it("applyBatchEdit：逐题写属性计数回执；失败不中断；离线拒绝", async () => {
    const { client, calls } = stubClient({ failAttrOn: new Set(["b2"]) });
    const app = mkApp(client);
    const r = await app.applyBatchEdit([
      { blockId: "b1", field: "kp", to: "言语" },
      { blockId: "b2", field: "kp", to: "数量" },
      { blockId: "b3", field: "difficulty", to: "3" },
    ]);
    expect(r).toEqual({ ok: 2, failed: 1 });
    const byBlock = new Map(calls.setExamAttrs.map((c) => [c.blockId, c.attrs]));
    expect(byBlock.get("b1")).toEqual({ "exam-kp": "言语" });
    expect(byBlock.get("b3")).toEqual({ "exam-difficulty": "3" });
    expect(byBlock.has("b2")).toBe(false); // 失败项未写入
    const offline = mkApp(client, false);
    await expect(offline.applyBatchEdit([{ blockId: "b1", field: "kp", to: "x" }])).rejects.toThrow("离线");
  });

  it("findQuestionByBlock：跨库定位命中；离线返回 null", async () => {
    const target = { ...qWithBlock("hit"), rootId: "r1" } as Question & { blockId: string; rootId: string };
    const client = {
      sql: async () => [],
      listQuestions: async (nb: string) => (nb === "bank2" ? [target] : []),
      getRiffDecks: async () => [],
    } as unknown as KernelApiClient;
    const app = mkApp(client, true);
    app["banks"] = [
      { id: "bank1", name: "A", createdAt: 1 },
      { id: "bank2", name: "B", createdAt: 2 },
    ] as never;
    const hit = await app.findQuestionByBlock("b-hit");
    expect(hit?.bank.id).toBe("bank2");
    expect(hit?.q.id).toBe("hit");
    expect(await app.findQuestionByBlock("missing")).toBeNull();
    const offline = mkApp(client, false);
    expect(await offline.findQuestionByBlock("b-hit")).toBeNull();
  });

  it("43-08：ExamApp 考点拓扑因果与阶段通关规划", async () => {
    const q1 = { ...qWithBlock("q-disc-1"), kp: "数学/微积分", difficulty: 3 };
    const q2 = { ...qWithBlock("q-disc-2"), kp: "数学/微积分", difficulty: 4 };

    const client = {
      sql: async () => [],
      listQuestions: async () => [q1, q2],
      getRiffDecks: async () => [],
    } as unknown as KernelApiClient;

    const app = mkApp(client);
    app["banks"] = [{ id: "bank-disc", name: "通关规划测试库", createdAt: 1 }] as never;

    await app.attempts.load("d-disc");
    app.attempts.append({ qid: "q-disc-1", kind: "practice", mode: "single", verdict: "correct", myAnswer: "A", sessionId: "s1" });
    app.attempts.append({ qid: "q-disc-1", kind: "practice", mode: "single", verdict: "wrong", myAnswer: "B", sessionId: "s2" });

    const clearance = await app.planClearanceStudy("bank-disc");
    expect(clearance.summary.totalStages).toBeGreaterThanOrEqual(1);
    expect(clearance.stages.length).toBeGreaterThanOrEqual(1);
  });

  it("68-04 / 65-04 / 45-12：ExamApp 双栏打印Pro", async () => {
    const q1 = { ...qWithBlock("q-pro-1"), kp: "常识" };
    const q2 = { ...qWithBlock("q-pro-2"), kp: "常识" };

    const client = {
      sql: async () => [],
      listQuestions: async () => [q1, q2],
      getRiffDecks: async () => [],
    } as unknown as KernelApiClient;

    const app = mkApp(client);
    app["banks"] = [{ id: "bank-pro", name: "Pro测试库", createdAt: 1 }] as never;

    // 1. 双栏紧凑打印 HTML 生成
    const qSheet = await app.buildCompactQuestionSheet("A4双栏模考卷", "bank-pro", { columns: "double" });
    expect(qSheet).toContain("column-count: 2");
    expect(qSheet).toContain("A4双栏模考卷");
    expect(qSheet).not.toContain("标准答案"); // 安全红线

    const ansSheet = await app.buildCompactAnswerSheet("A4双栏答案册", "bank-pro");
    expect(ansSheet).toContain("A4双栏答案册 · 答案册");
    expect(ansSheet).toContain(q1.answer);

  });

  it("121-04：ExamApp 备考完备度多维体检与考点盲区雷达闭环", async () => {
    const q1 = { ...qWithBlock("q-ready-1"), kp: "刑法/总则/犯罪构成" };
    const q2 = { ...qWithBlock("q-ready-2"), kp: "民法/物权/所有权" };
    const client = {
      sql: async () => [],
      listQuestions: async () => [q1, q2],
      getRiffDecks: async () => [],
    } as unknown as KernelApiClient;

    const app = mkApp(client);
    app["banks"] = [{ id: "bank-ready", name: "备考完备度测试库", createdAt: 1 }] as never;

    await app.attempts.load("d-ready");
    app.attempts.append({ qid: "q-ready-1", kind: "practice", mode: "single", verdict: "correct", sessionId: "s1" });
    app.attempts.append({ qid: "q-ready-2", kind: "practice", mode: "single", verdict: "wrong", sessionId: "s1" });

    // 生成完备度报告
    const report = await app.generateReadinessReport("bank-ready");
    expect(Object.keys(report.dimensions).length).toBe(5);
    expect(report.overallScore).toBeGreaterThan(0);
    expect(["S", "A", "B", "C", "D"]).toContain(report.grade);
    expect(report.blindspots.length).toBeGreaterThan(0);

    // 导出 Markdown
    const md = await app.exportReadinessReportMarkdown("bank-ready");
    expect(md).toContain("# 🎯 备考完备度体检与考点盲区诊断报告");
    expect(md).toContain("五维体检雷达指标");
    expect(md).toContain("考点盲区扫描清单");

  });

  it("121-05：ExamApp OCR 试题解析与题目速记标签", async () => {
    const client = {
      sql: async () => [],
      listQuestions: async () => [],
      assetOcr: async (_path: string) => ({
        text: `1. 设函数 \\( f(x) = x^2 \\)，求 $f(2)$。\nA. 2\nB. 4\n【答案】B\n【解析】$f(2) = 2^2 = 4$。`,
        ocrJSON: null,
      }),
    } as unknown as KernelApiClient;

    const app = mkApp(client);

    // 1. 本地纯文本 OCR 结构化解析
    const q1 = await app.parseOcrTextToQuestion("1. 测试题干\nA. 甲\nB. 乙\n【答案】A");
    expect(q1.stem).toBe("测试题干");
    expect(q1.options).toEqual(["甲", "乙"]);
    expect(q1.answer).toBe("A");

    // 2. 模拟内核 assetOcr 链路调用
    const q2 = await app.ocrAndParseQuestion("assets/photo-q.png");
    expect(q2.stem).toContain("$f(x) = x^2$");
    expect(q2.options).toEqual(["2", "4"]);
    expect(q2.answer).toBe("B");
    expect(q2.analysis).toContain("$f(2) = 2^2 = 4$");

    // 3. 模拟图片上传 + OCR 端到端调用
    client.uploadAsset = async (_file: Blob, _filename?: string) => "assets/uploaded-1.png";
    const q3 = await app.uploadAndOcrQuestion(new Blob(["mock-image"]), "photo.png");
    expect(q3.stem).toContain("$f(x) = x^2$");
    expect(q3.source).toBe("assets/uploaded-1.png");

    // 4. 用户题目速记标签标记（⭐️ 好题、⚠️ 陷阱）
    let lastSetAttrs: Record<string, string> | null = null;
    client.setExamAttrs = async (blockId: string, attrs: Record<string, string>) => {
      expect(blockId).toBe("b-tag-1");
      lastSetAttrs = attrs;
    };

    const qWithB = { ...q1, blockId: "b-tag-1" };
    const tagged = await app.tagQuestion(qWithB, "star", "add");
    expect(tagged.userTags).toEqual(["star"]);
    expect(lastSetAttrs?.["exam-tags"]).toBe("star");

    // 切换 tag
    const toggled = await app.tagQuestion(qWithB, "star", "toggle");
    expect(toggled.userTags).toBeUndefined();
    expect(lastSetAttrs?.["exam-tags"]).toBe("");

  });

  it("题库管理：ExamApp.renameBank 能够重命名题库并持久化注册表", async () => {
    const client = {
      createNotebook: async () => "nb-mock-id",
      createDocWithMd: async () => "doc-mock-id",
    } as unknown as KernelApiClient;
    const app = mkApp(client);
    const b = await app.createBank("旧名称");
    expect(app.listBanks().find((x) => x.id === b.id)?.name).toBe("旧名称");

    const renamed = await app.renameBank(b.id, "新名称");
    expect(renamed.name).toBe("新名称");
    expect(app.listBanks().find((x) => x.id === b.id)?.name).toBe("新名称");

    await expect(app.renameBank(b.id, "")).rejects.toThrow("题库名称不能为空");
  });
});
