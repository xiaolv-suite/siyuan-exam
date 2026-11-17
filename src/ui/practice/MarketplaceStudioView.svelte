<script lang="ts">
  import { SvelteSet } from "svelte/reactivity";
  import type { Question } from "@/core/types";
  import Icon from "../shared/Icon.svelte";
  import {
    type MarketplaceCatalog,
    type MarketplaceItem,
    type MarketplaceCategory,
    type MarketplaceSortMode,
    type MarketplaceStatusFilter,
    DEFAULT_MARKETPLACE_CATALOG,
    filterMarketplaceItems,
    sortMarketplaceItems,
  } from "@/core/marketplace";
  import {
    type MarketplaceCartItem,
    type MarketplaceQualityMetrics,
    extractCartItemsFromMarketplaceItem,
    addToCart,
    addManyToCart,
    removeFromCart,
    isInCart,
    calculateItemQualityMetrics,
    cartItemsToLvCardsPackage,
    buildMarketplaceKpTree,
  } from "@/core/marketplaceCart";
  import {
    fetchMarketplaceCatalog,
    installMarketplaceItem,
    loadMarketplaceSources,
    saveMarketplaceSources,
    type CustomMarketplaceSource,
  } from "./services/marketplaceService";
  import PaperAssembleModal from "./PaperAssembleModal.svelte";
  import type { ExamApp } from "@/app";

  interface Props {
    app: ExamApp;
    readLocal: (k: string) => string | null;
    writeLocal: (k: string, v: string) => void;
    showMessage: (msg: string, time?: number, type?: "info" | "error") => void;
    onbankCreated?: (bankId: string) => void;
    onback?: () => void;
    onstartCartDrill?: (items: MarketplaceCartItem[]) => void;
    oncloneCartToBank?: (items: MarketplaceCartItem[], bankName: string) => Promise<void>;
  }

  let {
    app,
    readLocal,
    writeLocal,
    showMessage,
    onbankCreated,
    onback,
    onstartCartDrill,
    oncloneCartToBank,
  }: Props = $props();

  let catalog = $state<MarketplaceCatalog>(DEFAULT_MARKETPLACE_CATALOG);
  let searchQuery = $state("");
  let selectedCategory = $state<MarketplaceCategory>("all");
  let sortMode = $state<MarketplaceSortMode>("default");
  let statusFilter = $state<MarketplaceStatusFilter>("all");
  let previewItemId = $state<string | null>(null);
  let previewTabs = $state<Record<string, "question" | "flashcard" | "tree">>({});
  let installingId = $state<string | null>(null);
  let installedIds = new SvelteSet<string>();
  let localBanks = $state<Array<{ id: string; name: string }>>([]);
  let deltaMap = $state<Record<string, import("@/core/marketplaceSync").QuestionDeltaReport | null>>({});
  let checkingDeltaId = $state<string | null>(null);

  // 跨学科试题篮状态
  const CART_STORAGE_KEY = "lv-exam/marketplace-cart";
  let cartItems = $state<MarketplaceCartItem[]>([]);
  let cartOpen = $state(false);
  let cartAssembleOpen = $state(false);
  let cartAssembleQuestions = $state<Question[]>([]);

  // 自定义订阅源管理
  let customSources = $state<CustomMarketplaceSource[]>([]);
  let currentSourceUrl = $state<string>("official");
  let addSourcePanelOpen = $state(false);
  let newSourceName = $state("");
  let newSourceUrl = $state("");
  let loadingCatalog = $state(false);
  let catalogError = $state<string | null>(null);

  $effect(() => {
    customSources = loadMarketplaceSources(readLocal);
    try {
      const rawCart = readLocal(CART_STORAGE_KEY);
      if (rawCart) {
        const parsed = JSON.parse(rawCart);
        if (Array.isArray(parsed)) cartItems = parsed;
      }
    } catch {
      // 容错忽略
    }
    localBanks = app ? app.listBanks() : [];
    void refreshCatalog(currentSourceUrl);
  });

  async function refreshCatalog(url: string) {
    loadingCatalog = true;
    catalogError = null;
    try {
      const res = await fetchMarketplaceCatalog(url);
      catalog = res.catalog;
      if (res.error) {
        catalogError = res.error;
      }
    } catch (e) {
      catalogError = String(e instanceof Error ? e.message : e);
    } finally {
      loadingCatalog = false;
    }
  }

  const filteredItems = $derived.by(() => {
    let items = filterMarketplaceItems(catalog.items, searchQuery, selectedCategory);
    if (statusFilter !== "all") {
      items = items.filter((item) => {
        const local = getLocalBankForItem(item);
        const isInstalled = !!local || installedIds.has(item.id);
        return statusFilter === "installed" ? isInstalled : !isInstalled;
      });
    }
    return sortMarketplaceItems(items, sortMode);
  });

  async function handleInstall(item: MarketplaceItem) {
    if (installingId) return;
    installingId = item.id;
    try {
      const res = await installMarketplaceItem(item, app);
      if (res.success) {
        installedIds.add(item.id);
        showMessage(`已成功获取《${item.title}》并入库（共 ${res.count} 题）✓`, 3200, "info");
        onbankCreated?.(res.bankId);
      } else {
        showMessage(`获取失败：${res.error || "未知错误"}`, 3500, "error");
      }
    } catch (e) {
      showMessage(`获取异常：${String(e instanceof Error ? e.message : e)}`, 3500, "error");
    } finally {
      installingId = null;
    }
  }

  async function handleExportLvCards(item: MarketplaceItem) {
    try {
      const { marketplaceItemToLvCardsPackage, serializeLvCardsPackage } = await import("@/core/lvcardsBridge");
      const { downloadBlobFile } = await import("./services/bankExportService");
      const pkg = marketplaceItemToLvCardsPackage(item);
      const json = serializeLvCardsPackage(pkg);
      downloadBlobFile(
        json,
        `${item.title}.lvcards`,
        "application/json;charset=utf-8;",
      );
      showMessage(`已导出《${item.title}》小驴闪卡包 (.lvcards) ✓`, 3000, "info");
    } catch (e) {
      showMessage(`导出闪卡包失败：${String(e instanceof Error ? e.message : e)}`, 3500, "error");
    }
  }

  function getLocalBankForItem(item: MarketplaceItem): { id: string; name: string } | undefined {
    return localBanks.find((b) => b.name === item.title || b.name === item.id);
  }

  async function checkDelta(item: MarketplaceItem) {
    const localBank = getLocalBankForItem(item);
    if (!localBank) return;
    checkingDeltaId = item.id;
    try {
      const { calculateQuestionDelta } = await import("@/core/marketplaceSync");
      const { cartItemsToQuestions, extractCartItemsFromMarketplaceItem } = await import("@/core/marketplaceCart");
      const localQs = await app.listQuestions(localBank.id);
      const remoteExtracted = extractCartItemsFromMarketplaceItem(item);
      const remoteQs = cartItemsToQuestions(remoteExtracted);
      const delta = calculateQuestionDelta(localQs, remoteQs);
      deltaMap[item.id] = delta;
      if (delta.hasUpdates) {
        showMessage(`《${item.title}》发现新内容：新增 ${delta.addedCount} 题，修订 ${delta.updatedCount} 题`, 3200, "info");
      } else {
        showMessage(`《${item.title}》已是最新版本，无差异内容 ✓`, 2500, "info");
      }
    } catch (err) {
      showMessage(`检查更新失败：${String(err instanceof Error ? err.message : err)}`, 3000, "error");
    } finally {
      checkingDeltaId = null;
    }
  }

  async function handleApplyDeltaUpdate(item: MarketplaceItem) {
    const localBank = getLocalBankForItem(item);
    const delta = deltaMap[item.id];
    if (!localBank || !delta || !delta.hasUpdates) return;

    installingId = item.id;
    try {
      const { mergeQuestionDelta } = await import("@/core/marketplaceSync");
      const localQs = await app.listQuestions(localBank.id);
      const merged = mergeQuestionDelta(localQs, delta);

      for (const q of merged) {
        await app.writeManualQuestion(localBank.id, q);
      }
      deltaMap[item.id] = null;
      showMessage(`已为《${item.title}》无损合入更新（新增 ${delta.addedCount} 题，修订 ${delta.updatedCount} 题，答题历史完整保留）✓`, 3500, "info");
      onbankCreated?.(localBank.id);
    } catch (err) {
      showMessage(`合入更新异常：${String(err instanceof Error ? err.message : err)}`, 3500, "error");
    } finally {
      installingId = null;
    }
  }

  function handleAddCustomSource() {
    const name = newSourceName.trim();
    const url = newSourceUrl.trim();
    if (!name || !url) {
      showMessage("请完整填写订阅源名称与直链 URL", 2500, "error");
      return;
    }
    const newSrc: CustomMarketplaceSource = {
      id: "src-" + Date.now(),
      name,
      url,
      enabled: true,
      addedAt: new Date().toISOString().slice(0, 10),
    };
    customSources = [...customSources, newSrc];
    saveMarketplaceSources(writeLocal, customSources);
    newSourceName = "";
    newSourceUrl = "";
    addSourcePanelOpen = false;
    currentSourceUrl = url;
    void refreshCatalog(url);
    showMessage(`已添加并切换至订阅源「${name}」✓`, 2800, "info");
  }

  function persistCart(items: MarketplaceCartItem[]) {
    cartItems = items;
    try {
      writeLocal(CART_STORAGE_KEY, JSON.stringify(items));
    } catch {
      // ignore
    }
  }

  function toggleCartItem(item: MarketplaceCartItem) {
    if (isInCart(cartItems, item.id)) {
      persistCart(removeFromCart(cartItems, item.id));
      showMessage(`已从试题篮移出 1 题`, 2000, "info");
    } else {
      persistCart(addToCart(cartItems, item));
      showMessage(`已加入试题篮（当前共 ${cartItems.length} 题）✓`, 2000, "info");
    }
  }

  function handleAddAllToCart(item: MarketplaceItem) {
    const extracted = extractCartItemsFromMarketplaceItem(item);
    if (!extracted.length) {
      showMessage("该条目暂无可提取的试题", 2000, "error");
      return;
    }
    const updated = addManyToCart(cartItems, extracted);
    const diff = updated.length - cartItems.length;
    persistCart(updated);
    if (diff > 0) {
      showMessage(`已将《${item.title}》的 ${diff} 道新题加入试题篮（总计 ${updated.length} 题）✓`, 2500, "info");
    } else {
      showMessage(`《${item.title}》中的题目已全部在试题篮中`, 2000, "info");
    }
  }

  function handleClearCart() {
    persistCart([]);
    showMessage("已清空试题篮", 2000, "info");
  }

  async function handleExportCartLvCards() {
    if (!cartItems.length) return;
    try {
      const { serializeLvCardsPackage } = await import("@/core/lvcardsBridge");
      const { downloadBlobFile } = await import("./services/bankExportService");
      const pkg = cartItemsToLvCardsPackage(cartItems);
      const json = serializeLvCardsPackage(pkg);
      const nowStr = new Date().toISOString().slice(0, 10);
      downloadBlobFile(json, `小驴精选题卡集-${nowStr}.lvcards`, "application/json;charset=utf-8;");
      showMessage(`已成功导出 ${cartItems.length} 张跨学科小驴闪卡包 (.lvcards) ✓`, 3000, "info");
    } catch (e) {
      showMessage(`导出闪卡包失败：${String(e instanceof Error ? e.message : e)}`, 3500, "error");
    }
  }

  async function handleStartCartDrill() {
    if (!cartItems.length) return;
    if (onstartCartDrill) {
      onstartCartDrill(cartItems);
    } else {
      await handleCloneCartToBank();
    }
  }

  async function handleCloneCartToBank() {
    if (!cartItems.length) return;
    try {
      const { cartItemsToQuestions } = await import("@/core/marketplaceCart");
      const questions = cartItemsToQuestions(cartItems);
      const nowStr = new Date().toISOString().slice(5, 10).replace("-", "");
      const bankTitle = `🛒 集市挑选专练-${nowStr}`;

      if (oncloneCartToBank) {
        await oncloneCartToBank(cartItems, bankTitle);
        return;
      }

      const { installCartQuestionsToBank } = await import("./services/marketplaceService");
      const res = await installCartQuestionsToBank(app, bankTitle, questions);
      if (!res.success || !res.bankId) {
        showMessage(`创建专属题库失败：${res.error || "未知原因"}`, 3500, "error");
        return;
      }
      showMessage(`已成功创建专属题库《${bankTitle}》（共 ${questions.length} 题）✓`, 3200, "info");
      onbankCreated?.(res.bankId);
    } catch (e) {
      showMessage(`保存题库异常：${String(e instanceof Error ? e.message : e)}`, 3500, "error");
    }
  }

  async function handleOpenCartAssemble() {
    if (!cartItems.length) return;
    const { cartItemsToQuestions } = await import("@/core/marketplaceCart");
    cartAssembleQuestions = cartItemsToQuestions(cartItems);
    cartAssembleOpen = true;
  }

  const itemMetricsMap = $derived.by(() => {
    const map: Record<string, MarketplaceQualityMetrics> = {};
    for (const item of catalog.items) {
      map[item.id] = calculateItemQualityMetrics(item);
    }
    return map;
  });

  const categories: Array<{ id: MarketplaceCategory; label: string }> = [
    { id: "all", label: "全部领域" },
    { id: "math", label: "📐 数理公式" },
    { id: "computer", label: "💻 计算机/408" },
    { id: "language", label: "🔤 外语词汇" },
    { id: "qualification", label: "⚖️ 法考/公考" },
    { id: "humanities", label: "📖 人文经典" },
    { id: "science", label: "🔬 经典物理" },
    { id: "general", label: "💡 逻辑/通识" },
  ];

  function getCategoryBorderColor(cat: MarketplaceCategory): string {
    switch (cat) {
      case "math": return "var(--lv-brand, #3b82f6)";
      case "computer": return "var(--lv-data-accent, #0ea5e9)";
      case "language": return "var(--lv-green, #10b981)";
      case "qualification": return "var(--lv-accent-seal, #ef4444)";
      case "humanities": return "var(--lv-accent, #f59e0b)";
      case "science": return "var(--lv-brand-alt, #6366f1)";
      case "general": return "var(--lv-brand-secondary, var(--lv-brand))";
      default: return "var(--lv-border)";
    }
  }
