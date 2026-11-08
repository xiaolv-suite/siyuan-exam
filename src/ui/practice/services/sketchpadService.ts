/**
 * 数理草图演练画板服务 (Sketchpad Service)
 * 为做题考场提供数轴、坐标系、几何草图与手绘演算支撑
 */

export const SKETCH_STORAGE_PREFIX = "lv-exam-sketch:";

function resolveCanvasColor(raw: string, fallback: string): string {
  if (!raw.startsWith("var(") || typeof document === "undefined") return raw || fallback;
  const m = raw.match(/var\((--[^,)]+)(?:,\s*([^)]+))?\)/);
  if (!m) return fallback;
  const val = getComputedStyle(document.documentElement).getPropertyValue(m[1]).trim();
  return val || m[2]?.trim() || fallback;
}

/**
 * 绘制数理方格网背景（类似工程网格草稿纸）
 */
export function drawGridBackground(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  gridSize = 20,
): void {
  ctx.save();
  ctx.fillStyle = resolveCanvasColor("var(--lv-surface, #ffffff)", "#ffffff");
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = "rgba(100, 116, 139, 0.14)";
  ctx.lineWidth = 1;

  ctx.beginPath();
  for (let x = gridSize; x < width; x += gridSize) {
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, height);
  }
  for (let y = gridSize; y < height; y += gridSize) {
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(width, y + 0.5);
  }
  ctx.stroke();
  ctx.restore();
}

/**
 * 绘制标准笛卡尔坐标数轴（带原点 O、X轴、Y轴箭头与刻度）
 */
export function drawCoordinateAxis(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  strokeColor = "#1e3a8a",
): void {
  const resolvedStroke = resolveCanvasColor(strokeColor, "#1e3a8a");
  ctx.save();
  ctx.strokeStyle = resolvedStroke;
  ctx.fillStyle = resolvedStroke;
  ctx.lineWidth = 1.6;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  const cx = Math.round(width / 2);
  const cy = Math.round(height / 2);
  const arrowSize = 7;

  // X 轴
  ctx.beginPath();
  ctx.moveTo(15, cy + 0.5);
  ctx.lineTo(width - 15, cy + 0.5);
  ctx.stroke();

  // X 轴箭头
  ctx.beginPath();
  ctx.moveTo(width - 15 - arrowSize, cy - arrowSize / 1.5);
  ctx.lineTo(width - 15, cy);
  ctx.lineTo(width - 15 - arrowSize, cy + arrowSize / 1.5);
  ctx.stroke();

  // Y 轴
  ctx.beginPath();
  ctx.moveTo(cx + 0.5, height - 15);
  ctx.lineTo(cx + 0.5, 15);
  ctx.stroke();

  // Y 轴箭头
  ctx.beginPath();
  ctx.moveTo(cx - arrowSize / 1.5, 15 + arrowSize);
  ctx.lineTo(cx, 15);
  ctx.lineTo(cx + arrowSize / 1.5, 15 + arrowSize);
  ctx.stroke();

  // 坐标轴标注
  ctx.font = "11px system-ui, sans-serif";
  ctx.fillText("x", width - 24, cy - 6);
  ctx.fillText("y", cx + 8, 22);
  ctx.fillText("O", cx - 12, cy + 14);

  // 简单刻度标记
  const step = 30;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = cx + step; x < width - 25; x += step) {
    ctx.moveTo(x + 0.5, cy - 3);
    ctx.lineTo(x + 0.5, cy + 3);
  }
  for (let x = cx - step; x > 25; x -= step) {
    ctx.moveTo(x + 0.5, cy - 3);
    ctx.lineTo(x + 0.5, cy + 3);
  }
  for (let y = cy - step; y > 25; y -= step) {
    ctx.moveTo(cx - 3, y + 0.5);
    ctx.lineTo(cx + 3, y + 0.5);
  }
  for (let y = cy + step; y < height - 25; y += step) {
    ctx.moveTo(cx - 3, y + 0.5);
    ctx.lineTo(cx + 3, y + 0.5);
  }
  ctx.stroke();

  ctx.restore();
}

/**
 * 绘制预设几何简图（直角三角形 / 几何圆 / 矩形）
 */
