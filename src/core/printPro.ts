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
import { renderMathInText, getMathPrintStyles } from "./math";
import { renderMathDiagramsInText } from "./mathDiagram";
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

/**
 * 依据选项文本与公式长度自适应计算分栏数（exam-zh / MathBank 规范）：
 * - 4 选项：短选项一行4列；中等选项两行两列；长选项单列纵排
 * - 2 选项：短中选项一行2列；长选项单列
 * - 其他数量：默认单列
 */
export function computeOptionColumns(options: readonly string[]): 1 | 2 | 4 {
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
  if (options.length === 4) {
    // 4 个选项：如果每个都很短（<= 12 字符宽度，约 6 个汉字以内，如数字、字母、符号、极短词），单行 4 列
    if (maxWidth <= 12) return 4;
    // 如果适中（<= 40 字符宽度，约 20 个汉字以内），2 行 2 列
    if (maxWidth <= 40) return 2;
    return 1;
  }
  if (options.length === 2) {
    return maxWidth <= 40 ? 2 : 1;
  }
  return 1;
}

/** 渲染装订密封线 HTML (exam-zh sealline 规范) */
export function renderSealLineBar(): string {
  return `<div class="seal-line-bar">` +
    `<span class="seal-warning">★ 密封线内不要答题 ★</span>` +
    `<span>姓名：__________</span>` +
    `<span>准考证号：__________</span>` +
    `<span>考场号：__________</span>` +
    `<span>座位号：__________</span>` +
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
      const avgScore = Math.round((totalScore / matched.length) * 10) / 10;
      const notice = `本大题共 ${matched.length} 小题，每小题 ${avgScore} 分，共 ${totalScore} 分。${cfg.notice}`;
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

/** 生成分栏与打印优化 CSS */
export function buildPrintProCss(options: PrintProOptions = {}): string {
  const isDouble = (options.columns ?? "double") === "double";
  const size = options.paperSize === "Letter" ? "Letter" : "A4";

  let bodyFontSize = "10.5pt";
  let bodyLineHeight = "1.55";
  if (options.fontSizeMode === "compact") {
    bodyFontSize = "9.5pt";
    bodyLineHeight = "1.45";
  } else if (options.fontSizeMode === "large") {
    bodyFontSize = "12pt";
    bodyLineHeight = "1.65";
  }

  return `
    @page {
      size: ${size} portrait;
      margin: 12mm 10mm 14mm 10mm;
      @bottom-center { content: counter(page) " / " counter(pages); font-size: 9pt; color: #666; }
    }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    body {
      font-family: "Source Han Serif SC", "Noto Serif CJK SC", SimSun, serif;
      font-size: ${bodyFontSize}; line-height: ${bodyLineHeight}; color: #111;
      -webkit-print-color-adjust: exact; print-color-adjust: exact;
    }
    header.sheet-header {
      display: flex; justify-content: space-between; align-items: baseline;
      border-bottom: 1px solid #999; padding-bottom: 3px; margin-bottom: 8px;
      font-size: 9pt; color: #444;
    }
    .secret-stamp-wrap {
      margin-bottom: 4pt;
      overflow: hidden;
      page-break-after: avoid;
      break-after: avoid;
    }
    .secret-stamp {
      float: left;
      font-size: 8.5pt;
      font-weight: 700;
      color: #000;
      border: 1.2px solid #000;
      padding: 1pt 5pt;
      letter-spacing: 1px;
      font-family: "Source Han Sans SC", "Noto Sans CJK SC", sans-serif;
    }
    .print-watermark {
      position: fixed;
      top: 0; left: 0; width: 100vw; height: 100vh;
      pointer-events: none;
      z-index: 9999;
      opacity: 0.055;
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
      font-family: "Source Han Sans SC", "Noto Sans CJK SC", sans-serif;
    }
    .sheet-title-banner {
      text-align: center;
      margin: 4pt 0 8pt;
      page-break-after: avoid;
      break-after: avoid;
    }
    .sheet-main-title {
      font-size: 16pt;
      font-weight: 700;
      letter-spacing: 1.5px;
      margin: 0 0 3pt;
      color: #000;
      font-family: "Source Han Sans SC", "Noto Sans CJK SC", SimHei, sans-serif;
    }
    .sheet-sub-title {
      font-size: 9.5pt;
      color: #444;
      margin: 0;
    }
    .student-info-bar {
      display: flex;
      justify-content: space-around;
      align-items: center;
      padding: 3pt 6pt;
      margin: 0 0 7pt;
      border-bottom: 1px dashed #666;
      font-size: 9pt;
      color: #222;
      font-family: "Source Han Sans SC", "Noto Sans CJK SC", sans-serif;
      page-break-after: avoid;
      break-after: avoid;
    }
    .score-grid-wrap {
      margin: 0 0 8pt;
      display: flex;
      justify-content: center;
      page-break-after: avoid;
      break-after: avoid;
    }
    .score-grid-table {
      border-collapse: collapse;
      font-size: 8.5pt;
      text-align: center;
      border: 1.2px solid #222;
    }
    .score-grid-table th, .score-grid-table td {
      border: 1px solid #444;
      padding: 2pt 8pt;
      min-width: 42pt;
      height: 16pt;
    }
    .score-grid-table th {
      background: #f2f2f2;
      font-weight: 600;
    }
    .score-grid-table .row-label {
      background: #f9f9f9;
      font-weight: 600;
    }
    .paper-section-banner {
      column-span: all;
      margin: 10pt 0 6pt;
      padding: 4pt 8pt;
      background: #f8fafc;
      border-left: 4pt solid #1e293b;
      border-bottom: 1px solid #cbd5e1;
      page-break-after: avoid;
      break-after: avoid;
    }
    .paper-section-title {
      font-size: 11pt;
      font-weight: 700;
      color: #0f172a;
      font-family: "Source Han Sans SC", "Noto Sans CJK SC", sans-serif;
    }
    .paper-section-notice {
      font-size: 8.5pt;
      color: #475569;
      margin-top: 1pt;
    }
    .q-score-box {
      float: right;
      display: flex;
      gap: 2px;
      margin-left: 6px;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .q-score-box table {
      border-collapse: collapse;
      border: 1px solid #333;
      font-size: 7.5pt;
      text-align: center;
    }
    .q-score-box td {
      border: 1px solid #555;
      padding: 1px 4px;
      min-width: 28pt;
      height: 12pt;
    }
    .solution-appendix-divider {
      column-span: all;
      page-break-before: always;
      break-before: page;
      margin-top: 14pt;
      padding-top: 8pt;
      border-top: 2px dashed #444;
      text-align: center;
      font-size: 13pt;
      font-weight: 700;
      font-family: "Source Han Sans SC", "Noto Sans CJK SC", sans-serif;
    }
    /* 答题卡卡纸专用填涂与主观题排版规范 */
    .card-top-row { display: flex; gap: 10px; margin-bottom: 8pt; page-break-inside: avoid; break-inside: avoid; }
    .card-info-table { border-collapse: collapse; font-size: 8.5pt; width: 100%; border: 1.2px solid #000; }
    .card-info-table td { border: 1px solid #333; padding: 3pt 6pt; }
    .card-barcode-box { width: 160pt; border: 1.5px dashed #444; display: flex; align-items: center; justify-content: center; font-size: 8.5pt; color: #666; text-align: center; }
    .bubble-matrix { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8pt; margin-bottom: 8pt; }
    .bubble-group-box { border: 1px solid #444; border-radius: 3px; padding: 4pt 6pt; background: #fff; page-break-inside: avoid; break-inside: avoid; }
    .bubble-row { display: flex; align-items: center; gap: 4pt; font-size: 8.5pt; margin: 2pt 0; font-family: monospace; }
    .bubble-no { min-width: 18pt; text-align: right; font-weight: 700; color: #111; }
    .bubble-item { border: 1px solid #222; border-radius: 2px; padding: 0 3px; font-weight: 700; font-size: 7.5pt; color: #111; min-width: 14pt; text-align: center; }
    .card-subjective-box { border: 1.5px solid #000; margin: 8pt 0; padding: 6pt; page-break-inside: avoid; break-inside: avoid; }
    .card-subjective-warn { font-size: 7.5pt; color: #666; text-align: right; border-bottom: 1px dashed #ccc; padding-bottom: 2pt; margin-bottom: 4pt; }
    ${isDouble
      ? `section.questions { column-count: 2; column-gap: 8mm; column-rule: 1px dotted #ccc; column-fill: auto; }`
      : `section.questions { column-count: 1; }`}
    .q {
      page-break-inside: avoid;
      break-inside: avoid;
      margin: 0 0 10px;
    }
    /* 材料卡片与首道小题强制同页同栏保护 */
    .material-block {
      page-break-inside: avoid;
      break-inside: avoid;
      page-break-after: avoid;
      break-after: avoid;
      background: #f6f6f6; border-left: 3px solid #888;
      padding: 5px 8px; margin: 0 0 6px;
      font-size: 9.8pt; white-space: pre-wrap; overflow-wrap: anywhere;
    }
    .section-divider {
      column-span: all;
      font-weight: 700;
      font-size: 10.5pt;
      margin: 10pt 0 5pt;
      padding: 2pt 6pt;
      background: #f1f5f9;
      border-left: 3.5pt solid #0284c7;
      color: #0f172a;
      page-break-after: avoid;
      break-after: avoid;
    }
    .homework-student-bar {
      display: flex; justify-content: space-between; align-items: center;
      padding: 4pt 8pt; margin: 0 0 8pt; border: 1px dashed #666; border-radius: 4px;
      font-size: 9pt; color: #222; font-family: "Source Han Sans SC", "Noto Sans CJK SC", sans-serif;
    }
    .homework-reflection-box {
      column-span: all; margin-top: 10pt; padding: 6pt 8pt;
      border: 1px solid #888; border-radius: 4px; background: #fafafa;
      font-size: 8.5pt; color: #333; page-break-inside: avoid; break-inside: avoid;
    }
    .q-group-head { page-break-after: avoid; break-after: avoid; }
    .q-head { font-weight: 700; margin-bottom: 2px; }
    .q-type { font-size: 8.5pt; color: #555; border: 1px solid #999; border-radius: 2px; padding: 0 3px; margin-right: 5px; }
    .q-score { float: right; font-weight: 400; font-size: 9pt; color: #555; }
    .q-stem { white-space: pre-wrap; overflow-wrap: anywhere; }
    .opt { margin-left: 1.2em; }
    /* 选项自适应网格 (exam-zh choices 规范) */
    .opt-grid {
      display: grid;
      gap: 2px 8px;
      margin: 3px 0 3px 1.2em;
      font-size: 10pt;
    }
    .opt-grid-4 { grid-template-columns: repeat(4, 1fr); }
    .opt-grid-2 { grid-template-columns: repeat(2, 1fr); }
    .opt-grid-1 { grid-template-columns: 1fr; }
    .opt-grid .opt { margin-left: 0; }
    .opt-item { min-width: 0; overflow-wrap: anywhere; }

    /* 装订密封线 (exam-zh sealline 规范) */
    .seal-line-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 3pt 8pt;
      margin-bottom: 6pt;
      border-top: 1px dashed #666;
      border-bottom: 2px dashed #333;
      font-size: 8.5pt;
      color: #222;
      font-family: "Source Han Sans SC", "Noto Sans CJK SC", sans-serif;
      page-break-after: avoid;
      break-after: avoid;
    }
    .seal-warning {
      font-weight: 700;
      letter-spacing: 2px;
      color: #333;
    }

    /* 卷首考生须知框 */
    .exam-notice-box {
      border: 1px solid #777;
      border-radius: 3px;
      padding: 4pt 8pt;
      margin-bottom: 7pt;
      font-size: 8.5pt;
      line-height: 1.45;
      color: #333;
      background: #fafafa;
      page-break-after: avoid;
      break-after: avoid;
    }
    .exam-notice-title {
      font-weight: 700;
      font-size: 9pt;
      margin-bottom: 2pt;
      color: #111;
      text-align: center;
    }
    .exam-notice-list {
      margin: 0;
      padding-left: 14pt;
    }
    .exam-notice-list li {
      margin: 1pt 0;
    }

    /* 自定义厘米级答题留白框 */
    .answer-area-custom {
      border: 1px dashed #888;
      border-radius: 2px;
      margin: 4px 0 0 1.2em;
      background: #fafafa;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .answer-area { border-bottom: 1px solid #999; height: 1.8em; margin: 4px 0 0 1.2em; }
    .ans-analysis { color: #333; font-size: 9.8pt; margin-left: 1.2em; white-space: pre-wrap; overflow-wrap: anywhere; }
    .kp-tag { color: #666; font-size: 8.5pt; }
    .teacher-box {
      margin: 4px 0 0 1.2em;
      padding: 5px 8px;
      background: #fafafa;
      border: 1px dashed #bbb;
      border-left: 3px solid #2e7d32;
      border-radius: 2px;
      font-size: 9.3pt;
      line-height: 1.45;
    }
    .teacher-ans { color: #1b5e20; font-weight: 700; }
    .teacher-meta { color: #666; font-size: 8.5pt; margin: 2px 0; }
    .teacher-rubric { color: #0277bd; font-size: 8.8pt; margin: 2px 0; }
    .teacher-analysis { color: #333; margin-top: 2px; }
    footer.sheet-footer {
      position: fixed; bottom: 0; left: 0; right: 0;
      border-top: 1px solid #ccc; padding-top: 2px; margin-top: 8px;
      font-size: 8.5pt; color: #666; display: flex; justify-content: space-between;
    }
    @media print {
      body { margin: 0; }
      footer.sheet-footer { position: fixed; }
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
 * 生成 A4 双栏紧凑作答卷 HTML（68-04 核心）。
 * 安全红线：绝不输出标准答案与解析字段。
 */
export function buildCompactQuestionSheetPro(
  title: string,
  questions: readonly Question[],
  options: PrintProOptions = {},
): string {
  const showArea = options.showAnswerArea !== false;
  const showScore = options.showScore === true;
  const groupByKp = options.groupByKp !== false;
  const mainTitle = options.headerTitle || title;

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

  if (options.showSealLine) {
    parts.push(renderSealLineBar());
  }

  // 卷面大标题与副标题横幅
  parts.push(`<div class="sheet-title-banner">`);
  parts.push(`<h1 class="sheet-main-title">${escapeHtml(mainTitle)}</h1>`);
  if (options.subtitle) {
    parts.push(`<p class="sheet-sub-title">${escapeHtml(options.subtitle)}</p>`);
  }
  parts.push(`</div>`);

  if (options.showStudentInfoBar) {
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

  const renderSingleQuestion = (q: Question, no: number) => {
    // 考点章节分组排版
    if (groupByKp && q.kp && q.kp !== lastKp) {
      lastKp = q.kp;
      parts.push(`<div class="section-divider">📌 考点章节：${escapeHtml(q.kp)}</div>`);
    }

    let materialHtml = "";
    if (q.group && !printedGroups.has(q.group)) {
      const carrier = questions.find((m) => m.group === q.group && m.type === "material" && m.analysis);
      if (carrier?.analysis) {
        materialHtml = `<div class="material-block q-group-head">${renderMathInText(carrier.analysis)}</div>`;
        printedGroups.add(q.group);
      }
    }

    if (q.type === "material") {
      if (q.group) {
        if (materialHtml) parts.push(`<div class="q">${materialHtml}</div>`);
        return;
      }
      if (q.analysis) {
        parts.push(`<div class="q">${materialHtml}<div class="material-block">${renderMathInText(q.analysis)}</div></div>`);
      }
      return;
    }

    parts.push(`<div class="q">`);
    if (materialHtml) parts.push(materialHtml);
    const scoreHtml = showScore ? `<span class="q-score">${q.score} 分</span>` : "";
    let scoreBoxHtml = "";
    if (options.showPerQuestionScoreBox && (q.type === "short" || q.type === "fill")) {
      scoreBoxHtml = `<div class="q-score-box"><table><tr><td>得分</td></tr><tr><td>&nbsp;</td></tr></table><table><tr><td>评卷人</td></tr><tr><td>&nbsp;</td></tr></table></div>`;
    }
    parts.push(`<div class="q-head">${scoreBoxHtml}<span class="q-type">${escapeHtml(TYPE_NAMES[q.type] ?? q.type)}</span>${no}.${scoreHtml}</div>`);
    parts.push(`<div class="q-stem">${renderMathInText(renderMathDiagramsInText(q.stem))}</div>`);
    if (q.occlusion) {
      parts.push(`<div class="occlusion-wrap">${renderOcclusionSvg(q.occlusion, { printMode: true })}</div>`);
    }
    if (q.options && q.options.length > 0) {
      const cols = computeOptionColumns(q.options);
      parts.push(`<div class="opt-grid opt-grid-${cols}">`);
      q.options.forEach((o, oi) => {
        parts.push(`<div class="opt opt-item">${String.fromCharCode(65 + oi)}. ${renderMathInText(o)}</div>`);
      });
      parts.push(`</div>`);
    }
    if (showArea && (q.type === "fill" || q.type === "short")) {
      if (q.type === "short" && options.shortAnswerSpaceCm && options.shortAnswerSpaceCm > 0) {
        const cm = Math.max(0.5, Math.min(30, options.shortAnswerSpaceCm));
        parts.push(`<div class="answer-area-custom" style="min-height:${cm}cm"></div>`);
      } else {
        parts.push(`<div class="answer-area"></div>`);
        if (q.type === "short") parts.push(`<div class="answer-area"></div><div class="answer-area"></div>`);
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
        renderSingleQuestion(sq, overallNo);
      }
    }
  } else {
    questions.forEach((q, i) => {
      overallNo = i + 1;
      renderSingleQuestion(q, overallNo);
    });
  }

  // 如果开启卷尾附加参考答案与解析
  if (options.appendSolutionsAtEnd) {
    parts.push(`<div class="solution-appendix-divider">【参考答案与解题分析附录】</div>`);
    let solNo = 0;
    for (const sq of questions) {
      if (sq.type === "material") continue;
      solNo++;
      parts.push(`<div class="q">`);
      parts.push(`<div class="q-head">${solNo}. <strong>${escapeHtml(sq.answer)}</strong>${sq.kp ? ` <span class="kp-tag">${escapeHtml(sq.kp)}</span>` : ""}</div>`);
      if (sq.type === "short" && sq.rubric?.criteria?.length) {
        const rubricText = sq.rubric.criteria.map((c) => `${c.label}(${Math.round(c.weight * 100)}%)`).join(" · ");
        parts.push(`<div class="ans-analysis">📋 采分点标准：${escapeHtml(rubricText)}</div>`);
      }
      if (sq.analysis) parts.push(`<div class="ans-analysis">💡 详细解析：${renderMathInText(sq.analysis)}</div>`);
      if (sq.expansion) parts.push(`<div class="ans-analysis" style="color:#0284c7">⚡ 思路拓展与秒杀要诀：${renderMathInText(sq.expansion)}</div>`);
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
  const parts: string[] = [
    `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><title>${escapeHtml(mainTitle)} · 答题卡</title><style>${buildPrintProCss({ ...options, columns: "single" })}</style></head><body>`,
    renderHeader(`${mainTitle} · 答题卡`, `总题量：${questions.length} 题`, options.paperNo),
  ];

  parts.push(`<div class="sheet-title-banner">`);
  parts.push(`<h1 class="sheet-main-title">${escapeHtml(mainTitle)} · 答题卡</h1>`);
  parts.push(`<p class="sheet-sub-title">请使用 2B 铅笔规范填涂选择题，用黑色签字笔在指定矩形框内书写主观题</p>`);
  parts.push(`</div>`);

  parts.push(`<div class="card-top-row">`);
  parts.push(`<div style="flex:1">`);
  parts.push(`<table class="card-info-table">`);
  parts.push(`<tr><td>姓名：__________________</td><td>班级：__________________</td></tr>`);
  parts.push(`<tr><td>考场：__________________</td><td>座位号：________________</td></tr>`);
  parts.push(`<tr><td colspan="2">准考证号：[ ][ ][ ][ ][ ][ ][ ][ ][ ][ ]</td></tr>`);
  parts.push(`</table>`);
  parts.push(`</div>`);
  parts.push(`<div class="card-barcode-box">条形码粘贴区<br><span style="font-size:7.5pt">(居中对齐粘贴)</span></div>`);
  parts.push(`</div>`);

  const objectiveQuestions = questions.filter((q) => q.type === "single" || q.type === "multiple" || q.type === "judge");
  if (objectiveQuestions.length > 0) {
    parts.push(`<div class="section-divider" style="margin-top:4pt">一、客观选择题填涂区（请用 2B 铅笔正确填涂 [■]）</div>`);
    parts.push(`<div class="bubble-matrix">`);

    const groupSize = 5;
    for (let gi = 0; gi < objectiveQuestions.length; gi += groupSize) {
      const slice = objectiveQuestions.slice(gi, gi + groupSize);
      parts.push(`<div class="bubble-group-box">`);
      slice.forEach((q, sIdx) => {
        const qIndex = gi + sIdx + 1;
        const bubbles = q.type === "judge"
          ? `<span class="bubble-item">[T]</span><span class="bubble-item">[F]</span>`
          : `<span class="bubble-item">[A]</span><span class="bubble-item">[B]</span><span class="bubble-item">[C]</span><span class="bubble-item">[D]</span>`;
        parts.push(`<div class="bubble-row"><span class="bubble-no">${qIndex}.</span>${bubbles}</div>`);
      });
      parts.push(`</div>`);
    }
    parts.push(`</div>`);
  }

  const subjectiveQuestions = questions.filter((q) => q.type === "fill" || q.type === "short");
  if (subjectiveQuestions.length > 0) {
    parts.push(`<div class="section-divider" style="margin-top:6pt">二、非选择题作答区（请在各题黑色边框内作答，超出边框无效）</div>`);
    let subNo = objectiveQuestions.length;
    subjectiveQuestions.forEach((q) => {
      subNo++;
      const minHeight = q.type === "short"
        ? (options.shortAnswerSpaceCm ? `${options.shortAnswerSpaceCm}cm` : "32mm")
        : "16mm";
      parts.push(`<div class="card-subjective-box" style="min-height:${minHeight}">`);
      parts.push(`<div class="card-subjective-warn">第 ${subNo} 题 (${q.score || 1} 分) · 请在黑色边框内作答，超出无效</div>`);
      parts.push(`</div>`);
    });
  }

  parts.push(renderFooter(options.footerNote || "小驴考试 · 标准答题卡"), `</body></html>`);
  return parts.join("\n");
}

/**
 * 生成 A4 双栏紧凑详解答案册 HTML。
 */
export function buildCompactAnswerSheetPro(
  title: string,
  questions: readonly Question[],
  options: PrintProOptions = {},
): string {
  const parts: string[] = [
    `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><title>${escapeHtml(title)} · 答案册</title><style>${buildPrintProCss(options)}</style></head><body>`,
    renderHeader(`${title} · 答案册`, `共 ${questions.length} 题（与题册同序）`, options.paperNo),
    `<section class="questions">`,
  ];

  let no = 0;
  for (const q of questions) {
    if (q.type === "material") continue;
    no++;
    parts.push(`<div class="q">`);
    parts.push(`<div class="q-head">${no}. <strong>${escapeHtml(q.answer)}</strong>${q.kp ? ` <span class="kp-tag">${escapeHtml(q.kp)}</span>` : ""}</div>`);
    if (q.type === "short" && q.rubric?.criteria?.length) {
      const rubricText = q.rubric.criteria.map((c) => `${c.label}(${Math.round(c.weight * 100)}%)`).join(" · ");
      parts.push(`<div class="ans-analysis">采分点：${escapeHtml(rubricText)}</div>`);
    }
    if (q.analysis) parts.push(`<div class="ans-analysis">${renderMathInText(q.analysis)}</div>`);
    parts.push(`</div>`);
  }

  parts.push(`</section>`, renderFooter(options.footerNote), `</body></html>`);
  return parts.join("\n");
}

/**
 * 生成 A4 双栏/单栏【教师备课与授课讲义卷】HTML（教师教研核心）。
 * 特性：题面 + 选项 + 教师参考答案 + 考点难度 + 采分点标准 + 破题教学解析 + 数学公式。
 */
export function buildTeacherLectureSheetPro(
  title: string,
  questions: readonly Question[],
  options: PrintProOptions = {},
): string {
  const parts: string[] = [
    `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><title>${escapeHtml(title)} · 教师讲义教案卷</title><style>${buildPrintProCss(options)}</style></head><body>`,
    renderHeader(`${title} · 教师授课讲义卷`, `共 ${questions.length} 题`, options.paperNo),
    `<section class="questions">`,
  ];

  const printedGroups = new Set<string>();
  const groupByKp = options.groupByKp !== false;
  let lastKp = "";

  questions.forEach((q, i) => {
    const no = i + 1;
    if (groupByKp && q.kp && q.kp !== lastKp) {
      lastKp = q.kp;
      parts.push(`<div class="section-divider">📌 考点章节：${escapeHtml(q.kp)}</div>`);
    }
    let materialHtml = "";
    if (q.group && !printedGroups.has(q.group)) {
      const carrier = questions.find((m) => m.group === q.group && m.type === "material" && m.analysis);
      if (carrier?.analysis) {
        materialHtml = `<div class="material-block q-group-head">${renderMathInText(carrier.analysis)}</div>`;
        printedGroups.add(q.group);
      }
    }

    if (q.type === "material") {
      if (q.group) {
        if (materialHtml) parts.push(`<div class="q">${materialHtml}</div>`);
        return;
      }
      if (q.analysis) {
        parts.push(`<div class="q">${materialHtml}<div class="material-block">${renderMathInText(q.analysis)}</div></div>`);
      }
      return;
    }

    parts.push(`<div class="q">`);
    if (materialHtml) parts.push(materialHtml);
    const scoreText = q.score ? `<span class="q-score">${q.score} 分</span>` : "";
    parts.push(`<div class="q-head"><span class="q-type">${escapeHtml(TYPE_NAMES[q.type] ?? q.type)}</span>${no}.${scoreText}</div>`);
    parts.push(`<div class="q-stem">${renderMathInText(renderMathDiagramsInText(q.stem))}</div>`);
    if (q.occlusion) {
      parts.push(`<div class="occlusion-wrap">${renderOcclusionSvg(q.occlusion, { printMode: true })}</div>`);
    }
    if (q.options && q.options.length > 0) {
      const cols = computeOptionColumns(q.options);
      parts.push(`<div class="opt-grid opt-grid-${cols}">`);
      q.options.forEach((o, oi) => {
        parts.push(`<div class="opt opt-item">${String.fromCharCode(65 + oi)}. ${renderMathInText(o)}</div>`);
      });
      parts.push(`</div>`);
    }

    // 教师备课核心卡片
    parts.push(`<div class="teacher-box">`);
    parts.push(`<div>【<span class="teacher-ans">参考答案</span>】：<strong>${escapeHtml(q.answer)}</strong></div>`);
    const metaParts: string[] = [];
    if (q.kp) metaParts.push(`🏷️ 考点：${escapeHtml(q.kp)}`);
    if (q.difficulty) metaParts.push(`⭐ 难度：${"★".repeat(Math.min(5, Math.max(1, q.difficulty)))}${"☆".repeat(Math.max(0, 5 - Math.min(5, q.difficulty)))}`);
    if (metaParts.length) parts.push(`<div class="teacher-meta">${metaParts.join(" · ")}</div>`);

    if (q.type === "short" && q.rubric?.criteria?.length) {
      const rubricText = q.rubric.criteria.map((c) => `${c.label}(${Math.round(c.weight * 100)}%)`).join("；");
      parts.push(`<div class="teacher-rubric">📋 采分点标准：${escapeHtml(rubricText)}</div>`);
    }

    if (q.analysis) {
      parts.push(`<div class="teacher-analysis">💡 <strong>教学点拨与破题分析</strong>：${renderMathInText(q.analysis)}</div>`);
    }
    parts.push(`</div>`); // end .teacher-box
    parts.push(`</div>`); // end .q
  });

  parts.push(`</section>`, renderFooter(options.footerNote || "小驴考试 · 教师备课授课讲义"), `</body></html>`);
  return parts.join("\n");
}

/**
 * 生成 A4 双栏【学生课后作业与分层导学单】HTML（学校教师教学核心）。
 * 特性：学生信息填写条 + 题干与选项 + 规范作答书写框 + 课后自我诊断反思栏。
 */
export function buildStudentHomeworkSheetPro(
  title: string,
  questions: readonly Question[],
  options: PrintProOptions = {},
): string {
  const parts: string[] = [
    `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><title>${escapeHtml(title)} · 课后作业导学单</title><style>${buildPrintProCss(options)}</style></head><body>`,
    renderHeader(`${title} · 课后作业导学单`, `共 ${questions.length} 题`, options.paperNo),
    `<div class="homework-student-bar"><span>班级：___________</span><span>姓名：___________</span><span>学号：___________</span><span>日期：___________</span><span>得分：___________</span></div>`,
    `<section class="questions">`,
  ];

  const printedGroups = new Set<string>();
  const groupByKp = options.groupByKp !== false;
  let lastKp = "";

  questions.forEach((q, i) => {
    const no = i + 1;
    if (groupByKp && q.kp && q.kp !== lastKp) {
      lastKp = q.kp;
      parts.push(`<div class="section-divider">📌 练习考点：${escapeHtml(q.kp)}</div>`);
    }
    let materialHtml = "";
    if (q.group && !printedGroups.has(q.group)) {
      const carrier = questions.find((m) => m.group === q.group && m.type === "material" && m.analysis);
      if (carrier?.analysis) {
        materialHtml = `<div class="material-block q-group-head">${renderMathInText(carrier.analysis)}</div>`;
        printedGroups.add(q.group);
      }
    }

    if (q.type === "material") {
      if (q.group) {
        if (materialHtml) parts.push(`<div class="q">${materialHtml}</div>`);
        return;
      }
      if (q.analysis) {
        parts.push(`<div class="q">${materialHtml}<div class="material-block">${renderMathInText(q.analysis)}</div></div>`);
      }
      return;
    }

    parts.push(`<div class="q">`);
    if (materialHtml) parts.push(materialHtml);
    const scoreText = q.score ? `<span class="q-score">${q.score} 分</span>` : "";
    parts.push(`<div class="q-head"><span class="q-type">${escapeHtml(TYPE_NAMES[q.type] ?? q.type)}</span>${no}.${scoreText}</div>`);
    parts.push(`<div class="q-stem">${renderMathInText(renderMathDiagramsInText(q.stem))}</div>`);
    if (q.occlusion) {
      parts.push(`<div class="occlusion-wrap">${renderOcclusionSvg(q.occlusion, { printMode: true })}</div>`);
    }
    if (q.options && q.options.length > 0) {
      const cols = computeOptionColumns(q.options);
      parts.push(`<div class="opt-grid opt-grid-${cols}">`);
      q.options.forEach((o, oi) => {
        parts.push(`<div class="opt opt-item">${String.fromCharCode(65 + oi)}. ${renderMathInText(o)}</div>`);
      });
      parts.push(`</div>`);
    }
    if (q.type === "fill" || q.type === "short") {
      const defaultHeight = q.type === 'short' ? '30mm' : '10mm';
      const heightStyle = q.type === 'short' && options.shortAnswerSpaceCm && options.shortAnswerSpaceCm > 0
        ? `${Math.max(0.5, Math.min(30, options.shortAnswerSpaceCm))}cm`
        : defaultHeight;
      parts.push(`<div class="answer-area" style="min-height:${heightStyle};border:1px dashed #aaa;margin-top:4pt"></div>`);
    }
    parts.push(`</div>`);
  });

  parts.push(
    `</section>`,
    `<div class="homework-reflection-box">`,
    `<div><strong>【学生自我诊断与订正栏】</strong> 本次练习掌握感：[ ] 熟练掌握 · [ ] 稍有困难 · [ ] 需请教老师</div>`,
    `<div style="margin-top:4pt;border-top:1px dashed #ccc;padding-top:4pt;color:#666">错因记录与疑问：__________________________________________________________________________</div>`,
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
  const parts: string[] = [
    `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><title>${escapeHtml(title)} · 错题清零重测卷</title><style>${buildPrintProCss(options)}</style></head><body>`,
    renderHeader(`${title} · 错题清零重测卷`, `共 ${questions.length} 道错题待攻坚`, options.paperNo),
    `<div class="homework-student-bar"><span>姓名：___________</span><span>班级：___________</span><span>日期：___________</span><span>原错题数：${questions.length}</span><span>本次目标：错题清零</span></div>`,
    `<section class="questions">`,
  ];

  const printedGroups = new Set<string>();
  const groupByKp = options.groupByKp !== false;
  let lastKp = "";

  questions.forEach((q, i) => {
    const no = i + 1;
    if (groupByKp && q.kp && q.kp !== lastKp) {
      lastKp = q.kp;
      parts.push(`<div class="section-divider">📌 攻坚考点：${escapeHtml(q.kp)}</div>`);
    }
    let materialHtml = "";
    if (q.group && !printedGroups.has(q.group)) {
      const carrier = questions.find((m) => m.group === q.group && m.type === "material" && m.analysis);
      if (carrier?.analysis) {
        materialHtml = `<div class="material-block q-group-head">${renderMathInText(carrier.analysis)}</div>`;
        printedGroups.add(q.group);
      }
    }

    if (q.type === "material") {
      if (q.group) {
        if (materialHtml) parts.push(`<div class="q">${materialHtml}</div>`);
        return;
      }
      if (q.analysis) {
        parts.push(`<div class="q">${materialHtml}<div class="material-block">${renderMathInText(q.analysis)}</div></div>`);
      }
      return;
    }

    parts.push(`<div class="q">`);
    if (materialHtml) parts.push(materialHtml);
    parts.push(`<div class="q-head"><span class="q-type">${escapeHtml(TYPE_NAMES[q.type] ?? q.type)}</span>${no}. <span class="lv-chip sm" style="font-size:8pt;color:#d97706;border:1px solid #fde68a;padding:0 3px">错题重练</span></div>`);
    parts.push(`<div class="q-stem">${renderMathInText(q.stem)}</div>`);
    if (q.occlusion) {
      parts.push(`<div class="occlusion-wrap">${renderOcclusionSvg(q.occlusion, { printMode: true })}</div>`);
    }

    if (q.type === "single" || q.type === "multiple") {
      const letters = "ABCDEFGHIJ";
      if (q.options && q.options.length > 0) {
        const cols = computeOptionColumns(q.options);
        parts.push(`<div class="opt-grid opt-grid-${cols}">`);
        q.options.forEach((opt, oi) => {
          parts.push(`<div class="opt opt-item"><b>${letters[oi]}.</b> ${renderMathInText(opt)}</div>`);
        });
        parts.push(`</div>`);
      }
      parts.push(`<div class="answer-area" style="height:1.8em;border-bottom:1px solid #888;margin-top:3pt">作答：______</div>`);
    } else if (q.type === "judge") {
      parts.push(`<div class="opt" style="margin-top:3pt">作答判断：[ ] 正确 (T)  /  [ ] 错误 (F)</div>`);
    } else {
      const defaultHeight = q.type === 'short' ? '28mm' : '9mm';
      const heightStyle = q.type === 'short' && options.shortAnswerSpaceCm && options.shortAnswerSpaceCm > 0
        ? `${Math.max(0.5, Math.min(30, options.shortAnswerSpaceCm))}cm`
        : defaultHeight;
      parts.push(`<div class="answer-area" style="min-height:${heightStyle};border:1px dashed #aaa;margin-top:4pt"></div>`);
    }
    parts.push(`</div>`);
  });

  parts.push(
    `</section>`,
    `<div class="homework-reflection-box">`,
    `<div><strong>【错题清零自我归因与二次反思】</strong> 本次订正情况：[ ] 彻底弄懂 [ ] 仍有疑问 · 错因反思：[ ] 粗心失误 [ ] 概念盲区 [ ] 审题陷阱</div>`,
    `<div style="margin-top:4pt;border-top:1px dashed #ccc;padding-top:4pt;color:#666">核心考点领悟与关键步骤：__________________________________________________________________________</div>`,
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
  const letters = ["A", "B", "C", "D", "E", "F", "G", "H"];
  const totalScore = questions.reduce((sum, q) => sum + (q.score || 1), 0);

  const questionsHtml: string[] = [];

  questions.forEach((q, idx) => {
    const no = idx + 1;
    const qid = q.id || `q_${no}`;
    const score = q.score || 1;
    const typeName = TYPE_NAMES[q.type] || q.type;

    let optionsMarkup = "";
    if (q.options && q.options.length > 0) {
      const isMulti = q.type === "multiple";
      const inputType = isMulti ? "checkbox" : "radio";
      const opts = q.options.map((opt, oi) => {
        const letter = letters[oi];
        return `<label class="interactive-opt">
          <input type="${inputType}" name="ans_${qid}" value="${letter}" class="opt-input">
          <span class="opt-letter">${letter}.</span>
          <span class="opt-text">${renderMathInText(opt)}</span>
        </label>`;
      }).join("\n");
      optionsMarkup = `<div class="interactive-opts-group">${opts}</div>`;
    } else if (q.type === "judge") {
      optionsMarkup = `<div class="interactive-opts-group">
        <label class="interactive-opt">
          <input type="radio" name="ans_${qid}" value="对" class="opt-input">
          <span class="opt-letter">√</span>
          <span class="opt-text">正确 (True)</span>
        </label>
        <label class="interactive-opt">
          <input type="radio" name="ans_${qid}" value="错" class="opt-input">
          <span class="opt-letter">×</span>
          <span class="opt-text">错误 (False)</span>
        </label>
      </div>`;
    } else if (q.type === "fill") {
      optionsMarkup = `<div class="interactive-input-wrap">
        <input type="text" name="ans_${qid}" class="interactive-text-input" placeholder="输入填空答案（多空请用半角 ;; 分隔）…">
      </div>`;
    } else if (q.type === "short") {
      optionsMarkup = `<div class="interactive-input-wrap">
        <textarea name="ans_${qid}" class="interactive-textarea" rows="3" placeholder="写下你的简答核心要点…"></textarea>
      </div>`;
    }

    // 采分点标准呈现
    let rubricHtml = "";
    if (q.rubric && typeof q.rubric === "object") {
      const criteria = (q.rubric as { criteria?: Array<{ name?: string; points?: number; desc?: string }> })?.criteria;
      if (Array.isArray(criteria) && criteria.length) {
        rubricHtml = `<div class="rubric-box">
          <div class="rubric-title">🎯 官方采分点细则标准：</div>
          <ul class="rubric-list">
            ${criteria.map((c) => `<li><b>${escapeHtml(c.name || "要点")}</b>（${c.points ?? 1}分）：${escapeHtml(c.desc || "")}</li>`).join("")}
          </ul>
        </div>`;
      }
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
          ${renderMathInText(renderMathDiagramsInText(q.stem))}
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
            ${q.analysis ? `<div class="analysis-body"><b>【深度解析】</b> ${renderMathInText(renderMathDiagramsInText(q.analysis))}</div>` : ""}
            ${q.expansion ? `<div class="expansion-body" style="margin-top:8px;padding:8px 12px;background:#fffbeb;border-left:3px solid #f59e0b;border-radius:6px;color:#78350f;font-size:13px;line-height:1.6"><b style="color:#b45309">【💡 思路拓展与秒杀技巧】</b> ${renderMathInText(renderMathDiagramsInText(q.expansion))}</div>` : ""}
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
      font-size: 15px;
      font-weight: 500;
      margin-bottom: 14px;
      color: var(--text);
    }
    .interactive-opts-group {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-bottom: 14px;
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
      body { background: #fff; padding: 0; }
      header.header-bar { border: 0; box-shadow: none; padding: 0 0 10px; }
      .toolbar-row, .btn-toggle-answer, .scoreboard-banner { display: none !important; }
      .q-answer-details { display: block !important; }
      .q-card { page-break-inside: avoid; break-inside: avoid; border: 1px solid #ccc; box-shadow: none; margin-bottom: 12px; }
      .test-answer-space { display: block !important; }
      .expansion-body { page-break-inside: avoid; break-inside: avoid; }
    }
    ${getMathPrintStyles()}
  </style>
</head>
<body class="mode-lecture">
  <div class="wrapper">
    <header class="header-bar">
      <div class="header-title-row">
        <h1 class="header-title">📖 ${escapeHtml(displayTitle)}</h1>
        <div class="header-meta">
          <span class="badge">共 ${questions.length} 题</span>
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
        const qid = card.getAttribute('data-qid');
        const qtype = card.getAttribute('data-type');
        const rawAns = (card.getAttribute('data-answer') || '').trim();
        const score = parseFloat(card.getAttribute('data-score')) || 1;
        totalScore += score;

        let myAns = '';
        if (qtype === 'single' || qtype === 'judge') {
          const sel = card.querySelector('input[name="ans_' + qid + '"]:checked');
          if (sel) myAns = sel.value.trim();
        } else if (qtype === 'multiple') {
          const checked = card.querySelectorAll('input[name="ans_' + qid + '"]:checked');
          const arr = [];
          checked.forEach(function(c) { arr.push(c.value.trim()); });
          arr.sort();
          myAns = arr.join('');
        } else if (qtype === 'fill') {
          const inp = card.querySelector('input[name="ans_' + qid + '"]');
          if (inp) myAns = inp.value.trim();
        } else if (qtype === 'short') {
          const ta = card.querySelector('textarea[name="ans_' + qid + '"]');
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
  const letters = ["A", "B", "C", "D", "E", "F", "G", "H"];
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
        : cleanUpper.replace(/[^A-H]/g, "").split("");
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


