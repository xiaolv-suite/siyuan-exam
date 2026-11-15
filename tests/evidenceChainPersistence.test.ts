import { describe, it, expect, vi } from "vitest";
import { ExamApp } from "../src/app";
import { MemoryStorage } from "../src/core/attemptLog";
import { makeQuestion, questionToMarkdown } from "../src/core/blockTemplate";
import type { KernelApiClient } from "../src/kernel/client";
import { recordSessionAttempt } from "../src/ui/practice/services/sessionLifecycleService";
import {
  assembleReciteQueue,
  executeReciteRating,
  saveReciteSnapshot,
  loadReciteSnapshot,
  clearReciteSnapshot,
} from "../src/ui/practice/services/reciteStudioService";
import { RatingGuard } from "../src/core/ratingOutcome";

function createTestClient(questions: any[] = []): KernelApiClient {
  const blocks = new Map<string, string>();
  for (const q of questions) {
    if (q.blockId) blocks.set(q.blockId, questionToMarkdown(q));
  }
  return {
    sql: async () => [],
    listQuestions: async () => questions,
    getRiffDecks: async () => [],
    getBlockKramdown: async (id: string) => blocks.get(id) ?? "",
    updateBlock: async (id: string, md: string) => {
      blocks.set(id, md);
    },
    setExamAttrs: async () => undefined,
  } as unknown as KernelApiClient;
}

