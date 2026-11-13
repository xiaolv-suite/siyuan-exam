import { describe, it, expect, vi } from "vitest";
import {
  normalizeSampleBankKind,
  getSampleBankMeta,
  executeCreateBank,
  executeCreateSampleBank,
  resolveRetainedSampleBank,
  formatSampleNoticeText,
  executeCycleBankCategory,
  executeSyncBankToDoc,
  executeSaveWrongbookToDoc,
  executeRemoveBankWithConfirm,
  resolveInitialActiveBankId,
} from "@/ui/practice/services/bankLifecycleService";
import type { ExamApp } from "@/app";

describe("题库生命周期服务 (bankLifecycleService)", () => {
  const dummyT = (k: string) => `[${k}]`;

  it("1. normalizeSampleBankKind：参数归一化与非法兜底", () => {
    expect(normalizeSampleBankKind("cantonese")).toBe("cantonese");
    expect(normalizeSampleBankKind("english")).toBe("english");
    expect(normalizeSampleBankKind("qualification")).toBe("qualification");
    expect(normalizeSampleBankKind("k12")).toBe("k12");
    expect(normalizeSampleBankKind("higher")).toBe("higher");
    expect(normalizeSampleBankKind("invalid")).toBe("general");
    expect(normalizeSampleBankKind(new Event("click"))).toBe("general");
  });

  it("2. getSampleBankMeta：获取各场景示范题库的名称与题量元信息", () => {
    const general = getSampleBankMeta("general");
    expect(general.targetCount).toBeGreaterThan(0);
    expect(general.targetName).toBeDefined();

    const cantonese = getSampleBankMeta("cantonese");
    expect(cantonese.targetCount).toBeGreaterThan(0);

    const english = getSampleBankMeta("english");
    expect(english.targetCount).toBeGreaterThan(0);
  });

  it("3. executeCreateBank：执行建库并刷新题库列表", async () => {
    const mockCreated = { id: "b-new", name: "新建综合题库" };
    const mockApp = {
      createBank: vi.fn().mockResolvedValue(mockCreated),
      listBanks: vi.fn().mockReturnValue([mockCreated]),
    } as unknown as ExamApp;

    const res = await executeCreateBank(mockApp, "  新建综合题库  ");
    expect(mockApp.createBank).toHaveBeenCalledWith("新建综合题库");
    expect(res.bank).toEqual(mockCreated);
    expect(res.banks).toHaveLength(1);
  });

  it("4. executeCreateSampleBank：执行示范题库创建并带回目标题量", async () => {
    const mockCreated = { id: "b-cantonese", name: "粤语研学示范题库" };
    const mockApp = {
      createSampleBank: vi.fn().mockResolvedValue(mockCreated),
      listBanks: vi.fn().mockReturnValue([mockCreated]),
    } as unknown as ExamApp;

    const res = await executeCreateSampleBank(mockApp, "cantonese");
    expect(mockApp.createSampleBank).toHaveBeenCalledWith("cantonese");
    expect(res.bank).toEqual(mockCreated);
    expect(res.targetCount).toBeGreaterThan(0);
  });

  it("5. resolveRetainedSampleBank：查找异常残留的示范题库", () => {
    const mockBanks = [
      { id: "b-1", name: "普通题库" },
      { id: "b-2", name: "示范题库", sampleState: { total: 10 } },
    ] as any;
    const mockApp = {
      listBanks: vi.fn().mockReturnValue(mockBanks),
    } as unknown as ExamApp;

    const { retainedBank, banks } = resolveRetainedSampleBank(mockApp, "示范题库");
    expect(retainedBank).toBeDefined();
    expect(retainedBank?.id).toBe("b-2");
    expect(banks).toHaveLength(2);

    const notFound = resolveRetainedSampleBank(mockApp, "不存在");
    expect(notFound.retainedBank).toBeNull();
  });

  it("6. formatSampleNoticeText：组装示范题库就绪与等待提示", () => {
    const ready = formatSampleNoticeText(10, 10, false, dummyT);
    expect(ready).toBe("[guard.sampleReady]");

    const pending = formatSampleNoticeText(4, 10, false, dummyT);
    expect(pending).toBe("[guard.samplePending]");
  });

  it("7. executeCycleBankCategory：题库分类顺次轮转并更新元数据", async () => {
    const mockApp = {
      updateBankCategory: vi.fn().mockResolvedValue(undefined),
      listBanks: vi.fn().mockReturnValue([{ id: "b-1", name: "题库1", category: "language" }]),
    } as unknown as ExamApp;

    const res = await executeCycleBankCategory(mockApp, { id: "b-1", name: "题库1", category: "exam" } as any);
    expect(res.nextCategory).toBe("language");
    expect(res.badge).toBeDefined();
    expect(mockApp.updateBankCategory).toHaveBeenCalledWith("b-1", "language");
  });

  it("8. executeSyncBankToDoc：同步题库到思源笔记文档", async () => {
    const mockApp = {
      syncBankToSiyuanDoc: vi.fn().mockResolvedValue({ title: "题库同步文档" }),
    } as unknown as ExamApp;

    const res = await executeSyncBankToDoc(mockApp, "b-1");
    expect(res.title).toBe("题库同步文档");
    expect(mockApp.syncBankToSiyuanDoc).toHaveBeenCalledWith("b-1");
  });

  it("9. executeSaveWrongbookToDoc：错题集生成文档（含空列表守卫）", async () => {
    const mockApp = {
      saveQuestionsToSiyuanDoc: vi.fn().mockResolvedValue({ title: "错题集文档" }),
    } as unknown as ExamApp;

    const empty = await executeSaveWrongbookToDoc(mockApp, {
      bankName: "测试库",
      activeBankId: "b-1",
      questions: [{ id: "q-1" } as any],
      wrongQids: [],
    });
    expect(empty).toBeNull();

    const res = await executeSaveWrongbookToDoc(mockApp, {
      bankName: "测试库",
      activeBankId: "b-1",
      questions: [{ id: "q-1" } as any, { id: "q-2" } as any],
      wrongQids: ["q-1"],
    });
    expect(res).not.toBeNull();
    expect(res?.count).toBe(1);
    expect(mockApp.saveQuestionsToSiyuanDoc).toHaveBeenCalled();
  });

  it("10. executeRemoveBankWithConfirm：确认与取消移出题库管理", async () => {
    const showMessage = vi.fn();
    const t = (k: string) => `[${k}]`;
    const mockApp = {
      removeBank: vi.fn().mockResolvedValue(undefined),
      listBanks: vi.fn().mockReturnValue([{ id: "b-2", name: "剩余题库" }]),
    } as unknown as ExamApp;

    // 1. 取消
    const cancelConfirm = vi.fn().mockResolvedValue(false);
    const cancelRes = await executeRemoveBankWithConfirm({
      app: mockApp,
      activeBankId: "b-1",
      bankName: "待删题库",
      confirmDialogSync: cancelConfirm,
      showMessage,
      t,
    });
    expect(cancelRes.removed).toBe(false);
    expect(mockApp.removeBank).not.toHaveBeenCalled();

    // 2. 确认移出
    const okConfirm = vi.fn().mockResolvedValue(true);
    const okRes = await executeRemoveBankWithConfirm({
      app: mockApp,
      activeBankId: "b-1",
      bankName: "待删题库",
      confirmDialogSync: okConfirm,
      showMessage,
      t,
    });
    expect(okRes.removed).toBe(true);
    expect(okRes.nextBanks).toHaveLength(1);
    expect(okRes.nextActiveBankId).toBe("b-2");
    expect(mockApp.removeBank).toHaveBeenCalledWith("b-1");
    expect(showMessage).toHaveBeenCalledWith("[bank.removed]", 2800, "info");
  });

  it("11. resolveInitialActiveBankId：按优先级解析启动时的活动题库", () => {
    const banks = [{ id: "b-1" }, { id: "b-2" }, { id: "b-3" }];

    // 1. 优先 pendingViewBankId
    expect(resolveInitialActiveBankId({
      banks,
      pendingViewBankId: "b-2",
      rememberedBankId: "b-3",
    })).toBe("b-2");

    // 2. 次优 pendingPracticeBankId
    expect(resolveInitialActiveBankId({
      banks,
      pendingPracticeBankId: "b-3",
      rememberedBankId: "b-1",
    })).toBe("b-3");

    // 3. 次优 rememberedBankId
    expect(resolveInitialActiveBankId({
      banks,
      rememberedBankId: "b-2",
    })).toBe("b-2");

    // 4. 回退 banks[0].id
    expect(resolveInitialActiveBankId({
      banks,
    })).toBe("b-1");

    // 5. 空列表
    expect(resolveInitialActiveBankId({
      banks: [],
    })).toBe("");
  });
});
