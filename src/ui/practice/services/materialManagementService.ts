// ============================================================
// 学习资料与资料笔记服务（materialManagementService.ts）
// 承接资料登记、外链解析、笔记增删改、资料定位跳转与桥接到出题
// 纯逻辑解耦，不绑定 Svelte 渲染态
// ============================================================

import type { MaterialDoc } from "@/core/materials";
import type { MaterialNote, NoteLocator } from "@/core/materialNotes";
import { parseTimeToSec, formatSecToTime } from "@/core/materialNotes";
import { locatedUrl } from "@/core/materialNotes";
import { escapeHtml } from "@/libs/sanitize";
import { safeDocTitleFromHPath } from "@/libs/lv-notice-kit";
import { loadChunk } from "@/libs/chunk-loader";
import { extractPdfPagesFromBytes, type PdfJsModuleLike } from "@/core/pdfImport";
import { AI_CHUNK_MAX_CHARS, sliceText, truncateAtNaturalBoundary } from "@/ai/gen";

export const MAX_MATERIAL_AI_CHARS = 24000;
export const MATERIAL_PDF_PAGE_BATCH = 30;

export interface MaterialExtractMeta {
  kind: string;
  totalPages?: number;
  pageStart?: number;
  pageEnd?: number;
  sentChars: number;
  totalChars: number;
  truncated: boolean;
  hasMorePages: boolean;
  nextStartPage?: number;
  chunkCount: number;
}

export interface MaterialRegisterMeta {
  subject?: string;
  chapter?: string;
}

export interface MaterialFileResult {
  material: MaterialDoc;
  deduped: boolean;
  message: string;
}

export interface MaterialLinkResult {
  material: MaterialDoc;
  deduped: boolean;
  message: string;
}

export interface NoteFormInput {
  editingId?: string;
  text: string;
  page?: string;
  time?: string;
  quote?: string;
  tags?: string;
}

/** 获取资料类型对应的通用图标 */
export function getMaterialIconName(kind: string): string {
  if (kind === "pdf") return "table";
  if (kind === "video") return "play";
  if (kind === "audio") return "volume";
  if (kind === "image") return "file";
  if (kind === "doc") return "file";
  return "folder";
}

/** 登记本地文件资料 */
export async function registerMaterialFile(
  app: any,
  file: File,
  meta: MaterialRegisterMeta,
  t: (k: string) => string,
): Promise<MaterialFileResult> {
  const { material, deduped } = await app.registerMaterialFromFile(file, {
    subject: meta.subject,
    chapter: meta.chapter,
  });
  const message = deduped ? t("materials.deduped") : `✓ ${t("materials.registered")} ${material.title}`;
  return { material, deduped, message };
}

/** 登记外部链接资料（支持思源块链接反查标题） */
export async function registerMaterialLinkInput(
  app: any,
  rawLinkInput: string,
  rawTitleInput: string,
  meta: MaterialRegisterMeta,
  t: (k: string) => string,
): Promise<MaterialLinkResult> {
  const rawLink = rawLinkInput.trim();
  let titleToUse = rawTitleInput.trim();

  const blockMatch =
    rawLink.match(/siyuan:\/\/blocks\/([0-9a-zA-Z-]+)/) ||
    (rawLink.length === 22 && rawLink.match(/^([0-9]{14}-[0-9a-z]{7})$/));

  if (blockMatch && !titleToUse && app?.kernelOnline && app?.bridge?.sql) {
    try {
      const blockId = blockMatch[1];
      const rows = await app.bridge.sql(`SELECT content, hpath FROM blocks WHERE id='${blockId.replace(/'/g, "''")}' LIMIT 1`);
      if (rows && rows[0]) {
        titleToUse =
          String(rows[0].content || "").trim().slice(0, 40) ||
          safeDocTitleFromHPath(rows[0].hpath, "");
      }
    } catch {
      // 容错降级
    }
  }

  const { material, deduped } = await app.registerMaterialFromLink(rawLink, {
    title: titleToUse,
    subject: meta.subject,
    chapter: meta.chapter,
  });

  const message = deduped ? t("materials.deduped") : `✓ ${t("materials.registered")} ${material.title}`;
  return { material, deduped, message };
}

