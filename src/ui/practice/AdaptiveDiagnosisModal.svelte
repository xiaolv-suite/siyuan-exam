<script lang="ts">
  import Icon from "../shared/Icon.svelte";
  import type { AdaptiveDiagnosisReport } from "@/core/diagnosticEngine";
  import type { Question } from "@/core/types";

  interface Props {
    diagnosisModal: AdaptiveDiagnosisReport | null;
    onclose: () => void;
    onstartQuickPractice: (questions: Question[], notice: string) => void;
  }

  let { diagnosisModal, onclose, onstartQuickPractice }: Props = $props();
</script>

{#if diagnosisModal}
  <button type="button" class="lv-hotkeys-backdrop" aria-label="关闭自适应诊断弹层" onclick={onclose}></button>
  <div class="lv-hotkeys-wrap">
    <div class="lv-card" role="dialog" aria-modal="true" tabindex="-1" aria-label="错题自适应先修根因诊断" style="width:min(620px, 94vw);max-height:85vh;overflow-y:auto;pointer-events:auto;padding:20px;border-radius:var(--lv-r-card, 20px);border:1px solid var(--lv-border-subtle);box-shadow:var(--lv-sh-pop)">
      <div class="lv-row" style="justify-content:space-between;align-items:center;margin:0 0 12px">
        <div class="lv-dialog-title-wrap">
          <span class="lv-dialog-title-icon"><Icon name="compass" size={13} /></span>
          <span>错题自适应先修根因诊断</span>
        </div>
        <button class="lv-btn sm lv-btn--ghost" onclick={onclose} aria-label="关闭"><Icon name="close" size={13} /></button>
      </div>
      <div class="lv-card" style="padding:10px 14px;background:var(--lv-surface-2);border-radius:var(--lv-r-2);margin-bottom:12px;border:1px solid var(--lv-border-subtle)">
        <div style="font-size:12px;color:var(--lv-text-3)">目标考点：<b>{diagnosisModal.targetKp}</b></div>
        <div style="font-size:13px;line-height:1.6;margin-top:6px;color:var(--lv-text)">{diagnosisModal.summaryText}</div>
      </div>
      <h3 style="font-size:13px;font-weight:600;margin:12px 0 6px">🗺️ 推荐先修筑基与靶向攻克路线：</h3>
      <div class="stack-sm">
        {#each diagnosisModal.learningPath as stage, si (si)}
          <div class="lv-diagnosis-stage"
            class:lv-stage--root={stage.status === 'root_cause'}
            class:lv-stage--shaky={stage.status === 'shaky'}
            class:lv-stage--target={stage.status === 'untested'}
            style="padding:10px 12px;background:var(--lv-surface);border:1px solid var(--lv-border);border-radius:var(--lv-r-1)">
            <div style="font-weight:600;font-size:13px;display:flex;justify-content:space-between;align-items:center">
              <span>{stage.title}</span>
              <span class="lv-chip sm">{stage.status === 'root_cause' ? '薄弱根因' : (stage.status === 'shaky' ? '掌握不稳' : '冲刺目标')}</span>
            </div>
            {#if stage.recommendedQuestions.length > 0}
              <div class="lv-row" style="margin:6px 0 0;justify-content:space-between;align-items:center">
                <span style="font-size:12px;color:var(--lv-text-3)">
                  推荐强化题量：共 {stage.recommendedQuestions.length} 题
                </span>
                <button
                  type="button"
                  class="lv-btn sm lv-btn--primary"
                  style="font-size:11px;padding:2px 8px;display:inline-flex;align-items:center;gap:3px"
                  onclick={() => {
                    const qs = stage.recommendedQuestions;
                    onclose();
                    onstartQuickPractice(qs, `已开启阶段【${stage.title}】针对性攻坚特训（共 ${qs.length} 题）`);
                  }}
                >
                  <Icon name="play" size={11} /> 攻坚此阶段
                </button>
              </div>
            {/if}
          </div>
        {/each}
      </div>
      <div class="lv-row" style="margin-top:16px;justify-content:flex-end">
        <button class="lv-btn sm lv-btn--primary" onclick={onclose}>关闭</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .lv-stage--root { border-left: 4px solid var(--lv-accent-seal) !important; }
  .lv-stage--shaky { border-left: 4px solid var(--lv-accent) !important; }
  .lv-stage--target { border-left: 4px solid var(--lv-brand) !important; }
</style>
