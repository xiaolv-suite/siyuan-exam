// ============================================================
// A4 双栏紧凑打印与分页防断优化引擎（68-04 / 79-02）
// 纯函数领域层：
// 1. A4/Letter 纵向双栏紧凑排版（单栏/双栏切换，节省约 40% 纸张）
// 2. 共用材料题组分页防断保护（材料卡片与其首道小题强制同页同栏）
// 3. 页眉页脚、试卷编号与动态装订线标尺
// 4. 学生册严格脱敏（绝不包含标准答案/解析/AI/个人流水）
// 规则：严格无外部宿主依赖（禁 import "siyuan"），严禁类型强转。
// ============================================================

import type { Question } from "./types";
import { OPTION_LETTERS } from "./answer";
import { renderMathInText, getMathPrintStyles } from "./math";
import { renderMathAndDiagramsInText } from "./mathDiagram";
import { renderOcclusionSvg } from "./imageOcclusion";
import { formatDisplayAnswer } from "./structuredAnswer";

export type PaperSize = "A4" | "Letter";
export type ColumnLayout = "single" | "double";

export type SecretLevel = "none" | "secret" | "confidential" | "internal";

export interface PrintProOptions {
  /** 纸张规格（默认 A4） */
  paperSize?: PaperSize;
  /** 分栏方式（默认 double 双栏紧凑） */
  columns?: ColumnLayout;
  /** 页眉标题（默认使用试卷标题） */
  headerTitle?: string;
  /** 试卷副标题（如：考试时长：120分钟 满分：100分 / 2026学年第一学期期中考试） */
  subtitle?: string;
  /** 页脚附注（如“内部备考模拟卷，仅供参考”） */
  footerNote?: string;
  /** 试卷编号 */
  paperNo?: string;
  /** 试卷密级印章：none(无) | secret(绝密★启用前) | confidential(机密★启用前) | internal(内部资料 严禁外传) */
  secretLevel?: SecretLevel;
  /** 试卷背景倾斜平铺防盗印水印文字（如：阳光中学高三教研组） */
  watermarkText?: string;
  /** 是否打印答题区（填空/简答预留） */
  showAnswerArea?: boolean;
  /** 是否打印分值 */
  showScore?: boolean;
  /** 是否按考点章节分组排版（默认 true） */
  groupByKp?: boolean;
  /** 68-05: 是否展示装订密封线（考生姓名/准考证号/考场号/密封线内不要答题） */
  showSealLine?: boolean;
  /** 68-05: 是否在卷首展示考生须知/注意事项框 */
  showExamNotice?: boolean;
  /** 68-05: 主观题/解答题厘米级预留作答空白高度（0-30cm） */
  shortAnswerSpaceCm?: number;
  /** 是否展示试卷卷首阅卷总分表格（中高考标准阅卷大题计分栏） */
  showScoreGrid?: boolean;
  /** 是否在大题/小题前打印阅卷得分小方格 */
  showPerQuestionScoreBox?: boolean;
  /** 试卷字体基准大小：standard(10.5pt 五号) | compact(9.5pt 小五) | large(12pt 小四) */
  fontSizeMode?: "standard" | "compact" | "large";
  /** 是否在卷头打印考生填空信息横条（姓名/学号/班级/座位号） */
  showStudentInfoBar?: boolean;
  /** 是否在卷尾附加详细参考答案、采分点与思路拓展 */
  appendSolutionsAtEnd?: boolean;
  /** 是否自动将试题按标准大题题型（单选/多选/判断/填空/解答）归类排序排版 */
  autoGroupSections?: boolean;
}

const TYPE_NAMES: Record<string, string> = {
  single: "单选",
  multiple: "多选",
  judge: "判断",
  fill: "填空",
  short: "简答",
  material: "材料",
};

/** HTML 转义（严格防 XSS 注入） */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function resolveMaterialText(q?: Question): string {
  if (!q) return "";
  const stem = String(q.stem ?? "").trim();
  const analysis = String(q.analysis ?? "").trim();
  if (!stem) return analysis;
  if (!analysis) return stem;
  return analysis.length > stem.length ? analysis : stem;
}

/**
 * 依据选项文本与公式长度自适应计算分栏数（exam-zh / MathBank 规范）：
 * - 4 选项：短选项一行4列；中等选项两行两列；长选项单列纵排
 * - 2 选项：短中选项一行2列；长选项单列
 * - 其他数量：默认单列
 */
export function computeOptionColumns(
  options: readonly string[],
  columnLayout: ColumnLayout = "single",
): 1 | 2 | 4 {
  if (!options || options.length === 0) return 1;
  const getVisualWidth = (s: string) => {
    const cleaned = String(s ?? "")
      .replace(/<[^>]*>/g, "")
      .replace(/\$[^$]*\$/g, "xxx")
      .trim();
    let w = 0;
    for (let i = 0; i < cleaned.length; i++) {
      w += cleaned.charCodeAt(i) > 255 ? 2 : 1;
    }
    return w;
  };
  const maxWidth = Math.max(...options.map(getVisualWidth));
  const fourColLimit = columnLayout === "double" ? 9 : 12;
  const twoColLimit = columnLayout === "double" ? 18 : 40;
  if (options.length === 4) {
    if (maxWidth <= fourColLimit) return 4;
    if (maxWidth <= twoColLimit) return 2;
    return 1;
  }
  if (options.length === 2) {
    return maxWidth <= twoColLimit ? 2 : 1;
  }
  return 1;
}

/** 渲染装订密封线 HTML (exam-zh sealline 规范，纯黑白印刷) */
export function renderSealLineBar(): string {
  return `<div class="seal-line-bar">` +
    `<span class="seal-warning">★ 密封线内不要答题 ★</span>` +
    `<span>姓名：____________</span>` +
    `<span>准考证号：____________</span>` +
    `<span>考场号：________</span>` +
    `<span>座位号：________</span>` +
    `</div>`;
}

/** 渲染考生须知与答题注意事项 HTML */
export function renderExamNoticeBox(): string {
  return `<div class="exam-notice-box">` +
    `<div class="exam-notice-title">考生须知 / 注意事项</div>` +
    `<ol class="exam-notice-list">` +
    `<li>答卷前，考生务必将自己的姓名、准考证号、考场号填写在试卷和答题卡指定位置。</li>` +
    `<li>选择题每小题选出答案后，用铅笔把答题卡上对应题目的答案标号涂黑。如需改动，用橡皮擦干净后，再选涂其他答案标号。</li>` +
    `<li>非选择题必须用黑色字迹的签字笔或钢笔作答，答案必须写在各题目指定作答区域内，写在试卷或草稿纸上无效。</li>` +
    `</ol>` +
    `</div>`;
}

/** 渲染试卷保密级别印章 HTML */
export function renderSecretStamp(level?: SecretLevel): string {
  if (!level || level === "none") return "";
  const labelMap: Record<string, string> = {
    secret: "绝密 ★ 启用前",
    confidential: "机密 ★ 启用前",
    internal: "内部资料 · 严禁外传",
  };
  const label = labelMap[level] || "机密 ★ 启用前";
  return `<div class="secret-stamp-wrap"><span class="secret-stamp">${escapeHtml(label)}</span></div>`;
}

/** 渲染背景全页面平铺倾斜防盗印水印 HTML */
export function renderWatermarkLayer(text?: string): string {
  if (!text || !text.trim()) return "";
  const clean = escapeHtml(text.trim());
  const items = Array(12).fill(`<div class="watermark-item">${clean}</div>`).join("");
  return `<div class="print-watermark" aria-hidden="true">${items}</div>`;
}

/** 渲染考生信息横条 HTML */
export function renderStudentInfoBar(): string {
  return `<div class="student-info-bar">` +
    `<span>姓名：___________</span>` +
    `<span>班级：___________</span>` +
    `<span>学号：___________</span>` +
    `<span>考场：___________</span>` +
    `<span>座号：___________</span>` +
    `</div>`;
}

/**
 * 渲染标准试卷卷首总分阅卷栏表格（按大题类型自动划分列数）
 */
export function renderScoreGridTable(questions: readonly Question[]): string {
  const typeOrder: Array<{ type: string; label: string }> = [
    { type: "single", label: "一" },
    { type: "multiple", label: "二" },
    { type: "judge", label: "三" },
    { type: "fill", label: "四" },
    { type: "short", label: "五" },
  ];
  const activeSections: string[] = [];
  const typeSet = new Set<string>();

  for (const q of questions) {
    if (q.type !== "material") {
      typeSet.add(q.type);
    }
  }

  const romanNumerals = ["一", "二", "三", "四", "五", "六", "七", "八"];
  let numIdx = 0;
  for (const item of typeOrder) {
    if (typeSet.has(item.type)) {
      activeSections.push(romanNumerals[numIdx] || String(numIdx + 1));
      numIdx++;
    }
  }

  if (activeSections.length === 0) {
    activeSections.push("一", "二", "三");
  }

  const thCols = activeSections.map((s) => `<th>第${s}大题</th>`).join("");
  const tdEmpty = activeSections.map(() => `<td>&nbsp;</td>`).join("");

  return `<div class="score-grid-wrap">` +
    `<table class="score-grid-table">` +
    `<thead><tr><th>题号</th>${thCols}<th>总分</th><th>核分人</th></tr></thead>` +
    `<tbody><tr><td class="row-label">得分</td>${tdEmpty}<td>&nbsp;</td><td>&nbsp;</td></tr></tbody>` +
    `</table>` +
    `</div>`;
}

export interface PaperSectionGroup {
  type: string;
  sectionIndex: string;
  sectionTitle: string;
  sectionNotice: string;
  totalScore: number;
  questions: Question[];
}

/**
 * 纯函数：将组卷题目智能按标准考试大题类型（单选/多选/判断/填空/简答）归类并排序
 */
export function groupAndSortPaperQuestions(
  questions: readonly Question[],
): PaperSectionGroup[] {
  const typeConfigs = [
    {
      type: "single",
      name: "单项选择题",
      notice: "在每小题列出的备选项中只有一个是符合题目要求的，请将其代码填写在题后的括号内或答题卡上。",
    },
    {
      type: "multiple",
      name: "多项选择题",
      notice: "在每小题列出的备选项中有两个或两个以上符合题目要求，错选、多选、少选均不得分。",
    },
    {
      type: "judge",
      name: "判断题",
      notice: "判断下列各题表述是否正确，正确的填涂 [T]，错误的填涂 [F]。",
    },
    {
      type: "fill",
      name: "填空题",
      notice: "请将各小题的正确答案填写在题中横线空白处。",
    },
    {
      type: "short",
      name: "解答与综合分析题",
      notice: "解答应写出详细文字说明、演算推导步骤或证明过程。",
    },
    {
      type: "material",
      name: "材料阅读与大题背景",
      notice: "请结合所给材料背景完成后续相关小题。",
    },
  ];

  const romanNumerals = ["一", "二", "三", "四", "五", "六", "七", "八"];
  const groups: PaperSectionGroup[] = [];
  let secIdx = 0;

  for (const cfg of typeConfigs) {
    const matched = questions.filter((q) => q.type === cfg.type);
    if (matched.length > 0) {
      const roman = romanNumerals[secIdx] || String(secIdx + 1);
      const totalScore = matched.reduce((sum, q) => sum + (q.score || 1), 0);
      const scoresEqual = matched.every((q) => (q.score || 1) === (matched[0].score || 1));
      const perScore = matched[0].score || 1;
      const countClause = scoresEqual
        ? `本大题共 ${matched.length} 小题，每小题 ${perScore} 分，共 ${totalScore} 分。`
        : `本大题共 ${matched.length} 小题，共 ${totalScore} 分。`;
      const notice = `${countClause}${cfg.notice}`;
      groups.push({
        type: cfg.type,
        sectionIndex: roman,
        sectionTitle: `${roman}、${cfg.name}（共 ${matched.length} 题，共 ${totalScore} 分）`,
        sectionNotice: notice,
        totalScore,
        questions: matched,
      });
      secIdx++;
    }
  }

  // 兜底其他未收录的扩展题型
  const covered = new Set(typeConfigs.map((c) => c.type));
  const otherQuestions = questions.filter((q) => !covered.has(q.type));
  if (otherQuestions.length > 0) {
    const roman = romanNumerals[secIdx] || String(secIdx + 1);
    const totalScore = otherQuestions.reduce((sum, q) => sum + (q.score || 1), 0);
    groups.push({
      type: "other",
      sectionIndex: roman,
      sectionTitle: `${roman}、其他综合题型（共 ${otherQuestions.length} 题，共 ${totalScore} 分）`,
      sectionNotice: `本大题共 ${otherQuestions.length} 小题，共 ${totalScore} 分。`,
      totalScore,
      questions: otherQuestions,
    });
  }

  return groups;
}

