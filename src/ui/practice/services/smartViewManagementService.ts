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
  extra?: Partial<SmartView>,
): SmartView[] {
  return upsertView(currentViews, {
    name,
    v: 1,
    bankId: activeBankId,
    search,
    favOnly,
    section: section ? JSON.parse(JSON.stringify(section)) : null,
    createdAt: Date.now(),
    ...(extra?.types ? { types: extra.types } : {}),
    ...(extra?.kpPrefix ? { kpPrefix: extra.kpPrefix } : {}),
    ...(extra?.sourceKind ? { sourceKind: extra.sourceKind } : {}),
    ...(extra?.source ? { source: extra.source } : {}),
    ...(extra?.onlyWrong !== undefined ? { onlyWrong: extra.onlyWrong } : {}),
    ...(extra?.onlyDisputed !== undefined ? { onlyDisputed: extra.onlyDisputed } : {}),
    ...(extra?.lifecycle ? { lifecycle: extra.lifecycle } : {}),
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
  secondaryKps: string;
  source: string;
  status: QuestionLifecycleStatus;
  specOpen: boolean;
  specUnit: string;
  specAbsTol: string;
  specRelPct: string;
  specAltUnits: string;
  orderIndependent: boolean;
  rubricOpen: boolean;
  rubricText: string;
  studyLang: string;
  studyPhonetic: string;
  family: NonNullable<Question["family"]>;
  toast: string;
} {
  const mappedType: ManualDraftType =
    q.type === "fill" || q.type === "multiple" || q.type === "judge" || q.type === "short"
      ? q.type
      : "single";

  const numSpec = q.answerSpec?.kind === "numeric" ? q.answerSpec : undefined;
  const multiSpec = q.answerSpec?.kind === "multiBlank" ? q.answerSpec : undefined;
  const rubricText = q.rubric?.criteria?.length
    ? q.rubric.criteria
        .map((c) => `${c.label} | ${Math.round(c.weight * 100)}${c.example ? ` | ${c.example}` : ""}`)
        .join("\n")
    : "";

  return {
    type: mappedType,
    stem: q.stem ? `${q.stem}（变式）` : "",
    options: q.options?.length ? [...q.options] : ["", ""],
    answer: q.answer || "",
    analysis: q.analysis ? `【母题解析】：${q.analysis}` : "",
    kp: q.kp || "",
    secondaryKps: q.secondaryKps?.length ? q.secondaryKps.join(", ") : "",
    source: q.blockId ? `((${q.blockId} '${q.stem.replace(/'/g, "").slice(0, 20)}...'))` : (q.source || ""),
    status: "draft",
    specOpen: Boolean(numSpec || multiSpec?.orderIndependent),
    specUnit: numSpec?.unit ?? "",
    specAbsTol: numSpec?.absTol != null ? String(numSpec.absTol) : "",
    specRelPct: numSpec?.relTolerance != null ? String(Math.round(numSpec.relTolerance * 10000) / 100) : "",
    specAltUnits: numSpec?.altUnits?.length ? numSpec.altUnits.map((a) => a.unit).join(", ") : "",
    orderIndependent: Boolean(multiSpec?.orderIndependent),
    rubricOpen: Boolean(rubricText),
    rubricText,
    studyLang: q.studyMeta?.lang || "zh-CN",
    studyPhonetic: q.studyMeta?.phonetic || "",
    family: {
      parentId: q.family?.parentId || q.id,
      variantKind: "near_transfer",
      verified: true,
    },
    toast: "已将该题载入手工录题台，并自动建立母题溯源反链与题族变式绑定！",
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

export interface BrowseFilterResetState {
  search: string;
  favOnly: boolean;
  filterType: string;
  filterSource: string;
  filterWrong: boolean;
  filterHelp: boolean;
  filterUserTag: string;
  filterDays: number;
  sectionSel: null;
  selectedView: string;
}

/**
 * 构造全量浏览过滤清空重置状态
 */
export function createEmptyBrowseFilters(): BrowseFilterResetState {
  return {
    search: "",
    favOnly: false,
    filterType: "",
    filterSource: "",
    filterWrong: false,
    filterHelp: false,
    filterUserTag: "",
    filterDays: 0,
    sectionSel: null,
    selectedView: "",
  };
}

/**
 * 经由输入弹窗保存当前命名智能视图快照
 */
export async function executeSaveNamedViewWithPrompt(
  app: any,
  smartViews: SmartView[],
  activeBankId: string,
  criteria: {
    search: string;
    favOnly: boolean;
    sectionSel: any;
    types?: any[];
    kpPrefix?: string;
    source?: string;
    sourceKind?: "real" | "mock";
    onlyWrong?: boolean;
    onlyDisputed?: boolean;
    lifecycle?: any;
  },
  promptFn: (opts: { title: string; placeholder: string }) => Promise<string | undefined>,
  t: (k: string) => string,
): Promise<{ nextViews: SmartView[]; savedName: string; toast?: string; error?: string } | null> {
  const name = (await promptFn({ title: t("view.saveTitle"), placeholder: t("view.namePlaceholder") }))?.trim();
  if (!name) return null;
  const next = createNamedSmartView(
    smartViews,
    activeBankId,
    name,
    criteria.search,
    criteria.favOnly,
    criteria.sectionSel,
    {
      types: criteria.types,
      kpPrefix: criteria.kpPrefix,
      sourceKind: criteria.sourceKind,
      source: criteria.source,
      onlyWrong: criteria.onlyWrong,
      onlyDisputed: criteria.onlyDisputed,
      lifecycle: criteria.lifecycle,
    },
  );
  const saveRes = await saveSmartViewsAux(app, next, t);
  if (!saveRes.success) {
    return { nextViews: smartViews, savedName: "", error: saveRes.error };
  }
  return { nextViews: next, savedName: name, toast: t("view.saved") };
}

/**
 * 经由确认弹窗删除指定智能视图
 */
export async function executeDeleteNamedViewWithConfirm(
  app: any,
  smartViews: SmartView[],
  viewName: string,
  confirmFn: (opts: { title: string; content: string }) => Promise<boolean>,
  t: (k: string) => string,
): Promise<{ nextViews: SmartView[]; deleted: boolean; toast?: string; error?: string }> {
  const { escapeHtml } = await import("@/libs/sanitize");
  const ok = await confirmFn({
    title: t("view.deleteTitle"),
    content: t("view.deleteConfirm").replace("{name}", escapeHtml(viewName)),
  });
  if (!ok) return { nextViews: smartViews, deleted: false };
  const next = removeNamedSmartView(smartViews, viewName);
  const saveRes = await saveSmartViewsAux(app, next, t);
  if (!saveRes.success) {
    return { nextViews: smartViews, deleted: false, error: saveRes.error };
  }
  return { nextViews: next, deleted: true, toast: t("view.deleted") };
}


