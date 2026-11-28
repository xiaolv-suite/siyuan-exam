<script lang="ts">
  import { untrack } from "svelte";
  import { showMessage } from "@/libs/notice";
  import Icon from "../shared/Icon.svelte";
  import type { BankInfo } from "../../app";
  import type { BankCategory } from "@/core/bankCategory";
  import { handleTablistKeydown } from "./services/practiceKeyboardService";
  import {
    type BankCategoryFilter,
    type BankMetrics,
    type BankSortMode,
    type BankViewMode,
    filterAndSortBanks,
    formatBankCategoryTagLabel,
    loadBankRecentMap,
    loadBankSortMode,
    loadBankViewMode,
    loadPinnedBankIds,
    recordBankRecentUse,
    saveBankSortMode,
    saveBankViewMode,
    summarizeBankMetrics,
    togglePinnedBankId,
  } from "./services/bankStatsService";
  import type { SampleBankKind } from "./services/bankLifecycleService";

  interface Props {
    banks: BankInfo[];
    activeBankId: string;
    bankMetrics?: Record<string, BankMetrics>;
    metricsRefreshing?: boolean;
    creating: boolean;
    offline: boolean;
    readLocal: (k: string) => string | null;
    writeLocal: (k: string, v: string) => void;
    t: (k: string, fb?: string) => string;
    onenterBank: (id: string) => Promise<void> | void;
    oncreateBank: (name: string, category: BankCategory, goImport?: boolean) => Promise<boolean>;
    oncreateSampleBank: (kind: SampleBankKind) => void;
    onrenameBank: (id: string, newName: string) => Promise<void>;
    onsetBankCategory: (id: string, category: BankCategory) => Promise<void>;
    onsyncBankToDoc: (id: string) => Promise<void>;
    onremoveBank: (id: string) => Promise<void>;
    onimportToBank: (id?: string) => Promise<void> | void;
    onopenMarketplace: () => void;
    onrefreshMetrics?: () => void;
  }

  let {
    banks,
    activeBankId,
    bankMetrics = {},
    metricsRefreshing = false,
    creating,
    offline,
    readLocal,
    writeLocal,
    onenterBank,
    oncreateBank,
    oncreateSampleBank,
    onrenameBank,
    onsetBankCategory,
    onsyncBankToDoc,
    onremoveBank,
    onimportToBank,
    onopenMarketplace,
    onrefreshMetrics,
  }: Props = $props();

  let filterCategory = $state<BankCategoryFilter>("all");
  let filterKeyword = $state("");
  let sortMode = $state<BankSortMode>("recent");
  let viewMode = $state<BankViewMode>("grid");
  let pinnedIds = $state<string[]>([]);
  let recentMap = $state<Record<string, number>>({});
  let prefsLoaded = false;
  let lastRecordedActiveId = "";

  // 就地新建空题库状态
  let createOpen = $state(false);
  let createName = $state("");
  let createCategory = $state<BankCategory>("general");
  let createError = $state("");

  // 行内重命名 / 分类切换 / 更多菜单 / 编码查看
  let renamingBankId = $state("");
  let renameInputName = $state("");
  let categoryPickerBankId = $state("");
  let openMoreId = $state("");
  let fixedMenuStyle = $state("");
  let revealedCodeId = $state("");
  let busyBankId = $state("");

  $effect(() => {
    if (!prefsLoaded) {
      prefsLoaded = true;
      untrack(() => {
        pinnedIds = loadPinnedBankIds(readLocal);
        recentMap = loadBankRecentMap(readLocal);
        viewMode = loadBankViewMode(readLocal);
        sortMode = loadBankSortMode(readLocal);
      });
    }
  });

  $effect(() => {
    const id = activeBankId;
    if (id && prefsLoaded && id !== lastRecordedActiveId) {
      lastRecordedActiveId = id;
      untrack(() => {
        recentMap = recordBankRecentUse(recentMap, id, Date.now(), writeLocal);
      });
    }
  });

  $effect(() => {
    if (!openMoreId || typeof window === "undefined") return;
    const onWinKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        openMoreId = "";
      }
    };
    const onWinClick = () => {
      openMoreId = "";
    };
    const onWinScrollOrResize = () => {
      if (viewMode === "list") openMoreId = "";
    };
    window.addEventListener("keydown", onWinKey, true);
    window.addEventListener("click", onWinClick);
    window.addEventListener("scroll", onWinScrollOrResize, true);
    window.addEventListener("resize", onWinScrollOrResize);
    return () => {
      window.removeEventListener("keydown", onWinKey, true);
      window.removeEventListener("click", onWinClick);
      window.removeEventListener("scroll", onWinScrollOrResize, true);
      window.removeEventListener("resize", onWinScrollOrResize);
    };
  });

  const pinnedSet = $derived(new Set(pinnedIds));

  const filteredBanks = $derived(
    filterAndSortBanks(banks, bankMetrics, {
      category: filterCategory,
      keyword: filterKeyword,
      sortBy: sortMode,
      pinnedIds,
      recentMap,
      activeBankId,
    }),
  );

  const summary = $derived(summarizeBankMetrics(banks, bankMetrics));

  const categoryTabs: Array<{ id: BankCategoryFilter; label: string }> = [
    { id: "all", label: "全部" },
    { id: "exam", label: "资格考证" },
    { id: "higher", label: "升学学术" },
    { id: "language", label: "语言" },
    { id: "teaching", label: "教研" },
    { id: "general", label: "通识" },
  ];

  const categoryChoices: Array<{ id: BankCategory; label: string }> = [
    { id: "general", label: "通识" },
    { id: "exam", label: "备考" },
    { id: "certificate", label: "考证" },
    { id: "higher", label: "学术" },
    { id: "k12", label: "基础" },
    { id: "language", label: "语言" },
    { id: "teaching", label: "教研" },
  ];

  function handleSetViewMode(mode: BankViewMode) {
    viewMode = mode;
    saveBankViewMode(writeLocal, mode);
    openMoreId = "";
  }

  function handleSortChange(mode: BankSortMode) {
    sortMode = mode;
    saveBankSortMode(writeLocal, mode);
  }

  function handleTogglePin(id: string) {
    pinnedIds = togglePinnedBankId(pinnedIds, id, writeLocal);
    openMoreId = "";
  }

  async function handleEnterBank(id: string) {
    if (busyBankId) return;
    busyBankId = id;
    openMoreId = "";
    try {
      recentMap = recordBankRecentUse(recentMap, id, Date.now(), writeLocal);
      await onenterBank(id);
    } finally {
      busyBankId = "";
    }
  }

  async function submitCreate(goImport = false) {
    const trimmed = createName.trim();
    if (!trimmed) {
      createError = "请输入题库名称";
      return;
    }
    createError = "";
    const ok = await oncreateBank(trimmed, createCategory, goImport);
    if (ok) {
      createName = "";
      createCategory = "general";
      createOpen = false;
    }
  }

  function startRename(b: BankInfo) {
    openMoreId = "";
    categoryPickerBankId = "";
    renamingBankId = b.id;
    renameInputName = b.name;
  }

  async function submitRename(id: string) {
    const trimmed = renameInputName.trim();
    if (!trimmed) return;
    await onrenameBank(id, trimmed);
    renamingBankId = "";
  }

  function openCategoryPicker(id: string) {
    openMoreId = "";
    renamingBankId = "";
    categoryPickerBankId = categoryPickerBankId === id ? "" : id;
  }

  async function pickCategory(id: string, cat: BankCategory) {
    categoryPickerBankId = "";
    await onsetBankCategory(id, cat);
  }

  function copyBankUri(b: BankInfo): void {
    openMoreId = "";
    const uri = `siyuan://plugins/siyuan-exam?bank=${b.id}`;
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard
        .writeText(uri)
        .then(() => {
          showMessage(`已复制题库专属跳转链接：${uri}`, 2600, "info");
        })
        .catch(() => {
          showMessage(`链接：${uri}`, 4000, "info");
        });
    } else {
      showMessage(`链接：${uri}`, 4000, "info");
    }
  }

  function toggleMore(id: string, ev: MouseEvent) {
    ev.stopPropagation();
    if (openMoreId === id) {
      openMoreId = "";
      fixedMenuStyle = "";
      return;
    }
    const trigger = ev.currentTarget as HTMLElement | null;
    if (trigger && typeof window !== "undefined") {
      const rect = trigger.getBoundingClientRect();
      const menuWidth = 216;
      const estMenuHeight = 256;
      const vw = window.innerWidth || 1280;
      const vh = window.innerHeight || 720;
      const spaceBelow = vh - rect.bottom - 8;
      const openUp = spaceBelow < estMenuHeight && rect.top > spaceBelow;
      const left = Math.max(8, Math.min(rect.right - menuWidth, vw - menuWidth - 8));
      const verticalPos = openUp
        ? `bottom:${Math.max(8, Math.round(vh - rect.top + 4))}px;top:auto;`
        : `top:${Math.min(Math.round(rect.bottom + 4), Math.max(8, vh - 120))}px;bottom:auto;`;
      fixedMenuStyle = `position:fixed;left:${Math.round(left)}px;right:auto;${verticalPos}min-width:${menuWidth}px;max-height:calc(100vh - 24px);overflow-y:auto;z-index:1200;`;
    } else {
      fixedMenuStyle = "";
    }
    openMoreId = id;
  }

  function revealCode(b: BankInfo) {
    openMoreId = "";
    revealedCodeId = revealedCodeId === b.id ? "" : b.id;
  }

  function copyRawId(id: string) {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard
        .writeText(id)
        .then(() => showMessage("已复制题库内部编码", 2000, "info"))
        .catch(() => showMessage(`编码：${id}`, 3500, "info"));
    } else {
      showMessage(`编码：${id}`, 3500, "info");
    }
  }

  function formatRecentLabel(b: BankInfo): string {
    const ts = recentMap[b.id] ?? b.createdAt;
    if (!ts) return "本地题库";
    const diffDays = Math.floor((Date.now() - ts) / 86_400_000);
    if (b.id === activeBankId && diffDays <= 0) return "当前使用 · 今天";
    if (diffDays <= 0) return "今天使用";
    if (diffDays === 1) return "昨天使用";
    if (diffDays < 30) return `${diffDays} 天前`;
    return new Date(ts).toLocaleDateString();
  }

  function catClass(cat?: string | null): string {
    switch (cat) {
      case "exam":
      case "certificate":
        return "is-exam";
      case "higher":
      case "k12":
        return "is-higher";
      case "language":
        return "is-language";
      case "teaching":
        return "is-teaching";
      default:
        return "is-general";
    }
  }

  function formatMetricValue(m: BankMetrics | undefined, field: "total" | "due" | "wrong"): string {
    if (!m || m.status === "loading") return "…";
    if (m.status === "error" || m[field] === null) return "未统计";
    return String(m[field]);
  }
