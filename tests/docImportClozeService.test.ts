import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  searchSiyuanDocCandidates,
  extractFromSingleSiyuanDoc,
  extractFromBatchSiyuanDocs,
  parseClozeItems,
  assembleClozeImportReport,
  checkImportCheckpointAux,
  discardImportCheckpointAux,
  buildResumeCheckpointReport,
  toggleClozeSupportMode,
  toggleSelectAllDocCandidates,
} from "@/ui/practice/services/docImportClozeService";
import type { ImportReport, ImportCheckpoint } from "@/importer/pipeline";

describe("docImportClozeService", () => {
  const dummyT = (k: string) => `[${k}]`;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("searchSiyuanDocCandidates", () => {
    it("returns empty array when query is blank or app is null", async () => {
      expect(await searchSiyuanDocCandidates(null, "数学")).toEqual([]);
      expect(await searchSiyuanDocCandidates({} as any, "   ")).toEqual([]);
    });

    it("searches docs through app", async () => {
      const mockCandidates = [
        { id: "doc-1", title: "高等数学导数", hpath: "/数学/高数", box: "box-1" },
      ];
      const mockApp = { searchSiyuanDocs: vi.fn().mockResolvedValue(mockCandidates) };

      const res = await searchSiyuanDocCandidates(mockApp, "导数");
      expect(mockApp.searchSiyuanDocs).toHaveBeenCalledWith("导数");
      expect(res).toEqual(mockCandidates);
    });
  });

  describe("extractFromSingleSiyuanDoc", () => {
    it("returns error result on invalid args", async () => {
      const res = await extractFromSingleSiyuanDoc(null, "", "测试");
      expect(res.isError).toBe(true);
      expect(res.report).toBeNull();
    });

    it("returns questions when extraction succeeds", async () => {
      const mockReport: ImportReport = {
        ok: [{ id: "q-1", type: "single", stem: "测试题" } as any],
        errors: [],
        duplicates: 0,
        batch: "b-1",
      };
      const mockApp = { importFromSiyuanDoc: vi.fn().mockResolvedValue(mockReport) };

      const res = await extractFromSingleSiyuanDoc(mockApp, "doc-1", "高考题库");
      expect(res.isError).toBe(false);
      expect(res.report).toEqual(mockReport);
      expect(res.message).toContain("高考题库");
      expect(res.message).toContain("1 道试题");
    });

    it("gives helpful message when no questions found", async () => {
      const emptyReport: ImportReport = {
        ok: [],
        errors: [{ row: 1, raw: "", reason: "缺少 ANSWER 行" }],
        duplicates: 0,
        batch: "b-1",
      };
      const mockApp = { importFromSiyuanDoc: vi.fn().mockResolvedValue(emptyReport) };

      const res = await extractFromSingleSiyuanDoc(mockApp, "doc-1", "普通笔记");
      expect(res.isError).toBe(false);
      expect(res.report).toBeNull();
      expect(res.message).toContain("未检索到题目内容");
    });
  });

  describe("extractFromBatchSiyuanDocs", () => {
    it("returns error result on empty docIds", async () => {
      const res = await extractFromBatchSiyuanDocs({} as any, []);
      expect(res.isError).toBe(true);
      expect(res.message).toBe("未选择任何文档");
    });

    it("extracts questions from batch doc ids", async () => {
      const mockReport: ImportReport = {
        ok: [
          { id: "q-1", type: "single", stem: "题1" } as any,
          { id: "q-2", type: "single", stem: "题2" } as any,
        ],
        errors: [],
        duplicates: 0,
        batch: "b-batch",
      };
      const mockApp = { importFromSiyuanDocBatch: vi.fn().mockResolvedValue(mockReport) };

      const res = await extractFromBatchSiyuanDocs(mockApp, ["doc-1", "doc-2"]);
      expect(res.isError).toBe(false);
      expect(res.report).toEqual(mockReport);
      expect(res.message).toContain("2 篇文档");
      expect(res.message).toContain("2 道试题");
    });
  });

  describe("parseClozeItems and assembleClozeImportReport", () => {
    it("returns empty items when input is blank", () => {
      const res = parseClozeItems("   ", ["highlight"], dummyT);
      expect(res.items).toEqual([]);
      expect(res.emptyNotice).toBeUndefined();
    });

    it("parses highlighted text and assembles import report", () => {
      const text = "地球绕着==太阳==转动，月亮绕着{{地球}}公转。";
      const parseRes = parseClozeItems(text, ["highlight", "curly"], dummyT);
      expect(parseRes.items.length).toBeGreaterThan(0);

      const assembled = assembleClozeImportReport(parseRes.items);
      expect(assembled.count).toBe(parseRes.items.length);
      expect(assembled.report.ok).toHaveLength(parseRes.items.length);
      expect(assembled.report.batch).toContain("-cloze");
    });

    it("returns empty notice when no cloze patterns found", () => {
      const text = "这是一段没有任何挖空符号的纯文字";
      const parseRes = parseClozeItems(text, ["highlight"], dummyT);
      expect(parseRes.items).toEqual([]);
      expect(parseRes.emptyNotice).toBe("[cloze.empty]");
    });
  });

  describe("checkImportCheckpointAux and discardImportCheckpointAux", () => {
    it("loads checkpoint when available", async () => {
      const mockCp: ImportCheckpoint = {
        batch: "b-cp",
        bankId: "b1",
        pendingQuestions: [{ id: "q-1" } as any],
        confirmedIds: ["q-0"],
        timestamp: 1000,
      };
      const mockApp = { loadImportCheckpoint: vi.fn().mockResolvedValue(mockCp) };

      const res = await checkImportCheckpointAux(mockApp, "b1");
      expect(res).toEqual(mockCp);
    });

    it("returns null on error or missing bankId", async () => {
      expect(await checkImportCheckpointAux(null, "b1")).toBeNull();
      const mockApp = { loadImportCheckpoint: vi.fn().mockRejectedValue(new Error("none")) };
      expect(await checkImportCheckpointAux(mockApp, "b1")).toBeNull();
    });

    it("discards checkpoint gracefully", async () => {
      const mockApp = { clearImportCheckpoint: vi.fn().mockResolvedValue(undefined) };
      await discardImportCheckpointAux(mockApp);
      expect(mockApp.clearImportCheckpoint).toHaveBeenCalled();
    });

    it("builds resume checkpoint report accurately", () => {
      const mockCp: ImportCheckpoint = {
        batch: "b-cp",
        bankId: "b1",
        pendingQuestions: [{ id: "q-1" } as any],
        confirmedIds: ["q-0"],
        timestamp: 1000,
      };
      const res = buildResumeCheckpointReport(mockCp);
      expect(res.report.ok).toEqual([{ id: "q-1" }]);
      expect(res.report.batch).toBe("b-cp");
      expect(res.confirmedIds).toEqual(["q-0"]);
    });

    it("toggles cloze support mode and keeps at least one mode", () => {
      // 1. 添加模式
      expect(toggleClozeSupportMode(["highlight"], "curly")).toEqual(["highlight", "curly"]);

      // 2. 移除模式
      expect(toggleClozeSupportMode(["highlight", "curly"], "curly")).toEqual(["highlight"]);

      // 3. 只有一个模式时禁止移除
      expect(toggleClozeSupportMode(["highlight"], "highlight")).toEqual(["highlight"]);
    });

    it("toggles select all doc candidates correctly", () => {
      const candidates = [{ id: "d1" }, { id: "d2" }];

      // 1. 从空到全选
      const allSelected = toggleSelectAllDocCandidates(candidates, {});
      expect(allSelected).toEqual({ d1: true, d2: true });

      // 2. 从全选到清空
      const cleared = toggleSelectAllDocCandidates(candidates, { d1: true, d2: true });
      expect(cleared).toEqual({});
    });
  });
});
