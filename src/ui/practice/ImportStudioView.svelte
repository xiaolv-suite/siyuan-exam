<script lang="ts">
  import Icon from "../shared/Icon.svelte";
  import type { BankInfo } from "../../app";
  import type { ImportReport, ImportCheckpoint } from "../../importer/pipeline";
  import type { MapAssignment } from "../../importer/mapping";
  import type { ParsedClozeItem } from "@/core/cloze";
  import StudioSubNav from "./StudioSubNav.svelte";

  interface Props {
    hasBank: boolean;
    banks: BankInfo[];
    importCheckpoint: ImportCheckpoint | null;
    importBusy: boolean;
    importDragOver: boolean;
    importSubTab: "standard" | "cloze" | "siyuan";
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
    onToggleClozeMode: (mode: "highlight" | "curly" | "bracket") => void;
    onDoParseCloze: () => void;
    onImportClozeQuestions: () => void;
    onPickExcel: () => void;
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
  }

  let {
    hasBank,
    banks,
    importCheckpoint,
    importBusy,
    importDragOver = $bindable(),
    importSubTab = $bindable(),
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
    remainingImportQuestions,
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
    onToggleClozeMode,
    onDoParseCloze,
    onImportClozeQuestions,
    onPickExcel,
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
  }: Props = $props();

  let docSearchDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  function handleDocSearchInput(val: string) {
    if (docSearchDebounceTimer) clearTimeout(docSearchDebounceTimer);
    docSearchDebounceTimer = setTimeout(() => {
      onDoSearchDocs(val);
    }, 250);
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
    <div class="lv-empty">{t("guard.needBankFirst")}</div>
  {:else}
    {#if importCheckpoint}
      <!-- 38-04 / U08：未完成导入任务断点恢复提示条 -->
      <div class="lv-card lv-pad-card" style="margin-bottom:12px;border:1px solid var(--lv-border-subtle);border-left:3.5px solid var(--lv-accent);border-radius:var(--lv-r-card, 16px);background:var(--lv-surface-2);box-shadow:var(--lv-sh-1)">
        <div class="lv-row" style="justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
          <div>
            <b><Icon name="activity" size={14} /> {t("import.checkpointTitle")}</b>
            <div class="lv-muted" style="font-size:var(--lv-font-size-caption);margin-top:2px">
              {t("import.checkpointDesc")} <code>{importCheckpoint.batch}</code> · {t("import.checkpointStats").replace("{c}", String(importCheckpoint.confirmedIds.length)).replace("{p}", String(importCheckpoint.pendingQuestions.length))}
            </div>
          </div>
          <div class="lv-row" style="margin:0;gap:6px">
            <button class="lv-btn lv-btn--primary sm" disabled={importBusy} onclick={onResumeCheckpoint}>
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
      <!-- 52-09 导入方式子分面切换：批量文件导入 vs 思源笔记文档直接导入 vs 正文划重点挖空出题 -->
      <div class="lv-session-dock" role="tablist" aria-label="导入方式切换" style="margin-bottom:14px">
        <button type="button" role="tab" class="lv-chip" class:acc={importSubTab === "standard"} aria-selected={importSubTab === "standard"} onclick={() => importSubTab = "standard"}>
          <Icon name="import" size={12} /> {t("import.title")}（Excel / CSV / Aiken）
        </button>
        <button type="button" role="tab" class="lv-chip" class:acc={importSubTab === "siyuan"} aria-selected={importSubTab === "siyuan"} onclick={() => { importSubTab = "siyuan"; onDoSearchDocs(""); }}>
          <Icon name="book" size={12} /> {t("import.fromSiyuanDoc")}
        </button>
        <button type="button" role="tab" class="lv-chip" class:acc={importSubTab === "cloze"} aria-selected={importSubTab === "cloze"} onclick={() => importSubTab = "cloze"}>
          <Icon name="edit" size={12} /> {t("cloze.tab")}
        </button>
      </div>
      {#if importSubTab === "siyuan"}
        <!-- 从思源笔记原生文档直接提取题目导入 -->
        <div class="stack-sm" style="margin-top:6px">
          <div class="lv-chip lv-chip--grn" style="font-size:11px;padding:4px 8px;margin-bottom:4px" role="note">
            {t("import.siyuanDocSafety")}
          </div>
          <div class="lv-row" style="margin:0;gap:6px;align-items:center">
            <input class="lv-input sm" style="flex:1" placeholder={t("import.searchDocPlaceholder")} bind:value={docSearchQuery} oninput={(e) => handleDocSearchInput((e.target as HTMLInputElement).value)} />
            {#if docSearchQuery}
              <button class="lv-btn sm lv-btn--ghost" onclick={() => { docSearchQuery = ""; onDoSearchDocs(""); }} title="清空搜索" aria-label="清空搜索"><Icon name="close" size={12} /></button>
            {/if}
            <button class="lv-btn sm" onclick={() => { if (docSearchDebounceTimer) clearTimeout(docSearchDebounceTimer); onDoSearchDocs(docSearchQuery); }} disabled={siyuanDocBusy}><Icon name="search" size={13} /> {siyuanDocBusy ? "…" : "搜索"}</button>
          </div>
          <div class="stack-sm" style="max-height:360px;overflow-y:auto;border:1px solid var(--lv-border);border-radius:var(--lv-r-2);padding:6px;background:var(--lv-surface)">
            {#if siyuanDocCandidates.length === 0}
              <div class="lv-muted" style="padding:16px;text-align:center">{siyuanDocBusy ? "正在搜索思源文档…" : "未找到匹配文档，请尝试输入其他关键词"}</div>
            {:else}
              <div class="lv-row" style="justify-content:space-between;align-items:center;padding:8px 12px;margin-bottom:6px;background:var(--lv-surface-2);border-radius:var(--lv-r-card, 12px);border:1px solid var(--lv-border-subtle);flex-wrap:wrap;gap:6px">
                <div class="lv-row" style="margin:0;gap:8px;align-items:center">
                  <button type="button" class="lv-chip num sm" onclick={onToggleSelectAllDocs} class:acc={selectedDocCount > 0}>
                    {selectedDocCount === siyuanDocCandidates.length ? "☑ 全选" : selectedDocCount > 0 ? `☑ 已选 ${selectedDocCount}` : "☐ 全选"}
                  </button>
                  <span class="lv-muted" style="font-size:11px;display:inline-flex;align-items:center;gap:4px">
                    {#if !docSearchQuery.trim()}<Icon name="clock" size={11} />{/if}
                    {docSearchQuery.trim() ? `搜索到 ${siyuanDocCandidates.length} 篇相关笔记` : `最近编辑笔记（共 ${siyuanDocCandidates.length} 篇）`}
                  </span>
                </div>
                <div class="lv-row" style="margin:0;gap:6px">
                  {#if selectedDocCount > 0}
                    <button class="lv-btn sm lv-btn--primary" disabled={siyuanDocBusy} onclick={onImportSelectedDocs}>
                      <Icon name="import" size={12} /> {siyuanDocBusy ? "正在提取…" : `提取已选 (${selectedDocCount})`}
                    </button>
                  {/if}
                  <button class="lv-btn sm lv-btn--ghost" disabled={siyuanDocBusy} onclick={onImportAllSearchedDocs}>
                    <Icon name="layers" size={12} /> {siyuanDocBusy ? "正在提取…" : `全部提取 (${siyuanDocCandidates.length})`}
                  </button>
                </div>
              </div>
              {#each siyuanDocCandidates as doc (doc.id)}
                <div class="lv-row" style="justify-content:space-between;align-items:center;padding:8px 10px;border-bottom:1px solid var(--lv-border-subtle);gap:8px">
                  <div class="lv-row" style="margin:0;gap:8px;align-items:center;flex:1;min-width:0">
                    <input type="checkbox" checked={!!selectedDocIds[doc.id]} onchange={(e) => {
                      const checked = (e.target as HTMLInputElement).checked;
                      if (checked) selectedDocIds[doc.id] = true;
                      else { delete selectedDocIds[doc.id]; selectedDocIds = { ...selectedDocIds }; }
                    }} />
                    <div style="flex:1;min-width:0">
                      <b style="font-size:var(--lv-font-size-sm);display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{doc.title}</b>
                      <div class="lv-muted" style="font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{doc.hpath}</div>
                    </div>
                  </div>
                  <button class="lv-btn sm lv-btn--primary" disabled={siyuanDocBusy} onclick={() => onPickAndImportSiyuanDoc(doc.id, doc.title)}>
                    <Icon name="import" size={12} /> {siyuanDocBusy ? "提取中…" : "提取此篇"}
                  </button>
                </div>
              {/each}
            {/if}
          </div>
        </div>
      {:else if importSubTab === "cloze"}
        <!-- 52-09 正文划重点挖空出题工作台 -->
        <div class="lv-row" style="margin:4px 0 8px;gap:6px;align-items:center;flex-wrap:wrap">
          <span class="lv-muted" style="font-size:var(--lv-font-size-caption)">识别语法：</span>
          <button type="button" class="lv-chip sm" class:acc={clozeModes.includes("highlight")} onclick={() => onToggleClozeMode("highlight")}>{t("cloze.modeHighlight")}</button>
          <button type="button" class="lv-chip sm" class:acc={clozeModes.includes("curly")} onclick={() => onToggleClozeMode("curly")}>{t("cloze.modeCurly")}</button>
          <button type="button" class="lv-chip sm" class:acc={clozeModes.includes("bracket")} onclick={() => onToggleClozeMode("bracket")}>{t("cloze.modeBracket")}</button>
        </div>
        <textarea class="lv-input lv-textarea" rows="6" placeholder={t("cloze.placeholder")} bind:value={clozeInputText} disabled={importBusy || clozeImporting}></textarea>
        <div class="lv-row" style="margin:8px 0">
          <button class="lv-btn lv-btn--primary" onclick={onDoParseCloze} disabled={importBusy || clozeImporting || !clozeInputText.trim()}>
            <Icon name="sparkles" size={14} /> {t("cloze.parseBtn")}
          </button>
          {#if clozeParsedItems.length}
            <button class="lv-btn lv-btn--primary" onclick={onImportClozeQuestions} disabled={importBusy || clozeImporting}>
              {clozeImporting ? "…" : t("cloze.importBtn").replace("{n}", String(clozeParsedItems.length))}
            </button>
            <span class="lv-chip lv-chip--grn num">{t("cloze.parsedCount").replace("{n}", String(clozeParsedItems.length))}</span>
          {/if}
        </div>
        {#if clozeParsedItems.length}
          <div class="stack-sm" style="margin-top:10px;max-height:300px;overflow:auto">
            {#each clozeParsedItems as it, idx (idx)}
              <div class="lv-card" style="padding:10px 14px;background:var(--lv-surface);border-radius:var(--lv-r-card, 14px);border:1px solid var(--lv-border-subtle);box-shadow:var(--lv-sh-1)">
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
      {:else}
        <div class="lv-row">
          <button type="button" class="lv-btn" disabled={importBusy} onclick={onPickExcel}><Icon name="folder" size={15} /> {t("import.pickExcel")}</button>
          <button class="lv-btn sm" onclick={onDownloadTemplate}><Icon name="import" size={15} /> {t("import.template")}</button>
          <button class="lv-btn sm lv-btn--ghost" onclick={onPasteClipboard} disabled={importBusy} title={t("import.pasteClipboardTip")}><Icon name="copy" size={14} /> {t("import.pasteClipboard")}</button>
          <span class="lv-muted">{t("import.orPaste")}</span>
        </div>
        <textarea class="lv-input lv-textarea" rows="8" placeholder={t("import.placeholder")} bind:value={importText} disabled={importBusy}></textarea>
        <div class="lv-row">
          <button class="lv-btn lv-btn--primary" onclick={onDoParseText} disabled={importBusy || !importText.trim()} title={importText.trim() ? t("import.parse") : t("import.needInput")}>{importParsing ? t("import.parsing") : t("import.parse")}</button>
          <select class="lv-select" bind:value={dupeStrategy} onchange={onImportStrategyChange} disabled={importBusy} title={t("import.strategyHint")}>
            <option value="skip">{t("import.strategySkip")}</option>
            <option value="coexist">{t("import.strategyCoexist")}</option>
            <option value="update">{t("import.strategyUpdate")}</option>
          </select>
          <span class="lv-muted">{t("import.excelNote")}</span>
        </div>
        {#if savedMappings.length}
          <div class="lv-row">
            <span class="lv-chip">{t("import.useMapping")}</span>
            <select class="lv-select" style="max-width:220px" bind:value={selectedMapping} disabled={importBusy}>
              <option value="">{t("import.autoMap")}</option>
              {#each savedMappings as m, _i (_i)}<option value={m.name}>{m.name}</option>{/each}
            </select>
          </div>
        {/if}
        {#if sheetRowsCache.get(activeSheet)?.length}
          <div class="lv-row">
            <button class="lv-btn sm" onclick={onToggleMapEditor} disabled={importBusy}><Icon name="pencil" size={13} /> {t("import.manualMap")}</button>
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
        {#if importError}<div class="lv-error">{importError}</div>{/if}
        {#if importReport}
          <p class="lv-muted">{t("import.target").replace("{name}", banks.find((b) => b.id === importPreviewBankId)?.name ?? importPreviewBankId)}</p>
          <div class="lv-row">
            <span class="lv-chip lv-chip--grn num">✓ {importReport.ok.length}</span>
            <span class="lv-chip lv-chip--red num">✕ {importReport.errors.length}</span>
            {#if importReport.duplicates}<span class="lv-chip lv-chip--amb num" style="display:inline-flex;align-items:center;gap:4px" title={t("import.dupeHint")}><Icon name="copy" size={11} /> {importReport.duplicates}</span>{/if}
            {#if importReport.ok.length}
              <button class="lv-btn sm lv-btn--ghost" disabled={spotBusy} onclick={onSpotCheckRender}>
                <Icon name="shuffle" size={13} /> {t("import.spotCheck")}{#if spotIds.length}（{spotIds.length}）{/if}
              </button>
            {/if}
          </div>
          {#if spotIds.length}
            {#each spotIds as sid, _si (_si)}
              {@const sq = importReport.ok.find((q) => q.id === sid)}
              {#if sq}
                <div class="lv-detail" style="margin:6px 0">
                  <div class="lv-row" style="margin:0">
                    <span class="lv-chip lv-chip--acc">{t("qtype." + sq.type)}</span>
                    {#if sq.kp}<span class="lv-chip">{sq.kp}</span>{/if}
                    <span class="lv-muted num">{t("browse.answer")}: {sq.answer}</span>
                  </div>
                  <div class="lv-rich b3-typography" style="font-size:var(--lv-font-size-body-compact)">{@html spotHtml[sid] || escapeHtml(sq.stem)}</div>
                  {#each sq.options as opt, oi (oi)}
                    <div class="lv-muted">{String.fromCharCode(65 + oi)}. {opt}</div>
                  {/each}
                </div>
              {/if}
            {/each}
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
              <span class="lv-chip lv-chip--amb num" title={t("import.updatesHint")}>↻ {t("import.updatesCount").replace("{n}", String(importReport.updates.length))}</span>
            </div>
            {#each importReport.updates.slice(0, 10) as u, _ui2 (_ui2)}
              <div class="lv-error-row num" title={u.q.stem}>↻ #{u.row} {u.q.stem.slice(0, 40)} → {t("browse.answer")}: {u.q.answer}</div>
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
                      <input class="lv-input" bind:value={fixCells[ci]} />
                    </div>
                  {/each}
                {:else}
                  <textarea class="lv-input lv-textarea" rows="5" bind:value={fixText} aria-label={t("import.rowFixText")}></textarea>
                {/if}
                {#if fixNote}<div class="lv-error">{fixNote}</div>{/if}
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
            <button class="lv-btn lv-btn--primary" onclick={onCommitImport} disabled={importBusy || (!remainingImportQuestions.length && !importReport.updates?.length && !trialConfirmed.length)}>
              {committing ? t("import.committing") : importReport.updates?.length ? t("import.commitSummary").replace("{new}", String(remainingImportQuestions.length)).replace("{update}", String(importReport.updates.length)) : remainingImportQuestions.length ? t("import.commit") + " (" + remainingImportQuestions.length + ")" : t("import.finishTrial")}
            </button>
            <button class="lv-btn sm" onclick={onTrialImport5} disabled={importBusy || !remainingImportQuestions.length}>
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
          {#if importResult.written || !updateResult}<div class="lv-success" role="status">✓ {t("import.done")} {importResult.written}</div>{/if}
          {#if updateResult}
            <div class="lv-row" role="status">
              <span class="lv-chip lv-chip--amb num">↻ {t("import.updatesDone").replace("{ok}", String(updateResult.ok)).replace("{f}", String(updateResult.failed)).replace("{m}", String(updateResult.missing))}</span>
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
              <span class="lv-chip lv-chip--acc num" title={t("import.pendingIndexTip")}>
                ⏳ {t("import.pendingIndex").replace("{n}", String(importResult.pendingIndex))}
              </span>
            {/if}
            {#if importResult.verified}
              {#if importResult.missing === 0}
                <span class="lv-chip lv-chip--grn num">✓ {t("import.readbackOk").replace("{n}", String(importResult.confirmed))}</span>
              {:else}
                <span class="lv-chip lv-chip--amb num"><Icon name="alert-triangle" size={11} /> {t("import.readbackPart").replace("{c}", String(importResult.confirmed)).replace("{m}", String(importResult.missing))}</span>
              {/if}
            {:else}
              <span class="lv-chip lv-chip--amb">{t("import.readbackUnknown")}</span>
            {/if}
            {#if retryPool.length}
              <button class="lv-btn sm" disabled={importBusy} onclick={onRetryMissing}>↻ {t("import.retryMissing").replace("{n}", String(retryPool.length))}</button>
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
