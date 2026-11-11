<script lang="ts">
  import Icon from "../shared/Icon.svelte";
  import { validateLatexSyntax } from "@/core/math";
  import { computeStemSimilarity, splitRawOptionsText } from "@/core/textDiff";
  import type { Question, QuestionLifecycleStatus } from "../../core/types";
  import StudioSubNav from "./StudioSubNav.svelte";
  import { handleTablistKeydown } from "./services/practiceKeyboardService";

  interface Props {
    existingQuestions?: Question[];
    pinAttributes?: boolean;
    mType: "single" | "multiple" | "judge" | "fill" | "short";
    mStem: string;
    mOptions: string[];
    mAnswer: string;
    mAnalysis: string;
    mExpansion?: string;
    mKp: string;
    mSecondaryKps?: string;
    mPrerequisites?: string;
    mSource: string;
    mGroup: string;
    mSpecOpen: boolean;
    mSpecUnit: string;
    mSpecAbsTol: string;
    mSpecRelPct: string;
    mSpecAltUnits: string;
    mSpecOrderIndependent?: boolean;
    mRubricOpen: boolean;
    mRubricText: string;
    authorRubricPreview: any;
    mStatus: QuestionLifecycleStatus;
    mStudyLang: string;
    mStudyPhonetic: string;
    mSaving: boolean;
    mSaved: string;
    manualErrorMsg: string;
    manualErrorField: string;
    manualSymbolTab: "math" | "pinyin" | "phonetic";
    draftRestored: boolean;
    ocrModalOpen: boolean;
    ocrInputText: string;
    ocrUploadBusy: boolean;
    t: (k: string, fb?: string) => string;
    sanitizeRichHtml: (s: string) => string;
    renderMathInText: (s: string) => string;
    renderMathDiagramsInText: (s: string) => string;
    removeChoiceOption: (type: any, opts: string[], ans: string, idx: number) => { options: string[]; answer: string };
    onback: () => void;
    onchangeView: (view: "manual" | "materials" | "import" | "ai") => void;
    onmanualPaste: (e: ClipboardEvent) => void;
    onopenOcrModal: () => void;
    onnormalizeFormulas: () => void;
    oninsertMathSnippet: (snip: string) => void;
    onapplyOcrFill: () => void;
    onfileInputChange: (e: Event) => void;
    onswitchManualType: (t: any) => void;
    onclearManualValidation: () => void;
    onsetCorrectOption: (idx: number) => void;
    onsaveManual: (status: QuestionLifecycleStatus) => void;
    onblankManualDraft: () => void;
    onshowChartMessage: () => void;
    mSourceBlockId?: string;
    onopenInSiYuan?: (rootId?: string, blockId?: string, opt?: any) => void;
    onsearchSiyuanDocs?: (query: string) => Promise<Array<{ id: string; title: string; hpath: string }>>;
  }

  let {
    existingQuestions = [],
    pinAttributes = $bindable(false),
    mType = $bindable(),
    mStem = $bindable(),
    mOptions = $bindable(),
    mAnswer = $bindable(),
    mAnalysis = $bindable(),
    mExpansion = $bindable(""),
    mKp = $bindable(),
    mSecondaryKps = $bindable(""),
    mPrerequisites = $bindable(""),
    mSource = $bindable(),
    mGroup = $bindable(),
    mSpecOpen = $bindable(),
    mSpecUnit = $bindable(),
    mSpecAbsTol = $bindable(),
    mSpecRelPct = $bindable(),
    mSpecAltUnits = $bindable(),
    mSpecOrderIndependent = $bindable(false),
    mRubricOpen = $bindable(),
    mRubricText = $bindable(),
    authorRubricPreview,
    mStatus = $bindable(),
    mStudyLang = $bindable(),
    mStudyPhonetic = $bindable(),
    mSaving,
    mSaved,
    manualErrorMsg,
    manualErrorField,
    manualSymbolTab = $bindable(),
    draftRestored,
    ocrModalOpen = $bindable(),
    ocrInputText = $bindable(),
    ocrUploadBusy,
    t,
    sanitizeRichHtml,
    renderMathInText,
    renderMathDiagramsInText,
    removeChoiceOption,
    onback,
    onchangeView,
    onmanualPaste,
    onopenOcrModal,
    onnormalizeFormulas,
    oninsertMathSnippet,
    onapplyOcrFill,
    onfileInputChange,
    onswitchManualType,
    onclearManualValidation,
    onsetCorrectOption,
    onsaveManual,
    onblankManualDraft,
    onshowChartMessage,
    mSourceBlockId = $bindable(""),
    onopenInSiYuan = () => {},
    onsearchSiyuanDocs = async () => [],
  }: Props = $props();

  const stemLatexIssue = $derived(validateLatexSyntax(mStem));
  const analysisLatexIssue = $derived(validateLatexSyntax(mAnalysis));

  let docPickerOpen = $state(false);
  let docPickerSearch = $state("");
  let docPickerCandidates = $state<Array<{ id: string; title: string; hpath: string }>>([]);
  let docPickerBusy = $state(false);
  let syncAppendToNote = $state(false);

  async function searchDocsForManual(q: string) {
    docPickerBusy = true;
    try {
      docPickerCandidates = await onsearchSiyuanDocs(q);
    } finally {
      docPickerBusy = false;
    }
  }

  function pickDocForManual(doc: { id: string; title: string; hpath: string }) {
    mSourceBlockId = doc.id;
    mSource = doc.title;
    if (!mKp.trim()) mKp = doc.title;
    docPickerOpen = false;
  }

  function swapOptions(from: number, to: number) {
    if (from < 0 || to < 0 || from >= mOptions.length || to >= mOptions.length) return;
    const fromLetter = String.fromCharCode(65 + from);
    const toLetter = String.fromCharCode(65 + to);
    const nextOpts = [...mOptions];
    const temp = nextOpts[from];
    nextOpts[from] = nextOpts[to];
    nextOpts[to] = temp;
    mOptions = nextOpts;

    if (mAnswer.includes(fromLetter) || mAnswer.includes(toLetter)) {
      const letters = mAnswer.split("");
      const updated = letters.map((l) => {
        if (l === fromLetter) return toLetter;
        if (l === toLetter) return fromLetter;
        return l;
      });
      mAnswer = updated.sort().join("");
    }
  }

  const hasStem = $derived(Boolean(mStem.trim()));
  const hasAnswer = $derived(Boolean(mAnswer.trim() || mType === "short"));
  const isReady = $derived(hasStem && hasAnswer);

  function handleKeydown(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      if (!mSaving && hasStem) {
        e.preventDefault();
        if (!hasAnswer && mType === "single" && mOptions.length >= 2) {
          onsetCorrectOption(0);
        }
        void onsaveManual("published");
      }
    }
  }

  // 题干近重复查重预警
  let nearDupeMatched = $state<Question | null>(null);
  let nearDupeSimilarity = $state<number>(0);
  let checkTimer: ReturnType<typeof setTimeout> | null = null;

  function runNearDupeCheck() {
    if (checkTimer) clearTimeout(checkTimer);
    checkTimer = setTimeout(() => {
      const stem = mStem.trim();
      if (stem.length < 5 || !existingQuestions || !existingQuestions.length) {
        nearDupeMatched = null;
        nearDupeSimilarity = 0;
        return;
      }
      let bestQ: Question | null = null;
      let maxSim = 0;
      for (const eq of existingQuestions) {
        const sim = computeStemSimilarity(stem, eq.stem);
        if (sim > maxSim) {
          maxSim = sim;
          bestQ = eq;
        }
      }
      if (maxSim >= 0.78 && bestQ) {
        nearDupeMatched = bestQ;
        nearDupeSimilarity = maxSim;
      } else {
        nearDupeMatched = null;
        nearDupeSimilarity = 0;
      }
    }, 180);
  }

  $effect(() => {
    if (mStem) {
      runNearDupeCheck();
    } else {
      nearDupeMatched = null;
    }
  });

  function applyNearDupeMetadata() {
    if (!nearDupeMatched) return;
    if (nearDupeMatched.kp && !mKp) mKp = nearDupeMatched.kp;
    if (nearDupeMatched.analysis && !mAnalysis) mAnalysis = nearDupeMatched.analysis;
    if (nearDupeMatched.options && nearDupeMatched.options.length && (!mOptions.length || mOptions.every((o) => !o.trim()))) {
      mOptions = [...nearDupeMatched.options];
    }
    if (nearDupeMatched.answer && !mAnswer) mAnswer = nearDupeMatched.answer;
  }

  // 选项整段秒拆
  let quickSplitOpen = $state(false);
  let quickSplitInput = $state("");

  function applyQuickSplit() {
    if (!quickSplitInput.trim()) return;
    const res = splitRawOptionsText(quickSplitInput);
    if (res.options.length > 0) {
      mOptions = res.options;
      if (res.answer && !mAnswer) {
        mAnswer = res.answer;
      }
      quickSplitOpen = false;
      quickSplitInput = "";
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="lv-pad" onpaste={onmanualPaste}>
  <div class="lv-screen-head" style="margin:0 0 10px">
    <div class="lv-row" style="margin:0;align-items:baseline;justify-content:space-between;flex-wrap:wrap;gap:8px">
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        <h1 class="lv-h1" style="font-size:18px;margin:0">{t("head.manual.title")}</h1>
        <span class="lv-muted" style="font-size:12px">{t("head.manual.desc")}</span>
      </div>
      <span class="lv-eyebrow" style="margin:0">{t("head.manual.eyebrow")}</span>
    </div>
  </div>
  <StudioSubNav currentView="manual" {t} {onchangeView} />
  <div class="lv-row">
    <button class="lv-btn lv-btn--ghost lv-mobile-back" onclick={onback} style="display:inline-flex;align-items:center;gap:4px"><Icon name="chev-left" size={13} /> {t("mode.practice")}</button>
    <span class="lv-chip">{t("manual.title")}</span>
    <button class="lv-btn sm lv-btn--primary" onclick={onopenOcrModal} title="粘贴整段试题文本或试卷图片，一键智能拆分填入所有字段"><Icon name="sparkles" size={13} /> ⚡ 智能粘贴拆单</button>
    <button class="lv-btn sm" onclick={onnormalizeFormulas} title="清洗题干与选项中公式的空格与语法"><Icon name="sparkles" size={13} /> {t("manual.formulaNormalize")}</button>
    <select class="lv-select" style="max-width:135px" aria-label="插入数学图表" onchange={(e) => {
      const val = (e.target as HTMLSelectElement).value;
      if (!val) return;
      if (val === "plot") {
        const plotTpl = `\n\n\`\`\`math-plot\ny = x^2 - 2\nx: [-3, 3]\ny: [-3, 5]\ntitle: 函数图像 y = x² - 2\n\`\`\`\n`;
        mStem = (mStem ? mStem.trim() : "") + plotTpl;
      } else if (val === "diagram") {
        const diagTpl = `\n\n\`\`\`math-diagram\ntriangle: A(140, 20), B(40, 160), C(240, 160)\n\`\`\`\n`;
        mStem = (mStem ? mStem.trim() : "") + diagTpl;
      } else if (val === "bar") {
        const barTpl = `\n\n\`\`\`math-bar\ntitle: 统计柱状图\n"一季度": 35\n"二季度": 58\n"三季度": 82\n"四季度": 95\n\`\`\`\n`;
        mStem = (mStem ? mStem.trim() : "") + barTpl;
      } else if (val === "pie") {
        const pieTpl = `\n\n\`\`\`math-pie\ntitle: 成绩占比扇形图\n"优秀": 25\n"良好": 45\n"及格": 20\n"待提高": 10\n\`\`\`\n`;
        mStem = (mStem ? mStem.trim() : "") + pieTpl;
      } else if (val === "numberline") {
        const nlTpl = `\n\n\`\`\`math-numberline\ntitle: 不等式解集区间\nrange: [-4, 6]\ninterval: [-1, 3)\n\`\`\`\n`;
        mStem = (mStem ? mStem.trim() : "") + nlTpl;
      }
      (e.target as HTMLSelectElement).value = "";
      onshowChartMessage();
    }}>
      <option value="">插入数学图表…</option>
      <option value="plot">{t("manual.insertPlot")}</option>
      <option value="diagram">{t("manual.insertDiagram")}</option>
      <option value="bar">{t("manual.insertBar")}</option>
      <option value="pie">{t("manual.insertPie")}</option>
      <option value="numberline">{t("manual.insertNumberLine")}</option>
    </select>
    {#if draftRestored}<span class="lv-chip lv-chip--amb">{t("manual.draftRestored")}</span>{/if}
    {#if mSaved}<span class="lv-chip lv-chip--grn num" style="display:inline-flex;align-items:center;gap:4px"><Icon name="check" size={11} /> {mSaved}</span>{/if}
  </div>
  {#if ocrModalOpen}
    <div class="lv-card" style="margin:10px 0;background:var(--lv-surface-2);border:1px solid var(--lv-accent-soft);border-radius:var(--lv-r-3, 16px);box-shadow:var(--lv-sh-1)">
      <label class="lv-field">
        <span style="font-weight:var(--lv-font-weight-semibold);display:flex;align-items:center;gap:6px">
          <Icon name="sparkles" size={14} /> ⚡ 智能试题文本拆单与识别填入
        </span>
        <textarea class="lv-input lv-textarea" style="min-height:100px;margin-top:6px" bind:value={ocrInputText} aria-label="智能拆单文本" placeholder="直接粘贴整段试题文本（支持任意排版：单选、多选、判断、填空、问答，自动拆分题干、A/B/C/D 选项、答案、解析与考点）"></textarea>
      </label>
      <div class="lv-row" style="margin-top:8px">
        <button class="lv-btn lv-btn--primary sm" onclick={onapplyOcrFill} disabled={!ocrInputText.trim()}>
          <Icon name="sparkles" size={13} /> 一键智能拆分填入
        </button>
        <button type="button" class="lv-btn sm lv-btn--ghost" disabled={ocrUploadBusy} onclick={(e) => ((e.currentTarget as HTMLElement).nextElementSibling as HTMLInputElement | null)?.click()}>
          <Icon name="camera" size={13} /> {ocrUploadBusy ? t("manual.ocrUploading") : "选择试卷图片识别"}
        </button>
        <input type="file" accept="image/*" style="display:none" onchange={onfileInputChange} disabled={ocrUploadBusy} />
        <span class="lv-muted" style="font-size:var(--lv-font-size-caption)">支持快捷键 Ctrl+V 直接粘贴试卷图片或文本</span>
        <button class="lv-btn lv-btn--ghost sm" style="margin-left:auto" onclick={() => (ocrModalOpen = false)}>取消</button>
      </div>
    </div>
  {/if}
  <div class="lv-row" style="margin:6px 0 10px;gap:6px;align-items:center;flex-wrap:wrap">
    <span class="lv-muted" style="font-size:11px">⚡ 快速填充题型模板：</span>
    <button type="button" class="lv-chip sm" onclick={() => {
      mType = "single";
      mStem = "计算机网络中负责端到端可靠数据传输的协议是？";
      mOptions = ["TCP", "UDP", "IP", "ICMP"];
      mAnswer = "A";
      mAnalysis = "TCP（传输控制协议）提供面向连接的、可靠的字节流传输服务。";
      mKp = "计算机网络/传输层";
    }}>单选题</button>
    <button type="button" class="lv-chip sm" onclick={() => {
      mType = "multiple";
      mStem = "下列各项中，属于操作系统基本特征的有？";
      mOptions = ["并发", "共享", "虚拟", "异步"];
      mAnswer = "ABCD";
      mAnalysis = "操作系统的四大基本特征为并发性、共享性、虚拟性和异步性。";
      mKp = "操作系统/基础概念";
    }}>多选题</button>
    <button type="button" class="lv-chip sm" onclick={() => {
      mType = "judge";
      mStem = "死锁是指两个或两个以上的进程因争夺系统资源而产生的一种互相等待的现象。";
      mOptions = [];
      mAnswer = "对";
      mAnalysis = "死锁产生的四个必要条件：互斥、请求与保持、不剥夺、循环等待。";
      mKp = "操作系统/死锁处理";
    }}>判断题</button>
    <button type="button" class="lv-chip sm" onclick={() => {
      mType = "fill";
      mStem = "在 TCP/IP 参考模型中，网络层主要通过 ____ 协议实现不同网络之间的寻址与路由转发。";
      mOptions = [];
      mAnswer = "IP";
      mAnalysis = "IP 协议（网际协议）是 TCP/IP 体系中网络层的核心协议。";
      mKp = "计算机网络/网络层";
    }}>填空题</button>
    <button type="button" class="lv-chip sm" onclick={() => {
      mType = "short";
      mStem = "简述进程与线程的区别与联系。";
      mOptions = [];
      mAnswer = "1. 进程是系统资源分配的基本单位；\n2. 线程是 CPU 调度和执行的基本单位；\n3. 一个进程可以包含多个线程，同一进程下的线程共享该进程的地址空间和资源。";
      mAnalysis = "经典核心考点，重点区分资源拥有权与调度单位。";
      mKp = "操作系统/进程与线程";
    }}>简答题</button>
  </div>
  <div class="lv-studio-grid lv-studio-grid--manual">
    <div class="lv-card lv-pad-card lv-studio-form" data-manual-form>
      {#if manualErrorMsg}
        <div class="lv-error" id="manual-validation-error" role="alert" tabindex="-1" style="display:flex;align-items:center;gap:6px;margin:0 0 12px">
          <Icon name="alert-triangle" size={14} />
          <span>{manualErrorMsg}</span>
        </div>
      {/if}
      <div class="lv-row" style="margin:0 0 12px;gap:var(--lv-space-3);flex-wrap:wrap;align-items:center;justify-content:space-between">
        <div class="lv-session-dock" role="group" aria-label={t("manual.type", "题型")}>
          <span class="lv-chip" style="color:var(--lv-text-3);cursor:default">{t("manual.type")}</span>
          {#each ["single", "multiple", "judge", "fill", "short"] as tt, _i (_i)}
            <button type="button" class="lv-chip" class:acc={mType === tt} aria-pressed={mType === tt} onclick={() => void onswitchManualType(tt)}>{t("qtype." + tt)}</button>
          {/each}
          <button
            type="button"
            class="lv-chip"
            class:acc={pinAttributes}
            onclick={() => { pinAttributes = !pinAttributes; }}
            title="📌 锁定属性：开启后录题入库自动锁定保留当前题型、考点与出处标签，清空题干与选项并聚焦首行，适合连续批量制题"
            style="font-weight:600;display:inline-flex;align-items:center;gap:4px"
          >
            <Icon name="pin" size={12} /> {pinAttributes ? "属性已锁定" : "锁定属性"}
          </button>
        </div>
        <div class="lv-row" style="margin:0;gap:6px">
          <button type="button" class="lv-chip sm lv-chip--acc" title="一键填充典型单选题示范，无需手动逐个敲字" onclick={() => {
            onswitchManualType("single");
            mStem = "计算机网络中，HTTP 默认使用的传输层端口号是？";
            mOptions = ["80", "443", "8080", "22"];
            mAnswer = "A";
            mAnalysis = "HTTP 协议默认端口为 80，HTTPS 默认端口为 443。";
            mKp = "计算机网络/应用层";
            onclearManualValidation();
          }}>⚡ 填入选择题示例</button>
          <button type="button" class="lv-chip sm lv-chip--acc" title="一键填充典型填空题示范" onclick={() => {
            onswitchManualType("fill");
            mStem = "在中华人民共和国境内，一切权力属于____。";
            mAnswer = "人民";
            mAnalysis = "《宪法》第二条规定：中华人民共和国的一切权力属于人民。";
            mKp = "宪法学/国家制度";
            onclearManualValidation();
          }}>⚡ 填入填空题示例</button>
        </div>
      </div>
      <div class="lv-field">
        <div class="lv-row" style="justify-content:space-between;align-items:center;margin:0 0 6px">
          <label class="lv-muted" for="lv-manual-stem" style="font-weight:600;font-size:13px">
            {t("manual.stem")} <span style="color:var(--lv-accent-seal)">*</span>
          </label>
          <div class="lv-session-dock" role="tablist" tabindex="-1" aria-label="符号分类" style="margin:0" onkeydown={handleTablistKeydown}>
            <button type="button" role="tab" tabindex={manualSymbolTab === "math" ? 0 : -1} class="lv-chip sm" class:acc={manualSymbolTab === "math"} aria-selected={manualSymbolTab === "math"} onclick={() => (manualSymbolTab = "math")}><Icon name="compass" size={12} /> 数理</button>
            <button type="button" role="tab" tabindex={manualSymbolTab === "pinyin" ? 0 : -1} class="lv-chip sm" class:acc={manualSymbolTab === "pinyin"} aria-selected={manualSymbolTab === "pinyin"} onclick={() => (manualSymbolTab = "pinyin")}><Icon name="edit" size={12} /> 拼音</button>
            <button type="button" role="tab" tabindex={manualSymbolTab === "phonetic" ? 0 : -1} class="lv-chip sm" class:acc={manualSymbolTab === "phonetic"} aria-selected={manualSymbolTab === "phonetic"} onclick={() => (manualSymbolTab = "phonetic")}><Icon name="mic" size={12} /> 音标</button>
          </div>
        </div>
        <!-- 独立的符号快捷工具条，绝不挤压 label -->
        <div class="lv-symbol-dock-row" role="toolbar" aria-label="符号快捷选择栏" style="margin-bottom:8px;padding:4px 6px;background:var(--lv-surface-2);border-radius:var(--lv-r-2);border:1px solid var(--lv-border-subtle);display:flex;flex-wrap:wrap;gap:4px;max-width:100%">
          {#if manualSymbolTab === "math"}
            <button type="button" class="lv-chip sm" title="上标 x²" onclick={() => oninsertMathSnippet("x^2")}>x²</button>
            <button type="button" class="lv-chip sm" title="根号 √x" onclick={() => oninsertMathSnippet("\\sqrt{x}")}>√x</button>
            <button type="button" class="lv-chip sm" title="分式 a/b" onclick={() => oninsertMathSnippet("\\frac{a}{b}")}>a/b</button>
            <button type="button" class="lv-chip sm" title="求和 ∑" onclick={() => oninsertMathSnippet("\\sum_{i=1}^n")}>∑</button>
            <button type="button" class="lv-chip sm" title="积分 ∫" onclick={() => oninsertMathSnippet("\\int")}>∫</button>
            <button type="button" class="lv-chip sm" title="极限 lim" onclick={() => oninsertMathSnippet("\\lim_{x \\to 0}")}>lim</button>
            <button type="button" class="lv-chip sm" title="偏导 ∂" onclick={() => oninsertMathSnippet("\\partial")}>∂</button>
            <button type="button" class="lv-chip sm" title="圆周率 π" onclick={() => oninsertMathSnippet("\\pi")}>π</button>
            <button type="button" class="lv-chip sm" title="正负号 ±" onclick={() => oninsertMathSnippet("\\pm")}>±</button>
            <button type="button" class="lv-chip sm" title="小于等于 ≤" onclick={() => oninsertMathSnippet("\\le")}>≤</button>
            <button type="button" class="lv-chip sm" title="大于等于 ≥" onclick={() => oninsertMathSnippet("\\ge")}>≥</button>
            <button type="button" class="lv-chip sm" title="无穷大 ∞" onclick={() => oninsertMathSnippet("\\infty")}>∞</button>
          {:else if manualSymbolTab === "pinyin"}
            <button type="button" class="lv-chip sm" title="拼音 a 一声" onclick={() => oninsertMathSnippet("ā")}>ā</button>
            <button type="button" class="lv-chip sm" title="拼音 a 二声" onclick={() => oninsertMathSnippet("á")}>á</button>
            <button type="button" class="lv-chip sm" title="拼音 a 三声" onclick={() => oninsertMathSnippet("ǎ")}>ǎ</button>
            <button type="button" class="lv-chip sm" title="拼音 a 四声" onclick={() => oninsertMathSnippet("à")}>à</button>
            <button type="button" class="lv-chip sm" title="拼音 o 一声" onclick={() => oninsertMathSnippet("ō")}>ō</button>
            <button type="button" class="lv-chip sm" title="拼音 o 二声" onclick={() => oninsertMathSnippet("ó")}>ó</button>
            <button type="button" class="lv-chip sm" title="拼拼 o 三声" onclick={() => oninsertMathSnippet("ǒ")}>ǒ</button>
            <button type="button" class="lv-chip sm" title="拼音 o 四声" onclick={() => oninsertMathSnippet("ò")}>ò</button>
            <button type="button" class="lv-chip sm" title="拼音 e 一声" onclick={() => oninsertMathSnippet("ē")}>ē</button>
            <button type="button" class="lv-chip sm" title="拼音 e 二声" onclick={() => oninsertMathSnippet("é")}>é</button>
            <button type="button" class="lv-chip sm" title="拼音 e 三声" onclick={() => oninsertMathSnippet("ě")}>ě</button>
            <button type="button" class="lv-chip sm" title="拼音 e 四声" onclick={() => oninsertMathSnippet("è")}>è</button>
            <button type="button" class="lv-chip sm" title="拼音 i 一声" onclick={() => oninsertMathSnippet("ī")}>ī</button>
            <button type="button" class="lv-chip sm" title="拼音 i 二声" onclick={() => oninsertMathSnippet("í")}>í</button>
            <button type="button" class="lv-chip sm" title="拼音 i 三声" onclick={() => oninsertMathSnippet("ǐ")}>ǐ</button>
            <button type="button" class="lv-chip sm" title="拼音 i 四声" onclick={() => oninsertMathSnippet("ì")}>ì</button>
            <button type="button" class="lv-chip sm" title="拼音 u 一声" onclick={() => oninsertMathSnippet("ū")}>ū</button>
            <button type="button" class="lv-chip sm" title="拼音 u 二声" onclick={() => oninsertMathSnippet("ú")}>ú</button>
            <button type="button" class="lv-chip sm" title="拼音 u 三声" onclick={() => oninsertMathSnippet("ǔ")}>ǔ</button>
            <button type="button" class="lv-chip sm" title="拼音 u 四声" onclick={() => oninsertMathSnippet("ù")}>ù</button>
            <button type="button" class="lv-chip sm" title="拼音 ü 一声" onclick={() => oninsertMathSnippet("ǖ")}>ǖ</button>
            <button type="button" class="lv-chip sm" title="拼音 ü 二声" onclick={() => oninsertMathSnippet("ǘ")}>ǘ</button>
            <button type="button" class="lv-chip sm" title="拼音 ü 三声" onclick={() => oninsertMathSnippet("ǚ")}>ǚ</button>
            <button type="button" class="lv-chip sm" title="拼音 ü 四声" onclick={() => oninsertMathSnippet("ǜ")}>ǜ</button>
          {:else if manualSymbolTab === "phonetic"}
            <button type="button" class="lv-chip sm" title="主重音 ˈ" onclick={() => oninsertMathSnippet("ˈ")}>ˈ</button>
            <button type="button" class="lv-chip sm" title="次重音 ˌ" onclick={() => oninsertMathSnippet("ˌ")}>ˌ</button>
            <button type="button" class="lv-chip sm" title="央元音 schwa" onclick={() => oninsertMathSnippet("ə")}>ə</button>
            <button type="button" class="lv-chip sm" title="开前不圆唇元音" onclick={() => oninsertMathSnippet("æ")}>æ</button>
            <button type="button" class="lv-chip sm" title="后不圆唇元音" onclick={() => oninsertMathSnippet("ʌ")}>ʌ</button>
            <button type="button" class="lv-chip sm" title="咬舌清辅音" onclick={() => oninsertMathSnippet("θ")}>θ</button>
            <button type="button" class="lv-chip sm" title="咬舌浊辅音" onclick={() => oninsertMathSnippet("ð")}>ð</button>
            <button type="button" class="lv-chip sm" title="清后齿龈擦音" onclick={() => oninsertMathSnippet("ʃ")}>ʃ</button>
            <button type="button" class="lv-chip sm" title="浊后齿龈擦音" onclick={() => oninsertMathSnippet("ʒ")}>ʒ</button>
            <button type="button" class="lv-chip sm" title="软腭鼻音" onclick={() => oninsertMathSnippet("ŋ")}>ŋ</button>
            <button type="button" class="lv-chip sm" title="次闭次前不圆唇元音" onclick={() => oninsertMathSnippet("ɪ")}>ɪ</button>
            <button type="button" class="lv-chip sm" title="次闭次后圆唇元音" onclick={() => oninsertMathSnippet("ʊ")}>ʊ</button>
            <button type="button" class="lv-chip sm" title="长元音 aw" onclick={() => oninsertMathSnippet("ɔː")}>ɔː</button>
          {/if}
        </div>
        <textarea id="lv-manual-stem" class="lv-input lv-textarea" style="min-height:90px;resize:vertical!important;width:100%" bind:value={mStem} oninput={onclearManualValidation} placeholder={t("manual.stemPlaceholder")} data-manual-field="stem" aria-invalid={manualErrorField === "stem" ? "true" : undefined} aria-describedby={manualErrorField === "stem" ? "manual-validation-error" : undefined}></textarea>
        {#if !stemLatexIssue.valid}
          <div class="lv-chip sm lv-chip--amb" style="margin-top:4px;display:inline-flex;align-items:center;gap:4px">
            <Icon name="alert-triangle" size={11} /> {stemLatexIssue.message}
          </div>
        {/if}
        {#if nearDupeMatched}
          <div class="lv-row" style="margin:6px 0;padding:6px 12px;background:color-mix(in srgb, var(--lv-amber-soft) 85%, var(--lv-surface));border-left:3.5px solid var(--lv-amber);border-radius:var(--lv-r-2);align-items:center;justify-content:space-between;gap:8px" role="alert">
            <span style="font-size:12px;color:var(--lv-text);display:inline-flex;align-items:center;gap:6px">
              <Icon name="alert-triangle" size={13} /> 题库中已存在高相似度题目（{Math.round(nearDupeSimilarity * 100)}%）：<b>《{nearDupeMatched.stem.slice(0, 24)}…》</b>
            </span>
            <button type="button" class="lv-btn sm lv-btn--ghost" onclick={applyNearDupeMetadata} title="沿用该题的考点、解析与选项">
              沿用考点/解析
            </button>
          </div>
        {/if}
        {#if mStem.length > 15 && (/(?:^|\s+)[A-D][.、:：\s]/m.test(mStem) || /答案|解析|【答案】/i.test(mStem) || /[（(]\s*[A-D√×对错]\s*[)）]/.test(mStem))}
          <div class="lv-row" style="margin:4px 0;padding:6px 10px;background:color-mix(in srgb, var(--lv-accent-soft) 28%, var(--lv-surface));border-radius:var(--lv-r-2);align-items:center;justify-content:space-between">
            <span style="font-size:12px;color:var(--lv-text);display:inline-flex;align-items:center;gap:5px">
              <Icon name="sparkles" size={13} /> 检测到题干中包含选项或答案内容
            </span>
            <button type="button" class="lv-btn sm lv-btn--primary" onclick={() => {
              ocrInputText = mStem;
              onapplyOcrFill();
            }}>
              ⚡ 一键自动拆分到各选项与答案
            </button>
          </div>
        {/if}
      </div>
      {#if mType === "single" || mType === "multiple"}
        <div class="lv-field" role="group" aria-label={t("manual.options")}>
          <div class="lv-row" style="justify-content:space-between;align-items:center;margin:0 0 6px">
            <span class="lv-muted">{t("manual.options")}（点击字母圆圈设为正确答案）</span>
            <button type="button" class="lv-btn sm lv-btn--ghost" onclick={() => (quickSplitOpen = !quickSplitOpen)} title="粘贴包含 A. B. C. D. 的整段选项，一键自动秒拆上槽">
              <Icon name="sparkles" size={12} /> {quickSplitOpen ? "收起拆分" : "🪄 粘贴整段选项秒拆"}
            </button>
          </div>
          {#if quickSplitOpen}
            <div class="lv-card" style="margin-bottom:8px;padding:8px 12px;background:var(--lv-surface-2);border:1px dashed var(--lv-border);border-radius:var(--lv-r-2)">
              <div class="lv-muted" style="font-size:11.5px;margin-bottom:4px">将试卷中复制的整行选项（如 “A. 红 B. 蓝 C. 绿 D. 黄 答案: B”）粘贴到下方：</div>
              <input class="lv-input sm" style="width:100%" placeholder="在此粘贴整行或多行选项…" bind:value={quickSplitInput} onkeydown={(e) => { if (e.isComposing || e.keyCode === 229) return; if (e.key === "Enter") applyQuickSplit(); }} />
              <div class="lv-row" style="margin:6px 0 0;justify-content:flex-end;gap:6px">
                <button type="button" class="lv-btn sm lv-btn--primary" onclick={applyQuickSplit} disabled={!quickSplitInput.trim()}>
                  <Icon name="check" size={12} /> 一键秒拆到各选项槽
                </button>
                <button type="button" class="lv-btn sm lv-btn--ghost" onclick={() => (quickSplitOpen = false)}>取消</button>
              </div>
            </div>
          {/if}
          {#each mOptions as _opt, i (i)}
            {@const letter = String.fromCharCode(65 + i)}
            {@const isSelected = mAnswer.includes(letter)}
            <div class="lv-row" style="margin:4px 0">
              <button type="button" class="lv-chip" class:acc={isSelected}
                style="{isSelected ? 'background:var(--lv-brand);color:var(--lv-on-accent, #fff);font-weight:700;' : ''}cursor:pointer"
                title={`${t("manual.setCorrect")} ${letter}`} aria-label={`${t("manual.setCorrect")} ${letter}`} onclick={() => { onclearManualValidation(); onsetCorrectOption(i); }} data-manual-field={i === 0 ? "answer" : undefined} aria-pressed={isSelected} aria-describedby={manualErrorField === "answer" && i === 0 ? "manual-validation-error" : undefined}>
                {letter}
              </button>
              <input class="lv-input" style="flex:1" bind:value={mOptions[i]} oninput={onclearManualValidation} placeholder={`选项 ${letter} 内容`} aria-label={`${t("manual.options")} ${letter}`} data-manual-field={`option-${i}`} aria-invalid={manualErrorField === `option-${i}` ? "true" : undefined} aria-describedby={manualErrorField === `option-${i}` ? "manual-validation-error" : undefined} />
              {#if isSelected}
                <span class="lv-chip lv-chip--grn num sm" style="font-size:11px;padding:2px 6px">正确项</span>
              {/if}
              <div class="lv-row" style="margin:0;gap:2px;align-items:center">
                {#if i > 0}
                  <button type="button" class="lv-btn sm lv-btn--ghost" onclick={() => swapOptions(i, i - 1)} title="上移此选项并联动调整答案" aria-label="上移" style="padding:2px 4px;min-width:20px"><Icon name="arrow-up" size={11} /></button>
                {/if}
                {#if i < mOptions.length - 1}
                  <button type="button" class="lv-btn sm lv-btn--ghost" onclick={() => swapOptions(i, i + 1)} title="下移此选项并联动调整答案" aria-label="下移" style="padding:2px 4px;min-width:20px"><Icon name="arrow-down" size={11} /></button>
                {/if}
                {#if mOptions.length > 2}
                  <button type="button" class="lv-btn lv-btn--ghost sm" aria-label={`${t("manual.removeOption", "删除选项")} ${letter}`} title={`${t("manual.removeOption", "删除选项")} ${letter}`} onclick={() => { const next = removeChoiceOption(mType, mOptions, mAnswer, i); mOptions = next.options; mAnswer = next.answer; }} style="padding:2px 4px;min-width:20px"><Icon name="close" size={12} /></button>
                {/if}
              </div>
            </div>
          {/each}
          {#if mOptions.length < 6}
            <button class="lv-btn sm" style="border-style:dashed;display:inline-flex;align-items:center;gap:4px" onclick={() => (mOptions = [...mOptions, ""])}><Icon name="plus" size={13} /> {t("manual.addOption")}</button>
          {/if}
        </div>
      {:else if mType === "judge"}
        <div class="lv-row">
          <button class="lv-chip" class:acc={mAnswer === "对"} onclick={() => { onclearManualValidation(); mAnswer = "对"; }} data-manual-field="answer" aria-pressed={mAnswer === "对"} aria-describedby={manualErrorField === "answer" ? "manual-validation-error" : undefined}>对</button>
          <button class="lv-chip" class:acc={mAnswer === "错"} onclick={() => { onclearManualValidation(); mAnswer = "错"; }} aria-pressed={mAnswer === "错"}>错</button>
        </div>
      {:else}
        <div class="lv-field"><label class="lv-muted" for="lv-manual-answer">{t("manual.answer")}</label>
          <textarea id="lv-manual-answer" class="lv-input lv-textarea" style="min-height:44px" bind:value={mAnswer} oninput={onclearManualValidation}
            placeholder={t("manual.answerHint")} data-manual-field="answer" aria-invalid={manualErrorField === "answer" ? "true" : undefined} aria-describedby={manualErrorField === "answer" ? "manual-validation-error" : undefined}></textarea>
        </div>
        {#if mType === "fill"}
          <div class="lv-row" style="margin:4px 0 0">
            <button class="lv-btn sm lv-btn--ghost" aria-expanded={mSpecOpen} onclick={() => (mSpecOpen = !mSpecOpen)} style="display:inline-flex;align-items:center;gap:4px">
              <Icon name="edit" size={12} />
              <span>{t("spec.authorSection")}</span>
              <Icon name={mSpecOpen ? "arrow-down" : "chev-right"} size={10} />
            </button>
          </div>
          {#if mSpecOpen}
            <div class="lv-row" style="margin:4px 0 0;align-items:flex-end">
              <label class="lv-field" style="max-width:160px"><span class="lv-muted">{t("spec.unit")}</span>
                <input class="lv-input" bind:value={mSpecUnit} placeholder="m/s" aria-label={t("spec.unit")} />
              </label>
              <label class="lv-field" style="max-width:150px"><span class="lv-muted">{t("spec.absTol")}</span>
                <input class="lv-input num" bind:value={mSpecAbsTol} placeholder="0.5" inputmode="decimal" aria-label={t("spec.absTol")} />
              </label>
              <label class="lv-field" style="max-width:150px"><span class="lv-muted">{t("spec.relPct")}</span>
                <input class="lv-input num" bind:value={mSpecRelPct} placeholder="5" inputmode="decimal" aria-label={t("spec.relPct")} />
              </label>
              <label class="lv-field" style="flex:1;min-width:180px"><span class="lv-muted">{t("spec.altUnits")}</span>
                <input class="lv-input" bind:value={mSpecAltUnits} placeholder="km/h, cm/s" aria-label={t("spec.altUnits")} />
              </label>
              {#if mAnswer.includes(";;")}
                <label class="lv-chip" style="cursor:pointer;display:inline-flex;align-items:center;gap:4px;margin-top:4px">
                  <input type="checkbox" bind:checked={mSpecOrderIndependent} />
                  <span>无序多空（作答空位可任意互换对齐）</span>
                </label>
              {/if}
            </div>
          {/if}
        {/if}
        {#if mType === "short"}
          <div class="lv-row" style="margin:4px 0 0">
            <button class="lv-btn sm lv-btn--ghost" aria-expanded={mRubricOpen} onclick={() => (mRubricOpen = !mRubricOpen)} style="display:inline-flex;align-items:center;gap:4px">
              <Icon name="clipboard" size={12} />
              <span>{t("rubric.authorSection")}</span>
              <Icon name={mRubricOpen ? "arrow-down" : "chev-right"} size={10} />
            </button>
            {#if authorRubricPreview}<span class="lv-chip lv-chip--data num">{t("rubric.criteriaCount").replace("{n}", String(authorRubricPreview.criteria.length))}</span>{/if}
          </div>
          {#if mRubricOpen}
            <div class="lv-field">
              <label class="lv-muted" for="lv-manual-rubric">{t("rubric.textLabel")}</label>
              <textarea id="lv-manual-rubric" class="lv-input lv-textarea" style="min-height:72px" bind:value={mRubricText} oninput={onclearManualValidation}
                placeholder={t("rubric.textPlaceholder")} data-manual-field="rubric"
                aria-invalid={manualErrorField === "rubric" ? "true" : undefined} aria-describedby={manualErrorField === "rubric" ? "manual-validation-error" : undefined}></textarea>
              <p class="lv-muted" style="margin:4px 0 0;font-size:var(--lv-font-size-caption)">{t("rubric.textHint")}</p>
            </div>
            {#if authorRubricPreview}
              <div class="lv-detail" style="margin:4px 0 0;padding:8px 10px;background:var(--lv-surface-2);border-radius:var(--lv-r-2, 10px);border:1px solid var(--lv-border-subtle)">
                {#each authorRubricPreview.criteria as c, ci (ci)}
                  <div class="lv-row" style="margin:2px 0;gap:var(--lv-space-2)">
                    <span class="lv-chip lv-chip--data num">{Math.round(c.weight * 100)}%</span>
                    <span style="font-size:var(--lv-font-size-sm)">{c.label}</span>
                    {#if c.example}<span class="lv-muted" style="font-size:var(--lv-font-size-caption)">· {c.example}</span>{/if}
                  </div>
                {/each}
              </div>
            {:else if mRubricText.trim()}
              <p class="lv-error" role="alert">{t("rubric.parseFailed")}</p>
            {/if}
          {/if}
        {/if}
      {/if}
      <div class="lv-field">
        <label class="lv-muted" for="lv-manual-analysis" style="font-weight:600;font-size:13px">{t("manual.analysis")}</label>
        <textarea id="lv-manual-analysis" class="lv-input lv-textarea" style="min-height:80px;resize:vertical!important;width:100%" bind:value={mAnalysis} placeholder="输入破题思路、考点解析或记忆技巧（可选）"></textarea>
        {#if !analysisLatexIssue.valid}
          <div class="lv-chip sm lv-chip--amb" style="margin-top:4px;display:inline-flex;align-items:center;gap:4px">
            <Icon name="alert-triangle" size={11} /> {analysisLatexIssue.message}
          </div>
        {/if}
      </div>
      <div class="lv-field">
        <label class="lv-muted" for="lv-manual-expansion" style="font-weight:600;font-size:13px;display:flex;align-items:center;gap:6px">
          <Icon name="bulb" size={13} /> 💡 思路拓展与秒杀技巧（选填）
        </label>
        <textarea id="lv-manual-expansion" class="lv-input lv-textarea" style="min-height:64px;resize:vertical!important;width:100%" bind:value={mExpansion} placeholder="考点考法拓宽、命题陷阱分析、一题多解或秒杀技巧规律总结…"></textarea>
      </div>
      <div class="lv-row" style="flex-wrap:wrap">
        <label class="lv-chip" for="lv-manual-kp">{t("manual.kp")}</label><input id="lv-manual-kp" class="lv-input" style="max-width:180px" bind:value={mKp} placeholder={t("manual.kpHint")} />
        <label class="lv-chip" for="lv-manual-sec-kp">辅助考点</label><input id="lv-manual-sec-kp" class="lv-input" style="max-width:180px" bind:value={mSecondaryKps} placeholder="考点1, 考点2 (逗号分隔)" />
        <label class="lv-chip lv-chip--acc" for="lv-manual-prereqs" title="先修前置概念，用于自适应错题根因溯源诊断"><Icon name="compass" size={11} /> 先修依赖</label><input id="lv-manual-prereqs" class="lv-input" style="max-width:180px" bind:value={mPrerequisites} placeholder="前置概念1, 前置概念2" />
        <label class="lv-chip" for="lv-manual-source">{t("manual.source")}</label><input id="lv-manual-source" class="lv-input" style="max-width:160px" bind:value={mSource} placeholder={t("manual.sourceHint")} />
        <label class="lv-chip" for="lv-manual-group">{t("manual.group")}</label><input id="lv-manual-group" class="lv-input num" style="max-width:200px" bind:value={mGroup} placeholder="grp-…" />
      </div>
      <!-- 深度绑定思源笔记文档工具条 -->
      <div class="lv-row" style="margin:6px 0 2px;flex-wrap:wrap;align-items:center;gap:8px">
        <button type="button" class="lv-btn sm" onclick={() => { docPickerOpen = !docPickerOpen; if (docPickerOpen && !docPickerCandidates.length) searchDocsForManual(""); }} title="从思源笔记本中搜索并绑定此题对应的笔记文档或段落">
          <Icon name="link" size={12} /> {mSourceBlockId ? "换绑思源笔记" : "🔗 绑定思源笔记文档"}
        </button>
        {#if mSourceBlockId}
          <span class="lv-chip lv-chip--acc" style="display:inline-flex;align-items:center;gap:5px;font-size:12px">
            <Icon name="check" size={11} />
            <span>已绑定笔记：《{mSource || mSourceBlockId.slice(-8)}》</span>
            <button type="button" class="lv-btn sm lv-btn--ghost" onclick={() => onopenInSiYuan("", mSourceBlockId)} title="在思源中打开并高亮原笔记段落" style="padding:1px 5px;font-size:11px">
              <Icon name="pin" size={11} /> 定位原块 ↗
            </button>
            <button type="button" class="lv-btn sm lv-btn--ghost" onclick={() => { mSourceBlockId = ""; mSource = ""; }} title="解除文档绑定" style="padding:1px 5px;font-size:11px">
              <Icon name="close" size={11} />
            </button>
          </span>
          <label class="lv-chip" style="cursor:pointer;display:inline-flex;align-items:center;gap:4px">
            <input type="checkbox" bind:checked={syncAppendToNote} />
            <span>保存时同步在原笔记末尾追加折叠题块</span>
          </label>
        {/if}
      </div>

      <!-- 思源笔记文档搜索选择器 -->
      {#if docPickerOpen}
        <div class="lv-card" style="margin:6px 0 10px;padding:12px 14px;background:var(--lv-surface-2);border:1.5px solid var(--lv-accent);border-radius:var(--lv-r-2);box-shadow:var(--lv-sh-pop)">
          <div class="lv-row" style="justify-content:space-between;align-items:center;margin:0 0 8px">
            <b style="font-size:13px;color:var(--lv-text);display:flex;align-items:center;gap:5px">
              <Icon name="link" size={13} /> 选择要绑定的思源笔记文档
            </b>
            <button type="button" class="lv-btn sm lv-btn--ghost" onclick={() => docPickerOpen = false}><Icon name="close" size={12} /></button>
          </div>
          <div class="lv-row" style="margin:0 0 8px;gap:6px">
            <input class="lv-input sm" style="flex:1" placeholder="输入关键词搜索思源笔记本或文档标题…" bind:value={docPickerSearch} oninput={(e) => searchDocsForManual((e.target as HTMLInputElement).value)} />
            <button type="button" class="lv-btn sm lv-btn--primary" onclick={() => searchDocsForManual(docPickerSearch)}>搜索</button>
          </div>
          <div class="stack-sm" style="max-height:180px;overflow-y:auto;border:1px solid var(--lv-border-subtle);border-radius:var(--lv-r-2);padding:4px;background:var(--lv-surface)">
            {#if docPickerBusy}
              <div class="lv-muted" style="padding:12px;text-align:center">正在检索思源笔记…</div>
            {:else if !docPickerCandidates.length}
              <div class="lv-muted" style="padding:12px;text-align:center">未找到相关笔记文档</div>
            {:else}
              {#each docPickerCandidates as cd (cd.id)}
                <button type="button" class="lv-row" style="width:100%;text-align:left;padding:6px 8px;border-radius:4px;border:none;background:transparent;cursor:pointer;justify-content:space-between;align-items:center" onclick={() => pickDocForManual(cd)}>
                  <span style="font-size:12.5px;font-weight:600;color:var(--lv-text)">{cd.title}</span>
                  <span class="lv-muted" style="font-size:11px">{cd.hpath}</span>
                </button>
              {/each}
            {/if}
          </div>
        </div>
      {/if}
      <div class="lv-row" style="margin:4px 0 0;flex-wrap:wrap">
        <span class="lv-chip"><Icon name="volume" size={12} /> 朗读语言</span>
        <select class="lv-select sm" bind:value={mStudyLang} aria-label="朗读语言" style="max-width:140px">
          <option value="zh-CN">普通话 (zh-CN)</option>
          <option value="zh-HK">粤语 (zh-HK)</option>
          <option value="en-US">英语 (en-US)</option>
          <option value="ja-JP">日语 (ja-JP)</option>
        </select>
        <label class="lv-chip" for="lv-manual-phonetic">注音 / 粤拼</label>
        <input id="lv-manual-phonetic" class="lv-input" style="flex:1;min-width:160px;font-family:monospace" bind:value={mStudyPhonetic} placeholder="例如：m4 goi1 或拼音/音标（可选）" />
      </div>

      <!-- 出题就绪向导提示条：清楚明了地告诉用户怎样才能存为块 -->
      <div class="lv-ready-guide" style="margin:12px 0 8px;padding:8px 12px;background:var(--lv-surface-2);border-radius:var(--lv-r-2);border:1px solid var(--lv-border-subtle);display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:6px">
        <div class="lv-row" style="margin:0;gap:8px;align-items:center;font-size:12px">
          <span style="font-weight:600;display:inline-flex;align-items:center;gap:4px">
            <Icon name={isReady ? "check" : "info"} size={13} />
            <span>{isReady ? "试题就绪状态：" : "出题就绪要求："}</span>
            {#if mStatus === "draft"}<span class="lv-chip num sm">草稿态</span>{/if}
          </span>
          <span class="lv-chip num sm" class:acc={hasStem}>{hasStem ? "✓ 题干已填" : "待输入题干"}</span>
          <span class="lv-chip num sm" class:acc={hasAnswer}>
            {#if mType === "single" || mType === "multiple"}
              {hasAnswer ? `✓ 选项 ${mAnswer} 为正确答案` : "点击选项字母设为正确答案"}
            {:else if mType === "judge"}
              {hasAnswer ? `✓ 标准答案：${mAnswer}` : "点击选「对」或「错」"}
            {:else if mType === "fill"}
              {hasAnswer ? "✓ 答案已填" : "待填写标准答案"}
            {:else}
              ✓ 简答题无需设选项
            {/if}
          </span>
        </div>
        {#if !hasAnswer && hasStem && (mType === "single" || mType === "multiple")}
          <button type="button" class="lv-btn sm lv-btn--ghost" onclick={() => { onsetCorrectOption(0); }} style="color:var(--lv-brand);font-size:11px">
            ⚡ 设 A 为答案
          </button>
        {/if}
      </div>

      <div class="lv-row" style="gap:8px;align-items:center;flex-wrap:wrap;margin-top:8px">
        {#if manualErrorMsg}<p class="lv-error" id="manual-validation-error-bottom" role="alert" style="margin:0;display:inline-flex;align-items:center;gap:4px"><Icon name="alert-triangle" size={13} /> {manualErrorMsg}</p>{/if}
        <button class="lv-btn lv-btn--primary" onclick={() => {
          if (!hasAnswer && mType === "single" && mOptions.length >= 2) {
            onsetCorrectOption(0);
          }
          onsaveManual("published");
        }} disabled={mSaving || !hasStem} aria-busy={mSaving} title="保存题目并直接存为思源笔记题库块 (Ctrl+Enter 连录)">
          <Icon name="save" size={14} /> {mSaving ? "正在写入思源块…" : "入库并存为思源块 (Ctrl+Enter)"}
        </button>
        <button class="lv-btn" onclick={() => {
          if (!hasAnswer && mType === "single" && mOptions.length >= 2) {
            onsetCorrectOption(0);
          }
          onsaveManual("published");
          mStem = "";
          mOptions = mType === "single" || mType === "multiple" ? ["", ""] : [];
          mAnswer = "";
          mAnalysis = "";
          if (!pinAttributes) {
            mKp = "";
            mSecondaryKps = "";
            mPrerequisites = "";
            mSource = "";
            mGroup = "";
          }
          const stemEl = document.getElementById("lv-manual-stem");
          if (stemEl) stemEl.focus();
        }} disabled={mSaving || !hasStem} title={pinAttributes ? "属性已锁定：入库并保留当前题型与考点，直接连续录入下一题" : "保存当前题后保留考点与出处，直接继续录入下一题"}>
          <Icon name="plus" size={13} /> {pinAttributes ? "📌 连录下一题" : "入库并继续下一题"}
        </button>
        <button class="lv-btn" onclick={() => onsaveManual("draft")} disabled={mSaving || !hasStem} title="未填答案亦可保存为思源草稿块，方便随时暂存">
          存为草稿块
        </button>
        <button class="lv-btn" onclick={onblankManualDraft} disabled={mSaving || (!mStem && !mAnswer && !mAnalysis)} title={t("manual.blankTitle", "清空并开始录入新题")}>
          换一道新题
        </button>
        {#if mSaved}<span class="lv-muted" role="status" style="color:var(--lv-accent);font-size:12px;display:inline-flex;align-items:center;gap:4px"><Icon name="check" size={12} /> 已保存为思源原生题块 ✓</span>{/if}
      </div>
    </div>
    <section class="lv-card lv-pad-card lv-preview-card" aria-live="polite">
      <div class="lv-section-head">
        <div>
          <span class="lv-eyebrow">{t("manual.title")}</span>
          <h2>实际题面预览</h2>
        </div>
        <span class="lv-chip lv-chip--acc">同步预览</span>
      </div>
      <div class="lv-preview-face">
        <span class="lv-chip lv-chip--acc">{t("qtype." + mType)}</span>
        <h3>{@html sanitizeRichHtml(renderMathInText(renderMathDiagramsInText(mStem.trim() || t("manual.stemPlaceholder"))))}</h3>
        {#if mType === "single" || mType === "multiple"}
          <div class="lv-preview-options">
            {#each mOptions as option, i (i)}
              <div class="lv-preview-option" class:selected={mAnswer.includes(String.fromCharCode(65 + i))}>
                <span class="lv-preview-key">{String.fromCharCode(65 + i)}</span>
                <span>{@html sanitizeRichHtml(renderMathInText(option.trim() || "待填写选项"))}</span>
              </div>
            {/each}
          </div>
        {:else if mType === "judge"}
          <div class="lv-preview-options">
            {#each ["对", "错"] as option (option)}
              <div class="lv-preview-option" class:selected={mAnswer === option}>
                <span class="lv-preview-key">{option}</span><span>{option === "对" ? "正确" : "错误"}</span>
              </div>
            {/each}
          </div>
        {:else if mType === "fill"}
          {@const isMulti = mAnswer.includes(";;")}
          {@const blanks = isMulti ? mAnswer.split(";;").map((b) => b.trim()).filter(Boolean) : [mAnswer.trim()]}
          <div class="lv-preview-fill">
            {#if isMulti}
              <div class="lv-preview-blanks">
                {#each blanks as _blank, bi (bi)}
                  <div class="lv-preview-blank-row">
                    <span class="lv-preview-key">{bi + 1}</span>
                    <input class="lv-input" placeholder={`空 ${bi + 1}`} disabled />
                  </div>
                {/each}
              </div>
              <div class="lv-preview-spec-hint">逐空判分 · {blanks.length} 个空，按题目顺序分别核对</div>
            {:else}
              <div class="lv-preview-blank-row">
                <input class="lv-input" placeholder={mStem.includes("____") ? "填写划线处内容" : "填写答案"} disabled />
                {#if mSpecUnit}<span class="lv-chip num">{mSpecUnit}</span>{/if}
              </div>
              {#if mSpecOpen || mSpecUnit || mSpecAbsTol || mSpecRelPct}
                <div class="lv-preview-spec-hint">
                  数值判分 · 单位：{mSpecUnit || "无"} · 绝对容差：±{mSpecAbsTol || "0"} · 相对容差：{mSpecRelPct ? `${mSpecRelPct}%` : "无"}
                </div>
              {/if}
            {/if}
          </div>
        {:else if mType === "short"}
          <div class="lv-preview-short">
            <textarea class="lv-input lv-textarea" rows="3" placeholder="考生作答文本框（解答题提交后进入自评）" disabled></textarea>
          </div>
        {/if}
        <div class="lv-preview-answer">
          <strong>{mType === "short" ? "参考要点" : "参考答案"}</strong>
          <p>{mType === "single" || mType === "multiple" ? mAnswer.split("").map((letter) => `${letter}. ${mOptions[letter.charCodeAt(0) - 65] ?? ""}`).join("；") || t("manual.answerHint") : mAnswer.trim() || t("manual.answerHint")}</p>
          {#if mAnalysis.trim()}<small>{mAnalysis}</small>{/if}
          {#if mExpansion.trim()}
            <div style="margin-top:6px;padding:4px 8px;background:var(--lv-surface-2);border-left:3px solid var(--lv-accent);border-radius:2px;font-size:12px;color:var(--lv-text)">
              <strong>💡 思路拓展：</strong> {mExpansion}
            </div>
          {/if}
          {#if mPrerequisites.trim()}
            <div style="margin-top:4px;display:inline-flex;align-items:center;gap:4px;font-size:11.5px;color:var(--lv-brand)">
              <Icon name="compass" size={11} /> <span>先修依赖：{mPrerequisites.trim()}</span>
            </div>
          {/if}
        </div>
        {#if mKp.trim() || mSource.trim()}<div class="lv-preview-meta"><span>{mKp.trim() || t("manual.kp")}</span><span>{mSource.trim() || t("manual.source")}</span></div>{/if}
      </div>
      <p class="lv-muted lv-preview-note">编辑左侧内容，右侧会同步展示用户实际看到的题面。</p>
    </section>
  </div>
</div>
