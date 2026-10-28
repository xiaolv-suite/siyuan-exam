import { describe, it, expect, vi } from "vitest";
import {
  archiveWrongItem,
  unarchiveWrongItem,
  snoozeWrongItem,
  restoreWrongItemToActive,
  markWrongMastered,
} from "@/ui/practice/services/wrongbookDispositionService";
import type { ExamApp } from "@/app";

describe("错题归档与延期处置服务 (wrongbookDispositionService)", () => {
  it("1. archiveWrongItem 与 unarchiveWrongItem：归档与恢复生命周期", async () => {
    const msgs: string[] = [];
    const showMessage = (m: string) => msgs.push(m);
    const t = (k: string) => `[${k}]`;

    const mockApp = {
      archiveWrong: vi.fn().mockResolvedValue(undefined),
      unarchiveWrong: vi.fn().mockResolvedValue(undefined),
    } as unknown as ExamApp;

    await archiveWrongItem(mockApp, "q-1", showMessage, t);
    expect(mockApp.archiveWrong).toHaveBeenCalledWith("q-1");
    expect(msgs).toContain("[wrongbook.archivedSuccess]");

    await unarchiveWrongItem(mockApp, "q-1", showMessage, t);
    expect(mockApp.unarchiveWrong).toHaveBeenCalledWith("q-1");
    expect(msgs).toContain("[wrongbook.unarchivedSuccess]");
  });

  it("2. snoozeWrongItem 与 restoreWrongItemToActive：延期与重新收录", async () => {
    const msgs: string[] = [];
    const showMessage = (m: string) => msgs.push(m);
    const t = (k: string) => `[${k}]`;

    const mockApp = {
      snoozeWrong: vi.fn().mockResolvedValue(undefined),
      setWrongStatus: vi.fn().mockResolvedValue(undefined),
    } as unknown as ExamApp;

    await snoozeWrongItem(mockApp, "q-1", 7, showMessage, t);
    expect(mockApp.snoozeWrong).toHaveBeenCalledWith("q-1", 7);
    expect(msgs).toContain("[wrongbook.snoozeDone]");

    await restoreWrongItemToActive(mockApp, "q-1", showMessage);
    expect(mockApp.setWrongStatus).toHaveBeenCalledWith("q-1", "active");
    expect(msgs).toContain("已将该题重新收录入在册错题库");
  });

  it("3. markWrongMastered：手动标记已掌握成功与离线异常处理", async () => {
    const msgs: string[] = [];
    const showMessage = (m: string) => msgs.push(m);
    const t = (k: string) => `[${k}]`;

    // 1. 成功标掌握
    const mockApp = {
      setWrongStatus: vi.fn().mockResolvedValue(undefined),
    } as unknown as ExamApp;
    await markWrongMastered(mockApp, "q-1", showMessage, t, false);
    expect(mockApp.setWrongStatus).toHaveBeenCalledWith("q-1", "mastered");
    expect(msgs).toContain("[wrongbook.masteredDone]");

    // 2. 失败异常提示
    const failApp = {
      setWrongStatus: vi.fn().mockRejectedValue(new Error("网络未连通")),
    } as unknown as ExamApp;
    await markWrongMastered(failApp, "q-1", showMessage, t, false);
    expect(msgs[1]).toContain("[wrongbook.masterFailed]");
  });
});
