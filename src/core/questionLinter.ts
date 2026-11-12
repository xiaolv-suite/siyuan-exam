/**
 * 试题质量巡检器与置信度评分引擎 (Question Linter & Confidence Scorer)
 * 职责：
 * 1. 深度质检试题完整度（题干有效性、选项充分性、答案越界、判断题答案合法性、多选题格式）；
 * 2. 计算 0～100 的细粒度质量与置信度得分 (Confidence Score) 及对应风险等级 (high/medium/low)；
 * 3. 自动检测并修复常见缺陷（大小写纠偏、首尾脏标点清洗、判断题标准答案归一化）；
 * 4. 为导入校对面板提供结构化 Lint 告警与筛选依据。
 */

import type { Question } from "./types";
import { questionHash } from "./answer";

export type LintSeverity = "error" | "warning" | "info";

export interface QuestionLintIssue {
  code: string;
  message: string;
  severity: LintSeverity;
  autoFixable?: boolean;
}

export interface QuestionLintReport {
  score: number; // 0 - 100
  level: "high" | "medium" | "low"; // >=85: high, >=60: medium, <60: low
  issues: QuestionLintIssue[];
}

const JUDGE_AFFIRMATIVE = new Set(["对", "正确", "√", "v", "V", "true", "T", "YES", "Y", "是", "1"]);
const JUDGE_NEGATIVE = new Set(["错", "错误", "×", "x", "X", "false", "F", "NO", "N", "否", "0"]);

/**
 * 判定文本中是否包含真正的挖空占位符（连续下划线、空白括号、花括号挖空等）
 */
