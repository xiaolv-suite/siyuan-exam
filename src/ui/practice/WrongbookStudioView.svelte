<script lang="ts">
  import Icon from "../shared/Icon.svelte";
  import type { Question } from "../../core/types";
  import type { CbmSignal } from "../../core/cbm";
  import { handleTablistKeydown } from "./services/practiceKeyboardService";
  import PaperPresentationModal from "../shared/PaperPresentationModal.svelte";
  import PaperAssembleModal from "./PaperAssembleModal.svelte";
  import { showExamNotice } from "../../libs/notice";

  interface Props {
    wrongList: any[];
    eliminatedCount: number;
    clearPct: number;
    streakDays: number;
    reasonCounts: { unknown: number; careless: number; trap: number; unmarked: number };
    wbTab: "active" | "archived" | "eliminated" | "highrisk" | "fragile" | "ebbinghaus";
    wbReasonFilter: "all" | "careless" | "unknown" | "trap";
    wbFilterStubborn: boolean;
    wbKpOptions: string[];
    wbKpFilter: string;
    wbTagOptions?: string[];
    wbTagFilter?: string;
    wbDocOptions?: Array<{ docId: string; label: string; count: number }>;
    wbDocFilter?: string;
    wbSortMode: "default" | "wrongCount" | "kp";
    filteredWrongQueue: any[];
    /** 渲染切片（ux §3 virtualize-lists 口径）：只渲染前 200 行，「加载更多」逐步放量；计数与操作按钮仍按全量 */
    shownWrongQueue: any[];
    wbQueueHasMore: boolean;
    onloadMoreWbQueue: () => void;
    archivedWrongList: any[];
    eliminatedWrongList: any[];
    /** benchmark-fusion CBM 双维信号：高危盲区（自评确定却答错，最新态）与脆弱伪掌握（模糊/猜测却蒙对） */
    cbmHighrisk: CbmSignal[];
    cbmFragile: CbmSignal[];
    cbmHighriskQids: ReadonlySet<string>;
    wrongQueue: any[];
    effectiveEliminateStreak: number;
    printWrongBusy: boolean;
    cheatSheetBusy: boolean;
    hasCardsPlugin: boolean;
    wrongBusyId: string;
    cramCount: number;
    bulkMasterBusy: boolean;
    questionMap: Map<string, Question>;
    t: (k: string, fb?: string) => string;
    reasonOf: (qid: string) => string;
    isStubbornWrong: (w: any) => boolean;
    getStubbornRemediation: (w: any) => { reasonText: string };
    onstartDrill: (mode: "quick" | "wrong" | "cram") => void;
    onbackToEntry: () => void;
    onprintWrongSheet: (kind: "retest" | "question" | "answer" | "interactive") => void;
    onexportCheatSheet: () => void;
    onsaveWrongbookAsDoc: () => void;
    onsyncWrongbookToCards: () => void;
    onlaunchWrongbookMockExam: () => void;
    onstartFilteredWrongDrill: () => void;
    onstartWrongFor: (qid: string) => void;
    onsyncSingleWrongToCard: (qid: string) => void;
    ontraceMotherQuestion: (q: Question) => void;
    ondrillVariantFor: (q: Question) => void;
    onsnoozeWrong: (qid: string, days: number) => void;
    onarchiveWrong: (qid: string) => void;
    onstartSameKpFor: (qid: string) => void;
    onmasterWrong: (qid: string) => void;
    onrestoreWrongToActive: (qid: string) => void;
    onunarchiveWrong: (qid: string) => void;
    onmasterAllWrong: () => void;
    onbrowseWrongFilter: () => void;
    onchangeWbSortMode: (val: string) => void;
    onstartCbmDrill?: (kind: "highrisk" | "fragile") => void;
    onstartCustomDrill?: (qids: string[]) => void;
    onopenInSiYuan?: (rootId: string, blockId?: string, opt?: any) => void;
    ontracebackBlock?: (blockId: string, rootId?: string) => void;
    ondiagnosePrereqs?: (q: Question) => void;
    oneditReflection?: (qid: string) => void;
    reflections?: Record<string, { text: string; at: number }>;
    lastSavedWrongbookDoc?: { docId: string; title: string } | null;
  }

  let {
    wrongList,
    eliminatedCount,
    clearPct,
    streakDays,
    reasonCounts,
    wbTab = $bindable(),
    wbReasonFilter = $bindable(),
    wbFilterStubborn = $bindable(),
    wbKpOptions,
    wbKpFilter = $bindable(),
    wbTagOptions = [],
    wbTagFilter = $bindable(""),
    wbDocOptions = [],
    wbDocFilter = $bindable(""),
    wbSortMode = $bindable(),
    filteredWrongQueue,
    shownWrongQueue,
    wbQueueHasMore,
    onloadMoreWbQueue,
    archivedWrongList,
    eliminatedWrongList,
    cbmHighrisk,
    cbmFragile,
    cbmHighriskQids,
    wrongQueue,
    effectiveEliminateStreak,
    printWrongBusy,
    cheatSheetBusy,
    hasCardsPlugin,
    wrongBusyId,
    cramCount,
    bulkMasterBusy,
    questionMap,
    t,
    reasonOf,
    isStubbornWrong,
    getStubbornRemediation,
    onstartDrill,
    onbackToEntry,
    onprintWrongSheet,
    onexportCheatSheet,
    onsaveWrongbookAsDoc,
    onsyncWrongbookToCards,
    onlaunchWrongbookMockExam,
    onstartFilteredWrongDrill,
    onstartWrongFor,
    onsyncSingleWrongToCard,
    ontraceMotherQuestion,
    ondrillVariantFor,
    onsnoozeWrong,
    onarchiveWrong,
    onstartSameKpFor,
    onmasterWrong,
    onrestoreWrongToActive,
    onunarchiveWrong,
    onmasterAllWrong,
    onbrowseWrongFilter,
    onchangeWbSortMode,
    onstartCbmDrill,
    onstartCustomDrill,
    onopenInSiYuan,
    ontracebackBlock,
    ondiagnosePrereqs,
    oneditReflection,
    reflections = {},
    lastSavedWrongbookDoc = null,
  }: Props = $props();

  const qOf = (qid: string) => questionMap.get(qid);
  const totalWrongs = $derived(Math.max(1, wrongList.length));
  const hasAnyWrongbookItems = $derived(
    wrongList.length > 0 ||
    archivedWrongList.length > 0 ||
    eliminatedWrongList.length > 0 ||
    cbmHighrisk.length > 0 ||
    cbmFragile.length > 0,
  );

  const now = Date.now();
  const ebbinghausBuckets = $derived.by(() => {
    const b1: any[] = [];
    const b3: any[] = [];
    const b7: any[] = [];
    const b15: any[] = [];
    for (const w of wrongQueue) {
      const days = Math.max(0, (now - (w.lastWrongAt || now)) / 86400000);
      if (days <= 1) b1.push(w);
      else if (days <= 3) b3.push(w);
      else if (days <= 7) b7.push(w);
      else b15.push(w);
    }
    return [
      { id: "1d", title: "急救挽回 (≤1天)", subtitle: "艾宾浩斯黄金抢救期", items: b1, tone: "red" },
      { id: "3d", title: "临界拐点 (2-3天)", subtitle: "记忆断层衰减临界点", items: b3, tone: "amber" },
      { id: "7d", title: "深层巩固 (4-7天)", subtitle: "中期记忆强化转折期", items: b7, tone: "accent" },
      { id: "15d", title: "抗遗忘固化 (>7天)", subtitle: "长期记忆固化回炉期", items: b15, tone: "data" },
    ];
  });

  let wrongPrintFormat = $state<"retest" | "question" | "answer" | "interactive" | "cheat">("retest");
  let presentationOpen = $state(false);
  let wbAssembleOpen = $state(false);
  let wbAssembleQuestions = $state<Question[]>([]);

  function openWrongbookAssemble() {
    const qs = filteredWrongQueue.map((w) => questionMap.get(w.qid)).filter((q): q is Question => !!q);
    if (!qs.length) return;
    wbAssembleQuestions = qs;
    wbAssembleOpen = true;
  }

  function handlePrintWrongFormat() {
    if (wrongPrintFormat === "cheat") {
      onexportCheatSheet();
    } else {
      onprintWrongSheet(wrongPrintFormat);
    }
  }
