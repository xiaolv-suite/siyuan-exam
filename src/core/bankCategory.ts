/**
 * 小驴考试题库场景分类定义
 */

export type BankCategory =
  | "exam"
  | "language"
  | "teaching"
  | "general"
  | "k12"
  | "higher"
  | "certificate";

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
    label: "标准化大考",
    badge: "🎯 备考",
    icon: "clock",
    description: "公考行测申论、国家法考、医考等全真标准化大考，支持全流程限时模考",
  },
  certificate: {
    code: "certificate",
    label: "职业资格考证",
    badge: "📜 考证",
    icon: "badge",
    description: "教师资格证（教资）、基金从业资格证、中级职称（会计/经济师）等职业证书特训",
  },
  k12: {
    code: "k12",
    label: "K12基础教育",
    badge: "🎒 基础",
    icon: "academic",
    description: "幼儿园幼小衔接、小学基础学科、初中中考冲刺、高中高考全科系统学习",
  },
  higher: {
    code: "higher",
    label: "大学与考研硕博",
    badge: "🎓 学术",
    icon: "book",
    description: "高等数学微积分/线代、大学英语四六级、考研公共课与硕博专业课学术研习",
  },
  language: {
    code: "language",
    label: "多语言研学",
    badge: "🗣️ 语言",
    icon: "volume",
    description: "英语（四六级/雅思/托福）、地道粤语日常口语、发音音标与听辨背诵",
  },
  teaching: {
    code: "teaching",
    label: "教学教研",
    badge: "👨‍🏫 教研",
    icon: "teacher",
    description: "教师备课出题、双栏试卷印刷、讲义教案与分层作业导学单",
  },
  general: {
    code: "general",
    label: "终身通识研学",
    badge: "🧠 通识",
    icon: "book",
    description: "读书笔记切片、思源双链知识沉淀、专业通识常识记忆与技能掌握",
  },
};

export function getBankCategoryMeta(category?: string | null): BankCategoryMeta {
  if (category && category in BANK_CATEGORIES) {
    return BANK_CATEGORIES[category as BankCategory];
  }
  return BANK_CATEGORIES.general;
}
