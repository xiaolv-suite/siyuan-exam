import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  pickRandomSpotCheckQuestions,
  renderSpotCheckHtml,
  reparseFixedExcelRow,
  reparseFixedTextRow,
  applyReparsedResultToReport,
  prepareRowFixInitialState,
  executeApplyRowFix,
  executeSpotCheckRender,
} from "@/ui/practice/services/importRepairService";
import type { Question } from "@/core/types";
import type { ImportReport } from "@/importer/pipeline";

describe("importRepairService", () => {
  const dummyT = (k: string) => `[${k}]`;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("pickRandomSpotCheckQuestions", () => {
    it("returns empty array for empty pool", () => {
      expect(pickRandomSpotCheckQuestions([])).toEqual([]);
    });

    it("picks up to count questions without duplicates", () => {
      const pool = [
        { id: "q-1" },
        { id: "q-2" },
        { id: "q-3" },
        { id: "q-4" },
      ] as Question[];

      const picks = pickRandomSpotCheckQuestions(pool, 2);
      expect(picks).toHaveLength(2);
      expect(picks[0].id).not.toBe(picks[1].id);
    });
  });

  describe("renderSpotCheckHtml", () => {
    it("renders html for each question and tolerates errors", async () => {
      const mockApp = {
        renderStem: vi.fn().mockImplementation((q: Question) => {
          if (q.id === "q-err") throw new Error("渲染失败");
          return Promise.resolve(`<p>${q.id}</p>`);
        }),
      };

      const questions = [{ id: "q-1" }, { id: "q-err" }] as Question[];
      const res = await renderSpotCheckHtml(mockApp, questions);

      expect(res["q-1"]).toBe("<p>q-1</p>");
      expect(res["q-err"]).toBe("");
    });
  });

  describe("reparseFixedExcelRow and reparseFixedTextRow", () => {
    it("reparses valid text row into Question", async () => {
      const text = "1. 下列属于偶数的是？\nA. 1\nB. 2\nC. 3\nD. 5\nANSWER: B";
      const res = await reparseFixedTextRow(text, new Set(), "skip");
      expect(res.ok).toHaveLength(1);
      expect(res.ok[0].answer).toBe("B");
    });

    it("reparses excel cells with map", () => {
      const cells = ["填空题", "若 a=1, b=2，求 a+b", "3", "代数运算"];
      const map = { type: 0, stem: 1, options: [], answer: 2, kp: 3 } as any;
      const res = reparseFixedExcelRow(cells, map, new Set(), "skip");
      expect(res.ok).toHaveLength(1);
      expect(res.ok[0].answer).toBe("3");
    });
  });

  describe("applyReparsedResultToReport", () => {
    const baseReport: ImportReport = {
      ok: [{ id: "q-1" } as any],
      errors: [{ row: 2, reason: "选项缺失", raw: "xxx" }],
      duplicates: 0,
      batch: "b1",
    };

    it("merges fixed question into report ok list and removes error", () => {
      const single: ImportReport = {
        ok: [{ id: "q-2", stem: "已修复" } as any],
        errors: [],
        duplicates: 0,
        batch: "b1",
      };

      const res = applyReparsedResultToReport(baseReport, 2, single, dummyT);
      expect(res.fixed).toBe(true);
      expect(res.nextReport.ok).toHaveLength(2);
      expect(res.nextReport.errors).toHaveLength(0);
    });

    it("updates error reason when reparse still errors", () => {
      const single: ImportReport = {
        ok: [],
        errors: [{ row: 1, reason: "答案格式错误", raw: "yyy" }],
        duplicates: 0,
        batch: "b1",
      };

      const res = applyReparsedResultToReport(baseReport, 2, single, dummyT);
      expect(res.fixed).toBe(false);
      expect(res.fixNote).toBe("答案格式错误");
      expect(res.nextReport.errors[0].reason).toBe("答案格式错误");
    });

    it("handles duplicated row repair note", () => {
      const single: ImportReport = {
        ok: [],
        errors: [],
        duplicates: 1,
        batch: "b1",
      };

      const res = applyReparsedResultToReport(baseReport, 2, single, dummyT);
      expect(res.fixed).toBe(false);
      expect(res.fixNote).toBe("[import.rowDuped]");
    });
  });

  describe("prepareRowFixInitialState and executeApplyRowFix", () => {
    it("prepares initial row fix state for excel and text rows", () => {
      const excelState = prepareRowFixInitialState(2, ["单选", "题干", "A", "B", "A"]);
      expect(excelState.row).toBe(2);
      expect(excelState.cells).toHaveLength(5);
      expect(excelState.text).toBe("");

      const textState = prepareRowFixInitialState(3);
      expect(textState.row).toBe(3);
      expect(textState.cells).toEqual([]);
    });

    it("executes row fix for text blocks and integrates into report", async () => {
      const baseReport: ImportReport = {
        ok: [],
        errors: [{ row: 1, reason: "Aiken 格式错误", raw: "bad" }],
        duplicates: 0,
        batch: "b1",
      };

      const validAiken = "下列哪个是偶数？\nA. 1\nB. 2\nANSWER: B\n";
      const res = await executeApplyRowFix({
        currentReport: baseReport,
        errRow: 1,
        fixCells: [],
        fixText: validAiken,
        sheetRowsCache: new Map(),
        activeSheet: "Sheet1",
        lastMap: null,
        questions: [],
        dupeStrategy: "skip",
        t: dummyT,
      });

      expect(res.fixed).toBe(true);
      expect(res.nextReport.ok).toHaveLength(1);
      expect(res.nextReport.errors).toHaveLength(0);
    });

    it("executeSpotCheckRender：抽查题目并批量完成渲染", async () => {
      const mockApp = {
        renderStem: vi.fn().mockResolvedValue("<p>题干</p>"),
      };
      const qs = [{ id: "q-1" }, { id: "q-2" }] as Question[];
      const res = await executeSpotCheckRender(mockApp, qs, 2);
      expect(res.spotIds).toHaveLength(2);
      expect(res.spotHtml["q-1"]).toBe("<p>题干</p>");
    });
  });
});
