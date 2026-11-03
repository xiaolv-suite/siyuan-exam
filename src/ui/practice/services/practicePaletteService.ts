// ============================================================
// 练习工作区快捷命令面板与任务导航服务（practicePaletteService.ts）
// 承接命令面板动作分发（视图切换/练习模式启动/同步/打卡报告）与任务指引跳转
// 纯逻辑解耦，不绑定 Svelte 渲染态
// ============================================================

import type { PaletteCommand } from "../../shared/paletteTypes";

export interface PaletteActionHandlers {
  t: (k: string) => string;
  switchView: (view: any) => void;
  loadQuestions: () => void;
  loadMaterials: () => void;
  startDrill: (mode: string) => void;
  startRecite: () => void;
  syncBankDocs: () => void;
  copyTodayReportMarkdown: () => void;
  openMock?: () => void;
  openReport?: () => void;
  openSettings?: () => void;
  resetSettings?: () => void;
}

/**
 * 构建练习工作区全局命令面板动作集合
 */
export function buildPracticePaletteCommands(handlers: PaletteActionHandlers): PaletteCommand[] {
  const {
    t,
    switchView,
    loadQuestions,
    loadMaterials,
    startDrill,
    startRecite,
    syncBankDocs,
    copyTodayReportMarkdown,
    openMock,
    openReport,
    openSettings,
    resetSettings,
  } = handlers;

  return [
    { group: t("palette.views"), icon: "home", label: t("tab.practice"), keywords: "home entry today", run: () => { switchView("entry"); } },
    { group: t("palette.views"), icon: "xcircle", label: t("wrongbook.title"), keywords: "wrongbook wrong", run: () => { switchView("wrongbook"); void loadQuestions(); } },
    { group: t("palette.views"), icon: "table", label: t("mode.browse"), keywords: "browse bank list", run: () => { switchView("browse"); void loadQuestions(); } },
    { group: t("palette.views"), icon: "sparkles", label: "公共题库与闪卡集市", keywords: "marketplace 集市 题库 闪卡 公版", run: () => { switchView("marketplace"); } },
    { group: t("palette.views"), icon: "import", label: t("import.title"), keywords: "import excel csv aiken gift", run: () => { switchView("import"); } },
    { group: t("palette.views"), icon: "pencil", label: t("entry.manual"), keywords: "manual add", run: () => { switchView("manual"); } },
    { group: t("palette.views"), icon: "sparkles", label: t("ai.title"), keywords: "ai generate", run: () => { switchView("ai"); } },
    { group: t("palette.views"), icon: "book", label: t("materials.title"), keywords: "materials pdf", run: () => { switchView("materials"); loadMaterials(); } },
    { group: t("palette.actions"), icon: "zap", label: t("mode.quick"), keywords: "quick drill practice", run: () => void startDrill("quick") },
    { group: t("palette.actions"), icon: "calendar", label: t("mode.daily"), keywords: "daily", run: () => void startDrill("daily") },
    { group: t("palette.actions"), icon: "rotate", label: t("mode.recite"), keywords: "recite cover tts", run: () => void startRecite() },
    { group: t("palette.actions"), icon: "xcircle", label: t("mode.wrong"), keywords: "wrong redo drill", run: () => void startDrill("wrong") },
    { group: t("palette.actions"), icon: "flame", label: t("mode.cram"), keywords: "cram cram", run: () => void startDrill("cram") },
    { group: t("palette.actions"), icon: "star", label: t("mode.fav"), keywords: "fav starred", run: () => void startDrill("fav") },
    { group: t("palette.actions"), icon: "save", label: t("sync.docsBtn"), keywords: "sync archive local docs", run: () => void syncBankDocs() },
    { group: t("palette.actions"), icon: "copy", label: t("entry.copyReport"), keywords: "copy today study report diary", run: () => void copyTodayReportMarkdown() },
    { group: t("palette.tabs"), icon: "clock", label: t("tab.mock"), keywords: "mock exam", run: () => openMock?.() },
    { group: t("palette.tabs"), icon: "chart", label: t("tab.report"), keywords: "report stats", run: () => openReport?.() },
    ...(openSettings ? [{ group: t("palette.actions"), icon: "settings" as any, label: "打开插件设置", keywords: "settings config preference 设置 配置", run: () => openSettings() }] : []),
    ...(resetSettings ? [{ group: t("palette.actions"), icon: "rotate" as any, label: "恢复插件默认设置", keywords: "reset restore default settings 重置 恢复 默认", run: () => resetSettings() }] : []),
  ];
}

/**
 * 解析启程中心快捷任务卡片导航
 */
export function resolveTaskNavigation(
  target: "today" | "bank" | "marketplace" | "create" | "mock" | "report",
  openMock?: () => void,
  openReport?: () => void,
): { isTab: boolean; nextView?: "entry" | "browse" | "manual" | "marketplace" } {
  if (target === "mock") {
    openMock?.();
    return { isTab: true };
  }
  if (target === "report") {
    openReport?.();
    return { isTab: true };
  }
  if (target === "marketplace") {
    return { isTab: false, nextView: "marketplace" };
  }
  const nextView = target === "today" ? "entry" : target === "bank" ? "browse" : "manual";
  return { isTab: false, nextView };
}
