// ============================================================
// WrongbookService: 错题本与自诊断复盘领域服务（S6 切片架构解耦）
// - 错因分类标签与艾宾浩斯复仇演练
// - 错题手动处置、顽固题封存归档与解除
// - 四要素个人复盘短模板与时间轴持久化
// ============================================================
import type { IHostBridge } from "../bridge/hostBridge";
import type { StorageGateway } from "../storage/storageGateway";
import { WRONG_REASON_KEY } from "../constants";
import type { WrongItem } from "../core/types";
import {
  filterEffectiveActiveWrongs,
  isWrongArchived as checkWrongArchived,
  type WrongOverlayRecord,
} from "../core/wrongState";
import {
  createDiagnosisEntry,
  appendDiagnosisToDoc,
  removeDiagnosisFromDoc,
  getLatestDiagnosis as findLatestDiagnosis,
  EMPTY_DIAGNOSIS_DOC,
  type SelfDiagnosisHistoryDoc,
} from "../core/selfDiagnosis";
import { emitExamEvent } from "../core/bus";

export interface WrongbookDeps {
  bridge: IHostBridge;
  storage: StorageGateway;
  ensureTier2Loaded: () => Promise<void>;
  assertStorageWritable: () => void;
  isKernelOnline: () => boolean;
  questionBlockMap?: Map<string, string>;
  getDerivedWrongbook: () => Map<string, WrongItem>;
  syncQuestionStudyStateToBlock?: (qid: string) => Promise<void>;
  onInvalidate?: () => void;
  now?: () => number;
}

export class WrongbookService {
  diagnosisDoc: SelfDiagnosisHistoryDoc = EMPTY_DIAGNOSIS_DOC;
  wrongReflections: Record<string, { text: string; at: number }> = {};
  wrongOverlay = new Map<string, { status: string; at: number; wrongCount: number; until?: number }>();
  wrongReasons = new Map<string, "careless" | "unknown" | "trap">();
  readonly reflectionNoteBlockIds = new Map<string, string>();

  constructor(private readonly deps: WrongbookDeps) {}

  activeReopenAt(): Map<string, number> | undefined {
    let reopenAt: Map<string, number> | undefined;
    for (const [qid, ov] of this.wrongOverlay.entries()) {
      if (ov?.status === "active" && typeof ov.at === "number") {
        reopenAt ??= new Map<string, number>();
        reopenAt.set(qid, ov.at);
      }
    }
    return reopenAt;
  }

  wrongItems(): WrongItem[] {
    const now = this.deps.now?.() ?? Date.now();
    return filterEffectiveActiveWrongs(
      [...this.deps.getDerivedWrongbook().values()],
      this.wrongOverlay as Map<string, WrongOverlayRecord>,
      now,
    ).sort((a, b) => b.wrongCount - a.wrongCount || b.firstWrongAt - a.firstWrongAt);
  }

  listArchivedWrongs(): WrongItem[] {
    const overlay = this.wrongOverlay;
    const all = [...this.deps.getDerivedWrongbook().values()];
    return all.filter((w) => checkWrongArchived(overlay.get(w.qid), w));
  }

  async loadDiagnosisDoc(): Promise<void> {
    const v = await this.deps.storage.load<SelfDiagnosisHistoryDoc>("wrongbook/diagnosis");
    if (v && v.v === 1 && v.records) {
      this.diagnosisDoc = v;
    } else {
      this.diagnosisDoc = { v: 1, records: {} };
    }
  }

  async loadWrongReflections(): Promise<void> {
    const v = await this.deps.storage.load<Record<string, { text: string; at: number }>>("wrongbook/reflections");
    this.wrongReflections = v ?? {};
  }

  async loadWrongOverlay(): Promise<void> {
    const v = await this.deps.storage.load<Record<string, { status: string; at: number; wrongCount: number; until?: number }>>("wrongbook/overlays");
    this.wrongOverlay = new Map(Object.entries(v ?? {}));
    this.deps.onInvalidate?.();
  }

