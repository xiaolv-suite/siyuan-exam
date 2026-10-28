import { describe, it, expect, vi } from "vitest";
import { loadBankSectionTree } from "@/ui/practice/services/sectionTreeService";
import type { ExamApp } from "@/app";

describe("题库章节目录树服务 (sectionTreeService)", () => {
  it("1. loadBankSectionTree：空入参安全防御", async () => {
    const res = await loadBankSectionTree(null as unknown as ExamApp, "");
    expect(res).toEqual([]);
  });

  it("2. loadBankSectionTree：加载文档与标题树结构", async () => {
    const mockApp = {
      docTree: vi.fn().mockResolvedValue({
        docs: [{ id: "d1", title: "第一章", hpath: "/第一章" }],
        headings: [{ id: "h1", docId: "d1", text: "第一节", hpath: "/第一章/第一节", level: 1 }],
      }),
    } as unknown as ExamApp;

    const tree = await loadBankSectionTree(mockApp, "bank-1");
    expect(mockApp.docTree).toHaveBeenCalledWith("bank-1");
    expect(tree).toHaveLength(1);
    expect(tree[0].id).toBe("d1");
    expect(tree[0].children).toHaveLength(1);
  });
});
