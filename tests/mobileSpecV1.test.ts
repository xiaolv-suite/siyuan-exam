/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("siyuan", () => {
  class MockDialog {
    element: HTMLElement;
    options: any;
    constructor(options: any) {
      this.options = options;
      this.element = document.createElement("div");
      this.element.className = "b3-dialog";
      this.element.innerHTML = `
        <div class="b3-dialog__container">
          <div class="b3-dialog__header"><span class="b3-dialog__title">${options.title || ""}</span></div>
          <div class="b3-dialog__content">${options.content || ""}</div>
        </div>
      `;
      document.body.appendChild(this.element);
    }
    destroy() {
      if (this.options?.destroyCallback) {
        this.options.destroyCallback();
      }
      this.element.remove();
    }
  }

  class MockPlugin {
    name = "siyuan-exam";
    eventBus = { on: vi.fn(), off: vi.fn() };
    protyleSlash: any[] = [];
    addIcons = vi.fn();
    addTopBar = vi.fn();
    addTab = vi.fn();
    addCommand = vi.fn();
    getOpenedTab = vi.fn().mockReturnValue([]);
    openSetting = vi.fn();
  }

  class MockSetting {
    constructor() {}
    addItem() {}
  }

  return {
    Dialog: MockDialog,
    Plugin: MockPlugin,
    Setting: MockSetting,
    openTab: vi.fn(),
    showMessage: vi.fn(),
    getFrontend: vi.fn().mockReturnValue("mobile"),
    adaptHotkey: vi.fn((k) => k),
  };
});

vi.mock("svelte", async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    mount: vi.fn().mockReturnValue({}),
    unmount: vi.fn(),
  };
});

import LvExamPlugin from "../src/index";
import { lvLaunchpad, lvSurfaceStack } from "../src/libs/lv-notice-kit";

