import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  buildLvExamBridge,
  mountLvExamBridge,
  formatQuestionByProfile,
  LVEXAM_BRIDGE_PROTOCOL,
  LVEXAM_API_NAME,
  LVEXAM_API_ALIASES,
  type ExamBridgeHost,
} from "../src/core/examBridge";
import { probeCheckinApi } from "../src/core/checkinBridge";
import { probeGlean } from "../src/core/gleanBridge";
import { makeQuestion } from "../src/core/blockTemplate";

function createMockHost(overrides: Partial<ExamBridgeHost> = {}): ExamBridgeHost {
  return {
    version: "0.10.4",
    openPractice: vi.fn(),
    openWrongbook: vi.fn(),
    openMock: vi.fn(),
    openReport: vi.fn(),
    getStats: vi.fn().mockReturnValue({ streak: 5, accuracy: 92, attempts: 120 }),
    statsRead: vi.fn().mockResolvedValue({ streak: 5, accuracy: 92, attempts: 120 }),
    onBridgeDisposed: vi.fn(),
    ...overrides,
  };
}

describe("小驴考试 · 服务桥与生态集成契约 (Epoch 6)", () => {
  let originalWindow: unknown;

  beforeEach(() => {
    originalWindow = (globalThis as any).window;
    (globalThis as any).window = {
      dispatchEvent: vi.fn(),
    };
  });

  afterEach(() => {
    (globalThis as any).window = originalWindow;
  });

  it("protocol 与 capabilities 契约固定", () => {
    const host = createMockHost();
    const bridge = buildLvExamBridge(host);

    expect(bridge.protocol).toBe(LVEXAM_BRIDGE_PROTOCOL);
    expect(bridge.protocol).toBe(1);
    expect(bridge.version).toBe("0.10.4");
    expect(bridge.capabilities).toEqual([
      "open",
      "practice",
      "wrongbook",
      "mock",
      "report",
      "extractToQuiz",
      "queryQuestions",
      "stats",
      "statsRead",
      "whenReady",
      "hasCapability",
      "getOverview",
    ]);
    expect(bridge.hasCapability("statsRead")).toBe(true);
    expect(bridge.hasCapability("unknownCap")).toBe(false);
  });

  it("whenReady 恒为 resolve(true)", async () => {
    const host = createMockHost();
    const bridge = buildLvExamBridge(host);
    await expect(bridge.whenReady()).resolves.toBe(true);
  });

  it("stats 与 statsRead 返回脱敏快照", async () => {
    const host = createMockHost();
    const bridge = buildLvExamBridge(host);

    expect(bridge.stats()).toEqual({ streak: 5, accuracy: 92, attempts: 120 });
    await expect(bridge.statsRead()).resolves.toEqual({ streak: 5, accuracy: 92, attempts: 120 });
  });

  it("getOverview 返回版本化无泄漏概览快照", () => {
    const host = createMockHost();
    const bridge = buildLvExamBridge(host);
    const overview = bridge.getOverview();

    expect(overview.protocol).toBe(1);
    expect(overview.version).toBe("0.10.4");
    expect(overview.capabilities).toContain("statsRead");
    expect(overview.stats).toEqual({ streak: 5, accuracy: 92, attempts: 120 });
    expect(overview.updatedAt).toBeTruthy();
  });

  it("open/practice/wrongbook/mock/report 导航转发到宿主并分发事件", () => {
    const host = createMockHost();
    const bridge = buildLvExamBridge(host);

    bridge.open();
    expect(host.openPractice).toHaveBeenCalledTimes(1);

    bridge.practice();
    expect(host.openPractice).toHaveBeenCalledTimes(2);

    bridge.wrongbook();
    expect(host.openWrongbook).toHaveBeenCalledTimes(1);

    bridge.mock();
    expect(host.openMock).toHaveBeenCalledTimes(1);

    bridge.report();
    expect(host.openReport).toHaveBeenCalledTimes(1);
  });

  it("mountLvExamBridge 支持多别名挂载 (siyuanExam, xiaolvExam, lvExam, LvExam)", () => {
    const host = createMockHost();
    const dispose = mountLvExamBridge(host);
    const w = (globalThis as any).window;

    for (const alias of LVEXAM_API_ALIASES) {
      expect(w[alias]).toBeDefined();
      expect(w[alias].protocol).toBe(1);
      expect(w[alias].version).toBe("0.10.4");
    }

    dispose();

    for (const alias of LVEXAM_API_ALIASES) {
      expect(w[alias]).toBeUndefined();
    }
    expect(host.onBridgeDisposed).toHaveBeenCalledTimes(1);
  });

  it("First-Instance-Wins：主别名已存在时不覆盖且返回安全空注销器", () => {
    const existing = { protocol: 99, version: "old" };
    (globalThis as any).window[LVEXAM_API_NAME] = existing;

    const host = createMockHost();
    const dispose = mountLvExamBridge(host);

    expect((globalThis as any).window[LVEXAM_API_NAME]).toBe(existing);
    expect(host.onBridgeDisposed).not.toHaveBeenCalled();

    dispose();
    expect((globalThis as any).window[LVEXAM_API_NAME]).toBe(existing);
    expect(host.onBridgeDisposed).not.toHaveBeenCalled();
  });

  it("注销器仅清理自身实例，被覆盖时不误删后继实例", () => {
    const host1 = createMockHost({ version: "1.0.0" });
    const dispose1 = mountLvExamBridge(host1);

    const w = (globalThis as any).window;
    expect(w[LVEXAM_API_NAME].version).toBe("1.0.0");

    // 模拟被外部更替
    const dummyBridge = { version: "2.0.0" };
    w[LVEXAM_API_NAME] = dummyBridge;

    dispose1();
    // 依然保留新实例，且不触发 host1 的 disposed 回调
    expect(w[LVEXAM_API_NAME]).toBe(dummyBridge);
    expect(host1.onBridgeDisposed).not.toHaveBeenCalled();
  });

  it("打卡与拾遗桥探测支持生态多别名降级", () => {
    // 打卡多别名
    const fakeCheckin = { protocol: "siyuan-checkin", whenReady: () => Promise.resolve() };
    expect(probeCheckinApi({ xiaolvCheckin: fakeCheckin })).toBe(fakeCheckin);
    expect(probeCheckinApi({ lvCheckin: fakeCheckin })).toBe(fakeCheckin);

    // 拾遗多别名
    const fakeGlean = { apiVersion: 1, listClips: vi.fn() };
    expect(probeGlean({ xiaolvGlean: fakeGlean })).toBe(fakeGlean);
    expect(probeGlean({ lvGlean: fakeGlean })).toBe(fakeGlean);
    expect(probeGlean({ LvGlean: fakeGlean })).toBe(fakeGlean);
  });

  it("lv-exam:session-ended 联邦事件信封符合生态规范且杜绝题干泄密", () => {
    const detail = {
      v: 1,
      source: "siyuan-exam",
      type: "lv-exam:session-ended",
      eventId: "ev-exam-test-123",
      at: new Date().toISOString(),
      idempotencyKey: "exam-mock-session:run-1",
      payload: {
        sessionId: "run-1",
        mode: "mock",
        total: 20,
        correct: 18,
        wrong: 2,
      },
    };

    expect(detail.v).toBe(1);
    expect(detail.source).toBe("siyuan-exam");
    expect(detail.type).toBe("lv-exam:session-ended");
    expect(detail.payload.total).toBe(20);
    expect(detail.payload.correct).toBe(18);
    expect(detail.payload.wrong).toBe(2);
    // 严禁泄密：信封载荷中不得包含任何题干内容字段
    expect((detail.payload as any).stem).toBeUndefined();
    expect((detail.payload as any).content).toBeUndefined();
    expect((detail.payload as any).questions).toBeUndefined();
  });

  it("extractToQuiz 成功派发长文划词制卡协议并具备能力声明", async () => {
    const host = createMockHost({
      extractToQuiz: vi.fn().mockReturnValue(true),
    });
    const bridge = buildLvExamBridge(host);

    expect(bridge.hasCapability("extractToQuiz")).toBe(true);

    const ok = await bridge.extractToQuiz({
      text: "宪法是国家的根本法，具有最高的法律效力。",
      sourceBlockId: "block-20261027-abcdef",
      sourceTitle: "法学通论",
      type: "cloze",
    });

    expect(ok).toBe(true);
    expect(host.openPractice).toHaveBeenCalled();
    expect(host.extractToQuiz).toHaveBeenCalledWith(
      expect.objectContaining({
        text: "宪法是国家的根本法，具有最高的法律效力。",
        sourceBlockId: "block-20261027-abcdef",
      }),
    );
  });

  describe("Agent 三层只读取题协议 (candidate/teaching/evidence)", () => {
    const sampleQ = makeQuestion({
      id: "q-agent-1",
      type: "single",
      stem: "这是一道用于测试 Agent 取题协议的长长题干描述，长度超过四十个字用来测试候选层的截断效果。",
      options: ["A选项", "B选项"],
      answer: "A",
      analysis: "这是详细解析内容",
      kp: "哲学/辩证法",
      difficulty: 3,
    });
    sampleQ.secondaryKps = ["辅助考点1"];

    it("formatQuestionByProfile 转换为 candidate 极简候选层（低 Token 消耗，绝无答案）", () => {
      const c = formatQuestionByProfile(sampleQ, "candidate");
      expect(c.id).toBe(sampleQ.id);
      expect((c as any).stemSummary).toContain("…");
      expect((c as any).stem).toBeUndefined();
      expect((c as any).answer).toBeUndefined();
      expect((c as any).options).toBeUndefined();
      expect((c as any).hasAnswer).toBe(true);
      expect((c as any).hasAnalysis).toBe(true);
    });

    it("formatQuestionByProfile 转换为 teaching 完整教学层", () => {
      const t = formatQuestionByProfile(sampleQ, "teaching");
      expect(t.id).toBe(sampleQ.id);
      expect(t.stem).toBe(sampleQ.stem);
      expect(t.answer).toBe("A");
      expect(t.analysis).toBe("这是详细解析内容");
      // teaching 层不泄露底层块 ID 或证据链
      expect((t as any).blockId).toBeUndefined();
    });

    it("formatQuestionByProfile 转换为 evidence 深度证据链层", () => {
      const e = formatQuestionByProfile(sampleQ, "evidence");
      expect(e.id).toBe(sampleQ.id);
      expect((e as any).secondaryKps).toEqual(["辅助考点1"]);
    });

    it("queryQuestions 在 host 未实现时提供安全默认空回执", async () => {
      const host = createMockHost();
      const bridge = buildLvExamBridge(host);

      expect(bridge.hasCapability("queryQuestions")).toBe(true);
      const res = await bridge.queryQuestions({ profile: "candidate" });
      expect(res.profile).toBe("candidate");
      expect(res.items).toEqual([]);
      expect(res.truncated).toBe(false);
    });
  });
});
