import { loadChunk } from "@/libs/chunk-loader";
import {
  buildPdfScanGuidanceMessage,
  callUmiOcr,
  extractPdfPagesFromBytes,
  isOcrUnavailableError,
  type PdfJsModuleLike,
} from "@/core/pdfImport";

export interface PdfExtractionProgress {
  phase: "text" | "ocr";
  page: number;
  total: number;
  message: string;
}

export interface PdfExtractionOutcome {
  text: string;
  totalPages: number;
  textPagesCount: number;
  ocrPagesCount: number;
  scannedPagesCount: number;
  failedOcrPages: number[];
  notice: string;
  ocrUnavailable: boolean;
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < buf.length; i += chunk) {
    binary += String.fromCharCode(...buf.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function renderPdfPageToPng(
  pdfjs: PdfJsModuleLike,
  bytes: Uint8Array,
  pageNum: number,
  scale = 2.0,
): Promise<Blob | null> {
  if (typeof document === "undefined" || typeof document.createElement !== "function") {
    return null;
  }
  const dataCopy = new Uint8Array(bytes.byteLength);
  dataCopy.set(bytes);
  const doc = await pdfjs.getDocument({
    data: dataCopy,
    useSystemFonts: true,
    disableFontFace: true,
    verbosity: 0,
  }).promise;
  try {
    const page = await doc.getPage(pageNum);
    if (typeof page.render !== "function") return null;
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.floor(viewport.width));
    canvas.height = Math.max(1, Math.floor(viewport.height));
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    await page.render({ canvasContext: ctx, viewport }).promise;
    return await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((b) => resolve(b), "image/png");
    });
  } finally {
    try {
      await doc.destroy?.();
    } catch {
      /* ignore */
    }
  }
}

/**
 * 探活思源原生 OCR 引擎是否可用（不上传任何整页 PNG，避免不可用时留下冗余废图）
 */
export async function probeSiyuanOcrAvailability(app: any, signal?: AbortSignal): Promise<boolean> {
  if (!app?.kernelOnline || typeof app?.bridge?.assetOcr !== "function") {
    return false;
  }
  try {
    await app.bridge.assetOcr("assets/__lv_ocr_probe__.png", signal ? { signal } : undefined);
    return true;
  } catch (err) {
    if (signal?.aborted || (err instanceof Error && err.name === "AbortError")) {
      throw err;
    }
    return !isOcrUnavailableError(err);
  }
}

/**
 * 识别单张图片 Blob/File 的文本（复用思源缓存 -> 思源 /api/asset/ocr -> 可选 Umi-OCR），绝不崩溃抛出原始 tesseract fatal
 */
export async function recognizeImageBlobWithFallback(
  app: any,
  file: File | Blob,
  options: {
    fileName?: string;
    umiOcrEndpoint?: string;
    signal?: AbortSignal;
    skipSiyuanOcr?: boolean;
  } = {},
): Promise<{ text: string; assetPath?: string; ocrUnavailable?: boolean; warning?: string }> {
  const fileName = options.fileName || (file as File).name || `ocr-${Date.now()}.png`;
  let siyuanUnavailable = false;
  let siyuanErrorWarning: string | undefined;
  let assetPath: string | undefined;
  const umiUrl = (options.umiOcrEndpoint ?? "").trim();

  if (!options.skipSiyuanOcr && app?.kernelOnline && app?.bridge?.uploadAsset && app?.bridge?.assetOcr) {
    try {
      assetPath = await app.bridge.uploadAsset(file, fileName, { signal: options.signal });
      if (options.signal?.aborted) throw new DOMException("Aborted", "AbortError");
      if (typeof app.bridge.getImageOcrText === "function" && assetPath) {
        try {
          const cached = await app.bridge.getImageOcrText(assetPath);
          if (cached && cached.trim()) {
            return { text: cached.trim(), assetPath };
          }
        } catch {
          /* 缓存未命中继续走 OCR */
        }
      }
      if (assetPath) {
        const res = await app.bridge.assetOcr(assetPath, { signal: options.signal });
        if (res?.text?.trim()) {
          return { text: res.text.trim(), assetPath };
        }
      }
    } catch (err) {
      if (options.signal?.aborted || (err instanceof Error && err.name === "AbortError")) {
        throw err;
      }
      if (assetPath && typeof app?.bridge?.removeFile === "function") {
        const rmPath = assetPath.startsWith("/data/") ? assetPath : `/data/${assetPath.replace(/^\/+/, "")}`;
        try {
          await app.bridge.removeFile(rmPath);
          assetPath = undefined;
        } catch {
          /* 清理失败不影响后续降级 */
        }
      }
      if (isOcrUnavailableError(err)) {
        siyuanUnavailable = true;
      } else {
        siyuanErrorWarning = String(err instanceof Error ? err.message : err);
        if (!umiUrl) {
          return {
            text: "",
            assetPath,
            warning: siyuanErrorWarning,
          };
        }
      }
    }
  } else if (!options.skipSiyuanOcr) {
    siyuanUnavailable = true;
  }

  if (umiUrl) {
    try {
      const b64 = await blobToBase64(file);
      const umiText = await callUmiOcr(umiUrl, b64, options.signal);
      if (umiText.trim()) {
        return { text: umiText.trim(), assetPath };
      }
    } catch (err) {
      if (options.signal?.aborted || (err instanceof Error && err.name === "AbortError")) {
        throw err;
      }
      return {
        text: "",
        assetPath,
        ocrUnavailable: siyuanUnavailable,
        warning: `Umi-OCR 调用失败：${String(err instanceof Error ? err.message : err)}`,
      };
    }
  }

  return {
    text: "",
    assetPath,
    ocrUnavailable: siyuanUnavailable,
    warning: siyuanUnavailable
      ? "思源内置 OCR 引擎未开启，可在「思源设置 → OCR」启用或于插件设置配置本地 Umi-OCR (127.0.0.1:1224)。"
      : siyuanErrorWarning,
  };
}