/** 移除资料 */
export async function removeMaterialWithConfirm(
  app: any,
  material: MaterialDoc,
  confirmFn: (opts: { title: string; content: string }) => Promise<boolean>,
  t: (k: string) => string,
): Promise<{ success: boolean; message: string }> {
  const ok = await confirmFn({
    title: t("materials.removeTitle"),
    content: `${escapeHtml(material.title)}<br><span style="font-size:var(--lv-font-size-sm);color:var(--lv-text-3)">${t("materials.removeNote")}</span>`,
  });
  if (!ok) return { success: false, message: "" };

  await app.removeMaterialById(material.id);
  return { success: true, message: t("materials.removed") };
}

/** 保存或更新资料笔记 */
export async function saveMaterialNoteItem(
  app: any,
  material: { id: string; revision: number },
  form: NoteFormInput,
  t: (k: string) => string,
): Promise<{ success: boolean; message: string }> {
  const text = form.text.trim();
  if (!text) throw new Error("笔记内容不能为空");

  const page = form.page?.trim() ? Number(form.page.trim()) : undefined;
  if (form.page?.trim() && (!Number.isInteger(page) || page! < 1)) {
    throw new Error(t("materials.badPage"));
  }

  const tSec = form.time?.trim() ? parseTimeToSec(form.time.trim()) : undefined;
  const quote = form.quote?.trim() || undefined;
  const locator: NoteLocator | null =
    page == null && tSec == null && !quote ? null : { page, tSec, quote };
  const tags = (form.tags ?? "").split(/[,，]/).map((s) => s.trim()).filter(Boolean);

  if (form.editingId) {
    await app.updateMaterialNote(form.editingId, { locator, text, tags });
  } else {
    await app.addMaterialNote({
      materialId: material.id,
      revision: material.revision,
      locator,
      text,
      tags,
    });
  }

  return { success: true, message: t("materials.noteSaved") };
}

/** 移除笔记条目 */
export async function removeMaterialNoteWithConfirm(
  app: any,
  note: MaterialNote,
  confirmFn: (opts: { title: string; content: string }) => Promise<boolean>,
  t: (k: string) => string,
): Promise<{ success: boolean }> {
  const ok = await confirmFn({
    title: t("materials.noteDelTitle"),
    content: escapeHtml(note.text.slice(0, 80)),
  });
  if (!ok) return { success: false };

  await app.deleteMaterialNote(note.id);
  return { success: true };
}

/** 计算定位打开的目标 URL */
export function resolveMaterialLocatedUrl(
  app: any,
  material: MaterialDoc,
  locator?: NoteLocator | null,
  origin?: string,
): string | null {
  const currentOrigin = origin ?? (typeof window !== "undefined" ? window.location.origin : "");
  const base = app.resolveMaterialUrlOf(material, currentOrigin);
  if (!base) return null;
  return locatedUrl(base, locator);
}

function readU16LE(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readU32LE(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset] |
    (bytes[offset + 1] << 8) |
    (bytes[offset + 2] << 16) |
    (bytes[offset + 3] << 24)
  ) >>> 0;
}

function decodeXmlEntities(str: string): string {
  return str
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_m, dec: string) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

async function decompressZipPayload(compression: number, payload: Uint8Array): Promise<Uint8Array | null> {
  if (compression === 0) return payload;
  if (compression !== 8) return null;
  if (typeof DecompressionStream !== "undefined") {
    try {
      const ds = new DecompressionStream("deflate-raw");
      const writer = ds.writable.getWriter();
      const copy = new Uint8Array(payload.byteLength);
      copy.set(payload);
      const writePromise = writer.write(copy).then(() => writer.close());
      const resPromise = new Response(ds.readable).arrayBuffer();
      const [, ab] = await Promise.all([writePromise, resPromise]);
      return new Uint8Array(ab);
    } catch {
      /* 降级尝试其他解压路径 */
    }
  }
  return null;
}

interface ZipEntryMeta {
  fileName: string;
  compression: number;
  compressedSize: number;
  dataOffset: number;
}

