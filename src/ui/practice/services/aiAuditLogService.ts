// ============================================================
// AI 任务本地审计日志与多轮追问历史持久化服务（aiAuditLogService.ts）
// 承接 AI 调用 payload 留存审计、会话多轮对话历史持久化
// 纯逻辑解耦，不绑定 Svelte 渲染态
// ============================================================

import type { AiMessage } from "@/ai/client";

export const AI_TASK_LOG_KEY = "ai/task-log";
export const AI_EXPLAIN_HISTORY_KEY = "ai/explain-history";

export interface AiTaskLogEntry {
  at: number;
  templateId: string;
  qid: string;
  status: string;
  tokens: number;
  messages: AiMessage[];
}

export interface TaskLogInput {
  templateId: string;
  qid: string;
  status: string;
  tokens: number;
  messages: AiMessage[];
}

/**
 * 记录单次 AI 调用 payload（留存最近 20 条用于审计）
 */
export async function recordAiAuditTask(app: any, entry: TaskLogInput): Promise<void> {
  if (!app) return;
  try {
    const raw = (await app.loadAux(AI_TASK_LOG_KEY)) as AiTaskLogEntry[] | undefined;
    const log = Array.isArray(raw) ? raw : [];
    log.push({ ...entry, at: Date.now() });
    await app.saveAux(AI_TASK_LOG_KEY, log.slice(-20));
  } catch {
    // 审计日志失败不影响任务执行本身
  }
}

/**
 * 读取已保存的本地 AI 审计调用记录
 */
export async function loadAiAuditTaskLogs(app: any): Promise<AiTaskLogEntry[]> {
  if (!app) return [];
  try {
    const raw = (await app.loadAux(AI_TASK_LOG_KEY)) as AiTaskLogEntry[] | undefined;
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

/**
 * 保存多轮追问历史记录（仅保留最近 10 题）
 */
export async function saveExplainConversationHistory(
  app: any,
  history: Record<string, AiMessage[]>,
): Promise<void> {
  if (!app) return;
  const entries = Object.entries(history).slice(-10);
  await app.saveAux(AI_EXPLAIN_HISTORY_KEY, Object.fromEntries(entries));
}

/**
 * 读取已持久化的多轮追问历史记录
 */
export async function loadExplainConversationHistory(
  app: any,
): Promise<Record<string, AiMessage[]>> {
  if (!app) return {};
  try {
    const v = (await app.loadAux(AI_EXPLAIN_HISTORY_KEY)) as Record<string, AiMessage[]> | undefined;
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}
