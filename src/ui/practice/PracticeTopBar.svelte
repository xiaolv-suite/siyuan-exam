<script lang="ts">
  import Icon from "../shared/Icon.svelte";
  import SaveStatus from "../shared/SaveStatus.svelte";
  import type { ExamApp, BankInfo } from "../../app";

  interface Props {
    view: string;
    sessionDone: any;
    railOpen: boolean;
    bankName: string;
    t: (k: string, fb?: string) => string;
    app: ExamApp | null;
    offline: boolean;
    plan: any;
    examProfileList: any[];
    planTrace: any;
    planTime: any;
    checkinStreak: number | null | undefined;
    banks: BankInfo[];
    activeBankId: string;
    hasBank: boolean;
    importBusy: boolean;
    mSaving: boolean;
    aiMutationBusy: boolean;
    session: any;
    reciteDone: boolean;
    reciteQueue: any[];
    menuBtn?: HTMLButtonElement | null;
    onopenRail: () => void;
    onopenPalette: () => void;
    onbankSwitch: () => void;
    onopenBankHub: () => void;
    onopenMarketplace: () => void;
    oncloseMobile: () => void;
  }

  let {
    view,
    sessionDone,
    railOpen,
    bankName,
    t,
    app,
    offline,
    plan,
    examProfileList,
    planTrace,
    planTime,
    checkinStreak,
    banks,
    activeBankId = $bindable(),
    hasBank,
    importBusy,
    mSaving,
    aiMutationBusy,
    session,
    reciteDone,
    reciteQueue,
    menuBtn = $bindable(),
    onopenRail,
    onopenPalette,
    onbankSwitch,
    onopenBankHub,
    onopenMarketplace,
    oncloseMobile,
  }: Props = $props();

  let isSessionBusy = $derived((view === "session" && !!session && !sessionDone) || (view === "recite" && !reciteDone && !!reciteQueue.length));
  let isActionBusy = $derived(importBusy || mSaving || aiMutationBusy || isSessionBusy);
</script>