  async loadWrongReasons(): Promise<void> {
    const map = await this.deps.storage.load<Record<string, { reason?: string }>>(WRONG_REASON_KEY);
    this.wrongReasons = new Map(
      Object.entries(map ?? {})
        .filter((e): e is [string, { reason: "careless" | "unknown" | "trap" }] => !!e[1]?.reason)
        .map(([k, v]) => [k, v.reason as "careless" | "unknown" | "trap"]),
    );
  }

  isWrongArchived(qid: string): boolean {
    const o = this.wrongOverlay.get(qid);
    const w = this.deps.getDerivedWrongbook().get(qid);
    return checkWrongArchived(o as WrongOverlayRecord | undefined, w);
  }

  async archiveWrong(qid: string): Promise<void> {
    await this.deps.ensureTier2Loaded();
    this.deps.assertStorageWritable();
    const key = "wrongbook/overlays";
    await this.deps.storage.queueStorageWrite(key, async (token) => {
      const current = this.deps.getDerivedWrongbook().get(qid);
      const v = await this.deps.storage.load<Record<string, { status: string; at: number; wrongCount: number; until?: number }>>(key);
      const previous = this.wrongOverlay;
      const map = { ...(v ?? {}) };
      const at = Math.max(this.deps.now?.() ?? Date.now(), current?.lastWrongAt ?? 0);
      map[qid] = { status: "archived", at, wrongCount: current?.wrongCount ?? 0 };
      try {
        await this.deps.storage.save(key, map, token);
        this.wrongOverlay = new Map(Object.entries(map));
        this.deps.onInvalidate?.();
      } catch (e) {
        this.wrongOverlay = previous;
        throw e;
      }
    });
    if (this.deps.syncQuestionStudyStateToBlock) {
      await this.deps.syncQuestionStudyStateToBlock(qid);
    }
    emitExamEvent("wrongbook-changed", { qid, status: "archived" });
  }

  async unarchiveWrong(qid: string): Promise<void> {
    await this.setWrongStatus(qid, "active");
  }

  async setWrongStatus(qid: string, status: "mastered" | "removed" | "active"): Promise<void> {
    await this.deps.ensureTier2Loaded();
    this.deps.assertStorageWritable();
    const key = "wrongbook/overlays";
    await this.deps.storage.queueStorageWrite(key, async (token) => {
      const current = this.deps.getDerivedWrongbook().get(qid);
      const v = await this.deps.storage.load<Record<string, { status: string; at: number; wrongCount: number; until?: number }>>(key);
      const previous = this.wrongOverlay;
      const map = { ...(v ?? {}) };
      if (status === "active") {
        if (current?.status === "eliminated" || current?.status === "mastered") {
          const at = Math.max(this.deps.now?.() ?? Date.now(), current?.lastWrongAt ?? 0, current?.eliminatedAt ?? 0);
          map[qid] = { status: "active", at, wrongCount: current?.wrongCount ?? 0 };
        } else {
          delete map[qid];
        }
      } else {
        const at = Math.max(this.deps.now?.() ?? Date.now(), current?.lastWrongAt ?? 0);
        map[qid] = { status, at, wrongCount: current?.wrongCount ?? 0 };
      }
      try {
        await this.deps.storage.save(key, map, token);
        this.wrongOverlay = new Map(Object.entries(map));
        this.deps.onInvalidate?.();
      } catch (e) {
        this.wrongOverlay = previous;
        throw e;
      }
    });
    if (this.deps.syncQuestionStudyStateToBlock) {
      await this.deps.syncQuestionStudyStateToBlock(qid);
    }
    emitExamEvent("wrongbook-changed", { qid, status });
  }

