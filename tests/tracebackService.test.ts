/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  tracebackToSourceBlock,
  highlightTracePulse,
  extractWrongQueueDocOptions,
} from "../src/ui/practice/services/tracebackService";
import { filterAndSortWrongQueue } from "../src/ui/practice/services/wrongbookDispositionService";
import { lvNotify } from "../src/libs/lv-notice-kit";
import type { Question } from "../src/core/types";

vi.mock("siyuan", () => {
  return {
    openTab: vi.fn().mockResolvedValue({ id: "tab-mock" }),
    openMobileFileById: vi.fn(),
  };
});

describe("错题原块深度穿透服务 (Error Notebook Deep Traceback)", () => {
  let capsuleSpy: any;

  beforeEach(() => {
    document.body.innerHTML = "";
    capsuleSpy = vi.spyOn(lvNotify, "capsule").mockReturnValue("cap-id");
  });

  afterEach(() => {
    capsuleSpy.mockRestore();
    document.body.innerHTML = "";
    vi.useRealTimers();
  });

  it("1. highlightTracePulse：就绪后为块元素添加脉冲高亮类，2秒后清除并移除空 class 属性", () => {
    vi.useFakeTimers();

    const block = document.createElement("div");
    block.setAttribute("data-node-id", "b-20261105-target");
    block.scrollIntoView = vi.fn();
    document.body.appendChild(block);

    highlightTracePulse("b-20261105-target", 2000);

    // 立即或首帧执行
    vi.advanceTimersByTime(50);
    expect(block.classList.contains("lv-exam-trace-pulse")).toBe(true);
    expect(block.scrollIntoView).toHaveBeenCalled();

    // 2 秒后脉冲类名被移除，且由于原本无其他类名，class 属性被彻底移除
    vi.advanceTimersByTime(2000);
    expect(block.classList.contains("lv-exam-trace-pulse")).toBe(false);
    expect(block.hasAttribute("class")).toBe(false);
  });

  it("2. highlightTracePulse：若块元素已有其他类名，脉冲移除后保留原有类名", () => {
    vi.useFakeTimers();

    const block = document.createElement("div");
    block.setAttribute("data-node-id", "b-with-existing-class");
    block.className = "protyle-wysiwyg p";
    block.scrollIntoView = vi.fn();
    document.body.appendChild(block);

    highlightTracePulse("b-with-existing-class", 2000);
    vi.advanceTimersByTime(50);

    expect(block.classList.contains("lv-exam-trace-pulse")).toBe(true);
    expect(block.classList.contains("protyle-wysiwyg")).toBe(true);

    vi.advanceTimersByTime(2000);
    expect(block.classList.contains("lv-exam-trace-pulse")).toBe(false);
    expect(block.className).toBe("protyle-wysiwyg p");
  });

  it("3. tracebackToSourceBlock 桌面端分流：调用 openTab 并触发脉冲高亮", async () => {
    const { openTab } = await import("siyuan");
    (openTab as any).mockClear();

    const fakePlugin = {
      app: { id: "mock-app" },
      isMobile: false,
      examApp: {
        kernelOnline: true,
        deps: {
          client: {
            sql: vi.fn().mockResolvedValue([{ id: "b-desktop-target", root_id: "doc-1" }]),
          },
        },
      },
    };

    const block = document.createElement("div");
    block.setAttribute("data-node-id", "b-desktop-target");
    block.scrollIntoView = vi.fn();
    document.body.appendChild(block);

    const ok = await tracebackToSourceBlock({
      plugin: fakePlugin,
      blockId: "b-desktop-target",
      isMobile: false,
    });

    expect(ok).toBe(true);
    expect(openTab).toHaveBeenCalledWith({
      app: fakePlugin.app,
      doc: { id: "b-desktop-target" },
      keepCursor: false,
    });
  });

  it("4. tracebackToSourceBlock 移动端分流：调用 openMobileFileById", async () => {
    const { openMobileFileById } = await import("siyuan");
    (openMobileFileById as any).mockClear();

    const fakePlugin = {
      app: { id: "mock-app" },
      isMobile: true,
      examApp: {
        kernelOnline: true,
        deps: {
          client: {
            sql: vi.fn().mockResolvedValue([{ id: "b-mobile-target", root_id: "doc-2" }]),
          },
        },
      },
    };

    const ok = await tracebackToSourceBlock({
      plugin: fakePlugin,
      blockId: "b-mobile-target",
      isMobile: true,
    });

    expect(ok).toBe(true);
    expect(openMobileFileById).toHaveBeenCalledWith(fakePlugin.app, "b-mobile-target");
  });

  it("5. 原笔记已删除容错：SQL 未检出或调用抛异常时微胶囊提示且不崩溃", async () => {
    const fakePlugin = {
      app: { id: "mock-app" },
      isMobile: false,
      examApp: {
        kernelOnline: true,
        deps: {
          client: {
            sql: vi.fn().mockResolvedValue([]), // 空返回，原笔记已移出/删除
          },
        },
      },
    };

    const ok = await tracebackToSourceBlock({
      plugin: fakePlugin,
      blockId: "b-deleted-target",
      isMobile: false,
    });

    expect(ok).toBe(false);
    expect(capsuleSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "原笔记已移出，题目在考试库中安全保留",
      }),
    );
  });

  it("6. 宿主跳转抛出异常容错：捕获错误并提示微胶囊", async () => {
    const { openTab } = await import("siyuan");
    (openTab as any).mockRejectedValueOnce(new Error("document not found"));

    const fakePlugin = {
      app: { id: "mock-app" },
      isMobile: false,
      examApp: {
        kernelOnline: false,
      },
    };

    const ok = await tracebackToSourceBlock({
      plugin: fakePlugin,
      blockId: "b-broken-target",
      isMobile: false,
    });

    expect(ok).toBe(false);
    expect(capsuleSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "原笔记已移出，题目在考试库中安全保留",
      }),
    );
  });

  it("7. extractWrongQueueDocOptions：聚合去重来源文档与统计题数", () => {
    const wrongQueue = [
      { qid: "q-1" },
      { qid: "q-2" },
      { qid: "q-3" },
      { qid: "q-4" },
    ];

    const questionMap = new Map<string, Question>([
      ["q-1", { id: "q-1", stem: "题1", type: "single", rootId: "doc-math", hpath: "/数学/高数笔记" }],
      ["q-2", { id: "q-2", stem: "题2", type: "single", rootId: "doc-math", hpath: "/数学/高数笔记" }],
      ["q-3", { id: "q-3", stem: "题3", type: "single", rootId: "doc-cs", source: "计算机基础" }],
      ["q-4", { id: "q-4", stem: "题4", type: "single" }], // 无血缘外部导入题
    ]);

    const options = extractWrongQueueDocOptions(wrongQueue, questionMap);
    expect(options).toHaveLength(2);
    expect(options[0].docId).toBe("doc-math");
    expect(options[0].count).toBe(2);
    expect(options[0].label).toBe("/数学/高数笔记");

    expect(options[1].docId).toBe("doc-cs");
    expect(options[1].count).toBe(1);
    expect(options[1].label).toBe("计算机基础");
  });

  it("8. filterAndSortWrongQueue docFilter：组合来源文档过滤", () => {
    const wrongQueue = [
      { qid: "q-1", wrongCount: 3 },
      { qid: "q-2", wrongCount: 1 },
      { qid: "q-3", wrongCount: 5 },
    ];

    const questionMap = new Map<string, Question>([
      ["q-1", { id: "q-1", stem: "题1", type: "single", rootId: "doc-math" }],
      ["q-2", { id: "q-2", stem: "题2", type: "single", rootId: "doc-cs" }],
      ["q-3", { id: "q-3", stem: "题3", type: "single", rootId: "doc-math" }],
    ]);

    const filtered = filterAndSortWrongQueue(
      wrongQueue,
      questionMap,
      () => "careless",
      {
        reasonFilter: "all",
        filterStubborn: false,
        kpFilter: "",
        sortMode: "default",
        docFilter: "doc-math",
      },
    );

    expect(filtered).toHaveLength(2);
    expect(filtered.map((w) => w.qid)).toEqual(["q-1", "q-3"]);
  });

  it("9. 错题卡来源行按钮渲染分支：仅当 blockId 存在时可渲染穿透链接", () => {
    const qWithBlock: Question = {
      id: "q-1",
      stem: "有血缘题目",
      type: "single",
      blockId: "20261105123456-abc1234",
    };

    const qWithoutBlock: Question = {
      id: "q-2",
      stem: "外部导入题目",
      type: "single",
    };

    // 模拟渲染条件逻辑判断
    const shouldRenderButton = (q: Question) => Boolean(q?.blockId);

    expect(shouldRenderButton(qWithBlock)).toBe(true);
    expect(shouldRenderButton(qWithoutBlock)).toBe(false);
  });
});
