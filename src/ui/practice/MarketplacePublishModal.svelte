<script lang="ts">
  import Icon from "../shared/Icon.svelte";
  import type { Question } from "@/core/types";
  import type { MarketplaceCategory } from "@/core/marketplace";
  import {
    scanPrivacyIssues,
    buildMarketplaceItemFromBank,
    buildMarketplaceCatalogJson,
    type PrivacySanitizeWarning,
  } from "@/core/marketplaceSync";
  import { downloadBlobFile } from "./services/bankExportService";

  interface Props {
    open: boolean;
    bankName: string;
    bankId: string;
    questions: readonly Question[];
    onclose: () => void;
    showMessage: (msg: string, time?: number, type?: "info" | "error") => void;
  }

  let {
    open,
    bankName,
    bankId,
    questions,
    onclose,
    showMessage,
  }: Props = $props();

  let pubId = $state("");
  let pubTitle = $state("");
  let pubSubtitle = $state("");
  let pubDesc = $state("");
  let pubCategory = $state<MarketplaceCategory>("general");
  let pubAuthor = $state("小驴学习者");
  let pubVersion = $state("1.0.0");
  let pubLicense = $state<"CC0" | "CC-BY-4.0" | "CC-BY-NC-4.0" | "Public Domain" | "MIT">("Public Domain");
  let pubTagsInput = $state("");

  let warnings = $state<PrivacySanitizeWarning[]>([]);
  let activeTab = $state<"config" | "privacy" | "preview">("config");
  let generatedJson = $state("");

  $effect(() => {
    if (open) {
      pubTitle = bankName || "未命名题库";
      pubId = bankId
        ? `bank-${bankId.toLowerCase().replace(/[^a-z0-9]/g, "-")}`
        : `bank-${(bankName || "deck").toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-") || Date.now().toString()}`;
      pubDesc = `汇集 ${questions.length} 道精选题卡，涵盖核心考点推导与详细解析。`;
      pubTagsInput = questions.slice(0, 5).map((q) => q.kp?.split("/")[0]).filter(Boolean).slice(0, 4).join("，") || "考研，公考，核心考点";
      warnings = scanPrivacyIssues(questions);
      activeTab = warnings.length > 0 ? "privacy" : "config";
    }
  });

  const categories: Array<{ id: MarketplaceCategory; label: string }> = [
    { id: "general", label: "💡 逻辑/通识" },
    { id: "math", label: "📐 数理公式" },
    { id: "computer", label: "💻 计算机/408" },
    { id: "language", label: "🔤 外语词汇" },
    { id: "qualification", label: "⚖️ 法考/公考" },
    { id: "humanities", label: "📖 人文经典" },
    { id: "science", label: "🔬 经典物理" },
  ];

  function generateCatalogPackage(): string {
    const tags = pubTagsInput
      .split(/[,，\s]+/)
      .map((t) => t.trim())
      .filter(Boolean);

    const item = buildMarketplaceItemFromBank({
      id: pubId || `bank-${Date.now()}`,
      title: pubTitle,
      subtitle: pubSubtitle || undefined,
      description: pubDesc,
      category: pubCategory,
      tags,
      authorName: pubAuthor,
      version: pubVersion,
      license: pubLicense,
      questions,
    });

    return buildMarketplaceCatalogJson(
      `${pubAuthor} 的知识集市分享源`,
      `包含《${pubTitle}》等优质学习资源`,
      [item],
    );
  }

  function handlePreview() {
    generatedJson = generateCatalogPackage();
    activeTab = "preview";
  }

  async function handleCopyJson() {
    const json = generateCatalogPackage();
    try {
      await navigator.clipboard.writeText(json);
      showMessage("已复制集市订阅源 JSON 到剪贴板 ✓", 2500, "info");
    } catch {
      showMessage("写入剪贴板失败，请在预览面板中手动全选复制", 3000, "error");
    }
  }

  function handleDownloadJson() {
    const json = generateCatalogPackage();
    const fileName = `${pubId || "marketplace-catalog"}.json`;
    downloadBlobFile(json, fileName, "application/json;charset=utf-8;");
    showMessage(`已下载集市源文件 ${fileName} ✓`, 2800, "info");
  }
</script>

<svelte:window onkeydown={(e) => { if (open && e.key === "Escape") onclose(); }} />

