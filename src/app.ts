// ============================================================
// ExamApp：应用组装层（微内核中继控制器）—— UI 与测试共用的唯一入口
// 依赖全部注入（KernelApiClient / StorageAdapter），headless 可驱动
// S9 收敛架构：领域服务全真委托，单文件 < 350 行
// ============================================================
import { KernelApiClient } from "./kernel/client";
import { HostBridge } from "./bridge/hostBridge";
import { StorageGateway } from "./storage/storageGateway";
import { BankDomainService, type BankInfo } from "./domain/bankService";
import { SessionFlowService } from "./domain/sessionFlowService";
import { WrongbookService } from "./domain/wrongbookService";
import { ActionDomainService } from "./domain/actionService";
import { AppLifecycleService } from "./domain/appLifecycleService";
import { AppSyncExportService } from "./domain/appSyncExportService";
import { CardBridgeService } from "./domain/cardBridgeService";
import { DataTransferDomainService } from "./domain/dataTransferService";
import { ImportCommitDomainService, type ImportCommitResult } from "./domain/importCommitService";
import { MaterialDomainService } from "./domain/materialService";
import { QuestionDomainService } from "./domain/questionService";
import { MockService, type MockRecord } from "./domain/mockService";
import type { StorageAdapter } from "./core/attemptLog";
import { AttemptLog } from "./core/attemptLog";
import { type AttemptEvent, type Question, type ReplayResult, type WrongItem } from "./core/types";
import { TIER1_STORE_KEYS, TIER2_STORE_KEYS, ALL_STORE_KEYS } from "./constants";
import { PracticeSession } from "./core/session";
import { type QuestionLifecycleStatus, type QuestionRevision } from "./core/revision";
import { SaveGate } from "./core/saveGate";
import type { BankCategory } from "./core/bankCategory";
import type { BatchField } from "./core/batchEdit";
import type { DataAuditReport } from "./core/dataAudit";
import { createAppServices } from "./domain/appServiceBundle";
import type { MockRunSnapshot } from "./core/mock";
import type { SelfDiagnosisHistoryDoc } from "./core/selfDiagnosis";
import type { ActionItem, ActionKind } from "./core/actions";
import type { DisputeReason } from "./core/dispute";
import type { ImportCheckpoint, ImportReport } from "./importer/pipeline";
import type { MaterialDoc } from "./core/materials";
import type { NoteInput, NoteLocator } from "./core/materialNotes";
import type { MisdiagnosisRecord } from "./core/misdiagnosis";
import type { SyllabusDoc, SyllabusMeta, SyllabusNode } from "./core/syllabus";
import type { KpRelation, KpRelationsDoc } from "./core/kpRelations";

export * from "./app-exports";
export type { BankInfo } from "./domain/bankService";
export type { BankCategory } from "./core/bankCategory";
export type { ImportCommitResult, MockRecord };
export interface ExamAppDeps { client: KernelApiClient; storage: StorageAdapter; bridge?: HostBridge; now?: () => number; getEliminateStreak?: () => number; }

export class ExamApp {
  readonly attempts: AttemptLog;
  readonly storageGateway: StorageGateway;
  readonly saves: SaveGate;
  readonly bankService: BankDomainService;
  readonly sessionFlow: SessionFlowService;
  readonly wrongbook: WrongbookService;
  readonly mock: MockService;
  readonly materialService: MaterialDomainService;
  readonly questionService: QuestionDomainService;
  readonly actionService: ActionDomainService;
  readonly lifecycle: AppLifecycleService;
  readonly importCommit: ImportCommitDomainService;
  readonly cardBridge: CardBridgeService;
  readonly dataTransfer: DataTransferDomainService;
  readonly syncExport: AppSyncExportService;
  readonly bridge: HostBridge;
  readonly questionBlockMap = new Map<string, string>();

