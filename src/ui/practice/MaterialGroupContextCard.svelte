<script lang="ts">
  import Icon from "../shared/Icon.svelte";
  import type { SiblingItem, MaterialGroupContext } from "@/core/materialContext";

  interface Props {
    materialContext: string;
    materialHtml?: string;
    groupContext: MaterialGroupContext | null;
    materialExpanded: boolean;
    t: (k: string, fb?: string) => string;
    escapeHtml: (s: string) => string;
    formatMaterialGroupHeader: (ctx: MaterialGroupContext) => string;
    ontoggleExpand: () => void;
    onjumpSibling: (sib: SiblingItem) => void;
  }

  let {
    materialContext,
    materialHtml = "",
    groupContext,
    materialExpanded,
    t,
    escapeHtml,
    formatMaterialGroupHeader,
    ontoggleExpand,
    onjumpSibling,
  }: Props = $props();

  const MATERIAL_FOLD_AT = 500;
  const isLong = $derived(materialContext.length > MATERIAL_FOLD_AT);
  const shownText = $derived(!isLong || materialExpanded ? materialContext : materialContext.slice(0, 200) + "…");
</script>

{#if materialContext}
  <div class="lv-analysis lv-rich b3-typography" style="margin-bottom:12px;border:1px solid var(--lv-border-subtle);border-left:3.5px solid var(--lv-brand);border-radius:var(--lv-r-3, 16px);box-shadow:var(--lv-sh-1)">
    <div class="lv-row" style="margin:0 0 6px;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
      <b class="lv-mat-chip"><Icon name="paperclip" size={14} /> {groupContext ? formatMaterialGroupHeader(groupContext) : t("material.shared")}</b>
      {#if isLong}
        <button type="button" class="lv-chip num" onclick={ontoggleExpand} aria-expanded={materialExpanded} style="display:inline-flex;align-items:center;gap:4px">
          <Icon name={materialExpanded ? "arrow-down" : "chev-right"} size={11} />
          <span>{materialExpanded ? t("material.fold") : t("material.expand")}</span>
        </button>
      {/if}
    </div>
    {#if groupContext && groupContext.siblings.length > 1}
      <!-- 43-03 兄弟题导航条：展示已答对/已答错/当前/未答状态，支持卷面一键跳转 -->
      <div class="lv-row lv-sibling-nav" style="margin:4px 0 8px;gap:6px;flex-wrap:wrap" role="group" aria-label={t("material.siblings")}>
        {#each groupContext.siblings as sib (sib.qid)}
          <button
            type="button"
            class="lv-chip num lv-sibling-pill"
            class:acc={sib.isCurrent}
            class:lv-chip--grn={sib.verdict === "correct"}
            class:lv-chip--red={sib.verdict === "wrong"}
            disabled={!sib.inSession}
            aria-current={sib.isCurrent ? "true" : undefined}
            aria-label={`${t("material.subQ").replace("{n}", String(sib.subIndex))}${sib.isCurrent ? "（当前）" : ""}${sib.verdict === "correct" ? "（已答对）" : sib.verdict === "wrong" ? "（已答错）" : "（未作答）"}`}
            title={sib.inSession ? `${t("material.jumpTo")}: ${sib.stemSnippet}` : t("material.notInSession")}
            onclick={() => onjumpSibling(sib)}
          >
            <span>{t("material.subQ").replace("{n}", String(sib.subIndex))}</span>
            {#if sib.verdict === "correct"}<Icon name="check" size={11} />{:else if sib.verdict === "wrong"}<Icon name="close" size={11} />{/if}
          </button>
        {/each}
      </div>
    {/if}
    <div style={materialExpanded ? "max-height:280px;overflow-y:auto;padding:2px 0;line-height:1.6" : "line-height:1.6"}>
      {@html isLong && !materialExpanded ? escapeHtml(shownText) : (materialHtml || escapeHtml(shownText))}
    </div>
  </div>
{/if}
