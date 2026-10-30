<script lang="ts">
  // 线性图标组件（V03）：静态自绘路径，经 iconSvg 输出，无外部输入面。
  // 装饰性图标统一从无障碍树剔除（icon-context 规则）：伴随可见文本的图标无需播报，
  // 纯图标按钮自身携带 aria-label，读屏只听控件语义不听路径。
  import { iconSvg } from "./icons";
  let { name, size = 19 }: { name: string; size?: number } = $props();
</script>

<span class="lv-icon" aria-hidden="true">{@html iconSvg(name, size)}</span>
