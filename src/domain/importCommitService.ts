import type { AppHost } from "./appContext";
import type { Question } from "../core/types";
import type { ImportReport, ImportCheckpoint } from "../importer/pipeline";
import { buildImportCheckpoint } from "../importer/pipeline";

export interface ImportCommitResult {
  written: number;
  docs: string[];
  readback: {
    confirmed: string[];
    missing: string[];
    verified: boolean;
  };
  cancelled?: boolean;
  unprocessed?: string[];
  pendingIndex?: string[];
  checkpoint?: ImportCheckpoint | null;
}

export class ImportCommitDomainService {
  constructor(private app: AppHost) {}

  async commitImport(
    bankId: string,
    report: ImportReport,
    opts?: { onProgress?: (done: number, total: number) => void; isCancelled?: () => boolean },
  ): Promise<ImportCommitResult> {
    if (!report.ok.length) return { written: 0, docs: [], readback: { confirmed: [], missing: [], verified: false } };
    const uniqueQuestions = [...new Map(report.ok.map((q) => [q.id, q])).values()];
    const expected = uniqueQuestions.map((q) => q.id);
    const knownIds = new Set<string>();
    let indexedReadSucceeded = false;
    if (this.app.kernelOnline) {
      try {
        for (const q of await this.app.listQuestions(bankId)) knownIds.add(q.id);
        indexedReadSucceeded = true;
      } catch { /* 索引读取失败时仍可核对目标题文档原文；不能把失败当作空题库。 */ }
    }
    const readDocumentIds = async (docId: string): Promise<string[] | null> => {
      if (typeof this.app.bridge.getBlockKramdown !== "function") return null;
      const raw = await this.app.bridge.getBlockKramdown(docId);
      if (!raw) throw new Error("未读取到导入文档原文，请恢复连接后重试。");
      return Array.from(raw.matchAll(/\bcustom-exam-id="([^"]+)"/g), ([, id]) => id);
    };
    const byDoc = new Map<string, typeof report.ok>();
    for (const q of uniqueQuestions) {
      const doc = q.kp ? `/${q.kp.split("/")[0]}` : `/导入/${report.batch}`;
      if (!byDoc.has(doc)) byDoc.set(doc, []);
      byDoc.get(doc)!.push(q);
    }
    const total = expected.length;
    let processed = 0;
    let cancelled = false;
    const processedIds = new Set<string>();
    const submittedIds = new Set<string>();
    const writtenIds = new Set<string>();
    const docs: string[] = [];
    const docIds: string[] = [];
    for (const [doc, qs] of byDoc) {
      if (opts?.isCancelled?.()) {
        cancelled = true;
        break;
      }
      const docId = await this.app.ensureDoc(bankId, doc);
      if (!docId) throw new Error("未取得导入文档 ID，请稍后重试。");
      const existing = await readDocumentIds(docId);
      if (existing) {
        for (const id of existing) knownIds.add(id);
      } else if (!indexedReadSucceeded) {
        throw new Error("无法核对已导入题目，请恢复连接后重试。");
      }
      const pending = qs.filter((q) => !knownIds.has(q.id));
      for (const q of pending) submittedIds.add(q.id);
      const writtenBlocks = pending.length ? await this.app.bridge.appendQuestions(docId, pending) : [];
      for (const { qid, blockId } of writtenBlocks) {
        if (!blockId || !pending.some((q) => q.id === qid)) continue;
        writtenIds.add(qid);
        knownIds.add(qid);
        const pq = pending.find((q) => q.id === qid);
        const spec = pq?.answerSpec;
        const rubric = pq?.rubric;
        const studyMeta = pq?.studyMeta;
        const secondaryKps = pq?.secondaryKps;
        const occlusion = pq?.occlusion;
        const family = pq?.family;
        const sourceBlockId = pq?.sourceBlockId;
        if (!spec && !rubric && !studyMeta && !secondaryKps?.length && !occlusion && !family && !sourceBlockId) continue;
        try {
          await this.app.bridge.setExamAttrs(blockId, {
            ...(spec ? { "exam-answer-spec": JSON.stringify(spec) } : {}),
            ...(rubric ? { "exam-rubric": JSON.stringify(rubric) } : {}),
            ...(studyMeta ? { "exam-study-meta": JSON.stringify(studyMeta) } : {}),
            ...(secondaryKps?.length ? { "exam-secondary-kps": secondaryKps.join(",") } : {}),
            ...(occlusion ? { "exam-occlusion": JSON.stringify(occlusion) } : {}),
            ...(family ? { "exam-family": JSON.stringify(family) } : {}),
            ...(sourceBlockId ? { "exam-source-block": sourceBlockId } : {}),
          });
        } catch { /* spec 写失败不影响题目入库 */ }
      }
      processed += qs.length;
      for (const q of qs) processedIds.add(q.id);
      docs.push(doc);
      docIds.push(docId);
      opts?.onProgress?.(processed, total);
    }
    this.app.invalidate();
    if (this.app.kernelOnline) {
      for (let i = 0; i < 6; i++) {
        if (i) await new Promise((r) => setTimeout(r, 700));
        try {
          const indexed = new Set((await this.app.listQuestions(bankId)).map((q) => q.id));
          indexedReadSucceeded = true;
          for (const id of indexed) {
            knownIds.add(id);
            if (submittedIds.has(id)) writtenIds.add(id);
          }
          if ([...processedIds].every((id) => indexed.has(id))) break;
        } catch {
          /* 索引未就绪，继续等 */
        }
      }
    }
    const confirmedIds = new Set<string>();
    let readback: ImportCommitResult["readback"] = { confirmed: [], missing: expected, verified: false };
    if (this.app.kernelOnline) {
      let verified = false;
      try {
        for (const q of await this.app.listQuestions(bankId)) confirmedIds.add(q.id);
        verified = true;
      } catch { /* 继续核对目标文档原文 */ }
      let documentsVerified = docIds.length > 0;
      for (const docId of docIds) {
        try {
          const ids = await readDocumentIds(docId);
          if (!ids) documentsVerified = false;
          else for (const id of ids) confirmedIds.add(id);
        } catch { documentsVerified = false; }
      }
      for (const id of confirmedIds) if (submittedIds.has(id)) writtenIds.add(id);
      readback = {
        confirmed: expected.filter((id) => confirmedIds.has(id)),
        missing: expected.filter((id) => !confirmedIds.has(id)),
        verified: verified || documentsVerified,
      };
    }
    const written = writtenIds.size;
    const unprocessed = expected.filter((id) => !processedIds.has(id) && !confirmedIds.has(id));
    const pendingIndex = expected.filter((id) => submittedIds.has(id) && !confirmedIds.has(id));

    let checkpoint: ImportCheckpoint | null = null;
    if (cancelled || readback.missing.length > 0) {
      checkpoint = buildImportCheckpoint({
        batch: report.batch,
        bankId,
        allQuestions: uniqueQuestions,
        confirmedIds: readback.confirmed,
        docs,
        now: this.app.deps.now?.() ?? Date.now(),
      });
      if (checkpoint) {
        try {
          await this.saveImportCheckpoint(checkpoint);
        } catch { /* 尽力而为 */ }
      }
    } else {
      try {
        await this.clearImportCheckpoint();
      } catch { /* 尽力而为 */ }
    }

    return {
      written,
      docs,
      readback,
      ...(cancelled ? { cancelled } : {}),
      ...(unprocessed.length ? { unprocessed } : {}),
      ...(pendingIndex.length ? { pendingIndex } : {}),
      ...(checkpoint ? { checkpoint } : {}),
    };
  }

