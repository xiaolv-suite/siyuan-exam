<script lang="ts">
  import { onDestroy } from "svelte";
  import Icon from "../shared/Icon.svelte";
  import PracticeDoneCard from "./PracticeDoneCard.svelte";
  import ScratchpadDrawer from "./ScratchpadDrawer.svelte";
  import GroupBatchSummaryCard from "./GroupBatchSummaryCard.svelte";
  import MaterialGroupContextCard from "./MaterialGroupContextCard.svelte";
  import SpeechEvalCapsule from "./SpeechEvalCapsule.svelte";
  import type { Question } from "@/core/types";
  import { formatDisplayAnswer } from "@/core/answer";
  import type { PracticeSession } from "@/core/session";
  import type { SpeechEvalResult } from "@/core/speechEval";
  import { countWordsAndCharacters, generatePaperGrid } from "@/core/wordCount";
  import type { SiblingItem, MaterialGroupContext } from "@/core/materialContext";
  import type { ScratchpadMode } from "@/core/scratchpad";
  import { renderOcclusionSvg } from "@/core/imageOcclusion";
  import { shuffleAnswerChoices } from "@/core/answerChoices";
  import { notifyInline, notifyCapsule } from "../../libs/notice";
  import { lvLaunchpad } from "@/libs/lv-notice-kit";

  interface Props {
    session: PracticeSession;
    sessionDone: {
      total: number;
      correct: number;
      wrong: number;
      initialTotal?: number;
      initialCorrect?: number;
      delayedTotal?: number;
      delayedRecovered?: number;
      totalTimeS?: number;
      avgTimeS?: number;
    } | null;
    curQ: Question | null;
    curProgress: { done: number; total: number };
    questions: Question[];
    questionMap: Map<string, Question>;
    curSpec: any;
    stemHtml: string;
    materialHtml: string;
    materialContext: string;
    groupContext: MaterialGroupContext | null;
    materialExpanded: boolean;
    selected: string;
    feedback: any;
    currentDraft: string;
    blankParts: string[];
    hideOptions: boolean;
    recallDraft: string;
    currentRubric: any;
    currentRubricDrifted: boolean;
    rubricScore: any;
    rubricRatings: Record<string, string>;
    rubricSaved: boolean;
    rubricSaveBusy: boolean;
    rubricEvalResult: any;
    recordedRubricSnapshot: any;
    DEFAULT_RUBRIC_LEVELS: readonly any[];
    confidenceSel: "sure" | "fuzzy" | "guess" | "";
    qElapsedS: number;
    qTimeoutS: number;
    savedReason: string;
    canSubmitAnswer: boolean;
    explainBusy: boolean;
    explainText: string;
    explainQid: string;
    explainSavedQid: string;
    explainSaveBusy: boolean;
    explainSaveError: string;
    explainSaveErrorQid: string;
    explainFollowUp: string;
    leakPending: any;
    reasonPromptQid: string;
    curQStats: any;
    scratchpadOpen: boolean;
    scratchpadMode: ScratchpadMode;
    currentScratchpadText: string;
    groupBatchModal: any;
    speechEvalEnabled?: boolean;
    speechEvalResult?: SpeechEvalResult | null;
    speechRecording?: boolean;
    reciteToggle: boolean;
    speedDrillEnabled?: boolean;
    autoNextOnCorrect?: boolean;
    autoNextPending?: boolean;
    autoNextRemainingS?: number;
    shuffleOptions?: boolean;
    oncancelAutoNext?: () => void;
    pureListen: boolean;
    soundEnabled: boolean;
    hotkeysHelpOpen: boolean;
    ttsSlowRate: boolean;
    studyFontSize: string;
    shortLinedPaper: boolean;
    paperGridModalOpen: boolean;
    cardResult: string;
    favBusy: boolean;
    exitBusy: boolean;
    streakDays: number;
    kpBreakdown: any[];
    /** benchmark-fusion：CBM 结算归集（蒙对→脆弱伪掌握 / 自信错→高危盲区）与薄弱标签特训（Kangaroo） */
    cbmSettle?: { fragile: { qid: string; confidence: string }[]; highrisk: { qid: string; myAnswer: string | null }[] } | null;
    weakRank?: { root: string; total: number; correct: number; accuracy: number }[];
    weakDrillBusy?: boolean;
    checkinStatus: string;
    checkinNote: string;
    settleMode: string;
    reviewOpen: boolean;
    reflections: Record<string, { at: number; text: string }>;
    misdiagnosisBusy: string;
    misdiagnosisText: Record<string, string>;
    helpShown: { get(qid: string): unknown };
    actionBusy: boolean;
    actionNote: string;
    t: (k: string, fb?: string) => string;
    queueSemantics: (m: string) => { label: string; kind: string };
    writeBackReceipt: (m: string) => string;
    ttsSupported: () => boolean;
    renderInlineText: (s: string) => string;
    isChoiceQuestion: (q: Question) => boolean;
    answerChoices: (q: Question) => Array<{ letter: string; value: string; text: string }>;
    escapeHtml: (s: string) => string;
    formatMaterialGroupHeader: (ctx: MaterialGroupContext) => string;
    hintButtonLabel: (q: Question) => string;
    onexitSession: () => void;
    ontoggleReview: () => void;
    onsameKpSession: () => void;
    onweakSpotDrill: () => void;
    onwrongsToCard: () => void;
    onwrongsToActions: () => void;
    onopenReport: () => void;
    onstartNextDrill: () => void;
    oneditReflection: (qid: string) => void;
    onrunMisdiagnosis: (a: any) => void;
    onadoptMisdiagnosis: (qid: string) => void;
    onttsSpeak: (text: string, opt?: any) => void;
    ontoggleTtsSlow: () => void;
    oncycleStudyFontSize: () => void;
    onstartSpeech?: (target: string, lang: string) => void;
    ontoggleRecite: () => void;
    ontogglePureListen: () => void;
    ontoggleFavCurrent: () => void;
    ontoggleUserTag: (tag: string) => void;
    ontoggleScratchpad: () => void;
    onscratchpadModeChange: (m: ScratchpadMode) => void;
    onscratchpadInput: (val: string) => void;
    onclearScratchpad: () => void;
    oncopyScratchpad: () => void;
    oncloseScratchpad: () => void;
    ongroupBatchContinue: () => void;
    ontoggleMaterialExpand: () => void;
    onjumpSibling: (siblingQ: SiblingItem) => void;
    ondismissSpeechEval?: () => void;
    ontoggleHideOptions: () => void;
    onrecallDraftInput: (val: string) => void;
    onrevealOptions: () => void;
    onpickChoice: (val: string) => void;
    ondraftInput: (val: string) => void;
    ondraftChange: (val: string) => void;
    onsetBlank: (idx: number, val: string) => void;
    onblankChange: () => void;
    ontoggleLinedPaper: () => void;
    ontogglePaperGridModal: () => void;
    onundoRecentSubmit: () => void;
    onautoAlignRubric: () => void;
    onrubricRatingChange: (critId: string, lvl: any) => void;
    onrecordRubricAssessment: () => void;
    onexportRubricCsv: () => void;
    onsaveWrongReason: (r: any) => void;
    onconfidenceSelect: (c: "sure" | "fuzzy" | "guess") => void;
    onsubmitAnswer: () => void;
    onrequestHint: () => void;
    onrevealStageHint?: () => void;
    onnextQuestion: () => void;
    ondrillVariant: () => void;
    ontraceMother: () => void;
    ondiagnosePrereqs?: (q: Question) => void;
    ontoCard: () => void;
    onopenInSiYuan?: (rootId: string, blockId?: string, opt?: any) => void;
    onexplainCurrent: (mode: "explain" | "socratic" | "dual-loop" | "storm") => void;
    onviewLeakedHint: () => void;
    ondismissLeakedHint: () => void;
    onsaveExplain: () => void;
    onsendFollowUp: () => void;
    onsetEditReason: (qid: string, r: any) => void;
    ondismissReasonPrompt: () => void;
    ontouchStart: (e: TouchEvent) => void;
    ontouchEnd: (e: TouchEvent) => void;
    onopenSessionSheet?: () => void;
    trails?: Map<string, any>;
  }

  let {
    session,
    sessionDone,
    curQ,
    curProgress,
    questions,
    questionMap,
    curSpec,
    stemHtml,
    materialHtml,
    materialContext,
    groupContext,
    materialExpanded = $bindable(),
    selected = $bindable(),
    feedback,
    currentDraft,
    blankParts,
    hideOptions = $bindable(),
    recallDraft = $bindable(),
    currentRubric,
    currentRubricDrifted,
    rubricScore,
    rubricRatings = $bindable(),
    rubricSaved = $bindable(),
    rubricSaveBusy,
    rubricEvalResult,
    recordedRubricSnapshot,
    DEFAULT_RUBRIC_LEVELS,
    confidenceSel = $bindable(),
    qElapsedS,
    qTimeoutS,
    savedReason = $bindable(),
    canSubmitAnswer,
    explainBusy,
    explainText,
    explainQid,
    explainSavedQid,
    explainSaveBusy,
    explainSaveError,
    explainSaveErrorQid,
    explainFollowUp = $bindable(),
    leakPending = $bindable(),
    reasonPromptQid = $bindable(),
    curQStats,
    scratchpadOpen = $bindable(),
    scratchpadMode = $bindable(),
    currentScratchpadText,
    groupBatchModal = $bindable(),
    speechEvalEnabled = false,
    speechEvalResult = null,
    speechRecording = false,
    reciteToggle,
    speedDrillEnabled = $bindable(false),
    autoNextOnCorrect = $bindable(false),
    autoNextPending = false,
    autoNextRemainingS = 3.5,
    shuffleOptions = $bindable(false),
    oncancelAutoNext,
    pureListen,
    soundEnabled = $bindable(),
    hotkeysHelpOpen = $bindable(),
    ttsSlowRate = $bindable(),
    studyFontSize,
    shortLinedPaper = $bindable(),
    paperGridModalOpen = $bindable(),
    cardResult,
    favBusy,
    exitBusy,
    streakDays,
    kpBreakdown,
    cbmSettle = null,
    weakRank = [],
    weakDrillBusy = false,
    checkinStatus,
    checkinNote,
    settleMode,
    reviewOpen = $bindable(),
    reflections,
    misdiagnosisBusy,
    misdiagnosisText,
    helpShown,
    actionBusy,
    actionNote,
    t,
    queueSemantics,
    writeBackReceipt,
    ttsSupported,
    renderInlineText,
    isChoiceQuestion,
    answerChoices,
    escapeHtml,
    formatMaterialGroupHeader,
    hintButtonLabel,
    onexitSession,
    ontoggleReview,
    onsameKpSession,
    onweakSpotDrill,
    onwrongsToCard,
    onwrongsToActions,
    onopenReport,
    onstartNextDrill,
    oneditReflection,
    onrunMisdiagnosis,
    onadoptMisdiagnosis,
    onttsSpeak,
    ontoggleTtsSlow,
    oncycleStudyFontSize,
    onstartSpeech,
    ontoggleRecite,
    ontogglePureListen,
    ontoggleFavCurrent,
    ontoggleUserTag,
    ontoggleScratchpad,
    onscratchpadModeChange,
    onscratchpadInput,
    onclearScratchpad,
    oncopyScratchpad,
    oncloseScratchpad,
    ongroupBatchContinue,
    ontoggleMaterialExpand,
    onjumpSibling,
    ondismissSpeechEval,
    ontoggleHideOptions,
    onrecallDraftInput,
    onrevealOptions,
    onpickChoice,
    ondraftInput,
    ondraftChange,
    onsetBlank,
    onblankChange,
    ontoggleLinedPaper,
    ontogglePaperGridModal,
    onundoRecentSubmit,
    onautoAlignRubric,
    onrubricRatingChange,
    onrecordRubricAssessment,
    onexportRubricCsv,
    onsaveWrongReason,
    onconfidenceSelect,
    onsubmitAnswer,
    onrequestHint,
    onrevealStageHint,
    onnextQuestion,
    ondrillVariant,
    ontraceMother,
    ondiagnosePrereqs,
    ontoCard,
    onopenInSiYuan,
    onexplainCurrent,
    onviewLeakedHint,
    ondismissLeakedHint,
    onsaveExplain,
    onsendFollowUp,
    onsetEditReason,
    ondismissReasonPrompt,
    ontouchStart,
    ontouchEnd,
    onopenSessionSheet,
    trails,
  }: Props = $props();

  let mobileToolsOpen = $state(false);

  // —— benchmark-fusion：解析 3 阶渐进折叠（Moodle Adaptive Hints + TextFold 标杆）——
  // 阶1 考点提示：作答中可展开（不暴露答案；默认折叠不弱化独立回忆）
  // 阶2 核心推导：提交后解锁（默认展开保留既有可读性，可折叠降噪）
  // 阶3 思源原块溯源：提交后解锁（默认折叠；siyuan:// 深链直达原块）
  // 切题即重置，防上一题的展开态串扰到下一题。
  let explainDepth = $state<"explain" | "dual-loop" | "storm">("explain");
  let stageHintOpen = $state(false);
  let stageAnalysisOpen = $state(true);
  let stageSourceOpen = $state(false);
  let rubricDeductionsOnly = $state(false);
  $effect(() => {
    const qid = curQ?.id;
    stageHintOpen = Boolean(qid && session?.getExposures?.(qid).includes("hint"));
    stageAnalysisOpen = true;
    stageSourceOpen = false;
  });

  let eliminatedChoices = $state<Record<string, boolean>>({});
  $effect(() => {
    if (curQ?.id) {
      eliminatedChoices = {};
    }
  });

  function toggleEliminate(choiceValue: string, targetEl?: HTMLElement | null) {
    if (feedback) return;
    const nextVal = !eliminatedChoices[choiceValue];
    eliminatedChoices[choiceValue] = nextVal;
    if (targetEl) {
      notifyInline(targetEl, nextVal ? "已划线排除" : "已恢复选项");
    } else {
      notifyCapsule(nextVal ? `已划线排除选项 ${choiceValue}` : `已恢复选项 ${choiceValue}`, 1200);
    }
    if (nextVal) {
      if (curQ?.type === "multiple" && selected.includes(choiceValue)) {
        onpickChoice(choiceValue);
      } else if (curQ?.type === "single" && selected === choiceValue) {
        onpickChoice("");
      }
    }
  }

  let optionLongPressTimer: ReturnType<typeof setTimeout> | null = null;
  let optionLongPressFired = false;

  onDestroy(() => {
    if (optionLongPressTimer) {
      clearTimeout(optionLongPressTimer);
      optionLongPressTimer = null;
    }
  });

  function triggerCbmGuess(choiceValue: string, targetEl?: HTMLElement | null) {
    if (feedback || reciteToggle) return;
    if (curQ?.type === "multiple") {
      if (!selected.includes(choiceValue)) {
        onpickChoice(choiceValue);
      }
    } else {
      onpickChoice(choiceValue);
    }
    onconfidenceSelect("guess");
    lvLaunchpad.haptic(10);
    if (targetEl) {
      notifyInline(targetEl, "确定度：蒙的/猜测 🎲");
    } else {
      notifyCapsule("已标记确定度：蒙的/猜测 (CBM Guess) 🎲", 1500);
    }
  }

  function handleOptionTouchStart(choiceValue: string, targetEl?: HTMLElement | null) {
    optionLongPressFired = false;
    if (optionLongPressTimer) clearTimeout(optionLongPressTimer);
    optionLongPressTimer = setTimeout(() => {
      optionLongPressFired = true;
      triggerCbmGuess(choiceValue, targetEl);
    }, 600);
  }

  function handleOptionTouchEnd(e: TouchEvent) {
    if (optionLongPressTimer) {
      clearTimeout(optionLongPressTimer);
      optionLongPressTimer = null;
    }
    if (optionLongPressFired) {
      e.preventDefault();
    }
  }

  function handleOptionTouchCancel() {
    if (optionLongPressTimer) {
      clearTimeout(optionLongPressTimer);
      optionLongPressTimer = null;
    }
    optionLongPressFired = false;
  }

  function handleOptionDblClick(choiceValue: string, targetEl?: HTMLElement | null, e?: MouseEvent) {
    e?.preventDefault();
    triggerCbmGuess(choiceValue, targetEl);
  }

  function handleBlankInputKeydown(e: KeyboardEvent, index: number) {
    if (e.key === "Enter") {
      e.preventDefault();
      const blanks = (e.target as HTMLElement)?.closest(".lv-question")?.querySelectorAll<HTMLInputElement>(".lv-answer-blank");
      if (blanks && index < blanks.length - 1) {
        blanks[index + 1]?.focus();
        blanks[index + 1]?.select();
      } else if (canSubmitAnswer) {
        onsubmitAnswer();
      }
    }
  }