export function hasBlankPlaceholder(text: string): boolean {
  if (!text) return false;
  return /_{2,}|（\s*）|\(\s*\)|【\s*】|\[\s*\]|［\s*］|\{\{c\d+::/i.test(text);
}

/**
 * 深度质检单道试题，输出置信度评分与告警项
 */
export function lintQuestion(q: Partial<Question>): QuestionLintReport {
  const issues: QuestionLintIssue[] = [];
  let score = 100;

  const stem = String(q.stem ?? "").trim();
  const type = q.type || "single";
  const options = Array.isArray(q.options) ? q.options : [];
  const answer = String(q.answer ?? "").trim();

  // 1. 题干质检
  if (!stem) {
    issues.push({
      code: "EMPTY_STEM",
      message: "题干内容为空",
      severity: "error",
    });
    score -= 50;
  } else if (stem.length < 5) {
    issues.push({
      code: "STEM_TOO_SHORT",
      message: "题干字数过短（不足5字符），可能切题不全",
      severity: "warning",
    });
    score -= 30;
  } else if (stem.length > 800) {
    issues.push({
      code: "STEM_TOO_LONG",
      message: "题干篇幅过长（超过800字），疑似混入正文说明段落",
      severity: "info",
    });
    score -= 5;
  }

  // 2. 选择题（单选/多选）选项与答案交叉质检
  if (type === "single" || type === "multiple") {
    if (options.length === 0) {
      issues.push({
        code: "NO_OPTIONS",
        message: "选择题缺少候选项",
        severity: "error",
      });
      score -= 40;
    } else if (options.length === 1) {
      issues.push({
        code: "FEW_OPTIONS",
        message: "选择题仅有 1 个选项",
        severity: "error",
      });
      score -= 35;
    } else if (options.length > 6) {
      issues.push({
        code: "TOO_MANY_OPTIONS",
        message: `选择题选项异常偏多（共 ${options.length} 项，建议裁切为4项或转为简答）`,
        severity: options.length > 8 ? "error" : "warning",
        autoFixable: true,
      });
      score -= options.length > 8 ? 40 : 20;
    }

    // 检查重复选项
    const cleanOpts = options.map((o) => String(o ?? "").trim().toLowerCase());
    const uniqueOpts = new Set(cleanOpts);
    if (uniqueOpts.size < cleanOpts.length && cleanOpts.length > 1) {
      issues.push({
        code: "DUPLICATE_OPTIONS",
        message: "存在完全相同的重复选项",
        severity: "warning",
      });
      score -= 15;
    }

    // 检查是否有空选项文本
    if (cleanOpts.some((o) => !o)) {
      issues.push({
        code: "EMPTY_OPTION_TEXT",
        message: "存在空白内容的选项",
        severity: "warning",
      });
      score -= 15;
    }

    // 检查答案有效性
    if (!answer) {
      issues.push({
        code: "MISSING_ANSWER",
        message: "未检测到参考答案",
        severity: "error",
      });
      score -= 30;
    } else {
      // 检查答案是否越界（例如选项只有 A/B/C，但答案是 D）
      const maxLetterCode = 65 + options.length - 1; // 65 = 'A'
      const lettersInAnswer = (answer.match(/[A-Za-z]/g) || []).map((l) => l.toUpperCase());

      if (lettersInAnswer.length > 0) {
        const outOfBounds = lettersInAnswer.some((l) => l.charCodeAt(0) > maxLetterCode);
        if (outOfBounds && options.length > 0) {
          issues.push({
            code: "ANSWER_OUT_OF_BOUNDS",
            message: `参考答案 (${answer}) 超出了当前选项字母范围 (${String.fromCharCode(65)}~${String.fromCharCode(maxLetterCode)})`,
            severity: "error",
          });
          score -= 30;
        }

        // 小写字母答案提示可自动修复
        if (/[a-z]/.test(answer)) {
          issues.push({
            code: "LOWERCASE_ANSWER",
            message: "答案包含小写字母，建议归一化为大写",
            severity: "info",
            autoFixable: true,
          });
        }
      }
    }
  } else if (type === "judge") {
    // 3. 判断题质检
    if (!answer) {
      issues.push({
        code: "MISSING_ANSWER",
        message: "判断题缺少参考答案（对/错）",
        severity: "error",
      });
      score -= 30;
    } else {
      const isAff = JUDGE_AFFIRMATIVE.has(answer.toLowerCase()) || JUDGE_AFFIRMATIVE.has(answer);
      const isNeg = JUDGE_NEGATIVE.has(answer.toLowerCase()) || JUDGE_NEGATIVE.has(answer);
      if (!isAff && !isNeg) {
        issues.push({
          code: "INVALID_JUDGE_ANSWER",
          message: `判断题答案格式异常: "${answer}"，应为“对”或“错”`,
          severity: "warning",
          autoFixable: true,
        });
        score -= 20;
      }
    }
  } else if (type === "fill") {
    // 3. 填空题深度质检
    if (!answer && !q.analysis) {
      issues.push({
        code: "MISSING_ANSWER",
        message: "填空题缺少参考答案与解析",
        severity: "warning",
      });
      score -= 20;
    }
    const hasBlank = hasBlankPlaceholder(stem);
    if (!hasBlank) {
      const isQuestionPrompt = /^(?:什么是|简述|简答|解释|为什么|如何|请谈谈|请阐述|阐述|试述)|(?:区别|联系|定义|概念|特征|优缺点)[？?]?$|[？?]/.test(stem);
      issues.push({
        code: "FILL_WITHOUT_BLANK",
        message: isQuestionPrompt
          ? "填空题题干为问答句式且缺少挖空占位符（建议转为简答题）"
          : "填空题题干缺少挖空占位符（如 ____ 或 （ ））",
        severity: "warning",
        autoFixable: true,
      });
      score -= 25;
    }
  } else {
    // 4. 简答与主观题
    if (!answer && !q.analysis) {
      issues.push({
        code: "MISSING_ANSWER",
        message: "主观简答题缺少参考答案与采分要点",
        severity: "warning",
      });
      score -= 20;
    }
  }

  // 5. 启发式定义/笔记粗体等弱规则降权（保持审慎）
  const analysis = String(q.analysis ?? "");
  if (analysis.includes("列表概念摘录") || analysis.includes("粗体概念摘录")) {
    score = Math.min(score, 82);
  }

  const finalScore = Math.max(0, Math.min(100, score));
  let level: "high" | "medium" | "low";
  if (finalScore >= 85 && !issues.some((i) => i.severity === "error")) {
    level = "high";
  } else if (finalScore >= 60) {
    level = "medium";
  } else {
    level = "low";
  }

  return {
    score: finalScore,
    level,
    issues,
  };
}

/**
 * 试题自愈与自动纠偏：修复常见格式瑕疵
 */
export function autoFixQuestion(q: Question): { question: Question; fixedIssues: string[] } {
  const fixed: string[] = [];
  let stem = (q.stem ?? "").trim();
  let type = q.type || "single";
  let options = Array.isArray(q.options) ? [...q.options] : [];
  let answer = (q.answer ?? "").trim();
  let analysis = (q.analysis ?? "").trim();

  // 1. 题干多余空行折叠
  const cleanedStem = stem.replace(/\n{3,}/g, "\n\n").trim();
  if (cleanedStem !== stem) {
    fixed.push("压缩题干多余空白行");
    stem = cleanedStem;
  }

  // 2. 选择题答案大写纠偏与逗号标准化
  if (type === "single" || type === "multiple") {
    if (/[a-z]/.test(answer)) {
      answer = answer.toUpperCase();
      fixed.push("答案字母转大写");
    }
    if (type === "multiple" && /[,，、\s]+/.test(answer)) {
      // 多选答案规范化：如 "A B C" 或 "A、B、C" 转为 "ABC" 或 "A, B, C"
      const letters = Array.from(new Set((answer.match(/[A-Z]/g) || []))).sort();
      if (letters.length > 0) {
        answer = letters.join("");
        fixed.push("多选答案格式规范化");
      }
    }

    // 选项前置冗余标记清洗（如选项中依然带 "A. " 或 "- A. "，注意防止负数 "-3" 被误删）
    const cleanedOpts = options.map((opt, oi) => {
      const letter = String.fromCharCode(65 + oi);
      let s = opt.trim();
      s = s.replace(new RegExp(`^(?:[-*+•]\\s+)?(?:[（(【]?${letter}[.、:：)）】]\\s+)`, "i"), "");
      return s.trim();
    });
    if (cleanedOpts.some((co, i) => co !== options[i])) {
      fixed.push("清理选项前缀多余字母符号");
      options = cleanedOpts;
    }

    // 选项过多（> 6 项）自愈：如果答案在有效选项范围内，则裁切多余选项并保留到解析；如果无答案则转为简答题
    if (options.length > 6) {
      const validChoiceAns = /^[A-Fa-f]{1,6}$/.test(answer);
      if (!validChoiceAns || !answer) {
        // 转为简答题，保留全部选项到答案/解析
        type = "short";
        const formattedOpts = options.map((o, idx) => `${String.fromCharCode(65 + idx)}. ${o}`).join("\n");
        analysis = analysis ? `${analysis}\n\n【原选项归档】\n${formattedOpts}` : `【原选项归档】\n${formattedOpts}`;
        if (!answer) {
          answer = formattedOpts;
        }
        options = [];
        fixed.push(`异常超量选项（${q.options?.length ?? 0}项）已自动安全转换为简答题`);
      } else {
        const ansCodes = answer.toUpperCase().split("").map((l) => l.charCodeAt(0) - 65);
        const maxCode = Math.max(3, ...ansCodes);
        const keepCount = Math.min(options.length, Math.max(4, maxCode + 1));
        if (options.length > keepCount) {
          const trimmed = options.slice(keepCount);
          options = options.slice(0, keepCount);
          const extraStr = trimmed.map((o, idx) => `${String.fromCharCode(65 + keepCount + idx)}. ${o}`).join("\n");
          analysis = analysis ? `${analysis}\n\n【裁切的多余选项归档】\n${extraStr}` : `【裁切的多余选项归档】\n${extraStr}`;
          fixed.push(`裁切异常超额选项（保留前 ${keepCount} 项，多余项存入解析）`);
        }
      }
    }
  }

  // 3. 判断题答案归一化
  if (type === "judge") {
    const rawLower = answer.toLowerCase();
    if (JUDGE_AFFIRMATIVE.has(rawLower) || JUDGE_AFFIRMATIVE.has(answer)) {
      if (answer !== "对") {
        answer = "对";
        fixed.push("判断题正向答案归一为【对】");
      }
    } else if (JUDGE_NEGATIVE.has(rawLower) || JUDGE_NEGATIVE.has(answer)) {
      if (answer !== "错") {
        answer = "错";
        fixed.push("判断题负向答案归一为【错】");
      }
    }
  }

  // 4. 填空题自愈纠偏：如果题干没有任何挖空占位符，且为问答句式或长答案，自动安全转为简答题
  if (type === "fill") {
    if (!hasBlankPlaceholder(stem)) {
      const isQuestionPrompt = /^(?:什么是|简述|简答|解释|为什么|如何|请谈谈|请阐述|阐述|试述)|(?:区别|联系|定义|概念|特征|优缺点)[？?]?$|[？?]/.test(stem);
      if (isQuestionPrompt || answer.length > 20 || /[。；;！!\n]/.test(answer)) {
        type = "short";
        fixed.push("题干无挖空且为问答句式，已自动纠偏为【简答题】");
      }
    }
  }

  const updated: Question = {
    ...q,
    stem,
    type,
    options,
    answer,
    analysis,
    hash: questionHash(stem, options),
  };

  // 重新计算置信度
  const lint = lintQuestion(updated);
  updated.confidence = Math.round(lint.score) / 100;

  return { question: updated, fixedIssues: fixed };
}

/**
 * 裁切试题多余选项（默认保留前 4 项 A-D，超出内容归档至解析，绝不丢失知识点）
 */
export function pruneQuestionOptions(q: Question, maxCount = 4): Question {
  const options = Array.isArray(q.options) ? [...q.options] : [];
  if (options.length <= maxCount) return q;
  const kept = options.slice(0, maxCount);
  const extra = options.slice(maxCount);
  const extraStr = extra.map((o, idx) => `${String.fromCharCode(65 + maxCount + idx)}. ${o}`).join("\n");
  const analysis = q.analysis ? `${q.analysis}\n\n【裁切的多余选项归档】\n${extraStr}` : `【裁切的多余选项归档】\n${extraStr}`;
  const updated: Question = {
    ...q,
    options: kept,
    analysis,
    hash: questionHash(q.stem, kept),
  };
  const lint = lintQuestion(updated);
  updated.confidence = Math.round(lint.score) / 100;
  return updated;
}

/**
 * 将畸形或异常选择题一键安全转换为简答/论述题（保留所有选项到答案或解析中）
 */
export function convertQuestionToShort(q: Question): Question {
  const options = Array.isArray(q.options) ? [...q.options] : [];
  const formattedOpts = options.map((o, idx) => `${String.fromCharCode(65 + idx)}. ${o}`).join("\n");
  const answer = q.answer && q.answer.trim().length > 4 ? q.answer : formattedOpts || q.answer || "见解析";
  const analysis = q.analysis ? `${q.analysis}\n\n【原选项归档】\n${formattedOpts}` : (options.length ? `【原选项归档】\n${formattedOpts}` : q.analysis);
  const updated: Question = {
    ...q,
    type: "short",
    options: [],
    answer,
    analysis,
    hash: questionHash(q.stem, []),
  };
  const lint = lintQuestion(updated);
  updated.confidence = Math.round(lint.score) / 100;
  return updated;
}

/**
 * 将缺少挖空占位符的填空题一键转换为简答题
 */
export function convertFillWithoutBlankToShort(q: Question): Question {
  const updated: Question = {
    ...q,
    type: "short",
    options: [],
    hash: questionHash(q.stem, []),
  };
  const lint = lintQuestion(updated);
  updated.confidence = Math.round(lint.score) / 100;
  return updated;
}