describe("独立答对证据链与会话/背诵/修订持久化闭环", () => {
  it("看提示后重载插件再答对：受助与暴露随会话恢复，错题不会被误判为独立消灭", async () => {
    const q = {
      ...makeQuestion({
        type: "single",
        stem: "光合作用光反应的场所是？",
        options: ["类囊体薄膜", "叶绿体基质", "线粒体内膜", "细胞质基质"],
        answer: "A",
        kp: "生物/细胞代谢",
        analysis: "光反应在类囊体薄膜上进行。",
      }),
      blockId: "b-q1",
      rootId: "doc-1",
    };

    const storage = new MemoryStorage();
    let clock = 1_700_000_000_000;
    const client = createTestClient([q]);

    // 1. 先产生错题记录（连错 1 次在册）
    const app1 = new ExamApp({ client, storage, now: () => (clock += 1000) });
    await app1.init();
    app1.kernelOnline = true;
    app1["banks"] = [{ id: "bank-1", name: "生物题库", createdAt: 1 }] as never;
    await app1["saveBankRegistry"]();

    app1.recordAttempt({
      qid: q.id,
      kind: "practice",
      mode: "quick",
      verdict: "wrong",
      myAnswer: "B",
      sessionId: "s-init",
      queue: "normal",
    });
    await app1.flush();
    expect(app1.wrongItems().map((w) => w.qid)).toContain(q.id);

    // 2. 开启错题重练会话：连对 2 次本应消灭，但第 2 次作答前展开了提示、写了草稿，随后重载
    const s1 = await app1.startSession([q], "wrong", "bank-1");
    const firstTry = s1.submit("A", 1200)!;
    recordSessionAttempt({
      app: app1,
      session: s1,
      q,
      submitResult: firstTry,
      timeMs: 1200,
    });
    await app1.saveSession();
    await app1.flush();
    await app1.discardSession();

    // 第二轮错题会话：答前先看提示 + 写演算草稿 + 先回忆标记，未提交即重载
    const s2 = await app1.startSession([q], "wrong", "bank-1");
    s2.addExposure(q.id, "hint");
    s2.setHintState(q.id, 1, ["提示1：注意区分光反应与暗反应场所"]);
    s2.markRecalled(q.id);
    s2.setScratchpad({ store: { [q.id]: "光反应 -> 类囊体" }, sharedText: "", mode: "per_question" });
    await app1.saveSession();
    await app1.flush();

    // 3. 模拟思源重载：全新 ExamApp 从同一 storage 恢复会话
    const app2 = new ExamApp({ client, storage, now: () => (clock += 1000) });
    await app2.init();
    app2.kernelOnline = true;

    const resumed = await app2.resumeSession(async () => [q], "bank-1");
    expect(resumed).not.toBeNull();
    expect(resumed!.helpModeOf(q.id)).toBe("hint");
    expect(resumed!.getExposures(q.id)).toEqual(["hint"]);
    expect(resumed!.getHintState(q.id)).toEqual({
      level: 1,
      texts: ["提示1：注意区分光反应与暗反应场所"],
    });
    expect(resumed!.isRecalled(q.id)).toBe(true);
    expect(resumed!.getScratchpad().store[q.id]).toBe("光反应 -> 类囊体");

    // 4. 重载后答对提交：流水必须带 help="hint"，且在册错题不得作为“独立消灭”出清
    const sub = resumed!.submit("A", 1500)!;
    recordSessionAttempt({
      app: app2,
      session: resumed!,
      q,
      submitResult: sub,
      timeMs: 1500,
      helpMode: resumed!.helpModeOf(q.id),
      isRecalled: resumed!.isRecalled(q.id),
      exposures: resumed!.getExposures(q.id),
    });
    await app2.flush();

    const lastEvt = app2.attempts.all().at(-1)!;
    expect(lastEvt.help).toBe("hint");
    expect(lastEvt.recall).toBe(true);
    expect(lastEvt.exposure).toContain("hint");
    // 受助答对不推进独立连对计数 -> 仍在活跃错题本中
    expect(app2.wrongItems().map((w) => w.qid)).toContain(q.id);

    // 5. 随后在全新无提示会话中独立答对 -> 达到独立连对 2 次，正式移出活跃错题本
    await app2.discardSession();
    const s3 = await app2.startSession([q], "wrong", "bank-1");
    const subIndependent = s3.submit("A", 1100)!;
    recordSessionAttempt({
      app: app2,
      session: s3,
      q,
      submitResult: subIndependent,
      timeMs: 1100,
    });
    await app2.flush();
    expect(app2.wrongItems().map((w) => w.qid)).not.toContain(q.id);
  });

  it("背诵模式：recitePool 过滤已毕业题、真实用时透传与进度快照持久化恢复", async () => {
    const q1 = makeQuestion({ type: "single", stem: "题1", options: ["A", "B"], answer: "A" });
    const q2 = makeQuestion({ type: "single", stem: "题2", options: ["A", "B"], answer: "B" });
    const storage = new MemoryStorage();
    const app = new ExamApp({ client: createTestClient([q1, q2]), storage });
    app.kernelOnline = true;
    await app.init();

    // q1 连击 4 次毕业后，assembleReciteQueue 走 recitePool 只抽未毕业的 q2
    for (let i = 0; i < 4; i++) {
      await app.reciteAnswer("测试库", q1, 4, `s-grad-${i}`, 800);
    }
    const queue = assembleReciteQueue(app, [q1, q2], 10);
    expect(queue.map((q) => q.id)).toEqual([q2.id]);

    // 真实耗时透传
    const spy = vi.spyOn(app, "reciteAnswer");
    const guard = new RatingGuard();
    await executeReciteRating({
      app,
      bankName: "测试库",
      q: q2,
      rating: 3,
      sessionId: "s-rec-time",
      guard,
      timeMs: 2450,
    });
    expect(spy).toHaveBeenCalledWith("测试库", q2, 3, "s-rec-time", 2450);

    // 背诵会话快照保存与重载恢复
    await saveReciteSnapshot(app, "bank-1", {
      queue: [q1, q2],
      cursor: 1,
      revealed: true,
      done: false,
      hint: 1,
      ratings: [3],
      sessionId: "s-rec-persist",
    });
    const loaded = await loadReciteSnapshot(app, "bank-1", [q1, q2]);
    expect(loaded).not.toBeNull();
    expect(loaded!.cursor).toBe(1);
    expect(loaded!.revealed).toBe(true);
    expect(loaded!.ratings).toEqual([3]);
    expect(loaded!.sessionId).toBe("s-rec-persist");

    await clearReciteSnapshot(app);
    expect(await loadReciteSnapshot(app, "bank-1", [q1, q2])).toBeNull();
  });

  it("题目首次在线修订自动保留编辑前初始基线版本，可回退至原始题面", async () => {
    const q = {
      ...makeQuestion({
        type: "single",
        stem: "原始题干",
        options: ["甲", "乙"],
        answer: "A",
        analysis: "原始解析",
        kp: "常识",
      }),
      blockId: "b-rev-1",
    };
    let nowTs = 1_700_000_100_000;
    const app = new ExamApp({
      client: createTestClient([q]),
      storage: new MemoryStorage(),
      now: () => (nowTs += 1000),
    });
    await app.init();
    app.kernelOnline = true;

    await app.updateQuestionContent(q, {
      stem: "修订后题干",
      options: ["甲", "乙"],
      answer: "B",
      analysis: "修订后解析",
      kp: "常识",
    });

    const revs = await app.questionRevisions(q.id);
    expect(revs).toHaveLength(2);
    expect(revs[0].stem).toBe("原始题干");
    expect(revs[0].answer).toBe("A");
    expect(revs[0].summary).toContain("初始基线");
    expect(revs[1].stem).toBe("修订后题干");
    expect(revs[1].answer).toBe("B");
  });
});
