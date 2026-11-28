<script lang="ts">
  import Icon from "../shared/Icon.svelte";
  import AiThinkingCard from "../shared/AiThinkingCard.svelte";
  import type { Question } from "../../core/types";
  import type { BankInfo } from "../../app";
  import type { GleanClip } from "@/core/gleanBridge";
  import { PROMPT_PRESETS, AI_CHUNK_MAX_CHARS, sliceText } from "@/ai/gen";
  import type { MaterialExtractMeta } from "./services/materialManagementService";
  import { classifyReviewQueue, batchConfirmNonWarning, type ReviewQueueState } from "@/core/reviewQueue";
  import StudioSubNav from "./StudioSubNav.svelte";

  const AI_GEN_TYPES: Question["type"][] = ["single", "multiple", "judge", "fill", "short"];
  const AI_PRESET_KEYS = Object.keys(PROMPT_PRESETS) as Array<keyof typeof PROMPT_PRESETS>;

  interface Props {
    hasBank: boolean;
    activeBankId: string;
    banks: BankInfo[];
    aiCustomEndpointSet: boolean;
    aiKeyConfigured?: boolean;
    onopenSettings?: () => void;
    aiError: string;
    aiSource: string;
    aiSourceOrigin: string;
    gleanAvailable: boolean;
    gleanBusy: boolean;
    gleanError: string;
    gleanErrorAction: "load" | "mark";
    gleanPendingDone: GleanClip[];
    gleanDoneBusy: boolean;
    gleanDoneNote: string;
    aiTypes?: Question["type"][];
    aiCount: number;
    aiDifficulty: "easy" | "medium" | "hard" | "mixed";
    aiPreset: string;
    aiQuality: "standard" | "economy";
    aiKp: string;
    aiQuote?: string;
    aiCustomHint: string;
    aiBusy: boolean;
    aiRegenBusy: string;
    aiMutationBusy: boolean;
    aiUsageTotal: { totalTokens: number; totalCalls: number } | null;
    aiQueue: Question[];
    aiRejected: Array<{ index: number; reason: string; raw?: string }>;
    aiDuplicates: number;
    aiCost: string;
    aiQueueBankId: string;
    aiSaved: number;
    editingAiId: string;
    aiEditDraft: any;
    aiEditError: string;
    aiTaskLog: any[];
    aiSegmentMeta?: MaterialExtractMeta | null;
    aiSegmentBusy?: boolean;
    aiRemainingChunksCount?: number;
    aiDestinationLabel?: string;
    t: (k: string, fb?: string) => string;
    onback: () => void;
    onchangeView: (view: "manual" | "siyuan" | "materials" | "import" | "ai") => void;
    onfromDoc: () => void;
    onimportGlean: () => void;
    onmarkGleanDone: () => void;
    ongenerate: () => void;
    onsegmentedGenerate?: () => void;
    oncontinueNextChunk?: () => void;
    onnextPdfSegment?: () => void;
    oncancel: () => void;
    onretryRejected: () => void;
    onapproveAll: (subset?: Question[]) => void;
    onclearQueue: () => void;
    onstartEdit: (q: Question) => void;
    onsaveEdit: (q: Question) => void;
    oncancelEdit: () => void;
    onapproveOne: (q: Question) => void;
    onregenOne: (q: Question) => void;
    ondropOne: (q: Question) => void;
  }

  let {
    hasBank,
    activeBankId,
    banks,
    aiCustomEndpointSet,
    aiKeyConfigured = false,
    onopenSettings,
    aiError,
    aiSource = $bindable(),
    aiSourceOrigin = $bindable(),
    gleanAvailable,
    gleanBusy,
    gleanError,
    gleanErrorAction,
    gleanPendingDone,
    gleanDoneBusy,
    gleanDoneNote,
    aiTypes = $bindable(["single", "multiple", "judge", "fill", "short"]),
    aiCount = $bindable(),
    aiDifficulty = $bindable(),
    aiPreset = $bindable(),
    aiQuality = $bindable(),
    aiKp = $bindable(),
    aiQuote = $bindable(""),
    aiCustomHint = $bindable(),
    aiBusy,
    aiRegenBusy,
    aiMutationBusy,
    aiUsageTotal,
    aiQueue = $bindable(),
    aiRejected,
    aiDuplicates,
    aiCost,
    aiQueueBankId,
    aiSaved,
    editingAiId,
    aiEditDraft,
    aiEditError,
    aiTaskLog,
    aiSegmentMeta = null,
    aiSegmentBusy = false,
    aiRemainingChunksCount = 0,
    aiDestinationLabel = "",
    t,
    onback,
    onchangeView,
    onfromDoc,
    onimportGlean,
    onmarkGleanDone,
    ongenerate,
    onsegmentedGenerate,
    oncontinueNextChunk,
    onnextPdfSegment,
    oncancel,
    onretryRejected,
    onapproveAll,
    onclearQueue,
    onstartEdit,
    onsaveEdit,
    oncancelEdit,
    onapproveOne,
    onregenOne,
    ondropOne,
  }: Props = $props();

  const aiPreviewChunks = $derived(aiSource.trim() ? sliceText(aiSource, AI_CHUNK_MAX_CHARS) : []);
  let aiReviewFilter = $state<"all" | ReviewQueueState>("all");
  let confirmedAiIds = $state<string[]>([]);

  const aiQueueSummary = $derived(classifyReviewQueue(aiQueue, { confirmedIds: confirmedAiIds }));
  const visibleAiItems = $derived(aiQueueSummary.filterBy(aiReviewFilter));

  $effect(() => {
    const validIds = new Set(aiQueue.map((q) => q.id));
    if (confirmedAiIds.some((id) => !validIds.has(id))) {
      confirmedAiIds = confirmedAiIds.filter((id) => validIds.has(id));
    }
    if (
      (aiReviewFilter === "confirmed" && aiQueueSummary.counts.confirmed === 0) ||
      (aiReviewFilter === "pending" && aiQueueSummary.counts.pending === 0) ||
      (aiReviewFilter === "warning" && aiQueueSummary.counts.warning === 0)
    ) {
      aiReviewFilter = "all";
    }
  });

  function toggleAiConfirmed(qId: string) {
    if (confirmedAiIds.includes(qId)) {
      confirmedAiIds = confirmedAiIds.filter((id) => id !== qId);
    } else {
      confirmedAiIds = [...confirmedAiIds, qId];
    }
  }

  function confirmAllCleanAi() {
    const res = batchConfirmNonWarning(aiQueue, confirmedAiIds);
    confirmedAiIds = res.nextConfirmedIds;
  }
