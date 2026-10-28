// ============================================================
// 智能视图与浏览辅助服务（smartViewManagementService.ts）
// 承接命名视图持久化、Excel 导入映射复用、母题克隆变式出题
// 纯逻辑解耦，不绑定 Svelte 渲染态
// ============================================================

import type { SmartView } from "@/core/smartViews";
import { upsertView, viewBankMismatch } from "@/core/smartViews";
import type { Question } from "@/core/types";
import type { ExcelColumnMap } from "@/importer/pipeline";
import type { QuestionLifecycleStatus } from "@/core/revision";

export interface SmartViewLoadResult {
  views: SmartView[];
  error: string;
  failed: boolean;
}

export interface SmartViewSaveResult {
  success: boolean;
  error: string;
}

export interface ExcelMappingItem {
  name: string;
  map: ExcelColumnMap;
}

export type ManualDraftType = "fill" | "single" | "multiple" | "judge" | "short";

/** 加载已保存的智能视图列表 */
export async function loadSmartViewsAux(
  app: any,
  t: (k: string) => string,
): Promise<SmartViewLoadResult> {
  try {
    const v = (await app.loadAux("browse/smartViews")) as SmartView[];
    const views = Array.isArray(v) ? v : [];
    return { views, error: "", failed: false };
  } catch (e) {
    const error = t("view.loadFailed").replace(
      "{message}",
      String(e instanceof Error ? e.message : e),
    );
    return { views: [], error, failed: true };
  }
}

/** 保存智能视图列表 */
export async function saveSmartViewsAux(
  app: any,
  next: SmartView[],
  t: (k: string) => string,
): Promise<SmartViewSaveResult> {
  try {
    await app.saveAux("browse/smartViews", next);
    return { success: true, error: "" };
  } catch (e) {
    const error = t("view.saveFailed").replace(
      "{message}",
      String(e instanceof Error ? e.message : e),
    );
    return { success: false, error };
  }
}

/** 构造或更新命名视图快照 */
export function createNamedSmartView(
  currentViews: SmartView[],
  activeBankId: string,
  name: string,
  search: string,
  favOnly: boolean,
  section: any,
): SmartView[] {
  return upsertView(currentViews, {
    name,
    v: 1,
    bankId: activeBankId,
    search,
    favOnly,
    section: section ? JSON.parse(JSON.stringify(section)) : null,
    createdAt: Date.now(),
  });
}

/** 检查视图是否与当前题库匹配 */
export function isViewBankMismatched(view: SmartView, activeBankId: string): boolean {
  return viewBankMismatch(view, activeBankId);
}

/** 删除指定名称的视图并返回新视图数组 */
export function removeNamedSmartView(currentViews: SmartView[], name: string): SmartView[] {
  return currentViews.filter((v) => v.name !== name);
}

/** 加载已保存的 Excel 映射 */
export async function loadExcelMappingsAux(app: any): Promise<ExcelMappingItem[]> {
  try {
    const v = (await app.loadAux("import/mappings")) as ExcelMappingItem[];
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

/** 保存 Excel 映射到历史库 */
export async function saveExcelMappingAux(
  app: any,
  currentMappings: ExcelMappingItem[],
  name: string,
  lastMap: ExcelColumnMap,
  t: (k: string) => string,
): Promise<{ next: ExcelMappingItem[]; success: boolean; message: string }> {
  const next = [
    ...currentMappings.filter((m) => m.name !== name),
    { name, map: JSON.parse(JSON.stringify(lastMap)) },
  ].slice(-20);

  try {
    await app.saveAux("import/mappings", next);
    return { next, success: true, message: t("settingSaved") };
  } catch (e) {
    const message = t("import.mappingSaveFailed").replace(
      "{message}",
      String(e instanceof Error ? e.message : e),
    );
    return { next: currentMappings, success: false, message };
  }
}

/** 克隆题目作为变式母题载入手工录题台 */
export function cloneQuestionToManualDraft(q: Question): {
  type: ManualDraftType;
  stem: string;
  options: string[];
  answer: string;
  analysis: string;
  kp: string;
  source: string;
  status: QuestionLifecycleStatus;
  toast: string;
} {
  const mappedType: ManualDraftType =
    q.type === "fill" || q.type === "multiple" || q.type === "judge" || q.type === "short"
      ? q.type
      : "single";

  return {
    type: mappedType,
    stem: q.stem ? `${q.stem}（变式）` : "",
    options: q.options?.length ? [...q.options] : ["", ""],
    answer: q.answer || "",
    analysis: q.analysis ? `【母题解析】：${q.analysis}` : "",
    kp: q.kp || "",
    source: q.blockId ? `(( ${q.blockId} '${q.stem.slice(0, 20)}...' ))` : (q.source || ""),
    status: "draft",
    toast: "已将该题载入手工录题台，并自动建立母题溯源反链！",
  };
}

/** 获取相邻题目的 ID（向前或向后） */
export function getNeighborQuestionId(
  questions: Question[],
  currentIndex: number,
  delta: -1 | 1,
): string | null {
  const nextIdx = currentIndex + delta;
  if (nextIdx >= 0 && nextIdx < questions.length) {
    return questions[nextIdx].id;
  }
  return null;
}

