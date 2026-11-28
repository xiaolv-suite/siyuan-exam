import type { AppHost } from "./appContext";
import type { Question } from "../core/types";
import {
  deckNameForBank,
  questionToFlashCardMarkdown,
  selfRatingToRiffRating,
  pickSameKp,
  cramQueue,
  dailySet,
  dsrDailyReviewQueue,
} from "../core/memory";
import { pushDiagError } from "../libs/lv-notice-kit";
import {
  ratingOutcome,
  classifyWriteError,
  type RatingOutcomeView,
  type PendingRatingWrite,
} from "../core/ratingOutcome";
import { sha1like } from "../core/answer";
import { sanitizeRichHtml } from "../libs/sanitize";
import { filterEligibleQuestions } from "../core/dispute";
import { seededPickN } from "../core/random";
import { pickRandom } from "../core/session";
import { PENDING_RATING_KEY } from "../constants";

export class CardBridgeService {
  private deckNameCache = new Map<string, { id: string; ts: number }>();
  private dueCardsCache = new Map<string, { due: Set<string>; ts: number }>();
  private static readonly MAX_RENDER_CACHE = 1000;
  private renderCache = new Map<string, string>();

  constructor(private app: AppHost) {}

  async ensureDeck(bankName: string): Promise<string> {
    const full = deckNameForBank(bankName);
    const cached = this.deckNameCache.get(full);
    if (cached && Date.now() - cached.ts < 60_000) return cached.id;
    const decks = await this.app.bridge.getRiffDecks();
    const found = decks.find((d) => d.name === full);
    if (found) {
      this.deckNameCache.set(full, { id: found.id, ts: Date.now() });
      return found.id;
    }
    const createdId = await this.app.bridge.createRiffDeck(full);
    this.deckNameCache.set(full, { id: createdId, ts: Date.now() });
    return createdId;
  }

  async convertToCards(
    bankId: string,
    bankName: string,
    questions: (Question & { blockId?: string })[],
  ): Promise<number> {
    if (!questions.length) return 0;
    const deckId = await this.ensureDeck(bankName);

    if (this.app.kernelOnline && bankId) {
      const { notebookId, hpath } = this.app.qualifyBankHPath(bankId, "/学习闪卡");
      let docId: string | undefined;
      try {
        const rows = await this.app.bridge.sql<{ id: string }>(
          `SELECT id FROM blocks WHERE box = '${notebookId.replace(/'/g, "''")}' AND hpath = '${hpath.replace(/'/g, "''")}' AND type = 'd' LIMIT 1`,
        );
        docId = rows[0]?.id;
      } catch {
        /* 查询失败走新建路径 */
      }
      if (!docId) {
        try {
          docId = await this.app.bridge.createDocWithMd(
            notebookId,
            hpath,
            "# 学习闪卡册\n\n> 本卡册由小驴考试自动生成（卡片与题目）。正面思考，背面核对，已送入 FSRS 间隔重复卡包。\n",
          );
        } catch (e) {
          pushDiagError({ source: "小驴考试", message: `创建闪卡册文档失败，回退原块转卡：${e instanceof Error ? e.message : String(e)}` });
        }
      }

      if (docId) {
        const markdown = questions.map((q) => questionToFlashCardMarkdown(q)).join("\n\n");
        try {
          const newBlockIds = await this.app.bridge.appendBlock(docId, markdown);
          if (newBlockIds.length) {
            await this.app.bridge.addRiffCards(deckId, newBlockIds);
            return questions.length;
          }
        } catch (e) {
          pushDiagError({ source: "小驴考试", message: `追加闪卡块失败，回退原块转卡：${e instanceof Error ? e.message : String(e)}` });
        }
      }
    }

    const blockIds = questions.map((q) => q.blockId).filter((s): s is string => !!s);
    if (!blockIds.length) return 0;
    await this.app.bridge.addRiffCards(deckId, blockIds);
    return blockIds.length;
  }

