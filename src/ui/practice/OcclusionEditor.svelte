<script lang="ts">
  // ============================================================
  // 图片遮挡题可视化绘制编辑器 (Image Occlusion Authoring)
  // 交互设计（ui-ux-pro-max 规范）：
  // 1. 指针拖拽画遮罩（pointer events + touch-action:none，鼠标/触屏/手写笔统一）
  // 2. 键盘替代路径（WCAG 2.2 dragging-alternative）：全图遮罩一键 + 每遮罩 X/Y/W/H 数值输入
  // 3. 误触保护：低于最小边长的拖拽自动丢弃；Escape 随时取消当前拖拽
  // 4. 答案/提示逐遮罩编辑，序号 ①②③ 与练习/打印渲染一致
  // 本地图片经 FileReader 转 data URL，不上传任何远端。
  // ============================================================
  import Icon from "../shared/Icon.svelte";
  import { createOcclusionQuestions, normalizeOcclusionRect } from "@/core/imageOcclusion";
  import type { Question, ImageOcclusionMask } from "@/core/types";

  interface Props {
    t: (k: string, fb?: string) => string;
    oncreate: (questions: Question[]) => void | Promise<void>;
    kp?: string;
    source?: string;
  }

  let { t: _t, oncreate, kp = "", source = "" }: Props = $props();

  interface DraftMask {
    id: string;
    x: number;
    y: number;
    w: number;
    h: number;
    answer: string;
    hint: string;
  }

  const CIRCLE_NUMBERS = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩", "⑪", "⑫", "⑬", "⑭", "⑮", "⑯", "⑰", "⑱", "⑲", "⑳"];

  let imageUrl = $state("");
  let imgLoadError = $state(false);
  let masks = $state<DraftMask[]>([]);
  let draftRect = $state<null | { x: number; y: number; w: number; h: number }>(null);
  let dragStart = $state<null | { px: number; py: number }>(null);
  let canvasEl = $state<HTMLDivElement | null>(null);
  let fileInput: HTMLInputElement | null = null;
  let creating = $state(false);
  let localError = $state("");
  let maskSeq = 0;

  const ready = $derived(imageUrl.trim().length > 0 && !imgLoadError);
  const allAnswered = $derived(masks.length > 0 && masks.every((m) => m.answer.trim().length > 0));

  function handleImageUrlKeydown(e: KeyboardEvent) {
    /* IME 合成期让路：Enter 属确认选字（中文文件名路径同样受影响）。 */
    if (e.isComposing || e.keyCode === 229) return;
    if (e.key === "Enter") {
      e.preventDefault();
      const v = imageUrl.trim();
      if (v) {
        imgLoadError = false;
        imageUrl = v;
      }
    }
  }

  function handleFileChange(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      localError = "请选择图片文件（PNG/JPG/SVG/WebP）";
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      localError = "图片超过 4MB，请压缩后重试（data URL 内嵌会放大体积）";
      return;
    }
    localError = "";
    const reader = new FileReader();
    reader.onload = () => {
      imageUrl = String(reader.result ?? "");
      imgLoadError = false;
    };
    reader.onerror = () => {
      localError = "图片读取失败，请重试";
    };
    reader.readAsDataURL(file);
    // 允许重复选择同一文件
    input.value = "";
  }

  function pointerNorm(e: PointerEvent): { px: number; py: number } {
    const rect = canvasEl?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return { px: 0, py: 0 };
    return {
      px: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
      py: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)),
    };
  }

  function onCanvasPointerDown(e: PointerEvent) {
    if (!ready || e.button !== 0) return;
    const { px, py } = pointerNorm(e);
    dragStart = { px, py };
    draftRect = { x: px, y: py, w: 0, h: 0 };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onCanvasPointerMove(e: PointerEvent) {
    if (!dragStart) return;
    const { px, py } = pointerNorm(e);
    draftRect = {
      x: Math.min(dragStart.px, px),
      y: Math.min(dragStart.py, py),
      w: Math.abs(px - dragStart.px),
      h: Math.abs(py - dragStart.py),
    };
  }

  function onCanvasPointerUp(e: PointerEvent) {
    if (!dragStart) return;
    const { px, py } = pointerNorm(e);
    const rect = normalizeOcclusionRect(dragStart.px, dragStart.py, px, py);
    dragStart = null;
    draftRect = null;
    if (!rect) return; // 误触（拖拽面积过小）静默丢弃
    masks.push({ id: `om-${Date.now()}-${maskSeq++}`, ...rect, answer: "", hint: "" });
  }

  function onCanvasKeydown(e: KeyboardEvent) {
    if (e.key === "Escape" && dragStart) {
      dragStart = null;
      draftRect = null;
    }
  }

  /** 键盘替代：一键添加全图遮罩（再调 X/Y/W/H 收窄），满足 dragging-alternative */
  function addFullCoverMask() {
    if (!ready) return;
    masks.push({ id: `om-${Date.now()}-${maskSeq++}`, x: 0, y: 0, w: 1, h: 1, answer: "", hint: "" });
  }

  function removeMask(id: string) {
    masks = masks.filter((m) => m.id !== id);
  }

  function pct(v: number): number {
    return Math.round(v * 1000) / 10;
  }

  function onMaskGeoInput(m: DraftMask, field: "x" | "y" | "w" | "h", raw: string) {
    const v = parseFloat(raw);
    if (Number.isNaN(v)) return;
    const clamped = Math.max(0, Math.min(100, v)) / 100;
    m[field] = clamped;
    if (field === "x") m.w = Math.min(m.w, 1 - clamped);
    if (field === "y") m.h = Math.min(m.h, 1 - clamped);
  }

  async function generate() {
    if (!ready || !allAnswered || creating) return;
    creating = true;
    localError = "";
    try {
      const occlusionMasks: ImageOcclusionMask[] = masks.map((m) => ({
        id: m.id,
        x: m.x,
        y: m.y,
        w: m.w,
        h: m.h,
        answer: m.answer.trim(),
        hint: m.hint.trim() || undefined,
      }));
      const qs = createOcclusionQuestions({ imageUrl, masks: occlusionMasks, kp, source });
      if (!qs.length) {
        localError = "生成失败：请检查图片与遮罩";
        return;
      }
      await oncreate(qs);
      // 入库成功后清空遮罩与图片，防止重复生成同族题
      masks = [];
      imageUrl = "";
      imgLoadError = false;
    } catch (e) {
      localError = String(e instanceof Error ? e.message : e);
    } finally {
      creating = false;
    }
  }
</script>

<div class="lv-occl-editor" style="border:1px solid var(--lv-border-subtle);border-radius:var(--lv-r-3, 14px);padding:14px 16px;background:var(--lv-surface-2);margin:10px 0">
  <div class="lv-row" style="margin:0 0 8px;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
    <b style="display:inline-flex;align-items:center;gap:6px;font-size:var(--lv-font-size-body-compact)">
      <Icon name="layers" size={14} /> 图片遮挡填图出题
    </b>
    <span class="lv-muted" style="font-size:var(--lv-font-size-caption)">拖拽框选图中区域 → 填写各区域答案 → 一键裂变同族题</span>
  </div>

  <div class="lv-row" style="margin:0 0 8px;flex-wrap:wrap;gap:6px">
    <label class="lv-chip" for="lv-occl-url">图片地址</label>
    <input id="lv-occl-url" class="lv-input" style="flex:1;min-width:200px" bind:value={imageUrl}
      placeholder="粘贴图片 URL 或选择本地图片" aria-label="图片地址" onkeydown={handleImageUrlKeydown} />
    <button class="lv-btn sm lv-btn--ghost" onclick={() => fileInput?.click()} aria-label="选择本地图片文件">
      <Icon name="file" size={13} /> 本地图片
    </button>
    <input type="file" accept="image/*" bind:this={fileInput} onchange={handleFileChange} style="display:none" aria-hidden="true" tabindex="-1" />
  </div>
  {#if localError}<p class="lv-error" role="alert" style="margin:4px 0">{localError}</p>{/if}

  {#if ready}
    <!-- 绘制画布：pointer events 统一鼠标/触屏/笔；touch-action:none 防拖拽时页面滚动 -->
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div
      bind:this={canvasEl}
      class="lv-occl-canvas"
      role="application"
      aria-label="遮罩绘制画布：在图上拖拽框选区域，Escape 取消当前框选"
      style="position:relative;user-select:none;touch-action:none;cursor:crosshair;border-radius:var(--lv-r-2, 10px);overflow:hidden;border:1px solid var(--lv-border);max-width:560px;margin:0 auto"
      onpointerdown={onCanvasPointerDown}
      onpointermove={onCanvasPointerMove}
      onpointerup={onCanvasPointerUp}
      onkeydown={onCanvasKeydown}
      tabindex="0"
    >
      <img src={imageUrl} alt="待遮挡的题目配图" draggable="false" style="display:block;width:100%;height:auto" onerror={() => (imgLoadError = true)} />
      {#each masks as m, mi (m.id)}
        <div style="position:absolute;left:{m.x * 100}%;top:{m.y * 100}%;width:{m.w * 100}%;height:{m.h * 100}%;background:color-mix(in srgb, var(--lv-brand) 55%, transparent);border:1.5px solid var(--lv-brand);border-radius:3px;display:flex;align-items:center;justify-content:center;pointer-events:none">
          <span style="color:var(--lv-brand-contrast, #ffffff);font-size:14px;font-weight:700;text-shadow:0 1px 2px color-mix(in srgb, var(--lv-brand) 82%, transparent)">{CIRCLE_NUMBERS[mi] ?? mi + 1}</span>
        </div>
      {/each}
      {#if draftRect}
        <div style="position:absolute;left:{draftRect.x * 100}%;top:{draftRect.y * 100}%;width:{draftRect.w * 100}%;height:{draftRect.h * 100}%;border:1.5px dashed var(--lv-accent);background:color-mix(in srgb, var(--lv-accent) 18%, transparent);border-radius:3px;pointer-events:none"></div>
      {/if}
    </div>

    <div class="lv-row" style="margin:10px 0 4px;flex-wrap:wrap;gap:6px;align-items:center">
      <button class="lv-btn sm lv-btn--ghost" onclick={addFullCoverMask} title="键盘用户替代拖拽：先加全图遮罩，再用下方数值微调">
        <Icon name="plus" size={13} /> 全图遮罩（键盘替代）
      </button>
      <span class="lv-chip lv-chip--data num" role="status" aria-live="polite">已画 {masks.length} 块遮罩</span>
      <button class="lv-btn lv-btn--primary sm" onclick={generate} disabled={!allAnswered || creating} aria-busy={creating}
        title={allAnswered ? "" : "请先为每一块遮罩填写答案"}>
        <Icon name="zap" size={13} /> {creating ? "生成中…" : `生成 ${masks.length} 道同族题`}
      </button>
    </div>

    {#if masks.length}
      <div role="group" aria-label="遮罩答案清单" style="margin:8px 0 0">
        {#each masks as m, mi (m.id)}
          <div class="lv-occl-mask-row" style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;padding:6px 8px;background:var(--lv-surface);border:1px solid var(--lv-border-subtle);border-radius:var(--lv-r-1);margin:4px 0">
            <span class="lv-chip num" style="min-width:32px;justify-content:center" aria-hidden="true">{CIRCLE_NUMBERS[mi] ?? mi + 1}</span>
            <label class="lv-chip" for={`lv-occl-ans-${m.id}`}>答案</label>
            <input id={`lv-occl-ans-${m.id}`} class="lv-input" style="flex:1;min-width:120px" bind:value={m.answer} placeholder="该区域正确名称（必填）" />
            <label class="lv-chip" for={`lv-occl-hint-${m.id}`}>提示</label>
            <input id={`lv-occl-hint-${m.id}`} class="lv-input" style="flex:1;min-width:100px" bind:value={m.hint} placeholder="可选提示" />
            <label class="lv-chip num" for={`lv-occl-x-${m.id}`} title="遮罩几何（键盘可编辑，百分比）">X</label>
            <input id={`lv-occl-x-${m.id}`} class="lv-input num" type="number" inputMode="numeric" min="0" max="100" step="0.5" style="width:64px" value={pct(m.x)} oninput={(e) => onMaskGeoInput(m, "x", (e.target as HTMLInputElement).value)} aria-label={`遮罩 ${mi + 1} 横坐标百分比`} />
            <label class="lv-chip num" for={`lv-occl-y-${m.id}`}>Y</label>
            <input id={`lv-occl-y-${m.id}`} class="lv-input num" type="number" inputMode="numeric" min="0" max="100" step="0.5" style="width:64px" value={pct(m.y)} oninput={(e) => onMaskGeoInput(m, "y", (e.target as HTMLInputElement).value)} aria-label={`遮罩 ${mi + 1} 纵坐标百分比`} />
            <label class="lv-chip num" for={`lv-occl-w-${m.id}`}>宽</label>
            <input id={`lv-occl-w-${m.id}`} class="lv-input num" type="number" inputMode="numeric" min="1.5" max="100" step="0.5" style="width:64px" value={pct(m.w)} oninput={(e) => onMaskGeoInput(m, "w", (e.target as HTMLInputElement).value)} aria-label={`遮罩 ${mi + 1} 宽度百分比`} />
            <label class="lv-chip num" for={`lv-occl-h-${m.id}`}>高</label>
            <input id={`lv-occl-h-${m.id}`} class="lv-input num" type="number" inputMode="numeric" min="1.5" max="100" step="0.5" style="width:64px" value={pct(m.h)} oninput={(e) => onMaskGeoInput(m, "h", (e.target as HTMLInputElement).value)} aria-label={`遮罩 ${mi + 1} 高度百分比`} />
            <button class="lv-btn sm lv-btn--ghost" onclick={() => removeMask(m.id)} aria-label={`删除遮罩 ${mi + 1}`} title="删除该遮罩">
              <Icon name="close" size={13} />
            </button>
          </div>
        {/each}
        <p class="lv-muted" style="font-size:var(--lv-font-size-caption);margin:4px 0 0">每块遮罩生成一道独立填图题，同族联动（siblingBury 防干扰）；A4 打印自动输出白底带圈序号卷面，绝不泄漏答案</p>
      </div>
    {/if}
  {:else if imgLoadError}
    <div class="lv-error" role="alert" style="margin:6px 0">图片加载失败，请检查地址是否可访问</div>
  {:else}
    <p class="lv-muted" style="font-size:var(--lv-font-size-caption);margin:2px 0">先在上方粘贴图片 URL 或选择本地图片，即可开始框选</p>
  {/if}
</div>