</script>

<div class="lv-bm-page">
  <!-- 顶部汇总与操作栏 -->
  <header class="lv-bm-header">
    <div class="lv-bm-title-wrap">
      <span class="lv-eyebrow lv-bm-eyebrow">题库管理中心</span>
      <div class="lv-bm-title-row">
        <h1 class="lv-bm-title">题库管理</h1>
        <span class="lv-bm-summary num">
          共 {summary.bankCount} 个题库 · {summary.totalQuestions.toLocaleString()} 题 · 待复习 {summary.totalDue}
          {#if summary.hasUncounted && summary.bankCount > 0}
            <span class="lv-bm-summary-sub">（已统计 {summary.countedBanks}/{summary.bankCount}）</span>
          {/if}
        </span>
      </div>
      <p class="lv-bm-subtitle">先浏览与整理全部题库，点击「进入题库」即可激活并查看该库试题。</p>
    </div>

    <div class="lv-bm-cta-group">
      <button
        type="button"
        class="lv-btn lv-btn--primary sm"
        onclick={() => {
          createOpen = !createOpen;
          createError = "";
        }}
        disabled={offline}
      >
        <Icon name="plus" size={14} />
        <span>新建题库</span>
      </button>
      <button
        type="button"
        class="lv-btn sm"
        onclick={() => void onimportToBank(activeBankId || undefined)}
        disabled={!banks.length}
        title={banks.length ? "向当前题库批量导入试题" : "请先新建一个题库"}
      >
        <Icon name="import" size={14} />
        <span>导入题目</span>
      </button>
      <button type="button" class="lv-btn sm" onclick={onopenMarketplace}>
        <Icon name="sparkles" size={14} />
        <span>题库集市</span>
      </button>
      {#if onrefreshMetrics}
        <button
          type="button"
          class="lv-btn sm lv-btn--ghost lv-bm-refresh-btn"
          onclick={onrefreshMetrics}
          disabled={metricsRefreshing}
          aria-busy={metricsRefreshing}
          title="刷新各题库题量与待复习统计"
          aria-label="刷新统计"
        >
          <Icon name="rotate" size={14} />
        </button>
      {/if}
    </div>
  </header>

  <!-- 就地新建空题库表单 -->
  {#if createOpen}
    <section class="lv-bm-create-panel" aria-label="新建空题库">
      <div class="lv-bm-create-row">
        <input
          type="text"
          class="lv-input lv-bm-create-input"
          bind:value={createName}
          placeholder="输入新题库名称（如：教师资格证 · 综合素质）"
          aria-label="新题库名称"
          onkeydown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void submitCreate(false);
            } else if (e.key === "Escape") {
              createOpen = false;
            }
          }}
        />
        <select class="lv-select sm lv-bm-create-cat" bind:value={createCategory} aria-label="题库场景分类">
          {#each categoryChoices as c (c.id)}
            <option value={c.id}>{c.label}</option>
          {/each}
        </select>
        <div class="lv-bm-create-actions">
          <button type="button" class="lv-btn lv-btn--primary sm" disabled={creating || offline} onclick={() => void submitCreate(false)}>
            {creating ? "创建中…" : "创建空题库"}
          </button>
          <button type="button" class="lv-btn sm" disabled={creating || offline} onclick={() => void submitCreate(true)}>
            创建并导入
          </button>
          <button type="button" class="lv-btn sm lv-btn--ghost" onclick={() => { createOpen = false; createError = ""; }}>
            取消
          </button>
        </div>
      </div>
      {#if createError}
        <div class="lv-error" role="alert" style="margin-top:8px">{createError}</div>
      {/if}
    </section>
  {/if}

  <!-- 单行紧凑筛选工具条 -->
  <div class="lv-bm-toolbar">
    <div class="lv-bm-search-wrap">
      <span class="lv-bm-search-icon" aria-hidden="true">
        <Icon name="search" size={14} />
      </span>
      <input
        type="text"
        class="lv-input lv-bm-search-input"
        bind:value={filterKeyword}
        placeholder="搜索题库名称…"
        aria-label="搜索题库名称"
      />
      {#if filterKeyword}
        <button
          type="button"
          class="lv-bm-search-clear"
          onclick={() => (filterKeyword = "")}
          title="清空搜索"
          aria-label="清空搜索"
        >
          <Icon name="close" size={12} />
        </button>
      {/if}
    </div>

    <div class="lv-bm-cat-pills" role="tablist" tabindex="-1" aria-label="按分类筛选题库" onkeydown={handleTablistKeydown}>
      {#each categoryTabs as tab (tab.id)}
        <button
          type="button"
          role="tab"
          tabindex={filterCategory === tab.id ? 0 : -1}
          aria-selected={filterCategory === tab.id}
          class="lv-bm-cat-pill"
          class:active={filterCategory === tab.id}
          onclick={() => (filterCategory = tab.id)}
        >
          {tab.label}
        </button>
      {/each}
    </div>

    <div class="lv-bm-toolbar-right">
      <select
        class="lv-select sm lv-bm-sort-select"
        aria-label="题库排序方式"
        value={sortMode}
        onchange={(e) => handleSortChange((e.target as HTMLSelectElement).value as BankSortMode)}
      >
        <option value="recent">最近使用</option>
        <option value="count">题量最多</option>
        <option value="name">按名称</option>
      </select>

      <div class="lv-bm-seg" role="group" aria-label="视图模式切换">
        <button
          type="button"
          class="lv-bm-seg-btn"
          class:active={viewMode === "grid"}
          aria-pressed={viewMode === "grid"}
          onclick={() => handleSetViewMode("grid")}
        >
          网格
        </button>
        <button
          type="button"
          class="lv-bm-seg-btn"
          class:active={viewMode === "list"}
          aria-pressed={viewMode === "list"}
          onclick={() => handleSetViewMode("list")}
        >
          清单
        </button>
      </div>
    </div>
  </div>

  <!-- 主题库列表 -->
  {#if banks.length === 0}
    <section class="lv-bm-empty" role="status">
      <div class="lv-bm-empty-icon"><Icon name="folder" size={28} /></div>
      <h2>还没有题库</h2>
      <p>每个题库对应思源笔记中的独立数据集合。你可以立即新建一个空题库、从集市克隆公版题库，或展开下方内置示例体验。</p>
      <div class="lv-bm-empty-actions">
        <button type="button" class="lv-btn lv-btn--primary sm" onclick={() => (createOpen = true)} disabled={offline}>
          <Icon name="plus" size={14} /> 新建空题库
        </button>
        <button type="button" class="lv-btn sm" onclick={onopenMarketplace}>
          <Icon name="sparkles" size={14} /> 逛逛题库集市
        </button>
      </div>
    </section>
  {:else if filteredBanks.length === 0}
    <section class="lv-bm-empty" role="status">
      <div class="lv-bm-empty-icon"><Icon name="search" size={26} /></div>
      <h2>没有找到匹配的题库</h2>
      <p>可以调整关键词或分类筛选条件，或直接新建一个题库。</p>
      <div class="lv-bm-empty-actions">
        <button
          type="button"
          class="lv-btn sm"
          onclick={() => {
            filterCategory = "all";
            filterKeyword = "";
          }}
        >
          清空筛选条件
        </button>
        <button type="button" class="lv-btn lv-btn--primary sm" onclick={() => (createOpen = true)} disabled={offline}>
          <Icon name="plus" size={14} /> 新建题库
        </button>
      </div>
    </section>
  {:else if viewMode === "grid"}
    <div class="lv-bm-grid" role="region" aria-label="题库卡片网格">
      {#each filteredBanks as b (b.id)}
        {@const metrics = bankMetrics[b.id]}
        {@const isCurrent = b.id === activeBankId}
        {@const isPinned = pinnedSet.has(b.id)}
        <article class="lv-bm-card" class:is-current={isCurrent}>
          <div class="lv-bm-card-top">
            <div class="lv-bm-title-block">
              {#if renamingBankId === b.id}
                <div class="lv-bm-inline-edit">
                  <input
                    type="text"
                    class="lv-input sm"
                    bind:value={renameInputName}
                    placeholder="输入新题库名称…"
                    aria-label="输入新题库名称"
                    onkeydown={(e) => {
                      if (e.key === "Enter") void submitRename(b.id);
                      else if (e.key === "Escape") renamingBankId = "";
                    }}
                  />
                  <button type="button" class="lv-btn lv-btn--primary sm" onclick={() => void submitRename(b.id)}>保存</button>
                  <button type="button" class="lv-btn sm lv-btn--ghost" onclick={() => (renamingBankId = "")}>取消</button>
                </div>
              {:else}
                <h3 class="lv-bm-card-title" title={b.name}>{b.name}</h3>
                <div class="lv-bm-meta-row">
                  <span class={`lv-bm-cat-tag ${catClass(b.category)}`}>
                    {formatBankCategoryTagLabel(b.category)}
                  </span>
                  {#if isCurrent}
                    <span class="lv-bm-pill lv-bm-pill--brand">当前使用</span>
                  {/if}
                  {#if metrics?.status === "ready" && metrics.total === 0}
                    <span class="lv-bm-pill lv-bm-pill--muted">空题库</span>
                  {:else if metrics?.status === "error"}
                    <span class="lv-bm-pill lv-bm-pill--muted">暂未统计</span>
                  {/if}
                </div>
              {/if}
            </div>

            <button
              type="button"
              class="lv-bm-pin-btn"
              class:pinned={isPinned}
              title={isPinned ? "取消置顶" : "置顶题库"}
              aria-label={isPinned ? `取消置顶 ${b.name}` : `置顶 ${b.name}`}
              aria-pressed={isPinned}
              onclick={() => handleTogglePin(b.id)}
            >
              <Icon name="star" size={14} />
            </button>
          </div>

          {#if categoryPickerBankId === b.id}
            <div class="lv-bm-cat-picker" role="group" aria-label="选择题库分类">
              <span class="lv-bm-cat-picker-label">切换分类：</span>
              {#each categoryChoices as c (c.id)}
                <button
                  type="button"
                  class="lv-bm-cat-pill"
                  class:active={(b.category || "general") === c.id}
                  onclick={() => void pickCategory(b.id, c.id)}
                >
                  {c.label}
                </button>
              {/each}
            </div>
          {/if}

          {#if revealedCodeId === b.id}
            <div class="lv-bm-code-bar">
              <span class="lv-bm-code-text">内部编码：<code>{b.id}</code></span>
              <button type="button" class="lv-btn sm lv-btn--ghost" onclick={() => copyRawId(b.id)}>复制</button>
              <button type="button" class="lv-btn sm lv-btn--ghost" onclick={() => (revealedCodeId = "")}>收起</button>
            </div>
          {/if}

          <div class="lv-bm-metrics">
            <div class="lv-bm-metric-cell">
              <span>总题数</span>
              <strong class="num" class:is-muted={metrics?.status !== "ready"}>
                {formatMetricValue(metrics, "total")}
              </strong>
            </div>
            <div class="lv-bm-metric-cell">
              <span>待复习</span>
              <strong
                class="num"
                class:is-due={metrics?.status === "ready" && (metrics.due ?? 0) > 0}
                class:is-muted={metrics?.status !== "ready"}
              >
                {formatMetricValue(metrics, "due")}
              </strong>
            </div>
            <div class="lv-bm-metric-cell">
              <span>错题数</span>
              <strong
                class="num"
                class:is-wrong={metrics?.status === "ready" && (metrics.wrong ?? 0) > 0}
                class:is-muted={metrics?.status !== "ready"}
              >
                {formatMetricValue(metrics, "wrong")}
              </strong>
            </div>
          </div>

          <div class="lv-bm-card-foot">
            <span class="lv-bm-foot-time">{formatRecentLabel(b)}</span>
            <div class="lv-bm-foot-actions">
              <button
                type="button"
                class="lv-btn sm"
                class:lv-btn--primary={!isCurrent}
                class:lv-bm-btn-soft={isCurrent}
                disabled={busyBankId === b.id}
                onclick={() => void handleEnterBank(b.id)}
                aria-label={isCurrent ? `进入题库 ${b.name}` : `切入题库 ${b.name}`}
              >
                {isCurrent ? "进入题库" : "切入题库"}
              </button>

              <div class="lv-bm-more-wrap">
                <button
                  type="button"
                  class="lv-btn sm"
                  aria-haspopup="menu"
                  aria-expanded={openMoreId === b.id}
                  onclick={(e) => toggleMore(b.id, e)}
                >
                  更多 ▾
                </button>
                {#if openMoreId === b.id}
                  <!-- svelte-ignore a11y_click_events_have_key_events -->
                  <div
                    class="lv-bm-more-menu lv-bm-more-menu--fixed"
                    style={fixedMenuStyle}
                    role="menu"
                    tabindex="-1"
                    onclick={(e) => e.stopPropagation()}
                  >
                    <button type="button" class="lv-bm-more-item" role="menuitem" onclick={() => startRename(b)}>
                      <span>重命名题库</span>
                    </button>
                    <button type="button" class="lv-bm-more-item" role="menuitem" onclick={() => openCategoryPicker(b.id)}>
                      <span>切换分类</span>
                    </button>
                    <button
                      type="button"
                      class="lv-bm-more-item"
                      role="menuitem"
                      onclick={() => {
                        openMoreId = "";
                        void onimportToBank(b.id);
                      }}
                    >
                      <span>导入到该题库</span>
                    </button>
                    <button type="button" class="lv-bm-more-item" role="menuitem" onclick={() => copyBankUri(b)}>
                      <span>复制快捷跳转链接</span>
                    </button>
                    <button
                      type="button"
                      class="lv-bm-more-item"
                      role="menuitem"
                      onclick={() => {
                        openMoreId = "";
                        void onsyncBankToDoc(b.id);
                      }}
                    >
                      <span>同步为思源文档（静态快照）</span>
                    </button>
                    <button type="button" class="lv-bm-more-item" role="menuitem" onclick={() => revealCode(b)}>
                      <span>{revealedCodeId === b.id ? "隐藏内部编码" : "查看内部编码"}</span>
                    </button>
                    <div class="lv-bm-more-sep" role="separator"></div>
                    <button
                      type="button"
                      class="lv-bm-more-item is-danger"
                      role="menuitem"
                      onclick={() => {
                        openMoreId = "";
                        void onremoveBank(b.id);
                      }}
                    >
                      <span>从列表移出（不删原笔记）</span>
                    </button>
                  </div>
                {/if}
              </div>
            </div>
          </div>
        </article>
      {/each}
    </div>
  {:else}
    <!-- 紧凑清单视图（20~50+ 个题库） -->
    <div class="lv-bm-list-scroll" role="region" aria-label="题库紧凑清单">
      <div class="lv-bm-list-wrap">
        <div class="lv-bm-list-head">
          <span>置顶</span>
          <span>题库名称与状态</span>
          <span>分类</span>
          <span class="num">总题数</span>
          <span class="num">待复习</span>
          <span class="num">错题</span>
          <span>操作</span>
        </div>

        {#each filteredBanks as b (b.id)}
          {@const metrics = bankMetrics[b.id]}
          {@const isCurrent = b.id === activeBankId}
          {@const isPinned = pinnedSet.has(b.id)}
          <div class="lv-bm-list-row" class:is-current={isCurrent}>
            <button
              type="button"
              class="lv-bm-pin-btn"
              class:pinned={isPinned}
              title={isPinned ? "取消置顶" : "置顶题库"}
              aria-label={isPinned ? `取消置顶 ${b.name}` : `置顶 ${b.name}`}
              aria-pressed={isPinned}
              onclick={() => handleTogglePin(b.id)}
            >
              <Icon name="star" size={14} />
            </button>

            <div class="lv-bm-list-name-wrap">
              {#if renamingBankId === b.id}
                <div class="lv-bm-inline-edit">
                  <input
                    type="text"
                    class="lv-input sm"
                    bind:value={renameInputName}
                    aria-label="输入新题库名称"
                    onkeydown={(e) => {
                      if (e.key === "Enter") void submitRename(b.id);
                      else if (e.key === "Escape") renamingBankId = "";
                    }}
                  />
                  <button type="button" class="lv-btn lv-btn--primary sm" onclick={() => void submitRename(b.id)}>保存</button>
                  <button type="button" class="lv-btn sm lv-btn--ghost" onclick={() => (renamingBankId = "")}>取消</button>
                </div>
              {:else}
                <div class="lv-bm-list-name" title={b.name}>{b.name}</div>
                <div class="lv-bm-list-sub">
                  {formatRecentLabel(b)}
                  {#if metrics?.status === "ready" && metrics.total === 0} · 空题库{/if}
                  {#if revealedCodeId === b.id} · 编码: <code>{b.id}</code>{/if}
                </div>
                {#if categoryPickerBankId === b.id}
                  <div class="lv-bm-cat-picker" style="margin-top:6px" role="group" aria-label="选择题库分类">
                    {#each categoryChoices as c (c.id)}
                      <button
                        type="button"
                        class="lv-bm-cat-pill"
                        class:active={(b.category || "general") === c.id}
                        onclick={() => void pickCategory(b.id, c.id)}
                      >
                        {c.label}
                      </button>
                    {/each}
                  </div>
                {/if}
              {/if}
            </div>

            <div>
              <span class={`lv-bm-cat-tag ${catClass(b.category)}`}>
                {formatBankCategoryTagLabel(b.category)}
              </span>
            </div>

            <div class="num">
              <strong class:is-muted={metrics?.status !== "ready"}>{formatMetricValue(metrics, "total")}</strong>
            </div>
            <div class="num lv-bm-list-metric" class:is-due={metrics?.status === "ready" && (metrics.due ?? 0) > 0}>
              {formatMetricValue(metrics, "due")}
            </div>
            <div class="num lv-bm-list-metric" class:is-wrong={metrics?.status === "ready" && (metrics.wrong ?? 0) > 0}>
              {formatMetricValue(metrics, "wrong")}
            </div>

            <div class="lv-bm-foot-actions">
              <button
                type="button"
                class="lv-btn sm"
                class:lv-btn--primary={!isCurrent}
                class:lv-bm-btn-soft={isCurrent}
                disabled={busyBankId === b.id}
                onclick={() => void handleEnterBank(b.id)}
                aria-label={`进入题库 ${b.name}`}
              >
                进入
              </button>
              <div class="lv-bm-more-wrap">
                <button
                  type="button"
                  class="lv-btn sm"
                  aria-haspopup="menu"
                  aria-expanded={openMoreId === b.id}
                  onclick={(e) => toggleMore(b.id, e)}
                >
                  更多 ▾
                </button>
                {#if openMoreId === b.id}
                  <!-- svelte-ignore a11y_click_events_have_key_events -->
                  <div
                    class="lv-bm-more-menu lv-bm-more-menu--fixed"
                    style={fixedMenuStyle}
                    role="menu"
                    tabindex="-1"
                    onclick={(e) => e.stopPropagation()}
                  >
                    <button type="button" class="lv-bm-more-item" role="menuitem" onclick={() => startRename(b)}>
                      <span>重命名题库</span>
                    </button>
                    <button type="button" class="lv-bm-more-item" role="menuitem" onclick={() => openCategoryPicker(b.id)}>
                      <span>切换分类</span>
                    </button>
                    <button
                      type="button"
                      class="lv-bm-more-item"
                      role="menuitem"
                      onclick={() => {
                        openMoreId = "";
                        void onimportToBank(b.id);
                      }}
                    >
                      <span>导入到该题库</span>
                    </button>
                    <button type="button" class="lv-bm-more-item" role="menuitem" onclick={() => copyBankUri(b)}>
                      <span>复制快捷跳转链接</span>
                    </button>
                    <button
                      type="button"
                      class="lv-bm-more-item"
                      role="menuitem"
                      onclick={() => {
                        openMoreId = "";
                        void onsyncBankToDoc(b.id);
                      }}
                    >
                      <span>同步为思源文档（静态快照）</span>
                    </button>
                    <button type="button" class="lv-bm-more-item" role="menuitem" onclick={() => revealCode(b)}>
                      <span>{revealedCodeId === b.id ? "隐藏内部编码" : "查看内部编码"}</span>
                    </button>
                    <div class="lv-bm-more-sep" role="separator"></div>
                    <button
                      type="button"
                      class="lv-bm-more-item is-danger"
                      role="menuitem"
                      onclick={() => {
                        openMoreId = "";
                        void onremoveBank(b.id);
                      }}
                    >
                      <span>从列表移出（不删原笔记）</span>
                    </button>
                  </div>
                {/if}
              </div>
            </div>
          </div>
        {/each}
      </div>
    </div>
  {/if}

  <!-- 底部默认折叠的内置示例题库 -->
  <details class="lv-bm-sample-details">
    <summary class="lv-bm-sample-summary">
      <span>内置示例题库（新手体验用，不占用上方主列表）</span>
      <span class="lv-bm-sample-hint">展开 ▾</span>
    </summary>
    <div class="lv-bm-sample-row">
      <button type="button" class="lv-btn sm" disabled={creating || offline} onclick={() => oncreateSampleBank("general")}>
        + 通用综合示例
      </button>
      <button type="button" class="lv-btn sm" disabled={creating || offline} onclick={() => oncreateSampleBank("qualification")}>
        + 职业考证示例
      </button>
      <button type="button" class="lv-btn sm" disabled={creating || offline} onclick={() => oncreateSampleBank("higher")}>
        + 大学高数示例
      </button>
      <button type="button" class="lv-btn sm" disabled={creating || offline} onclick={() => oncreateSampleBank("k12")}>
        + K12 基础示例
      </button>
      <button type="button" class="lv-btn sm" disabled={creating || offline} onclick={() => oncreateSampleBank("english")}>
        + 英语词汇示例
      </button>
      <button type="button" class="lv-btn sm" disabled={creating || offline} onclick={() => oncreateSampleBank("cantonese")}>
        + 粤语口语示例
      </button>
    </div>
  </details>
</div>

<style>
  .lv-bm-page {
    width: 100%;
    max-width: 1120px;
    margin: 0 auto;
    box-sizing: border-box;
    min-width: 0;
    padding: var(--lv-space-4) 22px var(--lv-space-9);
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .lv-bm-eyebrow {
    display: block;
    font-size: var(--lv-font-size-xs);
    letter-spacing: 1.5px;
    font-weight: var(--lv-font-weight-bold);
    color: var(--lv-brand);
    margin-bottom: var(--lv-space-2);
    text-transform: uppercase;
  }

  .lv-bm-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
  }

  .lv-bm-title-wrap {
    min-width: 0;
    flex: 1 1 280px;
  }

  .lv-bm-title-row {
    display: flex;
    align-items: baseline;
    gap: 10px;
    flex-wrap: wrap;
  }

  .lv-bm-title {
    margin: 0;
    font-size: var(--lv-font-size-h1);
    font-weight: var(--lv-font-weight-bold);
    line-height: var(--lv-line-height-tight);
    letter-spacing: -0.56px;
    color: var(--lv-text);
  }

  .lv-bm-summary {
    font-size: 12.5px;
    color: var(--lv-text-3);
  }

  .lv-bm-summary-sub {
    color: var(--lv-text-3);
    font-size: 11.5px;
  }

  .lv-bm-subtitle {
    margin: 4px 0 0;
    font-size: 12.5px;
    color: var(--lv-text-3);
    line-height: 1.5;
  }

  .lv-bm-cta-group {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .lv-bm-refresh-btn {
    padding: 0;
    min-width: 34px;
    justify-content: center;
  }

  .lv-bm-create-panel {
    background: var(--lv-surface);
    border: 1px solid var(--lv-border);
    border-radius: var(--lv-r-3, 10px);
    padding: 12px 14px;
  }

  .lv-bm-create-row {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .lv-bm-create-input {
    flex: 1 1 220px;
    min-width: 0;
  }

  .lv-bm-create-cat {
    width: auto;
    min-width: 96px;
  }

  .lv-bm-create-actions {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }

  .lv-bm-toolbar {
    min-width: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    flex-wrap: wrap;
    padding: 10px 12px;
    background: var(--lv-surface);
    border: 1px solid var(--lv-border);
    border-radius: var(--lv-r-3, 10px);
  }

  .lv-bm-search-wrap {
    position: relative;
    display: flex;
    align-items: center;
    flex: 1 1 190px;
    min-width: 170px;
  }

  .lv-bm-search-icon {
    position: absolute;
    left: 10px;
    color: var(--lv-text-3);
    display: inline-flex;
    align-items: center;
    pointer-events: none;
  }

  .lv-bm-search-input {
    width: 100%;
    height: 32px;
    min-height: 32px;
    padding: 0 28px 0 30px;
    font-size: 12.5px;
    background: var(--lv-surface-subtle, var(--lv-surface-2));
  }

  .lv-bm-search-clear {
    position: absolute;
    right: 4px;
    border: 0;
    background: transparent;
    color: var(--lv-text-3);
    width: 24px;
    height: 24px;
    border-radius: var(--lv-r-1, 6px);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
  }

  .lv-bm-search-clear:hover {
    background: var(--lv-surface-2);
    color: var(--lv-text);
  }

  .lv-bm-cat-pills {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-wrap: wrap;
  }

  .lv-bm-cat-pill {
    border: 1px solid transparent;
    background: transparent;
    color: var(--lv-text-2);
    min-height: 32px;
    display: inline-flex;
    align-items: center;
    padding: 4px 10px;
    border-radius: var(--lv-radius-pill, 999px);
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    white-space: nowrap;
  }

  .lv-bm-cat-pill:hover {
    background: var(--lv-surface-2);
    color: var(--lv-text);
  }

  .lv-bm-cat-pill.active {
    background: var(--lv-accent-soft);
    color: var(--lv-accent);
    border-color: color-mix(in srgb, var(--lv-accent) 28%, transparent);
    font-weight: 600;
  }

  .lv-bm-toolbar-right {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }

  .lv-bm-sort-select {
    height: 32px;
    min-height: 32px;
    padding: 0 8px;
    font-size: 12px;
  }

  .lv-bm-seg {
    display: inline-flex;
    background: var(--lv-surface-2);
    border: 1px solid var(--lv-border);
    border-radius: var(--lv-r-2, 8px);
    padding: 2px;
    gap: 2px;
  }

  .lv-bm-seg-btn {
    border: 1px solid transparent;
    background: transparent;
    color: var(--lv-text-2);
    padding: 4px 10px;
    border-radius: var(--lv-r-1, 6px);
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    white-space: nowrap;
  }

  .lv-bm-seg-btn.active {
    background: var(--lv-surface);
    color: var(--lv-text);
    border-color: var(--lv-border);
    font-weight: 600;
  }

  .lv-bm-empty {
    background: var(--lv-surface);
    border: 1px solid var(--lv-border);
    border-radius: var(--lv-r-card, 12px);
    padding: 32px 18px;
    text-align: center;
    color: var(--lv-text-2);
  }

  .lv-bm-empty-icon {
    color: var(--lv-text-3);
    margin-bottom: 8px;
  }

  .lv-bm-empty h2 {
    margin: 0 0 6px;
    font-size: 16px;
    color: var(--lv-text);
  }

  .lv-bm-empty p {
    margin: 0 auto 14px;
    max-width: 480px;
    font-size: 12.5px;
    color: var(--lv-text-3);
    line-height: 1.55;
  }

  .lv-bm-empty-actions {
    display: flex;
    justify-content: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  /* 卡片网格 */
  .lv-bm-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }

  .lv-bm-card {
    background: var(--lv-surface);
    border: 1px solid var(--lv-border);
    border-radius: var(--lv-r-card, 12px);
    padding: 14px 16px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-width: 0;
    position: relative;
  }

  .lv-bm-card:hover {
    border-color: var(--lv-border-hover, var(--lv-ctl-border));
  }

  .lv-bm-card.is-current {
    border-color: var(--lv-accent);
    background: color-mix(in srgb, var(--lv-accent-soft) 50%, var(--lv-surface));
  }

  .lv-bm-card-top {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 10px;
  }

  .lv-bm-title-block {
    min-width: 0;
    flex: 1;
  }

  .lv-bm-card-title {
    margin: 0;
    font-size: 14.5px;
    font-weight: 600;
    color: var(--lv-text);
    line-height: 1.4;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    overflow-wrap: anywhere;
  }

  .lv-bm-meta-row {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
    margin-top: 6px;
  }

  .lv-bm-cat-tag {
    display: inline-flex;
    align-items: center;
    font-size: 11px;
    font-weight: 600;
    padding: 2px 7px;
    border-radius: var(--lv-r-1, 6px);
    white-space: nowrap;
  }

  .lv-bm-cat-tag.is-exam {
    background: var(--lv-scene-exam-soft);
    color: var(--lv-data-deep, var(--lv-scene-exam));
  }

  .lv-bm-cat-tag.is-higher {
    background: var(--lv-accent-soft);
    color: var(--lv-accent-deep, var(--lv-accent));
  }

  .lv-bm-cat-tag.is-language {
    background: var(--lv-scene-teach-soft);
    color: var(--lv-green-deep, var(--lv-scene-teach));
  }

  .lv-bm-cat-tag.is-teaching {
    background: var(--lv-amber-soft);
    color: var(--lv-amber-deep, var(--lv-amber));
  }

  .lv-bm-cat-tag.is-general {
    background: var(--lv-surface-2);
    color: var(--lv-text-2);
  }

  .lv-bm-pill {
    display: inline-flex;
    align-items: center;
    font-size: 11px;
    font-weight: 600;
    padding: 2px 8px;
    border-radius: var(--lv-radius-pill, 999px);
    white-space: nowrap;
  }

  .lv-bm-pill--brand {
    background: var(--lv-accent-soft);
    color: var(--lv-accent);
    border: 1px solid color-mix(in srgb, var(--lv-accent) 26%, transparent);
  }

  .lv-bm-pill--muted {
    background: var(--lv-surface-2);
    color: var(--lv-text-3);
    border: 1px solid var(--lv-border);
  }

  .lv-bm-pin-btn {
    border: 1px solid transparent;
    background: transparent;
    color: var(--lv-text-3);
    width: 28px;
    height: 28px;
    border-radius: var(--lv-r-1, 6px);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    flex-shrink: 0;
  }

  .lv-bm-pin-btn:hover {
    background: var(--lv-surface-2);
    color: var(--lv-text);
  }

  .lv-bm-pin-btn.pinned {
    color: var(--lv-amber);
    background: var(--lv-amber-soft);
    border-color: color-mix(in srgb, var(--lv-amber) 32%, transparent);
  }

  .lv-bm-inline-edit {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }

  .lv-bm-inline-edit .lv-input {
    flex: 1 1 140px;
    min-width: 0;
  }

  .lv-bm-cat-picker {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-wrap: wrap;
    padding: 6px 8px;
    border-radius: var(--lv-r-2, 8px);
    background: var(--lv-surface-2);
    border: 1px solid var(--lv-border);
  }

  .lv-bm-cat-picker-label {
    font-size: 11px;
    color: var(--lv-text-3);
  }

  .lv-bm-code-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    padding: 6px 10px;
    border-radius: var(--lv-r-2, 8px);
    background: var(--lv-surface-2);
    border: 1px solid var(--lv-border);
    font-size: 11.5px;
    color: var(--lv-text-2);
  }

  .lv-bm-code-text {
    flex: 1;
    min-width: 0;
    overflow-wrap: anywhere;
  }

  .lv-bm-metrics {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
    padding: 8px 10px;
    background: var(--lv-surface-subtle, var(--lv-surface-2));
    border: 1px solid var(--lv-border);
    border-radius: var(--lv-r-2, 8px);
  }

  .lv-bm-metric-cell span {
    display: block;
    font-size: 11px;
    color: var(--lv-text-3);
  }

  .lv-bm-metric-cell strong {
    display: block;
    font-size: 14px;
    font-weight: 700;
    color: var(--lv-text);
  }

  .lv-bm-metric-cell strong.is-due {
    color: var(--lv-accent);
  }

  .lv-bm-metric-cell strong.is-wrong {
    color: var(--lv-red);
  }

  .lv-bm-metric-cell strong.is-muted {
    font-weight: 500;
    color: var(--lv-text-3);
    font-size: 12.5px;
  }

  .lv-bm-card-foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    flex-wrap: wrap;
    padding-top: 2px;
  }

  .lv-bm-foot-time {
    font-size: 11.5px;
    color: var(--lv-text-3);
  }

  .lv-bm-foot-actions {
    display: flex;
    align-items: center;
    gap: 6px;
    position: relative;
  }

  .lv-bm-btn-soft {
    background: var(--lv-accent-soft);
    border-color: color-mix(in srgb, var(--lv-accent) 32%, transparent);
    color: var(--lv-accent);
    font-weight: 600;
  }

  /* 紧凑清单视图 */
  .lv-bm-list-scroll {
    max-width: 100%;
    overflow-x: auto;
  }

  .lv-bm-list-wrap {
    background: var(--lv-surface);
    border: 1px solid var(--lv-border);
    border-radius: var(--lv-r-3, 10px);
    overflow: visible;
  }

  .lv-bm-list-head,
  .lv-bm-list-row {
    display: grid;
    grid-template-columns: 32px minmax(160px, 1.8fr) 68px 64px 64px 60px 140px;
    align-items: center;
    gap: 8px;
    padding: 9px 12px;
  }

  .lv-bm-list-head {
    background: var(--lv-surface-subtle, var(--lv-surface-2));
    border-bottom: 1px solid var(--lv-border);
    font-size: 11.5px;
    font-weight: 600;
    color: var(--lv-text-3);
    border-radius: var(--lv-r-3, 10px) var(--lv-r-3, 10px) 0 0;
  }

  .lv-bm-list-row {
    border-bottom: 1px solid var(--lv-border);
    font-size: 12.5px;
    position: relative;
  }

  .lv-bm-list-row:last-child {
    border-bottom: 0;
    border-radius: 0 0 var(--lv-r-3, 10px) var(--lv-r-3, 10px);
  }

  .lv-bm-list-row.is-current {
    background: color-mix(in srgb, var(--lv-accent-soft) 45%, var(--lv-surface));
  }

  .lv-bm-list-name-wrap {
    min-width: 0;
  }

  .lv-bm-list-name {
    font-weight: 600;
    color: var(--lv-text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .lv-bm-list-sub {
    font-size: 11px;
    color: var(--lv-text-3);
  }

  .lv-bm-list-metric {
    color: var(--lv-text-2);
  }

  .lv-bm-list-metric.is-due {
    color: var(--lv-accent);
    font-weight: 600;
  }

  .lv-bm-list-metric.is-wrong {
    color: var(--lv-red);
    font-weight: 600;
  }

  /* 更多菜单浮层 */
  .lv-bm-more-wrap {
    position: relative;
  }

  .lv-bm-more-menu {
    position: absolute;
    right: 0;
    top: calc(100% + 4px);
    min-width: 204px;
    background: var(--lv-surface);
    border: 1px solid var(--lv-ctl-border, var(--lv-border));
    border-radius: var(--lv-r-3, 10px);
    padding: 5px;
    z-index: 40;
    box-shadow: var(--lv-sh-2);
  }

  .lv-bm-more-menu.is-up {
    top: auto;
    bottom: calc(100% + 4px);
  }

  .lv-bm-more-menu--fixed {
    position: fixed;
    z-index: 1200;
  }

  .lv-bm-more-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 7px 9px;
    border: 0;
    background: transparent;
    border-radius: var(--lv-r-1, 6px);
    font-size: 12px;
    color: var(--lv-text);
    text-align: left;
    cursor: pointer;
  }

  .lv-bm-more-item:hover {
    background: var(--lv-surface-2);
  }

  .lv-bm-more-item.is-danger {
    color: var(--lv-red);
  }

  .lv-bm-more-item.is-danger:hover {
    background: var(--lv-red-soft);
  }

  .lv-bm-more-sep {
    height: 1px;
    background: var(--lv-border);
    margin: 4px 0;
  }

  /* 底部折叠示例题库 */
  .lv-bm-sample-details {
    border: 1px solid var(--lv-border);
    border-radius: var(--lv-r-3, 10px);
    background: var(--lv-surface);
    padding: 10px 14px;
  }

  .lv-bm-sample-summary {
    cursor: pointer;
    font-size: 12.5px;
    font-weight: 500;
    color: var(--lv-text-2);
    list-style: none;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .lv-bm-sample-summary::-webkit-details-marker {
    display: none;
  }

  .lv-bm-sample-hint {
    white-space: nowrap;
    flex-shrink: 0;
    color: var(--lv-text-3);
  }

  .lv-bm-sample-row {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    margin-top: 10px;
    padding-top: 10px;
    border-top: 1px solid var(--lv-border);
  }

  @container lv-exam (max-width: 820px) {
    .lv-bm-grid {
      grid-template-columns: minmax(0, 1fr);
    }

    .lv-bm-list-scroll {
      overflow-x: auto;
      max-width: 100%;
    }

    .lv-bm-list-wrap {
      min-width: 580px;
      width: 100%;
    }

    .lv-bm-list-head,
    .lv-bm-list-row {
      grid-template-columns: 28px minmax(130px, 1.5fr) 56px 52px 52px 48px 132px;
      gap: 6px;
      padding: 9px 10px;
    }
  }

  @container lv-exam (max-width: 560px) {
    .lv-bm-page {
      padding: 14px 12px 24px;
    }

    .lv-bm-cta-group {
      width: 100%;
    }

    .lv-bm-cta-group .lv-btn:not(.lv-bm-refresh-btn) {
      flex: 1 1 auto;
    }

    .lv-bm-search-wrap {
      min-width: 0;
      width: 100%;
      flex: 1 1 100%;
    }
  }
</style>
