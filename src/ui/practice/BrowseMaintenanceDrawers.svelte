<script lang="ts">
  import Icon from "../shared/Icon.svelte";
  import { showDocTreeNativeMenu } from "@/libs/lv-notice-kit";
  import type { Question } from "../../core/types";
  import type { ExamApp } from "../../app";
  import { coverageTree, subtreeCount, subtreeLearned, subtreeNoSource } from "@/core/syllabus";
  import type { SyllabusNode } from "@/core/syllabus";
  import { describeChange } from "@/core/batchEdit";

  function countSyllabusNodes(nodes: SyllabusNode[]): number {
    return nodes.reduce((s, n) => s + 1 + countSyllabusNodes(n.children), 0);
  }

  interface Props {
    t: (k: string, fb?: string) => string;
    app: ExamApp;
    questionMap: Map<string, Question>;
    sectionOpen: boolean;
    sectionBusy: boolean;
    sectionTree: any[];
    sectionSel: any;
    kpOpen: boolean;
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
    paperOpen: boolean;
    paperText: string;
    paperPreview: any;
    paperBusy: boolean;
    paperNote: string;
    errataOpen: boolean;
    errataBusy: boolean;
    errataErrors: any[];
    errataPlan: any;
    errataNote: string;
    batchMode: boolean;
    selectedIds: Record<string, boolean>;
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
    filterType: string;
    onsetFilterSource: (src: string) => void;
    activeClusterIndex: number;
    mergeBusy: boolean;
    orphanDiag: any;
    filterOrphanKind: string;
    batchList: any[];
    rollbackBusy: string;
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
    onprintSelectedQuestions: (format?: import("./services/printPaperService").PrintPaperFormat) => void;
    onapplyBatch: (isUndo: boolean) => void;
    onpreviewBatch: () => void;
    ontoggleCluster: (idx: number) => void;
    onmergeClusterToTarget: (target: Question, ids: string[]) => void;
    ondrillOrphanKind: (kind: any) => void;
    ondownloadHealthCsv: () => void;
    onundoBatch: (batch: string) => void;
    oncloseSection?: () => void;
    oncloseKp?: () => void;
    onclosePaper?: () => void;
    oncloseErrata?: () => void;
  }

  let {
    t,
    app,
    questionMap,
    sectionOpen,
    sectionBusy,
    sectionTree,
    sectionSel = $bindable(),
    kpOpen = $bindable(),
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
    paperOpen,
    paperText = $bindable(),
    paperPreview,
    paperBusy,
    paperNote,
    errataOpen,
    errataBusy,
    errataErrors,
    errataPlan,
    errataNote,
    batchMode,
    selectedIds,
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
    filterType = $bindable(),
    onsetFilterSource,
    activeClusterIndex = $bindable(),
    mergeBusy,
    orphanDiag,
    filterOrphanKind,
    batchList,
    rollbackBusy,
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
    onapplyBatch,
    onpreviewBatch,
    ontoggleCluster,
    onmergeClusterToTarget,
    ondrillOrphanKind,
    ondownloadHealthCsv,
    onundoBatch,
    oncloseSection,
    oncloseKp,
    onclosePaper,
    oncloseErrata,
  }: Props = $props();

  let batchPrintFormat = $state<import("./services/printPaperService").PrintPaperFormat>("exam");

  let errataFileInput: HTMLInputElement | null = $state(null);
</script>