  async createFlashCards(
    bankId: string,
    bankName: string,
    cards: { type: string; front: string; back: string; source: string }[],
  ): Promise<{ blockIds: string[] }> {
    if (!this.app.kernelOnline) throw new Error("离线：建卡需要内核可写");
    if (!cards.length) throw new Error("无候选卡");
    const deckId = await this.ensureDeck(bankName);
    const { notebookId, hpath } = this.app.qualifyBankHPath(bankId, "/AI 闪卡");
    let docId: string | undefined;
    try {
      const rows = await this.app.bridge.sql<{ id: string }>(
        `SELECT id FROM blocks WHERE box = '${notebookId.replace(/'/g, "''")}' AND hpath = '${hpath.replace(/'/g, "''")}' AND type = 'd' LIMIT 1`,
      );
      docId = rows[0]?.id;
    } catch { /* 查询失败走新建路径 */ }
    if (!docId) {
      docId = await this.app.bridge.createDocWithMd(
        notebookId,
        hpath,
        "# AI 闪卡\n\n> 由错题解析生成的最小卡候选（116-03）。删除本文档不影响题目与作答流水。\n",
      );
    }
    if (!docId) throw new Error("无法创建「AI 闪卡」文档");
    const markdown = cards.map((c) => `- 【AI·${c.type}】${c.front}\n  - ${c.back}（来源：${c.source}）`).join("\n");
    const blockIds = await this.app.bridge.appendBlock(docId, markdown);
    if (!blockIds.length) throw new Error("卡块写入失败（内核未返回块 id）");
    await this.app.bridge.addRiffCards(deckId, blockIds);
    return { blockIds };
  }

  async dueQuestions(bankName: string, questions: (Question & { blockId?: string })[]): Promise<Question[]> {
    if (!this.app.kernelOnline) return [];
    try {
      const name = deckNameForBank(bankName);
      const now = Date.now();
      const cachedDue = this.dueCardsCache.get(name);
      if (cachedDue && now - cachedDue.ts < 15_000) {
        return questions.filter((q) => q.blockId != null && cachedDue.due.has(q.blockId));
      }
      const deckId = await this.ensureDeck(bankName);
      if (!deckId) return [];
      const cards = await this.app.bridge.getDueCards(deckId);
      const due = new Set(cards.map((c) => String((c as { blockID?: string }).blockID ?? "")).filter(Boolean));
      this.dueCardsCache.set(name, { due, ts: now });
      if (!due.size) return [];
      return questions.filter((q) => q.blockId != null && due.has(q.blockId));
    } catch {
      return [];
    }
  }

  async reciteAnswer(
    bankName: string,
    q: Question & { blockId?: string },
    selfRating: 1 | 2 | 3 | 4,
    sessionId: string,
    timeMs = 0,
  ): Promise<RatingOutcomeView> {
    this.app.recordAttempt({
      qid: q.id,
      kind: "recite",
      mode: "recite",
      verdict: "not_attempted",
      myAnswer: null,
      selfRating,
      sessionId,
      queue: "normal",
      timeMs,
    });

    const rating = selfRatingToRiffRating(selfRating);
    let writeResult: "ok" | "timeout" | "network" | "fatal" | null = null;
    let hasCard = false;
    let cardId = "";
    let deckId = "";
    if (q.blockId && this.app.kernelOnline && rating != null) {
      try {
        deckId = await this.ensureDeck(bankName);
        const ids = await this.app.bridge.getCardIDsByBlockIDs([q.blockId], deckId);
        cardId = ids.get(q.blockId) ?? "";
        if (cardId) {
          hasCard = true;
          await this.app.bridge.reviewRiffCard(cardId, deckId, rating);
          writeResult = "ok";
        }
      } catch (e) {
        writeResult = classifyWriteError(e);
        if (cardId || deckId) {
          await this.rememberPendingRating({
            qid: q.id,
            blockId: q.blockId,
            deckId,
            cardId,
            rating,
            sessionId,
            requestedAt: this.app.deps.now?.() ?? Date.now(),
          }).catch(() => undefined);
        }
      }
    }

    return ratingOutcome({
      hasCard,
      kernelOnline: this.app.kernelOnline,
      ratingValid: rating != null,
      writeResult,
    });
  }

  private async rememberPendingRating(p: PendingRatingWrite): Promise<void> {
    const list = (await this.app.loadAux<PendingRatingWrite[]>(PENDING_RATING_KEY)) ?? [];
    const rest = list.filter((x) => !(x.sessionId === p.sessionId && x.qid === p.qid));
    rest.push(p);
    await this.app.saveAux(PENDING_RATING_KEY, rest);
  }

  async listPendingRatings(): Promise<PendingRatingWrite[]> {
    return (await this.app.loadAux<PendingRatingWrite[]>(PENDING_RATING_KEY)) ?? [];
  }

