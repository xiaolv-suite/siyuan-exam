import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  drawGridBackground,
  drawCoordinateAxis,
  drawGeometryShape,
  saveSketchToStorage,
  loadSketchFromStorage,
  clearSketchFromStorage,
  HIGHLIGHTER_PRESETS,
  getHighlighterStrokeStyle,
} from "../src/ui/practice/services/sketchpadService";

describe("数理草图演练画板服务 (sketchpadService)", () => {
  let mockCtx: any;

  beforeEach(() => {
    mockCtx = {
      save: vi.fn(),
      restore: vi.fn(),
      fillRect: vi.fn(),
      strokeRect: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      fill: vi.fn(),
      arc: vi.fn(),
      closePath: vi.fn(),
      fillText: vi.fn(),
    };
  });

  it("1. drawGridBackground：正确绘制草稿网格", () => {
    drawGridBackground(mockCtx, 400, 200, 20);
    expect(mockCtx.save).toHaveBeenCalled();
    expect(mockCtx.fillRect).toHaveBeenCalledWith(0, 0, 400, 200);
    expect(mockCtx.stroke).toHaveBeenCalled();
    expect(mockCtx.restore).toHaveBeenCalled();
  });

  it("2. drawCoordinateAxis：正确绘制带箭头与坐标轴标注的数轴体系", () => {
    drawCoordinateAxis(mockCtx, 400, 240, "#1e3a8a");
    expect(mockCtx.beginPath).toHaveBeenCalled();
    expect(mockCtx.fillText).toHaveBeenCalledWith("x", expect.any(Number), expect.any(Number));
    expect(mockCtx.fillText).toHaveBeenCalledWith("y", expect.any(Number), expect.any(Number));
    expect(mockCtx.fillText).toHaveBeenCalledWith("O", expect.any(Number), expect.any(Number));
    expect(mockCtx.stroke).toHaveBeenCalled();
  });

  it("3. drawGeometryShape：正确支持三角形、圆与矩形印章", () => {
    drawGeometryShape(mockCtx, 400, 240, "triangle");
    expect(mockCtx.closePath).toHaveBeenCalled();
    expect(mockCtx.fillText).toHaveBeenCalledWith("A", expect.any(Number), expect.any(Number));

    drawGeometryShape(mockCtx, 400, 240, "circle");
    expect(mockCtx.arc).toHaveBeenCalled();

    drawGeometryShape(mockCtx, 400, 240, "box");
    expect(mockCtx.strokeRect).toHaveBeenCalled();
  });

  it("4. 本地存储存取与清除闭环", () => {
    const store: Record<string, string> = {};
    vi.stubGlobal("localStorage", {
      setItem: (k: string, v: string) => { store[k] = v; },
      getItem: (k: string) => store[k] ?? null,
      removeItem: (k: string) => { delete store[k]; },
    });

    saveSketchToStorage("test-q1", "data:image/png;base64,abc");
    expect(loadSketchFromStorage("test-q1")).toBe("data:image/png;base64,abc");

    clearSketchFromStorage("test-q1");
    expect(loadSketchFromStorage("test-q1")).toBeNull();
  });

  it("5. getHighlighterStrokeStyle：正确生成半透明荧光笔画笔配置 (FLOW-04)", () => {
    expect(HIGHLIGHTER_PRESETS.length).toBeGreaterThanOrEqual(4);
    const style = getHighlighterStrokeStyle(HIGHLIGHTER_PRESETS[0].color, 16);
    expect(style.lineWidth).toBe(16);
    expect(style.lineCap).toBe("round");
    expect(style.lineJoin).toBe("round");
    expect(style.strokeStyle).toContain("rgba(250, 204, 21");
  });
});