</script>

{#if sessionDone}
  <PracticeDoneCard
    {sessionDone}
    {streakDays}
    {kpBreakdown}
    {cbmSettle}
    {weakRank}
    {weakDrillBusy}
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
    {ontoggleReview}
    {onsameKpSession}
    {onweakSpotDrill}
    {onwrongsToCard}
    {onwrongsToActions}
    {onopenReport}
    {onstartNextDrill}
    {oneditReflection}
    {onrunMisdiagnosis}
    {onadoptMisdiagnosis}
    {onopenInSiYuan}
    {trails}
    onexitSession={onexitSession}
  />
{:else}
  {@const q = curQ}
  {#if q}
    <div class="lv-pad lv-session-grid">
      <div class="lv-row lv-session-head">
        <div class="lv-row lv-session-head-bar">
          <button class="lv-btn lv-btn--ghost lv-session-exit-btn" onclick={onexitSession} disabled={exitBusy} style="display:inline-flex;align-items:center;gap:4px;font-weight:600;color:var(--lv-text)" title="结束本次做题并退出（下次可在首页随时继续或放弃）">
            <Icon name="close" size={13} /> <span class="lv-session-exit-label">{exitBusy ? "…" : "结束练习"}</span>
          </button>
          <div class="lv-row lv-session-prog-wrap" style="flex:1;min-width:60px;gap:var(--lv-space-2);flex-wrap:nowrap">
            <div class="lv-progress" style="flex:1" role="progressbar" aria-label={t("session.progress")} aria-valuemin="0" aria-valuemax={curProgress.total} aria-valuenow={curProgress.done}><i style="width:{curProgress.total ? Math.round((curProgress.done / curProgress.total) * 100) : 0}%"></i></div>
            {#if onopenSessionSheet}
              <button type="button" class="lv-chip sm num lv-session-sheet-trigger" onclick={onopenSessionSheet} title="展开练习答题卡" style="padding:1px 6px;cursor:pointer">{curProgress.done}/{curProgress.total}</button>
            {:else}
              <span class="num lv-muted">{curProgress.done}/{curProgress.total}</span>
            {/if}
          </div>
          <span class="lv-chip lv-chip--acc lv-session-qtype">{t("qtype." + q.type)}</span>
          <button
            type="button"
            class="lv-chip sm lv-session-tools-toggle"
            class:acc={mobileToolsOpen || reciteToggle || scratchpadOpen || !!q.fav}
            aria-expanded={mobileToolsOpen}
            onclick={() => (mobileToolsOpen = !mobileToolsOpen)}
            title="展开/收起做题工具栏"
          >
            <Icon name="layers" size={12} />
            <span>工具</span>
          </button>
        </div>
        <div class="lv-session-tools-collapse" class:open={mobileToolsOpen}>
        {#if session.isDelayedReviewAtCurrent()}
          <span class="lv-chip lv-chip--amb" title={t("session.delayedRetestTip")}>
            <Icon name="rotate" size={11} /> {t("session.delayedRetest")}
          </span>
        {/if}
        {#if q.group}
          {@const sibs = questions.filter((x) => x.group === q.group)}
          {@const pos = sibs.findIndex((x) => x.id === q.id) + 1}
          <span class="lv-chip num"><Icon name="link" size={12} /> {t("session.groupPos")} {pos}/{sibs.length}</span>
        {/if}
        <div class="lv-session-dock" role="group" aria-label="核心学习操作">
          <button class="lv-chip" title={ttsSupported() ? t("tts.read") : t("tts.unsupported", "当前前端不支持朗读")} aria-label={t("tts.read")} disabled={!ttsSupported()} onclick={() => onttsSpeak([q.stem, ...q.options].join(" "), { lang: q.studyMeta?.lang, rate: ttsSlowRate ? 0.85 : 1 })}><Icon name="volume" size={13} /></button>
          <button type="button" class="lv-chip num sm" class:acc={ttsSlowRate} onclick={ontoggleTtsSlow} title="切换语音语速（0.8x 慢速磨耳朵 / 1.0x 正常）" aria-label="切换语音语速">
            {ttsSlowRate ? "0.8x" : "1.0x"}
          </button>
          <button type="button" class="lv-chip num sm" onclick={oncycleStudyFontSize} title="切换题干字号大小（标准 16px / 大号 19px / 特大 22px）" aria-label="切换题干字号大小">
            A{studyFontSize === "normal" ? "" : studyFontSize === "large" ? "⁺" : "²⁺"}
          </button>
          {#if (q.studyMeta?.lang || q.studyMeta?.phonetic || speechEvalEnabled) && onstartSpeech}
            <button type="button" class="lv-chip" class:acc={speechRecording} onclick={() => onstartSpeech(q.answer || q.stem, q.studyMeta?.lang || "zh-CN")} title="开启麦克风发音跟读测评" aria-label="开启麦克风发音跟读测评" aria-pressed={speechRecording}>
              <Icon name="mic" size={13} /> {speechRecording ? "跟读中…" : "跟读测评"}
            </button>
          {/if}
          <button class="lv-chip" class:acc={reciteToggle} title={t("session.reciteMode")} aria-label={t("session.reciteMode")} aria-pressed={reciteToggle} onclick={ontoggleRecite}><Icon name="eye" size={13} /> {t("session.reciteMode")}</button>
          {#if q.blockId && onopenInSiYuan}
            <button type="button" class="lv-chip" title="在思源笔记中定位并高亮原题块（按住 Ctrl/Cmd 点击可在右侧分屏打开）" aria-label={t("session.stageSourceOpen", "打开思源原块")} onclick={(e) => onopenInSiYuan(q.rootId || "", q.blockId, { event: e })}><Icon name="pin" size={12} /> {t("recite.jumpSource", "定位原题")}</button>
          {/if}
          <button class="lv-chip" class:acc={!!q.fav} title="E" aria-label={t("session.kbdFav")} aria-pressed={!!q.fav} aria-busy={favBusy} disabled={favBusy} onclick={(e) => { notifyInline(e.currentTarget, !q.fav ? "已收藏" : "已取消收藏"); ontoggleFavCurrent(); }}><Icon name="star" size={13} /></button>
        </div>
        <div class="lv-session-dock" role="group" aria-label="辅助工具坞">
          <button class="lv-chip" class:acc={scratchpadOpen} title={t("scratchpad.tip")} aria-label={t("scratchpad.tip")} aria-pressed={scratchpadOpen} onclick={ontoggleScratchpad}><Icon name="pencil" size={13} /></button>
          <button type="button" class="lv-chip" class:acc={autoNextOnCorrect} title="⚡ 答对自动翻题（单选/判断答对后启动平滑倒计时切题，答错暂停看解析；点击题面或草稿纸即刻打断）" aria-label="答对自动翻题" onclick={() => { autoNextOnCorrect = !autoNextOnCorrect; }}><Icon name="zap" size={13} /> <span class="lv-dock-label">{autoNextOnCorrect ? "自动翻题" : "翻题关"}</span></button>
          <button type="button" class="lv-chip" class:acc={speedDrillEnabled} title="🚀 极速答题模式（答对后1.5s极速翻题，适合快节奏刷词与熟题巩固）" aria-label="极速答题模式" onclick={() => { speedDrillEnabled = !speedDrillEnabled; }}><Icon name="compass" size={13} /> <span class="lv-dock-label">{speedDrillEnabled ? "极速" : "标准"}</span></button>
          <button type="button" class="lv-chip" class:acc={shuffleOptions} title="🔀 选项随机乱序（打乱 ABCD 渲染次序，打破位置记忆）" aria-label="选项随机乱序" onclick={() => { shuffleOptions = !shuffleOptions; }}><Icon name="shuffle" size={13} /> <span class="lv-dock-label">{shuffleOptions ? "乱序" : "顺序"}</span></button>
          <button class="lv-chip" class:acc={pureListen} title={t("tts.pureListen")} aria-label={t("tts.pureListen")} aria-pressed={pureListen} onclick={ontogglePureListen}><Icon name="eyeoff" size={13} /></button>
          <button class="lv-chip" class:acc={soundEnabled} title={soundEnabled ? t("sound.disable") : t("sound.enable")} aria-label={soundEnabled ? t("sound.disable") : t("sound.enable")} aria-pressed={soundEnabled} onclick={() => { soundEnabled = !soundEnabled; }}><Icon name={soundEnabled ? "volume" : "volume-x"} size={13} /></button>
          <button class="lv-chip" class:acc={hotkeysHelpOpen} title={t("hotkeys.tip")} aria-label={t("hotkeys.tip")} aria-pressed={hotkeysHelpOpen} onclick={() => (hotkeysHelpOpen = !hotkeysHelpOpen)}><Icon name="activity" size={13} /></button>
          <button type="button" class="lv-chip" onclick={onexitSession} disabled={exitBusy} title="结束做题并退出"><Icon name="close" size={13} /></button>
        </div>
        <span class="lv-chip" style="gap:2px;padding:2px 4px" role="group" aria-label="试题速记标记">
          <button class="lv-btn sm lv-btn--ghost" style="padding:1px 5px;font-size:11px" class:acc={(q.userTags || []).includes("star")} title={t("session.tagStar")} aria-label={t("session.tagStar")} aria-pressed={(q.userTags || []).includes("star")} onclick={(e) => { notifyInline(e.currentTarget); ontoggleUserTag("star"); }}><Icon name="star" size={12} /></button>
          <button class="lv-btn sm lv-btn--ghost" style="padding:1px 5px;font-size:11px" class:acc={(q.userTags || []).includes("trap")} title={t("session.tagTrap")} aria-label={t("session.tagTrap")} aria-pressed={(q.userTags || []).includes("trap")} onclick={(e) => { notifyInline(e.currentTarget); ontoggleUserTag("trap"); }}><Icon name="alert-triangle" size={12} /></button>
          <button class="lv-btn sm lv-btn--ghost" style="padding:1px 5px;font-size:11px" class:acc={(q.userTags || []).includes("doubt")} title={t("session.tagDoubt")} aria-label={t("session.tagDoubt")} aria-pressed={(q.userTags || []).includes("doubt")} onclick={(e) => { notifyInline(e.currentTarget); ontoggleUserTag("doubt"); }}><Icon name="help" size={12} /></button>
          <button class="lv-btn sm lv-btn--ghost" style="padding:1px 5px;font-size:11px" class:acc={(q.userTags || []).includes("key")} title={t("session.tagKey")} aria-label={t("session.tagKey")} aria-pressed={(q.userTags || []).includes("key")} onclick={(e) => { notifyInline(e.currentTarget); ontoggleUserTag("key"); }}><Icon name="bulb" size={12} /></button>
        </span>
        </div>
      </div>
      <div class="lv-session-main">
        <ScratchpadDrawer
          open={scratchpadOpen}
          mode={scratchpadMode}
          text={currentScratchpadText}
          qid={curQ?.id}
          {t}
          onmodeChange={onscratchpadModeChange}
          oninput={onscratchpadInput}
          onclear={onclearScratchpad}
          oncopy={oncopyScratchpad}
          onclose={oncloseScratchpad}
        />
        {#if groupBatchModal}
          <GroupBatchSummaryCard
            modal={groupBatchModal}
            {questionMap}
            {t}
            oncontinue={ongroupBatchContinue}
          />
        {/if}
        <div class="lv-card lv-question" class:lv-pure={pureListen} role="region" aria-label={t("session.card")} ontouchstart={ontouchStart} ontouchend={ontouchEnd}>
          <MaterialGroupContextCard
            {materialContext}
            {materialHtml}
            {groupContext}
            {materialExpanded}
            {t}
            {escapeHtml}
            {formatMaterialGroupHeader}
            ontoggleExpand={ontoggleMaterialExpand}
            onjumpSibling={onjumpSibling}
          />
          {#if stemHtml}<div class="lv-stem lv-rich b3-typography" class:lv-stem--lg={studyFontSize === "large"} class:lv-stem--xl={studyFontSize === "xlarge"}>{@html stemHtml}</div>{:else}<div class="lv-stem" class:lv-stem--lg={studyFontSize === "large"} class:lv-stem--xl={studyFontSize === "xlarge"}>{q.stem}</div>{/if}
          {#if q.occlusion}
            <div class="lv-occlusion-wrap" style="margin:10px 0 14px;border-radius:var(--lv-r-2, 10px);overflow:hidden;border:1px solid var(--lv-border-subtle);box-shadow:var(--lv-sh-1)">
              {@html renderOcclusionSvg(q.occlusion, { activeMaskId: q.occlusion.activeMaskId, revealedMaskIds: feedback ? [q.occlusion.activeMaskId || ""] : [] })}
            </div>
          {/if}
          {#if speechEvalResult && ondismissSpeechEval}
            <SpeechEvalCapsule result={speechEvalResult} ondismiss={ondismissSpeechEval} />
          {/if}
          {#if q.studyMeta?.phonetic}
            <div class="lv-phonetic-badge" style="margin:4px 0 10px;display:inline-flex;align-items:center;gap:6px;padding:3px 12px;border-radius:var(--lv-radius-pill, 9999px);background:var(--lv-surface-2);border:1px solid var(--lv-border-subtle);font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;color:var(--lv-brand)">
              <Icon name="volume" size={12} />
              <span>注音 / 粤拼：{q.studyMeta.phonetic}</span>
            </div>
          {/if}
          <p class="lv-muted lv-qtype-guide" style="margin:8px 0 14px" role="note">{t("session.guide." + q.type)}</p>
          {#key session.id + ":" + curProgress.done}
          {#if isChoiceQuestion(q)}
            {@const baseChoices = answerChoices(q)}
            {@const choices = shuffleOptions && q.type !== "judge" ? shuffleAnswerChoices(baseChoices, q.id) : baseChoices}
            {#if !choices.length}
              <div class="lv-error" role="alert">{t("session.missingOptions")}</div>
            {:else}
              {#if reciteToggle}
                <div class="lv-row" style="margin:0 0 6px">
                  <span class="lv-chip lv-chip--acc" style="font-weight:600;font-size:12px">
                    <Icon name="eye" size={13} /> 📖 背题速记模式：直显参考答案与核心考点
                  </span>
                </div>
              {/if}
              <div class="lv-row" style="margin:0 0 4px">
                <button class="lv-chip" class:acc={hideOptions} aria-pressed={hideOptions} onclick={ontoggleHideOptions}>
                  {hideOptions ? t("session.recallOn") : t("session.recallOff")}
                </button>
                {#if hideOptions}<span class="lv-muted" style="font-size:var(--lv-font-size-caption)">{t("session.recallHint")}</span>{/if}
              </div>
              {#if hideOptions}
                <textarea class="lv-input lv-textarea" rows="2" bind:value={recallDraft}
                  placeholder={t("session.recallPlaceholder")} aria-label={t("session.recallPlaceholder")}
                  oninput={(e) => onrecallDraftInput((e.target as HTMLTextAreaElement).value)}></textarea>
                <div class="lv-row" style="margin:6px 0">
                  <button class="lv-btn lv-btn--primary sm" onclick={onrevealOptions}>{t("session.revealOptions")}</button>
                </div>
              {:else}
                <div role={q.type === "multiple" ? "group" : "radiogroup"} aria-label={t("session.options")}>
                  {#each choices as choice (choice.value)}
                    <button class="lv-opt" class:sel={q.type === "multiple" ? selected.includes(choice.value) : selected === choice.value}
                      role={q.type === "multiple" ? "checkbox" : "radio"}
                      aria-checked={q.type === "multiple" ? selected.includes(choice.value) : selected === choice.value}
                      class:right={(feedback && feedback.verdict !== "not_attempted" && (q.type === "multiple" ? q.answer.includes(choice.value) : q.answer === choice.value)) || (reciteToggle && (q.type === "multiple" ? q.answer.includes(choice.value) : q.answer === choice.value))}
                      class:wrong={feedback?.verdict === "wrong" && (q.type === "multiple" ? (feedback.myAnswer ?? "").includes(choice.value) && !q.answer.includes(choice.value) : feedback.myAnswer === choice.value)}
                      class:eliminated={!!eliminatedChoices[choice.value]}
                      disabled={!!feedback && !reciteToggle}
                      onclick={(e) => {
                        if (optionLongPressFired) {
                          optionLongPressFired = false;
                          return;
                        }
                        if (eliminatedChoices[choice.value]) {
                          toggleEliminate(choice.value, e.currentTarget);
                        } else {
                          onpickChoice(choice.value);
                          lvLaunchpad.haptic(10);
                        }
                      }}
                      ontouchstart={(e) => handleOptionTouchStart(choice.value, e.currentTarget)}
                      ontouchend={handleOptionTouchEnd}
                      ontouchcancel={handleOptionTouchCancel}
                      oncontextmenu={(e) => {
                        e.preventDefault();
                        toggleEliminate(choice.value, e.currentTarget);
                      }}
                      ondblclick={(e) => {
                        handleOptionDblClick(choice.value, e.currentTarget, e);
                      }}
                      title={eliminatedChoices[choice.value] ? "已划线排除（点击或右键恢复）" : "单击选中，双击或长按600ms标为猜测/不确定，右键划线排除"}
                    >
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
              <input class="lv-input lv-answer-num" type="text" inputmode="decimal"
                placeholder={curSpec.unit ? t("session.numericUnit").replace("{u}", curSpec.unit) : t("session.numericPlain")}
                aria-label={curSpec.unit ? t("session.numericUnit").replace("{u}", curSpec.unit) : t("session.numericPlain")}
                value={feedback?.myAnswer ?? currentDraft}
                oninput={(e) => ondraftInput((e.target as HTMLInputElement).value)}
                onchange={(e) => ondraftChange((e.target as HTMLInputElement).value)}
                disabled={!!feedback} />
              {#if curSpec.unit}<div class="lv-row" style="margin:6px 0 0"><span class="lv-chip num">{t("session.unitLabel")}：{curSpec.unit}</span></div>{/if}
            {:else if curSpec?.kind === "multiBlank"}
              <div class="lv-row" style="margin:0 0 6px"><span class="lv-muted" style="font-size:var(--lv-font-size-caption)">{t("session.blankHint")}</span></div>
              {#each blankParts as _p, i (i)}
                <input class="lv-input lv-answer-blank" placeholder={t("session.blankN").replace("{n}", String(i + 1))}
                  aria-label={t("session.blankN").replace("{n}", String(i + 1))}
                  value={blankParts[i]}
                  oninput={(e) => onsetBlank(i, (e.target as HTMLInputElement).value)}
                  onchange={onblankChange}
                  onkeydown={(e) => handleBlankInputKeydown(e, i)}
                  disabled={!!feedback} />
              {/each}
            {:else}
              <textarea class="lv-input lv-textarea" class:lv-textarea--ruled={shortLinedPaper} placeholder={q.type === "short" ? t("session.shortPlaceholder") : t("session.fillPlaceholder")} aria-label={t("session.guide." + q.type)}
                value={feedback?.myAnswer ?? currentDraft}
                oninput={(e) => ondraftInput((e.target as HTMLTextAreaElement).value)}
                onchange={(e) => ondraftChange((e.target as HTMLTextAreaElement).value)}
                disabled={!!feedback}></textarea>
              {#if q.type === "short"}
                {@const words = countWordsAndCharacters(feedback?.myAnswer ?? currentDraft ?? "")}
                <div class="lv-row" style="margin:4px 0 0;font-size:var(--lv-font-size-caption);justify-content:space-between;align-items:center">
                  <span class="lv-muted">
                    字数统计：<strong class="num">{words.examWords}</strong> 字（中文 {words.chineseChars} · 英文 {words.englishWords} · {words.paragraphs} 段）
                  </span>
                  <div class="lv-row" style="margin:0;gap:6px">
                    <button type="button" class="lv-btn sm lv-btn--ghost" style="padding:1px 6px;font-size:11px" class:acc={shortLinedPaper} aria-pressed={shortLinedPaper} onclick={ontoggleLinedPaper} title="切换横线稿纸视觉背景">
                      <Icon name="file-text" size={11} /> {shortLinedPaper ? "纯白底" : "横线纸"}
                    </button>
                    <button type="button" class="lv-btn sm lv-btn--ghost" style="padding:1px 6px;font-size:11px" aria-expanded={paperGridModalOpen} onclick={ontogglePaperGridModal} title={t("session.gridPreview")}>
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
                  <div class="lv-card" style="margin:8px 0;padding:12px 14px;background:var(--lv-surface-2);border:1px solid var(--lv-border-subtle);border-left:3.5px solid var(--lv-accent);border-radius:var(--lv-r-3, 14px);box-shadow:var(--lv-sh-1)">
                    <div class="lv-row" style="justify-content:space-between;align-items:center;margin-bottom:6px">
                      <b style="font-size:12px;display:flex;align-items:center;gap:6px">
                        <Icon name="file-text" size={13} /> 考场 20×20 规范作文答题纸模拟（已占 {gridModel.totalCellsOccupied} 格 · {gridModel.totalRows} 行）
                      </b>
                      <button type="button" class="lv-btn sm lv-btn--ghost" onclick={ontogglePaperGridModal} aria-label="关闭"><Icon name="close" size={12} /></button>
                    </div>
                    <div style="display:flex;flex-direction:column;gap:2px;overflow-x:auto;padding:6px;background:var(--lv-surface);border:1px solid var(--lv-border-subtle);border-radius:var(--lv-r-2, 8px);max-height:200px">
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

          {#if !feedback && (q.kp || (q.secondaryKps?.length ?? 0) > 0)}
            <!-- benchmark-fusion 阶1：卡壳时可展开考点提示（Moodle Adaptive Hints）——
                 只露考点不露答案；默认折叠避免弱化独立回忆；读屏由 aria-expanded 播报展开态 -->
            <div class="lv-analysis lv-stage-hint-box" style="padding:10px 14px">
              <button type="button" class="lv-btn sm lv-btn--ghost" style="margin:0;padding:2px 8px;display:inline-flex;align-items:center;gap:4px"
                aria-expanded={stageHintOpen} aria-controls="lv-stage-hint"
                onclick={() => {
                  const next = !stageHintOpen;
                  stageHintOpen = next;
                  if (next && !feedback) onrevealStageHint?.();
                }}>
                <Icon name="bulb" size={12} /> {t("session.stageHint", "考点提示（卡壳再看）")}
              </button>
              {#if stageHintOpen}
                <div id="lv-stage-hint" style="margin:8px 0 0;display:flex;flex-wrap:wrap;gap:4px">
                  {#if q.kp}<span class="lv-chip"><Icon name="layers" size={11} /> {q.kp}</span>{/if}
                  {#each q.secondaryKps ?? [] as sk (sk)}<span class="lv-chip">{sk}</span>{/each}
                </div>
              {/if}
            </div>
          {/if}

          {#if feedback}
            <div class="lv-feedback" role="status" aria-live="polite" class:good={feedback.verdict === "correct"}>
              <div class="lv-row" style="margin:0;gap:var(--lv-space-2);align-items:center;flex-wrap:wrap">
                <span>
                  {q.type === "short" && feedback.myAnswer ? t("session.shortSaved") : feedback.verdict === "correct" ? t("session.correct") : feedback.verdict === "wrong" ? t("session.wrongAns") : t("session.skipped")}
                </span>
                {#if feedback.verdict === "wrong"}
                  <span class="lv-chip lv-chip--acc num" style="font-weight:var(--lv-font-weight-bold);font-size:var(--lv-font-size-md)">{formatDisplayAnswer(q.answer)}</span>
                  {#if feedback.myAnswer}
                    <span class="lv-muted" style="margin-left:4px">（{t("session.myAnswer")}: <b class="num" style="color:var(--lv-red)">{formatDisplayAnswer(feedback.myAnswer)}</b>）</span>
                  {/if}
                  {#if (feedback.changes ?? 0) > 0}
                    <span class="lv-chip lv-chip--amb num sm" title="作答过程曾修改过选项"><Icon name="rotate" size={11} /> 曾改选 {feedback.changes} 次</span>
                  {/if}
                {/if}
                <button type="button" class="lv-btn sm lv-btn--ghost" style="margin-left:auto" onclick={onundoRecentSubmit} title={t("session.undoTip")}>
                  <Icon name="rotate" size={11} /> {t("session.undo")}
                </button>
                {#if confidenceSel}<span class="lv-chip num">{t("confidence.recorded")}{t("confidence." + confidenceSel)}</span>{/if}
              </div>
            </div>
            {#if q.type === "short"}<div class="lv-analysis"><b>{t("session.referenceAnswer")}</b><div>{formatDisplayAnswer(q.answer)}</div></div>{/if}
            {#if q.type === "short" && currentRubric && rubricScore}
              <div class="lv-card" style="margin:10px 0;padding:var(--lv-space-3) var(--lv-space-4);border-radius:var(--lv-r-2, 10px);border:1px solid var(--lv-border-subtle)">
                <div class="lv-row" style="justify-content:space-between;align-items:center;margin:0 0 8px;flex-wrap:wrap;gap:var(--lv-space-2)">
                  <div class="lv-row" style="margin:0;gap:6px;align-items:center">
                    <b style="font-size:var(--lv-font-size-body-compact)"><Icon name="target" size={13} /> {t("rubric.title")}</b>
                    <button type="button" class="lv-chip sm" class:acc={rubricDeductionsOnly} aria-pressed={rubricDeductionsOnly} onclick={() => rubricDeductionsOnly = !rubricDeductionsOnly} title="折叠已得满分（优秀）项，重点排查扣分项">
                      {rubricDeductionsOnly ? "显示全部采分项" : "仅看扣分项"}
                    </button>
                  </div>
                  <button type="button" class="lv-btn sm" onclick={onautoAlignRubric} title="比对学员输入内容智能识别采分点，一键预填自评分">
                    <Icon name="sparkles" size={12} /> {t("rubric.autoAlign")}
                  </button>
                  <span class="lv-muted" style="font-size:var(--lv-font-size-caption)">{t("rubric.notOfficial")}</span>
                </div>
                {#if currentRubricDrifted}
                  <p class="lv-chip lv-chip--amb num" role="status" style="margin:0 0 8px"><Icon name="pencil" size={11} /> {t("rubric.driftNote")}</p>
                {/if}
                {#each currentRubric.criteria as c (c.id)}
                  {#if !rubricDeductionsOnly || rubricRatings[c.id] !== "full"}
                    <div class="lv-row" style="margin:6px 0;align-items:flex-start;flex-wrap:wrap;gap:var(--lv-space-2)">
                      <span class="lv-chip lv-chip--data num" style="flex:0 0 auto">{Math.round(c.weight * 100)}%</span>
                      <span style="flex:1;min-width:140px;font-size:var(--lv-font-size-sm)">{c.label}{#if c.example}<span class="lv-muted"> · {c.example}</span>{/if}</span>
                      <div class="lv-row" style="margin:0;gap:var(--lv-space-1)">
                        {#each DEFAULT_RUBRIC_LEVELS as lvl (lvl.key)}
                          <button type="button" class="lv-chip" class:acc={rubricRatings[c.id] === lvl.key}
                            aria-pressed={rubricRatings[c.id] === lvl.key}
                            onclick={() => onrubricRatingChange(c.id, lvl.key)}>
                            {t("rubric.level." + lvl.key)}
                          </button>
                        {/each}
                        <button type="button" class="lv-chip" class:amb={rubricRatings[c.id] === "unknown"}
                          aria-pressed={rubricRatings[c.id] === "unknown"}
                          title={t("rubric.unknownTip")}
                          onclick={() => onrubricRatingChange(c.id, "unknown")}>
                          {t("rubric.level.unknown")}
                        </button>
                      </div>
                    </div>
                  {/if}
                {/each}
                <div class="lv-row" style="margin:8px 0 0;align-items:center;gap:var(--lv-space-2);flex-wrap:wrap">
                  {#if rubricScore.complete}
                    <span class="lv-chip lv-chip--data num" style="font-weight:700">{t("rubric.finalScore").replace("{s}", String(rubricScore.finalScore)).replace("{f}", String(rubricScore.fullScore))}</span>
                  {:else}
                    <span class="lv-chip lv-chip--amb num">{t("rubric.partialScore").replace("{e}", String(rubricScore.earned)).replace("{m}", String(rubricScore.ratedMax)).replace("{n}", String(rubricScore.unratedCount))}</span>
                  {/if}
                  {#if rubricEvalResult}
                    <span class="lv-chip lv-chip--grn num" title="智能识别预估分">AI 对齐: {rubricEvalResult.estimatedScore}/{rubricEvalResult.fullScore} ({rubricEvalResult.matchRatio}%)</span>
                  {/if}
                  <button type="button" class="lv-btn sm lv-btn--ghost" disabled={rubricSaveBusy || rubricSaved} onclick={onrecordRubricAssessment} aria-busy={rubricSaveBusy}>
                    <Icon name="save" size={12} /> {rubricSaveBusy ? "…" : rubricSaved ? t("rubric.recorded") : t("rubric.record")}
                  </button>
                  <button type="button" class="lv-btn sm lv-btn--ghost" onclick={onexportRubricCsv}><Icon name="export" size={12} /> CSV</button>
                  {#if recordedRubricSnapshot && !currentRubricDrifted}
                    <span class="lv-muted" style="font-size:var(--lv-font-size-caption)">{recordedRubricSnapshot.complete ? t("rubric.hasRecordedFinal").replace("{s}", String(recordedRubricSnapshot.finalScore ?? 0)).replace("{f}", String(recordedRubricSnapshot.fullScore)) : t("rubric.hasRecordedPartial").replace("{n}", String(recordedRubricSnapshot.unratedCount))}</span>
                  {/if}
                </div>
              </div>
            {/if}
            {#if q.analysis}
              <!-- benchmark-fusion 阶2：核心推导（提交后解锁；默认展开保留既有可读性，可折叠降噪） -->
              <div class="lv-analysis" style="padding:10px 14px">
                <button type="button" class="lv-btn sm lv-btn--ghost" style="margin:0;padding:2px 8px;display:inline-flex;align-items:center;gap:4px"
                  aria-expanded={stageAnalysisOpen} aria-controls="lv-stage-analysis"
                  onclick={() => (stageAnalysisOpen = !stageAnalysisOpen)}>
                  <Icon name="book" size={12} /> {t("session.stageAnalysis", "核心推导")}
                </button>
                {#if stageAnalysisOpen}
                  <div id="lv-stage-analysis" style="margin:8px 0 0;white-space:pre-wrap;font-size:var(--lv-font-size-body);color:var(--lv-text-2)">{q.analysis}</div>
                {/if}
              </div>
            {/if}
            {#if q.expansion}
              <!-- 💡 思路拓展与秒杀技巧（AUTH-02） -->
              <div class="lv-expansion-card" style="margin-top:8px;padding:10px 14px;border-radius:var(--lv-r-2);background:var(--lv-surface-2);border-left:4px solid var(--lv-accent);box-shadow:var(--lv-sh-1)">
                <div style="font-weight:600;font-size:13px;color:var(--lv-accent);display:flex;align-items:center;gap:6px;margin-bottom:4px">
                  <Icon name="bulb" size={14} /> 💡 思路拓展与秒杀技巧
                </div>
                <div style="white-space:pre-wrap;font-size:var(--lv-font-size-body);line-height:1.6;color:var(--lv-text)">{q.expansion}</div>
              </div>
            {/if}
            {#if feedback && (q.source || q.blockId || q.sourceBlockId)}
              <!-- benchmark-fusion 阶3：思源原块溯源（提交后解锁；默认折叠；siyuan:// 深链直达原块） -->
              <div class="lv-analysis" style="padding:10px 14px">
                <button type="button" class="lv-btn sm lv-btn--ghost" style="margin:0;padding:2px 8px;display:inline-flex;align-items:center;gap:4px"
                  aria-expanded={stageSourceOpen} aria-controls="lv-stage-source"
                  onclick={() => (stageSourceOpen = !stageSourceOpen)}>
                  <Icon name="link" size={12} /> {t("session.stageSource", "思源原块溯源")}
                </button>
                {#if stageSourceOpen}
                  <div id="lv-stage-source" style="margin:8px 0 0;font-size:var(--lv-font-size-sm);color:var(--lv-text-2);display:flex;flex-wrap:wrap;gap:6px;align-items:center">
                    {#if q.source}<span class="lv-chip num">{q.source}</span>{/if}
                    {#if q.blockId}
                      {#if onopenInSiYuan}
                        <button type="button" class="lv-chip" onclick={(e) => onopenInSiYuan(q.rootId || "", q.blockId, { event: e })} title="在思源中打开原题块（按住 Ctrl/Cmd 点击可在右侧分屏打开）">{t("session.stageSourceOpen", "打开思源原块")} ↗</button>
                      {:else}
                        <a class="lv-chip" href={`siyuan://blocks/${q.blockId}`}>{t("session.stageSourceOpen", "打开思源原块")} ↗</a>
                      {/if}
                    {/if}
                    {#if q.sourceBlockId && q.sourceBlockId !== q.blockId}
                      {#if onopenInSiYuan}
                        <button type="button" class="lv-chip" onclick={(e) => onopenInSiYuan("", q.sourceBlockId, { event: e })} title="跳转至来源笔记段落（按住 Ctrl/Cmd 点击可在右侧分屏打开）">📖 跳转至来源笔记段落 ↗</button>
                      {:else}
                        <a class="lv-chip" href={`siyuan://blocks/${q.sourceBlockId}`}>📖 跳转至来源笔记段落 ↗</a>
                      {/if}
                    {/if}
                  </div>
                {/if}
              </div>
            {/if}
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
                      onclick={() => onsaveWrongReason(r)}
                    >
                      <span class="lv-reason-key">{ri + 1}</span>
                      {#if savedReason === r}<Icon name="check" size={11} />{/if}
                      <span>{t("reason." + r)}</span>
                    </button>
                  {/each}
                </div>
              </div>
            {/if}
          {/if}

          {#if !feedback}
            <div class="lv-row lv-confidence-timer-row" style="margin:6px 0 10px;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
              <div class="lv-session-dock" role="group" aria-label={t("confidence.before")}>
                <span class="lv-chip lv-conf-label" style="color:var(--lv-text-3);cursor:default">{t("confidence.before")}</span>
                {#each ["sure", "fuzzy", "guess"] as c, _i (_i)}
                  <button type="button" class="lv-chip" class:acc={confidenceSel === c} aria-pressed={confidenceSel === c} title={c === "guess" ? "Key 3 · G" : `Key ${["sure", "fuzzy", "guess"].indexOf(c) + 1}`} onclick={() => onconfidenceSelect(c as "sure" | "fuzzy" | "guess")}>
                    <span class="lv-reason-key">{_i + 1}</span> {t("confidence." + c)}
                  </button>
                {/each}
              </div>
              <span class="lv-chip num"
                class:lv-chip--amb={qTimeoutS > 0 ? (qElapsedS >= qTimeoutS * 0.8 && qElapsedS < qTimeoutS) : qElapsedS >= 90}
                class:lv-chip--red={qTimeoutS > 0 && qElapsedS >= qTimeoutS}
                class:lv-pulse={qTimeoutS > 0 ? qElapsedS >= qTimeoutS : qElapsedS >= 90}
                title={qTimeoutS > 0 ? t("session.timeoutHint").replace("{n}", String(qTimeoutS)) : (qElapsedS >= 90 ? "单题作答已超 90 秒，若卡壳建议标记疑问先行推进，维持大考节奏" : "作答计时")}
              >
                <Icon name="clock" size={12} /> {qElapsedS}s
                {#if qTimeoutS <= 0 && qElapsedS >= 90}
                  <span style="font-size:10px;margin-left:2px">配速预警</span>
                {/if}
              </span>
            </div>
          {/if}

          <div class="lv-row lv-answer-actions" style="align-items:center;flex-wrap:wrap;gap:8px">
            {#if autoNextPending && oncancelAutoNext}
              <div
                class="lv-auto-next-capsule lv-pulse"
                style="display:inline-flex;align-items:center;gap:8px;padding:3px 10px;border-radius:var(--lv-radius-pill, 9999px);background:var(--lv-brand-soft);border:1px solid var(--lv-brand);box-shadow:var(--lv-sh-1)"
                role="status"
                aria-live="polite"
              >
                <span style="font-weight:600;font-size:12px;color:var(--lv-brand);display:inline-flex;align-items:center;gap:4px">
                  <Icon name="clock" size={13} /> ⚡ 答对！{autoNextRemainingS.toFixed(1)}s 后自动切题
                </span>
                <button
                  type="button"
                  class="lv-btn sm lv-btn--primary"
                  style="padding:2px 8px;font-size:11px;min-height:24px"
                  onclick={onnextQuestion}
                  title="立即进入下一题 (快捷键 Space / Enter / →)"
                >
                  立即翻题 ❯
                </button>
                <button
                  type="button"
                  class="lv-btn sm lv-btn--ghost"
                  style="padding:2px 8px;font-size:11px;min-height:24px;color:var(--lv-text)"
                  onclick={oncancelAutoNext}
                  title="取消自动翻题，停留在此题细看考点与解析"
                >
                  停留看解析 ⏸
                </button>
              </div>
            {/if}
            {#if !feedback && !reciteToggle}
              <button class="lv-btn lv-btn--primary" onclick={() => { lvLaunchpad.haptic(10); onsubmitAnswer(); }} disabled={!canSubmitAnswer}>
                {q.type === "multiple" && selected.length > 0 ? t("session.submitSelected").replace("{n}", String(selected.length)) : t("session.submit")}
              </button>
              <button class="lv-btn lv-btn--ghost" onclick={onrequestHint} disabled={explainBusy}><Icon name="bulb" size={14} /> {hintButtonLabel(q)}</button>
              {#if q.type === "fill" || q.type === "short"}
                <button class="lv-btn lv-btn--ghost" onclick={() => { lvLaunchpad.haptic(10); onsubmitAnswer(); }}>{t("session.skip")}</button>
              {/if}
            {:else}
              <button class="lv-btn lv-btn--primary" onclick={() => { lvLaunchpad.haptic(10); onnextQuestion(); }} style="display:inline-flex;align-items:center;gap:4px">
                <span>{reciteToggle ? "已掌握，下一题 (Space / →)" : t("session.next")}</span>
                <Icon name="chev-right" size={13} />
              </button>
              {#if feedback?.verdict === "wrong"}
                <button class="lv-btn" onclick={ondrillVariant} title={t("session.drillVariantTip")}><Icon name="layers" size={15} /> {t("session.drillVariant")}</button>
                <button class="lv-btn" onclick={ontraceMother} title="寻找同考点下最基础的原理母题从头筑基"><Icon name="compass" size={15} /> {t("wrongbook.traceMother")}</button>
                {#if ondiagnosePrereqs}
                  <button type="button" class="lv-btn" onclick={() => ondiagnosePrereqs(q)} title="🧭 自适应根因溯源：分析前置依赖链，定位导致本题失分的先修短板与推荐攻克路径"><Icon name="compass" size={14} /> 🧭 溯源根因</button>
                {/if}
                <button class="lv-btn" onclick={ontoCard} disabled={cardResult === "…"}><Icon name="layers" size={16} /> {cardResult === "…" ? "制卡中…" : t("memory.toCard")}</button>
                {#if cardResult}<span class="lv-muted">{cardResult}</span>{/if}
                <div class="lv-explain-group" style="display:inline-flex;align-items:center;gap:6px">
                  <select class="lv-select" bind:value={explainDepth} disabled={explainBusy} aria-label="选择 AI 讲解模式">
                    <option value="explain">标准核验</option>
                    <option value="dual-loop">分步推导</option>
                    <option value="storm">多视角破题</option>
                  </select>
                  <button class="lv-btn" onclick={() => onexplainCurrent(explainDepth)} disabled={explainBusy} aria-busy={explainBusy}><Icon name="sparkles" size={16} /> {explainBusy ? "…" : t("explain.ask")}</button>
                </div>
                <button class="lv-btn" onclick={onrequestHint} disabled={explainBusy} aria-busy={explainBusy}><Icon name="bulb" size={14} /> {hintButtonLabel(q)}</button>
                <button class="lv-btn" onclick={() => onexplainCurrent("socratic")} disabled={explainBusy} aria-busy={explainBusy}><Icon name="message" size={14} /> {t("explain.socratic")}</button>
              {/if}
            {/if}
            {#if leakPending && session?.current && explainQid === session.current.id}
              <div class="lv-analysis lv-explain">
                <Icon name="alert-triangle" size={13} /> {t("explain.hintLeak").replace("{r}", leakPending.reasons)}
                <div class="lv-row">
                  <button class="lv-btn sm" onclick={onviewLeakedHint}>{t("explain.hintLeakView")}</button>
                  <button class="lv-btn sm" onclick={ondismissLeakedHint}>{t("explain.hintLeakDismiss")}</button>
                </div>
              </div>
            {/if}
            {#if explainText && session?.current && explainQid === session.current.id}
              <div class="lv-analysis lv-explain">{explainText}</div>
              <div class="lv-row">
                {#if explainSavedQid === q.id}
                  <span class="lv-muted" role="status" style="display:inline-flex;align-items:center;gap:4px"><Icon name="check" size={12} /> {t("explain.saved")}</span>
                {:else}
                  <button class="lv-btn sm" onclick={onsaveExplain} disabled={explainSaveBusy} aria-busy={explainSaveBusy}><Icon name="pin" size={13} /> {explainSaveBusy ? "…" : explainSaveError ? t("explain.retrySave") : t("explain.save")}</button>
                {/if}
                <button class="lv-btn sm" onclick={onrequestHint} disabled={explainBusy}><Icon name="bulb" size={14} /> {hintButtonLabel(q)}</button>
                <button class="lv-btn sm" onclick={() => onexplainCurrent("socratic")} disabled={explainBusy}><Icon name="message" size={14} /> {t("explain.socratic")}</button>
              </div>
              {#if explainSaveErrorQid === q.id && explainSaveError}<div class="lv-error" role="alert">{t("explain.saveFailed").replace("{message}", explainSaveError)}</div>{/if}
              <div class="lv-row">
                <input class="lv-input" style="flex:1;min-width:160px" placeholder={t("explain.followUp")}
                  aria-label={t("explain.followUp")}
                  bind:value={explainFollowUp}
                  onkeydown={(e) => !e.isComposing && e.keyCode !== 229 && e.key === "Enter" && onsendFollowUp()} />
                <button class="lv-btn sm" onclick={onsendFollowUp} disabled={explainBusy || !explainFollowUp.trim()}>{t("explain.send")}</button>
              </div>
            {/if}
          </div>
          {#if reasonPromptQid === q.id && !feedback}
            <div class="lv-row lv-reason" role="group" aria-label={t("trail.reasonTitle")}>
              <span class="lv-muted" style="font-size:var(--lv-font-size-caption)">{t("trail.reasonTitle")}</span>
              <button class="lv-chip" onclick={() => onsetEditReason(q.id, "unsure")}>{t("trail.reason.unsure")}</button>
              <button class="lv-chip" onclick={() => onsetEditReason(q.id, "evidence")}>{t("trail.reason.evidence")}</button>
              <button class="lv-chip" onclick={() => onsetEditReason(q.id, "misclick")}>{t("trail.reason.misclick")}</button>
              <button class="lv-chip lv-btn--ghost" onclick={ondismissReasonPrompt}>{t("trail.reason.skip")}</button>
            </div>
          {/if}
        </div>
      </div>
      <aside class="lv-session-side">
        <div class="lv-card lv-side-card">
          <b class="lv-side-title">{t("session.side.q")}</b>
          <div class="lv-side-rows">
            {#if q.kp && (feedback || stageHintOpen)}<span class="lv-chip"><Icon name="layers" size={11} /> {q.kp}</span>{/if}
            {#if q.source}<span class="lv-chip num" title={t("manual.source")}>{q.source}</span>{/if}
            {#if q.difficulty}<span class="lv-chip num" style="display:inline-flex;align-items:center;gap:4px"><Icon name="star" size={11} /> {q.difficulty}</span>{/if}
            {#if q.score}<span class="lv-chip num">{t("manual.score")} {q.score}</span>{/if}
            {#if curQStats && curQStats.attempts > 0}
              <span class="lv-chip lv-chip--data num" title={t("browse.usage").replace("{a}", String(curQStats.attempts)).replace("{c}", String(Math.round((curQStats.correct / curQStats.attempts) * 100)))}>
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
            <span class="lv-kbd">G</span> {t("confidence.guess")} ·
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

<style>
  /* —— 会话屏右栏（原型 practice 布局：主纸面 + 条件卡） —— */
  .lv-session-grid { display: grid; grid-template-columns: minmax(0, 1fr) 248px; gap: var(--lv-space-5); align-items: start; max-width: 1040px; }
  .lv-session-grid .lv-session-head { grid-column: 1 / -1; }
  .lv-session-main { min-width: 0; }
  .lv-session-main .lv-card { max-width: 660px; box-shadow: var(--lv-sh-card), var(--lv-inset-highlight, inset 0 1px 0 transparent); border-radius: var(--lv-r-3); border: 1px solid var(--lv-border-subtle, var(--lv-border)); }
  .lv-side-card { padding: var(--lv-space-4) var(--lv-space-panel); margin-bottom: 14px; }
  .lv-side-title { display: block; font-size: var(--lv-font-size-md); font-weight: var(--lv-font-weight-semibold); margin-bottom: 10px; }
  .lv-side-rows { display: flex; flex-wrap: wrap; gap: var(--lv-space-compact); }
  @container lv-exam (max-width: 960px) { .lv-session-grid { grid-template-columns: minmax(0, 1fr); } .lv-session-side { order: 2; } }
  .lv-session-head { justify-content: flex-start; }
  .lv-session-head-bar { display: contents; }
  .lv-session-tools-collapse { display: contents; }
  .lv-session-tools-toggle { display: none; }
  @container lv-exam (max-width: 680px) {
    .lv-pad { padding: 8px 12px calc(16px + env(safe-area-inset-bottom, 0px)); }
    .lv-session-grid {
      display: flex;
      flex-direction: column;
      gap: 10px;
      overflow-y: auto;
      overscroll-behavior-y: contain;
      -webkit-overflow-scrolling: touch;
    }
    .lv-session-main {
      width: 100%;
      min-width: 0;
      overflow-y: visible;
    }
    .lv-session-head {
      flex-direction: column;
      align-items: stretch;
      gap: 6px;
      margin: 0 !important;
      width: 100%;
    }
    .lv-session-head-bar {
      display: flex;
      align-items: center;
      flex-wrap: nowrap;
      gap: 6px;
      margin: 0 !important;
      width: 100%;
      min-width: 0;
    }
    .lv-session-exit-btn {
      min-height: 32px !important;
      height: 32px !important;
      padding: 0 8px !important;
      font-size: 12px !important;
      flex-shrink: 0;
    }
    .lv-session-prog-wrap {
      flex: 1 1 0;
      min-width: 0 !important;
      margin: 0 !important;
      gap: 6px !important;
      flex-wrap: nowrap !important;
    }
    .lv-session-head .lv-progress { min-width: 48px; }
    .lv-session-qtype {
      flex-shrink: 0;
      padding: 2px 7px;
      font-size: 11.5px;
    }
    .lv-session-tools-toggle {
      display: inline-flex;
      flex-shrink: 0;
      min-height: 30px;
      height: 30px;
      padding: 0 8px;
      font-size: 11.5px;
    }
    .lv-session-tools-collapse {
      display: none;
    }
    .lv-session-tools-collapse.open {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      padding: 8px;
      background: var(--lv-surface);
      border: 1px solid var(--lv-border-subtle);
      border-radius: var(--lv-r-2);
    }
    .lv-question { margin-top: 2px; }
    .lv-stage-hint-box {
      padding: 4px 10px !important;
      margin-bottom: 6px !important;
    }
    .lv-stage-hint-box .lv-btn.sm {
      min-height: 28px !important;
      height: 28px !important;
      font-size: 12px;
    }
    .lv-confidence-timer-row {
      flex-wrap: nowrap !important;
      gap: 4px !important;
      margin: 6px 0 8px !important;
    }
    .lv-confidence-timer-row .lv-conf-label {
      display: none;
    }
    .lv-confidence-timer-row .lv-session-dock {
      flex-wrap: nowrap;
    }
    .lv-confidence-timer-row .lv-session-dock .lv-chip {
      padding: 2px 6px;
      font-size: 11.5px;
    }
    .lv-answer-actions {
      align-items: center;
      margin-top: 10px;
      padding: 8px 10px;
      gap: 6px !important;
    }
    .lv-answer-actions > .lv-btn {
      flex: 1 1 auto;
      min-width: 0;
      min-height: 40px;
      height: 40px;
      padding: 0 12px;
      font-size: 13px;
    }
    .lv-answer-actions > .lv-btn.lv-btn--primary {
      min-height: 44px;
      height: 44px;
      font-weight: var(--lv-font-weight-semibold, 600);
    }
    .lv-opt {
      min-height: 48px;
      padding: 12px 14px;
      margin-bottom: 8px;
    }
    .lv-opt .key {
      width: 32px;
      height: 32px;
      font-size: 13px;
    }
  }
  @media (max-width: 759px) and (max-height: 480px) {
    .lv-pad { padding: 4px 10px 8px !important; }
    .lv-session-grid { gap: 4px; }
    .lv-question {
      margin-top: 0 !important;
      padding: 8px 10px !important;
    }
    .lv-stem {
      font-size: 14.5px !important;
      line-height: 1.4 !important;
      margin-bottom: 6px !important;
    }
    .lv-question > p.lv-muted[role="note"] {
      display: none !important;
    }
    .lv-question textarea.lv-textarea {
      min-height: 48px !important;
      max-height: 68px !important;
      padding: 6px 10px !important;
    }
    .lv-confidence-timer-row {
      margin: 4px 0 !important;
    }
    .lv-answer-actions {
      margin-top: 6px !important;
      padding: 6px 8px !important;
    }
  }
  .lv-pure .lv-stem, .lv-pure .lv-opt > span:not(.key) { display: none; }
  .lv-pure .lv-opt .key { filter: none; }
  .lv-pure .lv-opt { justify-content: center; }
  .lv-question { margin-top: 10px; }
  .lv-stem { font-size: 19px; line-height: 1.75; font-weight: 600; letter-spacing: -0.015em; margin-bottom: 18px; white-space: pre-wrap; -webkit-font-smoothing: antialiased; max-width: var(--lv-max-stem-width, 780px); }
  .lv-opt,
  .lv-opt * {
    user-select: none !important;
    -webkit-user-select: none !important;
    -webkit-touch-callout: none !important;
  }
  .lv-opt { display: flex; gap: 14px; align-items: center; width: 100%; min-height: 52px; box-sizing: border-box; max-width: var(--lv-max-reading-width, 820px); text-align: left; padding: 16px 20px; border-radius: var(--lv-r-3); border: 1.5px solid var(--lv-ctl-border); margin-bottom: 12px; cursor: pointer; background: var(--lv-surface); font: inherit; color: inherit; box-shadow: var(--lv-sh-1), var(--lv-inset-card); touch-action: manipulation; transition: background-color var(--lv-dur-micro) ease, border-color var(--lv-dur-micro) ease, box-shadow var(--lv-dur-micro) ease, transform var(--lv-dur-micro) ease; }
  .lv-opt:hover:not([disabled]) { border-color: var(--lv-border-hover, var(--lv-accent)); background: color-mix(in srgb, var(--lv-accent) 4.5%, var(--lv-surface)); transform: translateY(-1px); box-shadow: var(--lv-sh-2); }
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
  .lv-opt.sel { border-color: var(--lv-accent); background: color-mix(in srgb, var(--lv-accent-soft) 85%, var(--lv-surface)); box-shadow: 0 0 0 1.5px var(--lv-accent), 0 3px 10px color-mix(in srgb, var(--lv-accent) 18%, transparent); }
  .lv-opt.sel .key { background: var(--lv-accent); border-color: var(--lv-accent); color: var(--lv-on-accent, #fff); box-shadow: 0 2px 8px color-mix(in srgb, var(--lv-accent) 28%, transparent); transform: scale(1.04); }
  .lv-opt.right { border-color: var(--lv-green); background: var(--lv-green-soft); box-shadow: 0 0 0 1px var(--lv-green), 0 4px 14px color-mix(in srgb, var(--lv-green) 18%, transparent); }
  .lv-opt.right .key { background: var(--lv-green); border-color: var(--lv-green); color: var(--lv-on-green, #fff); }
  .lv-opt.wrong { border-color: var(--lv-red); background: var(--lv-red-soft); box-shadow: 0 0 0 1px var(--lv-red), 0 4px 14px color-mix(in srgb, var(--lv-red) 18%, transparent); }
  .lv-opt.wrong .key { background: var(--lv-red); border-color: var(--lv-red); color: var(--lv-on-red, #fff); }
  .lv-opt.eliminated { opacity: 0.45; background: var(--lv-surface-2) !important; border-style: dashed !important; }
  .lv-opt.eliminated .lv-opt-text { text-decoration: line-through; }
  .lv-opt.eliminated .key { opacity: 0.6; text-decoration: line-through; }
  .lv-feedback { margin: 16px 0 12px; padding: 14px 18px; border: 1px solid color-mix(in srgb, var(--lv-red) 26%, var(--lv-border)); border-left: 3.5px solid var(--lv-red); border-radius: var(--lv-r-2); font-weight: var(--lv-font-weight-semibold); font-size: var(--lv-font-size-md); background: color-mix(in srgb, var(--lv-red-soft) 85%, var(--lv-surface)); color: var(--lv-red); box-shadow: var(--lv-sh-1); animation: lv-appear var(--lv-dur-view) var(--lv-ease-out); max-width: var(--lv-max-reading-width, 820px); }
  .lv-feedback.good { border-color: color-mix(in srgb, var(--lv-green) 26%, var(--lv-border)); border-left-color: var(--lv-green); background: color-mix(in srgb, var(--lv-green-soft) 85%, var(--lv-surface)); color: var(--lv-green); box-shadow: var(--lv-sh-1); }
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
  .lv-answer-actions > .lv-btn,
  .lv-answer-actions .lv-explain-group > .lv-btn,
  .lv-answer-actions .lv-explain-group > .lv-select {
    min-height: 38px;
    height: 38px;
    border-radius: 9999px;
    font-weight: var(--lv-font-weight-semibold, 600);
    padding: 0 18px;
    transition: transform var(--lv-dur-micro, 0.15s) ease, background-color var(--lv-dur-micro) ease;
  }
  .lv-answer-actions .lv-explain-group > .lv-select {
    padding: 0 14px;
    width: auto;
    font-size: var(--lv-font-size-sm);
  }
  .lv-answer-actions > .lv-btn:active {
    transform: scale(0.97);
  }
  /* —— 改答原因弹层（63-03：轻量内联，不阻断作答） —— */
  .lv-reason { margin: 10px 0 0; padding: 12px 16px; border-radius: var(--lv-r-3); border: 1px solid var(--lv-border); border-left: 4px solid var(--lv-amber); background: color-mix(in srgb, var(--lv-amber-soft) 35%, var(--lv-surface)); box-shadow: var(--lv-sh-1), var(--lv-inset-card); }
  /* —— 结构化作答框（54 第三刀：数值单行 / 多空逐空） —— */
  .lv-question textarea.lv-textarea,
  .lv-answer-num,
  .lv-answer-blank {
    width: 100%;
    box-sizing: border-box;
  }
  .lv-answer-num { min-height: 48px; font-size: 16px; font-variant-numeric: tabular-nums; }
  .lv-answer-blank { min-height: 44px; margin-bottom: 10px; }
  .lv-analysis { border: 1px solid var(--lv-border); border-left: 4px solid var(--lv-accent); background: var(--lv-surface-2); border-radius: var(--lv-r-2); padding: 14px 18px; font-size: var(--lv-font-size-body); color: var(--lv-text-2); margin-bottom: 12px; white-space: pre-wrap; box-shadow: var(--lv-sh-1); }
  .lv-reason-btn { padding: 4px 10px; border-radius: var(--lv-r-1); cursor: pointer; touch-action: manipulation; transition: transform var(--lv-dur-micro) ease, background-color var(--lv-dur-micro) ease, border-color var(--lv-dur-micro) ease; }
  .lv-reason-btn:hover { transform: translateY(-1px); border-color: var(--lv-accent); }
  .lv-reason-btn:active { transform: scale(0.96); }
  .lv-reason-key { display: inline-grid; place-items: center; width: 16px; height: 16px; border-radius: 4px; margin-right: 4px; font-size: 10px; font-weight: 700; font-family: ui-monospace, monospace; background: color-mix(in srgb, var(--lv-text) 10%, transparent); color: var(--lv-text-2); }
</style>
