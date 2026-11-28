/**
 * Markdown 试卷与文档批量试题解析器
 * 职责：
 * 将用户笔记文档或复制的整份 Markdown 试卷（含多道单选、多选、判断、填空、简答）
 * 自动切分为多道题目，提取题型、题干、选项列表、答案、解析与考点，
 * 输出统一的 ImportReport。
 */

import type { Question } from "../core/types";
import { newBatchId, newQuestionId } from "../core/ids";
import { questionHash } from "../core/answer";
import type { ImportOptions, ImportReport, ImportError } from "./types";
import { validate } from "./validator";
import { parseOcrQuestionText } from "../core/ocr";
import { isBoldSectionHeadingLine, lintQuestion } from "../core/questionLinter";

/**
 * 探测文本是否符合 Markdown 试卷/笔记试题特征
 */
export function isMarkdownExamText(text: string): boolean {
  if (!text || text.length < 10) return false;
  // 包含典型的答案标签：【答案】或 答案：或 参考答案 或 ANSWER: 或 答：
  const hasAnswerTag = /(?:【(?:参考)?答案】|^(?:参考)?答案\s*[:：]|^ANSWER\s*[:：]|【答】|^答\s*[:：])/mi.test(text);
  // 包含题号开头：如 "1."、"1、"、"1)"、"**1.**"、"**(1)**"、"第1题"、"【例1】"、"### 1."
  const hasQuestionNumber = /^\s*(?:[-*+]\s+)?(?:#{1,6}\s+)?(?:\*\*\s*)?(?:第?\s*\d+\s*[.、题:：)）]|【(?:例题?|试题)?\s*\d+】|[（(]\d+[)）]\s*\*\*)/m.test(text);
  // 包含选项标号
  const hasOptions = /^[A-D][.、\s]|^[（(][A-D][)）]/m.test(text);

  return (hasAnswerTag && (hasQuestionNumber || hasOptions)) || (hasQuestionNumber && hasOptions);
}

/**
 * 试卷文本分切为单题原始文本块
 */
export function splitMarkdownExamBlocks(text: string): Array<{ blockText: string; startLine: number; sectionKp?: string }> {
  const lines = text.split(/\r?\n/);
  const blocks: Array<{ blockText: string; startLine: number; sectionKp?: string }> = [];

  let currentLines: string[] = [];
  let blockStartLine = 1;
  let currentSectionKp = "";
  let inCodeFence = false;

  // 若正文存在 N. / **N.** / N、 / 第N题 / 【例N】等主题号，则不把子问 (1)/(2) 误当成独立大题
  const hasMajorDotNumbering = /^\s*(?:[-*+]\s+)?(?:#{1,6}\s+)?(?:\*\*\s*)?(?:\d+(?:\.(?!\d)|[、)）])|第\s*\d+\s*题|【(?:例题?|试题)?\s*\d+】)/m.test(text);
  // 匹配题号开始标记：如 "1."、"2、"、"1)"、"第3题"、"【例1】"、"### 1."、"- 1."、"**1.**"、"**(1)**"
  const QUESTION_START_REGEX = hasMajorDotNumbering
    ? /^\s*(?:[-*+]\s+)?(?:#{1,6}\s+)?(?:\*\*\s*(?:[（(]\d+[)）]|\d+(?:\.(?!\d)|[、)）])|第\s*\d+\s*题|【(?:例题?|试题|单选|多选|判断|填空|简答|材料)?\s*\d+】)\s*\*\*|(?:\*\*\s*)?(?:\d+(?:\.(?!\d)|[、)）])|第\s*\d+\s*题[:：]?|【(?:例题?|试题|单选|多选|判断|填空|简答|材料)?\s*\d+】))/
    : /^\s*(?:[-*+]\s+)?(?:#{1,6}\s+)?(?:\*\*\s*)?(?:第?\s*\d+\s*(?:\.(?!\d)|[、题:：)）])|【(?:例题?|试题|单选|多选|判断|填空|简答|材料)?\s*\d+】|[（(]\d+[)）])/;

  const isValidBlock = (blockLines: string[]) => {
    const firstNonEmpty = blockLines.find((l) => l.trim())?.trim() || "";
    return (
      QUESTION_START_REGEX.test(firstNonEmpty) ||
      blockLines.some((l) => /^[A-D][.、\s]|(?:【(?:参考)?答案】|^(?:参考)?答案\s*[:：])/m.test(l.trim()))
    );
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    const lineNo = i + 1;

    // 代码块围栏状态切换：在代码块内部不触发题号切题或章节标题
    if (trimmed.startsWith("```")) {
      inCodeFence = !inCodeFence;
      if (currentLines.length === 0) blockStartLine = lineNo;
      currentLines.push(line);
      continue;
    }

    if (inCodeFence) {
      if (currentLines.length === 0) blockStartLine = lineNo;
      currentLines.push(line);
      continue;
    }

    // 检查是否为 Markdown 标题行或独立粗体知识点小节行（如 "##### 第 2 课时"、"**知识点 1 算术平均数**"）
    const headingMatch = line.match(/^\s*#+\s*(.*)$/);
    const isBoldSec = !headingMatch && isBoldSectionHeadingLine(trimmed);
    if (headingMatch || isBoldSec) {
      if (currentLines.length > 0 && isValidBlock(currentLines)) {
        blocks.push({
          blockText: currentLines.join("\n").trim(),
          startLine: blockStartLine,
          sectionKp: currentSectionKp || undefined,
        });
      }
      currentLines = [];

      const headingText = (headingMatch ? headingMatch[1] : trimmed.replace(/^\*\*|\*\*$/g, "")).trim();
      const cleanKp = headingText.replace(/^[一二三四五六七八九十\d]+[、. ]\s*/, "").trim();
      if (cleanKp && !cleanKp.includes("试卷") && !cleanKp.includes("模拟") && !cleanKp.includes("真题")) {
        currentSectionKp = cleanKp;
      }
      continue;
    }

    const isQStart = QUESTION_START_REGEX.test(trimmed);

    if (isQStart && currentLines.length > 0) {
      if (isValidBlock(currentLines)) {
        blocks.push({
          blockText: currentLines.join("\n").trim(),
          startLine: blockStartLine,
          sectionKp: currentSectionKp || undefined,
        });
      }
      currentLines = [line];
      blockStartLine = lineNo;
    } else {
      if (currentLines.length === 0 && !trimmed) {
        continue;
      }
      if (currentLines.length === 0) {
        blockStartLine = lineNo;
      }
      currentLines.push(line);
    }
  }

  if (currentLines.length > 0 && currentLines.join("\n").trim()) {
    if (isValidBlock(currentLines)) {
      blocks.push({
        blockText: currentLines.join("\n").trim(),
        startLine: blockStartLine,
        sectionKp: currentSectionKp || undefined,
      });
    }
  }

  // 兜底：如果没按题号切出来（可能只有一道无题号题或按双换行分隔）
  if (blocks.length === 0) {
    const rawBlankBlocks = text.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
    if (rawBlankBlocks.length > 0) {
      return rawBlankBlocks.map((b, idx) => ({
        blockText: b,
        startLine: idx * 5 + 1,
        sectionKp: currentSectionKp || undefined,
      }));
    }
  }

  return blocks;
}

/**
 * Markdown 试卷批量解析入口（与 parseAiken/parseGift 同输出 ImportReport）
 */
export function parseMarkdownExam(text: string, opt: ImportOptions = {}): ImportReport {
  const errors: ImportError[] = [];
  const ok: Question[] = [];
  const seenHash = new Set(opt.existingHashes);
  const dedupe = opt.dedupe !== false;
  let duplicates = 0;
  const dupeSamples: { row: number; stem: string }[] = [];
  const batch = newBatchId();

  const blocks = splitMarkdownExamBlocks(text);

  if (!blocks.length) {
    return {
      ok: [],
      errors: [{ row: 1, reason: "未检测到有效的试题内容", raw: text.slice(0, 100) }],
      duplicates: 0,
      batch,
      dupeSamples: [],
    };
  }

  for (let bi = 0; bi < blocks.length; bi++) {
    const { blockText, startLine, sectionKp } = blocks[bi];
    try {
      const parsed = parseOcrQuestionText(blockText, {
        fallbackKp: sectionKp,
        normalizeFormulas: true,
      });

      if (!parsed.stem) {
        throw new Error("未能解析出有效题干");
      }

      const missingAnswer = !String(parsed.answer ?? "").trim();

      const q: Question = {
        id: newQuestionId(),
        type: parsed.type,
        stem: parsed.stem,
        options: parsed.options,
        answer: parsed.answer || "",
        analysis: parsed.analysis || undefined,
        kp: parsed.kp || sectionKp || undefined,
        source: opt.source || "Markdown文档导入",
        difficulty: parsed.difficulty ?? (parsed.type === "multiple" ? 4 : parsed.type === "short" ? 4 : 3),
        score: 1,
        batch,
        origin: "imported",
        ...(missingAnswer ? { status: "draft" as const } : {}),
        hash: questionHash(parsed.stem, parsed.options),
      };

      const bad = validate(q);
      if (bad) throw new Error(bad);

      if (missingAnswer) {
        const lint = lintQuestion(q);
        q.confidence = Math.round(lint.score) / 100;
        const issues = lint.issues.map((item) => item.message);
        if (!issues.some((m) => m.includes("待补答案"))) {
          issues.unshift("待补答案 / 可在审校或题库补全");
        }
        q.lintIssues = issues;
      }

      if (dedupe && seenHash.has(q.hash)) {
        duplicates++;
        if (dupeSamples.length < 5) {
          dupeSamples.push({ row: startLine, stem: q.stem });
        }
        continue;
      }

      seenHash.add(q.hash);
      ok.push(q);
    } catch (e) {
      errors.push({
        row: startLine,
        reason: (e as Error).message,
        raw: blockText.slice(0, 120),
      });
    }
  }

  return { ok, errors, duplicates, batch, dupeSamples };
}
