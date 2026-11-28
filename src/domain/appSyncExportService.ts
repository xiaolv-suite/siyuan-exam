import type { AppHost } from "./appContext";
import type { Question } from "../core/types";
import { replay } from "../core/replayer";
import { localDateKeyOf } from "../core/checkinBridge";
import { withDocLock, pushDiagError, lvNotify } from "../libs/lv-notice-kit";
import { writeInsideXiaolvDiaryZone } from "./diaryZoneWriter";

export class AppSyncExportService {
  constructor(private app: AppHost) {}

  async buildCompactQuestionSheet(
    title: string,
    bankId?: string,
    options?: import("../core/printPro").PrintProOptions,
  ): Promise<string> {
    const targetBank = bankId ?? this.app.listBanks()[0]?.id;
    const questions = targetBank ? await this.app.listQuestions(targetBank) : [];
    const { buildCompactQuestionSheetPro } = await import("../core/printPro");
    return buildCompactQuestionSheetPro(title, questions, options);
  }

  async buildCompactAnswerSheet(
    title: string,
    bankId?: string,
    options?: import("../core/printPro").PrintProOptions,
  ): Promise<string> {
    const targetBank = bankId ?? this.app.listBanks()[0]?.id;
    const questions = targetBank ? await this.app.listQuestions(targetBank) : [];
    const { buildCompactAnswerSheetPro } = await import("../core/printPro");
    return buildCompactAnswerSheetPro(title, questions, options);
  }

  async buildStandardAnswerCard(
    title: string,
    bankId?: string,
    options?: import("../core/printPro").PrintProOptions,
  ): Promise<string> {
    const targetBank = bankId ?? this.app.listBanks()[0]?.id;
    const questions = targetBank ? await this.app.listQuestions(targetBank) : [];
    const { buildStandardAnswerCardPro } = await import("../core/printPro");
    return buildStandardAnswerCardPro(title, questions, {
      paperSize: "A4",
      columns: "single",
      ...options,
    });
  }

  async buildTeacherLectureSheet(
    title: string,
    bankId?: string,
    options?: import("../core/printPro").PrintProOptions,
  ): Promise<string> {
    const targetBank = bankId ?? this.app.listBanks()[0]?.id;
    const questions = targetBank ? await this.app.listQuestions(targetBank) : [];
    const { buildTeacherLectureSheetPro } = await import("../core/printPro");
    return buildTeacherLectureSheetPro(title, questions, options);
  }

  async buildStudentHomeworkSheet(
    title: string,
    bankId?: string,
    options?: import("../core/printPro").PrintProOptions,
  ): Promise<string> {
    const targetBank = bankId ?? this.app.listBanks()[0]?.id;
    const questions = targetBank ? await this.app.listQuestions(targetBank) : [];
    const { buildStudentHomeworkSheetPro } = await import("../core/printPro");
    return buildStudentHomeworkSheetPro(title, questions, options);
  }

  async generateReadinessReport(
    bankId?: string,
    options?: import("../core/readinessRadar").ReadinessRadarOptions,
  ): Promise<import("../core/readinessRadar").ReadinessHealthReport> {
    const targetBank = bankId ?? this.app.listBanks()[0]?.id;
    const questions = targetBank ? await this.app.listQuestions(targetBank) : [];
    const events = this.app.attempts.all();
    const replayRes = replay(events);
    const { masteryByKp } = await import("../core/report");
    const masteryList = masteryByKp(questions, replayRes.byQuestion, events, this.app.deps.now?.() ?? Date.now());
    const { generateReadinessReport } = await import("../core/readinessRadar");
    return generateReadinessReport(questions, masteryList, events, {
      now: this.app.deps.now?.() ?? Date.now(),
      ...options,
    });
  }

  async exportReadinessReportMarkdown(
    bankId?: string,
    options?: import("../core/readinessRadar").ReadinessRadarOptions,
  ): Promise<string> {
    const report = await this.generateReadinessReport(bankId, options);
    const { exportReadinessReportMarkdown } = await import("../core/readinessRadar");
    return exportReadinessReportMarkdown(report);
  }

  async assembleAdaptiveSprintPaper(
    bankId?: string,
    options?: import("../core/adaptiveMockAssembler").AdaptiveSprintPaperOptions,
  ): Promise<import("../core/adaptiveMockAssembler").AdaptiveSprintPaper> {
    const targetBank = bankId ?? this.app.listBanks()[0]?.id;
    const questions = targetBank ? await this.app.listQuestions(targetBank) : [];
    const events = this.app.attempts.all();
    const wrongItems = this.app.wrongItems();
    const radarReport = await this.generateReadinessReport(targetBank);
    const { assembleAdaptiveSprintPaper } = await import("../core/adaptiveMockAssembler");
    return assembleAdaptiveSprintPaper(
      questions,
      radarReport.blindspots,
      wrongItems,
      events,
      options,
    );
  }

