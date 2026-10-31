// ============================================================
// 真内核完整备考旅程自动化验收（docs/25 P0-02 · 原创 5 题全链路）
// 实连运行中的 SiYuan 内核，走真实 ExamApp + KernelApiClient + /api/file 持久化：
//   1. 建临时题库 → 导入原创 5 题混合卷（单选/多选/判断/数值填空/简答）→ SQL/块读回确认
//   2. 独立作答会话（3 对 2 错）→ 落盘 → 全新实例重载 → 错题本准确收录 2 题
//   3. 错题重练证据链：首轮独立答对 1 次 → 次轮看提示+写草稿后重载恢复 → 受助答对不消灭 → 再独立答对正式消灭
//   4. 全真模考组装 → 作答+草稿快照落盘 → 重载恢复同一场考试 → 交卷落成绩与报告聚合核对
//   5. 清理临时题库笔记本与隔离存储目录，不污染用户数据
// ============================================================
import { ExamApp } from "../../src/app";
import { HttpTransport, KernelApiClient } from "../../src/kernel/client";
import type { StorageAdapter } from "../../src/core/attemptLog";
import { parseText } from "../../src/importer/pipeline";
import { assemble, defaultMockSections, MockSession } from "../../src/core/mock";
import { exposureStats, masteryByKp } from "../../src/core/report";
import { recordSessionAttempt } from "../../src/ui/practice/services/sessionLifecycleService";

class KernelPetalStorage implements StorageAdapter {
  constructor(
    private readonly base: string,
    private readonly token: string,
    private readonly rootDir: string,
  ) {}

  private filePath(key: string): string {
    return `${this.rootDir}/${key}.json`;
  }

  async load(key: string): Promise<unknown> {
    const res = await fetch(`${this.base}/api/file/getFile`, {
      method: "POST",
      headers: {
        Authorization: `Token ${this.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ path: this.filePath(key) }),
    });
    if (res.status === 404 || res.status === 202) return null;
    const text = await res.text();
    if (!text) return null;
    try {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed === "object" && "code" in parsed && (parsed as any).code === 404) {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }

  async save(key: string, value: unknown): Promise<void> {
    const fd = new FormData();
    fd.append("path", this.filePath(key));
    fd.append("isDir", "false");
    fd.append("modTime", String(Math.floor(Date.now() / 1000)));
    fd.append("file", new Blob([JSON.stringify(value)], { type: "application/json" }), "data.json");
    const res = await fetch(`${this.base}/api/file/putFile`, {
      method: "POST",
      headers: { Authorization: `Token ${this.token}` },
      body: fd,
    });
    if (!res.ok) throw new Error(`putFile HTTP ${res.status}`);
    const body = (await res.json()) as { code: number; msg?: string };
    if (body.code !== 0) throw new Error(`putFile code=${body.code} ${body.msg ?? ""}`);
  }

  async removeRoot(): Promise<void> {
    await fetch(`${this.base}/api/file/removeFile`, {
      method: "POST",
      headers: {
        Authorization: `Token ${this.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ path: this.rootDir }),
    }).catch(() => undefined);
  }
}

const FIVE_MIXED_QUESTIONS_MD = [
  "1. 【单选】在 TCP/IP 四层模型中，负责端到端可靠传输的协议是？",
  "A. IP",
  "B. TCP",
  "C. UDP",
  "D. ARP",
  "答案：B",
  "解析：TCP 提供面向连接的可靠字节流传输。",
  "考点：计算机网络/传输层",
  "",
  "2. 【多选】下列属于关系型数据库事务 ACID 特性的有？",
  "A. 原子性",
  "B. 一致性",
  "C. 隔离性",
  "D. 易失性",
  "答案：ABC",
  "解析：ACID 包括原子性、一致性、隔离性、持久性。",
  "考点：数据库/事务",
  "",
  "3. 【判断】二分查找算法要求待查线性表必须按关键字有序排列。",
  "答案：对",
  "解析：无序序列无法通过中点比较排除一半区间。",
  "考点：数据结构/查找",
  "",
  "4. 【填空】标准大气压下纯水沸点约为 ____ 摄氏度。",
  "答案：100",
  "解析：标准大气压下纯水沸点为 100℃。",
  "考点：物理常识/热学",
  "",
  "5. 【简答】简述操作系统中进程与线程的核心区别。",
  "答案：进程是资源分配的基本单位，线程是 CPU 调度的基本单位。",
  "解析：同一进程内的线程共享地址空间，切换开销更小。",
  "考点：操作系统/进程管理",
].join("\n");

