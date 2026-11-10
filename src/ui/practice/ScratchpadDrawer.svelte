<script lang="ts">
  import Icon from "../shared/Icon.svelte";
  import type { ScratchpadMode } from "@/core/scratchpad";
  import {
    drawGridBackground,
    drawCoordinateAxis,
    drawGeometryShape,
    saveSketchToStorage,
    loadSketchFromStorage,
  } from "./services/sketchpadService";

  interface Props {
    open: boolean;
    mode: ScratchpadMode;
    text: string;
    qid?: string;
    t: (k: string, fb?: string) => string;
    onmodeChange: (mode: ScratchpadMode) => void;
    oninput: (val: string) => void;
    onclear: () => void;
    oncopy: () => void;
    onclose: () => void;
  }

  let {
    open,
    mode,
    text,
    qid = "",
    t,
    onmodeChange,
    oninput,
    onclear,
    oncopy,
    onclose,
  }: Props = $props();

  let padType = $state<"text" | "sketch">("text");
  let isExpanded = $state<boolean>(false);

  // 手绘画板交互状态
  let canvasEl = $state<HTMLCanvasElement | null>(null);
  let sketchTool = $state<"pen" | "highlighter" | "line" | "eraser">("pen");
  let strokeColor = $state<string>("var(--lv-brand, #1e3a8a)");
  let highlighterColor = $state<string>("var(--lv-hl-yellow, rgba(250, 204, 21, 0.45))");
  let strokeWidth = $state<number>(2);

  let isDrawing = false;
  let startX = 0;
  let startY = 0;
  let snapshot: ImageData | null = null;

  const storageKey = $derived(mode === "per_question" ? (qid || "current") : "shared");

  function initCanvas() {
    if (!canvasEl) return;
    const ctx = canvasEl.getContext("2d");
    if (!ctx) return;

    // 根据 DOM 实际渲染宽度与放大状态自适应画布分辨率
    const rect = canvasEl.getBoundingClientRect();
    const w = Math.max(300, Math.floor(rect.width));
    const h = isExpanded ? Math.max(380, Math.floor(window.innerHeight * 0.55)) : 240;

    if (canvasEl.width !== w || canvasEl.height !== h) {
      canvasEl.width = w;
      canvasEl.height = h;
    }

    drawGridBackground(ctx, w, h);

    // 恢复历史手绘草图
    const saved = loadSketchFromStorage(storageKey);
    if (saved) {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0);
      };
      img.src = saved;
    }
  }

  $effect(() => {
    if (open && padType === "sketch" && canvasEl) {
      initCanvas();
    }
  });

  $effect(() => {
    // 监听模式或题目切换时，若在画板模式自动重载对应草图
    if (open && padType === "sketch" && canvasEl && storageKey) {
      initCanvas();
    }
  });

  function getCanvasPos(e: PointerEvent): { x: number; y: number } {
    if (!canvasEl) return { x: 0, y: 0 };
    const rect = canvasEl.getBoundingClientRect();
    const scaleX = canvasEl.width / rect.width;
    const scaleY = canvasEl.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }

  function handlePointerDown(e: PointerEvent) {
    if (!canvasEl) return;
    const ctx = canvasEl.getContext("2d");
    if (!ctx) return;

    canvasEl.setPointerCapture(e.pointerId);
    isDrawing = true;
    const pos = getCanvasPos(e);
    startX = pos.x;
    startY = pos.y;

    if (sketchTool === "line") {
      snapshot = ctx.getImageData(0, 0, canvasEl.width, canvasEl.height);
    } else {
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y);
      if (sketchTool === "highlighter") {
        ctx.strokeStyle = highlighterColor;
        ctx.lineWidth = 16;
      } else if (sketchTool === "eraser") {
        ctx.strokeStyle = "var(--lv-surface, #ffffff)";
        ctx.lineWidth = 18;
      } else {
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = strokeWidth;
      }
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
    }
  }

  function handlePointerMove(e: PointerEvent) {
    if (!isDrawing || !canvasEl) return;
    const ctx = canvasEl.getContext("2d");
    if (!ctx) return;

    const pos = getCanvasPos(e);

    if (sketchTool === "line") {
      if (snapshot) ctx.putImageData(snapshot, 0, 0);
      ctx.save();
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = strokeWidth;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
      ctx.restore();
    } else {
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
    }
  }

  function handlePointerUp(e: PointerEvent) {
    if (!isDrawing || !canvasEl) return;
    isDrawing = false;
    try {
      canvasEl.releasePointerCapture(e.pointerId);
    } catch {
      /* fail-soft */
    }
    // 保存手绘草图到本地存储
    try {
      saveSketchToStorage(storageKey, canvasEl.toDataURL("image/png"));
    } catch {
      /* ignore */
    }
  }

  function stampAxis() {
    if (!canvasEl) return;
    const ctx = canvasEl.getContext("2d");
    if (!ctx) return;
    drawCoordinateAxis(ctx, canvasEl.width, canvasEl.height, strokeColor);
    saveSketchToStorage(storageKey, canvasEl.toDataURL("image/png"));
  }

  function stampShape(shape: "triangle" | "circle" | "box") {
    if (!canvasEl) return;
    const ctx = canvasEl.getContext("2d");
    if (!ctx) return;
    drawGeometryShape(ctx, canvasEl.width, canvasEl.height, shape, strokeColor);
    saveSketchToStorage(storageKey, canvasEl.toDataURL("image/png"));
  }

  function clearCanvas() {
    if (!canvasEl) return;
    const ctx = canvasEl.getContext("2d");
    if (!ctx) return;
    drawGridBackground(ctx, canvasEl.width, canvasEl.height);
    saveSketchToStorage(storageKey, canvasEl.toDataURL("image/png"));
  }
