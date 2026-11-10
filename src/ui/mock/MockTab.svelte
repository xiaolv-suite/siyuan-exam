<script lang="ts">
    // 模考场（v0.3）：蓝图配置器 → 全真考试（计时/答题卡/标旗）→ 成绩单
    // 规格见 docs/11 S5/S6/S7；引擎见 src/core/mock.ts（53 项单测覆盖）
    import { onDestroy, onMount } from "svelte";
    import { armExamHistory, disarmExamHistory } from "../../core/examHistoryGuard";

    /** 切屏计数（docs/11 S6：失焦与后台切屏计次进报告，不阻断） */
    function recordScreenSwitch() {
      if (view === "exam" && session && !session.submitted) {
        session.screenSwitches++;
      }
    }
    function onBlur() { recordScreenSwitch(); }
    function onVisibilityChange() {
      if (document.visibilityState === "hidden") {
        recordScreenSwitch();
      } else if (document.visibilityState === "visible") {
        recomputeTimeCompensation();
      }
    }

    /** 手机锁屏/切后台绝对时间戳补偿（回前台时基于绝对时间差重算剩余） */
    function recomputeTimeCompensation() {
      nowTick = Date.now();
      if (view === "exam" && session && !session.submitted) {
        if (session.shouldAutoSubmit(nowTick)) {
          void finishExam(true);
          return;
        }
        if (bp.sectionTimed && currentSection) {
          const sr = session.sectionRemaining(currentSection, nowTick);
          if (sr !== null && sr <= 0) {
            const secIdx = bp.sections.findIndex((s) => s.name === currentSection);
            const nextSec = bp.sections[secIdx + 1];
            if (nextSec) {
              const nextQ = session.state.qids.findIndex((id) => session.sectionOfQ(id) === nextSec.name);
              if (nextQ >= 0) { session.navigateTo(nextQ, nowTick); cursor = nextQ; }
            }
          }
        }
      }
    }
    import type { ExamApp } from "../../app";
    import Rail from "../shared/Rail.svelte";
    import type { Question, QuestionType } from "../../core/types";
    import {
      notifyInline,
      notifyCapsule,
      notifyMockFinishCard,
      showExamNotice,
    } from "../../libs/notice";
    import { withDocLock, lvActivity, lvLaunchpad } from "../../libs/lv-notice-kit";
    const showMessage = (msg: string, timeout = 3000, type: "info" | "error" = "info") => {
      showExamNotice(msg, timeout, type);
    };
    import { assemble, blueprintTotals, defaultMockSections, dedupeSectionNames, MockSession, validateBlueprint, type Blueprint, type BlueprintSection, type SectionSource, type MockRunSnapshot, type MockScore } from "../../core/mock";
    import { newRunId } from "../../core/ids";
    import { emitExamEvent, onExamEvent, computeWeakKnowledgePoints } from "../../core/bus";
    import { openPracticeView, type ExamPluginLike } from "../../core/pluginTab";
    import { answerChoices, isChoiceQuestion, toggleChoice } from "../../core/answerChoices";
    import { specOf, splitBlanks, joinBlanks, formatDisplayAnswer } from "../../core/structuredAnswer";
    import { estimateScore, normalizeEstimateInput } from "../../core/estimate";
    import Icon from "../shared/Icon.svelte";
    import Palette from "../shared/Palette.svelte";
    import type { PaletteCommand } from "../shared/paletteTypes";
    import SaveStatus from "../shared/SaveStatus.svelte";
    import { mockSectionsToCsv, mockHistoryToCsv } from "../../core/exportMd";
    import { renderInlineText } from "../../libs/sanitize";
    import { createQuestionVersionSnapshot } from "../../core/revision";
    import { simulateAllPolicySamples, SCORING_POLICY_LABELS, type ScoringPolicyKind } from "../../core/scoringPolicy";
    import { buildPoolModel, computePercentile, buildScoreBands, buildPercentileCurve, historyPercents, exportPercentileCsv } from "../../core/percentile";
    import { countWordsAndCharacters, generatePaperGrid } from "../../core/wordCount";
    import { getScratchpadText, updateScratchpadText, clearCurrentScratchpad, type ScratchpadStore, type ScratchpadMode } from "../../core/scratchpad";
    import { resolveCbtKeyAction, computeSectionNavigation } from "../../core/cbtKeyboard";
    import { ttsSpeak, ttsSupported } from "../../core/tts";
    import { renderOcclusionSvg } from "../../core/imageOcclusion";
    import { openSiYuanTarget } from "../practice/services/backlinkNavigationService";
    import ScratchpadDrawer from "../practice/ScratchpadDrawer.svelte";
    import PaperAssembleModal from "../practice/PaperAssembleModal.svelte";
    
    let { plugin, examApp }: { plugin: ExamPluginLike; examApp?: ExamApp | null } = $props();
    let appOverride = $state<ExamApp | null>(null);
    const app = $derived<ExamApp | null>(appOverride ?? examApp ?? plugin?.examApp ?? null);
    const i18n = $derived(plugin?.i18n ?? {});
    const t = (k: string, fb = "") => i18n[k] ?? fb;

    /** 侧栏项目卡显示名：当前题库（无题库时回退建库引导文案） */
    let activeBankName = $state("");
    const railBankName = $derived(activeBankName || t("guard.title"));

    let railOpen = $state(false);
    let tabRoot: HTMLDivElement | null = null;
    let menuBtn: HTMLButtonElement | null = null;
    function closeRail() { railOpen = false; menuBtn?.focus(); }

    type View = "config" | "exam" | "report";
    let view: View = $state("config");
    let paletteOpen = $state(false);
    const paletteCommands: PaletteCommand[] = [
      { group: t("palette.views"), icon: "clock", label: t("tab.mock"), keywords: "mock config blueprint", run: () => { if (view !== "exam") showConfig(); } },
      { group: t("palette.actions"), icon: "play", label: t("mock.start"), keywords: "start exam", run: () => { if (view === "config") void startExam(); } },
      { group: t("palette.actions"), icon: "rotate", label: t("mock.resumeGo"), keywords: "resume", run: () => { if (view === "config" && resumable) void resumeExam(); } },
      { group: t("palette.tabs"), icon: "home", label: t("tab.practice"), keywords: "practice", run: () => plugin.openPractice?.() },
      { group: t("palette.tabs"), icon: "chart", label: t("tab.report"), keywords: "report stats", run: () => plugin.openReport?.() },
    ];
    let loading = $state(true);
    let errorMsg = $state("");
    let questions = $state<Question[]>([]);

    let bp = $state<Blueprint>({
      id: "bp-default", name: t("mock.defaultName"), durationS: 3600, passLine: 60,
      shuffleOptions: false, sectionTimed: true,
      scoringPolicy: { v: 1, kind: "standard", floorZero: true, rounding: "raw" },
      sections: []
    });

    let sampleVerifyOpen = $state(false);
    const policySimulations = $derived(simulateAllPolicySamples());

    // ---------- 52-08 模考电子草稿纸（Scratchpad） ----------
    let scratchpadOpen = $state(false);
    let scratchpadStore = $state<ScratchpadStore>({});
    let scratchpadShared = $state("");
    let scratchpadMode = $state<ScratchpadMode>("per_question");

    const currentScratchpadText = $derived.by(() => {
      const qid = current;
      if (!qid) return "";
      return getScratchpadText(scratchpadStore, qid, scratchpadMode, scratchpadShared);
    });

    function onScratchpadInput(text: string) {
      const qid = current;
      if (!qid) return;
      const res = updateScratchpadText(scratchpadStore, qid, text, scratchpadMode, scratchpadShared);
      scratchpadStore = res.store;
      scratchpadShared = res.sharedText;
      persistRun();
    }

    function clearScratchpad() {
      const qid = current;
      if (!qid) return;
      const res = clearCurrentScratchpad(scratchpadStore, qid, scratchpadMode, scratchpadShared);
      scratchpadStore = res.store;
      scratchpadShared = res.sharedText;
      persistRun();
    }

    async function copyScratchpad() {
      const text = currentScratchpadText.trim();
      if (!text) return;
      try {
        await navigator.clipboard.writeText(text);
        showMessage(t("scratchpad.copied"), 2000, "info");
      } catch {
        showMessage("复制失败，请手动选择复制", 3000, "error");
      }
    }

    let session: MockSession | null = $state(null);
    let cursor = $state(0);
    let selected = $state("");
    let answeredMap = $state<Record<string, string>>({});
    let feedbackOn = $state(false);          // 模考默认不即时判分；交卷后统一
    let mockEliminatedChoices = $state<Record<string, boolean>>({});
    $effect(() => {
      if (currentQ?.id) {
        mockEliminatedChoices = {};
      }
    });

    function toggleMockEliminate(val: string, targetEl?: HTMLElement | null) {
      if (examLocked) return;
      const nextVal = !mockEliminatedChoices[val];
      mockEliminatedChoices[val] = nextVal;
      if (targetEl) {
        notifyInline(targetEl, nextVal ? "已划线排除" : "已恢复选项");
      } else {
        notifyCapsule(nextVal ? `已划线排除选项 ${val}` : `已恢复选项 ${val}`, 1200);
      }
      if (nextVal) {
        if (currentQ.type === "multiple" && (answeredMap[current] ?? "").includes(val)) {
          pickOption(val);
        } else if (currentQ.type === "single" && selected === val) {
          pickOption(val);
        }
      }
    }
    let score = $state<MockScore | null>(null);
    let history = $state<any[]>([]);
    let historyDetail = $state(-1);
    let nowTick = $state(Date.now());
    let timer: ReturnType<typeof setInterval> | null = null;
    let startedAt = $state(0);

    // ---------- 运行快照（U19/U20 最小）：runId 与蓝图分离；交卷防重 ----------
    let runId = $state("");
    let submitting = $state(false);
    let handInConfirming = $state(false);
    let resumable = $state<MockRunSnapshot | null>(null);
    let restoreNote = $state("");
    let lastSnapAt = 0;
    let snapshotTimer: ReturnType<typeof setTimeout> | null = null;
    let runSaveBusy = $state(false);
    let runSaveQueued = $state(false);
    let runSaveConfirmed = $state(false);
    let runSaveError = $state("");
    let runSaveRevision = 0;
    let submitError = $state("");
    let extraTimeBusy = $state(false);
    let blueprintBusy = $state(false);
    const BANK_PREF_KEY = "lv-exam/activeBank";
    let starting = $state(false);
    let resumeBusy = $state(false);
    let discardBusy = $state(false);
    // 考试/成绩页保留原题库上下文；配置页再消费题库变化，读取中的后续变化合并重试。
    let bankDataDirty = false;
    let mockDataLoading = false;
    let mockLoadSeq = 0;
    let pendingBankId: string | null = null;
    let historyLoading = $state(true);
    let historyError = $state("");
    let historyRequest = 0;

    async function reloadMockHistory() {
      const request = ++historyRequest;
      historyLoading = true;
      historyError = "";
      try {
        const next = await app.listMockResults();
        if (request === historyRequest) history = next;
      } catch (e) {
        if (request === historyRequest) {
          history = [];
          historyError = t("mock.historyLoadFailed", "模考历史读取失败：{message}").replace("{message}", String(e instanceof Error ? e.message : e));
        }
      } finally {
        if (request === historyRequest) historyLoading = false;
      }
    }

    const blueprintIssues = $derived(validateBlueprint(bp));
    const blueprintBlockingIssues = $derived(blueprintIssues.filter((x) => !x.includes("题数为 0")));
    const hasPositiveSection = $derived(bp.sections.some((s) => s.count > 0));
    const canStartExam = $derived(Boolean(questions.length && bp.sections.length && hasPositiveSection && !blueprintBlockingIssues.length && !loading && !starting && !submitting && !resumeBusy && !discardBusy && !blueprintBusy));
    const examLocked = $derived(submitting || Boolean(session?.submitted));

    function emitMockSessionEnded() {
      if (!session || !score) return;
      const answers = [...session.answers.values()];
      const total = session.state.qids.length;
      const correct = answers.filter((a) => a.verdict === "correct").length;
      const wrong = answers.filter((a) => a.verdict === "wrong").length;

      const answeredKps = answers.map((a) => {
        const targetQ = questions.find((q) => q.id === a.qid);
        return { kp: targetQ?.kp, verdict: a.verdict };
      });
      const weakKps = computeWeakKnowledgePoints(answeredKps);

      emitExamEvent("session-ended", {
        sessionId: runId,
        mode: "mock",
        total,
        correct,
        wrong,
        weakKnowledgePoints: weakKps,
      });

      // Epoch 6：小驴生态联邦标准事件广播 lv-exam:session-ended
      if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
        window.dispatchEvent(
          new CustomEvent("lv-exam:session-ended", {
            detail: {
              v: 1,
              source: "siyuan-exam",
              type: "lv-exam:session-ended",
              eventId: `ev-exam-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
              at: new Date().toISOString(),
              idempotencyKey: `exam-mock-session:${runId}`,
              payload: {
                sessionId: runId,
                mode: "mock",
                total,
                correct,
                wrong,
                weakKnowledgePoints: weakKps,
              },
            },
          }),
        );

        if (weakKps.length > 0) {
          window.dispatchEvent(
            new CustomEvent("lv-exam:weakness-alert", {
              detail: {
                v: 1,
                source: "siyuan-exam",
                type: "lv-exam:weakness-alert",
                eventId: `ev-weak-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
                at: new Date().toISOString(),
                payload: {
                  sessionId: runId,
                  mode: "mock",
                  weakKnowledgePoints: weakKps,
                },
              },
            }),
          );
        }
      }
    }
    const startDisabledReason = $derived(
      !bp.sections.length ? t("mock.needSec")
        : !hasPositiveSection ? t("mock.needPositiveSec", "至少需要一个题数大于 0 的模块")
        : blueprintBlockingIssues.length ? blueprintBlockingIssues.join("；")
        : !questions.length ? t("state.emptyBank")
        : "",
    );

    onDestroy(() => {
      disarmExamHistory();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (timer) { clearInterval(timer); timer = null; }
      // 保证 500ms 窗口内的答案也能在退出前保存
      if (snapshotTimer) { clearTimeout(snapshotTimer); snapshotTimer = null; }
      runSaveQueued = false;
      persistRun(true);
    });

    function armMockExamHistory() {
      armExamHistory({
        isActive: () => view === "exam" && !!session && !session.submitted,
        onSaveDraft: () => {
          persistRun(true);
        },
        onExit: () => {
          if (timer) { clearInterval(timer); timer = null; }
          persistRun(true);
          view = "config";
        },
        confirmTitle: "模考退出确认",
        confirmPrompt: "考试进行中，确认退出？（进度将保存至草稿）",
      });
    }

    /** 快照节流保存（500ms 防抖）：每答一题防抖落盘，关页/休眠后按 wall clock 恢复同一 run */
    function buildRunSnapshot(now: number) {
      const snap = session!.toSnapshot(runId, now);
      if (Object.keys(scratchpadStore).length > 0 || scratchpadShared || scratchpadMode !== "per_question") {
        snap.scratchpad = { store: { ...scratchpadStore }, sharedText: scratchpadShared, mode: scratchpadMode };
      }
      return snap;
    }

    function persistRun(force = false) {
      if (!session || session.submitted || !runId) return;
      const now = Date.now();
      if (!force && now - lastSnapAt < 500) {
        runSaveConfirmed = false;
        runSaveQueued = true;
        if (!snapshotTimer) {
          snapshotTimer = setTimeout(() => {
            snapshotTimer = null;
            persistRun(true);
          }, 500 - (now - lastSnapAt));
        }
        return;
      }
      if (snapshotTimer) { clearTimeout(snapshotTimer); snapshotTimer = null; }
      runSaveQueued = false;
      lastSnapAt = now;
      const revision = ++runSaveRevision;
      runSaveBusy = true;
      runSaveConfirmed = false;
      runSaveError = "";
      // ExamApp.saveMockRun serializes writes through its mockRunSaveTail. This
      // lets a newer snapshot queue behind an older one while preserving the
      // latest-answer-wins ordering even when storage is slow or a retry is
      // triggered during an earlier write.
      void app.saveMockRun(buildRunSnapshot(now)).then(() => {
        if (revision === runSaveRevision) runSaveConfirmed = true;
      }).catch((e) => {
        if (revision === runSaveRevision) {
          runSaveError = t("mock.runSaveFailed", "答题进度保存失败：{message}。当前答案仍保留在页面中，可重试保存。")
            .replace("{message}", String(e instanceof Error ? e.message : e));
        }
      }).finally(() => {
        if (revision === runSaveRevision) runSaveBusy = false;
      });
    }

    function retryRunSave() {
      if (runSaveBusy) return;
      persistRun(true);
    }

    async function extendExamTime() {
      if (!session || !runId || extraTimeBusy || session.state.extraTimeS) return;
      extraTimeBusy = true;
      const previousExtraTime = session.state.extraTimeS ?? 0;
      try {
        session.extendTime(300);
        await app.saveMockRun(buildRunSnapshot(Date.now()));
        lastSnapAt = Date.now();
        showMessage(t("mock.extraAdded"), 3000, "info");
      } catch (e) {
        session.state.extraTimeS = previousExtraTime;
        showMessage(t("mock.extraSaveFailed").replace("{message}", String(e instanceof Error ? e.message : e)), 4200, "error");
      } finally {
        extraTimeBusy = false;
      }
    }

    /** 读取当前题库并恢复进行中的模考。索引尚未完成时允许在当前页重试。 */
    async function loadMockData(requestedId?: string) {
      if (requestedId) pendingBankId = requestedId;
      if (view !== "config" || starting || resumeBusy || discardBusy || mockDataLoading) {
        bankDataDirty = true;
        return;
      }
      if (!app) { loading = false; errorMsg = t("state.appNotReady"); return; }
      const currentSeq = ++mockLoadSeq;
      mockDataLoading = true;
      bankDataDirty = false;
      const requestedBankId = pendingBankId;
      pendingBankId = null;
      loading = true;
      errorMsg = "";
      try {
        const banks = app.listBanks();
        banksList = banks;
        if (!banks.length) {
          questions = [];
          activeBankId = "";
          activeBankName = "";
          resumable = null;
          loading = false;
          errorMsg = t("guard.needBankFirst");
          return;
        }
        let rememberedBank = "";
        try { rememberedBank = localStorage.getItem(BANK_PREF_KEY) ?? ""; } catch { /* 隐私模式 */ }
        const previousBankId = activeBankId;
        const preferredBankId = requestedBankId ?? rememberedBank;
        const targetBankId = banks.some((b) => b.id === preferredBankId) ? preferredBankId : banks[0].id;
        const loadedQuestions = await app.listQuestions(targetBankId);
        if (currentSeq !== mockLoadSeq) return;

        activeBankId = targetBankId;
        activeBankName = banks.find((b) => b.id === activeBankId)?.name ?? "";
        questions = loadedQuestions;
        // 仅在没有可编辑蓝图时生成默认模块，重试不会覆盖用户已经配置的内容。
        if (!bp.sections.length || (previousBankId && previousBankId !== activeBankId)) bp.sections = defaultMockSections(questions);
        // 历史成绩用于恢复报告中的趋势对比；历史读取失败不应阻断当前模考。
        await reloadMockHistory();
        if (currentSeq !== mockLoadSeq) return;

        // 恢复提示（读不到快照=无进行中考试，静默即可；题库不可读时不给恢复入口）
        try {
          const snap = await app.loadMockRun();
          if (currentSeq !== mockLoadSeq) return;
          resumable = null;
          if (snap?.finishedAt) await app.clearMockRun();
          else if (snap && questions.length) resumable = snap;
        } catch { /* 恢复快照失败不应阻断题库使用 */ }
      } catch (e) {
        if (currentSeq !== mockLoadSeq) return;
        questions = [];
        errorMsg = String(e instanceof Error ? e.message : e);
      } finally {
        if (currentSeq === mockLoadSeq) {
          mockDataLoading = false;
          loading = false;
        }
        refreshPendingBankData();
      }
    }

    function refreshPendingBankData() {
      if (bankDataDirty && view === "config" && !starting && !resumeBusy && !discardBusy) void loadMockData();
    }

    /** 所有回配置页的入口统一在此消费考试/成绩期间积累的题库变化。 */
    function showConfig() {
      if (scoreWriteBusy || scoreExportBusy || rewrongBusy) return;
      view = "config";
      refreshPendingBankData();
    }

    let isFullscreen = $state(false);
    function updateFullscreenState() {
      isFullscreen = Boolean(document.fullscreenElement);
    }

    onMount(() => {
      const initMock = () => {
        if (!app) return;
        void loadPresets();
        void loadMockData();
        void loadEstimateHistory();
        if (plugin?.pendingMockBlueprint) {
          bp = plugin.pendingMockBlueprint;
          plugin.pendingMockBlueprint = undefined;
          view = "config";
          showMessage(`已载入试卷蓝图：${bp.name}`, 3000, "info");
        }
      };
      if (app) initMock();
      document.addEventListener("fullscreenchange", updateFullscreenState);
      document.addEventListener("visibilitychange", onVisibilityChange);
      const offs = [
        onExamEvent("app-ready", () => {
          appOverride = plugin?.examApp ?? null;
          if (appOverride) initMock();
        }),
        onExamEvent<{ blueprint: Blueprint; bankId?: string }>("apply-blueprint", (event) => {
          if (event?.payload?.blueprint) {
            bp = event.payload.blueprint;
            if (event.payload.bankId) {
              activeBankId = event.payload.bankId;
            }
            view = "config";
            showMessage(`已载入试卷蓝图：${bp.name}`, 3000, "info");
          }
        }),
        onExamEvent<{ bank: string }>("bank-changed", (event) => {
          bankDataDirty = true;
          pendingBankId = event.payload.bank;
          // 考试与成绩页都保留本次卷面、题库和蓝图，回到配置页后再读取。
          refreshPendingBankData();
        }),
      ];
      // 移动端虚拟键盘避让：监听 visualViewport 动态抬升底边距，防遮挡操作
      if (typeof window !== "undefined") {
        const onViewportChange = () => {
          const vv = window.visualViewport;
          const diff = vv ? Math.max(0, window.innerHeight - vv.height - (vv.offsetTop || 0)) : 0;
          keyboardOpen = diff > 80 || (window.innerWidth <= 759 && window.innerHeight <= 480);
          const inMobileDialog = Boolean(tabRoot?.closest(".lv-exam-mobile-dialog"));
          viewportBottomPad = !inMobileDialog && diff > 80 ? diff : 0;
        };
        onViewportChange();
        window.addEventListener("resize", onViewportChange);
        window.visualViewport?.addEventListener("resize", onViewportChange);
        window.visualViewport?.addEventListener("scroll", onViewportChange);
        offs.push(() => {
          window.removeEventListener("resize", onViewportChange);
          window.visualViewport?.removeEventListener("resize", onViewportChange);
          window.visualViewport?.removeEventListener("scroll", onViewportChange);
        });
      }

      return () => {
        if (timer) { clearInterval(timer); timer = null; }
        if (snapshotTimer) { clearTimeout(snapshotTimer); snapshotTimer = null; }
        document.removeEventListener("fullscreenchange", updateFullscreenState);
        document.removeEventListener("visibilitychange", onVisibilityChange);
        offs.forEach((off) => off());
      };
    });

    const questionMap = $derived.by(() => {
      // eslint-disable-next-line svelte/prefer-svelte-reactivity -- derived 内纯派生映射（重算即生成新引用）
      const map = new Map<string, Question>();
      for (const q of questions) map.set(q.id, q);
      return map;
    });

    let sheetFilter = $state<"all" | "unanswered" | "flagged">("all");
    let sheetDisplayMode = $state<"grid" | "bubble">("grid");

    function onBubbleFill(qid: string, letter: string, qType?: QuestionType) {
      if (examLocked || !session || session.submitted) return;
      const curAns = answeredMap[qid] || "";
      let newAns: string;
      if (qType === "multiple") {
        const letters = curAns.split("").filter(Boolean);
        const idx = letters.indexOf(letter);
        if (idx >= 0) letters.splice(idx, 1);
        else letters.push(letter);
        newAns = letters.sort().join("");
      } else {
        newAns = curAns === letter ? "" : letter;
      }
      session.setAnswer(qid, newAns, Date.now());
      answeredMap = { ...answeredMap, [qid]: newAns };
      persistRun();
    }
    const unansweredIndices = $derived.by(() => {
      if (!session) return [];
      const res: number[] = [];
      const qids = session.state.qids;
      for (let i = 0; i < qids.length; i++) {
        const a = answeredMap[qids[i]];
        if (!a || !a.trim()) res.push(i);
      }
      return res;
    });
    const flaggedIndices = $derived.by(() => {
      if (!session) return [];
      const res: number[] = [];
      const qids = session.state.qids;
      for (let i = 0; i < qids.length; i++) {
        if (session.flags.has(qids[i])) res.push(i);
      }
      return res;
    });

    let collapsedSections = $state<Record<string, boolean>>({});
    function toggleSectionCollapse(secName: string) {
      collapsedSections = { ...collapsedSections, [secName]: !collapsedSections[secName] };
    }

    const sheetSectionGroups = $derived.by(() => {
      if (!session) return [];
      const qids = session.state.qids;
      if (!qids.length) return [];
      const groups: {
        name: string;
        startIndex: number;
        endIndex: number;
        items: { qid: string; index: number }[];
        answeredCount: number;
        flaggedCount: number;
      }[] = [];
      let curGroup: (typeof groups)[0] | null = null;
      for (let i = 0; i < qids.length; i++) {
        const qid = qids[i];
        const explicitSec = session.sectionOfQ(qid);
        const q = questionMap.get(qid);
        const typeLabel = q?.type ? ({
          single: "单项选择题",
          multiple: "多项选择题",
          judge: "判断题",
          fill: "填空题",
          short: "综合解答题",
          material: "材料题",
        }[q.type] || "试题") : "试题";

        // 考场大题分卷手风琴（TODO-01 / EXAM-01）：有显式大题优先用大题；大题量（>25题）或多题型卷按题型自动分区
        const secName = (explicitSec && explicitSec !== "基础题")
          ? explicitSec
          : (q?.type && qids.length > 25 ? typeLabel : (explicitSec || "基础题"));

        if (!curGroup || curGroup.name !== secName) {
          curGroup = {
            name: secName,
            startIndex: i,
            endIndex: i,
            items: [],
            answeredCount: 0,
            flaggedCount: 0,
          };
          groups.push(curGroup);
        }
        curGroup.endIndex = i;
        const isAnswered = Boolean(answeredMap[qid]?.trim());
        const isFlagged = session.flags.has(qid);
        if (isAnswered) curGroup.answeredCount++;
        if (isFlagged) curGroup.flaggedCount++;
        curGroup.items.push({ qid, index: i });
      }
      return groups;
    });

    function gotoNextUnanswered() {
      if (!session || !unansweredIndices.length) return;
      const after = unansweredIndices.find((idx) => idx > cursor);
      goto(after !== undefined ? after : unansweredIndices[0]);
    }

    const totals = $derived(blueprintTotals(bp));
    const current = $derived(session ? session.state.qids[cursor] : null);
    const currentQ = $derived(current ? questionMap.get(current) ?? null : null);
    const currentSection = $derived(current && session ? session.sectionOfQ(current) : "");
    const remainText = $derived(() => {
      if (!session) return "--:--";
      const ms = Math.max(0, session.remaining(nowTick));
      const m = Math.floor(ms / 60000), s = Math.floor((ms % 60000) / 1000);
      return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    });

    function addSection() {
      bp.sections = [...bp.sections, { name: t("mock.newSection"), count: 10, scoreEach: 1, source: "mixed", types: ["single", "multiple", "judge", "fill"] }];
    }
    let sectionRemoveBusy = $state(false);
    async function removeSection(i: number) {
      if (sectionRemoveBusy || !bp.sections[i]) return;
      sectionRemoveBusy = true;
      try {
        const sectionName = bp.sections[i].name || t("mock.sec");
        const { confirmDialogSync } = await import("../../libs/dialog");
        if (!(await confirmDialogSync({
          title: t("mock.removeSectionTitle", "删除考试模块？"),
          content: t("mock.removeSectionConfirm", "将从当前蓝图移除「{name}」模块及其题量、分值和配额。若尚未保存，无法恢复。")
            .replace("{name}", sectionName),
        }))) return;
        bp.sections = bp.sections.filter((_, j) => j !== i);
      } catch (e) {
        errorMsg = String(e instanceof Error ? e.message : e);
      } finally { sectionRemoveBusy = false; }
    }
    function updateSection(i: number, patch: Partial<BlueprintSection>) {
      bp.sections = bp.sections.map((s, j) => (j === i ? { ...s, ...patch } : s));
    }

    /** 55-02 lite：配额满足度实时预览（来源/题型/考点配额下的可出题数），缺口显式提示 */
    const quotaShort = $derived.by(() => {
      if (!bp.sections.length || !questions.length) return [];
      return bp.sections
        .map((s) => {
          const have = questions.filter(
            (q) =>
              (s.source === "mixed" || (q.sourceKind ?? "mock") === s.source) &&
              (!s.types.length || s.types.includes(q.type)) &&
              (!s.kp || q.kp === s.kp || (q.kp?.startsWith(s.kp + "/") ?? false)),
          ).length;
          return { name: s.name, need: s.count, have };
        })
        .filter((x) => x.have < x.need);
    });

    /** 蓝图持久化（TODO 27 P2）：保存/恢复命名蓝图 */
    async function saveBlueprint() {
      if (blueprintBusy) return;
      blueprintBusy = true;
      try { await app.saveAux("mock/blueprint", JSON.parse(JSON.stringify(bp))); showMessage(t("mock.bpSaved"), 3000, "info"); }
      catch (e) { showMessage(t("mock.bpSaveFailed").replace("{message}", String(e instanceof Error ? e.message : e)), 4200, "error"); }
      finally { blueprintBusy = false; }
    }
    async function restoreBlueprint() {
      if (blueprintBusy) return;
      blueprintBusy = true;
      try {
        const saved = await app.loadAux<Blueprint>("mock/blueprint");
        if (Array.isArray(saved?.sections) && saved.sections.length) {
          if (!saved.sections.every((s) => typeof s?.name === "string" && Array.isArray(s.types))) {
            throw new Error(t("mock.bpInvalid", "保存的蓝图内容不完整，请重新配置并保存。"));
          }
          const { confirmDialogSync } = await import("../../libs/dialog");
          if (!(await confirmDialogSync({
            title: t("mock.restoreBlueprintTitle", "恢复已保存的蓝图？"),
            content: t("mock.restoreBlueprintConfirm", "这会覆盖当前未保存的蓝图设置，且无法自动撤销。")
          }))) return;
          bp = saved;
          showMessage(t("mock.bpRestored"), 3000, "info");
        }
        else showMessage(t("mock.bpRestoreEmpty"), 3000, "info");
      } catch (e) { showMessage(String(e instanceof Error ? e.message : e), 4200, "error"); }
      finally { blueprintBusy = false; }
    }

    let sprintBusy = $state(false);
    let printBusy = $state(false);
    let abBusy = $state(false);
    let mockMiniSheetOpen = $state(false);
    let mockSweepOpen = $state(false);
    const sweepIndices = $derived(Array.from(new Set([...unansweredIndices, ...flaggedIndices])).sort((a, b) => a - b));
    let mockPaperGridOpen = $state(false);
    let viewportBottomPad = $state(0);
    let keyboardOpen = $state(false);
    let presetOptions = $state<import("@/core/examPresets").ExamBlueprintPreset[]>([]);
    function readLocal(key: string): string {
      try {
        return typeof localStorage !== "undefined" ? localStorage.getItem(key) ?? "" : "";
      } catch {
        return "";
      }
    }
    function writeLocal(key: string, value: string | null) {
      try {
        if (typeof localStorage !== "undefined") {
          if (value === null) localStorage.removeItem(key);
          else localStorage.setItem(key, value);
        }
      } catch { /* 容错 */ }
    }
    let examFontSize = $state<"normal" | "large" | "xlarge">((readLocal("lv-exam/font-scale") as any) || "normal");
    function cycleExamFontSize() {
      examFontSize = examFontSize === "normal" ? "large" : examFontSize === "large" ? "xlarge" : "normal";
      writeLocal("lv-exam/font-scale", examFontSize);
    }

    let shortLinedPaper = $state(readLocal("lv-exam/lined-paper") === "1");
    let stemHtml = $state("");
    let stemHtmlFor = $state("");
    $effect(() => {
      const q = currentQ;
      if (!q || view !== "exam" || !app) { stemHtml = ""; stemHtmlFor = ""; return; }
      stemHtml = ""; stemHtmlFor = q.id;
      void app.renderStem(q).then((html) => {
        if (html && stemHtmlFor === q.id) stemHtml = html;
      });
    });

    import {
      calculateExamPacingStrategy,
      auditPacingPostMortem,
    } from "@/core/pacingStrategy";

    const pacingStrategy = $derived(calculateExamPacingStrategy(bp));

    const pacingPostMortem = $derived.by(() => {
      if (!score?.sections?.length) return null;
      const actualSecMap: Record<string, number> = {};
      for (const sec of score.sections) {
        actualSecMap[sec.name] = Math.round((sec.timeSpentMs ?? 0) / 1000);
      }
      return auditPacingPostMortem(pacingStrategy, actualSecMap);
    });

    async function exportPacingReport() {
      if (!pacingPostMortem) return;
      const { exportPacingReportMarkdown } = await import("@/core/pacingStrategy");
      const md = exportPacingReportMarkdown(pacingPostMortem);
      const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
      downloadBlob(blob, `${bp.name || "试卷"}-考场配时复盘沙盘.md`);
      showMessage("考场配时复盘报告已导出 ✓", 3000, "info");
    }

    async function exportPaperAuditReport() {
      if (!activeBankId || !app) return;
      try {
        const md = await app.exportPaperAuditMarkdown(activeBankId);
        const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
        downloadBlob(blob, `${bp.name || "试卷"}-难度与大纲体检报告.md`);
        showMessage("试卷预估难度与大纲体检报告已导出 ✓", 3000, "info");
      } catch (e) {
        showMessage(String(e instanceof Error ? e.message : e), 4000, "error");
      }
    }

    let lastSavedMockDoc = $state<{ docId: string; title: string } | null>(null);
    const openInSiYuan = (rootId: string, blockId?: string, opt?: any) => openSiYuanTarget(plugin, rootId, blockId, showMessage, t, opt);

    async function saveMockExamAsDoc() {
      if (!activeBankId || !app || !questions.length) return;
      try {
        const title = `${bp.name || "全真模拟试卷"}-${new Date().toISOString().slice(0, 10)}`;
        const res = await app.saveQuestionsToSiyuanDoc(title, questions, {
          bankId: activeBankId,
          isMock: true,
          durationMinutes: Math.round(bp.durationS / 60),
          passLine: bp.passLine,
        });
        if (res.docId) lastSavedMockDoc = { docId: res.docId, title: res.title };
        showMessage(`全套考卷已存为思源笔记文档：《${res.title}》✓`, 3500, "info");
      } catch (e) {
        showMessage(String(e instanceof Error ? e.message : e), 4000, "error");
      }
    }

    async function loadPresets() {
      if (!app) return;
      try {
        presetOptions = await app.listExamBlueprintPresets();
      } catch { /* 忽略 */ }
    }

    async function onPresetSelected(presetId: string, selectEl?: HTMLSelectElement) {
      if (!presetId || !app) return;
      try {
        bp = await app.applyBlueprintPreset(presetId, activeBankId);
        showMessage("已成功套用标准化考试蓝图！", 2500, "info");
      } catch (e) {
        showMessage(String(e instanceof Error ? e.message : e), 3000, "error");
      } finally {
        if (selectEl) selectEl.value = "";
      }
    }

    async function generateABMockPapers() {
      if (abBusy || !activeBankId || !questions.length) return;
      abBusy = true;
      try {
        const res = await app.generateABExamPapers(activeBankId);
        const { buildCompactQuestionSheetPro } = await import("@/core/printPro");
        const htmlA = buildCompactQuestionSheetPro(`${bp.name || "全真模拟试卷"}（A卷）`, res.paperA, { headerTitle: "A 卷 · 标准题序", columns: "double" });
        const htmlB = buildCompactQuestionSheetPro(`${bp.name || "全真模拟试卷"}（B卷）`, res.paperB, { headerTitle: "B 卷 · 选项乱序防作弊", columns: "double" });

        const blobA = new Blob([htmlA], { type: "text/html;charset=utf-8" });
        downloadBlob(blobA, `${bp.name || "试卷"}-A卷.html`);

        const blobB = new Blob([htmlB], { type: "text/html;charset=utf-8" });
        downloadBlob(blobB, `${bp.name || "试卷"}-B卷.html`);

        showMessage(`${res.diffSummary} 已开始下载 A/B 双卷！`, 3500, "info");
      } catch (e) {
        showMessage(`生成 A/B 卷失败：${String(e instanceof Error ? e.message : e)}`, 4000, "error");
      } finally {
        abBusy = false;
      }
    }

    async function generateAdaptiveSprint() {
      if (sprintBusy || !activeBankId || !questions.length) return;
      sprintBusy = true;
      try {
        const { convertSprintPaperToBlueprint } = await import("@/core/adaptiveMockAssembler");
        const defaultSize = bp.sections.reduce((acc, s) => acc + s.count, 0) || 20;
        const paper = await app.assembleAdaptiveSprintPaper(activeBankId, {
          paperSize: Math.min(30, Math.max(10, Math.min(defaultSize, questions.length))),
        });
        bp = convertSprintPaperToBlueprint(paper);
        showMessage(
          `${paper.title}（盲区 ${paper.composition.criticalBlindspots} + 错题 ${paper.composition.confusingWrongs}）`,
          4000,
          "info",
        );
      } catch (e) {
        showMessage(`冲刺密卷装配失败：${String(e instanceof Error ? e.message : e)}`, 4200, "error");
      } finally {
        sprintBusy = false;
      }
    }

    let mockPrintFormat = $state<"exam" | "answer" | "lecture" | "homework">("exam");
    let reportPrintFormat = $state<"answer" | "lecture" | "exam" | "homework">("answer");
    let mockAssembleOpen = $state(false);
    let mockAssembleQuestions = $state<Question[]>([]);

    function openMockAssemble() {
      if (!questions.length) {
        showMessage("当前模考卷暂无试题", 2000, "info");
        return;
      }
      mockAssembleQuestions = questions;
      mockAssembleOpen = true;
    }

    async function printMockByFormat(format: "exam" | "answer" | "lecture" | "homework" | "interactive") {
      if (printBusy || !activeBankId || !questions.length) return;
      printBusy = true;
      const title = bp.name || "全真模拟试卷";
      try {
        let html: string;
        let suffix: string;
        if (format === "interactive") {
          const { buildInteractiveReviewSheetPro } = await import("../../core/printPro");
          html = buildInteractiveReviewSheetPro(title, questions);
          suffix = "交互式讲题自测卷";
        } else if (format === "answer") {
          html = await app.buildCompactAnswerSheet(title, activeBankId);
          suffix = "独立答案册";
        } else if (format === "lecture") {
          html = await app.buildTeacherLectureSheet(title, activeBankId);
          suffix = "授课讲义卷";
        } else if (format === "homework") {
          html = await app.buildStudentHomeworkSheet(title, activeBankId);
          suffix = "留白作业单";
        } else {
          html = await app.buildCompactQuestionSheet(title, activeBankId);
          suffix = "标准测试卷";
        }
        const win = window.open("", "_blank");
        if (win) {
          win.document.write(html);
          win.document.close();
          win.focus();
        } else {
          const blob = new Blob([html], { type: "text/html;charset=utf-8" });
          downloadBlob(blob, `${bp.name || "试卷"}-${suffix}.html`);
          showMessage(`已生成${suffix}文件`, 3000, "info");
        }
      } catch (e) {
        showMessage(`生成打印卷失败：${String(e instanceof Error ? e.message : e)}`, 4200, "error");
      } finally {
        printBusy = false;
      }
    }

    async function printMockWrongSheet() {
      if (printBusy || !wrongList.length) return;
      const wrongIds = wrongList.map((w) => w.qid);
      const wrongQuestions = questions.filter((q) => wrongIds.includes(q.id));
      if (!wrongQuestions.length) return;
      printBusy = true;
      try {
        const { buildCompactQuestionSheetPro } = await import("@/core/printPro");
        const html = buildCompactQuestionSheetPro(`${bp.name || "模拟考"} · 错题精练攻坚卷`, wrongQuestions, {
          headerTitle: `${bp.name || "全真模拟"} · 错题特训`,
          columns: "double",
          groupByKp: true,
        });
        const win = window.open("", "_blank");
        if (win) {
          win.document.write(html);
          win.document.close();
          win.focus();
        } else {
          const blob = new Blob([html], { type: "text/html;charset=utf-8" });
          downloadBlob(blob, `${bp.name || "试卷"}-错题特训卷.html`);
          showMessage("已生成错题精练试卷文件", 3000, "info");
        }
      } catch (e) {
        showMessage(`打印错题卷失败：${String(e instanceof Error ? e.message : e)}`, 4000, "error");
      } finally {
        printBusy = false;
      }
    }

    async function saveMockWrongsAsDoc() {
      if (!activeBankId || !app || !wrongList.length) return;
      try {
        const wrongIds = wrongList.map((w) => w.qid);
        const wrongQuestions = questions.filter((q) => wrongIds.includes(q.id));
        const title = `${bp.name || "模拟考"} · 错题攻坚手册（${wrongQuestions.length}题）`;
        const res = await withDocLock(`doc-wrongs:${activeBankId}`, async () => {
          return await app.saveQuestionsToSiyuanDoc(title, wrongQuestions, {
            bankId: activeBankId,
            isMock: false,
          });
        });
        if (res.docId) {
          lastSavedMockDoc = { docId: res.docId, title: res.title };
          lvActivity.record({
            source: "考试",
            category: "exam",
            title: `生成错题攻坚手册《${res.title}》`,
            detail: `收录 ${wrongQuestions.length} 道错题`,
            linkBlockId: res.docId,
          });
        }
        showMessage(`已在思源中生成错题集文档：《${res.title}》✓`, 3500, "info");
      } catch (e) {
        showMessage(String(e instanceof Error ? e.message : e), 4000, "error");
      }
    }

    async function startExam() {
      if (starting || loading || resumeBusy || discardBusy || blueprintBusy) return;
      starting = true;
      errorMsg = "";
      try {
        if (!questions.length) { errorMsg = t("state.emptyBank"); return; }
        // 40-02 lite：蓝图健康检查——重名段自动改名（防统计合并）、零题段剔除、其余问题阻断并明示
        const issues = validateBlueprint(bp);
        const blocking = issues.filter((x) => !x.includes("题数为 0"));
        if (blocking.length) { errorMsg = blocking.join("；"); return; }
        let workingBp = dedupeSectionNames(bp);
        const zeroSections = workingBp.sections.filter((s) => s.count === 0);
        if (zeroSections.length) {
          workingBp = { ...workingBp, sections: workingBp.sections.filter((s) => s.count > 0) };
          showMessage(t("mock.zeroSectionDropped").replace("{n}", String(zeroSections.length)), 4200, "info");
        }
        const r = assemble(workingBp, questions);
        if (!r.paper.length) { errorMsg = t("state.emptyBank"); return; }
        if (r.paper.some((q) => q.type === "short" || q.type === "material")) {
          errorMsg = t("mock.unscoredTypes", "当前模考仅支持可自动判分的单选、多选、判断和填空。请在蓝图中排除简答、材料题，或到练习台使用自评。");
          return;
        }
        // 40-02：蓝图短缺不阻断开考，但实际题数/实际满分必须在开考前明示（不由其他题偷偷补齐）
        const requested = workingBp.sections.reduce((n, s) => n + s.count, 0);
        if (r.paper.length < requested) {
          const actualFull = [...r.scoreOf.values()].reduce((a, b) => a + b, 0);
          const { confirmDialogSync } = await import("../../libs/dialog");
          const ok = await confirmDialogSync({
            title: t("mock.shortTitle"),
            content: t("mock.shortBody")
              .replace("{want}", String(requested))
              .replace("{actual}", String(r.paper.length))
              .replace("{full}", String(actualFull)),
          });
          if (!ok) return;
        }
        startedAt = Date.now();
        scoreWriteError = "";
        runId = newRunId();
        bp = workingBp; // 本次考试使用去重/剔除后的蓝图（保存蓝图仍由用户显式操作）
        session = new MockSession(bp, r.paper, { sectionOf: r.sectionOf, scoreOf: r.scoreOf }, startedAt);
        cursor = 0; selected = ""; answeredMap = {}; score = null; attemptsRecorded = false;
        scratchpadOpen = false; scratchpadStore = {}; scratchpadShared = ""; scratchpadMode = "per_question";
        session.enterSection(bp.sections[0]?.name ?? "", startedAt);
        lastSnapAt = 0;
        persistRun();
        view = "exam";
        armMockExamHistory();
        startTimer();
      } catch (e) {
        errorMsg = String(e instanceof Error ? e.message : e);
      } finally {
        starting = false;
        refreshPendingBankData();
      }
    }

    let warned5Min = false;
    let warned1Min = false;

    function startTimer() {
      if (timer) clearInterval(timer);
      if (session) {
        const initRemain = session.remaining(Date.now());
        warned5Min = initRemain <= 300_000;
        warned1Min = initRemain <= 60_000;
      } else {
        warned5Min = false;
        warned1Min = false;
      }
      timer = setInterval(() => {
        nowTick = Date.now();
        if (session?.shouldAutoSubmit(nowTick)) { void finishExam(true); return; }

        if (session) {
          const remainMs = Math.max(0, session.remaining(nowTick));
          if (remainMs <= 300_000 && remainMs > 240_000 && !warned5Min) {
            warned5Min = true;
            lvLaunchpad.haptic(20);
            notifyCapsule("⏱️ 考试剩余时间不足 5 分钟，请抓紧涂卡与核对", 3500);
          } else if (remainMs <= 60_000 && remainMs > 10_000 && !warned1Min) {
            warned1Min = true;
            lvLaunchpad.haptic(35);
            notifyCapsule("🚨 考试剩余最后 1 分钟，准备自动交卷！", 4000);
          }
        }

        // 分段计时归零自动跳段（docs/11 S6：段倒计时归零 → 下一模块首题）
        if (bp.sectionTimed && session && currentSection) {
          const sr = session.sectionRemaining(currentSection, nowTick);
          if (sr !== null && sr <= 0) {
            const secIdx = bp.sections.findIndex((s) => s.name === currentSection);
            const nextSec = bp.sections[secIdx + 1];
            if (nextSec) {
              const nextQ = session.state.qids.findIndex((id) => session.sectionOfQ(id) === nextSec.name);
              if (nextQ >= 0) { session.navigateTo(nextQ, nowTick); cursor = nextQ; }
            }
          }
        }
      }, 1000);
    }

    /** 恢复进行中的 run：答案/标旗/游标原样回填；已过期仅触发一次自动交卷（U19） */
    async function resumeExam() {
      if (!resumable || resumeBusy || loading || starting || discardBusy || blueprintBusy) return;
      resumeBusy = true;
      errorMsg = "";
      const snap = resumable;
      try {
        const r = MockSession.restore(snap, questions);
        // 兜底：卷面题全部读不到（题库被删/离线）→ 不进入空考试，保留快照待题库可用
        if (!r.session.state.qids.length) {
          errorMsg = t("mock.restoreEmpty");
          return;
        }
        session = r.session;
        scoreWriteError = "";
        runId = snap.runId;
        startedAt = snap.startedAt;
        bp = snap.bp;
        const am: Record<string, string> = {};
        for (const a of session.answers.values()) if (a.answer != null) am[a.qid] = a.answer;
        answeredMap = am;
        scratchpadStore = snap.scratchpad?.store ? { ...snap.scratchpad.store } : {};
        scratchpadShared = snap.scratchpad?.sharedText ?? "";
        scratchpadMode = snap.scratchpad?.mode ?? "per_question";
        restoreNote = r.missingQids.length ? t("mock.restoreMissing").replace("{n}", String(r.missingQids.length)) : "";
        resumable = null;
        if (r.alreadySubmitted) {
          // 残留已交卷快照：只重放报告，不重写流水/成绩（U20 恢复不重复交卷）
          score = session.score();
          await reloadMockHistory();
          await app.clearMockRun();
          view = "report";
        disarmExamHistory();
          return;
        }
        if (session.shouldAutoSubmit(Date.now())) {
          // 已过期：恢复后唯一一次自动交卷，不重开考试
          cursor = session.cursor;
          await finishExam(true);
          return;
        }
        cursor = session.cursor;
        selected = answeredMap[session.state.qids[cursor]] ?? "";
        lastSnapAt = 0;
        persistRun();
        view = "exam";
        armMockExamHistory();
        startTimer();
      } catch (e) {
        errorMsg = t("mock.restoreEmpty") + " " + String(e instanceof Error ? e.message : e);
      } finally {
        resumeBusy = false;
        refreshPendingBankData();
      }
    }

    /** 放弃进行中的 run（快照清除；答案不写流水） */
    async function discardRun() {
      if (discardBusy || resumeBusy || starting) return;
      discardBusy = true;
      try {
        const { confirmDialogSync } = await import("../../libs/dialog");
        if (!(await confirmDialogSync({
          title: t("mock.discardTitle", "放弃这场模考？"),
          content: t("mock.discardConfirm", "将删除本机恢复快照和未提交答案，无法恢复；不会生成成绩或作答记录。"),
        }))) return;
        await app.clearMockRun();
        disarmExamHistory();
        resumable = null;
        errorMsg = "";
      } catch (e) {
        errorMsg = String(e instanceof Error ? e.message : e);
      } finally {
        discardBusy = false;
        refreshPendingBankData();
      }
    }

    function pickOption(letter: string) {
      if (!current || !currentQ || feedbackOn || examLocked) return;
      selected = toggleChoice(currentQ.type, answeredMap[current] ?? "", letter);
      session?.setAnswer(current, selected, Date.now());
      answeredMap = { ...answeredMap, [current]: selected };
      persistRun();
    }

    function setTextAnswer(value: string) {
      if (!current || examLocked) return;
      session?.setAnswer(current, value, Date.now());
      answeredMap = { ...answeredMap, [current]: value };
      persistRun();
    }

    function goto(i: number) {
      if (!session || examLocked) return;
      session.navigateTo(i, Date.now());
      cursor = session.cursor;
      // 自动展开目标题目所在的手风琴分卷
      const targetSec = sheetSectionGroups.find((g) => i >= g.startIndex && i <= g.endIndex);
      if (targetSec && collapsedSections[targetSec.name]) {
        collapsedSections = { ...collapsedSections, [targetSec.name]: false };
      }
      selected = answeredMap[session.state.qids[cursor]] ?? "";
      if (bp.sectionTimed && currentSection) session.enterSection(currentSection, Date.now());
      persistRun();
    }

    let attemptsRecorded = false;

    async function finishExam(auto = false) {
      if (submitting || !session) return;
      if (session.submitted) {
        if (submitError) {
          await retryFinishExam();
        }
        return;
      }
      // 提前交卷二次确认（TODO 27：未答完且非自动交卷；45-04 lite 可访问对话框）
      if (!auto && !session.shouldAutoSubmit(Date.now())) {
        if (handInConfirming) return;
        handInConfirming = true;
        const targetSession = session;
        const unanswered = session.state.qids.length - [...session.answers.values()].filter((a) => a.answer?.trim()).length;
        const missingNos = session.state.qids
          .map((id, idx) => (!session.answers.get(id)?.answer?.trim() ? idx + 1 : 0))
          .filter(Boolean);
        const sampleStr = missingNos.length <= 6
          ? missingNos.join("、")
          : missingNos.slice(0, 5).join("、") + ` 等共 ${missingNos.length} 题`;
        try {
          const { confirmDialogSync } = await import("../../libs/dialog");
          const prompt = unanswered > 0
            ? t("mock.confirmHandIn").replace("{n}", String(unanswered)) + `（未答题号：第 ${sampleStr}）`
            : t("mock.confirmHandInAll", "所有题目均已填写，确认交卷？");
          if (!(await confirmDialogSync({ title: t("mock.handIn"), content: prompt + "\n" + t("mock.confirmHandInImpact", "交卷后答案将锁定、计时停止；未答题按 0 分计入本卷成绩。") }))) return;
        } finally { handInConfirming = false; }
        // 确认框打开期间可能已到时自动交卷，不能再次写入相同流水。
        if (submitting || targetSession !== session || session.submitted) return;
      }
      submitting = true;
      submitError = "";
      try {
        if (timer) { clearInterval(timer); timer = null; }
        const submitNow = Date.now();
        session.submit(submitNow);
        // 作答写流水（kind=mock；模考错题自动进错题本——replayer 收录）；examId=runId 与蓝图分离
        const effectiveRunId = runId || "mock-" + bp.id;
        if (!attemptsRecorded) {
          for (const a of session.answers.values()) {
            const q = session.byId.get(a.qid);
            const frozen = session.qVersions.get(a.qid);
            const dwellMs = session.dwellOf(a.qid, submitNow) || a.timeMs;
            app.recordAttempt({
              qid: a.qid, kind: "mock", mode: "paper",
              verdict: a.verdict, myAnswer: a.answer,
              timeMs: dwellMs > 0 ? dwellMs : undefined,
              confidence: session.flags.has(a.qid) ? "guess" : undefined,
              sessionId: effectiveRunId, examId: effectiveRunId,
              queue: "normal", changes: a.changes,
              qVersion: q ? createQuestionVersionSnapshot(q) : (frozen ? { hash: frozen.hash, answer: frozen.answer } : undefined),
            });
            if (a.verdict === "wrong" && q) {
              void app.triggerWrongQuestionAutomation(q);
            }
          }
          // 未答题落 not_attempted 审计轨（40-03：进考试分母但不冒充已答；replayer 跳过不计统计分母）
          for (const qid of session.state.qids) {
            if (!session.answers.has(qid)) {
              const q = session.byId.get(qid);
              const frozen = session.qVersions.get(qid);
              app.recordAttempt({
                qid, kind: "mock", mode: "paper",
                verdict: "not_attempted", myAnswer: null,
                sessionId: effectiveRunId, examId: effectiveRunId,
                queue: "normal",
                qVersion: q ? createQuestionVersionSnapshot(q) : (frozen ? { hash: frozen.hash, answer: frozen.answer } : undefined),
              });
            }
          }
          attemptsRecorded = true;
        }
        await app.flush();
        score = session.score();
        if (score && app) {
          await app.saveMockResult({
            id: bp.id, runId: effectiveRunId, name: bp.name, startedAt, submittedAt: Date.now(), total: score.total, full: score.full, percent: score.percent, pass: score.pass,
            sections: score.sections.map((s) => ({ name: s.name, score: s.score, full: s.full, correct: s.correct, total: s.total })),
            extraTimeS: session.state.extraTimeS,
          });
          await reloadMockHistory();
        }
        await app.clearMockRun();   // 交卷回执落定后清除运行快照
        emitMockSessionEnded();
        view = "report";
        disarmExamHistory();

        if (score) {
          lvLaunchpad.haptic(10);
          const details = buildScoreDetailsSnapshot();
          const wrongCount = details.wrongItems?.length ?? 0;
          notifyMockFinishCard({
            paperName: bp.name || "全真模拟考",
            totalScore: score.total,
            fullScore: score.full,
            percent: score.percent,
            pass: score.pass,
            wrongCount,
            onViewWrongbook: () => {
              mockReviewFilter = "wrong";
              showWrongDetail = true;
              view = "report";
        disarmExamHistory();
            },
            onViewReport: () => {
              view = "report";
        disarmExamHistory();
            },
          });

          // 广播今日全生态活动主干流 (Epoch 7 Phase 3: lvActivity)
          lvActivity.record({
            source: "考试",
            category: "exam",
            title: `完成模拟试卷交卷 (得分: ${score.total}/${score.full})`,
            detail: `正确率 ${score.percent}% · ${score.pass ? "达标合格" : "未及格"} · 错题 ${wrongCount} 道`,
            linkBlockId: lastSavedMockDoc?.docId,
          });
        }
      } catch (e) {
        submitError = t("mock.submitFailed").replace("{message}", String(e instanceof Error ? e.message : e));
        // 自动交卷或保存失败时保持成绩视图可见，用户才能看到“重试保存”入口。
        if (session) view = "exam";
      } finally {
        submitting = false;
      }
    }

    async function retryFinishExam() {
      if (!session || submitting) return;
      // submit() is idempotent; retry only persists the already computed score.
      submitting = true;
      try {
        if (!session.submitted) session.submit(Date.now());
        await app.flush();
        const effectiveRunId = runId || "mock-" + bp.id;
        score = session.score();
        if (score) {
          await app.saveMockResult({ id: bp.id, runId: effectiveRunId, name: bp.name, startedAt, submittedAt: Date.now(), total: score.total, full: score.full, percent: score.percent, pass: score.pass, sections: score.sections.map((s) => ({ name: s.name, score: s.score, full: s.full, correct: s.correct, total: s.total })), extraTimeS: session.state.extraTimeS });
          await reloadMockHistory();
        }
        await app.clearMockRun();
        submitError = "";
        emitMockSessionEnded();
        view = "report";
        disarmExamHistory();

        if (score) {
          lvLaunchpad.haptic(10);
          const details = buildScoreDetailsSnapshot();
          const wrongCount = details.wrongItems?.length ?? 0;
          notifyMockFinishCard({
            paperName: bp.name || "全真模拟考",
            totalScore: score.total,
            fullScore: score.full,
            percent: score.percent,
            pass: score.pass,
            wrongCount,
            onViewWrongbook: () => {
              mockReviewFilter = "wrong";
              showWrongDetail = true;
              view = "report";
        disarmExamHistory();
            },
            onViewReport: () => {
              view = "report";
        disarmExamHistory();
            },
          });

          // 广播今日全生态活动主干流 (Epoch 7 Phase 3: lvActivity)
          lvActivity.record({
            source: "考试",
            category: "exam",
            title: `完成模拟试卷交卷 (得分: ${score.total}/${score.full})`,
            detail: `正确率 ${score.percent}% · ${score.pass ? "达标合格" : "未及格"} · 错题 ${wrongCount} 道`,
            linkBlockId: lastSavedMockDoc?.docId,
          });
        }
      } catch (e) {
        submitError = t("mock.submitFailed").replace("{message}", String(e instanceof Error ? e.message : e));
      } finally { submitting = false; }
    }

    function handleToggleFlag(targetEl?: HTMLElement | null) {
      if (!session || !current || examLocked) return;
      const nextFlagged = !session.flags.has(current);
      session.toggleFlag(current);
      persistRun();
      if (targetEl) {
        notifyInline(targetEl, nextFlagged ? "已标记本题" : "已取消标记");
      } else {
        notifyCapsule(nextFlagged ? "已标记本题（存疑备查）" : "已取消标记", 1800);
      }
    }

    function buildScoreDetailsSnapshot(): import("@/core/exportScore").ScoreMarkdownDetails {
      if (!session) return {};
      const wrongItems: NonNullable<import("@/core/exportScore").ScoreMarkdownDetails["wrongItems"]> = [];
      const flaggedItems: NonNullable<import("@/core/exportScore").ScoreMarkdownDetails["flaggedItems"]> = [];
      for (const a of session.answers.values()) {
        const q = questionMap.get(a.qid);
        if (!q) continue;
        const flagged = session.flags.has(a.qid);
        if (a.verdict === "wrong") {
          wrongItems.push({ q, myAnswer: a.answer, flagged });
        } else if (flagged && a.verdict === "correct") {
          flaggedItems.push({ q, myAnswer: a.answer });
        }
      }
      return { wrongItems, flaggedItems };
    }

    /** 成绩单导出 Markdown（本地下载） */
    let scoreExportBusy = $state(false);
    let scoreWriteBusy = $state(false);
    let scoreWriteError = $state("");
    async function exportScoreMd() {
      if (!score || scoreExportBusy) return;
      scoreExportBusy = true;
      try {
        const m = await import("@/core/exportScore");
        const md = m.scoreToMarkdown(bp, score!, startedAt, buildScoreDetailsSnapshot());
        const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
        downloadBlob(blob, `模考成绩单 ${bp.name}.md`);
        showMessage(t("mock.exportReady", "已开始下载文件。"), 3000, "info");
      } catch (e) {
        showMessage(String(e instanceof Error ? e.message : e), 4200, "error");
      } finally { scoreExportBusy = false; }
    }

    async function writeScoreDoc() {
      if (!score || !activeBankId || scoreWriteBusy) return;
      scoreWriteBusy = true;
      scoreWriteError = "";
      // 写入时固定当前成绩与目标，返回配置或切库不会把它写入另一份题库。
      const targetBankId = activeBankId;
      const result = score;
      const blueprint = JSON.parse(JSON.stringify(bp)) as Blueprint;
      const resultStartedAt = startedAt;
      const details = buildScoreDetailsSnapshot();
      try {
        const { scoreToMarkdown } = await import("@/core/exportScore");
        const docId = await withDocLock(`doc-score:${targetBankId}`, async () => {
          return await app.writeScoreDoc(targetBankId, scoreToMarkdown(blueprint, result, resultStartedAt, details));
        });
        if (docId) {
          lastSavedMockDoc = { docId, title: `模考成绩单 · ${blueprint.name}` };
          lvActivity.record({
            source: "考试",
            category: "exam",
            title: `完成模拟试卷交卷 (得分: ${result.total}/${result.full})`,
            detail: `成绩单已写入题库导出区 · 正确率 ${result.percent}%`,
            linkBlockId: docId,
          });
        }
        showMessage(t("mock.scoreWritten", "成绩单已写入本题库的「导出」文档。"), 3200, "info");
      } catch (e) {
        scoreWriteError = t("mock.scoreWriteFailed", "成绩单写入失败，成绩仍保留，可重试或下载：{message}").replace("{message}", String(e instanceof Error ? e.message : e));
      } finally { scoreWriteBusy = false; }
    }

    let insertDailyBusy = $state(false);
    async function insertScoreToDailyNote() {
      if (!score || !app || insertDailyBusy) return;
      insertDailyBusy = true;
      try {
        const totalCount = score.sections.reduce((acc, s) => acc + s.total, 0);
        const correctCount = score.sections.reduce((acc, s) => acc + s.correct, 0);
        const secSummary = score.sections.map((s) => `${s.name}: ${s.score}/${s.full} (${s.correct}/${s.total})`).join("；");
        const md = [
          `> 🎯 **小驴考试 · 全真模考战绩归档**`,
          `> - **试卷名称**：${bp.name || "全真模拟考试"}`,
          `> - **交卷时间**：${new Date().toLocaleString()}`,
          `> - **卷面得分**：**${score.total}** / ${score.full}（得分率 **${score.percent}%**）`,
          `> - **考核判定**：${score.pass ? "✅ 达标合格" : "❌ 未达标"}（合格线 ${bp.passLine}%）`,
          `> - **题量统计**：共 ${totalCount} 题（正确 ${correctCount} 题，错题 ${wrongList.length} 题）`,
          `> - **分卷明细**：${secSummary}`,
        ].join("\n");
        await withDocLock("daily-note-archive", async () => {
          await app.appendScoreToDailyNote(md);
        });
        showMessage("模考战绩已成功追加写入今日日记文档！✓", 3200, "info");
      } catch (e) {
        showMessage(`写入日记失败：${String(e instanceof Error ? e.message : e)}`, 4000, "error");
      } finally {
        insertDailyBusy = false;
      }
    }

    /** 错题回炉：本次模考错题开练习会话（启动失败可见化，47-06 lite） */
    async function rewrongDrill() {
      if (!session || rewrongBusy || !wrongList.length) return;
      const wrongIds = [...session.answers.values()].filter((a) => a.verdict === "wrong").map((a) => a.qid);
      const wrongs = questions.filter((q) => wrongIds.includes(q.id));
      if (!wrongs.length) return;
      rewrongBusy = true;
      try {
        await app.startSession(wrongs, "wrong", activeBankId);
        // 练习台已打开时同步到现有组件；未打开时由 pending 入口接管。
        if (plugin) {
          plugin.pendingPractice = wrongs;
          plugin.pendingPracticeBankId = activeBankId;
        }
        emitExamEvent("open-practice-questions", { qids: wrongs.map((q) => q.id), bank: activeBankId });
      } catch (e) {
        showMessage(String(e instanceof Error ? e.message : e), 4200, "error");
        return;
      } finally {
        rewrongBusy = false;
      }
      openPractice();
    }
    let rewrongBusy = $state(false);

    let targetDrillBusy = $state(false);
    async function createMockTargetDrill() {
      if (!session || targetDrillBusy || !wrongList.length || !app) return;
      targetDrillBusy = true;
      try {
        const wrongIds = [...session.answers.values()].filter((a) => a.verdict === "wrong").map((a) => a.qid);
        const wrongs = questions.filter((q) => wrongIds.includes(q.id));
        if (!wrongs.length) return;
        const tag = `mock-run-${new Date(startedAt || Date.now()).toISOString().replace(/[-:T]/g, "").slice(0, 12)}`;
        for (const w of wrongs) {
          try {
            await app.tagQuestion(w as Question & { blockId: string }, tag, "add");
          } catch {
            if (!w.userTags) w.userTags = [];
            if (!w.userTags.includes(tag)) w.userTags.push(tag);
          }
        }
        showMessage(`已为 ${wrongs.length} 道错题打上「${tag}」专场标签，立即开启靶向攻坚！`, 3500, "info");
        await app.startSession(wrongs, "wrong", activeBankId);
        if (plugin) {
          plugin.pendingPractice = wrongs;
          plugin.pendingPracticeBankId = activeBankId;
        }
        emitExamEvent("open-practice-questions", { qids: wrongs.map((q) => q.id), bank: activeBankId });
        openPractice();
      } catch (e) {
        showMessage(`生成专属攻坚卷失败：${String(e instanceof Error ? e.message : e)}`, 4000, "error");
      } finally {
        targetDrillBusy = false;
      }
    }

    // ---------- 复盘（44-07 lite）：本次错题清单 + 加入下一步行动（U15 去重） ----------
    const wrongList = $derived(score && session
      ? [...session.answers.values()].filter((a) => a.verdict === "wrong").map((a) => ({
          qid: a.qid,
          stem: (questionMap.get(a.qid)?.stem ?? a.qid).slice(0, 40),
        }))
      : []);

    const subjectiveQuestions = $derived(
      session
        ? session.state.qids
            .map((id) => questionMap.get(id))
            .filter((q): q is Question => q?.type === "short")
        : []
    );

    async function applySubjectiveSelfRating(qid: string, factor: number) {
      if (!session) return;
      session.rateSubjectiveQuestion(qid, factor);
      score = session.score();
      const effectiveRunId = runId || "mock-" + bp.id;
      if (score && app) {
        await app.saveMockResult({
          id: bp.id,
          runId: effectiveRunId,
          name: bp.name,
          startedAt,
          total: score.total,
          full: score.full,
          percent: score.percent,
          pass: score.pass,
          sections: score.sections.map((s) => ({
            name: s.name,
            score: s.score,
            full: s.full,
            correct: s.correct,
            total: s.total,
          })),
          extraTimeS: session.state.extraTimeS,
        });
        await reloadMockHistory();
        showMessage(`主观大题得分已重新结算！当前卷面总分：${score.total} / ${score.full}（${score.percent}%）`, 2200, "info");
      }
    }
    let mockActionNote = $state("");
    let mockActionBusy = $state(false);
    let mockReasonBusy = $state(false);

    async function wrongsToActions() {
      if (!wrongList.length || mockActionBusy) return;
      mockActionBusy = true; mockActionNote = "";
      try {
        const r = await app.addActions(wrongList.map((w) => ({
          kind: "redo" as const,
          qid: w.qid,
          sessionId: runId || "mock-" + bp.id,
          detail: `${t("action.kind.redo")}：${w.stem}`,
        })));
        mockActionNote = t("action.added").replace("{n}", String(r.added)).replace("{d}", String(r.skipped));
      } catch (e) {
        mockActionNote = String(e instanceof Error ? e.message : e);
      } finally { mockActionBusy = false; }
    }

    /** 批量错因标注（44-07 lite）：本次全部错题标记同一错因（逐题已有细粒度入口） */
    async function bulkWrongReason(reason: "careless" | "unknown" | "trap") {
      if (!wrongList.length || mockReasonBusy) return;
      mockReasonBusy = true;
      let ok = 0;
      let failed = 0;
      try {
        for (const w of wrongList) {
          try { await app.saveWrongReason(w.qid, reason); ok++; } catch { failed++; }
        }
        showMessage((failed ? t("mock.bulkReasonPartial").replace("{ok}", String(ok)).replace("{failed}", String(failed)) : t("mock.bulkReasonDone").replace("{n}", String(ok))), 4200, failed ? "error" : "info");
      } finally { mockReasonBusy = false; }
    }

    function openPractice() {
      plugin.openPractice?.();
    }

    function onTaskNav(target: "today" | "bank" | "create" | "mock" | "report") {
      if (target === "mock") return;
      if (target === "report") return plugin.openReport?.();
      const next = target === "today" ? "entry" : target === "bank" ? "browse" : "manual";
      openPracticeView(plugin, next);
    }

    function historyPoints(): string {
      return history.map((h, i) => `${(i / Math.max(1, history.length - 1)) * 300},${100 - Math.round(h.percent)}`).join(" ");
    }
    /** 三线对比数据（docs/11 S7）：本次 / 历史均值 / 及格线目标（本地版以及格线为目标锚） */
    const tri = $derived(score ? {
      this: percentBar(score.total, score.full),
      // 历史记录尚未保存完整卷面与评分条件，不能把不同卷子的百分比混算作进步基线。
      avg: null as number | null,
      target: bp.passLine,
    } : null);
    // ---------- 考后估分（v0.5）：答案串对比 / 题库真题序列 ----------
    let estKey = $state("");
    let estMine = $state("");
    let estResult = $state<ReturnType<typeof import("../../core/estimate").estimateScore>>(null);
    let estResultFor = $state("");
    let estimateBusy = $state(false);
    let estFromBank = $state(false);
    let activeBankId = $state("");
    let banksList = $state<any[]>([]);
    let estSourceFilter = $state("");
    let estHistory = $state<any[]>([]);
    let estHistoryLoading = $state(false);
    let estHistoryError = $state("");
    let estHistoryRequest = 0;
    let estimateSaveError = $state("");
    let pendingEstimateSave = $state<{ key: string; mine: string; percent: number; score: number; total: number } | null>(null);
    let estimateMineInput = $state<HTMLInputElement | null>(null);
    const estimateKeyLength = $derived(normalizeEstimateInput(estKey).length);
    const estimateMineLength = $derived(normalizeEstimateInput(estMine).length);
    const estimateInputSignature = $derived(`${normalizeEstimateInput(estKey)}\u0000${normalizeEstimateInput(estMine)}`);
    const estimateLengthMismatch = $derived(Boolean(estimateKeyLength && estimateMineLength && estimateKeyLength !== estimateMineLength));
    const estimateBankPool = $derived.by(() => {
      const letterTypes = new Set(["single", "multiple", "judge"]);
      return questions.filter((q) => letterTypes.has(q.type) && (!estSourceFilter.trim() || (q.source ?? "").includes(estSourceFilter.trim())));
    });

    async function loadEstimateHistory() {
      if (!app) return;
      const request = ++estHistoryRequest;
      estHistoryLoading = true;
      estHistoryError = "";
      try {
        const next = await app.listEstimates();
        if (request === estHistoryRequest) estHistory = [...next].reverse();
      } catch (e) {
        if (request === estHistoryRequest) {
          estHistory = [];
          estHistoryError = t("estimate.historyLoadFailed").replace("{message}", String(e instanceof Error ? e.message : e));
        }
      } finally {
        if (request === estHistoryRequest) estHistoryLoading = false;
      }
    }

    $effect(() => {
      if (estFromBank && questions.length) {
        estKey = estimateBankPool.map((q) => q.answer).join("");
      }
    });

    async function runEstimate() {
      if (estimateBusy) return;
      if (!estimateKeyLength || !estimateMineLength || estimateKeyLength !== estimateMineLength) {
        return;
      }
      estimateBusy = true;
      estimateSaveError = "";
      try {
        estResult = estimateScore(estMine, estKey, { scoreEach: 1, passLine: bp.passLine });
        estResultFor = estimateInputSignature;
        if (estResult) {
          pendingEstimateSave = { key: estKey.slice(0, 40), mine: estMine.slice(0, 40), percent: estResult.percent, score: estResult.score, total: estResult.total };
          await persistEstimateResult();
        }
      } finally {
        estimateBusy = false;
      }
    }

    async function saveEstimateResult() {
      if (!pendingEstimateSave || estimateBusy) return;
      estimateBusy = true;
      await persistEstimateResult();
      estimateBusy = false;
    }

    async function persistEstimateResult() {
      if (!pendingEstimateSave) return;
      estimateSaveError = "";
      try {
        await app.saveEstimate(pendingEstimateSave);
        pendingEstimateSave = null;
        await loadEstimateHistory();
      } catch (e) {
        estimateSaveError = t("estimate.saveFailed").replace("{message}", String(e instanceof Error ? e.message : e));
      }
    }

    function percentBar(v: number, full: number) { return full ? Math.round((v / full) * 100) : 0; }

    /** 雷达图坐标（成绩单；n 段均分圆周，值域 0-100%） */
    function radarPoints(vals: number[]): string {
      const cx = 110, cy = 92, r = 72, n = vals.length;
      if (!n) return "";
      return vals.map((v, i) => {
        const ang = -Math.PI / 2 + (i * 2 * Math.PI) / n;
        const rr = r * Math.max(0.04, Math.min(1, v));
        return `${(cx + rr * Math.cos(ang)).toFixed(1)},${(cy + rr * Math.sin(ang)).toFixed(1)}`;
      }).join(" ");
    }
    function radarLabel(vals: number[]): { x: number; y: number; name: string }[] {
      const cx = 110, cy = 92, r = 86, n = vals.length;
      return vals.map((_v, i) => {
        const ang = -Math.PI / 2 + (i * 2 * Math.PI) / n;
        return { x: cx + r * Math.cos(ang), y: cy + r * Math.sin(ang) + 4, name: score!.sections[i].name };
      });
    }
    const secAccuracy = $derived(score ? score.sections.map((s) => (s.total ? s.correct / s.total : 0)) : []);
    /** 55-07 lite：当前题库相对开考冻结题版已修订的题（成绩单如实标注，不重算历史） */
    const revisionDrift = $derived(session ? session.revisionDrift(questions) : []);

    // ---------- 63-05 虚拟排名与百分位模拟 ----------
    // 参考池优先用本人历史模考成绩建模；样本 < PERCENTILE_MIN_SAMPLES 时回退到显式标注的
    // 通用虚拟模型。历史里掺入本次成绩会让「自己拉高自己的池均值」，因此排除当前 run。
    const percentilePool = $derived(buildPoolModel(historyPercents(history.filter((h) => h?.runId !== runId))));
    const percentileVerdict = $derived(score ? computePercentile(score.percent, percentilePool) : null);
    const percentileBands = $derived(percentileVerdict ? buildScoreBands(percentileVerdict.percent, percentilePool) : []);
    /** 分数段柱形归一化基准（同一快照内最大值，避免逐项重算整表） */
    const percentileBandMax = $derived(Math.max(...percentileBands.map((b) => b.share), 1));
    const percentileCurve = $derived(percentileVerdict ? buildPercentileCurve(percentileVerdict.percent, percentilePool, 41) : null);
    /** 模型是否来自本人历史样本（决定文案是「个人历史分布」还是「通用虚拟模型」） */
    const percentileIsPersonal = $derived(percentilePool.source === "history");
    /** 池内可用历史场次（排除本次 run） */
    const percentileSampleCount = $derived(percentilePool.sampleSize);
    let percentileOpen = $state(true);

    function exportPercentileModelCsv() {
      if (!percentileVerdict) return;
      downloadMockCsv(exportPercentileCsv(percentileVerdict, percentileBands), "percentile");
    }

    // 45-08 收口：成绩单分段/历史数据表 + CSV（与雷达/折线同一数据快照）
    let mockTableOpen = $state(false);
    let showWrongDetail = $state(false);
    let mockReviewFilter = $state<"wrong" | "flagged" | "all">("wrong");
    const displayedReviewList = $derived.by(() => {
      if (!session || !score) return [];
      const qids = session.state.qids;
      return qids
        .map((qid, idx) => {
          const ans = session.answers.get(qid);
          const q = questionMap.get(qid);
          const verdict = ans?.verdict ?? (answeredMap[qid] ? "wrong" : "not_attempted");
          const isFlagged = session.flags.has(qid);
          return {
            qid,
            idx,
            verdict,
            isFlagged,
            changes: ans?.changes ?? 0,
            stem: (q?.stem ?? qid).slice(0, 50),
          };
        })
        .filter((item) => {
          if (mockReviewFilter === "wrong") return item.verdict === "wrong";
          if (mockReviewFilter === "flagged") return item.isFlagged;
          return true;
        });
    });
    async function copyExamSummaryMarkdown() {
      if (!score) return;
      const passText = score.pass ? "及格" : "未及格";
      const lines = [
        `### 小驴考试 · 全真模考战报`,
        `- **考试科目**：${bp.name || "全真模拟卷"}`,
        `- **交卷时间**：${new Date().toLocaleString()}`,
        `- **最终成绩**：**${score.total} / ${score.full}**（得分率 ${score.percent}% · ${passText}）`,
        `- **及格线**：${bp.passLine}%`,
        `- **各模块得分明细**：`,
        ...score.sections.map((s) => `  - **${s.name}**：${s.score}/${s.full} 分（正确率 ${s.total ? Math.round((s.correct / s.total) * 100) : 0}%）`),
      ];
      if (revisionDrift.length) {
        lines.push(`- **改动说明**：包含 ${revisionDrift.length} 道在考后已修订题`);
      }
      lines.push(`\n> 来自小驴考试`);
      const text = lines.join("\n");
      try {
        await navigator.clipboard.writeText(text);
        showMessage(t("mock.summaryCopied", "模考战报已复制，可直接粘贴到思源笔记！"), 3200, "info");
      } catch {
        showMessage(t("mock.summaryCopyFailed", "复制失败，请重试或导出 CSV。"), 3200, "error");
      }
    }

    function downloadMockCsv(csv: string, name: string) {
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      downloadBlob(blob, `小驴考试-模考-${name}-${new Date().toISOString().slice(0, 10)}.csv`);
      showMessage(t("mock.exportReady", "已开始下载文件。"), 3000, "info");
    }

    function downloadBlob(blob: Blob, filename: string) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.hidden = true;
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Let the browser begin consuming the object URL before releasing it.
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    async function toggleExamFullscreen(target: EventTarget | null) {
      try {
        if (document.fullscreenElement) {
          if (!document.exitFullscreen) throw new Error(t("mock.fullscreenUnavailable", "当前环境不支持退出全屏。"));
          await document.exitFullscreen();
          return;
        }
        const el = (target as HTMLElement | null)?.closest<HTMLElement>(".lv-pad");
        if (!el?.requestFullscreen) throw new Error(t("mock.fullscreenUnavailable", "当前环境不支持全屏。"));
        await el.requestFullscreen();
      } catch (e) {
        showMessage(t("mock.fullscreenFailed", "无法切换全屏：{message}").replace("{message}", String(e instanceof Error ? e.message : e)), 4200, "error");
      }
    }

    /** 40-06：模考键盘作答与 CBT 盲打引擎接线（委托纯函数 resolveCbtKeyAction） */
    function onExamKey(e: KeyboardEvent) {
      // Ctrl/⌘+K 由 Palette 组件自身统一监听并按活动页签隔离，此处直接放行避免双次翻转抵消
      if ((e.key === "k" || e.key === "K") && (e.ctrlKey || e.metaKey)) return;
      if (view !== "exam" || !session || !currentQ || examLocked) return;
      if (e.key === "Escape" && (mockMiniSheetOpen || mockSweepOpen)) {
        e.preventDefault();
        mockMiniSheetOpen = false;
        mockSweepOpen = false;
        return;
      }
      if (handInConfirming || submitting || mockMiniSheetOpen || mockSweepOpen || paletteOpen || !!document.querySelector('[role="dialog"]')) return;
      if (!tabRoot?.getClientRects().length) return;
      const tgt = e.target as HTMLElement | null;
      if (tgt && tgt !== document.body && !tabRoot.contains(tgt)) return;

      const action = resolveCbtKeyAction(
        {
          key: e.key,
          keyCode: e.keyCode,
          shiftKey: e.shiftKey,
          ctrlKey: e.ctrlKey,
          altKey: e.altKey,
          metaKey: e.metaKey,
          isComposing: e.isComposing,
          targetTagName: tgt?.tagName,
          targetIsContentEditable: tgt?.isContentEditable,
        },
        {
          questionType: currentQ.type,
          optionCount: currentQ.options.length,
          isLockout: bp.lockout,
        },
      );

      if (action.type === "ignore") return;

      if (action.type === "toggle_scratchpad") {
        e.preventDefault();
        scratchpadOpen = !scratchpadOpen;
        return;
      }

      if (action.type === "toggle_flag" && current) {
        e.preventDefault();
        handleToggleFlag(null);
        return;
      }

      if (action.type === "select_option" && typeof action.optionIndex === "number") {
        const choice = isChoiceQuestion(currentQ) ? answerChoices(currentQ)[action.optionIndex] : null;
        if (choice) {
          e.preventDefault();
          pickOption(choice.value);
        }
        return;
      }

      if ((action.type === "judge_true" || action.type === "judge_false") && typeof action.optionIndex === "number") {
        const choice = answerChoices(currentQ)[action.optionIndex];
        if (choice) {
          e.preventDefault();
          pickOption(choice.value);
        }
        return;
      }

      if (action.type === "confirm_multiple") {
        e.preventDefault();
        goto(Math.min(session.state.qids.length - 1, cursor + 1));
        return;
      }

      if (action.type === "navigate_prev") {
        e.preventDefault();
        goto(Math.max(0, cursor - 1));
        return;
      }

      if (action.type === "navigate_next") {
        e.preventDefault();
        goto(Math.min(session.state.qids.length - 1, cursor + 1));
        return;
      }

      if (action.type === "navigate_first") {
        e.preventDefault();
        goto(0);
        return;
      }

      if (action.type === "navigate_last") {
        e.preventDefault();
        goto(session.state.qids.length - 1);
        return;
      }

      if (action.type === "navigate_section_prev") {
        e.preventDefault();
        const prevTarget = computeSectionNavigation(cursor, "prev", session.state.qids, (qid) => session.sectionOfQ(qid));
        goto(prevTarget);
        return;
      }

      if (action.type === "navigate_section_next") {
        e.preventDefault();
        const nextTarget = computeSectionNavigation(cursor, "next", session.state.qids, (qid) => session.sectionOfQ(qid));
        goto(nextTarget);
        return;
      }
    }
