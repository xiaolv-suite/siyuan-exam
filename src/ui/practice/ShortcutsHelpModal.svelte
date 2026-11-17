<script lang="ts">
  import Icon from "../shared/Icon.svelte";
  import { handleTablistKeydown } from "./services/practiceKeyboardService";

  interface Props {
    open: boolean;
    version: string;
    title: string;
    onclose: () => void;
  }

  let { open, version, title, onclose }: Props = $props();

  let hotkeyCategory = $state<"all" | "session" | "recite" | "nav">("all");
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

{#if open}
  <button type="button" class="lv-hotkeys-backdrop" aria-label="关闭" onclick={onclose}></button>
  <div class="lv-hotkeys-wrap" role="dialog" aria-modal="true" aria-labelledby="lv-hotkeys-title">
    <div bind:this={dialogEl} tabindex="-1" class="lv-hotkeys-card">
      <div class="lv-row" style="justify-content:space-between;margin:0 0 14px">
        <div class="lv-dialog-title-wrap">
          <span class="lv-dialog-title-icon"><Icon name="activity" size={13} /></span>
          <span id="lv-hotkeys-title">{title}</span>
          <span class="lv-dialog-title-tag">v{version}</span>
        </div>
        <button class="lv-btn sm lv-btn--ghost" onclick={onclose} aria-label="关闭"><Icon name="close" size={13} /></button>
      </div>
      <div class="lv-session-dock" role="tablist" tabindex="-1" aria-label="快捷键分类" style="margin:0 0 12px;width:100%" onkeydown={handleTablistKeydown}>
        <button type="button" role="tab" tabindex={hotkeyCategory === "all" ? 0 : -1} class="lv-chip" class:acc={hotkeyCategory === "all"} aria-selected={hotkeyCategory === "all"} onclick={() => hotkeyCategory = "all"}>全部</button>
        <button type="button" role="tab" tabindex={hotkeyCategory === "session" ? 0 : -1} class="lv-chip" class:acc={hotkeyCategory === "session"} aria-selected={hotkeyCategory === "session"} onclick={() => hotkeyCategory = "session"}>做题台</button>
        <button type="button" role="tab" tabindex={hotkeyCategory === "recite" ? 0 : -1} class="lv-chip" class:acc={hotkeyCategory === "recite"} aria-selected={hotkeyCategory === "recite"} onclick={() => hotkeyCategory = "recite"}>纸面背诵</button>
        <button type="button" role="tab" tabindex={hotkeyCategory === "nav" ? 0 : -1} class="lv-chip" class:acc={hotkeyCategory === "nav"} aria-selected={hotkeyCategory === "nav"} onclick={() => hotkeyCategory = "nav"}>全局导航</button>
      </div>
      <div class="lv-hotkeys-grid" role="region" aria-label="快捷键清单">
        {#if hotkeyCategory === "all" || hotkeyCategory === "session"}
          <div class="lv-hotkeys-row"><span class="lv-kbd">A</span> - <span class="lv-kbd">D</span><span>快速选择答案选项</span></div>
          <div class="lv-hotkeys-row"><span class="lv-kbd">Enter</span><span>确认作答 / 极速下一题</span></div>
          <div class="lv-hotkeys-row"><span class="lv-kbd">1</span> - <span class="lv-kbd">3</span><span>作答前标记把握度 / 答错后一键标记错因</span></div>
          <div class="lv-hotkeys-row"><span class="lv-kbd">G</span><span>直接标记本题为猜测（Moodle CBM）</span></div>
          <div class="lv-hotkeys-row"><span class="lv-kbd">E</span><span>收藏 / 取消收藏本题</span></div>
          <div class="lv-hotkeys-row"><span class="lv-kbd">V</span><span>朗读本题题干（语音助记）</span></div>
        {/if}
        {#if hotkeyCategory === "all" || hotkeyCategory === "recite"}
          <div class="lv-hotkeys-row"><span class="lv-kbd">Space</span><span>背诵模式翻开答案 / 练习先回忆揭示</span></div>
          <div class="lv-hotkeys-row"><span class="lv-kbd">1</span> - <span class="lv-kbd">4</span><span>背诵模式四级自评（1重来 2困难 3良好 4熟练）</span></div>
          <div class="lv-hotkeys-row"><span class="lv-kbd">H</span><span>查看背诵下一级提示</span></div>
        {/if}
        {#if hotkeyCategory === "all" || hotkeyCategory === "nav"}
          <div class="lv-hotkeys-row"><span class="lv-kbd" style="display:inline-flex;align-items:center;gap:3px"><Icon name="arrow-up" size={10} /> / <Icon name="arrow-down" size={10} /></span><span>题库抽屉上一题 / 下一题连续翻阅</span></div>
          <div class="lv-hotkeys-row"><span class="lv-kbd">Ctrl/Cmd + 点击</span><span>在右侧分屏打开原笔记，并排对照学习</span></div>
          <div class="lv-hotkeys-row"><span class="lv-kbd">⌘K / Ctrl+K</span><span>随时呼出全局命令面板</span></div>
          <div class="lv-hotkeys-row"><span class="lv-kbd">?</span><span>打开 / 关闭本快捷键速查指南</span></div>
          <div class="lv-hotkeys-row"><span class="lv-kbd">Esc</span><span>退出当前会话 / 关闭详情抽屉与浮层</span></div>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .lv-hotkeys-backdrop { position: fixed; inset: 0; z-index: 124; background: var(--lv-overlay); border: 0; padding: 0; cursor: pointer; backdrop-filter: blur(10px); animation: lv-appear var(--lv-dur-view, 0.22s) var(--lv-ease-out); }
  .lv-hotkeys-wrap { position: fixed; inset: 0; z-index: 125; display: grid; place-items: center; padding: 16px; pointer-events: none; animation: lv-appear var(--lv-dur-view, 0.22s) var(--lv-ease-out); }
  .lv-hotkeys-card { width: min(480px, 100%); pointer-events: auto; background: var(--lv-surface); border: 1px solid var(--lv-border-subtle); border-radius: var(--lv-r-card, 20px); box-shadow: var(--lv-sh-pop), var(--lv-inset-card); padding: clamp(16px, 4vw, 24px) clamp(16px, 4vw, 26px); max-height: 85vh; overflow-y: auto; }
  .lv-hotkeys-grid { display: flex; flex-direction: column; gap: 8px; font-size: var(--lv-font-size-body-compact); }
  .lv-hotkeys-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 7px 0; border-bottom: 1px solid var(--lv-border-subtle); }
  .lv-hotkeys-row > span:last-child { min-width: 0; text-align: right; overflow-wrap: anywhere; }
  .lv-hotkeys-row:last-child { border-bottom: 0; }
  .lv-dialog-title-wrap { display: flex; align-items: center; gap: 8px; font-weight: var(--lv-font-weight-semibold); font-size: 15px; }
  .lv-dialog-title-icon { display: grid; place-items: center; width: 24px; height: 24px; border-radius: var(--lv-radius-control-sm, 8px); background: var(--lv-accent-soft); color: var(--lv-accent); }
  .lv-dialog-title-tag { font-size: 11px; padding: 2px 8px; border-radius: var(--lv-radius-pill, 9999px); background: var(--lv-surface-2); color: var(--lv-text-3); font-family: ui-monospace, monospace; }
</style>
