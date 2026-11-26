import type { AppHost } from "./appContext";
import type { AttemptEvent } from "../core/types";
import type { BankInfo } from "./bankService";
import { MOCK_RESULTS_KEY } from "./mockService";
import {
  BANK_REGISTRY_KEY,
  SESSION_KEY,
  WRONG_REASON_KEY,
  REVISIONS_KEY,
  ACTIONS_KEY,
  MATERIALS_KEY,
  MATERIAL_NOTES_KEY,
  MATERIAL_QREFS_KEY,
  MISDIAGNOSIS_KEY,
  SYLLABUS_KEY,
  KP_RELATIONS_KEY,
} from "../constants";
import { serializeRegistry, parseRegistry, EMPTY_REGISTRY } from "../core/materials";
import { serializeNoteStore, parseNoteStore, EMPTY_NOTE_STORE } from "../core/materialNotes";
import { serializeLinkStore, parseLinkStore, EMPTY_LINK_STORE } from "../core/materialLinks";
import { serializeMisdiagnosis, parseMisdiagnosis, EMPTY_MISDIAGNOSIS } from "../core/misdiagnosis";
import { serializeSyllabus, parseSyllabusDoc, EMPTY_SYLLABUS } from "../core/syllabus";
import { serializeRelations, parseRelations, EMPTY_RELATIONS } from "../core/kpRelations";
import { auditAttemptEvents, type DataAuditReport } from "../core/dataAudit";
import {
  SESSION_CHECKIN_KEY,
  validateSessionLedger,
  assertSafeSessionLedgerRestore,
} from "../core/sessionCheckinLedger";
import { withSessionCheckinLock } from "../libs/session-checkin-lock";
import { replay } from "../core/replayer";
import { reportDateKey, reportWindowStart } from "../core/reportWindow";
import {
  attachLifeLogAttrsToBlock,
  findXiaolvDiaryZoneChildren,
  parseDiaryZoneBlockIal,
  writeInsideXiaolvDiaryZone,
} from "./diaryZoneWriter";

export const KNOWN_STORAGE_KEYS = [
  "banks",
  "attempts/log",
  "wrongbook/overlays",
  "wrongbook/reasons",
  "actions/items",
  "mock/blueprint",
  "mock/results",
  "mock/run",
  "session/active",
  "ai/usage",
  "ai/review-queue",
  "ai/task-log",
  "ai/explain-history",
  "ai/misdiagnosis",
  "estimate/history",
  "import/mappings",
  "import/checkpoint",
  "browse/smartViews",
  "batchedit/last",
  "materials/registry",
  "materials/notes",
  "materials/qrefs",
  "syllabus/tree",
  "kp/relations",
  SESSION_CHECKIN_KEY,
];

export class DataTransferDomainService {
  private dailyReportBlockIds = new Map<string, string>();

  constructor(private app: AppHost) {}

  async storageUsage(): Promise<{ key: string; bytes: number; present: boolean; error?: string }[]> {
    const rows: { key: string; bytes: number; present: boolean; error?: string }[] = [];
    for (const key of KNOWN_STORAGE_KEYS) {
      try {
        const v = await this.app.storageGateway.load(key);
        rows.push({ key, bytes: v === undefined ? 0 : JSON.stringify(v).length, present: v !== undefined });
      } catch (error) {
        this.app.noteStorageReadError(key, error);
        rows.push({ key, bytes: 0, present: false, error: error instanceof Error ? error.message : String(error) });
      }
    }
    return rows;
  }

  auditData(knownQids: Set<string>): DataAuditReport {
    return auditAttemptEvents(this.app.attempts.all(), knownQids);
  }

