<script lang="ts">
  import Icon from "../shared/Icon.svelte";
  import type { BankInfo } from "../../app";
  import type { BankCategory, BankCategoryMeta } from "@/core/bankCategory";

  interface Props {
    open: boolean;
    banks: BankInfo[];
    activeBankId: string;
    creating: boolean;
    offline: boolean;
    t: (k: string, fb?: string) => string;
    getBankCategoryMeta: (cat?: BankCategory | string | null) => BankCategoryMeta;
    onclose: () => void;
    onselectBank: (id: string) => void;
    oncreateSampleBank: (kind: "general" | "cantonese" | "english" | "qualification" | "k12" | "higher") => void;
    onrenameBank: (id: string, newName: string) => Promise<void>;
    oncycleBankCategory: (b: BankInfo) => Promise<void>;
    onsyncBankToDoc: (id: string) => Promise<void>;
    onremoveBank: (id: string) => Promise<void>;
  }

  let {
    open,
    banks,
    activeBankId,
    creating,
    offline,
    t,
    getBankCategoryMeta,
    onclose,
    onselectBank,
    oncreateSampleBank,
    onrenameBank,
    oncycleBankCategory,
    onsyncBankToDoc,
    onremoveBank,
  }: Props = $props();

  let bankFilterCategory = $state<string>("all");
  let bankFilterKeyword = $state("");
  let renamingBankId = $state("");
  let renameInputName = $state("");

  const filteredBanks = $derived(
    banks.filter((b) => {
      if (bankFilterCategory === "exam" && b.category !== "exam" && b.category !== "certificate") return false;
      if (bankFilterCategory === "higher" && b.category !== "higher" && b.category !== "k12") return false;
      if (bankFilterCategory === "language" && b.category !== "language") return false;
      if (bankFilterCategory === "teaching" && b.category !== "teaching") return false;
      if (bankFilterCategory === "general" && (b.category || "general") !== "general") return false;
      if (bankFilterKeyword.trim() && !b.name.toLowerCase().includes(bankFilterKeyword.trim().toLowerCase())) return false;
      return true;
    }),
  );

  function startRename(b: BankInfo) {
    renamingBankId = b.id;
    renameInputName = b.name;
  }

  async function submitRename(id: string) {
    if (!renameInputName.trim()) return;
    await onrenameBank(id, renameInputName.trim());
    renamingBankId = "";
  }
</script>

<svelte:window onkeydown={(e) => { if (open && e.key === "Escape") { e.stopPropagation(); onclose(); } }} />

