<script lang="ts">
  import type { Question } from "@/core/types";
  import Icon from "../shared/Icon.svelte";

  interface Props {
    open?: boolean;
    q: Question | null;
    mode?: "socratic" | "explain" | "hint" | "dual-loop" | "storm";
    busy?: boolean;
    text?: string;
    history?: Array<{ role: string; content: string }>;
    onclose: () => void;
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
    history = [],
    onclose,
    onsendFollowUp,
    onsaveToNote,
    saveBusy = false,
    saved = false,
  }: Props = $props();

  let elapsedSec = $state(0);
  let followUpText = $state("");

  $effect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    if (open && busy) {
      elapsedSec = 0;
      timer = setInterval(() => {
        elapsedSec += 1;
      }, 1000);
    } else {
      if (timer) clearInterval(timer);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  });

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

  const stageCopy = $derived.by(() => {
    if (mode === "socratic") {
      if (elapsedSec < 3) return "🔍 正在深入解析本题考点与题干脉络…";
      if (elapsedSec < 8) return "💡 正在审视思维路径，构思苏格拉底启发引导…";
      if (elapsedSec < 16) return "✍️ 正在组织单步启发式提问（引导自主推导，绝不直接剧透）…";
      return "✨ 正在完成最终文本润色与格式排版，马上就来…";
    }
    if (elapsedSec < 3) return "🔍 正在解析题目考点与选项结构…";
    if (elapsedSec < 8) return "💡 正在深入推导解题依据与思维模型…";
    if (elapsedSec < 16) return "✍️ 正在生成结构化试题详解与延伸辨析…";
    return "✨ 正在完成最终文本润色与格式排版，马上就来…";
  });

  function handleSend() {
    const val = followUpText.trim();
    if (!val || busy) return;
    followUpText = "";
    onsendFollowUp?.(val);
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.isComposing || e.keyCode === 229) return;
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
    if (e.key === "Escape") {
      e.preventDefault();
      onclose();
    }
  }
</script>

{#if open}
  <div class="lv-hotkeys-backdrop" onclick={onclose} aria-hidden="true"></div>
  <div
    class="lv-socratic-modal"
    role="dialog"
    aria-modal="true"
    aria-labelledby="socratic-modal-title"
    tabindex="-1"
    onkeydown={handleKeydown}
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
        <div class="lv-socratic-thinking" role="status" aria-live="polite">
          <div class="lv-socratic-sparkle-glow">
            <span class="lv-socratic-pulse-icon">🦉</span>
          </div>
          <div class="lv-socratic-stage-text">{stageCopy}</div>
          <div class="lv-socratic-timer-pill">
            <Icon name="clock" size={12} />
            <span>已思考 <b>{elapsedSec}</b> 秒</span>
          </div>
          <div class="lv-socratic-progress-track">
            <div class="lv-socratic-progress-fill"></div>
          </div>
          <button type="button" class="lv-btn sm lv-btn--ghost lv-socratic-cancel-btn" onclick={onclose}>
            收起等待 (后台继续生成)
          </button>
        </div>
      {:else if text || history.length > 0}
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
          {:else}
            <div class="lv-socratic-bubble is-assistant">
              <div class="lv-socratic-bubble-avatar">🦉</div>
              <div class="lv-socratic-bubble-content">{text}</div>
            </div>
          {/if}
        </div>
      {:else}
        <div class="lv-empty" style="padding:24px 0">
          <p class="lv-muted">点击下方启发引导开始对话</p>
        </div>
      {/if}
    </div>

    <!-- 底部互动区：支持多轮启发追问 -->
    {#if !busy && (text || history.length > 0)}
      <footer class="lv-socratic-foot">
        <div class="lv-socratic-input-row">
          <input
            type="text"
            class="lv-input sm lv-socratic-input"
            placeholder="输入你的推导思路或猜测，与苏格拉底对话… (Enter 发送)"
            bind:value={followUpText}
            onkeydown={handleKeydown}
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
        <div class="lv-socratic-actions">
          {#if onsaveToNote}
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

  .lv-socratic-thinking {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 28px 16px;
    text-align: center;
    gap: 12px;
  }

  .lv-socratic-sparkle-glow {
    width: 56px;
    height: 56px;
    border-radius: 50%;
    background: color-mix(in srgb, var(--lv-brand, #3b82f6) 14%, transparent);
    display: grid;
    place-items: center;
    font-size: 26px;
    box-shadow: 0 0 20px color-mix(in srgb, var(--lv-brand, #3b82f6) 25%, transparent);
    animation: socraticPulse 1.8s ease-in-out infinite;
  }

  @keyframes socraticPulse {
    0%, 100% {
      transform: scale(0.96);
      box-shadow: 0 0 12px color-mix(in srgb, var(--lv-brand, #3b82f6) 20%, transparent);
    }
    50% {
      transform: scale(1.08);
      box-shadow: 0 0 24px color-mix(in srgb, var(--lv-brand, #3b82f6) 45%, transparent);
    }
  }

  .lv-socratic-stage-text {
    font-size: 13.5px;
    font-weight: 650;
    color: var(--lv-text, #0f172a);
    max-width: 380px;
    line-height: 1.5;
  }

  .lv-socratic-timer-pill {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 3px 10px;
    border-radius: 9999px;
    background: var(--lv-surface-subtle, #f1f5f9);
    font-size: 11.5px;
    color: var(--lv-text-3, #64748b);
  }

  .lv-socratic-timer-pill b {
    color: var(--lv-brand, #3b82f6);
    font-variant-numeric: tabular-nums;
  }

  .lv-socratic-progress-track {
    width: 220px;
    height: 4px;
    border-radius: 9999px;
    background: color-mix(in srgb, var(--lv-text, #000000) 8%, transparent);
    overflow: hidden;
    position: relative;
    margin-top: 4px;
  }

  .lv-socratic-progress-fill {
    width: 60%;
    height: 100%;
    border-radius: 9999px;
    background: linear-gradient(90deg, var(--lv-brand, #3b82f6), var(--lv-accent, #a855f7));
    animation: socraticSlide 1.4s ease-in-out infinite;
  }

  @keyframes socraticSlide {
    0% { transform: translateX(-100%); }
    100% { transform: translateX(250%); }
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
    color: var(--lv-surface, #ffffff);
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
