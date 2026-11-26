import { Plugin, getFrontend } from "siyuan";
import { showMessage } from "./libs/notice";
import "./index.scss";

import { SettingUtils } from "./libs/setting-utils";
import { clearRuntimeAiSecret, migrateLegacyAiKey } from "./ai/secrets";
import manifest from "../plugin.json";
import { unmount } from "svelte";
import { createExamApp } from "./app-runtime";
import type { ExamApp } from "./app";
import type { HostBridge } from "./bridge/hostBridge";
import { emitExamEvent } from "./core/bus";
import { openPracticeView, type ExamPluginLike, type PracticeViewRequest } from "./core/pluginTab";
import { TabAppRegistry } from "./core/tabAppRegistry";
import { DisposerRegistry } from "./core/disposer";
import type { Question } from "./core/types";
import { lvLaunchpad, type LvSearchResultItem } from "./libs/lv-notice-kit";
import { type ReviewReminderController } from "./core/reviewReminder";
import { TIER1_STORE_KEYS, TIER2_STORE_KEYS, ALL_STORE_KEYS } from "./constants";
import { safePerfMark, safePerfMeasure } from "./core/perf";

import {
  TAB_PRACTICE,
  TAB_MOCK,
  TAB_REPORT,
  registerTabs,
  openTabByType,
} from "./bootstrap/tabRegistrars";
import {
  registerTopBar,
  registerLaunchpad,
  registerCommands,
  registerProtyleSlash,
} from "./bootstrap/commandRegistrars";
import { setupPluginSettings } from "./bootstrap/settingsSetup";
import { MobileDialogController } from "./bootstrap/mobileDialogController";
import { handleBlockIconClick } from "./bootstrap/blockMenuHandler";
import {
  handleImageMenu,
  handleContentMenu,
  handleBlockRefMenu,
  handleFlashcardAction,
} from "./bootstrap/editorMenuListeners";
import {
  handleQuickAction,
  startWrongQuestionsDrill,
  startWeakSpotTraining,
  searchOmni,
  dispatchPublicStats,
} from "./bootstrap/quickActions";
import {
  cleanupExamLocalStorage,
  setupEarlyEcosystem,
  setupLayoutReadyEcosystem,
} from "./bootstrap/ecosystemBridge";
import { PLUGIN_ICONS } from "./bootstrap/icons";
import {
  scheduleTier2Load,
  cancelTier2Schedule,
  ensureTier2Loaded,
} from "./bootstrap/tier2Loader";
import type { PluginHost } from "./bootstrap/pluginContext";

export default class LvExamPlugin extends Plugin implements ExamPluginLike, PluginHost {
  static readonly TIER1_KEYS = TIER1_STORE_KEYS;
  static readonly TIER2_KEYS = TIER2_STORE_KEYS;
  static readonly STORE_KEYS = ALL_STORE_KEYS;
  static readonly safePerfMark = safePerfMark;
  static readonly safePerfMeasure = safePerfMeasure;

  tier2Ready = false;
  tier2LoadingPromise?: Promise<void>;
  tier2ScheduledTimer?: ReturnType<typeof setTimeout>;
  tier2IdleId?: number;
  tier2LoadGeneration = 0;

  get lifecycleGeneration(): number {
    return this.tier2LoadGeneration;
  }
  set lifecycleGeneration(v: number) {
    this.tier2LoadGeneration = v;
  }

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
  pendingResumeSession = false;
  pendingPracticeView?: PracticeViewRequest;
  practiceViewRequestId?: string;
  pendingMockBlueprint?: import("./core/mock").Blueprint;
  isMobile = false;
  settingUtils: SettingUtils;
  isUnloaded = false;
  tabApps = new TabAppRegistry();
  examApp: ExamApp | null = null;
  hostBridge: HostBridge | null = null;
  disposer = new DisposerRegistry();
  appInitializing = true;
  layoutReadyPromise: Promise<void> | null = null;
  queuedTab: { type: string; icon: string; title: string } | null = null;
  openingTabs = new Set<string>();

  settingDefaults: Map<string, unknown> = new Map();
  disposeLvExamBridge?: () => void;
  cardsReviewedHandler?: (evt: Event) => void;
  // this.cardsReviewedHandler = async (evt: Event) => { void this.ensureTier2Loaded().catch(
  noticeHubCleaner?: () => void;
  reviewReminderCtrl?: ReviewReminderController;
  launchpadCleaner?: () => void;
  speedSwitchHandle: { dispose: () => void } | null = null;

  private mobileController: MobileDialogController;

  constructor(options: any) {
    super(options);
    this.mobileController = new MobileDialogController(this);
  }

