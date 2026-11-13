/**
 * 数学公式（LaTeX / KaTeX）处理引擎
 * 职责：
 * 1. LaTeX 公式语法清洗与格式归一化（normalizeLatexFormula）；
 * 2. 多环境双模渲染（优先探测宿主 window.katex，无环境时优雅降级为语义 HTML / MathML）；
 * 3. A4 双栏排版打印专用的出版级公式排版 CSS。
 */

const ESC_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => ESC_MAP[ch]);
}

/** 常用希腊字母与常用数学符号映射表（供纯语义 HTML 降级渲染） */
const LATEX_SYMBOLS_MAP: Record<string, string> = {
  // 希腊字母
  alpha: "α",
  beta: "β",
  gamma: "γ",
  delta: "δ",
  epsilon: "ε",
  zeta: "ζ",
  eta: "η",
  theta: "θ",
  iota: "ι",
  kappa: "κ",
  lambda: "λ",
  mu: "μ",
  nu: "ν",
  xi: "ξ",
  pi: "π",
  rho: "ρ",
  sigma: "σ",
  tau: "τ",
  upsilon: "υ",
  phi: "φ",
  chi: "χ",
  psi: "ψ",
  omega: "ω",
  Gamma: "Γ",
  Delta: "Δ",
  Theta: "Θ",
  Lambda: "Λ",
  Xi: "Ξ",
  Pi: "Π",
  Sigma: "Σ",
  Phi: "Φ",
  Psi: "Ψ",
  Omega: "Ω",

  // 关系与运算符号
  le: "≤",
  leq: "≤",
  ge: "≥",
  geq: "≥",
  ne: "≠",
  neq: "≠",
  approx: "≈",
  equiv: "≡",
  pm: "±",
  mp: "∓",
  times: "×",
  div: "÷",
  cdot: "·",
  ast: "*",
  circ: "∘",
  infty: "∞",
  partial: "∂",
  nabla: "∇",

  // 几何与常用学科符号 (exam-zh & 中学高数规范)
  perp: "⊥",
  parallel: "∥",
  triangle: "△",
  angle: "∠",
  ang: "∠",
  cong: "≌",
  sim: "∽",
  odot: "⊙",
  degree: "°",
  celsius: "℃",
  perthousand: "‰",
  textperthousand: "‰",
  permil: "‰",
  parallelogram: "▱",
  iu: "i",
  upi: "i",
  eu: "e",
  upe: "e",
  wideparen: "⌒",
  overparen: "⌒",
  widearc: "⌒",
  overarc: "⌒",

  // 逻辑与集合
  forall: "∀",
  exists: "∃",
  in: "∈",
  notin: "∉",
  subset: "⊂",
  subseteq: "⊆",
  supset: "⊃",
  supseteq: "⊇",
  cap: "∩",
  cup: "∪",
  emptyset: "∅",

  // 箭头与大型算子
  to: "→",
  rightarrow: "→",
  leftarrow: "←",
  Rightarrow: "⇒",
  Leftarrow: "⇐",
  Leftrightarrow: "⇔",
  sum: "∑",
  prod: "∏",
  int: "∫",
  oint: "∮",
};

export interface LatexValidationIssue {
  valid: boolean;
  message?: string;
  unclosed?: string[];
}

/**
 * LaTeX 公式定界符与括号栈即时校验（CAND-03）
 * 检测公式中的成对括号（{}、[]、()）是否闭合，以及 $ 是否配对。
 */
