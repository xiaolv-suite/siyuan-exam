import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getMaterialIconName,
  registerMaterialFile,
  registerMaterialLinkInput,
  removeMaterialWithConfirm,
  saveMaterialNoteItem,
  removeMaterialNoteWithConfirm,
  resolveMaterialLocatedUrl,
  bridgeMaterialToManual,
  bridgeMaterialToAi,
} from "@/ui/practice/services/materialManagementService";
import type { MaterialDoc } from "@/core/materials";
import type { MaterialNote } from "@/core/materialNotes";

describe("materialManagementService", () => {
  const dummyT = (k: string) => `[${k}]`;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getMaterialIconName", () => {
    it("returns correct icons for different material types", () => {
      expect(getMaterialIconName("pdf")).toBe("table");
      expect(getMaterialIconName("video")).toBe("play");
      expect(getMaterialIconName("audio")).toBe("volume");
      expect(getMaterialIconName("image")).toBe("file");
      expect(getMaterialIconName("doc")).toBe("file");
      expect(getMaterialIconName("unknown")).toBe("folder");
    });
  });

  describe("registerMaterialFile", () => {
    it("registers new material from file successfully", async () => {
      const mockApp = {
        registerMaterialFromFile: vi.fn().mockResolvedValue({
          material: { id: "m-1", title: "测试讲义.pdf" },
          deduped: false,
        }),
      };
      const file = new File(["dummy"], "测试讲义.pdf", { type: "application/pdf" });

      const res = await registerMaterialFile(
        mockApp,
        file,
        { subject: "数学", chapter: "第一章" },
        dummyT,
      );

      expect(mockApp.registerMaterialFromFile).toHaveBeenCalledWith(file, {
        subject: "数学",
        chapter: "第一章",
      });
      expect(res.deduped).toBe(false);
      expect(res.message).toContain("[materials.registered]");
      expect(res.message).toContain("测试讲义.pdf");
    });

    it("handles deduped material file registration", async () => {
      const mockApp = {
        registerMaterialFromFile: vi.fn().mockResolvedValue({
          material: { id: "m-1", title: "已有讲义.pdf" },
          deduped: true,
        }),
      };
      const file = new File(["dummy"], "已有讲义.pdf", { type: "application/pdf" });

      const res = await registerMaterialFile(mockApp, file, {}, dummyT);
      expect(res.deduped).toBe(true);
      expect(res.message).toBe("[materials.deduped]");
    });
  });

  describe("registerMaterialLinkInput", () => {
    it("registers external link without blockId", async () => {
      const mockApp = {
        registerMaterialFromLink: vi.fn().mockResolvedValue({
          material: { id: "m-2", title: "在线教材" },
          deduped: false,
        }),
      };

      const res = await registerMaterialLinkInput(
        mockApp,
        "https://example.com/book",
        "在线教材",
        { subject: "英语" },
        dummyT,
      );

      expect(mockApp.registerMaterialFromLink).toHaveBeenCalledWith(
        "https://example.com/book",
        { title: "在线教材", subject: "英语", chapter: undefined },
      );
      expect(res.material.id).toBe("m-2");
    });

    it("resolves block title via SiYuan sql when title is blank", async () => {
      const mockSql = vi.fn().mockResolvedValue([{ content: "知识点总结导图", hpath: "/数学/总结" }]);
      const mockApp = {
        kernelOnline: true,
        deps: { client: { sql: mockSql } },
        registerMaterialFromLink: vi.fn().mockResolvedValue({
          material: { id: "m-3", title: "知识点总结导图" },
          deduped: false,
        }),
      };

      const res = await registerMaterialLinkInput(
        mockApp,
        "siyuan://blocks/20261028120000-abcdef1",
        "",
        {},
        dummyT,
      );

      expect(mockSql).toHaveBeenCalled();
      expect(mockApp.registerMaterialFromLink).toHaveBeenCalledWith(
        "siyuan://blocks/20261028120000-abcdef1",
        expect.objectContaining({ title: "知识点总结导图" }),
      );
      expect(res.material.id).toBe("m-3");
    });
  });

  describe("removeMaterialWithConfirm", () => {
    it("aborts when confirmDialog returns false", async () => {
      const mockApp = { removeMaterialById: vi.fn() };
      const confirmFn = vi.fn().mockResolvedValue(false);
      const mat = { id: "m-1", title: "代数初步" } as MaterialDoc;

      const res = await removeMaterialWithConfirm(mockApp, mat, confirmFn, dummyT);
      expect(res.success).toBe(false);
      expect(mockApp.removeMaterialById).not.toHaveBeenCalled();
    });

    it("removes material when confirmed", async () => {
      const mockApp = { removeMaterialById: vi.fn().mockResolvedValue(undefined) };
      const confirmFn = vi.fn().mockResolvedValue(true);
      const mat = { id: "m-1", title: "代数初步" } as MaterialDoc;

      const res = await removeMaterialWithConfirm(mockApp, mat, confirmFn, dummyT);
      expect(res.success).toBe(true);
      expect(mockApp.removeMaterialById).toHaveBeenCalledWith("m-1");
      expect(res.message).toBe("[materials.removed]");
    });
  });

  describe("saveMaterialNoteItem", () => {
    const dummyMat = { id: "m-1", revision: 2 };

    it("throws when note text is empty", async () => {
      const mockApp = { addMaterialNote: vi.fn() };
      await expect(
        saveMaterialNoteItem(mockApp, dummyMat, { text: "   " }, dummyT),
      ).rejects.toThrow("笔记内容不能为空");
    });

    it("throws on invalid page number", async () => {
      const mockApp = { addMaterialNote: vi.fn() };
      await expect(
        saveMaterialNoteItem(mockApp, dummyMat, { text: "重点概念", page: "abc" }, dummyT),
      ).rejects.toThrow("[materials.badPage]");

      await expect(
        saveMaterialNoteItem(mockApp, dummyMat, { text: "重点概念", page: "0" }, dummyT),
      ).rejects.toThrow("[materials.badPage]");
    });

    it("creates a new note with page and parsed time", async () => {
      const mockApp = { addMaterialNote: vi.fn().mockResolvedValue({ id: "n-1" }) };
      const res = await saveMaterialNoteItem(
        mockApp,
        dummyMat,
        {
          text: "关于反函数定义的疑问",
          page: "45",
          time: "03:20",
          quote: "设函数y=f(x)",
          tags: "高频，易错",
        },
        dummyT,
      );

      expect(res.success).toBe(true);
      expect(mockApp.addMaterialNote).toHaveBeenCalledWith({
        materialId: "m-1",
        revision: 2,
        locator: {
          page: 45,
          tSec: 200,
          quote: "设函数y=f(x)",
        },
        text: "关于反函数定义的疑问",
        tags: ["高频", "易错"],
      });
    });

    it("updates existing note when editingId is provided", async () => {
      const mockApp = { updateMaterialNote: vi.fn().mockResolvedValue(undefined) };
      const res = await saveMaterialNoteItem(
        mockApp,
        dummyMat,
        {
          editingId: "n-99",
          text: "更新后的笔记",
          tags: "已复习",
        },
        dummyT,
      );

      expect(res.success).toBe(true);
      expect(mockApp.updateMaterialNote).toHaveBeenCalledWith("n-99", {
        locator: null,
        text: "更新后的笔记",
        tags: ["已复习"],
      });
    });
  });

  describe("removeMaterialNoteWithConfirm", () => {
    it("aborts when confirmDialog returns false", async () => {
      const mockApp = { deleteMaterialNote: vi.fn() };
      const confirmFn = vi.fn().mockResolvedValue(false);
      const note = { id: "n-1", text: "这是一条笔记" } as MaterialNote;

      const res = await removeMaterialNoteWithConfirm(mockApp, note, confirmFn, dummyT);
      expect(res.success).toBe(false);
      expect(mockApp.deleteMaterialNote).not.toHaveBeenCalled();
    });

    it("deletes note when confirmed", async () => {
      const mockApp = { deleteMaterialNote: vi.fn().mockResolvedValue(undefined) };
      const confirmFn = vi.fn().mockResolvedValue(true);
      const note = { id: "n-1", text: "这是一条笔记" } as MaterialNote;

      const res = await removeMaterialNoteWithConfirm(mockApp, note, confirmFn, dummyT);
      expect(res.success).toBe(true);
      expect(mockApp.deleteMaterialNote).toHaveBeenCalledWith("n-1");
    });
  });

  describe("resolveMaterialLocatedUrl", () => {
    it("returns null if base url cannot be resolved", () => {
      const mockApp = { resolveMaterialUrlOf: vi.fn().mockReturnValue(null) };
      const res = resolveMaterialLocatedUrl(mockApp, { id: "m-1" } as any);
      expect(res).toBeNull();
    });

    it("attaches locator hash to resolved url", () => {
      const mockApp = { resolveMaterialUrlOf: vi.fn().mockReturnValue("https://example.com/book.pdf") };
      const res = resolveMaterialLocatedUrl(
        mockApp,
        { id: "m-1" } as any,
        { page: 12 },
        "https://example.com",
      );
      expect(res).toBe("https://example.com/book.pdf#page=12");
    });
  });

  describe("bridgeMaterialToManual and bridgeMaterialToAi", () => {
    const mat: MaterialDoc = {
      id: "m-1",
      title: "微积分基础",
      subject: "高等数学",
      chapter: "导数与微分",
      kind: "pdf",
      storage: { type: "asset", assetPath: "assets/calc.pdf", mime: "application/pdf", size: 1024, sha256: "abc" },
      revision: 1,
      createdAt: 1000,
      updatedAt: 1000,
    };

    it("bridges material and note to manual entry form", () => {
      const res = bridgeMaterialToManual(mat, "请根据定理1.3证明连续性");
      expect(res.source).toBe("高等数学 / 导数与微分 / 微积分基础");
      expect(res.stem).toBe("请根据定理1.3证明连续性");
      expect(res.toast).toContain("微积分基础");
    });

    it("bridges material and notes to AI studio prompt context", () => {
      const mockApp = {
        listMaterialNotes: vi.fn().mockReturnValue([
          { id: "n-1", text: "笔记一：求导公式总结" },
          { id: "n-2", text: "笔记二：洛必达法则适用条件" },
        ]),
      };

      const res = bridgeMaterialToAi(mockApp, mat, "重点突破极限计算");
      expect(res.content).toContain("【资料出处】高等数学 / 导数与微分 / 微积分基础");
      expect(res.content).toContain("【重点笔记】\n重点突破极限计算");
      expect(res.toast).toContain("微积分基础");
    });
  });
});
