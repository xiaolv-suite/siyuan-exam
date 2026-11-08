<script lang="ts">
  import Icon from "../shared/Icon.svelte";
  import SpeechEvalCapsule from "./SpeechEvalCapsule.svelte";
  import type { Question } from "../../core/types";
  import { formatDisplayAnswer } from "@/core/answer";
  import type { SpeechEvalResult } from "@/core/speechEval";
  import { renderOcclusionSvg } from "@/core/imageOcclusion";

  interface Props {
    reciteQueue: Question[];
    reciteCursor: number;
    reciteRevealed: boolean;
    reciteDone: boolean;
    reciteRatings: number[];
    reciteAutoTts: boolean;
    ttsSlowRate: boolean;
    studyFontSize: string;
    speechEvalEnabled?: boolean;
    speechRecording?: boolean;
    speechEvalResult?: SpeechEvalResult | null;
    reciteMaterial: string;
    stemHtml: string;
    reciteHint: number;
    reciteSaving: boolean;
    reciteOutcome: any;
    reciteError: string;
    t: (k: string, fb?: string) => string;
    renderInlineText: (s: string) => string;
    ttsSupported: () => boolean;
    onexit: () => void;
    oncycleStudyFontSize: () => void;
    onstartSpeech?: (target: string, lang: string) => void;
    onjumpSource: (e?: MouseEvent | KeyboardEvent) => void;
    onttsSpeak: (text: string, opt?: any) => void;
    onretryForgot: () => void;
    onforgotToCard: () => void;
    onforgotToActions: () => void;
    onopenReport: () => void;
    onstartNextRecite: () => void;
    onreveal: () => void;
    onrateSelf: (r: 1 | 2 | 3 | 4) => void;
    ondismissSpeechEval?: () => void;
    ontoggleAutoTts: () => void;
    ontoggleTtsSlow: () => void;
    ontoggleHint: () => void;
  }

  let {
    reciteQueue,
    reciteCursor,
    reciteRevealed,
    reciteDone,
    reciteRatings,
    reciteAutoTts,
    ttsSlowRate,
    studyFontSize,
    speechEvalEnabled = false,
    speechRecording = false,
    speechEvalResult = null,
    reciteMaterial,
    stemHtml,
    reciteHint,
    reciteSaving,
    reciteOutcome,
    reciteError,
    t,
    renderInlineText,
    ttsSupported,
    onexit,
    oncycleStudyFontSize,
    onstartSpeech,
    onjumpSource,
    onttsSpeak,
    onretryForgot,
    onforgotToCard,
    onforgotToActions,
    onopenReport,
    onstartNextRecite,
    onreveal,
    onrateSelf,
    ondismissSpeechEval,
    ontoggleAutoTts,
    ontoggleTtsSlow,
    ontoggleHint,
  }: Props = $props();
</script>