</script>

<div class="lv-pad">
  <div class="lv-screen-head">
    <span class="lv-eyebrow">WRONG BOOK</span>
    <h1 class="lv-h1">{t("wrongbook.title")}</h1>
    <p>{t("wrongbook.desc").replace("{n}", String(effectiveEliminateStreak))}</p>
  </div>
  {#if !hasAnyWrongbookItems}
    <div class="lv-empty">
      <div class="lv-empty-icon"><Icon name="check" size={26} /></div>
      <b>{t("wrongbook.emptyTitle")}</b>
      <p class="lv-muted">{t("wrongbook.emptyDesc")}</p>
      <div class="lv-row" style="justify-content:center;margin-top:18px">
        <button class="lv-btn lv-btn--primary" onclick={() => void onstartDrill("quick")}><Icon name="zap" size={15} /> {t("mode.quick")}</button>
        <button class="lv-btn" onclick={onbackToEntry}><Icon name="home" size={15} /> {t("session.back")}</button>
      </div>
    </div>
  {:else}
    <div class="lv-metrics-bar">
      <div class="lv-metric-item">
        <div class="lv-metric-lbl"><Icon name="xcircle" size={13} /><span>{t("wrongbook.metric.active")}</span></div>
        <div class="lv-metric-val">{wrongList.length}</div>
        <span class="lv-muted" style="font-size:var(--lv-font-size-xs)">{t("wrongbook.metric.active.note")}</span>
      </div>
      <div class="lv-metric-item">
        <div class="lv-metric-lbl"><Icon name="check" size={13} /><span>{t("wrongbook.metric.eliminated")}</span></div>
        <div class="lv-metric-val">{eliminatedCount}</div>
        <span class="lv-muted" style="font-size:var(--lv-font-size-xs)">{t("wrongbook.metric.eliminated.note")}</span>
      </div>
      <div class="lv-metric-item">
        <div class="lv-metric-lbl"><Icon name="target" size={13} /><span>{t("wrongbook.metric.progress")}</span></div>
        <div class="lv-metric-val">{clearPct}%</div>
        <span class="lv-muted" style="font-size:var(--lv-font-size-xs)">{t("wrongbook.metric.progress.note")}</span>
      </div>
      <div class="lv-metric-item">
        <div class="lv-metric-lbl"><Icon name="flame" size={13} /><span>{t("widget.streak")}</span></div>
        <div class="lv-metric-val">{streakDays} <span style="font-size:16px;font-weight:600">{t("entry.days")}</span></div>
        <span class="lv-muted" style="font-size:var(--lv-font-size-xs)">{t("widget.streak.note")}</span>
      </div>
    </div>
    <div class="lv-shell-grid">
      <div class="stack">
        <div class="lv-card">
          <b class="lv-block-title">{t("wrongbook.progress")}</b>
          <div class="lv-row" style="justify-content:space-between;margin:4px 0 8px">
            <strong class="num" style="font-size:22px;color:var(--lv-data-accent)">{clearPct}%</strong>
            <span class="lv-chip lv-chip--amb num">{t("wrongbook.eliminated.note").replace("{e}", String(eliminatedCount)).replace("{a}", String(wrongList.length))}</span>
          </div>
          <div class="lv-progress"><i style="width:{clearPct}%;background:var(--lv-data-accent)"></i></div>
          <div class="divider" style="margin:16px 0 12px"></div>
          <b class="lv-block-title">{t("wrongbook.reasons")}</b>
          <!-- 多段全圆角比例条（一目了然看清错因结构） -->
          <div style="display:flex;height:8px;border-radius:var(--lv-radius-pill);overflow:hidden;background:var(--lv-border-subtle);margin:8px 0 12px;gap:2px">
            {#if reasonCounts.unknown > 0}
              <div style="flex:{reasonCounts.unknown};background:var(--lv-red);border-radius:var(--lv-radius-pill)" title={`${t("reason.unknown")}: ${reasonCounts.unknown} (${Math.round(reasonCounts.unknown/totalWrongs*100)}%)`}></div>
            {/if}
            {#if reasonCounts.careless > 0}
              <div style="flex:{reasonCounts.careless};background:var(--lv-amber);border-radius:var(--lv-radius-pill)" title={`${t("reason.careless")}: ${reasonCounts.careless} (${Math.round(reasonCounts.careless/totalWrongs*100)}%)`}></div>
            {/if}
            {#if reasonCounts.trap > 0}
              <div style="flex:{reasonCounts.trap};background:var(--lv-accent);border-radius:var(--lv-radius-pill)" title={`${t("reason.trap")}: ${reasonCounts.trap} (${Math.round(reasonCounts.trap/totalWrongs*100)}%)`}></div>
            {/if}
            {#if reasonCounts.unmarked > 0}
              <div style="flex:{reasonCounts.unmarked};background:var(--lv-text-3);border-radius:var(--lv-radius-pill)" title={`${t("reason.unmarked")}: ${reasonCounts.unmarked} (${Math.round(reasonCounts.unmarked/totalWrongs*100)}%)`}></div>
            {/if}
          </div>
          <div class="lv-chart-row">
            <span class="lv-row" style="align-items:center;gap:6px">
              <span class="lv-dot" style="background:var(--lv-red)"></span>
              <span>{t("reason.unknown")}</span>
            </span>
            <div class="lv-progress"><i style="width:{Math.round((reasonCounts.unknown / Math.max(1, wrongList.length)) * 100)}%;background:var(--lv-red)"></i></div>
            <strong class="num">{reasonCounts.unknown}</strong>
          </div>
          <div class="lv-chart-row">
            <span class="lv-row" style="align-items:center;gap:6px">
              <span class="lv-dot" style="background:var(--lv-amber)"></span>
              <span>{t("reason.careless")}</span>
            </span>
            <div class="lv-progress"><i style="width:{Math.round((reasonCounts.careless / Math.max(1, wrongList.length)) * 100)}%;background:var(--lv-amber)"></i></div>
            <strong class="num">{reasonCounts.careless}</strong>
          </div>
          <div class="lv-chart-row">
            <span class="lv-row" style="align-items:center;gap:6px">
              <span class="lv-dot" style="background:var(--lv-accent)"></span>
              <span>{t("reason.trap")}</span>
            </span>
            <div class="lv-progress"><i style="width:{Math.round((reasonCounts.trap / Math.max(1, wrongList.length)) * 100)}%;background:var(--lv-accent)"></i></div>
            <strong class="num">{reasonCounts.trap}</strong>
          </div>
          <div class="lv-chart-row">
            <span class="lv-row" style="align-items:center;gap:6px">
              <span class="lv-dot" style="background:var(--lv-text-3)"></span>
              <span>{t("reason.unmarked")}</span>
            </span>
            <div class="lv-progress"><i style="width:{Math.round((reasonCounts.unmarked / Math.max(1, wrongList.length)) * 100)}%;background:var(--lv-text-3)"></i></div>
            <strong class="num">{reasonCounts.unmarked}</strong>
          </div>
          <p class="lv-muted" style="font-size:var(--lv-font-size-caption);margin:6px 0 0">{t("wrongbook.reasons.note")}</p>
        </div>
        <div class="lv-card">
          <div class="lv-row" style="justify-content:space-between;align-items:center;margin:0 0 10px;flex-wrap:wrap;gap:8px">
            <div class="lv-session-dock" role="tablist" tabindex="-1" aria-label={t("wrongbook.queue")} onkeydown={handleTablistKeydown}>
              <button type="button" role="tab" tabindex={wbTab === "active" ? 0 : -1} class="lv-chip" class:acc={wbTab === "active"} aria-selected={wbTab === "active"} onclick={() => wbTab = "active"}>
                {t("wrongbook.tabActive")} ({wrongList.length})
              </button>
              <button type="button" role="tab" tabindex={wbTab === "archived" ? 0 : -1} class="lv-chip" class:acc={wbTab === "archived"} aria-selected={wbTab === "archived"} onclick={() => wbTab = "archived"}>
                {t("wrongbook.tabArchived")} ({archivedWrongList.length})
              </button>
              <button type="button" role="tab" tabindex={wbTab === "eliminated" ? 0 : -1} class="lv-chip" class:acc={wbTab === "eliminated"} aria-selected={wbTab === "eliminated"} onclick={() => wbTab = "eliminated"}>
                {t("wrongbook.tabEliminated")} ({eliminatedWrongList.length})
              </button>
              <!-- benchmark-fusion（Moodle CBM 标杆）：确定度双维分栏——高危盲区与脆弱伪掌握 -->
              <button type="button" role="tab" tabindex={wbTab === "highrisk" ? 0 : -1} class="lv-chip" class:acc={wbTab === "highrisk"} class:lv-chip--red={wbTab !== "highrisk" && cbmHighrisk.length > 0} aria-selected={wbTab === "highrisk"} title={t("cbm.highrisk.tip", "自评「确定」却答错：疑似概念性误区，优先复核")} onclick={() => wbTab = "highrisk"}>
                {t("cbm.highrisk", "高危盲区")} ({cbmHighrisk.length})
              </button>
              <button type="button" role="tab" tabindex={wbTab === "fragile" ? 0 : -1} class="lv-chip" class:acc={wbTab === "fragile"} class:lv-chip--amb={wbTab !== "fragile" && cbmFragile.length > 0} aria-selected={wbTab === "fragile"} title={t("cbm.fragile.tip", "自评「模糊/猜测」却蒙对：疑似运气分，建议重练验证真实掌握")} onclick={() => wbTab = "fragile"}>
                {t("cbm.fragile", "脆弱伪掌握")} ({cbmFragile.length})
              </button>
              <button type="button" role="tab" tabindex={wbTab === "ebbinghaus" ? 0 : -1} class="lv-chip" class:acc={wbTab === "ebbinghaus"} aria-selected={wbTab === "ebbinghaus"} title="按艾宾浩斯 1/3/7/15 天记忆周期自动归集错题，分列看板攻坚" onclick={() => wbTab = "ebbinghaus"}>
                <Icon name="clock" size={12} /> 遗忘周期看板
              </button>
            </div>
            <div class="lv-row" style="margin:0;gap:6px;align-items:center;flex-wrap:wrap">
              <div class="lv-row" style="margin:0;gap:3px;align-items:center">
                <select class="lv-select sm" style="font-size:12px;padding:2px 8px;height:28px;max-width:130px" bind:value={wrongPrintFormat} aria-label="选择错题导出排版格式" disabled={printWrongBusy || cheatSheetBusy || !filteredWrongQueue.length}>
                  <option value="retest">📝 错题重测卷</option>
                  <option value="question">📄 A4紧凑试卷</option>
                  <option value="answer">📖 配套答案册</option>
                  <option value="interactive">🌐 交互式讲题卷</option>
                  <option value="cheat">📑 急救小抄手账</option>
                </select>
                <button class="lv-btn sm lv-btn--ghost" onclick={handlePrintWrongFormat} disabled={printWrongBusy || cheatSheetBusy || !filteredWrongQueue.length} aria-busy={printWrongBusy || cheatSheetBusy} title="按选定版式导出打印或生成纯净纸面卷">
                  <Icon name="file" size={13} /> 快捷导出
                </button>
                <button class="lv-btn sm lv-btn--ghost" onclick={openWrongbookAssemble} disabled={!filteredWrongQueue.length} title="进入专业组卷排版工坊，自定义 A4 双栏错题清零卷、总分表与答题留白并直接打印">
                  <Icon name="printer" size={13} /> 🖨️ 组卷排版
                </button>
                <button class="lv-btn sm lv-btn--ghost" onclick={() => (presentationOpen = true)} disabled={!filteredWrongQueue.length} title="进入大屏放映模式逐题讲评与复盘错题">
                  <Icon name="monitor" size={13} /> 错题放映
                </button>
              </div>
              <button class="lv-btn sm lv-btn--ghost" onclick={onsaveWrongbookAsDoc} disabled={!filteredWrongQueue.length} title="将当前筛选的错题组建排版为思源笔记文档，折叠答案，卸载插件永久保留"><Icon name="file" size={13} /> {t("wrongbook.saveAsSiyuanDoc")}</button>
              <button
                class="lv-btn sm {wbFilterStubborn ? 'lv-btn--primary' : 'lv-btn--ghost'}"
                style={!hasCardsPlugin ? "opacity: 0.45;" : ""}
                onclick={onsyncWrongbookToCards}
                disabled={!filteredWrongQueue.length}
                title={hasCardsPlugin ? (wbFilterStubborn ? "将当前筛选的顽疾错题同步推送到小驴闪卡（siyuan-lv-cards）卡包中进行 FSRS 重点强化" : "将当前筛选的错题同步推送到小驴闪卡（siyuan-lv-cards）卡包中进行 FSRS 间隔复习") : "未检测到小驴闪卡插件（siyuan-lv-cards），安装后可一键将错题同步至 FSRS 卡包复习；当前内置错题重练 100% 独立可用"}
              >
                <Icon name="layers" size={13} /> {wbFilterStubborn ? "顽疾推闪卡" : t("wrongbook.pushCards")}
              </button>
              <button class="lv-btn sm lv-btn--primary" onclick={onlaunchWrongbookMockExam} disabled={!filteredWrongQueue.length} title="将当前筛选的错题组建为全真限时模拟考卷，拉起答题卡进行考场高压攻坚"><Icon name="clock" size={13} /> {t("wrongbook.launchExam")}</button>
            </div>
          </div>
          {#if lastSavedWrongbookDoc?.docId && onopenInSiYuan}
            <div class="lv-row" style="margin:0 0 10px;padding:6px 12px;background:var(--lv-surface-2);border-radius:var(--lv-r-2, 10px);border:1px solid var(--lv-border-subtle);justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px" role="status">
              <span style="font-size:var(--lv-font-size-sm);display:inline-flex;align-items:center;gap:6px">
                <Icon name="check" size={13} /> 已同步至思源文档：<b>《{lastSavedWrongbookDoc.title}》</b>
              </span>
              <button type="button" class="lv-btn sm lv-btn--ghost" onclick={() => onopenInSiYuan(lastSavedWrongbookDoc.docId)}>
                <Icon name="link" size={12} /> 在思源中打开 ↗
              </button>
            </div>
          {/if}
          {#if wbTab === "active"}
            <div class="lv-row" role="group" aria-label="错因过滤" style="gap:var(--lv-space-compact);margin:8px 0 12px;flex-wrap:wrap;align-items:center">
              <button class="lv-chip" class:acc={wbReasonFilter === "all"} aria-pressed={wbReasonFilter === "all"} onclick={() => wbReasonFilter = "all"}>
                {t("wrongbook.filterAll")} ({wrongQueue.length})
              </button>
              <button class="lv-chip" class:acc={wbReasonFilter === "careless"} aria-pressed={wbReasonFilter === "careless"} onclick={() => wbReasonFilter = "careless"}>
                {t("wrongbook.filterCareless")} ({reasonCounts.careless})
              </button>
              <button class="lv-chip" class:acc={wbReasonFilter === "unknown"} class:lv-chip--red={reasonCounts.unknown > 0} aria-pressed={wbReasonFilter === "unknown"} onclick={() => wbReasonFilter = "unknown"}>
                {t("wrongbook.filterUnknown")} ({reasonCounts.unknown})
              </button>
              <button class="lv-chip" class:acc={wbReasonFilter === "trap"} aria-pressed={wbReasonFilter === "trap"} onclick={() => wbReasonFilter = "trap"}>
                {t("wrongbook.filterTrap")} ({reasonCounts.trap})
              </button>
              <button class="lv-chip" class:acc={wbFilterStubborn} class:lv-chip--amb={wbFilterStubborn} aria-pressed={wbFilterStubborn} onclick={() => wbFilterStubborn = !wbFilterStubborn} title={t("wrongbook.filterStubbornTip")}>
                <Icon name="flame" size={12} /> {t("wrongbook.filterStubborn")}
              </button>
              {#if wbKpOptions.length > 0}
                <select class="lv-select sm" style="max-width:140px" bind:value={wbKpFilter} aria-label="筛选考点章节">
                  <option value="">全部考点章节</option>
                  {#each wbKpOptions as kp (kp)}
                    <option value={kp}>{kp}</option>
                  {/each}
                </select>
              {/if}
              {#if wbTagOptions && wbTagOptions.length > 0}
                <select class="lv-select sm" style="max-width:140px" bind:value={wbTagFilter} aria-label="筛选专属/模考标签">
                  <option value="">全部题目标签</option>
                  {#each wbTagOptions as tag (tag)}
                    <option value={tag}>{tag}</option>
                  {/each}
                </select>
              {/if}
              {#if wbDocOptions && wbDocOptions.length > 0}
                <select class="lv-select sm" style="max-width:160px" bind:value={wbDocFilter} aria-label="筛选来源文档">
                  <option value="">全部来源文档 ({wbDocOptions.length})</option>
                  {#each wbDocOptions as doc (doc.docId)}
                    <option value={doc.docId}>{doc.label} ({doc.count})</option>
                  {/each}
                </select>
              {/if}
              <div class="lv-row" style="margin:0 0 0 auto;gap:6px;align-items:center">
                <span class="lv-muted" style="font-size:11px">排序:</span>
                <select
                  class="lv-select sm"
                  style="max-width:130px"
                  bind:value={wbSortMode}
                  onchange={(e) => onchangeWbSortMode((e.target as HTMLSelectElement).value)}
                  title="切换错题排序方式"
                  aria-label="切换错题排序方式"
                >
                  <option value="default">最新错题优先</option>
                  <option value="wrongCount">犯错频次降序</option>
                  <option value="kp">按考点聚类</option>
                </select>
                {#if filteredWrongQueue.length > 0}
                  <button class="lv-btn sm lv-btn--primary" onclick={onstartFilteredWrongDrill} title={t("wrongbook.drillFiltered")}>
                    <Icon name="play" size={13} /> {t("wrongbook.drillFiltered")} ({filteredWrongQueue.length})
                  </button>
                {/if}
              </div>
            </div>
            {#each shownWrongQueue as w, wi (w.qid)}
              {@const q = qOf(w.qid)}
              {@const stubborn = isStubbornWrong(w)}
              <div class="lv-wrong-row">
                <div class="lv-wrong-header">
                  <span class="task-number num">{wi + 1}</span>
                  <div class="lv-wrong-main">
                    <div class="lv-wrong-stem" title={q?.stem ?? w.qid}>
                      {q?.stem ? q.stem.slice(0, 120) : `[错题 ${w.qid.slice(-8)}] 原题目已不在当前题库中`}
                    </div>
                    <div class="lv-wrong-meta">
                      <span>{t("wrongbook.wrongN").replace("{n}", String(w.wrongCount))}</span>
                      {#if stubborn}
                        <span class="lv-chip lv-chip--amb sm" title={getStubbornRemediation(w).reasonText}>
                          <Icon name="flame" size={11} /> {t("wrongbook.stubbornBadge")}
                        </span>
                      {/if}
                      {#if cbmHighriskQids.has(w.qid)}
                        <span class="lv-chip lv-chip--red sm" title={t("cbm.highrisk.tip", "自评「确定」却答错：疑似概念性误区，优先复核")}>
                          <Icon name="xcircle" size={11} /> {t("cbm.highrisk", "高危盲区")}
                        </span>
                      {/if}
                      {#if w.streakCorrect > 0}<span class="lv-chip lv-chip--grn num">{t("wrongbook.reClear").replace("{n}", String(effectiveEliminateStreak - w.streakCorrect))}</span>{/if}
                      {#if reasonOf(w.qid)}<span class="lv-chip num">{t("reason." + reasonOf(w.qid))}</span>{/if}
                      <span>{t("wrongbook.lastWrong")} {new Date(w.lastWrongAt).toLocaleDateString()}</span>
                      {#if q?.kp}
                        <button
                          type="button"
                          class="lv-chip num"
                          style="cursor:pointer"
                          title="点击筛选该章节考点错题"
                          onclick={() => { wbKpFilter = q.kp.split("/")[0]; }}
                        >
                          {q.kp}
                        </button>
                      {/if}
                      {#if q?.blockId}
                        <button
                          type="button"
                          class="lv-chip lv-traceback-btn"
                          style="cursor:pointer;color:var(--lv-accent);font-weight:600"
                          title="一键定位并穿透跳转至该题摘录的思源笔记原块上下文"
                          onclick={() => ontracebackBlock?.(q.blockId, q.rootId)}
                        >
                          📍 笔记原块上下文
                        </button>
                      {/if}
                    </div>
                    {#if reflections[w.qid]?.text}
                      <div class="lv-muted" style="font-size:var(--lv-font-size-caption);margin-top:4px">
                        <Icon name="pencil" size={11} /> 复盘反思：{reflections[w.qid].text}
                      </div>
                    {/if}
                  </div>
                </div>

                <div class="lv-wrong-toolbar">
                  <div class="lv-row" style="margin:0;gap:6px;align-items:center">
                    <button class="lv-btn sm lv-btn--primary" onclick={() => onstartWrongFor(w.qid)}>
                      <Icon name="play" size={13} /> {t("wrongbook.retry")}
                    </button>
                    {#if q?.blockId && onopenInSiYuan}
                      <button class="lv-btn sm lv-btn--ghost" title="在思源笔记中打开并高亮原题块（按住 Ctrl/Cmd 点击可在右侧分屏打开）" onclick={(e) => onopenInSiYuan(q.rootId || "", q.blockId, { event: e })}>
                        <Icon name="pin" size={12} /> 原题 ↗
                      </button>
                    {/if}
                    {#if oneditReflection}
                      <button class="lv-btn sm lv-btn--ghost" title="记录或修改本题复盘反思（同步写回思源题块）" onclick={() => oneditReflection(w.qid)}>
                        <Icon name="pencil" size={12} /> {reflections[w.qid]?.text ? t("reflection.edit", "改反思") : t("reflection.add", "写反思")}
                      </button>
                    {/if}
                  </div>
                  <div class="lv-row" style="margin:0;gap:4px;align-items:center">
                    {#if w.wrongCount >= 2}
                      <button class="lv-btn sm lv-btn--ghost" style="color:var(--lv-brand-deep);font-weight:600" title="顽疾错题：推送到小驴闪卡卡包进行 FSRS 间隔复习" onclick={() => onsyncSingleWrongToCard(w.qid)}>
                        <Icon name="layers" size={12} /> 推闪卡
                      </button>
                    {/if}
                    <button class="lv-btn sm lv-btn--ghost" title={t("wrongbook.traceMother")} onclick={() => { const q = qOf(w.qid); if (q) ontraceMotherQuestion(q); }}>
                      <Icon name="compass" size={12} /> 母题
                    </button>
                    <button class="lv-btn sm lv-btn--ghost" title={t("session.drillVariantTip")} onclick={() => { const q = qOf(w.qid); if (q) ondrillVariantFor(q); }}>
                      <Icon name="layers" size={12} /> 变式
                    </button>
                    {#if ondiagnosePrereqs}
                      <button class="lv-btn sm lv-btn--ghost" title="自适应根因溯源：分析前置依赖链，定位导致本题失分的先修短板与推荐攻克路径" onclick={() => { const q = qOf(w.qid); if (q) ondiagnosePrereqs(q); }}>
                        <Icon name="compass" size={12} /> 根因
                      </button>
                    {/if}
                    <button class="lv-btn sm lv-btn--ghost" title={t("wrongbook.snooze7")} onclick={() => onsnoozeWrong(w.qid, 7)}>
                      <Icon name="clock" size={12} /> 暂缓7天
                    </button>
                    <button class="lv-btn sm lv-btn--ghost" title={t("wrongbook.archiveTip")} onclick={() => onarchiveWrong(w.qid)}>
                      <Icon name="folder" size={12} /> 归档
                    </button>
                    <button class="lv-btn sm lv-btn--ghost" style="color:var(--lv-green);font-weight:600" title={t("wrongbook.masteredTip")} disabled={wrongBusyId === w.qid || !!wrongBusyId} aria-busy={wrongBusyId === w.qid} onclick={() => onmasterWrong(w.qid)}>
                      <Icon name="check" size={12} /> {wrongBusyId === w.qid ? "…" : t("wrongbook.mastered")}
                    </button>
                  </div>
                </div>
              </div>
            {:else}
              <div class="lv-muted" style="padding:16px 0;text-align:center">
                {wrongList.length === 0 ? "当前在册错题已全部清零！可切换上方分栏查看脆弱伪掌握、高危盲区、已消灭或已归档题目。" : t("wrongbook.noFiltered")}
              </div>
            {/each}
            {#if wbQueueHasMore}
              <!-- ux §3 virtualize-lists：长队列分批渲染，与浏览页 200/+=200 同口径；上方计数/操作按钮仍按全量口径 -->
              <div class="lv-row" style="justify-content:center;margin:12px 0 4px">
                <button class="lv-btn sm lv-btn--ghost" onclick={onloadMoreWbQueue}>
                  <Icon name="expand" size={13} /> {t("wrongbook.loadMore", "加载更多错题")}（{t("wrongbook.remaining", "还有")} <span class="num">{filteredWrongQueue.length - shownWrongQueue.length}</span> {t("browse.count")}）
                </button>
              </div>
            {/if}
          {:else if wbTab === "highrisk"}
            <!-- benchmark-fusion：高危盲区（Moodle CBM Misconception）——自信答错即概念误区，置顶呈现 -->
            <div class="lv-row" style="justify-content:space-between;align-items:center;margin:8px 0 4px;flex-wrap:wrap;gap:8px">
              <p class="lv-muted" style="font-size:var(--lv-font-size-caption);margin:0">
                {t("cbm.highrisk.desc", "以下题目最近一次作答自评「确定」却答错——大概率是概念性误区而非粗心，建议优先溯源与重练。")}
              </p>
              {#if cbmHighrisk.length > 0 && onstartCbmDrill}
                <button class="lv-btn sm lv-btn--primary" onclick={() => onstartCbmDrill("highrisk")}>
                  <Icon name="play" size={13} /> 一键攻坚高危盲区 ({cbmHighrisk.length})
                </button>
              {/if}
            </div>
            <div class="stack-sm" style="margin-top:6px">
              {#each cbmHighrisk as s, wi (s.qid)}
                {@const q = qOf(s.qid)}
                <div class="lv-wrong-row" style="border-left:3px solid var(--lv-red)">
                  <span class="task-number num" style="background:color-mix(in srgb, var(--lv-red) 14%, transparent);color:var(--lv-red-deep, var(--lv-red))">{wi + 1}</span>
                  <div class="lv-wrong-main">
                    <div class="lv-wrong-stem" title={q?.stem ?? s.qid}>{q?.stem.slice(0, 80) ?? s.qid}</div>
                    <div class="lv-wrong-meta">
                      <span class="lv-chip sm lv-chip--red" style="display:inline-flex;align-items:center;gap:4px"><Icon name="xcircle" size={11} /> {t("cbm.highrisk", "高危盲区")}</span>
                      <span class="lv-chip num">{t("confidence.sure")} ✕</span>
                      {#if s.myAnswer}<span class="lv-muted num">{t("session.myAnswer")}: {s.myAnswer}</span>{/if}
                      <span>{new Date(s.ts).toLocaleDateString()}</span>
                      {#if q?.kp}<span class="lv-chip num">{q.kp}</span>{/if}
                      {#if q?.blockId}
                        <button
                          type="button"
                          class="lv-chip lv-traceback-btn"
                          style="cursor:pointer;color:var(--lv-accent);font-weight:600"
                          title="一键定位并穿透跳转至该题摘录的思源笔记原块上下文"
                          onclick={() => ontracebackBlock?.(q.blockId, q.rootId)}
                        >
                          📍 笔记原块上下文
                        </button>
                      {/if}
                    </div>
                  </div>
                  <button class="lv-btn sm" onclick={() => onstartWrongFor(s.qid)}><Icon name="play" size={13} /> {t("wrongbook.retry")}</button>
                  {#if q?.blockId && onopenInSiYuan}
                    <button class="lv-btn sm lv-btn--ghost" title="在思源笔记中打开并高亮原题块（按住 Ctrl/Cmd 点击可在右侧分屏打开）" onclick={(e) => onopenInSiYuan(q.rootId || "", q.blockId, { event: e })}><Icon name="pin" size={12} /> 原题 ↗</button>
                  {/if}
                  <button class="lv-btn sm lv-btn--ghost" title={t("wrongbook.sameKpTip")} onclick={() => onstartSameKpFor(s.qid)}><Icon name="link" size={13} /> {t("wrongbook.sameKp")}</button>
                  {#if ondiagnosePrereqs}
                    <button class="lv-btn sm lv-btn--ghost" title="自适应根因溯源：分析前置依赖链，定位导致本题失分的先修短板与推荐攻克路径" onclick={() => { const q = qOf(s.qid); if (q) ondiagnosePrereqs(q); }}>
                      <Icon name="compass" size={12} /> 根因
                    </button>
                  {/if}
                </div>
              {:else}
                <div class="lv-muted" style="padding:16px 0;text-align:center">{t("cbm.highrisk.empty", "暂无高危盲区——作答时按 1/2/3 自评确定度即可积累 CBM 信号")}</div>
              {/each}
            </div>
          {:else if wbTab === "fragile"}
            <!-- benchmark-fusion：脆弱伪掌握（Moodle CBM Lucky Guess）——蒙对题归集，防考试漏网 -->
            <div class="lv-row" style="justify-content:space-between;align-items:center;margin:8px 0 4px;flex-wrap:wrap;gap:8px">
              <p class="lv-muted" style="font-size:var(--lv-font-size-caption);margin:0">
                {t("cbm.fragile.desc", "以下题目最近一次作答自评「模糊/猜测」却蒙对——得分可能来自运气，建议重练验证真实掌握。")}
              </p>
              {#if cbmFragile.length > 0 && onstartCbmDrill}
                <button class="lv-btn sm lv-btn--primary" onclick={() => onstartCbmDrill("fragile")}>
                  <Icon name="play" size={13} /> 一键重练脆弱伪掌握 ({cbmFragile.length})
                </button>
              {/if}
            </div>
            <div class="stack-sm" style="margin-top:6px">
              {#each cbmFragile as s, wi (s.qid)}
                {@const q = qOf(s.qid)}
                <div class="lv-wrong-row" style="border-left:3px solid var(--lv-amber)">
                  <span class="task-number num" style="background:color-mix(in srgb, var(--lv-amber) 16%, transparent);color:var(--lv-amber-deep, var(--lv-amber))">{wi + 1}</span>
                  <div class="lv-wrong-main">
                    <div class="lv-wrong-stem" title={q?.stem ?? s.qid}>{q?.stem.slice(0, 80) ?? s.qid}</div>
                    <div class="lv-wrong-meta">
                      <span class="lv-chip sm lv-chip--amb" style="display:inline-flex;align-items:center;gap:4px"><Icon name="help" size={11} /> {t("cbm.fragile", "脆弱伪掌握")}</span>
                      <span class="lv-chip num">{t("confidence." + s.confidence)} ✓</span>
                      <span>{new Date(s.ts).toLocaleDateString()}</span>
                      {#if q?.kp}<span class="lv-chip num">{q.kp}</span>{/if}
                      {#if q?.blockId}
                        <button
                          type="button"
                          class="lv-chip lv-traceback-btn"
                          style="cursor:pointer;color:var(--lv-accent);font-weight:600"
                          title="一键定位并穿透跳转至该题摘录的思源笔记原块上下文"
                          onclick={() => ontracebackBlock?.(q.blockId, q.rootId)}
                        >
                          📍 笔记原块上下文
                        </button>
                      {/if}
                    </div>
                  </div>
                  <button class="lv-btn sm" onclick={() => onstartWrongFor(s.qid)}><Icon name="play" size={13} /> {t("wrongbook.retry")}</button>
                  {#if q?.blockId && onopenInSiYuan}
                    <button class="lv-btn sm lv-btn--ghost" title="在思源笔记中打开并高亮原题块（按住 Ctrl/Cmd 点击可在右侧分屏打开）" onclick={(e) => onopenInSiYuan(q.rootId || "", q.blockId, { event: e })}><Icon name="pin" size={12} /> 原题 ↗</button>
                  {/if}
                  <button class="lv-btn sm lv-btn--ghost" title={t("wrongbook.sameKpTip")} onclick={() => onstartSameKpFor(s.qid)}><Icon name="link" size={13} /> {t("wrongbook.sameKp")}</button>
                  {#if ondiagnosePrereqs}
                    <button class="lv-btn sm lv-btn--ghost" title="自适应根因溯源：分析前置依赖链，定位导致本题失分的先修短板与推荐攻克路径" onclick={() => { const q = qOf(s.qid); if (q) ondiagnosePrereqs(q); }}>
                      <Icon name="compass" size={12} /> 根因
                    </button>
                  {/if}
                </div>
              {:else}
                <div class="lv-muted" style="padding:16px 0;text-align:center">{t("cbm.fragile.empty", "暂无脆弱伪掌握——没有蒙对题，掌握很扎实")}</div>
              {/each}
            </div>
          {:else if wbTab === "eliminated"}
            <div class="stack-sm" style="margin-top:8px">
              {#each eliminatedWrongList as w, wi (w.qid)}
                {@const q = qOf(w.qid)}
                <div class="lv-wrong-row" style="border-left:3px solid var(--lv-green)">
                  <span class="task-number num" style="background:var(--lv-green-soft);color:var(--lv-green)">{wi + 1}</span>
                  <div class="lv-wrong-main">
                    <div class="lv-wrong-stem" title={q?.stem ?? w.qid}>{q?.stem.slice(0, 80) ?? w.qid}</div>
                    <div class="lv-wrong-meta">
                      <span class="lv-chip sm lv-chip--grn" style="display:inline-flex;align-items:center;gap:4px"><Icon name="check" size={11} /> {t("wrongbook.tabEliminated")}</span>
                      <span>{t("wrongbook.wrongN").replace("{n}", String(w.wrongCount))}</span>
                      <span>消灭于 {new Date(w.lastWrongAt).toLocaleDateString()}</span>
                      {#if q?.kp}<span class="lv-chip num">{q.kp}</span>{/if}
                      {#if q?.blockId}
                        <button
                          type="button"
                          class="lv-chip lv-traceback-btn"
                          style="cursor:pointer;color:var(--lv-accent);font-weight:600"
                          title="一键定位并穿透跳转至该题摘录的思源笔记原块上下文"
                          onclick={() => ontracebackBlock?.(q.blockId, q.rootId)}
                        >
                          📍 笔记原块上下文
                        </button>
                      {/if}
                    </div>
                  </div>
                  {#if q?.blockId && onopenInSiYuan}
                    <button class="lv-btn sm lv-btn--ghost" title="在思源笔记中打开并高亮原题块（按住 Ctrl/Cmd 点击可在右侧分屏打开）" onclick={(e) => onopenInSiYuan(q.rootId || "", q.blockId, { event: e })}><Icon name="pin" size={12} /> 原题 ↗</button>
                  {/if}
                  <button class="lv-btn sm lv-btn--ghost" onclick={() => onstartWrongFor(w.qid)}>
                    <Icon name="play" size={13} /> {t("wrongbook.retry")}
                  </button>
                  <button class="lv-btn sm lv-btn--ghost" onclick={() => onrestoreWrongToActive(w.qid)}>
                    <Icon name="rotate" size={12} /> {t("wrongbook.restoreToActive")}
                  </button>
                </div>
              {:else}
                <div class="lv-muted" style="padding:16px 0;text-align:center">暂无已消灭错题（连续做对 2 次的错题将自动归入此处）</div>
              {/each}
            </div>
          {:else if wbTab === "ebbinghaus"}
            <div class="lv-kanban-grid" style="display:grid;grid-template-columns:repeat(auto-fit, minmax(210px, 1fr));gap:12px;margin-top:12px">
              {#each ebbinghausBuckets as b (b.id)}
                <div class="lv-card" style="padding:12px;background:var(--lv-surface-2);border-radius:var(--lv-r-2, 10px);border:1px solid var(--lv-border-subtle);display:flex;flex-direction:column;gap:8px">
                  <div class="lv-row" style="justify-content:space-between;align-items:center;margin:0">
                    <div>
                      <b style="font-size:13px;display:flex;align-items:center;gap:4px">
                        <span class="lv-dot" style="background:var(--lv-{b.tone})"></span>
                        <span>{b.title}</span>
                      </b>
                      <div class="lv-muted" style="font-size:10px;margin-top:2px">{b.subtitle}</div>
                    </div>
                    <span class="lv-chip sm num" class:lv-chip--red={b.tone === "red" && b.items.length > 0} class:lv-chip--amb={b.tone === "amber" && b.items.length > 0}>{b.items.length}</span>
                  </div>
                  <button class="lv-btn sm lv-btn--primary" style="width:100%;margin-top:2px" disabled={!b.items.length} onclick={() => onstartCustomDrill?.(b.items.map(it => it.qid))}>
                    <Icon name="play" size={12} /> 本桶特训 ({b.items.length})
                  </button>
                  {#if b.id === "1d" && b.items.length > 0}
                    <button class="lv-btn sm" style="width:100%;font-size:11px;border-color:var(--lv-red);color:var(--lv-red)" onclick={() => onstartCustomDrill?.(b.items.map(it => it.qid))} title="全键盘极速翻面消错：空格翻看答案，1消灭/2重试">
                      ⚡ 极速消错盲练 ({b.items.length})
                    </button>
                  {/if}
                  <div style="max-height:360px;overflow-y:auto;display:flex;flex-direction:column;gap:6px;margin-top:4px">
                    {#each b.items as it (it.qid)}
                      {@const q = qOf(it.qid)}
                      <div class="lv-card" style="padding:8px 10px;background:var(--lv-surface);border:1px solid var(--lv-border-subtle);border-radius:var(--lv-r-1, 6px);font-size:12px">
                        <div style="font-weight:600;line-height:1.4" title={q?.stem ?? it.qid}>{q?.stem.slice(0, 50) ?? it.qid}</div>
                        <div class="lv-row" style="justify-content:space-between;align-items:center;margin:6px 0 0">
                          <span class="lv-muted" style="font-size:10px">{it.wrongCount} 次错 · {Math.round(Math.max(0, (now - (it.lastWrongAt || now)) / 86400000))} 天前</span>
                          <button class="lv-btn sm" style="padding:1px 6px;font-size:11px" onclick={() => onstartWrongFor(it.qid)} title="重练本题"><Icon name="play" size={10} /></button>
                        </div>
                      </div>
                    {:else}
                      <div class="lv-empty" style="padding:24px 0;font-size:11px">暂无该周期错题</div>
                    {/each}
                  </div>
                </div>
              {/each}
            </div>
          {:else if wbTab === "archived"}
            <div class="stack-sm" style="margin-top:8px">
              {#each archivedWrongList as w, wi (w.qid)}
                {@const q = qOf(w.qid)}
                <div class="lv-wrong-row" style="opacity:0.85">
                  <span class="task-number num">{wi + 1}</span>
                  <div class="lv-wrong-main">
                    <div class="lv-wrong-stem" title={q?.stem ?? w.qid}>{q?.stem.slice(0, 80) ?? w.qid}</div>
                    <div class="lv-wrong-meta">
                      <span class="lv-chip sm">{t("wrongbook.tabArchived")}</span>
                      <span>{t("wrongbook.wrongN").replace("{n}", String(w.wrongCount))}</span>
                      {#if q?.kp}<span class="lv-chip num">{q.kp}</span>{/if}
                      {#if q?.blockId}
                        <button
                          type="button"
                          class="lv-chip lv-traceback-btn"
                          style="cursor:pointer;color:var(--lv-accent);font-weight:600"
                          title="一键定位并穿透跳转至该题摘录的思源笔记原块上下文"
                          onclick={() => ontracebackBlock?.(q.blockId, q.rootId)}
                        >
                          📍 笔记原块上下文
                        </button>
                      {/if}
                    </div>
                  </div>
                  {#if q?.blockId && onopenInSiYuan}
                    <button class="lv-btn sm lv-btn--ghost" title="在思源笔记中打开并高亮原题块（按住 Ctrl/Cmd 点击可在右侧分屏打开）" onclick={(e) => onopenInSiYuan(q.rootId || "", q.blockId, { event: e })}><Icon name="pin" size={12} /> 原题 ↗</button>
                  {/if}
                  <button class="lv-btn sm lv-btn--primary" onclick={() => onunarchiveWrong(w.qid)}>
                    <Icon name="rotate" size={12} /> {t("wrongbook.unarchive")}
                  </button>
                </div>
              {:else}
                <div class="lv-muted" style="padding:16px 0;text-align:center">{t("browse.empty")}</div>
              {/each}
            </div>
          {/if}
        </div>
      </div>
      <div class="stack">
        <div class="lv-card">
          <b class="lv-block-title">{t("wrongbook.strategy")}</b>
          <div class="stack-sm" style="margin-top:10px">
            <button class="lv-btn lv-btn--primary" style="width:100%" onclick={() => void onstartDrill("wrong")}><Icon name="rotate" size={15} /> {t("wrongbook.strategy.weighted")}</button>
            <button class="lv-btn" style="width:100%" onclick={onbrowseWrongFilter}><Icon name="table" size={15} /> {t("wrongbook.strategy.browse")}</button>
            <button class="lv-btn" style="width:100%" disabled={!cramCount} title={!cramCount ? t("state.noCram") : ""} onclick={() => void onstartDrill("cram")}><Icon name="flame" size={15} /> {t("mode.cram")}{!cramCount ? ` (${t("state.noCram")})` : ""}</button>
          </div>
          <div class="divider" style="margin:12px 0 10px"></div>
          <button class="lv-btn lv-btn--ghost" style="width:100%;color:var(--lv-text-3)" disabled={!wrongList.length || bulkMasterBusy} onclick={onmasterAllWrong}>
            <Icon name="check" size={14} /> {bulkMasterBusy ? "…" : t("wrongbook.masterAll")}
          </button>
          <p class="lv-muted" style="font-size:var(--lv-font-size-caption);margin:10px 0 0">{t("wrongbook.strategy.note")}</p>
        </div>
        <div class="lv-card">
          <b class="lv-block-title">{t("wrongbook.rules")}</b>
          <div class="stack-sm" style="margin-top:10px;font-size:var(--lv-font-size-meta);color:var(--lv-text-3)">
            <span>{t("wrongbook.rule.eliminate")}</span>
            <span>{t("wrongbook.rule.reason")}</span>
            <span>{t("wrongbook.rule.dedup")}</span>
          </div>
        </div>
      </div>
    </div>
  {/if}

  <PaperPresentationModal
    open={presentationOpen}
    title="错题攻坚大屏放映"
    questions={filteredWrongQueue.map((w) => questionMap.get(w.qid)).filter((q): q is Question => Boolean(q))}
    {t}
    onclose={() => (presentationOpen = false)}
  />

  <PaperAssembleModal
    open={wbAssembleOpen}
    bankName="错题攻坚清零重测卷"
    questions={wbAssembleQuestions}
    onclose={() => (wbAssembleOpen = false)}
    showMessage={(msg, timeout, type) => showExamNotice(msg, timeout, type)}
  />
</div>
