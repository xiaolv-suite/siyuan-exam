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
import { newBatchId } from "./ids";
import type { Question, QuestionType } from "./types";
import { makeQuestion } from "./blockTemplate";

export interface SiyuanDocMeta {
  docId: string;
  title: string;
  hpath?: string;
  notebookId?: string;
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

  // 1. 移除思源 IAL 块属性行（例如 {: id="2026..." updated="2026..."}）
  s = s.replace(/\{:[^}]*\}\s*$/gm, "");

  // 1.1 移除思源超级块与排版标记（{{{row, {{{col, }}}）
  s = s.replace(/^\{\{\{(?:row|col)?\s*$/gm, "");
  s = s.replace(/^\}\}\}\s*$/gm, "");

  // 1.2 剥离标题行前缀（如 ### 1. 题目 -> 1. 题目，避免题目被当成标题忽略）
  s = s.replace(/^#{1,6}\s*(?=\d+[.、])/gm, "");

  // 1.3 规范化复选框任务列表中的正确答案标记
  // 若包含 - [x] A. 选项 或 - [X] B. 选项，且原文本未带显式答案行，则提取为标准答案
  const checkedMatches = [...s.matchAll(/^[-*]\s*\[[xX]\]\s*([A-Fa-f])[.、]/gm)];
  if (checkedMatches.length > 0 && !/(?:ANSWER|【答案】|答案\s*[:：])/i.test(s)) {
    const checkedLetters = checkedMatches.map((m) => m[1].toUpperCase()).join("");
    s = s.trimEnd() + `\nANSWER: ${checkedLetters}\n`;
  }
  s = s.replace(/^[-*]\s*\[[ xX]\]\s*/gm, "");

  // 1.4 剥离无序列表选项前缀：如 "- A. 选项" 规范化为 "A. 选项"
  s = s.replace(/^[-*+]\s+([A-Fa-f][.、\s])/gm, "$1");

  // 2. 剥离行首引用块标记（支持整道题写在引用块 > 里的场景）
  s = s.replace(/^>\s?/gm, "");

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

  // 7.1 概念与术语定义卡：**术语**：定义内容 ➔ 转换为问答结构
  s = s.replace(/^\s*\*\*([^*\n\r]{2,40})\*\*\s*[:：]\s*([^\n\r]{4,})/gm, (_m, term: string, def: string) => {
    return `\n1. 简述 ${term} 的概念与定义。\n【答案】：${def.trim()}\n`;
  });

  return s.trim();
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
    .map((l) => l.trim())
    .filter((l) => l.startsWith("|") && l.endsWith("|"));
  if (lines.length < 3) return [];

  const headerCells = lines[0]
    .slice(1, -1)
    .split("|")
    .map((c) => c.trim().toLowerCase());
  const stemIdx = headerCells.findIndex((c) =>
    /题干|题目|问题|问|question|front|stem|单词|词汇|term|概念/.test(c),
  );
  const ansIdx = headerCells.findIndex((c) =>
    /答案|答|answer|back|释义|意思|定义|definition|meaning/.test(c),
  );
  const optAIdx = headerCells.findIndex((c) => /选项\s*a|^a$/i.test(c));
  const optBIdx = headerCells.findIndex((c) => /选项\s*b|^b$/i.test(c));
  const optCIdx = headerCells.findIndex((c) => /选项\s*c|^c$/i.test(c));
  const optDIdx = headerCells.findIndex((c) => /选项\s*d|^d$/i.test(c));
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
    const row = lines[i].slice(1, -1).split("|").map((c) => c.trim());
    const stem = row[stemIdx];
    const answer = row[ansIdx];
    if (!stem || !answer || /^-+$/.test(stem)) continue;

    const options: string[] = [];
    if (optAIdx >= 0 && row[optAIdx]) options.push(row[optAIdx]);
    if (optBIdx >= 0 && row[optBIdx]) options.push(row[optBIdx]);
    if (optCIdx >= 0 && row[optCIdx]) options.push(row[optCIdx]);
    if (optDIdx >= 0 && row[optDIdx]) options.push(row[optDIdx]);

    const type: QuestionType = options.length >= 2
      ? (answer.length > 1 ? "multiple" : "single")
      : /^[对错正确错误]$/.test(answer) ? "judge" : "fill";

    const q = makeQuestion({
      type,
      stem,
      options,
      answer,
      analysis: analysisIdx >= 0 ? row[analysisIdx] || undefined : undefined,
      kp: (kpIdx >= 0 && row[kpIdx]) ? row[kpIdx] : docMeta.title,
      source: docMeta.title,
      sourceKind: "real",
    });
    questions.push(q);
  }
  return questions;
}

/**
 * 从思源笔记文档 Markdown 原文解析提取全套题目
 */
export async function parseQuestionsFromSiyuanDoc(
  docMarkdown: string,
  docMeta: SiyuanDocMeta,
  options: ImportOptions = {},
): Promise<ImportReport> {
  const cleanedText = cleanSiyuanDocMarkdown(docMarkdown);
  if (!cleanedText) {
    return {
      batch: newBatchId(),
      ok: [],
      errors: [{ row: 1, raw: "文档内容为空", reason: "未在选定的思源文档中读取到有效文本" }],
      duplicates: 0,
    };
  }

  // 统一通过导入分流引擎解析（支持 MarkdownExam / Aiken / TSV / GIFT / 挖空）
  let report = await parseText(cleanedText, options);

  // 兜底 1：Markdown 表格试题识别（用户用表格制作的生词表、概念表、问答表、选项表）
  if (!report.ok.length && docMarkdown.includes("|")) {
    const tableQuestions = parseMarkdownTableToQuestions(docMarkdown, docMeta);
    if (tableQuestions.length > 0) {
      report = {
        batch: report.batch || newBatchId(),
        ok: tableQuestions,
        errors: [],
        duplicates: 0,
      };
    }
  }

  // 兜底 2：高亮挖空（Cloze）：如果常规试题未提取出任何有效题目，但文档包含思源原生高亮标记 ==重点== 或 {{挖空}}，自动提取为填空题
  if (!report.ok.length && (/==[^=\n\r]+==|\{\{[^}\n\r]+?\}\}/.test(cleanedText))) {
    const { parseClozeText, clozeItemsToQuestions } = await import("./cloze");
    const clozeItems = parseClozeText(cleanedText, { modes: ["highlight", "curly"] });
    if (clozeItems.length > 0) {
      const clozeQuestions = clozeItemsToQuestions(clozeItems);
      report = {
        batch: report.batch || newBatchId(),
        ok: clozeQuestions,
        errors: [],
        duplicates: 0,
      };
    }
  }

  // 为所有成功提取的题目注入文档元数据
  const rawQuestions = report.ok ?? [];
  const enrichedQuestions = rawQuestions.map((q) => {
    return {
      ...q,
      source: q.source && q.source !== "Markdown文档导入" ? q.source : docMeta.title,
      sourceKind: "real" as const,
      // 若原题无明确考点，默认将文档路径父级或标题作为建议考点
      kp: q.kp || (docMeta.hpath ? docMeta.hpath.replace(/^\/|\/$/g, "").replace(/\/[^/]+$/, "") : docMeta.title),
    };
  });

  return {
    ...report,
    ok: enrichedQuestions,
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
