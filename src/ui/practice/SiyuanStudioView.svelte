<script lang="ts">
  /**
   * 小驴考试 · 思源笔记原生内容提炼出题专属工作台（SiyuanStudioView）
   * 聚合所有基于思源笔记正文文档、划重点高光、#考点# 标签以及小驴拾遗剪藏的出题方式
   * 一级页面架构 · 与【手工录题】、【外部导入】、【AI 出题】平级
   */
  import { onDestroy } from "svelte";
  import Icon from "../shared/Icon.svelte";
  import type { BankInfo } from "../../app";
  import type { ParsedClozeItem } from "@/core/cloze";
  import StudioSubNav from "./StudioSubNav.svelte";
  import { handleTablistKeydown } from "./services/practiceKeyboardService";

  interface Props {
    hasBank: boolean;
    banks: BankInfo[];
    siyuanDocBusy: boolean;
    siyuanDocCandidates: Array<{ id: string; title: string; hpath: string; box: string }>;
    selectedDocIds: Record<string, boolean>;
    selectedDocCount: number;
    docSearchQuery: string;
    importDocProfile?: "all" | "paper" | "notes" | "cloze" | "table";
    clozeModes: ("highlight" | "curly" | "bracket")[];
    clozeInputText: string;
    clozeImporting: boolean;
    clozeParsedItems: ParsedClozeItem[];
    selectedTag?: string;
    customTagInput?: string;
    taggedBlocks?: Array<{ id: string; content: string; rootId: string; hpath: string }>;
    tagSearchBusy?: boolean;
    hasGleanPlugin?: boolean;
    gleanClipsList?: Array<{ id: string; title: string; site?: string; url?: string; summary?: string }>;
    gleanClipsLoading?: boolean;
    selectedGleanIds?: Record<string, boolean>;
    selectedGleanCount?: number;
    t: (k: string, fb?: string) => string;
    onback: () => void;
    onchangeView: (view: "manual" | "siyuan" | "materials" | "import" | "ai") => void;
    onDoSearchDocs: (q: string) => void;
    onToggleSelectAllDocs: () => void;
    onImportSelectedDocs: () => void;
    onImportAllSearchedDocs: () => void;
    onPickAndImportSiyuanDoc: (id: string, title: string) => void;
    onAiExtractDoc?: (id: string, title: string) => void;
    onToggleClozeMode: (mode: "highlight" | "curly" | "bracket") => void;
    onDoParseCloze: () => void;
    onImportClozeQuestions: () => void;
    onDoSearchTags?: (tag: string) => void;
    onImportTagQuestions?: (tag: string) => void;
    onloadGleanClips?: () => void;
    onextractSelectedGlean?: () => void;
    ontoggleGleanId?: (id: string) => void;
    ontoggleSelectAllGlean?: () => void;
  }

  let {
    hasBank,
    banks: _banks,
    siyuanDocBusy,
    siyuanDocCandidates,
    selectedDocIds = $bindable(),
    selectedDocCount,
    docSearchQuery = $bindable(),
    importDocProfile = $bindable("all"),
    clozeModes,
    clozeInputText = $bindable(),
    clozeImporting,
    clozeParsedItems,
    selectedTag = $bindable("#考点"),
    customTagInput = $bindable(""),
    taggedBlocks = [],
    tagSearchBusy = false,
    hasGleanPlugin = false,
    gleanClipsList = [],
    gleanClipsLoading = false,
    selectedGleanIds = $bindable({}),
    selectedGleanCount = 0,
    t,
    onback,
    onchangeView,
    onDoSearchDocs,
    onToggleSelectAllDocs,
    onImportSelectedDocs,
    onImportAllSearchedDocs,
    onPickAndImportSiyuanDoc,
    onAiExtractDoc = () => {},
    onToggleClozeMode,
    onDoParseCloze,
    onImportClozeQuestions,
    onDoSearchTags = () => {},
    onImportTagQuestions = () => {},
    onloadGleanClips = () => {},
    onextractSelectedGlean = () => {},
    ontoggleGleanId = () => {},
    ontoggleSelectAllGlean = () => {},
  }: Props = $props();

  // 思源专属出题二级分面：文档提炼 / 标签与闪卡 / 划重点挖空 / 拾遗剪藏
  let subMode = $state<"docs" | "tags" | "cloze" | "glean">("docs");

  let docSearchDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  onDestroy(() => {
    if (docSearchDebounceTimer) clearTimeout(docSearchDebounceTimer);
  });

  function handleDocSearchInput(val: string) {
    if (docSearchDebounceTimer) clearTimeout(docSearchDebounceTimer);
    docSearchDebounceTimer = setTimeout(() => {
      onDoSearchDocs(val);
    }, 150);
  }
