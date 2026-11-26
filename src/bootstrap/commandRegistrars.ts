import { adaptHotkey, showMessage } from "siyuan";
import manifest from "../../plugin.json";
import { lvLaunchpad } from "@/libs/lv-notice-kit";
import { getCleanBlockText } from "@/libs/lv-notice-kit";
import { combineBlockSources } from "../core/blockSource";
import { localDate } from "../core/replayer";
import { openPracticeView } from "../core/pluginTab";
import type { PluginHost } from "./pluginContext";

export function computeExamLaunchpadBadge(plugin: PluginHost): string {
  if (plugin.examApp) {
    try {
      const d = plugin.examApp.derived();
      const wrongCount = [...d.wrongbook.values()].filter((w) => w.status === "active").length;
      if (wrongCount > 0) return `错题 ${wrongCount}`;
      const todayDone = d.days.get(localDate(Date.now()))?.attempts ?? 0;
      const dailyGoal = Math.max(1, Number(plugin.settingUtils?.get?.("dailyGoal") ?? 10) || 10);
      if (todayDone >= dailyGoal) return "今日达标";
      if (todayDone > 0) return `今日 ${todayDone}/${dailyGoal}`;
      return plugin.examApp.listBanks().length > 0 ? `待练 ${dailyGoal} 题` : "待建题库";
    } catch {
      /* 容错降级 */
    }
  }
  const stats = plugin.lastPublicStats as { activeWrong?: number; todayAttempts?: number } | null | undefined;
  if (stats && typeof stats === "object") {
    if (typeof stats.activeWrong === "number" && stats.activeWrong > 0) return `错题 ${stats.activeWrong}`;
    if (typeof stats.todayAttempts === "number" && stats.todayAttempts > 0) return `今日 ${stats.todayAttempts} 题`;
  }
  return "";
}

export function registerTopBar(plugin: PluginHost): void {
  (plugin as any).topBarElement = plugin.addTopBar({
    icon: "iconExam",
    title: manifest.displayName["zh-CN"] ?? "小驴考试",
    callback: () => plugin.openExamHome(),
  });
  // 重新注册以同步 topBarElement 引用，驱动罗盘收敛
  registerLaunchpad(plugin);
}

export function registerLaunchpad(plugin: PluginHost): void {
  plugin.launchpadCleaner?.();
  plugin.launchpadCleaner = lvLaunchpad.register({
    id: "siyuan-exam",
    name: "考试",
    fullName: "小驴考试",
    svgIcon: "icon-lv-exam",
    color: "var(--lv-brand)",
    desc: "题库刷题 · 错题特训",
    digit: 5,
    badge: "",
    badgeProvider: () => computeExamLaunchpadBadge(plugin),
    badgeType: "primary",
    actions: ["继续上次练习", "错题复仇特训", "每日一练", "全真计时模拟考试"],
    topBarElement: (plugin as any).topBarElement,
    onClick: () => plugin.openExamHome(),
    onAction: (action) => plugin.handleQuickAction(action),
  });
}

export function registerCommands(plugin: PluginHost): void {
  plugin.addCommand({
    langKey: "command.openPractice",
    hotkey: adaptHotkey("⌥⌘P"),
    callback: () => plugin.openExamHome(),
  });
  plugin.addCommand({
    langKey: "command.openMock",
    hotkey: adaptHotkey("⌥⌘M"),
    callback: () => plugin.openMock(),
  });
  plugin.addCommand({
    langKey: "command.openReport",
    hotkey: adaptHotkey("⌥⇧⌘R"),
    callback: () => plugin.openReport(),
  });
  plugin.addCommand({
    langKey: "command.openWrongbook",
    hotkey: adaptHotkey("⌥⌘E"),
    callback: () => plugin.openWrongbook(),
  });
  plugin.addCommand({
    langKey: "command.resetSettings",
    callback: async () => {
      for (const [key, def] of plugin.settingDefaults) {
        if (key === "aiKey") continue;
        plugin.settingUtils.set(key, def);
      }
      try {
        await plugin.settingUtils.save();
        showMessage(plugin.i18n["setting.resetDone"], 4000, "info");
      } catch (e) {
        showMessage((plugin.i18n["setting.saveFailed"] ?? "设置保存失败；输入已保留，重新打开插件设置后可再次保存。") + " " + String(e instanceof Error ? e.message : e), 6000, "error");
      }
    },
  });
  plugin.addCommand({
    langKey: "command.resetOnboarding",
    callback: () => {
      try {
        localStorage.removeItem("lv-exam-onboarded");
      } catch {
        /* 忽略 */
      }
      showMessage(plugin.i18n["onboard.resetDone"], 3200, "info");
    },
  });
}

export function registerProtyleSlash(plugin: PluginHost): void {
  plugin.protyleSlash.push({
    filter: ["转为试题", "录入试题", "提取试题", "zhuanwei", "exam", "tiqu", "shiti"],
    html: `<div class="b3-list-item__first"><svg class="b3-list-item__graphic"><use xlink:href="#iconExam"></use></svg><span class="b3-list-item__text">${plugin.i18n["slash.convertToQuestion"] ?? "转为小驴试题（录入题库）"}</span></div>`,
    id: "lv-exam-convert-to-question",
    callback: async (_protyle: unknown, nodeElement: HTMLElement) => {
      const blockId = nodeElement?.getAttribute?.("data-node-id") || nodeElement?.dataset?.nodeId || "";
      if (!blockId || !plugin.examApp) {
        showMessage(plugin.i18n["state.offlineHint"] ?? "请稍候，应用初始化中…", 3000, "info");
        return;
      }
      const bank = plugin.examApp.resolvePreferredBank();
      if (!bank) {
        showMessage(plugin.i18n["guard.needBankFirst"] ?? "请先创建一个题库", 3600, "error");
        return;
      }
      try {
        const kramdown = await plugin.examApp.bridge.getBlockKramdown(blockId);
        const source = combineBlockSources([kramdown]);
        const blockTitle = (nodeElement?.getAttribute?.("aria-label") || nodeElement?.getAttribute?.("data-type") || "笔记段落").trim();
        openPracticeView(plugin, "manual", {
          bankId: bank.id,
          sourceText: source.text || getCleanBlockText(nodeElement),
          sourceTitle: blockTitle,
          sourceKind: "block",
          sourceBlockId: blockId,
        });
      } catch {
        openPracticeView(plugin, "manual", {
          bankId: bank.id,
          sourceText: getCleanBlockText(nodeElement),
          sourceTitle: "笔记段落",
          sourceKind: "block",
          sourceBlockId: blockId,
        });
      }
    },
  });
}