function findZipEntriesFromCentralDirectory(bytes: Uint8Array): Map<string, ZipEntryMeta> | null {
  // 扫描 End of Central Directory (PK\x05\x06)，距文件尾最多 65KB + 22B
  const minPos = Math.max(0, bytes.length - 65558);
  let eocdOffset = -1;
  for (let i = bytes.length - 22; i >= minPos; i--) {
    if (bytes[i] === 0x50 && bytes[i + 1] === 0x4b && bytes[i + 2] === 0x05 && bytes[i + 3] === 0x06) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset < 0) return null;

  const cdOffset = readU32LE(bytes, eocdOffset + 16);
  const totalEntries = readU16LE(bytes, eocdOffset + 10);
  if (cdOffset >= bytes.length) return null;

  const entries = new Map<string, ZipEntryMeta>();
  const decoder = new TextDecoder();
  let pos = cdOffset;

  for (let idx = 0; idx < totalEntries && pos + 46 <= bytes.length; idx++) {
    if (bytes[pos] !== 0x50 || bytes[pos + 1] !== 0x4b || bytes[pos + 2] !== 0x01 || bytes[pos + 3] !== 0x02) {
      break;
    }
    const compression = readU16LE(bytes, pos + 10);
    const compressedSize = readU32LE(bytes, pos + 20);
    const fnLen = readU16LE(bytes, pos + 28);
    const extraLen = readU16LE(bytes, pos + 30);
    const commentLen = readU16LE(bytes, pos + 32);
    const localHeaderOffset = readU32LE(bytes, pos + 42);
    const fileName = decoder.decode(bytes.subarray(pos + 46, pos + 46 + fnLen));

    if (
      localHeaderOffset + 30 <= bytes.length &&
      bytes[localHeaderOffset] === 0x50 &&
      bytes[localHeaderOffset + 1] === 0x4b &&
      bytes[localHeaderOffset + 2] === 0x03 &&
      bytes[localHeaderOffset + 3] === 0x04
    ) {
      const lfhFnLen = readU16LE(bytes, localHeaderOffset + 26);
      const lfhExtraLen = readU16LE(bytes, localHeaderOffset + 28);
      const dataOffset = localHeaderOffset + 30 + lfhFnLen + lfhExtraLen;
      entries.set(fileName, { fileName, compression, compressedSize, dataOffset });
    }
    pos += 46 + fnLen + extraLen + commentLen;
  }

  return entries.size > 0 ? entries : null;
}

function findNextZipRecordOffset(bytes: Uint8Array, start: number): number {
  for (let i = start; i <= bytes.length - 4; i++) {
    if (bytes[i] === 0x50 && bytes[i + 1] === 0x4b) {
      const b2 = bytes[i + 2];
      const b3 = bytes[i + 3];
      if ((b2 === 0x07 && b3 === 0x08) || (b2 === 0x03 && b3 === 0x04) || (b2 === 0x01 && b3 === 0x02)) {
        return i;
      }
    }
  }
  return bytes.length;
}

function findZipEntriesFromLocalHeaders(bytes: Uint8Array): Map<string, ZipEntryMeta> {
  const entries = new Map<string, ZipEntryMeta>();
  const decoder = new TextDecoder();
  let offset = 0;

  while (offset <= bytes.length - 30) {
    if (bytes[offset] === 0x50 && bytes[offset + 1] === 0x4b && bytes[offset + 2] === 0x03 && bytes[offset + 3] === 0x04) {
      const flags = readU16LE(bytes, offset + 6);
      const compression = readU16LE(bytes, offset + 8);
      let compressedSize = readU32LE(bytes, offset + 18);
      const fnLen = readU16LE(bytes, offset + 26);
      const extraLen = readU16LE(bytes, offset + 28);
      const fileName = decoder.decode(bytes.subarray(offset + 30, offset + 30 + fnLen));
      const dataOffset = offset + 30 + fnLen + extraLen;

      // 兼容 Bit-3 Data Descriptor 流式写入（LFH 内 compressedSize 为 0）
      if ((flags & 0x08) !== 0 && compressedSize === 0) {
        const nextRec = findNextZipRecordOffset(bytes, dataOffset);
        compressedSize = Math.max(0, nextRec - dataOffset);
      }

      entries.set(fileName, { fileName, compression, compressedSize, dataOffset });
      offset = dataOffset + compressedSize;
      // 跳过紧随其后的 PK\x07\x08 Data Descriptor（16 字节）
      if (
        offset + 16 <= bytes.length &&
        bytes[offset] === 0x50 &&
        bytes[offset + 1] === 0x4b &&
        bytes[offset + 2] === 0x07 &&
        bytes[offset + 3] === 0x08
      ) {
        offset += 16;
      }
    } else {
      offset++;
    }
  }
  return entries;
}

function extractBalancedTagContent(xml: string, tagName: string): string {
  const openRe = new RegExp(`<${tagName}(?:\\s[^>]*)?>`, "i");
  const m = openRe.exec(xml);
  if (!m) return "";
  const start = m.index + m[0].length;
  let depth = 1;
  const stepRe = new RegExp(`<(\\/?)${tagName}(?:\\s[^>]*)?>`, "gi");
  stepRe.lastIndex = start;
  let step: RegExpExecArray | null;
  while ((step = stepRe.exec(xml)) !== null) {
    if (step[1] === "/") {
      depth--;
      if (depth === 0) return xml.slice(start, step.index);
    } else {
      depth++;
    }
  }
  return xml.slice(start);
}

