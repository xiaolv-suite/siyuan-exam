import { Plugin, openTab, showMessage, getFrontend, adaptHotkey, Dialog, type Menu } from "siyuan";
import "./index.scss";

import { SettingUtils } from "./libs/setting-utils";
import { mount, unmount, type Component } from "svelte";
import manifest from "../plugin.json";
import PracticeTab from "@/ui/practice/PracticeTab.svelte";
import MockTab from "@/ui/mock/MockTab.svelte";
import ReportTab from "@/ui/report/ReportTab.svelte";
import { createExamApp } from "./app-runtime";
import type { ExamApp } from "./app";
import { streak } from "./core/replayer";
import { emitExamEvent } from "./core/bus";
import { createExamTabDescriptor, findExamTabHeader, findOpenedExamTab, focusExamTab, observeTabOpen, openPracticeView, type ExamPluginLike, type PracticeViewRequest } from "./core/pluginTab";
import { combineBlockSources } from "./core/blockSource";
import { registerExamDailySummary } from "./ecosystem/speedSwitch";
import { TabAppRegistry } from "./core/tabAppRegistry";
import { mountLvExamBridge } from "./core/examBridge";
import type { Question } from "./core/types";
import { lvNotify, lvBackup, lvLaunchpad, lvOmnisearch, lvSurfaceStack, type LvSearchResultItem } from "./libs/lv-notice-kit";
import { startReviewReminderScheduler, type ReviewReminderController } from "./core/reviewReminder";
import { disarmExamHistory, isExamHistoryArmed, requestExitExamWithConfirm } from "./core/examHistoryGuard";

const TAB_PRACTICE = "exam-practice";
const TAB_MOCK = "exam-mock";
const TAB_REPORT = "exam-report";

/** 上次打开的页签（SiYuan 重启/刷新后布局恢复不带回插件自定义页签——真机走查两次复现，
 *  用 localStorage 记忆并在 onLayoutReady 时恢复，行为对标编辑器恢复标签页） */
const OPEN_TABS_KEY = "lv-exam/lastOpenTab";
const OPEN_TAB_TYPES = [TAB_PRACTICE, TAB_MOCK, TAB_REPORT];
function rememberOpenTab(type: string) {
  if (!OPEN_TAB_TYPES.includes(type)) return;
  try {
    localStorage.setItem(OPEN_TABS_KEY, type);
  } catch {
    /* 隐私模式静默 */
  }
}

export default class LvExamPlugin extends Plugin implements ExamPluginLike {
  /** siyuan 1.2.9 将基类 i18n 宽化为 Record<string, JSONValue>；本项目 i18n 文件为平铺
   *  string→string（scripts/check-i18n.mjs 强制非空字符串），此处收窄回字符串字典 */
  declare i18n: Record<string, string>;
  lastPublicStats: Record<string, unknown> | null = null;
  pendingPractice?: Question[];
  pendingPracticeBankId?: string;
  pendingEditQid?: string;
  pendingEditBank?: string;
  pendingBrowseQid?: string;
  pendingBrowseBank?: string;
  pendingInitialView?: string;
  pendingQuestionId?: string;
  pendingPracticeView?: PracticeViewRequest;
  practiceViewRequestId?: string;
  pendingMockBlueprint?: import("./core/mock").Blueprint;
  isMobile = false;
  settingUtils: SettingUtils;
  isUnloaded = false;
  /** 每个宿主 Custom 模型独立持有实例；同 type 不是唯一页签身份。 */
  private tabApps = new TabAppRegistry();
  /** 应用组装层（与基类 Plugin.app: App 无关，刻意改名避免遮蔽） */
  examApp: ExamApp | null = null;
  private appInitializing = true;
  private layoutReadyPromise: Promise<void> | null = null;
  private queuedTab: { type: string; icon: string; title: string } | null = null;
  private openingTabs = new Set<string>();
  private boundBlockIcon = this.onBlockIconClick.bind(this);
  private boundImageMenu = this.onImageMenu.bind(this);
  private boundFlashcardAction = this.onFlashcardAction.bind(this);
  private boundContentMenu = this.onContentMenu.bind(this);
  private boundBlockRefMenu = this.onBlockRefMenu.bind(this);
  private boundWidgetMessage = (e: MessageEvent) => {
    if (e.data?.type === "lvexam-open-practice") {
      this.openPractice();
    }
  };
  /** 47-05 lite：设置默认值快照（注册完成时；恢复默认用） */
  private settingDefaults: Map<string, unknown> = new Map();
  /** Epoch 6：服务桥注销句柄 */
  private disposeLvExamBridge?: () => void;
  /** Epoch 6：闪卡事件监听器 */
  private cardsReviewedHandler?: (evt: Event) => void;
  /** Epoch 7：去中心化统一通知系统生命周期注销句柄 */
  private noticeHubCleaner?: () => void;
  /** Epoch 7：每日错题复习巡检控制器 */
  private reviewReminderCtrl?: ReviewReminderController;
  /** Epoch 7 Phase 4：全生态一键灾备切面注销句柄 */
  private backupCleaner?: () => void;
  /** Epoch 7 Phase 5：小驴罗盘注册注销句柄 */
  private launchpadCleaner?: () => void;
  /** Epoch 7 Phase 5 Mobile：手机端小驴罗盘入口注销句柄 */
  private launchpadMobileCleaner?: () => void;
  /** Epoch 7 Phase 7：全生态穿透搜索提供者注销句柄 */
  private omnisearchCleaner?: () => void;
  /** Mobile Dialog 承载实例（移动端降级形态） */
  private mobileDialog: Dialog | null = null;
  private mobileComponent: any = null;
  private currentMobileTabType: string | null = null;
  private mobileSurfaceCleaner?: () => void;
  private mobileViewportCleaner?: () => void;
  private mobileCloseListener?: () => void;
  private settingViewportCleaner?: () => void;

  /** 移动端原生设置弹窗软键盘守卫：键盘弹起时按 visualViewport 收缩容器，
   *  保证被聚焦的输入框始终落在可视区内（思源原生 Setting 弹窗不自带避让）。 */
  private installSettingKeyboardViewportGuard(): void {
    if (typeof window === "undefined" || !window.visualViewport) return;
    const vv = window.visualViewport;
    let baseHeight = Math.max(window.innerHeight || 0, Math.round(vv.height || 0));
    const sync = () => {
      const dialogEl = document.querySelector<HTMLElement>(".b3-dialog:has(.lv-exam-setting-control)");
      if (!dialogEl?.isConnected) return;
      const currentInner = window.innerHeight || 0;
      const currentH = Math.round(vv.height || currentInner);
      if (currentH > baseHeight) baseHeight = currentH;
      const keyboardOpen = Math.max(baseHeight, currentInner) - currentH > 110;
      dialogEl.classList.toggle("lv-keyboard-open", keyboardOpen);
      if (keyboardOpen) dialogEl.style.setProperty("--lv-vv-h", `${currentH}px`);
      else dialogEl.style.removeProperty("--lv-vv-h");
    };
    vv.addEventListener("resize", sync, { passive: true });
    vv.addEventListener("scroll", sync, { passive: true });
    window.addEventListener("resize", sync, { passive: true });
    this.settingViewportCleaner = () => {
      vv.removeEventListener("resize", sync);
      vv.removeEventListener("scroll", sync);
      window.removeEventListener("resize", sync);
    };
  }