/**
 * 提取 PDF 文件文本（L1 文本层免费直提 -> L2 扫描页渲染 PNG 后走思源原生图片 OCR / Umi-OCR 降级）
 */
export async function extractPdfPaperTextWithFallback(
  app: any,
  bytes: Uint8Array,
  options: {
    fileName?: string;
    maxPages?: number;
    umiOcrEndpoint?: string;
    signal?: AbortSignal;
    onProgress?: (p: PdfExtractionProgress) => void;
    pdfjsOverride?: PdfJsModuleLike;
  } = {},
): Promise<PdfExtractionOutcome> {
  const pdfjs = options.pdfjsOverride ?? (await loadChunk<PdfJsModuleLike>("pdfjs"));
  const l1 = await extractPdfPagesFromBytes(pdfjs, bytes, {
    maxPages: options.maxPages,
    signal: options.signal,
    onProgress: ({ page, total }) => {
      options.onProgress?.({
        phase: "text",
        page,
        total,
        message: `正在读取 PDF 文字层（第 ${page}/${total} 页）…`,
      });
    },
  });

  if (l1.scannedPages.length === 0) {
    return {
      text: l1.combinedText,
      totalPages: l1.totalPages,
      textPagesCount: l1.textPagesCount,
      ocrPagesCount: 0,
      scannedPagesCount: 0,
      failedOcrPages: [],
      notice: `已直接提取文字型 PDF 全部 ${l1.totalPages} 页文本（零外部 OCR 依赖）。`,
      ocrUnavailable: false,
    };
  }

  // 对纯图片/扫描页尝试 L2：先探活思源原生 OCR 可用性再上传整页 PNG（不可用时自动平滑降级到 Umi-OCR，不留冗余废图）
  const pageTexts = l1.pages.map((p) => p.text);
  let ocrPagesCount = 0;
  const failedOcrPages: number[] = [];
  let ocrUnavailable = false;
  let siyuanDisabled = false;

  if (app?.kernelOnline && app?.bridge?.assetOcr) {
    const syOcrReady = await probeSiyuanOcrAvailability(app, options.signal);
    if (!syOcrReady) {
      siyuanDisabled = true;
      ocrUnavailable = true;
    }
  } else {
    siyuanDisabled = true;
    ocrUnavailable = true;
  }

  for (let i = 0; i < l1.scannedPages.length; i++) {
    if (options.signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }
    const pageNum = l1.scannedPages[i];
    options.onProgress?.({
      phase: "ocr",
      page: pageNum,
      total: l1.totalPages,
      message: `第 ${pageNum}/${l1.totalPages} 页为扫描图像，正在尝试图像 OCR（${i + 1}/${l1.scannedPages.length}）…`,
    });

    if (siyuanDisabled && !(options.umiOcrEndpoint ?? "").trim()) {
      failedOcrPages.push(pageNum);
      continue;
    }

    const pngBlob = await renderPdfPageToPng(pdfjs, bytes, pageNum);
    if (!pngBlob) {
      failedOcrPages.push(pageNum);
      continue;
    }

    const ocrRes = await recognizeImageBlobWithFallback(app, pngBlob, {
      fileName: `${(options.fileName || "pdf-page").replace(/\.pdf$/i, "")}-p${pageNum}.png`,
      umiOcrEndpoint: options.umiOcrEndpoint,
      signal: options.signal,
      skipSiyuanOcr: siyuanDisabled,
    });
    if (ocrRes.ocrUnavailable) {
      ocrUnavailable = true;
      siyuanDisabled = true;
    }
    if (ocrRes.text) {
      pageTexts[pageNum - 1] = ocrRes.text;
      ocrPagesCount++;
    } else {
      failedOcrPages.push(pageNum);
    }
  }

  const combined = pageTexts.map((t) => t.trim()).filter(Boolean).join("\n\n");
  const notice =
    failedOcrPages.length > 0 && (ocrUnavailable || (ocrPagesCount === 0 && l1.textPagesCount === 0))
      ? buildPdfScanGuidanceMessage(l1.scannedPages.length, l1.totalPages, l1.textPagesCount)
      : failedOcrPages.length > 0
        ? `PDF 共 ${l1.totalPages} 页：文字层 ${l1.textPagesCount} 页、OCR ${ocrPagesCount} 页，另有 ${failedOcrPages.length} 页未能识别（已保留已成功页面）。`
        : `PDF 共 ${l1.totalPages} 页提取完成（文字层 ${l1.textPagesCount} 页 + 图像 OCR ${ocrPagesCount} 页）。`;

  return {
    text: combined,
    totalPages: l1.totalPages,
    textPagesCount: l1.textPagesCount,
    ocrPagesCount,
    scannedPagesCount: l1.scannedPages.length,
    failedOcrPages,
    notice,
    ocrUnavailable,
  };
}