  async onload() {
    safePerfMark("siyuan-exam-onload-start");
    this.isUnloaded = false;
    this.appInitializing = true;
    this.layoutReadyPromise = null;
    this.tier2Ready = false;
    this.tier2LoadGeneration++;
    this.disposer = new DisposerRegistry();
    this.isMobile = getFrontend() === "mobile" || getFrontend() === "browser-mobile" || lvLaunchpad.isMobileFrontend();

    if (this.isMobile) {
      this.mobileController.installSettingKeyboardViewportGuard();
    }

    setupEarlyEcosystem(this);
    registerLaunchpad(this);

    // LIFO 逆序释放：先销毁移动弹窗与页签（触发 Svelte onDestroy 补存最后作答），再排空写链，最后清理 examApp
    this.disposer.add(() => {
      if (this.examApp) {
        if (typeof this.examApp.cancelTier2Schedule === "function") this.examApp.cancelTier2Schedule();
        this.examApp.attempts.dispose();
        this.examApp.stopOfflineReprobe();
      }
      this.hostBridge = null;
      this.examApp = null;
    });
    this.disposer.add(async () => { await this.examApp?.flush(); });
    this.disposer.add(async () => { await this.tabApps.clear((instance) => unmount(instance)); });
    this.disposer.add(() => this.mobileController.forceDestroyMobileDialog());
    this.disposer.add(() => this.cancelTier2Schedule());
    this.disposer.add(() => {
      if (typeof window !== "undefined") {
        const w = window as unknown as Record<string, unknown>;
        delete w.LvExam; delete w.siyuanExam; delete w.xiaolvExam; delete w.lvExam;
      }
    });

    this.addIcons(PLUGIN_ICONS);
    this.settingDefaults = setupPluginSettings(this);
    registerTabs(this);
    if (!this.isMobile) {
      registerTopBar(this);
    }
    registerCommands(this);
    registerProtyleSlash(this);

    const onBlockIcon = (d: any) => handleBlockIconClick(this, d?.detail);
    const onImgMenu = (d: any) => handleImageMenu(this, d?.detail);
    const onFlashcard = (d: any) => handleFlashcardAction(this, d?.detail);
    const onContent = (d: any) => handleContentMenu(this, d?.detail);
    const onBlockRef = (d: any) => handleBlockRefMenu(this, d?.detail);
    const onWidget = (e: MessageEvent) => {
      const d = e.data;
      if (!d || typeof d !== "object") return;
      if (d.type === "lv-exam:open-tab") {
        if (d.tab === "mock") this.openMock();
        else if (d.tab === "report") this.openReport();
        else this.openExamHome();
      }
    };

    this.eventBus.on("click-blockicon", onBlockIcon);
    this.disposer.add(() => this.eventBus.off("click-blockicon", onBlockIcon));
    this.eventBus.on("open-menu-image", onImgMenu);
    this.disposer.add(() => this.eventBus.off("open-menu-image", onImgMenu));
    this.eventBus.on("click-flashcard-action", onFlashcard);
    this.disposer.add(() => this.eventBus.off("click-flashcard-action", onFlashcard));
    this.eventBus.on("open-menu-content", onContent);
    this.disposer.add(() => this.eventBus.off("open-menu-content", onContent));
    this.eventBus.on("open-menu-blockref", onBlockRef);
    this.disposer.add(() => this.eventBus.off("open-menu-blockref", onBlockRef));
    this.disposer.addEvent(window, "message", onWidget);

    if (typeof window !== "undefined" && (window as any).siyuan?.ws) {
      const fallbackTimer = window.setTimeout(() => {
        if (!this.isUnloaded && this.appInitializing && !this.layoutReadyPromise) {
          void this.onLayoutReady();
        }
      }, 1500);
      this.disposer.addTimeout(fallbackTimer);
    }
    safePerfMark("siyuan-exam-onload-end");
    safePerfMeasure("siyuan-exam-onload", "siyuan-exam-onload-start", "siyuan-exam-onload-end");
  }

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
    if (!this.layoutReadyPromise) {
      this.layoutReadyPromise = this.runLayoutReady();
    }
    return this.layoutReadyPromise;
  }

  private async runLayoutReady() {
    safePerfMark("siyuan-exam-layoutready-start");
    safePerfMark("siyuan-exam-tier1-start");
    try {
      const loadedSettings = await this.settingUtils.load();
      await migrateLegacyAiKey(this, loadedSettings).catch((err) => console.warn("[LvExam] migrate legacy aiKey:", err));
      safePerfMark("siyuan-exam-tier1-ready");
      safePerfMeasure("siyuan-exam-tier1-load", "siyuan-exam-tier1-start", "siyuan-exam-tier1-ready");
    } catch (e) {
      safePerfMark("siyuan-exam-tier1-ready");
      console.error("[LvExam] settings load failed; using defaults", e);
      showMessage(this.i18n["setting.loadFailed"] ?? "设置读取失败，已使用默认值；请检查存储权限后重试。", 5200, "error");
    }
    try {
      this.examApp = await createExamApp(this);
      this.hostBridge = this.examApp.bridge;
      this.scheduleTier2Load();
      emitExamEvent("app-ready", { ready: true });
    } catch (e) {
      console.error("[LvExam] app init failed", e);
      showMessage(String(e instanceof Error ? e.message : e), 5200, "error");
    }
    this.appInitializing = false;
    const queued = this.queuedTab;
    this.queuedTab = null;
    if (queued) {
      this.openTabByType(queued.type, queued.icon, queued.title);
    }

    setupLayoutReadyEcosystem(this);
    safePerfMark("siyuan-exam-layoutready-end");
    safePerfMeasure("siyuan-exam-layoutready", "siyuan-exam-layoutready-start", "siyuan-exam-layoutready-end");
    safePerfMeasure("siyuan-exam-startup-total", "siyuan-exam-onload-start", "siyuan-exam-layoutready-end");
  }

  scheduleTier2Load(): void {
    scheduleTier2Load(this);
  }

  cancelTier2Schedule(): void {
    cancelTier2Schedule(this);
  }

  ensureTier2Loaded(): Promise<void> {
    return ensureTier2Loaded(this);
  }

  async dumpData(): Promise<Record<string, unknown>> {
    await this.ensureTier2Loaded();
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

  async restoreData(data: Record<string, unknown>): Promise<boolean> {
    if (!data || typeof data !== "object") return false;
    await this.ensureTier2Loaded();
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
    this.tier2LoadGeneration++;
    this.tier2Ready = false;
    if (this.examApp) {
      this.examApp.tier2LoadGeneration = (this.examApp.tier2LoadGeneration || 0) + 1;
    }

    await this.disposer.disposeAsync();
    clearRuntimeAiSecret();

    if (this.examApp) {
      this.examApp.isUnloaded = true;
    }
    this.layoutReadyPromise = null;
    this.isUnloaded = true;
  }

  async uninstall() {
    await this.onunload();
    cleanupExamLocalStorage();
  }

  openSetting(): void {
    void this.ensureTier2Loaded().catch((err) => console.warn("[LvExam] openSetting ensureTier2Loaded catch:", err));
    this.setting?.open(this.displayName || manifest.displayName?.["zh-CN"] || "小驴考试");
    this.settingUtils?.markSettingDialogHost?.();
  }

  openTabByType(type: string, icon: string, title: string): boolean {
    void this.ensureTier2Loaded().catch((err) => console.warn("[LvExam] openTabByType ensureTier2Loaded catch:", err));
    return openTabByType(this, type, icon, title);
  }

  openMobileDialog(type: string, title: string): boolean {
    return this.mobileController.openMobileDialog(type, title);
  }

  async closeMobileDialog(): Promise<boolean> {
    return this.mobileController.closeMobileDialog();
  }

  openPractice(): boolean {
    void this.ensureTier2Loaded().catch((err) => console.warn("[LvExam] openPractice ensureTier2Loaded catch:", err));
    return this.openTabByType(TAB_PRACTICE, "iconExam", this.i18n["tab.practice"]);
  }

  openWrongbook(): void {
    void this.ensureTier2Loaded().catch((err) => console.warn("[LvExam] openWrongbook ensureTier2Loaded catch:", err));
    openPracticeView(this, "wrongbook");
  }

  openMock(blueprint?: import("./core/mock").Blueprint) {
    void this.ensureTier2Loaded().catch((err) => console.warn("[LvExam] openMock ensureTier2Loaded catch:", err));
    if (blueprint) {
      this.pendingMockBlueprint = blueprint;
      emitExamEvent("apply-blueprint", { blueprint });
    }
    this.openTabByType(TAB_MOCK, "iconMock", this.i18n["tab.mock"]);
  }

  openReport() {
    void this.ensureTier2Loaded().catch((err) => console.warn("[LvExam] openReport ensureTier2Loaded catch:", err));
    this.openTabByType(TAB_REPORT, "iconReport", this.i18n["tab.report"]);
  }

  openExamHome(): boolean {
    void this.ensureTier2Loaded().catch((err) => console.warn("[LvExam] openExamHome ensureTier2Loaded catch:", err));
    this.pendingResumeSession = false;
    return Boolean(openPracticeView(this, "entry"));
  }

  resumeLastPractice(): void {
    this.pendingResumeSession = true;
    if (this.openPractice()) emitExamEvent("resume-session", {});
  }
  handleQuickAction(action: string): void {
    void this.ensureTier2Loaded().catch((err) => console.warn("[LvExam] handleQuickAction ensureTier2Loaded catch:", err));
    handleQuickAction(this, action);
  }
  startWrongQuestionsDrill(): Promise<boolean> { return startWrongQuestionsDrill(this); }
  startWeakSpotTraining(count = 10): Promise<boolean> { return startWeakSpotTraining(this, count); }
  searchOmni(keyword: string): Promise<LvSearchResultItem[]> { return searchOmni(this, keyword); }
  dispatchPublicStats(): void { dispatchPublicStats(this); }
}