  async snoozeWrong(qid: string, days = 7): Promise<void> {
    if (!Number.isFinite(days) || days < 1 || days > 3650) throw new Error("暂缓天数应为 1–3650 的有限数字");
    await this.deps.ensureTier2Loaded();
    this.deps.assertStorageWritable();
    const key = "wrongbook/overlays";
    await this.deps.storage.queueStorageWrite(key, async (token) => {
      const current = this.deps.getDerivedWrongbook().get(qid);
      const v = await this.deps.storage.load<Record<string, { status: string; at: number; wrongCount: number; until?: number }>>(key);
      const previous = this.wrongOverlay;
      const map = { ...(v ?? {}) };
      const at = Math.max(this.deps.now?.() ?? Date.now(), current?.lastWrongAt ?? 0);
      map[qid] = { status: "snoozed", at, wrongCount: current?.wrongCount ?? 0, until: at + days * 86_400_000 };
      try {
        await this.deps.storage.save(key, map, token);
        this.wrongOverlay = new Map(Object.entries(map));
        this.deps.onInvalidate?.();
      } catch (e) {
        this.wrongOverlay = previous;
        throw e;
      }
    });
    if (this.deps.syncQuestionStudyStateToBlock) {
      await this.deps.syncQuestionStudyStateToBlock(qid);
    }
    emitExamEvent("wrongbook-changed", { qid, status: "snoozed" });
  }

