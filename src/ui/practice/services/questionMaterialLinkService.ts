import type { ExamApp } from "@/app";
import { parseTimeToSec, formatSecToTime, locatorLabel, locatedUrl, revisionStale, type NoteLocator } from "@/core/materialNotes";
import type { MessageReporter } from "./printPaperService";

export interface QrefSnapshotItem {
  title: string;
  label: string;
  stale: boolean;
}

/**
 * 获取单道题目与学习资料关联的快照视图
 */
export function computeQuestionMaterialSnapshot(app: ExamApp, qid: string): QrefSnapshotItem | null {
  if (!app) return null;
  const ref = app.questionMaterialRef(qid);
  if (!ref) return null;
  const m = app.listMaterials().find((x) => x.id === ref.materialId);
  return {
    title: m?.title ?? "?",
    label: locatorLabel(ref.locator),
    stale: revisionStale(ref.revision, m?.revision ?? ref.revision),
  };
}

/**
 * 保存题目↔学习资料定位关联（页码/视频时间秒数）
 */
export async function saveQuestionMaterialReference(
  app: ExamApp,
  qid: string,
  materialId: string,
  pageStr: string,
  timeStr: string,
  showMessage: MessageReporter,
  t: (k: string) => string,
): Promise<{ previousMaterialId?: string; replaced: boolean }> {
  const previousRef = app.questionMaterialRef(qid);
  const page = pageStr.trim() ? Number(pageStr) : undefined;
  if (pageStr.trim() && (!Number.isInteger(page) || page! < 1)) {
    throw new Error(t("materials.badPage"));
  }
  const tSec = timeStr.trim() ? parseTimeToSec(timeStr) : undefined;
  const locator: NoteLocator | null = page == null && tSec == null ? null : { page, tSec };

  const r = await app.linkQuestionMaterial(qid, materialId, locator);
  showMessage(r.replaced ? t("qref.relinked") : t("qref.linked"), 2000, "info");

  return {
    previousMaterialId: previousRef?.materialId,
    replaced: r.replaced,
  };
}

/**
 * 解除题目↔学习资料定位关联
 */
export async function removeQuestionMaterialReference(
  app: ExamApp,
  qid: string,
  showMessage: MessageReporter,
  t: (k: string) => string,
): Promise<string | undefined> {
  const ref = app.questionMaterialRef(qid);
  const { confirmDialogSync } = await import("@/libs/dialog");
  const ok = await confirmDialogSync({
    title: t("qref.unlinkTitle"),
    content: t("qref.unlinkConfirm"),
  });
  if (!ok) return undefined;

  await app.unlinkQuestionMaterial(qid);
  showMessage(t("qref.unlinked"), 2200, "info");
  return ref?.materialId;
}

/**
 * 解析并生成打开学习资料与定位点的 URL
 */
export function resolveQuestionMaterialOpenUrl(
  app: ExamApp,
  qid: string,
  origin: string,
): { url: string | null; material: import("@/core/materials").MaterialDoc | null } {
  const ref = app.questionMaterialRef(qid);
  const m = ref ? app.listMaterials().find((x) => x.id === ref.materialId) ?? null : null;
  const url = locatedUrl(m ? app.resolveMaterialUrlOf(m, origin) : null, ref?.locator ?? null);
  return { url, material: m };
}

/**
 * 初始化题目关联资料的编辑表单字段
 */
export function initQrefFormState(
  app: ExamApp,
  qid: string,
): { materialId: string; page: string; time: string } {
  const ref = app.questionMaterialRef(qid);
  return {
    materialId: ref?.materialId ?? "",
    page: ref?.locator?.page != null ? String(ref.locator.page) : "",
    time: ref?.locator?.tSec != null ? formatSecToTime(ref.locator.tSec) : "",
  };
}

/**
 * 批量构建全部题目的学习资料引用快照映射
 */
export function buildAllQuestionsMaterialSnapshot(
  app: ExamApp,
  questions: Array<{ id: string }>,
): Record<string, QrefSnapshotItem | null> {
  const result: Record<string, QrefSnapshotItem | null> = {};
  for (const q of questions) {
    result[q.id] = computeQuestionMaterialSnapshot(app, q.id);
  }
  return result;
}

