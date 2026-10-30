import type { Question } from "@/core/types";
import type { PrintProOptions } from "@/core/printPro";

export type MessageReporter = (msg: string, timeoutMs?: number, type?: "info" | "error") => void;

/**
 * 试卷打印/导出辅助：优先尝试新窗口唤起打印，遇拦截则优雅回退为 HTML 文件直接下载
 */
export function openOrDownloadHtml(
  html: string,
  downloadFilename: string,
  fallbackMsg: string,
  showMessage: MessageReporter,
): void {
  const win = window.open("", "_blank");
  if (win) {
    win.document.write(html);
    win.document.close();
    win.focus();
  } else {
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = downloadFilename;
    a.click();
    URL.revokeObjectURL(a.href);
    showMessage(fallbackMsg, 3000, "info");
  }
}

/**
 * 生成题库标准双栏试卷 (exam-zh 规范：默认带密封线与考生须知)
 */
export async function printBankDoubleColumnPaper(
  bankName: string,
  questions: Question[],
  showMessage: MessageReporter,
  customOptions: Partial<PrintProOptions> = {},
): Promise<void> {
  if (!questions.length) return;
  try {
    const { buildCompactQuestionSheetPro } = await import("@/core/printPro");
    const html = buildCompactQuestionSheetPro(`${bankName || "题库"} · 教学测试卷`, questions, {
      headerTitle: `${bankName || "题库"} · 标准试卷`,
      paperSize: "A4",
      columns: "double",
      showSealLine: customOptions.showSealLine ?? true,
      showExamNotice: customOptions.showExamNotice ?? true,
      ...customOptions,
    });
    openOrDownloadHtml(html, `${bankName || "题库"}-标准双栏试卷.html`, "已生成标准双栏试卷文件", showMessage);
  } catch (e) {
    showMessage(`打印双栏试卷失败：${String(e instanceof Error ? e.message : e)}`, 4000, "error");
  }
}

/**
 * 生成题库教师讲义教案卷
 */
export async function exportBankTeacherPaper(
  bankName: string,
  questions: Question[],
  showMessage: MessageReporter,
  customOptions: Partial<PrintProOptions> = {},
): Promise<void> {
  if (!questions.length) return;
  try {
    const { buildTeacherLectureSheetPro } = await import("@/core/printPro");
    const html = buildTeacherLectureSheetPro(`${bankName || "题库"}`, questions, {
      paperSize: "A4",
      columns: "double",
      groupByKp: true,
      ...customOptions,
    });
    openOrDownloadHtml(html, `${bankName || "题库"}-教师讲义教案卷.html`, "已生成教师讲义教案卷文件", showMessage);
  } catch (e) {
    showMessage(`导出教师讲义失败：${String(e instanceof Error ? e.message : e)}`, 4000, "error");
  }
}

/**
 * 生成题库学生课后作业导学单
 */
export async function printBankHomeworkSheet(
  bankName: string,
  questions: Question[],
  showMessage: MessageReporter,
  customOptions: Partial<PrintProOptions> = {},
): Promise<void> {
  if (!questions.length) return;
  try {
    const { buildStudentHomeworkSheetPro } = await import("@/core/printPro");
    const html = buildStudentHomeworkSheetPro(`${bankName || "题库"}`, questions, {
      paperSize: "A4",
      columns: "double",
      groupByKp: true,
      ...customOptions,
    });
    openOrDownloadHtml(html, `${bankName || "题库"}-课后作业导学单.html`, "已生成课后作业导学单文件", showMessage);
  } catch (e) {
    showMessage(`打印作业导学单失败：${String(e instanceof Error ? e.message : e)}`, 4000, "error");
  }
}

/**
 * 打印勾选精选题卷 (exam-zh 规范)
 */
export async function printSelectedQuestionsPaper(
  bankName: string,
  targetQuestions: Question[],
  showMessage: MessageReporter,
  customOptions: Partial<PrintProOptions> = {},
): Promise<void> {
  if (!targetQuestions.length) return;
  try {
    const { buildCompactQuestionSheetPro } = await import("@/core/printPro");
    const html = buildCompactQuestionSheetPro(`${bankName || "题库"} · 勾选精选题卷`, targetQuestions, {
      headerTitle: `${bankName || "题库"} · 精选练习`,
      columns: "double",
      groupByKp: true,
      showSealLine: customOptions.showSealLine ?? true,
      showExamNotice: customOptions.showExamNotice ?? true,
      ...customOptions,
    });
    openOrDownloadHtml(html, `${bankName || "题库"}-精选题卷.html`, "已生成勾选题排版试卷文件", showMessage);
  } catch (e) {
    showMessage(`打印勾选题失败：${String(e instanceof Error ? e.message : e)}`, 4000, "error");
  }
}

/**
 * 打印勾选题备课讲义
 */
export async function printSelectedTeacherPaper(
  bankName: string,
  targetQuestions: Question[],
  showMessage: MessageReporter,
): Promise<void> {
  if (!targetQuestions.length) return;
  try {
    const { buildTeacherLectureSheetPro } = await import("@/core/printPro");
    const html = buildTeacherLectureSheetPro(`${bankName || "题库"} · 勾选题备课讲义`, targetQuestions, {
      paperSize: "A4",
      columns: "double",
      groupByKp: true,
    });
    openOrDownloadHtml(html, `${bankName || "题库"}-勾选题备课讲义.html`, "已生成勾选题教师讲义教案文件", showMessage);
  } catch (e) {
    showMessage(`导出勾选题讲义失败：${String(e instanceof Error ? e.message : e)}`, 4000, "error");
  }
}

/**
 * 打印勾选题分层作业单
 */
export async function printSelectedHomeworkSheet(
  bankName: string,
  targetQuestions: Question[],
  showMessage: MessageReporter,
): Promise<void> {
  if (!targetQuestions.length) return;
  try {
    const { buildStudentHomeworkSheetPro } = await import("@/core/printPro");
    const html = buildStudentHomeworkSheetPro(`${bankName || "题库"} · 勾选题分层作业单`, targetQuestions, {
      paperSize: "A4",
      columns: "double",
      groupByKp: true,
    });
    openOrDownloadHtml(html, `${bankName || "题库"}-课后作业单.html`, "已生成勾选题课后分层作业单", showMessage);
  } catch (e) {
    showMessage(`导出作业单失败：${String(e instanceof Error ? e.message : e)}`, 4000, "error");
  }
}

/**
 * 根据多选勾选状态过滤出试题数组
 */
export function filterSelectedQuestions(
  questions: Question[],
  selectedIds: Record<string, boolean>,
): Question[] {
  const ids = new Set(Object.keys(selectedIds).filter((id) => selectedIds[id]));
  return questions.filter((q) => ids.has(q.id));
}