  get banks(): BankInfo[] { return this.bankService.banks; } set banks(b: BankInfo[]) { this.bankService.banks = b; }
  get materialsRegistry() { return this.materialService.materialsRegistry; } set materialsRegistry(v) { this.materialService.materialsRegistry = v; }
  get materialsVersionTooNew() { return this.materialService.materialsVersionTooNew; } set materialsVersionTooNew(v) { this.materialService.materialsVersionTooNew = v; }
  get materialNoteStore() { return this.materialService.materialNoteStore; } set materialNoteStore(v) { this.materialService.materialNoteStore = v; }
  get materialLinkStore() { return this.materialService.materialLinkStore; } set materialLinkStore(v) { this.materialService.materialLinkStore = v; }
  get misdiagnosisStore() { return this.materialService.misdiagnosisStore; } set misdiagnosisStore(v) { this.materialService.misdiagnosisStore = v; }
  get syllabus() { return this.materialService.syllabus; } set syllabus(v) { this.materialService.syllabus = v; }
  get syllabusTooNew() { return this.materialService.syllabusTooNew; } set syllabusTooNew(v) { this.materialService.syllabusTooNew = v; }
  get kpRelations() { return this.materialService.kpRelations; } set kpRelations(v) { this.materialService.kpRelations = v; }
  get kpRelationsTooNew() { return this.materialService.kpRelationsTooNew; } set kpRelationsTooNew(v) { this.materialService.kpRelationsTooNew = v; }
  get activeSession(): PracticeSession | null { return this.sessionFlow.currentSession(); } set activeSession(s: PracticeSession | null) { (this.sessionFlow as any).activeSession = s; }
  get wrongOverlay(): Map<string, { status: string; at: number; wrongCount: number; until?: number }> { return this.wrongbook.wrongOverlay; } set wrongOverlay(m: Map<string, { status: string; at: number; wrongCount: number; until?: number }>) { this.wrongbook.wrongOverlay = m; }
  get wrongReflections(): Record<string, { text: string; at: number }> { return this.wrongbook.wrongReflections; } set wrongReflections(r: Record<string, { text: string; at: number }>) { this.wrongbook.wrongReflections = r; }
  get wrongReasons(): Map<string, "careless" | "unknown" | "trap"> { return this.wrongbook.wrongReasons; } set wrongReasons(m: Map<string, "careless" | "unknown" | "trap">) { this.wrongbook.wrongReasons = m; }
  get diagnosisDoc(): SelfDiagnosisHistoryDoc { return this.wrongbook.diagnosisDoc; } set diagnosisDoc(d: SelfDiagnosisHistoryDoc) { this.wrongbook.diagnosisDoc = d; }
  get storageReadErrors(): Map<string, string> { return this.storageGateway.storageReadErrors; }
  static readonly CRITICAL_STORAGE_KEYS = StorageGateway.CRITICAL_STORAGE_KEYS;
  static readonly TIER1_KEYS = TIER1_STORE_KEYS;
  static readonly TIER2_KEYS = TIER2_STORE_KEYS;
  static readonly ALL_STORE_KEYS = ALL_STORE_KEYS;

  get deviceId() { return this.lifecycle.deviceId; } set deviceId(v) { this.lifecycle.deviceId = v; }
  get kernelOnline() { return this.lifecycle.kernelOnline; } set kernelOnline(v) { this.lifecycle.kernelOnline = v; }
  get lastKernelError() { return this.lifecycle.lastKernelError; } set lastKernelError(v) { this.lifecycle.lastKernelError = v; }
  get probeMessage() { return this.lifecycle.probeMessage; } set probeMessage(v) { this.lifecycle.probeMessage = v; }
  get tier2Ready() { return this.lifecycle.tier2Ready; } set tier2Ready(v) { this.lifecycle.tier2Ready = v; }
  get tier2LoadingPromise() { return this.lifecycle.tier2LoadingPromise; } set tier2LoadingPromise(v) { this.lifecycle.tier2LoadingPromise = v; }
  get tier2ScheduledTimer() { return this.lifecycle.tier2ScheduledTimer; } set tier2ScheduledTimer(v) { this.lifecycle.tier2ScheduledTimer = v; }
  get tier2IdleId() { return this.lifecycle.tier2IdleId; } set tier2IdleId(v) { this.lifecycle.tier2IdleId = v; }
  get tier2LoadGeneration() { return this.lifecycle.tier2LoadGeneration; } set tier2LoadGeneration(v) { this.lifecycle.tier2LoadGeneration = v; }
  get lifecycleGeneration(): number { return this.tier2LoadGeneration; } set lifecycleGeneration(v: number) { this.tier2LoadGeneration = v; }
  isUnloaded = false;
  get isUnloading(): boolean { return this.isUnloaded; } set isUnloading(v: boolean) { this.isUnloaded = v; }
  get storageReadonly(): boolean { return this.storageGateway.storageReadonly; }

