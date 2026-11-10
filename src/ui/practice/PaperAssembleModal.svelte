<script lang="ts">
  import Icon from "../shared/Icon.svelte";
  import type { Question } from "@/core/types";
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
  let mainTitle = $state("");
  let subtitle = $state("");
  let paperNo = $state("");
  let columns = $state<ColumnLayout>("double");
  let paperSize = $state<PaperSize>("A4");
  let fontSizeMode = $state<"standard" | "compact" | "large">("standard");

  let autoGroupSections = $state(true);
  let showSealLine = $state(true);
  let showStudentInfoBar = $state(true);
  let showScoreGrid = $state(true);
  let showPerQuestionScoreBox = $state(true);
  let showExamNotice = $state(true);
  let showScore = $state(true);
  let appendSolutionsAtEnd = $state(false);
  let shortAnswerSpaceCm = $state(5);
  let zoomLevel = $state<number>(100);

  $effect(() => {
    if (open) {
      activeQuestions = [...questions];
      const label = bankName || "模拟自测卷";
      mainTitle = label;
      const totalScore = activeQuestions.reduce((sum, q) => sum + (q.score || 1), 0);
      subtitle = `考试时长：120 分钟 · 满分：${totalScore} 分 · 适用年级/范围：全卷综合`;
      paperNo = `EXAM-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}`;
    }
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

  function applyPresetTemplate(preset: "standard" | "homework" | "lecture" | "compact") {
    switch (preset) {
      case "standard":
        columns = "double";
        fontSizeMode = "standard";
        showSealLine = true;
        showStudentInfoBar = true;
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
        columns = "double";
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
        showSealLine = true;
        showStudentInfoBar = true;
        showScoreGrid = true;
        showPerQuestionScoreBox = false;
        showExamNotice = false;
        appendSolutionsAtEnd = false;
        shortAnswerSpaceCm = 3;
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
      showStudentInfoBar,
      showScoreGrid,
      showPerQuestionScoreBox,
      showExamNotice,
      fontSizeMode,
      appendSolutionsAtEnd,
      shortAnswerSpaceCm,
      groupByKp: true,
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
      const wordHtml = `
        <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
        <head><meta charset='utf-8'><title>${mainTitle || "试卷"}</title></head>
        <body>${previewHtml}</body>
        </html>
      `;
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

<svelte:window onkeydown={(e) => { if (open && e.key === "Escape") onclose(); }} />

{#if open}
  <div
    class="lv-modal-mask"
    role="dialog"
    aria-modal="true"
    aria-labelledby="paper-assemble-title"
    tabindex="-1"
    onclick={(e) => { if (e.target === e.currentTarget) onclose(); }}
    onkeydown={(e) => { if (e.key === "Escape") onclose(); }}
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
            <button type="button" class="lv-chip sm" class:acc={zoomLevel === 75} onclick={() => (zoomLevel = 75)}>75%</button>
            <button type="button" class="lv-chip sm" class:acc={zoomLevel === 100} onclick={() => (zoomLevel = 100)}>100%</button>
            <button type="button" class="lv-chip sm" class:acc={zoomLevel === 125} onclick={() => (zoomLevel = 125)}>125%</button>
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
        <div class="lv-assemble-sidebar" style="width:390px;min-width:320px;border-right:1px solid var(--lv-border);background:var(--lv-surface);display:flex;flex-direction:column;overflow-y:auto;padding:16px;gap:14px">
          <!-- 快速排版风格预设条 -->
          <div class="lv-card" style="padding:10px 12px;background:var(--lv-surface-2);border-radius:6px;border:1px solid var(--lv-border-subtle)">
            <div class="lv-muted" style="font-size:11px;font-weight:700;margin-bottom:6px">⚡ 快速套用排版预设:</div>
            <div class="lv-row" style="margin:0;gap:6px;flex-wrap:wrap">
              <button type="button" class="lv-chip sm" onclick={() => applyPresetTemplate("standard")}>🏫 期末统考</button>
              <button type="button" class="lv-chip sm" onclick={() => applyPresetTemplate("homework")}>📝 课后作业</button>
              <button type="button" class="lv-chip sm" onclick={() => applyPresetTemplate("lecture")}>📖 教师讲义</button>
              <button type="button" class="lv-chip sm" onclick={() => applyPresetTemplate("compact")}>⚡ 极速省纸</button>
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
                onclick={() => (paperFormat = "exam")}
              >
                <div style="font-weight:700;font-size:13px;color:var(--lv-text)">📄 标准测试卷 (学生实测版)</div>
                <div class="lv-muted" style="font-size:11px;margin-top:2px">中缝密封线 · 卷首总分表 · 双栏紧凑 · 留白作答 · 绝无答案</div>
              </button>

              <button
                type="button"
                class="lv-card"
                class:selected-format={paperFormat === "card"}
                style="padding:8px 12px;text-align:left;border-radius:6px;cursor:pointer;border:1px solid {paperFormat === 'card' ? 'var(--lv-brand)' : 'var(--lv-border)'};background:{paperFormat === 'card' ? 'var(--lv-brand-soft, rgba(59,130,246,0.08))' : 'var(--lv-surface)'}"
                onclick={() => (paperFormat = "card")}
              >
                <div style="font-weight:700;font-size:13px;color:var(--lv-text)">📋 标准填涂答题卡 (学生填涂版)</div>
                <div class="lv-muted" style="font-size:11px;margin-top:2px">客观题 2B 填涂矩阵 · 准考证条形码区 · 主观题限定黑框</div>
              </button>

              <button
                type="button"
                class="lv-card"
                class:selected-format={paperFormat === "lecture"}
                style="padding:8px 12px;text-align:left;border-radius:6px;cursor:pointer;border:1px solid {paperFormat === 'lecture' ? 'var(--lv-brand)' : 'var(--lv-border)'};background:{paperFormat === 'lecture' ? 'var(--lv-brand-soft, rgba(59,130,246,0.08))' : 'var(--lv-surface)'}"
                onclick={() => (paperFormat = "lecture")}
              >
                <div style="font-weight:700;font-size:13px;color:var(--lv-text)">📖 教师备课与授课讲义卷</div>
                <div class="lv-muted" style="font-size:11px;margin-top:2px">题目 + 标准答案 + 采分点细则 + 详细推导 + 💡秒杀要诀</div>
              </button>

              <button
                type="button"
                class="lv-card"
                class:selected-format={paperFormat === "homework"}
                style="padding:8px 12px;text-align:left;border-radius:6px;cursor:pointer;border:1px solid {paperFormat === 'homework' ? 'var(--lv-brand)' : 'var(--lv-border)'};background:{paperFormat === 'homework' ? 'var(--lv-brand-soft, rgba(59,130,246,0.08))' : 'var(--lv-surface)'}"
                onclick={() => (paperFormat = "homework")}
              >
                <div style="font-weight:700;font-size:13px;color:var(--lv-text)">🎯 课后分层作业单</div>
                <div class="lv-muted" style="font-size:11px;margin-top:2px">学生信息条 · 规范作答书写框 · 课后自我诊断与错因归因栏</div>
              </button>

              <button
                type="button"
                class="lv-card"
                class:selected-format={paperFormat === "answer"}
                style="padding:8px 12px;text-align:left;border-radius:6px;cursor:pointer;border:1px solid {paperFormat === 'answer' ? 'var(--lv-brand)' : 'var(--lv-border)'};background:{paperFormat === 'answer' ? 'var(--lv-brand-soft, rgba(59,130,246,0.08))' : 'var(--lv-surface)'}"
                onclick={() => (paperFormat = "answer")}
              >
                <div style="font-weight:700;font-size:13px;color:var(--lv-text)">🔍 独立答案与采分册</div>
                <div class="lv-muted" style="font-size:11px;margin-top:2px">两栏极速核对 · 选择题答案串 · 大题按步骤给分标准</div>
              </button>

              <button
                type="button"
                class="lv-card"
                class:selected-format={paperFormat === "interactive"}
                style="padding:8px 12px;text-align:left;border-radius:6px;cursor:pointer;border:1px solid {paperFormat === 'interactive' ? 'var(--lv-brand)' : 'var(--lv-border)'};background:{paperFormat === 'interactive' ? 'var(--lv-brand-soft, rgba(59,130,246,0.08))' : 'var(--lv-surface)'}"
                onclick={() => (paperFormat = "interactive")}
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
              <select class="lv-select" style="flex:1;font-size:12px" bind:value={columns}>
                <option value="double">A4 纵向双栏 (紧凑省纸40%)</option>
                <option value="single">A4 纵向单栏 (大字通栏)</option>
              </select>
            </div>

            <div class="lv-row" style="margin:0;gap:8px;align-items:center">
              <span class="lv-muted" style="font-size:12px;min-width:60px">字体字号</span>
              <select class="lv-select" style="flex:1;font-size:12px" bind:value={fontSizeMode}>
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
                <input type="checkbox" bind:checked={showSealLine} /> 装订密封线
              </label>
              <label style="display:flex;align-items:center;gap:5px;cursor:pointer">
                <input type="checkbox" bind:checked={showStudentInfoBar} /> 考生信息条
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

        <!-- 右侧拟真白底 A4 纸张实时预览区 -->
        <div style="flex:1;background:var(--lv-surface-3, #e2e8f0);display:flex;justify-content:center;align-items:flex-start;overflow:auto;padding:24px">
          <div
            class="a4-sheet-container"
            style="width:210mm;min-height:297mm;background:var(--lv-print-paper-bg, var(--lv-surface, #ffffff));box-shadow:var(--lv-sh-pop, 0 8px 30px rgba(0,0,0,0.18));border-radius:2px;overflow:hidden;transform:scale({zoomLevel / 100});transform-origin:top center;transition:transform 0.15s ease"
          >
            {#if previewHtml}
              <iframe
                title="试卷排版实时预览"
                srcdoc={previewHtml}
                style="width:100%;height:1400px;border:none;display:block;background:var(--lv-print-paper-bg, var(--lv-surface, #ffffff))"
              ></iframe>
            {/if}
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
      height: 100vh !important;
      border-radius: 0 !important;
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