/** 将纯文本中的连续下划线 ____ 替换为印刷级填空横线，不触碰 HTML 标签与 SVG 属性 */
function injectFillBlanks(renderedHtml: string): string {
  return renderedHtml
    .split(/(<[^>]+>)/g)
    .map((part) => {
      if (part.startsWith("<")) return part;
      return part.replace(/_{3,}|＿{3,}/g, `<span class="fill-blank-line" aria-label="填空横线"></span>`);
    })
    .join("");
}

/** 渲染规范题干 HTML（去首尾空行、替换填空下划线、为选择/判断补齐标准括号） */
function renderQuestionStemHtml(q: Question, addTrailingParen = true): { html: string; hasInlineBlank: boolean } {
  const raw = String(q.stem ?? "").trim();
  const hasInlineBlank = /_{3,}|＿{3,}/.test(raw);
  let html = renderMathAndDiagramsInText(raw);
  if (q.type === "fill" && hasInlineBlank) {
    html = injectFillBlanks(html);
  }
  if (
    addTrailingParen &&
    (q.type === "single" || q.type === "multiple" || q.type === "judge") &&
    !/[（(]\s*[)）]\s*$/.test(raw)
  ) {
    html += `<span class="q-paren">（\u3000\u3000）</span>`;
  }
  return { html, hasInlineBlank };
}

interface RubricViewItem {
  label: string;
  weightPct?: number;
  points?: number;
  desc?: string;
}

function extractRubricItems(q: Question): RubricViewItem[] {
  if (!q.rubric || typeof q.rubric !== "object") return [];
  const rawCriteria = (q.rubric as {
    fullScore?: number;
    total?: number;
    criteria?: Array<{
      label?: string;
      name?: string;
      weight?: number;
      points?: number;
      example?: string;
      desc?: string;
    }>;
  }).criteria;
  if (!Array.isArray(rawCriteria) || rawCriteria.length === 0) return [];
  const fullScore =
    (q.rubric as { fullScore?: number; total?: number }).fullScore ??
    (q.rubric as { total?: number }).total ??
    (q.score || 0);
  return rawCriteria.map((c) => {
    const label = c.label || c.name || "采分要点";
    const weightPct = typeof c.weight === "number" ? Math.round(c.weight * 100) : undefined;
    const points =
      typeof c.points === "number"
        ? c.points
        : typeof c.weight === "number" && fullScore > 0
          ? Math.round(c.weight * fullScore * 10) / 10
          : undefined;
    const desc = c.desc || c.example;
    return { label, weightPct, points, desc };
  });
}