  async onload() {
    this.isMobile = getFrontend() === "mobile" || getFrontend() === "browser-mobile" || lvLaunchpad.isMobileFrontend();

    // 移动端原生设置弹窗软键盘避让（visualViewport 守卫，仅移动端需要）
    if (this.isMobile) this.installSettingKeyboardViewportGuard();

    // 挂载罗盘全端统一入口（Protocol v1.7.5 Unified Entry 顶栏+悬浮球收敛）
    this.launchpadMobileCleaner = lvLaunchpad.ensureUnifiedEntry();

    // Epoch 7 Phase 4：注册全生态一键联合灾备切面 (lvBackup)
    this.backupCleaner = lvBackup.register(
      "siyuan-exam",
      async () => this.dumpData(),
      async (data) => this.restoreData(data),
    );

    // Epoch 7 Phase 5：注册到小驴罗盘（顶栏收敛与极速二级行动直达，手机端直办）
    this.launchpadCleaner = lvLaunchpad.register({
      id: "siyuan-exam",
      name: "考试",
      fullName: "小驴考试",
      svgIcon: "icon-lv-exam",
      color: "var(--lv-brand, var(--b3-theme-primary))",
      desc: "题库刷题 · 错题特训",
      digit: 5,
      badge: "今日待测",
      badgeType: "primary",
      actions: ["继续上次练习", "错题复仇特训", "每日一练", "全真计时模拟考试"],
      topBarElement: (this as any).topBarElement,
      onClick: () => this.openExamHome(),
      onAction: (action) => this.handleQuickAction(action),
    });

    // Epoch 7 Phase 7：注册全生态穿透搜索提供者 (lvOmnisearch)
    this.omnisearchCleaner = lvOmnisearch.registerProvider(
      "siyuan-exam",
      (kw) => this.searchOmni(kw),
    );

    this.addIcons(`
<symbol id="icon-lv-exam" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
  <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z" fill="none"/>
  <path d="m9 12 2 2 4-4" fill="none"/>
</symbol>
<symbol id="iconExam" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
  <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z" fill="none"/>
  <path d="m9 12 2 2 4-4" fill="none"/>
</symbol>
<symbol id="iconMock" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
  <circle cx="12" cy="12" r="9"/>
  <polyline points="12 7 12 12 15 15"/>
</symbol>
<symbol id="iconReport" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
  <path d="M3 3v18h18"/>
  <path d="m19 8-6 6-4-4-5 5"/>
</symbol>
<symbol id="iconWrongbook" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
  <circle cx="12" cy="12" r="9"/>
  <line x1="15" y1="9" x2="9" y2="15"/>
  <line x1="9" y1="9" x2="15" y2="15"/>
</symbol>`);

    this.settingUtils = new SettingUtils({
      plugin: this,
      callback: () => {
        showMessage(this.i18n["settingSaved"], 2600, "info");
      },
      onSaveError: (error) => {
        showMessage((this.i18n["setting.saveFailed"] ?? "设置保存失败；输入已保留，重新打开插件设置后可再次保存。") + " " + String(error instanceof Error ? error.message : error), 6000, "error");
      },
    });
    this.settingUtils.addItem({
      title: `[考期与目标] ${this.i18n["setting.examDate.title"]}`,
      description: this.i18n["setting.examDate.desc"],
      type: "textinput",
      key: "examDate",
      value: "",
      placeholder: "YYYY-MM-DD",
      direction: "row",
    });
    this.settingUtils.addItem({
      title: `[考期与目标] ${this.i18n["setting.sprintDays.title"]}`,
      description: this.i18n["setting.sprintDays.desc"],
      type: "number",
      key: "sprintDays",
      value: 14,
      direction: "row",
    });
    this.settingUtils.addItem({
      title: `[考期与目标] ${this.i18n["setting.dailyGoal.title"]}`,
      description: this.i18n["setting.dailyGoal.desc"],
      type: "number",
      key: "dailyGoal",
      value: 10,
      direction: "row",
    });
    this.settingUtils.addItem({
      title: `[做题偏好] ${this.i18n["setting.reciteGroup.title"]}`,
      description: this.i18n["setting.reciteGroup.desc"],
      type: "number",
      key: "reciteGroupSize",
      value: 15,
      direction: "row",
    });
    this.settingUtils.addItem({
      title: `[做题偏好] ${this.i18n["setting.perQuestionTimeout.title"]}`,
      description: this.i18n["setting.perQuestionTimeout.desc"],
      type: "number",
      key: "perQuestionTimeoutS",
      value: 0,
      direction: "row",
    });
    this.settingUtils.addItem({
      title: `[做题偏好] ${this.i18n["setting.feedbackTiming.title"]}`,
      description: this.i18n["setting.feedbackTiming.desc"],
      type: "select",
      key: "feedbackTiming",
      value: "immediate",
      options: {
        immediate: this.i18n["setting.feedbackTiming.immediate"],
        group: this.i18n["setting.feedbackTiming.group"],
        end: this.i18n["setting.feedbackTiming.end"],
      },
      direction: "row",
    });
    this.settingUtils.addItem({
      title: `[做题偏好] ${this.i18n["setting.materialInterleave.title"]}`,
      description: this.i18n["setting.materialInterleave.desc"],
      type: "checkbox",
      key: "materialInterleave",
      value: false,
      direction: "row",
    });
    this.settingUtils.addItem({
      title: `[考期与目标] ${this.i18n["setting.examProfiles.title"]}`,
      description: this.i18n["setting.examProfiles.desc"],
      type: "textarea",
      key: "examProfiles",
      value: "",
      direction: "column",
    });
    this.settingUtils.addItem({
      // 65-06 lite：快速刷题去重窗口（天；0=关闭去重）
      title: `[做题偏好] ${this.i18n["setting.quickAvoidDays.title"]}`,
      description: this.i18n["setting.quickAvoidDays.desc"],
      type: "number",
      key: "quickAvoidDays",
      value: 3,
      direction: "row",
    });
    this.settingUtils.addItem({
      title: `[生态联动] ${this.i18n["setting.checkinItemId.title"]}`,
      description: this.i18n["setting.checkinItemId.desc"],
      type: "textinput",
      key: "checkinItemId",
      value: "",
      direction: "row",
    });
    this.settingUtils.addItem({
      title: `[生态联动] ${this.i18n["setting.checkinThreshold.title"]}`,
      description: this.i18n["setting.checkinThreshold.desc"],
      type: "number",
      key: "checkinThreshold",
      value: 0,
      direction: "row",
    });
    this.settingUtils.addItem({
      title: `[算法调度] ${this.i18n["setting.retention.title"]}`,
      description: this.i18n["setting.retention.desc"],
      type: "slider",
      key: "desiredRetention",
      value: 0.9,
      direction: "row",
      slider: { min: 0.85, max: 0.97, step: 0.01 },
    });
    this.settingUtils.addItem({
      title: `[AI智能体] ${this.i18n["setting.aiEndpoint.title"]}`,
      description: this.i18n["setting.aiEndpoint.desc"],
      type: "textinput",
      key: "aiEndpoint",
      value: "",
      direction: "row",
    });
    this.settingUtils.addItem({
      title: `[AI智能体] ${this.i18n["setting.aiModel.title"]}`,
      description: this.i18n["setting.aiModel.desc"],
      type: "textinput",
      key: "aiModel",
      value: "gpt-4o-mini",
      direction: "row",
    });
    this.settingUtils.addItem({
      title: `[AI智能体] ${this.i18n["setting.aiCustomHint.title"]}`,
      description: this.i18n["setting.aiCustomHint.desc"],
      type: "textarea",
      key: "aiCustomHint",
      value: "",
      direction: "row",
    });
    this.settingUtils.addItem({
      title: `[AI智能体] ${this.i18n["setting.aiKey.title"]}`,
      description: this.i18n["setting.aiKey.desc"],
      type: "textinput",
      key: "aiKey",
      value: "",
      direction: "row",
      password: true,
    });
    this.settingUtils.addItem({
      title: `[语音音效] ${this.i18n["setting.ttsLang.title"]}`,
      description: this.i18n["setting.ttsLang.desc"],
      type: "select",
      key: "ttsLang",
      value: "zh-CN",
      options: {
        "zh-CN": this.i18n["setting.ttsLang.mandarin"],
        "zh-HK": this.i18n["setting.ttsLang.cantonese"],
        "en-US": this.i18n["setting.ttsLang.english"],
        "ja-JP": this.i18n["setting.ttsLang.japanese"],
      },
      direction: "row",
    });
    this.settingUtils.addItem({
      title: `[语音音效] ${this.i18n["setting.ttsRate.title"]}`,
      description: this.i18n["setting.ttsRate.desc"],
      type: "slider",
      key: "ttsRate",
      value: 1.0,
      direction: "row",
      slider: { min: 0.8, max: 1.5, step: 0.05 },
    });
    this.settingUtils.addItem({
      title: `[语音音效] ${this.i18n["setting.soundEnabled.title"]}`,
      description: this.i18n["setting.soundEnabled.desc"],
      type: "checkbox",
      key: "soundEnabled",
      value: true,
      direction: "row",
    });
    this.settingUtils.addItem({
      title: `[语音音效] ${this.i18n["setting.speechEvalEnabled.title"]}`,
      description: this.i18n["setting.speechEvalEnabled.desc"],
      type: "checkbox",
      key: "speechEvalEnabled",
      value: false,
      direction: "row",
    });

    this.registerTabs();
    if (!this.isMobile) {
      this.registerTopBar();
    }
    this.registerCommands();
    this.registerProtyleSlash();
    // 47-05 lite：注册完成后的值即默认值（load() 在 onLayoutReady 才覆盖）——快照供「恢复默认」
    this.settingDefaults = new Map([...this.settingUtils.settings].map(([k, item]) => [k, item.value]));

    this.eventBus.on("click-blockicon", this.boundBlockIcon);
    this.eventBus.on("open-menu-image", this.boundImageMenu);
    this.eventBus.on("click-flashcard-action", this.boundFlashcardAction);
    this.eventBus.on("open-menu-content", this.boundContentMenu);
    this.eventBus.on("open-menu-blockref", this.boundBlockRefMenu);
    window.addEventListener("message", this.boundWidgetMessage);

    // 防护第三方插件（如 sy-plugin-enhance）在手机端 onLayoutReady 抛错中断思源宿主插件遍历循环：
    // 若真实思源环境下 1500ms 后宿主仍未回调 onLayoutReady，主动自愈完成初始化
    if (typeof window !== "undefined" && (window as any).siyuan?.ws) {
      window.setTimeout(() => {
        if (!this.isUnloaded && this.appInitializing && !this.layoutReadyPromise) {
          void this.onLayoutReady();
        }
      }, 1500);
    }
  }

  /**
   * 官方 Petal Lifecycle 核心契约：
   * 收到数据变更（sync 跨端同步 / overwrite 其他实例写入）时触发。
   * 覆盖此方法以防止思源官方采取默认策略暴力重载整个插件（导致正在进行的考试/刷题中断）。
   */
  async onDataChanged(_reason?: import("siyuan").TPluginDataChangeReason): Promise<void> {
    try {
      this.examApp?.invalidate();
      emitExamEvent("bank-changed", { bank: this.pendingPracticeBankId || "" });
      this.dispatchPublicStats();
    } catch (e) {
      console.warn("[LvExam] onDataChanged handling warning:", e);
    }
  }

