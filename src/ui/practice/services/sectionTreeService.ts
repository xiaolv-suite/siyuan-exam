import type { ExamApp } from "@/app";
import { buildSectionTree, type DocNode } from "@/core/sectionTree";

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
