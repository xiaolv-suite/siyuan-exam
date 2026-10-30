// ============================================================
// 非破坏性 SVG 图片遮挡题核心引擎 (Image Occlusion Engine)
// 依据 Anki Image Occlusion Enhanced 规范与医学/理工科图表记忆标准：
// 1. 纯前端归一化矢量矩形坐标 (0.0 - 1.0)，任意窗口自适应缩放，零原图篡改
// 2. 交互态与打印态分流渲染：屏幕端支持高亮聚焦与点击揭晓；A4 打印端输出带圈序号白框
// 3. 一图多题裂变生成：自动为一组遮罩生成题族关联题目 (siblingBury 联动)
// 纯函数领域层，无外部 IO 依赖。
// ============================================================

import type { Question, ImageOcclusionSpec, ImageOcclusionMask } from "./types";
import { newQuestionId } from "./ids";
import { makeQuestion } from "./blockTemplate";

export interface RenderOcclusionOptions {
  /** 当前聚焦的目标遮罩 ID (活动待答状态，呈高亮警戒色) */
  activeMaskId?: string;
  /** 已揭晓答案的遮罩 ID 列表 (展示绿色通透背景与答案文本) */
  revealedMaskIds?: readonly string[];
  /** 是否为纸质试卷打印模式 (黑白高反差、白底带圈序号，不透出任何答案) */
  printMode?: boolean;
  /** 外部容器建议宽度 (默认 100%) */
  width?: string | number;
}

const CIRCLE_NUMBERS = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩", "⑪", "⑫", "⑬", "⑭", "⑮", "⑯", "⑰", "⑱", "⑲", "⑳"];

