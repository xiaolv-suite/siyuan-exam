import type { KernelApiClient } from "../kernel/client";
import type { StorageAdapter } from "../core/attemptLog";
import type { HostBridge } from "../bridge/hostBridge";
import type { AttemptLog } from "../core/attemptLog";
import type { StorageGateway } from "../storage/storageGateway";
import type { SaveGate } from "../core/saveGate";
import type { BankInfo } from "./bankService";
import type { Question, ReplayResult } from "../core/types";
import type { MaterialLinkStore } from "../core/materialLinks";

export interface ExamAppDeps {
  client: KernelApiClient;
  storage: StorageAdapter;
  bridge?: HostBridge;
  now?: () => number;
}

export interface AppHost {
  [key: string]: any;
  deps: ExamAppDeps;
  attempts: AttemptLog;
  storageGateway: StorageGateway;
  saves: SaveGate;
  bridge: HostBridge;
  kernelOnline: boolean;
  questionBlockMap: Map<string, string>;
  storageReadErrors: Map<string, string>;
  materialLinkStore: MaterialLinkStore;
  materialsRegistry: any;
  materialNoteStore: any;
  misdiagnosisStore: any;
  syllabus: any;
  kpRelations: any;
  wrongReflections: Record<string, { text: string; at: number }>;
  wrongReasons: Map<string, "careless" | "unknown" | "trap">;
  loadActions(): Promise<any[]>;
  loadAux<T = any>(key: string): Promise<T | undefined>;
  saveAux<T = any>(key: string, value: T | null, reentryToken?: symbol): Promise<void>;
  noteStorageReadError(key: string, error: unknown): void;
  assertStorageWritable(): void;
  queueStorageWrite(key: string, fn: (reentryToken: symbol) => Promise<void>, reentryToken?: symbol): Promise<void>;
  ensureTier2Loaded(): Promise<void>;
  listBanks(): BankInfo[];
  ensureDoc(bankId: string, hpath: string, markdown?: string): Promise<string>;
  upsertDocWithMd(bankId: string, hpath: string, markdown: string): Promise<string>;
  listQuestions(bankId: string): Promise<(Question & { blockId: string; rootId: string; hpath: string })[]>;
  derived(options?: { eliminateStreak?: number; reopenAt?: ReadonlyMap<string, number> }): ReplayResult;
  invalidate(): void;
  syncQuestionStudyStateToBlock(qid: string, explicitBlockId?: string): Promise<void>;
}
