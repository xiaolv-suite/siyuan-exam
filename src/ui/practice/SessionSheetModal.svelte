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
