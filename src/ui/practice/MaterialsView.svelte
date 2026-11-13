<script lang="ts">
  import Icon from "../shared/Icon.svelte";
  import type { ExamApp } from "../../app";
  import type { MaterialDoc } from "@/core/materials";
  import type { MaterialNote } from "@/core/materialNotes";
  import StudioSubNav from "./StudioSubNav.svelte";

  interface Props {
    app: ExamApp | null;
    offline: boolean;
    materialsList: MaterialDoc[];
    materialsFiltered: MaterialDoc[];
    selectedMaterial: MaterialDoc | null;
    materialsBusy: boolean;
    materialsNote: string;
    materialsSearch: string;
    matLink: string;
    matLinkTitle: string;
    matSubject: string;
    matChapter: string;
    notesOpenId: string;
    notesCache: MaterialNote[];
    noteEditingId: string;
    notePage: string;
    noteTime: string;
    noteQuote: string;
    noteText: string;
    noteTags: string;
    noteDirty: boolean;
    noteFormError: string;
    materialNoteCounts: Map<string, number>;
    materialQuestionCounts: Map<string, number>;
    t: (k: string, fb?: string) => string;
    matIconName: (kind: string) => string;
    locatorLabel: (loc: any) => string;
    needsRelocate: (n: any, rev: number) => boolean;
    onback: () => void;
    onchangeView: (view: "manual" | "materials" | "import" | "ai") => void;
    materialFileInput?: HTMLInputElement | null;
    onpickFile: () => void;
    onfileChange: (e: Event) => void;
    onregisterLink: () => void;
    onselectMaterial: (id: string) => void;
    onopenMaterial: (m: MaterialDoc) => void;
    ontoggleNotes: (m: MaterialDoc) => void;
    onbridgeToManual: (m: MaterialDoc, noteText?: string) => void;
    onbridgeToAi: (m: MaterialDoc) => void;
    onremoveMaterial: (m: MaterialDoc) => void;
    onopenMaterialAt: (m: MaterialDoc, n: MaterialNote) => void;
    onstartEditNote: (n: MaterialNote) => void;
    onremoveNote: (m: MaterialDoc, n: MaterialNote) => void;
    onsaveNote: (m: MaterialDoc) => void;
    onresetNoteForm: () => void;
  }

  let {
    app,
    offline,
    materialsList,
    materialsFiltered,
    selectedMaterial,
    materialsBusy,
    materialsNote,
    materialsSearch = $bindable(),
    matLink = $bindable(),
    matLinkTitle = $bindable(),
    matSubject = $bindable(),
    matChapter = $bindable(),
    notesOpenId,
    notesCache,
    noteEditingId,
    notePage = $bindable(),
    noteTime = $bindable(),
    noteQuote = $bindable(),
    noteText = $bindable(),
    noteTags = $bindable(),
    noteDirty,
    noteFormError,
    materialNoteCounts,
    materialQuestionCounts,
    t,
    matIconName,
    locatorLabel,
    needsRelocate,
    onback,
    onchangeView,
    materialFileInput = $bindable(null),
    onpickFile,
    onfileChange,
    onregisterLink,
    onselectMaterial,
    onopenMaterial,
    ontoggleNotes,
    onbridgeToManual,
    onbridgeToAi,
    onremoveMaterial,
    onopenMaterialAt,
    onstartEditNote,
    onremoveNote,
    onsaveNote,
    onresetNoteForm,
  }: Props = $props();

  let selectionToolbar = $state<{ x: number; y: number; text: string } | null>(null);

  function handleSelectionCheck() {
    if (typeof window === "undefined") return;
    const sel = window.getSelection();
    const txt = sel ? sel.toString().trim() : "";
    if (txt.length >= 2 && txt.length <= 300) {
      // 划词制题只针对资料正文：在输入框/文本域/可编辑区内选词（如笔记摘录）不打扰
      const anchor = sel!.anchorNode;
      const anchorEl = anchor instanceof Element ? anchor : anchor?.parentElement ?? null;
      if (anchorEl?.closest("input, textarea, [contenteditable='true'], [contenteditable='']")) {
        selectionToolbar = null;
        return;
      }
      try {
        const range = sel!.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        // 右缘钳位预留整条工具栏宽度（四键约 300px），避免贴右边时溢出视口
        selectionToolbar = {
          x: Math.max(10, Math.min(window.innerWidth - 320, rect.left + rect.width / 2 - 120)),
          y: Math.max(10, rect.top - 44),
          text: txt,
        };
      } catch {
        selectionToolbar = null;
      }
    } else {
      selectionToolbar = null;
    }
  }

  function handleAction(num: 1 | 2 | 3 | 4) {
    if (!selectionToolbar || !selectedMaterial) return;
    const txt = selectionToolbar.text;
    selectionToolbar = null;
    if (num === 1) {
      onbridgeToManual(selectedMaterial, txt);
    } else if (num === 2) {
      onbridgeToManual(selectedMaterial, `==${txt}==`);
    } else if (num === 3) {
      noteQuote = txt;
      if (notesOpenId !== selectedMaterial.id) ontoggleNotes(selectedMaterial);
    } else if (num === 4) {
      onbridgeToAi(selectedMaterial);
    }
  }

  function handleWindowKeyDown(e: KeyboardEvent) {
    if (!selectionToolbar) return;
    // 数字快捷键不得劫持输入框打字与中文 IME 选字（keyboard-shortcuts：保留系统/输入法快捷键）
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
    if (e.isComposing) return;
    if (e.key === "Escape") {
      selectionToolbar = null;
      return;
    }
    if (e.key === "1") {
      e.preventDefault();
      handleAction(1);
    } else if (e.key === "2") {
      e.preventDefault();
      handleAction(2);
    } else if (e.key === "3") {
      e.preventDefault();
      handleAction(3);
    } else if (e.key === "4") {
      e.preventDefault();
      handleAction(4);
    }
  }
