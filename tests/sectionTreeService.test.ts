import { describe, it, expect, vi } from "vitest";
import {
  loadBankSectionTree,
  resolveSectionNodeLabel,
} from "@/ui/practice/services/sectionTreeService";
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

  it("3. resolveSectionNodeLabel：递归解析文档与标题节点标签", () => {
    const tree = [
      {
        id: "d1",
        title: "第一章 代数基础",
        hpath: "/第一章",
        children: [
          {
            id: "h1",
            text: "1.1 一元二次方程",
            hpath: "/第一章/1.1",
            level: 1,
            children: [],
          },
        ],
      },
    ] as any;

    // 1. 空选中
    expect(resolveSectionNodeLabel(tree, null)).toBe("");

    // 2. 选中整篇文档
    expect(resolveSectionNodeLabel(tree, { kind: "doc", id: "d1", hpath: "/第一章" })).toBe("第一章 代数基础");

    // 3. 选中标题节点
    expect(resolveSectionNodeLabel(tree, { kind: "heading", id: "h1", hpath: "/第一章/1.1" })).toBe("1.1 一元二次方程");

    // 4. 未匹配节点回退自身 hpath
    expect(resolveSectionNodeLabel(tree, { kind: "heading", id: "h99", hpath: "/未知/节点" })).toBe("/未知/节点");
  });
});
