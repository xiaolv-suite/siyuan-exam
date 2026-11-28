/**
 * 从思源笔记文档直接提取试题导入引擎 (SiYuan Doc Question Importer)
 * 职责：
 * 1. 预处理思源笔记导出的 Kramdown/Markdown 原文（清洗 IAL 块属性、折叠块、挖空等）；
 * 2. 自动通过内容特征分流送入 Aiken/TSV/GIFT/MarkdownExam 解析管线；
 * 3. 自动为提取出的题目注入文档来源元数据（docId、文档标题、hpath），实现题面与思源原生笔记溯源关联；
 * 4. 纯函数与轻量解析层，支持无头测试。
 */

import type { ImportOptions, ImportReport } from "../importer/pipeline";
import { parseText } from "../importer/pipeline";
import { newBatchId, newQuestionId } from "./ids";
import type { Question, QuestionType } from "./types";
import { makeQuestion, parseIal, questionFromBlock, stripInlineKramdownIal } from "./blockTemplate";
import { OPTION_LETTERS, questionHash } from "./answer";
import { lintQuestion, autoFixQuestion, hasBlankPlaceholder, stripQuestionNumberPrefix, isBoldSectionHeadingLine } from "./questionLinter";
import { safeDocTitleFromHPath } from "../libs/lv-notice-kit";

export type DocImportProfile = "all" | "paper" | "notes" | "cloze" | "table";

export interface SiyuanImportOptions extends ImportOptions {
  profile?: DocImportProfile;
  /** 巨型长文档分片切题进度回调 (ECO-01 / TODO-05) */
  onProgress?: (p: { processed: number; total: number; percent: number }) => void;
}

export interface SiyuanDocMeta {
  docId: string;
  title: string;
  hpath?: string;
  notebookId?: string;
}

