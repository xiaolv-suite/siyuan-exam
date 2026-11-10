<script lang="ts">
  import Icon from "../shared/Icon.svelte";
  import type { BankInfo } from "../../app";
  import type { ImportReport, ImportCheckpoint } from "../../importer/pipeline";
  import type { MapAssignment } from "../../importer/mapping";
  import type { ParsedClozeItem } from "@/core/cloze";
  import StudioSubNav from "./StudioSubNav.svelte";
  import { handleTablistKeydown } from "./services/practiceKeyboardService";

  interface Props {
    hasBank: boolean;
    banks: BankInfo[];
    importCheckpoint: ImportCheckpoint | null;
    importBusy: boolean;
    importDragOver: boolean;
    importSubTab: "standard" | "cloze" | "siyuan" | "tag" | "glean";
    docSearchQuery: string;
    siyuanDocBusy: boolean;
    siyuanDocCandidates: Array<{ id: string; title: string; hpath: string; box: string }>;
    selectedDocIds: Record<string, boolean>;
    selectedDocCount: number;
    clozeModes: ("highlight" | "curly" | "bracket")[];
    clozeInputText: string;
    clozeImporting: boolean;
    clozeParsedItems: ParsedClozeItem[];
    importText: string;
    importParsing: boolean;
    dupeStrategy: "skip" | "coexist" | "update";
    savedMappings: Array<{ name: string; map: any }>;
    selectedMapping: string;
    sheetRowsCache: Map<string, string[][]>;
    activeSheet: string;
    manualMap: any;
    mapEditorOpen: boolean;
    mapAssign: MapAssignment;
    MAP_FIELDS: any[];
    mapErrors: string[];
    importError: string;
    importReport: ImportReport | null;
    importPreviewBankId: string;
    spotBusy: boolean;
    spotIds: string[];
    spotHtml: Record<string, string>;
    fixRow: number | null;
    fixCells: string[];
    fixText: string;
    fixNote: string;
    lastMap: any;
    mappingBusy: boolean;
    committing: boolean;
    remainingImportQuestions: any[];
    trialConfirmed: any[];
    trialBusy: boolean;
    commitProgress: { done: number; total: number } | null;
    trialNote: string;
    importResult: any;
    updateResult: any;
    retryPool: any[];
    t: (k: string, fb?: string) => string;
    escapeHtml: (s: string) => string;
    columnLabel: (idx: number) => string;
    onback: () => void;
    onchangeView: (view: "manual" | "materials" | "import" | "ai") => void;
    onResumeCheckpoint: () => void;
    onDiscardCheckpoint: () => void;
    onImportFileDrop: (e: DragEvent) => void;
    onDoSearchDocs: (q: string) => void;
    onToggleSelectAllDocs: () => void;
    onImportSelectedDocs: () => void;
    onImportAllSearchedDocs: () => void;
    onPickAndImportSiyuanDoc: (id: string, title: string) => void;
    onAiExtractDoc?: (id: string, title: string) => void;
    onToggleClozeMode: (mode: "highlight" | "curly" | "bracket") => void;
    onDoParseCloze: () => void;
    onImportClozeQuestions: () => void;
    importFileInput?: HTMLInputElement | null;
    onPickExcel: () => void;
    onExcelFile?: (e: Event) => void;
    onDownloadTemplate: () => void;
    onPasteClipboard: () => void;
    onDoParseText: () => void;
    onImportStrategyChange: (e: Event) => void;
    onToggleMapEditor: () => void;
    onApplyManualMap: () => void;
    onCancelMapEditor: () => void;
    onSpotCheckRender: () => void;
    onStartRowFix: (row: number) => void;
    onApplyRowFix: (row: number) => void;
    onCancelRowFix: () => void;
    onDownloadErrorsCsv: () => void;
    onSaveMapping: () => void;
    onCommitImport: () => void;
    onCancelCommit: () => void;
    onTrialImport5: () => void;
    onRetryMissing: () => void;
    onGoPractice: () => void;
    onGoBrowse: () => void;
    selectedTag?: string;
    customTagInput?: string;
    taggedBlocks?: Array<{ id: string; content: string; rootId: string; hpath: string }>;
    tagSearchBusy?: boolean;
    onDoSearchTags?: (tag: string) => void;
    onImportTagQuestions?: (tag: string) => void;
    paperOcrBusy?: boolean;
    onSegmentPaperText?: (text: string, name?: string) => void;
    onPaperImageUpload?: (file: File | Blob) => void;
    importDocProfile?: "all" | "paper" | "notes" | "cloze" | "table";
    hasGleanPlugin?: boolean;
    gleanClipsList?: Array<{ id: string; title: string; site?: string; url?: string; summary?: string }>;
    gleanClipsLoading?: boolean;
    selectedGleanIds?: Record<string, boolean>;
    selectedGleanCount?: number;
    onloadGleanClips?: () => void;
    onextractSelectedGlean?: () => void;
    ontoggleGleanId?: (id: string) => void;
    ontoggleSelectAllGlean?: () => void;
    onPickGleanClip?: (clip: { id: string; title: string }) => void;
    onAiExtractGleanClip?: (clip: { id: string; title: string }) => void;
  }

  let {
    hasBank,
    banks,
    importCheckpoint,
    importBusy,
    importDragOver = $bindable(),
    importSubTab = $bindable(),
    importDocProfile = $bindable("all"),
    docSearchQuery = $bindable(),
    siyuanDocBusy,
    siyuanDocCandidates,
    selectedDocIds = $bindable(),
    selectedDocCount,
    clozeModes,
    clozeInputText = $bindable(),
    clozeImporting,
    clozeParsedItems,
    importText = $bindable(),
    importParsing,
    dupeStrategy = $bindable(),
    savedMappings,
    selectedMapping = $bindable(),
    sheetRowsCache,
    activeSheet,
    manualMap,
    mapEditorOpen = $bindable(),
    mapAssign,
    MAP_FIELDS,
    mapErrors,
    importError,
    importReport,
    importPreviewBankId,
    spotBusy,
    spotIds,
    spotHtml,
    fixRow,
    fixCells,
    fixText = $bindable(),
    fixNote,
    lastMap,
    mappingBusy,
    committing,
    remainingImportQuestions: _remainingImportQuestions = [],
    trialConfirmed,
    trialBusy,
    commitProgress,
    trialNote,
    importResult,
    updateResult,
    retryPool,
    t,
    escapeHtml,
    columnLabel,
    onback,
    onchangeView,
    onResumeCheckpoint,
    onDiscardCheckpoint,
    onImportFileDrop,
    onDoSearchDocs,
    onToggleSelectAllDocs,
    onImportSelectedDocs,
    onImportAllSearchedDocs,
    onPickAndImportSiyuanDoc,
    onAiExtractDoc = () => {},
    onToggleClozeMode,
    onDoParseCloze,
    onImportClozeQuestions,
    importFileInput = $bindable(null),
    onPickExcel,
    onExcelFile,
    onDownloadTemplate,
    onPasteClipboard,
    onDoParseText,
    onImportStrategyChange,
    onToggleMapEditor,
    onApplyManualMap,
    onCancelMapEditor,
    onSpotCheckRender,
    onStartRowFix,
    onApplyRowFix,
    onCancelRowFix,
    onDownloadErrorsCsv,
    onSaveMapping,
    onCommitImport,
    onCancelCommit,
    onTrialImport5,
    onRetryMissing,
    onGoPractice,
    onGoBrowse,
    selectedTag = $bindable("#考点"),
    customTagInput = $bindable(""),
    taggedBlocks = [],
    tagSearchBusy = false,
    onDoSearchTags = () => {},
    onImportTagQuestions = () => {},
    paperOcrBusy = false,
    onSegmentPaperText = () => {},
    onPaperImageUpload = () => {},
    hasGleanPlugin = false,
    gleanClipsList = [],
    gleanClipsLoading = false,
    selectedGleanIds = $bindable({}),
    selectedGleanCount = 0,
    onloadGleanClips = () => {},
    onextractSelectedGlean = () => {},
    ontoggleGleanId = () => {},
    ontoggleSelectAllGlean = () => {},
    onPickGleanClip = () => {},
    onAiExtractGleanClip = () => {},
  }: Props = $props();

  let docSearchDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  function handleDocSearchInput(val: string) {
    if (docSearchDebounceTimer) clearTimeout(docSearchDebounceTimer);
    docSearchDebounceTimer = setTimeout(() => {
      onDoSearchDocs(val);
    }, 150);
  }

  let paperOcrModalOpen = $state(false);
  let paperRawText = $state("");
  let paperFileInput = $state<HTMLInputElement | null>(null);
  let selectedImportQids = $state<Record<string, boolean>>({});
  let confidenceFilter = $state<"all" | "high" | "need_review" | "malformed">("all");

  const selectedImportCount = $derived(
    importReport?.ok?.filter((q, qi) => selectedImportQids[q.id || String(qi)] !== false).length ?? 0,
  );

  const highConfidenceCount = $derived(
    importReport?.ok?.filter((q) => (q.confidence ?? 1) >= 0.85 && (!q.lintIssues || q.lintIssues.length === 0)).length ?? 0,
  );

  const needReviewCount = $derived(
    (importReport?.ok?.length ?? 0) - highConfidenceCount,
  );

  const malformedCount = $derived(
    importReport?.ok?.filter((q) =>
      (q.options?.length ?? 0) > 4 ||
      (q.type === "fill" && !/_{2,}|（\s*）|\(\s*\)|【\s*】|\[\s*\]|\{\{c\d+::/.test(q.stem)) ||
      (q.lintIssues && q.lintIssues.some((i: string) => i.includes("多") || i.includes("空") || i.includes("越界")))
    ).length ?? 0,
  );

  const visibleImportQuestions = $derived.by(() => {
    if (!importReport?.ok) return [];
    if (confidenceFilter === "high") {
      return importReport.ok.map((q, qi) => ({ q, qi })).filter(({ q }) => (q.confidence ?? 1) >= 0.85 && (!q.lintIssues || q.lintIssues.length === 0));
    }
    if (confidenceFilter === "need_review") {
      return importReport.ok.map((q, qi) => ({ q, qi })).filter(({ q }) => (q.confidence ?? 1) < 0.85 || (q.lintIssues && q.lintIssues.length > 0));
    }
    if (confidenceFilter === "malformed") {
      return importReport.ok.map((q, qi) => ({ q, qi })).filter(({ q }) =>
        (q.options?.length ?? 0) > 4 ||
        (q.type === "fill" && !/_{2,}|（\s*）|\(\s*\)|【\s*】|\[\s*\]|\{\{c\d+::/.test(q.stem)) ||
        (q.lintIssues && q.lintIssues.some((i: string) => i.includes("多") || i.includes("空") || i.includes("越界")))
      );
    }
    return importReport.ok.map((q, qi) => ({ q, qi }));
  });

  function selectOnlyHighConfidence() {
    if (!importReport?.ok) return;
    const next: Record<string, boolean> = {};
    for (let i = 0; i < importReport.ok.length; i++) {
      const q = importReport.ok[i];
      const isHigh = (q.confidence ?? 1) >= 0.85 && (!q.lintIssues || q.lintIssues.length === 0);
      next[q.id || String(i)] = isHigh;
    }
    selectedImportQids = next;
  }

  async function autoFixImportQuestions() {
    if (!importReport?.ok) return;
    const { autoFixQuestion, lintQuestion } = await import("@/core/questionLinter");
    importReport.ok = importReport.ok.map((q) => {
      const { question: fixedQ } = autoFixQuestion(q);
      const lint = lintQuestion(fixedQ);
      fixedQ.confidence = Math.round(lint.score) / 100;
      fixedQ.lintIssues = lint.issues.map((i) => i.message);
      return fixedQ;
    });
  }

  async function pruneAllExcessOptions() {
    if (!importReport?.ok) return;
    const { pruneQuestionOptions } = await import("@/core/questionLinter");
    importReport.ok = importReport.ok.map((q) => {
      if (q.options && q.options.length > 4) {
        return pruneQuestionOptions(q, 4);
      }
      return q;
    });
  }

  async function convertMalformedToShort() {
    if (!importReport?.ok) return;
    const { convertQuestionToShort, convertFillWithoutBlankToShort } = await import("@/core/questionLinter");
    importReport.ok = importReport.ok.map((q) => {
      if ((q.options && q.options.length > 6) || (q.type === "single" && (!q.options || q.options.length < 2))) {
        return convertQuestionToShort(q);
      }
      if (q.type === "fill" && !/_{2,}|（\s*）|\(\s*\)|【\s*】|\[\s*\]|\{\{c\d+::/.test(q.stem)) {
        return convertFillWithoutBlankToShort(q);
      }
      return q;
    });
    importReport.ok = [...importReport.ok];
  }

  function dropLowConfidenceQuestions() {
    if (!importReport?.ok) return;
    importReport.ok = importReport.ok.filter((q) => (q.confidence ?? 0.5) >= 0.60 && (!q.lintIssues || !q.lintIssues.some((i: string) => i.includes("空"))));
  }

  async function pruneSingleQuestion(qi: number) {
    if (!importReport?.ok?.[qi]) return;
    const { pruneQuestionOptions } = await import("@/core/questionLinter");
    importReport.ok[qi] = pruneQuestionOptions(importReport.ok[qi], 4);
    importReport.ok = [...importReport.ok];
  }

  async function convertSingleQuestionToShort(qi: number) {
    if (!importReport?.ok?.[qi]) return;
    const { convertQuestionToShort } = await import("@/core/questionLinter");
    importReport.ok[qi] = convertQuestionToShort(importReport.ok[qi]);
    importReport.ok = [...importReport.ok];
  }

  function convertFillToShortSingle(qi: number) {
    if (!importReport?.ok?.[qi]) return;
    const q = importReport.ok[qi];
    q.type = "short";
    q.lintIssues = (q.lintIssues || []).filter((i: string) => !i.includes("挖空") && !i.includes("填空"));
    importReport.ok = [...importReport.ok];
  }

  function addBlankToStemSingle(qi: number) {
    if (!importReport?.ok?.[qi]) return;
    const q = importReport.ok[qi];
    if (!/_{2,}|（\s*）|\(\s*\)|【\s*】|\[\s*\]|\{\{c\d+::/.test(q.stem)) {
      q.stem = q.stem.trim().endsWith("？") || q.stem.trim().endsWith("?")
        ? q.stem.replace(/[？?]$/, "（   ）？")
        : `${q.stem.trim()}（   ）`;
    }
    q.lintIssues = (q.lintIssues || []).filter((i: string) => !i.includes("挖空"));
    importReport.ok = [...importReport.ok];
  }

  function toggleSelectAllImportQuestions() {
    if (!importReport?.ok) return;
    const allSelected = selectedImportCount === importReport.ok.length;
    const next: Record<string, boolean> = {};
    for (let i = 0; i < importReport.ok.length; i++) {
      const q = importReport.ok[i];
      next[q.id || String(i)] = !allSelected;
    }
    selectedImportQids = next;
  }

  function removeImportQuestion(target: any) {
    if (!importReport?.ok) return;
    importReport.ok = importReport.ok.filter((item) => item !== target && (!item.id || item.id !== target.id));
  }

  function onPaperFileSelected(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) {
      onPaperImageUpload(file);
    }
    input.value = "";
  }
</script>

<div class="lv-pad">
  <div class="lv-screen-head">
    <span class="lv-eyebrow">{t("head.import.eyebrow")}</span>
    <h1 class="lv-h1">{t("head.import.title")}</h1>
    <p>{t("head.import.desc")}</p>
  </div>
  <StudioSubNav currentView="import" {t} {onchangeView} />
  <div class="lv-row">
    <button class="lv-btn lv-btn--ghost lv-mobile-back" onclick={onback} style="display:inline-flex;align-items:center;gap:4px"><Icon name="chev-left" size={13} /> {t("import.back")}</button>
    <span class="lv-chip">{t("import.title")}</span>
  </div>
  {#if !hasBank}
    <div class="lv-empty">
      <div class="lv-empty-icon"><Icon name="folder" size={24} /></div>
      <p style="margin:8px 0 0">{t("guard.needBankFirst")}</p>
    </div>
  {:else}
    {#if importCheckpoint}
      <!-- 38-04 / U08：未完成导入任务断点恢复提示条 -->
      <div class="lv-card lv-pad-card" style="margin-bottom:12px;border:1px solid var(--lv-border-subtle);border-left:3.5px solid var(--lv-accent);border-radius:var(--lv-r-3, 16px);background:var(--lv-surface-2);box-shadow:var(--lv-sh-1)">
        <div class="lv-row" style="justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
          <div>
            <b><Icon name="activity" size={14} /> {t("import.checkpointTitle")}</b>
            <div class="lv-muted" style="font-size:var(--lv-font-size-caption);margin-top:2px">
              {t("import.checkpointDesc")} <code>{importCheckpoint.batch}</code> · {t("import.checkpointStats").replace("{c}", String(importCheckpoint.confirmedIds.length)).replace("{p}", String(importCheckpoint.pendingQuestions.length))}
            </div>
          </div>
          <div class="lv-row" style="margin:0;gap:6px">
            <button class="lv-btn lv-btn--primary sm" disabled={importBusy} aria-busy={importBusy} onclick={onResumeCheckpoint}>
              <Icon name="play" size={12} /> {t("import.checkpointResume").replace("{n}", String(importCheckpoint.pendingQuestions.length))}
            </button>
            <button class="lv-btn lv-btn--ghost sm" disabled={importBusy} onclick={onDiscardCheckpoint}>
              {t("import.checkpointDiscard")}
            </button>
          </div>
        </div>
      </div>
    {/if}
    <div
      class="lv-card lv-pad-card lv-import-card"
      role="region"
      aria-label={t("import.title")}
      class:dragover={importDragOver}
      ondragover={(e) => { e.preventDefault(); importDragOver = true; }}
      ondragleave={() => { importDragOver = false; }}
      ondrop={onImportFileDrop}
    >
      <!-- 52-09 导入方式子分面切换：批量文件导入 vs 思源笔记文档直接导入 vs 思源标签与闪卡提取 vs 正文划重点挖空出题 -->
      <div class="lv-session-dock lv-import-subtabs" role="tablist" tabindex="-1" aria-label="导入方式切换" style="margin-bottom:10px;width:100%;box-sizing:border-box" onkeydown={handleTablistKeydown}>
        <button type="button" role="tab" tabindex={importSubTab === "standard" ? 0 : -1} class="lv-chip" class:acc={importSubTab === "standard"} aria-selected={importSubTab === "standard"} onclick={() => importSubTab = "standard"}>
          <Icon name="import" size={12} /> {t("import.title")}<span class="lv-dock-label">（Excel / CSV / Aiken / Word）</span>
        </button>
        <button type="button" role="tab" tabindex={importSubTab === "siyuan" ? 0 : -1} class="lv-chip" class:acc={importSubTab === "siyuan"} aria-selected={importSubTab === "siyuan"} onclick={() => { importSubTab = "siyuan"; onDoSearchDocs(""); }}>
          <Icon name="book" size={12} /> {t("import.fromSiyuanDoc")}
        </button>
        <button type="button" role="tab" tabindex={importSubTab === "tag" ? 0 : -1} class="lv-chip" class:acc={importSubTab === "tag"} aria-selected={importSubTab === "tag"} onclick={() => { importSubTab = "tag"; onDoSearchTags(selectedTag || "#考点"); }}>
          <Icon name="tag" size={12} /> 按思源标签与闪卡提取
        </button>
        <button type="button" role="tab" tabindex={importSubTab === "cloze" ? 0 : -1} class="lv-chip" class:acc={importSubTab === "cloze"} aria-selected={importSubTab === "cloze"} onclick={() => importSubTab = "cloze"}>
          <Icon name="edit" size={12} /> {t("cloze.tab")}
        </button>
        <button type="button" role="tab" tabindex={importSubTab === "glean" ? 0 : -1} class="lv-chip" class:acc={importSubTab === "glean"} aria-selected={importSubTab === "glean"} onclick={() => { importSubTab = "glean"; onloadGleanClips(); }}>
          <Icon name="bookmark" size={12} /> 小驴拾遗剪藏提题
        </button>
      </div>
      {#if importSubTab === "siyuan"}
        <!-- 从思源笔记原生文档直接提取题目导入（本插件核心特色能力） -->
        <div class="stack-sm" style="margin-top:6px;min-width:0;max-width:100%">
          <div class="lv-card lv-import-guide-card" style="margin:2px 0 4px;padding:8px 12px;background:color-mix(in srgb, var(--lv-accent-soft) 25%, var(--lv-surface));border-left:3.5px solid var(--lv-accent);border-radius:var(--lv-r-2);font-size:12px;line-height:1.5;min-width:0;max-width:100%;box-sizing:border-box">
            <b style="color:var(--lv-text);display:block;margin-bottom:2px">💡 思源原生笔记试题提取指引（本插件核心特色）：</b>
            直接读取思源笔记正文，支持单选/多选/判断/表格题、<code>==高亮划重点填空==</code>、<code>**术语定义**</code> 以及 <code>::</code> 闪卡语法。提取后的题目自动与思源原笔记段落挂载 <code>sourceBlockId</code> 双向链接！
          </div>
          <div class="lv-chip lv-chip--grn" style="font-size:11px;padding:4px 8px;margin-bottom:4px;white-space:normal;height:auto;line-height:1.4;max-width:100%;box-sizing:border-box" role="note">
            {t("import.siyuanDocSafety")}
          </div>
          <!-- 识别场景模式预设切换 -->
          <div class="lv-row" role="group" aria-label="识别场景模式预设" style="margin:4px 0 8px;gap:6px;align-items:center;flex-wrap:wrap">
            <span class="lv-muted" style="font-size:11.5px">识别模式：</span>
            {#each [
              { id: "all", label: "🎯 智能全能", desc: "10大引擎全量并发，并自动排重与置信度评分" },
              { id: "paper", label: "📄 标准试卷", desc: "专精大题章节、题号与选项，屏蔽正文概念" },
              { id: "notes", label: "📖 读书笔记", desc: "专精列表术语、粗体加粗与问答标题提炼" },
              { id: "cloze", label: "⚡ 高光挖空", desc: "专门提取 ==高亮== 与 {{挖空}} 记忆卡" },
              { id: "table", label: "📊 表格矩阵", desc: "专门提取 Markdown 表格问答对照" },
            ] as mode (mode.id)}
              <button
                type="button"
                class="lv-chip sm"
                class:acc={importDocProfile === mode.id}
                style="{importDocProfile === mode.id ? 'background:var(--lv-brand);color:var(--lv-on-accent, #fff);font-weight:700;' : ''}font-size:11px;padding:2px 8px;cursor:pointer"
                title={mode.desc}
                onclick={() => { importDocProfile = mode.id as any; }}
              >
                {mode.label}
              </button>
            {/each}
          </div>
          <div class="lv-row" style="margin:0;gap:6px;align-items:center">
            <div style="position:relative;flex:1;display:flex;align-items:center">
              <span style="position:absolute;left:8px;pointer-events:none;color:var(--lv-text-3);display:flex;align-items:center" aria-hidden="true">
                <Icon name="search" size={13} />
              </span>
              <input class="lv-input sm" style="width:100%;padding-left:28px;padding-right:26px" placeholder={t("import.searchDocPlaceholder")} aria-label={t("import.searchDocPlaceholder")} bind:value={docSearchQuery} oninput={(e) => handleDocSearchInput((e.target as HTMLInputElement).value)} />
              {#if docSearchQuery}
                <button type="button" class="lv-btn sm lv-btn--ghost" onclick={() => { docSearchQuery = ""; onDoSearchDocs(""); }} title="清空搜索" aria-label="清空搜索" style="position:absolute;right:3px;padding:2px 4px;min-width:18px;min-height:18px"><Icon name="close" size={11} /></button>
              {/if}
            </div>
            <button class="lv-btn sm" onclick={() => { if (docSearchDebounceTimer) clearTimeout(docSearchDebounceTimer); onDoSearchDocs(docSearchQuery); }} disabled={siyuanDocBusy} aria-busy={siyuanDocBusy}><Icon name="search" size={13} /> {siyuanDocBusy ? "…" : "搜索"}</button>
          </div>
          <div class="stack-sm" style="max-height:360px;overflow-y:auto;border:1px solid var(--lv-border);border-radius:var(--lv-r-2);padding:6px;background:var(--lv-surface)">
            {#if siyuanDocCandidates.length === 0}
              <div class="lv-muted" style="padding:16px;text-align:center">{siyuanDocBusy ? "正在搜索思源文档…" : "未找到匹配文档，请尝试输入其他关键词"}</div>
            {:else}
              <div class="lv-row" style="justify-content:space-between;align-items:center;padding:8px 12px;margin-bottom:6px;background:var(--lv-surface-2);border-radius:var(--lv-r-2, 12px);border:1px solid var(--lv-border-subtle);flex-wrap:wrap;gap:6px">
                <div class="lv-row" style="margin:0;gap:8px;align-items:center">
                  <button type="button" class="lv-chip num sm" onclick={onToggleSelectAllDocs} class:acc={selectedDocCount > 0} style="display:inline-flex;align-items:center;gap:4px">
                    {#if selectedDocCount > 0}
                      <Icon name="check" size={11} />
                      <span>{selectedDocCount === siyuanDocCandidates.length ? "全选" : `已选 ${selectedDocCount}`}</span>
                    {:else}
                      <span style="display:inline-block;width:10px;height:10px;border:1.5px solid currentColor;border-radius:2px"></span>
                      <span>全选</span>
                    {/if}
                  </button>
                  <span class="lv-muted" style="font-size:11px;display:inline-flex;align-items:center;gap:4px">
                    {#if !docSearchQuery.trim()}<Icon name="clock" size={11} />{/if}
                    {docSearchQuery.trim() ? `搜索到 ${siyuanDocCandidates.length} 篇相关笔记` : `最近编辑笔记（共 ${siyuanDocCandidates.length} 篇）`}
                  </span>
                </div>
                <div class="lv-row" style="margin:0;gap:6px">
                  {#if selectedDocCount > 0}
                    <button class="lv-btn sm lv-btn--primary" disabled={siyuanDocBusy} aria-busy={siyuanDocBusy} onclick={onImportSelectedDocs}>
                      <Icon name="import" size={12} /> {siyuanDocBusy ? "正在提取…" : `提取已选 (${selectedDocCount})`}
                    </button>
                  {/if}
                  <button class="lv-btn sm lv-btn--ghost" disabled={siyuanDocBusy} aria-busy={siyuanDocBusy} onclick={onImportAllSearchedDocs}>
                    <Icon name="layers" size={12} /> {siyuanDocBusy ? "正在提取…" : `全部提取 (${siyuanDocCandidates.length})`}
                  </button>
                </div>
              </div>
              {#each siyuanDocCandidates as doc (doc.id)}
                <div class="lv-row" style="justify-content:space-between;align-items:center;padding:8px 10px;border-bottom:1px solid var(--lv-border-subtle);gap:8px">
                  <div class="lv-row" style="margin:0;gap:8px;align-items:center;flex:1;min-width:0">
                    <input type="checkbox" aria-label={`选择文档: ${doc.title}`} checked={!!selectedDocIds[doc.id]} onchange={(e) => {
                      const checked = (e.target as HTMLInputElement).checked;
                      if (checked) selectedDocIds[doc.id] = true;
                      else { delete selectedDocIds[doc.id]; selectedDocIds = { ...selectedDocIds }; }
                    }} />
                    <div style="flex:1;min-width:0">
                      <b title={doc.title} style="font-size:var(--lv-font-size-sm);display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{doc.title}</b>
                      <div class="lv-muted" title={doc.hpath} style="font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{doc.hpath}</div>
                    </div>
                  </div>
                  <div class="lv-row" style="margin:0;gap:6px">
                    <button class="lv-btn sm lv-btn--primary" disabled={siyuanDocBusy} aria-busy={siyuanDocBusy} onclick={() => onPickAndImportSiyuanDoc(doc.id, doc.title)} title="直接提取文中文法题（选择题/高亮挖空/加粗术语定义）">
                      <Icon name="import" size={12} /> {siyuanDocBusy ? "提取中…" : "直接提取"}
                    </button>
                    <button class="lv-btn sm lv-btn--ghost" disabled={siyuanDocBusy} onclick={() => onAiExtractDoc?.(doc.id, doc.title)} title="由 AI 自动阅读此篇笔记正文提炼试题（完全不改动原笔记！）">
                      <Icon name="sparkles" size={12} /> AI 提炼试题
                    </button>
                  </div>
                </div>
              {/each}
            {/if}
          </div>
        </div>
      {:else if importSubTab === "cloze"}
        <!-- 52-09 正文划重点挖空出题工作台 -->
        <div class="lv-card" style="margin:2px 0 8px;padding:10px 14px;background:color-mix(in srgb, var(--lv-accent-soft) 25%, var(--lv-surface));border-left:3.5px solid var(--lv-accent);border-radius:var(--lv-r-2);font-size:12px;line-height:1.6">
          <b style="color:var(--lv-text);display:block;margin-bottom:2px">💡 正文划重点挖空出题说明：</b>
          将任意复习段落粘贴到下方，使用 <code>==高亮==</code>、<code>{`{大括号}`}</code> 或 <code>((圆括号))</code> 标记想要作为考点的重点词汇，点击「生成挖空试题」即可一键批量转换入库！
        </div>
        <div class="lv-row" role="group" aria-label="识别语法模式" style="margin:4px 0 8px;gap:6px;align-items:center;flex-wrap:wrap">
          <span class="lv-muted" style="font-size:var(--lv-font-size-caption)">识别语法：</span>
          <button type="button" class="lv-chip sm" class:acc={clozeModes.includes("highlight")} aria-pressed={clozeModes.includes("highlight")} onclick={() => onToggleClozeMode("highlight")}>{t("cloze.modeHighlight")}</button>
          <button type="button" class="lv-chip sm" class:acc={clozeModes.includes("curly")} aria-pressed={clozeModes.includes("curly")} onclick={() => onToggleClozeMode("curly")}>{t("cloze.modeCurly")}</button>
          <button type="button" class="lv-chip sm" class:acc={clozeModes.includes("bracket")} aria-pressed={clozeModes.includes("bracket")} onclick={() => onToggleClozeMode("bracket")}>{t("cloze.modeBracket")}</button>
          <button type="button" class="lv-chip sm" onclick={() => {
            clozeInputText = "在操作系统的体系结构中，==内核== 是最核心的部分，负责直接管理硬件资源，运行在最高特权级的 ==内核态== 中。";
          }}>⚡ 高亮示例</button>
          <button type="button" class="lv-chip sm" onclick={() => {
            clozeInputText = "TCP 提供 {{面向连接}} 的、{{可靠}} 的字节流服务，而 UDP 提供 {{无连接}} 的数据报服务。";
          }}>⚡ 大括号示例</button>
        </div>
        <textarea class="lv-input lv-textarea" rows="6" placeholder={t("cloze.placeholder")} aria-label={t("cloze.tab")} bind:value={clozeInputText} disabled={importBusy || clozeImporting}></textarea>
        <div class="lv-row" style="margin:8px 0">
          <button class="lv-btn lv-btn--primary" onclick={onDoParseCloze} disabled={importBusy || clozeImporting || !clozeInputText.trim()}>
            <Icon name="sparkles" size={14} /> {t("cloze.parseBtn")}
          </button>
          {#if clozeParsedItems.length}
            <button class="lv-btn lv-btn--primary" onclick={onImportClozeQuestions} disabled={importBusy || clozeImporting} aria-busy={clozeImporting}>
              {clozeImporting ? "…" : t("cloze.importBtn").replace("{n}", String(clozeParsedItems.length))}
            </button>
            <span class="lv-chip lv-chip--grn num">{t("cloze.parsedCount").replace("{n}", String(clozeParsedItems.length))}</span>
          {/if}
        </div>
        {#if clozeParsedItems.length}
          <div class="stack-sm" style="margin-top:10px;max-height:300px;overflow:auto">
            {#each clozeParsedItems as it, idx (idx)}
              <div class="lv-card" style="padding:10px 14px;background:var(--lv-surface);border-radius:var(--lv-r-3, 14px);border:1px solid var(--lv-border-subtle);box-shadow:var(--lv-sh-1)">
                <div class="lv-row" style="justify-content:space-between;margin:0 0 4px">
                  <b class="num" style="color:var(--lv-accent)">#{idx + 1} 填空题</b>
                  <span class="lv-chip num sm">{it.blankCount} 空</span>
                </div>
                <div style="font-size:var(--lv-font-size-sm);margin:4px 0">{it.stem}</div>
                <div class="lv-muted num" style="font-size:var(--lv-font-size-caption)">
                  答案: <b style="color:var(--lv-accent)">{it.combinedAnswer}</b>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      {:else if importSubTab === "tag"}
        <!-- 按思源标签与原生闪卡汇聚题库（核心特色新来源） -->
        <div class="stack-sm" style="margin-top:6px">
          <div class="lv-card" style="margin:2px 0 6px;padding:10px 14px;background:color-mix(in srgb, var(--lv-accent-soft) 25%, var(--lv-surface));border-left:3.5px solid var(--lv-accent);border-radius:var(--lv-r-2);font-size:12px;line-height:1.6">
            <b style="color:var(--lv-text);display:block;margin-bottom:2px">💡 按思源标签与原生闪卡汇聚题库（全新题库来源）：</b>
            支持扫描思源全库中带有 <code>#考点#</code>、<code>#必考#</code>、<code>#真题#</code>、<code>#错题#</code> 等标签的内容块，或思源原生闪卡包，一键将日常散落的重点笔记汇聚为独立题库，题目与思源原块原生双向绑定！
          </div>
          <div class="lv-row" style="margin:4px 0 8px;gap:6px;align-items:center;flex-wrap:wrap">
            <span class="lv-muted" style="font-size:12px">常用标签与闪卡：</span>
            {#each ["#考点", "#必考", "#真题", "#错题", "#重点", "#背诵", "思源闪卡"] as tg (tg)}
              <button type="button" class="lv-chip sm" class:acc={selectedTag === tg} onclick={() => { selectedTag = tg; onDoSearchTags(tg); }}>{tg}</button>
            {/each}
          </div>
          <div class="lv-row" style="margin:0;gap:6px;align-items:center">
            <input class="lv-input sm" style="flex:1" placeholder="输入自定义标签名称（如 #考研真题 或 #法考重点）…" bind:value={customTagInput} onkeydown={(e) => { if (e.key === "Enter") { selectedTag = customTagInput || selectedTag; onDoSearchTags(selectedTag); } }} />
            <button class="lv-btn sm lv-btn--primary" disabled={tagSearchBusy} onclick={() => { selectedTag = customTagInput || selectedTag; onDoSearchTags(selectedTag); }}>
              <Icon name="search" size={13} /> {tagSearchBusy ? "正在检索…" : "检索标签内容块"}
            </button>
          </div>
          <div class="stack-sm" style="max-height:360px;overflow-y:auto;border:1px solid var(--lv-border);border-radius:var(--lv-r-2);padding:6px;background:var(--lv-surface)">
            {#if tagSearchBusy}
              <div class="lv-muted" style="padding:16px;text-align:center">正在检索全库标签块…</div>
            {:else if !taggedBlocks.length}
              <div class="lv-muted" style="padding:16px;text-align:center">未找到带有该标签的内容块，请在上方点击常用标签或在思源笔记中添加 <code>#考点#</code></div>
            {:else}
              <div class="lv-row" style="justify-content:space-between;align-items:center;padding:8px 12px;background:var(--lv-surface-2);border-radius:var(--lv-r-2);border:1px solid var(--lv-border-subtle);flex-wrap:wrap;gap:6px">
                <span class="lv-muted" style="font-size:12px">检索到 <b>{taggedBlocks.length}</b> 个包含 <code>{selectedTag}</code> 的内容块</span>
                <button class="lv-btn sm lv-btn--primary" onclick={() => onImportTagQuestions(selectedTag)}>
                  <Icon name="import" size={12} /> 一键全部转换为试题并入库 ({taggedBlocks.length})
                </button>
              </div>
              {#each taggedBlocks as b (b.id)}
                <div class="lv-row" style="justify-content:space-between;align-items:flex-start;padding:8px 10px;border-bottom:1px solid var(--lv-border-subtle);gap:8px">
                  <div style="flex:1;min-width:0">
                    <div style="font-size:12.5px;line-height:1.55;color:var(--lv-text)">{b.content.slice(0, 160)}</div>
                    <div class="lv-muted" style="font-size:11px;margin-top:2px">{b.hpath}</div>
                  </div>
                </div>
              {/each}
            {/if}
          </div>
        </div>
      {:else if importSubTab === "glean"}
        <!-- 从小驴拾遗剪藏直接提炼试题（跨插件生态联动） -->
        <div class="stack-sm" style="margin-top:6px">
          <div class="lv-card" style="margin:2px 0 6px;padding:10px 14px;background:color-mix(in srgb, var(--lv-accent-soft) 25%, var(--lv-surface));border-left:3.5px solid var(--lv-accent);border-radius:var(--lv-r-2);font-size:12px;line-height:1.6">
            <b style="color:var(--lv-text);display:block;margin-bottom:2px">💡 从小驴拾遗（siyuan-glean）提炼试题：</b>
            读取小驴拾遗精粹剪藏与稍后读，自动提取重点内容、定义句式与挖空卡片，试题自动与剪藏文档建立双向链接！
          </div>
          {#if !hasGleanPlugin}
            <div class="lv-card" style="text-align:center;padding:32px 16px;border:1px dashed var(--lv-border);border-radius:var(--lv-r-2);background:var(--lv-surface)">
              <Icon name="bookmark" size={28} />
              <p style="margin:8px 0 4px;font-weight:600">未检测到小驴拾遗插件（siyuan-glean）</p>
              <p class="lv-muted" style="font-size:12px">前往思源集市安装小驴拾遗后，即可直接将网页与图书稍后读剪藏一键提取为考题！</p>
            </div>
          {:else if gleanClipsLoading}
            <div class="lv-muted" style="text-align:center;padding:24px"><Icon name="loader" size={18} /> 正在拉取拾遗剪藏素材…</div>
          {:else if !gleanClipsList.length}
            <div class="lv-card" style="text-align:center;padding:24px;border-radius:var(--lv-r-2);background:var(--lv-surface)">
              <p class="lv-muted">暂无待处理的拾遗稍后读剪藏。</p>
              <button class="lv-btn sm" onclick={onloadGleanClips}>刷新剪藏</button>
            </div>
          {:else}
            <div class="lv-row" style="justify-content:space-between;align-items:center;padding:8px 12px;background:var(--lv-surface-2);border-radius:var(--lv-r-2);border:1px solid var(--lv-border-subtle);flex-wrap:wrap;gap:6px">
              <span class="lv-muted" style="font-size:12px">找到 <b>{gleanClipsList.length}</b> 条拾遗剪藏，已选 <b>{selectedGleanCount}</b> 条</span>
              <div class="lv-row" style="margin:0;gap:6px">
                <button class="lv-btn sm lv-btn--ghost" onclick={ontoggleSelectAllGlean}>全选/反选</button>
                {#if selectedGleanCount > 0}
                  <button class="lv-btn sm lv-btn--primary" onclick={onextractSelectedGlean}>
                    <Icon name="import" size={12} /> 批量提炼已选 ({selectedGleanCount})
                  </button>
                {/if}
              </div>
            </div>
            <div class="stack-sm" style="max-height:360px;overflow-y:auto;border:1px solid var(--lv-border);border-radius:var(--lv-r-2);padding:6px;background:var(--lv-surface)">
              {#each gleanClipsList as c (c.id)}
                <div class="lv-row" style="justify-content:space-between;align-items:flex-start;padding:8px 10px;border-bottom:1px solid var(--lv-border-subtle);gap:8px">
                  <div class="lv-row" style="margin:0;gap:8px;align-items:flex-start;flex:1;min-width:0">
                    <input type="checkbox" aria-label={`选择剪藏: ${c.title}`} checked={!!selectedGleanIds[c.id]} onchange={() => ontoggleGleanId(c.id)} style="margin-top:3px" />
                    <div style="flex:1;min-width:0">
                      <div style="font-size:12.5px;font-weight:600;color:var(--lv-text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
                        《{c.title || "无标题剪藏"}》
                        {#if c.site}<span class="lv-chip sm num" style="font-size:10px;margin-left:4px">{c.site}</span>{/if}
                      </div>
                      {#if c.summary}
                        <div class="lv-muted" style="font-size:11.5px;margin-top:3px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;line-height:1.5">
                          {c.summary}
                        </div>
                      {/if}
                    </div>
                  </div>
                  <div class="lv-row" style="margin:0;gap:6px;flex-shrink:0">
                    <button class="lv-btn sm lv-btn--primary" onclick={() => onPickGleanClip(c)} title="直接提取文中文法题（选择题/高亮挖空/加粗术语定义）">
                      <Icon name="import" size={12} /> 直接提取
                    </button>
                    <button class="lv-btn sm lv-btn--ghost" onclick={() => onAiExtractGleanClip(c)} title="由 AI 自动阅读此篇剪藏正文提炼试题">
                      <Icon name="sparkles" size={12} /> AI 提炼
                    </button>
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      {:else}
        <!-- 批量文件导入与纯文本 Aiken/GIFT 导入向导 -->
        <div class="lv-card" style="margin:2px 0 10px;padding:10px 14px;background:color-mix(in srgb, var(--lv-accent-soft) 25%, var(--lv-surface));border-left:3.5px solid var(--lv-accent);border-radius:var(--lv-r-2);font-size:12px;line-height:1.6">
          <b style="color:var(--lv-text);display:block;margin-bottom:2px">💡 批量试题导入说明：</b>
          1. <b>支持表格文件</b>：Excel (.xlsx / .xls)、CSV、TSV，可点击「下载标准模板」查看题目/答案/选项标准列头；<br />
          2. <b>支持试题文本</b>：直接选择纯文本文件 (.txt / .gift / .md) 或将 Aiken 格式文本（如“1. 题干\nA. 选项\n答案: A”）粘贴到下方文本框中即可一键解析入库！
        </div>
        <div class="lv-row" style="flex-wrap:wrap;gap:8px;align-items:center">
          <button type="button" class="lv-btn" disabled={importBusy} onclick={() => { if (importFileInput) importFileInput.click(); else onPickExcel(); }}><Icon name="folder" size={15} /> {t("import.pickExcel")}</button>
          <input type="file" bind:this={importFileInput} accept=".xlsx,.xls,.csv,.tsv,.txt,.gift,.docx,.md,.json,.qcard,.lvcards" hidden onchange={onExcelFile} disabled={importBusy} />
          <button type="button" class="lv-btn sm lv-btn--primary" onclick={() => paperOcrModalOpen = !paperOcrModalOpen} title="上传整张纸质试卷扫描件或照片，一键整卷切题并反向缝合参考答案">
            <Icon name="camera" size={13} /> 📄 纸质试卷整卷 OCR 导入
          </button>
          <button class="lv-btn sm" onclick={onDownloadTemplate}><Icon name="import" size={15} /> {t("import.template")}</button>
          <button class="lv-btn sm lv-btn--ghost" onclick={onPasteClipboard} disabled={importBusy} title={t("import.pasteClipboardTip")}><Icon name="copy" size={14} /> {t("import.pasteClipboard")}</button>
          <span class="lv-muted">{t("import.orPaste")}</span>
        </div>
        {#if paperOcrModalOpen}
          <div class="lv-card" style="margin:10px 0 14px;padding:14px 18px;background:var(--lv-surface-2);border:1.5px solid var(--lv-accent);border-radius:var(--lv-r-2);box-shadow:var(--lv-sh-pop)">
            <div class="lv-row" style="justify-content:space-between;align-items:center;margin:0 0 8px">
              <div style="display:flex;align-items:center;gap:6px">
                <Icon name="camera" size={15} />
                <b style="font-size:13.5px;color:var(--lv-text)">📄 纸质整卷扫描 OCR 智能切题与缝合导入</b>
              </div>
              <button type="button" class="lv-btn sm lv-btn--ghost" onclick={() => paperOcrModalOpen = false} aria-label="关闭"><Icon name="close" size={12} /></button>
            </div>
            <p class="lv-muted" style="margin:0 0 10px;font-size:12px;line-height:1.55">
              支持上传整张纸质试卷照片、扫描件（或截图直接 Ctrl+V 粘贴），亦可直接粘贴整份试卷文本。系统将自动切分大题章节（单选/多选/判断/填空/简答），水平切分选项，并将文末的「参考答案」跨段反向自动缝合回母题！
            </p>
            <div class="lv-row" style="margin:8px 0;gap:8px;align-items:center;flex-wrap:wrap">
              <button type="button" class="lv-btn sm lv-btn--primary" disabled={paperOcrBusy} onclick={() => paperFileInput?.click()}>
                <Icon name="camera" size={13} /> {paperOcrBusy ? "正在识别整卷…" : "选择试卷图片 / 扫描件"}
              </button>
              <input type="file" bind:this={paperFileInput} accept="image/*,.pdf" style="display:none" onchange={onPaperFileSelected} disabled={paperOcrBusy} />
              <span class="lv-muted" style="font-size:11.5px">或在下方直接粘贴整份试卷的文本或 OCR 结果：</span>
            </div>
            <textarea class="lv-input lv-textarea sm" rows="5" bind:value={paperRawText} placeholder="在此粘贴整卷文本（例如：&#10;一、单选题&#10;1. 计算机中用于存放当前指令地址的寄存器是（ ） A. PC  B. IR  C. AR  D. DR&#10;二、判断题&#10;2. 虚拟内存容量不受任何硬件限制。( × )&#10;【参考答案】&#10;1. A 解析：PC 为程序计数器&#10;2. 错）" disabled={paperOcrBusy}></textarea>
            <div class="lv-row" style="margin-top:8px;justify-content:space-between;align-items:center">
              <button type="button" class="lv-btn sm lv-btn--primary" onclick={() => { onSegmentPaperText(paperRawText); paperOcrModalOpen = false; }} disabled={paperOcrBusy || !paperRawText.trim()}>
                <Icon name="sparkles" size={12} /> ⚡ 立即整卷切题并缝合答案入库
              </button>
              <button type="button" class="lv-btn sm lv-btn--ghost" onclick={() => paperOcrModalOpen = false}>取消</button>
            </div>
          </div>
        {/if}
        <div class="lv-row" style="margin:4px 0 6px;gap:6px;align-items:center;flex-wrap:wrap">
          <span class="lv-muted" style="font-size:11px">⚡ 快速插入格式示例：</span>
          <button type="button" class="lv-chip sm" onclick={() => {
            importText = (importText ? importText.trimEnd() + "\n\n" : "") + "1. 计算机网络中 HTTP 默认使用的端口号是？\nA. 80\nB. 443\nC. 22\nD. 21\n答案：A\n解析：HTTP 协议默认运行在 TCP 80 端口上。\n考点：计算机网络/应用层";
          }}>单选题</button>
          <button type="button" class="lv-chip sm" onclick={() => {
            importText = (importText ? importText.trimEnd() + "\n\n" : "") + "1. 下列协议中属于传输层协议的有？\nA. TCP\nB. UDP\nC. IP\nD. ARP\n答案：AB\n解析：TCP 与 UDP 是典型的传输层端到端协议，IP 与 ARP 属于网络层协议。\n考点：网络体系/传输层";
          }}>多选题</button>
          <button type="button" class="lv-chip sm" onclick={() => {
            importText = (importText ? importText.trimEnd() + "\n\n" : "") + "1. 所有的偶数都是合数。( × )\n【解析】2 是偶数但也是质数，所以该说法错误。";
          }}>判断题</button>
          <button type="button" class="lv-chip sm" onclick={() => {
            importText = (importText ? importText.trimEnd() + "\n\n" : "") + "在冯·诺依曼计算机架构中，CPU 主要由 ==运算器== 和 ==控制器== 组成。";
          }}>高亮挖空</button>
          <button type="button" class="lv-chip sm" onclick={() => {
            importText = (importText ? importText.trimEnd() + "\n\n" : "") + "进程 :: 拥有系统资源分配与保护的独立基本单位\n线程 :: CPU 调度与执行的独立基本单位";
          }}>闪卡双冒号</button>
        </div>
        <textarea class="lv-input lv-textarea" rows="8" placeholder={t("import.placeholder")} aria-label={t("import.placeholder")} bind:value={importText} disabled={importBusy}></textarea>
        <div class="lv-row">
          <button class="lv-btn lv-btn--primary" onclick={onDoParseText} disabled={importBusy || !importText.trim()} aria-busy={importParsing} title={importText.trim() ? t("import.parse") : t("import.needInput")}>{importParsing ? t("import.parsing") : t("import.parse")}</button>
          <select class="lv-select" bind:value={dupeStrategy} onchange={onImportStrategyChange} disabled={importBusy} title={t("import.strategyHint")} aria-label={t("import.strategyHint")}>
            <option value="skip">{t("import.strategySkip")}</option>
            <option value="coexist">{t("import.strategyCoexist")}</option>
            <option value="update">{t("import.strategyUpdate")}</option>
          </select>
          <span class="lv-muted">{t("import.excelNote")}</span>
        </div>
        {#if savedMappings.length}
          <div class="lv-row">
            <span class="lv-chip">{t("import.useMapping")}</span>
            <select class="lv-select" style="max-width:220px" bind:value={selectedMapping} disabled={importBusy} aria-label={t("import.useMapping")}>
              <option value="">{t("import.autoMap")}</option>
              {#each savedMappings as m, _i (_i)}<option value={m.name}>{m.name}</option>{/each}
            </select>
          </div>
        {/if}
        {#if sheetRowsCache.get(activeSheet)?.length}
          <div class="lv-row">
            <button class="lv-btn sm" onclick={onToggleMapEditor} disabled={importBusy} aria-expanded={mapEditorOpen}><Icon name="pencil" size={13} /> {t("import.manualMap")}</button>
            {#if manualMap}<span class="lv-chip lv-chip--acc">{t("import.manualMapActive")}</span>{/if}
          </div>
          {#if mapEditorOpen}
            <div class="lv-detail" style="margin:4px 0 8px">
              <div class="lv-row" style="flex-wrap:wrap;gap:var(--lv-space-1)">
                {#each sheetRowsCache.get(activeSheet)![0].map(String) as h, hi (hi)}
                  <span class="lv-chip num" title={t("import.manualMapCol").replace("{l}", columnLabel(hi))}>{columnLabel(hi)}·{h || "—"}</span>
                {/each}
              </div>
              <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:var(--lv-space-1) 12px;margin:6px 0">
                {#each MAP_FIELDS as f (f.key)}
                  <label class="lv-row" style="margin:0;gap:var(--lv-space-compact)">
                    <span class="lv-muted" style="min-width:56px">{t(f.i18n)}</span>
                    <select class="lv-select" style="flex:1;min-width:0" bind:value={mapAssign[f.key]}>
                      <option value={-1}>{t("import.f.none")}</option>
                      {#each sheetRowsCache.get(activeSheet)![0] as h, hi (hi)}
                        <option value={hi}>{columnLabel(hi)}·{String(h).slice(0, 12) || "—"}</option>
                      {/each}
                    </select>
                  </label>
                {/each}
                {#each Array(6) as _, oi (oi)}
                  <label class="lv-row" style="margin:0;gap:var(--lv-space-compact)">
                    <span class="lv-muted" style="min-width:56px">{t("import.f.option")}{String.fromCharCode(65 + oi)}</span>
                    <select class="lv-select" style="flex:1;min-width:0" bind:value={mapAssign.options[oi]}>
                      <option value={-1}>{t("import.f.none")}</option>
                      {#each sheetRowsCache.get(activeSheet)![0] as h, hi (hi)}
                        <option value={hi}>{columnLabel(hi)}·{String(h).slice(0, 12) || "—"}</option>
                      {/each}
                    </select>
                  </label>
                {/each}
              </div>
              {#each mapErrors as me, _mi (_mi)}<div class="lv-error-row">{me}</div>{/each}
              <div class="lv-row">
                <button class="lv-btn lv-btn--primary sm" onclick={onApplyManualMap} disabled={importBusy}>{t("import.manualMapApply")}</button>
                <button class="lv-btn sm lv-btn--ghost" onclick={onCancelMapEditor}>{t("edit.cancel")}</button>
              </div>
            </div>
          {/if}
        {/if}
        {#if importError}<div class="lv-error" role="alert">{importError}</div>{/if}
        {#if importReport && !importReport.ok.length && importReport.errors.length}
          <div class="lv-card" style="margin:12px 0;padding:14px 18px;border-left:4px solid var(--lv-accent);background:color-mix(in srgb, var(--lv-accent-soft) 25%, var(--lv-surface));border-radius:var(--lv-r-2);box-shadow:var(--lv-sh-1)">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
              <Icon name="sparkles" size={16} />
              <b style="font-size:13.5px;color:var(--lv-text)">未在所选文档中检测到显式考题格式</b>
            </div>
            <p class="lv-muted" style="margin:0 0 10px;font-size:12.5px;line-height:1.6">
              {importReport.errors[0]?.reason || "文档中暂无明显的选择题、判断题或问答定义。建议交由 AI 自动阅读整篇正文并提炼出题！"}
            </p>
            <div class="lv-row" style="margin:0;gap:8px">
              <button class="lv-btn sm lv-btn--primary" onclick={() => { importSubTab = "siyuan"; onDoSearchDocs(""); }}>
                <Icon name="rotate" size={13} /> 返回思源文档列表
              </button>
              <button class="lv-btn sm" onclick={() => onchangeView("ai")}>
                <Icon name="sparkles" size={13} /> 前往 AI 出题工作台
              </button>
            </div>
          </div>
        {/if}
        {#if importReport}
          <p class="lv-muted">{t("import.target").replace("{name}", banks.find((b) => b.id === importPreviewBankId)?.name ?? importPreviewBankId)}</p>
          <div class="lv-row">
            <span class="lv-chip lv-chip--grn num" style="display:inline-flex;align-items:center;gap:3px"><Icon name="check" size={11} /> {importReport.ok.length}</span>
            <span class="lv-chip lv-chip--red num" style="display:inline-flex;align-items:center;gap:3px"><Icon name="close" size={11} /> {importReport.errors.length}</span>
            {#if importReport.duplicates}<span class="lv-chip lv-chip--amb num" style="display:inline-flex;align-items:center;gap:4px" title={t("import.dupeHint")}><Icon name="copy" size={11} /> {importReport.duplicates}</span>{/if}
          </div>
          <!-- 待入库试题校对与修改清单（支持行内编辑、题型切换、勾选选择性导入与删除） -->
          {#if importReport.ok.length}
            <div class="lv-import-preview-section" style="margin:14px 0 12px;padding:14px 16px;background:var(--lv-surface-2);border-radius:var(--lv-r-2, 12px);border:1px solid var(--lv-border-subtle)">
              <div class="lv-row" style="justify-content:space-between;align-items:center;margin:0 0 10px;flex-wrap:wrap;gap:8px">
                <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
                  <span class="lv-achievement-pill lv-achievement-pill--seal" style="font-size:11.5px;padding:2px 8px;font-weight:700">
                    <Icon name="file" size={12} /> 待入库试题校对与微调清单
                  </span>
                  <b style="font-size:13.5px;color:var(--lv-text)">
                    已识别 {importReport.ok.length} 题 · 已勾选 {selectedImportCount} 题
                  </b>
                  <!-- 置信度筛选器 -->
                  <div class="lv-row" style="margin:0;gap:4px">
                    <button type="button" class="lv-chip sm" class:acc={confidenceFilter === "all"} onclick={() => confidenceFilter = "all"}>
                      全部 ({importReport.ok.length})
                    </button>
                    <button type="button" class="lv-chip lv-chip--grn sm" class:acc={confidenceFilter === "high"} onclick={() => confidenceFilter = "high"} title="置信度≥85%且无严重瑕疵的题目">
                      🎯 高置信 ({highConfidenceCount})
                    </button>
                    {#if needReviewCount > 0}
                      <button type="button" class="lv-chip lv-chip--amb sm" class:acc={confidenceFilter === "need_review"} onclick={() => confidenceFilter = "need_review"} title="缺少答案或格式存疑需核验的题目">
                        ⚠️ 待核验 ({needReviewCount})
                      </button>
                    {/if}
                    {#if malformedCount > 0}
                      <button type="button" class="lv-chip lv-chip--red sm" class:acc={confidenceFilter === "malformed"} onclick={() => confidenceFilter = "malformed"} title="选项异常偏多（>4个）或存在空干缺陷的题目">
                        🚩 异常项 ({malformedCount})
                      </button>
                    {/if}
                  </div>
                </div>
                <div class="lv-row" style="margin:0;gap:6px;flex-wrap:wrap">
                  {#if highConfidenceCount > 0}
                    <button type="button" class="lv-btn sm lv-btn--primary" onclick={selectOnlyHighConfidence} title="只勾选高置信度好题，一键剔除噪音">
                      <Icon name="check" size={12} /> 仅勾选高置信题
                    </button>
                  {/if}
                  <button type="button" class="lv-btn sm lv-btn--ghost" onclick={autoFixImportQuestions} title="自动标准化多选题答案、修正大小写与标点瑕疵">
                    ⚡ 一键自愈修偏
                  </button>
                  {#if malformedCount > 0}
                    <button type="button" class="lv-btn sm lv-btn--ghost" onclick={pruneAllExcessOptions} title="将所有超过 4 项的选择题自动收敛为标准 A-D 四项，多余选项存入解析">
                      ✂️ 一键收敛选项 (至4项)
                    </button>
                    <button type="button" class="lv-btn sm lv-btn--ghost" onclick={convertMalformedToShort} title="将畸形选择题一键转为简答题">
                      📄 异常题转简答
                    </button>
                  {/if}
                  <button type="button" class="lv-btn sm lv-btn--ghost" onclick={dropLowConfidenceQuestions} title="一键丢弃置信度低于 60% 的残缺题目">
                    🗑️ 丢弃低分残题
                  </button>
                  <button type="button" class="lv-btn sm lv-btn--ghost" onclick={toggleSelectAllImportQuestions}>
                    {selectedImportCount === importReport.ok.length ? "取消全选" : "全选所有题目"}
                  </button>
                  <button type="button" class="lv-btn sm lv-btn--ghost" disabled={spotBusy} aria-busy={spotBusy} onclick={onSpotCheckRender}>
                    <Icon name="shuffle" size={12} /> 抽查排版渲染
                  </button>
                </div>
              </div>

              <!-- 每道题目的展开预览与编辑卡片列表 -->
              <div class="stack-sm" style="display:grid;gap:10px;max-height:480px;overflow-y:auto;padding-right:4px">
                {#each visibleImportQuestions as { q, qi } (q.id || qi)}
                  {@const isChecked = selectedImportQids[q.id || String(qi)] !== false}
                  <div class="lv-card" style="padding:12px 14px;background:var(--lv-surface);border-radius:var(--lv-r-2);border:1px solid {isChecked ? 'var(--lv-border)' : 'var(--lv-border-subtle)'};opacity:{isChecked ? 1 : 0.6};transition:all var(--lv-dur-micro) ease;box-shadow:var(--lv-sh-1)">
                    <div class="lv-row" style="justify-content:space-between;align-items:center;margin:0 0 8px;gap:8px">
                      <div class="lv-row" style="margin:0;gap:8px;align-items:center;flex:1;min-width:0;flex-wrap:wrap">
                        <input type="checkbox" checked={isChecked} onchange={(e) => {
                          const checked = (e.target as HTMLInputElement).checked;
                          selectedImportQids[q.id || String(qi)] = checked;
                        }} aria-label={`选择第 ${qi + 1} 题`} style="cursor:pointer" />
                        <span class="num" style="font-weight:700;color:var(--lv-accent);font-size:13px">#{qi + 1}</span>
                        <select class="lv-select sm" bind:value={q.type} style="max-width:110px;font-size:12px;padding:2px 8px;height:28px" aria-label="题型选择">
                          <option value="single">单选题</option>
                          <option value="multiple">多选题</option>
                          <option value="judge">判断题</option>
                          <option value="fill">填空题</option>
                          <option value="short">简答题</option>
                        </select>
                        <!-- 置信度评分勋章 -->
                        {#if (q.confidence ?? 1) >= 0.85 && (!q.lintIssues || q.lintIssues.length === 0)}
                          <span class="lv-chip lv-chip--grn num sm" style="font-size:10.5px;padding:1px 6px">🎯 {Math.round((q.confidence ?? 1) * 100)}% 高置信</span>
                        {:else if (q.confidence ?? 0.7) >= 0.60}
                          <span class="lv-chip lv-chip--amb num sm" style="font-size:10.5px;padding:1px 6px">⚠️ {Math.round((q.confidence ?? 0.7) * 100)}% 待核对</span>
                        {:else}
                          <span class="lv-chip lv-chip--red num sm" style="font-size:10.5px;padding:1px 6px">❓ {Math.round((q.confidence ?? 0.5) * 100)}% 存疑</span>
                        {/if}
                        {#if q.kp}
                          <span class="lv-chip num sm" style="font-size:11px;max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title={q.kp}>{q.kp}</span>
                        {/if}
                        <!-- 快速行内缺失答案秒设与括号答案即时提取 -->
                        {#if (q.type === "single" || q.type === "multiple") && (!q.answer || !q.answer.trim())}
                          {@const stemAns = (q.stem.match(/[（([【]\s*([A-D])\s*[)）\]】]/i) || q.stem.match(/答案[：:]\s*([A-D])/i))?.[1]?.toUpperCase()}
                          <div class="lv-row" style="margin:0;gap:3px;align-items:center;background:var(--lv-red-soft);padding:1px 6px;border-radius:4px" title="该题缺失答案，请点击字母秒设">
                            <span style="font-size:11px;color:var(--lv-red);font-weight:600">设答案:</span>
                            {#each q.options as _opt, oi (oi)}
                              {@const letter = String.fromCharCode(65 + oi)}
                              <button type="button" class="lv-chip sm" style="padding:0 5px;font-size:10px;cursor:pointer" onclick={() => { q.answer = letter; q.lintIssues = (q.lintIssues || []).filter(i => !i.includes("答案")); }}>
                                {letter}
                              </button>
                            {/each}
                            {#if stemAns}
                              <button type="button" class="lv-chip sm lv-chip--grn" style="padding:0 5px;font-size:10px;cursor:pointer" onclick={() => { q.answer = stemAns; q.lintIssues = (q.lintIssues || []).filter(i => !i.includes("答案")); }}>
                                识别为 {stemAns}
                              </button>
                            {/if}
                          </div>
                        {:else if q.type === "judge" && (!q.answer || !q.answer.trim())}
                          <div class="lv-row" style="margin:0;gap:3px;align-items:center;background:var(--lv-red-soft);padding:1px 6px;border-radius:4px" title="该题缺失判断答案，请点击秒设">
                            <span style="font-size:11px;color:var(--lv-red);font-weight:600">设答案:</span>
                            <button type="button" class="lv-chip sm" style="padding:0 5px;font-size:10px;cursor:pointer" onclick={() => { q.answer = "对"; q.lintIssues = (q.lintIssues || []).filter(i => !i.includes("答案")); }}>✓对</button>
                            <button type="button" class="lv-chip sm" style="padding:0 5px;font-size:10px;cursor:pointer" onclick={() => { q.answer = "错"; q.lintIssues = (q.lintIssues || []).filter(i => !i.includes("答案")); }}>✗错</button>
                          </div>
                        {/if}
                      </div>
                      <button type="button" class="lv-btn sm lv-btn--ghost" onclick={() => removeImportQuestion(q)} title="不导入此题" aria-label="删除此题" style="color:var(--lv-red);padding:2px 6px">
                        <Icon name="close" size={12} /> 不导入
                      </button>
                    </div>

                    <!-- 质检问题提示气泡 -->
                    {#if q.lintIssues && q.lintIssues.length > 0}
                      <div class="lv-row" style="margin:2px 0 6px;gap:4px;flex-wrap:wrap">
                        {#each q.lintIssues as issue (issue)}
                          <span class="lv-chip lv-chip--red num sm" style="font-size:10px;padding:1px 6px">🚩 {issue}</span>
                        {/each}
                      </div>
                    {/if}

                    <!-- 选项过多异常快捷处理条 -->
                    {#if q.options && q.options.length > 4}
                      <div class="lv-row" style="margin:2px 0 6px;padding:3px 8px;background:var(--lv-amber-soft);border-radius:4px;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:4px">
                        <span style="font-size:11px;color:var(--lv-amber-deep, var(--lv-amber));font-weight:600">
                          ⚠️ 选项达 {q.options.length} 个（疑似列表误判）：
                        </span>
                        <div class="lv-row" style="margin:0;gap:4px">
                          <button type="button" class="lv-chip sm lv-chip--amb" onclick={() => void pruneSingleQuestion(qi)} title="保留前4项A-D，其余选项文字自动存入解析">
                            ✂️ 仅保留前4项
                          </button>
                          <button type="button" class="lv-chip sm" onclick={() => void convertSingleQuestionToShort(qi)} title="安全转为简答题，选项保留为参考答案">
                            📄 转为简答题
                          </button>
                        </div>
                      </div>
                    {/if}

                    <!-- 填空题干无挖空异常快捷处理条 -->
                    {#if q.type === "fill" && !/_{2,}|（\s*）|\(\s*\)|【\s*】|\[\s*\]|\{\{c\d+::/.test(q.stem)}
                      <div class="lv-row" style="margin:2px 0 6px;padding:3px 8px;background:var(--lv-amber-soft);border-radius:4px;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:4px">
                        <span style="font-size:11px;color:var(--lv-amber-deep, var(--lv-amber));font-weight:600">
                          ⚠️ 填空题干未发现挖空占位符（如 ____ 或 （ ））：
                        </span>
                        <div class="lv-row" style="margin:0;gap:4px">
                          <button type="button" class="lv-chip sm lv-chip--amb" onclick={() => convertFillToShortSingle(qi)} title="安全转为简答题，支持自主回忆与要点自评">
                            📄 转为简答题
                          </button>
                          <button type="button" class="lv-chip sm" onclick={() => addBlankToStemSingle(qi)} title="在题干末尾自动补充（   ）占位符">
                            🪄 补全（ ）挖空
                          </button>
                        </div>
                      </div>
                    {/if}

                    <div style="margin:4px 0 8px">
                      <textarea class="lv-input lv-textarea sm" bind:value={q.stem} style="width:100%;min-height:48px;font-size:13px;line-height:1.5;resize:vertical!important" placeholder="题干内容…" aria-label="题干修改"></textarea>
                    </div>

                    {#if q.type === "single" || q.type === "multiple"}
                      <div style="display:grid;gap:6px;margin:6px 0 8px">
                        {#each q.options as _opt, oi (oi)}
                          {@const letter = String.fromCharCode(65 + oi)}
                          {@const isAns = q.answer && q.answer.includes(letter)}
                          <div class="lv-row" style="margin:0;gap:8px;align-items:center">
                            <button type="button" class="lv-chip" class:acc={isAns}
                              style="{isAns ? 'background:var(--lv-brand);color:var(--lv-on-accent, #fff);font-weight:700;' : ''}cursor:pointer;padding:2px 8px;font-size:11px"
                              title="点击将该选项设为正确答案"
                              onclick={() => {
                                if (q.type === "single") q.answer = letter;
                                else {
                                  if (q.answer.includes(letter)) q.answer = q.answer.replace(letter, "");
                                  else q.answer = (q.answer + letter).split("").sort().join("");
                                }
                              }}>
                              {letter}
                            </button>
                            <input class="lv-input sm" style="flex:1;font-size:12.5px" bind:value={q.options[oi]} placeholder={`选项 ${letter} 内容`} aria-label={`选项 ${letter}`} />
                            {#if isAns}
                              <span class="lv-chip lv-chip--grn num sm" style="font-size:10px;padding:1px 5px">正确项</span>
                            {/if}
                            {#if q.options.length > 2}
                              <button type="button" class="lv-btn sm lv-btn--ghost" onclick={() => { q.options.splice(oi, 1); q.options = [...q.options]; }} title="删除该选项" style="padding:2px 4px"><Icon name="close" size={11} /></button>
                            {/if}
                          </div>
                        {/each}
                        {#if q.options.length < 6}
                          <button type="button" class="lv-btn sm lv-btn--ghost" onclick={() => { q.options = [...q.options, ""]; }} style="justify-content:flex-start;font-size:11px;color:var(--lv-brand)">
                            <Icon name="plus" size={11} /> 增加选项
                          </button>
                        {/if}
                      </div>
                    {:else if q.type === "judge"}
                      <div class="lv-row" style="margin:6px 0 8px;gap:8px;align-items:center">
                        <span class="lv-muted" style="font-size:12px">设定标准答案：</span>
                        <button type="button" class="lv-chip" class:acc={q.answer === "对" || q.answer === "正确"} onclick={() => q.answer = "对"}>✓ 对（正确）</button>
                        <button type="button" class="lv-chip" class:acc={q.answer === "错" || q.answer === "错误"} onclick={() => q.answer = "错"}>✗ 错（错误）</button>
                      </div>
                    {:else}
                      <div class="lv-row" style="margin:6px 0 8px;gap:8px;align-items:center">
                        <span class="lv-muted" style="font-size:12px;min-width:60px">参考答案：</span>
                        <input class="lv-input sm" style="flex:1" bind:value={q.answer} placeholder="输入标准答案…" aria-label="标准答案" />
                      </div>
                    {/if}

                    <div class="lv-row" style="margin:4px 0 0;gap:8px;align-items:center">
                      <span class="lv-muted" style="font-size:11px;min-width:60px">💡 试题解析：</span>
                      <input class="lv-input sm" style="flex:1;font-size:12px" bind:value={q.analysis} placeholder="试题解析与破题思路（可选）…" aria-label="试题解析" />
                    </div>
                  </div>
                {/each}
              </div>
            </div>
          {/if}
          {#if spotIds.length}
            <div class="lv-detail" style="margin:8px 0;padding:10px 14px;background:var(--lv-surface);border:1px solid var(--lv-border);border-radius:var(--lv-r-2)">
              <b>抽查题面富文本渲染：</b>
              {#each spotIds as sid, _si (_si)}
                {@const sq = importReport.ok.find((q) => q.id === sid)}
                {#if sq}
                  <div style="margin:6px 0;padding-bottom:6px;border-bottom:1px solid var(--lv-border-subtle)">
                    <span class="lv-chip lv-chip--acc">{t("qtype." + sq.type)}</span>
                    <div class="lv-rich b3-typography" style="font-size:var(--lv-font-size-body-compact)">{@html spotHtml[sid] || escapeHtml(sq.stem)}</div>
                  </div>
                {/if}
              {/each}
            </div>
          {/if}
          {#each importReport.dupeSamples ?? [] as d, _i (_i)}
            <div class="lv-error-row num" title={t("import.dupeHint")} style="display:flex;align-items:center;gap:4px">
              <span>#{d.row}</span>
              <Icon name="copy" size={11} />
              <span>{t("import.dupeRow")} {d.stem}</span>
            </div>
          {/each}
          {#if importReport.updates?.length}
            <div class="lv-row" style="margin:4px 0 0">
              <span class="lv-chip lv-chip--amb num" title={t("import.updatesHint")} style="display:inline-flex;align-items:center;gap:4px">
                <Icon name="rotate" size={11} />
                <span>{t("import.updatesCount").replace("{n}", String(importReport.updates.length))}</span>
              </span>
            </div>
            {#each importReport.updates.slice(0, 10) as u, _ui2 (_ui2)}
              <div class="lv-error-row num" title={u.q.stem} style="display:inline-flex;align-items:center;gap:4px;flex-wrap:wrap">
                <Icon name="rotate" size={11} />
                <span>#{u.row} {u.q.stem.slice(0, 40)}</span>
                <Icon name="chev-right" size={10} />
                <span>{t("browse.answer")}: {u.q.answer}</span>
              </div>
            {/each}
          {/if}
          {#each importReport.errors.slice(0, 20) as err, _i (_i)}
            <div class="lv-error-row">
              <b class="num">#{err.row}</b> {err.reason}<span class="lv-muted"> · {err.raw}</span>
              <button class="lv-btn sm lv-btn--ghost" onclick={() => onStartRowFix(err.row)} disabled={importBusy}>{t("import.rowFix")}</button>
            </div>
            {#if fixRow === err.row}
              <div class="lv-detail" style="margin:4px 0 8px">
                {#if fixCells.length}
                  {#each fixCells as _c, ci (ci)}
                    <div class="lv-row" style="margin:3px 0">
                      <span class="lv-chip num">{ci}</span>
                      <input class="lv-input" bind:value={fixCells[ci]} aria-label={`修改第 ${ci} 列单元格`} />
                    </div>
                  {/each}
                {:else}
                  <textarea class="lv-input lv-textarea" rows="5" bind:value={fixText} aria-label={t("import.rowFixText")}></textarea>
                {/if}
                {#if fixNote}<div class="lv-error" role="alert">{fixNote}</div>{/if}
                <div class="lv-row">
                  <button class="lv-btn lv-btn--primary sm" disabled={importBusy || (!fixCells.length && !fixText.trim())} onclick={() => onApplyRowFix(err.row)}>{t("import.rowFixApply")}</button>
                  <button class="lv-btn sm lv-btn--ghost" onclick={onCancelRowFix}>{t("edit.cancel")}</button>
                </div>
              </div>
            {/if}
          {/each}
          {#if importReport.errors.length > 20}<div class="lv-muted num">… +{importReport.errors.length - 20}</div>{/if}
          {#if importReport.errors.length}
            <div class="lv-row">
              <button class="lv-btn sm" onclick={onDownloadErrorsCsv}><Icon name="export" size={13} /> {t("import.exportErrors")}</button>
            </div>
          {/if}
          {#if lastMap}
            <div class="lv-row">
              <button class="lv-btn sm" onclick={onSaveMapping} disabled={mappingBusy} aria-busy={mappingBusy}><Icon name="save" size={13} /> {mappingBusy ? "…" : t("import.saveMapping")}</button>
            </div>
          {/if}
          <div class="lv-row">
            <button class="lv-btn lv-btn--primary" onclick={() => {
              if (importReport) {
                importReport.ok = importReport.ok.filter((q, qi) => selectedImportQids[q.id || String(qi)] !== false);
              }
              onCommitImport();
            }} disabled={importBusy || (!selectedImportCount && !importReport.updates?.length && !trialConfirmed.length)} aria-busy={committing}>
              {committing ? t("import.committing") : importReport.updates?.length ? t("import.commitSummary").replace("{new}", String(selectedImportCount)).replace("{update}", String(importReport.updates.length)) : selectedImportCount ? t("import.commit") + " (" + selectedImportCount + ")" : t("import.finishTrial")}
            </button>
            <button class="lv-btn sm" onclick={onTrialImport5} disabled={importBusy || !selectedImportCount} aria-busy={trialBusy}>
              {trialBusy ? "…" : t("import.trial5")}
            </button>
            {#if committing && commitProgress}
              <span class="lv-chip num" role="status">{t("import.progress").replace("{d}", String(commitProgress.done)).replace("{t}", String(commitProgress.total))}</span>
              <button class="lv-btn sm" onclick={onCancelCommit}>{t("import.cancelCommit")}</button>
            {/if}
          </div>
          {#if trialNote}
            <div class="lv-row"><span class="lv-chip num">{trialNote}</span></div>
          {/if}
        {/if}
        {#if importResult}
          {#if importResult.written || !updateResult}<div class="lv-success" role="status" style="display:inline-flex;align-items:center;gap:4px"><Icon name="check" size={13} /> {t("import.done")} {importResult.written}</div>{/if}
          {#if updateResult}
            <div class="lv-row" role="status">
              <span class="lv-chip lv-chip--amb num" style="display:inline-flex;align-items:center;gap:4px"><Icon name="rotate" size={11} /> {t("import.updatesDone").replace("{ok}", String(updateResult.ok)).replace("{f}", String(updateResult.failed)).replace("{m}", String(updateResult.missing))}</span>
              {#if updateResult.unprocessed}<span class="lv-chip num">{t("import.updatesPending").replace("{n}", String(updateResult.unprocessed))}</span>{/if}
            </div>
          {/if}
          <div class="lv-row">
            {#if importResult.cancelled}
              <span class="lv-chip lv-chip--amb num">{t("import.cancelledNote").replace("{w}", String(importResult.written))}</span>
            {/if}
            {#if importResult.unprocessed}
              <span class="lv-chip num" title={t("import.unprocessedTip")}>{t("import.unprocessed").replace("{n}", String(importResult.unprocessed))}</span>
            {/if}
            {#if importResult.pendingIndex}
              <span class="lv-chip lv-chip--acc num" title={t("import.pendingIndexTip")} style="display:inline-flex;align-items:center;gap:4px">
                <Icon name="hourglass" size={11} />
                <span>{t("import.pendingIndex").replace("{n}", String(importResult.pendingIndex))}</span>
              </span>
            {/if}
            {#if importResult.verified}
              {#if importResult.missing === 0}
                <span class="lv-chip lv-chip--grn num" style="display:inline-flex;align-items:center;gap:3px"><Icon name="check" size={11} /> {t("import.readbackOk").replace("{n}", String(importResult.confirmed))}</span>
              {:else}
                <span class="lv-chip lv-chip--amb num"><Icon name="alert-triangle" size={11} /> {t("import.readbackPart").replace("{c}", String(importResult.confirmed)).replace("{m}", String(importResult.missing))}</span>
              {/if}
            {:else}
              <span class="lv-chip lv-chip--amb">{t("import.readbackUnknown")}</span>
            {/if}
            {#if retryPool.length}
              <button class="lv-btn sm" disabled={importBusy} onclick={onRetryMissing} style="display:inline-flex;align-items:center;gap:4px"><Icon name="rotate" size={12} /> {t("import.retryMissing").replace("{n}", String(retryPool.length))}</button>
            {/if}
          </div>
          <div class="lv-row">
            <button class="lv-btn lv-btn--primary" onclick={onGoPractice}>{t("import.goPractice")}</button>
            <button class="lv-btn" onclick={onGoBrowse}>{t("import.goBrowse")}</button>
          </div>
        {/if}
      {/if}
    </div>
  {/if}
</div>
