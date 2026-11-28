// ============================================================
// 手工录题 OCR 文本与图片解析服务（manualOcrService.ts）
// 承接 OCR 结构化文本解析、图片上传识别与剪贴板图片侦听
// 纯逻辑解耦，不绑定 Svelte 渲染态
// ============================================================

import { parseOcrTextToForm } from "./manualStudioService";
import type { ManualDraftType } from "./smartViewManagementService";
import { recognizeImageBlobWithFallback } from "./pdfOcrService";

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
  cancelled?: boolean;
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

/** 执行图片上传与 OCR 试题解析（复用已上传 assetPath 避免重复传图，并在思源 OCR 不可用时降级到用户配置的 Umi-OCR） */
export async function processOcrImageUpload(
  app: any,
  file: File | Blob,
  t: (k: string) => string,
  signal?: AbortSignal,
  options?: { assetPath?: string; ocrEndpoint?: string },
): Promise<OcrProcessResult> {
  if (!app || !file) {
    return { success: false, message: "参数错误", isError: true };
  }

  const fileName = (file as File).name || "pasted-question.png";
  const normalizeQuestionToForm = (q: any): OcrFormResult => ({
    type: toManualDraftType(q.type),
    stem: q.stem || "",
    options: Array.isArray(q.options) && q.options.length >= 2 ? q.options : ["", ""],
    answer: q.answer || "",
    analysis: q.analysis || "",
    kp: q.kp || "",
  });

  try {
    let q: any;
    if (options?.assetPath && typeof app.ocrAndParseQuestion === "function") {
      q = signal
        ? await app.ocrAndParseQuestion(options.assetPath, { signal })
        : await app.ocrAndParseQuestion(options.assetPath);
    } else {
      q = signal
        ? await app.uploadAndOcrQuestion(file, fileName, { signal })
        : await app.uploadAndOcrQuestion(file, fileName);
    }

    return {
      success: true,
      form: normalizeQuestionToForm(q),
      message: t("manual.ocrDone"),
      isError: false,
    };
  } catch (e) {
    const errText = String(e instanceof Error ? e.message : e);
    if (signal?.aborted || (e instanceof Error && e.name === "AbortError")) {
      return {
        success: false,
        message: "已取消图片 OCR 识别",
        isError: false,
        cancelled: true,
      };
    }

    const ocrEndpoint = String(options?.ocrEndpoint ?? "").trim();
    if (ocrEndpoint) {
      try {
        const umiRes = await recognizeImageBlobWithFallback(app, file, {
          fileName,
          umiOcrEndpoint: ocrEndpoint,
          signal,
          skipSiyuanOcr: true,
        });
        if (umiRes.text.trim()) {
          if (typeof app.parseOcrTextToQuestion === "function") {
            const q = await app.parseOcrTextToQuestion(umiRes.text, {
              fallbackSource: options?.assetPath || fileName,
            });
            return {
              success: true,
              form: normalizeQuestionToForm(q),
              message: t("manual.ocrDone"),
              isError: false,
            };
          }
          const parsedForm = parseOcrFormResult(umiRes.text);
          if (parsedForm) {
            return {
              success: true,
              form: parsedForm,
              message: t("manual.ocrDone"),
              isError: false,
            };
          }
        }
      } catch (umiErr) {
        if (signal?.aborted || (umiErr instanceof Error && umiErr.name === "AbortError")) {
          return {
            success: false,
            message: "已取消图片 OCR 识别",
            isError: false,
            cancelled: true,
          };
        }
      }
    }

    return {
      success: false,
      message: `图片 OCR 识别失败：${errText}`,
      isError: true,
    };
  }
}

/** 上传图片资产并返回可直接嵌入题干/选项/解析的 Markdown 配图语法 */
export async function uploadManualAssetImage(
  app: any,
  file: File | Blob,
): Promise<{ success: boolean; assetPath?: string; markdown?: string; message: string }> {
  if (!app || !file) {
    return { success: false, message: "参数错误，无法上传配图" };
  }
  if (!app.kernelOnline || typeof app?.bridge?.uploadAsset !== "function") {
    return { success: false, message: "思源内核未连接，暂无法上传配图资产" };
  }
  try {
    const ext = (file.type && file.type.split("/")[1]?.replace("jpeg", "jpg")) || "png";
    const fileName = (file as File).name && (file as File).name !== "image.png"
      ? (file as File).name
      : `manual-fig-${Date.now()}.${ext}`;
    const assetPath = await app.bridge.uploadAsset(file, fileName);
    const markdown = `![配图](${assetPath})`;
    return {
      success: true,
      assetPath,
      markdown,
      message: `已直接插入配图 ${assetPath}`,
    };
  } catch (e) {
    return {
      success: false,
      message: `配图上传失败：${String(e instanceof Error ? e.message : e)}`,
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