function maskDocProtectedSpans(text: string): { masked: string; restore: (s: string) => string } {
  const spans: string[] = [];
  const tokenOf = (raw: string) => {
    const idx = spans.length;
    spans.push(raw);
    return `@@DOCMASK_${idx}@@`;
  };
  let masked = text;
  masked = masked.replace(/```[\s\S]*?```/g, tokenOf);
  masked = masked.replace(/`[^`\n\r]+?`/g, tokenOf);
  masked = masked.replace(/\$\$[\s\S]*?\$\$/g, tokenOf);
  masked = masked.replace(/\\\[[\s\S]*?\\\]/g, tokenOf);
  masked = masked.replace(/!\[[^\]]*\]\([^)]*\)/g, tokenOf);
  masked = masked.replace(/(?<!\\)\$[^$\n\r]+?\$/g, tokenOf);
  masked = masked.replace(/\\\([^\n\r]+?\\\)/g, tokenOf);
  const restore = (s: string): string =>
    s.replace(/@@DOCMASK_(\d+)@@/g, (_m, i: string) => spans[Number(i)] ?? _m);
  return { masked, restore };
}

/**
 * 预处理思源笔记文档 Markdown 文本（完全只读，不修改原笔记）：
 * 1. 剥离思源专有的 IAL 属性段 `{: id="xxx" ...}`，避免干扰题干解析；
 * 2. 剥离引用块前缀 `>`，支持存放在引用块中的题面；
 * 3. 将思源折叠块 `::: details 答案 ... :::` 或 `<details><summary>答案</summary>...</details>` 标准化；
 * 4. 转换思源块引用 `((id "锚文本"))` 为易读文本；
 * 5. 转换思源双链 `[[文档|别名]]` 为纯文本别名；
 * 6. 将笔记常见问答卡 `Q:` / `A:` / `【问】` / `【答】` 映射为标准题面与答案结构。
 */
export function cleanSiyuanDocMarkdown(raw: string): string {
  if (!raw) return "";

  let s = raw;

  // 0. 剥离思源导出的 YAML Frontmatter 元数据头（--- title: xxx ---）
  s = s.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/m, "");

  // 0.1 清除思源图片节点附带的零宽空格（\u200b![](assets/...)），避免干扰边界与图像链接
  s = s.replace(/\u200b(?=!\[)/g, "").replace(/(?<=\))\u200b/g, "");

  // 1. 移除思源 IAL 块属性行与行内 IAL（例如 {: id="2026..." updated="2026..."}、表格 {: style="..."}、列表行首 IAL），先保护公式/代码块避免误伤
  s = stripInlineKramdownIal(s).replace(/^[ \t]+$/gm, "");

  // 1.1 移除思源超级块与排版标记（{{{row, {{{col, }}}），保留空行分隔防相邻块粘连
  s = s.replace(/^\{\{\{(?:row|col)?\s*$/gm, "");
  s = s.replace(/^\}\}\}\s*$/gm, "\n");

  // 1.2 剥离行首引用块标记（支持整道题写在引用块 > 里的场景，先于选项列表剥离）
  s = s.replace(/^>\s?/gm, "");

  // 1.3 剥离标题行前缀（如 ### 1. 题目 -> 1. 题目，避免题目被当成标题忽略）
  s = s.replace(/^#{1,6}\s*(?=\d+[.、])/gm, "");

  // 1.4 规范化复选框任务列表中的正确答案标记
  // 若包含 - [x] A. 选项 或 - [X] B. 选项，且原文本未带显式答案行，则提取为标准答案
  const checkedMatches = [...s.matchAll(/^[-*]\s*\[[xX]\]\s*([A-Ja-j])[.、]/gm)];
  if (checkedMatches.length > 0 && !/(?:ANSWER|【答案】|答案\s*[:：])/i.test(s)) {
    const checkedLetters = checkedMatches.map((m) => m[1].toUpperCase()).join("");
    s = s.trimEnd() + `\nANSWER: ${checkedLetters}\n`;
  }
  s = s.replace(/^[-*]\s*\[[ xX]\]\s*/gm, "");

  // 1.5 剥离无序列表选项前缀：如 "- A. 选项" 规范化为 "A. 选项"
  s = s.replace(/^[-*+]\s+([A-Ja-j][.、\s])/gm, "$1");

  // 3. 将思源常用折叠块答案转为标准提示词
  // 如 ::: details 答案与解析 ... ::: 转换为 【答案】与【解析】
  s = s.replace(/:::\s*details\s*(?:答案|解析|答案与解析)?\s*\r?\n([\s\S]*?):::/gi, (_m, body: string) => {
    return `\n【答案】\n${body.trim()}\n`;
  });

  // 4. 将 HTML <details> 折叠块转换为标准行
  s = s.replace(/<details>\s*<summary>([^<]*)<\/summary>([\s\S]*?)<\/details>/gi, (_m, summary: string, body: string) => {
    const sum = summary.trim();
    const isAns = /(?:答案|解析|详解)/.test(sum);
    if (isAns) {
      return `\n【答案】\n${body.trim()}\n`;
    } else if (sum.length > 0 && body.trim().length > 0) {
      // 折叠块 summary 是问题，body 是答案（思源自制问答折叠卡）
      return `\n${sum}\n【答案】：${body.trim()}\n`;
    }
    return `\n${sum}\n${body.trim()}\n`;
  });

  // 5. 替换思源块引用：((id "锚文本")) 替换为 锚文本；纯 ((id)) 移除
  s = s.replace(/\(\([0-9a-zA-Z-]+\s+"([^"]+)"\)\)/g, "$1");
  s = s.replace(/\(\([0-9a-zA-Z-]+\)\)/g, "");

  // 6. 替换思源双链：[[title|alias]] 替换为 alias；[[title]] 替换为 title
  s = s.replace(/\[\[([^|\]]+)\|([^\]]+)\]\]/g, "$2");
  s = s.replace(/\[\[([^\]]+)\]\]/g, "$1");

  // 7. 问答卡问答标号归一化：支持 Q: ... A: ... 与 【问】... 【答】...
  s = s.replace(/^\s*(?:Q\d*|【问\d*】)\s*[:：]\s*/gim, "");
  s = s.replace(/^\s*(?:A\d*|【答\d*】)\s*[:：]\s*/gim, "【答案】：");

  return s.trim();
}

/**
 * 概念与术语定义卡改写：**术语**：定义内容 ➔ 转换为问答结构
 * （仅用于非 paper 笔记模式，并保护公式/图片、题号、知识点小节与解法/思路等解题词）
 */
function rewriteBoldTermDefinitions(raw: string): string {
  if (!raw) return "";
  const { masked: maskedTerm, restore: restoreTerm } = maskDocProtectedSpans(raw);
  const replaced = maskedTerm.replace(
    /^\s*\*\*([^*\n\r]{2,40})\*\*\s*[:：]\s*([^\n\r]{4,})/gm,
    (full, term: string, def: string) => {
      const cleanTerm = term.trim();
      if (
        /^\d+(?:\.(?!\d)|[、)）])|^(?:知识点|考点|类型|专题|思想|模块|例题?|试题|解答|答案|解析|解法[一二三四五六七八九十\d]*|思路|分析|证明|提示|点评|小结|归纳|变式|拓展|注意|易错)/.test(
          cleanTerm,
        )
      ) {
        return full;
      }
      return `\n1. 简述 ${cleanTerm} 的概念与定义。\n【答案】：${def.trim()}\n`;
    },
  );
  return restoreTerm(replaced).trim();
}

/**
 * 提取思源文档中的标准 `{{{row` 题块（携带 custom-exam-type / exam-type IAL），
 * 完整支持单选/多选/判断/填空/简答/材料 6 种题型，图片、公式与选项零丢失。
 */
export function extractRowBlockQuestions(
  rawMarkdown: string,
  docMeta: SiyuanDocMeta,
): { questions: Question[]; remainingMarkdown: string } {
  const lines = (rawMarkdown ?? "").replace(/\r\n/g, "\n").split("\n");
  const questions: Question[] = [];
  const consumed = new Set<number>();
  let inCodeFence = false;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith("```")) {
      inCodeFence = !inCodeFence;
      continue;
    }
    if (inCodeFence) continue;
    if (trimmed !== "{{{row") continue;

    let depth = 1;
    let innerFence = false;
    let endIdx = -1;
    for (let j = i + 1; j < lines.length; j++) {
      const jt = lines[j].trim();
      if (jt.startsWith("```")) {
        innerFence = !innerFence;
        continue;
      }
      if (innerFence) continue;
      if (jt === "{{{row") depth++;
      else if (jt === "}}}") {
        depth--;
        if (depth === 0) {
          endIdx = j;
          break;
        }
      }
    }
    if (endIdx < 0) continue;

    let ialIdx = -1;
    let ialStr = "";
    if (endIdx + 1 < lines.length) {
      const nextTrimmed = lines[endIdx + 1].trim();
      if (nextTrimmed.startsWith("{:") && nextTrimmed.endsWith("}") && /^\{:\s*[a-zA-Z_][\w-]*=/.test(nextTrimmed)) {
        ialIdx = endIdx + 1;
        ialStr = nextTrimmed.slice(2, -1).trim();
      }
    }
    if (!ialStr || !/(?:custom-)?exam-type\s*=/.test(ialStr)) {
      i = endIdx;
      continue;
    }

    const parsedAttrs = parseIal(ialStr);
    if (!parsedAttrs["custom-exam-id"] && !parsedAttrs["exam-id"]) {
      parsedAttrs["custom-exam-id"] = newQuestionId();
    }
    const blockBody = lines.slice(i, endIdx + 1).join("\n");
    const q = questionFromBlock({ attrs: parsedAttrs, text: blockBody });
    if (q && q.stem.trim()) {
      q.source = q.source || docMeta.title;
      q.sourceKind = q.sourceKind || "real";
      q.kp = q.kp || docMeta.title;
      questions.push(q);
      for (let k = i; k <= (ialIdx >= 0 ? ialIdx : endIdx); k++) consumed.add(k);
    }
    i = ialIdx >= 0 ? ialIdx : endIdx;
  }

  const remainingMarkdown = lines.filter((_l, idx) => !consumed.has(idx)).join("\n");
  return { questions, remainingMarkdown };
}

/**
 * 安全分割 Markdown 表格行：保护转义 `\|`、行内代码与 LaTeX 公式内 `|`，并清洗单元格行内 IAL
 */
export function splitMarkdownTableRow(line: string): string[] {
  const trimmed = line.trim();
  const inner = trimmed.replace(/^\|/, "").replace(/((?:^|[^\\])(?:\\\\)*)\|$/, "$1");
  const { masked, restore } = maskDocProtectedSpans(inner);
  const escapedSlashToken = "@@ESCAPED_TABLE_SLASH@@";
  const escapedPipeToken = "@@ESCAPED_TABLE_PIPE@@";
  const safeMasked = masked
    .replace(/\\\\/g, escapedSlashToken)
    .replace(/\\\|/g, escapedPipeToken);
  return safeMasked.split("|").map((cell) => {
    const withPipes = cell.split(escapedPipeToken).join("|").split(escapedSlashToken).join("\\\\");
    return stripInlineKramdownIal(restore(withPipes)).trim();
  });
}

/**
 * 8. 解析思源笔记中的 Markdown 表格试题（如三列问答表、多列题库表）
 */
export function parseMarkdownTableToQuestions(
  tableText: string,
  docMeta: SiyuanDocMeta,
): Question[] {
  const lines = tableText
    .split(/\r?\n/)
    .map((l) => stripInlineKramdownIal(l).trim())
    .filter((l) => l.startsWith("|") && /(?:^|[^\\])(?:\\\\)*\|$/.test(l));
  if (lines.length < 3) return [];

  const headerCells = splitMarkdownTableRow(lines[0]).map((c) => c.toLowerCase());
  const stemIdx = headerCells.findIndex((c) =>
    /题干|题目|问题|问|question|front|stem|单词|词汇|term|概念/.test(c),
  );
  const ansIdx = headerCells.findIndex((c) =>
    /答案|答|answer|back|释义|意思|定义|definition|meaning/.test(c),
  );
  const optIndices = [...OPTION_LETTERS].map((L) => {
    const lower = L.toLowerCase();
    return headerCells.findIndex((c) => new RegExp(`选项\\s*${lower}\\b|^${lower}$`, "i").test(c));
  });
  const analysisIdx = headerCells.findIndex((c) =>
    /解析|详解|出处|例句|analysis|note|example/.test(c),
  );
  const kpIdx = headerCells.findIndex((c) =>
    /考点|知识点|章节|tag|kp|词性|科目/.test(c),
  );

  if (stemIdx < 0 || ansIdx < 0) return [];

  const isSeparator = /^\|(?:\s*:?-+:?\s*\|)+$/.test(lines[1]) || /^-+$/.test(lines[1].replace(/\|/g, "").trim());
  const startRow = isSeparator ? 2 : 1;

  const questions: Question[] = [];
  for (let i = startRow; i < lines.length; i++) {
    const row = splitMarkdownTableRow(lines[i]);
    const stem = row[stemIdx];
    const answer = row[ansIdx];
    if (!stem || !answer || /^-+$/.test(stem)) continue;

    const options: string[] = [];
    for (const optIdx of optIndices) {
      if (optIdx >= 0 && row[optIdx]) options.push(row[optIdx]);
    }

    const isJudge = /^[对错正确错误√×vVxX]$/.test(answer);
    const type: QuestionType = options.length >= 2
      ? (answer.length > 1 ? "multiple" : "single")
      : isJudge
      ? "judge"
      : hasBlankPlaceholder(stem)
      ? "fill"
      : "short";

    const q = makeQuestion({
      type,
      stem,
      options,
      answer,
      analysis: analysisIdx >= 0 ? row[analysisIdx] || undefined : undefined,
      kp: (kpIdx >= 0 && row[kpIdx]) ? row[kpIdx] : docMeta.title,
      source: docMeta.title,
    });
    q.sourceKind = "real";
    questions.push(q);
  }
  return questions;
}

/**
 * 9. 解析思源笔记中的 Markdown 极速制卡语法 (Obsidian SR & Anki 范式)
 * - 单行单向问答卡：`问题 :: 答案` 或 `概念 :: 释义`
 * - 单行双向互逆卡：`概念 ::: 释义` (生成正反两道互逆题，绑定 family.variantKind = "reverse")
 * - 多行问答卡：以单行 `?` 或 `??` (双向) 分隔的问题与答案段落
 */
export function parseInlineFlashcards(
  rawText: string,
  docMeta: SiyuanDocMeta,
): Question[] {
  if (!rawText || !rawText.trim()) return [];

  const questions: Question[] = [];
  const lines = rawText.split(/\r?\n/);

  // 1. 先扫描处理单行 :: 与 :::
  let inCodeFence = false;
  const nonInlineLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed.startsWith("```")) {
      inCodeFence = !inCodeFence;
      nonInlineLines.push(line);
      continue;
    }
    if (inCodeFence) {
      nonInlineLines.push(line);
      continue;
    }

    // 匹配双向互逆卡：概念 ::: 释义
    const revMatch = line.match(/^([^:\n\r]+?)\s*:::\s*([^:\n\r]+)$/);
    if (revMatch) {
      const term = revMatch[1].trim();
      const def = revMatch[2].trim();
      if (term && def) {
        // 正向题：给出概念，回答释义
        const q1 = makeQuestion({
          type: hasBlankPlaceholder(term) ? "fill" : "short",
          stem: `【正向考查】${term}`,
          options: [],
          answer: def,
          kp: docMeta.title,
          source: docMeta.title,
        });
        q1.sourceKind = "real";

        // 反向题：给出释义，回答概念
        const q2 = makeQuestion({
          type: hasBlankPlaceholder(def) ? "fill" : "short",
          stem: `【逆向考查】根据以下描述写出对应概念或术语：\n${def}`,
          options: [],
          answer: term,
          kp: docMeta.title,
          source: docMeta.title,
        });
        q2.sourceKind = "real";

        // 绑定兄弟题题族关联（用于 siblingBury 隔日防干扰）
        q1.family = { parentId: q1.id, variantKind: "reverse", verified: true };
        q2.family = { parentId: q1.id, variantKind: "reverse", verified: true };

        questions.push(q1, q2);
        continue;
      }
    }

    // 匹配单向问答卡：概念 :: 释义
    const singleMatch = line.match(/^([^:\n\r]+?)\s*::\s*([^:\n\r]+)$/);
    if (singleMatch) {
      const qText = singleMatch[1].trim();
      const aText = singleMatch[2].trim();
      if (qText && aText) {
        const q = makeQuestion({
          type: hasBlankPlaceholder(qText) ? "fill" : "short",
          stem: qText,
          options: [],
          answer: aText,
          kp: docMeta.title,
          source: docMeta.title,
        });
        q.sourceKind = "real";
        questions.push(q);
        continue;
      }
    }

    nonInlineLines.push(line);
  }

  // 2. 扫描多行问答卡：问题段落 \n? 或 ??\n 答案段落
  const remainingText = nonInlineLines.join("\n");
  const multiCardRegex = /((?:^[^\n\r?]+\r?\n)+)^\s*(\?{1,2})\s*$\r?\n((?:^[^\n\r?]+\r?\n?)+)/gm;
  let m: RegExpExecArray | null;
  while ((m = multiCardRegex.exec(remainingText)) !== null) {
    const qText = m[1].trim();
    const sep = m[2].trim();
    const aText = m[3].trim();
    if (qText && aText) {
      const isBi = sep === "??";
      const q1 = makeQuestion({
        type: hasBlankPlaceholder(qText) ? "fill" : "short",
        stem: qText,
        options: [],
        answer: aText,
        kp: docMeta.title,
        source: docMeta.title,
      });
      q1.sourceKind = "real";

      if (isBi) {
        const q2 = makeQuestion({
          type: hasBlankPlaceholder(aText) ? "fill" : "short",
          stem: `【逆向回忆】${aText}`,
          options: [],
          answer: qText,
          kp: docMeta.title,
          source: docMeta.title,
        });
        q2.sourceKind = "real";
        q1.family = { parentId: q1.id, variantKind: "reverse", verified: true };
        q2.family = { parentId: q1.id, variantKind: "reverse", verified: true };
        questions.push(q1, q2);
      } else {
        questions.push(q1);
      }
    }
  }

  return questions;
}

