// ============================================================
// 小驴考试 · 服务桥与跨插件多别名公开 API（Epoch 6 / 47-04 / 48-06）
// 对外提供稳定入口、按需脱敏统计快照与概览。
// 遵循脱敏红线：无题目内容、无 key、无路径。
// ============================================================

import { emitExamEvent } from "./bus";
import type { Question } from "./types";

export const LVEXAM_BRIDGE_PROTOCOL = 1;
export const LVEXAM_API_NAME = "LvExam";
export const LVEXAM_API_ALIASES = [
  "LvExam",
  "siyuanExam",
  "xiaolvExam",
  "lvExam",
] as const;

export type LvExamApiAlias = (typeof LVEXAM_API_ALIASES)[number];

export interface LvExamBridgeOverview {
  protocol: number;
  version: string;
  capabilities: readonly string[];
  stats: unknown;
  updatedAt: string;
}

export interface ExtractToQuizOptions {
  text: string;
  sourceBlockId?: string;
  sourceTitle?: string;
  type?: "cloze" | "single" | "qa";
  bankId?: string;
}

/**
 * 面向 AI Agent 的三层只读取题协议 (MathBank 规范)
 * - candidate: 极简候选层（仅 ID/摘要/考点/状态，极低 Token 消耗，供粗筛）
 * - teaching: 完整教学层（完整题干/选项/解析/采分点，供备课出题）
 * - evidence: 深度证据链层（含考点依据/素材定位/题族/争议单，供严谨推导核验）
 */
export type AgentQuestionProfile = "candidate" | "teaching" | "evidence";

export interface QueryQuestionsOptions {
  profile?: AgentQuestionProfile;
  bankId?: string;
  kp?: string;
  type?: string;
  limit?: number;
  offset?: number;
  ids?: string[];
}

export interface CandidateQuestionItem {
  id: string;
  type: string;
  stemSummary: string;
  kp?: string;
  difficulty?: number;
  score: number;
  hasAnswer: boolean;
  hasAnalysis: boolean;
  hasRubric: boolean;
  hasOcclusion: boolean;
}

export interface TeachingQuestionItem {
  id: string;
  type: string;
  stem: string;
  options: string[];
  answer: string;
  analysis?: string;
  kp?: string;
  difficulty?: number;
  score: number;
  rubric?: unknown;
  source?: string;
  studyMeta?: unknown;
}

export interface EvidenceQuestionItem extends TeachingQuestionItem {
  secondaryKps?: string[];
  occlusion?: unknown;
  family?: unknown;
  answerSpec?: unknown;
  dispute?: unknown;
  hpath?: string;
  rootId?: string;
  blockId?: string;
}

export interface QueryQuestionsResult {
  profile: AgentQuestionProfile;
  total: number;
  limit: number;
  offset: number;
  truncated: boolean;
  items: (CandidateQuestionItem | TeachingQuestionItem | EvidenceQuestionItem)[];
}

/** 按所选层级将题目对象转换为对应返回契约 */
export function formatQuestionByProfile(
  q: Question,
  profile: AgentQuestionProfile = "candidate",
): CandidateQuestionItem | TeachingQuestionItem | EvidenceQuestionItem {
  if (profile === "candidate") {
    const rawStem = (q.stem || "").replace(/<[^>]*>/g, "").trim();
    return {
      id: q.id,
      type: q.type,
      stemSummary: rawStem.slice(0, 40) + (rawStem.length > 40 ? "…" : ""),
      kp: q.kp,
      difficulty: q.difficulty,
      score: q.score || 1,
      hasAnswer: !!q.answer,
      hasAnalysis: !!q.analysis,
      hasRubric: !!q.rubric,
      hasOcclusion: !!q.occlusion,
    };
  }

  const baseTeaching: TeachingQuestionItem = {
    id: q.id,
    type: q.type,
    stem: q.stem,
    options: q.options || [],
    answer: q.answer,
    analysis: q.analysis,
    kp: q.kp,
    difficulty: q.difficulty,
    score: q.score || 1,
    rubric: q.rubric,
    source: q.source,
    studyMeta: q.studyMeta,
  };

  if (profile === "teaching") {
    return baseTeaching;
  }

  return {
    ...baseTeaching,
    secondaryKps: q.secondaryKps,
    occlusion: q.occlusion,
    family: q.family,
    answerSpec: q.answerSpec,
    dispute: q.dispute,
    hpath: q.hpath,
    rootId: q.rootId,
    blockId: q.blockId,
  };
}

export interface ExamBridgeHost {
  version: string;
  openPractice: () => void;
  openWrongbook: () => void;
  openMock: () => void;
  openReport: () => void;
  getStats: () => unknown;
  statsRead: () => Promise<unknown>;
  extractToQuiz?: (options: ExtractToQuizOptions) => Promise<boolean> | boolean;
  queryQuestions?: (options: QueryQuestionsOptions) => Promise<QueryQuestionsResult> | QueryQuestionsResult;
  onBridgeDisposed?: () => void;
}

