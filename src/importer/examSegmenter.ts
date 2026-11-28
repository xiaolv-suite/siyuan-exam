/**
 * ============================================================
 * 整卷智能切题与答案反向缝合引擎 (Smart Exam Segmenter)
 * 借鉴标杆：魔方助教 (mofang-assistant) 规则驱动切分流水线
 * 能力：
 * 1. 自动识别大题章节（单选/多选/判断/填空/简答）并继承题型与分值
 * 2. 启发式精准切题，容错小数、题号跳跃与注意事项过滤
 * 3. 智能水平拆分单行多选项（A. ... B. ... C. ... D. ...）
 * 4. 自动识别文末分离的“【参考答案】”，跨段反向缝合回母题答案与解析
 * ============================================================
 */

import type { Question, QuestionType } from "@/core/types";
import { questionHash } from "@/core/answer";
import { newQuestionId } from "@/core/ids";
import { lintQuestion, autoFixQuestion, hasBlankPlaceholder, isBoldSectionHeadingLine } from "@/core/questionLinter";

export interface SegmentedExamResult {
  questions: Question[];
  warnings: string[];
  sections: Array<{ title: string; count: number }>;
}

export interface SegmentOptions {
  source?: string;
  defaultBankName?: string;
  defaultKp?: string;
}

/**
 * OCR 与试卷文本自愈清洗（容错全角字符与常见OCR误识别）
 */
export function autoHealExamText(raw: string): string {
  if (!raw) return "";
  let s = raw;
  // 1. 题号全角句点与顿号统一归一为半角点
  s = s.replace(/^([0-9]+)[．、]/gm, "$1. ");
  // 2. OCR 常见数字首位误判为英文字母 l 或 I 的容错（行首 l. 或 I. 纠偏为 1.）
  s = s.replace(/^[lI][.、]\s*/gm, "1. ");
  return s;
}

/**
 * 密集型与矩阵式答案解码器 (Compact Answer Matrix Decoder)
 * 支持格式：
 * 1. 范围型单连字符/波浪号展开：1-5: A B C D A 或 1~5 BACDA 或 6-10: C B A D D
 * 2. 连续字母无空格串：1-5 ABCDE
 * 3. 单行密集键值对：1.A 2.B 3.C 4.D 或 (1) A (2) B (3) C
 * 4. 判断题紧凑符号：1-5: √ × √ × √ 或 1-5: 对 错 对 对 错
 */
export function decodeCompactAnswerMatrix(text: string): Map<number, string> {
  const result = new Map<number, string>();
  if (!text) return result;

  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.includes("解析")) continue;

    // 格式 1：范围型 1-5: A B C D A 或 1~5 BACDA 或 【1-5】A B C D A
    const rangeMatches = Array.from(trimmed.matchAll(/(?:【?\s*(\d+)\s*[-~—至到]\s*(\d+)\s*】?[:：.\s]*)([A-Za-z0-9\s√×对错vVxXTFN,，、]+)(?=(?:【?\s*\d+\s*[-~—至到])|$)/g));
    if (rangeMatches.length > 0) {
      for (const rm of rangeMatches) {
        const start = parseInt(rm[1], 10);
        const end = parseInt(rm[2], 10);
        const rawAnswers = rm[3].trim();
        const count = end - start + 1;
        if (count > 0 && count <= 50) {
          let tokens = rawAnswers.split(/[\s,，、]+/).filter(Boolean);
          if (tokens.length === 1 && tokens[0].length === count && /^[A-Ja-j对错√×]+$/.test(tokens[0])) {
            tokens = tokens[0].split("");
          }
          if (tokens.length >= count) {
            for (let i = 0; i < count; i++) {
              result.set(start + i, tokens[i].toUpperCase());
            }
          }
        }
      }
    }

    // 格式 2：单行密集键值对，例如 "1. A  2. B  3. C  4. D" 或 "(1) A  (2) B"
    const denseMatches = Array.from(trimmed.matchAll(/(?:^|\s+|[;；])(?:[（(【]?(\d+)[)）】]?[.、:：\s]+)([A-Ja-j对错√×TFN]+)(?=(?:\s+[（(【]?\d+)|$)/g));
    if (denseMatches.length >= 2) {
      for (const dm of denseMatches) {
        const num = parseInt(dm[1], 10);
        const ans = dm[2].trim().toUpperCase();
        if (num > 0) {
          result.set(num, ans);
        }
      }
    }
  }

  return result;
}

