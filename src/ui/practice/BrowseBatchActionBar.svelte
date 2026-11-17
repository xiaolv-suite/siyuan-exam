<script lang="ts">
  import Icon from "../shared/Icon.svelte";
  import type { PrintPaperFormat } from "./services/printPaperService";

  interface Props {
    selectedCount: number;
    batchCardBusy: boolean;
    kernelOnline: boolean;
    onclearSelection: () => void;
    onstartFocusDrill: () => void;
    onprintSelectedQuestions: (format?: PrintPaperFormat) => void;
    onopenAssembleStudio?: () => void;
    onbatchConvertToCards: () => void;
  }

  let {
    selectedCount,
    batchCardBusy,
    kernelOnline,
    onclearSelection,
    onstartFocusDrill,
    onprintSelectedQuestions,
    onopenAssembleStudio,
    onbatchConvertToCards,
  }: Props = $props();

  let printFormat = $state<PrintPaperFormat>("exam");
</script>

<div role="toolbar" aria-label="批量操作快捷栏" class="lv-batch-action-bar">
  <div class="lv-card lv-batch-action-card" style="box-shadow:var(--lv-sh-pop);padding:10px 18px;border-radius:var(--lv-r-4, 20px);border:1px solid var(--lv-border-subtle, var(--lv-border));background:color-mix(in srgb, var(--lv-surface) 92%, transparent);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px)">
    <div class="lv-row lv-batch-action-row" style="margin:0;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
      <div class="lv-row lv-batch-action-group" style="margin:0;gap:6px">
        <span class="lv-chip lv-chip--data num">已选 {selectedCount} 题</span>
        <button class="lv-btn sm lv-btn--ghost" onclick={onclearSelection}>清空选择</button>
      </div>
      <div class="lv-row lv-batch-action-group" style="margin:0;gap:6px">
        <button class="lv-btn sm lv-btn--primary" onclick={onstartFocusDrill} title="将勾选的这批题目发起专属特训">
          <Icon name="play" size={13} /> 开始特训
        </button>
        <select class="lv-select sm" bind:value={printFormat} aria-label="选择打印试卷版式">
          <option value="exam">标准测试卷</option>
          <option value="card">🗂️ 标准答题卡</option>
          <option value="answer">独立答案册</option>
          <option value="lecture">授课讲义卷</option>
          <option value="homework">留白作业单</option>
          <option value="interactive">🌐 交互式讲题自测卷</option>
        </select>
        {#if onopenAssembleStudio}
          <button class="lv-btn sm lv-btn--ghost" onclick={onopenAssembleStudio} title="进入专业组卷排版打印工坊，实时 A4 纸张拟真预览与参数定制">
            <Icon name="printer" size={13} /> 🖨️ 组卷排版
          </button>
        {/if}
        <button class="lv-btn sm lv-btn--ghost" onclick={() => onprintSelectedQuestions(printFormat)} title="按所选版式直接导出 A4 双栏打印卷">
          <Icon name="file" size={13} /> 打印试卷
        </button>
        <button class="lv-btn sm lv-btn--ghost" onclick={onbatchConvertToCards} disabled={batchCardBusy || !kernelOnline} aria-busy={batchCardBusy} title="批量制成闪卡">
          <Icon name="layers" size={13} /> 推送闪卡
        </button>
      </div>
    </div>
  </div>
</div>

<style>
  .lv-batch-action-bar {
    position: fixed;
    bottom: 24px;
    left: 0;
    right: 0;
    margin-inline: auto;
    z-index: 95;
    width: min(680px, calc(100vw - 32px));
    animation: lv-appear 0.2s var(--lv-ease-out);
  }
  @container lv-exam (max-width: 759px) {
    .lv-batch-action-bar {
      bottom: calc(var(--lv-tasknav-height, 68px) + 6px);
      width: min(680px, calc(100vw - 16px));
    }
    .lv-batch-action-card {
      padding: 8px 10px !important;
      border-radius: var(--lv-r-3, 14px) !important;
    }
    .lv-batch-action-row {
      flex-wrap: nowrap !important;
      overflow-x: auto;
      overscroll-behavior-x: contain;
      -webkit-overflow-scrolling: touch;
      scrollbar-width: none;
      gap: 6px !important;
    }
    .lv-batch-action-row::-webkit-scrollbar {
      display: none;
    }
    .lv-batch-action-group {
      flex-wrap: nowrap !important;
      flex-shrink: 0;
    }
    .lv-batch-action-row :global(.lv-btn.sm),
    .lv-batch-action-row :global(.lv-select.sm) {
      min-height: 34px !important;
      height: 34px !important;
      padding: 0 8px !important;
      font-size: 12px !important;
      flex-shrink: 0;
    }
  }
  @media (max-width: 759px) {
    .lv-batch-action-bar {
      bottom: calc(var(--lv-tasknav-height, 68px) + 6px);
      width: min(680px, calc(100vw - 16px));
    }
    .lv-batch-action-card {
      padding: 8px 10px !important;
      border-radius: var(--lv-r-3, 14px) !important;
    }
    .lv-batch-action-row {
      flex-wrap: nowrap !important;
      overflow-x: auto;
      overscroll-behavior-x: contain;
      -webkit-overflow-scrolling: touch;
      scrollbar-width: none;
      gap: 6px !important;
    }
    .lv-batch-action-row::-webkit-scrollbar {
      display: none;
    }
    .lv-batch-action-group {
      flex-wrap: nowrap !important;
      flex-shrink: 0;
    }
  }
</style>
