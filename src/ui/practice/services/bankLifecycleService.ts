// ============================================================
// 题库创建与全场景示范题库生命周期服务（bankLifecycleService.ts）
// 承接通用题库创建、多语种/资格证/K12示范题库元信息分发与失败容错
// 纯逻辑解耦，不绑定 Svelte 渲染态
// ============================================================

import type { ExamApp, BankInfo } from "@/app";
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
