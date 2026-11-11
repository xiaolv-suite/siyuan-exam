<script lang="ts">
  import Icon from "../shared/Icon.svelte";
  import type { Question } from "@/core/types";
  import type { PracticeSession } from "@/core/session";
  import type { BankCategory } from "@/core/bankCategory";
  import { getBankCategoryMeta } from "@/core/bankCategory";
  import { localDate } from "@/core/replayer";
  import { lvEcosystem } from "@/libs/lv-notice-kit";

  interface Props {
    hasBank: boolean;
    creating: boolean;
    offline: boolean;
    creatingSample: boolean;
    SAMPLE_QUESTION_COUNT: number;
    bankCreateError: string;
    newBankName: string;
    session: PracticeSession | null;
    resumeBusy: boolean;
    exitBusy: boolean;
    resumeError: string;
    onboarding: boolean;
    practiceQuestions: Question[];
    questionsError: string;
    questionsLoaded: boolean;
    bankCategory: BankCategory;
    bankName: string;
    sampleNotice: string;
    loading: boolean;
    syncDocsBusy: boolean;
    banks: any[];
    plan: any;
    criticalForgettingKps: any[];
    planTime: any;
    todayQueue: Question[];
    weekAttemptTotal: number;
    weekTrend: any[];
    weekAttemptMax: number;
    goalPct: number;
    todayDone: number;
    dailyGoalN: number;
    streakDays: number;
    wrongList: any[];
    cramCount: number;
    favoriteCount: number;
    expKp: string;
    expKpRoots: string[];
    expReason: string;
    expDays: number;
    bankFileInput: HTMLInputElement | null;
    t: (k: string, fb?: string) => string;
    planReasonText: (plan: any) => string;
    weekDayLabel: (dateStr: string) => string;
    oncreateSampleBank: (kind?: any) => void;
    oncreateBank: () => void;
    ondownloadTemplate: () => void;
    oncreateAndImport: () => void;
    onResume: () => void;
    ondiscardSession: () => void;
    onstartDrill: (mode: any) => void;
    onopenReport: () => void;
    onopenMock: () => void;
    onskipOnboarding: () => void;
    onretryEntryLoad: () => void;
    onnavView: (view: any, subTab?: string) => void;
    onopenBankHub: () => void;
    onswitchToNonEmptyBank?: () => void;
    bankQuestionCounts?: Record<string, number>;
    activeBankId?: string;
    onrescueEbbinghausNow: () => void;
    onrescueEbbinghausRecite: () => void;
    onstartToday: () => void;
    oncopyTodayReport: () => void;
    onstartRecite: () => void;
    oncopyChallengeCode: () => void;
    onimportChallengeCode: () => void;
    onsyncBankDocs: () => void;
    onexportBank: () => void;
    onimportBank: (e: Event) => void;
    onexportWrong: () => void;
    onloadMaterials: () => void;
    lastSyncedDocs?: {
      overviewDocId?: string;
      bankDocId?: string;
      wrongbookDocId?: string;
      actionJournalDocId?: string;
    } | null;
    onopenInSiYuan?: (rootId: string, blockId?: string, opt?: any) => void;
  }

  let {
    hasBank,
    creating,
    offline,
    creatingSample,
    SAMPLE_QUESTION_COUNT,
    bankCreateError,
    newBankName = $bindable(),
    session,
    resumeBusy,
    exitBusy,
    resumeError,
    onboarding,
    practiceQuestions,
    questionsError,
    questionsLoaded,
    bankCategory,
    bankName,
    sampleNotice = $bindable(),
    loading,
    syncDocsBusy,
    banks,
    plan,
    criticalForgettingKps,
    planTime,
    todayQueue,
    weekAttemptTotal,
    weekTrend,
    weekAttemptMax,
    goalPct,
    todayDone,
    dailyGoalN,
    streakDays,
    wrongList,
    cramCount,
    favoriteCount,
    expKp = $bindable(),
    expKpRoots,
    expReason = $bindable(),
    expDays = $bindable(),
    bankFileInput = $bindable(),
    t,
    planReasonText,
    weekDayLabel,
    oncreateSampleBank,
    oncreateBank,
    ondownloadTemplate,
    oncreateAndImport,
    onResume,
    ondiscardSession,
    onstartDrill,
    onopenReport,
    onopenMock,
    onskipOnboarding,
    onretryEntryLoad,
    onnavView,
    onopenBankHub,
    onswitchToNonEmptyBank,
    bankQuestionCounts = {},
    activeBankId = "",
    onrescueEbbinghausNow,
    onrescueEbbinghausRecite,
    onstartToday,
    oncopyTodayReport,
    onstartRecite,
    oncopyChallengeCode,
    onimportChallengeCode,
    onsyncBankDocs,
    onexportBank,
    onimportBank,
    onexportWrong,
    onloadMaterials,
    lastSyncedDocs = null,
    onopenInSiYuan,
  }: Props = $props();

  let mobileToolsOpen = $state(false);
</script>

