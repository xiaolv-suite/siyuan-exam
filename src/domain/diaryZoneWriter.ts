import type { IHostBridge } from "../kernel/client";
import {
  buildXiaolvLifeLogAttrs,
  ensureXiaolvDiaryZone,
  XIAOLV_DIARY_ZONE_ATTR,
  type XiaolvLifeLogEntry,
} from "../libs/lv-notice-kit";

export interface DiaryZoneChildBlock {
  id: string;
  type?: string;
  subtype?: string;
  subType?: string;
  content?: string;
  markdown?: string;
  ial?: unknown;
}

function assertKernelOk(res: unknown, context: string): void {
  if (res && typeof res === "object" && "code" in res) {
    const code = (res as { code?: unknown }).code;
    if (typeof code === "number" && code !== 0) {
      const msg = (res as { msg?: unknown }).msg;
      throw new Error(`[DIARY-ZONE-API] ${context} failed: ${msg ? String(msg) : `code ${code}`}`);
    }
  }
}

async function fallbackBrowserKernelPost(
  endpoint: string,
  payload: unknown,
): Promise<{ code: number; msg?: string; data?: unknown }> {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload ?? {}),
  });
  const json = (await res.json()) as { code: number; msg?: string; data?: unknown };
  assertKernelOk(json, endpoint);
  return json;
}

function hasBridgeRawPost(bridge: IHostBridge): boolean {
  if (typeof bridge.canRawPost === "function") return bridge.canRawPost();
  return typeof bridge.rawPost === "function";
}

function hasRealSiYuanRuntime(): boolean {
  return typeof globalThis !== "undefined" && Boolean((globalThis as unknown as { siyuan?: unknown }).siyuan);
}

function extractCreatedIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const ops = (raw as { doOperations?: { id?: string }[] }[])[0]?.doOperations;
  if (!Array.isArray(ops)) return [];
  return ops.map((o) => String(o?.id ?? "")).filter(Boolean);
}

export function parseDiaryZoneBlockIal(ial: unknown): Record<string, string> {
  if (!ial) return {};
  if (typeof ial === "object" && !Array.isArray(ial)) {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(ial as Record<string, unknown>)) {
      if (v !== undefined && v !== null) out[k] = String(v);
    }
    return out;
  }
  const raw = String(ial);
  const out: Record<string, string> = {};
  for (const m of raw.matchAll(/([a-zA-Z0-9-]+)="([^"]*)"/g)) {
    const key = m[1];
    if (!key) continue;
    out[key] = (m[2] ?? "")
      .replace(/&quot;/g, '"')
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&");
  }
  return out;
}

