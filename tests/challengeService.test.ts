import { describe, it, expect, vi } from "vitest";
import {
  buildChallengePaper,
  copyChallengeCode,
  parseAndStartChallenge,
} from "@/ui/practice/services/challengeService";
import type { Question } from "@/core/types";
import type { ExamApp } from "@/app";

describe("考霸挑战赛服务 (challengeService)", () => {
  const fakeQuestions: Question[] = [
    {
      id: "q-1",
      type: "single",
      stem: "题目一",
      options: ["A", "B"],
      answer: "A",
      kp: "数学/几何",
      status: "published",
      origin: "manual",
      hash: "h-1",
    },
    {
      id: "q-2",
      type: "material",
      stem: "材料大题",
      options: [],
      answer: "",
      status: "published",
      origin: "manual",
      hash: "h-2",
    },
  ];

  it("1. buildChallengePaper：过滤 material 题型并封装为 50 题限时卷", () => {
    const paper = buildChallengePaper(fakeQuestions, "数学冲刺库");
    expect(paper.v).toBe(1);
    expect(paper.title).toBe("数学冲刺库 挑战");
    expect(paper.durationS).toBe(600);
    expect(paper.questions).toHaveLength(1);
    expect(paper.questions[0].stem).toBe("题目一");
  });

  it("2. copyChallengeCode：空题库提示与剪贴板复制", async () => {
    const msgs: string[] = [];
    const showMessage = (m: string) => msgs.push(m);
    const t = (k: string) => `[${k}]`;

    // 1. 空题库
    await copyChallengeCode([], "空库", showMessage, t);
    expect(msgs).toContain("[state.emptyBank]");

    // 2. 有题目时写入剪贴板
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    await copyChallengeCode(fakeQuestions, "数学冲刺库", showMessage, t);
    expect(writeTextMock).toHaveBeenCalled();
    expect(msgs).toContain("[challenge.copied]");

    vi.unstubAllGlobals();
  });

  it("3. parseAndStartChallenge：解析挑战码并开启会话", async () => {
    const { encodeChallengeCopy } = await import("@/core/challenge");
    const paper = buildChallengePaper(fakeQuestions, "数学冲刺库");
    const rawCopy = encodeChallengeCopy(paper);
    // 提取纯 Base64 或代码段
    const codeMatch = rawCopy.match(/```lv-exam-challenge\s*([\s\S]*?)```/) || rawCopy.match(/lv-challenge-v1:([A-Za-z0-9+/=]+)/);
    const code = codeMatch ? (codeMatch[1] || codeMatch[0]) : rawCopy;

    const mockSession = { id: "s-challenge-1" };
    const mockApp = {
      startSession: vi.fn().mockResolvedValue(mockSession),
    } as unknown as ExamApp;

    const t = (k: string) => `[${k}]`;

    const session = await parseAndStartChallenge(mockApp, code, "bank-1", t);
    expect(session).toBe(mockSession);
    expect(mockApp.startSession).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ stem: "题目一" })]),
      "challenge",
      "bank-1",
    );
  });
});
