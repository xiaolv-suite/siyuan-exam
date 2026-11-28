<script lang="ts">
  import { onDestroy } from "svelte";
  import Icon from "../shared/Icon.svelte";
  import { loadChunk } from "@/libs/chunk-loader";
  import {
    openManagedPdfDocument,
    type ManagedPdfHandle,
    type PdfJsModuleLike,
    type PdfRenderTaskLike,
  } from "@/core/pdfImport";
  import { renderPdfPageOnCanvas, releaseCanvasMemory } from "./services/pdfOcrService";
  import {
    normalizeCropRect,
    mapNormalizedRectToCanvasPixels,
    type CropRect,
  } from "@/core/pdfCrop";
  import {
    ZOOM_MIN_SCALE,
    ZOOM_MAX_SCALE,
    clampZoomScale,
    computePinchDistance,
    computePinchScale,
    computeDoubleTapZoomScale,
  } from "@/core/pinchZoom";
  import { lvSurfaceStack } from "@/libs/lv-notice-kit";
  import { createFocusTrap, type FocusTrapInstance } from "@/libs/lv-focus-trap";

  interface Props {
    open: boolean;
    file: File | Blob | null;
    fileName?: string;
    onclose: () => void;
    onInsertImageToManual?: (blob: Blob, dataUrl: string, pageNum: number) => void | Promise<void>;
    onOcrCropToManual?: (blob: Blob, pageNum: number) => void | Promise<void>;
    onOcrCropToImport?: (blob: Blob, pageNum: number) => void | Promise<void>;
    showMessage?: (msg: string, timeout?: number, type?: "info" | "error") => void;
  }

  let {
    open,
    file,
    fileName = "paper.pdf",
    onclose,
    onInsertImageToManual,
    onOcrCropToManual,
    onOcrCropToImport,
    showMessage,
  }: Props = $props();

  let dialogEl = $state<HTMLDivElement | null>(null);
  let canvasEl = $state<HTMLCanvasElement | null>(null);
  let overlayEl = $state<HTMLDivElement | null>(null);

  let loadingDoc = $state(false);
  let renderingPage = $state(false);
  let actionBusy = $state(false);
  let errorMsg = $state("");
  let currentPage = $state(1);
  let totalPages = $state(0);

  let zoomScale = $state(1);
  let pinchStartDist = 0;
  let pinchStartScale = 1;
  let isPinching = false;
  let lastTapTs = 0;

  let activePointerId: number | null = null;
  let dragStartPt: { x: number; y: number } | null = null;
  let selectionDisplayRect = $state<CropRect | null>(null);
  let selectionNormalized = $state<CropRect | null>(null);
  let croppedPreviewUrl = $state("");
  let croppedBlob = $state<Blob | null>(null);
  let croppedPixelSize = $state<{ width: number; height: number } | null>(null);

  let managedPdf: ManagedPdfHandle | null = null;
  let activeRenderTask: PdfRenderTaskLike | null = null;
  let loadAbortCtrl: AbortController | null = null;
  let focusTrap: FocusTrapInstance | null = null;
  let surfaceCleanup: (() => void) | null = null;

  function clearSelection() {
    dragStartPt = null;
    activePointerId = null;
    selectionDisplayRect = null;
    selectionNormalized = null;
    croppedPreviewUrl = "";
    croppedBlob = null;
    croppedPixelSize = null;
  }

  async function cleanupPdfResources() {
    loadAbortCtrl?.abort();
    loadAbortCtrl = null;
    try {
      activeRenderTask?.cancel?.();
    } catch {
      /* ignore */
    }
    activeRenderTask = null;
    clearSelection();
    releaseCanvasMemory(canvasEl);
    if (managedPdf) {
      const m = managedPdf;
      managedPdf = null;
      await m.close().catch(() => undefined);
    }
    totalPages = 0;
    currentPage = 1;
  }

  async function renderCurrentPage(pageNum: number) {
    if (!managedPdf || !canvasEl) return;
    const ctrl = loadAbortCtrl ?? new AbortController();
    renderingPage = true;
    errorMsg = "";
    clearSelection();
    try {
      activeRenderTask?.cancel?.();
    } catch {
      /* ignore */
    }
    try {
      await renderPdfPageOnCanvas(managedPdf.doc, pageNum, canvasEl, {
        scale: 2.0,
        signal: ctrl.signal,
        onRenderTask: (task) => {
          activeRenderTask = task;
        },
      });
    } catch (e) {
      if (!(e instanceof Error && e.name === "AbortError")) {
        errorMsg = `渲染第 ${pageNum} 页失败：${String(e instanceof Error ? e.message : e)}`;
      }
    } finally {
      renderingPage = false;
    }
  }

  async function loadPdfFile(targetFile: File | Blob) {
    await cleanupPdfResources();
    const ctrl = new AbortController();
    loadAbortCtrl = ctrl;
    loadingDoc = true;
    errorMsg = "";
    zoomScale = 1;
    try {
      const pdfjs = await loadChunk<PdfJsModuleLike>("pdfjs");
      const bytes = new Uint8Array(await targetFile.arrayBuffer());
      if (ctrl.signal.aborted) return;
      const handle = await openManagedPdfDocument(pdfjs, bytes, { signal: ctrl.signal });
      if (ctrl.signal.aborted) {
        await handle.close();
        return;
      }
      managedPdf = handle;
      totalPages = handle.doc.numPages;
      currentPage = 1;
      loadingDoc = false;
      await renderCurrentPage(1);
    } catch (e) {
      if (!(e instanceof Error && e.name === "AbortError")) {
        errorMsg = String(e instanceof Error ? e.message : e);
      }
    } finally {
      loadingDoc = false;
    }
  }

  function goPage(nextPage: number) {
    if (loadingDoc || renderingPage || !managedPdf) return;
    const clamped = Math.max(1, Math.min(totalPages, nextPage));
    if (clamped === currentPage) return;
    currentPage = clamped;
    void renderCurrentPage(clamped);
  }

  function getRelativePoint(clientX: number, clientY: number): { x: number; y: number; w: number; h: number } | null {
    if (!overlayEl) return null;
    const rect = overlayEl.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
      w: rect.width,
      h: rect.height,
    };
  }

  function handlePointerDown(e: PointerEvent) {
    if (isPinching || loadingDoc || renderingPage || !canvasEl || !overlayEl) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.preventDefault();
    const pt = getRelativePoint(e.clientX, e.clientY);
    if (!pt) return;
    activePointerId = e.pointerId;
    dragStartPt = { x: pt.x, y: pt.y };
    selectionDisplayRect = { x: pt.x, y: pt.y, width: 0, height: 0 };
    selectionNormalized = null;
    croppedPreviewUrl = "";
    croppedBlob = null;
    try {
      overlayEl.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }

  function handlePointerMove(e: PointerEvent) {
    if (isPinching || activePointerId !== e.pointerId || !dragStartPt) return;
    e.preventDefault();
    const pt = getRelativePoint(e.clientX, e.clientY);
    if (!pt) return;
    const res = normalizeCropRect(dragStartPt.x, dragStartPt.y, pt.x, pt.y, pt.w, pt.h, 12);
    selectionDisplayRect = res.rect;
    selectionNormalized = res.valid ? res.normalized : null;
  }

  async function finalizeCropFromNormalized(normalized: CropRect) {
    if (!canvasEl || canvasEl.width <= 0 || canvasEl.height <= 0) return;
    const px = mapNormalizedRectToCanvasPixels(normalized, canvasEl.width, canvasEl.height);
    const outCanvas = document.createElement("canvas");
    outCanvas.width = px.width;
    outCanvas.height = px.height;
    const ctx = outCanvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(canvasEl, px.x, px.y, px.width, px.height, 0, 0, px.width, px.height);
    const dataUrl = outCanvas.toDataURL("image/png");
    const blob = await new Promise<Blob | null>((resolve) => outCanvas.toBlob((b) => resolve(b), "image/png"));
    releaseCanvasMemory(outCanvas);
    if (blob) {
      croppedBlob = blob;
      croppedPreviewUrl = dataUrl;
      croppedPixelSize = { width: px.width, height: px.height };
    }
  }

  function handlePointerUp(e: PointerEvent) {
    if (activePointerId !== e.pointerId) return;
    e.preventDefault();
    try {
      overlayEl?.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    const pt = getRelativePoint(e.clientX, e.clientY);
    if (dragStartPt && pt) {
      const res = normalizeCropRect(dragStartPt.x, dragStartPt.y, pt.x, pt.y, pt.w, pt.h, 12);
      if (res.valid) {
        selectionDisplayRect = res.rect;
        selectionNormalized = res.normalized;
        void finalizeCropFromNormalized(res.normalized);
      } else {
        clearSelection();
      }
    }
    dragStartPt = null;
    activePointerId = null;
  }

  function handleTouchStart(e: TouchEvent) {
    e.stopPropagation();
    if (e.touches.length === 2) {
      isPinching = true;
      dragStartPt = null;
      activePointerId = null;
      pinchStartDist = computePinchDistance(e.touches[0]!, e.touches[1]!);
      pinchStartScale = zoomScale;
      return;
    }
    if (e.touches.length === 1) {
      const now = Date.now();
      if (now - lastTapTs < 280) {
        lastTapTs = 0;
        zoomScale = computeDoubleTapZoomScale(zoomScale, 1, 1.75);
      } else {
        lastTapTs = now;
      }
    }
  }

  function handleTouchMove(e: TouchEvent) {
    e.stopPropagation();
    if (isPinching && e.touches.length === 2) {
      e.preventDefault();
      const dist = computePinchDistance(e.touches[0]!, e.touches[1]!);
      zoomScale = computePinchScale(pinchStartDist, dist, pinchStartScale, ZOOM_MIN_SCALE, ZOOM_MAX_SCALE);
    }
  }

  function handleTouchEnd(e: TouchEvent) {
    e.stopPropagation();
    if (e.touches.length < 2) {
      isPinching = false;
    }
  }

  async function runCropAction(kind: "image" | "manual-ocr" | "import-ocr") {
    if (!croppedBlob || actionBusy) return;
    actionBusy = true;
    try {
      if (kind === "image" && onInsertImageToManual) {
        await onInsertImageToManual(croppedBlob, croppedPreviewUrl, currentPage);
      } else if (kind === "manual-ocr" && onOcrCropToManual) {
        await onOcrCropToManual(croppedBlob, currentPage);
      } else if (kind === "import-ocr" && onOcrCropToImport) {
        await onOcrCropToImport(croppedBlob, currentPage);
      }
    } catch (e) {
      showMessage?.(`框选处理失败：${String(e instanceof Error ? e.message : e)}`, 3600, "error");
    } finally {
      actionBusy = false;
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (!open) return;
    if (e.isComposing || e.keyCode === 229) return;
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      if (selectionDisplayRect) {
        clearSelection();
      } else {
        onclose();
      }
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      goPage(currentPage - 1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      goPage(currentPage + 1);
    }
  }

  let lastLoadedFile: File | Blob | null = null;
  $effect(() => {
    if (open && file && file !== lastLoadedFile) {
      lastLoadedFile = file;
      void loadPdfFile(file);
    }
    if (!open) {
      lastLoadedFile = null;
      void cleanupPdfResources();
      surfaceCleanup?.();
      surfaceCleanup = null;
      focusTrap?.release();
      focusTrap = null;
    } else {
      surfaceCleanup?.();
      surfaceCleanup = lvSurfaceStack.push({
        id: "lv-exam-pdf-crop-modal",
        type: "dialog",
        dismiss: () => {
          onclose();
          return true;
        },
      });
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
    void cleanupPdfResources();
  });
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
  <div
    bind:this={dialogEl}
    class="lv-crop-mask"
    role="dialog"
    aria-modal="true"
    aria-labelledby="lv-pdf-crop-title"
    tabindex="-1"
    onclick={(e) => { if (e.target === e.currentTarget) onclose(); }}
    onkeydown={handleKeydown}
  >
    <div class="lv-crop-card">
      <header class="lv-crop-head">
        <div class="lv-row" style="margin:0;gap:8px;align-items:center;min-width:0">
          <Icon name="camera" size={16} />
          <b id="lv-pdf-crop-title" style="font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
            PDF 框选截题 · {fileName}
          </b>
          {#if totalPages > 0}
            <span class="lv-chip sm num">第 {currentPage} / {totalPages} 页</span>
          {/if}
        </div>
        <div class="lv-row" style="margin:0;gap:6px;align-items:center;flex-wrap:wrap">
          <button type="button" class="lv-btn sm" disabled={loadingDoc || renderingPage || currentPage <= 1} onclick={() => goPage(currentPage - 1)}>上一页</button>
          <button type="button" class="lv-btn sm" disabled={loadingDoc || renderingPage || currentPage >= totalPages} onclick={() => goPage(currentPage + 1)}>下一页</button>
          <span class="lv-chip sm num">{Math.round(zoomScale * 100)}%</span>
          <button type="button" class="lv-btn sm" onclick={() => (zoomScale = clampZoomScale(zoomScale - 0.25))}>－</button>
          <button type="button" class="lv-btn sm" onclick={() => (zoomScale = 1)}>100%</button>
          <button type="button" class="lv-btn sm" onclick={() => (zoomScale = clampZoomScale(zoomScale + 0.25))}>＋</button>
          <button type="button" class="lv-btn sm lv-btn--ghost" onclick={onclose} aria-label="关闭"><Icon name="close" size={14} /></button>
        </div>
      </header>

      <div class="lv-crop-tip">
        <span>💡 拖拽矩形框选整道题目区域，松手后即可裁剪为题干插图或送入 OCR 识图；移动端支持双指捏合缩放与双击复原。</span>
        {#if selectionDisplayRect && croppedPixelSize}
          <span class="lv-chip lv-chip--grn sm num">已框选 {croppedPixelSize.width} × {croppedPixelSize.height} px</span>
        {/if}
      </div>

      {#if errorMsg}
        <div class="lv-error" role="alert" style="margin:8px 14px">{errorMsg}</div>
      {/if}

      <div class="lv-crop-body">
        <div
          class="lv-crop-canvas-scroll"
          role="region"
          aria-label="PDF 页面缩放与预览区"
          ontouchstart={handleTouchStart}
          ontouchmove={handleTouchMove}
          ontouchend={handleTouchEnd}
          ontouchcancel={handleTouchEnd}
        >
          {#if loadingDoc || renderingPage}
            <div class="lv-crop-loading">
              <span>{loadingDoc ? "正在安全载入 PDF 文档…" : `正在渲染第 ${currentPage} 页…`}</span>
            </div>
          {/if}
          <div class="lv-crop-canvas-wrap" style="transform:scale({zoomScale});transform-origin:top center">
            <canvas bind:this={canvasEl} class="lv-crop-canvas"></canvas>
            <div
              bind:this={overlayEl}
              class="lv-crop-overlay"
              role="application"
              aria-label="PDF 页面矩形框选画布"
              onpointerdown={handlePointerDown}
              onpointermove={handlePointerMove}
              onpointerup={handlePointerUp}
              onpointercancel={handlePointerUp}
            >
              {#if selectionDisplayRect && selectionDisplayRect.width > 0 && selectionDisplayRect.height > 0}
                <div
                  class="lv-crop-box"
                  style="left:{selectionDisplayRect.x}px;top:{selectionDisplayRect.y}px;width:{selectionDisplayRect.width}px;height:{selectionDisplayRect.height}px"
                >
                  {#if selectionNormalized}
                    <span class="lv-crop-badge num">
                      {Math.round(selectionNormalized.width * 100)}% × {Math.round(selectionNormalized.height * 100)}%
                    </span>
                  {/if}
                </div>
              {/if}
            </div>
          </div>
        </div>

        {#if croppedPreviewUrl}
          <aside class="lv-crop-sidebar">
            <b style="font-size:13px">裁剪区域预览</b>
            <img src={croppedPreviewUrl} alt="已框选 PDF 区域预览" class="lv-crop-preview-img" />
            <div style="display:grid;gap:8px;margin-top:8px">
              {#if onInsertImageToManual}
                <button type="button" class="lv-btn lv-btn--primary sm" disabled={actionBusy} onclick={() => void runCropAction("image")}>
                  📸 插入为题干配图
                </button>
              {/if}
              {#if onOcrCropToManual}
                <button type="button" class="lv-btn sm" disabled={actionBusy} onclick={() => void runCropAction("manual-ocr")}>
                  🔍 裁剪区识图录题
                </button>
              {/if}
              {#if onOcrCropToImport}
                <button type="button" class="lv-btn sm" disabled={actionBusy} onclick={() => void runCropAction("import-ocr")}>
                  📄 识别后送审校队列
                </button>
              {/if}
              <button type="button" class="lv-btn sm lv-btn--ghost" disabled={actionBusy} onclick={clearSelection}>
                重选区域 (Esc)
              </button>
            </div>
          </aside>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .lv-crop-mask {
    position: fixed;
    inset: 0;
    z-index: 1150;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--lv-modal-mask-bg, color-mix(in srgb, var(--lv-text, #0f172a) 45%, transparent));
    padding: 12px;
  }
  .lv-crop-card {
    width: min(96vw, 1180px);
    height: min(92dvh, 880px);
    display: flex;
    flex-direction: column;
    background: var(--lv-surface);
    color: var(--lv-text);
    border: 1px solid var(--lv-border);
    border-radius: var(--lv-r-2);
    box-shadow: var(--lv-sh-pop);
    overflow: hidden;
  }
  .lv-crop-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 8px;
    padding: 10px 16px;
    background: var(--lv-surface-2);
    border-bottom: 1px solid var(--lv-border);
  }
  .lv-crop-tip {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 8px;
    padding: 6px 16px;
    font-size: 12px;
    color: var(--lv-text-2);
    background: var(--lv-surface);
    border-bottom: 1px solid var(--lv-border-subtle);
  }
  .lv-crop-body {
    flex: 1;
    min-height: 0;
    display: flex;
    overflow: hidden;
  }
  .lv-crop-canvas-scroll {
    position: relative;
    flex: 1;
    min-width: 0;
    min-height: 0;
    overflow: auto;
    padding: 16px;
    background: var(--lv-surface-2);
    display: flex;
    justify-content: center;
    align-items: flex-start;
    touch-action: pan-x pan-y;
  }
  .lv-crop-loading {
    position: absolute;
    top: 24px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 5;
    padding: 6px 14px;
    border-radius: var(--lv-radius-pill, 999px);
    background: var(--lv-surface);
    border: 1px solid var(--lv-border);
    box-shadow: var(--lv-sh-2);
    font-size: 12.5px;
  }
  .lv-crop-canvas-wrap {
    position: relative;
    display: inline-block;
    box-shadow: var(--lv-sh-2);
    border-radius: 4px;
    background: var(--lv-surface);
  }
  .lv-crop-canvas {
    display: block;
    max-width: min(86vw, 760px);
    height: auto;
  }
  .lv-crop-overlay {
    position: absolute;
    inset: 0;
    cursor: crosshair;
    touch-action: none;
    user-select: none;
  }
  .lv-crop-box {
    position: absolute;
    border: 2px solid var(--lv-brand, var(--lv-accent));
    background: color-mix(in srgb, var(--lv-brand, var(--lv-accent)) 18%, transparent);
    pointer-events: none;
  }
  .lv-crop-badge {
    position: absolute;
    top: -22px;
    left: 0;
    font-size: 11px;
    padding: 1px 6px;
    border-radius: 4px;
    background: var(--lv-brand, var(--lv-accent));
    color: var(--lv-on-brand, var(--lv-surface));
    white-space: nowrap;
  }
  .lv-crop-sidebar {
    width: 260px;
    flex-shrink: 0;
    padding: 14px;
    border-left: 1px solid var(--lv-border);
    background: var(--lv-surface);
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .lv-crop-preview-img {
    width: 100%;
    max-height: 240px;
    object-fit: contain;
    border: 1px solid var(--lv-border);
    border-radius: var(--lv-r-1);
    background: var(--lv-surface-2);
  }
  @media (max-width: 760px) {
    .lv-crop-mask {
      padding: 0;
    }
    .lv-crop-card {
      width: 100vw;
      height: 100dvh;
      border-radius: 0;
    }
    .lv-crop-body {
      flex-direction: column;
    }
    .lv-crop-sidebar {
      width: 100%;
      max-height: 36vh;
      border-left: none;
      border-top: 1px solid var(--lv-border);
    }
  }
</style>