export function validateLatexSyntax(text: string): LatexValidationIssue {
  if (!text) return { valid: true };

  // 1. 检查行内/块级 $ 定界符是否成对
  const unescaped = text.replace(/\\(\$|\\|\{|\}|\[|\]|\(|\))/g, "");
  let dollarCount = 0;
  for (let i = 0; i < unescaped.length; i++) {
    if (unescaped[i] === "$") dollarCount++;
  }
  if (dollarCount % 2 !== 0) {
    return {
      valid: false,
      message: "检测到公式定界符 $ 未成对闭合",
      unclosed: ["$"],
    };
  }

  // 2. 提取所有公式内容进行括号栈深度检查
  const formulaSegments: string[] = [];
  const mathRegex = /\$\$([\s\S]*?)\$\$|\$([^$\n\r]+?)\$/g;
  let match: RegExpExecArray | null;
  let foundMath = false;
  while ((match = mathRegex.exec(text)) !== null) {
    foundMath = true;
    formulaSegments.push(match[1] ?? match[2] ?? "");
  }

  if (!foundMath && /\\[a-zA-Z]+/.test(text)) {
    formulaSegments.push(text);
  }

  const PAIRS: Record<string, string> = { "{": "}", "[": "]", "(": ")" };
  const OPEN = new Set(["{", "[", "("]);
  const CLOSE = new Set(["}", "]", ")"]);

  for (const seg of formulaSegments) {
    const cleanSeg = seg.replace(/\\(\{|\}|\[|\]|\(|\))/g, "");
    const stack: { char: string; pos: number }[] = [];
    for (let i = 0; i < cleanSeg.length; i++) {
      const ch = cleanSeg[i];
      if (OPEN.has(ch)) {
        stack.push({ char: ch, pos: i });
      } else if (CLOSE.has(ch)) {
        if (!stack.length) {
          return {
            valid: false,
            message: `检测到多余的闭合符号「${ch}」`,
            unclosed: [ch],
          };
        }
        const last = stack.pop()!;
        if (PAIRS[last.char] !== ch) {
          return {
            valid: false,
            message: `括号不匹配：期待「${PAIRS[last.char]}」，实际遇到「${ch}」`,
            unclosed: [last.char, ch],
          };
        }
      }
    }
    if (stack.length > 0) {
      const missing = stack.map((s) => PAIRS[s.char]).reverse();
      return {
        valid: false,
        message: `检测到公式括号未闭合，缺少「${missing.join(" ")}」`,
        unclosed: missing,
      };
    }
  }

  return { valid: true };
}

/**
 * 规范化 LaTeX 公式语法（支持消除 OCR 常见空格分裂、括号转换）
 */
export function normalizeLatexFormula(raw: string): string {
  if (!raw) return "";

  let s = raw;

  // 1. 将 LaTeX 括号 \( ... \) 转换为 $ ... $（自动 trim 括号内两端空格）
  s = s.replace(/\\\(\s*([\s\S]*?)\s*\\\)/g, "$$$1$$");

  // 2. 将 LaTeX 块级括号 \[ ... \] 转换为 $$ ... $$
  s = s.replace(/\\\[\s*([\s\S]*?)\s*\\\]/g, "$$$$$1$$$$");

  // 3. 修复 OCR 扫描识别中常见的空格断裂（如 \ frac { a } { b }）
  s = s.replace(/\\\s*frac\s*\{\s*([^{}]+?)\s*\}\s*\{\s*([^{}]+?)\s*\}/gi, "\\frac{$1}{$2}");
  s = s.replace(/\\\s*sqrt\s*\{\s*([^{}]+?)\s*\}/gi, "\\sqrt{$1}");
  s = s.replace(/\\\s*sqrt\s*\[\s*([^[]]+?)\s*\]\s*\{\s*([^{}]+?)\s*\}/gi, "\\sqrt[$1]{$2}");

  // 4. 修复常见符号的 OCR 错符
  s = s.replace(/\\\s*le\b/g, "\\le");
  s = s.replace(/\\\s*ge\b/g, "\\ge");
  s = s.replace(/\\\s*pm\b/g, "\\pm");
  s = s.replace(/\\\s*times\b/g, "\\times");

  // 5. exam-zh 与中学国标正体常数、几何符号与度量单位归一化
  // 5.1 正体虚数单位 i 与自然底数 e（exam-zh 标准）
  s = s.replace(/\\(?:iu|upi)\b/g, "\\mathrm{i}");
  s = s.replace(/\\(?:eu|upe)\b/g, "\\mathrm{e}");

  // 5.2 角度符号：\ang{30} -> 30^{\circ}；\ang{30;15} -> 30^{\circ}15'；\ang{30;15;20} -> 30^{\circ}15'20''
  s = s.replace(/\\ang\{([^{}]+)\}/g, (_m, val: string) => {
    const parts = val.split(";").map((p) => p.trim());
    if (parts.length === 1) return `${parts[0]}^{\\circ}`;
    if (parts.length === 2) return `${parts[0]}^{\\circ}${parts[1]}'`;
    return `${parts[0]}^{\\circ}${parts[1]}'${parts[2]}''`;
  });

  // 5.3 摄氏度、千分号与斜分数
  s = s.replace(/\\celsius\b/g, "^{\\circ}\\mathrm{C}");
  s = s.replace(/\\(?:perthousand|textperthousand|permil)\b/g, "‰");
  s = s.replace(/\\sfrac\{([^{}]+)\}\{([^{}]+)\}/g, "\\frac{$1}{$2}");

  // 5.4 几何圆弧与平行四边形（自适应圆弧在 KaTeX 中映射为 \overset{\frown}{AB}）
  s = s.replace(/\\(?:wideparen|overparen|widearc|overarc)\{([^{}]+)\}/g, "\\overset{\\frown}{$1}");
  s = s.replace(/\\parallelogram\b/g, "▱");
  s = s.replace(/\\degree\b/g, "^{\\circ}");

  return s;
}

