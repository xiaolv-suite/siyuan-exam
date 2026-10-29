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
import {
  autoAssignment,
  assignmentFromMap,
  assignmentToMap,
  assignmentErrors,
  type MapAssignment,
} from "@/importer/mapping";

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

/**
 * 准备列指派编辑器初始态（当前手动映射 > 已保存映射 > 自动映射最优猜测）
 */
export function prepareMapAssignment(
  rows: string[][] | undefined,
  manualMap: ExcelColumnMap | null,
  savedMappings: Array<{ name: string; map: ExcelColumnMap }>,
  selectedMapping: string,
): MapAssignment | null {
  if (!rows?.length) return null;
  const base = manualMap ?? savedMappings.find((m) => m.name === selectedMapping)?.map ?? null;
  return base ? assignmentFromMap(base) : autoAssignment(rows[0].map(String));
}

export interface ManualMapCommitResult {
  valid: boolean;
  errors: string[];
  map?: ExcelColumnMap;
}

/**
 * 校验并构造提交的手动列映射
 */
export function validateAndBuildManualMap(
  assign: MapAssignment,
  width: number,
): ManualMapCommitResult {
  const errs = assignmentErrors(assign, width);
  if (errs.length > 0) {
    return { valid: false, errors: errs };
  }
  return {
    valid: true,
    errors: [],
    map: assignmentToMap(assign),
  };
}

/**
 * 读取二进制文件并解析为各工作表数据结构
 */
export async function readAndParseWorkbookFile(
  file: File,
  t: (k: string) => string,
  showMessage: (msg: string, time?: number, type?: string) => void,
): Promise<{
  sheetNames: string[];
  sheets: Map<string, string[][]>;
  activeSheet: string;
}> {
  const XLSX = await import("xlsx");
  const { parseWorkbookFile } = await import("@/importer/workbookFile");
  const buf = await file.arrayBuffer();
  const parsed = await parseWorkbookFile(XLSX, buf, file.name);
  if (parsed.garbled) showMessage(t("import.garbledWarning"), 5200, "info");
  return {
    sheetNames: parsed.sheetNames,
    sheets: parsed.sheets,
    activeSheet: parsed.sheetNames[0] || "",
  };
}