  async onLayoutReady() {
    if (this.layoutReadyPromise) return this.layoutReadyPromise;
    this.layoutReadyPromise = this.runLayoutReady();
    return this.layoutReadyPromise;
  }

  private async runLayoutReady() {
    try {
      await this.settingUtils.load();
    } catch (e) {
      // A corrupt/blocked settings file must not prevent the exam app from
      // starting with shipped defaults. SettingUtils keeps invalid fields at
      // their defaults; this catch covers host I/O failures.
      console.error("[LvExam] settings load failed; using defaults", e);
      showMessage(this.i18n["setting.loadFailed"] ?? "设置读取失败，已使用默认值；请检查存储权限后重试。", 5200, "error");
    }
    try {
      this.examApp = await createExamApp(this);
      emitExamEvent("app-ready", { ready: true });
    } catch (e) {
      console.error("[LvExam] app init failed", e);
      showMessage(String(e instanceof Error ? e.message : e), 5200, "error");
    }
    this.appInitializing = false;
    const queued = this.queuedTab;
    this.queuedTab = null;
    if (queued) {
      // 响应应用启动期间用户触发的命令或深度跳转（如有排队请求才打开对应页签）
      this.openTabByType(queued.type, queued.icon, queued.title);
    }
    // 启动时不主动弹窗打扰用户，静默初始化完成，由用户点击顶栏/命令主动进入练习台
    // 48-05：雷切组件面板接入（有界重试；未安装安静降级）
    if (this.examApp) {
      this.speedSwitchHandle = registerExamDailySummary({
        app: this.examApp,
        t: (k, fb) => this.i18n[k] ?? fb ?? k,
        open: () => this.openPractice(),
        dailyGoal: () => Math.max(1, Number(this.settingUtils?.get?.("dailyGoal") ?? 10) || 10),
        findPlugin: (name) => (this.app as unknown as { plugins?: Array<{ name: string }> })?.plugins?.find?.((p) => p.name === name),
      });
      // Epoch 7 Phase 2：启动每日错题复习提醒巡检与零点跨日刷新 (lvTicker.onDateCross)
      this.reviewReminderCtrl = startReviewReminderScheduler(
        this.examApp,
        () => {
          this.openWrongbook();
        },
        (todayKey) => {
          emitExamEvent("date-crossed", { today: todayKey });
        },
      );
    }
    // 47-04/48-06/Epoch 6：挂载考试服务桥公开 API（多别名 + 稳定命令入口 + 按需脱敏统计快照 + 概览）
    this.disposeLvExamBridge = mountLvExamBridge({
      version: manifest.version,
      openPractice: () => this.openPractice(),
      openWrongbook: () => this.openWrongbook(),
      openMock: () => this.openMock(),
      openReport: () => this.openReport(),
      extractToQuiz: (opts) => {
        (this as any).pendingExternalQuiz = opts;
        this.openPractice();
        return true;
      },
      queryQuestions: async (opts) => {
        if (!this.examApp || !this.examApp.kernelOnline) {
          return {
            profile: opts.profile || "candidate",
            total: 0,
            limit: opts.limit || 20,
            offset: opts.offset || 0,
            truncated: false,
            items: [],
          };
        }
        const { formatQuestionByProfile } = await import("@/core/examBridge");
        const bankIds = opts.bankId ? [opts.bankId] : this.examApp.listBanks().map((b) => b.id);
        const questionsArr = await Promise.all(
          bankIds.map(async (bid) => {
            try {
              return await this.examApp!.listQuestions(bid);
            } catch {
              return [];
            }
          }),
        );
        let allQuestions = questionsArr.flat();
        if (opts.ids && opts.ids.length > 0) {
          const idSet = new Set(opts.ids);
          allQuestions = allQuestions.filter((q) => idSet.has(q.id));
        }
        if (opts.type) {
          allQuestions = allQuestions.filter((q) => q.type === opts.type);
        }
        if (opts.kp) {
          const targetKp = opts.kp.trim();
          allQuestions = allQuestions.filter(
            (q) =>
              q.kp === targetKp ||
              q.kp?.startsWith(targetKp + "/") ||
              (q.secondaryKps && q.secondaryKps.some((sk) => sk === targetKp || sk.startsWith(targetKp + "/"))),
          );
        }
        const total = allQuestions.length;
        const offset = Math.max(0, opts.offset || 0);
        const limit = Math.max(1, Math.min(100, opts.limit || 20));
        const paged = allQuestions.slice(offset, offset + limit);
        const profile = opts.profile || "candidate";
        const items = paged.map((q) => formatQuestionByProfile(q, profile));
        return {
          profile,
          total,
          limit,
          offset,
          truncated: offset + limit < total,
          items,
        };
      },
      getStats: () => {
        if (!this.examApp) return null;
        return this.lastPublicStats ?? null;
      },
      statsRead: async (): Promise<unknown> => {
        if (!this.examApp) return null;
        const m = await import("@/core/publicStats");
        const d = this.examApp.derived();
        return m.buildPublicStats(d, this.examApp.attempts.all(), streak(d));
      },
      onBridgeDisposed: () => {
        this.disposeLvExamBridge = undefined;
      },
    });

    // Epoch 6：监听闪卡学习完成事件（刷新跨插件学习统计 + 错题掌握状态双向联动消灭）
    this.cardsReviewedHandler = async (evt: Event) => {
      this.dispatchPublicStats();
      try {
        const custom = evt as CustomEvent<{
          cardID?: string;
          deckID?: string;
          blockID?: string;
          rating?: number; // 1: Again, 2: Hard, 3: Good, 4: Easy
        }>;
        const detail = custom?.detail;
        if (!detail || !detail.blockID || typeof detail.rating !== "number" || !this.examApp) return;

        // 闪卡复习巩固（Good=3 或 Easy=4）且该题目在考试错题本中处于活跃状态时，自动消减/攻克
        if (detail.rating >= 3) {
          const blockID = String(detail.blockID).trim();
          const banks = this.examApp.listBanks();
          for (const bank of banks) {
            const questions = await this.examApp.listQuestions(bank.id);
            const matched = questions.find((q) => q.blockId === blockID || q.id === blockID);
            if (matched) {
              const wrongItems = this.examApp.wrongItems();
              const wrong = wrongItems.find((w) => w.qid === matched.id);
              if (wrong && wrong.status === "active") {
                await this.examApp.setWrongStatus(matched.id, "mastered");
                const stemPreview = (matched.stem || "").replace(/<[^>]*>/g, "").trim().slice(0, 16);
                showMessage(
                  `[小驴考试] 错题「${stemPreview || "试题"}…」已在小驴闪卡复习掌握（Good/Easy），已自动从错题本攻克归档！`,
                  4200,
                  "info",
                );
                break;
              }
            }
          }
        }
      } catch (err) {
        console.warn("[LvExam] cardsReviewedHandler error:", err);
      }
    };
    window.addEventListener("lv-cards:reviewed", this.cardsReviewedHandler);

    // 版本更新引导 lite（TODO 23）：版本变化时提示查看 CHANGELOG
    const K = "lv-exam-last-version";
    try {
      const last = localStorage.getItem(K);
      const ver = manifest.version;
      if (last && last !== ver) {
        showMessage(`${this.i18n["update.title"]} v${ver} · ${this.i18n["update.seeChangelog"]}`, 6000, "info");
      }
      localStorage.setItem(K, ver);
    } catch {
      // 本地记忆不可用时仍完成插件就绪与统计广播。
    }
    // Epoch 7：去中心化自协商统一通知系统生命周期接入
    this.noticeHubCleaner = lvNotify.registerPlugin("siyuan-exam");
    this.dispatchPublicStats();
  }

  private speedSwitchHandle: { dispose: () => void } | null = null;

  /** 对外只读数据接口（TODO 21/24 组）：lv-exam:stats 广播（脱敏聚合，无题目内容） */
  private dispatchPublicStats() {
    if (!this.examApp) return;
    try {
      import("@/core/publicStats").then((m) => {
        const d = this.examApp!.derived();
        const snapshot = m.buildPublicStats(d, this.examApp!.attempts.all(), streak(d)) as unknown as Record<
          string,
          unknown
        >;
        this.lastPublicStats = snapshot; // window.siyuanExam.stats() 的同步缓存
        // 48-02 lite：总线形态（信封 v1，新消费者推荐）；legacy 裸 detail 同时保留（旧消费者兼容）
        emitExamEvent("stats", snapshot);
        window.dispatchEvent(
          new CustomEvent("lv-exam:stats", {
            detail: snapshot,
          }),
        );
      });
    } catch {
      /* 统计失败不影响主流程 */
    }
  }

  /** 全生态联合灾备切面：导出本插件核心学习资产（题库索引、错题本数据与模拟考试历史记录） */
  async dumpData(): Promise<Record<string, unknown>> {
    if (this.examApp) {
      return this.examApp.dumpData();
    }
    return {
      schema: "lv-exam.backup/1",
      exportedAt: new Date().toISOString(),
      banks: [],
      attempts: { v: 2, events: [] },
      mockResults: [],
    };
  }

  /** 全生态联合灾备切面：恢复本插件数据 */
  async restoreData(data: Record<string, unknown>): Promise<boolean> {
    if (this.examApp) {
      const ok = await this.examApp.restoreData(data);
      if (ok) {
        this.dispatchPublicStats();
      }
      return ok;
    }
    return false;
  }

