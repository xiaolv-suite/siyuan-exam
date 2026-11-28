export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function clampNumber(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  return Math.min(hi, Math.max(lo, v));
}

/**
 * 将起止指针坐标归一化为严格钳位在容器边界内的矩形与 [0..1] 比例坐标
 */
export function normalizeCropRect(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  boundsWidth: number,
  boundsHeight: number,
  minSize = 12,
): { rect: CropRect; normalized: CropRect; valid: boolean } {
  const bw = Math.max(1, Number.isFinite(boundsWidth) ? boundsWidth : 1);
  const bh = Math.max(1, Number.isFinite(boundsHeight) ? boundsHeight : 1);

  const sx = clampNumber(startX, 0, bw);
  const sy = clampNumber(startY, 0, bh);
  const ex = clampNumber(endX, 0, bw);
  const ey = clampNumber(endY, 0, bh);

  const x = Math.min(sx, ex);
  const y = Math.min(sy, ey);
  const width = Math.abs(ex - sx);
  const height = Math.abs(ey - sy);

  const valid = width >= minSize && height >= minSize;
  const rect: CropRect = {
    x: Math.round(x * 100) / 100,
    y: Math.round(y * 100) / 100,
    width: Math.round(width * 100) / 100,
    height: Math.round(height * 100) / 100,
  };
  const normalized: CropRect = {
    x: clampNumber(x / bw, 0, 1),
    y: clampNumber(y / bh, 0, 1),
    width: clampNumber(width / bw, 0, 1),
    height: clampNumber(height / bh, 0, 1),
  };

  return { rect, normalized, valid };
}

/**
 * 将 [0..1] 归一化矩形映射到目标 Canvas 像素坐标，并确保不越界
 */
export function mapNormalizedRectToCanvasPixels(
  normalized: CropRect,
  canvasWidth: number,
  canvasHeight: number,
): CropRect {
  const cw = Math.max(1, Math.floor(Number.isFinite(canvasWidth) ? canvasWidth : 1));
  const ch = Math.max(1, Math.floor(Number.isFinite(canvasHeight) ? canvasHeight : 1));

  const nx = clampNumber(normalized.x, 0, 1);
  const ny = clampNumber(normalized.y, 0, 1);
  const nw = clampNumber(normalized.width, 0, 1 - nx);
  const nh = clampNumber(normalized.height, 0, 1 - ny);

  const x = clampNumber(Math.floor(nx * cw), 0, Math.max(0, cw - 1));
  const y = clampNumber(Math.floor(ny * ch), 0, Math.max(0, ch - 1));
  const width = clampNumber(Math.round(nw * cw), 1, cw - x);
  const height = clampNumber(Math.round(nh * ch), 1, ch - y);

  return { x, y, width, height };
}

/**
 * 按水平题界线数组（[0..1]）切分出有效纵向题条区域
 */
export function computeHorizontalQuestionStrips(
  splitYsNormalized: readonly number[],
  minHeightNormalized = 0.04,
): Array<{ y: number; height: number }> {
  const sorted = [...splitYsNormalized]
    .filter((v) => Number.isFinite(v) && v > 0 && v < 1)
    .sort((a, b) => a - b);
  const boundaries = [0, ...sorted, 1];
  const strips: Array<{ y: number; height: number }> = [];
  for (let i = 0; i < boundaries.length - 1; i++) {
    const start = boundaries[i]!;
    const end = boundaries[i + 1]!;
    const height = end - start;
    if (height >= minHeightNormalized) {
      strips.push({ y: start, height });
    }
  }
  return strips;
}
