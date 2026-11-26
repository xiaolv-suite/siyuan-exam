import { openTab, showMessage } from "siyuan";
import { mount, unmount, type Component } from "svelte";
import { watchSiYuanTheme } from "@/libs/lv-theme";
import {
  createExamTabDescriptor,
  findExamTabHeader,
  findOpenedExamTab,
  focusExamTab,
  observeTabOpen,
} from "../core/pluginTab";
import type { PluginHost } from "./pluginContext";

export const TAB_PRACTICE = "exam-practice";
export const TAB_MOCK = "exam-mock";
export const TAB_REPORT = "exam-report";

export type ExamTabComponent = Component<any>;

/** 轨道 A 业务页签惰性工厂：按需动态加载组件，削减冷启动 AST 内存占用 */
export const loadTabComponent = async (type: string): Promise<ExamTabComponent> => {
  switch (type) {
    case TAB_MOCK:
      return (await import("@/ui/mock/MockTab.svelte")).default as unknown as ExamTabComponent;
    case TAB_REPORT:
      return (await import("@/ui/report/ReportTab.svelte")).default as unknown as ExamTabComponent;
    case TAB_PRACTICE:
    default:
      return (await import("@/ui/practice/PracticeTab.svelte")).default as unknown as ExamTabComponent;
  }
};

/** 上次打开的页签（SiYuan 重启/刷新后布局恢复不带回插件自定义页签——真机走查两次复现，
 *  用 localStorage 记忆并在 onLayoutReady 时恢复，行为对标编辑器恢复标签页） */
export const OPEN_TABS_KEY = "lv-exam/lastOpenTab";
export const OPEN_TAB_TYPES = [TAB_PRACTICE, TAB_MOCK, TAB_REPORT];

export function rememberOpenTab(type: string): void {
  if (!OPEN_TAB_TYPES.includes(type)) return;
  try {
    localStorage.setItem(OPEN_TABS_KEY, type);
  } catch {
    /* 隐私模式静默 */
  }
}

export function registerTabs(plugin: PluginHost): void {
  // 页签工厂闭包持有运行时实例；custom.data 会被思源保存布局并 JSON 序列化，
  // 因此不能把 Plugin / ExamApp 放进其中（Plugin.app.plugins 会形成循环引用）。
  const tabs: string[] = [TAB_PRACTICE, TAB_MOCK, TAB_REPORT];
  const themeWatchers = new WeakMap<object, () => void>();
  for (const type of tabs) {
    const mountTabDom = async (custom: any) => {
      if (!custom?.element) return;
      const existingTab = custom.element instanceof HTMLElement ? custom.element.querySelector(".lv-exam-tab") : null;
      if (plugin.tabApps.has(custom) && existingTab && custom.element.contains(existingTab)) {
        return;
      }
      themeWatchers.get(custom)?.();
      themeWatchers.delete(custom);
      if (plugin.tabApps.has(custom)) {
        void plugin.tabApps.destroy(custom, (instance) => {
          try { unmount(instance); } catch {}
        });
      }
      if (custom.element instanceof HTMLElement) {
        custom.element.innerHTML = "";
        custom.element.style.height = "100%";
        custom.element.style.display = "flex";
        custom.element.style.flexDirection = "column";
      }
      const el = document.createElement("div");
      el.classList.add("fn__flex-1", "lv-exam-tab");
      el.style.height = "100%";
      custom.element.appendChild(el);
      const unwatchTheme = watchSiYuanTheme(el);
      themeWatchers.set(custom, unwatchTheme);
      const component = await loadTabComponent(type);
      if (plugin.isUnloaded) {
        unwatchTheme();
        themeWatchers.delete(custom);
        return;
      }
      const instance = mount(component, {
        target: el,
        props: { plugin, examApp: plugin.examApp },
      });
      plugin.tabApps.set(custom, instance);
    };

    plugin.addTab({
      type,
      init(custom) {
        mountTabDom(custom || this);
      },
      destroy() {
        themeWatchers.get(this)?.();
        themeWatchers.delete(this);
        void plugin.tabApps.destroy(this, (instance) => unmount(instance)).catch((error) => {
          console.error(`[LvExam] failed to unmount tab: ${type}`, error);
        });
      },
      update() {
        mountTabDom(this);
      },
    });
  }
}

export function openTabByType(plugin: PluginHost, type: string, icon: string, title: string): boolean {
  void plugin.ensureTier2Loaded().catch((err) => console.warn("[LvExam] openTabByType ensureTier2Loaded catch:", err));

  // 早于应用就绪的点击延后执行，避免把 null app 固定传入永久报错的页签。
  if (plugin.appInitializing) {
    plugin.queuedTab = { type, icon, title };
    if (!plugin.layoutReadyPromise) {
      void plugin.onLayoutReady();
    }
    showMessage(plugin.i18n["state.initializing"] ?? "正在初始化小驴考试，完成后自动打开…", 2400, "info");
    return false;
  }

  // 移动端宿主降级：思源手机端不支持 custom tab，降级为全屏 Dialog 承载
  if (plugin.isMobile) {
    return plugin.openMobileDialog(type, title);
  }

  // 单例聚焦（26.2）：同类型 Tab 已开则切换过去，避免 tabApps 覆盖引用
  const existing = findOpenedExamTab(plugin.getOpenedTab(), plugin.name, type);
  if (existing && focusExamTab(existing)) {
    rememberOpenTab(type);
    return true;
  }
  const restoredHeader = findExamTabHeader(plugin.name, type);
  if (restoredHeader) {
    restoredHeader.click();
    rememberOpenTab(type);
    return true;
  }
  if (plugin.openingTabs.has(type)) {
    showMessage(plugin.i18n["state.openTabOpening"] ?? "练习台正在打开，请稍候…", 1800, "info");
    return false;
  }
  plugin.openingTabs.add(type);
  observeTabOpen(
    () => openTab({
      app: plugin.app,
      custom: createExamTabDescriptor(plugin.name, type, icon, title),
    }),
    () => {
      plugin.openingTabs.delete(type);
      rememberOpenTab(type);
    },
    (error) => {
      console.error(`[LvExam] failed to open tab: ${type}`, error);
      plugin.openingTabs.delete(type);
      const reason = String(error instanceof Error ? error.message : error);
      showMessage(
        (plugin.i18n["state.openTabFailed"] ?? "无法打开插件页签，请重试。") + ` ${reason}`,
        6000,
        "error",
      );
    },
  );
  return false;
}
