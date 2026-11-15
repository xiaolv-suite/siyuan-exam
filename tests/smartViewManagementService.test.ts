import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  loadSmartViewsAux,
  saveSmartViewsAux,
  createNamedSmartView,
  isViewBankMismatched,
  removeNamedSmartView,
  loadExcelMappingsAux,
  saveExcelMappingAux,
  cloneQuestionToManualDraft,
  getNeighborQuestionId,
  createEmptyBrowseFilters,
  executeSaveNamedViewWithPrompt,
  executeDeleteNamedViewWithConfirm,
} from "@/ui/practice/services/smartViewManagementService";
import type { SmartView } from "@/core/smartViews";
import type { Question } from "@/core/types";

describe("smartViewManagementService", () => {
  const dummyT = (k: string) => `[${k}]`;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("loadSmartViewsAux", () => {
    it("loads views successfully when app returns array", async () => {
      const mockViews: SmartView[] = [
        { name: "高频错题", v: 1, bankId: "bank-1", favOnly: true, createdAt: 1000 },
      ];
      const mockApp = { loadAux: vi.fn().mockResolvedValue(mockViews) };

      const res = await loadSmartViewsAux(mockApp, dummyT);
      expect(res.views).toEqual(mockViews);
      expect(res.failed).toBe(false);
      expect(res.error).toBe("");
    });

    it("handles load failure gracefully", async () => {
      const mockApp = { loadAux: vi.fn().mockRejectedValue(new Error("文件损坏")) };

      const res = await loadSmartViewsAux(mockApp, dummyT);
      expect(res.views).toEqual([]);
      expect(res.failed).toBe(true);
      expect(res.error).toContain("[view.loadFailed]");
    });
  });

  describe("saveSmartViewsAux", () => {
    it("saves views successfully", async () => {
      const mockApp = { saveAux: vi.fn().mockResolvedValue(undefined) };
      const views: SmartView[] = [
        { name: "测试视图", v: 1, bankId: "bank-1", favOnly: false, createdAt: 1000 },
      ];

      const res = await saveSmartViewsAux(mockApp, views, dummyT);
      expect(res.success).toBe(true);
      expect(mockApp.saveAux).toHaveBeenCalledWith("browse/smartViews", views);
    });

    it("returns error on save failure", async () => {
      const mockApp = { saveAux: vi.fn().mockRejectedValue(new Error("只读")) };

      const res = await saveSmartViewsAux(mockApp, [], dummyT);
      expect(res.success).toBe(false);
      expect(res.error).toContain("[view.saveFailed]");
    });
  });

  describe("createNamedSmartView and isViewBankMismatched", () => {
    it("creates/upserts named smart view", () => {
      const initial: SmartView[] = [
        { name: "旧视图", v: 1, bankId: "b1", favOnly: false, createdAt: 100 },
      ];

      const next = createNamedSmartView(
        initial,
        "b1",
        "新视图",
        "函数",
        true,
        { docId: "d1" },
      );

      expect(next).toHaveLength(2);
      expect(next.find((v) => v.name === "新视图")).toMatchObject({
        name: "新视图",
        bankId: "b1",
        search: "函数",
        favOnly: true,
      });
    });

    it("checks view bank mismatch correctly", () => {
      const view: SmartView = { name: "数学专精", v: 1, bankId: "math-bank", favOnly: false, createdAt: 100 };
      expect(isViewBankMismatched(view, "math-bank")).toBe(false);
      expect(isViewBankMismatched(view, "english-bank")).toBe(true);
    });

    it("removes named smart view", () => {
      const list: SmartView[] = [
        { name: "v1", v: 1, bankId: "b1", favOnly: false, createdAt: 1 },
        { name: "v2", v: 1, bankId: "b1", favOnly: false, createdAt: 2 },
      ];
      expect(removeNamedSmartView(list, "v1")).toEqual([list[1]]);
    });
  });

  describe("loadExcelMappingsAux and saveExcelMappingAux", () => {
    it("loads excel mappings successfully", async () => {
      const mockMappings = [{ name: "模板1", map: { stem: 0, answer: 1 } as any }];
      const mockApp = { loadAux: vi.fn().mockResolvedValue(mockMappings) };

      const res = await loadExcelMappingsAux(mockApp);
      expect(res).toEqual(mockMappings);
    });

    it("returns empty array on error", async () => {
      const mockApp = { loadAux: vi.fn().mockRejectedValue(new Error("not found")) };
      const res = await loadExcelMappingsAux(mockApp);
      expect(res).toEqual([]);
    });

    it("saves new mapping and deduplicates", async () => {
      const mockApp = { saveAux: vi.fn().mockResolvedValue(undefined) };
      const existing = [{ name: "旧模板", map: { stem: 0 } as any }];
      const res = await saveExcelMappingAux(
        mockApp,
        existing,
        "新模板",
        { stem: 1, answer: 2 } as any,
        dummyT,
      );

      expect(res.success).toBe(true);
      expect(res.next).toHaveLength(2);
      expect(res.message).toBe("[settingSaved]");
    });
  });

  describe("cloneQuestionToManualDraft", () => {
    it("converts question to manual draft with mother question backlink and variation mark", () => {
      const q: Question = {
        id: "q-12345678",
        type: "single",
        stem: "若已知集合 A={1,2}，求子集个数",
        options: ["2", "4", "8", "16"],
        answer: "B",
        analysis: "子集个数公式为 2^n",
        kp: "集合与常用逻辑",
        blockId: "20261028120000-block12",
      };

      const draft = cloneQuestionToManualDraft(q);
      expect(draft.type).toBe("single");
      expect(draft.stem).toBe("若已知集合 A={1,2}，求子集个数（变式）");
      expect(draft.options).toEqual(["2", "4", "8", "16"]);
      expect(draft.answer).toBe("B");
      expect(draft.analysis).toContain("【母题解析】：子集个数公式为 2^n");
      expect(draft.kp).toBe("集合与常用逻辑");
      expect(draft.source).toContain("20261028120000-block12");
      expect(draft.status).toBe("draft");
      expect(draft.family).toEqual({
        parentId: "q-12345678",
        variantKind: "near_transfer",
        verified: true,
      });
      expect(draft.toast).toContain("母题溯源反链");
    });

    it("maps material question type to single", () => {
      const q: Question = {
        id: "q-87654321",
        type: "material",
        stem: "阅读材料并分析",
      };

      const draft = cloneQuestionToManualDraft(q);
      expect(draft.type).toBe("single");
    });
  });

  describe("getNeighborQuestionId", () => {
    const list: Question[] = [
      { id: "q-1" } as any,
      { id: "q-2" } as any,
      { id: "q-3" } as any,
    ];

    it("gets previous and next question ids safely", () => {
      expect(getNeighborQuestionId(list, 1, -1)).toBe("q-1");
      expect(getNeighborQuestionId(list, 1, 1)).toBe("q-3");
      expect(getNeighborQuestionId(list, 0, -1)).toBeNull();
      expect(getNeighborQuestionId(list, 2, 1)).toBeNull();
    });
  });

  describe("createEmptyBrowseFilters, executeSaveNamedViewWithPrompt, executeDeleteNamedViewWithConfirm", () => {
    it("returns clean empty browse filter state", () => {
      const empty = createEmptyBrowseFilters();
      expect(empty.search).toBe("");
      expect(empty.favOnly).toBe(false);
      expect(empty.filterDays).toBe(0);
      expect(empty.sectionSel).toBeNull();
      expect(empty.selectedView).toBe("");
    });

    it("saves named view via prompt dialog", async () => {
      const mockApp = { saveAux: vi.fn().mockResolvedValue(undefined) };
      const promptOk = vi.fn().mockResolvedValue("高考压轴题");

      const res = await executeSaveNamedViewWithPrompt(
        mockApp,
        [],
        "b-math",
        { search: "导数", favOnly: true, sectionSel: null },
        promptOk,
        dummyT,
      );

      expect(res).not.toBeNull();
      expect(res?.savedName).toBe("高考压轴题");
      expect(res?.nextViews[0].search).toBe("导数");
      expect(mockApp.saveAux).toHaveBeenCalled();
    });

    it("deletes named view with confirm dialog", async () => {
      const mockApp = { saveAux: vi.fn().mockResolvedValue(undefined) };
      const current = [{ name: "待删除视图", v: 1, bankId: "b1", favOnly: false, createdAt: 100 }] as any;
      const confirmOk = vi.fn().mockResolvedValue(true);

      const res = await executeDeleteNamedViewWithConfirm(
        mockApp,
        current,
        "待删除视图",
        confirmOk,
        dummyT,
      );

      expect(res.deleted).toBe(true);
      expect(res.nextViews).toHaveLength(0);
      expect(mockApp.saveAux).toHaveBeenCalled();
    });
  });
});
