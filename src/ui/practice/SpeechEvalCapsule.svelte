<script lang="ts">
  import Icon from "../shared/Icon.svelte";
  import type { SpeechEvalResult } from "@/core/speechEval";

  interface Props {
    result: SpeechEvalResult | null;
    ondismiss: () => void;
  }

  let { result, ondismiss }: Props = $props();
</script>

{#if result}
  <div class="lv-card" role="status" aria-live="polite" style="padding:8px 12px;background:var(--lv-surface-2);border-radius:var(--lv-r-2, 12px);border:1px solid var(--lv-border-subtle);box-shadow:var(--lv-sh-1);margin:6px 0 10px;display:flex;align-items:center;justify-content:space-between;gap:8px">
    <div style="font-size:12px;flex:1">
      <span style="display:inline-flex;align-items:center;gap:4px"><Icon name="mic" size={13} /> 识别到：“<b>{result.transcript}</b>”</span>
      <span class="lv-chip num sm" class:lv-chip--grn={result.grade === "excellent"} class:lv-chip--amb={result.grade === "good"} class:lv-chip--red={result.grade === "practice"}>
        匹配度 {result.score}%
      </span>
      <span class="lv-muted" style="margin-left:6px">{result.feedback}</span>
    </div>
    <button type="button" class="lv-btn sm lv-btn--ghost" onclick={ondismiss} title="关闭测评反馈" aria-label="关闭测评反馈"><Icon name="close" size={12} /></button>
  </div>
{/if}