  async onunload() {
    // 移动端宿主全屏 Dialog 清理（卸载期无条件同步销毁，禁止弹 confirm 阻塞）
    this.forceDestroyMobileDialog();

    // 原生设置弹窗软键盘守卫清理
    this.settingViewportCleaner?.();
    this.settingViewportCleaner = undefined;

    // Epoch 7 Phase 7：注销全生态穿透搜索提供者
    this.omnisearchCleaner?.();
    this.omnisearchCleaner = undefined;

    // Epoch 7 Phase 5：注销小驴罗盘注册入口与手机端入口
    this.launchpadCleaner?.();
    this.launchpadCleaner = undefined;
    this.launchpadMobileCleaner?.();
    this.launchpadMobileCleaner = undefined;

    // Epoch 7 Phase 4：注销全生态一键灾备切面
    this.backupCleaner?.();
    this.backupCleaner = undefined;

    // Epoch 7：去中心化统一通知系统生命周期交棒与复习定时器清理
    this.reviewReminderCtrl?.dispose();
    this.reviewReminderCtrl = undefined;
    this.noticeHubCleaner?.();
    this.noticeHubCleaner = undefined;

    this.eventBus.off("click-blockicon", this.boundBlockIcon);
    this.eventBus.off("open-menu-image", this.boundImageMenu);
    this.eventBus.off("click-flashcard-action", this.boundFlashcardAction);
    this.eventBus.off("open-menu-content", this.boundContentMenu);
    this.eventBus.off("open-menu-blockref", this.boundBlockRefMenu);
    window.removeEventListener("message", this.boundWidgetMessage);
    // 48-05：雷切组件注销（注册/注销配对；重试定时器一并清理）
    this.speedSwitchHandle?.dispose();
    this.speedSwitchHandle = null;
    if (this.cardsReviewedHandler) {
      window.removeEventListener("lv-cards:reviewed", this.cardsReviewedHandler);
      this.cardsReviewedHandler = undefined;
    }
    // 47-04/48-06/Epoch 6：公开 API 随插件卸载（多别名安全移除，无孤儿全局）
    if (this.disposeLvExamBridge) {
      this.disposeLvExamBridge();
      this.disposeLvExamBridge = undefined;
    } else {
      const w = window as unknown as Record<string, unknown>;
      delete w.LvExam;
      delete w.siyuanExam;
      delete w.xiaolvExam;
      delete w.lvExam;
    }
    // 37-02 卸载顺序：先最终落盘（此时 dirty 仍在且 isUnloaded 仍为 false 允许物理存储写入），
    // 再 dispose 清定时器，最后设置 isUnloaded 栅栏
    try {
      await this.examApp?.flush();
    } catch {
      /* 尽力而为：失败时 dirty 由 dispose 收尾，不阻塞卸载 */
    }
    try {
      this.examApp?.attempts.dispose();
    } catch {
      /* 卸载栅栏：防卸载后仍触发 saveData */
    }
    try {
      await this.tabApps.clear((instance) => unmount(instance));
    } catch (error) {
      console.error("[LvExam] failed to unmount tabs during unload", error);
    }
    this.isUnloaded = true;
  }

  /** 唯一顶栏入口：点击后直接进入小驴考试主页面。 */
  private registerTopBar() {
    (this as any).topBarElement = this.addTopBar({
      icon: "iconExam",
      title: manifest.displayName["zh-CN"] ?? "小驴考试（内测版）",
      callback: () => this.openPractice(),
    });
    // 重新注册以同步 topBarElement 引用，驱动罗盘收敛
    this.registerLaunchpad();
  }

  private registerLaunchpad() {
    this.launchpadCleaner?.();
    this.launchpadCleaner = lvLaunchpad.register({
      id: "siyuan-exam",
      name: "考试",
      fullName: "小驴考试",
      svgIcon: "icon-lv-exam",
      color: "var(--lv-brand)",
      desc: "题库刷题 · 错题特训",
      digit: 5,
      badge: "今日待测",
      badgeType: "primary",
      actions: ["继续上次练习", "错题复仇特训", "每日一练", "全真计时模拟考试"],
      topBarElement: (this as any).topBarElement,
      onClick: () => this.openExamHome(),
      onAction: (action) => this.handleQuickAction(action),
    });
  }

  private registerTabs() {
    // 页签工厂闭包持有运行时实例；custom.data 会被思源保存布局并 JSON 序列化，
    // 因此不能把 Plugin / ExamApp 放进其中（Plugin.app.plugins 会形成循环引用）。
    const getPlugin = () => this;
    type ExamTabProps = { plugin: LvExamPlugin; examApp: ExamApp | null };
    type ExamTabComponent = Component<ExamTabProps>;
    const tabs: Array<[string, ExamTabComponent]> = [
      [TAB_PRACTICE, PracticeTab],
      [TAB_MOCK, MockTab],
      [TAB_REPORT, ReportTab],
    ];
    for (const [type, component] of tabs) {
      this.addTab({
        type,
        init() {
          const plugin = getPlugin();
          if (plugin.tabApps.has(this)) return;
          if (this.element instanceof HTMLElement) {
            this.element.style.height = "100%";
            this.element.style.display = "flex";
            this.element.style.flexDirection = "column";
          }
          const el = document.createElement("div");
          el.classList.add("fn__flex-1", "lv-exam-tab");
          el.style.height = "100%";
          this.element.appendChild(el);
          const instance = mount(component, {
            target: el,
            props: { plugin, examApp: plugin.examApp },
          });
          plugin.tabApps.set(this, instance);
        },
        destroy() {
          const plugin = getPlugin();
          void plugin.tabApps.destroy(this, (instance) => unmount(instance)).catch((error) => {
            console.error(`[LvExam] failed to unmount tab: ${type}`, error);
          });
        },
      });
    }
  }

  private registerCommands() {
    this.addCommand({
      langKey: "command.openPractice",
      hotkey: adaptHotkey("⌥⌘P"),
      callback: () => this.openPractice(),
    });
    this.addCommand({
      langKey: "command.openMock",
      hotkey: adaptHotkey("⌥⌘M"),
      callback: () => this.openMock(),
    });
    this.addCommand({
      langKey: "command.openReport",
      hotkey: adaptHotkey("⌥⌘R"),
      callback: () => this.openReport(),
    });
    this.addCommand({
      langKey: "command.openWrongbook",
      hotkey: adaptHotkey("⌥⌘E"),
      // 快捷键与移动端命令面板直达错题本
      callback: () => this.openWrongbook(),
    });
    this.addCommand({
      langKey: "command.resetSettings",
      // 47-05 lite：恢复默认设置（逐项写回注册时快照的默认值并持久化）
      callback: async () => {
        for (const [key, def] of this.settingDefaults) {
          if (key === "aiKey") continue; // AI Key 兜底副本不在恢复范围（防误清密钥；密钥库主副本本就不在此）
          this.settingUtils.set(key, def);
        }
        try {
          await this.settingUtils.save();
          showMessage(this.i18n["setting.resetDone"], 4000, "info");
        } catch (e) {
          showMessage((this.i18n["setting.saveFailed"] ?? "设置保存失败；输入已保留，重新打开插件设置后可再次保存。") + " " + String(e instanceof Error ? e.message : e), 6000, "error");
        }
      },
    });
    this.addCommand({
      langKey: "command.resetOnboarding",
      // 25-P1：首用引导可跳过、可重置（清 47-02 的 localStorage 标记，重开练习台即再见）
      callback: () => {
        try {
          localStorage.removeItem("lv-exam-onboarded");
        } catch {
          /* 忽略 */
        }
        showMessage(this.i18n["onboard.resetDone"], 3200, "info");
      },
    });
  }

  private registerProtyleSlash() {
    this.protyleSlash.push({
      filter: ["转为试题", "录入试题", "提取试题", "zhuanwei", "exam", "tiqu", "shiti"],
      html: `<div class="b3-list-item__first"><svg class="b3-list-item__graphic"><use xlink:href="#iconExam"></use></svg><span class="b3-list-item__text">${this.i18n["slash.convertToQuestion"] ?? "转为小驴试题（录入题库）"}</span></div>`,
      id: "lv-exam-convert-to-question",
      callback: async (_protyle: unknown, nodeElement: HTMLElement) => {
        const blockId = nodeElement?.getAttribute?.("data-node-id") || nodeElement?.dataset?.nodeId || "";
        if (!blockId || !this.examApp) {
          showMessage(this.i18n["state.offlineHint"] ?? "请稍候，应用初始化中…", 3000, "info");
          return;
        }
        const bank = this.examApp.listBanks()[0];
        if (!bank) {
          showMessage(this.i18n["guard.needBankFirst"] ?? "请先创建一个题库", 3600, "error");
          return;
        }
        try {
          const kramdown = await this.examApp.deps.client.getBlockKramdown(blockId);
          const source = combineBlockSources([kramdown]);
          const blockTitle = (nodeElement?.getAttribute?.("aria-label") || nodeElement?.getAttribute?.("data-type") || "笔记段落").trim();
          openPracticeView(this, "manual", {
            bankId: bank.id,
            sourceText: source.text || nodeElement.textContent?.trim() || "",
            sourceTitle: blockTitle,
            sourceKind: "block",
            sourceBlockId: blockId,
          });
        } catch {
          openPracticeView(this, "manual", {
            bankId: bank.id,
            sourceText: nodeElement.textContent?.trim() || "",
            sourceKind: "block",
            sourceBlockId: blockId,
          });
        }
      },
    });
  }

