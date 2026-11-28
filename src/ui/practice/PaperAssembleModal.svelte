<script lang="ts">
  import { onDestroy } from "svelte";
  import Icon from "../shared/Icon.svelte";
  import type { Question } from "@/core/types";
  import { escapeHtml } from "@/libs/sanitize";
  import { lvSurfaceStack } from "@/libs/lv-notice-kit";
  import { createFocusTrap, type FocusTrapInstance } from "@/libs/lv-focus-trap";
  import {
    computePinchDistance,
    computePinchScale,
    computeDoubleTapZoomScale,
    computeFitWidthZoomPercent,
  } from "@/core/pinchZoom";
  import {
    buildCompactQuestionSheetPro,
    buildTeacherLectureSheetPro,
    buildStudentHomeworkSheetPro,
    buildCompactAnswerSheetPro,
    buildInteractiveReviewSheetPro,
    buildStandardAnswerCardPro,
    generatePaperVariant,
    auditPaperBeforePrint,
    type PrintProOptions,
    type PaperSize,
    type ColumnLayout,
    type SecretLevel,
  } from "@/core/printPro";
  import { openOrDownloadHtml, type MessageReporter } from "./services/printPaperService";
  import { localDateKeyOf } from "@/core/checkinBridge";

  type PaperFormat = "exam" | "card" | "lecture" | "homework" | "answer" | "interactive";

  interface Props {
    open: boolean;
    bankName: string;
    questions: readonly Question[];
    onclose: () => void;
    showMessage: MessageReporter;
  }

  let {
    open,
    bankName,
    questions,
    onclose,
    showMessage,
  }: Props = $props();

  let activeQuestions = $state<Question[]>([]);
  let reorderListOpen = $state(false);

  let variantMode = $state<"orig" | "A" | "B">("orig");
  let secretLevel = $state<SecretLevel>("none");
  let watermarkText = $state("");
  let preflightOpen = $state(false);

  let paperFormat = $state<PaperFormat>("exam");
  let activeQuickPreset = $state<"standard" | "homework" | "lecture" | "compact" | null>("standard");
  let mainTitle = $state("");
  let subtitle = $state("");
  let paperNo = $state("");
  let columns = $state<ColumnLayout>("single");
  let paperSize = $state<PaperSize>("A4");
  let fontSizeMode = $state<"standard" | "compact" | "large">("standard");

  let autoGroupSections = $state(true);
  let showSealLine = $state(true);
  let showStudentInfoBar = $state(false);
  let showScoreGrid = $state(true);
  let showPerQuestionScoreBox = $state(true);
  let showExamNotice = $state(true);
  let showScore = $state(true);
  let appendSolutionsAtEnd = $state(false);
  let shortAnswerSpaceCm = $state(5);
  let zoomLevel = $state<number>(100);
  let previewIframeHeight = $state<number>(1180);
  let dialogEl = $state<HTMLDivElement | null>(null);
  let previewContainerEl = $state<HTMLDivElement | null>(null);
  let focusTrap: FocusTrapInstance | null = null;
  let surfaceCleanup: (() => void) | null = null;

  let pinchStartDist = 0;
  let pinchStartScale = 1;
  let isPinching = false;
  let lastTapTs = 0;

  function applyFitWidthZoom() {
    const w = previewContainerEl?.clientWidth ?? (typeof window !== "undefined" ? window.innerWidth : 794);
    zoomLevel = computeFitWidthZoomPercent(w, 794, 40, 100);
  }

  function handlePreviewTouchStart(e: TouchEvent) {
    e.stopPropagation();
    if (e.touches.length === 2) {
      isPinching = true;
      pinchStartDist = computePinchDistance(e.touches[0]!, e.touches[1]!);
      pinchStartScale = zoomLevel / 100;
      return;
    }
    if (e.touches.length === 1) {
      const now = Date.now();
      if (now - lastTapTs < 280) {
        lastTapTs = 0;
        const fitPct = computeFitWidthZoomPercent(
          previewContainerEl?.clientWidth ?? (typeof window !== "undefined" ? window.innerWidth : 794),
          794,
          40,
          100,
        );
        const nextScale = computeDoubleTapZoomScale(zoomLevel / 100, fitPct / 100, Math.min(1.5, (fitPct / 100) * 1.6));
        zoomLevel = Math.round(nextScale * 100);
      } else {
        lastTapTs = now;
      }
    }
  }

  function handlePreviewTouchMove(e: TouchEvent) {
    e.stopPropagation();
    if (isPinching && e.touches.length === 2) {
      e.preventDefault();
      const dist = computePinchDistance(e.touches[0]!, e.touches[1]!);
      const next = computePinchScale(pinchStartDist, dist, pinchStartScale, 0.4, 2.5);
      zoomLevel = Math.round(next * 100);
    }
  }

  function handlePreviewTouchEnd(e: TouchEvent) {
    e.stopPropagation();
    if (e.touches.length < 2) {
      isPinching = false;
    }
  }

  let wasOpen = false;
  $effect(() => {
    if (open && !wasOpen) {
      wasOpen = true;
      const incoming = [...questions];
      activeQuestions = incoming;
      const label = bankName || "模拟自测卷";
      mainTitle = label;
      const totalScore = incoming.reduce((sum, q) => sum + (q.score || 1), 0);
      subtitle = `考试时长：120 分钟 · 满分：${totalScore} 分 · 适用年级/范围：全卷综合`;
      paperNo = `EXAM-${localDateKeyOf(Date.now()).replace(/-/g, "")}`;
      if (typeof window !== "undefined" && window.innerWidth <= 840) {
        zoomLevel = computeFitWidthZoomPercent(window.innerWidth, 794, 40, 100);
      } else {
        zoomLevel = 100;
      }
      surfaceCleanup?.();
      surfaceCleanup = lvSurfaceStack.push({
        id: "lv-exam-paper-assemble",
        type: "dialog",
        dismiss: () => {
          onclose();
          return true;
        },
      });
    } else if (!open && wasOpen) {
      wasOpen = false;
      surfaceCleanup?.();
      surfaceCleanup = null;
      focusTrap?.release();
      focusTrap = null;
    }
  });

  $effect(() => {
    if (open && dialogEl) {
      focusTrap?.release();
      focusTrap = createFocusTrap(dialogEl, { restoreFocus: true, fallbackToContainer: true });
      focusTrap.activate();
    }
  });

  onDestroy(() => {
    surfaceCleanup?.();
    focusTrap?.release();
  });

  const effectiveQuestions = $derived.by(() => {
    if (variantMode === "A") {
      return generatePaperVariant(activeQuestions, "A");
    }
    if (variantMode === "B") {
      return generatePaperVariant(activeQuestions, "B");
    }
    return activeQuestions;
  });

  const preflightReport = $derived.by(() => {
    return auditPaperBeforePrint(effectiveQuestions);
  });

  const displayTitle = $derived.by(() => {
    if (variantMode === "A") return `${mainTitle} (A卷)`;
    if (variantMode === "B") return `${mainTitle} (B卷)`;
    return mainTitle;
  });

  function selectPaperFormat(fmt: PaperFormat) {
    paperFormat = fmt;
    switch (fmt) {
      case "exam":
        columns = "single";
        fontSizeMode = "standard";
        showSealLine = true;
        showStudentInfoBar = false;
        showScoreGrid = true;
        showPerQuestionScoreBox = true;
        showExamNotice = true;
        appendSolutionsAtEnd = false;
        shortAnswerSpaceCm = 5;
        activeQuickPreset = "standard";
        break;
      case "card":
        columns = "single";
        fontSizeMode = "standard";
        activeQuickPreset = null;
        break;
      case "lecture":
        columns = "single";
        fontSizeMode = "standard";
        showSealLine = false;
        showStudentInfoBar = false;
        showScoreGrid = false;
        showPerQuestionScoreBox = false;
        showExamNotice = false;
        activeQuickPreset = "lecture";
        break;
      case "homework":
        columns = "single";
        fontSizeMode = "large";
        showSealLine = false;
        showStudentInfoBar = true;
        showScoreGrid = false;
        showPerQuestionScoreBox = false;
        showExamNotice = false;
        shortAnswerSpaceCm = 4;
        activeQuickPreset = "homework";
        break;
      case "answer":
        columns = "double";
        fontSizeMode = "compact";
        showSealLine = false;
        showStudentInfoBar = false;
        showScoreGrid = false;
        showPerQuestionScoreBox = false;
        showExamNotice = false;
        activeQuickPreset = null;
        break;
      case "interactive":
        activeQuickPreset = null;
        break;
    }
  }

  function applyPresetTemplate(preset: "standard" | "homework" | "lecture" | "compact") {
    activeQuickPreset = preset;
    switch (preset) {
      case "standard":
        columns = "single";
        fontSizeMode = "standard";
        showSealLine = true;
        showStudentInfoBar = false;
        showScoreGrid = true;
        showPerQuestionScoreBox = true;
        showExamNotice = true;
        appendSolutionsAtEnd = false;
        shortAnswerSpaceCm = 5;
        paperFormat = "exam";
        break;
      case "homework":
        columns = "single";
        fontSizeMode = "large";
        showSealLine = false;
        showStudentInfoBar = true;
        showScoreGrid = false;
        showPerQuestionScoreBox = false;
        showExamNotice = false;
        appendSolutionsAtEnd = false;
        shortAnswerSpaceCm = 4;
        paperFormat = "homework";
        break;
      case "lecture":
        columns = "single";
        fontSizeMode = "standard";
        showSealLine = false;
        showStudentInfoBar = false;
        showScoreGrid = false;
        showPerQuestionScoreBox = false;
        showExamNotice = false;
        appendSolutionsAtEnd = false;
        paperFormat = "lecture";
        break;
      case "compact":
        columns = "double";
        fontSizeMode = "compact";
        showSealLine = false;
        showStudentInfoBar = true;
        showScoreGrid = false;
        showPerQuestionScoreBox = false;
        showExamNotice = false;
        appendSolutionsAtEnd = false;
        shortAnswerSpaceCm = 2;
        paperFormat = "exam";
        break;
    }
    showMessage("已成功应用排版预设 ✓", 2000, "info");
  }

  function moveQuestion(index: number, direction: -1 | 1) {
    const targetIdx = index + direction;
    if (targetIdx < 0 || targetIdx >= activeQuestions.length) return;
    const item = activeQuestions[index];
    const updated = [...activeQuestions];
    updated.splice(index, 1);
    updated.splice(targetIdx, 0, item);
    activeQuestions = updated;
  }

  function removeQuestion(index: number) {
    if (activeQuestions.length <= 1) {
      showMessage("试卷至少需要保留 1 道题目", 2000, "info");
      return;
    }
    const updated = [...activeQuestions];
    updated.splice(index, 1);
    activeQuestions = updated;
  }

  const previewHtml = $derived.by(() => {
    if (!open || !effectiveQuestions.length) return "";
    const opts: PrintProOptions = {
      paperSize,
      columns,
      headerTitle: displayTitle,
      subtitle,
      paperNo,
      secretLevel,
      watermarkText: watermarkText.trim() || undefined,
      showScore,
      showSealLine,
      showStudentInfoBar: showSealLine ? false : showStudentInfoBar,
      showScoreGrid,
      showPerQuestionScoreBox,
      showExamNotice,
      fontSizeMode,
      appendSolutionsAtEnd,
      shortAnswerSpaceCm,
      groupByKp: false,
      autoGroupSections,
    };

    switch (paperFormat) {
      case "card":
        return buildStandardAnswerCardPro(displayTitle, effectiveQuestions, opts);
      case "lecture":
        return buildTeacherLectureSheetPro(displayTitle, effectiveQuestions, opts);
      case "homework":
        return buildStudentHomeworkSheetPro(displayTitle, effectiveQuestions, opts);
      case "answer":
        return buildCompactAnswerSheetPro(displayTitle, effectiveQuestions, opts);
      case "interactive":
        return buildInteractiveReviewSheetPro(displayTitle, effectiveQuestions, opts);
      case "exam":
      default:
        return buildCompactQuestionSheetPro(displayTitle, effectiveQuestions, opts);
    }
  });

  function handlePreviewIframeLoad(e: Event) {
    const iframe = e.currentTarget as HTMLIFrameElement | null;
    if (!iframe) return;
    try {
      const doc = iframe.contentDocument;
      if (doc?.documentElement) {
        const h = Math.max(1123, doc.documentElement.scrollHeight + 24);
        previewIframeHeight = h;
      }
    } catch {
      // ignore cross-origin guard
    }
  }

  function handleDirectPrint() {
    if (!previewHtml) return;
    const win = window.open("", "_blank");
    if (win) {
      win.document.write(previewHtml);
      win.document.close();
      win.focus();
      // 等待文档完全就绪后拉起打印
      setTimeout(() => {
        try {
          win.print();
        } catch {
          // ignore
        }
      }, 350);
    } else {
      openOrDownloadHtml(previewHtml, `${mainTitle || "试卷"}.html`, "已生成排版试卷文件", showMessage);
    }
  }

  function handleDownloadHtml() {
    if (!previewHtml) return;
    const formatSuffix =
      paperFormat === "card"
        ? "-标准答题卡"
        : paperFormat === "lecture"
          ? "-授课讲义卷"
          : paperFormat === "homework"
            ? "-课后作业单"
            : paperFormat === "answer"
              ? "-独立答案册"
              : paperFormat === "interactive"
                ? "-交互讲题自测卷"
                : "-标准试卷";
    openOrDownloadHtml(
      previewHtml,
      `${mainTitle || "试卷"}${formatSuffix}.html`,
      "已成功下载单文件离线排版试卷 ✓",
      showMessage,
    );
  }

  function handleExportWordDoc() {
    if (!previewHtml) return;
    try {
      const styleMatch = previewHtml.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
      const bodyMatch = previewHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
      const extractedStyle = styleMatch ? styleMatch[1] : "";
      const extractedBody = bodyMatch ? bodyMatch[1] : previewHtml;
      const wordHtml = `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8">
<title>${escapeHtml(mainTitle || "试卷")}</title>
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]-->
<style>
@page WordSection1 { size: ${paperSize === "Letter" ? "8.5in 11in" : "21cm 29.7cm"}; margin: 1.8cm 1.6cm; }
div.WordSection1 { page: WordSection1; }
${extractedStyle}
</style>
</head>
<body><div class="WordSection1">${extractedBody}</div></body>
</html>`;
      const blob = new Blob([wordHtml], { type: "application/msword;charset=utf-8;" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${mainTitle || "试卷"}.doc`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 0);
      showMessage("已成功导出 Word 兼容排版文档 (.doc) ✓", 2800, "info");
    } catch (e) {
      showMessage(`导出 Word 失败：${String(e instanceof Error ? e.message : e)}`, 3000, "error");
    }
  }

  async function handleCopyHtml() {
    if (!previewHtml) return;
    try {
      await navigator.clipboard.writeText(previewHtml);
      showMessage("已复制试卷 HTML 源码到剪贴板 ✓", 2500, "info");
    } catch {
      showMessage("复制失败，请尝试直接下载 HTML 文件", 2500, "error");
    }
  }
</script>

<svelte:window onkeydown={(e) => { if (open && !e.isComposing && e.keyCode !== 229 && e.key === "Escape") { e.stopPropagation(); onclose(); } }} />

{#if open}
  <div
    bind:this={dialogEl}
    class="lv-modal-mask"
    role="dialog"
    aria-modal="true"
    aria-labelledby="paper-assemble-title"
    tabindex="-1"
    onclick={(e) => { if (e.target === e.currentTarget) onclose(); }}
    onkeydown={(e) => { if (!e.isComposing && e.keyCode !== 229 && e.key === "Escape") { e.stopPropagation(); onclose(); } }}
  >
    <div
      class="lv-modal-card lv-assemble-card"
      style="width:96vw;max-width:1440px;height:92vh;display:flex;flex-direction:column;padding:0;background:var(--lv-surface);border-radius:var(--lv-r-2);border:1px solid var(--lv-border);box-shadow:var(--lv-sh-pop);overflow:hidden"
    >
      <!-- 模态框顶部 -->
      <div style="padding:10px 20px;background:var(--lv-surface-2);border-bottom:1px solid var(--lv-border);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
        <div style="display:flex;align-items:center;gap:10px">
          <span style="font-size:20px">🖨️</span>
          <div>
            <h2 id="paper-assemble-title" class="lv-h2" style="font-size:16px;margin:0;color:var(--lv-text);display:flex;align-items:center;gap:8px">
              专业组卷排版与打印工坊
              <span class="lv-chip sm lv-chip--acc num">共 {activeQuestions.length} 题</span>
            </h2>
          </div>
        </div>

        <!-- 试卷 A/B 卷切换与缩放控制器 -->
        <div class="lv-row" style="margin:0;gap:8px;align-items:center;flex-wrap:wrap">
          <div class="lv-session-dock" style="margin:0" role="group" aria-label="防作弊 A/B 卷分发">
            <button
              type="button"
              class="lv-chip sm"
              class:acc={variantMode === "orig"}
              onclick={() => (variantMode = "orig")}
              title="原始组卷顺序与原选项"
            >
              原卷
            </button>
            <button
              type="button"
              class="lv-chip sm"
              class:acc={variantMode === "A"}
              onclick={() => (variantMode = "A")}
              title="A 卷：选项打乱，答案自动映射，用于防作弊"
            >
              🔀 A 卷
            </button>
            <button
              type="button"
              class="lv-chip sm"
              class:acc={variantMode === "B"}
              onclick={() => (variantMode = "B")}
              title="B 卷：不同随机种子洗牌，答案自动映射"
            >
              🔀 B 卷
            </button>
          </div>

          <div class="lv-session-dock" style="margin:0" role="group" aria-label="预览缩放">
            <button type="button" class="lv-chip sm" onclick={applyFitWidthZoom} title="按当前屏幕宽度自适应缩放">适配屏宽</button>
            <button type="button" class="lv-chip sm" class:acc={zoomLevel === 75} onclick={() => (zoomLevel = 75)}>75%</button>
            <button type="button" class="lv-chip sm" class:acc={zoomLevel === 100} onclick={() => (zoomLevel = 100)}>100%</button>
            <button type="button" class="lv-chip sm" class:acc={zoomLevel === 125} onclick={() => (zoomLevel = 125)}>125%</button>
            <span class="lv-chip sm num" aria-live="polite">{zoomLevel}%</span>
          </div>

          <button type="button" class="lv-btn sm lv-btn--ghost" onclick={onclose} aria-label="关闭">
            ✕
          </button>
        </div>
      </div>

      <!-- 印刷前排版质量与总分预检横幅 -->
      <div style="padding:6px 20px;background:var(--lv-surface);border-bottom:1px solid var(--lv-border-subtle);display:flex;justify-content:space-between;align-items:center;font-size:12px;flex-wrap:wrap;gap:8px">
        <div class="lv-row" style="margin:0;gap:8px;align-items:center;flex-wrap:wrap">
          <span style="font-weight:700;color:var(--lv-text);display:flex;align-items:center;gap:4px">
            🎯 卷面满分: <span class="num" style="color:var(--lv-brand);font-size:13px">{preflightReport.totalScore}</span> 分
          </span>
          <span style="color:var(--lv-border)">|</span>
          <div class="lv-row" style="margin:0;gap:6px">
            {#each preflightReport.typeDistribution as td (td.label)}
              <span class="lv-chip sm num" style="font-size:11px">{td.label}: {td.count}题/{td.score}分</span>
            {/each}
          </div>
        </div>

        <div class="lv-row" style="margin:0;gap:6px;align-items:center">
          {#if preflightReport.errors.length > 0}
            <span class="lv-chip sm lv-chip--red" style="font-weight:700">
              ⚠️ 存在 {preflightReport.errors.length} 处排版错误
            </span>
          {:else if preflightReport.warnings.length > 0}
            <span class="lv-chip sm lv-chip--amb" style="font-weight:600">
              💡 {preflightReport.warnings.length} 条格式建议
            </span>
          {:else}
            <span class="lv-chip sm num" style="color:var(--lv-green);background:var(--lv-green-soft, rgba(16,185,129,0.1));font-weight:600">
              ✓ 印刷预检通过
            </span>
          {/if}
          <button
            type="button"
            class="lv-btn sm lv-btn--ghost"
            style="font-size:11px;padding:1px 6px"
            onclick={() => (preflightOpen = !preflightOpen)}
          >
            {preflightOpen ? "收起预检" : "查看详情"}
          </button>
        </div>
      </div>

      {#if preflightOpen && (preflightReport.errors.length > 0 || preflightReport.warnings.length > 0)}
        <div style="padding:10px 20px;background:var(--lv-surface-2);border-bottom:1px solid var(--lv-border);font-size:12px;max-height:120px;overflow-y:auto">
          {#each preflightReport.errors as err, ei (ei)}
            <div style="color:var(--lv-accent-seal, #ef4444);margin-bottom:2px">✕ {err}</div>
          {/each}
          {#each preflightReport.warnings as warn, wi (wi)}
            <div style="color:var(--lv-accent, #f59e0b);margin-bottom:2px">⚠️ {warn}</div>
          {/each}
        </div>
      {/if}

      <!-- 主体分栏：左侧配置面板 + 右侧纸张拟真渲染预览 -->
      <div class="lv-assemble-body" style="flex:1;display:flex;overflow:hidden">
        <!-- 左侧排版参数调节面板 -->
        <div class="lv-assemble-sidebar" style="width:clamp(270px, 27vw, 350px);min-width:0;border-right:1px solid var(--lv-border);background:var(--lv-surface);display:flex;flex-direction:column;overflow-y:auto;padding:14px;gap:12px">
          <!-- 快速排版风格预设条 -->
          <div class="lv-card" style="padding:10px 12px;background:var(--lv-surface-2);border-radius:6px;border:1px solid var(--lv-border-subtle)">
            <div class="lv-muted" style="font-size:11px;font-weight:700;margin-bottom:6px">⚡ 快速套用排版预设:</div>
            <div class="lv-row" style="margin:0;gap:6px;flex-wrap:wrap">
              <button type="button" class="lv-chip sm" class:acc={activeQuickPreset === "standard"} onclick={() => applyPresetTemplate("standard")}>🏫 期末统考</button>
              <button type="button" class="lv-chip sm" class:acc={activeQuickPreset === "homework"} onclick={() => applyPresetTemplate("homework")}>📝 课后作业</button>
              <button type="button" class="lv-chip sm" class:acc={activeQuickPreset === "lecture"} onclick={() => applyPresetTemplate("lecture")}>📖 教师讲义</button>
              <button type="button" class="lv-chip sm" class:acc={activeQuickPreset === "compact"} onclick={() => applyPresetTemplate("compact")}>⚡ 极速省纸</button>
            </div>
          </div>

          <!-- 1. 试卷大标题与副标题 -->
          <div class="lv-card" style="padding:12px;background:var(--lv-surface-2);border-radius:6px;border:1px solid var(--lv-border-subtle)">
            <label class="lv-label" for="assemble-main-title" style="font-size:12px;font-weight:700">试卷主标题</label>
            <input id="assemble-main-title" class="lv-input" style="width:100%;margin-bottom:8px" bind:value={mainTitle} placeholder="例如：高三物理电磁学专题冲刺测验" />

            <label class="lv-label" for="assemble-sub-title" style="font-size:12px;font-weight:700">副标题 / 考试说明</label>
            <input id="assemble-sub-title" class="lv-input" style="width:100%;font-size:12px" bind:value={subtitle} placeholder="例如：考试时长：120分钟 满分：100分" />
          </div>

          <!-- 2. 版式选择器 -->
          <div>
            <div class="lv-label" style="font-size:12px;font-weight:700;margin-bottom:6px;display:block">卷面版式预设</div>
            <div style="display:flex;flex-direction:column;gap:6px">
              <button
                type="button"
                class="lv-card"
                class:selected-format={paperFormat === "exam"}
                style="padding:8px 12px;text-align:left;border-radius:6px;cursor:pointer;border:1px solid {paperFormat === 'exam' ? 'var(--lv-brand)' : 'var(--lv-border)'};background:{paperFormat === 'exam' ? 'var(--lv-brand-soft, rgba(59,130,246,0.08))' : 'var(--lv-surface)'}"
                onclick={() => selectPaperFormat("exam")}
              >
                <div style="font-weight:700;font-size:13px;color:var(--lv-text)">📄 标准测试卷 (学生实测版)</div>
                <div class="lv-muted" style="font-size:11px;margin-top:2px">装订密封线 · 卷首总分表 · 黑白五号宋体 · 留白作答 · 绝无答案</div>
              </button>

              <button
                type="button"
                class="lv-card"
                class:selected-format={paperFormat === "card"}
                style="padding:8px 12px;text-align:left;border-radius:6px;cursor:pointer;border:1px solid {paperFormat === 'card' ? 'var(--lv-brand)' : 'var(--lv-border)'};background:{paperFormat === 'card' ? 'var(--lv-brand-soft, rgba(59,130,246,0.08))' : 'var(--lv-surface)'}"
                onclick={() => selectPaperFormat("card")}
              >
                <div style="font-weight:700;font-size:13px;color:var(--lv-text)">📋 标准填涂答题卡 (学生填涂版)</div>
                <div class="lv-muted" style="font-size:11px;margin-top:2px">2B 填涂矩阵 · 准考证号填涂区 · 条形码框 · 主观题限定黑框</div>
              </button>

              <button
                type="button"
                class="lv-card"
                class:selected-format={paperFormat === "lecture"}
                style="padding:8px 12px;text-align:left;border-radius:6px;cursor:pointer;border:1px solid {paperFormat === 'lecture' ? 'var(--lv-brand)' : 'var(--lv-border)'};background:{paperFormat === 'lecture' ? 'var(--lv-brand-soft, rgba(59,130,246,0.08))' : 'var(--lv-surface)'}"
                onclick={() => selectPaperFormat("lecture")}
              >
                <div style="font-weight:700;font-size:13px;color:var(--lv-text)">📖 教师备课与授课讲义卷</div>
                <div class="lv-muted" style="font-size:11px;margin-top:2px">大字清晰抬头 · 参考答案 · 考点难度 · 采分细则 · 破题拓展</div>
              </button>

              <button
                type="button"
                class="lv-card"
                class:selected-format={paperFormat === "homework"}
                style="padding:8px 12px;text-align:left;border-radius:6px;cursor:pointer;border:1px solid {paperFormat === 'homework' ? 'var(--lv-brand)' : 'var(--lv-border)'};background:{paperFormat === 'homework' ? 'var(--lv-brand-soft, rgba(59,130,246,0.08))' : 'var(--lv-surface)'}"
                onclick={() => selectPaperFormat("homework")}
              >
                <div style="font-weight:700;font-size:13px;color:var(--lv-text)">🎯 课后分层作业单</div>
                <div class="lv-muted" style="font-size:11px;margin-top:2px">单行学生信息条 · 横线书写区 · 自我评估与错因归因栏</div>
              </button>

              <button
                type="button"
                class="lv-card"
                class:selected-format={paperFormat === "answer"}
                style="padding:8px 12px;text-align:left;border-radius:6px;cursor:pointer;border:1px solid {paperFormat === 'answer' ? 'var(--lv-brand)' : 'var(--lv-border)'};background:{paperFormat === 'answer' ? 'var(--lv-brand-soft, rgba(59,130,246,0.08))' : 'var(--lv-surface)'}"
                onclick={() => selectPaperFormat("answer")}
              >
                <div style="font-weight:700;font-size:13px;color:var(--lv-text)">🔍 独立答案与采分册</div>
                <div class="lv-muted" style="font-size:11px;margin-top:2px">5 题一组速查表 · 两栏极速核对 · 大题分步采分标准</div>
              </button>

              <button
                type="button"
                class="lv-card"
                class:selected-format={paperFormat === "interactive"}
                style="padding:8px 12px;text-align:left;border-radius:6px;cursor:pointer;border:1px solid {paperFormat === 'interactive' ? 'var(--lv-brand)' : 'var(--lv-border)'};background:{paperFormat === 'interactive' ? 'var(--lv-brand-soft, rgba(59,130,246,0.08))' : 'var(--lv-surface)'}"
                onclick={() => selectPaperFormat("interactive")}
              >
                <div style="font-weight:700;font-size:13px;color:var(--lv-text)">🌐 离线交互讲题自测卷</div>
                <div class="lv-muted" style="font-size:11px;margin-top:2px">单文件 HTML，断网双击即开，支持讲评与考生自测双模切换</div>
              </button>
            </div>
          </div>

          <!-- 试题微调与顺序调整折叠面板 -->
          <div class="lv-card" style="padding:10px 12px;background:var(--lv-surface-2);border-radius:6px;border:1px solid var(--lv-border-subtle)">
            <button
              type="button"
              class="lv-btn sm lv-btn--ghost"
              style="width:100%;justify-content:space-between;font-weight:700;font-size:12px;padding:4px 6px"
              onclick={() => (reorderListOpen = !reorderListOpen)}
            >
              <span>📝 微调试题顺序与剔除 ({activeQuestions.length} 题)</span>
              <Icon name={reorderListOpen ? "arrow-down" : "chev-right"} size={12} />
            </button>
            {#if reorderListOpen}
              <div style="margin-top:8px;max-height:200px;overflow-y:auto;display:flex;flex-direction:column;gap:5px">
                {#each activeQuestions as qItem, qIdx (qItem.id)}
                  <div style="padding:5px 8px;background:var(--lv-surface);border-radius:4px;border:1px solid var(--lv-border-subtle);display:flex;align-items:center;justify-content:space-between;gap:6px;font-size:11px">
                    <span class="lv-muted num" style="font-weight:700;min-width:18px">#{qIdx + 1}</span>
                    <span style="flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title={qItem.stem}>
                      [{qItem.type}] {qItem.stem}
                    </span>
                    <div class="lv-row" style="margin:0;gap:2px">
                      <button
                        type="button"
                        class="lv-btn sm lv-btn--ghost"
                        style="padding:1px 4px;font-size:10px"
                        disabled={qIdx === 0}
                        onclick={() => moveQuestion(qIdx, -1)}
                        title="上移"
                      >
                        ▲
                      </button>
                      <button
                        type="button"
                        class="lv-btn sm lv-btn--ghost"
                        style="padding:1px 4px;font-size:10px"
                        disabled={qIdx === activeQuestions.length - 1}
                        onclick={() => moveQuestion(qIdx, 1)}
                        title="下移"
                      >
                        ▼
                      </button>
                      <button
                        type="button"
                        class="lv-btn sm lv-btn--ghost"
                        style="padding:1px 4px;font-size:10px;color:var(--lv-accent-seal, #ef4444)"
                        onclick={() => removeQuestion(qIdx)}
                        title="从本次组卷中剔除"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                {/each}
              </div>
            {/if}
          </div>

          <!-- 3. 详细排版控制开关 -->
          <div class="lv-card" style="padding:12px;background:var(--lv-surface-2);border-radius:6px;border:1px solid var(--lv-border-subtle);display:flex;flex-direction:column;gap:10px">
            <div style="font-weight:700;font-size:12px;color:var(--lv-text)">📐 排版微调参数</div>

            <div class="lv-row" style="margin:0;gap:8px;align-items:center">
              <span class="lv-muted" style="font-size:12px;min-width:60px">分栏布局</span>
              <select class="lv-select" style="flex:1;font-size:12px" bind:value={columns} onchange={() => (activeQuickPreset = null)}>
                <option value="single">A4 纵向单栏 (标准考卷/大字通栏)</option>
                <option value="double">A4 纵向双栏 (紧凑省纸40%)</option>
              </select>
            </div>

            <div class="lv-row" style="margin:0;gap:8px;align-items:center">
              <span class="lv-muted" style="font-size:12px;min-width:60px">字体字号</span>
              <select class="lv-select" style="flex:1;font-size:12px" bind:value={fontSizeMode} onchange={() => (activeQuickPreset = null)}>
                <option value="standard">标准 10.5pt (五号，正规试卷)</option>
                <option value="compact">紧凑 9.5pt (小五，高密度印刷)</option>
                <option value="large">大字 12pt (小四，护眼清晰)</option>
              </select>
            </div>

            <div class="lv-row" style="margin:0;gap:8px;align-items:center">
              <span class="lv-muted" style="font-size:12px;min-width:60px">解答留白</span>
              <input type="range" min="2" max="15" step="1" bind:value={shortAnswerSpaceCm} style="flex:1" />
              <span class="lv-muted num" style="font-size:11px;min-width:32px">{shortAnswerSpaceCm} cm</span>
            </div>

            <div class="lv-row" style="margin:0;gap:8px;align-items:center">
              <span class="lv-muted" style="font-size:12px;min-width:60px">保密印章</span>
              <select class="lv-select" style="flex:1;font-size:12px" bind:value={secretLevel}>
                <option value="none">无保密印章</option>
                <option value="secret">绝密 ★ 启用前</option>
                <option value="confidential">机密 ★ 启用前</option>
                <option value="internal">内部资料 · 严禁外传</option>
              </select>
            </div>

            <div class="lv-row" style="margin:0;gap:8px;align-items:center">
              <span class="lv-muted" style="font-size:12px;min-width:60px">防盗水印</span>
              <input class="lv-input" style="flex:1;font-size:12px" bind:value={watermarkText} placeholder="例如：某某学校高三教研组" />
            </div>

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:12px">
              <label style="display:flex;align-items:center;gap:5px;cursor:pointer">
                <input type="checkbox" bind:checked={autoGroupSections} /> 自动大题归类
              </label>
              <label style="display:flex;align-items:center;gap:5px;cursor:pointer">
                <input
                  type="checkbox"
                  bind:checked={showSealLine}
                  onchange={() => { if (showSealLine) showStudentInfoBar = false; }}
                /> 装订密封线
              </label>
              <label style="display:flex;align-items:center;gap:5px;cursor:{showSealLine ? 'not-allowed' : 'pointer'};opacity:{showSealLine ? 0.55 : 1}" title={showSealLine ? '已启用装订密封线（含姓名/准考证号/考场/座号），无需重复显示' : '在主标题下方显示单行考生信息条'}>
                <input type="checkbox" bind:checked={showStudentInfoBar} disabled={showSealLine} /> 考生信息条
              </label>
              <label style="display:flex;align-items:center;gap:5px;cursor:pointer">
                <input type="checkbox" bind:checked={showScoreGrid} /> 卷首总分表
              </label>
              <label style="display:flex;align-items:center;gap:5px;cursor:pointer">
                <input type="checkbox" bind:checked={showPerQuestionScoreBox} /> 小题得分框
              </label>
              <label style="display:flex;align-items:center;gap:5px;cursor:pointer">
                <input type="checkbox" bind:checked={showExamNotice} /> 考生须知框
              </label>
              <label style="display:flex;align-items:center;gap:5px;cursor:pointer">
                <input type="checkbox" bind:checked={appendSolutionsAtEnd} /> 卷尾附录答案
              </label>
            </div>
          </div>
        </div>

        <!-- 右侧拟真白底 A4 纸张实时预览区（支持移动端双指捏合缩放与双击复原） -->
        <div
          bind:this={previewContainerEl}
          role="region"
          aria-label="试卷排版实时预览区"
          style="flex:1;background:var(--lv-surface-3, var(--b3-theme-background-light, var(--lv-surface-2)));display:flex;justify-content:center;align-items:flex-start;overflow:auto;padding:24px;touch-action:none"
          ontouchstart={handlePreviewTouchStart}
          ontouchmove={handlePreviewTouchMove}
          ontouchend={handlePreviewTouchEnd}
          ontouchcancel={handlePreviewTouchEnd}
        >
          <div style="width:calc(210mm * {zoomLevel / 100});min-height:calc({previewIframeHeight}px * {zoomLevel / 100});flex-shrink:0;touch-action:none">
            <div
              class="a4-sheet-container"
              style="width:210mm;min-height:297mm;background:var(--lv-print-paper-bg, #ffffff);box-shadow:var(--lv-sh-pop, 0 8px 30px rgba(0,0,0,0.18));border-radius:2px;overflow:hidden;transform:scale({zoomLevel / 100});transform-origin:top left;transition:transform 0.15s ease"
            >
              {#if previewHtml}
                <iframe
                  title="试卷排版实时预览"
                  srcdoc={previewHtml}
                  onload={handlePreviewIframeLoad}
                  style="width:100%;height:{previewIframeHeight}px;border:none;display:block;background:var(--lv-print-paper-bg, #ffffff);pointer-events:{paperFormat === 'interactive' ? 'auto' : 'none'}"
                ></iframe>
              {/if}
            </div>
          </div>
        </div>
      </div>

      <!-- 底部核心行动栏 -->
      <div style="padding:12px 20px;background:var(--lv-surface-2);border-top:1px solid var(--lv-border);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
        <div class="lv-muted" style="font-size:12px;display:flex;align-items:center;gap:6px">
          <Icon name="check" size={13} />
          <span>支持直接打印 (Ctrl+P)，或下载为单文件离线 HTML 发送给打印店 / 投影使用</span>
        </div>
        <div class="lv-row" style="margin:0;gap:8px">
          <button type="button" class="lv-btn lv-btn--ghost" onclick={handleCopyHtml}>
            <Icon name="copy" size={13} /> 复制源码
          </button>
          <button type="button" class="lv-btn lv-btn--ghost" onclick={handleExportWordDoc} title="导出为微软 Word 兼容文档，可在 Word 中直接打开编辑">
            <Icon name="file-text" size={13} /> 📄 导出 Word (.doc)
          </button>
          <button type="button" class="lv-btn lv-btn--ghost" onclick={handleDownloadHtml}>
            <Icon name="download" size={13} /> 📥 下载离线试卷 HTML
          </button>
          <button type="button" class="lv-btn lv-btn--primary" style="font-weight:700;padding:8px 18px" onclick={handleDirectPrint}>
            <Icon name="printer" size={14} /> 🖨️ 直接打印 (Print)
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  .lv-modal-mask {
    position: fixed;
    inset: 0;
    z-index: 1000;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--lv-modal-mask-bg, rgba(0, 0, 0, 0.45));
    backdrop-filter: blur(2px);
  }
  .selected-format {
    box-shadow: 0 0 0 1px var(--lv-brand);
  }
  @media (max-width: 840px) {
    .lv-assemble-card {
      width: 100vw !important;
      height: 100dvh !important;
      max-height: 100dvh !important;
      border-radius: 0 !important;
      padding-top: env(safe-area-inset-top, 0px);
      padding-bottom: env(safe-area-inset-bottom, 0px);
      box-sizing: border-box;
    }
    .lv-assemble-body {
      flex-direction: column !important;
    }
    .lv-assemble-sidebar {
      width: 100% !important;
      min-width: 0 !important;
      max-height: 42vh !important;
      border-right: none !important;
      border-bottom: 1px solid var(--lv-border) !important;
    }
  }
</style>
