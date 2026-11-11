<script lang="ts">
    // 练习台：入口(S1) / 会话(S2) / 浏览(S3) / 导入(S9) 四视图
    // 状态设计（docs/11）：loading/empty(守卫)/error/normal 四态可达
    import { onMount, onDestroy, tick } from "svelte";
import {
  notifyPracticeFinishCard,
  showExamNotice,
} from "@/libs/notice";
import { lvActivity, lvLaunchpad } from "@/libs/lv-notice-kit";
import { armExamHistory, disarmExamHistory } from "@/core/examHistoryGuard";
const showMessage = (msg: string, timeout = 3000, type: "info" | "error" = "info") => {
  showExamNotice(msg, timeout, type);
};
import manifest from "../../../plugin.json";
import { getBridgeSafely } from "@/libs/ecosystem-bridge-kit";
import { renderMathInText } from "@/core/math";
import { renderMathDiagramsInText } from "@/core/mathDiagram";
import { auditForgettingRisks } from "@/core/forgettingRisk";
import { cbmScan, cbmSettleSummary } from "@/core/cbm";
import { rankWeakTags, sampleWeakSpotDrill } from "@/core/weakSpot";
import { sanitizeRichHtml } from "@/libs/sanitize";
import { confirmDialogSync } from "@/libs/dialog";
    import { ttsSpeak, ttsStop, ttsSupported } from "@/core/tts";
    import type { ExamApp, BankInfo } from "../../app";
    import type { Question } from "../../core/types";
    import { parseText, extractTextRowAt, type ImportReport } from "../../importer/pipeline";
    import { columnLabel, emptyAssignment, type MapAssignment } from "../../importer/mapping";
    import { locatorLabel, needsRelocate } from "@/core/materialNotes";
    import { groupAdjacent } from "../../core/session";
    import { specOf, splitBlanks, joinBlanks } from "../../core/structuredAnswer";
    import {
      parseRubricFromText,
      DEFAULT_RUBRIC_LEVELS, type RubricSpec, type CriterionRating,
      type RubricAssessmentSnapshot,
    } from "../../core/rubric";
    import {
      loadRubricArchiveAux,
      calculateCurrentRubricScore,
      autoAlignRubricEvaluation,
      exportRubricBreakdownCsvFile,
      executeRecordRubricAssessment,
      isRubricDrifted,
    } from "./services/rubricAssessmentService";
    import { recordAnswerTrailInput, assignLastEditReason, type AnswerTrail } from "./services/answerTrailService";
    import { randomSeedId } from "../../core/random";
    import { ELIMINATE_STREAK, localDate, streak, wrongReasonMix } from "../../core/replayer";
    import type { OrphanKind } from "../../core/bankHealth";
    import { planBatchEdit, invertPlan } from "../../core/batchEdit";
    import { queueSemantics, writeBackReceipt } from "../../core/queueIdentity";
    import { RatingGuard, type RatingOutcomeView } from "../../core/ratingOutcome";
    import { kpAudit } from "@/core/kpGovernance";
    import { probeGlean, type GleanClip } from "@/core/gleanBridge";
    import { resolveLink } from "@/core/externalLinks";
    import { redactUrlForDisplay } from "@/core/urlRedaction";
    import { onExamEvent, emitExamEvent } from "@/core/bus";
    import { diagnoseQuestionRootCauses, type AdaptiveDiagnosisReport } from "@/core/diagnosticEngine";
    import PracticeSessionView from "./PracticeSessionView.svelte";
    import ShortcutsHelpModal from "./ShortcutsHelpModal.svelte";
    import BankGalleryModal from "./BankGalleryModal.svelte";
    import MarketplaceModal from "./MarketplaceModal.svelte";
    import MarketplaceStudioView from "./MarketplaceStudioView.svelte";
    import SessionSheetModal from "./SessionSheetModal.svelte";
    import ReciteStudioView from "./ReciteStudioView.svelte";
    import WrongbookStudioView from "./WrongbookStudioView.svelte";
    import ImportStudioView from "./ImportStudioView.svelte";
    import BrowseBatchActionBar from "./BrowseBatchActionBar.svelte";
    import BrowseStudioView from "./BrowseStudioView.svelte";
    import EntryStudioView from "./EntryStudioView.svelte";
    import MaterialsView from "./MaterialsView.svelte";
    import {
      printQuestionsByFormat,
      filterSelectedQuestions,
      type PrintPaperFormat,
    } from "./services/printPaperService";
    import {
      exportSyllabusGapsCsv,
      exportErrataTemplateCsv,
      printFilteredQuestionSheet,
      printFilteredAnswerSheet,
      printFilteredAnswerCard,
      previewSyllabusText,
      importSyllabusToApp,
      parseErrataFileInput,
      previewKpMergePlan,
      previewKpFillPlan,
      executeClusterMergeToTarget,
      computePaperRecallPreview,
      executeApplyPaperRecall,
      executeApplyErrata,
      executeApplyKpPlan,
      computeBankHealthMetricsBundle,
      executeRollbackBatchWithConfirm,
      executeApplyBatchChanges,
      loadBatchUndoAux,
      saveBatchUndoAux,
      computeSyllabusKpStats,
    } from "./services/bankGovernanceService";
    import {
      printWrongSheet as servicePrintWrongSheet,
      executeBankExportAction,
      exportHealthCsvFile,
      exportBankQuestionsCsvFile,
    } from "./services/bankExportService";
    import {
      queryCheckinStreak,
      extractCheckinSettingsFromPlugin,
    } from "./services/checkinBridgeService";
    import {
      downloadImportTemplate,
      exportImportErrorsCsv,
      exportBankPackageZip,
      readClipboardImportText,
      makeFileEventProxy,
      filterUnconfirmedQuestions,
      executeTrialImport,
      importBankFromSyZipFile,
      processImportDrawerDrop,
      resolveGlobalTabDropAction,
    } from "./services/bankImportService";
    import {
      recordAiAuditTask,
      loadAiAuditTaskLogs,
      saveExplainConversationHistory,
      type AiTaskLogEntry,
    } from "./services/aiAuditLogService";
    import {
      executeAiExplain,
      executeAiHint,
      formatEnvStatusLine,
      getHintButtonLabel,
      saveExplainToQuestionDoc,
      convertSingleQuestionToCard,
      formatHintLayersDisplay,
      applyLeakedHintToState,
      executeAiFollowUpWorkflow,
    } from "./services/aiWorkflowService";
    import {
      loadReciteModeSetting,
      saveReciteModeSetting,
      buildQuestionTtsText,
      canScheduleReciteSubmit,
    } from "./services/reciteModeWorkflowService";
    import {
      toggleSpeechRecognitionSession,
      type SpeechEvalResult,
    } from "./services/speechRecognitionService";
    import {
      exportItemAnalysisReportCsv,
      initDisputeFormValues,
      validateAndFlagDispute,
      validateAndResolveDispute,
      handleClearDispute,
    } from "./services/disputeGovernanceService";
    import {
      extractNumericSpecFields,
      createQuestionEditDraft,
      executeSaveQuestionEdit,
      executeChangeQuestionLifecycle,
    } from "./services/questionEditService";
    import {
      executeLoadQuestionRevisions,
      executeRestoreQuestionRevision,
    } from "./services/questionRevisionService";
    import PaperAssembleModal from "./PaperAssembleModal.svelte";
    import {
      archiveWrongItem,
      unarchiveWrongItem,
      snoozeWrongItem,
      restoreWrongItemToActive,
      extractWrongQueueKpOptions,
      extractWrongQueueTagOptions,
      filterAndSortWrongQueue,
    } from "./services/wrongbookDispositionService";
    import {
      tracebackToSourceBlock,
      extractWrongQueueDocOptions,
    } from "./services/tracebackService";
    import {
      buildPracticePaletteCommands,
      resolveTaskNavigation,
    } from "./services/practicePaletteService";
    import {
      generateFlashCandidates,
      executeCommitFlashCardsWithConfirm,
    } from "./services/flashCandidateService";
    import {
      copyChallengeCode as serviceCopyChallengeCode,
      parseAndStartChallenge,
    } from "./services/challengeService";
    import {
      computeQuestionMaterialSnapshot,
      saveQuestionMaterialReference,
      removeQuestionMaterialReference,
      resolveQuestionMaterialOpenUrl,
      initQrefFormState,
      buildAllQuestionsMaterialSnapshot,
    } from "./services/questionMaterialLinkService";
    import {
      persistReviewQueue,
      restoreReviewQueue,
      recordGenerationUsage,
      executeAiQuestionGeneration,
      executeAiIssueRepair,
      approveSingleQuestion,
      approveBatchQuestions,
      extractAiSourceFromEditor,
      validateAndApplyCandidateEdit,
      verifyQueueBankMatch,
      ensureAiEndpointConsent,
      buildGenOptionsSnapshot,
      createAiCandidateEditDraft,
      executeRegenSingleCandidate,
    } from "./services/aiStudioService";
    import {
      pushWrongsToCards,
      pushSingleWrongToCard,
      pushSessionWrongsToActions,
      assembleAndLaunchWrongMock,
      countEliminatedWrongs,
      calculateClearPercentage,
      queryArchivedWrongList,
      queryEliminatedWrongList,
    } from "./services/wrongbookEcosystemService";
    import {
      pickSameKpDrillQuestions,
      executeDrillVariantWorkflow,
      executeMotherQuestionWorkflow,
    } from "./services/variantDrillService";
    import {
      updateCorrectOptionIndex,
      processAndSaveManualQuestion,
      normalizeDraftFormulas,
      executeSwitchManualTypeWithConfirm,
      saveManualDraftAux,
      loadManualDraftAux,
      clearManualDraftAux,
      createBlankManualFormState,
      createManualDraftSnapshot,
      assembleManualFormData,
    } from "./services/manualStudioService";
    import {
      parseOcrFormResult,
      processOcrImageUpload,
      findImageInClipboard,
    } from "./services/manualOcrService";
    import {
      editQuestionReflection,
      loadSessionReflections,
      queryAttemptMeta,
      mergeAdoptedMisdiagnosis,
      updateReflectionMapState,
      executeMisdiagnosisWorkflow,
      queryQuestionReceipts,
    } from "./services/reflectionMisdiagnosisService";
    import {
      formatPlanReason,
      buildDailyPlanSchedule,
      updateDailyPlanTrace,
      resolveDailyStudyQueue,
      extractCriticalForgettingRescueQuestions,
      formatWeekDayLabel,
      queryTodayAnsweredIds,
      computeTodayPracticeQueue,
    } from "./services/dailyPlanService";
    import {
      executeReciteRating,
      extractForgotReciteQuestions,
      pushForgotReciteToCards,
      pushForgotReciteToActions,
      initReciteSession,
      advanceReciteState,
      getReciteTtsPayload,
      prepareRetryForgotState,
      saveReciteSnapshot,
      loadReciteSnapshot,
      clearReciteSnapshot,
    } from "./services/reciteStudioService";
    import {
      exportWrongbookToDoc,
      syncBankQuestionsToDoc,
      copyTodayStudyReport,
      extractKpRoots,
    } from "./services/bankDocSyncService";
    import {
      pickDrillQuestions,
      pickSingleWrongQuestion,
      pickSameKpQuestions,
      toggleQuestionFavorite,
      executeMasterAllWrongWithConfirm,
      executeMasterSingleWrongWithConfirm,
      resolveExternalTargetQuestions,
      resolveFilteredWrongDrillQuestions,
    } from "./services/drillLauncherService";
    import {
      fetchGleanClips,
      batchMarkGleanClipsDone,
    } from "./services/gleanEcosystemService";
    import {
      loadBankSectionTree,
      resolveSectionNodeLabel,
    } from "./services/sectionTreeService";
    import {
      recordSessionAttempt,
      flushAbandonedSessionExposures,
      executeUndoLastAttempt,
      extractSessionWrongQuestions,
      resolveQuestionRestorationState,
      toggleQuestionUserTag,
      executeSessionExit,
      computeSessionKpBreakdown,
      executeSessionResume,
      executeSessionFinish,
      executeNegotiateSessionStart,
    } from "./services/sessionLifecycleService";
    import {
      getMaterialIconName as matIconName,
      registerMaterialFile as serviceRegisterMaterialFile,
      registerMaterialLinkInput as serviceRegisterMaterialLinkInput,
      removeMaterialWithConfirm as serviceRemoveMaterialWithConfirm,
      saveMaterialNoteItem as serviceSaveMaterialNoteItem,
      removeMaterialNoteWithConfirm as serviceRemoveMaterialNoteWithConfirm,
      resolveMaterialLocatedUrl as serviceResolveMaterialLocatedUrl,
      bridgeMaterialToManualAsync as serviceBridgeMaterialToManual,
      bridgeMaterialToAiAsync as serviceBridgeMaterialToAi,
      createBlankNoteFormState,
      getNoteDraftSignature,
      isNoteFormDirty,
      extractNoteEditValues,
      filterMaterialsList,
      extractDocxTextFromBytes,
    } from "./services/materialManagementService";
    import {
      loadSmartViewsAux,
      isViewBankMismatched,
      loadExcelMappingsAux,
      saveExcelMappingAux,
      cloneQuestionToManualDraft,
      getNeighborQuestionId,
      createEmptyBrowseFilters,
      executeSaveNamedViewWithPrompt,
      executeDeleteNamedViewWithConfirm,
    } from "./services/smartViewManagementService";
    import {
      searchSiyuanDocCandidates,
      extractFromSingleSiyuanDoc,
      extractFromBatchSiyuanDocs,
      parseClozeItems,
      assembleClozeImportReport,
      checkImportCheckpointAux,
      discardImportCheckpointAux,
      buildResumeCheckpointReport,
      toggleClozeSupportMode,
      toggleSelectAllDocCandidates,
    } from "./services/docImportClozeService";
    import {
      executeSpotCheckRender,
      prepareRowFixInitialState,
      executeApplyRowFix,
    } from "./services/importRepairService";
    import {
      parseSheetRowsWithStrategy,
      prepareMapAssignment,
      validateAndBuildManualMap,
      readAndParseWorkbookFile,
    } from "./services/excelParseWorkflowService";
    import {
      resolveKeyboardAction,
      shouldBlockGlobalHotkeys,
      detectHorizontalSwipe,
      getNextStudyFontSize,
    } from "./services/practiceKeyboardService";
    import {
      fetchBlockBacklinks,
      openSiYuanTarget,
      applyBacklinkFetchResult,
    } from "./services/backlinkNavigationService";
    import {
      executeCommitImport,
      executeAnswerUpdates,
      buildRetryMissingReport,
    } from "./services/importExecutionService";
    import {
      executeBrowseQuestionFilter,
    } from "./services/browseFilterService";
    import {
      markAncestorSiblingsInert,
      isClickOutsideElement,
      handleDrawerNavKey,
      handleModalDrawerKeydown,
    } from "../shared/drawerAccessibility";
    import {
      getQuestionScratchpadContent,
      copyScratchpadText,
      applyScratchpadInput,
      applyClearScratchpad,
      type ScratchpadStore,
      type ScratchpadMode,
    } from "./services/scratchpadWorkflowService";
    import AiStudioView from "./AiStudioView.svelte";
    import ManualStudioView from "./ManualStudioView.svelte";
    import OcclusionEditor from "./OcclusionEditor.svelte";
    import Icon from "../shared/Icon.svelte";
    import Palette from "../shared/Palette.svelte";

    let tabAssembleOpen = $state(false);
    let tabAssembleQuestions = $state<Question[]>([]);
    import { SvelteMap, SvelteSet } from "svelte/reactivity";
    import Rail from "../shared/Rail.svelte";
    import { escapeHtml, renderInlineText } from "../../libs/sanitize";
    import { summarizeLoad } from "@/ai/flashCandidates";
    import { resolveAiKey } from "@/ai/secrets";
    import SaveStatus from "../shared/SaveStatus.svelte";
    import { SAMPLE_QUESTION_COUNT } from "@/core/sampleBank";
    import {
      normalizeSampleBankKind,
      executeCreateBank,
      executeCreateSampleBank,
      resolveRetainedSampleBank,
      formatSampleNoticeText,
      executeCycleBankCategory,
      executeSyncBankToDoc,
      executeSaveWrongbookToDoc,
      executeRemoveBankWithConfirm,
      resolveInitialActiveBankId,
      type SampleBankKind,
    } from "./services/bankLifecycleService";
    import { getBankCategoryMeta } from "@/core/bankCategory";
    import { answerChoices, isChoiceQuestion, removeChoiceOption, toggleChoice } from "@/core/answerChoices";
    import { isQuestionDisputed, type DisputeReason } from "@/core/dispute";
    import { isStubbornWrong, getStubbornRemediation } from "@/core/stubborn";
    import type { ParsedClozeItem } from "@/core/cloze";
    import { buildMaterialGroupContext, formatMaterialGroupHeader, type SiblingItem } from "@/core/materialContext";
    import { resolveFeedbackTimingMode, isGroupBatchBoundary, calculateGroupBatchSummary, type GroupBatchSummary, DEFAULT_GROUP_FEEDBACK_SIZE } from "@/core/feedbackTiming";
    import { analyzeQuestionUsage, type ItemAnalysisReport } from "@/core/itemAnalysis";
    import { getQuestionLifecycle, isAttemptVersionDrifted, LIFECYCLE_LABELS, type QuestionLifecycleStatus } from "@/core/revision";
    import { consumePendingPracticeView, isCurrentPracticeViewRequest } from "@/core/pluginTab";
    import { dailyTrend } from "@/core/weekly";
    import { playSuccessChime, playCelebrationChord } from "@/libs/sound";
    import type { ExamPluginLike } from "@/core/pluginTab";
    import type { PracticeSession } from "@/core/session";

    let { plugin, examApp }: { plugin: ExamPluginLike; examApp?: ExamApp | null } = $props();
    let appOverride = $state<ExamApp | null>(null);
    const app = $derived<ExamApp | null>(appOverride ?? examApp ?? (plugin?.examApp as ExamApp | undefined) ?? null);
    const i18n = $derived(plugin?.i18n ?? {});
    const t = (k: string, fb = "") => i18n[k] ?? fb;

    // localStorage is optional in private/embedded modes. Keep preferences
    // best-effort so a blocked browser store cannot break the practice tab.
    const readLocal = (key: string): string | null => {
      try { return globalThis.localStorage?.getItem(key) ?? null; } catch { return null; }
    };
    const writeLocal = (key: string, value: string): boolean => {
      try { globalThis.localStorage?.setItem(key, value); return true; } catch { return false; }
    };
    const removeLocal = (key: string): void => {
      try { globalThis.localStorage?.removeItem(key); } catch { /* optional */ }
    };

    type View = "entry" | "session" | "browse" | "import" | "recite" | "manual" | "ai" | "materials" | "wrongbook" | "marketplace";
    let view: View = $state("entry");
    let soundEnabled = $state(readLocal("lv-exam/sound") !== "0");
    $effect(() => {
      writeLocal("lv-exam/sound", soundEnabled ? "1" : "0");
      if (plugin.settingUtils?.set) {
        plugin.settingUtils.set("soundEnabled", soundEnabled);
      }
    });

    function handleTtsSpeak(text: string, opt?: any) {
      const defaultRate = Number(plugin.settingUtils?.get?.("ttsRate") ?? 1);
      const defaultLang = String(plugin.settingUtils?.get?.("ttsLang") ?? "zh-CN");
      let finalOpt: any = typeof opt === "number" ? { rate: opt } : { ...(opt || {}) };
      finalOpt.rate ??= ttsSlowRate ? 0.85 : defaultRate;
      finalOpt.lang ??= defaultLang;
      ttsSpeak(text, finalOpt);
    }
    let speedDrillEnabled = $state(readLocal("lv-exam/speed-drill") === "1");
    let hotkeysHelpOpen = $state(false);
    let paperGridModalOpen = $state(false);
    let shortLinedPaper = $state(readLocal("lv-exam/lined-paper") === "1");
    let studyFontSize = $state<"normal" | "large" | "xlarge">((readLocal("lv-exam/font-scale") as any) || "normal");
    function cycleStudyFontSize() {
      studyFontSize = getNextStudyFontSize(studyFontSize);
      writeLocal("lv-exam/font-scale", studyFontSize);
    }

    let touchStartX = 0;
    let touchStartY = 0;
    let touchStartTime = 0;

    function onTouchStart(e: TouchEvent) {
      if (e.touches.length !== 1) return;
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
      touchStartTime = Date.now();
    }

    function onTouchEnd(e: TouchEvent) {
      if (view !== "session" || !session) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      const swipe = detectHorizontalSwipe(e, {
        startX: touchStartX,
        startY: touchStartY,
        startTime: touchStartTime,
      });
      if (!swipe) return;

      if (swipe === "next") {
        if (feedback || (session?.current && !isChoiceQuestion(session.current))) {
          nextQuestion();
        }
      } else {
        previousQuestion();
      }
    }

    const effectiveEliminateStreak = $derived(
      Math.max(1, Number(plugin.settingUtils?.get?.("eliminateStreak") ?? ELIMINATE_STREAK))
    );
    let loading = $state(true);
    let appliedPracticeViewRequestId = "";
    let tabRoot = $state<HTMLDivElement | null>(null);
    let errorMsg = $state("");
    let banks = $state<any[]>([]);
    let activeBankId = $state("");
    let bankQuestionCounts = $state<Record<string, number>>({});
    /** 上次使用题库的记忆键（localStorage；多库切换与重载恢复） */
    const BANK_PREF_KEY = "lv-exam/activeBank";
    let questions = $state<(Question & { blockId: string; rootId: string })[]>([]);
    let questionsError = $state("");
    let questionsLoaded = $state(false);
    let questionLoadSeq = 0;
    let viewportBottomPad = $state(0);
    let keyboardOpen = $state(false);
    const hasCardsPlugin = $derived(Boolean(getBridgeSafely("cards")));

    // —— ux §9 focus-on-route-change（WCAG 2.4.3）：视图切换后把键盘/读屏焦点移交新视图主标题，
    // 读屏才能口述"到达了哪里"，键盘用户不必从页面顶端重新 Tab。会话/背诵视图有专属焦点编排
    // （restoreQuestionControls/漏题守卫），不在此接管；无 .lv-screen-head 标题的视图安静跳过。
    let lastFocusView = "";
    $effect(() => {
      const v = view;
      if (v === lastFocusView) return;
      lastFocusView = v;
      if (v === "session" || v === "recite") return;
      void tick().then(() => {
        if (railOpen || (menuBtn && document.activeElement === menuBtn)) return;
        const active = document.activeElement as HTMLElement | null;
        if (
          active &&
          active !== document.body &&
          tabRoot?.contains(active) &&
          !active.closest(".lv-rail, .lv-studio-nav, .lv-mobile-tasknav, .block__icons")
        ) {
          return;
        }
        const head = tabRoot?.querySelector<HTMLElement>(".lv-screen-head .lv-h1, .lv-screen-head h1");
        if (!head) return;
        head.setAttribute("tabindex", "-1");
        head.focus();
      });
    });

    const criticalForgettingKps = $derived.by(() => {
      if (!questions.length || !app) return [];
      const rep = auditForgettingRisks(questions, app.attempts.all());
      return rep.urgentRescueKps.filter((k) => k.riskTier === "critical");
    });

    async function rescueEbbinghausNow() {
      const qs = extractCriticalForgettingRescueQuestions(criticalForgettingKps, questionMap, 10);
      if (!qs.length) return;
      await safeStart(qs, "quick", () => {
        enterSessionView();
        restoreQuestionControls();
        showMessage(`已开启艾宾浩斯临界考点急救特训（共 ${qs.length} 题）`, 3000, "info");
      });
    }

    function rescueEbbinghausRecite() {
      const qs = extractCriticalForgettingRescueQuestions(criticalForgettingKps, questionMap, 10);
      if (!qs.length) return;
      reciteQueue = qs;
      reciteCursor = 0; reciteRevealed = false; reciteDone = false; reciteHint = 0; reciteRatings = [];
      reciteSessionId = `s-recite-rescue-${Date.now().toString(36)}`;
      reciteCardStart = Date.now();
      persistReciteSnapshot();
      if (view !== "session" && view !== "recite") sessionSourceView = view;
      view = "recite";
      armPracticeExamHistory();
      void tick().then(() => scrollMainToTop());
      if (reciteAutoTts && reciteQueue[0]) {
        ttsSpeak(reciteQueue[0].stem, { lang: reciteQueue[0].studyMeta?.lang, rate: ttsSlowRate ? 0.85 : 1 });
      }
      showMessage(`已开启艾宾浩斯临界考点背诵流（共 ${qs.length} 题）`, 3000, "info");
    }

    // 题库管理画廊 Hub 状态
    let bankHubOpen = $state(false);
    let marketplaceOpen = $state(false);
    let sessionSheetOpen = $state(false);

    async function cycleBankCategory(b: BankInfo) {
      if (!app) return;
      try {
        const res = await executeCycleBankCategory(app, b);
        banks = res.banks;
        showMessage(`题库「${b.name}」场景分类已更新为：${res.badge} ✓`, 2500, "info");
      } catch (e) {
        showMessage(`更新分类失败：${String(e instanceof Error ? e.message : e)}`, 3500, "error");
      }
    }

    let lastSavedWrongbookDoc = $state<{ docId: string; title: string } | null>(null);
    let lastSyncedDocs = $state<{
      overviewDocId?: string;
      bankDocId?: string;
      wrongbookDocId?: string;
      actionJournalDocId?: string;
    } | null>(null);

    async function syncBankToDoc(bId: string) {
      if (!app) return;
      try {
        const res = await executeSyncBankToDoc(app, bId);
        lastSyncedDocs = { ...lastSyncedDocs, bankDocId: res.docId };
        showMessage(`已同步为思源笔记文档：《${res.title}》✓`, 3500, "info");
      } catch (e) {
        showMessage(String(e instanceof Error ? e.message : e), 4000, "error");
      }
    }

    async function saveWrongbookAsDoc() {
      if (!app || !filteredWrongQueue.length) return;
      try {
        const res = await executeSaveWrongbookToDoc(app, {
          bankName,
          activeBankId,
          questions,
          wrongQids: filteredWrongQueue.map((w) => w.qid),
        });
        if (res) {
          lastSavedWrongbookDoc = { docId: res.docId, title: res.title };
          showMessage(`已在思源中生成错题集文档：《${res.title}》✓`, 3500, "info");
        }
      } catch (e) {
        showMessage(String(e instanceof Error ? e.message : e), 4000, "error");
      }
    }

    const questionMap = $derived.by(() => {
      // eslint-disable-next-line svelte/prefer-svelte-reactivity -- derived 内纯派生映射（重算即生成新引用）
      const map = new Map<string, Question & { blockId: string; rootId: string }>();
      for (const q of questions) {
        map.set(q.id, q);
      }
      return map;
    });

    const materialByGroup = $derived.by(() => {
      // eslint-disable-next-line svelte/prefer-svelte-reactivity -- derived 内纯派生映射（重算即生成新引用）
      const map = new Map<string, Question & { blockId: string; rootId: string }>();
      for (const q of questions) {
        if (q.type === "material" && q.group) {
          map.set(q.group, q);
        }
      }
      return map;
    });

    // 背诵态（S4 lite）：盖答案 → 四级自评
    let reciteQueue = $state<Question[]>([]);
    let reciteCursor = $state(0);
    let reciteRevealed = $state(false);
    let reciteSessionId = $state("");
    let reciteDone = $state(false);
    let reciteHint = $state(0);
    let reciteSaving = $state(false);
    let reciteError = $state("");
    let reciteRatings = $state<number[]>([]);
    let reciteCardStart = $state(0);
    let reciteAutoTts = $state(readLocal("lv-exam/recite-auto-tts") === "1");
    let ttsSlowRate = $state(readLocal("lv-exam/tts-slow") === "1");
    const speechEvalEnabled = $derived(
      plugin?.settingUtils?.get?.("speechEvalEnabled") === true || plugin?.settingUtils?.get?.("speechEvalEnabled") === "true",
    );
    let speechRecording = $state(false);
    let speechEvalResult = $state<SpeechEvalResult | null>(null);
    let speechRecognitionInstance: any = null;

    function startSpeechRecognition(targetText: string, lang = "zh-CN") {
      speechEvalResult = null;
      toggleSpeechRecognitionSession({
        targetText,
        lang,
        isRecording: speechRecording,
        currentInstance: speechRecognitionInstance,
        onStart: (rec) => {
          speechRecognitionInstance = rec;
          speechRecording = true;
        },
        onEnd: () => {
          speechRecording = false;
        },
        onResult: (res) => {
          speechEvalResult = res;
          if (res.score >= 80 && soundEnabled) playSuccessChime();
        },
        showMessage,
      });
    }
    /** 39-03：本次背诵评级的结果状态（未转卡/已写回/待确认/失败/离线未写回） */
    let reciteOutcome = $state<RatingOutcomeView | null>(null);
    /** 39-03：防双击与重复提交（同会话同题同评级只写一次；失败后放行重试） */
    const reciteGuard = new RatingGuard();

    // 会话态
    let session = $state<PracticeSession | null>(null);
    let feedback = $state<null | { verdict: string; myAnswer: string | null }>(null);
    let selected = $state<string>("");
    let answerStart = $state(0);
    /** 草稿的响应式镜像：session 类实例非响应式（$state 不代理类实例），提交键的禁用态
     *  需要跟随草稿变化——三个作答框（数值/多空/文本）oninput 时同步此镜像 */
    let draftLive = $state("");
    let resumeError = $state("");
    let exitBusy = $state(false);

    /** 43-01 lite：题目修订时间线（app.appendRevision 在编辑成功后落快照；此处只读+恢复） */
    let revOpenFor = $state("");
    let revLoaded = $state<Record<string, import("../../core/revision").QuestionRevision[]>>({});
    let revLoadingFor = $state("");
    let revLoadError = $state<Record<string, string>>({});
    let revLoadSeq = 0;
    let revRestoreKey = $state("");
    let revRestoreError = $state<Record<string, string>>({});
    let revRestoreFailedKey = $state("");
    const revList = (qid: string) => revLoaded[qid] ?? [];
    async function toggleRevisions(qid: string) {
      if (revOpenFor === qid) {
        revOpenFor = "";
        if (revLoadingFor === qid) { revLoadSeq++; revLoadingFor = ""; }
        return;
      }
      revLoadError = { ...revLoadError, [qid]: "" };
      revRestoreError = { ...revRestoreError, [qid]: "" };
      revRestoreFailedKey = "";
      revOpenFor = qid;
      if (qid in revLoaded) return;
      await loadRevisions(qid);
    }
    async function loadRevisions(qid: string) {
      if (!app) return;
      const request = ++revLoadSeq;
      revLoadingFor = qid;
      revLoadError = { ...revLoadError, [qid]: "" };
      try {
        const revisions = await executeLoadQuestionRevisions(app, qid);
        if (request === revLoadSeq) revLoaded = { ...revLoaded, [qid]: revisions };
      } catch (e) {
        if (request === revLoadSeq) {
          revLoadError = { ...revLoadError, [qid]: String(e instanceof Error ? e.message : e) };
        }
      } finally {
        if (request === revLoadSeq) revLoadingFor = "";
      }
    }
    async function restoreRevision(q: Question & { blockId: string }, rev: import("../../core/revision").QuestionRevision) {
      if (!app) return;
      const key = `${q.id}#${rev.ts}`;
      if (revRestoreKey) return;
      revRestoreKey = key;
      revRestoreError = { ...revRestoreError, [q.id]: "" };
      revRestoreFailedKey = "";
      try {
        const res = await executeRestoreQuestionRevision({ app, q, rev, t, showMessage });
        if (res.cancelled) return;
        if (res.next) questions = questions.map((x) => (x.id === q.id ? { ...x, ...res.next } : x));
        if (res.reloaded) {
          revLoaded = { ...revLoaded, [q.id]: res.reloaded };
          revLoadError = { ...revLoadError, [q.id]: "" };
        }
      } catch (e) {
        revRestoreError = { ...revRestoreError, [q.id]: String(e instanceof Error ? e.message : e) };
        revRestoreFailedKey = key;
      } finally { revRestoreKey = ""; }
    }

    /** 63-03 改答轨迹：qid → {首答, 每次修改}。非响应式存储（仅提交时读取）；
     *  原因弹层可见性是 UI 态单独管理。上限截断/取消不记等语义在 answerTrail.ts */
    const trails = new SvelteMap<string, AnswerTrail>();
    let reasonPromptQid = $state("");
    function trailInput(qid: string, value: string) {
      const res = recordAnswerTrailInput(trails, qid, value);
      if (res.promptReason) reasonPromptQid = qid;
    }
    function setEditReason(qid: string, reason: "unsure" | "evidence" | "misclick") {
      assignLastEditReason(trails, qid, reason);
      reasonPromptQid = "";
    }
    let sessionDone = $state<null | {
      total: number;
      correct: number;
      wrong: number;
      initialTotal?: number;
      initialCorrect?: number;
      delayedTotal?: number;
      delayedRecovered?: number;
      totalTimeS?: number;
      avgTimeS?: number;
    }>(null);
    /** 39-02：本次结算的会话模式（finishSession 时冻结，供队列身份/写回回执标注） */
    let settleMode = $state("");
    /** 已存错因回显（app.loadWrongReason；答错时载入，选择后即时高亮） */
    let savedReason = $state<string | undefined>(undefined);
    $effect(() => {
      const q = session?.current;
      if (feedback?.verdict === "wrong" && q && app) {
        void app.loadWrongReason(q.id).then((r: string | undefined) => { savedReason = r; });
      } else {
        savedReason = undefined;
      }
    });

    // 守卫态
    let newBankName = $state("");
    let creating = $state(false);
    let creatingSample = $state(false);
    let bankCreateError = $state("");
    let sampleNotice = $state("");

    // 导入态
    let importFileInput = $state<HTMLInputElement | null>(null);
    let bankFileInput = $state<HTMLInputElement | null>(null);
    let importText = $state("");
    let importReport = $state<ImportReport | null>(null);
    let importError = $state("");
    let committing = $state(false);
    let importParsing = $state(false);
    let importPreviewBankId = $state("");
    let trialBusy = $state(false);
    const importBusy = $derived(committing || trialBusy || importParsing);
    /** 重复合并策略（2.3/38-03）：skip=跳过（默认）/ coexist=并存（重复行照常入库）/ update=更新已有题答案解析 */
    let dupeStrategy = $state<import("../../importer/pipeline").DuplicateStrategy>("skip");
    let importResult = $state<null | { written: number; confirmed: number; missing: number; verified: boolean; cancelled?: boolean; unprocessed?: number; pendingIndex?: number }>(null);

    /** 答前置信自评（U12 最小）：随本次 attempt 落流水；提交后不可改写最初记录 */
    let confidenceSel = $state<"sure" | "fuzzy" | "guess" | "">("");

    function resetSessionViewState() {
      feedback = null;
      selected = "";
      draftLive = "";
      confidenceSel = "";
      sessionDone = null;
    }

    let draftSaveTimer: ReturnType<typeof setTimeout> | null = null;
    function scheduleDebouncedDraftSave() {
      if (draftSaveTimer) clearTimeout(draftSaveTimer);
      draftSaveTimer = setTimeout(() => {
        draftSaveTimer = null;
        if (app && session && session.phase === "running") {
          void app.saveSession().catch(() => undefined);
        }
      }, 500);
    }

    function armPracticeExamHistory() {
      armExamHistory({
        isActive: () => (view === "session" && !sessionDone && !!session) || (view === "recite" && !reciteDone && !!reciteQueue.length),
        onSaveDraft: async () => {
          if (draftSaveTimer) { clearTimeout(draftSaveTimer); draftSaveTimer = null; }
          if (app && session) {
            await app.saveSession();
            await app.flush();
          }
        },
        onExit: async () => {
          if (session) {
            flushAbandonedSessionExposures(app, session, session.exposureMap());
            await app.saveSession();
            await app.flush();
          }
          session = null;
          view = "entry";
        },
        confirmTitle: "退出确认",
        confirmPrompt: "考试进行中，确认退出？（进度将保存至草稿）",
      });
    }

    onDestroy(() => {
      clearAutoNext();
      disarmExamHistory();
      if (draftSaveTimer) {
        clearTimeout(draftSaveTimer);
        draftSaveTimer = null;
        if (app && session && session.phase === "running") {
          void app.saveSession().catch(() => undefined);
        }
      }
    });

    let sessionSourceView = $state<View>("entry");

    function scrollMainToTop() {
      tabRoot?.querySelector(".lv-main")?.scrollTo?.({ top: 0 });
    }

    function enterSessionView() {
      if (view !== "session" && view !== "recite") {
        sessionSourceView = view;
      }
      resetSessionViewState();
      view = "session";
      armPracticeExamHistory();
      void tick().then(() => scrollMainToTop());
    }

    // ---------- 55-05 主观题逐采分点自评 ----------
    /** 当前题的采分点自评选择（criterionId → 等级）；切题/提交后重置 */
    let rubricRatings = $state<Record<string, CriterionRating>>({});
    /** 当前题的采分点自评依据（可选备注，进 breakdown 不回写分数） */
    let rubricNotes = $state<Record<string, string>>({});
    /** 自评存档（qid → 冻结快照）。自评是对作答的自我判断，不是作答事件本身，
     *  因此不写进 attempt 流水（避免污染正确率/错题派生），改用 aux 键持久化。 */
    let rubricArchive = $state<Record<string, RubricAssessmentSnapshot>>({});
    /** 自评已记录回执（当前题最近一次写入成功） */
    let rubricSaved = $state(false);
    let rubricSaveBusy = $state(false);
    let rubricEvalResult = $state<import("../../core/rubricEvaluator").RubricEvaluationResult | null>(null);

    function autoAlignRubric() {
      const curQ = session?.current;
      if (!curQ) return;
      const ansText = isChoiceQuestion(curQ) ? selected : session?.getDraft(curQ.id) || selected;
      const res = autoAlignRubricEvaluation(curQ, ansText);
      rubricEvalResult = res;
      rubricRatings = { ...rubricRatings, ...res.recommendedRatings };
      rubricSaved = false;
      showMessage(t("rubric.autoAligned"), 2500, "info");
    }
    /** 当前题是否有 rubric 规格且在反馈态 */
    const currentRubric = $derived(session?.current?.rubric as RubricSpec | undefined);
    /** 当前题的自评计分（未评项不计入分母） */
    const rubricScore = $derived(calculateCurrentRubricScore(session?.current, rubricRatings, rubricNotes));
    /** 当前题已记录的自评快照（从存档读回，记录后不随 UI 草稿变化） */
    const recordedRubricSnapshot = $derived.by(() => {
      const q = session?.current;
      if (!q) return null;
      return rubricArchive[q.id] ?? null;
    });
    /** 作者改 rubric 后，历史自评分如实标注漂移而非静默重算 */
    const currentRubricDrifted = $derived(
      currentRubric && recordedRubricSnapshot ? isRubricDrifted(currentRubric as RubricSpec, recordedRubricSnapshot) : false,
    );

    // ---------- 55-05 自评存档读写（aux 键 rubric/assessments；不污染 attempt 流水与统计） ----------
    async function loadRubricArchive() {
      rubricArchive = await loadRubricArchiveAux(app);
    }
    /** 记录当前题的自评（冻结快照；未评完也可记录，快照如实标注 unratedCount） */
    async function recordRubricAssessment() {
      const q = session?.current;
      if (!q?.rubric || !rubricScore || rubricSaveBusy || !app) return;
      rubricSaveBusy = true;
      try {
        const res = await executeRecordRubricAssessment({
          app,
          rubricArchive,
          q,
          rubricScore,
          showMessage,
          t,
        });
        rubricArchive = res.nextArchive;
        rubricSaved = res.saved;
      } finally {
        rubricSaveBusy = false;
      }
    }
    function exportCurrentRubricCsv() {
      if (!rubricScore) return;
      exportRubricBreakdownCsvFile(rubricScore);
      showMessage(t("rubric.exportReady"), 2600, "info");
    }

    // 题库健康（TODO 2.2）：重复聚类 + 缺字段清单（纯函数，浏览视图按需展开）
    let healthOpen = $state(false);
    const healthBundle = $derived.by(() => computeBankHealthMetricsBundle(app, questions, healthOpen));
    const health = $derived(healthBundle.health);
    const answerDist = $derived(healthBundle.answerDist);
    const unreviewed = $derived(healthBundle.unreviewed);
    const coverage = $derived(healthBundle.coverage);
    const orphanDiag = $derived(healthBundle.orphanDiag);
    let filterOrphanKind = $state<OrphanKind | "">("");
    const drillOrphanKind = (kind: OrphanKind) => { filterOrphanKind = filterOrphanKind === kind ? "" : kind; };
    const clearOrphanFilter = () => { filterOrphanKind = ""; };
    const downloadHealthCsv = () => { if (health) exportHealthCsvFile(health, orphanDiag ?? undefined); };

    // ---------- 43-07 重复簇合并助手 ----------
    let activeClusterIndex = $state(-1);
    let mergeBusy = $state(false);
    const toggleCluster = (index: number) => { activeClusterIndex = activeClusterIndex === index ? -1 : index; };

    async function mergeClusterToTarget(targetQ: Question & { blockId: string }, clusterIds: string[]) {
      if (!app || mergeBusy) return;
      const { confirmDialogSync } = await import("../../libs/dialog");
      mergeBusy = true;
      try {
        const res = await executeClusterMergeToTarget(app, targetQ, clusterIds, questionMap, confirmDialogSync, t);
        if (res.success) {
          await refreshQuestionsAfterWrite(questions.length - res.othersCount);
          activeClusterIndex = -1;
          showMessage(`${t("health.mergeSuccess")}（迁移 ${res.mergedAttemptsCount} 条作答记录）`, 3200, "info");
        }
      } catch (e) {
        showMessage(String(e instanceof Error ? e.message : e), 4200, "error");
      } finally {
        mergeBusy = false;
      }
    }

    // 每题用时显示 + 超时提示（TODO 13 组 lite）：会话作答期 1s tick；超时阈值取设置（0=关）
    let qTick = $state(0);
    $effect(() => {
      if (view !== "session" || feedback) return;
      const t = setInterval(() => { qTick++; }, 1000);
      return () => clearInterval(t);
    });
    const qElapsedS = $derived.by(() => { void qTick; return answerStart <= 0 ? 0 : Math.max(0, Math.floor((Date.now() - answerStart) / 1000)); });
    /** 会话推进版本号：PracticeSession 是类实例（$state 不代理类实例），其内部变更（next/submit）
     *  不触发模板更新——会话读数（当前题/进度）的响应式来源是本计数器。
     *  bump 点：提交后、切题后；session 变量赋值点（start/resume/discard）本身即响应式。 */
    let sessionRev = $state(0);
    /** 会话恢复/回退后从 PracticeSession 读出的草稿；不能只依赖输入框 oninput 镜像。 */
    const currentDraft = $derived.by(() => {
      void sessionRev;
      const q = session?.current;
      return q && !isChoiceQuestion(q) ? session.getDraft(q.id) : "";
    });
    const curQ = $derived.by(() => { void sessionRev; return session?.current ?? null; });
    const canSubmitAnswer = $derived(curQ && (isChoiceQuestion(curQ)
      ? !!answerChoices(curQ).length && !!selected.trim()
      : specOf(curQ)?.kind === "multiBlank"
        ? draftLive.split(";;").some((part) => !!part.trim())
        : !!draftLive.trim()));
    const curProgress = $derived.by(() => { void sessionRev; return session ? session.progress : { done: 0, total: 0 }; });
    /** 当前题的历史统计（作答次数/正确率），驱动会话侧栏"本题统计"chip */
    const curQStats = $derived.by(() => {
      void sessionRev;
      const q = curQ;
      if (!q) return null;
      return app.derived().byQuestion.get(q.id) ?? null;
    });
    /** 结算页知识点分布：按 kp 聚合本次会话的对错，帮助即时识别薄弱考点 */
    const kpBreakdown = $derived.by(() => {
      void sessionRev;
      if (!sessionDone || !session) return [];
      return computeSessionKpBreakdown(session.answered, questionMap);
    });
    /** benchmark-fusion（Kangaroo 标杆）：薄弱标签排行——本次会话正确率 < 60% 的考点根标签，最弱优先 */
    const weakRank = $derived(rankWeakTags(kpBreakdown));
    /** benchmark-fusion（Moodle CBM）：结算归集——本次会话内的蒙对/自信错信号（done 卡一句式提示） */
    const cbmSettle = $derived.by(() => {
      void sessionRev;
      if (!sessionDone || !session || !app) return null;
      try {
        const qids = new Set(session.answered.map((a) => a.qid));
        const events = app.attempts.all().filter((e) => qids.has(e.qid) && e.sessionId === session.id);
        return cbmSettleSummary(cbmScan(events), qids);
      } catch { return null; }
    });
    /** 54 第三刀：数值/多空作答框——curSpec 取当前题的结构化作答规则；多空草稿按 ";;" 切分为逐空输入 */
    const curSpec = $derived.by(() => {
      void sessionRev;
      return view === "session" && session?.current ? specOf(session.current) : null;
    });
    let blankParts = $state<string[]>([]);
    let blankPartsFor = $state("");
    $effect(() => {
      const q = curQ;
      const spec = curSpec;
      if (view !== "session" || !q || spec?.kind !== "multiBlank") return;
      const position = `${session.id}:${curProgress.done}`;
      if (blankPartsFor !== position) {
        blankParts = splitBlanks(feedback?.myAnswer ?? session.getDraft(q.id) ?? "", spec.blanks.length);
        blankPartsFor = position;
      }
    });
    function setBlank(i: number, v: string) {
      const q = session?.current;
      if (!q) return;
      blankParts[i] = v;
      draftLive = joinBlanks(blankParts);
      session.setDraft(q.id, draftLive);
      scheduleDebouncedDraftSave();
    }
    const qTimeoutS = $derived(Math.max(0, Number(plugin.settingUtils?.get?.("perQuestionTimeoutS") ?? 0) || 0));
    /** 44-01：反馈时机策略（逐题即时 / 小组延迟复盘 / 会话末尾集中复盘。作答事件完全一致） */
    const feedbackMode = $derived(
      resolveFeedbackTimingMode(
        plugin.settingUtils?.get?.("feedbackTiming"),
        plugin.settingUtils?.get?.("feedbackEndReview"),
      ),
    );
    let groupBatchModal = $state<GroupBatchSummary | null>(null);
    let diagnosisModal = $state<AdaptiveDiagnosisReport | null>(null);
    let groupBatchStart = $state(1); // 44-01 当前小组批次起始题号（1-based）

    // 导入批次回滚（TODO 12 组）：按 custom-exam-batch 定位块逐块删除；只动题块不动流水
    const batchList = $derived(healthOpen && questions.length ? app.listBatches(questions) : []);
    let rollbackBusy = $state("");

    async function undoBatch(batch: string) {
      if (rollbackBusy || !app) return;
      rollbackBusy = batch;
      try {
        const { confirmDialogSync } = await import("../../libs/dialog");
        const ok = await executeRollbackBatchWithConfirm({
          app, activeBankId, batch, questions, confirmDialogSync, showMessage, offline, t,
        });
        if (ok) await loadQuestions();
      } finally { rollbackBusy = ""; }
    }

    /** 题库 CSV 导出（TODO 8 组 lite）：官方模板表头，Excel 可直接编辑后重导入 */
    function exportBankCsv() {
      if (!questions.length) { showMessage(t("state.emptyBank"), 2800, "info"); return; }
      exportBankQuestionsCsvFile(questions, bankName);
    }

    // 批量编辑（43-06 lite）：多选 → dry-run 计划预览 → 应用 → 可撤销（逆向计划）
    let batchMode = $state(false);
    let selectedIds = $state<Record<string, boolean>>({});
    let batchField = $state<import("@/core/batchEdit").BatchField>("kp");
    let batchValue = $state("");
    let batchPreview = $state<import("@/core/batchEdit").BatchPlan | null>(null);
    let appliedChanges = $state<import("@/core/batchEdit").BatchChange[]>([]);
    let batchBusy = $state(false);
    let batchNote = $state("");
    const selectedCount = $derived(Object.keys(selectedIds).length);

    function selectAllCurrentPage() {
      const next: Record<string, boolean> = {};
      for (const q of shownQuestions) next[q.id] = true;
      selectedIds = next;
    }
    function clearSelection() {
      selectedIds = {};
    }
    let batchCardBusy = $state(false);
    async function batchConvertToCards() {
      if (!selectedCount || batchCardBusy || !activeBankId) return;
      const targetQuestions = filterSelectedQuestions(questions, selectedIds);
      if (!targetQuestions.length) return;
      batchCardBusy = true;
      try {
        const n = await app?.convertToCards(activeBankId, bankName, targetQuestions);
        showMessage(`${t("memory.toCardDone")} (${n})`, 3200, "info");
      } catch (e) {
        showMessage(String(e instanceof Error ? e.message : e), 4200, "error");
      } finally {
        batchCardBusy = false;
      }
    }

    async function printSelectedQuestions(format: PrintPaperFormat = "exam") {
      if (!selectedCount) return;
      const targetQuestions = filterSelectedQuestions(questions, selectedIds);
      await printQuestionsByFormat(format, `${bankName || "题库"} · 勾选题卷`, targetQuestions, showMessage);
    }

    async function printFilteredByFormat(format: PrintPaperFormat) {
      const targetQuestions = filteredQuestions.filter((q) => q.type !== "material");
      if (!targetQuestions.length) return;
      await printQuestionsByFormat(format, bankName || "题库", targetQuestions, showMessage);
    }

    function previewBatch() {
      batchNote = "";
      const picked = questions.filter((q) => selectedIds[q.id]);
      if (!picked.length) return;
      if (!batchValue) { batchNote = t("batch.needValue"); return; }
      batchPreview = planBatchEdit(picked, batchField, batchValue);
    }

    async function applyBatch(undo = false) {
      if (batchBusy || !app.kernelOnline) { batchNote = t("state.offlineHint"); return; }
      let changes = undo ? invertPlan(appliedChanges) : batchPreview?.changes ?? [];
      if (undo && !changes.length && batchUndo && batchUndo.bankId === activeBankId) {
        changes = invertPlan(batchUndo.changes);
      }
      if (!changes.length) return;
      batchBusy = true; batchNote = "";
      try {
        const res = await executeApplyBatchChanges({ app, changes, undo, activeBankId, t });
        batchNote = res.note;
        appliedChanges = res.appliedChanges;
        batchUndo = res.undo;
        await saveBatchUndo();
        await loadQuestions();
      } catch (e) {
        batchNote = String(e instanceof Error ? e.message : e);
      } finally { batchBusy = false; }
    }

    /** 最近一次批量编辑的持久化（43-06 剩余）：重载后仍可逆向撤销；换库不误撤 */
    let batchUndo = $state<null | { changes: import("@/core/batchEdit").BatchChange[]; bankId: string; at: number }>(null);
    const batchUndoHere = $derived(!!batchUndo && batchUndo.bankId === activeBankId);
    async function loadBatchUndo() {
      batchUndo = await loadBatchUndoAux(app);
    }
    async function saveBatchUndo() {
      await saveBatchUndoAux(app, batchUndo);
    }

    // ---------- 考点治理（51-02 lite）：kp 概览/同义名合并/空考点填充（复用批量编辑 dry-run+撤销） ----------
    let kpOpen = $state(false);
    let kpMergeFrom = $state("");
    let kpMergeTo = $state("");
    let kpMergePlan = $state<import("@/core/batchEdit").BatchPlan | null>(null);
    let kpFillKp = $state("");
    let kpFillPlan = $state<import("@/core/batchEdit").BatchPlan | null>(null);
    let kpBusy = $state(false);
    let kpNote = $state("");
    const kpData = $derived(kpOpen && questions.length ? kpAudit(questions) : null);

    // ---------- 考纲对照（51-01/03 lite）：粘贴大纲 → 树 → kp 前缀覆盖、零题缺口导出 ----------
    let sylText = $state("");
    let sylPublisher = $state("");
    let sylYear = $state("");
    let sylSource = $state("");
    let sylPreviewRoots = $state<import("@/core/syllabus").SyllabusNode[] | null>(null);
    let sylError = $state("");
    let sylNote = $state("");
    const sylDoc = $derived(app ? app.syllabusDoc() : null);
    // 51-03 后半：kp → { 题数, 已独立掌握, 缺来源 }（独立=存在无受助的答对记录；练一题≠掌握节点，只报覆盖）
    const sylKpStats = $derived.by(() => computeSyllabusKpStats(app, questions));

    function previewSyllabus() {
      const res = previewSyllabusText(app, sylText, t);
      sylPreviewRoots = res.roots;
      sylError = res.error;
    }

    async function importSyllabus() {
      if (!sylPreviewRoots?.length) return;
      const res = await importSyllabusToApp(
        app,
        sylPreviewRoots,
        { publisher: sylPublisher.trim() || undefined, year: sylYear.trim() || undefined, source: sylSource.trim() || undefined },
        t,
      );
      sylNote = res.note;
      sylError = res.error;
      if (!res.error) {
        sylPreviewRoots = null;
        sylText = "";
      }
    }

    function downloadSyllabusGaps() {
      if (sylDoc?.roots) exportSyllabusGapsCsv(sylDoc.roots, sylKpStats);
    }

    // ---------- 勘误回导（57 lite）：导出模板（qid+当前值）→ 线下修订 → 回导 dry-run → 批量应用（撤销基线共用） ----------
    let errataOpen = $state(false);
    let errataPlan = $state<import("@/core/errata").ErrataPlan | null>(null);
    let errataErrors = $state<{ row: number; reason: string }[]>([]);
    let errataBusy = $state(false);
    let errataNote = $state("");

    function exportErrataTemplate() {
      exportErrataTemplateCsv(questions, bankName);
    }

    async function onErrataFile(e: Event) {
      const input = e.target as HTMLInputElement;
      const file = input.files?.[0];
      input.value = "";
      if (!file) return;
      errataBusy = true; errataNote = "";
      try {
        const res = await parseErrataFileInput(file, questions as (Question & { blockId?: string })[]);
        errataErrors = res.errors;
        errataPlan = res.plan;
      } finally { errataBusy = false; }
    }

    async function applyErrata() {
      const plan = errataPlan;
      if (!plan?.changes.length || errataBusy) return;
      errataBusy = true;
      try {
        const res = await executeApplyErrata(app, plan, activeBankId, t);
        batchUndo = res.undo;
        await saveBatchUndo();
        errataNote = res.note;
        errataPlan = null;
        void loadQuestions();
      } catch (e) {
        showMessage(String(e instanceof Error ? e.message : e), 4200, "error");
      } finally { errataBusy = false; }
    }

    // ---------- 打印视图（68-01 lite）：题册/答案册分离，作用于当前筛选全集 ----------
    const printQuestionSheet = () => printFilteredQuestionSheet(bankName, filteredQuestions, showMessage);
    const printAnswerSheet = () => printFilteredAnswerSheet(bankName, filteredQuestions, showMessage);
    const printAnswerCard = () => printFilteredAnswerCard(bankName, filteredQuestions, showMessage);

    // ---------- 纸笔回录（68-02 lite）：题号=作答 → 判分预览 → append 流水（mode=paper，不覆盖任何线上数据） ----------
    let paperOpen = $state(false);
    let paperText = $state("");
    let paperBusy = $state(false);
    let paperNote = $state("");
    const paperPreview = $derived.by(() => (paperOpen ? computePaperRecallPreview(paperText, filteredQuestions) : null));
    async function applyPaperRecall() {
      const pv = paperPreview;
      if (!pv || paperBusy || !app) return;
      paperBusy = true;
      try {
        const res = executeApplyPaperRecall(app, pv.items, t);
        paperNote = res.note;
        if (res.count > 0) {
          await app.flush();
          dataRev++;
          paperText = "";
        }
      } finally { paperBusy = false; }
    }

    const previewKpMerge = () => { const res = previewKpMergePlan(questions, kpMergeFrom, kpMergeTo, t); kpNote = res.note; kpMergePlan = res.plan; };
    const previewKpFill = () => { const res = previewKpFillPlan(questions, kpFillKp, t); kpNote = res.note; kpFillPlan = res.plan; };
    /** 应用治理变更：与批量编辑共用 SaveGate 闸与撤销基线（撤销走同一 batchedit/last） */
    async function applyKpPlan(plan: import("@/core/batchEdit").BatchPlan) {
      if (kpBusy || !app.kernelOnline) { kpNote = t("state.offlineHint"); return; }
      if (!plan.changes.length) return;
      kpBusy = true; kpNote = "";
      try {
        const res = await executeApplyKpPlan(app, plan, activeBankId, t);
        kpNote = res.note;
        batchUndo = res.undo;
        await saveBatchUndo();
        kpMergePlan = null; kpFillPlan = null;
        await loadQuestions();
      } catch (e) {
        kpNote = String(e instanceof Error ? e.message : e);
      } finally { kpBusy = false; }
    }

    const bankName = $derived(banks.find((b) => b.id === activeBankId)?.name ?? "");
    const bankCategory = $derived(banks.find((b) => b.id === activeBankId)?.category ?? "general");
    const hasBank = $derived(banks.length > 0);
    const offline = $derived(!app?.kernelOnline);
    /** onMount 注册的窗口事件监听清理（Svelte onMount 返回值与内部 async 冲突时用变量中转） */
    let onMountCleanup: (() => void) | null = null;
    onMount(() => () => {
      onMountCleanup?.(); onMountCleanup = null;
      clearReciteSubmitTimer();
      clearMoreFocusTimer();
    });

    // ---------- 题目编辑（43-01 lite：块菜单「编辑」→ 浏览视图内联表单） ----------
    let editingId = $state("");
    let editBusy = $state(false);
    let editError = $state("");
    let editDraft = $state<import("./services/questionEditService").QuestionEditDraft | null>(null);
    let editSpecOpen = $state(false);
    let editSpecUnit = $state("");
    let editSpecAbsTol = $state("");
    let editSpecRelPct = $state("");
    let editSpecAltUnits = $state("");
    function loadSpecFields(spec: import("../../core/structuredAnswer").AnswerSpec | undefined) {
      const f = extractNumericSpecFields(spec);
      editSpecUnit = f.unit;
      editSpecAbsTol = f.absTol;
      editSpecRelPct = f.relPct;
      editSpecAltUnits = f.altUnits;
    }

    function openEditForm(q: Question) {
      editError = "";
      editingId = q.id;
      editDraft = createQuestionEditDraft(q);
      loadSpecFields(q.answerSpec);
      editSpecOpen = q.answerSpec?.kind === "numeric";
    }
    function closeEditForm() {
      editingId = ""; editDraft = null; editError = "";
    }
    async function saveEdit(q: Question & { blockId: string }) {
      if (!editDraft || editBusy) return;
      editBusy = true; editError = "";
      try {
        const res = await executeSaveQuestionEdit(app, q, editDraft, {
          absTol: editSpecAbsTol,
          relPct: editSpecRelPct,
          unit: editSpecUnit,
          altUnits: editSpecAltUnits,
        }, t);
        if (res.error) {
          editError = res.error;
          return;
        }
        questions = questions.map((x) => (x.id === q.id ? { ...x, ...res.next } : x));
        closeEditForm();
        showMessage(t("edit.saved"), 2800, "info");
      } catch (e) {
        editError = offline ? t("state.offlineHint") : String(e instanceof Error ? e.message : e);
      } finally { editBusy = false; }
    }

    // ---------- 题目生命周期流转（43-01：draft ↔ review ↔ published ↔ deprecated） ----------
    let peekLifecycleBusy = $state(false);
    let peekLifecycleError = $state<Record<string, string>>({});
    async function changePeekLifecycle(q: Question & { blockId: string }, nextStatus: QuestionLifecycleStatus) {
      if (!app || peekLifecycleBusy) return;
      peekLifecycleBusy = true;
      peekLifecycleError = { ...peekLifecycleError, [q.id]: "" };
      try {
        const next = await executeChangeQuestionLifecycle(app, q, nextStatus, showMessage, t);
        questions = questions.map((x) => (x.id === q.id ? { ...x, ...next } : x));
      } catch (e) {
        peekLifecycleError = {
          ...peekLifecycleError,
          [q.id]: offline ? t("state.offlineHint") : String(e instanceof Error ? e.message : e),
        };
      } finally {
        peekLifecycleBusy = false;
      }
    }

    // ---------- 题目争议标记与处置单（57-04：多解/缺条件/答案存疑/资料过期） ----------
    let disputeFormOpenFor = $state("");
    let disputeReason = $state<DisputeReason>("wrong_answer");
    let disputeNote = $state("");
    let disputeResolution = $state("");
    let disputeBusy = $state(false);
    let disputeError = $state("");

    // ---------- 题目使用深度分析（43-02：选项选择率、干扰项有效性与低样本提示） ----------
    let itemAnalysisOpenFor = $state("");
    let itemAnalysisReport = $state<ItemAnalysisReport | null>(null);

    function toggleItemAnalysis(q: Question) {
      if (itemAnalysisOpenFor === q.id) {
        itemAnalysisOpenFor = "";
        itemAnalysisReport = null;
        return;
      }
      itemAnalysisOpenFor = q.id;
      const events = app?.attempts.all() ?? [];
      itemAnalysisReport = analyzeQuestionUsage(q, events);
    }

    const downloadItemAnalysisCsv = exportItemAnalysisReportCsv;

    function toggleDisputeForm(q: Question) {
      disputeError = "";
      if (disputeFormOpenFor === q.id) {
        disputeFormOpenFor = "";
        disputeNote = "";
        disputeResolution = "";
      } else {
        disputeFormOpenFor = q.id;
        const init = initDisputeFormValues(q);
        disputeReason = init.reason;
        disputeNote = init.note;
        disputeResolution = init.resolution;
      }
    }

    async function runDisputeMutation(q: Question & { blockId: string }, mutateFn: () => Promise<{ updated?: Partial<Question>; error?: string }>) {
      if (disputeBusy || !app) return;
      disputeBusy = true; disputeError = "";
      try {
        const res = await mutateFn();
        if (res.error) { disputeError = res.error; return; }
        if (res.updated) {
          questions = questions.map((x) => (x.id === q.id ? { ...x, ...res.updated } : x));
          disputeFormOpenFor = "";
        }
      } catch (e) {
        disputeError = String(e instanceof Error ? e.message : e);
      } finally { disputeBusy = false; }
    }

    const submitFlagDispute = (q: Question & { blockId: string }) =>
      runDisputeMutation(q, () => validateAndFlagDispute({ app, q, reason: disputeReason, note: disputeNote, showMessage, t }));

    const submitResolveDispute = (q: Question & { blockId: string }) =>
      runDisputeMutation(q, () => validateAndResolveDispute({ app, q, resolution: disputeResolution, showMessage, t }));

    const submitClearDispute = (q: Question & { blockId: string }) =>
      runDisputeMutation(q, () => handleClearDispute({ app, q, showMessage, t }));

    // ---------- 章节树过滤（TODO 2.2：notebook→doc→heading） ----------
    let sectionOpen = $state(false);
    let sectionTree = $state<import("@/core/sectionTree").DocNode[]>([]);
    let sectionSel = $state<import("@/core/sectionTree").SectionRef | null>(null);
    let sectionBusy = $state(false);
    const sectionLabel = $derived(resolveSectionNodeLabel(sectionTree, sectionSel));

    async function toggleSectionTree() {
      sectionOpen = !sectionOpen;
      if (sectionOpen && !sectionTree.length && activeBankId && app) {
        sectionBusy = true;
        try {
          sectionTree = await loadBankSectionTree(app, activeBankId);
        } finally {
          sectionBusy = false;
        }
      }
    }

    onMount(() => {
      let appInitStarted = false;
      const initAppData = () => {
        if (!app || appInitStarted) return;
        appInitStarted = true;
        if (plugin.settingUtils?.get?.("soundEnabled") !== undefined) {
          soundEnabled = Boolean(plugin.settingUtils.get("soundEnabled"));
        }
        errorMsg = "";
        void (async () => {
          try { explainHistory = (await app.loadAux<Record<string, import("@/ai/client").AiMessage[]>>("ai/explain-history")) ?? {}; } catch { /* 忽略 */ }
          await restoreAiQueue();
          await loadMappings();
          await loadSmartViews();
          await loadBatchUndo();
          await loadAiTaskLog();
          void retryCheckinPending().catch((e: unknown) => showMessage(String(e instanceof Error ? e.message : e), 3600, "error")); // 48-03：上次未写入的打卡事件原引用补写
          void loadCheckinStreak(); // 48-04 lite：桥开启时读连续天数（只读投影）
          void loadRubricArchive(); // 55-05：读回已记录的主观题自评存档
          // 45-06：恢复未提交的录题草稿（切视图/重载不丢输入）
          try {
            const d = await loadManualDraftAux(app);
            if (d?.stem?.trim()) {
              mType = (d.type as typeof mType) ?? "single";
              mStem = d.stem; mOptions = d.options?.length ? d.options : ["", ""];
              mAnswer = d.answer ?? ""; mAnalysis = d.analysis ?? "";
              mKp = d.kp ?? ""; mSecondaryKps = d.secondaryKps ?? ""; mPrerequisites = d.prerequisites ?? ""; mSource = d.source ?? ""; mGroup = d.group ?? "";
              mSpecOpen = d.specOpen ?? false; mSpecUnit = d.specUnit ?? ""; mSpecAbsTol = d.specAbsTol ?? ""; mSpecRelPct = d.specRelPct ?? ""; mSpecAltUnits = d.specAltUnits ?? "";
              mSpecOrderIndependent = d.orderIndependent ?? false;
              mRubricOpen = d.rubricOpen ?? false; mRubricText = d.rubricText ?? "";
              mStudyLang = d.studyLang ?? "zh-CN"; mStudyPhonetic = d.studyPhonetic ?? "";
              mStatus = d.status ?? "published"; mFamily = d.family;
              draftRestored = true;
            }
          } catch { /* 草稿读取失败静默 */ }
        })();
        banks = app.listBanks();
        const pendingPracticeView = plugin?.pendingPracticeView;
        const pendingPracticeViewIsCurrent = pendingPracticeView?.id === plugin?.practiceViewRequestId;
        activeBankId = resolveInitialActiveBankId({
          banks,
          rememberedBankId: readLocal(BANK_PREF_KEY),
          pendingViewBankId: pendingPracticeViewIsCurrent ? pendingPracticeView?.bankId : undefined,
          pendingPracticeBankId: plugin?.pendingPracticeBankId,
        });
        if (activeBankId) {
          void (async () => {
            await refreshQuestionsAfterWrite(0);
            // 若默认/记忆题库为空库且存在其它非空题库（且无外部指定题库深链），自动切至首个有题题库以便直接刷题
            if (
              !pendingPracticeViewIsCurrent &&
              !plugin?.pendingPracticeBankId &&
              questions.filter((q) => q.type !== "material").length === 0 &&
              banks.length > 1
            ) {
              for (const b of banks) {
                if (b.id === activeBankId) continue;
                try {
                  const candidateQs = await app.listQuestions(b.id);
                  if (candidateQs.some((q) => q.type !== "material")) {
                    activeBankId = b.id;
                    rememberBank(b.id);
                    await onBankSwitch();
                    break;
                  }
                } catch { /* ignore */ }
              }
            } else {
              rememberBank(activeBankId);
            }
            void refreshBankCounts();

            // 恢复未完成会话（37-05：校验题库归属，缺题剔除后提示；在首轮题库自愈完成后串行执行，避免与 refreshQuestionsAfterWrite 竞争 questionLoadSeq）
            try {
              const s = await app.resumeSession(async (qids) => {
                const all = questions.length ? questions : await loadQuestions();
                return qids.map((id) => all.find((q) => q.id === id)).filter(Boolean) as Question[];
              }, activeBankId);
              const rawRecite = activeBankId && !externalStartBusy
                ? await app.loadAux<any>("recite/active").catch(() => null)
                : null;
              const reciteIsNewer = Boolean(
                rawRecite &&
                rawRecite.bankId === activeBankId &&
                !rawRecite.done &&
                (!s || (rawRecite.updatedAt ?? 0) > (s.state.updatedAt ?? 0)),
              );
              if (s) {
                s.advancePastAnswered();                       // 37-05：恢复跳过已答位置防双计
                if (s.allAnswered()) sessionDone = s.finish();
                session = s;
                syncSessionScratchpad(s);
                if (!reciteIsNewer) {
                  view = "session";
                  sessionRev++;
                  armPracticeExamHistory();
                  restoreQuestionControls();
                }
                if (app.lastResumeMissing.length) showMessage(t("resume.missing").replace("{n}", String(app.lastResumeMissing.length)), 4200, "info");
              }
              if (reciteIsNewer && !externalStartBusy) {
                const all = questions.length ? questions : await loadQuestions();
                const rs = await loadReciteSnapshot(app, activeBankId, all.filter((q) => q.type !== "material"));
                if (rs && !externalStartBusy) {
                  reciteQueue = rs.queue;
                  reciteCursor = rs.cursor;
                  reciteRevealed = rs.revealed;
                  reciteDone = rs.done;
                  reciteHint = rs.hint;
                  reciteRatings = rs.ratings;
                  reciteSessionId = rs.sessionId;
                  reciteCardStart = Date.now();
                  view = "recite";
                  armPracticeExamHistory();
                }
              }
              rebuildPlan();
            } catch {
              /* ignore */
            } finally {
              loading = false;
            }
          })();
        } else {
          loading = false;
        }
      };

      if (app) {
        initAppData();
      } else {
        loading = true;
      }
      /** 错题本/块菜单 → 单题会话（qid 定位；首次挂载 questions 未加载，先按库拉取） */
      async function startSingleById(pid: string) {
        if (!pid) return false;
        const all = questions.length ? questions : await loadQuestions();
        const q = all.find((x) => x.id === pid);
        if (!q) { showMessage(t("query.empty"), 3200, "info"); return true; }
        if (!(await negotiateStart([q], "wrong"))) return true;
        enterSessionView();
        return true;
      }
      /** 块菜单「在练习台打开/编辑」→ 浏览视图按 qid 聚焦（题目在其它库时自动切库） */
      async function focusInBrowse(pid: string, edit: boolean, bankId?: string) {
        if (!pid) return;
        if (bankId && bankId !== activeBankId && banks.some((b) => b.id === bankId)) activeBankId = bankId;
        const all = await loadQuestions();
        sectionSel = null;
        setSearch(pid);
        view = "browse";
        loading = false;
        const q = all.find((x) => x.id === pid);
        if (!q) { showMessage(t("query.empty"), 3200, "info"); return; }
        expandedId = q.id;
        if (edit) openEditForm(q);
      }
      // 40-05：已开 Tab 时 pending* 字段无人消费 → 经 lv-exam:* 总线补齐移交（信封 v1，未知版本不投递）
      const onOpenQ = (env: import("@/core/bus").BusEvent<{ qid: string }>) => void startSingleById(env.payload.qid);
      const onBrowseQ = (env: import("@/core/bus").BusEvent<{ qid: string; bank?: string }>) =>
        void focusInBrowse(env.payload.qid, false, env.payload.bank);
      const onEditQ = (env: import("@/core/bus").BusEvent<{ qid: string; bank?: string }>) =>
        void focusInBrowse(env.payload.qid, true, env.payload.bank);
      const onOpenPracticeQuestions = (env: import("@/core/bus").BusEvent<{ qids: string[]; bank: string }>) => {
        const pending = plugin?.pendingPractice;
        const samePending = pending?.length === env.payload.qids.length && pending.every((q, i) => q.id === env.payload.qids[i]);
        if (samePending && plugin?.pendingPracticeBankId === env.payload.bank) {
          if (plugin) {
            plugin.pendingPractice = undefined;
            plugin.pendingPracticeBankId = undefined;
          }
        }
        void startExternalPractice(env.payload.qids, env.payload.bank);
      };
      // 稳定入口深链（window.siyuanExam.wrongbook → 错题本视图；新开与已开 Tab 同路径）
      function applyMaterialRequest(request: import("@/core/pluginTab").PracticeViewRequest | undefined) {
        if (!request?.sourceText) return;
        if (request.view === "ai") {
          aiSource = request.sourceText;
          aiSourceBlockId = request.sourceBlockId ?? "";
          const sourceLabel = request.sourceKind === "document" ? t("ai.sourceFromDocument") : t("ai.sourceFromBlock");
          aiSourceOrigin = request.sourceTitle
            ? `${sourceLabel.replace("{title}", request.sourceTitle)}${request.sourceTruncated ? ` · ${t("ai.sourceTruncated").replace("{n}", String(request.sourceText.length))}` : ""}`
            : "";
          if (!aiKp.trim() && request.sourceTitle) aiKp = request.sourceTitle;
        } else if (request.view === "entry" || request.view === "manual") {
          mStem = request.sourceText.trim();
          if (request.sourceBlockId) {
            mSourceBlockId = request.sourceBlockId;
            mSource = `(( ${request.sourceBlockId} '${request.sourceTitle || "来源笔记段落"}' ))`;
          }
          if (request.sourceTitle && !mKp.trim()) {
            mKp = request.sourceTitle;
          }
          showMessage(t("slash.convertToQuestionDone"), 2800, "info");
        }
      }
      const onOpenView = (env: import("@/core/bus").BusEvent<{ view: string; requestId?: string }>) => {
        if (!tabRoot?.isConnected) return;
        const next = env.payload.view;
        if (!["wrongbook", "entry", "browse", "manual", "import", "ai", "materials", "recite", "marketplace"].includes(next)) return;
        let request: import("@/core/pluginTab").PracticeViewRequest | undefined;
        const requestId = env.payload.requestId;
        if (requestId) {
          if (!isCurrentPracticeViewRequest(plugin, requestId) || requestId === appliedPracticeViewRequestId) return;
          appliedPracticeViewRequestId = requestId;
          request = consumePendingPracticeView(plugin);
        }
        applyMaterialRequest(request);
        loading = false;
        dataRev++;
        switchView(next as View);
        // External commands/deep links can open the materials view without
        // going through the Rail/Palette click handlers. Refresh the
        // non-reactive material store before rendering that entry.
        if (next === "materials" && app) loadMaterials();
        const requestedBankId = request?.bankId;
        if (requestedBankId && banks.some((b) => b.id === requestedBankId) && requestedBankId !== activeBankId) {
          activeBankId = requestedBankId;
          rememberBank(activeBankId);
          questions = [];
          questionsLoaded = false;
          sectionSel = null;
        }
        if (typeof request?.search === "string") {
          clearBrowseFilters();
          setSearch(request.search);
        }
        if (["wrongbook", "entry", "browse"].includes(next)) void loadQuestions();
      };
      // 应用层派生缓存失效：会话结算 / 错题处置后刷新驾驶舱 widgets 与错题本列表（见 dataRev 注）
      const onDataChanged = () => { dataRev++; };
      const onAppReady = () => {
        appOverride = plugin?.examApp ?? null;
        if (appOverride) {
          initAppData();
          // A pending deep link may have selected materials while the app was
          // still initializing. The initial branch cannot load its snapshot
          // until this callback supplies the live app instance.
          if (view === "materials") loadMaterials();
        }
      };
      function applyQuizDraft(opts: { text?: string; sourceBlockId?: string; sourceTitle?: string; type?: string }) {
        if (!opts?.text) return;
        switchView("manual");
        mStem = opts.text.trim();
        if (opts.sourceBlockId) {
          mSource = `(( ${opts.sourceBlockId} '${opts.sourceTitle || "来源原文"}' ))`;
        }
        if (opts.type === "cloze") {
          mType = "fill";
        } else if (opts.type === "single") {
          mType = "single";
        } else {
          mType = "short";
        }
        showMessage("[小驴考试] 已由长文划词自动载入出题制卡工坊 ✓", 3200, "info");
      }

      const offs = [
        onExamEvent("app-ready", onAppReady),
        onExamEvent("open-creator", (env) => {
          if (!tabRoot?.isConnected) return;
          applyQuizDraft(env.payload as any);
        }),
        onExamEvent("open-question", onOpenQ),
        onExamEvent("open-practice-questions", onOpenPracticeQuestions),
        onExamEvent("open-in-browse", onBrowseQ),
        onExamEvent("edit-question", onEditQ),
        onExamEvent("open-view", onOpenView),
        onExamEvent("session-ended", onDataChanged),
        onExamEvent("wrongbook-changed", onDataChanged),
        onExamEvent("date-crossed", () => { onDataChanged(); rebuildPlan(); }),
      ];

      // 思源编辑器原位改题热回流：当用户在思源文档中修改了题面/答案再切回插件页签时，自动刷新题库
      let lastHotRefreshAt = 0;
      const onHostFocusOrVisible = () => {
        if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
        if (!app || !activeBankId || loading || importBusy || mSaving || creating || syncDocsBusy) return;
        if (!["entry", "browse", "wrongbook"].includes(view)) return;
        const now = Date.now();
        if (now - lastHotRefreshAt < 2500) return;
        lastHotRefreshAt = now;
        void loadQuestions();
      };
      if (typeof window !== "undefined") {
        window.addEventListener("focus", onHostFocusOrVisible);
        document.addEventListener("visibilitychange", onHostFocusOrVisible);
        offs.push(() => {
          window.removeEventListener("focus", onHostFocusOrVisible);
          document.removeEventListener("visibilitychange", onHostFocusOrVisible);
        });
      }

      // 移动端虚拟键盘避让：监听 visualViewport 动态抬升底边距，防遮挡按钮
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
        window.visualViewport?.addEventListener("scroll", onViewportChange, { passive: true });
        offs.push(() => {
          window.removeEventListener("resize", onViewportChange);
          window.visualViewport?.removeEventListener("resize", onViewportChange);
          window.visualViewport?.removeEventListener("scroll", onViewportChange);
        });
      }

      onMountCleanup = () => offs.forEach((off) => off());
      const pendingView = consumePendingPracticeView(plugin);
      const initialView = pendingView?.view ?? plugin?.pendingInitialView;
      if ((plugin as any)?.pendingExternalQuiz) {
        const pendingQuiz = (plugin as any).pendingExternalQuiz;
        (plugin as any).pendingExternalQuiz = null;
        applyQuizDraft(pendingQuiz);
      } else if (["wrongbook", "entry", "browse", "manual", "import", "ai", "materials", "recite"].includes(initialView ?? "")) {
        if (plugin) plugin.pendingInitialView = undefined;
        if (pendingView) appliedPracticeViewRequestId = pendingView.id;
        applyMaterialRequest(pendingView);
        loading = false;
        switchView(initialView as View);
        if (initialView === "materials" && app) loadMaterials();
        if (typeof pendingView?.search === "string") {
          clearBrowseFilters();
          setSearch(pendingView.search);
        }
        return;
      }
      // 错题本信号优先：按 qid 直达单题
      const pid = plugin?.pendingQuestionId;
      if (pid) {
        if (plugin) plugin.pendingQuestionId = undefined;
        loading = false;
        void startSingleById(pid);
        return;
      }

    // 查询圈题待处理集（块菜单发起，优先于恢复）
      const pending = plugin?.pendingPractice;
      if (pending?.length) {
        const pendingBankId = plugin?.pendingPracticeBankId;
        if (plugin) {
          plugin.pendingPractice = undefined;
          plugin.pendingPracticeBankId = undefined;
        }
        void startExternalPractice(pending.map((q) => q.id), pendingBankId);
        return;
      }
      // 块菜单「在练习台打开 / 编辑」→ 浏览视图聚焦（优先于会话恢复）
      const pBrowse = plugin?.pendingBrowseQid;
      const pEdit = plugin?.pendingEditQid;
      if (pBrowse || pEdit) {
        const bank = plugin?.pendingBrowseBank ?? plugin?.pendingEditBank;
        if (plugin) {
          plugin.pendingBrowseQid = undefined;
          plugin.pendingEditQid = undefined;
          plugin.pendingBrowseBank = undefined;
          plugin.pendingEditBank = undefined;
        }
        void focusInBrowse((pBrowse ?? pEdit)!, pEdit != null, bank);
        return;
      }
    });

    async function loadQuestions(): Promise<Question[]> {
      if (!activeBankId) { questionsLoaded = true; return []; }
      const requestId = ++questionLoadSeq;
      const bankId = activeBankId;
      questionsError = "";
      try {
        const loaded = await app.listQuestions(bankId);
        // 快速连续切库时，只允许最后一次读取更新页面，防止旧库结果覆盖新库。
        if (requestId !== questionLoadSeq || bankId !== activeBankId) return [];
        questions = loaded;
        const practiceCount = loaded.filter((q) => q.type !== "material").length;
        bankQuestionCounts = { ...bankQuestionCounts, [bankId]: practiceCount };
        rebuildQrefView();
        return questions;
      } catch (e) {
        if (requestId !== questionLoadSeq || bankId !== activeBankId) return [];
        // 不保留上一题库的快照，否则读取失败时模式按钮仍会显示为可用并启动旧题。
        questions = [];
        questionsError = String(e instanceof Error ? e.message : e);
        return [];
      } finally {
        if (requestId === questionLoadSeq && bankId === activeBankId) questionsLoaded = true;
      }
    }

    async function retryEntryLoad() {
      loading = true;
      await loadQuestions();
      rebuildPlan();
      loading = false;
    }

    async function refreshBankCounts() {
      if (!app || !banks.length) return;
      const next: Record<string, number> = { ...bankQuestionCounts };
      for (const b of banks) {
        try {
          if (b.id === activeBankId && questionsLoaded) {
            next[b.id] = questions.filter((q) => q.type !== "material").length;
          } else {
            const qs = await app.listQuestions(b.id);
            next[b.id] = qs.filter((q) => q.type !== "material").length;
          }
        } catch {
          next[b.id] = next[b.id] ?? 0;
        }
      }
      bankQuestionCounts = next;
    }

    async function switchToNonEmptyBank() {
      if (!app) return;
      await refreshBankCounts();
      const target = banks.find((b) => b.id !== activeBankId && (bankQuestionCounts[b.id] ?? 0) > 0);
      if (target) {
        activeBankId = target.id;
        await onBankSwitch();
        showMessage(`已切换至题库「${target.name}」（共 ${bankQuestionCounts[target.id]} 题）✓`, 2800, "info");
        return;
      }
      bankHubOpen = true;
    }

    async function refreshQuestionsAfterWrite(minCount: number) {
      const bankId = activeBankId;
      for (let attempt = 0; attempt < 6; attempt++) {
        if (bankId !== activeBankId) break;
        await loadQuestions();
        if (bankId !== activeBankId) break;
        if (questionsError || questions.length >= minCount) break;
        if (attempt < 5) await new Promise((resolve) => setTimeout(resolve, 700));
      }
      rebuildPlan();
    }

    // ---------- 题目↔资料关联（120-05 lite）：题目回 PDF 页/视频时间点；快照式视图保响应 ----------
    let qrefView = $state<Record<string, { title: string; label: string; stale: boolean } | null>>({});
    let qrefFormFor = $state("");
    let qrefMatId = $state("");
    let qrefPage = $state("");
    let qrefTime = $state("");
    let qrefError = $state("");
    let qrefBusyFor = $state("");
    let qrefActionError = $state<Record<string, string>>({});

    function qrefSnapshot(qid: string) {
      return computeQuestionMaterialSnapshot(app, qid);
    }
    function rebuildQrefView() {
      if (!app) return;
      qrefView = buildAllQuestionsMaterialSnapshot(app, questions);
    }
    function refreshQref(qid: string) {
      qrefView = { ...qrefView, [qid]: qrefSnapshot(qid) };
    }
    function startQrefForm(qid: string) {
      qrefFormFor = qid; qrefError = "";
      const f = initQrefFormState(app, qid);
      qrefMatId = f.materialId;
      qrefPage = f.page;
      qrefTime = f.time;
    }
    async function saveQref(qid: string) {
      if (!qrefMatId || qrefBusyFor) return;
      qrefError = "";
      qrefBusyFor = qid;
      try {
        const res = await saveQuestionMaterialReference(app, qid, qrefMatId, qrefPage, qrefTime, showMessage, t);
        qrefFormFor = ""; refreshQref(qid);
        if (res.previousMaterialId && res.previousMaterialId !== qrefMatId) refreshMaterialQuestionCount(res.previousMaterialId);
        refreshMaterialQuestionCount(qrefMatId);
      } catch (e) {
        qrefError = String(e instanceof Error ? e.message : e);
      } finally { qrefBusyFor = ""; }
    }
    async function removeQref(qid: string) {
      if (qrefBusyFor) return;
      qrefBusyFor = qid;
      qrefActionError = { ...qrefActionError, [qid]: "" };
      try {
        const previousMatId = await removeQuestionMaterialReference(app, qid, showMessage, t);
        if (previousMatId) {
          refreshQref(qid);
          refreshMaterialQuestionCount(previousMatId);
        }
      } catch (e) {
        qrefActionError = { ...qrefActionError, [qid]: String(e instanceof Error ? e.message : e) };
      } finally { qrefBusyFor = ""; }
    }
    function openQref(qid: string) {
      const { url, material } = resolveQuestionMaterialOpenUrl(app, qid, window.location.origin);
      if (!url) { showMessage(t("materials.cannotOpen"), 2400, "error"); return; }
      if (material) { void gatedOpen(url, material); return; } // 73-02：link 类经隐私闸
      window.open(url, "_blank", "noopener");
    }

    // ---------- 作答回执下钻（U14 lite：当时作答/判定/信心/受助/先回忆/用时；错题回执可接 AI 错因假设） ----------
    let receiptOpenFor = $state("");
    let receiptCache = $state<import("../../core/types").AttemptEvent[]>([]);
    let receiptBusy = $state("");
    let receiptMisdiagnosis = $state<Record<string, string>>({});
    let receiptStored = $state<{ text: string; at: number; adoptedAt?: number } | null>(null);

    function toggleReceipts(qid: string) {
      receiptOpenFor = receiptOpenFor === qid ? "" : qid;
      if (receiptOpenFor) {
        const res = queryQuestionReceipts(app, qid);
        receiptCache = res.receipts;
        receiptStored = res.storedMisdiagnosis;
      }
    }

    /** 按选定回执（而非当前会话）做错因假设：证据取自该次作答事件本身（U14 口径） */
    async function runReceiptMisdiagnosis(q: Question, e: import("../../core/types").AttemptEvent) {
      const key = `${e.qid}#${e.seq}`;
      if (receiptBusy || !app.kernelOnline) return;
      receiptBusy = key;
      try {
        const res = await executeMisdiagnosisWorkflow({
          app,
          q,
          myAnswer: e.myAnswer ?? null,
          timeMs: e.timeMs,
          sessionId: e.sessionId,
          meta: { confidence: e.confidence, helped: !!e.help },
          userThought: reflections[e.qid]?.text,
          aiConfig: aiSettings(),
          t,
        });

        if (res.text) {
          receiptMisdiagnosis = { ...receiptMisdiagnosis, [key]: res.text };
        } else if (res.error) {
          showMessage(res.error, 3600, "error");
        }
      } catch (err) {
        showMessage(String(err instanceof Error ? err.message : err), 3600, "error");
      } finally { receiptBusy = ""; }
    }

    // ---------- AI 闪卡候选（116-03 T10：最小卡/拆卡理由；先展示卡数/负荷/来源，确认后才建卡） ----------
    let flashBusy = $state("");
    let flashCandidates = $state<Record<string, import("@/ai/flashCandidates").FlashCandidateResult>>({});
    let flashError = $state<Record<string, string>>({});

    async function makeFlashCandidates(q: Question) {
      if (flashBusy || !app.kernelOnline) {
        if (!app.kernelOnline) showMessage(t("state.offlineHint"), 2400, "info");
        return;
      }
      flashBusy = q.id;
      try {
        const res = await generateFlashCandidates({
          q,
          client: app.deps.client,
          app,
          aiConfig: aiSettings(),
          t,
        });
        if (res.result) {
          flashCandidates = { ...flashCandidates, [q.id]: res.result };
          void app.recordAiUsage(res.channelId, res.tokens, 1).catch(() => undefined);
        } else {
          flashError = { ...flashError, [q.id]: res.error };
        }
      } catch (e) {
        flashError = { ...flashError, [q.id]: String(e instanceof Error ? e.message : e) };
      } finally { flashBusy = ""; }
    }

    async function confirmFlashCards(q: Question) {
      const result = flashCandidates[q.id];
      if (!result || flashBusy) return;
      const bank = app.listBanks().find((b) => b.id === activeBankId);
      if (!bank) { showMessage(t("guard.needBankFirst"), 2400, "error"); return; }
      const { confirmDialogSync } = await import("../../libs/dialog");
      flashBusy = q.id;
      try {
        const res = await executeCommitFlashCardsWithConfirm(app, bank.id, bank.name, result.cards, confirmDialogSync, t);
        if (res.confirmed) {
          flashCandidates = { ...flashCandidates, [q.id]: { ...result, cards: [] } };
          if (res.toast) showMessage(res.toast, 3200, "info");
        }
      } catch (e) {
        showMessage(String(e instanceof Error ? e.message : e), 4200, "error");
      } finally { flashBusy = ""; }
    }

    async function createBank() {
      if (!newBankName.trim() || creating) return false;
      creating = true; errorMsg = ""; bankCreateError = ""; sampleNotice = "";
      try {
        const { bank, banks: nextBanks } = await executeCreateBank(app, newBankName);
        banks = nextBanks;
        activeBankId = bank.id;
        rememberBank(bank.id);
        newBankName = "";
        await refreshQuestionsAfterWrite(3);
        emitExamEvent("bank-changed", { bank: bank.id });
        return true;
      } catch (e) {
        bankCreateError = offline ? t("state.offlineHint") : String(e instanceof Error ? e.message : e);
        return false;
      } finally { creating = false; }
    }

    async function createSampleBank(kind: SampleBankKind | Event = "general") {
      const actualKind = normalizeSampleBankKind(kind);
      if (creating) return;
      creating = true; creatingSample = true;
      errorMsg = ""; bankCreateError = ""; sampleNotice = "";
      let currentTargetName = "";
      try {
        const res = await executeCreateSampleBank(app, actualKind);
        currentTargetName = res.targetName;
        banks = res.banks;
        activeBankId = res.bank.id;
        rememberBank(res.bank.id);
        questions = []; questionsLoaded = false; sectionSel = null; plan = null;
        view = "entry";
        await refreshQuestionsAfterWrite(res.targetCount);
        emitExamEvent("bank-changed", { bank: res.bank.id });
        sampleNotice = formatSampleNoticeText(questions.length, res.targetCount, Boolean(questionsError), t);
      } catch (e) {
        bankCreateError = offline ? t("state.offlineHint") : String(e instanceof Error ? e.message : e);
        const { retainedBank, banks: nextBanks } = resolveRetainedSampleBank(app, currentTargetName);
        banks = nextBanks;
        if (retainedBank) {
          activeBankId = retainedBank.id;
          rememberBank(retainedBank.id);
          questions = []; questionsLoaded = false; sectionSel = null; plan = null;
          view = "entry";
          await loadQuestions();
          rebuildPlan();
        }
      } finally { creating = false; creatingSample = false; }
    }

    /** 记忆当前题库（多库切换/建库/移出后统一走这里） */
    function rememberBank(id: string) {
      if (id) writeLocal(BANK_PREF_KEY, id);
      else removeLocal(BANK_PREF_KEY);
    }

    /** 多库切换（真机走查补齐）：切库后题目/计划随 activeBankId 重载 */
    async function onBankSwitch() {
      if (importPreviewBankId && importPreviewBankId !== activeBankId && !importBusy) {
        importReport = null; trialConfirmed = []; trialNote = "";
        importPreviewBankId = "";
        importError = t("import.bankChanged");
      }
      rememberBank(activeBankId);
      questions = [];
      questionsLoaded = false;
      sectionSel = null;
      questionsError = "";
      plan = null;
      await loadQuestions();
      rebuildPlan();
      emitExamEvent("bank-changed", { bank: activeBankId });
    }

    /** 移出题库管理（app.removeBank）：仅移出注册表，笔记本本体保留可手动删 */
    async function removeActiveBank(bankIdToRemove?: string) {
      const targetId = bankIdToRemove || activeBankId;
      if (!targetId || !app || importBusy || mSaving || aiMutationBusy) return;
      const targetBank = banks.find((b) => b.id === targetId);
      const res = await executeRemoveBankWithConfirm({
        app,
        activeBankId: targetId,
        bankName: targetBank?.name ?? bankName,
        confirmDialogSync,
        showMessage,
        t,
      });
      if (res.removed && res.nextBanks) {
        banks = res.nextBanks;
        if (activeBankId === targetId) {
          activeBankId = res.nextActiveBankId ?? "";
          rememberBank(activeBankId);
          emitExamEvent("bank-changed", { bank: activeBankId });
        }
      }
    }

    /** 44-03 lite：材料组排序策略（设置项）——false=分块连排（默认）/ true=交错打散 */
    const materialInterleave = $derived(
      plugin.settingUtils?.get?.("materialInterleave") === true || plugin.settingUtils?.get?.("materialInterleave") === "true",
    );

    let sessionSeed = $state(""); // 65-05 lite：本次会话种子（结算页展示，可复现标识）
    // 应用层派生缓存（app.derived()/wrongItems()）是普通对象，Svelte 无法追踪其变化；
    // 用总线事件（session-ended / wrongbook-changed）驱动修订号显式失效下方相关 $derived，
    // 否则组件挂载后数据变化不重算（真机走查实测：练完进错题本恒显空，重开页签才恢复）。
    let dataRev = $state(0);
    let railOpen = $state(false);
    let menuBtn: HTMLButtonElement | null = null;
    function closeRail() { railOpen = false; menuBtn?.focus(); }


    // ---------- 驾驶舱 widgets（规范 v6 §5.3）：目标环 / 连胜 / 待消灭错题 ----------
    const todayDone = $derived.by(() => {
      void dataRev;
      try {
        return app ? (app.derived().days.get(localDate(Date.now()))?.attempts ?? 0) : 0;
      } catch { return 0; }
    });
    const weekTrend = $derived.by(() => {
      void dataRev;
      try { return app ? dailyTrend(app.derived().days, new Date(), 7) : []; } catch { return []; }
    });
    const weekAttemptTotal = $derived(weekTrend.reduce((total, day) => total + day.attempts, 0));
    const weekAttemptMax = $derived(Math.max(1, ...weekTrend.map((day) => day.attempts)));
    const weekDayLabel = formatWeekDayLabel;
    const dailyGoalN = $derived(Math.max(1, Number(plugin.settingUtils?.get?.("dailyGoal") ?? 10) || 10));
    const goalPct = $derived(Math.min(100, Math.round((todayDone / dailyGoalN) * 100)));
    const streakDays = $derived.by(() => {
      void dataRev;
      try { return app ? streak(app.derived()) : 0; } catch { return 0; }
    });
    const wrongList = $derived.by(() => {
      void dataRev;
      if (!app) return [];
      // 错题本按当前题库口径：全局流水里的错题若不属于当前库，
      // 重练/冲刺按钮（按当前库取题）会静默落空——列表与操作必须同库
      const ids = new Set(questions.map((q) => q.id));
      return app.wrongItems().filter((w) => ids.has(w.qid));
    });
    const practiceQuestions = $derived(questions.filter((q) => q.type !== "material"));
    const cramCount = $derived(app ? app.cramDrill(practiceQuestions).length : 0);
    const todayQueueFor = (available: Question[], planned?: Question[]) => groupAdjacent(resolveDailyStudyQueue(available, planned));
    // 备考计划状态在驾驶舱 widgets 与入口卡片之间共享。
    let plan = $state<ReturnType<typeof import("@/core/planner").planToday> | null>(null);
    const todayAnsweredIds = $derived.by(() => {
      void dataRev;
      return queryTodayAnsweredIds(app);
    });
    const todayQueue = $derived(
      computeTodayPracticeQueue({
        plan,
        practiceQuestions,
        todayAnsweredIds,
        groupAdjacentFn: groupAdjacent,
      }),
    );
    const favoriteCount = $derived(practiceQuestions.filter((q) => q.fav).length);
    /** 错因计数：口径在 core/wrongReasonMix（reasons map 优先 → 遗留字段 → 未标注桶） */
    const reasonMap = $derived.by(() => {
      void dataRev;
      try { return app?.wrongReasonMap?.() ?? new Map(); } catch { return new Map(); }
    });
    const reasonCounts = $derived(wrongReasonMix(wrongList, reasonMap));
    const reasonOf = (qid: string) => reasonMap.get(qid) ?? wrongList.find((w) => w.qid === qid)?.reason;
    /** 消灭口径：eliminated/(eliminated+在册)；处置覆盖层不影响分母方向 */
    const eliminatedCount = $derived.by(() => {
      void dataRev;
      return countEliminatedWrongs(app, questions);
    });
    const clearPct = $derived(calculateClearPercentage(eliminatedCount, wrongList.length));
    /** 错题队列：错次降序 → 最近错误降序（紧迫度序）；benchmark-fusion 增补 CBM 双维分栏 */
    let wbTab = $state<"active" | "archived" | "eliminated" | "highrisk" | "fragile" | "ebbinghaus">("active");
    let wbReasonFilter = $state<"all" | "careless" | "unknown" | "trap">("all");
    let wbFilterStubborn = $state(false);
    let wbKpFilter = $state("");
    let wbTagFilter = $state("");
    let wbSortMode = $state<"default" | "wrongCount" | "kp">((readLocal("lv-exam/wrong-sort") as any) || "default");
    const archivedWrongList = $derived.by(() => {
      void dataRev;
      return queryArchivedWrongList(app, questions);
    });
    const eliminatedWrongList = $derived.by(() => {
      void dataRev;
      return queryEliminatedWrongList(app, questions);
    });
    /** benchmark-fusion（Moodle CBM）：确定度双维信号——高危盲区（自评确定却答错）与脆弱伪掌握（自评模糊/猜测却蒙对）。
     *  与错题本同库口径：只保留当前题库内的题；流水最新态去重见 core/cbm.ts。 */
    const cbmScanResult = $derived.by(() => {
      void dataRev;
      if (!app) return { highrisk: [], fragile: [] };
      try { return cbmScan(app.attempts.all()); } catch { return { highrisk: [], fragile: [] }; }
    });
    const cbmHighrisk = $derived.by(() => {
      void dataRev;
      const ids = new Set(questions.map((q) => q.id));
      return cbmScanResult.highrisk.filter((s) => ids.has(s.qid));
    });
    const cbmFragile = $derived.by(() => {
      void dataRev;
      const ids = new Set(questions.map((q) => q.id));
      return cbmScanResult.fragile.filter((s) => ids.has(s.qid));
    });
    const cbmHighriskQids = $derived(new Set(cbmHighrisk.map((s) => s.qid)));
    const wrongQueue = $derived(
      [...wrongList].sort((a, b) => b.wrongCount - a.wrongCount || b.lastWrongAt - a.lastWrongAt),
    );
    const wbKpOptions = $derived(extractWrongQueueKpOptions(wrongQueue, questionMap));
    const wbTagOptions = $derived(extractWrongQueueTagOptions(wrongQueue, questionMap));
    let wbDocFilter = $state("");
    const wbDocOptions = $derived(extractWrongQueueDocOptions(wrongQueue, questionMap));
    const filteredWrongQueue = $derived(filterAndSortWrongQueue(wrongQueue, questionMap, reasonOf, {
      reasonFilter: wbReasonFilter,
      filterStubborn: wbFilterStubborn,
      kpFilter: wbKpFilter,
      tagFilter: wbTagFilter,
      docFilter: wbDocFilter,
      sortMode: wbSortMode,
      highriskQids: cbmHighriskQids,
    }));
    const tracebackBlock = (blockId: string, rootId?: string) => {
      void tracebackToSourceBlock({ plugin, blockId, rootId, isMobile: plugin.isMobile });
    };
    /** 错题本队列渲染上限（ux §3 virtualize-lists / Mobile Spec v1 性能纪律）：
     *  首屏 ≤50 条，避免数百重 DOM 拖慢移动端与窄屏滚动。计数徽标/打印/特训等操作仍按全量筛选口径。 */
    let wbQueueLimit = $state(50);
    const shownWrongQueue = $derived(filteredWrongQueue.slice(0, wbQueueLimit));
    const wbQueueHasMore = $derived(filteredWrongQueue.length > wbQueueLimit);

    const archiveWrong = async (qid: string) => { await archiveWrongItem(app, qid, showMessage, t); dataRev++; };
    const unarchiveWrong = async (qid: string) => { await unarchiveWrongItem(app, qid, showMessage, t); dataRev++; };
    const snoozeWrong = async (qid: string, days = 7) => { await snoozeWrongItem(app, qid, days, showMessage, t); dataRev++; };
    const restoreWrongToActive = async (qid: string) => { await restoreWrongItemToActive(app, qid, showMessage); dataRev++; };

    function switchView(next: View) {
      errorMsg = "";
      view = next;
      if (next === "import") {
        void checkImportCheckpoint();
        if (importSubTab === "siyuan" && !siyuanDocCandidates.length) {
          void doSearchDocs("");
        }
      }
    }
    const railItems = $derived([
      { icon: "grid", name: t("mode.browse"), on: (view as string) === "browse", onclick: () => { switchView("browse"); void loadQuestions(); } },
      { icon: "target", name: t("wrongbook.title"), on: (view as string) === "wrongbook", badge: wrongList.length ? String(wrongList.length) : undefined, onclick: () => { dataRev++; switchView("wrongbook"); void loadQuestions(); } },
      { icon: "import", name: t("import.title"), on: (view as string) === "import", onclick: () => switchView("import") },
      { icon: "clipboard", name: t("entry.manual"), on: (view as string) === "manual", onclick: () => switchView("manual") },
      { icon: "sparkles", name: t("ai.title"), on: (view as string) === "ai", onclick: () => switchView("ai") },
      { icon: "material", name: t("materials.title"), on: (view as string) === "materials", onclick: () => { switchView("materials"); loadMaterials(); } },
    ]);

    let paletteOpen = $state(false);
    const paletteCommands = $derived(buildPracticePaletteCommands({
      t,
      switchView,
      loadQuestions,
      loadMaterials,
      startDrill,
      startRecite,
      syncBankDocs,
      copyTodayReportMarkdown,
      openMock: () => { plugin.openMock?.(); },
      openReport: () => { plugin.openReport?.(); },
      openSettings: () => {
        plugin.openSetting?.();
      },
      resetSettings: async () => {
        const ok = await confirmDialogSync({
          title: "恢复默认设置",
          content: "确定要恢复小驴考试的全部默认参数配置吗？（AI 密钥将被妥善保留，不会清空）",
        });
        if (ok) {
          for (const [key, def] of (plugin as any).settingDefaults ?? []) {
            if (key === "aiKey") continue;
            plugin.settingUtils?.set?.(key, def);
          }
          try {
            await plugin.settingUtils?.save?.();
            showMessage(t("setting.resetDone", "已恢复默认设置（AI Key 兜底副本保留，未清除）"), 4000, "info");
          } catch (e) {
            showMessage(String(e instanceof Error ? e.message : e), 5000, "error");
          }
        }
      },
    }));

    async function onTaskNav(target: "today" | "wrong" | "bank" | "marketplace" | "create" | "mock" | "report") {
      if (target === "wrong") {
        dataRev++;
        switchView("wrongbook");
        void loadQuestions();
        return;
      }
      if (target === "marketplace") {
        switchView("marketplace");
        return;
      }
      if (target === "mock") {
        if (questions.length < 3) {
          const { confirmDialogSync } = await import("../../libs/dialog");
          const proceed = await confirmDialogSync({
            title: "全真模拟考场使用说明",
            content: `<p style="margin:0 0 8px;font-size:13.5px;line-height:1.6">全真模考提供标准限时交卷、CBT 答题卡与防漏答强校验。</p><p class="lv-hint" style="text-align:left;line-height:1.55">当前题库仅有 <b>${questions.length}</b> 题，至少需要 3-5 道试题才能组建完整模拟卷。<br/>点击「确定」仍打开考场；点击「取消」前往出题录题。</p>`,
          });
          if (!proceed) {
            switchView("manual");
            return;
          }
        }
        showMessage("正在打开全真模拟考场… ✓", 2600, "info");
        plugin.openMock?.();
        return;
      }
      if (target === "report") {
        const attemptCount = app?.attempts?.all?.()?.length ?? 0;
        if (attemptCount === 0) {
          const { confirmDialogSync } = await import("../../libs/dialog");
          const proceed = await confirmDialogSync({
            title: "学情复盘报告使用说明",
            content: `<p style="margin:0 0 8px;font-size:13.5px;line-height:1.6">学情复盘中心提供三维度学情诊断、四象限薄弱考点雷达与连续自律趋势大屏。</p><p class="lv-hint" style="text-align:left;line-height:1.55">检测到您当前尚未产生作答记录。<br/>在「今日」完成日常练习或参加一次模考后，系统将自动基于您的真实作答证据演算出专属复盘大屏！<br/>点击「确定」仍打开报告中心；点击「取消」前往今日练习。</p>`,
          });
          if (!proceed) {
            switchView("entry");
            return;
          }
        }
        showMessage("正在打开学情诊断与复盘报告中心… ✓", 2600, "info");
        plugin.openReport?.();
        return;
      }
      const res = resolveTaskNavigation(target, () => { plugin.openMock?.(); }, () => { plugin.openReport?.(); });
      if (res.nextView) {
        switchView(res.nextView);
        if (res.nextView === "entry" || res.nextView === "browse") void loadQuestions();
      }
    }

    /** 47-02 lite：首用引导（有题库 + 零作答记录 + 未跳过时显示；产生首个作答后自动消失） */
    let onboardingDismissed = $state(readLocal("lv-exam-onboarded") === "1");
    const onboarding = $derived(
      hasBank && questionsLoaded && questions.some((q) => q.type !== "material") && !onboardingDismissed && view === "entry" && !!app && app.attempts.all().length === 0,
    );

    /** 会话启动失败可见化（47-06 lite）：单活动冲突/离线等不再静默吞掉。
     *  40-05 活动会话协商：冲突时提供「放弃当前并新开」（旧会话有 checkpoint，可恢复） */
    async function negotiateStart(qs: Question[], mode: string, bankId = activeBankId): Promise<boolean> {
      sessionSeed = sessionSeed || randomSeedId(); // 65-05：调用方可预置（快速刷题抽题与卷序同种子）
      const { confirmDialogSync } = await import("../../libs/dialog");
      const res = await executeNegotiateSessionStart({
        app,
        questions: qs,
        mode,
        bankId,
        interleave: materialInterleave,
        seed: sessionSeed,
        confirmDialogSync,
        t,
      });
      if (res.session) {
        session = res.session;
        syncSessionScratchpad(res.session);
        trails.clear();
        answerStart = Date.now();
        return true;
      }
      if (res.error) {
        errorMsg = offline ? t("state.offlineHint") : res.error;
        showMessage(errorMsg, 4200, "error");
      }
      return false;
    }

    async function safeStart(qs: Question[], mode: string, follow: () => void): Promise<boolean> {
      if (!(await negotiateStart(qs, mode))) return false;
      follow();
      restoreQuestionControls();
      return true;
    }

    /** 其他板块移交的题目集：题目 ID 与题库 ID 必须成对校验，防止会话写入错误题库。 */
    let externalStartBusy = $state(false);
    async function startExternalPractice(qids: string[], targetBankId?: string) {
      if (externalStartBusy) return;
      const bankId = String(targetBankId ?? "");
      if (!bankId || !banks.some((b) => b.id === bankId)) {
        errorMsg = t("query.bankMissing");
        loading = false;
        showMessage(errorMsg, 4200, "error");
        return;
      }
      externalStartBusy = true;
      try {
        // 先在局部读取目标库；只有用户确认并成功启动后才切换 UI 当前库。
        // 这样冲突对话框取消时不会让现有会话与顶部题库选择器错位。
        const all = (bankId === activeBankId ? await loadQuestions() : await app.listQuestions(bankId)) as typeof questions;
        if (bankId === activeBankId && questionsError) throw new Error(questionsError);
        const { picked, missingNotice, emptyNotice } = resolveExternalTargetQuestions(all, qids, t);
        if (missingNotice) showMessage(missingNotice, 3600, "info");
        if (!picked.length) {
          if (emptyNotice) showMessage(emptyNotice, 3200, "info");
          loading = false;
          return;
        }
        // 其他板块可能先创建了会话再发事件（例如模考复盘/报告行动重练）。
        // 复用同一活动会话，让已挂载的练习台接管它，而不是再次弹出冲突对话框。
        const existing = app.currentSession();
        const pickedIds = new Set(picked.map((q) => q.id));
        const existingIds = existing?.phase === "running" ? new Set(existing.state.qids) : null;
        if (existing && existing.phase === "running" && existing.state.bankId === bankId && existingIds && existingIds.size === pickedIds.size && [...pickedIds].every((id) => existingIds.has(id))) {
          session = existing;
          syncSessionScratchpad(existing);
          answerStart = Date.now();
        } else if (!(await negotiateStart(groupAdjacent(picked), "query", bankId))) return;
        activeBankId = bankId;
        rememberBank(bankId);
        questions = all;
        questionsLoaded = true;
        questionsError = "";
        sectionSel = null;
        sectionTree = [];
        rebuildQrefView();
        rebuildPlan();
        enterSessionView();
        restoreQuestionControls();
      } catch (e) {
        errorMsg = offline ? t("state.offlineHint") : String(e instanceof Error ? e.message : e);
        showMessage(errorMsg, 4200, "error");
      } finally {
        externalStartBusy = false;
        loading = false;
      }
    }

    async function startDrill(mode: string) {
      errorMsg = "";
      sessionSeed = randomSeedId();
      const qs = await loadQuestions();
      if (questionsError) {
        errorMsg = questionsError;
        showMessage(t("entry.loadError"), 2800, "error");
        return;
      }
      let dueFirst: Question[] = [];
      if (mode === "daily") {
        try {
          dueFirst = await app.dueQuestions(bankName, qs.filter((q) => q.type !== "material"));
        } catch {
          dueFirst = [];
        }
      }
      const res = pickDrillQuestions({
        app,
        questions: qs,
        mode,
        sessionSeed,
        dailyGoal: Number(plugin.settingUtils?.get?.("dailyGoal") ?? 10),
        quickAvoidDays: Number(plugin.settingUtils?.get?.("quickAvoidDays") ?? 3),
        dueFirst,
      });
      if (res.info) { showMessage(t(res.info, res.info), 2800, "info"); return; }
      if (res.error) { errorMsg = t(res.error, res.error); return; }
      if (!res.picked.length) return;

      await safeStart(groupAdjacent(res.picked), mode, () => {
        enterSessionView();
        restoreQuestionControls();
      });
    }

    /** 错题本行级重练：单题会话（与 open-question 总线同路径，mode=wrong） */
    async function startWrongFor(qid: string) {
      errorMsg = "";
      const all = questions.length ? questions : await loadQuestions();
      const q = pickSingleWrongQuestion(all, qid);
      if (!q) { showMessage(t("query.empty"), 3200, "info"); return; }
      await safeStart(groupAdjacent([q]), "wrong", () => {
        enterSessionView();
      });
    }

    /** 举一反三（中公杀招，PRD §4）：按考点推荐同考点变式题练习 */
    async function startSameKpFor(qid: string) {
      errorMsg = "";
      const all = questions.length ? questions : await loadQuestions();
      const related = pickSameKpQuestions(all, qid);
      if (!related.length) { showMessage(t("state.noSameKp"), 2800, "info"); return; }
      await safeStart(groupAdjacent(related), "same-kp", () => {
        enterSessionView();
      });
    }

    async function startFilteredFocusDrill() {
      if (!shownQuestions.length) return;
      const qs = shownQuestions.filter((q) => q.type !== "material");
      if (!qs.length) {
        showMessage("当前筛选题目中无可用练习题", 2500, "info");
        return;
      }
      await safeStart(groupAdjacent(qs), "quick", () => {
        enterSessionView();
        restoreQuestionControls();
        showMessage(`已开启当前筛选专项目标特训（共 ${qs.length} 题）`, 3000, "info");
      });
    }

    async function startFilteredWrongDrill() {
      if (!filteredWrongQueue.length) { showMessage(t("wrongbook.noFiltered"), 2600, "info"); return; }
      const all = await loadQuestions();
      const qs = resolveFilteredWrongDrillQuestions(all, filteredWrongQueue);
      if (!qs.length) return;
      await safeStart(qs, "wrong", () => enterSessionView());
    }

    async function startCbmDrill(kind: "highrisk" | "fragile") {
      const targetList = kind === "highrisk" ? cbmHighrisk : cbmFragile;
      if (!targetList.length) return;
      const all = questions.length ? questions : await loadQuestions();
      const qs = resolveFilteredWrongDrillQuestions(all, targetList);
      if (!qs.length) return;
      await safeStart(qs, "wrong", () => enterSessionView());
    }

    async function startCustomDrill(qids: string[]) {
      if (!qids.length) return;
      const all = questions.length ? questions : await loadQuestions();
      const qs = all.filter((q) => qids.includes(q.id));
      if (!qs.length) return;
      await safeStart(qs, "wrong", () => enterSessionView());
    }

    let wrongBusyId = $state("");
    /** 错题手动处置（已掌握）：确认后写入；失败时保留队列项并允许重试 */
    async function masterWrong(qid: string) {
      if (wrongBusyId || !app) return;
      wrongBusyId = qid;
      try {
        const question = questionMap.get(qid);
        const { confirmDialogSync } = await import("../../libs/dialog");
        const confirmed = await executeMasterSingleWrongWithConfirm({
          app,
          qid,
          stem: escapeHtml(question?.stem.slice(0, 100) ?? qid),
          confirmFn: confirmDialogSync,
          showMessage,
          t,
          offline,
        });
        if (confirmed) {
          dataRev++;
          if (soundEnabled) playCelebrationChord();
        }
      } finally { wrongBusyId = ""; }
    }

    let bulkMasterBusy = $state(false);
    /** 全部标为已掌握（批量处置）：逐题调用同 API，带确认 */
    async function masterAllWrong() {
      if (bulkMasterBusy || !wrongList.length) return;
      const { confirmDialogSync } = await import("../../libs/dialog");
      bulkMasterBusy = true;
      try {
        const res = await executeMasterAllWrongWithConfirm(app, wrongList, confirmDialogSync, showMessage, t);
        if (res.confirmed) dataRev++;
      } finally { bulkMasterBusy = false; }
    }

    // ---------- 收藏（exam-fav；E 键 + 星标 + 过滤） ----------
    let favBusy = $state(false);
    async function toggleFavQuestion(q: (Question & { blockId?: string; fav?: boolean }) | undefined) {
      if (!q || !app || favBusy) return;
      favBusy = true;
      try {
        const nextFav = await toggleQuestionFavorite(app, q, showMessage, offline, t);
        questions = questions.map((item) => (item.id === q.id ? { ...item, fav: nextFav } : item));
        dataRev++;
      } catch {
        /* 错误已由 toggleQuestionFavorite 经 showMessage 提示，此处吸收避免未捕获 Promise 拒绝 */
      } finally { favBusy = false; }
    }
    const toggleFavCurrent = () => toggleFavQuestion(session?.current as (Question & { blockId?: string; fav?: boolean }) | undefined);

    /** 共用题干：材料组母卡（同组材料的题干作为上下文渲染） */
    const materialContext = $derived.by(() => {
      const q = view === "session" ? session?.current : null;
      if (!q?.group) return "";
      const mat = materialByGroup.get(q.group);
      return mat?.stem ?? "";
    });

    /** 43-03 材料组上下文与兄弟题导航快照 */
    const groupContext = $derived.by(() => {
      if (view !== "session" || !session) return null;
      void sessionRev;
      return buildMaterialGroupContext({
        currentQ: session.current,
        bankQuestions: questions,
        sessionQids: session.state.qids,
        sessionAnswered: session.state.answered,
        currentSessionCursor: session.state.cursor,
      });
    });

    /** 43-03 点击兄弟题药丸一键跳转到卷面对应题目 */
    function jumpToSibling(sib: SiblingItem) {
      if (!session || sib.sessionCursor === undefined) return;
      if (session.jumpTo(sib.sessionCursor)) {
        clearReciteSubmitTimer();
        resetSessionViewState();
        answerStart = Date.now();
        hideOptions = false;
        recallDraft = "";
        leakPending = null;
        restoreQuestionControls();
        sessionRev++;
      }
    }

    /** 长材料折叠（TODO 12 组）：>500 字默认折叠，切题重置；展开后完整可读 */
    let materialExpanded = $state(false);

    /** 共用题干：材料组母卡（背诵视图） */    const reciteMaterial = $derived.by(() => {
      const q = reciteQueue[reciteCursor];
      if (!q?.group) return "";
      const mat = materialByGroup.get(q.group);
      return mat?.stem ?? "";
    });

    /** 备考计划（v0.5）：读取设置考日 → planToday 聚合（冲刺 cram 优先/常规到期优先） */
    // 可练习题过滤在 loadQuestions 后各入口处执行（材料母块只作上下文）

    /** 今日卡片说明：按 planner 结构化口径本地化渲染（plan.reason 为 zh 审计口径，不直接上界面） */
    function planReasonText(p: NonNullable<typeof plan>): string {
      return formatPlanReason(p, t);
    }
    /** 53-01 lite：今日计划分钟预算（与 plan 同步重算） */
    let planTime = $state<import("@/core/timeBudget").TimeEstimate | null>(null);
    /** 53-02 lite：多考期清单（按剩余天数升序；入口页展示全部未来考期 chips） */
    let examProfileList = $state<import("@/core/planner").ExamProfile[]>([]);
    /** 44-05 lite：昨日计划轨迹（缺席连续计数；入口页 chip） */
    let planTrace = $state<import("@/core/planner").PlanTrace | null>(null);

    function rebuildPlan(dueFirst?: Question[]) {
      if (!app) { plan = null; return; }
      const res = buildDailyPlanSchedule({
        app,
        questions,
        examDate: String(plugin.settingUtils?.get?.("examDate") ?? "").trim(),
        sprintDays: Number(plugin.settingUtils?.get?.("sprintDays") ?? 14),
        dailyGoal: Number(plugin.settingUtils?.get?.("dailyGoal") ?? 10),
        examProfilesRaw: String(plugin.settingUtils?.get?.("examProfiles") ?? ""),
        dueFirst,
      });
      plan = res.plan;
      planTime = res.planTime;
      examProfileList = res.examProfileList;

      if (dueFirst === undefined && app.kernelOnline && bankName && practiceQuestions.length > 0) {
        void app
          .dueQuestions(bankName, practiceQuestions)
          .then((due) => {
            if (due?.length) rebuildPlan(due);
          })
          .catch(() => undefined);
      }

      void updateDailyPlanTrace(app, plan.queue.length)
        .then((trace) => { planTrace = trace; })
        .catch((e: unknown) => { showMessage(String(e instanceof Error ? e.message : e), 3600, "error"); });
    }

    /** 每日任务直接使用计划队列（零决策入口） */
    async function startToday() {
      errorMsg = "";
      const qs = (await loadQuestions()).filter((q) => q.type !== "material");
      if (!qs.length) { errorMsg = t("state.emptyBank"); showMessage(t("state.emptyBank"), 2800, "info"); return; }
      // FSRS 到期优先（docs/11 S8：dueFirst 供给；离线/无卡自然为空）
      let due: Question[];
      try { due = await app.dueQuestions(bankName, qs); } catch { due = []; }
      rebuildPlan(due);
      const queue = todayQueueFor(qs, plan?.queue ?? []);
      await safeStart(queue, plan?.mode === "sprint" ? "cram" : "daily", () => {
        enterSessionView();
      });
    }

    // ---------- 背诵（S4 lite） ----------
    /** 跳回源笔记精确位置（iDoRecall 范式 lite：doc zoomIn 到题目块，支持分屏） */
    function jumpToSource(e?: MouseEvent | KeyboardEvent) {
      const q = reciteQueue[reciteCursor] as Question & { blockId?: string; rootId?: string };
      if (q?.rootId) openSiYuanTarget(plugin, q.rootId, q.blockId, showMessage, t, { event: e });
    }
    function persistReciteSnapshot(): Promise<void> {
      return saveReciteSnapshot(app, activeBankId, {
        queue: reciteQueue,
        cursor: reciteCursor,
        revealed: reciteRevealed,
        done: reciteDone,
        hint: reciteHint,
        ratings: reciteRatings,
        sessionId: reciteSessionId,
      }).catch(() => undefined);
    }

    async function startRecite() { void 0;
      const all = (questions.length ? questions : await loadQuestions()).filter((q) => q.type !== "material");
      if (questionsError) {
        errorMsg = questionsError;
        showMessage(t("entry.loadError"), 2800, "error");
        return;
      }
      const groupSize = Number(plugin.settingUtils?.get?.("reciteGroupSize") ?? 15) || 15;
      const s = initReciteSession(app, all, groupSize);
      if (!s) { errorMsg = t("state.emptyBank"); return; }
      reciteQueue = s.queue; reciteCursor = s.cursor; reciteRevealed = s.revealed;
      reciteDone = s.done; reciteHint = s.hint; reciteRatings = s.ratings; reciteSessionId = s.sessionId;
      reciteCardStart = Date.now();
      await persistReciteSnapshot();
      if (view !== "session" && view !== "recite") sessionSourceView = view;
      view = "recite";
      armPracticeExamHistory();
      void tick().then(() => scrollMainToTop());
      if (reciteAutoTts) {
        const payload = getReciteTtsPayload(reciteQueue[0], "stem", ttsSlowRate);
        if (payload) ttsSpeak(payload.text, payload.options);
      }
    }

    function revealRecite() {
      reciteRevealed = true;
      persistReciteSnapshot();
      if (reciteAutoTts) {
        const payload = getReciteTtsPayload(reciteQueue[reciteCursor], "answer", ttsSlowRate);
        if (payload) ttsSpeak(payload.text, payload.options);
      }
    }

    async function rateSelf(rating: 1 | 2 | 3 | 4) {
      if (reciteSaving) return;
      const q = reciteQueue[reciteCursor];
      if (!q) return;
      reciteSaving = true;
      reciteError = "";
      try {
        const elapsedMs = reciteCardStart > 0 ? Math.max(0, Date.now() - reciteCardStart) : 0;
        const res = await executeReciteRating({
          app,
          bankName,
          q: q as Question & { blockId?: string },
          rating,
          sessionId: reciteSessionId,
          guard: reciteGuard,
          timeMs: elapsedMs,
        });
        if (!res) return;
        reciteOutcome = res.outcome;
        const adv = advanceReciteState(reciteCursor, reciteQueue.length, reciteRatings, rating, reciteQueue);
        reciteRatings = adv.ratings;
        reciteHint = adv.hint;
        reciteCursor = adv.nextCursor;
        reciteRevealed = adv.revealed;
        reciteDone = adv.done;
        speechEvalResult = null; speechRecording = false;
        reciteCardStart = Date.now();
        if (adv.done) {
          disarmExamHistory();
          await clearReciteSnapshot(app).catch(() => undefined);
          await app.flush().catch(() => undefined);
          dataRev++;
          rebuildPlan();
          emitExamEvent("session-ended", {
            sessionId: reciteSessionId,
            mode: "recite",
            total: adv.ratings.length,
            correct: adv.ratings.filter((x) => x >= 3).length,
            wrong: adv.ratings.filter((x) => x < 3).length,
          });
          void runCheckinBridge({ id: reciteSessionId, total: adv.ratings.length, correct: adv.ratings.filter((x) => x >= 3).length }).catch((e: unknown) => showMessage(String(e instanceof Error ? e.message : e), 4200, "error"));
        } else {
          await persistReciteSnapshot();
          if (reciteAutoTts && adv.nextQuestion) {
            const payload = getReciteTtsPayload(adv.nextQuestion, "stem", ttsSlowRate);
            if (payload) ttsSpeak(payload.text, payload.options);
          }
        }
      } catch (e) {
        reciteError = String(e instanceof Error ? e.message : e);
        reciteOutcome = null;
      } finally {
        reciteSaving = false;
      }
    }

    async function exitRecite() {
      if (!reciteDone && reciteRatings.length > 0) {
        const { confirmDialogSync } = await import("../../libs/dialog");
        const ok = await confirmDialogSync({
          title: t("recite.exit"),
          content: t("session.exitConfirm"),
        });
        if (!ok) return;
      }
      disarmExamHistory();
      await clearReciteSnapshot(app).catch(() => undefined);
      await app?.flush().catch(() => undefined);
      const fallbackTarget = sessionSourceView && sessionSourceView !== "session" && sessionSourceView !== "recite" ? sessionSourceView : "entry";
      view = fallbackTarget;
      sessionSourceView = "entry";
      reciteQueue = []; reciteRevealed = false; reciteDone = false; reciteHint = 0; reciteRatings = [];
      reciteCardStart = 0;
      reciteGuard.clear(); reciteOutcome = null;
    }

    /** 错题册导出：Markdown 文档写入题库"导出"区（支持考点/错因/时间过滤） */
    let expKp = $state("");
    let expReason = $state("");
    let expDays = $state(0);
    const expKpRoots = $derived(extractKpRoots(questions));

    // ---------- 挑战码（友谊赛复制/导入：含答案，双方本地判分） ----------
    const copyChallengeCode = () => serviceCopyChallengeCode(questions, bankName, showMessage, t);

    async function importChallengeCode() {
      const { inputDialogSync, confirmDialogSync } = await import("../../libs/dialog");
      const code = await inputDialogSync({ title: t("challenge.importTitle"), placeholder: t("challenge.importPlaceholder") });
      if (!code?.trim()) return;
      try {
        if (app.currentSession()?.phase === "running") {
          const ok = await confirmDialogSync({
            title: t("session.conflictTitle"),
            content: t("session.conflictBody"),
          });
          if (!ok) return;
          await app.discardSession();
        }
        session = await parseAndStartChallenge(app, code, activeBankId, t);
        syncSessionScratchpad(session);
        enterSessionView();
        restoreQuestionControls();
      } catch (e) {
        errorMsg = String(e instanceof Error ? e.message : e);
        showMessage(`导入挑战码失败：${errorMsg}`, 4000, "error");
      }
    }

    const exportWrong = () =>
      exportWrongbookToDoc(app, activeBankId, bankName, { kpRoot: expKp || undefined, reason: expReason || undefined, sinceDays: expDays || undefined }, showMessage, offline, t);

    let syncDocsBusy = $state(false);
    function retryForgotRecite() {
      const s = prepareRetryForgotState(reciteQueue, reciteRatings);
      if (!s) return;
      reciteQueue = s.queue;
      reciteCursor = s.cursor;
      reciteRevealed = s.revealed;
      reciteDone = s.done;
      reciteHint = s.hint;
      reciteRatings = s.ratings;
      reciteSessionId = s.sessionId;
      reciteCardStart = Date.now();
      persistReciteSnapshot();
      if (reciteAutoTts) {
        const payload = getReciteTtsPayload(reciteQueue[0], "stem", ttsSlowRate);
        if (payload) ttsSpeak(payload.text, payload.options);
      }
    }

    async function reciteForgotToCard() {
      if (!activeBankId || !app) return;
      const forgot = extractForgotReciteQuestions(reciteQueue, reciteRatings);
      await pushForgotReciteToCards(app, activeBankId, bankName, forgot, showMessage, t);
    }

    async function reciteForgotToActions() {
      if (!app) return;
      const forgot = extractForgotReciteQuestions(reciteQueue, reciteRatings);
      await pushForgotReciteToActions(app, forgot, reciteSessionId, t, showMessage);
    }

    function copyTodayReportMarkdown() {
      return copyTodayStudyReport(
        {
          bankName,
          todayDone,
          dailyGoal: dailyGoalN,
          goalPct,
          streakDays,
          wrongCount: wrongList.length,
          eliminatedCount,
          clearPct,
          planAdvice: plan ? planReasonText(plan) : undefined,
        },
        showMessage,
        t,
      );
    }

    async function syncBankDocs() {
      if (!activeBankId || syncDocsBusy) return;
      syncDocsBusy = true;
      try {
        const res = await syncBankQuestionsToDoc(app, activeBankId, bankName, showMessage, t);
        if (res) lastSyncedDocs = res;
      } finally {
        syncDocsBusy = false;
      }
    }

    async function pasteClipboardToImport() {
      if (importBusy) return;
      const text = await readClipboardImportText(showMessage, t);
      if (text) importText = text;
    }

    let importDragOver = $state(false);
    async function onImportFileDrop(e: DragEvent) {
      e.preventDefault();
      e.stopPropagation();
      importDragOver = false;
      if (importBusy || !e.dataTransfer?.files?.length) return;
      const file = e.dataTransfer.files[0];
      const res = await processImportDrawerDrop(file);
      if (res.kind === "excel") {
        await onExcelFile(inputLike(res.file) as unknown as Event);
      } else if (res.kind === "text") {
        importText = res.text;
        showMessage(t("import.fileLoaded"), 2800, "info");
      } else if (res.kind === "error") {
        showMessage(t(res.messageKey), 3200, "error");
      } else {
        showMessage(t("import.dropUnsupported", t("import.unsupportedDrop")), 3200, "info");
      }
    }

    /** 官方 Excel 模板下载（运行时生成，docs/15 规范） */
    const downloadTemplate = downloadImportTemplate;

    /** 错误清单导出 CSV（Excel 友好，BOM 头） */
    const downloadErrorsCsv = () => exportImportErrorsCsv(importReport);

    // ---------- 题库包分享（.sy.zip 原生格式） ----------
    const exportBank = () => exportBankPackageZip(app, activeBankId, showMessage, offline, t);

    /** 拖拽导入（TODO 18 组）：xlsx/csv → Excel 流程；sy.zip → 题库包导入 */
    function onDrop(e: DragEvent) {
      if (!tabRoot?.getClientRects().length || !tabRoot.contains(e.target as Node) || importBusy || creating) return;
      e.preventDefault();
      const file = e.dataTransfer?.files?.[0];
      if (!file) return;
      const route = resolveGlobalTabDropAction(file.name, file, hasBank);
      if (route.action === "need_bank" || route.action === "unsupported") {
        errorMsg = t(route.errorKey);
      } else if (route.action === "excel") {
        view = "import";
        void onExcelFile(inputLike(route.file) as unknown as Event);
      } else if (route.action === "zip") {
        errorMsg = ""; importError = ""; importResult = null;
        void importBank(inputLike(route.file) as unknown as Event);
      }
    }

    /** 构造伪 input 对象（复用 onExcelFile/importBank 的取文件逻辑） */
    function inputLike(file: File): { target: HTMLInputElement } {
      return makeFileEventProxy(file) as unknown as { target: HTMLInputElement };
    }

    async function importBank(e: Event) {
      const input = e.target as HTMLInputElement;
      const file = input.files?.[0];
      if (!file) return;
      try {
        const res = await importBankFromSyZipFile(app, file, t);
        banks = app.listBanks();
        showMessage(res.message, 4600, "info");
        void loadQuestions();
      } catch (err) {
        showMessage(String(err instanceof Error ? err.message : err), 4200, "error");
      } finally { input.value = ""; }
    }

    // ---------- AI 讲解（v0.4：错题逐选项解释；多轮追问；可存为笔记子块） ----------
    let explainText = $state("");
    let explainBusy = $state(false);
    let explainQid = $state("");
    let explainHistory = $state<Record<string, import("@/ai/client").AiMessage[]>>({});
    /** 多轮历史持久化（27 P3）：保存到插件存储，重载后可继续追问；仅保留最近 10 题 */
    async function persistExplainHistory() {
      await saveExplainConversationHistory(app, explainHistory);
    }

    /** AI 发送记录（U23/41-01 lite）：本地留存实际 payload（信封+消息），供"我发送了什么"审计 */
    async function logAiTask(entry: { templateId: string; qid: string; status: string; tokens: number; messages: import("@/ai/client").AiMessage[] }) {
      await recordAiAuditTask(app, entry);
    }

    let aiTaskLog = $state<AiTaskLogEntry[]>([]);
    async function loadAiTaskLog() {
      aiTaskLog = await loadAiAuditTaskLogs(app);
    }
    let explainFollowUp = $state("");
    let explainSaveBusy = $state(false);
    let explainSavedQid = $state("");
    let explainSaveError = $state("");
    let explainSaveErrorQid = $state("");

    function aiSettings() {
      return {
        endpoint: String(plugin.settingUtils?.get?.("aiEndpoint") ?? ""),
        apiKey: resolveAiKey(plugin),
        model: String(plugin.settingUtils?.get?.("aiModel") ?? "gpt-4o-mini"),
      };
    }

    async function explainCurrent(mode: "explain" | "hint" | "socratic" | "dual-loop" | "storm" = "explain") {
      const q = session?.current;
      if (!q || explainBusy || !feedback) return;
      explainSavedQid = ""; explainSaveError = ""; explainSaveErrorQid = "";
      if (!app.kernelOnline) { explainText = t("state.offlineHint"); return; }
      explainBusy = true; explainText = ""; explainQid = q.id;
      try {
        const res = await executeAiExplain({
          q,
          mode,
          learnerAnswer: feedback.myAnswer,
          sessionId: session?.id ?? "",
          client: app.deps.client,
          aiConfig: aiSettings(),
        });
        void logAiTask({ templateId: res.env.templateId, qid: res.reqCtx.qid, status: res.env.status, tokens: res.env.tokens, messages: res.messages });
        if (res.env.status === "ok" && res.env.data.text) {
          explainText = res.env.data.text;
          explainHistory[q.id] = [...res.messages, { role: "assistant", content: res.env.data.text }];
          void persistExplainHistory().catch((e: unknown) => { explainSaveError = String(e instanceof Error ? e.message : e); });
          void app.recordAiUsage(res.ch.id, res.env.tokens, 1).catch(() => undefined);
          helpShown.set(q.id, mode === "dual-loop" || mode === "storm" ? "explain" : mode);
        } else {
          explainText = formatEnvStatusLine(res.env, t);
        }
      } catch (e) {
        explainText = String(e instanceof Error ? e.message : e);
      } finally { explainBusy = false; }
    }

    function hintButtonLabel(q: { id: string; options: string[] }): string {
      void sessionRev;
      return getHintButtonLabel(session?.getHintState(q.id).level ?? 0, q.options.length, t);
    }

    /** 114-01 一次一层提示：提交前后均可逐层申请；≤2 选项题型 L2 后转正式揭示；泄露守卫拦截疑似泄题层 */
    async function requestHint() {
      const q = session?.current;
      if (!q || !session || explainBusy) return;
      explainSavedQid = ""; explainSaveError = ""; explainSaveErrorQid = "";
      explainQid = q.id; leakPending = null;
      if (!app.kernelOnline) { explainText = t("state.offlineHint"); return; }
      explainBusy = true; explainText = "";
      const submitted = !!feedback;
      const hintState = session.getHintState(q.id);
      const shown = hintState.level;
      const shownTexts = hintState.texts;

      try {
        const res = await executeAiHint({
          q,
          learnerAnswer: feedback?.myAnswer ?? session.getDraft(q.id) ?? null,
          submitted,
          sessionId: session.id,
          shownLevel: shown,
          shownTexts,
          client: app.deps.client,
          aiConfig: aiSettings(),
        });

        if (res.kind === "reveal") {
          explainText = t("explain.hintReveal");
          return;
        }

        void logAiTask({ templateId: res.env.templateId, qid: res.reqCtx.qid, status: res.env.status, tokens: res.env.tokens, messages: res.messages });

        if (res.env.status === "ok" && res.env.data.text) {
          if (!submitted && res.leakReasons) {
            leakPending = { level: res.step.level, text: res.env.data.text, reasons: res.leakReasons };
            return;
          }
          const updatedTexts = [...shownTexts, res.env.data.text];
          session.setHintState(q.id, res.step.level, updatedTexts);
          explainText = formatHintLayersDisplay(updatedTexts, t);
          helpShown.set(q.id, "hint");
          void app.recordAiUsage(res.ch.id, res.env.tokens, 1).catch(() => undefined);
        } else {
          explainText = formatEnvStatusLine(res.env, t);
        }
      } catch (e) {
        explainText = String(e instanceof Error ? e.message : e);
      } finally { explainBusy = false; }
    }

    /** 泄露守卫：用户明确选择查看 → 记为受助-揭示（help=reveal），层级照常推进 */
    function viewLeakedHint() {
      const q = session?.current;
      if (!q || !session || !leakPending) return;
      const hintLevels = new Map<string, 0 | 1 | 2 | 3>([[q.id, session.getHintState(q.id).level]]);
      const hintTexts = new Map<string, string[]>([[q.id, session.getHintState(q.id).texts]]);
      const res = applyLeakedHintToState(q.id, leakPending, hintLevels, hintTexts, t);
      session.setHintState(q.id, hintLevels.get(q.id) ?? leakPending.level, hintTexts.get(q.id) ?? []);
      explainText = res.explainText;
      helpShown.set(q.id, res.helpMode);
      leakPending = null;
    }

    async function sendFollowUp() {
      const q = session?.current;
      if (q) addExposure(q.id, "followup");
      const history = explainHistory[q?.id ?? ""];
      if (!q || !history?.length || explainBusy || !explainFollowUp.trim()) return;
      explainSavedQid = ""; explainSaveError = ""; explainSaveErrorQid = "";
      explainBusy = true;

      try {
        const prompt = explainFollowUp.trim();
        const res = await executeAiFollowUpWorkflow({
          q,
          learnerAnswer: feedback?.myAnswer ?? null,
          submitted: !!feedback,
          sessionId: session?.id ?? "",
          history,
          prompt,
          client: app.deps.client,
          aiConfig: aiSettings(),
          currentExplainText: explainText,
          t,
        });
        if (res.env) {
          void logAiTask({ templateId: res.env.templateId, qid: q.id, status: res.env.status, tokens: res.env.tokens, messages: history });
        }
        if (res.reply && res.updatedMessages && res.newExplainText) {
          explainHistory[q.id] = res.updatedMessages;
          void persistExplainHistory().catch((e: unknown) => { explainSaveError = String(e instanceof Error ? e.message : e); });
          explainText = res.newExplainText;
          explainFollowUp = "";
          if (res.chId && res.tokens) void app.recordAiUsage(res.chId, res.tokens, 1).catch(() => undefined);
        } else if (res.error) {
          explainText = res.error;
        }
      } catch (e) {
        explainText = String(e instanceof Error ? e.message : e);
      } finally { explainBusy = false; }
    }

    // ---------- 纯听题 lite（TTS + 遮罩） ----------
    let pureListen = $state(false);
    /** 背题模式（华图杀招，PRD §3）：开着时每题自动展示答案与解析，跳过提交判分，适合考前突击。localStorage 持久化 */
    let reciteToggle = $state(loadReciteModeSetting(readLocal));
    let reciteSubmitTimer: ReturnType<typeof setTimeout> | null = null;
    function clearReciteSubmitTimer() {
      if (speedTimer) { clearTimeout(speedTimer); speedTimer = null; }
      if (reciteSubmitTimer) clearTimeout(reciteSubmitTimer);
      reciteSubmitTimer = null;
    }
    function scheduleReciteSubmit() {
      clearReciteSubmitTimer();
      const targetSession = session;
      const targetQuestionId = targetSession?.current?.id;
      const targetCursor = targetSession?.state?.cursor;
      if (!canScheduleReciteSubmit({
        view, session, targetSession, targetQuestionId, targetCursor,
        reciteToggle, hasFeedback: !!feedback, exitBusy,
      })) return;
      reciteSubmitTimer = setTimeout(() => {
        reciteSubmitTimer = null;
        if (!canScheduleReciteSubmit({
          view, session, targetSession, targetQuestionId, targetCursor,
          reciteToggle, hasFeedback: !!feedback, exitBusy,
        })) return;
        submitAnswer();
      }, 50);
    }
    $effect(() => {
      if (view !== "session") clearReciteSubmitTimer();
    });
    function toggleRecite() {
      reciteToggle = !reciteToggle;
      saveReciteModeSetting(writeLocal, reciteToggle);
      if (reciteToggle && !feedback) scheduleReciteSubmit();
      else clearReciteSubmitTimer();
    }
    function togglePureListen() {
      const q = session?.current;
      if (!q) return;
      pureListen = !pureListen;
      if (pureListen) ttsSpeak(buildQuestionTtsText(q));
      else ttsStop();
    }
    /** 纯听题完整态：切题时自动朗读新题 */
    $effect(() => {
      const q = view === "session" ? session?.current : null;
      if (q && pureListen) ttsSpeak(buildQuestionTtsText(q));
    });

    async function saveExplain() {
      const q = session?.current;
      const body = explainText;
      const qid = explainQid;
      if (!q || q.id !== qid || !body.trim() || explainSaveBusy || explainSavedQid === qid) return;
      explainSaveBusy = true;
      explainSaveError = ""; explainSaveErrorQid = qid;
      try {
        const res = await saveExplainToQuestionDoc(app, q, body, showMessage, t);
        if (res.success) {
          explainSavedQid = qid;
          explainSaveErrorQid = "";
        } else if (res.error) {
          explainSaveError = res.error;
        }
      } finally { explainSaveBusy = false; }
    }

    // ---------- 转卡 ----------
    let cardResult = $state("");
    async function toCard() {
      if (!session?.current) return;
      cardResult = "…";
      const res = await convertSingleQuestionToCard(app, activeBankId, bankName, session.current, t);
      cardResult = res.isError && offline ? t("state.offlineHint") : res.resultText;
    }

    // ---------- 举一反三 ----------
    async function sameKpSession() {
      const all = await loadQuestions();
      const res = pickSameKpDrillQuestions(app, all, session, 10);
      if (res.errorKey) { errorMsg = t(res.errorKey); return; }
      await safeStart(res.questions, "special", () => {
        enterSessionView();
      });
    }

    // ---------- 薄弱标签特训（benchmark-fusion，Kangaroo 标杆）----------
    let weakDrillBusy = $state(false);
    /** 「立即针对薄弱点再练 10 题」：会话内正确率 < 60% 的考点根标签 →
     *  历史错题优先 → 未做新题补充 → 已做对兜底（sampleWeakSpotDrill 三层抽样），10 题成卷。 */
    async function weakSpotDrill() {
      if (weakDrillBusy || !app) return;
      const roots = rankWeakTags(kpBreakdown).map((r) => r.root);
      if (!roots.length) { showMessage(t("weakspot.none", "本次没有正确率低于 60% 的薄弱标签"), 2600, "info"); return; }
      weakDrillBusy = true;
      try {
        const all = await loadQuestions();
        const derived = app.derived();
        const wrongQids = new Set(
          [...derived.wrongbook.values()].filter((w) => w.status === "active").map((w) => w.qid),
        );
        const attemptedQids = new Set(derived.byQuestion.keys());
        const picked = sampleWeakSpotDrill({ bank: all, weakRoots: roots, wrongQids, attemptedQids, count: 10 });
        if (!picked.length) {
          showMessage(t("weakspot.empty", "薄弱标签下暂无可练题目（当前题库无对应考点题）"), 3400, "error");
          return;
        }
        lvLaunchpad.haptic(10);
        await safeStart(picked, "special", () => {
          enterSessionView();
        });
      } finally {
        weakDrillBusy = false;
      }
    }

    let resumeBusy = $state(false);
    async function resume() {
      if (resumeBusy) return;
      resumeBusy = true;
      resumeError = "";
      try {
        const res = await executeSessionResume(app, loadQuestions, activeBankId);
        if (res.session) {
          session = res.session;
          syncSessionScratchpad(res.session);
          if (res.sessionDone) sessionDone = res.sessionDone;
          enterSessionView();
          sessionRev++;
          restoreQuestionControls();
          answerStart = Date.now(); // 首题计时基线（否则 qElapsedS 从 0 基线算出纪元秒）
          if (res.missingCount) showMessage(t("resume.missing").replace("{n}", String(res.missingCount)), 4200, "info");
        }
      } catch (e) {
        resumeError = offline ? t("state.offlineHint") : String(e instanceof Error ? e.message : e);
        showMessage(resumeError, 4200, "error");
      } finally {
        resumeBusy = false;
      }
    }

    // ---------- 打卡桥（48-03 lite）：结算自动同步 + 待重试持久化 + 重载补写 ----------
    let checkinStatus = $state<import("@/core/checkinBridge").CheckinSyncStatus | null>(null);
    let checkinNote = $state("");
    const checkinSettings = () => extractCheckinSettingsFromPlugin(plugin);
    async function runCheckinBridge(completed?: { id: string; total: number; correct: number }) {
      const { syncSessionCheckin } = await import("./services/sessionCheckinService");
      const res = await syncSessionCheckin(app, checkinSettings(), completed, window);
      checkinStatus = res.status;
      checkinNote = res.note;
      if (res.status === "synced") await loadCheckinStreak();
    }
    async function retryCheckinPending() {
      await runCheckinBridge();
    }
    /** 48-04 lite：打卡→考试只读投影——桥开启时读取连续天数（只读、失败安静、不自算 streak） */
    let checkinStreak = $state<number | null>(null);
    async function loadCheckinStreak() {
      checkinStreak = await queryCheckinStreak(checkinSettings(), window);
    }

    /** 44-01：结算页错题回看展开态 */
    let reviewOpen = $state(false);
    /** 52-02 lite：先回忆模式（按题开关，切题重置）；recallDraft 与作答草稿分离、不入正式答案 */
    let hideOptions = $state(false);
    let recallDraft = $state("");
    /** 52-04 lite：自诊断复盘缓存（qid → {text, at}；结算页回看与编辑） */
    let reflections = $state<Record<string, { text: string; at: number }>>({});

    async function editReflection(qid: string) {
      const res = await editQuestionReflection(app, qid, t);
      if (res === null) return;
      reflections = updateReflectionMapState(reflections, qid, res);
      showMessage(t("reflection.saved"), 2400, "info");
    }

    $effect(() => {
      if (view !== "wrongbook" || !app) return;
      const wList = wrongList;
      if (!wList.length) return;
      void (async () => {
        const next: Record<string, { text: string; at: number }> = { ...reflections };
        let changed = false;
        for (const w of wList) {
          if (w.qid in next) continue;
          const r = await app.loadWrongReflection(w.qid).catch(() => null);
          if (r?.text) {
            next[w.qid] = r;
            changed = true;
          }
        }
        if (changed) reflections = next;
      })();
    });

    /** 打开回看时批量载入上次检查点（52-04：复习能回看） */
    async function loadReflections() {
      reflections = await loadSessionReflections(
        app,
        session?.answered ?? [],
        (qid) => !!helpShown.get(qid),
      );
    }

    // ---------- AI 错因假设（116-01 T08：事实→假设→验证行动；假设与用户复盘独立，采纳由用户操作） ----------
    let misdiagnosisBusy = $state("");
    let misdiagnosisText = $state<Record<string, string>>({});

    /** 本次会话该题最近一次作答的 confidence/help（流水口径；无记录=缺证据，模板如实标注） */
    function attemptMeta(qid: string): { confidence?: "sure" | "fuzzy" | "guess"; helped?: boolean } {
      return queryAttemptMeta(app, session?.id ?? "", qid);
    }

    async function runMisdiagnosis(a: { qid: string; grade: { myAnswer: string | null }; timeMs: number }) {
      const q = questionMap.get(a.qid);
      if (!q || misdiagnosisBusy || !session) return;
      if (!app.kernelOnline) { showMessage(t("state.offlineHint"), 2400, "info"); return; }
      misdiagnosisBusy = a.qid;
      try {
        const meta = attemptMeta(a.qid);
        const res = await executeMisdiagnosisWorkflow({
          app,
          q,
          myAnswer: a.grade.myAnswer ?? null,
          timeMs: a.timeMs,
          sessionId: session.id,
          meta,
          userThought: reflections[a.qid]?.text,
          aiConfig: aiSettings(),
          t,
        });

        if (res.text) {
          misdiagnosisText = { ...misdiagnosisText, [a.qid]: res.text };
        } else if (res.error) {
          showMessage(res.error, 3600, "error");
        }
      } catch (e) {
        showMessage(String(e instanceof Error ? e.message : e), 3600, "error");
      } finally { misdiagnosisBusy = ""; }
    }

    /** 采纳：把假设并入用户复盘，显式标注「AI 参考（未确认）」——用户标签与 AI 假设独立 */
    async function adoptMisdiagnosis(qid: string) {
      const hypothesis = misdiagnosisText[qid];
      if (!hypothesis) return;
      const res = await mergeAdoptedMisdiagnosis(app, qid, hypothesis, t, showMessage);
      reflections = { ...reflections, [qid]: res };
    }
    /** 114-01 / 63-02：本会话受助与暴露事实统一收纳进 SessionState，重载后完整保留 */
    function addExposure(qid: string, node: string, persist = true) {
      if (!session || !qid || !node) return;
      session.addExposure(qid, node);
      sessionRev++;
      if (persist) void app?.saveSession().catch(() => undefined);
    }
    const helpShown = {
      set(qid: string, mode: "explain" | "hint" | "socratic" | "reveal") { addExposure(qid, mode); },
      get(qid: string) { void sessionRev; return session?.helpModeOf(qid); },
    };
    /** 114-01 泄露守卫拦截的待决提示（提交前）：用户明确揭示才展示（G6） */
    let leakPending = $state<{ level: 1 | 2 | 3; text: string; reasons: string } | null>(null);
    let speedTimer: ReturnType<typeof setTimeout> | null = null;
    let autoNextOnCorrect = $state(readLocal("lv-exam/auto-next") === "1");
    let autoNextPending = $state(false);
    let autoNextRemainingS = $state(3.5);
    let autoNextInterval: ReturnType<typeof setInterval> | null = null;
    let autoNextTimer: ReturnType<typeof setTimeout> | null = null;
    let shuffleOptions = $state(readLocal("lv-exam/shuffle-options") === "1");

    function clearAutoNext() {
      if (speedTimer) { clearTimeout(speedTimer); speedTimer = null; }
      if (autoNextTimer) { clearTimeout(autoNextTimer); autoNextTimer = null; }
      if (autoNextInterval) { clearInterval(autoNextInterval); autoNextInterval = null; }
      autoNextPending = false;
      autoNextRemainingS = 3.5;
    }

    function pickPracticeChoice(value: string) {
      const q = session?.current;
      if (!q || feedback) return;
      selected = toggleChoice(q.type, selected, value);
      session.setDraft(q.id, selected);
      trailInput(q.id, selected);
      scheduleDebouncedDraftSave();

      // 答对自动翻题 (FLOW-01) 与极速刷题：单选或判断题选定后自动提交判分
      if ((speedDrillEnabled || autoNextOnCorrect) && (q.type === "single" || q.type === "judge") && selected) {
        submitAnswer();
      }
    }

    async function toggleUserTag(tag: string) {
      const q = session?.current;
      if (!q) return;
      try {
        const userTags = await toggleQuestionUserTag(app, q, tag);
        if (userTags) {
          q.userTags = userTags;
          sessionRev++;
        }
      } catch (e) {
        showMessage(String(e instanceof Error ? e.message : e), 3000, "error");
      }
    }

    function restoreQuestionControls() {
      const q = session?.current;
      const restored = resolveQuestionRestorationState(session, q, !!q && isChoiceQuestion(q));
      feedback = restored.feedback;
      selected = restored.selected;
      draftLive = restored.draftLive;
      confidenceSel = ""; materialExpanded = false; answerStart = Date.now();
      hideOptions = false; recallDraft = ""; leakPending = null;
      speechEvalResult = null; speechRecording = false;
      resetRubricDraft(); // 55-05：切题/恢复不沿用上一题的自评选择
    }
    /** 55-05：重置当前题的自评 UI 草稿（选择与备注），不动已记录存档 */
    function resetRubricDraft() {
      rubricRatings = {};
      rubricNotes = {};
      rubricSaved = false;
      rubricEvalResult = null;
    }
    let lastSubmitAt = 0;
    let lastNextAt = 0;
    function submitAnswer() {
      clearReciteSubmitTimer();
      clearAutoNext();
      if (!session || feedback) return;
      const q = session.current;
      if (!q) return;

      // 📖 考前背题速记模式 (FLOW-02)：直接揭示参考答案与解析，不判错、不污染统计与错题本
      if (reciteToggle && !selected && !session.getDraft(q.id)) {
        feedback = { verdict: "recite", myAnswer: q.answer };
        lastSubmitAt = Date.now();
        if (q.analysis) addExposure(q.id, "analysis", false);
        sessionRev++;
        return;
      }

      const timeMs = Date.now() - answerStart;
      // 选择题/判断用 selected；填空/简答用 draft
      const ans = isChoiceQuestion(q) ? selected : session.getDraft(q.id);
      if (hideOptions) session.markRecalled(q.id); // 未揭示就提交也算先回忆作答（52-02 可追溯）
      const r = session.submit(ans || null, timeMs);
      if (!r) {
        nextQuestion();
        return;
      }
      const g = r.grade;
      if (q.analysis) addExposure(q.id, "analysis", false); // 63-02：反馈态必然展示解析（布尔事实）
      const qExposures = session.getExposures(q.id);
      recordSessionAttempt({
        app,
        session,
        q,
        submitResult: r,
        timeMs,
        confidenceSel,
        helpMode: session.helpModeOf(q.id),
        isRecalled: session.isRecalled(q.id),
        exposures: qExposures.length ? qExposures : undefined,
        trail: trails.get(q.id),
      });
      void app.saveSession().catch(() => undefined);
      scheduleDebouncedDraftSave();
      if (feedbackMode === "end") {
        // 44-01：会话末复盘——作答事件完全一致，仅对错不在逐题显示，结算页统一回看
        showMessage(t("session.recordedSilent"), 1500, "info");
        nextQuestion();
        return;
      }
      if (feedbackMode === "group") {
        // 44-01：小组延迟复盘——每 5 题统一展示小组小结卡片，平时提交静默前进
        const doneCount = (session.state.answered ?? []).length;
        if (isGroupBatchBoundary(doneCount, DEFAULT_GROUP_FEEDBACK_SIZE)) {
          groupBatchModal = calculateGroupBatchSummary(session.state.answered ?? [], groupBatchStart, doneCount);
          groupBatchStart = doneCount + 1;
          sessionRev++;
          return;
        }
        showMessage(t("session.recordedGroup"), 1200, "info");
        nextQuestion();
        return;
      }
      feedback = { verdict: g.verdict, myAnswer: g.myAnswer };
      lastSubmitAt = Date.now();
      if (g.verdict === "correct") {
        if (soundEnabled) playSuccessChime();
        // ⚡ 答对自动翻题：给出倒计时供考生扫读考点与核心解析，期间可立即翻题或停留看解析
        if ((autoNextOnCorrect || speedDrillEnabled) && !session.isDelayedReviewAtCurrent() && !reciteToggle) {
          clearAutoNext();
          autoNextPending = true;
          autoNextRemainingS = speedDrillEnabled ? 1.5 : 3.5;
          const startMs = Date.now();
          const totalMs = autoNextRemainingS * 1000;
          autoNextInterval = setInterval(() => {
            const elapsed = Date.now() - startMs;
            const remaining = Math.max(0, (totalMs - elapsed) / 1000);
            autoNextRemainingS = Math.round(remaining * 10) / 10;
            if (remaining <= 0) {
              clearAutoNext();
              nextQuestion();
            }
          }, 100);
        }
      } else {
        clearAutoNext();
      }
      sessionRev++; // 类实例非响应式：提交后推进读数
    }

    function nextQuestion() {
      const now = Date.now();
      if (now - lastNextAt < 80) return;
      lastNextAt = now;
      clearReciteSubmitTimer();
      clearAutoNext();
      feedback = null; selected = ""; draftLive = ""; confidenceSel = ""; materialExpanded = false; answerStart = Date.now();
      hideOptions = false; recallDraft = ""; leakPending = null; // 52-02：切题重置先回忆态（揭示/草稿不沿用上一题，U02 口径）；114-01 泄露待决随之作废
      if (!session.next()) { void finishSession(); return; }
      restoreQuestionControls();
      sessionRev++; // 类实例非响应式：切题后刷新题面
      scrollMainToTop();
      void app.saveSession().catch(() => undefined);   // 游标推进随答随存
      scheduleDebouncedDraftSave();
      if (reciteToggle) scheduleReciteSubmit(); // 背题模式：切题后自动揭示答案
    }

    /** 键盘 K 回到上一题：PracticeSession 是类实例，游标变化后必须推进响应式镜像。 */
    function previousQuestion() {
      clearReciteSubmitTimer();
      clearAutoNext();
      if (!session?.prev()) return;
      restoreQuestionControls();
      sessionRev++;
      scrollMainToTop();
      if (reciteToggle && !feedback) scheduleReciteSubmit(); // 背题模式：切题后自动揭示答案
    }

    async function finishSession() {
      clearReciteSubmitTimer();
      const res = await executeSessionFinish(app, session, questions, window);
      sessionDone = res.summary;
      disarmExamHistory();
      settleMode = res.settleMode;
      rebuildPlan();

      // 同一会话只上报一次增量；队列持久化后才投递，重试复用原身份。
      if (session) void runCheckinBridge({ id: session.id, total: sessionDone.total, correct: sessionDone.correct })
        .catch((e: unknown) => showMessage(String(e instanceof Error ? e.message : e), 4200, "error"));

      // Epoch 7：交卷与结算成绩单重点提醒卡片（支持得分查看与【查看错题本】直达）
      if (sessionDone) {
        notifyPracticeFinishCard({
          bankName: bankName || "专项练习",
          total: sessionDone.total,
          correct: sessionDone.correct,
          wrong: sessionDone.wrong,
          onViewWrongbook: () => {
            view = "wrongbook";
          },
          onReviewWrongs: () => {
            void startFilteredWrongDrill();
          },
        });

        // 广播今日全生态活动主干流 (Epoch 7 Phase 3: lvActivity)
        lvActivity.record({
          source: "考试",
          category: "exam",
          title: `完成《${bankName || "专项练习"}》结算 (正确: ${sessionDone.correct}/${sessionDone.total})`,
          detail: `正确率 ${Math.round((sessionDone.correct / sessionDone.total) * 100)}% · 发现错题 ${sessionDone.wrong} 道`,
        });
      }
    }

    const syncWrongbookToCards = () =>
      pushWrongsToCards(app, activeBankId, bankName, questions.filter((q) => filteredWrongQueue.some((w) => w.qid === q.id)), hasCardsPlugin, showMessage);

    const syncSingleWrongToCard = (qid: string) =>
      pushSingleWrongToCard(app, activeBankId, bankName, questions.find((q) => q.id === qid), hasCardsPlugin, showMessage);

    /** 44-09 撤销作答：在反馈态下撤回刚才误触的提交，恢复原草稿并安全回滚作答流水 */
    async function undoRecentSubmit() {
      if (!session || !app) return;
      const res = executeUndoLastAttempt(session, app);
      if (!res.undone) return;
      clearReciteSubmitTimer();
      feedback = null;
      const q = session.current;
      if (q) {
        if (isChoiceQuestion(q)) selected = res.restoredAnswer ?? "";
        else draftLive = res.restoredAnswer ?? "";
        restoreQuestionControls();
      }
      sessionRev++;
      await app.saveSession().catch(() => undefined);
      await app.flush().catch(() => undefined);
      showMessage(t("session.undoDone"), 2400, "info");
    }

    /** 结算页错题批量转卡（LeetFlash 零成本化）：一次点击入 FSRS 队列（按块幂等，重复转卡自动跳过） */
    async function wrongsToCard() {
      if (!session || !activeBankId) return;
      const wrongQs = extractSessionWrongQuestions(session, questionMap);
      await pushWrongsToCards(app, activeBankId, bankName, wrongQs, true, showMessage);
    }

    // ---------- 下一行动（U15 lite）：结算页错题加入持久化行动（去重） ----------
    let actionBusy = $state(false);
    let actionNote = $state("");

    async function wrongsToActions() {
      if (!session || actionBusy) return;
      actionBusy = true; actionNote = "";
      try {
        const wrongQs = session.answered.filter((a) => a.grade.verdict === "wrong");
        const r = await pushSessionWrongsToActions(app, wrongQs, questionMap, session.id, t);
        actionNote = t("action.added").replace("{n}", String(r.added)).replace("{d}", String(r.skipped));
      } catch (e) {
        actionNote = String(e instanceof Error ? e.message : e);
      } finally { actionBusy = false; }
    }

    async function exitSession() {
      clearReciteSubmitTimer();
      if (exitBusy) return;
      if (!session) { view = "entry"; return; }
      exitBusy = true;
      try {
        const { confirmDialogSync } = await import("../../libs/dialog");
        const ok = await executeSessionExit(app, session, session.exposureMap(), !!sessionDone, confirmDialogSync, t);
        if (!ok) return;
        disarmExamHistory();
        session = null;
        resetSessionViewState();
        groupBatchModal = null; groupBatchStart = 1;
        scratchpadOpen = false; scratchpadStore = {}; scratchpadShared = "";
        const fallbackTarget = sessionSourceView && sessionSourceView !== "session" && sessionSourceView !== "recite" ? sessionSourceView : "entry";
        view = fallbackTarget;
        sessionSourceView = "entry";
        if (fallbackTarget === "wrongbook") {
          void loadQuestions();
        }
      } catch (e) {
        showMessage(offline ? t("state.offlineHint") : String(e instanceof Error ? e.message : e), 4200, "error");
      } finally {
        exitBusy = false;
      }
    }

    // ---------- 手工录题（S10 表单） ----------
    let mType = $state<"single" | "multiple" | "judge" | "fill" | "short">("single");
    let mStem = $state("");
    let mOptions = $state<string[]>(["", ""]);
    let mAnswer = $state("");        // single/multiple: 字母；judge: 对/错；fill/short: 文本
    let mAnalysis = $state("");
    let mExpansion = $state("");
    let mKp = $state("");
    let mSecondaryKps = $state("");
    let mPrerequisites = $state("");
    let mSource = $state("");
    let mSourceBlockId = $state("");
    let mGroup = $state("");
    /** 图片遮挡填图可视化编辑器开关（遮挡题创作唯一入口；引擎/渲染/打印已在 core 就绪） */
    let occlusionOpen = $state(false);
    let occlusionBusy = $state(false);
    /** 54-02 作者设置：数值判分规格（填空题型显示；留空=自动识别/exact 口径） */
    let mSpecOpen = $state(false);
    let mSpecUnit = $state("");
    let mSpecAbsTol = $state("");
    let mSpecRelPct = $state("");
    let mSpecAltUnits = $state("");
    let mSpecOrderIndependent = $state(false);
    /** 55-05 作者设置：主观采分点（简答题显示；每行 `描述 | 权重 | 参考要点`） */
    let mRubricOpen = $state(false);
    let mRubricText = $state("");
    let mRubricRevision = $state(1);
    /** 43-01 题目作者生命周期状态 (draft/review/published) */
    let mStatus = $state<QuestionLifecycleStatus>("published");
    let mStudyLang = $state<string>("zh-CN");
    let mStudyPhonetic = $state("");
    let mFamily = $state<Question["family"]>(undefined);
    let mSaving = $state(false);
    let mSaved = $state("");
    let manualErrorMsg = $state("");
    let manualErrorField = $state("");

    function clearManualValidation() {
      manualErrorMsg = "";
      manualErrorField = "";
    }

    function setCorrectOption(i: number) {
      mAnswer = updateCorrectOptionIndex(mAnswer, i, mType === "multiple");
    }

    let manualSymbolTab = $state<"math" | "pinyin" | "phonetic">("math");
    function insertMathSnippet(snippet: string) {
      mStem = (mStem ? mStem + " " : "") + snippet;
      clearManualValidation();
    }

    let ocrModalOpen = $state(false);
    let ocrInputText = $state("");

    function openOcrModal() {
      ocrInputText = "";
      ocrModalOpen = true;
    }

    function applyOcrForm(form: import("./services/manualOcrService").OcrFormResult) {
      mType = form.type;
      mStem = form.stem;
      mOptions = form.options;
      mAnswer = form.answer;
      if (form.analysis) mAnalysis = form.analysis;
      if (form.kp) mKp = form.kp;
      ocrModalOpen = false;
      clearManualValidation();
    }

    function applyOcrFill() {
      const parsed = parseOcrFormResult(ocrInputText);
      if (!parsed) return;
      applyOcrForm(parsed);
      showMessage(t("manual.ocrDone"), 3000, "info");
    }

    let ocrUploadBusy = $state(false);

    async function handleOcrImageFile(file: File | Blob) {
      if (ocrUploadBusy || !app) return;
      ocrUploadBusy = true;
      try {
        showMessage(t("manual.ocrUploading"), 3500, "info");
        const res = await processOcrImageUpload(app, file, t);
        if (res.form) applyOcrForm(res.form);
        showMessage(res.message, res.isError ? 4000 : 3000, res.isError ? "error" : "info");
      } finally {
        ocrUploadBusy = false;
      }
    }

    function onFileInputChange(e: Event) {
      const input = e.target as HTMLInputElement;
      const file = input.files?.[0];
      if (file) {
        void handleOcrImageFile(file);
      }
      input.value = "";
    }

    function onManualPaste(e: ClipboardEvent) {
      const file = findImageInClipboard(e);
      if (file) {
        e.preventDefault();
        void handleOcrImageFile(file);
      }
    }

    let printWrongBusy = $state(false);
    let cheatSheetBusy = $state(false);

    async function launchWrongbookMockExam() {
      if (!filteredWrongQueue.length || !app) return;
      await assembleAndLaunchWrongMock(app, activeBankId, (bp) => { plugin.openMock?.(bp); }, showMessage, t);
    }

    async function exportCheatSheet() {
      if (cheatSheetBusy || !app) return;
      cheatSheetBusy = true;
      try {
        await executeBankExportAction("cheat_sheet", app, activeBankId, bankName, showMessage);
      } finally {
        cheatSheetBusy = false;
      }
    }

    async function startQuickPractice(targetQuestions: Question[], toastMessage?: string) {
      await safeStart(targetQuestions, "quick", () => {
        enterSessionView();
        restoreQuestionControls();
        if (toastMessage) showMessage(toastMessage, 3000, "info");
      });
    }

    async function drillVariantFor(q: Question) {
      await executeDrillVariantWorkflow({
        app,
        q,
        showMessage,
        startPractice: (qs, toast) => startQuickPractice(qs, toast),
      });
    }

    async function traceMotherQuestion(target: Question) {
      await executeMotherQuestionWorkflow({
        app,
        target,
        showMessage,
        startPractice: (qs, toast) => startQuickPractice(qs, toast),
      });
    }

    function handleDiagnosePrereqs(q: Question) {
      if (!q || !app) return;
      const wrongIds = new Set(app.wrongItems().map((w) => w.qid));
      const attemptsList = (app.attempts?.all?.() ?? []).map((e) => ({
        questionId: e.qid,
        correct: e.verdict === "correct",
      }));
      diagnosisModal = diagnoseQuestionRootCauses(q, questions, attemptsList, wrongIds);
    }

    async function printWrongSheet(type: "question" | "answer" | "retest" | "interactive") {
      if (printWrongBusy || !activeBankId || !filteredWrongQueue.length) return;
      printWrongBusy = true;
      try {
        await servicePrintWrongSheet({
          type,
          activeBankId,
          bankName,
          wrongQids: filteredWrongQueue.map((w) => w.qid),
          allQuestions: questions,
          showMessage,
        });
      } finally {
        printWrongBusy = false;
      }
    }

    function normalizeManualFormulas() {
      const res = normalizeDraftFormulas(mStem, mOptions, mAnalysis);
      mStem = res.stem;
      mOptions = res.options;
      mAnalysis = res.analysis;
      showMessage(t("manual.formulaDone"), 2500, "info");
    }

    async function switchManualType(nextType: typeof mType) {
      const { confirmDialogSync } = await import("../../libs/dialog");
      const res = await executeSwitchManualTypeWithConfirm({
        currentType: mType,
        nextType,
        stem: mStem,
        options: mOptions,
        answer: mAnswer,
        analysis: mAnalysis,
        confirmDialogSync,
        t,
      });
      if (!res.confirmed || !res.cleanState) return;
      mType = nextType;
      const clean = res.cleanState;
      mAnswer = clean.answer;
      mOptions = clean.options;
      mSpecOpen = clean.specOpen;
      mSpecUnit = clean.specUnit;
      mSpecAbsTol = clean.specAbsTol;
      mSpecRelPct = clean.specRelPct;
      mSpecAltUnits = clean.specAltUnits;
      clearManualValidation();
    }

    // ---------- 录题草稿保护（45-06 lite）：输入防抖自动保存 → 重载/切视图恢复 → 提交成功清理 ----------
    let draftRestored = $state(false);
    let pinAttributes = $state(readLocal("lv-exam/pin-attributes") === "1");
    let draftTimer: ReturnType<typeof setTimeout> | null = null;
    $effect(() => {
      // 读取全部草稿字段建立依赖；防抖 800ms 落盘（切视图/崩溃后可恢复）
      const snap = createManualDraftSnapshot({
        type: mType, stem: mStem, options: mOptions, answer: mAnswer,
        analysis: mAnalysis, kp: mKp, secondaryKps: mSecondaryKps, prerequisites: mPrerequisites, source: mSource, group: mGroup,
        specOpen: mSpecOpen, specUnit: mSpecUnit, specAbsTol: mSpecAbsTol, specRelPct: mSpecRelPct, specAltUnits: mSpecAltUnits,
        orderIndependent: mSpecOrderIndependent,
        rubricOpen: mRubricOpen, rubricText: mRubricText,
        studyLang: mStudyLang, studyPhonetic: mStudyPhonetic, status: mStatus, family: mFamily,
      });
      if (draftTimer) clearTimeout(draftTimer);
      if (!snap.stem.trim() && !snap.answer.trim() && !snap.analysis.trim()) return; // 空草稿不写
      draftTimer = setTimeout(() => {
        void saveManualDraftAux(app, snap);
      }, 800);
      return () => { if (draftTimer) clearTimeout(draftTimer); };
    });

    /** 55-05：录题时的采分点预览（解析失败为 null，界面如实提示而非假装成功） */
    const authorRubricPreview = $derived(
      mType === "short" && mRubricOpen && mRubricText.trim() ? parseRubricFromText(mRubricText, 0, mRubricRevision) : null,
    );

    function currentManualFormData(statusToSave?: QuestionLifecycleStatus) {
      const form = assembleManualFormData({
        type: mType, stem: mStem, options: mOptions, answer: mAnswer,
        analysis: mAnalysis, expansion: mExpansion, kp: mKp, secondaryKps: mSecondaryKps, prerequisites: mPrerequisites, source: mSource, group: mGroup, status: mStatus,
        specOpen: mSpecOpen, specUnit: mSpecUnit, specAbsTol: mSpecAbsTol, specRelPct: mSpecRelPct, specAltUnits: mSpecAltUnits,
        orderIndependent: mSpecOrderIndependent,
        rubricOpen: mRubricOpen, rubricText: mRubricText, studyLang: mStudyLang, studyPhonetic: mStudyPhonetic,
        family: mFamily,
      }, statusToSave);
      if (mSourceBlockId) {
        form.sourceBlockId = mSourceBlockId;
      }
      return form;
    }

    async function saveManual(targetStatus?: QuestionLifecycleStatus) {
      const statusToSave = targetStatus ?? mStatus;
      if (mSaving || !mStem.trim()) return;
      if (statusToSave === "published" && !mAnswer.trim() && mType !== "short") return;
      const targetBankId = activeBankId;
      const formData = currentManualFormData(statusToSave);
      const signature = JSON.stringify(formData);
      mSaving = true; mSaved = ""; errorMsg = ""; clearManualValidation();
      try {
        const res = await processAndSaveManualQuestion(app, targetBankId, formData, mRubricRevision);

        if (!res.success) {
          manualErrorMsg = res.errorMsg || "";
          manualErrorField = res.errorField || "";
          await tick();
          document.querySelector<HTMLElement>(`[data-manual-field="${manualErrorField}"]`)?.focus();
          return;
        }

        mSaved = res.question!.id;
        showMessage(statusToSave === "draft" ? "试题已成功保存为草稿 ✓" : "试题已成功入库 ✓", 2800, "info");
        if (signature === JSON.stringify(currentManualFormData(statusToSave))) {
          if (pinAttributes) {
            // 📌 属性锁定 (AUTH-01)：保留当前题型、考点、出处与标签，只清空题干、选项、答案与解析并聚焦首行
            mStem = "";
            mOptions = mType === "single" || mType === "multiple" ? ["", ""] : [];
            mAnswer = "";
            mAnalysis = "";
            mExpansion = "";
            clearManualValidation();
            void clearManualDraftAux(app);
            await tick();
            document.getElementById("lv-manual-stem")?.focus();
          } else {
            clearManualFormWithoutConfirm();
          }
        }
        await refreshQuestionsAfterWrite(questions.length + 1);
      } catch (e) {
        errorMsg = offline ? t("state.offlineHint") : String(e instanceof Error ? e.message : e);
      } finally { mSaving = false; }
    }

    function clearManualFormWithoutConfirm() {
      const b = createBlankManualFormState();
      mStem = b.stem; mOptions = b.options; mAnswer = b.answer; mAnalysis = b.analysis;
      mExpansion = "";
      mSecondaryKps = "";
      mPrerequisites = "";
      mSpecOpen = b.specOpen; mSpecUnit = b.specUnit; mSpecAbsTol = b.specAbsTol; mSpecRelPct = b.specRelPct; mSpecAltUnits = b.specAltUnits;
      mSpecOrderIndependent = false;
      mRubricOpen = b.rubricOpen; mRubricText = b.rubricText; mRubricRevision = b.rubricRevision;
      mStudyLang = b.studyLang; mStudyPhonetic = b.studyPhonetic;
      mStatus = b.status;
      mFamily = undefined;
      mSourceBlockId = "";
      draftRestored = false;
      clearManualValidation();
      void clearManualDraftAux(app);
    }

    /** 遮挡编辑器裂变题入库：逐题写当前题库，失败题逐条回传不中断（40-03 写入容错口径） */
    async function saveOcclusionQuestions(generated: import("@/core/types").Question[]) {
      if (occlusionBusy || !generated.length) return;
      occlusionBusy = true;
      const targetBankId = activeBankId;
      const failed: string[] = [];
      try {
        for (const q of generated) {
          try {
            await app.writeManualQuestion(targetBankId, q);
          } catch {
            failed.push(q.stem.split("\n")[0]?.slice(0, 24) || q.id);
          }
        }
        const okCount = generated.length - failed.length;
        if (okCount > 0) {
          showMessage(`遮挡填图题已入库 ${okCount} 道（同族联动）✓`, 3200, "info");
          await refreshQuestionsAfterWrite(questions.length + okCount);
        }
        if (failed.length) {
          showMessage(`${failed.length} 道写入失败：${failed.join("；")}`, 5200, "error");
        }
      } finally {
        occlusionBusy = false;
      }
    }

    async function blankManualDraft() {
      const isDirty = Boolean(mStem.trim() || mAnswer.trim() || mAnalysis.trim());
      if (isDirty) {
        const ok = await confirmDialogSync({
          title: "清空并录入新题",
          content: "当前表单中有正在编辑的试题内容，清空后将无法找回。确定要换一道新题吗？",
        });
        if (!ok) return;
      }
      clearManualFormWithoutConfirm();
      showMessage("已准备好空白录题表单", 2000, "info");
    }

    // ---------- AI 出题（v0.4：双通道 + 待审核队列，Inbox 式永不直接入库） ----------
    let aiSource = $state("");
    let aiSourceOrigin = $state("");
    let aiSourceBlockId = $state("");
    /** 60-01 lite：拾遗桥可用性（apiVersion===1 才显示入口） */
    const gleanAvailable = $derived(!!probeGlean(window));
    let gleanBusy = $state(false);
    let gleanError = $state("");
    let gleanErrorAction = $state<"load" | "mark">("load");
    /** 60-01 写方向：本次出题所用素材（生成成功后可一键标记已读） */
    let gleanPendingDone = $state<GleanClip[]>([]);
    let gleanDoneBusy = $state(false);
    let gleanDoneNote = $state("");
    async function importGleanClips() {
      if (gleanBusy) return;
      gleanBusy = true;
      gleanError = "";
      try {
        const res = await fetchGleanClips(window, 10, showMessage, t);
        if (res.error) { gleanError = res.error; return; }
        if (res.sourceBlock) {
          aiSource = aiSource.trim() ? `${aiSource.trim()}\n\n${res.sourceBlock}` : res.sourceBlock;
          aiSourceOrigin = "";
          gleanPendingDone = res.clips;
        }
      } catch (e) {
        gleanErrorAction = "load";
        gleanError = t("ai.gleanLoadFailed").replace("{message}", String(e instanceof Error ? e.message : e));
      } finally { gleanBusy = false; }
    }
    /** 60-01 写方向：逐篇 setClipStatus(done)；拾遗侧写开关未开/失败如实计数，不伪造成功 */
    async function markGleanDone() {
      if (gleanDoneBusy || !gleanPendingDone.length) return;
      gleanDoneBusy = true;
      gleanError = "";
      try {
        const res = await batchMarkGleanClipsDone(window, gleanPendingDone, showMessage, t);
        if (res.error) {
          gleanErrorAction = "mark";
          gleanError = res.error;
          return;
        }
        gleanDoneNote = res.note;
        if (res.okCount === gleanPendingDone.length) gleanPendingDone = [];
      } catch (e) {
        gleanErrorAction = "mark";
        gleanError = t("ai.gleanMarkFailed").replace("{message}", String(e instanceof Error ? e.message : e));
      } finally { gleanDoneBusy = false; }
    }
    let aiCount = $state(5);
    let aiDifficulty = $state<"easy" | "medium" | "hard" | "mixed">("mixed");
    let aiKp = $state("");
    let aiQuote = $state("");
    const aiCustomEndpointSet = $derived(!!String(plugin.settingUtils?.get?.("aiEndpoint") ?? "").trim() && !!resolveAiKey(plugin));
    let aiBusy = $state(false);
    let aiCancel = $state({ aborted: false });
    let aiQuality = $state<"standard" | "economy">("standard");
    let aiCost = $state("");
    let aiCustomHint = $state("");
    let aiError = $state("");
    let aiPreparing = $state(false);
    let aiBatchBusy = $state(false);
    let aiQueueOptions = $state<import("@/ai/gen").GenOptions | null>(null);
    function snapshotAiOptions(): import("@/ai/gen").GenOptions {
      return buildGenOptionsSnapshot({
        count: aiCount,
        difficulty: aiDifficulty,
        kp: aiKp,
        sourceTitle: t("ai.pastedMaterial"),
        preset: aiPreset,
        quality: aiQuality,
        pluginCustomHint: String(plugin.settingUtils?.get?.("aiCustomHint") ?? ""),
        userCustomHint: aiCustomHint,
        locator: aiQuote.trim() ? { quote: aiQuote.trim() } : undefined,
      });
    }
    let aiPreset = $state<keyof typeof import("@/ai/gen").PROMPT_PRESETS>("default");
    let aiQueue = $state<Question[]>([]);
    let aiRejected = $state<{ index: number; reason: string }[]>([]);
    let aiDuplicates = $state(0);
    let aiSaved = $state(0);
    /** 累计 AI 用量（app.aiUsage；本地统计，生成后刷新） */
    let aiUsageTotal = $state<{ totalTokens: number; totalCalls: number } | null>(null);
    $effect(() => {
      const currentApp = app;
      if (!currentApp) {
        aiUsageTotal = null;
        return;
      }
      void currentApp.aiUsage()
        .then((u: { totalTokens: number; totalCalls: number }) => (aiUsageTotal = u))
        .catch(() => { aiUsageTotal = null; });
    });
    /** 待审核队列持久化（TODO 27 组）：切视图/重载不丢生成结果 */
    async function persistAiQueue() {
      try {
        await persistReviewQueue(app, {
          queue: aiQueue,
          rejected: aiRejected,
          duplicates: aiDuplicates,
          bankId: aiQueueBankId,
          material: aiQueueMaterial,
          options: aiQueueOptions,
        });
      } catch {
        aiError = t("ai.queueSaveFailed");
      }
    }
    async function restoreAiQueue() {
      const v = await restoreReviewQueue(app);
      if (v) {
        aiQueue = v.queue ?? [];
        aiRejected = v.rejected ?? [];
        aiDuplicates = v.duplicates ?? 0;
        aiQueueBankId = v.bankId ?? "";
        aiQueueMaterial = v.material ?? "";
        aiQueueOptions = v.options ?? null;
      }
    }

    async function runAiGenerate() {
      if (aiMutationBusy || !aiSource.trim() || !activeBankId) return;
      const requestBankId = activeBankId;
      const requestMaterial = aiSource;
      const requestOptions = snapshotAiOptions();
      const requestGleanClips = [...gleanPendingDone];
      aiPreparing = true;
      try {
      // 未审旧队列守卫（41-04）：重新生成会替换队列，旧候选需用户显式确认放弃
      const { confirmDialogSync } = await import("../../libs/dialog");
      if (aiQueue.length && !(await confirmDialogSync({
        title: t("ai.regenerate"),
        content: t("ai.regenerateConfirm").replace("{n}", String(aiQueue.length)),
      }))) return;
      // 首次调用数据流确认（26.2 P0）：端点/范围/取消入口（41-06 确认绑定端点）
      const rawEndpoint = String(plugin.settingUtils?.get?.("aiEndpoint") ?? "");
      const consented = await ensureAiEndpointConsent(rawEndpoint, confirmDialogSync, readLocal, writeLocal, t);
      if (!consented) return;
      aiCancel = { aborted: false };
      aiBusy = true; aiError = ""; aiQueue = []; aiRejected = []; aiDuplicates = 0; aiSaved = 0;
      aiQueueBankId = requestBankId; aiQueueMaterial = requestMaterial; aiQueueOptions = requestOptions;
      void persistAiQueue();
      try {
        const r = await executeAiQuestionGeneration({
          client: app.deps.client,
          aiConfig: aiSettings(),
          material: requestMaterial,
          genOptions: requestOptions,
          signal: aiCancel,
        });
        aiCost = `≈${r.approxTokens} tok · ${r.calls} ${t("ai.usageCalls")}`;
        aiQueue = aiSourceBlockId
          ? r.pending.map((q) => ({ ...q, sourceBlockId: q.sourceBlockId || aiSourceBlockId }))
          : r.pending;
        aiRejected = r.rejected; aiDuplicates = r.duplicates;
        gleanPendingDone = requestGleanClips;
        try {
          aiUsageTotal = await recordGenerationUsage(app, r.channelId, r.approxTokens, r.calls);
        } catch {
          showMessage(t("ai.usageSaveFailed"), 4200, "error");
        }
        if (aiCancel.aborted) {
          showMessage(t("ai.cancelled"), 4200, "info");
        }
        void persistAiQueue();
        if (r.pending.length && gleanPendingDone.length) {
          const g = probeGlean(window);
          gleanDoneNote = g ? "" : t("ai.gleanUnavailable");
        }
        if (!r.pending.length && !r.rejected.length) aiError = t("ai.empty");
      } catch (e) {
        aiError = String(e instanceof Error ? e.message : e);
      } finally {
        aiCancel.aborted = false;
        aiBusy = false;
      }
      } finally { aiPreparing = false; }
    }

    function cancelAiGenerate() {
      aiCancel.aborted = true;
      showMessage(t("ai.cancelRequested"), 3000, "info");
    }

    /** 材料源扩展（v1.x）：从当前打开的文档载入（research/28 citation 载体；块引用随 v1.x 深化） */
    async function aiSourceFromCurrentDoc() {
      try {
        const res = await extractAiSourceFromEditor(plugin, app.deps.client, t);
        if (!res) {
          showMessage(t("ai.noCurrentDoc"), 3600, "error");
          return;
        }
        aiSource = res.content;
        aiSourceOrigin = res.sourceOrigin;
        if (!aiKp.trim() && res.suggestedKp) aiKp = res.suggestedKp;
        showMessage(res.toast, 2600, "info");
      } catch (e) {
        showMessage(String(e instanceof Error ? e.message : e), 4200, "error");
      }
    }

    /** 拒绝项重试（AI Inbox 范式"重试"腿）：带否决原因让 AI 修复 → 复检 → 合入待审核 */
    async function retryRejected() {
      if (aiMutationBusy || !aiRejected.length || queueBankMismatch()) return;
      const source = aiQueueMaterial.trim();
      if (!source) { aiError = t("ai.regenNoSource"); return; }
      const rejected = [...aiRejected];
      const requestOptions = { ...(aiQueueOptions ?? snapshotAiOptions()), count: rejected.length };
      aiCancel = { aborted: false };
      aiBusy = true; aiError = "";
      try {
        const r = await executeAiIssueRepair({
          client: app.deps.client,
          aiConfig: aiSettings(),
          rejected: rejected as import("@/ai/gen").GenIssue[],
          source,
          genOptions: requestOptions,
          signal: aiCancel,
        });
        aiCost = `≈${r.approxTokens} tok · ${r.calls} ${t("ai.usageCalls")}`;
        aiQueue = [...aiQueue, ...r.pending];
        aiRejected = r.rejected;
        aiDuplicates += r.duplicates;
        try {
          aiUsageTotal = await recordGenerationUsage(app, r.channelId, r.approxTokens, r.calls);
        } catch {
          showMessage(t("ai.usageSaveFailed"), 4200, "error");
        }
        void persistAiQueue();
        if (aiCancel.aborted) showMessage(t("ai.cancelled"), 4200, "info");
        else if (r.pending.length) showMessage(t("ai.repaired").replace("{n}", String(r.pending.length)), 2600, "info");
      } catch (e) {
        aiError = String(e instanceof Error ? e.message : e);
      } finally {
        aiCancel.aborted = false;
        aiBusy = false;
      }
    }

    // 审批防重入（41-04）：写入在途时同一题不再触发；失败退回队列不丢候选
    const approving = new SvelteSet<string>();
    /** 队列归属题库（41-04 切库不误写）：生成时记录；旧持久化队列无 bankId 则跳过校验 */
    let aiQueueBankId = $state("");

    function queueBankMismatch(): boolean {
      const check = verifyQueueBankMatch(aiQueueBankId, activeBankId, t);
      if (!check.matched && check.errorMessage) {
        showMessage(check.errorMessage, 4600, "error");
        return true;
      }
      return false;
    }

    async function approveAi(q: Question, silent = false) {
      if (aiBusy || aiPreparing || aiRegenBusy || approving.has(q.id) || queueBankMismatch() || !activeBankId) return;
      const targetBankId = aiQueueBankId || activeBankId;
      approving.add(q.id);
      aiQueue = aiQueue.filter((x) => x.id !== q.id);
      try {
        await approveSingleQuestion(app, targetBankId, q);
        aiSaved++;
        await refreshQuestionsAfterWrite(questions.length + 1);
        void persistAiQueue();
      } catch (e) {
        aiQueue = [...aiQueue, q];
        if (!silent) showMessage(offline ? t("state.offlineHint") : String(e instanceof Error ? e.message : e), 4200, "error");
      } finally {
        approving.delete(q.id);
      }
    }

    function dropAi(q: Question) {
      if (aiMutationBusy) return;
      aiQueue = aiQueue.filter((x) => x.id !== q.id);
      void persistAiQueue();
    }

    async function approveAllAi() {
      if (aiMutationBusy || queueBankMismatch() || !activeBankId) return;
      aiBatchBusy = true;
      try {
        const targetBankId = aiQueueBankId || activeBankId;
        const total = aiQueue.length;
        const res = await approveBatchQuestions(app, targetBankId, aiQueue);
        aiSaved += res.approved.length;
        aiQueue = res.failed;
        if (res.approved.length) await refreshQuestionsAfterWrite(questions.length + res.approved.length);
        void persistAiQueue();
        const failed = res.failed.length;
        if (total > 0) {
          showMessage(
            failed ? t("ai.batchPartial").replace("{f}", String(failed)).replace("{t}", String(total)) : t("ai.batchAllOk").replace("{n}", String(total)),
            4600,
            failed ? "error" : "info",
          );
        }
      } finally { aiBatchBusy = false; }
    }

    // ---------- 候选编辑 + 单题重生成（41-04 剩余收口） ----------
    let aiQueueMaterial = $state("");      // 生成时材料快照：单题重生成的输入（随队列持久化）
    let editingAiId = $state("");
    let aiEditDraft = $state<{ stem: string; options: string[]; answer: string; analysis: string } | null>(null);
    let aiEditError = $state("");
    let aiRegenBusy = $state("");
    const aiMutationBusy = $derived(aiBusy || aiPreparing || !!aiRegenBusy || approving.size > 0 || aiBatchBusy);

    function startEditAi(q: Question) {
      if (aiMutationBusy) return;
      editingAiId = q.id;
      aiEditError = "";
      aiEditDraft = createAiCandidateEditDraft(q);
    }

    function cancelEditAi() {
      editingAiId = ""; aiEditDraft = null; aiEditError = "";
    }

    function saveEditAi(q: Question) {
      if (!aiEditDraft) return;
      const res = validateAndApplyCandidateEdit(q, aiEditDraft);
      if (!res.valid || !res.question) {
        aiEditError = res.error || "";
        return;
      }
      aiQueue = aiQueue.map((x) => (x.id === q.id ? res.question! : x));
      cancelEditAi();
      void persistAiQueue();
    }

    /** 单题重生成：用生成时的材料快照按同题型/考点重出 1 题，替换原候选（41-04） */
    async function regenOneAi(q: Question) {
      if (aiMutationBusy || queueBankMismatch()) return;
      if (!aiQueueMaterial.trim()) { showMessage(t("ai.regenNoSource"), 3600, "info"); return; }
      aiCancel = { aborted: false };
      aiRegenBusy = q.id; aiError = "";
      try {
        const r = await executeRegenSingleCandidate({
          client: app.deps.client,
          aiConfig: aiSettings(),
          material: aiQueueMaterial,
          genOptions: aiQueueOptions ?? snapshotAiOptions(),
          targetQuestion: q,
          signal: aiCancel,
        });
        aiCost = `≈${r.approxTokens} tok · ${r.calls} ${t("ai.usageCalls")}`;
        aiUsageTotal = await recordGenerationUsage(app, r.channelId, r.approxTokens, r.calls);
        if (r.newQuestion) {
          aiQueue = aiQueue.map((x) => (x.id === q.id ? r.newQuestion! : x));
          void persistAiQueue();
          showMessage(t("ai.regenDone"), 2800, "info");
        } else {
          aiError = r.rejectReason ?? t("ai.empty");
        }
      } catch (e) {
        aiError = String(e instanceof Error ? e.message : e);
      } finally { aiRegenBusy = ""; }
    }

    // ---------- 导入 ----------
    function onImportStrategyChange() {
      if (importBusy) return;
      if (sheetRowsCache.get(activeSheet)?.length) parseActiveSheet();
      else { importReport = null; importPreviewBankId = ""; importError = t("import.repreview"); }
    }
    async function doParseText() {
      if (importBusy) return;
      importError = ""; importResult = null; retryPool = []; trialConfirmed = []; trialNote = "";
      if (!importText.trim()) { importError = t("import.noInput"); return; }
      const targetBankId = activeBankId;
      importParsing = true; importReport = null; updateResult = null;
      try {
        const trimmed = importText.trim();
        if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
          const { parseQCardsJson } = await import("@/core/qcard");
          const qres = parseQCardsJson(trimmed);
          if (qres.valid && qres.questions.length > 0) {
            importReport = {
              ok: qres.questions,
              errors: [],
              duplicates: 0,
              batch: `batch_${Date.now()}`,
            };
            importPreviewBankId = targetBankId;
            showMessage(`已识别标准 Agent 题卡（QCard），成功载入 ${qres.count} 道试题 ✓`, 3500, "info");
            return;
          }

          // 逆向桥接：支持从小驴闪卡（.lvcards）或集市闪卡包导入试题
          const { parseLvCardsJsonToQuestions } = await import("@/core/lvcardsBridge");
          const lvres = parseLvCardsJsonToQuestions(trimmed);
          if (lvres.valid && lvres.questions.length > 0) {
            importReport = {
              ok: lvres.questions,
              errors: [],
              duplicates: 0,
              batch: `batch_${Date.now()}`,
            };
            importPreviewBankId = targetBankId;
            showMessage(`已识别小驴闪卡包（.lvcards - 《${lvres.deckName || "未命名卡包"}》），成功载入 ${lvres.count} 道试题 ✓`, 3500, "info");
            return;
          }
        }

        // parseText 按内容特征分流（廿五批）：GIFT / TSV(Anki) / Aiken；
        // 并存模式（2.3 重复合并策略 lite）：不回灌已有题 hash → 与题库重复的行照常入库（批内去重仍生效）
        importReport = await parseText(importText, {
          existingHashes: dupeStrategy === "coexist" ? new Set<string>() : new Set(questions.map((q) => q.hash)),
          duplicateStrategy: dupeStrategy,
        });
        importPreviewBankId = targetBankId;
      } catch (e) { importError = String(e); }
      finally { importParsing = false; }
    }

    async function onExcelFile(e: Event) {
      if (importBusy) return;
      importError = ""; importResult = null; importReport = null; retryPool = []; trialConfirmed = []; trialNote = "";
      sheetRowsCache = new Map();
      manualMap = null; mapEditorOpen = false; mapErrors = [];
      const input = e.target as HTMLInputElement;
      const file = input.files?.[0];
      if (!file) return;

      const fileName = file.name.toLowerCase();
      // 1. 如果是纯文本试题文件（.txt / .gift / .aiken / .md / .json / .qcard / .lvcards）：直接读入文本输入框并自动触发解析预览
      if (/\.(txt|gift|aiken|md|text|json|qcard|lvcards)$/i.test(fileName)) {
        input.value = "";
        importParsing = true;
        try {
          const content = await file.text();
          importText = content;
          showMessage(`已成功载入文件《${file.name}》，正在自动解析预览…`, 3000, "info");
          doParseText();
        } catch (err) {
          importError = `文本文件读取失败：${String(err instanceof Error ? err.message : err)}`;
        } finally {
          importParsing = false;
        }
        return;
      }

      // 2. 如果用户选择了 Word 文档 (.docx)：直接零依赖解压提取正文并自动解析出题
      if (/\.docx$/i.test(fileName)) {
        input.value = "";
        importParsing = true;
        try {
          const buf = await file.arrayBuffer();
          const docxText = await extractDocxTextFromBytes(new Uint8Array(buf));
          if (!docxText.trim()) {
            importError = `Word 文档《${file.name}》中未提取到有效段落正文`;
          } else {
            importText = docxText;
            showMessage(`已成功提取 Word 文档《${file.name}》正文文本，正在自动解析试题…`, 3200, "info");
            doParseText();
          }
        } catch (err) {
          importError = `Word 文档提取失败：${String(err instanceof Error ? err.message : err)}`;
        } finally {
          importParsing = false;
        }
        return;
      }

      importParsing = true; updateResult = null;
      try {
        const parsed = await readAndParseWorkbookFile(file, t, showMessage);
        sheetRowsCache = parsed.sheets;
        activeSheet = parsed.activeSheet;
        parseActiveSheet();
      } catch (e) { importError = String(e instanceof Error ? e.message : e); }
      finally { importParsing = false; input.value = ""; }
    }

    let paperOcrBusy = $state(false);

    async function doSegmentPaperText(text: string, sourceName = "纸质扫描试卷") {
      if (!text.trim()) return;
      importParsing = true;
      try {
        const { segmentExamPaper } = await import("@/importer/examSegmenter");
        const result = segmentExamPaper(text, {
          source: sourceName,
          defaultKp: bankName || "纸质试卷",
        });
        if (!result.questions.length) {
          importError = "整卷切题未检测到有效题目，请检查试卷是否有题号（如 1. / 2. / 一、单选）";
          return;
        }
        const { newBatchId } = await import("@/core/ids");
        importReport = {
          batch: newBatchId(),
          ok: result.questions,
          errors: result.warnings.map((w, wi) => ({ row: wi + 1, reason: w, raw: "" })),
          duplicates: 0,
        };
        importResult = null;
        updateResult = null;
        trialConfirmed = [];
        trialNote = "";
        retryPool = [];
        importText = "";
        importSubTab = "standard";
        showMessage(`整卷切题完成！成功识别并缝合 ${result.questions.length} 道试题，请在下方清单校对！`, 4000, "info");
      } catch (err) {
        importError = `整卷切题失败：${String(err instanceof Error ? err.message : err)}`;
      } finally {
        importParsing = false;
      }
    }

    async function handlePaperImageFile(file: File | Blob) {
      if (!app) return;
      paperOcrBusy = true;
      try {
        showMessage("正在上传试卷图片并执行 OCR 文本提取…", 4000, "info");
        const fileName = (file as File).name || "scanned-paper.png";
        const assetPath = await app.deps.client.uploadAsset(file, fileName);
        const ocrData = await app.deps.client.assetOcr(assetPath);
        if (!ocrData?.text?.trim()) {
          showMessage("OCR 未在试卷图片中识别到文字内容，请确保图片清晰且无强烈反光", 4500, "error");
          return;
        }
        await doSegmentPaperText(ocrData.text, fileName);
      } catch (err) {
        showMessage(`试卷 OCR 识别失败：${String(err instanceof Error ? err.message : err)}`, 4000, "error");
      } finally {
        paperOcrBusy = false;
      }
    }

    /** 多 Sheet 支持（TODO 12 组）：读文件时缓存各行，选择工作表重解析 */
    let activeSheet = $state("");
    let sheetRowsCache = $state(new Map<string, string[][]>());

    function parseActiveSheet() {
      if (committing || trialBusy) return;
      importError = "";
      importReport = null; importResult = null; updateResult = null;
      importPreviewBankId = activeBankId;
      // U07：重解析（切映射/切 Sheet）产生全新 qid → 旧试导确认/重试池全部失效；
      // 不清会导致 commitImport 的排除过滤永远不命中 → 已试导确认的行被整批重导（双导入）
      trialConfirmed = []; trialNote = ""; retryPool = [];
      const rows = sheetRowsCache.get(activeSheet);
      if (!rows?.length) { importError = t("import.emptyFile"); return; }
      // 回灌去重（2.3）：与题库已有题比对；并存模式（重合并策略 lite）置空 → 重复行照常入库
      const existing = dupeStrategy === "coexist" ? new Set<string>() : new Set(questions.map((q) => q.hash));
      const saved = savedMappings.find((m) => m.name === selectedMapping);

      const res = parseSheetRowsWithStrategy({
        rows,
        manualMap,
        savedMap: saved?.map,
        dupeStrategy,
        existingHashes: existing,
        t,
      });

      if (res.error) importError = res.error;
      if (res.mismatchFallback) {
        if (manualMap) manualMap = null;
        else if (selectedMapping) selectedMapping = "";
      }
      if (res.needManualEdit) {
        mapAssign = res.initialAssignment ?? emptyAssignment();
        mapErrors = [];
        mapEditorOpen = true;
        return;
      }
      if (res.usedMap) lastMap = res.usedMap;
      if (res.report) importReport = res.report;
    }

    // ---------- 手动列映射（38-02）：自动失败/异名列/乱序表可手动指派列↔字段 ----------
    let mapEditorOpen = $state(false);
    let manualMap = $state<import("../../importer/pipeline").ExcelColumnMap | null>(null);
    let mapAssign = $state<MapAssignment>(emptyAssignment());
    let mapErrors = $state<string[]>([]);
    /** 编辑器字段行（options 槽单独渲染） */
    const MAP_FIELDS: { key: "type" | "stem" | "answer" | "analysis" | "difficulty" | "kp" | "score" | "source"; i18n: string }[] = [
      { key: "type", i18n: "import.f.type" },
      { key: "stem", i18n: "import.f.stem" },
      { key: "answer", i18n: "import.f.answer" },
      { key: "analysis", i18n: "import.f.analysis" },
      { key: "difficulty", i18n: "import.f.difficulty" },
      { key: "kp", i18n: "import.f.kp" },
      { key: "score", i18n: "import.f.score" },
      { key: "source", i18n: "import.f.source" },
    ];

    function toggleMapEditor() {
      if (importBusy) return;
      mapEditorOpen = !mapEditorOpen;
      if (!mapEditorOpen) return;
      mapErrors = [];
      const rows = sheetRowsCache.get(activeSheet);
      const assign = prepareMapAssignment(rows, manualMap, savedMappings, selectedMapping);
      if (assign) mapAssign = assign;
    }

    function applyManualMap() {
      if (importBusy) return;
      const rows = sheetRowsCache.get(activeSheet);
      if (!rows?.length) return;
      const res = validateAndBuildManualMap(mapAssign, rows[0].length);
      if (!res.valid || !res.map) {
        mapErrors = res.errors;
        return;
      }
      manualMap = res.map;
      selectedMapping = ""; // 手动映射与已保存映射互斥
      mapEditorOpen = false;
      parseActiveSheet(); // U07：重解析清 trialConfirmed/retryPool
    }

    // ---------- 学习资料（120-01/02/06 lite）：登记 / 列表 / 最低查看 ----------
    let materialsList = $state<import("../../core/materials").MaterialDoc[]>([]);
    // ExamApp's note store is not Svelte state; keep both visible count badges
    // in an explicit reactive snapshot alongside the rendered note list.
    const materialNoteCounts = new SvelteMap<string, number>();
    // Question↔material links live in ExamApp's non-reactive store too. Keep the
    // material-side link badge in a reactive snapshot so a link/unlink made from
    // the Peek drawer is reflected when the user returns to this workspace.
    const materialQuestionCounts = new SvelteMap<string, number>();
    let materialsBusy = $state(false);
    let materialFileInput = $state<HTMLInputElement | null>(null);
    let materialsNote = $state("");
    let matSubject = $state("");
    let matChapter = $state("");
    let matLink = $state("");
    let matLinkTitle = $state("");
    /** 六七批：资料搜索（标题/科目/章节/位置，大小写不敏感） */
    let materialsSearch = $state("");
    let selectedMaterialId = $state("");
    const materialsFiltered = $derived(filterMaterialsList(materialsList, materialsSearch));
    const selectedMaterial = $derived(materialsFiltered.find((m) => m.id === selectedMaterialId) ?? materialsFiltered[0] ?? null);

    function loadMaterials() {
      materialsList = app.listMaterials();
      materialNoteCounts.clear();
      materialQuestionCounts.clear();
      for (const material of materialsList) {
        refreshMaterialNoteCount(material.id);
        refreshMaterialQuestionCount(material.id);
      }
      if (selectedMaterialId && !materialsList.some((m) => m.id === selectedMaterialId)) selectedMaterialId = "";
      // Keep an already-open notes drawer in sync when returning to the
      // materials view or after a host-side refresh. A removed material must
      // not leave its stale notes rendered under the next selection.
      if (notesOpenId) {
        if (materialsList.some((m) => m.id === notesOpenId)) {
          notesCache = refreshMaterialNoteCount(notesOpenId);
        } else {
          notesOpenId = "";
          notesCache = [];
        }
      }
    }

    async function onMaterialFile(e: Event) {
      const input = e.target as HTMLInputElement;
      const file = input.files?.[0];
      input.value = "";
      if (!file || materialsBusy) return;
      materialsBusy = true; materialsNote = "";
      try {
        const res = await serviceRegisterMaterialFile(app, file, { subject: matSubject, chapter: matChapter }, t);
        loadMaterials();
        if (res.material?.id) {
          selectedMaterialId = res.material.id;
        }
        materialsNote = res.message;
        showMessage(`学习资料《${file.name}》已成功登记入库并选中，可立即带入出题！✓`, 3400, "info");
      } catch (err) {
        const msg = String(err instanceof Error ? err.message : err);
        materialsNote = msg;
        showMessage(`资料上传失败：${msg}`, 4000, "error");
      } finally { materialsBusy = false; }
    }

    async function registerMaterialLink() {
      if (!matLink.trim() || materialsBusy) return;
      materialsBusy = true; materialsNote = "";
      try {
        const res = await serviceRegisterMaterialLinkInput(app, matLink, matLinkTitle, { subject: matSubject, chapter: matChapter }, t);
        loadMaterials();
        matLink = ""; matLinkTitle = "";
        materialsNote = res.message;
      } catch (err) {
        materialsNote = String(err instanceof Error ? err.message : err);
      } finally { materialsBusy = false; }
    }

    /** 120-06 最低查看：assets → 内核静态 URL（浏览器原生看 PDF/播媒体）；link → 经隐私闸打开 */
    /** 73-02 lite：外链隐私闸——link 类素材打开前显示完整目的地，默认不自动请求；
     *  资产类（本地内核静态文件）不受闸。取消时复制链接，可到外部浏览器打开。 */
    async function gatedOpen(url: string, _m?: import("../../core/materials").MaterialDoc): Promise<void> {
      const link = resolveLink(url, window.location.href);
      if (link.disposition === "blocked") return;
      if (link.disposition === "internal") {
        window.open(link.href, "_blank", "noopener,noreferrer");
        return;
      }
      const { confirmDialogSync } = await import("../../libs/dialog");
      const ok = await confirmDialogSync({
        title: t("gate.linkTitle"),
        content:
          "<div style='word-break:break-all;font-size:var(--lv-font-size-meta)'>" +
          escapeHtml(redactUrlForDisplay(link.href)) +
          "</div><p class='lv-hint' style='text-align:left'>" + t("gate.linkDesc") + "</p>",
      });
      if (ok) { window.open(link.href, "_blank", "noopener,noreferrer"); return; }
      try {
        await navigator.clipboard.writeText(link.href);
        showMessage(t("gate.linkCopied"), 2400, "info");
      } catch {
        showMessage("复制链接失败，请手动长按链接复制", 2400, "error");
      }
    }

    /** 73-02：题面富文本链接只能经外链闸打开，避免 {@html} 中的 href 直达网络。 */
    function onRichTextClick(e: MouseEvent): void {
      const target = e.target;
      if (!(target instanceof Element)) return;
      if (!tabRoot?.contains(target)) return;
      const anchor = target.closest("a[href]");
      if (!anchor || !target.closest(".lv-rich")) return;
      const href = anchor.getAttribute("href");
      if (!href) return;
      const link = resolveLink(href, window.location.href);
      if (link.disposition === "internal") return;
      e.preventDefault();
      if (link.disposition === "external") void gatedOpen(link.href);
    }

    function openMaterial(m: import("../../core/materials").MaterialDoc) {
      selectedMaterialId = m.id;
      const url = serviceResolveMaterialLocatedUrl(app, m);
      if (!url) { materialsNote = t("materials.cannotOpen"); return; }
      void gatedOpen(url, m);
    }

    /** R54 原型高级交互：把资料/笔记一键带入手工出题 */
    async function bridgeMaterialToManual(m: import("../../core/materials").MaterialDoc, noteText = "") {
      const b = await serviceBridgeMaterialToManual(app, m, noteText);
      mSource = b.source; if (b.stem) mStem = b.stem;
      view = "manual";
      showMessage(b.toast, 2800, "info");
    }

    /** R54 原型高级交互：把资料/笔记一键带入 AI 材料 */
    async function bridgeMaterialToAi(m: import("../../core/materials").MaterialDoc, noteText = "") {
      const bridged = await serviceBridgeMaterialToAi(app, m, noteText);
      aiSource = bridged.content;
      view = "ai";
      showMessage(bridged.toast, 2800, "info");
    }

    async function removeMaterialEntry(m: import("../../core/materials").MaterialDoc) {
      const { confirmDialogSync } = await import("../../libs/dialog");
      materialsBusy = true; materialsNote = "";
      try {
        const res = await serviceRemoveMaterialWithConfirm(app, m, confirmDialogSync, t);
        if (res.success) {
          loadMaterials();
          if (notesOpenId === m.id) { notesOpenId = ""; notesCache = []; }
          materialsNote = res.message;
        }
      } catch (err) {
        materialsNote = String(err instanceof Error ? err.message : err);
      } finally { materialsBusy = false; }
    }

    // ---------- 资料定位与个人笔记（121-02/03 + 122-02/03 lite） ----------
    let notesOpenId = $state("");
    let notesCache = $state<import("../../core/materialNotes").MaterialNote[]>([]);
    let noteEditingId = $state("");
    let noteText = $state("");
    let notePage = $state("");
    let noteTime = $state("");
    let noteQuote = $state("");
    let noteTags = $state("");
    let noteFormError = $state("");
    let noteBaseline = $state("");
    const noteDrafts = new SvelteMap<string, { editingId: string; text: string; page: string; time: string; quote: string; tags: string; baseline: string }>();
    function currentNoteFormValues() {
      return { editingId: noteEditingId, text: noteText, page: notePage, time: noteTime, quote: noteQuote, tags: noteTags };
    }
    const noteDirty = $derived(isNoteFormDirty(currentNoteFormValues(), noteBaseline));

    function toggleNotes(m: import("../../core/materials").MaterialDoc) {
      if (materialsBusy) return;
      if (notesOpenId) noteDrafts.set(notesOpenId, { ...currentNoteFormValues(), baseline: noteBaseline });
      notesOpenId = notesOpenId === m.id ? "" : m.id;
      if (notesOpenId) {
        refreshNotes(m); resetNoteForm();
        const draft = noteDrafts.get(m.id);
        if (draft) { noteEditingId = draft.editingId; noteText = draft.text; notePage = draft.page; noteTime = draft.time; noteQuote = draft.quote; noteTags = draft.tags; noteBaseline = draft.baseline; }
      }
    }
    function refreshMaterialNoteCount(materialId: string) {
      const notes = app.listMaterialNotes(materialId);
      materialNoteCounts.set(materialId, notes.length);
      return notes;
    }
    function refreshMaterialQuestionCount(materialId: string) {
      const count = app.listQuestionRefs(materialId).length;
      materialQuestionCounts.set(materialId, count);
      return count;
    }
    function refreshNotes(m: import("../../core/materials").MaterialDoc) {
      notesCache = refreshMaterialNoteCount(m.id);
    }
    function resetNoteForm() {
      const b = createBlankNoteFormState();
      noteEditingId = b.editingId; noteText = b.text; notePage = b.page; noteTime = b.time; noteQuote = b.quote; noteTags = b.tags; noteFormError = b.formError;
      noteBaseline = getNoteDraftSignature(currentNoteFormValues());
    }
    async function startEditNote(n: import("../../core/materialNotes").MaterialNote) {
      if (materialsBusy || noteEditingId === n.id) return;
      if (noteDirty) {
        const { confirmDialogSync } = await import("../../libs/dialog");
        if (!(await confirmDialogSync({ title: t("materials.replaceDraftTitle"), content: t("materials.replaceDraftConfirm") }))) return;
      }
      if (materialsBusy) return;
      const v = extractNoteEditValues(n);
      noteEditingId = v.editingId; noteText = v.text; notePage = v.page; noteTime = v.time; noteQuote = v.quote; noteTags = v.tags;
      noteFormError = "";
      noteBaseline = getNoteDraftSignature(currentNoteFormValues());
    }
    async function saveNote(m: import("../../core/materials").MaterialDoc) {
      if (!noteText.trim() || materialsBusy) return;
      const signature = getNoteDraftSignature(currentNoteFormValues());
      noteFormError = ""; materialsBusy = true;
      try {
        const res = await serviceSaveMaterialNoteItem(app, m, {
          editingId: noteEditingId,
          text: noteText,
          page: notePage,
          time: noteTime,
          quote: noteQuote,
          tags: noteTags,
        }, t);
        const savedNotes = refreshMaterialNoteCount(m.id);
        if (notesOpenId === m.id) {
          notesCache = savedNotes;
          if (signature === getNoteDraftSignature(currentNoteFormValues())) { resetNoteForm(); noteDrafts.delete(m.id); }
        }
        materialsNote = res.message;
      } catch (err) {
        noteFormError = String(err instanceof Error ? err.message : err);
      } finally { materialsBusy = false; }
    }
    async function removeNoteEntry(m: import("../../core/materials").MaterialDoc, n: import("../../core/materialNotes").MaterialNote) {
      if (materialsBusy) return;
      const { confirmDialogSync } = await import("../../libs/dialog");
      materialsBusy = true;
      try {
        const res = await serviceRemoveMaterialNoteWithConfirm(app, n, confirmDialogSync, t);
        if (res.success) {
          refreshNotes(m);
          if (noteEditingId === n.id) noteEditingId = "";
        }
      } catch (err) {
        materialsNote = String(err instanceof Error ? err.message : err);
      } finally { materialsBusy = false; }
    }
    /** 定位打开：PDF → #page、媒体 → #t（浏览器原生 seek）；无定位=普通打开 */
    function openMaterialAt(m: import("../../core/materials").MaterialDoc, n: import("../../core/materialNotes").MaterialNote) {
      const url = serviceResolveMaterialLocatedUrl(app, m, n.locator);
      if (!url) { materialsNote = t("materials.cannotOpen"); return; }
      void gatedOpen(url, m);
    }

    // ---------- 映射保存/复用（2.3/38-02） ----------
    let savedMappings = $state<{ name: string; map: import("../../importer/pipeline").ExcelColumnMap }[]>([]);
    let selectedMapping = $state("");
    let lastMap = $state<import("../../importer/pipeline").ExcelColumnMap | null>(null);
    let mappingBusy = $state(false);

    async function loadMappings() {
      savedMappings = await loadExcelMappingsAux(app);
    }

    async function saveMapping() {
      if (!lastMap || mappingBusy) return;
      const { inputDialogSync } = await import("../../libs/dialog");
      const name = (await inputDialogSync({ title: t("import.mappingName"), placeholder: t("import.mappingNameHint") }))?.trim();
      if (!name) return;
      mappingBusy = true;
      try {
        const res = await saveExcelMappingAux(app, savedMappings, name, lastMap, t);
        savedMappings = res.next;
        showMessage(res.message, res.success ? 2400 : 4200, res.success ? "info" : "error");
      } finally { mappingBusy = false; }
    }

    let favOnly = $state(false);
    // 浏览工具「更多」菜单：开启中任一维护面板时按钮出点标；Esc 关闭（ARIA menu 惯例）
    let moreOpen = $state(false);
    let moreRoot = $state<HTMLDivElement | null>(null);
    let morePop = $state<HTMLDivElement | null>(null);
    let moreFocusTimer: ReturnType<typeof setTimeout> | null = null;
    function clearMoreFocusTimer() {
      if (moreFocusTimer) clearTimeout(moreFocusTimer);
      moreFocusTimer = null;
    }
    function onWindowClick(e: MouseEvent) {
      if (moreOpen && isClickOutsideElement(moreRoot, e.target as Node)) moreOpen = false;
    }
    function toggleMore() {
      clearMoreFocusTimer();
      moreOpen = !moreOpen;
      if (moreOpen) {
        const expectedRoot = moreRoot;
        moreFocusTimer = setTimeout(() => {
          moreFocusTimer = null;
          if (moreOpen && expectedRoot?.isConnected && moreRoot === expectedRoot) morePop?.focus();
        }, 0); // 焦点入菜单，Esc/Tab 语义成立
      }
    }
    /** 题库浏览渲染上限（Mobile Spec v1 性能纪律：首屏 ≤50 条） */
    let browseLimit = $state(50);
    let searchText = $state("");
    /** 搜索防抖（体验/perf）：大题库逐键全量过滤掉帧；180ms 尾随，编程赋值走 setSearch 即时生效 */
    let searchDebounced = $state("");
    function setSearch(v: string) {
      searchText = v;
      searchDebounced = v;
    }
    $effect(() => {
      const v = searchText;
      const t = setTimeout(() => { searchDebounced = v; }, 180);
      return () => clearTimeout(t);
    });
    /** 65-01 lite：结构化筛选——题型/来源/仅错题（与搜索词叠加；命中数在工具栏实时可见） */
    let filterType = $state("");
    let filterSource = $state("");
    let filterWrong = $state(false);
    /** 43-01 题目作者生命周期筛选 (draft/review/published/deprecated) */
    let filterStatus = $state("");
    /** 57-04 争议题筛选（多解/缺条件/答案存疑/资料过期） */
    let filterDispute = $state(false);
    /** 三七批补全：仅受助（本题作答前被讲解/提示过）/ 近 N 天有作答（0=不限） */
    let filterHelp = $state(false);
    let filterDays = $state(0);
    let filterUserTag = $state("");
    const sourceOptions = $derived(
      [...new Set(questions.map((q) => (q.source ?? "").trim()).filter(Boolean))].sort().slice(0, 30),
    );
    const filteredQuestions = $derived.by(() => {
      void dataRev; // 错题/受助/近 N 天过滤依赖应用层流水缓存，随总线事件失效（同 wrongList 注）
      return executeBrowseQuestionFilter(questions, {
        favOnly,
        filterOrphanKind,
        orphanDiag,
        filterType,
        filterSource,
        filterWrong,
        filterStatus,
        filterDispute,
        filterHelp,
        filterDays,
        filterUserTag,
        searchDebounced,
        sectionSel,
        attempts: (filterWrong || filterHelp || filterDays > 0) ? app.attempts.all() : [],
        wrongbookMap: filterWrong ? app.derived().wrongbook : null,
      });
    });
    const shownQuestions = $derived(filteredQuestions.slice(0, browseLimit));
    const hasMore = $derived(filteredQuestions.length > browseLimit);

    // ---------- 命名智能视图（43-05 lite）：浏览过滤保存/复用/删除 ----------
    let smartViews = $state<import("@/core/smartViews").SmartView[]>([]);
    let selectedView = $state("");
    let smartViewBusy = $state(false);
    let smartViewError = $state("");
    let smartViewLoadBusy = $state(false);
    let smartViewLoadFailed = $state(false);
    async function loadSmartViews() {
      if (smartViewLoadBusy) return;
      smartViewLoadBusy = true;
      try {
        const res = await loadSmartViewsAux(app, t);
        smartViews = res.views;
        smartViewLoadFailed = res.failed;
        smartViewError = res.error;
      } finally { smartViewLoadBusy = false; }
    }
    /** 当前过滤态 → 视图快照（43-05：过滤条件+题库身份+schema 版本一起存） */
    async function saveCurrentView() {
      if (!activeBankId || smartViewBusy || smartViewLoadBusy || smartViewLoadFailed) return;
      smartViewBusy = true; smartViewError = "";
      try {
        const { inputDialogSync } = await import("../../libs/dialog");
        const res = await executeSaveNamedViewWithPrompt(
          app,
          smartViews,
          activeBankId,
          {
            search: searchText,
            favOnly,
            sectionSel,
            types: filterType === "all" ? undefined : [filterType as any],
            source: filterSource || undefined,
            sourceKind: (filterSource === "real" || filterSource === "mock") ? (filterSource as any) : undefined,
            onlyWrong: filterWrong,
            onlyDisputed: filterDispute,
            lifecycle: filterStatus ? (filterStatus as any) : undefined,
          },
          inputDialogSync,
          t,
        );
        if (res?.savedName) {
          smartViews = res.nextViews;
          selectedView = res.savedName;
          if (res.toast) showMessage(res.toast, 2400, "info");
        } else if (res?.error) {
          smartViewError = res.error;
        }
      } finally { smartViewBusy = false; }
    }
    /** 应用视图：跨库视图显式确认（不静默改变含义）；应用后过滤三件套整体切换 */
    async function applyNamedView(name: string) {
      selectedView = name;
      const v = smartViews.find((x) => x.name === name);
      if (!v) return;
      if (isViewBankMismatched(v, activeBankId)) {
        const { confirmDialogSync } = await import("../../libs/dialog");
        if (!(await confirmDialogSync({ title: t("view.pick"), content: t("view.bankMismatch").replace("{name}", escapeHtml(v.name)) }))) {
          selectedView = "";
          return;
        }
      }
      setSearch(v.search ?? "");
      favOnly = !!v.favOnly;
      sectionSel = v.section ? { ...v.section } : null;
      if (v.types && v.types[0]) filterType = v.types[0];
      filterSource = v.source ?? (v.sourceKind && sourceOptions.includes(v.sourceKind) ? v.sourceKind : "");
      if (v.onlyWrong !== undefined) filterWrong = v.onlyWrong;
      if (v.onlyDisputed !== undefined) filterDispute = v.onlyDisputed;
      if (v.lifecycle) filterStatus = v.lifecycle;
      filterHelp = false;
      filterDays = 0;
      filterUserTag = "";
    }
    /** 一键放宽：清空全部浏览筛选（搜索/题型/来源/仅错题/仅受助/时间/收藏/章节/命名视图） */
    function clearBrowseFilters() {
      const e = createEmptyBrowseFilters();
      setSearch(e.search);
      favOnly = e.favOnly;
      filterType = e.filterType;
      filterSource = e.filterSource;
      filterWrong = e.filterWrong;
      filterHelp = e.filterHelp;
      filterUserTag = e.filterUserTag;
      filterDays = e.filterDays;
      sectionSel = e.sectionSel;
      selectedView = e.selectedView;
    }
    async function deleteNamedView() {
      if (!selectedView || smartViewBusy || smartViewLoadBusy || smartViewLoadFailed) return;
      smartViewBusy = true; smartViewError = "";
      try {
        const { confirmDialogSync } = await import("../../libs/dialog");
        const res = await executeDeleteNamedViewWithConfirm(app, smartViews, selectedView, confirmDialogSync, t);
        if (res.deleted) {
          smartViews = res.nextViews;
          selectedView = "";
          if (res.toast) showMessage(res.toast, 2200, "info");
        } else if (res.error) {
          smartViewError = res.error;
        }
      } finally { smartViewBusy = false; }
    }

    /** 错题本/块菜单/浏览详情 → 单题会话（qid 定位；首次挂载 questions 未加载，先按库拉取） */
    async function startSingleById(pid: string) {
      if (!pid) return false;
      const all = questions.length ? questions : await loadQuestions();
      const q = all.find((x) => x.id === pid);
      if (!q) { showMessage(t("query.empty"), 3200, "info"); return true; }
      if (!(await negotiateStart([q], "wrong"))) return true;
      enterSessionView();
      return true;
    }

    // ---------- 浏览详情：展开/文档跳转/反链 ----------
    let expandedId = $state("");
    let peekHideAnswer = $state(true);
    const activePeekQuestion = $derived(expandedId ? questionMap.get(expandedId) ?? null : null);
    const currentPeekIndex = $derived(
      activePeekQuestion ? shownQuestions.findIndex((q) => q.id === activePeekQuestion.id) : -1,
    );
    const hasPrevPeek = $derived(currentPeekIndex > 0);
    const hasNextPeek = $derived(currentPeekIndex >= 0 && currentPeekIndex < shownQuestions.length - 1);

    function prevPeekQuestion() {
      const prevId = getNeighborQuestionId(shownQuestions, currentPeekIndex, -1);
      if (prevId) expandedId = prevId;
    }

    function nextPeekQuestion() {
      const nextId = getNeighborQuestionId(shownQuestions, currentPeekIndex, 1);
      if (nextId) expandedId = nextId;
    }

    async function drillSingleQuestion(q: Question) {
      closePeekDrawer();
      await safeStart([q], "special", () => {
        enterSessionView();
      });
    }

    function cloneToManualStudio(q: Question) {
      const d = cloneQuestionToManualDraft(q);
      mType = d.type; mStem = d.stem; mOptions = d.options; mAnswer = d.answer;
      mAnalysis = d.analysis; mKp = d.kp; mSecondaryKps = d.secondaryKps; mPrerequisites = (q.prerequisites || []).join(", "); mSource = d.source; mStatus = d.status;
      mSpecOpen = d.specOpen; mSpecUnit = d.specUnit; mSpecAbsTol = d.specAbsTol; mSpecRelPct = d.specRelPct; mSpecAltUnits = d.specAltUnits;
      mSpecOrderIndependent = d.orderIndependent;
      mRubricOpen = d.rubricOpen; mRubricText = d.rubricText;
      mStudyLang = d.studyLang; mStudyPhonetic = d.studyPhonetic;
      mFamily = d.family;
      closePeekDrawer();
      view = "manual";
      showMessage(d.toast, 3500, "info");
    }
    let peekDrawerEl = $state<HTMLDivElement | null>(null);
    let peekReturnFocus: HTMLElement | null = null;
    let peekWasOpen = false;
    let backlinkCache = $state(new Map<string, { docId: string; title: string; content: string }[]>());
    let backlinkBusyFor = $state("");
    let backlinkError = $state<Record<string, string>>({});

    // Peek is a modal drawer: move focus into it, keep background controls out
    // of the accessibility tree, and return focus to the row that opened it.
    $effect(() => {
      const open = !!activePeekQuestion;
      const drawer = peekDrawerEl;
      if (!open || !drawer) {
        if (!open && peekWasOpen) {
          peekWasOpen = false;
          const target = peekReturnFocus;
          peekReturnFocus = null;
          void tick().then(() => {
            if (target?.isConnected && target.getClientRects().length) target.focus();
          });
        }
        return;
      }
      if (!peekWasOpen && document.activeElement instanceof HTMLElement) peekReturnFocus = document.activeElement;
      peekWasOpen = true;
      void tick().then(() => { if (activePeekQuestion && peekDrawerEl) peekDrawerEl.focus(); });
    });

    // Mark every sibling along the drawer's ancestor chain inert. This keeps
    // the fixed sheet modal even though it is rendered inside the page panel.
    $effect(() => {
      const drawer = peekDrawerEl;
      if (!activePeekQuestion || !drawer || !tabRoot) return;
      return markAncestorSiblingsInert(drawer, tabRoot);
    });

    function closePeekDrawer() {
      expandedId = "";
    }

    function onPeekDrawerKeydown(e: KeyboardEvent) {
      handleDrawerNavKey(e, {
        onClose: closePeekDrawer,
        onPrev: prevPeekQuestion,
        onNext: nextPeekQuestion,
        onToggleFav: activePeekQuestion ? () => void toggleFavQuestion(activePeekQuestion) : undefined,
      });
    }

    function toggleBrowseQuestion(qid: string) {
      if (batchMode) {
        const next = { ...selectedIds };
        if (next[qid]) delete next[qid];
        else next[qid] = true;
        selectedIds = next;
        return;
      }
      expandedId = expandedId === qid ? "" : qid;
    }

    async function loadBacklinks(blockId: string) {
      if (backlinkBusyFor) return;
      backlinkBusyFor = blockId;
      backlinkError = { ...backlinkError, [blockId]: "" };
      try {
        const res = await fetchBlockBacklinks(app, blockId, t);
        const next = applyBacklinkFetchResult(backlinkCache, backlinkError, blockId, res);
        backlinkCache = next.nextCache;
        backlinkError = next.nextError;
      } finally { backlinkBusyFor = ""; }
    }

    const openInSiYuan = (rootId: string, blockId?: string, opt?: any) => openSiYuanTarget(plugin, rootId, blockId, showMessage, t, opt);

    // ---------- 题面富文本（md2html；离线回退纯文本） ----------
    let stemHtml = $state("");
    let stemHtmlFor = $state("");
    let materialHtml = $state("");
    let materialHtmlFor = $state("");
    $effect(() => {
      void sessionRev; // 类实例非响应式：以推进版本号驱动题面重渲染
      const q = view === "session" ? session?.current : view === "recite" ? reciteQueue[reciteCursor] : null;
      if (!q) { stemHtml = ""; stemHtmlFor = ""; materialHtml = ""; materialHtmlFor = ""; return; }
      // 竞态防护（27 组）：异步返回时校验仍是当前题才应用
      stemHtml = ""; stemHtmlFor = q.id;
      void app.renderStem(q).then((html) => {
        if (html && stemHtmlFor === q.id) stemHtml = html;
      });
      // 共用材料同样走 md2html 缓存管线（长材料/公式的可读性）
      const mat = q.group ? materialByGroup.get(q.group) : undefined;
      if (!mat) { materialHtml = ""; materialHtmlFor = ""; return; }
      materialHtml = ""; materialHtmlFor = mat.id;
      void app.renderStem(mat).then((html) => {
        if (html && materialHtmlFor === mat.id) materialHtml = html;
      });
    });

    /** 键盘流（docs/11 映射表）：会话 A-F/⏎/J；背诵 空格翻开、1-4 自评；composition（中文输入法）期间不响应 */
    function onKeydown(e: KeyboardEvent) {
      // Ctrl/⌘+K 由 Palette 组件自身统一监听并按活动页签隔离，此处直接放行避免双次翻转抵消
      if ((e.key === "k" || e.key === "K") && (e.ctrlKey || e.metaKey)) return;
      if (activePeekQuestion && handleModalDrawerKeydown(e, peekDrawerEl, closePeekDrawer)) return;
      if (shouldBlockGlobalHotkeys({
        tabRoot,
        target: e.target,
        defaultPrevented: e.defaultPrevented,
        paletteOpen,
        railOpen,
        hasModalDialog: !!document.querySelector('[role="dialog"]'),
      })) return;
      if ((e.target as HTMLElement)?.closest('button, a') && (e.key === "Enter" || e.key === " ")) return;

      const action = resolveKeyboardAction({
        event: e,
        view,
        session: {
          hasSession: !!session,
          isSessionDone: !!sessionDone,
          currentQuestion: session?.current,
          hasFeedback: !!feedback,
          feedbackVerdict: feedback?.verdict,
          canSubmit: canSubmitAnswer,
          doneCount: session?.progress.done ?? 0,
        },
        recite: {
          isDone: reciteDone,
          hasQueue: reciteQueue.length > 0,
          hasCurrentQuestion: !!reciteQueue[reciteCursor],
          revealed: reciteRevealed,
          hintLevel: reciteHint,
          hasAnalysis: !!reciteQueue[reciteCursor]?.analysis,
        },
      });

      if (!action) return;
      e.preventDefault();

      switch (action.type) {
        case "help":
          hotkeysHelpOpen = !hotkeysHelpOpen;
          break;
        case "exit_session":
          if (view === "recite") void exitRecite();
          else void exitSession();
          break;
        case "undo_submit":
          void undoRecentSubmit();
          break;
        case "next_question":
          // 防抖冷却：提交答案后的 220ms 内忽略按键直接跳题，避免双击/连击 Enter 意外穿透
          if (Date.now() - lastSubmitAt < 220) break;
          nextQuestion();
          break;
        case "prev_question":
          previousQuestion();
          break;
        case "toggle_scratchpad":
          scratchpadOpen = !scratchpadOpen;
          break;
        case "record_wrong_reason":
          if (session?.current) {
            const qid = session.current.id;
            const r = action.reason;
            app?.saveWrongReason(qid, r)
              .then(() => {
                savedReason = r;
                showMessage(`已记录错因：${t("reason." + r)}`, 2000, "info");
              })
              .catch((err) => {
                showMessage(`错因保存失败：${String(err instanceof Error ? err.message : err)}`, 3500, "error");
              });
          }
          break;
        case "pick_choice": {
          if (session?.current) {
            const idx = action.key.charCodeAt(0) - 65;
            const choice = answerChoices(session.current)[idx];
            if (choice) pickPracticeChoice(choice.value);
          }
          break;
        }
        case "set_confidence":
          confidenceSel = action.confidence;
          break;
        case "toggle_fav":
          void toggleFavCurrent();
          break;
        case "submit_answer":
          submitAnswer();
          break;
        case "tts_speak":
          if (reciteQueue[reciteCursor]) ttsSpeak(reciteQueue[reciteCursor].stem);
          break;
        case "reveal_recite":
          revealRecite();
          break;
        case "recite_hint":
          reciteHint = 2;
          break;
        case "recite_rate":
          void rateSelf(action.rating);
          break;
      }
    }

    async function commitImport() {
      if (!importReport || importBusy) return;
      if (importPreviewBankId !== activeBankId) { importError = t("import.bankChanged"); return; }
      const remaining = filterUnconfirmedQuestions(importReport.ok, trialConfirmed);
      if (!remaining.length && !importReport.updates?.length) {
        importResult = { written: trialConfirmed.length, confirmed: trialConfirmed.length, missing: 0, verified: true };
        retryPool = []; importReport = null; importText = ""; trialConfirmed = []; trialNote = "";
        return;
      }
      if (await runCommit({ ...importReport, ok: remaining })) { trialConfirmed = []; trialNote = ""; }
    }

    // 先导 5 行试导入（TODO 2.3）：试导前 5 题并读回确认；完整入库时排除已确认行
    let trialConfirmed = $state<string[]>([]);
    let trialNote = $state("");
    const remainingImportQuestions = $derived(importReport ? filterUnconfirmedQuestions(importReport.ok, trialConfirmed) : []);

    async function trialImport5() {
      if (!importReport || importBusy || !remainingImportQuestions.length) return;
      if (importPreviewBankId !== activeBankId) { importError = t("import.bankChanged"); return; }
      trialBusy = true; importError = ""; trialNote = "";
      try {
        const res = await executeTrialImport(app, activeBankId, remainingImportQuestions, importReport.batch, t);
        trialConfirmed = [...new Set([...trialConfirmed, ...res.confirmedIds])];
        trialNote = res.note;
        await refreshQuestionsAfterWrite(0);
      } catch (e) {
        importError = offline ? t("state.offlineHint") : String(e instanceof Error ? e.message : e);
      } finally { trialBusy = false; }
    }

    // 重试池（U08/38-04）：上次提交中未读回的题；重试只补这些，不重导已确认行
    let retryPool = $state<Question[]>([]);
    let retryBatch = $state("");
    let retryBankId = $state("");

    /** 38-04 / U08：未完成导入任务的断点恢复对象 */
    let importCheckpoint = $state<import("../../importer/pipeline").ImportCheckpoint | null>(null);

    // ---------- 52-08 演算草稿纸浮层（Scratchpad） ----------
    let scratchpadOpen = $state(false);
    let scratchpadStore = $state<ScratchpadStore>({});
    let scratchpadShared = $state("");
    let scratchpadMode = $state<ScratchpadMode>("per_question");

    function syncSessionScratchpad(s: PracticeSession | null) {
      const sp = s?.getScratchpad() ?? { store: {}, sharedText: "", mode: "per_question" as const };
      scratchpadStore = sp.store;
      scratchpadShared = sp.sharedText;
      scratchpadMode = sp.mode;
    }

    function persistSessionScratchpad() {
      if (!session) return;
      session.setScratchpad({ store: scratchpadStore, sharedText: scratchpadShared, mode: scratchpadMode });
      void app?.saveSession().catch(() => undefined);
    }

    const currentScratchpadText = $derived.by(() => {
      void sessionRev;
      return getQuestionScratchpadContent(scratchpadStore, session?.current?.id, scratchpadMode, scratchpadShared);
    });

    function onScratchpadInput(text: string) {
      const res = applyScratchpadInput(scratchpadStore, session?.current?.id, text, scratchpadMode, scratchpadShared);
      if (res) {
        scratchpadStore = res.store;
        scratchpadShared = res.sharedText;
        persistSessionScratchpad();
      }
    }

    function clearScratchpad() {
      const res = applyClearScratchpad(scratchpadStore, session?.current?.id, scratchpadMode, scratchpadShared);
      if (res) {
        scratchpadStore = res.store;
        scratchpadShared = res.sharedText;
        persistSessionScratchpad();
      }
    }

    const copyScratchpad = () => copyScratchpadText(currentScratchpadText, showMessage, t);

    // ---------- 52-09 正文划重点挖空出题（Cloze Generator） ----------
    let importSubTab = $state<"standard" | "cloze" | "siyuan" | "tag" | "glean">("standard");
    let importDocProfile = $state<"all" | "paper" | "notes" | "cloze" | "table">("all");
    let clozeInputText = $state("");
    let clozeModes = $state<("highlight" | "curly" | "bracket")[]>(["highlight", "curly"]);
    let clozeParsedItems = $state<ParsedClozeItem[]>([]);
    let clozeImporting = $state(false);

    // 小驴拾遗剪藏出题状态
    let gleanClips = $state<Array<{ id: string; title: string; site?: string; url?: string; summary?: string }>>([]);
    let gleanLoading = $state(false);
    let selectedGleanIds = $state<Record<string, boolean>>({});
    const selectedGleanCount = $derived(Object.values(selectedGleanIds).filter(Boolean).length);

    async function loadGleanClips() {
      const { listGleanClipsSafely } = await import("./services/gleanEcosystemService");
      gleanLoading = true;
      try {
        const clips = await listGleanClipsSafely(window, 50);
        gleanClips = clips;
      } catch (err) {
        console.warn("[LvExam] loadGleanClips error:", err);
      } finally {
        gleanLoading = false;
      }
    }

    async function importSelectedGleanDocs() {
      const ids = Object.keys(selectedGleanIds).filter((id) => selectedGleanIds[id]);
      if (ids.length) {
        await runDocExtract(
          () => extractFromBatchSiyuanDocs(app, ids, { profile: importDocProfile }),
          "批量提取拾遗剪藏试题失败",
        );
      }
    }

    function toggleSelectAllGlean() {
      const anySelected = Object.values(selectedGleanIds).some(Boolean);
      if (anySelected) {
        selectedGleanIds = {};
      } else {
        const next: Record<string, boolean> = {};
        for (const c of gleanClips) next[c.id] = true;
        selectedGleanIds = next;
      }
    }

    // 思源标签与闪卡题库提取状态
    let selectedTag = $state("#考点");
    let customTagInput = $state("");
    let taggedBlocks = $state<Array<{ id: string; content: string; rootId: string; hpath: string }>>([]);
    let tagSearchBusy = $state(false);

    async function doSearchTags(tag: string) {
      if (!app) return;
      tagSearchBusy = true;
      try {
        const isRiff = tag.includes("闪卡");
        taggedBlocks = isRiff
          ? await app.searchRiffCardBlocks()
          : await app.searchBlocksByTag(tag);
        showMessage(taggedBlocks.length ? `成功检索到 ${taggedBlocks.length} 个相关考点块！` : `未检索到包含 ${tag} 的内容块`, 2500, "info");
      } catch (err) {
        showMessage(`检索标签失败：${String(err instanceof Error ? err.message : err)}`, 3000, "error");
      } finally {
        tagSearchBusy = false;
      }
    }

    async function doImportTagQuestions(tag: string) {
      if (!app) return;
      tagSearchBusy = true;
      try {
        const report = await app.importFromTaggedBlocks(tag);
        applyDocExtractionResult({
          report,
          message: `已从 ${tag} 成功提取 ${report.ok.length} 道试题！`,
        });
      } catch (err) {
        showMessage(`从标签提取试题失败：${String(err instanceof Error ? err.message : err)}`, 3500, "error");
      } finally {
        tagSearchBusy = false;
      }
    }

    // 思源文档导入状态
    let docSearchQuery = $state("");
    let siyuanDocCandidates = $state<Array<{ id: string; title: string; hpath: string; box: string }>>([]);
    let siyuanDocBusy = $state(false);
    let selectedDocIds = $state<Record<string, boolean>>({});
    const selectedDocCount = $derived(Object.keys(selectedDocIds).length);

    async function doSearchDocs(q: string) {
      if (!app) return;
      siyuanDocBusy = true;
      selectedDocIds = {};
      try {
        const query = q.trim();
        siyuanDocCandidates = query
          ? await searchSiyuanDocCandidates(app, query)
          : (await app.searchSiyuanDocs(""));
      } catch (e) {
        showMessage(String(e instanceof Error ? e.message : e), 3000, "error");
      } finally {
        siyuanDocBusy = false;
      }
    }

    function applyDocExtractionResult(res: { report?: import("../../importer/pipeline").ImportReport; message: string; isError?: boolean }, toastTime = 4000) {
      if (res.report) {
        importResult = null;
        updateResult = null;
        trialConfirmed = [];
        trialNote = "";
        retryPool = [];
        importReport = res.report;
        importText = "";
        importSubTab = "standard";
        selectedDocIds = {};
        showMessage(res.message, 4200, "info");
      } else {
        showMessage(res.message, toastTime, res.isError ? "error" : "info");
      }
    }

    async function runDocExtract(extractFn: () => Promise<import("./services/docImportClozeService").DocExtractResult>, failPrefix: string, toastTime = 4000) {
      if (!app) return;
      siyuanDocBusy = true;
      try {
        const res = await extractFn();
        applyDocExtractionResult(res, toastTime);
      } catch (e) {
        showMessage(`${failPrefix}：${String(e instanceof Error ? e.message : e)}`, 4000, "error");
      } finally {
        siyuanDocBusy = false;
      }
    }

    async function importSelectedDocs() {
      const ids = Object.keys(selectedDocIds);
      if (ids.length) await runDocExtract(() => extractFromBatchSiyuanDocs(app, ids, { profile: importDocProfile }), "批量提取失败");
    }

    const toggleSelectAllDocs = () => { selectedDocIds = toggleSelectAllDocCandidates(siyuanDocCandidates, selectedDocIds); };

    const pickAndImportSiyuanDoc = (docId: string, title: string) =>
      runDocExtract(() => extractFromSingleSiyuanDoc(app, docId, title, { profile: importDocProfile }), "提取失败");

    const importAllSearchedDocs = () => {
      if (!siyuanDocCandidates.length) return;
      return runDocExtract(() => extractFromBatchSiyuanDocs(app, siyuanDocCandidates.map((d) => d.id), { profile: importDocProfile }), "批量提取失败", 3500);
    };

    async function aiExtractSiyuanDoc(docId: string, title: string) {
      if (!app || !docId) return;
      try {
        const docRes = await app.deps.client.exportDocMarkdown(docId);
        const mdText = docRes.content || "";
        if (!mdText.trim()) {
          showMessage(`《${title}》文档内容为空，无法进行 AI 出题`, 3000, "info");
          return;
        }
        aiSource = mdText;
        aiSourceOrigin = `来源思源笔记文档：${title}`;
        aiSourceBlockId = docId;
        switchView("ai");
        showMessage(`已将笔记《${title}》载入 AI 智能出题（原笔记未受任何修改）✓`, 3400, "info");
      } catch (err) {
        showMessage(`读取笔记失败：${String(err instanceof Error ? err.message : err)}`, 4000, "error");
      }
    }

    function toggleClozeMode(mode: "highlight" | "curly" | "bracket") {
      clozeModes = toggleClozeSupportMode(clozeModes, mode);
      if (clozeInputText.trim()) doParseCloze();
    }

    function doParseCloze() {
      if (!clozeInputText.trim()) return;
      const res = parseClozeItems(clozeInputText, clozeModes, t);
      clozeParsedItems = res.items;
      if (res.emptyNotice) showMessage(res.emptyNotice, 3000, "info");
    }

    async function importClozeQuestions() {
      if (!clozeParsedItems.length || !activeBankId || clozeImporting || committing) return;
      clozeImporting = true;
      try {
        const { report, count } = assembleClozeImportReport(clozeParsedItems);
        const ok = await runCommit(report);
        if (ok) {
          clozeInputText = "";
          clozeParsedItems = [];
          showMessage(t("cloze.importSuccess").replace("{n}", String(count)), 3500, "info");
        }
      } finally {
        clozeImporting = false;
      }
    }

    async function checkImportCheckpoint() {
      importCheckpoint = await checkImportCheckpointAux(app, activeBankId);
    }

    async function resumeCheckpoint() {
      if (!importCheckpoint || importBusy) return;
      const { report, confirmedIds } = buildResumeCheckpointReport(importCheckpoint);
      trialConfirmed = confirmedIds;
      importCheckpoint = null;
      await runCommit(report);
    }

    async function discardCheckpoint() {
      if (!importCheckpoint || importBusy) return;
      await discardImportCheckpointAux(app);
      importCheckpoint = null;
      showMessage(t("import.checkpointDiscarded"), 2400, "info");
    }

    /** 46-03：入库进度与取消（取消在文档间生效；已写文档保留，可用批次撤销整批回退） */
    let commitProgress = $state<{ done: number; total: number } | null>(null);
    let commitCancelRequested = $state(false);
    /** 38-03 更新式重导回执 */
    let updateResult = $state<null | { ok: number; failed: number; missing: number; unprocessed?: number }>(null);

    async function runCommit(report: ImportReport): Promise<boolean> {
      if (importBusy) return false;
      const targetBankId = activeBankId;
      const targetQuestions = [...questions];
      committing = true; importError = ""; updateResult = null;
      commitCancelRequested = false;
      commitProgress = { done: 0, total: report.ok.length };
      try {
        const commitRes = await executeCommitImport(app, targetBankId, report, trialConfirmed.length, {
          onProgress: (done, total) => { commitProgress = { done, total }; },
          isCancelled: () => commitCancelRequested,
        });
        importResult = commitRes.importResult;
        retryPool = commitRes.retryPool;
        retryBatch = commitRes.retryBatch;
        retryBankId = commitRes.retryBankId;
        void checkImportCheckpoint();
        if (commitRes.cancelled) {
          importResult.cancelled = true;
          importReport = { ...report, ok: retryPool };
          await refreshQuestionsAfterWrite(0);
          return false;
        }
        // 38-03 更新式重导：报告.updates 按 hash 定位库内题，只覆盖答案/解析/别名
        if (report.updates?.length) {
          const updRes = await executeAnswerUpdates(app, targetBankId, report.updates, targetQuestions, t, {
            isCancelled: () => commitCancelRequested,
            onProgress: (done, total) => { commitProgress = { done, total }; },
          });
          updateResult = updRes.updateResult;
          showMessage(updRes.message, 5600, updRes.messageType);
          if (updRes.hasIssue) {
            if (updRes.updateResult.unprocessed) importResult.cancelled = true;
            importReport = { ...report, ok: retryPool, updates: report.updates };
            await refreshQuestionsAfterWrite(0);
            return false;
          }
        }
        importReport = null; importText = "";
        await refreshQuestionsAfterWrite(0);
        return true;
      } catch (e) {
        importError = offline ? t("state.offlineHint") : String(e instanceof Error ? e.message : e);
        return false;
      } finally {
        committing = false;
        commitProgress = null;
      }
    }

    /** 渲染式抽查（2.3/U07 前半）：随机抽 3 题按真实渲染管线出预览，计数与汇总之外的"眼见为实" */
    let spotIds = $state<string[]>([]);
    let spotHtml = $state<Record<string, string>>({});
    let spotBusy = $state(false);
    async function spotCheckRender() {
      if (!importReport?.ok.length || spotBusy) return;
      spotBusy = true;
      try {
        const res = await executeSpotCheckRender(app, importReport.ok, 3);
        spotIds = res.spotIds;
        spotHtml = res.spotHtml;
      } finally { spotBusy = false; }
    }

    // ---------- 错误单行修复（2.3/U07 后半）：Excel=单元格编辑；文本路径=Aiken 块编辑 ----------
    let fixRow = $state<number | null>(null); // err.row（1-based 数据行号，含表头偏移）
    let fixCells = $state<string[]>([]);
    let fixText = $state(""); // 文本路径：Aiken 块原文
    let fixNote = $state("");
    function startRowFix(row: number) {
      if (importBusy) return;
      const report = importReport;
      const sheet = sheetRowsCache.get(activeSheet);
      const abs = row - 1;
      const init = prepareRowFixInitialState(row, sheet?.[abs]);
      fixRow = init.row;
      fixCells = init.cells;
      fixText = init.text;
      fixNote = init.note;
      if (init.cells.length) return;
      void (async () => {
        const blk = await extractTextRowAt(importText, row);
        if (fixRow !== row || importReport !== report) return;
        if (!blk) {
          fixNote = t("import.fixUnavailable");
          fixRow = null;
          return;
        }
        fixText = blk;
      })();
    }
    function cancelRowFix() {
      fixRow = null; fixCells = []; fixText = ""; fixNote = "";
    }
    async function applyRowFix(errRow: number) {
      if (!importReport || fixRow == null || importBusy) return;
      const res = await executeApplyRowFix({
        currentReport: importReport,
        errRow,
        fixCells,
        fixText,
        sheetRowsCache,
        activeSheet,
        lastMap,
        questions,
        dupeStrategy,
        t,
      });
      importReport = res.nextReport;
      if (res.nextSheetCache) sheetRowsCache = res.nextSheetCache;
      if (res.fixed) {
        cancelRowFix();
        showMessage(t("import.rowFixed"), 2600, "info");
      } else if (res.fixNote) {
        fixNote = res.fixNote;
      }
    }

    /** 重试缺失部分（38-04）：同一 batch 重新提交未读回的题；换库后拒绝（41-04 切库不误写目标库） */
    async function retryMissing() {
      if (committing || !retryPool.length) return;
      if (activeBankId !== retryBankId) { importError = t("import.retryWrongBank"); return; }
      await runCommit(buildRetryMissingReport(retryPool, retryBatch, importReport?.updates));
    }