  constructor(readonly deps: ExamAppDeps) {
    this.bridge = deps.bridge ?? new HostBridge(deps.client);
    const s = createAppServices(this, deps);
    this.storageGateway = s.storageGateway; this.saves = s.saves; this.bankService = s.bankService;
    this.attempts = s.attempts; this.sessionFlow = s.sessionFlow; this.wrongbook = s.wrongbook;
    this.mock = s.mock; this.materialService = s.materialService; this.questionService = s.questionService;
    this.actionService = s.actionService; this.lifecycle = s.lifecycle; this.importCommit = s.importCommit;
    this.cardBridge = s.cardBridge; this.dataTransfer = s.dataTransfer; this.syncExport = s.syncExport;
  }

  async loadAux<T>(key: string): Promise<T | undefined> { return this.storageGateway.loadAux<T>(key); }
  async saveAux<T>(key: string, value: T | null, reentryToken?: symbol): Promise<void> { return this.storageGateway.saveAux<T>(key, value, reentryToken); }
  noteStorageReadError(key: string, error: unknown) { this.storageGateway.noteStorageReadError(key, error); }
  assertStorageWritable() { this.storageGateway.assertStorageWritable(); }
  queueStorageWrite(key: string, fn: (reentryToken: symbol) => Promise<void>, reentryToken?: symbol): Promise<void> { return this.storageGateway.queueStorageWrite(key, fn, reentryToken); }
  kernelRecoveryHint(): string { return this.lifecycle.kernelRecoveryHint(); }

  setKernelOnline(v: boolean) { this.lifecycle.setKernelOnline(v); }
  setKernelError(v: any) { this.lifecycle.setKernelError(v); }
  init(deviceId?: string, options?: { deferTier2?: boolean }): Promise<void> { return this.lifecycle.init(deviceId, options); }
  // safePerfMark("siyuan-exam-tier2-start"); safePerfMark("siyuan-exam-tier2-end"); safePerfMeasure("siyuan-exam-tier2-load", "siyuan-exam-tier2-start", "siyuan-exam-tier2-end");
  scheduleTier2Load(): void { this.lifecycle.scheduleTier2Load(); }
  cancelTier2Schedule(): void { this.lifecycle.cancelTier2Schedule(); }
  ensureTier2Loaded(): Promise<void> { return this.lifecycle.ensureTier2Loaded(); }
  loadTier2Storage(): Promise<void> { return this.lifecycle.loadTier2Storage(); }
  startOfflineReprobe(): void { this.lifecycle.startOfflineReprobe(); }
  stopOfflineReprobe(): void { this.lifecycle.stopOfflineReprobe(); }

  listBanks(): BankInfo[] { return this.bankService.listBanks(); }
  recordActiveBank(bankId: string): void { this.bankService.recordActiveBank(bankId); }
  resolvePreferredBank(notebookIdOrDocId?: string): BankInfo | null { return this.bankService.resolvePreferredBank(notebookIdOrDocId); }
  resolveBankScope(bankId: string): { notebookId: string; rootHPath?: string } { return this.bankService.resolveBankScope(bankId); }
  qualifyBankHPath(bankId: string, subHPath: string): { notebookId: string; hpath: string } { return this.bankService.qualifyBankHPath(bankId, subHPath); }
  async saveBankRegistry(): Promise<void> { await this.ensureTier2Loaded(); return this.bankService.saveBankRegistry(); }
  // private async saveBankRegistry(): Promise<void> { await this.ensureTier2Loaded(); }
  createBank(name: string, category: BankCategory = "general"): Promise<BankInfo> { return this.bankService.createBank(name, category); }
  createSampleBank(kind: any = "general"): Promise<BankInfo> { return this.bankService.createSampleBank(kind); }
  removeBank(id: string): Promise<boolean> {
    return this.bankService.removeBank(id, (qidsToClean) => {
      void this.cleanupBankAuxData(qidsToClean).catch((err) => console.warn("[LvExam] cleanupBankAuxData error:", err));
    });
  }
  private cleanupBankAuxData(qids: Set<string>): Promise<void> { return this.dataTransfer.cleanupBankAuxData(qids); }
  renameBank(id: string, newName: string): Promise<BankInfo> { return this.bankService.renameBank(id, newName); }
  updateBankCategory(id: string, category: BankCategory): Promise<BankInfo> { return this.bankService.updateBankCategory(id, category); }

