import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  parseOcrFormResult,
  processOcrImageUpload,
  findImageInClipboard,
} from "@/ui/practice/services/manualOcrService";

describe("manualOcrService", () => {
  const dummyT = (k: string) => `[${k}]`;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("parseOcrFormResult", () => {
    it("returns null on blank text", () => {
      expect(parseOcrFormResult("   ")).toBeNull();
    });

    it("parses single choice question text correctly", () => {
      const text = `
已知集合 A={1,2}，求子集个数
A. 1
B. 2
C. 4
D. 8
答案：C
解析：2^2=4
考点：集合论
      `;
      const res = parseOcrFormResult(text);
      expect(res).not.toBeNull();
      expect(res?.type).toBe("single");
      expect(res?.stem).toContain("集合 A={1,2}");
      expect(res?.options).toEqual(["1", "2", "4", "8"]);
      expect(res?.answer).toBe("C");
      expect(res?.analysis).toContain("2^2=4");
      expect(res?.kp).toBe("集合论");
    });
  });

  describe("processOcrImageUpload", () => {
    it("returns error on missing app or file", async () => {
      const res = await processOcrImageUpload(null, null as any, dummyT);
      expect(res.success).toBe(false);
      expect(res.isError).toBe(true);
    });

    it("processes image upload successfully and normalizes options", async () => {
      const mockApp = {
        uploadAndOcrQuestion: vi.fn().mockResolvedValue({
          type: "material", // 应当转换为 single
          stem: "这是 OCR 识别题干",
          options: ["选项1"], // 不满2个选项时自动补齐
          answer: "A",
          analysis: "OCR 解析",
          kp: "OCR 考点",
        }),
      };

      const file = new File(["dummy"], "question.png", { type: "image/png" });
      const res = await processOcrImageUpload(mockApp, file, dummyT);

      expect(mockApp.uploadAndOcrQuestion).toHaveBeenCalledWith(file, "question.png");
      expect(res.success).toBe(true);
      expect(res.form?.type).toBe("single");
      expect(res.form?.options).toEqual(["", ""]);
      expect(res.message).toBe("[manual.ocrDone]");
    });

    it("handles upload failure gracefully", async () => {
      const mockApp = {
        uploadAndOcrQuestion: vi.fn().mockRejectedValue(new Error("网络超时")),
      };

      const file = new File(["dummy"], "question.png", { type: "image/png" });
      const res = await processOcrImageUpload(mockApp, file, dummyT);

      expect(res.success).toBe(false);
      expect(res.isError).toBe(true);
      expect(res.message).toContain("网络超时");
    });
  });

  describe("findImageInClipboard", () => {
    it("returns null when no clipboard items", () => {
      const e = { clipboardData: null } as any;
      expect(findImageInClipboard(e)).toBeNull();
    });

    it("finds image file from clipboard items", () => {
      const mockImageFile = new File(["image"], "clip.png", { type: "image/png" });
      const e = {
        clipboardData: {
          items: [
            { type: "text/plain", getAsFile: () => null },
            { type: "image/png", getAsFile: () => mockImageFile },
          ],
        },
      } as any;

      const file = findImageInClipboard(e);
      expect(file).toBe(mockImageFile);
    });
  });
});
