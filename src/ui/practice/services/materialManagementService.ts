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

  if (blockMatch && !titleToUse && app?.kernelOnline && app?.deps?.client?.sql) {
    try {
      const blockId = blockMatch[1];
      const rows = await app.deps.client.sql(`SELECT content, hpath FROM blocks WHERE id='${blockId.replace(/'/g, "''")}' LIMIT 1`);
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

/** 从 docx 二进制流中零依赖提取文字段落 */
export async function extractDocxTextFromBytes(bytes: Uint8Array): Promise<string> {
  let offset = 0;
  while (offset < bytes.length - 30) {
    if (bytes[offset] === 0x50 && bytes[offset + 1] === 0x4b && bytes[offset + 2] === 0x03 && bytes[offset + 3] === 0x04) {
      const compression = bytes[offset + 8] | (bytes[offset + 9] << 8);
      const compressedSize = bytes[offset + 18] | (bytes[offset + 19] << 8) | (bytes[offset + 20] << 16) | (bytes[offset + 21] << 24);
      const fnLen = bytes[offset + 26] | (bytes[offset + 27] << 8);
      const extraLen = bytes[offset + 28] | (bytes[offset + 29] << 8);
      const fileName = new TextDecoder().decode(bytes.subarray(offset + 30, offset + 30 + fnLen));
      const dataOffset = offset + 30 + fnLen + extraLen;
      if (fileName === "word/document.xml") {
        const compressedData = bytes.subarray(dataOffset, dataOffset + compressedSize);
        let xml = "";
        if (compression === 0) {
          xml = new TextDecoder().decode(compressedData);
        } else if (compression === 8 && typeof DecompressionStream !== "undefined") {
          try {
            const ds = new DecompressionStream("deflate-raw");
            const writer = ds.writable.getWriter();
            const chunk = new Uint8Array(compressedSize);
            chunk.set(compressedData);
            writer.write(chunk);
            writer.close();
            const res = await new Response(ds.readable).arrayBuffer();
            xml = new TextDecoder().decode(res);
          } catch {
            // 解压流降级
          }
        }
        if (xml) {
          const paragraphs = xml.split(/<\/w:p>/);
          const lines = paragraphs.map((p) => {
            const matches = [...p.matchAll(/<w:t[^>]*>(.*?)<\/w:t>/g)];
            return matches.map((m) => m[1]).join("").trim();
          }).filter(Boolean);
          return lines.join("\n\n");
        }
      }
      offset = dataOffset + Math.max(0, compressedSize);
    } else {
      offset++;
    }
  }
  return "";
}

/** 智能读取资料文件真实正文（Word/Markdown/纯文本/笔记） */
export async function extractMaterialDocText(app: any, material: MaterialDoc): Promise<string> {
  const assetLoc = material.locations.find((l) => l.kind === "assets");
  if (!assetLoc || !app?.deps?.client) return "";
  try {
    const rawPath = assetLoc.path.startsWith("/data") ? assetLoc.path : `/data${assetLoc.path.startsWith("/") ? "" : "/"}${assetLoc.path}`;
    const res = await fetch(`${app.deps.client.baseUrl}/api/file/getFile`, {
      method: "POST",
      headers: {
        Authorization: `Token ${app.deps.client.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ path: rawPath }),
    });
    if (!res.ok) return "";
    const buf = await res.arrayBuffer();
    const bytes = new Uint8Array(buf);
    const pathLower = assetLoc.path.toLowerCase();
    if (pathLower.endsWith(".docx")) {
      return await extractDocxTextFromBytes(bytes);
    }
    if (/\.(txt|md|text|csv|tsv|json)$/i.test(pathLower)) {
      return new TextDecoder().decode(bytes);
    }
  } catch {
    // 容错降级
  }
  return "";
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
    stem = fileText.slice(0, 300).trim();
  }
  return {
    source,
    stem,
    toast: `已将资料《${material.title}》正文与出处带入手工录题！`,
  };
}

/** 异步读取资料正文并桥接资料到 AI 出题工作台 */
export async function bridgeMaterialToAiAsync(
  app: any,
  material: MaterialDoc,
  noteText = "",
): Promise<{ content: string; toast: string }> {
  const notes = app.listMaterialNotes(material.id).map((n: MaterialNote) => n.text).join("\n\n");
  let mainBody = noteText || notes;
  if (!mainBody && app) {
    mainBody = await extractMaterialDocText(app, material);
  }
  const content = [
    `【资料出处】${[material.subject, material.chapter, material.title].filter(Boolean).join(" / ")}`,
    mainBody ? `【资料正文与重点】\n${mainBody.slice(0, 3500)}` : "",
  ].filter(Boolean).join("\n\n");

  return {
    content,
    toast: `已将资料《${material.title}》正文全量带入 AI 出题工作台！`,
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