  commitImport(bankId: string, report: ImportReport, opts?: any): Promise<ImportCommitResult> { return this.importCommit.commitImport(bankId, report, opts); }
  loadImportCheckpoint(bankId?: string): Promise<ImportCheckpoint | null> { return this.importCommit.loadImportCheckpoint(bankId); }
  saveImportCheckpoint(cp: ImportCheckpoint): Promise<void> { return this.importCommit.saveImportCheckpoint(cp); }
  clearImportCheckpoint(): Promise<void> { return this.importCommit.clearImportCheckpoint(); }
  get ensuredDocIds(): Map<string, string> { return this.bankService.ensuredDocIds; }
  async ensureDoc(bankId: string, hpath: string, markdown?: string): Promise<string> { return this.bankService.ensureDoc(bankId, hpath, markdown); }
  async upsertDocWithMd(bankId: string, hpath: string, markdown: string): Promise<string> { return this.bankService.upsertDocWithMd(bankId, hpath, markdown); }
  async listQuestions(bankId: string): Promise<(Question & { blockId: string; rootId: string; hpath: string })[]> { return this.bankService.listQuestions(bankId); }

  syncQuestionStudyStateToBlock(qid: string, explicitBlockId?: string): Promise<void> { return this.questionService.syncQuestionStudyStateToBlock(qid, explicitBlockId); }
  findQuestionByBlock(blockId: string) { return this.questionService.findQuestionByBlock(blockId); }
  docTree(bankId: string) { return this.questionService.docTree(bankId); }
  markQuestionKp(q: Question & { blockId?: string }, kp: string): Promise<void> { return this.questionService.markQuestionKp(q, kp); }
  updateQuestionContent(q: Question & { blockId: string }, draft: any): Promise<Question> { return this.questionService.updateQuestionContent(q, draft); }
  questionRevisions(qid: string): Promise<QuestionRevision[]> { return this.questionService.questionRevisions(qid); }
  appendRevision(qid: string, entry: QuestionRevision): Promise<void> { return this.questionService.appendRevision(qid, entry); }

  recordAttempt(input: Parameters<AttemptLog["append"]>[0]): AttemptEvent { return this.sessionFlow.recordAttempt(input); }
  undoLastAttempt(sessionId: string, qid?: string): AttemptEvent | null { return this.sessionFlow.undoLastAttempt(sessionId, qid); }
  updateMockAttemptSelfRating(sessionId: string, qid: string, factor: number, myAnswer?: string | null): Promise<AttemptEvent> { return this.sessionFlow.updateMockAttemptSelfRating(sessionId, qid, factor, myAnswer); }
  mergeDuplicateQuestions(targetQ: Question & { blockId: string }, sourceQ: Question & { blockId: string }) { return this.questionService.mergeDuplicateQuestions(targetQ, sourceQ); }
  derived(options?: { eliminateStreak?: number; reopenAt?: ReadonlyMap<string, number> }): ReplayResult {
    return this.sessionFlow.derived(options, this.wrongbook.activeReopenAt(), this.deps.getEliminateStreak);
  }
  wrongItems(): WrongItem[] { return this.wrongbook.wrongItems(); }
  listArchivedWrongs(): WrongItem[] { return this.wrongbook.listArchivedWrongs(); }
  isWrongArchived(qid: string): boolean { return this.wrongbook.isWrongArchived(qid); }
  async archiveWrong(qid: string): Promise<void> { await this.ensureTier2Loaded(); return this.wrongbook.archiveWrong(qid); }
  async unarchiveWrong(qid: string): Promise<void> { await this.ensureTier2Loaded(); return this.wrongbook.unarchiveWrong(qid); }
  async setWrongStatus(qid: string, status: "mastered" | "removed" | "active"): Promise<void> { await this.ensureTier2Loaded(); return this.wrongbook.setWrongStatus(qid, status); }
  async snoozeWrong(qid: string, days = 7): Promise<void> { await this.ensureTier2Loaded(); return this.wrongbook.snoozeWrong(qid, days); }
  async saveWrongReflection(qid: string, text: string): Promise<void> { await this.ensureTier2Loaded(); return this.wrongbook.saveWrongReflection(qid, text); }
  async loadWrongReflection(qid: string): Promise<{ text: string; at: number } | null> { return this.wrongbook.loadWrongReflection(qid); }
  async saveWrongReason(qid: string, reason: "careless" | "unknown" | "trap"): Promise<void> { await this.ensureTier2Loaded(); return this.wrongbook.saveWrongReason(qid, reason); }
  async loadWrongReason(qid: string): Promise<string | undefined> { return this.wrongbook.loadWrongReason(qid); }
  wrongReasonMap(): Map<string, "careless" | "unknown" | "trap"> { return this.wrongbook.wrongReasonMap(); }
  invalidate() { this.sessionFlow.invalidateReplay(); }
  async flush(): Promise<void> { await this.mock.flush(); await this.attempts.flush(); await this.storageGateway.flush(); }

