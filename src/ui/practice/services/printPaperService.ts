import type { Question } from "@/core/types";
import type { PrintProOptions } from "@/core/printPro";

export type MessageReporter = (msg: string, timeoutMs?: number, type?: "info" | "error") => void;

export type PrintPaperFormat = "exam" | "card" | "answer" | "lecture" | "homework" | "interactive";

/**
 * 按选定卷面版式（标准测试卷 / 标准答题卡 / 独立答案册 / 授课讲义卷 / 留白作业单 / 交互式讲题自测卷）生成 HTML 并打开或回退下载
 */
export async function printQuestionsByFormat(
  format: PrintPaperFormat,
  bankName: string,
  targetQuestions: Question[],
  showMessage: MessageReporter,
  customOptions: Partial<PrintProOptions> = {},
): Promise<void> {
  if (!targetQuestions.length) return;
  const label = bankName || "题库";
  try {
    const {
      buildCompactQuestionSheetPro,
      buildCompactAnswerSheetPro,
      buildTeacherLectureSheetPro,
      buildStudentHomeworkSheetPro,
      buildInteractiveReviewSheetPro,
      buildStandardAnswerCardPro,
    } = await import("@/core/printPro");

    if (format === "card") {
      const html = buildStandardAnswerCardPro(`${label} · 标准答题卡`, targetQuestions, {
        paperSize: "A4",
        columns: "double",
        ...customOptions,
      });
      openOrDownloadHtml(html, `${label}-标准答题卡.html`, "已生成标准答题卡文件", showMessage);
      return;
    }

    if (format === "interactive") {
      const html = buildInteractiveReviewSheetPro(`${label} · 交互式讲题自测卷`, targetQuestions, customOptions);
      openOrDownloadHtml(html, `${label}-交互式讲题自测卷.html`, "已生成交互式讲题自测卷文件", showMessage);
      return;
    }

    if (format === "answer") {
      const html = buildCompactAnswerSheetPro(`${label} · 独立答案册`, targetQuestions, {
        paperSize: "A4",
        columns: "double",
        ...customOptions,
      });
      openOrDownloadHtml(html, `${label}-独立答案册.html`, "已生成独立答案册文件", showMessage);
      return;
    }
    if (format === "lecture") {
      const html = buildTeacherLectureSheetPro(label, targetQuestions, {
        paperSize: "A4",
        columns: "double",
        groupByKp: true,
        ...customOptions,
      });
      openOrDownloadHtml(html, `${label}-授课讲义卷.html`, "已生成授课讲义卷文件", showMessage);
      return;
    }
    if (format === "homework") {
      const html = buildStudentHomeworkSheetPro(label, targetQuestions, {
        paperSize: "A4",
        columns: "double",
        groupByKp: true,
        ...customOptions,
      });
      openOrDownloadHtml(html, `${label}-留白作业单.html`, "已生成留白作业单文件", showMessage);
      return;
    }
    const html = buildCompactQuestionSheetPro(`${label} · 标准测试卷`, targetQuestions, {
      headerTitle: `${label} · 标准试卷`,
      paperSize: "A4",
      columns: "double",
      groupByKp: true,
      showSealLine: customOptions.showSealLine ?? true,
      showExamNotice: customOptions.showExamNotice ?? true,
      ...customOptions,
    });
    openOrDownloadHtml(html, `${label}-标准测试卷.html`, "已生成标准测试卷文件", showMessage);
  } catch (e) {
    showMessage(`生成打印版式失败：${String(e instanceof Error ? e.message : e)}`, 4000, "error");
  }
}

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
    setTimeout(() => URL.revokeObjectURL(a.href), 0);
    showMessage(fallbackMsg, 3000, "info");
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
 * 根据多选勾选状态过滤出试题数组
 */
export function filterSelectedQuestions(
  questions: Question[],
  selectedIds: Record<string, boolean>,
): Question[] {
  const ids = new Set(Object.keys(selectedIds).filter((id) => selectedIds[id]));
  return questions.filter((q) => ids.has(q.id));
}