/**
 * 10. 解析思源笔记中带有末尾对错符号的自然判断题，如：
 * 质数只有两个因数。( √ )
 * 所有的偶数都是合数。( × )
 */
export function parseInlineJudgeQuestions(rawText: string, docMeta: SiyuanDocMeta): Question[] {
  const { masked, restore } = maskDocProtectedSpans(rawText ?? "");
  const lines = masked.split(/\r?\n/);
  const questions: Question[] = [];
  for (const line of lines) {
    const trimmed = line.trim().replace(/^[-*+]\s+/, "").replace(/^\d+[.、]\s*/, "");
    const m = trimmed.match(/^(.*?)[（(]\s*([√×对错vVxX正确错误TFN]+)\s*[)）]\s*$/);
    if (m && m[1].trim().length >= 4) {
      const stem = restore(m[1].trim());
      const rawAns = m[2].trim().toUpperCase();
      const answer = /[√对vVT正确]/.test(rawAns) ? "对" : "错";
      const q = makeQuestion({
        type: "judge",
        stem,
        options: [],
        answer,
        kp: docMeta.title,
        source: docMeta.title,
      });
      q.sourceKind = "real";
      questions.push(q);
    }
  }
  return questions;
}

/**
 * 11. 解析思源笔记中的标题与问答段落结构（Markdown Heading QA）：
 * ### 什么是死锁？
 * 死锁是指两个或两个以上的进程在执行过程中...
 */
