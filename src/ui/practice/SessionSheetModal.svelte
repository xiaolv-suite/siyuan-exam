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
</script>

{#if open && session}
  <button type="button" class="lv-hotkeys-backdrop" aria-label="关闭" onclick={onclose}></button>
  <div class="lv-hotkeys-wrap">
    <div
      class="lv-card"
      role="dialog"
      aria-modal="true"
      tabindex="-1"
      aria-label={title}
      style="width:min(520px, 100%);max-height:80vh;overflow-y:auto;pointer-events:auto;padding:22px;border-radius:var(--lv-r-4, 22px);box-shadow:var(--lv-sh-pop);border:1px solid var(--lv-border)"
    >
      <div class="lv-row" style="justify-content:space-between;margin:0 0 14px">
        <div class="lv-dialog-title-wrap">
          <span class="lv-dialog-title-icon"><Icon name="grid" size={13} /></span>
          <span>{title}</span>
          <span class="lv-dialog-title-tag">{doneCount}/{totalCount}</span>
        </div>
        <button class="lv-btn sm lv-btn--ghost" onclick={onclose}>✕</button>
      </div>
      <div class="lv-grid-nav" style="display:grid;grid-template-columns:repeat(auto-fill, minmax(42px, 1fr));gap:8px">
        {#each session.state.qids as qid, i (qid)}
          {@const isCur = i === session.state.cursor}
          {@const myA = session.answered.find((a) => a.qid === qid)}
          {@const isDone = Boolean(myA)}
          {@const isWrong = myA && myA.grade.verdict === "wrong"}
          {@const isCorrect = myA && myA.grade.verdict === "correct"}
          <button
            type="button"
            class="lv-cell"
            class:cur={isCur}
            class:done={isDone}
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