  async loadImportCheckpoint(bankId?: string): Promise<ImportCheckpoint | null> {
    const cp = await this.app.loadAux<ImportCheckpoint>("import/checkpoint");
    if (!cp || cp.v !== 1) return null;
    if (bankId && cp.bankId !== bankId) return null;
    return cp;
  }

  async saveImportCheckpoint(cp: ImportCheckpoint): Promise<void> {
    await this.app.saveAux("import/checkpoint", cp);
  }

  async clearImportCheckpoint(): Promise<void> {
    await this.app.saveAux("import/checkpoint", null);
  }

  async applyAnswerUpdates(
    updates: { row: number; q: Question }[],
    existing: (Question & { blockId: string })[],
    opts?: { isCancelled?: () => boolean; onProgress?: (done: number, total: number) => void },
  ): Promise<{ ok: number; failed: number; missing: number; unprocessed?: number }> {
    if (!this.app.kernelOnline) throw new Error("离线：更新已有题需要内核可写");
    const byHash = new Map(existing.map((q) => [q.hash, q]));
    let ok = 0,
      failed = 0,
      missing = 0;
    for (let i = 0; i < updates.length; i++) {
      if (opts?.isCancelled?.()) return { ok, failed, missing, unprocessed: updates.length - i };
      const u = updates[i];
      const target = byHash.get(u.q.hash);
      if (!target?.blockId) {
        missing++;
        opts?.onProgress?.(i + 1, updates.length);
        continue;
      }
      try {
        await this.app.saves.run(`answer-update/${target.blockId}`, () =>
          this.app.bridge.setExamAttrs(target.blockId, {
            "exam-answer": u.q.answer,
            "exam-analysis": u.q.analysis ?? "",
            ...(u.q.alt?.length ? { "exam-alt": u.q.alt.join("|") } : {}),
          }),
        );
        ok++;
      } catch {
        failed++;
      }
      opts?.onProgress?.(i + 1, updates.length);
    }
    return { ok, failed, missing };
  }
}