  loadActions(): Promise<ActionItem[]> { return this.actionService.loadActions(); }
  saveActions(list: ActionItem[]): Promise<void> { return this.actionService.saveActions(list); }
  addActions(drafts: { kind: ActionKind; qid?: string; sessionId?: string; detail: string }[]) { return this.actionService.addActions(drafts); }
  listOpenActions(): Promise<ActionItem[]> { return this.actionService.listOpenActions(); }
  completeAction(id: string, evidence = "user-confirmed"): Promise<void> { return this.actionService.completeAction(id, evidence); }
  cancelAction(id: string): Promise<void> { return this.actionService.cancelAction(id); }

  currentSession(): PracticeSession | null { return this.sessionFlow.currentSession(); }
  async startSession(questions: Question[], mode: string, bankId?: string, opts?: any): Promise<PracticeSession> { return this.sessionFlow.startSession(questions, mode, bankId, opts); }
  get lastResumeMissing(): string[] { return this.sessionFlow.lastResumeMissing; }
  set lastResumeMissing(m: string[]) { this.sessionFlow.lastResumeMissing = m; }
  async resumeSession(questionLoader: (qids: string[]) => Promise<Question[]>, expectedBankId?: string): Promise<PracticeSession | null> { return this.sessionFlow.resumeSession(questionLoader, expectedBankId); }
  async saveSession(): Promise<void> { return this.sessionFlow.saveSession(); }
  async discardSession(): Promise<void> { return this.sessionFlow.discardSession(); }

  writeManualQuestion(bankId: string, q: Question): Promise<void> { return this.questionService.writeManualQuestion(bankId, q); }
  appendQuestionNote(qid: string, blockId: string | undefined, text: string, kind: "mnemonic" | "note" | "ai-explain"): Promise<void> { return this.questionService.appendQuestionNote(qid, blockId, text, kind); }
  toggleFav(q: Question & { blockId?: string }): Promise<boolean> { return this.questionService.toggleFav(q); }
  applyBatchEdit(changes: { blockId: string; field: BatchField; to: string }[]) { return this.questionService.applyBatchEdit(changes); }
  listBatches(questions: (Question & { batch?: string })[]) { return this.questionService.listBatches(questions); }
  rollbackBatch(bankId: string, batch: string) { return this.questionService.rollbackBatch(bankId, batch); }

  storageUsage() { return this.dataTransfer.storageUsage(); }
  auditData(knownQids: Set<string>): DataAuditReport { return this.dataTransfer.auditData(knownQids); }
  async exportAllData(): Promise<string> { await this.ensureTier2Loaded(); return this.dataTransfer.exportAllData(); }
  async dumpData(): Promise<Record<string, unknown>> { await this.ensureTier2Loaded(); return this.dataTransfer.dumpData(); }
  async restoreData(data: Record<string, unknown>): Promise<boolean> { await this.ensureTier2Loaded(); return this.dataTransfer.restoreData(data); }
  triggerWrongQuestionAutomation(q: any) { return this.dataTransfer.triggerWrongQuestionAutomation(q); }

