<script lang="ts">
  import Icon from "../shared/Icon.svelte";
  import type { Question } from "../../core/types";

  interface Props {
    wrongList: any[];
    eliminatedCount: number;
    clearPct: number;
    streakDays: number;
    reasonCounts: { unknown: number; careless: number; trap: number; unmarked: number };
    wbTab: "active" | "archived" | "eliminated";
    wbReasonFilter: "all" | "careless" | "unknown" | "trap";
    wbFilterStubborn: boolean;
    wbKpOptions: string[];
    wbKpFilter: string;
    wbSortMode: "default" | "wrongCount" | "kp";
    filteredWrongQueue: any[];
    archivedWrongList: any[];
    eliminatedWrongList: any[];
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
    onprintWrongSheet: (kind: "retest" | "question" | "answer") => void;
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
    wbSortMode = $bindable(),
    filteredWrongQueue,
    archivedWrongList,
    eliminatedWrongList,
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
  }: Props = $props();

  const qOf = (qid: string) => questionMap.get(qid);
  const totalWrongs = $derived(Math.max(1, wrongList.length));
</script>

<div class="lv-pad">
  <div class="lv-screen-head">
    <span class="lv-eyebrow">WRONG BOOK</span>
    <h1 class="lv-h1">{t("wrongbook.title")}</h1>
    <p>{t("wrongbook.desc").replace("{n}", String(effectiveEliminateStreak))}</p>
  </div>
  {#if !wrongList.length}
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
            <strong class="num" style="font-size:22px">{clearPct}%</strong>
            <span class="lv-chip lv-chip--amb num">{t("wrongbook.eliminated.note").replace("{e}", String(eliminatedCount)).replace("{a}", String(wrongList.length))}</span>
          </div>
          <div class="lv-progress"><i style="width:{clearPct}%"></i></div>
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
            <div class="lv-session-dock" role="tablist" aria-label={t("wrongbook.queue")}>
              <button type="button" role="tab" class="lv-chip" class:acc={wbTab === "active"} aria-selected={wbTab === "active"} onclick={() => wbTab = "active"}>
                {t("wrongbook.tabActive")} ({wrongList.length})
              </button>
              <button type="button" role="tab" class="lv-chip" class:acc={wbTab === "archived"} aria-selected={wbTab === "archived"} onclick={() => wbTab = "archived"}>
                {t("wrongbook.tabArchived")} ({archivedWrongList.length})
              </button>
              <button type="button" role="tab" class="lv-chip" class:acc={wbTab === "eliminated"} aria-selected={wbTab === "eliminated"} onclick={() => wbTab = "eliminated"}>
                {t("wrongbook.tabEliminated")} ({eliminatedWrongList.length})
              </button>
            </div>
            <div class="lv-row" style="margin:0;gap:6px;flex-wrap:wrap">
              <button class="lv-btn sm lv-btn--ghost" onclick={() => onprintWrongSheet("retest")} disabled={printWrongBusy || !filteredWrongQueue.length} title="导出纯净错题重测卷（含清零目标条与二次订正反思框，绝无答案泄露）"><Icon name="printer" size={13} /> 错题重测卷</button>
              <button class="lv-btn sm lv-btn--ghost" onclick={() => onprintWrongSheet("question")} disabled={printWrongBusy || !filteredWrongQueue.length} title="将当前筛选的错题导出或打印为 A4 双栏试卷（绝不泄题）"><Icon name="file" size={13} /> {t("mock.printCompact")}</button>
              <button class="lv-btn sm lv-btn--ghost" onclick={() => onprintWrongSheet("answer")} disabled={printWrongBusy || !filteredWrongQueue.length} title="导出或打印配套答案册"><Icon name="book" size={13} /> 答案册</button>
              <button class="lv-btn sm lv-btn--ghost" onclick={onexportCheatSheet} disabled={cheatSheetBusy || !filteredWrongQueue.length} title={t("cram.cheatSheetTip")}><Icon name="file-text" size={13} /> {t("cram.cheatSheet")}</button>
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
          {#if wbTab === "active"}
            <div class="lv-row" style="gap:var(--lv-space-compact);margin:8px 0 12px;flex-wrap:wrap;align-items:center">
              <button class="lv-chip" class:acc={wbReasonFilter === "all"} onclick={() => wbReasonFilter = "all"}>
                {t("wrongbook.filterAll")} ({wrongQueue.length})
              </button>
              <button class="lv-chip" class:acc={wbReasonFilter === "careless"} onclick={() => wbReasonFilter = "careless"}>
                {t("wrongbook.filterCareless")} ({reasonCounts.careless})
              </button>
              <button class="lv-chip" class:acc={wbReasonFilter === "unknown"} class:lv-chip--red={reasonCounts.unknown > 0} onclick={() => wbReasonFilter = "unknown"}>
                {t("wrongbook.filterUnknown")} ({reasonCounts.unknown})
              </button>
              <button class="lv-chip" class:acc={wbReasonFilter === "trap"} onclick={() => wbReasonFilter = "trap"}>
                {t("wrongbook.filterTrap")} ({reasonCounts.trap})
              </button>
              <button class="lv-chip" class:acc={wbFilterStubborn} class:lv-chip--amb={wbFilterStubborn} onclick={() => wbFilterStubborn = !wbFilterStubborn} title={t("wrongbook.filterStubbornTip")}>
                <Icon name="flame" size={12} /> {t("wrongbook.filterStubborn")}
              </button>
              {#if wbKpOptions.length > 0}
                <select class="lv-select" style="max-width:140px;height:28px" bind:value={wbKpFilter}>
                  <option value="">全部考点章节</option>
                  {#each wbKpOptions as kp (kp)}
                    <option value={kp}>{kp}</option>
                  {/each}
                </select>
              {/if}
              <div class="lv-row" style="margin:0 0 0 auto;gap:6px;align-items:center">
                <span class="lv-muted" style="font-size:11px">排序:</span>
                <select
                  class="lv-select"
                  style="max-width:130px;height:28px;font-size:12px;padding:2px 8px"
                  bind:value={wbSortMode}
                  onchange={(e) => onchangeWbSortMode((e.target as HTMLSelectElement).value)}
                  title="切换错题排序方式"
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
            {#each filteredWrongQueue as w, wi (w.qid)}
              {@const q = qOf(w.qid)}
              {@const stubborn = isStubbornWrong(w)}
              <div class="lv-wrong-row">
                <span class="task-number num">{wi + 1}</span>
                <div class="lv-wrong-main">
                  <div class="lv-wrong-stem" title={q?.stem ?? w.qid}>{q?.stem.slice(0, 80) ?? w.qid}</div>
                  <div class="lv-wrong-meta">
                    <span>{t("wrongbook.wrongN").replace("{n}", String(w.wrongCount))}</span>
                    {#if stubborn}
                      <span class="lv-chip lv-chip--amb sm" title={getStubbornRemediation(w).reasonText}>
                        <Icon name="flame" size={11} /> {t("wrongbook.stubbornBadge")}
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
                  </div>
                </div>
                <button class="lv-btn sm" onclick={() => onstartWrongFor(w.qid)}><Icon name="play" size={13} /> {t("wrongbook.retry")}</button>
                {#if w.wrongCount >= 2}
                  <button
                    class="lv-btn sm lv-btn--ghost"
                    style="color:var(--lv-brand-deep);font-weight:600"
                    title="该题犯错频次较高（顽疾错题），可一键推送到小驴闪卡进行 FSRS 间隔强化训练"
                    onclick={() => onsyncSingleWrongToCard(w.qid)}
                  >
                    <Icon name="layers" size={12} /> 推闪卡
                  </button>
                {/if}
                <button class="lv-btn sm lv-btn--ghost" title={t("wrongbook.traceMother")} onclick={() => { const q = qOf(w.qid); if (q) ontraceMotherQuestion(q); }}><Icon name="compass" size={13} /> {t("wrongbook.traceMother")}</button>
                <button class="lv-btn sm lv-btn--ghost" title={t("session.drillVariantTip")} onclick={() => { const q = qOf(w.qid); if (q) ondrillVariantFor(q); }}><Icon name="layers" size={13} /> {t("session.drillVariant")}</button>
                <button class="lv-btn sm lv-btn--ghost" title={t("wrongbook.snooze7")} onclick={() => onsnoozeWrong(w.qid, 7)}><Icon name="clock" size={12} /> {t("wrongbook.snooze7")}</button>
                <button class="lv-btn sm lv-btn--ghost" title={t("wrongbook.archiveTip")} onclick={() => onarchiveWrong(w.qid)}><Icon name="folder" size={12} /> {t("wrongbook.archive")}</button>
                <button class="lv-btn sm lv-btn--ghost" title={t("wrongbook.sameKpTip")} onclick={() => onstartSameKpFor(w.qid)}><Icon name="link" size={13} /> {t("wrongbook.sameKp")}</button>
                <button class="lv-btn sm lv-btn--ghost" style="color:var(--lv-green);font-weight:600" title={t("wrongbook.masteredTip")} disabled={wrongBusyId === w.qid || !!wrongBusyId} aria-busy={wrongBusyId === w.qid} onclick={() => onmasterWrong(w.qid)}><Icon name="check" size={13} /> {wrongBusyId === w.qid ? "…" : t("wrongbook.mastered")}</button>
              </div>
            {/each}
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
                    </div>
                  </div>
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
          {:else}
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
                    </div>
                  </div>
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
</div>
