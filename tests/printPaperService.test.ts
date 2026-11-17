// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import {
  openOrDownloadHtml,
  filterSelectedQuestions,
  printQuestionsByFormat,
} from "@/ui/practice/services/printPaperService";
import type { Question } from "@/core/types";

describe("试卷印刷与排版导出服务 (printPaperService)", () => {
  const fakeQuestions = [
    { id: "q-1", type: "single", stem: "题1", options: ["甲", "乙"], answer: "A", analysis: "解析1", kp: "考点1" },
    { id: "q-2", type: "single", stem: "题2", options: ["甲", "乙"], answer: "B", analysis: "解析2", kp: "考点1" },
    { id: "q-3", type: "single", stem: "题3", options: ["甲", "乙"], answer: "A", analysis: "解析3", kp: "考点2" },
  ] as Question[];

  it("1. filterSelectedQuestions：根据多选勾选映射精准提取试题", () => {
    const selectedIds = { "q-1": true, "q-3": true, "q-2": false };
    const res = filterSelectedQuestions(fakeQuestions, selectedIds);
    expect(res).toHaveLength(2);
    expect(res.map((x) => x.id)).toEqual(["q-1", "q-3"]);
  });

  it("2. openOrDownloadHtml：窗口拦截时触发文件下载回退", () => {
    vi.spyOn(window, "open").mockReturnValue(null);
    const showMessage = vi.fn();
    const createObjectURLMock = vi.fn().mockReturnValue("blob:test");
    const revokeObjectURLMock = vi.fn();

    vi.stubGlobal("URL", class extends URL {
      static createObjectURL = createObjectURLMock;
      static revokeObjectURL = revokeObjectURLMock;
    });

    vi.useFakeTimers();
    openOrDownloadHtml("<html></html>", "paper.html", "下载已就绪", showMessage);
    expect(showMessage).toHaveBeenCalledWith("下载已就绪", 3000, "info");
    expect(createObjectURLMock).toHaveBeenCalled();
    vi.runAllTimers();
    expect(revokeObjectURLMock).toHaveBeenCalled();
    vi.useRealTimers();

    vi.unstubAllGlobals();
  });

  it("3. printQuestionsByFormat：支持标准测试卷、独立答案册、授课讲义卷与留白作业单四种版式", async () => {
    const written: string[] = [];
    vi.spyOn(window, "open").mockImplementation(() => ({
      document: {
        write: (html: string) => written.push(html),
        close: () => undefined,
      },
      focus: () => undefined,
    }) as unknown as Window);
    const showMessage = vi.fn();

    await printQuestionsByFormat("exam", "示范库", fakeQuestions, showMessage);
    await printQuestionsByFormat("answer", "示范库", fakeQuestions, showMessage);
    await printQuestionsByFormat("lecture", "示范库", fakeQuestions, showMessage);
    await printQuestionsByFormat("homework", "示范库", fakeQuestions, showMessage);

    expect(written).toHaveLength(4);
    expect(written[0]).toContain("标准试卷");
    expect(written[0]).not.toContain("解析1");
    expect(written[1]).toContain("答案册");
    expect(written[2]).toContain("教师授课讲义卷");
    expect(written[2]).toContain("解析1");
    expect(written[3]).toContain("课后作业导学单");
    expect(written[3]).toContain("姓名：___________");

    vi.restoreAllMocks();
  });
});
