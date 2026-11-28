// ============================================================
// 导入试卷抽查与单行错误修复服务（importRepairService.ts）
// 承接随机抽查渲染、单行重验（Excel/文本）、导入报告合并
// 纯逻辑解耦，不绑定 Svelte 渲染态
// ============================================================

import type { Question } from "@/core/types";
import { parseText, parseExcelRows, type ImportReport, type ExcelColumnMap } from "@/importer/pipeline";

/** 随机抽选 N 题用于真机/真实渲染管线抽查 */
export function pickRandomSpotCheckQuestions(
  pool: Question[],
  count = 3,
): Question[] {
  if (!pool.length) return [];
  const cloned = [...pool];
  const picks: Question[] = [];
  while (cloned.length && picks.length < count) {
    const idx = Math.floor(Math.random() * cloned.length);
    picks.push(cloned.splice(idx, 1)[0]);
  }
  return picks;
}

/** 批量渲染题目题干 HTML */
export async function renderSpotCheckHtml(
  app: any,
  questions: Question[],
): Promise<Record<string, string>> {
  const htmlMap: Record<string, string> = {};
  for (const q of questions) {
    try {
      htmlMap[q.id] = await app.renderStem(q);
    } catch {
      htmlMap[q.id] = "";
    }
  }
  return htmlMap;
}

/** 执行试题抽查渲染，返回抽检题目ID与对应的题干渲染HTML */
export async function executeSpotCheckRender(
  app: any,
  questions: Question[],
  count = 3,
): Promise<{ spotIds: string[]; spotHtml: Record<string, string> }> {
  const picks = pickRandomSpotCheckQuestions(questions, count);
  const spotIds = picks.map((q) => q.id);
  const spotHtml = await renderSpotCheckHtml(app, picks);
  return { spotIds, spotHtml };
}

/** 重新解析单行修复后的 Excel 单元格 */
export function reparseFixedExcelRow(
  cells: string[],
  map: ExcelColumnMap,
  existingHashes: Set<string>,
  dupeStrategy: string,
): ImportReport {
  return parseExcelRows([cells], map, {
    existingHashes,
    duplicateStrategy: dupeStrategy as any,
  });
}

/** 重新解析单行修复后的纯文本块 */
export async function reparseFixedTextRow(
  text: string,
  existingHashes: Set<string>,
  dupeStrategy: string,
): Promise<ImportReport> {
  return await parseText(text, {
    existingHashes,
    duplicateStrategy: dupeStrategy as any,
  });
}

/** 将单行修复重验结果合并回合总导入报告中 */
export function applyReparsedResultToReport(
  currentReport: ImportReport,
  errRow: number,
  single: ImportReport,
  t: (k: string) => string,
): { nextReport: ImportReport; fixNote?: string; fixed: boolean } {
  if (single.ok.length === 1) {
    const nextReport: ImportReport = {
      ...currentReport,
      ok: [...currentReport.ok, single.ok[0]],
      errors: currentReport.errors.filter((e) => e.row !== errRow),
    };
    return { nextReport, fixed: true };
  }

  if (single.errors.length === 1) {
    const reason = single.errors[0].reason;
    const nextReport: ImportReport = {
      ...currentReport,
      errors: currentReport.errors.map((e) =>
        e.row === errRow ? { ...e, reason } : e,
      ),
    };
    return { nextReport, fixNote: reason, fixed: false };
  }

  // 修复后与题库/批内重复
  return { nextReport: currentReport, fixNote: t("import.rowDuped"), fixed: false };
}

export interface RowFixInitialState {
  row: number;
  cells: string[];
  text: string;
  note: string;
}

/** 构造行修复初始化状态 */
export function prepareRowFixInitialState(
  row: number,
  sheetRow?: string[],
): RowFixInitialState {
  if (sheetRow) {
    return {
      row,
      cells: [...sheetRow],
      text: "",
      note: "",
    };
  }
  return {
    row,
    cells: [],
    text: "",
    note: "",
  };
}

export interface ApplyRowFixOptions {
  currentReport: ImportReport;
  errRow: number;
  fixCells: string[];
  fixText: string;
  sheetRowsCache: Map<string, string[][]>;
  activeSheet: string;
  lastMap: ExcelColumnMap | null;
  questions: Question[];
  dupeStrategy: string;
  t: (k: string) => string;
}

export interface ApplyRowFixResult {
  nextReport: ImportReport;
  fixed: boolean;
  fixNote?: string;
  nextSheetCache?: Map<string, string[][]>;
}

/** 执行单行错误重验并回填报告与表格缓存 */
export async function executeApplyRowFix(
  options: ApplyRowFixOptions,
): Promise<ApplyRowFixResult> {
  const {
    currentReport,
    errRow,
    fixCells,
    fixText,
    sheetRowsCache,
    activeSheet,
    lastMap,
    questions,
    dupeStrategy,
    t,
  } = options;

  const sheet = sheetRowsCache.get(activeSheet);
  const abs = errRow - 1;
  const existingHashes =
    dupeStrategy === "coexist" ? new Set<string>() : new Set(questions.map((q) => q.hash));

  let single: ImportReport;
  let nextSheetCache: Map<string, string[][]> | undefined;

  if (fixCells.length && sheet?.[abs]) {
    sheet[abs] = [...fixCells];
    nextSheetCache = new Map(sheetRowsCache);
    nextSheetCache.set(activeSheet, sheet);
    single = reparseFixedExcelRow(sheet[abs], lastMap!, existingHashes, dupeStrategy);
  } else {
    single = await reparseFixedTextRow(fixText, existingHashes, dupeStrategy);
  }

  const applied = applyReparsedResultToReport(currentReport, errRow, single, t);
  return {
    nextReport: applied.nextReport,
    fixed: applied.fixed,
    fixNote: applied.fixNote,
    nextSheetCache,
  };
}

