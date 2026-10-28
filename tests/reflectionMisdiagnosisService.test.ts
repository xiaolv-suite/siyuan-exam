import { describe, it, expect, vi } from "vitest";
import {
  editQuestionReflection,
  loadSessionReflections,
  queryAttemptMeta,
  executeMisdiagnosisTask,
  mergeAdoptedMisdiagnosis,
} from "@/ui/practice/services/reflectionMisdiagnosisService";
import type { ExamApp } from "@/app";
import type { Question } from "@/core/types";
import type { KernelApiClient } from "@/kernel/client";

vi.mock("@/libs/dialog", () => ({
  inputDialogSync: vi.fn().mockResolvedValue("新的自诊断反思"),
}));

describe("自诊断复盘与错因假设服务 (reflectionMisdiagnosisService)", () => {
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

  it("1. editQuestionReflection：弹窗输入并保存复盘", async () => {
    const mockApp = {
      loadWrongReflection: vi.fn().mockResolvedValue({ text: "旧反思" }),
      saveWrongReflection: vi.fn().mockResolvedValue(undefined),
    } as unknown as ExamApp;
    const t = (k: string) => `[${k}]`;

    const res = await editQuestionReflection(mockApp, "q-1", t);
    expect(res).not.toBeNull();
    expect(res?.text).toBe("新的自诊断反思");
    expect(mockApp.saveWrongReflection).toHaveBeenCalledWith("q-1", "新的自诊断反思");
  });

  it("2. loadSessionReflections 与 queryAttemptMeta：提取会话反思与流水元信息", async () => {
    const mockApp = {
      loadWrongReflection: vi.fn().mockResolvedValue({ text: "反思A", at: 1000 }),
      attempts: {
        all: () => [
          { qid: "q-1", sessionId: "sess-1", confidence: "sure" as const, help: "hint" },
        ],
      },
    } as unknown as ExamApp;

    // 1. 加载反思
    const refs = await loadSessionReflections(
      mockApp,
      [{ qid: "q-1", grade: { verdict: "wrong" } }],
      () => false,
    );
    expect(refs["q-1"]?.text).toBe("反思A");

    // 2. 提取流水作答元信息
    const meta = queryAttemptMeta(mockApp, "sess-1", "q-1");
    expect(meta.confidence).toBe("sure");
    expect(meta.helped).toBe(true);
  });

  it("3. executeMisdiagnosisTask 与 mergeAdoptedMisdiagnosis：执行 AI 错因并采纳合并", async () => {
    const mockApp = {
      saveMisdiagnosis: vi.fn().mockResolvedValue(undefined),
      loadWrongReflection: vi.fn().mockResolvedValue({ text: "用户自主反思" }),
      saveWrongReflection: vi.fn().mockResolvedValue(undefined),
      markMisdiagnosisAdopted: vi.fn().mockResolvedValue(undefined),
    } as unknown as ExamApp;

    const mockClient = {
      aiChat: vi.fn().mockResolvedValue({
        status: "ok",
        content: "假设：审题遗漏否定词",
      }),
    } as unknown as KernelApiClient;

    const t = (k: string) => `[${k}]`;
    const msgs: string[] = [];
    const showMessage = (m: string) => msgs.push(m);

    // 1. 生成错因
    const res = await executeMisdiagnosisTask({
      q: fakeQuestion,
      myAnswer: "B",
      timeMs: 5000,
      sessionId: "sess-1",
      meta: { confidence: "sure", helped: false },
      client: mockClient,
      aiConfig: {},
      app: mockApp,
      t,
    });
    expect(res.channelId).toBe("siyuan");
    expect(res.text).toBe("假设：审题遗漏否定词");

    // 2. 采纳合并
    const merged = await mergeAdoptedMisdiagnosis(mockApp, "q-1", res.text, t, showMessage);
    expect(merged.text).toContain("用户自主反思");
    expect(merged.text).toContain("假设：审题遗漏否定词");
    expect(mockApp.saveWrongReflection).toHaveBeenCalled();
    expect(msgs).toContain("[reflection.saved]");
  });
});