// 大题章节标题正则：例如 "一、单项选择题（每小题3分）"、"第二部分 填空题"
const SECTION_RE = /^[#\s]*(?:第[一二三四五六七八九十]+部分|[一二三四五六七八九十]+[、.\s]+)([^（(\n\r]+)(?:[（(].*?[）)])?/;

// 答案解析专区起始正则：整行必须是专区标题，例如 "【参考答案与解析】"、"【参考答案及解析】"、"参考答案及评分标准" 等
const ANSWER_ZONE_RE = /^[#\s]*【?(?:参考答案(?:[与及和](?:详细)?(?:解析|评分标准|评分细则|提示))?|[参考]*答案[与及和](?:详细)?(?:解析|评分标准|评分细则|提示)|试卷(?:参考)?答案(?:[与及和]解析)?|试题参考答案)】?[：:]?\s*$/i;

// 题目题号起始匹配（兼容 **1.**、**1、**、**(1)**、**1)**、【例1】、1.、1、 等，严格排除 1.5 小数）
const BOLD_CLOSED_Q_RE = /^\*\*\s*(?:第\s*(\d+)\s*题[:：]?|【(?:例题?|试题|单选|多选|判断|填空|简答|材料)?\s*(\d+)】|[（(](\d+)[)）]|(\d+)(?:\.(?!\d)|[、)）]))\s*\*\*\s*(.*)$/;
const BOLD_OPEN_Q_RE = /^\*\*\s*(?:第\s*(\d+)\s*题[:：]?|【(?:例题?|试题|单选|多选|判断|填空|简答|材料)?\s*(\d+)】|[（(](\d+)[)）]|(\d+)(?:\.(?!\d)|[、)）]))\s*(.*)$/;
const PLAIN_Q_RE = /^(?:第\s*(\d+)\s*题[:：]?|【(?:例题?|试题|单选|多选|判断|填空|简答|材料)?\s*(\d+)】|[（(](\d+)[)）]|(\d+)(?:\.(?!\d)|[、)）]))\s*(.*)$/;