<div class="lv-pad">
  <div class="lv-row lv-session-head lv-recite-head" style="align-items:center;flex-wrap:wrap;gap:8px">
    <div class="lv-row lv-recite-head-main" style="flex:1;min-width:120px;align-items:center;gap:var(--lv-space-2)">
      <button class="lv-btn lv-btn--ghost lv-recite-exit-btn" onclick={onexit} style="display:inline-flex;align-items:center;gap:4px"><Icon name="chev-left" size={13} /> {t("recite.exit")}</button>
      <div class="lv-progress" style="flex:1;min-width:48px" role="progressbar" aria-label={t("session.progress")} aria-valuemin="0" aria-valuemax={reciteQueue.length} aria-valuenow={reciteCursor + 1}>
        <i style="width:{Math.round(((reciteCursor + (reciteRevealed ? 1 : 0)) / Math.max(1, reciteQueue.length)) * 100)}%"></i>
      </div>
      <span class="lv-chip num">{reciteCursor + 1}/{reciteQueue.length}</span>
    </div>
    <div class="lv-session-dock lv-recite-dock" role="group" aria-label="背诵辅助操作">
      <button type="button" class="lv-chip" class:acc={reciteAutoTts} aria-pressed={reciteAutoTts} aria-label="伴学自动朗读开关" title="伴学自动朗读开关：开启后自动朗读题干与揭示答案" onclick={ontoggleAutoTts}>
        <Icon name="volume" size={12} /> <span class="lv-dock-label">{reciteAutoTts ? "伴读开" : "伴读"}</span>
      </button>
      <button type="button" class="lv-chip num sm" class:acc={ttsSlowRate} aria-pressed={ttsSlowRate} aria-label="切换语音语速" onclick={ontoggleTtsSlow} title="切换语音语速（0.8x 慢速磨耳朵 / 1.0x 正常）">
        {ttsSlowRate ? "0.8x" : "1.0x"}
      </button>
      <button type="button" class="lv-chip num sm" onclick={oncycleStudyFontSize} aria-label="切换题干字号大小" title="切换题干字号大小（标准 16px / 大号 19px / 特大 22px）">
        A{studyFontSize === "normal" ? "" : studyFontSize === "large" ? "⁺" : "²⁺"}
      </button>
      {#if (reciteQueue[reciteCursor]?.studyMeta?.lang || reciteQueue[reciteCursor]?.studyMeta?.phonetic || speechEvalEnabled) && onstartSpeech}
        <button type="button" class="lv-chip" class:acc={speechRecording} aria-pressed={speechRecording} aria-label="开启麦克风发音跟读录音" onclick={() => onstartSpeech(reciteQueue[reciteCursor]?.answer || reciteQueue[reciteCursor]?.stem, reciteQueue[reciteCursor]?.studyMeta?.lang || "zh-CN")} title="开启麦克风发音跟读录音与匹配度测评">
          <Icon name="mic" size={12} /> <span class="lv-dock-label">{speechRecording ? "跟读中…" : "跟读"}</span>
        </button>
      {/if}
      {#if reciteQueue[reciteCursor]?.prerequisites && reciteQueue[reciteCursor].prerequisites!.length > 0}
        <span class="lv-chip sm lv-recite-meta-chip" title="先修依赖考点"><Icon name="compass" size={11} /> 先修: {reciteQueue[reciteCursor].prerequisites!.join("、")}</span>
      {/if}
      {#if reciteQueue[reciteCursor]?.group}
        <span class="lv-chip num lv-recite-meta-chip"><Icon name="link" size={12} /> {t("session.groupPos")}</span>
      {/if}
      {#if reciteQueue[reciteCursor]?.blockId && reciteQueue[reciteCursor]?.rootId}
        <button class="lv-chip" title="在思源笔记中定位并高亮原题块（按住 Ctrl/Cmd 点击可在右侧分屏打开）" aria-label={t("recite.jumpSource")} onclick={(e) => onjumpSource(e)}><Icon name="pin" size={12} /> <span class="lv-dock-label">{t("recite.jumpSource")}</span></button>
      {/if}
      {#if reciteQueue[reciteCursor]}
        <button class="lv-chip" title={ttsSupported() ? t("tts.read") : t("tts.unsupported", "当前前端不支持朗读")} aria-label={t("tts.read")} disabled={!ttsSupported()} onclick={() => onttsSpeak(reciteQueue[reciteCursor].stem, reciteQueue[reciteCursor].studyMeta?.lang ? { lang: reciteQueue[reciteCursor].studyMeta.lang } : 1)}><Icon name="volume" size={13} /></button>
      {/if}
    </div>
  </div>
  {#if reciteDone}
    {@const forgotCount = reciteRatings.filter((x) => x === 1).length}
    <div class="lv-card lv-guard" style="border-radius:var(--lv-r-card, 20px);box-shadow:var(--lv-sh-card);padding:24px">
      <div class="lv-guard-title"><Icon name="trophy" size={18} /> {t("recite.done")}</div>
      <div class="lv-done-stats num" style="grid-template-columns:repeat(4, 1fr);margin:14px 0 10px">
        <div class="bad"><strong>{reciteRatings.filter((x) => x === 1).length}</strong><span>{t("rate.1")}</span></div>
        <div><strong style="color:var(--lv-amber)">{reciteRatings.filter((x) => x === 2).length}</strong><span>{t("rate.2")}</span></div>
        <div class="good"><strong>{reciteRatings.filter((x) => x === 3).length}</strong><span>{t("rate.3")}</span></div>
        <div><strong style="color:var(--lv-data-accent)">{reciteRatings.filter((x) => x === 4).length}</strong><span>{t("rate.4")}</span></div>
      </div>
      <p class="lv-muted" style="font-size:var(--lv-font-size-sm);margin-bottom:14px">{t("recite.doneHint")}</p>
      {#if forgotCount > 0}
        <div class="lv-card" style="margin:10px 0 12px;padding:14px;background:var(--lv-surface-2);border-radius:var(--lv-r-3, 16px);border:1px solid var(--lv-border-subtle)">
          <div class="lv-row" style="justify-content:space-between;align-items:center;margin:0 0 10px">
            <b style="font-size:var(--lv-font-size-body-compact);display:inline-flex;align-items:center;gap:6px">
              <Icon name="rotate" size={14} /> 发现 {forgotCount} 道忘却内容 · 推荐即时重记
            </b>
          </div>
          <button class="lv-btn lv-btn--primary" style="width:100%;margin-bottom:8px" onclick={onretryForgot}>
            <Icon name="rotate" size={15} /> {t("recite.retryForgot")}（{forgotCount}）
          </button>
          <div class="lv-row" style="margin:0;gap:6px;justify-content:center;flex-wrap:wrap">
            <button class="lv-btn sm lv-btn--ghost" onclick={onforgotToCard} title="将忘却题推送到思源闪卡"><Icon name="layers" size={13} /> 推送到闪卡</button>
            <button class="lv-btn sm lv-btn--ghost" onclick={onforgotToActions} title="加入待办列表"><Icon name="pin" size={13} /> 加待办重练</button>
            <button class="lv-btn sm lv-btn--ghost" onclick={onopenReport} title="查看学情诊断报告"><Icon name="chart" size={13} /> 学情报告</button>
          </div>
        </div>
      {:else}
        <div class="lv-card" style="margin:10px 0 12px;padding:14px;background:var(--lv-surface-2);border-radius:var(--lv-r-3, 16px);border:1px solid var(--lv-border-subtle);text-align:center">
          <b style="color:var(--lv-green);font-size:14px;display:inline-flex;align-items:center;gap:6px;margin-bottom:8px">
            <Icon name="trophy" size={16} /> 完美记忆，本轮全部熟练通关！
          </b>
          <div class="lv-row" style="margin:0;gap:8px;justify-content:center">
            <button class="lv-btn sm lv-btn--primary" onclick={onstartNextRecite}>
              <Icon name="rotate" size={14} /> 开启下一轮背诵
            </button>
            <button class="lv-btn sm lv-btn--ghost" onclick={onopenReport}>
              <Icon name="chart" size={14} /> 查看学情报告
            </button>
          </div>
        </div>
      {/if}
      <button class="lv-btn" style="width:100%;margin-top:6px" onclick={onexit}>{t("session.back")}</button>
    </div>
  {:else if reciteQueue[reciteCursor]}
    {@const q = reciteQueue[reciteCursor]}
    <div class="lv-card lv-question lv-paper">
      {#if reciteMaterial}
        <div class="lv-analysis" style="margin-bottom:12px"><b class="lv-mat-chip"><Icon name="paperclip" size={14} /> {t("material.shared")}</b>{reciteMaterial}</div>
      {/if}
      {#if stemHtml}<div class="lv-stem lv-rich b3-typography" class:lv-stem--lg={studyFontSize === "large"} class:lv-stem--xl={studyFontSize === "xlarge"}>{@html stemHtml}</div>{:else}<div class="lv-stem" class:lv-stem--lg={studyFontSize === "large"} class:lv-stem--xl={studyFontSize === "xlarge"}>{q.stem}</div>{/if}
      {#if q.occlusion}
        <div class="lv-occlusion-wrap" style="margin:10px 0 14px;border-radius:var(--lv-r-2, 10px);overflow:hidden;border:1px solid var(--lv-border-subtle);box-shadow:var(--lv-sh-1)">
          {@html renderOcclusionSvg(q.occlusion, { activeMaskId: q.occlusion.activeMaskId, revealedMaskIds: reciteRevealed ? [q.occlusion.activeMaskId || ""] : [] })}
        </div>
      {/if}
      {#if speechEvalResult && ondismissSpeechEval}
        <SpeechEvalCapsule result={speechEvalResult} ondismiss={ondismissSpeechEval} />
      {/if}
      {#if !reciteRevealed}
        {#if q.kp || q.analysis}
          <div class="lv-row"><button class="lv-chip" onclick={ontoggleHint} title={q.analysis ? t("recite.hint2Key") : ""}><Icon name="bulb" size={12} /> {reciteHint >= 2 ? t("recite.hint2") : t("recite.hint1")}：{reciteHint >= 2 ? (q.analysis ?? "").slice(0, 24) : (q.kp ?? q.analysis ?? "").slice(0, 24)}</button></div>
        {/if}
        <div class="lv-row" style="justify-content:center">
          <button class="lv-btn lv-btn--primary" onclick={onreveal}><Icon name="eye" size={15} /> {t("recite.reveal")}</button>
        </div>
      {:else}
        <div class="lv-recite-revealed">
          {#if q.options.length}
            <div class="lv-analysis"><b>{t("recite.answer")}:</b> {formatDisplayAnswer(q.answer)}</div>
            {#each q.options as opt, i (i)}
              <div class="lv-opt" class:right={q.answer.includes(String.fromCharCode(65 + i))} style="cursor:default">
                <span class="key">{String.fromCharCode(65 + i)}</span><span class="lv-opt-text">{@html renderInlineText(opt)}</span>
              </div>
            {/each}
          {:else}
            <div class="lv-analysis"><b>{t("recite.answer")}:</b> {formatDisplayAnswer(q.answer)}</div>
          {/if}
          {#if q.analysis}<div class="lv-analysis">{q.analysis}</div>{/if}
          {#if q.expansion}
            <div class="lv-analysis" style="margin-top:8px;padding:8px 12px;background:var(--lv-surface-2);border-left:3px solid var(--lv-accent);border-radius:4px">
              <b style="color:var(--lv-accent)">💡 思路拓展与秒杀技巧：</b>
              <div style="margin-top:2px">{q.expansion}</div>
            </div>
          {/if}
          <div class="lv-rate" role="group" aria-label="自评掌握程度">
            <button class="lv-btn r1" disabled={reciteSaving} onclick={() => onrateSelf(1)}><span class="lv-rate-key">1</span> {reciteSaving ? "…" : t("rate.1")}</button>
            <button class="lv-btn r2" disabled={reciteSaving} onclick={() => onrateSelf(2)}><span class="lv-rate-key">2</span> {reciteSaving ? "…" : t("rate.2")}</button>
            <button class="lv-btn r3" disabled={reciteSaving} onclick={() => onrateSelf(3)}><span class="lv-rate-key">3</span> {reciteSaving ? "…" : t("rate.3")}</button>
            <button class="lv-btn r4" disabled={reciteSaving} onclick={() => onrateSelf(4)}><span class="lv-rate-key">4</span> {reciteSaving ? "…" : t("rate.4")}</button>
          </div>
        </div>
      {/if}
      {#if reciteOutcome}
        <div class="lv-row" style="justify-content:center;margin:6px 0 0" role="status">
          <span class="lv-chip num"
            class:lv-chip--grn={reciteOutcome.outcome === "recorded"}
            class:lv-chip--amb={reciteOutcome.outcome === "pending-confirm" || reciteOutcome.outcome === "skipped-offline"}
            class:lv-chip--red={reciteOutcome.outcome === "failed"}
            title={reciteOutcome.note}>
            <Icon name="info" size={11} /> {t("rate.writeback." + reciteOutcome.outcome)}
          </span>
        </div>
      {/if}
      {#if reciteError}<div class="lv-error" role="alert">{reciteError}</div>{/if}
    </div>
  {/if}
</div>

<style>
  @container lv-exam (max-width: 680px) {
    .lv-recite-head {
      flex-wrap: nowrap !important;
      gap: 6px !important;
      margin: 0 0 8px !important;
    }
    .lv-recite-head-main {
      min-width: 0 !important;
      flex: 1 1 0;
      flex-wrap: nowrap !important;
      margin: 0 !important;
      gap: 6px !important;
    }
    .lv-recite-exit-btn {
      min-height: 32px !important;
      height: 32px !important;
      padding: 0 8px !important;
      font-size: 12px !important;
      flex-shrink: 0;
    }
    .lv-recite-dock {
      flex-wrap: nowrap;
      flex-shrink: 0;
      padding: 2px 3px;
    }
    .lv-recite-dock .lv-chip {
      padding: 2px 6px;
      height: 26px;
      min-height: 26px;
    }
    .lv-recite-meta-chip {
      display: none !important;
    }
    .lv-paper {
      padding: 16px 14px;
    }
  }
</style>
