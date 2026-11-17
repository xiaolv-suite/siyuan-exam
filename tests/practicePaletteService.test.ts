import { describe, it, expect, vi } from "vitest";
import {
  buildPracticePaletteCommands,
  resolveTaskNavigation,
} from "@/ui/practice/services/practicePaletteService";

describe("练习工作区命令面板与导航服务 (practicePaletteService)", () => {
  const dummyT = (k: string) => `[${k}]`;

  it("1. buildPracticePaletteCommands：构建包含视图、动作与标签页的命令列表", () => {
    const handlers = {
      t: dummyT,
      switchView: vi.fn(),
      loadQuestions: vi.fn(),
      loadMaterials: vi.fn(),
      startDrill: vi.fn(),
      startRecite: vi.fn(),
      syncBankDocs: vi.fn(),
      copyTodayReportMarkdown: vi.fn(),
      openMock: vi.fn(),
      openReport: vi.fn(),
    };

    const commands = buildPracticePaletteCommands(handlers);
    expect(commands.length).toBeGreaterThanOrEqual(15);

    // 1. 验证视图命令运行
    const homeCmd = commands.find((c) => c.label === "[tab.practice]");
    expect(homeCmd).toBeDefined();
    homeCmd?.run();
    expect(handlers.switchView).toHaveBeenCalledWith("entry");

    // 2. 验证做题动作命令运行
    const quickCmd = commands.find((c) => c.label === "[mode.quick]");
    expect(quickCmd).toBeDefined();
    quickCmd?.run();
    expect(handlers.startDrill).toHaveBeenCalledWith("quick");

    // 3. 验证外部选项卡命令运行
    const mockCmd = commands.find((c) => c.label === "[tab.mock]");
    expect(mockCmd).toBeDefined();
    mockCmd?.run();
    expect(handlers.openMock).toHaveBeenCalled();
  });

  it("2. buildPracticePaletteCommands：支持打开插件设置与恢复默认配置动作", () => {
    const openSettings = vi.fn();
    const resetSettings = vi.fn();
    const handlers = {
      t: dummyT,
      switchView: vi.fn(),
      loadQuestions: vi.fn(),
      loadMaterials: vi.fn(),
      startDrill: vi.fn(),
      startRecite: vi.fn(),
      syncBankDocs: vi.fn(),
      copyTodayReportMarkdown: vi.fn(),
      openSettings,
      resetSettings,
    };

    const commands = buildPracticePaletteCommands(handlers);
    const settingCmd = commands.find((c) => c.label === "打开插件设置");
    expect(settingCmd).toBeDefined();
    settingCmd?.run();
    expect(openSettings).toHaveBeenCalled();

    const resetCmd = commands.find((c) => c.label === "恢复插件默认设置");
    expect(resetCmd).toBeDefined();
    resetCmd?.run();
    expect(resetSettings).toHaveBeenCalled();
  });

  it("3. resolveTaskNavigation：分流外部选项卡与内部视图跳转", () => {
    const openMock = vi.fn();
    const openReport = vi.fn();

    // 1. 模考外跳
    const resMock = resolveTaskNavigation("mock", openMock, openReport);
    expect(resMock.isTab).toBe(true);
    expect(openMock).toHaveBeenCalled();

    // 2. 研报外跳
    const resReport = resolveTaskNavigation("report", openMock, openReport);
    expect(resReport.isTab).toBe(true);
    expect(openReport).toHaveBeenCalled();

    // 3. 内部今日任务
    const resToday = resolveTaskNavigation("today", openMock, openReport);
    expect(resToday.isTab).toBe(false);
    expect(resToday.nextView).toBe("entry");

    // 4. 题库浏览
    const resBank = resolveTaskNavigation("bank", openMock, openReport);
    expect(resBank.isTab).toBe(false);
    expect(resBank.nextView).toBe("browse");

    // 5. 手工出题
    const resCreate = resolveTaskNavigation("create", openMock, openReport);
    expect(resCreate.isTab).toBe(false);
    expect(resCreate.nextView).toBe("manual");

    // 6. 题库集市
    const resMarketplace = resolveTaskNavigation("marketplace", openMock, openReport);
    expect(resMarketplace.isTab).toBe(false);
    expect(resMarketplace.nextView).toBe("marketplace");
  });
});