function matchQuestionStart(line: string): { num: number; rest: string; isParen: boolean } | null {
  const trimmed = line.trim();
  let m = trimmed.match(BOLD_CLOSED_Q_RE);
  if (m) {
    const num = parseInt(m[1] || m[2] || m[3] || m[4], 10);
    return { num, rest: (m[5] || "").trim(), isParen: false };
  }
  m = trimmed.match(BOLD_OPEN_Q_RE);
  if (m) {
    const num = parseInt(m[1] || m[2] || m[3] || m[4], 10);
    const rawRest = (m[5] || "").trim();
    const rest = rawRest.includes("**") ? `**${rawRest}` : rawRest;
    return { num, rest, isParen: false };
  }
  m = trimmed.match(PLAIN_Q_RE);
  if (m) {
    const num = parseInt(m[1] || m[2] || m[3] || m[4], 10);
    const isParen = /^[（(]/.test(trimmed);
    return { num, rest: (m[5] || "").trim(), isParen };
  }
  return null;
}

function splitHorizontalOptionsLine(line: string): string[] | null {
  const spans: string[] = [];
  const tokenOf = (raw: string) => {
    const idx = spans.length;
    spans.push(raw);
    return `@@SEGMASK_${idx}@@`;
  };
  const masked = line
    .replace(/```[\s\S]*?```/g, tokenOf)
    .replace(/`[^`\n\r]+?`/g, tokenOf)
    .replace(/\$\$[\s\S]*?\$\$/g, tokenOf)
    .replace(/!\[[^\]]*\]\([^)]*\)/g, tokenOf)
    .replace(/(?<!\\)\$[^$\n\r]+?\$/g, tokenOf);
  const restore = (s: string) => s.replace(/@@SEGMASK_(\d+)@@/g, (_m, i: string) => spans[Number(i)] ?? _m);

  // 严格匹配选项前缀：A. / A、 / (A) / （A） / A: / 或 A + 空格（仅当同行包含 B 时启用）
  const hasStrict = /^[(（]?[A-Ja-j][.、:：)）]/.test(masked) || /\s+[(（]?[A-Ja-j][.、:：)）]/.test(masked);
  const hasSpaceAlphaSeq = /^[A-J]\s+\S+/.test(masked) && /\s+[B-J]\s+\S+/.test(masked);
  if (!hasStrict && !hasSpaceAlphaSeq) return null;

  const optRegex = hasStrict
    ? /(?:^|\s+)(?:[（(]([A-Ja-j])[)）]|([A-Ja-j])[.、:：)）])\s*/g
    : /(?:^|\s+)(?:[（(]?([A-J])[.、:：)）\s])\s*/g;
  const rawMatches: Array<{ letter: string; index: number; len: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = optRegex.exec(masked)) !== null) {
    const letter = (m[1] || m[2]).toUpperCase();
    rawMatches.push({ letter, index: m.index, len: m[0].length });
  }
  const seq: typeof rawMatches = [];
  for (const item of rawMatches) {
    if (item.letter.charCodeAt(0) === 65 + seq.length) {
      seq.push(item);
    } else if (seq.length === 0 && rawMatches.length === 1) {
      // 允许跨行单选项如 B. xxx（当上一行已有 A. xxx）
      seq.push(item);
      break;
    } else if (seq.length >= 2) {
      break;
    }
  }
  if (seq.length === 0) return null;
  const out: string[] = [];
  for (let i = 0; i < seq.length; i++) {
    const start = seq[i].index + seq[i].len;
    const end = i < seq.length - 1 ? seq[i + 1].index : masked.length;
    const optText = restore(masked.slice(start, end)).trim();
    if (optText) out.push(optText);
  }
  return out.length > 0 ? out : null;
}

// 行内答案与解析提取：例如 "【答案】B"、"参考答案：C"、"【答案】x = 3"、"【解析】由公式可知..."
const INLINE_ANSWER_RE = /(?:【(?:参考)?答案】|(?:参考)?答案\s*[:：]\s*)([^\n\r]+)/;
const INLINE_ANALYSIS_RE = /(?:【解析】|解析\s*[:：]\s*)([\s\S]+)/;
const INLINE_KP_RE = /(?:【考点】|考点\s*[:：]\s*)([^\n\r]+)/;

/**
 * 启发式推断大题的默认题型
 */
function inferQuestionType(sectionTitle: string): QuestionType {
  const t = sectionTitle.trim();
  if (t.includes("多选")) return "multiple";
  if (t.includes("单选") || t.includes("选择")) return "single";
  if (t.includes("判断") || t.includes("是非")) return "judge";
  if (t.includes("填空")) return "fill";
  if (t.includes("简答") || t.includes("解答") || t.includes("计算") || t.includes("分析") || t.includes("综合")) {
    return "short";
  }
  return "single";
}

/**
 * 启发式推断大题的默认题目分值
 */
function inferDefaultScore(sectionTitle: string, qType: QuestionType): number {
  const m = sectionTitle.match(/每[小题|题]\s*(\d+)\s*分/);
  if (m) {
    const val = parseInt(m[1], 10);
    if (!isNaN(val) && val > 0 && val <= 100) return val;
  }
  if (qType === "single" || qType === "multiple") return 3;
  if (qType === "judge") return 2;
  if (qType === "fill") return 3;
  if (qType === "short") return 10;
  return 3;
}

interface IntermediateDraft {
  num: number;
  startedWithParen?: boolean;
  sectionTitle: string;
  type: QuestionType;
  stemLines: string[];
  options: string[];
  answer: string;
  analysisLines: string[];
  score: number;
  kp?: string;
}

/**
 * 将整份文本试卷智能切分为结构化题目集合
 */
export function segmentExamPaper(
  rawText: string,
  options: SegmentOptions = {},
): SegmentedExamResult {
  const warnings: string[] = [];
  const sectionsSummary: Array<{ title: string; count: number }> = [];

  if (!rawText || !rawText.trim()) {
    return { questions: [], warnings: ["输入试卷内容为空"], sections: [] };
  }

  const healedText = autoHealExamText(rawText);
  const lines = healedText.split(/\r?\n/);
  let currentSectionTitle = "基础试题";
  let currentType: QuestionType = "single";
  let currentScore = 3;
  let inAnswerZone = false;

  const drafts: IntermediateDraft[] = [];
  const draftByNum = new Map<number, IntermediateDraft>();

  let currentDraft: IntermediateDraft | null = null;
  let currentAnswerStitchTarget: IntermediateDraft | null = null;

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx].trim();
    if (!line) continue;

    // 1. 检查是否进入了文末的“答案与解析专区”
    if (ANSWER_ZONE_RE.test(line)) {
      inAnswerZone = true;
      currentDraft = null;

      // 自动预先解码紧凑型与矩阵式答案卡（例如 1-5: BACDA 6-10: CDDCB 或 1. A 2. B 3. C）
      const remainingZoneText = lines.slice(idx).join("\n");
      const compactMatrix = decodeCompactAnswerMatrix(remainingZoneText);
      for (const [qNum, matrixAns] of compactMatrix.entries()) {
        const target = draftByNum.get(qNum);
        if (target && !target.answer) {
          target.answer = matrixAns;
        }
      }
      continue;
    }

    // 0. 第一大题之前的试卷导语或考场注意事项识别跳过
    if (drafts.length === 0 && !SECTION_RE.test(line)) {
      if (line.includes("注意事项") || line.includes("准考证号") || line.includes("密封线内") || line.includes("答题卡")) {
        warnings.push(`已自动跳过考场注意事项: "${line.slice(0, 30)}..."`);
        continue;
      }
    }

    // 2. 如果在答案专区中：反向匹配缝合回对应母题
    if (inAnswerZone) {
      const qStart = matchQuestionStart(line);
      if (qStart) {
        const num = qStart.num;
        const rest = qStart.rest;
        const target = draftByNum.get(num);
        if (target) {
          currentAnswerStitchTarget = target;
          const anaMatch = rest.match(INLINE_ANALYSIS_RE);
          const restWithoutAnalysis = anaMatch ? rest.slice(0, anaMatch.index).trim() : rest;

          // 提取答案行
          const inlineAns = restWithoutAnalysis.match(INLINE_ANSWER_RE);
          if (inlineAns) {
            target.answer = inlineAns[1].trim();
          } else if (target.type === "short" || target.type === "fill") {
            // 主观简答题或填空题：解析前的整段作为答案表达式
            target.answer = restWithoutAnalysis;
          } else {
            // 选择题与判断题：优先支持逗号/顿号分隔的多选题答案（如 "A、B、D" 或 "A, B, C"），再匹配首个选项字符
            const multiAnsMatch = restWithoutAnalysis.match(/^([A-Ja-j](?:\s*[,，、]\s*[A-Ja-j])+)/);
            if (multiAnsMatch) {
              target.answer = multiAnsMatch[1].replace(/[,，、\s]+/g, ", ").trim();
            } else {
              const optAns = restWithoutAnalysis.match(/^([A-Za-z0-9\u4e00-\u9fa5对错√×]+)(?:\s|$|[、.])/);
              if (optAns) {
                target.answer = optAns[1].trim();
              } else if (restWithoutAnalysis) {
                target.answer = restWithoutAnalysis;
              }
            }
          }

          if (anaMatch) {
            target.analysisLines.push(anaMatch[1].trim());
          }
        } else {
          currentAnswerStitchTarget = null;
          warnings.push(`答案专区出现未找到母题的题号: 第 ${num} 题`);
        }
      } else if (currentAnswerStitchTarget) {
        // 多行解析追加
        currentAnswerStitchTarget.analysisLines.push(line);
      }
      continue;
    }

    // 3. 检查大题章节标题或 Markdown 小节/知识点标题（如 "一、选择题"、"##### 第 2 课时"、"**知识点 1 ...**"）
    const secMatch = line.match(SECTION_RE);
    const mdHeadingMatch = !secMatch ? line.match(/^#{1,6}\s+(.+)$/) : null;
    const isBoldSec = !secMatch && !mdHeadingMatch && isBoldSectionHeadingLine(line);
    if (secMatch || mdHeadingMatch || isBoldSec) {
      const headingRaw = secMatch
        ? secMatch[0].trim()
        : mdHeadingMatch
          ? mdHeadingMatch[1].trim()
          : line.replace(/^\*\*|\*\*$/g, "").trim();
      // 若为 "# 1. 题干" 形式的带题号标题则交由后续题号识别
      if (!(mdHeadingMatch && matchQuestionStart(headingRaw))) {
        currentSectionTitle = headingRaw;
        if (secMatch || /(?:单选|多选|判断|填空|简答|解答|计算|分析|综合)/.test(headingRaw)) {
          currentType = inferQuestionType(headingRaw);
          currentScore = inferDefaultScore(headingRaw, currentType);
        }
        currentDraft = null;
        continue;
      }
    }

    // 4. 检查题目起始题号（如 "1. 下列各式中..."、"**1.** ..."）
    const qStart = matchQuestionStart(line);
    if (qStart) {
      const num = qStart.num;
      const rest = qStart.rest;

      // 第一大题之前的杂项/注意事项过滤（序号小于等于 0 或大题标题仍为前导说明）
      if (drafts.length === 0 && (line.includes("注意事项") || line.includes("准考证号") || line.includes("密封线内"))) {
        warnings.push(`已自动跳过考场注意事项: "${line.slice(0, 30)}..."`);
        continue;
      }

      // 边界防护：母题采用 N. / **N.** 编号时，其下的 (1)、(2)、(3) 属于子问或图注（如 "(1) 班统计图"），归属母题不拆分
      const isSubQuestion = currentDraft && qStart.isParen && !currentDraft.startedWithParen;

      if (isSubQuestion && currentDraft) {
        currentDraft.stemLines.push(line);
        continue;
      }

      currentDraft = {
        num,
        startedWithParen: qStart.isParen,
        sectionTitle: currentSectionTitle,
        type: currentType,
        stemLines: [],
        options: [],
        answer: "",
        analysisLines: [],
        score: currentScore,
      };

      // 若首行同时携带题干 + 水平选项（如 PDF 单行提取 "1. 题干 A. 1 B. 2 C. 3 D. 4 Answer: B"），就地拆分
      let headRest = rest;
      const headAnsMatch = headRest.match(/(?:【(?:参考)?答案】|(?:参考)?答案\s*[:：]|ANSWER\s*[:：]|KEY\s*[:：])\s*([^\n\r]+)$/i);
      if (headAnsMatch && headAnsMatch.index != null && headAnsMatch.index > 0) {
        currentDraft.answer = headAnsMatch[1].trim();
        headRest = headRest.slice(0, headAnsMatch.index).trim();
      }
      const inlineOptAnchor = headRest.match(/\s+(?=[(（]?A[.、:：)）]\s*\S[\s\S]*\s[(（]?B[.、:：)）]\s*\S)/i);
      if (inlineOptAnchor && inlineOptAnchor.index != null && inlineOptAnchor.index > 0) {
        const stemPart = headRest.slice(0, inlineOptAnchor.index).trim();
        const optPart = headRest.slice(inlineOptAnchor.index).trim();
        currentDraft.stemLines.push(stemPart);
        const splitHeadOpts = splitHorizontalOptionsLine(optPart);
        if (splitHeadOpts && splitHeadOpts.length > 0) {
          currentDraft.options.push(...splitHeadOpts);
        } else {
          currentDraft.stemLines[0] = headRest;
        }
      } else {
        currentDraft.stemLines.push(headRest);
      }

      drafts.push(currentDraft);
      draftByNum.set(num, currentDraft);
      continue;
    }

    // 5. 如果当前正在一个题面中，检查是否为选项行或答案解析行
    if (currentDraft) {
      // 检查行内是否标明了【答案】
      const ansMatch = line.match(INLINE_ANSWER_RE);
      if (ansMatch) {
        currentDraft.answer = ansMatch[1].trim();
        continue;
      }

      // 检查行内是否标明了【解析】
      const anaMatch = line.match(INLINE_ANALYSIS_RE);
      if (anaMatch) {
        currentDraft.analysisLines.push(anaMatch[1].trim());
        continue;
      }

      // 检查行内是否标明了【考点】
      const kpMatch = line.match(INLINE_KP_RE);
      if (kpMatch) {
        currentDraft.kp = kpMatch[1].trim();
        continue;
      }

      // 检查水平/单行选项（例如 "A. 3   B. -3   C. 1   D. 0"、"(A) 3 (B) -3"、"A $.83$ 分   B $.84$ 分"）
      const splitOpts = splitHorizontalOptionsLine(line);
      if (splitOpts && splitOpts.length > 0) {
        for (const optText of splitOpts) {
          currentDraft.options.push(optText);
        }
        continue;
      }

      // 多行选项粘连缝合与题干拼接：
      // 如果已经开始记录选项，则将该行拼接到上一选项的末尾（多行选项粘连拼接）
      if (currentDraft.options.length > 0) {
        currentDraft.options[currentDraft.options.length - 1] += "\n" + line;
      } else {
        // 否则作为题干后续行
        currentDraft.stemLines.push(line);
      }
    }
  }

  // 6. 整理统计大题分布
  const secCountMap = new Map<string, number>();
  for (const d of drafts) {
    secCountMap.set(d.sectionTitle, (secCountMap.get(d.sectionTitle) ?? 0) + 1);
  }
  for (const [title, count] of secCountMap) {
    sectionsSummary.push({ title, count });
  }

  // 7. 转换为小驴考试标准 Question[]
  const finalQuestions: Question[] = [];
  const defaultKp = options.defaultKp || "通识/综合";
  const sourceName = options.source || options.defaultBankName || "试卷智能切分导入";

  for (const d of drafts) {
    const rawStem = d.stemLines.join("\n").trim();
    if (!rawStem) continue;

    // 格式化题干：如果题干末尾有类似 (   ) 或 （   ），自动提取答案如果还没定
    let cleanStem = rawStem;
    let answer = d.answer;

    if (!answer) {
      const parenMatch = cleanStem.match(/[（(]\s*([A-Ja-j对错√×])\s*[）)]\s*$/);
      if (parenMatch) {
        answer = parenMatch[1].toUpperCase();
        // 将原题干中的答案挖空替换为标准的 (   )
        cleanStem = cleanStem.replace(/[（(]\s*([A-Ja-j对错√×])\s*[）)]\s*$/, "（   ）");
      }
    }

    // 判断题型修正：如果带有选项，则确保为 single 或 multiple
    let finalType = d.type;
    if (d.options.length >= 2 && finalType !== "single" && finalType !== "multiple") {
      finalType = "single";
    } else if (d.options.length === 0 && finalType === "single") {
      // 无选项的选择题，若题干含填空占位（含 \underline / \rule / （ ） / ____）则归为填空题，否则为简答题
      finalType = hasBlankPlaceholder(cleanStem) ? "fill" : "short";
    }

    // 答案归一化与缺答案保护（防静默填补假答案与破坏客观题真实性）
    let qStatus: Question["status"] = "published";
    if (finalType === "judge") {
      if (answer === "√" || answer.toLowerCase() === "true" || answer === "正确") answer = "对";
      else if (answer === "×" || answer.toLowerCase() === "false" || answer === "错误") answer = "错";
    }

    if (!answer && (finalType === "single" || finalType === "multiple" || finalType === "judge" || finalType === "fill" || finalType === "short")) {
      qStatus = "draft";
      if (finalType === "single" || finalType === "multiple" || finalType === "judge") {
        warnings.push(`第 ${d.num} 题未提取到有效答案，已降级为草稿 (draft)（待补答案，可在审校或题库补全）。`);
      }
    }

    const analysis = d.analysisLines.join("\n").trim();

    const q: Question = {
      id: newQuestionId(),
      type: finalType,
      stem: cleanStem,
      options: d.options,
      answer: answer || "",
      analysis,
      kp: d.kp || defaultKp,
      difficulty: 3,
      score: d.score,
      source: sourceName,
      status: qStatus,
      origin: "imported",
      hash: questionHash(cleanStem, d.options),
    };

    // 运行试题质检与自愈修正
    const { question: fixedQ } = autoFixQuestion(q);
    const lintReport = lintQuestion(fixedQ);
    fixedQ.confidence = Math.round(lintReport.score) / 100;
    fixedQ.lintIssues = lintReport.issues.map((i) => i.message);

    finalQuestions.push(fixedQ);
  }

  return {
    questions: finalQuestions,
    warnings,
    sections: sectionsSummary,
  };
}
