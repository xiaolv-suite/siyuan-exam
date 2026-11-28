import * as siyuanApi from "siyuan";
const { showMessage } = siyuanApi;
import manifest from "../../plugin.json";
import { lvBackup, lvLaunchpad, lvNotify, lvOmnisearch, lvSnapshotVault } from "@/libs/lv-notice-kit";
import {
  createExamVaultAdapter,
  EXAM_VAULT_PLUGIN_ID,
  SAFE_PREFERENCE_KEYS,
  VAULT_TRIGGER_STORAGE_KEYS,
} from "../domain/snapshotVaultAdapter";
import { mountLvExamBridge } from "../core/examBridge";
import { registerExamDailySummary } from "../ecosystem/speedSwitch";
import { startReviewReminderScheduler } from "@/core/reviewReminder";
import { emitExamEvent } from "../core/bus";
import { streak } from "../core/replayer";
import { dispatchPublicStats } from "./quickActions";
import type { PluginHost } from "./pluginContext";

export function cleanupExamLocalStorage(): void {
  try {
    if (typeof localStorage === "undefined") return;
    const removeKeys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && (k.startsWith("lv-exam") || k.startsWith("lv_exam"))) removeKeys.push(k);
    }
    for (const k of removeKeys) localStorage.removeItem(k);
  } catch { /* ignore */ }
}

export function setupEarlyEcosystem(plugin: PluginHost): void {
  // 注册宿主思源 API，供罗盘工作台跨插件无依赖打开文档与发内核请求
  const safeGet = <T>(getter: () => T): T | undefined => {
    try { return getter(); } catch { return undefined; }
  };
  lvLaunchpad.registerHostApi({
    openTab: safeGet(() => (typeof siyuanApi.openTab === "function" ? siyuanApi.openTab : undefined)),
    openMobileFileById: safeGet(() => (typeof siyuanApi.openMobileFileById === "function" ? siyuanApi.openMobileFileById : undefined)),
    fetchSyncPost: safeGet(() => (typeof siyuanApi.fetchSyncPost === "function" ? siyuanApi.fetchSyncPost : undefined)),
    app: plugin.app,
  });

  // 挂载罗盘全端统一入口（Protocol v1.7.5 Unified Entry 顶栏+悬浮球收敛）
  plugin.disposer.add(lvLaunchpad.ensureUnifiedEntry(plugin));
  plugin.disposer.add(() => {
    plugin.launchpadCleaner?.();
    plugin.launchpadCleaner = undefined;
  });

  // Epoch 7 Phase 4：注册全生态一键联合灾备切面 (lvBackup)
  plugin.disposer.add(
    lvBackup.register(
      "siyuan-exam",
      async () => plugin.dumpData(),
      async (data) => plugin.restoreData(data),
    ),
  );

  // Wave 1：接入全生态 8 仓共用跨机容灾快照底座 (lvSnapshotVault)
  const vaultAdapter = createExamVaultAdapter({
    dumpData: () => plugin.dumpData(),
    restoreData: (data) => plugin.restoreData(data),
    readSafePreferences: () => {
      const out: Record<string, unknown> = {};
      for (const k of SAFE_PREFERENCE_KEYS) {
        const v = plugin.settingUtils?.get?.(k);
        if (v !== undefined) out[k] = v;
      }
      return out;
    },
    mergeSafePreferences: async (prefs) => {
      if (!plugin.settingUtils) return;
      let changed = false;
      for (const [k, v] of Object.entries(prefs)) {
        const cur = plugin.settingUtils.get?.(k);
        const def = plugin.settingDefaults?.get?.(k);
        if ((cur === undefined || cur === "" || cur === def) && v !== undefined && v !== "") {
          plugin.settingUtils.set?.(k, v);
          changed = true;
        }
      }
      if (changed) {
        await plugin.settingUtils.save?.();
      }
    },
    invalidateApp: () => plugin.examApp?.invalidate(),
    dispatchPublicStats: () => plugin.dispatchPublicStats(),
  });
  const unregisterVault = lvSnapshotVault.register(vaultAdapter);
  plugin.disposer.add(() => {
    unregisterVault();
    lvSnapshotVault.unregister(EXAM_VAULT_PLUGIN_ID);
  });

  // Epoch 7 Phase 7：注册全生态穿透搜索提供者 (lvOmnisearch)
  plugin.disposer.add(
    lvOmnisearch.registerProvider(
      "siyuan-exam",
      (kw) => plugin.searchOmni(kw),
    ),
  );
}