export interface LvExamBridgeApi {
  version: string;
  protocol: number;
  capabilities: readonly string[];
  whenReady: () => Promise<boolean>;
  hasCapability: (name: string) => boolean;
  open: () => void;
  practice: () => void;
  wrongbook: () => void;
  mock: () => void;
  report: () => void;
  extractToQuiz: (options: ExtractToQuizOptions) => Promise<boolean>;
  quickGenerateQuestion?: (options: any) => Promise<boolean>;
  queryQuestions: (options: QueryQuestionsOptions) => Promise<QueryQuestionsResult>;
  stats: () => unknown;
  statsRead: () => Promise<unknown>;
  getOverview: () => LvExamBridgeOverview;
}

function dispatchExamNavigated(target: "practice" | "wrongbook" | "mock" | "report") {
  try {
    emitExamEvent("open-view", { view: target });
  } catch {
    // 忽略事件发射异常，保证主导航调用不阻断
  }
}

export function buildLvExamBridge(host: ExamBridgeHost): LvExamBridgeApi {
  const capabilities = [
    "open",
    "practice",
    "wrongbook",
    "mock",
    "report",
    "extractToQuiz",
    "queryQuestions",
    "stats",
    "statsRead",
    "whenReady",
    "hasCapability",
    "getOverview",
  ] as const;

  return {
    version: host.version,
    protocol: LVEXAM_BRIDGE_PROTOCOL,
    capabilities,
    whenReady() {
      return Promise.resolve(true);
    },
    hasCapability(name: string) {
      return (capabilities as readonly string[]).includes(name);
    },
    async extractToQuiz(options: ExtractToQuizOptions) {
      if (!options?.text?.trim()) return false;
      host.openPractice();
      if (typeof host.extractToQuiz === "function") {
        await host.extractToQuiz(options);
      }
      try {
        emitExamEvent("open-creator", {
          text: options.text.trim(),
          sourceBlockId: options.sourceBlockId,
          sourceTitle: options.sourceTitle,
          type: options.type || "qa",
          bankId: options.bankId,
        });
      } catch {
        // 忽略异常保证调用安全
      }
      return true;
    },
    async quickGenerateQuestion(options: any) {
      const opts: ExtractToQuizOptions = {
        text: options?.text || "",
        sourceBlockId: options?.blockId || options?.sourceBlockId || options?.docId,
        sourceTitle: options?.title || options?.sourceTitle,
        type: options?.type || "qa",
        bankId: options?.bankId,
      };
      return this.extractToQuiz(opts);
    },
    async queryQuestions(options: QueryQuestionsOptions) {
      if (typeof host.queryQuestions === "function") {
        return Promise.resolve(host.queryQuestions(options));
      }
      return {
        profile: options.profile || "candidate",
        total: 0,
        limit: options.limit || 20,
        offset: options.offset || 0,
        truncated: false,
        items: [],
      };
    },
    open() {
      host.openPractice();
      dispatchExamNavigated("practice");
    },
    practice() {
      host.openPractice();
      dispatchExamNavigated("practice");
    },
    wrongbook() {
      host.openWrongbook();
      dispatchExamNavigated("wrongbook");
    },
    mock() {
      host.openMock();
      dispatchExamNavigated("mock");
    },
    report() {
      host.openReport();
      dispatchExamNavigated("report");
    },
    stats() {
      return host.getStats();
    },
    statsRead() {
      return host.statsRead();
    },
    getOverview() {
      return {
        protocol: LVEXAM_BRIDGE_PROTOCOL,
        version: host.version,
        capabilities,
        stats: host.getStats(),
        updatedAt: new Date().toISOString(),
      };
    },
  };
}

/**
 * 挂载考试服务桥到 window（多别名 + First-Instance-Wins + 身份校验安全注销）
 */
export function mountLvExamBridge(host: ExamBridgeHost): () => void {
  if (typeof window === "undefined") return () => undefined;
  const w = window as unknown as Record<string, unknown>;

  // 首实例独占保护：主别名已存在时静默跳过
  if (w[LVEXAM_API_NAME]) return () => undefined;

  const bridge = buildLvExamBridge(host);
  const mounted: string[] = [];

  for (const alias of LVEXAM_API_ALIASES) {
    if (!w[alias] || w[alias] === bridge) {
      w[alias] = bridge;
      mounted.push(alias);
    }
  }

  let disposed = false;
  return () => {
    if (disposed || w[LVEXAM_API_NAME] !== bridge) return;
    disposed = true;
    for (const alias of mounted) {
      if (w[alias] === bridge) {
        delete w[alias];
      }
    }
    host.onBridgeDisposed?.();
  };
}
