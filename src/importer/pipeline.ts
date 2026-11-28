// ============================================================
// 导入管线：解析 → 规范化 → 逐题校验 → 去重 → 报告（绝不整批失败）
// 纯函数无 IO —— renderer 传文件内容，测试传 fixture
// ============================================================
import type { Question } from "../core/types";
import { normalizeAnswer } from "../core/answer";
import { newBatchId } from "../core/ids";
import type { ImportOptions, ImportError, ImportReport } from "./types";
import { validate } from "./validator";
import { build } from "./tabular";

export type {
  DuplicateStrategy,
  ImportOptions,
  ImportError,
  ImportReport,
  ImportCheckpoint,
  ExcelColumnMap,
} from "./types";
export { buildImportCheckpoint } from "./types";
export { validate } from "./validator";
export {
  TYPE_ALIASES,
  parseType,
  parseExcelRows,
  autoMapExcel,
} from "./tabular";

/** Aiken 解析：题干（可多行）；`A. `/`A) `选项；`ANSWER: X`；空行分题；`// ` 注释；`KP: ` 考点 */
export function parseAiken(text: string, opt: ImportOptions = {}): ImportReport {
  const errors: ImportError[] = [];
  const ok: Question[] = [];
  const seenHash = new Set(opt.existingHashes);
  const dedupe = opt.dedupe !== false;
  let duplicates = 0;
  const batch = newBatchId();

  const lines = text.split(/\r?\n/);
  const blocks: { rows: string[]; start: number }[] = [];
  let cur: { rows: string[]; start: number } | null = null;
  lines.forEach((line, i) => {
    if (!line.trim()) {
      if (cur) {
        blocks.push(cur);
        cur = null;
      }
      return;
    }
    if (!cur) cur = { rows: [], start: i + 1 };
    cur.rows.push(line);
  });
  if (cur) blocks.push(cur);

  for (const block of blocks) {
    const body = block.rows.filter((l) => !/^\s*\/\//.test(l));
    const kpLine = body.find((l) => /^KP\s*:/i.test(l));
    const ansLine = [...body].reverse().find((l) => /^ANSWER\s*:/i.test(l));
    const optLines = body.filter((l) => /^[A-J][.)]\s/.test(l));
    const stemLines = body.filter((l) => l !== ansLine && !/^[A-J][.)]\s/.test(l) && !/^KP\s*:/i.test(l) && l.trim());
    try {
      if (!stemLines.length) throw new Error("题干为空");
      if (!ansLine) throw new Error("缺少 ANSWER 行");
      if (optLines.length < 2) throw new Error("选项不足 2 个");
      const answer = normalizeAnswer("single", ansLine.replace(/^ANSWER\s*:\s*/i, ""));
      if (!answer) throw new Error("答案格式无法识别");
      const options = optLines.map((l) => l.replace(/^[A-J][.)]\s*/, ""));
      const idx = answer.charCodeAt(0) - 65;
      if (idx >= options.length) throw new Error(`答案 ${answer} 超出选项范围`);
      const q = build(
        {
          type: "single",
          stem: stemLines.join("\n"),
          options,
          answer,
          analysis: "",
          kp: kpLine ? kpLine.replace(/^KP\s*:\s*/i, "").trim() : "",
        },
        opt,
      );
      const bad = validate(q);
      if (bad) throw new Error(bad);
      if (dedupe && seenHash.has(q.hash)) duplicates++;
      else {
        seenHash.add(q.hash);
        ok.push(q);
      }
    } catch (e) {
      errors.push({ row: block.start, reason: (e as Error).message, raw: block.rows.join(" / ").slice(0, 120) });
    }
  }
  return { ok, errors, duplicates, batch };
}

/** 粘贴文本按内容特征分流：GIFT（::题::/答案区）→ TSV（#头/制表符/两列问答）→ 整卷试卷（含大题/答案区）→ Markdown试卷（【答案】/题号）→ Aiken（默认）。
 *  gift/tsv/markdownExam/examSegmenter 动态加载：复用本模块的 parseExcelRows/validate，静态依赖会成环 */
export async function parseText(text: string, opt: ImportOptions = {}): Promise<ImportReport> {
  if (isGiftText(text)) {
    const { parseGift } = await import("./gift");
    return parseGift(text, opt);
  }
  if (isTsvText(text)) {
    const { parseTsv } = await import("./tsv");
    return parseTsv(text, opt);
  }
  if (isFullExamPaperText(text)) {
    const { segmentExamPaper } = await import("./examSegmenter");
    const res = segmentExamPaper(text, {
      source: opt.source,
      defaultKp: opt.kp,
    });
    return convertSegmentedToReport(res.questions, opt);
  }
  const { isMarkdownExamText, parseMarkdownExam } = await import("./markdownExam");
  if (isMarkdownExamText(text)) {
    return parseMarkdownExam(text, opt);
  }
  return parseAiken(text, opt);
}

