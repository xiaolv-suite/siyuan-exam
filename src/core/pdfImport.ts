/**
 * 纯函数 PDF 文本层坐标排序、双栏布局还原与扫描页探测引擎 (PDF Import Core)
 * 职责：
 * 1. 基于 pdf.js 文本项 (x, y, width, str) 智能还原单栏/双栏阅读顺序；
 * 2. 判定每页文字密度，自动分流「L1 免费直提文本页」与「L2 需要图像 OCR 的扫描页」；
 * 3. 提供 Umi-OCR HTTP 调用与友好的非崩溃扫描件兜底引导文案。
 */

export interface PdfTextItemLike {
  str?: string;
  transform?: number[];
  width?: number;
  height?: number;
  hasEOL?: boolean;
}

export interface PdfViewportLike {
  width: number;
  height: number;
}

export interface PdfPageLike {
  getViewport: (opts: { scale: number }) => PdfViewportLike;
  getTextContent: () => Promise<{ items: PdfTextItemLike[] }>;
  render?: (opts: { canvasContext: CanvasRenderingContext2D; viewport: PdfViewportLike }) => { promise: Promise<void> };
}

export interface PdfDocumentLike {
  numPages: number;
  getPage: (pageNum: number) => Promise<PdfPageLike>;
  destroy?: () => Promise<void> | void;
}

export interface PdfJsModuleLike {
  getDocument: (src: {
    data: Uint8Array;
    useSystemFonts?: boolean;
    disableFontFace?: boolean;
    verbosity?: number;
  }) => { promise: Promise<PdfDocumentLike> };
}

export interface ExtractedPdfPage {
  page: number;
  text: string;
  nonWsChars: number;
  needsOcr: boolean;
}

export interface ExtractedPdfResult {
  totalPages: number;
  pages: ExtractedPdfPage[];
  combinedText: string;
  textPagesCount: number;
  scannedPages: number[];
}

interface PositionedItem {
  str: string;
  x: number;
  y: number;
  w: number;
}

function joinLineItems(items: PositionedItem[]): string {
  if (items.length === 0) return "";
  const sorted = [...items].sort((a, b) => a.x - b.x);
  let out = "";
  let prevRight = sorted[0].x;
  for (let i = 0; i < sorted.length; i++) {
    const it = sorted[i];
    const s = it.str;
    if (!s) continue;
    if (i > 0 && out.length > 0) {
      const gap = it.x - prevRight;
      const lastChar = out[out.length - 1];
      const firstChar = s[0];
      const bothAscii = /[\x21-\x7e]/.test(lastChar) && /[\x21-\x7e]/.test(firstChar);
      if (gap > (bothAscii ? 1.5 : 5)) {
        out += " ";
      }
    }
    out += s;
    prevRight = it.x + Math.max(it.w, s.length * 4);
  }
  return out.replace(/\s{2,}/g, " ").trim();
}

function groupPositionedItemsToLineEntries(items: PositionedItem[], yTolerance = 4): Array<{ y: number; text: string }> {
  if (items.length === 0) return [];
  // PDF 坐标原点在左下角，y 越大越靠上
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const rows: PositionedItem[][] = [];
  for (const item of sorted) {
    const lastRow = rows[rows.length - 1];
    if (lastRow && Math.abs(lastRow[0].y - item.y) <= yTolerance) {
      lastRow.push(item);
    } else {
      rows.push([item]);
    }
  }
  return rows
    .map((row) => ({ y: row[0].y, text: joinLineItems(row) }))
    .filter((entry) => Boolean(entry.text));
}

function groupPositionedItemsToLines(items: PositionedItem[], yTolerance = 4): string[] {
  return groupPositionedItemsToLineEntries(items, yTolerance).map((e) => e.text);
}

/**
 * 将单页 PDF 文本项组装为按阅读顺序排列的行文本（自动探测并还原左右双栏排版）
 */
export function assemblePdfPageLines(items: readonly PdfTextItemLike[], pageWidth = 600): string[] {
  const positioned: PositionedItem[] = [];
  for (const raw of items) {
    const str = String(raw?.str ?? "");
    if (!str.trim()) continue;
    const tf = Array.isArray(raw.transform) ? raw.transform : [1, 0, 0, 1, 0, 0];
    positioned.push({
      str,
      x: Number(tf[4] ?? 0),
      y: Number(tf[5] ?? 0),
      w: Number(raw.width ?? 0),
    });
  }
  if (positioned.length === 0) return [];

  // 双栏探测：若左右两栏在中线附近存在明显空白沟壑且每栏均有充足文本项，则先左栏后右栏
  const midX = pageWidth / 2;
  const gutterHalf = Math.max(8, pageWidth * 0.02);
  const leftItems: PositionedItem[] = [];
  const rightItems: PositionedItem[] = [];
  const crossingList: PositionedItem[] = [];

  for (const it of positioned) {
    const rightEdge = it.x + it.w;
    if (rightEdge <= midX - gutterHalf) {
      leftItems.push(it);
    } else if (it.x >= midX + gutterHalf) {
      rightItems.push(it);
    } else {
      crossingList.push(it);
    }
  }

  const isTwoColumn =
    leftItems.length >= 6 &&
    rightItems.length >= 6 &&
    crossingList.length / positioned.length < 0.12;

  if (isTwoColumn) {
    if (crossingList.length === 0) {
      return [...groupPositionedItemsToLines(leftItems), ...groupPositionedItemsToLines(rightItems)];
    }
    // 保留跨中线大标题/大题号项，按纵坐标分段穿插排序（先栏段内左栏→右栏，再跨栏行）
    const crossingRows = groupPositionedItemsToLineEntries(crossingList);
    const out: string[] = [];
    let remLeft = [...leftItems];
    let remRight = [...rightItems];

    for (const cRow of crossingRows) {
      const aboveLeft = remLeft.filter((it) => it.y > cRow.y + 4);
      const aboveRight = remRight.filter((it) => it.y > cRow.y + 4);
      remLeft = remLeft.filter((it) => it.y <= cRow.y + 4);
      remRight = remRight.filter((it) => it.y <= cRow.y + 4);
      if (aboveLeft.length) out.push(...groupPositionedItemsToLines(aboveLeft));
      if (aboveRight.length) out.push(...groupPositionedItemsToLines(aboveRight));
      out.push(cRow.text);
    }
    if (remLeft.length) out.push(...groupPositionedItemsToLines(remLeft));
    if (remRight.length) out.push(...groupPositionedItemsToLines(remRight));
    return out;
  }

  return groupPositionedItemsToLines(positioned);
}

