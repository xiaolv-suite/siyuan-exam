import { describe, it, expect, vi } from "vitest";
import {
  exportWrongbookToDoc,
  syncBankQuestionsToDoc,
  copyTodayStudyReport,
} from "@/ui/practice/services/bankDocSyncService";
import type { ExamApp } from "@/app";

describe("题库文档双向同步与错题报告导出服务 (bankDocSyncService)", () => {
  it("1. exportWrongbookToDoc：成功导出与离线异常处理", async () => {
    const msgs: string[] = [];
    const showMessage = (m: string) => msgs.push(m);
    const t = (k: string) => `[${k}]`;

    // 1. 成功导出
    const mockApp = {
      exportWrongbook: vi.fn().mockResolvedValue("doc-wrong-1"),
    } as unknown as ExamApp;

    const docId = await exportWrongbookToDoc(mockApp, "b-1", "高数题库", {}, showMessage, false, t);
    expect(docId).toBe("doc-wrong-1");
    expect(msgs).toContain("[export.done]");

    // 2. 导出失败
    const failApp = {
      exportWrongbook: vi.fn().mockRejectedValue(new Error("网络离线")),
    } as unknown as ExamApp;

    const nullId = await exportWrongbookToDoc(failApp, "b-1", "高数题库", {}, showMessage, true, t);
    expect(nullId).toBeNull();
    expect(msgs[1]).toBe("[state.offlineHint]");
  });

  it("2. syncBankQuestionsToDoc：同步题库到思源笔记文档", async () => {
    const msgs: string[] = [];
    const showMessage = (m: string) => msgs.push(m);
    const t = (k: string) => `[${k}]`;

    const mockApp = {
      syncBankToLocalDocs: vi.fn().mockResolvedValue(undefined),
    } as unknown as ExamApp;

    await syncBankQuestionsToDoc(mockApp, "b-1", "英语题库", showMessage, t);
    expect(mockApp.syncBankToLocalDocs).toHaveBeenCalledWith("b-1", "英语题库");
    expect(msgs).toContain("[sync.docsDone]");
  });

  it("3. copyTodayStudyReport：复制今日学习报告 Markdown 到剪贴板", async () => {
    const msgs: string[] = [];
    const showMessage = (m: string) => msgs.push(m);
    const t = (k: string) => `[${k}]`;

    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    await copyTodayStudyReport(
      {
        bankName: "综合库",
        todayDone: 20,
        dailyGoal: 20,
        goalPct: 100,
        streakDays: 5,
        wrongCount: 2,
        eliminatedCount: 10,
        clearPct: 83,
        planAdvice: "继续保持冲刺状态",
      },
      showMessage,
      t,
    );
    expect(writeTextMock).toHaveBeenCalled();
    expect(msgs[0]).toContain("[entry.reportCopied]");

    vi.unstubAllGlobals();
  });

  it("4. extractKpRoots：考点一级根节点去重提取", async () => {
    const { extractKpRoots } = await import("@/ui/practice/services/bankDocSyncService");
    const questions = [
      { kp: "数学/代数/一次方程" },
      { kp: "数学/几何/三角形" },
      { kp: "物理/力学" },
      { kp: "" },
      {},
    ];
    const roots = extractKpRoots(questions);
    expect(roots).toEqual(["数学", "物理"]);
  });
});
