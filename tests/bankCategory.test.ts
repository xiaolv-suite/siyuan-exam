import { describe, it, expect } from "vitest";
import { BANK_CATEGORIES, getBankCategoryMeta } from "../src/core/bankCategory";
import { ExamApp } from "../src/app";
import { MemoryStorage } from "../src/core/attemptLog";
import type { KernelApiClient } from "../src/kernel/client";

function stubClient() {
  const client = {
    createNotebook: async () => "nb-test",
    createDocWithMd: async () => "doc-1",
    appendQuestions: async () => [],
    sql: async () => [],
  } as unknown as KernelApiClient;
  return client;
}

describe("题库研学场景分类与元数据模型 (bankCategory)", () => {
  it("定义完整全学段场景：大考、职业考证、K12基础教育、大学硕博、多语言、教学教研与综合通识", () => {
    expect(BANK_CATEGORIES.exam.code).toBe("exam");
    expect(BANK_CATEGORIES.exam.label).toContain("考");

    expect(BANK_CATEGORIES.certificate.code).toBe("certificate");
    expect(BANK_CATEGORIES.certificate.label).toBe("职业资格考证");

    expect(BANK_CATEGORIES.k12.code).toBe("k12");
    expect(BANK_CATEGORIES.k12.label).toBe("K12基础教育");

    expect(BANK_CATEGORIES.higher.code).toBe("higher");
    expect(BANK_CATEGORIES.higher.label).toBe("大学与考研硕博");

    expect(BANK_CATEGORIES.language.code).toBe("language");
    expect(BANK_CATEGORIES.language.label).toBe("多语言研学");

    expect(BANK_CATEGORIES.teaching.code).toBe("teaching");
    expect(BANK_CATEGORIES.teaching.label).toBe("教学教研");

    expect(BANK_CATEGORIES.general.code).toBe("general");
    expect(BANK_CATEGORIES.general.label).toBe("终身通识研学");
  });

  it("getBankCategoryMeta 安全容错，未知或空分类回退至综合研学", () => {
    expect(getBankCategoryMeta("exam").code).toBe("exam");
    expect(getBankCategoryMeta("language").code).toBe("language");
    expect(getBankCategoryMeta("unknown").code).toBe("general");
    expect(getBankCategoryMeta(null).code).toBe("general");
    expect(getBankCategoryMeta(undefined).code).toBe("general");
  });

  it("ExamApp.createBank 支持设定场景分类并在 updateBankCategory 中自由切换", async () => {
    const client = stubClient();
    const app = new ExamApp({ client, storage: new MemoryStorage(), now: () => 1_800_000_000_000 });
    app.kernelOnline = true;

    // 1. 创建指定多语言分类的题库
    const b = await app.createBank("粤语每日练习", "language");
    expect(b.name).toBe("粤语每日练习");
    expect(b.category).toBe("language");

    // 2. 动态切换分类为教学教研
    const updated = await app.updateBankCategory(b.id, "teaching");
    expect(updated.category).toBe("teaching");

    // 3. 查列表与持久化状态一致
    const banks = app.listBanks();
    expect(banks.find((item) => item.id === b.id)?.category).toBe("teaching");
  });

  it("updateBankCategory 传入未知题库 ID 明确抛错", async () => {
    const client = stubClient();
    const app = new ExamApp({ client, storage: new MemoryStorage(), now: () => 1_800_000_000_000 });
    app.kernelOnline = true;

    await expect(app.updateBankCategory("ghost-id", "exam")).rejects.toThrow("未找到对应题库");
  });
});
