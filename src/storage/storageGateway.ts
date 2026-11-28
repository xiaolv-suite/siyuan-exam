// ============================================================
// StorageGateway: 存储网关与锁收敛治理中枢（S2 切片架构收敛）
// - 接管 storageWriteTails / storageReadErrors / SaveGate
// - 统一收拢 Tier1 / Tier2 读改写门控与读写排队
// - flush 使用 Promise.allSettled 循环全排空慢链/失败链/并发新写且限轮显式报错
// ============================================================
import { SaveGate } from "../core/saveGate";
import type { StorageAdapter } from "../core/attemptLog";

export class StorageGateway {
  readonly saves: SaveGate;
  /** 本地存储按键串行化：读改写操作不能互相覆盖（保留最后一次完整快照） */
  private readonly storageWriteTails = new Map<string, Promise<void>>();
  /** 上下文显式重入令牌：仅持有当前活动写锁令牌的重入保存才允许直接执行，彻底杜绝并发调用绕过串行队列 */
  private readonly activeTokens = new Map<string, symbol>();
  /** 读取失败与“键不存在”必须区分；出现读取错误时阻止后续写入覆盖未知的磁盘数据。 */
  readonly storageReadErrors = new Map<string, string>();
  private readonly saveListeners = new Set<(key: string) => void>();

  onDidSave(listener: (key: string) => void): () => void {
    this.saveListeners.add(listener);
    return () => {
      this.saveListeners.delete(listener);
    };
  }

  /** 关键核心持久化存储键（若读取失败则全局锁定以防数据覆写） */
  static readonly CRITICAL_STORAGE_KEYS = new Set([
    "banks",
    "attempts/log",
    "session/active",
    "session/running",
    "mock/run",
    "mock/running",
  ]);

  constructor(
    private readonly storage: StorageAdapter,
    now?: () => number,
    saves?: SaveGate,
  ) {
    this.saves = saves ?? new SaveGate(now);
  }

  get storageReadonly(): boolean {
    for (const key of this.storageReadErrors.keys()) {
      if (StorageGateway.CRITICAL_STORAGE_KEYS.has(key)) return true;
    }
    return false;
  }

  noteStorageReadError(key: string, error: unknown): void {
    this.storageReadErrors.set(key, error instanceof Error ? error.message : String(error));
  }

  clearStorageReadError(key: string): void {
    this.storageReadErrors.delete(key);
  }

  assertStorageWritable(): void {
    if (this.storageReadonly) {
      throw new Error("插件数据读取失败，已暂停写入以避免覆盖原有数据；请重载思源后重试。");
    }
  }

  /**
   * 统一读取门控（Tier1 / Tier2 / 辅助数据通用）
   */
  async load<T>(key: string): Promise<T | undefined> {
    try {
      const value = (await this.storage.load(key)) as T | undefined;
      this.storageReadErrors.delete(key);
      return value;
    } catch (error) {
      this.noteStorageReadError(key, error);
      throw error;
    }
  }

  /**
   * 统一写入门控（Tier1 / Tier2 / 辅助数据通用），全量入 queueStorageWrite 与 saves.runLatest
   */
  async save<T>(key: string, value: T | null, reentryToken?: symbol): Promise<void> {
    if (this.storageReadErrors.has(key)) {
      throw new Error(`存储数据 [${key}] 读取失败，已暂停覆盖写入；请重载思源后重试。`);
    }
    this.assertStorageWritable();
    await this.queueStorageWrite(key, () => this.saves.runLatest(key, () => this.storage.save(key, value)), reentryToken);
    for (const listener of this.saveListeners) {
      try {
        listener(key);
      } catch {
        /* ignore listener errors */
      }
    }
  }

  /**
   * UI 与辅助数据统一经由同一读写门控读取
   */
  async loadAux<T>(key: string): Promise<T | undefined> {
    return this.load<T>(key);
  }

  /**
   * UI 与辅助数据统一经由同一读写门控写入
   */
  async saveAux<T>(key: string, value: T | null, reentryToken?: symbol): Promise<void> {
    return this.save<T>(key, value, reentryToken);
  }

  /**
   * 创建受网关全量治理的 StorageAdapter（供 AttemptLog 等子系统接入，确保写操作 100% 纳入网关锁与排空）
   */
  createAdapter(): StorageAdapter {
    return {
      load: async (key: string) => this.load(key),
      save: async (key: string, value: unknown) => this.save(key, value),
    };
  }

  /**
   * 将同一键的读改写操作排队；失败不会阻塞后续重试，也不会让旧快照覆盖新快照。
   * 仅当显式传入与当前在途写锁一致的 reentryToken 时才允许同上下文重入（防死锁同时严防并发绕过队列）。
   */
  queueStorageWrite(
    key: string,
    fn: (reentryToken: symbol) => Promise<void>,
    reentryToken?: symbol,
  ): Promise<void> {
    if (reentryToken !== undefined && this.activeTokens.get(key) === reentryToken) {
      return fn(reentryToken);
    }
    const token = Symbol(key);
    const prev = this.storageWriteTails.get(key) ?? Promise.resolve();
    const next = prev.catch(() => undefined).then(async () => {
      this.activeTokens.set(key, token);
      try {
        await fn(token);
      } finally {
        if (this.activeTokens.get(key) === token) {
          this.activeTokens.delete(key);
        }
      }
    });
    this.storageWriteTails.set(key, next);
    const cleanup = () => {
      if (this.storageWriteTails.get(key) === next) {
        this.storageWriteTails.delete(key);
      }
    };
    void next.then(cleanup, cleanup);
    return next;
  }

  /**
   * 获取当前所有在途写入的键列表
   */
  getActiveWriteKeys(): string[] {
    return [...this.storageWriteTails.keys()];
  }

  /**
   * flush: 必须使用 Promise.allSettled 循环全排空慢链/失败链/并发新写且限轮显式报错
   */
  async flush(maxRounds = 10, timeoutMs = 15_000): Promise<void> {
    const startTime = Date.now();
    let round = 0;
    const errors: { key: string; reason: unknown }[] = [];

    while (this.storageWriteTails.size > 0) {
      round++;
      if (round > maxRounds) {
        const remaining = [...this.storageWriteTails.keys()].join(", ");
        throw new Error(`[StorageGateway] flush 超出最大排空轮次限制 (${maxRounds})，残留写入键: ${remaining}`);
      }
      if (Date.now() - startTime > timeoutMs) {
        const remaining = [...this.storageWriteTails.keys()].join(", ");
        throw new Error(`[StorageGateway] flush 超过超时上限 (${timeoutMs}ms)，残留写入键: ${remaining}`);
      }

      // 获取当前轮次的所有在途 Promise 快照
      const entries = [...this.storageWriteTails.entries()];
      const promises = entries.map(([, p]) => p);
      const results = await Promise.allSettled(promises);

      for (let i = 0; i < results.length; i++) {
        const res = results[i];
        if (res.status === "rejected") {
          errors.push({ key: entries[i][0], reason: res.reason });
        }
      }
      // 循环会在下一次判断 this.storageWriteTails.size === 0 时终止；
      // 如果写入期间并发触发了新的 queueStorageWrite，将在下一轮继续循环排空！
    }

    if (errors.length > 0) {
      const summary = errors.map((e) => `${e.key}: ${String((e.reason as Error)?.message || e.reason)}`).join("; ");
      console.warn(`[StorageGateway] flush 排空完成，但检测到 ${errors.length} 项写链异常: ${summary}`);
    }
  }
}
