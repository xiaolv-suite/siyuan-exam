import type { ExamApp } from "@/app";
import { buildSectionTree, type DocNode, type SectionRef, type HeadingNode } from "@/core/sectionTree";

/**
 * 加载题库文档与标题层级结构树
 */
export async function loadBankSectionTree(
  app: ExamApp,
  bankId: string,
): Promise<DocNode[]> {
  if (!app || !bankId) return [];
  try {
    const tr = await app.docTree(bankId);
    return buildSectionTree(tr.docs, tr.headings);
  } catch {
    return [];
  }
}

/**
 * 递归计算章节树选中节点的展示标签
 */
export function resolveSectionNodeLabel(
  sectionTree: DocNode[],
  sectionSel: SectionRef | null | undefined,
): string {
  if (!sectionSel) return "";
  if (sectionSel.kind === "doc") {
    return sectionTree.find((d) => d.id === sectionSel.id)?.title ?? sectionSel.hpath;
  }
  const walk = (nodes: HeadingNode[]): string | null => {
    for (const n of nodes) {
      if (n.hpath === sectionSel.hpath) return n.text;
      const hit = walk(n.children);
      if (hit) return hit;
    }
    return null;
  };
  for (const d of sectionTree) {
    const hit = walk(d.children);
    if (hit) return hit;
  }
  return sectionSel.hpath;
}

