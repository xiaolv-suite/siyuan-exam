// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import {
  executeLoadQuestionRevisions,
  executeRestoreQuestionRevision,
} from "@/ui/practice/services/questionRevisionService";
import type { ExamApp } from "@/app";
import type { Question } from "@/core/types";
import type { QuestionRevision } from "@/core/revision";

vi.mock("@/libs/dialog", () => ({
  confirmDialogSync: vi.fn(),
}));

describe("试题版本历史与回滚服务 (questionRevisionService)", () => {
  const dummyT = (k: string) => `[${k}]`;
  const mockShowMessage = vi.fn();

  const fakeQuestion: Question & { blockId: string } = {
    id: "q-101",
    blockId: "blk-101",
    type: "single",
    stem: "旧题干内容",
    options: ["A", "B", "C", "D"],
    answer: "A",
    status: "published",
    origin: "manual",
    hash: "h-101",
  };

  const fakeRevision: QuestionRevision = {
    revId: "rev-1",
    ts: 1600000000000,
    author: "user",
    action: "edit",
    stem: "新题干内容",
    options: ["A", "B", "C", "D"],
    answer: "B",
    summary: "修正答案为B",
  };

  it("1. executeLoadQuestionRevisions：调用底层加载单题历史列表", async () => {
    const mockApp = {
      questionRevisions: vi.fn().mockResolvedValue([fakeRevision]),
    } as unknown as ExamApp;

    const res = await executeLoadQuestionRevisions(mockApp, "q-101");
    expect(res).toEqual([fakeRevision]);
    expect(mockApp.questionRevisions).toHaveBeenCalledWith("q-101");
  });

  it("2. executeRestoreQuestionRevision：用户取消回滚确认弹窗", async () => {
    const { confirmDialogSync } = await import("@/libs/dialog");
    vi.mocked(confirmDialogSync).mockResolvedValueOnce(false);

    const mockApp = {
      updateQuestionContent: vi.fn(),
      questionRevisions: vi.fn(),
    } as unknown as ExamApp;

    const res = await executeRestoreQuestionRevision({
      app: mockApp,
      q: fakeQuestion,
      rev: fakeRevision,
      t: dummyT,
      showMessage: mockShowMessage,
    });

    expect(res.cancelled).toBe(true);
    expect(mockApp.updateQuestionContent).not.toHaveBeenCalled();
  });

  it("3. executeRestoreQuestionRevision：确认回滚（带 summary）写入并重新载入", async () => {
    const { confirmDialogSync } = await import("@/libs/dialog");
    vi.mocked(confirmDialogSync).mockResolvedValueOnce(true);

    const updatedPartial = { answer: "B", stem: "新题干内容" };
    const mockApp = {
      updateQuestionContent: vi.fn().mockResolvedValue(updatedPartial),
      questionRevisions: vi.fn().mockResolvedValue([fakeRevision]),
    } as unknown as ExamApp;

    const res = await executeRestoreQuestionRevision({
      app: mockApp,
      q: fakeQuestion,
      rev: fakeRevision,
      t: dummyT,
      showMessage: mockShowMessage,
    });

    expect(res.cancelled).toBeUndefined();
    expect(res.next).toEqual(updatedPartial);
    expect(res.reloaded).toEqual([fakeRevision]);
    expect(mockApp.updateQuestionContent).toHaveBeenCalled();
    expect(mockShowMessage).toHaveBeenCalledWith("[rev.restored]", 2400, "info");
  });

  it("4. executeRestoreQuestionRevision：确认回滚（无 summary 走 answer 转义）并容忍重读失败", async () => {
    const { confirmDialogSync } = await import("@/libs/dialog");
    vi.mocked(confirmDialogSync).mockResolvedValueOnce(true);

    const revWithoutSummary: QuestionRevision = {
      ...fakeRevision,
      summary: undefined,
      answer: "<b>C</b>",
    };

    const mockApp = {
      updateQuestionContent: vi.fn().mockResolvedValue({ answer: "C" }),
      questionRevisions: vi.fn().mockRejectedValue(new Error("网络超时")),
    } as unknown as ExamApp;

    const res = await executeRestoreQuestionRevision({
      app: mockApp,
      q: fakeQuestion,
      rev: revWithoutSummary,
      t: dummyT,
      showMessage: mockShowMessage,
    });

    expect(res.next).toEqual({ answer: "C" });
    expect(res.reloaded).toBeUndefined();
    expect(mockShowMessage).toHaveBeenCalledWith("[rev.restored]", 2400, "info");
  });
});
