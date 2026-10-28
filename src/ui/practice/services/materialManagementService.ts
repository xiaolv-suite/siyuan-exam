// ============================================================
// 学习资料与资料笔记服务（materialManagementService.ts）
// 承接资料登记、外链解析、笔记增删改、资料定位跳转与桥接到出题
// 纯逻辑解耦，不绑定 Svelte 渲染态
// ============================================================

import type { MaterialDoc } from "@/core/materials";
import type { MaterialNote, NoteLocator } from "@/core/materialNotes";
import { parseTimeToSec } from "@/core/materialNotes";
import { locatedUrl } from "@/core/materialNotes";
import { escapeHtml } from "@/libs/sanitize";

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
          (rows[0].hpath ? String(rows[0].hpath).split("/").pop() || "" : "");
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

/** 桥接资料到手工录题 */
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

/** 桥接资料到 AI 出题工作台 */
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
