<script lang="ts">
  import Icon from "../shared/Icon.svelte";
  import type { Question, QuestionLifecycleStatus } from "../../core/types";
  import type { ExamApp } from "../../app";
  import { renderOcclusionSvg } from "@/core/imageOcclusion";
  import { computeTextDiff } from "@/core/textDiff";

  type QuestionWithBlock = Question & { blockId: string };

  interface Props {
    q: QuestionWithBlock;
    drawerEl: HTMLDivElement | null;
    status: QuestionLifecycleStatus;
    links: any;
    currentPeekIndex: number;
    shownQuestionsCount: number;
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
    app: ExamApp;
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
    LIFECYCLE_LABELS: Record<string, string>;
    isQuestionDisputed: (q: Question) => boolean;
    isStubbornWrong: (w: any) => boolean;
    getStubbornRemediation: (w: any) => any;
    isAttemptVersionDrifted: (a: any, q: any) => boolean;
    removeChoiceOption: (type: any, opts: string[], ans: string, idx: number) => any;
    summarizeLoad: (cards: any[]) => string;
    onclose: () => void;
    onkeydown: (e: KeyboardEvent) => void;
    onprev: () => void;
    onnext: () => void;
    ontoggleFav: (q: QuestionWithBlock) => void;
    onopenInSiYuan: (rootId?: string, blockId?: string, opt?: any) => void;
    onttsSpeak: (text: string, opt?: any) => void;
    onsaveEdit: (q: QuestionWithBlock) => void;
    oncloseEdit: () => void;
    ontoggleHideAnswer: () => void;
    onsnoozeWrong: (qid: string, days: number) => void;
    onarchiveWrong: (qid: string) => void;
    onunarchiveWrong: (qid: string) => void;
    ontoggleItemAnalysis: (q: QuestionWithBlock) => void;
    ondownloadItemAnalysisCsv: (report: any) => void;
    ontoggleRevisions: (qid: string) => void;
    onloadRevisions: (qid: string) => void;
    onrestoreRevision: (q: QuestionWithBlock, r: any) => void;
    ondrillSingle: (q: QuestionWithBlock) => void;
    onopenEditForm: (q: QuestionWithBlock) => void;
    oncloneToManualStudio: (q: QuestionWithBlock) => void;
    ontoggleDisputeForm: (q: QuestionWithBlock) => void;
    onchangeLifecycle: (q: QuestionWithBlock, nextStatus: any) => void;
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
  }

  let {
    q,
    drawerEl = $bindable(),
    status,
    links,
    currentPeekIndex,
    shownQuestionsCount,
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
    app,
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
    LIFECYCLE_LABELS,
    isQuestionDisputed,
    isStubbornWrong,
    getStubbornRemediation,
    isAttemptVersionDrifted,
    removeChoiceOption,
    summarizeLoad,
    onclose,
    onkeydown,
    onprev,
    onnext,
    ontoggleFav,
    onopenInSiYuan,
    onttsSpeak,
    onsaveEdit,
    oncloseEdit,
    ontoggleHideAnswer,
    onsnoozeWrong,
    onarchiveWrong,
    onunarchiveWrong,
    ontoggleItemAnalysis,
    ondownloadItemAnalysisCsv,
    ontoggleRevisions,
    onloadRevisions,
    onrestoreRevision,
    ondrillSingle,
    onopenEditForm,
    oncloneToManualStudio,
    ontoggleDisputeForm,
    onchangeLifecycle,
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
  }: Props = $props();

  let writeBackBusy = $state<string>("");
  let writeBackSuccess = $state<Record<string, boolean>>({});
  let writeBackError = $state<Record<string, string>>({});
  let activeDiffTs = $state<number | null>(null);

  async function handleWriteBackNote(targetQ: QuestionWithBlock, text: string, rkey: string) {
    if (!targetQ.blockId || !app?.kernelOnline) return;
    writeBackBusy = rkey;
    writeBackError = { ...writeBackError, [rkey]: "" };
    try {
      await app.appendQuestionNote(targetQ.id, targetQ.blockId, text, "ai-explain");
      writeBackSuccess = { ...writeBackSuccess, [rkey]: true };
    } catch (e) {
      writeBackError = { ...writeBackError, [rkey]: String(e instanceof Error ? e.message : e) };
    } finally {
      writeBackBusy = "";
    }
  }

  let drawerDocPickerOpen = $state(false);
  let drawerDocSearch = $state("");
  let drawerDocCandidates = $state<Array<{ id: string; title: string; hpath: string }>>([]);
  let drawerDocBusy = $state(false);

  let quickKpEditing = $state(false);
  let quickKpValue = $state("");

  async function updateQuickDifficulty(d: number) {
    if (!q.blockId || !app?.kernelOnline) return;
    q.difficulty = d;
    try {
      await app.deps.client.setExamAttrs(q.blockId, { "exam-difficulty": String(d) });
    } catch {
      /* 离线降级 */
    }
  }

  async function saveQuickKp() {
    if (!q.blockId || !app?.kernelOnline) return;
    const clean = quickKpValue.trim();
    await app.markQuestionKp(q, clean);
    quickKpEditing = false;
  }

  async function searchDocsForDrawer(query: string) {
    if (!app) return;
    drawerDocBusy = true;
    try {
      drawerDocCandidates = query.trim()
        ? await app.searchSiyuanDocs(query.trim())
        : await app.searchSiyuanDocs("");
    } catch {
      drawerDocCandidates = [];
    } finally {
      drawerDocBusy = false;
    }
  }

  async function bindDocToQuestion(doc: { id: string; title: string; hpath: string }) {
    q.sourceBlockId = doc.id;
    q.source = doc.title;
    drawerDocPickerOpen = false;
    if (app?.writeManualQuestion) {
      try {
        await app.writeManualQuestion(q.rootId || "", q);
      } catch {
        // 容错
      }
    }
  }

  async function appendCurrentQToBoundNote() {
    if (!q.sourceBlockId || !app?.appendQuestionToSiyuanDoc) return;
    try {
      await app.appendQuestionToSiyuanDoc(q.sourceBlockId, q);
    } catch {
      // 容错
    }
  }
</script>

