<script lang="ts">
  import Icon from "../shared/Icon.svelte";
  import TeacherWorkspaceView from "./TeacherWorkspaceView.svelte";
  import type { Question } from "@/core/types";
  import type { PracticeSession } from "@/core/session";
  import type { BankCategory } from "@/core/bankCategory";
  import { getBankCategoryMeta } from "@/core/bankCategory";
  import { localDate } from "@/core/replayer";

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
    userRole: "student" | "teacher";
    teacherPrintBusy: boolean;
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
    onprintBankDoubleColumnPaper: () => void;
    onexportBankTeacherPaper: () => void;
    onprintBankHomeworkSheet: () => void;
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
    userRole,
    teacherPrintBusy,
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
    onprintBankDoubleColumnPaper,
    onexportBankTeacherPaper,
    onprintBankHomeworkSheet,
  }: Props = $props();
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
        <input class="lv-input" placeholder={t("guard.namePlaceholder")} bind:value={newBankName} disabled={creating}
          onkeydown={(e) => !e.isComposing && e.keyCode !== 229 && e.key === "Enter" && oncreateBank()} />
        <button class="lv-btn lv-btn--primary" onclick={oncreateBank} disabled={creating || !newBankName.trim()}>
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
      <div class="lv-card lv-resume">
        <div>
          <b>{t("resume.title")}</b>
          <div class="lv-muted">{t("resume.progress")}: {session.progress.done}/{session.progress.total}</div>
        </div>
        <button class="lv-btn lv-btn--primary" onclick={onResume} disabled={resumeBusy || exitBusy}>{resumeBusy ? "…" : t("resume.continue")}</button>
        <button class="lv-btn lv-btn--ghost" disabled={resumeBusy || exitBusy} onclick={ondiscardSession}>{t("resume.discard")}</button>
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
    <div class="lv-screen-head">
      <span class="lv-eyebrow">
        {#if hasBank}
          <span style="display:inline-flex;align-items:center;gap:5px">
            <Icon name={getBankCategoryMeta(bankCategory).icon} size={13} />
            <span>{getBankCategoryMeta(bankCategory).label} · 研学空间</span>
          </span>
        {:else}
          {t("head.entry.eyebrow")}
        {/if}
      </span>
      <h1 class="lv-h1">{hasBank ? bankName : t("head.entry.title")}</h1>
      <p>先输入理解，再背诵内化；既有日常沉浸自测，亦有全真限时模考。</p>
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
      <!-- 空库全学段研学导航中心 -->
      <div class="lv-card lv-empty lv-entry-empty" style="box-shadow:var(--lv-sh-pop);padding:36px 28px;border-radius:var(--lv-r-4, 22px);background:var(--lv-surface);border:1px solid var(--lv-border);max-width:920px;margin:16px auto 36px">
        <div style="text-align:center;margin-bottom:24px">
          <div class="lv-empty-icon" style="width:54px;height:54px;border-radius:16px;background:var(--lv-brand-soft);color:var(--lv-brand);display:grid;place-items:center;margin:0 auto 12px;box-shadow:0 4px 14px color-mix(in srgb, var(--lv-brand) 18%, transparent)">
            <Icon name="book" size={26} />
          </div>
          <h2 style="font-size:20px;font-weight:700;color:var(--lv-text);margin:0 0 6px">小驴学习 · 全场景自主研学启程</h2>
          <p class="lv-muted" style="max-width:540px;margin:0 auto;line-height:1.6;font-size:13px">
            考试是检验能力的手段，学习是终身成长的基石。当前题库暂无题目，请选择你的研学方向一键开练，或导入自己的笔记知识库。
          </p>
        </div>

        <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(190px, 1fr));gap:12px;margin-bottom:20px">
          <!-- 1. 职业与考证 -->
          <div class="lv-card" style="padding:14px;background:var(--lv-surface-2);border-radius:var(--lv-r-2);border:1px solid var(--lv-border);display:flex;flex-direction:column;justify-content:space-between">
            <div>
              <b style="font-size:14px;color:var(--lv-brand);display:flex;align-items:center;gap:6px">
                <Icon name="badge" size={15} /> 职业考证
              </b>
              <p class="lv-muted" style="font-size:12px;margin:6px 0 12px;line-height:1.5">
                教师资格证(教资)、基金从业资格、中级会计职称等国家专业证书
              </p>
            </div>
            <button class="lv-btn sm lv-btn--primary" style="width:100%" onclick={() => void oncreateSampleBank("qualification")} disabled={creating || offline} title="体验教资与基金从业资格真题">
              体验考证题库
            </button>
          </div>

          <!-- 2. 大学与硕博 -->
          <div class="lv-card" style="padding:14px;background:var(--lv-surface-2);border-radius:var(--lv-r-2);border:1px solid var(--lv-border);display:flex;flex-direction:column;justify-content:space-between">
            <div>
              <b style="font-size:14px;color:var(--lv-accent);display:flex;align-items:center;gap:6px">
                <Icon name="academic" size={15} /> 大学与硕博
              </b>
              <p class="lv-muted" style="font-size:12px;margin:6px 0 12px;line-height:1.5">
                高等数学微积分、线性代数、考研政治专业课、四六级长难句
              </p>
            </div>
            <button class="lv-btn sm" style="width:100%" onclick={() => void oncreateSampleBank("higher")} disabled={creating || offline} title="体验大学高数与考研真题">
              体验高数题库
            </button>
          </div>

          <!-- 3. 多语言研学 (英语+粤语) -->
          <div class="lv-card" style="padding:14px;background:var(--lv-surface-2);border-radius:var(--lv-r-2);border:1px solid var(--lv-border);display:flex;flex-direction:column;justify-content:space-between">
            <div>
              <b style="font-size:14px;color:var(--lv-scene-lang, var(--lv-accent));display:flex;align-items:center;gap:6px">
                <Icon name="volume" size={15} /> 多语言研学
              </b>
              <p class="lv-muted" style="font-size:12px;margin:6px 0 12px;line-height:1.5">
                雅思核心学术词(IPA音标/en-US发音)与地道粤语日常口语
              </p>
            </div>
            <div class="lv-row" style="margin:0;gap:4px">
              <button class="lv-btn sm" style="flex:1" onclick={() => void oncreateSampleBank("english")} disabled={creating || offline}>
                英语
              </button>
              <button class="lv-btn sm" style="flex:1" onclick={() => void oncreateSampleBank("cantonese")} disabled={creating || offline}>
                粤语
              </button>
            </div>
          </div>

          <!-- 4. K12基础教育与通识 -->
          <div class="lv-card" style="padding:14px;background:var(--lv-surface-2);border-radius:var(--lv-r-2);border:1px solid var(--lv-border);display:flex;flex-direction:column;justify-content:space-between">
            <div>
              <b style="font-size:14px;color:var(--lv-green);display:flex;align-items:center;gap:6px">
                <Icon name="book" size={15} /> K12基础通识
              </b>
              <p class="lv-muted" style="font-size:12px;margin:6px 0 12px;line-height:1.5">
                小学/初中/高中全科基础、中高考物理数学公式与古诗文
              </p>
            </div>
            <button class="lv-btn sm" style="width:100%" onclick={() => void oncreateSampleBank("k12")} disabled={creating || offline} title="体验K12初高中全科题库">
              体验基础题库
            </button>
          </div>
        </div>

        <div class="lv-row" style="justify-content:center;gap:10px;flex-wrap:wrap;margin:12px 0 0;padding-top:16px;border-top:1px solid var(--lv-border-subtle)">
          <button class="lv-btn lv-btn--primary" onclick={() => onnavView("import", "siyuan")}>
            <Icon name="file" size={15} /> 从思源笔记智能提取试题
          </button>
          <button class="lv-btn lv-btn--ghost" onclick={() => onnavView("import", "standard")}>
            <Icon name="import" size={15} /> 批量导入 (Excel / CSV / Aiken)
          </button>
          <button class="lv-btn lv-btn--ghost" onclick={() => onnavView("manual")}>
            <Icon name="clipboard" size={15} /> 手工录题工坊
          </button>
          {#if banks.length > 1}
            <button class="lv-btn lv-btn--ghost" onclick={onopenBankHub}>
              <Icon name="folder" size={15} /> 切换其他已有题库 ({banks.length})
            </button>
          {/if}
        </div>
      </div>
    {:else if userRole === "teacher"}
      <TeacherWorkspaceView
        practiceQuestionsCount={practiceQuestions.length}
        {teacherPrintBusy}
        {syncDocsBusy}
        {offline}
        {hasBank}
        {t}
        onprintPaper={onprintBankDoubleColumnPaper}
        onexportTeacherPaper={onexportBankTeacherPaper}
        onprintHomework={onprintBankHomeworkSheet}
        onopenReport={onopenReport}
        onopenMock={onopenMock}
        onnavManual={() => onnavView("manual")}
        onnavImport={() => onnavView("import")}
        onnavAi={() => onnavView("ai")}
        onnavMaterials={() => { onnavView("materials"); onloadMaterials(); }}
        onnavBrowse={() => onnavView("browse")}
        onsyncBankDocs={onsyncBankDocs}
        oncopyChallengeCode={oncopyChallengeCode}
        onimportChallengeCode={onimportChallengeCode}
        onexportBank={onexportBank}
      />
    {:else}
      <!-- ===== 👨‍🎓 备考学员与自主研学空间 ===== -->
      {#if plan}
        {#if criticalForgettingKps.length > 0}
          <div class="lv-card lv-ebbinghaus-banner" role="alert">
            <div class="lv-row" style="justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
              <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
                <span class="lv-achievement-pill lv-achievement-pill--seal">
                  <Icon name="flame" size={13} /> 记忆急救
                </span>
                <span style="font-size:var(--lv-font-size-body-compact);font-weight:600;color:var(--lv-text)">
                  检测到 {criticalForgettingKps.length} 个核心考点记忆留存已跌破 35% 临界线！
                </span>
                <span class="lv-chip num sm" style="font-size:11px">{criticalForgettingKps[0].kp} 等</span>
              </div>
              <div class="lv-row" style="margin:0;gap:8px">
                <button class="lv-btn sm lv-btn--primary" onclick={onrescueEbbinghausNow} style="background:var(--lv-accent-seal);border-color:transparent">
                  <Icon name="play" size={13} /> 立即做题抢救 (5题)
                </button>
                <button class="lv-btn sm lv-btn--ghost" onclick={onrescueEbbinghausRecite} title="不看答案先回忆，以纸面背题模式进行记忆抢救">
                  <Icon name="rotate" size={13} /> 背诵抢救
                </button>
              </div>
            </div>
          </div>
        {/if}

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
                <button class="lv-btn lv-btn--ghost" onclick={oncopyTodayReport} title={t("entry.copyReportTip")}>
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
              <span class="lv-chip num sm">{t("entry.weekCount").replace("{n}", String(weekAttemptTotal))}</span>
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
            <span class="lv-goal-ring" class:data-tone={goalPct >= 100 ? "good" : undefined} style="--pct:{goalPct}"></span>
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

      <div class="lv-section-title">
        <span style="display:inline-flex;align-items:center;gap:6px"><Icon name="zap" size={14} /> 阶段一：日常自测与靶向精练</span>
        <span class="lv-muted" style="font-size:12px;font-weight:400">边学边练 · 查漏补缺 · 即时反馈</span>
      </div>
      <div class="lv-modes">
        <button class="lv-mode" disabled={!practiceQuestions.length} title={!practiceQuestions.length ? t("state.emptyBank") : ""} onclick={() => onstartDrill("quick")}>
          <span class="lv-mode-icon lv-mode-icon--quick"><Icon name="zap" /></span><span class="lv-mode-body"><b>{t("mode.quick")}</b><span class="lv-muted">{t("mode.quick.desc")}</span></span>
        </button>
        <button class="lv-mode" disabled={!practiceQuestions.length} title={!practiceQuestions.length ? t("state.emptyBank") : ""} onclick={() => onstartDrill("daily")}>
          <span class="lv-mode-icon lv-mode-icon--daily"><Icon name="calendar" /></span><span class="lv-mode-body"><b>{t("mode.daily")}</b><span class="lv-muted">{t("mode.daily.desc")}</span></span>
        </button>
        <button class="lv-mode" disabled={!wrongList.length} title={!wrongList.length ? t("state.noWrong") : ""} onclick={() => onstartDrill("wrong")}>
          <span class="lv-mode-icon lv-mode-icon--wrong"><Icon name="xcircle" /></span><span class="lv-mode-body"><b>{t("mode.wrong")}</b><span class="lv-muted num">{wrongList.length} {t("mode.wrong.unit")}</span></span>
        </button>
      </div>

      <div class="lv-section-title" style="margin-top:20px">
        <span style="display:inline-flex;align-items:center;gap:6px"><Icon name="rotate" size={14} /> 阶段二：概念内化与纸面背诵</span>
        <span class="lv-muted" style="font-size:12px;font-weight:400">主动回忆 · 遮盖自评 · 听音伴读</span>
      </div>
      <div class="lv-modes">
        <button class="lv-mode lv-mode--minor" disabled={!practiceQuestions.length} title={!practiceQuestions.length ? t("state.emptyBank") : ""} onclick={onstartRecite}>
          <span class="lv-mode-icon lv-mode-icon--recite"><Icon name="rotate" /></span><span class="lv-mode-body"><b>{t("mode.recite")}</b><span class="lv-muted">{t("mode.recite.desc")}</span></span>
        </button>
        <button class="lv-mode lv-mode--minor" disabled={!cramCount} title={!cramCount ? t("state.noCram") : ""} onclick={() => onstartDrill("cram")}>
          <span class="lv-mode-icon lv-mode-icon--cram"><Icon name="flame" /></span><span class="lv-mode-body"><b>{t("mode.cram")}</b><span class="lv-muted">{t("mode.cram.desc")}</span></span>
        </button>
        <button class="lv-mode lv-mode--minor" disabled={!favoriteCount} title={!favoriteCount ? t("state.noFav") : ""} onclick={() => onstartDrill("fav")}>
          <span class="lv-mode-icon lv-mode-icon--fav"><Icon name="star" /></span><span class="lv-mode-body"><b>{t("mode.fav")}</b><span class="lv-muted">{t("mode.fav.desc")}（<span class="num">{favoriteCount}</span> {t("mode.wrong.unit")}）</span></span>
        </button>
        {#if practiceQuestions.filter((q) => (q.userTags || []).includes("star")).length > 0}
          {@const count = practiceQuestions.filter((q) => (q.userTags || []).includes("star")).length}
          <button class="lv-mode lv-mode--minor" onclick={() => onstartDrill("tag:star")}>
            <span class="lv-mode-icon lv-mode-icon--fav"><Icon name="star" size={16} /></span><span class="lv-mode-body"><b>好题特训</b><span class="lv-muted">必背好题专项（<span class="num">{count}</span> {t("mode.wrong.unit")}）</span></span>
          </button>
        {/if}
        {#if practiceQuestions.filter((q) => (q.userTags || []).includes("trap")).length > 0}
          {@const count = practiceQuestions.filter((q) => (q.userTags || []).includes("trap")).length}
          <button class="lv-mode lv-mode--minor" onclick={() => onstartDrill("tag:trap")}>
            <span class="lv-mode-icon lv-mode-icon--wrong"><Icon name="alert-triangle" size={16} /></span><span class="lv-mode-body"><b>陷阱排雷</b><span class="lv-muted">易混陷阱攻坚（<span class="num">{count}</span> {t("mode.wrong.unit")}）</span></span>
          </button>
        {/if}
      </div>

      <!-- 阶段三：全真模考与实战检验 -->
      <div class="lv-card" style="margin-top:22px;padding:16px 20px;border-radius:var(--lv-r-3);background:var(--lv-surface);border:1px solid var(--lv-border);box-shadow:var(--lv-sh-card)">
        <div class="lv-row" style="justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
          <div>
            <span class="lv-eyebrow" style="color:var(--lv-brand);font-weight:600">阶段三：全真模考与实战检验</span>
            <h3 style="margin:4px 0 2px;font-size:16px;color:var(--lv-text)">标准化机考沙盘 · 出版级试卷印刷</h3>
            <p class="lv-muted" style="margin:0;font-size:12px">考试是检验能力的试金石。支持标准限时模考、CBT 答题卡、防漏答强校验与双栏纸笔试卷。</p>
          </div>
          <div class="lv-row" style="margin:0;gap:8px">
            <button class="lv-btn lv-btn--primary" onclick={onopenMock} title="进入全真模拟考场">
              <Icon name="clock" size={15} /> 进入全真模考场
            </button>
            <button class="lv-btn" onclick={onopenReport} title="查看学情诊断报告">
              <Icon name="chart" size={15} /> 查看学情报告
            </button>
          </div>
        </div>
      </div>

      <div class="lv-section-title" style="margin-top:22px">
        <span style="display:inline-flex;align-items:center;gap:6px"><Icon name="compass" size={14} /> {t("entry.tools")}</span>
        <span class="lv-muted" style="font-size:12px;font-weight:400">题库导入、AI出题与资料整理</span>
      </div>
      <div class="lv-row" style="margin-top:0">
        <button class="lv-btn lv-btn--ghost" onclick={() => oncreateSampleBank()} disabled={creating || offline} title={offline ? t("state.offlineHint") : t("guard.demoDesc")}><Icon name="book" size={16} /> {creatingSample ? t("guard.sampleCreating") : t("guard.sampleOpen")}</button>
        <button class="lv-btn lv-btn--ghost" onclick={() => onnavView("import")}><Icon name="import" size={16} /> {t("import.title")}</button>
        <button class="lv-btn lv-btn--ghost" onclick={() => onnavView("ai")}><Icon name="sparkles" size={16} /> {t("ai.title")}</button>
        <button class="lv-btn lv-btn--ghost" onclick={() => onnavView("manual")}><Icon name="pencil" size={16} /> {t("entry.manual")}</button>
        <button class="lv-btn lv-btn--ghost" onclick={() => { onnavView("materials"); onloadMaterials(); }}><Icon name="book" size={16} /> {t("materials.title")}</button>
        <button class="lv-btn" onclick={oncopyChallengeCode}><Icon name="target" size={16} /> {t("challenge.copy")}</button>
        <button class="lv-btn" onclick={onimportChallengeCode}><Icon name="import" size={16} /> {t("challenge.import")}</button>
        <button class="lv-btn" onclick={onsyncBankDocs} disabled={syncDocsBusy || offline || !hasBank} title={t("sync.docsTip")}><Icon name="save" size={16} /> {syncDocsBusy ? "…" : t("sync.docsBtn")}</button>
        <details class="lv-export-fold">
          <summary class="lv-btn"><Icon name="export" size={16} /> {t("export.wrongbook")}</summary>
          <div class="lv-card" style="padding: var(--lv-space-relaxed) var(--lv-space-3);margin-top:6px">
            <div class="lv-row" style="margin:4px 0">
              <span class="lv-chip">{t("manual.kp")}</span>
              <select class="lv-select" bind:value={expKp}>
                <option value="">{t("filter.all")}</option>
                {#each expKpRoots as k, _i (_i)}<option value={k}>{k}</option>{/each}
              </select>
              <span class="lv-chip">{t("session.reason")}</span>
              <select class="lv-select" bind:value={expReason}>
                <option value="">{t("filter.all")}</option>
                <option value="careless">{t("reason.careless")}</option>
                <option value="unknown">{t("reason.unknown")}</option>
                <option value="trap">{t("reason.trap")}</option>
              </select>
              <span class="lv-chip">{t("export.range")}</span>
              <select class="lv-select" bind:value={expDays}>
                <option value={0}>{t("export.allTime")}</option>
                <option value={7}>7{t("entry.days")}</option>
                <option value={30}>30{t("entry.days")}</option>
              </select>
            </div>
            <button class="lv-btn sm lv-btn--primary" onclick={onexportWrong}><Icon name="export" size={14} /> {t("export.run")}</button>
            <div class="lv-row" style="margin:6px 0 0">
              <button class="lv-btn sm" disabled={offline} onclick={onexportBank}><Icon name="export" size={14} /> {t("share.export")}</button>
              <button type="button" class="lv-btn sm" disabled={offline} onclick={() => bankFileInput?.click()}><Icon name="import" size={14} /> {t("share.import")}</button>
              <input bind:this={bankFileInput} type="file" accept=".sy.zip,.zip" hidden onchange={onimportBank} disabled={offline} />
              <span class="lv-muted">{t("share.desktopOnly")}</span>
            </div>
          </div>
        </details>
      </div>
    {/if}
  </div>
{/if}

<style>
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
  .lv-ebbinghaus-banner {
    margin-bottom: 14px;
    padding: 12px 18px;
    border: 1px solid var(--lv-border-subtle, var(--lv-border));
    border-left: 3.5px solid var(--lv-accent-seal);
    background: color-mix(in srgb, var(--lv-accent-seal-soft) 30%, var(--lv-surface));
    border-radius: var(--lv-r-2);
    box-shadow: var(--lv-sh-1);
  }
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
  .lv-week-count { display: grid; place-items: center; width: 32px; height: 32px; border-radius: var(--lv-r-2, 10px); background: var(--lv-surface-2); color: var(--lv-text-3); font-size: 11px; font-weight: 600; font-variant-numeric: tabular-nums; transition: all var(--lv-dur-micro) ease; }
  .lv-week-count.has-attempts { background: var(--lv-data-accent); color: var(--lv-on-data, #fff); box-shadow: 0 2px 8px color-mix(in srgb, var(--lv-data-accent) 35%, transparent); }
  .lv-week-day.is-today .lv-week-count { box-shadow: 0 0 0 2px var(--lv-accent), 0 3px 10px color-mix(in srgb, var(--lv-accent) 30%, transparent); }
  .lv-week-day.is-today:not(:has(.has-attempts)) .lv-week-count { background: var(--lv-accent-soft); color: var(--lv-accent); }
  .lv-week-day-label.today-text { color: var(--lv-accent); font-weight: 700; }
  .lv-week-hint { margin: 0; font-size: 11px; line-height: 1.5; color: var(--lv-text-3); }
  @container lv-exam (max-width: 960px) { .lv-entry-overview { grid-template-columns: minmax(0, 1fr); } }
  .lv-hero-actions { margin-top: 18px; }
  .lv-hero-actions .lv-btn--primary { box-shadow: var(--lv-btn-primary-shadow); }
  @container lv-exam (max-width: 600px) {
    .lv-entry-hero { grid-template-columns: minmax(0,1fr); padding: 18px; }
    .lv-entry-num { border-left: 0; border-top: 1px solid var(--lv-border); padding: 12px 0 0; flex-direction: row; align-items: baseline; gap: var(--lv-space-relaxed); justify-content: flex-start; }
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
  .lv-modes { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--lv-space-loose); }
  .lv-mode { color: var(--lv-text); font: inherit; padding: 18px 20px; border-radius: var(--lv-r-3); text-align: left; background: var(--lv-surface); border: 1px solid var(--lv-border-subtle, var(--lv-border)); cursor: pointer; box-shadow: var(--lv-sh-card, var(--lv-sh-1)), var(--lv-inset-highlight, inset 0 1px 0 transparent); transition: background-color var(--lv-dur-micro) var(--lv-ease-out), border-color var(--lv-dur-micro) var(--lv-ease-out), box-shadow var(--lv-dur-view) var(--lv-ease-out), transform var(--lv-dur-micro) var(--lv-ease-out); display: flex; align-items: flex-start; gap: var(--lv-space-3); }
  .lv-mode:hover:not(:disabled) { box-shadow: 0 6px 20px color-mix(in srgb, var(--lv-brand) 16%, transparent); border-color: var(--lv-brand); background: color-mix(in srgb, var(--lv-brand-soft) 25%, var(--lv-surface)); transform: translateY(-2px); }
  .lv-mode:active:not(:disabled) { transform: translateY(-0.5px) scale(0.985); }
  .lv-mode .lv-mode-icon { color: var(--lv-accent); display: grid; place-items: center; width: 44px; height: 44px; border-radius: var(--lv-r-2); background: var(--lv-accent-soft); flex-shrink: 0; font-size: var(--lv-font-size-stat); box-shadow: 0 2px 8px color-mix(in srgb, var(--lv-accent) 18%, transparent); transition: transform var(--lv-dur-micro) var(--lv-ease-out), background-color var(--lv-dur-micro) var(--lv-ease-out); }
  .lv-mode-icon--quick { background: var(--lv-amber-soft) !important; color: var(--lv-amber) !important; box-shadow: 0 2px 8px color-mix(in srgb, var(--lv-amber) 22%, transparent) !important; }
  .lv-mode-icon--daily { background: var(--lv-accent-soft) !important; color: var(--lv-accent) !important; box-shadow: 0 2px 8px color-mix(in srgb, var(--lv-accent) 22%, transparent) !important; }
  .lv-mode-icon--wrong { background: var(--lv-red-soft) !important; color: var(--lv-red) !important; box-shadow: 0 2px 8px color-mix(in srgb, var(--lv-red) 22%, transparent) !important; }
  .lv-mode-icon--recite { background: color-mix(in srgb, var(--lv-accent) 15%, transparent) !important; color: var(--lv-accent) !important; box-shadow: var(--lv-sh-1) !important; }
  .lv-mode-icon--cram { background: color-mix(in srgb, var(--lv-amber) 24%, var(--lv-red-soft)) !important; color: var(--lv-red) !important; box-shadow: 0 2px 8px color-mix(in srgb, var(--lv-red) 16%, transparent) !important; }
  .lv-mode-icon--fav { background: color-mix(in srgb, var(--lv-amber) 20%, transparent) !important; color: var(--lv-amber) !important; box-shadow: var(--lv-sh-1) !important; }
  .lv-mode:hover:not(:disabled) .lv-mode-icon { transform: scale(1.06); background: color-mix(in srgb, var(--lv-accent) 16%, var(--lv-surface)); }
  .lv-mode .lv-mode-body { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
  .lv-mode b { font-size: var(--lv-font-size-md); font-weight: var(--lv-font-weight-semibold); letter-spacing: -0.01em; }
  .lv-mode:disabled { opacity: .62; cursor: not-allowed; }
  .lv-mode--minor .lv-mode-icon { background: var(--lv-surface-2); color: var(--lv-text-2); box-shadow: var(--lv-sh-1); }
  .lv-mode--minor:hover:not(:disabled) .lv-mode-icon { background: color-mix(in srgb, var(--lv-text) 8%, var(--lv-surface-2)); }
  .lv-mode--minor b { font-size: var(--lv-font-size-body-compact); font-weight: 600; }
  @container lv-exam (max-width: 960px) { .lv-modes { grid-template-columns: repeat(2, 1fr); } }
  @container lv-exam (max-width: 480px) { .lv-modes { grid-template-columns: 1fr; } }
</style>
