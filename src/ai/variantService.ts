// ============================================================
// AI 考点变式衍生服务（AI Variant Generation Service）
// 连接全生态统一 AI 调度中枢（LvAiRouter），执行 4 维变式生成
// 支持流式/非流式输出、容错解析与离线兜底降级。
// ============================================================

import type { Question } from "../core/types";
import {
  type VariantKind,
  buildVariantPrompt,
  extractAndParseVariantJson,
  assembleVariantQuestion,
  generateOfflineVariantFallback,
  VARIANT_KINDS,
} from "../core/variantGenerator";
import { getSharedAiRouter } from "../libs/lv-ai-router";

export interface GenerateVariantOptions {
  seed: Question;
  kind?: VariantKind;
  timeoutMs?: number;
  onChunk?: (chunk: string) => void;
  allowOfflineFallback?: boolean;
}

export interface GenerateVariantResult {
  question: Question;
  kind: VariantKind;
  provider: string;
  isOfflineFallback: boolean;
  latencyMs: number;
}

/**
 * 调度全生态 AI 路由为指定错题/种子题生成变式题
 */
export async function generateVariantQuestion(
  options: GenerateVariantOptions,
): Promise<GenerateVariantResult> {
  const {
    seed,
    kind = "near_transfer",
    timeoutMs = 30000,
    onChunk,
    allowOfflineFallback = true,
  } = options;

  const start = Date.now();
  const { systemPrompt, userPrompt } = buildVariantPrompt(seed, kind);

  try {
    const router = getSharedAiRouter();
    const chatResult = await router.chat({
      taskType: "socratic",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      timeoutMs,
      stream: typeof onChunk === "function",
      onChunk,
    });

    if (chatResult.ok && chatResult.content) {
      try {
        const raw = extractAndParseVariantJson(chatResult.content);
        const question = assembleVariantQuestion(raw, seed, kind);
        return {
          question,
          kind,
          provider: chatResult.provider || "ai_router",
          isOfflineFallback: false,
          latencyMs: Date.now() - start,
        };
      } catch (parseErr) {
        // 如果 JSON 解析失败且允许离线兜底，则平滑降级
        if (allowOfflineFallback) {
          const fallbackQ = generateOfflineVariantFallback(seed, kind);
          return {
            question: fallbackQ,
            kind,
            provider: "offline_heuristic_fallback",
            isOfflineFallback: true,
            latencyMs: Date.now() - start,
          };
        }
        throw parseErr;
      }
    }

    // AI 调用未成功
    if (allowOfflineFallback) {
      const fallbackQ = generateOfflineVariantFallback(seed, kind);
      return {
        question: fallbackQ,
        kind,
        provider: "offline_fallback",
        isOfflineFallback: true,
        latencyMs: Date.now() - start,
      };
    }

    throw new Error(chatResult.error || "AI 调度未返回有效内容");
  } catch (err: any) {
    if (allowOfflineFallback) {
      const fallbackQ = generateOfflineVariantFallback(seed, kind);
      return {
        question: fallbackQ,
        kind,
        provider: "offline_fallback_catch",
        isOfflineFallback: true,
        latencyMs: Date.now() - start,
      };
    }
    throw new Error(`变式题生成失败: ${err?.message || err}`);
  }
}

export { VARIANT_KINDS };