  async parseOcrTextToQuestion(
    rawText: string,
    options?: import("../core/ocr").OcrParseOptions,
  ): Promise<Question> {
    const { parseOcrQuestionText, ocrResultToQuestion } = await import("../core/ocr");
    const parsed = parseOcrQuestionText(rawText, options);
    return ocrResultToQuestion(parsed, { source: options?.fallbackSource });
  }

  async ocrAndParseQuestion(
    assetPath: string,
    options?: import("../core/ocr").OcrParseOptions & { signal?: AbortSignal; timeoutMs?: number },
  ): Promise<Question> {
    if (!this.app.kernelOnline) {
      throw new Error("思源内核离线，无法执行 OCR 识别。");
    }
    if (options?.signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }
    let text = "";
    if (typeof this.app.bridge.getImageOcrText === "function") {
      try {
        text = (await this.app.bridge.getImageOcrText(assetPath)) || "";
      } catch {
        text = "";
      }
    }
    if (!text.trim()) {
      try {
        const ocrData = await this.app.bridge.assetOcr(assetPath, {
          signal: options?.signal,
          timeoutMs: options?.timeoutMs,
        });
        text = ocrData?.text || "";
      } catch (err) {
        if (options?.signal?.aborted || (err instanceof Error && err.name === "AbortError")) {
          throw err;
        }
        const rawMsg = String(err instanceof Error ? err.message : err);
        if (/ocr provider is unavailable|tesseract|fatal/i.test(rawMsg)) {
          throw new Error("思源内置 OCR 引擎不可用，请在「思源设置 → OCR」开启内置识图，或直接粘贴配图后使用文本/AI 识别。");
        }
        throw err;
      }
    }
    if (options?.signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }
    return this.parseOcrTextToQuestion(text, {
      fallbackSource: assetPath,
      ...options,
    });
  }

  async uploadAndOcrQuestion(
    file: Blob,
    filename = "question.png",
    options?: import("../core/ocr").OcrParseOptions & { signal?: AbortSignal; timeoutMs?: number },
  ): Promise<Question> {
    if (!this.app.kernelOnline) {
      throw new Error("思源内核离线，无法上传图片或执行 OCR 识别。");
    }
    if (options?.signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }
    const assetPath = await this.app.bridge.uploadAsset(file, filename, {
      signal: options?.signal,
      timeoutMs: options?.timeoutMs,
    });
    if (options?.signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }
    return this.ocrAndParseQuestion(assetPath, options);
  }

  async planClearanceStudy(bankId?: string): Promise<import("../core/knowledgeGraphPath").ClearancePlan> {
    const targetBank = bankId ?? this.app.listBanks()[0]?.id;
    const questions = targetBank ? await this.app.listQuestions(targetBank) : [];
    const events = this.app.attempts.all();
    const { buildKnowledgeGraph, planClearancePath } = await import("../core/knowledgeGraphPath");
    const genericQs = questions.map((q) => ({ id: q.id, kp: q.kp, stem: q.stem, difficulty: q.difficulty }));
    const graph = buildKnowledgeGraph({
      questions: genericQs,
      relations: [],
      attempts: events.map((e) => ({ qid: e.qid, verdict: e.verdict === "correct" ? "right" : "wrong" })),
    });
    return planClearancePath(graph, { questions: genericQs });
  }

  async exportClearanceStudyGuideMarkdown(bankId?: string): Promise<string> {
    const targetBank = bankId ?? this.app.listBanks()[0]?.id;
    const questions = targetBank ? await this.app.listQuestions(targetBank) : [];
    const events = this.app.attempts.all();
    const { buildKnowledgeGraph, planClearancePath, exportClearanceGuideMarkdown } = await import("../core/knowledgeGraphPath");
    const genericQs = questions.map((q) => ({ id: q.id, kp: q.kp, stem: q.stem, difficulty: q.difficulty }));
    const graph = buildKnowledgeGraph({
      questions: genericQs,
      relations: [],
      attempts: events.map((e) => ({ qid: e.qid, verdict: e.verdict === "correct" ? "right" : "wrong" })),
    });
    const plan = planClearancePath(graph, { questions: genericQs });
    return exportClearanceGuideMarkdown(plan);
  }

  async pickVariantQuestions(
    seed: Question,
    n = 5,
  ): Promise<{ questions: Question[]; count: number; reason: string }> {
    const targetBank = seed.rootId ? this.app.listBanks().find((b) => b.id === seed.rootId)?.id : this.app.listBanks()[0]?.id;
    const all = targetBank ? await this.app.listQuestions(targetBank) : [];
    const { extractVariantQuestions } = await import("../core/cramScheduler");
    return extractVariantQuestions(all, seed, n);
  }