export function drawGeometryShape(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  shape: "triangle" | "circle" | "box",
  strokeColor = "#1e3a8a",
): void {
  ctx.save();
  ctx.strokeStyle = strokeColor;
  ctx.fillStyle = strokeColor;
  ctx.lineWidth = 1.8;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  const cx = Math.round(width / 2);
  const cy = Math.round(height / 2);

  if (shape === "triangle") {
    // 直角三角形
    const w = Math.min(160, width * 0.4);
    const h = Math.min(120, height * 0.5);
    const left = cx - w / 2;
    const bottom = cy + h / 2;

    ctx.beginPath();
    ctx.moveTo(left, bottom);
    ctx.lineTo(left + w, bottom);
    ctx.lineTo(left, bottom - h);
    ctx.closePath();
    ctx.stroke();

    // 直角符号
    ctx.beginPath();
    ctx.moveTo(left + 12, bottom);
    ctx.lineTo(left + 12, bottom - 12);
    ctx.lineTo(left, bottom - 12);
    ctx.stroke();

    // 顶点标注 A, B, C
    ctx.font = "12px system-ui, sans-serif";
    ctx.fillText("C", left - 12, bottom + 12);
    ctx.fillText("B", left + w + 4, bottom + 4);
    ctx.fillText("A", left - 12, bottom - h - 2);
  } else if (shape === "circle") {
    // 几何圆 + 圆心与半径线
    const r = Math.min(65, height * 0.35);
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();

    // 圆心点
    ctx.beginPath();
    ctx.arc(cx, cy, 2.5, 0, Math.PI * 2);
    ctx.fill();

    // 半径线
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + r, cy);
    ctx.stroke();

    ctx.font = "11px system-ui, sans-serif";
    ctx.fillText("O", cx - 10, cy - 4);
    ctx.fillText("r", cx + r / 2 - 3, cy - 4);
  } else if (shape === "box") {
    const w = Math.min(160, width * 0.4);
    const h = Math.min(100, height * 0.45);
    ctx.strokeRect(cx - w / 2, cy - h / 2, w, h);
  }

  ctx.restore();
}

/**
 * 本地持久化手绘草图
 */
export function saveSketchToStorage(key: string, dataUrl: string): void {
  if (typeof localStorage === "undefined" || !key) return;
  try {
    localStorage.setItem(SKETCH_STORAGE_PREFIX + key, dataUrl);
  } catch {
    /* 避免配额满时抛错 */
  }
}

/**
 * 读取本地手绘草图
 */
export function loadSketchFromStorage(key: string): string | null {
  if (typeof localStorage === "undefined" || !key) return null;
  try {
    return localStorage.getItem(SKETCH_STORAGE_PREFIX + key);
  } catch {
    return null;
  }
}

/**
 * 清除本地手绘草图
 */
export function clearSketchFromStorage(key: string): void {
  if (typeof localStorage === "undefined" || !key) return;
  try {
    localStorage.removeItem(SKETCH_STORAGE_PREFIX + key);
  } catch {
    /* ignore */
  }
}

export interface HighlighterPreset {
  id: string;
  name: string;
  color: string;
}

export const HIGHLIGHTER_PRESETS: HighlighterPreset[] = [
  { id: "yellow", name: "明黄荧光", color: "var(--lv-hl-yellow, rgba(250, 204, 21, 0.45))" },
  { id: "green", name: "翠绿荧光", color: "var(--lv-hl-green, rgba(52, 211, 153, 0.45))" },
  { id: "blue", name: "冰蓝荧光", color: "var(--lv-hl-blue, rgba(56, 189, 248, 0.45))" },
  { id: "pink", name: "珊瑚粉荧光", color: "var(--lv-hl-pink, rgba(244, 63, 94, 0.45))" },
];

/**
 * 荧光笔画笔配置生成器（FLOW-04）
 */
export function getHighlighterStrokeStyle(color = HIGHLIGHTER_PRESETS[0].color, width = 16) {
  return {
    strokeStyle: color,
    lineWidth: width,
    lineCap: "round" as CanvasLineCap,
    lineJoin: "round" as CanvasLineJoin,
  };
}