</script>

<div class="lv-pad">
  <div class="lv-screen-head">
    <span class="lv-eyebrow">{t("head.ai.eyebrow")}</span>
    <h1 class="lv-h1">{t("head.ai.title")}</h1>
    <p>{t("head.ai.desc")}</p>
  </div>
  <StudioSubNav currentView="ai" {t} {onchangeView} />
  {#if !aiKeyConfigured}
    <div class="lv-card" role="status" style="margin:8px 0 10px;padding:10px 14px;background:var(--lv-amber-soft);border:1px solid color-mix(in srgb, var(--lv-amber) 32%, transparent);border-radius:var(--lv-r-2);display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap">
      <div style="font-size:12.5px;line-height:1.55;color:var(--lv-text);min-width:0;flex:1 1 260px">
        <strong style="color:var(--lv-amber-deep, var(--lv-amber));display:block;margin-bottom:2px">前置条件提示：尚未配置模型 API 密钥</strong>
        <span class="lv-muted" style="font-size:12px">AI 智能出题依赖外部大模型接口与联网。若您已在「思源设置 → AI 服务」配置可用模型可直接生成；否则请先前往插件设置填写兼容接口地址、模型与 API 密钥。</span>
      </div>
      {#if onopenSettings}
        <button type="button" class="lv-btn sm lv-btn--primary" onclick={onopenSettings}>
          <Icon name="settings" size={13} /> 打开插件设置
        </button>
      {/if}
    </div>
  {/if}
  <!-- AI 出题使用说明向导卡片 -->
  <div class="lv-card lv-studio-intro-card" style="margin:8px 0 10px;padding:12px 14px;background:color-mix(in srgb, var(--lv-accent-soft) 25%, var(--lv-surface));border-left:3.5px solid var(--lv-accent);border-radius:var(--lv-r-2);font-size:12px;line-height:1.6">
    <b style="color:var(--lv-text);display:block;margin-bottom:2px">💡 AI 智能出题使用说明：</b>
    1. <b>出题材料</b>：在左侧粘贴课文段落、读书笔记或知识点（亦可从思源笔记或考纲资料库一键带入）；<br />
    2. <b>生成配置</b>：可自选题量、难度倾向与重点提示词，点击「开始生成」；<br />
    3. <b>审核入库</b>：AI 生成的试题会在右侧清晰陈列，支持逐题微调或一键全量存入当前题库！
  </div>
  {#if aiError}<div class="lv-error" role="alert">{aiError}</div>{/if}
  <div class="lv-row">
    <button class="lv-btn lv-btn--ghost lv-mobile-back" onclick={onback} style="display:inline-flex;align-items:center;gap:4px"><Icon name="chev-left" size={13} /> {t("mode.practice")}</button>
    <span class="lv-chip"><Icon name="sparkles" size={12} /> {t("ai.title")}</span>
    <span class="fn__flex-1"></span>
    {#if aiDestinationLabel}
      <span class="lv-chip {aiCustomEndpointSet ? 'lv-chip--amb' : 'lv-chip--grn'}" title={t("ai.endpointTitle")}>{aiDestinationLabel}</span>
    {:else if aiCustomEndpointSet}
      <span class="lv-chip lv-chip--amb" title={t("ai.endpointTitle") + " · " + t("setting.aiEndpoint.desc")}>{t("ai.channel.openai")}</span>
    {:else}
      <span class="lv-chip lv-chip--grn" title={t("ai.endpointTitle")}>{t("ai.channel.siyuan")}</span>
    {/if}
  </div>
  <p class="lv-muted">{t("report.aiSetupHint", "AI 需要先配置：可使用思源设置中的可用模型，或在本插件设置中填写兼容端点、模型与密钥。统计和手动练习无需 AI。")}</p>
  <div class="lv-studio-grid lv-studio-grid--ai">
    <div class="lv-card lv-pad-card lv-ai-source-card">
      <div class="lv-section-head">
        <div><span class="lv-eyebrow">材料</span><h2>{t("ai.source")}</h2></div>
        <span class="lv-chip num">{aiSource.length} 字 · {aiPreviewChunks.length} 段（≤{AI_CHUNK_MAX_CHARS}字/段）</span>
      </div>
      <div class="lv-field">
        <span class="lv-muted">{t("ai.source")}</span>
        <button class="lv-chip" title={t("ai.fromDocTitle")} onclick={onfromDoc}><Icon name="file-text" size={13} /> {t("ai.fromDoc")}</button>
        {#if aiSourceOrigin}<div class="lv-muted" style="font-size:var(--lv-font-size-caption);margin:4px 0" aria-live="polite">{aiSourceOrigin}</div>{/if}
        {#if aiSegmentMeta && (aiSegmentMeta.truncated || aiSegmentMeta.hasMorePages || aiSegmentMeta.totalPages)}
          <div class="lv-card" role="status" style="margin:6px 0;padding:8px 12px;background:var(--lv-amber-soft);border:1px solid color-mix(in srgb, var(--lv-amber) 32%, transparent);border-radius:var(--lv-r-1);font-size:12px;display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap">
            <span>
              {#if aiSegmentMeta.totalPages && aiSegmentMeta.pageStart !== undefined && aiSegmentMeta.pageEnd !== undefined}
                已截取第 <b>{aiSegmentMeta.pageStart}–{aiSegmentMeta.pageEnd}</b> 页（共 {aiSegmentMeta.totalPages} 页）· 实际送检 <b>{aiSource.length}</b> 字（按自然段落/题号边界分 {aiPreviewChunks.length} 段）
              {:else}
                实际送检 <b>{aiSource.length}</b> 字（原文档 {aiSegmentMeta.totalChars} 字，已按自然段落边界截取，分 {aiPreviewChunks.length} 段）
              {/if}
            </span>
            {#if aiSegmentMeta.hasMorePages && onnextPdfSegment}
              <button type="button" class="lv-btn sm lv-btn--primary" disabled={aiSegmentBusy || aiMutationBusy} onclick={onnextPdfSegment}>
                {aiSegmentBusy ? "加载中…" : `续拆下一段（第 ${aiSegmentMeta.nextStartPage ?? ((aiSegmentMeta.pageEnd ?? 1) + 1)} 页起）`}
              </button>
            {/if}
          </div>
        {/if}
        {#if aiRemainingChunksCount > 0 && oncontinueNextChunk}
          <div class="lv-card" role="status" style="margin:6px 0;padding:8px 12px;background:var(--lv-surface-2);border:1px solid var(--lv-border);border-radius:var(--lv-r-1);font-size:12px;display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap">
            <span>分段续拆队列：尚余 <b>{aiRemainingChunksCount}</b> 段材料待送检（每段 ≤ {AI_CHUNK_MAX_CHARS} 字）</span>
            <button type="button" class="lv-btn sm lv-btn--primary" disabled={aiMutationBusy} onclick={oncontinueNextChunk}>
              继续拆解下一段
            </button>
          </div>
        {/if}
        <textarea class="lv-input lv-textarea" rows="7" bind:value={aiSource} oninput={() => (aiSourceOrigin = "")} placeholder={t("ai.sourcePlaceholder")} aria-label={t("ai.source")}></textarea>
        {#if gleanAvailable}
          <div class="lv-row" style="margin:4px 0 0">
            <button class="lv-btn sm lv-btn--ghost" disabled={gleanBusy} aria-busy={gleanBusy} onclick={onimportGlean}>
              <Icon name="book" size={14} /> {gleanBusy ? "…" : t("ai.gleanLater")}
            </button>
            <span class="lv-muted" style="font-size:var(--lv-font-size-caption)">{t("ai.gleanHint")}</span>
          </div>
          {#if gleanError}
            <div class="lv-error" role="alert" style="display:flex;align-items:center;justify-content:space-between;gap:var(--lv-space-relaxed);overflow-wrap:anywhere">
              <span>{gleanError}</span>
              <button class="lv-btn sm" disabled={gleanBusy || gleanDoneBusy} onclick={() => gleanErrorAction === "mark" ? onmarkGleanDone() : onimportGlean()}>{t("ai.gleanRetry")}</button>
            </div>
          {/if}
          {#if gleanPendingDone.length && aiQueue.length}
            <div class="lv-row" style="margin:6px 0 0">
              <button class="lv-btn sm" disabled={gleanDoneBusy} aria-busy={gleanDoneBusy} onclick={onmarkGleanDone} style="display:inline-flex;align-items:center;gap:4px">
                <Icon name="check" size={13} /> {gleanDoneBusy ? "…" : t("ai.gleanMarkDone").replace("{n}", String(gleanPendingDone.length))}
              </button>
              {#if gleanDoneNote}<span class="lv-muted" style="font-size:var(--lv-font-size-caption)">{gleanDoneNote}</span>{/if}
            </div>
          {/if}
        {/if}
      </div>
      <div class="lv-row" style="margin:4px 0;gap:var(--lv-space-3);flex-wrap:wrap">
        <div class="lv-session-dock" role="group" aria-label={t("ai.count")}>
          <span class="lv-chip" style="color:var(--lv-text-3);cursor:default">{t("ai.count")}</span>
          {#each [3, 5, 10, 20] as n, _i (_i)}
            <button type="button" class="lv-chip" class:acc={aiCount === n} aria-pressed={aiCount === n} onclick={() => (aiCount = n)}>{n}</button>
          {/each}
        </div>
        <div class="lv-session-dock" role="group" aria-label={t("ai.difficulty")}>
          <span class="lv-chip" style="color:var(--lv-text-3);cursor:default">{t("ai.difficulty")}</span>
          {#each (["easy", "medium", "hard", "mixed"] as const) as d, _i (_i)}
            <button type="button" class="lv-chip" class:acc={aiDifficulty === d} aria-pressed={aiDifficulty === d} onclick={() => (aiDifficulty = d)}>{t("ai.diff." + d)}</button>
          {/each}
        </div>
      </div>
      <div class="lv-row" style="margin:4px 0;gap:var(--lv-space-3);flex-wrap:wrap">
        <div class="lv-session-dock" role="group" aria-label={t("manual.type", "题型")}>
          <span class="lv-chip" style="color:var(--lv-text-3);cursor:default">{t("manual.type", "题型")}</span>
          {#each AI_GEN_TYPES as qt (qt)}
            {@const active = aiTypes.includes(qt)}
            <button
              type="button"
              class="lv-chip"
              class:acc={active}
              aria-pressed={active}
              onclick={() => {
                if (active) {
                  if (aiTypes.length > 1) aiTypes = aiTypes.filter((x) => x !== qt);
                } else {
                  aiTypes = [...aiTypes, qt];
                }
              }}
            >{t("qtype." + qt)}</button>
          {/each}
        </div>
      </div>
      <div class="lv-row" style="margin:4px 0;gap:var(--lv-space-3);flex-wrap:wrap">
        <div class="lv-session-dock" role="group" aria-label={t("ai.preset")}>
          <span class="lv-chip" style="color:var(--lv-text-3);cursor:default">{t("ai.preset")}</span>
          {#each AI_PRESET_KEYS as p (p)}
            <button type="button" class="lv-chip" class:acc={aiPreset === p} aria-pressed={aiPreset === p} onclick={() => (aiPreset = p)}>{t("ai.preset." + p, PROMPT_PRESETS[p].label)}</button>
          {/each}
        </div>
        <div class="lv-session-dock" role="group" aria-label={t("ai.quality")}>
          <span class="lv-chip" style="color:var(--lv-text-3);cursor:default">{t("ai.quality")}</span>
          <button type="button" class="lv-chip" class:acc={aiQuality === "standard"} aria-pressed={aiQuality === "standard"} onclick={() => (aiQuality = "standard")}>{t("ai.quality.standard")}</button>
          <button type="button" class="lv-chip" class:acc={aiQuality === "economy"} aria-pressed={aiQuality === "economy"} onclick={() => (aiQuality = "economy")}>{t("ai.quality.economy")}</button>
        </div>
      </div>
      <div class="lv-row">
        <span class="lv-chip">{t("manual.kp")}</span>
        <input class="lv-input" style="max-width:200px" bind:value={aiKp} placeholder={t("ai.kpHint")} aria-label={t("manual.kp")} />
      </div>
      <div>
        <div class="lv-row" style="margin:0">
          <span class="lv-chip" title="零幻觉严谨出题准则：选定重点段落引文，强制 AI 严格基于此核心引文命题与推导"><Icon name="pin" size={12} /> 核心引文</span>
          <input class="lv-input" style="flex:1;min-width:200px" bind:value={aiQuote} placeholder="重点段落引文（可选，强锚定零幻觉出题）" aria-label="核心引文" aria-describedby="lv-ai-quote-hint" />
        </div>
        <p id="lv-ai-quote-hint" class="lv-muted" style="margin:3px 0 0;font-size:var(--lv-font-size-caption)">粘贴资料中的重点原句后，出题与解析将严格锚定该引文，不虚构题外内容；留空则按整篇材料命题</p>
      </div>
      <div class="lv-row">
        <span class="lv-chip">{t("ai.customHint")}</span>
        <input class="lv-input" style="flex:1;min-width:200px" bind:value={aiCustomHint} placeholder={t("ai.customHintHint")} aria-label={t("ai.customHint")} />
      </div>
      <div class="lv-row">
        <button class="lv-btn lv-btn--primary" onclick={ongenerate} disabled={aiMutationBusy || !aiSource.trim() || !hasBank} aria-busy={aiBusy} title={!hasBank ? t("guard.needBankFirst") : t("ai.generate")}>
          {aiBusy ? t("ai.generating") : t("ai.generate")}
        </button>
        {#if aiPreviewChunks.length > 1 && onsegmentedGenerate}
          <button type="button" class="lv-btn sm" onclick={onsegmentedGenerate} disabled={aiMutationBusy || !hasBank} title="仅先送检第 1 段（≤3000 字），其余段入续拆队列">
            分段拆第 1 段（共 {aiPreviewChunks.length} 段）
          </button>
        {/if}
        {#if aiBusy || aiRegenBusy}
          <button class="lv-btn sm" onclick={oncancel} style="display:inline-flex;align-items:center;gap:4px"><Icon name="close" size={12} /> {t("ai.cancel")}</button>
        {/if}
        <span class="lv-muted">{t("ai.pipelineNote")}</span>
        {#if aiUsageTotal}<span class="lv-chip lv-chip--data num" style="display:inline-flex;align-items:center;gap:4px" title={t("ai.usageTitle")}><Icon name="activity" size={11} /> ≈{aiUsageTotal.totalTokens} tok · {aiUsageTotal.totalCalls} {t("ai.usageCalls")}</span>{/if}
      </div>
    </div>
    <section class="lv-card lv-pad-card lv-ai-review">
      <div class="lv-section-head">
        <div><span class="lv-eyebrow">审核工作区</span><h2>{t("ai.queue")}</h2></div>
        {#if aiQueue.length}<span class="lv-chip lv-chip--data num">{aiQueue.length} 待审核</span>{/if}
      </div>
      {#if aiBusy || aiRegenBusy}
        <div style="margin:10px 0 12px">
          <AiThinkingCard
            scenario="question-gen"
            compact={aiQueue.length > 0 || Boolean(aiRegenBusy)}
            title={aiRegenBusy ? "🔄 正在重新生成该道候选试题…" : "✨ AI 正在批量命制与校验试题…"}
            subtitle={aiRegenBusy ? "依据原材料与同题型/考点约束替换原候选" : "正在进行命题拆解、干扰项构建与格式质检"}
            cancelLabel="⏹ 取消生成"
            {oncancel}
          />
        </div>
      {/if}
      {#if aiQueueBankId && (aiQueue.length || aiRejected.length)}
        <p class="lv-muted" role="status">{t("ai.queueTarget").replace("{name}", banks.find((b) => b.id === aiQueueBankId)?.name ?? aiQueueBankId)}</p>
        {#if aiQueueBankId !== activeBankId}<div class="lv-error" role="alert">{t("ai.queueWrongBank")}</div>{/if}
      {/if}
      {#if aiQueue.length || aiRejected.length || aiDuplicates || aiCost}
        <div class="lv-row" style="margin-top:14px;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
          <div class="lv-row" style="margin:0;gap:6px;align-items:center;flex-wrap:wrap">
            <b style="font-size:var(--lv-font-size-md)">{t("ai.queue")}</b>
            <button type="button" class="lv-chip sm" class:acc={aiReviewFilter === "all"} onclick={() => (aiReviewFilter = "all")}>全部 ({aiQueueSummary.counts.all})</button>
            <button type="button" class="lv-chip lv-chip--grn sm" class:acc={aiReviewFilter === "confirmed"} onclick={() => (aiReviewFilter = "confirmed")}>✅ 已确认 ({aiQueueSummary.counts.confirmed})</button>
            <button type="button" class="lv-chip lv-chip--amb sm" class:acc={aiReviewFilter === "pending"} onclick={() => (aiReviewFilter = "pending")}>🟡 待校对 ({aiQueueSummary.counts.pending})</button>
            {#if aiQueueSummary.counts.warning > 0}
              <button type="button" class="lv-chip lv-chip--red sm" class:acc={aiReviewFilter === "warning"} onclick={() => (aiReviewFilter = "warning")}>⚠️ 有警告 ({aiQueueSummary.counts.warning})</button>
            {/if}
            {#if aiRejected.length}<span class="lv-chip lv-chip--red num" style="display:inline-flex;align-items:center;gap:4px"><Icon name="close" size={11} /> {aiRejected.length}</span>{/if}
            {#if aiDuplicates}<span class="lv-chip lv-chip--amb num" style="display:inline-flex;align-items:center;gap:4px"><Icon name="copy" size={11} /> {aiDuplicates}</span>{/if}
            {#if aiCost}<span class="lv-chip num">{aiCost}</span>{/if}
          </div>
          <div class="lv-row" style="margin:0;gap:6px;flex-wrap:wrap">
            {#if aiRejected.length}
              <button class="lv-btn sm" onclick={onretryRejected} disabled={aiMutationBusy || (!!aiQueueBankId && aiQueueBankId !== activeBankId)} aria-busy={aiMutationBusy} title={t("ai.retryTitle")}><Icon name="rotate" size={13} /> {t("ai.retryRejected")}（{aiRejected.length}）</button>
            {/if}
            {#if aiQueueSummary.counts.pending > 0}
              <button type="button" class="lv-btn sm" onclick={confirmAllCleanAi} disabled={aiMutationBusy} title="一键批量确认所有无警告题，跳过有警告题">✅ 批量确认无警告</button>
            {/if}
            {#if aiQueueSummary.counts.confirmed > 0}
              <button class="lv-btn lv-btn--primary sm" onclick={() => onapproveAll(aiQueueSummary.filterBy("confirmed").map((it) => it.question))} disabled={aiMutationBusy || !hasBank || (!!aiQueueBankId && aiQueueBankId !== activeBankId)} aria-busy={aiMutationBusy} style="display:inline-flex;align-items:center;gap:4px"><Icon name="check" size={13} /> 入库已确认（{aiQueueSummary.counts.confirmed}）</button>
            {/if}
            {#if aiQueue.length}
              <button class="lv-btn {aiQueueSummary.counts.confirmed > 0 ? '' : 'lv-btn--primary'} sm" onclick={() => onapproveAll()} disabled={aiMutationBusy || !hasBank || (!!aiQueueBankId && aiQueueBankId !== activeBankId)} aria-busy={aiMutationBusy} style="display:inline-flex;align-items:center;gap:4px"><Icon name="check" size={13} /> {t("ai.approveAll")}（{aiQueue.length}）</button>
              <button class="lv-btn sm lv-btn--ghost" onclick={onclearQueue} disabled={aiMutationBusy} title="清空当前待审核候选池">清空队列</button>
            {/if}
          </div>
        </div>
        {#if aiSaved}<div class="lv-success num" role="status" style="display:inline-flex;align-items:center;gap:4px"><Icon name="check" size={13} /> {t("ai.saved")} {aiSaved}</div>{/if}
        {#each visibleAiItems as item (item.question.id)}
          {@const q = item.question}
          <div class="lv-card lv-qrow" style="border-left:3px solid {item.state === 'confirmed' ? 'var(--lv-green)' : item.state === 'warning' ? 'var(--lv-red)' : 'var(--lv-amber)'}">
            <div class="lv-qrow-head">
              <span class="lv-chip lv-chip--acc">{t("qtype." + q.type)}</span>
              {#if item.state === "confirmed"}
                <span class="lv-chip lv-chip--grn sm">✅ 已确认</span>
              {:else if item.state === "warning"}
                <span class="lv-chip lv-chip--red sm">⚠️ 有警告</span>
              {:else}
                <span class="lv-chip lv-chip--amb sm">🟡 待校对</span>
              {/if}
              {#if q.kp}<span class="lv-chip">{q.kp}</span>{/if}
              <span class="lv-muted lv-qrow-src">{t("ai.pendingBadge")}</span>
            </div>
            {#if item.warnings.length > 0}
              <div class="lv-row" style="margin:4px 0 6px;gap:4px;flex-wrap:wrap">
                {#each item.warnings as warn (warn)}
                  <span class="lv-chip lv-chip--red sm">⚠️ {warn}</span>
                {/each}
              </div>
            {/if}
            {#if editingAiId === q.id && aiEditDraft}
              <div class="lv-row" style="margin:6px 0 0"><input class="lv-input" bind:value={aiEditDraft.stem} placeholder={t("manual.stem")} aria-label={t("manual.stem")} /></div>
              {#each aiEditDraft.options as _opt, i (i)}
                <div class="lv-row" style="margin:4px 0 0">
                  <span class="lv-chip num">{String.fromCharCode(65 + i)}</span>
                  <input class="lv-input" bind:value={aiEditDraft.options[i]} aria-label={`选项 ${String.fromCharCode(65 + i)}`} />
                  <button class="lv-btn sm lv-btn--ghost" title={t("manual.setCorrect")} aria-label={t("manual.setCorrect")} aria-pressed={aiEditDraft.answer === String.fromCharCode(65 + i)} onclick={() => { aiEditDraft.answer = String.fromCharCode(65 + i); }} style="min-width:28px;min-height:28px;padding:0;display:inline-flex;align-items:center;justify-content:center"><Icon name="check" size={13} /></button>
                </div>
              {/each}
              <div class="lv-row" style="margin:4px 0 0">
                <span class="lv-chip">{t("browse.answer")}</span>
                <input class="lv-input" style="max-width:120px" bind:value={aiEditDraft.answer} aria-label={t("browse.answer")} />
                <input class="lv-input" style="flex:1" bind:value={aiEditDraft.analysis} placeholder={t("manual.analysis")} aria-label={t("manual.analysis")} />
              </div>
              {#if aiEditError}<div class="lv-error" role="alert">{aiEditError}</div>{/if}
              <div class="lv-row" style="margin:8px 0 0">
                <button class="lv-btn sm lv-btn--primary" onclick={() => onsaveEdit(q)} style="display:inline-flex;align-items:center;gap:4px"><Icon name="check" size={13} /> {t("ai.editSave")}</button>
                <button class="lv-btn sm lv-btn--ghost" onclick={oncancelEdit}>{t("ai.editCancel")}</button>
              </div>
            {:else}
              <div class="lv-qrow-stem">{q.stem}</div>
              {#if q.options.length}
                <div class="lv-muted" style="margin-top:4px">{q.options.map((o, i) => String.fromCharCode(65 + i) + ". " + o).join("　")}</div>
              {/if}
              <div class="lv-row" style="margin:6px 0;align-items:center;gap:var(--lv-space-compact);flex-wrap:wrap">
                <span class="lv-chip lv-chip--acc num"><b>{t("browse.answer")}:</b> {q.answer}</span>
                {#if q.difficulty}<span class="lv-chip num" style="display:inline-flex;align-items:center;gap:4px"><Icon name="star" size={11} /> {q.difficulty}</span>{/if}
              </div>
              <div class="lv-analysis" style="margin:8px 0 0">{q.analysis}</div>
              {#if q.expansion}
                <div style="margin-top:6px;padding:4px 8px;background:var(--lv-surface-2);border-left:3px solid var(--lv-accent);border-radius:2px;font-size:12px;color:var(--lv-text)">
                  <strong>💡 思路拓展：</strong> {q.expansion}
                </div>
              {/if}
              {#if q.prerequisites && q.prerequisites.length > 0}
                <div style="margin-top:4px;display:inline-flex;align-items:center;gap:4px;font-size:11.5px;color:var(--lv-brand)">
                  <Icon name="compass" size={11} /> <span>先修依赖：{q.prerequisites.join("、")}</span>
                </div>
              {/if}
              <div class="lv-row" style="margin:8px 0 0">
                <button class="lv-btn sm lv-btn--primary" onclick={() => onapproveOne(q)} disabled={aiMutationBusy || !hasBank || (!!aiQueueBankId && aiQueueBankId !== activeBankId)} aria-busy={aiMutationBusy} style="display:inline-flex;align-items:center;gap:4px"><Icon name="check" size={13} /> {t("ai.approve")}</button>
                <button type="button" class="lv-btn sm" onclick={() => toggleAiConfirmed(q.id)} disabled={aiMutationBusy || item.state === "warning"} title={item.state === "warning" ? "请先修复警告项后再确认" : "切换已确认/待校对状态"}>
                  {item.state === "confirmed" ? "取消确认" : "✅ 标为已确认"}
                </button>
                <button class="lv-btn sm" onclick={() => onstartEdit(q)} disabled={aiMutationBusy} style="display:inline-flex;align-items:center;gap:4px"><Icon name="edit" size={13} /> {t("ai.edit")}</button>
                <button class="lv-btn sm" disabled={aiMutationBusy || (!!aiQueueBankId && aiQueueBankId !== activeBankId)} aria-busy={aiRegenBusy === q.id} onclick={() => onregenOne(q)}><Icon name="rotate" size={13} /> {aiRegenBusy === q.id ? "…" : t("ai.regen")}</button>
                <button class="lv-btn sm lv-btn--ghost" onclick={() => ondropOne(q)} disabled={aiMutationBusy} style="display:inline-flex;align-items:center;gap:4px"><Icon name="close" size={13} /> {t("ai.drop")}</button>
              </div>
            {/if}
          </div>
        {/each}
        {#each aiRejected.slice(0, 10) as rj, _i (_i)}
          <div class="lv-error-row"><b class="num">#{rj.index}</b> {rj.reason}</div>
        {/each}
        {#if aiTaskLog.length}
          <details class="lv-card lv-pad-card" style="padding: var(--lv-space-3) var(--lv-space-4);margin-top:14px">
            <summary style="cursor:pointer;font-weight:var(--lv-font-weight-semibold);display:inline-flex;align-items:center;gap:6px"><Icon name="activity" size={13} /> {t("ai.taskLog")}（{aiTaskLog.length}）</summary>
            <p class="lv-muted" style="margin:6px 0 0">{t("ai.taskLogHint")}</p>
            {#each [...aiTaskLog].reverse().slice(0, 5) as e, _i (_i)}
              <div class="lv-row" style="margin:8px 0 0">
                <span class="lv-chip num">{new Date(e.at).toLocaleTimeString()}</span>
                <span class="lv-chip num">{e.templateId}</span>
                <span class="lv-chip num" class:lv-chip--red={e.status !== "ok"}>{e.status}</span>
                <span class="lv-chip num">≈{e.tokens} tok</span>
              </div>
              <details style="margin:2px 0 0 8px">
                <summary class="lv-muted" style="cursor:pointer;font-size:var(--lv-font-size-caption);display:inline-flex;align-items:center;gap:4px"><Icon name="chev-right" size={11} /> {t("ai.taskLogPayload")}</summary>
                {#each e.messages as m, _i (_i)}
                  <pre class="lv-muted num" style="white-space:pre-wrap;font-size:var(--lv-font-size-label);margin:4px 0">[{m.role}] {m.content.slice(0, 400)}{m.content.length > 400 ? "…" : ""}</pre>
                {/each}
              </details>
            {/each}
          </details>
        {/if}
      {:else if !aiBusy && !aiRegenBusy}
        <div class="lv-card lv-ai-empty">
          <div class="lv-empty-icon"><Icon name="sparkles" size={22} /></div>
          <b>候选题会显示在这里</b>
          <p class="lv-muted">先整理本次材料并设置题型、数量和难度；生成结果需要逐题审核后才会写入题库。</p>
        </div>
      {/if}
    </section>
  </div>
</div>
