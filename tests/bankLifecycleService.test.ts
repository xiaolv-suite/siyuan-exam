import { describe, it, expect, vi } from "vitest";
import {
  normalizeSampleBankKind,
  getSampleBankMeta,
  executeCreateBank,
  executeCreateSampleBank,
  resolveRetainedSampleBank,
  formatSampleNoticeText,
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
});
