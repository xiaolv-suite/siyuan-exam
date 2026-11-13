// ============================================================
// 题库创建与全场景示范题库生命周期服务（bankLifecycleService.ts）
// 承接通用题库创建、多语种/资格证/K12示范题库元信息分发与失败容错
// 纯逻辑解耦，不绑定 Svelte 渲染态
// ============================================================

import type { ExamApp, BankInfo } from "@/app";
import type { Question } from "@/core/types";
import { getBankCategoryMeta, type BankCategory } from "@/core/bankCategory";
import { escapeHtml } from "@/libs/sanitize";
import type { MessageReporter } from "./printPaperService";
import { SAMPLE_BANK_NAME, SAMPLE_QUESTION_COUNT } from "@/core/sampleBank";
import { CANTONESE_SAMPLE_BANK_NAME, CANTONESE_SAMPLE_QUESTION_COUNT } from "@/core/cantoneseSample";
import { ENGLISH_SAMPLE_BANK_NAME, ENGLISH_SAMPLE_QUESTION_COUNT } from "@/core/englishSample";
import { QUALIFICATION_SAMPLE_BANK_NAME, QUALIFICATION_SAMPLE_QUESTION_COUNT } from "@/core/qualificationSample";
import { K12_SAMPLE_BANK_NAME, K12_SAMPLE_QUESTION_COUNT } from "@/core/k12Sample";
import { HIGHER_SAMPLE_BANK_NAME, HIGHER_SAMPLE_QUESTION_COUNT } from "@/core/higherSample";

export type SampleBankKind = "general" | "cantonese" | "english" | "qualification" | "k12" | "higher";

/**
 * 校验并归一化示范题库类型
 */
export function normalizeSampleBankKind(kind: unknown): SampleBankKind {
  if (
    kind === "cantonese" ||
    kind === "english" ||
    kind === "qualification" ||
    kind === "k12" ||
    kind === "higher"
  ) {
    return kind;
  }
  return "general";
}

/**
 * 获取示范题库对应的名称与内置题量
 */
export function getSampleBankMeta(kind: SampleBankKind): { targetName: string; targetCount: number } {
  switch (kind) {
    case "cantonese":
      return { targetName: CANTONESE_SAMPLE_BANK_NAME, targetCount: CANTONESE_SAMPLE_QUESTION_COUNT };
    case "english":
      return { targetName: ENGLISH_SAMPLE_BANK_NAME, targetCount: ENGLISH_SAMPLE_QUESTION_COUNT };
    case "qualification":
      return { targetName: QUALIFICATION_SAMPLE_BANK_NAME, targetCount: QUALIFICATION_SAMPLE_QUESTION_COUNT };
    case "k12":
      return { targetName: K12_SAMPLE_BANK_NAME, targetCount: K12_SAMPLE_QUESTION_COUNT };
    case "higher":
      return { targetName: HIGHER_SAMPLE_BANK_NAME, targetCount: HIGHER_SAMPLE_QUESTION_COUNT };
    case "general":
    default:
      return { targetName: SAMPLE_BANK_NAME, targetCount: SAMPLE_QUESTION_COUNT };
  }
}

/**
 * 执行通用空题库创建
 */
export async function executeCreateBank(
  app: ExamApp,
  newBankName: string,
): Promise<{ bank: BankInfo; banks: BankInfo[] }> {
  const b = await app.createBank(newBankName.trim());
  const banks = app.listBanks();
  return { bank: b, banks };
}

/**
 * 执行示范题库创建
 */
export async function executeCreateSampleBank(
  app: ExamApp,
  kind: SampleBankKind,
): Promise<{ bank: BankInfo; banks: BankInfo[]; targetCount: number; targetName: string }> {
  const { targetName, targetCount } = getSampleBankMeta(kind);
  const b = await app.createSampleBank(kind);
  const banks = app.listBanks();
  return { bank: b, banks, targetCount, targetName };
}

/**
 * 创建失败时定位并保留可能已经部分初始化的示范题库对象
 */
export function resolveRetainedSampleBank(
  app: ExamApp,
  targetName: string,
): { retainedBank: BankInfo | null; banks: BankInfo[] } {
  const banks = app.listBanks();
  const retainedBank = banks.find((b) => b.name === targetName && b.sampleState) ?? null;
  return { retainedBank, banks };
}

