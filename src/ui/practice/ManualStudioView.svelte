<script lang="ts">
  import Icon from "../shared/Icon.svelte";
  import type { QuestionLifecycleStatus } from "../../core/types";
  import StudioSubNav from "./StudioSubNav.svelte";

  interface Props {
    mType: "single" | "multiple" | "judge" | "fill" | "short";
    mStem: string;
    mOptions: string[];
    mAnswer: string;
    mAnalysis: string;
    mKp: string;
    mSource: string;
    mGroup: string;
    mSpecOpen: boolean;
    mSpecUnit: string;
    mSpecAbsTol: string;
    mSpecRelPct: string;
    mSpecAltUnits: string;
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
  }

  let {
    mType = $bindable(),
    mStem = $bindable(),
    mOptions = $bindable(),
    mAnswer = $bindable(),
    mAnalysis = $bindable(),
    mKp = $bindable(),
    mSource = $bindable(),
    mGroup = $bindable(),
    mSpecOpen = $bindable(),
    mSpecUnit = $bindable(),
    mSpecAbsTol = $bindable(),
    mSpecRelPct = $bindable(),
    mSpecAltUnits = $bindable(),
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
  }: Props = $props();
</script>

<div class="lv-pad" onpaste={onmanualPaste}>
  <div class="lv-screen-head">
    <span class="lv-eyebrow">{t("head.manual.eyebrow")}</span>
    <h1 class="lv-h1">{t("head.manual.title")}</h1>
    <p>{t("head.manual.desc")}</p>
  </div>
  <StudioSubNav currentView="manual" {t} {onchangeView} />
  <div class="lv-row">
    <button class="lv-btn lv-btn--ghost lv-mobile-back" onclick={onback}>← {t("mode.practice")}</button>
    <span class="lv-chip">{t("manual.title")}</span>
    <button class="lv-btn sm" onclick={onopenOcrModal} title="粘贴试题识别文本一键智能提取填入表单"><Icon name="camera" size={13} /> {t("manual.ocrFastFill")}</button>
    <button class="lv-btn sm" onclick={onnormalizeFormulas} title="清洗题干与选项中公式的空格与语法"><Icon name="sparkles" size={13} /> {t("manual.formulaNormalize")}</button>
    <select class="lv-select" style="max-width:135px" onchange={(e) => {
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
      <option value="">➕ 插入数学图表…</option>
      <option value="plot">📈 {t("manual.insertPlot")}</option>
      <option value="diagram">📐 {t("manual.insertDiagram")}</option>
      <option value="bar">📊 {t("manual.insertBar")}</option>
      <option value="pie">🥧 {t("manual.insertPie")}</option>
      <option value="numberline">📏 {t("manual.insertNumberLine")}</option>
    </select>
    {#if draftRestored}<span class="lv-chip lv-chip--amb">{t("manual.draftRestored")}</span>{/if}
    {#if mSaved}<span class="lv-chip lv-chip--grn num">✓ {mSaved}</span>{/if}
  </div>
  {#if ocrModalOpen}
    <div class="lv-card" style="margin:10px 0;background:var(--lv-surface-2);border-color:var(--lv-accent)">
      <label class="lv-field">
        <span style="font-weight:var(--lv-font-weight-semibold)">{t("manual.ocrPrompt")}</span>
        <textarea class="lv-input lv-textarea" style="min-height:90px;margin-top:6px" bind:value={ocrInputText} placeholder="粘贴整段试题识别文本（支持题干、A. B. C. D. 选项、答案、解析），点击解析填单即可自动分类填入下方表单"></textarea>
      </label>
      <div class="lv-row" style="margin-top:8px">
        <button class="lv-btn lv-btn--primary sm" onclick={onapplyOcrFill} disabled={!ocrInputText.trim()}>{t("manual.ocrFastFill")}</button>
        <label class="lv-btn sm lv-btn--ghost" style="cursor:pointer">
          <Icon name="file" size={13} /> {ocrUploadBusy ? t("manual.ocrUploading") : t("manual.ocrUploadImage")}
          <input type="file" accept="image/*" style="display:none" onchange={onfileInputChange} disabled={ocrUploadBusy} />
        </label>
        <span class="lv-muted" style="font-size:var(--lv-font-size-caption)">{t("manual.ocrPasteTip")}</span>
        <button class="lv-btn lv-btn--ghost sm" style="margin-left:auto" onclick={() => (ocrModalOpen = false)}>取消</button>
      </div>
    </div>
  {/if}
  <div class="lv-studio-grid lv-studio-grid--manual">
    <div class="lv-card lv-pad-card lv-studio-form" data-manual-form>
      <div class="lv-row" style="margin:0 0 12px;gap:var(--lv-space-3);flex-wrap:wrap">
        <div class="lv-session-dock" role="group" aria-label={t("manual.type", "题型")}>
          <span class="lv-chip" style="color:var(--lv-text-3);cursor:default">{t("manual.type")}</span>
          {#each ["single", "multiple", "judge", "fill", "short"] as tt, _i (_i)}
            <button type="button" class="lv-chip" class:acc={mType === tt} aria-pressed={mType === tt} onclick={() => void onswitchManualType(tt)}>{t("qtype." + tt)}</button>
          {/each}
        </div>
        <div class="lv-session-dock" role="group" aria-label={t("manual.status")}>
          <span class="lv-chip" style="color:var(--lv-text-3);cursor:default">{t("manual.status")}</span>
          <button type="button" class="lv-chip" class:acc={mStatus === "published"} aria-pressed={mStatus === "published"} onclick={() => { mStatus = "published"; onclearManualValidation(); }}>{t("lifecycle.published")}</button>
          <button type="button" class="lv-chip" class:acc={mStatus === "review"} aria-pressed={mStatus === "review"} onclick={() => { mStatus = "review"; onclearManualValidation(); }}>{t("lifecycle.review")}</button>
          <button type="button" class="lv-chip" class:acc={mStatus === "draft"} aria-pressed={mStatus === "draft"} onclick={() => { mStatus = "draft"; onclearManualValidation(); }}>{t("lifecycle.draft")}</button>
        </div>
      </div>
      <div class="lv-field">
        <div class="lv-row" style="justify-content:space-between;align-items:center;margin:0 0 6px;flex-wrap:wrap;gap:6px">
          <label class="lv-muted" for="lv-manual-stem">{t("manual.stem")}</label>
          <div class="lv-row" style="margin:0;gap:4px;align-items:center;flex-wrap:wrap">
            <div class="lv-session-dock" role="tablist" aria-label="符号分类" style="margin:0">
              <button type="button" role="tab" class="lv-chip sm" class:acc={manualSymbolTab === "math"} aria-selected={manualSymbolTab === "math"} onclick={() => (manualSymbolTab = "math")}><Icon name="compass" size={12} /> 数理</button>
              <button type="button" role="tab" class="lv-chip sm" class:acc={manualSymbolTab === "pinyin"} aria-selected={manualSymbolTab === "pinyin"} onclick={() => (manualSymbolTab = "pinyin")}><Icon name="edit" size={12} /> 拼音</button>
              <button type="button" role="tab" class="lv-chip sm" class:acc={manualSymbolTab === "phonetic"} aria-selected={manualSymbolTab === "phonetic"} onclick={() => (manualSymbolTab = "phonetic")}><Icon name="mic" size={12} /> 音标</button>
            </div>
            <div class="lv-session-dock" role="toolbar" aria-label="符号选择坞" style="overflow-x:auto;max-width:100%;flex:1">
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
          </div>
        </div>
        <textarea id="lv-manual-stem" class="lv-input lv-textarea" bind:value={mStem} oninput={onclearManualValidation} placeholder={t("manual.stemPlaceholder")} data-manual-field="stem" aria-invalid={manualErrorField === "stem" ? "true" : undefined} aria-describedby={manualErrorField === "stem" ? "manual-validation-error" : undefined}></textarea>
      </div>
      {#if mType === "single" || mType === "multiple"}
        <div class="lv-field" role="group" aria-label={t("manual.options")}>
          <span class="lv-muted">{t("manual.options")}</span>
          {#each mOptions as _opt, i (i)}
            <div class="lv-row" style="margin:4px 0">
              <button class="lv-chip" class:acc={mAnswer.includes(String.fromCharCode(65 + i))}
                title={t("manual.setCorrect")} aria-label={`${t("manual.setCorrect")} ${String.fromCharCode(65 + i)}`} onclick={() => { onclearManualValidation(); onsetCorrectOption(i); }} data-manual-field={i === 0 ? "answer" : undefined} aria-pressed={mAnswer.includes(String.fromCharCode(65 + i))} aria-describedby={manualErrorField === "answer" && i === 0 ? "manual-validation-error" : undefined}>{String.fromCharCode(65 + i)}</button>
              <input class="lv-input" style="flex:1" bind:value={mOptions[i]} oninput={onclearManualValidation} aria-label={`${t("manual.options")} ${String.fromCharCode(65 + i)}`} data-manual-field={`option-${i}`} aria-invalid={manualErrorField === `option-${i}` ? "true" : undefined} aria-describedby={manualErrorField === `option-${i}` ? "manual-validation-error" : undefined} />
              {#if mOptions.length > 2}
                <button class="lv-btn lv-btn--ghost sm" aria-label={`${t("manual.removeOption", "删除选项")} ${String.fromCharCode(65 + i)}`} title={`${t("manual.removeOption", "删除选项")} ${String.fromCharCode(65 + i)}`} onclick={() => { const next = removeChoiceOption(mType, mOptions, mAnswer, i); mOptions = next.options; mAnswer = next.answer; }}>✕</button>
              {/if}
            </div>
          {/each}
          {#if mOptions.length < 6}
            <button class="lv-btn sm" style="border-style:dashed" onclick={() => (mOptions = [...mOptions, ""])}>＋ {t("manual.addOption")}</button>
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
            <button class="lv-btn sm lv-btn--ghost" onclick={() => (mSpecOpen = !mSpecOpen)}>
              {t("spec.authorSection")}{#if mSpecOpen} ▾{/if}
            </button>
          </div>
          {#if mSpecOpen}
            <div class="lv-row" style="margin:4px 0 0;align-items:flex-end">
              <label class="lv-field" style="max-width:160px"><span class="lv-muted">{t("spec.unit")}</span>
                <input class="lv-input" bind:value={mSpecUnit} placeholder="m/s" />
              </label>
              <label class="lv-field" style="max-width:150px"><span class="lv-muted">{t("spec.absTol")}</span>
                <input class="lv-input num" bind:value={mSpecAbsTol} placeholder="0.5" inputmode="decimal" />
              </label>
              <label class="lv-field" style="max-width:150px"><span class="lv-muted">{t("spec.relPct")}</span>
                <input class="lv-input num" bind:value={mSpecRelPct} placeholder="5" inputmode="decimal" />
              </label>
              <label class="lv-field" style="flex:1;min-width:180px"><span class="lv-muted">{t("spec.altUnits")}</span>
                <input class="lv-input" bind:value={mSpecAltUnits} placeholder="km/h, cm/s" />
              </label>
            </div>
          {/if}
        {/if}
        {#if mType === "short"}
          <div class="lv-row" style="margin:4px 0 0">
            <button class="lv-btn sm lv-btn--ghost" onclick={() => (mRubricOpen = !mRubricOpen)}>
              {t("rubric.authorSection")}{#if mRubricOpen} ▾{/if}
            </button>
            {#if authorRubricPreview}<span class="lv-chip num">{t("rubric.criteriaCount").replace("{n}", String(authorRubricPreview.criteria.length))}</span>{/if}
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
              <div class="lv-detail" style="margin:4px 0 0;padding:8px 10px;background:var(--lv-surface-2);border-radius:var(--lv-r-1)">
                {#each authorRubricPreview.criteria as c, ci (ci)}
                  <div class="lv-row" style="margin:2px 0;gap:var(--lv-space-2)">
                    <span class="lv-chip num">{Math.round(c.weight * 100)}%</span>
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
      <div class="lv-field"><label class="lv-muted" for="lv-manual-analysis">{t("manual.analysis")}</label>
        <textarea id="lv-manual-analysis" class="lv-input lv-textarea" style="min-height:52px" bind:value={mAnalysis}></textarea>
      </div>
      <div class="lv-row">
        <label class="lv-chip" for="lv-manual-kp">{t("manual.kp")}</label><input id="lv-manual-kp" class="lv-input" style="max-width:180px" bind:value={mKp} placeholder={t("manual.kpHint")} />
        <label class="lv-chip" for="lv-manual-source">{t("manual.source")}</label><input id="lv-manual-source" class="lv-input" style="max-width:160px" bind:value={mSource} placeholder={t("manual.sourceHint")} />
        <label class="lv-chip" for="lv-manual-group">{t("manual.group")}</label><input id="lv-manual-group" class="lv-input num" style="max-width:200px" bind:value={mGroup} placeholder="grp-…" />
      </div>
      <div class="lv-row" style="margin:4px 0 0;flex-wrap:wrap">
        <span class="lv-chip"><Icon name="volume" size={12} /> 朗读语言</span>
        <select class="lv-select" bind:value={mStudyLang} style="max-width:140px;height:28px">
          <option value="zh-CN">普通话 (zh-CN)</option>
          <option value="zh-HK">粤语 (zh-HK)</option>
          <option value="en-US">英语 (en-US)</option>
          <option value="ja-JP">日语 (ja-JP)</option>
        </select>
        <label class="lv-chip" for="lv-manual-phonetic">注音 / 粤拼</label>
        <input id="lv-manual-phonetic" class="lv-input" style="flex:1;min-width:160px;font-family:monospace" bind:value={mStudyPhonetic} placeholder="例如：m4 goi1 或拼音/音标（可选）" />
      </div>
      <div class="lv-row">
        {#if manualErrorMsg}<p class="lv-error" id="manual-validation-error" role="alert">{manualErrorMsg}</p>{/if}
        <button class="lv-btn lv-btn--primary" onclick={() => onsaveManual("published")} disabled={mSaving || !mStem.trim() || (mStatus === "published" && !mAnswer.trim() && mType !== "short")}>
          {mSaving ? "…" : mStatus === "draft" ? t("manual.saveDraft") : t("manual.save")}
        </button>
        {#if mStatus !== "draft"}
          <button class="lv-btn lv-btn--ghost" onclick={() => onsaveManual("draft")} disabled={mSaving || !mStem.trim()} title={t("manual.saveAsDraftTip")}>
            {t("manual.saveDraft")}
          </button>
        {/if}
        <button class="lv-btn lv-btn--ghost" onclick={onblankManualDraft} disabled={mSaving || (!mStem && !mAnswer && !mAnalysis)} title={t("manual.blankTitle", "清空并开始录入新题")}>
          {t("manual.blank", "换一道新题")}
        </button>
        {#if mSaved}<span class="lv-muted">{t("manual.savedHint")}</span>{/if}
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
        </div>
        {#if mKp.trim() || mSource.trim()}<div class="lv-preview-meta"><span>{mKp.trim() || t("manual.kp")}</span><span>{mSource.trim() || t("manual.source")}</span></div>{/if}
      </div>
      <p class="lv-muted lv-preview-note">编辑左侧内容，右侧会同步展示用户实际看到的题面。</p>
    </section>
  </div>
</div>