  private openTabByType(type: string, icon: string, title: string): boolean {
    // 早于应用就绪的点击延后执行，避免把 null app 固定传入永久报错的页签。
    if (this.appInitializing) {
      this.queuedTab = { type, icon, title };
      if (!this.layoutReadyPromise) {
        void this.onLayoutReady();
      }
      showMessage(this.i18n["state.initializing"] ?? "正在初始化小驴考试，完成后自动打开…", 2400, "info");
      return false;
    }

    // 移动端宿主降级（阻断级修复）：思源手机端不支持 custom tab，降级为全屏 Dialog 承载
    if (this.isMobile) {
      return this.openMobileDialog(type, title);
    }

    // 单例聚焦（26.2）：同类型 Tab 已开则切换过去，避免 tabApps 覆盖引用
    // Layout restoration may expose getOpenedTab under either the short tab
    // type or the persisted custom id. Search both forms before opening a new
    // tab; otherwise every plugin restart can append another practice tab.
    const existing = findOpenedExamTab(this.getOpenedTab(), this.name, type);
    if (existing && focusExamTab(existing)) {
      rememberOpenTab(type);
      return true;
    }
    // During startup the restored Custom model can lag behind its DOM header.
    // Focus that header when present instead of appending a duplicate tab.
    const restoredHeader = findExamTabHeader(this.name, type);
    if (restoredHeader) {
      restoredHeader.click();
      rememberOpenTab(type);
      return true;
    }
    if (this.openingTabs.has(type)) {
      showMessage(this.i18n["state.openTabOpening"] ?? "练习台正在打开，请稍候…", 1800, "info");
      return false;
    }
    this.openingTabs.add(type);
    observeTabOpen(
      () => openTab({
        app: this.app,
        // 宿主以 plugin.name + type 为键查找页签工厂；descriptor 只含可持久化字段。
        custom: createExamTabDescriptor(this.name, type, icon, title),
      }),
      () => {
        this.openingTabs.delete(type);
        rememberOpenTab(type);
      },
      (error) => {
        console.error(`[LvExam] failed to open tab: ${type}`, error);
        this.openingTabs.delete(type);
        const reason = String(error instanceof Error ? error.message : error);
        showMessage(
          (this.i18n["state.openTabFailed"] ?? "无法打开插件页签，请重试。") + ` ${reason}`,
          6000,
          "error",
        );
      },
    );
    return false;
  }

  /**
   * 移动端宿主降级：全屏 Dialog 承载练习台/模考/报告（参照管家 mobile-controller 模式）
   * 100vw / 100dvh + safe-area + touch-action + 统一浮层栈 Esc / Android 返回键与下滑关闭
   */
  private openMobileDialog(type: string, title: string): boolean {
    if (this.mobileDialog?.element && document.body.contains(this.mobileDialog.element)) {
      if (this.currentMobileTabType === type) {
        rememberOpenTab(type);
        return true;
      }
      if (isExamHistoryArmed()) {
        void this.closeMobileDialog().then((closed) => {
          if (closed) {
            this.openMobileDialog(type, title);
          }
        });
        return false;
      }
      void this.closeMobileDialog();
    }

    const componentMap: Record<string, Component<any>> = {
      [TAB_PRACTICE]: PracticeTab,
      [TAB_MOCK]: MockTab,
      [TAB_REPORT]: ReportTab,
    };
    const ComponentClass = componentMap[type] || PracticeTab;

    const dialog = new Dialog({
      title: title || manifest.displayName["zh-CN"] || "小驴考试",
      content: `<div class="lv-exam-mobile-dialog-host" style="width:100%;height:100%;display:flex;flex-direction:column;overflow:hidden;overscroll-behavior:contain;"></div>`,
      width: "100vw",
      height: "100dvh",
      destroyCallback: () => {
        this.cleanupMobileDialog();
      },
    });

    dialog.element.classList.add("lv-exam-mobile-dialog");
    dialog.element.querySelector?.(".b3-dialog")?.classList.add("lv-exam-mobile-dialog");
    const hostEl = dialog.element.querySelector(".lv-exam-mobile-dialog-host");
    if (hostEl) {
      const el = document.createElement("div");
      el.classList.add("fn__flex-1", "lv-exam-tab");
      el.style.width = "100%";
      el.style.height = "100%";
      el.style.display = "flex";
      el.style.flexDirection = "column";
      el.style.overflow = "hidden";
      hostEl.appendChild(el);

      this.mobileComponent = mount(ComponentClass, {
        target: el,
        props: { plugin: this, examApp: this.examApp },
      });
    }

    // 交互统一：顶栏（原生头或自定义 .block__icons）下滑手势关闭 (Pull down to dismiss)
    const bindPullDownDismiss = (targetEl: HTMLElement | null, requireTopBar = false) => {
      if (!targetEl) return;
      let touchStartY = 0;
      let touchStartX = 0;
      let validStart = false;
      targetEl.addEventListener(
        "touchstart",
        (e: TouchEvent) => {
          const target = e.target as HTMLElement | null;
          const isInput = Boolean(target?.closest("input, textarea, select, [contenteditable='true']"));
          validStart = !isInput && (!requireTopBar || Boolean(target?.closest(".block__icons, .b3-dialog__header")));
          if (validStart && e.touches.length > 0) {
            touchStartY = e.touches[0].clientY;
            touchStartX = e.touches[0].clientX;
          }
        },
        { passive: true },
      );
      targetEl.addEventListener(
        "touchend",
        (e: TouchEvent) => {
          if (validStart && e.changedTouches.length > 0) {
            const deltaY = e.changedTouches[0].clientY - touchStartY;
            const deltaX = Math.abs(e.changedTouches[0].clientX - touchStartX);
            if (deltaY > 70 && deltaX < 60) {
              lvLaunchpad.haptic(10);
              void this.closeMobileDialog();
            }
          }
          validStart = false;
        },
        { passive: true },
      );
    };
    bindPullDownDismiss(dialog.element, true);
    this.mobileCloseListener = () => {
      void this.closeMobileDialog();
    };
    dialog.element.addEventListener("lv-exam:close-mobile-dialog", this.mobileCloseListener);
    if (typeof window !== "undefined") {
      window.addEventListener("lv-exam:close-mobile-dialog", this.mobileCloseListener);
    }

    this.mobileViewportCleaner?.();
    if (typeof window !== "undefined" && window.visualViewport) {
      const baseHeight = Math.max(window.innerHeight, window.visualViewport.height || 0);
      const syncMobileViewport = () => {
        if (!dialog.element.isConnected) return;
        const vv = window.visualViewport;
        if (!vv) return;
        const diff = Math.max(window.innerHeight, baseHeight) - vv.height;
        if (diff > 100) {
          dialog.element.style.setProperty("--lv-visual-viewport-h", `${vv.height}px`);
          dialog.element.style.setProperty("--lv-visual-viewport-top", `${Math.max(0, vv.offsetTop || 0)}px`);
          dialog.element.classList.add("lv-keyboard-open");
        } else {
          dialog.element.style.removeProperty("--lv-visual-viewport-h");
          dialog.element.style.removeProperty("--lv-visual-viewport-top");
          dialog.element.classList.remove("lv-keyboard-open");
        }
      };
      window.visualViewport.addEventListener("resize", syncMobileViewport, { passive: true });
      window.visualViewport.addEventListener("scroll", syncMobileViewport, { passive: true });
      this.mobileViewportCleaner = () => {
        window.visualViewport?.removeEventListener("resize", syncMobileViewport);
        window.visualViewport?.removeEventListener("scroll", syncMobileViewport);
      };
    }

    this.mobileDialog = dialog;
    this.currentMobileTabType = type;
    rememberOpenTab(type);

    // 统一浮层栈 Esc 与 Android 原生返回键秒关
    this.mobileSurfaceCleaner?.();
    this.mobileSurfaceCleaner = lvSurfaceStack.push({
      id: "lv-exam-mobile-dialog",
      type: "card",
      dismiss: () => {
        void this.closeMobileDialog();
        return true;
      },
    });

    return false;
  }

  async closeMobileDialog(): Promise<boolean> {
    if (isExamHistoryArmed()) {
      const ok = await requestExitExamWithConfirm();
      if (!ok) return false; // 用户取消退出，保持弹窗继续考试
    }
    if (this.mobileDialog) {
      const d = this.mobileDialog;
      this.mobileDialog = null;
      try {
        d.destroy();
      } catch (err) {
        console.warn("[LvExam] closeMobileDialog error:", err);
      }
    }
    return true;
  }

  private forceDestroyMobileDialog(): void {
    disarmExamHistory();
    if (this.mobileDialog) {
      const d = this.mobileDialog;
      this.mobileDialog = null;
      try {
        d.destroy();
      } catch (err) {
        console.warn("[LvExam] forceDestroyMobileDialog error:", err);
      }
    }
    this.cleanupMobileDialog();
  }