/**
 * 使用 pdfjs-dist 提取 PDF 各页文本层（L1 零外部依赖直提），自动识别纯扫描页
 */
export async function extractPdfPagesFromBytes(
  pdfjs: PdfJsModuleLike,
  bytes: Uint8Array,
  options: {
    maxPages?: number;
    minTextCharsPerPage?: number;
    onProgress?: (info: { page: number; total: number }) => void;
    signal?: AbortSignal;
  } = {},
): Promise<ExtractedPdfResult> {
  const minChars = options.minTextCharsPerPage ?? 24;
  // pdfjs.getDocument 会转移/消耗传入 TypedArray，克隆副本保护原始 bytes 供后续扫描页渲染
  const dataCopy = new Uint8Array(bytes.byteLength);
  dataCopy.set(bytes);
  const doc = await pdfjs.getDocument({
    data: dataCopy,
    useSystemFonts: true,
    disableFontFace: true,
    verbosity: 0,
  }).promise;

  try {
    const totalPages = options.maxPages ? Math.min(doc.numPages, options.maxPages) : doc.numPages;
    const pages: ExtractedPdfPage[] = [];
    const scannedPages: number[] = [];
    let textPagesCount = 0;

    for (let p = 1; p <= totalPages; p++) {
      if (options.signal?.aborted) {
        throw new DOMException("Aborted", "AbortError");
      }
      options.onProgress?.({ page: p, total: totalPages });
      const page = await doc.getPage(p);
      const viewport = page.getViewport({ scale: 1 });
      const tc = await page.getTextContent();
      const lines = assemblePdfPageLines(tc.items ?? [], viewport.width || 600);
      const text = lines.join("\n").trim();
      const nonWsChars = text.replace(/\s+/g, "").length;
      const needsOcr = nonWsChars < minChars;
      if (needsOcr) scannedPages.push(p);
      else textPagesCount++;
      pages.push({ page: p, text, nonWsChars, needsOcr });
    }

    const combinedText = pages
      .filter((p) => p.text)
      .map((p) => p.text)
      .join("\n\n");

    return {
      totalPages,
      pages,
      combinedText,
      textPagesCount,
      scannedPages,
    };
  } finally {
    try {
      await doc.destroy?.();
    } catch {
      /* ignore */
    }
  }
}

export function isOcrUnavailableError(err: unknown): boolean {
  const msg = String(err instanceof Error ? err.message : err ?? "").toLowerCase();
  return (
    msg.includes("ocr provider is unavailable") ||
    msg.includes("tesseract") ||
    (msg.includes("ocr") && (msg.includes("unavailable") || msg.includes("fatal")))
  );
}

/**
 * 调用本机 Umi-OCR HTTP 服务识别单张图片 Base64（默认端口 http://127.0.0.1:1224/api/ocr）
 */
export async function callUmiOcr(
  endpoint: string,
  imageBase64: string,
  signal?: AbortSignal,
): Promise<string> {
  const cleanUrl = endpoint.trim();
  if (!cleanUrl) return "";
  const pureB64 = imageBase64.replace(/^data:image\/[^;]+;base64,/, "");
  const res = await fetch(cleanUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      base64: pureB64,
      options: { "tbpu.parser": "multi_para" },
    }),
    signal,
  });
  if (!res.ok) {
    throw new Error(`Umi-OCR HTTP ${res.status}`);
  }
  const json = (await res.json()) as {
    code?: number;
    data?: Array<{ text?: string }> | string;
  };
  if (json.code === 100 && Array.isArray(json.data)) {
    return json.data.map((item) => String(item?.text ?? "")).filter(Boolean).join("\n");
  }
  if (json.code === 101) {
    return "";
  }
  if (typeof json.data === "string" && json.code !== 100) {
    throw new Error(json.data);
  }
  return "";
}

export function buildPdfScanGuidanceMessage(
  scannedCount: number,
  totalCount: number,
  extractedPagesCount = 0,
): string {
  const prefix = extractedPagesCount > 0
    ? `已从文字层提取 ${extractedPagesCount}/${totalCount} 页，另有 ${scannedCount} 页为图片/扫描件`
    : `该 PDF 共 ${totalCount} 页，均为图片型扫描件（未检测到内嵌文字层）`;
  return `${prefix}，且当前未启用可用 OCR 引擎。可在「思源设置 → OCR」开启内置识图，在插件设置填写本机 Umi-OCR（http://127.0.0.1:1224/api/ocr）地址，或截图粘贴到 AI 出题工作台使用视觉模型识图。`;
}
