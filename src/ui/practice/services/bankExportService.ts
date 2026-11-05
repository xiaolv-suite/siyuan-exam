import type { Question } from "@/core/types";
import type { ExamApp } from "@/app";
import { exportHealthReportCsv, type BankHealthReport, type OrphanDiagnosis } from "@/core/bankHealth";
import { questionsToCsv } from "@/core/bankCsv";
import type { MessageReporter } from "./printPaperService";

/**
 * 通用文本/二进制内容下载辅助函数
 */
export function downloadBlobFile(content: string, filename: string, mimeType: string): void {
  if (typeof document === "undefined" || typeof URL === "undefined") return;
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * 导出考前高频错题急救小抄 Markdown
 */
export async function exportCheatSheet(
  app: ExamApp,
  activeBankId: string,
  showMessage: MessageReporter,
): Promise<void> {
  if (!activeBankId || !app) return;
  try {
    const md = await app.exportCramCheatSheetMarkdown(activeBankId);
    downloadBlobFile(
      md,
      `考前核心高频错题急救小抄-${new Date().toISOString().slice(0, 10)}.md`,
      "text/markdown;charset=utf-8;",
    );
    showMessage("考前急救小抄已导出 ✓", 3000, "info");
  } catch (e) {
    showMessage(String(e instanceof Error ? e.message : e), 4000, "error");
  }
}

/**
 * 导出试题质量 CTT 与干扰项诊断报告 Markdown
 */
export async function exportItemQualityReport(
  app: ExamApp,
  activeBankId: string,
  showMessage: MessageReporter,
): Promise<void> {
  if (!activeBankId || !app) return;
  try {
    const md = await app.exportItemQualityAuditMarkdown(activeBankId);
    downloadBlobFile(
      md,
      `题库试题质量CTT与干扰项诊断报告-${new Date().toISOString().slice(0, 10)}.md`,
      "text/markdown;charset=utf-8;",
    );
    showMessage("试题质量 CTT 诊断报告已导出 ✓", 3000, "info");
  } catch (e) {
    showMessage(String(e instanceof Error ? e.message : e), 4000, "error");
  }
}

/**
 * 导出题库为标准 GIFT 格式
 */
export async function exportGiftFormat(
  app: ExamApp,
  activeBankId: string,
  bankName: string,
  showMessage: MessageReporter,
): Promise<void> {
  if (!activeBankId || !app) return;
  try {
    const text = await app.exportQuestionsToGift(activeBankId);
    downloadBlobFile(text, `${bankName || "题库"}.gift.txt`, "text/plain;charset=utf-8;");
    showMessage("已导出为 GIFT 格式 ✓", 3000, "info");
  } catch (e) {
    showMessage(String(e instanceof Error ? e.message : e), 4000, "error");
  }
}

/**
 * 导出题库为 Anki 卡包 TSV 格式
 */
export async function exportAnkiFormat(
  app: ExamApp,
  activeBankId: string,
  bankName: string,
  showMessage: MessageReporter,
): Promise<void> {
  if (!activeBankId || !app) return;
  try {
    const text = await app.exportQuestionsToAnkiTsv(activeBankId);
    downloadBlobFile(text, `${bankName || "题库"}.anki.tsv`, "text/tab-separated-values;charset=utf-8;");
    showMessage("已导出为 Anki 卡包 TSV ✓", 3000, "info");
  } catch (e) {
    showMessage(String(e instanceof Error ? e.message : e), 4000, "error");
  }
}

/**
 * 导出题库为 Markdown 题册手册
 */
export async function exportMdDocFormat(
  app: ExamApp,
  activeBankId: string,
  bankName: string,
  showMessage: MessageReporter,
): Promise<void> {
  if (!activeBankId || !app) return;
  try {
    const text = await app.exportQuestionsToExamDocMarkdown(activeBankId);
    downloadBlobFile(text, `${bankName || "题库"}-试题精选手册.md`, "text/markdown;charset=utf-8;");
    showMessage("已导出为 Markdown 题册 ✓", 3000, "info");
  } catch (e) {
    showMessage(String(e instanceof Error ? e.message : e), 4000, "error");
  }
}

/**
 * 导出题库为标准 Agent 题卡（QCard JSON）文件
 */
export async function exportQCardsJsonFile(
  bankName: string,
  questions: readonly Question[],
  showMessage: MessageReporter,
): Promise<void> {
  if (!questions.length) return;
  try {
    const { exportQCardsJson } = await import("@/core/qcard");
    const json = exportQCardsJson(bankName, questions);
    downloadBlobFile(
      json,
      `${bankName || "题库"}-Agent题卡.qcard.json`,
      "application/json;charset=utf-8;",
    );
    showMessage(`已导出 ${questions.length} 道标准 Agent 题卡 ✓`, 3000, "info");
  } catch (err) {
    showMessage(String(err instanceof Error ? err.message : err), 4000, "error");
  }
}

/**
 * 导出题库为小驴闪卡（.lvcards）原生分享包格式
 * 严格按照 siyuan-lv-cards 规范 (format: "lvcards.v1") 打包，实现双向零损互通
 */
export async function exportLvCardsPackageFile(
  bankName: string,
  bankId: string,
  questions: readonly Question[],
  showMessage: MessageReporter,
): Promise<void> {
  if (!questions.length) {
    showMessage("题库内暂无试题可导出为闪卡包", 2500, "error");
    return;
  }
  try {
    const { questionsToLvCardsPackage, serializeLvCardsPackage } = await import("@/core/lvcardsBridge");
    const pkg = questionsToLvCardsPackage(
      {
        id: bankId || `bank-${Date.now()}`,
        name: bankName || "小驴题库",
        description: `由小驴考试导出，共 ${questions.length} 道精选题卡。`,
      },
      questions,
    );
    const json = serializeLvCardsPackage(pkg);
    downloadBlobFile(
      json,
      `${bankName || "小驴题库"}.lvcards`,
      "application/json;charset=utf-8;",
    );
    showMessage(`已成功导出 ${questions.length} 张小驴闪卡包 (.lvcards) ✓`, 3000, "info");
  } catch (err) {
    showMessage(String(err instanceof Error ? err.message : err), 4000, "error");
  }
}

/**
 * 导出考纲知识点出题缺口体检报告 Markdown
 */
export async function exportSyllabusAudit(
  app: ExamApp,
  activeBankId: string,
  showMessage: MessageReporter,
): Promise<void> {
  if (!activeBankId || !app) return;
  try {
    const md = await app.exportSyllabusAuditMarkdown(activeBankId);
    downloadBlobFile(
      md,
      `考纲知识点出题缺口体检报告-${new Date().toISOString().slice(0, 10)}.md`,
      "text/markdown;charset=utf-8;",
    );
    showMessage("考纲出题缺口报告已导出 ✓", 3000, "info");
  } catch (e) {
    showMessage(String(e instanceof Error ? e.message : e), 4000, "error");
  }
}

/**
 * 打印/导出错题特训卷（试卷 / 答案册 / 重测卷 / 交互式讲题卷）
 */
export async function printWrongSheet(options: {
  type: "question" | "answer" | "retest" | "interactive";
  activeBankId: string;
  bankName: string;
  wrongQids: string[];
  allQuestions: Question[];
  showMessage: MessageReporter;
}): Promise<void> {
  const { type, activeBankId, bankName, wrongQids, allQuestions, showMessage } = options;
  if (!activeBankId || !wrongQids.length) return;

  try {
    const qs = allQuestions.filter((q) => wrongQids.includes(q.id));
    if (!qs.length) {
      showMessage("当前筛选条件下无可用题目", 3000, "info");
      return;
    }
    const title = `${bankName || "小驴考试"} · 错题攻坚特训卷（共${qs.length}题）`;
    const {
      buildCompactQuestionSheetPro,
      buildCompactAnswerSheetPro,
      buildWrongbookRetestSheetPro,
      buildInteractiveReviewSheetPro,
    } = await import("@/core/printPro");
    const html =
      type === "interactive"
        ? buildInteractiveReviewSheetPro(title, qs)
        : type === "retest"
        ? buildWrongbookRetestSheetPro(title, qs, { headerTitle: "错题清零纯净重测卷 · A4双栏", columns: "double" })
        : type === "question"
        ? buildCompactQuestionSheetPro(title, qs, { headerTitle: "错题攻坚特训卷 · A4双栏", columns: "double" })
        : buildCompactAnswerSheetPro(title, qs, { headerTitle: "错题攻坚详解答案册", columns: "double" });

    const win = typeof window !== "undefined" && typeof window.open === "function" ? window.open("", "_blank") : null;
    if (win) {
      win.document.write(html);
      win.document.close();
      win.focus();
    } else {
      downloadBlobFile(
        html,
        `${title}-${type === "interactive" ? "交互式讲题卷" : type === "retest" ? "错题重测卷" : type === "question" ? "试卷" : "答案册"}.html`,
        "text/html;charset=utf-8",
      );
      showMessage("已生成双栏排版文件", 3000, "info");
    }
  } catch (e) {
    showMessage(`打印生成失败：${String(e instanceof Error ? e.message : e)}`, 4000, "error");
  }
}

export type BankExportActionType =
  | "cheat_sheet"
  | "quality_report"
  | "gift"
  | "anki"
  | "mddoc"
  | "syllabus_audit";

/**
 * 统一题库导出动作执行分发器
 */
export async function executeBankExportAction(
  type: BankExportActionType,
  app: ExamApp,
  activeBankId: string,
  bankName: string,
  showMessage: MessageReporter,
): Promise<void> {
  if (!app || !activeBankId) return;

  switch (type) {
    case "cheat_sheet":
      await exportCheatSheet(app, activeBankId, showMessage);
      break;
    case "quality_report":
      await exportItemQualityReport(app, activeBankId, showMessage);
      break;
    case "gift":
      await exportGiftFormat(app, activeBankId, bankName, showMessage);
      break;
    case "anki":
      await exportAnkiFormat(app, activeBankId, bankName, showMessage);
      break;
    case "mddoc":
      await exportMdDocFormat(app, activeBankId, bankName, showMessage);
      break;
    case "syllabus_audit":
      await exportSyllabusAudit(app, activeBankId, showMessage);
      break;
  }
}

/**
 * 导出题库健康体检清单 CSV 文件
 */
export function exportHealthCsvFile(
  health: BankHealthReport,
  orphanDiag?: OrphanDiagnosis,
): void {
  const csv = exportHealthReportCsv(health, orphanDiag);
  downloadBlobFile(
    csv,
    `题库体检清单-${new Date().toISOString().slice(0, 10)}.csv`,
    "text/csv;charset=utf-8",
  );
}

/**
 * 导出题库全量题目 CSV 文件
 */
export function exportBankQuestionsCsvFile(
  questions: Question[],
  bankName: string,
): void {
  const csv = "\uFEFF" + questionsToCsv(questions);
  downloadBlobFile(
    csv,
    `${bankName || "题库"}-${new Date().toISOString().slice(0, 10)}.csv`,
    "text/csv;charset=utf-8",
  );
}

