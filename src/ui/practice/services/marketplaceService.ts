/**
 * 题库与闪卡集市服务 (Marketplace Service)
 * 适配小驴考试与小驴闪卡通用的集市拉取、解析与本地思源题库入库服务
 */

import type { ExamApp } from "@/app";
import {
  type MarketplaceCatalog,
  type MarketplaceItem,
  DEFAULT_MARKETPLACE_CATALOG,
  validateMarketplaceCatalog,
} from "@/core/marketplace";
import { parseQCardsJson } from "@/core/qcard";
import type { Question } from "@/core/types";

export const MARKETPLACE_SOURCES_STORAGE_KEY = "lv-exam/marketplace-sources";

export interface CustomMarketplaceSource {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  addedAt: string;
}

/**
 * 读取用户自选的外部集市订阅源清单
 */
export function loadMarketplaceSources(readLocal: (k: string) => string | null): CustomMarketplaceSource[] {
  try {
    const raw = readLocal(MARKETPLACE_SOURCES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * 持久化用户自选的外部集市订阅源清单
 */
export function saveMarketplaceSources(
  writeLocal: (k: string, v: string) => void,
  sources: CustomMarketplaceSource[],
): void {
  try {
    writeLocal(MARKETPLACE_SOURCES_STORAGE_KEY, JSON.stringify(sources));
  } catch {
    /* ignore */
  }
}

/**
 * 拉取指定订阅源或官方精选集市目录
 */
export async function fetchMarketplaceCatalog(sourceUrl?: string): Promise<{
  catalog: MarketplaceCatalog;
  sourceName: string;
  isCustom: boolean;
  error?: string;
}> {
  if (!sourceUrl || sourceUrl === "official") {
    return {
      catalog: DEFAULT_MARKETPLACE_CATALOG,
      sourceName: DEFAULT_MARKETPLACE_CATALOG.name,
      isCustom: false,
    };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const resp = await fetch(sourceUrl, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    clearTimeout(timeout);

    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status} ${resp.statusText}`);
    }

    const json = await resp.json();
    const validation = validateMarketplaceCatalog(json);
    if (!validation.valid || !validation.catalog) {
      throw new Error(`订阅源格式不合规：${validation.errors.join("；")}`);
    }

    return {
      catalog: validation.catalog,
      sourceName: validation.catalog.name,
      isCustom: true,
    };
  } catch (err) {
    return {
      catalog: DEFAULT_MARKETPLACE_CATALOG,
      sourceName: "官方精选公版源（网络回退）",
      isCustom: false,
      error: `拉取外部源失败：${String(err instanceof Error ? err.message : err)}，已自动切回官方公版源`,
    };
  }
}

/**
 * 一键安装集市题库至思源笔记本地（创建新题库并批量入库）
 */
export async function installMarketplaceItem(
  item: MarketplaceItem,
  app: ExamApp,
  targetBankTitle?: string,
): Promise<{ success: boolean; bankId: string; count: number; error?: string }> {
  try {
    let questionsToInstall: Question[] = [];

    // 1. 若为内嵌题库直接提取
    if (item.downloadUrl.startsWith("embedded:") && item.embeddedQuestions?.length) {
      questionsToInstall = item.embeddedQuestions;
    } else if (item.downloadUrl.startsWith("http://") || item.downloadUrl.startsWith("https://")) {
      // 2. 外部 URL 动态拉取
      const resp = await fetch(item.downloadUrl);
      if (!resp.ok) throw new Error(`下载失败 HTTP ${resp.status}`);
      const text = await resp.text();

      // 尝试解析 QCard 协议
      const qcardRes = parseQCardsJson(text);
      if (qcardRes.valid && qcardRes.questions.length) {
        questionsToInstall = qcardRes.questions;
      } else {
        // 尝试以 JSON 或文本提取
        const json = JSON.parse(text);
        if (Array.isArray(json)) {
          questionsToInstall = json;
        } else if (Array.isArray(json.questions)) {
          questionsToInstall = json.questions;
        } else {
          throw new Error("外部资源格式未能识别为有效的试题包");
        }
      }
    } else if (item.embeddedQuestions?.length) {
      questionsToInstall = item.embeddedQuestions;
    } else {
      throw new Error("当前资源未提供有效的下载直链或内嵌题库内容");
    }

    if (!questionsToInstall.length) {
      throw new Error("该资源中未解析到任何有效题目");
    }

    // 3. 在思源笔记中创建独立题库
    const bankName = (targetBankTitle || item.title).trim();
    const newBank = await app.createBank(bankName);
    if (!newBank || !newBank.id) {
      throw new Error("创建思源本地题库失败");
    }

    // 4. 批量写入试题到新题库
    for (const q of questionsToInstall) {
      const qWithOrigin: Question = {
        ...q,
        origin: "imported",
        source: item.title,
        sourceKind: "mock",
      };
      await app.writeManualQuestion(newBank.id, qWithOrigin);
    }

    return {
      success: true,
      bankId: newBank.id,
      count: questionsToInstall.length,
    };
  } catch (err) {
    return {
      success: false,
      bankId: "",
      count: 0,
      error: String(err instanceof Error ? err.message : err),
    };
  }
}

/**
 * 将试题篮中的跨学科题目保存至思源本地题库
 */
export async function installCartQuestionsToBank(
  app: ExamApp,
  bankTitle: string,
  questions: Question[],
): Promise<{ success: boolean; bankId: string; count: number; error?: string }> {
  try {
    const newBank = await app.createBank(bankTitle.trim());
    if (!newBank || !newBank.id) {
      throw new Error("创建思源本地题库失败");
    }
    for (const q of questions) {
      await app.writeManualQuestion(newBank.id, q);
    }
    return {
      success: true,
      bankId: newBank.id,
      count: questions.length,
    };
  } catch (err) {
    return {
      success: false,
      bankId: "",
      count: 0,
      error: String(err instanceof Error ? err.message : err),
    };
  }
}

