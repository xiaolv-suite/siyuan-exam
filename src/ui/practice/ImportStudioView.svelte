<script lang="ts">
  import { onDestroy } from "svelte";
  import Icon from "../shared/Icon.svelte";
  import type { BankInfo } from "../../app";
  import type { ImportReport, ImportCheckpoint } from "../../importer/pipeline";
  import type { MapAssignment } from "../../importer/mapping";
  import type { ParsedClozeItem } from "@/core/cloze";
  import StudioSubNav from "./StudioSubNav.svelte";
  import AiThinkingCard from "../shared/AiThinkingCard.svelte";
  import ImportReviewPanel from "./ImportReviewPanel.svelte";

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
    onchangeView: (view: "manual" | "siyuan" | "materials" | "import" | "ai") => void;
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
    onCommitImport: (selectedQuestions?: any[]) => void;
    onCancelCommit: () => void;
    onTrialImport5: (selectedQuestions?: any[]) => void;
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
    paperOcrStatusText?: string;
    onSegmentPaperText?: (text: string, name?: string) => void;
    onPaperImageUpload?: (file: File | Blob) => void;
    onOpenPdfCrop?: (file: File) => void;
    onCancelPaperOcr?: () => void;
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
    importReport = $bindable(),
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
    paperOcrStatusText = "",
    onSegmentPaperText = () => {},
    onPaperImageUpload = () => {},
    onOpenPdfCrop,
    onCancelPaperOcr = () => {},
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

  onDestroy(() => {
    if (docSearchDebounceTimer) clearTimeout(docSearchDebounceTimer);
  });

  function handleDocSearchInput(val: string) {
    if (docSearchDebounceTimer) clearTimeout(docSearchDebounceTimer);
    docSearchDebounceTimer = setTimeout(() => {
      onDoSearchDocs(val);
    }, 150);
  }

  let paperOcrModalOpen = $state(false);
  let paperRawText = $state("");
  let paperFileInput = $state<HTMLInputElement | null>(null);
  let pdfCropFileInput = $state<HTMLInputElement | null>(null);

  function onPaperFileSelected(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) {
      onPaperImageUpload(file);
    }
    input.value = "";
  }

  function onPdfCropFileSelected(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) {
      onOpenPdfCrop?.(file);
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
  <div class="lv-row lv-studio-crumb-row">
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
      <!-- 思源笔记原生内容出题导流卡片（精简唯一入口，避免与上方 StudioSubNav 重复堆叠） -->
      <div class="lv-card lv-studio-intro-card" style="margin-bottom:12px;padding:10px 14px;background:color-mix(in srgb, var(--lv-accent-soft, rgba(66, 133, 244, 0.08)) 25%, var(--lv-surface));border-left:4px solid var(--lv-brand);border-radius:var(--lv-r-2);display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
        <div style="font-size:12.5px;color:var(--lv-text);line-height:1.5">
          <b>想直接从思源笔记文档出题？</b>
          <span class="lv-muted" style="margin-left:6px">支持文档正文提炼、划重点高光挖空、#考点# 标签及小驴拾遗剪藏一键出题。</span>
        </div>
        <button type="button" class="lv-btn sm lv-btn--primary" onclick={() => onchangeView("siyuan")} style="display:inline-flex;align-items:center;gap:4px">
          <Icon name="book" size={12} /> <span>前往【思源出题】工作台 →</span>
        </button>
      </div>
      {#if importSubTab === "siyuan"}
        <!-- 从思源笔记原生文档直接提取题目导入（本插件核心特色能力） -->
        <div class="stack-sm" style="margin-top:6px;min-width:0;max-width:100%">
          <div class="lv-card lv-import-guide-card" style="margin:2px 0 4px;padding:8px 12px;background:color-mix(in srgb, var(--lv-accent-soft) 25%, var(--lv-surface));border-left:3.5px solid var(--lv-accent);border-radius:var(--lv-r-2);font-size:12px;line-height:1.5;min-width:0;max-width:100%;box-sizing:border-box">
            <b style="color:var(--lv-text);display:block;margin-bottom:2px">💡 思源原生笔记试题提取指引（本插件核心特色）：</b>
            直接读取思源笔记正文，支持单选/多选/判断/表格题、<code>==高亮划重点填空==</code>、<code>**术语定义**</code> 以及 <code>::</code> 闪卡语法。提取后的题目自动与思源原笔记段落建立双向溯源链接！
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
                style="{importDocProfile === mode.id ? 'background:var(--lv-brand);color:var(--lv-on-brand, #fff);font-weight:700;' : ''}font-size:11px;padding:2px 8px;cursor:pointer"
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
              <input class="lv-input sm" style="width:100%;padding-left:28px;padding-right:32px" placeholder={t("import.searchDocPlaceholder")} aria-label={t("import.searchDocPlaceholder")} bind:value={docSearchQuery} oninput={(e) => handleDocSearchInput((e.target as HTMLInputElement).value)} />
              {#if docSearchQuery}
                <button type="button" class="lv-btn sm lv-btn--ghost" onclick={() => { docSearchQuery = ""; onDoSearchDocs(""); }} title="清空搜索" aria-label="清空搜索" style="position:absolute;right:3px;padding:0;min-width:28px;min-height:28px;display:inline-flex;align-items:center;justify-content:center;border-radius:var(--lv-radius-control-sm,6px)"><Icon name="close" size={12} /></button>
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
            <input class="lv-input sm" style="flex:1" placeholder="输入自定义标签名称（如 #考研真题 或 #法考重点）…" bind:value={customTagInput} onkeydown={(e) => { if (e.isComposing || e.keyCode === 229) return; if (e.key === "Enter") { selectedTag = customTagInput || selectedTag; onDoSearchTags(selectedTag); } }} />
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
          1. <b>支持文档与表格</b>：PDF 试卷（文字层免配置直提 + 扫描件分页 OCR）、Word (.docx，含基础公式)、Excel (.xlsx / .xls)、CSV、TSV；<br />
          2. <b>支持试题文本</b>：直接选择纯文本文件 (.txt / .gift / .md) 或将试卷/Aiken 文本粘贴到下方文本框中即可一键解析入库！
        </div>
        <div class="lv-row" style="flex-wrap:wrap;gap:8px;align-items:center">
          <button type="button" class="lv-btn" disabled={importBusy || paperOcrBusy} onclick={() => { if (importFileInput) importFileInput.click(); else onPickExcel(); }}><Icon name="folder" size={15} /> {t("import.pickExcel")}</button>
          <input type="file" bind:this={importFileInput} accept=".xlsx,.xls,.csv,.tsv,.txt,.gift,.docx,.md,.json,.qcard,.lvcards,.pdf" hidden onchange={onExcelFile} disabled={importBusy || paperOcrBusy} />
          <button type="button" class="lv-btn sm lv-btn--primary" onclick={() => paperOcrModalOpen = !paperOcrModalOpen} title="上传 PDF 试卷或整张纸质试卷照片，一键整卷切题并反向缝合参考答案">
            <Icon name="camera" size={13} /> 📄 PDF / 纸质试卷导入
          </button>
          {#if onOpenPdfCrop}
            <button type="button" class="lv-btn sm" disabled={importBusy || paperOcrBusy} onclick={() => pdfCropFileInput?.click()} title="打开 PDF 页面手动矩形框选截题，裁剪题图或送入识图">
              ✂️ PDF 框选截题
            </button>
            <input type="file" bind:this={pdfCropFileInput} accept=".pdf,application/pdf" hidden onchange={onPdfCropFileSelected} disabled={importBusy || paperOcrBusy} />
          {/if}
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
                <Icon name="camera" size={13} /> {paperOcrBusy ? (paperOcrStatusText || "正在解析整卷…") : "选择 PDF 试卷 / 扫描图片"}
              </button>
              <input type="file" bind:this={paperFileInput} accept="image/*,.pdf" style="display:none" onchange={onPaperFileSelected} disabled={paperOcrBusy} />
              <span class="lv-muted" style="font-size:11.5px">文字型 PDF 自动免费直提；扫描件按页转图调用思源 OCR 或本机 Umi-OCR：</span>
            </div>
            {#if paperOcrBusy}
              <div style="margin:8px 0">
                <AiThinkingCard
                  scenario="transform"
                  defaultIcon="📄"
                  compact={true}
                  title={paperOcrStatusText || "📄 正在解析整卷并执行识别…"}
                  subtitle="文字型 PDF 本地直提 / 扫描页智能分流，自动切题并缝合答案"
                  cancelLabel="⏹ 取消识别"
                  oncancel={onCancelPaperOcr}
                />
              </div>
            {/if}
            <textarea class="lv-input lv-textarea sm" rows="5" bind:value={paperRawText} placeholder="在此粘贴整卷文本（例如：&#10;一、单选题&#10;1. 计算机中用于存放当前指令地址的寄存器是（ ） A. PC  B. IR  C. AR  D. DR&#10;二、判断题&#10;2. 虚拟内存容量不受任何硬件限制。( × )&#10;【参考答案】&#10;1. A 解析：PC 为程序计数器&#10;2. 错）" disabled={paperOcrBusy}></textarea>
            <div class="lv-row" style="margin-top:8px;justify-content:space-between;align-items:center">
              <button type="button" class="lv-btn sm lv-btn--primary" onclick={() => { onSegmentPaperText(paperRawText); paperOcrModalOpen = false; }} disabled={paperOcrBusy || !paperRawText.trim()}>
                <Icon name="sparkles" size={12} /> ⚡ 立即整卷切题并缝合答案入库
              </button>
              <button type="button" class="lv-btn sm lv-btn--ghost" onclick={() => paperOcrModalOpen = false}>取消</button>
            </div>
          </div>
        {:else if paperOcrBusy}
          <div style="margin:10px 0">
            <AiThinkingCard
              scenario="transform"
              defaultIcon="📄"
              compact={true}
              title={paperOcrStatusText || "📄 正在解析整卷并执行识别…"}
              subtitle="文字型 PDF 本地直提 / 扫描页智能分流，自动切题并缝合答案"
              cancelLabel="⏹ 取消识别"
              oncancel={onCancelPaperOcr}
            />
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
        <ImportReviewPanel
          {banks}
          {importBusy}
          {importError}
          bind:importReport
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
          {trialConfirmed}
          {trialBusy}
          {commitProgress}
          {trialNote}
          {importResult}
          {updateResult}
          {retryPool}
          showEmptyAiFallback={true}
          {t}
          {escapeHtml}
          {onSpotCheckRender}
          {onStartRowFix}
          {onApplyRowFix}
          {onCancelRowFix}
          {onDownloadErrorsCsv}
          {onSaveMapping}
          {onCommitImport}
          {onCancelCommit}
          {onTrialImport5}
          {onRetryMissing}
          {onGoPractice}
          {onGoBrowse}
          onGoAi={() => onchangeView("ai")}
          onBackToDocList={() => { importSubTab = "siyuan"; onDoSearchDocs(""); }}
        />
      {/if}
    </div>
  {/if}
</div>
