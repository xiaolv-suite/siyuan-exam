// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import {
  openOrDownloadHtml,
  filterSelectedQuestions,
} from "@/ui/practice/services/printPaperService";
import type { Question } from "@/core/types";

describe("试卷印刷与排版导出服务 (printPaperService)", () => {
  const fakeQuestions = [
    { id: "q-1", type: "single", stem: "题1" },
    { id: "q-2", type: "single", stem: "题2" },
    { id: "q-3", type: "single", stem: "题3" },
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

    openOrDownloadHtml("<html></html>", "paper.html", "下载已就绪", showMessage);
    expect(showMessage).toHaveBeenCalledWith("下载已就绪", 3000, "info");
    expect(createObjectURLMock).toHaveBeenCalled();
    expect(revokeObjectURLMock).toHaveBeenCalled();

    vi.unstubAllGlobals();
  });
});
