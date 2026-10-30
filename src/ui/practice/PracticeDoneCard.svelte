<script lang="ts">
  import Icon from "../shared/Icon.svelte";
  import type { PracticeSession } from "@/core/session";
  import type { Question } from "@/core/types";

  interface Props {
    sessionDone: {
      total: number;
      correct: number;
      wrong: number;
      initialTotal?: number;
      initialCorrect?: number;
      delayedTotal?: number;
      delayedRecovered?: number;
      totalTimeS?: number;
      avgTimeS?: number;
    };
    streakDays: number;
    kpBreakdown: Array<{ kp: string; total: number; correct: number; wrong: number }>;
    checkinStatus?: string;
    checkinNote?: string;
    settleMode: string;
    session: PracticeSession;
    questionMap: Map<string, Question>;
    reviewOpen: boolean;
    reflections: Record<string, { at: number; text: string }>;
    misdiagnosisBusy?: string;
    misdiagnosisText: Record<string, string>;
    helpShown: { get(qid: string): unknown };
    actionBusy: boolean;
    actionNote: string;
    exitBusy: boolean;
    t: (k: string, fb?: string) => string;
    queueSemantics: (m: string) => { label: string; kind: string };
    writeBackReceipt: (m: string) => string;
    ontoggleReview: () => void;
    onsameKpSession: () => void;
    onwrongsToCard: () => void;
    onwrongsToActions: () => void;
    onopenReport: () => void;
    onstartNextDrill: () => void;
    oneditReflection: (qid: string) => void;
    onrunMisdiagnosis: (a: any) => void;
    onadoptMisdiagnosis: (qid: string) => void;
    onexitSession: () => void;
  }

  let {
    sessionDone,
    streakDays,
    kpBreakdown,
    checkinStatus,
    checkinNote,
    settleMode,
    session,
    questionMap,
    reviewOpen,
    reflections,
    misdiagnosisBusy,
    misdiagnosisText,
    helpShown,
    actionBusy,
    actionNote,
    exitBusy,
    t,
    queueSemantics,
    writeBackReceipt,
    ontoggleReview,
    onsameKpSession,
    onwrongsToCard,
    onwrongsToActions,
    onopenReport,
    onstartNextDrill,
    oneditReflection,
    onrunMisdiagnosis,
    onadoptMisdiagnosis,
    onexitSession,
  }: Props = $props();
</script>

