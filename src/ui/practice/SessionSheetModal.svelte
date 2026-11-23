<script lang="ts">
  import Icon from "../shared/Icon.svelte";
  import type { PracticeSession } from "@/core/session";

  interface Props {
    open: boolean;
    session: PracticeSession;
    doneCount: number;
    totalCount: number;
    title: string;
    onclose: () => void;
    onjump: (index: number) => void;
  }

  let {
    open,
    session,
    doneCount,
    totalCount,
    title,
    onclose,
    onjump,
  }: Props = $props();

  const answeredMap = $derived(new Map((session?.answered ?? []).map((a) => [a.qid, a])));

  let dialogEl = $state<HTMLDivElement | null>(null);
  let returnFocusEl: HTMLElement | null = null;
  let wasOpen = false;

  $effect(() => {
    if (open && dialogEl) {
      if (!wasOpen) {
        wasOpen = true;
        returnFocusEl = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        queueMicrotask(() => dialogEl?.focus());
      }
    } else if (!open && wasOpen) {
      wasOpen = false;
      const target = returnFocusEl;
      returnFocusEl = null;
      queueMicrotask(() => target?.focus?.());
    }
  });
</script>

<svelte:window onkeydown={(e) => { if (open && e.key === "Escape") { e.stopPropagation(); onclose(); } }} />

{#if open && session}
  <button type="button" class="lv-hotkeys-backdrop" aria-label="关闭" onclick={onclose}></button>
  <div class="lv-hotkeys-wrap">
    <div
      bind:this={dialogEl}
      class="lv-card"
      role="dialog"
      aria-modal="true"
      tabindex="-1"
      aria-label={title}
      style="width:min(520px, 100%);max-height:80vh;overflow-y:auto;pointer-events:auto;padding:clamp(14px, 4vw, 22px);border-radius:var(--lv-r-card, 20px);box-shadow:var(--lv-sh-pop);border:1px solid var(--lv-border-subtle)"
    >
      <div class="lv-row" style="justify-content:space-between;margin:0 0 14px">
        <div class="lv-dialog-title-wrap">
          <span class="lv-dialog-title-icon"><Icon name="grid" size={13} /></span>
          <span>{title}</span>
          <span class="lv-dialog-title-tag num">{doneCount}/{totalCount}</span>
        </div>
        <button class="lv-btn sm lv-btn--ghost" onclick={onclose} aria-label="关闭"><Icon name="close" size={13} /></button>
      </div>
      <div class="lv-grid-nav" role="group" aria-label="答题卡题目导航矩阵" style="display:grid;grid-template-columns:repeat(auto-fill, minmax(38px, 1fr));gap:6px">
        {#each session.state.qids as qid, i (qid)}
          {@const isCur = i === session.state.cursor}
          {@const myA = answeredMap.get(qid)}
          {@const isDone = Boolean(myA)}
          {@const isWrong = myA && myA.grade.verdict === "wrong"}
          {@const isCorrect = myA && myA.grade.verdict === "correct"}
          <button
            type="button"
            class="lv-cell"
            class:cur={isCur}
            class:done={isDone}
            aria-label={`第 ${i + 1} 题${isCur ? "（当前）" : ""}${isCorrect ? "（已答对）" : isWrong ? "（已答错）" : isDone ? "（已作答）" : "（未作答）"}`}
            aria-current={isCur ? "true" : undefined}
            style={isWrong ? "background:var(--lv-red-soft);color:var(--lv-red);border-color:var(--lv-red);" : isCorrect ? "background:var(--lv-green-soft);color:var(--lv-green);border-color:var(--lv-green);" : ""}
            onclick={() => onjump(i)}
          >
            {i + 1}
          </button>
        {/each}
      </div>
    </div>
  </div>
{/if}

<style>
  .lv-hotkeys-backdrop {
    position: fixed;
    inset: 0;
    background: var(--lv-overlay);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    z-index: 100;
    border: none;
    padding: 0;
    margin: 0;
    cursor: pointer;
    animation: lv-appear var(--lv-dur-view, 0.22s) var(--lv-ease-out);
  }
  .lv-hotkeys-wrap {
    position: fixed;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 101;
    pointer-events: none;
    padding: var(--lv-space-3, 16px);
  }
  .lv-dialog-title-wrap {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: var(--lv-font-size-title, 16px);
    font-weight: var(--lv-font-weight-bold, 700);
    color: var(--lv-text);
  }
  .lv-dialog-title-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    border-radius: var(--lv-r-2, 8px);
    background: var(--lv-brand-soft);
    color: var(--lv-brand);
  }
  .lv-dialog-title-tag {
    font-size: 11px;
    padding: 2px 7px;
    border-radius: var(--lv-radius-pill, 9999px);
    background: var(--lv-surface-2);
    color: var(--lv-text-muted);
    font-weight: 600;
  }
  .lv-cell {
    min-width: 40px;
    min-height: 40px;
    border-radius: 10px;
    border: 1px solid var(--lv-border);
    background: var(--lv-surface);
    font-size: 13px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    font-family: var(--lv-font-mono, ui-monospace, monospace);
    color: var(--lv-text);
    cursor: pointer;
    touch-action: manipulation;
    display: inline-grid;
    place-items: center;
    box-shadow: var(--lv-sh-1);
    transition: transform var(--lv-dur-micro, 0.15s) ease, background-color var(--lv-dur-micro) ease, border-color var(--lv-dur-micro) ease;
  }
  .lv-cell:hover:not(:disabled) {
    transform: translateY(-1px);
    border-color: var(--lv-brand);
    background: var(--lv-surface-hover, var(--lv-surface));
  }
  .lv-cell:active:not(:disabled) {
    transform: scale(0.96);
  }
  .lv-cell.done {
    background: var(--lv-brand-soft);
    color: var(--lv-brand);
    border-color: color-mix(in srgb, var(--lv-brand) 40%, transparent);
  }
  .lv-cell.cur {
    background: var(--lv-brand);
    color: var(--lv-on-accent, var(--lv-on-accent, #ffffff));
    border-color: transparent;
    box-shadow: 0 0 0 2px var(--lv-surface), 0 0 0 4px var(--lv-brand);
    transform: translateY(-1px);
    z-index: 2;
  }
  @media (max-width: 640px) {
    .lv-cell {
      min-width: 44px;
      min-height: 44px;
      font-size: 14px;
    }
  }
</style>