</script>

<svelte:window onmouseup={handleSelectionCheck} ontouchend={handleSelectionCheck} onkeydown={handleWindowKeyDown} />

<div class="lv-pad">
  <div class="lv-screen-head">
    <span class="lv-eyebrow">{t("head.materials.eyebrow")}</span>
    <h1 class="lv-h1">{t("head.materials.title")}</h1>
    <p>{t("head.materials.desc")}</p>
  </div>
  <StudioSubNav currentView="materials" {t} {onchangeView} />
  <!-- 使用说明向导卡片 -->
  <div class="lv-card" style="margin:8px 0 10px;padding:12px 16px;background:color-mix(in srgb, var(--lv-accent-soft) 30%, var(--lv-surface));border-left:3.5px solid var(--lv-accent);border-radius:var(--lv-r-2);display:flex;align-items:flex-start;gap:12px">
    <Icon name="info" size={16} />
    <div style="font-size:12.5px;line-height:1.6;color:var(--lv-text-2)">
      <b style="color:var(--lv-text);display:block;margin-bottom:2px">💡 学习资料库如何使用？</b>
      1. <b>上传教材与讲义</b>：支持上传 Word (.docx)、PDF、Markdown、音视频等资料，自动安全保存在思源 <code>data/assets</code> 目录中。<br />
      2. <b>一键转化为试题</b>：选中资料后，点击「<b>带入手工出题工坊</b>」或「<b>带入 AI 智能出题</b>」，可自动将资料作为题目背景或直接提取考点出题。<br />
      3. <b>考点笔记与定位</b>：点击「<b>整理笔记</b>」，可边读资料边随堂记录核心采分点与摘录，笔记可随时一键裂变为对应题目的题干！
    </div>
  </div>
  <div class="lv-row">
    <button class="lv-btn lv-btn--ghost lv-mobile-back" onclick={onback} style="display:inline-flex;align-items:center;gap:4px"><Icon name="chev-left" size={13} /> {t("import.back")}</button>
    <b><Icon name="book" size={15} /> {t("materials.title")}</b>
    {#if app?.materialsReadonly}<span class="lv-chip lv-chip--amb">{t("materials.readonly")}</span>{/if}
    <span class="lv-chip lv-chip--data num">{materialsList.length}</span>
  </div>
  <div class="lv-card" style="margin-top:10px">
    <div class="lv-row">
      <button type="button" class="lv-btn" disabled={materialsBusy || offline || app?.materialsReadonly} title={app?.materialsReadonly ? t("materials.readonly") : offline ? t("state.offlineHint") : ""} onclick={() => { if (materialFileInput) materialFileInput.click(); else onpickFile(); }}>
        <Icon name="paperclip" size={14} /> {t("materials.pickFile")}
      </button>
      <input type="file" bind:this={materialFileInput} accept=".pdf,.mp4,.webm,.m4v,.mp3,.m4a,.wav,.ogg,.png,.jpg,.jpeg,.gif,.webp,.md,.txt,.docx,.epub" hidden onchange={onfileChange} disabled={materialsBusy || offline || app?.materialsReadonly} />
      <span class="lv-muted">{t("materials.copyHint")}</span>
    </div>
    <div class="lv-row">
      <span class="lv-chip"><Icon name="link" size={12} /> {t("materials.link")}</span>
      <input class="lv-input" style="flex:1;min-width:200px" placeholder="https://…" aria-label={t("materials.link")} bind:value={matLink} disabled={materialsBusy} />
      <input class="lv-input" style="max-width:150px" placeholder={t("materials.linkTitle")} aria-label={t("materials.linkTitle")} bind:value={matLinkTitle} disabled={materialsBusy} />
      <button class="lv-btn" onclick={onregisterLink} disabled={materialsBusy || offline || app?.materialsReadonly || !matLink.trim()} title={app?.materialsReadonly ? t("materials.readonly") : ""}>{t("materials.register")}</button>
    </div>
    <div class="lv-row lv-muted" style="font-size:var(--lv-font-size-label)">
      <span>{t("materials.meta")}</span>
      <input class="lv-input" style="max-width:150px" placeholder={t("materials.subject")} aria-label={t("materials.subject")} bind:value={matSubject} disabled={materialsBusy || app?.materialsReadonly} />
      <input class="lv-input" style="max-width:150px" placeholder={t("materials.chapter")} aria-label={t("materials.chapter")} bind:value={matChapter} disabled={materialsBusy || app?.materialsReadonly} />
      <span class="fn__flex-1"></span>
      <div style="position:relative;max-width:200px;display:inline-flex;align-items:center">
        <span style="position:absolute;left:8px;pointer-events:none;color:var(--lv-text-3);display:flex;align-items:center" aria-hidden="true">
          <Icon name="search" size={13} />
        </span>
        <input class="lv-input sm" style="width:100%;padding-left:28px;padding-right:24px" placeholder={t("materials.search")} aria-label={t("materials.search")} bind:value={materialsSearch} disabled={materialsBusy} />
        {#if materialsSearch}
          <button type="button" class="lv-btn sm lv-btn--ghost" onclick={() => { materialsSearch = ""; }} title="清空搜索" aria-label="清空搜索" style="position:absolute;right:3px;padding:2px 4px;min-width:18px;min-height:18px"><Icon name="close" size={11} /></button>
        {/if}
      </div>
    </div>
    {#if offline}<div class="lv-muted" style="display:inline-flex;align-items:center;gap:4px"><Icon name="alert-triangle" size={13} /> {t("materials.offlineNote")}</div>{/if}
    {#if materialsNote}<div class="lv-row"><span class="lv-chip" role="status">{materialsNote}</span></div>{/if}
  </div>
  {#if materialsList.length === 0}
    <div class="lv-empty"><div class="lv-empty-icon"><Icon name="book" size={24} /></div><b>{t("materials.title")}</b><p class="lv-muted">{t("materials.empty")}</p></div>
  {:else if materialsFiltered.length === 0}
    <div class="lv-empty">
      <div class="lv-empty-icon"><Icon name="search" size={24} /></div>
      <p style="margin:8px 0 0">{t("materials.noMatch")}</p>
    </div>
  {:else}
    <div class="lv-materials-workspace">
      <aside class="lv-card lv-material-list" aria-label={t("materials.title")}>
        <div class="lv-section-head"><div><span class="lv-eyebrow">资料库</span><h2>{t("materials.title")}</h2></div><span class="lv-chip lv-chip--data num">{materialsFiltered.length}</span></div>
        {#each materialsFiltered as m (m.id)}
          <button class="lv-material-item" class:selected={selectedMaterial?.id === m.id} aria-current={selectedMaterial?.id === m.id ? "true" : undefined} disabled={materialsBusy} aria-disabled={materialsBusy} onclick={() => { if (!materialsBusy) onselectMaterial(m.id); }}>
            <span class="lv-material-icon"><Icon name={matIconName(m.kind)} size={15} /></span>
            <span class="lv-material-copy"><b>{m.title}</b><small>{[m.subject, m.chapter, t("mkind." + m.kind)].filter(Boolean).join(" · ")}</small></span>
            <span class="lv-material-count num">{materialNoteCounts.get(m.id) ?? 0}</span>
          </button>
        {/each}
      </aside>
      {#if selectedMaterial}
        {@const m = selectedMaterial}
        <section class="lv-card lv-material-detail" aria-busy={materialsBusy}>
          <div class="lv-section-head">
            <div><span class="lv-eyebrow">资料详情</span><h2>{m.title}</h2></div>
            <span class="lv-chip">{t("mkind." + m.kind)}</span>
          </div>
          <div class="lv-row lv-material-tags">
            {#if m.subject}<span class="lv-chip">{m.subject}</span>{/if}
            {#if m.chapter}<span class="lv-chip">{m.chapter}</span>{/if}
            <span class="lv-chip num">v{m.revision}</span>
            {#if materialQuestionCounts.get(m.id)}<span class="lv-chip num" title={t("qref.linkedTip")}><Icon name="link" size={11} /> {t("qref.linkedCount").replace("{n}", String(materialQuestionCounts.get(m.id) ?? 0))}</span>{/if}
          </div>
          <div class="lv-material-locations">
            <b>{t("materials.meta")}</b>
            {#each m.locations as l, _li (_li)}
              <div class="lv-material-location"><Icon name={l.kind === "assets" ? matIconName(m.kind) : "link"} size={13} /><span>{l.path}</span></div>
            {/each}
          </div>
          <div class="lv-material-actions-panel" style="margin:12px 0;padding:12px 14px;background:var(--lv-surface-2);border-radius:var(--lv-r-2);border:1px solid var(--lv-border-subtle)">
            <b style="display:block;font-size:12px;color:var(--lv-text-3);margin-bottom:8px">资料应用与备考转化：</b>
            <div class="lv-row" style="margin:0;gap:8px;flex-wrap:wrap">
              <button class="lv-btn lv-btn--primary sm" onclick={() => onbridgeToManual(m)} title="把当前资料来源带入手工录题台">
                <Icon name="pencil" size={13} /> 带入手工出题工坊
              </button>
              <button class="lv-btn sm" onclick={() => onbridgeToAi(m)} title="把当前资料与笔记带入 AI 出题">
                <Icon name="sparkles" size={13} /> 带入 AI 智能出题
              </button>
              <button class="lv-btn sm lv-btn--ghost" aria-expanded={notesOpenId === m.id} aria-busy={materialsBusy} onclick={() => ontoggleNotes(m)} disabled={materialsBusy}>
                <Icon name="clipboard" size={13} /> {t("materials.notes")}（<span class="num">{materialNoteCounts.get(m.id) ?? 0}</span>）
              </button>
              <button class="lv-btn sm lv-btn--ghost" onclick={() => onopenMaterial(m)} title="在思源/浏览器中打开原件">
                <Icon name="external-link" size={13} /> 打开原件 ↗
              </button>
              <button class="lv-btn sm lv-btn--ghost" style="margin-left:auto" onclick={() => onremoveMaterial(m)} disabled={materialsBusy || app?.materialsReadonly} title="从资料库移除">
                <Icon name="trash" size={13} />
              </button>
            </div>
          </div>
          {#if notesOpenId === m.id}
            <div class="lv-material-notes">
              <div class="lv-section-head"><div><span class="lv-eyebrow">整理与回忆</span><h2>{t("materials.notes")}</h2></div></div>
              {#each notesCache as n (n.id)}
                <div class="lv-material-note" role="region" aria-label={n.locator ? locatorLabel(n.locator) : "学习笔记"}>
                  <div class="lv-row" style="margin:0;gap:var(--lv-space-1);flex-wrap:wrap">
                    {#if n.locator}<span class="lv-chip num">{locatorLabel(n.locator)}</span>{/if}
                    {#if needsRelocate(n, m.revision)}<span class="lv-chip lv-chip--amb" title={t("materials.relocateTip")}>{t("materials.relocate")}</span>{/if}
                    {#each n.tags as tg (tg)}<span class="lv-chip num" style="font-size:10px">#{tg}</span>{/each}
                  </div>
                  {#if n.locator}<button class="lv-btn sm lv-btn--ghost" onclick={() => onopenMaterialAt(m, n)}><Icon name="external-link" size={12} /> {t("materials.openAt")}</button>{/if}
                  <div class="lv-material-note-text">{n.text}</div>
                  <div class="lv-row">
                    <button class="lv-btn sm lv-btn--ghost" onclick={() => onbridgeToManual(m, n.text)} title="用本条笔记作为题干草稿"><Icon name="edit" size={12} /> {t("materials.noteToQuestion", "用此笔记出题")}</button>
                    <button class="lv-btn sm lv-btn--ghost" onclick={() => onstartEditNote(n)} disabled={materialsBusy || app?.materialsReadonly}><Icon name="pencil" size={12} /> {t("materials.noteEdit")}</button>
                    <button class="lv-btn sm lv-btn--ghost" onclick={() => onremoveNote(m, n)} disabled={materialsBusy || app?.materialsReadonly}><Icon name="trash" size={13} /> {t("materials.removeTitle")}</button>
                  </div>
                </div>
              {/each}
              {#if !notesCache.length}<div class="lv-muted lv-material-note-empty">{t("materials.noteEmpty")}</div>{/if}
              <div class="lv-row" style="margin:12px 0 4px"><b class="lv-muted" style="font-size:var(--lv-font-size-sm)">{noteEditingId ? t("materials.noteEdit") : t("materials.noteAdd")}</b></div>
              <div class="lv-row" style="flex-wrap:wrap">
                {#if m.kind === "pdf"}<input class="lv-input" style="max-width:90px" placeholder={t("materials.page")} aria-label={t("materials.page")} bind:value={notePage} disabled={materialsBusy || app?.materialsReadonly} />{:else if m.kind === "video" || m.kind === "audio"}<input class="lv-input" style="max-width:110px" placeholder="mm:ss" aria-label="定位时间点 (mm:ss)" bind:value={noteTime} disabled={materialsBusy || app?.materialsReadonly} />{/if}
                <input class="lv-input" style="flex:1;min-width:160px" placeholder={t("materials.quote")} aria-label={t("materials.quote")} bind:value={noteQuote} disabled={materialsBusy || app?.materialsReadonly} />
              </div>
              <textarea class="lv-input lv-textarea" rows="3" placeholder={t("materials.notePlaceholder")} aria-label={t("materials.notePlaceholder")} bind:value={noteText} disabled={materialsBusy || app?.materialsReadonly}></textarea>
              <div class="lv-row"><input class="lv-input" style="flex:1;min-width:160px" placeholder={t("materials.tagsPlaceholder")} aria-label={t("materials.tagsPlaceholder")} bind:value={noteTags} disabled={materialsBusy || app?.materialsReadonly} /><button class="lv-btn lv-btn--primary sm" onclick={() => onsaveNote(m)} disabled={!noteText.trim() || materialsBusy || app?.materialsReadonly}>{noteEditingId ? t("materials.noteUpdate") : t("materials.noteAddBtn")}</button>{#if noteEditingId}<button class="lv-btn sm lv-btn--ghost" onclick={onresetNoteForm} disabled={materialsBusy}>{t("edit.cancel")}</button>{/if}</div>
              {#if noteDirty}<p class="lv-muted" role="status">{t("materials.noteDraftHint")}</p>{/if}
              {#if noteFormError}<div class="lv-error" role="alert">{noteFormError}</div>{/if}
            </div>
          {/if}
        </section>
      {/if}
    </div>
  {/if}

  {#if selectionToolbar}
    <div
      class="lv-selection-toolbar"
      role="toolbar"
      aria-label="划词快捷操作栏"
      style="position:fixed;left:{selectionToolbar.x}px;top:{selectionToolbar.y}px;z-index:99;animation:lv-appear 0.15s var(--lv-ease-out)"
    >
      <div class="lv-card" style="box-shadow:var(--lv-sh-pop);padding:3px 8px;display:flex;align-items:center;gap:3px;border-radius:var(--lv-radius-pill);border:1px solid var(--lv-border-subtle);background:var(--lv-surface)">
        <button class="lv-btn sm lv-btn--ghost" onclick={() => handleAction(1)} title="[1] 将所选词带入手工录题" aria-label="1 学习：录题">
          <span class="num" style="opacity:0.6;font-size:10px;margin-right:2px">1</span> <Icon name="edit" size={12} /> 学习
        </button>
        <button class="lv-btn sm lv-btn--ghost" onclick={() => handleAction(2)} title="[2] 将所选词挖空成填空题" aria-label="2 挖空制题">
          <span class="num" style="opacity:0.6;font-size:10px;margin-right:2px">2</span> <Icon name="layers" size={12} /> 挖空
        </button>
        <button class="lv-btn sm lv-btn--ghost" onclick={() => handleAction(3)} title="[3] 作为引文记笔记" aria-label="3 摘录笔记">
          <span class="num" style="opacity:0.6;font-size:10px;margin-right:2px">3</span> <Icon name="book" size={12} /> 批注
        </button>
        <button class="lv-btn sm lv-btn--ghost" onclick={() => handleAction(4)} title="[4] 带入 AI 追问" aria-label="4 询问 AI">
          <span class="num" style="opacity:0.6;font-size:10px;margin-right:2px">4</span> <Icon name="sparkles" size={12} /> 询问
        </button>
        <button class="lv-btn sm lv-btn--ghost" onclick={() => (selectionToolbar = null)} title="关闭操作栏" aria-label="关闭操作栏" style="padding:2px 5px">
          <Icon name="close" size={11} />
        </button>
      </div>
    </div>
  {/if}
</div>
