<script lang="ts">
  import type { Question } from "@/core/types";
  import { lvSurfaceStack } from "@/libs/lv-notice-kit";
  import Icon from "../shared/Icon.svelte";
  import AiThinkingCard from "../shared/AiThinkingCard.svelte";

  interface Props {
    open?: boolean;
    q: Question | null;
    mode?: "socratic" | "explain" | "hint" | "dual-loop" | "storm";
    busy?: boolean;
    text?: string;
    error?: string;
    history?: Array<{ role: string; content: string }>;
    onclose: () => void;
    oncancel?: () => void;
    onsendFollowUp?: (msg: string) => void;
    onsaveToNote?: () => void;
    saveBusy?: boolean;
    saved?: boolean;
  }

  let {
    open = $bindable(false),
    q,
    mode = "socratic",
    busy = false,
    text = "",
    error = "",
    history = [],
    onclose,
    oncancel,
    onsendFollowUp,
    onsaveToNote,
    saveBusy = false,
    saved = false,
  }: Props = $props();

  let followUpText = $state("");
  let modalEl = $state<HTMLDivElement | null>(null);
  let returnFocusEl: HTMLElement | null = null;
  let wasOpen = false;
  let handledEscEvent: KeyboardEvent | null = null;

  function dismissByEsc(e?: KeyboardEvent) {
    if (!open) return false;
    if (e) {
      if (handledEscEvent === e) return true;
      handledEscEvent = e;
    }
    onclose();
    return true;
  }

  $effect(() => {
    if (!open) return;
    const popSurface = lvSurfaceStack.push({
      id: "lv-exam-socratic-modal",
      dismiss: () => dismissByEsc(),
    });
    const onCaptureKeydown = (e: KeyboardEvent) => handleWindowKeydown(e);
    window.addEventListener("keydown", onCaptureKeydown, true);
    return () => {
      popSurface();
      window.removeEventListener("keydown", onCaptureKeydown, true);
    };
  });

  $effect(() => {
    if (open && modalEl) {
      if (!wasOpen) {
        wasOpen = true;
        returnFocusEl = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        queueMicrotask(() => modalEl?.focus());
      }
    } else if (!open && wasOpen) {
      wasOpen = false;
      const target = returnFocusEl;
      returnFocusEl = null;
      queueMicrotask(() => target?.focus?.());
    }
  });

  function getModalFocusables(): HTMLElement[] {
    if (!modalEl) return [];
    const candidates = Array.from(
      modalEl.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
      ),
    );
    return candidates.filter((el) => {
      if (el.hidden || el.getAttribute("aria-hidden") === "true") return false;
      if (typeof el.getClientRects === "function" && el.getClientRects().length === 0) return false;
      return true;
    });
  }

  function handleWindowKeydown(e: KeyboardEvent) {
    if (!open) return;
    if (e.isComposing || e.keyCode === 229) return;
    if (e.key === "Escape") {
      if (handledEscEvent === e) return;
      e.preventDefault();
      e.stopPropagation();
      if (typeof e.stopImmediatePropagation === "function") {
        e.stopImmediatePropagation();
      }
      lvSurfaceStack.pop("lv-exam-socratic-modal");
      dismissByEsc(e);
    }
  }

  function handleDialogTabTrap(e: KeyboardEvent) {
    if (e.isComposing || e.keyCode === 229) return;
    if (e.key !== "Tab") return;
    const focusables = getModalFocusables();
    if (!focusables.length) {
      e.preventDefault();
      modalEl?.focus();
      return;
    }
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement as HTMLElement | null;
    if (!active || !modalEl?.contains(active) || active === modalEl) {
      e.preventDefault();
      (e.shiftKey ? last : first).focus();
      return;
    }
    if (e.shiftKey && active === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  }

  function handleInputKeydown(e: KeyboardEvent) {
    if (e.isComposing || e.keyCode === 229) return;
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  const modalTitle = $derived.by(() => {
    if (mode === "socratic") return "🦉 苏格拉底启发式导学";
    if (mode === "dual-loop") return "🔄 双环深度解题分析";
    if (mode === "storm") return "⚡ STORM 破题风暴";
    if (mode === "hint") return "💡 递进式思路提示";
    return "✨ AI 智能试题详解";
  });

  const subtitle = $derived.by(() => {
    if (mode === "socratic") return "聚焦单步启发 · 引导自主推导答案";
    if (mode === "hint") return "一次一层解法指引 · 保护思考乐趣";
    return "多维考点剖析 · 深度破题逻辑";
  });

  function handleSend() {
    const val = followUpText.trim();
    if (!val || busy) return;
    followUpText = "";
    onsendFollowUp?.(val);
  }
</script>

{#if open}
  <div class="lv-hotkeys-backdrop" onclick={onclose} aria-hidden="true"></div>
  <div
    bind:this={modalEl}
    class="lv-socratic-modal"
    role="dialog"
    aria-modal="true"
    aria-labelledby="socratic-modal-title"
    tabindex="-1"
    onkeydown={handleDialogTabTrap}
  >
    <!-- 头部导航 -->
    <header class="lv-socratic-head">
      <div class="lv-socratic-title-wrap">
        <h3 id="socratic-modal-title" class="lv-socratic-title">{modalTitle}</h3>
        <span class="lv-socratic-sub">{subtitle}</span>
      </div>
      <button
        type="button"
        class="lv-btn sm lv-btn--ghost lv-socratic-close"
        onclick={onclose}
        aria-label="关闭浮窗"
        title="关闭浮窗 (Esc)"
      >
        <Icon name="close" size={14} />
      </button>
    </header>

    <!-- 题目上下文卡片（不遮挡题干，浮窗内保持可见） -->
    {#if q}
      <div class="lv-socratic-context">
        <div class="lv-socratic-stem">
          <span class="lv-chip sm">{q.type === "single" ? "单选题" : q.type === "multiple" ? "多选题" : q.type === "judge" ? "判断题" : "主观题"}</span>
          <span>{q.stem}</span>
        </div>
        {#if q.kp}
          <div class="lv-socratic-kp">
            <Icon name="tag" size={11} />
            <span>核心考点：<b>{q.kp}</b></span>
          </div>
        {/if}
      </div>
    {/if}

    <!-- 对话与思考呈现区 -->
    <div class="lv-socratic-body">
      {#if busy}
        <div class="lv-socratic-wait-box">
          <AiThinkingCard
            scenario={mode === "socratic" || mode === "hint" ? "socratic" : "general"}
            defaultIcon="🦉"
            title={modalTitle}
            {subtitle}
            cancelLabel="⏹ 取消生成"
            oncancel={() => {
              if (oncancel) oncancel();
              else onclose();
            }}
          />
          <div style="display:flex;justify-content:center;margin-top:8px">
            <button type="button" class="lv-btn sm lv-btn--ghost lv-socratic-cancel-btn" onclick={onclose}>
              收起等待 (后台继续生成)
            </button>
          </div>
        </div>
      {:else if text || history.length > 0 || error}
        <div class="lv-socratic-conversation">
          {#if history.length > 0}
            {#each history as msg, i (i)}
              {#if msg.role === "user"}
                <div class="lv-socratic-bubble is-user">
                  <div class="lv-socratic-bubble-content">{msg.content}</div>
                </div>
              {:else if msg.role === "assistant"}
                <div class="lv-socratic-bubble is-assistant">
                  <div class="lv-socratic-bubble-avatar">🦉</div>
                  <div class="lv-socratic-bubble-content">{msg.content}</div>
                </div>
              {/if}
            {/each}
          {:else if text}
            <div class="lv-socratic-bubble is-assistant">
              <div class="lv-socratic-bubble-avatar">🦉</div>
              <div class="lv-socratic-bubble-content">{text}</div>
            </div>
          {/if}
          {#if error}
            <div class="lv-error lv-socratic-error" role="alert" style="white-space:pre-wrap;margin-top:4px">{error}</div>
          {/if}
        </div>
      {:else}
        <div class="lv-empty" style="padding:24px 0">
          <p class="lv-muted">点击下方启发引导开始对话</p>
        </div>
      {/if}
    </div>

    <!-- 底部互动区：支持多轮启发追问 -->
    {#if !busy && (text || history.length > 0 || error)}
      <footer class="lv-socratic-foot">
        {#if text || history.length > 0}
          <div class="lv-socratic-input-row">
            <input
              type="text"
              class="lv-input sm lv-socratic-input"
              placeholder="输入你的推导思路或猜测，与苏格拉底对话… (Enter 发送)"
              bind:value={followUpText}
              onkeydown={handleInputKeydown}
            />
            <button
              type="button"
              class="lv-btn sm lv-btn--primary"
              onclick={handleSend}
              disabled={!followUpText.trim() || busy}
            >
              发送
            </button>
          </div>
        {/if}
        <div class="lv-socratic-actions">
          {#if onsaveToNote && !error && text.trim()}
            <button
              type="button"
              class="lv-btn sm lv-btn--ghost"
              onclick={onsaveToNote}
              disabled={saveBusy || saved}
              title="将启发引导与思考过程保存到思源笔记块属性"
            >
              <Icon name="pin" size={13} />
              <span>{saved ? "已存入笔记" : saveBusy ? "保存中…" : "存为考点反思"}</span>
            </button>
          {/if}
          <button type="button" class="lv-btn sm" style="margin-left:auto" onclick={onclose}>
            完成阅读
          </button>
        </div>
      </footer>
    {/if}
  </div>
{/if}

<style>
  .lv-socratic-modal {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: min(580px, 94vw);
    max-height: min(640px, 86vh);
    display: flex;
    flex-direction: column;
    border-radius: var(--lv-r-card, 16px);
    background: var(--lv-surface, #ffffff);
    border: 1px solid var(--lv-border, rgba(0, 0, 0, 0.1));
    box-shadow: var(--lv-sh-pop, 0 16px 40px -10px rgba(15, 23, 42, 0.35));
    z-index: 1000;
    overflow: hidden;
    animation: socraticPopIn 0.18s cubic-bezier(0.16, 1, 0.3, 1);
  }

  @keyframes socraticPopIn {
    from {
      opacity: 0;
      transform: translate(-50%, -46%) scale(0.96);
    }
    to {
      opacity: 1;
      transform: translate(-50%, -50%) scale(1);
    }
  }

  .lv-socratic-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 18px 12px;
    border-bottom: 1px solid var(--lv-border, rgba(0, 0, 0, 0.08));
    background: color-mix(in srgb, var(--lv-brand, #3b82f6) 4%, var(--lv-surface, #ffffff));
  }

  .lv-socratic-title-wrap {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .lv-socratic-title {
    margin: 0;
    font-size: 15px;
    font-weight: 750;
    color: var(--lv-text, #0f172a);
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .lv-socratic-sub {
    font-size: 11.5px;
    color: var(--lv-text-3, #64748b);
  }

  .lv-socratic-close {
    border-radius: 8px;
    width: 28px;
    height: 28px;
    padding: 0;
    display: grid;
    place-items: center;
  }

  .lv-socratic-context {
    padding: 8px 16px;
    background: var(--lv-surface-subtle, #f8fafc);
    border-bottom: 1px solid var(--lv-border, rgba(0, 0, 0, 0.06));
    font-size: 12px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .lv-socratic-stem {
    display: flex;
    align-items: baseline;
    gap: 6px;
    color: var(--lv-text-2, #334155);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .lv-socratic-kp {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    color: var(--lv-text-3, #64748b);
  }

  .lv-socratic-kp b {
    color: var(--lv-brand, #3b82f6);
  }

  .lv-socratic-body {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
    min-height: 180px;
    max-height: 400px;
  }

  .lv-socratic-cancel-btn {
    margin-top: 6px;
    font-size: 11.5px;
  }

  .lv-socratic-conversation {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .lv-socratic-bubble {
    display: flex;
    gap: 8px;
    max-width: 90%;
  }

  .lv-socratic-bubble.is-assistant {
    align-self: flex-start;
  }

  .lv-socratic-bubble.is-user {
    align-self: flex-end;
  }

  .lv-socratic-bubble-avatar {
    width: 26px;
    height: 26px;
    border-radius: 50%;
    background: color-mix(in srgb, var(--lv-brand, #3b82f6) 12%, transparent);
    display: grid;
    place-items: center;
    font-size: 14px;
    flex-shrink: 0;
  }

  .lv-socratic-bubble-content {
    padding: 10px 14px;
    border-radius: 12px;
    font-size: 13px;
    line-height: 1.6;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .is-assistant .lv-socratic-bubble-content {
    background: var(--lv-surface-subtle, #f8fafc);
    border: 1px solid var(--lv-border, rgba(0, 0, 0, 0.08));
    color: var(--lv-text, #0f172a);
    border-top-left-radius: 3px;
  }

  .is-user .lv-socratic-bubble-content {
    background: var(--lv-brand, #3b82f6);
    color: var(--lv-brand-contrast, #ffffff);
    border-top-right-radius: 3px;
  }

  .lv-socratic-foot {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px 16px;
    border-top: 1px solid var(--lv-border, rgba(0, 0, 0, 0.08));
    background: var(--lv-surface-subtle, #f8fafc);
  }

  .lv-socratic-input-row {
    display: flex;
    gap: 8px;
  }

  .lv-socratic-input {
    flex: 1;
    font-size: 12px;
  }

  .lv-socratic-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }
</style>