describe("小驴生态 · 手机端完整开发 · Mobile Spec v1 规范测试", () => {
  let plugin: LvExamPlugin;

  beforeEach(() => {
    localStorage.clear();
    delete (window as any).__LV_LAUNCHPAD__;
    delete (window as any).__LV_OMNISEARCH__;
    delete (window as any).__LV_SURFACE_STACK__;

    plugin = new LvExamPlugin({} as any);
    plugin.i18n = {
      "tab.practice": "练习",
      "tab.mock": "模考",
      "tab.report": "复盘",
      "state.initializing": "初始化中…",
      settingSaved: "保存成功",
    };
    plugin.name = "siyuan-exam";
  });

  afterEach(async () => {
    try {
      await plugin.onunload();
    } catch {
      /* ignore */
    }
    delete (window as any).__LV_LAUNCHPAD__;
    delete (window as any).__LV_OMNISEARCH__;
    delete (window as any).__LV_SURFACE_STACK__;
    document.body.innerHTML = "";
  });

  it("1. 手机端检测与入口统一：挂载 ensureMobileEntry，onload 自动注册小驴罗盘", async () => {
    const mobileDiv = document.createElement("div");
    mobileDiv.id = "mobileTopBar";
    document.body.appendChild(mobileDiv);

    await plugin.onload();

    // 验证罗盘注册项
    const items = lvLaunchpad.getItems();
    const examItem = items.find((i) => i.id === "siyuan-exam");
    expect(examItem).toBeDefined();
    expect(examItem?.fullName).toBe("小驴考试");

    // 验证二级直办动作重写为 4 个手机动作
    expect(examItem?.actions).toEqual([
      "继续上次练习",
      "错题复仇特训",
      "每日一练",
      "全真计时模拟考试",
    ]);

    mobileDiv.remove();
  });

  it("2. 阻断级宿主降级：移动端 openTabByType 降级为全屏 Dialog 承载", async () => {
    (plugin as any).isMobile = true;
    (plugin as any).appInitializing = false;

    // 打开练习台
    const opened = plugin.openPractice();
    expect(opened).toBe(false); // 首次打开新 Dialog 返回 false

    const mobileDialogEl = document.querySelector(".lv-exam-mobile-dialog");
    expect(mobileDialogEl).not.toBeNull();
    expect(mobileDialogEl?.querySelector(".lv-exam-mobile-dialog-host")).not.toBeNull();

    // 再次调用时，若已处于打开状态则返回 true（单例聚焦）
    const secondOpen = plugin.openPractice();
    expect(secondOpen).toBe(true);

    // 验证统一浮层栈 Esc / Android 返回键联动已登记
    expect(lvSurfaceStack.top()?.id).toBe("lv-exam-mobile-dialog");

    // 关闭对话框
    plugin.closeMobileDialog();
    expect(document.querySelector(".lv-exam-mobile-dialog")).toBeNull();
  });

  it("3. 小驴罗盘二级行动派发：覆盖继续上次、错题特训、每日一练与模拟考试", async () => {
    await plugin.onload();

    let resumeCalled = false;
    let wrongDrillCalled = false;
    let weakSpotCalled = false;
    let mockCalled = false;

    plugin.resumeLastPractice = () => {
      resumeCalled = true;
    };
    plugin.startWrongQuestionsDrill = async () => {
      wrongDrillCalled = true;
      return true;
    };
    plugin.startWeakSpotTraining = async () => {
      weakSpotCalled = true;
      return true;
    };
    plugin.openMock = () => {
      mockCalled = true;
    };

    plugin.handleQuickAction("继续上次练习");
    expect(resumeCalled).toBe(true);

    plugin.handleQuickAction("错题复仇特训");
    expect(wrongDrillCalled).toBe(true);

    plugin.handleQuickAction("每日一练");
    expect(weakSpotCalled).toBe(true);

    plugin.handleQuickAction("全真计时模拟考试");
    expect(mockCalled).toBe(true);
  });

  it("4. 全生态穿透搜索：覆盖题库高频实体与试题实体", async () => {
    // 模拟 ExamApp 与题库
    (plugin as any).examApp = {
      listBanks: () => [
        { id: "bank-xingce", name: "公务员行测题库", category: "exam" },
      ],
      listQuestions: async (_bankId: string) => [
        {
          id: "q-101",
          stem: "关于我国宪法规定的公民基本权利，下列哪一说法是正确的？",
          analysis: "宪法规定了广泛的公民权利体系，包括政治权利与自由。",
          kp: "宪法学/公民权利",
          options: ["A", "B", "C", "D"],
        },
      ],
      derived: () => ({
        wrongbook: new Map(),
      }),
    };

    // 搜索题库名称
    const bankResults = await plugin.searchOmni("行测");
    expect(bankResults.length).toBeGreaterThan(0);
    expect(bankResults[0].category).toBe("题库");
    expect(bankResults[0].title).toContain("题库：公务员行测题库");

    // 搜索试题题干关键词
    const qResults = await plugin.searchOmni("宪法");
    expect(qResults.length).toBeGreaterThan(0);
    expect(qResults.some((r) => r.title.includes("公民基本权利"))).toBe(true);
  });

  it("5. 触感振动反馈：lvLaunchpad.haptic 存在且桌面端安全降级", () => {
    expect(typeof lvLaunchpad.haptic).toBe("function");
    // 调用不抛异常
    expect(() => lvLaunchpad.haptic(10)).not.toThrow();
  });

  it("6. 移动端全屏弹层支持下滑关闭手势", () => {
    (plugin as any).isMobile = true;
    (plugin as any).appInitializing = false;

    plugin.openPractice();
    const dialogEl = document.querySelector(".lv-exam-mobile-dialog");
    expect(dialogEl).not.toBeNull();

    const header = dialogEl?.querySelector(".b3-dialog__header") as HTMLElement;
    expect(header).not.toBeNull();

    // 模拟下滑手势 > 70px
    const touchStart = new Event("touchstart", { bubbles: true }) as any;
    touchStart.touches = [{ clientY: 100, clientX: 100 }];
    header.dispatchEvent(touchStart);

    const touchEnd = new Event("touchend", { bubbles: true }) as any;
    touchEnd.changedTouches = [{ clientY: 180, clientX: 105 }];
    header.dispatchEvent(touchEnd);

    // 应该触发 closeMobileDialog 关闭弹窗
    expect(document.querySelector(".lv-exam-mobile-dialog")).toBeNull();
  });

  it("7. 手机端触感补齐：交卷成功与特训组卷完成时调用 lvLaunchpad.haptic(10)", async () => {
    const hapticSpy = vi.spyOn(lvLaunchpad, "haptic");

    // 1. 交卷成功触发 haptic(10)
    const { notifyMockFinishCard } = await import("../src/libs/notice");
    notifyMockFinishCard({
      paperName: "测试模拟卷",
      totalScore: 90,
      fullScore: 100,
      percent: 90,
      pass: true,
      wrongCount: 1,
    });
    expect(hapticSpy).toHaveBeenCalledWith(10);

    hapticSpy.mockClear();

    // 2. 特训组卷完成触发 haptic(10)
    (plugin as any).examApp = {
      kernelOnline: true,
      listBanks: () => [{ id: "bank-1", name: "数学专练" }],
      listQuestions: async () => [
        { id: "q-1", stem: "题1", kp: "函数/导数" },
        { id: "q-2", stem: "题2", kp: "函数/导数" },
      ],
      derived: () => ({
        byQuestion: new Map(),
        wrongbook: new Map(),
      }),
      attempts: {
        all: () => [],
      },
      cramDrill: (qs: any[]) => qs,
    };

    await plugin.startWeakSpotTraining(2);
    expect(hapticSpy).toHaveBeenCalledWith(10);

    hapticSpy.mockRestore();
  });

  it("8. 长会话进度保护：armExamHistory 拦截 Android popstate 并弹出退出草稿确认框", async () => {
    const { armExamHistory, disarmExamHistory, isExamHistoryArmed } = await import("../src/core/examHistoryGuard");

    let savedDraft = false;
    let exited = false;
    let allowExit = false;

    // 模拟确认框：动态控制用户点取消还是确认
    const dialogMod = await import("../src/libs/dialog");
    vi.spyOn(dialogMod, "confirmDialogSync").mockImplementation(async (opts) => {
      expect(opts.content).toContain("考试进行中，确认退出？（进度将保存至草稿）");
      return allowExit;
    });

    const pushSpy = vi.spyOn(window.history, "pushState");

    // 1. 启动进度保护
    armExamHistory({
      isActive: () => true,
      onSaveDraft: () => {
        savedDraft = true;
      },
      onExit: () => {
        exited = true;
      },
    });

    expect(isExamHistoryArmed()).toBe(true);
    expect(pushSpy).toHaveBeenCalledWith({ lvExam: true }, "");

    // 2. 模拟用户按 Android 返回键（触发 popstate），此时用户点击「取消」
    allowExit = false;
    pushSpy.mockClear();
    window.dispatchEvent(new PopStateEvent("popstate"));
    await new Promise((r) => setTimeout(r, 10));

    expect(savedDraft).toBe(false);
    expect(exited).toBe(false);
    // 用户取消退出，应重新压入占位态
    expect(pushSpy).toHaveBeenCalledWith({ lvExam: true }, "");
    expect(isExamHistoryArmed()).toBe(true);

    // 3. 用户再次按 Android 返回键，此时点击「确认退出」
    allowExit = true;
    window.dispatchEvent(new PopStateEvent("popstate"));
    await new Promise((r) => setTimeout(r, 10));

    expect(savedDraft).toBe(true);
    expect(exited).toBe(true);
    expect(isExamHistoryArmed()).toBe(false);

    disarmExamHistory();
    vi.restoreAllMocks();
  });

  it("9. 审计一致性：lvLaunchpad 的 svgIcon 与 symbol id 逐字完全一致", async () => {
    await plugin.onload();
    const items = lvLaunchpad.getItems();
    const examItem = items.find((i) => i.id === "siyuan-exam");
    expect(examItem?.svgIcon).toBe("icon-lv-exam");

    // 检查 addIcons 是否传入了对应 symbol id
    const addIconsCalls = (plugin.addIcons as any).mock.calls;
    const injectedSvg = addIconsCalls.map((c: any[]) => c[0]).join("\n");
    expect(injectedSvg).toContain('id="icon-lv-exam"');
  });

  it("10. 资源生命周期：downloadBlobFile 延迟调用 revokeObjectURL 避免过早注销", async () => {
    vi.useFakeTimers();
    const createObjectURLMock = vi.fn().mockReturnValue("blob:mock-url");
    const revokeObjectURLMock = vi.fn();
    (window as any).URL.createObjectURL = createObjectURLMock;
    (window as any).URL.revokeObjectURL = revokeObjectURLMock;

    const { downloadBlobFile } = await import("../src/ui/practice/services/bankExportService");
    downloadBlobFile("test csv", "test.csv", "text/csv");

    expect(createObjectURLMock).toHaveBeenCalled();
    // 同步时刻尚未被 revoke
    expect(revokeObjectURLMock).not.toHaveBeenCalled();

    // 定时器触发后完成 revoke
    vi.advanceTimersByTime(10);
    expect(revokeObjectURLMock).toHaveBeenCalledWith("blob:mock-url");

    vi.useRealTimers();
  });

  it("11. 移动端布局收敛契约：单行顶栏、折叠筛选抽屉与底部任务栏防重叠", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const root = path.resolve(__dirname, "..");
    const indexScss = fs.readFileSync(path.join(root, "src/index.scss"), "utf8");
    const baseScss = fs.readFileSync(path.join(root, "src/scss/lv-base.scss"), "utf8");
    const browseSvelte = fs.readFileSync(path.join(root, "src/ui/practice/BrowseStudioView.svelte"), "utf8");
    const practiceSvelte = fs.readFileSync(path.join(root, "src/ui/practice/PracticeTab.svelte"), "utf8");
    const mockSvelte = fs.readFileSync(path.join(root, "src/ui/mock/MockTab.svelte"), "utf8");
    const reportSvelte = fs.readFileSync(path.join(root, "src/ui/report/ReportTab.svelte"), "utf8");

    expect(indexScss).toMatch(/\.lv-exam-mobile-dialog[\s\S]*?\.b3-dialog__header\s*\{\s*display:\s*none\s*!important;/);
    expect(baseScss).toMatch(/\.lv-mobile-close-btn\s*\{[\s\S]*?width:\s*44px;[\s\S]*?height:\s*44px;/);
    expect(practiceSvelte).toContain('class="lv-mobile-close-btn"');
    expect(mockSvelte).toContain('class="lv-mobile-close-btn"');
    expect(reportSvelte).toContain('class="lv-mobile-close-btn"');
    expect(indexScss).toMatch(/@container lv-exam \(max-width: 680px\)[\s\S]*?height:\s*46px;/);
    expect(indexScss).toMatch(/@container lv-exam \(max-width: 680px\)[\s\S]*?\.lv-screen-head\s*\{\s*display:\s*none\s*!important;/);
    expect(browseSvelte).toContain("lv-browse-filter-toggle");
    expect(browseSvelte).toContain("lv-browse-filter-drawer");
    expect(indexScss).toMatch(/\.lv-mobile-tasknav\s*\{[\s\S]*?position:\s*relative;[\s\S]*?flex-shrink:\s*0;/);
    expect(indexScss).toMatch(/\.lv-keyboard-open \.lv-mobile-tasknav\s*\{\s*display:\s*none\s*!important;/);
  });
});
