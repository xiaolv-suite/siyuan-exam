<script lang="ts">
  import { SvelteSet } from "svelte/reactivity";
  import Icon from "../shared/Icon.svelte";
  import {
    type MarketplaceCatalog,
    type MarketplaceItem,
    type MarketplaceCategory,
    DEFAULT_MARKETPLACE_CATALOG,
    filterMarketplaceItems,
  } from "@/core/marketplace";
  import {
    fetchMarketplaceCatalog,
    installMarketplaceItem,
    loadMarketplaceSources,
    saveMarketplaceSources,
    type CustomMarketplaceSource,
  } from "./services/marketplaceService";
  import type { ExamApp } from "@/app";

  interface Props {
    open: boolean;
    app: ExamApp;
    readLocal: (k: string) => string | null;
    writeLocal: (k: string, v: string) => void;
    showMessage: (msg: string, time?: number, type?: "info" | "error") => void;
    onclose: () => void;
    onbankCreated?: (bankId: string) => void;
  }

  let {
    open = $bindable(false),
    app,
    readLocal,
    writeLocal,
    showMessage,
    onclose,
    onbankCreated,
  }: Props = $props();

  let catalog = $state<MarketplaceCatalog>(DEFAULT_MARKETPLACE_CATALOG);
  let searchQuery = $state("");
  let selectedCategory = $state<MarketplaceCategory>("all");
  let previewItemId = $state<string | null>(null);
  let previewTabs = $state<Record<string, "question" | "flashcard">>({});
  let installingId = $state<string | null>(null);
  let installedIds = new SvelteSet<string>();

  // 自定义订阅源管理
  let customSources = $state<CustomMarketplaceSource[]>([]);
  let currentSourceUrl = $state<string>("official");
  let addSourceModalOpen = $state(false);
  let newSourceName = $state("");
  let newSourceUrl = $state("");
  let loadingCatalog = $state(false);
  let catalogError = $state<string | null>(null);

  $effect(() => {
    if (open) {
      customSources = loadMarketplaceSources(readLocal);
      void refreshCatalog(currentSourceUrl);
    }
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

  const filteredItems = $derived(
    filterMarketplaceItems(catalog.items, searchQuery, selectedCategory),
  );

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
    addSourceModalOpen = false;
    currentSourceUrl = url;
    void refreshCatalog(url);
    showMessage(`已添加并切换至订阅源「${name}」✓`, 2800, "info");
  }

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

<svelte:window onkeydown={(e) => { if (open && e.key === "Escape") onclose(); }} />

{#if open}
  <button type="button" class="lv-hotkeys-backdrop" aria-label="关闭集市" onclick={onclose}></button>
  <div class="lv-hotkeys-wrap">
    <div
      class="lv-card lv-marketplace-modal"
      role="dialog"
      aria-modal="true"
      aria-label="题库与闪卡公共集市"
      style="width:min(1240px, 96vw);max-height:90vh;overflow-y:auto;pointer-events:auto;padding:clamp(14px, 4vw, 26px);border-radius:var(--lv-r-card, 20px);border:1px solid var(--lv-border-subtle);box-shadow:var(--lv-sh-pop);background:var(--lv-surface)"
    >
      <!-- 头部标题区 -->
      <div class="lv-row" style="justify-content:space-between;align-items:flex-start;margin:0 0 16px;flex-wrap:nowrap;gap:8px">
        <div style="min-width:0;flex:1">
          <div class="lv-dialog-title-wrap" style="align-items:center;gap:8px;flex-wrap:wrap">
            <span class="lv-dialog-title-icon" style="font-size:18px"><Icon name="book" size={16} /></span>
            <h2 style="font-size:clamp(15px, 4vw, 18px);font-weight:700;margin:0;color:var(--lv-text)">
              🏛️ 题库与闪卡公共集市
            </h2>
            <span class="lv-chip sm lv-chip--acc" style="font-weight:600">公版精选 · 零版权争议</span>
          </div>
          <p class="lv-muted" style="margin:4px 0 0;font-size:12px">
            零集中存储、去中心化开放知识集市。精选公共领域常识、国家新课标与学术公式题卡，一键克隆入库。
          </p>
        </div>
        <div class="lv-row" style="margin:0;gap:6px;flex-wrap:nowrap;flex-shrink:0">
          <button class="lv-btn sm lv-btn--ghost" style="padding:0 10px;min-height:36px;height:36px;font-size:12px" onclick={() => (addSourceModalOpen = !addSourceModalOpen)} title="添加自定义第三方题库/闪卡订阅源">
            <Icon name="link" size={13} /> <span>{addSourceModalOpen ? "收起订阅" : "订阅源"}</span>
          </button>
          <button class="lv-btn sm lv-btn--ghost lv-modal-close-btn" onclick={onclose} aria-label="关闭"><Icon name="close" size={14} /></button>
        </div>
      </div>

      <!-- 添加外部订阅源面板 -->
      {#if addSourceModalOpen}
        <div class="lv-card" style="margin:0 0 16px;padding:12px 16px;background:var(--lv-surface-2);border-radius:var(--lv-r-2);border:1px dashed var(--lv-border)">
          <div style="font-weight:600;font-size:13px;margin-bottom:6px;color:var(--lv-text)">🔗 添加第三方网络订阅源 (URL)</div>
          <p class="lv-muted" style="font-size:11px;margin:0 0 8px">
            支持输入托管在 GitHub Gist、Gitee 或自建服务器的 <code>catalog.json</code> 订阅直链（模式同开源阅读书源），客户端在前端直接拉取。
          </p>
          <div class="lv-row" style="gap:8px;margin:0 0 8px;flex-wrap:wrap">
            <input class="lv-input" style="flex:1;min-width:140px" bind:value={newSourceName} placeholder="订阅源名称（例如：考研专业课真题源）" />
            <input class="lv-input" style="flex:2;min-width:240px" bind:value={newSourceUrl} placeholder="https://example.com/catalog.json" />
            <button class="lv-btn sm lv-btn--primary" onclick={handleAddCustomSource}>添加并载入</button>
          </div>
          {#if customSources.length > 0}
            <div class="lv-row" style="gap:6px;align-items:center;margin:6px 0 0;flex-wrap:wrap">
              <span class="lv-muted" style="font-size:11px">已添加源：</span>
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

      <!-- 搜索栏与订阅源切换 -->
      <div class="lv-row" style="margin:0 0 12px;gap:8px;flex-wrap:wrap;align-items:center">
        <div style="position:relative;flex:1;min-width:220px">
          <input
            class="lv-input"
            style="width:100%;box-sizing:border-box;padding-left:30px"
            bind:value={searchQuery}
            placeholder="🔍 搜索题库、卡包或考点关键词（如：TCP、导数、词汇）..."
          />
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

      <!-- 分类标签过滤器 -->
      <div class="lv-row" style="margin:0 0 16px;gap:6px;flex-wrap:wrap">
        {#each categories as cat (cat.id)}
          <button
            type="button"
            class="lv-chip sm"
            class:acc={selectedCategory === cat.id}
            onclick={() => (selectedCategory = cat.id)}
          >
            {cat.label}
          </button>
        {/each}
      </div>

      {#if catalogError}
        <div class="lv-error" style="margin-bottom:12px;font-size:12px;display:flex;align-items:center;gap:6px">
          <Icon name="alert-triangle" size={13} />
          <span>{catalogError}</span>
        </div>
      {/if}

      <!-- 资源卡片网格 -->
      {#if loadingCatalog}
        <div style="padding:40px;text-align:center;color:var(--lv-text-3)">
          <Icon name="clock" size={24} />
          <div style="margin-top:8px">正在载入知识集市资源列表…</div>
        </div>
      {:else if filteredItems.length === 0}
        <div style="padding:40px;text-align:center;color:var(--lv-text-3)">
          <Icon name="book" size={28} />
          <div style="margin-top:8px;font-size:14px">暂无匹配的题库或闪卡包</div>
          <p style="font-size:12px;margin-top:4px">可尝试清空搜索词或切换学科领域分类。</p>
        </div>
      {:else}
        <div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(min(280px, 100%), 1fr));gap:16px;margin-bottom:20px">
          {#each filteredItems as item (item.id)}
            <div
              class="lv-card lv-marketplace-card"
              style="padding:16px;display:flex;flex-direction:column;justify-content:space-between;background:var(--lv-surface-2);border-radius:var(--lv-r-2);border:1px solid var(--lv-border);border-top:4px solid {getCategoryBorderColor(item.category)};box-shadow:var(--lv-sh-1);transition: transform var(--lv-dur-micro) var(--lv-ease-out), background var(--lv-dur-micro) var(--lv-ease-out), border-color var(--lv-dur-micro) var(--lv-ease-out), box-shadow var(--lv-dur-micro) var(--lv-ease-out), color var(--lv-dur-micro) var(--lv-ease-out), opacity var(--lv-dur-micro) var(--lv-ease-out)"
            >
              <div>
                <div class="lv-row" style="justify-content:space-between;align-items:flex-start;margin:0 0 6px">
                  <span class="lv-chip sm lv-chip--acc" style="font-weight:600;font-size:10px">
                    {item.kind === "both" ? "题卡两用" : item.kind === "exam_bank" ? "试题库" : "记忆卡"}
                  </span>
                  <span class="lv-muted num" style="font-size:11px;font-weight:600">
                    {item.itemCount} 题/卡
                  </span>
                </div>
                <h3 style="font-size:14px;font-weight:700;margin:0 0 4px;color:var(--lv-text);line-height:1.4">
                  {item.title}
                </h3>
                {#if item.subtitle}
                  <p class="lv-muted" style="font-size:12px;margin:0 0 6px;line-height:1.4">
                    {item.subtitle}
                  </p>
                {/if}
                <div class="lv-row" style="gap:4px;margin:6px 0;flex-wrap:wrap">
                  {#each item.tags.slice(0, 3) as tag (tag)}
                    <span class="lv-chip sm" style="font-size:10px;padding:1px 6px">#{tag}</span>
                  {/each}
                </div>
              </div>

              <div style="margin-top:10px;border-top:1px dashed var(--lv-border-subtle);padding-top:10px">
                <div class="lv-row" style="justify-content:space-between;align-items:center;margin:0 0 8px;font-size:11px;color:var(--lv-text-3)">
                  <span>作者: {item.author.name}</span>
                  <span class="lv-chip sm num" title="开源授权协议">{item.license}</span>
                </div>

                <!-- 微预览折叠区 -->
                {#if item.previewItems && item.previewItems.length > 0}
                  <div style="margin-bottom:8px">
                    <button
                      type="button"
                      class="lv-btn sm lv-btn--ghost"
                      style="width:100%;font-size:11px;padding:3px"
                      onclick={() => (previewItemId = previewItemId === item.id ? null : item.id)}
                    >
                      <Icon name="eye" size={11} /> {previewItemId === item.id ? "收起试看" : "👁️ 试看样题与闪卡形态"}
                    </button>
                    {#if previewItemId === item.id}
                      <div style="margin-top:6px;padding:8px;background:var(--lv-surface);border-radius:4px;border:1px solid var(--lv-border);font-size:11px;line-height:1.5;max-height:160px;overflow-y:auto">
                        <div class="lv-row" style="margin:0 0 6px;gap:4px">
                          <button
                            type="button"
                            class="lv-chip sm"
                            class:acc={previewTabs[item.id] !== "flashcard"}
                            onclick={() => { previewTabs[item.id] = "question"; }}
                            style="font-size:10px;padding:1px 5px"
                          >
                            📝 题库形态
                          </button>
                          <button
                            type="button"
                            class="lv-chip sm"
                            class:acc={previewTabs[item.id] === "flashcard"}
                            onclick={() => { previewTabs[item.id] = "flashcard"; }}
                            style="font-size:10px;padding:1px 5px"
                          >
                            🗂️ 闪卡形态
                          </button>
                        </div>
                        {#each item.previewItems.slice(0, 2) as prev, pi (pi)}
                          <div style="margin-bottom:6px;padding-bottom:4px;border-bottom:1px dashed var(--lv-border-subtle)">
                            {#if previewTabs[item.id] === "flashcard"}
                              <div style="font-weight:600;color:var(--lv-text)">正面：{prev.stem}</div>
                              <div style="color:var(--lv-green);margin-top:2px;font-weight:600">背面：{prev.answer || "见解析"}</div>
                            {:else}
                              <b>第 {pi + 1} 题：</b>{prev.stem}
                              {#if prev.options?.length}
                                <div style="color:var(--lv-text-3);margin-top:2px">{prev.options.join(" · ")}</div>
                              {/if}
                              {#if prev.answer}
                                <div style="color:var(--lv-brand);margin-top:2px">答案：{prev.answer}</div>
                              {/if}
                            {/if}
                          </div>
                        {/each}
                      </div>
                    {/if}
                  </div>
                {/if}

                <div class="lv-row" style="margin:0;gap:6px">
                  <button
                    class="lv-btn sm {installedIds.has(item.id) ? 'lv-btn--ghost' : 'lv-btn--primary'}"
                    style="flex:1;justify-content:center;font-weight:600"
                    disabled={installingId === item.id || installedIds.has(item.id)}
                    onclick={() => handleInstall(item)}
                  >
                    {#if installingId === item.id}
                      <Icon name="clock" size={13} /> 正在写入…
                    {:else if installedIds.has(item.id)}
                      <Icon name="check" size={13} /> 已克隆入库
                    {:else}
                      <Icon name="sparkles" size={13} /> 克隆至题库
                    {/if}
                  </button>
                  <button
                    type="button"
                    class="lv-btn sm lv-btn--ghost"
                    style="font-size:11px;padding:4px 8px;white-space:nowrap"
                    title="导出为小驴闪卡包 (.lvcards)"
                    onclick={() => handleExportLvCards(item)}
                  >
                    <Icon name="layers" size={12} /> 导出闪卡包
                  </button>
                </div>
              </div>
            </div>
          {/each}
        </div>
      {/if}

      <!-- 底部版权合规免责声明 -->
      <footer style="margin-top:16px;padding-top:12px;border-top:1px solid var(--lv-border-subtle);font-size:11px;color:var(--lv-text-3);line-height:1.5">
        <div style="display:flex;align-items:center;gap:6px;font-weight:600;margin-bottom:2px">
          <Icon name="check" size={12} />
          <span>⚖️ 知识集市版权与免责声明</span>
        </div>
        本集市基于中立开放架构构建。官方精选源仅收录公有领域 (Public Domain) 事实常识、国家标准大纲与开源授权 (CC-BY/MIT) 知识题卡；第三方自定义订阅源由用户自愿输入并自行承担合规责任。
      </footer>
    </div>
  </div>
{/if}