function ommlNodeToLatex(ommlXml: string): string {
  let s = ommlXml;
  // 递归转换嵌套分式/根式/上下标/括号/求和积分
  const replaceNested = (tag: string, handler: (inner: string, rawTag: string) => string) => {
    const openRe = new RegExp(`<${tag}(?:\\s[^>]*)?>`, "i");
    let guard = 0;
    while (guard++ < 64) {
      const m = openRe.exec(s);
      if (!m) break;
      const openIdx = m.index;
      const bodyStart = openIdx + m[0].length;
      let depth = 1;
      let closeEnd = s.length;
      let bodyEnd = s.length;
      const stepRe = new RegExp(`<(\\/?)${tag}(?:\\s[^>]*)?>`, "gi");
      stepRe.lastIndex = bodyStart;
      let step: RegExpExecArray | null;
      while ((step = stepRe.exec(s)) !== null) {
        if (step[1] === "/") {
          depth--;
          if (depth === 0) {
            bodyEnd = step.index;
            closeEnd = step.index + step[0].length;
            break;
          }
        } else {
          depth++;
        }
      }
      const inner = s.slice(bodyStart, bodyEnd);
      const replaced = handler(inner, m[0]);
      s = s.slice(0, openIdx) + replaced + s.slice(closeEnd);
    }
  };

  replaceNested("m:f", (inner) => {
    const num = ommlNodeToLatex(extractBalancedTagContent(inner, "m:num"));
    const den = ommlNodeToLatex(extractBalancedTagContent(inner, "m:den"));
    return `\\frac{${num}}{${den}}`;
  });
  replaceNested("m:rad", (inner) => {
    const deg = ommlNodeToLatex(extractBalancedTagContent(inner, "m:deg")).trim();
    const e = ommlNodeToLatex(extractBalancedTagContent(inner, "m:e"));
    return deg ? `\\sqrt[${deg}]{${e}}` : `\\sqrt{${e}}`;
  });
  replaceNested("m:sSubSup", (inner) => {
    const e = ommlNodeToLatex(extractBalancedTagContent(inner, "m:e"));
    const sub = ommlNodeToLatex(extractBalancedTagContent(inner, "m:sub"));
    const sup = ommlNodeToLatex(extractBalancedTagContent(inner, "m:sup"));
    return `${e}_{${sub}}^{${sup}}`;
  });
  replaceNested("m:sSup", (inner) => {
    const e = ommlNodeToLatex(extractBalancedTagContent(inner, "m:e"));
    const sup = ommlNodeToLatex(extractBalancedTagContent(inner, "m:sup"));
    return `${e}^{${sup}}`;
  });
  replaceNested("m:sSub", (inner) => {
    const e = ommlNodeToLatex(extractBalancedTagContent(inner, "m:e"));
    const sub = ommlNodeToLatex(extractBalancedTagContent(inner, "m:sub"));
    return `${e}_{${sub}}`;
  });
  replaceNested("m:nary", (inner) => {
    const chr = inner.match(/<m:chr\b[^>]*m:val="([^"]+)"/i)?.[1] ?? "∑";
    const op = chr === "∫" ? "\\int" : chr === "∏" ? "\\prod" : "\\sum";
    const sub = ommlNodeToLatex(extractBalancedTagContent(inner, "m:sub"));
    const sup = ommlNodeToLatex(extractBalancedTagContent(inner, "m:sup"));
    const e = ommlNodeToLatex(extractBalancedTagContent(inner, "m:e"));
    return `${op}${sub ? `_{${sub}}` : ""}${sup ? `^{${sup}}` : ""} ${e}`;
  });
  replaceNested("m:d", (inner) => {
    const beg = inner.match(/<m:begChr\b[^>]*m:val="([^"]+)"/i)?.[1] ?? "(";
    const end = inner.match(/<m:endChr\b[^>]*m:val="([^"]+)"/i)?.[1] ?? ")";
    const e = ommlNodeToLatex(extractBalancedTagContent(inner, "m:e"));
    return `${beg}${e}${end}`;
  });

  // 剥离剩余 XML 标签并解码实体
  const plain = decodeXmlEntities(
    s
      .replace(/<m:t[^>]*>([\s\S]*?)<\/m:t>/gi, "$1")
      .replace(/<[^>]+>/g, ""),
  );
  return plain.replace(/\s+/g, " ").trim();
}