<div class="lv-pad lv-center">
  <div class="lv-card lv-guard" style="border-top:3.5px solid var(--lv-brand);box-shadow:var(--lv-sh-pop)">
    <div class="lv-guard-title" style="color:var(--lv-brand);display:flex;align-items:center;justify-content:center;gap:6px">
      <Icon name="trophy" size={20} />
      <span>{t("session.done")}</span>
      <span style="font-size:13px;opacity:0.85">· {sessionDone.correct > 0 && sessionDone.wrong === 0 ? "满分通关！" : sessionDone.wrong === 0 ? "完成自评！" : sessionDone.correct >= sessionDone.wrong ? "战绩优异！" : "查漏补缺！"}</span>
    </div>
    <!-- 战报成就胶囊矩阵（9999px） -->
    <div class="lv-row" style="justify-content:center;gap:6px;margin:8px 0 14px;flex-wrap:wrap">
      <span class="lv-achievement-pill">
        <Icon name="target" size={13} /> {sessionDone.total > 0 ? Math.round((sessionDone.correct / sessionDone.total) * 100) : 0}% 正确率
      </span>
      {#if streakDays > 0}
        <span class="lv-achievement-pill lv-achievement-pill--seal">
          <Icon name="flame" size={13} /> 连续 {streakDays} 天自律打卡
        </span>
      {/if}
      <span class="lv-achievement-pill">
        <Icon name="clock" size={13} /> 累计用时 {sessionDone.totalTimeS || 0}s
      </span>
    </div>
    <div class="lv-done-stats num">
      <div><strong>{sessionDone.total}</strong><span>{t("session.total")}</span></div>
      <div class="good"><strong>{sessionDone.correct}</strong><span>{t("session.correct")}</span></div>
      <div class="bad"><strong>{sessionDone.wrong}</strong><span>{t("session.wrong")}</span></div>
    </div>
    {#if sessionDone.initialTotal}
      <div class="lv-row" style="justify-content:center;gap:var(--lv-space-2);margin:6px 0 2px" role="status">
        <span class="lv-chip num" title={t("session.initialRateTip")}>
          {t("session.initialAccuracy")}: {Math.round((sessionDone.initialCorrect / sessionDone.initialTotal) * 100)}% ({sessionDone.initialCorrect}/{sessionDone.initialTotal})
        </span>
        {#if (sessionDone.delayedTotal ?? 0) > 0}
          <span class="lv-chip lv-chip--grn num" title={t("session.delayedRecoveredTip")}>
            <Icon name="rotate" size={11} /> {t("session.delayedRecovered")}: {sessionDone.delayedRecovered}/{sessionDone.delayedTotal}
          </span>
        {/if}
      </div>
    {/if}
    {#if sessionDone.totalTimeS}
      <div class="lv-row" style="justify-content:center;gap:var(--lv-space-3);margin:6px 0 2px" role="status">
        <span class="lv-chip num"><Icon name="clock" size={12} /> {t("session.totalTime")} {sessionDone.totalTimeS >= 60 ? `${Math.floor(sessionDone.totalTimeS / 60)}m${sessionDone.totalTimeS % 60 ? ` ${sessionDone.totalTimeS % 60}s` : ""}` : `${sessionDone.totalTimeS}s`}</span>
        <span class="lv-chip num">{t("session.avgTime")} {sessionDone.avgTimeS}s</span>
      </div>
    {/if}
    <!-- 39-02：队列身份与写回回执——明确本次是否调用内核 riff 调度，避免「普通练习伪装成内核复习」 -->
    <div class="lv-row" style="justify-content:center;margin:6px 0 2px" role="status">
      <span class="lv-chip num" class:lv-chip--amb={queueSemantics(settleMode).kind === "cram"}
        title={writeBackReceipt(settleMode)}>
        <Icon name="info" size={11} /> {queueSemantics(settleMode).label} · {t("session.noWriteBack")}
      </span>
    </div>
    {#if kpBreakdown.length > 1}
      <!-- 知识点分布：本次会话按考点聚合对错，帮助即时识别薄弱考点 -->
      <div class="lv-row" style="flex-wrap:wrap;justify-content:center;gap:var(--lv-space-1);margin:8px 0 2px">
        {#each kpBreakdown as kp (kp.kp)}
          <span class="lv-chip {kp.wrong > 0 ? 'lv-chip--red' : 'lv-chip--grn'} num" title="{kp.kp}: {kp.correct}/{kp.total}">
            {kp.kp} {kp.correct}/{kp.total}
          </span>
        {/each}
      </div>
    {/if}
    {#if checkinStatus && checkinStatus !== "disabled" && checkinStatus !== "below-threshold" && checkinStatus !== "no-api"}
      <!-- 48-03 lite：打卡桥状态（未配置/未达标/打卡未装时安静不显） -->
      <p class="lv-muted" style="margin:2px 0" role="status">
        <Icon name="calendar" size={12} /> {t("checkin.status." + checkinStatus)}{#if checkinStatus === "pending" && checkinNote}<span class="num">（{checkinNote}）</span>{/if}
      </p>
    {/if}
    {#if session.state.order}
      <!-- 44-03：结算显示本次排序策略（同队列可重放，不能以单次正确率下学习结论） -->
      <p class="lv-muted" style="margin:2px 0">{t("session.orderLabel")}：{session.state.order === "interleaved" ? t("session.orderInter") : t("session.orderAdj")}</p>
    {/if}
    {#if session.state.seed}
      <!-- 65-05 lite：可复现标识（同 seed+同候选池=同卷序；题库版本变化/缺题如实反映为队列差异） -->
      <p class="lv-muted" style="margin:2px 0" role="status">
        <Icon name="hourglass" size={12} /> {t("session.seedLabel")}：<span class="num">{session.state.seed}</span>
      </p>
    {/if}
    {#if session.answered.length}
      <div class="lv-row" style="flex-wrap:wrap;gap:var(--lv-space-1);margin:8px 0">
        {#each session.answered as a, ai (ai)}
          {@const aq = questionMap.get(a.qid)}
          <span class="lv-chip num" class:lv-chip--grn={a.grade.verdict === "correct"} class:lv-chip--red={a.grade.verdict === "wrong"} title={aq?.stem.slice(0, 60) ?? a.qid} style="display:inline-flex;align-items:center;gap:3px">
            <span>{ai + 1}</span>
            {#if a.grade.verdict === "correct"}
              <Icon name="check" size={10} />
            {:else if a.grade.verdict === "wrong"}
              <Icon name="close" size={10} />
            {:else}
              <span>–</span>
            {/if}
            <span>{(a.timeMs / 1000).toFixed(0)}s</span>
          </span>
        {/each}
      </div>
    {/if}
    {#if sessionDone.wrong > 0}
      <div class="lv-card" style="margin:12px 0 10px;padding:16px;background:var(--lv-surface-2);border-radius:var(--lv-r-3, 14px);border:1px solid var(--lv-border-subtle)">
        <div class="lv-row" style="justify-content:space-between;align-items:center;margin:0 0 10px;flex-wrap:wrap;gap:6px">
          <b style="font-size:var(--lv-font-size-body-compact);display:inline-flex;align-items:center;gap:6px">
            <Icon name="target" size={14} /> 发现 {sessionDone.wrong} 道错题 · 推荐即时强化
          </b>
          <button class="lv-btn sm lv-btn--ghost" onclick={ontoggleReview} style="display:inline-flex;align-items:center;gap:4px">
            <Icon name={reviewOpen ? "chev-left" : "chev-right"} size={11} />
            <span>{reviewOpen ? "收起错题" : t("session.reviewWrongs")}</span>
          </button>
        </div>
        <button class="lv-btn lv-btn--primary" style="width:100%;margin-bottom:8px" disabled={actionBusy} onclick={onsameKpSession}>
          <Icon name="rotate" size={15} /> {actionBusy ? "正在发起同考点特训…" : t("memory.sameKp")}
        </button>
        <div class="lv-row" style="margin:0;gap:6px;justify-content:center;flex-wrap:wrap">
          <button class="lv-btn sm lv-btn--ghost" disabled={actionBusy} onclick={onwrongsToCard} title="将错题推送到思源闪卡"><Icon name="layers" size={13} /> {actionBusy ? "…" : t("session.wrongsToCard")}</button>
          <button class="lv-btn sm lv-btn--ghost" disabled={actionBusy} onclick={onwrongsToActions} title="加入待办错题列表"><Icon name="pin" size={13} /> {actionBusy ? "…" : t("action.addWrong")}</button>
          <button class="lv-btn sm lv-btn--ghost" onclick={onopenReport} title="查看学情诊断报告"><Icon name="chart" size={13} /> 学情报告</button>
        </div>
        {#if actionNote}<p class="lv-muted num" style="margin:6px 0 0;text-align:center">{actionNote}</p>{/if}
      </div>
      {#if reviewOpen}
        <div class="lv-detail" style="text-align:left;max-height:260px;overflow:auto;margin-bottom:8px">
          {#each session.answered.filter((a) => a.grade.verdict !== "correct") as a, _ri (_ri)}
            {@const aq = questionMap.get(a.qid)}
            <div class="lv-error-row" style="white-space:normal">
              <b class="num" style="display:inline-flex;align-items:center;color:var(--lv-red)"><Icon name="close" size={13} /></b> {aq?.stem.slice(0, 80) ?? a.qid}
              <div class="lv-muted num">{t("browse.answer")}: {aq?.answer ?? "—"}{#if a.grade.myAnswer} · {t("session.myAnswer")}: {a.grade.myAnswer}{/if}{#if aq?.analysis} · {aq.analysis}{/if}</div>
              {#if reflections[a.qid]}
                <!-- 52-04：上次检查点回显 -->
                <div class="lv-muted" style="font-size:var(--lv-font-size-caption)"><Icon name="pencil" size={12} /> {t("reflection.last").replace("{d}", new Date(reflections[a.qid].at).toLocaleDateString())}：{reflections[a.qid].text}</div>
              {/if}
              <div class="lv-row" style="margin:4px 0 0;gap:var(--lv-space-1)">
                <button class="lv-btn sm lv-btn--ghost" onclick={() => oneditReflection(a.qid)}>
                  <Icon name="pencil" size={13} /> {reflections[a.qid] ? t("reflection.edit") : t("reflection.add")}
                </button>
                <!-- 116-01 T08：AI 错因假设（事实→假设→验证行动；采纳由用户操作） -->
                <button class="lv-btn sm lv-btn--ghost" disabled={misdiagnosisBusy === a.qid}
                  onclick={() => onrunMisdiagnosis(a)}>
                  <Icon name="flask" size={13} /> {misdiagnosisBusy === a.qid ? "…" : t("misdiagnosis.ask")}
                </button>
              </div>
              {#if misdiagnosisText[a.qid]}
                <div class="lv-detail" style="margin:4px 0 0;font-size:var(--lv-font-size-sm);white-space:pre-wrap;overflow-wrap:anywhere">{misdiagnosisText[a.qid]}</div>
                <div class="lv-muted" style="font-size:var(--lv-font-size-compact)">{t("misdiagnosis.disclaimer")}</div>
                <button class="lv-btn sm lv-btn--ghost" onclick={() => onadoptMisdiagnosis(a.qid)} style="display:inline-flex;align-items:center;gap:4px"><Icon name="plus" size={13} /> {t("misdiagnosis.adopt")}</button>
              {/if}
            </div>
          {/each}
          {#if session.answered.some((a) => a.grade.verdict === "correct" && helpShown.get(a.qid))}
            <!-- 114-05 lite：受助答对 → 自我解释（用自己的话说明依据；可跳过；与错题复盘同层存储） -->
            <div class="lv-muted" style="margin:8px 0 2px;font-size:var(--lv-font-size-caption)"><Icon name="bulb" size={12} /> {t("selfexplain.header")}</div>
            {#each session.answered.filter((a) => a.grade.verdict === "correct" && helpShown.get(a.qid)) as a, _si2 (_si2)}
              {@const aq = questionMap.get(a.qid)}
              <div class="lv-error-row" style="white-space:normal">
                <b class="num" style="display:inline-flex;align-items:center;color:var(--lv-green)"><Icon name="check" size={13} /></b> {aq?.stem.slice(0, 80) ?? a.qid}
                {#if reflections[a.qid]}
                  <div class="lv-muted" style="font-size:var(--lv-font-size-caption)">{reflections[a.qid].text}</div>
                {/if}
                <button class="lv-btn sm lv-btn--ghost" onclick={() => oneditReflection(a.qid)}>
                  <Icon name="message" size={13} /> {reflections[a.qid] ? t("selfexplain.edit") : t("selfexplain.add")}
                </button>
              </div>
            {/each}
          {/if}
        </div>
      {/if}
    {:else}
      <div class="lv-card" style="margin:10px 0 8px;padding:14px;background:var(--lv-surface-2);border-radius:var(--lv-r-3, 16px);border:1px solid var(--lv-border-subtle);text-align:center">
        <b style="color:var(--lv-green);font-size:14px;display:inline-flex;align-items:center;gap:6px;margin-bottom:8px">
          <Icon name="trophy" size={16} /> 全部正确，达成全对通关！
        </b>
        <div class="lv-row" style="margin:0;gap:8px;justify-content:center">
          <button class="lv-btn sm lv-btn--primary" onclick={onstartNextDrill}>
            <Icon name="zap" size={14} /> 开启下一轮练习
          </button>
          <button class="lv-btn sm lv-btn--ghost" onclick={onopenReport}>
            <Icon name="chart" size={14} /> 查看学情诊断
          </button>
        </div>
      </div>
    {/if}
    <button class="lv-btn" style="width:100%;margin-top:6px" onclick={onexitSession} disabled={exitBusy}>{exitBusy ? "…" : t("session.back")}</button>
  </div>
</div>