  private cleanupMobileDialog(): void {
    if (this.mobileCloseListener && typeof window !== "undefined") {
      window.removeEventListener("lv-exam:close-mobile-dialog", this.mobileCloseListener);
      this.mobileCloseListener = undefined;
    }
    this.mobileViewportCleaner?.();
    this.mobileViewportCleaner = undefined;
    this.mobileSurfaceCleaner?.();
    this.mobileSurfaceCleaner = undefined;
    if (this.mobileComponent) {
      try {
        unmount(this.mobileComponent);
      } catch (err) {
        console.error("[LvExam] failed to unmount mobile dialog component:", err);
      }
      this.mobileComponent = null;
    }
    this.mobileDialog = null;
    this.currentMobileTabType = null;
  }

  private onBlockIconClick({ detail }: { detail?: { menu?: Menu; blockElements?: HTMLElement[] } }) {
    if (!detail?.menu) {
      return;
    }
    // 查询圈题（v0.2）：查询嵌入块 → 用此查询开始练习
    const el = detail.blockElements?.[0];
    if (el?.getAttribute?.("data-type") === "query_embed" && this.examApp) {
      // 3.8.5 实测：query_embed 的 content 为空、无 data-query 属性，SQL 只在 kramdown 的 {{...}} 内
      let stmt = el.getAttribute("data-query") || (el.textContent ?? "").trim();
      detail.menu.addItem({
        iconHTML: "<svg><use xlink:href='#iconExam'></use></svg>",
        label: this.i18n["blockMenu.queryPractice"],
        click: async () => {
          try {
            const bank = this.examApp!.listBanks()[0];
            if (!bank) {
              showMessage(this.i18n["guard.needBankFirst"], 3600, "error");
              return;
            }
            if (!stmt) {
              const blockId = el.getAttribute("data-node-id") || el.dataset?.nodeId || "";
              if (blockId) {
                const kd = await this.examApp!.deps.client.getBlockKramdown(blockId);
                stmt = (kd.match(/\{\{([\s\S]*?)\}\}/)?.[1] ?? "").trim();
              }
            }
            if (!stmt) {
              showMessage(this.i18n["query.empty"], 3600, "info");
              return;
            }
            const qs = await this.examApp!.queryQuestions(bank.id, stmt);
            if (!qs.length) {
              showMessage(this.i18n["query.empty"], 3600, "info");
              return;
            }
            this.pendingPractice = qs;
            this.pendingPracticeBankId = bank.id;
            emitExamEvent("open-practice-questions", { qids: qs.map((q) => q.id), bank: bank.id });
            this.openPractice();
          } catch (e) {
            showMessage(String(e instanceof Error ? e.message : e), 4800, "error");
          }
        },
      });
      return;
    }
    // 块菜单直通（TODO 2.2 真实化）：题目块 → 加入练习集 / 转卡 / 标记考点 / 编辑 / 在练习台打开
    const blockId = el?.getAttribute?.("data-node-id") || el?.dataset?.nodeId || "";
    if (blockId && this.examApp) {
      const exam = this.examApp;
      const blockTitle = (el?.getAttribute?.("aria-label") || el?.getAttribute?.("data-type") || "当前块").trim();
      // RecallGen-inspired entry: use the selected ordinary block as AI material.
      // Only keep the stable ID in this callback; DOM/plugin objects must never
      // cross the tab request or be persisted by the host.
      detail.menu.addItem({
        iconHTML: "<svg><use xlink:href='#iconExam'></use></svg>",
        label: this.i18n["blockMenu.convertToQuestion"] ?? "转为小驴试题（录入题库）",
        click: async () => {
          if (!exam.kernelOnline) {
            showMessage(this.i18n["state.offlineHint"], 3600, "error");
            return;
          }
          const bank = exam.listBanks()[0];
          if (!bank) {
            showMessage(this.i18n["guard.needBankFirst"], 3600, "error");
            return;
          }
          try {
            const kramdown = await exam.deps.client.getBlockKramdown(blockId);
            const source = combineBlockSources([kramdown]);
            openPracticeView(this, "manual", {
              bankId: bank.id,
              sourceText: source.text || el.textContent?.trim() || "",
              sourceTitle: blockTitle,
              sourceKind: "block",
              sourceBlockId: blockId,
            });
          } catch {
            openPracticeView(this, "manual", {
              bankId: bank.id,
              sourceText: el.textContent?.trim() || "",
              sourceTitle: blockTitle,
              sourceKind: "block",
              sourceBlockId: blockId,
            });
          }
        },
      });
      detail.menu.addItem({
        iconHTML: "<svg><use xlink:href='#iconExam'></use></svg>",
        label: "小驴考试：划词一键制填空卡",
        click: async () => {
          if (!exam.kernelOnline) {
            showMessage(this.i18n["state.offlineHint"], 3600, "error");
            return;
          }
          const bank = exam.listBanks()[0];
          if (!bank) {
            showMessage(this.i18n["guard.needBankFirst"], 3600, "error");
            return;
          }
          try {
            const kramdown = await exam.deps.client.getBlockKramdown(blockId);
            const { extractCardsFromExcerpt } = await import("@/core/excerptCard");
            const res = extractCardsFromExcerpt(
              {
                text: kramdown,
                blockId,
                materialTitle: blockTitle,
              },
              { targetTypes: ["fill"] },
            );
            if (!res.questions.length) {
              showMessage("未检测到高亮（==挖空==）或加粗语法，请在重点词两侧添加 == 或 ** 后再试", 4000, "info");
              return;
            }
            const targetQ = res.questions[0];
            await exam.writeManualQuestion(bank.id, targetQ);
            showMessage(`已成功提取填空题并存入题库：《${targetQ.stem.slice(0, 20)}…》✓`, 3500, "info");
          } catch (e) {
            showMessage(`制卡失败：${String(e instanceof Error ? e.message : e)}`, 4000, "error");
          }
        },
      });
      detail.menu.addItem({
        iconHTML: "<svg><use xlink:href='#iconExam'></use></svg>",
        label: "小驴考试：扫描整篇笔记高亮批量制卡",
        click: async () => {
          if (!exam.kernelOnline) {
            showMessage(this.i18n["state.offlineHint"], 3600, "error");
            return;
          }
          const bank = exam.listBanks()[0];
          if (!bank) {
            showMessage(this.i18n["guard.needBankFirst"], 3600, "error");
            return;
          }
          try {
            const rows = await exam.deps.client.sql(`SELECT root_id, content FROM blocks WHERE id='${blockId.replace(/'/g, "''")}' LIMIT 1`);
            const rootDocId = rows[0]?.root_id ? String(rows[0].root_id) : blockId;
            const doc = await exam.deps.client.exportDocMarkdown(rootDocId);
            const { extractCardsFromExcerpt } = await import("@/core/excerptCard");
            const res = extractCardsFromExcerpt(
              {
                text: doc.content,
                blockId: rootDocId,
                materialTitle: doc.title || blockTitle,
              },
              { targetTypes: ["fill"] },
            );
            if (!res.questions.length) {
              showMessage("未在当前文档中检测到带有 ==重点== 或 **考点** 语法的挖空句", 3500, "info");
              return;
            }
            let count = 0;
            for (const q of res.questions) {
              try {
                await exam.writeManualQuestion(bank.id, q);
                count++;
              } catch {
                /* 忽略个别重复题目 */
              }
            }
            showMessage(`已从《${doc.title || "当前文档"}》扫描并成功批量录入 ${count} 道填空题！✓`, 4000, "info");
          } catch (e) {
            showMessage(`批量扫描制卡失败：${String(e instanceof Error ? e.message : e)}`, 4000, "error");
          }
        },
      });
      detail.menu.addItem({
        iconHTML: "<svg><use xlink:href='#iconExam'></use></svg>",
        label: this.i18n["blockMenu.generateFromBlock"],
        click: async () => {
          if (!exam.kernelOnline) {
            showMessage(this.i18n["state.offlineHint"], 3600, "error");
            return;
          }
          const bank = exam.listBanks()[0];
          if (!bank) {
            showMessage(this.i18n["guard.needBankFirst"], 3600, "error");
            return;
          }
          try {
            const kramdown = await exam.deps.client.getBlockKramdown(blockId);
            const source = combineBlockSources([kramdown]);
            if (!source.text) {
              showMessage(this.i18n["blockMenu.blockSourceEmpty"], 3600, "info");
              return;
            }
            openPracticeView(this, "ai", {
              bankId: bank.id,
              sourceText: source.text,
              sourceTitle: blockTitle,
              sourceKind: "block",
              sourceTruncated: source.truncated,
              sourceBlockId: blockId,
            });
            if (source.truncated) {
              showMessage(this.i18n["blockMenu.blockSourceTruncated"].replace("{n}", String(source.text.length)), 4200, "info");
            }
          } catch (e) {
            const message = String(e instanceof Error ? e.message : e);
            showMessage(this.i18n["blockMenu.blockSourceFailed"].replace("{message}", message), 4800, "error");
          }
        },
      });
      detail.menu.addItem({
        iconHTML: "<svg><use xlink:href='#iconExam'></use></svg>",
        label: this.i18n["blockMenu.addToPractice"],
        click: async () => {
          try {
            const hit = await exam.findQuestionByBlock(blockId);
            if (!hit) {
              showMessage(
                this.examApp!.kernelOnline ? this.i18n["query.empty"] : this.i18n["state.offlineHint"],
                3600,
                "info",
              );
              return;
            }
            this.pendingPractice = [hit.q];
            this.pendingPracticeBankId = hit.bank.id;
            emitExamEvent("open-practice-questions", { qids: [hit.q.id], bank: hit.bank.id });
            this.openPractice();
          } catch (e) {
            showMessage(String(e instanceof Error ? e.message : e), 4800, "error");
          }
        },
      });
      detail.menu.addItem({
        iconHTML: "<svg><use xlink:href='#iconExam'></use></svg>",
        label: this.i18n["blockMenu.toCard"],
        click: async () => {
          try {
            const hit = await exam.findQuestionByBlock(blockId);
            if (!hit) {
              showMessage(
                this.examApp!.kernelOnline ? this.i18n["memory.toCardMissing"] : this.i18n["state.offlineHint"],
                3600,
                "info",
              );
              return;
            }
            const n = await exam.convertToCards(hit.bank.id, hit.bank.name, [hit.q]);
            showMessage(
              n ? `${this.i18n["memory.toCardDone"]} ${n}` : this.i18n["memory.toCardMissing"],
              3200,
              n ? "info" : "error",
            );
          } catch (e) {
            showMessage(String(e instanceof Error ? e.message : e), 4800, "error");
          }
        },
      });
      // 标记考点（2.2）：输入框直通 setExamAttrs（SaveGate 过闸），空值=清除
      detail.menu.addItem({
        iconHTML: "<svg><use xlink:href='#iconExam'></use></svg>",
        label: this.i18n["blockMenu.markKp"],
        click: async () => {
          try {
            const hit = await exam.findQuestionByBlock(blockId);
            if (!hit) {
              showMessage(
                this.examApp!.kernelOnline ? this.i18n["query.empty"] : this.i18n["state.offlineHint"],
                3600,
                "info",
              );
              return;
            }
            const { inputDialogSync } = await import("./libs/dialog");
            const kp = (
              await inputDialogSync({
                title: this.i18n["blockMenu.markKp"],
                placeholder: this.i18n["blockMenu.markKpPlaceholder"],
                defaultText: hit.q.kp ?? "",
              })
            )?.trim();
            if (kp == null) return; // 用户取消
            await exam.markQuestionKp(hit.q, kp);
            showMessage(
              kp ? `${this.i18n["blockMenu.markKpDone"]} ${kp}` : this.i18n["blockMenu.markKpCleared"],
              2800,
              "info",
            );
          } catch (e) {
            showMessage(String(e instanceof Error ? e.message : e), 4800, "error");
          }
        },
      });
      // 编辑 / 在练习台打开（2.2）：移交练习台浏览视图聚焦（qid+bankId；已开 Tab 经窗口事件补齐）
      detail.menu.addItem({
        iconHTML: "<svg><use xlink:href='#iconExam'></use></svg>",
        label: this.i18n["blockMenu.edit"],
        click: async () => {
          const hit = await exam.findQuestionByBlock(blockId).catch(() => null);
          if (!hit) {
            showMessage(
              this.examApp!.kernelOnline ? this.i18n["query.empty"] : this.i18n["state.offlineHint"],
              3600,
              "info",
            );
            return;
          }
          this.pendingEditQid = hit.q.id;
          this.pendingEditBank = hit.bank.id;
          emitExamEvent("edit-question", { qid: hit.q.id, bank: hit.bank.id });
          this.openPractice();
        },
      });
      detail.menu.addItem({
        iconHTML: "<svg><use xlink:href='#iconExam'></use></svg>",
        label: this.i18n["blockMenu.openInBrowse"],
        click: async () => {
          const hit = await exam.findQuestionByBlock(blockId).catch(() => null);
          if (!hit) {
            showMessage(
              this.examApp!.kernelOnline ? this.i18n["query.empty"] : this.i18n["state.offlineHint"],
              3600,
              "info",
            );
            return;
          }
          this.pendingBrowseQid = hit.q.id;
          this.pendingBrowseBank = hit.bank.id;
          emitExamEvent("open-in-browse", { qid: hit.q.id, bank: hit.bank.id });
          this.openPractice();
        },
      });
      return;
    }
    // 兜底项（25-P1 移动端入口）：移动端没有插件顶栏按钮，块菜单是稳定入口——
    // 点击直接打开练习台（应用未就绪时练习台会显示 appNotReady 原因，不再死胡同）
    detail.menu.addItem({
      iconHTML: "<svg><use xlink:href='#iconExam'></use></svg>",
      label: this.i18n["blockMenu.addToPractice"],
      click: () => {
        this.openPractice();
      },
    });
  }