function parseDocxRels(relsXml: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const m of relsXml.matchAll(/<Relationship\b[^>]*>/gi)) {
    const tag = m[0];
    const id = tag.match(/\bId="([^"]+)"/i)?.[1];
    const target = tag.match(/\bTarget="([^"]+)"/i)?.[1];
    if (id && target) {
      map.set(id, target.replace(/^.*\//, ""));
    }
  }
  return map;
}

function extractDocxParagraphText(pXml: string, relsMap: Map<string, string>): string {
  let xml = pXml;
  // 1) 块级公式 <m:oMathPara> 与行内公式 <m:oMath>
  xml = xml.replace(/<m:oMathPara\b[^>]*>([\s\S]*?)<\/m:oMathPara>/gi, (_m, inner: string) => {
    const tex = ommlNodeToLatex(inner);
    return tex ? `$$${tex}$$` : "";
  });
  xml = xml.replace(/<m:oMath\b[^>]*>([\s\S]*?)<\/m:oMath>/gi, (_m, inner: string) => {
    const tex = ommlNodeToLatex(inner);
    return tex ? `$${tex}$` : "";
  });
  // 2) 内嵌图片占位
  xml = xml.replace(/<w:drawing\b[\s\S]*?<\/w:drawing>|<w:pict\b[\s\S]*?<\/w:pict>/gi, (block) => {
    const rId = block.match(/\b(?:r:embed|r:id)="([^"]+)"/i)?.[1] ?? "";
    const mediaName = (rId && relsMap.get(rId)) || "image";
    return `[图片: ${mediaName}]`;
  });
  // 3) 换行与制表符
  xml = xml.replace(/<w:br\b[^>]*\/?>/gi, "\n").replace(/<w:tab\b[^>]*\/?>/gi, "\t");

  // 4) 按顺序收集纯文本与已转换的公式/图片占位
  const out: string[] = [];
  const tokenRe = /<w:t[^>]*>([\s\S]*?)<\/w:t>|\$\$[\s\S]*?\$\$|\$[^$\n]+\$|\[图片:\s*[^\]]+\]|\n|\t/g;
  let m: RegExpExecArray | null;
  while ((m = tokenRe.exec(xml)) !== null) {
    if (m[1] !== undefined) {
      out.push(decodeXmlEntities(m[1]));
    } else {
      out.push(m[0]);
    }
  }
  return out.join("").replace(/[ \t]+\n/g, "\n").trim();
}

/** 从 docx 二进制流中零依赖提取文字段落（兼容 Bit-3 流式 ZIP、XML 实体解码、OMML 基础公式与图片占位） */
export async function extractDocxTextFromBytes(bytes: Uint8Array): Promise<string> {
  const entries = findZipEntriesFromCentralDirectory(bytes) ?? findZipEntriesFromLocalHeaders(bytes);
  const docEntry = entries.get("word/document.xml");
  if (!docEntry || docEntry.compressedSize <= 0) return "";

  const end = Math.min(bytes.length, docEntry.dataOffset + docEntry.compressedSize);
  const rawPayload = bytes.subarray(docEntry.dataOffset, end);
  const decompressed = await decompressZipPayload(docEntry.compression, rawPayload);
  if (!decompressed) return "";
  const xml = new TextDecoder().decode(decompressed);
  if (!xml) return "";

  let relsMap = new Map<string, string>();
  const relsEntry = entries.get("word/_rels/document.xml.rels");
  if (relsEntry && relsEntry.compressedSize > 0) {
    const rEnd = Math.min(bytes.length, relsEntry.dataOffset + relsEntry.compressedSize);
    const rBytes = await decompressZipPayload(
      relsEntry.compression,
      bytes.subarray(relsEntry.dataOffset, rEnd),
    );
    if (rBytes) {
      relsMap = parseDocxRels(new TextDecoder().decode(rBytes));
    }
  }

  // 保留表格与段落顺序：先替换表格为 Markdown 表格占位，再按段落输出
  const tableBlocks: string[] = [];
  const xmlWithTables = xml.replace(/<w:tbl\b[^>]*>([\s\S]*?)<\/w:tbl>/gi, (_m, tblInner: string) => {
    const rows: string[] = [];
    for (const rowM of tblInner.matchAll(/<w:tr\b[^>]*>([\s\S]*?)<\/w:tr>/gi)) {
      const cells: string[] = [];
      for (const cellM of rowM[1].matchAll(/<w:tc\b[^>]*>([\s\S]*?)<\/w:tc>/gi)) {
        const cellParas = [...cellM[1].matchAll(/<w:p\b[^>]*>([\s\S]*?)<\/w:p>/gi)]
          .map((pm) => extractDocxParagraphText(pm[1], relsMap))
          .filter(Boolean);
        cells.push(cellParas.join(" ").replace(/\|/g, "\\|"));
      }
      if (cells.length > 0) {
        rows.push(`| ${cells.join(" | ")} |`);
        if (rows.length === 1) {
          rows.push(`| ${cells.map(() => "---").join(" | ")} |`);
        }
      }
    }
    if (rows.length === 0) return "";
    const idx = tableBlocks.length;
    tableBlocks.push(rows.join("\n"));
    return `<w:p><w:t>@@DOCXTBL_${idx}@@</w:t></w:p>`;
  });

  const paragraphs = xmlWithTables.split(/<\/w:p>/i);
  const lines = paragraphs
    .map((p) => {
      const tblMarker = p.match(/@@DOCXTBL_(\d+)@@/);
      if (tblMarker) return tableBlocks[Number(tblMarker[1])] ?? "";
      return extractDocxParagraphText(p, relsMap);
    })
    .filter(Boolean);

  return lines.join("\n\n");
}