/**
 * 组装示范题库就绪或等待中的通知提示
 */
export function formatSampleNoticeText(
  actualLength: number,
  targetCount: number,
  hasError: boolean,
  t: (k: string) => string,
): string {
  if (actualLength >= targetCount && !hasError) {
    return t("guard.sampleReady").replace("{n}", String(targetCount));
  }
  return t("guard.samplePending").replace("{n}", String(actualLength)).replace("{total}", String(targetCount));
}

/**
 * 轮转题库场景分类（exam -> language -> teaching -> general）
 */
export async function executeCycleBankCategory(
  app: ExamApp,
  b: BankInfo,
): Promise<{ nextCategory: BankCategory; banks: BankInfo[]; badge: string }> {
  const order: BankCategory[] = ["exam", "language", "teaching", "general"];
  const curIdx = order.indexOf((b.category as BankCategory) ?? "general");
  const nextCategory = order[(curIdx + 1) % order.length];
  await app.updateBankCategory(b.id, nextCategory);
  const banks = app.listBanks();
  const badge = getBankCategoryMeta(nextCategory).badge;
  return { nextCategory, banks, badge };
}

/**
 * 将整个题库同步导出为思源笔记文档
 */
export async function executeSyncBankToDoc(
  app: ExamApp,
  bId: string,
): Promise<{ docId: string; title: string; hpath: string }> {
  return await app.syncBankToSiyuanDoc(bId);
}

/**
 * 将错题队列中的试题保存为思源笔记错题手册文档
 */
export async function executeSaveWrongbookToDoc(
  app: ExamApp,
  options: {
    bankName: string;
    activeBankId: string;
    questions: Question[];
    wrongQids: string[];
  },
): Promise<{ docId: string; title: string; count: number } | null> {
  const { bankName, activeBankId, questions, wrongQids } = options;
  const wrongSet = new Set(wrongQids);
  const qs = questions.filter((q) => wrongSet.has(q.id));
  if (!qs.length) return null;
  const title = `${bankName || "小驴题库"} · 错题攻坚手册（${qs.length}题）`;
  const res = await app.saveQuestionsToSiyuanDoc(title, qs, {
    bankId: activeBankId,
    isMock: false,
  });
  return { docId: res.docId, title: res.title, count: qs.length };
}

/**
 * 确认并移出题库管理（保留思源笔记物理文档）
 */
export async function executeRemoveBankWithConfirm(options: {
  app: ExamApp;
  activeBankId: string;
  bankName: string;
  confirmDialogSync: (opts: { title: string; content: string }) => Promise<boolean>;
  showMessage: MessageReporter;
  t: (k: string) => string;
}): Promise<{ removed: boolean; nextBanks?: BankInfo[]; nextActiveBankId?: string }> {
  const { app, activeBankId, bankName, confirmDialogSync, showMessage, t } = options;
  const ok = await confirmDialogSync({
    title: t("bank.removeTitle"),
    content: t("bank.removeConfirm").replace("{name}", escapeHtml(bankName)),
  });
  if (!ok) return { removed: false };

  try {
    await app.removeBank(activeBankId);
  } catch (e) {
    showMessage(String(e instanceof Error ? e.message : e), 4600, "error");
    return { removed: false };
  }

  const nextBanks = app.listBanks();
  const nextActiveBankId = nextBanks[0]?.id ?? "";
  showMessage(t("bank.removed"), 2800, "info");
  return { removed: true, nextBanks, nextActiveBankId };
}

/**
 * 解析并确定工作区启动时优先激活的目标题库 ID
 */
export function resolveInitialActiveBankId(options: {
  banks: Array<{ id: string }>;
  rememberedBankId?: string;
  pendingViewBankId?: string;
  pendingPracticeBankId?: string;
}): string {
  const { banks, rememberedBankId, pendingViewBankId, pendingPracticeBankId } = options;
  if (!banks.length) return "";
  const bankIds = new Set(banks.map((b) => b.id));
  if (pendingViewBankId && bankIds.has(pendingViewBankId)) return pendingViewBankId;
  if (pendingPracticeBankId && bankIds.has(pendingPracticeBankId)) return pendingPracticeBankId;
  if (rememberedBankId && bankIds.has(rememberedBankId)) return rememberedBankId;
  return banks[0].id;
}