{#if !hasBank}
  <div class="lv-pad lv-center">
    <div class="lv-card lv-guard lv-guard--welcome">
      <div class="lv-guard-kicker"><Icon name="compass" size={15} /> {t("onboard.title")}</div>
      <div class="lv-guard-title">{t("guard.welcomeTitle")}</div>
      <p class="lv-muted">{t("guard.welcomeDesc")}</p>
      <div class="lv-guard-steps">
        <div class="lv-guard-step"><span class="lv-onboard-no num">01</span><span class="lv-tile-icon"><Icon name="book" size={16} /></span><b>{t("guard.step1")}</b><span>{t("guard.step1Desc")}</span></div>
        <div class="lv-guard-step"><span class="lv-onboard-no num">02</span><span class="lv-tile-icon"><Icon name="import" size={16} /></span><b>{t("guard.step2")}</b><span>{t("guard.step2Desc")}</span></div>
        <div class="lv-guard-step"><span class="lv-onboard-no num">03</span><span class="lv-tile-icon"><Icon name="play" size={16} /></span><b>{t("guard.step3")}</b><span>{t("guard.step3Desc")}</span></div>
      </div>
      <div class="lv-row" style="margin-top:20px">
        <button class="lv-btn lv-btn--primary" onclick={() => oncreateSampleBank()} disabled={creating || offline} aria-busy={creatingSample} title={offline ? t("state.offlineHint") : ""}>
          <Icon name="book" size={16} /> {creatingSample ? t("guard.sampleCreating") : t("guard.createSample").replace("{n}", String(SAMPLE_QUESTION_COUNT))}
        </button>
      </div>
      <p class="lv-hint">{t("guard.demoDesc")}</p>
      {#if bankCreateError}<div class="lv-error" role="alert">{bankCreateError}</div>{/if}
      <div class="lv-guard-title" style="margin-top:20px">{t("guard.title")}</div>
      <p class="lv-muted">{t("guard.desc")}</p>
      <div class="lv-row">
        <input class="lv-input" placeholder={t("guard.namePlaceholder")} aria-label={t("guard.namePlaceholder")} bind:value={newBankName} disabled={creating}
          onkeydown={(e) => !e.isComposing && e.keyCode !== 229 && e.key === "Enter" && oncreateBank()} />
        <button class="lv-btn lv-btn--primary" onclick={oncreateBank} disabled={creating || !newBankName.trim()} aria-busy={creating && !creatingSample}>
          {creating && !creatingSample ? "…" : t("guard.create")}
        </button>
      </div>
      <p class="lv-hint"><Icon name="compass" size={13} /> {t("guard.sampleHint")}</p>
      <p class="lv-hint lv-guard-sample-detail">{t("guard.sampleDetail")}</p>
      <div class="lv-row lv-center-text"><span class="lv-muted">{t("guard.or")}</span></div>
      <div class="lv-row">
        <button class="lv-btn" style="flex:1" onclick={ondownloadTemplate}><Icon name="import" size={15} /> {t("import.template")}</button>
        <button class="lv-btn" style="flex:1" disabled={creating || !newBankName.trim()} onclick={oncreateAndImport}><Icon name="import" size={15} /> {t("guard.createAndImport")}</button>
      </div>
      <p class="lv-hint">{t("guard.needBankFirst")}</p>
    </div>
  </div>
{:else}
  {#if session && session.phase === "running"}
    <div class="lv-pad">
      <div class="lv-card lv-resume" style="margin-bottom:12px;padding:12px 18px;background:color-mix(in srgb, var(--lv-amber-soft) 35%, var(--lv-surface));border-left:3.5px solid var(--lv-amber);border-radius:var(--lv-r-2);display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px">
        <div>
          <b style="font-size:14px;display:flex;align-items:center;gap:6px"><Icon name="clock" size={14} /> {t("resume.title", "上次练习尚未完成")}</b>
          <div class="lv-muted" style="font-size:12px;margin-top:2px">当前已答进度：<span class="num">{session.progress.done} / {session.progress.total}</span> 题</div>
        </div>
        <div class="lv-row" style="margin:0;gap:8px">
          <button class="lv-btn lv-btn--primary sm" onclick={onResume} disabled={resumeBusy || exitBusy}>
            <Icon name="play" size={12} /> {resumeBusy ? "…" : "继续做题"}
          </button>
          <button class="lv-btn lv-btn--ghost sm" disabled={resumeBusy || exitBusy} onclick={ondiscardSession} title="清空未完成练习并重新开始" style="color:var(--lv-accent-seal)">
            <Icon name="trash" size={12} /> 放弃该次练习
          </button>
        </div>
      </div>
      {#if resumeError}<div class="lv-error" role="alert" style="margin-top:8px">{resumeError}</div>{/if}
    </div>
  {/if}
  {#if onboarding}
    <div class="lv-pad">
      <div class="lv-card lv-resume lv-onboard">
        <div>
          <b class="lv-onboard-title"><Icon name="compass" size={16} /> {t("onboard.title")}</b>
          <div class="lv-muted">{t("onboard.desc")}</div>
          <ol class="lv-onboard-steps" aria-label={t("onboard.title")}>
            <li class="lv-onboard-step"><span class="lv-onboard-no num">01</span><span class="lv-tile-icon"><Icon name="import" size={17} /></span><b>{t("onboard.step1Title")}</b>
              <div class="lv-muted lv-onboard-step-desc">{t("onboard.step1Desc")}</div>
              <div class="lv-row" style="gap:var(--lv-space-compact);margin:8px 0 0">
                <button class="lv-btn sm" onclick={() => onnavView("import")}>{t("onboard.step1")}</button>
                <button class="lv-btn sm" onclick={() => onnavView("manual")}>{t("onboard.step1b")}</button>
                <button class="lv-btn sm" onclick={() => onnavView("ai")}>{t("onboard.step1c")}</button>
              </div>
            </li>
            <li class="lv-onboard-step"><span class="lv-onboard-no num">02</span><span class="lv-tile-icon"><Icon name="zap" size={17} /></span><b>{t("onboard.step2")}</b>
              <div class="lv-muted lv-onboard-step-desc">{t("onboard.step2Desc")}</div>
              <div class="lv-row" style="gap:var(--lv-space-compact);margin:8px 0 0">
                <button class="lv-btn sm lv-btn--primary" onclick={() => onstartDrill("quick")} disabled={!practiceQuestions.length || !!questionsError} title={!practiceQuestions.length ? t("state.emptyBank") : questionsError ? t("entry.loadError") : ""}>{t("onboard.step2")}</button>
              </div>
            </li>
            <li class="lv-onboard-step"><span class="lv-onboard-no num">03</span><span class="lv-tile-icon"><Icon name="chart" size={17} /></span><b>{t("onboard.step3")}</b>
              <div class="lv-muted lv-onboard-step-desc">{t("onboard.step3Desc")}</div>
              <div class="lv-row" style="gap:var(--lv-space-compact);margin:8px 0 0">
                <button class="lv-btn sm" onclick={onopenReport}>{t("onboard.step3")}</button>
              </div>
            </li>
          </ol>
        </div>
        <div class="lv-row" style="margin:6px 0 0">
          <span class="fn__flex-1"></span>
          <button class="lv-btn sm lv-btn--ghost" onclick={onskipOnboarding}>{t("onboard.skip")}</button>
        </div>
      </div>
    </div>
  {/if}
  <div class="lv-pad">
    <div class="lv-screen-head" style="margin-bottom:14px">
      <div class="lv-row" style="justify-content:space-between;align-items:flex-start;margin:0 0 4px;flex-wrap:wrap;gap:8px">
        <div>
          <span class="lv-eyebrow">
            {#if hasBank}
              <span style="display:inline-flex;align-items:center;gap:5px">
                <Icon name={getBankCategoryMeta(bankCategory).icon} size={13} />
                <span>当前题库：{getBankCategoryMeta(bankCategory).label} · 考备专区</span>
              </span>
            {:else}
              {t("head.entry.eyebrow")}
            {/if}
          </span>
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
            <h1 class="lv-h1" style="margin:0">{hasBank ? bankName : t("head.entry.title")}</h1>
            {#if hasBank}
              <button type="button" class="lv-chip lv-chip--acc" onclick={onopenBankHub} title="点击展开题库列表，快速切换或新建其他题库" style="cursor:pointer;font-weight:600">
                <Icon name="folder" size={12} /> 切换其他题库 ({banks.length}) ▾
              </button>
            {/if}
          </div>
        </div>
      </div>
      <p style="margin:4px 0 0;font-size:12.5px;color:var(--lv-text-3)">备考闭环：导入/录题 → 今日练习 → 错题消灭 → 全真模考 → 复盘沉淀。</p>
    </div>
    {#if bankCreateError}<div class="lv-error" role="alert" style="margin-bottom:14px">{bankCreateError}</div>{/if}
    {#if sampleNotice}
      <div class="lv-card lv-sample-welcome-banner" role="status">
        <div class="lv-sample-welcome-main">
          <div class="lv-sample-welcome-lead">
            <span class="lv-achievement-pill lv-achievement-pill--seal"><Icon name="sparkles" size={12} /> 示范题库已就绪</span>
            <b class="lv-sample-welcome-title">{sampleNotice}</b>
          </div>
          <p class="lv-muted" style="margin:4px 0 10px;font-size:13px;line-height:1.55">{t("guard.demoGuide")}</p>
          <div class="lv-row" style="margin:0;gap:8px">
            <button class="lv-btn lv-btn--primary sm" onclick={() => onstartDrill("quick")} disabled={!practiceQuestions.length || !!questionsError}>
              <Icon name="play" size={14} /> {t("mode.quick")}
            </button>
            <button class="lv-btn sm lv-btn--ghost" onclick={onretryEntryLoad} disabled={loading || creating}>
              <Icon name="rotate" size={13} /> {t("entry.loadRetry")}
            </button>
          </div>
        </div>
        <button class="lv-drawer-close-btn" style="border:0;background:transparent;cursor:pointer;color:var(--lv-text-3);padding:4px;border-radius:6px;display:grid;place-items:center" aria-label="关闭提示" onclick={() => sampleNotice = ""}>
          <Icon name="close" size={14} />
        </button>
      </div>
    {/if}
    {#if questionsError}
      <div class="lv-card lv-empty lv-entry-empty" role="alert">
        <div class="lv-empty-icon"><Icon name="xcircle" size={28} /></div>
        <b>{t("entry.loadError")}</b>
        <p class="lv-muted">{questionsError}</p>
        <div class="lv-row" style="justify-content:center;margin-top:14px">
          <button class="lv-btn lv-btn--primary" onclick={onretryEntryLoad} disabled={loading}><Icon name="rotate" size={15} /> {t("entry.loadRetry")}</button>
          <button class="lv-btn" onclick={() => onnavView("import")}><Icon name="import" size={15} /> {t("import.title")}</button>
        </div>
      </div>
    {:else if questionsLoaded && !practiceQuestions.length}
      <!-- 空库起步卡片 -->
      <div class="lv-card lv-empty lv-entry-empty" style="box-shadow:var(--lv-sh-pop);padding:32px 28px;border-radius:var(--lv-r-card, 20px);background:var(--lv-surface);border:1px solid var(--lv-border-subtle);max-width:720px;margin:16px auto 36px">
        <div style="text-align:center;margin-bottom:20px">
          <div class="lv-empty-icon" style="width:54px;height:54px;border-radius:16px;background:var(--lv-brand-soft);color:var(--lv-brand);display:grid;place-items:center;margin:0 auto 12px;box-shadow:0 4px 14px color-mix(in srgb, var(--lv-brand) 18%, transparent)">
            <Icon name="book" size={26} />
          </div>
          <h2 style="font-size:20px;font-weight:700;color:var(--lv-text);margin:0 0 6px">{t("entry.emptyTitle", "当前题库暂无题目")}</h2>
          <p class="lv-muted" style="max-width:520px;margin:0 auto;line-height:1.6;font-size:13px">
            可以从思源笔记或文件导入试题、手工录题，或一键创建内置示例题库先走一遍练习闭环。
          </p>
        </div>

        <div class="lv-row lv-empty-actions" style="justify-content:center;gap:10px;flex-wrap:wrap;margin:12px 0 0">
          {#if banks.some((b) => b.id !== activeBankId && (bankQuestionCounts[b.id] ?? 0) > 0)}
            {@const bestOther = banks.find((b) => b.id !== activeBankId && (bankQuestionCounts[b.id] ?? 0) > 0)}
            <button class="lv-btn lv-btn--primary" onclick={() => onswitchToNonEmptyBank ? onswitchToNonEmptyBank() : onopenBankHub()}>
              <Icon name="folder" size={15} /> 切换至「{bestOther?.name}」刷题 ({bankQuestionCounts[bestOther?.id]} 题)
            </button>
            {#if banks.length > 1}
              <button class="lv-btn lv-btn--ghost" onclick={onopenBankHub}>
                <Icon name="grid" size={15} /> 全部题库 ({banks.length})
              </button>
            {/if}
          {:else if banks.length > 1}
            <button class="lv-btn lv-btn--primary" onclick={() => void oncreateSampleBank("general")} disabled={creating || offline}>
              <Icon name="grid" size={15} /> 创建示例题库体验刷题（{SAMPLE_QUESTION_COUNT} 题）
            </button>
            <button class="lv-btn lv-btn--ghost" onclick={() => onswitchToNonEmptyBank ? onswitchToNonEmptyBank() : onopenBankHub()}>
              <Icon name="folder" size={15} /> 查看题库列表 ({banks.length})
            </button>
          {:else}
            <button class="lv-btn lv-btn--primary" onclick={() => void oncreateSampleBank("general")} disabled={creating || offline}>
              <Icon name="grid" size={15} /> 创建示例题库体验刷题（{SAMPLE_QUESTION_COUNT} 题）
            </button>
          {/if}
          {#if banks.some((b) => b.id !== activeBankId && (bankQuestionCounts[b.id] ?? 0) > 0)}
            <button class="lv-btn lv-btn--ghost" onclick={() => void oncreateSampleBank("general")} disabled={creating || offline}>
              <Icon name="grid" size={15} /> 创建示例题库体验刷题（{SAMPLE_QUESTION_COUNT} 题）
            </button>
          {/if}
          <button class="lv-btn lv-btn--ghost lv-desktop-author-action" onclick={() => onnavView("import", "siyuan")}>
            <Icon name="file" size={15} /> 从思源笔记智能提取试题
          </button>
          <button class="lv-btn lv-btn--ghost lv-desktop-author-action" onclick={() => onnavView("import", "standard")}>
            <Icon name="import" size={15} /> 批量导入 (Excel / CSV / Aiken)
          </button>
          <button class="lv-btn lv-btn--ghost lv-desktop-author-action" onclick={() => onnavView("manual")}>
            <Icon name="clipboard" size={15} /> 手工录题工坊
          </button>
        </div>
      </div>
    {:else}
      <!-- ===== 备考与刷题主空间 ===== -->
      {#if plan}
        <div class="lv-entry-overview">
          <div class="lv-card lv-hero lv-entry-hero">
            <div class="lv-entry-main">
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
                <span class="lv-focus-label"><Icon name="calendar" size={12} /> {t("entry.today")}</span>
                {#if planTime}
                  <span class="lv-chip num sm" style="font-size:11px" title={planTime.sourced ? t("entry.timeSourced") : t("entry.timeDefault")}>
                    <Icon name="hourglass" size={11} /> ~{planTime.minutes} {t("entry.minutes")}
                  </span>
                {/if}
              </div>
              <div class="lv-entry-reason">{planReasonText(plan)}</div>
              <div class="lv-hero-actions">
                <button class="lv-btn lv-btn--primary" onclick={onstartToday} disabled={!todayQueue.length} title={todayQueue.length ? "" : t("state.emptyBank")}>
                  <Icon name="play" size={15} /> 开始今日练习
                </button>
                <button class="lv-btn lv-btn--ghost lv-hero-copy-btn" onclick={oncopyTodayReport} title={t("entry.copyReportTip")}>
                  <Icon name="copy" size={14} /> {t("entry.copyReport")}
                </button>
                {#if !plan.queue.length && todayQueue.length}
                  <span class="lv-muted" role="status" style="font-size:12px">{t("entry.queueFallback")}</span>
                {/if}
              </div>
            </div>
            <div class="lv-entry-num">
              <div class="lv-entry-countwrap">
                <span class="num lv-entry-count">{todayQueue.length}</span>
                <span class="lv-entry-unit">{t("browse.count")}</span>
              </div>
              <div class="lv-entry-label">{t("entry.queueLabel")}</div>
            </div>
          </div>
          <section class="lv-card lv-entry-week" aria-label={t("entry.weekTitle")}>
            <div class="lv-entry-week-head">
              <b style="display:flex;align-items:center;gap:6px">
                <Icon name="activity" size={14} /> {t("entry.weekTitle")}
              </b>
              <span class="lv-chip lv-chip--data num sm">{t("entry.weekCount").replace("{n}", String(weekAttemptTotal))}</span>
            </div>
            <div class="lv-week-strip" role="img" aria-label={t("entry.weekAria").replace("{days}", weekTrend.map((day) => `${weekDayLabel(day.date)} ${day.attempts} ${t("browse.count")}`).join("，"))}>
              {#each weekTrend as day (day.date)}
                {@const isToday = day.date === localDate(Date.now())}
                <div class="lv-week-day" class:is-today={isToday} title={`${day.date}${isToday ? "（今天）" : ""} · ${day.attempts} 题`}>
                  <span class="lv-week-count" class:has-attempts={day.attempts > 0} style="--lv-week-fill:{Math.round((day.attempts / weekAttemptMax) * 100)}%">
                    {day.attempts > 0 ? day.attempts : ""}
                  </span>
                  <span class="lv-week-day-label" class:today-text={isToday}>{isToday ? "今" : weekDayLabel(day.date)}</span>
                </div>
              {/each}
            </div>
            <p class="lv-muted lv-week-hint">{weekAttemptTotal ? t("entry.weekScope") : t("entry.weekEmpty")}</p>
          </section>
        </div>
        {#if criticalForgettingKps.length > 0}
          <details class="lv-card lv-review-suggestions">
            <summary>{t("entry.retestSuggestion").replace("{n}", String(criticalForgettingKps.length))}</summary>
            <p class="lv-muted">{t("entry.retestEstimateNote")}</p>
            <ul>
              {#each criticalForgettingKps as item (item.kp)}
                <li><strong>{item.kp}</strong> · {t("entry.retestEvidence").replace("{n}", String(item.practicedCount)).replace("{date}", item.lastAttemptAt ? new Date(item.lastAttemptAt).toLocaleDateString() : t("entry.retestNoEvidence"))}</li>
              {/each}
            </ul>
            <div class="lv-row" style="gap:8px;flex-wrap:wrap">
              <button class="lv-btn sm" onclick={onrescueEbbinghausNow}><Icon name="play" size={13} /> {t("entry.retestPractice")}</button>
              <button class="lv-btn sm lv-btn--ghost" onclick={onrescueEbbinghausRecite}><Icon name="rotate" size={13} /> {t("entry.retestRecite")}</button>
            </div>
          </details>
        {/if}
      {/if}

      <div class="lv-widgets">
        {#if plan && plan.daysToExam != null}
          <div class="lv-card lv-widget">
            <span class="lv-streak-flame lv-streak-flame--clock"><Icon name="clock" size={22} /></span>
            <div class="lv-widget-body">
              <div class="lv-widget-title">{plan.mode === "sprint" ? t("entry.sprint") : t("entry.examCountdown")}</div>
              <strong class="num">{plan.daysToExam} {t("entry.days")}</strong>
              <span class="lv-muted">{plan.mode === "sprint" ? t("entry.sprintModeHint") : t("entry.steadyModeHint")}</span>
            </div>
          </div>
        {/if}
        <div class="lv-card lv-widget">
          <span class="lv-goal-wrap" role="img" aria-label={t("widget.goal.aria").replace("{p}", String(goalPct))}>
            <span class="lv-goal-ring" data-tone={goalPct >= 100 ? "good" : undefined} style="--pct:{goalPct}"></span>
            <span class="lv-goal-center num">{goalPct}%</span>
          </span>
          <div class="lv-widget-body">
            <div class="lv-widget-title">{goalPct >= 100 ? t("widget.goal.achieved") : t("widget.goal")}</div>
            <strong class="num">{todayDone} / {dailyGoalN} {t("browse.count")}</strong>
            <span class="lv-muted">{goalPct >= 100 ? t("widget.goal.done") : t("widget.goal.left").replace("{n}", String(Math.max(0, dailyGoalN - todayDone)))}</span>
          </div>
        </div>
        <div class="lv-card lv-widget">
          <span class="lv-streak-flame"><Icon name="flame" size={22} /></span>
          <div class="lv-widget-body">
            <div class="lv-widget-title">{t("widget.streak")}</div>
            <strong class="num">{streakDays} {t("entry.days")}</strong>
            <span class="lv-muted">{t("widget.streak.note")}</span>
          </div>
        </div>
        <button class="lv-card lv-widget lv-widget--click" style="text-align:left;font:inherit;color:inherit" onclick={() => onnavView("wrongbook")}>
          <span class="lv-streak-flame lv-streak-flame--wrong"><Icon name="target" size={22} /></span>
          <div class="lv-widget-body">
            <div class="lv-widget-title">{t("widget.wrong")}</div>
            <strong class="num">{wrongList.length} {t("mode.wrong.unit")}</strong>
            <span class="lv-muted">{t("widget.wrong.note")}</span>
          </div>
        </button>
      </div>

      <!-- ===== 备战功能中心：三大规整卡片网格 ===== -->
      <div class="lv-home-grids" style="display:grid;grid-template-columns:repeat(auto-fit, minmax(280px, 1fr));gap:16px;margin-top:20px">
        <!-- 卡片 1：快速练习三卡（前显：继续上次 / 错题复仇特训 / 薄弱10题） -->
        <section class="lv-card lv-home-panel lv-quick-practice-cards" aria-label="快速练习三卡">
          <div class="lv-home-panel-head">
            <b style="display:inline-flex;align-items:center;gap:6px">
              <Icon name="zap" size={15} /> 快速练习三卡
            </b>
            <span class="lv-muted" style="font-size:12px">即时反馈 · 靶向击破</span>
          </div>
          <div class="lv-home-btn-group">
            {#if session && session.phase === "running"}
              <button class="lv-btn sm lv-btn--primary" onclick={onResume} disabled={resumeBusy || exitBusy}>
                <Icon name="play" size={13} /> 继续上次练习 (已答 {session.progress.done}/{session.progress.total})
              </button>
            {:else}
              <button class="lv-btn sm" disabled={!practiceQuestions.length} onclick={() => onstartDrill("quick")}>
                <Icon name="play" size={13} /> {t("mode.quick", "快速自测 (10题)")}
              </button>
            {/if}
            <button class="lv-btn sm" disabled={!wrongList.length} onclick={() => onstartDrill("wrong")}>
              <Icon name="xcircle" size={13} /> 错题复仇特训
              {#if wrongList.length}<span class="lv-chip num sm" style="color:var(--lv-accent-seal)">{wrongList.length}</span>{/if}
            </button>
            <button class="lv-btn sm" disabled={!cramCount && !practiceQuestions.length} onclick={() => onstartDrill("cram")}>
              <Icon name="flame" size={13} /> 薄弱10题特训
              {#if cramCount}<span class="lv-chip num sm">{cramCount}</span>{/if}
            </button>
            {#if favoriteCount}
              <button class="lv-btn sm" onclick={() => onstartDrill("fav")}>
                <Icon name="star" size={13} /> {t("mode.fav", "重点题目收藏")}
                <span class="lv-chip num sm">{favoriteCount}</span>
              </button>
            {/if}
          </div>
        </section>

        <!-- 卡片 2（手机首屏直达）：概念背诵与全真模考 -->
        <section class="lv-card lv-home-panel lv-study-modes-panel" aria-label="概念背诵与全真模考">
          <div class="lv-home-panel-head">
            <b style="display:inline-flex;align-items:center;gap:6px">
              <Icon name="clock" size={15} /> 概念背诵与全真模考
            </b>
            <span class="lv-muted" style="font-size:12px">主动回忆 · 实战验真</span>
          </div>
          <div class="lv-home-btn-group">
            <button class="lv-btn sm lv-mode" disabled={!practiceQuestions.length} onclick={onstartRecite} title="不看答案先回忆，以纸面背题模式进行记忆巩固">
              <Icon name="rotate" size={13} /> {t("mode.recite", "纸面背诵模式")}
            </button>
            <button class="lv-btn sm lv-btn--primary" onclick={onopenMock} title="进入全真模拟考场">
              <Icon name="clock" size={13} /> 进入全真模考场
            </button>
            <button class="lv-btn sm" onclick={onopenReport} title="查看学情诊断报告">
              <Icon name="chart" size={13} /> 查看学情诊断报告
            </button>
            {#if criticalForgettingKps.length > 0}
              <button class="lv-btn sm" onclick={onrescueEbbinghausNow} style="color:var(--lv-accent-seal)" title={t("entry.retestPractice")}>
                <Icon name="flame" size={13} /> {t("entry.retestPractice")}
              </button>
            {/if}
          </div>
        </section>

        <!-- 移动端后收折叠：仅收纳偏电脑端创作管理的题库录入、导入与维护 -->
        <details class="lv-mobile-folded-section" bind:open={mobileToolsOpen}>
          <summary class="lv-mobile-folded-summary">
            <span style="display:inline-flex;align-items:center;gap:6px">
              <Icon name="folder" size={15} /> 录题 · 导入 · 题库维护（建议电脑端操作）
            </span>
            <span class="lv-chip sm">{mobileToolsOpen ? "收起 ▲" : "展开 ▼"}</span>
          </summary>
          <div class="lv-mobile-folded-content">
            <!-- 卡片 3：试题录入与题库维护 -->
            <section class="lv-card lv-home-panel" aria-label="试题录入与题库维护">
              <div class="lv-home-panel-head">
                <b style="display:inline-flex;align-items:center;gap:6px">
                  <Icon name="folder" size={15} /> 试题录入与题库维护
                </b>
                <span class="lv-muted" style="font-size:12px">思源沉淀 · 格式导入</span>
              </div>
              <div class="lv-home-btn-group">
                <button class="lv-btn sm" onclick={() => onnavView("import", "siyuan")}>
                  <Icon name="file" size={13} /> 从思源笔记智能提取
                </button>
                <button class="lv-btn sm" onclick={() => onnavView("import", "standard")}>
                  <Icon name="import" size={13} /> 批量导入 (Excel/CSV/Aiken)
                </button>
                <button class="lv-btn sm" onclick={() => onnavView("manual")}>
                  <Icon name="pencil" size={13} /> 手工录题 (带原文溯源)
                </button>
                <button class="lv-btn sm" onclick={() => { onnavView("materials"); onloadMaterials(); }}>
                  <Icon name="book" size={13} /> 考纲与参考资料
                </button>
                <div class="lv-row" style="margin:4px 0 0;gap:6px;width:100%">
                  <button class="lv-btn sm" style="flex:1" onclick={onsyncBankDocs} disabled={syncDocsBusy || offline || !hasBank} title={t("sync.docsTip")}>
                    <Icon name="save" size={13} /> {syncDocsBusy ? "…" : t("sync.docsBtn")}
                  </button>
                  <button class="lv-btn sm" style="flex:1" onclick={onopenBankHub}>
                    <Icon name="grid" size={13} /> 切换与管理题库
                  </button>
                </div>
                <!-- 高级分享与归档折叠 -->
                <details class="lv-home-tools-details" style="margin-top:4px">
                  <summary class="lv-btn sm lv-btn--ghost" style="font-size:11px;color:var(--lv-text-3);width:100%">
                    <Icon name="export" size={12} /> 更多数据与分享工具…
                  </summary>
                  <div class="lv-home-tools-pop" style="display:flex;flex-direction:column;gap:6px;padding:8px;margin-top:4px;background:var(--lv-surface-2);border-radius:var(--lv-r-2);border:1px solid var(--lv-border-subtle)">
                    <div class="lv-row" style="gap:6px;margin:0">
                      <button class="lv-btn sm" style="flex:1" onclick={onexportWrong}><Icon name="export" size={12} /> 导出错题册</button>
                      <button class="lv-btn sm" style="flex:1" disabled={offline} onclick={onexportBank}><Icon name="export" size={12} /> 导出题库</button>
                      <button class="lv-btn sm" style="flex:1" disabled={offline} onclick={() => bankFileInput?.click()}><Icon name="import" size={12} /> 导入题库</button>
                      <input bind:this={bankFileInput} type="file" accept=".sy.zip,.zip" hidden onchange={onimportBank} disabled={offline} />
                    </div>
                    <div class="lv-row" style="gap:6px;margin:0">
                      <button class="lv-btn sm lv-btn--ghost" style="flex:1" onclick={oncopyChallengeCode}><Icon name="target" size={12} /> 复制挑战码</button>
                      <button class="lv-btn sm lv-btn--ghost" style="flex:1" onclick={onimportChallengeCode}><Icon name="import" size={12} /> 导入挑战码</button>
                    </div>
                    {#if expKpRoots.length > 0}
                      <div class="lv-row" style="gap:4px;font-size:11px;margin:0">
                        <span class="lv-muted">考点:</span>
                        <select class="lv-select sm" bind:value={expKp} style="flex:1;font-size:11px">
                          <option value="">全部考点</option>
                          {#each expKpRoots as k, _i (_i)}<option value={k}>{k}</option>{/each}
                        </select>
                      </div>
                    {/if}
                    <div class="lv-row" style="gap:4px;font-size:11px;margin:0">
                      <span class="lv-muted">错因:</span>
                      <select class="lv-select sm" bind:value={expReason} style="flex:1;font-size:11px">
                        <option value="">全部</option>
                        <option value="careless">粗心</option>
                        <option value="unknown">盲区</option>
                        <option value="trap">陷阱</option>
                      </select>
                      <span class="lv-muted">范围:</span>
                      <select class="lv-select sm" bind:value={expDays} style="flex:1;font-size:11px">
                        <option value={0}>全部</option>
                        <option value={7}>近7天</option>
                        <option value={30}>近30天</option>
                      </select>
                    </div>
                  </div>
                </details>
              </div>
            </section>
          </div>
        </details>
      </div>
      {#if lastSyncedDocs && onopenInSiYuan && (lastSyncedDocs.overviewDocId || lastSyncedDocs.bankDocId || lastSyncedDocs.wrongbookDocId || lastSyncedDocs.actionJournalDocId)}
        <div class="lv-row" style="margin:8px 0 0;padding:8px 12px;background:var(--lv-surface-2);border-radius:var(--lv-r-2, 10px);border:1px solid var(--lv-border-subtle);gap:8px;align-items:center;flex-wrap:wrap" role="status">
          <span style="font-size:var(--lv-font-size-sm);font-weight:600;display:inline-flex;align-items:center;gap:5px">
            <Icon name="check" size={13} /> 已同步至思源笔记文档：
          </span>
          {#if lastSyncedDocs.overviewDocId}
            <button type="button" class="lv-btn sm lv-btn--ghost" onclick={() => onopenInSiYuan(lastSyncedDocs.overviewDocId!)}>
              <Icon name="compass" size={12} /> 00 题库总览与考纲导航 ↗
            </button>
          {/if}
          {#if lastSyncedDocs.bankDocId}
            <button type="button" class="lv-btn sm lv-btn--ghost" onclick={() => onopenInSiYuan(lastSyncedDocs.bankDocId!)}>
              <Icon name="book" size={12} /> 完整题册 ↗
            </button>
          {/if}
          {#if lastSyncedDocs.wrongbookDocId}
            <button type="button" class="lv-btn sm lv-btn--ghost" onclick={() => onopenInSiYuan(lastSyncedDocs.wrongbookDocId!)}>
              <Icon name="target" size={12} /> 错题复盘本 ↗
            </button>
          {/if}
          {#if lastSyncedDocs.actionJournalDocId}
            <button type="button" class="lv-btn sm lv-btn--ghost" onclick={() => onopenInSiYuan(lastSyncedDocs.actionJournalDocId!)}>
              <Icon name="clipboard" size={12} /> 03 备考行动与复盘日志 ↗
            </button>
          {/if}
        </div>
      {/if}
    {/if}
    <div class="lv-ecosystem-footer" style="margin-top:20px;padding-top:12px;border-top:1px solid var(--lv-border-subtle);display:flex;align-items:center;justify-content:center">
      <span class="lv-ecosystem-badge" style="font-size:11.5px;color:var(--lv-text-3);background:var(--lv-surface-2);padding:4px 12px;border-radius:12px;border:1px solid var(--lv-border-subtle);letter-spacing:0.2px">
        {lvEcosystem.getStatusBadgeText()}
      </span>
    </div>
  </div>
{/if}

<style>
  .lv-home-panel {
    display: flex;
    flex-direction: column;
    padding: 18px 20px;
    background: var(--lv-surface);
    border: 1px solid var(--lv-border-subtle);
    border-radius: var(--lv-r-card, 16px);
    box-shadow: var(--lv-sh-card);
    transition: box-shadow var(--lv-dur-micro) ease, border-color var(--lv-dur-micro) ease;
  }
  .lv-home-panel:hover {
    border-color: var(--lv-border);
    box-shadow: var(--lv-sh-pop);
  }
  .lv-home-panel-head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 12px;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--lv-border-subtle);
  }
  .lv-home-btn-group {
    display: grid;
    grid-template-columns: 1fr;
    gap: 8px;
    flex: 1;
  }
  .lv-home-btn-group .lv-btn {
    width: 100%;
    justify-content: flex-start;
    padding: 8px 12px;
    height: 38px;
  }
  .lv-sample-welcome-banner {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 16px;
    padding: 14px 18px;
    margin-bottom: 14px;
    background: var(--lv-surface);
    border: 1px solid var(--lv-border);
    border-left: 3.5px solid var(--lv-brand);
    border-radius: var(--lv-r-2);
    box-shadow: var(--lv-sh-1);
  }
  .lv-sample-welcome-main { flex: 1; min-width: 0; }
  .lv-sample-welcome-lead { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 6px; }
  .lv-sample-welcome-title { font-size: var(--lv-font-size-md); font-weight: 600; color: var(--lv-text); }
  .lv-entry-overview { display: grid; grid-template-columns: minmax(0, 1.75fr) minmax(280px, 1fr); gap: var(--lv-space-loose); align-items: stretch; margin-bottom: 18px; }
  .lv-entry-hero { display: grid; grid-template-columns: minmax(0,1fr) auto; gap: 24px; align-items: center; padding: 26px 30px; position: relative; overflow: hidden; background: var(--lv-darkcard-bg); border: 1px solid var(--lv-darkcard-border); border-radius: var(--lv-r-card, 20px); box-shadow: var(--lv-darkcard-shadow); color: var(--lv-darkcard-text); }
  .lv-entry-hero::after { content: ''; position: absolute; right: -70px; top: -70px; width: 240px; height: 240px; border-radius: var(--lv-radius-round); background: radial-gradient(closest-side, var(--lv-darkcard-accent-soft), transparent); pointer-events: none; }
  .lv-entry-main { min-width: 0; position: relative; z-index: 1; }
  .lv-entry-hero .lv-focus-label { color: var(--lv-darkcard-accent); }
  .lv-entry-reason { font-size: 20px; font-weight: var(--lv-font-weight-semibold); letter-spacing: -.3px; line-height: 1.45; margin: 8px 0 14px; overflow-wrap: anywhere; color: var(--lv-darkcard-text); }
  .lv-entry-num { border-left: 1px solid var(--lv-darkcard-border); padding: 5px 0 5px 28px; display: flex; flex-direction: column; gap: 7px; align-self: stretch; justify-content: center; position: relative; z-index: 1; }
  .lv-entry-countwrap { display: flex; align-items: baseline; gap: var(--lv-space-2); }
  .lv-entry-count { font-size: 46px; font-weight: 700; letter-spacing: -2px; line-height: 1.05; font-variant-numeric: tabular-nums; color: var(--lv-data-accent-hi, #7dd3fc); }
  .lv-entry-unit { font-size: var(--lv-font-size-sm); color: var(--lv-darkcard-text-muted); }
  .lv-entry-label { font-size: var(--lv-font-size-label); letter-spacing: 0.6px; color: var(--lv-darkcard-text-muted); text-transform: uppercase; font-weight: 600; }
  .lv-entry-hero .lv-hero-actions .lv-btn--ghost { color: var(--lv-darkcard-text-muted); }
  .lv-entry-hero .lv-hero-actions .lv-btn--ghost:hover { color: var(--lv-darkcard-text); background: var(--lv-darkcard-surface); }
  .lv-entry-week { position: relative; overflow: hidden; display: flex; flex-direction: column; justify-content: space-between; min-width: 0; padding: 22px; border-radius: var(--lv-r-card, 20px); background: var(--lv-surface); border: 1px solid var(--lv-border); box-shadow: var(--lv-sh-card), var(--lv-inset-card); }
  .lv-entry-week::after { content: ''; position: absolute; right: -25px; top: -25px; width: 100px; height: 100px; border-radius: var(--lv-radius-round); background: radial-gradient(closest-side, color-mix(in srgb, var(--lv-data-accent) 12%, transparent), transparent); pointer-events: none; }
  .lv-entry-week-head { display: flex; align-items: center; justify-content: space-between; gap: var(--lv-space-2); font-size: var(--lv-font-size-body-compact); }
  .lv-week-strip { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 6px; margin: 12px 0 10px; }
  .lv-week-day { min-width: 0; display: flex; flex-direction: column; align-items: center; gap: 6px; color: var(--lv-text-3); font-size: 11px; }
  .lv-week-count { display: grid; place-items: center; width: 32px; height: 32px; border-radius: var(--lv-r-2, 10px); background: var(--lv-surface-2); color: var(--lv-text-3); font-size: 11px; font-weight: 600; font-variant-numeric: tabular-nums; transition: transform var(--lv-dur-micro) ease, background var(--lv-dur-micro) ease, border-color var(--lv-dur-micro) ease, box-shadow var(--lv-dur-micro) ease, color var(--lv-dur-micro) ease, opacity var(--lv-dur-micro) ease; }
  .lv-week-count.has-attempts { background: var(--lv-data-accent); color: var(--lv-on-data, #fff); box-shadow: 0 2px 8px color-mix(in srgb, var(--lv-data-accent) 35%, transparent); }
  .lv-week-day.is-today .lv-week-count { box-shadow: 0 0 0 2px var(--lv-accent), 0 3px 10px color-mix(in srgb, var(--lv-accent) 30%, transparent); }
  .lv-week-day.is-today:not(:has(.has-attempts)) .lv-week-count { background: var(--lv-accent-soft); color: var(--lv-accent); }
  .lv-week-day-label.today-text { color: var(--lv-accent); font-weight: 700; }
  .lv-week-hint { margin: 0; font-size: 11px; line-height: 1.5; color: var(--lv-text-3); }
  @container lv-exam (max-width: 960px) { .lv-entry-overview { grid-template-columns: minmax(0, 1fr); } }
  .lv-hero-actions { margin-top: 18px; }
  .lv-hero-actions .lv-btn--primary { box-shadow: var(--lv-btn-primary-shadow); }
  @container lv-exam (max-width: 680px) {
    .lv-entry-overview { margin-bottom: 8px; gap: 8px; }
    .lv-entry-hero { grid-template-columns: minmax(0,1fr) auto; padding: 10px 12px; gap: 10px; border-radius: var(--lv-r-3, 14px); }
    .lv-entry-reason { font-size: 13.5px; line-height: 1.35; margin: 2px 0 6px; }
    .lv-hero-actions { margin-top: 4px; }
    .lv-hero-copy-btn { display: none !important; }
    .lv-entry-num { border-left: 1px solid var(--lv-darkcard-border); border-top: 0; padding: 2px 0 2px 10px; flex-direction: column; align-items: center; gap: 2px; justify-content: center; }
    .lv-entry-count { font-size: 20px; letter-spacing: -0.5px; }
    .lv-entry-week { display: none; }
    .lv-home-grids { margin-top: 8px !important; gap: 8px !important; }
    .lv-home-panel { padding: 10px 12px; border-radius: 12px; }
    .lv-home-panel-head { margin-bottom: 6px; padding-bottom: 4px; }
    .lv-home-btn-group { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }
    .lv-home-btn-group .lv-btn { padding: 6px 8px; font-size: 12px; min-height: 36px; height: auto; }
    .lv-desktop-author-action { display: none !important; }
    .lv-entry-empty { padding: 14px 12px !important; margin: 4px auto 10px !important; }
    .lv-entry-empty h2 { font-size: 15px !important; }
    .lv-entry-empty .lv-empty-icon { width: 36px !important; height: 36px !important; margin-bottom: 6px !important; }
  }
  .lv-guard { max-width: 460px; width: 100%; }
  .lv-guard--welcome { max-width: 760px; }
  .lv-guard-kicker { display: inline-flex; align-items: center; gap: 7px; color: var(--lv-accent); font-size: var(--lv-font-size-sm); font-weight: var(--lv-font-weight-semibold); margin-bottom: 8px; }
  .lv-guard-title { font-size: 16px; font-weight: var(--lv-font-weight-bold); margin-bottom: 8px; }
  .lv-guard p { margin: 6px 0; }
  .lv-center-text { justify-content: center; }
  .lv-hint { font-size: var(--lv-font-size-sm); color: var(--lv-text-3); text-align: center; }
  .lv-guard-steps { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--lv-space-relaxed); margin: 16px 0 4px; }
  .lv-guard-step { position: relative; min-width: 0; padding: 12px 13px; border: 1px solid var(--lv-border); border-radius: var(--lv-r-2); background: var(--lv-surface-2); }
  .lv-guard-step .lv-tile-icon { width: 30px; height: 30px; }
  .lv-guard-step b { display: block; margin-top: 8px; font-size: var(--lv-font-size-body-compact); }
  .lv-guard-step > span:last-child { display: block; margin-top: 4px; color: var(--lv-text-3); font-size: var(--lv-font-size-caption); line-height: 1.55; }
  .lv-guard-sample-detail { max-width: 620px; margin: 2px auto 0; line-height: 1.55; }
  .lv-onboard-title { display: inline-flex; align-items: center; gap: var(--lv-space-2); }
  .lv-onboard { flex-direction: column; align-items: stretch; }
  .lv-onboard-steps { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--lv-space-loose); margin: 14px 0 0; padding: 0; list-style: none; }
  @container lv-exam (max-width: 960px) { .lv-onboard-steps { grid-template-columns: minmax(0, 1fr); } }
  .lv-onboard-step { position: relative; border: 1px solid var(--lv-border); border-radius: var(--lv-r-2); padding: 14px 16px; background: var(--lv-surface-2); }
  .lv-onboard-no { position: absolute; right: 12px; top: 8px; font-size: 26px; font-weight: var(--lv-font-weight-bold); letter-spacing: -0.02em; color: color-mix(in srgb, var(--lv-accent) 26%, transparent); }
  .lv-onboard-step b { display: block; font-size: var(--lv-font-size-body); margin: 8px 0 0; }
  .lv-onboard-step-desc { margin-top: 5px; font-size: var(--lv-font-size-caption); line-height: 1.5; }
  @container lv-exam (max-width: 760px) { .lv-guard-steps { grid-template-columns: minmax(0, 1fr); } }
  .lv-mobile-folded-section {
    display: contents;
  }
  .lv-mobile-folded-summary {
    display: none;
  }
  .lv-mobile-folded-content {
    display: contents;
  }
  @container lv-exam (max-width: 600px) {
    .lv-mobile-folded-section {
      display: block;
      grid-column: 1 / -1;
      border-radius: var(--lv-r-card, 16px);
      background: var(--lv-surface);
      border: 1px solid var(--lv-border-subtle);
      padding: 12px 14px;
      touch-action: manipulation;
    }
    .lv-mobile-folded-summary {
      display: flex;
      align-items: center;
      justify-content: space-between;
      cursor: pointer;
      font-weight: 600;
      font-size: 13.5px;
      color: var(--lv-text);
      list-style: none;
      touch-action: manipulation;
    }
    .lv-mobile-folded-summary::-webkit-details-marker {
      display: none;
    }
    .lv-mobile-folded-content {
      display: flex;
      flex-direction: column;
      gap: 14px;
      margin-top: 12px;
    }
  }
  .lv-review-suggestions { margin: 12px 0; padding: 12px 16px; }
  .lv-review-suggestions summary { cursor: pointer; font-weight: 600; }
  .lv-review-suggestions ul { padding-left: 20px; overflow-wrap: anywhere; }
</style>
