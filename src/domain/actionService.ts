import type { ActionItem, ActionKind } from "../core/actions";
import { appendActions, openActions, completeAction, cancelAction } from "../core/actions";
import type { StorageGateway } from "../storage/storageGateway";

export const ACTIONS_KEY = "actions/items";

export interface ActionDomainDeps {
  storageGateway: StorageGateway;
  queueStorageWrite: (key: string, fn: (reentryToken: symbol) => Promise<void>, reentryToken?: symbol) => Promise<void>;
  noteStorageReadError: (key: string, error: unknown) => void;
  now?: () => number;
}

export class ActionDomainService {
  constructor(private deps: ActionDomainDeps) {}

  async loadActions(): Promise<ActionItem[]> {
    try {
      const v = await this.deps.storageGateway.load<ActionItem[]>(ACTIONS_KEY);
      return Array.isArray(v) ? (v as ActionItem[]) : [];
    } catch (error) {
      this.deps.noteStorageReadError(ACTIONS_KEY, error);
      throw error;
    }
  }

  async saveActions(list: ActionItem[], reentryToken?: symbol): Promise<void> {
    await this.deps.storageGateway.save(ACTIONS_KEY, list, reentryToken);
  }

  async addActions(
    drafts: { kind: ActionKind; qid?: string; sessionId?: string; detail: string }[],
  ): Promise<{ added: number; skipped: number }> {
    let result = { added: 0, skipped: 0 };
    await this.deps.queueStorageWrite(ACTIONS_KEY, async (token) => {
      const list = await this.loadActions();
      const r = appendActions(list, drafts, this.deps.now?.() ?? Date.now());
      result = { added: r.added, skipped: r.skipped };
      if (r.added) await this.saveActions(r.list, token);
    });
    return result;
  }

  async listOpenActions(): Promise<ActionItem[]> {
    return openActions(await this.loadActions());
  }

  async completeAction(id: string, evidence = "user-confirmed"): Promise<void> {
    await this.deps.queueStorageWrite(ACTIONS_KEY, async (token) => {
      const list = await this.loadActions();
      await this.saveActions(completeAction(list, id, evidence, this.deps.now?.() ?? Date.now()), token);
    });
  }

  async cancelAction(id: string): Promise<void> {
    await this.deps.queueStorageWrite(ACTIONS_KEY, async (token) => {
      const list = await this.loadActions();
      await this.saveActions(cancelAction(list, id, this.deps.now?.() ?? Date.now()), token);
    });
  }
}
