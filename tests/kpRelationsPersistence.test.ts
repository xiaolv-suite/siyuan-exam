import { describe, it, expect } from "vitest";
import { ExamApp } from "../src/app";
import { MemoryStorage } from "../src/core/attemptLog";
import type { KernelApiClient } from "../src/kernel/client";
import type { KpRelation } from "../src/core/kpRelations";

function stubClient() {
  return {
    sql: async () => [],
    getRiffDecks: async () => [],
  } as unknown as KernelApiClient;
}

describe("考点先修图谱与国家新课标大纲预设持久化 (kpRelations & taxonomy preset)", () => {
  it("1. 初始状态为空集合，支持批量 setKpRelations 并正确持久化", async () => {
    const storage = new MemoryStorage();
    const app = new ExamApp({ client: stubClient(), storage });
    await app.init("device-1");

    expect(app.kpRelationsDoc().relations).toEqual([]);

    const sampleRel: KpRelation = {
      from: "数与代数/整式的乘法与因式分解",
      to: "数与代数/有理数",
      kind: "prereq",
      source: "syllabus",
      confirmed: true,
      createdAt: 1000,
    };

    await app.setKpRelations([sampleRel]);
    expect(app.kpRelationsDoc().relations).toHaveLength(1);
    expect(app.kpRelationsDoc().relations[0].from).toBe("数与代数/整式的乘法与因式分解");

    // 重启 App，验证从 storage 成功恢复
    const app2 = new ExamApp({ client: stubClient(), storage });
    await app2.init("device-1");
    expect(app2.kpRelationsDoc().relations).toHaveLength(1);
    expect(app2.kpRelationsDoc().relations[0].to).toBe("数与代数/有理数");
  });

  it("3. applyTaxonomyPreset 一键载入国家新课标图谱大纲与先修依赖", async () => {
    const storage = new MemoryStorage();
    const app = new ExamApp({ client: stubClient(), storage });
    await app.init("device-1");

    const result = await app.applyTaxonomyPreset();

    // 验证返回的大纲根节点与先修边
    expect(result.roots.length).toBeGreaterThan(0);
    expect(result.relations.length).toBeGreaterThanOrEqual(8);

    // 验证内存及持久化状态
    expect(app.syllabusDoc().roots.length).toBeGreaterThan(0);
    expect(app.syllabusDoc().meta.source).toContain("cn-math-taxonomy");
    expect(app.kpRelationsDoc().relations.length).toBeGreaterThanOrEqual(8);

    // 重载并验证重载后完整保留
    const app2 = new ExamApp({ client: stubClient(), storage });
    await app2.init("device-1");
    expect(app2.syllabusDoc().roots.length).toBe(result.roots.length);
    expect(app2.kpRelationsDoc().relations.length).toBe(result.relations.length);
  });

  it("4. purgeAllData 能够正确清空考点先修关系网络", async () => {
    const storage = new MemoryStorage();
    const app = new ExamApp({ client: stubClient(), storage });
    await app.init("device-1");

    await app.applyTaxonomyPreset();
    expect(app.kpRelationsDoc().relations.length).toBeGreaterThan(0);

    const receipts = await app.purgeAllData();
    const kpReceipt = receipts.find((r) => r.key === "kp/relations");
    expect(kpReceipt?.ok).toBe(true);
    expect(app.kpRelationsDoc().relations).toEqual([]);
  });
});