/**
 * 降级纯语义 HTML 公式渲染（无外部 JS 依赖，纯 CSS + Unicode）
 */
export function renderSemanticLatex(latex: string, displayMode = false): string {
  const trimmed = latex.trim();
  if (!trimmed) return "";

  let s = escapeHtml(trimmed);

  // 0. 解析矩阵与行列式：\begin{pmatrix} ... \end{pmatrix} / bmatrix / vmatrix / matrix
  s = s.replace(
    /\\begin\{(matrix|pmatrix|bmatrix|vmatrix)\}([\s\S]*?)\\end\{\1\}/g,
    (_m, kind: string, body: string) => {
      const rows = body.split(/\\\\|\n/).map((r) => r.trim()).filter(Boolean);
      const rowsHtml = rows
        .map((r) => {
          const cells = r.split(/&amp;|&/).map((c) => `<td class="lv-math-cell">${c.trim()}</td>`).join("");
          return `<tr>${cells}</tr>`;
        })
        .join("");
      return `<table class="lv-math-matrix lv-math-${kind}"><tbody>${rowsHtml}</tbody></table>`;
    },
  );

  // 0.1 解析分段函数与方程组：\begin{cases} ... \end{cases}
  s = s.replace(/\\begin\{cases\}([\s\S]*?)\\end\{cases\}/g, (_m, body: string) => {
    const rows = body.split(/\\\\|\n/).map((r) => r.trim()).filter(Boolean);
    const rowsHtml = rows
      .map((r) => `<div class="lv-math-case-row">${r.replace(/&amp;|&/g, " ")}</div>`)
      .join("");
    return `<span class="lv-math-cases">${rowsHtml}</span>`;
  });

  // 0.2 解析向量：\vec{x}
  s = s.replace(/\\vec\{([^{}]+)\}/g, '<span class="lv-math-vec"><span class="lv-math-arrow">→</span>$1</span>');

  // 0.3 解析化学方程式与化学式：\ce{...}
  s = s.replace(/\\ce\{([^{}]+)\}/g, (_m, chem: string) => {
    const c = chem
      .replace(/-&gt;|->|→/g, " → ")
      .replace(/&lt;=&gt;|<=|=>|<=>/g, " ⇌ ")
      .replace(/\^/g, "↑")
      .replace(/\s+v\b/g, " ↓")
      .replace(/\^{([^{}]+)}/g, '<sup class="lv-math-sup">$1</sup>')
      .replace(/\^([0-9+-]+)/g, '<sup class="lv-math-sup">$1</sup>')
      .replace(/([A-Za-z)\]])(\d+)/g, '$1<sub class="lv-math-sub">$2</sub>');
    return `<span class="lv-math-chem">${c}</span>`;
  });

  // 0.4 解析极限：\lim_{x \to a}
  s = s.replace(
    /\\lim_\{([^}]+)\}/g,
    '<span class="lv-math-lim"><span class="lv-math-lim-op">lim</span><sub class="lv-math-lim-sub">$1</sub></span>',
  );

  // 0.5 解析圆弧标注：\overset{\frown}{AB} 与 \wideparen{AB}
  s = s.replace(
    /(?:\\overset\{\\frown\}\{([^{}]+)\}|\\(?:wideparen|overparen|widearc|overarc)\{([^{}]+)\})/g,
    (_m, g1: string, g2: string) => {
      const target = g1 || g2;
      return `<span class="lv-math-arc"><span class="lv-math-arc-sym">⌒</span><span class="lv-math-arc-body">${target}</span></span>`;
    },
  );

  // 0.6 解析斜分数：\sfrac{a}{b}
  s = s.replace(
    /\\sfrac\{([^{}]+)\}\{([^{}]+)\}/g,
    '<span class="lv-math-frac lv-math-sfrac"><span class="lv-math-num">$1</span>/<span class="lv-math-denom">$2</span></span>',
  );

  // 0.7 解析角度：\ang{30} 或 \ang{30;15;20}
  s = s.replace(/\\ang\{([^{}]+)\}/g, (_m, val: string) => {
    const parts = val.split(";").map((p) => p.trim());
    if (parts.length === 1) return `${parts[0]}°`;
    if (parts.length === 2) return `${parts[0]}°${parts[1]}'`;
    return `${parts[0]}°${parts[1]}'${parts[2]}''`;
  });

  // 0.8 解析正体字与文本块：\mathrm{...}、\text{...}
  s = s.replace(/\\(?:mathrm|text)\{([^{}]+)\}/g, "$1");

  // 1. 解析分式 \frac{A}{B}
  s = s.replace(
    /\\frac\{([^{}]+)\}\{([^{}]+)\}/g,
    '<span class="lv-math-frac"><span class="lv-math-num">$1</span><span class="lv-math-denom">$2</span></span>',
  );

  // 2. 解析根号 \sqrt{X} 与 \sqrt[n]{X}
  s = s.replace(
    /\\sqrt\[([^[\]]+)\]\{([^{}]+)\}/g,
    '<span class="lv-math-sqrt"><sup class="lv-math-root">$1</sup><span class="lv-math-radical">√</span><span class="lv-math-radicand">$2</span></span>',
  );
  s = s.replace(
    /\\sqrt\{([^{}]+)\}/g,
    '<span class="lv-math-sqrt"><span class="lv-math-radical">√</span><span class="lv-math-radicand">$1</span></span>',
  );

  // 3. 替换常见 LaTeX 符号与希腊字母
  s = s.replace(/\\([a-zA-Z]+)/g, (match, sym: string) => {
    return LATEX_SYMBOLS_MAP[sym] ?? match;
  });

  // 4. 解析上标与下标：^{...} 或 ^x，_{...} 或 _x
  s = s.replace(/\^{([^{}]+)}/g, '<sup class="lv-math-sup">$1</sup>');
  s = s.replace(/\^([0-9a-zA-Z+-]+)/g, '<sup class="lv-math-sup">$1</sup>');
  s = s.replace(/_{([^{}]+)}/g, '<sub class="lv-math-sub">$1</sub>');
  s = s.replace(/_([0-9a-zA-Z+-]+)/g, '<sub class="lv-math-sub">$1</sub>');

  // 5. 移除多余的花括号与斜杠残留
  s = s.replace(/[{}]/g, "");

  const modeClass = displayMode ? "lv-math-block" : "lv-math-inline";
  return `<span class="lv-math-expr ${modeClass}" data-latex="${escapeHtml(trimmed)}">${s}</span>`;
}

