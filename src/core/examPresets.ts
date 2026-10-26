/**
 * 经典考试组卷预设模板库与错题组卷引擎 (Exam Presets & Wrongbook Exam Assembler)
 * 职责：
 * 1. 内置公务员行测、考研政治、法考、期末随堂测验等行业级标准化试卷蓝图；
 * 2. 结合题库题量智能平账，防题量溢出与分值失衡；
 * 3. 错题本一键生成全真限时模考卷（Wrongbook Exam Blueprint）。
 */

import type { Blueprint, BlueprintSection } from "./mock";
import type { Question, QuestionType, WrongItem } from "./types";

export interface ExamBlueprintPreset {
  id: string;
  title: string;
  category: "civil_service" | "postgraduate" | "law" | "academic" | "qualification" | "language" | "k12" | "micro";
  description: string;
  durationMinutes: number;
  passLine: number;
  sections: Array<{
    name: string;
    kpKeyword?: string;
    count: number;
    scoreEach: number;
    types: QuestionType[];
  }>;
}

export const EXAM_BLUEPRINT_PRESETS: ExamBlueprintPreset[] = [
  {
    id: "civil_service_general",
    title: "公务员行政职业能力测验（行测标准模考卷）",
    category: "civil_service",
    description: "经典五大模块架构（常识/言语/数量/推理/资料），标准 120 分钟限时",
    durationMinutes: 120,
    passLine: 60,
    sections: [
      { name: "第一部分 常识判断", kpKeyword: "常识", count: 20, scoreEach: 0.5, types: ["single"] },
      { name: "第二部分 言语理解与表达", kpKeyword: "言语", count: 35, scoreEach: 0.8, types: ["single"] },
      { name: "第三部分 数量关系", kpKeyword: "数量", count: 15, scoreEach: 0.8, types: ["single"] },
      { name: "第四部分 判断推理", kpKeyword: "判断", count: 40, scoreEach: 0.7, types: ["single"] },
      { name: "第五部分 资料分析", kpKeyword: "资料", count: 20, scoreEach: 1.0, types: ["single"] },
    ],
  },
  {
    id: "postgraduate_politics",
    title: "全国硕士研究生招生考试 · 思想政治理论客观卷",
    category: "postgraduate",
    description: "教育部标准考研政治客观题型配比（16 道单选 + 17 道多选），时限 50 分钟",
    durationMinutes: 50,
    passLine: 60,
    sections: [
      { name: "一、单项选择题", kpKeyword: "政治", count: 16, scoreEach: 1, types: ["single"] },
      { name: "二、多项选择题", kpKeyword: "政治", count: 17, scoreEach: 2, types: ["multiple"] },
    ],
  },
  {
    id: "law_exam_objective",
    title: "国家统一法律职业资格考试 · 客观题模拟卷",
    category: "law",
    description: "法考标准客观题配置（单选 50 题 + 多选/不定项 50 题），时限 180 分钟",
    durationMinutes: 180,
    passLine: 60,
    sections: [
      { name: "一、单项选择题", kpKeyword: "法", count: 50, scoreEach: 1, types: ["single"] },
      { name: "二、多项选择题", kpKeyword: "法", count: 50, scoreEach: 2, types: ["multiple"] },
    ],
  },
  {
    id: "teacher_qualification",
    title: "中小学教师资格考试（NTCE）·《综合素质》全真模考卷",
    category: "qualification",
    description: "中小学教师资格国家统一考试标准题型（单选 29 题 + 简答论述 3 题），时限 120 分钟",
    durationMinutes: 120,
    passLine: 70,
    sections: [
      { name: "一、单项选择题", kpKeyword: "教师", count: 29, scoreEach: 2, types: ["single"] },
      { name: "二、材料分析与简答论述题", kpKeyword: "教师", count: 3, scoreEach: 14, types: ["short"] },
    ],
  },
  {
    id: "fund_qualification",
    title: "基金从业人员资格考试 ·《证券投资基金法律法规与职业道德》模拟卷",
    category: "qualification",
    description: "中国证券投资基金业协会统一标准机考（100 道单选题，满分 100 分，及格线 60 分），时限 120 分钟",
    durationMinutes: 120,
    passLine: 60,
    sections: [
      { name: "第一部分 基金法律法规与合规管理", kpKeyword: "法规", count: 50, scoreEach: 1, types: ["single"] },
      { name: "第二部分 基金基础知识与职业道德", kpKeyword: "职业道德", count: 50, scoreEach: 1, types: ["single"] },
    ],
  },
  {
    id: "intermediate_qualification",
    title: "全国会计专业技术资格 ·《中级会计实务》全真模拟卷",
    category: "qualification",
    description: "财政部统一中级会计职称考试标准题型（单选 10 题 + 多选 10 题 + 判断 10 题），时限 120 分钟",
    durationMinutes: 120,
    passLine: 60,
    sections: [
      { name: "一、单项选择题", kpKeyword: "中级", count: 10, scoreEach: 1.5, types: ["single"] },
      { name: "二、多项选择题", kpKeyword: "中级", count: 10, scoreEach: 2, types: ["multiple"] },
      { name: "三、判断题", kpKeyword: "中级", count: 10, scoreEach: 1, types: ["judge"] },
    ],
  },
  {
    id: "higher_calculus_exam",
    title: "大学高等数学与微积分 · 期末考与考研高数模拟卷",
    category: "academic",
    description: "覆盖极限极值、一元微积分、多元微分与微分方程核心大题，时限 120 分钟",
    durationMinutes: 120,
    passLine: 60,
    sections: [
      { name: "一、基础单选题", kpKeyword: "高数", count: 10, scoreEach: 3, types: ["single"] },
      { name: "二、填空题", kpKeyword: "高数", count: 8, scoreEach: 4, types: ["fill"] },
      { name: "三、分析与综合论述题", kpKeyword: "高数", count: 4, scoreEach: 9.5, types: ["short"] },
    ],
  },
  {
    id: "english_cet_sprint",
    title: "多语言研学 · 大学英语与雅思核心突破模考卷",
    category: "language",
    description: "覆盖核心学术词汇辨析、日常口语交际、语法填空与短文判断，时限 45 分钟",
    durationMinutes: 45,
    passLine: 60,
    sections: [
      { name: "Part I. 词汇与短语单选题", kpKeyword: "词汇", count: 15, scoreEach: 2, types: ["single"] },
      { name: "Part II. 完形填空与语法词形变换", kpKeyword: "语法", count: 10, scoreEach: 3, types: ["fill"] },
      { name: "Part III. 阅读理解正误判断", count: 10, scoreEach: 2, types: ["judge"] },
    ],
  },
  {
    id: "k12_sprint",
    title: "K12 初高中 · 重点学科期中期末复习冲刺综合卷",
    category: "k12",
    description: "聚焦语数英理化核心基础知识、公式应用与解题技巧，时限 60 分钟",
    durationMinutes: 60,
    passLine: 60,
    sections: [
      { name: "一、基础单项选择题", count: 15, scoreEach: 3, types: ["single"] },
      { name: "二、核心知识填空题", count: 10, scoreEach: 3, types: ["fill"] },
      { name: "三、判断是非题", count: 5, scoreEach: 2, types: ["judge"] },
    ],
  },
  {
    id: "academic_final_exam",
    title: "高校课程期末 / 专业考证标准化综合卷",
    category: "academic",
    description: "单选、多选、判断综合考查，总分 100 分，时限 90 分钟",
    durationMinutes: 90,
    passLine: 60,
    sections: [
      { name: "一、单项选择题", count: 20, scoreEach: 2, types: ["single"] },
      { name: "二、多项选择题", count: 10, scoreEach: 3, types: ["multiple"] },
      { name: "三、判断是非题", count: 10, scoreEach: 1, types: ["judge"] },
      { name: "四、填空填图题", count: 5, scoreEach: 4, types: ["fill"] },
    ],
  },
  {
    id: "micro_quiz_sprint",
    title: "微测验 · 课后随堂快速抽查卷",
    category: "micro",
    description: "精炼 15 题快速复习，15 分钟极速完卷并出具学情诊断",
    durationMinutes: 15,
    passLine: 60,
    sections: [
      { name: "一、基础单选题", count: 10, scoreEach: 2, types: ["single"] },
      { name: "二、重点判断题", count: 5, scoreEach: 2, types: ["judge"] },
    ],
  },
];

