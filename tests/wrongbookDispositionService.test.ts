import { describe, it, expect, vi } from "vitest";
import {
  archiveWrongItem,
  unarchiveWrongItem,
  snoozeWrongItem,
  restoreWrongItemToActive,
  markWrongMastered,
  extractWrongQueueKpOptions,
  extractWrongQueueTagOptions,
  filterAndSortWrongQueue,
} from "@/ui/practice/services/wrongbookDispositionService";
import type { Question } from "@/core/types";
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

  it("4. extractWrongQueueKpOptions 与 filterAndSortWrongQueue：错题考点提取与多条件组合过滤排序", () => {
    const qMap = new Map<string, Question>([
      ["q-1", { id: "q-1", kp: "代数/一次方程" } as any],
      ["q-2", { id: "q-2", kp: "几何/三角形" } as any],
      ["q-3", { id: "q-3", kp: "代数/不等式" } as any],
    ]);

    const wrongQueue = [
      { qid: "q-1", wrongCount: 3, lastWrongAt: 100 },
      { qid: "q-2", wrongCount: 1, lastWrongAt: 200 },
      { qid: "q-3", wrongCount: 5, lastWrongAt: 300 },
    ];

    // 1. 考点根选项提取
    const kpOptions = extractWrongQueueKpOptions(wrongQueue, qMap);
    expect(kpOptions).toEqual(["代数", "几何"]);

    // 2. 考点前缀筛选
    const filteredKp = filterAndSortWrongQueue(wrongQueue, qMap, () => "careless", {
      reasonFilter: "all",
      filterStubborn: false,
      kpFilter: "代数",
      sortMode: "default",
    });
    expect(filteredKp).toHaveLength(2);
    expect(filteredKp.map((x) => x.qid)).toEqual(["q-1", "q-3"]);

    // 3. 按错误次数排序
    const sorted = filterAndSortWrongQueue(wrongQueue, qMap, () => "careless", {
      reasonFilter: "all",
      filterStubborn: false,
      kpFilter: "",
      sortMode: "wrongCount",
    });
    expect(sorted[0].qid).toBe("q-3"); // wrongCount: 5
    expect(sorted[1].qid).toBe("q-1"); // wrongCount: 3
    expect(sorted[2].qid).toBe("q-2"); // wrongCount: 1

    // 4. 默认排序下高危盲区 (highriskQids) 自动置顶
    const pinned = filterAndSortWrongQueue(wrongQueue, qMap, () => "careless", {
      reasonFilter: "all",
      filterStubborn: false,
      kpFilter: "",
      sortMode: "default",
      highriskQids: new Set(["q-2"]),
    });
    expect(pinned.map((x) => x.qid)).toEqual(["q-2", "q-1", "q-3"]);

    // 5. CAND-02: 提取错题队列标签与专场标签过滤
    (qMap.get("q-1") as any).userTags = ["mock-run-20261101", "star"];
    (qMap.get("q-2") as any).userTags = ["trap"];
    const tagOptions = extractWrongQueueTagOptions(wrongQueue, qMap);
    expect(tagOptions).toEqual(["mock-run-20261101", "star", "trap"]);

    const filteredTag = filterAndSortWrongQueue(wrongQueue, qMap, () => "careless", {
      reasonFilter: "all",
      filterStubborn: false,
      kpFilter: "",
      tagFilter: "mock-run-20261101",
      sortMode: "default",
    });
    expect(filteredTag).toHaveLength(1);
    expect(filteredTag[0].qid).toBe("q-1");
  });
});
