import type { ExamApp } from "@/app";
import type { MessageReporter } from "./printPaperService";

export interface ExportWrongbookOptions {
  kpRoot?: string;
  reason?: string;
  sinceDays?: number;
}

/**
 * 将错题册导出为思源笔记 Markdown 文档
 */
export async function exportWrongbookToDoc(
  app: ExamApp,
  bankId: string,
  bankName: string,
  options: ExportWrongbookOptions,
  showMessage: MessageReporter,
  offline: boolean,
  t: (k: string) => string,
): Promise<string | null> {
  if (!bankId) return null;
  try {
    const docId = await app.exportWrongbook(bankId, bankName, options);
    showMessage(t("export.done"), 3600, "info");
    return docId;
  } catch (e) {
    showMessage(offline ? t("state.offlineHint") : String(e instanceof Error ? e.message : e), 4200, "error");
    return null;
  }
}

/**
 * 将整个题库同步到本地思源笔记文档
 */
export async function syncBankQuestionsToDoc(
  app: ExamApp,
  bankId: string,
  bankName: string,
  showMessage: MessageReporter,
  t: (k: string) => string,
): Promise<{
  overviewDocId?: string;
  bankDocId?: string;
  wrongbookDocId?: string;
  actionJournalDocId?: string;
  flashcardCount?: number;
} | null> {
  try {
    const res = await app.syncBankToLocalDocs(bankId, bankName);
    showMessage(t("sync.docsDone"), 3600, "info");
    return res ?? null;
  } catch (e) {
    showMessage(String(e instanceof Error ? e.message : e), 4200, "error");
    return null;
  }
}

export interface TodayReportParams {
  bankName: string;
  todayDone: number;
  dailyGoal: number;
  goalPct: number;
  streakDays: number;
  wrongCount: number;
  eliminatedCount: number;
  clearPct: number;
  planAdvice?: string;
}

/**
 * 构建今日打卡报告 Markdown 文本
 */
export function buildTodayStudyReportMarkdown(params: TodayReportParams): string {
  const d = new Date();
  const todayStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const lines = [
    `### 📅 小驴考试 · 今日备考打卡`,
    `- **学习日期**：${todayStr}`,
    `- **当前题库**：${params.bankName || "默认题库"}`,
    `- **今日作答**：**${params.todayDone} 题**（今日目标：${params.dailyGoal} 题 · 达成率 ${params.goalPct}%）`,
    `- **连续学习**：🔥 **${params.streakDays} 天连胜**`,
    `- **错题动态**：当前在册错题 ${params.wrongCount} 道 · 累计消灭 ${params.eliminatedCount} 道（消灭率 ${params.clearPct}%）`,
  ];
  if (params.planAdvice) {
    lines.push(`- **备考建议**：${params.planAdvice}`);
  }
  lines.push(`\n> 坚持就是胜利，每天进步一点点！💪`);
  return lines.join("\n");
}

/**
 * 复制今日学习报告 Markdown 到剪贴板
 */
export async function copyTodayStudyReport(
  params: TodayReportParams,
  showMessage: MessageReporter,
  t: (k: string) => string,
): Promise<void> {
  try {
    const md = buildTodayStudyReportMarkdown(params);
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(md);
      showMessage(t("entry.reportCopied"), 3200, "info");
    } else {
      showMessage(t("mock.summaryCopyFailed"), 3200, "error");
    }
  } catch {
    showMessage(t("mock.summaryCopyFailed"), 3200, "error");
  }
}

/**
 * 提取题库考点一级根分类（去重过滤空值）
 */
export function extractKpRoots(questions: Array<{ kp?: string }>): string[] {
  return [...new Set(questions.map((q) => q.kp?.split("/")[0]).filter(Boolean))] as string[];
}