/**
 * 获取所有内置蓝图预设
 */
export function listExamBlueprintPresets(): ExamBlueprintPreset[] {
  return [...EXAM_BLUEPRINT_PRESETS];
}

/**
 * 将指定预设应用并根据当前题库实际题量与考点自适应适配
 */
export function adaptPresetToBlueprint(
  presetId: string,
  bankQuestions: readonly Question[],
): Blueprint {
  const preset = EXAM_BLUEPRINT_PRESETS.find((p) => p.id === presetId) || EXAM_BLUEPRINT_PRESETS[4];
  const sections: BlueprintSection[] = [];

  for (const s of preset.sections) {
    // 过滤题库中满足题型与考点关键词的候选题目
    const matches = bankQuestions.filter((q) => {
      if (q.status === "deprecated") return false;
      const typeMatch = s.types.includes(q.type);
      if (!typeMatch) return false;
      if (s.kpKeyword && q.kp) {
        return q.kp.includes(s.kpKeyword);
      }
      return true;
    });

    // 智能配额：取预设题量与题库实际匹配数的合理下界（至少出 1 题）
    const actualCount = matches.length > 0 ? Math.min(s.count, matches.length) : Math.min(s.count, Math.max(1, bankQuestions.filter((q) => s.types.includes(q.type)).length));

    sections.push({
      name: s.name,
      kp: s.kpKeyword,
      count: actualCount > 0 ? actualCount : s.count,
      scoreEach: s.scoreEach,
      source: "mixed",
      types: s.types,
    });
  }

  return {
    id: `bp-${preset.id}-${Date.now().toString(36)}`,
    name: preset.title,
    durationS: preset.durationMinutes * 60,
    passLine: preset.passLine,
    shuffleOptions: true,
    sectionTimed: false,
    sections,
  };
}

