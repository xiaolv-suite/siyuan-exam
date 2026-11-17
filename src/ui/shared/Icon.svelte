<script lang="ts">
  // 线性图标组件（V03）：与思源笔记 litheness 线框体系 100% 对齐——
  // 强制 fill: none !important; stroke: currentColor !important; stroke-width: 1.7
  // 彻底免疫思源全局 `svg { fill: currentColor; stroke-width: 0 }` 引起的实心黑坨畸变。
  import { iconSvg } from "./icons";
  let { name, size = 18 }: { name: string; size?: number } = $props();
</script>

<span class="lv-icon" aria-hidden="true">{@html iconSvg(name, size)}</span>

<style>
  :global(.lv-icon) {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    line-height: 1;
    vertical-align: -0.15em;
  }
  :global(.lv-icon svg) {
    display: block;
    fill: none !important;
    stroke: currentColor !important;
    stroke-width: 1.7 !important;
    stroke-linecap: round !important;
    stroke-linejoin: round !important;
  }
  :global(.lv-icon svg path),
  :global(.lv-icon svg rect),
  :global(.lv-icon svg circle),
  :global(.lv-icon svg line),
  :global(.lv-icon svg polyline),
  :global(.lv-icon svg polygon) {
    fill: none !important;
    stroke: currentColor !important;
    stroke-width: 1.7 !important;
    stroke-linecap: round !important;
    stroke-linejoin: round !important;
  }
</style>