  async exportAllData(): Promise<string> {
    await this.app.ensureTier2Loaded();
    const [overlays, reasons, actions] = await Promise.all([
      this.app.loadAux("wrongbook/overlays"),
      this.app.loadAux("wrongbook/reasons"),
      this.app.loadAux(ACTIONS_KEY),
    ]);
    return JSON.stringify(
      {
        schema: "lv-exam.export/1",
        exportedAt: new Date().toISOString(),
        banks: this.app.banks,
        attempts: { v: 2, events: this.app.attempts.all() },
        wrongbookOverlays: overlays ?? {},
        wrongReasons: reasons ?? {},
        actions: actions ?? [],
        materials: serializeRegistry(this.app.materialsRegistry),
        materialNotes: serializeNoteStore(this.app.materialNoteStore),
        materialLinks: serializeLinkStore(this.app.materialLinkStore),
        misdiagnoses: serializeMisdiagnosis(this.app.misdiagnosisStore),
        syllabus: serializeSyllabus(this.app.syllabus),
      },
      null,
      2,
    );
  }

  async dumpData(): Promise<Record<string, unknown>> {
    await this.app.ensureTier2Loaded();
    const sessionCheckin = await withSessionCheckinLock(async () => validateSessionLedger(await this.app.loadAux(SESSION_CHECKIN_KEY)));
    const [overlays, reasons, reflections, actions, mockResults, mockBlueprint, misdiagnoses, syllabus, kpRelations] =
      await Promise.all([
        this.app.loadAux("wrongbook/overlays"),
        this.app.loadAux(WRONG_REASON_KEY),
        this.app.loadAux("wrongbook/reflections"),
        this.app.loadAux(ACTIONS_KEY),
        this.app.listMockResults(),
        this.app.loadAux("mock/blueprint"),
        this.app.loadAux(MISDIAGNOSIS_KEY),
        this.app.loadAux(SYLLABUS_KEY),
        this.app.loadAux(KP_RELATIONS_KEY),
      ]);

    return {
      schema: "lv-exam.backup/1",
      exportedAt: new Date().toISOString(),
      banks: this.app.banks,
      attempts: { v: 2, events: this.app.attempts.all() },
      wrongbookOverlays: overlays ?? {},
      wrongReasons: reasons ?? {},
      wrongReflections: reflections ?? {},
      actions: actions ?? [],
      mockResults: mockResults ?? [],
      mockBlueprint: mockBlueprint ?? null,
      misdiagnoses: misdiagnoses ?? serializeMisdiagnosis(this.app.misdiagnosisStore),
      syllabus: syllabus ?? serializeSyllabus(this.app.syllabus),
      kpRelations: kpRelations ?? serializeRelations(this.app.kpRelations),
      materials: serializeRegistry(this.app.materialsRegistry),
      materialNotes: serializeNoteStore(this.app.materialNoteStore),
      materialLinks: serializeLinkStore(this.app.materialLinkStore),
      sessionCheckin,
    };
  }

