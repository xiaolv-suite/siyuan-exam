<script lang="ts">
  import Icon from "../shared/Icon.svelte";
  import type { Question, QuestionLifecycleStatus } from "../../core/types";
  import type { ExamApp } from "../../app";
  import BrowseMaintenanceDrawers from "./BrowseMaintenanceDrawers.svelte";
  import QuestionPeekDrawer from "./QuestionPeekDrawer.svelte";

  type QuestionWithBlock = Question & { blockId: string };

  interface Props {
    searchText: string;
    filterType: string;
    filterStatus: string;
    filterSource: string;
    filterDays: number;
    sourceOptions: string[];
    filterWrong: boolean;
    filterDispute: boolean;
    filterHelp: boolean;
    favOnly: boolean;
    filterUserTag: string;
    smartViews: any[];
    selectedView: string;
    smartViewBusy: boolean;
    smartViewLoadBusy: boolean;
    smartViewLoadFailed: boolean;
    smartViewError: string;
    activeBankId: string;
    shownQuestions: Question[];
    questions: Question[];
    sectionOpen: boolean;
    batchMode: boolean;
    selectedIds: Record<string, boolean>;
    moreOpen: boolean;
    kpOpen: boolean;
    healthOpen: boolean;
    errataOpen: boolean;
    paperOpen: boolean;
    sectionSel: any;
    sectionLabel: string;
    moreRoot: HTMLDivElement | null;
    morePop: HTMLDivElement | null;
    app: ExamApp;
    questionMap: Map<string, Question>;
    sectionBusy: boolean;
    sectionTree: any[];
    kpData: any;
    kpMergeFrom: string;
    kpMergeTo: string;
    kpMergePlan: any;
    kpFillKp: string;
    kpFillPlan: any;
    kpBusy: boolean;
    kpNote: string;
    sylDoc: any;
    sylKpStats: any;
    sylPublisher: string;
    sylYear: string;
    sylSource: string;
    sylText: string;
    sylPreviewRoots: any;
    sylError: string;
    sylNote: string;
    paperText: string;
    paperPreview: any;
    paperBusy: boolean;
    paperNote: string;
    errataBusy: boolean;
    errataErrors: any[];
    errataPlan: any;
    errataNote: string;
    selectedCount: number;
    batchCardBusy: boolean;
    batchField: string;
    batchValue: string;
    batchBusy: boolean;
    batchPreview: any;
    batchUndoHere: boolean;
    appliedChanges: any[];
    batchUndo: any;
    batchNote: string;
    health: any;
    answerDist: any;
    unreviewed: any;
    coverage: any;
    activeClusterIndex: number;
    mergeBusy: boolean;
    orphanDiag: any;
    filterOrphanKind: string;
    batchList: any[];
    rollbackBusy: string;
    questionsError: string;
    filteredQuestions: Question[];
    expandedId: string;
    LIFECYCLE_LABELS: Record<string, string>;
    isQuestionDisputed: (q: Question) => boolean;
    activePeekQuestion: QuestionWithBlock | null;
    peekDrawerEl: HTMLDivElement | null;
    backlinkCache: Map<string, any[]>;
    currentPeekIndex: number;
    hasPrevPeek: boolean;
    hasNextPeek: boolean;
    favBusy: boolean;
    editingId: string;
    editDraft: any;
    editSpecOpen: boolean;
    editSpecUnit: string;
    editSpecAbsTol: string;
    editSpecRelPct: string;
    editSpecAltUnits: string;
    editBusy: boolean;
    offline: boolean;
    editError: string;
    peekHideAnswer: boolean;
    itemAnalysisOpenFor: string;
    itemAnalysisReport: any;
    revOpenFor: string;
    revLoadingFor: string;
    revRestoreKey: string;
    revRestoreFailedKey: string;
    revLoaded: Record<string, any>;
    revLoadError: Record<string, string>;
    revRestoreError: Record<string, string>;
    revList: (qid: string) => any[];
    disputeFormOpenFor: string;
    disputeReason: string;
    disputeNote: string;
    disputeResolution: string;
    disputeBusy: boolean;
    disputeError: string;
    peekLifecycleBusy: boolean;
    peekLifecycleError: Record<string, string>;
    backlinkBusyFor: string;
    backlinkError: Record<string, string>;
    qrefView: Record<string, any>;
    qrefActionError: Record<string, string>;
    qrefBusyFor: string;
    qrefFormFor: string;
    qrefMatId: string;
    qrefPage: string;
    qrefTime: string;
    qrefError: string;
    receiptOpenFor: string;
    receiptStored: any;
    receiptCache: any[];
    receiptBusy: string;
    receiptMisdiagnosis: Record<string, string>;
    flashError: Record<string, string>;
    flashBusy: string;
    flashCandidates: Record<string, any>;
    t: (k: string, fb?: string) => string;
    isStubbornWrong: (w: any) => boolean;
    getStubbornRemediation: (w: any) => any;
    isAttemptVersionDrifted: (a: any, q: any) => boolean;
    removeChoiceOption: (type: any, opts: string[], ans: string, idx: number) => any;
    summarizeLoad: (cards: any[]) => string;
    getQuestionLifecycle: (q: Question) => QuestionLifecycleStatus;
    hasMore: boolean;
    onbrowseLimit200: () => void;
    onapplyNamedView: (v: string) => void;
    ondeleteNamedView: () => void;
    onsaveCurrentView: () => void;
    onloadSmartViews: () => void;
    onbackToEntry: () => void;
    onstartFilteredFocusDrill: () => void;
    ontoggleSectionTree: () => void;
    ontoggleBatchMode: () => void;
    ontoggleMore: () => void;
    onexportBankCsv: () => void;
    onprintQuestionSheet: () => void;
    onprintAnswerSheet: () => void;
    onprintAnswerCard: () => void;
    onprintTeacherLectureSheet: () => void;
    onexportItemQualityReport: () => void;
    onexportGiftFormat: () => void;
    onexportAnkiFormat: () => void;
    onexportMdDocFormat: () => void;
    onclearSectionSel: () => void;
    onsearchKp: (kp: string) => void;
    onpreviewKpMerge: () => void;
    onpreviewKpFill: () => void;
    onapplyKpPlan: (plan: any) => void;
    ondownloadSyllabusGaps: () => void;
    onexportSyllabusAudit: () => void;
    onpreviewSyllabus: () => void;
    onimportSyllabus: () => void;
    onapplyTaxonomyPreset?: () => void;
    onapplyPaperRecall: () => void;
    onexportErrataTemplate: () => void;
    onerrataFile: (e: Event) => void;
    onapplyErrata: () => void;
    onselectAllCurrentPage: () => void;
    onclearSelection: () => void;
    onbatchConvertToCards: () => void;
    onprintSelectedQuestions: () => void;
    onprintSelectedTeacherPaper: () => void;
    onprintSelectedHomeworkSheet: () => void;
    onapplyBatch: (isUndo: boolean) => void;
    onpreviewBatch: () => void;
    ontoggleCluster: (idx: number) => void;
    onmergeClusterToTarget: (q: QuestionWithBlock, ids: string[]) => void;
    ondrillOrphanKind: (kind: any) => void;
    ondownloadHealthCsv: () => void;
    onundoBatch: (batch: string) => void;
    onclearBrowseFilters: () => void;
    onclearOrphanFilter: () => void;
    ontoggleBrowseQuestion: (id: string) => void;
    onclosePeekDrawer: () => void;
    onpeekDrawerKeydown: (e: KeyboardEvent) => void;
    onprevPeek: () => void;
    onnextPeek: () => void;
    ontoggleFavQuestion: (q: QuestionWithBlock) => void;
    onopenInSiYuan: (rootId?: string, blockId?: string) => void;
    onttsSpeak: (text: string, opt?: any) => void;
    onsaveEdit: (q: QuestionWithBlock) => void;
    oncloseEditForm: () => void;
    onsnoozeWrong: (qid: string, days: number) => void;
    onarchiveWrong: (qid: string) => void;
    onunarchiveWrong: (qid: string) => void;
    ontoggleItemAnalysis: (q: QuestionWithBlock) => void;
    ondownloadItemAnalysisCsv: (report: any) => void;
    ontoggleRevisions: (qid: string) => void;
    onloadRevisions: (qid: string) => void;
    onrestoreRevision: (q: QuestionWithBlock, r: any) => void;
    ondrillSingleQuestion: (q: QuestionWithBlock) => void;
    onopenEditForm: (q: QuestionWithBlock) => void;
    oncloneToManualStudio: (q: QuestionWithBlock) => void;
    ontoggleDisputeForm: (q: QuestionWithBlock) => void;
    onchangePeekLifecycle: (q: QuestionWithBlock, nextStatus: any) => void;
    onloadBacklinks: (blockId?: string) => void;
    onopenQref: (qid: string) => void;
    onstartQrefForm: (qid: string) => void;
    onremoveQref: (qid: string) => void;
    onsaveQref: (qid: string) => void;
    ontoggleReceipts: (qid: string) => void;
    onrunReceiptMisdiagnosis: (q: QuestionWithBlock, e: any) => void;
    onmakeFlashCandidates: (q: QuestionWithBlock) => void;
    onconfirmFlashCards: (q: QuestionWithBlock) => void;
    onstartSingleById: (qid: string) => void;
    onsubmitResolveDispute: (q: QuestionWithBlock) => void;
    onsubmitClearDispute: (q: QuestionWithBlock) => void;
    onsubmitFlagDispute: (q: QuestionWithBlock) => void;
    onloadMore: () => void;
  }

  let {
    searchText = $bindable(),
    filterType = $bindable(),
    filterStatus = $bindable(),
    filterSource = $bindable(),
    filterDays = $bindable(),
    sourceOptions,
    filterWrong = $bindable(),
    filterDispute = $bindable(),
    filterHelp = $bindable(),
    favOnly = $bindable(),
    filterUserTag = $bindable(),
    smartViews,
    selectedView = $bindable(),
    smartViewBusy,
    smartViewLoadBusy,
    smartViewLoadFailed,
    smartViewError,
    activeBankId,
    shownQuestions,
    questions,
    sectionOpen,
    batchMode = $bindable(),
    selectedIds = $bindable(),
    moreOpen = $bindable(),
    kpOpen = $bindable(),
    healthOpen = $bindable(),
    errataOpen = $bindable(),
    paperOpen = $bindable(),
    sectionSel = $bindable(),
    sectionLabel,
    moreRoot = $bindable(),
    morePop = $bindable(),
    app,
    questionMap,
    sectionBusy,
    sectionTree,
    kpData,
    kpMergeFrom = $bindable(),
    kpMergeTo = $bindable(),
    kpMergePlan = $bindable(),
    kpFillKp = $bindable(),
    kpFillPlan = $bindable(),
    kpBusy,
    kpNote,
    sylDoc,
    sylKpStats,
    sylPublisher = $bindable(),
    sylYear = $bindable(),
    sylSource = $bindable(),
    sylText = $bindable(),
    sylPreviewRoots,
    sylError,
    sylNote,
    paperText = $bindable(),
    paperPreview,
    paperBusy,
    paperNote,
    errataBusy,
    errataErrors,
    errataPlan,
    errataNote,
    selectedCount,
    batchCardBusy,
    batchField = $bindable(),
    batchValue = $bindable(),
    batchBusy,
    batchPreview,
    batchUndoHere,
    appliedChanges,
    batchUndo,
    batchNote,
    health,
    answerDist,
    unreviewed,
    coverage,
    activeClusterIndex = $bindable(),
    mergeBusy,
    orphanDiag,
    filterOrphanKind,
    batchList,
    rollbackBusy,
    questionsError,
    filteredQuestions,
    expandedId,
    LIFECYCLE_LABELS,
    isQuestionDisputed,
    activePeekQuestion,
    peekDrawerEl = $bindable(),
    backlinkCache,
    currentPeekIndex,
    hasPrevPeek,
    hasNextPeek,
    favBusy,
    editingId,
    editDraft = $bindable(),
    editSpecOpen = $bindable(),
    editSpecUnit = $bindable(),
    editSpecAbsTol = $bindable(),
    editSpecRelPct = $bindable(),
    editSpecAltUnits = $bindable(),
    editBusy,
    offline,
    editError,
    peekHideAnswer = $bindable(),
    itemAnalysisOpenFor,
    itemAnalysisReport,
    revOpenFor,
    revLoadingFor,
    revRestoreKey,
    revRestoreFailedKey,
    revLoaded,
    revLoadError,
    revRestoreError,
    revList,
    disputeFormOpenFor,
    disputeReason = $bindable(),
    disputeNote = $bindable(),
    disputeResolution = $bindable(),
    disputeBusy,
    disputeError,
    peekLifecycleBusy,
    peekLifecycleError,
    backlinkBusyFor,
    backlinkError,
    qrefView,
    qrefActionError,
    qrefBusyFor,
    qrefFormFor = $bindable(),
    qrefMatId = $bindable(),
    qrefPage = $bindable(),
    qrefTime = $bindable(),
    qrefError,
    receiptOpenFor,
    receiptStored,
    receiptCache,
    receiptBusy,
    receiptMisdiagnosis,
    flashError,
    flashBusy,
    flashCandidates = $bindable(),
    t,
    isStubbornWrong,
    getStubbornRemediation,
    isAttemptVersionDrifted,
    removeChoiceOption,
    summarizeLoad,
    getQuestionLifecycle,
    hasMore,
    onbrowseLimit200,
    onapplyNamedView,
    ondeleteNamedView,
    onsaveCurrentView,
    onloadSmartViews,
    onbackToEntry,
    onstartFilteredFocusDrill,
    ontoggleSectionTree,
    ontoggleBatchMode,
    ontoggleMore,
    onexportBankCsv,
    onprintQuestionSheet,
    onprintAnswerSheet,
    onprintAnswerCard,
    onprintTeacherLectureSheet,
    onexportItemQualityReport,
    onexportGiftFormat,
    onexportAnkiFormat,
    onexportMdDocFormat,
    onclearSectionSel,
    onsearchKp,
    onpreviewKpMerge,
    onpreviewKpFill,
    onapplyKpPlan,
    ondownloadSyllabusGaps,
    onexportSyllabusAudit,
    onpreviewSyllabus,
    onimportSyllabus,
    onapplyTaxonomyPreset,
    onapplyPaperRecall,
    onexportErrataTemplate,
    onerrataFile,
    onapplyErrata,
    onselectAllCurrentPage,
    onclearSelection,
    onbatchConvertToCards,
    onprintSelectedQuestions,
    onprintSelectedTeacherPaper,
    onprintSelectedHomeworkSheet,
    onapplyBatch,
    onpreviewBatch,
    ontoggleCluster,
    onmergeClusterToTarget,
    ondrillOrphanKind,
    ondownloadHealthCsv,
    onundoBatch,
    onclearBrowseFilters,
    onclearOrphanFilter,
    ontoggleBrowseQuestion,
    onclosePeekDrawer,
    onpeekDrawerKeydown,
    onprevPeek,
    onnextPeek,
    ontoggleFavQuestion,
    onopenInSiYuan,
    onttsSpeak,
    onsaveEdit,
    oncloseEditForm,
    onsnoozeWrong,
    onarchiveWrong,
    onunarchiveWrong,
    ontoggleItemAnalysis,
    ondownloadItemAnalysisCsv,
    ontoggleRevisions,
    onloadRevisions,
    onrestoreRevision,
    ondrillSingleQuestion,
    onopenEditForm,
    oncloneToManualStudio,
    ontoggleDisputeForm,
    onchangePeekLifecycle,
    onloadBacklinks,
    onopenQref,
    onstartQrefForm,
    onremoveQref,
    onsaveQref,
    ontoggleReceipts,
    onrunReceiptMisdiagnosis,
    onmakeFlashCandidates,
    onconfirmFlashCards,
    onstartSingleById,
    onsubmitResolveDispute,
    onsubmitClearDispute,
    onsubmitFlagDispute,
    onloadMore,
  }: Props = $props();

