import type { AppHost, ExamAppDeps } from "./appContext";
import { HostBridge } from "../bridge/hostBridge";
import { StorageGateway } from "../storage/storageGateway";
import { BankDomainService } from "./bankService";
import { SessionFlowService } from "./sessionFlowService";
import { WrongbookService } from "./wrongbookService";
import { ActionDomainService } from "./actionService";
import { AppLifecycleService } from "./appLifecycleService";
import { AppSyncExportService } from "./appSyncExportService";
import { CardBridgeService } from "./cardBridgeService";
import { DataTransferDomainService } from "./dataTransferService";
import { ImportCommitDomainService } from "./importCommitService";
import { MaterialDomainService } from "./materialService";
import { QuestionDomainService } from "./questionService";
import { MockService } from "./mockService";
import { AttemptLog } from "../core/attemptLog";
import { emitExamEvent } from "../core/bus";
import type { SaveGate } from "../core/saveGate";

export interface AppServiceBundle {
  storageGateway: StorageGateway;
  saves: SaveGate;
  bridge: HostBridge;
  bankService: BankDomainService;
  attempts: AttemptLog;
  sessionFlow: SessionFlowService;
  wrongbook: WrongbookService;
  mock: MockService;
  materialService: MaterialDomainService;
  questionService: QuestionDomainService;
  actionService: ActionDomainService;
  lifecycle: AppLifecycleService;
  importCommit: ImportCommitDomainService;
  cardBridge: CardBridgeService;
  dataTransfer: DataTransferDomainService;
  syncExport: AppSyncExportService;
}

export function createAppServices(app: AppHost, deps: ExamAppDeps): AppServiceBundle {
  const storageGateway = new StorageGateway(deps.storage, deps.now);
  const saves = storageGateway.saves;
  const bridge = app.bridge;

  const bankService = new BankDomainService({
    bridge,
    storage: storageGateway,
    ensureTier2Loaded: () => app.ensureTier2Loaded(),
    assertStorageWritable: () => app.assertStorageWritable(),
    isKernelOnline: () => app.kernelOnline,
    questionBlockMap: app.questionBlockMap,
    now: deps.now,
  });

  const attempts = new AttemptLog(
    storageGateway.createAdapter(),
    "attempts/log",
    deps.now ?? (() => Date.now()),
    10,
    30_000,
    (err) => {
      app.noteStorageReadError("attempts/log", err);
      emitExamEvent("kernel-connection", { online: false });
    },
    () => {
      app.storageReadErrors.delete("attempts/log");
    },
  );

  const sessionFlow = new SessionFlowService({
    storage: storageGateway,
    attempts,
    now: deps.now,
    onSyncQuestionStudyState: (qid) => app.syncQuestionStudyStateToBlock(qid),
    onInvalidate: () => app.invalidate(),
  });

  const wrongbook = new WrongbookService({
    bridge,
    storage: storageGateway,
    ensureTier2Loaded: () => app.ensureTier2Loaded(),
    assertStorageWritable: () => app.assertStorageWritable(),
    isKernelOnline: () => app.kernelOnline,
    questionBlockMap: app.questionBlockMap,
    getDerivedWrongbook: () => app.derived().wrongbook,
    syncQuestionStudyStateToBlock: (qid) => app.syncQuestionStudyStateToBlock(qid),
    onInvalidate: () => app.invalidate(),
    now: deps.now,
  });

  const mock = new MockService({
    bridge,
    storage: storageGateway,
    assertStorageWritable: () => app.assertStorageWritable(),
    ensureDoc: (bankId, hpath) => app.ensureDoc(bankId, hpath),
  });

  const materialService = new MaterialDomainService({
    bridge,
    storageGateway,
    ensureTier2Loaded: () => app.ensureTier2Loaded(),
    assertStorageWritable: () => app.assertStorageWritable(),
    isKernelOnline: () => app.kernelOnline,
    now: deps.now,
  });

  const questionService = new QuestionDomainService(app);

  const actionService = new ActionDomainService({
    storageGateway,
    queueStorageWrite: (key, fn, token) => app.queueStorageWrite(key, fn, token),
    noteStorageReadError: (key, err) => app.noteStorageReadError(key, err),
    now: deps.now,
  });

  const lifecycle = new AppLifecycleService(app);
  const importCommit = new ImportCommitDomainService(app);
  const cardBridge = new CardBridgeService(app);
  const dataTransfer = new DataTransferDomainService(app);
  const syncExport = new AppSyncExportService(app);

  return {
    storageGateway,
    saves,
    bridge,
    bankService,
    attempts,
    sessionFlow,
    wrongbook,
    mock,
    materialService,
    questionService,
    actionService,
    lifecycle,
    importCommit,
    cardBridge,
    dataTransfer,
    syncExport,
  };
}