  async restoreData(data: Record<string, unknown>): Promise<boolean> {
    if (!data || typeof data !== "object") return false;
    await this.app.ensureTier2Loaded();
    this.app.assertStorageWritable();

    try {
      const restoredCheckin = data.sessionCheckin === undefined ? undefined : validateSessionLedger(data.sessionCheckin);
      if (restoredCheckin) await withSessionCheckinLock(async () => {
        const previous = await this.app.loadAux(SESSION_CHECKIN_KEY);
        assertSafeSessionLedgerRestore(previous, restoredCheckin);
        try {
          await this.app.saveAux(SESSION_CHECKIN_KEY, restoredCheckin);
          const readback = validateSessionLedger(await this.app.loadAux(SESSION_CHECKIN_KEY));
          if (JSON.stringify(readback) !== JSON.stringify(restoredCheckin)) throw new Error("Restored session ledger readback failed");
        } catch (error) {
          await this.app.saveAux(SESSION_CHECKIN_KEY, previous ?? null);
          throw error;
        }
      });
      if (Array.isArray(data.banks)) {
        const bankMap = new Map(this.app.banks.map((b) => [b.id, b]));
        for (const b of data.banks as BankInfo[]) {
          if (b && typeof b.id === "string") {
            bankMap.set(b.id, b);
          }
        }
        this.app.banks = Array.from(bankMap.values());
        await this.app.bankService.saveBankRegistry();
      }

      let attemptEvents: AttemptEvent[] = [];
      if (data.attempts && typeof data.attempts === "object") {
        const att = data.attempts as { events?: AttemptEvent[] } | AttemptEvent[];
        if (Array.isArray(att)) {
          attemptEvents = att;
        } else if (Array.isArray(att.events)) {
          attemptEvents = att.events;
        }
      }
      if (attemptEvents.length > 0) {
        this.app.attempts.mergeEvents(attemptEvents);
        await this.app.attempts.flush();
      }

      if (data.wrongbookOverlays && typeof data.wrongbookOverlays === "object") {
        const existing = (await this.app.loadAux<Record<string, unknown>>("wrongbook/overlays")) ?? {};
        const merged = { ...existing, ...(data.wrongbookOverlays as Record<string, unknown>) };
        await this.app.saveAux("wrongbook/overlays", merged);
      }

      if (data.wrongReasons && typeof data.wrongReasons === "object") {
        const existing = (await this.app.loadAux<Record<string, unknown>>(WRONG_REASON_KEY)) ?? {};
        const merged = { ...existing, ...(data.wrongReasons as Record<string, unknown>) };
        await this.app.saveAux(WRONG_REASON_KEY, merged);
      }

      if (data.wrongReflections && typeof data.wrongReflections === "object") {
        const existing = (await this.app.loadAux<Record<string, unknown>>("wrongbook/reflections")) ?? {};
        const merged = { ...existing, ...(data.wrongReflections as Record<string, unknown>) };
        await this.app.saveAux("wrongbook/reflections", merged);
      }

      if (Array.isArray(data.actions)) {
        const existing = (await this.app.loadAux<any[]>(ACTIONS_KEY)) ?? [];
        const existingIds = new Set(existing.map((a) => a.id));
        const merged = [...existing];
        for (const a of data.actions as any[]) {
          if (a && a.id && !existingIds.has(a.id)) {
            merged.push(a);
            existingIds.add(a.id);
          }
        }
        await this.app.saveAux(ACTIONS_KEY, merged);
      }

      if (Array.isArray(data.mockResults)) {
        const existing = await this.app.listMockResults();
        const existingRunIds = new Set(existing.map((m) => m.runId).filter(Boolean));
        const merged = [...existing];
        for (const m of data.mockResults as any[]) {
          if (m && (!m.runId || !existingRunIds.has(m.runId))) {
            merged.push(m);
            if (m.runId) existingRunIds.add(m.runId);
          }
        }
        while (merged.length > 200) merged.shift();
        await this.app.saveAux(MOCK_RESULTS_KEY, merged);
      }

      if (data.mockBlueprint && typeof data.mockBlueprint === "object") {
        await this.app.saveAux("mock/blueprint", data.mockBlueprint);
      }

      if (data.misdiagnoses !== undefined) {
        if (!data.misdiagnoses || typeof data.misdiagnoses !== "object" || Array.isArray(data.misdiagnoses)) {
          throw new Error("Invalid misdiagnoses payload");
        }
        const parsed = parseMisdiagnosis(data.misdiagnoses);
        if (!parsed.versionTooNew) {
          await this.app.saveAux(MISDIAGNOSIS_KEY, parsed.store);
          this.app.misdiagnosisStore = parsed.store;
        }
      }
      if (data.syllabus !== undefined) {
        if (!data.syllabus || typeof data.syllabus !== "object" || Array.isArray(data.syllabus)) {
          throw new Error("Invalid syllabus payload");
        }
        const parsed = parseSyllabusDoc(data.syllabus);
        if (!parsed.versionTooNew) {
          await this.app.saveAux(SYLLABUS_KEY, parsed.doc);
          this.app.syllabus = parsed.doc;
        }
      }
      if (data.kpRelations !== undefined) {
        if (!data.kpRelations || typeof data.kpRelations !== "object" || Array.isArray(data.kpRelations)) {
          throw new Error("Invalid kpRelations payload");
        }
        const parsed = parseRelations(data.kpRelations);
        if (!parsed.versionTooNew) {
          await this.app.saveAux(KP_RELATIONS_KEY, parsed.doc);
          this.app.kpRelations = parsed.doc;
        }
      }
      if (data.materials !== undefined) {
        if (!data.materials || typeof data.materials !== "object" || Array.isArray(data.materials)) {
          throw new Error("Invalid materials payload");
        }
        const parsed = parseRegistry(data.materials);
        if (!parsed.versionTooNew) {
          await this.app.saveAux(MATERIALS_KEY, parsed.registry);
          this.app.materialsRegistry = parsed.registry;
        }
      }
      if (data.materialNotes !== undefined) {
        if (!data.materialNotes || typeof data.materialNotes !== "object" || Array.isArray(data.materialNotes)) {
          throw new Error("Invalid materialNotes payload");
        }
        const parsed = parseNoteStore(data.materialNotes);
        if (!parsed.versionTooNew) {
          await this.app.saveAux(MATERIAL_NOTES_KEY, parsed.store);
          this.app.materialNoteStore = parsed.store;
        }
      }
      if (data.materialLinks !== undefined) {
        if (!data.materialLinks || typeof data.materialLinks !== "object" || Array.isArray(data.materialLinks)) {
          throw new Error("Invalid materialLinks payload");
        }
        const parsed = parseLinkStore(data.materialLinks);
        if (!parsed.versionTooNew) {
          await this.app.saveAux(MATERIAL_QREFS_KEY, parsed.store);
          this.app.materialLinkStore = parsed.store;
        }
      }

      this.app.invalidate();
      return true;
    } catch (err) {
      console.error("[LvExam] restoreData 异常:", err);
      return false;
    }
  }

