import { describe, it, expect, vi } from "vitest";
import {
  computeQuestionMaterialSnapshot,
  saveQuestionMaterialReference,
  removeQuestionMaterialReference,
  resolveQuestionMaterialOpenUrl,
  initQrefFormState,
  buildAllQuestionsMaterialSnapshot,
} from "@/ui/practice/services/questionMaterialLinkService";
import type { ExamApp } from "@/app";

vi.mock("@/libs/dialog", () => ({
  confirmDialogSync: vi.fn().mockResolvedValue(true),
}));

describe("题目↔学习资料关联引用服务 (questionMaterialLinkService)", () => {
  const fakeMaterial = {
    id: "mat-1",
    title: "高数精讲第一章.pdf",
    kind: "pdf" as const,
    revision: 1,
    createdAt: 1000,
    tags: [],
  };

  it("1. computeQuestionMaterialSnapshot：获取关联快照视图", () => {
    const mockApp = {
      questionMaterialRef: vi.fn().mockReturnValue({
        materialId: "mat-1",
        locator: { page: 12 },
        revision: 1,
      }),
      listMaterials: vi.fn().mockReturnValue([fakeMaterial]),
    } as unknown as ExamApp;

    const snap = computeQuestionMaterialSnapshot(mockApp, "q-1");
    expect(snap).not.toBeNull();
    expect(snap?.title).toBe("高数精讲第一章.pdf");
    expect(snap?.label).toContain("12");
    expect(snap?.stale).toBe(false);
  });

  it("2. saveQuestionMaterialReference：保存定位关联并校验页码有效性", async () => {
    const msgs: string[] = [];
    const showMessage = (m: string) => msgs.push(m);
    const t = (k: string) => `[${k}]`;

    const mockApp = {
      questionMaterialRef: vi.fn().mockReturnValue(null),
      linkQuestionMaterial: vi.fn().mockResolvedValue({ replaced: false }),
    } as unknown as ExamApp;

    // 1. 成功保存页码关联
    const res = await saveQuestionMaterialReference(
      mockApp,
      "q-1",
      "mat-1",
      "15",
      "",
      showMessage,
      t,
    );
    expect(mockApp.linkQuestionMaterial).toHaveBeenCalledWith("q-1", "mat-1", { page: 15, tSec: undefined });
    expect(res.replaced).toBe(false);
    expect(msgs).toContain("[qref.linked]");

    // 2. 非法页码抛异常
    await expect(
      saveQuestionMaterialReference(mockApp, "q-1", "mat-1", "-1", "", showMessage, t),
    ).rejects.toThrow("[materials.badPage]");
  });

  it("3. removeQuestionMaterialReference：解除关联弹窗确认与执行", async () => {
    const msgs: string[] = [];
    const showMessage = (m: string) => msgs.push(m);
    const t = (k: string) => `[${k}]`;

    const mockApp = {
      questionMaterialRef: vi.fn().mockReturnValue({ materialId: "mat-1" }),
      unlinkQuestionMaterial: vi.fn().mockResolvedValue(undefined),
    } as unknown as ExamApp;

    const matId = await removeQuestionMaterialReference(mockApp, "q-1", showMessage, t);
    expect(mockApp.unlinkQuestionMaterial).toHaveBeenCalledWith("q-1");
    expect(matId).toBe("mat-1");
    expect(msgs).toContain("[qref.unlinked]");
  });

  it("4. resolveQuestionMaterialOpenUrl：正确解析资料打开定位 URL", () => {
    const mockApp = {
      questionMaterialRef: vi.fn().mockReturnValue({
        materialId: "mat-1",
        locator: { page: 20 },
      }),
      listMaterials: vi.fn().mockReturnValue([fakeMaterial]),
      resolveMaterialUrlOf: vi.fn().mockReturnValue("http://127.0.0.1:6806/assets/mat1.pdf"),
    } as unknown as ExamApp;

    const res = resolveQuestionMaterialOpenUrl(mockApp, "q-1", "http://127.0.0.1:6806");
    expect(res.material?.id).toBe("mat-1");
    expect(res.url).toContain("page=20");
  });

  it("5. initQrefFormState：初始化资料关联编辑表单状态", () => {
    // 1. 无已有引用
    const emptyApp = {
      questionMaterialRef: vi.fn().mockReturnValue(null),
    } as unknown as ExamApp;
    expect(initQrefFormState(emptyApp, "q-1")).toEqual({
      materialId: "",
      page: "",
      time: "",
    });

    // 2. 有已有引用（页码+时间定位）
    const mockApp = {
      questionMaterialRef: vi.fn().mockReturnValue({
        materialId: "mat-2",
        locator: { page: 12, tSec: 125 },
      }),
    } as unknown as ExamApp;
    const form = initQrefFormState(mockApp, "q-2");
    expect(form.materialId).toBe("mat-2");
    expect(form.page).toBe("12");
    expect(form.time).toBe("2:05");
  });

  it("6. buildAllQuestionsMaterialSnapshot：批量计算题目资料快照映射", () => {
    const mockApp = {
      questionMaterialRef: vi.fn().mockImplementation((id: string) => {
        if (id === "q-1") return { materialId: "mat-1", locator: { page: 1 } };
        return null;
      }),
      listMaterials: vi.fn().mockReturnValue([fakeMaterial]),
    } as unknown as ExamApp;

    const res = buildAllQuestionsMaterialSnapshot(mockApp, [{ id: "q-1" }, { id: "q-2" }]);
    expect(res["q-1"]).not.toBeNull();
    expect(res["q-1"]?.title).toBe("高数精讲第一章.pdf");
    expect(res["q-2"]).toBeNull();
  });
});
