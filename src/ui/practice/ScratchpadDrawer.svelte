<script lang="ts">
  import Icon from "../shared/Icon.svelte";
  import type { ScratchpadMode } from "@/core/scratchpad";

  interface Props {
    open: boolean;
    mode: ScratchpadMode;
    text: string;
    t: (k: string, fb?: string) => string;
    onmodeChange: (mode: ScratchpadMode) => void;
    oninput: (val: string) => void;
    onclear: () => void;
    oncopy: () => void;
    onclose: () => void;
  }

  let {
    open,
    mode,
    text,
    t,
    onmodeChange,
    oninput,
    onclear,
    oncopy,
    onclose,
  }: Props = $props();
</script>

{#if open}
  <div class="lv-card lv-pad-card" style="margin-bottom:12px;background:var(--lv-surface-2);border-left:3px solid var(--lv-accent);padding:10px 14px">
    <div class="lv-row" style="justify-content:space-between;align-items:center;margin-bottom:6px">
      <div class="lv-row" style="margin:0;gap:6px">
        <b><Icon name="pencil" size={13} /> {t("scratchpad.title")}</b>
        <button type="button" class="lv-chip sm" class:acc={mode === "per_question"} onclick={() => onmodeChange("per_question")}>
          {t("scratchpad.modePerQ")}
        </button>
        <button type="button" class="lv-chip sm" class:acc={mode === "shared"} onclick={() => onmodeChange("shared")}>
          {t("scratchpad.modeShared")}
        </button>
      </div>
      <div class="lv-row" style="margin:0;gap:4px">
        <button type="button" class="lv-btn sm lv-btn--ghost" onclick={oncopy} title={t("scratchpad.copy")}>
          <Icon name="copy" size={11} /> {t("scratchpad.copy")}
        </button>
        <button type="button" class="lv-btn sm lv-btn--ghost" onclick={onclear} title={t("scratchpad.clear")} style="display:inline-flex;align-items:center;gap:4px">
          <Icon name="trash" size={12} /> {t("scratchpad.clear")}
        </button>
        <button type="button" class="lv-btn sm lv-btn--ghost" onclick={onclose} title="收起草稿纸" style="display:inline-flex;align-items:center;gap:4px">
          <Icon name="close" size={12} /> {t("common.close", "收起")}
        </button>
      </div>
    </div>
    <textarea
      class="lv-input lv-textarea num"
      rows="3"
      style="font-family:monospace;font-size:var(--lv-font-size-sm);line-height:1.4"
      placeholder={t("scratchpad.placeholder")}
      value={text}
      oninput={(e) => oninput((e.target as HTMLTextAreaElement).value)}
    ></textarea>
    <details style="margin-top:6px;font-size:var(--lv-font-size-caption)">
      <summary style="cursor:pointer;opacity:0.8;font-weight:600;display:inline-flex;align-items:center;gap:4px"><Icon name="compass" size={13} /> {t("scratchpad.formulaSheet")}</summary>
      <div class="lv-card" style="margin-top:4px;padding:8px 12px;background:var(--lv-surface);border:1px solid var(--lv-border-subtle);border-radius:var(--lv-r-3, 14px);max-height:160px;overflow-y:auto">
        <div style="display:flex;flex-direction:column;gap:4px">
          <div><b>导数表：</b><code>(xⁿ)' = n·xⁿ⁻¹</code> · <code>(eˣ)' = eˣ</code> · <code>(ln x)' = 1/x</code> · <code>(sin x)' = cos x</code> · <code>(cos x)' = -sin x</code></div>
          <div><b>三角恒等：</b><code>sin²α + cos²α = 1</code> · <code>sin(2α) = 2sinα·cosα</code> · <code>cos(2α) = 2cos²α - 1</code></div>
          <div><b>物理常数：</b><code>c = 3.0×10⁸ m/s</code> · <code>G = 6.67×10⁻¹¹</code> · <code>NA = 6.02×10²³</code> · <code>e = 1.60×10⁻¹⁹ C</code> · <code>h = 6.63×10⁻³⁴ J·s</code></div>
          <div><b>立体几何：</b><code>S_圆 = πr²</code> · <code>V_球 = 4/3·πr³</code> · <code>V_锥 = 1/3·πr²h</code></div>
        </div>
      </div>
    </details>
  </div>
{/if}
