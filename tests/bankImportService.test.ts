import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  downloadImportTemplate,
  exportImportErrorsCsv,
  exportBankPackageZip,
  readClipboardImportText,
  makeFileEventProxy,
  executeTrialImport,
} from "@/ui/practice/services/bankImportService";
import type { ExamApp } from "@/app";
import type { ImportReport } from "@/importer/pipeline";

describe("题库导入与模板分享服务 (bankImportService)", () => {
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

  it("1. downloadImportTemplate：生成 Excel 导入模板并触发下载", async () => {
    await downloadImportTemplate();
    expect(createObjectURLMock).toHaveBeenCalled();
    expect(createdElement.click).toHaveBeenCalled();
  });

  it("2. exportImportErrorsCsv：空错误不触发下载，有错误时带 BOM 头导出", () => {
    // 1. 无错误
    exportImportErrorsCsv(null);
    expect(createdElement.click).not.toHaveBeenCalled();

    // 2. 有错误
    const report: ImportReport = {
      imported: 0,
      total: 1,
      errors: [{ row: 2, reason: "题干不能为空", raw: "xxx" }],
      skippedDuplicates: 0,
    };
    exportImportErrorsCsv(report);
    expect(createObjectURLMock).toHaveBeenCalled();
    expect(createdElement.click).toHaveBeenCalled();
    expect(createdElement.download).toContain("导入错误清单");
  });

  it("3. exportBankPackageZip：导出题库包成功与失败异常处理", async () => {
    const msgs: string[] = [];
    const showMessage = (m: string) => msgs.push(m);
    const t = (k: string) => `[${k}]`;

    // 1. 成功导出
    const mockApp = {
      exportBankSyZip: vi.fn().mockResolvedValue({
        zipPath: "/temp/bank.sy.zip",
        filename: "bank.sy.zip",
      }),
    } as unknown as ExamApp;

    await exportBankPackageZip(mockApp, "b1", showMessage, false, t);
    expect(mockApp.exportBankSyZip).toHaveBeenCalledWith("b1");
    expect(msgs[0]).toContain("[share.exportDone]bank.sy.zip");

    // 2. 导出失败
    const failApp = {
      exportBankSyZip: vi.fn().mockRejectedValue(new Error("网络故障")),
    } as unknown as ExamApp;
    await exportBankPackageZip(failApp, "b1", showMessage, false, t);
    expect(msgs[1]).toContain("网络故障");
  });

  it("4. readClipboardImportText：读取剪贴板文本与异常提示", async () => {
    const msgs: string[] = [];
    const showMessage = (m: string) => msgs.push(m);
    const t = (k: string) => `[${k}]`;

    // 1. 成功读取有效文本
    vi.stubGlobal("navigator", {
      clipboard: {
        readText: vi.fn().mockResolvedValue("题目1\nA. 选项1\n答案：A"),
      },
    });

    const text = await readClipboardImportText(showMessage, t);
    expect(text).toContain("题目1");
    expect(msgs).toContain("[import.clipboardPasted]");

    // 2. 读取空文本
    vi.stubGlobal("navigator", {
      clipboard: {
        readText: vi.fn().mockResolvedValue("   "),
      },
    });
    const emptyText = await readClipboardImportText(showMessage, t);
    expect(emptyText).toBeNull();
    expect(msgs).toContain("[import.clipboardEmpty]");
  });

  it("5. makeFileEventProxy：构造伪 input 事件对象", () => {
    const file = new File(["test"], "test.csv", { type: "text/csv" });
    const proxy = makeFileEventProxy(file);
    expect(proxy.target.files).toEqual([file]);
    expect(proxy.target.value).toBe("");
  });

  it("6. filterUnconfirmedQuestions、buildTrialImportReport 与 formatTrialReadbackNote", async () => {
    const { filterUnconfirmedQuestions, buildTrialImportReport, formatTrialReadbackNote } =
      await import("@/ui/practice/services/bankImportService");
    const t = (k: string) => `[${k}]`;

    const qs = [
      { id: "q-1", stem: "题1" },
      { id: "q-2", stem: "题2" },
      { id: "q-3", stem: "题3" },
    ] as any;

    const unconfirmed = filterUnconfirmedQuestions(qs, ["q-1"]);
    expect(unconfirmed).toEqual([{ id: "q-2", stem: "题2" }, { id: "q-3", stem: "题3" }]);

    const trial = buildTrialImportReport(unconfirmed, "batch-1", 1);
    expect(trial.ok).toEqual([{ id: "q-2", stem: "题2" }]);
    expect(trial.batch).toBe("batch-1-t5");

    const verifiedNote = formatTrialReadbackNote(2, 0, true, t);
    expect(verifiedNote).toBe("[import.trialDone]");

    const unverifiedNote = formatTrialReadbackNote(0, 2, false, t);
    expect(unverifiedNote).toBe("[import.readbackUnknown]");
  });

  it("7. resolveDroppedFileType：文件后缀拖拽分流识别", async () => {
    const { resolveDroppedFileType } = await import("@/ui/practice/services/bankImportService");
    expect(resolveDroppedFileType("math.xlsx")).toBe("excel");
    expect(resolveDroppedFileType("data.xls")).toBe("excel");
    expect(resolveDroppedFileType("questions.csv")).toBe("excel");
    expect(resolveDroppedFileType("bank.sy.zip")).toBe("zip");
    expect(resolveDroppedFileType("archive.zip")).toBe("zip");
    expect(resolveDroppedFileType("doc.pdf")).toBe("unsupported");
  });

  it("8. importBankFromSyZipFile：题库包上传与解析消息生成", async () => {
    const { importBankFromSyZipFile } = await import("@/ui/practice/services/bankImportService");
    const t = (k: string) => `[${k}]`;
    const mockApp = {
      importBankSyZip: vi.fn().mockResolvedValue({ registered: ["高考数学", "物理实验"] }),
    };

    const file = new File(["zip"], "bank.sy.zip");
    const res = await importBankFromSyZipFile(mockApp, file, t);
    expect(res.registered).toEqual(["高考数学", "物理实验"]);
    expect(res.message).toBe("[share.importRegistered]");
  });

  it("9. processImportDrawerDrop：导入抽屉文件拖拽类型解析与文本读取", async () => {
    const { processImportDrawerDrop } = await import("@/ui/practice/services/bankImportService");

    // 1. Excel 文件分流
    const xlsxFile = new File(["dummy"], "questions.xlsx");
    const res1 = await processImportDrawerDrop(xlsxFile);
    expect(res1.kind).toBe("excel");

    // 2. 文本类文件读取
    const txtFile = new File(["题目内容"], "test.md");
    const res2 = await processImportDrawerDrop(txtFile);
    expect(res2.kind).toBe("text");
    if (res2.kind === "text") {
      expect(res2.text).toBe("题目内容");
    }

    // 3. 不支持的文件类型
    const imgFile = new File(["img"], "image.png");
    const res3 = await processImportDrawerDrop(imgFile);
    expect(res3.kind).toBe("unsupported");
  });

  it("10. resolveGlobalTabDropAction：全局拖拽路由判定", async () => {
    const { resolveGlobalTabDropAction } = await import("@/ui/practice/services/bankImportService");
    const excelFile = new File([""], "exam.xlsx");
    const zipFile = new File([""], "bank.sy.zip");
    const pdfFile = new File([""], "paper.pdf");

    // 1. 无题库但拖入非 zip -> 拦截提示先选/建题库
    const res1 = resolveGlobalTabDropAction("exam.xlsx", excelFile, false);
    expect(res1.action).toBe("need_bank");

    // 2. 无题库但拖入 zip -> 允许导入题库包
    const res2 = resolveGlobalTabDropAction("bank.sy.zip", zipFile, false);
    expect(res2.action).toBe("zip");

    // 3. 有题库拖入 excel
    const res3 = resolveGlobalTabDropAction("exam.xlsx", excelFile, true);
    expect(res3.action).toBe("excel");

    // 4. 有题库拖入不支持类型
    const res4 = resolveGlobalTabDropAction("paper.pdf", pdfFile, true);
    expect(res4.action).toBe("unsupported");
  });

  it("11. executeTrialImport：执行试导前5题并返回确认清单与提示", async () => {
    const t = (k: string) => `[${k}]`;
    const mockApp = {
      commitImport: vi.fn().mockResolvedValue({
        readback: { confirmed: ["q-1", "q-2"], missing: [], verified: true },
      }),
    };
    const remaining = [
      { id: "q-1" },
      { id: "q-2" },
      { id: "q-3" },
    ] as any;

    const res = await executeTrialImport(mockApp, "b-1", remaining, "batch-1", t);
    expect(mockApp.commitImport).toHaveBeenCalled();
    expect(res.confirmedIds).toEqual(["q-1", "q-2"]);
    expect(res.note).toBe("[import.trialDone]");
  });
});
