<script lang="ts">
  import Icon from "../shared/Icon.svelte";
  import type { Question } from "@/core/types";

  export interface GroupBatchItem {
    qid: string;
    verdict: string;
    myAnswer?: string;
  }

  export interface GroupBatchSummary {
    fromIndex: number;
    toIndex: number;
    accuracy: number;
    correct: number;
    total: number;
    items: GroupBatchItem[];
  }

  interface Props {
    modal: GroupBatchSummary;
    questionMap: Map<string, Question>;
    t: (k: string, fb?: string) => string;
    oncontinue: () => void;
  }

  let { modal, questionMap, t, oncontinue }: Props = $props();
</script>

<div class="lv-card lv-pad-card" role="region" aria-label={t("session.groupFeedback")} style="margin-bottom:12px;background:var(--lv-surface-2);border:1px solid var(--lv-border-subtle);border-left:3.5px solid var(--lv-accent);padding:14px 16px;border-radius:var(--lv-r-3, 16px);box-shadow:var(--lv-sh-card)">
  <div class="lv-row" style="justify-content:space-between;align-items:center;margin-bottom:8px;flex-wrap:wrap;gap:6px">
    <b style="font-size:14px;display:inline-flex;align-items:center;gap:6px">
      <Icon name="check" size={15} />
      <span>{t("session.groupFeedback")}（{t("material.subQ").replace("{n}", String(modal.fromIndex))} - {t("material.subQ").replace("{n}", String(modal.toIndex))}）</span>
    </b>
    <span class="lv-chip lv-chip--data num" style="font-weight:600">
      {t("session.initialAccuracy")}: {modal.accuracy}% ({modal.correct}/{modal.total})
    </span>
  </div>
  <div class="lv-row" style="gap:6px;flex-wrap:wrap;margin:6px 0 12px">
    {#each modal.items as item, ii (item.qid)}
      {@const q = questionMap.get(item.qid)}
      <span
        class="lv-chip num"
        class:lv-chip--grn={item.verdict === "correct"}
        class:lv-chip--red={item.verdict === "wrong"}
        title={q?.stem ?? item.qid}
      >
        <span>{modal.fromIndex + ii}.</span> {#if item.verdict === "correct"}<Icon name="check" size={11} />{:else}<Icon name="close" size={11} />{/if} {#if item.myAnswer}({item.myAnswer}){/if}
      </span>
    {/each}
  </div>
  <button class="lv-btn lv-btn--primary" onclick={oncontinue} style="min-height:36px;border-radius:var(--lv-radius-pill, 9999px)">
    <Icon name="play" size={13} /> {t("session.groupContinue")}
  </button>
</div>
