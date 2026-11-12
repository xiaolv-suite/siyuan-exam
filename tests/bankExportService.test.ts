import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  downloadBlobFile,
  exportCheatSheet,
  exportItemQualityReport,
  exportGiftFormat,
  exportAnkiFormat,
  exportMdDocFormat,
  exportSyllabusAudit,
  printWrongSheet,
  executeBankExportAction,
  exportHealthCsvFile,
  exportBankQuestionsCsvFile,
} from "@/ui/practice/services/bankExportService";
import type { ExamApp } from "@/app";
import type { Question } from "@/core/types";

describe("题库数据与试卷导出服务 (bankExportService)", () => {
  let createdElement: any;
  let createObjectURLMock: any;
  let revokeObjectURLMock: any;

  beforeEach(() => {
    createdElement = {
      href: "",
      download: "",
      click: vi.fn(),
    };
    createObjectURLMock = vi.fn().mockReturnValue("blob:mock-url");
    revokeObjectURLMock = vi.fn();

    vi.stubGlobal("document", {
      createElement: vi.fn().mockReturnValue(createdElement),
    });

    (globalThis.URL as any).createObjectURL = createObjectURLMock;
    (globalThis.URL as any).revokeObjectURL = revokeObjectURLMock;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("1. downloadBlobFile：模拟创建 ObjectURL 与 a.click 下载", () => {
    vi.useFakeTimers();
    downloadBlobFile("hello world", "test.txt", "text/plain");

    expect(createObjectURLMock).toHaveBeenCalled();
    expect(createdElement.click).toHaveBeenCalled();
    vi.runAllTimers();
    expect(revokeObjectURLMock).toHaveBeenCalledWith("blob:mock-url");
    vi.useRealTimers();
  });

  it("2. exportCheatSheet 与 exportItemQualityReport 正常导出并提示成功", async () => {
    const mockApp = {
      exportCramCheatSheetMarkdown: vi.fn().mockResolvedValue("# 急救小抄"),
      exportItemQualityAuditMarkdown: vi.fn().mockResolvedValue("# CTT 报告"),
    } as unknown as ExamApp;

    const msgs: string[] = [];
    const showMessage = (msg: string) => msgs.push(msg);

    await exportCheatSheet(mockApp, "bank-1", showMessage);
    expect(mockApp.exportCramCheatSheetMarkdown).toHaveBeenCalledWith("bank-1");
    expect(msgs).toContain("考前急救小抄已导出 ✓");

    await exportItemQualityReport(mockApp, "bank-1", showMessage);
    expect(mockApp.exportItemQualityAuditMarkdown).toHaveBeenCalledWith("bank-1");
    expect(msgs).toContain("试题质量 CTT 诊断报告已导出 ✓");
  });

  it("3. exportGiftFormat / exportAnkiFormat / exportMdDocFormat / exportSyllabusAudit 正常流转", async () => {
    const mockApp = {
      exportQuestionsToGift: vi.fn().mockResolvedValue("GIFT content"),
      exportQuestionsToAnkiTsv: vi.fn().mockResolvedValue("Anki TSV"),
      exportQuestionsToExamDocMarkdown: vi.fn().mockResolvedValue("MD content"),
      exportSyllabusAuditMarkdown: vi.fn().mockResolvedValue("Audit MD"),
    } as unknown as ExamApp;

    const msgs: string[] = [];
    const showMessage = (msg: string) => msgs.push(msg);

    await exportGiftFormat(mockApp, "bank-1", "演示题库", showMessage);
    expect(msgs).toContain("已导出为 GIFT 格式 ✓");

    await exportAnkiFormat(mockApp, "bank-1", "演示题库", showMessage);
    expect(msgs).toContain("已导出为 Anki 卡包 TSV ✓");

    await exportMdDocFormat(mockApp, "bank-1", "演示题库", showMessage);
    expect(msgs).toContain("已导出为 Markdown 题册 ✓");

    await exportSyllabusAudit(mockApp, "bank-1", showMessage);
    expect(msgs).toContain("考纲出题缺口报告已导出 ✓");
  });

  it("4. printWrongSheet：错题集为空时提示，非空时正常唤起窗口或回退下载", async () => {
    const msgs: string[] = [];
    const showMessage = (msg: string) => msgs.push(msg);

    // 1. 无匹配错题
    await printWrongSheet({
      type: "question",
      activeBankId: "bank-1",
      bankName: "高中数学",
      wrongQids: ["q-999"],
      allQuestions: [],
      showMessage,
    });
    expect(msgs).toContain("当前筛选条件下无可用题目");

    // 2. 匹配错题成功，窗口打开
    const fakeQuestion: Question = {
      id: "q-1",
      type: "single",
      stem: "题目内容",
      options: ["A", "B"],
      answer: "A",
      status: "published",
      origin: "manual",
      hash: "h-1",
    };

    const mockWin = {
      document: {
        open: vi.fn(),
        write: vi.fn(),
        close: vi.fn(),
      },
      focus: vi.fn(),
    };
    vi.stubGlobal("window", {
      open: vi.fn().mockReturnValue(mockWin),
    });

    await printWrongSheet({
      type: "question",
      activeBankId: "bank-1",
      bankName: "高中数学",
      wrongQids: ["q-1"],
      allQuestions: [fakeQuestion],
      showMessage,
    });

    expect(mockWin.document.write).toHaveBeenCalled();
    expect(mockWin.document.close).toHaveBeenCalled();
    expect(mockWin.focus).toHaveBeenCalled();
  });

  it("5. executeBankExportAction：统一动作分发器正确调用各子导出", async () => {
    const msgs: string[] = [];
    const showMessage = (msg: string) => msgs.push(msg);
    const mockApp = {
      exportQuestionsToGift: vi.fn().mockResolvedValue("GIFT_DATA"),
      exportQuestionsToAnkiTsv: vi.fn().mockResolvedValue("ANKI_DATA"),
    } as unknown as ExamApp;

    await executeBankExportAction("gift", mockApp, "b1", "题库", showMessage);
    expect(msgs).toContain("已导出为 GIFT 格式 ✓");

    await executeBankExportAction("anki", mockApp, "b1", "题库", showMessage);
    expect(msgs).toContain("已导出为 Anki 卡包 TSV ✓");
  });

  it("6. exportHealthCsvFile：导出体检清单 CSV", () => {
    const dummyHealth: any = {
      total: 10,
      types: { single: 10 },
      orphans: [],
      kpCoverage: 0.8,
    };
    expect(() => exportHealthCsvFile(dummyHealth)).not.toThrow();
    expect(createObjectURLMock).toHaveBeenCalled();
  });

  it("7. exportBankQuestionsCsvFile：导出题库全量题目 CSV", () => {
    const qs = [{ id: "q-1", stem: "题1", type: "single", options: ["A"], answer: "A" }] as any;
    expect(() => exportBankQuestionsCsvFile(qs, "高数")).not.toThrow();
    expect(createObjectURLMock).toHaveBeenCalled();
  });
});