</script>

<div class="lv-pad lv-marketplace-studio">
  <!-- 页面大标题 -->
  <div class="lv-screen-head" style="margin:0 0 16px">
    <div class="lv-row" style="margin:0;align-items:baseline;justify-content:space-between;flex-wrap:wrap;gap:12px">
      <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
        {#if onback}
          <button type="button" class="lv-btn lv-btn--ghost lv-mobile-back" onclick={onback} style="display:inline-flex;align-items:center;gap:4px">
            <Icon name="chev-left" size={14} /> 返回
          </button>
        {/if}
        <h1 class="lv-h1" style="font-size:20px;margin:0;display:flex;align-items:center;gap:8px">
          🏛️ 题库与闪卡公共集市
        </h1>
        <span class="lv-chip lv-chip--acc" style="font-weight:600">公版精选 · 零版权争议</span>
        <span class="lv-muted" style="font-size:13px">
          去中心化开放知识集市。精选公共领域常识、国家新课标与学术公式题卡，一键克隆入库。
        </span>
      </div>
      <div class="lv-row" style="margin:0;gap:8px">
        <button class="lv-btn sm lv-btn--ghost" onclick={() => (addSourcePanelOpen = !addSourcePanelOpen)} title="添加自定义第三方题库/闪卡订阅源">
          <Icon name="link" size={13} /> {addSourcePanelOpen ? "收起订阅设置" : "➕ 自定义订阅源"}
        </button>
      </div>
    </div>
  </div>

  <!-- 添加外部订阅源面板 -->
  {#if addSourcePanelOpen}
    <div class="lv-card" style="margin:0 0 16px;padding:14px 18px;background:var(--lv-surface-2);border-radius:var(--lv-r-2);border:1px dashed var(--lv-border)">
      <div style="font-weight:700;font-size:13px;margin-bottom:6px;color:var(--lv-text)">🔗 添加第三方网络订阅源 (URL)</div>
      <p class="lv-muted" style="font-size:12px;margin:0 0 10px">
        支持输入托管在 GitHub Gist、Gitee 或自建服务器的 <code>catalog.json</code> 订阅直链（模式同开源阅读书源），思源客户端在前端直接拉取，官方不设中转。
      </p>
      <div class="lv-row" style="gap:8px;margin:0 0 8px;flex-wrap:wrap">
        <input class="lv-input" style="flex:1;min-width:min(160px, 100%)" bind:value={newSourceName} placeholder="订阅源名称（如：考研专业课精选源）" />
        <input class="lv-input" style="flex:2;min-width:min(220px, 100%)" bind:value={newSourceUrl} placeholder="https://example.com/catalog.json" />
        <button class="lv-btn sm lv-btn--primary" onclick={handleAddCustomSource}>添加并载入</button>
      </div>
      {#if customSources.length > 0}
        <div class="lv-row" style="gap:6px;align-items:center;margin:8px 0 0;flex-wrap:wrap">
          <span class="lv-muted" style="font-size:12px">已添加源：</span>
          {#each customSources as src (src.id)}
            <button
              type="button"
              class="lv-chip sm"
              class:acc={currentSourceUrl === src.url}
              onclick={() => { currentSourceUrl = src.url; void refreshCatalog(src.url); }}
            >
              {src.name}
            </button>
          {/each}
        </div>
      {/if}
    </div>
  {/if}

  <!-- 集市全局生态统计概览 -->
  <div class="lv-card" style="margin:0 0 16px;padding:12px 18px;background:var(--lv-surface-2);border:1px solid var(--lv-border-subtle);border-radius:var(--lv-r-2);display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px">
    <div class="lv-row" style="margin:0;gap:16px;align-items:center;flex-wrap:wrap">
      <div style="display:flex;align-items:center;gap:6px">
        <span style="font-size:16px">🏛️</span>
        <div>
          <div class="lv-muted" style="font-size:11px">公版精选题库</div>
          <div class="num" style="font-weight:700;font-size:14px;color:var(--lv-brand)">{catalog.items.length} 门核心学科</div>
        </div>
      </div>
      <div style="width:1px;height:24px;background:var(--lv-border-subtle)"></div>
      <div style="display:flex;align-items:center;gap:6px">
        <span style="font-size:16px">📑</span>
        <div>
          <div class="lv-muted" style="font-size:11px">题卡覆盖总量</div>
          <div class="num" style="font-weight:700;font-size:14px;color:var(--lv-green)">{catalog.items.reduce((s, i) => s + (i.itemCount || 0), 0)}+ 题/卡</div>
        </div>
      </div>
      <div style="width:1px;height:24px;background:var(--lv-border-subtle)"></div>
      <div style="display:flex;align-items:center;gap:6px">
        <span style="font-size:16px">🛡️</span>
        <div>
          <div class="lv-muted" style="font-size:11px">知识版权安全</div>
          <div style="font-weight:700;font-size:12px;color:var(--lv-text)">公有领域 / CC-BY 授权</div>
        </div>
      </div>
    </div>
    <div style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--lv-text-2)">
      <span class="lv-chip sm lv-chip--acc" style="font-size:11px;font-weight:600">小驴全系生态互通</span>
      <span>题库支持一键克隆，亦可直导 <code>.lvcards</code> 到小驴闪卡</span>
    </div>
  </div>

  <!-- 搜索与筛选工具栏 -->
  <div class="lv-card" style="margin:0 0 18px;padding:14px 18px;background:var(--lv-surface);border:1px solid var(--lv-border-subtle);border-radius:var(--lv-r-2)">
    <div class="lv-row" style="margin:0 0 12px;gap:12px;flex-wrap:wrap;align-items:center">
      <div style="position:relative;flex:1;min-width:min(220px, 100%)">
        <input
          class="lv-input"
          style="width:100%;box-sizing:border-box;padding-left:32px;font-size:14px"
          bind:value={searchQuery}
          placeholder="🔍 搜索题库、卡包或考点关键词（如：TCP、导数、四六级、民法典）..."
        />
        {#if searchQuery}
          <button
            type="button"
            class="lv-btn sm lv-btn--ghost"
            style="position:absolute;right:8px;top:50%;transform:translateY(-50%);padding:2px 6px"
            onclick={() => (searchQuery = "")}
          >
            ✕
          </button>
        {/if}
      </div>
      <div class="lv-session-dock" role="group" aria-label="订阅源">
        <button
          type="button"
          class="lv-chip sm"
          class:acc={currentSourceUrl === "official"}
          onclick={() => { currentSourceUrl = "official"; void refreshCatalog("official"); }}
        >
          🌐 官方精选公版源
        </button>
        {#if customSources.length > 0}
          <select
            class="lv-select"
            style="min-height:28px;padding:2px 8px;font-size:12px;border:none;background:transparent"
            bind:value={currentSourceUrl}
            onchange={(e) => void refreshCatalog((e.target as HTMLSelectElement).value)}
          >
            <option value="official">官方精选公版源</option>
            {#each customSources as cs (cs.id)}
              <option value={cs.url}>{cs.name}</option>
            {/each}
          </select>
        {/if}
      </div>
    </div>

    <!-- 分类芯片与排序过滤工具栏 -->
    <div class="lv-row" style="margin:0;gap:12px;justify-content:space-between;align-items:center;flex-wrap:wrap">
      <div class="lv-row" style="margin:0;gap:6px;flex-wrap:wrap">
        {#each categories as cat (cat.id)}
          {@const count = cat.id === "all" ? catalog.items.length : catalog.items.filter((i) => i.category === cat.id).length}
          <button
            type="button"
            class="lv-chip"
            class:acc={selectedCategory === cat.id}
            onclick={() => (selectedCategory = cat.id)}
            style="font-weight:600"
          >
            {cat.label} <span class="lv-muted num" style="font-size:11px">({count})</span>
          </button>
        {/each}
      </div>

      <div class="lv-row" style="margin:0;gap:8px;align-items:center;flex-wrap:wrap">
        <!-- 本地安装状态过滤 -->
        <div class="lv-session-dock" role="group" aria-label="安装状态过滤">
          <button
            type="button"
            class="lv-chip sm"
            class:acc={statusFilter === "all"}
            onclick={() => (statusFilter = "all")}
          >
            全部
          </button>
          <button
            type="button"
            class="lv-chip sm"
            class:acc={statusFilter === "uninstalled"}
            onclick={() => (statusFilter = "uninstalled")}
            title="仅显示本地尚未安装的题库"
          >
            未入库
          </button>
          <button
            type="button"
            class="lv-chip sm"
            class:acc={statusFilter === "installed"}
            onclick={() => (statusFilter = "installed")}
            title="仅显示本地已安装的题库"
          >
            已在库
          </button>
        </div>

        <!-- 排序方式 -->
        <select
          class="lv-select"
          style="min-height:28px;padding:2px 8px;font-size:12px"
          bind:value={sortMode}
          aria-label="集市资源排序"
        >
          <option value="default">默认推荐排序</option>
          <option value="count_desc">题量从多到少 ↓</option>
          <option value="updated_desc">最新更新时间 ↓</option>
          <option value="title_asc">题库名称拼音 (A-Z)</option>
        </select>
      </div>
    </div>
  </div>

  {#if catalogError}
    <div class="lv-error" style="margin-bottom:14px;padding:10px 14px;display:flex;align-items:center;gap:8px">
      <Icon name="alert-triangle" size={14} />
      <span>{catalogError}</span>
    </div>
  {/if}

  <!-- 题库卡片超大网格 (3~4 列响应式) -->
  {#if loadingCatalog}
    <div style="padding:60px;text-align:center;color:var(--lv-text-3)">
      <Icon name="clock" size={28} />
      <div style="margin-top:10px;font-size:14px">正在载入知识集市资源列表…</div>
    </div>
  {:else if filteredItems.length === 0}
    <div class="lv-card" style="padding:60px 20px;text-align:center;color:var(--lv-text-3);background:var(--lv-surface-2)">
      <Icon name="book" size={32} />
      <div style="margin-top:10px;font-size:15px;font-weight:600">未找到匹配的题库或闪卡包</div>
      <p style="font-size:13px;margin-top:6px">尝试清空搜索关键词或切换上方的领域分类。</p>
    </div>
  {:else}
    <div class="lv-marketplace-grid" style="display:grid;grid-template-columns:repeat(auto-fill, minmax(min(280px, 100%), 1fr));gap:18px;margin-bottom:24px">
      {#each filteredItems as item (item.id)}
        {@const localBank = getLocalBankForItem(item)}
        {@const isInstalled = !!localBank || installedIds.has(item.id)}
        {@const delta = deltaMap[item.id]}
        <div
          class="lv-card lv-marketplace-card"
          style="padding:18px;display:flex;flex-direction:column;justify-content:space-between;background:var(--lv-surface);border-radius:var(--lv-r-2);border:1px solid var(--lv-border);border-top:4px solid {getCategoryBorderColor(item.category)};box-shadow:var(--lv-sh-1);transition:transform var(--lv-dur-micro) var(--lv-ease-out)"
        >
          <div>
            <div class="lv-row" style="justify-content:space-between;align-items:center;margin:0 0 8px">
              <span class="lv-chip sm lv-chip--acc" style="font-weight:700;font-size:11px">
                {item.kind === "both" ? "题卡两用" : item.kind === "exam_bank" ? "考试题库" : "记忆闪卡"}
              </span>
              <div class="lv-row" style="margin:0;gap:6px;align-items:center">
                {#if item.verified}
                  <span class="lv-chip sm num" style="color:var(--lv-green);background:var(--lv-green-soft, rgba(16,185,129,0.1));font-size:11px" title="零版权争议认证">
                    ✓ 公版认证
                  </span>
                {/if}
                <span class="lv-muted num" style="font-size:12px;font-weight:700">
                  {item.itemCount} 题/卡
                </span>
                <button
                  type="button"
                  class="lv-btn sm lv-btn--ghost"
                  style="font-size:11px;padding:1px 6px;border-radius:4px"
                  onclick={() => handleAddAllToCart(item)}
                  title="将该题库所有题目一键加入试题篮"
                >
                  🛒 挑入试题篮
                </button>
              </div>
            </div>

            <h3 style="font-size:16px;font-weight:700;margin:0 0 6px;color:var(--lv-text);line-height:1.4">
              {item.title}
            </h3>
            {#if item.subtitle}
              <p style="font-size:13px;margin:0 0 8px;color:var(--lv-text-2);line-height:1.5">
                {item.subtitle}
              </p>
            {/if}
            <p class="lv-muted" style="font-size:12px;margin:0 0 10px;line-height:1.5;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">
              {item.description}
            </p>

            <!-- 题库品质画像与梯队看板 -->
            {#if itemMetricsMap[item.id]}
              {@const metrics = itemMetricsMap[item.id]}
              {#if metrics.totalCount > 0}
                <div style="margin:8px 0;padding:6px 10px;background:var(--lv-surface-2);border-radius:6px;border:1px solid var(--lv-border-subtle);font-size:11px;display:flex;flex-direction:column;gap:5px">
                  <div class="lv-row" style="margin:0;gap:6px;align-items:center;flex-wrap:wrap">
                    <span class="lv-muted" style="font-weight:600">题型构成:</span>
                    {#each metrics.typeDistribution as td (td.label)}
                      <span style="color:{td.color};font-weight:700">{td.label} {td.pct}%</span>
                    {/each}
                    {#if metrics.expansionRatio > 0}
                      <span class="lv-chip sm" style="margin-left:auto;font-size:10px;padding:1px 5px;background:var(--lv-brand-alt-soft, rgba(99,102,241,0.1));color:var(--lv-brand-alt)" title="包含深度解题推演与秒杀技巧的题目比例">
                        💡 含秒杀要诀 {metrics.expansionRatio}%
                      </span>
                    {/if}
                  </div>
                  <div style="display:flex;align-items:center;gap:6px">
                    <span class="lv-muted" style="font-weight:600;white-space:nowrap">难度梯度:</span>
                    <div style="flex:1;height:5px;border-radius:3px;background:var(--lv-border);display:flex;overflow:hidden">
                      {#each metrics.difficultyDistribution as dd (dd.label)}
                        <div style="width:{dd.pct}%;background:{dd.color};height:100%" title="{dd.label}: {dd.pct}%"></div>
                      {/each}
                    </div>
                    <div class="lv-muted num" style="font-size:10px;white-space:nowrap">
                      {#each metrics.difficultyDistribution as dd, ddi (ddi)}
                        <span style="color:{dd.color};font-weight:600">{dd.label.split(' ')[0]}</span>{#if ddi < metrics.difficultyDistribution.length - 1} · {/if}
                      {/each}
                    </div>
                  </div>
                </div>
              {/if}
            {/if}

            <div class="lv-row" style="gap:5px;margin:8px 0;flex-wrap:wrap">
              {#each item.tags.slice(0, 4) as tag (tag)}
                <span class="lv-chip sm" style="font-size:11px;padding:2px 7px">#{tag}</span>
              {/each}
            </div>
          </div>

          <div style="margin-top:14px;border-top:1px dashed var(--lv-border-subtle);padding-top:12px">
            <div class="lv-row" style="justify-content:space-between;align-items:center;margin:0 0 10px;font-size:12px;color:var(--lv-text-3)">
              <span>作者: {item.author.name}</span>
              <span class="lv-chip sm num" title="开放授权协议">{item.license}</span>
            </div>

            <!-- 微预览折叠手风琴 -->
            {#if (item.embeddedQuestions && item.embeddedQuestions.length > 0) || (item.previewItems && item.previewItems.length > 0)}
              {@const itemQuestions = extractCartItemsFromMarketplaceItem(item)}
              <div style="margin-bottom:10px">
                <button
                  type="button"
                  class="lv-btn sm lv-btn--ghost"
                  style="width:100%;font-size:12px;padding:4px"
                  onclick={() => (previewItemId = previewItemId === item.id ? null : item.id)}
                >
                  <Icon name="eye" size={12} /> {previewItemId === item.id ? "收起试看样题" : "👁️ 试看样题与闪卡形态（前 3 题）"}
                </button>
                {#if previewItemId === item.id}
                  <div style="margin-top:8px;padding:10px;background:var(--lv-surface-2);border-radius:6px;border:1px solid var(--lv-border);font-size:12px;line-height:1.6;max-height:260px;overflow-y:auto">
                    <!-- 题库视角与闪卡视角形态切换 -->
                    <div class="lv-row" style="margin:0 0 8px;gap:6px;align-items:center;justify-content:space-between">
                      <div class="lv-row" style="margin:0;gap:6px">
                        <button
                          type="button"
                          class="lv-chip sm"
                          class:acc={!previewTabs[item.id] || previewTabs[item.id] === "question"}
                          onclick={() => { previewTabs[item.id] = "question"; }}
                          style="font-size:11px"
                        >
                          📝 题库试卷形态
                        </button>
                        <button
                          type="button"
                          class="lv-chip sm"
                          class:acc={previewTabs[item.id] === "flashcard"}
                          onclick={() => { previewTabs[item.id] = "flashcard"; }}
                          style="font-size:11px"
                        >
                          🗂️ 小驴闪卡形态
                        </button>
                        <button
                          type="button"
                          class="lv-chip sm"
                          class:acc={previewTabs[item.id] === "tree"}
                          onclick={() => { previewTabs[item.id] = "tree"; }}
                          style="font-size:11px"
                        >
                          🌳 考点大纲全景
                        </button>
                      </div>
                      <button
                        type="button"
                        class="lv-btn sm lv-btn--ghost"
                        style="font-size:10px;padding:2px 6px"
                        onclick={() => handleAddAllToCart(item)}
                        title="将该题库所有题目加入试题篮"
                      >
                        🛒 全选入篮
                      </button>
                    </div>

                    {#if previewTabs[item.id] === "tree"}
                      <!-- 考点全景树渲染 -->
                      {@const kpTree = buildMarketplaceKpTree(itemQuestions)}
                      <div style="display:flex;flex-direction:column;gap:6px">
                        {#each kpTree as node (node.name)}
                          <div style="padding:6px 8px;background:var(--lv-surface);border-radius:4px;border:1px solid var(--lv-border-subtle)">
                            <div class="lv-row" style="margin:0;justify-content:space-between;align-items:center">
                              <span style="font-weight:700;font-size:12px;color:var(--lv-text)">
                                📌 {node.name} <span class="lv-muted num">({node.count} 题)</span>
                              </span>
                              <button
                                type="button"
                                class="lv-btn sm lv-btn--ghost"
                                style="font-size:10px;padding:1px 6px"
                                onclick={() => {
                                  const targetQs = itemQuestions.filter((q) => node.questionIds.includes(q.id));
                                  const updated = addManyToCart(cartItems, targetQs);
                                  persistCart(updated);
                                  showMessage(`已将【${node.name}】的 ${targetQs.length} 道题加入试题篮 ✓`, 2000, "info");
                                }}
                                title="将该考点的全部试题加入试题篮"
                              >
                                🛒 选此考点
                              </button>
                            </div>
                            {#if node.children.length > 0}
                              <div style="margin-top:4px;padding-left:12px;display:flex;flex-direction:column;gap:3px;border-left:2px solid var(--lv-border-subtle)">
                                {#each node.children as subNode (subNode.name)}
                                  <div class="lv-row" style="margin:0;justify-content:space-between;align-items:center;font-size:11px">
                                    <span class="lv-muted">└ {subNode.name} ({subNode.count} 题)</span>
                                    <button
                                      type="button"
                                      class="lv-btn sm lv-btn--ghost"
                                      style="font-size:10px;padding:1px 4px"
                                      onclick={() => {
                                        const targetQs = itemQuestions.filter((q) => subNode.questionIds.includes(q.id));
                                        const updated = addManyToCart(cartItems, targetQs);
                                        persistCart(updated);
                                        showMessage(`已将【${subNode.name}】的 ${targetQs.length} 道题加入试题篮 ✓`, 2000, "info");
                                      }}
                                    >
                                      + 加篮
                                    </button>
                                  </div>
                                {/each}
                              </div>
                            {/if}
                          </div>
                        {/each}
                      </div>
                    {:else}
                      {#each itemQuestions.slice(0, 3) as prev, pi (pi)}
                        <div style="margin-bottom:10px;padding-bottom:8px;border-bottom:1px dashed var(--lv-border-subtle)">
                          <div class="lv-row" style="margin:0 0 4px;justify-content:space-between;align-items:center">
                            <span class="lv-muted" style="font-weight:700;font-size:11px">第 {pi + 1} 题 ({prev.type})</span>
                            <button
                              type="button"
                              class="lv-btn sm {isInCart(cartItems, prev.id) ? 'lv-btn--primary' : 'lv-btn--ghost'}"
                              style="font-size:10px;padding:1px 6px;border-radius:4px"
                              onclick={() => toggleCartItem(prev)}
                            >
                              {isInCart(cartItems, prev.id) ? "✓ 已在试题篮" : "🛒 + 放入试题篮"}
                            </button>
                          </div>

                          {#if previewTabs[item.id] === "flashcard"}
                            <!-- 闪卡渲染形态 -->
                            <div style="padding:6px 8px;background:var(--lv-surface);border-radius:4px;border-left:3px solid var(--lv-brand);margin-bottom:4px">
                              <div class="lv-muted" style="font-size:10px;font-weight:700">【卡片正面 · 问答与线索】</div>
                              <div style="font-weight:600;color:var(--lv-text);margin-top:2px">{prev.stem}</div>
                              {#if prev.options?.length}
                                <div style="color:var(--lv-text-2);margin-top:3px">{prev.options.join(" · ")}</div>
                              {/if}
                            </div>
                            <div style="padding:6px 8px;background:var(--lv-surface);border-radius:4px;border-left:3px solid var(--lv-green)">
                              <div class="lv-muted" style="font-size:10px;font-weight:700">【卡片背面 · 答案与记忆线索】</div>
                              <div style="color:var(--lv-green);font-weight:700;margin-top:2px">{prev.answer}</div>
                              {#if prev.analysis}
                                <div style="color:var(--lv-text-2);margin-top:2px">{prev.analysis}</div>
                              {/if}
                              {#if prev.expansion}
                                <div style="color:var(--lv-brand);margin-top:2px;font-size:11px">💡 {prev.expansion}</div>
                              {/if}
                            </div>
                          {:else}
                            <!-- 传统试卷题库形态 -->
                            <div style="font-weight:700;color:var(--lv-text)">{prev.stem}</div>
                            {#if prev.options?.length}
                              <div style="color:var(--lv-text-2);margin:4px 0">{prev.options.join(" · ")}</div>
                            {/if}
                            {#if prev.answer}
                              <div style="color:var(--lv-brand);font-weight:600">参考答案：{prev.answer}</div>
                            {/if}
                            {#if prev.analysis}
                              <div class="lv-muted" style="margin-top:2px">解析：{prev.analysis}</div>
                            {/if}
                            {#if prev.expansion}
                              <div style="color:var(--lv-brand);margin-top:2px;font-size:11px">💡 秒杀技巧：{prev.expansion}</div>
                            {/if}
                          {/if}
                        </div>
                      {/each}
                    {/if}
                  </div>
                {/if}
              </div>
            {/if}

            <div class="lv-row" style="margin:0;gap:8px">
              {#if isInstalled}
                {#if delta && delta.hasUpdates}
                  <!-- 发现差量更新 -->
                  <button
                    class="lv-btn lv-btn--primary"
                    style="flex:1;justify-content:center;font-weight:700;background:var(--lv-accent);color:var(--lv-on-accent);border:none"
                    disabled={installingId === item.id}
                    onclick={() => handleApplyDeltaUpdate(item)}
                    title="无损合入新版本题目与解析，保留本地已有的答题历史与错题数据"
                  >
                    {#if installingId === item.id}
                      <Icon name="clock" size={14} /> 正在无损合并…
                    {:else}
                      <Icon name="sparkles" size={14} /> ⚡ 增量更新 (+{delta.addedCount}, ~{delta.updatedCount})
                    {/if}
                  </button>
                {:else}
                  <!-- 本地已安装，提供检查更新 -->
                  <button
                    class="lv-btn lv-btn--ghost"
                    style="flex:1;justify-content:center;font-weight:600;color:var(--lv-green)"
                    disabled={checkingDeltaId === item.id}
                    onclick={() => checkDelta(item)}
                    title="检测集市是否对该题库有增量新题或解析订正"
                  >
                    {#if checkingDeltaId === item.id}
                      <Icon name="clock" size={13} /> 正在比对题面…
                    {:else}
                      <Icon name="check" size={13} /> 已安装 · 检查更新
                    {/if}
                  </button>
                {/if}
              {:else}
                <button
                  class="lv-btn lv-btn--primary"
                  style="flex:1;justify-content:center;font-weight:700"
                  disabled={installingId === item.id}
                  onclick={() => handleInstall(item)}
                >
                  {#if installingId === item.id}
                    <Icon name="clock" size={14} /> 正在写入本地题库…
                  {:else}
                    <Icon name="sparkles" size={14} /> ⚡ 克隆至题库
                  {/if}
                </button>
              {/if}

              <button
                type="button"
                class="lv-btn lv-btn--ghost"
                style="font-size:12px;font-weight:600;padding:6px 10px;white-space:nowrap"
                title="导出为小驴闪卡分享包 (.lvcards)，可在小驴闪卡中无缝导入复习"
                onclick={() => handleExportLvCards(item)}
              >
                <Icon name="layers" size={13} /> 🗂️ 导出闪卡包
              </button>
            </div>
          </div>
        </div>
      {/each}
    </div>
  {/if}

  <!-- 底部版权合规免责声明 -->
  <footer style="margin-top:24px;padding:16px;background:var(--lv-surface-2);border-radius:var(--lv-r-2);border:1px solid var(--lv-border-subtle);font-size:12px;color:var(--lv-text-3);line-height:1.6">
    <div style="display:flex;align-items:center;gap:6px;font-weight:700;margin-bottom:4px;color:var(--lv-text-2)">
      <Icon name="check" size={13} />
      <span>⚖️ 小驴公共知识集市版权与技术中立免责声明</span>
    </div>
    本集市严格基于中立开放架构构建。官方精选源仅收录公有领域 (Public Domain) 事实常识、国家新课标知识点与开源授权 (CC-BY/MIT) 知识题卡；第三方网络订阅源由用户自愿输入并自行承担合规责任，客户端在本地前端直接拉取，官方服务器零内容存储与流转。
  </footer>

  <!-- 悬浮试题篮浮岛与跨学科组卷抽屉 -->
  {#if cartItems.length > 0}
    <div class="lv-cart-dock" style="position:fixed;bottom:24px;right:24px;z-index:99;display:flex;flex-direction:column;align-items:flex-end;gap:10px">
      {#if cartOpen}
        <div
          class="lv-card lv-cart-drawer"
          style="width:390px;max-width:calc(100vw - 32px);max-height:480px;display:flex;flex-direction:column;background:var(--lv-surface);box-shadow:var(--lv-sh-pop);border-radius:var(--lv-r-2);border:1px solid var(--lv-border);overflow:hidden"
        >
          <!-- 抽屉头部 -->
          <div style="padding:12px 16px;background:var(--lv-surface-2);border-bottom:1px solid var(--lv-border);display:flex;justify-content:space-between;align-items:center">
            <div style="display:flex;align-items:center;gap:8px">
              <span style="font-size:16px">🛒</span>
              <span style="font-weight:700;font-size:14px;color:var(--lv-text)">跨学科试题篮</span>
              <span class="lv-chip sm lv-chip--acc num" style="font-weight:700">{cartItems.length} 题</span>
            </div>
            <div class="lv-row" style="margin:0;gap:6px">
              <button type="button" class="lv-btn sm lv-btn--ghost" onclick={handleClearCart} title="清空试题篮">
                清空
              </button>
              <button type="button" class="lv-btn sm lv-btn--ghost" onclick={() => (cartOpen = false)} title="收起试题篮">
                ✕
              </button>
            </div>
          </div>

          <!-- 试题清单滚动区 -->
          <div style="flex:1;overflow-y:auto;padding:10px 14px;display:flex;flex-direction:column;gap:8px">
            {#each cartItems as cItem, cIdx (cItem.id)}
              <div style="padding:8px 10px;background:var(--lv-surface-2);border-radius:6px;border:1px solid var(--lv-border-subtle);display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
                <div style="flex:1;overflow:hidden">
                  <div class="lv-row" style="margin:0 0 4px;gap:5px;align-items:center">
                    <span class="lv-chip sm" style="font-size:10px;padding:1px 5px;border-color:{getCategoryBorderColor(cItem.sourceCategory)}">
                      {cItem.sourceTitle}
                    </span>
                    <span class="lv-muted" style="font-size:10px;font-weight:700">#{cIdx + 1}</span>
                    <span class="lv-chip sm num" style="font-size:10px;padding:1px 4px">{cItem.type}</span>
                  </div>
                  <div style="font-size:12px;color:var(--lv-text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title={cItem.stem}>
                    {cItem.stem}
                  </div>
                </div>
                <button
                  type="button"
                  class="lv-btn sm lv-btn--ghost"
                  style="padding:2px 6px;color:var(--lv-text-3)"
                  onclick={() => persistCart(removeFromCart(cartItems, cItem.id))}
                  title="移出试题篮"
                >
                  ✕
                </button>
              </div>
            {/each}
          </div>

          <!-- 底部四大核心行动 -->
          <div style="padding:12px 16px;background:var(--lv-surface-2);border-top:1px solid var(--lv-border);display:flex;flex-direction:column;gap:8px">
            <button
              type="button"
              class="lv-btn lv-btn--primary"
              style="width:100%;justify-content:center;font-weight:700"
              onclick={handleStartCartDrill}
            >
              <Icon name="play" size={13} /> 🚀 就地启动练习 ({cartItems.length} 题)
            </button>
            <button
              type="button"
              class="lv-btn lv-btn--ghost"
              style="width:100%;justify-content:center;font-size:12px;padding:6px 8px;font-weight:700"
              onclick={handleOpenCartAssemble}
              title="进入专业组卷排版工坊，自定义 A4 双栏/单栏、卷面大标题、密封线与留白并直接打印"
            >
              <Icon name="printer" size={13} /> 🖨️ 组卷排版与打印 ({cartItems.length} 题)
            </button>
            <div class="lv-row" style="margin:0;gap:8px">
              <button
                type="button"
                class="lv-btn lv-btn--ghost"
                style="flex:1;justify-content:center;font-size:12px;padding:6px 8px"
                onclick={handleExportCartLvCards}
                title="导出为符合 lvcards.v1 规范的小驴闪卡包"
              >
                <Icon name="layers" size={12} /> 🗂️ 导出闪卡包
              </button>
              <button
                type="button"
                class="lv-btn lv-btn--ghost"
                style="flex:1;justify-content:center;font-size:12px;padding:6px 8px"
                onclick={handleCloneCartToBank}
                title="在思源笔记中创建专属笔记本并保存试题"
              >
                <Icon name="download" size={12} /> 📥 存为专属题库
              </button>
            </div>
          </div>
        </div>
      {/if}

      <!-- 浮动胶囊触发按钮 -->
      <button
        type="button"
        class="lv-btn lv-btn--primary"
        style="padding:10px 18px;border-radius:9999px;font-weight:700;box-shadow:var(--lv-sh-pop);display:flex;align-items:center;gap:8px;border:none"
        onclick={() => (cartOpen = !cartOpen)}
      >
        <span style="font-size:16px">🛒</span>
        <span>跨学科试题篮 ({cartItems.length})</span>
        <span class="lv-chip sm num" style="background:var(--lv-primary-soft, var(--lv-surface-2));color:var(--lv-on-primary, var(--lv-text));border:none;font-size:11px">
          {cartOpen ? "收起" : "展开组卷"}
        </span>
      </button>
    </div>
  {/if}

  <PaperAssembleModal
    open={cartAssembleOpen}
    bankName="集市挑选专练试卷"
    questions={cartAssembleQuestions}
    onclose={() => (cartAssembleOpen = false)}
    {showMessage}
  />
</div>

<style>
  .lv-marketplace-card:hover {
    box-shadow: var(--lv-sh-pop) !important;
    transform: translateY(-2px);
  }
  .lv-cart-drawer {
    animation: lv-slide-up var(--lv-dur-fast, 180ms) cubic-bezier(0.16, 1, 0.3, 1);
  }
  @container lv-exam (max-width: 759px) {
    .lv-cart-dock {
      bottom: calc(var(--lv-tasknav-height, 68px) + 10px) !important;
      right: 12px !important;
      max-width: calc(100vw - 24px);
    }
  }
  @keyframes lv-slide-up {
    from {
      opacity: 0;
      transform: translateY(12px) scale(0.98);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }
</style>
