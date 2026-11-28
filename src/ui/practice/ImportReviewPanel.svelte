<script lang="ts">
  import Icon from "../shared/Icon.svelte";
  import type { BankInfo } from "../../app";
  import type { ImportReport } from "../../importer/pipeline";
  import { hasBlankPlaceholder } from "@/core/questionLinter";
  import { classifyReviewQueue, batchConfirmNonWarning, type ReviewQueueState } from "@/core/reviewQueue";

  interface Props {
    banks: BankInfo[];
    importBusy: boolean;
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
    trialConfirmed: any[];
    trialBusy: boolean;
    commitProgress: { done: number; total: number } | null;
    trialNote: string;
    importResult: any;
    updateResult: any;
    retryPool: any[];
    showEmptyAiFallback?: boolean;
    t: (k: string, fb?: string) => string;
    escapeHtml: (s: string) => string;
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
    onGoAi?: () => void;
    onBackToDocList?: () => void;
  }

  let {
    banks,
    importBusy,
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
    trialConfirmed,
    trialBusy,
    commitProgress,
    trialNote,
    importResult,
    updateResult,
    retryPool,
    showEmptyAiFallback = false,
    t,
    escapeHtml,
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
    onGoAi,
    onBackToDocList,
  }: Props = $props();

  let selectedImportQids = $state<Record<string, boolean>>({});
  let confidenceFilter = $state<"all" | "high" | "need_review" | "malformed">("all");
  let reviewStateFilter = $state<"all" | ReviewQueueState>("all");
  let confirmedImportQids = $state<string[]>([]);

  const confirmedImportIdSet = $derived(
    new Set([
      ...confirmedImportQids,
      ...trialConfirmed.map((x: any) => (typeof x === "string" ? x : String(x?.id ?? ""))).filter(Boolean),
    ]),
  );

  const reviewQueueSummary = $derived(
    classifyReviewQueue(importReport?.ok ?? [], { confirmedIds: confirmedImportIdSet }),
  );

  const reviewItemByQid = $derived(
    new Map(reviewQueueSummary.items.map((item) => [item.question.id || String(item.index), item])),
  );

  const selectedImportQuestions = $derived(
    importReport?.ok?.filter((q, qi) => selectedImportQids[q.id || String(qi)] !== false) ?? [],
  );

  const selectedImportCount = $derived(selectedImportQuestions.length);

  const remainingSelectedImportCount = $derived(
    selectedImportQuestions.filter((q) => !trialConfirmed.includes(q.id)).length,
  );

  const highConfidenceCount = $derived(
    importReport?.ok?.filter((q) => (q.confidence ?? 1) >= 0.85 && (!q.lintIssues || q.lintIssues.length === 0)).length ?? 0,
  );

  const needReviewCount = $derived(
    (importReport?.ok?.length ?? 0) - highConfidenceCount,
  );

  const isMalformedLintIssue = (i: string) =>
    i.includes("选项异常") || i.includes("空干") || i.includes("挖空") || i.includes("空白") || i.includes("为空") || i.includes("越界");

  const malformedCount = $derived(
    importReport?.ok?.filter((q) =>
      (q.options?.length ?? 0) > 4 ||
      (q.type === "fill" && !hasBlankPlaceholder(q.stem)) ||
      (q.lintIssues && q.lintIssues.some(isMalformedLintIssue))
    ).length ?? 0,
  );

  const visibleImportQuestions = $derived.by(() => {
    if (!importReport?.ok) return [];
    let list = importReport.ok.map((q, qi) => ({ q, qi }));
    if (reviewStateFilter !== "all") {
      list = list.filter(({ q, qi }) => {
        const item = reviewItemByQid.get(q.id || String(qi));
        return item?.state === reviewStateFilter;
      });
    }
    if (confidenceFilter === "high") {
      return list.filter(({ q }) => (q.confidence ?? 1) >= 0.85 && (!q.lintIssues || q.lintIssues.length === 0));
    }
    if (confidenceFilter === "need_review") {
      return list.filter(({ q }) => (q.confidence ?? 1) < 0.85 || (q.lintIssues && q.lintIssues.length > 0));
    }
    if (confidenceFilter === "malformed") {
      return list.filter(({ q }) =>
        (q.options?.length ?? 0) > 4 ||
        (q.type === "fill" && !hasBlankPlaceholder(q.stem)) ||
        (q.lintIssues && q.lintIssues.some(isMalformedLintIssue))
      );
    }
    return list;
  });

  let lastImportReportRef: ImportReport | null = null;
  $effect(() => {
    if (importReport !== lastImportReportRef) {
      lastImportReportRef = importReport;
      confidenceFilter = "all";
      reviewStateFilter = "all";
      confirmedImportQids = [];
      selectedImportQids = {};
      return;
    }
    if (
      (confidenceFilter === "high" && highConfidenceCount === 0) ||
      (confidenceFilter === "need_review" && needReviewCount === 0) ||
      (confidenceFilter === "malformed" && malformedCount === 0)
    ) {
      confidenceFilter = "all";
    }
    if (
      (reviewStateFilter === "confirmed" && reviewQueueSummary.counts.confirmed === 0) ||
      (reviewStateFilter === "pending" && reviewQueueSummary.counts.pending === 0) ||
      (reviewStateFilter === "warning" && reviewQueueSummary.counts.warning === 0)
    ) {
      reviewStateFilter = "all";
    }
  });

  function confirmAllNonWarningQuestions() {
    if (!importReport?.ok) return;
    const res = batchConfirmNonWarning(importReport.ok, confirmedImportIdSet);
    confirmedImportQids = res.nextConfirmedIds;
    const nextSel: Record<string, boolean> = { ...selectedImportQids };
    for (let i = 0; i < importReport.ok.length; i++) {
      const q = importReport.ok[i]!;
      const item = reviewItemByQid.get(q.id || String(i));
      if (item && item.state !== "warning") {
        nextSel[q.id || String(i)] = true;
      }
    }
    selectedImportQids = nextSel;
  }

  function toggleQuestionConfirmed(qId: string) {
    if (!qId) return;
    if (confirmedImportQids.includes(qId)) {
      confirmedImportQids = confirmedImportQids.filter((id) => id !== qId);
    } else {
      confirmedImportQids = [...confirmedImportQids, qId];
    }
  }

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
      if (q.type === "fill" && !hasBlankPlaceholder(q.stem)) {
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
    if (!hasBlankPlaceholder(q.stem)) {
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
</script>

{#if importError}<div class="lv-error" role="alert" style="margin-top:8px">{importError}</div>{/if}
{#if showEmptyAiFallback && importReport && !importReport.ok.length && importReport.errors.length}
  <div class="lv-card" style="margin:12px 0;padding:14px 18px;border-left:4px solid var(--lv-accent);background:color-mix(in srgb, var(--lv-accent-soft) 25%, var(--lv-surface));border-radius:var(--lv-r-2);box-shadow:var(--lv-sh-1)">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
      <Icon name="sparkles" size={16} />
      <b style="font-size:13.5px;color:var(--lv-text)">未在所选文档中检测到显式考题格式</b>
    </div>
    <p class="lv-muted" style="margin:0 0 10px;font-size:12.5px;line-height:1.6">
      {importReport.errors[0]?.reason || "文档中暂无明显的选择题、判断题或问答定义。建议交由 AI 自动阅读整篇正文并提炼出题！"}
    </p>
    <div class="lv-row" style="margin:0;gap:8px">
      {#if onBackToDocList}
        <button class="lv-btn sm lv-btn--primary" onclick={onBackToDocList}>
          <Icon name="rotate" size={13} /> 返回思源文档列表
        </button>
      {/if}
      {#if onGoAi}
        <button class="lv-btn sm" onclick={onGoAi}>
          <Icon name="sparkles" size={13} /> 前往 AI 出题工作台
        </button>
      {/if}
    </div>
  </div>
{/if}
{#if importReport}
  <div class="lv-import-review-root" style="margin-top:12px">
    <p class="lv-muted">{t("import.target").replace("{name}", banks.find((b) => b.id === importPreviewBankId)?.name ?? importPreviewBankId)}</p>
    <div class="lv-row">
      <span class="lv-chip lv-chip--grn num" style="display:inline-flex;align-items:center;gap:3px"><Icon name="check" size={11} /> {importReport.ok.length}</span>
      <span class="lv-chip lv-chip--red num" style="display:inline-flex;align-items:center;gap:3px"><Icon name="close" size={11} /> {importReport.errors.length}</span>
      {#if importReport.duplicates}<span class="lv-chip lv-chip--amb num" style="display:inline-flex;align-items:center;gap:4px" title={t("import.dupeHint")}><Icon name="copy" size={11} /> {importReport.duplicates}</span>{/if}
    </div>
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
            <div class="lv-row" style="margin:0;gap:4px;flex-wrap:wrap" role="group" aria-label="审核队列三态筛选">
              <button type="button" class="lv-chip sm" class:acc={reviewStateFilter === "all"} onclick={() => reviewStateFilter = "all"}>
                队列全部 ({reviewQueueSummary.counts.all})
              </button>
              <button type="button" class="lv-chip lv-chip--grn sm" class:acc={reviewStateFilter === "confirmed"} onclick={() => reviewStateFilter = "confirmed"} title="已确认可入库的无警告题目">
                ✅ 已确认入库 ({reviewQueueSummary.counts.confirmed})
              </button>
              <button type="button" class="lv-chip lv-chip--amb sm" class:acc={reviewStateFilter === "pending"} onclick={() => reviewStateFilter = "pending"} title="待人工校对确认的无警告题目">
                🟡 待校对 ({reviewQueueSummary.counts.pending})
              </button>
              {#if reviewQueueSummary.counts.warning > 0}
                <button type="button" class="lv-chip lv-chip--red sm" class:acc={reviewStateFilter === "warning"} onclick={() => reviewStateFilter = "warning"} title="含缺答案、选项重复或空题干等警告的题目">
                  ⚠️ 有警告 ({reviewQueueSummary.counts.warning})
                </button>
              {/if}
            </div>
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
            {#if reviewQueueSummary.counts.pending > 0}
              <button type="button" class="lv-btn sm lv-btn--primary" onclick={confirmAllNonWarningQuestions} title="一键批量确认所有无警告题，自动跳过有警告题">
                <Icon name="check" size={12} /> 一键确认无警告题 ({reviewQueueSummary.counts.pending})
              </button>
            {/if}
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

        <div class="stack-sm" style="display:grid;gap:10px;max-height:480px;overflow-y:auto;padding-right:4px">
          {#each visibleImportQuestions as { q, qi } (q.id || qi)}
            {@const isChecked = selectedImportQids[q.id || String(qi)] !== false}
            {@const imgCount = (q.stem.match(/!\[[^\]]*\]\([^)]+\)/g) || []).length}
            {@const reviewItem = reviewItemByQid.get(q.id || String(qi))}
            <div class="lv-card" style="padding:12px 14px;background:var(--lv-surface);border-radius:var(--lv-r-2);border:1px solid {isChecked ? 'var(--lv-border)' : 'var(--lv-border-subtle)'};border-left:3.5px solid {reviewItem?.state === 'confirmed' ? 'var(--lv-green)' : reviewItem?.state === 'warning' ? 'var(--lv-red)' : 'var(--lv-amber)'};opacity:{isChecked ? 1 : 0.6};transition: transform var(--lv-dur-micro) ease, background var(--lv-dur-micro) ease, border-color var(--lv-dur-micro) ease, box-shadow var(--lv-dur-micro) ease, color var(--lv-dur-micro) ease, opacity var(--lv-dur-micro) ease;box-shadow:var(--lv-sh-1)">
              <div class="lv-row" style="justify-content:space-between;align-items:center;margin:0 0 8px;gap:8px">
                <div class="lv-row" style="margin:0;gap:8px;align-items:center;flex:1;min-width:0;flex-wrap:wrap">
                  <input type="checkbox" checked={isChecked} onchange={(e) => {
                    const checked = (e.target as HTMLInputElement).checked;
                    selectedImportQids[q.id || String(qi)] = checked;
                  }} aria-label={`选择第 ${qi + 1} 题`} style="cursor:pointer" />
                  <span class="num" style="font-weight:700;color:var(--lv-accent);font-size:13px">#{qi + 1}</span>
                  {#if reviewItem?.state === "confirmed"}
                    <span class="lv-chip lv-chip--grn sm" style="font-size:10.5px;padding:1px 6px">✅ 已确认</span>
                  {:else if reviewItem?.state === "warning"}
                    <span class="lv-chip lv-chip--red sm" style="font-size:10.5px;padding:1px 6px">⚠️ 有警告</span>
                  {:else}
                    <span class="lv-chip lv-chip--amb sm" style="font-size:10.5px;padding:1px 6px">🟡 待校对</span>
                  {/if}
                  <select class="lv-select sm" bind:value={q.type} style="max-width:110px;font-size:12px;padding:2px 8px;height:28px" aria-label="题型选择">
                    <option value="single">单选题</option>
                    <option value="multiple">多选题</option>
                    <option value="judge">判断题</option>
                    <option value="fill">填空题</option>
                    <option value="short">简答题</option>
                  </select>
                  {#if (q.confidence ?? 1) >= 0.85 && (!q.lintIssues || q.lintIssues.length === 0)}
                    <span class="lv-chip lv-chip--grn num sm" style="font-size:10.5px;padding:1px 6px">🎯 {Math.round((q.confidence ?? 1) * 100)}% 高置信</span>
                  {:else if (q.confidence ?? 0.7) >= 0.60}
                    <span class="lv-chip lv-chip--amb num sm" style="font-size:10.5px;padding:1px 6px">⚠️ {Math.round((q.confidence ?? 0.7) * 100)}% 待核对</span>
                  {:else}
                    <span class="lv-chip lv-chip--red num sm" style="font-size:10.5px;padding:1px 6px">❓ {Math.round((q.confidence ?? 0.5) * 100)}% 存疑</span>
                  {/if}
                  {#if imgCount > 0}
                    <span class="lv-chip lv-chip--data num sm" style="font-size:10.5px;padding:1px 6px">🖼️ 含 {imgCount} 张插图</span>
                  {/if}
                  {#if q.kp}
                    <span class="lv-chip num sm" style="font-size:11px;max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title={q.kp}>{q.kp}</span>
                  {/if}
                  {#if (q.type === "single" || q.type === "multiple") && (!q.answer || !q.answer.trim())}
                    {@const stemAns = (q.stem.match(/[（([【]\s*([A-D])\s*[)）\]】]/i) || q.stem.match(/答案[：:]\s*([A-D])/i))?.[1]?.toUpperCase()}
                    <div class="lv-row" style="margin:0;gap:3px;align-items:center;background:var(--lv-red-soft);padding:1px 6px;border-radius:4px" title="该题缺失答案，请点击字母秒设">
                      <span style="font-size:11px;color:var(--lv-red);font-weight:600">设答案:</span>
                      {#each q.options as _opt, oi (oi)}
                        {@const letter = String.fromCharCode(65 + oi)}
                        <button type="button" class="lv-chip sm" style="padding:0 5px;font-size:10px;cursor:pointer" onclick={() => { q.answer = letter; q.status = "published"; q.lintIssues = (q.lintIssues || []).filter(i => !i.includes("答案")); }}>
                          {letter}
                        </button>
                      {/each}
                      {#if stemAns}
                        <button type="button" class="lv-chip sm lv-chip--grn" style="padding:0 5px;font-size:10px;cursor:pointer" onclick={() => { q.answer = stemAns; q.status = "published"; q.lintIssues = (q.lintIssues || []).filter(i => !i.includes("答案")); }}>
                          识别为 {stemAns}
                        </button>
                      {/if}
                    </div>
                  {:else if q.type === "judge" && (!q.answer || !q.answer.trim())}
                    <div class="lv-row" style="margin:0;gap:3px;align-items:center;background:var(--lv-red-soft);padding:1px 6px;border-radius:4px" title="该题缺失判断答案，请点击秒设">
                      <span style="font-size:11px;color:var(--lv-red);font-weight:600">设答案:</span>
                      <button type="button" class="lv-chip sm" style="padding:0 5px;font-size:10px;cursor:pointer" onclick={() => { q.answer = "对"; q.status = "published"; q.lintIssues = (q.lintIssues || []).filter(i => !i.includes("答案")); }}>✓对</button>
                      <button type="button" class="lv-chip sm" style="padding:0 5px;font-size:10px;cursor:pointer" onclick={() => { q.answer = "错"; q.status = "published"; q.lintIssues = (q.lintIssues || []).filter(i => !i.includes("答案")); }}>✗错</button>
                    </div>
                  {/if}
                </div>
                <div class="lv-row" style="margin:0;gap:4px">
                  <button type="button" class="lv-btn sm" onclick={() => toggleQuestionConfirmed(q.id)} disabled={!q.id || reviewItem?.state === "warning"} title={reviewItem?.state === "warning" ? "请先修复警告项后再确认" : "切换已确认/待校对状态"} style="padding:2px 8px">
                    {reviewItem?.state === "confirmed" ? "取消确认" : "✅ 确认"}
                  </button>
                  <button type="button" class="lv-btn sm lv-btn--ghost" onclick={() => removeImportQuestion(q)} title="不导入此题" aria-label="删除此题" style="color:var(--lv-red);padding:2px 6px">
                    <Icon name="close" size={12} /> 不导入
                  </button>
                </div>
              </div>

              {#if reviewItem && reviewItem.warnings.length > 0}
                <div class="lv-row" style="margin:2px 0 6px;gap:4px;flex-wrap:wrap;padding:4px 8px;background:var(--lv-red-soft);border-radius:4px">
                  {#each reviewItem.warnings as warn (warn)}
                    <span class="lv-chip lv-chip--red num sm" style="font-size:10.5px;padding:1px 6px">⚠️ {warn}</span>
                  {/each}
                </div>
              {/if}

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

              {#if q.type === "fill" && !hasBlankPlaceholder(q.stem)}
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
                        style="{isAns ? 'background:var(--lv-brand);color:var(--lv-on-brand, var(--lv-surface));font-weight:700;' : ''}cursor:pointer;padding:2px 8px;font-size:11px"
                        title="点击将该选项设为正确答案"
                        onclick={() => {
                          if (q.type === "single") q.answer = letter;
                          else {
                            if (q.answer.includes(letter)) q.answer = q.answer.replace(letter, "");
                            else q.answer = (q.answer + letter).split("").sort().join("");
                          }
                          q.status = q.answer ? "published" : "draft";
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
                  <button type="button" class="lv-chip" class:acc={q.answer === "对" || q.answer === "正确"} onclick={() => { q.answer = "对"; q.status = "published"; }}>✓ 对（正确）</button>
                  <button type="button" class="lv-chip" class:acc={q.answer === "错" || q.answer === "错误"} onclick={() => { q.answer = "错"; q.status = "published"; }}>✗ 错（错误）</button>
                </div>
              {:else}
                <div class="lv-row" style="margin:6px 0 8px;gap:8px;align-items:center">
                  <span class="lv-muted" style="font-size:12px;min-width:60px">参考答案：</span>
                  <input class="lv-input sm" style="flex:1" bind:value={q.answer} placeholder="待补答案（可直接留空入草稿，或在此补全）…" aria-label="标准答案" />
                </div>
              {/if}

              <div class="lv-row" style="margin:4px 0 0;gap:8px;align-items:flex-start">
                <span class="lv-muted" style="font-size:11px;min-width:60px;padding-top:6px">💡 试题解析：</span>
                <textarea class="lv-input lv-textarea sm" rows={q.analysis && q.analysis.includes("\n") ? 3 : 1} style="flex:1;font-size:12px;min-height:32px;resize:vertical!important" bind:value={q.analysis} placeholder="试题解析与破题思路（可选）…" aria-label="试题解析"></textarea>
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
        onCommitImport(selectedImportQuestions);
      }} disabled={importBusy || (!selectedImportCount && !importReport.updates?.length && !trialConfirmed.length)} aria-busy={committing}>
        {committing ? t("import.committing") : importReport.updates?.length ? t("import.commitSummary").replace("{new}", String(selectedImportCount)).replace("{update}", String(importReport.updates.length)) : selectedImportCount ? t("import.commit") + " (" + selectedImportCount + ")" : t("import.finishTrial")}
      </button>
      <button class="lv-btn sm" onclick={() => onTrialImport5(selectedImportQuestions)} disabled={importBusy || !remainingSelectedImportCount} aria-busy={trialBusy}>
        {trialBusy ? "…" : t("import.trial5")}
      </button>
      {#if committing && commitProgress}
        <span class="lv-chip num" role="status">{t("import.progress").replace("{d}", String(commitProgress.done)).replace("{t}", String(commitProgress.total))}</span>
        <button class="lv-btn sm" onclick={onCancelCommit}>{t("import.cancelCommit")}</button>
      {/if}
    </div>
    {#if importError}
      <div class="lv-error" role="alert" style="margin-top:8px">{importError}</div>
    {/if}
    {#if trialNote}
      <div class="lv-row"><span class="lv-chip num">{trialNote}</span></div>
    {/if}
  </div>
{/if}
{#if importResult}
  <div style="margin-top:10px">
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
  </div>
{/if}
