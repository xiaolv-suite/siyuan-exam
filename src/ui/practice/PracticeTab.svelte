<script lang="ts">
    // 练习台：入口(S1) / 会话(S2) / 浏览(S3) / 导入(S9) 四视图
    // 状态设计（docs/11）：loading/empty(守卫)/error/normal 四态可达
    import { onMount, tick } from "svelte";
import { showMessage } from "siyuan";
import manifest from "../../../plugin.json";
import { logCheckinEventSafely, getBridgeSafely } from "@/libs/ecosystem-bridge-kit";
import { renderMathInText } from "@/core/math";
import { renderMathDiagramsInText } from "@/core/mathDiagram";
import { auditForgettingRisks } from "@/core/forgettingRisk";
import { sanitizeRichHtml } from "@/libs/sanitize";
    import { planToday, parseExamProfiles, nearestUpcoming, nextPlanTrace, remainingPlan } from "@/core/planner";
import { ttsSpeak, ttsSupported } from "@/core/tts";
    import type { ExamApp, BankInfo } from "../../app";
    import type { Question } from "../../core/types";
    import { parseText, parseExcelRows, autoMapExcel, errorsToCsv, extractTextRowAt, type ImportReport } from "../../importer/pipeline";
    import { columnLabel, autoAssignment, assignmentFromMap, assignmentToMap, assignmentErrors, emptyAssignment, type MapAssignment } from "../../importer/mapping";
    import { formatSecToTime, parseTimeToSec, locatorLabel, locatedUrl, needsRelocate, revisionStale } from "@/core/materialNotes";
    import { groupAdjacent } from "../../core/session";
    import { makeQuestion } from "../../core/blockTemplate";
    import { normalizeAnswer, questionHash } from "../../core/answer";
    import { specOf, splitBlanks, joinBlanks } from "../../core/structuredAnswer";
    import {
      parseRubricFromText, validateRubric, scoreRubric,
      createRubricAssessmentSnapshot, isRubricDrifted, exportRubricBreakdownCsv,
      DEFAULT_RUBRIC_LEVELS, type RubricSpec, type CriterionRating, type CriterionAssessment,
      type RubricAssessmentSnapshot,
    } from "../../core/rubric";
    import { startTrail, recordEdit, trailValue, trailChanged, withLastEditReason, type AnswerTrail } from "../../core/answerTrail";
    import { helpFromExposure } from "../../core/exposure";
    import { abandonedExposureInputs } from "../../core/exposure";
    import { randomSeedId } from "../../core/random";
    import { newBatchId } from "../../core/ids";
    import { ELIMINATE_STREAK, localDate, streak, wrongReasonMix } from "../../core/replayer";
    import { countWordsAndCharacters, generatePaperGrid } from "../../core/wordCount";
    import { recentlySeen } from "../../core/exposure";
    import { validate } from "../../importer/pipeline";
    import {
      bankHealthReport,
      coverageStats,
      answerDistribution,
      unreviewedStats,
      detectOrphans,
      exportHealthReportCsv,
      type BankHealthReport,
      type OrphanDiagnosis,
      type OrphanKind,
    } from "../../core/bankHealth";
    import { planBatchEdit, invertPlan } from "../../core/batchEdit";
    import { buildSectionTree } from "../../core/sectionTree";
    import { matchesBrowseFilter } from "../../core/browseFilter";
    import { queueKindOf, queueSemantics, writeBackReceipt } from "../../core/queueIdentity";
    import { RatingGuard, ratingAttemptKey, type RatingOutcomeView } from "../../core/ratingOutcome";
    import { upsertView, viewBankMismatch } from "@/core/smartViews";
    import { avgMsByType, estimatePlanMinutes } from "@/core/timeBudget";
    import { kpAudit, planKpMerge, planEmptyKpFill } from "@/core/kpGovernance";
    import { gapsToCsv } from "@/core/syllabus";
    import { parseErrataCsv, planErrata, errataTemplateCsv } from "@/core/errata";
    import { buildQuestionSheet, buildAnswerSheet, buildAnswerCardSheet } from "@/core/printSheet";
    import { parsePaperAnswers, gradePaper } from "@/core/paperRecall";
    import { probeCheckinApi, syncCheckin, localDateKeyOf, bridgeEnabled, fetchStreak } from "@/core/checkinBridge";
    import { probeGlean, listLaterClips, formatClipsForSource, markClipDone, type GleanClip } from "@/core/gleanBridge";
    import { resolveLink } from "@/core/externalLinks";
    import { redactUrlForDisplay } from "@/core/urlRedaction";
    import { onExamEvent, emitExamEvent, computeWeakKnowledgePoints } from "@/core/bus";
    import PracticeDoneCard from "./PracticeDoneCard.svelte";
    import ShortcutsHelpModal from "./ShortcutsHelpModal.svelte";
    import BankGalleryModal from "./BankGalleryModal.svelte";
    import SessionSheetModal from "./SessionSheetModal.svelte";
    import ScratchpadDrawer from "./ScratchpadDrawer.svelte";
    import SpeechEvalCapsule from "./SpeechEvalCapsule.svelte";
    import GroupBatchSummaryCard from "./GroupBatchSummaryCard.svelte";
    import MaterialGroupContextCard from "./MaterialGroupContextCard.svelte";
    import ReciteStudioView from "./ReciteStudioView.svelte";
    import WrongbookStudioView from "./WrongbookStudioView.svelte";
    import ImportStudioView from "./ImportStudioView.svelte";
    import QuestionPeekDrawer from "./QuestionPeekDrawer.svelte";
    import BrowseBatchActionBar from "./BrowseBatchActionBar.svelte";
    import BrowseMaintenanceDrawers from "./BrowseMaintenanceDrawers.svelte";
    import TeacherWorkspaceView from "./TeacherWorkspaceView.svelte";
    import MaterialsView from "./MaterialsView.svelte";
    import AiStudioView from "./AiStudioView.svelte";
    import ManualStudioView from "./ManualStudioView.svelte";
    import Icon from "../shared/Icon.svelte";
    import Palette from "../shared/Palette.svelte";
    import type { PaletteCommand } from "../shared/Palette.svelte";
    import { SvelteMap, SvelteSet } from "svelte/reactivity";
    import Rail from "../shared/Rail.svelte";
    import { escapeHtml, renderInlineText } from "../../libs/sanitize";
    import { questionFingerprint } from "@/ai/task";
    import { summarizeLoad } from "@/ai/flashCandidates";
    import { resolveAiKey } from "@/ai/secrets";
    import SaveStatus from "../shared/SaveStatus.svelte";
    import { SAMPLE_BANK_NAME, SAMPLE_QUESTION_COUNT } from "@/core/sampleBank";
    import { CANTONESE_SAMPLE_BANK_NAME, CANTONESE_SAMPLE_QUESTION_COUNT } from "@/core/cantoneseSample";
    import { ENGLISH_SAMPLE_BANK_NAME, ENGLISH_SAMPLE_QUESTION_COUNT } from "@/core/englishSample";
    import { QUALIFICATION_SAMPLE_BANK_NAME, QUALIFICATION_SAMPLE_QUESTION_COUNT } from "@/core/qualificationSample";
    import { K12_SAMPLE_BANK_NAME, K12_SAMPLE_QUESTION_COUNT } from "@/core/k12Sample";
    import { HIGHER_SAMPLE_BANK_NAME, HIGHER_SAMPLE_QUESTION_COUNT } from "@/core/higherSample";
    import { getBankCategoryMeta, type BankCategory } from "@/core/bankCategory";
    import { answerChoices, isChoiceQuestion, removeChoiceOption, toggleChoice } from "@/core/answerChoices";
    import { isQuestionDisputed, type DisputeReason } from "@/core/dispute";
    import { isStubbornWrong, getStubbornRemediation } from "@/core/stubborn";
    import { getScratchpadText, updateScratchpadText, clearCurrentScratchpad, type ScratchpadStore, type ScratchpadMode } from "@/core/scratchpad";
    import { parseClozeText, clozeItemsToQuestions, type ParsedClozeItem } from "@/core/cloze";
    import { buildMaterialGroupContext, formatMaterialGroupHeader, type SiblingItem } from "@/core/materialContext";
    import { resolveFeedbackTimingMode, isGroupBatchBoundary, calculateGroupBatchSummary, type GroupBatchSummary, DEFAULT_GROUP_FEEDBACK_SIZE } from "@/core/feedbackTiming";
    import { analyzeQuestionUsage, exportItemAnalysisCsv, type ItemAnalysisReport } from "@/core/itemAnalysis";
    import { checkPublishGuard, createQuestionVersionSnapshot, getQuestionLifecycle, isAttemptVersionDrifted, LIFECYCLE_LABELS, questionDraftFromRevision, type QuestionLifecycleStatus } from "@/core/revision";
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

    type View = "entry" | "session" | "browse" | "import" | "recite" | "manual" | "ai" | "materials" | "wrongbook";
    let view: View = $state("entry");
    let soundEnabled = $state(readLocal("lv-exam/sound") !== "0");
    let speedDrillEnabled = $state(readLocal("lv-exam/speed-drill") === "1");
    let userRole = $state<"student" | "teacher">(readLocal("lv-exam/role") === "teacher" ? "teacher" : "student");
    let hotkeysHelpOpen = $state(false);
    let paperGridModalOpen = $state(false);
    let shortLinedPaper = $state(readLocal("lv-exam/lined-paper") === "1");
    let studyFontSize = $state<"normal" | "large" | "xlarge">((readLocal("lv-exam/font-scale") as any) || "normal");
    function cycleStudyFontSize() {
      studyFontSize = studyFontSize === "normal" ? "large" : studyFontSize === "large" ? "xlarge" : "normal";
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
      if (e.changedTouches.length !== 1) return;
      if (view !== "session" || !session) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      const deltaX = e.changedTouches[0].clientX - touchStartX;
      const deltaY = e.changedTouches[0].clientY - touchStartY;
      const deltaTime = Date.now() - touchStartTime;

      if (Math.abs(deltaX) > 60 && Math.abs(deltaX) > Math.abs(deltaY) * 2 && deltaTime < 600) {
        if (deltaX < 0) {
          if (feedback || (session?.current && !isChoiceQuestion(session.current))) {
            nextQuestion();
          }
        } else {
          previousQuestion();
        }
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
    /** 上次使用题库的记忆键（localStorage；多库切换与重载恢复） */
    const BANK_PREF_KEY = "lv-exam/activeBank";
    let questions = $state<(Question & { blockId: string; rootId: string })[]>([]);
    let questionsError = $state("");
    let questionsLoaded = $state(false);
    let questionLoadSeq = 0;
    let viewportBottomPad = $state(0);
    const hasCardsPlugin = $derived(Boolean(getBridgeSafely("cards")));

    const criticalForgettingKps = $derived.by(() => {
      if (!questions.length || !app) return [];
      const rep = auditForgettingRisks(questions, app.attempts.all());
      return rep.urgentRescueKps.filter((k) => k.riskTier === "critical");
    });

    async function rescueEbbinghausNow() {
      if (!criticalForgettingKps.length) return;
      const qids = criticalForgettingKps.flatMap((k) => k.candidateQids).slice(0, 10);
      const qs = qids.map((id) => questionMap.get(id)).filter(Boolean) as Question[];
      if (!qs.length) return;
      await safeStart(qs, "quick", () => {
        feedback = null; selected = ""; confidenceSel = ""; sessionDone = null;
        view = "session";
        restoreQuestionControls();
        showMessage(`⚡ 已开启艾宾浩斯临界考点急救特训（共 ${qs.length} 题）`, 3000, "info");
      });
    }

    function rescueEbbinghausRecite() {
      if (!criticalForgettingKps.length) return;
      const qids = criticalForgettingKps.flatMap((k) => k.candidateQids).slice(0, 10);
      const qs = qids.map((id) => questionMap.get(id)).filter(Boolean) as Question[];
      if (!qs.length) return;
      reciteQueue = qs;
      reciteCursor = 0; reciteRevealed = false; reciteDone = false; reciteHint = 0; reciteRatings = [];
      reciteSessionId = `s-recite-rescue-${Date.now().toString(36)}`;
      view = "recite";
      if (reciteAutoTts && reciteQueue[0]) {
        ttsSpeak(reciteQueue[0].stem, { lang: reciteQueue[0].studyMeta?.lang, rate: ttsSlowRate ? 0.85 : 1 });
      }
      showMessage(`🚨 已开启艾宾浩斯临界考点背诵流（共 ${qs.length} 题）`, 3000, "info");
    }

    // 题库管理画廊 Hub 状态
    let bankHubOpen = $state(false);
    let sessionSheetOpen = $state(false);

    async function cycleBankCategory(b: BankInfo) {
      if (!app) return;
      const order: BankCategory[] = ["exam", "language", "teaching", "general"];
      const curIdx = order.indexOf(b.category ?? "general");
      const nextCategory = order[(curIdx + 1) % order.length];
      try {
        await app.updateBankCategory(b.id, nextCategory);
        banks = app.listBanks();
        showMessage(`题库「${b.name}」场景分类已更新为：${getBankCategoryMeta(nextCategory).badge} ✓`, 2500, "info");
      } catch (e) {
        showMessage(`更新分类失败：${String(e instanceof Error ? e.message : e)}`, 3500, "error");
      }
    }

    async function syncBankToDoc(bId: string) {
      if (!app) return;
      try {
        const res = await app.syncBankToSiyuanDoc(bId);
        showMessage(`已同步为思源笔记文档：《${res.title}》✓`, 3500, "info");
      } catch (e) {
        showMessage(String(e instanceof Error ? e.message : e), 4000, "error");
      }
    }

    async function saveWrongbookAsDoc() {
      if (!app || !filteredWrongQueue.length) return;
      try {
        const qs = questions.filter((q) => filteredWrongQueue.some((w) => w.qid === q.id));
        const res = await app.saveQuestionsToSiyuanDoc(
          `${bankName || "小驴题库"} · 错题攻坚手册（${qs.length}题）`,
          qs,
          { bankId: activeBankId, isMock: false },
        );
        showMessage(`已在思源中生成错题集文档：《${res.title}》✓`, 3500, "info");
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
    let reciteAutoTts = $state(readLocal("lv-exam/recite-auto-tts") === "1");
    let ttsSlowRate = $state(readLocal("lv-exam/tts-slow") === "1");
    let speechRecording = $state(false);
    let speechEvalResult = $state<import("@/core/speechEval").SpeechEvalResult | null>(null);
    let speechRecognitionInstance: any = null;

    function startSpeechRecognition(targetText: string, lang = "zh-CN") {
      if (typeof window === "undefined") return;
      const Recognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!Recognition) {
        showMessage("当前运行环境暂未开放语音识别接口，可使用伴学朗读听辨原声磨耳朵", 3500, "info");
        return;
      }
      if (speechRecording && speechRecognitionInstance) {
        try { speechRecognitionInstance.stop(); } catch { /* 静默 */ }
        speechRecording = false;
        return;
      }
      try {
        speechEvalResult = null;
        const rec = new Recognition();
        speechRecognitionInstance = rec;
        rec.lang = lang;
        rec.continuous = false;
        rec.interimResults = false;
        rec.maxAlternatives = 1;

        speechRecording = true;
        rec.onresult = async (event: any) => {
          const transcript = event.results?.[0]?.[0]?.transcript ?? "";
          speechRecording = false;
          if (transcript) {
            const { evaluateSpeechSimilarity } = await import("@/core/speechEval");
            const res = evaluateSpeechSimilarity(transcript, targetText);
            speechEvalResult = res;
            if (res.score >= 80 && soundEnabled) {
              playSuccessChime();
            }
          }
        };
        rec.onerror = () => {
          speechRecording = false;
        };
        rec.onend = () => {
          speechRecording = false;
        };
        rec.start();
      } catch {
        speechRecording = false;
        showMessage("无法启动麦克风录音识别，请检查设备麦克风权限", 3500, "error");
      }
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
      const request = ++revLoadSeq;
      revLoadingFor = qid;
      revLoadError = { ...revLoadError, [qid]: "" };
      try {
        const revisions = await app.questionRevisions(qid);
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
      const key = `${q.id}#${rev.ts}`;
      if (revRestoreKey) return;
      revRestoreKey = key;
      revRestoreError = { ...revRestoreError, [q.id]: "" };
      revRestoreFailedKey = "";
      try {
        const { confirmDialogSync } = await import("../../libs/dialog");
        const confirmContent = rev.summary
          ? t("rev.restoreConfirmFull").replace("{summary}", rev.summary)
          : t("rev.restoreConfirm").replace("{a}", escapeHtml(rev.answer));
        if (!(await confirmDialogSync({ title: t("rev.restoreTitle"), content: confirmContent }))) return;
        const next = await app.updateQuestionContent(q, questionDraftFromRevision(q, rev));
        questions = questions.map((x) => (x.id === q.id ? { ...x, ...next } : x));
        showMessage(t("rev.restored"), 2400, "info");
        try {
          revLoaded = { ...revLoaded, [q.id]: await app.questionRevisions(q.id) };
          revLoadError = { ...revLoadError, [q.id]: "" };
        } catch (e) {
          // The write succeeded; keep its success receipt separate from a later history-read failure.
          revLoadError = { ...revLoadError, [q.id]: String(e instanceof Error ? e.message : e) };
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
      const v = String(value ?? "");
      if (!v) return;
      const existing = trails.get(qid);
      if (!existing) {
        trails.set(qid, startTrail(v));
        return;
      }
      const before = trailValue(existing);
      if (v === before) return; // 取消/重复：不产生轨迹事件（63-03 边界）
      const next = recordEdit(existing, v);
      if (next !== existing) {
        trails.set(qid, next);
        if (next.edits.length > existing.edits.length) reasonPromptQid = qid; // 真实修改 → 询问原因
      }
    }
    function setEditReason(qid: string, reason: "unsure" | "evidence" | "misclick") {
      const t = trails.get(qid);
      if (t) trails.set(qid, withLastEditReason(t, reason));
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

    async function autoAlignRubric() {
      const curQ = session?.current;
      if (!curQ) return;
      const { evaluateStudentAnswerAgainstRubric } = await import("../../core/rubricEvaluator");
      const ansText = isChoiceQuestion(curQ) ? selected : session?.getDraft(curQ.id) || selected;
      const res = evaluateStudentAnswerAgainstRubric({
        studentAnswer: ansText,
        rubric: curQ.rubric,
        fallbackAnalysis: curQ.analysis || curQ.answer,
      });
      rubricEvalResult = res;
      rubricRatings = { ...rubricRatings, ...res.recommendedRatings };
      rubricSaved = false;
      showMessage(t("rubric.autoAligned"), 2500, "info");
    }
    /** 当前题是否有 rubric 规格且在反馈态 */
    const currentRubric = $derived(session?.current?.rubric as RubricSpec | undefined);
    /** 当前题的自评计分（未评项不计入分母） */
    const rubricScore = $derived.by(() => {
      const q = session?.current;
      if (!q?.rubric) return null;
      const assessments: CriterionAssessment[] = Object.entries(rubricRatings).map(([criterionId, rating]) => ({
        criterionId,
        rating,
        note: rubricNotes[criterionId] || undefined,
      }));
      return scoreRubric(q.rubric as RubricSpec, assessments, q.score);
    });
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
    const RUBRIC_ARCHIVE_KEY = "rubric/assessments";
    async function loadRubricArchive() {
      try {
        const v = await app.loadAux<Record<string, RubricAssessmentSnapshot>>(RUBRIC_ARCHIVE_KEY);
        rubricArchive = v && typeof v === "object" ? v : {};
      } catch {
        rubricArchive = {}; // 读取失败按空存档处理（不冒充已有自评）
      }
    }
    /** 记录当前题的自评（冻结快照；未评完也可记录，快照如实标注 unratedCount） */
    async function recordRubricAssessment() {
      const q = session?.current;
      if (!q?.rubric || !rubricScore || rubricSaveBusy) return;
      rubricSaveBusy = true;
      try {
        const snap = createRubricAssessmentSnapshot(rubricScore, q.rubric as RubricSpec);
        rubricArchive = { ...rubricArchive, [q.id]: snap };
        await app.saveAux(RUBRIC_ARCHIVE_KEY, rubricArchive);
        rubricSaved = true;
        showMessage(
          snap.finalScore != null
            ? t("rubric.recordedFinal").replace("{score}", String(snap.finalScore)).replace("{full}", String(snap.fullScore))
            : t("rubric.recordedPartial").replace("{n}", String(snap.unratedCount)),
          2600,
          "info",
        );
      } catch (e) {
        showMessage(t("rubric.recordFailed").replace("{message}", String(e instanceof Error ? e.message : e)), 3200, "error");
      } finally {
        rubricSaveBusy = false;
      }
    }
    function exportCurrentRubricCsv() {
      if (!rubricScore) return;
      const blob = new Blob([exportRubricBreakdownCsv(rubricScore)], { type: "text/csv;charset=utf-8" });
      const a = document.createElement("a");
      const url = URL.createObjectURL(blob);
      a.href = url;
      a.download = `小驴学习-主观题自评-${new Date().toISOString().slice(0, 10)}.csv`;
      a.hidden = true;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 0);
      showMessage(t("rubric.exportReady"), 2600, "info");
    }

    // 题库健康（TODO 2.2）：重复聚类 + 缺字段清单（纯函数，浏览视图按需展开）
    let healthOpen = $state(false);
    const health = $derived<BankHealthReport | null>(healthOpen && questions.length ? bankHealthReport(questions) : null);
    // 67-03 lite：答案分布异常 + 未审校比例（题库健康面板质量卡）
    const answerDist = $derived(healthOpen && questions.length ? answerDistribution(questions) : null);
    const unreviewed = $derived(healthOpen && questions.length ? unreviewedStats(questions) : null);
    /** 43-04 lite：生产者覆盖概览（与健康面板同开）；51-03 lite：注入作答集算已学考点覆盖 */
    const coverage = $derived.by(() => {
      if (!healthOpen || !questions.length) return null;
      // eslint-disable-next-line svelte/prefer-svelte-reactivity -- derived 内累加集（重算即弃，非跨状态）
      const attempted = new Set<string>();
      for (const e of app.attempts.all()) {
        if (e.verdict !== "not_attempted") attempted.add(e.qid);
      }
      return coverageStats(questions, attempted);
    });

    /** 43-04：孤儿题目与引用完整性诊断队列（无母块材料/空材料/断链资料/缺答案/缺选项） */
    const orphanDiag = $derived.by<OrphanDiagnosis | null>(() => {
      if (!healthOpen || !questions.length) return null;
      const knownMaterialIds = new Set(app?.listMaterials().map((m) => m.id) ?? []);
      // eslint-disable-next-line svelte/prefer-svelte-reactivity -- derived 内累加映射（重算即弃，非跨状态）
      const links = new Map<string, string>();
      if (app) {
        for (const q of questions) {
          const ref = app.questionMaterialRef(q.id);
          if (ref?.materialId) links.set(q.id, ref.materialId);
        }
      }
      return detectOrphans(questions, {
        knownMaterialIds,
        questionMaterialLinks: links,
      });
    });
    let filterOrphanKind = $state<OrphanKind | "">("");
    function drillOrphanKind(kind: OrphanKind) {
      filterOrphanKind = filterOrphanKind === kind ? "" : kind;
    }
    function clearOrphanFilter() {
      filterOrphanKind = "";
    }
    function downloadHealthCsv() {
      if (!health) return;
      const csv = exportHealthReportCsv(health, orphanDiag ?? undefined);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `题库体检清单-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    }

    // ---------- 43-07 重复簇合并助手 ----------
    let activeClusterIndex = $state(-1);
    let mergeBusy = $state(false);

    function toggleCluster(index: number) {
      activeClusterIndex = activeClusterIndex === index ? -1 : index;
    }

    async function mergeClusterToTarget(targetQ: Question & { blockId: string }, clusterIds: string[]) {
      if (!app || mergeBusy) return;
      const others = clusterIds
        .filter((id) => id !== targetQ.id)
        .map((id) => questionMap.get(id))
        .filter((q): q is Question & { blockId: string; rootId: string } => !!q && !!q.blockId);
      if (!others.length) return;

      const { confirmDialogSync } = await import("../../libs/dialog");
      const confirmed = await confirmDialogSync({
        title: t("health.mergeConfirmTitle"),
        content: `${t("health.mergeConfirmBody")}\n\n保留题目：[${targetQ.id}] ${targetQ.stem.slice(0, 40)}\n合并并清理：${others.length} 道重复题。`,
      });
      if (!confirmed) return;

      mergeBusy = true;
      try {
        let totalMergedAttempts = 0;
        for (const other of others) {
          const res = await app.mergeDuplicateQuestions(targetQ, other);
          totalMergedAttempts += res.mergedEventsCount;
        }
        await refreshQuestionsAfterWrite(questions.length - others.length);
        activeClusterIndex = -1;
        showMessage(`${t("health.mergeSuccess")}（迁移 ${totalMergedAttempts} 条作答记录）`, 3200, "info");
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
      // 仅用于本次结算的临时聚合器，不作为组件响应式状态。
      // eslint-disable-next-line svelte/prefer-svelte-reactivity
      const map = new Map<string, { kp: string; correct: number; total: number; wrong: number }>();
      for (const a of session.answered) {
        const q = questionMap.get(a.qid);
        const key = q?.kp ?? "";
        if (!key) continue;
        const e = map.get(key) ?? { kp: key, correct: 0, total: 0, wrong: 0 };
        e.total++;
        if (a.grade.verdict === "correct") e.correct++;
        if (a.grade.verdict === "wrong") e.wrong++;
        map.set(key, e);
      }
      return [...map.values()].sort((a, b) => a.correct / a.total - b.correct / b.total);
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
    let groupBatchStart = $state(1); // 44-01 当前小组批次起始题号（1-based）

    // 导入批次回滚（TODO 12 组）：按 custom-exam-batch 定位块逐块删除；只动题块不动流水
    const batchList = $derived(healthOpen && questions.length ? app.listBatches(questions) : []);
    let rollbackBusy = $state("");

    async function undoBatch(batch: string) {
      const n = questions.filter((q) => q.batch === batch).length;
      // 45-04 lite：原生 confirm → 可访问确认对话框（键盘/Esc 可取消）
      const { confirmDialogSync } = await import("../../libs/dialog");
      if (!(await confirmDialogSync({
        title: t("import.rollback"),
        content: t("import.rollbackConfirm").replace("{n}", String(n)).replace("{b}", escapeHtml(batch.slice(0, 16))),
      }))) return;
      rollbackBusy = batch;
      try {
        const r = await app.rollbackBatch(activeBankId, batch);
        showMessage(t("import.rollbackDone").replace("{d}", String(r.deleted)).replace("{f}", String(r.failed)), 4600, r.failed ? "error" : "info");
        await loadQuestions();
      } catch (e) {
        showMessage(offline ? t("state.offlineHint") : String(e instanceof Error ? e.message : e), 4600, "error");
      } finally { rollbackBusy = ""; }
    }

    /** 题库 CSV 导出（TODO 8 组 lite）：官方模板表头，Excel 可直接编辑后重导入 */
    async function exportBankCsv() {
      if (!questions.length) { showMessage(t("state.emptyBank"), 2800, "info"); return; }
      const { questionsToCsv } = await import("@/core/bankCsv");
      const blob = new Blob([questionsToCsv(questions)], { type: "text/csv;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `题库导出 ${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
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
      const ids = new Set(Object.keys(selectedIds));
      const targetQuestions = questions.filter((q) => ids.has(q.id));
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

    let teacherPrintBusy = $state(false);
    async function printBankDoubleColumnPaper() {
      if (teacherPrintBusy || !practiceQuestions.length) return;
      teacherPrintBusy = true;
      try {
        const { buildCompactQuestionSheetPro } = await import("@/core/printPro");
        const html = buildCompactQuestionSheetPro(`${bankName || "题库"} · 教学测试卷`, practiceQuestions, {
          headerTitle: `${bankName || "题库"} · 标准试卷`,
          paperSize: "A4",
          columns: "double",
        });
        const win = window.open("", "_blank");
        if (win) {
          win.document.write(html);
          win.document.close();
          win.focus();
        } else {
          const blob = new Blob([html], { type: "text/html;charset=utf-8" });
          const a = document.createElement("a");
          a.href = URL.createObjectURL(blob);
          a.download = `${bankName || "题库"}-标准双栏试卷.html`;
          a.click();
          URL.revokeObjectURL(a.href);
          showMessage("已生成标准双栏试卷文件", 3000, "info");
        }
      } catch (e) {
        showMessage(`打印双栏试卷失败：${String(e instanceof Error ? e.message : e)}`, 4000, "error");
      } finally {
        teacherPrintBusy = false;
      }
    }

    async function exportBankTeacherPaper() {
      if (teacherPrintBusy || !practiceQuestions.length) return;
      teacherPrintBusy = true;
      try {
        const { buildTeacherLectureSheetPro } = await import("@/core/printPro");
        const html = buildTeacherLectureSheetPro(`${bankName || "题库"}`, practiceQuestions, {
          paperSize: "A4",
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
          const a = document.createElement("a");
          a.href = URL.createObjectURL(blob);
          a.download = `${bankName || "题库"}-教师讲义教案卷.html`;
          a.click();
          URL.revokeObjectURL(a.href);
          showMessage("已生成教师讲义教案卷文件", 3000, "info");
        }
      } catch (e) {
        showMessage(`导出教师讲义失败：${String(e instanceof Error ? e.message : e)}`, 4000, "error");
      } finally {
        teacherPrintBusy = false;
      }
    }

    async function printBankHomeworkSheet() {
      if (teacherPrintBusy || !practiceQuestions.length) return;
      teacherPrintBusy = true;
      try {
        const { buildStudentHomeworkSheetPro } = await import("@/core/printPro");
        const html = buildStudentHomeworkSheetPro(`${bankName || "题库"}`, practiceQuestions, {
          paperSize: "A4",
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
          const a = document.createElement("a");
          a.href = URL.createObjectURL(blob);
          a.download = `${bankName || "题库"}-课后作业导学单.html`;
          a.click();
          URL.revokeObjectURL(a.href);
          showMessage("已生成课后作业导学单文件", 3000, "info");
        }
      } catch (e) {
        showMessage(`打印作业导学单失败：${String(e instanceof Error ? e.message : e)}`, 4000, "error");
      } finally {
        teacherPrintBusy = false;
      }
    }

    async function printSelectedQuestions() {
      if (!selectedCount) return;
      const ids = new Set(Object.keys(selectedIds));
      const targetQuestions = questions.filter((q) => ids.has(q.id));
      if (!targetQuestions.length) return;
      try {
        const { buildCompactQuestionSheetPro } = await import("@/core/printPro");
        const html = buildCompactQuestionSheetPro(`${bankName || "题库"} · 勾选精选题卷`, targetQuestions, {
          headerTitle: `${bankName || "题库"} · 精选练习`,
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
          const a = document.createElement("a");
          a.href = URL.createObjectURL(blob);
          a.download = `${bankName || "题库"}-精选题卷.html`;
          a.click();
          URL.revokeObjectURL(a.href);
          showMessage("已生成勾选题排版试卷文件", 3000, "info");
        }
      } catch (e) {
        showMessage(`打印勾选题失败：${String(e instanceof Error ? e.message : e)}`, 4000, "error");
      }
    }

    async function printSelectedTeacherPaper() {
      if (!selectedCount) return;
      const ids = new Set(Object.keys(selectedIds));
      const targetQuestions = questions.filter((q) => ids.has(q.id));
      if (!targetQuestions.length) return;
      try {
        const { buildTeacherLectureSheetPro } = await import("@/core/printPro");
        const html = buildTeacherLectureSheetPro(`${bankName || "题库"} · 勾选题备课讲义`, targetQuestions, {
          paperSize: "A4",
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
          const a = document.createElement("a");
          a.href = URL.createObjectURL(blob);
          a.download = `${bankName || "题库"}-勾选题备课讲义.html`;
          a.click();
          URL.revokeObjectURL(a.href);
          showMessage("已生成勾选题教师讲义教案文件", 3000, "info");
        }
      } catch (e) {
        showMessage(`导出勾选题讲义失败：${String(e instanceof Error ? e.message : e)}`, 4000, "error");
      }
    }

    async function printSelectedHomeworkSheet() {
      if (!selectedCount) return;
      const ids = new Set(Object.keys(selectedIds));
      const targetQuestions = questions.filter((q) => ids.has(q.id));
      if (!targetQuestions.length) return;
      try {
        const { buildStudentHomeworkSheetPro } = await import("@/core/printPro");
        const html = buildStudentHomeworkSheetPro(`${bankName || "题库"} · 勾选题分层作业单`, targetQuestions, {
          paperSize: "A4",
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
          const a = document.createElement("a");
          a.href = URL.createObjectURL(blob);
          a.download = `${bankName || "题库"}-课后作业单.html`;
          a.click();
          URL.revokeObjectURL(a.href);
          showMessage("已生成勾选题课后分层作业单", 3000, "info");
        }
      } catch (e) {
        showMessage(`导出作业单失败：${String(e instanceof Error ? e.message : e)}`, 4000, "error");
      }
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
      // 撤销基线（43-06）：优先本次会话已应用的计划；无则回退持久化的最近一次（重载后仍可撤销）
      let changes = undo ? invertPlan(appliedChanges) : batchPreview?.changes ?? [];
      if (undo && !changes.length && batchUndo && batchUndo.bankId === activeBankId) {
        changes = invertPlan(batchUndo.changes);
      }
      if (!changes.length) return;
      batchBusy = true; batchNote = "";
      try {
        const r = await app.applyBatchEdit(changes);
        batchNote = undo
          ? t("batch.undone").replace("{n}", String(r.ok)).replace("{f}", String(r.failed))
          : t("batch.applied").replace("{n}", String(r.ok)).replace("{f}", String(r.failed));
        if (undo) {
          appliedChanges = [];      // 撤销后基线清空（重置为存储基线）
          batchUndo = null;
          await saveBatchUndo();
        } else {
          appliedChanges = changes;      // 撤销基线 = 最近一次成功应用的计划
          batchUndo = { changes, bankId: activeBankId, at: Date.now() };
          await saveBatchUndo();
        }
        await loadQuestions();
      } catch (e) {
        batchNote = String(e instanceof Error ? e.message : e);
      } finally { batchBusy = false; }
    }

    /** 最近一次批量编辑的持久化（43-06 剩余）：重载后仍可逆向撤销；换库不误撤 */
    let batchUndo = $state<null | { changes: import("@/core/batchEdit").BatchChange[]; bankId: string; at: number }>(null);
    const batchUndoHere = $derived(!!batchUndo && batchUndo.bankId === activeBankId);
    async function loadBatchUndo() {
      try {
        const v = await app.loadAux<typeof batchUndo>("batchedit/last");
        batchUndo = v && Array.isArray(v.changes) ? v : null;
      } catch { batchUndo = null; }
    }
    async function saveBatchUndo() {
      try { await app.saveAux("batchedit/last", batchUndo); } catch { /* 撤销基线失败不阻断当前批量操作 */ }
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
    const sylKpStats = $derived.by(() => {
      if (!app) return {};
      const independentCorrect = new Set(
        app.attempts.all().filter((e) => e.verdict === "correct" && !e.help).map((e) => e.qid),
      );
      const stats: Record<string, { total: number; learned: number; noSource: number }> = {};
      for (const q of questions) {
        const k = (q.kp || "").trim();
        if (!k) continue;
        const s = (stats[k] ??= { total: 0, learned: 0, noSource: 0 });
        s.total++;
        if (independentCorrect.has(q.id)) s.learned++;
        if (!q.source) s.noSource++;
      }
      return stats;
    });

    function countSyllabusNodes(nodes: import("@/core/syllabus").SyllabusNode[]): number {
      return nodes.reduce((s, n) => s + 1 + countSyllabusNodes(n.children), 0);
    }

    function previewSyllabus() {
      sylError = "";
      try {
        const roots = app.previewSyllabus(sylText);
        if (!roots.length) { sylError = t("syl.empty"); sylPreviewRoots = null; return; }
        sylPreviewRoots = roots;
      } catch (e) {
        sylError = String(e instanceof Error ? e.message : e);
      }
    }

    async function importSyllabus() {
      if (!sylPreviewRoots?.length) return;
      try {
        await app.setSyllabusDoc(
          { publisher: sylPublisher.trim() || undefined, year: sylYear.trim() || undefined, source: sylSource.trim() || undefined },
          sylPreviewRoots,
        );
        sylNote = t("syl.imported").replace("{n}", String(countSyllabusNodes(sylPreviewRoots)));
        sylPreviewRoots = null;
        sylText = "";
      } catch (e) {
        sylError = String(e instanceof Error ? e.message : e);
      }
    }

    function downloadSyllabusGaps() {
      if (!sylDoc.roots.length) return;
      const csv = "\uFEFF" + gapsToCsv(sylDoc.roots, sylKpStats);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `考纲缺口清单 ${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
    }

    // ---------- 勘误回导（57 lite）：导出模板（qid+当前值）→ 线下修订 → 回导 dry-run → 批量应用（撤销基线共用） ----------
    let errataOpen = $state(false);
    let errataPlan = $state<import("@/core/errata").ErrataPlan | null>(null);
    let errataErrors = $state<{ row: number; reason: string }[]>([]);
    let errataBusy = $state(false);
    let errataNote = $state("");

    function exportErrataTemplate() {
      const csv = "\uFEFF" + errataTemplateCsv(questions);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `勘误模板 ${bankName || "题库"} ${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
    }

    async function onErrataFile(e: Event) {
      const input = e.target as HTMLInputElement;
      const file = input.files?.[0];
      input.value = "";
      if (!file) return;
      errataBusy = true; errataNote = "";
      try {
        const text = await file.text();
        const { rows, errors } = parseErrataCsv(text);
        errataErrors = errors;
        errataPlan = rows.length ? planErrata(rows, questions as (Question & { blockId?: string })[]) : null;
      } catch (err) {
        errataErrors = [{ row: 0, reason: String(err instanceof Error ? err.message : err) }];
      } finally { errataBusy = false; }
    }

    async function applyErrata() {
      const plan = errataPlan;
      if (!plan?.changes.length || errataBusy) return;
      errataBusy = true;
      try {
        const r = await app.applyBatchEdit(plan.changes);
        // 撤销基线与批量编辑共用（43-06）：保存逆向计划，重载后可撤
        batchUndo = { changes: invertPlan(plan.changes), bankId: activeBankId, at: Date.now() };
        await saveBatchUndo();
        errataNote = t("errata.applied").replace("{ok}", String(r.ok)).replace("{f}", String(r.failed));
        errataPlan = null;
        void loadQuestions();
      } catch (e) {
        showMessage(String(e instanceof Error ? e.message : e), 4200, "error");
      } finally { errataBusy = false; }
    }

    // ---------- 打印视图（68-01 lite）：题册/答案册分离，作用于当前筛选全集 ----------
    // 注：闭合标签经 \u003c 转义构造——Svelte 解析器对脚本内裸 "</" 敏感
    const LT = "\u003c";
    const PRINT_HOOK = `${LT}script>window.onload = function () { window.print(); }${LT}/script>`;
    const BODY_CLOSE = `${LT}/body>`;
    function printSheet(html: string) {
      const w = window.open("", "_blank");
      if (!w) { showMessage(t("print.popupBlocked"), 3600, "error"); return; }
      w.document.open();
      w.document.write(html.replace(/<\/body>/, PRINT_HOOK + BODY_CLOSE));
      w.document.close();
    }
    function printQuestionSheet() {
      if (!filteredQuestions.length) { showMessage(t("print.empty"), 2200, "info"); return; }
      printSheet(buildQuestionSheet(`${bankName} · ${t("print.sheetTitle")}`, filteredQuestions));
    }
    function printAnswerSheet() {
      if (!filteredQuestions.length) { showMessage(t("print.empty"), 2200, "info"); return; }
      printSheet(buildAnswerSheet(`${bankName} · ${t("print.sheetTitle")}`, filteredQuestions));
    }
    function printAnswerCard() {
      if (!filteredQuestions.length) { showMessage(t("print.empty"), 2200, "info"); return; }
      printSheet(buildAnswerCardSheet(`${bankName} · ${t("print.sheetTitle")}`, filteredQuestions));
    }

    // ---------- 纸笔回录（68-02 lite）：题号=作答 → 判分预览 → append 流水（mode=paper，不覆盖任何线上数据） ----------
    let paperOpen = $state(false);
    let paperText = $state("");
    let paperBusy = $state(false);
    let paperNote = $state("");
    const paperPreview = $derived.by(() => {
      if (!paperOpen || !paperText.trim()) return null;
      const { rows, errors } = parsePaperAnswers(paperText);
      const { items, outOfRange } = gradePaper(filteredQuestions, rows);
      return { errors, items, outOfRange };
    });
    async function applyPaperRecall() {
      const pv = paperPreview;
      if (!pv || paperBusy) return;
      const graded = pv.items.filter((i) => i.verdict !== "not_attempted");
      if (!graded.length) { paperNote = t("paper.none"); return; }
      paperBusy = true;
      try {
        const sessionId = `s-paper-${Date.now().toString(36)}`;
        for (const it of graded) {
          app.recordAttempt({
            qid: it.q.id, kind: "practice", mode: "paper", verdict: it.verdict,
            myAnswer: it.given, sessionId, queue: "normal",
            qVersion: createQuestionVersionSnapshot(it.q),
          });
        }
        dataRev++;
        paperText = "";
        paperNote = t("paper.applied").replace("{n}", String(graded.length));
      } finally { paperBusy = false; }
    }

    function previewKpMerge() {
      kpNote = "";
      const from = kpMergeFrom.trim();
      const to = kpMergeTo.trim();
      if (!from || !to) { kpNote = t("kp.needBoth"); return; }
      if (from === to) { kpNote = t("kp.sameValue"); return; }
      kpMergePlan = planKpMerge(questions, from, to).plan;
    }
    function previewKpFill() {
      kpNote = "";
      if (!kpFillKp.trim()) { kpNote = t("kp.needBoth"); return; }
      kpFillPlan = planEmptyKpFill(questions, kpFillKp.trim()).plan;
    }
    /** 应用治理变更：与批量编辑共用 SaveGate 闸与撤销基线（撤销走同一 batchedit/last） */
    async function applyKpPlan(plan: import("@/core/batchEdit").BatchPlan) {
      if (kpBusy || !app.kernelOnline) { kpNote = t("state.offlineHint"); return; }
      if (!plan.changes.length) return;
      kpBusy = true; kpNote = "";
      try {
        const r = await app.applyBatchEdit(plan.changes);
        kpNote = t("batch.applied").replace("{n}", String(r.ok)).replace("{f}", String(r.failed));
        batchUndo = { changes: plan.changes, bankId: activeBankId, at: Date.now() };
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
    let editDraft = $state<{ stem: string; options: string[]; answer: string; analysis: string; kp: string; difficulty: string; status?: QuestionLifecycleStatus; answerSpec?: import("../../core/structuredAnswer").NumericAnswerSpec } | null>(null);
    let editSpecOpen = $state(false);
    let editSpecUnit = $state("");
    let editSpecAbsTol = $state("");
    let editSpecRelPct = $state("");
    let editSpecAltUnits = $state("");
    /** 规格字段 ↔ spec 对象（编辑表单用；作者留空且原无 spec → undefined 保持自动识别） */
    function specFromEditFields(): import("../../core/structuredAnswer").NumericAnswerSpec | undefined {
      const abs = parseFloat(editSpecAbsTol);
      const rel = parseFloat(editSpecRelPct) / 100;
      const unit = editSpecUnit.trim();
      const alts = editSpecAltUnits.split(/[，,;；]/).map((x) => x.trim()).filter(Boolean);
      if (!Number.isFinite(abs) && !Number.isFinite(rel) && !unit && !alts.length) return undefined;
      const spec: import("../../core/structuredAnswer").NumericAnswerSpec = { v: 1, kind: "numeric" };
      if (Number.isFinite(abs) && abs > 0) spec.absTol = abs;
      if (Number.isFinite(rel) && rel > 0) spec.relTolerance = rel;
      if (unit) spec.unit = unit;
      if (alts.length) spec.altUnits = alts.map((u) => ({ unit: u, factor: 1 }));
      return spec;
    }
    function loadSpecFields(spec: import("../../core/structuredAnswer").AnswerSpec | undefined) {
      editSpecUnit = spec?.kind === "numeric" ? (spec.unit ?? "") : "";
      editSpecAbsTol = spec?.kind === "numeric" && spec.absTol != null ? String(spec.absTol) : "";
      editSpecRelPct = spec?.kind === "numeric" && spec.relTolerance != null ? String(Math.round(spec.relTolerance * 10000) / 100) : "";
      editSpecAltUnits = spec?.kind === "numeric" ? (spec.altUnits?.map((a) => a.unit).join(", ") ?? "") : "";
    }

    function openEditForm(q: Question) {
      editError = "";
      editingId = q.id;
      editDraft = {
        stem: q.stem,
        options: [...q.options],
        answer: q.answer,
        analysis: q.analysis ?? "",
        kp: q.kp ?? "",
        difficulty: q.difficulty != null ? String(q.difficulty) : "",
        status: getQuestionLifecycle(q),
        // 编辑表单只编辑数值规格；多空规格原样保留（specFromEditFields 不产出 multiBlank）
        answerSpec: q.answerSpec?.kind === "numeric" ? q.answerSpec : undefined,
      };
      loadSpecFields(q.answerSpec);
      editSpecOpen = !!q.answerSpec;
    }
    function closeEditForm() {
      editingId = ""; editDraft = null; editError = "";
    }
    async function saveEdit(q: Question & { blockId: string }) {
      if (!editDraft || editBusy) return;
      if (!editDraft.stem.trim()) { editError = t("edit.needStem"); return; }
      if (q.type !== "material" && !editDraft.answer.trim()) { editError = t("edit.needAnswer"); return; }
      editBusy = true; editError = "";
      try {
        const next = await app.updateQuestionContent(q, {
          stem: editDraft.stem.trim(),
          options: editDraft.options,
          answer: editDraft.answer.trim(),
          analysis: editDraft.analysis.trim(),
          kp: editDraft.kp.trim(),
          difficulty: editDraft.difficulty ? parseInt(editDraft.difficulty, 10) || undefined : undefined,
          status: editDraft.status,
          // 54-02：编辑表单的作者规格（打开时自现有 spec 读入；留空字段=清除回自动识别）
          answerSpec: specFromEditFields(),
        });
        questions = questions.map((x) => (x.id === q.id ? { ...x, ...next } : x));
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
        const next = await app.updateQuestionLifecycle(q, nextStatus);
        questions = questions.map((x) => (x.id === q.id ? { ...x, ...next } : x));
        showMessage(t("lifecycle.changed").replace("{status}", LIFECYCLE_LABELS[nextStatus] ?? nextStatus), 2800, "info");
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

    function downloadItemAnalysisCsv(report: ItemAnalysisReport) {
      const csv = exportItemAnalysisCsv(report);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `题目分析-${report.qid}-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    }

    function toggleDisputeForm(q: Question) {
      if (disputeFormOpenFor === q.id) {
        disputeFormOpenFor = "";
        disputeNote = "";
        disputeResolution = "";
        disputeError = "";
      } else {
        disputeFormOpenFor = q.id;
        disputeReason = q.dispute?.reason ?? "wrong_answer";
        disputeNote = q.dispute?.note ?? "";
        disputeResolution = q.dispute?.resolution ?? "";
        disputeError = "";
      }
    }

    async function submitFlagDispute(q: Question & { blockId: string }) {
      if (disputeBusy || !app) return;
      if (!disputeNote.trim()) { disputeError = t("dispute.notePlaceholder"); return; }
      disputeBusy = true; disputeError = "";
      try {
        const updated = await app.flagQuestionDispute(q, disputeReason, disputeNote.trim());
        questions = questions.map((x) => (x.id === q.id ? { ...x, ...updated } : x));
        disputeFormOpenFor = "";
        showMessage(t("dispute.flagSuccess"), 3200, "info");
      } catch (e) {
        disputeError = String(e instanceof Error ? e.message : e);
      } finally { disputeBusy = false; }
    }

    async function submitResolveDispute(q: Question & { blockId: string }) {
      if (disputeBusy || !app) return;
      if (!disputeResolution.trim()) { disputeError = t("dispute.resolutionPlaceholder"); return; }
      disputeBusy = true; disputeError = "";
      try {
        const updated = await app.resolveQuestionDispute(q, disputeResolution.trim());
        questions = questions.map((x) => (x.id === q.id ? { ...x, ...updated } : x));
        disputeFormOpenFor = "";
        showMessage(t("dispute.resolveSuccess"), 3200, "info");
      } catch (e) {
        disputeError = String(e instanceof Error ? e.message : e);
      } finally { disputeBusy = false; }
    }

    async function submitClearDispute(q: Question & { blockId: string }) {
      if (disputeBusy || !app) return;
      disputeBusy = true; disputeError = "";
      try {
        const updated = await app.clearQuestionDispute(q);
        questions = questions.map((x) => (x.id === q.id ? { ...x, ...updated } : x));
        disputeFormOpenFor = "";
        showMessage(t("dispute.clearSuccess"), 2800, "info");
      } catch (e) {
        disputeError = String(e instanceof Error ? e.message : e);
      } finally { disputeBusy = false; }
    }

    // ---------- 章节树过滤（TODO 2.2：notebook→doc→heading） ----------
    let sectionOpen = $state(false);
    let sectionTree = $state<import("@/core/sectionTree").DocNode[]>([]);
    let sectionSel = $state<import("@/core/sectionTree").SectionRef | null>(null);
    let sectionBusy = $state(false);
    const sectionLabel = $derived.by(() => {
      if (!sectionSel) return "";
      if (sectionSel.kind === "doc") return sectionTree.find((d) => d.id === sectionSel!.id)?.title ?? sectionSel.hpath;
      const walk = (ns: import("@/core/sectionTree").HeadingNode[]): string | null => {
        for (const n of ns) {
          if (n.hpath === sectionSel!.hpath) return n.text;
          const hit = walk(n.children);
          if (hit) return hit;
        }
        return null;
      };
      for (const d of sectionTree) {
        const hit = walk(d.children);
        if (hit) return hit;
      }
      return sectionSel.hpath;
    });

    async function toggleSectionTree() {
      sectionOpen = !sectionOpen;
      if (sectionOpen && !sectionTree.length && activeBankId) {
        sectionBusy = true;
        try {
          const tr = await app.docTree(activeBankId);
          sectionTree = buildSectionTree(tr.docs, tr.headings);
        } catch { sectionTree = []; }
        finally { sectionBusy = false; }
      }
    }

    onMount(() => {
      let appInitStarted = false;
      const initAppData = () => {
        if (!app || appInitStarted) return;
        appInitStarted = true;
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
            const d = await app.loadAux<
              | { type: string; stem: string; options: string[]; answer: string; analysis: string; kp: string; source: string; group: string; specOpen?: boolean; specUnit?: string; specAbsTol?: string; specRelPct?: string; specAltUnits?: string; rubricOpen?: boolean; rubricText?: string }
              | undefined>("draft/manual");
            if (d?.stem?.trim()) {
              mType = (d.type as typeof mType) ?? "single";
              mStem = d.stem; mOptions = d.options?.length ? d.options : ["", ""];
              mAnswer = d.answer ?? ""; mAnalysis = d.analysis ?? "";
              mKp = d.kp ?? ""; mSource = d.source ?? ""; mGroup = d.group ?? "";
              mSpecOpen = d.specOpen ?? false; mSpecUnit = d.specUnit ?? ""; mSpecAbsTol = d.specAbsTol ?? ""; mSpecRelPct = d.specRelPct ?? ""; mSpecAltUnits = d.specAltUnits ?? "";
              mRubricOpen = d.rubricOpen ?? false; mRubricText = d.rubricText ?? "";
              draftRestored = true;
            }
          } catch { /* 草稿读取失败静默 */ }
        })();
        banks = app.listBanks();
        // 记忆上次使用的题库：重载后回落 banks[0] 会静默切换库（真机走查发现）
        const rememberedBank = readLocal(BANK_PREF_KEY);
        const pendingPracticeView = plugin?.pendingPracticeView;
        const pendingPracticeViewIsCurrent = pendingPracticeView?.id === plugin?.practiceViewRequestId;
        const pendingViewBankId = pendingPracticeViewIsCurrent ? pendingPracticeView?.bankId : undefined;
        const pendingPracticeBankId = plugin?.pendingPracticeBankId;
        if (pendingViewBankId && banks.some((b) => b.id === pendingViewBankId)) activeBankId = pendingViewBankId;
        else if (pendingPracticeBankId && banks.some((b) => b.id === pendingPracticeBankId)) activeBankId = pendingPracticeBankId;
        else if (rememberedBank && banks.some((b) => b.id === rememberedBank)) activeBankId = rememberedBank;
        else if (banks.length) activeBankId = banks[0].id;
        // 首次打开已有题库也要先读回题目，避免首页把可练入口误显示为禁用。
        if (activeBankId) void refreshQuestionsAfterWrite(0);
        if (activeBankId) rememberBank(activeBankId);

        // 恢复未完成会话（37-05：校验题库归属，缺题剔除后提示）
        app.resumeSession(async (qids) => {
          const all = await loadQuestions();
          return qids.map((id) => all.find((q) => q.id === id)).filter(Boolean) as Question[];
        }, activeBankId).then((s) => {
          if (s) {
            s.advancePastAnswered();                       // 37-05：恢复跳过已答位置防双计
            if (s.allAnswered()) sessionDone = s.finish();
            session = s; view = "session";
            sessionRev++;
            restoreQuestionControls();
            if (app.lastResumeMissing.length) showMessage(t("resume.missing").replace("{n}", String(app.lastResumeMissing.length)), 4200, "info");
          }
          rebuildPlan();
          loading = false;
        }).catch(() => { loading = false; });
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
        feedback = null; selected = ""; confidenceSel = ""; sessionDone = null; view = "session";
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
        if (!request?.sourceText || request.view !== "ai") return;
        aiSource = request.sourceText;
        const sourceLabel = request.sourceKind === "document" ? t("ai.sourceFromDocument") : t("ai.sourceFromBlock");
        aiSourceOrigin = request.sourceTitle
          ? `${sourceLabel.replace("{title}", request.sourceTitle)}${request.sourceTruncated ? ` · ${t("ai.sourceTruncated").replace("{n}", String(request.sourceText.length))}` : ""}`
          : "";
        if (!aiKp.trim() && request.sourceTitle) aiKp = request.sourceTitle;
      }
      const onOpenView = (env: import("@/core/bus").BusEvent<{ view: string; requestId?: string }>) => {
        if (!tabRoot?.isConnected) return;
        const next = env.payload.view;
        if (!["wrongbook", "entry", "browse", "manual", "import", "ai", "materials", "recite"].includes(next)) return;
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
        showMessage("[小驴学习] 已由长文划词自动载入出题制卡工坊 ✓", 3200, "info");
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
      ];

      // 移动端虚拟键盘避让：监听 visualViewport 动态抬升底边距，防遮挡按钮
      if (typeof window !== "undefined" && window.visualViewport) {
        const onViewportChange = () => {
          const vv = window.visualViewport;
          if (!vv) return;
          const diff = Math.max(0, window.innerHeight - vv.height - (vv.offsetTop || 0));
          viewportBottomPad = diff > 80 ? diff : 0;
        };
        window.visualViewport.addEventListener("resize", onViewportChange);
        window.visualViewport.addEventListener("scroll", onViewportChange);
        offs.push(() => {
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
      const ref = app.questionMaterialRef(qid);
      if (!ref) return null;
      const m = app.listMaterials().find((x) => x.id === ref.materialId);
      return {
        title: m?.title ?? "?",
        label: locatorLabel(ref.locator),
        stale: revisionStale(ref.revision, m?.revision ?? ref.revision),
      };
    }
    function rebuildQrefView() {
      const next: Record<string, { title: string; label: string; stale: boolean } | null> = {};
      for (const q of questions) next[q.id] = qrefSnapshot(q.id);
      qrefView = next;
    }
    function refreshQref(qid: string) {
      qrefView = { ...qrefView, [qid]: qrefSnapshot(qid) };
    }
    function startQrefForm(qid: string) {
      qrefFormFor = qid; qrefError = "";
      const ref = app.questionMaterialRef(qid);
      qrefMatId = ref?.materialId ?? "";
      qrefPage = ref?.locator?.page != null ? String(ref.locator.page) : "";
      qrefTime = ref?.locator?.tSec != null ? formatSecToTime(ref.locator.tSec) : "";
    }
    async function saveQref(qid: string) {
      if (!qrefMatId || qrefBusyFor) return;
      qrefError = "";
      qrefBusyFor = qid;
      try {
        const previousRef = app.questionMaterialRef(qid);
        const page = qrefPage.trim() ? Number(qrefPage) : undefined;
        if (qrefPage.trim() && (!Number.isInteger(page) || page! < 1)) throw new Error(t("materials.badPage"));
        const tSec = qrefTime.trim() ? parseTimeToSec(qrefTime) : undefined;
        const locator = page == null && tSec == null ? null : { page, tSec };
        const r = await app.linkQuestionMaterial(qid, qrefMatId, locator);
        qrefFormFor = ""; refreshQref(qid);
        if (previousRef?.materialId && previousRef.materialId !== qrefMatId) refreshMaterialQuestionCount(previousRef.materialId);
        refreshMaterialQuestionCount(qrefMatId);
        showMessage(r.replaced ? t("qref.relinked") : t("qref.linked"), 2000, "info");
      } catch (e) {
        qrefError = String(e instanceof Error ? e.message : e);
      } finally { qrefBusyFor = ""; }
    }
    async function removeQref(qid: string) {
      if (qrefBusyFor) return;
      qrefBusyFor = qid;
      qrefActionError = { ...qrefActionError, [qid]: "" };
      try {
        const ref = app.questionMaterialRef(qid);
        const { confirmDialogSync } = await import("../../libs/dialog");
        if (!(await confirmDialogSync({ title: t("qref.unlinkTitle"), content: t("qref.unlinkConfirm") }))) return;
        await app.unlinkQuestionMaterial(qid);
        refreshQref(qid);
        if (ref?.materialId) refreshMaterialQuestionCount(ref.materialId);
        showMessage(t("qref.unlinked"), 2200, "info");
      } catch (e) {
        qrefActionError = { ...qrefActionError, [qid]: String(e instanceof Error ? e.message : e) };
      } finally { qrefBusyFor = ""; }
    }
    function openQref(qid: string) {
      const ref = app.questionMaterialRef(qid);
      const m = ref ? app.listMaterials().find((x) => x.id === ref.materialId) : null;
      const url = locatedUrl(m ? app.resolveMaterialUrlOf(m, window.location.origin) : null, ref?.locator ?? null);
      if (!url) { showMessage(t("materials.cannotOpen"), 2400, "error"); return; }
      if (m) { void gatedOpen(url, m); return; } // 73-02：link 类经隐私闸
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
        receiptCache = app.attempts.all().filter((e) => e.qid === qid).slice(-10).reverse();
        // U14：上次 AI 假设（独立存储）回显——与用户复盘分层展示
        const rec = app.latestMisdiagnosis(qid);
        receiptStored = rec ? { text: rec.text, at: rec.at, adoptedAt: rec.adoptedAt } : null;
      }
    }

    /** 按选定回执（而非当前会话）做错因假设：证据取自该次作答事件本身（U14 口径） */
    async function runReceiptMisdiagnosis(q: Question, e: import("../../core/types").AttemptEvent) {      const key = `${e.qid}#${e.seq}`;
      if (receiptBusy || !app.kernelOnline) return;
      receiptBusy = key;
      try {
        const { SiyuanAiChannel, OpenAiChannel } = await import("@/ai/client");
        const { buildMisdiagnosisMessages } = await import("@/ai/misdiagnosis");
        const { AiTaskRunner, questionFingerprint } = await import("@/ai/task");
        const endpoint = String(plugin.settingUtils?.get?.("aiEndpoint") ?? "");
        const key2 = resolveAiKey(plugin);
        const model = String(plugin.settingUtils?.get?.("aiModel") ?? "gpt-4o-mini");
        const ch = endpoint && key2
          ? new OpenAiChannel({ endpoint, apiKey: key2, model }, (u, i) => fetch(u, i))
          : new SiyuanAiChannel(app.deps.client);
        const messages = buildMisdiagnosisMessages(q, {
          myAnswer: e.myAnswer ?? null,
          confidence: e.confidence,
          timeMs: e.timeMs,
          helped: !!e.help,
          userThought: reflections[e.qid]?.text,
        });
        const reqCtx: import("@/ai/task").AiTaskContext = {
          templateId: "practice.misdiagnosis",
          templateVersion: 1,
          qid: e.qid,
          questionRevision: questionFingerprint(q),
          learnerAnswer: e.myAnswer ?? null,
          submitted: true,
          mode: "practice",
          sessionId: e.sessionId,
        };
        const env = await new AiTaskRunner(ch).run(reqCtx, messages);
        void logAiTask({ templateId: env.templateId, qid: e.qid, status: env.status, tokens: env.tokens, messages });
        if (env.status === "ok" && env.data.text) {
          receiptMisdiagnosis = { ...receiptMisdiagnosis, [key]: env.data.text };
          void app.recordAiUsage(ch.id, env.tokens, 1).catch(() => undefined);
          // U14：按该次回执的证据独立落库
          void app.saveMisdiagnosis({
            qid: e.qid,
            text: env.data.text,
            at: Date.now(),
            sessionId: e.sessionId,
            templateVersion: 1,
            evidence: { myAnswer: e.myAnswer ?? null, confidence: e.confidence, timeMs: e.timeMs, helped: !!e.help },
          }).catch(() => { /* 持久化失败不阻断展示 */ });
        } else {
          showMessage(envStatusLine(env), 3600, "error");
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
        const { SiyuanAiChannel, OpenAiChannel } = await import("@/ai/client");
        const { buildFlashCandidateMessages, parseFlashCandidates, findCardLeaks } = await import("@/ai/flashCandidates");
        const { AiTaskRunner, questionFingerprint } = await import("@/ai/task");
        const endpoint = String(plugin.settingUtils?.get?.("aiEndpoint") ?? "");
        const key = resolveAiKey(plugin);
        const model = String(plugin.settingUtils?.get?.("aiModel") ?? "gpt-4o-mini");
        const ch = endpoint && key
          ? new OpenAiChannel({ endpoint, apiKey: key, model }, (u, i) => fetch(u, i))
          : new SiyuanAiChannel(app.deps.client);
        const reflection = (await app.loadWrongReflection(q.id))?.text;
        const messages = buildFlashCandidateMessages(q, { reflection });
        const reqCtx: import("@/ai/task").AiTaskContext = {
          templateId: "practice.flash",
          templateVersion: 1,
          qid: q.id,
          questionRevision: questionFingerprint(q),
          learnerAnswer: null,
          submitted: true, // 闪卡候选基于已提交知识的解析/反思（揭示闸门）
          mode: "practice",
          sessionId: "",
        };
        const env = await new AiTaskRunner(ch).run(reqCtx, messages);
        void logAiTask({ templateId: env.templateId, qid: q.id, status: env.status, tokens: env.tokens, messages });
        if (env.status === "ok" && env.data.text) {
          void app.recordAiUsage(ch.id, env.tokens, 1).catch(() => undefined);
          const parsed = parseFlashCandidates(env.data.text);
          const leaks = findCardLeaks(parsed.cards);
          if (leaks.length) {
            flashError = { ...flashError, [q.id]: t("flash.leak").replace("{r}", leaks.join("、")) };
            return;
          }
          flashCandidates = { ...flashCandidates, [q.id]: parsed };
        } else {
          flashError = { ...flashError, [q.id]: envStatusLine(env) };
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
      const ok = await confirmDialogSync({
        title: t("flash.confirmTitle").replace("{n}", String(result.cards.length)),
        content: result.cards.map((c) => `・${escapeHtml(c.front)}`).join("<br>"),
      });
      if (!ok) return;
      flashBusy = q.id;
      try {
        const { blockIds } = await app.createFlashCards(bank.id, bank.name, result.cards);
        flashCandidates = { ...flashCandidates, [q.id]: { ...result, cards: [] } };
        showMessage(t("flash.done").replace("{n}", String(blockIds.length)), 3200, "info");
      } catch (e) {
        showMessage(String(e instanceof Error ? e.message : e), 4200, "error");
      } finally { flashBusy = ""; }
    }

    async function createBank() {
      if (!newBankName.trim() || creating) return false;
      creating = true; errorMsg = ""; bankCreateError = ""; sampleNotice = "";
      try {
        const b = await app.createBank(newBankName);
        banks = app.listBanks();
        activeBankId = b.id;
        rememberBank(b.id);
        newBankName = "";
        await refreshQuestionsAfterWrite(3);
        emitExamEvent("bank-changed", { bank: b.id });
        // 25-P1 首用：建库自带示例题（app.createBank），留在入口视图由 47-02 首用引导接管——
        // 最快首题路径是直接练示例题；导入/手工录题在下方动作区一步可达
        return true;
      } catch (e) {
        bankCreateError = offline ? t("state.offlineHint") : String(e instanceof Error ? e.message : e);
        return false;
      } finally { creating = false; }
    }

    type SampleBankKind = "general" | "cantonese" | "english" | "qualification" | "k12" | "higher";
    async function createSampleBank(kind: SampleBankKind | Event = "general") {
      const actualKind: SampleBankKind = (kind === "cantonese" || kind === "english" || kind === "qualification" || kind === "k12" || kind === "higher") ? kind : "general";
      if (creating) return;
      creating = true; creatingSample = true;
      errorMsg = ""; bankCreateError = ""; sampleNotice = "";
      let targetCount = SAMPLE_QUESTION_COUNT;
      let targetName = SAMPLE_BANK_NAME;
      if (actualKind === "cantonese") {
        targetCount = CANTONESE_SAMPLE_QUESTION_COUNT;
        targetName = CANTONESE_SAMPLE_BANK_NAME;
      } else if (actualKind === "english") {
        targetCount = ENGLISH_SAMPLE_QUESTION_COUNT;
        targetName = ENGLISH_SAMPLE_BANK_NAME;
      } else if (actualKind === "qualification") {
        targetCount = QUALIFICATION_SAMPLE_QUESTION_COUNT;
        targetName = QUALIFICATION_SAMPLE_BANK_NAME;
      } else if (actualKind === "k12") {
        targetCount = K12_SAMPLE_QUESTION_COUNT;
        targetName = K12_SAMPLE_BANK_NAME;
      } else if (actualKind === "higher") {
        targetCount = HIGHER_SAMPLE_QUESTION_COUNT;
        targetName = HIGHER_SAMPLE_BANK_NAME;
      }
      try {
        const b = await app.createSampleBank(actualKind);
        banks = app.listBanks();
        activeBankId = b.id;
        rememberBank(b.id);
        questions = []; questionsLoaded = false; sectionSel = null; plan = null;
        view = "entry";
        await refreshQuestionsAfterWrite(targetCount);
        emitExamEvent("bank-changed", { bank: b.id });
        sampleNotice = questions.length >= targetCount && !questionsError
          ? t("guard.sampleReady").replace("{n}", String(targetCount))
          : t("guard.samplePending").replace("{n}", String(questions.length)).replace("{total}", String(targetCount));
      } catch (e) {
        bankCreateError = offline ? t("state.offlineHint") : String(e instanceof Error ? e.message : e);
        banks = app.listBanks();
        // 写入失败后保留并选中已创建的题库，重试继续使用同一个笔记本。
        const retained = banks.find((b) => b.name === targetName && b.sampleState);
        if (retained) {
          activeBankId = retained.id;
          rememberBank(retained.id);
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
    async function removeActiveBank() {
      if (!activeBankId || importBusy || mSaving || aiMutationBusy) return;
      const { confirmDialogSync } = await import("../../libs/dialog");
      if (!(await confirmDialogSync({ title: t("bank.removeTitle"), content: t("bank.removeConfirm").replace("{name}", escapeHtml(bankName)) }))) return;
      if (importBusy || mSaving || aiMutationBusy) return;
      try {
        await app.removeBank(activeBankId);
      } catch (e) {
        showMessage(String(e instanceof Error ? e.message : e), 4600, "error");
        return;
      }
      banks = app.listBanks();
      activeBankId = banks[0]?.id ?? "";
      rememberBank(activeBankId);
      emitExamEvent("bank-changed", { bank: activeBankId });
      showMessage(t("bank.removed"), 2800, "info");
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
    function weekDayLabel(dateKey: string) {
      const [year, month, day] = dateKey.split("-").map(Number);
      return ["日", "一", "二", "三", "四", "五", "六"][new Date(year, month - 1, day, 12).getDay()];
    }
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
    function todayQueueFor(available: Question[], planned?: Question[]) {
      // 传入计划时即使为空也保持空队列；仅未生成计划时才使用题库前 10 题兜底。
      const source = planned !== undefined ? planned : available.slice(0, 10);
      return groupAdjacent(source.filter((q) => q.type !== "material"));
    }
    // 备考计划状态在驾驶舱 widgets 与入口卡片之间共享。
    let plan = $state<ReturnType<typeof import("@/core/planner").planToday> | null>(null);
    const todayAnsweredIds = $derived.by(() => {
      void dataRev;
      const today = localDateKeyOf(Date.now());
      // Snapshot is intentionally a plain Set: this derived value is consumed as an immutable filter.
      // eslint-disable-next-line svelte/prefer-svelte-reactivity
      const ids = new Set<string>();
      try {
        for (const event of app?.attempts.all() ?? []) {
          if (event.verdict !== "not_attempted" && localDateKeyOf(event.ts) === today) ids.add(event.qid);
        }
      } catch { /* 读取流水失败时保持原计划，不阻断练习入口 */ }
      return ids;
    });
    const todayQueue = $derived(
      plan
        ? todayQueueFor(practiceQuestions, remainingPlan(plan, todayAnsweredIds).queue)
        : todayQueueFor(practiceQuestions),
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
      if (!app) return 0;
      const ids = new Set(questions.map((q) => q.id));
      try { return [...app.derived().wrongbook.values()].filter((w) => ids.has(w.qid) && w.status === "eliminated").length; } catch { return 0; }
    });
    const clearPct = $derived(
      eliminatedCount + wrongList.length ? Math.round((eliminatedCount / (eliminatedCount + wrongList.length)) * 100) : 0,
    );
    /** 错题队列：错次降序 → 最近错误降序（紧迫度序） */
    let wbTab = $state<"active" | "archived" | "eliminated">("active");
    let wbReasonFilter = $state<"all" | "careless" | "unknown" | "trap">("all");
    let wbFilterStubborn = $state(false);
    let wbKpFilter = $state("");
    let wbSortMode = $state<"default" | "wrongCount" | "kp">((readLocal("lv-exam/wrong-sort") as any) || "default");
    const archivedWrongList = $derived.by(() => {
      void dataRev;
      if (!app) return [];
      const ids = new Set(questions.map((q) => q.id));
      return app.listArchivedWrongs().filter((w) => ids.has(w.qid));
    });
    const eliminatedWrongList = $derived.by(() => {
      void dataRev;
      if (!app) return [];
      const ids = new Set(questions.map((q) => q.id));
      try {
        return [...app.derived().wrongbook.values()]
          .filter((w) => ids.has(w.qid) && w.status === "eliminated")
          .sort((a, b) => b.lastWrongAt - a.lastWrongAt);
      } catch {
        return [];
      }
    });
    const wrongQueue = $derived(
      [...wrongList].sort((a, b) => b.wrongCount - a.wrongCount || b.lastWrongAt - a.lastWrongAt),
    );
    const wbKpOptions = $derived.by(() => {
      // eslint-disable-next-line svelte/prefer-svelte-reactivity -- derived 内纯派生去重集
      const set = new Set<string>();
      for (const w of wrongQueue) {
        const q = questionMap.get(w.qid);
        if (q?.kp) set.add(q.kp.split("/")[0]);
      }
      return Array.from(set).sort();
    });
    const filteredWrongQueue = $derived.by(() => {
      let list = wrongQueue;
      if (wbReasonFilter !== "all") list = list.filter((w) => reasonOf(w.qid) === wbReasonFilter);
      if (wbFilterStubborn) list = list.filter((w) => isStubbornWrong(w));
      if (wbKpFilter) list = list.filter((w) => questionMap.get(w.qid)?.kp?.startsWith(wbKpFilter));
      if (wbSortMode === "wrongCount") {
        list = [...list].sort((a, b) => (b.wrongCount || 0) - (a.wrongCount || 0));
      } else if (wbSortMode === "kp") {
        list = [...list].sort((a, b) => String(questionMap.get(a.qid)?.kp || "").localeCompare(String(questionMap.get(b.qid)?.kp || "")));
      }
      return list;
    });

    async function archiveWrong(qid: string) {
      if (!app) return;
      try {
        await app.archiveWrong(qid);
        dataRev++;
        showMessage(t("wrongbook.archivedSuccess"), 2800, "info");
      } catch (e) {
        showMessage(String(e instanceof Error ? e.message : e), 4200, "error");
      }
    }

    async function unarchiveWrong(qid: string) {
      if (!app) return;
      try {
        await app.unarchiveWrong(qid);
        dataRev++;
        showMessage(t("wrongbook.unarchivedSuccess"), 2800, "info");
      } catch (e) {
        showMessage(String(e instanceof Error ? e.message : e), 4200, "error");
      }
    }

    async function snoozeWrong(qid: string, days = 7) {
      if (!app) return;
      try {
        await app.snoozeWrong(qid, days);
        dataRev++;
        showMessage(t("wrongbook.snoozeDone"), 2800, "info");
      } catch (e) {
        showMessage(String(e instanceof Error ? e.message : e), 4200, "error");
      }
    }

    async function restoreWrongToActive(qid: string) {
      if (!app) return;
      try {
        await app.setWrongStatus(qid, "active");
        dataRev++;
        showMessage("已将该题重新收录入在册错题库", 2800, "info");
      } catch (e) {
        showMessage(String(e instanceof Error ? e.message : e), 4200, "error");
      }
    }

    function switchView(next: View) {
      errorMsg = "";
      view = next;
      if (next === "import") void checkImportCheckpoint();
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
    const paletteCommands: PaletteCommand[] = [
      { group: t("palette.views"), icon: "home", label: t("tab.practice"), keywords: "home entry today", run: () => { switchView("entry"); } },
      { group: t("palette.views"), icon: "xcircle", label: t("wrongbook.title"), keywords: "wrongbook wrong", run: () => { switchView("wrongbook"); void loadQuestions(); } },
      { group: t("palette.views"), icon: "table", label: t("mode.browse"), keywords: "browse bank list", run: () => { switchView("browse"); void loadQuestions(); } },
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
      { group: t("palette.tabs"), icon: "clock", label: t("tab.mock"), keywords: "mock exam", run: () => plugin.openMock?.() },
      { group: t("palette.tabs"), icon: "chart", label: t("tab.report"), keywords: "report stats", run: () => plugin.openReport?.() },
    ];

    function onTaskNav(target: "today" | "bank" | "create" | "mock" | "report") {
      if (target === "mock") return plugin.openMock?.();
      if (target === "report") return plugin.openReport?.();
      const next: View = target === "today" ? "entry" : target === "bank" ? "browse" : "manual";
      switchView(next);
      if (next === "entry" || next === "browse") void loadQuestions();
    }

    /** 47-02 lite：首用引导（有题库 + 零作答记录 + 未跳过时显示；产生首个作答后自动消失） */
    let onboardingDismissed = $state(readLocal("lv-exam-onboarded") === "1");
    const onboarding = $derived(
      hasBank && questionsLoaded && questions.some((q) => q.type !== "material") && !onboardingDismissed && view === "entry" && !!app && app.attempts.all().length === 0,
    );

    /** 会话启动失败可见化（47-06 lite）：单活动冲突/离线等不再静默吞掉。
     *  40-05 活动会话协商：冲突时提供「放弃当前并新开」（旧会话有 checkpoint，可恢复） */
    async function negotiateStart(qs: Question[], mode: string, bankId = activeBankId): Promise<boolean> {
      try {
        sessionSeed = sessionSeed || randomSeedId(); // 65-05：调用方可预置（快速刷题抽题与卷序同种子）
        session = await app.startSession(qs, mode, bankId, { interleave: materialInterleave, seed: sessionSeed });
        trails.clear();
        answerStart = Date.now(); // 首题计时基线
        return true;
      } catch (e) {
        const msg = String(e instanceof Error ? e.message : e);
        if (!msg.includes("已有进行中的会话")) {
          errorMsg = offline ? t("state.offlineHint") : msg;
          showMessage(errorMsg, 4200, "error");
          return false;
        }
        const { confirmDialogSync } = await import("../../libs/dialog");
        if (!(await confirmDialogSync({ title: t("session.conflictTitle"), content: t("session.conflictBody") }))) return false;
        await app.discardSession();
        try {
          session = await app.startSession(qs, mode, bankId, { interleave: materialInterleave });
          return true;
        } catch (e2) {
          errorMsg = offline ? t("state.offlineHint") : String(e2 instanceof Error ? e2.message : e2);
          showMessage(errorMsg, 4200, "error");
          return false;
        }
      }
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
        const byId = new Map(all.map((q) => [q.id, q]));
        const picked = qids.flatMap((id) => {
          const q = byId.get(id);
          return q && q.type !== "material" ? [q] : [];
        });
        if (picked.length < qids.length) {
          showMessage(t("query.missing").replace("{n}", String(qids.length - picked.length)), 3600, "info");
        }
        if (!picked.length) {
          showMessage(t("query.empty"), 3200, "info");
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
        feedback = null; selected = ""; draftLive = ""; confidenceSel = ""; sessionDone = null;
        view = "session";
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
      sessionSeed = randomSeedId(); // 65-05：抽题与卷序共用同一种子
      const qs = (await loadQuestions()).filter((q) => q.type !== "material");
      if (questionsError) {
        errorMsg = questionsError;
        showMessage(t("entry.loadError"), 2800, "error");
        return;
      }
      if (!qs.length) { showMessage(t("state.emptyBank"), 2800, "info"); return; }
      let picked: Question[];
      if (mode.startsWith("tag:")) {
        const targetTag = mode.slice(4);
        picked = qs.filter((q) => (q.userTags || []).includes(targetTag));
        if (!picked.length) { showMessage("当前标签下暂无题目", 2800, "info"); return; }
      } else if (mode === "wrong") {
        picked = app.wrongDrill(qs);
        if (!picked.length) { showMessage(t("state.noWrong"), 2800, "info"); return; }
      } else if (mode === "cram") {
        picked = app.cramDrill(qs);
        if (!picked.length) { showMessage(t("state.noCram"), 2800, "info"); return; }
      } else if (mode === "fav") {
        picked = app.favDrill(qs);
        if (!picked.length) { showMessage(t("state.noFav"), 2800, "info"); return; }
      } else if (mode === "daily") {
        const goal = Number(plugin.settingUtils?.get?.("dailyGoal") ?? 10);
        picked = app.dailyDrill(qs, [], Number.isFinite(goal) && goal > 0 ? goal : 10);
        if (!picked.length) { errorMsg = t("state.emptyBank"); return; }
      } else {
        // 65-06 lite：去重窗口走设置（默认 3 天，0=关闭）；跨模式；池不足回退全量
        const avoidDays = Number(plugin.settingUtils?.get?.("quickAvoidDays") ?? 3);
        const seen = avoidDays > 0 ? recentlySeen(app.attempts.all(), avoidDays * 86_400_000, Date.now()) : undefined;
        picked = seen ? app.quickDrill(qs, 20, sessionSeed, { avoid: seen }) : app.quickDrill(qs, 20, sessionSeed);
      }
      await safeStart(groupAdjacent(picked), mode, () => {
        feedback = null; selected = ""; confidenceSel = ""; sessionDone = null;
        view = "session";
        restoreQuestionControls();
      });
    }

    /** 错题本行级重练：单题会话（与 open-question 总线同路径，mode=wrong） */
    async function startWrongFor(qid: string) {
      errorMsg = "";
      const all = questions.length ? questions : await loadQuestions();
      const q = all.find((x) => x.id === qid);
      if (!q) { showMessage(t("query.empty"), 3200, "info"); return; }
      await safeStart(groupAdjacent([q]), "wrong", () => {
        feedback = null; selected = ""; confidenceSel = ""; sessionDone = null;
        view = "session";
      });
    }

    /** 举一反三（中公杀招，PRD §4）：按考点推荐同考点变式题练习 */
    async function startSameKpFor(qid: string) {
      errorMsg = "";
      const all = questions.length ? questions : await loadQuestions();
      const q = all.find((x) => x.id === qid);
      if (!q?.kp) { showMessage(t("state.noSameKp"), 2800, "info"); return; }
      const related = all.filter((x) => x.id !== qid && x.kp === q.kp);
      if (!related.length) { showMessage(t("state.noSameKp"), 2800, "info"); return; }
      await safeStart(groupAdjacent(related), "same-kp", () => {
        feedback = null; selected = ""; confidenceSel = ""; sessionDone = null;
        view = "session";
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
        feedback = null; selected = ""; confidenceSel = ""; sessionDone = null;
        view = "session";
        restoreQuestionControls();
        showMessage(`⚡ 已开启当前筛选专项目标特训（共 ${qs.length} 题）`, 3000, "info");
      });
    }

    async function startFilteredWrongDrill() {
      if (!filteredWrongQueue.length) { showMessage(t("wrongbook.noFiltered"), 2600, "info"); return; }
      const qids = filteredWrongQueue.map((w) => w.qid);
      const all = await loadQuestions();
      const qs = qids.map((id) => all.find((x) => x.id === id)).filter(Boolean) as Question[];
      if (!qs.length) return;
      await safeStart(qs, "wrong", () => {
        feedback = null; selected = ""; confidenceSel = ""; sessionDone = null; view = "session";
      });
    }

    let wrongBusyId = $state("");
    /** 错题手动处置（已掌握）：确认后写入；失败时保留队列项并允许重试 */
    async function masterWrong(qid: string) {
      if (wrongBusyId) return;
      wrongBusyId = qid;
      try {
        const question = questionMap.get(qid);
        const { confirmDialogSync } = await import("../../libs/dialog");
        if (!(await confirmDialogSync({
          title: t("wrongbook.masterOneTitle"),
          content: t("wrongbook.masterOneConfirm").replace("{question}", escapeHtml(question?.stem.slice(0, 100) ?? qid)),
        }))) return;
        await app.setWrongStatus(qid, "mastered");
        dataRev++;
        if (soundEnabled) playCelebrationChord();
        showMessage(t("wrongbook.masteredDone"), 2400, "info");
      } catch (e) {
        showMessage(t("wrongbook.masterFailed").replace("{message}", offline ? t("state.offlineHint") : String(e instanceof Error ? e.message : e)), 4600, "error");
      } finally { wrongBusyId = ""; }
    }

    let bulkMasterBusy = $state(false);
    /** 全部标为已掌握（批量处置）：逐题调用同 API，带确认 */
    async function masterAllWrong() {
      if (bulkMasterBusy || !wrongList.length) return;
      const { confirmDialogSync } = await import("../../libs/dialog");
      if (!(await confirmDialogSync({ title: t("wrongbook.masterAllTitle"), content: t("wrongbook.masterAllConfirm").replace("{n}", String(wrongList.length)) }))) return;
      bulkMasterBusy = true;
      let ok = 0;
      let failed = 0;
      try {
        for (const w of wrongList) {
          try { await app.setWrongStatus(w.qid, "mastered"); ok++; } catch { failed++; }
        }
        dataRev++;
        const message = failed
          ? t("wrongbook.masterAllPartial").replace("{ok}", String(ok)).replace("{failed}", String(failed))
          : t("wrongbook.masterAllDone").replace("{n}", String(ok));
        showMessage(message, 4200, failed ? "error" : "info");
      } finally { bulkMasterBusy = false; }
    }

    // ---------- 收藏（exam-fav；E 键 + 星标 + 过滤） ----------
    let favBusy = $state(false);
    async function toggleFavQuestion(q: (Question & { blockId?: string; fav?: boolean }) | undefined) {
      if (!q || !app || favBusy) return;
      favBusy = true;
      try {
        const nextFav = await app.toggleFav(q);
        questions = questions.map((item) => (item.id === q.id ? { ...item, fav: nextFav } : item));
        dataRev++;
        showMessage(nextFav ? t("session.favAdded") : t("session.favRemoved"), 2000, "info");
      } catch (e) {
        showMessage(t("session.favFailed").replace("{message}", offline ? t("state.offlineHint") : String(e instanceof Error ? e.message : e)), 4200, "error");
      } finally { favBusy = false; }
    }
    async function toggleFavCurrent() {
      await toggleFavQuestion(session?.current as (Question & { blockId?: string; fav?: boolean }) | undefined);
    }

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
        feedback = null;
        selected = "";
        draftLive = "";
        confidenceSel = "";
        // 同组切题保持展开状态，避免重复手动展开
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
      const d = p.reasonData ?? { days: 0, cram: 0, stubborn: 0, due: 0 };
      if (p.reasonKind === "sprint") return t("plan.sprint").replace("{d}", String(d.days)).replace("{n}", String(d.cram)).replace("{m}", String(d.stubborn));
      if (p.reasonKind === "due") return t("plan.due").replace("{n}", String(d.due));
      return t("plan.reflow").replace("{m}", String(d.stubborn));
    }
    /** 53-01 lite：今日计划分钟预算（与 plan 同步重算） */
    let planTime = $state<import("@/core/timeBudget").TimeEstimate | null>(null);
    /** 53-02 lite：多考期清单（按剩余天数升序；入口页展示全部未来考期 chips） */
    let examProfileList = $state<import("@/core/planner").ExamProfile[]>([]);
    /** 44-05 lite：昨日计划轨迹（缺席连续计数；入口页 chip） */
    let planTrace = $state<import("@/core/planner").PlanTrace | null>(null);

    function rebuildPlan(dueFirst?: Question[]) {
      if (!app) { plan = null; return; }
      const examDate = String(plugin.settingUtils?.get?.("examDate") ?? "").trim();
      const sprintDays = Number(plugin.settingUtils?.get?.("sprintDays") ?? 14);
      const goal = Number(plugin.settingUtils?.get?.("dailyGoal") ?? 10);
      // 53-02 lite：多考期（设置 textarea「名称:日期」逐行）——计划锚定最近未来考期，无则回退单考期设置
      examProfileList = parseExamProfiles(String(plugin.settingUtils?.get?.("examProfiles") ?? ""));
      const nearest = nearestUpcoming(examProfileList);
      const effectiveExamDate = nearest?.date ?? (examDate || undefined);
      // rebuildPlan 函数内累加器（非组件状态），不转 SvelteMap/SvelteSet
      // eslint-disable-next-line svelte/prefer-svelte-reactivity
      const wrongCounts = new Map<string, number>();
      for (const w of app.derived().wrongbook.values()) wrongCounts.set(w.qid, w.wrongCount);
      const activeWrongIds = new Set(app.wrongItems().map((w) => w.qid));
      const freshPlan = planToday({
        examDate: effectiveExamDate,
        sprintDays: Number.isFinite(sprintDays) && sprintDays > 0 ? sprintDays : 14,
        dailyGoal: Number.isFinite(goal) && goal > 0 ? goal : 10,
        all: questions, wrongCounts, activeWrongIds,
        wrongReasons: app.wrongReasonMap() ?? undefined,
        dueFirst: dueFirst ?? [],
      });
      // 今日计划与作答流水合并：完成后重算入口时自动显示剩余题目。
      const today = localDateKeyOf(Date.now());
      const completedToday = new Set(
        app.attempts
          .all()
          .filter((event) => event.verdict !== "not_attempted" && localDateKeyOf(event.ts) === today)
          .map((event) => event.qid),
      );
      plan = remainingPlan(freshPlan, completedToday);
      // 53-01 lite：今日计划分钟预算（按题型历史用时中位；缺历史题型如实标注默认值）
      const typeOf = new Map(questions.map((q) => [q.id, q.type] as const));
      planTime = estimatePlanMinutes(plan.queue, avgMsByType(app.attempts.all(), (qid) => typeOf.get(qid)));
      // 44-05 lite：昨日计划回看轨迹（缺席连续计数持久化；入口页 chip 提示）
      void (async () => {
        const prev = ((await app.loadAux<import("@/core/planner").PlanTrace | null>("plan/trace")) ?? null);
        const yesterday = new Date(Date.now() - 86_400_000);
        const yKey = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, "0")}-${String(yesterday.getDate()).padStart(2, "0")}`;
        const doneY = app.attempts
          .all()
          .filter((e) => e.verdict !== "not_attempted" && localDateKeyOf(e.ts) === yKey).length;
        const trace = nextPlanTrace(prev, localDateKeyOf(Date.now()), plan!.queue.length, doneY);
        planTrace = trace;
        void app.saveAux("plan/trace", trace).catch((e: unknown) => { showMessage(String(e instanceof Error ? e.message : e), 3600, "error"); });
      })();
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
        feedback = null; selected = ""; confidenceSel = ""; sessionDone = null;
        view = "session";
      });
    }

    // ---------- 背诵（S4 lite） ----------
    /** 跳回源笔记精确位置（iDoRecall 范式 lite：doc zoomIn 到题目块） */
    function jumpToSource() {
      const q = reciteQueue[reciteCursor] as Question & { blockId?: string; rootId?: string };
      if (!q?.blockId || !q?.rootId) return;
      void import("siyuan").then(({ openTab }) => {
        openTab({ app: ((plugin.app ?? plugin) as import("siyuan").App), doc: { id: q.rootId, zoomIn: Boolean(q.blockId) } });
      });
    }
    async function startRecite() { void 0; // 背诵朗读按钮在视图内直接调用 ttsSpeak
      // 首次进入时 questions 可能尚未加载（模式卡直达）——与 startDrill 同路径先拉取
      const all = (questions.length ? questions : await loadQuestions()).filter((q) => q.type !== "material");
      if (questionsError) {
        errorMsg = questionsError;
        showMessage(t("entry.loadError"), 2800, "error");
        return;
      }
      const qs = app.wrongDrill(all);
      const pool = qs.length ? qs : all;
      if (!pool.length) { errorMsg = t("state.emptyBank"); return; }
      // 背诵组大小可配（TODO 13 组）：设置 reciteGroupSize，夹在 5–50
      const size = Math.max(5, Math.min(50, Number(plugin.settingUtils?.get?.("reciteGroupSize") ?? 15) || 15));
      reciteQueue = app.quickDrill(pool, size);
      reciteCursor = 0; reciteRevealed = false; reciteDone = false; reciteHint = 0; reciteRatings = [];
      reciteSessionId = `s-recite-${Date.now().toString(36)}`;
      view = "recite";
      if (reciteAutoTts && reciteQueue[0]) {
        ttsSpeak(reciteQueue[0].stem, { lang: reciteQueue[0].studyMeta?.lang, rate: ttsSlowRate ? 0.85 : 1 });
      }
    }

    function revealRecite() {
      reciteRevealed = true;
      if (reciteAutoTts && reciteQueue[reciteCursor]) {
        const q = reciteQueue[reciteCursor];
        const ansText = String(q.answer ?? "");
        if (ansText) ttsSpeak(ansText, { lang: q.studyMeta?.lang, rate: ttsSlowRate ? 0.85 : 1 });
      }
    }

    async function rateSelf(rating: 1 | 2 | 3 | 4) {
      if (reciteSaving) return;
      const q = reciteQueue[reciteCursor];
      if (!q) return;
      // 39-03：防双击与重复提交——同会话同题同评级只允许写一次
      const attemptKey = ratingAttemptKey(reciteSessionId, q.id, rating);
      if (!reciteGuard.tryAcquire(attemptKey)) return;
      reciteSaving = true;
      reciteError = "";
      try {
        // 39-03：返回评级结果状态（未转卡/已写回/待确认/失败/离线），不再静默吞失败
        const outcome = await app.reciteAnswer(bankName, q as Question & { blockId?: string }, rating, reciteSessionId, 0);
        reciteGuard.settle(attemptKey, outcome.terminal);
        reciteOutcome = outcome;
        reciteRatings.push(rating);
        reciteHint = 0;
        if (reciteCursor < reciteQueue.length - 1) {
          reciteCursor++; reciteRevealed = false; speechEvalResult = null; speechRecording = false;
          if (reciteAutoTts && reciteQueue[reciteCursor]) {
            ttsSpeak(reciteQueue[reciteCursor].stem, { lang: reciteQueue[reciteCursor].studyMeta?.lang, rate: ttsSlowRate ? 0.85 : 1 });
          }
        } else {
          reciteDone = true;
        }
      } catch (e) {
        reciteGuard.settle(attemptKey, false); // 失败：允许重试
        reciteError = String(e instanceof Error ? e.message : e);
        reciteOutcome = null;
      } finally {
        reciteSaving = false;
      }
    }

    function exitRecite() {
      view = "entry"; reciteQueue = []; reciteRevealed = false; reciteDone = false; reciteHint = 0; reciteRatings = [];
      reciteGuard.clear(); reciteOutcome = null;
    }

    /** 错题册导出：Markdown 文档写入题库"导出"区（支持考点/错因/时间过滤） */
    let expKp = $state("");
    let expReason = $state("");
    let expDays = $state(0);
    const expKpRoots = $derived([...new Set(questions.map((q) => q.kp?.split("/")[0]).filter(Boolean))]);

    // ---------- 挑战码（友谊赛复制/导入：含答案，双方本地判分） ----------
    function buildChallengePaper() {
      const pool = questions.filter((q) => q.type !== "material").slice(0, 50);
      return {
        v: 1 as const, title: `${bankName} 挑战`, durationS: 600,
        questions: pool.map((q) => ({ stem: q.stem, options: q.options, answer: q.answer, type: q.type, kp: q.kp })),
      };
    }

    async function copyChallengeCode() {
      const paper = buildChallengePaper();
      if (!paper.questions.length) { showMessage(t("state.emptyBank"), 2800, "info"); return; }
      try {
        const { encodeChallengeCopy } = await import("@/core/challenge");
        await navigator.clipboard.writeText(encodeChallengeCopy(paper));
        showMessage(t("challenge.copied"), 3600, "info");
      } catch (e) {
        showMessage(String(e instanceof Error ? e.message : e), 4200, "error");
      }
    }

    async function importChallengeCode() {
      const { inputDialogSync } = await import("../../libs/dialog");
      const code = await inputDialogSync({ title: t("challenge.importTitle"), placeholder: t("challenge.importPlaceholder") });
      if (!code?.trim()) return;
      try {
        const { decodeChallenge } = await import("@/core/challenge");
        const paper = decodeChallenge(code.trim());
        if (!paper) throw new Error(t("challenge.badCode"));
        const qs: Question[] = paper.questions.map((q) => makeQuestion({ type: q.type, stem: q.stem, options: q.options, answer: q.answer, kp: q.kp }));
        session = await app.startSession(qs, "challenge", activeBankId);
        feedback = null; selected = ""; confidenceSel = ""; sessionDone = null;
        view = "session";
      } catch (e) {
        errorMsg = String(e instanceof Error ? e.message : e);
      }
    }

    async function exportWrong() {
      if (!activeBankId) { errorMsg = t("state.emptyBank"); return; }
      try {
        const docId = await app.exportWrongbook(activeBankId, bankName, {
          kpRoot: expKp || undefined,
          reason: expReason || undefined,
          sinceDays: expDays || undefined,
        });
        void docId;
        showMessage(t("export.done"), 3600, "info");
      } catch (e) {
        showMessage(offline ? t("state.offlineHint") : String(e instanceof Error ? e.message : e), 4200, "error");
      }
    }

    let syncDocsBusy = $state(false);
    function retryForgotRecite() {
      const forgotIndices = reciteRatings.map((r, i) => (r === 1 ? i : -1)).filter((i) => i >= 0);
      const forgotQueue = forgotIndices.map((i) => reciteQueue[i]).filter(Boolean);
      if (!forgotQueue.length) return;
      reciteQueue = forgotQueue;
      reciteCursor = 0;
      reciteRevealed = false;
      reciteDone = false;
      reciteHint = 0;
      reciteRatings = [];
      if (reciteAutoTts && reciteQueue[0]) {
        ttsSpeak(reciteQueue[0].stem, reciteQueue[0].studyMeta?.lang ? { lang: reciteQueue[0].studyMeta.lang } : 1);
      }
    }

    async function reciteForgotToCard() {
      if (!activeBankId || !app) return;
      const forgotIndices = reciteRatings.map((r, i) => (r === 1 ? i : -1)).filter((i) => i >= 0);
      const forgotQs = forgotIndices.map((i) => reciteQueue[i]).filter(Boolean);
      if (!forgotQs.length) return;
      try {
        const n = await app.convertToCards(activeBankId, bankName, forgotQs);
        showMessage(n ? `${t("memory.toCardDone")} (${n})` : t("memory.toCardMissing"), 3200, n ? "info" : "error");
      } catch (e) {
        showMessage(String(e instanceof Error ? e.message : e), 4200, "error");
      }
    }

    async function reciteForgotToActions() {
      if (!app) return;
      const forgotIndices = reciteRatings.map((r, i) => (r === 1 ? i : -1)).filter((i) => i >= 0);
      const forgotQs = forgotIndices.map((i) => reciteQueue[i]).filter(Boolean);
      if (!forgotQs.length) return;
      try {
        const r = await app.addActions(forgotQs.map((q) => ({
          kind: "redo" as const,
          qid: q.id,
          sessionId: reciteSessionId,
          detail: `背诵忘却重练：${(q.kp ?? q.stem ?? q.id).slice(0, 40)}`,
        })));
        showMessage(`已成功添加 ${r.added} 条背诵重练待办（跳过重复 ${r.skipped} 条）`, 3200, "info");
      } catch (e) {
        showMessage(String(e instanceof Error ? e.message : e), 4200, "error");
      }
    }

    async function copyTodayReportMarkdown() {
      const todayStr = localDate(Date.now());
      const lines = [
        `### 📅 小驴学习 · 今日研学打卡`,
        `- **学习日期**：${todayStr}`,
        `- **当前题库**：${bankName || "默认题库"}`,
        `- **今日作答**：**${todayDone} 题**（今日目标：${dailyGoalN} 题 · 达成率 ${goalPct}%）`,
        `- **连续学习**：🔥 **${streakDays} 天连胜**`,
        `- **错题动态**：当前在册错题 ${wrongList.length} 道 · 累计消灭 ${eliminatedCount} 道（消灭率 ${clearPct}%）`,
      ];
      if (plan) {
        lines.push(`- **备考建议**：${planReasonText(plan)}`);
      }
      lines.push(`\n> 坚持就是胜利，每天进步一点点！💪`);
      try {
        await navigator.clipboard.writeText(lines.join("\n"));
        showMessage(t("entry.reportCopied"), 3200, "info");
      } catch {
        showMessage(t("mock.summaryCopyFailed"), 3200, "error");
      }
    }

    async function syncBankDocs() {
      if (!activeBankId || syncDocsBusy) return;
      syncDocsBusy = true;
      try {
        await app?.syncBankToLocalDocs(activeBankId, bankName);
        showMessage(t("sync.docsDone"), 3600, "info");
      } catch (e) {
        showMessage(String(e instanceof Error ? e.message : e), 4200, "error");
      } finally {
        syncDocsBusy = false;
      }
    }

    async function pasteClipboardToImport() {
      if (importBusy) return;
      try {
        const text = await navigator.clipboard.readText();
        if (!text?.trim()) {
          showMessage(t("import.clipboardEmpty"), 2800, "info");
          return;
        }
        importText = text;
        showMessage(t("import.clipboardPasted"), 2800, "info");
      } catch {
        showMessage(t("import.clipboardFailed"), 3200, "info");
      }
    }

    let importDragOver = $state(false);
    async function onImportFileDrop(e: DragEvent) {
      e.preventDefault();
      e.stopPropagation();
      importDragOver = false;
      if (importBusy || !e.dataTransfer?.files?.length) return;
      const file = e.dataTransfer.files[0];
      if (/\.(xlsx|xls|csv)$/i.test(file.name)) {
        await onExcelFile(inputLike(file) as unknown as Event);
      } else if (/\.(txt|md|gift|aiken)$/i.test(file.name)) {
        try {
          const text = await file.text();
          importText = text;
          showMessage(t("import.fileLoaded"), 2800, "info");
        } catch {
          showMessage(t("import.readFailed"), 3200, "error");
        }
      } else {
        showMessage(t("import.dropUnsupported", t("import.unsupportedDrop")), 3200, "info");
      }
    }

    /** 官方 Excel 模板下载（运行时生成，docs/15 规范） */
    async function downloadTemplate() {
      const { buildTemplateWorkbook } = await import("@/importer/template");
      const { buffer, filename } = buildTemplateWorkbook();
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      URL.revokeObjectURL(a.href);
    }

    /** 错误清单导出 CSV（Excel 友好，BOM 头） */
    function downloadErrorsCsv() {
      if (!importReport?.errors.length) return;
      const csv = errorsToCsv(importReport.errors);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `导入错误清单 ${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
    }

    // ---------- 题库包分享（.sy.zip 原生格式） ----------
    async function exportBank() {
      if (!activeBankId) return;
      try {
        const { zipPath, filename } = await app.exportBankSyZip(activeBankId);
        const a = document.createElement("a");
        a.href = `${window.location.origin}${zipPath}`;
        a.download = filename;
        a.click();
        showMessage(t("share.exportDone") + filename, 4000, "info");
      } catch (e) {
        showMessage(offline ? t("state.offlineHint") : String(e instanceof Error ? e.message : e), 4200, "error");
      }
    }

    /** 拖拽导入（TODO 18 组）：xlsx/csv → Excel 流程；sy.zip → 题库包导入 */
    function onDrop(e: DragEvent) {
      if (!tabRoot?.getClientRects().length || !tabRoot.contains(e.target as Node) || importBusy || creating) return;
      e.preventDefault();
      const file = e.dataTransfer?.files?.[0];
      if (!file) return;
      if (!hasBank && !/\.zip$/i.test(file.name)) { errorMsg = t("guard.needBankFirst"); return; }
      if (/\.xlsx$|\.xls$|\.csv$/i.test(file.name)) {
        view = "import";
        void onExcelFile(inputLike(file) as unknown as Event);
      } else if (/\.zip$/i.test(file.name)) {
        errorMsg = ""; importError = ""; importResult = null;
        void importBank(inputLike(file) as unknown as Event);
      } else {
        errorMsg = t("import.unsupportedDrop");
      }
    }

    /** 构造伪 input 对象（复用 onExcelFile/importBank 的取文件逻辑） */
    function inputLike(file: File): { target: HTMLInputElement } {
      return { target: { files: [file], value: "" } as unknown as HTMLInputElement };
    }

    async function importBank(e: Event) {
      const input = e.target as HTMLInputElement;
      const file = input.files?.[0];
      if (!file) return;
      try {
        // 38-05：multipart 上传，浏览器/桌面同路径（不再依赖 Electron File.path）
        const { registered } = await app.importBankSyZip(file, file.name);
        banks = app.listBanks();
        showMessage(registered.length ? t("share.importRegistered").replace("{names}", registered.join("、")) : t("share.importDone"), 4600, "info");
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
      const entries = Object.entries(explainHistory).slice(-10);
      await app.saveAux("ai/explain-history", Object.fromEntries(entries));
    }

    /** AI 发送记录（U23/41-01 lite）：本地留存实际 payload（信封+消息），供"我发送了什么"审计 */
    async function logAiTask(entry: { templateId: string; qid: string; status: string; tokens: number; messages: import("@/ai/client").AiMessage[] }) {
      try {
        const log = (await app.loadAux<(typeof entry & { at: number })[]>("ai/task-log")) ?? [];
        log.push({ ...entry, at: Date.now() });
        await app.saveAux("ai/task-log", log.slice(-20));
      } catch { /* 审计日志失败不影响任务本身 */ }
    }

    interface AiTaskLogEntry { at: number; templateId: string; qid: string; status: string; tokens: number; messages: import("@/ai/client").AiMessage[] }
    let aiTaskLog = $state<AiTaskLogEntry[]>([]);
    async function loadAiTaskLog() {
      try { aiTaskLog = (await app.loadAux<AiTaskLogEntry[]>("ai/task-log")) ?? []; } catch { aiTaskLog = []; }
    }
    let explainFollowUp = $state("");
    let explainSaveBusy = $state(false);
    let explainSavedQid = $state("");
    let explainSaveError = $state("");
    let explainSaveErrorQid = $state("");

    async function explainCurrent(mode: "explain" | "hint" | "socratic" = "explain") {
      const q = session?.current;
      if (!q || explainBusy || !feedback) return;
      explainSavedQid = ""; explainSaveError = ""; explainSaveErrorQid = "";
      if (!app.kernelOnline) { explainText = t("state.offlineHint"); return; }   // 离线早退（兜底）
      explainBusy = true; explainText = ""; explainQid = q.id;
      // G1 任务身份：模板+题面指纹+作答快照+提交状态（ai/task.ts 信封契约）
      const reqCtx: import("@/ai/task").AiTaskContext = {
        templateId: mode === "explain" ? "practice.explain" : mode === "hint" ? "practice.hint" : "practice.socratic",
        templateVersion: 2, // 五八批模板修订（T07 分层/T06 单问题）
        qid: q.id,
        questionRevision: questionFingerprint(q),
        learnerAnswer: feedback.myAnswer,
        submitted: true,
        mode: "practice",
        sessionId: session?.id ?? "",
      };
      try {
        const { SiyuanAiChannel, OpenAiChannel } = await import("@/ai/client");
        const { buildExplainMessages } = await import("@/ai/explain");
        const { AiTaskRunner } = await import("@/ai/task");
        const endpoint = String(plugin.settingUtils?.get?.("aiEndpoint") ?? "");
        const key = resolveAiKey(plugin);
        const model = String(plugin.settingUtils?.get?.("aiModel") ?? "gpt-4o-mini");
        const ch = endpoint && key
          ? new OpenAiChannel({ endpoint, apiKey: key, model }, (u, i) => fetch(u, i))
          : new SiyuanAiChannel(app.deps.client);
        const messages = buildExplainMessages(q, feedback.myAnswer, mode);
        const env = await new AiTaskRunner(ch).run(reqCtx, messages);
        void logAiTask({ templateId: env.templateId, qid: reqCtx.qid, status: env.status, tokens: env.tokens, messages });
        if (env.status === "ok" && env.data.text) {
          explainText = env.data.text;
          explainHistory[q.id] = [...messages, { role: "assistant", content: env.data.text }];
          void persistExplainHistory().catch((e: unknown) => { explainSaveError = String(e instanceof Error ? e.message : e); });
          void app.recordAiUsage(ch.id, env.tokens, 1).catch(() => undefined);
          helpShown.set(q.id, mode); // 114-01：受助标记——同题再答（重排队）时随 attempt 落 help 字段
        } else {
          // 有类型失败（G6 闸门/预算/通道错误）：显示信封摘要，不裸抛异常栈
          explainText = envStatusLine(env);
        }
        // G2：响应期间切题时，explainQid 门控使旧讲解不占当前题展示；历史已按 q.id 留草稿
      } catch (e) {
        explainText = String(e instanceof Error ? e.message : e);
      } finally { explainBusy = false; }
    }

    /** 信封 summary 是 zh 审计口径；展示层按状态本地化，错误详情原样附后 */
    function envStatusLine(env: { status: string; summary: string; error?: string }): string {
      const line =
        env.status === "ok" ? t("ai.emptyResponse") : env.status === "unsupported" ? t("ai.taskUnsupported") : t("ai.taskFailed");
      return line + (env.error ? ": " + env.error : "");
    }

    /** 提示按钮文案：随已展示层级推进（114-01 一次一层） */
    function hintButtonLabel(q: { id: string; options: string[] }): string {
      const step = nextHintStepSync(hintLevels.get(q.id) ?? 0, q.options.length);
      if (step.kind === "reveal") return t("explain.hintTop");
      if (step.level === 1) return t("explain.hint");
      return t("explain.hintNext").replace("{n}", String(step.level));
    }
    /** 同步版推进判定（UI 文案用；请求路径用 ai/hint 的异步同名逻辑） */
    function nextHintStepSync(shown: 0 | 1 | 2 | 3, optionCount: number): { kind: "hint"; level: 1 | 2 | 3 } | { kind: "reveal" } {
      if (shown === 0) return { kind: "hint", level: 1 };
      if (shown === 1) return { kind: "hint", level: 2 };
      if (shown === 2 && optionCount <= 2) return { kind: "reveal" };
      if (shown === 2) return { kind: "hint", level: 3 };
      return { kind: "reveal" };
    }

    /** 114-01 一次一层提示：提交前后均可逐层申请；≤2 选项题型 L2 后转正式揭示；泄露守卫拦截疑似泄题层 */
    async function requestHint() {
      const q = session?.current;
      if (!q || explainBusy) return;
      explainSavedQid = ""; explainSaveError = ""; explainSaveErrorQid = "";
      explainQid = q.id; leakPending = null;
      if (!app.kernelOnline) { explainText = t("state.offlineHint"); return; }
      const shown = hintLevels.get(q.id) ?? 0;
      const step = nextHintStepSync(shown, q.options.length);
      if (step.kind === "reveal") {
        // G6 正式揭示：不冒充提示——提交作答由判定揭示答案，帮助事件随 attempt 如实落
        explainText = t("explain.hintReveal");
        return;
      }
      explainBusy = true; explainText = "";
      const submitted = !!feedback;
      // G1 任务身份：提交前提示携当前草稿（有草稿如实带出，无草稿=未作答）
      const reqCtx: import("@/ai/task").AiTaskContext = {
        templateId: "practice.hint",
        templateVersion: 2, // 一次一层模板修订（docs/18 T05）
        qid: q.id,
        questionRevision: questionFingerprint(q),
        learnerAnswer: feedback?.myAnswer ?? session?.getDraft(q.id) ?? null,
        submitted,
        mode: "practice",
        sessionId: session?.id ?? "",
      };
      try {
        const { SiyuanAiChannel, OpenAiChannel } = await import("@/ai/client");
        const { buildHintMessages, findHintLeaks } = await import("@/ai/hint");
        const { AiTaskRunner } = await import("@/ai/task");
        const endpoint = String(plugin.settingUtils?.get?.("aiEndpoint") ?? "");
        const key = resolveAiKey(plugin);
        const model = String(plugin.settingUtils?.get?.("aiModel") ?? "gpt-4o-mini");
        const ch = endpoint && key
          ? new OpenAiChannel({ endpoint, apiKey: key, model }, (u, i) => fetch(u, i))
          : new SiyuanAiChannel(app.deps.client);
        const shownTexts = hintTexts.get(q.id) ?? [];
        const messages = buildHintMessages(q, reqCtx.learnerAnswer, step.level, shownTexts);
        const env = await new AiTaskRunner(ch).run(reqCtx, messages);
        void logAiTask({ templateId: env.templateId, qid: reqCtx.qid, status: env.status, tokens: env.tokens, messages });
        if (env.status === "ok" && env.data.text) {
          if (!submitted) {
            // 揭示前（答案未上屏）：确定性泄露守卫——命中即隐藏，用户明确揭示才展示
            const leaks = findHintLeaks(env.data.text, q);
            if (leaks.length) {
              leakPending = { level: step.level, text: env.data.text, reasons: leaks.map((l) => l.detail).join("、") };
              return;
            }
          }
          hintLevels.set(q.id, step.level);
          hintTexts.set(q.id, [...shownTexts, env.data.text]);
          explainText = hintTexts
            .get(q.id)!
            .map((s, i) => `${t("explain.hintLayer").replace("{n}", String(i + 1))}：${s}`)
            .join("\n");
          helpShown.set(q.id, "hint"); // 受助标记：本题后续作答（含本次提交）随 attempt 落 help
          void app.recordAiUsage(ch.id, env.tokens, 1).catch(() => undefined);
        } else {
          explainText = envStatusLine(env);
        }
      } catch (e) {
        explainText = String(e instanceof Error ? e.message : e);
      } finally { explainBusy = false; }
    }

    /** 泄露守卫：用户明确选择查看 → 记为受助-揭示（help=reveal），层级照常推进 */
    function viewLeakedHint() {
      const q = session?.current;
      if (!q || !leakPending) return;
      hintLevels.set(q.id, leakPending.level);
      hintTexts.set(q.id, [...(hintTexts.get(q.id) ?? []), leakPending.text]);
      explainText = hintTexts
        .get(q.id)!
        .map((s, i) => `${t("explain.hintLayer").replace("{n}", String(i + 1))}：${s}`)
        .join("\n");
      helpShown.set(q.id, "reveal");
      leakPending = null;
    }

    async function sendFollowUp() {
      const q = session?.current;
      if (q) addExposure(q.id, "followup");
      const history = explainHistory[q?.id ?? ""];
      if (!q || !history?.length || explainBusy || !explainFollowUp.trim()) return;
      explainSavedQid = ""; explainSaveError = ""; explainSaveErrorQid = "";
      explainBusy = true;
      // 追问沿用苏格拉底模板身份；揭示状态随当前题提交事实
      const reqCtx: import("@/ai/task").AiTaskContext = {
        templateId: "practice.socratic",
        templateVersion: 2, // 五八批模板修订（T06 单问题）
        qid: q.id,
        questionRevision: questionFingerprint(q),
        learnerAnswer: feedback?.myAnswer ?? null,
        submitted: !!feedback,
        mode: "practice",
        sessionId: session?.id ?? "",
      };
      try {
        const { SiyuanAiChannel, OpenAiChannel } = await import("@/ai/client");
        const { continueExplainMessages } = await import("@/ai/explain");
        const { AiTaskRunner } = await import("@/ai/task");
        const endpoint = String(plugin.settingUtils?.get?.("aiEndpoint") ?? "");
        const key = resolveAiKey(plugin);
        const model = String(plugin.settingUtils?.get?.("aiModel") ?? "gpt-4o-mini");
        const ch = endpoint && key
          ? new OpenAiChannel({ endpoint, apiKey: key, model }, (u, i) => fetch(u, i))
          : new SiyuanAiChannel(app.deps.client);
        const messages = continueExplainMessages(history, explainFollowUp.trim());
        const env = await new AiTaskRunner(ch).run(reqCtx, messages);
        void logAiTask({ templateId: env.templateId, qid: reqCtx.qid, status: env.status, tokens: env.tokens, messages });
        if (env.status === "ok" && env.data.text) {
          const reply = env.data.text;
          explainHistory[q.id] = [...messages, { role: "assistant", content: reply }];
          void persistExplainHistory().catch((e: unknown) => { explainSaveError = String(e instanceof Error ? e.message : e); });
          explainText = (explainText.endsWith(reply) ? explainText : explainText + "\n\n") + t("ai.followupTag") + explainFollowUp.trim() + "\n" + reply;
          explainFollowUp = "";
          void app.recordAiUsage(ch.id, env.tokens, 1).catch(() => undefined);
        } else {
          explainText = (explainText ? explainText + "\n\n" : "") + envStatusLine(env);
        }
      } catch (e) {
        explainText = String(e instanceof Error ? e.message : e);
      } finally { explainBusy = false; }
    }

    // ---------- 纯听题 lite（TTS + 遮罩） ----------
    let pureListen = $state(false);
    /** 背题模式（华图杀招，PRD §3）：开着时每题自动展示答案与解析，跳过提交判分，适合考前突击。localStorage 持久化 */
    let reciteToggle = $state(readLocal("lv-exam/reciteMode") === "1");
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
      if (!targetSession || view !== "session" || !reciteToggle || feedback || exitBusy) return;
      reciteSubmitTimer = setTimeout(() => {
        reciteSubmitTimer = null;
        if (view !== "session" || session !== targetSession || session?.current?.id !== targetQuestionId || session?.state?.cursor !== targetCursor || !reciteToggle || feedback || exitBusy) return;
        submitAnswer();
      }, 50);
    }
    $effect(() => {
      if (view !== "session") clearReciteSubmitTimer();
    });
    function toggleRecite() {
      reciteToggle = !reciteToggle;
      writeLocal("lv-exam/reciteMode", reciteToggle ? "1" : "0");
      if (reciteToggle && !feedback) scheduleReciteSubmit();
      else clearReciteSubmitTimer();
    }
    function togglePureListen() {
      const q = session?.current;
      if (!q) return;
      pureListen = !pureListen;
      void import("@/core/tts").then((m) => {
        if (pureListen) m.ttsSpeak([q.stem, ...q.options].join(" "));
        else m.ttsStop?.();
      });
    }
    /** 纯听题完整态：切题时自动朗读新题 */
    $effect(() => {
      const q = view === "session" ? session?.current : null;
      if (!q || !pureListen) return;
      void import("@/core/tts").then((m) => m.ttsSpeak([q.stem, ...q.options].join(" ")));
    });

    async function saveExplain() {
      const q = session?.current;
      const body = explainText;
      const qid = explainQid;
      if (!q || q.id !== qid || !body.trim() || explainSaveBusy || explainSavedQid === qid) return;
      explainSaveBusy = true;
      explainSaveError = ""; explainSaveErrorQid = qid;
      try {
        if (app) await app.appendQuestionNote(q.id, q.blockId, body, "ai-explain");
        explainSavedQid = qid;
        explainSaveErrorQid = "";
        showMessage(t("explain.saved"), 2400, "info");
      } catch (e) {
        explainSaveError = String(e instanceof Error ? e.message : e);
      } finally { explainSaveBusy = false; }
    }

    // ---------- 转卡 ----------
    let cardResult = $state("");
    async function toCard() {
      if (!session?.current) return;
      cardResult = "…";
      try {
        const n = await app.convertToCards(activeBankId, bankName, [session.current as Question & { blockId?: string }]);
        cardResult = n ? t("memory.toCardDone") : t("memory.toCardMissing");
      } catch (e) {
        cardResult = offline ? t("state.offlineHint") : String(e instanceof Error ? e.message : e);
      }
    }

    // ---------- 举一反三 ----------
    async function sameKpSession() {
      const wrongs = session?.answered?.filter((a) => a.grade.verdict === "wrong") ?? [];
      const all = await loadQuestions();
      const exclude = new Set<string>(session?.state?.qids ?? []);
      const seed = all.find((q) => q.id === wrongs[0]?.qid) ?? session?.current ?? all[0];
      const picked = app.sameKpDrill(all, seed, 10, exclude);
      if (!picked.length) { errorMsg = t("state.noSameKp"); return; }
      await safeStart(picked, "special", () => {
        feedback = null; selected = ""; confidenceSel = ""; sessionDone = null;
        view = "session";
      });
    }

    let resumeBusy = $state(false);
    async function resume() {
      if (resumeBusy) return;
      resumeBusy = true;
      resumeError = "";
      try {
        const s = await app.resumeSession(async (qids) => {
          const all = await loadQuestions();
          return qids.map((id) => all.find((q) => q.id === id)).filter(Boolean) as Question[];
        }, activeBankId);
        if (s) {
          // 37-05 恢复推进：跳过已答位置，防重复作答双计事件；全答完直接进结算
          s.advancePastAnswered();
          if (s.allAnswered()) sessionDone = s.finish();
          session = s; feedback = null; selected = ""; draftLive = ""; confidenceSel = ""; view = "session";
          sessionRev++;
          restoreQuestionControls();
          answerStart = Date.now(); // 首题计时基线（否则 qElapsedS 从 0 基线算出纪元秒）
          if (app.lastResumeMissing.length) showMessage(t("resume.missing").replace("{n}", String(app.lastResumeMissing.length)), 4200, "info");
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
    const CHECKIN_PENDING_KEY = "checkin/bridge/pending";
    function checkinCfg() {
      return {
        itemId: String(plugin.settingUtils?.get?.("checkinItemId") ?? "").trim(),
        threshold: Number(plugin.settingUtils?.get?.("checkinThreshold") ?? 0) || 0,
      };
    }
    async function runCheckinBridge() {
      const cfg = checkinCfg();
      const api = probeCheckinApi(window);
      const today = localDateKeyOf(Date.now());
      const attempts = app.attempts.all().filter(
        (e) => localDateKeyOf(e.ts) === today && e.verdict !== "not_attempted",
      ).length;
      const goal = Number(plugin.settingUtils?.get?.("dailyGoal") ?? 10) || 10;
      const st = await syncCheckin(api, cfg, attempts, Date.now(), goal);
      await app.saveAux(CHECKIN_PENDING_KEY, st.event ?? null);
      checkinStatus = st.status;
      if (st.status === "pending") checkinNote = String(st.event?.externalRef ?? "");
    }
    /** 重载补写：上次未写入的打卡事件以原 externalRef 重试（写入成功才清除） */
    async function retryCheckinPending() {
      const pending = await app.loadAux<import("@/core/checkinBridge").CheckinEventInput | null>(CHECKIN_PENDING_KEY);
      if (!pending) return;
      const api = probeCheckinApi(window);
      if (!api) return; // 打卡未装：保留待重试
      try {
        await api.whenReady?.();
        if (api.hasCapability && !api.hasCapability("events.record")) return;
        const result = api.recordEvent?.(pending);
        if (result !== undefined) await app.saveAux(CHECKIN_PENDING_KEY, null);
      } catch { /* 保留待重试；下次重载继续 */ }
    }
    /** 48-04 lite：打卡→考试只读投影——桥开启时读取连续天数（只读、失败安静、不自算 streak） */
    let checkinStreak = $state<number | null>(null);
    async function loadCheckinStreak() {
      const cfg = checkinCfg();
      if (!bridgeEnabled(cfg)) return;
      const s = await fetchStreak(probeCheckinApi(window), cfg.itemId);
      checkinStreak = s?.current ?? null;
    }

    /** 44-01：结算页错题回看展开态 */
    let reviewOpen = $state(false);
    /** 52-02 lite：先回忆模式（按题开关，切题重置）；recallDraft 与作答草稿分离、不入正式答案 */
    let hideOptions = $state(false);
    let recallDraft = $state("");
    /** 52-02 收口：先回忆使用集（qid → 揭示可追溯；随 attempt 落 recall 字段） */
    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- 函数内累加 Set（非组件遍历状态）
    const recallUsed = new Set<string>();
    /** 52-04 lite：自诊断复盘缓存（qid → {text, at}；结算页回看与编辑） */
    let reflections = $state<Record<string, { text: string; at: number }>>({});
    async function editReflection(qid: string) {
      const cur = await app.loadWrongReflection(qid);
      const { inputDialogSync } = await import("../../libs/dialog");
      const text = await inputDialogSync({
        title: t("reflection.title"),
        placeholder: t("reflection.placeholder"),
        defaultText: cur?.text ?? "",
      });
      if (text == null) return; // 取消不改现有复盘
      await app.saveWrongReflection(qid, text);
      if (text.trim()) reflections = { ...reflections, [qid]: { text: text.trim(), at: Date.now() } };
      else {
        const next = { ...reflections };
        delete next[qid];
        reflections = next;
      }
      showMessage(t("reflection.saved"), 2400, "info");
    }
    /** 打开回看时批量载入上次检查点（52-04：复习能回看） */
    async function loadReflections() {
      const next: Record<string, { text: string; at: number }> = {};
      for (const a of session?.answered ?? []) {
        // 114-05 lite：受助答对（讲解/提示后）也纳入回看——自我解释的载体与错题复盘同层
        if (a.grade.verdict === "correct" && !helpShown.get(a.qid)) continue;
        const r = await app.loadWrongReflection(a.qid);
        if (r) next[a.qid] = r;
      }
      reflections = next;
    }

    // ---------- AI 错因假设（116-01 T08：事实→假设→验证行动；假设与用户复盘独立，采纳由用户操作） ----------
    let misdiagnosisBusy = $state("");
    let misdiagnosisText = $state<Record<string, string>>({});

    /** 本次会话该题最近一次作答的 confidence/help（流水口径；无记录=缺证据，模板如实标注） */
    function attemptMeta(qid: string): { confidence?: "sure" | "fuzzy" | "guess"; helped?: boolean } {
      const events = app.attempts.all().filter((e) => e.qid === qid && e.sessionId === session?.id);
      const last = events[events.length - 1];
      return { confidence: last?.confidence, helped: !!last?.help };
    }

    async function runMisdiagnosis(a: { qid: string; grade: { myAnswer: string | null }; timeMs: number }) {
      const q = questionMap.get(a.qid);
      if (!q || misdiagnosisBusy || !session) return;
      if (!app.kernelOnline) { showMessage(t("state.offlineHint"), 2400, "info"); return; }
      misdiagnosisBusy = a.qid;
      try {
        const { SiyuanAiChannel, OpenAiChannel } = await import("@/ai/client");
        const { buildMisdiagnosisMessages } = await import("@/ai/misdiagnosis");
        const { AiTaskRunner, questionFingerprint } = await import("@/ai/task");
        const endpoint = String(plugin.settingUtils?.get?.("aiEndpoint") ?? "");
        const key = resolveAiKey(plugin);
        const model = String(plugin.settingUtils?.get?.("aiModel") ?? "gpt-4o-mini");
        const ch = endpoint && key
          ? new OpenAiChannel({ endpoint, apiKey: key, model }, (u, i) => fetch(u, i))
          : new SiyuanAiChannel(app.deps.client);
        const meta = attemptMeta(a.qid);
        const messages = buildMisdiagnosisMessages(q, {
          myAnswer: a.grade.myAnswer ?? null,
          confidence: meta.confidence,
          timeMs: a.timeMs,
          helped: meta.helped,
          userThought: reflections[a.qid]?.text,
        });
        const reqCtx: import("@/ai/task").AiTaskContext = {
          templateId: "practice.misdiagnosis",
          templateVersion: 1,
          qid: q.id,
          questionRevision: questionFingerprint(q),
          learnerAnswer: a.grade.myAnswer ?? null,
          submitted: true, // 结算回看=已提交（揭示闸门天然满足）
          mode: "practice",
          sessionId: session.id,
        };
        const env = await new AiTaskRunner(ch).run(reqCtx, messages);
        void logAiTask({ templateId: env.templateId, qid: reqCtx.qid, status: env.status, tokens: env.tokens, messages });
        if (env.status === "ok" && env.data.text) {
          misdiagnosisText = { ...misdiagnosisText, [a.qid]: env.data.text };
          void app.recordAiUsage(ch.id, env.tokens, 1).catch(() => undefined);
          // U14：假设独立持久化（与用户复盘分层；离线落内存态，重载后可回看）
          void app.saveMisdiagnosis({
            qid: a.qid,
            text: env.data.text,
            at: Date.now(),
            sessionId: session.id,
            templateVersion: 1,
            evidence: { myAnswer: a.grade.myAnswer ?? null, confidence: meta.confidence, timeMs: a.timeMs, helped: meta.helped },
          }).catch(() => { /* 持久化失败不阻断展示 */ });
        } else {
          showMessage(envStatusLine(env), 3600, "error");
        }
      } catch (e) {
        showMessage(String(e instanceof Error ? e.message : e), 3600, "error");
      } finally { misdiagnosisBusy = ""; }
    }

    /** 采纳：把假设并入用户复盘，显式标注「AI 参考（未确认）」——用户标签与 AI 假设独立 */
    async function adoptMisdiagnosis(qid: string) {
      const hypothesis = misdiagnosisText[qid];
      if (!hypothesis) return;
      const cur = await app.loadWrongReflection(qid);
      const merged = (cur?.text ? cur.text + "\n\n" : "") + t("ai.misdiagnosisTag") + "\n" + hypothesis;
      await app.saveWrongReflection(qid, merged);
      reflections = { ...reflections, [qid]: { text: merged, at: Date.now() } };
      void app.markMisdiagnosisAdopted(qid).catch(() => { /* 打点失败不影响并入 */ });
      showMessage(t("reflection.saved"), 2000, "info");
    }
    /** 114-01：本会话受助标记（qid → 讲解模式；reveal=查看被拦泄露提示）；同题再答时随 attempt 落 help 字段 */
    // 63-02：暴露集合（同题多暴露保全；help 字段由 helpFromExposure 派生，向后兼容）
    const exposures = new SvelteMap<string, SvelteSet<string>>();
    function addExposure(qid: string, node: string) {
      let set = exposures.get(qid);
      if (!set) { set = new SvelteSet(); exposures.set(qid, set); }
      set.add(node);
    }
    /** 114-01 兼容读法：本题是否有受助暴露（提示/讲解/揭示任一） */
    const helpShown = {
      set(qid: string, mode: "explain" | "hint" | "socratic" | "reveal") { addExposure(qid, mode); },
      get(qid: string) {
        const set = exposures.get(qid);
        return set && (set.has("explain") || set.has("socratic") || set.has("hint") || set.has("reveal")) ? (helpFromExposure(set) ?? "hint") : undefined;
      },
    }
    /** 114-01：一次一层提示——qid → 已展示层级（0=未申请）；已展示层文本供后续层去重 */
    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- 函数内累加 Map（非组件遍历状态）
    const hintLevels = new Map<string, 0 | 1 | 2 | 3>();
    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- 函数内累加 Map（非组件遍历状态）
    const hintTexts = new Map<string, string[]>();
    /** 114-01 泄露守卫拦截的待决提示（提交前）：用户明确揭示才展示（G6） */
    let leakPending = $state<{ level: 1 | 2 | 3; text: string; reasons: string } | null>(null);
    let speedTimer: ReturnType<typeof setTimeout> | null = null;
    function pickPracticeChoice(value: string) {
      const q = session?.current;
      if (!q || feedback) return;
      selected = toggleChoice(q.type, selected, value);
      session.setDraft(q.id, selected);
      trailInput(q.id, selected);

      // 极速刷题手感模式：单选或判断题即选即提交，答对顿歇 320ms 自动切题，答错暂停展示解析
      if (speedDrillEnabled && (q.type === "single" || q.type === "judge") && selected) {
        submitAnswer();
        if (feedback?.verdict === "correct") {
          if (speedTimer) clearTimeout(speedTimer);
          speedTimer = setTimeout(() => {
            speedTimer = null;
            nextQuestion();
          }, 320);
        }
      }
    }

    async function toggleUserTag(tag: string) {
      const q = session?.current;
      if (!q || !q.blockId) return;
      try {
        const updated = await app.tagQuestion(q as Question & { blockId: string }, tag);
        q.userTags = updated.userTags;
        sessionRev++;
      } catch (e) {
        showMessage(String(e instanceof Error ? e.message : e), 3000, "error");
      }
    }

    function restoreQuestionControls() {
      const q = session?.current;
      const saved = session?.state.answered?.find((a) => a.pos === session.state.cursor);
      feedback = saved ? { verdict: saved.verdict, myAnswer: saved.myAnswer } : null;
      selected = q && isChoiceQuestion(q) ? (saved?.myAnswer ?? session.getDraft(q.id)) : "";
      draftLive = q && !isChoiceQuestion(q) ? (saved?.myAnswer ?? session.getDraft(q.id)) : "";
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
    function submitAnswer() {
      clearReciteSubmitTimer();
      if (!session || feedback) return;
      const q = session.current;
      if (!q) return;
      const timeMs = Date.now() - answerStart;
      // 选择题/判断用 selected；填空/简答用 draft
      const ans = isChoiceQuestion(q) ? selected : session.getDraft(q.id);
      if (hideOptions) recallUsed.add(q.id); // 未揭示就提交也算先回忆作答（52-02 可追溯）
      const r = session.submit(ans || null, timeMs);
      if (!r) {
        // 已答位置守卫（session.submit 拒绝重计）：K 回退误入已答位 → 静默前进，不重复写流水
        nextQuestion();
        return;
      }
      const g = r.grade;
      if (q.analysis) addExposure(q.id, "analysis"); // 63-02：反馈态必然展示解析（布尔事实）
      app.recordAttempt({
        qid: q.id, kind: "practice", mode: session.state.mode,
        verdict: g.verdict, myAnswer: g.myAnswer, sessionId: session.id,
        queue: queueKindOf(session.state.mode), // 39-02：cram/wrong 不再被误记为 normal
        timeMs,
        qVersion: createQuestionVersionSnapshot(q),
        delayedReview: r.isDelayedReview || undefined,
        confidence: confidenceSel || undefined,   // U12：答前快照随 attempt；未选=如实缺省
        help: helpShown.get(q.id),               // 114-01：本题曾被讲解/提示 → 受助作答如实标记
        recall: recallUsed.has(q.id) || undefined, // 52-02：先回忆模式揭示可追溯
        exposure: (() => { const set = exposures.get(q.id); return set && set.size ? [...set] : undefined; })(), // 63-02：布尔事实
        ...((): Pick<import("../../core/types").AttemptEvent, "firstAnswer" | "edits"> => {
          const t = trails.get(q.id);
          if (!t || !trailChanged(t)) return {}; // 63-03：终答==首答（含取消回退）→ 不带轨迹，报告口径「未改答」
          return { firstAnswer: t.first, edits: t.edits };
        })(),
      });
      void app.saveSession().catch(() => undefined);   // 37-05 checkpoint：作答即存（SaveGate 同键合并，重载不重复作答）
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
      if (g.verdict === "correct" && soundEnabled) playSuccessChime();
      sessionRev++; // 类实例非响应式：提交后推进读数
    }

    function nextQuestion() {
      clearReciteSubmitTimer();
      feedback = null; selected = ""; draftLive = ""; confidenceSel = ""; materialExpanded = false; answerStart = Date.now();
      hideOptions = false; recallDraft = ""; leakPending = null; // 52-02：切题重置先回忆态（揭示/草稿不沿用上一题，U02 口径）；114-01 泄露待决随之作废
      if (!session.next()) { void finishSession(); return; }
      restoreQuestionControls();
      sessionRev++; // 类实例非响应式：切题后刷新题面
      void app.saveSession().catch(() => undefined);   // 游标推进随答随存
      if (reciteToggle) scheduleReciteSubmit(); // 背题模式：切题后自动揭示答案
    }

    /** 键盘 K 回到上一题：PracticeSession 是类实例，游标变化后必须推进响应式镜像。 */
    function previousQuestion() {
      clearReciteSubmitTimer();
      if (!session?.prev()) return;
      restoreQuestionControls();
      sessionRev++;
      if (reciteToggle && !feedback) scheduleReciteSubmit(); // 背题模式：切题后自动揭示答案
    }

    async function finishSession() {
      clearReciteSubmitTimer();
      sessionDone = { ...session.finish(), ...session.breakdown() };
      settleMode = session.state.mode; // 39-02：冻结本次队列身份，供结算回执如实标注
      // 用时统计（考试 prep 时间管理关键指标）
      const times = session.answered.map((a) => a.timeMs).filter((t) => t > 0);
      sessionDone.totalTimeS = Math.round(times.reduce((s, t) => s + t, 0) / 1000);
      sessionDone.avgTimeS = times.length ? Math.round(times.reduce((s, t) => s + t, 0) / 1000 / times.length) : 0;
      // 48-02 lite：会话结束事件（仅计数，无题干；生态消费者按需重读明细）
      const answeredKps = session.answered.map((a) => {
        const targetQ = questions.find((q) => q.id === a.qid);
        return { kp: targetQ?.kp, verdict: a.grade.verdict };
      });
      const weakKps = computeWeakKnowledgePoints(answeredKps);

      emitExamEvent("session-ended", {
        sessionId: session.id,
        mode: session.state.mode,
        total: sessionDone.total,
        correct: sessionDone.correct,
        wrong: sessionDone.wrong,
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
              idempotencyKey: `exam-session:${session.id}`,
              payload: {
                sessionId: session.id,
                mode: session.state.mode,
                total: sessionDone.total,
                correct: sessionDone.correct,
                wrong: sessionDone.wrong,
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
                  sessionId: session.id,
                  mode: session.state.mode,
                  weakKnowledgePoints: weakKps,
                },
              },
            }),
          );
        }
      }

      await app.saveSession();
      await app.flush();
      rebuildPlan();

      // 小驴打卡联动（安全调用，未配置或未安装时优雅跳过）
      const checkinItemId = String(plugin.settingUtils?.get?.("checkinItemId") ?? "").trim();
      const completedQuestions = sessionDone.total;
      const accuracy = sessionDone.total > 0 ? Math.round((sessionDone.correct / sessionDone.total) * 100) : 0;
      const today = new Date().toISOString().slice(0, 10);
      if (checkinItemId && completedQuestions > 0) {
        void logCheckinEventSafely({
          itemId: checkinItemId,
          value: completedQuestions,
          unit: "题",
          externalRef: `exam:${checkinItemId}:${today}`,
          note: `完成备考刷题 ${completedQuestions} 题（正确率 ${accuracy}%）`,
        }).catch(() => undefined);
      }

      void runCheckinBridge().catch((e: unknown) => showMessage(String(e instanceof Error ? e.message : e), 4200, "error")); // 48-03 lite：结算自动同步打卡（幂等 externalRef，失败进待重试）
    }

    async function syncWrongbookToCards() {
      if (!hasCardsPlugin) {
        showMessage("[小驴学习] 未检测到小驴闪卡插件（siyuan-lv-cards），可前往思源集市安装以开启卡包同步；当前内置错题重练已就绪！", 3500, "info");
        return;
      }
      const wrongQs = questions.filter((q) => filteredWrongQueue.some((w) => w.qid === q.id));
      if (!wrongQs.length) {
        showMessage("[小驴学习] 当前筛选下没有可推送到闪卡的错题", 2500, "info");
        return;
      }
      try {
        const n = await app.convertToCards(activeBankId, bankName, wrongQs);
        showMessage(`[小驴学习] 已将 ${n} 道错题同步推送到小驴闪卡卡包 ✓`, 3500, "info");
      } catch (e) {
        showMessage(`[小驴学习] 推送闪卡失败：${String(e instanceof Error ? e.message : e)}`, 4000, "error");
      }
    }

    async function syncSingleWrongToCard(qid: string) {
      if (!hasCardsPlugin) {
        showMessage("[小驴学习] 未检测到小驴闪卡插件（siyuan-lv-cards），可前往思源集市安装以开启卡包同步；当前内置错题重练已就绪！", 3500, "info");
        return;
      }
      const targetQ = questions.find((q) => q.id === qid);
      if (!targetQ) {
        showMessage("[小驴学习] 未找到该题目对象", 2500, "info");
        return;
      }
      try {
        const n = await app.convertToCards(activeBankId, bankName, [targetQ]);
        showMessage(`[小驴学习] 已将 ${n} 道顽疾错题同步推送到小驴闪卡卡包 ✓`, 3500, "info");
      } catch (e) {
        showMessage(`[小驴学习] 推送闪卡失败：${String(e instanceof Error ? e.message : e)}`, 4000, "error");
      }
    }

    /** 44-09 撤销作答：在反馈态下撤回刚才误触的提交，恢复原草稿并安全回滚作答流水 */
    async function undoRecentSubmit() {
      if (!session || !app) return;
      const undone = session.undoLastSubmit();
      if (!undone) return;
      app.undoLastAttempt(session.id, undone.qid);
      clearReciteSubmitTimer();
      feedback = null;
      const q = session.current;
      if (q) {
        if (isChoiceQuestion(q)) {
          selected = undone.restoredAnswer ?? "";
        } else {
          draftLive = undone.restoredAnswer ?? "";
        }
        restoreQuestionControls();
      }
      sessionRev++;
      await app.saveSession().catch(() => undefined);
      showMessage(t("session.undoDone"), 2400, "info");
    }

    /** 结算页错题批量转卡（LeetFlash 零成本化）：一次点击入 FSRS 队列（按块幂等，重复转卡自动跳过） */
    async function wrongsToCard() {
      if (!session || !activeBankId) return;
      const wrongQs = session.answered
        .filter((a) => a.grade.verdict === "wrong")
        .map((a) => questionMap.get(a.qid))
        .filter((q): q is Question & { blockId: string; rootId: string } => !!q);
      if (!wrongQs.length) { showMessage(t("session.noCardable"), 2800, "info"); return; }
      try {
        const n = await app.convertToCards(activeBankId, bankName, wrongQs);
        showMessage(n ? `${t("memory.toCardDone")} (${n})` : t("memory.toCardMissing"), 3200, n ? "info" : "error");
      } catch (e) {
        showMessage(String(e instanceof Error ? e.message : e), 4200, "error");
      }
    }

    // ---------- 下一行动（U15 lite）：结算页错题加入持久化行动（去重） ----------
    let actionBusy = $state(false);
    let actionNote = $state("");

    async function wrongsToActions() {
      if (!session || actionBusy) return;
      actionBusy = true; actionNote = "";
      try {
        const wrongQs = session.answered.filter((a) => a.grade.verdict === "wrong");
        const r = await app.addActions(wrongQs.map((a) => {
          const q = questionMap.get(a.qid);
          return {
            kind: "redo" as const,
            qid: a.qid,
            sessionId: session.id,
            detail: `${t("action.kind.redo")}：${(q?.kp ?? q?.stem ?? a.qid).slice(0, 40)}`,
          };
        }));
        actionNote = t("action.added").replace("{n}", String(r.added)).replace("{d}", String(r.skipped));
      } catch (e) {
        actionNote = String(e instanceof Error ? e.message : e);
      } finally { actionBusy = false; }
    }

    async function exitSession() {
      clearReciteSubmitTimer();
      if (exitBusy) return;
      if (!session) { view = "entry"; return; }
      if (!sessionDone && session.answered.length) {
        const { confirmDialogSync } = await import("../../libs/dialog");
        if (!(await confirmDialogSync({ title: t("session.exit"), content: t("session.exitConfirm") }))) return;
      }
      exitBusy = true;
      try {
        // 63-02 边界前推：看过提示/材料但未提交就退出——曝光是真实事实，落 exposure-only 事件
        //（verdict=not_attempted 与跳过同形；不伪造已完成作答；已提交的题不重复）
        for (const input of abandonedExposureInputs(
          session.answered.map((a) => a.qid), exposures,
          { kind: "practice", mode: session.state.mode, sessionId: session.id },
        )) {
          try { app.recordAttempt(input); } catch { /* 尽力而为：放弃会话不因曝光落库失败而中断 */ }
        }
        await app.saveSession();
        await app.flush();
        session = null; feedback = null; selected = ""; draftLive = ""; confidenceSel = ""; sessionDone = null;
        groupBatchModal = null; groupBatchStart = 1;
        scratchpadOpen = false; scratchpadStore = {}; scratchpadShared = "";
        view = "entry";
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
    let mKp = $state("");
    let mSource = $state("");
    let mGroup = $state("");
    /** 54-02 作者设置：数值判分规格（填空题型显示；留空=自动识别/exact 口径） */
    let mSpecOpen = $state(false);
    let mSpecUnit = $state("");
    let mSpecAbsTol = $state("");
    let mSpecRelPct = $state("");
    let mSpecAltUnits = $state("");
    /** 55-05 作者设置：主观采分点（简答题显示；每行 `描述 | 权重 | 参考要点`） */
    let mRubricOpen = $state(false);
    let mRubricText = $state("");
    let mRubricRevision = $state(1);
    /** 43-01 题目作者生命周期状态 (draft/review/published) */
    let mStatus = $state<QuestionLifecycleStatus>("published");
    let mStudyLang = $state<string>("zh-CN");
    let mStudyPhonetic = $state("");
    let mSaving = $state(false);
    let mSaved = $state("");
    let manualErrorMsg = $state("");
    let manualErrorField = $state("");

    function clearManualValidation() {
      manualErrorMsg = "";
      manualErrorField = "";
    }

    function manualFieldForError(q: Question, message: string): string {
      if (message.includes("题干")) return "stem";
      if (message.includes("空选项")) return `option-${mOptions.findIndex((option) => !option.trim())}`;
      if (message.includes("选项内容重复")) {
        const duplicateIndex = mOptions.findIndex((option, index) => mOptions.findIndex((other) => other.trim() === option.trim()) !== index);
        return `option-${Math.max(0, duplicateIndex)}`;
      }
      if (message.includes("答案") || message.includes("越界")) return "answer";
      if (message.includes("选项")) return "option-0";
      if (q.type === "single" || q.type === "multiple") return "answer";
      return "stem";
    }

    function setCorrectOption(i: number) {
      const L = String.fromCharCode(65 + i);
      mAnswer = mType === "multiple"
        ? (mAnswer.includes(L) ? mAnswer.replace(L, "") : (mAnswer + L).split("").sort().join(""))
        : L;
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

    async function applyOcrFill() {
      if (!ocrInputText.trim()) return;
      const { parseOcrQuestionText } = await import("../../core/ocr");
      const parsed = parseOcrQuestionText(ocrInputText);
      mType = parsed.type === "material" ? "single" : parsed.type;
      mStem = parsed.stem;
      mOptions = parsed.options.length >= 2 ? parsed.options : ["", ""];
      mAnswer = parsed.answer;
      if (parsed.analysis) mAnalysis = parsed.analysis;
      if (parsed.kp) mKp = parsed.kp;
      ocrModalOpen = false;
      clearManualValidation();
      showMessage(t("manual.ocrDone"), 3000, "info");
    }

    let ocrUploadBusy = $state(false);

    async function handleOcrImageFile(file: File | Blob) {
      if (ocrUploadBusy || !app) return;
      ocrUploadBusy = true;
      try {
        showMessage(t("manual.ocrUploading"), 3500, "info");
        const q = await app.uploadAndOcrQuestion(file, (file as File).name || "pasted-question.png");
        mType = q.type === "material" ? "single" : q.type;
        mStem = q.stem;
        mOptions = q.options.length >= 2 ? q.options : ["", ""];
        mAnswer = q.answer;
        if (q.analysis) mAnalysis = q.analysis;
        if (q.kp) mKp = q.kp;
        ocrModalOpen = false;
        clearManualValidation();
        showMessage(t("manual.ocrDone"), 3000, "info");
      } catch (e) {
        showMessage(`图片 OCR 识别失败：${String(e instanceof Error ? e.message : e)}`, 4000, "error");
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
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) {
            e.preventDefault();
            void handleOcrImageFile(file);
            break;
          }
        }
      }
    }

    let printWrongBusy = $state(false);

    async function printTeacherLectureSheet() {
      if (!activeBankId || !questions.length) return;
      try {
        const html = await app.buildTeacherLectureSheet(bankName || "题库试卷", activeBankId);
        const win = window.open("", "_blank");
        if (win) {
          win.document.write(html);
          win.document.close();
          win.focus();
        } else {
          const blob = new Blob([html], { type: "text/html;charset=utf-8" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `${bankName || "题库"}-教师讲义教案卷.html`;
          a.click();
          URL.revokeObjectURL(url);
          showMessage("已生成教师讲义教案卷文件", 3000, "info");
        }
      } catch (e) {
        showMessage(`教师讲义生成失败：${String(e instanceof Error ? e.message : e)}`, 4000, "error");
      }
    }

    let cheatSheetBusy = $state(false);

    async function launchWrongbookMockExam() {
      if (!filteredWrongQueue.length || !app) return;
      try {
        const result = await app.assembleWrongbookExam(activeBankId);
        if (!result.totalCount) {
          showMessage(t("wrongbook.noFiltered"), 2500, "info");
          return;
        }
        plugin.openMock?.();
        showMessage(`已为 ${result.totalCount} 道错题生成专属限时特训卷！正在进入模考考场…`, 3500, "info");
      } catch (e) {
        showMessage(String(e instanceof Error ? e.message : e), 3500, "error");
      }
    }

    async function exportCheatSheet() {
      if (cheatSheetBusy || !app) return;
      cheatSheetBusy = true;
      try {
        const md = await app.exportCramCheatSheetMarkdown(activeBankId);
        const blob = new Blob([md], { type: "text/markdown;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `考前核心高频错题急救小抄-${new Date().toISOString().slice(0, 10)}.md`;
        a.click();
        URL.revokeObjectURL(url);
        showMessage("考前急救小抄已导出 ✓", 3000, "info");
      } catch (e) {
        showMessage(String(e instanceof Error ? e.message : e), 4000, "error");
      } finally {
        cheatSheetBusy = false;
      }
    }

    async function exportItemQualityReport() {
      if (!activeBankId || !app) return;
      try {
        const md = await app.exportItemQualityAuditMarkdown(activeBankId);
        const blob = new Blob([md], { type: "text/markdown;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `题库试题质量CTT与干扰项诊断报告-${new Date().toISOString().slice(0, 10)}.md`;
        a.click();
        URL.revokeObjectURL(url);
        showMessage("试题质量 CTT 诊断报告已导出 ✓", 3000, "info");
      } catch (e) {
        showMessage(String(e instanceof Error ? e.message : e), 4000, "error");
      }
    }

    async function exportGiftFormat() {
      if (!activeBankId || !app) return;
      try {
        const text = await app.exportQuestionsToGift(activeBankId);
        const blob = new Blob([text], { type: "text/plain;charset=utf-8;" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `${bankName || "题库"}.gift.txt`;
        a.click();
        URL.revokeObjectURL(a.href);
        showMessage("已导出为 GIFT 格式 ✓", 3000, "info");
      } catch (e) {
        showMessage(String(e instanceof Error ? e.message : e), 4000, "error");
      }
    }

    async function exportAnkiFormat() {
      if (!activeBankId || !app) return;
      try {
        const text = await app.exportQuestionsToAnkiTsv(activeBankId);
        const blob = new Blob([text], { type: "text/tab-separated-values;charset=utf-8;" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `${bankName || "题库"}.anki.tsv`;
        a.click();
        URL.revokeObjectURL(a.href);
        showMessage("已导出为 Anki 卡包 TSV ✓", 3000, "info");
      } catch (e) {
        showMessage(String(e instanceof Error ? e.message : e), 4000, "error");
      }
    }

    async function exportMdDocFormat() {
      if (!activeBankId || !app) return;
      try {
        const text = await app.exportQuestionsToExamDocMarkdown(activeBankId);
        const blob = new Blob([text], { type: "text/markdown;charset=utf-8;" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `${bankName || "题库"}-试题精选手册.md`;
        a.click();
        URL.revokeObjectURL(a.href);
        showMessage("已导出为 Markdown 题册 ✓", 3000, "info");
      } catch (e) {
        showMessage(String(e instanceof Error ? e.message : e), 4000, "error");
      }
    }

    async function exportSyllabusAudit() {
      if (!activeBankId || !app) return;
      try {
        const md = await app.exportSyllabusAuditMarkdown(activeBankId);
        const blob = new Blob([md], { type: "text/markdown;charset=utf-8;" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `考纲知识点出题缺口体检报告-${new Date().toISOString().slice(0, 10)}.md`;
        a.click();
        URL.revokeObjectURL(a.href);
        showMessage("考纲出题缺口报告已导出 ✓", 3000, "info");
      } catch (e) {
        showMessage(String(e instanceof Error ? e.message : e), 4000, "error");
      }
    }

    async function drillVariantFor(q: Question) {
      if (!q) return;
      try {
        const res = await app.pickVariantQuestions(q, 5);
        if (!res.questions.length) {
          showMessage("未检索到相关考点或同族的变式题", 2500, "info");
          return;
        }
        await safeStart(res.questions, "quick", () => {
          feedback = null; selected = ""; confidenceSel = ""; sessionDone = null;
          view = "session";
          restoreQuestionControls();
          showMessage(`⚡ ${res.reason}`, 3000, "info");
        });
      } catch (e) {
        showMessage(String(e instanceof Error ? e.message : e), 3000, "error");
      }
    }

    async function traceMotherQuestion(target: Question) {
      if (!target || !app) return;
      try {
        const res = await app.findFoundationMotherQuestion(target);
        if (!res.motherQuestion) {
          showMessage(res.reason, 3000, "info");
          return;
        }
        const mq = res.motherQuestion;
        showMessage(`🌱 ${res.reason}`, 4000, "info");
        await safeStart([mq], "quick", () => {
          feedback = null; selected = ""; confidenceSel = ""; sessionDone = null;
          view = "session";
          restoreQuestionControls();
        });
      } catch (e) {
        showMessage(String(e instanceof Error ? e.message : e), 3500, "error");
      }
    }

    async function printWrongSheet(type: "question" | "answer" | "retest") {
      if (printWrongBusy || !activeBankId || !filteredWrongQueue.length) return;
      printWrongBusy = true;
      try {
        const qids = filteredWrongQueue.map((w) => w.qid);
        const qs = questions.filter((q) => qids.includes(q.id));
        if (!qs.length) {
          showMessage("当前筛选条件下无可用题目", 3000, "info");
          return;
        }
        const title = `${bankName || "小驴学习"} · 错题攻坚特训卷（共${qs.length}题）`;
        const { buildCompactQuestionSheetPro, buildCompactAnswerSheetPro, buildWrongbookRetestSheetPro } = await import("../../core/printPro");
        const html = type === "retest"
          ? buildWrongbookRetestSheetPro(title, qs, { headerTitle: "错题清零纯净重测卷 · A4双栏", columns: "double" })
          : type === "question"
          ? buildCompactQuestionSheetPro(title, qs, { headerTitle: "错题攻坚特训卷 · A4双栏", columns: "double" })
          : buildCompactAnswerSheetPro(title, qs, { headerTitle: "错题攻坚详解答案册", columns: "double" });
        const win = window.open("", "_blank");
        if (win) {
          win.document.write(html);
          win.document.close();
          win.focus();
        } else {
          const blob = new Blob([html], { type: "text/html;charset=utf-8" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `${title}-${type === "retest" ? "错题重测卷" : type === "question" ? "试卷" : "答案册"}.html`;
          a.click();
          URL.revokeObjectURL(url);
          showMessage("已生成双栏排版文件", 3000, "info");
        }
      } catch (e) {
        showMessage(`打印生成失败：${String(e instanceof Error ? e.message : e)}`, 4000, "error");
      } finally {
        printWrongBusy = false;
      }
    }

    async function normalizeManualFormulas() {
      const { normalizeLatexFormula } = await import("../../core/math");
      if (mStem) mStem = normalizeLatexFormula(mStem);
      if (mOptions.length) mOptions = mOptions.map((o) => normalizeLatexFormula(o));
      if (mAnalysis) mAnalysis = normalizeLatexFormula(mAnalysis);
      showMessage(t("manual.formulaDone"), 2500, "info");
    }

    async function switchManualType(nextType: typeof mType) {
      if (nextType === mType) return;
      if (mStem.trim() || mAnswer.trim() || mAnalysis.trim() || mOptions.some((option) => option.trim())) {
        const { confirmDialogSync } = await import("../../libs/dialog");
        if (!(await confirmDialogSync({ title: t("manual.switchTypeTitle"), content: t("manual.switchTypeConfirm") }))) return;
      }
      mType = nextType;
      mAnswer = "";
      if (nextType === "single" || nextType === "multiple") mOptions = ["", ""];
      if (nextType !== "fill") {
        mSpecOpen = false;
        mSpecUnit = "";
        mSpecAbsTol = "";
        mSpecRelPct = "";
        mSpecAltUnits = "";
      }
      clearManualValidation();
    }

    // ---------- 录题草稿保护（45-06 lite）：输入防抖自动保存 → 重载/切视图恢复 → 提交成功清理 ----------
    const MANUAL_DRAFT_KEY = "draft/manual";
    let draftRestored = $state(false);
    let draftTimer: ReturnType<typeof setTimeout> | null = null;
    $effect(() => {
      // 读取全部草稿字段建立依赖；防抖 800ms 落盘（切视图/崩溃后可恢复）
      const snap = {
        type: mType, stem: mStem, options: [...mOptions], answer: mAnswer,
        analysis: mAnalysis, kp: mKp, source: mSource, group: mGroup, savedAt: Date.now(),
        specOpen: mSpecOpen, specUnit: mSpecUnit, specAbsTol: mSpecAbsTol, specRelPct: mSpecRelPct, specAltUnits: mSpecAltUnits,
        rubricOpen: mRubricOpen, rubricText: mRubricText,
      };
      if (draftTimer) clearTimeout(draftTimer);
      if (!snap.stem.trim() && !snap.answer.trim() && !snap.analysis.trim()) return; // 空草稿不写
      draftTimer = setTimeout(() => {
        void app.saveAux(MANUAL_DRAFT_KEY, snap).catch(() => undefined);
      }, 800);
      return () => { if (draftTimer) clearTimeout(draftTimer); };
    });

    /** 54-02 作者设置：表单字段 → 判分规格（abs 与 rel 可并用取更宽；无任何容差=exact 口径） */
    function buildAuthorSpec(): import("../../core/structuredAnswer").NumericAnswerSpec | undefined {
      const abs = parseFloat(mSpecAbsTol);
      const rel = parseFloat(mSpecRelPct) / 100;
      const unit = mSpecUnit.trim();
      const alts = mSpecAltUnits.split(/[，,;；]/).map((x) => x.trim()).filter(Boolean);
      if (!Number.isFinite(abs) && !Number.isFinite(rel) && !unit && !alts.length) return undefined; // 全空=自动识别
      const spec: import("../../core/structuredAnswer").NumericAnswerSpec = { v: 1, kind: "numeric" };
      if (Number.isFinite(abs) && abs > 0) spec.absTol = abs;
      if (Number.isFinite(rel) && rel > 0) spec.relTolerance = rel;
      if (unit) spec.unit = unit;
      if (alts.length) {
        const factor = 1; // 作者换算表 lite：等价单位同值换算（倍率编辑待完整面），按同值处理
        spec.altUnits = alts.map((u) => ({ unit: u, factor }));
      }
      return spec;
    }

    /** 55-05 作者设置：表单文本 → rubric 规格（每行一个采分点）。
     *  文本非空但解析失败 → null，由调用方如实报错而非静默丢弃作者输入。 */
    function buildAuthorRubric(): RubricSpec | null | undefined {
      if (!mRubricOpen) return undefined;
      if (!mRubricText.trim()) return undefined; // 未填写 = 无 rubric（纯展示题）
      return parseRubricFromText(mRubricText, 0, mRubricRevision);
    }
    /** 55-05：录题时的采分点预览（解析失败为 null，界面如实提示而非假装成功） */
    const authorRubricPreview = $derived(
      mType === "short" && mRubricOpen && mRubricText.trim() ? parseRubricFromText(mRubricText, 0, mRubricRevision) : null,
    );

    async function saveManual(targetStatus?: QuestionLifecycleStatus) {
      const statusToSave = targetStatus ?? mStatus;
      if (mSaving || !mStem.trim()) return;
      if (statusToSave === "published" && !mAnswer.trim() && mType !== "short") return;
      const targetBankId = activeBankId;
      const draftSignature = () => JSON.stringify([mType, mStem, mOptions, mAnswer, mAnalysis, mKp, mSource, mGroup, mStatus, mSpecOpen, mSpecUnit, mSpecAbsTol, mSpecRelPct, mSpecAltUnits, mRubricOpen, mRubricText]);
      const signature = draftSignature();
      mSaving = true; mSaved = ""; errorMsg = ""; clearManualValidation();
      try {
        // 55-05：rubric 仅在简答题开放；文本非空但解析失败 → 如实报错，不静默丢弃作者输入
        const authorRubric = mType === "short" ? buildAuthorRubric() : undefined;
        if (authorRubric === null) {
          manualErrorMsg = t("manual.rubricParseFailed");
          manualErrorField = "rubric";
          await tick();
          document.querySelector<HTMLElement>(`[data-manual-field="rubric"]`)?.focus();
          return;
        }
        if (authorRubric) {
          const issues = validateRubric(authorRubric);
          const blocking = issues.filter((x) => !x.includes("满分必须为正数")); // fullScore=0 由 q.score 兜底
          if (blocking.length) {
            manualErrorMsg = blocking.join("；");
            manualErrorField = "rubric";
            await tick();
            document.querySelector<HTMLElement>(`[data-manual-field="rubric"]`)?.focus();
            return;
          }
        }
        const q = makeQuestion({
          type: mType, stem: mStem,
          options: mType === "single" || mType === "multiple" ? mOptions.map((o) => o.trim()) : [],
          answer: mAnswer, analysis: mAnalysis, kp: mKp, source: mSource,
          group: mGroup.trim() || undefined,
          status: statusToSave,
          ...(mType === "fill" && mSpecOpen ? { answerSpec: buildAuthorSpec() } : {}),
          ...(authorRubric ? { rubric: authorRubric } : {}),
          ...(mStudyPhonetic.trim() || mStudyLang !== "zh-CN"
            ? { studyMeta: { lang: mStudyLang || "zh-CN", phonetic: mStudyPhonetic.trim() || undefined } }
            : {}),
        });
        if (statusToSave === "published") {
          const guard = checkPublishGuard(q);
          if (!guard.valid) {
            manualErrorMsg = guard.errors.join("；");
            manualErrorField = manualFieldForError(q, guard.errors[0]);
            await tick();
            document.querySelector<HTMLElement>(`[data-manual-field="${manualErrorField}"]`)?.focus();
            return;
          }
        }
        await app.writeManualQuestion(targetBankId, q);
        mSaved = q.id;
        if (signature === draftSignature()) {
          mStem = ""; mOptions = ["", ""]; mAnswer = ""; mAnalysis = "";
          mSpecOpen = false; mSpecUnit = ""; mSpecAbsTol = ""; mSpecRelPct = ""; mSpecAltUnits = "";
          mRubricOpen = false; mRubricText = ""; mRubricRevision = 1;
          mStudyLang = "zh-CN"; mStudyPhonetic = "";
          mStatus = "published";
          draftRestored = false;
          void app.saveAux(MANUAL_DRAFT_KEY, null).catch(() => undefined); // 45-06：提交成功清理草稿
        }
        await refreshQuestionsAfterWrite(questions.length + 1);
      } catch (e) {
        errorMsg = offline ? t("state.offlineHint") : String(e instanceof Error ? e.message : e);
      } finally { mSaving = false; }
    }

    function blankManualDraft() {
      mStem = ""; mOptions = ["", ""]; mAnswer = ""; mAnalysis = "";
      mSpecOpen = false; mSpecUnit = ""; mSpecAbsTol = ""; mSpecRelPct = ""; mSpecAltUnits = "";
      mStudyLang = "zh-CN"; mStudyPhonetic = "";
      mStatus = "published";
      draftRestored = false;
      clearManualValidation();
      void app.saveAux(MANUAL_DRAFT_KEY, null).catch(() => undefined);
    }

    // ---------- AI 出题（v0.4：双通道 + 待审核队列，Inbox 式永不直接入库） ----------
    let aiSource = $state("");
    let aiSourceOrigin = $state("");
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
        const g = probeGlean(window);
        if (!g) { gleanError = t("ai.gleanUnavailable"); return; }
        const clips = await listLaterClips(g, 10);
        if (!clips.length) { showMessage(t("ai.gleanEmpty"), 3200, "info"); return; }
        const block = formatClipsForSource(clips);
        aiSource = aiSource.trim() ? `${aiSource.trim()}\n\n${block}` : block;
        aiSourceOrigin = "";
        gleanPendingDone = clips; // 记录本次所用素材（生成成功后可标记已读）
        showMessage(t("ai.gleanImported").replace("{n}", String(clips.length)), 3200, "info");
      } catch (e) {
        gleanErrorAction = "load";
        gleanError = t("ai.gleanLoadFailed").replace("{message}", String(e instanceof Error ? e.message : e));
      } finally { gleanBusy = false; }
    }
    /** 60-01 写方向：逐篇 setClipStatus(done)；拾遗侧写开关未开/失败如实计数，不伪造成功 */
    async function markGleanDone() {
      if (gleanDoneBusy || !gleanPendingDone.length) return;
      const g = probeGlean(window);
      if (!g) {
        gleanErrorAction = "mark";
        gleanError = t("ai.gleanUnavailable");
        return;
      }
      gleanDoneBusy = true;
      gleanError = "";
      try {
        let ok = 0;
        for (const c of gleanPendingDone) {
          if (await markClipDone(g, c.id)) ok++;
        }
        gleanDoneNote = ok === gleanPendingDone.length
          ? t("ai.gleanDoneAll").replace("{n}", String(ok))
          : t("ai.gleanDonePartial").replace("{ok}", String(ok)).replace("{n}", String(gleanPendingDone.length));
        showMessage(gleanDoneNote, 4600, ok ? "info" : "error");
        if (ok === gleanPendingDone.length) gleanPendingDone = [];
      } catch (e) {
        gleanErrorAction = "mark";
        gleanError = t("ai.gleanMarkFailed").replace("{message}", String(e instanceof Error ? e.message : e));
      } finally { gleanDoneBusy = false; }
    }
    let aiCount = $state(5);
    let aiDifficulty = $state<"easy" | "medium" | "hard" | "mixed">("mixed");
    let aiKp = $state("");
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
      const customHint = [String(plugin.settingUtils?.get?.("aiCustomHint") ?? "").trim(), aiCustomHint.trim()].filter(Boolean).join("\n");
      return { types: ["single", "multiple", "judge"], count: aiCount, difficulty: aiDifficulty,
        kp: aiKp, sourceTitle: t("ai.pastedMaterial"), preset: aiPreset, quality: aiQuality,
        customHint: customHint || undefined };
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
      try { await app.saveAux("ai/review-queue", { queue: aiQueue, rejected: aiRejected, duplicates: aiDuplicates, bankId: aiQueueBankId, material: aiQueueMaterial, options: aiQueueOptions }); }
      catch { aiError = t("ai.queueSaveFailed"); }
    }
    async function saveGenerationUsage(counting: { id: string; approxTokens: number; calls: number }) {
      try {
        await app.recordAiUsage(counting.id, counting.approxTokens, counting.calls);
        aiUsageTotal = await app.aiUsage();
      } catch { showMessage(t("ai.usageSaveFailed"), 4600, "error"); }
    }
    async function restoreAiQueue() {
      try {
        const v = await app.loadAux<{ queue: Question[]; rejected: typeof aiRejected; duplicates: number; material?: string; options?: import("@/ai/gen").GenOptions }>("ai/review-queue");
        if (v?.queue?.length || v?.rejected?.length) { aiQueue = v.queue ?? []; aiRejected = v.rejected ?? []; aiDuplicates = v.duplicates ?? 0; aiQueueBankId = (v as any).bankId ?? ""; aiQueueMaterial = v.material ?? ""; aiQueueOptions = v.options ?? null; }
      } catch { /* 忽略 */ }
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
      // 首次调用数据流确认（26.2 P0）：端点/范围/取消入口。
      // 41-06：确认绑定端点——端点改变（含自定义↔内置切换）时重新确认，不沿用旧同意
      const currentEndpoint = String(plugin.settingUtils?.get?.("aiEndpoint") ?? "").trim() || "(内置)";
      const consentKey = "lv-exam-ai-consent";
      let consented = readLocal(consentKey);
      try {
        const parsed = JSON.parse(consented ?? "") as { endpoint?: string } | null; // 旧版 "1" 解析失败 → 视为未同意
        if (parsed?.endpoint) consented = parsed.endpoint;
        else consented = null;
      } catch {
        if (consented !== null && consented !== "1") consented = null;
        else if (consented === "1") consented = "(legacy)"; // 旧版布尔同意：不绑定端点，保留行为
      }
      if (consented !== currentEndpoint) {
        const ep = String(plugin.settingUtils?.get?.("aiEndpoint") ?? "").trim();
        const msg = ep
          ? `${t("ai.consentTitle")}<br>${t("ai.consentCustom")} ${escapeHtml(redactUrlForDisplay(ep))}`
          : `${t("ai.consentTitle")}<br>${t("ai.consentSiyuan")}`;
        if (!(await confirmDialogSync({ title: t("ai.consentTitle"), content: `${msg}<br><br>${t("ai.consentScope")}` }))) return;
        writeLocal(consentKey, JSON.stringify({ endpoint: currentEndpoint }));
      }
      aiCancel = { aborted: false };
      aiBusy = true; aiError = ""; aiQueue = []; aiRejected = []; aiDuplicates = 0; aiSaved = 0;
      aiQueueBankId = requestBankId; aiQueueMaterial = requestMaterial; aiQueueOptions = requestOptions;
      void persistAiQueue();
      try {
        const { generate } = await import("@/ai/gen");
        const { CountingChannel } = await import("@/ai/counting");
        const counting = new CountingChannel(await makeAiChannel());
        const r = await generate(counting, requestMaterial, { ...requestOptions, signal: aiCancel });
        aiCost = `≈${counting.approxTokens} tok · ${counting.calls} ${t("ai.usageCalls")}`;
        await saveGenerationUsage(counting);
        aiQueue = r.pending; aiRejected = r.rejected; aiDuplicates = r.duplicates;
        gleanPendingDone = requestGleanClips;
        if (aiCancel.aborted) {
          // The kernel channel cannot abort an in-flight request. `generate`
          // drops its late response, while preserving candidates from earlier
          // chunks; surface the final state so the user can retry explicitly.
          showMessage(t("ai.cancelled"), 4200, "info");
        }
        void persistAiQueue();
        // 60-01 写方向：出题成功且素材来自拾遗 → 提供「标记已读」闭环入口
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
        const sApp = (plugin as any).app ?? plugin;
        // 社区约定：app.ui.currentEditor（官方类型未导出，as any + 多级兜底）
        const ed = sApp?.ui?.currentEditor ?? sApp?.ui?.lastEditor ?? null;
        const rootId: string | undefined = ed?.protyle?.block?.rootID;
        if (!rootId) { showMessage(t("ai.noCurrentDoc"), 3600, "error"); return; }
        const { title, content } = await app.deps.client.exportDocMarkdown(rootId);
        if (!content) { showMessage(t("ai.noCurrentDoc"), 3600, "error"); return; }
        aiSource = content;
        aiSourceOrigin = `${t("ai.sourceFromDocument").replace("{title}", title || rootId.slice(0, 8))}`;
        if (!aiKp.trim() && title) aiKp = title;
        showMessage(`${t("ai.sourceLoaded")} ${title || rootId.slice(0, 8)}`, 2600, "info");
      } catch (e) {
        showMessage(String(e instanceof Error ? e.message : e), 4200, "error");
      }
    }

    /** 通道构造（生成/修复共用）：端点+Key 配置走 OpenAI 兼容，否则思源内置 */
    async function makeAiChannel() {
      const { SiyuanAiChannel, OpenAiChannel } = await import("@/ai/client");
      const endpoint = String(plugin.settingUtils?.get?.("aiEndpoint") ?? "");
      const key = resolveAiKey(plugin);
      const model = String(plugin.settingUtils?.get?.("aiModel") ?? "gpt-4o-mini");
      return endpoint && key
        ? new OpenAiChannel({ endpoint, apiKey: key, model }, (u, i) => fetch(u, i))
        : new SiyuanAiChannel(app.deps.client);
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
        const { repairIssues } = await import("@/ai/gen");
        const { CountingChannel } = await import("@/ai/counting");
        const counting = new CountingChannel(await makeAiChannel());
        const r = await repairIssues(counting, rejected as import("@/ai/gen").GenIssue[], source, { ...requestOptions, signal: aiCancel });
        aiCost = `≈${counting.approxTokens} tok · ${counting.calls} ${t("ai.usageCalls")}`;
        await saveGenerationUsage(counting);
        aiQueue = [...aiQueue, ...r.pending];
        aiRejected = r.rejected;
        aiDuplicates += r.duplicates;
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
      if (aiQueueBankId && activeBankId !== aiQueueBankId) {
        showMessage(t("ai.queueWrongBank"), 4600, "error");
        return true;
      }
      return false;
    }

    async function approveAi(q: Question, silent = false) {
      if (aiBusy || aiPreparing || aiRegenBusy || approving.has(q.id) || queueBankMismatch() || !activeBankId) return;
      const targetBankId = aiQueueBankId || activeBankId;
      approving.add(q.id);
      // 乐观出队：按钮即消失，不依赖写入往返；计数只加一次
      aiQueue = aiQueue.filter((x) => x.id !== q.id);
      try {
        await app.writeManualQuestion(targetBankId, q);
        aiSaved++;
        await refreshQuestionsAfterWrite(questions.length + 1);
        void persistAiQueue();
      } catch (e) {
        aiQueue = [...aiQueue, q];                           // 写入失败：退回队列（保住候选与计数一致）
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
      if (aiMutationBusy || queueBankMismatch()) return;
      aiBatchBusy = true;
      try {
      const total = aiQueue.length;
      for (const q of [...aiQueue]) await approveAi(q, true); // 批量时抑制逐题 toast（41-04：统一汇总）
      void persistAiQueue();
      // 41-04 批量部分失败汇总：仍在队列的 = 写入失败退回的候选
      const failed = aiQueue.length;
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
      aiEditDraft = { stem: q.stem, options: [...q.options], answer: q.answer, analysis: q.analysis ?? "" };
    }

    function cancelEditAi() {
      editingAiId = ""; aiEditDraft = null; aiEditError = "";
    }

    function saveEditAi(q: Question) {
      if (!aiEditDraft) return;
      const stem = aiEditDraft.stem.trim();
      const options = aiEditDraft.options.map((o) => o.trim());
      const answer = normalizeAnswer(q.type, aiEditDraft.answer) ?? "";
      const edited: Question = { ...q, stem, options, answer, analysis: aiEditDraft.analysis.trim(), hash: questionHash(stem, options) };
      const bad = validate(edited);
      if (bad) { aiEditError = bad; return; }
      aiQueue = aiQueue.map((x) => (x.id === q.id ? edited : x));
      cancelEditAi();
      void persistAiQueue();
    }

    /** 单题重生成：用生成时的材料快照按同题型/考点重出 1 题，替换原候选（41-04） */
    async function regenOneAi(q: Question) {
      if (aiMutationBusy || queueBankMismatch()) return;
      if (!aiQueueMaterial.trim()) { showMessage(t("ai.regenNoSource"), 3600, "info"); return; }
      const requestMaterial = aiQueueMaterial;
      const requestOptions = { ...(aiQueueOptions ?? snapshotAiOptions()), types: [q.type], count: 1, kp: q.kp };
      aiCancel = { aborted: false };
      aiRegenBusy = q.id; aiError = "";
      try {
        const { generate } = await import("@/ai/gen");
        const { CountingChannel } = await import("@/ai/counting");
        const counting = new CountingChannel(await makeAiChannel());
        const r = await generate(counting, requestMaterial, { ...requestOptions, signal: aiCancel });
        aiCost = `≈${counting.approxTokens} tok · ${counting.calls} ${t("ai.usageCalls")}`;
        await saveGenerationUsage(counting);
        if (r.pending[0]) {
          aiQueue = aiQueue.map((x) => (x.id === q.id ? r.pending[0] : x));
          void persistAiQueue();
          showMessage(t("ai.regenDone"), 2800, "info");
        } else {
          aiError = r.rejected[0]?.reason ?? t("ai.empty");
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
      // 清理上次导入残留（TODO 27 组：多 Sheet 残留状态 bug 预防）
      sheetNames = []; sheetRowsCache = new Map();
      manualMap = null; mapEditorOpen = false; mapErrors = []; // 38-02：手动映射随文件更换重置
      const input = e.target as HTMLInputElement;
      const file = input.files?.[0];
      if (!file) return;
      importParsing = true; updateResult = null;
      try {
        // 38-01：xlsx/xls 走二进制读取，仅 CSV 做编码/分隔符探测
        //（此前 xlsx 也过 decodeCsv 文本路径，真 XLSX 报 Bad compressed size）
        const XLSX = await import("xlsx");
        const { parseWorkbookFile } = await import("@/importer/workbookFile");
        const buf = await file.arrayBuffer();
        const parsed = await parseWorkbookFile(XLSX, buf, file.name);
        if (parsed.garbled) showMessage(t("import.garbledWarning"), 5200, "info");
        sheetNames = parsed.sheetNames;
        sheetRowsCache = parsed.sheets;
        activeSheet = sheetNames[0];
        parseActiveSheet();
      } catch (e) { importError = String(e instanceof Error ? e.message : e); }
      finally { importParsing = false; input.value = ""; }
    }

    /** 多 Sheet 支持（TODO 12 组）：读文件时缓存各行，选择工作表重解析 */
    let sheetNames = $state<string[]>([]);
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
      // 手动映射（38-02）优先；列越界（换文件/切 Sheet 后）→ 提示并回退自动映射
      if (manualMap) {
        const width = rows[0].length;
        const idxs = [manualMap.type, manualMap.stem, manualMap.answer, manualMap.analysis, manualMap.difficulty, manualMap.kp, manualMap.score, manualMap.source, ...(manualMap.options ?? [])];
        if (idxs.some((i) => i != null && i >= width)) {
          importError = t("import.mappingMismatch");
          manualMap = null;
          return;
        }
        lastMap = manualMap;
        importReport = parseExcelRows(rows.slice(1), manualMap, { existingHashes: existing, duplicateStrategy: dupeStrategy });
        return;
      }
      // 映射复用（2.3/38-02）：已保存映射优先；列越界守卫 → 提示并回退自动映射
      const saved = savedMappings.find((m) => m.name === selectedMapping);
      if (saved) {
        const width = rows[0].length;
        const idxs = [saved.map.type, saved.map.stem, saved.map.answer, saved.map.analysis, saved.map.difficulty, saved.map.kp, saved.map.score, saved.map.source, ...(saved.map.options ?? [])];
        if (idxs.some((i) => i != null && i >= width)) {
          importError = t("import.mappingMismatch");
          selectedMapping = "";
          return;
        }
        lastMap = saved.map;
        importReport = parseExcelRows(rows.slice(1), saved.map, { existingHashes: existing, duplicateStrategy: dupeStrategy });
        return;
      }
      const { map, missing } = autoMapExcel(rows[0].map(String));
      if (missing.length) {
        importError = t("import.missingColumns") + missing.join("、");
        // 38-02：自动映射失败 → 直接展开手动映射编辑器（预填最优猜测，异名列/乱序表可手动指派）
        mapAssign = autoAssignment(rows[0].map(String));
        mapErrors = [];
        mapEditorOpen = true;
        return;
      }
      lastMap = map;
      importReport = parseExcelRows(rows.slice(1), map, { existingHashes: existing, duplicateStrategy: dupeStrategy });
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
      if (!rows?.length) return;
      // 预填优先级：当前手动映射 > 已保存映射 > 自动映射最优猜测
      const base = manualMap ?? savedMappings.find((m) => m.name === selectedMapping)?.map ?? null;
      mapAssign = base ? assignmentFromMap(base) : autoAssignment(rows[0].map(String));
    }

    function applyManualMap() {
      if (importBusy) return;
      const rows = sheetRowsCache.get(activeSheet);
      if (!rows?.length) return;
      const errs = assignmentErrors(mapAssign, rows[0].length);
      if (errs.length) { mapErrors = errs; return; }
      manualMap = assignmentToMap(mapAssign);
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
    const materialsFiltered = $derived.by(() => {
      const kw = materialsSearch.trim().toLowerCase();
      if (!kw) return materialsList;
      return materialsList.filter((m) =>
        [m.title, m.subject, m.chapter, ...m.locations.map((l) => l.path)]
          .filter(Boolean)
          .some((s) => String(s).toLowerCase().includes(kw)),
      );
    });
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

    function matIconName(kind: string): string {
      if (kind === "pdf") return "table";
      if (kind === "video") return "play";
      if (kind === "audio") return "volume";
      if (kind === "image") return "file";
      if (kind === "doc") return "file";
      return "folder";
    }

    async function onMaterialFile(e: Event) {
      const input = e.target as HTMLInputElement;
      const file = input.files?.[0];
      input.value = "";
      if (!file || materialsBusy) return;
      materialsBusy = true; materialsNote = "";
      try {
        const { material, deduped } = await app.registerMaterialFromFile(file, { subject: matSubject, chapter: matChapter });
        loadMaterials();
        materialsNote = deduped ? t("materials.deduped") : `✓ ${t("materials.registered")} ${material.title}`;
      } catch (err) {
        materialsNote = String(err instanceof Error ? err.message : err);
      } finally { materialsBusy = false; }
    }

    async function registerMaterialLink() {
      if (!matLink.trim() || materialsBusy) return;
      materialsBusy = true; materialsNote = "";
      try {
        const rawLink = matLink.trim();
        let titleToUse = matLinkTitle.trim();
        const blockMatch = rawLink.match(/siyuan:\/\/blocks\/([0-9a-zA-Z-]+)/) || (rawLink.length === 22 && rawLink.match(/^([0-9]{14}-[0-9a-z]{7})$/));
        if (blockMatch && !titleToUse && app?.kernelOnline) {
          try {
            const blockId = blockMatch[1];
            const rows = await app.deps.client.sql<Record<string, string>>(`SELECT content, hpath FROM blocks WHERE id='${blockId.replace(/'/g, "''")}' LIMIT 1`);
            if (rows[0]) {
              titleToUse = String(rows[0].content || "").trim().slice(0, 40) || (rows[0].hpath ? String(rows[0].hpath).split("/").pop() || "" : "");
            }
          } catch { /* 容错 */ }
        }
        const { material, deduped } = await app.registerMaterialFromLink(rawLink, {
          title: titleToUse, subject: matSubject, chapter: matChapter,
        });
        loadMaterials();
        matLink = ""; matLinkTitle = "";
        materialsNote = deduped ? t("materials.deduped") : `✓ ${t("materials.registered")} ${material.title}`;
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
      try { await navigator.clipboard.writeText(link.href); showMessage(t("gate.linkCopied"), 2400, "info"); } catch { /* 剪贴板不可用则静默 */ }
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
      const url = app.resolveMaterialUrlOf(m, window.location.origin);
      if (!url) { materialsNote = t("materials.cannotOpen"); return; }
      void gatedOpen(url, m);
    }

    /** R54 原型高级交互：把资料/笔记一键带入手工出题 */
    function bridgeMaterialToManual(m: import("../../core/materials").MaterialDoc, noteText = "") {
      mSource = [m.subject, m.chapter, m.title].filter(Boolean).join(" / ");
      if (noteText) {
        mStem = noteText;
      }
      view = "manual";
      showMessage(`已将资料《${m.title}》带入手工录题！`, 2800, "info");
    }

    /** R54 原型高级交互：把资料/笔记一键带入 AI 材料 */
    function bridgeMaterialToAi(m: import("../../core/materials").MaterialDoc, noteText = "") {
      const notes = app.listMaterialNotes(m.id).map((n) => n.text).join("\n\n");
      const content = [
        `【资料出处】${[m.subject, m.chapter, m.title].filter(Boolean).join(" / ")}`,
        noteText ? `【重点笔记】\n${noteText}` : notes ? `【资料笔记】\n${notes}` : "",
      ].filter(Boolean).join("\n\n");
      aiSource = content;
      view = "ai";
      showMessage(`已将资料《${m.title}》带入 AI 出题工作台！`, 2800, "info");
    }

    async function removeMaterialEntry(m: import("../../core/materials").MaterialDoc) {
      const { confirmDialogSync } = await import("../../libs/dialog");
      const ok = await confirmDialogSync({
        title: t("materials.removeTitle"),
        content: `${escapeHtml(m.title)}<br><span style="font-size:var(--lv-font-size-sm);color:var(--lv-text-3)">${t("materials.removeNote")}</span>`,
      });
      if (!ok) return;
      materialsBusy = true; materialsNote = "";
      try {
        await app.removeMaterialById(m.id);
        loadMaterials();
        if (notesOpenId === m.id) { notesOpenId = ""; notesCache = []; }
        materialsNote = t("materials.removed");
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
    function noteSignature() { return JSON.stringify([noteEditingId, noteText, notePage, noteTime, noteQuote, noteTags]); }
    const noteDirty = $derived(noteSignature() !== noteBaseline && !!(noteText || notePage || noteTime || noteQuote || noteTags));

    function toggleNotes(m: import("../../core/materials").MaterialDoc) {
      if (materialsBusy) return;
      if (notesOpenId) noteDrafts.set(notesOpenId, { editingId: noteEditingId, text: noteText, page: notePage, time: noteTime, quote: noteQuote, tags: noteTags, baseline: noteBaseline });
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
      noteEditingId = ""; noteText = ""; notePage = ""; noteTime = ""; noteQuote = ""; noteTags = ""; noteFormError = "";
      noteBaseline = noteSignature();
    }
    async function startEditNote(n: import("../../core/materialNotes").MaterialNote) {
      if (materialsBusy || noteEditingId === n.id) return;
      if (noteDirty) {
        const { confirmDialogSync } = await import("../../libs/dialog");
        if (!(await confirmDialogSync({ title: t("materials.replaceDraftTitle"), content: t("materials.replaceDraftConfirm") }))) return;
      }
      if (materialsBusy) return;
      noteEditingId = n.id;
      noteText = n.text;
      notePage = n.locator?.page != null ? String(n.locator.page) : "";
      noteTime = n.locator?.tSec != null ? formatSecToTime(n.locator.tSec) : "";
      noteQuote = n.locator?.quote ?? "";
      noteTags = (n.tags ?? []).join("，");
      noteFormError = "";
      noteBaseline = noteSignature();
    }
    async function saveNote(m: import("../../core/materials").MaterialDoc) {
      if (!noteText.trim() || materialsBusy) return;
      const signature = noteSignature();
      const editingId = noteEditingId;
      noteFormError = ""; materialsBusy = true;
      try {
        const page = notePage.trim() ? Number(notePage) : undefined;
        if (notePage.trim() && (!Number.isInteger(page) || page! < 1)) throw new Error(t("materials.badPage"));
        const tSec = noteTime.trim() ? parseTimeToSec(noteTime) : undefined;
        const quote = noteQuote.trim() || undefined;
        const locator: import("../../core/materialNotes").NoteLocator | null =
          page == null && tSec == null && !quote ? null : { page, tSec, quote };
        const tags = noteTags.split(/[,，]/).map((s) => s.trim()).filter(Boolean);
        if (editingId) await app.updateMaterialNote(editingId, { locator, text: noteText, tags });
        else await app.addMaterialNote({ materialId: m.id, revision: m.revision, locator, text: noteText, tags });
        const savedNotes = refreshMaterialNoteCount(m.id);
        if (notesOpenId === m.id) {
          notesCache = savedNotes;
          if (signature === noteSignature()) { resetNoteForm(); noteDrafts.delete(m.id); }
        }
        materialsNote = t("materials.noteSaved");
      } catch (err) {
        noteFormError = String(err instanceof Error ? err.message : err);
      } finally { materialsBusy = false; }
    }
    async function removeNoteEntry(m: import("../../core/materials").MaterialDoc, n: import("../../core/materialNotes").MaterialNote) {
      if (materialsBusy) return;
      const { confirmDialogSync } = await import("../../libs/dialog");
      if (!(await confirmDialogSync({ title: t("materials.noteDelTitle"), content: escapeHtml(n.text.slice(0, 80)) }))) return;
      if (materialsBusy) return;
      materialsBusy = true;
      try {
        await app.deleteMaterialNote(n.id);
        refreshNotes(m);
        if (noteEditingId === n.id) noteEditingId = "";
      } catch (err) {
        materialsNote = String(err instanceof Error ? err.message : err);
      } finally { materialsBusy = false; }
    }
    /** 定位打开：PDF → #page、媒体 → #t（浏览器原生 seek）；无定位=普通打开 */
    function openMaterialAt(m: import("../../core/materials").MaterialDoc, n: import("../../core/materialNotes").MaterialNote) {
      const base = app.resolveMaterialUrlOf(m, window.location.origin);
      const url = locatedUrl(base, n.locator);
      if (!url) { materialsNote = t("materials.cannotOpen"); return; }
      void gatedOpen(url, m);
    }

    // ---------- 映射保存/复用（2.3/38-02） ----------
    let savedMappings = $state<{ name: string; map: import("../../importer/pipeline").ExcelColumnMap }[]>([]);
    let selectedMapping = $state("");
    let lastMap = $state<import("../../importer/pipeline").ExcelColumnMap | null>(null);
    let mappingBusy = $state(false);

    async function loadMappings() {
      try {
        const v = await app.loadAux<{ name: string; map: import("../../importer/pipeline").ExcelColumnMap }[]>("import/mappings");
        savedMappings = Array.isArray(v) ? v : [];
      } catch { savedMappings = []; }
    }

    async function saveMapping() {
      if (!lastMap || mappingBusy) return;
      const { inputDialogSync } = await import("../../libs/dialog");
      const name = (await inputDialogSync({ title: t("import.mappingName"), placeholder: t("import.mappingNameHint") }))?.trim();
      if (!name) return;
      const previous = savedMappings;
      const next = [...previous.filter((m) => m.name !== name), { name, map: JSON.parse(JSON.stringify(lastMap)) }].slice(-20);
      mappingBusy = true;
      savedMappings = next;
      try {
        await app.saveAux("import/mappings", next);
        showMessage(t("settingSaved"), 2400, "info");
      } catch (e) {
        savedMappings = previous;
        showMessage(t("import.mappingSaveFailed").replace("{message}", String(e instanceof Error ? e.message : e)), 4200, "error");
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
      if (moreOpen && moreRoot && !moreRoot.contains(e.target as Node)) moreOpen = false;
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
    let browseLimit = $state(200);
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
      const base = favOnly ? questions.filter((q) => q.fav) : questions;
      const targetIds = (filterOrphanKind && orphanDiag)
        ? new Set(orphanDiag.byKind[filterOrphanKind].map((item) => item.qid))
        : null;

      let helped: Set<string> | null = null;
      let recent: Set<string> | null = null;
      let wb: ReadonlyMap<string, { wrongCount: number }> | null = null;

      if (filterWrong || filterHelp || filterDays) {
        const events = app.attempts.all();
        const cutoff = filterDays > 0 ? Date.now() - filterDays * 86_400_000 : 0;
        // eslint-disable-next-line svelte/prefer-svelte-reactivity -- 函数内累加集（非组件状态），与 backlinkCache 惯用法一致
        helped = new Set<string>();
        // eslint-disable-next-line svelte/prefer-svelte-reactivity -- 同上
        recent = new Set<string>();
        for (const e of events) {
          if (e.help) helped.add(e.qid);
          if (!cutoff || e.ts >= cutoff) recent.add(e.qid);
        }
        if (filterWrong) {
          wb = app.derived().wrongbook;
        }
      }

      const kw = searchDebounced.trim().toLowerCase();

      // 过滤谓词已抽到 core（可单测）；此处只负责把响应式状态装配成纯输入
      return base.filter((q) => matchesBrowseFilter(q, {
        section: sectionSel,
        type: filterType,
        status: filterStatus,
        disputedOnly: filterDispute,
        targetIds,
        source: filterSource,
        wrongOnly: filterWrong,
        helpedOnly: filterHelp,
        recentOnly: filterDays > 0,
        userTag: filterUserTag || null,
        keyword: kw,
        wrongCountOf: (id) => wb?.get(id)?.wrongCount ?? 0,
        helped,
        recent,
      }));
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
        const v = await app.loadAux<import("@/core/smartViews").SmartView[]>("browse/smartViews");
        smartViews = Array.isArray(v) ? v : [];
        smartViewLoadFailed = false;
        smartViewError = "";
      } catch (e) {
        smartViews = [];
        smartViewLoadFailed = true;
        smartViewError = t("view.loadFailed").replace("{message}", String(e instanceof Error ? e.message : e));
      } finally { smartViewLoadBusy = false; }
    }
    async function saveSmartViews(next: import("@/core/smartViews").SmartView[]) {
      try {
        await app.saveAux("browse/smartViews", next);
        return true;
      } catch (e) {
        smartViewError = t("view.saveFailed").replace("{message}", String(e instanceof Error ? e.message : e));
        return false;
      }
    }
    /** 当前过滤态 → 视图快照（43-05：过滤条件+题库身份+schema 版本一起存） */
    async function saveCurrentView() {
      if (!activeBankId || smartViewBusy || smartViewLoadBusy || smartViewLoadFailed) return;
      smartViewBusy = true; smartViewError = "";
      try {
        const { inputDialogSync } = await import("../../libs/dialog");
        const name = (await inputDialogSync({ title: t("view.saveTitle"), placeholder: t("view.namePlaceholder") }))?.trim();
        if (!name) return;
        const next = upsertView(smartViews, {
          name,
          v: 1,
          bankId: activeBankId,
          search: searchText,
          favOnly,
          section: sectionSel ? JSON.parse(JSON.stringify(sectionSel)) : null,
          createdAt: Date.now(),
        });
        if (!(await saveSmartViews(next))) return;
        smartViews = next;
        selectedView = name;
        showMessage(t("view.saved"), 2400, "info");
      } finally { smartViewBusy = false; }
    }
    /** 应用视图：跨库视图显式确认（不静默改变含义）；应用后过滤三件套整体切换 */
    async function applyNamedView(name: string) {
      selectedView = name;
      const v = smartViews.find((x) => x.name === name);
      if (!v) return;
      if (viewBankMismatch(v, activeBankId)) {
        const { confirmDialogSync } = await import("../../libs/dialog");
        if (!(await confirmDialogSync({ title: t("view.pick"), content: t("view.bankMismatch").replace("{name}", escapeHtml(v.name)) }))) {
          selectedView = "";
          return;
        }
      }
      setSearch(v.search ?? "");
      favOnly = !!v.favOnly;
      sectionSel = v.section ? { ...v.section } : null;
    }
    /** 一键放宽：清空全部浏览筛选（搜索/题型/来源/仅错题/仅受助/时间/收藏/章节/命名视图） */
    function clearBrowseFilters() {
      setSearch("");
      favOnly = false;
      filterType = "";
      filterSource = "";
      filterWrong = false;
      filterHelp = false;
      filterUserTag = "";
      filterDays = 0;
      sectionSel = null;
      selectedView = "";
    }
    async function deleteNamedView() {
      if (!selectedView || smartViewBusy || smartViewLoadBusy || smartViewLoadFailed) return;
      smartViewBusy = true; smartViewError = "";
      try {
        const name = selectedView;
        const { confirmDialogSync } = await import("../../libs/dialog");
        if (!(await confirmDialogSync({ title: t("view.deleteTitle"), content: t("view.deleteConfirm").replace("{name}", escapeHtml(name)) }))) return;
        const next = smartViews.filter((v) => v.name !== name);
        if (!(await saveSmartViews(next))) return;
        smartViews = next;
        selectedView = "";
        showMessage(t("view.deleted"), 2200, "info");
      } finally { smartViewBusy = false; }
    }

    /** 错题本/块菜单/浏览详情 → 单题会话（qid 定位；首次挂载 questions 未加载，先按库拉取） */
    async function startSingleById(pid: string) {
      if (!pid) return false;
      const all = questions.length ? questions : await loadQuestions();
      const q = all.find((x) => x.id === pid);
      if (!q) { showMessage(t("query.empty"), 3200, "info"); return true; }
      if (!(await negotiateStart([q], "wrong"))) return true;
      feedback = null; selected = ""; confidenceSel = ""; sessionDone = null; view = "session";
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
      if (!hasPrevPeek) return;
      expandedId = shownQuestions[currentPeekIndex - 1].id;
    }

    function nextPeekQuestion() {
      if (!hasNextPeek) return;
      expandedId = shownQuestions[currentPeekIndex + 1].id;
    }

    async function drillSingleQuestion(q: Question) {
      closePeekDrawer();
      await safeStart([q], "special", () => {
        feedback = null; selected = ""; confidenceSel = ""; sessionDone = null; view = "session";
      });
    }

    function cloneToManualStudio(q: Question) {
      mType = q.type === "material" ? "single" : q.type;
      mStem = q.stem ? `${q.stem}（变式）` : "";
      mOptions = q.options?.length ? [...q.options] : ["", ""];
      mAnswer = q.answer || "";
      mAnalysis = q.analysis ? `【母题解析】：${q.analysis}` : "";
      mKp = q.kp || "";
      mSource = q.blockId ? `(( ${q.blockId} '${q.stem.slice(0, 20)}...' ))` : (q.source || "");
      mStatus = "draft";
      closePeekDrawer();
      view = "manual";
      showMessage("已将该题载入手工录题台，并自动建立母题溯源反链！", 3500, "info");
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
      const marked: { node: HTMLElement; hadInert: boolean; ariaHidden: string | null }[] = [];
      const mark = (node: HTMLElement) => {
        if (node === drawer || node.classList.contains("lv-peek-backdrop") || marked.some((x) => x.node === node)) return;
        marked.push({ node, hadInert: node.hasAttribute("inert"), ariaHidden: node.getAttribute("aria-hidden") });
        node.setAttribute("inert", "");
        node.setAttribute("aria-hidden", "true");
      };
      let current: HTMLElement | null = drawer;
      while (current && current !== tabRoot) {
        const parent = current.parentElement;
        if (!parent) break;
        for (const child of [...parent.children]) {
          if (child instanceof HTMLElement && child !== current && !child.contains(drawer)) mark(child);
        }
        current = parent;
      }
      return () => {
        for (const { node, hadInert, ariaHidden } of marked) {
          if (hadInert) node.setAttribute("inert", "");
          else node.removeAttribute("inert");
          if (ariaHidden === null) node.removeAttribute("aria-hidden");
          else node.setAttribute("aria-hidden", ariaHidden);
        }
      };
    });

    function closePeekDrawer() {
      expandedId = "";
    }

    function onPeekDrawerKeydown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) {
        if (e.key === "Escape") {
          e.stopPropagation();
          closePeekDrawer();
        }
        return;
      }
      if (e.key === "Escape") {
        e.stopPropagation();
        closePeekDrawer();
      } else if (e.key === "ArrowUp" || e.key === "k" || e.key === "ArrowLeft") {
        e.preventDefault();
        prevPeekQuestion();
      } else if (e.key === "ArrowDown" || e.key === "j" || e.key === "ArrowRight") {
        e.preventDefault();
        nextPeekQuestion();
      } else if (e.key.toLowerCase() === "e" && activePeekQuestion) {
        e.preventDefault();
        void toggleFavQuestion(activePeekQuestion);
      }
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
      if (!app.kernelOnline) {
        backlinkError = { ...backlinkError, [blockId]: t("state.offlineHint") };
        return;
      }
      backlinkBusyFor = blockId;
      backlinkError = { ...backlinkError, [blockId]: "" };
      try {
        const links = await app.deps.client.backlinks(blockId);
        // 写时复制更新 $state Map（惯用法），不转 SvelteMap
        // eslint-disable-next-line svelte/prefer-svelte-reactivity
        const next = new Map(backlinkCache);
        next.set(blockId, links);
        backlinkCache = next;
      } catch (e) {
        backlinkError = { ...backlinkError, [blockId]: t("browse.backlinksFailed").replace("{message}", String(e instanceof Error ? e.message : e)) };
      } finally { backlinkBusyFor = ""; }
    }

    function openInSiYuan(rootId: string, blockId?: string) {
      if (!rootId && !blockId) { showMessage(t("browse.docUnavailable"), 2600, "error"); return; }
      if (blockId) {
        try {
          window.open(`siyuan://blocks/${blockId}`);
          return;
        } catch { /* 容错回退 */ }
      }
      void import("siyuan").then(({ openTab }) => {
        openTab({ app: ((plugin.app ?? plugin) as import("siyuan").App), doc: { id: rootId } });
      }).catch((e) => showMessage(String(e instanceof Error ? e.message : e), 4200, "error"));
    }

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
      const peekOpen = !!activePeekQuestion && !!peekDrawerEl;
      if (peekOpen) {
        // A host confirmation/input dialog takes precedence over the page peek.
        const externalDialog = [...document.querySelectorAll<HTMLElement>('[role="dialog"]')].some((el) => el !== peekDrawerEl);
        if (externalDialog) return;
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          closePeekDrawer();
          return;
        }
        if (e.key === "Tab" && peekDrawerEl) {
          const focusables = [...peekDrawerEl.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])')]
            .filter((el) => el.getClientRects().length);
          const first = focusables[0] ?? peekDrawerEl;
          const last = focusables[focusables.length - 1] ?? peekDrawerEl;
          const idx = focusables.indexOf(document.activeElement as HTMLElement);
          if ((e.shiftKey && (idx <= 0 || document.activeElement === peekDrawerEl)) || (!e.shiftKey && (idx === focusables.length - 1 || document.activeElement === peekDrawerEl))) {
            e.preventDefault();
            (e.shiftKey ? last : first).focus();
          }
          return;
        }
        // Do not let page-level shortcuts act while focus is in the drawer.
        if (!(e.target instanceof Node) || !peekDrawerEl.contains(e.target)) return;
        return;
      }
      if (!tabRoot?.getClientRects().length || e.defaultPrevented || paletteOpen || railOpen || document.querySelector('[role="dialog"]')) return;
      // 44-09 快捷撤销作答（Ctrl+Z / Meta+Z）：仅在反馈态下优先响应
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && view === "session" && feedback) {
        e.preventDefault();
        void undoRecentSubmit();
        return;
      }
      if (e.key === "?" && !peekOpen) {
        e.preventDefault();
        hotkeysHelpOpen = !hotkeysHelpOpen;
        return;
      }
      if (e.isComposing || e.keyCode === 229 || e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement;
      if (target && target !== document.body && !tabRoot.contains(target)) return;
      if (target?.closest('input, textarea, select, [contenteditable="true"]') || target?.isContentEditable) return;
      if (target?.closest('button, a') && (e.key === "Enter" || e.key === " ")) return;
      if (view === "session") {
        if (!session || sessionDone) return;
        const q = session.current;
        if (!q) return;
        if (e.key === "Escape") { e.preventDefault(); exitSession(); return; }
        if (feedback) {
          if (e.key === "Enter" || e.key.toLowerCase() === "j") { e.preventDefault(); nextQuestion(); }
          else if (e.key.toLowerCase() === "k") { e.preventDefault(); previousQuestion(); }
          else if (e.key.toLowerCase() === "u") { e.preventDefault(); void undoRecentSubmit(); }
          else if (e.shiftKey && e.key.toUpperCase() === "S") { e.preventDefault(); scratchpadOpen = !scratchpadOpen; }
          else if (feedback.verdict === "wrong" && /^[1-3]$/.test(e.key)) {
            // 错因快捷键（docs/11：1-4 错因；1-3 对应三分类）
            const reasons = ["careless", "unknown", "trap"] as const;
            void app?.saveWrongReason(q.id, reasons[Number(e.key) - 1]).catch(() => undefined);
            savedReason = reasons[Number(e.key) - 1];
            e.preventDefault();
          }
          return;
        }
        const key = e.key.toUpperCase();
        if (isChoiceQuestion(q) && /^[A-J]$/.test(key)) {
          const idx = key.charCodeAt(0) - 65;
          const choice = answerChoices(q)[idx];
          if (choice) { e.preventDefault(); pickPracticeChoice(choice.value); }
        } else if (/^[1-3]$/.test(e.key)) {
          // 答前置信快捷键（U12）：1=确定 2=模糊 3=蒙（提交前选择，随 attempt 落流水）
          e.preventDefault();
          confidenceSel = (["sure", "fuzzy", "guess"] as const)[Number(e.key) - 1];
        } else if (e.key.toLowerCase() === "e") {
          e.preventDefault();
          void toggleFavCurrent();
        } else if (e.shiftKey && e.key.toUpperCase() === "S") {
          e.preventDefault();
          scratchpadOpen = !scratchpadOpen;
        } else if (e.key === "Enter") {
          if (!canSubmitAnswer) return;
          e.preventDefault();
          submitAnswer();
        } else if (e.key.toLowerCase() === "k" && session.progress.done > 0) {
          e.preventDefault();
          previousQuestion();
        }
      } else if (view === "recite") {
        if (reciteDone || !reciteQueue.length) return;
        if (e.key.toLowerCase() === "v" && reciteQueue[reciteCursor]) {
          e.preventDefault();
          ttsSpeak(reciteQueue[reciteCursor].stem);
          return;
        }
        if (!reciteRevealed && e.key === " ") { e.preventDefault(); revealRecite(); return; }
        if (!reciteRevealed && reciteHint === 1 && e.key.toLowerCase() === "h" && reciteQueue[reciteCursor]?.analysis) { e.preventDefault(); reciteHint = 2; return; }
        if (reciteRevealed && /^[1-4]$/.test(e.key)) { e.preventDefault(); void rateSelf(Number(e.key) as 1 | 2 | 3 | 4); }
      }
    }

    async function commitImport() {
      if (!importReport || importBusy) return;
      if (importPreviewBankId !== activeBankId) { importError = t("import.bankChanged"); return; }
      // 先导 5 行（2.3）：已试导确认的题从完整入库中排除，不重导
      const remaining = trialConfirmed.length ? importReport.ok.filter((q) => !trialConfirmed.includes(q.id)) : importReport.ok;
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
    const remainingImportQuestions = $derived(importReport?.ok.filter((q) => !trialConfirmed.includes(q.id)) ?? []);

    async function trialImport5() {
      if (!importReport || importBusy || !remainingImportQuestions.length) return;
      if (importPreviewBankId !== activeBankId) { importError = t("import.bankChanged"); return; }
      const targetBankId = activeBankId;
      trialBusy = true; importError = ""; trialNote = "";
      try {
        const trial: ImportReport = { ok: remainingImportQuestions.slice(0, 5), errors: [], duplicates: 0, batch: importReport.batch + "-t5" };
        const r = await app.commitImport(targetBankId, trial);
        trialConfirmed = [...new Set([...trialConfirmed, ...r.readback.confirmed])];
        trialNote = r.readback.verified
          ? t("import.trialDone").replace("{c}", String(r.readback.confirmed.length)).replace("{m}", String(r.readback.missing.length))
          : t("import.readbackUnknown");
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

    const currentScratchpadText = $derived.by(() => {
      const q = session?.current;
      if (!q) return "";
      void sessionRev;
      return getScratchpadText(scratchpadStore, q.id, scratchpadMode, scratchpadShared);
    });

    function onScratchpadInput(text: string) {
      const q = session?.current;
      if (!q) return;
      const res = updateScratchpadText(scratchpadStore, q.id, text, scratchpadMode, scratchpadShared);
      scratchpadStore = res.store;
      scratchpadShared = res.sharedText;
    }

    function clearScratchpad() {
      const q = session?.current;
      if (!q) return;
      const res = clearCurrentScratchpad(scratchpadStore, q.id, scratchpadMode, scratchpadShared);
      scratchpadStore = res.store;
      scratchpadShared = res.sharedText;
    }

    async function copyScratchpad() {
      const text = currentScratchpadText.trim();
      if (!text) return;
      try {
        await navigator.clipboard.writeText(text);
        showMessage(t("scratchpad.copied"), 2000, "info");
      } catch { /* 静默 */ }
    }

    // ---------- 52-09 正文划重点挖空出题（Cloze Generator） ----------
    let importSubTab = $state<"standard" | "cloze" | "siyuan">("standard");
    let clozeInputText = $state("");
    let clozeModes = $state<("highlight" | "curly" | "bracket")[]>(["highlight", "curly"]);
    let clozeParsedItems = $state<ParsedClozeItem[]>([]);
    let clozeImporting = $state(false);

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
        siyuanDocCandidates = await app.searchSiyuanDocs(q);
      } catch (e) {
        showMessage(String(e instanceof Error ? e.message : e), 3000, "error");
      } finally {
        siyuanDocBusy = false;
      }
    }

    async function importSelectedDocs() {
      const ids = Object.keys(selectedDocIds);
      if (!ids.length || !app) return;
      siyuanDocBusy = true;
      try {
        const report = await app.importFromSiyuanDocBatch(ids);
        if (!report.ok.length) {
          const rawReason = report.errors[0]?.reason || "";
          const reason = /缺少 ANSWER 行|Aiken/i.test(rawReason)
            ? "所选文档内未检索到题目内容（支持选择题、表格题表、==高亮挖空== 或 **术语** 定义）"
            : (rawReason || "所选文档内未检索到题目格式内容");
          showMessage(reason, 4000, "info");
          return;
        }
        importReport = report;
        importText = "";
        importSubTab = "standard";
        selectedDocIds = {};
        showMessage(`从已选 ${ids.length} 篇文档中成功批量提取 ${report.ok.length} 道试题，请在下方预览并确认入库！`, 4200, "info");
      } catch (e) {
        showMessage(`批量提取失败：${String(e instanceof Error ? e.message : e)}`, 4000, "error");
      } finally {
        siyuanDocBusy = false;
      }
    }

    function toggleSelectAllDocs() {
      if (selectedDocCount === siyuanDocCandidates.length) {
        selectedDocIds = {};
      } else {
        const next: Record<string, boolean> = {};
        for (const doc of siyuanDocCandidates) next[doc.id] = true;
        selectedDocIds = next;
      }
    }

    async function pickAndImportSiyuanDoc(docId: string, title: string) {
      if (!app) return;
      siyuanDocBusy = true;
      try {
        const report = await app.importFromSiyuanDoc(docId);
        if (!report.ok.length) {
          const rawReason = report.errors[0]?.reason || "";
          const reason = /缺少 ANSWER 行|Aiken/i.test(rawReason)
            ? `《${title}》内未检索到题目内容（支持选择题、表格题表、==高亮挖空== 或 **术语** 定义）`
            : (rawReason || "文档内未检索到题目格式内容");
          showMessage(reason, 4000, "info");
          return;
        }
        importReport = report;
        importText = "";
        importSubTab = "standard";
        showMessage(`从《${title}》成功提取 ${report.ok.length} 道试题，请在下方预览并确认入库！`, 4000, "info");
      } catch (e) {
        showMessage(`提取失败：${String(e instanceof Error ? e.message : e)}`, 4000, "error");
      } finally {
        siyuanDocBusy = false;
      }
    }

    async function importAllSearchedDocs() {
      if (!siyuanDocCandidates.length || !app) return;
      siyuanDocBusy = true;
      try {
        const docIds = siyuanDocCandidates.map((d) => d.id);
        const report = await app.importFromSiyuanDocBatch(docIds);
        if (!report.ok.length) {
          showMessage(report.errors[0]?.reason || "所选文档内未检索到题目格式内容", 3500, "info");
          return;
        }
        importReport = report;
        importText = "";
        importSubTab = "standard";
        showMessage(`从 ${docIds.length} 篇文档中成功批量提取 ${report.ok.length} 道试题，请在下方预览并确认入库！`, 4200, "info");
      } catch (e) {
        showMessage(`批量提取失败：${String(e instanceof Error ? e.message : e)}`, 4000, "error");
      } finally {
        siyuanDocBusy = false;
      }
    }

    function toggleClozeMode(mode: "highlight" | "curly" | "bracket") {
      if (clozeModes.includes(mode)) {
        if (clozeModes.length > 1) clozeModes = clozeModes.filter((m) => m !== mode);
      } else {
        clozeModes = [...clozeModes, mode];
      }
      if (clozeInputText.trim()) doParseCloze();
    }

    function doParseCloze() {
      if (!clozeInputText.trim()) return;
      clozeParsedItems = parseClozeText(clozeInputText, { modes: clozeModes });
      if (!clozeParsedItems.length) {
        showMessage(t("cloze.empty"), 3000, "info");
      }
    }

    async function importClozeQuestions() {
      if (!clozeParsedItems.length || !activeBankId || clozeImporting || committing) return;
      clozeImporting = true;
      try {
        const qs = clozeItemsToQuestions(clozeParsedItems, { kp: "笔记挖空", source: "正文划重点" });
        const report: import("../../importer/pipeline").ImportReport = {
          ok: qs,
          errors: [],
          duplicates: 0,
          batch: newBatchId() + "-cloze",
        };
        const ok = await runCommit(report);
        if (ok) {
          clozeInputText = "";
          clozeParsedItems = [];
          showMessage(t("cloze.importSuccess").replace("{n}", String(qs.length)), 3500, "info");
        }
      } finally {
        clozeImporting = false;
      }
    }

    async function checkImportCheckpoint() {
      if (!app || !activeBankId) { importCheckpoint = null; return; }
      try {
        importCheckpoint = await app.loadImportCheckpoint(activeBankId);
      } catch {
        importCheckpoint = null;
      }
    }

    async function resumeCheckpoint() {
      if (!importCheckpoint || importBusy) return;
      const cp = importCheckpoint;
      const report: import("../../importer/pipeline").ImportReport = {
        ok: cp.pendingQuestions,
        errors: [],
        duplicates: 0,
        batch: cp.batch,
      };
      trialConfirmed = [...cp.confirmedIds];
      importCheckpoint = null;
      await runCommit(report);
    }

    async function discardCheckpoint() {
      if (!importCheckpoint || importBusy) return;
      await app?.clearImportCheckpoint().catch(() => undefined);
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
        const r = await app.commitImport(targetBankId, report, {
          onProgress: (done, total) => { commitProgress = { done, total }; },
          isCancelled: () => commitCancelRequested,
        });
        importResult = {
          written: r.written + trialConfirmed.length,
          confirmed: r.readback.confirmed.length + trialConfirmed.length,
          missing: r.readback.missing.length,
          verified: r.readback.verified || !report.ok.length,
          cancelled: r.cancelled === true,
          unprocessed: r.unprocessed?.length ?? 0,
          pendingIndex: r.pendingIndex?.length ?? 0,
        };
        retryPool = report.ok.filter((q) => r.readback.missing.includes(q.id));
        retryBatch = report.batch;
        retryBankId = targetBankId;
        void checkImportCheckpoint();
        if (r.cancelled || commitCancelRequested) {
          importResult.cancelled = true;
          importReport = { ...report, ok: retryPool };
          await refreshQuestionsAfterWrite(0);
          return false;
        }
        // 38-03 更新式重导：报告.updates 按 hash 定位库内题，只覆盖答案/解析/别名
        if (report.updates?.length) {
          // 同批内重复题可能指向本轮刚新增的题；读取固定目标库，不使用切库后的全局列表。
          const updatedQuestions = await app.listQuestions(targetBankId);
          const r2 = await app.applyAnswerUpdates(report.updates, [...targetQuestions, ...updatedQuestions], {
            isCancelled: () => commitCancelRequested,
            onProgress: (done, total) => { commitProgress = { done, total }; },
          });
          updateResult = r2;
          showMessage(
            t("import.updatesDone").replace("{ok}", String(r2.ok)).replace("{f}", String(r2.failed)).replace("{m}", String(r2.missing)),
            5600,
            r2.failed || r2.missing || r2.unprocessed ? "error" : "info",
          );
          if (r2.failed || r2.missing || r2.unprocessed) {
            if (r2.unprocessed) importResult.cancelled = true;
            // 答案更新是幂等操作；保留候选可重新核对/提交，已新增题不重复写入。
            importReport = { ...report, ok: retryPool, updates: report.updates };
            await refreshQuestionsAfterWrite(0);
            return false;
          }
        }
        importReport = null; importText = "";
        // commitImport 内部已等待索引并按 qid 读回；导入可能更新重复题，不能用题目总数推断成功。
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
        const pool = [...importReport.ok];
        const picks: Question[] = [];
        while (pool.length && picks.length < 3) picks.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
        spotIds = picks.map((q) => q.id);
        const html: Record<string, string> = {};
        for (const q of picks) {
          try { html[q.id] = await app.renderStem(q); } catch { html[q.id] = ""; }
        }
        spotHtml = html;
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
      // parseExcelRows 行号 = 绝对行号（首行表头=1）：err.row-1 即缓存数组下标
      const abs = row - 1;
      if (sheet?.[abs]) {
        fixNote = "";
        fixRow = row;
        fixCells = [...sheet[abs]];
        fixText = "";
        return;
      }
      // 文本路径（粘贴）：err.raw 是 120 字截断预览不可编辑 → 按产生错误的解析器口径提取原文
      fixRow = row;
      fixCells = [];
      fixText = "";
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
      const sheet = sheetRowsCache.get(activeSheet);
      const abs = errRow - 1;
      let single: ImportReport;
      if (fixCells.length && sheet?.[abs]) {
        // Excel：修好的行写回缓存并单行重验（Alt+Enter 净化沿用 parseExcelRows 内部规则）
        sheet[abs] = [...fixCells];
        // eslint-disable-next-line svelte/prefer-svelte-reactivity -- 写时复制惯用法，与 backlinkCache 一致
        const nextSheetCache = new Map(sheetRowsCache);
        nextSheetCache.set(activeSheet, sheet);
        sheetRowsCache = nextSheetCache;
        single = parseExcelRows([sheet[abs]], lastMap!, {
          existingHashes: dupeStrategy === "coexist" ? new Set<string>() : new Set(questions.map((q) => q.hash)),
          duplicateStrategy: dupeStrategy,
        });
      } else {
        // 文本路径：整块重验（GIFT/TSV 特征同样走 parseText 分流）
        single = await parseText(fixText, {
          existingHashes: dupeStrategy === "coexist" ? new Set<string>() : new Set(questions.map((q) => q.hash)),
          duplicateStrategy: dupeStrategy,
        });
      }
      if (single.ok.length === 1) {
        importReport = {
          ...importReport,
          ok: [...importReport.ok, single.ok[0]],
          errors: importReport.errors.filter((e) => e.row !== errRow),
        };
        cancelRowFix();
        showMessage(t("import.rowFixed"), 2600, "info");
      } else if (single.errors.length === 1) {
        fixNote = single.errors[0].reason;
        importReport = {
          ...importReport,
          errors: importReport.errors.map((e) => (e.row === errRow ? { ...e, reason: single.errors[0].reason } : e)),
        };
      } else {
        // 修复后与题库/批内重复 → 不进 ok，也不算错误行，如实提示
        fixNote = t("import.rowDuped");
      }
    }

    /** 重试缺失部分（38-04）：同一 batch 重新提交未读回的题；换库后拒绝（41-04 切库不误写目标库） */
    async function retryMissing() {
      if (committing || !retryPool.length) return;
      if (activeBankId !== retryBankId) { importError = t("import.retryWrongBank"); return; }
      await runCommit({ ok: retryPool, errors: [], duplicates: 0, batch: retryBatch, updates: importReport?.updates });
    }
</script>

<svelte:window onkeydown={onKeydown} onclick={(e) => { onRichTextClick(e); onWindowClick(e); }} onauxclick={onRichTextClick} ondragover={(e) => { if (tabRoot?.contains(e.target as Node)) e.preventDefault(); }} ondrop={onDrop} />

<div class="fn__flex-1 lv-exam-tab" bind:this={tabRoot} role="region" aria-label={t("tab.practice")}>
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
    <span class="fn__flex-1"></span>
    <button class="lv-btn lv-btn--ghost sm lv-palette-btn" onclick={() => paletteOpen = true} title="Ctrl / ⌘ K">
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
        <span class="lv-chip lv-chip--amb num" title={t("entry.absentTip")}>⚠ {t("entry.absent").replace("{n}", String(planTrace.absentStreak))}</span>
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
        <span class="lv-chip num lv-focus-context" title={t("entry.checkinStreakTip")}><Icon name="flame" size={12} /> {t("entry.checkinStreak").replace("{n}", String(checkinStreak))}</span>
      {/if}
      <div class="lv-row lv-focus-context" style="margin:0;gap:6px;align-items:center">
        {#if banks.length > 1}
          <!-- 多库切换：紧凑圆角下拉框 -->
          <select class="lv-select" style="max-width:160px;height:28px;font-size:12px;padding:2px 8px" bind:value={activeBankId} onchange={onBankSwitch} disabled={importBusy || mSaving || aiMutationBusy || (view === "session" && !!session && !sessionDone) || (view === "recite" && !reciteDone && !!reciteQueue.length)} title={(view === "session" && !!session && !sessionDone) || (view === "recite" && !reciteDone && !!reciteQueue.length) ? t("bank.sessionHint") : importBusy || mSaving || aiMutationBusy ? t("bank.busyHint") : t("bank.label")}>
            {#each banks as b, _i (_i)}<option value={b.id}>{b.name}</option>{/each}
          </select>
        {:else if hasBank}
          <span class="lv-chip sm">{bankName}</span>
        {/if}
        {#if hasBank}<button class="lv-chip" title={t("bank.removeTitle")} aria-label={t("bank.removeTitle")} onclick={removeActiveBank} disabled={importBusy || mSaving || aiMutationBusy}>✕</button>{/if}
        <button class="lv-btn sm lv-btn--ghost" onclick={() => { bankHubOpen = true; }} title={t("bank.hubTitle")}><Icon name="folder" size={13} /> {t("bank.hubTitle")}</button>
      </div>
      <div class="lv-role-segmented lv-focus-context" role="radiogroup" aria-label="身份模式切换">
        <button
          type="button"
          class="lv-role-pill"
          class:active={userRole === "student"}
          class:active-student={userRole === "student"}
          role="radio"
          aria-checked={userRole === "student"}
          onclick={() => {
            if (userRole !== "student") {
              userRole = "student";
              writeLocal("lv-exam/role", "student");
              showMessage("已切换至【备考学员模式】：专注于每日计划、极速刷题与错题攻坚", 2500, "info");
            }
          }}
          title={t("role.student")}
        >
          <Icon name="academic" size={13} /> <b>{t("role.student")}</b>
        </button>
        <button
          type="button"
          class="lv-role-pill"
          class:active={userRole === "teacher"}
          class:active-teacher={userRole === "teacher"}
          role="radio"
          aria-checked={userRole === "teacher"}
          onclick={() => {
            if (userRole !== "teacher") {
              userRole = "teacher";
              writeLocal("lv-exam/role", "teacher");
              showMessage("已切换至【教师教研模式】：出题工作台、质量审校与排版工具已就绪", 2500, "info");
            }
          }}
          title={t("role.teacher")}
        >
          <Icon name="teacher" size={13} /> <b>{t("role.teacher")}</b>
        </button>
      </div>
  </div>
  <div class="lv-shell" data-exam-role={userRole} class:lv-shell-focus={view === "session" && !sessionDone} class:lv-shell-tasknav-hidden={(view === "session" && !sessionDone) || (view === "recite" && !reciteDone)}>
    <Rail active="practice" taskactive={view === "browse" || view === "wrongbook" ? "bank" : view === "manual" || view === "import" || view === "ai" || view === "materials" ? "create" : "today"} tasknavhidden={view === "session" && !sessionDone || view === "recite" && !reciteDone} ontasknavigate={onTaskNav} {plugin} items={railItems} open={railOpen} onclose={closeRail}
      project={{ name: bankName || t("guard.title"), kicker: t("rail.projectKicker") }} onproject={() => (view = "entry")}
      onquickcreate={() => { view = "manual"; }} />
    <div class="lv-main" style={viewportBottomPad > 0 ? `padding-bottom: ${viewportBottomPad + 16}px;` : undefined}>
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
    <!-- ===== S1 入口 / 守卫 ===== -->
    {#if !hasBank}
      <div class="lv-pad lv-center">
        <div class="lv-card lv-guard lv-guard--welcome">
          <div class="lv-guard-kicker"><Icon name="compass" size={15} /> {t("onboard.title")}</div>
          <div class="lv-guard-title">{t("guard.welcomeTitle")}</div>
          <p class="lv-muted">{t("guard.welcomeDesc")}</p>
          <div class="lv-guard-steps">
            <div class="lv-guard-step"><span class="lv-onboard-no num">01</span><span class="lv-tile-icon"><Icon name="book" size={16} /></span><b>{t("guard.step1")}</b><span>{t("guard.step1Desc")}</span></div>
            <div class="lv-guard-step"><span class="lv-onboard-no num">02</span><span class="lv-tile-icon"><Icon name="import" size={16} /></span><b>{t("guard.step2")}</b><span>{t("guard.step2Desc")}</span></div>
            <div class="lv-guard-step"><span class="lv-onboard-no num">03</span><span class="lv-tile-icon"><Icon name="play" size={16} /></span><b>{t("guard.step3")}</b><span>{t("guard.step3Desc")}</span></div>
          </div>
          <div class="lv-row" style="margin-top:20px">
            <button class="lv-btn lv-btn--primary" onclick={createSampleBank} disabled={creating || offline} aria-busy={creatingSample} title={offline ? t("state.offlineHint") : ""}>
              <Icon name="book" size={16} /> {creatingSample ? t("guard.sampleCreating") : t("guard.createSample").replace("{n}", String(SAMPLE_QUESTION_COUNT))}
            </button>
          </div>
          <p class="lv-hint">{t("guard.demoDesc")}</p>
          {#if bankCreateError}<div class="lv-error" role="alert">{bankCreateError}</div>{/if}
          <div class="lv-guard-title" style="margin-top:20px">{t("guard.title")}</div>
          <p class="lv-muted">{t("guard.desc")}</p>
          <div class="lv-row">
            <input class="lv-input" placeholder={t("guard.namePlaceholder")} bind:value={newBankName} disabled={creating}
              onkeydown={(e) => !e.isComposing && e.keyCode !== 229 && e.key === "Enter" && createBank()} />
            <button class="lv-btn lv-btn--primary" onclick={createBank} disabled={creating || !newBankName.trim()}>
              {creating && !creatingSample ? "…" : t("guard.create")}
            </button>
          </div>
          <!-- 25-P1 首用三路入口：示例题建库即练 / 模板先行 / 直接导入 -->
          <p class="lv-hint"><Icon name="compass" size={13} /> {t("guard.sampleHint")}</p>
          <p class="lv-hint lv-guard-sample-detail">{t("guard.sampleDetail")}</p>
          <div class="lv-row lv-center-text"><span class="lv-muted">{t("guard.or")}</span></div>
          <div class="lv-row">
            <button class="lv-btn" style="flex:1" onclick={downloadTemplate}><Icon name="import" size={15} /> {t("import.template")}</button>
            <button class="lv-btn" style="flex:1" disabled={creating || !newBankName.trim()} onclick={async () => { if (await createBank()) view = "import"; }}><Icon name="import" size={15} /> {t("guard.createAndImport")}</button>
          </div>
          <p class="lv-hint">{t("guard.needBankFirst")}</p>
        </div>
      </div>
    {:else}
      {#if session && session.phase === "running"}
        <div class="lv-pad">
          <div class="lv-card lv-resume">
            <div>
              <b>{t("resume.title")}</b>
              <div class="lv-muted">{t("resume.progress")}: {session.progress.done}/{session.progress.total}</div>
            </div>
            <button class="lv-btn lv-btn--primary" onclick={resume} disabled={resumeBusy || exitBusy}>{resumeBusy ? "…" : t("resume.continue")}</button>
            <button class="lv-btn lv-btn--ghost" disabled={resumeBusy || exitBusy} onclick={async () => {
          if (session) {
            for (const input of abandonedExposureInputs(
              session.answered.map((a) => a.qid), exposures,
              { kind: "practice", mode: session.state.mode, sessionId: session.id },
            )) {
              try { app.recordAttempt(input); } catch { /* 尽力而为 */ }
            }
          }
          await app.discardSession();
          session = null;
          resumeError = "";
        }}>{t("resume.discard")}</button>
          </div>
          {#if resumeError}<div class="lv-error" role="alert" style="margin-top:8px">{resumeError}</div>{/if}
        </div>
      {/if}
      {#if onboarding}
        <!-- 47-02 lite：首次五分钟任务引导（无作答记录时显示；可跳过，有作答自动消失） -->
        <div class="lv-pad">
          <div class="lv-card lv-resume lv-onboard">
            <div>
              <b class="lv-onboard-title"><Icon name="compass" size={16} /> {t("onboard.title")}</b>
              <div class="lv-muted">{t("onboard.desc")}</div>
              <ol class="lv-onboard-steps" aria-label={t("onboard.title")}>
                <li class="lv-onboard-step"><span class="lv-onboard-no num">01</span><span class="lv-tile-icon"><Icon name="import" size={17} /></span><b>{t("onboard.step1Title")}</b>
                  <div class="lv-muted lv-onboard-step-desc">{t("onboard.step1Desc")}</div>
                  <div class="lv-row" style="gap:var(--lv-space-compact);margin:8px 0 0">
                    <button class="lv-btn sm" onclick={() => { view = "import"; }}>{t("onboard.step1")}</button>
                    <button class="lv-btn sm" onclick={() => { view = "manual"; }}>{t("onboard.step1b")}</button>
                    <button class="lv-btn sm" onclick={() => { view = "ai"; }}>{t("onboard.step1c")}</button>
                  </div>
                </li>
                <li class="lv-onboard-step"><span class="lv-onboard-no num">02</span><span class="lv-tile-icon"><Icon name="zap" size={17} /></span><b>{t("onboard.step2")}</b>
                  <div class="lv-muted lv-onboard-step-desc">{t("onboard.step2Desc")}</div>
                  <div class="lv-row" style="gap:var(--lv-space-compact);margin:8px 0 0">
                    <button class="lv-btn sm lv-btn--primary" onclick={() => void startDrill("quick")} disabled={!practiceQuestions.length || !!questionsError} title={!practiceQuestions.length ? t("state.emptyBank") : questionsError ? t("entry.loadError") : ""}>{t("onboard.step2")}</button>
                  </div>
                </li>
                <li class="lv-onboard-step"><span class="lv-onboard-no num">03</span><span class="lv-tile-icon"><Icon name="chart" size={17} /></span><b>{t("onboard.step3")}</b>
                  <div class="lv-muted lv-onboard-step-desc">{t("onboard.step3Desc")}</div>
                  <div class="lv-row" style="gap:var(--lv-space-compact);margin:8px 0 0">
                    <button class="lv-btn sm" onclick={() => plugin.openReport?.()}>{t("onboard.step3")}</button>
                  </div>
                </li>
              </ol>
            </div>
            <div class="lv-row" style="margin:6px 0 0">
              <span class="fn__flex-1"></span>
              <button class="lv-btn sm lv-btn--ghost" onclick={() => { onboardingDismissed = true; writeLocal("lv-exam-onboarded", "1"); }}>{t("onboard.skip")}</button>
            </div>
          </div>
        </div>
      {/if}
      <div class="lv-pad">
        <div class="lv-screen-head">
          <span class="lv-eyebrow">{hasBank ? `${getBankCategoryMeta(bankCategory).badge} · 研学空间` : t("head.entry.eyebrow")}</span>
          <h1 class="lv-h1">{hasBank ? bankName : t("head.entry.title")}</h1>
          <p>先输入理解，再背诵内化；既有日常沉浸自测，亦有全真限时模考。</p>
        </div>
        {#if bankCreateError}<div class="lv-error" role="alert" style="margin-bottom:14px">{bankCreateError}</div>{/if}
        {#if sampleNotice}
          <div class="lv-card" style="padding:16px 20px;margin-bottom:14px" role="status">
            <b>{sampleNotice}</b>
            <p class="lv-muted">{t("guard.demoGuide")}</p>
            <div class="lv-row">
              <button class="lv-btn lv-btn--primary sm" onclick={() => void startDrill("quick")} disabled={!practiceQuestions.length || !!questionsError}><Icon name="play" size={15} /> {t("mode.quick")}</button>
              <button class="lv-btn sm" onclick={() => void retryEntryLoad()} disabled={loading || creating}><Icon name="rotate" size={15} /> {t("entry.loadRetry")}</button>
            </div>
          </div>
        {/if}
        {#if questionsError}
          <div class="lv-card lv-empty lv-entry-empty" role="alert">
            <div class="lv-empty-icon"><Icon name="xcircle" size={28} /></div>
            <b>{t("entry.loadError")}</b>
            <p class="lv-muted">{questionsError}</p>
            <div class="lv-row" style="justify-content:center;margin-top:14px">
              <button class="lv-btn lv-btn--primary" onclick={() => void retryEntryLoad()} disabled={loading}><Icon name="rotate" size={15} /> {t("entry.loadRetry")}</button>
              <button class="lv-btn" onclick={() => { view = "import"; }}><Icon name="import" size={15} /> {t("import.title")}</button>
            </div>
          </div>
        {:else if questionsLoaded && !practiceQuestions.length}
          <!-- 空库全学段研学导航中心（彻底避免 0 题仪表盘视觉混乱，提供宏观融合与具体分类选择） -->
          <div class="lv-card lv-empty lv-entry-empty" style="box-shadow:var(--lv-sh-pop);padding:36px 28px;border-radius:var(--lv-r-4, 22px);background:var(--lv-surface);border:1px solid var(--lv-border);max-width:920px;margin:16px auto 36px">
            <div style="text-align:center;margin-bottom:24px">
              <div class="lv-empty-icon" style="width:54px;height:54px;border-radius:16px;background:var(--lv-brand-soft);color:var(--lv-brand);display:grid;place-items:center;margin:0 auto 12px;box-shadow:0 4px 14px color-mix(in srgb, var(--lv-brand) 18%, transparent)">
                <Icon name="book" size={26} />
              </div>
              <h2 style="font-size:20px;font-weight:700;color:var(--lv-text);margin:0 0 6px">小驴学习 · 全场景自主研学启程</h2>
              <p class="lv-muted" style="max-width:540px;margin:0 auto;line-height:1.6;font-size:13px">
                考试是检验能力的手段，学习是终身成长的基石。当前题库暂无题目，请选择你的研学方向一键开练，或导入自己的笔记知识库。
              </p>
            </div>

            <!-- 四大研学支柱选择漏斗（横向四列 Bento 矩阵） -->
            <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(190px, 1fr));gap:12px;margin-bottom:20px">
              <!-- 1. 职业与考证 -->
              <div class="lv-card" style="padding:14px;background:var(--lv-surface-2);border-radius:var(--lv-r-2);border:1px solid var(--lv-border);display:flex;flex-direction:column;justify-content:space-between">
                <div>
                  <b style="font-size:14px;color:var(--lv-brand);display:flex;align-items:center;gap:6px">
                    <Icon name="badge" size={15} /> 职业考证
                  </b>
                  <p class="lv-muted" style="font-size:12px;margin:6px 0 12px;line-height:1.5">
                    教师资格证(教资)、基金从业资格、中级会计职称等国家专业证书
                  </p>
                </div>
                <button class="lv-btn sm lv-btn--primary" style="width:100%" onclick={() => void createSampleBank("qualification")} disabled={creating || offline} title="体验教资与基金从业资格真题">
                  体验考证题库
                </button>
              </div>

              <!-- 2. 大学与硕博 -->
              <div class="lv-card" style="padding:14px;background:var(--lv-surface-2);border-radius:var(--lv-r-2);border:1px solid var(--lv-border);display:flex;flex-direction:column;justify-content:space-between">
                <div>
                  <b style="font-size:14px;color:var(--lv-accent);display:flex;align-items:center;gap:6px">
                    <Icon name="academic" size={15} /> 大学与硕博
                  </b>
                  <p class="lv-muted" style="font-size:12px;margin:6px 0 12px;line-height:1.5">
                    高等数学微积分、线性代数、考研政治专业课、四六级长难句
                  </p>
                </div>
                <button class="lv-btn sm" style="width:100%" onclick={() => void createSampleBank("higher")} disabled={creating || offline} title="体验大学高数与考研真题">
                  体验高数题库
                </button>
              </div>

              <!-- 3. 多语言研学 (英语+粤语) -->
              <div class="lv-card" style="padding:14px;background:var(--lv-surface-2);border-radius:var(--lv-r-2);border:1px solid var(--lv-border);display:flex;flex-direction:column;justify-content:space-between">
                <div>
                  <b style="font-size:14px;color:var(--lv-scene-language, var(--lv-accent));display:flex;align-items:center;gap:6px">
                    <Icon name="volume" size={15} /> 多语言研学
                  </b>
                  <p class="lv-muted" style="font-size:12px;margin:6px 0 12px;line-height:1.5">
                    雅思核心学术词(IPA音标/en-US发音)与地道粤语日常口语
                  </p>
                </div>
                <div class="lv-row" style="margin:0;gap:4px">
                  <button class="lv-btn sm" style="flex:1" onclick={() => void createSampleBank("english")} disabled={creating || offline}>
                    英语
                  </button>
                  <button class="lv-btn sm" style="flex:1" onclick={() => void createSampleBank("cantonese")} disabled={creating || offline}>
                    粤语
                  </button>
                </div>
              </div>

              <!-- 4. K12基础教育与通识 -->
              <div class="lv-card" style="padding:14px;background:var(--lv-surface-2);border-radius:var(--lv-r-2);border:1px solid var(--lv-border);display:flex;flex-direction:column;justify-content:space-between">
                <div>
                  <b style="font-size:14px;color:var(--lv-green);display:flex;align-items:center;gap:6px">
                    <Icon name="book" size={15} /> K12基础通识
                  </b>
                  <p class="lv-muted" style="font-size:12px;margin:6px 0 12px;line-height:1.5">
                    小学/初中/高中全科基础、中高考物理数学公式与古诗文
                  </p>
                </div>
                <button class="lv-btn sm" style="width:100%" onclick={() => void createSampleBank("k12")} disabled={creating || offline} title="体验K12初高中全科题库">
                  体验基础题库
                </button>
              </div>
            </div>

            <!-- 下方：载入笔记与出题通道 -->
            <div class="lv-row" style="justify-content:center;gap:10px;flex-wrap:wrap;margin:12px 0 0;padding-top:16px;border-top:1px solid var(--lv-border-subtle)">
              <button class="lv-btn lv-btn--primary" onclick={() => { view = "import"; importSubTab = "siyuan"; }}>
                <Icon name="file" size={15} /> 从思源笔记智能提取试题
              </button>
              <button class="lv-btn lv-btn--ghost" onclick={() => { view = "import"; importSubTab = "standard"; }}>
                <Icon name="import" size={15} /> 批量导入 (Excel / CSV / Aiken)
              </button>
              <button class="lv-btn lv-btn--ghost" onclick={() => { view = "manual"; }}>
                <Icon name="clipboard" size={15} /> 手工录题工坊
              </button>
              {#if banks.length > 1}
                <button class="lv-btn lv-btn--ghost" onclick={() => { bankHubOpen = true; }}>
                  <Icon name="folder" size={15} /> 切换其他已有题库 ({banks.length})
                </button>
              {/if}
            </div>
          </div>
        {:else if userRole === "teacher"}
          <TeacherWorkspaceView
            practiceQuestionsCount={practiceQuestions.length}
            {teacherPrintBusy}
            {syncDocsBusy}
            {offline}
            {hasBank}
            {t}
            onprintPaper={printBankDoubleColumnPaper}
            onexportTeacherPaper={exportBankTeacherPaper}
            onprintHomework={printBankHomeworkSheet}
            onopenReport={() => plugin.openReport?.()}
            onopenMock={() => plugin.openMock?.()}
            onnavManual={() => { view = "manual"; }}
            onnavImport={() => { view = "import"; }}
            onnavAi={() => { view = "ai"; }}
            onnavMaterials={() => { view = "materials"; loadMaterials(); }}
            onnavBrowse={() => { switchView("browse"); void loadQuestions(); }}
            onsyncBankDocs={syncBankDocs}
            oncopyChallengeCode={copyChallengeCode}
            onimportChallengeCode={importChallengeCode}
            onexportBank={exportBank}
          />
        {:else}
          <!-- ===== 👨‍🎓 备考学员与自主研学空间 ===== -->
        {#if plan}
          <div class="lv-entry-overview">
          {#if criticalForgettingKps.length > 0}
            <div class="lv-card" style="margin-bottom:12px;padding:12px 16px;border-left:4px solid var(--lv-accent-seal);background:var(--lv-surface);box-shadow:var(--lv-sh-1)">
              <div class="lv-row" style="justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
                <div style="display:flex;align-items:center;gap:8px">
                  <span class="lv-achievement-pill lv-achievement-pill--seal">
                    🚨 艾宾浩斯记忆急救
                  </span>
                  <span style="font-size:var(--lv-font-size-body-compact);font-weight:600;color:var(--lv-text)">
                    检测到 {criticalForgettingKps.length} 个核心考点记忆留存已跌破 35% 临界线！
                  </span>
                </div>
                <div class="lv-row" style="margin:0;gap:6px">
                  <button class="lv-btn sm lv-btn--primary" onclick={rescueEbbinghausNow}>
                    <Icon name="play" size={13} /> 立即做题抢救（{criticalForgettingKps[0].kp} 等 5 题）
                  </button>
                  <button class="lv-btn sm lv-btn--ghost" onclick={rescueEbbinghausRecite} title="不看答案先回忆，以纸面背题模式进行记忆抢救">
                    <Icon name="rotate" size={13} /> 背诵抢救
                  </button>
                </div>
              </div>
            </div>
          {/if}
          <div class="lv-card lv-hero lv-entry-hero">
            <div class="lv-entry-main">
              <span class="lv-focus-label">{t("entry.today")}</span>
              <div class="lv-entry-reason">{planReasonText(plan)}</div>
              {#if planTime}
                <span class="lv-chip num" title={planTime.sourced ? t("entry.timeSourced") : t("entry.timeDefault")}>
                  <Icon name="hourglass" size={13} /> ~{planTime.minutes} {t("entry.minutes")}（{planTime.low}-{planTime.high}）
                </span>
              {/if}
              <!-- 原型：主操作在 hero 卡内部，与上下文成组；空队列禁用防无效点击 -->
              <div class="lv-hero-actions">
                <button class="lv-btn lv-btn--primary" onclick={startToday} disabled={!todayQueue.length} title={todayQueue.length ? "" : t("state.emptyBank")}><Icon name="play" size={16} /> {t("entry.startToday")}</button>
                <button class="lv-btn lv-btn--ghost" onclick={copyTodayReportMarkdown} title={t("entry.copyReportTip")}><Icon name="copy" size={15} /> {t("entry.copyReport")}</button>
                {#if !plan.queue.length && todayQueue.length}<span class="lv-muted" role="status">{t("entry.queueFallback")}</span>{/if}
              </div>
            </div>
            <div class="lv-entry-num">
              <div class="lv-entry-countwrap">
                <span class="num lv-entry-count">{todayQueue.length}</span>
                <span class="lv-entry-unit">{t("browse.count")}</span>
              </div>
              <div class="lv-entry-label">{t("entry.queueLabel")}</div>
            </div>
          </div>
          <section class="lv-card lv-entry-week" aria-label={t("entry.weekTitle")}>
            <div class="lv-entry-week-head"><b>{t("entry.weekTitle")}</b><span class="lv-chip num">{t("entry.weekCount").replace("{n}", String(weekAttemptTotal))}</span></div>
            <div class="lv-week-strip" role="img" aria-label={t("entry.weekAria").replace("{days}", weekTrend.map((day) => `${weekDayLabel(day.date)} ${day.attempts} ${t("browse.count")}`).join("，"))}>
              {#each weekTrend as day (day.date)}
                {@const isToday = day.date === localDate(Date.now())}
                <div class="lv-week-day" class:is-today={isToday} title={`${day.date}${isToday ? "（今天）" : ""} · ${day.attempts} 题`}>
                  <span class="lv-week-count" class:has-attempts={day.attempts > 0} style="--lv-week-fill:{Math.round((day.attempts / weekAttemptMax) * 100)}%">{day.attempts || "·"}</span>
                  <span class:today-text={isToday}>{isToday ? "今" : weekDayLabel(day.date)}</span>
                </div>
              {/each}
            </div>
            <p class="lv-muted">{weekAttemptTotal ? t("entry.weekScope") : t("entry.weekEmpty")}</p>
          </section>
          </div>
        {/if}
        <!-- 驾驶舱 widgets（规范 v6 §5.3）：目标环 / 连胜 / 待消灭 / 考期倒计时；数据全部来自本地流水 -->
        <div class="lv-widgets">
          {#if plan && plan.daysToExam != null}
            <div class="lv-card lv-widget">
              <span class="lv-streak-flame lv-streak-flame--clock"><Icon name="clock" size={22} /></span>
              <div class="lv-widget-body">
                <div class="lv-widget-title">{plan.mode === "sprint" ? t("entry.sprint") : t("entry.examCountdown")}</div>
                <strong class="num">{plan.daysToExam} {t("entry.days")}</strong>
                <span class="lv-muted">{plan.mode === "sprint" ? t("entry.sprintModeHint") : t("entry.steadyModeHint")}</span>
              </div>
            </div>
          {/if}
          <div class="lv-card lv-widget">
            <span class="lv-goal-wrap" role="img" aria-label={t("widget.goal.aria").replace("{p}", String(goalPct))}>
              <span class="lv-goal-ring" class:data-tone={goalPct >= 100 ? "good" : undefined} style="--pct:{goalPct}"></span>
              <span class="lv-goal-center num">{goalPct}%</span>
            </span>
            <div class="lv-widget-body">
              <div class="lv-widget-title">{goalPct >= 100 ? t("widget.goal.achieved") : t("widget.goal")}</div>
              <strong class="num">{todayDone} / {dailyGoalN} {t("browse.count")}</strong>
              <span class="lv-muted">{goalPct >= 100 ? t("widget.goal.done") : t("widget.goal.left").replace("{n}", String(Math.max(0, dailyGoalN - todayDone)))}</span>
            </div>
          </div>
          <div class="lv-card lv-widget">
            <span class="lv-streak-flame"><Icon name="flame" size={22} /></span>
            <div class="lv-widget-body">
              <div class="lv-widget-title">{t("widget.streak")}</div>
              <strong class="num">{streakDays} {t("entry.days")}</strong>
              <span class="lv-muted">{t("widget.streak.note")}</span>
            </div>
          </div>
          <button class="lv-card lv-widget lv-widget--click" style="text-align:left;font:inherit;color:inherit" onclick={() => { view = "wrongbook"; void loadQuestions(); }}>
            <span class="lv-streak-flame lv-streak-flame--wrong"><Icon name="target" size={22} /></span>
            <div class="lv-widget-body">
              <div class="lv-widget-title">{t("widget.wrong")}</div>
              <strong class="num">{wrongList.length} {t("mode.wrong.unit")}</strong>
              <span class="lv-muted">{t("widget.wrong.note")}</span>
            </div>
          </button>
        </div>
        <div class="lv-section-title">
          <span style="display:inline-flex;align-items:center;gap:6px"><Icon name="zap" size={14} /> 阶段一：日常自测与靶向精练</span>
          <span class="lv-muted" style="font-size:12px;font-weight:400">边学边练 · 查漏补缺 · 即时反馈</span>
        </div>
        <!-- 核心练习主跑道：队列驱动三模式（快速/每日/错题）为一级 accent 键帽 -->
        <div class="lv-modes">
          <button class="lv-mode" disabled={!practiceQuestions.length} title={!practiceQuestions.length ? t("state.emptyBank") : ""} onclick={() => startDrill("quick")}>
            <span class="lv-mode-icon lv-mode-icon--quick"><Icon name="zap" /></span><span class="lv-mode-body"><b>{t("mode.quick")}</b><span class="lv-muted">{t("mode.quick.desc")}</span></span>
          </button>
          <button class="lv-mode" disabled={!practiceQuestions.length} title={!practiceQuestions.length ? t("state.emptyBank") : ""} onclick={() => startDrill("daily")}>
            <span class="lv-mode-icon lv-mode-icon--daily"><Icon name="calendar" /></span><span class="lv-mode-body"><b>{t("mode.daily")}</b><span class="lv-muted">{t("mode.daily.desc")}</span></span>
          </button>
          <button class="lv-mode" disabled={!wrongList.length} title={!wrongList.length ? t("state.noWrong") : ""} onclick={() => startDrill("wrong")}>
            <span class="lv-mode-icon lv-mode-icon--wrong"><Icon name="xcircle" /></span><span class="lv-mode-body"><b>{t("mode.wrong")}</b><span class="lv-muted num">{wrongList.length} {t("mode.wrong.unit")}</span></span>
          </button>
        </div>

        <div class="lv-section-title" style="margin-top:20px">
          <span style="display:inline-flex;align-items:center;gap:6px"><Icon name="rotate" size={14} /> 阶段二：概念内化与纸面背诵</span>
          <span class="lv-muted" style="font-size:12px;font-weight:400">主动回忆 · 遮盖自评 · 听音伴读</span>
        </div>
        <div class="lv-modes">
          <button class="lv-mode lv-mode--minor" disabled={!practiceQuestions.length} title={!practiceQuestions.length ? t("state.emptyBank") : ""} onclick={() => startRecite()}>
            <span class="lv-mode-icon lv-mode-icon--recite"><Icon name="rotate" /></span><span class="lv-mode-body"><b>{t("mode.recite")}</b><span class="lv-muted">{t("mode.recite.desc")}</span></span>
          </button>
          <button class="lv-mode lv-mode--minor" disabled={!cramCount} title={!cramCount ? t("state.noCram") : ""} onclick={() => startDrill("cram")}>
            <span class="lv-mode-icon lv-mode-icon--cram"><Icon name="flame" /></span><span class="lv-mode-body"><b>{t("mode.cram")}</b><span class="lv-muted">{t("mode.cram.desc")}</span></span>
          </button>
          <button class="lv-mode lv-mode--minor" disabled={!favoriteCount} title={!favoriteCount ? t("state.noFav") : ""} onclick={() => startDrill("fav")}>
            <span class="lv-mode-icon lv-mode-icon--fav"><Icon name="star" /></span><span class="lv-mode-body"><b>{t("mode.fav")}</b><span class="lv-muted">{t("mode.fav.desc")}（<span class="num">{favoriteCount}</span> {t("mode.wrong.unit")}）</span></span>
          </button>
          {#if practiceQuestions.filter((q) => (q.userTags || []).includes("star")).length > 0}
            {@const count = practiceQuestions.filter((q) => (q.userTags || []).includes("star")).length}
            <button class="lv-mode lv-mode--minor" onclick={() => void startDrill("tag:star")}>
              <span class="lv-mode-icon lv-mode-icon--fav">⭐️</span><span class="lv-mode-body"><b>好题特训</b><span class="lv-muted">必背好题专项（<span class="num">{count}</span> {t("mode.wrong.unit")}）</span></span>
            </button>
          {/if}
          {#if practiceQuestions.filter((q) => (q.userTags || []).includes("trap")).length > 0}
            {@const count = practiceQuestions.filter((q) => (q.userTags || []).includes("trap")).length}
            <button class="lv-mode lv-mode--minor" onclick={() => void startDrill("tag:trap")}>
              <span class="lv-mode-icon lv-mode-icon--wrong">⚠️</span><span class="lv-mode-body"><b>陷阱排雷</b><span class="lv-muted">易混陷阱攻坚（<span class="num">{count}</span> {t("mode.wrong.unit")}）</span></span>
            </button>
          {/if}
        </div>

        <!-- 阶段三：全真模考与实战检验（保留并强化大考主打功能） -->
        <div class="lv-card" style="margin-top:22px;padding:16px 20px;border-radius:var(--lv-r-3);background:var(--lv-surface);border:1px solid var(--lv-border);box-shadow:var(--lv-sh-card)">
          <div class="lv-row" style="justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
            <div>
              <span class="lv-eyebrow" style="color:var(--lv-brand);font-weight:600">阶段三：全真模考与实战检验</span>
              <h3 style="margin:4px 0 2px;font-size:16px;color:var(--lv-text)">标准化机考沙盘 · 出版级试卷印刷</h3>
              <p class="lv-muted" style="margin:0;font-size:12px">考试是检验能力的试金石。支持标准限时模考、CBT 答题卡、防漏答强校验与双栏纸笔试卷。</p>
            </div>
            <div class="lv-row" style="margin:0;gap:8px">
              <button class="lv-btn lv-btn--primary" onclick={() => plugin.openMock?.()} title="进入全真模拟考场">
                <Icon name="clock" size={15} /> 进入全真模考场
              </button>
              <button class="lv-btn" onclick={() => plugin.openReport?.()} title="查看学情诊断报告">
                <Icon name="chart" size={15} /> 查看学情报告
              </button>
            </div>
          </div>
        </div>
        <div class="lv-section-title" style="margin-top:22px">
          <span style="display:inline-flex;align-items:center;gap:6px"><Icon name="compass" size={14} /> {t("entry.tools")}</span>
          <span class="lv-muted" style="font-size:12px;font-weight:400">题库导入、AI出题与资料整理</span>
        </div>
        <div class="lv-row" style="margin-top:0">
          <button class="lv-btn lv-btn--ghost" onclick={createSampleBank} disabled={creating || offline} title={offline ? t("state.offlineHint") : t("guard.demoDesc")}><Icon name="book" size={16} /> {creatingSample ? t("guard.sampleCreating") : t("guard.sampleOpen")}</button>
          <button class="lv-btn lv-btn--ghost" onclick={() => view = "import"}><Icon name="import" size={16} /> {t("import.title")}</button>
          <button class="lv-btn lv-btn--ghost" onclick={() => view = "ai"}><Icon name="sparkles" size={16} /> {t("ai.title")}</button>
          <button class="lv-btn lv-btn--ghost" onclick={() => view = "manual"}><Icon name="pencil" size={16} /> {t("entry.manual")}</button>
          <button class="lv-btn lv-btn--ghost" onclick={() => { view = "materials"; loadMaterials(); }}><Icon name="book" size={16} /> {t("materials.title")}</button>
          <button class="lv-btn" onclick={copyChallengeCode}><Icon name="target" size={16} /> {t("challenge.copy")}</button>
          <button class="lv-btn" onclick={importChallengeCode}><Icon name="import" size={16} /> {t("challenge.import")}</button>
          <button class="lv-btn" onclick={syncBankDocs} disabled={syncDocsBusy || offline || !hasBank} title={t("sync.docsTip")}><Icon name="save" size={16} /> {syncDocsBusy ? "…" : t("sync.docsBtn")}</button>
          <details class="lv-export-fold">
            <summary class="lv-btn"><Icon name="export" size={16} /> {t("export.wrongbook")}</summary>
            <div class="lv-card" style="padding: var(--lv-space-relaxed) var(--lv-space-3);margin-top:6px">
              <div class="lv-row" style="margin:4px 0">
                <span class="lv-chip">{t("manual.kp")}</span>
                <select class="lv-select" bind:value={expKp}>
                  <option value="">{t("filter.all")}</option>
                  {#each expKpRoots as k, _i (_i)}<option value={k}>{k}</option>{/each}
                </select>
                <span class="lv-chip">{t("session.reason")}</span>
                <select class="lv-select" bind:value={expReason}>
                  <option value="">{t("filter.all")}</option>
                  <option value="careless">{t("reason.careless")}</option>
                  <option value="unknown">{t("reason.unknown")}</option>
                  <option value="trap">{t("reason.trap")}</option>
                </select>
                <span class="lv-chip">{t("export.range")}</span>
                <select class="lv-select" bind:value={expDays}>
                  <option value={0}>{t("export.allTime")}</option>
                  <option value={7}>7{t("entry.days")}</option>
                  <option value={30}>30{t("entry.days")}</option>
                </select>
              </div>
              <button class="lv-btn sm lv-btn--primary" onclick={exportWrong}><Icon name="export" size={14} /> {t("export.run")}</button>
              <div class="lv-row" style="margin:6px 0 0">
                <button class="lv-btn sm" disabled={offline} onclick={exportBank}><Icon name="export" size={14} /> {t("share.export")}</button>
                <button type="button" class="lv-btn sm" disabled={offline} onclick={() => bankFileInput?.click()}><Icon name="import" size={14} /> {t("share.import")}</button>
                <input bind:this={bankFileInput} type="file" accept=".sy.zip,.zip" hidden onchange={importBank} disabled={offline} />
                <span class="lv-muted">{t("share.desktopOnly")}</span>
              </div>
            </div>
          </details>
        </div>
        {/if}
      </div>
    {/if}
  {:else if view === "session" && session}
    <!-- ===== S2 会话 ===== -->
    {#if sessionDone}
      <PracticeDoneCard
        {sessionDone}
        {streakDays}
        {kpBreakdown}
        {checkinStatus}
        {checkinNote}
        {settleMode}
        {session}
        {questionMap}
        {reviewOpen}
        {reflections}
        {misdiagnosisBusy}
        {misdiagnosisText}
        {helpShown}
        {actionBusy}
        {actionNote}
        {exitBusy}
        {t}
        {queueSemantics}
        {writeBackReceipt}
        ontoggleReview={() => { reviewOpen = !reviewOpen; if (reviewOpen) void loadReflections(); }}
        onsameKpSession={sameKpSession}
        onwrongsToCard={wrongsToCard}
        onwrongsToActions={wrongsToActions}
        onopenReport={() => plugin.openReport?.()}
        onstartNextDrill={() => void startDrill("quick")}
        oneditReflection={(qid) => void editReflection(qid)}
        onrunMisdiagnosis={(a) => void runMisdiagnosis(a)}
        onadoptMisdiagnosis={(qid) => void adoptMisdiagnosis(qid)}
        onexitSession={exitSession}
      />
    {:else}
      {@const q = curQ}
      {#if q}
        <div class="lv-pad lv-session-grid">
          <div class="lv-row lv-session-head">
            <button class="lv-btn lv-btn--ghost" onclick={exitSession} disabled={exitBusy}>← {exitBusy ? "…" : t("session.exit")}</button>
            <div class="lv-row" style="flex:1;min-width:120px;gap:var(--lv-space-2)">
              <div class="lv-progress" style="flex:1" role="progressbar" aria-label={t("session.progress")} aria-valuemin="0" aria-valuemax={curProgress.total} aria-valuenow={curProgress.done}><i style="width:{curProgress.total ? Math.round((curProgress.done / curProgress.total) * 100) : 0}%"></i></div>
              <span class="num lv-muted">{curProgress.done}/{curProgress.total}</span>
            </div>
            <span class="lv-chip lv-chip--acc">{t("qtype." + q.type)}</span>
            {#if session.isDelayedReviewAtCurrent()}
              <span class="lv-chip lv-chip--amb" title={t("session.delayedRetestTip")}>
                🔄 {t("session.delayedRetest")}
              </span>
            {/if}
            {#if q.group}
              {@const sibs = questions.filter((x) => x.group === q.group)}
              {@const pos = sibs.findIndex((x) => x.id === q.id) + 1}
              <span class="lv-chip num"><Icon name="link" size={12} /> {t("session.groupPos")} {pos}/{sibs.length}</span>
            {/if}
            <div class="lv-session-dock" role="group" aria-label="核心学习操作">
              <button class="lv-chip" title={ttsSupported() ? t("tts.read") : t("tts.unsupported", "当前前端不支持朗读")} aria-label={t("tts.read")} disabled={!ttsSupported()} onclick={() => ttsSpeak([q.stem, ...q.options].join(" "), { lang: q.studyMeta?.lang, rate: ttsSlowRate ? 0.85 : 1 })}><Icon name="volume" size={13} /></button>
              <button type="button" class="lv-chip num sm" class:acc={ttsSlowRate} onclick={() => { ttsSlowRate = !ttsSlowRate; writeLocal("lv-exam/tts-slow", ttsSlowRate ? "1" : "0"); }} title="切换语音语速（0.8x 慢速磨耳朵 / 1.0x 正常）">
                {ttsSlowRate ? "0.8x" : "1.0x"}
              </button>
              <button type="button" class="lv-chip num sm" onclick={cycleStudyFontSize} title="切换题干字号大小（标准 16px / 大号 19px / 特大 22px）">
                A{studyFontSize === "normal" ? "" : studyFontSize === "large" ? "⁺" : "²⁺"}
              </button>
              <button type="button" class="lv-chip" class:acc={speechRecording} onclick={() => startSpeechRecognition(q.answer || q.stem, q.studyMeta?.lang || "zh-CN")} title="开启麦克风发音跟读录音与匹配度测评">
                <Icon name="mic" size={13} /> {speechRecording ? "跟读中…" : "跟读测评"}
              </button>
              <button class="lv-chip" class:acc={reciteToggle} title={t("session.reciteMode")} aria-pressed={reciteToggle} onclick={toggleRecite}><Icon name="eye" size={13} /> {t("session.reciteMode")}</button>
              <button class="lv-chip" class:acc={!!q.fav} title="E" aria-label={t("session.kbdFav")} aria-pressed={!!q.fav} aria-busy={favBusy} disabled={favBusy} onclick={() => toggleFavCurrent()}><Icon name="star" size={13} /></button>
            </div>
            <div class="lv-session-dock" role="group" aria-label="辅助工具坞">
              <button class="lv-chip" class:acc={scratchpadOpen} title={t("scratchpad.tip")} aria-pressed={scratchpadOpen} onclick={() => scratchpadOpen = !scratchpadOpen}><Icon name="pencil" size={13} /></button>
              <button class="lv-chip" class:acc={speedDrillEnabled} title={t("session.speedDrillTip")} aria-pressed={speedDrillEnabled} onclick={() => { speedDrillEnabled = !speedDrillEnabled; writeLocal("lv-exam/speed-drill", speedDrillEnabled ? "1" : "0"); }}><Icon name="zap" size={13} /></button>
              <button class="lv-chip" class:acc={pureListen} title={t("tts.pureListen")} aria-label={t("tts.pureListen")} aria-pressed={pureListen} onclick={togglePureListen}><Icon name="eyeoff" size={13} /></button>
              <button class="lv-chip" class:acc={soundEnabled} title={soundEnabled ? t("sound.disable") : t("sound.enable")} onclick={() => { soundEnabled = !soundEnabled; writeLocal("lv-exam/sound", soundEnabled ? "1" : "0"); }}><Icon name={soundEnabled ? "volume" : "volume-x"} size={13} /></button>
              <button class="lv-chip" class:acc={hotkeysHelpOpen} title={t("hotkeys.tip")} onclick={() => hotkeysHelpOpen = !hotkeysHelpOpen}><Icon name="activity" size={13} /></button>
            </div>
            <span class="lv-chip" style="gap:2px;padding:2px 4px">
              <button class="lv-btn sm lv-btn--ghost" style="padding:1px 3px;font-size:11px" class:acc={(q.userTags || []).includes("star")} title={t("session.tagStar")} onclick={() => void toggleUserTag("star")}>⭐️</button>
              <button class="lv-btn sm lv-btn--ghost" style="padding:1px 3px;font-size:11px" class:acc={(q.userTags || []).includes("trap")} title={t("session.tagTrap")} onclick={() => void toggleUserTag("trap")}>⚠️</button>
              <button class="lv-btn sm lv-btn--ghost" style="padding:1px 3px;font-size:11px" class:acc={(q.userTags || []).includes("doubt")} title={t("session.tagDoubt")} onclick={() => void toggleUserTag("doubt")}>❓</button>
              <button class="lv-btn sm lv-btn--ghost" style="padding:1px 3px;font-size:11px" class:acc={(q.userTags || []).includes("key")} title={t("session.tagKey")} onclick={() => void toggleUserTag("key")}>💡</button>
            </span>
          </div>
          <div class="lv-session-main">
          <ScratchpadDrawer
            open={scratchpadOpen}
            mode={scratchpadMode}
            text={currentScratchpadText}
            {t}
            onmodeChange={(m) => (scratchpadMode = m)}
            oninput={onScratchpadInput}
            onclear={clearScratchpad}
            oncopy={copyScratchpad}
            onclose={() => (scratchpadOpen = false)}
          />
          {#if groupBatchModal}
            <GroupBatchSummaryCard
              modal={groupBatchModal}
              {questionMap}
              {t}
              oncontinue={() => {
                groupBatchModal = null;
                nextQuestion();
              }}
            />
          {/if}
          <div class="lv-card lv-question" class:lv-pure={pureListen} role="region" aria-label={t("session.card")} ontouchstart={onTouchStart} ontouchend={onTouchEnd}>
            <MaterialGroupContextCard
              {materialContext}
              {materialHtml}
              {groupContext}
              {materialExpanded}
              {t}
              {escapeHtml}
              {formatMaterialGroupHeader}
              ontoggleExpand={() => {
                materialExpanded = !materialExpanded;
                if (materialExpanded && !feedback && session?.current) {
                  addExposure(session.current.id, "material");
                }
              }}
              onjumpSibling={jumpToSibling}
            />
            {#if stemHtml}<div class="lv-stem lv-rich b3-typography" class:lv-stem--lg={studyFontSize === "large"} class:lv-stem--xl={studyFontSize === "xlarge"}>{@html stemHtml}</div>{:else}<div class="lv-stem" class:lv-stem--lg={studyFontSize === "large"} class:lv-stem--xl={studyFontSize === "xlarge"}>{q.stem}</div>{/if}
            <SpeechEvalCapsule result={speechEvalResult} ondismiss={() => speechEvalResult = null} />
            {#if q.studyMeta?.phonetic}
              <div class="lv-phonetic-badge" style="margin:4px 0 10px;display:inline-flex;align-items:center;gap:6px;padding:3px 10px;border-radius:6px;background:var(--lv-surface-2);border:1px solid var(--lv-border);font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;color:var(--lv-brand)">
                <Icon name="volume" size={12} />
                <span>注音 / 粤拼：{q.studyMeta.phonetic}</span>
              </div>
            {/if}
            <p class="lv-muted" style="margin:8px 0 14px" role="note">{t("session.guide." + q.type)}</p>
            {#key session.id + ":" + curProgress.done}
            {#if isChoiceQuestion(q)}
              {@const choices = answerChoices(q)}
              {#if !choices.length}
                <div class="lv-error" role="alert">{t("session.missingOptions")}</div>
              {:else}
              <!-- 52-02 lite：先回忆后显示选项——藏选项 + 独立回忆草稿（与作答草稿分离，不入正式答案） -->
              <div class="lv-row" style="margin:0 0 4px">
                <button class="lv-chip" class:acc={hideOptions} onclick={() => { hideOptions = !hideOptions; if (hideOptions) recallDraft = ""; }}>
                  {hideOptions ? t("session.recallOn") : t("session.recallOff")}
                </button>
                {#if hideOptions}<span class="lv-muted" style="font-size:var(--lv-font-size-caption)">{t("session.recallHint")}</span>{/if}
              </div>
              {#if hideOptions}
                <textarea class="lv-input lv-textarea" rows="2" bind:value={recallDraft}
                  placeholder={t("session.recallPlaceholder")} aria-label={t("session.recallPlaceholder")}></textarea>
                <div class="lv-row" style="margin:6px 0">
                  <button class="lv-btn lv-btn--primary sm" onclick={() => { if (q) recallUsed.add(q.id); hideOptions = false; }}>{t("session.revealOptions")}</button>
                </div>
              {:else}
              <!-- 45-03：多选用 checkbox/group 语义而非 radio；读屏可感知选中态 -->
              <div role={q.type === "multiple" ? "group" : "radiogroup"} aria-label={t("session.options")}>
                {#each choices as choice (choice.value)}
                  <button class="lv-opt" class:sel={q.type === "multiple" ? selected.includes(choice.value) : selected === choice.value}
                    role={q.type === "multiple" ? "checkbox" : "radio"}
                    aria-checked={q.type === "multiple" ? selected.includes(choice.value) : selected === choice.value}
                    class:right={feedback && feedback.verdict !== "not_attempted" && (q.type === "multiple" ? q.answer.includes(choice.value) : q.answer === choice.value)}
                    class:wrong={feedback?.verdict === "wrong" && (q.type === "multiple" ? (feedback.myAnswer ?? "").includes(choice.value) && !q.answer.includes(choice.value) : feedback.myAnswer === choice.value)}
                    disabled={!!feedback}
                    onclick={() => pickPracticeChoice(choice.value)}>
                    <span class="lv-opt-check" class:box={q.type === "multiple"} aria-hidden="true"></span>
                    <span class="key">{choice.letter}</span>
                    <span class="lv-opt-text">{@html renderInlineText(choice.text)}</span>
                  </button>
                {/each}
              </div>
              {#if q.type === "multiple" && !feedback}
                {@const selLetters = selected ? [...selected].sort().join(", ") : ""}
                <div class="lv-row lv-multi-indicator" style="margin:8px 0 4px;align-items:center;gap:var(--lv-space-2)">
                  <span class="lv-chip num" class:lv-chip--acc={selected.length > 0}>
                    {selected.length > 0 ? t("session.multiSelected").replace("{items}", selLetters).replace("{n}", String(selected.length)) : t("session.multiEmpty")}
                  </span>
                </div>
              {/if}
              {/if}
              {/if}
            {:else}
              {#if curSpec?.kind === "numeric"}
                <!-- 54 第三刀：数值题专用作答框（单行 + 单位提示；宽容解析/容差判分在引擎） -->
                <input class="lv-input lv-answer-num" type="text" inputmode="decimal"
                  placeholder={curSpec.unit ? t("session.numericUnit").replace("{u}", curSpec.unit) : t("session.numericPlain")}
                  value={feedback?.myAnswer ?? currentDraft}
                  oninput={(e) => { draftLive = (e.target as HTMLInputElement).value; session.setDraft(q.id, draftLive); }}
                  onchange={(e) => trailInput(q.id, (e.target as HTMLInputElement).value)}
                  disabled={!!feedback} />
                {#if curSpec.unit}<div class="lv-row" style="margin:6px 0 0"><span class="lv-chip num">{t("session.unitLabel")}：{curSpec.unit}</span></div>{/if}
              {:else if curSpec?.kind === "multiBlank"}
                <!-- 54 第三刀：多空题逐空作答框（草稿按 ";;" 拼接，判分按位置对应） -->
                <div class="lv-row" style="margin:0 0 6px"><span class="lv-muted" style="font-size:var(--lv-font-size-caption)">{t("session.blankHint")}</span></div>
                {#each blankParts as _p, i (i)}
                  <input class="lv-input lv-answer-blank" placeholder={t("session.blankN").replace("{n}", String(i + 1))}
                    value={blankParts[i]}
                    oninput={(e) => setBlank(i, (e.target as HTMLInputElement).value)}
                  onchange={() => trailInput(q.id, joinBlanks(blankParts))}
                    disabled={!!feedback} />
                {/each}
              {:else}
                <textarea class="lv-input lv-textarea" class:lv-textarea--ruled={shortLinedPaper} placeholder={q.type === "short" ? t("session.shortPlaceholder") : t("session.fillPlaceholder")} aria-label={t("session.guide." + q.type)}
                  value={feedback?.myAnswer ?? currentDraft}
                  oninput={(e) => { draftLive = (e.target as HTMLTextAreaElement).value; session.setDraft(q.id, draftLive); }}
                onchange={(e) => trailInput(q.id, (e.target as HTMLTextAreaElement).value)}
                  disabled={!!feedback}></textarea>
                {#if q.type === "short"}
                  {@const words = countWordsAndCharacters(feedback?.myAnswer ?? currentDraft ?? "")}
                  <div class="lv-row" style="margin:4px 0 0;font-size:var(--lv-font-size-caption);justify-content:space-between;align-items:center">
                    <span class="lv-muted">
                      字数统计：<strong class="num">{words.examWords}</strong> 字（中文 {words.chineseChars} · 英文 {words.englishWords} · {words.paragraphs} 段）
                    </span>
                    <div class="lv-row" style="margin:0;gap:6px">
                      <button type="button" class="lv-btn sm lv-btn--ghost" style="padding:1px 6px;font-size:11px" class:acc={shortLinedPaper} onclick={() => { shortLinedPaper = !shortLinedPaper; writeLocal("lv-exam/lined-paper", shortLinedPaper ? "1" : "0"); }} title="切换横线稿纸视觉背景">
                        <Icon name="file-text" size={11} /> {shortLinedPaper ? "纯白底" : "横线纸"}
                      </button>
                      <button type="button" class="lv-btn sm lv-btn--ghost" style="padding:1px 6px;font-size:11px" onclick={() => (paperGridModalOpen = !paperGridModalOpen)} title={t("session.gridPreview")}>
                        <Icon name="grid" size={11} /> {t("session.gridPreview")}
                      </button>
                      {#if words.examWords >= 200}
                        <span class="lv-chip sm lv-chip--grn num">字数充足</span>
                      {:else if words.examWords > 0}
                        <span class="lv-chip sm num">作答中</span>
                      {/if}
                    </div>
                  </div>
                  {#if paperGridModalOpen}
                    {@const gridModel = generatePaperGrid(feedback?.myAnswer ?? currentDraft ?? "", { columns: 20 })}
                    <div class="lv-card" style="margin:8px 0;padding:10px 12px;background:var(--lv-surface-2);border-left:3px solid var(--lv-accent)">
                      <div class="lv-row" style="justify-content:space-between;align-items:center;margin-bottom:6px">
                        <b style="font-size:12px">📝 考场 20×20 规范作文答题纸模拟（已占 {gridModel.totalCellsOccupied} 格 · {gridModel.totalRows} 行）</b>
                        <button type="button" class="lv-btn sm lv-btn--ghost" onclick={() => (paperGridModalOpen = false)}>✕</button>
                      </div>
                      <div style="display:flex;flex-direction:column;gap:2px;overflow-x:auto;padding:4px;background:var(--lv-surface);border:1px solid var(--lv-border);max-height:200px">
                        {#each gridModel.rows as r (r.rowNumber)}
                          <div style="display:flex;gap:2px;align-items:center">
                            <span class="lv-muted num" style="width:24px;font-size:9px;text-align:right;flex-shrink:0">{r.rowNumber * 20}</span>
                            {#each r.cells as c (c.cellIndex)}
                              <div style="width:18px;height:20px;border:1px solid color-mix(in srgb, var(--lv-red) 30%, transparent);display:flex;align-items:center;justify-content:center;font-size:12px;font-family:serif;background:var(--lv-surface)">
                                {c.char || ""}
                              </div>
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

            {#if feedback}
              <div class="lv-feedback" role="status" aria-live="polite" class:good={feedback.verdict === "correct"}>
                <div class="lv-row" style="margin:0;gap:var(--lv-space-2);align-items:center;flex-wrap:wrap">
                  <span>
                    {q.type === "short" && feedback.myAnswer ? t("session.shortSaved") : feedback.verdict === "correct" ? t("session.correct") : feedback.verdict === "wrong" ? t("session.wrongAns") : t("session.skipped")}
                  </span>
                  {#if feedback.verdict === "wrong"}
                    <span class="lv-chip lv-chip--acc num" style="font-weight:var(--lv-font-weight-bold);font-size:var(--lv-font-size-md)">{q.answer}</span>
                    {#if feedback.myAnswer}
                      <span class="lv-muted" style="margin-left:4px">（{t("session.myAnswer")}: <b class="num" style="color:var(--lv-red)">{feedback.myAnswer}</b>）</span>
                    {/if}
                  {/if}
                  <!-- 44-09：撤销作答小胶囊（支持快捷键 Ctrl+Z 或 u） -->
                  <button type="button" class="lv-btn sm lv-btn--ghost" style="margin-left:auto" onclick={undoRecentSubmit} title={t("session.undoTip")}>
                    <Icon name="rotate" size={11} /> {t("session.undo")}
                  </button>
                  {#if confidenceSel}<span class="lv-chip num">{t("confidence.recorded")}{t("confidence." + confidenceSel)}</span>{/if}
                </div>
              </div>
              {#if q.type === "short"}<div class="lv-analysis"><b>{t("session.referenceAnswer")}</b><div>{q.answer}</div></div>{/if}
              {#if q.type === "short" && currentRubric && rubricScore}
                <!-- 55-05 主观题逐采分点自评：未评项不计入分母、不折成 0；全部评完才给最终自评分 -->
                <div class="lv-card" style="margin:10px 0;padding:var(--lv-space-3) var(--lv-space-4)">
                  <div class="lv-row" style="justify-content:space-between;align-items:center;margin:0 0 8px;flex-wrap:wrap;gap:var(--lv-space-2)">
                    <b style="font-size:var(--lv-font-size-body-compact)"><Icon name="target" size={13} /> {t("rubric.title")}</b>
                    <button type="button" class="lv-btn sm lv-btn--ghost" onclick={autoAlignRubric} title="比对学员输入内容智能识别采分点，一键预填自评分">
                      <Icon name="sparkles" size={12} /> {t("rubric.autoAlign")}
                    </button>
                    <span class="lv-muted" style="font-size:var(--lv-font-size-caption)">{t("rubric.notOfficial")}</span>
                  </div>
                  {#if currentRubricDrifted}
                    <!-- 作者改 rubric 后历史自评分如实标注漂移，不静默重算 -->
                    <p class="lv-chip lv-chip--amb num" role="status" style="margin:0 0 8px"><Icon name="pencil" size={11} /> {t("rubric.driftNote")}</p>
                  {/if}
                  {#each currentRubric.criteria as c (c.id)}
                    <div class="lv-row" style="margin:6px 0;align-items:flex-start;flex-wrap:wrap;gap:var(--lv-space-2)">
                      <span class="lv-chip num" style="flex:0 0 auto">{Math.round(c.weight * 100)}%</span>
                      <span style="flex:1;min-width:140px;font-size:var(--lv-font-size-sm)">{c.label}{#if c.example}<span class="lv-muted"> · {c.example}</span>{/if}</span>
                      <div class="lv-row" style="margin:0;gap:var(--lv-space-1)">
                        {#each DEFAULT_RUBRIC_LEVELS as lvl (lvl.key)}
                          <button type="button" class="lv-chip" class:acc={rubricRatings[c.id] === lvl.key}
                            aria-pressed={rubricRatings[c.id] === lvl.key}
                            onclick={() => { rubricRatings = { ...rubricRatings, [c.id]: lvl.key }; rubricSaved = false; }}>
                            {t("rubric.level." + lvl.key)}
                          </button>
                        {/each}
                        <button type="button" class="lv-chip" class:amb={rubricRatings[c.id] === "unknown"}
                          aria-pressed={rubricRatings[c.id] === "unknown"}
                          title={t("rubric.unknownTip")}
                          onclick={() => { rubricRatings = { ...rubricRatings, [c.id]: "unknown" }; rubricSaved = false; }}>
                          {t("rubric.level.unknown")}
                        </button>
                      </div>
                    </div>
                  {/each}
                  <div class="lv-row" style="margin:8px 0 0;align-items:center;gap:var(--lv-space-2);flex-wrap:wrap">
                    {#if rubricScore.complete}
                      <span class="lv-chip lv-chip--acc num" style="font-weight:700">{t("rubric.finalScore").replace("{s}", String(rubricScore.finalScore)).replace("{f}", String(rubricScore.fullScore))}</span>
                    {:else}
                      <span class="lv-chip lv-chip--amb num">{t("rubric.partialScore").replace("{e}", String(rubricScore.earned)).replace("{m}", String(rubricScore.ratedMax)).replace("{n}", String(rubricScore.unratedCount))}</span>
                    {/if}
                    {#if rubricEvalResult}
                      <span class="lv-chip lv-chip--grn num" title="智能识别预估分">AI 对齐: {rubricEvalResult.estimatedScore}/{rubricEvalResult.fullScore} ({rubricEvalResult.matchRatio}%)</span>
                    {/if}
                    <button type="button" class="lv-btn sm lv-btn--ghost" disabled={rubricSaveBusy || rubricSaved} onclick={() => void recordRubricAssessment()} aria-busy={rubricSaveBusy}>
                      <Icon name="save" size={12} /> {rubricSaveBusy ? "…" : rubricSaved ? t("rubric.recorded") : t("rubric.record")}
                    </button>
                    <button type="button" class="lv-btn sm lv-btn--ghost" onclick={exportCurrentRubricCsv}><Icon name="export" size={12} /> CSV</button>
                    {#if recordedRubricSnapshot && !currentRubricDrifted}
                      <span class="lv-muted" style="font-size:var(--lv-font-size-caption)">{recordedRubricSnapshot.complete ? t("rubric.hasRecordedFinal").replace("{s}", String(recordedRubricSnapshot.finalScore ?? 0)).replace("{f}", String(recordedRubricSnapshot.fullScore)) : t("rubric.hasRecordedPartial").replace("{n}", String(recordedRubricSnapshot.unratedCount))}</span>
                    {/if}
                  </div>
                </div>
              {/if}
              {#if q.analysis}<div class="lv-analysis">{q.analysis}</div>{/if}
              {#if feedback.verdict === "wrong"}
                <div class="lv-row lv-session-reason-row" style="margin:10px 0;gap:var(--lv-space-compact);align-items:center;flex-wrap:wrap">
                  <div class="lv-session-dock" role="group" aria-label={t("session.reason")}>
                    <span class="lv-chip" style="color:var(--lv-text-3);cursor:default">{t("session.reason")}:</span>
                    {#each ["careless", "unknown", "trap"] as r, ri (ri)}
                      <button
                        type="button"
                        class="lv-chip lv-reason-btn"
                        class:acc={savedReason === r}
                        aria-pressed={savedReason === r}
                        title={t("entry.days") === "天" ? `快捷键 ${ri + 1}` : `Key ${ri + 1}`}
                        onclick={async () => { await app?.saveWrongReason(q.id, r as any); savedReason = r; }}
                      >
                        <span class="lv-reason-key">{ri + 1}</span>
                        {savedReason === r ? "✓ " : ""}{t("reason." + r)}
                      </button>
                    {/each}
                  </div>
                </div>
              {/if}
            {/if}
            {#if !feedback}
              <div class="lv-row" style="margin:6px 0 10px;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
                <div class="lv-session-dock" role="group" aria-label={t("confidence.before")}>
                  <span class="lv-chip" style="color:var(--lv-text-3);cursor:default">{t("confidence.before")}</span>
                  {#each ["sure", "fuzzy", "guess"] as c, _i (_i)}
                    <button type="button" class="lv-chip" class:acc={confidenceSel === c} aria-pressed={confidenceSel === c} title={`Key ${["sure", "fuzzy", "guess"].indexOf(c) + 1}`} onclick={() => confidenceSel = c as "sure" | "fuzzy" | "guess"}>
                      <span class="lv-reason-key">{_i + 1}</span> {t("confidence." + c)}
                    </button>
                  {/each}
                </div>
                <span class="lv-chip num" class:lv-chip--amb={qTimeoutS > 0 && qElapsedS >= qTimeoutS * 0.8 && qElapsedS < qTimeoutS} class:lv-chip--red={qTimeoutS > 0 && qElapsedS >= qTimeoutS} class:lv-pulse={qTimeoutS > 0 && qElapsedS >= qTimeoutS} title={qTimeoutS > 0 ? t("session.timeoutHint").replace("{n}", String(qTimeoutS)) : ""}>
                  <Icon name="clock" size={12} /> {qElapsedS}s
                </span>
              </div>
            {/if}

            <div class="lv-row lv-answer-actions">
              {#if !feedback}
                <button class="lv-btn lv-btn--primary" onclick={submitAnswer} disabled={!canSubmitAnswer}>
                  {q.type === "multiple" && selected.length > 0 ? t("session.submitSelected").replace("{n}", String(selected.length)) : t("session.submit")}
                </button>
                <button class="lv-btn lv-btn--ghost" onclick={requestHint} disabled={explainBusy}><Icon name="bulb" size={14} /> {hintButtonLabel(q)}</button>
                {#if q.type === "fill" || q.type === "short"}
                  <button class="lv-btn lv-btn--ghost" onclick={() => { submitAnswer(); }}>{t("session.skip")}</button>
                {/if}
              {:else}
                <button class="lv-btn lv-btn--primary" onclick={nextQuestion}>{t("session.next")} →</button>
                {#if feedback.verdict === "wrong"}
                  <button class="lv-btn" onclick={() => void drillVariantFor(q)} title={t("session.drillVariantTip")}><Icon name="layers" size={15} /> {t("session.drillVariant")}</button>
                  <button class="lv-btn" onclick={() => void traceMotherQuestion(q)} title="寻找同考点下最基础的原理母题从头筑基"><Icon name="compass" size={15} /> {t("wrongbook.traceMother")}</button>
                  <button class="lv-btn" onclick={toCard}><Icon name="layers" size={16} /> {t("memory.toCard")}</button>
                  {#if cardResult}<span class="lv-muted">{cardResult}</span>{/if}
                  <button class="lv-btn" onclick={() => explainCurrent("explain")} disabled={explainBusy}><Icon name="sparkles" size={16} /> {explainBusy ? "…" : t("explain.ask")}</button>
                  <button class="lv-btn" onclick={requestHint} disabled={explainBusy}><Icon name="bulb" size={14} /> {hintButtonLabel(q)}</button>
                  <button class="lv-btn" onclick={() => explainCurrent("socratic")} disabled={explainBusy}><Icon name="message" size={14} /> {t("explain.socratic")}</button>
                {/if}
              {/if}
              {#if leakPending && session?.current && explainQid === session.current.id}
                <div class="lv-analysis lv-explain">
                  ⚠ {t("explain.hintLeak").replace("{r}", leakPending.reasons)}
                  <div class="lv-row">
                    <button class="lv-btn sm" onclick={viewLeakedHint}>{t("explain.hintLeakView")}</button>
                    <button class="lv-btn sm" onclick={() => (leakPending = null)}>{t("explain.hintLeakDismiss")}</button>
                  </div>
                </div>
              {/if}
              {#if explainText && session?.current && explainQid === session.current.id}
                <div class="lv-analysis lv-explain">{explainText}</div>
                <div class="lv-row">
                  {#if explainSavedQid === q.id}
                    <span class="lv-muted" role="status">✓ {t("explain.saved")}</span>
                  {:else}
                    <button class="lv-btn sm" onclick={saveExplain} disabled={explainSaveBusy} aria-busy={explainSaveBusy}><Icon name="pin" size={13} /> {explainSaveBusy ? "…" : explainSaveError ? t("explain.retrySave") : t("explain.save")}</button>
                  {/if}
                  <button class="lv-btn sm" onclick={requestHint} disabled={explainBusy}><Icon name="bulb" size={14} /> {hintButtonLabel(q)}</button>
                  <button class="lv-btn sm" onclick={() => explainCurrent("socratic")} disabled={explainBusy}><Icon name="message" size={14} /> {t("explain.socratic")}</button>
                </div>
                {#if explainSaveErrorQid === q.id && explainSaveError}<div class="lv-error" role="alert">{t("explain.saveFailed").replace("{message}", explainSaveError)}</div>{/if}
                <div class="lv-row">
                  <input class="lv-input" style="flex:1;min-width:160px" placeholder={t("explain.followUp")}
                    bind:value={explainFollowUp}
                    onkeydown={(e) => !e.isComposing && e.keyCode !== 229 && e.key === "Enter" && sendFollowUp()} />
                  <button class="lv-btn sm" onclick={sendFollowUp} disabled={explainBusy || !explainFollowUp.trim()}>{t("explain.send")}</button>
                </div>
              {/if}
            </div>
            {#if reasonPromptQid === q.id && !feedback}
              <div class="lv-row lv-reason" role="group" aria-label={t("trail.reasonTitle")}>
                <span class="lv-muted" style="font-size:var(--lv-font-size-caption)">{t("trail.reasonTitle")}</span>
                <button class="lv-chip" onclick={() => setEditReason(q.id, "unsure")}>{t("trail.reason.unsure")}</button>
                <button class="lv-chip" onclick={() => setEditReason(q.id, "evidence")}>{t("trail.reason.evidence")}</button>
                <button class="lv-chip" onclick={() => setEditReason(q.id, "misclick")}>{t("trail.reason.misclick")}</button>
                <button class="lv-chip lv-btn--ghost" onclick={() => (reasonPromptQid = "")}>{t("trail.reason.skip")}</button>
              </div>
            {/if}
          </div>
          </div>
          <aside class="lv-session-side">
            <div class="lv-card lv-side-card">
              <b class="lv-side-title">{t("session.side.q")}</b>
              <div class="lv-side-rows">
                {#if q.kp}<span class="lv-chip"><Icon name="layers" size={11} /> {q.kp}</span>{/if}
                {#if q.source}<span class="lv-chip num" title={t("manual.source")}>{q.source}</span>{/if}
                {#if q.difficulty}<span class="lv-chip num">★ {q.difficulty}</span>{/if}
                {#if q.score}<span class="lv-chip num">{t("manual.score")} {q.score}</span>{/if}
                {#if curQStats && curQStats.attempts > 0}
                  <span class="lv-chip num" title={t("browse.usage").replace("{a}", String(curQStats.attempts)).replace("{c}", String(Math.round((curQStats.correct / curQStats.attempts) * 100)))}>
                    <Icon name="chart" size={11} /> {curQStats.attempts} · {Math.round((curQStats.correct / curQStats.attempts) * 100)}%
                  </span>
                {/if}
              </div>
            </div>
            <div class="lv-card lv-side-card">
              <b class="lv-side-title">{t("session.side.kbd")}</b>
              <div class="lv-row lv-muted" style="font-size:var(--lv-font-size-label);gap:var(--lv-space-compact);flex-wrap:wrap;margin:0">
                <span class="lv-kbd">A</span>-<span class="lv-kbd">J</span> {t("session.choose")} ·
                <span class="lv-kbd">1</span>-<span class="lv-kbd">3</span> {t("confidence.shortcut")} ·
                <span class="lv-kbd">Enter</span> {t("session.submit")} ·
                <span class="lv-kbd">J</span>/<span class="lv-kbd">K</span> {t("session.next")}/{t("session.kbdPrev")} ·
                <span class="lv-kbd">E</span> {t("session.kbdFav")} ·
                <span class="lv-kbd">Esc</span> {t("session.exit")}
              </div>
            </div>
          </aside>
        </div>
      {/if}
    {/if}
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
      onjumpSource={jumpToSource}
      onttsSpeak={(text, opt) => ttsSpeak(text, opt)}
      onretryForgot={retryForgotRecite}
      onforgotToCard={reciteForgotToCard}
      onforgotToActions={reciteForgotToActions}
      onopenReport={() => plugin.openReport?.()}
      onstartNextRecite={() => startRecite()}
      onreveal={revealRecite}
      onrateSelf={(r) => void rateSelf(r)}
      ondismissSpeechEval={() => speechEvalResult = null}
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
      bind:wbSortMode
      {filteredWrongQueue}
      {archivedWrongList}
      {eliminatedWrongList}
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
    />
  {:else if view === "manual"}
    <ManualStudioView
      bind:mType
      bind:mStem
      bind:mOptions
      bind:mAnswer
      bind:mAnalysis
      bind:mKp
      bind:mSource
      bind:mGroup
      bind:mSpecOpen
      bind:mSpecUnit
      bind:mSpecAbsTol
      bind:mSpecRelPct
      bind:mSpecAltUnits
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
    />
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
      onclearQueue={() => { aiQueue = []; void persistAiQueue(); }}
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
    <!-- ===== S3 浏览 ===== -->
    <div class="lv-pad">
      <div class="lv-screen-head"><span class="lv-eyebrow">{t("head.browse.eyebrow")}</span><h1 class="lv-h1">{t("head.browse.title")}</h1><p>{t("head.browse.desc")}</p></div>
      <!-- 工具条分行（原型密度规则）：筛选行（搜索/结构化筛选）与工具行（动作 chip）分离，高度节奏一致 -->
      <div class="lv-row" style="margin:0 0 8px;gap:8px">
        <input class="lv-input" style="flex:1;min-width:180px" placeholder={t("browse.searchPlaceholder")} bind:value={searchText} />
        <!-- 65-01 lite：结构化筛选（题型/来源/仅错题），与搜索词叠加 -->
        <select class="lv-select" style="max-width:115px" bind:value={filterType} onchange={() => (browseLimit = 200)}>
          <option value="">{t("browse.fAnyType")}</option>
          {#each ["single", "multiple", "judge", "fill", "short", "material"] as tp, _i (_i)}
            <option value={tp}>{t("qtype." + tp)}</option>
          {/each}
        </select>
        <select class="lv-select" style="max-width:115px" bind:value={filterStatus} onchange={() => (browseLimit = 200)} title={t("browse.filterStatus")}>
          <option value="">{t("browse.filterStatusAll")}</option>
          <option value="published">{t("lifecycle.published")}</option>
          <option value="review">{t("lifecycle.review")}</option>
          <option value="draft">{t("lifecycle.draft")}</option>
          <option value="deprecated">{t("lifecycle.deprecated")}</option>
        </select>
        {#if sourceOptions.length}
          <select class="lv-select" style="max-width:130px" bind:value={filterSource} onchange={() => (browseLimit = 200)} title={t("browse.fSource")}>
            <option value="">{t("browse.fAnySource")}</option>
            {#each sourceOptions as src, _i (_i)}<option value={src}>{src}</option>{/each}
          </select>
        {/if}
        <select class="lv-select" style="max-width:115px" bind:value={filterDays} title={t("browse.fDaysTip")}>
          <option value={0}>{t("browse.fAnyDay")}</option>
          <option value={1}>{t("browse.fToday")}</option>
          <option value={7}>{t("browse.f7")}</option>
          <option value={30}>{t("browse.f30")}</option>
        </select>
      </div>
      <div class="lv-row" style="margin:0 0 10px;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
        <div class="lv-row" style="margin:0;gap:8px;flex-wrap:wrap">
          <div class="lv-session-dock" role="group" aria-label="状态快速过滤">
            <button class="lv-chip" class:acc={filterWrong} onclick={() => (filterWrong = !filterWrong)} title={t("browse.fWrongTip")}>✕ {t("browse.fWrong")}</button>
            <button class="lv-chip" class:acc={filterDispute} class:lv-chip--red={filterDispute} onclick={() => (filterDispute = !filterDispute)} title={t("browse.fDisputeTip")}><Icon name="alert-triangle" size={12} /> {t("browse.fDispute")}</button>
            <button class="lv-chip" class:acc={filterHelp} onclick={() => (filterHelp = !filterHelp)} title={t("browse.fHelpTip")}><Icon name="bulb" size={12} /> {t("browse.fHelp")}</button>
            <button class="lv-chip" class:acc={favOnly} onclick={() => favOnly = !favOnly}><Icon name="star" size={12} /> {t("browse.favOnly")}</button>
          </div>
          <div class="lv-session-dock" role="group" aria-label="考点标签过滤">
            <button class="lv-chip" class:acc={filterUserTag === "star"} onclick={() => (filterUserTag = filterUserTag === "star" ? "" : "star")} title={t("session.tagStar")}>⭐️ {t("session.tagStar")}</button>
            <button class="lv-chip" class:acc={filterUserTag === "trap"} onclick={() => (filterUserTag = filterUserTag === "trap" ? "" : "trap")} title={t("session.tagTrap")}>⚠️ {t("session.tagTrap")}</button>
            <button class="lv-chip" class:acc={filterUserTag === "doubt"} onclick={() => (filterUserTag = filterUserTag === "doubt" ? "" : "doubt")} title={t("session.tagDoubt")}>❓ {t("session.tagDoubt")}</button>
          </div>
        </div>
        <div class="lv-row" style="margin:0;gap:6px">
          {#if smartViews.length}
            <select class="lv-select" style="max-width:140px" bind:value={selectedView} onchange={() => void applyNamedView(selectedView)} disabled={smartViewBusy || smartViewLoadBusy || smartViewLoadFailed}>
              <option value="">{t("view.pick")}</option>
              {#each smartViews as v, _i (_i)}<option value={v.name}>{v.name}</option>{/each}
            </select>
            <button class="lv-btn sm lv-btn--ghost" title={t("view.delete")} aria-label={t("view.delete")} aria-busy={smartViewBusy} disabled={!selectedView || smartViewBusy || smartViewLoadBusy || smartViewLoadFailed} onclick={() => void deleteNamedView()}><Icon name="trash" size={13} /></button>
          {/if}
          <button class="lv-btn sm lv-btn--ghost" title={t("view.saveTitle")} aria-busy={smartViewBusy} disabled={smartViewBusy || smartViewLoadBusy || smartViewLoadFailed || !activeBankId} onclick={() => void saveCurrentView()}><Icon name="save" size={13} /> {smartViewBusy ? "…" : t("view.save")}</button>
        </div>
      </div>
          {#if smartViewError}<div class="lv-error" role="alert" style="display:flex;align-items:center;justify-content:space-between;gap:var(--lv-space-relaxed);overflow-wrap:anywhere"><span>{smartViewError}</span>{#if smartViewLoadFailed}<button class="lv-btn sm" disabled={smartViewLoadBusy} aria-busy={smartViewLoadBusy} onclick={() => void loadSmartViews()}>{smartViewLoadBusy ? "…" : t("view.retryLoad")}</button>{/if}</div>{/if}
      <!-- 工具行收敛：高频（章节树/批量编辑）内联，维护面板与导出打印入「更多」菜单；面板开启时按钮出点标 -->
      <div class="lv-row" style="margin:0 0 10px;gap:var(--lv-space-2) 8px">
        <button class="lv-btn lv-btn--ghost lv-mobile-back" onclick={() => view = "entry"}>← {t("mode.practice")}</button>
        <span class="lv-chip num">{shownQuestions.length}/{questions.length} {t("browse.count")}</span>
        {#if shownQuestions.length > 0}
          <button class="lv-btn sm lv-btn--primary" onclick={startFilteredFocusDrill} title="将当前筛选出的这批题目直接发起专注特训">
            <Icon name="play" size={13} /> {t("browse.drillFiltered").replace("{n}", String(shownQuestions.length))}
          </button>
        {/if}
        <button class="lv-chip" class:acc={sectionOpen} onclick={() => void toggleSectionTree()}><Icon name="file-text" size={13} /> {t("browse.sectionTree")}</button>
        <button class="lv-chip" class:acc={batchMode} onclick={() => { batchMode = !batchMode; if (!batchMode) selectedIds = {}; }}>{t("batch.mode")}</button>
        <div class="lv-more" bind:this={moreRoot}>
          <button class="lv-chip" class:acc={kpOpen || healthOpen || errataOpen || paperOpen} aria-haspopup="menu" aria-expanded={moreOpen}
            onclick={() => toggleMore()}>
            <Icon name="menu" size={13} /> {t("browse.more")}{#if kpOpen || healthOpen || errataOpen || paperOpen}<i class="lv-more-dot" aria-hidden="true"></i>{/if}
          </button>
          {#if moreOpen}
            <div class="lv-more-pop" role="menu" tabindex="-1" bind:this={morePop}
              onkeydown={(e) => { if (e.key === "Escape") { e.stopPropagation(); moreOpen = false; } }}>
              <button role="menuitemcheckbox" aria-checked={kpOpen} onclick={() => { kpOpen = !kpOpen; moreOpen = false; }}><Icon name="compass" size={14} /> {t("kp.title")}</button>
              <button role="menuitemcheckbox" aria-checked={healthOpen} onclick={() => { healthOpen = !healthOpen; moreOpen = false; }}><Icon name="activity" size={14} /> {t("health.title")}</button>
              <button role="menuitemcheckbox" aria-checked={errataOpen} onclick={() => { errataOpen = !errataOpen; moreOpen = false; }}><Icon name="file-text" size={14} /> {t("errata.title")}</button>
              <button role="menuitemcheckbox" aria-checked={paperOpen} onclick={() => { paperOpen = !paperOpen; moreOpen = false; }}><Icon name="paperclip" size={14} /> {t("paper.title")}</button>
              <div class="lv-more-sep" role="separator"></div>
              <button role="menuitem" title={t("browse.exportCsvTitle")} onclick={() => { exportBankCsv(); moreOpen = false; }}><Icon name="export" size={14} /> CSV</button>
              <button role="menuitem" title={t("print.qSheetTip")} onclick={() => { printQuestionSheet(); moreOpen = false; }}><Icon name="printer" size={14} /> {t("print.qSheet")}</button>
              <button role="menuitem" title={t("print.aSheetTip")} onclick={() => { printAnswerSheet(); moreOpen = false; }}><Icon name="printer" size={14} /> {t("print.aSheet")}</button>
              <button role="menuitem" title={t("print.cardTip")} onclick={() => { printAnswerCard(); moreOpen = false; }}><Icon name="printer" size={14} /> {t("print.card")}</button>
              <button role="menuitem" title="导出包含题目、答案、考点、难度、采分点与破题教学点拨的教师讲义卷" onclick={() => { void printTeacherLectureSheet(); moreOpen = false; }}><Icon name="book" size={14} /> {t("mock.printTeacher")}</button>
              <button role="menuitem" title="导出全库试题实测难度、区分度与死干扰项诊断报告" onclick={() => { void exportItemQualityReport(); moreOpen = false; }}><Icon name="chart" size={14} /> {t("health.itemQualityAudit")}</button>
              <div class="lv-more-sep" role="separator"></div>
              <button role="menuitem" title="导出为 Moodle/学习通标准试题格式" onclick={() => { void exportGiftFormat(); moreOpen = false; }}><Icon name="export" size={14} /> {t("format.exportGift")}</button>
              <button role="menuitem" title="导出为 Anki / FSRS 问答闪卡卡包" onclick={() => { void exportAnkiFormat(); moreOpen = false; }}><Icon name="layers" size={14} /> {t("format.exportAnki")}</button>
              <button role="menuitem" title="导出为标准排版 Markdown 试题手册" onclick={() => { void exportMdDocFormat(); moreOpen = false; }}><Icon name="file-text" size={14} /> {t("format.exportMdDoc")}</button>
            </div>
          {/if}
        </div>
      </div>
      {#if sectionSel}
        <div class="lv-row" style="margin:4px 0">
          <span class="lv-chip acc"><Icon name="file-text" size={12} /> {sectionLabel}</span>
          <button class="lv-btn sm lv-btn--ghost" onclick={() => { sectionSel = null; }}>{t("browse.sectionClear")}</button>
        </div>
      {/if}
      <BrowseMaintenanceDrawers
        {t}
        {app}
        {questionMap}
        {sectionOpen}
        {sectionBusy}
        {sectionTree}
        bind:sectionSel
        bind:kpOpen
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
        {paperOpen}
        bind:paperText
        {paperPreview}
        {paperBusy}
        {paperNote}
        {errataOpen}
        {errataBusy}
        {errataErrors}
        {errataPlan}
        {errataNote}
        {batchMode}
        {selectedIds}
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
        bind:filterType
        onsetFilterSource={(s) => { filterSource = s; }}
        bind:activeClusterIndex
        {mergeBusy}
        {orphanDiag}
        {filterOrphanKind}
        {batchList}
        {rollbackBusy}
        onsearchKp={(kp) => setSearch(kp)}
        onpreviewKpMerge={previewKpMerge}
        onpreviewKpFill={previewKpFill}
        onapplyKpPlan={(plan) => void applyKpPlan(plan)}
        ondownloadSyllabusGaps={downloadSyllabusGaps}
        onexportSyllabusAudit={exportSyllabusAudit}
        onpreviewSyllabus={previewSyllabus}
        onimportSyllabus={() => void importSyllabus()}
        onapplyPaperRecall={() => void applyPaperRecall()}
        onexportErrataTemplate={exportErrataTemplate}
        onerrataFile={onErrataFile}
        onapplyErrata={() => void applyErrata()}
        onselectAllCurrentPage={selectAllCurrentPage}
        onclearSelection={clearSelection}
        onbatchConvertToCards={() => void batchConvertToCards()}
        onprintSelectedQuestions={printSelectedQuestions}
        onprintSelectedTeacherPaper={printSelectedTeacherPaper}
        onprintSelectedHomeworkSheet={printSelectedHomeworkSheet}
        onapplyBatch={(isUndo) => applyBatch(isUndo)}
        onpreviewBatch={previewBatch}
        ontoggleCluster={(idx) => toggleCluster(idx)}
        onmergeClusterToTarget={(q, ids) => mergeClusterToTarget(q as Question & { blockId: string }, ids)}
        ondrillOrphanKind={(k) => drillOrphanKind(k)}
        ondownloadHealthCsv={downloadHealthCsv}
        onundoBatch={(batch) => undoBatch(batch)}
      />

      {#if questionsError}
        <div class="lv-error">{questionsError}</div>
      {:else if !questions.length}
        <div class="lv-empty"><div class="lv-empty-icon"><Icon name="file" size={24} /></div><b>{t("browse.title")}</b><p class="lv-muted">{t("browse.empty")}</p></div>
      {:else if !shownQuestions.length}
        <!-- 筛选无结果的独立空态：给原因与出路，不留空白区（规范 v6 状态完备） -->
        <div class="lv-empty">
          <div class="lv-empty-icon"><Icon name="search" size={24} /></div>
          <b>{t("browse.noMatch")}</b>
          <p class="lv-muted">{t("browse.noMatch.desc")}</p>
          <div class="lv-row" style="justify-content:center;margin-top:14px">
            <button class="lv-btn lv-btn--primary sm" onclick={clearBrowseFilters}>{t("browse.clearFilters")}</button>
          </div>
        </div>
      {:else}
        {#if filterOrphanKind}
          <div class="lv-row" style="margin:6px 0;align-items:center">
            <span class="lv-chip lv-chip--red">
              <Icon name="alert-triangle" size={12} />
              {t("health.orphanFilter").replace("{label}", t("health.orphan." + filterOrphanKind)).replace("{n}", String(filteredQuestions.length))}
            </span>
            <button class="lv-btn sm lv-btn--ghost" onclick={clearOrphanFilter}>{t("health.orphanClear")}</button>
          </div>
        {/if}
        {#each shownQuestions as q (q.id)}
          <div class="lv-card lv-qrow" class:sel={batchMode && !!selectedIds[q.id]} class:active-peek={!batchMode && expandedId === q.id}>
            <button type="button" class="lv-qrow-head"
              aria-pressed={batchMode ? !!selectedIds[q.id] : undefined}
              aria-expanded={!batchMode ? expandedId === q.id : undefined}
              aria-describedby={`lv-qrow-stem-${q.id}`}
              onclick={() => toggleBrowseQuestion(q.id)}>
              {#if batchMode}
                <span class="lv-chip num" class:acc={!!selectedIds[q.id]}>{selectedIds[q.id] ? "☑" : "☐"}</span>
              {/if}
              <span class="lv-chip lv-chip--acc">{t("qtype." + q.type)}</span>
              {#if q.kp}<span class="lv-chip">{q.kp}</span>{/if}
              {#if q.source}<span class="lv-muted lv-qrow-src">{q.source}</span>{/if}
              {#if q.status && q.status !== "published"}
                <span class="lv-chip sm" class:lv-chip--amb={q.status === "draft"} class:lv-chip--acc={q.status === "review"} style={q.status === "deprecated" ? "opacity:0.6" : undefined}>
                  {t("lifecycle." + q.status, LIFECYCLE_LABELS[q.status])}
                </span>
              {/if}
              {#if isQuestionDisputed(q)}
                <span class="lv-chip lv-chip--red sm" title={q.dispute?.note ?? ""}>
                  ⚠️ {t("dispute.badge")} · {t("dispute.reason." + q.dispute?.reason)}
                </span>
              {/if}
              {#if !batchMode && expandedId === q.id}
                <span class="lv-chip lv-chip--acc num" style="margin-left:auto">{t("browse.viewing", "查看中 ▾")}</span>
              {/if}
            </button>
            <div class="lv-qrow-stem" id={`lv-qrow-stem-${q.id}`}>{q.stem}</div>
          </div>
        {/each}
        {#if activePeekQuestion && activePeekQuestion.blockId}
          <QuestionPeekDrawer
            q={activePeekQuestion as Question & { blockId: string }}
            bind:drawerEl={peekDrawerEl}
            status={getQuestionLifecycle(activePeekQuestion)}
            links={app?.kernelOnline ? backlinkCache.get(activePeekQuestion.blockId) : undefined}
            {currentPeekIndex}
            shownQuestionsCount={shownQuestions.length}
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
            {peekHideAnswer}
            {app}
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
            {LIFECYCLE_LABELS}
            {isQuestionDisputed}
            {isStubbornWrong}
            {getStubbornRemediation}
            {isAttemptVersionDrifted}
            {removeChoiceOption}
            {summarizeLoad}
            onclose={closePeekDrawer}
            onkeydown={onPeekDrawerKeydown}
            onprev={prevPeekQuestion}
            onnext={nextPeekQuestion}
            ontoggleFav={(q) => void toggleFavQuestion(q)}
            onopenInSiYuan={(rid, bid) => openInSiYuan(rid, bid)}
            onttsSpeak={(text, opt) => ttsSpeak(text, opt)}
            onsaveEdit={(q) => void saveEdit(q)}
            oncloseEdit={closeEditForm}
            ontoggleHideAnswer={() => (peekHideAnswer = !peekHideAnswer)}
            onsnoozeWrong={(qid, days) => void snoozeWrong(qid, days)}
            onarchiveWrong={(qid) => void archiveWrong(qid)}
            onunarchiveWrong={(qid) => void unarchiveWrong(qid)}
            ontoggleItemAnalysis={(q) => toggleItemAnalysis(q)}
            ondownloadItemAnalysisCsv={(rep) => downloadItemAnalysisCsv(rep)}
            ontoggleRevisions={(qid) => void toggleRevisions(qid)}
            onloadRevisions={(qid) => void loadRevisions(qid)}
            onrestoreRevision={(q, r) => void restoreRevision(q, r)}
            ondrillSingle={(q) => void drillSingleQuestion(q)}
            onopenEditForm={(q) => openEditForm(q)}
            oncloneToManualStudio={(q) => cloneToManualStudio(q)}
            ontoggleDisputeForm={(q) => toggleDisputeForm(q)}
            onchangeLifecycle={(q, st) => void changePeekLifecycle(q, st)}
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
          />
        {/if}
        {#if hasMore}
          <button class="lv-btn" style="width:100%" onclick={() => (browseLimit += 200)}>
            {t("browse.loadMore")}（{shownQuestions.length}/{questions.length}）
          </button>
        {/if}
      {/if}
    </div>
  {:else if view === "import"}
    <ImportStudioView
      {hasBank}
      {banks}
      {importCheckpoint}
      {importBusy}
      bind:importDragOver
      bind:importSubTab
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
      onToggleClozeMode={(m) => toggleClozeMode(m)}
      onDoParseCloze={doParseCloze}
      onImportClozeQuestions={importClozeQuestions}
      onPickExcel={() => importFileInput?.click()}
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
    />
  {/if}
    </div>
    <Palette commands={paletteCommands} bind:open={paletteOpen} {t} />
    {#if view === "session" && session && !sessionDone}
      <div style="position:fixed;bottom:22px;right:22px;z-index:90">
        <button
          type="button"
          class="lv-achievement-pill"
          style="box-shadow:var(--lv-sh-pop);cursor:pointer;font-size:12px;padding:6px 14px;border-radius:9999px"
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
        onprintSelectedQuestions={printSelectedQuestions}
        onprintTeacherPaper={printSelectedTeacherPaper}
        onprintHomeworkSheet={printSelectedHomeworkSheet}
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
      onremoveBank={async (id) => {
        activeBankId = id;
        await removeActiveBank();
      }}
    />
    <ShortcutsHelpModal
      open={hotkeysHelpOpen}
      version={manifest.version}
      title={t("hotkeys.title")}
      onclose={() => hotkeysHelpOpen = false}
    />
  </div>
</div>

<style>
  .lv-pad { padding: var(--lv-space-4) 22px var(--lv-space-9); overflow: auto; }
  /* —— 会话屏右栏（原型 practice 布局：主纸面 + 条件卡） —— */
  .lv-session-grid { display: grid; grid-template-columns: minmax(0, 1fr) 248px; gap: var(--lv-space-5); align-items: start; max-width: 1040px; }
  .lv-session-grid .lv-session-head { grid-column: 1 / -1; }
  .lv-session-main { min-width: 0; }
  .lv-session-main .lv-card { max-width: 660px; box-shadow: var(--lv-sh-card), var(--lv-inset-highlight, inset 0 1px 0 transparent); border-radius: var(--lv-r-3); border: 1px solid var(--lv-border-subtle, var(--lv-border)); }
  .lv-side-card { padding: var(--lv-space-4) var(--lv-space-panel); margin-bottom: 14px; }
  .lv-side-title { display: block; font-size: var(--lv-font-size-md); font-weight: var(--lv-font-weight-semibold); margin-bottom: 10px; }
  .lv-side-rows { display: flex; flex-wrap: wrap; gap: var(--lv-space-compact); }
  @container lv-exam (max-width: 960px) { .lv-session-grid { grid-template-columns: minmax(0, 1fr); } .lv-session-side { order: 2; } }
  /* —— 入口 hero 卡（对齐原型 home 首屏；600px 下折叠单列） —— */
  .lv-entry-overview { display: grid; grid-template-columns: minmax(0, 1fr) 260px; gap: var(--lv-space-loose); align-items: stretch; margin-bottom: 18px; }
  .lv-entry-hero { display: grid; grid-template-columns: minmax(0,1fr) auto; gap: 24px; align-items: center; padding: 26px 28px; position: relative; overflow: hidden; background: linear-gradient(135deg, color-mix(in srgb, var(--lv-brand-soft) 35%, var(--lv-surface)) 0%, var(--lv-surface) 100%); border-color: color-mix(in srgb, var(--lv-brand) 20%, var(--lv-border)); border-radius: var(--lv-r-3); box-shadow: var(--lv-sh-card); }
  .lv-entry-hero::after { content: ''; position: absolute; right: -80px; top: -80px; width: 260px; height: 260px; border-radius: var(--lv-radius-round); background: radial-gradient(closest-side, color-mix(in srgb, var(--lv-accent) 12%, transparent), transparent); pointer-events: none; }
  .lv-entry-main { min-width: 0; }
  .lv-entry-reason { font-size: 22px; font-weight: var(--lv-font-weight-semibold); letter-spacing: -.4px; line-height: 1.5; margin: 10px 0; overflow-wrap: anywhere; }
  .lv-entry-num { border-left: 1px solid var(--lv-border); padding: 5px 0 5px 28px; display: flex; flex-direction: column; gap: 7px; align-self: stretch; justify-content: center; }
  .lv-entry-countwrap { display: flex; align-items: baseline; gap: var(--lv-space-2); }
  .lv-entry-count { font-size: var(--lv-font-size-display); font-weight: var(--lv-font-weight-semibold); letter-spacing: -2px; line-height: 1.05; font-variant-numeric: tabular-nums; }
  .lv-entry-unit { font-size: var(--lv-font-size-sm); color: var(--lv-text-3); }
  .lv-entry-label { font-size: var(--lv-font-size-label); letter-spacing: 0.6px; color: var(--lv-text-3); }
  .lv-entry-week { display: flex; flex-direction: column; justify-content: center; min-width: 0; padding: 20px 18px; border-radius: var(--lv-r-3); background: var(--lv-surface); border: 1px solid var(--lv-border); box-shadow: var(--lv-sh-card); }
  .lv-entry-week-head { display: flex; align-items: center; justify-content: space-between; gap: var(--lv-space-2); font-size: var(--lv-font-size-body-compact); }
  .lv-week-strip { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: var(--lv-space-1); margin: 16px 0 12px; }
  .lv-week-day { min-width: 0; display: grid; justify-items: center; gap: 5px; color: var(--lv-text-3); font-size: 10px; }
  .lv-week-count { display: grid; place-items: center; width: 28px; height: 28px; border-radius: var(--lv-radius-round); background: var(--lv-surface-2); color: var(--lv-text-2); font-size: 10px; font-variant-numeric: tabular-nums; }
  .lv-week-count.has-attempts { background: color-mix(in srgb, var(--lv-accent) var(--lv-week-fill), var(--lv-accent-soft)); color: var(--lv-accent-deep); }
  .lv-week-day.is-today .lv-week-count { box-shadow: 0 0 0 1.5px var(--lv-accent), 0 2px 6px color-mix(in srgb, var(--lv-accent) 24%, transparent); }
  .lv-week-day .today-text { color: var(--lv-accent); font-weight: 700; }
  .lv-entry-week p { margin: 0; font-size: var(--lv-font-size-label); line-height: 1.5; }
  @container lv-exam (max-width: 960px) { .lv-entry-overview { grid-template-columns: minmax(0, 1fr); } }
  /* 原型 .hero-actions：主操作在 hero 卡内部 */
  .lv-hero-actions { margin-top: 18px; }
  .lv-hero-actions .lv-btn--primary { box-shadow: var(--lv-btn-primary-shadow); }
  @container lv-exam (max-width: 600px) {
    .lv-entry-hero { grid-template-columns: minmax(0,1fr); padding: 18px; }
    .lv-entry-num { border-left: 0; border-top: 1px solid var(--lv-border); padding: 12px 0 0; flex-direction: row; align-items: baseline; gap: var(--lv-space-relaxed); justify-content: flex-start; }
  }
  .lv-center { display: flex; align-items: center; justify-content: center; min-height: 60%; }
  /* —— 视图切换（对齐原型 .subnav：文字 + 底部 2px 指示条，非按钮块） —— */
  .lv-card { background: var(--lv-surface); border: 1px solid var(--lv-border-subtle, var(--lv-border)); border-radius: var(--lv-r-3); padding: var(--lv-space-5) 22px; box-shadow: var(--lv-sh-card, var(--lv-sh-1)), var(--lv-inset-highlight, inset 0 1px 0 transparent); transition: box-shadow var(--lv-dur-view) var(--lv-ease-out), transform var(--lv-dur-micro) var(--lv-ease-out), border-color var(--lv-dur-micro) var(--lv-ease-out); }
  .lv-guard { max-width: 460px; width: 100%; }
  .lv-guard--welcome { max-width: 760px; }
  .lv-guard-kicker { display: inline-flex; align-items: center; gap: 7px; color: var(--lv-accent); font-size: var(--lv-font-size-sm); font-weight: var(--lv-font-weight-semibold); margin-bottom: 8px; }
  .lv-guard-title { font-size: 16px; font-weight: var(--lv-font-weight-bold); margin-bottom: 8px; }
  .lv-guard p { margin: 6px 0; }
  .lv-center-text { justify-content: center; }
  .lv-hint { font-size: var(--lv-font-size-sm); color: var(--lv-text-3); text-align: center; }
  .lv-guard-steps { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--lv-space-relaxed); margin: 16px 0 4px; }
  .lv-guard-step { position: relative; min-width: 0; padding: 12px 13px; border: 1px solid var(--lv-border); border-radius: var(--lv-r-2); background: var(--lv-surface-2); }
  .lv-guard-step .lv-tile-icon { width: 30px; height: 30px; }
  .lv-guard-step b { display: block; margin-top: 8px; font-size: var(--lv-font-size-body-compact); }
  .lv-guard-step > span:last-child { display: block; margin-top: 4px; color: var(--lv-text-3); font-size: var(--lv-font-size-caption); line-height: 1.55; }
  .lv-guard-sample-detail { max-width: 620px; margin: 2px auto 0; line-height: 1.55; }
  .lv-input { min-height: var(--lv-control-height-md); padding: var(--lv-component-pad-md); border-radius: var(--lv-r-2); border: 1px solid var(--lv-ctl-border); background: var(--lv-surface); color: var(--lv-text); font: inherit; font-size: var(--lv-font-size-body); flex: 1; min-width: 140px; box-shadow: var(--lv-sh-1), var(--lv-inset-subtle, inset 0 1px 0 transparent); transition: border-color var(--lv-dur-micro) var(--lv-ease-out), box-shadow var(--lv-dur-micro) var(--lv-ease-out); }
  .lv-input:hover:not(:disabled) { border-color: var(--lv-border-hover, var(--lv-accent)); }
  .lv-input:focus { border-color: var(--lv-accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--lv-accent) 18%, transparent), var(--lv-inset-subtle, inset 0 1px 0 transparent); outline: none; }
  .lv-textarea { width: 100%; min-height: 90px; resize: vertical; line-height: 1.8; padding: 12px; margin: 6px 0; }
  .lv-onboard-title { display: inline-flex; align-items: center; gap: var(--lv-space-2); }
  /* —— 首用引导三步卡（规范 v6 onboard-steps） —— */
  .lv-onboard { flex-direction: column; align-items: stretch; }
  .lv-onboard-steps { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--lv-space-loose); margin: 14px 0 0; padding: 0; list-style: none; }
  @container lv-exam (max-width: 960px) { .lv-onboard-steps { grid-template-columns: minmax(0, 1fr); } }
  .lv-onboard-step { position: relative; border: 1px solid var(--lv-border); border-radius: var(--lv-r-2); padding: 14px 16px; background: var(--lv-surface-2); }
  .lv-onboard-no { position: absolute; right: 12px; top: 8px; font-size: 26px; font-weight: var(--lv-font-weight-bold); letter-spacing: -0.02em; color: color-mix(in srgb, var(--lv-accent) 26%, transparent); }
  .lv-onboard-step b { display: block; font-size: var(--lv-font-size-body); margin: 8px 0 0; }
  .lv-onboard-step-desc { margin-top: 5px; font-size: var(--lv-font-size-caption); line-height: 1.5; }
  @container lv-exam (max-width: 760px) { .lv-guard-steps { grid-template-columns: minmax(0, 1fr); } }
  .lv-modes { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--lv-space-loose); }
  .lv-mode { color: var(--lv-text); font: inherit; padding: 18px 20px; border-radius: var(--lv-r-3); text-align: left; background: var(--lv-surface); border: 1px solid var(--lv-border-subtle, var(--lv-border)); cursor: pointer; box-shadow: var(--lv-sh-card, var(--lv-sh-1)), var(--lv-inset-highlight, inset 0 1px 0 transparent); transition: background-color var(--lv-dur-micro) var(--lv-ease-out), border-color var(--lv-dur-micro) var(--lv-ease-out), box-shadow var(--lv-dur-view) var(--lv-ease-out), transform var(--lv-dur-micro) var(--lv-ease-out); display: flex; align-items: flex-start; gap: var(--lv-space-3); }
  .lv-mode:hover:not(:disabled) { box-shadow: 0 6px 20px color-mix(in srgb, var(--lv-brand) 16%, transparent); border-color: var(--lv-brand); background: color-mix(in srgb, var(--lv-brand-soft) 25%, var(--lv-surface)); transform: translateY(-2px); }
  .lv-mode:active:not(:disabled) { transform: translateY(-0.5px) scale(0.985); }
  .lv-mode .lv-mode-icon { color: var(--lv-accent); display: grid; place-items: center; width: 44px; height: 44px; border-radius: var(--lv-r-2); background: var(--lv-accent-soft); flex-shrink: 0; font-size: var(--lv-font-size-stat); box-shadow: 0 2px 8px color-mix(in srgb, var(--lv-accent) 18%, transparent); transition: transform var(--lv-dur-micro) var(--lv-ease-out), background-color var(--lv-dur-micro) var(--lv-ease-out); }
  .lv-mode-icon--quick { background: var(--lv-amber-soft) !important; color: var(--lv-amber) !important; box-shadow: 0 2px 8px color-mix(in srgb, var(--lv-amber) 22%, transparent) !important; }
  .lv-mode-icon--daily { background: var(--lv-accent-soft) !important; color: var(--lv-accent) !important; box-shadow: 0 2px 8px color-mix(in srgb, var(--lv-accent) 22%, transparent) !important; }
  .lv-mode-icon--wrong { background: var(--lv-red-soft) !important; color: var(--lv-red) !important; box-shadow: 0 2px 8px color-mix(in srgb, var(--lv-red) 22%, transparent) !important; }
  .lv-mode-icon--recite { background: color-mix(in srgb, var(--lv-accent) 15%, transparent) !important; color: var(--lv-accent) !important; box-shadow: var(--lv-sh-1) !important; }
  .lv-mode-icon--cram { background: color-mix(in srgb, var(--lv-amber) 24%, var(--lv-red-soft)) !important; color: var(--lv-red) !important; box-shadow: 0 2px 8px color-mix(in srgb, var(--lv-red) 16%, transparent) !important; }
  .lv-mode-icon--fav { background: color-mix(in srgb, var(--lv-amber) 20%, transparent) !important; color: var(--lv-amber) !important; box-shadow: var(--lv-sh-1) !important; }
  .lv-mode:hover:not(:disabled) .lv-mode-icon { transform: scale(1.06); background: color-mix(in srgb, var(--lv-accent) 16%, var(--lv-surface)); }
  .lv-mode .lv-mode-body { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
  .lv-mode b { font-size: var(--lv-font-size-md); font-weight: var(--lv-font-weight-semibold); letter-spacing: -0.01em; }
  .lv-mode:disabled { opacity: .62; cursor: not-allowed; }
  /* 低频模式降噪：中性键帽 + 收紧字号，与一级队列模式拉开层级 */
  .lv-mode--minor .lv-mode-icon { background: var(--lv-surface-2); color: var(--lv-text-2); box-shadow: var(--lv-sh-1); }
  .lv-mode--minor:hover:not(:disabled) .lv-mode-icon { background: color-mix(in srgb, var(--lv-text) 8%, var(--lv-surface-2)); }
  .lv-mode--minor b { font-size: var(--lv-font-size-body-compact); font-weight: 600; }
  .lv-resume { display: flex; gap: var(--lv-space-loose); align-items: center; padding: 18px 22px; border-radius: var(--lv-r-3); border-left: 4px solid var(--lv-accent); background: color-mix(in srgb, var(--lv-accent-soft) 40%, var(--lv-surface)); box-shadow: var(--lv-sh-1), var(--lv-inset-highlight, inset 0 1px 0 transparent); }
  .lv-resume > div:first-child { flex: 1; }
  .lv-session-head { justify-content: flex-start; }
  @container lv-exam (max-width: 600px) {
    .lv-pad { padding: 12px 14px 36px; }
    .lv-session-head { gap: var(--lv-space-compact); align-items: center; }
    .lv-session-head .lv-progress { min-width: 56px; }
    .lv-session-head > .lv-chip { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .lv-answer-actions { align-items: stretch; }
    .lv-answer-actions > .lv-btn { flex: 1 1 auto; min-width: 0; }
  }
  .lv-pure .lv-stem, .lv-pure .lv-opt > span:not(.key) { display: none; }
  .lv-pure .lv-opt .key { filter: none; }
  .lv-pure .lv-opt { justify-content: center; }
  .lv-question { margin-top: 10px; }
  .lv-stem { font-size: 19px; line-height: 1.75; font-weight: 600; letter-spacing: -0.015em; margin-bottom: 18px; white-space: pre-wrap; -webkit-font-smoothing: antialiased; }
  .lv-opt { display: flex; gap: 14px; align-items: center; width: 100%; text-align: left; padding: 16px 20px; border-radius: var(--lv-r-3); border: 1.5px solid var(--lv-ctl-border); margin-bottom: 12px; cursor: pointer; background: var(--lv-surface); font: inherit; color: inherit; box-shadow: var(--lv-sh-1), var(--lv-inset-card); transition: background-color var(--lv-dur-micro) ease, border-color var(--lv-dur-micro) ease, box-shadow var(--lv-dur-micro) ease, transform var(--lv-dur-micro) ease; }
  .lv-opt:hover:not([disabled]) { border-color: var(--lv-border-hover, var(--lv-accent)); background: color-mix(in srgb, var(--lv-accent) 4.5%, var(--lv-surface)); transform: translateY(-1.5px) translateX(2px); box-shadow: var(--lv-sh-card); }
  .lv-opt:active:not([disabled]) { transform: scale(0.985); }
  .lv-opt .key { width: 34px; height: 34px; border-radius: 9px; display: grid; place-items: center; flex: none; font-size: 13px; font-weight: var(--lv-font-weight-bold, 700); font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; background: var(--lv-surface-2); color: var(--lv-text-2); border: 1px solid var(--lv-border); box-shadow: var(--lv-keycap-shadow); transition: background-color var(--lv-dur-micro) ease, border-color var(--lv-dur-micro) ease, color var(--lv-dur-micro) ease, transform var(--lv-dur-micro) ease; }
  /* —— 选项圆点指示（规范 v6 .option：radio 圆 / checkbox 方；随四态着色） —— */
  .lv-opt-check { width: 18px; height: 18px; border-radius: var(--lv-radius-round); border: 1.5px solid var(--lv-ctl-border); background: var(--lv-surface); flex: none; display: grid; place-items: center; transition: background-color var(--lv-dur-micro) ease, border-color var(--lv-dur-micro) ease; }
  .lv-opt-check.box { border-radius: 5px; }
  .lv-opt-check::after { content: ""; width: 8px; height: 8px; border-radius: var(--lv-radius-round); background: var(--lv-on-accent, #fff); transform: scale(0); transition: transform var(--lv-dur-micro) var(--lv-ease-out); }
  .lv-opt-check.box::after { border-radius: 1.5px; }
  .lv-opt.sel .lv-opt-check, .lv-opt.right .lv-opt-check, .lv-opt.wrong .lv-opt-check { border-color: transparent; }
  .lv-opt.sel .lv-opt-check { background: var(--lv-accent); }
  .lv-opt.right .lv-opt-check { background: var(--lv-green); }
  .lv-opt.wrong .lv-opt-check { background: var(--lv-red); }
  .lv-opt.sel .lv-opt-check::after, .lv-opt.right .lv-opt-check::after, .lv-opt.wrong .lv-opt-check::after { transform: scale(1); }
  .lv-opt.sel { border-color: var(--lv-accent); background: color-mix(in srgb, var(--lv-accent-soft) 85%, var(--lv-surface)); box-shadow: 0 0 0 1.5px var(--lv-accent), 0 6px 18px -2px color-mix(in srgb, var(--lv-accent) 24%, transparent); }
  .lv-opt.sel .key { background: var(--lv-accent); border-color: var(--lv-accent); color: var(--lv-on-accent, #fff); box-shadow: 0 2px 8px color-mix(in srgb, var(--lv-accent) 28%, transparent); transform: scale(1.04); }
  .lv-opt.right { border-color: var(--lv-green); background: var(--lv-green-soft); box-shadow: 0 0 0 1px var(--lv-green), 0 4px 14px color-mix(in srgb, var(--lv-green) 18%, transparent); }
  .lv-opt.right .key { background: var(--lv-green); border-color: var(--lv-green); color: var(--lv-on-green, #fff); }
  .lv-opt.wrong { border-color: var(--lv-red); background: var(--lv-red-soft); box-shadow: 0 0 0 1px var(--lv-red), 0 4px 14px color-mix(in srgb, var(--lv-red) 18%, transparent); }
  .lv-opt.wrong .key { background: var(--lv-red); border-color: var(--lv-red); color: var(--lv-on-red, #fff); }
  .lv-feedback { margin: 16px 0 12px; padding: 16px 20px; border: 1px solid color-mix(in srgb, var(--lv-red) 26%, var(--lv-border)); border-left: 4px solid var(--lv-red); border-radius: var(--lv-r-3); font-weight: var(--lv-font-weight-semibold); font-size: var(--lv-font-size-md); background: color-mix(in srgb, var(--lv-red-soft) 85%, var(--lv-surface)); color: var(--lv-red); box-shadow: 0 2px 10px color-mix(in srgb, var(--lv-red) 12%, transparent); animation: lv-appear var(--lv-dur-view) var(--lv-ease-out); }
  .lv-feedback.good { border-color: color-mix(in srgb, var(--lv-green) 26%, var(--lv-border)); border-left-color: var(--lv-green); background: color-mix(in srgb, var(--lv-green-soft) 85%, var(--lv-surface)); color: var(--lv-green); box-shadow: 0 2px 10px color-mix(in srgb, var(--lv-green) 12%, transparent); }
  /* —— 作答动作区（吸收小驴闪卡 Floating Dock 浮岛悬浮底座质感：圆角聚拢 + 毛玻璃 + 微微弹性） —— */
  .lv-answer-actions {
    margin-top: 18px;
    padding: 12px 18px;
    border-radius: var(--lv-r-4, 20px);
    background: color-mix(in srgb, var(--lv-surface-2) 75%, var(--lv-surface));
    border: 1px solid var(--lv-border);
    box-shadow: var(--lv-sh-card), var(--lv-inset-card);
    backdrop-filter: blur(10px);
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
    transition: box-shadow var(--lv-dur-view, 0.2s) ease;
  }
  .lv-answer-actions > .lv-btn {
    min-height: 38px;
    border-radius: 9999px;
    font-weight: var(--lv-font-weight-semibold, 600);
    padding: 0 18px;
    transition: transform var(--lv-dur-micro, 0.15s) ease, background-color var(--lv-dur-micro) ease;
  }
  .lv-answer-actions > .lv-btn:active {
    transform: scale(0.97);
  }
  /* —— 改答原因弹层（63-03：轻量内联，不阻断作答） —— */
  .lv-reason { margin: 10px 0 0; padding: 12px 16px; border-radius: var(--lv-r-3); border: 1px solid var(--lv-border); border-left: 4px solid var(--lv-amber); background: color-mix(in srgb, var(--lv-amber-soft) 35%, var(--lv-surface)); box-shadow: var(--lv-sh-1), var(--lv-inset-card); }
  /* —— 结构化作答框（54 第三刀：数值单行 / 多空逐空） —— */
  .lv-answer-num { min-height: 48px; font-size: 16px; font-variant-numeric: tabular-nums; }
  .lv-answer-blank { min-height: 44px; margin-bottom: 10px; }
  .lv-analysis { border: 1px solid var(--lv-border); border-left: 4px solid var(--lv-accent); background: var(--lv-surface-2); border-radius: var(--lv-r-2); padding: 14px 18px; font-size: var(--lv-font-size-body); color: var(--lv-text-2); margin-bottom: 12px; white-space: pre-wrap; box-shadow: var(--lv-sh-1); }
  .lv-empty { border-radius: var(--lv-r-3); padding: 52px 24px; text-align: center; color: var(--lv-text-3); font-size: var(--lv-font-size-body); background: color-mix(in srgb, var(--lv-surface-2) 40%, var(--lv-surface)); border: 1.5px dashed var(--lv-border); }
  .lv-empty-icon { display: grid; place-items: center; width: 60px; height: 60px; margin: 0 auto; border-radius: 18px; background: var(--lv-accent-soft); color: var(--lv-accent); box-shadow: 0 4px 16px color-mix(in srgb, var(--lv-accent) 18%, transparent); }
  .lv-empty b { display: block; font-size: 18px; font-weight: var(--lv-font-weight-bold); color: var(--lv-text); margin: 16px 0 8px; letter-spacing: -0.01em; }
  .lv-empty .lv-muted { max-width: 440px; margin: 0 auto; line-height: 1.65; }
  .lv-skeleton { height: 180px; border-radius: var(--lv-r-3); background: linear-gradient(100deg, var(--lv-surface-2) 40%, var(--lv-surface) 50%, var(--lv-surface-2) 60%); background-size: 200% 100%; animation: lv-shimmer 1.4s infinite; border: 1px solid var(--lv-border); }
  @keyframes lv-shimmer { to { background-position: -200% 0; } }
  .lv-qrow { padding: 15px 18px; margin-bottom: 10px; border: 1px solid var(--lv-border-subtle, var(--lv-border)); border-radius: var(--lv-r-3); background: var(--lv-surface); box-shadow: var(--lv-sh-1), var(--lv-inset-card); transition: transform var(--lv-dur-micro) var(--lv-ease-out), border-color var(--lv-dur-micro) var(--lv-ease-out), background-color var(--lv-dur-micro) var(--lv-ease-out), box-shadow var(--lv-dur-micro) var(--lv-ease-out); }
  .lv-qrow:hover { transform: translateY(-1.5px); border-color: var(--lv-border-hover, var(--lv-accent)); box-shadow: var(--lv-sh-card); }
  /* 行头可点可供养：hover 浅底 + 手型；批量模式选中行 accent 描边 */
  .lv-qrow-head { display: flex; gap: var(--lv-space-2); align-items: center; width: calc(100% + 16px); margin: -4px -8px 4px; padding: 4px 8px; border: 0; border-radius: 8px; background: transparent; color: inherit; font: inherit; text-align: left; cursor: pointer; flex-wrap: wrap; transition: background-color var(--lv-dur-micro) var(--lv-ease-out); }
  .lv-qrow-head:hover { background: var(--lv-surface-2); }
  .lv-qrow.sel { border-color: var(--lv-accent); background: color-mix(in srgb, var(--lv-accent-soft) 80%, var(--lv-surface)); box-shadow: 0 0 0 1.5px var(--lv-accent), 0 4px 14px color-mix(in srgb, var(--lv-accent) 18%, transparent); }
  .lv-qrow-src { margin-left: auto; font-size: var(--lv-font-size-caption); color: var(--lv-text-3); }
  .lv-qrow-stem { font-size: var(--lv-font-size-body); font-weight: var(--lv-font-weight-medium); color: var(--lv-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  /* —— 工具行「更多」菜单（浮层走卡片语言：surface + pop 阴影 + 38px 行） —— */
  .lv-more { position: relative; display: inline-flex; }
  .lv-more-dot { display: inline-block; width: 6px; height: 6px; margin-left: 5px; border-radius: var(--lv-radius-round); background: var(--lv-accent); }
  .lv-more-pop { position: absolute; top: calc(100% + 6px); right: 0; z-index: 40; min-width: 216px; padding: 6px; background: color-mix(in srgb, var(--lv-surface) 94%, transparent); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); border: 1px solid var(--lv-border-subtle, var(--lv-border)); border-radius: var(--lv-r-2); box-shadow: var(--lv-sh-pop), var(--lv-inset-highlight, inset 0 1px 0 transparent); display: grid; gap: 3px; animation: lv-pop-in var(--lv-dur-view) var(--lv-ease-out) both; }
  .lv-more-pop button { display: flex; align-items: center; gap: 9px; width: 100%; min-height: 36px; padding: 7px 12px; border: 0; border-radius: 8px; background: transparent; color: var(--lv-text); font: inherit; font-size: var(--lv-font-size-body-compact); text-align: left; cursor: pointer; transition: background-color var(--lv-dur-micro) var(--lv-ease-out), color var(--lv-dur-micro) var(--lv-ease-out), transform var(--lv-dur-micro) var(--lv-ease-out); }
  .lv-more-pop button:hover { background: var(--lv-accent-soft); color: var(--lv-accent); transform: translateX(2px); }
  .lv-more-pop button[aria-checked="true"] { color: var(--lv-accent); font-weight: 600; background: color-mix(in srgb, var(--lv-accent-soft) 80%, transparent); }
  .lv-more-sep { height: 1px; margin: 4px 6px; background: var(--lv-border); }
  .lv-reason-btn { padding: 4px 10px; border-radius: var(--lv-r-1); cursor: pointer; touch-action: manipulation; transition: transform var(--lv-dur-micro) ease, background-color var(--lv-dur-micro) ease, border-color var(--lv-dur-micro) ease; }
  .lv-reason-btn:hover { transform: translateY(-1px); border-color: var(--lv-accent); }
  .lv-reason-btn:active { transform: scale(0.96); }
  .lv-reason-key { display: inline-grid; place-items: center; width: 16px; height: 16px; border-radius: 4px; margin-right: 4px; font-size: 10px; font-weight: 700; font-family: ui-monospace, monospace; background: color-mix(in srgb, var(--lv-text) 10%, transparent); color: var(--lv-text-2); }
  @container lv-exam (max-width: 960px) { .lv-modes { grid-template-columns: repeat(2, 1fr); } }
  @container lv-exam (max-width: 480px) { .lv-modes { grid-template-columns: 1fr; } }
  /* —— R54 原型高级交互：题目浏览 Peek 抽屉 (Desktop 右侧抽屉 / Mobile 底部 Sheet) —— */
  .lv-qrow.active-peek { border-color: var(--lv-accent); border-left: 3.5px solid var(--lv-accent); background: color-mix(in srgb, var(--lv-accent-soft) 35%, var(--lv-surface)); box-shadow: 0 4px 16px color-mix(in srgb, var(--lv-accent) 18%, transparent); }
  @media (prefers-reduced-motion: reduce) { .lv-skeleton { animation: none; } .lv-mode, .lv-btn, .lv-opt { transition: none; animation: none; } }
</style>
