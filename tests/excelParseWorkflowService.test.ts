import { describe, it, expect } from "vitest";
import {
  isColumnMapOutOfBounds,
  parseSheetRowsWithStrategy,
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
});