  listMaterials(): MaterialDoc[] { return this.materialService.materials(); }
  getMaterial(id: string): MaterialDoc | undefined { return this.materialService.materials().find((m) => m.id === id); }
  get materialsReadonly(): boolean { return this.materialService.materialsReadonly; }
  resolveMaterialUrlOf(material: MaterialDoc, origin: string): string | null { return this.materialService.materialUrl(material, origin); }
  registerMaterialFromFile(file: File, meta?: any) { return this.materialService.registerMaterialFromFile(file, meta); }
  registerMaterialFromLink(url: string, meta?: any) { return this.materialService.registerMaterialFromLink(url, meta); }
  removeMaterialById(id: string, purgeAssets = false) { return this.materialService.removeMaterialById(id, purgeAssets); }
  listMaterialNotes(id: string) { return this.materialService.listMaterialNotes(id); }
  addMaterialNote(input: NoteInput) { return this.materialService.addMaterialNote(input); }
  updateMaterialNote(id: string, patch: any) { return this.materialService.updateMaterialNote(id, patch); }
  deleteMaterialNote(id: string) { return this.materialService.deleteMaterialNote(id); }
  questionMaterialRef(qid: string) { return this.materialService.questionMaterialRef(qid); }
  listQuestionRefs(id: string) { return this.materialService.listQuestionRefs(id); }
  linkQuestionMaterial(qid: string, mid: string, locator?: NoteLocator | null) { return this.materialService.linkQuestionMaterial(qid, mid, locator); }
  unlinkQuestionMaterial(qid: string) { return this.materialService.unlinkQuestionMaterial(qid); }
  latestMisdiagnosis(qid: string) { return this.materialService.latestMisdiagnosis(qid); }
  async saveMisdiagnosis(rec: MisdiagnosisRecord): Promise<void> { await this.ensureTier2Loaded(); return this.materialService.saveMisdiagnosis(rec); }
  markMisdiagnosisAdopted(qid: string) { return this.materialService.markMisdiagnosisAdopted(qid); }
  syllabusDoc(): SyllabusDoc { return this.materialService.syllabusDoc(); }
  get syllabusReadonly(): boolean { return this.materialService.syllabusReadonly; }
  previewSyllabus(text: string) { return this.materialService.previewSyllabus(text); }
  async setSyllabusDoc(meta: SyllabusMeta, roots: SyllabusNode[]): Promise<void> { await this.ensureTier2Loaded(); return this.materialService.setSyllabusDoc(meta, roots); }
  kpRelationsDoc(): KpRelationsDoc { return this.materialService.kpRelationsDoc(); }
  get kpRelationsReadonly(): boolean { return this.materialService.kpRelationsReadonly; }
  async setKpRelations(relations: KpRelation[]): Promise<void> { await this.ensureTier2Loaded(); return this.materialService.setKpRelations(relations); }
  // private async saveMaterialsRegistry(): Promise<void> { await this.ensureTier2Loaded(); }
  // private async saveMaterialNotes(): Promise<void> { await this.ensureTier2Loaded(); }
  applyTaxonomyPreset(options?: any) { return this.materialService.applyTaxonomyPreset(options); }
  purgeAllData() { return this.dataTransfer.purgeAllData(); }
  applyAnswerUpdates(updates: { row: number; q: Question }[], existing: (Question & { blockId: string })[], opts?: any) {
    return this.importCommit.applyAnswerUpdates(updates, existing, opts);
  }

  writeDailyReport(bankId: string, bankName: string) { return this.dataTransfer.writeDailyReport(bankId, bankName); }
  recordAiUsage(channelId: string, tokens: number, calls: number) { return this.dataTransfer.recordAiUsage(channelId, tokens, calls); }
  aiUsage() { return this.dataTransfer.aiUsage(); }
  exportBankSyZip(bankId: string) { return this.bankService.exportBankSyZip(bankId); }
  importBankSyZip(file: Blob, filename = "bank.sy.zip") { return this.bankService.importBankSyZip(file, filename); }
  saveEstimate(rec: any) { return this.dataTransfer.saveEstimate(rec); }
  listEstimates() { return this.dataTransfer.listEstimates(); }
  saveMockRun(snap: MockRunSnapshot) { return this.mock.saveMockRun(snap); }
  loadMockRun() { return this.mock.loadMockRun(); }
  clearMockRun() { return this.mock.clearMockRun(); }
  writeScoreDoc(bankId: string, md: string) { return this.mock.writeScoreDoc(bankId, md); }
  appendScoreToDailyNote(markdown: string, notebookId?: string) { return this.syncExport.appendScoreToDailyNote(markdown, notebookId); }
  exportWrongbook(bankId: string, bankName: string, opts?: any) { return this.syncExport.exportWrongbook(bankId, bankName, opts); }
  syncBankToLocalDocs(bankId: string, bankName: string) { return this.syncExport.syncBankToLocalDocs(bankId, bankName); }
  saveMockResult(rec: MockRecord) { return this.mock.saveMockResult(rec); }
  listMockResults() { return this.mock.listMockResults(); }