/** 生成分栏与打印优化 CSS（真实中高考/高校/教研印刷级黑白排版规范） */
export function buildPrintProCss(options: PrintProOptions = {}): string {
  const isDouble = (options.columns ?? "double") === "double";
  const size = options.paperSize === "Letter" ? "Letter" : "A4";

  let bodyFontSize = "10.5pt";
  let bodyLineHeight = "1.7";
  if (options.fontSizeMode === "compact") {
    bodyFontSize = "9.5pt";
    bodyLineHeight = "1.55";
  } else if (options.fontSizeMode === "large") {
    bodyFontSize = "12pt";
    bodyLineHeight = "1.78";
  }

  return `
    @page {
      size: ${size} portrait;
      margin: 18mm 16mm 18mm 16mm;
      @bottom-center {
        content: "第 " counter(page) " 页  共 " counter(pages) " 页";
        font-size: 9pt;
        color: #444;
        font-family: "SimSun", "NSimSun", "Songti SC", serif;
      }
    }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #fff; }
    body {
      font-family: "SimSun", "NSimSun", "Songti SC", "STSong", "Noto Serif CJK SC", "Source Han Serif SC", serif;
      font-size: ${bodyFontSize};
      line-height: ${bodyLineHeight};
      color: #111;
      padding: 16mm 16mm 20mm 16mm;
      position: relative;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    header.sheet-header {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      border-bottom: 0.75pt solid #999;
      padding-bottom: 3pt;
      margin-bottom: 10pt;
      font-size: 9pt;
      color: #444;
      font-family: "SimSun", "Songti SC", serif;
    }
    .secret-stamp-wrap {
      margin-bottom: 5pt;
      overflow: hidden;
      page-break-after: avoid;
      break-after: avoid;
    }
    .secret-stamp {
      float: left;
      font-size: 9pt;
      font-weight: 700;
      color: #000;
      border: 1.2pt solid #000;
      padding: 1.5pt 6pt;
      letter-spacing: 1px;
      font-family: "SimHei", "Heiti SC", "Microsoft YaHei", sans-serif;
    }
    .print-watermark {
      position: fixed;
      top: 0; left: 0; width: 100vw; height: 100vh;
      pointer-events: none;
      z-index: 9999;
      opacity: 0.05;
      display: flex;
      flex-wrap: wrap;
      justify-content: space-around;
      align-content: space-around;
      overflow: hidden;
    }
    .watermark-item {
      font-size: 26pt;
      font-weight: 700;
      color: #000;
      transform: rotate(-30deg);
      user-select: none;
      margin: 40pt;
      font-family: "SimHei", "Heiti SC", sans-serif;
    }
    .sheet-title-banner {
      text-align: center;
      margin: 4pt 0 10pt;
      page-break-after: avoid;
      break-after: avoid;
    }
    .sheet-title-banner.is-left {
      text-align: left;
      border-bottom: 1.5pt solid #111;
      padding-bottom: 6pt;
      margin-bottom: 10pt;
    }
    .sheet-main-title {
      font-size: 20pt;
      font-weight: 700;
      letter-spacing: 2px;
      margin: 0 0 4pt;
      color: #000;
      line-height: 1.3;
      font-family: "SimHei", "Heiti SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif;
    }
    .sheet-sub-title {
      font-size: 10pt;
      color: #222;
      margin: 0;
      font-family: "FangSong", "KaiTi", "STKaiti", "SimSun", serif;
    }
    .student-info-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 8pt;
      padding: 4pt 6pt 5pt;
      margin: 0 0 9pt;
      border-bottom: 0.75pt solid #444;
      font-size: 9.5pt;
      color: #111;
      font-family: "SimSun", "Songti SC", serif;
      page-break-after: avoid;
      break-after: avoid;
    }
    .score-grid-wrap {
      margin: 0 0 9pt;
      display: flex;
      justify-content: center;
      page-break-after: avoid;
      break-after: avoid;
    }
    .score-grid-table {
      border-collapse: collapse;
      font-size: 9pt;
      text-align: center;
      border: 1pt solid #000;
      font-family: "SimSun", "Songti SC", serif;
    }
    .score-grid-table th, .score-grid-table td {
      border: 0.75pt solid #222;
      padding: 2.5pt 8pt;
      min-width: 44pt;
      height: 17pt;
    }
    .score-grid-table th {
      background: #f5f5f5;
      font-weight: 700;
      color: #000;
    }
    .score-grid-table .row-label {
      background: #fafafa;
      font-weight: 700;
    }
    .paper-section-banner {
      margin: 13pt 0 6pt;
      padding: 0 0 3pt;
      border-bottom: 0.75pt solid #bbb;
      page-break-after: avoid;
      break-after: avoid;
    }
    .paper-section-title {
      font-size: 11.5pt;
      font-weight: 700;
      color: #000;
      letter-spacing: 0.5px;
      font-family: "SimHei", "Heiti SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif;
    }
    .paper-section-notice {
      font-size: 9pt;
      color: #333;
      margin-top: 2pt;
      line-height: 1.45;
      font-family: "KaiTi", "STKaiti", "SimSun", serif;
    }
    .q-score-box {
      float: right;
      display: flex;
      gap: 2pt;
      margin: 0 0 2pt 8pt;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .q-score-box table {
      border-collapse: collapse;
      border: 0.75pt solid #222;
      font-size: 7.5pt;
      text-align: center;
      font-family: "SimSun", "Songti SC", serif;
    }
    .q-score-box td {
      border: 0.75pt solid #444;
      padding: 1pt 4pt;
      min-width: 26pt;
      height: 12pt;
    }
    .solution-appendix-divider {
      column-span: all;
      page-break-before: always;
      break-before: page;
      margin-top: 16pt;
      padding-top: 10pt;
      border-top: 1.5pt dashed #222;
      text-align: center;
      font-size: 14pt;
      font-weight: 700;
      color: #000;
      font-family: "SimHei", "Heiti SC", "Microsoft YaHei", sans-serif;
    }
    /* 答题卡（标准机读卡）专用纯黑白印刷规范 */
    .omr-sheet {
      position: relative;
      padding: 16pt 14pt;
    }
    .omr-corner {
      position: absolute;
      width: 9pt;
      height: 9pt;
      background: #000;
    }
    .omr-tl { top: 0; left: 0; }
    .omr-tr { top: 0; right: 0; }
    .omr-bl { bottom: 0; left: 0; }
    .omr-br { bottom: 0; right: 0; }
    .card-notice-box {
      border: 1pt solid #000;
      padding: 4pt 8pt;
      margin-bottom: 8pt;
      font-size: 8.5pt;
      line-height: 1.45;
      color: #111;
    }
    .card-top-row {
      display: flex;
      gap: 10pt;
      margin-bottom: 10pt;
      align-items: stretch;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .card-info-table {
      border-collapse: collapse;
      font-size: 9pt;
      width: 100%;
      border: 1.2pt solid #000;
    }
    .card-info-table td {
      border: 0.75pt solid #222;
      padding: 4pt 6pt;
    }
    .card-ticket-grid {
      width: 100%;
      border-collapse: collapse;
      margin-top: 4pt;
      font-size: 7.5pt;
      text-align: center;
      border: 1pt solid #000;
    }
    .card-ticket-grid th, .card-ticket-grid td {
      border: 0.5pt solid #666;
      padding: 1pt 2pt;
      line-height: 1.2;
    }
    .card-ticket-grid th {
      height: 15pt;
      background: #fff;
      border-bottom: 1pt solid #000;
    }
    .card-right-col {
      width: 155pt;
      display: flex;
      flex-direction: column;
      gap: 6pt;
    }
    .card-barcode-box {
      flex: 1;
      min-height: 64pt;
      border: 1.2pt dashed #111;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      font-size: 9pt;
      font-weight: 700;
      color: #222;
      text-align: center;
      padding: 6pt;
    }
    .card-absent-box {
      border: 1pt solid #000;
      padding: 4pt 6pt;
      font-size: 8pt;
      text-align: center;
    }
    .bubble-matrix {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 8pt;
      margin-bottom: 10pt;
    }
    .bubble-group-box {
      border: 1pt solid #000;
      padding: 5pt 7pt;
      background: #fff;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .bubble-row {
      display: flex;
      align-items: center;
      gap: 5pt;
      font-size: 8.5pt;
      margin: 2.5pt 0;
      font-family: "Courier New", Consolas, monospace;
    }
    .bubble-no {
      min-width: 18pt;
      text-align: right;
      font-weight: 700;
      color: #000;
    }
    .bubble-item {
      border: 0.75pt solid #000;
      padding: 0 3.5pt;
      font-weight: 700;
      font-size: 7.5pt;
      color: #000;
      min-width: 16pt;
      line-height: 1.25;
      text-align: center;
      display: inline-block;
    }
    .card-subjective-box {
      border: 1.5pt solid #000;
      margin: 8pt 0 10pt;
      padding: 6pt 8pt;
      background: #fff;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .card-subjective-head {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      border-bottom: 0.75pt dashed #666;
      padding-bottom: 3pt;
      margin-bottom: 6pt;
    }
    .card-subjective-title {
      font-size: 9.5pt;
      font-weight: 700;
      color: #000;
      font-family: "SimHei", "Heiti SC", sans-serif;
    }
    .card-subjective-warn {
      font-size: 7.5pt;
      color: #333;
    }
    .card-forbid-zone {
      border: 1pt dashed #444;
      text-align: center;
      font-size: 8.5pt;
      color: #444;
      letter-spacing: 3px;
      padding: 6pt;
      margin-top: 8pt;
    }
    /* 独立答案册速查表 */
    .answer-quick-section {
      column-span: all;
      margin-bottom: 12pt;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .answer-quick-title {
      font-size: 10.5pt;
      font-weight: 700;
      color: #000;
      margin-bottom: 5pt;
      font-family: "SimHei", "Heiti SC", sans-serif;
    }
    .answer-quick-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(145pt, 1fr));
      gap: 5pt;
    }
    .answer-quick-table {
      width: 100%;
      border-collapse: collapse;
      border: 1pt solid #000;
      font-size: 8.5pt;
      text-align: center;
    }
    .answer-quick-table th, .answer-quick-table td {
      border: 0.5pt solid #444;
      padding: 2pt 3pt;
    }
    .answer-quick-table th {
      background: #f4f4f4;
      font-weight: 700;
    }
    .answer-quick-table td {
      font-weight: 700;
      color: #000;
    }
    ${isDouble
      ? `section.questions { column-count: 2; column-gap: 8mm; column-rule: 0.5pt solid #bbb; column-fill: balance; }
         @media print { section.questions { column-fill: auto; } }`
      : `section.questions { column-count: 1; }`}
    .q {
      page-break-inside: avoid;
      break-inside: avoid;
      margin: 0 0 10pt;
    }
    .q-stem-line {
      margin: 0;
      overflow-wrap: anywhere;
    }
    .q-no {
      font-weight: 700;
      color: #000;
      margin-right: 3pt;
    }
    .q-type-inline {
      font-size: 0.9em;
      color: #333;
      margin-right: 3pt;
    }
    .q-score-inline {
      font-size: 0.92em;
      color: #222;
      margin-right: 3pt;
    }
    .q-paren {
      white-space: nowrap;
      margin-left: 2pt;
    }
    .fill-blank-line {
      display: inline-block;
      min-width: 4.5em;
      border-bottom: 0.75pt solid #111;
      height: 0.95em;
      vertical-align: -1.5pt;
      margin: 0 2pt;
    }
    /* 材料卡片与首道小题强制同页同栏保护 */
    .material-block {
      page-break-inside: avoid;
      break-inside: avoid;
      page-break-after: avoid;
      break-after: avoid;
      background: #f8f8f8;
      border-left: 2pt solid #333;
      padding: 5pt 8pt;
      margin: 0 0 6pt;
      font-size: 0.96em;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
    .section-divider {
      column-span: all;
      font-weight: 700;
      font-size: 10.5pt;
      margin: 10pt 0 5pt;
      padding: 3pt 8pt;
      background: #f5f5f5;
      border-left: 3pt solid #111;
      border-bottom: 0.5pt solid #ccc;
      color: #000;
      font-family: "SimHei", "Heiti SC", "Microsoft YaHei", sans-serif;
      page-break-after: avoid;
      break-after: avoid;
    }
    .homework-student-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 8pt;
      padding: 5pt 8pt;
      margin: 0 0 10pt;
      border-top: 0.75pt solid #333;
      border-bottom: 0.75pt solid #333;
      font-size: 9.5pt;
      color: #111;
      font-family: "SimSun", "Songti SC", serif;
    }
    .homework-reflection-box {
      column-span: all;
      margin-top: 14pt;
      padding: 7pt 10pt;
      border: 0.75pt solid #333;
      background: #fff;
      font-size: 9pt;
      line-height: 1.65;
      color: #111;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .q-group-head { page-break-after: avoid; break-after: avoid; }
    .q-head { font-weight: 700; margin-bottom: 3pt; color: #000; }
    .q-type { font-size: 0.88em; color: #222; margin-right: 4pt; font-weight: 700; }
    .q-score { float: right; font-weight: 400; font-size: 0.9em; color: #333; }
    .q-stem { white-space: pre-line; overflow-wrap: anywhere; }
    .opt { margin-left: 1.4em; }
    /* 选项自适应网格 (exam-zh choices 规范) */
    .opt-grid {
      display: grid;
      gap: 3pt 12pt;
      margin: 4pt 0 2pt 1.4em;
      font-size: inherit;
    }
    .opt-grid-4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }
    .opt-grid-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .opt-grid-1 { grid-template-columns: 1fr; }
    .opt-grid .opt { margin-left: 0; }
    .opt-item { min-width: 0; overflow-wrap: anywhere; }

    /* 装订密封线 (exam-zh sealline 规范，纯黑白印刷) */
    .seal-line-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 8pt;
      padding: 4pt 8pt;
      margin-bottom: 10pt;
      border-top: 0.75pt dashed #444;
      border-bottom: 1.5pt dashed #111;
      font-size: 9pt;
      color: #111;
      font-family: "SimSun", "Songti SC", serif;
      page-break-after: avoid;
      break-after: avoid;
    }
    .seal-warning {
      font-weight: 700;
      letter-spacing: 1.5px;
      color: #000;
      font-family: "SimHei", "Heiti SC", sans-serif;
    }

    /* 卷首考生须知框（纯黑白规范） */
    .exam-notice-box {
      border: 0.75pt solid #333;
      padding: 5pt 10pt;
      margin-bottom: 10pt;
      font-size: 9pt;
      line-height: 1.55;
      color: #111;
      background: #fff;
      page-break-after: avoid;
      break-after: avoid;
    }
    .exam-notice-title {
      font-weight: 700;
      font-size: 9.5pt;
      margin-bottom: 2pt;
      color: #000;
      text-align: center;
      font-family: "SimHei", "Heiti SC", sans-serif;
    }
    .exam-notice-list {
      margin: 0;
      padding-left: 16pt;
    }
    .exam-notice-list li {
      margin: 1pt 0;
    }

    /* 作答留白区 */
    .answer-area-custom {
      border: 0.5pt dashed #aaa;
      margin: 5pt 0 2pt 1.4em;
      background: #fff;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .answer-area-ruled {
      border: 0.5pt solid #bbb;
      margin: 5pt 0 2pt 1.4em;
      background-color: #fff;
      background-image: repeating-linear-gradient(
        to bottom,
        transparent 0,
        transparent 21pt,
        #dcdcdc 21pt,
        #dcdcdc 21.75pt
      );
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .answer-area {
      border-bottom: 0.75pt solid #444;
      height: 2em;
      margin: 4pt 0 2pt 1.4em;
    }
    .ans-analysis {
      color: #222;
      font-size: 0.94em;
      margin: 2pt 0 0 1.4em;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
    .kp-tag {
      color: #444;
      font-size: 0.85em;
      border: 0.5pt solid #999;
      padding: 0 3pt;
      margin-left: 4pt;
    }
    /* 教师备课与授课讲义分层解析卡（克制沉稳教研风） */
    .teacher-box {
      margin: 6pt 0 2pt 1.4em;
      padding: 6pt 10pt;
      background: #f8f9fa;
      border: 0.75pt solid #d0d7de;
      border-left: 3pt solid #334155;
      font-size: 0.92em;
      line-height: 1.6;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .teacher-ans { color: #111; font-weight: 700; }
    .teacher-meta { color: #475569; font-size: 0.9em; margin: 3pt 0; }
    .teacher-rubric { color: #1e293b; font-size: 0.92em; margin: 3pt 0; }
    .teacher-analysis { color: #1f2937; margin-top: 3pt; }
    .teacher-expansion { color: #334155; margin-top: 3pt; padding-top: 3pt; border-top: 0.5pt dashed #cbd5e1; }
    footer.sheet-footer {
      margin-top: 18pt;
      border-top: 0.75pt solid #bbb;
      padding-top: 4pt;
      font-size: 8.5pt;
      color: #555;
      display: flex;
      justify-content: space-between;
      font-family: "SimSun", "Songti SC", serif;
    }
    @media print {
      body { margin: 0; padding: 0; }
      .omr-sheet { padding: 0; }
    }
    ${getMathPrintStyles()}
  `;
}

function renderHeader(title: string, subtitle: string, paperNo?: string): string {
  const right = [paperNo ? `试卷编号 ${paperNo}` : "", subtitle].filter(Boolean).join(" · ");
  return `<header class="sheet-header"><span>${escapeHtml(title)}</span><span>${escapeHtml(right)}</span></header>`;
}

function renderFooter(note?: string, today: string = new Date().toLocaleDateString("zh-CN")): string {
  return `<footer class="sheet-footer"><span>${escapeHtml(note || "小驴考试 · 本地离线生成")}</span><span>${escapeHtml(today)}</span></footer>`;
}

/**
 * 生成 A4 单栏/双栏紧凑作答卷 HTML（标准测试卷 · 纯黑白真实印刷规范）。
 * 安全红线：绝不输出标准答案与解析字段（除非用户显式开启 appendSolutionsAtEnd）。
 */
export function buildCompactQuestionSheetPro(
  title: string,
  questions: readonly Question[],
  options: PrintProOptions = {},
): string {
  const showArea = options.showAnswerArea !== false;
  const showScore = options.showScore === true;
  const groupByKp = options.groupByKp === true;
  const colLayout: ColumnLayout = options.columns ?? "double";
  const mainTitle = options.headerTitle || title;
  const hasSealLine = options.showSealLine === true;

  const parts: string[] = [
    `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><title>${escapeHtml(mainTitle)}</title><style>${buildPrintProCss(options)}</style></head><body>`,
  ];

  if (options.watermarkText) {
    parts.push(renderWatermarkLayer(options.watermarkText));
  }

  parts.push(renderHeader(mainTitle, `共 ${questions.length} 题`, options.paperNo));

  if (options.secretLevel && options.secretLevel !== "none") {
    parts.push(renderSecretStamp(options.secretLevel));
  }

  if (hasSealLine) {
    parts.push(renderSealLineBar());
  }

  // 卷面大标题与副标题横幅
  parts.push(`<div class="sheet-title-banner">`);
  parts.push(`<h1 class="sheet-main-title">${escapeHtml(mainTitle)}</h1>`);
  if (options.subtitle) {
    parts.push(`<p class="sheet-sub-title">${escapeHtml(options.subtitle)}</p>`);
  }
  parts.push(`</div>`);

  // 启用装订密封线时，密封线已包含姓名/准考证号/考场号/座位号，绝不再重复渲染第二排考生信息条
  if (options.showStudentInfoBar && !hasSealLine) {
    parts.push(renderStudentInfoBar());
  }
  if (options.showScoreGrid) {
    parts.push(renderScoreGridTable(questions));
  }
  if (options.showExamNotice) {
    parts.push(renderExamNoticeBox());
  }

  parts.push(`<section class="questions">`);

  const autoGroup = options.autoGroupSections !== false;
  const sections = autoGroup ? groupAndSortPaperQuestions(questions) : null;
  const printedGroups = new Set<string>();
  let lastKp = "";
  let overallNo = 0;

  const renderSingleQuestion = (q: Question, no: number, showInlineType: boolean) => {
    if (groupByKp && q.kp && q.kp !== lastKp) {
      lastKp = q.kp;
      parts.push(`<div class="section-divider">考点章节：${escapeHtml(q.kp)}</div>`);
    }

    let materialHtml = "";
    if (q.group && !printedGroups.has(q.group)) {
      const carrier = questions.find((m) => m.group === q.group && m.type === "material" && Boolean(resolveMaterialText(m)));
      const carrierBody = resolveMaterialText(carrier);
      if (carrierBody) {
        materialHtml = `<div class="material-block q-group-head">${renderMathAndDiagramsInText(carrierBody)}</div>`;
        printedGroups.add(q.group);
      }
    }

    if (q.type === "material") {
      if (q.group) {
        if (materialHtml) parts.push(`<div class="q">${materialHtml}</div>`);
        return;
      }
      const selfBody = resolveMaterialText(q);
      if (selfBody) {
        parts.push(`<div class="q"><div class="material-block">${renderMathAndDiagramsInText(selfBody)}</div></div>`);
      }
      return;
    }

    parts.push(`<div class="q">`);
    if (materialHtml) parts.push(materialHtml);

    let scoreBoxHtml = "";
    if (options.showPerQuestionScoreBox && (q.type === "short" || q.type === "fill")) {
      scoreBoxHtml = `<div class="q-score-box"><table><tr><td>得分</td></tr><tr><td>&nbsp;</td></tr></table><table><tr><td>评卷人</td></tr><tr><td>&nbsp;</td></tr></table></div>`;
    }

    const typeInline = showInlineType ? `<span class="q-type-inline">（${escapeHtml(TYPE_NAMES[q.type] ?? q.type)}）</span>` : "";
    const scoreInline = showScore ? `<span class="q-score-inline">（${q.score || 1} 分）</span>` : "";
    const { html: stemHtml, hasInlineBlank } = renderQuestionStemHtml(q, true);

    parts.push(
      `<div class="q-stem-line">${scoreBoxHtml}<span class="q-no">${no}.</span>${typeInline}${scoreInline}<span class="q-stem">${stemHtml}</span></div>`,
    );

    if (q.occlusion) {
      parts.push(`<div class="occlusion-wrap">${renderOcclusionSvg(q.occlusion, { printMode: true })}</div>`);
    }
    if (q.options && q.options.length > 0) {
      const cols = computeOptionColumns(q.options, colLayout);
      parts.push(`<div class="opt-grid opt-grid-${cols}">`);
      q.options.forEach((o, oi) => {
        parts.push(`<div class="opt opt-item">${String.fromCharCode(65 + oi)}. ${renderMathInText(o)}</div>`);
      });
      parts.push(`</div>`);
    }
    if (showArea) {
      if (q.type === "short") {
        const cm = options.shortAnswerSpaceCm && options.shortAnswerSpaceCm > 0
          ? Math.max(0.5, Math.min(30, options.shortAnswerSpaceCm))
          : 2.8;
        parts.push(`<div class="answer-area-custom" style="min-height:${cm}cm"></div>`);
      } else if (q.type === "fill" && !hasInlineBlank) {
        parts.push(`<div class="answer-area"></div>`);
      }
    }
    parts.push(`</div>`);
  };

  if (sections && sections.length > 0) {
    for (const sec of sections) {
      parts.push(`<div class="paper-section-banner">`);
      parts.push(`<div class="paper-section-title">${escapeHtml(sec.sectionTitle)}</div>`);
      parts.push(`<div class="paper-section-notice">${escapeHtml(sec.sectionNotice)}</div>`);
      parts.push(`</div>`);
      for (const sq of sec.questions) {
        overallNo++;
        renderSingleQuestion(sq, overallNo, false);
      }
    }
  } else {
    questions.forEach((q, i) => {
      overallNo = i + 1;
      renderSingleQuestion(q, overallNo, true);
    });
  }

  // 如果开启卷尾附加参考答案与解析
  if (options.appendSolutionsAtEnd) {
    const orderedForAppendix = sections ? sections.flatMap((s) => s.questions) : questions;
    parts.push(`<div class="solution-appendix-divider">【参考答案与解题分析附录】</div>`);
    let solNo = 0;
    for (const sq of orderedForAppendix) {
      if (sq.type === "material") continue;
      solNo++;
      parts.push(`<div class="q">`);
      parts.push(`<div class="q-head">${solNo}. <strong>${escapeHtml(formatDisplayAnswer(sq.answer) || sq.answer)}</strong>${sq.kp ? ` <span class="kp-tag">${escapeHtml(sq.kp)}</span>` : ""}</div>`);
      const rubricItems = extractRubricItems(sq);
      if (sq.type === "short" && rubricItems.length > 0) {
        const rubricText = rubricItems
          .map((item) => {
            const ptsPart = item.points !== undefined ? `+${item.points}分` : item.weightPct !== undefined ? `${item.weightPct}%` : "";
            return ptsPart ? `${item.label}(${ptsPart})` : item.label;
          })
          .join(" · ");
        parts.push(`<div class="ans-analysis">采分点标准：${escapeHtml(rubricText)}</div>`);
      }
      if (sq.analysis) parts.push(`<div class="ans-analysis">详细解析：${renderMathInText(sq.analysis)}</div>`);
      if (sq.expansion) parts.push(`<div class="ans-analysis">思路拓展与秒杀要诀：${renderMathInText(sq.expansion)}</div>`);
      parts.push(`</div>`);
    }
  }

  parts.push(`</section>`, renderFooter(options.footerNote), `</body></html>`);
  return parts.join("\n");
}

/**
 * 生成符合全国中高考与大型模考标准的 A4 独立填涂答题卡 HTML (Standard Bubble Answer Card)
 */
export function buildStandardAnswerCardPro(
  title: string,
  questions: readonly Question[],
  options: PrintProOptions = {},
): string {
  const mainTitle = options.headerTitle || title;
  const autoGroup = options.autoGroupSections !== false;
  const orderedQuestions = autoGroup
    ? groupAndSortPaperQuestions(questions).flatMap((sec) => sec.questions)
    : [...questions];

  const parts: string[] = [
    `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><title>${escapeHtml(mainTitle)} · 答题卡</title><style>${buildPrintProCss({ ...options, columns: "single" })}</style></head><body>`,
    `<div class="omr-sheet">`,
    `<span class="omr-corner omr-tl" aria-hidden="true"></span>`,
    `<span class="omr-corner omr-tr" aria-hidden="true"></span>`,
    `<span class="omr-corner omr-bl" aria-hidden="true"></span>`,
    `<span class="omr-corner omr-br" aria-hidden="true"></span>`,
    renderHeader(`${mainTitle} · 答题卡`, `总题量：${orderedQuestions.filter((q) => q.type !== "material").length} 题`, options.paperNo),
  ];

  parts.push(`<div class="sheet-title-banner">`);
  parts.push(`<h1 class="sheet-main-title">${escapeHtml(mainTitle)} · 答题卡</h1>`);
  parts.push(`<p class="sheet-sub-title">${escapeHtml(options.subtitle || "机读填涂与主观题规范作答卡")}</p>`);
  parts.push(`</div>`);

  // 考生注意事项与填涂样例
  parts.push(`<div class="card-notice-box">`);
  parts.push(`<strong>注意事项：</strong>1. 答题前请将姓名、班级、考场、座位号及准考证号填写清楚。2. 选择题必须使用 2B 铅笔规范填涂，修改时用橡皮擦干净。3. 主观题必须使用 0.5mm 黑色签字笔在各题黑色矩形边框内作答，超出边框无效。 &nbsp;|&nbsp; <strong>填涂样例：</strong>正确 <strong>[■]</strong> &nbsp;错误 [✓] [×] [／]`);
  parts.push(`</div>`);

  // 顶部考生信息 + 准考证号 [0]-[9] 填涂矩阵 + 条形码粘贴区
  const ticketCols = 8;
  const ticketHeaderCells = Array(ticketCols).fill(`<th>&nbsp;</th>`).join("");
  const ticketRows = Array.from({ length: 10 }, (_, digit) => {
    const cells = Array(ticketCols).fill(`<td>[${digit}]</td>`).join("");
    return `<tr>${cells}</tr>`;
  }).join("");

  parts.push(`<div class="card-top-row">`);
  parts.push(`<div style="flex:1">`);
  parts.push(`<table class="card-info-table">`);
  parts.push(`<tr><td>姓名：__________________</td><td>班级：__________________</td></tr>`);
  parts.push(`<tr><td>考场：__________________</td><td>座位号：________________</td></tr>`);
  parts.push(`</table>`);
  parts.push(`<table class="card-ticket-grid" aria-label="准考证号填涂区">`);
  parts.push(`<thead><tr><th colspan="${ticketCols}" style="height:auto;padding:2pt;background:#f5f5f5;font-weight:700">准考证号填涂区（先写数字，再对应涂黑）</th></tr><tr>${ticketHeaderCells}</tr></thead>`);
  parts.push(`<tbody>${ticketRows}</tbody>`);
  parts.push(`</table>`);
  parts.push(`</div>`);
  parts.push(`<div class="card-right-col">`);
  parts.push(`<div class="card-barcode-box"><div>条形码粘贴区</div><div style="font-size:7.5pt;font-weight:400;margin-top:3pt">(正面朝上，切勿贴出虚线框)</div></div>`);
  parts.push(`<div class="card-absent-box">缺考标记 [ ] &nbsp; 违纪 [ ]<br><span style="font-size:7pt;color:#555">（由监考老师填涂）</span></div>`);
  parts.push(`</div>`);
  parts.push(`</div>`);

  const objectiveQuestions = orderedQuestions.filter((q) => q.type === "single" || q.type === "multiple" || q.type === "judge");
  if (objectiveQuestions.length > 0) {
    parts.push(`<div class="paper-section-banner" style="margin-top:4pt"><div class="paper-section-title">一、客观选择题填涂区</div><div class="paper-section-notice">请使用 2B 铅笔将对应题号选定选项框涂黑，每 5 题为一组。</div></div>`);
    parts.push(`<div class="bubble-matrix">`);

    const groupSize = 5;
    for (let gi = 0; gi < objectiveQuestions.length; gi += groupSize) {
      const slice = objectiveQuestions.slice(gi, gi + groupSize);
      parts.push(`<div class="bubble-group-box">`);
      slice.forEach((q, sIdx) => {
        const qIndex = gi + sIdx + 1;
        const bubbles =
          q.type === "judge"
            ? `<span class="bubble-item">[T]</span><span class="bubble-item">[F]</span>`
            : Array.from(
                { length: Math.max(4, Math.min(8, q.options?.length || 4)) },
                (_, oi) => `<span class="bubble-item">[${String.fromCharCode(65 + oi)}]</span>`,
              ).join("");
        parts.push(`<div class="bubble-row"><span class="bubble-no">${qIndex}.</span>${bubbles}</div>`);
      });
      parts.push(`</div>`);
    }
    parts.push(`</div>`);
  }

  const subjectiveQuestions = orderedQuestions.filter((q) => q.type === "fill" || q.type === "short");
  if (subjectiveQuestions.length > 0) {
    parts.push(`<div class="paper-section-banner" style="margin-top:6pt"><div class="paper-section-title">二、非选择题作答区</div><div class="paper-section-notice">请用黑色签字笔在各题黑色矩形边框限定区域内作答，超出边框无效。</div></div>`);
    let subNo = objectiveQuestions.length;
    subjectiveQuestions.forEach((q) => {
      subNo++;
      const minHeight = q.type === "short"
        ? (options.shortAnswerSpaceCm ? `${Math.max(2, options.shortAnswerSpaceCm)}cm` : "38mm")
        : "18mm";
      parts.push(`<div class="card-subjective-box" style="min-height:${minHeight}">`);
      parts.push(`<div class="card-subjective-head"><span class="card-subjective-title">第 ${subNo} 题（${q.score || 1} 分 · ${q.type === "fill" ? "填空题" : "解答题"}）</span><span class="card-subjective-warn">请在黑色边框内作答，超出边框无效</span></div>`);
      if (q.type === "fill") {
        const blankCount = Math.max(1, (q.stem.match(/_{3,}|＿{3,}/g) || []).length || (q.answer.includes(";;") ? q.answer.split(";;").length : 1));
        const lines = Array.from({ length: blankCount }, (_, bi) => `<div style="margin:6pt 0;font-size:9pt">(${bi + 1}) ________________________________________________</div>`).join("");
        parts.push(lines);
      } else {
        parts.push(`<div class="answer-area-ruled" style="margin:0;border:none;min-height:calc(${minHeight} - 24pt)"></div>`);
      }
      parts.push(`</div>`);
    });
  }

  parts.push(`<div class="card-forbid-zone">请 勿 在 此 区 域 内 作 答 或 做 任 何 标 记</div>`);
  parts.push(renderFooter(options.footerNote || "小驴考试 · 标准填涂答题卡"), `</div>`, `</body></html>`);
  return parts.join("\n");
}

/**
 * 生成 A4 独立答案与采分册 HTML（客观题 5 题一组速查 + 主观题分步采分标准）。
 */
export function buildCompactAnswerSheetPro(
  title: string,
  questions: readonly Question[],
  options: PrintProOptions = {},
): string {
  const mainTitle = options.headerTitle || title;
  const autoGroup = options.autoGroupSections !== false;
  const orderedQuestions = autoGroup
    ? groupAndSortPaperQuestions(questions).flatMap((sec) => sec.questions)
    : [...questions];
  const nonMaterial = orderedQuestions.filter((q) => q.type !== "material");
  const totalScore = nonMaterial.reduce((sum, q) => sum + (q.score || 1), 0);

  const parts: string[] = [
    `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><title>${escapeHtml(mainTitle)} · 答案册</title><style>${buildPrintProCss(options)}</style></head><body>`,
    renderHeader(`${mainTitle} · 答案册`, `共 ${nonMaterial.length} 题（与题册同序）`, options.paperNo),
    `<div class="sheet-title-banner">`,
    `<h1 class="sheet-main-title">${escapeHtml(mainTitle)} · 参考答案与采分标准</h1>`,
    `<p class="sheet-sub-title">共 ${nonMaterial.length} 题 · 满分 ${totalScore} 分 · 按题册同序编排</p>`,
    `</div>`,
    `<section class="questions">`,
  ];

  // 一、客观题 5 题一组速查表
  const numberedItems = nonMaterial.map((q, idx) => ({ q, no: idx + 1 }));
  const objectiveItems = numberedItems.filter(
    ({ q }) => q.type === "single" || q.type === "multiple" || q.type === "judge",
  );
  if (objectiveItems.length > 0) {
    parts.push(`<div class="answer-quick-section">`);
    parts.push(`<div class="answer-quick-title">一、客观题极速核对表</div>`);
    parts.push(`<div class="answer-quick-grid">`);
    for (let i = 0; i < objectiveItems.length; i += 5) {
      const slice = objectiveItems.slice(i, i + 5);
      const ths = slice.map((item) => `<th>${item.no}</th>`).join("");
      const tds = slice
        .map((item) => `<td>${escapeHtml(formatDisplayAnswer(item.q.answer) || item.q.answer || "—")}</td>`)
        .join("");
      parts.push(`<table class="answer-quick-table"><thead><tr>${ths}</tr></thead><tbody><tr>${tds}</tr></tbody></table>`);
    }
    parts.push(`</div>`);
    parts.push(`</div>`);
  }

  parts.push(`<div class="paper-section-banner" style="margin-top:4pt"><div class="paper-section-title">二、逐题答案、分步采分点与简明解析</div></div>`);

  for (const { q, no } of numberedItems) {
    const rawAnswer = String(q.answer ?? "").trim();
    const displayAns =
      q.type === "single" || q.type === "multiple" || q.type === "judge"
        ? rawAnswer
        : formatDisplayAnswer(rawAnswer) || rawAnswer;

    parts.push(`<div class="q">`);
    parts.push(
      `<div class="q-head">${no}. <strong>${escapeHtml(displayAns)}</strong>` +
        `${q.score ? ` <span style="font-weight:400;color:#444;font-size:0.9em">（${q.score} 分）</span>` : ""}` +
        `${q.kp ? ` <span class="kp-tag">${escapeHtml(q.kp)}</span>` : ""}</div>`,
    );

    const rubricItems = extractRubricItems(q);
    if (q.type === "short" && rubricItems.length > 0) {
      const pctParts = rubricItems.map((item) => {
        if (item.weightPct !== undefined) return `${item.label}(${item.weightPct}%)`;
        if (item.points !== undefined) return `${item.label}(+${item.points}分)`;
        return item.label;
      });
      parts.push(`<div class="ans-analysis">采分点：${escapeHtml(pctParts.join(" · "))}</div>`);
      const stepLines = rubricItems
        .filter((item) => item.points !== undefined || item.desc)
        .map((item, ri) => {
          const ptsTag = item.points !== undefined ? ` +${item.points} 分` : "";
          const descPart = item.desc ? `：${item.desc}` : "";
          return `<div>（${ri + 1}）${escapeHtml(item.label)}${escapeHtml(ptsTag)}${escapeHtml(descPart)}</div>`;
        });
      if (stepLines.length > 0 && rubricItems.some((item) => item.points !== undefined)) {
        parts.push(`<div class="ans-analysis">${stepLines.join("")}</div>`);
      }
    }
    if (q.analysis) {
      parts.push(`<div class="ans-analysis">${renderMathInText(q.analysis)}</div>`);
    }
    parts.push(`</div>`);
  }

  parts.push(`</section>`, renderFooter(options.footerNote || "小驴考试 · 独立答案与采分册"), `</body></html>`);
  return parts.join("\n");
}

/**
 * 生成 A4 单栏/双栏【教师备课与授课讲义卷】HTML（教师教研核心）。
 * 特性：学术讲义抬头 + 题面与选项 + 参考答案 + 考点难度 + 采分点标准 + 教学点拨 + 思路拓展秒杀要诀。
 */
export function buildTeacherLectureSheetPro(
  title: string,
  questions: readonly Question[],
  options: PrintProOptions = {},
): string {
  const mainTitle = options.headerTitle || title;
  const lectureOptions: PrintProOptions = {
    columns: "single",
    fontSizeMode: options.fontSizeMode ?? "large",
    ...options,
  };
  const colLayout: ColumnLayout = lectureOptions.columns ?? "single";
  const autoGroup = options.autoGroupSections !== false;
  const sections = autoGroup ? groupAndSortPaperQuestions(questions) : null;
  const groupByKp = options.groupByKp === true;
  const nonMaterialCount = questions.filter((q) => q.type !== "material").length;

  const parts: string[] = [
    `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><title>${escapeHtml(mainTitle)} · 教师讲义教案卷</title><style>${buildPrintProCss(lectureOptions)}</style></head><body>`,
    renderHeader(`${mainTitle} · 教师授课讲义卷`, `共 ${nonMaterialCount} 题`, options.paperNo),
    `<div class="sheet-title-banner is-left">`,
    `<h1 class="sheet-main-title" style="font-size:18pt">${escapeHtml(mainTitle)} · 教师授课讲义卷</h1>`,
    `<p class="sheet-sub-title">${escapeHtml(options.subtitle || `教研讲义版 · 共 ${nonMaterialCount} 题 · 含参考答案、采分细则与课堂点拨`)}</p>`,
    `</div>`,
    `<section class="questions">`,
  ];

  const printedGroups = new Set<string>();
  let lastKp = "";
  let overallNo = 0;

  const renderLectureQuestion = (q: Question, no: number, showInlineType: boolean) => {
    if (groupByKp && q.kp && q.kp !== lastKp) {
      lastKp = q.kp;
      parts.push(`<div class="section-divider">考点专题：${escapeHtml(q.kp)}</div>`);
    }
    let materialHtml = "";
    if (q.group && !printedGroups.has(q.group)) {
      const carrier = questions.find((m) => m.group === q.group && m.type === "material" && Boolean(resolveMaterialText(m)));
      const carrierBody = resolveMaterialText(carrier);
      if (carrierBody) {
        materialHtml = `<div class="material-block q-group-head">${renderMathAndDiagramsInText(carrierBody)}</div>`;
        printedGroups.add(q.group);
      }
    }

    if (q.type === "material") {
      if (q.group) {
        if (materialHtml) parts.push(`<div class="q">${materialHtml}</div>`);
        return;
      }
      const selfBody = resolveMaterialText(q);
      if (selfBody) {
        parts.push(`<div class="q"><div class="material-block">${renderMathAndDiagramsInText(selfBody)}</div></div>`);
      }
      return;
    }

    parts.push(`<div class="q">`);
    if (materialHtml) parts.push(materialHtml);
    const typeInline = showInlineType ? `<span class="q-type-inline">[${escapeHtml(TYPE_NAMES[q.type] ?? q.type)}]</span>` : "";
    const scoreText = q.score ? `（${q.score} 分）` : "";
    const { html: stemHtml } = renderQuestionStemHtml(q, true);
    parts.push(
      `<div class="q-stem-line"><span class="q-no">${no}.</span>${typeInline}${scoreText ? `<span class="q-score-inline">${scoreText}</span>` : ""}<span class="q-stem">${stemHtml}</span></div>`,
    );
    if (q.occlusion) {
      parts.push(`<div class="occlusion-wrap">${renderOcclusionSvg(q.occlusion, { printMode: true })}</div>`);
    }
    if (q.options && q.options.length > 0) {
      const cols = computeOptionColumns(q.options, colLayout);
      parts.push(`<div class="opt-grid opt-grid-${cols}">`);
      q.options.forEach((o, oi) => {
        parts.push(`<div class="opt opt-item">${String.fromCharCode(65 + oi)}. ${renderMathInText(o)}</div>`);
      });
      parts.push(`</div>`);
    }

    // 教师备课分层解析卡
    const ansDisplay =
      q.type === "single" || q.type === "multiple" || q.type === "judge"
        ? q.answer
        : formatDisplayAnswer(q.answer) || q.answer;
    parts.push(`<div class="teacher-box">`);
    parts.push(`<div>【<span class="teacher-ans">参考答案</span>】：<strong>${escapeHtml(ansDisplay)}</strong></div>`);
    const metaParts: string[] = [];
    if (q.kp) metaParts.push(`考点归属：${escapeHtml(q.kp)}`);
    if (q.difficulty) metaParts.push(`难度：${"★".repeat(Math.min(5, Math.max(1, q.difficulty)))}${"☆".repeat(Math.max(0, 5 - Math.min(5, q.difficulty)))}`);
    if (metaParts.length) parts.push(`<div class="teacher-meta">${metaParts.join(" · ")}</div>`);

    const rubricItems = extractRubricItems(q);
    if (q.type === "short" && rubricItems.length > 0) {
      const rubricText = rubricItems
        .map((item) => {
          const ptsTag = item.points !== undefined ? `+${item.points}分` : item.weightPct !== undefined ? `${item.weightPct}%` : "";
          return ptsTag ? `${item.label}(${ptsTag})` : item.label;
        })
        .join("；");
      parts.push(`<div class="teacher-rubric"><strong>采分点细则：</strong>${escapeHtml(rubricText)}</div>`);
    }

    if (q.analysis) {
      parts.push(`<div class="teacher-analysis"><strong>教学点拨与破题分析：</strong>${renderMathInText(q.analysis)}</div>`);
    }
    if (q.expansion) {
      parts.push(`<div class="teacher-expansion"><strong>讲评拓展与秒杀要诀：</strong>${renderMathInText(q.expansion)}</div>`);
    }
    parts.push(`</div>`);
    parts.push(`</div>`);
  };

  if (sections && sections.length > 0) {
    for (const sec of sections) {
      parts.push(`<div class="paper-section-banner">`);
      parts.push(`<div class="paper-section-title">${escapeHtml(sec.sectionTitle)}</div>`);
      parts.push(`</div>`);
      for (const sq of sec.questions) {
        overallNo++;
        renderLectureQuestion(sq, overallNo, false);
      }
    }
  } else {
    questions.forEach((q, i) => {
      overallNo = i + 1;
      renderLectureQuestion(q, overallNo, true);
    });
  }

  parts.push(`</section>`, renderFooter(options.footerNote || "小驴考试 · 教师备课授课讲义"), `</body></html>`);
  return parts.join("\n");
}

/**
 * 生成 A4 单栏/双栏【学生课后分层作业单】HTML（轻量清爽作业纸）。
 * 特性：简洁抬头 + 单行学生信息条 + 宽松手写/演算留白 + 页尾自评与错因勾选栏。
 */
export function buildStudentHomeworkSheetPro(
  title: string,
  questions: readonly Question[],
  options: PrintProOptions = {},
): string {
  const mainTitle = options.headerTitle || title;
  const hwOptions: PrintProOptions = {
    columns: "single",
    fontSizeMode: options.fontSizeMode ?? "large",
    ...options,
  };
  const colLayout: ColumnLayout = hwOptions.columns ?? "single";
  const autoGroup = options.autoGroupSections !== false;
  const sections = autoGroup ? groupAndSortPaperQuestions(questions) : null;
  const groupByKp = options.groupByKp === true;
  const nonMaterialCount = questions.filter((q) => q.type !== "material").length;

  const parts: string[] = [
    `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><title>${escapeHtml(mainTitle)} · 课后作业导学单</title><style>${buildPrintProCss(hwOptions)}</style></head><body>`,
    renderHeader(`${mainTitle} · 课后作业导学单`, `共 ${nonMaterialCount} 题`, options.paperNo),
    `<div class="sheet-title-banner">`,
    `<h1 class="sheet-main-title" style="font-size:17.5pt">${escapeHtml(mainTitle)} · 课后分层作业单</h1>`,
    options.subtitle ? `<p class="sheet-sub-title">${escapeHtml(options.subtitle)}</p>` : "",
    `</div>`,
    `<div class="homework-student-bar"><span>班级：___________</span><span>姓名：___________</span><span>日期：___________</span><span>用时：_____ 分钟</span><span>完成度：_____</span></div>`,
    `<section class="questions">`,
  ];

  const printedGroups = new Set<string>();
  let lastKp = "";
  let overallNo = 0;

  const renderHomeworkQuestion = (q: Question, no: number) => {
    if (groupByKp && q.kp && q.kp !== lastKp) {
      lastKp = q.kp;
      parts.push(`<div class="section-divider">练习考点：${escapeHtml(q.kp)}</div>`);
    }
    let materialHtml = "";
    if (q.group && !printedGroups.has(q.group)) {
      const carrier = questions.find((m) => m.group === q.group && m.type === "material" && Boolean(resolveMaterialText(m)));
      const carrierBody = resolveMaterialText(carrier);
      if (carrierBody) {
        materialHtml = `<div class="material-block q-group-head">${renderMathAndDiagramsInText(carrierBody)}</div>`;
        printedGroups.add(q.group);
      }
    }

    if (q.type === "material") {
      if (q.group) {
        if (materialHtml) parts.push(`<div class="q">${materialHtml}</div>`);
        return;
      }
      const selfBody = resolveMaterialText(q);
      if (selfBody) {
        parts.push(`<div class="q"><div class="material-block">${renderMathAndDiagramsInText(selfBody)}</div></div>`);
      }
      return;
    }

    parts.push(`<div class="q" style="margin-bottom:13pt">`);
    if (materialHtml) parts.push(materialHtml);
    const { html: stemHtml, hasInlineBlank } = renderQuestionStemHtml(q, true);
    parts.push(
      `<div class="q-stem-line"><span class="q-no">${no}.</span><span class="q-stem">${stemHtml}</span></div>`,
    );
    if (q.occlusion) {
      parts.push(`<div class="occlusion-wrap">${renderOcclusionSvg(q.occlusion, { printMode: true })}</div>`);
    }
    if (q.options && q.options.length > 0) {
      const cols = computeOptionColumns(q.options, colLayout);
      parts.push(`<div class="opt-grid opt-grid-${cols}">`);
      q.options.forEach((o, oi) => {
        parts.push(`<div class="opt opt-item">${String.fromCharCode(65 + oi)}. ${renderMathInText(o)}</div>`);
      });
      parts.push(`</div>`);
    }
    if (q.type === "short") {
      const cm = options.shortAnswerSpaceCm && options.shortAnswerSpaceCm > 0
        ? Math.max(1.5, Math.min(30, options.shortAnswerSpaceCm))
        : 3.6;
      parts.push(`<div class="answer-area-ruled" style="min-height:${cm}cm"></div>`);
    } else if (q.type === "fill" && !hasInlineBlank) {
      parts.push(`<div class="answer-area" style="margin-top:6pt"></div>`);
    }
    parts.push(`</div>`);
  };

  if (sections && sections.length > 0) {
    for (const sec of sections) {
      parts.push(`<div class="paper-section-banner">`);
      parts.push(`<div class="paper-section-title">${escapeHtml(sec.sectionTitle)}</div>`);
      parts.push(`</div>`);
      for (const sq of sec.questions) {
        overallNo++;
        renderHomeworkQuestion(sq, overallNo);
      }
    }
  } else {
    questions.forEach((q, i) => {
      overallNo = i + 1;
      renderHomeworkQuestion(q, overallNo);
    });
  }

  parts.push(
    `</section>`,
    `<div class="homework-reflection-box">`,
    `<div><strong>【学生自我诊断与订正栏】</strong> 本次练习掌握感：[ ] 熟练掌握 · [ ] 稍有困难 · [ ] 需请教老师 &nbsp;|&nbsp; 错因归类：[ ] 审题不清 · [ ] 概念模糊 · [ ] 计算失误</div>`,
    `<div style="margin-top:6pt;border-top:0.5pt dashed #999;padding-top:5pt;color:#333">错因记录与疑问：__________________________________________________________________________</div>`,
    `</div>`,
    renderFooter(options.footerNote || "小驴考试 · 课后分层作业导学单"),
    `</body></html>`,
  );
  return parts.join("\n");
}

/**
 * 生成 A4 双栏【错题纯净重测卷】HTML（学生二次复习与家长/教师错题清零专用）。
 * 特性：学生信息与错题清零目标条 + 题干与选项（绝无答案与解析）+ 答题留白区 + 二次订正反思与错因核查栏。
 */
export function buildWrongbookRetestSheetPro(
  title: string,
  questions: readonly Question[],
  options: PrintProOptions = {},
): string {
  const mainTitle = options.headerTitle || title;
  const parts: string[] = [
    `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><title>${escapeHtml(mainTitle)} · 错题清零重测卷</title><style>${buildPrintProCss(options)}</style></head><body>`,
    renderHeader(`${mainTitle} · 错题清零重测卷`, `共 ${questions.length} 道错题待攻坚`, options.paperNo),
    `<div class="sheet-title-banner">`,
    `<h1 class="sheet-main-title" style="font-size:17pt">${escapeHtml(mainTitle)} · 错题清零重测卷</h1>`,
    `</div>`,
    `<div class="homework-student-bar"><span>姓名：___________</span><span>班级：___________</span><span>日期：___________</span><span>原错题数：${questions.length}</span><span>本次目标：错题清零</span></div>`,
    `<section class="questions">`,
  ];

  const printedGroups = new Set<string>();
  const groupByKp = options.groupByKp === true;
  const colLayout: ColumnLayout = options.columns ?? "double";
  let lastKp = "";

  questions.forEach((q, i) => {
    const no = i + 1;
    if (groupByKp && q.kp && q.kp !== lastKp) {
      lastKp = q.kp;
      parts.push(`<div class="section-divider">攻坚考点：${escapeHtml(q.kp)}</div>`);
    }
    let materialHtml = "";
    if (q.group && !printedGroups.has(q.group)) {
      const carrier = questions.find((m) => m.group === q.group && m.type === "material" && Boolean(resolveMaterialText(m)));
      const carrierBody = resolveMaterialText(carrier);
      if (carrierBody) {
        materialHtml = `<div class="material-block q-group-head">${renderMathAndDiagramsInText(carrierBody)}</div>`;
        printedGroups.add(q.group);
      }
    }

    if (q.type === "material") {
      if (q.group) {
        if (materialHtml) parts.push(`<div class="q">${materialHtml}</div>`);
        return;
      }
      const selfBody = resolveMaterialText(q);
      if (selfBody) {
        parts.push(`<div class="q"><div class="material-block">${renderMathAndDiagramsInText(selfBody)}</div></div>`);
      }
      return;
    }

    parts.push(`<div class="q">`);
    if (materialHtml) parts.push(materialHtml);
    const { html: stemHtml, hasInlineBlank } = renderQuestionStemHtml(q, true);
    parts.push(`<div class="q-stem-line"><span class="q-no">${no}.</span><span class="q-type-inline">[错题重练 · ${escapeHtml(TYPE_NAMES[q.type] ?? q.type)}]</span><span class="q-stem">${stemHtml}</span></div>`);
    if (q.occlusion) {
      parts.push(`<div class="occlusion-wrap">${renderOcclusionSvg(q.occlusion, { printMode: true })}</div>`);
    }

    if (q.type === "single" || q.type === "multiple") {
      const letters = "ABCDEFGHIJ";
      if (q.options && q.options.length > 0) {
        const cols = computeOptionColumns(q.options, colLayout);
        parts.push(`<div class="opt-grid opt-grid-${cols}">`);
        q.options.forEach((opt, oi) => {
          parts.push(`<div class="opt opt-item">${letters[oi]}. ${renderMathInText(opt)}</div>`);
        });
        parts.push(`</div>`);
      }
      parts.push(`<div class="answer-area" style="height:1.8em;margin-top:3pt">作答：______</div>`);
    } else if (q.type === "judge") {
      parts.push(`<div class="opt" style="margin-top:3pt">作答判断：[ ] 正确 (T)  /  [ ] 错误 (F)</div>`);
    } else {
      const defaultHeight = q.type === "short" ? "28mm" : "9mm";
      const heightStyle = q.type === "short" && options.shortAnswerSpaceCm && options.shortAnswerSpaceCm > 0
        ? `${Math.max(0.5, Math.min(30, options.shortAnswerSpaceCm))}cm`
        : defaultHeight;
      if (q.type === "short" || !hasInlineBlank) {
        parts.push(`<div class="answer-area-ruled" style="min-height:${heightStyle}"></div>`);
      }
    }
    parts.push(`</div>`);
  });

  parts.push(
    `</section>`,
    `<div class="homework-reflection-box">`,
    `<div><strong>【错题清零自我归因与二次反思】</strong> 本次订正情况：[ ] 彻底弄懂 [ ] 仍有疑问 · 错因反思：[ ] 粗心失误 [ ] 概念盲区 [ ] 审题陷阱</div>`,
    `<div style="margin-top:4pt;border-top:0.5pt dashed #999;padding-top:4pt;color:#444">核心考点领悟与关键步骤：__________________________________________________________________________</div>`,
    `</div>`,
    renderFooter(options.footerNote || "小驴考试 · 错题清零纯净重测卷"),
    `</body></html>`,
  );
  return parts.join("\n");
}

export interface PrintSafetyReport {
  safe: boolean;
  violations: string[];
}

/** 安全审计：确认学生作答卷中绝不包含答案与解析（79-02 验收） */
export function auditQuestionSheetSafety(
  html: string,
  questions: readonly Question[],
): PrintSafetyReport {
  const violations: string[] = [];
  for (const q of questions) {
    if (q.type === "material") continue;
    // 答案文本（长度 ≥2 且非选项字母单字符）不应出现
    const answer = (q.answer ?? "").trim();
    if (answer.length >= 2 && html.includes(escapeHtml(answer))) {
      violations.push(`题 ${q.id} 的标准答案出现在作答卷中`);
    }
    if (q.analysis && q.analysis.trim().length >= 8 && q.group == null && q.type !== "short") {
      if (html.includes(escapeHtml(q.analysis.trim().slice(0, 20)))) {
        violations.push(`题 ${q.id} 的解析内容出现在作答卷中`);
      }
    }
  }
  return { safe: violations.length === 0, violations };
}

/**
 * 生成「离线交互式讲题与自测卷」HTML（参考数理交互题库平台与双轨制排版规范）
 * 支持：
 * 1. 📖 讲评模式与 ✍️ 离线自测模式双轨一键切换；
 * 2. 交互作答、即时批改、得分率计算与错误智能标红；
 * 3. 逐题揭晓标准答案、采分点细则与深度解析；
 * 4. 内嵌 LaTeX 公式与数理 SVG 矢量图渲染；
 * 5. 纯本地独立运行，无任何外网依赖，双击即开，兼容移动端与浏览器。
 */
export function buildInteractiveReviewSheetPro(
  title: string,
  questions: readonly Question[],
  options: PrintProOptions = {},
): string {
  const displayTitle = options.headerTitle || title;
  const nonMaterialQuestions = questions.filter((q) => q.type !== "material");
  const totalScore = nonMaterialQuestions.reduce((sum, q) => sum + (q.score || 1), 0);

  const questionsHtml: string[] = [];
  let no = 0;

  questions.forEach((q, idx) => {
    if (q.type === "material") {
      const matBody = resolveMaterialText(q);
      if (matBody) {
        questionsHtml.push(`
          <div class="material-block" style="margin-bottom:14px;padding:12px 16px;background:var(--card-bg);border:1px solid var(--border);border-left:4px solid var(--brand);border-radius:var(--radius)">
            <div style="font-size:12px;font-weight:700;color:var(--brand);margin-bottom:6px">📄 阅读材料</div>
            <div class="material-body">${renderMathAndDiagramsInText(matBody)}</div>
          </div>
        `);
      }
      return;
    }

    no++;
    const qid = q.id || `q_${idx + 1}`;
    const safeQid = escapeHtml(qid);
    const score = q.score || 1;
    const typeName = TYPE_NAMES[q.type] || q.type;

    let optionsMarkup = "";
    if (q.options && q.options.length > 0) {
      const isMulti = q.type === "multiple";
      const inputType = isMulti ? "checkbox" : "radio";
      const useTwoCol = computeOptionColumns(q.options, "single") >= 2;
      const opts = q.options.map((opt, oi) => {
        const letter = OPTION_LETTERS[oi] ?? String.fromCharCode(65 + oi);
        return `<label class="interactive-opt">
          <input type="${inputType}" name="ans_${safeQid}" value="${letter}" class="opt-input">
          <span class="opt-letter">${letter}.</span>
          <span class="opt-text">${renderMathInText(opt)}</span>
        </label>`;
      }).join("\n");
      optionsMarkup = `<div class="interactive-opts-group${useTwoCol ? " is-2col" : ""}">${opts}</div>`;
    } else if (q.type === "judge") {
      optionsMarkup = `<div class="interactive-opts-group is-2col">
        <label class="interactive-opt">
          <input type="radio" name="ans_${safeQid}" value="对" class="opt-input">
          <span class="opt-letter">√</span>
          <span class="opt-text">正确 (True)</span>
        </label>
        <label class="interactive-opt">
          <input type="radio" name="ans_${safeQid}" value="错" class="opt-input">
          <span class="opt-letter">×</span>
          <span class="opt-text">错误 (False)</span>
        </label>
      </div>`;
    } else if (q.type === "fill") {
      optionsMarkup = `<div class="interactive-input-wrap">
        <input type="text" name="ans_${safeQid}" class="interactive-text-input" placeholder="输入填空答案（多空请用半角 ;; 分隔）…">
      </div>`;
    } else if (q.type === "short") {
      optionsMarkup = `<div class="interactive-input-wrap">
        <textarea name="ans_${safeQid}" class="interactive-textarea" rows="3" placeholder="写下你的简答核心要点…"></textarea>
      </div>`;
    }

    // 采分点标准呈现
    let rubricHtml = "";
    const rubricItems = extractRubricItems(q);
    if (rubricItems.length > 0) {
      rubricHtml = `<div class="rubric-box">
        <div class="rubric-title">🎯 官方采分点细则标准：</div>
        <ul class="rubric-list">
          ${rubricItems.map((item) => {
            const pts = item.points ?? (item.weightPct !== undefined ? `${item.weightPct}%` : 1);
            const ptsStr = typeof pts === "number" ? `${pts}分` : pts;
            return `<li><b>${escapeHtml(item.label)}</b>（${escapeHtml(ptsStr)}）${item.desc ? `：${escapeHtml(item.desc)}` : ""}</li>`;
          }).join("")}
        </ul>
      </div>`;
    }

    const formattedAnswer = formatDisplayAnswer(q.answer);

    questionsHtml.push(`
      <article class="q-card" data-qid="${escapeHtml(qid)}" data-type="${escapeHtml(q.type)}" data-answer="${escapeHtml(q.answer || "")}" data-score="${score}">
        <div class="q-card-head">
          <span class="q-type-badge">${escapeHtml(typeName)}</span>
          <span class="q-no">第 ${no} 题</span>
          <span class="q-score-badge">${score} 分</span>
          ${q.kp ? `<span class="q-kp-badge">${escapeHtml(q.kp)}</span>` : ""}
          <span class="q-verdict-badge" style="display:none"></span>
        </div>
        <div class="q-card-stem">
          ${renderMathAndDiagramsInText(q.stem)}
        </div>
        ${q.occlusion ? `<div class="q-card-occlusion">${renderOcclusionSvg(q.occlusion, { printMode: true })}</div>` : ""}
        ${optionsMarkup}
        ${(q.type === 'short' || q.type === 'fill') ? `
          <div class="test-answer-space" style="height:${q.type === 'short' ? '120px' : '50px'}">
            <span style="font-size:11px;color:#64748b;padding:4px 8px;display:block">✍️ 作答书写留白区（${q.type === 'short' ? '解答题' : '填空题'}）</span>
          </div>
        ` : ''}
        <div class="q-analysis-section">
          <button type="button" class="btn-toggle-answer" onclick="toggleAnswer(this)">
            💡 揭晓答案与深度解析
          </button>
          <div class="q-answer-details" style="display:none">
            <div class="standard-answer">
              <span class="ans-label">参考标准答案：</span>
              <span class="ans-val">${escapeHtml(formattedAnswer || "（主观作答题，见解析）")}</span>
            </div>
            ${q.analysis ? `<div class="analysis-body"><b>【深度解析】</b> ${renderMathAndDiagramsInText(q.analysis)}</div>` : ""}
            ${q.expansion ? `<div class="expansion-body" style="margin-top:8px;padding:8px 12px;background:#fffbeb;border-left:3px solid #f59e0b;border-radius:6px;color:#78350f;font-size:13px;line-height:1.6"><b style="color:#b45309">【💡 思路拓展与秒杀技巧】</b> ${renderMathAndDiagramsInText(q.expansion)}</div>` : ""}
            ${rubricHtml}
          </div>
        </div>
      </article>
    `);
  });

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(displayTitle)} · 交互式讲题自测卷</title>
  <style>
    :root {
      --bg: #f8fafc;
      --card-bg: #ffffff;
      --text: #1e293b;
      --text-muted: #64748b;
      --brand: #1e3a8a;
      --brand-soft: rgba(30, 58, 138, 0.08);
      --accent: #b91c1c;
      --green: #10b981;
      --green-soft: rgba(16, 185, 129, 0.1);
      --red: #ef4444;
      --red-soft: rgba(239, 68, 68, 0.1);
      --border: #e2e8f0;
      --border-focus: #3b82f6;
      --radius: 12px;
      --shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      line-height: 1.6;
      padding: 24px 16px 80px;
    }
    .wrapper { max-width: 860px; margin: 0 auto; }
    header.header-bar {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 20px 24px;
      box-shadow: var(--shadow);
      margin-bottom: 20px;
    }
    .header-title-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 12px;
      margin-bottom: 12px;
    }
    .header-title {
      font-size: 20px;
      font-weight: 700;
      color: var(--brand);
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .header-meta {
      font-size: 13px;
      color: var(--text-muted);
      display: flex;
      gap: 8px;
      align-items: center;
      flex-wrap: wrap;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      padding: 2px 8px;
      border-radius: 9999px;
      font-size: 12px;
      font-weight: 600;
      background: var(--brand-soft);
      color: var(--brand);
    }
    .toolbar-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 10px;
      padding-top: 14px;
      border-top: 1px solid var(--border);
    }
    .mode-switch {
      display: inline-flex;
      background: var(--bg);
      padding: 3px;
      border-radius: 8px;
      border: 1px solid var(--border);
    }
    .mode-btn {
      border: 0;
      background: transparent;
      padding: 6px 14px;
      font-size: 13px;
      font-weight: 600;
      border-radius: 6px;
      cursor: pointer;
      color: var(--text-muted);
      transition: transform 0.15s ease, background 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease, color 0.15s ease, opacity 0.15s ease;
    }
    .mode-btn.active {
      background: var(--brand);
      color: #fff;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }
    .actions-group { display: flex; gap: 8px; align-items: center; }
    .btn {
      border: 1px solid var(--border);
      background: #fff;
      color: var(--text);
      padding: 6px 14px;
      font-size: 13px;
      font-weight: 500;
      border-radius: 6px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      transition: background 0.15s ease;
    }
    .btn:hover { background: var(--bg); }
    .btn-primary {
      background: var(--brand);
      color: #fff;
      border-color: var(--brand);
    }
    .btn-primary:hover { background: #172554; }
    .scoreboard-banner {
      background: linear-gradient(135deg, #1e3a8a 0%, #1e40af 100%);
      color: #fff;
      border-radius: var(--radius);
      padding: 16px 20px;
      margin-bottom: 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      box-shadow: 0 4px 12px rgba(30, 58, 138, 0.2);
    }
    .score-num { font-size: 28px; font-weight: 800; }
    .score-detail { font-size: 13px; opacity: 0.9; }

    .q-card {
      background: var(--card-bg);
      border: 1.5px solid var(--border);
      border-radius: var(--radius);
      padding: 18px 22px;
      margin-bottom: 16px;
      box-shadow: var(--shadow);
      transition: border-color 0.2s ease, box-shadow 0.2s ease;
    }
    .q-card.is-correct {
      border-color: var(--green);
      background: color-mix(in srgb, var(--green-soft) 25%, #fff);
    }
    .q-card.is-wrong {
      border-color: var(--red);
      background: color-mix(in srgb, var(--red-soft) 20%, #fff);
    }
    .q-card-head {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 10px;
      flex-wrap: wrap;
    }
    .q-type-badge {
      background: var(--brand);
      color: #fff;
      font-size: 11px;
      font-weight: 700;
      padding: 2px 7px;
      border-radius: 4px;
    }
    .q-no { font-size: 14px; font-weight: 700; color: var(--text); }
    .q-score-badge { font-size: 11px; color: var(--text-muted); }
    .q-kp-badge {
      font-size: 11px;
      background: var(--bg);
      border: 1px solid var(--border);
      padding: 1px 6px;
      border-radius: 4px;
      color: var(--text-muted);
    }
    .q-verdict-badge {
      margin-left: auto;
      font-size: 12px;
      font-weight: 700;
      padding: 2px 8px;
      border-radius: 9999px;
    }
    .q-card.is-correct .q-verdict-badge {
      display: inline-block !important;
      background: var(--green-soft);
      color: #065f46;
    }
    .q-card.is-wrong .q-verdict-badge {
      display: inline-block !important;
      background: var(--red-soft);
      color: #991b1b;
    }
    .q-card-stem {
      font-size: 15.5px;
      font-weight: 500;
      line-height: 1.72;
      margin-bottom: 14px;
      color: var(--text);
    }
    .interactive-opts-group {
      display: grid;
      grid-template-columns: 1fr;
      gap: 8px;
      margin-bottom: 14px;
    }
    .interactive-opts-group.is-2col {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    @media (max-width: 640px) {
      .interactive-opts-group.is-2col {
        grid-template-columns: 1fr;
      }
    }
    .interactive-opt {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 12px;
      border: 1px solid var(--border);
      border-radius: 8px;
      cursor: pointer;
      background: #fff;
      transition: background 0.15s ease, border-color 0.15s ease;
    }
    .interactive-opt:hover { background: var(--bg); border-color: var(--brand); }
    .interactive-opt input[type="radio"],
    .interactive-opt input[type="checkbox"] {
      width: 16px;
      height: 16px;
      accent-color: var(--brand);
      cursor: pointer;
    }
    .opt-letter { font-weight: 700; color: var(--brand); min-width: 16px; }
    .opt-text { flex: 1; font-size: 14px; }
    .interactive-text-input,
    .interactive-textarea {
      width: 100%;
      padding: 8px 12px;
      font-size: 14px;
      border: 1px solid var(--border);
      border-radius: 8px;
      outline: none;
      font-family: inherit;
    }
    .interactive-text-input:focus,
    .interactive-textarea:focus {
      border-color: var(--border-focus);
      box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);
    }

    .q-analysis-section { margin-top: 14px; padding-top: 12px; border-top: 1px dashed var(--border); }
    .btn-toggle-answer {
      border: 0;
      background: var(--brand-soft);
      color: var(--brand);
      padding: 5px 12px;
      font-size: 12px;
      font-weight: 600;
      border-radius: 6px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }
    .btn-toggle-answer:hover { opacity: 0.85; }
    .q-answer-details {
      margin-top: 10px;
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 12px 14px;
      font-size: 13.5px;
    }
    .standard-answer { margin-bottom: 6px; font-weight: 600; color: var(--brand); }
    .ans-val { color: var(--accent); }
    .analysis-body { margin-top: 6px; color: var(--text); }
    .expansion-body { margin-top: 8px; padding: 8px 12px; background: #fffbeb; border-left: 3px solid #f59e0b; border-radius: 6px; color: #78350f; font-size: 13px; line-height: 1.6; }
    .test-answer-space { display: none; margin-top: 10px; border: 1px dashed #94a3b8; border-radius: 6px; background: #f8fafc; page-break-inside: avoid; break-inside: avoid; }
    .rubric-box {
      margin-top: 8px;
      background: #fff;
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 8px 10px;
      font-size: 12px;
    }
    .rubric-title { font-weight: 700; margin-bottom: 4px; color: #475569; }
    .rubric-list { padding-left: 18px; line-height: 1.6; }

    /* 讲评模式隐藏作答输入，自测模式默认折叠解析 */
    body.mode-lecture .interactive-opt input { display: none; }
    body.mode-lecture .interactive-text-input,
    body.mode-lecture .interactive-textarea { display: none; }
    body.mode-test .btn-toggle-answer { display: none; }
    body.mode-test .test-answer-space { display: block; }

    @media print {
      body { background: #fff; padding: 0; color: #111; font-family: "SimSun", "Songti SC", serif; }
      header.header-bar { border: 0; border-bottom: 1pt solid #111; border-radius: 0; box-shadow: none; padding: 0 0 8pt; margin-bottom: 10pt; }
      .header-title { color: #000; font-family: "SimHei", "Heiti SC", sans-serif; }
      .badge { background: #fff; color: #111; border: 0.5pt solid #666; }
      .toolbar-row, .btn-toggle-answer, .scoreboard-banner, .interactive-input-wrap, .opt-input { display: none !important; }
      .q-answer-details { display: block !important; background: #fff; border: 0.5pt solid #bbb; }
      .q-card { page-break-inside: avoid; break-inside: avoid; border: 0.75pt solid #999; border-radius: 2pt; box-shadow: none; margin-bottom: 10pt; }
      .q-type-badge { background: #fff; color: #111; border: 0.75pt solid #111; }
      .interactive-opt { border: none; padding: 2pt 4pt; }
      .opt-letter { color: #000; }
      .test-answer-space { display: block !important; background: #fff; border: 0.5pt dashed #888; }
      .expansion-body { page-break-inside: avoid; break-inside: avoid; background: #fff; border-left: 2pt solid #333; color: #222; }
    }
    ${getMathPrintStyles()}
  </style>
</head>
<body class="mode-lecture">
  <div class="wrapper">
    <header class="header-bar">
      <div class="header-title-row">
        <div>
          <h1 class="header-title">📖 ${escapeHtml(displayTitle)}</h1>
          ${options.subtitle ? `<div style="font-size:13px;color:var(--text-muted);margin-top:4px">${escapeHtml(options.subtitle)}</div>` : ""}
        </div>
        <div class="header-meta">
          <span class="badge">共 ${nonMaterialQuestions.length} 题</span>
          <span class="badge">总计 ${totalScore} 分</span>
          <span>生成日期：${new Date().toLocaleDateString("zh-CN")}</span>
        </div>
      </div>
      <div class="toolbar-row">
        <div class="mode-switch">
          <button type="button" class="mode-btn active" id="btn-mode-lecture" onclick="setMode('lecture')">
            📖 讲题讲评模式
          </button>
          <button type="button" class="mode-btn" id="btn-mode-test" onclick="setMode('test')">
            ✍️ 离线自测模式
          </button>
        </div>
        <div class="actions-group">
          <button type="button" class="btn" id="btn-expand-all" onclick="toggleAllAnswers(true)">
            全部展开答案
          </button>
          <button type="button" class="btn" id="btn-collapse-all" onclick="toggleAllAnswers(false)">
            全部收起
          </button>
          <button type="button" class="btn btn-primary" id="btn-submit-test" style="display:none" onclick="submitSelfTest()">
            ✅ 提交批改出分
          </button>
          <button type="button" class="btn" onclick="window.print()">
            🖨️ 打印试卷
          </button>
        </div>
      </div>
    </header>

    <div id="scoreboard" class="scoreboard-banner" style="display:none">
      <div>
        <div style="font-size:14px;font-weight:600">🎯 自测试卷得分报告</div>
        <div class="score-detail" id="score-breakdown">正在批改…</div>
      </div>
      <div class="score-num" id="score-total-val">0 分</div>
    </div>

    <main class="quiz-list">
      ${questionsHtml.join("\n")}
    </main>
  </div>

  <script>
    function setMode(mode) {
      if (mode === 'lecture') {
        document.body.classList.remove('mode-test');
        document.body.classList.add('mode-lecture');
        document.getElementById('btn-mode-lecture').classList.add('active');
        document.getElementById('btn-mode-test').classList.remove('active');
        document.getElementById('btn-expand-all').style.display = '';
        document.getElementById('btn-collapse-all').style.display = '';
        document.getElementById('btn-submit-test').style.display = 'none';
      } else {
        document.body.classList.remove('mode-lecture');
        document.body.classList.add('mode-test');
        document.getElementById('btn-mode-test').classList.add('active');
        document.getElementById('btn-mode-lecture').classList.remove('active');
        document.getElementById('btn-expand-all').style.display = 'none';
        document.getElementById('btn-collapse-all').style.display = 'none';
        document.getElementById('btn-submit-test').style.display = '';
        toggleAllAnswers(false);
      }
    }

    function toggleAnswer(btn) {
      const details = btn.nextElementSibling;
      if (!details) return;
      if (details.style.display === 'none') {
        details.style.display = 'block';
        btn.textContent = '🙈 收起答案与解析';
      } else {
        details.style.display = 'none';
        btn.textContent = '💡 揭晓答案与深度解析';
      }
    }

    function toggleAllAnswers(expand) {
      document.querySelectorAll('.q-card').forEach(function(card) {
        const btn = card.querySelector('.btn-toggle-answer');
        const details = card.querySelector('.q-answer-details');
        if (!details) return;
        if (expand) {
          details.style.display = 'block';
          if (btn) btn.textContent = '🙈 收起答案与解析';
        } else {
          details.style.display = 'none';
          if (btn) btn.textContent = '💡 揭晓答案与深度解析';
        }
      });
    }

    function submitSelfTest() {
      let earnedScore = 0;
      let totalScore = 0;
      let correctCount = 0;
      let wrongCount = 0;
      const cards = document.querySelectorAll('.q-card');

      cards.forEach(function(card) {
        const qtype = card.getAttribute('data-type');
        if (qtype === 'material') return;
        const rawAns = (card.getAttribute('data-answer') || '').trim();
        const score = parseFloat(card.getAttribute('data-score')) || 1;
        totalScore += score;

        let myAns = '';
        if (qtype === 'single' || qtype === 'judge') {
          const sel = card.querySelector('input[type="radio"]:checked');
          if (sel) myAns = sel.value.trim();
        } else if (qtype === 'multiple') {
          const checked = card.querySelectorAll('input[type="checkbox"]:checked');
          const arr = [];
          checked.forEach(function(c) { arr.push(c.value.trim()); });
          arr.sort();
          myAns = arr.join('');
        } else if (qtype === 'fill') {
          const inp = card.querySelector('.interactive-text-input');
          if (inp) myAns = inp.value.trim();
        } else if (qtype === 'short') {
          const ta = card.querySelector('.interactive-textarea');
          if (ta) myAns = ta.value.trim();
        }

        let isCorrect = false;
        if (qtype === 'single' || qtype === 'multiple') {
          isCorrect = myAns.toUpperCase() === rawAns.toUpperCase() && myAns !== '';
        } else if (qtype === 'judge') {
          const normRaw = /对|T|√|TRUE|是/i.test(rawAns) ? '对' : '错';
          isCorrect = myAns === normRaw;
        } else if (qtype === 'fill') {
          isCorrect = myAns.toLowerCase() === rawAns.toLowerCase() && myAns !== '';
        } else {
          // 主观题有作答即给基础分，由采分点自查
          isCorrect = myAns.length >= 3;
        }

        const verdict = card.querySelector('.q-verdict-badge');
        card.classList.remove('is-correct', 'is-wrong');

        if (isCorrect) {
          earnedScore += score;
          correctCount++;
          card.classList.add('is-correct');
          if (verdict) { verdict.textContent = '✓ 正确 +' + score + '分'; verdict.style.display = 'inline-block'; }
        } else {
          wrongCount++;
          card.classList.add('is-wrong');
          if (verdict) { verdict.textContent = '× 答错 0分'; verdict.style.display = 'inline-block'; }
          // 错题自动展开解析
          const details = card.querySelector('.q-answer-details');
          if (details) details.style.display = 'block';
        }
      });

      const pct = totalScore > 0 ? Math.round((earnedScore / totalScore) * 100) : 0;
      const banner = document.getElementById('scoreboard');
      banner.style.display = 'flex';
      document.getElementById('score-total-val').textContent = earnedScore + ' / ' + totalScore + ' 分';
      document.getElementById('score-breakdown').textContent = '正确率 ' + pct + '% · 做对 ' + correctCount + ' 题，答错 ' + wrongCount + ' 题';
      banner.scrollIntoView({ behavior: (typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches) ? "auto" : "smooth" });
    }
  </script>
</body>
</html>`;
}

/**
 * 试卷 A/B 卷变式打乱生成器（防作弊）
 * 根据 variantKind ('A' 或 'B')，使用确定性伪随机对单选/多选选项与顺序洗牌，并严谨重映射答案字母
 */
export function generatePaperVariant(
  questions: readonly Question[],
  variantKind: "A" | "B",
): Question[] {
  const letters = [...OPTION_LETTERS];
  const seedNum = variantKind === "A" ? 1337 : 4242;

  let seed = seedNum;
  const nextRandom = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };

  return questions.map((orig) => {
    if ((orig.type === "single" || orig.type === "multiple") && orig.options && orig.options.length >= 2) {
      const optsWithIdx = orig.options.map((opt, i) => ({ opt, originalIndex: i }));
      for (let i = optsWithIdx.length - 1; i > 0; i--) {
        const j = Math.floor(nextRandom() * (i + 1));
        const temp = optsWithIdx[i];
        optsWithIdx[i] = optsWithIdx[j];
        optsWithIdx[j] = temp;
      }

      const newOptions = optsWithIdx.map((o) => o.opt);
      const cleanUpper = (orig.answer || "").toUpperCase();
      const origAnswerLetters = cleanUpper.includes(",") || cleanUpper.includes(" ") || cleanUpper.includes("、")
        ? cleanUpper.split(/[,，、\s]+/).map((l) => l.trim()).filter(Boolean)
        : cleanUpper.replace(/[^A-J]/g, "").split("");
      const origAnswerIndices = origAnswerLetters
        .map((l) => letters.indexOf(l))
        .filter((idx) => idx >= 0);

      const newAnswerIndices: number[] = [];
      optsWithIdx.forEach((item, newIdx) => {
        if (origAnswerIndices.includes(item.originalIndex)) {
          newAnswerIndices.push(newIdx);
        }
      });
      newAnswerIndices.sort((a, b) => a - b);
      const newAnswer = newAnswerIndices.map((idx) => letters[idx] || "A").join("");

      return {
        ...orig,
        id: `${orig.id}-${variantKind.toLowerCase()}`,
        options: newOptions,
        answer: newAnswer || orig.answer,
      };
    }

    return {
      ...orig,
      id: `${orig.id}-${variantKind.toLowerCase()}`,
    };
  });
}

export interface PaperPreflightReport {
  valid: boolean;
  totalScore: number;
  questionCount: number;
  typeDistribution: Array<{ type: string; label: string; count: number; score: number }>;
  warnings: string[];
  errors: string[];
}

/**
 * 印刷前排版与试题质量预检 (Print Pre-flight Lint)
 * 检查漏项、答案超界、0分值、选项不齐等高风险问题，防止打印成废卷
 */
export function auditPaperBeforePrint(
  questions: readonly Question[],
): PaperPreflightReport {
  const warnings: string[] = [];
  const errors: string[] = [];
  let totalScore = 0;
  const allLetters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
  const typeMap = new Map<string, { count: number; score: number }>();

  questions.forEach((q, idx) => {
    const no = idx + 1;
    const score = q.score || 0;
    totalScore += score;

    const cur = typeMap.get(q.type) || { count: 0, score: 0 };
    cur.count++;
    cur.score += score;
    typeMap.set(q.type, cur);

    if (q.type !== "material" && score === 0) {
      warnings.push(`第 ${no} 题分值为 0 分，请确认是否为不计分题。`);
    }

    if (!q.stem || !q.stem.trim()) {
      errors.push(`第 ${no} 题题干内容为空！`);
    }

    if (q.type === "single" || q.type === "multiple") {
      if (!q.options || q.options.length < 2) {
        errors.push(`第 ${no} 题 (${TYPE_NAMES[q.type]}) 选项少于 2 项！`);
      } else {
        const ans = (q.answer || "").toUpperCase().trim();
        if (!ans) {
          warnings.push(`第 ${no} 题未配置参考答案。`);
        } else {
          for (const ch of ans.split("")) {
            if (allLetters.includes(ch)) {
              const letterIdx = allLetters.indexOf(ch);
              if (letterIdx >= q.options.length) {
                errors.push(`第 ${no} 题答案 "${ch}" 超出选项范围 (该题仅 ${q.options.length} 个选项)！`);
              }
            }
          }
        }
      }
    }
  });

  const typeDistribution = Array.from(typeMap.entries()).map(([t, val]) => ({
    type: t,
    label: TYPE_NAMES[t] || t,
    count: val.count,
    score: val.score,
  }));

  return {
    valid: errors.length === 0,
    totalScore,
    questionCount: questions.length,
    typeDistribution,
    warnings,
    errors,
  };
}