  async triggerWrongQuestionAutomation(q: {
    id: string;
    title?: string;
    stem?: string;
    analysis?: string;
    docId?: string;
    blockId?: string;
    rootId?: string;
  }): Promise<{ triggered: number; success: number }> {
    try {
      const { lvAutomation } = await import("../libs/lv-notice-kit");
      return await lvAutomation.trigger("siyuan-exam", "wrong-question", {
        questionId: q.id,
        title: q.title || (q.stem ? q.stem.slice(0, 50).trim() : ""),
        analysis: q.analysis || "",
        docId: q.docId || q.blockId || q.rootId || "",
      });
    } catch {
      return { triggered: 0, success: 0 };
    }
  }

  async purgeAllData(): Promise<{ key: string; ok: boolean }[]> {
    this.app.assertStorageWritable();
    const receipts: { key: string; ok: boolean }[] = [];
    const cleared = new Set<string>();
    for (const key of KNOWN_STORAGE_KEYS) {
      try {
        await this.app.storageGateway.save(key, null);
        receipts.push({ key, ok: true });
        cleared.add(key);
      } catch {
        resultsFallback(receipts, key);
      }
    }
    if (cleared.has(BANK_REGISTRY_KEY)) this.app.banks = [];
    if (cleared.has(MATERIALS_KEY)) this.app.materialsRegistry = EMPTY_REGISTRY;
    if (cleared.has(MATERIAL_NOTES_KEY)) this.app.materialNoteStore = EMPTY_NOTE_STORE;
    if (cleared.has(MATERIAL_QREFS_KEY)) this.app.materialLinkStore = EMPTY_LINK_STORE;
    if (cleared.has(MISDIAGNOSIS_KEY)) this.app.misdiagnosisStore = EMPTY_MISDIAGNOSIS;
    if (cleared.has(SYLLABUS_KEY)) this.app.syllabus = EMPTY_SYLLABUS;
    if (cleared.has(KP_RELATIONS_KEY)) this.app.kpRelations = EMPTY_RELATIONS;
    if (cleared.has("wrongbook/overlays")) this.app.wrongOverlay = new Map();
    if (cleared.has(WRONG_REASON_KEY)) this.app.wrongReasons = new Map();
    if (cleared.has("wrongbook/reflections")) this.app.wrongReflections = {};
    if (cleared.has(REVISIONS_KEY)) this.app.questionService.clearRevisionCache();
    if (cleared.has(SESSION_KEY)) this.app.activeSession = null;
    this.app.invalidate();
    return receipts;
  }

