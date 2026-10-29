<script lang="ts">
  import Icon from "../shared/Icon.svelte";

  interface Props {
    selectedCount: number;
    batchCardBusy: boolean;
    kernelOnline: boolean;
    onclearSelection: () => void;
    onstartFocusDrill: () => void;
    onprintSelectedQuestions: () => void;
    onprintTeacherPaper: () => void;
    onprintHomeworkSheet: () => void;
    onbatchConvertToCards: () => void;
  }

  let {
    selectedCount,
    batchCardBusy,
    kernelOnline,
    onclearSelection,
    onstartFocusDrill,
    onprintSelectedQuestions,
    onprintTeacherPaper,
    onprintHomeworkSheet,
    onbatchConvertToCards,
  }: Props = $props();
</script>

<div style="position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:95;width:min(680px, calc(100vw - 32px));animation:lv-appear 0.2s var(--lv-ease-out)">
  <div class="lv-card" style="box-shadow:var(--lv-sh-pop);padding:10px 18px;border-radius:var(--lv-r-4, 20px);border:1px solid var(--lv-border-subtle, var(--lv-border));background:color-mix(in srgb, var(--lv-surface) 92%, transparent);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px)">
    <div class="lv-row" style="margin:0;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
      <div class="lv-row" style="margin:0;gap:6px">
        <span class="lv-chip lv-chip--acc num">已选 {selectedCount} 题</span>
        <button class="lv-btn sm lv-btn--ghost" onclick={onclearSelection}>清空选择</button>
      </div>
      <div class="lv-row" style="margin:0;gap:6px">
        <button class="lv-btn sm lv-btn--primary" onclick={onstartFocusDrill} title="将勾选的这批题目发起专属特训">
          <Icon name="play" size={13} /> 开始特训
        </button>
        <button class="lv-btn sm lv-btn--ghost" onclick={onprintSelectedQuestions} title="导出为 A4 双栏试卷">
          <Icon name="file" size={13} /> 打印试卷
        </button>
        <button class="lv-btn sm lv-btn--ghost" onclick={onprintTeacherPaper} title="导出勾选题教师教案讲义">
          <Icon name="book" size={13} /> 教师教案
        </button>
        <button class="lv-btn sm lv-btn--ghost" onclick={onprintHomeworkSheet} title="导出勾选题课后作业单">
          <Icon name="file-text" size={13} /> 作业单
        </button>
        <button class="lv-btn sm lv-btn--ghost" onclick={onbatchConvertToCards} disabled={batchCardBusy || !kernelOnline} title="批量制成闪卡">
          <Icon name="layers" size={13} /> 推送闪卡
        </button>
      </div>
    </div>
  </div>
</div>
