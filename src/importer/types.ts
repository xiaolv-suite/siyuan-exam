import type { Question } from "../core/types";

export type DuplicateStrategy = "skip" | "coexist" | "update";

export interface ImportOptions {
  kp?: string; // 整批兜底考点
  difficulty?: number;
  source?: string;
  sourceKind?: "real" | "mock";
  dedupe?: boolean; // 默认 true：批内 + 与已存在 hash 集合去重
  /** 38-03：重复合并策略（默认 skip；coexist 由调用方以空 existingHashes 表达） */
  duplicateStrategy?: DuplicateStrategy;
  existingHashes?: Set<string>;
  /** 内部：材料组自动分组的进行中组 ID（parseExcelRows 维护） */
  _pendingGroup?: string;
}

export interface ImportError {
  row: number; // 1-based 数据行
  reason: string;
  raw: string;
}

export interface ImportReport {
  ok: Question[];
  errors: ImportError[];
  duplicates: number;
  batch: string;
  /** 已有题摘要回灌（TODO 2.3）：与题库/本批重复的行样本（上限 20；text 路径暂不收集） */
  dupeSamples?: { row: number; stem: string }[];
  /** 38-03 更新式重导：重复指纹但内容可更新答案/解析的行（duplicateStrategy="update" 时产出） */
  updates?: { row: number; q: Question }[];
}

/** 38-04 / U08 导入断点检查点：记录中途取消、写入故障或未完成入库的批次状态 */
export interface ImportCheckpoint {
  v: 1;
  batch: string;
  bankId: string;
  createdAt: number;
  confirmedIds: string[];
  pendingQuestions: Question[];
  docs: string[];
}

/** 纯函数：根据当前批次全量题目与已读回确认的 ID 清单构造断点，无剩余题返回 null */
export function buildImportCheckpoint(params: {
  batch: string;
  bankId: string;
  allQuestions: Question[];
  confirmedIds: string[];
  docs?: string[];
  now?: number;
}): ImportCheckpoint | null {
  const confirmedSet = new Set(params.confirmedIds);
  const pending = params.allQuestions.filter((q) => !confirmedSet.has(q.id));
  if (!pending.length) return null;
  return {
    v: 1,
    batch: params.batch,
    bankId: params.bankId,
    createdAt: params.now ?? Date.now(),
    confirmedIds: params.confirmedIds,
    pendingQuestions: pending,
    docs: params.docs ?? [],
  };
}

/** Excel 列契约映射：题号(忽略)|题型|题干|选项A-F|答案|解析|难度|知识点|分值|来源 */
export interface ExcelColumnMap {
  type: number;
  stem: number;
  answer: number;
  options: number[]; // 2-6 个列下标
  analysis?: number;
  difficulty?: number;
  kp?: number;
  score?: number;
  source?: number;
}