  async exportCramCheatSheetMarkdown(
    bankId?: string,
    options?: { maxItems?: number },
  ): Promise<string> {
    const targetBank = bankId ?? this.app.listBanks()[0]?.id;
    const questions = targetBank ? await this.app.listQuestions(targetBank) : [];
    const wrongItems = this.app.wrongItems();
    const { generateCramCheatSheetMarkdown } = await import("../core/cramScheduler");
    return generateCramCheatSheetMarkdown(questions, wrongItems, options);
  }

  async exportItemQualityAuditMarkdown(bankId?: string): Promise<string> {
    const targetBank = bankId ?? this.app.listBanks()[0]?.id;
    const questions = targetBank ? await this.app.listQuestions(targetBank) : [];
    const attempts = this.app.attempts.all();
    const { generateItemQualityAuditReport, exportItemQualityAuditMarkdown } = await import("../core/itemAnalysis");
    const report = generateItemQualityAuditReport(questions, attempts);
    return exportItemQualityAuditMarkdown(report);
  }

  async generateABExamPapers(
    bankId?: string,
    options?: { rnd?: () => number },
  ): Promise<import("../core/paperSnapshot").ABExamPaperResult> {
    const targetBank = bankId ?? this.app.listBanks()[0]?.id;
    const questions = targetBank ? await this.app.listQuestions(targetBank) : [];
    const { generateABExamPapers } = await import("../core/paperSnapshot");
    return generateABExamPapers(questions, options);
  }

  async getMilestoneOverview(bankId?: string): Promise<import("../core/milestones").MilestoneOverview> {
    const targetBank = bankId ?? this.app.listBanks()[0]?.id;
    const questions = targetBank ? await this.app.listQuestions(targetBank) : [];
    const events = this.app.attempts.all();
    const wrongItems = this.app.wrongItems();
    const d = this.app.derived();
    const { streak } = await import("../core/replayer");
    const streakDays = streak(d);
    const mockRuns = await this.app.listMockResults();
    const { calculateMilestones } = await import("../core/milestones");
    const eliminatedCount = Array.from(d.wrongbook.values()).filter((w) => w.status === "eliminated").length;

    return calculateMilestones({
      events,
      questions,
      wrongItems,
      eliminatedCount,
      streakDays,
      mockRunCount: mockRuns.length,
    });
  }

  async exportMilestoneBadgeWallMarkdown(bankId?: string): Promise<string> {
    const overview = await this.getMilestoneOverview(bankId);
    const { exportMilestoneBadgeWallMarkdown } = await import("../core/milestones");
    return exportMilestoneBadgeWallMarkdown(overview);
  }

  async exportQuestionsToGift(bankId?: string): Promise<string> {
    const targetBank = bankId ?? this.app.listBanks()[0]?.id;
    const questions = targetBank ? await this.app.listQuestions(targetBank) : [];
    const { exportQuestionsToGift } = await import("../core/formatExporter");
    return exportQuestionsToGift(questions);
  }

  async exportQuestionsToAnkiTsv(bankId?: string): Promise<string> {
    const targetBank = bankId ?? this.app.listBanks()[0]?.id;
    const questions = targetBank ? await this.app.listQuestions(targetBank) : [];
    const { exportQuestionsToAnkiTsv } = await import("../core/formatExporter");
    return exportQuestionsToAnkiTsv(questions);
  }

  async exportQuestionsToExamDocMarkdown(bankId?: string, title?: string): Promise<string> {
    const targetBank = bankId ?? this.app.listBanks()[0]?.id;
    const questions = targetBank ? await this.app.listQuestions(targetBank) : [];
    const bankName = this.app.listBanks().find((b) => b.id === targetBank)?.name || "试题库";
    const { exportQuestionsToExamDocMarkdown } = await import("../core/formatExporter");
    return exportQuestionsToExamDocMarkdown(questions, { title: title || `${bankName} · 精选试题手册` });
  }

  async auditSyllabusCoverage(bankId?: string): Promise<import("../core/syllabus").SyllabusAuditReport> {
    const targetBank = bankId ?? this.app.listBanks()[0]?.id;
    const questions = targetBank ? await this.app.listQuestions(targetBank) : [];
    const syllabusDoc = this.app.syllabusDoc();
    const { auditSyllabusCoverage } = await import("../core/syllabus");
    return auditSyllabusCoverage(syllabusDoc.roots, questions);
  }

  async exportSyllabusAuditMarkdown(bankId?: string): Promise<string> {
    const report = await this.auditSyllabusCoverage(bankId);
    const { exportSyllabusAuditMarkdown } = await import("../core/syllabus");
    return exportSyllabusAuditMarkdown(report);
  }

  async listExamBlueprintPresets(): Promise<import("../core/examPresets").ExamBlueprintPreset[]> {
    const { listExamBlueprintPresets } = await import("../core/examPresets");
    return listExamBlueprintPresets();
  }

