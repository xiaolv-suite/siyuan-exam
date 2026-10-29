import { describe, it, expect, vi } from "vitest";
import {
  isColumnMapOutOfBounds,
  parseSheetRowsWithStrategy,
  prepareMapAssignment,
  validateAndBuildManualMap,
  readAndParseWorkbookFile,
} from "@/ui/practice/services/excelParseWorkflowService";
import type { ExcelColumnMap } from "@/importer/pipeline";

describe("excelParseWorkflowService", () => {
  const dummyT = (k: string) => `[${k}]`;

  describe("isColumnMapOutOfBounds", () => {
    const validMap: ExcelColumnMap = {
      type: 0,
      stem: 1,
      options: [2, 3],
      answer: 4,
    };

    it("returns false when all indices are within column width", () => {
      expect(isColumnMapOutOfBounds(validMap, 5)).toBe(false);
      expect(isColumnMapOutOfBounds(validMap, 10)).toBe(false);
    });

    it("returns true when any index equals or exceeds column width", () => {
      expect(isColumnMapOutOfBounds(validMap, 4)).toBe(true);
      expect(isColumnMapOutOfBounds(validMap, 3)).toBe(true);
    });
  });

  describe("parseSheetRowsWithStrategy", () => {
    it("returns error on empty rows", () => {
      const res = parseSheetRowsWithStrategy({
        rows: [],
        dupeStrategy: "skip",
        existingHashes: new Set(),
        t: dummyT,
      });
      expect(res.error).toBe("[import.emptyFile]");
      expect(res.report).toBeUndefined();
    });

    it("uses manualMap when provided and valid", () => {
      const rows = [
        ["题型", "题干", "答案"],
        ["填空题", "1+1=?", "2"],
      ];
      const manualMap: ExcelColumnMap = {
        type: 0,
        stem: 1,
        options: [],
        answer: 2,
      };

      const res = parseSheetRowsWithStrategy({
        rows,
        manualMap,
        dupeStrategy: "skip",
        existingHashes: new Set(),
        t: dummyT,
      });

      expect(res.error).toBeUndefined();
      expect(res.report?.ok).toHaveLength(1);
      expect(res.usedMap).toBe(manualMap);
    });

    it("catches out of bounds in manualMap and signals mismatch fallback", () => {
      const rows = [
        ["题目", "答案"],
        ["1+1=?", "2"],
      ];
      const manualMap: ExcelColumnMap = {
        type: 5, // 越界
        stem: 0,
        options: [],
        answer: 1,
      };

      const res = parseSheetRowsWithStrategy({
        rows,
        manualMap,
        dupeStrategy: "skip",
        existingHashes: new Set(),
        t: dummyT,
      });

      expect(res.error).toBe("[import.mappingMismatch]");
      expect(res.mismatchFallback).toBe(true);
      expect(res.report).toBeUndefined();
    });

    it("uses savedMap when manualMap is null", () => {
      const rows = [
        ["题型", "题目", "答案"],
        ["判断题", "光速大于声速", "对"],
      ];
      const savedMap: ExcelColumnMap = {
        type: 0,
        stem: 1,
        options: [],
        answer: 2,
      };

      const res = parseSheetRowsWithStrategy({
        rows,
        manualMap: null,
        savedMap,
        dupeStrategy: "skip",
        existingHashes: new Set(),
        t: dummyT,
      });

      expect(res.error).toBeUndefined();
      expect(res.report?.ok).toHaveLength(1);
      expect(res.usedMap).toBe(savedMap);
    });

    it("performs autoMap when neither manual nor saved maps are given", () => {
      const rows = [
        ["题型", "题干", "选项A", "选项B", "答案"],
        ["单选", "哪个是偶数？", "1", "2", "B"],
      ];

      const res = parseSheetRowsWithStrategy({
        rows,
        dupeStrategy: "skip",
        existingHashes: new Set(),
        t: dummyT,
      });

      expect(res.error).toBeUndefined();
      expect(res.report?.ok).toHaveLength(1);
      expect(res.usedMap).toBeDefined();
    });

    it("requests manual edit when required columns are missing in autoMap", () => {
      const rows = [
        ["随意列1", "随意列2"],
        ["测试", "数据"],
      ];

      const res = parseSheetRowsWithStrategy({
        rows,
        dupeStrategy: "skip",
        existingHashes: new Set(),
        t: dummyT,
      });

      expect(res.needManualEdit).toBe(true);
      expect(res.error).toContain("[import.missingColumns]");
      expect(res.initialAssignment).toBeDefined();
    });
  });

  describe("prepareMapAssignment and validateAndBuildManualMap", () => {
    it("prepares initial assignment according to priority", () => {
      // 1. 空行数据返回 null
      expect(prepareMapAssignment([], null, [], "")).toBeNull();

      const rows = [["题型", "题干", "答案"]];
      const manualMap: ExcelColumnMap = { type: 0, stem: 1, options: [], answer: 2 };

      // 2. 优先采用 manualMap
      const assignFromManual = prepareMapAssignment(rows, manualMap, [], "");
      expect(assignFromManual?.type).toBe(0);
      expect(assignFromManual?.stem).toBe(1);
      expect(assignFromManual?.answer).toBe(2);

      // 3. 次优采用 savedMap
      const savedMappings = [{ name: "my-map", map: manualMap }];
      const assignFromSaved = prepareMapAssignment(rows, null, savedMappings, "my-map");
      expect(assignFromSaved?.type).toBe(0);

      // 4. 回退 autoAssignment
      const assignAuto = prepareMapAssignment(rows, null, [], "");
      expect(assignAuto?.type).toBe(0);
      expect(assignAuto?.stem).toBe(1);
    });

    it("validates and constructs manual column map", () => {
      // 1. 必填字段合法
      const assign = {
        type: 0,
        stem: 1,
        options: [2, 3, -1, -1, -1, -1],
        answer: 4,
        analysis: -1,
        difficulty: -1,
        kp: -1,
        score: -1,
        source: -1,
      };
      const resOk = validateAndBuildManualMap(assign, 5);
      expect(resOk.valid).toBe(true);
      expect(resOk.map?.type).toBe(0);
      expect(resOk.map?.stem).toBe(1);
      expect(resOk.map?.answer).toBe(4);
      expect(resOk.errors).toHaveLength(0);

      // 2. 缺少必填字段（缺少答案）
      const invalidAssign = {
        type: 0,
        stem: 1,
        options: [-1, -1, -1, -1, -1, -1],
        answer: -1,
        analysis: -1,
        difficulty: -1,
        kp: -1,
        score: -1,
        source: -1,
      };
      const resFail = validateAndBuildManualMap(invalidAssign, 5);
      expect(resFail.valid).toBe(false);
      expect(resFail.errors.length).toBeGreaterThan(0);
    });

    it("readAndParseWorkbookFile：解析工作簿并提示乱码警告", async () => {
      const showMessage = vi.fn();
      const dummyFile = {
        name: "test.csv",
        arrayBuffer: vi.fn().mockResolvedValue(new TextEncoder().encode("题型,题干,答案\n判断,测试,对")),
      } as unknown as File;

      const res = await readAndParseWorkbookFile(dummyFile, dummyT, showMessage);
      expect(res.sheetNames.length).toBeGreaterThanOrEqual(1);
      expect(res.activeSheet).toBeDefined();
      expect(res.sheets.has(res.activeSheet)).toBe(true);
    });
  });
});