/** 试卷整卷特征探测：含大题章节标题（如“一、单项选择题”）或文末集中参考答案专区 */
export function isFullExamPaperText(text: string): boolean {
  if (!text || text.length < 20) return false;
  const hasSection = /^[#\s]*(?:第[一二三四五六七八九十]+部分|[一二三四五六七八九十]+[、.\s]+).*(?:单选|多选|选择|填空|判断|解答|综合|计算)/m.test(text);
  const hasAnswerZone = /^[#\s]*(?:【?(?:参考答案(?:与解析)?|答案与(?:详细)?解析|试卷答案|试题参考答案)】?)/m.test(text);
  return hasSection || hasAnswerZone;
}

/** 将整卷智能切题结果转换为标准 ImportReport */
export function convertSegmentedToReport(questions: Question[], opt: ImportOptions = {}): ImportReport {
  const errors: ImportError[] = [];
  const ok: Question[] = [];
  const seenHash = new Set(opt.existingHashes);
  const dedupe = opt.dedupe !== false;
  let duplicates = 0;
  const dupeSamples: { row: number; stem: string }[] = [];
  const batch = newBatchId();

  for (let i = 0; i < questions.length; i++) {
    const q = { ...questions[i], batch };
    const bad = validate(q);
    if (bad) {
      errors.push({ row: i + 1, reason: bad, raw: q.stem.slice(0, 80) });
      continue;
    }
    if (dedupe && seenHash.has(q.hash)) {
      duplicates++;
      if (dupeSamples.length < 5) dupeSamples.push({ row: i + 1, stem: q.stem });
      continue;
    }
    seenHash.add(q.hash);
    ok.push(q);
  }

  return { ok, errors, duplicates, batch, dupeSamples };
}

/** GIFT 特征：::标题:: 前缀，或 {…} 答案区配 =/~ 正误标记 */
function isGiftText(text: string): boolean {
  if (/^\s*::[^:]+::/m.test(text)) return true;
  const zone = text.match(/\{([^}]*)\}/);
  return !!zone && (zone[1].includes("=") || zone[1].includes("~"));
}

/** TSV 特征：Anki # 文件头，或 ≥半数非空行含制表符（单行多列≥3 列也认） */
function isTsvText(text: string): boolean {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return false;
  if (lines.some((l) => /^#\w+:/.test(l.trim()))) return true;
  const withTab = lines.filter((l) => l.includes("\t")).length;
  if (withTab / lines.length >= 0.5) return true;
  return withTab > 0 && lines.some((l) => l.split("\t").length >= 3);
}

/** 按行号提取 Aiken 题块原文（文本路径单行修复用；行号与 parseAiken 的 block.start 同一 1-based 口径） */
export function extractAikenBlockAt(text: string, lineNo: number): string | null {
  const lines = text.split(/\r?\n/);
  let start = 0;
  let rows: string[] = [];
  for (let i = 0; i <= lines.length; i++) {
    const blank = i === lines.length || !lines[i].trim();
    if (!blank) {
      if (!rows.length) start = i + 1;
      rows.push(lines[i]);
    } else if (rows.length) {
      if (lineNo >= start && lineNo < start + rows.length) return rows.join("\n");
      rows = [];
    }
  }
  return null;
}

/** 文本路径单行修复：按「产生该错误的解析器」口径提取原文（兜底审计：
 *  Aiken 行号 / TSV 数据行 / GIFT 块序三种行号口径不同，盲取会修错块） */
export async function extractTextRowAt(text: string, row: number): Promise<string | null> {
  if (parseAiken(text).errors.some((e) => e.row === row)) return extractAikenBlockAt(text, row);
  const { parseTsv } = await import("./tsv");
  if (isTsvText(text) && parseTsv(text).errors.some((e) => e.row === row)) {
    const dataLines = text.split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith("#"));
    // 表头模式（dataLines[0]=表头，行号=i+2）与两列问答（行号=i+1）统一为 dataLines[row-1]
    return dataLines[row - 1] ?? null;
  }
  const { parseGift } = await import("./gift");
  if (parseGift(text).errors.some((e) => e.row === row)) {
    const blocks = text.split(/\n\s*\n/).map((b) => b.replace(/\r/g, "").trim()).filter(Boolean);
    return blocks[row - 1] ?? null;
  }
  return null;
}

/** 错误清单导出 CSV（BOM 头保证 Excel 中文不乱码） */
export function errorsToCsv(errors: ImportError[]): string {
  const esc = (raw: string) => {
    let s = String(raw ?? "");
    if (/^[=+\-@\t\r]/.test(s) && !/^-\d+(?:\.\d+)?$/.test(s)) {
      s = "'" + s;
    }
    return `"${s.replace(/"/g, '""')}"`;
  };
  const head = "行号,原因,原值";
  const body = errors.map((e) => [e.row, esc(e.reason), esc(e.raw)].join(","));
  return "\uFEFF" + [head, ...body].join("\r\n");
}