  ensureDeck(bankName: string) { return this.cardBridge.ensureDeck(bankName); }
  convertToCards(bankId: string, bankName: string, questions: (Question & { blockId?: string })[]) { return this.cardBridge.convertToCards(bankId, bankName, questions); }
  createFlashCards(bankId: string, bankName: string, cards: any[]) { return this.cardBridge.createFlashCards(bankId, bankName, cards); }
  dueQuestions(bankName: string, questions: any[]) { return this.cardBridge.dueQuestions(bankName, questions); }
  reciteAnswer(bankName: string, q: any, rating: 1 | 2 | 3 | 4, sessionId: string, timeMs = 0) { return this.cardBridge.reciteAnswer(bankName, q, rating, sessionId, timeMs); }
  listPendingRatings() { return this.cardBridge.listPendingRatings(); }
  clearPendingRating(sessionId: string, qid: string) { return this.cardBridge.clearPendingRating(sessionId, qid); }
  queryQuestions(bankId: string, stmt: string) { return this.cardBridge.queryQuestions(bankId, stmt); }
  peekRenderedStem(q: Question) { return this.cardBridge.peekRenderedStem(q); }
  renderStem(q: Question) { return this.cardBridge.renderStem(q); }
  invalidateRenderCache(qid?: string) { this.cardBridge.invalidateRenderCache(qid); }
  recitePool(questions: Question[]) { return this.cardBridge.recitePool(questions); }
  quickDrill(questions: Question[], n: number, seed?: string, opts?: any) { return this.cardBridge.quickDrill(questions, n, seed, opts); }
  sameKpDrill(all: Question[], seed: Question, n: number, excludeIds: Set<string>) { return this.cardBridge.sameKpDrill(all, seed, n, excludeIds); }
  cramDrill(questions: Question[], minWrong = 2, limit = 50) { return this.cardBridge.cramDrill(questions, minWrong, limit); }
  dailyDrill(questions: Question[], dueFirst: Question[], n: number) { return this.cardBridge.dailyDrill(questions, dueFirst, n); }
  dsrDailyDrill(questions: Question[], n: number, options?: any) { return this.cardBridge.dsrDailyDrill(questions, n, options); }
  favDrill(questions: Question[]) { return this.cardBridge.favDrill(questions); }
  wrongDrill(questions: Question[]) { return this.cardBridge.wrongDrill(questions); }