</script>

<svelte:window onblur={onBlur} onfocus={recomputeTimeCompensation} onpageshow={recomputeTimeCompensation} onkeydown={onExamKey} />

<div class="fn__flex-1 lv-exam-tab" class:lv-keyboard-open={keyboardOpen} bind:this={tabRoot}>
  <div class="block__icons" class:lv-focus-toolbar={view === "exam"}>
    <button class="lv-menu-btn" aria-label={t("menu.open")} aria-expanded={railOpen} bind:this={menuBtn} onclick={() => railOpen = true}><Icon name="menu" size={16} /></button>
    {#if view === "exam"}<div class="lv-focus-brand"><Icon name="clock" size={15} /><strong>{t("mock.focusTitle", "专注模考")}</strong></div>{/if}
    <div class="lv-crumbs" class:lv-focus-context={view === "exam"}>
      <span class="lv-crumb">{railBankName}</span>
      <span class="lv-crumb-sep" aria-hidden="true">/</span>
      <span class="lv-crumb-current">{t("tab.mock")}</span>
    </div>
    {#if app}<SaveStatus gate={app.saves} {t} />{/if}
    <div class="lv-row lv-focus-context lv-bank-picker-group" style="margin:0;gap:6px;align-items:center">
      {#if banksList.length > 1}
        <select
          class="lv-select sm"
          style="max-width:160px"
          bind:value={activeBankId}
          onchange={(e) => {
            const id = (e.target as HTMLSelectElement).value;
            if (id && id !== activeBankId) {
              void loadMockData(id);
              emitExamEvent("bank-changed", { bank: id });
            }
          }}
          disabled={view === "exam"}
          title={view === "exam" ? "模考进行中不可切换题库" : "选择模考目标题库"}
        >
          {#each banksList as b (b.id)}<option value={b.id}>{b.name}</option>{/each}
        </select>
      {:else if activeBankName}
        <span class="lv-chip sm">{activeBankName}</span>
      {/if}
      <button class="lv-btn sm lv-btn--ghost" onclick={() => { plugin.openPractice?.(); }} title="打开题库画廊管理" aria-label="打开题库画廊管理">
        <Icon name="folder" size={13} /> <span class="lv-topbar-btn-label">{t("bank.hubTitle", "题库管理")}</span>
      </button>
    </div>
    <span class="fn__flex-1 lv-topbar-spacer"></span>
    <button class="lv-btn lv-btn--ghost sm lv-palette-btn" onclick={() => paletteOpen = true} title="Ctrl / ⌘ K" aria-label="打开全局命令面板">
      <Icon name="search" size={13} /> <span class="lv-palette-label">{t("palette.open")}</span> <span class="lv-kbd">⌘K</span>
    </button>
    {#if view === "exam"}
      {@const remainMs = session ? Math.max(0, session.remaining(nowTick)) : 3600000}
      <span class="lv-chip num" class:lv-chip--amb={remainMs <= 300000 && remainMs > 60000} class:lv-chip--red={remainMs <= 60000} title={remainMs <= 60000 ? t("mock.urgentTime") : remainMs <= 300000 ? t("mock.warningTime") : ""}>
        <Icon name="clock" size={13} /> {remainText()}
      </span>
      {#if (session?.state.extraTimeS ?? 0) > 0}
        <span class="lv-chip lv-chip--amb num" title={t("mock.extraTip")}><Icon name="clock" size={13} />+{Math.round((session!.state.extraTimeS ?? 0) / 60)}{t("entry.minutes")}</span>
      {/if}
      <!-- 55-06 lite：单次条件覆盖——延时入快照与成绩记录，原卷不变 -->
        <button class="lv-chip" title={t("mock.extraTip")} disabled={(session?.state.extraTimeS ?? 0) > 0 || extraTimeBusy || examLocked} onclick={extendExamTime}>
        <Icon name="clock" size={13} />+5{t("entry.minutes")}
      </button>
    {/if}
    <button type="button" class="lv-mobile-close-btn" aria-label="关闭" title="关闭" onclick={() => { lvLaunchpad.haptic(8); void plugin?.closeMobileDialog?.(); }}>
      <Icon name="close" size={18} />
    </button>
  </div>
<div class="fn__flex-1 lv-shell" class:lv-shell-focus={view === "exam" || view === "report"} class:lv-shell-tasknav-hidden={view === "exam" || view === "report"}>
  <Rail active="mock" taskactive="mock" tasknavhidden={view === "exam" || view === "report"} ontasknavigate={onTaskNav} {plugin} open={railOpen} onclose={closeRail}
    project={{ name: railBankName || t("guard.title"), kicker: t("rail.projectKicker") }} onproject={() => plugin.openPractice?.()} />
  <div class="lv-main" style={viewportBottomPad > 0 ? `padding-bottom: calc(${viewportBottomPad + 16}px + env(safe-area-inset-bottom, 0px));` : undefined}>
  <div class="fn__flex-1 lv-pad">
  {#if view === "config"}
    <div class="lv-screen-head"><span class="lv-eyebrow">{t("head.mock.eyebrow")}</span><h1 class="lv-h1">{t("head.mock.title")}</h1><p>{t("head.mock.desc")}</p></div>
  {/if}

  {#if loading}
    <div aria-busy="true">
      <p class="lv-muted" role="status" aria-live="polite">{t("mock.loadingBank", "正在读取题库…")}</p>
      <div class="lv-skeleton" aria-hidden="true"></div>
    </div>
  {:else if errorMsg && !questions.length}
    <div class="lv-error" role="alert">{errorMsg}</div>
    <div class="lv-row" style="margin-top:10px">
      {#if activeBankId}
        <button class="lv-btn sm" onclick={() => void loadMockData()} disabled={loading}>{loading ? "…" : t("mock.retryLoad", "重新读取题库")}</button>
      {/if}
      <button class="lv-btn lv-btn--primary sm" onclick={() => plugin.openPractice?.()}>{t("mock.goPractice")}</button>
    </div>
  {:else if !questions.length}
    <div class="lv-empty" role="status">
      <div class="lv-empty-icon"><Icon name="book" size={26} /></div>
      <b>{t("state.emptyBank")}</b>
      <p class="lv-muted">{t("mock.emptyBankDesc")}</p>
      <button class="lv-btn lv-btn--primary sm" onclick={() => plugin.openPractice?.()}>{t("mock.goPractice")}</button>
    </div>
  {:else if view === "config"}
    <div class="lv-card" style="padding:14px 16px;margin-bottom:14px">
      <b>{t("mock.setupGuideTitle", "先确认本次模考条件")}</b>
      <p class="lv-muted" style="margin:6px 0">{t("mock.setupGuide", "默认蓝图已按考点配置可自动判分题。先核对模块、题数与分值，再设置时长和及格百分比；开考后独立作答，统一交卷。简答题请在练习台或背诵模式自评。")}</p>
    </div>
    <!-- ===== 恢复进行中的模考（U19：关页/休眠后回到同一 run） ===== -->
    {#if resumable}
      <div class="lv-card" style="margin-bottom:14px;border-color:var(--lv-accent)">
        <div class="lv-row" style="margin:0">
          <b>{t("mock.resumeTitle")}</b>
          <span class="lv-chip num">{resumable.bp.name} · {resumable.answers.length}/{resumable.qids.length}</span>
          <span class="lv-chip num" class:lv-chip--red={resumable.startedAt + resumable.bp.durationS * 1000 < Date.now()}>
            {t("mock.resumeLeft")} {Math.max(0, Math.round(((resumable.startedAt + resumable.bp.durationS * 1000 - Date.now()) / 60_000)))} min
          </span>
          <span class="fn__flex-1"></span>
        <button class="lv-btn lv-btn--primary sm" disabled={resumeBusy || discardBusy || starting || blueprintBusy} aria-busy={resumeBusy} onclick={resumeExam}>{resumeBusy ? "…" : t("mock.resumeGo")}</button>
          <button class="lv-btn sm" disabled={resumeBusy || discardBusy || starting || blueprintBusy} aria-busy={discardBusy} onclick={discardRun}>{discardBusy ? "…" : t("mock.resumeDrop")}</button>
        </div>
        <p class="lv-muted" style="margin:6px 0 0">{t("mock.resumeHint")}</p>
      </div>
    {/if}
    <!-- ===== S5 蓝图配置器 ===== -->
    {#if errorMsg}<div class="lv-error" role="alert" style="margin:8px 12px">{errorMsg}</div>{/if}
    <div class="lv-row">
      <input class="lv-input" bind:value={bp.name} style="max-width:220px" aria-label={t("mock.bpName")} />
      <span class="lv-chip num">{t("mock.totalQ")} {totals.questions}</span>
      <span class="lv-chip num">{t("mock.totalScore")} {totals.score}</span>
      <span class="lv-chip num"><Icon name="clock" size={12} />{Math.round(bp.durationS / 60)} min</span>
      {#each quotaShort as qs, _i (_i)}
        <span class="lv-chip lv-chip--red num" title={t("mock.quotaShortTip")}><Icon name="alert-triangle" size={11} /> {qs.name} {t("mock.quotaShort").replace("{have}", String(qs.have)).replace("{need}", String(qs.need))}</span>
      {/each}
    </div>
    <div class="lv-row" style="align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin:8px 0 10px">
      <div class="lv-row" style="margin:0;gap:8px;flex-wrap:wrap">
        <button class="lv-btn lv-btn--primary" onclick={startExam} disabled={!canStartExam} aria-busy={starting} title={!canStartExam ? startDisabledReason : ""}><Icon name="play" size={16} /> {starting ? "…" : t("mock.start")}</button>
        <select class="lv-select" style="max-width:180px" aria-label={t("mock.pickPreset")} onchange={(e) => { const el = e.target as HTMLSelectElement; void onPresetSelected(el.value, el); }}>
          <option value="">{t("mock.pickPreset")}</option>
          <optgroup label="职业考证">
            {#each presetOptions.filter((p) => p.category === "qualification") as opt (opt.id)}
              <option value={opt.id}>{opt.title}</option>
            {/each}
          </optgroup>
          <optgroup label="大学与考研硕博">
            {#each presetOptions.filter((p) => p.category === "academic" || p.category === "postgraduate") as opt (opt.id)}
              <option value={opt.id}>{opt.title}</option>
            {/each}
          </optgroup>
          <optgroup label="K12 基础教育">
            {#each presetOptions.filter((p) => p.category === "k12") as opt (opt.id)}
              <option value={opt.id}>{opt.title}</option>
            {/each}
          </optgroup>
          <optgroup label="公务员与法律职业">
            {#each presetOptions.filter((p) => p.category === "civil_service" || p.category === "law") as opt (opt.id)}
              <option value={opt.id}>{opt.title}</option>
            {/each}
          </optgroup>
          <optgroup label="多语言与微测验">
            {#each presetOptions.filter((p) => p.category === "language" || p.category === "micro") as opt (opt.id)}
              <option value={opt.id}>{opt.title}</option>
            {/each}
          </optgroup>
        </select>
        <button class="lv-btn sm" onclick={generateAdaptiveSprint} disabled={sprintBusy || !questions.length || starting} aria-busy={sprintBusy} title="基于考点盲区与高频错题自适应装配全真密卷"><Icon name="sparkles" size={14} /> {sprintBusy ? "…" : t("mock.sprintPaper")}</button>
      </div>
      <div class="lv-row lv-mock-desktop-toolbar" style="margin:0;gap:6px;flex-wrap:wrap">
        <select class="lv-select sm" bind:value={mockPrintFormat} disabled={printBusy || !questions.length} aria-label="选择模考打印卷面版式">
          <option value="exam">标准测试卷</option>
          <option value="card">🗂️ 标准答题卡</option>
          <option value="answer">独立答案册</option>
          <option value="lecture">授课讲义卷</option>
          <option value="homework">留白作业单</option>
          <option value="interactive">🌐 交互式讲题自测卷</option>
        </select>
        <button class="lv-btn sm lv-btn--ghost" onclick={openMockAssemble} disabled={!questions.length} title="进入专业组卷排版工坊，自定义 A4 纸面大标题、密封线、总分表与答题留白并直接打印">
          <Icon name="printer" size={13} /> 🖨️ 组卷排版工坊
        </button>
        <button class="lv-btn sm lv-btn--ghost" onclick={() => void printMockByFormat(mockPrintFormat)} disabled={printBusy || !questions.length} aria-busy={printBusy} title="按所选版式导出 A4 双栏试卷 / 答案册 / 授课讲义 / 作业单"><Icon name="file" size={13} /> {printBusy ? "…" : t("mock.printCompact")}</button>
        <button class="lv-btn sm lv-btn--ghost" onclick={saveMockExamAsDoc} disabled={!questions.length} title="将当前模考试卷整套排版存为思源笔记原生文档，折叠答案与解析，即使卸载插件考卷与作答永久保留"><Icon name="folder" size={13} /> {t("mock.saveAsSiyuanDoc")}</button>
        <button class="lv-btn sm lv-btn--ghost" onclick={generateABMockPapers} disabled={abBusy || !questions.length} aria-busy={abBusy} title="一键生成同考点但单选/多选选项智能洗牌防作弊的 A 卷与 B 卷"><Icon name="shuffle" size={13} /> {abBusy ? "…" : t("mock.generateAB")}</button>
        <button class="lv-btn sm lv-btn--ghost" onclick={exportPaperAuditReport} disabled={!questions.length} title="基于全题库实测P值预测整卷难度系数，检出大纲空白考点与偏科考点"><Icon name="chart" size={13} /> {t("mock.paperAudit")}</button>
        <button class="lv-btn sm lv-btn--ghost" onclick={saveBlueprint} disabled={blueprintBusy || starting || resumeBusy || discardBusy} aria-busy={blueprintBusy} title="保存当前组卷蓝图"><Icon name="save" size={13} /> {blueprintBusy ? "…" : t("mock.bpSave")}</button>
        <button class="lv-btn sm lv-btn--ghost" onclick={restoreBlueprint} disabled={blueprintBusy || starting || resumeBusy || discardBusy} aria-busy={blueprintBusy} title="恢复默认组卷蓝图"><Icon name="rotate" size={13} /> {blueprintBusy ? "…" : t("mock.bpRestore")}</button>
      </div>
    </div>
    {#if lastSavedMockDoc?.docId}
      <div class="lv-row" style="margin:0 0 10px;padding:6px 12px;background:var(--lv-surface-2);border-radius:var(--lv-r-2, 10px);border:1px solid var(--lv-border-subtle);justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px" role="status">
        <span style="font-size:var(--lv-font-size-sm);display:inline-flex;align-items:center;gap:6px">
          <Icon name="check" size={13} /> 已存为思源笔记文档：<b>《{lastSavedMockDoc.title}》</b>
        </span>
        <button type="button" class="lv-btn sm lv-btn--ghost" onclick={() => openInSiYuan(lastSavedMockDoc!.docId)}>
          <Icon name="link" size={12} /> 在思源中打开 ↗
        </button>
      </div>
    {/if}
    {#if !canStartExam && startDisabledReason}<p class="lv-muted" role="status" style="margin:4px 0">{startDisabledReason}</p>{/if}
    <div class="lv-bp-table">
      <div class="lv-bp-row head"><span>{t("mock.sec")}</span><span>{t("mock.count")}</span><span>{t("mock.each")}</span><span>{t("mock.source")}</span><span>{t("mock.secKp")}</span><span>难度梯度 (MathCyclus)</span><span></span></div>
      {#each bp.sections as s, i (i)}
        <div class="lv-bp-row">
          <label class="lv-bp-field"><span class="lv-bp-field-label">{t("mock.sec")}</span><input class="lv-input" bind:value={s.name} oninput={() => updateSection(i, { name: s.name })} aria-label={t("mock.sec")} /></label>
          <label class="lv-bp-field"><span class="lv-bp-field-label">{t("mock.count")}</span><input class="lv-input num" type="number" inputMode="numeric" min="0" value={s.count} aria-label={t("mock.count")} oninput={(e) => updateSection(i, { count: Math.max(0, parseInt((e.target as HTMLInputElement).value) || 0) })} /></label>
          <label class="lv-bp-field"><span class="lv-bp-field-label">{t("mock.each")}</span><input class="lv-input num" type="number" inputMode="numeric" min="0" step="0.1" value={s.scoreEach} aria-label={t("mock.each")} oninput={(e) => updateSection(i, { scoreEach: Math.max(0, parseFloat((e.target as HTMLInputElement).value) || 0) })} /></label>
          <label class="lv-bp-field"><span class="lv-bp-field-label">{t("mock.source")}</span><select class="lv-select" value={s.source} aria-label={t("mock.source")} onchange={(e) => updateSection(i, { source: (e.target as HTMLSelectElement).value as SectionSource })}>
            <option value="mixed">{t("mock.sourceMixed", "不限来源")}</option><option value="real">{t("mock.sourceReal")}</option><option value="mock">{t("mock.sourceMock")}</option>
          </select></label>
          <!-- 55-02 lite：考点配额（前缀匹配；缺口显式计入短缺，不用其他考点补齐） -->
          <div class="lv-row" style="margin:0;gap:4px;align-items:center;flex-wrap:wrap">
            <span class="lv-bp-field-label" style="width:100%">{t("mock.secKp")}</span>
            <input class="lv-input" style="flex:1;min-width:90px" value={s.kp ?? ""} placeholder={t("mock.secKpHint")}
              aria-label={t("mock.secKp")}
              oninput={(e) => updateSection(i, { kp: (e.target as HTMLInputElement).value.trim() || undefined })} />
            <label class="lv-chip sm" style="cursor:pointer;margin:0;padding:2px 5px" title="允许匹配题目的辅助考查知识点 (secondaryKps)">
              <input type="checkbox" checked={!!s.matchSecondaryKp} onchange={(e) => updateSection(i, { matchSecondaryKp: (e.target as HTMLInputElement).checked })} />
              <span style="font-size:10px">辅考点</span>
            </label>
          </div>
          <!-- MathCyclus 难度梯度分桶配比 (7:2:1 标准 / 5:3:2 拔高) -->
          <label class="lv-bp-field"><span class="lv-bp-field-label">{t("mock.difficulty", "难度配比")}</span><select class="lv-select" style="max-width:130px" aria-label="难度梯度配比"
            value={s.difficultyQuota ? (s.difficultyQuota.easy === 7 ? "721" : s.difficultyQuota.easy === 5 ? "532" : "111") : "none"}
            onchange={(e) => {
              const val = (e.target as HTMLSelectElement).value;
              const quota = val === "721" ? { easy: 7, medium: 2, hard: 1 } : val === "532" ? { easy: 5, medium: 3, hard: 2 } : val === "111" ? { easy: 1, medium: 1, hard: 1 } : undefined;
              updateSection(i, { difficultyQuota: quota });
            }}>
            <option value="none">不限难度</option>
            <option value="721">7:2:1 标准</option>
            <option value="532">5:3:2 拔高</option>
            <option value="111">1:1:1 均衡</option>
          </select></label>
          <button class="lv-btn lv-btn--ghost sm lv-bp-del" title={t("mock.removeSection")} aria-label={`${t("mock.removeSection")}：${s.name}`} aria-busy={sectionRemoveBusy} disabled={sectionRemoveBusy} onclick={() => void removeSection(i)}><Icon name="close" size={13} /></button>
        </div>
      {/each}
      <div style="padding:8px 12px"><button class="lv-btn sm" style="border-style:dashed;width:100%;display:inline-flex;align-items:center;justify-content:center;gap:4px" onclick={addSection}><Icon name="plus" size={13} /> {t("mock.addSec")}</button></div>
    </div>
    {#if pacingStrategy.sections.length}
      <div class="lv-card" style="margin:8px 0;padding:10px 14px;background:var(--lv-surface-2)">
        <div class="lv-row" style="margin:0 0 6px">
          <b style="font-size:var(--lv-font-size-body-compact)"><Icon name="clock" size={13} /> {t("mock.pacingStrategy")}</b>
          <span class="lv-muted" style="font-size:var(--lv-font-size-caption)">{pacingStrategy.overallAdvice}</span>
        </div>
        <div class="lv-row" style="gap:var(--lv-space-2);flex-wrap:wrap">
          {#each pacingStrategy.sections as ps (ps.sectionName)}
            <span class="lv-chip num" title={`单题目标 ${ps.targetPerQuestionS}s，超过 ${ps.alertThresholdS}s 需果断止损`}>
              {ps.sectionName}: ~{Math.round(ps.budgetSeconds / 60)}m (均 {ps.targetPerQuestionS}s/题)
            </span>
          {/each}
        </div>
      </div>
    {/if}
    <div class="lv-row">
      <label class="lv-row" style="margin:0">{t("mock.durationMinutes", "考试时长（分钟）")} <input class="lv-input num" type="number" inputMode="numeric" min="1" step="1" value={bp.durationS / 60} oninput={(e) => bp.durationS = Number((e.target as HTMLInputElement).value) * 60} /></label>
      <label class="lv-row" style="margin:0"><input type="checkbox" bind:checked={bp.sectionTimed} /> {t("mock.sectionTimed")}</label>
      <span class="lv-chip" title={t("mock.shuffleUnavailable", "选项乱序暂未开放")}>{t("mock.keepOptionOrder", "选项保持原顺序")}</span>
      <label class="lv-row" style="margin:0"><input type="checkbox" bind:checked={bp.lockout} /> {t("mock.lockout")}</label>
      <span class="lv-chip">{t("mock.passLine")} <input class="lv-input num" style="width:64px" type="number" inputMode="numeric" min="0" max="100" bind:value={bp.passLine} aria-label={t("mock.passLine")} />%</span>
    </div>
    <!-- 55-04 版本化评分政策与样例验算 -->
    <div class="lv-row" style="margin:8px 0;align-items:center;flex-wrap:wrap;gap:8px">
      <label class="lv-chip" for="mock-policy-select">{t("mock.scoringPolicy")}</label>
      <select id="mock-policy-select" class="lv-select" style="max-width:280px"
        value={bp.scoringPolicy?.kind ?? "standard"}
        onchange={(e) => {
          const kind = (e.target as HTMLSelectElement).value as ScoringPolicyKind;
          bp.scoringPolicy = { v: 1, kind, penaltyRatio: 0.5, floorZero: true, rounding: "raw" };
        }}>
        <option value="standard">{t("mock.policyStandard")}</option>
        <option value="partial_indefinite">{t("mock.policyPartialIndefinite")}</option>
        <option value="partial_all">{t("mock.policyPartialAll")}</option>
        <option value="penalty">{t("mock.policyPenalty")}</option>
      </select>
      <button type="button" class="lv-btn sm lv-btn--ghost" onclick={() => sampleVerifyOpen = !sampleVerifyOpen} title={t("mock.sampleVerifyTip")} aria-expanded={sampleVerifyOpen} style="display:inline-flex;align-items:center;gap:4px">
        <Icon name="chart" size={12} />
        <span>{t("mock.sampleVerify")}</span>
        <Icon name={sampleVerifyOpen ? "arrow-down" : "chev-right"} size={11} />
      </button>
    </div>
    {#if sampleVerifyOpen}
      <!-- 55-04 评分政策样例验算对照表 -->
      <div class="lv-detail" style="margin:4px 0 10px;padding:10px 12px;background:var(--lv-surface-2);border-radius:var(--lv-r-1);border:1px solid var(--lv-border-subtle)">
        <div class="lv-row" style="justify-content:space-between;align-items:center;margin-bottom:6px">
          <b style="font-size:var(--lv-font-size-sm)">{t("mock.sampleVerify")}（5 题基准卷 · 满分 10 分）</b>
          <span class="lv-muted" style="font-size:var(--lv-font-size-caption)">{t("mock.sampleVerifyTip")}</span>
        </div>
        <div class="lv-row" style="gap:8px;flex-wrap:wrap">
          {#each Object.entries(policySimulations) as [pKind, sim] (pKind)}
            <div class="lv-card" style="flex:1;min-width:140px;padding:8px 10px;border-left:3px solid {bp.scoringPolicy?.kind === pKind ? 'var(--lv-accent)' : 'transparent'}">
              <div class="lv-row" style="justify-content:space-between;margin:0 0 4px">
                <span class="lv-chip sm" class:lv-chip--acc={bp.scoringPolicy?.kind === pKind}>{pKind === "standard" ? t("mock.sampleStandard") : pKind === "penalty" ? t("mock.samplePenalty") : t("mock.samplePartial")}</span>
                <strong class="num" style="color:var(--lv-accent)">{sim.totalScore} / {sim.fullScore}</strong>
              </div>
              <div class="lv-muted num" style="font-size:11px">
                {#each sim.itemScores as is, ii (ii)}
                  <span>T{ii + 1}:{is >= 0 ? `+${is}` : is} </span>
                {/each}
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/if}
    {#if !bp.sections.length}
      <div class="lv-empty" style="padding:28px 16px;margin:8px 0">
        <div class="lv-empty-icon" style="width:46px;height:46px"><Icon name="clipboard" size={20} /></div>
        <b>{t("mock.needSec")}</b>
      </div>
    {/if}
    <!-- 考后估分 -->
    <details class="lv-card lv-pad-card" style="padding: var(--lv-space-3) var(--lv-space-4)">
      <summary style="cursor:pointer;font-weight:var(--lv-font-weight-semibold);display:flex;align-items:center;justify-content:space-between;gap:var(--lv-space-3);flex-wrap:wrap">
        <span style="display:inline-flex;align-items:center;gap:6px"><Icon name="calculator" size={14} /> {t("estimate.title")}</span>
        <span class="lv-muted" style="font-weight:400;font-size:var(--lv-font-size-sm)">{t("estimate.hint")}</span>
      </summary>
      {#if !questions.length}
        <p class="lv-muted">{t("state.emptyBank")}</p>
      {:else}
      <div class="lv-row" style="margin-top:10px">
        <label class="lv-row" style="margin:0"><input type="checkbox" bind:checked={estFromBank} /> {t("estimate.fromBank")}</label>
        {#if estFromBank}
          <input class="lv-input num" style="width:140px" bind:value={estSourceFilter} placeholder={t("estimate.sourceFilter")} aria-label={t("estimate.sourceFilter")} />
          <span class="lv-chip num">{t("estimate.bankQ")} {estimateBankPool.length}</span>
        {:else}
          <label class="lv-chip" for="estimate-key-input">{t("estimate.key")}</label>
          <input id="estimate-key-input" class="lv-input num" style="flex:1;min-width:160px" bind:value={estKey} placeholder="BADCA…" aria-invalid={estimateLengthMismatch} aria-describedby={estimateLengthMismatch ? "estimate-length-error" : undefined} />
        {/if}
      </div>
      <div class="lv-row" style="margin-top:6px">
        <label class="lv-chip" for="estimate-mine-input">{t("estimate.mine")}</label>
        <input id="estimate-mine-input" bind:this={estimateMineInput} class="lv-input num" style="flex:1;min-width:160px" bind:value={estMine} placeholder="BADCA…" aria-invalid={estimateLengthMismatch} aria-describedby={estimateLengthMismatch ? "estimate-length-error" : undefined} />
      </div>
      <div class="lv-row">
      <button class="lv-btn sm" onclick={runEstimate} disabled={estimateBusy || !estimateKeyLength || !estimateMineLength || estimateLengthMismatch} aria-busy={estimateBusy} title={estimateLengthMismatch ? t("estimate.lengthMismatch") : ""}>{estimateBusy ? "…" : t("estimate.run")}</button>
      {#if estimateLengthMismatch}<span id="estimate-length-error" class="lv-chip lv-chip--amb" role="alert">{t("estimate.lengthMismatch")}</span>{/if}
      {#if estimateSaveError}<div class="lv-error" role="alert" style="width:100%">{estimateSaveError} <button class="lv-btn sm" disabled={estimateBusy} onclick={() => void saveEstimateResult()}>{estimateBusy ? "…" : t("estimate.retrySave")}</button></div>{/if}
        {#if estResult && estResultFor === estimateInputSignature}
          <div class="lv-card" style="margin-top:10px;padding:14px 16px;background:var(--lv-surface);border-radius:var(--lv-r-3, 16px);border:1px solid var(--lv-border-subtle);box-shadow:var(--lv-sh-1);width:100%">
            <div class="lv-row" style="margin:0 0 6px;align-items:center;flex-wrap:wrap">
              <span class="lv-chip lv-chip--acc num">
                {t("estimate.score")}: <b style="font-size:16px">{estResult.score}</b> / {estResult.full}
              </span>
              <span class="lv-chip lv-chip--grn num" style="display:inline-flex;align-items:center;gap:3px"><Icon name="check" size={11} /> {estResult.correct}</span>
              <span class="lv-chip lv-chip--red num" style="display:inline-flex;align-items:center;gap:3px"><Icon name="close" size={11} /> {estResult.wrong}</span>
              {#if estResult.blank}<span class="lv-chip lv-chip--amb num">– {estResult.blank}</span>{/if}
              <span class="lv-chip num" class:lv-chip--grn={estResult.percent >= bp.passLine} class:lv-chip--red={estResult.percent < bp.passLine} style="display:inline-flex;align-items:center;gap:4px">
                <Icon name={estResult.percent >= bp.passLine ? "check" : "close"} size={11} />
                <span>{estResult.percent}% {estResult.percent >= bp.passLine ? "合格" : "未达标"}</span>
              </span>
            </div>
            <div class="lv-marks num" style="font-size:12px;margin:6px 0;letter-spacing:1px">{estResult.marks.join(" ")}</div>
            {#if estFromBank}
              <div class="lv-row" style="margin:6px 0 0;flex-wrap:wrap;gap:4px">
                {#each estimateBankPool as q, i (i)}
                  {@const mark = estResult.marks[i] ?? "–"}
                  <span class="lv-chip num" class:lv-chip--grn={mark === "✓"} class:lv-chip--red={mark === "✕"} class:lv-chip--amb={mark === "–"} title={q.stem.slice(0, 60)} style="display:inline-flex;align-items:center;gap:3px">
                    <span>{i + 1}. {q.answer}</span>
                    {#if mark === "✓"}
                      <Icon name="check" size={10} />
                    {:else if mark === "✕"}
                      <Icon name="close" size={10} />
                    {:else}
                      <span>{mark}</span>
                    {/if}
                  </span>
                {/each}
              </div>
            {/if}
          </div>
        {/if}
      </div>
      {#if estHistoryLoading}
        <p class="lv-muted" role="status" aria-live="polite">{t("estimate.historyLoading")}</p>
      {:else if estHistoryError}
        <div class="lv-error" role="alert">{estHistoryError} <button class="lv-btn sm" disabled={estHistoryLoading} onclick={() => void loadEstimateHistory()}>{estHistoryLoading ? "…" : t("estimate.retryHistory")}</button></div>
      {:else if estHistory.length}
        <div class="lv-row" style="margin:8px 0 0;align-items:center;flex-wrap:wrap">
          <span class="lv-muted" style="font-size:var(--lv-font-size-label)">{t("estimate.history")}:</span>
          {#each estHistory.slice(0, 8) as h, _i (_i)}
            <span class="lv-chip num" class:lv-chip--grn={h.percent >= bp.passLine} title={new Date(h.at).toLocaleString()}>{h.percent}%</span>
          {/each}
        </div>
      {:else}
        <div class="lv-empty" style="margin-top:10px">
          <div class="lv-empty-icon"><Icon name="chart" size={24} /></div>
          <b>{t("estimate.historyEmptyTitle")}</b>
          <p class="lv-muted">{t("estimate.historyEmptyDesc")}</p>
          <button class="lv-btn sm" onclick={() => estimateMineInput?.focus()}>{t("estimate.getStarted")}</button>
        </div>
      {/if}
      {/if}
    </details>
  {:else if view === "exam" && session && currentQ}
    <!-- ===== S6 全真考试 ===== -->
    <div class="lv-row lv-mock-exam-head">
      <span class="lv-chip">{currentSection}</span>
      {#if bp.sectionTimed}
        {@const sr = session.sectionRemaining(currentSection, Date.now())}
        <span class="lv-chip num" class:lv-chip--red={sr !== null && sr < 60_000}>
          <Icon name="clock" size={13} /> {t("mock.secTime")} {sr !== null ? `${Math.max(0, Math.floor(sr / 60_000))}:${String(Math.floor((sr % 60_000) / 1000)).padStart(2, "0")}` : "--"}
        </span>
      {/if}
      <span class="lv-chip num">{cursor + 1}/{session.state.qids.length}</span>
      <span class="fn__flex-1"></span>
      {#if ttsSupported()}
        <button class="lv-btn sm lv-btn--ghost" title="朗读题干与选项（外语听读伴读）" aria-label="朗读本题" disabled={examLocked} onclick={() => ttsSpeak([currentQ.stem, ...currentQ.options].join(" "), { lang: currentQ.studyMeta?.lang })}>
          <Icon name="volume" size={13} />
        </button>
      {/if}
      <button type="button" class="lv-btn sm lv-btn--ghost num" onclick={cycleExamFontSize} title="切换题干字号大小（标准 16px / 大号 19px / 特大 22px）" aria-label="切换题干字号大小">
        A{examFontSize === "normal" ? "" : examFontSize === "large" ? "⁺" : "²⁺"}
      </button>
      <button class="lv-btn sm lv-flag-btn" class:lv-flag-btn--on={session.flags.has(current)} title={`${t("mock.flag")} (F)`} aria-label={`${t("mock.flag")} (F)`} aria-pressed={session.flags.has(current)} disabled={examLocked} onclick={(e) => handleToggleFlag(e.currentTarget)}><Icon name="pin" size={14} /> <span class="lv-kbd sm">F</span></button>
      <button class="lv-btn sm lv-flag-btn" class:acc={scratchpadOpen} title={t("scratchpad.tip")} aria-label={t("scratchpad.tip")} aria-pressed={scratchpadOpen} disabled={examLocked} onclick={() => scratchpadOpen = !scratchpadOpen}><Icon name="pencil" size={13} /></button>
      <button class="lv-btn sm" class:acc={isFullscreen} title={isFullscreen ? t("mock.exitFullscreen") : t("mock.fullscreen")} aria-label={isFullscreen ? t("mock.exitFullscreen") : t("mock.fullscreen")} disabled={examLocked} onclick={(e) => void toggleExamFullscreen(e.currentTarget)}><Icon name={isFullscreen ? "close" : "expand"} size={14} /></button>
      <button class="lv-btn lv-btn--primary sm" disabled={examLocked || handInConfirming} aria-busy={submitting || handInConfirming} onclick={() => finishExam(false)}>{submitting ? t("mock.savingScore", "正在保存成绩…") : handInConfirming ? t("mock.confirmingHandIn", "等待交卷确认…") : t("mock.handIn")}</button>
    </div>
    {#if submitError}
      <div class="lv-error" role="alert" style="margin:8px 0">
        {submitError}
        <button class="lv-btn sm" style="margin-left:8px" disabled={submitting} onclick={retryFinishExam}>{submitting ? "…" : t("mock.retrySubmit")}</button>
      </div>
    {/if}
    {#if restoreNote}<div class="lv-error" role="alert">{restoreNote}</div>{/if}
    <div class="lv-card lv-question">
      {#if !currentQ}
        <div class="lv-empty" style="padding:48px 16px">
          <div class="lv-empty-icon"><Icon name="alert-triangle" size={26} /></div>
          <p style="margin:12px 0 16px">{t("mock.emptyPaper", "当前考卷试题内容为空或无法读取")}</p>
          <button class="lv-btn lv-btn--primary sm" onclick={showConfig}>返回考场配置</button>
        </div>
      {:else}
        <!-- 52-08 模考电子草稿纸与数理手绘板浮层 -->
        <ScratchpadDrawer
          open={scratchpadOpen}
          mode={scratchpadMode}
          text={currentScratchpadText}
          qid={currentQ?.id}
          {t}
          onmodeChange={(m) => { scratchpadMode = m; persistRun(); }}
          oninput={onScratchpadInput}
          onclear={clearScratchpad}
          oncopy={copyScratchpad}
          onclose={() => (scratchpadOpen = false)}
        />
        <span class="lv-chip lv-chip--acc">{t("qtype." + currentQ.type)}</span>
      {#if stemHtml}
        <div class="lv-stem lv-rich b3-typography" class:lv-stem--lg={examFontSize === "large"} class:lv-stem--xl={examFontSize === "xlarge"}>{@html stemHtml}</div>
      {:else}
        <div class="lv-stem" class:lv-stem--lg={examFontSize === "large"} class:lv-stem--xl={examFontSize === "xlarge"}>{currentQ.stem}</div>
      {/if}
      {#if currentQ.occlusion}
        <div class="lv-occlusion-wrap" style="margin:10px 0 14px;border-radius:var(--lv-r-2, 10px);overflow:hidden;border:1px solid var(--lv-border-subtle);box-shadow:var(--lv-sh-1);max-width:520px">
          {@html renderOcclusionSvg(currentQ.occlusion, { activeMaskId: currentQ.occlusion.activeMaskId, revealedMaskIds: [] })}
        </div>
      {/if}
      {#if currentQ.studyMeta?.phonetic}
        <div class="lv-phonetic-badge" style="margin:4px 0 10px;display:inline-flex;align-items:center;gap:6px;padding:3px 12px;border-radius:var(--lv-radius-pill, 9999px);background:var(--lv-surface-2);border:1px solid var(--lv-border-subtle);font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;color:var(--lv-brand)">
          <Icon name="volume" size={12} />
          <span>注音 / 音标：{currentQ.studyMeta.phonetic}</span>
        </div>
      {/if}
      <p class="lv-muted">{t("session.guide." + currentQ.type)}</p>
      {#if runSaveBusy}
        <p class="lv-hint" role="status" aria-live="polite">{t("mock.runSaving", "正在保存答题进度…")}</p>
      {:else if runSaveError}
        <div class="lv-error" role="alert">{runSaveError}
          <button class="lv-btn sm" disabled={runSaveBusy} aria-busy={runSaveBusy} onclick={retryRunSave}>{t("mock.runSaveRetry", "重试保存进度")}</button>
        </div>
      {:else if runSaveQueued}
        <p class="lv-hint" role="status" aria-live="polite">{t("mock.runSaveQueued", "答案已更新，正在等待自动保存…")}</p>
      {:else if runSaveConfirmed}
        <p class="lv-muted" role="status" aria-live="polite">{t("mock.runSaved", "答题进度已保存")}</p>
      {:else}
        <p class="lv-hint">{t("mock.answerSaveHint")}</p>
      {/if}
      {#key current}
      {#if isChoiceQuestion(currentQ)}
        {@const choices = answerChoices(currentQ)}
        {#if !choices.length}<div class="lv-error" role="alert">{t("session.missingOptions")}</div>{/if}
        <!-- 45-03：多选 checkbox/group 语义，单选/判断 radiogroup -->
        <div role={currentQ.type === "multiple" ? "group" : "radiogroup"} aria-label={t("session.options")}>
          {#each choices as choice (choice.value)}
            <button class="lv-opt" class:sel={currentQ.type === "multiple" ? (answeredMap[current] ?? "").includes(choice.value) : selected === choice.value} disabled={examLocked}
              role={currentQ.type === "multiple" ? "checkbox" : "radio"}
              aria-checked={currentQ.type === "multiple" ? (answeredMap[current] ?? "").includes(choice.value) : selected === choice.value}
              class:eliminated={!!mockEliminatedChoices[choice.value]}
              onclick={(e) => {
                if (mockEliminatedChoices[choice.value]) {
                  toggleMockEliminate(choice.value, e.currentTarget);
                } else {
                  pickOption(choice.value);
                }
              }}
              oncontextmenu={(e) => {
                e.preventDefault();
                toggleMockEliminate(choice.value, e.currentTarget);
              }}
              ondblclick={(e) => {
                e.preventDefault();
                toggleMockEliminate(choice.value, e.currentTarget);
              }}
              title={mockEliminatedChoices[choice.value] ? "已划线排除（点击或右键恢复）" : "左键选中，右键或双击可划线排除干扰项"}
            >
              <span class="lv-opt-check" class:box={currentQ.type === "multiple"} aria-hidden="true"></span>
              <span class="key">{choice.letter}</span><span class="lv-opt-text">{@html renderInlineText(choice.text)}</span>
            </button>
          {/each}
        </div>
        {#if currentQ.type === "multiple"}
          {@const currentMultiAns = answeredMap[current] ?? ""}
          {@const selLetters = currentMultiAns ? [...currentMultiAns].sort().join(", ") : ""}
          <div class="lv-row lv-multi-indicator" style="margin:8px 0 4px;align-items:center;gap:var(--lv-space-2)">
            <span class="lv-chip num" class:lv-chip--acc={currentMultiAns.length > 0}>
              {currentMultiAns.length > 0 ? t("session.multiSelected").replace("{items}", selLetters).replace("{n}", String(currentMultiAns.length)) : t("session.multiEmpty")}
            </span>
          </div>
        {/if}
      {:else}
        {@const spec = specOf(currentQ)}
        {#if spec?.kind === "numeric"}
          <input class="lv-input lv-answer-num" type="text" inputmode="decimal" value={answeredMap[current] ?? ""} disabled={examLocked}
            placeholder={spec.unit ? t("session.numericUnit").replace("{u}", spec.unit) : t("session.numericPlain")}
            oninput={(e) => setTextAnswer((e.target as HTMLInputElement).value)} />
          {#if spec.unit}<span class="lv-chip">{t("session.unitLabel")}: {spec.unit}</span>{/if}
        {:else if spec?.kind === "multiBlank"}
          {@const parts = splitBlanks(answeredMap[current] ?? "", spec.blanks.length)}
          <p class="lv-hint">{t("session.blankHint")}</p>
          {#each parts as part, i (i)}
            <input class="lv-input lv-answer-blank" value={part} disabled={examLocked} placeholder={t("session.blankN").replace("{n}", String(i + 1))}
              oninput={(e) => { const next = [...parts]; next[i] = (e.target as HTMLInputElement).value; setTextAnswer(joinBlanks(next)); }} />
          {/each}
        {:else}
          <textarea class="lv-input lv-textarea" class:lv-textarea--ruled={shortLinedPaper && currentQ.type === "short"} value={answeredMap[current] ?? ""} disabled={examLocked}
            placeholder={currentQ.type === "short" ? t("session.shortPlaceholder") : t("session.fillPlaceholder")}
            oninput={(e) => setTextAnswer((e.target as HTMLTextAreaElement).value)}></textarea>
          {#if currentQ.type === "short"}
            {@const words = countWordsAndCharacters(answeredMap[current] ?? "")}
            <div class="lv-row" style="margin:4px 0 0;font-size:var(--lv-font-size-caption);justify-content:space-between;align-items:center">
              <span class="lv-muted">
                字数统计：<strong class="num">{words.examWords}</strong> 字（中文 {words.chineseChars} · 英文 {words.englishWords} · {words.paragraphs} 段）
              </span>
              <div class="lv-row" style="margin:0;gap:6px">
                <button type="button" class="lv-btn sm lv-btn--ghost" class:acc={shortLinedPaper} style="padding:1px 6px;font-size:11px" aria-pressed={shortLinedPaper} onclick={() => { shortLinedPaper = !shortLinedPaper; writeLocal("lv-exam/lined-paper", shortLinedPaper ? "1" : "0"); }} title="切换稿纸横线背景模式（28px 行高对齐）">
                  <Icon name="file-text" size={11} /> {shortLinedPaper ? "稿纸线开" : "稿纸线"}
                </button>
                <button type="button" class="lv-btn sm lv-btn--ghost" style="padding:1px 6px;font-size:11px" aria-expanded={mockPaperGridOpen} onclick={() => (mockPaperGridOpen = !mockPaperGridOpen)} title={t("session.gridPreview")}>
                  <Icon name="grid" size={11} /> {t("session.gridPreview")}
                </button>
                {#if words.examWords >= 200}
                  <span class="lv-chip sm lv-chip--grn num">字数充足</span>
                {:else if words.examWords > 0}
                  <span class="lv-chip sm num">作答中</span>
                {/if}
              </div>
            </div>
            {#if mockPaperGridOpen}
              {@const gridModel = generatePaperGrid(answeredMap[current] ?? "", { columns: 20 })}
              <div class="lv-card" style="margin:8px 0;padding:12px 14px;background:var(--lv-surface-2);border:1px solid var(--lv-border-subtle);border-left:3.5px solid var(--lv-accent);border-radius:var(--lv-r-3, 14px);box-shadow:var(--lv-sh-1)">
                <div class="lv-row" style="justify-content:space-between;align-items:center;margin-bottom:6px">
                  <b style="font-size:12px;display:inline-flex;align-items:center;gap:6px"><Icon name="file-text" size={13} /> 考场 20×20 规范作文答题纸模拟（已占 {gridModel.totalCellsOccupied} 格 · {gridModel.totalRows} 行）</b>
                  <button type="button" class="lv-btn sm lv-btn--ghost" onclick={() => (mockPaperGridOpen = false)} aria-label="关闭"><Icon name="close" size={12} /></button>
                </div>
                <div class="lv-grid-paper" style="max-height:220px;overflow-y:auto;display:flex;flex-direction:column;gap:3px;padding:6px;background:var(--lv-surface);border-radius:var(--lv-r-2, 8px);border:1px solid var(--lv-border-subtle)">
                  {#each gridModel.rows as row, _ri (_ri)}
                    <div style="display:flex;gap:2px;align-items:center">
                      <span class="lv-muted num" style="width:20px;font-size:10px;text-align:right;margin-right:4px">{row.rowNumber}</span>
                      {#each row.cells as cell, _ci (_ci)}
                        <span style="width:20px;height:20px;border:1px solid var(--lv-border-subtle);display:grid;place-items:center;font-size:12px;background:{cell.isIndent ? 'var(--lv-surface-2)' : 'transparent'}">
                          {cell.char || ""}
                        </span>
                      {/each}
                    </div>
                  {/each}
                </div>
              </div>
            {/if}
          {/if}
        {/if}
      {/if}
      {/key}
      {/if}
    </div>
    <!-- 答题卡与速查筛选 -->
    <div class="lv-sheet-bar">
      <div class="lv-sheet-tabs">
        <button class="lv-chip" class:acc={sheetFilter === "all"} onclick={() => sheetFilter = "all"}>
          {t("mock.filterAll")} ({session.state.qids.length})
        </button>
        <button class="lv-chip" class:acc={sheetFilter === "unanswered"} class:lv-chip--red={unansweredIndices.length > 0} onclick={() => sheetFilter = "unanswered"}>
          {t("mock.filterUnanswered")} ({unansweredIndices.length})
        </button>
        <button class="lv-chip" class:acc={sheetFilter === "flagged"} class:lv-chip--amb={flaggedIndices.length > 0} onclick={() => sheetFilter = "flagged"}>
          <Icon name="star" size={11} /> {t("mock.filterFlagged")} ({flaggedIndices.length})
        </button>
      </div>
      <div class="lv-row" style="margin:0;gap:4px">
        <button class="lv-chip sm" class:acc={sheetDisplayMode === "grid"} onclick={() => sheetDisplayMode = "grid"}>
          <Icon name="table" size={11} /> {t("mock.gridMode")}
        </button>
        <button class="lv-chip sm" class:acc={sheetDisplayMode === "bubble"} onclick={() => sheetDisplayMode = "bubble"}>
          <Icon name="edit" size={11} /> {t("mock.bubbleMode")}
        </button>
        {#if unansweredIndices.length > 0}
          <button class="lv-btn sm lv-btn--ghost" onclick={gotoNextUnanswered} title={t("mock.jumpNextUnanswered")} style="display:inline-flex;align-items:center;gap:4px">
            <span>{t("mock.jumpNextUnanswered")}</span>
            <Icon name="chev-right" size={12} />
          </button>
        {/if}
      </div>
    </div>
    {#if sheetDisplayMode === "grid"}
      {#if sheetSectionGroups.length > 1}
        {@const isAllCollapsed = sheetSectionGroups.length > 0 && sheetSectionGroups.every((g) => collapsedSections[g.name])}
        {@const isAllExpanded = sheetSectionGroups.length > 0 && sheetSectionGroups.every((g) => !collapsedSections[g.name])}
        <div class="lv-row" style="margin:0 0 6px;justify-content:space-between;align-items:center;font-size:11px">
          <span class="lv-muted">分卷大题导航（{sheetSectionGroups.length} 个分部）</span>
          <div class="lv-row" style="margin:0;gap:4px">
            <button type="button" class="lv-chip sm" class:acc={isAllExpanded} onclick={() => { collapsedSections = {}; }}>全部展开</button>
            <button type="button" class="lv-chip sm" class:acc={isAllCollapsed} onclick={() => {
              const next: Record<string, boolean> = {};
              sheetSectionGroups.forEach((g) => { next[g.name] = true; });
              collapsedSections = next;
            }}>全部收起</button>
            <button type="button" class="lv-chip sm" onclick={() => {
              const next: Record<string, boolean> = {};
              sheetSectionGroups.forEach((g) => { next[g.name] = true; });
              const curSec = sheetSectionGroups.find((g) => cursor >= g.startIndex && cursor <= g.endIndex);
              if (curSec) next[curSec.name] = false;
              collapsedSections = next;
            }}>仅看当前大题</button>
          </div>
        </div>
        <div class="stack-sm" style="max-height:300px;overflow-y:auto;padding-right:2px">
          {#each sheetSectionGroups as grp (grp.name)}
            <div class="lv-sheet-section-accordion" style="margin-bottom:6px">
              <button
                type="button"
                class="lv-sheet-sec-header"
                aria-expanded={!collapsedSections[grp.name]}
                onclick={() => toggleSectionCollapse(grp.name)}
                style="width:100%;display:flex;justify-content:space-between;align-items:center;padding:5px 8px;background:var(--lv-surface-2);border:1px solid var(--lv-border-subtle);border-radius:var(--lv-r-1, 6px);cursor:pointer;font-size:12px;color:var(--lv-text)"
              >
                <div class="lv-row" style="margin:0;gap:6px;align-items:center">
                  <Icon name={collapsedSections[grp.name] ? "chev-right" : "arrow-down"} size={11} />
                  <b>{grp.name}</b>
                  <span class="lv-muted num" style="font-size:11px">（{grp.startIndex + 1} - {grp.endIndex + 1}）</span>
                </div>
                <div class="lv-row" style="margin:0;gap:4px;align-items:center">
                  <span class="lv-chip sm num" class:lv-chip--acc={grp.answeredCount === grp.items.length}>
                    {grp.answeredCount} / {grp.items.length}
                  </span>
                  {#if grp.flaggedCount > 0}
                    <span class="lv-chip sm lv-chip--amb num" title="标记题"><Icon name="star" size={10} /> {grp.flaggedCount}</span>
                  {/if}
                </div>
              </button>
              {#if !collapsedSections[grp.name]}
                <div class="lv-sheet" style="margin-top:6px">
                  {#each grp.items as it (it.qid)}
                    {@const i = it.index}
                    {@const answered = Boolean(answeredMap[it.qid]?.trim())}
                    {@const flagged = session.flags.has(it.qid)}
                    {@const dimmed = sheetFilter === "unanswered" ? answered : sheetFilter === "flagged" ? !flagged : false}
                    <button class="lv-cell" class:done={answered} class:flag={flagged} class:dimmed={dimmed} disabled={examLocked}
                      class:cur={i === cursor} aria-current={i === cursor ? "step" : undefined}
                      aria-label={`${t("mock.questionN", "第 {n} 题").replace("{n}", String(i + 1))}，${answered ? t("mock.legend.done") : t("mock.unanswered", "未答")}，${flagged ? t("mock.legend.flag") : t("mock.unflagged", "未标记")}${i === cursor ? `，${t("mock.legend.cur")}` : ""}`}
                      onclick={() => goto(i)}>{i + 1}</button>
                  {/each}
                </div>
              {/if}
            </div>
          {/each}
        </div>
      {:else}
        <div class="lv-sheet">
          {#each session.state.qids as qid, i (i)}
            {@const answered = Boolean(answeredMap[qid]?.trim())}
            {@const flagged = session.flags.has(qid)}
            {@const dimmed = sheetFilter === "unanswered" ? answered : sheetFilter === "flagged" ? !flagged : false}
            <button class="lv-cell" class:done={answered} class:flag={flagged} class:dimmed={dimmed} disabled={examLocked}
              class:cur={i === cursor} aria-current={i === cursor ? "step" : undefined}
              aria-label={`${t("mock.questionN", "第 {n} 题").replace("{n}", String(i + 1))}，${answered ? t("mock.legend.done") : t("mock.unanswered", "未答")}，${flagged ? t("mock.legend.flag") : t("mock.unflagged", "未标记")}${i === cursor ? `，${t("mock.legend.cur")}` : ""}`}
              onclick={() => goto(i)}>{i + 1}</button>
          {/each}
        </div>
      {/if}
    {:else}
      <!-- 机读答题卡涂卡流 -->
      <div class="stack-sm" style="max-height:260px;overflow-y:auto;padding:8px;background:var(--lv-surface-2);border-radius:var(--lv-r-2);border:1px solid var(--lv-border)">
        {#if sheetSectionGroups.length > 1}
          {#each sheetSectionGroups as grp (grp.name)}
            <div style="margin-bottom:6px">
              <button
                type="button"
                class="lv-sheet-sec-header"
                aria-expanded={!collapsedSections[grp.name]}
                onclick={() => toggleSectionCollapse(grp.name)}
                style="width:100%;display:flex;justify-content:space-between;align-items:center;padding:4px 8px;background:var(--lv-surface);border:1px solid var(--lv-border-subtle);border-radius:4px;cursor:pointer;font-size:11px;color:var(--lv-text);margin-bottom:4px"
              >
                <div class="lv-row" style="margin:0;gap:4px;align-items:center">
                  <Icon name={collapsedSections[grp.name] ? "chev-right" : "arrow-down"} size={11} />
                  <b>{grp.name}</b>
                  <span class="lv-muted num">（{grp.startIndex + 1}-{grp.endIndex + 1}）</span>
                </div>
                <span class="lv-chip sm num" class:lv-chip--acc={grp.answeredCount === grp.items.length}>{grp.answeredCount}/{grp.items.length}</span>
              </button>
              {#if !collapsedSections[grp.name]}
                {#each grp.items as it (it.qid)}
                  {@const i = it.index}
                  {@const q = questions.find((item) => item.id === it.qid)}
                  {@const curAns = answeredMap[it.qid] || ""}
                  {@const isChoice = q && (q.type === "single" || q.type === "multiple" || q.type === "judge")}
                  <div class="lv-row" style="justify-content:space-between;align-items:center;padding:4px 8px;border-bottom:1px solid var(--lv-border-subtle);background:var(--lv-surface);border-radius:4px">
                    <div style="display:flex;align-items:center;gap:6px">
                      <button type="button" class="lv-chip sm" class:cur={i === cursor} onclick={() => goto(i)} style="cursor:pointer">
                        第 {i + 1} 题
                      </button>
                      <span class="lv-muted" style="font-size:11px">【{q ? (q.type === "single" ? "单选" : q.type === "multiple" ? "多选" : q.type === "judge" ? "判断" : "主观") : ""}】</span>
                    </div>
                    {#if isChoice}
                      <div class="lv-row" style="margin:0;gap:4px">
                        {#each (q && q.type === "judge" ? ["T", "F"] : ["A", "B", "C", "D"]) as b (b)}
                          {@const active = curAns.includes(b)}
                          <button
                            type="button"
                            class="lv-chip sm"
                            class:lv-chip--acc={active}
                            style="min-width:28px;text-align:center;font-weight:700;cursor:pointer"
                            disabled={examLocked}
                            onclick={() => onBubbleFill(it.qid, b, q?.type)}
                          >
                            {b}
                          </button>
                        {/each}
                      </div>
                    {:else}
                      <input
                        class="lv-input num sm"
                        style="max-width:140px;height:26px"
                        placeholder="输入答案…"
                        value={curAns}
                        disabled={examLocked}
                        oninput={(e) => {
                          const val = (e.target as HTMLInputElement).value;
                          session?.setAnswer(it.qid, val, Date.now());
                          answeredMap = { ...answeredMap, [it.qid]: val };
                          persistRun();
                        }}
                      />
                    {/if}
                  </div>
                {/each}
              {/if}
            </div>
          {/each}
        {:else}
          {#each session.state.qids as qid, i (i)}
            {@const q = questions.find((item) => item.id === qid)}
            {@const curAns = answeredMap[qid] || ""}
            {@const isChoice = q && (q.type === "single" || q.type === "multiple" || q.type === "judge")}
            <div class="lv-row" style="justify-content:space-between;align-items:center;padding:4px 8px;border-bottom:1px solid var(--lv-border-subtle);background:var(--lv-surface);border-radius:4px">
              <div style="display:flex;align-items:center;gap:6px">
                <button type="button" class="lv-chip sm" class:cur={i === cursor} onclick={() => goto(i)} style="cursor:pointer">
                  第 {i + 1} 题
                </button>
                <span class="lv-muted" style="font-size:11px">【{q ? (q.type === "single" ? "单选" : q.type === "multiple" ? "多选" : q.type === "judge" ? "判断" : "主观") : ""}】</span>
              </div>
              {#if isChoice}
                <div class="lv-row" style="margin:0;gap:4px">
                  {#each (q && q.type === "judge" ? ["T", "F"] : ["A", "B", "C", "D"]) as b (b)}
                    {@const active = curAns.includes(b)}
                    <button
                      type="button"
                      class="lv-chip sm"
                      class:lv-chip--acc={active}
                      style="min-width:28px;text-align:center;font-weight:700;cursor:pointer"
                      disabled={examLocked}
                      onclick={() => onBubbleFill(qid, b, q?.type)}
                    >
                      {b}
                    </button>
                  {/each}
                </div>
              {:else}
                <input
                  class="lv-input num sm"
                  style="max-width:140px;height:26px"
                  placeholder="输入答案…"
                  value={curAns}
                  disabled={examLocked}
                  oninput={(e) => {
                    const val = (e.target as HTMLInputElement).value;
                    session?.setAnswer(qid, val, Date.now());
                    answeredMap = { ...answeredMap, [qid]: val };
                    persistRun();
                  }}
                />
              {/if}
            </div>
          {/each}
        {/if}
      </div>
    {/if}
    <!-- 三态图例：新用户无需猜测紫底/琥珀框/实心的含义 -->
    <div class="lv-row lv-muted" style="margin:0;font-size:var(--lv-font-size-label);gap:var(--lv-space-loose)">
      <span class="lv-legend"><i class="dot" style="background:var(--lv-accent-soft)"></i>{t("mock.legend.done")}</span>
      <span class="lv-legend"><i class="dot" style="background:transparent;border:2px solid var(--lv-amber)"></i>{t("mock.legend.flag")}</span>
      <span class="lv-legend"><i class="dot" style="background:var(--lv-accent)"></i>{t("mock.legend.cur")}</span>
    </div>
    <div class="lv-row" style="margin-top:2px">
      <!-- 人机对话模式不可回退：左键不再「向左却前进」（误触会不可逆跳题），与右键一起仅保留前进 -->
      <button class="lv-btn sm" onclick={() => goto(cursor - 1)} disabled={examLocked || bp.lockout || cursor === 0} aria-label={t("session.kbdPrev")} title={bp.lockout ? t("mock.lockout") : t("session.kbdPrev")}><Icon name="chev-left" size={14} /></button>
      <button class="lv-btn sm" onclick={() => goto(cursor + 1)} disabled={examLocked || cursor >= session.state.qids.length - 1} aria-label={t("session.next")} title={t("session.next")}><Icon name="chev-right" size={14} /></button>
      <!-- 位置读数：顺序作答模式下尤其需要知道当前进度 -->
      <span class="lv-muted num">{cursor + 1} / {session.state.qids.length}</span>
    </div>
    {#if view === "exam" && session}
      <div class="lv-mock-floating-pills" style="position:fixed;bottom:22px;right:22px;z-index:90;display:flex;gap:8px;align-items:center">
        {#if unansweredIndices.length > 0 || flaggedIndices.length > 0}
          <button
            type="button"
            class="lv-achievement-pill"
            style="box-shadow:var(--lv-sh-pop);cursor:pointer;font-size:12px;padding:6px 14px;border-radius:var(--lv-radius-pill, 9999px);background:var(--lv-brand);color:var(--lv-on-accent, #fff);border-color:var(--lv-brand)"
            onclick={() => (mockSweepOpen = !mockSweepOpen)}
            title="考前高危遗漏与标旗速排浮窗：集中快速补填未答题与核对存疑题"
            aria-expanded={mockSweepOpen}
            aria-label="考前高危遗漏速排"
          >
            <Icon name="target" size={13} />
            <span>⚡ 冲刺速排 ({unansweredIndices.length}未答 / {flaggedIndices.length}标旗)</span>
          </button>
        {/if}
        <button
          type="button"
          class="lv-achievement-pill lv-achievement-pill--seal"
          style="box-shadow:var(--lv-sh-pop);cursor:pointer;font-size:12px;padding:6px 14px;border-radius:var(--lv-radius-pill, 9999px)"
          onclick={() => (mockMiniSheetOpen = !mockMiniSheetOpen)}
          title="展开考场快捷答题卡"
          aria-expanded={mockMiniSheetOpen}
          aria-label="展开考场快捷答题卡"
        >
          <Icon name="edit" size={13} />
          <span>{unansweredIndices.length > 0 ? `未答 ${unansweredIndices.length}` : "全部答完"} ({cursor + 1}/{session.state.qids.length})</span>
        </button>
      </div>
    {/if}
    {#if mockSweepOpen && session}
      <button type="button" class="lv-hotkeys-backdrop" aria-label="关闭冲刺速排" onclick={() => (mockSweepOpen = false)}></button>
      <div class="lv-hotkeys-wrap">
        <div class="lv-card" role="dialog" aria-modal="true" tabindex="-1" aria-label="考前高危遗漏速排" style="width:min(580px, 94vw);max-height:85vh;overflow-y:auto;pointer-events:auto;padding:20px;border-radius:var(--lv-r-card, 20px);border:1px solid var(--lv-border-subtle);box-shadow:var(--lv-sh-pop)">
          <div class="lv-row" style="justify-content:space-between;align-items:center;margin:0 0 12px">
            <div class="lv-dialog-title-wrap">
              <span class="lv-dialog-title-icon"><Icon name="target" size={14} /></span>
              <span>考前高危遗漏与标旗速排</span>
              <span class="lv-chip lv-chip--red sm num">未答 {unansweredIndices.length}</span>
              <span class="lv-chip lv-chip--amb sm num">标旗 {flaggedIndices.length}</span>
            </div>
            <button class="lv-btn sm" onclick={() => (mockSweepOpen = false)} aria-label="关闭"><Icon name="close" size={13} /></button>
          </div>
          <p class="lv-muted" style="font-size:12px;margin:0 0 10px">
            快速扫清所有漏填题目与存疑蒙猜标记，点击选项即刻秒填并自动前进：
          </p>
          <div class="stack-sm" style="max-height:55vh;overflow-y:auto;display:flex;flex-direction:column;gap:8px">
            {#each sweepIndices as idx (idx)}
              {@const qid = session.state.qids[idx]}
              {@const q = questions.find((item) => item.id === qid)}
              {@const curAns = answeredMap[qid] || ""}
              {@const isChoice = q && (q.type === "single" || q.type === "multiple" || q.type === "judge")}
              <div class="lv-card" style="padding:10px 12px;background:var(--lv-surface-2);border-radius:8px;border:1px solid var(--lv-border-subtle)">
                <div class="lv-row" style="justify-content:space-between;align-items:center;margin:0 0 6px">
                  <div style="font-weight:600;font-size:12.5px;display:flex;align-items:center;gap:6px">
                    <span class="lv-chip sm num" class:lv-chip--red={!curAns} class:lv-chip--amb={session.flags.has(qid)}>第 {idx + 1} 题</span>
                    <span>{q?.stem.slice(0, 50) ?? qid}</span>
                  </div>
                  <button class="lv-btn sm" onclick={() => { goto(idx); mockSweepOpen = false; }} title="进入此题完整做题界面">
                    跳转 ↗
                  </button>
                </div>
                {#if isChoice}
                  <div class="lv-row" style="margin:4px 0 0;gap:6px">
                    {#each (q && q.type === "judge" ? ["对", "错"] : ["A", "B", "C", "D"]) as opt (opt)}
                      {@const active = curAns.includes(opt)}
                      <button type="button" class="lv-chip" class:acc={active}
                        style="{active ? 'background:var(--lv-brand);color:var(--lv-on-accent, #fff);font-weight:700;' : ''}cursor:pointer;padding:3px 10px;font-size:11px"
                        onclick={() => onBubbleFill(qid, opt, q?.type)}>
                        {opt}
                      </button>
                    {/each}
                  </div>
                {:else}
                  <input class="lv-input sm" style="width:100%;margin-top:4px" placeholder="填入作答…" value={curAns} oninput={(e) => {
                    const val = (e.target as HTMLInputElement).value;
                    session?.setAnswer(qid, val, Date.now());
                    answeredMap = { ...answeredMap, [qid]: val };
                    persistRun();
                  }} />
                {/if}
              </div>
            {:else}
              <div class="lv-empty" style="padding:24px 0;font-size:12px">🎉 所有题目均已完成作答，且无存疑标记！可安心交卷。</div>
            {/each}
          </div>
          <div class="lv-row" style="margin-top:14px;justify-content:space-between;align-items:center">
            <button class="lv-btn sm" onclick={() => (mockSweepOpen = false)}>关闭速排</button>
            <button class="lv-btn sm lv-btn--primary" onclick={() => { mockSweepOpen = false; void finishExam(false); }}>
              确认无误，立即交卷
            </button>
          </div>
        </div>
      </div>
    {/if}
    {#if mockMiniSheetOpen && session}
      <button type="button" class="lv-hotkeys-backdrop" aria-label="关闭答题卡" onclick={() => (mockMiniSheetOpen = false)}></button>
      <div class="lv-hotkeys-wrap">
        <div class="lv-card" role="dialog" aria-modal="true" tabindex="-1" aria-label="考场快捷答题卡" style="width:min(520px, 92vw);max-height:80vh;overflow-y:auto;pointer-events:auto;padding:20px;border-radius:var(--lv-r-card, 20px);border:1px solid var(--lv-border-subtle);box-shadow:var(--lv-sh-pop)">
          <div class="lv-row" style="justify-content:space-between;align-items:center;margin:0 0 10px">
            <div class="lv-dialog-title-wrap">
              <span class="lv-dialog-title-icon"><Icon name="edit" size={13} /></span>
              <span>考场快捷答题卡</span>
              <span class="lv-dialog-title-tag">{cursor + 1}/{session.state.qids.length}</span>
            </div>
            <button class="lv-btn sm lv-btn--ghost" onclick={() => (mockMiniSheetOpen = false)} aria-label="关闭"><Icon name="close" size={13} /></button>
          </div>
          <div class="lv-row" style="margin-bottom:8px;font-size:11px;color:var(--lv-text-3);gap:8px">
            <span>已答 {session.state.qids.length - unansweredIndices.length}</span>
            <span>未答 {unansweredIndices.length}</span>
            <span>标记 {flaggedIndices.length}</span>
          </div>
          <div class="lv-sheet" style="max-height:50vh;overflow-y:auto">
            {#if sheetSectionGroups.length > 1}
              {#each sheetSectionGroups as grp (grp.name)}
                <div style="width:100%;margin:6px 0 2px;font-size:11px;font-weight:600;color:var(--lv-text-2);display:flex;justify-content:space-between">
                  <span>{grp.name}（{grp.startIndex + 1}-{grp.endIndex + 1}）</span>
                  <span class="lv-muted num">{grp.answeredCount}/{grp.items.length}</span>
                </div>
                {#each grp.items as it (it.qid)}
                  {@const i = it.index}
                  {@const answered = Boolean(answeredMap[it.qid]?.trim())}
                  {@const flagged = session.flags.has(it.qid)}
                  <button
                    class="lv-cell"
                    class:done={answered}
                    class:flag={flagged}
                    class:cur={i === cursor}
                    disabled={examLocked}
                    onclick={() => { goto(i); mockMiniSheetOpen = false; }}
                  >
                    {i + 1}
                  </button>
                {/each}
              {/each}
            {:else}
              {#each session.state.qids as qid, i (i)}
                {@const answered = Boolean(answeredMap[qid]?.trim())}
                {@const flagged = session.flags.has(qid)}
                <button
                  class="lv-cell"
                  class:done={answered}
                  class:flag={flagged}
                  class:cur={i === cursor}
                  disabled={examLocked}
                  onclick={() => { goto(i); mockMiniSheetOpen = false; }}
                >
                  {i + 1}
                </button>
              {/each}
            {/if}
          </div>
          {#if unansweredIndices.length > 0}
            <div class="lv-row" style="margin-top:12px;justify-content:center">
              <button class="lv-btn sm lv-btn--primary" onclick={() => { gotoNextUnanswered(); mockMiniSheetOpen = false; }} style="display:inline-flex;align-items:center;gap:4px">
                <span>跳至下一道未答题</span>
                <Icon name="chev-right" size={12} />
              </button>
            </div>
          {/if}
        </div>
      </div>
    {/if}
  {:else if view === "report" && score}
    <!-- ===== S7 成绩单 ===== -->
    <div class="lv-row">
      <b style="font-size:16px">{bp.name}</b>
      <span class="lv-chip num">{new Date(startedAt).toLocaleString()}</span>
      {#if session && revisionDrift.length}
        <!-- 55-07 lite：改题后成绩仍按开考冻结版本记录，历史不静默重算 -->
        <span class="lv-chip lv-chip--amb num" title={t("mock.revisedTip")}><Icon name="pencil" size={12} /> {t("mock.revisedNote").replace("{n}", String(revisionDrift.length))}</span>
      {/if}
      {#if score?.scoringPolicy}
        <!-- 55-04：明示本次考试所采用的评分政策条件 -->
        <span class="lv-chip num" title={t("mock.policyCondition")}>
          <Icon name="target" size={12} /> {t("mock.policyCondition")}: {SCORING_POLICY_LABELS[score.scoringPolicy.kind] ?? score.scoringPolicy.kind}
        </span>
      {/if}
    </div>
    <div class="lv-card lv-score-card" style="margin-bottom:14px;border-top:3.5px solid var(--lv-brand);box-shadow:var(--lv-sh-pop)">
      <div class="lv-guard-title" style="color:var(--lv-brand);display:flex;align-items:center;gap:8px;margin-bottom:8px">
        <Icon name="trophy" size={20} />
        <span>{score.percent === 100 ? "满分通关 · 金榜题名！" : score.pass ? "模考达标 · 战绩优异！" : "查漏补缺 · 再接再厉！"}</span>
      </div>
      <div class="lv-row" style="gap:6px;margin:4px 0 10px;flex-wrap:wrap">
        <span class="lv-achievement-pill">
          <Icon name="target" size={13} /> 得分率 {score.percent}%
        </span>
        <span class="lv-achievement-pill {score.pass ? '' : 'lv-achievement-pill--seal'}" style="display:inline-flex;align-items:center;gap:4px">
          <Icon name={score.pass ? "check" : "close"} size={12} />
          <span>{score.pass ? "达到合格线" : "距离及格线 " + (bp.passLine - score.percent) + "%"}</span>
        </span>
        <span class="lv-achievement-pill">
          <Icon name="clock" size={13} /> 题量 {score.sections.reduce((acc, s) => acc + s.total, 0)} 题
        </span>
        {#if wrongList.length > 0}
          <span class="lv-achievement-pill lv-achievement-pill--seal">
            <Icon name="xcircle" size={13} /> 错题 {wrongList.length} 道
          </span>
        {/if}
      </div>
      <div class="lv-row" style="align-items:center;padding:6px 4px">
        <span class="num" style="font-size:var(--lv-font-size-kpi, 28px);font-weight:var(--lv-font-weight-bold, 700);color:var(--lv-data-accent)">{score.total}</span>
        <span class="lv-muted">/ {score.full}</span>
        <span class="lv-chip" class:grn={score.pass} class:red={!score.pass}>{score.pass ? t("mock.pass") : t("mock.fail")}（{t("mock.passLine")} {bp.passLine}%）</span>
        <span class="lv-chip lv-chip--data num">{score.percent}%</span>
        {#if tri}
          <div class="lv-row" style="width:100%;margin:10px 0 0">
            <span class="lv-muted" style="width:44px">{t("mock.thisRun")}</span>
            <div class="progress" style="flex:1"><i style="width:{tri.this}%"></i></div>
            <span class="num lv-muted">{tri.this}%</span>
          </div>
          {#if tri.avg != null}
            <div class="lv-row" style="width:100%;margin:0">
              <span class="lv-muted" style="width:44px">{t("mock.histAvg")}</span>
              <div class="progress" style="flex:1"><i style="width:{tri.avg}%"></i></div>
              <span class="num lv-muted">{tri.avg}%</span>
            </div>
            <p class="lv-muted" style="margin:4px 0 0;display:inline-flex;align-items:center;gap:3px">
              <Icon name={tri.this >= tri.avg ? "arrow-up" : "arrow-down"} size={11} />
              <span>{t("mock.vsAvg")} {Math.abs(tri.this - tri.avg)} {t("mock.points")}</span>
            </p>
          {/if}
        {/if}
      </div>
    </div>
    <!-- 63-05 虚拟排名与百分位模拟：参考池要么是本人历史场次，要么是显式标注的通用虚拟模型 -->
    {#if percentileVerdict}
      <div class="lv-card" style="margin-bottom:14px;padding:var(--lv-space-3) var(--lv-space-4)">
        <div class="lv-row" style="justify-content:space-between;align-items:center;margin:0;flex-wrap:wrap;gap:var(--lv-space-2)">
          <b style="font-size:var(--lv-font-size-body-compact)"><Icon name="chart" size={13} /> {t("mock.percentileTitle")}</b>
          <div class="lv-row" style="margin:0;gap:var(--lv-space-2);align-items:center">
            <span class="lv-chip num" class:lv-chip--amb={!percentileIsPersonal} title={percentileIsPersonal ? t("mock.percentilePoolPersonalTip") : t("mock.percentilePoolSyntheticTip")}>
              {percentileIsPersonal ? t("mock.percentilePoolPersonal").replace("{n}", String(percentileSampleCount)) : t("mock.percentilePoolSynthetic")}
            </span>
            <button class="lv-btn sm lv-btn--ghost" aria-expanded={percentileOpen} onclick={() => percentileOpen = !percentileOpen} aria-label={percentileOpen ? "收起" : "展开"}><Icon name={percentileOpen ? "arrow-down" : "chev-right"} size={12} /></button>
          </div>
        </div>
        <div class="lv-row" style="margin:8px 0 0;align-items:baseline;gap:var(--lv-space-3);flex-wrap:wrap">
          <span class="num" style="font-size:var(--lv-font-size-kpi-mobile, 20px);font-weight:var(--lv-font-weight-bold, 700);color:var(--lv-data-accent)">{t("mock.percentileTop").replace("{n}", String(percentileVerdict.topPercent))}</span>
          <span class="lv-chip num" title={t("mock.percentilePercentileTip")}>{t("mock.percentilePercentile").replace("{n}", String(percentileVerdict.percentile))}</span>
          <span class="lv-chip num" title={t("mock.percentileZTip")}>z = {percentileVerdict.zScore}</span>
        </div>
        {#if percentileOpen}
          <p class="lv-muted" style="margin:8px 0 6px;font-size:var(--lv-font-size-caption)">
            {percentileIsPersonal ? t("mock.percentilePersonalNote").replace("{n}", String(percentileSampleCount)) : t("mock.percentileSyntheticNote")}
          </p>
          <!-- 分数段分布：模型下各档理论占比与本次所在段，同一快照供图形与数据表 -->
          <div class="lv-row" style="margin:6px 0 0;gap:3px;align-items:flex-end;height:76px">
            {#each percentileBands as band, bi (bi)}
              <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%;gap:2px">
                <span class="lv-muted num" style="font-size:9px">{band.share}</span>
                <div style="width:100%;background:{band.mine ? 'var(--lv-data-accent)' : 'var(--lv-surface-3, var(--lv-surface-2))'};height:{(band.share / percentileBandMax) * 46}px;min-height:2px;border-radius:2px 2px 0 0;border:1px solid {band.mine ? 'var(--lv-data-accent)' : 'transparent'}"
                  title={t("mock.percentileBandTip").replace("{label}", band.label).replace("{share}", String(band.share))}></div>
                <span class="lv-muted num" style="font-size:9px">{band.label}</span>
              </div>
            {/each}
          </div>
          {#if percentileCurve}
            <!-- 45-08：曲线 + 数据表 + CSV 同一快照；读屏以 aria-label 说明为模型演算值 -->
            <svg viewBox="0 0 {percentileCurve.xMax - percentileCurve.xMin} 100" preserveAspectRatio="none"
              style="width:100%;max-width:460px;height:72px;display:block;margin:10px 0 0"
              role="img" aria-label={t("mock.percentileCurveAria")}>
              <polyline
                points={percentileCurve.points.map((p) => `${(p.x - percentileCurve!.xMin)},${100 - (p.pdf / percentileCurve!.pdfPeak) * 92}`).join(" ")}
                fill="none" stroke="var(--lv-border-subtle)" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke" />
              <polyline
                points={percentileCurve.points.map((p) => `${(p.x - percentileCurve!.xMin)},${100 - p.cdf}`).join(" ")}
                fill="none" stroke="var(--lv-data-accent)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke" />
              {#each percentileCurve.points.filter((p) => p.mine) as mp (mp.x)}
                <line x1={mp.x - percentileCurve!.xMin} y1="0" x2={mp.x - percentileCurve!.xMin} y2="100" stroke="var(--lv-amber)" stroke-width="1.5" vector-effect="non-scaling-stroke" />
              {/each}
            </svg>
            <p class="lv-muted" style="margin:2px 0 6px;font-size:9px">{t("mock.percentileCurveLegend")}</p>
          {/if}
        {/if}
        <div class="lv-row" style="margin:8px 0 0;gap:var(--lv-space-2);flex-wrap:wrap">
          <button class="lv-btn sm lv-btn--ghost" onclick={exportPercentileModelCsv}><Icon name="export" size={13} /> {t("mock.percentileExport")}</button>
          {#if !percentileIsPersonal}
            <span class="lv-muted" style="font-size:var(--lv-font-size-caption)">{t("mock.percentileNeedMore").replace("{n}", String(Math.max(0, 5 - percentileSampleCount)))}</span>
          {/if}
        </div>
      </div>
    {/if}
    {#each score.sections as sec, _i (_i)}
      <div class="lv-row" style="margin:4px 0">
        <span style="width:70px">{sec.name}</span>
        <div class="progress" style="flex:1"><i style="width:{percentBar(sec.score, sec.full)}%"></i></div>
        <span class="num lv-muted">{sec.score}/{sec.full} · {t("mock.correct")} {sec.correct}/{sec.total} · {Math.round(sec.timeSpentMs / 1000)}s</span>
        {#if sec.short}
          <!-- 40-02：短缺段如实标注（要求 N 实际 M；满分已按实际题数计） -->
          <span class="lv-chip lv-chip--amb num" title={t("mock.shortSecTip").replace("{n}", String(sec.required))}>{t("mock.shortSec").replace("{n}", String(sec.required))}</span>
        {/if}
      </div>
    {/each}
    {#if subjectiveQuestions.length > 0 && session}
      <!-- ✍️ 主观大题考后采分自评通道（ECO-02 / TODO-09） -->
      <div class="lv-card" style="margin:12px 0;padding:14px 18px;border-left:4px solid var(--lv-brand);background:var(--lv-surface)">
        <div class="lv-row" style="justify-content:space-between;align-items:center;margin:0 0 8px">
          <div style="font-weight:700;font-size:14px;color:var(--lv-text);display:flex;align-items:center;gap:6px">
            <Icon name="edit" size={14} /> ✍️ 主观大题考后采分自评通道（{subjectiveQuestions.length} 道大题）
          </div>
          <span class="lv-muted" style="font-size:12px">对照参考答案与采分要点打分，卷面总分实时重新加权结算</span>
        </div>
        <div class="stack-sm">
          {#each subjectiveQuestions as sq (sq.id)}
            {@const curAns = session.answers.get(sq.id)}
            {@const factor = curAns?.factor ?? 0}
            {@const scoreEach = session.scoreOfQ(sq.id) || sq.score || 10}
            <div style="padding:10px 14px;background:var(--lv-surface-2);border:1px solid var(--lv-border);border-radius:var(--lv-r-2);margin-bottom:8px">
              <div style="font-weight:600;font-size:13px;color:var(--lv-text);margin-bottom:4px">
                {sq.stem} <span class="lv-muted">（满分 {scoreEach} 分 · 当前得分 {(scoreEach * factor).toFixed(1)} 分）</span>
              </div>
              {#if curAns?.answer}
                <div style="font-size:12px;color:var(--lv-text-2);margin-bottom:6px;padding:4px 8px;background:var(--lv-surface);border-radius:4px">
                  <b>考生考场作答：</b>{curAns.answer}
                </div>
              {/if}
              <div style="font-size:12px;color:var(--lv-text-3);margin-bottom:8px">
                <b>参考标准：</b>{sq.answer || "见采分点标准"}
                {#if sq.analysis} · <b>解析：</b>{sq.analysis}{/if}
              </div>
              <div class="lv-row" style="gap:6px;align-items:center;flex-wrap:wrap">
                <span class="lv-muted" style="font-size:11px">采分比例自评：</span>
                {#each [
                  { f: 0, label: "0% (0分)" },
                  { f: 0.3, label: "30% (及格偏下)" },
                  { f: 0.6, label: "60% (合格)" },
                  { f: 0.8, label: "80% (良好)" },
                  { f: 1.0, label: "100% (满分)" },
                ] as opt (opt.f)}
                  <button
                    type="button"
                    class="lv-chip sm"
                    class:acc={Math.abs(factor - opt.f) < 0.05}
                    onclick={() => applySubjectiveSelfRating(sq.id, opt.f)}
                  >
                    {opt.label}
                  </button>
                {/each}
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/if}
    {#if pacingPostMortem}
      <div class="lv-card" style="margin:12px 0;padding:12px 16px;background:var(--lv-surface-2);border-radius:var(--lv-r-3, 14px);border:1px solid var(--lv-border-subtle)">
        <div class="lv-row" style="justify-content:space-between;align-items:center;margin:0 0 8px">
          <b style="font-size:var(--lv-font-size-body-compact)"><Icon name="clock" size={13} /> {t("mock.pacingPostMortem")}</b>
          <button class="lv-btn sm lv-btn--ghost" onclick={exportPacingReport}><Icon name="export" size={12} /> {t("mock.exportPacing")}</button>
        </div>
        <p class="lv-muted" style="font-size:var(--lv-font-size-caption);margin:0 0 8px">{pacingPostMortem.summary}</p>
        <div class="lv-bp-table">
          <div class="lv-bp-row head"><span>大题分段</span><span>建议预算</span><span>实际用时</span><span>耗时偏差</span><span>节奏诊断</span></div>
          {#each pacingPostMortem.sections as ps (ps.sectionName)}
            <div class="lv-bp-row">
              <span>{ps.sectionName}</span>
              <span class="num">{Math.round(ps.budgetSeconds / 60)}m</span>
              <span class="num">{Math.round(ps.actualSeconds / 60)}m</span>
              <span class="num" class:lv-chip--grn={ps.diffSeconds < 0} class:lv-chip--red={ps.diffSeconds > 120}>{ps.diffSeconds > 0 ? `+${Math.round(ps.diffSeconds / 60)}m` : `${Math.round(ps.diffSeconds / 60)}m`}</span>
              <span class="lv-row" style="align-items:center;gap:5px;font-size:var(--lv-font-size-caption)">
                {#if ps.status === "time_sink"}
                  <span class="lv-dot" style="background:var(--lv-red)"></span>
                  <span style="color:var(--lv-red);font-weight:600">耗时陷阱</span>
                {:else if ps.status === "efficient"}
                  <span class="lv-dot" style="background:var(--lv-data-accent)"></span>
                  <span style="color:var(--lv-data-accent);font-weight:600">高效提分</span>
                {:else}
                  <span class="lv-dot" style="background:var(--lv-green)"></span>
                  <span style="color:var(--lv-green);font-weight:600">稳健</span>
                {/if}
              </span>
            </div>
          {/each}
        </div>
      </div>
    {/if}
    {#if historyLoading}
      <p class="lv-muted" role="status" aria-live="polite">{t("mock.historyLoading", "正在读取模考历史…")}</p>
    {:else if historyError}
      <div class="lv-error" role="alert">{historyError} <button class="lv-btn sm" disabled={historyLoading} onclick={() => void reloadMockHistory()}>{historyLoading ? "…" : t("mock.historyRetry", "重试读取")}</button></div>
    {:else if history.length < 2}
      <p class="lv-muted">{t("mock.historyEmpty", "完成两场模考后，这里会显示历史趋势。")}</p>
    {/if}
    <!-- 45-08 收口：分段/历史图表的文本等价物 + CSV（同一数据快照） -->
    <div class="lv-row" style="margin:6px 0;gap:var(--lv-space-2);flex-wrap:wrap">
      <button class="lv-btn sm lv-btn--primary" onclick={copyExamSummaryMarkdown} title={t("mock.copySummary")}>
        <Icon name="copy" size={13} /> {t("mock.copySummary")}
      </button>
      <button class="lv-btn sm lv-btn--ghost" aria-expanded={mockTableOpen} onclick={() => mockTableOpen = !mockTableOpen}><Icon name="table" size={13} /> {t("data.table")}</button>
      <button class="lv-btn sm lv-btn--ghost" onclick={() => downloadMockCsv(mockSectionsToCsv(score.sections), "sections")}><Icon name="export" size={13} /> CSV</button>
      {#if history.length}
        <button class="lv-btn sm lv-btn--ghost" onclick={() => downloadMockCsv(mockHistoryToCsv(history), "history")}><Icon name="export" size={13} /> CSV {t("mock.history")}</button>
      {/if}
    </div>
    {#if mockTableOpen}
      <div class="lv-card" style="margin:6px 0;overflow:auto">
        <table class="lv-dtable">
          <thead><tr><th>{t("mock.sec")}</th><th>{t("mock.each")}</th><th>{t("mock.correct")}</th><th>{t("report.accuracy")}</th></tr></thead>
          <tbody>
            {#each score.sections as sec, _si (_si)}
              <tr><td class="num">{sec.name}</td><td class="num">{sec.score}/{sec.full}</td><td class="num">{sec.correct}/{sec.total}</td><td class="num">{sec.total ? Math.round((sec.correct / sec.total) * 100) : 0}%</td></tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
    {#if score.sections.length >= 3}
      <div class="lv-card" style="margin:12px 0">
        <b style="font-size:var(--lv-font-size-body-compact)">{t("mock.radar")}</b>
        <svg viewBox="0 0 220 190" style="width:100%;max-width:300px;margin:0 auto;display:block" role="img" aria-label={t("mock.radar")}>
          <polygon points={radarPoints(score.sections.map(() => 1))} fill="none" stroke="var(--lv-border-subtle)" stroke-width="0.8" />
          <polygon points={radarPoints(score.sections.map(() => 0.5))} fill="none" stroke="var(--lv-border-subtle)" stroke-width="0.8" stroke-dasharray="3 3" />
          <polygon points={radarPoints(secAccuracy)} fill="var(--lv-data-soft)" stroke="var(--lv-data-accent)" stroke-width="2" stroke-linejoin="round" />
          {#each radarLabel(secAccuracy) as lb, _i (_i)}
            <text x={lb.x} y={lb.y} font-size="10" fill="var(--lv-text-3)" text-anchor="middle">{lb.name}</text>
          {/each}
        </svg>
      </div>
    {/if}
    <div class="lv-row">
      <span class="lv-chip num"><Icon name="pin" size={12} /> {score.flagsUsed}</span>
      <span class="lv-chip num">{t("mock.changes")} {score.changes}</span>
      <span class="lv-chip num">{t("mock.last20")} {score.last20min.correct}/{score.last20min.attempted}</span>
      {#if session?.state.extraTimeS}
        <!-- 55-06 lite：单次条件覆盖明示（同卷不同条件不混排比较的依据） -->
        <span class="lv-chip lv-chip--amb num" title={t("mock.extraTip")}><Icon name="clock" size={13} />+{Math.round(session.state.extraTimeS / 60)}{t("entry.minutes")}</span>
      {/if}
    </div>
    {#if history.length >= 2}
      <div class="lv-card" style="margin:12px 0">
        <b style="font-size:var(--lv-font-size-body-compact)">{t("mock.history")}</b>
        <p class="lv-muted">{t("mock.historyScope", "历史记录可能来自不同题库、卷面或时长，百分比仅供回看，不直接比较进步或能力。")}</p>
        <svg viewBox="0 0 300 110" style="width:100%;max-width:420px;display:block;overflow:visible" role="img" aria-label={t("mock.history")}>
          <defs>
            <linearGradient id="lv-mock-tab-history-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="var(--lv-data-accent)" stop-opacity="0.2" />
              <stop offset="100%" stop-color="var(--lv-data-accent)" stop-opacity="0" />
            </linearGradient>
          </defs>
          <line x1="0" y1="105" x2="300" y2="105" stroke="var(--lv-border-subtle)" stroke-width="0.8" />
          <polygon
            points={`0,105 ${historyPoints()} 300,105`}
            fill="url(#lv-mock-tab-history-fill)"
          />
          <polyline points={historyPoints()} fill="none" stroke="var(--lv-data-accent)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
          {#each history as h, i (i)}
            <circle cx={(i / Math.max(1, history.length - 1)) * 300} cy={100 - Math.round(h.percent)} r="3.5" fill="var(--lv-data-accent)" stroke="var(--lv-surface)" stroke-width="2"><title>{h.name} {h.percent}%</title></circle>
          {/each}
        </svg>
        <div class="lv-row" style="margin:6px 0 0">
          {#each history.slice(-5) as h, i (i)}
            <button class="lv-chip num" class:acc={historyDetail === Math.max(0, history.length - 5) + i}
              title={new Date(h.startedAt).toLocaleString()}
              aria-pressed={historyDetail === Math.max(0, history.length - 5) + i}
              onclick={() => historyDetail = historyDetail === Math.max(0, history.length - 5) + i ? -1 : Math.max(0, history.length - 5) + i}
              style="display:inline-flex;align-items:center;gap:4px">
              <span>{h.name} {h.percent}%</span>
              {#if h.pass}<Icon name="check" size={11} />{/if}
            </button>
          {/each}
        </div>
        {#if historyDetail >= 0 && history[historyDetail]}
          {@const h = history[historyDetail]}
          <div class="lv-card" style="padding:12px 16px;margin-top:8px;background:var(--lv-surface-2);border-radius:var(--lv-r-3, 14px);border:1px solid var(--lv-border-subtle)">
            <b class="num" style="font-size:var(--lv-font-size-body-compact)">{h.name} · {h.percent}%</b>
            {#if h.sections?.length}
              {#each h.sections as s, _i (_i)}
                <div class="lv-row" style="margin:3px 0">
                  <span class="lv-muted" style="width:64px">{s.name}</span>
                  <div class="progress" style="flex:1"><i style="width:{percentBar(s.score, s.full)}%"></i></div>
                  <span class="num lv-muted">{s.score}/{s.full}</span>
                </div>
              {/each}
            {:else}
              <p class="lv-muted" style="margin:4px 0 0">{t("mock.legacyRecord")}</p>
            {/if}
          </div>
        {/if}
      </div>
    {/if}
    {#if score && session}
      <div class="lv-card" style="margin:12px 0">
        <div class="lv-row" style="justify-content:space-between;margin:0 0 8px;align-items:center;flex-wrap:wrap;gap:6px">
          <div class="lv-session-dock" role="tablist" style="margin:0">
            <button type="button" role="tab" class="lv-chip sm" class:acc={mockReviewFilter === "wrong"} onclick={() => { mockReviewFilter = "wrong"; showWrongDetail = true; }}>
              错题复盘 ({wrongList.length})
            </button>
            <button type="button" role="tab" class="lv-chip sm" class:acc={mockReviewFilter === "flagged"} onclick={() => { mockReviewFilter = "flagged"; showWrongDetail = true; }}>
              标旗存疑 ({score.flagsUsed})
            </button>
            <button type="button" role="tab" class="lv-chip sm" class:acc={mockReviewFilter === "all"} onclick={() => { mockReviewFilter = "all"; showWrongDetail = true; }}>
              全卷详单 ({session.state.qids.length})
            </button>
          </div>
          <button class="lv-btn sm lv-btn--ghost" onclick={() => showWrongDetail = !showWrongDetail}>
            {showWrongDetail ? t("mock.hideWrongDetail") : t("mock.toggleWrongDetail")}
          </button>
        </div>
        {#if !showWrongDetail}
          <div class="lv-row" style="margin:8px 0 0;gap:var(--lv-space-compact)">
            {#each displayedReviewList.slice(0, 12) as w, _i (_i)}
              <span class="lv-chip num" title={w.stem}>{w.stem}</span>
            {/each}
            {#if displayedReviewList.length > 12}<span class="lv-muted num">… +{displayedReviewList.length - 12}</span>{/if}
          </div>
        {:else}
          <div class="lv-detail" style="margin-top:10px;display:flex;flex-direction:column;gap:8px">
            {#each displayedReviewList as w (w.qid)}
              {@const q = questionMap.get(w.qid)}
              <div class="lv-error-row" style="white-space:normal;padding:8px 12px;border-radius:var(--lv-r-1);background:var(--lv-surface-2)">
                <div style="font-weight:600;display:flex;align-items:center;gap:6px">
                  <span class="num">#{w.idx + 1}</span>
                  <span class="lv-chip sm num" class:lv-chip--grn={w.verdict === "correct"} class:lv-chip--red={w.verdict === "wrong"} class:lv-chip--amb={w.verdict === "not_attempted"}>
                    {w.verdict === "correct" ? "正解" : w.verdict === "wrong" ? "错题" : "未答"}
                  </span>
                  <span>{q?.stem ?? w.stem}</span>
                </div>
                <div class="lv-row" style="margin:4px 0;gap:var(--lv-space-2);align-items:center;flex-wrap:wrap">
                  <span class="lv-chip lv-chip--acc num">标准答案: {formatDisplayAnswer(q?.answer) || "—"}</span>
                  {#if answeredMap[w.qid]}<span class="lv-chip lv-chip--red num">考生作答: {formatDisplayAnswer(answeredMap[w.qid])}</span>{/if}
                  {#if w.changes > 0}
                    <span class="lv-chip lv-chip--amb num" title="考场作答犹豫修改次数"><Icon name="rotate" size={11} /> 犹豫改选 {w.changes} 次</span>
                  {/if}
                  {#if w.isFlagged}
                    <span class="lv-chip lv-chip--amb num" title="考生在考场标记此题为存疑/蒙猜"><Icon name="star" size={11} /> 考场存疑蒙猜</span>
                  {/if}
                  {#if q?.kp}<span class="lv-chip num">{q.kp}</span>{/if}
                  {#if q?.blockId}
                    <button type="button" class="lv-btn sm lv-btn--ghost" title="在思源笔记中打开并高亮原题块（按住 Ctrl/Cmd 点击可在右侧分屏打开）" onclick={(e) => openInSiYuan(q.rootId || "", q.blockId, { event: e })}>
                      <Icon name="pin" size={12} /> 原题 ↗
                    </button>
                  {/if}
                </div>
                {#if q?.analysis}<div class="lv-muted" style="font-size:var(--lv-font-size-caption);margin-top:4px"><span class="lv-badge" style="margin-right:4px">解析</span>{q.analysis}</div>{/if}
                {#if q?.expansion}<div class="lv-muted" style="font-size:var(--lv-font-size-caption);margin-top:4px;padding:3px 8px;background:var(--lv-surface-2);border-left:2px solid var(--lv-accent);border-radius:2px"><span style="color:var(--lv-accent);font-weight:600">💡 思路拓展：</span>{q.expansion}</div>{/if}
              </div>
            {/each}
          </div>
        {/if}
        <div class="lv-row" style="margin:8px 0 0">
          <button class="lv-btn sm" disabled={mockActionBusy} onclick={wrongsToActions}><Icon name="pin" size={13} /> {mockActionBusy ? "…" : t("action.addWrong")}</button>
          <span class="lv-muted">{t("session.reason")}:</span>
          {#each ["careless", "unknown", "trap"] as r, _i (_i)}
            <button class="lv-chip" disabled={mockReasonBusy} onclick={() => bulkWrongReason(r as "careless" | "unknown" | "trap")}>{t("reason." + r)}</button>
          {/each}
          {#if mockActionNote}<span class="lv-muted num">{mockActionNote}</span>{/if}
        </div>
      </div>
    {/if}
    <div class="lv-row" style="flex-wrap:wrap;gap:6px">
      {#if wrongList.length}
        <button class="lv-btn sm lv-btn--primary" onclick={createMockTargetDrill} disabled={targetDrillBusy} title="为本次所有做错的试题打上专场靶向标签，并一键开启二刷靶向攻坚"><Icon name="target" size={13} /> {targetDrillBusy ? "…" : "🎯 生成本场专属攻坚卷"}</button>
        <button class="lv-btn sm lv-btn--primary" onclick={printMockWrongSheet} disabled={printBusy} title="将本次模考全部错题排版生成 A4 双栏精练卷"><Icon name="file" size={13} /> {t("mock.printWrongSheet", "打印本次错题精练卷")}</button>
        <button class="lv-btn sm lv-btn--ghost" onclick={saveMockWrongsAsDoc} title="将本次模考错题存为思源原生笔记文档"><Icon name="book" size={13} /> {t("mock.saveWrongsToDoc", "存为错题集笔记")}</button>
      {/if}
      <button class="lv-btn sm" onclick={insertScoreToDailyNote} disabled={insertDailyBusy} title="将本次模考得分率、耗时与及格判定以引用块格式追加写入思源今日日记文档"><Icon name="calendar" size={13} /> {insertDailyBusy ? "…" : "插入今日日记"}</button>
      <button class="lv-btn lv-btn--ghost sm" onclick={exportScoreMd} disabled={scoreExportBusy}><Icon name="table" size={13} /> {scoreExportBusy ? "…" : t("mock.exportScore")}</button>
      <select class="lv-select sm" bind:value={reportPrintFormat} disabled={printBusy} aria-label="选择考后打印版式">
        <option value="answer">独立答案册</option>
        <option value="lecture">授课讲义卷</option>
        <option value="exam">标准测试卷</option>
        <option value="homework">留白作业单</option>
        <option value="interactive">🌐 交互式讲题自测卷</option>
      </select>
      <button class="lv-btn lv-btn--ghost sm" onclick={openMockAssemble} disabled={!questions.length} title="进入专业组卷排版工坊，自定义 A4 纸面大标题、密封线、总分表与答题留白并直接打印">
        <Icon name="printer" size={13} /> 🖨️ 组卷排版
      </button>
      <button class="lv-btn lv-btn--ghost sm" onclick={() => void printMockByFormat(reportPrintFormat)} disabled={printBusy} title="按所选版式打印答案册、授课讲义或测试卷"><Icon name="file" size={13} /> {t("mock.printAnswerSheet")}</button>
      {#if activeBankId}
        <button class="lv-btn lv-btn--ghost sm" onclick={writeScoreDoc} disabled={scoreWriteBusy} aria-busy={scoreWriteBusy}><Icon name="book" size={14} /> {scoreWriteBusy ? t("mock.scoreWriting", "正在写入成绩单…") : scoreWriteError ? t("mock.scoreWriteRetry", "重试写入成绩单") : t("mock.exportToDoc")}</button>
      {/if}
      {#if wrongList.length}<button class="lv-btn lv-btn--primary" disabled={rewrongBusy} onclick={rewrongDrill}><Icon name="xcircle" size={15} /> {rewrongBusy ? "…" : t("mock.rewrong")}</button>{/if}
      <button class="lv-btn" onclick={showConfig} disabled={scoreWriteBusy || scoreExportBusy || rewrongBusy}><Icon name="rotate" size={15} /> {t("mock.again")}</button>
    </div>
    {#if lastSavedMockDoc?.docId}
      <div class="lv-row" style="margin:8px 0 0;padding:6px 12px;background:var(--lv-surface-2);border-radius:var(--lv-r-2, 10px);border:1px solid var(--lv-border-subtle);justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px" role="status">
        <span style="font-size:var(--lv-font-size-sm);display:inline-flex;align-items:center;gap:6px">
          <Icon name="check" size={13} /> 已存为思源笔记文档：<b>《{lastSavedMockDoc.title}》</b>
        </span>
        <button type="button" class="lv-btn sm lv-btn--ghost" onclick={() => openInSiYuan(lastSavedMockDoc!.docId)}>
          <Icon name="link" size={12} /> 在思源中打开 ↗
        </button>
      </div>
    {/if}
    {#if scoreWriteError}<div class="lv-error" role="alert">{scoreWriteError}</div>{/if}
  {/if}
</div>
  </div>
  <Palette commands={paletteCommands} bind:open={paletteOpen} {t} />
  <PaperAssembleModal
    open={mockAssembleOpen}
    bankName={bp.name || "全真模拟考试卷"}
    questions={mockAssembleQuestions}
    onclose={() => (mockAssembleOpen = false)}
    showMessage={(msg) => showMessage(msg)}
  />
</div>
</div>

<style>
  .lv-pad { padding: var(--lv-space-4) 22px var(--lv-space-9); overflow: auto; }
  .lv-input { min-height: var(--lv-control-height-md); padding: var(--lv-component-pad-md); border-radius: var(--lv-r-2); border: 1px solid var(--lv-ctl-border); background: var(--lv-surface); color: var(--lv-text); font: inherit; font-size: var(--lv-font-size-body); box-shadow: var(--lv-sh-1), var(--lv-inset-subtle, inset 0 1px 0 transparent); transition: border-color var(--lv-dur-micro) var(--lv-ease-out), box-shadow var(--lv-dur-micro) var(--lv-ease-out); }
  .lv-input:hover:not(:disabled) { border-color: var(--lv-border-hover, var(--lv-accent)); }
  .lv-input:focus { border-color: var(--lv-accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--lv-accent) 18%, transparent), var(--lv-inset-subtle, inset 0 1px 0 transparent); outline: none; }
  .lv-input.num { width: 72px; }
  .lv-textarea { width: 100%; min-height: 80px; resize: vertical; }
  /* .lv-btn/.lv-select 外观基线上收 lv-base.scss */
  .lv-flag-btn { min-width: 34px; padding: 5px 8px; }
  .lv-flag-btn--on { border-color: var(--lv-amber); color: var(--lv-amber); background: var(--lv-amber-soft); }
  .lv-card { background: var(--lv-surface); border: 1px solid var(--lv-border-subtle, var(--lv-border)); border-radius: var(--lv-r-3); padding: var(--lv-space-5) var(--lv-space-6); box-shadow: var(--lv-sh-card, var(--lv-sh-1)), var(--lv-inset-highlight, inset 0 1px 0 transparent); transition: box-shadow var(--lv-dur-view) var(--lv-ease-out), transform var(--lv-dur-micro) var(--lv-ease-out), border-color var(--lv-dur-micro) var(--lv-ease-out); }
  .lv-stem { font-size: 19px; line-height: 1.75; font-weight: 600; letter-spacing: -.2px; margin-bottom: 16px; white-space: pre-wrap; -webkit-font-smoothing: antialiased; }
  .lv-opt,
  .lv-opt * {
    user-select: none !important;
    -webkit-user-select: none !important;
    -webkit-touch-callout: none !important;
  }
  .lv-opt { display: flex; gap: 14px; align-items: center; width: 100%; min-height: 52px; box-sizing: border-box; touch-action: manipulation; text-align: left; padding: 16px 20px; border-radius: var(--lv-r-3); border: 1.5px solid var(--lv-ctl-border); margin-bottom: 12px; cursor: pointer; background: var(--lv-surface); font: inherit; color: inherit; box-shadow: var(--lv-sh-1), var(--lv-inset-card); transition: background-color var(--lv-dur-micro) ease, border-color var(--lv-dur-micro) ease, box-shadow var(--lv-dur-micro) ease, transform var(--lv-dur-micro) ease; }
  .lv-opt:hover { border-color: var(--lv-border-hover, var(--lv-accent)); background: color-mix(in srgb, var(--lv-accent) 4%, var(--lv-surface)); transform: translateY(-1px); box-shadow: var(--lv-sh-2); }
  .lv-opt:active { transform: scale(0.985); }
  .lv-opt .key { width: 34px; height: 34px; border-radius: 9px; display: grid; place-items: center; flex: none; font-size: 13px; font-weight: var(--lv-font-weight-bold, 700); font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; background: var(--lv-surface-2); color: var(--lv-text-2); border: 1px solid var(--lv-border); box-shadow: var(--lv-keycap-shadow); transition: background-color var(--lv-dur-micro) ease, border-color var(--lv-dur-micro) ease, color var(--lv-dur-micro) ease; }
  .lv-opt-check { width: 18px; height: 18px; border-radius: var(--lv-radius-round); border: 1.5px solid var(--lv-ctl-border); background: var(--lv-surface); flex: none; display: grid; place-items: center; transition: background-color var(--lv-dur-micro) ease, border-color var(--lv-dur-micro) ease; }
  .lv-opt-check.box { border-radius: 5px; }
  .lv-opt-check::after { content: ""; width: 8px; height: 8px; border-radius: var(--lv-radius-round); background: var(--lv-on-accent, #fff); transform: scale(0); transition: transform var(--lv-dur-micro) var(--lv-ease-out); }
  .lv-opt-check.box::after { border-radius: 1.5px; }
  .lv-opt.sel .lv-opt-check { border-color: transparent; background: var(--lv-accent); }
  .lv-opt.sel .lv-opt-check::after { transform: scale(1); }
  .lv-opt.sel { border-color: var(--lv-accent); background: color-mix(in srgb, var(--lv-accent-soft) 85%, var(--lv-surface)); box-shadow: 0 0 0 1.5px var(--lv-accent), 0 3px 10px color-mix(in srgb, var(--lv-accent) 18%, transparent); }
  .lv-opt.sel .key { background: var(--lv-accent); border-color: var(--lv-accent); color: var(--lv-on-accent, #fff); box-shadow: 0 2px 8px color-mix(in srgb, var(--lv-accent) 28%, transparent); transform: scale(1.04); }
  .lv-opt.eliminated { opacity: 0.45; background: var(--lv-surface-2) !important; border-style: dashed !important; }
  .lv-opt.eliminated .lv-opt-text { text-decoration: line-through; }
  .lv-opt.eliminated .key { opacity: 0.6; text-decoration: line-through; }
  .lv-bp-table { border: 1px solid var(--lv-border); border-radius: 12px; overflow-x: auto; margin: 10px 0; background: var(--lv-surface); }
  .lv-bp-row { display: grid; grid-template-columns: 1fr .45fr .45fr .65fr 1.1fr .85fr 36px; gap: var(--lv-space-2); padding: 8px 12px; border-bottom: 1px solid var(--lv-border-subtle, var(--lv-border)); align-items: center; min-width: 680px; }
  .lv-bp-row:last-child { border-bottom: none; }
  .lv-bp-row:not(.head):hover { background: var(--lv-surface-2); }
  .lv-bp-row.head { background: var(--lv-surface-2); font-size: var(--lv-font-size-caption); font-weight: var(--lv-font-weight-bold); color: var(--lv-text-3); border-bottom: 1px solid var(--lv-border); }
  /* 蓝图行数据网格密度（规范 v6）：34px 控件，行更紧凑 */
  .lv-bp-row .lv-input, .lv-bp-row .lv-select { min-height: 34px; padding: 5px 10px; border-radius: var(--lv-radius-control-sm); font-size: var(--lv-font-size-body-compact); }
  .lv-bp-del:hover:not(:disabled) { border-color: var(--lv-red); color: var(--lv-red); background: var(--lv-red-soft); }
  /* 答题卡（规范 v6 §5.4）：现代微质感 CBT 格子矩阵 */
  .lv-sheet-bar { display: flex; align-items: center; justify-content: space-between; gap: var(--lv-space-2); margin-top: 14px; margin-bottom: 8px; flex-wrap: wrap; }
  .lv-sheet-tabs { display: flex; gap: var(--lv-space-compact); flex-wrap: wrap; }
  .lv-cell.dimmed { opacity: 0.22; }
  .lv-sheet { display: grid; grid-template-columns: repeat(auto-fill, minmax(44px, 1fr)); gap: 9px; margin: 14px 0 10px; max-width: 660px; padding: 14px; background: var(--lv-surface-2); border-radius: var(--lv-r-2); border: 1px solid var(--lv-border-subtle, var(--lv-border)); }
  /* 三态图例小方块 */
  .lv-legend { display: inline-flex; align-items: center; gap: 6px; font-weight: var(--lv-font-weight-medium); }
  .lv-legend .dot { display: inline-block; width: 12px; height: 12px; border-radius: 4px; flex: none; box-shadow: var(--lv-sh-1); }
  .lv-cell { min-width: 44px; min-height: 44px; border-radius: 12px; border: 1px solid var(--lv-ctl-border); background: var(--lv-surface); font-size: var(--lv-font-size-body-compact); font-weight: var(--lv-font-weight-semibold); font-variant-numeric: tabular-nums; font-family: ui-monospace, monospace; color: var(--lv-text-2); cursor: pointer; box-shadow: var(--lv-sh-1), var(--lv-inset-subtle, inset 0 1px 0 transparent); transition: background-color var(--lv-dur-micro) var(--lv-ease-out), border-color var(--lv-dur-micro) var(--lv-ease-out), color var(--lv-dur-micro) var(--lv-ease-out), transform var(--lv-dur-micro) var(--lv-ease-out), box-shadow var(--lv-dur-micro) var(--lv-ease-out); }
  .lv-cell:hover:not(:disabled) { transform: translateY(-1px); box-shadow: var(--lv-sh-2); border-color: var(--lv-border-hover, var(--lv-accent)); }
  .lv-cell:active:not(:disabled) { transform: scale(0.96); }
  .lv-cell.done { background: var(--lv-accent-soft); color: var(--lv-accent); border-color: color-mix(in srgb, var(--lv-accent) 36%, transparent); font-weight: var(--lv-font-weight-bold); }
  .lv-cell.flag { position: relative; outline: 2px solid var(--lv-amber); outline-offset: -2px; border-color: var(--lv-amber); background: color-mix(in srgb, var(--lv-amber-soft) 40%, var(--lv-surface)); box-shadow: 0 0 6px color-mix(in srgb, var(--lv-amber) 25%, transparent); }
  .lv-cell.flag::after { content: ""; position: absolute; top: 3.5px; right: 3.5px; width: 6px; height: 6px; border-radius: var(--lv-radius-round, 9999px); background: var(--lv-amber); box-shadow: 0 0 4px color-mix(in srgb, var(--lv-amber) 50%, transparent); }
  .lv-cell.cur { background: var(--lv-accent); color: var(--lv-on-accent, #fff); border-color: transparent; box-shadow: 0 0 0 2px var(--lv-surface), 0 0 0 4.5px var(--lv-accent), var(--lv-sh-2); transform: translateY(-1px); z-index: 2; }
  .lv-card.lv-question { box-shadow: var(--lv-sh-card), var(--lv-inset-highlight, inset 0 1px 0 transparent); border-radius: var(--lv-r-3); border: 1px solid var(--lv-border-subtle, var(--lv-border)); }
  .lv-score-card { box-shadow: var(--lv-sh-card), var(--lv-inset-highlight, inset 0 1px 0 transparent); border-radius: var(--lv-r-3); border: 1px solid var(--lv-border-subtle, var(--lv-border)); }
  .lv-score-card .lv-chip.grn { background: var(--lv-green-soft); color: var(--lv-green); font-weight: var(--lv-font-weight-semibold); box-shadow: 0 0 10px color-mix(in srgb, var(--lv-green) 35%, transparent); }
  .lv-score-card .lv-chip.red { background: var(--lv-red-soft); color: var(--lv-red); font-weight: var(--lv-font-weight-semibold); box-shadow: 0 0 8px color-mix(in srgb, var(--lv-red) 25%, transparent); }
  .lv-empty { border: 1.5px dashed var(--lv-border); border-radius: var(--lv-r-3); padding: var(--lv-space-7); text-align: center; color: var(--lv-text-3); background: color-mix(in srgb, var(--lv-surface-2) 40%, var(--lv-surface)); }
  .lv-skeleton { height: 160px; border-radius: var(--lv-r-3); background: linear-gradient(100deg, var(--lv-surface-2) 40%, var(--lv-surface) 50%, var(--lv-surface-2) 60%); background-size: 200% 100%; animation: lv-shim 1.4s infinite; }
  @keyframes lv-shim { to { background-position: -200% 0; } }
  .progress { height: 6px; border-radius: var(--lv-radius-pill); background: var(--lv-surface-2); overflow: hidden; }
  .progress i { display: block; height: 100%; background: var(--lv-accent-grad); border-radius: var(--lv-radius-pill); }
  @media (prefers-reduced-motion: reduce) { .lv-skeleton { animation: none; } .lv-opt, .lv-btn { transition: none; } }
  @container lv-exam (max-width: 680px) {
    .lv-bp-table {
      overflow-x: hidden;
    }
    .lv-bp-row.head {
      display: none;
    }
    .lv-bp-row:not(.head) {
      min-width: 0;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 6px 8px;
      padding: 10px;
    }
    .lv-bp-row:not(.head) .lv-input,
    .lv-bp-row:not(.head) .lv-select,
    .lv-bp-row:not(.head) .lv-input.num {
      width: 100%;
      max-width: 100% !important;
      min-width: 0;
    }
    .lv-bp-row:not(.head) > .lv-row {
      grid-column: 1 / -1;
      min-width: 0;
    }
    .lv-mock-exam-head {
      flex-wrap: nowrap;
      gap: 4px;
      overflow-x: auto;
      scrollbar-width: none;
      margin: 0 0 8px;
    }
    .lv-mock-exam-head::-webkit-scrollbar {
      display: none;
    }
    .lv-mock-exam-head .lv-btn.sm {
      min-height: 36px;
      height: 36px;
      padding: 0 10px;
      font-size: 12px;
      flex-shrink: 0;
    }
    .lv-bp-row:not(.head) .lv-bp-del {
      min-width: 36px;
      min-height: 36px;
      align-self: center;
      justify-self: end;
    }
    .lv-mock-exam-head .lv-kbd {
      display: none;
    }
    .lv-mock-floating-pills {
      right: 10px !important;
      bottom: 10px !important;
      left: 10px !important;
      justify-content: flex-end;
      flex-wrap: wrap;
      pointer-events: none;
    }
    .lv-mock-floating-pills > button {
      pointer-events: auto;
      font-size: 11.5px !important;
      padding: 4px 10px !important;
      max-width: 100%;
    }
    .lv-sheet {
      grid-template-columns: repeat(auto-fill, minmax(40px, 1fr));
      gap: 6px;
      padding: 10px;
    }
  }
  @container lv-exam (max-width: 480px) {
    /* 极窄屏适配：答题卡紧凑网格 */
    .lv-sheet { grid-template-columns: repeat(auto-fill, minmax(40px, 1fr)); }
    .lv-btn { white-space: nowrap; }
  }
  .lv-bp-field { display: flex; flex-direction: column; min-width: 0; gap: 4px; }
  .lv-bp-field-label { display: none; font-size: var(--lv-font-size-caption); color: var(--lv-text-2); font-weight: var(--lv-font-weight-medium, 500); }
  @container lv-exam (max-width: 680px) { .lv-bp-field-label { display: block; } }
  @media (max-width: 680px) { .lv-bp-field-label { display: block; } }
  :global(.lv-mobile) .lv-bp-field-label,
  :global([data-mobile="true"]) .lv-bp-field-label { display: block; }
</style>