/**
 * 单个 LaTeX 公式渲染（优先探测宿主全局 KaTeX，无环境时降级为语义 HTML）
 */
export function renderLatex(latex: string, displayMode = false): string {
  const cleaned = latex.trim();
  if (!cleaned) return "";

  // 优先探测宿主全局 window.katex
  if (typeof window !== "undefined") {
    const globalKatex = (window as unknown as { katex?: { renderToString?: (tex: string, opts?: unknown) => string } }).katex;
    if (globalKatex && typeof globalKatex.renderToString === "function") {
      try {
        return globalKatex.renderToString(cleaned, {
          displayMode,
          throwOnError: false,
        });
      } catch {
        // 捕获异常并降级
      }
    }
  }

  return renderSemanticLatex(cleaned, displayMode);
}

/**
 * 文本内数学公式全量解析与渲染（自动识别 $$...$$ 与 $...$ 并安全替换）
 */
export function renderMathInText(text: string): string {
  if (!text) return "";

  // 若不含 $ 或 \( 或 \[，直接纯文本转义返回
  if (!text.includes("$") && !text.includes("\\(") && !text.includes("\\[")) {
    return escapeHtml(text);
  }

  // 先统一归一化语法
  const normalized = normalizeLatexFormula(text);

  // 分块解析：优先提取块级公式 $$...$$，再提取单行且两端非空白的行内公式 $...$
  const chunks: Array<{ type: "text" | "blockMath" | "inlineMath"; content: string }> = [];

  // 正则：块级公式支持跨行，行内公式严格限定在单行且紧贴非空白字符，避免跨行吞噬或误吞美元价格符号
  const MATH_PATTERN = /(\$\$[\s\S]*?\$\$|\$(?!\s)(?:[^$\r\n]+?)(?<!\s)\$)/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = MATH_PATTERN.exec(normalized)) !== null) {
    const matchStart = match.index;
    const matchStr = match[0];

    if (matchStart > lastIndex) {
      chunks.push({
        type: "text",
        content: normalized.slice(lastIndex, matchStart),
      });
    }

    if (matchStr.startsWith("$$") && matchStr.endsWith("$$") && matchStr.length >= 4) {
      chunks.push({
        type: "blockMath",
        content: matchStr.slice(2, -2),
      });
    } else if (matchStr.startsWith("$") && matchStr.endsWith("$") && matchStr.length >= 2) {
      chunks.push({
        type: "inlineMath",
        content: matchStr.slice(1, -1),
      });
    } else {
      chunks.push({
        type: "text",
        content: matchStr,
      });
    }

    lastIndex = matchStart + matchStr.length;
  }

  if (lastIndex < normalized.length) {
    chunks.push({
      type: "text",
      content: normalized.slice(lastIndex),
    });
  }

  return chunks
    .map((chunk) => {
      if (chunk.type === "blockMath") {
        return `<div class="lv-math-block-wrap">${renderLatex(chunk.content, true)}</div>`;
      }
      if (chunk.type === "inlineMath") {
        return renderLatex(chunk.content, false);
      }
      return escapeHtml(chunk.content);
    })
    .join("");
}