</script>

<div class="lv-pad">
  <div class="lv-screen-head">
    <span class="lv-eyebrow">{t("head.browse.eyebrow")}</span>
    <h1 class="lv-h1">{t("head.browse.title")}</h1>
    <p>{t("head.browse.desc")}</p>
  </div>
  <div class="lv-row" style="margin:0 0 8px;gap:8px;align-items:center">
    <div style="position:relative;flex:1;min-width:180px;display:flex;align-items:center">
      <input class="lv-input" style="width:100%;padding-right:32px" placeholder={t("browse.searchPlaceholder")} bind:value={searchText} />
      {#if searchText}
        <button type="button" class="lv-btn sm lv-btn--ghost" onclick={() => { searchText = ""; }} title="清空搜索" aria-label="清空搜索" style="position:absolute;right:6px;padding:2px 6px;min-width:24px;min-height:24px"><Icon name="close" size={12} /></button>
      {/if}
    </div>
    <select class="lv-select" style="max-width:115px" bind:value={filterType} onchange={onbrowseLimit200}>
      <option value="">{t("browse.fAnyType")}</option>
      {#each ["single", "multiple", "judge", "fill", "short", "material"] as tp, _i (_i)}
        <option value={tp}>{t("qtype." + tp)}</option>
      {/each}
    </select>
    <select class="lv-select" style="max-width:115px" bind:value={filterStatus} onchange={onbrowseLimit200} title={t("browse.filterStatus")}>
      <option value="">{t("browse.filterStatusAll")}</option>
      <option value="published">{t("lifecycle.published")}</option>
      <option value="review">{t("lifecycle.review")}</option>
      <option value="draft">{t("lifecycle.draft")}</option>
      <option value="deprecated">{t("lifecycle.deprecated")}</option>
    </select>
    {#if sourceOptions.length}
      <select class="lv-select" style="max-width:130px" bind:value={filterSource} onchange={onbrowseLimit200} title={t("browse.fSource")}>
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
        <button class="lv-chip" class:acc={filterWrong} onclick={() => (filterWrong = !filterWrong)} title={t("browse.fWrongTip")} style="display:inline-flex;align-items:center;gap:4px"><Icon name="close" size={11} /> {t("browse.fWrong")}</button>
        <button class="lv-chip" class:acc={filterDispute} class:lv-chip--red={filterDispute} onclick={() => (filterDispute = !filterDispute)} title={t("browse.fDisputeTip")}><Icon name="alert-triangle" size={12} /> {t("browse.fDispute")}</button>
        <button class="lv-chip" class:acc={filterHelp} onclick={() => (filterHelp = !filterHelp)} title={t("browse.fHelpTip")}><Icon name="bulb" size={12} /> {t("browse.fHelp")}</button>
        <button class="lv-chip" class:acc={favOnly} onclick={() => (favOnly = !favOnly)}><Icon name="star" size={12} /> {t("browse.favOnly")}</button>
      </div>
      <div class="lv-session-dock" role="group" aria-label="考点标签过滤">
        <button class="lv-chip" class:acc={filterUserTag === "star"} onclick={() => (filterUserTag = filterUserTag === "star" ? "" : "star")} title={t("session.tagStar")}><Icon name="star" size={12} /> {t("session.tagStar")}</button>
        <button class="lv-chip" class:acc={filterUserTag === "trap"} onclick={() => (filterUserTag = filterUserTag === "trap" ? "" : "trap")} title={t("session.tagTrap")}><Icon name="alert-triangle" size={12} /> {t("session.tagTrap")}</button>
        <button class="lv-chip" class:acc={filterUserTag === "doubt"} onclick={() => (filterUserTag = filterUserTag === "doubt" ? "" : "doubt")} title={t("session.tagDoubt")}><Icon name="help" size={12} /> {t("session.tagDoubt")}</button>
      </div>
    </div>
    <div class="lv-row" style="margin:0;gap:6px">
      {#if smartViews.length}
        <select class="lv-select" style="max-width:140px" bind:value={selectedView} onchange={() => onapplyNamedView(selectedView)} disabled={smartViewBusy || smartViewLoadBusy || smartViewLoadFailed}>
          <option value="">{t("view.pick")}</option>
          {#each smartViews as v, _i (_i)}<option value={v.name}>{v.name}</option>{/each}
        </select>
        <button class="lv-btn sm lv-btn--ghost" title={t("view.delete")} aria-label={t("view.delete")} aria-busy={smartViewBusy} disabled={!selectedView || smartViewBusy || smartViewLoadBusy || smartViewLoadFailed} onclick={ondeleteNamedView}><Icon name="trash" size={13} /></button>
      {/if}
      <button class="lv-btn sm lv-btn--ghost" title={t("view.saveTitle")} aria-busy={smartViewBusy} disabled={smartViewBusy || smartViewLoadBusy || smartViewLoadFailed || !activeBankId} onclick={onsaveCurrentView}><Icon name="save" size={13} /> {smartViewBusy ? "…" : t("view.save")}</button>
    </div>
  </div>
  {#if smartViewError}
    <div class="lv-error" role="alert" style="display:flex;align-items:center;justify-content:space-between;gap:var(--lv-space-relaxed);overflow-wrap:anywhere">
      <span>{smartViewError}</span>
      {#if smartViewLoadFailed}
        <button class="lv-btn sm" disabled={smartViewLoadBusy} aria-busy={smartViewLoadBusy} onclick={onloadSmartViews}>{smartViewLoadBusy ? "…" : t("view.retryLoad")}</button>
      {/if}
    </div>
  {/if}
  <div class="lv-row" style="margin:0 0 10px;gap:var(--lv-space-2) 8px">
    <button class="lv-btn lv-btn--ghost lv-mobile-back" onclick={onbackToEntry} style="display:inline-flex;align-items:center;gap:4px"><Icon name="chev-left" size={13} /> {t("mode.practice")}</button>
    <span class="lv-chip num">{shownQuestions.length}/{questions.length} {t("browse.count")}</span>
    {#if shownQuestions.length > 0}
      <button class="lv-btn sm lv-btn--primary" onclick={onstartFilteredFocusDrill} title="将当前筛选出的这批题目直接发起专注特训">
        <Icon name="play" size={13} /> {t("browse.drillFiltered").replace("{n}", String(shownQuestions.length))}
      </button>
    {/if}
    <button class="lv-chip" class:acc={sectionOpen} onclick={ontoggleSectionTree}><Icon name="file-text" size={13} /> {t("browse.sectionTree")}</button>
    <button class="lv-chip" class:acc={batchMode} onclick={ontoggleBatchMode}>{t("batch.mode")}</button>
    <div class="lv-more" bind:this={moreRoot}>
      <button class="lv-chip" class:acc={kpOpen || healthOpen || errataOpen || paperOpen} aria-haspopup="menu" aria-expanded={moreOpen}
        onclick={ontoggleMore}>
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
          <button role="menuitem" title={t("browse.exportCsvTitle")} onclick={() => { onexportBankCsv(); moreOpen = false; }}><Icon name="export" size={14} /> CSV</button>
          <button role="menuitem" title={t("print.qSheetTip")} onclick={() => { onprintQuestionSheet(); moreOpen = false; }}><Icon name="printer" size={14} /> {t("print.qSheet")}</button>
          <button role="menuitem" title={t("print.aSheetTip")} onclick={() => { onprintAnswerSheet(); moreOpen = false; }}><Icon name="printer" size={14} /> {t("print.aSheet")}</button>
          <button role="menuitem" title={t("print.cardTip")} onclick={() => { onprintAnswerCard(); moreOpen = false; }}><Icon name="printer" size={14} /> {t("print.card")}</button>
          <button role="menuitem" title="导出包含题目、答案、考点、难度、采分点与破题教学点拨的教师讲义卷" onclick={() => { onprintTeacherLectureSheet(); moreOpen = false; }}><Icon name="book" size={14} /> {t("mock.printTeacher")}</button>
          <button role="menuitem" title="导出全库试题实测难度、区分度与死干扰项诊断报告" onclick={() => { onexportItemQualityReport(); moreOpen = false; }}><Icon name="chart" size={14} /> {t("health.itemQualityAudit")}</button>
          <div class="lv-more-sep" role="separator"></div>
          <button role="menuitem" title="导出为 Moodle/学习通标准试题格式" onclick={() => { onexportGiftFormat(); moreOpen = false; }}><Icon name="export" size={14} /> {t("format.exportGift")}</button>
          <button role="menuitem" title="导出为 Anki / FSRS 问答闪卡卡包" onclick={() => { onexportAnkiFormat(); moreOpen = false; }}><Icon name="layers" size={14} /> {t("format.exportAnki")}</button>
          <button role="menuitem" title="导出为标准排版 Markdown 试题手册" onclick={() => { onexportMdDocFormat(); moreOpen = false; }}><Icon name="file-text" size={14} /> {t("format.exportMdDoc")}</button>
        </div>
      {/if}
    </div>
  </div>
  {#if sectionSel}
    <div class="lv-row" style="margin:4px 0">
      <span class="lv-chip acc"><Icon name="file-text" size={12} /> {sectionLabel}</span>
      <button class="lv-btn sm lv-btn--ghost" onclick={onclearSectionSel}>{t("browse.sectionClear")}</button>
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
    onsearchKp={onsearchKp}
    onpreviewKpMerge={onpreviewKpMerge}
    onpreviewKpFill={onpreviewKpFill}
    onapplyKpPlan={onapplyKpPlan}
    ondownloadSyllabusGaps={ondownloadSyllabusGaps}
    onexportSyllabusAudit={onexportSyllabusAudit}
    onpreviewSyllabus={onpreviewSyllabus}
    onimportSyllabus={onimportSyllabus}
    onapplyTaxonomyPreset={onapplyTaxonomyPreset}
    onapplyPaperRecall={onapplyPaperRecall}
    onexportErrataTemplate={onexportErrataTemplate}
    onerrataFile={onerrataFile}
    onapplyErrata={onapplyErrata}
    oncloseSection={() => sectionOpen = false}
    oncloseKp={() => kpOpen = false}
    onclosePaper={() => paperOpen = false}
    oncloseErrata={() => errataOpen = false}
    onselectAllCurrentPage={onselectAllCurrentPage}
    onclearSelection={onclearSelection}
    onbatchConvertToCards={onbatchConvertToCards}
    onprintSelectedQuestions={onprintSelectedQuestions}
    onprintSelectedTeacherPaper={onprintSelectedTeacherPaper}
    onprintSelectedHomeworkSheet={onprintSelectedHomeworkSheet}
    onapplyBatch={onapplyBatch}
    onpreviewBatch={onpreviewBatch}
    ontoggleCluster={ontoggleCluster}
    onmergeClusterToTarget={onmergeClusterToTarget}
    ondrillOrphanKind={ondrillOrphanKind}
    ondownloadHealthCsv={ondownloadHealthCsv}
    onundoBatch={onundoBatch}
  />
  {#if questionsError}
    <div class="lv-error">{questionsError}</div>
  {:else if !questions.length}
    <div class="lv-empty"><div class="lv-empty-icon"><Icon name="file" size={24} /></div><b>{t("browse.title")}</b><p class="lv-muted">{t("browse.empty")}</p></div>
  {:else if !shownQuestions.length}
    <div class="lv-empty">
      <div class="lv-empty-icon"><Icon name="search" size={24} /></div>
      <b>{t("browse.noMatch")}</b>
      <p class="lv-muted">{t("browse.noMatch.desc")}</p>
      <div class="lv-row" style="justify-content:center;margin-top:14px">
        <button class="lv-btn lv-btn--primary sm" onclick={onclearBrowseFilters}>{t("browse.clearFilters")}</button>
      </div>
    </div>
  {:else}
    {#if filterOrphanKind}
      <div class="lv-row" style="margin:6px 0;align-items:center">
        <span class="lv-chip lv-chip--red">
          <Icon name="alert-triangle" size={12} />
          {t("health.orphanFilter").replace("{label}", t("health.orphan." + filterOrphanKind)).replace("{n}", String(filteredQuestions.length))}
        </span>
        <button class="lv-btn sm lv-btn--ghost" onclick={onclearOrphanFilter}>{t("health.orphanClear")}</button>
      </div>
    {/if}
    {#each shownQuestions as q (q.id)}
      <div class="lv-card lv-qrow" class:sel={batchMode && !!selectedIds[q.id]} class:active-peek={!batchMode && expandedId === q.id}>
        <button type="button" class="lv-qrow-head"
          aria-pressed={batchMode ? !!selectedIds[q.id] : undefined}
          aria-expanded={!batchMode ? expandedId === q.id : undefined}
          aria-describedby={`lv-qrow-stem-${q.id}`}
          onclick={() => ontoggleBrowseQuestion(q.id)}>
          {#if batchMode}
            <span class="lv-chip num" class:acc={!!selectedIds[q.id]} style="display:inline-flex;align-items:center;justify-content:center;min-width:26px;padding:2px 6px">
              {#if selectedIds[q.id]}
                <Icon name="check" size={12} />
              {:else}
                <span style="display:inline-block;width:11px;height:11px;border:1.5px solid currentColor;border-radius:3px"></span>
              {/if}
            </span>
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
              <Icon name="alert-triangle" size={11} /> {t("dispute.badge")} · {t("dispute.reason." + q.dispute?.reason)}
            </span>
          {/if}
          {#if !batchMode}
            {#if expandedId === q.id}
              <span class="lv-chip lv-chip--acc num" style="margin-left:auto;display:inline-flex;align-items:center;gap:3px"><span>{t("browse.viewing", "查看中")}</span><Icon name="chev-right" size={10} /></span>
            {:else}
              <span class="lv-qrow-peek-arrow" aria-hidden="true">
                <Icon name="chev-right" size={12} />
              </span>
            {/if}
          {/if}
        </button>
        <div class="lv-qrow-stem" id={`lv-qrow-stem-${q.id}`}>{q.stem}</div>
      </div>
    {/each}
    {#if activePeekQuestion && activePeekQuestion.blockId}
      <QuestionPeekDrawer
        q={activePeekQuestion}
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
        bind:peekHideAnswer
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
        onclose={onclosePeekDrawer}
        onkeydown={onpeekDrawerKeydown}
        onprev={onprevPeek}
        onnext={onnextPeek}
        ontoggleFav={ontoggleFavQuestion}
        onopenInSiYuan={onopenInSiYuan}
        onttsSpeak={onttsSpeak}
        onsaveEdit={onsaveEdit}
        oncloseEdit={oncloseEditForm}
        ontoggleHideAnswer={() => (peekHideAnswer = !peekHideAnswer)}
        onsnoozeWrong={onsnoozeWrong}
        onarchiveWrong={onarchiveWrong}
        onunarchiveWrong={onunarchiveWrong}
        ontoggleItemAnalysis={ontoggleItemAnalysis}
        ondownloadItemAnalysisCsv={ondownloadItemAnalysisCsv}
        ontoggleRevisions={ontoggleRevisions}
        onloadRevisions={onloadRevisions}
        onrestoreRevision={onrestoreRevision}
        ondrillSingle={ondrillSingleQuestion}
        onopenEditForm={onopenEditForm}
        oncloneToManualStudio={oncloneToManualStudio}
        ontoggleDisputeForm={ontoggleDisputeForm}
        onchangeLifecycle={onchangePeekLifecycle}
        onloadBacklinks={onloadBacklinks}
        onopenQref={onopenQref}
        onstartQrefForm={onstartQrefForm}
        onremoveQref={onremoveQref}
        onsaveQref={onsaveQref}
        ontoggleReceipts={ontoggleReceipts}
        onrunReceiptMisdiagnosis={onrunReceiptMisdiagnosis}
        onmakeFlashCandidates={onmakeFlashCandidates}
        onconfirmFlashCards={onconfirmFlashCards}
        onstartSingleById={onstartSingleById}
        onsubmitResolveDispute={onsubmitResolveDispute}
        onsubmitClearDispute={onsubmitClearDispute}
        onsubmitFlagDispute={onsubmitFlagDispute}
      />
    {/if}
    {#if hasMore}
      <button class="lv-btn" style="width:100%" onclick={onloadMore}>
        {t("browse.loadMore")}（{shownQuestions.length}/{questions.length}）
      </button>
    {/if}
  {/if}
</div>
