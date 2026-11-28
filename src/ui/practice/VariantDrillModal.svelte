<script lang="ts">
  import { onDestroy } from "svelte";
  import type { Question } from "@/core/types";
  import type { WrongItem } from "@/core/types";
  import Icon from "../shared/Icon.svelte";
  import AiThinkingCard from "../shared/AiThinkingCard.svelte";
  import { lvSurfaceStack } from "@/libs/lv-notice-kit";
  import { createFocusTrap, type FocusTrapInstance } from "@/libs/lv-focus-trap";
  import {
    type VariantKind,
    VARIANT_KINDS,
  } from "@/core/variantGenerator";
  import { generateVariantQuestion } from "@/ai/variantService";
  import { ensureAiEndpointConsent, createBrowserConsentStorage } from "./services/aiStudioService";
  import { confirmDialogSync } from "@/libs/dialog";
  import { emitExamEvent } from "@/core/bus";
  import { grade } from "@/core/answer";
  import {
    getEliminationStage,
    getLadderProgress,
    ELIMINATION_STAGES,
  } from "@/core/eliminationLadder";

  interface Props {
    open?: boolean;
    seed: Question | null;
    wrongItem?: WrongItem | null;
    eliminateThreshold?: number;
    app?: any;
    onclose: () => void;
    onpromoted?: (result: { seedQid: string; nextStage: string; streak: number; isMastered: boolean }) => void;
    onsaveVariantToBank?: (variantQ: Question) => Promise<void>;
    t?: (key: string, fallback?: string) => string;
  }

  let {
    open = $bindable(false),
    seed,
    wrongItem = null,
    eliminateThreshold = 2,
    app,
    onclose,
    onpromoted,
    onsaveVariantToBank,
    t: tProp,
  }: Props = $props();

  // 2026-11-21 i18n 债务收敛：t 通道注入（缺省回退原中文），界面文案统一走 variant.* 键（支持 {var} 插值）
  const t = (key: string, fallback = "", vars?: Record<string, string | number>): string => {
    let v = tProp ? tProp(key, fallback) : fallback;
    if (!v) v = fallback;
    if (vars) for (const [name, value] of Object.entries(vars)) v = v.split(`{${name}}`).join(String(value));
    return v;
  };

  let selectedKind = $state<VariantKind>("near_transfer");
  let generating = $state(false);
  // 2026-11-21 走查修复（P3）：真实驻留计时（打开弹窗→提交），替代恒写 15s 的伪用时
  let openedAt = $state(Date.now());
  let generatedQuestion = $state<Question | null>(null);
  let isOfflineFallback = $state(false);
  let errorMessage = $state("");

  // 作答状态
  let myAnswer = $state("");
  let multiSelected = $state<string[]>([]);
  let submitted = $state(false);
  let gradeVerdict = $state<"correct" | "wrong" | null>(null);
  let promotionNotice = $state<string | null>(null);
  let savingToBank = $state(false);
  let savedToBank = $state(false);
  let showSeedDetail = $state(false);
  let variantAbortCtrl: AbortController | null = null;

  function handleCancelGenerate() {
    variantAbortCtrl?.abort();
  }

  function handleModalClose() {
    variantAbortCtrl?.abort();
    onclose();
  }

  // 阶段与进度
  const currentStage = $derived.by(() => {
    if (!wrongItem) return "to_conquer";
    return getEliminationStage(wrongItem, eliminateThreshold);
  });

  const stageConfig = $derived(ELIMINATION_STAGES[currentStage]);
  const stageChipStyle = $derived.by(() => {
    if (currentStage === "mastered") {
      return "background:var(--lv-green-soft);color:var(--lv-green-deep);font-weight:600";
    }
    if (currentStage === "strengthening") {
      return "background:var(--lv-amber-soft);color:var(--lv-amber-deep);font-weight:600";
    }
    return "background:var(--lv-red-soft);color:var(--lv-red-deep);font-weight:600";
  });

  const ladderProgress = $derived.by(() => {
    if (!wrongItem) return { streakCorrect: 0, threshold: eliminateThreshold, progressPct: 0, remainingToMaster: eliminateThreshold };
    return getLadderProgress(wrongItem, eliminateThreshold);
  });

  let dialogEl = $state<HTMLDivElement | null>(null);
  let focusTrap: FocusTrapInstance | null = null;
  let surfaceCleanup: (() => void) | null = null;

  $effect(() => {
    if (open && seed) {
      surfaceCleanup?.();
      surfaceCleanup = lvSurfaceStack.push({
        id: "lv-exam-variant-drill",
        type: "dialog",
        dismiss: () => {
          handleModalClose();
          return true;
        },
      });
    } else {
      surfaceCleanup?.();
      surfaceCleanup = null;
      focusTrap?.release();
      focusTrap = null;
    }
  });

  $effect(() => {
    if (open && seed && dialogEl) {
      focusTrap?.release();
      focusTrap = createFocusTrap(dialogEl, { restoreFocus: true, fallbackToContainer: true });
      focusTrap.activate();
    }
  });

  onDestroy(() => {
    surfaceCleanup?.();
    focusTrap?.release();
  });

  async function handleGenerate() {
    if (!seed || generating) return;
    const { readLocal, writeLocal } = createBrowserConsentStorage();
    const rawEndpoint = String((app as any)?.aiEndpoint ?? "");
    const consented = await ensureAiEndpointConsent(rawEndpoint, confirmDialogSync, readLocal, writeLocal, t, {
      onBlocked: (msg) => { errorMessage = msg; },
    });
    if (!consented) return;
    openedAt = Date.now();
    generating = true;
    errorMessage = "";
    generatedQuestion = null;
    submitted = false;
    gradeVerdict = null;
    promotionNotice = null;
    myAnswer = "";
    multiSelected = [];
    savedToBank = false;

    const ctrl = new AbortController();
    variantAbortCtrl = ctrl;
    try {
      const res = await generateVariantQuestion({
        seed,
        kind: selectedKind,
        signal: ctrl.signal,
        allowOfflineFallback: true,
      });
      if (ctrl.signal.aborted) return;
      generatedQuestion = res.question;
      isOfflineFallback = res.isOfflineFallback;
    } catch (e: any) {
      if (ctrl.signal.aborted || e?.name === "AbortError") {
        return;
      }
      errorMessage = e?.message || t("variant.generateFailed", "生成变式题失败，请检查网络或 AI 配置");
    } finally {
      if (variantAbortCtrl === ctrl) variantAbortCtrl = null;
      generating = false;
    }
  }

  function handleSelectSingleOption(letter: string) {
    if (submitted) return;
    myAnswer = letter;
  }

  function handleToggleMultipleOption(letter: string) {
    if (submitted) return;
    const exists = multiSelected.includes(letter);
    if (exists) {
      multiSelected = multiSelected.filter((l) => l !== letter);
    } else {
      multiSelected = [...multiSelected, letter].sort();
    }
    myAnswer = multiSelected.join("");
  }

  function handleSubmitAnswer() {
    if (!generatedQuestion || !seed || submitted || !myAnswer.trim()) return;
    submitted = true;

    const res = grade(generatedQuestion, myAnswer);
    const isCorrect = res.verdict === "correct";
    gradeVerdict = isCorrect ? "correct" : "wrong";

    // 记录至流水并驱动错题阶梯
    if (app && typeof app.recordAttempt === "function") {
      app.recordAttempt({
        qid: seed.id,
        kind: "practice",
        mode: "variant",
        verdict: isCorrect ? "correct" : "wrong",
        myAnswer,
        sessionId: `s-var-${Date.now().toString(36)}`,
        queue: "wrong",
        timeMs: Math.max(1000, Date.now() - openedAt),
      });

      if (isCorrect) {
        const nextStreak = (wrongItem?.streakCorrect ?? 0) + 1;
        const isMastered = nextStreak >= eliminateThreshold;
        if (isMastered) {
          promotionNotice = t("variant.promotedMastered", "🏆 变式连续攻坚通过（连对 {streak}/{threshold}）！该错题已晋级【🟢 已掌握】，已自动出库！", {streak: nextStreak, threshold: eliminateThreshold});
        } else {
          promotionNotice = t("variant.promotedStrengthening", "🎉 变式强化通过！阶梯晋升至【🟡 强化中】（连对 {streak}/{threshold}），再通过 1 次即可彻底出库！", {streak: nextStreak, threshold: eliminateThreshold});
        }
        if (onpromoted) {
          onpromoted({
            seedQid: seed.id,
            nextStage: isMastered ? "mastered" : "strengthening",
            streak: nextStreak,
            isMastered,
          });
        }
        emitExamEvent("wrongbook-changed", {
          qid: seed.id,
          status: isMastered ? "eliminated" : "active",
        });
      } else {
        promotionNotice = t("variant.promotedReset", "⚠️ 变式测验失分！打破虚假自信，阶梯连对重置回【🔴 待攻克】(0/{threshold})，请深读下方变式解析！", {threshold: eliminateThreshold});
        if (onpromoted) {
          onpromoted({
            seedQid: seed.id,
            nextStage: "to_conquer",
            streak: 0,
            isMastered: false,
          });
        }
        emitExamEvent("wrongbook-changed", {
          qid: seed.id,
          status: "active",
        });
      }
    }
  }

  async function handleSaveToBank() {
    if (!generatedQuestion || savingToBank || savedToBank || !onsaveVariantToBank) return;
    savingToBank = true;
    try {
      await onsaveVariantToBank(generatedQuestion);
      savedToBank = true;
    } catch (e: any) {
      // 2026-11-21 走查修复（P3）：保存失败原先静默（finally 复位后无任何提示，假成功）
      errorMessage = e?.message || t("variant.saveFailed", "保存变式题失败，请稍后重试");
    } finally {
      savingToBank = false;
    }
  }
