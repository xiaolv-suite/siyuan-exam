<script lang="ts">
  import { untrack } from "svelte";
  import {
    mountLvAiThinkingCard,
    type LvAiPresetScenario,
    type LvAiStageDefinition,
    type LvAiThinkingCardHandle,
  } from "@/libs/lv-notice-kit";

  interface Props {
    scenario?: LvAiPresetScenario;
    stages?: LvAiStageDefinition[];
    defaultIcon?: string;
    title?: string;
    subtitle?: string;
    cancelLabel?: string | false;
    compact?: boolean;
    extraClass?: string;
    oncancel?: () => void;
  }

  let {
    scenario = "general",
    stages,
    defaultIcon,
    title = "",
    subtitle = "",
    cancelLabel = "⏹ 取消生成",
    compact = false,
    extraClass = "",
    oncancel,
  }: Props = $props();

  let hostEl = $state<HTMLElement | null>(null);
  let cardHandle: LvAiThinkingCardHandle | null = null;

  $effect(() => {
    const el = hostEl;
    const sc = scenario;
    const st = stages;
    const icon = defaultIcon;
    const cmp = compact;
    const ext = extraClass;
    const cLabel = cancelLabel;
    if (!el) return;

    const init = untrack(() => ({
      title: title || undefined,
      subtitle: subtitle || undefined,
    }));

    const handle = mountLvAiThinkingCard(el, {
      scenario: sc,
      stages: st,
      defaultIcon: icon,
      title: init.title,
      subtitle: init.subtitle,
      cancelLabel: cLabel,
      compact: cmp,
      extraClass: ext,
      onCancel: () => {
        oncancel?.();
      },
    });
    cardHandle = handle;

    return () => {
      handle.destroy();
      if (cardHandle === handle) cardHandle = null;
    };
  });

  $effect(() => {
    if (!cardHandle) return;
    cardHandle.update({
      title: title || undefined,
      subtitle: subtitle || undefined,
      cancelLabel: cancelLabel === false ? undefined : cancelLabel,
    });
  });
</script>

<div class="lv-ai-thinking-host" bind:this={hostEl}></div>

<style>
  .lv-ai-thinking-host {
    width: 100%;
    box-sizing: border-box;
    border-radius: var(--lv-r-card, 14px);
    background: var(--lv-surface-2, var(--b3-theme-surface));
    border: 1px solid var(--lv-border-subtle, var(--b3-theme-surface-lighter));
  }
</style>