/**
 * 针对 A4 双栏试卷打印与导出的标准数学公式 CSS 样式
 */
export function getMathPrintStyles(): string {
  return `
/* === 出版级数学公式排版样式（双栏防折行与高精微调） === */
.lv-math-expr {
  font-family: KaTeX_Main, "Times New Roman", "Cambria Math", serif;
  font-style: normal;
  display: inline-block;
  white-space: nowrap;
  vertical-align: middle;
  line-height: 1.2;
}
.lv-math-inline {
  margin: 0 2px;
}
.lv-math-block-wrap {
  text-align: center;
  margin: 6px 0;
  overflow-x: auto;
  white-space: nowrap;
}
.lv-math-block {
  display: inline-block;
}
.lv-math-frac {
  display: inline-flex;
  flex-direction: column;
  vertical-align: middle;
  text-align: center;
  font-size: 0.9em;
  padding: 0 1px;
}
.lv-math-num {
  border-bottom: 1px solid currentColor;
  padding: 0 2px 1px;
  line-height: 1.1;
}
.lv-math-denom {
  padding: 1px 2px 0;
  line-height: 1.1;
}
.lv-math-sqrt {
  display: inline-flex;
  align-items: center;
  vertical-align: middle;
}
.lv-math-root {
  font-size: 0.65em;
  vertical-align: super;
  margin-right: -2px;
}
.lv-math-radical {
  font-size: 1.1em;
  line-height: 1;
}
.lv-math-radicand {
  border-top: 1px solid currentColor;
  padding: 0 2px;
  margin-left: -1px;
}
.lv-math-sup {
  font-size: 0.75em;
  vertical-align: super;
  line-height: 0;
}
.lv-math-sub {
  font-size: 0.75em;
  vertical-align: sub;
  line-height: 0;
}
.lv-math-matrix {
  display: inline-table;
  vertical-align: middle;
  border-collapse: collapse;
  margin: 0 4px;
}
.lv-math-matrix td {
  padding: 1px 6px;
  text-align: center;
}
.lv-math-pmatrix {
  border-left: 1.5px solid currentColor;
  border-right: 1.5px solid currentColor;
  border-radius: 4px;
}
.lv-math-bmatrix {
  border-left: 2px solid currentColor;
  border-right: 2px solid currentColor;
}
.lv-math-vmatrix {
  border-left: 1px solid currentColor;
  border-right: 1px solid currentColor;
}
.lv-math-cases {
  display: inline-flex;
  flex-direction: column;
  vertical-align: middle;
  border-left: 2px solid currentColor;
  padding-left: 6px;
  margin: 0 4px;
  font-size: 0.9em;
}
.lv-math-case-row {
  line-height: 1.4;
}
.lv-math-vec {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  vertical-align: middle;
  line-height: 1;
}
.lv-math-arrow {
  font-size: 0.7em;
  line-height: 0.7;
}
.lv-math-chem {
  display: inline;
  font-family: inherit;
  font-style: normal;
}
.lv-math-lim {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  vertical-align: middle;
  line-height: 1;
  margin: 0 2px;
}
.lv-math-lim-op {
  font-style: normal;
  font-family: serif;
}
.lv-math-lim-sub {
  font-size: 0.7em;
  line-height: 1;
  vertical-align: baseline;
}
.lv-math-arc {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  vertical-align: middle;
  line-height: 0.9;
  margin: 0 1px;
}
.lv-math-arc-sym {
  font-size: 0.9em;
  line-height: 0.6;
}
.lv-math-arc-body {
  line-height: 1.1;
}
.lv-math-sfrac {
  display: inline-flex;
  flex-direction: row;
  align-items: center;
  font-size: 0.95em;
  padding: 0 1px;
}
`;
}