  async applyBlueprintPreset(
    presetId: string,
    bankId?: string,
  ): Promise<import("../core/mock").Blueprint> {
    const targetBank = bankId ?? this.app.listBanks()[0]?.id;
    const questions = targetBank ? await this.app.listQuestions(targetBank) : [];
    const { adaptPresetToBlueprint } = await import("../core/examPresets");
    return adaptPresetToBlueprint(presetId, questions);
  }

  async assembleWrongbookExam(
    bankId?: string,
    options?: { name?: string; durationMinutes?: number },
  ): Promise<{ blueprint: import("../core/mock").Blueprint; targetQuestions: Question[]; totalCount: number }> {
    const targetBank = bankId ?? this.app.listBanks()[0]?.id;
    const questions = targetBank ? await this.app.listQuestions(targetBank) : [];
    const wrongItems = this.app.wrongItems();
    const { convertWrongbookToMockBlueprint } = await import("../core/examPresets");
    return convertWrongbookToMockBlueprint(wrongItems, questions, options);
  }

  async exportPaperAuditMarkdown(bankId?: string): Promise<string> {
    const targetBank = bankId ?? this.app.listBanks()[0]?.id;
    const questions = targetBank ? await this.app.listQuestions(targetBank) : [];
    const attempts = this.app.attempts.all();
    const syllabusDoc = this.app.syllabusDoc();
    const { predictPaperDifficulty, auditPaperSyllabusBalance, exportPaperAuditMarkdown } = await import("../core/paperAudit");
    const pred = predictPaperDifficulty(questions, attempts);
    const balance = auditPaperSyllabusBalance(questions, syllabusDoc.roots);
    const bankName = this.app.listBanks().find((b) => b.id === targetBank)?.name || "试卷";
    return exportPaperAuditMarkdown(pred, balance, `${bankName} · 预估难度与考纲契合度体检`);
  }

  async findFoundationMotherQuestion(target: Question): Promise<{ motherQuestion: Question | null; reason: string }> {
    const targetBank = target.rootId ? this.app.listBanks().find((b) => b.id === target.rootId)?.id : this.app.listBanks()[0]?.id;
    const all = targetBank ? await this.app.listQuestions(targetBank) : [];
    const attempts = this.app.attempts.all();
    const { findFoundationMotherQuestion } = await import("../core/cramScheduler");
    return findFoundationMotherQuestion(all, target, attempts);
  }

