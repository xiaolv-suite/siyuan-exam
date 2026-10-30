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
</script>

<div class="lv-pad">
  <div class="lv-screen-head">
    <span class="lv-eyebrow">{t("head.materials.eyebrow")}</span>
    <h1 class="lv-h1">{t("head.materials.title")}</h1>
    <p>{t("head.materials.desc")}</p>
  </div>
  <StudioSubNav currentView="materials" {t} {onchangeView} />
  <div class="lv-row">
    <button class="lv-btn lv-btn--ghost lv-mobile-back" onclick={onback} style="display:inline-flex;align-items:center;gap:4px"><Icon name="chev-left" size={13} /> {t("import.back")}</button>
    <b><Icon name="book" size={15} /> {t("materials.title")}</b>
    {#if app?.materialsReadonly}<span class="lv-chip lv-chip--amb">{t("materials.readonly")}</span>{/if}
    <span class="lv-chip num">{materialsList.length}</span>
  </div>
  <div class="lv-card" style="margin-top:10px">
    <div class="lv-row">
      <button type="button" class="lv-btn" disabled={materialsBusy || offline || app?.materialsReadonly} title={app?.materialsReadonly ? t("materials.readonly") : offline ? t("state.offlineHint") : ""} onclick={onpickFile}>
        <Icon name="paperclip" size={14} /> {t("materials.pickFile")}
      </button>
      <input type="file" accept=".pdf,.mp4,.webm,.m4v,.mp3,.m4a,.wav,.ogg,.png,.jpg,.jpeg,.gif,.webp,.md,.txt,.docx,.epub" hidden onchange={onfileChange} disabled={materialsBusy || offline || app?.materialsReadonly} />
      <span class="lv-muted">{t("materials.copyHint")}</span>
    </div>
    <div class="lv-row">
      <span class="lv-chip"><Icon name="link" size={12} /> {t("materials.link")}</span>
      <input class="lv-input" style="flex:1;min-width:200px" placeholder="https://…" bind:value={matLink} disabled={materialsBusy} />
      <input class="lv-input" style="max-width:150px" placeholder={t("materials.linkTitle")} bind:value={matLinkTitle} disabled={materialsBusy} />
      <button class="lv-btn" onclick={onregisterLink} disabled={materialsBusy || offline || app?.materialsReadonly || !matLink.trim()} title={app?.materialsReadonly ? t("materials.readonly") : ""}>{t("materials.register")}</button>
    </div>
    <div class="lv-row lv-muted" style="font-size:var(--lv-font-size-label)">
      <span>{t("materials.meta")}</span>
      <input class="lv-input" style="max-width:150px" placeholder={t("materials.subject")} bind:value={matSubject} disabled={materialsBusy || app?.materialsReadonly} />
      <input class="lv-input" style="max-width:150px" placeholder={t("materials.chapter")} bind:value={matChapter} disabled={materialsBusy || app?.materialsReadonly} />
      <span class="fn__flex-1"></span>
      <input class="lv-input" style="max-width:200px" placeholder={t("materials.search")} bind:value={materialsSearch} disabled={materialsBusy} />
    </div>
    {#if offline}<div class="lv-muted" style="display:inline-flex;align-items:center;gap:4px"><Icon name="alert-triangle" size={13} /> {t("materials.offlineNote")}</div>{/if}
    {#if materialsNote}<div class="lv-row"><span class="lv-chip">{materialsNote}</span></div>{/if}
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
        <div class="lv-section-head"><div><span class="lv-eyebrow">资料库</span><h2>{t("materials.title")}</h2></div><span class="lv-chip num">{materialsFiltered.length}</span></div>
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
          <div class="lv-row lv-material-actions">
            <button class="lv-btn lv-btn--primary sm" onclick={() => onopenMaterial(m)}><Icon name="external-link" size={13} /> {t("materials.open")}</button>
            <button class="lv-btn sm" aria-expanded={notesOpenId === m.id} onclick={() => ontoggleNotes(m)} disabled={materialsBusy}><Icon name="pencil" size={13} /> {t("materials.notes")}（<span class="num">{materialNoteCounts.get(m.id) ?? 0}</span>）</button>
            <button class="lv-btn sm lv-btn--ghost" onclick={() => onbridgeToManual(m)} title="把当前资料来源带入手工录题"><Icon name="edit" size={13} /> {t("materials.toManual", "带入录题")}</button>
            <button class="lv-btn sm lv-btn--ghost" onclick={() => onbridgeToAi(m)} title="把当前资料与笔记带入 AI 出题"><Icon name="sparkles" size={13} /> {t("materials.toAi", "带入 AI")}</button>
            <button class="lv-btn sm lv-btn--ghost" onclick={() => onremoveMaterial(m)} disabled={materialsBusy || app?.materialsReadonly} title={app?.materialsReadonly ? t("materials.readonly") : t("materials.removeTitle")}><Icon name="trash" size={13} /></button>
          </div>
          {#if notesOpenId === m.id}
            <div class="lv-material-notes">
              <div class="lv-section-head"><div><span class="lv-eyebrow">整理与回忆</span><h2>{t("materials.notes")}</h2></div></div>
              {#each notesCache as n (n.id)}
                <div class="lv-material-note">
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
                {#if m.kind === "pdf"}<input class="lv-input" style="max-width:90px" placeholder={t("materials.page")} bind:value={notePage} disabled={materialsBusy || app?.materialsReadonly} />{:else if m.kind === "video" || m.kind === "audio"}<input class="lv-input" style="max-width:110px" placeholder="mm:ss" bind:value={noteTime} disabled={materialsBusy || app?.materialsReadonly} />{/if}
                <input class="lv-input" style="flex:1;min-width:160px" placeholder={t("materials.quote")} bind:value={noteQuote} disabled={materialsBusy || app?.materialsReadonly} />
              </div>
              <textarea class="lv-input lv-textarea" rows="3" placeholder={t("materials.notePlaceholder")} bind:value={noteText} disabled={materialsBusy || app?.materialsReadonly}></textarea>
              <div class="lv-row"><input class="lv-input" style="flex:1;min-width:160px" placeholder={t("materials.tagsPlaceholder")} bind:value={noteTags} disabled={materialsBusy || app?.materialsReadonly} /><button class="lv-btn lv-btn--primary sm" onclick={() => onsaveNote(m)} disabled={!noteText.trim() || materialsBusy || app?.materialsReadonly}>{noteEditingId ? t("materials.noteUpdate") : t("materials.noteAddBtn")}</button>{#if noteEditingId}<button class="lv-btn sm lv-btn--ghost" onclick={onresetNoteForm} disabled={materialsBusy}>{t("edit.cancel")}</button>{/if}</div>
              {#if noteDirty}<p class="lv-muted" role="status">{t("materials.noteDraftHint")}</p>{/if}
              {#if noteFormError}<div class="lv-error">{noteFormError}</div>{/if}
            </div>
          {/if}
        </section>
      {/if}
    </div>
  {/if}
</div>