/**
 * 错题本一键生成限时攻坚模拟考卷蓝图（Wrongbook Exam Generator）
 */
export function convertWrongbookToMockBlueprint(
  wrongItems: readonly WrongItem[],
  allQuestions: readonly Question[],
  options: { name?: string; durationMinutes?: number; scorePerQuestion?: number } = {},
): { blueprint: Blueprint; targetQuestions: Question[]; totalCount: number } {
  const wrongQids = new Set(wrongItems.map((w) => w.qid));
  // 提取可用错题（排除材料母题）
  const targetQuestions = allQuestions.filter((q) => wrongQids.has(q.id) && q.type !== "material" && q.status !== "deprecated");

  const count = targetQuestions.length;
  // 建议时限：客观题平均每题 60-90 秒，最少 10 分钟，最多 120 分钟
  const estimatedMin = options.durationMinutes ?? Math.max(10, Math.min(120, Math.ceil(count * 1.5)));
  const title = options.name || `错题攻坚全真限时卷（共 ${count} 题）`;

  // 按客观题与主观题分大段
  const singleCount = targetQuestions.filter((q) => q.type === "single").length;
  const multiCount = targetQuestions.filter((q) => q.type === "multiple").length;
  const judgeCount = targetQuestions.filter((q) => q.type === "judge").length;
  const fillCount = targetQuestions.filter((q) => q.type === "fill").length;
  const shortCount = targetQuestions.filter((q) => q.type === "short").length;

  const sections: BlueprintSection[] = [];
  const scoreEach = options.scorePerQuestion ?? (count > 0 ? Math.round(100 / count) || 1 : 2);

  if (singleCount > 0) {
    sections.push({ name: "一、单项选择题错题回炉", count: singleCount, scoreEach, source: "mixed", types: ["single"] });
  }
  if (multiCount > 0) {
    sections.push({ name: "二、多项选择题易错攻坚", count: multiCount, scoreEach: scoreEach * 2, source: "mixed", types: ["multiple"] });
  }
  if (judgeCount > 0) {
    sections.push({ name: "三、判断题陷阱排雷", count: judgeCount, scoreEach, source: "mixed", types: ["judge"] });
  }
  if (fillCount > 0) {
    sections.push({ name: "四、填空题记忆唤醒", count: fillCount, scoreEach, source: "mixed", types: ["fill"] });
  }
  if (shortCount > 0) {
    sections.push({ name: "五、主观论述题要点突破", count: shortCount, scoreEach: scoreEach * 4, source: "mixed", types: ["short"] });
  }

  // 兜底：若全是混合题型
  if (sections.length === 0) {
    sections.push({ name: "全真错题集中攻坚", count: Math.max(1, count), scoreEach, source: "mixed", types: ["single", "multiple", "judge", "fill", "short"] });
  }

  const blueprint: Blueprint = {
    id: `bp-wrongbook-${Date.now().toString(36)}`,
    name: title,
    durationS: estimatedMin * 60,
    passLine: 70, // 错题重练提高及格线至 70 分
    shuffleOptions: true,
    sectionTimed: false,
    sections,
  };

  return {
    blueprint,
    targetQuestions,
    totalCount: count,
  };
}
