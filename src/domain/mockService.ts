// ============================================================
// MockService: 全真模考与成绩单报表领域服务（S6 切片架构解耦）
// - 模考进行中快照（MockRunSnapshot）暂存、恢复与清除
// - 历史成绩单汇总、FIFO 200 条限制与幂等覆盖
// - 成绩单自动导出题库文档与 Markdown 报告生成
// ============================================================
import type { IHostBridge } from "../bridge/hostBridge";
import type { StorageGateway } from "../storage/storageGateway";
import type { MockRunSnapshot } from "../core/mock";
import { MOCK_RUN_KEY } from "../constants";
import { withDocLock } from "../libs/lv-notice-kit";

export const MOCK_RESULTS_KEY = "mock/results";

export interface MockRecord {
  id: string; // 蓝图 id
  /** 本次考试运行 id（r-…；与蓝图分离，同蓝图多次考试互不覆盖；旧记录无此字段） */
  runId?: string;
  name: string;
  startedAt: number;
  /** 交卷完成时刻（支持跨日场次时间审计与日期归属，旧记录可选容错） */
  submittedAt?: number;
  total: number;
  full: number;
  percent: number;
  pass?: boolean;
  sections?: { name: string; score: number; full: number; correct: number; total: number }[];
  extraTimeS?: number;
}

export interface MockDomainDeps {
  bridge: IHostBridge;
  storage: StorageGateway;
  assertStorageWritable: () => void;
  ensureDoc: (bankId: string, hpath: string) => Promise<string>;
}

export class MockService {
  private mockRunSaveTail: Promise<void> = Promise.resolve();

  constructor(private readonly deps: MockDomainDeps) {}

  async saveMockRun(snap: MockRunSnapshot): Promise<void> {
    this.deps.assertStorageWritable();
    const snapshot: MockRunSnapshot = {
      ...snap,
      qids: [...snap.qids],
      sectionOf: { ...snap.sectionOf },
      scoreOf: { ...snap.scoreOf },
      indefinite: [...snap.indefinite],
      answers: snap.answers.map((a) => ({ ...a })),
      flags: [...snap.flags],
      sectionStart: { ...snap.sectionStart },
      dwell: snap.dwell ? { ...snap.dwell } : snap.dwell,
      currentEnter: snap.currentEnter ? { ...snap.currentEnter } : snap.currentEnter,
      qVersions: snap.qVersions ? { ...snap.qVersions } : snap.qVersions,
    };
    const write = this.mockRunSaveTail.then(() => this.deps.storage.save(MOCK_RUN_KEY, snapshot));
    this.mockRunSaveTail = write.catch(() => undefined);
    await write;
  }

  async loadMockRun(): Promise<MockRunSnapshot | null> {
    try {
      const v = await this.deps.storage.load<MockRunSnapshot | null>(MOCK_RUN_KEY);
      return v && Array.isArray(v.qids) && typeof v.startedAt === "number" ? v : null;
    } catch {
      return null;
    }
  }

  async flush(): Promise<void> {
    await this.mockRunSaveTail.catch(() => undefined);
  }

  async clearMockRun(): Promise<void> {
    this.deps.assertStorageWritable();
    const clear = this.mockRunSaveTail.then(async () => {
      this.deps.storage.saves.clear(MOCK_RUN_KEY);
      await this.deps.storage.save(MOCK_RUN_KEY, null);
    });
    this.mockRunSaveTail = clear.catch(() => undefined);
    await clear;
  }

  async saveMockResult(rec: MockRecord): Promise<void> {
    if (![rec.total, rec.full, rec.percent].every((v) => Number.isFinite(v)) || rec.total < 0 || rec.full <= 0 || rec.total > rec.full) {
      throw new Error("模考成绩包含无效数字，得分不能超过总分");
    }
    this.deps.assertStorageWritable();
    await this.deps.storage.queueStorageWrite(MOCK_RESULTS_KEY, async (token) => {
      const list = await this.listMockResults();
      const existing = rec.runId ? list.findIndex((item) => item.runId === rec.runId) : -1;
      if (existing >= 0) list[existing] = rec;
      else list.push(rec);
      while (list.length > 200) list.shift();
      await this.deps.storage.save(MOCK_RESULTS_KEY, list, token);
    });
  }

  async listMockResults(): Promise<MockRecord[]> {
    const v = await this.deps.storage.load<MockRecord[]>(MOCK_RESULTS_KEY);
    return Array.isArray(v) ? (v as MockRecord[]) : [];
  }

  async writeScoreDoc(bankId: string, md: string): Promise<string> {
    return withDocLock(`${bankId}:export-score`, async () => {
      await this.deps.ensureDoc(bankId, "/导出");
      const docId = await this.deps.ensureDoc(bankId, `/导出/模考战报-${new Date().toISOString().slice(0, 10)}`);
      await this.deps.bridge.appendBlock(docId, md);
      return docId;
    });
  }
}