export interface ExtractedMaterialDetail {
  text: string;
  totalPages?: number;
  pageStart?: number;
  pageEnd?: number;
  hasMorePages: boolean;
  pages?: Array<{ page: number; text: string }>;
}

/** 智能读取资料文件真实正文与页码元信息（Word / PDF 文本层 / Markdown / 纯文本 / 思源笔记） */
export async function extractMaterialDocDetail(
  app: any,
  material: MaterialDoc,
  options: { startPage?: number; maxPages?: number } = {},
): Promise<ExtractedMaterialDetail> {
  const siyuanLoc = material.locations.find((l) => /^siyuan:\/\/blocks\//i.test(l.path));
  if (siyuanLoc && app?.bridge?.exportDocMarkdown) {
    const blockIdMatch = siyuanLoc.path.match(/siyuan:\/\/blocks\/([0-9a-zA-Z-]+)/i);
    const docId = blockIdMatch ? blockIdMatch[1] : siyuanLoc.path;
    if (docId) {
      try {
        const res = await app.bridge.exportDocMarkdown(docId);
        if (res?.content?.trim()) {
          return { text: res.content, hasMorePages: false };
        }
      } catch {
        /* 继续尝试资产文件 */
      }
    }
  }

  const assetLoc = material.locations.find((l) => l.kind === "assets");
  if (!assetLoc || !app?.bridge?.getFileBytes) return { text: "", hasMorePages: false };
  try {
    const bytes = await app.bridge.getFileBytes(assetLoc.path);
    if (!bytes) return { text: "", hasMorePages: false };
    const pathLower = assetLoc.path.toLowerCase();
    if (pathLower.endsWith(".docx")) {
      return { text: await extractDocxTextFromBytes(bytes), hasMorePages: false };
    }
    if (pathLower.endsWith(".pdf") || material.kind === "pdf") {
      const pdfjs = await loadChunk<PdfJsModuleLike>("pdfjs");
      const startPage = Math.max(1, options.startPage ?? 1);
      const maxPages = options.maxPages ?? MATERIAL_PDF_PAGE_BATCH;
      const res = await extractPdfPagesFromBytes(pdfjs, bytes, { startPage, maxPages });
      const totalDocPages = res.totalDocumentPages ?? (startPage + res.totalPages - 1);
      const lastReadPage = res.pages.length ? res.pages[res.pages.length - 1]!.page : startPage - 1;
      return {
        text: res.combinedText,
        totalPages: totalDocPages,
        pageStart: res.pages.length ? res.pages[0]!.page : startPage,
        pageEnd: lastReadPage,
        hasMorePages: lastReadPage < totalDocPages,
        pages: res.pages.map((p) => ({ page: p.page, text: p.text })),
      };
    }
    if (/\.(txt|md|text|csv|tsv|json)$/i.test(pathLower)) {
      return { text: new TextDecoder().decode(bytes), hasMorePages: false };
    }
  } catch {
    // 容错降级
  }
  return { text: "", hasMorePages: false };
}

/** 智能读取资料文件真实正文（Word / PDF 文本层 / Markdown / 纯文本 / 思源笔记） */
export async function extractMaterialDocText(app: any, material: MaterialDoc): Promise<string> {
  const detail = await extractMaterialDocDetail(app, material);
  return detail.text;
}

/** 桥接资料到手工录题（纯函数，同步返回） */
export function bridgeMaterialToManual(
  material: MaterialDoc,
  noteText = "",
): { source: string; stem: string; toast: string } {
  const source = [material.subject, material.chapter, material.title].filter(Boolean).join(" / ");
  return {
    source,
    stem: noteText || "",
    toast: `已将资料《${material.title}》带入手工录题！`,
  };
}

/** 桥接资料到 AI 出题工作台（纯函数，同步返回） */
export function bridgeMaterialToAi(
  app: any,
  material: MaterialDoc,
  noteText = "",
): { content: string; toast: string } {
  const notes = app.listMaterialNotes(material.id).map((n: MaterialNote) => n.text).join("\n\n");
  const content = [
    `【资料出处】${[material.subject, material.chapter, material.title].filter(Boolean).join(" / ")}`,
    noteText ? `【重点笔记】\n${noteText}` : notes ? `【资料笔记】\n${notes}` : "",
  ].filter(Boolean).join("\n\n");

  return {
    content,
    toast: `已将资料《${material.title}》带入 AI 出题工作台！`,
  };
}

/** 异步读取资料正文并桥接资料到手工录题 */
export async function bridgeMaterialToManualAsync(
  app: any,
  material: MaterialDoc,
  noteText = "",
): Promise<{ source: string; stem: string; toast: string }> {
  const source = [material.subject, material.chapter, material.title].filter(Boolean).join(" / ");
  let stem = noteText || "";
  if (!stem && app) {
    const fileText = await extractMaterialDocText(app, material);
    stem = truncateAtNaturalBoundary(fileText, 300).text;
  }
  return {
    source,
    stem,
    toast: `已将资料《${material.title}》正文与出处带入手工录题！`,
  };
}

/** 异步读取资料正文并桥接资料到 AI 出题工作台（放宽至 24,000 字，按自然段落/题号边界截断并诚实回传页码与分段提示） */
export async function bridgeMaterialToAiAsync(
  app: any,
  material: MaterialDoc,
  noteText = "",
  options: { startPage?: number; maxChars?: number } = {},
): Promise<{ content: string; toast: string; meta: MaterialExtractMeta }> {
  const notes = app?.listMaterialNotes?.(material.id)?.map((n: MaterialNote) => n.text).join("\n\n") ?? "";
  const detail = app ? await extractMaterialDocDetail(app, material, { startPage: options.startPage }) : { text: "", hasMorePages: false };
  const noteSection = (noteText || notes).trim();
  const maxBodyChars = options.maxChars ?? MAX_MATERIAL_AI_CHARS;

  let bodySection = detail.text.trim();
  const pageStart = detail.pageStart;
  let pageEnd = detail.pageEnd;
  let hasMorePages = detail.hasMorePages;
  let truncatedByChars = false;
  const rawBodyLen = bodySection.length;

  // 若为 PDF 且带逐页信息：优先按完整页边界累加，若单页即超限再按自然段落边界截断
  if (detail.pages && detail.pages.length > 0 && rawBodyLen > maxBodyChars) {
    const pickedTexts: string[] = [];
    let accLen = 0;
    let lastPageIncluded = pageStart ?? 1;
    for (const pg of detail.pages) {
      const pgText = pg.text.trim();
      if (!pgText) continue;
      const nextLen = accLen === 0 ? pgText.length : accLen + 2 + pgText.length;
      if (nextLen > maxBodyChars && pickedTexts.length > 0) {
        truncatedByChars = true;
        hasMorePages = true;
        break;
      }
      if (nextLen > maxBodyChars && pickedTexts.length === 0) {
        const bound = truncateAtNaturalBoundary(pgText, maxBodyChars);
        pickedTexts.push(bound.text);
        lastPageIncluded = pg.page;
        truncatedByChars = bound.truncated;
        if (bound.truncated || pg.page < (detail.totalPages ?? pg.page)) {
          hasMorePages = true;
        }
        break;
      }
      pickedTexts.push(pgText);
      accLen = nextLen;
      lastPageIncluded = pg.page;
    }
    bodySection = pickedTexts.join("\n\n");
    pageEnd = lastPageIncluded;
  } else if (rawBodyLen > maxBodyChars) {
    const bound = truncateAtNaturalBoundary(bodySection, maxBodyChars);
    bodySection = bound.text;
    truncatedByChars = bound.truncated;
  }

  const parts = [`【资料出处】${[material.subject, material.chapter, material.title].filter(Boolean).join(" / ")}`];
  if (noteSection) {
    parts.push(`【重点笔记】\n${truncateAtNaturalBoundary(noteSection, 2000).text}`);
  }
  if (bodySection) {
    parts.push(`【资料正文与重点】\n${bodySection}`);
  }
  const content = parts.join("\n\n");
  const chunkCount = content.trim() ? sliceText(content, AI_CHUNK_MAX_CHARS).length : 0;
  const truncated = truncatedByChars || hasMorePages;
  const nextStartPage = hasMorePages && pageEnd !== undefined ? pageEnd + 1 : undefined;

  const meta: MaterialExtractMeta = {
    kind: material.kind,
    totalPages: detail.totalPages,
    pageStart,
    pageEnd,
    sentChars: content.length,
    totalChars: rawBodyLen,
    truncated,
    hasMorePages,
    nextStartPage,
    chunkCount,
  };

  let toast: string;
  if (bodySection) {
    if (detail.totalPages && pageStart !== undefined && pageEnd !== undefined) {
      toast = hasMorePages
        ? `已截取《${material.title}》第 ${pageStart}–${pageEnd} 页（共 ${detail.totalPages} 页），实际送检 ${content.length} 字（将按 3000 字/段自然边界分 ${chunkCount} 段），可随时续拆第 ${nextStartPage} 页起！`
        : `已读取《${material.title}》第 ${pageStart}–${pageEnd} 页（共 ${detail.totalPages} 页），实际送检 ${content.length} 字（分 ${chunkCount} 段）！`;
    } else if (truncatedByChars) {
      toast = `已按自然段落边界截取《${material.title}》前 ${bodySection.length}/${rawBodyLen} 字（实际送检 ${content.length} 字，分 ${chunkCount} 段）带入 AI 出题工作台！`;
    } else {
      toast = `已将资料《${material.title}》正文（${bodySection.length} 字，分 ${chunkCount} 段）带入 AI 出题工作台！`;
    }
  } else if (noteSection) {
    toast = `已将资料《${material.title}》笔记带入 AI 出题工作台！`;
  } else if (material.kind === "pdf") {
    toast = `已带入《${material.title}》出处（未检测到 PDF 内嵌文字层，可能是纯扫描件；可截图粘贴或先用外部导入 OCR 识别）`;
  } else {
    toast = `已将资料《${material.title}》带入 AI 出题工作台！`;
  }

  return {
    content,
    toast,
    meta,
  };
}

export interface BlankNoteFormState {
  editingId: string;
  text: string;
  page: string;
  time: string;
  quote: string;
  tags: string;
  formError: string;
}

/** 构造初始空白笔记表单状态 */
export function createBlankNoteFormState(): BlankNoteFormState {
  return {
    editingId: "",
    text: "",
    page: "",
    time: "",
    quote: "",
    tags: "",
    formError: "",
  };
}

/** 计算笔记表单草稿指纹签名 */
export function getNoteDraftSignature(form: {
  editingId: string;
  text: string;
  page: string;
  time: string;
  quote: string;
  tags: string;
}): string {
  return JSON.stringify([form.editingId, form.text, form.page, form.time, form.quote, form.tags]);
}

/** 判定笔记表单是否发生了未保存的修改 */
export function isNoteFormDirty(
  form: {
    editingId: string;
    text: string;
    page: string;
    time: string;
    quote: string;
    tags: string;
  },
  baseline: string,
): boolean {
  const sig = getNoteDraftSignature(form);
  return sig !== baseline && Boolean(form.text || form.page || form.time || form.quote || form.tags);
}

/** 从笔记对象提取用于编辑表单的值 */
export function extractNoteEditValues(n: MaterialNote): {
  editingId: string;
  text: string;
  page: string;
  time: string;
  quote: string;
  tags: string;
} {
  return {
    editingId: n.id,
    text: n.text,
    page: n.locator?.page != null ? String(n.locator.page) : "",
    time: n.locator?.tSec != null ? formatSecToTime(n.locator.tSec) : "",
    quote: n.locator?.quote ?? "",
    tags: (n.tags ?? []).join("，"),
  };
}

/**
 * 按搜索关键词过滤资料列表（大小写不敏感匹配标题、科目、章节与路径）
 */
export function filterMaterialsList(
  materials: MaterialDoc[],
  search: string,
): MaterialDoc[] {
  const kw = search.trim().toLowerCase();
  if (!kw) return materials;
  return materials.filter((m) =>
    [m.title, m.subject, m.chapter, ...m.locations.map((l) => l.path)]
      .filter(Boolean)
      .some((s) => String(s).toLowerCase().includes(kw)),
  );
}