</script>

<svelte:window onkeydown={onKeydown} onclick={(e) => { onRichTextClick(e); onWindowClick(e); }} onauxclick={onRichTextClick} ondragover={(e) => { if (tabRoot?.contains(e.target as Node)) e.preventDefault(); }} ondrop={onDrop} />

<div class="fn__flex-1 lv-exam-tab" class:lv-keyboard-open={keyboardOpen} bind:this={tabRoot} role="region" aria-label={t("tab.practice")}>
  <div class="block__icons" class:lv-focus-toolbar={view === "session" && !sessionDone}>
    <button class="lv-menu-btn" aria-label={t("menu.open")} aria-expanded={railOpen} bind:this={menuBtn} onclick={() => railOpen = true}><Icon name="menu" size={16} /></button>
    <!-- 原型 .breadcrumbs：题库 / 当前页（muted/当前 双色导航语境） -->
    {#if view === "session" && !sessionDone}<div class="lv-focus-brand"><Icon name="book" size={15} /><strong>{t("session.focusTitle", "专注练习")}</strong></div>{/if}
    <div class="lv-crumbs" class:lv-focus-context={view === "session" && !sessionDone}>
      <span class="lv-crumb">{bankName || t("guard.title")}</span>
      <span class="lv-crumb-sep" aria-hidden="true">/</span>
      <span class="lv-crumb-current">{t("tab.practice")}</span>
    </div>
    {#if app?.saves}<SaveStatus gate={app.saves} {t} />{/if}
    <span class="fn__flex-1 lv-topbar-spacer"></span>
    <button class="lv-btn lv-btn--ghost sm lv-palette-btn" onclick={() => paletteOpen = true} title="Ctrl / ⌘ K" aria-label="打开全局命令面板">
      <Icon name="search" size={13} /> <span class="lv-palette-label">{t("palette.open")}</span> <span class="lv-kbd">⌘K</span>
    </button>
    {#if app && (offline || app.lastKernelError?.category === "auth" || app.lastKernelError?.category === "permission" || app.lastKernelError?.category === "validation" || app.lastKernelError?.category === "not-found")}
      <span class="lv-chip lv-chip--amb" title={app.kernelRecoveryHint()} aria-label={app.kernelRecoveryHint()}>
        {app.lastKernelError?.category === "auth" ? "未授权" : app.lastKernelError?.category === "permission" ? "无权限" : app.lastKernelError?.category === "validation" ? "输入有误" : app.lastKernelError?.category === "not-found" ? "接口不存在" : t("state.offline")}
      </span>
    {/if}
    {#if plan}
      <span class="lv-focus-context lv-plan-context">
      {#if plan.mode === "sprint"}<span class="lv-chip lv-chip--red num"><Icon name="flame" size={12} /> {t("entry.sprint")} D-{plan.daysToExam}</span>
      {:else if plan.daysToExam != null}<span class="lv-chip amb num"><Icon name="clock" size={12} /> {t("entry.examIn")} {plan.daysToExam} {t("entry.days")}</span>{/if}
      {#if examProfileList.filter((p) => p.days != null && p.days >= 0).length > 1}
        <!-- 53-02 lite：多考期并存展示（计划锚定最近，其余一目了然） -->
        {#each examProfileList.filter((p) => p.days != null && p.days >= 0) as p, _pi (_pi)}
          <span class="lv-chip num" title={t("entry.profileTip")}><Icon name="pin" size={12} /> {p.name} D-{p.days}</span>
        {/each}
      {/if}
      {#if planTrace && planTrace.absentStreak >= 2}
        <!-- 44-05 lite：连续缺席提醒（配额恒定不爆量，仅可见性） -->
        <span class="lv-chip lv-chip--amb num" title={t("entry.absentTip")}><Icon name="alert-triangle" size={11} /> {t("entry.absent").replace("{n}", String(planTrace.absentStreak))}</span>
      {:else if planTrace && planTrace.planned > 0 && planTrace.done >= 0}
        <span class="lv-chip num" title={t("entry.yesterdayTip")}><Icon name="calendar" size={12} /> {t("entry.yesterday").replace("{p}", String(planTrace.planned)).replace("{d}", String(planTrace.done))}</span>
      {/if}
      {#if planTime && view !== "entry"}
        <!-- 53-01 lite：分钟预算 chip（入口页已在 hero 卡内展示，避免重复） -->
        <span class="lv-chip num" title={planTime.sourced ? t("entry.timeSourced") : t("entry.timeDefault")}>
          <Icon name="hourglass" size={12} /> ~{planTime.minutes} {t("entry.minutes")}（{planTime.low}-{planTime.high}）
        </span>
      {/if}
      </span>
    {/if}
      {#if checkinStreak != null && checkinStreak > 0}
        <!-- 48-04 lite：打卡→考试只读投影（连续数由打卡单一实现计算，考试侧不自算） -->
        <span class="lv-chip num lv-focus-context lv-checkin-chip" title={t("entry.checkinStreakTip")}><Icon name="flame" size={12} /> {t("entry.checkinStreak").replace("{n}", String(checkinStreak))}</span>
      {/if}
      <div class="lv-row lv-focus-context lv-bank-picker-group" style="margin:0;gap:6px;align-items:center">
        {#if banks.length > 1}
          <!-- 多库切换：紧凑圆角下拉框 -->
          <select class="lv-select sm" style="max-width:160px" bind:value={activeBankId} onchange={onBankSwitch} disabled={importBusy || mSaving || aiMutationBusy || (view === "session" && !!session && !sessionDone) || (view === "recite" && !reciteDone && !!reciteQueue.length)} title={(view === "session" && !!session && !sessionDone) || (view === "recite" && !reciteDone && !!reciteQueue.length) ? t("bank.sessionHint") : importBusy || mSaving || aiMutationBusy ? t("bank.busyHint") : t("bank.label")} aria-label={t("bank.label", "切换当前题库")}>
            {#each banks as b, _i (_i)}<option value={b.id}>{b.name}</option>{/each}
          </select>
        {:else if hasBank}
          <span class="lv-chip sm">{bankName}</span>
        {/if}
        <button class="lv-btn sm lv-btn--ghost" onclick={() => { bankHubOpen = true; }} disabled={importBusy || mSaving || aiMutationBusy || (view === "session" && !!session && !sessionDone) || (view === "recite" && !reciteDone && !!reciteQueue.length)} title={t("bank.hubTitle")} aria-label={t("bank.hubTitle")}><Icon name="folder" size={13} /> <span class="lv-topbar-btn-label">{t("bank.hubTitle")}</span></button>
        <button
          type="button"
          class="lv-btn sm lv-btn--ghost"
          onclick={() => { marketplaceOpen = true; }}
          disabled={importBusy || mSaving || aiMutationBusy || (view === "session" && !!session && !sessionDone) || (view === "recite" && !reciteDone && !!reciteQueue.length)}
          title="题库与闪卡公共集市：精选公版题库与网络卡包"
          aria-label="题库集市"
        >
          <Icon name="sparkles" size={13} /> <span class="lv-topbar-btn-label">🏛️ 题库集市</span>
        </button>
      </div>
      <button type="button" class="lv-mobile-close-btn" aria-label="关闭" title="关闭" onclick={() => { lvLaunchpad.haptic(8); void plugin?.closeMobileDialog?.(); }}>
        <Icon name="close" size={18} />
      </button>
  </div>
  <div class="lv-shell" class:lv-shell-focus={(view === "session" && !sessionDone) || (view === "recite" && !reciteDone)} class:lv-shell-tasknav-hidden={(view === "session" && !sessionDone) || (view === "recite" && !reciteDone)}>
    <Rail active="practice" taskactive={view === "marketplace" ? "marketplace" : view === "wrongbook" ? "wrong" : (view === "browse" ? "bank" : view === "manual" || view === "import" || view === "ai" || view === "materials" ? "create" : "today")} tasknavhidden={view === "session" && !sessionDone || view === "recite" && !reciteDone} ontasknavigate={onTaskNav} {plugin} items={railItems} open={railOpen} onclose={closeRail}
      project={{ name: bankName || t("guard.title"), kicker: t("rail.projectKicker") }} onproject={() => (view = "entry")}
      onquickcreate={() => { view = "manual"; }} />
    <div class="lv-main" style={viewportBottomPad > 0 ? `padding-bottom: calc(${viewportBottomPad + 16}px + env(safe-area-inset-bottom, 0px));` : undefined}>
  {#if errorMsg && errorMsg !== t("state.emptyBank") && view !== "session"}
    <div class="lv-pad" style="padding-bottom:0"><div class="lv-error" role="alert">{errorMsg}</div></div>
  {/if}
  {#if app?.lastKernelError && view !== "session"}
    <div class="lv-pad" style="padding-top:0;padding-bottom:0">
      <div class="lv-muted" role="status" style="overflow-wrap:anywhere">{app.kernelRecoveryHint()}</div>
    </div>
  {/if}
  {#if app?.storageReadonly && view !== "session"}
    <div class="lv-pad" style="padding-top:0;padding-bottom:0">
      <div class="lv-error" role="alert" style="overflow-wrap:anywhere">
        数据读取失败，已暂停写入以保护原有内容（{[...app.storageReadErrors.keys()].slice(0, 3).join("、")}）。请重载思源后重试。
      </div>
    </div>
  {/if}
  {#if loading || !app}
    <div class="lv-pad" role="status" aria-live="polite" aria-busy="true">
      <p class="lv-muted">{!app ? (t("state.initializing") || "正在初始化小驴考试，请稍候…") : t("entry.loadingQuestions", "正在读取题目，请稍候…")}</p>
      <div class="lv-skeleton" aria-hidden="true"></div>
    </div>
  {:else if errorMsg === t("state.emptyBank") && view !== "session"}
    <!-- 空题库走居中空态（原型 .empty），其余错误保留语义横幅 -->
    <div class="lv-pad">
      {#if errorMsg === t("state.emptyBank")}
        <div class="lv-empty">
          <div class="lv-empty-icon"><Icon name="file" size={30} /></div>
          <b>{t("state.emptyBank")}</b>
          <div class="lv-row" style="justify-content:center;margin-top:18px">
            <button class="lv-btn lv-btn--primary" onclick={() => { errorMsg = ""; view = "import"; }}><Icon name="import" size={15} /> {t("import.title")}</button>
            <button class="lv-btn" onclick={() => { errorMsg = ""; view = "manual"; }}><Icon name="pencil" size={15} /> {t("entry.manual")}</button>
            <button class="lv-btn lv-btn--ghost" onclick={() => { errorMsg = ""; view = "ai"; }}><Icon name="sparkles" size={15} /> {t("ai.title")}</button>
          </div>
        </div>
      {:else}
        <div class="lv-error">{errorMsg}</div>
      {/if}
    </div>
  {:else if view === "entry"}
    <EntryStudioView
      {hasBank}
      {creating}
      {offline}
      {creatingSample}
      {SAMPLE_QUESTION_COUNT}
      {bankCreateError}
      bind:newBankName
      {session}
      {resumeBusy}
      {exitBusy}
      {resumeError}
      {onboarding}
      {practiceQuestions}
      {questionsError}
      {questionsLoaded}
      {bankCategory}
      {bankName}
      bind:sampleNotice
      {loading}
      {syncDocsBusy}
      {banks}
      {plan}
      {criticalForgettingKps}
      {planTime}
      {todayQueue}
      {weekAttemptTotal}
      {weekTrend}
      {weekAttemptMax}
      {goalPct}
      {todayDone}
      {dailyGoalN}
      {streakDays}
      {wrongList}
      {cramCount}
      {favoriteCount}
      bind:expKp
      {expKpRoots}
      bind:expReason
      bind:expDays
      bind:bankFileInput
      {t}
      {planReasonText}
      {weekDayLabel}
      oncreateSampleBank={(kind) => void createSampleBank(kind)}
      oncreateBank={() => void createBank()}
      ondownloadTemplate={() => void downloadTemplate()}
      oncreateAndImport={async () => { if (await createBank()) view = "import"; }}
      onResume={() => void resume()}
      ondiscardSession={async () => {
        if (session && app) {
          flushAbandonedSessionExposures(app, session, session.exposureMap());
        }
        await app?.discardSession();
        session = null;
        resumeError = "";
      }}
      onstartDrill={(mode) => void startDrill(mode)}
      onopenReport={() => plugin.openReport?.()}
      onopenMock={() => plugin.openMock?.()}
      onskipOnboarding={() => { onboardingDismissed = true; writeLocal("lv-exam-onboarded", "1"); }}
      onretryEntryLoad={() => void retryEntryLoad()}
      onnavView={(v, subTab) => {
        view = v;
        if (subTab) importSubTab = subTab as any;
        if (v === "browse") void loadQuestions();
      }}
      onopenBankHub={() => { void refreshBankCounts(); bankHubOpen = true; }}
      onswitchToNonEmptyBank={() => void switchToNonEmptyBank()}
      {bankQuestionCounts}
      {activeBankId}
      onrescueEbbinghausNow={rescueEbbinghausNow}
      onrescueEbbinghausRecite={rescueEbbinghausRecite}
      onstartToday={() => void startToday()}
      oncopyTodayReport={copyTodayReportMarkdown}
      onstartRecite={() => startRecite()}
      oncopyChallengeCode={copyChallengeCode}
      onimportChallengeCode={importChallengeCode}
      onsyncBankDocs={() => void syncBankDocs()}
      onexportBank={() => void exportBank()}
      onimportBank={(e) => void importBank(e)}
      onexportWrong={exportWrong}
      onloadMaterials={() => void loadMaterials()}
      {lastSyncedDocs}
      onopenInSiYuan={(rid, bid, opt) => openInSiYuan(rid, bid, opt)}
    />
  {:else if view === "session" && session}
    <PracticeSessionView
      {session}
      {sessionDone}
      {curQ}
      {curProgress}
      {questions}
      {questionMap}
      {curSpec}
      {stemHtml}
      {materialHtml}
      {materialContext}
      {groupContext}
      bind:materialExpanded
      bind:selected
      {feedback}
      {currentDraft}
      {blankParts}
      bind:hideOptions
      bind:recallDraft
      {currentRubric}
      {currentRubricDrifted}
      {rubricScore}
      bind:rubricRatings
      bind:rubricSaved
      {rubricSaveBusy}
      {rubricEvalResult}
      {recordedRubricSnapshot}
      {DEFAULT_RUBRIC_LEVELS}
      bind:confidenceSel
      {qElapsedS}
      {qTimeoutS}
      bind:savedReason
      {canSubmitAnswer}
      {explainBusy}
      {explainText}
      {explainQid}
      {explainSavedQid}
      {explainSaveBusy}
      {explainSaveError}
      {explainSaveErrorQid}
      bind:explainFollowUp
      bind:leakPending
      bind:reasonPromptQid
      {curQStats}
      bind:scratchpadOpen
      bind:scratchpadMode
      {currentScratchpadText}
      bind:groupBatchModal
      {speechEvalEnabled}
      {speechEvalResult}
      {speechRecording}
      {reciteToggle}
      bind:speedDrillEnabled
      bind:autoNextOnCorrect
      {autoNextPending}
      {autoNextRemainingS}
      oncancelAutoNext={clearAutoNext}
      bind:shuffleOptions
      {pureListen}
      bind:soundEnabled
      bind:hotkeysHelpOpen
      bind:ttsSlowRate
      {studyFontSize}
      bind:shortLinedPaper
      bind:paperGridModalOpen
      {cardResult}
      {favBusy}
      {exitBusy}
      {streakDays}
      {kpBreakdown}
      {cbmSettle}
      {weakRank}
      {weakDrillBusy}
      {checkinStatus}
      {checkinNote}
      {settleMode}
      bind:reviewOpen
      {reflections}
      {misdiagnosisBusy}
      {misdiagnosisText}
      {helpShown}
      {trails}
      {actionBusy}
      {actionNote}
      {t}
      {queueSemantics}
      {writeBackReceipt}
      {ttsSupported}
      {renderInlineText}
      {isChoiceQuestion}
      {answerChoices}
      {escapeHtml}
      {formatMaterialGroupHeader}
      {hintButtonLabel}
      onexitSession={exitSession}
      ontoggleReview={() => { reviewOpen = !reviewOpen; if (reviewOpen) void loadReflections(); }}
      onsameKpSession={sameKpSession}
      onweakSpotDrill={() => void weakSpotDrill()}
      onwrongsToCard={wrongsToCard}
      onwrongsToActions={wrongsToActions}
      onopenReport={() => plugin.openReport?.()}
      onstartNextDrill={() => void startDrill("quick")}
      oneditReflection={(qid) => void editReflection(qid)}
      onrunMisdiagnosis={(a) => void runMisdiagnosis(a)}
      onadoptMisdiagnosis={(qid) => void adoptMisdiagnosis(qid)}
      onttsSpeak={handleTtsSpeak}
      ontoggleTtsSlow={() => { ttsSlowRate = !ttsSlowRate; writeLocal("lv-exam/tts-slow", ttsSlowRate ? "1" : "0"); }}
      oncycleStudyFontSize={cycleStudyFontSize}
      onstartSpeech={(target, lang) => startSpeechRecognition(target, lang)}
      ontoggleRecite={toggleRecite}
      ontogglePureListen={togglePureListen}
      ontoggleFavCurrent={() => void toggleFavCurrent()}
      ontoggleUserTag={(tag) => void toggleUserTag(tag)}
      ontoggleScratchpad={() => (scratchpadOpen = !scratchpadOpen)}
      onscratchpadModeChange={(m) => { scratchpadMode = m; persistSessionScratchpad(); }}
      onscratchpadInput={onScratchpadInput}
      onclearScratchpad={clearScratchpad}
      oncopyScratchpad={copyScratchpad}
      oncloseScratchpad={() => (scratchpadOpen = false)}
      ongroupBatchContinue={() => { groupBatchModal = null; nextQuestion(); }}
      ontoggleMaterialExpand={() => { materialExpanded = !materialExpanded; if (materialExpanded && !feedback && session?.current) addExposure(session.current.id, "material"); }}
      onjumpSibling={jumpToSibling}
      ondismissSpeechEval={() => (speechEvalResult = null)}
      ontoggleHideOptions={() => { hideOptions = !hideOptions; if (hideOptions) recallDraft = ""; }}
      onrecallDraftInput={(val) => { recallDraft = val; }}
      onrevealOptions={() => { if (curQ && session) { session.markRecalled(curQ.id); void app?.saveSession().catch(() => undefined); } hideOptions = false; }}
      onpickChoice={pickPracticeChoice}
      ondraftInput={(val) => { draftLive = val; if (curQ) { session.setDraft(curQ.id, draftLive); scheduleDebouncedDraftSave(); } }}
      ondraftChange={(val) => { if (curQ) trailInput(curQ.id, val); }}
      onsetBlank={(idx, val) => setBlank(idx, val)}
      onblankChange={() => { if (curQ) trailInput(curQ.id, joinBlanks(blankParts)); }}
      ontoggleLinedPaper={() => { shortLinedPaper = !shortLinedPaper; writeLocal("lv-exam/lined-paper", shortLinedPaper ? "1" : "0"); }}
      ontogglePaperGridModal={() => (paperGridModalOpen = !paperGridModalOpen)}
      onundoRecentSubmit={undoRecentSubmit}
      onautoAlignRubric={autoAlignRubric}
      onrubricRatingChange={(critId, lvl) => { rubricRatings = { ...rubricRatings, [critId]: lvl }; rubricSaved = false; }}
      onrecordRubricAssessment={() => void recordRubricAssessment()}
      onexportRubricCsv={exportCurrentRubricCsv}
      onsaveWrongReason={async (r) => {
        if (curQ && app) {
          try {
            await app.saveWrongReason(curQ.id, r as any);
            savedReason = r;
            showMessage(`已记录错因：${t("reason." + r)}`, 2000, "info");
          } catch (e) {
            showMessage(`错因保存失败：${String(e instanceof Error ? e.message : e)}`, 3500, "error");
          }
        }
      }}
      onconfidenceSelect={(c) => { confidenceSel = c; }}
      onsubmitAnswer={submitAnswer}
      onrequestHint={requestHint}
      onrevealStageHint={() => { if (curQ && !feedback) addExposure(curQ.id, "hint"); }}
      onnextQuestion={nextQuestion}
      ondrillVariant={() => { if (curQ) void drillVariantFor(curQ); }}
      ontraceMother={() => { if (curQ) void traceMotherQuestion(curQ); }}
      ondiagnosePrereqs={(q) => handleDiagnosePrereqs(q)}
      ontoCard={toCard}
      onopenInSiYuan={(rid, bid) => openInSiYuan(rid, bid)}
      onexplainCurrent={(m) => explainCurrent(m)}
      onviewLeakedHint={viewLeakedHint}
      ondismissLeakedHint={() => (leakPending = null)}
      onsaveExplain={saveExplain}
      onsendFollowUp={sendFollowUp}
      onsetEditReason={(qid, r) => setEditReason(qid, r)}
      ondismissReasonPrompt={() => (reasonPromptQid = "")}
      ontouchStart={onTouchStart}
      ontouchEnd={onTouchEnd}
      onopenSessionSheet={() => (sessionSheetOpen = !sessionSheetOpen)}
    />
  {:else if view === "recite"}
    <ReciteStudioView
      {reciteQueue}
      {reciteCursor}
      {reciteRevealed}
      {reciteDone}
      {reciteRatings}
      {reciteAutoTts}
      {ttsSlowRate}
      {studyFontSize}
      {speechEvalEnabled}
      {speechRecording}
      {speechEvalResult}
      {reciteMaterial}
      {stemHtml}
      {reciteHint}
      {reciteSaving}
      {reciteOutcome}
      {reciteError}
      {t}
      {renderInlineText}
      {ttsSupported}
      onexit={exitRecite}
      oncycleStudyFontSize={cycleStudyFontSize}
      onstartSpeech={(target, lang) => startSpeechRecognition(target, lang)}
      onjumpSource={(e) => jumpToSource(e)}
      onttsSpeak={handleTtsSpeak}
      onretryForgot={retryForgotRecite}
      onforgotToCard={reciteForgotToCard}
      onforgotToActions={reciteForgotToActions}
      onopenReport={() => plugin.openReport?.()}
      onstartNextRecite={() => startRecite()}
      onreveal={revealRecite}
      onrateSelf={(r) => void rateSelf(r)}
      ondismissSpeechEval={() => { speechEvalResult = null; }}
      ontoggleAutoTts={() => { reciteAutoTts = !reciteAutoTts; writeLocal("lv-exam/recite-auto-tts", reciteAutoTts ? "1" : "0"); }}
      ontoggleTtsSlow={() => { ttsSlowRate = !ttsSlowRate; writeLocal("lv-exam/tts-slow", ttsSlowRate ? "1" : "0"); }}
      ontoggleHint={() => { reciteHint = reciteHint === 0 ? (reciteQueue[reciteCursor]?.kp ? 1 : 2) : reciteHint === 1 && reciteQueue[reciteCursor]?.analysis ? 2 : 1; }}
    />
  {:else if view === "wrongbook"}
    <WrongbookStudioView
      {wrongList}
      {eliminatedCount}
      {clearPct}
      {streakDays}
      {reasonCounts}
      bind:wbTab
      bind:wbReasonFilter
      bind:wbFilterStubborn
      {wbKpOptions}
      bind:wbKpFilter
      {wbTagOptions}
      bind:wbTagFilter
      {wbDocOptions}
      bind:wbDocFilter
      bind:wbSortMode
      ontracebackBlock={tracebackBlock}
      {filteredWrongQueue}
      {shownWrongQueue}
      {wbQueueHasMore}
      onloadMoreWbQueue={() => (wbQueueLimit += 50)}
      {archivedWrongList}
      {eliminatedWrongList}
      {cbmHighrisk}
      {cbmFragile}
      {cbmHighriskQids}
      {wrongQueue}
      {effectiveEliminateStreak}
      {printWrongBusy}
      {cheatSheetBusy}
      {hasCardsPlugin}
      {wrongBusyId}
      {cramCount}
      {bulkMasterBusy}
      {questionMap}
      {t}
      {reasonOf}
      {isStubbornWrong}
      {getStubbornRemediation}
      onstartDrill={(m) => void startDrill(m)}
      onbackToEntry={() => { view = "entry"; }}
      onprintWrongSheet={(k) => void printWrongSheet(k)}
      onexportCheatSheet={exportCheatSheet}
      onsaveWrongbookAsDoc={saveWrongbookAsDoc}
      onsyncWrongbookToCards={() => void syncWrongbookToCards()}
      onlaunchWrongbookMockExam={() => void launchWrongbookMockExam()}
      onstartFilteredWrongDrill={() => void startFilteredWrongDrill()}
      onstartWrongFor={(qid) => void startWrongFor(qid)}
      onsyncSingleWrongToCard={(qid) => void syncSingleWrongToCard(qid)}
      ontraceMotherQuestion={(q) => void traceMotherQuestion(q)}
      ondrillVariantFor={(q) => void drillVariantFor(q)}
      onsnoozeWrong={(qid, days) => void snoozeWrong(qid, days)}
      onarchiveWrong={(qid) => void archiveWrong(qid)}
      onstartSameKpFor={(qid) => void startSameKpFor(qid)}
      onmasterWrong={(qid) => void masterWrong(qid)}
      onrestoreWrongToActive={(qid) => void restoreWrongToActive(qid)}
      onunarchiveWrong={(qid) => void unarchiveWrong(qid)}
      onmasterAllWrong={() => void masterAllWrong()}
      onbrowseWrongFilter={() => { filterWrong = true; view = "browse"; void loadQuestions(); }}
      onchangeWbSortMode={(val) => writeLocal("lv-exam/wrong-sort", val)}
      onstartCbmDrill={(k) => void startCbmDrill(k)}
      onstartCustomDrill={(qids) => void startCustomDrill(qids)}
      onopenInSiYuan={(rid, bid, opt) => openInSiYuan(rid, bid, opt)}
      ondiagnosePrereqs={(q) => handleDiagnosePrereqs(q)}
      oneditReflection={(qid) => void editReflection(qid)}
      {reflections}
      {lastSavedWrongbookDoc}
    />
  {:else if view === "manual"}
    <ManualStudioView
      existingQuestions={questions}
      bind:pinAttributes
      bind:mType
      bind:mStem
      bind:mOptions
      bind:mAnswer
      bind:mAnalysis
      bind:mExpansion
      bind:mKp
      bind:mSecondaryKps
      bind:mPrerequisites
      bind:mSource
      bind:mGroup
      bind:mSpecOpen
      bind:mSpecUnit
      bind:mSpecAbsTol
      bind:mSpecRelPct
      bind:mSpecAltUnits
      bind:mSpecOrderIndependent
      bind:mRubricOpen
      bind:mRubricText
      {authorRubricPreview}
      bind:mStatus
      bind:mStudyLang
      bind:mStudyPhonetic
      {mSaving}
      {mSaved}
      {manualErrorMsg}
      {manualErrorField}
      bind:manualSymbolTab
      {draftRestored}
      bind:ocrModalOpen
      bind:ocrInputText
      {ocrUploadBusy}
      {t}
      {sanitizeRichHtml}
      {renderMathInText}
      {renderMathDiagramsInText}
      {removeChoiceOption}
      onback={() => view = "entry"}
      onchangeView={(v) => (view = v)}
      onmanualPaste={onManualPaste}
      onopenOcrModal={openOcrModal}
      onnormalizeFormulas={normalizeManualFormulas}
      oninsertMathSnippet={insertMathSnippet}
      onapplyOcrFill={applyOcrFill}
      onfileInputChange={onFileInputChange}
      onswitchManualType={(tt) => void switchManualType(tt)}
      onclearManualValidation={clearManualValidation}
      onsetCorrectOption={(i) => setCorrectOption(i)}
      onsaveManual={(st) => void saveManual(st)}
      onblankManualDraft={blankManualDraft}
      onshowChartMessage={() => showMessage("已在题干插入图表模板", 2500, "info")}
      bind:mSourceBlockId
      onopenInSiYuan={(rid, bid, opt) => openInSiYuan(rid, bid, opt)}
      onsearchSiyuanDocs={async (q) => app ? (q.trim() ? await searchSiyuanDocCandidates(app, q.trim()) : await app.searchSiyuanDocs("")) : []}
    />
    <!-- 图片遮挡填图可视化编辑器：拖拽框选 → 填答案 → 裂变同族题（遮挡题唯一创作入口） -->
    <div class="lv-row" style="margin:8px 0 0">
      <button class="lv-btn sm lv-btn--ghost" aria-expanded={occlusionOpen} onclick={() => (occlusionOpen = !occlusionOpen)}
        title="在配图上框选区域生成图片遮挡填图题（Anki Image Occlusion 规范，支持 A4 打印脱敏）">
        <Icon name="layers" size={13} />
        <span>{occlusionOpen ? "收起遮挡图编辑器" : "遮挡图出题（框选配图区域）"}</span>
        <Icon name={occlusionOpen ? "arrow-down" : "chev-right"} size={11} />
      </button>
    </div>
    {#if occlusionOpen}
      <OcclusionEditor {t} kp={mKp} source={mSource} oncreate={(qs) => void saveOcclusionQuestions(qs)} />
    {/if}
  {:else if view === "ai"}
    <AiStudioView
      {hasBank}
      {activeBankId}
      {banks}
      {aiCustomEndpointSet}
      {aiError}
      bind:aiSource
      bind:aiSourceOrigin
      {gleanAvailable}
      {gleanBusy}
      {gleanError}
      {gleanErrorAction}
      {gleanPendingDone}
      {gleanDoneBusy}
      {gleanDoneNote}
      bind:aiCount
      bind:aiDifficulty
      bind:aiPreset
      bind:aiQuality
      bind:aiKp
      bind:aiQuote
      bind:aiCustomHint
      {aiBusy}
      {aiRegenBusy}
      {aiMutationBusy}
      {aiUsageTotal}
      bind:aiQueue
      {aiRejected}
      {aiDuplicates}
      {aiCost}
      {aiQueueBankId}
      {aiSaved}
      {editingAiId}
      {aiEditDraft}
      {aiEditError}
      {aiTaskLog}
      {t}
      onback={() => view = "entry"}
      onchangeView={(v) => (view = v)}
      onfromDoc={aiSourceFromCurrentDoc}
      onimportGlean={() => void importGleanClips()}
      onmarkGleanDone={() => void markGleanDone()}
      ongenerate={runAiGenerate}
      oncancel={cancelAiGenerate}
      onretryRejected={retryRejected}
      onapproveAll={approveAllAi}
      onclearQueue={async () => {
        if (aiQueue.length === 0) return;
        const ok = await confirmDialogSync({
          title: "清空 AI 候选池",
          content: `确定要清空当前 ${aiQueue.length} 道 AI 生成的候选题目吗？未采纳的题目将被丢弃。`,
        });
        if (ok) {
          aiQueue = [];
          void persistAiQueue();
        }
      }}
      onstartEdit={(q) => startEditAi(q)}
      onsaveEdit={(q) => saveEditAi(q)}
      oncancelEdit={cancelEditAi}
      onapproveOne={(q) => approveAi(q)}
      onregenOne={(q) => regenOneAi(q)}
      ondropOne={(q) => dropAi(q)}
    />
  {:else if view === "materials"}
    <MaterialsView
      {app}
      {offline}
      {materialsList}
      {materialsFiltered}
      {selectedMaterial}
      {materialsBusy}
      {materialsNote}
      bind:materialsSearch
      bind:matLink
      bind:matLinkTitle
      bind:matSubject
      bind:matChapter
      {notesOpenId}
      {notesCache}
      {noteEditingId}
      bind:notePage
      bind:noteTime
      bind:noteQuote
      bind:noteText
      bind:noteTags
      {noteDirty}
      {noteFormError}
      {materialNoteCounts}
      {materialQuestionCounts}
      {t}
      {matIconName}
      {locatorLabel}
      {needsRelocate}
      onback={() => view = "entry"}
      onchangeView={(v) => (view = v)}
      bind:materialFileInput
      onpickFile={() => materialFileInput?.click()}
      onfileChange={onMaterialFile}
      onregisterLink={registerMaterialLink}
      onselectMaterial={(id) => { selectedMaterialId = id; }}
      onopenMaterial={openMaterial}
      ontoggleNotes={toggleNotes}
      onbridgeToManual={bridgeMaterialToManual}
      onbridgeToAi={bridgeMaterialToAi}
      onremoveMaterial={(m) => void removeMaterialEntry(m)}
      onopenMaterialAt={openMaterialAt}
      onstartEditNote={(n) => void startEditNote(n)}
      onremoveNote={(m, n) => void removeNoteEntry(m, n)}
      onsaveNote={(m) => void saveNote(m)}
      onresetNoteForm={resetNoteForm}
    />
  {:else if view === "browse"}
    <BrowseStudioView
      bind:searchText
      bind:filterType
      bind:filterStatus
      bind:filterSource
      bind:filterDays
      {sourceOptions}
      bind:filterWrong
      bind:filterDispute
      bind:filterHelp
      bind:favOnly
      bind:filterUserTag
      {smartViews}
      bind:selectedView
      {smartViewBusy}
      {smartViewLoadBusy}
      {smartViewLoadFailed}
      {smartViewError}
      {activeBankId}
      bankName={bankName || "题库试题"}
      {shownQuestions}
      {questions}
      {sectionOpen}
      bind:batchMode
      bind:selectedIds
      bind:moreOpen
      bind:kpOpen
      bind:healthOpen
      bind:errataOpen
      bind:paperOpen
      bind:sectionSel
      {sectionLabel}
      bind:moreRoot
      bind:morePop
      {app}
      {showMessage}
      {questionMap}
      {sectionBusy}
      {sectionTree}
      {kpData}
      bind:kpMergeFrom
      bind:kpMergeTo
      bind:kpMergePlan
      bind:kpFillKp
      bind:kpFillPlan
      {kpBusy}
      {kpNote}
      {sylDoc}
      {sylKpStats}
      bind:sylPublisher
      bind:sylYear
      bind:sylSource
      bind:sylText
      {sylPreviewRoots}
      {sylError}
      {sylNote}
      bind:paperText
      {paperPreview}
      {paperBusy}
      {paperNote}
      {errataBusy}
      {errataErrors}
      {errataPlan}
      {errataNote}
      {selectedCount}
      {batchCardBusy}
      bind:batchField
      bind:batchValue
      {batchBusy}
      {batchPreview}
      {batchUndoHere}
      {appliedChanges}
      {batchUndo}
      {batchNote}
      {health}
      {answerDist}
      {unreviewed}
      {coverage}
      bind:activeClusterIndex
      {mergeBusy}
      {orphanDiag}
      {filterOrphanKind}
      {batchList}
      {rollbackBusy}
      {questionsError}
      {filteredQuestions}
      {expandedId}
      {LIFECYCLE_LABELS}
      {isQuestionDisputed}
      activePeekQuestion={activePeekQuestion && activePeekQuestion.blockId ? activePeekQuestion as Question & { blockId: string } : null}
      bind:peekDrawerEl
      {backlinkCache}
      {currentPeekIndex}
      {hasPrevPeek}
      {hasNextPeek}
      {favBusy}
      {editingId}
      bind:editDraft
      bind:editSpecOpen
      bind:editSpecUnit
      bind:editSpecAbsTol
      bind:editSpecRelPct
      bind:editSpecAltUnits
      {editBusy}
      {offline}
      {editError}
      bind:peekHideAnswer
      {itemAnalysisOpenFor}
      {itemAnalysisReport}
      {revOpenFor}
      {revLoadingFor}
      {revRestoreKey}
      {revRestoreFailedKey}
      {revLoaded}
      {revLoadError}
      {revRestoreError}
      {revList}
      {disputeFormOpenFor}
      bind:disputeReason
      bind:disputeNote
      bind:disputeResolution
      {disputeBusy}
      {disputeError}
      {peekLifecycleBusy}
      {peekLifecycleError}
      {backlinkBusyFor}
      {backlinkError}
      {qrefView}
      {qrefActionError}
      {qrefBusyFor}
      bind:qrefFormFor
      bind:qrefMatId
      bind:qrefPage
      bind:qrefTime
      {qrefError}
      {receiptOpenFor}
      {receiptStored}
      {receiptCache}
      {receiptBusy}
      {receiptMisdiagnosis}
      {flashError}
      {flashBusy}
      bind:flashCandidates
      {t}
      {isStubbornWrong}
      {getStubbornRemediation}
      {isAttemptVersionDrifted}
      {removeChoiceOption}
      {summarizeLoad}
      {getQuestionLifecycle}
      {hasMore}
      onbrowseLimit200={() => (browseLimit = 50)}
      onapplyNamedView={(v) => void applyNamedView(v)}
      ondeleteNamedView={() => void deleteNamedView()}
      onsaveCurrentView={() => void saveCurrentView()}
      onloadSmartViews={() => void loadSmartViews()}
      onbackToEntry={() => { view = "entry"; }}
      onstartFilteredFocusDrill={startFilteredFocusDrill}
      ontoggleSectionTree={() => void toggleSectionTree()}
      ontoggleBatchMode={() => { batchMode = !batchMode; if (!batchMode) selectedIds = {}; }}
      ontoggleMore={() => toggleMore()}
      onexportBankCsv={exportBankCsv}
      onprintQuestionSheet={printQuestionSheet}
      onprintAnswerSheet={printAnswerSheet}
      onprintAnswerCard={printAnswerCard}
      onprintFilteredByFormat={(f) => void printFilteredByFormat(f)}
      onexportItemQualityReport={() => void executeBankExportAction("quality_report", app, activeBankId, bankName, showMessage)}
      onexportGiftFormat={() => void executeBankExportAction("gift", app, activeBankId, bankName, showMessage)}
      onexportAnkiFormat={() => void executeBankExportAction("anki", app, activeBankId, bankName, showMessage)}
      onexportMdDocFormat={() => void executeBankExportAction("mddoc", app, activeBankId, bankName, showMessage)}
      onexportLvCardsPackage={async () => {
        const { exportLvCardsPackageFile } = await import("./services/bankExportService");
        await exportLvCardsPackageFile(bankName, activeBankId, questions, showMessage);
      }}
      onexportQCardsJson={async () => {
        const { exportQCardsJsonFile } = await import("./services/bankExportService");
        await exportQCardsJsonFile(bankName, questions, showMessage);
      }}
      onclearSectionSel={() => { sectionSel = null; }}
      onsearchKp={(kp) => setSearch(kp)}
      onpreviewKpMerge={previewKpMerge}
      onpreviewKpFill={previewKpFill}
      onapplyKpPlan={(plan) => void applyKpPlan(plan)}
      ondownloadSyllabusGaps={downloadSyllabusGaps}
      onexportSyllabusAudit={() => void executeBankExportAction("syllabus_audit", app, activeBankId, bankName, showMessage)}
      onpreviewSyllabus={previewSyllabus}
      onimportSyllabus={() => void importSyllabus()}
      onapplyTaxonomyPreset={async () => {
        if (!app) return;
        try {
          const res = await app.applyTaxonomyPreset();
          dataRev++;
          sylNote = `已成功载入国家新课标学科图谱大纲（${res.roots.length} 个领域，${res.relations.length} 条先修拓扑边）✓`;
          showMessage(sylNote, 3000, "info");
        } catch (e) {
          sylError = String(e instanceof Error ? e.message : e);
          showMessage(sylError, 3500, "error");
        }
      }}
      onapplyPaperRecall={() => void applyPaperRecall()}
      onexportErrataTemplate={exportErrataTemplate}
      onerrataFile={onErrataFile}
      onapplyErrata={() => void applyErrata()}
      onselectAllCurrentPage={selectAllCurrentPage}
      onclearSelection={clearSelection}
      onbatchConvertToCards={() => void batchConvertToCards()}
      onprintSelectedQuestions={(f) => void printSelectedQuestions(f)}
      onapplyBatch={(isUndo) => applyBatch(isUndo)}
      onpreviewBatch={previewBatch}
      ontoggleCluster={(idx) => toggleCluster(idx)}
      onmergeClusterToTarget={(q, ids) => mergeClusterToTarget(q, ids)}
      ondrillOrphanKind={(k) => drillOrphanKind(k)}
      ondownloadHealthCsv={downloadHealthCsv}
      onundoBatch={(batch) => undoBatch(batch)}
      onclearBrowseFilters={clearBrowseFilters}
      onclearOrphanFilter={clearOrphanFilter}
      ontoggleBrowseQuestion={(id) => toggleBrowseQuestion(id)}
      onclosePeekDrawer={closePeekDrawer}
      onpeekDrawerKeydown={onPeekDrawerKeydown}
      onprevPeek={prevPeekQuestion}
      onnextPeek={nextPeekQuestion}
      ontoggleFavQuestion={(q) => void toggleFavQuestion(q)}
      onopenInSiYuan={(rid, bid, opt) => {
        closePeekDrawer();
        openInSiYuan(rid, bid, opt);
      }}
      onttsSpeak={handleTtsSpeak}
      onsaveEdit={(q) => void saveEdit(q)}
      oncloseEditForm={closeEditForm}
      onsnoozeWrong={(qid, days) => void snoozeWrong(qid, days)}
      onarchiveWrong={(qid) => void archiveWrong(qid)}
      onunarchiveWrong={(qid) => void unarchiveWrong(qid)}
      ontoggleItemAnalysis={(q) => toggleItemAnalysis(q)}
      ondownloadItemAnalysisCsv={(rep) => downloadItemAnalysisCsv(rep)}
      ontoggleRevisions={(qid) => void toggleRevisions(qid)}
      onloadRevisions={(qid) => void loadRevisions(qid)}
      onrestoreRevision={(q, r) => void restoreRevision(q, r)}
      ondrillSingleQuestion={(q) => void drillSingleQuestion(q)}
      onopenEditForm={(q) => openEditForm(q)}
      oncloneToManualStudio={(q) => cloneToManualStudio(q)}
      ontoggleDisputeForm={(q) => toggleDisputeForm(q)}
      onchangePeekLifecycle={(q, st) => void changePeekLifecycle(q, st)}
      onloadBacklinks={(bid) => void loadBacklinks(bid)}
      onopenQref={(qid) => openQref(qid)}
      onstartQrefForm={(qid) => startQrefForm(qid)}
      onremoveQref={(qid) => void removeQref(qid)}
      onsaveQref={(qid) => void saveQref(qid)}
      ontoggleReceipts={(qid) => toggleReceipts(qid)}
      onrunReceiptMisdiagnosis={(q, e) => void runReceiptMisdiagnosis(q, e)}
      onmakeFlashCandidates={(q) => void makeFlashCandidates(q)}
      onconfirmFlashCards={(q) => void confirmFlashCards(q)}
      onstartSingleById={(qid) => void startSingleById(qid)}
      onsubmitResolveDispute={(q) => void submitResolveDispute(q)}
      onsubmitClearDispute={(q) => void submitClearDispute(q)}
      onsubmitFlagDispute={(q) => void submitFlagDispute(q)}
      onloadMore={() => (browseLimit += 50)}
    />
  {:else if view === "import"}
    <ImportStudioView
      {hasBank}
      {banks}
      {importCheckpoint}
      {importBusy}
      bind:importDragOver
      bind:importSubTab
      bind:importDocProfile
      bind:docSearchQuery
      {siyuanDocBusy}
      {siyuanDocCandidates}
      bind:selectedDocIds
      {selectedDocCount}
      {clozeModes}
      bind:clozeInputText
      {clozeImporting}
      {clozeParsedItems}
      bind:importText
      {importParsing}
      bind:dupeStrategy
      {savedMappings}
      bind:selectedMapping
      {sheetRowsCache}
      {activeSheet}
      {manualMap}
      bind:mapEditorOpen
      {mapAssign}
      {MAP_FIELDS}
      {mapErrors}
      {importError}
      {importReport}
      {importPreviewBankId}
      {spotBusy}
      {spotIds}
      {spotHtml}
      {fixRow}
      {fixCells}
      bind:fixText
      {fixNote}
      {lastMap}
      {mappingBusy}
      {committing}
      {remainingImportQuestions}
      {trialConfirmed}
      {trialBusy}
      {commitProgress}
      {trialNote}
      {importResult}
      {updateResult}
      {retryPool}
      {t}
      {escapeHtml}
      {columnLabel}
      onback={() => view = hasBank ? "entry" : "entry"}
      onchangeView={(v) => (view = v)}
      onResumeCheckpoint={resumeCheckpoint}
      onDiscardCheckpoint={discardCheckpoint}
      onImportFileDrop={onImportFileDrop}
      onDoSearchDocs={(q) => void doSearchDocs(q)}
      onToggleSelectAllDocs={toggleSelectAllDocs}
      onImportSelectedDocs={importSelectedDocs}
      onImportAllSearchedDocs={importAllSearchedDocs}
      onPickAndImportSiyuanDoc={(id, title) => void pickAndImportSiyuanDoc(id, title)}
      onAiExtractDoc={(id, title) => void aiExtractSiyuanDoc(id, title)}
      hasGleanPlugin={Boolean(getBridgeSafely("glean") || (typeof window !== "undefined" && (window as any).siyuanGlean))}
      gleanClipsList={gleanClips}
      gleanClipsLoading={gleanLoading}
      bind:selectedGleanIds
      {selectedGleanCount}
      onloadGleanClips={() => void loadGleanClips()}
      onextractSelectedGlean={() => void importSelectedGleanDocs()}
      ontoggleGleanId={(id) => { selectedGleanIds[id] = !selectedGleanIds[id]; selectedGleanIds = { ...selectedGleanIds }; }}
      ontoggleSelectAllGlean={toggleSelectAllGlean}
      onPickGleanClip={(c) => void pickAndImportSiyuanDoc(c.id, c.title)}
      onAiExtractGleanClip={(c) => void aiExtractSiyuanDoc(c.id, c.title)}
      onToggleClozeMode={(m) => toggleClozeMode(m)}
      onDoParseCloze={doParseCloze}
      onImportClozeQuestions={importClozeQuestions}
      bind:importFileInput
      onPickExcel={() => importFileInput?.click()}
      onExcelFile={onExcelFile}
      onDownloadTemplate={downloadTemplate}
      onPasteClipboard={pasteClipboardToImport}
      onDoParseText={doParseText}
      onImportStrategyChange={onImportStrategyChange}
      onToggleMapEditor={toggleMapEditor}
      onApplyManualMap={applyManualMap}
      onCancelMapEditor={() => (mapEditorOpen = false)}
      onSpotCheckRender={() => void spotCheckRender()}
      onStartRowFix={(row) => startRowFix(row)}
      onApplyRowFix={(row) => void applyRowFix(row)}
      onCancelRowFix={cancelRowFix}
      onDownloadErrorsCsv={downloadErrorsCsv}
      onSaveMapping={saveMapping}
      onCommitImport={commitImport}
      onCancelCommit={() => { commitCancelRequested = true; }}
      onTrialImport5={trialImport5}
      onRetryMissing={retryMissing}
      onGoPractice={() => { view = "entry"; void loadQuestions(); }}
      onGoBrowse={() => { view = "browse"; void loadQuestions(); }}
      bind:selectedTag
      bind:customTagInput
      {taggedBlocks}
      {tagSearchBusy}
      onDoSearchTags={(tg) => void doSearchTags(tg)}
      onImportTagQuestions={(tg) => void doImportTagQuestions(tg)}
      {paperOcrBusy}
      onSegmentPaperText={(txt, name) => void doSegmentPaperText(txt, name)}
      onPaperImageUpload={(file) => void handlePaperImageFile(file)}
    />
  {:else if view === "marketplace"}
    <MarketplaceStudioView
      {app}
      {readLocal}
      {writeLocal}
      {showMessage}
      onback={() => { view = "entry"; }}
      onbankCreated={async (newId) => {
        activeBankId = newId;
        await onBankSwitch();
        banks = app.listBanks();
        view = "browse";
        void loadQuestions();
      }}
      onstartCartDrill={async (cartItems) => {
        try {
          const { cartItemsToQuestions } = await import("@/core/marketplaceCart");
          const { installCartQuestionsToBank } = await import("./services/marketplaceService");
          const qs = cartItemsToQuestions(cartItems);
          const nowStr = new Date().toISOString().slice(5, 10).replace("-", "");
          const bankTitle = `🛒 集市挑选专练-${nowStr}`;

          let targetBank = banks.find((b) => b.name === bankTitle);
          let targetBankId = targetBank?.id;
          if (!targetBankId) {
            const bRes = await installCartQuestionsToBank(app, bankTitle, qs);
            if (!bRes.success || !bRes.bankId) {
              showMessage(`创建专练题库失败：${bRes.error || "未知错误"}`, 3500, "error");
              return;
            }
            targetBankId = bRes.bankId;
            banks = app.listBanks();
          } else {
            for (const q of qs) {
              await app.writeManualQuestion(targetBankId, q);
            }
          }
          activeBankId = targetBankId;
          await onBankSwitch();
          const loaded = await loadQuestions();
          await safeStart(groupAdjacent(loaded.length ? loaded : qs), "quick", () => {
            enterSessionView();
            restoreQuestionControls();
            showMessage(`已就地开启跨学科试题篮精选特训（共 ${qs.length} 题）🚀`, 3200, "info");
          });
        } catch (err) {
          showMessage(`启动试题篮练习异常：${String(err instanceof Error ? err.message : err)}`, 3500, "error");
        }
      }}
      oncloneCartToBank={async (cartItems, bankName) => {
        try {
          const { cartItemsToQuestions } = await import("@/core/marketplaceCart");
          const { installCartQuestionsToBank } = await import("./services/marketplaceService");
          const qs = cartItemsToQuestions(cartItems);
          const bRes = await installCartQuestionsToBank(app, bankName, qs);
          if (!bRes.success || !bRes.bankId) {
            showMessage(`保存题库失败：${bRes.error || "未知错误"}`, 3500, "error");
            return;
          }
          activeBankId = bRes.bankId;
          await onBankSwitch();
          banks = app.listBanks();
          view = "browse";
          void loadQuestions();
          showMessage(`已成功创建专属题库《${bankName}》（共 ${qs.length} 题）✓`, 3200, "info");
        } catch (err) {
          showMessage(`保存专属题库异常：${String(err instanceof Error ? err.message : err)}`, 3500, "error");
        }
      }}
    />
  {/if}
    </div>
    <Palette commands={paletteCommands} bind:open={paletteOpen} {t} />
    {#if view === "session" && session && !sessionDone}
      <div class="lv-session-floating-sheet" style="position:fixed;bottom:22px;right:22px;z-index:90">
        <button
          type="button"
          class="lv-achievement-pill"
          style="box-shadow:var(--lv-sh-pop);cursor:pointer;font-size:12px;padding:6px 14px;border-radius:var(--lv-radius-pill, 9999px)"
          onclick={() => (sessionSheetOpen = !sessionSheetOpen)}
          title="展开会话答题卡"
        >
          <Icon name="grid" size={13} />
          <span>{curProgress.done}/{curProgress.total} 题</span>
        </button>
      </div>
    {/if}
    {#if view === "browse" && batchMode && selectedCount > 0}
      <BrowseBatchActionBar
        {selectedCount}
        {batchCardBusy}
        kernelOnline={!!app?.kernelOnline}
        onclearSelection={clearSelection}
        onstartFocusDrill={startFilteredFocusDrill}
        onopenAssembleStudio={() => {
          const selected = questions.filter((q) => selectedIds[q.id]);
          if (selected.length) {
            tabAssembleQuestions = selected;
            tabAssembleOpen = true;
          } else {
            showMessage("请先勾选需要组卷排版的题目", 2000, "info");
          }
        }}
        onprintSelectedQuestions={(f) => void printSelectedQuestions(f)}
        onbatchConvertToCards={() => void batchConvertToCards()}
      />
    {/if}
    <SessionSheetModal
      open={sessionSheetOpen}
      {session}
      doneCount={curProgress.done}
      totalCount={curProgress.total}
      title={t("session.sheetTitle", "练习答题卡")}
      onclose={() => (sessionSheetOpen = false)}
      onjump={(i) => {
        session.jumpTo(i);
        sessionRev++;
        restoreQuestionControls();
        sessionSheetOpen = false;
      }}
    />
    <BankGalleryModal
      open={bankHubOpen}
      {banks}
      {activeBankId}
      {bankQuestionCounts}
      {creating}
      {offline}
      {t}
      {getBankCategoryMeta}
      onclose={() => bankHubOpen = false}
      onselectBank={(id) => { activeBankId = id; onBankSwitch(); bankHubOpen = false; }}
      oncreateSampleBank={(kind) => { bankHubOpen = false; void createSampleBank(kind); }}
      onrenameBank={async (id, newName) => {
        if (!app) return;
        try {
          await app.renameBank(id, newName);
          banks = app.listBanks();
          showMessage("题库名称已更新 ✓", 2500, "info");
        } catch (e) {
          showMessage(String(e instanceof Error ? e.message : e), 3500, "error");
        }
      }}
      oncycleBankCategory={cycleBankCategory}
      onsyncBankToDoc={syncBankToDoc}
      onremoveBank={removeActiveBank}
      onopenMarketplace={() => { bankHubOpen = false; marketplaceOpen = true; }}
    />
    <MarketplaceModal
      bind:open={marketplaceOpen}
      {app}
      {readLocal}
      {writeLocal}
      {showMessage}
      onclose={() => (marketplaceOpen = false)}
      onbankCreated={async (newId) => {
        activeBankId = newId;
        await onBankSwitch();
        banks = app.listBanks();
        marketplaceOpen = false;
      }}
    />
    <ShortcutsHelpModal
      open={hotkeysHelpOpen}
      version={manifest.version}
      title={t("hotkeys.title")}
      onclose={() => hotkeysHelpOpen = false}
    />
    {#if diagnosisModal}
      <button type="button" class="lv-hotkeys-backdrop" aria-label="关闭自适应诊断弹层" onclick={() => (diagnosisModal = null)}></button>
      <div class="lv-hotkeys-wrap">
        <div class="lv-card" role="dialog" aria-modal="true" tabindex="-1" aria-label="错题自适应先修根因诊断" style="width:min(620px, 94vw);max-height:85vh;overflow-y:auto;pointer-events:auto;padding:20px;border-radius:var(--lv-r-card, 20px);border:1px solid var(--lv-border-subtle);box-shadow:var(--lv-sh-pop)">
          <div class="lv-row" style="justify-content:space-between;align-items:center;margin:0 0 12px">
            <div class="lv-dialog-title-wrap">
              <span class="lv-dialog-title-icon"><Icon name="compass" size={13} /></span>
              <span>错题自适应先修根因诊断</span>
            </div>
            <button class="lv-btn sm lv-btn--ghost" onclick={() => (diagnosisModal = null)} aria-label="关闭"><Icon name="close" size={13} /></button>
          </div>
          <div class="lv-card" style="padding:10px 14px;background:var(--lv-surface-2);border-radius:var(--lv-r-2);margin-bottom:12px;border:1px solid var(--lv-border-subtle)">
            <div style="font-size:12px;color:var(--lv-text-3)">目标考点：<b>{diagnosisModal.targetKp}</b></div>
            <div style="font-size:13px;line-height:1.6;margin-top:6px;color:var(--lv-text)">{diagnosisModal.summaryText}</div>
          </div>
          <h3 style="font-size:13px;font-weight:600;margin:12px 0 6px">🗺️ 推荐先修筑基与靶向攻克路线：</h3>
          <div class="stack-sm">
            {#each diagnosisModal.learningPath as stage, si (si)}
              <div class="lv-diagnosis-stage"
                class:lv-stage--root={stage.status === 'root_cause'}
                class:lv-stage--shaky={stage.status === 'shaky'}
                class:lv-stage--target={stage.status === 'untested'}
                style="padding:10px 12px;background:var(--lv-surface);border:1px solid var(--lv-border);border-radius:var(--lv-r-1)">
                <div style="font-weight:600;font-size:13px;display:flex;justify-content:space-between;align-items:center">
                  <span>{stage.title}</span>
                  <span class="lv-chip sm">{stage.status === 'root_cause' ? '薄弱根因' : (stage.status === 'shaky' ? '掌握不稳' : '冲刺目标')}</span>
                </div>
                {#if stage.recommendedQuestions.length > 0}
                  <div class="lv-row" style="margin:6px 0 0;justify-content:space-between;align-items:center">
                    <span style="font-size:12px;color:var(--lv-text-3)">
                      推荐强化题量：共 {stage.recommendedQuestions.length} 题
                    </span>
                    <button
                      type="button"
                      class="lv-btn sm lv-btn--primary"
                      style="font-size:11px;padding:2px 8px;display:inline-flex;align-items:center;gap:3px"
                      onclick={() => {
                        const qs = stage.recommendedQuestions;
                        diagnosisModal = null;
                        void startQuickPractice(qs, `已开启阶段【${stage.title}】针对性攻坚特训（共 ${qs.length} 题）`);
                      }}
                    >
                      <Icon name="play" size={11} /> 攻坚此阶段
                    </button>
                  </div>
                {/if}
              </div>
            {/each}
          </div>
          <div class="lv-row" style="margin-top:16px;justify-content:flex-end">
            <button class="lv-btn sm lv-btn--primary" onclick={() => (diagnosisModal = null)}>关闭</button>
          </div>
        </div>
      </div>
    {/if}
    <PaperAssembleModal
      open={tabAssembleOpen}
      bankName={bankName || "试题组卷"}
      questions={tabAssembleQuestions}
      onclose={() => (tabAssembleOpen = false)}
      {showMessage}
    />
  </div>
</div>

<style>
  .lv-pad { padding: var(--lv-space-4) 22px var(--lv-space-9); overflow: auto; }
  .lv-stage--root { border-left: 4px solid var(--lv-accent-seal) !important; }
  .lv-stage--shaky { border-left: 4px solid var(--lv-accent) !important; }
  .lv-stage--target { border-left: 4px solid var(--lv-brand) !important; }
  @container lv-exam (max-width: 680px) {
    .lv-session-floating-sheet {
      display: none !important;
    }
  }
</style>
