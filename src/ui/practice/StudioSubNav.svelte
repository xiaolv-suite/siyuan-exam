<script lang="ts">
  import Icon from "../shared/Icon.svelte";

  interface Props {
    currentView: string;
    t: (k: string, fb?: string) => string;
    onchangeView: (view: "manual" | "materials" | "import" | "ai") => void;
  }

  let { currentView, t, onchangeView }: Props = $props();
</script>

<nav class="lv-studio-nav" aria-label="出题工作台">
  <button
    type="button"
    class="lv-studio-tab"
    class:active={currentView === "manual"}
    onclick={() => onchangeView("manual")}
    aria-current={currentView === "manual" ? "page" : undefined}
  >
    <Icon name="pencil" size={13} /> {t("tab.manual", "手工录题")}
  </button>
  <button
    type="button"
    class="lv-studio-tab"
    class:active={currentView === "materials"}
    onclick={() => onchangeView("materials")}
    aria-current={currentView === "materials" ? "page" : undefined}
  >
    <Icon name="book" size={13} /> {t("tab.materials", "学习资料")}
  </button>
  <button
    type="button"
    class="lv-studio-tab"
    class:active={currentView === "import"}
    onclick={() => onchangeView("import")}
    aria-current={currentView === "import" ? "page" : undefined}
  >
    <Icon name="import" size={13} /> {t("tab.import", "批量导入")}
  </button>
  <button
    type="button"
    class="lv-studio-tab"
    class:active={currentView === "ai"}
    onclick={() => onchangeView("ai")}
    aria-current={currentView === "ai" ? "page" : undefined}
  >
    <Icon name="sparkles" size={13} /> {t("tab.ai", "AI 出题")}
  </button>
</nav>