  private onImageMenu({ detail }: { detail?: { menu?: Menu; element?: HTMLElement } }) {
    if (!detail?.menu || !detail?.element) return;
    const img = detail.element;
    const src = img.getAttribute("data-src") || img.getAttribute("src") || "";
    if (!src) return;

    detail.menu.addItem({
      iconHTML: "<svg><use xlink:href='#iconExam'></use></svg>",
      label: this.i18n["menu.ocrQuestion"] ?? "用小驴考试识别试题入库",
      click: async () => {
        try {
          if (!this.examApp) {
            showMessage(this.i18n["state.loading"] ?? "小驴考试正在启动，请稍候…", 2500, "info");
            return;
          }
          const cleanPath = src.startsWith("assets/") ? src : src.includes("/assets/") ? `assets/${src.split("/assets/").pop()}` : src;
          const q = await this.examApp.ocrAndParseQuestion(cleanPath);
          q.status = "draft";
          const bank = this.examApp.listBanks()[0];
          if (bank) {
            await this.examApp.writeManualQuestion(bank.id, q);
            this.pendingEditQid = q.id;
            this.pendingEditBank = bank.id;
            emitExamEvent("edit-question", { qid: q.id, bank: bank.id });
            this.openPractice();
            showMessage("已识别试题并以草稿入库，正在打开编辑表单…", 3000, "info");
          } else {
            await this.examApp.saveAux("draft/manual", {
              v: 1,
              type: q.type === "material" ? "single" : q.type,
              stem: q.stem,
              options: q.options.length ? q.options : ["", "", "", ""],
              answer: q.answer,
              analysis: q.analysis ?? "",
              kp: q.kp ?? "",
              source: q.source ?? cleanPath,
              group: q.group ?? "",
              specOpen: false,
              specUnit: "",
              specAbsTol: "",
              specRelPct: "",
              specAltUnits: "",
              rubricOpen: false,
              rubricText: "",
              at: Date.now(),
            });
            openPracticeView(this, "manual");
            showMessage("已识别试题内容并填入录题草稿，请先创建题库后保存…", 3200, "info");
          }
        } catch (e) {
          showMessage(`识题失败：${String(e instanceof Error ? e.message : e)}`, 4000, "error");
        }
      },
    });
  }

  private onContentMenu({ detail }: { detail?: { menu?: Menu; range?: Range } }) {
    if (!detail?.menu) return;
    const selectedText = detail.range ? detail.range.toString().trim() : "";
    if (!selectedText || selectedText.length < 2) return;

    detail.menu.addItem({
      iconHTML: "<svg><use xlink:href='#iconExam'></use></svg>",
      label: this.i18n["menu.convertToQuestion"] ?? "转为小驴试题（入库）",
      click: async () => {
        if (!this.examApp || !this.examApp.kernelOnline) {
          showMessage(this.i18n["state.offlineHint"] ?? "请稍候，应用初始化中…", 3000, "info");
          return;
        }
        const bank = this.examApp.listBanks()[0];
        if (!bank) {
          showMessage(this.i18n["guard.needBankFirst"] ?? "请先创建一个题库", 3600, "error");
          return;
        }
        openPracticeView(this, "manual", {
          bankId: bank.id,
          sourceText: selectedText,
          sourceTitle: "划选笔记文字",
          sourceKind: "block",
        });
      },
    });

    detail.menu.addItem({
      iconHTML: "<svg><use xlink:href='#iconExam'></use></svg>",
      label: this.i18n["menu.aiFromSelection"] ?? "以划选内容为材料 AI 出题",
      click: async () => {
        if (!this.examApp || !this.examApp.kernelOnline) {
          showMessage(this.i18n["state.offlineHint"] ?? "请稍候，应用初始化中…", 3000, "info");
          return;
        }
        const bank = this.examApp.listBanks()[0];
        if (!bank) {
          showMessage(this.i18n["guard.needBankFirst"] ?? "请先创建一个题库", 3600, "error");
          return;
        }
        openPracticeView(this, "ai", {
          bankId: bank.id,
          sourceText: selectedText,
          sourceTitle: "划选笔记文字",
          sourceKind: "block",
        });
      },
    });
  }

  private onBlockRefMenu({ detail }: { detail?: { menu?: Menu; target?: HTMLElement } }) {
    if (!detail?.menu || !detail?.target) return;
    const refId = detail.target.getAttribute("data-id") || "";
    if (!refId || !this.examApp) return;

    detail.menu.addItem({
      iconHTML: "<svg><use xlink:href='#iconExam'></use></svg>",
      label: "在小驴考试中查看/练习此题",
      click: async () => {
        const hit = await this.examApp!.findQuestionByBlock(refId);
        if (hit) {
          this.pendingPractice = [hit.q];
          this.pendingPracticeBankId = hit.bank.id;
          emitExamEvent("open-practice-questions", { qids: [hit.q.id], bank: hit.bank.id });
          this.openPractice();
        } else {
          showMessage("该引用块未在小驴考试中登记为试题", 3000, "info");
        }
      },
    });
  }