  async writeDailyReport(bankId: string, bankName: string): Promise<string> {
    const { formatSiyuanBlockRef } = await import("../core/siyuanSyncDoc");
    const now = this.app.deps.now?.() ?? Date.now();
    const cutoff = reportWindowStart(1, now);
    const bankQuestions = await this.app.listQuestions(bankId);
    const qById = new Map(bankQuestions.map((q) => [q.id, q]));
    const ids = new Set(qById.keys());
    const bankEvents = this.app.attempts.all().filter((e) => ids.has(e.qid));
    const d = replay(bankEvents.filter((e) => e.ts >= cutoff && e.ts <= now));
    let attempts = 0,
      correct = 0;
    for (const s of d.byQuestion.values()) {
      attempts += s.attempts;
      correct += s.correct;
    }
    const before = replay(bankEvents.filter((e) => e.ts < cutoff));
    const bankState = replay(bankEvents.filter((e) => e.ts <= now));
    const eliminatedItems = [...bankState.wrongbook.values()].filter(
      (w) => w.status === "eliminated" && before.wrongbook.get(w.qid)?.status !== "eliminated",
    );
    const eliminated = eliminatedItems.length;
    const todayWrongQs = [...d.wrongbook.values()]
      .filter((w) => w.wrongCount > 0)
      .map((w) => qById.get(w.qid))
      .filter((q): q is NonNullable<typeof q> => Boolean(q));
    const todayEliminatedQs = eliminatedItems
      .map((w) => qById.get(w.qid))
      .filter((q): q is NonNullable<typeof q> => Boolean(q));
    const ymd = reportDateKey(now);
    const innerLines = [
      `# 📝 小驴考试 · 今日备考战报 · ${ymd}`,
      ``,
      `- 刷题：**${attempts}** 题 · 正确率 **${attempts ? Math.round((correct / attempts) * 100) : 0}%**`,
      `- 今日新消灭错题：**${eliminated}**`,
      `- 题库：${bankName}`,
      `- 统计范围：本题库 ${ymd} 的作答记录（含重复作答）`,
    ];
    if (todayWrongQs.length > 0) {
      innerLines.push(
        `- 📌 **今日错题双链溯源（点击直达源题块）**：`,
        ...todayWrongQs.slice(0, 10).map((q) => `  - ${formatSiyuanBlockRef(q.blockId, q.stem || q.id, 38)}${q.kp ? `（\`${q.kp}\`）` : ""}`),
      );
    }
    if (todayEliminatedQs.length > 0) {
      innerLines.push(
        `- 🎯 **今日新攻克错题**：`,
        ...todayEliminatedQs.slice(0, 10).map((q) => `  - ${formatSiyuanBlockRef(q.blockId, q.stem || q.id, 38)}`),
      );
    }
    const md = `{{{row\n${innerLines.join("\n")}\n}}}\n{: custom-exam-report="1" custom-exam-report-date="${ymd}" custom-exam-bank="${bankId}"}`;
    const accuracyPct = attempts ? Math.round((correct / attempts) * 100) : 0;
    const lifeLogBase = {
      type: "备考战报",
      icon: "📝",
      body: `刷题 ${attempts} 题 · 正确率 ${accuracyPct}%（${bankName}）`,
      source: "siyuan-exam",
      module: "daily-report",
      date: ymd,
      target: bankId,
      quantity: attempts,
      extraAttrs: {
        "custom-exam-report": "1",
        "custom-exam-report-date": ymd,
        "custom-exam-bank": bankId,
      },
    };
    const writeOrUpdateReportBlock = async (docId: string, useDiaryZone: boolean) => {
      const reportKey = `${docId}\0${ymd}\0${bankId}`;
      let existingBlockId = this.dailyReportBlockIds.get(reportKey);
      if (useDiaryZone) {
        const zoneChildren = await findXiaolvDiaryZoneChildren(this.app.bridge, docId);
        if (zoneChildren !== null) {
          const zoneIds = new Set(zoneChildren.map((c) => c.id));
          if (existingBlockId && !zoneIds.has(existingBlockId)) {
            existingBlockId = undefined;
            this.dailyReportBlockIds.delete(reportKey);
          }
          if (!existingBlockId) {
            const matchedInZone = zoneChildren.find((ch) => {
              const attrs = parseDiaryZoneBlockIal(ch.ial);
              return attrs["custom-exam-report-date"] === ymd && attrs["custom-exam-bank"] === bankId;
            });
            if (matchedInZone?.id) {
              existingBlockId = matchedInZone.id;
              this.dailyReportBlockIds.set(reportKey, existingBlockId);
            } else if (zoneIds.size > 0 && typeof this.app.bridge.querySql === "function") {
              const safeDocId = docId.replace(/'/g, "''");
              const safeYmd = ymd.replace(/'/g, "''");
              const safeBankId = bankId.replace(/'/g, "''");
              const rows = await this.app.bridge.querySql(
                `SELECT id FROM blocks WHERE root_id = '${safeDocId}' AND instr(ial, 'custom-exam-report-date="${safeYmd}"') > 0 AND instr(ial, 'custom-exam-bank="${safeBankId}"') > 0 ORDER BY updated DESC, id DESC LIMIT 50`
              );
              if (Array.isArray(rows)) {
                const inZoneRow = rows.find((r) => r?.id && zoneIds.has(String(r.id)));
                if (inZoneRow?.id) {
                  existingBlockId = String(inZoneRow.id);
                  this.dailyReportBlockIds.set(reportKey, existingBlockId);
                }
              }
            }
          }
        } else {
          // 无 getChildBlocks 能力（精简单测桩）时，禁止盲信可能位于区外的 SQL 命中
          existingBlockId = undefined;
        }
      } else if (!existingBlockId && typeof this.app.bridge.querySql === "function") {
        try {
          const safeDocId = docId.replace(/'/g, "''");
          const safeYmd = ymd.replace(/'/g, "''");
          const safeBankId = bankId.replace(/'/g, "''");
          const rows = await this.app.bridge.querySql(
            `SELECT id FROM blocks WHERE root_id = '${safeDocId}' AND instr(ial, 'custom-exam-report-date="${safeYmd}"') > 0 AND instr(ial, 'custom-exam-bank="${safeBankId}"') > 0 LIMIT 1`
          );
          if (Array.isArray(rows) && rows[0]?.id) {
            existingBlockId = String(rows[0].id);
            this.dailyReportBlockIds.set(reportKey, existingBlockId);
          }
        } catch {
          /* 忽略查询异常 */
        }
      }
      if (existingBlockId && typeof this.app.bridge.updateBlock === "function") {
        let updated = false;
        try {
          await this.app.saves.run(`daily-report/${ymd}`, () => this.app.bridge.updateBlock(existingBlockId!, md));
          updated = true;
        } catch {
          this.dailyReportBlockIds.delete(reportKey);
        }
        if (updated) {
          if (useDiaryZone) {
            await attachLifeLogAttrsToBlock(this.app.bridge, existingBlockId, { ...lifeLogBase, refDocId: docId });
          }
          return;
        }
      }
      let newBlockId = "";
      if (useDiaryZone) {
        const res = await this.app.saves.run(`daily-report/${ymd}`, () =>
          writeInsideXiaolvDiaryZone({
            bridge: this.app.bridge,
            docId,
            markdown: md,
            lifeLogEntry: { ...lifeLogBase, refDocId: docId },
          }),
        );
        newBlockId = res.blockIds[0] ?? "";
      } else {
        const res = await this.app.saves.run(`daily-report/${ymd}`, () => this.app.bridge.appendBlock(docId, md));
        newBlockId = Array.isArray(res) ? res[0] : typeof res === "string" ? res : "";
      }
      if (newBlockId) {
        this.dailyReportBlockIds.set(reportKey, newBlockId);
      }
    };

    let dailyDocId: string | null = null;
    try {
      const { findTodayDailyNoteDocId } = await import("../libs/lv-notice-kit");
      dailyDocId = await findTodayDailyNoteDocId().catch(() => null);
      if (!dailyDocId) {
        const allNbs = await this.app.bridge.listNotebooks();
        const openNbs = allNbs.filter((n) => !(n as { closed?: boolean }).closed);
        const candidates = openNbs.length ? openNbs : allNbs;
        const isExcluded = (name: string) => /管家|人脉|题库|闪卡|拾遗|生态|空间|exam|contacts|home|checkin|glean/i.test(name || "");
        const dailyNb = candidates.find((n) => /^(日记|Daily|Journal|我的笔记|默认)/i.test(n.name || ""))
          ?? candidates.find((n) => /日记|daily\s*note|journal/i.test(n.name || "") && !isExcluded(n.name))
          ?? candidates.find((n) => !isExcluded(n.name))
          ?? candidates[0];
        if (dailyNb?.id) {
          dailyDocId = await this.app.bridge.createDailyNote(dailyNb.id).catch(() => null);
        }
      }
    } catch {
      /* 降级到题库专属归档 */
    }
    if (dailyDocId) {
      await writeOrUpdateReportBlock(dailyDocId, true);
      return dailyDocId;
    }

    const fallbackBankId = bankId || this.app.listBanks()[0]?.id;
    if (fallbackBankId) {
      await this.app.ensureDoc(fallbackBankId, "/每日战报");
      const fallbackPath = `/每日战报/${ymd}`;
      const docId = await this.app.ensureDoc(fallbackBankId, fallbackPath);
      if (!docId) throw new Error("日记文档未找到");
      await writeOrUpdateReportBlock(docId, false);
      return docId;
    }
    throw new Error("未找到开启「每日笔记」的笔记本：请先在思源中为某笔记本开启每日笔记");
  }

  async recordAiUsage(channelId: string, tokens: number, calls: number): Promise<void> {
    await this.app.queueStorageWrite("ai/usage", async (token) => {
      const v = await this.app.loadAux<{ totalTokens?: number; totalCalls?: number }>("ai/usage");
      const log = {
        totalTokens: (v?.totalTokens ?? 0) + tokens,
        totalCalls: (v?.totalCalls ?? 0) + calls,
        last: { channelId, tokens, calls, at: this.app.deps.now?.() ?? Date.now() },
      };
      await this.app.storageGateway.save("ai/usage", log, token);
    });
  }

  async aiUsage(): Promise<{ totalTokens: number; totalCalls: number }> {
    const v = await this.app.loadAux<{ totalTokens?: number; totalCalls?: number }>("ai/usage");
    return { totalTokens: v?.totalTokens ?? 0, totalCalls: v?.totalCalls ?? 0 };
  }

  async saveEstimate(rec: { key: string; mine: string; percent: number; score: number; total: number }): Promise<void> {
    if (![rec.percent, rec.score, rec.total].every((v) => Number.isFinite(v)) || rec.percent < 0 || rec.percent > 100 || rec.score < 0 || rec.total < 0 || rec.score > rec.total) {
      throw new Error("估分结果必须是有效数字，得分不能超过总分");
    }
    this.app.assertStorageWritable();
    await this.app.queueStorageWrite("estimate/history", async (token) => {
      const list = await this.app.loadAux<(typeof rec)[]>("estimate/history");
      const next = [...(list ?? []), { ...rec, at: this.app.deps.now?.() ?? Date.now() }].slice(-20);
      await this.app.storageGateway.save("estimate/history", next, token);
    });
  }

  async listEstimates(): Promise<(Record<string, unknown> & { percent: number })[]> {
    const list = await this.app.loadAux<(Record<string, unknown> & { percent: number })[]>("estimate/history");
    return Array.isArray(list) ? list : [];
  }

  async cleanupBankAuxData(qids: Set<string>): Promise<void> {
    if (!qids.size) return;
    try {
      await this.app.wrongbook.cleanupBankAuxData(qids);
      await this.app.queueStorageWrite(MATERIAL_QREFS_KEY, async (token) => {
        const raw = await this.app.loadAux<unknown>(MATERIAL_QREFS_KEY);
        if (raw && typeof raw === "object") {
          let changed = false;
          const copy = { ...(raw as Record<string, unknown>) };
          for (const qid of qids) { if (qid in copy) { delete copy[qid]; changed = true; } }
          if (changed) { await this.app.storageGateway.save(MATERIAL_QREFS_KEY, copy, token); this.app.materialLinkStore = parseLinkStore(copy).store; }
        }
      });
      this.app.attempts.pruneQuestions(qids);
      await this.app.attempts.flush().catch(() => undefined);
    } catch { /* GC尽力而为 */ }
  }
}

function resultsFallback(receipts: { key: string; ok: boolean }[], key: string): void {
  receipts.push({ key, ok: false });
}
