import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  downloadImportTemplate,
  exportImportErrorsCsv,
  exportBankPackageZip,
  readClipboardImportText,
  makeFileEventProxy,
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
});