{#if open}
  <div
    class="lv-modal-mask"
    role="dialog"
    aria-modal="true"
    aria-labelledby="mp-pub-title"
    tabindex="-1"
    onclick={(e) => { if (e.target === e.currentTarget) onclose(); }}
    onkeydown={(e) => { if (e.key === "Escape") onclose(); }}
  >
    <div
      class="lv-modal-card"
      style="max-width:680px;width:92vw;max-height:88vh;display:flex;flex-direction:column;padding:0;background:var(--lv-surface);border-radius:var(--lv-r-2);border:1px solid var(--lv-border);box-shadow:var(--lv-sh-pop);overflow:hidden"
    >
      <!-- 模态框顶部 -->
      <div style="padding:14px 20px;background:var(--lv-surface-2);border-bottom:1px solid var(--lv-border);display:flex;justify-content:space-between;align-items:center">
        <div style="display:flex;align-items:center;gap:8px">
          <span style="font-size:18px">📦</span>
          <h2 id="mp-pub-title" class="lv-h2" style="font-size:16px;margin:0;color:var(--lv-text)">
            题库打包并发布为集市源向导
          </h2>
          <span class="lv-chip sm lv-chip--acc num">{questions.length} 题</span>
        </div>
        <button type="button" class="lv-btn sm lv-btn--ghost" onclick={onclose} aria-label="关闭">
          ✕
        </button>
      </div>

      <!-- 分段导航 -->
      <div class="lv-row" style="margin:0;padding:8px 20px;gap:8px;background:var(--lv-surface);border-bottom:1px solid var(--lv-border-subtle)">
        <button
          type="button"
          class="lv-chip"
          class:acc={activeTab === "config"}
          onclick={() => (activeTab = "config")}
        >
          ⚙️ 资源元数据配置
        </button>
        <button
          type="button"
          class="lv-chip"
          class:acc={activeTab === "privacy"}
          onclick={() => (activeTab = "privacy")}
          style="display:inline-flex;align-items:center;gap:4px"
        >
          🛡️ 隐私与脱敏自检
          {#if warnings.length > 0}
            <span class="lv-chip sm num" style="background:var(--lv-accent-seal, #ef4444);color:var(--lv-on-accent, #ffffff);padding:0 5px;font-size:10px">
              {warnings.length}
            </span>
          {:else}
            <span class="lv-chip sm num" style="background:var(--lv-green);color:var(--lv-on-accent, #ffffff);padding:0 5px;font-size:10px">
              ✓
            </span>
          {/if}
        </button>
        <button
          type="button"
          class="lv-chip"
          class:acc={activeTab === "preview"}
          onclick={handlePreview}
        >
          👁️ JSON 预览与生成
        </button>
      </div>

      <!-- 内容主体 -->
      <div style="flex:1;overflow-y:auto;padding:16px 20px;display:flex;flex-direction:column;gap:14px">
        {#if activeTab === "config"}
          <div class="lv-row" style="gap:12px;margin:0">
            <div style="flex:2">
              <label class="lv-label" for="pub-title" style="font-size:12px;font-weight:700">题库名称</label>
              <input id="pub-title" class="lv-input" style="width:100%" bind:value={pubTitle} />
            </div>
            <div style="flex:1">
              <label class="lv-label" for="pub-id" style="font-size:12px;font-weight:700">唯一标识符 (ID)</label>
              <input id="pub-id" class="lv-input" style="width:100%" bind:value={pubId} />
            </div>
          </div>

          <div>
            <label class="lv-label" for="pub-sub" style="font-size:12px;font-weight:700">一句话亮点 (Subtitle)</label>
            <input id="pub-sub" class="lv-input" style="width:100%" bind:value={pubSubtitle} placeholder="例如：考研高频考点、公式推导与秒杀技巧精选" />
          </div>

          <div>
            <label class="lv-label" for="pub-desc" style="font-size:12px;font-weight:700">详细描述与适用范围</label>
            <textarea id="pub-desc" class="lv-textarea" style="width:100%;min-height:60px" bind:value={pubDesc}></textarea>
          </div>

          <div class="lv-row" style="gap:12px;margin:0">
            <div style="flex:1">
              <label class="lv-label" for="pub-cat" style="font-size:12px;font-weight:700">学科领域分类</label>
              <select id="pub-cat" class="lv-select" style="width:100%" bind:value={pubCategory}>
                {#each categories as cat (cat.id)}
                  <option value={cat.id}>{cat.label}</option>
                {/each}
              </select>
            </div>
            <div style="flex:1">
              <label class="lv-label" for="pub-author" style="font-size:12px;font-weight:700">署名作者</label>
              <input id="pub-author" class="lv-input" style="width:100%" bind:value={pubAuthor} />
            </div>
            <div style="flex:1">
              <label class="lv-label" for="pub-ver" style="font-size:12px;font-weight:700">发布版本号</label>
              <input id="pub-ver" class="lv-input" style="width:100%" bind:value={pubVersion} placeholder="1.0.0" />
            </div>
          </div>

          <div class="lv-row" style="gap:12px;margin:0">
            <div style="flex:1">
              <label class="lv-label" for="pub-lic" style="font-size:12px;font-weight:700">开放授权协议</label>
              <select id="pub-lic" class="lv-select" style="width:100%" bind:value={pubLicense}>
                <option value="Public Domain">Public Domain (公有领域无保留)</option>
                <option value="CC0">CC0 (自由放弃版权)</option>
                <option value="CC-BY-4.0">CC-BY-4.0 (需署名可商用)</option>
                <option value="CC-BY-NC-4.0">CC-BY-NC-4.0 (仅非商业使用)</option>
                <option value="MIT">MIT License</option>
              </select>
            </div>
            <div style="flex:2">
              <label class="lv-label" for="pub-tags" style="font-size:12px;font-weight:700">检索考点标签 (以逗号分隔)</label>
              <input id="pub-tags" class="lv-input" style="width:100%" bind:value={pubTagsInput} />
            </div>
          </div>

        {:else if activeTab === "privacy"}
          {#if warnings.length === 0}
            <div class="lv-card" style="padding:30px 20px;text-align:center;background:var(--lv-surface-2);border-radius:6px">
              <div style="font-size:32px;color:var(--lv-green)">✓</div>
              <h3 style="margin:10px 0 4px;font-size:15px;color:var(--lv-text)">隐私与脱敏自检完全通过</h3>
              <p class="lv-muted" style="font-size:13px;margin:0">
                本题库 {questions.length} 道题目中未检出 Windows/Unix 本地绝对文件路径或思源私有块超链接，可安全分享给他人。
              </p>
            </div>
          {:else}
            <div class="lv-card" style="padding:14px;background:var(--lv-surface-2);border-left:4px solid var(--lv-accent-seal, #ef4444);border-radius:6px">
              <div style="font-weight:700;font-size:13px;color:var(--lv-text);margin-bottom:4px">
                ⚠️ 检测到 {warnings.length} 处潜在的私有环境数据（他人在其电脑上无法正常访问）
              </div>
              <p class="lv-muted" style="font-size:12px;margin:0 0 10px">
                以下题目包含本地绝对磁盘路径或内部块 ID，建议在思源正文中清理或使用相对资源：
              </p>
              <div style="display:flex;flex-direction:column;gap:8px;max-height:240px;overflow-y:auto">
                {#each warnings as w, wi (wi)}
                  <div style="padding:8px 10px;background:var(--lv-surface);border-radius:4px;border:1px solid var(--lv-border-subtle);font-size:12px">
                    <div class="lv-row" style="margin:0 0 4px;gap:6px;align-items:center">
                      <span class="lv-chip sm lv-chip--red num">{w.type === "absolute_path" ? "绝对路径" : "私有块链接"}</span>
                      <span class="lv-muted">题目 ID: {w.questionId} ({w.field})</span>
                    </div>
                    <code style="font-size:11px;color:var(--lv-accent-seal, #ef4444)">{w.snippet}</code>
                    <div class="lv-muted" style="margin-top:2px;font-size:11px">💡 建议: {w.suggestion}</div>
                  </div>
                {/each}
              </div>
            </div>
          {/if}

        {:else if activeTab === "preview"}
          <div style="display:flex;flex-direction:column;gap:8px">
            <div class="lv-row" style="margin:0;justify-content:space-between;align-items:center">
              <span class="lv-muted" style="font-size:12px">符合 v: 1 规范的标准集市订阅源 JSON：</span>
              <span class="lv-chip sm num">{pubCategory} · v{pubVersion}</span>
            </div>
            <pre style="margin:0;padding:12px;background:var(--lv-surface-2);border-radius:6px;border:1px solid var(--lv-border);font-size:11px;max-height:280px;overflow-y:auto;font-family:monospace;white-space:pre-wrap;color:var(--lv-text)">{generatedJson || generateCatalogPackage()}</pre>
          </div>
        {/if}
      </div>

      <!-- 底部行动栏 -->
      <div style="padding:14px 20px;background:var(--lv-surface-2);border-top:1px solid var(--lv-border);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
        <div class="lv-muted" style="font-size:12px">
          可直接托管在 GitHub Gist、Gitee 或个人服务器作为自建订阅源使用
        </div>
        <div class="lv-row" style="margin:0;gap:8px">
          <button type="button" class="lv-btn lv-btn--ghost" onclick={handleCopyJson}>
            <Icon name="copy" size={13} /> 📋 复制 JSON 代码
          </button>
          <button type="button" class="lv-btn lv-btn--primary" onclick={handleDownloadJson}>
            <Icon name="download" size={13} /> 📥 下载 catalog.json
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  .lv-modal-mask {
    position: fixed;
    inset: 0;
    z-index: 1000;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--lv-modal-mask-bg, rgba(0, 0, 0, 0.45));
    backdrop-filter: blur(2px);
  }
</style>
