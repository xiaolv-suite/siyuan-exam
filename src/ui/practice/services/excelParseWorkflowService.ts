// ============================================================
// Excel 工作簿解析与列映射调度服务（excelParseWorkflowService.ts）
// 承接多工作表解析、列越界守卫、自动/保存/手动映射调度
// 纯逻辑解耦，不绑定 Svelte 渲染态
// ============================================================

import {
  parseExcelRows,
  autoMapExcel,
  type ExcelColumnMap,
  type ImportReport,
} from "@/importer/pipeline";
import { autoAssignment, type MapAssignment } from "@/importer/mapping";

export interface ParsedWorkbookResult {
  sheetNames: string[];
  sheets: Map<string, string[][]>;
  garbled: boolean;
}

export interface SheetParseOptions {
  rows: string[][];
  manualMap?: ExcelColumnMap | null;
  savedMap?: ExcelColumnMap | null;
  dupeStrategy: "skip" | "update" | "coexist";
  existingHashes: Set<string>;
  t: (k: string) => string;
}

export interface SheetParseResult {
  report?: ImportReport;
  error?: string;
  usedMap?: ExcelColumnMap;
  mismatchFallback?: boolean;
  needManualEdit?: boolean;
  initialAssignment?: MapAssignment;
  missingColumns?: string[];
}

/** 校验映射列索引是否超出单行最大列宽 */
export function isColumnMapOutOfBounds(map: ExcelColumnMap, width: number): boolean {
  const indices = [
    map.type,
    map.stem,
    map.answer,
    map.analysis,
    map.difficulty,
    map.kp,
    map.score,
    map.source,
    ...(map.options ?? []),
  ];
  return indices.some((i) => i != null && i >= width);
}

/**
 * 解析单个工作表的行数据：
 * 优先级：手动指定映射 > 保存的命名映射 > 自动映射（缺失必填列时回退手动指派）
 */
export function parseSheetRowsWithStrategy(opt: SheetParseOptions): SheetParseResult {
  const { rows, manualMap, savedMap, dupeStrategy, existingHashes, t } = opt;
  if (!rows?.length) {
    return { error: t("import.emptyFile") };
  }

  const width = rows[0].length;
  const dataRows = rows.slice(1);
  const importOpt = { existingHashes, duplicateStrategy: dupeStrategy as any };

  // 1. 手动映射优先
  if (manualMap) {
    if (isColumnMapOutOfBounds(manualMap, width)) {
      return {
        error: t("import.mappingMismatch"),
        mismatchFallback: true,
      };
    }
    const report = parseExcelRows(dataRows, manualMap, importOpt);
    return { report, usedMap: manualMap };
  }

  // 2. 已保存复用映射
  if (savedMap) {
    if (isColumnMapOutOfBounds(savedMap, width)) {
      return {
        error: t("import.mappingMismatch"),
        mismatchFallback: true,
      };
    }
    const report = parseExcelRows(dataRows, savedMap, importOpt);
    return { report, usedMap: savedMap };
  }

  // 3. 自动表头智能映射
  const { map, missing } = autoMapExcel(rows[0].map(String));
  if (missing.length) {
    return {
      error: t("import.missingColumns") + missing.join("、"),
      needManualEdit: true,
      initialAssignment: autoAssignment(rows[0].map(String)),
      missingColumns: missing,
    };
  }

  const report = parseExcelRows(dataRows, map, importOpt);
  return { report, usedMap: map };
}
