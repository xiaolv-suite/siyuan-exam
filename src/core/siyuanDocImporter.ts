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
          type: def.length > 50 ? "short" : "fill",
          stem: `【正向考查】${term}`,
          options: [],
          answer: def,
          kp: docMeta.title,
          source: docMeta.title,
        });
        q1.sourceKind = "real";

        // 反向题：给出释义，回答概念
        const q2 = makeQuestion({
          type: term.length > 50 ? "short" : "fill",
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
          type: aText.length > 50 ? "short" : "fill",
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
        type: aText.length > 60 ? "short" : "fill",
        stem: qText,
        options: [],
        answer: aText,
        kp: docMeta.title,
        source: docMeta.title,
      });
      q1.sourceKind = "real";

      if (isBi) {
        const q2 = makeQuestion({
          type: qText.length > 60 ? "short" : "fill",
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

  // 兜底 0：极速单行与多行制卡语法（支持 :: 单向卡、::: 双向互逆卡与 ? 问答卡）
  if (!report.ok.length && !report.duplicates && (docMarkdown.includes("::") || /^\s*\?{1,2}\s*$/m.test(docMarkdown))) {
    const flashcards = parseInlineFlashcards(docMarkdown, docMeta);
    if (flashcards.length > 0) {
      report = {
        batch: report.batch || newBatchId(),
        ok: flashcards,
        errors: [],
        duplicates: 0,
      };
    }
  }

  // 兜底 1：Markdown 表格试题识别（用户用表格制作的生词表、概念表、问答表、选项表）
  if (!report.ok.length && !report.duplicates && docMarkdown.includes("|")) {
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
  if (!report.ok.length && !report.duplicates && (/==[^=\n\r]+==|\{\{[^}\n\r]+?\}\}/.test(cleanedText))) {
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

  // 兜底 3：渐进式阅读笔记概念与列表制卡提取（识别术语定义、列举项等）
  if (!report.ok.length && !report.duplicates && cleanedText.trim().length >= 10) {
    try {
      const { extractCardsFromExcerpt } = await import("./excerptCard");
      const excerptResult = extractCardsFromExcerpt({
        materialId: docMeta.docId,
        materialTitle: docMeta.title,
        text: cleanedText,
      });
      if (excerptResult.questions.length > 0) {
        report = {
          batch: report.batch || newBatchId(),
          ok: excerptResult.questions,
          errors: [],
          duplicates: 0,
        };
      }
    } catch {
      // 提取异常静默容错
    }
  }

  // 兜底 4：如果文档内确实没有任何可提取的题目，归一化错误信息，消除底层 Aiken 内部“缺少 ANSWER 行”等不友好报错
  if (!report.ok.length && !report.duplicates) {
    return {
      batch: report.batch || newBatchId(),
      ok: [],
      errors: [
        {
          row: 1,
          raw: cleanedText.slice(0, 100),
          reason: `《${docMeta.title}》未检测到题目内容（支持选择题、表格题表、==高亮挖空== 或 **术语** 定义）`,
        },
      ],
      duplicates: 0,
    };
  }

  // 为所有成功提取的题目注入文档元数据
  const rawQuestions = report.ok ?? [];
  const enrichedQuestions = rawQuestions.map((q) => {
    return {
      ...q,
      source: q.source && q.source !== "Markdown文档导入" ? q.source : docMeta.title,
      sourceKind: "real" as const,
      ...(docMeta.docId ? { sourceBlockId: docMeta.docId } : {}),
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