export function parseHeadingQaQuestions(rawText: string, docMeta: SiyuanDocMeta): Question[] {
  const normalized = (rawText ?? "").replace(/\r\n/g, "\n");
  const sections = normalized.split(/\n+(?=#{2,6}\s+)/);
  const questions: Question[] = [];
  for (const sec of sections) {
    const trimmed = sec.trim();
    const m = trimmed.match(/^#{2,6}\s+([^\n\r]+)\r?\n+([\s\S]+)$/);
    if (!m) continue;
    const heading = m[1].trim().replace(/^\d+[.、]\s*/, "");
    const body = m[2].trim();
    if (/目录|前言|总结|大纲|参考资料|附录|试卷|考卷|题册|辨析/i.test(heading)) continue;
    if (heading.length >= 3 && body.length >= 4 && body.length <= 1500 && !body.startsWith("#")) {
      const isQuestion = /[？?]|^(?:什么是|简述|简答|解释|为什么|如何|请谈谈|请阐述)/.test(heading);
      if (isQuestion) {
        const isFill = hasBlankPlaceholder(heading);
        const q = makeQuestion({
          type: isFill ? "fill" : "short",
          stem: heading.endsWith("？") || heading.endsWith("?") ? heading : `${heading}？`,
          options: [],
          answer: body,
          kp: docMeta.title,
          source: docMeta.title,
        });
        q.sourceKind = "real";
        questions.push(q);
      }
    }
  }
  return questions;
}

/**
 * 13. 解析思源笔记中的列表项与标号概念定义卡（如 - 临界区：访问临界资源的代码段）
 */
export function parseBulletDefinitions(rawText: string, docMeta: SiyuanDocMeta): Question[] {
  const lines = (rawText ?? "").split(/\r?\n/);
  const questions: Question[] = [];
  const bulletDefRegex = /^\s*[-*+]\s+(?:【|\*\*|「|“|")?([^\s:：—\-*【「"”]{2,25})(?:】|\*\*|」|”|")?\s*(?:[:：]|——)\s*([^\n\r]{6,400})$/;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("```") || trimmed.includes("::")) continue;
    if (/[A-Fa-f][.、:：]\s+/.test(trimmed) || /答案|解析|ANSWER|KEY/i.test(trimmed)) continue;

    const m = trimmed.match(bulletDefRegex);
    if (!m) continue;

    const term = m[1].trim();
    const def = m[2].trim();

    if (/^(注意|提示|总结|比如|例如|时间|地点|人物|作者|日期|来源|备注|参考|链接)$/i.test(term)) continue;
    if (term.length >= 2 && def.length >= 6) {
      const q = makeQuestion({
        type: "short",
        stem: `简述【${term}】的概念与核心定义。`,
        options: [],
        answer: def,
        analysis: `知识点出处：《${docMeta.title}》列表概念摘录。`,
        kp: docMeta.title,
        source: docMeta.title,
      });
      q.sourceKind = "real";
      questions.push(q);
    }
  }
  return questions;
}

/**
 * 14. 解析思源笔记正文中粗体概念定义句（如 **虚拟内存**是指利用外存空间扩展物理内存的技术）
 */
export function parseBoldSentenceDefinitions(rawText: string, docMeta: SiyuanDocMeta): Question[] {
  const normalized = (rawText ?? "").replace(/\r\n/g, "\n");
  const regex = /\*\*([^*\n\r]{2,30})\*\*\s*(?:是指|是|指|即为|定义为)\s*([^。\n\r]{6,300}[。！]?)/g;
  const questions: Question[] = [];
  let m: RegExpExecArray | null;
  while ((m = regex.exec(normalized)) !== null) {
    const term = m[1].trim();
    const def = m[2].trim();
    if (/注意|提示|总结|例如|比如/.test(term)) continue;
    const q = makeQuestion({
      type: "short",
      stem: `请阐述【${term}】的定义与内涵。`,
      options: [],
      answer: `${term}是指${def}`,
      analysis: `出自《${docMeta.title}》重点概念辨析。`,
      kp: docMeta.title,
      source: docMeta.title,
    });
    q.sourceKind = "real";
    questions.push(q);
  }
  return questions;
}

/**
 * 12. 思源笔记试卷与自由笔记超级容错提取引擎 (Natural Paper & Free-form Notes Extractor)
 * 专为思源笔记优化，支持：
 * - 任意题号：1. / 1、 / (1) / 【例题1】 / 第1题
 * - 一行多选项或多行选项：A. xxx  B. yyy  C. zzz
 * - 题干内括号答案：下列说法正确的是 ( A )
 * - 各类中英文答案/解析关键字
 */
/**
 * 解析单道自然格式题目文本（单选、多选、判断、填空、简答）
 */
export function parseSingleNaturalQuestion(
  item: string,
  docMeta: SiyuanDocMeta,
  opts?: { allowUnansweredShort?: boolean; sectionKp?: string },
): Question | null {
  const trimmed = stripInlineKramdownIal(item).trim();
  if (trimmed.length < 5) return null;

  // 先保护代码块、LaTeX 公式（如 $f(x)$）与 Markdown 图片/链接（如 ![图(A)](assets/x.png)），
  // 防止括号答案与选项切分正则误伤公式和图片路径
  const { masked, restore } = maskDocProtectedSpans(trimmed);
  let body = masked;
  // 剥离块首部的文档大标题/章节标题（如 "# 第一章 练习题" 或 "## 一、单项选择题"）或独立粗体小节头
  body = body.replace(/^(?:#{1,6}\s+[^\n\r]+\r?\n+)+/, "").trim();
  const hadQuestionNum = /^(?:#{1,6}\s*)?(?:\*\*\s*)?(?:第\s*\d+\s*题|\d+(?:\.(?!\d)|[、)）])|[（(]\d+[)）]|【(?:例题?|试题|单选|多选|判断|填空|简答|材料)?\s*\d+】)/.test(body);
  // 剥离题目编号前缀（兼容 **1.**、**1、**、**(1)**、**1)**、【例1】、1. 等）
  body = stripQuestionNumberPrefix(body);

  let analysis: string | undefined;
  const analysisMatch = body.match(/(?:(?:【解析】|解析\s*[:：]|详解\s*[:：]|【详解】)\s*)([\s\S]+)$/i);
  if (analysisMatch) {
    analysis = restore(analysisMatch[1].trim());
    body = body.slice(0, analysisMatch.index).trim();
  }

  let answer = "";
  const answerMatch = body.match(/(?:(?:【答案】|答案\s*[:：]|参考答案\s*[:：]|ANSWER\s*[:：]|KEY\s*[:：])\s*)([^\n\r]+)/i);
  if (answerMatch) {
    answer = restore(answerMatch[1].replace(/["'`]/g, "").trim()).toUpperCase();
    body = body.slice(0, answerMatch.index).trim();
  }

  const stemAnsMatch = body.match(/[（(]\s*([A-Ja-j]{1,10}|[√×对错正确错误TFN]+)\s*[)）]/);
  if (!answer && stemAnsMatch) {
    const candidateAns = stemAnsMatch[1].trim().toUpperCase();
    if (/^[A-J]{1,10}$/.test(candidateAns) || /^[√×对错正确错误TFN]+$/.test(candidateAns)) {
      answer = candidateAns;
      body = body.replace(stemAnsMatch[0], "（   ）");
    }
  }

  const hasSpaceAlphaSeq = /(?:^|\n)[A-J]\s+\S+.*\s+[B-J]\s+\S+/m.test(body);
  const optSplitRegex = hasSpaceAlphaSeq
    ? /(?:^|\s+)(?:[(（]?([A-Ja-j])[)）.]|([A-Ja-j])[.、:：\s])\s*/g
    : /(?:^|\s+)(?:[(（]?([A-Ja-j])[)）.]|([A-Ja-j])[.、:：])\s+/g;
  const optPositions: Array<{ letter: string; index: number; fullLen: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = optSplitRegex.exec(body)) !== null) {
    const letter = (m[1] || m[2]).toUpperCase();
    const expectedCode = 65 + optPositions.length;
    if (letter.charCodeAt(0) === expectedCode) {
      optPositions.push({ letter, index: m.index, fullLen: m[0].length });
      if (optPositions.length >= 10) break;
    } else if (optPositions.length >= 2) {
      break;
    }
  }

  const resolvedKp = opts?.sectionKp || docMeta.title;

  if (optPositions.length >= 2 && optPositions[0].letter === "A" && optPositions[1].letter === "B") {
    const stem = restore(body.slice(0, optPositions[0].index).trim().replace(/[-*+•\s]+$/, "").trim());
    const options: string[] = [];
    for (let i = 0; i < optPositions.length; i++) {
      const start = optPositions[i].index + optPositions[i].fullLen;
      const end = i < optPositions.length - 1 ? optPositions[i + 1].index : body.length;
      options.push(restore(body.slice(start, end).trim().replace(/[-*+•\s]+$/, "").trim()));
    }

    if (stem && options.length >= 2) {
      const type: QuestionType = answer.length > 1 ? "multiple" : "single";
      const q = makeQuestion({
        type,
        stem,
        options,
        // 严禁在缺答案时静默伪造 "A"：保留缺失态交由质检与校对面板显式补充或拦截入库
        answer: answer || "",
        analysis,
        kp: resolvedKp,
        source: docMeta.title,
        ...(answer ? {} : { status: "draft" as const }),
      });
      q.sourceKind = "real";
      return q;
    }
  }

  // 判断题：若题干尾部有括号对错标记，或提取出的答案为对错符号
  const isJudgeAns = /^[√×对错vVxX正确错误TFN]+$/.test(answer);
  const judgeMatch = body.match(/^(.*?)[（(]\s*([√×对错vVxX正确错误TFN]+)\s*[)）]\s*$/);
  if (isJudgeAns || judgeMatch) {
    const rawAns = (isJudgeAns ? answer : judgeMatch![2]).trim().toUpperCase();
    const ans = /[√对vVT正确]/.test(rawAns) ? "对" : "错";
    let stem = judgeMatch ? judgeMatch[1].trim() : body.replace(/（\s*）|[（(]\s*[)）]/g, "").trim();
    stem = restore(stem.replace(/^[.、\s]+|[.、\s]+$/g, ""));
    if (stem.length >= 2) {
      const q = makeQuestion({
        type: "judge",
        stem,
        options: [],
        answer: ans,
        analysis,
        kp: resolvedKp,
        source: docMeta.title,
      });
      q.sourceKind = "real";
      return q;
    }
  }

  const restoredBody = restore(body);
  const isFill = hasBlankPlaceholder(restoredBody);
  const type: QuestionType = isFill ? "fill" : "short";
  if (isFill || (answer && restoredBody.length < 4000) || ((opts?.allowUnansweredShort || hadQuestionNum) && restoredBody.length >= 6 && restoredBody.length < 4000)) {
    const q = makeQuestion({
      type,
      stem: restoredBody,
      options: [],
      answer: answer || "",
      analysis,
      kp: resolvedKp,
      source: docMeta.title,
      ...(answer ? {} : { status: "draft" as const }),
    });
    q.sourceKind = "real";
    return q;
  }

  return null;
}