export function setupLayoutReadyEcosystem(plugin: PluginHost): void {
  if (plugin.examApp) {
    plugin.speedSwitchHandle = registerExamDailySummary({
      app: plugin.examApp,
      t: (k, fb) => plugin.i18n[k] ?? fb ?? k,
      open: () => plugin.openExamHome(),
      dailyGoal: () => Math.max(1, Number(plugin.settingUtils?.get?.("dailyGoal") ?? 10) || 10),
      findPlugin: (name) => (plugin.app as unknown as { plugins?: Array<{ name: string }> })?.plugins?.find?.((p) => p.name === name),
    });
    if (plugin.speedSwitchHandle) plugin.disposer.add(plugin.speedSwitchHandle);

    plugin.reviewReminderCtrl = startReviewReminderScheduler(
      plugin.examApp,
      () => {
        plugin.openWrongbook();
      },
      (todayKey) => {
        emitExamEvent("date-crossed", { today: todayKey });
      },
      () => plugin.settingUtils?.get?.("reviewReminderEnabled") !== false,
    );
    if (plugin.reviewReminderCtrl) plugin.disposer.add(plugin.reviewReminderCtrl);

    const handleMuteForever = (e: any) => {
      const cat = e?.detail?.category;
      if (cat === "exam-daily-review" || cat === "exam" || cat === "siyuan-exam") {
        try {
          plugin.settingUtils?.set?.("reviewReminderEnabled", false);
          void plugin.settingUtils?.save?.();
          localStorage.setItem("lv_exam_review_reminder_disabled", "true");
        } catch { /* ignore */ }
      }
    };
    plugin.disposer.addEvent(window, "lv-notice-mute-forever", handleMuteForever);

    const stopVaultWatch = plugin.examApp.storageGateway.onDidSave((key) => {
      if (plugin.isUnloaded || plugin.examApp?.isUnloading) return;
      if (VAULT_TRIGGER_STORAGE_KEYS.has(key)) {
        lvSnapshotVault.scheduleAutoBackup(EXAM_VAULT_PLUGIN_ID);
      }
    });
    plugin.disposer.add(stopVaultWatch);
  }

  plugin.disposeLvExamBridge = mountLvExamBridge({
    version: manifest.version,
    openPractice: () => plugin.openPractice(),
    openWrongbook: () => plugin.openWrongbook(),
    openMock: () => plugin.openMock(),
    openReport: () => plugin.openReport(),
    extractToQuiz: (opts) => {
      (plugin as any).pendingExternalQuiz = opts;
      plugin.openPractice();
      return true;
    },
    queryQuestions: async (opts) => {
      if (!plugin.examApp || !plugin.examApp.kernelOnline) {
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
      const bankIds = opts.bankId ? [opts.bankId] : plugin.examApp.listBanks().map((b) => b.id);
      const questionsArr = await Promise.all(
        bankIds.map(async (bid) => {
          try {
            return await plugin.examApp!.listQuestions(bid);
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
      if (!plugin.examApp) return null;
      return plugin.lastPublicStats ?? null;
    },
    statsRead: async (): Promise<unknown> => {
      if (!plugin.examApp) return null;
      const m = await import("@/core/publicStats");
      const d = plugin.examApp.derived();
      return m.buildPublicStats(d, plugin.examApp.attempts.all(), streak(d));
    },
    onBridgeDisposed: () => {
      plugin.disposeLvExamBridge = undefined;
    },
  });
  if (plugin.disposeLvExamBridge) {
    plugin.disposer.add(plugin.disposeLvExamBridge);
  }

  plugin.cardsReviewedHandler = async (evt: Event) => {
    void plugin.ensureTier2Loaded().catch((err) => console.warn("[LvExam] cardsReviewedHandler ensureTier2Loaded catch:", err));
    dispatchPublicStats(plugin);
    try {
      const custom = evt as CustomEvent<{
        cardID?: string;
        deckID?: string;
        blockID?: string;
        rating?: number;
      }>;
      const detail = custom?.detail;
      if (!detail || !detail.blockID || typeof detail.rating !== "number" || !plugin.examApp) return;

      if (detail.rating >= 3) {
        const blockID = String(detail.blockID).trim();
        const banks = plugin.examApp.listBanks();
        for (const bank of banks) {
          const questions = await plugin.examApp.listQuestions(bank.id);
          const matched = questions.find((q) => q.blockId === blockID || q.id === blockID);
          if (matched) {
            const wrongItems = plugin.examApp.wrongItems();
            const wrong = wrongItems.find((w) => w.qid === matched.id);
            if (wrong && wrong.status === "active") {
              await plugin.examApp.setWrongStatus(matched.id, "mastered");
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
  plugin.disposer.addEvent(window, "lv-cards:reviewed", plugin.cardsReviewedHandler);

  const K = "lv-exam-last-version";
  try {
    const last = localStorage.getItem(K);
    const ver = manifest.version;
    if (last && last !== ver) {
      showMessage(`${plugin.i18n["update.title"]} v${ver} · ${plugin.i18n["update.seeChangelog"]}`, 6000, "info");
    }
    localStorage.setItem(K, ver);
  } catch {
    /* ignore */
  }

  plugin.noticeHubCleaner = lvNotify.registerPlugin("siyuan-exam");
  if (plugin.noticeHubCleaner) {
    plugin.disposer.add(plugin.noticeHubCleaner);
  }
  dispatchPublicStats(plugin);
}
