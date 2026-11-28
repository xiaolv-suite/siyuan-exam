<script lang="ts">
  import { onDestroy } from "svelte";
  import Icon from "./Icon.svelte";
  import { lvSurfaceStack } from "@/libs/lv-notice-kit";
  import { createFocusTrap, type FocusTrapInstance } from "@/libs/lv-focus-trap";
  import {
    ZOOM_MIN_SCALE,
    ZOOM_MAX_SCALE,
    clampZoomScale,
    computePinchDistance,
    computePinchScale,
    computeDoubleTapZoomScale,
    clampPanOffset,
  } from "@/core/pinchZoom";

  interface Props {
    open: boolean;
    src: string;
    alt?: string;
    onclose: () => void;
  }

  let { open, src, alt = "题目配图预览", onclose }: Props = $props();

  let dialogEl = $state<HTMLDivElement | null>(null);
  let stageEl = $state<HTMLDivElement | null>(null);
  let scale = $state(1);
  let offsetX = $state(0);
  let offsetY = $state(0);

  let pinchStartDist = 0;
  let pinchStartScale = 1;
  let isPinching = false;
  let panStartX = 0;
  let panStartY = 0;
  let panOriginX = 0;
  let panOriginY = 0;
  let isPanning = false;
  let lastTapTs = 0;

  let focusTrap: FocusTrapInstance | null = null;
  let surfaceCleanup: (() => void) | null = null;

  function resetZoom() {
    scale = 1;
    offsetX = 0;
    offsetY = 0;
  }

  function stepZoom(delta: number) {
    const next = clampZoomScale(scale + delta, ZOOM_MIN_SCALE, ZOOM_MAX_SCALE);
    scale = next;
    if (next <= 1) {
      offsetX = 0;
      offsetY = 0;
    } else if (stageEl) {
      const clamped = clampPanOffset(offsetX, offsetY, next, stageEl.clientWidth, stageEl.clientHeight);
      offsetX = clamped.x;
      offsetY = clamped.y;
    }
  }

  function handleTouchStart(e: TouchEvent) {
    e.stopPropagation();
    if (e.touches.length === 2) {
      isPinching = true;
      isPanning = false;
      pinchStartDist = computePinchDistance(e.touches[0]!, e.touches[1]!);
      pinchStartScale = scale;
      return;
    }
    if (e.touches.length === 1) {
      const now = Date.now();
      if (now - lastTapTs < 280) {
        lastTapTs = 0;
        const next = computeDoubleTapZoomScale(scale, 1, 2);
        scale = next;
        if (next <= 1) {
          offsetX = 0;
          offsetY = 0;
        }
        return;
      }
      lastTapTs = now;
      if (scale > 1) {
        isPanning = true;
        panStartX = e.touches[0]!.clientX;
        panStartY = e.touches[0]!.clientY;
        panOriginX = offsetX;
        panOriginY = offsetY;
      }
    }
  }

  function handleTouchMove(e: TouchEvent) {
    e.stopPropagation();
    if (isPinching && e.touches.length === 2) {
      e.preventDefault();
      const dist = computePinchDistance(e.touches[0]!, e.touches[1]!);
      const next = computePinchScale(pinchStartDist, dist, pinchStartScale, ZOOM_MIN_SCALE, ZOOM_MAX_SCALE);
      scale = next;
      if (next <= 1) {
        offsetX = 0;
        offsetY = 0;
      }
      return;
    }
    if (isPanning && e.touches.length === 1 && scale > 1 && stageEl) {
      e.preventDefault();
      const dx = e.touches[0]!.clientX - panStartX;
      const dy = e.touches[0]!.clientY - panStartY;
      const clamped = clampPanOffset(
        panOriginX + dx,
        panOriginY + dy,
        scale,
        stageEl.clientWidth,
        stageEl.clientHeight,
      );
      offsetX = clamped.x;
      offsetY = clamped.y;
    }
  }

  function handleTouchEnd(e: TouchEvent) {
    e.stopPropagation();
    if (e.touches.length < 2) {
      isPinching = false;
    }
    if (e.touches.length === 0) {
      isPanning = false;
    }
  }

  function handleDoubleClick() {
    const next = computeDoubleTapZoomScale(scale, 1, 2);
    scale = next;
    if (next <= 1) {
      offsetX = 0;
      offsetY = 0;
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (!open) return;
    if (e.isComposing || e.keyCode === 229) return;
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onclose();
    } else if (e.key === "+" || e.key === "=") {
      e.preventDefault();
      stepZoom(0.25);
    } else if (e.key === "-") {
      e.preventDefault();
      stepZoom(-0.25);
    } else if (e.key === "0") {
      e.preventDefault();
      resetZoom();
    }
  }

  $effect(() => {
    if (open) {
      resetZoom();
      surfaceCleanup?.();
      surfaceCleanup = lvSurfaceStack.push({
        id: "lv-exam-image-lightbox",
        type: "dialog",
        dismiss: () => {
          onclose();
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
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open && src}
  <div
    bind:this={dialogEl}
    class="lv-lightbox-mask"
    role="dialog"
    aria-modal="true"
    aria-label={alt}
    tabindex="-1"
    onclick={(e) => { if (e.target === e.currentTarget) onclose(); }}
    onkeydown={handleKeydown}
  >
    <div class="lv-lightbox-toolbar">
      <span class="lv-chip num" aria-live="polite">🔍 {Math.round(scale * 100)}%</span>
      <button type="button" class="lv-btn sm" onclick={() => stepZoom(-0.25)} aria-label="缩小">－</button>
      <button type="button" class="lv-btn sm" onclick={resetZoom} aria-label="复原 100%">100%</button>
      <button type="button" class="lv-btn sm" onclick={() => stepZoom(0.25)} aria-label="放大">＋</button>
      <button type="button" class="lv-btn sm lv-btn--ghost" onclick={onclose} aria-label="关闭大图预览">
        <Icon name="close" size={14} /> 关闭
      </button>
    </div>

    <div
      bind:this={stageEl}
      class="lv-lightbox-stage"
      role="region"
      aria-label="双指缩放图片预览区"
      ontouchstart={handleTouchStart}
      ontouchmove={handleTouchMove}
      ontouchend={handleTouchEnd}
      ontouchcancel={handleTouchEnd}
      ondblclick={handleDoubleClick}
    >
      <img
        {src}
        {alt}
        class="lv-lightbox-img"
        draggable="false"
        style="transform:translate3d({offsetX}px, {offsetY}px, 0) scale({scale})"
      />
    </div>

    <div class="lv-lightbox-hint">
      双指捏合缩放 · 双击复原/放大 · Esc 关闭
    </div>
  </div>
{/if}

<style>
  .lv-lightbox-mask {
    position: fixed;
    inset: 0;
    z-index: 1200;
    background: color-mix(in srgb, var(--lv-surface, var(--b3-theme-background, #18181b)) 92%, transparent);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: space-between;
    padding: max(12px, env(safe-area-inset-top, 12px)) 12px max(12px, env(safe-area-inset-bottom, 12px));
    touch-action: none;
  }
  .lv-lightbox-toolbar {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    border-radius: var(--lv-radius-pill, 999px);
    background: var(--lv-surface-2);
    border: 1px solid var(--lv-border);
    box-shadow: var(--lv-sh-2);
    z-index: 2;
  }
  .lv-lightbox-stage {
    flex: 1;
    width: 100%;
    min-height: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    touch-action: none;
    user-select: none;
  }
  .lv-lightbox-img {
    max-width: 96%;
    max-height: 82vh;
    object-fit: contain;
    border-radius: var(--lv-r-2);
    box-shadow: var(--lv-sh-pop);
    transform-origin: center center;
    transition: transform 0.08s ease-out;
    touch-action: none;
  }
  .lv-lightbox-hint {
    font-size: 12px;
    color: var(--lv-text-3);
    padding: 4px 10px;
    background: var(--lv-surface-2);
    border-radius: var(--lv-radius-pill, 999px);
    border: 1px solid var(--lv-border-subtle);
  }
</style>