  buildCompactQuestionSheet(title: string, bankId?: string, options?: any) { return this.syncExport.buildCompactQuestionSheet(title, bankId, options); }
  buildCompactAnswerSheet(title: string, bankId?: string, options?: any) { return this.syncExport.buildCompactAnswerSheet(title, bankId, options); }
  buildTeacherLectureSheet(title: string, bankId?: string, options?: any) { return this.syncExport.buildTeacherLectureSheet(title, bankId, options); }
  buildStudentHomeworkSheet(title: string, bankId?: string, options?: any) { return this.syncExport.buildStudentHomeworkSheet(title, bankId, options); }
  updateQuestionLifecycle(q: any, targetStatus: QuestionLifecycleStatus) { return this.questionService.updateQuestionLifecycle(q, targetStatus); }
  flagQuestionDispute(q: any, reason: DisputeReason, note: string) { return this.questionService.flagQuestionDispute(q, reason, note); }
  resolveQuestionDispute(q: any, resolution: string) { return this.questionService.resolveQuestionDispute(q, resolution); }
  clearQuestionDispute(q: any) { return this.questionService.clearQuestionDispute(q); }
  tagQuestion(q: any, tag: string, action?: any) { return this.questionService.tagQuestion(q, tag, action); }
  generateReadinessReport(bankId?: string, options?: any) { return this.syncExport.generateReadinessReport(bankId, options); }
  exportReadinessReportMarkdown(bankId?: string, options?: any) { return this.syncExport.exportReadinessReportMarkdown(bankId, options); }
  assembleAdaptiveSprintPaper(bankId?: string, options?: any) { return this.syncExport.assembleAdaptiveSprintPaper(bankId, options); }
  parseOcrTextToQuestion(rawText: string, options?: any) { return this.syncExport.parseOcrTextToQuestion(rawText, options); }
  ocrAndParseQuestion(assetPath: string, options?: any) { return this.syncExport.ocrAndParseQuestion(assetPath, options); }
  uploadAndOcrQuestion(file: Blob, filename = "question.png", options?: any) { return this.syncExport.uploadAndOcrQuestion(file, filename, options); }
  planClearanceStudy(bankId?: string) { return this.syncExport.planClearanceStudy(bankId); }
  exportClearanceStudyGuideMarkdown(bankId?: string) { return this.syncExport.exportClearanceStudyGuideMarkdown(bankId); }
  pickVariantQuestions(seed: Question, n = 5) { return this.syncExport.pickVariantQuestions(seed, n); }
  exportCramCheatSheetMarkdown(bankId?: string, options?: any) { return this.syncExport.exportCramCheatSheetMarkdown(bankId, options); }
  exportItemQualityAuditMarkdown(bankId?: string) { return this.syncExport.exportItemQualityAuditMarkdown(bankId); }
  generateABExamPapers(bankId?: string, options?: any) { return this.syncExport.generateABExamPapers(bankId, options); }
  getMilestoneOverview(bankId?: string) { return this.syncExport.getMilestoneOverview(bankId); }
  exportMilestoneBadgeWallMarkdown(bankId?: string) { return this.syncExport.exportMilestoneBadgeWallMarkdown(bankId); }
  exportQuestionsToGift(bankId?: string) { return this.syncExport.exportQuestionsToGift(bankId); }
  exportQuestionsToAnkiTsv(bankId?: string) { return this.syncExport.exportQuestionsToAnkiTsv(bankId); }
  exportQuestionsToExamDocMarkdown(bankId?: string, title?: string) { return this.syncExport.exportQuestionsToExamDocMarkdown(bankId, title); }
  auditSyllabusCoverage(bankId?: string) { return this.syncExport.auditSyllabusCoverage(bankId); }
  exportSyllabusAuditMarkdown(bankId?: string) { return this.syncExport.exportSyllabusAuditMarkdown(bankId); }
  listExamBlueprintPresets() { return this.syncExport.listExamBlueprintPresets(); }
  applyBlueprintPreset(presetId: string, bankId?: string) { return this.syncExport.applyBlueprintPreset(presetId, bankId); }
  assembleWrongbookExam(bankId?: string, options?: any) { return this.syncExport.assembleWrongbookExam(bankId, options); }
  exportPaperAuditMarkdown(bankId?: string) { return this.syncExport.exportPaperAuditMarkdown(bankId); }
  findFoundationMotherQuestion(target: Question) { return this.syncExport.findFoundationMotherQuestion(target); }
  searchSiyuanDocs(query = "") { return this.syncExport.searchSiyuanDocs(query); }
  importFromSiyuanDoc(docId: string, options?: any) { return this.syncExport.importFromSiyuanDoc(docId, options); }
  importFromSiyuanDocBatch(docIds: string[], options?: any) { return this.syncExport.importFromSiyuanDocBatch(docIds, options); }
  searchBlocksByTag(tag: string) { return this.syncExport.searchBlocksByTag(tag); }
  searchRiffCardBlocks() { return this.syncExport.searchRiffCardBlocks(); }
  importFromTaggedBlocks(tag: string) { return this.syncExport.importFromTaggedBlocks(tag); }
  appendQuestionToSiyuanDoc(docId: string, q: Question) { return this.syncExport.appendQuestionToSiyuanDoc(docId, q); }
  syncBankToSiyuanDoc(bankId?: string) { return this.syncExport.syncBankToSiyuanDoc(bankId); }
  saveQuestionsToSiyuanDoc(title: string, questions: Question[], options?: any) { return this.syncExport.saveQuestionsToSiyuanDoc(title, questions, options); }
  syncBankOverviewDoc(bankId?: string) { return this.syncExport.syncBankOverviewDoc(bankId); }
  syncActionJournalDoc(bankId?: string) { return this.syncExport.syncActionJournalDoc(bankId); }
  syncActionsFromDoc(bankId?: string) { return this.syncExport.syncActionsFromDoc(bankId); }
}
