<script lang="ts">
  import Icon from "./Icon.svelte";
  import type { Question } from "@/core/types";
  import { renderMathInText } from "@/core/math";
  import { renderMathDiagramsInText } from "@/core/mathDiagram";
  import { renderOcclusionSvg } from "@/core/imageOcclusion";
  import { formatDisplayAnswer } from "@/core/structuredAnswer";
  import { sanitizeRichHtml, renderInlineText } from "../../libs/sanitize";
  import ScratchpadDrawer from "../practice/ScratchpadDrawer.svelte";

  interface Props {
    open: boolean;
    title: string;
    questions: Question[];
    startIndex?: number;
    t: (k: string, fb?: string) => string;
    onclose: () => void;
  }

  let {
    open,
    title,
    questions,
    startIndex = 0,
    t,
    onclose,
  }: Props = $props();

  let currentIndex = $state(0);
  let revealed = $state(false);
  let sketchpadOpen = $state(false);
  let scratchpadText = $state("");

  const currentQ = $derived(questions[currentIndex] || null);
  const total = $derived(questions.length);

  $effect(() => {
    if (open) {
      currentIndex = Math.max(0, Math.min(startIndex, questions.length - 1));
      revealed = false;
      sketchpadOpen = false;
    }
  });

  function nextQ() {
    if (currentIndex < total - 1) {
      currentIndex++;
      revealed = false;
    }
  }

  function prevQ() {
    if (currentIndex > 0) {
      currentIndex--;
      revealed = false;
    }
  }

  function toggleReveal() {
    revealed = !revealed;
  }

  function handleKeydown(e: KeyboardEvent) {
    if (!open) return;
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

    if (e.key === "Escape") {
      e.preventDefault();
      onclose();
    } else if (e.key === "ArrowRight" || e.key === "PageDown" || e.key === "j" || e.key === "J") {
      e.preventDefault();
      nextQ();
    } else if (e.key === "ArrowLeft" || e.key === "PageUp" || e.key === "k" || e.key === "K") {
      e.preventDefault();
      prevQ();
    } else if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      toggleReveal();
    } else if (e.key === "p" || e.key === "P") {
      e.preventDefault();
      sketchpadOpen = !sketchpadOpen;
    }
  }

  const LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H"];
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open && currentQ}
  <div
    class="lv-present-overlay"
    role="dialog"
    aria-modal="true"
    aria-label="试卷大屏放映模式"
  >
    <!-- 顶部极简信息栏 -->
    <header class="lv-present-header">
      <div class="lv-row" style="margin:0;gap:8px;align-items:center">
        <span class="lv-chip sm lv-chip--acc num">{t("qtype." + currentQ.type)}</span>
        <span class="lv-present-idx num">{currentIndex + 1} / {total}</span>
        {#if currentQ.score}<span class="lv-chip sm num">{currentQ.score} 分</span>{/if}
        {#if currentQ.kp}<span class="lv-chip sm">{currentQ.kp}</span>{/if}
        {#if currentQ.prerequisites && currentQ.prerequisites.length > 0}
          <span class="lv-chip sm" title="先修依赖考点"><Icon name="compass" size={11} /> 先修: {currentQ.prerequisites.join("、")}</span>
        {/if}
      </div>
      <div class="lv-present-title" title={title}>
        <Icon name="monitor" size={15} /> {title}
      </div>
      <div class="lv-row" style="margin:0;gap:8px;align-items:center">
        <button
          type="button"
          class="lv-btn sm"
          class:lv-btn--primary={sketchpadOpen}
          onclick={() => (sketchpadOpen = !sketchpadOpen)}
          title="开关数理手绘演练草稿板 (快捷键 P)"
        >
          <Icon name="pencil" size={13} /> {sketchpadOpen ? "收起画板" : "草稿画板"}
        </button>
        <button
          type="button"
          class="lv-btn sm lv-btn--ghost lv-present-close-btn"
          onclick={onclose}
          title="退出大屏放映 (Esc)"
          aria-label="退出大屏放映"
        >
          <Icon name="close" size={14} /> <span class="lv-present-close-text">退出放映</span>
        </button>
      </div>
    </header>

    <!-- 主展示区 -->
    <main class="lv-present-stage">
      <!-- 演练白板浮层 -->
      {#if sketchpadOpen}
        <div style="margin-bottom:16px">
          <ScratchpadDrawer
            open={sketchpadOpen}
            mode="per_question"
            text={scratchpadText}
            qid={currentQ.id}
            {t}
            onmodeChange={() => {}}
            oninput={(val) => { scratchpadText = val; }}
            onclear={() => { scratchpadText = ""; }}
            oncopy={() => {}}
            onclose={() => (sketchpadOpen = false)}
          />
        </div>
      {/if}

      <!-- 试题卡片主体 -->
      <article class="lv-card lv-present-card">
        <div class="lv-present-stem b3-typography">
          {@html sanitizeRichHtml(renderMathInText(renderMathDiagramsInText(currentQ.stem)))}
        </div>

        {#if currentQ.occlusion}
          <div class="lv-present-occlusion">
            {@html renderOcclusionSvg(currentQ.occlusion, { printMode: true })}
          </div>
        {/if}

        <!-- 选项展示 -->
        {#if currentQ.options && currentQ.options.length > 0}
          <div class="lv-present-opts">
            {#each currentQ.options as opt, oi (oi)}
              <div class="lv-present-opt-item">
                <span class="lv-opt-badge num">{LETTERS[oi]}</span>
                <span class="lv-opt-text">{@html renderInlineText(opt)}</span>
              </div>
            {/each}
          </div>
        {/if}

        <!-- 揭晓的答案与解析 -->
        {#if revealed}
          <div class="lv-present-answer-panel">
            <div class="lv-present-ans-row">
              <span class="ans-label">参考答案：</span>
              <b class="ans-val num">{formatDisplayAnswer(currentQ.answer) || "（主观作答，参考要点）"}</b>
            </div>
            {#if currentQ.analysis}
              <div class="lv-present-analysis b3-typography">
                <b>【思路解析】</b>
                {@html sanitizeRichHtml(renderMathInText(renderMathDiagramsInText(currentQ.analysis)))}
              </div>
            {/if}
            {#if currentQ.expansion}
              <div class="lv-present-expansion b3-typography" style="margin-top:10px;padding:8px 12px;background:var(--lv-surface-2);border-left:3px solid var(--lv-accent);border-radius:4px">
                <b style="color:var(--lv-accent)">【💡 思路拓展与秒杀技巧】</b>
                {@html sanitizeRichHtml(renderMathInText(renderMathDiagramsInText(currentQ.expansion)))}
              </div>
            {/if}
            {#if currentQ.rubric && typeof currentQ.rubric === "object"}
              {@const criteria = (currentQ.rubric as any)?.criteria}
              {#if Array.isArray(criteria) && criteria.length}
                <div class="lv-present-rubric">
                  <div class="rubric-header">🎯 采分点标准：</div>
                  <ul>
                    {#each criteria as c, ci (ci)}
                      <li>
                        <b>{c.label || `采分点 ${ci + 1}`}</b>
                        <span class="num">（权重 {Math.round((c.weight ?? 0) * 100)}%）</span>
                        {#if c.example}<span>：{c.example}</span>{/if}
                      </li>
                    {/each}
                  </ul>
                </div>
              {/if}
            {/if}
          </div>
        {/if}
      </article>
    </main>

    <!-- 底部悬浮控制台 -->
    <div class="lv-present-dock" role="toolbar" aria-label="放映导航控制栏">
      <button
        type="button"
        class="lv-btn lv-btn--ghost"
        disabled={currentIndex === 0}
        onclick={prevQ}
        title="上一题 (快捷键 ←)"
      >
        <Icon name="chev-left" size={15} /> 上一题
      </button>

      <button
        type="button"
        class="lv-btn {revealed ? 'lv-btn--ghost' : 'lv-btn--primary'}"
        onclick={toggleReveal}
        title="揭晓/隐藏解析 (快捷键 空格)"
        style="min-width:140px"
      >
        <Icon name={revealed ? "eyeoff" : "bulb"} size={15} />
        {revealed ? "隐藏答案" : "揭晓答案 (空格)"}
      </button>

      <button
        type="button"
        class="lv-btn lv-btn--ghost"
        disabled={currentIndex === total - 1}
        onclick={nextQ}
        title="下一题 (快捷键 →)"
      >
        下一题 <Icon name="chev-right" size={15} />
      </button>
    </div>
  </div>
{/if}

<style>
  .lv-present-overlay {
    position: fixed;
    inset: 0;
    z-index: 999;
    background: var(--lv-surface, var(--b3-theme-surface, #ffffff));
    color: var(--lv-text, var(--b3-theme-on-surface, #1e293b));
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .lv-present-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 24px;
    border-bottom: 1px solid var(--lv-border-subtle, var(--lv-border));
    background: var(--lv-surface-2, var(--b3-theme-surface-lighter, #f8fafc));
    flex-shrink: 0;
    gap: 12px;
  }
  .lv-present-title {
    font-size: var(--lv-font-size-body, 14px);
    font-weight: 600;
    color: var(--lv-text-2, #475569);
    display: flex;
    align-items: center;
    gap: 6px;
    max-width: 400px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .lv-present-idx {
    font-size: 15px;
    font-weight: 700;
    color: var(--lv-brand, var(--lv-accent, #1e3a8a));
  }
  .lv-present-stage {
    flex: 1;
    overflow-y: auto;
    padding: 32px 24px 100px;
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  .lv-present-card {
    width: min(920px, 100%);
    padding: 28px 36px;
    border-radius: var(--lv-r-3, 16px);
    box-shadow: var(--lv-sh-2, 0 4px 16px rgba(0,0,0,0.06));
    border: 1px solid var(--lv-border-subtle, var(--lv-border));
    background: var(--lv-surface, #ffffff);
  }
  .lv-present-stem {
    font-size: 21px;
    font-weight: 600;
    line-height: 1.6;
    color: var(--lv-text, #0f172a);
    margin-bottom: 24px;
  }
  .lv-present-occlusion {
    max-width: 600px;
    margin: 0 auto 20px;
    border-radius: 8px;
    overflow: hidden;
    box-shadow: var(--lv-sh-1);
  }
  .lv-present-opts {
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin-bottom: 24px;
  }
  .lv-present-opt-item {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 12px 18px;
    border: 1.5px solid var(--lv-border);
    border-radius: var(--lv-r-2, 10px);
    background: var(--lv-surface-2, #f8fafc);
    font-size: 17px;
    line-height: 1.5;
  }
  .lv-opt-badge {
    font-weight: 700;
    color: var(--lv-brand, var(--lv-accent, #1e3a8a));
    min-width: 22px;
  }
  .lv-opt-text {
    flex: 1;
  }
  .lv-present-answer-panel {
    margin-top: 24px;
    padding: 18px 22px;
    border-radius: var(--lv-r-2, 12px);
    background: var(--lv-surface-2, #f1f5f9);
    border-left: 4px solid var(--lv-brand, var(--lv-accent, #1e3a8a));
    animation: lv-appear 0.2s ease-out;
  }
  .lv-present-ans-row {
    font-size: 17px;
    margin-bottom: 10px;
    color: var(--lv-text, #0f172a);
  }
  .ans-label {
    color: var(--lv-text-muted, #64748b);
  }
  .ans-val {
    color: var(--lv-accent-seal, var(--lv-accent, #b91c1c));
    font-size: 19px;
  }
  .lv-present-analysis {
    font-size: 15px;
    line-height: 1.65;
    color: var(--lv-text-2, #334155);
  }
  .lv-present-rubric {
    margin-top: 12px;
    padding: 10px 14px;
    background: var(--lv-surface, #ffffff);
    border-radius: 8px;
    border: 1px solid var(--lv-border);
    font-size: 13.5px;
  }
  .rubric-header {
    font-weight: 700;
    margin-bottom: 6px;
    color: var(--lv-brand, #1e3a8a);
  }
  .lv-present-rubric ul {
    padding-left: 18px;
    margin: 0;
  }
  .lv-present-dock {
    position: fixed;
    bottom: 24px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 16px;
    border-radius: var(--lv-radius-pill, 9999px);
    background: color-mix(in srgb, var(--lv-surface, #ffffff) 92%, transparent);
    backdrop-filter: blur(14px);
    -webkit-backdrop-filter: blur(14px);
    box-shadow: var(--lv-sh-pop, 0 8px 28px rgba(0,0,0,0.14));
    border: 1px solid var(--lv-border-subtle, var(--lv-border));
    z-index: 1000;
  }
  .lv-present-close-btn {
    min-width: 44px;
    min-height: 44px;
  }
  @media (max-width: 680px) {
    .lv-present-header {
      padding: 8px 12px;
      flex-wrap: wrap;
      gap: 6px;
    }
    .lv-present-title {
      display: none;
    }
    .lv-present-close-btn {
      width: 44px;
      height: 44px;
      padding: 0;
      justify-content: center;
    }
    .lv-present-close-text {
      display: none;
    }
    .lv-present-stage {
      padding: 14px 12px 92px;
    }
    .lv-present-card {
      padding: 16px 14px;
    }
    .lv-present-stem {
      font-size: 17px;
      margin-bottom: 14px;
    }
    .lv-present-opt-item {
      padding: 10px 12px;
      font-size: 15px;
    }
    .lv-present-dock {
      width: calc(100vw - 24px);
      max-width: 400px;
      justify-content: space-between;
      padding: 6px 10px;
      gap: 6px;
      bottom: max(12px, env(safe-area-inset-bottom, 12px));
    }
    .lv-present-dock > .lv-btn {
      min-width: 0 !important;
      flex: 1 1 auto;
      padding: 0 8px;
      font-size: 12.5px;
    }
  }
</style>
