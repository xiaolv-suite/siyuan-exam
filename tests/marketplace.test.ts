import { describe, it, expect, vi } from "vitest";
import {
  DEFAULT_MARKETPLACE_CATALOG,
  validateMarketplaceCatalog,
  filterMarketplaceItems,
  sortMarketplaceItems,
} from "../src/core/marketplace";
import {
  fetchMarketplaceCatalog,
  installMarketplaceItem,
} from "../src/ui/practice/services/marketplaceService";

describe("题库与闪卡公共集市 (Marketplace)", () => {
  it("1. 官方精选公版集市目录结构合规且包含 8 大精品科目", () => {
    expect(DEFAULT_MARKETPLACE_CATALOG.v).toBe(1);
    expect(DEFAULT_MARKETPLACE_CATALOG.items.length).toBeGreaterThanOrEqual(8);

    const ids = DEFAULT_MARKETPLACE_CATALOG.items.map((it) => it.id);
    expect(ids).toContain("math-highschool-theorems");
    expect(ids).toContain("computer-networks-os");
    expect(ids).toContain("english-core-vocabulary");
    expect(ids).toContain("law-constitution-civil");

    for (const item of DEFAULT_MARKETPLACE_CATALOG.items) {
      expect(item.verified).toBe(true);
      expect(item.license).toMatch(/Public Domain|MIT/);
      expect(item.embeddedQuestions?.length).toBeGreaterThan(0);
    }
  });

  it("2. validateMarketplaceCatalog 准确识别非法格式与合规格式", () => {
    expect(validateMarketplaceCatalog(null).valid).toBe(false);
    expect(validateMarketplaceCatalog({}).valid).toBe(false);

    const validRaw = {
      v: 1,
      name: "社区测试订阅源",
      description: "测试源描述",
      items: [
        {
          id: "custom-1",
          title: "中考化学必背方程式",
          description: "重点方程式",
          downloadUrl: "https://example.com/cards.json",
        },
      ],
    };
    const res = validateMarketplaceCatalog(validRaw);
    expect(res.valid).toBe(true);
    expect(res.catalog?.items[0].title).toBe("中考化学必背方程式");
  });

  it("3. filterMarketplaceItems 按关键词与分类精准过滤", () => {
    const items = DEFAULT_MARKETPLACE_CATALOG.items;

    // 按分类
    const mathOnly = filterMarketplaceItems(items, "", "math");
    expect(mathOnly.every((i) => i.category === "math")).toBe(true);

    // 按关键词
    const searchRes = filterMarketplaceItems(items, "TCP", "all");
    expect(searchRes.length).toBeGreaterThanOrEqual(1);
    expect(searchRes[0].title).toContain("计算机网络");
  });

  it("4. installMarketplaceItem 一键安装内嵌题库到思源本地", async () => {
    const mathItem = DEFAULT_MARKETPLACE_CATALOG.items.find((i) => i.id === "math-highschool-theorems")!;
    expect(mathItem).toBeDefined();

    const mockApp: any = {
      createBank: vi.fn().mockResolvedValue({ id: "bank-new-math", name: mathItem.title }),
      writeManualQuestion: vi.fn().mockResolvedValue({ id: "q-saved" }),
    };

    const res = await installMarketplaceItem(mathItem, mockApp);
    expect(res.success).toBe(true);
    expect(res.bankId).toBe("bank-new-math");
    expect(res.count).toBe(mathItem.embeddedQuestions!.length);
    expect(mockApp.createBank).toHaveBeenCalledWith(mathItem.title);
    expect(mockApp.writeManualQuestion).toHaveBeenCalledTimes(mathItem.embeddedQuestions!.length);
  });

  it("5. fetchMarketplaceCatalog 在无外网或非法地址时自动回退官方公版源", async () => {
    const res = await fetchMarketplaceCatalog("official");
    expect(res.catalog.items.length).toBeGreaterThanOrEqual(8);
    expect(res.isCustom).toBe(false);

    const fallbackRes = await fetchMarketplaceCatalog("https://invalid-non-existent-url-999.xyz/bad.json");
    expect(fallbackRes.catalog.items.length).toBeGreaterThanOrEqual(8);
    expect(fallbackRes.error).toContain("拉取外部源失败");
  });

  it("6. sortMarketplaceItems 按题量、更新时间与标题排序", () => {
    const items = DEFAULT_MARKETPLACE_CATALOG.items;

    const byCount = sortMarketplaceItems(items, "count_desc");
    for (let i = 0; i < byCount.length - 1; i++) {
      expect((byCount[i].itemCount || 0)).toBeGreaterThanOrEqual(byCount[i + 1].itemCount || 0);
    }

    const byTitle = sortMarketplaceItems(items, "title_asc");
    expect(byTitle.length).toBe(items.length);
  });
});