</script>

{#if open}
  <div class="lv-card lv-pad-card" class:lv-pad-expanded={isExpanded} style="margin-bottom:12px;background:var(--lv-surface-2);border-left:3px solid var(--lv-brand);padding:10px 14px">
    <div class="lv-row" style="justify-content:space-between;align-items:center;margin-bottom:6px;gap:6px">
      <div class="lv-row" role="group" aria-label={t("scratchpad.title")} style="margin:0;gap:6px;align-items:center;flex-wrap:wrap">
        <b style="color:var(--lv-text);display:inline-flex;align-items:center;gap:4px">
          <Icon name="pencil" size={13} /> {t("scratchpad.title")}
        </b>
        <!-- 演练形态切换：文本演算 vs 数理手绘 -->
        <div class="lv-session-dock sm" role="tablist" style="padding:2px 3px">
          <button
            type="button"
            role="tab"
            class="lv-chip sm"
            class:acc={padType === "text"}
            aria-selected={padType === "text"}
            onclick={() => (padType = "text")}
          >
            📝 文本演算
          </button>
          <button
            type="button"
            role="tab"
            class="lv-chip sm"
            class:acc={padType === "sketch"}
            aria-selected={padType === "sketch"}
            onclick={() => (padType = "sketch")}
          >
            ✏️ 数理草图
          </button>
        </div>
        <button type="button" class="lv-chip sm" class:acc={mode === "per_question"} aria-pressed={mode === "per_question"} onclick={() => onmodeChange("per_question")}>
          {t("scratchpad.modePerQ")}
        </button>
        <button type="button" class="lv-chip sm" class:acc={mode === "shared"} aria-pressed={mode === "shared"} onclick={() => onmodeChange("shared")}>
          {t("scratchpad.modeShared")}
        </button>
      </div>
      <div class="lv-row" style="margin:0;gap:4px">
        <button
          type="button"
          class="lv-btn sm lv-btn--ghost"
          class:acc={isExpanded}
          onclick={() => {
            isExpanded = !isExpanded;
            setTimeout(() => { if (padType === "sketch") initCanvas(); }, 60);
          }}
          title={isExpanded ? "还原草稿纸大小" : "放大草稿纸（全屏视图）"}
          style="display:inline-flex;align-items:center;gap:4px"
        >
          <Icon name={isExpanded ? "shrink" : "expand"} size={12} /> {isExpanded ? "还原" : "放大"}
        </button>
        {#if padType === "text"}
          <button type="button" class="lv-btn sm lv-btn--ghost" onclick={oncopy} title={t("scratchpad.copy")}>
            <Icon name="copy" size={11} /> {t("scratchpad.copy")}
          </button>
          <button type="button" class="lv-btn sm lv-btn--ghost" onclick={onclear} title={t("scratchpad.clear")} style="display:inline-flex;align-items:center;gap:4px">
            <Icon name="trash" size={12} /> {t("scratchpad.clear")}
          </button>
        {:else}
          <button type="button" class="lv-btn sm lv-btn--ghost" onclick={clearCanvas} title="清空当前手绘画板" style="display:inline-flex;align-items:center;gap:4px">
            <Icon name="trash" size={12} /> 清空草图
          </button>
        {/if}
        <button type="button" class="lv-btn sm lv-btn--ghost" onclick={onclose} title="收起草稿纸" style="display:inline-flex;align-items:center;gap:4px">
          <Icon name="close" size={12} /> {t("common.close", "收起")}
        </button>
      </div>
    </div>

    {#if padType === "text"}
      <textarea
        class="lv-input lv-textarea num"
        rows={isExpanded ? 16 : 8}
        style="font-family:monospace;font-size:var(--lv-font-size-sm);line-height:1.5;min-height:{isExpanded ? '380px' : '180px'}!important;resize:both!important;width:100%!important;box-sizing:border-box"
        placeholder={t("scratchpad.placeholder")}
        aria-label={t("scratchpad.title")}
        value={text}
        oninput={(e) => oninput((e.target as HTMLTextAreaElement).value)}
      ></textarea>
    {:else}
      <!-- 数理手绘板工具栏 -->
      <div class="lv-row" style="margin:4px 0 6px;gap:6px;align-items:center;justify-content:space-between;flex-wrap:wrap">
        <div class="lv-row" style="margin:0;gap:4px;align-items:center">
          <span class="lv-muted" style="font-size:11px">工具:</span>
          <button
            type="button"
            class="lv-chip sm"
            class:acc={sketchTool === "pen"}
            onclick={() => (sketchTool = "pen")}
            title="自由手绘铅笔"
          >
            ✏️ 铅笔
          </button>
          <button
            type="button"
            class="lv-chip sm"
            class:acc={sketchTool === "highlighter"}
            onclick={() => (sketchTool = "highlighter")}
            title="🖍️ 半透明荧光笔（圈画题干重点与题眼）"
          >
            <Icon name="highlighter" size={12} /> 荧光笔
          </button>
          <button
            type="button"
            class="lv-chip sm"
            class:acc={sketchTool === "line"}
            onclick={() => (sketchTool = "line")}
            title="绘制直线"
          >
            📏 直线
          </button>
          <button
            type="button"
            class="lv-chip sm"
            class:acc={sketchTool === "eraser"}
            onclick={() => (sketchTool = "eraser")}
            title="橡皮擦"
          >
            🧹 橡皮
          </button>
          <div style="width:1px;height:14px;background:var(--lv-border);margin:0 4px"></div>
          <span class="lv-muted" style="font-size:11px">颜色:</span>
          {#if sketchTool === "highlighter"}
            {#each [
              { c: "var(--lv-hl-yellow, rgba(250, 204, 21, 0.45))", name: "明黄荧光" },
              { c: "var(--lv-hl-green, rgba(52, 211, 153, 0.45))", name: "翠绿荧光" },
              { c: "var(--lv-hl-blue, rgba(56, 189, 248, 0.45))", name: "冰蓝荧光" },
              { c: "var(--lv-hl-pink, rgba(244, 63, 94, 0.45))", name: "珊瑚粉荧光" },
            ] as opt (opt.c)}
              <button
                type="button"
                style="width:18px;height:18px;border-radius:50%;background:{opt.c};border:{highlighterColor === opt.c ? '2.5px solid var(--lv-accent)' : '1px solid var(--lv-border)'};cursor:pointer;padding:0"
                title={opt.name}
                onclick={() => (highlighterColor = opt.c)}
              ></button>
            {/each}
          {:else}
            {#each [
              { c: "var(--lv-brand, #1e3a8a)", name: "普鲁士蓝" },
              { c: "var(--lv-accent-seal, #b91c1c)", name: "朱砂红" },
              { c: "var(--lv-text, #374151)", name: "石墨黑" },
            ] as opt (opt.c)}
              <button
                type="button"
                style="width:18px;height:18px;border-radius:50%;background:{opt.c};border:{strokeColor === opt.c ? '2.5px solid var(--lv-accent)' : '1px solid var(--lv-border)'};cursor:pointer;padding:0"
                title={opt.name}
                onclick={() => (strokeColor = opt.c)}
              ></button>
            {/each}
          {/if}
        </div>
        <div class="lv-row" style="margin:0;gap:4px;align-items:center">
          <span class="lv-muted" style="font-size:11px">几何印章:</span>
          <button type="button" class="lv-btn sm lv-btn--ghost" style="padding:2px 6px;font-size:11px" onclick={stampAxis} title="快速印出标准 X-Y 坐标数轴">
            ➕ 坐标轴
          </button>
          <button type="button" class="lv-btn sm lv-btn--ghost" style="padding:2px 6px;font-size:11px" onclick={() => stampShape("triangle")} title="快速印出直角三角形">
            ➕ 直角△
          </button>
          <button type="button" class="lv-btn sm lv-btn--ghost" style="padding:2px 6px;font-size:11px" onclick={() => stampShape("circle")} title="快速印出标准圆">
            ➕ 圆形
          </button>
        </div>
      </div>

      <!-- 画布容器 -->
      <div style="border:1.5px solid var(--lv-border);border-radius:var(--lv-r-2);overflow:hidden;background:var(--lv-surface, #ffffff);touch-action:none;box-shadow:var(--lv-sh-1)">
        <canvas
          bind:this={canvasEl}
          style="display:block;width:100%;height:{isExpanded ? '460px' : '240px'};cursor:crosshair"
          onpointerdown={handlePointerDown}
          onpointermove={handlePointerMove}
          onpointerup={handlePointerUp}
          onpointercancel={handlePointerUp}
        ></canvas>
      </div>
    {/if}

    <details style="margin-top:6px;font-size:var(--lv-font-size-caption)">
      <summary style="cursor:pointer;opacity:0.8;font-weight:600;display:inline-flex;align-items:center;gap:4px">
        <Icon name="compass" size={13} /> {t("scratchpad.formulaSheet")}
      </summary>
      <div class="lv-card" style="margin-top:4px;padding:8px 12px;background:var(--lv-surface);border:1px solid var(--lv-border-subtle);border-radius:var(--lv-r-3, 14px);max-height:160px;overflow-y:auto">
        <div style="display:flex;flex-direction:column;gap:4px">
          <div><b>导数表：</b><code>(xⁿ)' = n·xⁿ⁻¹</code> · <code>(eˣ)' = eˣ</code> · <code>(ln x)' = 1/x</code> · <code>(sin x)' = cos x</code> · <code>(cos x)' = -sin x</code></div>
          <div><b>三角恒等：</b><code>sin²α + cos²α = 1</code> · <code>sin(2α) = 2sinα·cosα</code> · <code>cos(2α) = 2cos²α - 1</code></div>
          <div><b>物理常数：</b><code>c = 3.0×10⁸ m/s</code> · <code>G = 6.67×10⁻¹¹</code> · <code>NA = 6.02×10²³</code> · <code>e = 1.60×10⁻¹⁹ C</code> · <code>h = 6.63×10⁻³⁴ J·s</code></div>
          <div><b>立体几何：</b><code>S_圆 = πr²</code> · <code>V_球 = 4/3·πr³</code> · <code>V_锥 = 1/3·πr²h</code></div>
        </div>
      </div>
    </details>
  </div>
{/if}

<style>
  :global(.lv-pad-card.lv-pad-expanded) {
    position: fixed !important;
    inset: 12px !important;
    z-index: 990 !important;
    max-height: calc(100dvh - 24px) !important;
    height: calc(100dvh - 24px) !important;
    margin: 0 !important;
    display: flex !important;
    flex-direction: column !important;
    box-shadow: var(--lv-sh-pop) !important;
    border-radius: var(--lv-r-card, 16px) !important;
    background: var(--lv-surface) !important;
    overflow-y: auto !important;
  }
</style>
