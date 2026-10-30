import { describe, it, expect } from "vitest";
import type { ImageOcclusionSpec, ImageOcclusionMask } from "../src/core/types";
import {
  renderOcclusionSvg,
  createOcclusionQuestions,
} from "../src/core/imageOcclusion";
import { buildCompactQuestionSheetPro, auditQuestionSheetSafety } from "../src/core/printPro";

describe("图片遮挡题核心引擎 (imageOcclusion)", () => {
  const sampleMasks: ImageOcclusionMask[] = [
    { id: "m-1", x: 0.2, y: 0.3, w: 0.15, h: 0.08, answer: "三尖瓣", hint: "右房室瓣" },
    { id: "m-2", x: 0.6, y: 0.4, w: 0.18, h: 0.09, answer: "二尖瓣" },
  ];

  const spec: ImageOcclusionSpec = {
    v: 1,
    kind: "imageOcclusion",
    imageUrl: "assets/heart_anatomy.png",
    masks: sampleMasks,
  };

  it("renderOcclusionSvg 生成合规矢量 SVG，包含底图与遮罩", () => {
    const svg = renderOcclusionSvg(spec, { activeMaskId: "m-1" });
    expect(svg).toContain("<svg");
    expect(svg).toContain('href="assets/heart_anatomy.png"');
    expect(svg).toContain('data-mask-id="m-1"');
    expect(svg).toContain('data-mask-id="m-2"');
    expect(svg).toContain("①");
    expect(svg).toContain("②");
    // 未揭晓时绝不暴露答案文本
    expect(svg).not.toContain("三尖瓣");
    expect(svg).not.toContain("二尖瓣");
  });

  it("renderOcclusionSvg 在 revealedMaskIds 包含时显示答案", () => {
    const svg = renderOcclusionSvg(spec, { revealedMaskIds: ["m-1"] });
    expect(svg).toContain("lv-occlusion-revealed");
    expect(svg).toContain("三尖瓣");
    // m-2 仍未揭晓
    expect(svg).not.toContain("二尖瓣");
  });

  it("renderOcclusionSvg 打印模式脱敏高反差：白底黑边与带圈编号，绝无答案外泄", () => {
    const svg = renderOcclusionSvg(spec, { printMode: true });
    expect(svg).toContain("lv-occlusion-mask-print");
    expect(svg).toContain('fill="#ffffff"');
    expect(svg).toContain('stroke-dasharray="4,2"');
    expect(svg).toContain("①");
    expect(svg).toContain("②");
    expect(svg).not.toContain("三尖瓣");
    expect(svg).not.toContain("二尖瓣");
  });

  it("createOcclusionQuestions 自动裂变生成单题并绑定题族", () => {
    const qs = createOcclusionQuestions({
      imageUrl: "assets/heart.png",
      masks: sampleMasks,
      kp: "人体解剖/循环系统",
      source: "医考真题图谱",
    });

    expect(qs).toHaveLength(2);

    const q1 = qs[0];
    const q2 = qs[1];
    expect(q1.type).toBe("fill");
    expect(q1.answer).toBe("三尖瓣");
    expect(q1.stem).toContain("序号 **①** 区域");
    expect(q1.stem).toContain("提示：右房室瓣");
    expect(q1.occlusion?.activeMaskId).toBe("m-1");

    expect(q2.answer).toBe("二尖瓣");
    expect(q2.stem).toContain("序号 **②** 区域");
    expect(q2.occlusion?.activeMaskId).toBe("m-2");

    // 验证绑定了统一的题族 parentId (siblingBury 防干扰联动)
    expect(q1.family?.variantKind).toBe("near_transfer");
    expect(q2.family?.variantKind).toBe("near_transfer");
    expect(q1.family?.parentId).toBe(q2.family?.parentId);
  });

  it("buildCompactQuestionSheetPro 打印排版集成遮挡图，且通过安全审计", () => {
    const qs = createOcclusionQuestions({
      imageUrl: "assets/brain.png",
      masks: [
        { id: "b1", x: 0.1, y: 0.1, w: 0.2, h: 0.2, answer: "大脑皮层" },
      ],
    });

    const html = buildCompactQuestionSheetPro("解剖学摸底测试", qs);
    expect(html).toContain("occlusion-wrap");
    expect(html).toContain("lv-occlusion-mask-print");
    expect(html).toContain("①");

    // 安全审计确认学生卷绝无“大脑皮层”答案泄漏
    const audit = auditQuestionSheetSafety(html, qs);
    expect(audit.safe).toBe(true);
  });
});
