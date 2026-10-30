<script lang="ts">
  import Icon from "../shared/Icon.svelte";
  import PracticeDoneCard from "./PracticeDoneCard.svelte";
  import ScratchpadDrawer from "./ScratchpadDrawer.svelte";
  import GroupBatchSummaryCard from "./GroupBatchSummaryCard.svelte";
  import MaterialGroupContextCard from "./MaterialGroupContextCard.svelte";
  import SpeechEvalCapsule from "./SpeechEvalCapsule.svelte";
  import type { Question } from "@/core/types";
  import type { PracticeSession } from "@/core/session";
  import type { SpeechEvalResult } from "@/core/speechEval";
  import { countWordsAndCharacters, generatePaperGrid } from "@/core/wordCount";
  import type { SiblingItem, MaterialGroupContext } from "@/core/materialContext";
  import type { ScratchpadMode } from "@/core/scratchpad";

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
    speechEvalResult: SpeechEvalResult | null;
    speechRecording: boolean;
    reciteToggle: boolean;
    speedDrillEnabled: boolean;
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
    onstartSpeech: (target: string, lang: string) => void;
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
    ondismissSpeechEval: () => void;
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
    onnextQuestion: () => void;
    ondrillVariant: () => void;
    ontraceMother: () => void;
    ontoCard: () => void;
    onexplainCurrent: (mode: "explain" | "socratic") => void;
    onviewLeakedHint: () => void;
    ondismissLeakedHint: () => void;
    onsaveExplain: () => void;
    onsendFollowUp: () => void;
    onsetEditReason: (qid: string, r: any) => void;
    ondismissReasonPrompt: () => void;
    ontouchStart: (e: TouchEvent) => void;
    ontouchEnd: (e: TouchEvent) => void;
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
    speechEvalResult = $bindable(),
    speechRecording,
    reciteToggle,
    speedDrillEnabled = $bindable(),
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
    onnextQuestion,
    ondrillVariant,
    ontraceMother,
    ontoCard,
    onexplainCurrent,
    onviewLeakedHint,
    ondismissLeakedHint,
    onsaveExplain,
    onsendFollowUp,
    onsetEditReason,
    ondismissReasonPrompt,
    ontouchStart,
    ontouchEnd,
  }: Props = $props();