{#if open}
  <button type="button" class="lv-hotkeys-backdrop" aria-label="关闭" onclick={onclose}></button>
  <div class="lv-hotkeys-wrap">
    <div class="lv-card" role="dialog" aria-modal="true" tabindex="-1" aria-label={t("bank.hubTitle")} style="width:min(640px, 100%);max-height:85vh;overflow-y:auto;pointer-events:auto;padding:24px;border-radius:var(--lv-r-card, 20px);box-shadow:var(--lv-sh-pop);border:1px solid var(--lv-border-subtle)">
      <div class="lv-row" style="justify-content:space-between;margin:0 0 12px">
        <div class="lv-dialog-title-wrap">
          <span class="lv-dialog-title-icon"><Icon name="folder" size={13} /></span>
          <span>{t("bank.hubTitle")}</span>
          <span class="lv-dialog-title-tag">{banks.length} 题库</span>
        </div>
        <button class="lv-btn sm lv-btn--ghost" onclick={onclose} aria-label="关闭"><Icon name="close" size={13} /></button>
      </div>
      <div class="lv-session-dock" role="tablist" aria-label="场景分类过滤" style="margin:0 0 12px;width:100%;overflow-x:auto">
        <button type="button" role="tab" class="lv-chip" class:acc={bankFilterCategory === "all"} aria-selected={bankFilterCategory === "all"} onclick={() => bankFilterCategory = "all"}>
          全部 ({banks.length})
        </button>
        <button type="button" role="tab" class="lv-chip" class:acc={bankFilterCategory === "exam" || bankFilterCategory === "certificate"} aria-selected={bankFilterCategory === "exam" || bankFilterCategory === "certificate"} onclick={() => bankFilterCategory = "exam"}>
          <Icon name="award" size={12} /> 资格考证 ({banks.filter((b) => b.category === "exam" || b.category === "certificate").length})
        </button>
        <button type="button" role="tab" class="lv-chip" class:acc={bankFilterCategory === "k12" || bankFilterCategory === "higher"} aria-selected={bankFilterCategory === "k12" || bankFilterCategory === "higher"} onclick={() => bankFilterCategory = "higher"}>
          <Icon name="book" size={12} /> 升学学术 ({banks.filter((b) => b.category === "k12" || b.category === "higher").length})
        </button>
        <button type="button" role="tab" class="lv-chip" class:acc={bankFilterCategory === "language"} aria-selected={bankFilterCategory === "language"} onclick={() => bankFilterCategory = "language"}>
          <Icon name="volume" size={12} /> 语言 ({banks.filter((b) => b.category === "language").length})
        </button>
        <button type="button" role="tab" class="lv-chip" class:acc={bankFilterCategory === "teaching"} aria-selected={bankFilterCategory === "teaching"} onclick={() => bankFilterCategory = "teaching"}>
          <Icon name="users" size={12} /> 教研 ({banks.filter((b) => b.category === "teaching").length})
        </button>
        <button type="button" role="tab" class="lv-chip" class:acc={bankFilterCategory === "general"} aria-selected={bankFilterCategory === "general"} onclick={() => bankFilterCategory = "general"}>
          <Icon name="grid" size={12} /> 通识 ({banks.filter((b) => (b.category || "general") === "general").length})
        </button>
      </div>
      <div class="lv-row" style="margin:0 0 12px;gap:8px;flex-wrap:wrap">
        <div style="position:relative;flex:1;min-width:160px;display:flex;align-items:center">
          <span style="position:absolute;left:10px;pointer-events:none;color:var(--lv-text-3);display:flex;align-items:center" aria-hidden="true">
            <Icon name="search" size={14} />
          </span>
          <input class="lv-input" style="width:100%;padding-left:32px;padding-right:28px" placeholder="按题库名称快速过滤…" aria-label="按题库名称快速过滤" bind:value={bankFilterKeyword} />
          {#if bankFilterKeyword}
            <button type="button" class="lv-btn sm lv-btn--ghost" onclick={() => { bankFilterKeyword = ""; }} title="清空搜索" aria-label="清空搜索" style="position:absolute;right:4px;padding:2px 4px;min-width:20px;min-height:20px"><Icon name="close" size={12} /></button>
          {/if}
        </div>
        <div class="lv-row" style="margin:0;gap:4px;flex-wrap:wrap">
          <button class="lv-btn sm lv-btn--ghost" onclick={() => { onclose(); oncreateSampleBank("qualification"); }} disabled={creating || offline} aria-busy={creating} title="一键体验教师资格证与基金从业资格真题题库">
            <Icon name="award" size={12} /> 考证
          </button>
          <button class="lv-btn sm lv-btn--ghost" onclick={() => { onclose(); oncreateSampleBank("higher"); }} disabled={creating || offline} aria-busy={creating} title="体验大学高数与考研学术题库">
            <Icon name="academic" size={12} /> 高数
          </button>
          <button class="lv-btn sm lv-btn--ghost" onclick={() => { onclose(); oncreateSampleBank("k12"); }} disabled={creating || offline} aria-busy={creating} title="体验K12初高中全科基础题库">
            <Icon name="book" size={12} /> K12
          </button>
          <button class="lv-btn sm lv-btn--ghost" onclick={() => { onclose(); oncreateSampleBank("english"); }} disabled={creating || offline} aria-busy={creating} title="体验大学英语雅思词汇与发音研学题库">
            <Icon name="volume" size={12} /> 英语
          </button>
          <button class="lv-btn sm lv-btn--ghost" onclick={() => { onclose(); oncreateSampleBank("cantonese"); }} disabled={creating || offline} aria-busy={creating} title="体验粤语日常实用口语与粤拼听读研学题库">
            <Icon name="mic" size={12} /> 粤语
          </button>
          <button class="lv-btn sm lv-btn--ghost" onclick={() => { onclose(); oncreateSampleBank("general"); }} disabled={creating || offline} aria-busy={creating} title="体验综合基础演示题库">
            <Icon name="grid" size={12} /> 通识
          </button>
        </div>
      </div>
      <div class="stack-sm" style="max-height:450px;overflow-y:auto">
        {#each filteredBanks as b (b.id)}
          <div class="lv-card lv-card--hover" style="padding:12px 14px;margin-bottom:6px;border-radius:var(--lv-r-2, 10px);border:1px solid var(--lv-border-subtle);border-left:3.5px solid {b.id === activeBankId ? 'var(--lv-accent)' : 'transparent'};background:var(--lv-surface-2)">
            <div class="lv-row" style="justify-content:space-between;align-items:center;margin:0 0 6px">
              <div style="flex:1;min-width:0;margin-right:8px">
                {#if renamingBankId === b.id}
                  <div class="lv-row" style="margin:0;gap:4px;align-items:center">
                    <input class="lv-input sm" style="max-width:180px" bind:value={renameInputName} placeholder="输入新题库名…" aria-label="输入新题库名称" />
                    <button class="lv-btn sm lv-btn--primary" onclick={() => void submitRename(b.id)}>保存</button>
                    <button class="lv-btn sm lv-btn--ghost" onclick={() => { renamingBankId = ""; }}>取消</button>
                  </div>
                {:else}
                  <b style="font-size:var(--lv-font-size-body)">{b.name}</b>
                  <button type="button" class={`lv-scene-badge lv-scene-badge--${b.category || "general"}`} style="margin-left:6px;display:inline-flex;align-items:center;gap:4px" onclick={() => void oncycleBankCategory(b)} title="点击切换研学场景分类（备考/语言/教研/通识）" aria-label={`切换研学场景分类: ${b.name}`}><span>{getBankCategoryMeta(b.category).badge}</span> <Icon name="rotate" size={11} /></button>
                  {#if b.id === activeBankId}<span class="lv-chip sm lv-chip--acc" style="margin-left:4px">当前激活</span>{/if}
                  <div class="lv-muted" style="font-size:11px;margin-top:2px">ID: {b.id} · 创建于 {new Date(b.createdAt || Date.now()).toLocaleDateString()}</div>
                {/if}
              </div>
              <div class="lv-row" style="margin:0;gap:4px">
                {#if renamingBankId !== b.id}
                  <button class="lv-btn sm lv-btn--ghost" onclick={() => startRename(b)} title={t("bank.rename")}>
                    <Icon name="pencil" size={12} /> {t("bank.rename")}
                  </button>
                {/if}
                {#if b.id !== activeBankId}
                  <button class="lv-btn sm lv-btn--primary" onclick={() => onselectBank(b.id)} aria-label={`激活题库: ${b.name}`}>
                    激活开练
                  </button>
                {/if}
                <button class="lv-btn sm lv-btn--ghost" onclick={() => void onsyncBankToDoc(b.id)} title="将整套题库题册格式化同步为思源原生文档，折叠答案，卸载插件依然永久保留" aria-label={`同步题库到思源文档: ${b.name}`}>
                  <Icon name="file" size={12} /> {t("bank.syncToDoc")}
                </button>
                <button class="lv-btn sm lv-btn--ghost" onclick={() => void onremoveBank(b.id)} title={t("bank.removeTitle")} aria-label={t("bank.removeTitle")}>
                  <Icon name="trash" size={12} />
                </button>
              </div>
            </div>
          </div>
        {/each}
      </div>
    </div>
  </div>
{/if}