function parseZoneHeadingLevel(
  block: { subtype?: string; subType?: string; markdown?: string; content?: string } | null | undefined,
  fallback = 4,
): number {
  const sub = String(block?.subType || block?.subtype || "").trim().toLowerCase();
  const mSub = sub.match(/^h([1-6])$/);
  if (mSub && mSub[1]) return Number(mSub[1]);
  const md = String(block?.markdown || block?.content || "").trim();
  const mMd = md.match(/^(#{1,6})\s+/);
  if (mMd && mMd[1]) return mMd[1].length;
  return fallback;
}

function normalizeDiaryZoneHeadingText(raw: string): string {
  return String(raw || "")
    .replace(/\{:[^}]*\}\s*$/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/^#{1,6}\s+/, "")
    .replace(/\u200b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * 解析并返回指定文档中「#### 🐴 小驴记录」折叠区内的顶层子块列表：
 * - 若文档确认尚无该折叠区或区内为空，返回 `[]`（绝不误将区外历史块视为区内块）；
 * - 若 `getChildBlocks` 返回非零错误码、非法响应或抛出异常，直接显式抛错中止（严禁静默折成 `[]`）；
 * - 若当前运行环境无 `getChildBlocks` 能力（如精简单测桩），返回 `null`。
 */
export async function findXiaolvDiaryZoneChildren(
  bridge: IHostBridge,
  docId: string,
): Promise<DiaryZoneChildBlock[] | null> {
  const canQueryChildren = hasBridgeRawPost(bridge) || hasRealSiYuanRuntime();
  if (!canQueryChildren) return null;

  const postFn = hasBridgeRawPost(bridge)
    ? (ep: string, payload: unknown) => bridge.rawPost!(ep, payload)
    : fallbackBrowserKernelPost;

  const res = await postFn("/api/block/getChildBlocks", { id: docId });
  assertKernelOk(res, "/api/block/getChildBlocks");
  if (!res || typeof res !== "object") {
    throw new Error("[DIARY-ZONE-API] /api/block/getChildBlocks failed: empty response");
  }
  if (res.data !== null && res.data !== undefined && !Array.isArray(res.data)) {
    throw new Error("[DIARY-ZONE-API] /api/block/getChildBlocks failed: invalid data payload");
  }
  const children: DiaryZoneChildBlock[] = Array.isArray(res.data)
    ? res.data.filter(
        (b): b is DiaryZoneChildBlock => Boolean(b && typeof b === "object" && typeof (b as { id?: unknown }).id === "string" && (b as { id: string }).id.trim().length > 0),
      )
    : [];

  let zoneIdx = -1;
  for (let i = 0; i < children.length; i++) {
    const ch = children[i]!;
    const ialMap = parseDiaryZoneBlockIal(ch.ial);
    if (ialMap[XIAOLV_DIARY_ZONE_ATTR] === "1") {
      zoneIdx = i;
      break;
    }
    const isHeading = ch.type === "h" || /^h[1-6]$/i.test(String(ch.subType || ch.subtype || ""));
    if (isHeading) {
      try {
        const attrRes = await postFn("/api/attr/getBlockAttrs", { id: ch.id });
        if (attrRes?.code === 0 && (attrRes.data as Record<string, unknown> | undefined)?.[XIAOLV_DIARY_ZONE_ATTR] === "1") {
          zoneIdx = i;
          break;
        }
      } catch { /* soft */ }
    }
  }

  if (zoneIdx < 0) {
    for (let i = 0; i < children.length; i++) {
      const ch = children[i]!;
      const isHeading = ch.type === "h" || /^h[1-6]$/i.test(String(ch.subType || ch.subtype || ""));
      if (!isHeading) continue;
      const norm = normalizeDiaryZoneHeadingText(ch.content || ch.markdown || "");
      if (norm === "🐴 小驴记录" || norm === "小驴记录") {
        zoneIdx = i;
        break;
      }
    }
  }

  if (zoneIdx < 0) return [];

  const zoneHeading = children[zoneIdx]!;
  const zoneLevel = parseZoneHeadingLevel(zoneHeading, 4);
  const inZone: DiaryZoneChildBlock[] = [];
  for (let i = zoneIdx + 1; i < children.length; i++) {
    const ch = children[i]!;
    const isHeading = ch.type === "h" || /^h[1-6]$/i.test(String(ch.subType || ch.subtype || ""));
    if (isHeading && parseZoneHeadingLevel(ch, 6) <= zoneLevel) {
      break;
    }
    inZone.push(ch);
  }
  return inZone;
}

export async function attachLifeLogAttrsToBlock(
  bridge: IHostBridge,
  blockId: string,
  entry: XiaolvLifeLogEntry,
): Promise<Record<string, string>> {
  const attrs = buildXiaolvLifeLogAttrs(entry);
  if (!blockId) return attrs;
  const hasDirectSetBlockAttrs =
    typeof bridge.setBlockAttrs === "function"
    && (hasBridgeRawPost(bridge)
      || bridge.constructor === Object
      || typeof (bridge as unknown as { client?: { setBlockAttrs?: unknown } }).client?.setBlockAttrs === "function");

  if (hasDirectSetBlockAttrs) {
    const res = await bridge.setBlockAttrs!(blockId, attrs);
    assertKernelOk(res, "setBlockAttrs");
    return attrs;
  }
  if (hasBridgeRawPost(bridge)) {
    const res = await bridge.rawPost!("/api/attr/setBlockAttrs", { id: blockId, attrs });
    assertKernelOk(res, "setBlockAttrs");
    return attrs;
  }
  if (hasRealSiYuanRuntime()) {
    const res = await fallbackBrowserKernelPost("/api/attr/setBlockAttrs", { id: blockId, attrs });
    assertKernelOk(res, "setBlockAttrs");
  }
  return attrs;
}

export async function writeInsideXiaolvDiaryZone(params: {
  bridge: IHostBridge;
  docId: string;
  markdown: string;
  lifeLogEntry: XiaolvLifeLogEntry;
}): Promise<{ blockIds: string[]; zoneHeadingId?: string; anchorBlockId?: string; attrs: Record<string, string> }> {
  const { bridge, docId, markdown, lifeLogEntry } = params;
  const attrs = buildXiaolvLifeLogAttrs(lifeLogEntry);

  if (hasBridgeRawPost(bridge) || (bridge.constructor === Object && typeof bridge.insertBlockAfter === "function")) {
    const postFn = hasBridgeRawPost(bridge)
      ? (ep: string, payload: unknown) => bridge.rawPost!(ep, payload)
      : undefined;
    const zone = await ensureXiaolvDiaryZone(docId, postFn ? { postFn } : undefined);
    let blockIds: string[];
    if (typeof bridge.insertBlockAfter === "function" && (bridge.constructor === Object || typeof (bridge as unknown as { client?: unknown }).client === "object")) {
      blockIds = await bridge.insertBlockAfter(docId, zone.anchorBlockId, markdown);
    } else if (postFn) {
      const insRes = await postFn("/api/block/insertBlock", {
        dataType: "markdown",
        data: markdown,
        previousID: zone.anchorBlockId,
        parentID: docId,
      });
      assertKernelOk(insRes, "insertBlock");
      blockIds = extractCreatedIds(insRes?.data);
    } else {
      const insRes = await fallbackBrowserKernelPost("/api/block/insertBlock", {
        dataType: "markdown",
        data: markdown,
        previousID: zone.anchorBlockId,
        parentID: docId,
      });
      assertKernelOk(insRes, "insertBlock");
      blockIds = extractCreatedIds(insRes?.data);
    }
    const createdId = blockIds[0];
    if (createdId) {
      if (typeof bridge.setBlockAttrs === "function" && (bridge.constructor === Object || hasBridgeRawPost(bridge))) {
        const res = await bridge.setBlockAttrs(createdId, attrs);
        assertKernelOk(res, "setBlockAttrs");
      } else if (postFn) {
        const res = await postFn("/api/attr/setBlockAttrs", { id: createdId, attrs });
        assertKernelOk(res, "setBlockAttrs");
      } else {
        const res = await fallbackBrowserKernelPost("/api/attr/setBlockAttrs", { id: createdId, attrs });
        assertKernelOk(res, "setBlockAttrs");
      }
    }
    return { blockIds, zoneHeadingId: zone.zoneHeadingId, anchorBlockId: zone.anchorBlockId, attrs };
  }

  if (hasRealSiYuanRuntime()) {
    const zone = await ensureXiaolvDiaryZone(docId);
    const insRes = await fallbackBrowserKernelPost("/api/block/insertBlock", {
      dataType: "markdown",
      data: markdown,
      previousID: zone.anchorBlockId,
      parentID: docId,
    });
    assertKernelOk(insRes, "insertBlock");
    const blockIds = extractCreatedIds(insRes?.data);
    const createdId = blockIds[0];
    if (createdId) {
      const res = await fallbackBrowserKernelPost("/api/attr/setBlockAttrs", { id: createdId, attrs });
      assertKernelOk(res, "setBlockAttrs");
    }
    return { blockIds, zoneHeadingId: zone.zoneHeadingId, anchorBlockId: zone.anchorBlockId, attrs };
  }

  // 无宿主内核的精简单测桩回退分支（保留 appendBlock 契约兼容）
  const rawIds = await bridge.appendBlock(docId, markdown);
  const blockIds = Array.isArray(rawIds) ? rawIds.map(String).filter(Boolean) : typeof rawIds === "string" && rawIds ? [rawIds] : [];
  if (blockIds[0] && typeof bridge.setBlockAttrs === "function") {
    const res = await bridge.setBlockAttrs(blockIds[0], attrs);
    assertKernelOk(res, "setBlockAttrs");
  }
  return { blockIds, attrs };
}