</script>

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
    {ontoggleReview}
    {onsameKpSession}
    {onwrongsToCard}
    {onwrongsToActions}
    {onopenReport}
    {onstartNextDrill}
    {oneditReflection}
    {onrunMisdiagnosis}
    {onadoptMisdiagnosis}
    onexitSession={onexitSession}
  />
{:else}
  {@const q = curQ}
  {#if q}
    <div class="lv-pad lv-session-grid">
      <div class="lv-row lv-session-head">
        <button class="lv-btn lv-btn--ghost" onclick={onexitSession} disabled={exitBusy}>← {exitBusy ? "…" : t("session.exit")}</button>
        <div class="lv-row" style="flex:1;min-width:120px;gap:var(--lv-space-2)">
          <div class="lv-progress" style="flex:1" role="progressbar" aria-label={t("session.progress")} aria-valuemin="0" aria-valuemax={curProgress.total} aria-valuenow={curProgress.done}><i style="width:{curProgress.total ? Math.round((curProgress.done / curProgress.total) * 100) : 0}%"></i></div>
          <span class="num lv-muted">{curProgress.done}/{curProgress.total}</span>
        </div>
        <span class="lv-chip lv-chip--acc">{t("qtype." + q.type)}</span>
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
          <button type="button" class="lv-chip num sm" class:acc={ttsSlowRate} onclick={ontoggleTtsSlow} title="切换语音语速（0.8x 慢速磨耳朵 / 1.0x 正常）">
            {ttsSlowRate ? "0.8x" : "1.0x"}
          </button>
          <button type="button" class="lv-chip num sm" onclick={oncycleStudyFontSize} title="切换题干字号大小（标准 16px / 大号 19px / 特大 22px）">
            A{studyFontSize === "normal" ? "" : studyFontSize === "large" ? "⁺" : "²⁺"}
          </button>
          <button type="button" class="lv-chip" class:acc={speechRecording} onclick={() => onstartSpeech(q.answer || q.stem, q.studyMeta?.lang || "zh-CN")} title="开启麦克风发音跟读录音与匹配度测评">
            <Icon name="mic" size={13} /> {speechRecording ? "跟读中…" : "跟读测评"}
          </button>
          <button class="lv-chip" class:acc={reciteToggle} title={t("session.reciteMode")} aria-pressed={reciteToggle} onclick={ontoggleRecite}><Icon name="eye" size={13} /> {t("session.reciteMode")}</button>
          <button class="lv-chip" class:acc={!!q.fav} title="E" aria-label={t("session.kbdFav")} aria-pressed={!!q.fav} aria-busy={favBusy} disabled={favBusy} onclick={ontoggleFavCurrent}><Icon name="star" size={13} /></button>
        </div>
        <div class="lv-session-dock" role="group" aria-label="辅助工具坞">
          <button class="lv-chip" class:acc={scratchpadOpen} title={t("scratchpad.tip")} aria-pressed={scratchpadOpen} onclick={ontoggleScratchpad}><Icon name="pencil" size={13} /></button>
          <button class="lv-chip" class:acc={speedDrillEnabled} title={t("session.speedDrillTip")} aria-pressed={speedDrillEnabled} onclick={() => { speedDrillEnabled = !speedDrillEnabled; }}><Icon name="zap" size={13} /></button>
          <button class="lv-chip" class:acc={pureListen} title={t("tts.pureListen")} aria-label={t("tts.pureListen")} aria-pressed={pureListen} onclick={ontogglePureListen}><Icon name="eyeoff" size={13} /></button>
          <button class="lv-chip" class:acc={soundEnabled} title={soundEnabled ? t("sound.disable") : t("sound.enable")} onclick={() => { soundEnabled = !soundEnabled; }}><Icon name={soundEnabled ? "volume" : "volume-x"} size={13} /></button>
          <button class="lv-chip" class:acc={hotkeysHelpOpen} title={t("hotkeys.tip")} onclick={() => (hotkeysHelpOpen = !hotkeysHelpOpen)}><Icon name="activity" size={13} /></button>
        </div>
        <span class="lv-chip" style="gap:2px;padding:2px 4px">
          <button class="lv-btn sm lv-btn--ghost" style="padding:1px 5px;font-size:11px" class:acc={(q.userTags || []).includes("star")} title={t("session.tagStar")} onclick={() => ontoggleUserTag("star")}><Icon name="star" size={12} /></button>
          <button class="lv-btn sm lv-btn--ghost" style="padding:1px 5px;font-size:11px" class:acc={(q.userTags || []).includes("trap")} title={t("session.tagTrap")} onclick={() => ontoggleUserTag("trap")}><Icon name="alert-triangle" size={12} /></button>
          <button class="lv-btn sm lv-btn--ghost" style="padding:1px 5px;font-size:11px" class:acc={(q.userTags || []).includes("doubt")} title={t("session.tagDoubt")} onclick={() => ontoggleUserTag("doubt")}><Icon name="help" size={12} /></button>
          <button class="lv-btn sm lv-btn--ghost" style="padding:1px 5px;font-size:11px" class:acc={(q.userTags || []).includes("key")} title={t("session.tagKey")} onclick={() => ontoggleUserTag("key")}><Icon name="bulb" size={12} /></button>
        </span>
      </div>
      <div class="lv-session-main">
        <ScratchpadDrawer
          open={scratchpadOpen}
          mode={scratchpadMode}
          text={currentScratchpadText}
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
          <SpeechEvalCapsule result={speechEvalResult} ondismiss={ondismissSpeechEval} />
          {#if q.studyMeta?.phonetic}
            <div class="lv-phonetic-badge" style="margin:4px 0 10px;display:inline-flex;align-items:center;gap:6px;padding:3px 12px;border-radius:var(--lv-radius-pill, 9999px);background:var(--lv-surface-2);border:1px solid var(--lv-border-subtle);font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;color:var(--lv-brand)">
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
              <div class="lv-row" style="margin:0 0 4px">
                <button class="lv-chip" class:acc={hideOptions} onclick={ontoggleHideOptions}>
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
                      class:right={feedback && feedback.verdict !== "not_attempted" && (q.type === "multiple" ? q.answer.includes(choice.value) : q.answer === choice.value)}
                      class:wrong={feedback?.verdict === "wrong" && (q.type === "multiple" ? (feedback.myAnswer ?? "").includes(choice.value) && !q.answer.includes(choice.value) : feedback.myAnswer === choice.value)}
                      disabled={!!feedback}
                      onclick={() => onpickChoice(choice.value)}>
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
                value={feedback?.myAnswer ?? currentDraft}
                oninput={(e) => ondraftInput((e.target as HTMLInputElement).value)}
                onchange={(e) => ondraftChange((e.target as HTMLInputElement).value)}
                disabled={!!feedback} />
              {#if curSpec.unit}<div class="lv-row" style="margin:6px 0 0"><span class="lv-chip num">{t("session.unitLabel")}：{curSpec.unit}</span></div>{/if}
            {:else if curSpec?.kind === "multiBlank"}
              <div class="lv-row" style="margin:0 0 6px"><span class="lv-muted" style="font-size:var(--lv-font-size-caption)">{t("session.blankHint")}</span></div>
              {#each blankParts as _p, i (i)}
                <input class="lv-input lv-answer-blank" placeholder={t("session.blankN").replace("{n}", String(i + 1))}
                  value={blankParts[i]}
                  oninput={(e) => onsetBlank(i, (e.target as HTMLInputElement).value)}
                  onchange={onblankChange}
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
                    <button type="button" class="lv-btn sm lv-btn--ghost" style="padding:1px 6px;font-size:11px" class:acc={shortLinedPaper} onclick={ontoggleLinedPaper} title="切换横线稿纸视觉背景">
                      <Icon name="file-text" size={11} /> {shortLinedPaper ? "纯白底" : "横线纸"}
                    </button>
                    <button type="button" class="lv-btn sm lv-btn--ghost" style="padding:1px 6px;font-size:11px" onclick={ontogglePaperGridModal} title={t("session.gridPreview")}>
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
                  <div class="lv-card" style="margin:8px 0;padding:12px 14px;background:var(--lv-surface-2);border:1px solid var(--lv-border-subtle);border-left:3.5px solid var(--lv-accent);border-radius:var(--lv-r-card, 16px);box-shadow:var(--lv-sh-1)">
                    <div class="lv-row" style="justify-content:space-between;align-items:center;margin-bottom:6px">
                      <b style="font-size:12px;display:flex;align-items:center;gap:6px">
                        <Icon name="file-text" size={13} /> 考场 20×20 规范作文答题纸模拟（已占 {gridModel.totalCellsOccupied} 格 · {gridModel.totalRows} 行）
                      </b>
                      <button type="button" class="lv-btn sm lv-btn--ghost" onclick={ontogglePaperGridModal} aria-label="关闭"><Icon name="close" size={12} /></button>
                    </div>
                    <div style="display:flex;flex-direction:column;gap:2px;overflow-x:auto;padding:6px;background:var(--lv-surface);border:1px solid var(--lv-border-subtle);border-radius:var(--lv-r-card, 10px);max-height:200px">
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
                <button type="button" class="lv-btn sm lv-btn--ghost" style="margin-left:auto" onclick={onundoRecentSubmit} title={t("session.undoTip")}>
                  <Icon name="rotate" size={11} /> {t("session.undo")}
                </button>
                {#if confidenceSel}<span class="lv-chip num">{t("confidence.recorded")}{t("confidence." + confidenceSel)}</span>{/if}
              </div>
            </div>
            {#if q.type === "short"}<div class="lv-analysis"><b>{t("session.referenceAnswer")}</b><div>{q.answer}</div></div>{/if}
            {#if q.type === "short" && currentRubric && rubricScore}
              <div class="lv-card" style="margin:10px 0;padding:var(--lv-space-3) var(--lv-space-4)">
                <div class="lv-row" style="justify-content:space-between;align-items:center;margin:0 0 8px;flex-wrap:wrap;gap:var(--lv-space-2)">
                  <b style="font-size:var(--lv-font-size-body-compact)"><Icon name="target" size={13} /> {t("rubric.title")}</b>
                  <button type="button" class="lv-btn sm lv-btn--ghost" onclick={onautoAlignRubric} title="比对学员输入内容智能识别采分点，一键预填自评分">
                    <Icon name="sparkles" size={12} /> {t("rubric.autoAlign")}
                  </button>
                  <span class="lv-muted" style="font-size:var(--lv-font-size-caption)">{t("rubric.notOfficial")}</span>
                </div>
                {#if currentRubricDrifted}
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
                      onclick={() => onsaveWrongReason(r)}
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
                  <button type="button" class="lv-chip" class:acc={confidenceSel === c} aria-pressed={confidenceSel === c} title={`Key ${["sure", "fuzzy", "guess"].indexOf(c) + 1}`} onclick={() => onconfidenceSelect(c as "sure" | "fuzzy" | "guess")}>
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
              <button class="lv-btn lv-btn--primary" onclick={onsubmitAnswer} disabled={!canSubmitAnswer}>
                {q.type === "multiple" && selected.length > 0 ? t("session.submitSelected").replace("{n}", String(selected.length)) : t("session.submit")}
              </button>
              <button class="lv-btn lv-btn--ghost" onclick={onrequestHint} disabled={explainBusy}><Icon name="bulb" size={14} /> {hintButtonLabel(q)}</button>
              {#if q.type === "fill" || q.type === "short"}
                <button class="lv-btn lv-btn--ghost" onclick={onsubmitAnswer}>{t("session.skip")}</button>
              {/if}
            {:else}
              <button class="lv-btn lv-btn--primary" onclick={onnextQuestion} style="display:inline-flex;align-items:center;gap:4px">
                <span>{t("session.next")}</span>
                <Icon name="chev-right" size={13} />
              </button>
              {#if feedback.verdict === "wrong"}
                <button class="lv-btn" onclick={ondrillVariant} title={t("session.drillVariantTip")}><Icon name="layers" size={15} /> {t("session.drillVariant")}</button>
                <button class="lv-btn" onclick={ontraceMother} title="寻找同考点下最基础的原理母题从头筑基"><Icon name="compass" size={15} /> {t("wrongbook.traceMother")}</button>
                <button class="lv-btn" onclick={ontoCard} disabled={cardResult === "…"}><Icon name="layers" size={16} /> {cardResult === "…" ? "制卡中…" : t("memory.toCard")}</button>
                {#if cardResult}<span class="lv-muted">{cardResult}</span>{/if}
                <button class="lv-btn" onclick={() => onexplainCurrent("explain")} disabled={explainBusy}><Icon name="sparkles" size={16} /> {explainBusy ? "…" : t("explain.ask")}</button>
                <button class="lv-btn" onclick={onrequestHint} disabled={explainBusy}><Icon name="bulb" size={14} /> {hintButtonLabel(q)}</button>
                <button class="lv-btn" onclick={() => onexplainCurrent("socratic")} disabled={explainBusy}><Icon name="message" size={14} /> {t("explain.socratic")}</button>
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
                  <span class="lv-muted" role="status">✓ {t("explain.saved")}</span>
                {:else}
                  <button class="lv-btn sm" onclick={onsaveExplain} disabled={explainSaveBusy} aria-busy={explainSaveBusy}><Icon name="pin" size={13} /> {explainSaveBusy ? "…" : explainSaveError ? t("explain.retrySave") : t("explain.save")}</button>
                {/if}
                <button class="lv-btn sm" onclick={onrequestHint} disabled={explainBusy}><Icon name="bulb" size={14} /> {hintButtonLabel(q)}</button>
                <button class="lv-btn sm" onclick={() => onexplainCurrent("socratic")} disabled={explainBusy}><Icon name="message" size={14} /> {t("explain.socratic")}</button>
              </div>
              {#if explainSaveErrorQid === q.id && explainSaveError}<div class="lv-error" role="alert">{t("explain.saveFailed").replace("{message}", explainSaveError)}</div>{/if}
              <div class="lv-row">
                <input class="lv-input" style="flex:1;min-width:160px" placeholder={t("explain.followUp")}
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
  .lv-stem { font-size: 19px; line-height: 1.75; font-weight: 600; letter-spacing: -0.015em; margin-bottom: 18px; white-space: pre-wrap; -webkit-font-smoothing: antialiased; max-width: var(--lv-max-stem-width, 780px); }
  .lv-opt { display: flex; gap: 14px; align-items: center; width: 100%; max-width: var(--lv-max-reading-width, 820px); text-align: left; padding: 16px 20px; border-radius: var(--lv-r-3); border: 1.5px solid var(--lv-ctl-border); margin-bottom: 12px; cursor: pointer; background: var(--lv-surface); font: inherit; color: inherit; box-shadow: var(--lv-sh-1), var(--lv-inset-card); transition: background-color var(--lv-dur-micro) ease, border-color var(--lv-dur-micro) ease, box-shadow var(--lv-dur-micro) ease, transform var(--lv-dur-micro) ease; }
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
  .lv-feedback { margin: 16px 0 12px; padding: 14px 18px; border: 1px solid color-mix(in srgb, var(--lv-red) 26%, var(--lv-border)); border-left: 3.5px solid var(--lv-red); border-radius: var(--lv-r-2); font-weight: var(--lv-font-weight-semibold); font-size: var(--lv-font-size-md); background: color-mix(in srgb, var(--lv-red-soft) 85%, var(--lv-surface)); color: var(--lv-red); box-shadow: var(--lv-sh-1); animation: lv-appear var(--lv-dur-view) var(--lv-ease-out); max-width: var(--lv-max-reading-width, 820px); }
  .lv-feedback.good { border-color: color-mix(in srgb, var(--lv-green) 26%, var(--lv-border)); border-left-color: var(--lv-green); background: color-mix(in srgb, var(--lv-green-soft) 85%, var(--lv-surface)); color: var(--lv-green); box-shadow: var(--lv-sh-1); }
  .lv-chip--amb { color: var(--lv-amber); background: var(--lv-amber-soft); border-color: color-mix(in srgb, var(--lv-amber) 25%, transparent); }
  .lv-chip--red { color: var(--lv-red); background: var(--lv-red-soft); border-color: color-mix(in srgb, var(--lv-red) 25%, transparent); }
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
  .lv-reason-btn { padding: 4px 10px; border-radius: var(--lv-r-1); cursor: pointer; touch-action: manipulation; transition: transform var(--lv-dur-micro) ease, background-color var(--lv-dur-micro) ease, border-color var(--lv-dur-micro) ease; }
  .lv-reason-btn:hover { transform: translateY(-1px); border-color: var(--lv-accent); }
  .lv-reason-btn:active { transform: scale(0.96); }
  .lv-reason-key { display: inline-grid; place-items: center; width: 16px; height: 16px; border-radius: 4px; margin-right: 4px; font-size: 10px; font-weight: 700; font-family: ui-monospace, monospace; background: color-mix(in srgb, var(--lv-text) 10%, transparent); color: var(--lv-text-2); }
</style>