  async saveWrongReflection(qid: string, text: string): Promise<void> {
    await this.deps.ensureTier2Loaded();
    this.deps.assertStorageWritable();
    const key = "wrongbook/reflections";
    const trimmed = text.trim();
    await this.deps.storage.queueStorageWrite(key, async (token) => {
      const v = await this.deps.storage.load<Record<string, { text: string; at: number }>>(key);
      const previous = this.wrongReflections;
      const map = { ...(v ?? {}) };
      const at = this.deps.now?.() ?? Date.now();
      if (!trimmed) {
        delete map[qid];
        delete this.wrongReflections[qid];
        this.diagnosisDoc = removeDiagnosisFromDoc(this.diagnosisDoc, qid);
      } else {
        map[qid] = { text: trimmed, at };
        this.wrongReflections[qid] = { text: trimmed, at };
        const entry = createDiagnosisEntry(qid, { thought: trimmed }, at);
        this.diagnosisDoc = appendDiagnosisToDoc(this.diagnosisDoc, entry);
      }
      try {
        await this.deps.storage.save(key, map, token);
        this.wrongReflections = map;
      } catch (e) {
        this.wrongReflections = previous;
        throw e;
      }
    });
    if (this.deps.syncQuestionStudyStateToBlock) {
      await this.deps.syncQuestionStudyStateToBlock(qid);
    }
    const blockId = this.deps.questionBlockMap?.get(qid);
    if (blockId && this.deps.isKernelOnline() && trimmed) {
      const quoted = trimmed
        .split(/\r?\n/)
        .map((line, i) => (i === 0 ? `> ✍️ 【我的复盘反思】${line}` : `> ${line}`))
        .join("\n");
      const noteMd = `{{{row\n${quoted}\n}}}\n{: custom-exam-note-id="${qid}-reflection" custom-exam-note-kind="note"}`;
      let prevNoteBlockId = this.reflectionNoteBlockIds.get(qid);
      if (!prevNoteBlockId && typeof this.deps.bridge.querySql === "function") {
        try {
          const safeQid = qid.replace(/'/g, "''");
          const rows = await this.deps.bridge.querySql<{ id: string }>(
            `SELECT id FROM blocks WHERE instr(ial, 'custom-exam-note-id="${safeQid}-reflection"') > 0 LIMIT 1`
          );
          if (Array.isArray(rows) && rows[0]?.id) {
            prevNoteBlockId = String(rows[0].id);
            this.reflectionNoteBlockIds.set(qid, prevNoteBlockId);
          }
        } catch { /* 忽略查询异常 */ }
      }
      try {
        if (prevNoteBlockId && typeof this.deps.bridge.updateBlock === "function") {
          await this.deps.bridge.updateBlock(prevNoteBlockId, noteMd);
        } else if (typeof this.deps.bridge.appendBlock === "function") {
          const added = await this.deps.bridge.appendBlock(blockId, noteMd);
          if (Array.isArray(added) && added[0]) {
            this.reflectionNoteBlockIds.set(qid, added[0]);
          } else if (typeof added === "string" && added) {
            this.reflectionNoteBlockIds.set(qid, added);
          }
        }
      } catch {
        /* 题块子笔记写回尽力而为 */
      }
    }
  }

  async loadWrongReflection(qid: string): Promise<{ text: string; at: number } | null> {
    const v = (this.wrongReflections[qid] ?? null) as { text: string; at: number } | null;
    if (v) return v;
    const latest = findLatestDiagnosis(this.diagnosisDoc, qid);
    if (latest && latest.thought) {
      return { text: latest.thought, at: latest.at };
    }
    return null;
  }

  async saveWrongReason(qid: string, reason: "careless" | "unknown" | "trap"): Promise<void> {
    await this.deps.ensureTier2Loaded();
    this.deps.assertStorageWritable();
    await this.deps.storage.queueStorageWrite(WRONG_REASON_KEY, async (token) => {
      const map = { ...((await this.deps.storage.load<Record<string, { reason: string; at: number }>>(WRONG_REASON_KEY)) ?? {}) };
      const previous = this.wrongReasons;
      map[qid] = { reason, at: this.deps.now?.() ?? Date.now() };
      try {
        await this.deps.storage.save(WRONG_REASON_KEY, map, token);
        this.wrongReasons = new Map(Object.entries(map).map(([k, v]) => [k, v.reason as "careless" | "unknown" | "trap"]));
        this.deps.onInvalidate?.();
      } catch (e) {
        this.wrongReasons = previous;
        throw e;
      }
    });
    if (this.deps.syncQuestionStudyStateToBlock) {
      await this.deps.syncQuestionStudyStateToBlock(qid);
    }
  }

  async loadWrongReason(qid: string): Promise<string | undefined> {
    const map = await this.deps.storage.load<Record<string, { reason?: string }>>(WRONG_REASON_KEY);
    return map?.[qid]?.reason;
  }

  wrongReasonMap(): Map<string, "careless" | "unknown" | "trap"> {
    return new Map(this.wrongReasons);
  }

  async cleanupBankAuxData(qids: Set<string>): Promise<void> {
    if (!qids.size) return;
    try {
      await this.deps.storage.queueStorageWrite(WRONG_REASON_KEY, async (token) => {
        const reasons = await this.deps.storage.load<Record<string, unknown>>(WRONG_REASON_KEY);
        if (reasons) {
          let changed = false;
          for (const qid of qids) {
            if (qid in reasons) { delete reasons[qid]; changed = true; }
          }
          if (changed) {
            await this.deps.storage.save(WRONG_REASON_KEY, reasons, token);
            this.wrongReasons = new Map(Object.entries(reasons as Record<string, "careless" | "unknown" | "trap">));
          }
        }
      });
      await this.deps.storage.queueStorageWrite("wrongbook/reflections", async (token) => {
        const refs = await this.deps.storage.load<Record<string, unknown>>("wrongbook/reflections");
        if (refs) {
          let changed = false;
          for (const qid of qids) {
            if (qid in refs) { delete refs[qid]; changed = true; }
          }
          if (changed) {
            await this.deps.storage.save("wrongbook/reflections", refs, token);
            this.wrongReflections = refs as Record<string, { text: string; at: number }>;
          }
        }
      });
      await this.deps.storage.queueStorageWrite("wrongbook/overlays", async (token) => {
        const overlays = await this.deps.storage.load<Record<string, unknown>>("wrongbook/overlays");
        if (overlays) {
          let changed = false;
          for (const qid of qids) {
            if (qid in overlays) { delete overlays[qid]; changed = true; }
          }
          if (changed) {
            await this.deps.storage.save("wrongbook/overlays", overlays, token);
            this.wrongOverlay = new Map(Object.entries(overlays as any));
          }
        }
      });
    } catch {
      /* 辅助数据清理尽力而为 */
    }
  }
}