</script>

<div class="lv-pad lv-siyuan-studio">
  <!-- 顶部主标题栏 -->
  <div class="lv-screen-head">
    <span class="lv-eyebrow">思源笔记原生出题</span>
    <h1 class="lv-h1">从思源笔记提炼出题</h1>
    <p>直接读取思源笔记文档正文、划重点高光、#考点# 标签及小驴拾遗剪藏，一键提炼试题入库，自动挂载 sourceBlockId 双向链接。</p>
  </div>

  <!-- 一级出题工作台导航（手工录题 / 思源出题 / 外部导入 / AI出题 / 学习资料 平级） -->
  <StudioSubNav currentView="siyuan" {t} {onchangeView} />

  <!-- 返回按钮与标签面包屑 -->
  <div class="lv-row" style="margin-bottom:8px">
    <button
      class="lv-btn lv-btn--ghost lv-mobile-back"
      onclick={onback}
      style="display:inline-flex;align-items:center;gap:4px"
    >
      <Icon name="chev-left" size={13} /> {t("import.back", "返回")}
    </button>
    <span class="lv-chip">📑 思源笔记原生出题</span>
  </div>

  {#if !hasBank}
    <div class="lv-empty">
      <div class="lv-empty-icon"><Icon name="folder" size={24} /></div>
      <p style="margin:8px 0 0">{t("guard.needBankFirst", "请先在上方创建一个题库")}</p>
    </div>
  {:else}
    <div class="lv-card lv-pad-card lv-siyuan-card" role="region" aria-label="思源笔记出题工作区">
      <!-- 二级思源模式切换栏（高颜值分段控制 Pills） -->
      <div
        class="lv-session-dock lv-siyuan-subtabs"
        role="tablist"
        tabindex="-1"
        aria-label="思源提炼模式切换"
        onkeydown={handleTablistKeydown}
      >
        <button
          type="button"
          role="tab"
          tabindex={subMode === "docs" ? 0 : -1}
          class="lv-chip lv-sub-pill"
          class:acc={subMode === "docs"}
          aria-selected={subMode === "docs"}
          onclick={() => { subMode = "docs"; onDoSearchDocs(docSearchQuery || ""); }}
        >
          <Icon name="book" size={13} />
          <span>从思源文档提炼</span>
        </button>

        <button
          type="button"
          role="tab"
          tabindex={subMode === "tags" ? 0 : -1}
          class="lv-chip lv-sub-pill"
          class:acc={subMode === "tags"}
          aria-selected={subMode === "tags"}
          onclick={() => { subMode = "tags"; onDoSearchTags(selectedTag || "#考点"); }}
        >
          <Icon name="tag" size={13} />
          <span>按标签与闪卡提炼</span>
        </button>

        <button
          type="button"
          role="tab"
          tabindex={subMode === "cloze" ? 0 : -1}
          class="lv-chip lv-sub-pill"
          class:acc={subMode === "cloze"}
          aria-selected={subMode === "cloze"}
          onclick={() => { subMode = "cloze"; }}
        >
          <Icon name="edit" size={13} />
          <span>划重点高光挖空</span>
        </button>

        <button
          type="button"
          role="tab"
          tabindex={subMode === "glean" ? 0 : -1}
          class="lv-chip lv-sub-pill"
          class:acc={subMode === "glean"}
          aria-selected={subMode === "glean"}
          onclick={() => { subMode = "glean"; onloadGleanClips(); }}
        >
          <Icon name="bookmark" size={13} />
          <span>小驴拾遗剪藏提题</span>
        </button>
      </div>

      <!-- 分面 1：从思源文档提炼 -->
      {#if subMode === "docs"}
        <div class="stack-sm lv-subview-docs">
          <!-- 核心特性指引与安全背书 -->
          <div class="lv-card lv-guide-card">
            <div class="lv-guide-title">
              <Icon name="sparkles" size={14} />
              <b>思源原生笔记试题提取指引（核心特色）</b>
            </div>
            <p class="lv-guide-desc">
              直接读取思源笔记正文，支持单选/多选/判断/表格题、<code>==高亮划重点填空==</code>、<code>**术语定义**</code> 以及 <code>::</code> 闪卡语法。提取后的题目自动与思源原笔记段落挂载 <code>sourceBlockId</code> 双向链接！
            </p>
            <div class="lv-guide-safety" role="note">
              🛡️ 只读安全保障：仅读取文档文本生成题目，绝不修改、覆盖或删除您的原有思源笔记内容。
            </div>
          </div>

          <!-- 识别场景引擎切换 -->
          <div class="lv-row lv-profile-row" role="group" aria-label="识别场景引擎预设">
            <span class="lv-muted" style="font-size:11.5px">识别模式：</span>
            {#each [
              { id: "all", label: "🎯 智能全能", desc: "10大引擎全量并发，并自动排重与置信度评分" },
              { id: "paper", label: "📄 标准试卷", desc: "专精大题章节、题号与选项，屏蔽正文概念" },
              { id: "notes", label: "📖 读书笔记", desc: "专精列表术语、粗体加粗与问答标题提炼" },
              { id: "cloze", label: "⚡ 高光挖空", desc: "专门提取 ==高亮== 与 {{挖空}} 记忆卡" },
              { id: "table", label: "📊 表格矩阵", desc: "专门提取 Markdown 表格问答对照" },
            ] as mode (mode.id)}
              <button
                type="button"
                class="lv-chip sm lv-profile-chip"
                class:acc={importDocProfile === mode.id}
                title={mode.desc}
                onclick={() => { importDocProfile = mode.id as any; }}
              >
                {mode.label}
              </button>
            {/each}
          </div>

          <!-- 搜索输入栏 -->
          <div class="lv-row lv-search-row">
            <div class="lv-search-wrap">
              <span class="lv-search-icon" aria-hidden="true">
                <Icon name="search" size={13} />
              </span>
              <input
                class="lv-input sm lv-search-input"
                placeholder={t("import.searchDocPlaceholder", "搜索思源文档标题或路径...")}
                aria-label={t("import.searchDocPlaceholder", "搜索思源文档标题或路径")}
                bind:value={docSearchQuery}
                oninput={(e) => handleDocSearchInput((e.target as HTMLInputElement).value)}
              />
              {#if docSearchQuery}
                <button
                  type="button"
                  class="lv-btn sm lv-btn--ghost lv-search-clear"
                  onclick={() => { docSearchQuery = ""; onDoSearchDocs(""); }}
                  title="清空搜索"
                  aria-label="清空搜索"
                >
                  <Icon name="close" size={12} />
                </button>
              {/if}
            </div>
            <button
              class="lv-btn sm lv-btn--primary"
              onclick={() => { if (docSearchDebounceTimer) clearTimeout(docSearchDebounceTimer); onDoSearchDocs(docSearchQuery); }}
              disabled={siyuanDocBusy}
              aria-busy={siyuanDocBusy}
            >
              <Icon name="search" size={13} />
              <span>{siyuanDocBusy ? "搜索中…" : "搜索"}</span>
            </button>
          </div>

          <!-- 文档候选列表 -->
          <div class="stack-sm lv-doc-list-box">
            {#if siyuanDocCandidates.length === 0}
              <div class="lv-muted lv-doc-empty">
                {siyuanDocBusy ? "正在搜索思源文档…" : "未找到匹配文档，请尝试输入其他关键词"}
              </div>
            {:else}
              <!-- 批量操作控制行 -->
              <div class="lv-row lv-batch-action-bar">
                <div class="lv-row" style="margin:0;gap:8px;align-items:center">
                  <button
                    type="button"
                    class="lv-chip num sm lv-select-all-chip"
                    onclick={onToggleSelectAllDocs}
                    class:acc={selectedDocCount > 0}
                  >
                    {#if selectedDocCount > 0}
                      <Icon name="check" size={11} />
                      <span>{selectedDocCount === siyuanDocCandidates.length ? "已全选" : `已选 ${selectedDocCount}`}</span>
                    {:else}
                      <span class="lv-checkbox-stub"></span>
                      <span>全选</span>
                    {/if}
                  </button>
                  <span class="lv-muted lv-doc-count-label">
                    {#if !docSearchQuery.trim()}<Icon name="clock" size={11} />{/if}
                    {docSearchQuery.trim() ? `搜索到 ${siyuanDocCandidates.length} 篇相关笔记` : `最近编辑笔记（共 ${siyuanDocCandidates.length} 篇）`}
                  </span>
                </div>
                <div class="lv-row" style="margin:0;gap:6px">
                  {#if selectedDocCount > 0}
                    <button
                      class="lv-btn sm lv-btn--primary"
                      disabled={siyuanDocBusy}
                      aria-busy={siyuanDocBusy}
                      onclick={onImportSelectedDocs}
                    >
                      <Icon name="import" size={12} /> {siyuanDocBusy ? "正在提取…" : `提炼已选试题 (${selectedDocCount})`}
                    </button>
                  {/if}
                  <button
                    class="lv-btn sm lv-btn--ghost"
                    disabled={siyuanDocBusy}
                    aria-busy={siyuanDocBusy}
                    onclick={onImportAllSearchedDocs}
                  >
                    <Icon name="layers" size={12} /> {siyuanDocBusy ? "正在提取…" : `全部提取 (${siyuanDocCandidates.length})`}
                  </button>
                </div>
              </div>

              <!-- 文档卡片流 -->
              {#each siyuanDocCandidates as doc (doc.id)}
                <div class="lv-row lv-doc-card">
                  <div class="lv-doc-info">
                    <input
                      type="checkbox"
                      aria-label={`选择文档: ${doc.title}`}
                      checked={!!selectedDocIds[doc.id]}
                      onchange={(e) => {
                        const checked = (e.target as HTMLInputElement).checked;
                        if (checked) selectedDocIds[doc.id] = true;
                        else { delete selectedDocIds[doc.id]; selectedDocIds = { ...selectedDocIds }; }
                      }}
                    />
                    <div class="lv-doc-text">
                      <b class="lv-doc-title" title={doc.title}>{doc.title}</b>
                      <div class="lv-doc-path lv-muted" title={doc.hpath}>{doc.hpath}</div>
                    </div>
                  </div>
                  <div class="lv-row lv-doc-actions">
                    <button
                      class="lv-btn sm lv-btn--primary"
                      disabled={siyuanDocBusy}
                      aria-busy={siyuanDocBusy}
                      onclick={() => onPickAndImportSiyuanDoc(doc.id, doc.title)}
                      title="直接提取文中文法题（选择题/高亮挖空/加粗术语定义）"
                    >
                      <Icon name="import" size={12} /> {siyuanDocBusy ? "提取中…" : "提炼试题"}
                    </button>
                    <button
                      class="lv-btn sm lv-btn--ghost"
                      disabled={siyuanDocBusy}
                      onclick={() => onAiExtractDoc?.(doc.id, doc.title)}
                      title="由 AI 自动阅读此篇笔记正文提炼试题（完全不改动原笔记！）"
                    >
                      <Icon name="sparkles" size={12} /> AI 提炼
                    </button>
                  </div>
                </div>
              {/each}
            {/if}
          </div>
        </div>

      <!-- 分面 2：按思源标签与闪卡提取 -->
      {:else if subMode === "tags"}
        <div class="stack-sm lv-subview-tags">
          <div class="lv-card lv-guide-card">
            <div class="lv-guide-title">
              <Icon name="tag" size={14} />
              <b>按思源标签与原生闪卡汇聚题库</b>
            </div>
            <p class="lv-guide-desc">
              支持扫描思源全库中带有 <code>#考点#</code>、<code>#必考#</code>、<code>#真题#</code>、<code>#错题#</code> 等标签的内容块，或思源原生闪卡包，一键将日常散落的重点笔记汇聚为独立题库，题目与思源原块原生双向绑定！
            </p>
          </div>

          <div class="lv-row" style="margin:4px 0 8px;gap:6px;align-items:center;flex-wrap:wrap">
            <span class="lv-muted" style="font-size:12px">常用考点标签：</span>
            {#each ["#考点", "#必考", "#真题", "#错题", "#重点", "#背诵", "思源闪卡"] as tg (tg)}
              <button
                type="button"
                class="lv-chip sm"
                class:acc={selectedTag === tg}
                onclick={() => { selectedTag = tg; onDoSearchTags(tg); }}
              >
                {tg}
              </button>
            {/each}
          </div>

          <div class="lv-row" style="margin:0;gap:6px;align-items:center">
            <input
              class="lv-input sm"
              style="flex:1"
              placeholder="输入自定义标签名称（如 #考研真题 或 #法考重点）…"
              bind:value={customTagInput}
              onkeydown={(e) => {
                if (e.isComposing || e.keyCode === 229) return;
                if (e.key === "Enter") {
                  selectedTag = customTagInput || selectedTag;
                  onDoSearchTags(selectedTag);
                }
              }}
            />
            <button
              class="lv-btn sm lv-btn--primary"
              disabled={tagSearchBusy}
              onclick={() => {
                selectedTag = customTagInput || selectedTag;
                onDoSearchTags(selectedTag);
              }}
            >
              <Icon name="search" size={13} /> {tagSearchBusy ? "正在检索…" : "检索考点块"}
            </button>
          </div>

          <div class="stack-sm lv-doc-list-box">
            {#if tagSearchBusy}
              <div class="lv-muted lv-doc-empty">正在检索全库标签块…</div>
            {:else if !taggedBlocks.length}
              <div class="lv-muted lv-doc-empty">未找到带有该标签的内容块，请在上方点击常用标签或在思源笔记中添加 <code>#考点#</code></div>
            {:else}
              <div class="lv-row lv-batch-action-bar">
                <span class="lv-muted" style="font-size:12px">检索到 <b>{taggedBlocks.length}</b> 个包含 <code>{selectedTag}</code> 的内容块</span>
                <button class="lv-btn sm lv-btn--primary" onclick={() => onImportTagQuestions(selectedTag)}>
                  <Icon name="import" size={12} /> 一键全部转换为试题并入库 ({taggedBlocks.length})
                </button>
              </div>
              {#each taggedBlocks as b (b.id)}
                <div class="lv-row lv-tag-block-card">
                  <div style="flex:1;min-width:0">
                    <div class="lv-tag-block-content">{b.content.slice(0, 160)}</div>
                    <div class="lv-muted lv-tag-block-path">{b.hpath}</div>
                  </div>
                </div>
              {/each}
            {/if}
          </div>
        </div>

      <!-- 分面 3：划重点高光挖空出题 -->
      {:else if subMode === "cloze"}
        <div class="stack-sm lv-subview-cloze">
          <div class="lv-card lv-guide-card">
            <div class="lv-guide-title">
              <Icon name="edit" size={14} />
              <b>正文划重点挖空出题说明</b>
            </div>
            <p class="lv-guide-desc">
              将任意复习段落粘贴到下方，使用 <code>==高亮==</code>、<code>{`{大括号}`}</code> 或 <code>((圆括号))</code> 标记想要作为考点的重点词汇，点击「生成挖空试题」即可一键批量转换入库！
            </p>
          </div>

          <div class="lv-row" role="group" aria-label="识别语法模式" style="margin:4px 0 8px;gap:6px;align-items:center;flex-wrap:wrap">
            <span class="lv-muted" style="font-size:var(--lv-font-size-caption)">识别语法：</span>
            <button type="button" class="lv-chip sm" class:acc={clozeModes.includes("highlight")} aria-pressed={clozeModes.includes("highlight")} onclick={() => onToggleClozeMode("highlight")}>{t("cloze.modeHighlight", "==高亮==")}</button>
            <button type="button" class="lv-chip sm" class:acc={clozeModes.includes("curly")} aria-pressed={clozeModes.includes("curly")} onclick={() => onToggleClozeMode("curly")}>{t("cloze.modeCurly", "{大括号}")}</button>
            <button type="button" class="lv-chip sm" class:acc={clozeModes.includes("bracket")} aria-pressed={clozeModes.includes("bracket")} onclick={() => onToggleClozeMode("bracket")}>{t("cloze.modeBracket", "(圆括号)")}</button>
            <button type="button" class="lv-chip sm" onclick={() => {
              clozeInputText = "在操作系统的体系结构中，==内核== 是最核心的部分，负责直接管理硬件资源，运行在最高特权级的 ==内核态== 中。";
            }}>⚡ 高亮示例</button>
            <button type="button" class="lv-chip sm" onclick={() => {
              clozeInputText = "TCP 提供 {{面向连接}} 的、{{可靠}} 的字节流服务，而 UDP 提供 {{无连接}} 的数据报服务。";
            }}>⚡ 大括号示例</button>
          </div>

          <textarea
            class="lv-input lv-textarea"
            rows="6"
            placeholder={t("cloze.placeholder", "粘贴包含高亮或挖空标记的笔记段落…")}
            aria-label="挖空输入文本"
            bind:value={clozeInputText}
            disabled={clozeImporting}
          ></textarea>

          <div class="lv-row" style="margin:8px 0">
            <button class="lv-btn lv-btn--primary" onclick={onDoParseCloze} disabled={clozeImporting || !clozeInputText.trim()}>
              <Icon name="sparkles" size={14} /> {t("cloze.parseBtn", "解析挖空试题")}
            </button>
            {#if clozeParsedItems.length}
              <button class="lv-btn lv-btn--primary" onclick={onImportClozeQuestions} disabled={clozeImporting} aria-busy={clozeImporting}>
                {clozeImporting ? "入库中…" : t("cloze.importBtn", "一键存入题库 ({n})").replace("{n}", String(clozeParsedItems.length))}
              </button>
              <span class="lv-chip lv-chip--grn num">{t("cloze.parsedCount", "已解析 {n} 题").replace("{n}", String(clozeParsedItems.length))}</span>
            {/if}
          </div>

          {#if clozeParsedItems.length}
            <div class="stack-sm" style="margin-top:10px;max-height:300px;overflow:auto">
              {#each clozeParsedItems as it, idx (idx)}
                <div class="lv-card" style="padding:10px 14px;background:var(--lv-surface);border-radius:var(--lv-r-3, 14px);border:1px solid var(--lv-border-subtle);box-shadow:var(--lv-sh-1)">
                  <div class="lv-row" style="justify-content:space-between;margin:0 0 4px">
                    <b class="num" style="color:var(--lv-accent)">#{idx + 1} 填空题</b>
                    <span class="lv-chip num sm">{it.blankCount} 空</span>
                  </div>
                  <div style="font-size:var(--lv-font-size-sm);margin:4px 0">{it.stem}</div>
                  <div class="lv-muted num" style="font-size:var(--lv-font-size-caption)">
                    答案: <b style="color:var(--lv-accent)">{it.combinedAnswer}</b>
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        </div>

      <!-- 分面 4：从小驴拾遗剪藏提题 -->
      {:else if subMode === "glean"}
        <div class="stack-sm lv-subview-glean">
          <div class="lv-card lv-guide-card">
            <div class="lv-guide-title">
              <Icon name="bookmark" size={14} />
              <b>从小驴拾遗（siyuan-glean）提炼试题</b>
            </div>
            <p class="lv-guide-desc">
              读取小驴拾遗精粹剪藏与稍后读，自动提取重点内容、定义句式与挖空卡片，试题自动与剪藏文档建立双向链接！
            </p>
          </div>

          {#if !hasGleanPlugin}
            <div class="lv-card" style="text-align:center;padding:32px 16px;border:1px dashed var(--lv-border);border-radius:var(--lv-r-2);background:var(--lv-surface)">
              <Icon name="bookmark" size={28} />
              <p style="margin:8px 0 4px;font-weight:600">未检测到小驴拾遗插件（siyuan-glean）</p>
              <p class="lv-muted" style="font-size:12px">前往思源集市安装小驴拾遗后，即可直接将网页与图书稍后读剪藏一键提取为考题！</p>
            </div>
          {:else if gleanClipsLoading}
            <div class="lv-muted lv-doc-empty"><Icon name="loader" size={18} /> 正在拉取拾遗剪藏素材…</div>
          {:else if !gleanClipsList.length}
            <div class="lv-card" style="text-align:center;padding:24px;border-radius:var(--lv-r-2);background:var(--lv-surface)">
              <p class="lv-muted">暂无待处理的拾遗稍后读剪藏。</p>
              <button class="lv-btn sm" onclick={onloadGleanClips}>刷新剪藏</button>
            </div>
          {:else}
            <div class="lv-row lv-batch-action-bar">
              <span class="lv-muted" style="font-size:12px">找到 <b>{gleanClipsList.length}</b> 条拾遗剪藏，已选 <b>{selectedGleanCount}</b> 条</span>
              <div class="lv-row" style="margin:0;gap:6px">
                <button class="lv-btn sm lv-btn--ghost" onclick={ontoggleSelectAllGlean}>全选/反选</button>
                {#if selectedGleanCount > 0}
                  <button class="lv-btn sm lv-btn--primary" onclick={onextractSelectedGlean}>
                    <Icon name="import" size={12} /> 批量提炼已选 ({selectedGleanCount})
                  </button>
                {/if}
              </div>
            </div>
            <div class="stack-sm lv-doc-list-box">
              {#each gleanClipsList as c (c.id)}
                <div class="lv-row lv-doc-card">
                  <div class="lv-doc-info">
                    <input
                      type="checkbox"
                      aria-label={`选择剪藏: ${c.title}`}
                      checked={!!selectedGleanIds[c.id]}
                      onchange={() => ontoggleGleanId(c.id)}
                      style="margin-top:3px"
                    />
                    <div class="lv-doc-text">
                      <div class="lv-doc-title">
                        《{c.title || "无标题剪藏"}》
                        {#if c.site}<span class="lv-chip sm num" style="font-size:10px;margin-left:4px">{c.site}</span>{/if}
                      </div>
                      {#if c.summary}
                        <div class="lv-muted lv-glean-summary">
                          {c.summary}
                        </div>
                      {/if}
                    </div>
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      {/if}
    </div>
  {/if}
</div>

<style lang="scss">
  .lv-siyuan-studio {
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  .lv-siyuan-card {
    background: var(--lv-surface);
    border: 1px solid var(--lv-border);
    border-radius: var(--lv-r-3, 16px);
    box-shadow: var(--lv-sh-1);
    padding: var(--lv-space-4, 16px);
  }

  /* 二级分面胶囊切换栏 */
  .lv-siyuan-subtabs {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px;
    background: var(--lv-surface-2, var(--lv-surface));
    border-radius: var(--lv-r-2, 10px);
    border: 1px solid var(--lv-border-subtle);
    margin-bottom: 14px;
    overflow-x: auto;
    scrollbar-width: none;

    .lv-sub-pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 14px;
      font-size: 12.5px;
      font-weight: 500;
      border-radius: var(--lv-r-1, 6px);
      border: 1px solid transparent;
      color: var(--lv-text-2, var(--lv-text-2));
      background: transparent;
      cursor: pointer;
      transition: all 0.15s ease;
      white-space: nowrap;

      &:hover {
        background: var(--lv-surface);
        color: var(--lv-text);
      }

      &.acc {
        background: var(--lv-brand, var(--lv-accent));
        color: var(--lv-on-brand, #ffffff);
        font-weight: 600;
        box-shadow: var(--lv-sh-1);
      }
    }
  }

  /* 指引提示卡 */
  .lv-guide-card {
    margin: 2px 0 8px;
    padding: 12px 14px;
    background: color-mix(in srgb, var(--lv-accent-soft, rgba(66, 133, 244, 0.08)) 30%, var(--lv-surface));
    border-left: 4px solid var(--lv-brand, var(--lv-accent));
    border-radius: var(--lv-r-2, 8px);
    box-shadow: var(--lv-sh-subtle, none);

    .lv-guide-title {
      display: flex;
      align-items: center;
      gap: 6px;
      color: var(--lv-text, var(--lv-text-2));
      font-size: 13px;
      margin-bottom: 4px;
    }

    .lv-guide-desc {
      font-size: 12px;
      line-height: 1.6;
      color: var(--lv-text-2, var(--lv-text-2));
      margin: 0;

      code {
        padding: 1px 4px;
        background: var(--lv-surface-2);
        border-radius: 3px;
        font-family: var(--b3-font-family-code, monospace);
        font-size: 11px;
      }
    }

    .lv-guide-safety {
      margin-top: 6px;
      font-size: 11px;
      color: var(--lv-success, #10b981);
      display: flex;
      align-items: center;
      gap: 4px;
    }
  }

  /* 场景预设模式行 */
  .lv-profile-row {
    margin: 6px 0 10px;
    gap: 6px;
    align-items: center;
    flex-wrap: wrap;

    .lv-profile-chip {
      font-size: 11.5px;
      padding: 3px 10px;
      border-radius: var(--lv-r-pill, 999px);
      cursor: pointer;
      border: 1px solid var(--lv-border-subtle);
      background: var(--lv-surface);
      color: var(--lv-text-2);
      transition: all 0.15s ease;

      &:hover {
        border-color: var(--lv-brand);
        color: var(--lv-brand);
      }

      &.acc {
        background: var(--lv-brand);
        color: var(--lv-on-brand, #ffffff);
        border-color: var(--lv-brand);
        font-weight: 600;
      }
    }
  }

  /* 搜索栏 */
  .lv-search-row {
    margin: 0 0 10px;
    gap: 8px;
    align-items: center;

    .lv-search-wrap {
      position: relative;
      flex: 1;
      display: flex;
      align-items: center;

      .lv-search-icon {
        position: absolute;
        left: 10px;
        pointer-events: none;
        color: var(--lv-text-3, var(--lv-text-2));
        display: flex;
        align-items: center;
      }

      .lv-search-input {
        width: 100%;
        padding-left: 32px;
        padding-right: 32px;
        height: 34px;
        border-radius: var(--lv-r-2, 8px);
        background: var(--lv-surface);
        border: 1px solid var(--lv-border);
        color: var(--lv-text);
        box-sizing: border-box;

        &:focus {
          border-color: var(--lv-brand);
        }
      }

      .lv-search-clear {
        position: absolute;
        right: 4px;
        padding: 0;
        min-width: 26px;
        min-height: 26px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border-radius: 4px;
        color: var(--lv-text-3);

        &:hover {
          color: var(--lv-text);
        }
      }
    }
  }

  /* 文档列表容器 */
  .lv-doc-list-box {
    max-height: 380px;
    overflow-y: auto;
    border: 1px solid var(--lv-border);
    border-radius: var(--lv-r-2, 10px);
    padding: 6px;
    background: var(--lv-surface);
    scrollbar-width: thin;
  }

  .lv-doc-empty {
    padding: 32px 16px;
    text-align: center;
    font-size: 13px;
  }

  .lv-batch-action-bar {
    justify-content: space-between;
    align-items: center;
    padding: 8px 12px;
    margin-bottom: 6px;
    background: var(--lv-surface-2);
    border-radius: var(--lv-r-2, 8px);
    border: 1px solid var(--lv-border-subtle);
    flex-wrap: wrap;
    gap: 8px;

    .lv-select-all-chip {
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 11.5px;
    }

    .lv-checkbox-stub {
      display: inline-block;
      width: 11px;
      height: 11px;
      border: 1.5px solid currentColor;
      border-radius: 2px;
    }

    .lv-doc-count-label {
      font-size: 11.5px;
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }
  }

  /* 每一张文档卡片 */
  .lv-doc-card {
    justify-content: space-between;
    align-items: center;
    padding: 8px 12px;
    border-bottom: 1px solid var(--lv-border-subtle);
    gap: 10px;
    transition: background 0.15s ease;

    &:last-child {
      border-bottom: none;
    }

    &:hover {
      background: var(--lv-surface-2);
    }

    .lv-doc-info {
      display: flex;
      align-items: center;
      gap: 10px;
      flex: 1;
      min-width: 0;

      input[type="checkbox"] {
        cursor: pointer;
        width: 15px;
        height: 15px;
        flex-shrink: 0;
      }

      .lv-doc-text {
        flex: 1;
        min-width: 0;

        .lv-doc-title {
          font-size: 13px;
          color: var(--lv-text);
          display: block;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-weight: 600;
        }

        .lv-doc-path {
          font-size: 11px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          margin-top: 2px;
        }
      }
    }

    .lv-doc-actions {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-shrink: 0;
    }
  }

  /* 标签块卡片 */
  .lv-tag-block-card {
    padding: 8px 12px;
    border-bottom: 1px solid var(--lv-border-subtle);

    &:hover {
      background: var(--lv-surface-2);
    }

    .lv-tag-block-content {
      font-size: 12.5px;
      line-height: 1.55;
      color: var(--lv-text);
    }

    .lv-tag-block-path {
      font-size: 11px;
      margin-top: 3px;
    }
  }

  .lv-glean-summary {
    font-size: 11.5px;
    margin-top: 3px;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    line-height: 1.5;
  }
</style>
