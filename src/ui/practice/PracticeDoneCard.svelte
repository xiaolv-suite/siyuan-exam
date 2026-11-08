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
    /** benchmark-fusion（Moodle CBM）：本次会话蒙对/自信错归集信号 */
    cbmSettle?: { fragile: { qid: string; confidence: string }[]; highrisk: { qid: string; myAnswer: string | null }[] } | null;
    /** benchmark-fusion（Kangaroo）：薄弱标签排行（正确率 < 60%，最弱优先） */
    weakRank?: { root: string; total: number; correct: number; accuracy: number }[];
    weakDrillBusy?: boolean;
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
    onweakSpotDrill: () => void;
    onwrongsToCard: () => void;
    onwrongsToActions: () => void;
    onopenReport: () => void;
    onstartNextDrill: () => void;
    oneditReflection: (qid: string) => void;
    onrunMisdiagnosis: (a: any) => void;
    onadoptMisdiagnosis: (qid: string) => void;
    onopenInSiYuan?: (rootId: string, blockId?: string, opt?: any) => void;
    onexitSession: () => void;
    trails?: Map<string, any>;
  }

  let {
    sessionDone,
    streakDays,
    kpBreakdown,
    cbmSettle = null,
    weakRank = [],
    weakDrillBusy = false,
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
    onweakSpotDrill,
    onwrongsToCard,
    onwrongsToActions,
    onopenReport,
    onstartNextDrill,
    oneditReflection,
    onrunMisdiagnosis,
    onadoptMisdiagnosis,
    onopenInSiYuan,
    onexitSession,
    trails,
  }: Props = $props();

  // 时长格式化：60s 以下直接秒，以上折叠为 m s，成就胶囊唯一呈现避免重复展示
  const fmtDuration = (s?: number) => {
    const v = Math.max(0, Math.round(s ?? 0));
    if (v < 60) return `${v}s`;
    const m = Math.floor(v / 60);
    const r = v % 60;
    return r ? `${m}m ${r}s` : `${m}m`;
  };
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
      <span class="lv-achievement-pill num">
        <Icon name="target" size={13} /> {sessionDone.total > 0 ? Math.round((sessionDone.correct / sessionDone.total) * 100) : 0}% 正确率
      </span>
      {#if streakDays > 0}
        <span class="lv-achievement-pill lv-achievement-pill--seal num">
          <Icon name="flame" size={13} /> 连续 {streakDays} 天自律打卡
        </span>
      {/if}
      <span class="lv-achievement-pill num" title="本次会话有效答题总时长">
        <Icon name="clock" size={13} /> 累计用时 {fmtDuration(sessionDone.totalTimeS)}
      </span>
      {#if sessionDone.totalTimeS && sessionDone.total > 0}
        <span class="lv-achievement-pill num" title="平均单题有效专注答题时长">
          <Icon name="zap" size={13} /> 题均 {sessionDone.avgTimeS || Math.round(sessionDone.totalTimeS / sessionDone.total)}s
        </span>
      {/if}
    </div>
    <div class="lv-done-stats num">
      <div><strong>{sessionDone.total}</strong><span>{t("session.total")}</span></div>
      <div class="good"><strong>{sessionDone.correct}</strong><span>{t("session.correct")}</span></div>
      <div class="bad"><strong>{sessionDone.wrong}</strong><span>{t("session.wrong")}</span></div>
    </div>
    {#if sessionDone.initialTotal}
      <div class="lv-row" style="justify-content:center;gap:var(--lv-space-2);margin:6px 0 2px" role="status">
        <span class="lv-chip lv-chip--data num" title={t("session.initialRateTip")}>
          {t("session.initialAccuracy")}: {Math.round((sessionDone.initialCorrect / sessionDone.initialTotal) * 100)}% ({sessionDone.initialCorrect}/{sessionDone.initialTotal})
        </span>
        {#if (sessionDone.delayedTotal ?? 0) > 0}
          <span class="lv-chip lv-chip--grn num" title={t("session.delayedRecoveredTip")}>
            <Icon name="rotate" size={11} /> {t("session.delayedRecovered")}: {sessionDone.delayedRecovered}/{sessionDone.delayedTotal}
          </span>
        {/if}
      </div>
    {/if}
    <!-- 时长信息已收敛至顶部成就胶囊（累计用时/题均），此处不再重复展示 -->
    <!-- 39-02：队列身份与写回回执——明确本次是否调用内核 riff 调度，避免「普通练习伪装成内核复习」 -->
    <div class="lv-row" style="justify-content:center;margin:6px 0 2px" role="status">
      <span class="lv-chip num" class:lv-chip--amb={queueSemantics(settleMode).kind === "cram"}
        title={writeBackReceipt(settleMode)}>
        <Icon name="info" size={11} /> {queueSemantics(settleMode).label} · {t("session.noWriteBack")}
      </span>
    </div>
    {#if (cbmSettle?.fragile.length ?? 0) > 0 || (cbmSettle?.highrisk.length ?? 0) > 0}
      <!-- benchmark-fusion（Moodle CBM 标杆）：结算自动归集——蒙对入脆弱伪掌握，自信错标高危盲区 -->
      <div class="lv-row" style="justify-content:center;gap:6px;margin:6px 0 2px;flex-wrap:wrap" role="status">
        {#if (cbmSettle?.fragile.length ?? 0) > 0}
          <span class="lv-chip lv-chip--amb num" title={t("cbm.fragile.desc", "自评「模糊/猜测」却蒙对——得分可能来自运气，已归入错题本脆弱伪掌握分栏")}>
            <Icon name="help" size={11} /> {t("cbm.settleFragile", "蒙对 {n} 题已归入脆弱伪掌握").replace("{n}", String(cbmSettle!.fragile.length))}
          </span>
        {/if}
        {#if (cbmSettle?.highrisk.length ?? 0) > 0}
          <span class="lv-chip lv-chip--red num" title={t("cbm.highrisk.desc", "自评「确定」却答错——疑似概念性误区，已在错题本高危盲区分栏置顶")}>
            <Icon name="xcircle" size={11} /> {t("cbm.settleHighrisk", "自信答错 {n} 题已标为高危盲区").replace("{n}", String(cbmSettle!.highrisk.length))}
          </span>
        {/if}
      </div>
    {/if}
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
    {#if weakRank.length}
      <!-- benchmark-fusion（Kangaroo 标杆）：薄弱标签排行榜 + 「立即针对薄弱点再练 10 题」智能抽样组卷 -->
      <div class="lv-card" style="margin:12px 0 10px;padding:14px 16px;background:var(--lv-surface-2);border-radius:var(--lv-r-3, 14px);border:1px solid var(--lv-border-subtle);text-align:left">
        <b style="font-size:var(--lv-font-size-body-compact);display:inline-flex;align-items:center;gap:6px">
          <Icon name="target" size={13} /> {t("weakspot.rankTitle", "薄弱标签排行")}（{t("weakspot.below", "正确率低于 60%")}）
        </b>
        <div class="stack-sm" style="margin:8px 0 10px">
          {#each weakRank as w, wi (w.root)}
            <div class="lv-row" style="margin:0;gap:8px;align-items:center">
              <span class="task-number num" style="background:color-mix(in srgb, var(--lv-red) 14%, transparent);color:var(--lv-red-deep, var(--lv-red));min-width:26px;text-align:center">{wi + 1}</span>
              <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title={w.root}>{w.root}</span>
              <div class="lv-progress" style="flex:1;min-width:80px"><i style="width:{Math.round(w.accuracy * 100)}%;background:var(--lv-red)"></i></div>
              <span class="lv-chip lv-chip--red num" style="min-width:44px;justify-content:center">{Math.round(w.accuracy * 100)}%</span>
              <span class="lv-muted num" style="min-width:52px;text-align:right">{w.correct}/{w.total}</span>
            </div>
          {/each}
        </div>
        <button class="lv-btn lv-btn--primary" style="width:100%" disabled={weakDrillBusy} aria-busy={weakDrillBusy} onclick={onweakSpotDrill}
          title={t("weakspot.drillTip", "按「历史错题优先 → 未做新题补充 → 已做对兜底」从薄弱考点智能抽样 10 题")}>
          <Icon name="zap" size={14} /> {weakDrillBusy ? t("weakspot.drilling", "正在组卷…") : t("weakspot.drill10", "立即针对薄弱点再练 10 题")}
        </button>
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
          <button class="lv-btn sm lv-btn--ghost" aria-expanded={reviewOpen} onclick={ontoggleReview} style="display:inline-flex;align-items:center;gap:4px">
            <Icon name={reviewOpen ? "arrow-down" : "chev-right"} size={11} />
            <span>{reviewOpen ? "收起错题" : t("session.reviewWrongs")}</span>
          </button>
        </div>
        <button class="lv-btn lv-btn--primary" style="width:100%;margin-bottom:8px" disabled={actionBusy} aria-busy={actionBusy} onclick={onsameKpSession}>
          <Icon name="rotate" size={15} /> {actionBusy ? "正在发起同考点特训…" : t("memory.sameKp")}
        </button>
        <div class="lv-row" style="margin:0;gap:6px;justify-content:center;flex-wrap:wrap">
          <button class="lv-btn sm lv-btn--ghost" disabled={actionBusy} aria-busy={actionBusy} onclick={onwrongsToCard} title="将错题推送到思源闪卡"><Icon name="layers" size={13} /> {actionBusy ? "…" : t("session.wrongsToCard")}</button>
          <button class="lv-btn sm lv-btn--ghost" disabled={actionBusy} aria-busy={actionBusy} onclick={onwrongsToActions} title="加入待办错题列表"><Icon name="pin" size={13} /> {actionBusy ? "…" : t("action.addWrong")}</button>
          <button class="lv-btn sm lv-btn--ghost" onclick={onopenReport} title="查看学情诊断报告"><Icon name="chart" size={13} /> 学情报告</button>
        </div>
        {#if actionNote}<p class="lv-muted num" role="status" style="margin:6px 0 0;text-align:center">{actionNote}</p>{/if}
      </div>
      {#if reviewOpen}
        <div class="lv-detail" style="text-align:left;max-height:260px;overflow:auto;margin-bottom:8px">
          {#each session.answered.filter((a) => a.grade.verdict !== "correct") as a, _ri (_ri)}
            {@const aq = questionMap.get(a.qid)}
            {@const tr = trails?.get(a.qid)}
            <div class="lv-error-row" style="white-space:normal">
              <b class="num" style="display:inline-flex;align-items:center;color:var(--lv-red)"><Icon name="close" size={13} /></b> {aq?.stem.slice(0, 80) ?? a.qid}
              <div class="lv-muted num">{t("browse.answer")}: {aq?.answer ?? "—"}{#if a.grade.myAnswer} · {t("session.myAnswer")}: {a.grade.myAnswer}{/if}{#if aq?.analysis} · {aq.analysis}{/if}</div>
              {#if tr && tr.edits && tr.edits.length > 0}
                <div class="lv-chip sm lv-chip--amb" style="margin-top:3px;display:inline-flex;align-items:center;gap:4px">
                  <Icon name="rotate" size={11} /> 犹豫轨迹：首选 {tr.first} → 最终改选 {tr.edits[tr.edits.length - 1].to}（改答 {tr.edits.length} 次）
                </div>
              {/if}
              {#if reflections[a.qid]}
                <!-- 52-04：上次检查点回显 -->
                <div class="lv-muted" style="font-size:var(--lv-font-size-caption)"><Icon name="pencil" size={12} /> {t("reflection.last").replace("{d}", new Date(reflections[a.qid].at).toLocaleDateString())}：{reflections[a.qid].text}</div>
              {/if}
              <div class="lv-row" style="margin:4px 0 0;gap:var(--lv-space-1);flex-wrap:wrap">
                <button class="lv-btn sm lv-btn--ghost" onclick={() => oneditReflection(a.qid)}>
                  <Icon name="pencil" size={13} /> {reflections[a.qid] ? t("reflection.edit") : t("reflection.add")}
                </button>
                <!-- 116-01 T08：AI 错因假设（事实→假设→验证行动；采纳由用户操作） -->
                <button class="lv-btn sm lv-btn--ghost" disabled={misdiagnosisBusy === a.qid} aria-busy={misdiagnosisBusy === a.qid}
                  onclick={() => onrunMisdiagnosis(a)}>
                  <Icon name="flask" size={13} /> {misdiagnosisBusy === a.qid ? "…" : t("misdiagnosis.ask")}
                </button>
                {#if aq?.blockId && onopenInSiYuan}
                  <button class="lv-btn sm lv-btn--ghost" onclick={(e) => onopenInSiYuan(aq.rootId || "", aq.blockId, { event: e })} title="在思源笔记中打开并高亮原题块（按住 Ctrl/Cmd 点击可在右侧分屏打开）">
                    <Icon name="link" size={13} /> {t("session.stageSourceOpen", "打开思源原块")} ↗
                  </button>
                {/if}
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