{#if sectionOpen}
  <div class="lv-card lv-pad-card" style="padding: var(--lv-space-3) var(--lv-space-4);max-height:260px;overflow:auto">
    <div class="lv-row" style="justify-content:space-between;align-items:center;margin:0 0 6px">
      <b style="font-size:var(--lv-font-size-body-compact)">{t("browse.sectionTree")}</b>
      {#if oncloseSection}
        <button type="button" class="lv-btn sm lv-btn--ghost lv-modal-close-btn" onclick={oncloseSection} title="收起" aria-label="关闭"><Icon name="close" size={12} /></button>
      {/if}
    </div>
    {#if sectionBusy}<span class="lv-muted" style="margin-left:8px">…</span>{/if}
    {#if !sectionTree.length && !sectionBusy}
      <div class="lv-muted" style="margin-top:6px">{t("browse.sectionEmpty")}</div>
    {/if}
    {#each sectionTree as doc, _di (_di)}
      <div class="lv-row" style="margin:6px 0 0">
        <button class="lv-btn sm lv-btn--ghost" class:acc-btn={sectionSel?.kind === "doc" && sectionSel.id === doc.id}
          title={`${doc.title || doc.hpath}（右键呼出原生菜单）`}
          onclick={() => { sectionSel = { kind: "doc", id: doc.id, hpath: doc.hpath }; }}
          oncontextmenu={async (e) => {
            e.preventDefault();
            if (!doc.id) return;
            let nbId = "";
            try {
              const rows = await app.deps.client.sql(`SELECT box FROM blocks WHERE id = '${doc.id.replace(/'/g, "''")}' LIMIT 1`);
              if (rows && rows[0]?.box) {
                nbId = String(rows[0].box);
              }
            } catch { /* ignore */ }
            if (nbId) {
              await showDocTreeNativeMenu({
                notebookId: nbId,
                docId: doc.id,
                position: { x: e.clientX, y: e.clientY },
              });
            }
          }}>
          <Icon name="file" size={13} /> {doc.title || doc.hpath}
        </button>
      </div>
      {#each doc.children as h, _hi (_hi)}
        <div class="lv-row" style="margin:2px 0 0;padding-left:{(h.level - 1) * 14}px">
          <button class="lv-btn sm lv-btn--ghost" class:acc-btn={sectionSel?.kind === "heading" && sectionSel.hpath === h.hpath}
            onclick={() => { sectionSel = { kind: "heading", id: h.id, hpath: h.hpath }; }}>
            {"#".repeat(Math.min(6, h.level))} {h.text}
          </button>
        </div>
      {/each}
    {/each}
  </div>
{/if}

{#if kpOpen}
  <div class="lv-card lv-pad-card" style="padding: var(--lv-space-3) var(--lv-space-4);max-height:320px;overflow:auto">
    <div class="lv-row" style="justify-content:space-between;align-items:center;margin:0 0 6px">
      <b style="font-size:var(--lv-font-size-body-compact)">{t("kp.title")}</b>
      {#if oncloseKp}
        <button type="button" class="lv-btn sm lv-btn--ghost lv-modal-close-btn" onclick={oncloseKp} title="收起" aria-label="关闭"><Icon name="close" size={12} /></button>
      {/if}
    </div>
    {#if !kpData}
      <div class="lv-muted" style="margin-top:6px">{t("browse.empty")}</div>
    {:else}
      <div class="lv-row" style="margin:6px 0 0">
        <span class="lv-chip num">{t("kp.distinct").replace("{n}", String(kpData.entries.length))}</span>
        {#if kpData.emptyCount}<span class="lv-chip lv-chip--amb num">{t("kp.empty").replace("{n}", String(kpData.emptyCount))}</span>{/if}
      </div>
      <div class="lv-row" style="margin:4px 0 0">
        {#each kpData.entries.slice(0, 24) as e, _i (_i)}
          <button class="lv-chip" class:lv-chip--red={e.suspect} class:acc={kpMergeFrom === e.kp}
            title={e.suspect ? t("kp.suspect") : t("kp.filterTip")}
            onclick={() => { kpMergeFrom = e.kp; kpMergeTo = ""; kpMergePlan = null; onsearchKp(e.kp); }}>
            {e.kp || "（空）"} · {e.count}
          </button>
        {/each}
        {#if kpData.entries.length > 24}<span class="lv-muted num">… +{kpData.entries.length - 24}</span>{/if}
      </div>
      <div class="lv-row" style="margin:8px 0 0">
        <b style="font-size:var(--lv-font-size-meta)">{t("kp.merge")}</b>
        <input class="lv-input" style="max-width:160px" bind:value={kpMergeFrom} placeholder={t("kp.fromPlaceholder")} aria-label={t("kp.fromPlaceholder")} />
        <span class="lv-muted" style="display:inline-flex;align-items:center"><Icon name="chev-right" size={13} /></span>
        <input class="lv-input" style="max-width:160px" bind:value={kpMergeTo} placeholder={t("kp.toPlaceholder")} aria-label={t("kp.toPlaceholder")} />
        <button class="lv-btn sm" onclick={onpreviewKpMerge}><Icon name="search" size={13} /> {t("batch.preview")}</button>
      </div>
      {#if kpData.emptyCount}
        <div class="lv-row" style="margin:4px 0 0">
          <b style="font-size:var(--lv-font-size-meta)">{t("kp.fill").replace("{n}", String(kpData.emptyCount))}</b>
          <input class="lv-input" style="max-width:160px" bind:value={kpFillKp} placeholder={t("kp.toPlaceholder")} aria-label={t("kp.toPlaceholder")} />
          <button class="lv-btn sm" onclick={onpreviewKpFill}><Icon name="search" size={13} /> {t("batch.preview")}</button>
        </div>
      {/if}
      {#if kpMergePlan}
        <div class="lv-row" style="margin:6px 0 0">
          <span class="lv-chip num">{t("batch.planCount").replace("{n}", String(kpMergePlan.changes.length))}</span>
          <button class="lv-btn lv-btn--primary sm" disabled={kpBusy || !app.kernelOnline || !kpMergePlan.changes.length} aria-busy={kpBusy} onclick={() => onapplyKpPlan(kpMergePlan)}>
            {kpBusy ? "…" : t("batch.apply").replace("{n}", String(kpMergePlan.changes.length))}
          </button>
          {#if !app.kernelOnline}<span class="lv-chip lv-chip--amb">{t("state.offlineHint")}</span>{/if}
        </div>
      {/if}
      {#if kpFillPlan}
        <div class="lv-row" style="margin:6px 0 0">
          <span class="lv-chip num">{t("batch.planCount").replace("{n}", String(kpFillPlan.changes.length))}</span>
          <button class="lv-btn lv-btn--primary sm" disabled={kpBusy || !app.kernelOnline || !kpFillPlan.changes.length} aria-busy={kpBusy} onclick={() => onapplyKpPlan(kpFillPlan)}>
            {kpBusy ? "…" : t("batch.apply").replace("{n}", String(kpFillPlan.changes.length))}
          </button>
        </div>
      {/if}
      {#if kpNote}<div class="lv-row"><span class="lv-muted num">{kpNote}</span></div>{/if}
      <div class="lv-row" style="margin:10px 0 0">
        <b style="font-size:var(--lv-font-size-meta)"><Icon name="file-text" size={13} /> {t("syl.title")}</b>
        {#if app.syllabusReadonly}<span class="lv-chip lv-chip--amb">{t("materials.readonly")}</span>{/if}
        {#if sylDoc.roots.length}
          <span class="lv-chip num">{t("syl.nodes").replace("{n}", String(countSyllabusNodes(sylDoc.roots)))}</span>
          {#if sylDoc.meta.publisher}<span class="lv-chip">{sylDoc.meta.publisher}</span>{/if}
          {#if sylDoc.meta.year}<span class="lv-chip num">{sylDoc.meta.year}</span>{/if}
          <span class="lv-muted num">{t("syl.importedAt").replace("{d}", new Date(sylDoc.importedAt).toLocaleDateString())}</span>
        {/if}
        {#if app.kpRelationsDoc?.().relations?.length}
          <span class="lv-chip num" title="考点先修图谱边数">先修依赖: {app.kpRelationsDoc().relations.length} 边</span>
        {/if}
      </div>
      {#if !sylDoc.roots.length}
        <div class="lv-row" style="margin:6px 0;gap:var(--lv-space-2)">
          <button
            class="lv-btn sm lv-btn--ghost"
            onclick={onapplyTaxonomyPreset}
            disabled={app.syllabusReadonly || app.kpRelationsReadonly}
            title="一键载入国家新课标中小学/高中全景数学知识图谱大纲与先修依赖拓扑"
          >
            <Icon name="git-branch" size={13} /> 载入新课标图谱大纲预设
          </button>
        </div>
      {/if}
      {#if sylDoc.roots.length}
        {@const cov = coverageTree(sylDoc.roots, sylKpStats)}
        <div class="lv-row" style="flex-wrap:wrap;margin:4px 0 0;gap:var(--lv-space-1)">
          {#each cov as c, _ci (_ci)}
            {@const total = subtreeCount(c)}
            {@const learned = subtreeLearned(c)}
            <button class="lv-chip" class:lv-chip--red={total === 0} class:lv-chip--amb={total > 0 && learned === 0}
              title={`${t("syl.gapTip")}${subtreeNoSource(c) ? " · " + t("syl.noSourceTip").replace("{n}", String(subtreeNoSource(c))) : ""}`}
              onclick={() => onsearchKp(c.node.kpPrefix)}>
              {c.node.title} · <span class="num">{total}</span>
              {#if total === 0}&nbsp;{t("syl.gap")}
              {:else if learned === 0}&nbsp;{t("syl.unmastered")}
              {:else}&nbsp;<span class="num" title={t("syl.learnedTip")} style="display:inline-flex;align-items:center;gap:2px"><Icon name="check" size={10} />{learned}</span>{/if}
            </button>
          {/each}
          <button class="lv-btn sm lv-btn--ghost" onclick={ondownloadSyllabusGaps}><Icon name="export" size={13} /> {t("syl.exportGaps")}</button>
          <button class="lv-btn sm lv-btn--ghost" onclick={onexportSyllabusAudit} title="深度体检考纲零题覆盖盲区与题量不足考点"><Icon name="chart" size={13} /> {t("syl.auditCoverage")}</button>
        </div>
      {/if}
      {#if !sylDoc.roots.length || sylPreviewRoots}
        <div class="lv-row" style="margin:4px 0 0">
          <input class="lv-input" style="max-width:150px" placeholder={t("syl.publisher")} aria-label={t("syl.publisher")} bind:value={sylPublisher} />
          <input class="lv-input" style="max-width:90px" placeholder={t("syl.year")} aria-label={t("syl.year")} bind:value={sylYear} />
          <input class="lv-input" style="max-width:150px" placeholder={t("syl.source")} aria-label={t("syl.source")} bind:value={sylSource} />
        </div>
        <textarea class="lv-input lv-textarea" rows="4" style="min-height:96px;max-height:280px;resize:vertical" bind:value={sylText} placeholder={t("syl.placeholder")} aria-label={t("syl.placeholder")}></textarea>
        <div class="lv-row">
          <button class="lv-btn sm" onclick={onpreviewSyllabus} disabled={!sylText.trim()}><Icon name="search" size={13} /> {t("syl.preview")}</button>
          {#if sylPreviewRoots?.length}
            <span class="lv-chip num">{t("syl.nodes").replace("{n}", String(countSyllabusNodes(sylPreviewRoots)))}</span>
            <button class="lv-btn lv-btn--primary sm" onclick={onimportSyllabus} disabled={app.syllabusReadonly}>{t("syl.import")}</button>
          {/if}
        </div>
      {/if}
      {#if sylError}<div class="lv-error" role="alert">{sylError}</div>{/if}
      {#if sylNote}<div class="lv-row"><span class="lv-muted num">{sylNote}</span></div>{/if}
    {/if}
  </div>
{/if}

{#if paperOpen}
  <div class="lv-card lv-pad-card" style="padding: var(--lv-space-3) var(--lv-space-4)">
    <div class="lv-row" style="justify-content:space-between;align-items:center;margin:0 0 6px">
      <div class="lv-row" style="margin:0;gap:6px;align-items:center">
        <b style="font-size:var(--lv-font-size-body-compact)"><Icon name="paperclip" size={13} /> {t("paper.title")}</b>
        <span class="lv-muted" style="font-size:var(--lv-font-size-caption)">{t("paper.hint")}</span>
      </div>
      {#if onclosePaper}
        <button type="button" class="lv-btn sm lv-btn--ghost lv-modal-close-btn" onclick={onclosePaper} title="收起" aria-label="关闭"><Icon name="close" size={12} /></button>
      {/if}
    </div>
    <textarea class="lv-input lv-textarea" rows="4" style="min-height:96px;max-height:280px;resize:vertical" bind:value={paperText} placeholder={t("paper.placeholder")} aria-label={t("paper.title")}></textarea>
    {#if paperPreview}
      <div class="lv-row" style="margin:4px 0 0;flex-wrap:wrap">
        <span class="lv-chip lv-chip--grn num" style="display:inline-flex;align-items:center;gap:3px"><Icon name="check" size={11} /> {paperPreview.items.filter((i: any) => i.verdict === "correct").length}</span>
        <span class="lv-chip lv-chip--red num" style="display:inline-flex;align-items:center;gap:3px"><Icon name="close" size={11} /> {paperPreview.items.filter((i: any) => i.verdict === "wrong").length}</span>
        {#if paperPreview.items.some((i: any) => i.verdict === "not_attempted")}
          <span class="lv-chip lv-chip--amb num" title={t("paper.shortNote")} style="display:inline-flex;align-items:center;gap:3px">
            <Icon name="help" size={11} />
            <span>{paperPreview.items.filter((i: any) => i.verdict === "not_attempted").length}</span>
          </span>
        {/if}
        {#if paperPreview.outOfRange.length}
          <span class="lv-chip lv-chip--amb num" title={paperPreview.outOfRange.join("、")}>{t("paper.outOfRange").replace("{n}", String(paperPreview.outOfRange.length))}</span>
        {/if}
        {#each paperPreview.errors.slice(0, 3) as pe, _pi (_pi)}
          <div class="lv-error-row num">#{pe.row} {pe.reason}</div>
        {/each}
        <button class="lv-btn lv-btn--primary sm" disabled={paperBusy} aria-busy={paperBusy} onclick={onapplyPaperRecall}>
          {paperBusy ? "…" : t("paper.apply").replace("{n}", String(paperPreview.items.filter((i: any) => i.verdict !== "not_attempted").length))}
        </button>
      </div>
    {/if}
    {#if paperNote}<div class="lv-row"><span class="lv-chip num">{paperNote}</span></div>{/if}
  </div>
{/if}

{#if errataOpen}
  <div class="lv-card lv-pad-card" style="padding: var(--lv-space-3) var(--lv-space-4);max-height:320px;overflow:auto">
    <div class="lv-row" style="justify-content:space-between;align-items:center;margin:0 0 6px">
      <div class="lv-row" style="margin:0;gap:6px;align-items:center">
        <b style="font-size:var(--lv-font-size-body-compact)"><Icon name="file-text" size={13} /> {t("errata.title")}</b>
        <span class="lv-muted" style="font-size:var(--lv-font-size-caption)">{t("errata.hint")}</span>
      </div>
      {#if oncloseErrata}
        <button type="button" class="lv-btn sm lv-btn--ghost lv-modal-close-btn" onclick={oncloseErrata} title="收起" aria-label="关闭"><Icon name="close" size={12} /></button>
      {/if}
    </div>
    <div class="lv-row" style="margin:6px 0 0">
      <button class="lv-btn sm lv-btn--ghost" onclick={onexportErrataTemplate}><Icon name="export" size={13} /> {t("errata.template")}</button>
      <button type="button" class="lv-btn sm" disabled={errataBusy} onclick={() => errataFileInput?.click()}>
        <Icon name="import" size={13} /> {t("errata.import")}
      </button>
      <input bind:this={errataFileInput} type="file" accept=".csv,.tsv,.txt" hidden onchange={onerrataFile} disabled={errataBusy} />
    </div>
    {#if errataErrors.length}
      {#each errataErrors.slice(0, 5) as er, _ei (_ei)}
        <div class="lv-error-row num">#{er.row} {er.reason}</div>
      {/each}
      {#if errataErrors.length > 5}<div class="lv-muted num">… +{errataErrors.length - 5}</div>{/if}
    {/if}
    {#if errataPlan}
      <div class="lv-row" style="margin:6px 0 0;flex-wrap:wrap">
        <span class="lv-chip num">{t("batch.planCount").replace("{n}", String(errataPlan.changes.length))}</span>
        {#if errataPlan.unchanged}<span class="lv-chip num">{t("errata.unchanged").replace("{n}", String(errataPlan.unchanged))}</span>{/if}
        {#if errataPlan.unknownQids.length}
          <span class="lv-chip lv-chip--amb num" title={errataPlan.unknownQids.join("、")}>{t("errata.unknown").replace("{n}", String(errataPlan.unknownQids.length))}</span>
        {/if}
        <button class="lv-btn lv-btn--primary sm" disabled={errataBusy || !app.kernelOnline || !errataPlan.changes.length} aria-busy={errataBusy} onclick={onapplyErrata}>
          {errataBusy ? "…" : t("batch.apply").replace("{n}", String(errataPlan.changes.length))}
        </button>
        {#if !app.kernelOnline}<span class="lv-chip lv-chip--amb">{t("state.offlineHint")}</span>{/if}
      </div>
      {#each errataPlan.changes.slice(0, 8) as c, _ci (_ci)}
        <div class="lv-row lv-muted num" style="margin:2px 0;font-size:var(--lv-font-size-label);align-items:center;gap:4px">
          <span>{t("batch.field." + c.field)}：{c.from || "（空）"}</span>
          <Icon name="chev-right" size={10} />
          <span>{c.to || "（空）"}</span>
        </div>
      {/each}
      {#if errataPlan.changes.length > 8}<div class="lv-muted num">… +{errataPlan.changes.length - 8}</div>{/if}
    {/if}
    {#if errataNote}<div class="lv-row"><span class="lv-chip num">{errataNote}</span></div>{/if}
  </div>
{/if}

{#if batchMode}
  <div class="lv-card lv-pad-card" style="padding: var(--lv-space-3) var(--lv-space-4)">
    <div class="lv-row" style="margin:0;gap:var(--lv-space-compact);align-items:center;flex-wrap:wrap">
      <b style="font-size:var(--lv-font-size-body-compact)">{t("batch.title")}</b>
      <span class="lv-chip num">{t("batch.selected").replace("{n}", String(Object.keys(selectedIds).length))}</span>
      <button class="lv-btn sm lv-btn--ghost" onclick={onselectAllCurrentPage}>{t("batch.selectAll")}</button>
      {#if selectedCount > 0}
        <button class="lv-btn sm lv-btn--ghost" onclick={onclearSelection}>{t("batch.clearSel")}</button>
        <button class="lv-btn sm lv-btn--ghost" onclick={onbatchConvertToCards} disabled={batchCardBusy || !app?.kernelOnline} title="将勾选的题目批量制成闪卡送入卡包">
          <Icon name="layers" size={13} /> {batchCardBusy ? "…" : t("batch.toCards")}
        </button>
        <select class="lv-select sm" bind:value={batchPrintFormat} aria-label="选择打印试卷版式">
          <option value="exam">标准测试卷</option>
          <option value="answer">独立答案册</option>
          <option value="lecture">授课讲义卷</option>
          <option value="homework">留白作业单</option>
          <option value="interactive">🌐 交互式讲题自测卷</option>
        </select>
        <button class="lv-btn sm lv-btn--ghost" onclick={() => onprintSelectedQuestions(batchPrintFormat)} title="按所选版式将勾选题目生成 A4 双栏卷">
          <Icon name="file" size={13} /> {t("batch.printSelected")}
        </button>
      {/if}
      {#if batchUndoHere && !appliedChanges.length}
        <span class="lv-chip num" title={t("batch.undoStoredHint")} style="display:inline-flex;align-items:center;gap:4px"><Icon name="undo" size={12} /> {t("batch.undoStored").replace("{n}", String(batchUndo!.changes.length))}</span>
        <button class="lv-btn sm" disabled={batchBusy || !app.kernelOnline} onclick={() => onapplyBatch(true)} style="display:inline-flex;align-items:center;gap:4px"><Icon name="undo" size={12} /> {t("batch.undo")}</button>
      {/if}
      <select class="lv-select" bind:value={batchField} aria-label="批量修改字段">
        <option value="kp">{t("batch.field.kp")}</option>
        <option value="difficulty">{t("batch.field.difficulty")}</option>
        <option value="source">{t("batch.field.source")}</option>
        <option value="year">{t("batch.field.year")}</option>
        <option value="score">{t("batch.field.score")}</option>
      </select>
      {#if batchField === "difficulty"}
        <select class="lv-select" bind:value={batchValue} aria-label="难度等级">
          {#each [1, 2, 3, 4, 5] as d, _i (_i)}<option value={String(d)}>{d}</option>{/each}
        </select>
      {:else if batchField === "score"}
        <input class="lv-input" style="max-width:120px" type="number" inputMode="numeric" min="0.5" step="0.5" bind:value={batchValue} placeholder={t("batch.scorePlaceholder")} aria-label={t("batch.scorePlaceholder")} />
      {:else}
        <input class="lv-input" style="max-width:200px" bind:value={batchValue}
          placeholder={batchField === "kp" ? t("batch.kpPlaceholder") : batchField === "year" ? t("batch.yearPlaceholder") : t("batch.sourcePlaceholder")} aria-label="修改为目标值" />
      {/if}
      <button class="lv-btn sm" disabled={!selectedCount} onclick={onpreviewBatch}><Icon name="search" size={13} /> {t("batch.preview")}</button>
      {#if batchPreview}
        <button class="lv-btn lv-btn--primary sm" disabled={batchBusy || !batchPreview.changes.length} aria-busy={batchBusy} onclick={() => onapplyBatch(false)}>
          {batchBusy ? "…" : t("batch.apply").replace("{n}", String(batchPreview.changes.length))}
        </button>
        {#if appliedChanges.length || batchUndoHere}
          <button class="lv-btn sm" disabled={batchBusy} onclick={() => onapplyBatch(true)} style="display:inline-flex;align-items:center;gap:4px"><Icon name="undo" size={12} /> {t("batch.undo")}</button>
        {/if}
      {/if}
    </div>
    {#if batchPreview}
      <div class="lv-row" style="margin:8px 0 0">
        <span class="lv-chip num">{t("batch.planCount").replace("{n}", String(batchPreview.changes.length))}</span>
        {#if batchPreview.skipped}<span class="lv-chip num">{t("batch.skipped").replace("{n}", String(batchPreview.skipped))}</span>{/if}
        {#if !app.kernelOnline}<span class="lv-chip lv-chip--amb">{t("state.offlineHint")}</span>{/if}
      </div>
      {#each batchPreview.changes.slice(0, 20) as c, _i (_i)}
        {@const stem = questionMap.get(c.qid)?.stem ?? c.qid}
        <div class="lv-error-row num">{describeChange(c, stem)}</div>
      {/each}
      {#if batchPreview.changes.length > 20}<div class="lv-muted num">… +{batchPreview.changes.length - 20}</div>{/if}
      {#if batchNote}<div class="lv-row"><span class="lv-muted num">{batchNote}</span></div>{/if}
    {/if}
  </div>
{/if}

{#if health}
  <div class="lv-card lv-pad-card" style="padding: var(--lv-space-3) var(--lv-space-4)">
    <b style="font-size:var(--lv-font-size-body-compact)">{t("health.title")}</b>
    <span class="lv-chip num" style="margin-left:8px">{t("health.total")} {health.total}</span>
    {#if answerDist && answerDist.total >= 10}
      <div class="lv-row" style="margin:6px 0 0;flex-wrap:wrap;gap:var(--lv-space-1)">
        <span class="lv-chip num" title={t("health.distTip")}><Icon name="chart" size={11} /> {t("health.dist")}（{answerDist.total}）</span>
        {#each Object.entries(answerDist.counts).sort() as [letter, n] (letter)}
          <span class="lv-chip num" class:lv-chip--red={answerDist.skewed === letter}>{letter} {n}</span>
        {/each}
        {#if answerDist.skewed}
          <span class="lv-chip lv-chip--red" title={t("health.distSkewTip")}><Icon name="alert-triangle" size={11} /> {t("health.distSkew").replace("{l}", answerDist.skewed).replace("{n}", String(answerDist.skewedRatio ?? 0))}</span>
        {/if}
        {#if answerDist.starved.length}
          <span class="lv-chip lv-chip--amb" title={t("health.distStarvedTip")}>{t("health.distStarved").replace("{l}", answerDist.starved.join(""))}</span>
        {/if}
      </div>
    {/if}
    {#if unreviewed && unreviewed.count}
      <div class="lv-row" style="margin:4px 0 0">
        <span class="lv-chip lv-chip--amb num" title={t("health.unreviewedTip")}><Icon name="sparkles" size={12} /> {t("health.unreviewed").replace("{n}", String(unreviewed.count)).replace("{r}", String(unreviewed.ratio ?? 0))}</span>
      </div>
    {/if}
    {#if coverage}
      <div class="lv-row" style="margin:6px 0 0">
        {#each coverage.byType as t2, _ti (_ti)}
          <button class="lv-chip num" class:acc={filterType === t2.type} title={t("coverage.typeTip")}
            onclick={() => { filterType = filterType === t2.type ? "" : t2.type; }}>{t("qtype." + t2.type)} {t2.count}</button>
        {/each}
        {#if coverage.kpLearned != null}
          <span class="lv-chip num" title={t("coverage.learnedTip")}><Icon name="book" size={11} /> {t("coverage.learned").replace("{l}", String(coverage.kpLearned)).replace("{t}", String(coverage.kpCovered))}</span>
        {/if}
        <span class="lv-chip num">{t("coverage.sources").replace("{n}", String(coverage.sources))}</span>
        {#if coverage.sourceMissing}<button class="lv-chip lv-chip--amb num" onclick={() => onsetFilterSource("@@none")} title={t("coverage.sourceMissTip")}>{t("coverage.sourceMissing").replace("{n}", String(coverage.sourceMissing))}</button>{/if}
        {#if coverage.kpMissing}<button class="lv-chip lv-chip--amb num" onclick={() => { kpOpen = true; }}>{t("kp.empty").replace("{n}", String(coverage.kpMissing))}</button>{/if}
        {#if coverage.shortAnalysis}<span class="lv-chip lv-chip--amb num" title={t("coverage.shortTip")}>{t("coverage.shortAnalysis").replace("{n}", String(coverage.shortAnalysis))}</span>{/if}
      </div>
    {/if}
    {#if !health.clusters.length && !health.missing.length}
      <span class="lv-chip lv-chip--grn" style="display:inline-flex;align-items:center;gap:4px"><Icon name="check" size={11} /> {t("health.clean")}</span>
    {:else}
      {#each health.clusters as cl, _i (_i)}
        <button
          type="button"
          class="lv-chip num"
          class:acc={activeClusterIndex === _i}
          class:lv-chip--red={cl.similarity === 1}
          title={t("health.clusterTip")}
          style="display:inline-flex;align-items:center;gap:4px"
          onclick={() => ontoggleCluster(_i)}
        >
          <Icon name="copy" size={11} /> {cl.ids.length}× {Math.round(cl.similarity * 100)}%
        </button>
      {/each}
      {#each health.missing as row, _i (_i)}
        <span class="lv-chip lv-chip--amb num" title={row.qids.slice(0, 10).join(" · ")}>{t("health.field." + row.field)} {row.count}</span>
      {/each}
    {/if}
    {#if activeClusterIndex >= 0 && health.clusters[activeClusterIndex]}
      {@const cl = health.clusters[activeClusterIndex]}
      <div class="lv-card lv-pad-card" style="margin:8px 0;background:var(--lv-surface-2);border:1px solid var(--lv-border-subtle);border-left:3.5px solid var(--lv-accent);border-radius:var(--lv-r-3, 16px);padding:12px 16px;box-shadow:var(--lv-sh-1)">
        <div class="lv-row" style="justify-content:space-between;align-items:center;margin-bottom:8px">
          <b><Icon name="copy" size={13} /> {t("health.mergerTitle")}（{cl.ids.length} 题重复 · 相似度 {Math.round(cl.similarity * 100)}%）</b>
          <button type="button" class="lv-btn sm lv-btn--ghost" onclick={() => activeClusterIndex = -1} aria-label="关闭"><Icon name="close" size={12} /></button>
        </div>
        <div class="stack-sm">
          {#each cl.ids as qid (qid)}
            {@const q = questionMap.get(qid)}
            {#if q}
              {@const attCount = app?.derived().byQuestion.get(qid)?.attempts ?? 0}
              <div class="lv-card" style="padding:10px 14px;background:var(--lv-surface);border-radius:var(--lv-r-2, 12px);border:1px solid var(--lv-border-subtle)">
                <div class="lv-row" style="justify-content:space-between;align-items:center;flex-wrap:wrap;gap:4px">
                  <div class="lv-row" style="margin:0;gap:6px">
                    <span class="lv-chip num sm">{q.id}</span>
                    <span class="lv-chip sm">{t("qtype." + q.type)}</span>
                    {#if q.kp}<span class="lv-chip sm">{q.kp}</span>{/if}
                    {#if q.source}<span class="lv-muted" style="font-size:11px">{q.source}</span>{/if}
                    <span class="num lv-muted" style="font-size:11px">作答 {attCount} 次</span>
                  </div>
                  <button
                    type="button"
                    class="lv-btn sm lv-btn--primary"
                    disabled={mergeBusy}
                    onclick={() => { if (q && q.blockId) onmergeClusterToTarget(q as Question & { blockId: string }, cl.ids); }}
                  >
                    {mergeBusy ? "…" : t("health.mergeIntoThis")}
                  </button>
                </div>
                <div style="font-size:var(--lv-font-size-sm);margin:6px 0;font-weight:600">{q.stem}</div>
                <div class="lv-muted num" style="font-size:var(--lv-font-size-caption)">
                  答案: <b>{q.answer}</b>{#if q.analysis} · 解析: {q.analysis.slice(0, 80)}{/if}
                </div>
              </div>
            {/if}
          {/each}
        </div>
      </div>
    {/if}
    {#if orphanDiag}
      <div class="lv-row" style="margin:8px 0 0;flex-wrap:wrap;gap:var(--lv-space-1);align-items:center">
        <span class="lv-chip num" title={t("health.orphans")}>
          <Icon name="alert-triangle" size={11} /> {t("health.orphans")}（{orphanDiag.total}）
        </span>
        {#if orphanDiag.total === 0}
          <span class="lv-chip lv-chip--grn" style="display:inline-flex;align-items:center;gap:4px"><Icon name="check" size={11} /> {t("health.orphansClean")}</span>
        {:else}
          {#each (["orphan_group_sub", "orphan_group_material", "broken_material_ref", "defect_no_answer", "defect_no_options"] as const) as kind (kind)}
            {@const count = orphanDiag.byKind[kind].length}
            {#if count > 0}
              <button
                type="button"
                class="lv-chip lv-chip--red num"
                class:acc={filterOrphanKind === kind}
                onclick={() => ondrillOrphanKind(kind)}
                title="点击过滤此缺陷队列"
              >
                {t("health.orphan." + kind)} {count}
              </button>
            {/if}
          {/each}
        {/if}
        <button class="lv-btn sm lv-btn--ghost" onclick={ondownloadHealthCsv} title={t("health.exportCsv")} style="display:inline-flex;align-items:center;gap:4px">
          <Icon name="export" size={12} />
          <span>CSV</span>
        </button>
      </div>
    {/if}
    {#if batchList.length}
      <div class="lv-row" style="margin:10px 0 0">
        <b style="font-size:var(--lv-font-size-meta)">{t("import.batches")}</b>
        {#each batchList as b, _i (_i)}
          <span class="lv-chip num" title={b.batch}><Icon name="folder" size={11} /> {b.batch.slice(0, 16)} · {b.count}</span>
          <button class="lv-btn sm lv-btn--ghost" disabled={rollbackBusy === b.batch} onclick={() => onundoBatch(b.batch)}>
            {rollbackBusy === b.batch ? "…" : t("import.rollback")}
          </button>
        {/each}
      </div>
    {/if}
  </div>
{/if}