export async function runLiveJourney({ base, token }: { base: string; token: string }): Promise<number> {
  const results: boolean[] = [];
  const record = (name: string, ok: boolean, note = "") => {
    results.push(ok);
    console.log(`${ok ? "✓" : "✗ FAIL"}  ${name}${note ? "  — " + note : ""}`);
  };

  const tag = Date.now().toString(36);
  const storageRoot = `/data/storage/petal/siyuan-exam-smoke-journey-${tag}`;
  const storage = new KernelPetalStorage(base, token, storageRoot);
  const makeApp = async () => {
    const transport = new HttpTransport(base, token, fetch as any, 15_000, 2);
    const client = new KernelApiClient(transport);
    const app = new ExamApp({ client, storage });
    await app.init();
    app.kernelOnline = true;
    return { app, client };
  };

  let createdBankId = "";
  try {
    // 1. 建库 + 原创 5 题混合导入 + 读回确认
    const { app: app1 } = await makeApp();
    const bank = await app1.createBank(`lv-exam-smoke-journey-${tag}`);
    createdBankId = bank.id;
    record("1. 创建真内核临时题库", Boolean(bank.id), bank.id);

    const parsed = await parseText(FIVE_MIXED_QUESTIONS_MD);
    record("2. 解析原创 5 行混合题（单选/多选/判断/填空/简答）", parsed.ok.length === 5 && parsed.errors.length === 0, `ok=${parsed.ok.length}, err=${parsed.errors.length}`);

    const commitRes = await app1.commitImport(bank.id, parsed);
    let loadedQuestions = await app1.listQuestions(bank.id);
    // 排除建库默认示例题，仅核对本批导入的 5 道题
    const importedIds = new Set(parsed.ok.map((q) => q.id));
    for (let retry = 0; retry < 5 && loadedQuestions.filter((q) => importedIds.has(q.id)).length < 5; retry++) {
      await new Promise((r) => setTimeout(r, 1200));
      loadedQuestions = await app1.listQuestions(bank.id);
    }
    const fiveQs = parsed.ok.map((orig) => loadedQuestions.find((q) => q.id === orig.id)).filter((q): q is NonNullable<typeof q> => Boolean(q));
    record("3. 写入思源块并完整读回 5 题", fiveQs.length === 5, `confirmed=${commitRes.readback.confirmed.length}, readback=${fiveQs.length}`);

    // 2. 独立作答（3 对 2 错）→ 落盘 → 重载核对错题本
    const [qSingle, qMulti, qJudge, qFill, _qShort] = fiveQs;
    const prac = await app1.startSession(fiveQs, "daily", bank.id);
    const planAnswers: Array<[string, boolean]> = [
      ["A", false], // qSingle 正确答案 B，故意答 A -> 错 1
      ["AC", false], // qMulti 正确答案 ABC，故意少选 -> 错 2
      ["对", true], // qJudge -> 对
      ["100", true], // qFill -> 对
      ["进程分配资源，线程调度执行", true], // qShort -> 非空作答
    ];
    for (const [ans] of planAnswers) {
      const cur = prac.current!;
      const sub = prac.submit(ans, 900)!;
      recordSessionAttempt({ app: app1, session: prac, q: cur, submitResult: sub, timeMs: 900 });
      prac.next();
    }
    prac.finish();
    await app1.saveSession();
    await app1.flush();

    const { app: app2 } = await makeApp();
    const wrongsAfterPractice = app2.wrongItems().map((w) => w.qid);
    record(
      "4. 重载后错题本准确收录 2 道错题",
      wrongsAfterPractice.includes(qSingle.id) && wrongsAfterPractice.includes(qMulti.id) && wrongsAfterPractice.length === 2,
      `wrongQids=${wrongsAfterPractice.length}`,
    );

    // 3. 错题复练与“受助答对不算消灭”跨重载验证
    // 3a) 对 qSingle 先独立答对 1 次（距离消灭阈值 2 还差 1 次）
    const wb1 = await app2.startSession([qSingle], "wrong", bank.id);
    const try1 = wb1.submit("B", 800)!;
    recordSessionAttempt({ app: app2, session: wb1, q: qSingle, submitResult: try1, timeMs: 800 });
    wb1.finish();
    await app2.saveSession();
    await app2.flush();

    // 3b) 第二次作答前展开提示 + 写草稿，未提交即重载思源
    const wb2 = await app2.startSession([qSingle], "wrong", bank.id);
    wb2.addExposure(qSingle.id, "hint");
    wb2.setScratchpad({ store: { [qSingle.id]: "传输层可靠协议=TCP" }, sharedText: "", mode: "per_question" });
    await app2.saveSession();
    await app2.flush();

    const { app: app3 } = await makeApp();
    const resumedWb = await app3.resumeSession(async () => [qSingle], bank.id);
    const hintSurvived = resumedWb?.helpModeOf(qSingle.id) === "hint" && resumedWb?.getScratchpad().store[qSingle.id] === "传输层可靠协议=TCP";
    record("5. 中途重载后受助提示标记与草稿完整恢复", Boolean(hintSurvived));

    const tryAssisted = resumedWb!.submit("B", 1000)!;
    recordSessionAttempt({
      app: app3,
      session: resumedWb!,
      q: qSingle,
      submitResult: tryAssisted,
      timeMs: 1000,
      helpMode: resumedWb!.helpModeOf(qSingle.id),
      exposures: resumedWb!.getExposures(qSingle.id),
    });
    resumedWb!.finish();
    await app3.saveSession();
    await app3.flush();
    const stillActiveAfterAssisted = app3.wrongItems().some((w) => w.qid === qSingle.id);
    record("6. 受助答对不计入消灭：错题仍在册", stillActiveAfterAssisted);

    // 3c) 第三次无提示独立答对 -> 达成独立连对 2 次，正式移出活跃错题本
    const wb3 = await app3.startSession([qSingle], "wrong", bank.id);
    const tryIndependent = wb3.submit("B", 750)!;
    recordSessionAttempt({ app: app3, session: wb3, q: qSingle, submitResult: tryIndependent, timeMs: 750 });
    wb3.finish();
    await app3.saveSession();
    await app3.flush();
    const eliminatedNow = !app3.wrongItems().some((w) => w.qid === qSingle.id) && app3.wrongItems().some((w) => w.qid === qMulti.id);
    record("7. 随后无提示独立答对正式消灭错题（剩 1 题在册）", eliminatedNow, `activeWrongs=${app3.wrongItems().length}`);

    // 4. 模考暂停 → 重载恢复 → 交卷 → 报告口径核对
    const objectiveQs = [qSingle, qMulti, qJudge, qFill];
    const bp = {
      id: "bp-journey",
      name: "真机旅程模考卷",
      durationS: 1800,
      passLine: 60,
      shuffleOptions: false,
      sectionTimed: false,
      sections: defaultMockSections(objectiveQs),
    };
    const assembled = assemble(bp, objectiveQs);
    const startedAt = Date.now() - 5000;
    const mock1 = new MockSession(bp, assembled.paper, { sectionOf: assembled.sectionOf, scoreOf: assembled.scoreOf }, startedAt);
    mock1.setAnswer(qSingle.id, "B", startedAt + 1000);
    mock1.setAnswer(qJudge.id, "对", startedAt + 2000);
    const snap = mock1.toSnapshot(`run-${tag}`, startedAt + 2500);
    snap.scratchpad = { store: { [qSingle.id]: "模考演算草稿" }, sharedText: "", mode: "per_question" };
    await app3.saveMockRun(snap);

    const { app: app4 } = await makeApp();
    const loadedSnap = await app4.loadMockRun();
    const restoredMock = loadedSnap ? MockSession.restore(loadedSnap, objectiveQs) : null;
    record(
      "8. 模考中断重载恢复同一场进度与草稿",
      Boolean(restoredMock && restoredMock.session.answers.get(qSingle.id)?.answer === "B" && loadedSnap?.scratchpad?.store[qSingle.id] === "模考演算草稿"),
    );

    restoredMock!.session.setAnswer(qMulti.id, "ABC", Date.now());
    restoredMock!.session.setAnswer(qFill.id, "100", Date.now());
    restoredMock!.session.submit(Date.now());
    const mockScore = restoredMock!.session.score();
    for (const a of restoredMock!.session.answers.values()) {
      app4.recordAttempt({
        qid: a.qid,
        kind: "mock",
        mode: "paper",
        verdict: a.verdict,
        myAnswer: a.answer,
        timeMs: 1000,
        sessionId: snap.runId,
        examId: snap.runId,
        queue: "normal",
      });
    }
    await app4.flush();
    await app4.saveMockResult({
      id: bp.id,
      runId: snap.runId,
      name: bp.name,
      startedAt,
      total: mockScore.total,
      full: mockScore.full,
      percent: mockScore.percent,
      pass: mockScore.pass,
      sections: mockScore.sections.map((s) => ({ name: s.name, score: s.score, full: s.full, correct: s.correct, total: s.total })),
    });
    await app4.clearMockRun();

    // 5. 最终全新实例核对报告与成绩持久化
    const { app: app5 } = await makeApp();
    const mockHistory = await app5.listMockResults();
    const allEvents = app5.attempts.all();
    const d = app5.derived();
    const exp = exposureStats(allEvents);
    const mastery = masteryByKp(fiveQs, d.byQuestion, allEvents);
    record(
      "9. 模考交卷成绩与复盘受助/独立报告口径一致",
      mockHistory.length === 1 && mockHistory[0].percent === 100 && exp.assisted === 1 && exp.nodes.hint === 1 && mastery.length >= 4 && (await app5.loadMockRun()) === null,
      `mockPct=${mockHistory[0]?.percent}%, assisted=${exp.assisted}, independent=${exp.independent}, kpGroups=${mastery.length}`,
    );
  } finally {
    if (createdBankId) {
      await fetch(`${base}/api/notebook/removeNotebook`, {
        method: "POST",
        headers: { Authorization: `Token ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ notebook: createdBankId }),
      }).catch(() => undefined);
    }
    await storage.removeRoot();
  }

  const passed = results.filter(Boolean).length;
  console.log(`\n========== 真内核完整旅程验收 ==========\n${passed === results.length ? "全部通过" : "存在失败项"}（${passed}/${results.length}）`);
  return passed === results.length ? 0 : 1;
}
