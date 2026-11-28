export const ZOOM_MIN_SCALE = 0.4;
export const ZOOM_MAX_SCALE = 3.5;

export interface TouchPointLike {
  clientX: number;
  clientY: number;
}

export function clampZoomScale(
  scale: number,
  min = ZOOM_MIN_SCALE,
  max = ZOOM_MAX_SCALE,
): number {
  if (!Number.isFinite(scale)) return 1;
  const lo = Math.max(0.1, Math.min(min, max));
  const hi = Math.max(lo, max);
  return Math.round(Math.min(hi, Math.max(lo, scale)) * 1000) / 1000;
}

export function computePinchDistance(p1: TouchPointLike, p2: TouchPointLike): number {
  const dx = Number(p2.clientX) - Number(p1.clientX);
  const dy = Number(p2.clientY) - Number(p1.clientY);
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return 0;
  return Math.hypot(dx, dy);
}

export function computePinchScale(
  startDistance: number,
  currentDistance: number,
  startScale: number,
  min = ZOOM_MIN_SCALE,
  max = ZOOM_MAX_SCALE,
): number {
  if (!Number.isFinite(startDistance) || startDistance <= 0 || !Number.isFinite(currentDistance) || currentDistance <= 0) {
    return clampZoomScale(startScale, min, max);
  }
  const ratio = currentDistance / startDistance;
  return clampZoomScale(startScale * ratio, min, max);
}

export function computeDoubleTapZoomScale(
  currentScale: number,
  baseScale = 1,
  zoomedScale = 2,
): number {
  if (!Number.isFinite(currentScale)) return baseScale;
  return Math.abs(currentScale - baseScale) > 0.08 ? baseScale : zoomedScale;
}

export function computeFitWidthZoomPercent(
  containerWidth: number,
  contentWidth = 794,
  minPct = 40,
  maxPct = 100,
): number {
  if (!Number.isFinite(containerWidth) || containerWidth <= 0 || !Number.isFinite(contentWidth) || contentWidth <= 0) {
    return 100;
  }
  const usable = Math.max(120, containerWidth - 20);
  const raw = Math.floor((usable / contentWidth) * 100);
  return Math.max(minPct, Math.min(maxPct, raw));
}

export function clampPanOffset(
  offsetX: number,
  offsetY: number,
  scale: number,
  viewportWidth: number,
  viewportHeight: number,
): { x: number; y: number } {
  const s = Math.max(1, Number.isFinite(scale) ? scale : 1);
  const maxX = Math.max(0, ((s - 1) * Math.max(0, viewportWidth)) / 2);
  const maxY = Math.max(0, ((s - 1) * Math.max(0, viewportHeight)) / 2);
  const x = Number.isFinite(offsetX) ? Math.min(maxX, Math.max(-maxX, offsetX)) : 0;
  const y = Number.isFinite(offsetY) ? Math.min(maxY, Math.max(-maxY, offsetY)) : 0;
  return { x, y };
}