function escapeXml(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** 归一化遮罩最小边长（占比），低于此值视作误触丢弃 */
export const OCCLUSION_MIN_SIZE = 0.015;

/**
 * 将指针拖拽的原始矩形归一化为 0..1 区间内的合法遮罩矩形。
 * 起点终点任意方向拖拽均可；宽高低于最小边长视作误触返回 null。
 */
export function normalizeOcclusionRect(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  minSize = OCCLUSION_MIN_SIZE,
): { x: number; y: number; w: number; h: number } | null {
  const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
  const ax = clamp01(x0);
  const ay = clamp01(y0);
  const bx = clamp01(x1);
  const by = clamp01(y1);
  const x = Math.min(ax, bx);
  const y = Math.min(ay, by);
  const w = Math.abs(bx - ax);
  const h = Math.abs(by - ay);
  if (w < minSize || h < minSize) return null;
  return {
    x: Math.round(x * 10000) / 10000,
    y: Math.round(y * 10000) / 10000,
    w: Math.round(Math.min(w, 1 - x) * 10000) / 10000,
    h: Math.round(Math.min(h, 1 - y) * 10000) / 10000,
  };
}

/**
 * 渲染图片遮挡矢量 SVG 结构
 */
export function renderOcclusionSvg(
  spec: ImageOcclusionSpec,
  options: RenderOcclusionOptions = {},
): string {
  if (!spec || !spec.imageUrl) return "";

  const VIEW_SIZE = 1000;
  const masks = spec.masks || [];
  const activeId = options.activeMaskId ?? spec.activeMaskId;
  const revealedSet = new Set(options.revealedMaskIds || []);
  const isPrint = options.printMode === true;

  const maskSvgs: string[] = [];

  masks.forEach((m, idx) => {
    const rx = Math.max(0, Math.min(VIEW_SIZE, Math.round(m.x * VIEW_SIZE)));
    const ry = Math.max(0, Math.min(VIEW_SIZE, Math.round(m.y * VIEW_SIZE)));
    const rw = Math.max(10, Math.min(VIEW_SIZE - rx, Math.round(m.w * VIEW_SIZE)));
    const rh = Math.max(10, Math.min(VIEW_SIZE - ry, Math.round(m.h * VIEW_SIZE)));
    const num = CIRCLE_NUMBERS[idx] || `(${idx + 1})`;

    if (isPrint) {
      // 打印模式：纯白遮挡层 + 细黑虚线边框 + 正中带圈编号
      maskSvgs.push(
        `<g class="lv-occlusion-mask-print">` +
        `<rect x="${rx}" y="${ry}" width="${rw}" height="${rh}" rx="4" fill="#ffffff" stroke="#222222" stroke-width="2" stroke-dasharray="4,2" />` +
        `<text x="${rx + rw / 2}" y="${ry + rh / 2 + 6}" font-size="20" font-family="sans-serif" font-weight="bold" fill="#111111" text-anchor="middle" dominant-baseline="central">${num}</text>` +
        `</g>`,
      );
      return;
    }

    const isRevealed = revealedSet.has(m.id);
    const isActive = activeId === m.id;

    if (isRevealed) {
      // 已揭晓模式：半透明翡翠绿 + 绿色实线 + 居中答案文本（白色描边光晕保证任意底图下可读）
      // 注意：var()/color-mix 仅在 style 内联样式生效，SVG 表现属性不支持 CSS 变量，故颜色一律走 style
      maskSvgs.push(
        `<g class="lv-occlusion-mask lv-occlusion-revealed" data-mask-id="${escapeXml(m.id)}">` +
        `<rect x="${rx}" y="${ry}" width="${rw}" height="${rh}" rx="4" style="fill:color-mix(in srgb, var(--lv-green, #10b981) 25%, transparent);stroke:var(--lv-green, #10b981);stroke-width:2px" />` +
        `<text x="${rx + rw / 2}" y="${ry + rh / 2}" font-size="16" font-family="sans-serif" font-weight="bold" text-anchor="middle" dominant-baseline="central" style="fill:#065f46;paint-order:stroke;stroke:#ffffff;stroke-width:4px;stroke-linejoin:round">${escapeXml(m.answer)}</text>` +
        `</g>`,
      );
    } else if (isActive) {
      // 当前待答聚焦项：高亮琥珀橙 + 鲜明边框 + 提示符（深琥珀文字对比 ~6.3:1，白字在琥珀底仅 ~2.1:1 不达标）
      maskSvgs.push(
        `<g class="lv-occlusion-mask lv-occlusion-active" data-mask-id="${escapeXml(m.id)}">` +
        `<rect x="${rx}" y="${ry}" width="${rw}" height="${rh}" rx="4" style="fill:var(--lv-amber, #f59e0b);stroke:color-mix(in srgb, var(--lv-amber, #f59e0b) 62%, #78350f);stroke-width:2.5px" />` +
        `<text x="${rx + rw / 2}" y="${ry + rh / 2}" font-size="20" font-family="sans-serif" font-weight="bold" text-anchor="middle" dominant-baseline="central" style="fill:#78350f">${num}</text>` +
        `</g>`,
      );
    } else {
      // 默认未揭晓遮挡：品牌色卡片 + 编号（白字附深色描边光晕，随主题变量自适应）
      maskSvgs.push(
        `<g class="lv-occlusion-mask lv-occlusion-inactive" data-mask-id="${escapeXml(m.id)}">` +
        `<rect x="${rx}" y="${ry}" width="${rw}" height="${rh}" rx="4" style="fill:var(--lv-brand, #4f46e5);fill-opacity:0.92;stroke:color-mix(in srgb, var(--lv-brand, #4f46e5) 70%, #1e1b4b);stroke-width:1.5px" />` +
        `<text x="${rx + rw / 2}" y="${ry + rh / 2}" font-size="18" font-family="sans-serif" font-weight="bold" text-anchor="middle" dominant-baseline="central" style="fill:#ffffff;paint-order:stroke;stroke:rgba(30, 27, 75, 0.55);stroke-width:3px;stroke-linejoin:round">${num}</text>` +
        `</g>`,
      );
    }
  });

  const widthAttr = options.width ? `width="${options.width}"` : 'width="100%"';

  // 无障碍名（绝不携带答案文本，防读屏泄露）：标注区域总数 + 当前考查目标序号
  const activeIdx = masks.findIndex((m) => m.id === activeId);
  const ariaText =
    masks.length > 0
      ? `图片遮挡填图：共 ${masks.length} 个标注区域${activeIdx >= 0 ? `，当前考查序号 ${CIRCLE_NUMBERS[activeIdx] || activeIdx + 1}` : ""}`
      : "图片遮挡填图";
  const svgTitle = `<title>${escapeXml(ariaText)}</title>`;

  return (
    `<svg viewBox="0 0 ${VIEW_SIZE} ${VIEW_SIZE}" ${widthAttr} class="lv-occlusion-canvas" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${escapeXml(ariaText)}" style="display:block;max-width:100%;height:auto;border-radius:6px;overflow:hidden">` +
    svgTitle +
    `<image href="${escapeXml(spec.imageUrl)}" x="0" y="0" width="${VIEW_SIZE}" height="${VIEW_SIZE}" preserveAspectRatio="xMidYMid meet" />` +
    maskSvgs.join("") +
    `</svg>`
  );
}

/**
 * 将一组遮挡遮罩裂变为多道单部位填图考查题，并绑定为同一题族 (family 兄弟题)
 */
export function createOcclusionQuestions(options: {
  imageUrl: string;
  masks: ImageOcclusionMask[];
  kp?: string;
  source?: string;
  stemPrefix?: string;
}): Question[] {
  const { imageUrl, masks, kp, source } = options;
  if (!imageUrl || !masks.length) return [];

  const familyParentId = newQuestionId();
  const prefix = options.stemPrefix || "【图片遮挡填图】请观察图示，写出所标注区域的正确名称：";

  return masks.map((m, idx) => {
    const num = CIRCLE_NUMBERS[idx] || `(${idx + 1})`;
    const spec: ImageOcclusionSpec = {
      v: 1,
      kind: "imageOcclusion",
      imageUrl,
      activeMaskId: m.id,
      masks,
    };

    const q = makeQuestion({
      type: "fill",
      stem: `${prefix}\n\n**当前填图目标**：序号 **${num}** 区域${m.hint ? ` *（提示：${m.hint}）*` : ""}`,
      options: [],
      answer: m.answer,
      kp,
      source,
    });
    q.sourceKind = "real";
    q.occlusion = spec;
    q.family = {
      parentId: familyParentId,
      variantKind: "near_transfer",
      verified: true,
    };
    return q;
  });
}