</script>

<svelte:window onkeydown={(e) => { if (open && !e.isComposing && e.keyCode !== 229 && e.key === "Escape") { e.stopPropagation(); handleModalClose(); } }} />

{#if open && seed}
  <button type="button" class="lv-variant-backdrop" aria-label={t("variant.closeAria", "关闭")} onclick={handleModalClose}></button>
  <div bind:this={dialogEl} class="lv-variant-wrap" role="dialog" aria-modal="true" aria-labelledby="lv-variant-title">
    <div tabindex="-1" class="lv-variant-card">
      <!-- 头部 -->
      <div class="lv-variant-header">
        <div class="lv-row" style="margin:0;gap:8px;align-items:center">
          <span class="lv-variant-title-icon"><Icon name="zap" size={15} /></span>
          <span id="lv-variant-title" class="lv-variant-title">{t("variant.title", "AI 考点变式衍生题机")}</span>
          <span class="lv-chip" style={stageChipStyle}>
            {stageConfig.badge} (连对 {ladderProgress.streakCorrect}/{ladderProgress.threshold})
          </span>
        </div>
        <button class="lv-btn sm lv-btn--ghost" onclick={handleModalClose} aria-label={t("variant.closeAria", "关闭")}><Icon name="close" size={14} /></button>
      </div>

      <!-- 原题回顾（可折叠） -->
      <div class="lv-variant-seed-box">
        <div class="lv-row" style="justify-content:space-between;align-items:center;margin:0">
          <span class="lv-muted" style="font-size:12px;display:inline-flex;align-items:center;gap:4px">
            <Icon name="bookmark" size={12} /> {t("variant.seedKpLabel", "针对原错题考点：")}<b>{seed.kp || t("variant.seedKpFallback", "基础核心考点")}</b>
          </span>
          <button class="lv-btn sm lv-btn--ghost" style="padding:2px 8px;height:22px;font-size:11px" onclick={() => showSeedDetail = !showSeedDetail}>
            {showSeedDetail ? t("variant.seedCollapse", "收起原题") : t("variant.seedExpand", "速览原题 ▾")}
          </button>
        </div>
        {#if showSeedDetail}
          <div class="lv-variant-seed-content">
            <div class="seed-stem">{seed.stem}</div>
            {#if seed.options && seed.options.length}
              <div class="seed-options">
                {#each seed.options as opt, i}
                  <div class="seed-opt-item">
                    <span class="seed-opt-tag">{String.fromCharCode(65 + i)}</span>
                    <span>{opt}</span>
                  </div>
                {/each}
              </div>
            {/if}
            <div class="seed-answer">{t("variant.correctAnswerLabel", "标准答案：")}<b style="color:var(--lv-data-accent)">{seed.answer}</b></div>
          </div>
        {/if}
      </div>

      <!-- 变式维度选择卡片 -->
      <div class="lv-variant-kinds-grid">
        {#each Object.values(VARIANT_KINDS) as item (item.kind)}
          <button
            type="button"
            class="lv-variant-kind-btn"
            class:active={selectedKind === item.kind}
            onclick={() => selectedKind = item.kind}
          >
            <div class="kind-top">
              <span class="kind-badge">{item.badge}</span>
              {#if selectedKind === item.kind}
                <span class="kind-check"><Icon name="check" size={12} /></span>
              {/if}
            </div>
            <div class="kind-desc">{item.summary}</div>
          </button>
        {/each}
      </div>

      <!-- 操作栏：生成按钮 -->
      <div class="lv-row" style="margin:12px 0;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
        <span class="lv-muted" style="font-size:12px">
          {t("variant.selectedKindLabel", "选定维度：")}<b>{VARIANT_KINDS[selectedKind].label}</b> · {VARIANT_KINDS[selectedKind].instruction.slice(0, 36)}…
        </span>
        <button
          class="lv-btn lv-btn--primary"
          disabled={generating}
          onclick={handleGenerate}
        >
          <Icon name="zap" size={14} />
          {generating ? t("variant.generating", "🤖 AI 考点变式衍生中…") : t("variant.generateBtn", "✨ 衍生一道高仿变式题")}
        </button>
      </div>

      {#if generating}
        <div style="margin:10px 0 12px">
          <AiThinkingCard
            scenario="question-gen"
            compact={true}
            defaultIcon="⚡"
            title="⚡ 正在构建高仿考点变式题…"
            subtitle={`变式维度：${VARIANT_KINDS[selectedKind].label} · 保持同考点换情境`}
            cancelLabel="⏹ 取消衍生"
            oncancel={handleCancelGenerate}
          />
        </div>
      {/if}

      <!-- 错误提示 -->
      {#if errorMessage}
        <div class="lv-variant-alert error">
          <Icon name="alert-triangle" size={14} />
          <span>{errorMessage}</span>
        </div>
      {/if}

      <!-- 离线提示 -->
      {#if isOfflineFallback && generatedQuestion}
        <div class="lv-variant-alert warning">
          <Icon name="wifi-off" size={14} />
          <span>{t("variant.offlineNotice", "离线模式：已由本地启发式引擎完成变式衍生，作答结果可 100% 正常推动阶梯晋级。")}</span>
        </div>
      {/if}

      <!-- 变式题目交互区 -->
      {#if generatedQuestion}
        <div class="lv-variant-body">
          <div class="variant-tag-row">
            <span class="lv-chip lv-chip--amb">🎯 {t("variant.kindTag", "{kind}变式", {kind: VARIANT_KINDS[selectedKind].label})}</span>
            <span class="lv-chip">{generatedQuestion.type === "multiple" ? "多选题" : generatedQuestion.type === "judge" ? "判断题" : generatedQuestion.type === "fill" ? "填空题" : generatedQuestion.type === "short" ? "简答题" : t("variant.typeSingle", "单选题")}</span>
            {#if generatedQuestion.difficulty}
              <span class="lv-chip">{t("variant.difficultyLabel", "难度：")}{generatedQuestion.difficulty}</span>
            {/if}
          </div>

          <!-- 题干 -->
          <div class="variant-stem">{generatedQuestion.stem}</div>

          <!-- 选项区 -->
          {#if generatedQuestion.type === "single" && generatedQuestion.options}
            <div class="variant-options-list">
              {#each generatedQuestion.options as opt, idx}
                {@const letter = String.fromCharCode(65 + idx)}
                <button
                  type="button"
                  class="variant-opt-btn"
                  class:selected={myAnswer === letter}
                  class:correct={submitted && letter === generatedQuestion.answer}
                  class:wrong={submitted && myAnswer === letter && letter !== generatedQuestion.answer}
                  disabled={submitted}
                  onclick={() => handleSelectSingleOption(letter)}
                >
                  <span class="opt-key">{letter}</span>
                  <span class="opt-val">{opt}</span>
                </button>
              {/each}
            </div>
          {:else if generatedQuestion.type === "multiple" && generatedQuestion.options}
            <div class="variant-options-list">
              {#each generatedQuestion.options as opt, idx}
                {@const letter = String.fromCharCode(65 + idx)}
                <button
                  type="button"
                  class="variant-opt-btn"
                  class:selected={multiSelected.includes(letter)}
                  class:correct={submitted && generatedQuestion.answer.includes(letter)}
                  class:wrong={submitted && multiSelected.includes(letter) && !generatedQuestion.answer.includes(letter)}
                  disabled={submitted}
                  onclick={() => handleToggleMultipleOption(letter)}
                >
                  <span class="opt-key">{letter}</span>
                  <span class="opt-val">{opt}</span>
                </button>
              {/each}
            </div>
          {:else}
            <!-- 填空或简答 -->
            <div class="lv-row" style="margin:12px 0;align-items:center;gap:8px">
              <input
                type="text"
                class="lv-input"
                style="flex:1"
                placeholder={t("variant.answerPlaceholder", "请输入你的作答答案…")}
                bind:value={myAnswer}
                disabled={submitted}
                onkeydown={(e) => { if (e.isComposing || e.keyCode === 229) return; if (e.key === "Enter" && !submitted && myAnswer.trim()) handleSubmitAnswer(); }}
              />
            </div>
          {/if}

          <!-- 提交作答栏 -->
          {#if !submitted}
            <div class="lv-row" style="margin-top:14px;justify-content:flex-end">
              <button
                class="lv-btn lv-btn--primary"
                disabled={!myAnswer.trim()}
                onclick={handleSubmitAnswer}
              >
                <Icon name="check" size={14} /> {t("variant.submitBtn", "提交变式作答并核验")}
              </button>
            </div>
          {/if}

          <!-- 判分结果与阶梯晋级通告 -->
          {#if submitted}
            <div class="lv-variant-result-box" class:is-correct={gradeVerdict === "correct"} class:is-wrong={gradeVerdict === "wrong"}>
              <div class="result-head">
                {#if gradeVerdict === "correct"}
                  <span class="result-badge correct">{t("variant.correctBadge", "✅ 回答正确！")}</span>
                {:else}
                  <span class="result-badge wrong">{t("variant.wrongBadge", "❌ 回答错误！")}</span>
                {/if}
                <span class="answer-info">{t("variant.correctAnswerInfo", "正确答案：")}<b>{generatedQuestion.answer}</b></span>
              </div>

              {#if promotionNotice}
                <div class="promotion-notice">
                  {promotionNotice}
                </div>
              {/if}

              <!-- 解析 -->
              {#if generatedQuestion.analysis}
                <div class="variant-analysis">
                  <div class="analysis-title"><Icon name="file" size={12} /> {t("variant.analysisTitle", "变式详尽解析")}</div>
                  <div class="analysis-text">{generatedQuestion.analysis}</div>
                </div>
              {/if}

              <!-- 底部操作：收录到题库 / 继续衍生 -->
              <div class="lv-row" style="margin-top:14px;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
                <div class="lv-row" style="margin:0;gap:8px">
                  {#if onsaveVariantToBank}
                    <button
                      class="lv-btn sm lv-btn--ghost"
                      disabled={savingToBank || savedToBank}
                      onclick={handleSaveToBank}
                    >
                      <Icon name="save" size={13} />
                      {savedToBank ? t("variant.savedChip", "✓ 已收录至题库") : savingToBank ? t("variant.savingChip", "收录中…") : t("variant.saveBtn", "💾 保存此变式题到题库")}
                    </button>
                  {/if}
                </div>
                <button
                  class="lv-btn sm lv-btn--primary"
                  onclick={handleGenerate}
                >
                  <Icon name="zap" size={13} /> {t("variant.regenerateBtn", "再换一种变式维度挑战")}
                </button>
              </div>
            </div>
          {/if}
        </div>
      {/if}
    </div>
  </div>
{/if}

<style lang="scss">
  .lv-variant-backdrop {
    position: fixed;
    inset: 0;
    background: var(--lv-overlay);
    z-index: 999;
    border: none;
    cursor: pointer;
    backdrop-filter: blur(2px);
  }

  .lv-variant-wrap {
    position: fixed;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    padding: 16px;
    pointer-events: none;
  }

  .lv-variant-card {
    pointer-events: auto;
    background: var(--lv-surface);
    border: 1px solid var(--lv-border-subtle, var(--lv-border));
    border-radius: var(--lv-r-card, 16px);
    box-shadow: var(--lv-sh-pop), var(--lv-inset-card);
    width: 100%;
    max-width: 680px;
    max-height: 90vh;
    overflow-y: auto;
    padding: 20px 24px;
    display: flex;
    flex-direction: column;
    color: var(--lv-text);
  }

  .lv-variant-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
  }

  .lv-variant-title-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: 8px;
    background: color-mix(in srgb, var(--lv-data-accent, #10B981) 15%, transparent);
    color: var(--lv-data-accent, #10B981);
  }

  .lv-variant-title {
    font-size: 16px;
    font-weight: 700;
  }

  .lv-variant-seed-box {
    background: var(--lv-surface-2, rgba(0, 0, 0, 0.03));
    border: 1px solid var(--lv-border-subtle, rgba(0, 0, 0, 0.08));
    border-radius: 10px;
    padding: 10px 14px;
    margin-bottom: 12px;
  }

  .lv-variant-seed-content {
    margin-top: 8px;
    padding-top: 8px;
    border-top: 1px dashed var(--lv-border-subtle, rgba(0, 0, 0, 0.08));
    font-size: 13px;
    line-height: 1.5;
  }

  .seed-stem {
    font-weight: 500;
    margin-bottom: 6px;
  }

  .seed-options {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin: 6px 0;
  }

  .seed-opt-item {
    display: flex;
    gap: 6px;
    font-size: 12px;
  }

  .seed-opt-tag {
    font-weight: 700;
    color: var(--lv-text-2);
  }

  .seed-answer {
    font-size: 12px;
    margin-top: 4px;
  }

  .lv-variant-kinds-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
    margin-bottom: 8px;

    @media (max-width: 520px) {
      grid-template-columns: 1fr;
    }
  }

  .lv-variant-kind-btn {
    text-align: left;
    background: var(--lv-surface);
    color: var(--lv-text);
    border: 1px solid var(--lv-border-subtle, var(--lv-border));
    border-radius: 10px;
    padding: 8px 12px;
    cursor: pointer;
    transition: all 0.15s ease;

    &:hover {
      border-color: var(--lv-brand);
      background: color-mix(in srgb, var(--lv-brand) 6%, var(--lv-surface));
    }

    &.active {
      border-color: var(--lv-brand);
      background: color-mix(in srgb, var(--lv-brand) 10%, var(--lv-surface));
      box-shadow: 0 0 0 2px color-mix(in srgb, var(--lv-brand) 20%, transparent);
    }
  }

  .kind-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 4px;
  }

  .kind-badge {
    font-size: 13px;
    font-weight: 600;
    color: var(--lv-text);
  }

  .kind-check {
    color: var(--lv-brand);
  }

  .kind-desc {
    font-size: 11px;
    color: var(--lv-text-2);
    line-height: 1.35;
  }

  .lv-variant-alert {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    border-radius: 8px;
    font-size: 12px;
    margin: 8px 0;

    &.error {
      background: color-mix(in srgb, var(--lv-red, #ef4444) 10%, transparent);
      color: var(--lv-red, #ef4444);
      border: 1px solid color-mix(in srgb, var(--lv-red, #ef4444) 25%, transparent);
    }

    &.warning {
      background: color-mix(in srgb, var(--lv-amber, #f59e0b) 10%, transparent);
      color: var(--lv-amber, #f59e0b);
      border: 1px solid color-mix(in srgb, var(--lv-amber, #f59e0b) 25%, transparent);
    }
  }

  .lv-variant-body {
    border-top: 1px solid var(--lv-border-subtle, rgba(0, 0, 0, 0.08));
    padding-top: 14px;
    margin-top: 6px;
  }

  .variant-tag-row {
    display: flex;
    gap: 6px;
    margin-bottom: 8px;
  }

  .variant-stem {
    font-size: 14px;
    font-weight: 600;
    line-height: 1.6;
    margin-bottom: 12px;
  }

  .variant-options-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-bottom: 12px;
  }

  .variant-opt-btn {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 10px 14px;
    border-radius: 10px;
    background: var(--lv-surface);
    color: var(--lv-text);
    border: 1px solid var(--lv-border-subtle, var(--lv-border));
    text-align: left;
    cursor: pointer;
    font-size: 13px;
    line-height: 1.45;
    transition: all 0.15s ease;

    &:hover:not(:disabled) {
      border-color: var(--lv-brand, #0d9488);
      background: color-mix(in srgb, var(--lv-brand, #0d9488) 5%, transparent);
    }

    &.selected {
      border-color: var(--lv-brand, #0d9488);
      background: color-mix(in srgb, var(--lv-brand, #0d9488) 10%, transparent);
      font-weight: 600;
    }

    &.correct {
      border-color: var(--lv-green, #10b981) !important;
      background: color-mix(in srgb, var(--lv-green, #10b981) 12%, transparent) !important;
      color: var(--lv-green, #10b981) !important;
    }

    &.wrong {
      border-color: var(--lv-red, #ef4444) !important;
      background: color-mix(in srgb, var(--lv-red, #ef4444) 10%, transparent) !important;
      color: var(--lv-red, #ef4444) !important;
    }
  }

  .opt-key {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    border-radius: 6px;
    background: var(--lv-surface-2, rgba(0, 0, 0, 0.05));
    font-weight: 700;
    font-size: 12px;
    flex-shrink: 0;
  }

  .opt-val {
    flex: 1;
  }

  .lv-variant-result-box {
    margin-top: 14px;
    padding: 12px 16px;
    border-radius: 12px;
    background: var(--lv-surface-2, rgba(0, 0, 0, 0.03));
    border: 1px solid var(--lv-border-subtle, rgba(0, 0, 0, 0.1));

    &.is-correct {
      border-left: 4px solid var(--lv-green, #10b981);
    }

    &.is-wrong {
      border-left: 4px solid var(--lv-red, #ef4444);
    }
  }

  .result-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
  }

  .result-badge {
    font-size: 14px;
    font-weight: 700;

    &.correct {
      color: var(--lv-green, #10b981);
    }

    &.wrong {
      color: var(--lv-red, #ef4444);
    }
  }

  .answer-info {
    font-size: 12px;
    color: var(--lv-text-2);
  }

  .promotion-notice {
    margin: 8px 0;
    padding: 8px 12px;
    border-radius: 8px;
    background: color-mix(in srgb, var(--lv-data-accent) 12%, transparent);
    color: var(--lv-text);
    font-size: 12px;
    font-weight: 600;
    line-height: 1.45;
  }

  .variant-analysis {
    margin-top: 10px;
    padding-top: 8px;
    border-top: 1px dashed var(--lv-border-subtle, var(--lv-border));
  }

  .analysis-title {
    font-size: 12px;
    font-weight: 600;
    color: var(--lv-text-2);
    display: inline-flex;
    align-items: center;
    gap: 4px;
    margin-bottom: 6px;
  }

  .analysis-text {
    font-size: 12px;
    line-height: 1.6;
    color: var(--lv-text);
    white-space: pre-wrap;
  }
</style>
