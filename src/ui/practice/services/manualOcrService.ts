// ============================================================
// 手工录题 OCR 文本与图片解析服务（manualOcrService.ts）
// 承接 OCR 结构化文本解析、图片上传识别与剪贴板图片侦听
// 纯逻辑解耦，不绑定 Svelte 渲染态
// ============================================================

import { parseOcrTextToForm } from "./manualStudioService";
import type { ManualDraftType } from "./smartViewManagementService";

export interface OcrFormResult {
  type: ManualDraftType;
  stem: string;
  options: string[];
  answer: string;
  analysis: string;
  kp: string;
}

export interface OcrProcessResult {
  success: boolean;
  form?: OcrFormResult;
  message: string;
  isError: boolean;
}

function toManualDraftType(t: string): ManualDraftType {
  if (t === "fill" || t === "single" || t === "multiple" || t === "judge" || t === "short") {
    return t;
  }
  return "single";
}

/** 解析 OCR 纯文本并提取为表单字段 */
export function parseOcrFormResult(ocrInputText: string): OcrFormResult | null {
  const text = ocrInputText.trim();
  if (!text) return null;
  const parsed = parseOcrTextToForm(text);
  return {
    type: toManualDraftType(parsed.type),
    stem: parsed.stem,
    options: parsed.options,
    answer: parsed.answer,
    analysis: parsed.analysis || "",
    kp: parsed.kp || "",
  };
}

/** 执行图片上传与 OCR 试题解析 */
export async function processOcrImageUpload(
  app: any,
  file: File | Blob,
  t: (k: string) => string,
): Promise<OcrProcessResult> {
  if (!app || !file) {
    return { success: false, message: "参数错误", isError: true };
  }

  try {
    const fileName = (file as File).name || "pasted-question.png";
    const q = await app.uploadAndOcrQuestion(file, fileName);

    const form: OcrFormResult = {
      type: toManualDraftType(q.type),
      stem: q.stem || "",
      options: Array.isArray(q.options) && q.options.length >= 2 ? q.options : ["", ""],
      answer: q.answer || "",
      analysis: q.analysis || "",
      kp: q.kp || "",
    };

    return {
      success: true,
      form,
      message: t("manual.ocrDone"),
      isError: false,
    };
  } catch (e) {
    const errText = String(e instanceof Error ? e.message : e);
    return {
      success: false,
      message: `图片 OCR 识别失败：${errText}`,
      isError: true,
    };
  }
}

/** 从剪贴板事件中提取图片文件对象 */
export function findImageInClipboard(e: ClipboardEvent): File | null {
  const items = e.clipboardData?.items;
  if (!items) return null;

  for (const item of Array.from(items)) {
    if (item.type.startsWith("image/")) {
      const file = item.getAsFile();
      if (file) {
        return file;
      }
    }
  }
  return null;
}
