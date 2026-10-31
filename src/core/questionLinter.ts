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
    } else if (options.length > 8) {
      issues.push({
        code: "TOO_MANY_OPTIONS",
        message: `选项数量异常偏多（共 ${options.length} 项）`,
        severity: "warning",
      });
      score -= 10;
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
  } else {
    // 4. 填空与简答题
    if (!answer && !q.analysis) {
      issues.push({
        code: "MISSING_ANSWER",
        message: "主观/填空题缺少参考答案与解析",
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
  const type = q.type || "single";
  let options = Array.isArray(q.options) ? [...q.options] : [];
  let answer = (q.answer ?? "").trim();
  const analysis = (q.analysis ?? "").trim();

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
