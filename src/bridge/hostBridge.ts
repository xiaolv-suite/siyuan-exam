// ============================================================
// HostBridge: 宿主独立网桥（S1 切片架构收敛）
// - 抽象并收敛思源内核 SQL / IAL / 块操作 / 宿主状态
// - 1:1 单向委托至底层 KernelApiClient，严格禁止反向包装造成递归
// ============================================================
import type { Question } from "../core/types";
import { KernelApiClient } from "../kernel/client";
import type { IHostBridge, KernelReadOptions, ProbeResult } from "../kernel/client";

export type { IHostBridge };

export class HostBridge implements IHostBridge {
  constructor(private readonly client: KernelApiClient) {}

  /**
   * 宿主移动端环境感知（390×844 适配防御）
   */
  isMobile(): boolean {
    if (typeof window === "undefined") return false;
    const w = window as unknown as { siyuan?: { mobile?: boolean } };
    if (w.siyuan?.mobile) return true;
    if (typeof document !== "undefined") {
      return Boolean(document.getElementById("mobileTopBar") || document.querySelector(".toolbar--mobile"));
    }
    return false;
  }

  // --- SQL 查询接口 ---

  sql<T = Record<string, unknown>>(stmt: string, options?: KernelReadOptions): Promise<T[]> {
    return this.client.sql<T>(stmt, options);
  }

  sqlPaged<T = Record<string, unknown>>(stmt: string, pageSize = 1000, options?: KernelReadOptions): Promise<T[]> {
    return this.client.sqlPaged<T>(stmt, pageSize, options);
  }

  querySql<T = Record<string, unknown>>(stmt: string, options?: KernelReadOptions): Promise<T[]> {
    if (typeof (this.client as any).querySql === "function") {
      return (this.client as any).querySql(stmt, options);
    }
    return this.sql<T>(stmt, options);
  }

  // --- IAL 属性与收藏 ---

  getBlockAttrs(blockId: string): Promise<Record<string, string>> {
    return this.client.getBlockAttrs(blockId);
  }

  setExamAttrs(blockId: string, attrs: Record<string, string>): Promise<void> {
    return this.client.setExamAttrs(blockId, attrs);
  }

  setExamFav(blockId: string, on: boolean): Promise<void> {
    return this.client.setExamFav(blockId, on);
  }

  // --- 块正文与 Markdown ---

  getBlockKramdown(blockId: string): Promise<string> {
    return this.client.getBlockKramdown(blockId);
  }

  appendBlock(parentId: string, markdown: string): Promise<string[]> {
    return this.client.appendBlock(parentId, markdown);
  }

  insertBlockAfter(parentId: string, previousId: string, markdown: string): Promise<string[]> {
    if (typeof (this.client as unknown as { insertBlockAfter?: unknown }).insertBlockAfter === "function") {
      return (this.client as unknown as { insertBlockAfter: (p: string, prev: string, m: string) => Promise<string[]> }).insertBlockAfter(parentId, previousId, markdown);
    }
    return this.client.appendBlock(parentId, markdown);
  }

  setBlockAttrs(blockId: string, attrs: Record<string, string>): Promise<void> {
    if (typeof (this.client as unknown as { setBlockAttrs?: unknown }).setBlockAttrs === "function") {
      return (this.client as unknown as { setBlockAttrs: (id: string, a: Record<string, string>) => Promise<void> }).setBlockAttrs(blockId, attrs);
    }
    if (this.canRawPost()) {
      return this.rawPost("/api/attr/setBlockAttrs", { id: blockId, attrs }).then((r) => {
        if (r && typeof r.code === "number" && r.code !== 0) {
          throw new Error(r.msg || `setBlockAttrs failed with code ${r.code}`);
        }
      });
    }
    return Promise.resolve();
  }

  canRawPost(): boolean {
    const c = this.client as unknown as { canRawPost?: () => boolean; rawPost?: unknown };
    if (typeof c.canRawPost === "function") return c.canRawPost();
    return typeof c.rawPost === "function";
  }

  rawPost(endpoint: string, payload: unknown): Promise<{ code: number; msg: string; data: unknown }> {
    const c = this.client as unknown as { rawPost?: (ep: string, p: unknown) => Promise<{ code: number; msg: string; data: unknown }> };
    if (typeof c.rawPost === "function") return c.rawPost(endpoint, payload);
    return Promise.reject(new Error("rawPost not supported by client"));
  }

  appendQuestions(parentId: string, questions: Question[]): Promise<{ qid: string; blockId: string }[]> {
    return this.client.appendQuestions(parentId, questions);
  }

  updateBlock(blockId: string, markdown: string): Promise<void> {
    return this.client.updateBlock(blockId, markdown);
  }

