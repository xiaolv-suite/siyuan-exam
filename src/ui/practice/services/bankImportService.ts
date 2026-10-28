import type { ExamApp } from "@/app";
import { errorsToCsv, type ImportReport } from "@/importer/pipeline";
import { downloadBlobFile } from "./bankExportService";
import type { MessageReporter } from "./printPaperService";

/**
 * 官方 Excel 导入模板下载（运行时生成，docs/15 规范）
 */
export async function downloadImportTemplate(): Promise<void> {
  const { buildTemplateWorkbook } = await import("@/importer/template");
  const { buffer, filename } = buildTemplateWorkbook();
  downloadBlobFile(
    buffer as unknown as string,
    filename,
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
}

/**
 * 导入错误清单导出 CSV（Excel 友好，BOM 头）
 */
export function exportImportErrorsCsv(report: ImportReport | null): void {
  if (!report?.errors.length) return;
  const csv = "\uFEFF" + errorsToCsv(report.errors);
  downloadBlobFile(csv, `导入错误清单 ${new Date().toISOString().slice(0, 10)}.csv`, "text/csv;charset=utf-8");
}

/**
 * 题库包分享（.sy.zip 原生格式下载）
 */
export async function exportBankPackageZip(
  app: ExamApp,
  activeBankId: string,
  showMessage: MessageReporter,
  offline: boolean,
  t: (key: string) => string,
): Promise<void> {
  if (!activeBankId) return;
  try {
    const { zipPath, filename } = await app.exportBankSyZip(activeBankId);
    if (typeof document !== "undefined") {
      const a = document.createElement("a");
      a.href = typeof window !== "undefined" ? `${window.location.origin}${zipPath}` : zipPath;
      a.download = filename;
      a.click();
    }
    showMessage(t("share.exportDone") + filename, 4000, "info");
  } catch (e) {
    showMessage(offline ? t("state.offlineHint") : String(e instanceof Error ? e.message : e), 4200, "error");
  }
}

/**
 * 从系统剪贴板读取待导入文本
 */
export async function readClipboardImportText(
  showMessage: MessageReporter,
  t: (key: string) => string,
): Promise<string | null> {
  try {
    if (typeof navigator === "undefined" || !navigator.clipboard?.readText) {
      showMessage(t("import.clipboardFailed"), 3200, "info");
      return null;
    }
    const text = await navigator.clipboard.readText();
    if (!text?.trim()) {
      showMessage(t("import.clipboardEmpty"), 2800, "info");
      return null;
    }
    showMessage(t("import.clipboardPasted"), 2800, "info");
    return text;
  } catch {
    showMessage(t("import.clipboardFailed"), 3200, "info");
    return null;
  }
}

/**
 * 构造模拟 input 变更事件对象（用于拖拽文件流复用文件上传 handler）
 */
export function makeFileEventProxy(file: File): { target: { files: File[]; value: string } } {
  return {
    target: {
      files: [file],
      value: "",
    },
  };
}

/**
 * 过滤出尚未试导确认的题目
 */
export function filterUnconfirmedQuestions(
  questions: import("@/core/types").Question[],
  confirmedIds: string[],
): import("@/core/types").Question[] {
  if (!confirmedIds.length) return questions;
  const set = new Set(confirmedIds);
  return questions.filter((q) => !set.has(q.id));
}

/**
 * 构建试导入报告包（默认截取前 5 题）
 */
export function buildTrialImportReport(
  questions: import("@/core/types").Question[],
  originalBatch: string,
  size = 5,
): ImportReport {
  return {
    ok: questions.slice(0, size),
    errors: [],
    duplicates: 0,
    batch: `${originalBatch}-t5`,
  };
}

/**
 * 格式化试导入读回确认提示文案
 */
export function formatTrialReadbackNote(
  confirmedCount: number,
  missingCount: number,
  verified: boolean,
  t: (k: string) => string,
): string {
  if (!verified) return t("import.readbackUnknown");
  return t("import.trialDone")
    .replace("{c}", String(confirmedCount))
    .replace("{m}", String(missingCount));
}