  async searchSiyuanDocs(query = ""): Promise<Array<{ id: string; title: string; hpath: string; box: string }>> {
    if (!this.app.kernelOnline) return [];
    const clean = query.trim().replace(/'/g, "''");
    const terms = clean.split(/\s+/).filter(Boolean);
    const filterSql = terms.length > 0
      ? terms.map((t) => `(content LIKE '%${t}%' OR hpath LIKE '%${t}%')`).join(" AND ")
      : "";
    const excludeDerived = `hpath NOT LIKE '/小驴考试/%' AND hpath NOT LIKE '/导出/%' AND hpath NOT LIKE '/每日战报/%'`;
    const whereClause = filterSql
      ? `WHERE type='d' AND ${excludeDerived} AND (${filterSql})`
      : `WHERE type='d' AND ${excludeDerived}`;
    const sql = `SELECT id, content, hpath, box FROM blocks ${whereClause} ORDER BY updated DESC LIMIT 100`;
    try {
      const rows = await this.app.bridge.sql<Record<string, string>>(sql);
      return rows.map((r) => ({
        id: String(r.id ?? ""),
        title: String(r.content ?? "").trim() || "未命名文档",
        hpath: String(r.hpath ?? ""),
        box: String(r.box ?? ""),
      }));
    } catch {
      return [];
    }
  }

  async importFromSiyuanDoc(docId: string, options?: import("../core/siyuanDocImporter").SiyuanImportOptions): Promise<import("../importer/pipeline").ImportReport> {
    const docRes = await this.app.bridge.exportDocMarkdown(docId);
    let rawMd = docRes.content || "";
    try {
      if (typeof this.app.bridge.getBlockKramdown === "function") {
        const kramdown = await this.app.bridge.getBlockKramdown(docId);
        if (kramdown && (/\{\{\{row/.test(kramdown) || /(?:custom-)?exam-type\s*=/.test(kramdown))) {
          rawMd = kramdown;
        }
      }
    } catch { /* 容错回退 exportDocMarkdown */ }
    let title = docRes.title || "思源文档";
    let hpath = "";
    try {
      const rows = await this.app.bridge.sql<Record<string, string>>(
        `SELECT content, hpath FROM blocks WHERE id='${docId.replace(/'/g, "''")}' LIMIT 1`,
      );
      if (rows[0]) {
        title = String(rows[0].content ?? "").trim() || title;
        hpath = String(rows[0].hpath ?? "");
      }
    } catch { /* 容错 */ }

    const { parseQuestionsFromSiyuanDoc } = await import("../core/siyuanDocImporter");
    return parseQuestionsFromSiyuanDoc(rawMd, { docId, title, hpath }, options);
  }

  async importFromSiyuanDocBatch(docIds: string[], options?: import("../core/siyuanDocImporter").SiyuanImportOptions): Promise<import("../importer/pipeline").ImportReport> {
    const { newBatchId } = await import("../core/ids");
    if (!docIds.length) return { batch: newBatchId(), ok: [], errors: [], duplicates: 0 };
    const batchItems: import("../core/siyuanDocImporter").SiyuanDocBatchItem[] = [];
    for (const id of docIds) {
      try {
        const docRes = await this.app.bridge.exportDocMarkdown(id);
        let markdown = docRes.content || "";
        try {
          if (typeof this.app.bridge.getBlockKramdown === "function") {
            const kramdown = await this.app.bridge.getBlockKramdown(id);
            if (kramdown && (/\{\{\{row/.test(kramdown) || /(?:custom-)?exam-type\s*=/.test(kramdown))) {
              markdown = kramdown;
            }
          }
        } catch { /* 容错回退 exportDocMarkdown */ }
        const rows = await this.app.bridge.sql<Record<string, string>>(
          `SELECT content, hpath FROM blocks WHERE id='${id.replace(/'/g, "''")}' LIMIT 1`,
        );
        batchItems.push({
          docId: id,
          title: rows[0]?.content?.trim() || docRes.title || "思源文档",
          hpath: rows[0]?.hpath || "",
          markdown,
        });
      } catch { /* 容错跳过不可读文档 */ }
    }
    const { parseQuestionsFromSiyuanDocBatch } = await import("../core/siyuanDocImporter");
    return parseQuestionsFromSiyuanDocBatch(batchItems, options);
  }

  async searchBlocksByTag(tag: string): Promise<Array<{ id: string; content: string; rootId: string; hpath: string }>> {
    if (!this.app.kernelOnline) return [];
    const cleanTag = tag.trim().replace(/^#|#$/g, "").replace(/'/g, "''");
    if (!cleanTag) return [];
    const sql = `SELECT id, content, root_id, hpath FROM blocks
      WHERE (ial LIKE '%#${cleanTag}#%' OR ial LIKE '%#${cleanTag} %' OR content LIKE '%#${cleanTag}#%' OR content LIKE '%#${cleanTag} %')
      ORDER BY updated DESC LIMIT 100`;
    try {
      const rows = await this.app.bridge.sql<Record<string, string>>(sql);
      return rows.map((r) => ({
        id: String(r.id ?? ""),
        content: String(r.content ?? ""),
        rootId: String(r.root_id ?? r.rootId ?? ""),
        hpath: String(r.hpath ?? ""),
      }));
    } catch {
      return [];
    }
  }

  async searchRiffCardBlocks(): Promise<Array<{ id: string; content: string; rootId: string; hpath: string }>> {
    if (!this.app.kernelOnline) return [];
    const sql = `SELECT b.id, b.content, b.root_id, b.hpath FROM blocks b
      JOIN attributes a ON a.block_id = b.id
      WHERE a.name = 'custom-riff-decks' AND a.value != ''
      ORDER BY b.updated DESC LIMIT 100`;
    try {
      const rows = await this.app.bridge.sql<Record<string, string>>(sql);
      return rows.map((r) => ({
        id: String(r.id ?? ""),
        content: String(r.content ?? ""),
        rootId: String(r.root_id ?? r.rootId ?? ""),
        hpath: String(r.hpath ?? ""),
      }));
    } catch {
      return [];
    }
  }

  async importFromTaggedBlocks(tag: string): Promise<import("../importer/pipeline").ImportReport> {
    const isRiff = tag === "riff" || tag === "闪卡" || tag === "思源闪卡";
    const blocks = isRiff ? await this.searchRiffCardBlocks() : await this.searchBlocksByTag(tag);
    const { buildReportFromTaggedBlocks } = await import("../core/siyuanDocImporter");
    return buildReportFromTaggedBlocks(blocks, tag);
  }

  async appendQuestionToSiyuanDoc(docId: string, q: Question): Promise<string[]> {
    if (!this.app.kernelOnline) throw new Error("思源内核离线，无法写入文档。");
    const { formatQuestionForNoteEmbed } = await import("../core/siyuanSyncDoc");
    const md = formatQuestionForNoteEmbed(q);
    return this.app.bridge.appendBlock(docId, md);
  }

  async syncBankToSiyuanDoc(bankId?: string): Promise<{ docId: string; title: string; hpath: string }> {
    const targetBank = bankId ?? this.app.listBanks()[0]?.id;
    if (!targetBank) throw new Error("请先选择或创建一个题库");
    const questions = await this.app.listQuestions(targetBank);
    const bankName = this.app.listBanks().find((b) => b.id === targetBank)?.name || "题库";
    const title = `${bankName} · 完整题册（共${questions.length}题）`;

    const { buildSiyuanExamDocMarkdown } = await import("../core/siyuanSyncDoc");
    const markdown = buildSiyuanExamDocMarkdown(title, questions, { isMockPaper: false });
    await this.app.ensureDoc(targetBank, "/小驴考试");
    const hpath = `/小驴考试/${title}`;
    const docId = await this.app.upsertDocWithMd(targetBank, hpath, markdown);
    return { docId, title, hpath };
  }

  async saveQuestionsToSiyuanDoc(
    title: string,
    questions: Question[],
    options: { bankId?: string; isMock?: boolean; durationMinutes?: number; passLine?: number } = {},
  ): Promise<{ docId: string; title: string; hpath: string }> {
    const targetBank = options.bankId ?? this.app.listBanks()[0]?.id;
    if (!targetBank) throw new Error("请先选择或创建一个题库");

    const { buildSiyuanExamDocMarkdown } = await import("../core/siyuanSyncDoc");
    const markdown = buildSiyuanExamDocMarkdown(title, questions, {
      isMockPaper: options.isMock,
      durationMinutes: options.durationMinutes,
      passLine: options.passLine,
    });
    await this.app.ensureDoc(targetBank, "/小驴考试");
    await this.app.ensureDoc(targetBank, "/小驴考试/试卷与复习");
    const hpath = `/小驴考试/试卷与复习/${title}`;
    const docId = await withDocLock(`${targetBank}:doc:${title}`, async () => {
      return await this.app.upsertDocWithMd(targetBank, hpath, markdown);
    });
    return { docId, title, hpath };
  }

  async syncBankOverviewDoc(bankId?: string): Promise<{ docId: string; title: string; hpath: string }> {
    const targetBank = bankId ?? this.app.listBanks()[0]?.id;
    if (!targetBank) throw new Error("请先选择或创建一个题库");
    const questions = await this.app.listQuestions(targetBank);
    const bankName = this.app.listBanks().find((b) => b.id === targetBank)?.name || "题库";
    const qIds = new Set(questions.map((q) => q.id));
    const bankEvents = this.app.attempts.all().filter((e) => qIds.has(e.qid) && e.verdict !== "not_attempted");
    const totalAttempts = bankEvents.length;
    const correctAttempts = bankEvents.filter((e) => e.verdict === "correct").length;
    const d = this.app.derived();
    const activeWrongCount = this.app.wrongItems().filter((w) => qIds.has(w.qid)).length;
    const eliminatedWrongCount = [...d.wrongbook.values()].filter((w) => qIds.has(w.qid) && w.status === "eliminated").length;
    const mocks = await this.app.listMockResults().catch(() => []);

    const { buildSiyuanBankOverviewDocMarkdown } = await import("../core/siyuanSyncDoc");
    const markdown = buildSiyuanBankOverviewDocMarkdown({
      bankName,
      bankId: targetBank,
      questions,
      totalAttempts,
      correctAttempts,
      activeWrongCount,
      eliminatedWrongCount,
      mockCount: mocks.length,
    });
    await this.app.ensureDoc(targetBank, "/小驴考试");
    const title = "00 题库总览与考纲导航";
    const hpath = `/小驴考试/${title}`;
    const docId = await this.app.upsertDocWithMd(targetBank, hpath, markdown);
    return { docId, title, hpath };
  }

  async syncActionJournalDoc(bankId?: string): Promise<{ docId: string; title: string; hpath: string }> {
    const targetBank = bankId ?? this.app.listBanks()[0]?.id;
    if (!targetBank) throw new Error("请先选择或创建一个题库");
    const questions = await this.app.listQuestions(targetBank);
    const bankName = this.app.listBanks().find((b) => b.id === targetBank)?.name || "题库";
    const questionMap = new Map(questions.map((q) => [q.id, q]));
    const actions = await this.app.loadActions().catch(() => []);
    const reflectionsList = Object.entries(this.app.wrongReflections)
      .filter(([, v]) => Boolean(v?.text?.trim()))
      .map(([qid, v]) => ({
        qid,
        text: v.text,
        at: v.at,
        reason: this.app.wrongReasons.get(qid),
      }))
      .sort((a, b) => b.at - a.at);

    const { buildSiyuanActionJournalDocMarkdown } = await import("../core/siyuanSyncDoc");
    const markdown = buildSiyuanActionJournalDocMarkdown({
      bankName,
      actions,
      reflections: reflectionsList,
      questionMap,
    });
    await this.app.ensureDoc(targetBank, "/小驴考试");
    const title = "03 备考行动与复盘日志";
    const hpath = `/小驴考试/${title}`;
    const docId = await this.app.upsertDocWithMd(targetBank, hpath, markdown);
    return { docId, title, hpath };
  }

  async syncActionsFromDoc(bankId?: string): Promise<{ syncedCount: number }> {
    if (!this.app.kernelOnline || typeof this.app.bridge.sql !== "function") {
      return { syncedCount: 0 };
    }
    const targetBank = bankId || this.app.listBanks()[0]?.id;
    if (!targetBank) return { syncedCount: 0 };

    const { notebookId, hpath } = this.app.qualifyBankHPath(targetBank, "/小驴考试/03 备考行动与复盘日志");
    let docId = this.app.ensuredDocIds.get(`${notebookId}\0${hpath}`) || this.app.ensuredDocIds.get(`${targetBank}:/小驴考试/03 备考行动与复盘日志`);
    if (!docId) {
      try {
        const rows = await this.app.bridge.sql<{ id: string }>(
          `SELECT id FROM blocks WHERE box='${notebookId.replace(/'/g, "''")}' AND hpath='${hpath.replace(/'/g, "''")}' AND type='d' LIMIT 1`,
        );
        if (Array.isArray(rows) && rows[0]?.id) {
          docId = rows[0].id;
          this.app.ensuredDocIds.set(`${notebookId}\0${hpath}`, docId);
        }
      } catch {
        return { syncedCount: 0 };
      }
    }
    if (!docId) return { syncedCount: 0 };

    let taskBlocks: Array<{ id: string; root_id: string; markdown?: string; content?: string; ial?: string; subtype?: string }>;
    try {
      taskBlocks = await this.app.bridge.sql(
        `SELECT id, root_id, markdown, content, ial, subtype FROM blocks WHERE root_id='${docId.replace(/'/g, "''")}' AND ial LIKE '%custom-exam-act-id=%'`,
      );
    } catch {
      return { syncedCount: 0 };
    }
    if (!Array.isArray(taskBlocks) || !taskBlocks.length) return { syncedCount: 0 };

    const actions = await this.app.loadActions().catch(() => []);
    if (!actions.length) return { syncedCount: 0 };
    const actionMap = new Map<string, import("../core/actions").ActionItem>();
    actions.forEach((a) => actionMap.set(a.id, a));
    let syncedCount = 0;

    for (const blk of taskBlocks) {
      const ial = typeof blk.ial === "string" ? blk.ial : (blk.ial && typeof blk.ial === "object" ? JSON.stringify(blk.ial) : String(blk.ial ?? ""));
      const match = ial.match(/custom-exam-act-id="([^"]+)"/);
      const objActId = blk.ial && typeof blk.ial === "object" ? String((blk.ial as any)["custom-exam-act-id"] ?? "") : "";
      const actId = match?.[1] || objActId;
      if (!actId) continue;
      const act = actionMap.get(actId);
      if (!act) continue;

      const md = String(blk.markdown ?? "");
      const isChecked = /-\s*\[[xX]\]/.test(md) || (blk.subtype === "t" && /\[x\]/i.test(String(blk.content ?? "")));
      if (isChecked && act.status === "open") {
        await this.app.completeAction(actId, "siyuan-doc-task-checked");
        act.status = "done";
        syncedCount++;
      }
    }
    return { syncedCount };
  }

  async exportWrongbook(
    bankId: string,
    bankName: string,
    opts: { kpRoot?: string; reason?: string; sinceDays?: number } = {},
  ): Promise<string> {
    const { wrongbookToMarkdown } = await import("../core/exportMd");
    const questions = await this.app.listQuestions(bankId);
    const byId = new Map(questions.map((q) => [q.id, q]));
    let items = this.app.wrongItems();
    if (opts.kpRoot) {
      items = items.filter((w) => {
        const q = byId.get(w.qid);
        return q?.kp && (q.kp === opts.kpRoot || q.kp.startsWith(opts.kpRoot + "/"));
      });
    }
    if (opts.reason) {
      items = items.filter((w) => this.app.wrongReasons.get(w.qid) === opts.reason);
    }
    if (opts.sinceDays != null && opts.sinceDays > 0) {
      const cutoff = Date.now() - opts.sinceDays * 86400000;
      items = items.filter((w) => {
        const firstWrong = this.app.attempts.all().find((e) => e.qid === w.qid && e.verdict === "wrong");
        if (firstWrong && firstWrong.ts < cutoff) return false;
        return true;
      });
    }
    const pairs = await Promise.all(
      items.map(async (w) => {
        const q = byId.get(w.qid);
        if (!q) return null;
        let reflectionText: string | undefined;
        try {
          const r = await this.app.loadWrongReflection(w.qid);
          reflectionText = r?.text;
        } catch { /* 忽略单个读取错误 */ }
        return { wrong: w, q, reflection: reflectionText };
      }),
    );
    const validPairs = pairs.filter((p): p is NonNullable<typeof p> => p !== null);
    const md = wrongbookToMarkdown(validPairs, { bankName, exportedAt: new Date() });
    await this.app.ensureDoc(bankId, "/导出");
    const tag = [opts.kpRoot, opts.reason, opts.sinceDays ? `${opts.sinceDays}d` : ""].filter(Boolean).join("-");
    const ymd = localDateKeyOf(Date.now());
    const name = tag ? `/导出/错题本 ${ymd} ${tag}` : `/导出/错题本 ${ymd}`;
    return await this.app.upsertDocWithMd(bankId, name, md);
  }

  async syncBankToLocalDocs(
    bankId: string,
    bankName: string,
  ): Promise<{
    overviewDocId?: string;
    bankDocId?: string;
    wrongbookDocId?: string;
    actionJournalDocId?: string;
    flashcardCount?: number;
  }> {
    if (!this.app.kernelOnline) throw new Error("思源内核离线，无法写入笔记文档");
    let overviewDocId: string | undefined;
    let bankDocId: string | undefined;
    let wrongbookDocId: string | undefined;
    let actionJournalDocId: string | undefined;
    let flashcardCount: number | undefined;
    let lastError: unknown;

    try {
      const overviewDoc = await this.syncBankOverviewDoc(bankId);
      overviewDocId = overviewDoc.docId;
    } catch (e) {
      lastError = e;
      console.warn("[LvExam] sync overview doc failed:", e);
    }

    try {
      const bankDoc = await this.syncBankToSiyuanDoc(bankId);
      bankDocId = bankDoc.docId;
    } catch (e) {
      lastError = e;
      console.warn("[LvExam] sync full bank doc failed:", e);
    }

    try {
      wrongbookDocId = await this.exportWrongbook(bankId, bankName);
    } catch (e) {
      lastError = e;
      console.warn("[LvExam] sync wrongbook doc failed:", e);
    }

    try {
      const journalDoc = await this.syncActionJournalDoc(bankId);
      actionJournalDocId = journalDoc.docId;
    } catch (e) {
      lastError = e;
      console.warn("[LvExam] sync action journal doc failed:", e);
    }

    try {
      const qs = await this.app.listQuestions(bankId);
      const wrongIds = new Set(this.app.wrongItems().map((w) => w.qid));
      const targetQuestions = qs.filter((q) => wrongIds.has(q.id) || q.fav);
      if (targetQuestions.length) {
        flashcardCount = await this.app.convertToCards(bankId, bankName, targetQuestions);
      }
    } catch (e) {
      console.warn("[LvExam] sync flashcards doc failed:", e);
      pushDiagError({ source: "小驴考试", message: `活文档同步转卡失败：${e instanceof Error ? e.message : String(e)}` });
      lvNotify.capsule({ source: "小驴考试", message: "⚠️ 转入闪卡步骤失败，题库数据已同步", level: "warn", duration: 3200, archive: false });
    }

    if (!overviewDocId && !bankDocId && !wrongbookDocId && !actionJournalDocId && lastError) {
      throw lastError;
    }
    return { overviewDocId, bankDocId, wrongbookDocId, actionJournalDocId, flashcardCount };
  }

  async appendScoreToDailyNote(
    markdown: string,
    notebookId?: string,
  ): Promise<{ docId: string }> {
    if (!this.app.kernelOnline) throw new Error("离线：写入日记需要思源内核在线");
    let docId: string | null = null;
    try {
      const { findTodayDailyNoteDocId } = await import("../libs/lv-notice-kit");
      docId = await findTodayDailyNoteDocId(notebookId).catch(() => null);
    } catch { /* ignore */ }

    if (!docId) {
      let targetNotebook = notebookId?.trim();
      if (!targetNotebook) {
        const allNbs = await this.app.bridge.listNotebooks();
        const openNbs = allNbs.filter((n) => !(n as { closed?: boolean }).closed);
        const notebooks = openNbs.length ? openNbs : allNbs;
        const isExcluded = (name: string) => /管家|人脉|题库|闪卡|拾遗|生态|空间|exam|contacts|home|checkin|glean/i.test(name || "");
        const preferredNb = notebooks.find((n) => /^(日记|Daily|Journal|我的笔记|默认)/i.test(n.name || ""))
          ?? notebooks.find((n) => /日记|daily\s*note|journal/i.test(n.name || "") && !isExcluded(n.name))
          ?? notebooks.find((n) => !isExcluded(n.name))
          ?? notebooks[0];
        targetNotebook = preferredNb?.id;
      }
      if (targetNotebook) {
        docId = await this.app.bridge.createDailyNote(targetNotebook).catch(() => null);
      }
    }
    if (!docId) throw new Error("未能定位或创建今日日记文档");
    await withDocLock(docId, async () => {
      const bodySummary = markdown
        .replace(/^>\s*/gm, "")
        .replace(/[*`#]/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 120);
      await writeInsideXiaolvDiaryZone({
        bridge: this.app.bridge,
        docId: docId!,
        markdown,
        lifeLogEntry: {
          type: "模拟考成绩",
          icon: "📊",
          body: bodySummary || "小驴考试模考战绩归档",
          source: "siyuan-exam",
          module: "mock-score",
          refDocId: docId!,
        },
      });
    });
    return { docId };
  }
}