  removeBlock(blockId: string): Promise<void> {
    return this.client.removeBlock(blockId);
  }

  deleteBlock(blockId: string): Promise<void> {
    return this.client.deleteBlock(blockId);
  }

  renderMarkdown(markdown: string): Promise<string> {
    return this.client.renderMarkdown(markdown);
  }

  // --- 笔记本与文档 ---

  listNotebooks(): Promise<{ id: string; name: string }[]> {
    return this.client.listNotebooks();
  }

  listAllNotebooks(): Promise<{ id: string; name: string; closed: boolean }[]> {
    return this.client.listAllNotebooks();
  }

  openNotebook(notebook: string): Promise<void> {
    return this.client.openNotebook(notebook);
  }

  createNotebook(name: string): Promise<string> {
    return this.client.createNotebook(name);
  }

  getNotebookConf(notebookId: string): Promise<{ name: string; dailyNoteSavePath: string }> {
    return this.client.getNotebookConf(notebookId);
  }

  createDocWithMd(notebook: string, hpath: string, markdown: string): Promise<string> {
    return this.client.createDocWithMd(notebook, hpath, markdown);
  }

  createDailyNote(notebookId?: string): Promise<string> {
    return this.client.createDailyNote(notebookId);
  }

  exportDocMarkdown(docId: string): Promise<{ title: string; content: string }> {
    return this.client.exportDocMarkdown(docId);
  }

  exportNotebookSy(notebookId: string): Promise<{ zipPath: string }> {
    return this.client.exportNotebookSy(notebookId);
  }

  importSyUpload(file: Blob, filename = "bank.sy.zip"): Promise<void> {
    return this.client.importSyUpload(file, filename);
  }

  listQuestions(
    notebook: string,
    rootHPath?: string,
  ): Promise<(Question & { blockId: string; rootId: string; hpath: string })[]> {
    return this.client.listQuestions(notebook, rootHPath);
  }

  docTree(
    notebook: string,
    rootHPath?: string,
  ): Promise<{
    docs: { id: string; title: string; hpath: string }[];
    headings: { id: string; text: string; hpath: string; level: number }[];
  }> {
    return this.client.docTree(notebook, rootHPath);
  }

  backlinks(blockId: string): Promise<{ docId: string; title: string; content: string }[]> {
    return this.client.backlinks(blockId);
  }

  // --- 文件系统操作 ---

  putFile(path: string, fileOrData: string | Blob | File): Promise<void> {
    return this.client.putFile(path, fileOrData);
  }

  removeFile(path: string): Promise<void> {
    return this.client.removeFile(path);
  }

  getFileBytes(path: string): Promise<Uint8Array | null> {
    return this.client.getFileBytes(path);
  }

  // --- 闪卡与 Riff 牌组 ---

  getRiffDecks(): Promise<{ id: string; name: string }[]> {
    return this.client.getRiffDecks();
  }

  createRiffDeck(name: string): Promise<string> {
    return this.client.createRiffDeck(name);
  }

  addRiffCards(deckId: string, blockIds: string[]): Promise<void> {
    return this.client.addRiffCards(deckId, blockIds);
  }

  getDueCards(deckId: string): Promise<unknown[]> {
    return this.client.getDueCards(deckId);
  }

  getCardIDsByBlockIDs(blockIds: string[], deckId?: string): Promise<Map<string, string>> {
    return this.client.getCardIDsByBlockIDs(blockIds, deckId);
  }

  reviewRiffCard(cardId: string, deckId: string, rating: 1 | 2 | 3 | 4): Promise<void> {
    return this.client.reviewRiffCard(cardId, deckId, rating);
  }

  // --- AI 推理与媒体资源 ---

  aiChat(msg: string, signal?: AbortSignal): Promise<unknown> {
    return this.client.aiChat(msg, signal);
  }

  assetOcr(
    path: string,
    options?: { signal?: AbortSignal; timeoutMs?: number },
  ): Promise<{ text: string; ocrJSON: Array<Record<string, string> | null> | null }> {
    return this.client.assetOcr(path, options);
  }

  getImageOcrText(path: string): Promise<string> {
    return this.client.getImageOcrText(path);
  }

  setImageOcrText(path: string, text: string): Promise<void> {
    return this.client.setImageOcrText(path, text);
  }

  uploadAsset(
    file: Blob,
    filename = "question.png",
    options?: { signal?: AbortSignal; timeoutMs?: number },
  ): Promise<string> {
    return this.client.uploadAsset(file, filename, options);
  }

  // --- 探测能力 ---

  probe(options?: { light?: boolean }): Promise<ProbeResult> {
    return this.client.probe(options);
  }
}