interface NaturalPaperChunk {
  text: string;
  sectionKp?: string;
  explicitQuestion: boolean;
}

function splitNaturalPaperChunks(rawText: string): NaturalPaperChunk[] {
  const normalized = (rawText ?? "").replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  const hasMajorDotNumbering = /^\s*(?:#{1,6}\s*)?(?:\*\*\s*)?(?:\d+(?:\.(?!\d)|[、)）])|第\s*\d+\s*题|【(?:例题?|试题|单选|多选|判断|填空|简答|材料)?\s*\d+】)/m.test(normalized);
  const qStartRe = hasMajorDotNumbering
    ? /^(?:#{1,6}\s*)?(?:\*\*\s*(?:[（(]\d+[)）]|\d+(?:\.(?!\d)|[、)）])|第\s*\d+\s*题|【(?:例题?|试题|单选|多选|判断|填空|简答|材料)?\s*\d+】)\s*\*\*|(?:\*\*\s*)?(?:\d+(?:\.(?!\d)|[、)）])|第\s*\d+\s*题[:：]?|【(?:例题?|试题|单选|多选|判断|填空|简答|材料)?\s*\d+】))/
    : /^(?:#{1,6}\s*)?(?:\*\*\s*)?(?:\d+(?:\.(?!\d)|[、)）])|[（(]\d+[)）]|第\s*\d+\s*题[:：]?|【(?:例题?|试题|单选|多选|判断|填空|简答|材料)?\s*\d+】)/;

  const chunks: NaturalPaperChunk[] = [];
  let currentLines: string[] = [];
  let currentExplicit = false;
  let currentKp = "";
  let inCodeFence = false;

  const flush = () => {
    const text = currentLines.join("\n").trim();
    if (text && currentExplicit) {
      chunks.push({ text, sectionKp: currentKp || undefined, explicitQuestion: true });
    } else if (text && chunks.length === 0 && !hasMajorDotNumbering) {
      // 兼容单题无题号粘贴
      chunks.push({ text, sectionKp: currentKp || undefined, explicitQuestion: false });
    }
    currentLines = [];
    currentExplicit = false;
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("```")) {
      inCodeFence = !inCodeFence;
      currentLines.push(line);
      continue;
    }
    if (inCodeFence) {
      currentLines.push(line);
      continue;
    }

    const headingMatch = trimmed.match(/^#{1,6}\s+(.+)$/);
    const isBoldSec = !headingMatch && isBoldSectionHeadingLine(trimmed);
    const isQLine = qStartRe.test(trimmed);

    if ((headingMatch || isBoldSec) && !isQLine) {
      flush();
      const label = (headingMatch ? headingMatch[1] : trimmed.replace(/^\*\*|\*\*$/g, "")).trim();
      if (label && !/^(?:目录|前言|总结|附录|参考资料)$/.test(label)) {
        currentKp = label;
      }
      continue;
    }

    if (isQLine) {
      flush();
      currentLines.push(line);
      currentExplicit = true;
      continue;
    }

    if (currentLines.length > 0 || trimmed) {
      currentLines.push(line);
    }
  }
  flush();

  return chunks;
}

export function extractNaturalPaperQuestions(rawText: string, docMeta: SiyuanDocMeta): Question[] {
  const chunks = splitNaturalPaperChunks(rawText);
  const questions: Question[] = [];

  for (const chunk of chunks) {
    const q = parseSingleNaturalQuestion(chunk.text, docMeta, {
      allowUnansweredShort: chunk.explicitQuestion,
      sectionKp: chunk.sectionKp,
    });
    if (q) questions.push(q);
  }

  return questions;
}

/**
 * 巨型长文档分片异步切题处理器 (ECO-01 / TODO-05)
 * 对超过 30,000 字的超大文档进行任务分片切题，每批处理 50 题后 yield 宏任务，防主线程卡顿
 */
export async function extractNaturalPaperQuestionsAsync(
  rawText: string,
  docMeta: SiyuanDocMeta,
  onProgress?: (p: { processed: number; total: number; percent: number }) => void,
  batchSize = 50,
): Promise<Question[]> {
  const chunks = splitNaturalPaperChunks(rawText);
  const questions: Question[] = [];
  const total = chunks.length;

  for (let i = 0; i < total; i++) {
    const chunk = chunks[i];
    const q = parseSingleNaturalQuestion(chunk.text, docMeta, {
      allowUnansweredShort: chunk.explicitQuestion,
      sectionKp: chunk.sectionKp,
    });
    if (q) questions.push(q);

    if (onProgress && (i % batchSize === 0 || i === total - 1)) {
      onProgress({
        processed: i + 1,
        total,
        percent: Math.round(((i + 1) / total) * 100),
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  return questions;
}

/**
 * 从思源笔记文档 Markdown 原文解析提取全套题目
 */
export async function parseQuestionsFromSiyuanDoc(
  docMarkdown: string,
  docMeta: SiyuanDocMeta,
  options: SiyuanImportOptions = {},
): Promise<ImportReport> {
  // 0. 优先无损提取带 custom-exam-type / exam-type IAL 的 {{{row 题块（覆盖 6 种题型、图片与公式）
  const { questions: rowBlockQuestions, remainingMarkdown } = extractRowBlockQuestions(docMarkdown, docMeta);
  const profile: DocImportProfile = options.profile || "all";
  const baseCleanedText = cleanSiyuanDocMarkdown(remainingMarkdown);
  const cleanedText = profile === "paper" ? baseCleanedText : rewriteBoldTermDefinitions(baseCleanedText);
  if (!cleanedText && rowBlockQuestions.length === 0) {
    return {
      batch: newBatchId(),
      ok: [],
      errors: [{ row: 1, raw: "文档内容为空", reason: "未在选定的思源文档中读取到有效文本" }],
      duplicates: 0,
    };
  }

  const shouldRunPaper = profile === "all" || profile === "paper";
  const shouldRunNotes = profile === "all" || profile === "notes";
  const shouldRunCloze = profile === "all" || profile === "cloze" || profile === "notes";
  const shouldRunTable = profile === "all" || profile === "table" || profile === "notes";

  const allCandidates: Question[] = [...rowBlockQuestions];
  let batchId = newBatchId();
  let standardReportDuplicates = 0;

  // 1. 标准导入分流引擎解析（支持 MarkdownExam / Aiken / TSV / GIFT / 挖空）
  if (shouldRunPaper && cleanedText) {
    const standardReport = await parseText(cleanedText, options);
    if (standardReport.batch) batchId = standardReport.batch;
    if (standardReport.duplicates) standardReportDuplicates = standardReport.duplicates;
    if (standardReport.ok?.length) {
      allCandidates.push(...standardReport.ok);
    }
  }

  // 2. 极速单行与多行制卡语法（支持 :: 单向卡、::: 双向互逆卡与 ? 问答卡）
  if ((shouldRunNotes || profile === "cloze") && cleanedText) {
    if (cleanedText.includes("::") || /^\s*\?{1,2}\s*$/m.test(cleanedText)) {
      allCandidates.push(...parseInlineFlashcards(cleanedText, docMeta));
    }
  }

  // 3. Markdown 表格试题识别（用户用表格制作的生词表、概念表、问答表、选项表）
  if (shouldRunTable && cleanedText) {
    if (cleanedText.includes("|")) {
      allCandidates.push(...parseMarkdownTableToQuestions(cleanedText, docMeta));
    }
  }

  // 4. 思源自然试卷与自由排版考题识别（单行题号 1. / 1、 / (1)、一行多选项 A. xx B. yy、题干括号答案等）
  if (shouldRunPaper && cleanedText) {
    if (cleanedText.length > 25000) {
      allCandidates.push(...(await extractNaturalPaperQuestionsAsync(cleanedText, docMeta, options.onProgress)));
    } else {
      allCandidates.push(...extractNaturalPaperQuestions(cleanedText, docMeta));
    }

    // 4.1 整卷大题章节智能切分与答案回填（支持试卷专区）
    try {
      const { segmentExamPaper } = await import("../importer/examSegmenter");
      const segmented = segmentExamPaper(cleanedText, {
        source: docMeta.title,
        defaultKp: docMeta.title,
      });
      if (segmented.questions.length > 0) {
        allCandidates.push(...segmented.questions);
      }
    } catch {
      // 容错降级
    }
  }

  // 5. 句末带对错符号的自然判断题识别（如：质数只有两个因数 (√)）
  if ((shouldRunPaper || shouldRunNotes) && cleanedText) {
    if (/[（(]\s*[√×对错vVxX正确错误TFN]+\s*[)）]/.test(cleanedText)) {
      allCandidates.push(...parseInlineJudgeQuestions(cleanedText, docMeta));
    }
  }

  // 6. 标题与段落问答结构识别（如：# 什么是死锁？\n回答段落...）
  if (shouldRunNotes && cleanedText) {
    if (/#{1,6}\s+[^\n\r]+/.test(cleanedText)) {
      allCandidates.push(...parseHeadingQaQuestions(cleanedText, docMeta));
    }
  }

  // 7. 无序列表与有序列表概念定义卡（如 - 临界区：访问临界资源的代码段）
  if (shouldRunNotes && cleanedText) {
    allCandidates.push(...parseBulletDefinitions(cleanedText, docMeta));
  }

  // 8. 正文粗体概念定义句（如 **虚拟内存**是指利用外存空间扩展物理内存的技术）
  if (shouldRunNotes && cleanedText) {
    if (cleanedText.includes("**")) {
      allCandidates.push(...parseBoldSentenceDefinitions(cleanedText, docMeta));
    }
  }

  // 9. 高亮挖空（Cloze）：文档包含思源原生高亮标记 ==重点== 或 {{挖空}}
  if (shouldRunCloze && cleanedText) {
    if (/==[^=\n\r]+==|\{\{[^}\n\r]+?\}\}/.test(cleanedText)) {
      try {
        const { parseClozeText, clozeItemsToQuestions } = await import("./cloze");
        const clozeItems = parseClozeText(cleanedText, { modes: ["highlight", "curly"] });
        if (clozeItems.length > 0) {
          allCandidates.push(...clozeItemsToQuestions(clozeItems));
        }
      } catch {
        // 容错降级
      }
    }
  }

  // 10. 渐进式阅读笔记概念与列表制卡提取（概念摘抄兜底）
  if (shouldRunNotes && allCandidates.length === 0 && cleanedText.trim().length >= 10) {
    try {
      const { extractCardsFromExcerpt } = await import("./excerptCard");
      const excerptResult = extractCardsFromExcerpt({
        materialId: docMeta.docId,
        materialTitle: docMeta.title,
        text: cleanedText,
      });
      if (excerptResult.questions.length > 0) {
        allCandidates.push(...excerptResult.questions);
      }
    } catch {
      // 容错降级
    }
  }

  // 题干归一化排重（消除不同提取策略间的重叠题目；保留图片路径与公式差异防误并，并在同题冲突时优先保留信息更完整/题型更精准的一份）
  const norm = (stem: string) => {
    const strippedNum = stripQuestionNumberPrefix((stem ?? "").trim());
    const { masked: mStem, restore: rStem } = maskDocProtectedSpans(strippedNum);
    const stripped = mStem
      .replace(/^(?:简述【|请阐述【|【概念辨析】|【正向考查】|【逆向回忆】)([^】]+)【的概念与核心定义。?/, "$1")
      .replace(/[（([【]\s*[A-Za-z0-9√×对错vVxX正确错误\s]*[)）\]】]/g, "");
    return rStem(stripped)
      .replace(/[^\p{L}\p{N}]/gu, "")
      .toLowerCase();
  };

  const richnessScore = (q: Question) => {
    const imgs = (q.stem.match(/!\[[^\]]*\]\([^)]+\)/g) || []).length;
    const tbls = (q.stem.match(/\|[^\n]+\|/g) || []).length;
    const typeScore = q.type === "single" || q.type === "multiple" || q.type === "judge" ? 30 : q.type === "fill" ? 20 : 10;
    return typeScore + q.options.length * 10 + imgs * 20 + tbls * 2 + (q.answer ? 5 : 0);
  };

  const deduplicated: Question[] = [];
  const seenEntries: Array<{ norm: string; idx: number }> = [];

  for (const q of allCandidates) {
    const n = norm(q.stem);
    if (!n) continue;
    const matched = seenEntries.find(
      (e) => e.norm === n || (e.norm.length >= 6 && n.length >= 6 && (e.norm.includes(n) || n.includes(e.norm))),
    );
    if (!matched) {
      seenEntries.push({ norm: n, idx: deduplicated.length });
      deduplicated.push(q);
    } else if (richnessScore(q) > richnessScore(deduplicated[matched.idx])) {
      deduplicated[matched.idx] = q;
      if (n.length > matched.norm.length) matched.norm = n;
    }
  }

  // 如果文档内确实没有任何可提取的题目，归一化错误信息，引导一键 AI 提炼
  if (deduplicated.length === 0) {
    return {
      batch: batchId,
      ok: [],
      errors: [
        {
          row: 1,
          raw: cleanedText.slice(0, 100),
          reason: `《${docMeta.title}》未检测到题目内容（为日常叙述性笔记，建议使用「AI 提炼试题」一键自动阅读正文出题）`,
        },
      ],
      duplicates: 0,
    };
  }

  // 为所有成功提取的题目运行自愈纠偏、质量巡检并计算置信度评分
  const enrichedQuestions = deduplicated.map((q) => {
    const { question: fixedQ } = autoFixQuestion(q);
    const lint = lintQuestion(fixedQ);
    const confidence = Math.round(lint.score) / 100;
    const lintIssues = lint.issues.map((i) => i.message);

    return {
      ...fixedQ,
      confidence,
      lintIssues,
      source: fixedQ.source && fixedQ.source !== "Markdown文档导入" ? fixedQ.source : docMeta.title,
      sourceKind: "real" as const,
      ...(docMeta.docId ? { sourceBlockId: docMeta.docId } : {}),
      kp: fixedQ.kp || (docMeta.hpath ? docMeta.hpath.replace(/^\/|\/$/g, "").replace(/\/[^/]+$/, "") : docMeta.title),
    };
  });

  // 处理 existingHashes 幂等去重
  let duplicates = standardReportDuplicates;
  let finalQuestions: Question[] = enrichedQuestions;
  if (options.existingHashes && options.existingHashes.size > 0) {
    const seen = options.existingHashes;
    const fresh: Question[] = [];
    let externalDupes = 0;
    for (const q of enrichedQuestions) {
      const h1 = q.hash;
      const h2 = questionHash(q.stem, q.options);
      let isDupe = seen.has(h1) || seen.has(h2);
      if (!isDupe) {
        for (let num = 1; num <= 30; num++) {
          if (
            seen.has(questionHash(`${num}. ${q.stem}`, q.options)) ||
            seen.has(questionHash(`${num}、${q.stem}`, q.options)) ||
            seen.has(questionHash(`(${num}) ${q.stem}`, q.options))
          ) {
            isDupe = true;
            break;
          }
        }
      }
      if (isDupe) {
        externalDupes++;
      } else {
        fresh.push(q);
      }
    }
    finalQuestions = fresh;
    duplicates = Math.max(duplicates, externalDupes);
  }

  return {
    batch: batchId,
    ok: finalQuestions,
    errors: [],
    duplicates,
  };
}

export interface SiyuanDocBatchItem {
  docId: string;
  title: string;
  hpath?: string;
  markdown: string;
}

/**
 * 批量从多篇思源笔记文档中提取试题，合并结果并确定性去重
 */
export async function parseQuestionsFromSiyuanDocBatch(
  docs: readonly SiyuanDocBatchItem[],
  options: ImportOptions = {},
): Promise<ImportReport> {
  const allQuestions: import("./types").Question[] = [];
  const allErrors: import("../importer/pipeline").ImportError[] = [];
  let duplicates = 0;
  const seenHash = new Set(options.existingHashes);

  for (const doc of docs) {
    const singleReport = await parseQuestionsFromSiyuanDoc(doc.markdown, {
      docId: doc.docId,
      title: doc.title,
      hpath: doc.hpath,
    }, {
      ...options,
      existingHashes: seenHash,
    });

    duplicates += singleReport.duplicates || 0;

    for (const q of singleReport.ok) {
      if (seenHash.has(q.hash)) {
        duplicates++;
      } else {
        seenHash.add(q.hash);
        allQuestions.push(q);
      }
    }
    allErrors.push(...singleReport.errors);
  }

  return {
    batch: newBatchId(),
    ok: allQuestions,
    errors: allErrors,
    duplicates,
  };
}

/**
 * 15. 将思源笔记中带有指定标签（如 #考点#、#必考#、#错题#、#真题#）的块转换为试题对象
 */
export function convertTaggedBlockToQuestion(
  block: { id: string; content: string; rootId: string; hpath: string },
  tag: string,
): Question | null {
  const cleanTag = tag.trim().replace(/^#|#$/g, "");
  const cleanContent = (block.content ?? "")
    .replace(new RegExp(`#${cleanTag}#?|#?${cleanTag}#`, "gi"), "")
    .trim();
  if (cleanContent.length < 4) return null;

  const docTitle = safeDocTitleFromHPath(block, "思源笔记");
  const docMeta: SiyuanDocMeta = {
    docId: block.id,
    title: docTitle,
    hpath: block.hpath,
  };

  // 1. 如果块内本身包含自然试题格式（单选、判断、问答、列表定义）
  const paper = extractNaturalPaperQuestions(cleanContent, docMeta);
  if (paper.length > 0) {
    const q = paper[0];
    q.sourceBlockId = block.id;
    return q;
  }

  // 2. 检查列表项定义（例如 进程：资源分配基本单位）
  const bullet = parseBulletDefinitions(cleanContent, docMeta);
  if (bullet.length > 0) {
    const q = bullet[0];
    q.sourceBlockId = block.id;
    return q;
  }

  // 3. 检查冒号或破折号定义结构
  const colonMatch = cleanContent.match(/^(?:【|\*\*|「|“|")?([^\s:：—\-*【「"”]{2,25})(?:】|\*\*|」|”|")?\s*[:：——]\s*(.+)$/);
  if (colonMatch) {
    const term = colonMatch[1].trim();
    const def = colonMatch[2].trim();
    const q = makeQuestion({
      type: "short",
      stem: `简述【${term}】的概念与核心定义。`,
      options: [],
      answer: def,
      analysis: `出处：${block.hpath || docTitle} · 标签 #${cleanTag}#`,
      kp: docTitle,
      source: docTitle,
    });
    q.sourceBlockId = block.id;
    q.sourceKind = "real";
    return q;
  }

  // 4. 检查定义句式（X是/是指Y）
  const defMatch = cleanContent.match(/^(?:【|\*\*|「|“|")?([^\s:：—\-*【「"”]{2,20})(?:】|\*\*|」|”|")?\s*(?:是指|是|指|即为|定义为)\s*(.+)$/);
  if (defMatch) {
    const term = defMatch[1].trim();
    const def = defMatch[2].trim();
    const q = makeQuestion({
      type: "short",
      stem: `什么是【${term}】？请阐述其核心内涵。`,
      options: [],
      answer: `${term}是指${def}`,
      analysis: `出处：${block.hpath || docTitle} · 标签 #${cleanTag}#`,
      kp: docTitle,
      source: docTitle,
    });
    q.sourceBlockId = block.id;
    q.sourceKind = "real";
    return q;
  }

  // 5. 兜底为重点复述考点卡
  const q = makeQuestion({
    type: "short",
    stem: cleanContent.length > 60
      ? `【考点阐述】请结合以下要点进行论述：\n${cleanContent.slice(0, 80)}…`
      : `【重点复述】根据《${docTitle}》，请写出以下考点的完整表述：`,
    options: [],
    answer: cleanContent,
    analysis: `出处：${block.hpath || docTitle} · 标签 #${cleanTag}#`,
    kp: docTitle,
    source: docTitle,
  });
  q.sourceBlockId = block.id;
  q.sourceKind = "real";
  return q;
}

/**
 * 16. 从思源笔记标签检索出的块列表中批量生成试题导入报告
 */
export function buildReportFromTaggedBlocks(
  blocks: Array<{ id: string; content: string; rootId: string; hpath: string }>,
  tag: string,
): ImportReport {
  const ok: Question[] = [];
  const seenHashes = new Set<string>();
  let duplicates = 0;

  for (const b of blocks) {
    const q = convertTaggedBlockToQuestion(b, tag);
    if (!q) continue;
    if (seenHashes.has(q.hash)) {
      duplicates++;
    } else {
      seenHashes.add(q.hash);
      ok.push(q);
    }
  }

  return {
    batch: newBatchId(),
    ok,
    errors: [],
    duplicates,
  };
}