  async clearPendingRating(sessionId: string, qid: string): Promise<void> {
    const list = (await this.app.loadAux<PendingRatingWrite[]>(PENDING_RATING_KEY)) ?? [];
    await this.app.saveAux(PENDING_RATING_KEY, list.filter((x) => !(x.sessionId === sessionId && x.qid === qid)));
  }

  async queryQuestions(bankId: string, stmt: string): Promise<(Question & { blockId: string })[]> {
    const rows = await this.app.bridge.sql<Record<string, string>>(stmt);
    const ids = new Set(rows.map((r) => String(r.id ?? r.block_id ?? r.blockId ?? "")).filter(Boolean));
    if (!ids.size) return [];
    const all = await this.app.listQuestions(bankId);
    return all.filter((q) => ids.has(q.blockId));
  }

  peekRenderedStem(q: Question): string {
    if (!q?.stem) return "";
    const key = `${q.id}#${sha1like(q.stem)}`;
    return this.renderCache.get(key) ?? "";
  }

  async renderStem(q: Question): Promise<string> {
    const key = `${q.id}#${sha1like(q.stem)}`;
    if (this.renderCache.has(key)) {
      const cached = this.renderCache.get(key)!;
      this.renderCache.delete(key);
      this.renderCache.set(key, cached);
      return cached;
    }
    if (!this.app.kernelOnline) return "";
    try {
      const { renderMathDiagramsInText } = await import("../core/mathDiagram");
      const stemWithDiagrams = renderMathDiagramsInText(q.stem);
      const raw = await this.app.bridge.renderMarkdown(stemWithDiagrams);
      const html = sanitizeRichHtml(raw);
      if (this.renderCache.size >= CardBridgeService.MAX_RENDER_CACHE) {
        const oldest = this.renderCache.keys().next().value;
        if (oldest !== undefined) this.renderCache.delete(oldest);
      }
      this.renderCache.set(key, html);
      return html;
    } catch {
      return "";
    }
  }

  invalidateRenderCache(qid?: string): void {
    if (!qid) {
      this.renderCache.clear();
      return;
    }
    const prefix = `${qid}#`;
    for (const k of Array.from(this.renderCache.keys())) {
      if (k.startsWith(prefix)) {
        this.renderCache.delete(k);
      }
    }
  }

  recitePool(questions: Question[]): Question[] {
    const eligible = filterEligibleQuestions(questions);
    const graduated = new Set([...this.app.derived().reciteStreak.entries()].filter(([, s]) => s >= 4).map(([qid]) => qid));
    const wrongs = this.wrongDrill(eligible).filter((q) => !graduated.has(q.id));
    const wrongIds = new Set(wrongs.map((q) => q.id));
    const rest = eligible.filter((q) => !graduated.has(q.id) && !wrongIds.has(q.id));
    return wrongs.length ? wrongs : rest;
  }

  quickDrill(questions: Question[], n: number, seed?: string, opts?: { avoid?: Set<string> }): Question[] {
    const eligible = filterEligibleQuestions(questions);
    const avoid = opts?.avoid;
    const pool =
      avoid && avoid.size
        ? eligible.filter((q) => !avoid.has(q.id)).length >= n
          ? eligible.filter((q) => !avoid.has(q.id))
          : eligible
        : eligible;
    return seed ? seededPickN(pool, n, seed) : pickRandom(pool, n);
  }

  sameKpDrill(all: Question[], seed: Question, n: number, excludeIds: Set<string>): Question[] {
    return pickSameKp(all, seed, n, excludeIds);
  }

  cramDrill(questions: Question[], minWrong = 2, limit = 50): Question[] {
    const counts = new Map<string, number>();
    for (const w of this.app.derived().wrongbook.values()) counts.set(w.qid, w.wrongCount);
    return cramQueue(questions, counts, minWrong, limit);
  }

  dailyDrill(questions: Question[], dueFirst: Question[], n: number): Question[] {
    const counts = new Map<string, number>();
    for (const w of this.app.derived().wrongbook.values()) counts.set(w.qid, w.wrongCount);
    return dailySet(questions, dueFirst, counts, n);
  }

  dsrDailyDrill(questions: Question[], n: number, options?: { desiredRetention?: number; rnd?: () => number }): Question[] {
    return dsrDailyReviewQueue(questions, this.app.attempts.all(), n, options);
  }

  favDrill(questions: Question[]): Question[] {
    return questions.filter((q) => q.fav);
  }

  wrongDrill(questions: Question[]): Question[] {
    const active = new Set(this.app.wrongItems().map((w) => w.qid));
    return questions.filter((q) => active.has(q.id));
  }
}