  private onFlashcardAction({ detail }: { detail?: { card?: { blockID?: string }; type?: string } }) {
    if (!detail?.card?.blockID || !detail.type || !this.examApp) return;
    const blockId = detail.card.blockID;
    const typeNum = Number(detail.type);
    if (![1, 2, 3, 4].includes(typeNum)) return;

    void (async () => {
      try {
        const hit = await this.examApp!.findQuestionByBlock(blockId);
        if (hit?.q) {
          const verdict = typeNum >= 3 ? "correct" : "wrong";
          this.examApp!.recordAttempt({
            qid: hit.q.id,
            kind: "practice",
            mode: "flashcard_sync",
            verdict,
            myAnswer: verdict === "correct" ? hit.q.answer : null,
            sessionId: "siyuan-riff",
          });
          void this.examApp!.saveSession().catch(() => undefined);
        }
      } catch {
        /* 容错静默 */
      }
    })();
  }

  openPractice(): boolean {
    return this.openTabByType(TAB_PRACTICE, "iconExam", this.i18n["tab.practice"]);
  }
  openWrongbook(): void {
    openPracticeView(this, "wrongbook");
  }
  openMock(blueprint?: import("./core/mock").Blueprint) {
    if (blueprint) {
      this.pendingMockBlueprint = blueprint;
      emitExamEvent("apply-blueprint", { blueprint });
    }
    this.openTabByType(TAB_MOCK, "iconMock", this.i18n["tab.mock"]);
  }
  openReport() {
    this.openTabByType(TAB_REPORT, "iconReport", this.i18n["tab.report"]);
  }

  /** 小驴罗盘入口：直达考试主页 */
  openExamHome(): boolean {
    return this.openPractice();
  }

  /** 小驴罗盘极速二级行动派发 */
  handleQuickAction(action: string): void {
    switch (action) {
      case "继续上次练习":
        this.resumeLastPractice();
        break;
      case "错题复仇特训":
        void this.startWrongQuestionsDrill();
        break;
      case "每日一练":
      case "开启薄弱知识点10题特训":
        void this.startWeakSpotTraining(10);
        break;
      case "全真计时模拟考试":
      case "开启全真计时模拟考试":
        this.openMock();
        break;
      case "打开今日错题本复习":
        this.openWrongbook();
        break;
      case "导入新试卷与Markdown题库":
        openPracticeView(this, "import");
        break;
      default:
        this.openExamHome();
        break;
    }
  }

  /** 继续上次练习：如果存在中断未完成的做题会话，直接恢复做题；否则进入练习台 */
  resumeLastPractice(): void {
    this.openPractice();
    emitExamEvent("resume-session", {});
  }

  /** 错题复仇特训：筛选在册活跃错题直接发起特训 */
  async startWrongQuestionsDrill(): Promise<boolean> {
    if (!this.examApp || !this.examApp.kernelOnline) {
      this.openWrongbook();
      return false;
    }
    try {
      const banks = this.examApp.listBanks();
      if (!banks.length) {
        this.openWrongbook();
        return false;
      }
      const prefBank = (typeof window !== "undefined" && window.localStorage?.getItem("lv-exam/activeBank")) || "";
      const activeBankId = prefBank && banks.some((b) => b.id === prefBank) ? prefBank : banks[0].id;
      const questions = await this.examApp.listQuestions(activeBankId);
      const derived = this.examApp.derived();
      const wrongQids = new Set(
        [...derived.wrongbook.values()].filter((w) => w.status === "active").map((w) => w.qid),
      );
      let wrongQuestions = questions.filter((q) => wrongQids.has(q.id));
      if (!wrongQuestions.length) {
        for (const b of banks) {
          if (b.id === activeBankId) continue;
          const bQuestions = await this.examApp.listQuestions(b.id);
          const bWrong = bQuestions.filter((q) => wrongQids.has(q.id));
          if (bWrong.length) {
            wrongQuestions = bWrong;
            break;
          }
        }
      }
      if (wrongQuestions.length) {
        const picked = wrongQuestions.slice(0, 20);
        this.pendingPractice = picked;
        this.pendingPracticeBankId = activeBankId;
        emitExamEvent("open-practice-questions", { qids: picked.map((q) => q.id), bank: activeBankId });
        lvLaunchpad.haptic(10);
        this.openPractice();
        return true;
      }
      this.openWrongbook();
      return true;
    } catch (err) {
      console.warn("[LvExam] startWrongQuestionsDrill error:", err);
      this.openWrongbook();
      return false;
    }
  }

  /** 针对薄弱考点或临界遗忘点开启 10 题靶向特训会话 */
  async startWeakSpotTraining(count = 10): Promise<boolean> {
    if (!this.examApp || !this.examApp.kernelOnline) {
      this.openPractice();
      return false;
    }
    try {
      const banks = this.examApp.listBanks();
      if (!banks.length) {
        this.openPractice();
        return false;
      }
      const prefBank = (typeof window !== "undefined" && window.localStorage?.getItem("lv-exam/activeBank")) || "";
      const activeBankId = prefBank && banks.some((b) => b.id === prefBank) ? prefBank : banks[0].id;
      const questions = await this.examApp.listQuestions(activeBankId);
      if (!questions.length) {
        this.openPractice();
        return false;
      }
      const derived = this.examApp.derived();
      const { masteryByKp, weakTop } = await import("@/core/report");
      const { sampleWeakSpotDrill } = await import("@/core/weakSpot");
      const mastery = masteryByKp(questions, derived.byQuestion, this.examApp.attempts.all());
      const weak = weakTop(mastery, 10);
      const weakRoots = weak.map((w) => w.root);
      const wrongQids = new Set<string>(
        [...derived.wrongbook.values()].filter((w) => w.status === "active").map((w) => w.qid),
      );
      const attemptedQids = new Set<string>(derived.byQuestion.keys());

      let picked = sampleWeakSpotDrill({
        bank: questions,
        weakRoots,
        wrongQids,
        attemptedQids,
        count,
      });

      if (!picked.length) {
        const cram = this.examApp.cramDrill(questions);
        picked = (cram.length ? cram : questions).slice(0, count);
      }

      if (picked.length) {
        this.pendingPractice = picked;
        this.pendingPracticeBankId = activeBankId;
        emitExamEvent("open-practice-questions", { qids: picked.map((q) => q.id), bank: activeBankId });
        lvLaunchpad.haptic(10);
      }
      this.openPractice();
      return true;
    } catch (err) {
      console.warn("[LvExam] startWeakSpotTraining error:", err);
      this.openPractice();
      return false;
    }
  }

  /** 全生态穿透搜索：检索题库、错题本与高频实体 */
  async searchOmni(keyword: string): Promise<LvSearchResultItem[]> {
    if (!this.examApp || !keyword.trim()) return [];
    const kw = keyword.trim().toLowerCase();
    const banks = this.examApp.listBanks();
    if (!banks.length) return [];

    const derived = this.examApp.derived();
    const results: LvSearchResultItem[] = [];

    // 1. 匹配题库高频实体
    for (const bank of banks) {
      if (bank.name.toLowerCase().includes(kw)) {
        results.push({
          id: `bank-${bank.id}`,
          source: "考试",
          category: "题库",
          badge: "题库",
          title: `题库：${bank.name}`,
          snippet: bank.category ? `【分类: ${bank.category}】包含本库试题与错题，点击直达` : `包含试题与专项分类，点击切换至此题库`,
          onClick: () => {
            try {
              if (typeof window !== "undefined" && window.localStorage) {
                window.localStorage.setItem("lv-exam/activeBank", bank.id);
              }
            } catch { /* ignore */ }
            this.openPractice();
          },
        });
        if (results.length >= 30) break;
      }
    }

    // 2. 匹配试题与错题实体
    for (const bank of banks) {
      try {
        const questions = await this.examApp.listQuestions(bank.id);
        for (const q of questions) {
          const stem = q.stem || "";
          const analysis = q.analysis || "";
          const kp = q.kp || "";
          const optionsText = (q.options || []).join(" ");
          if (
            stem.toLowerCase().includes(kw) ||
            analysis.toLowerCase().includes(kw) ||
            kp.toLowerCase().includes(kw) ||
            optionsText.toLowerCase().includes(kw)
          ) {
            const isWrong = derived.wrongbook.get(q.id)?.status === "active";
            const category = isWrong ? "错题本" : "题库试题";
            const badge = isWrong ? "错题" : bank.name;
            const title = stem.slice(0, 60).replace(/\n/g, " ");
            const snippet = analysis
              ? `【解析】${analysis.slice(0, 80).replace(/\n/g, " ")}`
              : kp
              ? `【考点】${kp}`
              : stem.slice(60, 120).replace(/\n/g, " ");

            results.push({
              id: `exam-${q.id}`,
              source: "考试",
              category,
              badge,
              title,
              snippet,
              linkBlockId: q.blockId || (q as unknown as { docId?: string }).docId || (q as unknown as { rootId?: string }).rootId,
              onClick: () => {
                if (isWrong) {
                  this.openWrongbook();
                } else {
                  emitExamEvent("open-in-browse", { qid: q.id, bank: bank.id });
                  this.openPractice();
                }
              },
            });
            if (results.length >= 30) break;
          }
        }
        if (results.length >= 30) break;
      } catch (e) {
        console.warn(`[LvExam] searchOmni bank ${bank.id} failed:`, e);
      }
    }
    return results;
  }
}