<div class="lv-peek-backdrop" onclick={onclose} role="presentation"></div>
<div bind:this={drawerEl} class="lv-card lv-peek-drawer" aria-label={t("browse.detailTitle", "题目详情与操作")} role="dialog" aria-modal="true" tabindex="-1" onkeydown={onkeydown}>
  <div class="lv-peek-sheet-handle" aria-hidden="true"></div>
  <header class="lv-peek-head">
    <div class="lv-row" style="margin:0;gap:var(--lv-space-1);flex-wrap:wrap">
      <span class="lv-chip lv-chip--acc">{t("qtype." + q.type)}</span>
      {#if q.kp}<span class="lv-chip">{q.kp}</span>{/if}
      {#if q.secondaryKps && q.secondaryKps.length}
        {#each q.secondaryKps as skp (skp)}
          <span class="lv-chip sm lv-chip--data num" title="辅助考查知识点">辅: {skp}</span>
        {/each}
      {/if}
      {#if q.source}<span class="lv-muted lv-peek-src">{q.source}</span>{/if}
      <span class="lv-chip sm" class:lv-chip--grn={status === "published"} class:lv-chip--amb={status === "draft"} class:lv-chip--acc={status === "review"} style={status === "deprecated" ? "opacity:0.6" : undefined} title={t("browse.lifecycle")}>
        {t("lifecycle." + status, LIFECYCLE_LABELS[status])}
      </span>
      {#if isQuestionDisputed(q)}
        <span class="lv-chip lv-chip--red sm" title={q.dispute?.note ?? ""}>
          <Icon name="alert-triangle" size={11} /> {t("dispute.badge")} · {t("dispute.reason." + q.dispute?.reason)}
        </span>
      {:else if q.dispute?.resolved}
        <span class="lv-chip lv-chip--grn sm" style="display:inline-flex;align-items:center;gap:4px" title={q.dispute.resolution ?? ""}>
          <Icon name="check" size={11} /> {t("dispute.resolved")}
        </span>
      {/if}
    </div>
    <div class="lv-row" style="margin:0;gap:var(--lv-space-1)">
      {#if currentPeekIndex >= 0}
        <span class="lv-chip num lv-peek-counter" title={t("browse.peekCounter", "当前位置")}>
          {currentPeekIndex + 1} / {shownQuestionsCount}
        </span>
        <button class="lv-btn sm lv-btn--ghost" title={t("browse.prevQuestion", "上一题 (↑/k)")} aria-label={t("browse.prevQuestion", "上一题")} disabled={!hasPrevPeek} onclick={onprev}>
          <Icon name="chev-left" size={13} />
        </button>
        <button class="lv-btn sm lv-btn--ghost" title={t("browse.nextQuestion", "下一题 (↓/j)")} aria-label={t("browse.nextQuestion", "下一题")} disabled={!hasNextPeek} onclick={onnext}>
          <Icon name="chev-right" size={13} />
        </button>
      {/if}
      <button class="lv-btn sm lv-btn--ghost" class:lv-chip--amb={!!q.fav} title={`${t("session.kbdFav")} (E)`} aria-label={t("session.kbdFav")} aria-pressed={!!q.fav} disabled={favBusy} onclick={() => ontoggleFav(q)}>
        <Icon name="star" size={13} />
      </button>
      <button class="lv-btn sm lv-btn--ghost" title={q.blockId ? "在思源笔记中精准定位此题块并高亮聚焦（按住 Ctrl/Cmd 点击可在右侧分屏打开）" : t("browse.openDoc")} aria-label={t("browse.openDoc")} onclick={(e) => onopenInSiYuan(q.rootId, q.blockId, { event: e })} disabled={!q.rootId && !q.blockId}>
        <Icon name="pin" size={13} />
      </button>
      <button class="lv-btn sm lv-btn--ghost lv-peek-close" title={t("dialog.close", "关闭")} aria-label={t("dialog.close", "关闭")} onclick={onclose}>
        <Icon name="close" size={13} />
      </button>
    </div>
  </header>
  <div class="lv-peek-body">
    <div class="lv-peek-stem">{q.stem}</div>

    <!-- 快捷考点与难度就地即时点改 -->
    <div class="lv-row" style="margin:6px 0 8px;gap:6px;align-items:center;flex-wrap:wrap">
      <div class="lv-chip sm" style="gap:2px;display:inline-flex;align-items:center">
        <span class="lv-muted">难度:</span>
        {#each [1, 2, 3, 4, 5] as star (star)}
          <button type="button" class="lv-btn sm lv-btn--ghost"
            style="padding:0 1px;min-width:14px;color:{star <= (q.difficulty ?? 1) ? 'var(--lv-amber)' : 'var(--lv-text-3)'};cursor:pointer"
            onclick={() => updateQuickDifficulty(star)}
            title={`点击设为 ${star} 星难度`}>
            ★
          </button>
        {/each}
      </div>

      {#if !quickKpEditing}
        <button type="button" class="lv-chip sm" style="cursor:pointer;display:inline-flex;align-items:center;gap:4px" onclick={() => { quickKpValue = q.kp || ""; quickKpEditing = true; }} title="点击快速修改考点">
          <Icon name="tag" size={11} /> 考点: <b>{q.kp || "未分类考点"}</b> <Icon name="pencil" size={10} />
        </button>
      {:else}
        <div class="lv-row" style="margin:0;gap:3px;align-items:center">
          <input class="lv-input sm" style="max-width:140px;height:24px;font-size:11px" bind:value={quickKpValue} placeholder="输入考点…" />
          <button type="button" class="lv-btn sm lv-btn--primary" style="padding:1px 6px;font-size:11px" onclick={saveQuickKp}>保存</button>
          <button type="button" class="lv-btn sm" style="padding:1px 6px;font-size:11px" onclick={() => quickKpEditing = false}>取消</button>
        </div>
      {/if}
    </div>

    <!-- 来源思源笔记与双向溯源 -->
    <div class="lv-row" style="margin:6px 0 10px;gap:6px;align-items:center;flex-wrap:wrap">
      {#if q.sourceBlockId}
        <span class="lv-chip lv-chip--acc" style="font-size:11px;padding:2px 8px;display:inline-flex;align-items:center;gap:4px">
          <Icon name="link" size={11} /> 来源笔记: {q.source || "思源笔记文档"}
        </span>
        <button type="button" class="lv-btn sm lv-btn--ghost" onclick={(e) => onopenInSiYuan("", q.sourceBlockId, { event: e })} title="在思源笔记中打开并定位原段落（按住 Ctrl/Cmd 点击可在右侧分屏打开）" style="font-size:11px;padding:2px 6px">
          <Icon name="pin" size={11} /> 定位原笔记 ↗
        </button>
      {/if}
      {#if q.blockId}
        <button type="button" class="lv-btn sm lv-btn--ghost" onclick={(e) => onopenInSiYuan(q.rootId, q.blockId, { event: e })} title="在思源中定位此题题库块（按住 Ctrl/Cmd 点击可在右侧分屏打开）" style="font-size:11px;padding:2px 6px">
          <Icon name="folder" size={11} /> 题库块 ↗
        </button>
      {/if}
      <button type="button" class="lv-btn sm lv-btn--ghost" onclick={() => { drawerDocPickerOpen = !drawerDocPickerOpen; if (drawerDocPickerOpen && !drawerDocCandidates.length) searchDocsForDrawer(""); }} title="绑定或换绑来源思源笔记文档" style="font-size:11px;padding:2px 6px">
        <Icon name="link" size={11} /> {q.sourceBlockId ? "换绑笔记" : "🔗 绑定思源笔记"}
      </button>
      {#if q.sourceBlockId}
        <button type="button" class="lv-btn sm lv-btn--ghost" onclick={appendCurrentQToBoundNote} title="在绑定的思源原笔记末尾追加该题折叠自测块" style="font-size:11px;padding:2px 6px">
          <Icon name="plus" size={11} /> 写入原笔记
        </button>
      {/if}
    </div>

    <!-- 弹出的笔记选择器 -->
    {#if drawerDocPickerOpen}
      <div class="lv-card" style="margin:6px 0 10px;padding:10px 12px;background:var(--lv-surface-2);border:1px solid var(--lv-accent);border-radius:var(--lv-r-2);box-shadow:var(--lv-sh-pop)">
        <div class="lv-row" style="justify-content:space-between;align-items:center;margin:0 0 6px">
          <b style="font-size:12px;color:var(--lv-text);display:flex;align-items:center;gap:4px">
            <Icon name="link" size={12} /> 选择要绑定的思源笔记文档
          </b>
          <button type="button" class="lv-btn sm lv-btn--ghost" onclick={() => drawerDocPickerOpen = false}><Icon name="close" size={11} /></button>
        </div>
        <div class="lv-row" style="margin:0 0 6px;gap:6px">
          <input class="lv-input sm" style="flex:1" placeholder="搜索文档标题或路径…" bind:value={drawerDocSearch} oninput={(e) => searchDocsForDrawer((e.target as HTMLInputElement).value)} />
          <button type="button" class="lv-btn sm lv-btn--primary" onclick={() => searchDocsForDrawer(drawerDocSearch)}>搜索</button>
        </div>
        <div class="stack-sm" style="max-height:160px;overflow-y:auto;border:1px solid var(--lv-border-subtle);border-radius:var(--lv-r-2);padding:4px;background:var(--lv-surface)">
          {#if drawerDocBusy}
            <div class="lv-muted" style="padding:10px;text-align:center">正在检索思源笔记…</div>
          {:else if !drawerDocCandidates.length}
            <div class="lv-muted" style="padding:10px;text-align:center">未找到相关笔记文档</div>
          {:else}
            {#each drawerDocCandidates as cd (cd.id)}
              <button type="button" class="lv-row" style="width:100%;text-align:left;padding:5px 8px;border-radius:4px;border:none;background:transparent;cursor:pointer;justify-content:space-between;align-items:center" onclick={() => bindDocToQuestion(cd)}>
                <span style="font-size:12px;font-weight:600;color:var(--lv-text)">{cd.title}</span>
                <span class="lv-muted" style="font-size:10.5px">{cd.hpath}</span>
              </button>
            {/each}
          {/if}
        </div>
      </div>
    {/if}
    {#if q.occlusion}
      <div class="lv-occlusion-wrap" style="margin:8px 0 12px;border-radius:var(--lv-r-2, 10px);overflow:hidden;border:1px solid var(--lv-border-subtle);max-width:440px">
        {@html renderOcclusionSvg(q.occlusion, { activeMaskId: q.occlusion.activeMaskId, revealedMaskIds: !peekHideAnswer ? [q.occlusion.activeMaskId || ""] : [] })}
      </div>
    {/if}
    {#if q.studyMeta?.phonetic}
      <div class="lv-phonetic-badge" style="margin:6px 0 10px;display:inline-flex;align-items:center;gap:6px;padding:3px 12px;border-radius:var(--lv-radius-pill, 9999px);background:var(--lv-surface-2);border:1px solid var(--lv-border-subtle);font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;color:var(--lv-brand)">
        <Icon name="volume" size={12} />
        <span>注音 / 粤拼：{q.studyMeta.phonetic}</span>
        <button type="button" class="lv-btn sm lv-btn--ghost" style="padding:1px 6px;font-size:11px;display:inline-flex;align-items:center;gap:4px" onclick={() => onttsSpeak([q.stem, ...q.options].join(" "), q.studyMeta?.lang ? { lang: q.studyMeta.lang } : 1)} title="听发音朗读"><Icon name="volume" size={11} /> 听发音</button>
      </div>
    {/if}

    <!-- 只读模式下的标准答案与解析卡片（置顶在题干与选项上方） -->
    {#if editingId !== q.id}
      <div class="lv-peek-answer-card" style="margin:10px 0 12px;padding:12px 16px;background:color-mix(in srgb, var(--lv-brand-soft) 35%, var(--lv-surface));border-left:4px solid var(--lv-brand);border-radius:var(--lv-r-2);box-shadow:var(--lv-sh-1)">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
          <div style="display:flex;align-items:center;gap:8px">
            <span class="lv-achievement-pill lv-achievement-pill--seal" style="font-size:11px;padding:2px 8px;font-weight:700">
              <Icon name="check" size={12} /> 参考答案
            </span>
            <strong class="num" style="font-size:16px;color:var(--lv-brand);letter-spacing:0.5px">
              {#if !peekHideAnswer}
                {q.answer || "未设答案"}
              {:else}
                ••••（已遮挡自测）
              {/if}
            </strong>
          </div>
          <button type="button" class="lv-btn sm lv-btn--ghost" onclick={ontoggleHideAnswer} title="切换答案显隐（自测翻看）" style="font-size:11px">
            <Icon name={peekHideAnswer ? "eye" : "eyeoff"} size={12} /> {peekHideAnswer ? "揭晓答案" : "遮挡自测"}
          </button>
        </div>
        {#if !peekHideAnswer && q.analysis}
          <div style="font-size:12.5px;line-height:1.6;color:var(--lv-text-2);margin-top:6px;padding-top:6px;border-top:1px solid var(--lv-border-subtle)">
            <b>💡 试题解析：</b>{q.analysis}
          </div>
        {/if}
      </div>

      <!-- 选择题选项列表完整呈现（A/B/C/D 逐行渲染并高亮正确项） -->
      {#if q.options && q.options.length > 0}
        <div class="lv-peek-options" style="display:grid;gap:8px;margin:10px 0 14px">
          {#each q.options as opt, oi (oi)}
            {@const letter = String.fromCharCode(65 + oi)}
            {@const isCorrect = q.answer && q.answer.includes(letter)}
            <div class="lv-peek-opt-row" style="display:flex;align-items:flex-start;gap:10px;padding:9px 12px;border-radius:var(--lv-r-2);border:1px solid {isCorrect && !peekHideAnswer ? 'var(--lv-brand)' : 'var(--lv-border-subtle)'};background:{isCorrect && !peekHideAnswer ? 'color-mix(in srgb, var(--lv-brand-soft) 30%, var(--lv-surface))' : 'var(--lv-surface)'};transition:all var(--lv-dur-micro) ease">
              <span class="lv-opt-letter" style="display:grid;place-items:center;width:24px;height:24px;border-radius:6px;background:{isCorrect && !peekHideAnswer ? 'var(--lv-brand)' : 'var(--lv-surface-2)'};color:{isCorrect && !peekHideAnswer ? 'var(--lv-on-brand, #fff)' : 'var(--lv-text-2)'};font-weight:700;font-size:12px;flex-shrink:0">
                {letter}
              </span>
              <span style="font-size:13.5px;line-height:1.55;color:var(--lv-text);flex:1">{opt}</span>
              {#if isCorrect && !peekHideAnswer}
                <span class="lv-chip lv-chip--grn num sm" style="font-size:10px;padding:1px 6px">正确项</span>
              {/if}
            </div>
          {/each}
        </div>
      {/if}
    {/if}

    <div class="lv-detail">
      {#if editingId === q.id && editDraft}
        <div class="lv-row" style="margin:2px 0"><b>{t("edit.title")}</b><span class="lv-chip">{t("qtype." + q.type)}</span></div>
        <textarea class="lv-input lv-textarea" rows="3" bind:value={editDraft.stem} placeholder={t("manual.stemPlaceholder")} aria-label={t("manual.stem")}></textarea>
        {#if editDraft.options.length}
          {#each editDraft.options as _o, oi (oi)}
            <div class="lv-row" style="margin:4px 0">
              <span class="lv-chip">{String.fromCharCode(65 + oi)}</span>
              <input class="lv-input" bind:value={editDraft.options[oi]} aria-label={`选项 ${String.fromCharCode(65 + oi)}`} />
              <button class="lv-btn sm lv-btn--ghost" aria-label={`${t("manual.removeOption", "删除选项")} ${String.fromCharCode(65 + oi)}`} title={`${t("manual.removeOption", "删除选项")} ${String.fromCharCode(65 + oi)}`} onclick={() => { const next = removeChoiceOption(q.type, editDraft!.options, editDraft!.answer, oi); editDraft = { ...editDraft!, ...next }; }}><Icon name="close" size={12} /></button>
            </div>
          {/each}
        {/if}
        {#if q.type === "single" || q.type === "multiple"}
          <button class="lv-btn sm lv-btn--ghost" onclick={() => { editDraft!.options.push(""); editDraft = { ...editDraft! }; }} style="display:inline-flex;align-items:center;gap:4px"><Icon name="plus" size={11} /> {t("manual.addOption")}</button>
        {/if}
        <div class="lv-row lv-peek-edit-meta" style="margin:6px 0">
          <label class="lv-muted" for="lv-edit-answer">{t("browse.answer")}</label>
          <input id="lv-edit-answer" class="lv-input" style="max-width:180px" bind:value={editDraft.answer} placeholder={q.type === "judge" ? "对/错" : q.type === "multiple" ? "AB/ABC" : ""} />
          <label class="lv-muted" for="lv-edit-kp">{t("manual.kp")}</label>
          <input id="lv-edit-kp" class="lv-input" style="max-width:180px" bind:value={editDraft.kp} />
          <label class="lv-muted" for="lv-edit-diff">{t("batch.field.difficulty")}</label>
          <select id="lv-edit-diff" class="lv-select" bind:value={editDraft.difficulty}>
            <option value="">—</option>
            {#each [1, 2, 3, 4, 5] as d, _i (_i)}<option value={String(d)}>{d}</option>{/each}
          </select>
          <label class="lv-muted" for="lv-edit-status">{t("browse.lifecycle")}</label>
          <select id="lv-edit-status" class="lv-select" bind:value={editDraft.status}>
            <option value="published">{t("lifecycle.published")}</option>
            <option value="review">{t("lifecycle.review")}</option>
            <option value="draft">{t("lifecycle.draft")}</option>
            <option value="deprecated">{t("lifecycle.deprecated")}</option>
          </select>
        </div>
        {#if q.type === "fill"}
          <div class="lv-row" style="margin:6px 0 4px">
            <button class="lv-btn sm lv-btn--ghost" aria-expanded={editSpecOpen} onclick={() => (editSpecOpen = !editSpecOpen)} style="display:inline-flex;align-items:center;gap:4px">
              <Icon name="edit" size={12} />
              <span>{t("spec.authorSection")}</span>
              <Icon name={editSpecOpen ? "arrow-down" : "chev-right"} size={10} />
            </button>
          </div>
          {#if editSpecOpen}
            <div class="lv-row lv-peek-spec-row" style="margin:4px 0 0;align-items:flex-end">
              <label class="lv-field" style="max-width:140px"><span class="lv-muted">{t("spec.unit")}</span>
                <input class="lv-input" bind:value={editSpecUnit} placeholder="m/s" aria-label={t("spec.unit")} />
              </label>
              <label class="lv-field" style="max-width:130px"><span class="lv-muted">{t("spec.absTol")}</span>
                <input class="lv-input num" bind:value={editSpecAbsTol} placeholder="0.5" inputmode="decimal" aria-label={t("spec.absTol")} />
              </label>
              <label class="lv-field" style="max-width:130px"><span class="lv-muted">{t("spec.relPct")}</span>
                <input class="lv-input num" bind:value={editSpecRelPct} placeholder="5" inputmode="decimal" aria-label={t("spec.relPct")} />
              </label>
              <label class="lv-field" style="flex:1;min-width:160px"><span class="lv-muted">{t("spec.altUnits")}</span>
                <input class="lv-input" bind:value={editSpecAltUnits} placeholder="km/h, cm/s" aria-label={t("spec.altUnits")} />
              </label>
            </div>
          {/if}
        {/if}
        <textarea class="lv-input lv-textarea" rows="2" bind:value={editDraft.analysis} placeholder={t("manual.analysis")} aria-label={t("manual.analysis")}></textarea>
        {#if editError}<div class="lv-error" role="alert">{editError}</div>{/if}
        <div class="lv-row">
          <button class="lv-btn lv-btn--primary sm" disabled={editBusy || offline} aria-busy={editBusy} onclick={() => onsaveEdit(q)}>
            {editBusy ? "…" : t("edit.save")}
          </button>
          <button class="lv-btn sm lv-btn--ghost" onclick={oncloseEdit}>{t("edit.cancel")}</button>
          {#if offline}<span class="lv-chip lv-chip--amb">{t("state.offlineHint")}</span>{/if}
        </div>
      {:else}
        {@const st = app.derived().byQuestion.get(q.id)}
        {@const wr = app.derived().wrongbook.get(q.id)}
        {#if st && st.attempts}
          {@const stubborn = wr ? isStubbornWrong(wr) : false}
          {@const isArchived = app?.isWrongArchived(q.id)}
          <div class="lv-row" style="margin:6px 0 2px;align-items:center;justify-content:space-between;flex-wrap:wrap">
            <div class="lv-muted num" role="status" style="display:inline-flex;align-items:center;gap:6px;flex-wrap:wrap">
              <span class="lv-chip lv-chip--data sm num" title={t("browse.usage").replace("{a}", String(st.attempts)).replace("{c}", String(Math.round((st.correct / st.attempts) * 100)))}>
                <Icon name="chart" size={11} /> {t("browse.usage").replace("{a}", String(st.attempts)).replace("{c}", String(Math.round((st.correct / st.attempts) * 100)))}
              </span>
              {#if wr}<span class="lv-chip lv-chip--red sm num">{t("browse.wrongCount").replace("{n}", String(wr.wrongCount))}</span>{/if}
              <span>· {new Date(st.lastAt).toLocaleDateString()}</span>
              {#if stubborn}
                <span class="lv-chip lv-chip--amb sm" title={wr ? getStubbornRemediation(wr).reasonText : ""}>
                  <Icon name="flame" size={11} /> {t("wrongbook.stubbornBadge")}
                </span>
              {/if}
              {#if isArchived}
                <span class="lv-chip sm">{t("wrongbook.tabArchived")}</span>
              {/if}
            </div>
            <div class="lv-row" style="margin:0;gap:4px">
              {#if stubborn && !isArchived}
                <button class="lv-btn sm lv-btn--ghost" onclick={() => onsnoozeWrong(q.id, 7)} title={t("wrongbook.snooze7")}>
                  <Icon name="clock" size={11} /> {t("wrongbook.snooze7")}
                </button>
                <button class="lv-btn sm lv-btn--ghost" onclick={() => onarchiveWrong(q.id)} title={t("wrongbook.archiveTip")}>
                  <Icon name="folder" size={11} /> {t("wrongbook.archive")}
                </button>
              {:else if isArchived}
                <button class="lv-btn sm lv-btn--ghost" onclick={() => onunarchiveWrong(q.id)} title={t("wrongbook.unarchive")}>
                  <Icon name="rotate" size={11} /> {t("wrongbook.unarchive")}
                </button>
              {/if}
              <button class="lv-btn sm lv-btn--ghost" onclick={() => ontoggleItemAnalysis(q)} title={t("browse.itemAnalysis")} aria-expanded={itemAnalysisOpenFor === q.id}>
                <Icon name="chart" size={12} /> {t("browse.itemAnalysis")}
              </button>
            </div>
          </div>
          {#if itemAnalysisOpenFor === q.id && itemAnalysisReport}
            <div class="lv-detail" style="margin:4px 0 8px;padding:8px 12px;background:var(--lv-surface-2);border-radius:var(--lv-r-2, 10px);border:1px solid var(--lv-border-subtle)">
              <div class="lv-row" style="justify-content:space-between;align-items:center">
                <b>{t("browse.itemAnalysis")}</b>
                <button class="lv-btn sm lv-btn--ghost" onclick={() => ondownloadItemAnalysisCsv(itemAnalysisReport!)} style="display:inline-flex;align-items:center;gap:4px">
                  <Icon name="export" size={12} />
                  <span>{t("browse.exportItemAnalysis")}</span>
                </button>
              </div>
              {#if itemAnalysisReport.isLowSample}
                <div class="lv-chip lv-chip--amb sm" style="margin:4px 0" role="status">
                  <Icon name="alert-triangle" size={11} /> {t("browse.lowSample")}
                </div>
              {/if}
              <div class="lv-row num" style="margin:4px 0;gap:8px;font-size:var(--lv-font-size-caption)">
                <span>{t("browse.avgTime")}: {(itemAnalysisReport.avgTimeMs / 1000).toFixed(1)}s</span>
                <span>{t("browse.skipRate")}: {itemAnalysisReport.skipRate}%</span>
              </div>
              {#if itemAnalysisReport.options.length}
                <div class="lv-col" style="gap:4px;margin-top:6px">
                  <div class="lv-muted" style="font-size:var(--lv-font-size-caption)">{t("browse.optionDist")}:</div>
                  {#each itemAnalysisReport.options as opt (opt.letter)}
                    <div class="lv-row" style="margin:2px 0;align-items:center;gap:6px;font-size:var(--lv-font-size-caption)">
                      <span class="lv-chip sm" class:lv-chip--grn={opt.isCorrect} class:lv-chip--acc={!opt.isCorrect}>
                        {opt.letter}
                      </span>
                      <div style="flex:1;min-width:80px;height:6px;background:var(--lv-surface-2);border-radius:var(--lv-radius-pill);overflow:hidden">
                        <div style="height:100%;width:{opt.pct}%;background:{opt.isCorrect ? 'var(--lv-green)' : 'var(--lv-data-accent)'};border-radius:var(--lv-radius-pill)"></div>
                      </div>
                      <span class="num lv-muted" style="min-width:38px">{opt.pct}%</span>
                      <span class="num lv-muted">({opt.count})</span>
                      {#if opt.isDeadDistractor}
                        <span class="lv-chip lv-chip--amb sm" title={t("browse.deadDistractor")}>0%</span>
                      {/if}
                    </div>
                  {/each}
                </div>
              {/if}
            </div>
          {/if}
          <div class="lv-row" style="margin:4px 0 0">
            <button class="lv-btn sm lv-btn--ghost" aria-expanded={revOpenFor === q.id} aria-busy={revLoadingFor === q.id || revRestoreKey.startsWith(`${q.id}#`)} disabled={!!revLoadingFor || !!revRestoreKey} onclick={() => ontoggleRevisions(q.id)} style="display:inline-flex;align-items:center;gap:4px">
              <Icon name="pencil" size={12} />
              <span>{revLoadingFor === q.id ? t("rev.loading") : t("rev.drill")}{#if revOpenFor === q.id && revLoaded[q.id] !== undefined}（<span class="num">{revList(q.id).length}</span>）{/if}</span>
              <Icon name={revOpenFor === q.id ? "arrow-down" : "chev-right"} size={10} />
            </button>
          </div>
          {#if revOpenFor === q.id}
            <div class="lv-row" style="flex-direction:column;align-items:stretch;gap:var(--lv-space-1);margin:4px 0 0">
              {#if revLoadingFor === q.id}
                <span class="lv-muted" role="status" aria-live="polite">{t("rev.loading")}</span>
              {:else if revLoadError[q.id]}
                <div class="lv-error" role="alert" style="overflow-wrap:anywhere">{t("rev.loadFailed").replace("{message}", revLoadError[q.id])}</div>
                <button class="lv-btn sm" disabled={!!revLoadingFor} onclick={() => onloadRevisions(q.id)}>{t("rev.retry")}</button>
              {:else}
                {#each revList(q.id) as r (r.ts)}
                  <div class="lv-error-row" style="white-space:normal;flex-wrap:wrap;gap:4px 6px;align-items:center">
                    <b class="num">{new Date(r.ts).toLocaleString()}</b>
                    {#if r.changedFields?.length}
                      {#each r.changedFields as f (f)}
                        <span class="lv-chip lv-chip--acc sm">
                          {f === "stem" ? t("rev.fieldStem") : f === "options" ? t("rev.fieldOptions") : f === "answer" ? t("rev.fieldAnswer") : f === "analysis" ? t("rev.fieldAnalysis") : f === "kp" ? t("rev.fieldKp") : f === "difficulty" ? t("rev.fieldDifficulty") : t("rev.specChanged")}
                        </span>
                      {/each}
                    {/if}
                    <span class="lv-muted num">{t("browse.answer")}: <b>{r.answer}</b></span>
                    {#if r.kp}<span class="lv-muted"> · {r.kp}</span>{/if}
                    <button type="button" class="lv-btn sm" style="padding:1px 6px;font-size:11px" onclick={() => activeDiffTs = activeDiffTs === r.ts ? null : r.ts} title="查看与当前最新试题内容的文字级 Diff 对比">
                      <Icon name="eye" size={11} /> {activeDiffTs === r.ts ? "收起差异" : "对比差异"}
                    </button>
                    {#if r.summary}<span class="lv-muted" style="font-size:var(--lv-font-size-caption);width:100%;display:inline-flex;align-items:center;gap:4px" title={r.summary}><Icon name="file-text" size={11} /> {r.summary}</span>{/if}
                    {#if revRestoreFailedKey === `${q.id}#${r.ts}`}<span class="lv-error" role="alert">{t("rev.restoreFailed").replace("{message}", revRestoreError[q.id])}</span><button class="lv-btn sm" disabled={!!revRestoreKey} onclick={() => onrestoreRevision(q, r)}>{t("rev.retry")}</button>{/if}
                    <button class="lv-btn sm lv-btn--ghost" style="margin-left:auto" disabled={!!revRestoreKey} aria-busy={revRestoreKey === `${q.id}#${r.ts}`} onclick={() => onrestoreRevision(q, r)}>{revRestoreKey === `${q.id}#${r.ts}` ? "…" : t("rev.restore")}</button>
                    {#if activeDiffTs === r.ts}
                      {@const stemDiff = computeTextDiff(r.stem || "", q.stem || "")}
                      {@const analysisDiff = computeTextDiff(r.analysis || "", q.analysis || "")}
                      <div class="lv-card" style="width:100%;padding:8px 10px;margin-top:6px;background:var(--lv-surface);border:1px solid var(--lv-border-subtle);border-radius:var(--lv-r-1, 6px);font-size:12px">
                        <b>题干差异对比（绿色为当前新增，红色为旧版删除）：</b>
                        <div style="line-height:1.6;margin:4px 0 8px">
                          {#each stemDiff as d, _di (_di)}
                            {#if d.op === "equal"}
                              <span>{d.text}</span>
                            {:else if d.op === "insert"}
                              <span class="lv-chip sm lv-chip--grn" style="padding:0 3px;text-decoration:none;font-weight:600">+{d.text}</span>
                            {:else if d.op === "delete"}
                              <span class="lv-chip sm lv-chip--red" style="padding:0 3px;text-decoration:line-through;opacity:0.8">-{d.text}</span>
                            {/if}
                          {/each}
                        </div>
                        {#if (r.analysis || q.analysis) && r.analysis !== q.analysis}
                          <b>解析差异对比：</b>
                          <div style="line-height:1.6;margin-top:4px">
                            {#each analysisDiff as d, _di (_di)}
                              {#if d.op === "equal"}
                                <span>{d.text}</span>
                              {:else if d.op === "insert"}
                                <span class="lv-chip sm lv-chip--grn" style="padding:0 3px;text-decoration:none;font-weight:600">+{d.text}</span>
                              {:else if d.op === "delete"}
                                <span class="lv-chip sm lv-chip--red" style="padding:0 3px;text-decoration:line-through;opacity:0.8">-{d.text}</span>
                              {/if}
                            {/each}
                          </div>
                        {/if}
                      </div>
                    {/if}
                  </div>
                {:else}
                  <span class="lv-muted num">{t("rev.empty")}</span>
                {/each}
              {/if}
            </div>
          {/if}
        {/if}
        <div class="lv-row" style="flex-wrap:wrap;gap:var(--lv-space-1)">
          <button class="lv-btn sm lv-btn--primary" onclick={() => ondrillSingle(q)} title={t("browse.drillSingleTip")}><Icon name="play" size={13} /> {t("browse.drillSingle")}</button>
          <button class="lv-btn sm" onclick={() => onopenEditForm(q)} style="display:inline-flex;align-items:center;gap:4px"><Icon name="edit" size={13} /> {t("edit.open")}</button>
          <button class="lv-btn sm lv-btn--ghost" onclick={() => oncloneToManualStudio(q)} title="基于此题克隆为变式题并进入手工录题台"><Icon name="layers" size={13} /> 衍生变式题</button>
          <button class="lv-btn sm lv-btn--ghost" class:acc-btn={isQuestionDisputed(q)} aria-expanded={disputeFormOpenFor === q.id} onclick={() => ontoggleDisputeForm(q)}>
            <Icon name="alert-triangle" size={13} /> {isQuestionDisputed(q) ? t("dispute.resolveAction") : t("dispute.flagAction")}
          </button>
          {#if status === "draft" || status === "review"}
            <button class="lv-btn sm lv-btn--primary" disabled={peekLifecycleBusy || offline} aria-busy={peekLifecycleBusy} onclick={() => onchangeLifecycle(q, "published")}>
              <Icon name="check" size={12} /> {t("lifecycle.publishNow")}
            </button>
          {:else if status === "published"}
            <button class="lv-btn sm lv-btn--ghost" disabled={peekLifecycleBusy || offline} aria-busy={peekLifecycleBusy} onclick={() => onchangeLifecycle(q, "review")}>
              {t("lifecycle.toReview")}
            </button>
            <button class="lv-btn sm lv-btn--ghost" disabled={peekLifecycleBusy || offline} aria-busy={peekLifecycleBusy} onclick={() => onchangeLifecycle(q, "deprecated")}>
              {t("lifecycle.deprecateNow")}
            </button>
          {:else if status === "deprecated"}
            <button class="lv-btn sm lv-btn--ghost" disabled={peekLifecycleBusy || offline} aria-busy={peekLifecycleBusy} onclick={() => onchangeLifecycle(q, "draft")}>
              {t("lifecycle.toDraft")}
            </button>
          {/if}
          <button class="lv-btn sm" onclick={(e) => onopenInSiYuan(q.rootId, q.blockId, { event: e })} disabled={!q.rootId && !q.blockId} title={q.blockId ? "在思源笔记中精准定位此题块并高亮聚焦（按住 Ctrl/Cmd 点击可在右侧分屏打开）" : t("browse.openDoc")}><Icon name="pin" size={13} /> {t("browse.openDoc")}</button>
          <button class="lv-btn sm" onclick={() => onloadBacklinks(q.blockId)} disabled={!app.kernelOnline || !!backlinkBusyFor} aria-busy={backlinkBusyFor === q.blockId} title={!app.kernelOnline ? t("state.offlineHint") : t("browse.backlinks")}><Icon name="link" size={13} /> {backlinkBusyFor === q.blockId ? t("browse.backlinkLoading") : t("browse.backlinks")}</button>
          {#if links}
            {#if links.length === 0}<span class="lv-muted">{t("browse.noBacklinks")}</span>
            {:else}{#each links as l, _i (_i)}<span class="lv-chip" title={l.content}><Icon name="paperclip" size={11} /> {l.title}</span>{/each}{/if}
          {/if}
        </div>
        {#if disputeFormOpenFor === q.id}
          <div class="lv-detail" style="margin:6px 0;background:var(--lv-surface-2);border-radius:var(--lv-r-2, 10px);padding:10px 12px;border:1px solid var(--lv-border-subtle)">
            <div class="lv-row" style="margin:0 0 6px;align-items:center;justify-content:space-between">
              <b style="font-size:var(--lv-font-size-sm)">
                <Icon name="alert-triangle" size={13} /> {isQuestionDisputed(q) ? t("dispute.resolveAction") : t("dispute.flagAction")}
              </b>
              <button class="lv-btn sm lv-btn--ghost" onclick={() => ontoggleDisputeForm(q)} aria-label="关闭"><Icon name="close" size={12} /></button>
            </div>
            {#if isQuestionDisputed(q)}
              <div class="lv-muted" style="margin:4px 0 8px;font-size:var(--lv-font-size-caption)">
                <b>{t("dispute.reason." + q.dispute?.reason)}</b> · {new Date(q.dispute?.at ?? Date.now()).toLocaleDateString()}: {q.dispute?.note}
              </div>
              <input class="lv-input" style="width:100%;margin:4px 0" bind:value={disputeResolution} placeholder={t("dispute.resolutionPlaceholder")} disabled={disputeBusy} />
              <div class="lv-row" style="margin-top:6px;gap:6px">
                <button class="lv-btn lv-btn--primary sm" disabled={disputeBusy || !disputeResolution.trim()} onclick={() => onsubmitResolveDispute(q)}>
                  {disputeBusy ? "…" : t("dispute.resolveBtn")}
                </button>
                <button class="lv-btn sm lv-btn--ghost" disabled={disputeBusy} onclick={() => onsubmitClearDispute(q)}>
                  {t("dispute.clearBtn")}
                </button>
              </div>
            {:else}
              <div class="lv-row" style="margin:4px 0 6px;gap:8px">
                <select class="lv-select" bind:value={disputeReason} disabled={disputeBusy}>
                  <option value="wrong_answer">{t("dispute.reason.wrong_answer")}</option>
                  <option value="multi_answer">{t("dispute.reason.multi_answer")}</option>
                  <option value="missing_condition">{t("dispute.reason.missing_condition")}</option>
                  <option value="expired_data">{t("dispute.reason.expired_data")}</option>
                  <option value="other">{t("dispute.reason.other")}</option>
                </select>
              </div>
              <textarea class="lv-input lv-textarea" rows="2" bind:value={disputeNote} placeholder={t("dispute.notePlaceholder")} disabled={disputeBusy}></textarea>
              <div class="lv-row" style="margin-top:6px;gap:6px">
                <button class="lv-btn lv-btn--primary sm" disabled={disputeBusy || !disputeNote.trim()} onclick={() => onsubmitFlagDispute(q)}>
                  {disputeBusy ? "…" : t("dispute.flagBtn")}
                </button>
                <button class="lv-btn sm lv-btn--ghost" disabled={disputeBusy} onclick={() => ontoggleDisputeForm(q)}>
                  {t("edit.cancel")}
                </button>
              </div>
            {/if}
            {#if disputeError}<div class="lv-error" role="alert" style="margin-top:4px">{disputeError}</div>{/if}
          </div>
        {/if}
        {#if peekLifecycleError[q.id]}
          <div class="lv-error" role="alert" style="margin:4px 0;overflow-wrap:anywhere">{peekLifecycleError[q.id]}</div>
        {/if}
        {#if backlinkError[q.blockId]}<div class="lv-error" role="alert" style="display:flex;align-items:center;justify-content:space-between;gap:var(--lv-space-relaxed);overflow-wrap:anywhere"><span>{backlinkError[q.blockId]}</span><button class="lv-btn sm" disabled={!!backlinkBusyFor || !app.kernelOnline} onclick={() => onloadBacklinks(q.blockId)}>{t("rev.retry")}</button></div>{/if}
        {#if qrefView[q.id]}
          <div class="lv-row lv-qref-bar" style="font-size:var(--lv-font-size-caption);padding:6px 10px;background:var(--lv-surface-2);border-radius:var(--lv-r-2, 10px);margin:6px 0;align-items:center;border:1px solid var(--lv-border-subtle)">
            <span class="lv-chip"><Icon name="file-text" size={11} /> {qrefView[q.id]!.title}{#if qrefView[q.id]!.label} · {qrefView[q.id]!.label}{/if}</span>
            {#if qrefView[q.id]!.stale}<span class="lv-chip lv-chip--amb" title={t("materials.relocateTip")}>{t("materials.relocate")}</span>{/if}
            <button class="lv-btn sm lv-btn--ghost" onclick={() => onopenQref(q.id)} style="display:inline-flex;align-items:center;gap:3px"><Icon name="external-link" size={11} /> {t("materials.openAt")}</button>
            <button class="lv-btn sm lv-btn--ghost" onclick={() => onstartQrefForm(q.id)}><Icon name="link" size={13} /> {t("qref.relink")}</button>
            <button class="lv-btn sm lv-btn--ghost" aria-label={t("qref.unlink")} title={t("qref.unlink")} disabled={qrefBusyFor === q.id} aria-busy={qrefBusyFor === q.id} onclick={() => onremoveQref(q.id)}>{#if qrefBusyFor === q.id}…{:else}<Icon name="close" size={12} />{/if}</button>
          </div>
          {#if qrefActionError[q.id]}<div class="lv-error" role="alert" style="overflow-wrap:anywhere">{qrefActionError[q.id]}</div>{/if}
        {:else}
          <div class="lv-row" style="font-size:var(--lv-font-size-caption)">
            <button class="lv-btn sm lv-btn--ghost" onclick={() => onstartQrefForm(q.id)}><Icon name="link" size={13} /> {t("qref.link")}</button>
          </div>
        {/if}
        {#if qrefFormFor === q.id}
          <div class="lv-detail" style="margin:4px 0">
            <div class="lv-row" style="flex-wrap:wrap">
              <select class="lv-select" bind:value={qrefMatId} aria-label={t("qref.pickMaterial")}>
                <option value="">{t("qref.pickMaterial")}</option>
                {#each app.listMaterials() as m (m.id)}<option value={m.id}>{m.title}</option>{/each}
              </select>
              <input class="lv-input" style="max-width:90px" placeholder={t("materials.page")} aria-label={t("materials.page")} bind:value={qrefPage} />
              <input class="lv-input" style="max-width:110px" placeholder="mm:ss" aria-label="时间点 (mm:ss)" bind:value={qrefTime} />
              <button class="lv-btn lv-btn--primary sm" onclick={() => onsaveQref(q.id)} disabled={!qrefMatId || !!qrefBusyFor} aria-busy={qrefBusyFor === q.id}>{qrefBusyFor === q.id ? "…" : t("qref.save")}</button>
              <button class="lv-btn sm lv-btn--ghost" onclick={() => (qrefFormFor = "")}>{t("edit.cancel")}</button>
            </div>
            {#if qrefError}<div class="lv-error" role="alert">{qrefError}</div>{/if}
          </div>
        {/if}
        {#if st && st.attempts}
          <div class="lv-row" style="font-size:var(--lv-font-size-caption)">
            <button class="lv-btn sm lv-btn--ghost" aria-expanded={receiptOpenFor === q.id} onclick={() => ontoggleReceipts(q.id)}>
              <Icon name="table" size={13} /> {t("receipt.title")}（<span class="num">{st.attempts}</span>）
            </button>
          </div>
          {#if receiptOpenFor === q.id}
            <div class="lv-detail" style="margin:4px 0">
              {#if receiptStored}
                <div class="lv-row" style="flex-wrap:wrap;margin:3px 0;gap:var(--lv-space-1);font-size:var(--lv-font-size-caption)">
                  <span class="lv-chip"><Icon name="flask" size={11} /> {t("receipt.lastHypothesis")} · {new Date(receiptStored.at).toLocaleDateString()}</span>
                  {#if receiptStored.adoptedAt}<span class="lv-chip lv-chip--grn">{t("receipt.adopted")}</span>{/if}
                </div>
                <div class="lv-muted" style="font-size:var(--lv-font-size-caption);white-space:pre-wrap;overflow-wrap:anywhere;margin:0 0 6px">{receiptStored.text}</div>
              {/if}
              {#each receiptCache as e (e.seq)}
                {@const rkey = `${e.qid}#${e.seq}`}
                {@const drifted = isAttemptVersionDrifted(e, q)}
                <div class="lv-row" style="flex-wrap:wrap;font-size:var(--lv-font-size-caption);margin:3px 0;gap:var(--lv-space-1)">
                  <span class="lv-chip num">{new Date(e.ts).toLocaleString()}</span>
                  <span class="lv-chip" style="display:inline-flex;align-items:center;gap:3px">
                    {#if e.verdict === "correct"}
                      <Icon name="check" size={11} />
                    {:else if e.verdict === "wrong"}
                      <Icon name="close" size={11} />
                    {:else}
                      <span>—</span>
                    {/if}
                  </span>
                  {#if e.myAnswer}<span class="lv-chip num">{t("session.myAnswer")}: {e.myAnswer}</span>{/if}
                  {#if drifted}
                    <span class="lv-chip lv-chip--amb sm" title={t("receipt.driftTip")} style="display:inline-flex;align-items:center;gap:4px">
                      <Icon name="pencil" size={11} />
                      <span>{t("receipt.drift")}{#if e.qVersion?.answer}（{t("receipt.origAnswer")}: {e.qVersion.answer}）{/if}</span>
                    </span>
                  {/if}
                  {#if e.confidence}<span class="lv-chip">{t("confidence." + e.confidence)}</span>{/if}
                  {#if e.help}<span class="lv-chip lv-chip--amb"><Icon name="bulb" size={11} /> {t("receipt.help")}</span>{/if}
                  {#if e.recall}<span class="lv-chip"><Icon name="eyeoff" size={11} /> {t("receipt.recall")}</span>{/if}
                  {#if e.timeMs}<span class="lv-chip num">{Math.round(e.timeMs / 1000)}s</span>{/if}
                  {#if e.verdict === "wrong"}
                    <button class="lv-btn sm lv-btn--ghost" disabled={receiptBusy === rkey} aria-busy={receiptBusy === rkey}
                      onclick={() => onrunReceiptMisdiagnosis(q, e)}><Icon name="flask" size={13} /> {receiptBusy === rkey ? "…" : t("misdiagnosis.ask")}</button>
                  {/if}
                  {#if receiptMisdiagnosis[rkey]}
                    <div class="lv-detail" style="width:100%;font-size:var(--lv-font-size-sm);white-space:pre-wrap;overflow-wrap:anywhere">
                      {receiptMisdiagnosis[rkey]}
                      {#if q.blockId}
                        <div class="lv-row" style="margin-top:6px;gap:6px">
                          <button
                            class="lv-btn sm lv-btn--ghost"
                            disabled={writeBackBusy === rkey || !app?.kernelOnline}
                            aria-busy={writeBackBusy === rkey}
                            onclick={() => void handleWriteBackNote(q, receiptMisdiagnosis[rkey], rkey)}
                            title="将本题 AI 错因推导回写至思源笔记文档原生子块"
                          >
                            <Icon name="file-text" size={12} />
                            <span>{writeBackBusy === rkey ? "回写中…" : writeBackSuccess[rkey] ? "已回写思源文档 ✔" : "回写思源文档"}</span>
                          </button>
                        </div>
                        {#if writeBackError[rkey]}
                          <div class="lv-error" role="alert" style="margin-top:4px">{writeBackError[rkey]}</div>
                        {/if}
                      {/if}
                    </div>
                  {/if}
                </div>
              {/each}
            </div>
          {/if}
        {/if}
        {#if flashError[q.id]}<div class="lv-error" role="alert">{flashError[q.id]}</div>{/if}
        <div class="lv-row" style="font-size:var(--lv-font-size-caption)">
          <button class="lv-btn sm lv-btn--ghost" disabled={flashBusy === q.id} aria-busy={flashBusy === q.id} onclick={() => onmakeFlashCandidates(q)}>
            <Icon name="layers" size={13} /> {flashBusy === q.id ? "…" : t("flash.ask")}
          </button>
          {#if flashCandidates[q.id]?.cards?.length}
            <span class="lv-chip num" title={flashCandidates[q.id]!.splitReason ?? ""}>{summarizeLoad(flashCandidates[q.id]!.cards)}</span>
          {/if}
        </div>
        {#if flashCandidates[q.id]?.cards?.length}
          <div class="lv-detail" style="margin:4px 0">
            {#each flashCandidates[q.id]!.cards as c, _ci (_ci)}
              <div class="lv-row" style="font-size:var(--lv-font-size-caption);margin:2px 0;align-items:flex-start;gap:var(--lv-space-1)">
                <span class="lv-chip">{t("flash.type." + c.type)}</span>
                <div style="flex:1;min-width:200px;overflow-wrap:anywhere">
                  <b>{c.front}</b>
                  <div class="lv-muted" style="display:inline-flex;align-items:center;gap:4px"><Icon name="chev-right" size={11} /> {c.back}</div>
                </div>
                <span class="lv-chip num">{c.source}</span>
              </div>
            {/each}
            <div class="lv-row">
              <button class="lv-btn lv-btn--primary sm" disabled={flashBusy === q.id} aria-busy={flashBusy === q.id} onclick={() => onconfirmFlashCards(q)}>
                {t("flash.confirm").replace("{n}", String(flashCandidates[q.id]!.cards.length))}
              </button>
              <button class="lv-btn sm lv-btn--ghost" onclick={() => { flashCandidates = { ...flashCandidates, [q.id]: { cards: [] } }; }}>{t("edit.cancel")}</button>
            </div>
          </div>
        {/if}
      {/if}
    </div>
  </div>
  <footer class="lv-peek-footer">
    <button class="lv-btn lv-btn--primary sm" onclick={() => onstartSingleById(q.id)} style="display:inline-flex;align-items:center;gap:4px">
      <Icon name="play" size={13} /> {t("browse.practiceOne", "只练这道题")}
    </button>
    {#if editingId !== q.id}
      <button class="lv-btn sm" onclick={() => onopenEditForm(q)} style="display:inline-flex;align-items:center;gap:4px">
        <Icon name="edit" size={13} /> {t("edit.open", "编辑题目")}
      </button>
    {/if}
    <button class="lv-btn sm lv-btn--ghost" onclick={onclose}>
      {t("dialog.close", "关闭")}
    </button>
  </footer>
</div>

<style>
  @container lv-exam (max-width: 680px) {
    .lv-peek-edit-meta,
    .lv-peek-spec-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: 6px;
    }
    .lv-peek-edit-meta .lv-input,
    .lv-peek-edit-meta .lv-select,
    .lv-peek-spec-row .lv-field,
    .lv-peek-spec-row .lv-input {
      max-width: 100% !important;
      width: 100%;
    }
  }
  @media (max-width: 680px) {
    .lv-peek-edit-meta,
    .lv-peek-spec-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: 6px;
    }
    .lv-peek-edit-meta .lv-input,
    .lv-peek-edit-meta .lv-select,
    .lv-peek-spec-row .lv-field,
    .lv-peek-spec-row .lv-input {
      max-width: 100% !important;
      width: 100%;
    }
  }
</style>
