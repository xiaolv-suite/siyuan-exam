/**
 * 小驴学习题库研学场景分类定义（从狭义考试升维至广义研学）
 */

export type BankCategory = "exam" | "language" | "teaching" | "general";

export interface BankCategoryMeta {
  code: BankCategory;
  label: string;
  badge: string;
  icon: string;
  description: string;
}

export const BANK_CATEGORIES: Record<BankCategory, BankCategoryMeta> = {
  exam: {
    code: "exam",
    label: "全真备考",
    badge: "🎯 备考",
    icon: "clock",
    description: "考公、考研、法考、医考等标准化考试，支持限时模考与配时沙盘",
  },
  language: {
    code: "language",
    label: "多语言研学",
    badge: "🗣️ 语言",
    icon: "volume",
    description: "粤语口语、外语词汇、拼音音标与听读背诵",
  },
  teaching: {
    code: "teaching",
    label: "教学教研",
    badge: "👨‍🏫 教研",
    icon: "teacher",
    description: "教师备课出题、双栏试卷印刷、讲义教案与作业导学单",
  },
  general: {
    code: "general",
    label: "综合研学",
    badge: "🧠 通识",
    icon: "book",
    description: "读书笔记切片、专业通识、常识记忆与技能掌握",
  },
};

export function getBankCategoryMeta(category?: string | null): BankCategoryMeta {
  if (category && category in BANK_CATEGORIES) {
    return BANK_CATEGORIES[category as BankCategory];
  }
  return BANK_CATEGORIES.general;
}