<div class="block__icons" class:lv-focus-toolbar={view === "session" && !sessionDone}>
  <button class="lv-menu-btn" aria-label={t("menu.open")} aria-expanded={railOpen} bind:this={menuBtn} onclick={onopenRail}><Icon name="menu" size={16} /></button>
  <!-- 原型 .breadcrumbs：题库 / 当前页（muted/当前 双色导航语境） -->
  {#if view === "session" && !sessionDone}<div class="lv-focus-brand"><Icon name="book" size={15} /><strong>{t("session.focusTitle", "专注练习")}</strong></div>{/if}
  <div class="lv-crumbs" class:lv-focus-context={view === "session" && !sessionDone}>
    <span class="lv-crumb">{bankName || t("guard.title")}</span>
    <span class="lv-crumb-sep" aria-hidden="true">/</span>
    <span class="lv-crumb-current">{t("tab.practice")}</span>
  </div>
  {#if app?.saves}<SaveStatus gate={app.saves} {t} />{/if}
  <span class="fn__flex-1 lv-topbar-spacer"></span>
  <button class="lv-btn lv-btn--ghost sm lv-palette-btn" onclick={onopenPalette} title="Ctrl / ⌘ K" aria-label="打开全局命令面板">
    <Icon name="search" size={13} /> <span class="lv-palette-label">{t("palette.open")}</span> <span class="lv-kbd">⌘K</span>
  </button>
  {#if app && (offline || app.lastKernelError?.category === "auth" || app.lastKernelError?.category === "permission" || app.lastKernelError?.category === "validation" || app.lastKernelError?.category === "not-found")}
    <span class="lv-chip lv-chip--amb" title={app.kernelRecoveryHint()} aria-label={app.kernelRecoveryHint()}>
      {app.lastKernelError?.category === "auth" ? "未授权" : app.lastKernelError?.category === "permission" ? "无权限" : app.lastKernelError?.category === "validation" ? "输入有误" : app.lastKernelError?.category === "not-found" ? "接口不存在" : t("state.offline")}
    </span>
  {/if}
  {#if plan}
    <span class="lv-focus-context lv-plan-context">
    {#if plan.mode === "sprint"}<span class="lv-chip lv-chip--red num"><Icon name="flame" size={12} /> {t("entry.sprint")} D-{plan.daysToExam}</span>
    {:else if plan.daysToExam != null}<span class="lv-chip amb num"><Icon name="clock" size={12} /> {t("entry.examIn")} {plan.daysToExam} {t("entry.days")}</span>{/if}
    {#if examProfileList.filter((p) => p.days != null && p.days >= 0).length > 1}
      <!-- 53-02 lite：多考期并存展示（计划锚定最近，其余一目了然） -->
      {#each examProfileList.filter((p) => p.days != null && p.days >= 0) as p, _pi (_pi)}
        <span class="lv-chip num" title={t("entry.profileTip")}><Icon name="pin" size={12} /> {p.name} D-{p.days}</span>
      {/each}
    {/if}
    {#if planTrace && planTrace.absentStreak >= 2}
      <!-- 44-05 lite：连续缺席提醒（配额恒定不爆量，仅可见性） -->
      <span class="lv-chip lv-chip--amb num" title={t("entry.absentTip")}><Icon name="alert-triangle" size={11} /> {t("entry.absent").replace("{n}", String(planTrace.absentStreak))}</span>
    {:else if planTrace && planTrace.planned > 0 && planTrace.done >= 0}
      <span class="lv-chip num" title={t("entry.yesterdayTip")}><Icon name="calendar" size={12} /> {t("entry.yesterday").replace("{p}", String(planTrace.planned)).replace("{d}", String(planTrace.done))}</span>
    {/if}
    {#if planTime && view !== "entry"}
      <!-- 53-01 lite：分钟预算 chip（入口页已在 hero 卡内展示，避免重复） -->
      <span class="lv-chip num" title={planTime.sourced ? t("entry.timeSourced") : t("entry.timeDefault")}>
        <Icon name="hourglass" size={12} /> ~{planTime.minutes} {t("entry.minutes")}（{planTime.low}-{planTime.high}）
      </span>
    {/if}
    </span>
  {/if}
  {#if checkinStreak != null && checkinStreak > 0}
    <!-- 48-04 lite：打卡→考试只读投影（连续数由打卡单一实现计算，考试侧不自算） -->
    <span class="lv-chip num lv-focus-context lv-checkin-chip" title={t("entry.checkinStreakTip")}><Icon name="flame" size={12} /> {t("entry.checkinStreak").replace("{n}", String(checkinStreak))}</span>
  {/if}
  <div class="lv-row lv-focus-context lv-bank-picker-group" style="margin:0;gap:6px;align-items:center">
    {#if banks.length > 1}
      <!-- 多库切换：紧凑圆角下拉框 -->
      <select class="lv-select sm" style="max-width:160px" bind:value={activeBankId} onchange={onbankSwitch} disabled={isActionBusy} title={isSessionBusy ? t("bank.sessionHint") : (importBusy || mSaving || aiMutationBusy) ? t("bank.busyHint") : t("bank.label")} aria-label={t("bank.label", "切换当前题库")}>
        {#each banks as b, _i (_i)}<option value={b.id}>{b.name}</option>{/each}
      </select>
    {:else if hasBank}
      <span class="lv-chip sm">{bankName}</span>
    {/if}
    <button class="lv-btn sm lv-btn--ghost" onclick={onopenBankHub} disabled={isActionBusy} title={t("bank.hubTitle")} aria-label={t("bank.hubTitle")}><Icon name="folder" size={13} /> <span class="lv-topbar-btn-label">{t("bank.hubTitle")}</span></button>
    <button
      type="button"
      class="lv-btn sm lv-btn--ghost"
      onclick={onopenMarketplace}
      disabled={isActionBusy}
      title="题库与闪卡公共集市：精选公版题库与网络卡包"
      aria-label="题库集市"
    >
      <Icon name="sparkles" size={13} /> <span class="lv-topbar-btn-label">🏛️ 题库集市</span>
    </button>
  </div>
  <button type="button" class="lv-mobile-close-btn" aria-label="关闭" title="关闭" onclick={oncloseMobile}>
    <Icon name="close" size={18} />
  </button>
</div>
