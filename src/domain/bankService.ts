// ============================================================
// BankDomainService: 题库中心领域服务（S4 切片架构解耦）
// - 从 ExamApp 上帝类抽离题库生命周期编排与保活
// - 题库增删改查、统一小驴空间子树与独立笔记本创建
// - 示例题库分级写入与题目检索映射
// ============================================================
import type { Question } from "../core/types";
import type { BankCategory } from "../core/bankCategory";

export interface BankInfo {
  id: string;
  name: string;
  createdAt: number;
  /** 统一小驴空间下的宿主笔记本 ID（未设置时向下兼容等同于 id） */
  notebookId?: string;
  /** 统一小驴空间下的题库子树根路径，如 "/06-小驴考试/题库中心/基础学习题库" */
  rootHPath?: string;
  /** 研学场景分类：exam 备考 | language 语言 | teaching 教学 | general 通识 */
  category?: BankCategory;
  /** 显式创建的演示库；pending 允许写入失败后继续，ready 时只打开已有题库。 */
  sampleState?: "pending" | "ready";
  /** 写入前持久化目标文档和题目身份，重试不依赖异步 SQL 索引。 */
  sampleHomeDocId?: string;
  sampleDocId?: string;
  sampleQuestionIds?: Record<string, string>;
}
import {
  BANK_REGISTRY_KEY,
} from "../constants";
import { SAMPLE_BANK_NAME, SAMPLE_BANK_INTRO, sampleQuestions } from "../core/sampleBank";
import { CANTONESE_SAMPLE_BANK_NAME, CANTONESE_SAMPLE_BANK_INTRO, cantoneseSampleQuestions } from "../core/cantoneseSample";
import { ENGLISH_SAMPLE_BANK_NAME, ENGLISH_SAMPLE_BANK_INTRO, englishSampleQuestions } from "../core/englishSample";
import { QUALIFICATION_SAMPLE_BANK_NAME, QUALIFICATION_SAMPLE_BANK_INTRO, qualificationSampleQuestions } from "../core/qualificationSample";
import { K12_SAMPLE_BANK_NAME, K12_SAMPLE_BANK_INTRO, k12SampleQuestions } from "../core/k12Sample";
import { HIGHER_SAMPLE_BANK_NAME, HIGHER_SAMPLE_BANK_INTRO, higherSampleQuestions } from "../core/higherSample";
import type { IHostBridge } from "../bridge/hostBridge";
import type { StorageGateway } from "../storage/storageGateway";
import { pushDiagError, safeDocTitleFromHPath } from "../libs/lv-notice-kit";

export interface BankDomainDeps {
  bridge: IHostBridge;
  storage: StorageGateway;
  ensureTier2Loaded: () => Promise<void>;
  assertStorageWritable: () => void;
  isKernelOnline: () => boolean;
  questionBlockMap?: Map<string, string>;
  onInvalidate?: () => void;
  now?: () => number;
}

const sha1like = (s: string) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(16).padStart(8, "0");
};

export class BankDomainService {
  banks: BankInfo[] = [];
  private sampleBankCreation: Promise<BankInfo> | null = null;
  readonly ensuredDocIds = new Map<string, string>();
  private readonly ensuringDocPromises = new Map<string, Promise<string>>();
  private readonly questionBlockMap: Map<string, string>;

  constructor(private readonly deps: BankDomainDeps) {
    this.questionBlockMap = deps.questionBlockMap ?? new Map<string, string>();
  }

  listBanks(): BankInfo[] {
    return [...this.banks];
  }

  setBanks(banks: BankInfo[]): void {
    this.banks = [...banks];
  }

  getBank(id: string): BankInfo | undefined {
    return this.banks.find((b) => b.id === id);
  }

  private lastActiveBankId?: string;

  recordActiveBank(bankId: string): void {
    if (bankId && this.banks.some((b) => b.id === bankId)) {
      this.lastActiveBankId = bankId;
    }
  }

  resolvePreferredBank(notebookIdOrDocId?: string): BankInfo | null {
    if (!this.banks.length) return null;
    if (notebookIdOrDocId) {
      const matched = this.banks.find((b) => (b.notebookId && b.notebookId === notebookIdOrDocId) || b.id === notebookIdOrDocId);
      if (matched) return matched;
    }
    if (this.lastActiveBankId) {
      const active = this.banks.find((b) => b.id === this.lastActiveBankId);
      if (active) return active;
    }
    return this.banks[0] ?? null;
  }

  async updateBankCategory(id: string, category: BankCategory): Promise<BankInfo> {
    const target = this.banks.find((b) => b.id === id);
    if (!target) throw new Error("未找到对应题库");
    const previous = [...this.banks];
    target.category = category;
    this.banks = [...this.banks];
    try {
      await this.saveBankRegistry();
      this.deps.onInvalidate?.();
      return target;
    } catch (e) {
      this.banks = previous;
      throw e;
    }
  }

  resolveBankScope(bankId: string): { notebookId: string; rootHPath: string } {
    const bank = this.getBank(bankId);
    const notebookId = bank?.notebookId || bankId;
    const rootHPath = bank?.rootHPath ? bank.rootHPath.replace(/\/+$/, "") : "";
    return { notebookId, rootHPath };
  }

  qualifyBankHPath(bankId: string, hpath: string): { notebookId: string; hpath: string } {
    const { notebookId, rootHPath } = this.resolveBankScope(bankId);
    const cleanSub = hpath.startsWith("/") ? hpath : `/${hpath}`;
    if (!rootHPath) return { notebookId, hpath: cleanSub };
    const cleanRoot = rootHPath.replace(/\/+$/, "");
    return { notebookId, hpath: `${cleanRoot}${cleanSub}` };
  }

  async resolveUnifiedExamHubNotebook(): Promise<{ notebookId: string; rootPrefix: string } | null> {
    if (typeof this.deps.bridge.listNotebooks !== "function") return null;
    try {
      const notebooks = await this.deps.bridge.listNotebooks();
      if (!Array.isArray(notebooks) || notebooks.length === 0) return null;
      const hub = notebooks.find(
        (n) => /^(🐴\s*)?小驴(生态|空间|笔记本)/.test(n.name?.trim() || "")
      );
      if (hub?.id) {
        return { notebookId: hub.id, rootPrefix: "/06-小驴考试/题库中心" };
      }
    } catch {
      /* 忽略探测异常，回退独立建库 */
    }
    return null;
  }

  async saveBankRegistry(): Promise<void> {
    await this.deps.ensureTier2Loaded();
    return this.deps.storage.save(
      BANK_REGISTRY_KEY,
      this.banks.map((b) => ({ ...b, sampleQuestionIds: b.sampleQuestionIds ? { ...b.sampleQuestionIds } : undefined })),
    );
  }

  async ensureDoc(bankId: string, hpath: string, markdown?: string): Promise<string> {
    const { notebookId, hpath: fullHPath } = this.qualifyBankHPath(bankId, hpath);
    const cacheKey = `${notebookId}\0${fullHPath}`;
    const cached = this.ensuredDocIds.get(cacheKey);
    if (cached) return cached;
    const inflight = this.ensuringDocPromises.get(cacheKey);
    if (inflight) return inflight;

    const task = (async () => {
      const findExisting = async () => {
        const existing = await this.deps.bridge.sql<{ id: string }>(
          `SELECT id FROM blocks WHERE box='${notebookId.replace(/'/g, "''")}' AND hpath='${fullHPath.replace(/'/g, "''")}' AND type='d' ORDER BY updated DESC LIMIT 1`,
        );
        return existing[0]?.id ? String(existing[0].id) : "";
      };

      const initial = await findExisting();
      if (initial) {
        this.ensuredDocIds.set(cacheKey, initial);
        return initial;
      }

      let lastErr: unknown;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const created = await this.deps.bridge.createDocWithMd(notebookId, fullHPath, markdown ?? `# ${safeDocTitleFromHPath(fullHPath)}\n\n`);
          if (created) {
            this.ensuredDocIds.set(cacheKey, created);
            return created;
          }
          await new Promise((r) => setTimeout(r, 200 * (attempt + 1)));
          const again = await findExisting();
          if (again) {
            this.ensuredDocIds.set(cacheKey, again);
            return again;
          }
        } catch (e) {
          lastErr = e;
          const msg = String(e instanceof Error ? e.message : e);
          if (/metadata is not ready|not ready|busy|locked/i.test(msg) && attempt < 2) {
            await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
            const checked = await findExisting().catch(() => "");
            if (checked) {
              this.ensuredDocIds.set(cacheKey, checked);
              return checked;
            }
            continue;
          }
          throw e;
        }
      }
      const finalDoc = await findExisting().catch(() => "");
      if (finalDoc) {
        this.ensuredDocIds.set(cacheKey, finalDoc);
        return finalDoc;
      }
      if (lastErr) throw lastErr;
      return "";
    })();

    this.ensuringDocPromises.set(cacheKey, task);
    try {
      return await task;
    } finally {
      this.ensuringDocPromises.delete(cacheKey);
    }
  }

  async upsertDocWithMd(bankId: string, hpath: string, markdown: string): Promise<string> {
    const { notebookId, hpath: fullHPath } = this.qualifyBankHPath(bankId, hpath);
    const cacheKey = `${notebookId}\0${fullHPath}`;
    let existingId = this.ensuredDocIds.get(cacheKey) || "";
    if (!existingId && typeof this.deps.bridge.sql === "function") {
      try {
        const rows = await this.deps.bridge.sql<{ id: string }>(
          `SELECT id FROM blocks WHERE box='${notebookId.replace(/'/g, "''")}' AND hpath='${fullHPath.replace(/'/g, "''")}' AND type='d' ORDER BY updated DESC LIMIT 1`,
        );
        if (rows[0]?.id) existingId = String(rows[0].id);
      } catch {
        /* 查询失败走创建分支 */
      }
    }
    if (existingId) {
      this.ensuredDocIds.set(cacheKey, existingId);
      if (typeof this.deps.bridge.updateBlock === "function") {
        try {
          await this.deps.bridge.updateBlock(existingId, markdown);
        } catch {
          /* 宿主不支持直接 updateBlock 时保留原文档 */
        }
      }
      return existingId;
    }
    const created = (await this.deps.bridge.createDocWithMd(notebookId, fullHPath, markdown)) || (await this.ensureDoc(bankId, hpath, markdown));
    if (created) this.ensuredDocIds.set(cacheKey, created);
    return created;
  }

  async createBank(name: string, category: BankCategory = "general"): Promise<BankInfo> {
    this.deps.assertStorageWritable();
    const clean = name.trim();
    if (!clean) throw new Error("题库名不能为空");
    const hub = await this.resolveUnifiedExamHubNotebook();
    let info: BankInfo;
    if (hub) {
      const rootHPath = `${hub.rootPrefix}/${clean.replace(/\//g, "·")}`;
      const bankId = `bank-${sha1like(`${hub.notebookId}:${rootHPath}:${Date.now()}`).slice(0, 12)}`;
      info = { id: bankId, notebookId: hub.notebookId, rootHPath, name: clean, createdAt: Date.now(), category };
    } else {
      const notebookId = await this.deps.bridge.createNotebook(`题库/${clean}`);
      info = { id: notebookId, name: clean, createdAt: Date.now(), category };
    }
    const targetNbId = info.notebookId || info.id;
    const prefix = info.rootHPath || "";
    try {
      await this.deps.bridge.createDocWithMd(
        targetNbId,
        `${prefix}/首页`,
        `# 题库：${clean}\n\n> 本题库由小驴考试管理。章节文档存放题目与试卷。\n> 可在练习台导入题目，或删除「示例题」文档后自建章节。\n`,
      );
    } catch (e) {
      pushDiagError({ source: "小驴考试", message: `题库首页初始化失败：${e instanceof Error ? e.message : String(e)}` });
    }
    try {
      const docId = await this.deps.bridge.createDocWithMd(
        targetNbId,
        `${prefix}/示例题`,
        `# 示例题\n\n> 体验用：可直接开始练习/转闪卡；正式使用前可整篇删除。\n`,
      );
      const { makeQuestion } = await import("../core/blockTemplate");
      const samples = [
        makeQuestion({ type: "single", stem: "小驴考试的作答流水保存在哪里？", options: ["插件本地的 append-only 流水存储", "思源云端", "题目块的 custom-exam-* 属性里"], answer: "A", analysis: "作答流水 append-only 存于插件存储，与题目块解耦（docs/02 §2.3）。", kp: "示例/基础" }),
        makeQuestion({ type: "judge", stem: "错题连对 2 次后自动移出错题本。", options: [], answer: "对", kp: "示例/机制" }),
        makeQuestion({ type: "fill", stem: "智能记忆调度唯一需要理解的参数是期望____率。", options: [], answer: "保留", kp: "示例/记忆" }),
      ];
      if (docId) await this.deps.bridge.appendQuestions(docId, samples);
    } catch (e) {
      pushDiagError({ source: "小驴考试", message: `示例题初始化未完成：${e instanceof Error ? e.message : String(e)}` });
    }
    const previous = this.banks;
    this.banks = [...previous, info];
    try {
      await this.saveBankRegistry();
    } catch (e) {
      this.banks = previous;
      throw e;
    }
    return info;
  }

  createSampleBank(kind: "general" | "cantonese" | "english" | "qualification" | "k12" | "higher" = "general"): Promise<BankInfo> {
    if (this.sampleBankCreation) return this.sampleBankCreation;
    this.sampleBankCreation = this.writeSampleBank(kind).finally(() => { this.sampleBankCreation = null; });
    return this.sampleBankCreation;
  }

  private async writeSampleBank(kind: "general" | "cantonese" | "english" | "qualification" | "k12" | "higher" = "general"): Promise<BankInfo> {
    this.deps.assertStorageWritable();
    if (!this.deps.isKernelOnline()) throw new Error("思源内核未连接，请恢复连接后再创建示例题库。");
    let bankName = SAMPLE_BANK_NAME;
    let bankIntro = SAMPLE_BANK_INTRO;
    let getQuestions = sampleQuestions;
    let docTitle = "示例题";
    let category: BankCategory = "general";

    if (kind === "cantonese") {
      bankName = CANTONESE_SAMPLE_BANK_NAME;
      bankIntro = CANTONESE_SAMPLE_BANK_INTRO;
      getQuestions = cantoneseSampleQuestions;
      docTitle = "粤语口语研学";
      category = "language";
    } else if (kind === "english") {
      bankName = ENGLISH_SAMPLE_BANK_NAME;
      bankIntro = ENGLISH_SAMPLE_BANK_INTRO;
      getQuestions = englishSampleQuestions;
      docTitle = "英语核心研学";
      category = "language";
    } else if (kind === "qualification") {
      bankName = QUALIFICATION_SAMPLE_BANK_NAME;
      bankIntro = QUALIFICATION_SAMPLE_BANK_INTRO;
      getQuestions = qualificationSampleQuestions;
      docTitle = "从业资格认证试题";
      category = "certificate";
    } else if (kind === "k12") {
      bankName = K12_SAMPLE_BANK_NAME;
      bankIntro = K12_SAMPLE_BANK_INTRO;
      getQuestions = k12SampleQuestions;
      docTitle = "K12全科基础试题";
      category = "k12";
    } else if (kind === "higher") {
      bankName = HIGHER_SAMPLE_BANK_NAME;
      bankIntro = HIGHER_SAMPLE_BANK_INTRO;
      getQuestions = higherSampleQuestions;
      docTitle = "大学与硕博学术试题";
      category = "higher";
    }

    let info = this.banks.find((bank) => bank.name === bankName && bank.sampleState);
    if (info?.sampleState === "ready") return info;
    if (!info) {
      const hub = await this.resolveUnifiedExamHubNotebook();
      if (hub) {
        const rootHPath = `${hub.rootPrefix}/${bankName.replace(/\//g, "·")}`;
        const bankId = `bank-sample-${kind}`;
        info = {
          id: bankId,
          notebookId: hub.notebookId,
          rootHPath,
          name: bankName,
          createdAt: Date.now(),
          category,
          sampleState: "pending",
        };
        this.banks.push(info);
      } else {
        const notebookId = await this.deps.bridge.createNotebook(`题库/${bankName}`);
        info = { id: notebookId, name: bankName, createdAt: Date.now(), category, sampleState: "pending" };
        this.banks.push(info);
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }
    await this.saveBankRegistry();
    try {
      if (!info.sampleHomeDocId) {
        info.sampleHomeDocId = await this.ensureDoc(info.id, "/首页", bankIntro);
        await this.saveBankRegistry();
      }
      if (!info.sampleDocId) {
        info.sampleDocId = await this.ensureDoc(info.id, `/${docTitle}`, bankIntro.replace(/^# .*\n/, `# ${docTitle}\n`));
        await this.saveBankRegistry();
      }
      const docId = info.sampleDocId;
      if (!docId) throw new Error("未取得示例题文档 ID");
      const plannedIds = (info.sampleQuestionIds ??= {});
      const planned = getQuestions().map((q) => ({ ...q, id: (plannedIds[q.hash] ??= q.id) }));
      await this.saveBankRegistry();
      const kramdown = await this.deps.bridge.getBlockKramdown(docId);
      if (!kramdown) throw new Error("未读取到示例题文档原文，请恢复连接后重试");
      const existingIds = new Set(Array.from(kramdown.matchAll(/\bcustom-exam-id="([^"]+)"/g), ([, id]) => id));
      const missing = planned.filter((q) => !existingIds.has(q.id));
      if (missing.length) {
        const written = await this.deps.bridge.appendQuestions(docId, missing);
        const confirmed = new Set(written.filter((item) => item.blockId).map((item) => item.qid));
        if (missing.some((q) => !confirmed.has(q.id))) {
          const afterWrite = await this.deps.bridge.getBlockKramdown(docId);
          const persisted = new Set(Array.from((afterWrite ?? "").matchAll(/\bcustom-exam-id="([^"]+)"/g), ([, id]) => id));
          if (missing.some((q) => !persisted.has(q.id))) throw new Error("未收到全部示例题的写入回执");
        }
        if (typeof this.deps.bridge.setExamAttrs === "function") {
          for (const { qid, blockId } of written) {
            if (!blockId) continue;
            const pq = missing.find((q) => q.id === qid);
            if (!pq) continue;
            const extraAttrs: Record<string, string> = {};
            if (pq.answerSpec) extraAttrs["exam-answer-spec"] = JSON.stringify(pq.answerSpec);
            if (pq.rubric) extraAttrs["exam-rubric"] = JSON.stringify(pq.rubric);
            if (pq.studyMeta) extraAttrs["exam-study-meta"] = JSON.stringify(pq.studyMeta);
            if (pq.secondaryKps?.length) extraAttrs["exam-secondary-kps"] = pq.secondaryKps.join(",");
            if (pq.occlusion) extraAttrs["exam-occlusion"] = JSON.stringify(pq.occlusion);
            if (pq.family) extraAttrs["exam-family"] = JSON.stringify(pq.family);
            if (Object.keys(extraAttrs).length > 0) {
              try {
                await this.deps.bridge.setExamAttrs(blockId, extraAttrs);
              } catch { /* 容错 */ }
            }
          }
        }
      }
      info.sampleState = "ready";
      try {
        await this.saveBankRegistry();
      } catch (e) {
        info.sampleState = "pending";
        throw e;
      }
      return info;
    } catch (e) {
      throw Object.assign(new Error(`示例题库已保留，题目写入尚未完成。请点击「示例题库」重试：${e instanceof Error ? e.message : String(e)}`), { cause: e });
    }
  }

  async renameBank(id: string, newName: string): Promise<BankInfo> {
    this.deps.assertStorageWritable();
    const clean = newName.trim();
    if (!clean) throw new Error("题库名称不能为空");
    const target = this.banks.find((b) => b.id === id);
    if (!target) throw new Error("未找到对应题库");
    const previous = [...this.banks];
    target.name = clean;
    this.banks = [...this.banks];
    try {
      await this.saveBankRegistry();
    } catch (e) {
      this.banks = previous;
      throw e;
    }
    return target;
  }

  async removeBank(id: string, onRemovedQids?: (qids: Set<string>) => void): Promise<boolean> {
    this.deps.assertStorageWritable();
    const before = this.banks.length;
    const previous = this.banks;
    let qidsToClean: Set<string> | null = null;
    try {
      const qs = await this.listQuestions(id);
      if (qs.length) qidsToClean = new Set(qs.map((q) => q.id));
    } catch {
      /* 题库文件若已被物理删除，静默跳过题目提取 */
    }

    this.banks = this.banks.filter((b) => b.id !== id);
    if (this.banks.length !== before) {
      try {
        await this.saveBankRegistry();
      } catch (e) {
        this.banks = previous;
        throw e;
      }
      if (qidsToClean && qidsToClean.size > 0) {
        onRemovedQids?.(qidsToClean);
      }
      return true;
    }
    return false;
  }

  async listQuestions(bankId: string): Promise<(Question & { blockId: string; rootId: string; hpath: string })[]> {
    const { notebookId, rootHPath } = this.resolveBankScope(bankId);
    const queryQuestions = () =>
      rootHPath
        ? this.deps.bridge.listQuestions(notebookId, rootHPath)
        : this.deps.bridge.listQuestions(notebookId);
    let qs = await queryQuestions();
    if (
      qs.length === 0 &&
      this.deps.isKernelOnline() &&
      this.banks.some((b) => b.id === bankId) &&
      typeof this.deps.bridge.listAllNotebooks === "function" &&
      typeof this.deps.bridge.openNotebook === "function"
    ) {
      try {
        const nbs = await this.deps.bridge.listAllNotebooks();
        const nb = Array.isArray(nbs) ? nbs.find((n: { id: string; closed?: boolean }) => n.id === notebookId) : undefined;
        if (nb?.closed) {
          await this.deps.bridge.openNotebook(notebookId);
          for (let i = 0; i < 6; i++) {
            await new Promise((r) => setTimeout(r, 350));
            qs = await queryQuestions();
            if (qs.length > 0) break;
          }
        }
      } catch {
        /* 打开已关闭题库失败时回退空结果 */
      }
    }
    for (const q of qs) {
      if (q.id && q.blockId) {
        this.questionBlockMap.set(q.id, q.blockId);
      }
    }
    return qs;
  }

  async exportBankSyZip(bankId: string): Promise<{ zipPath: string; filename: string }> {
    const bank = this.getBank(bankId);
    const isSubtreeBank = Boolean(
      bank?.rootHPath ||
      bankId.startsWith("bank-") ||
      (bank?.notebookId && bank.notebookId !== bank.id),
    );
    if (!isSubtreeBank) {
      const { zipPath } = await this.deps.bridge.exportNotebookSy(bank?.notebookId || bankId);
      const filename = decodeURIComponent(zipPath.split("/").pop() ?? "bank.sy.zip");
      return { zipPath, filename };
    }

    const { notebookId, rootHPath } = this.resolveBankScope(bankId);
    const cleanRoot = rootHPath.replace(/\/+$/, "");
    if (!cleanRoot) {
      throw new Error("统一空间子目录题库缺少根路径，无法安全导出");
    }

    let docs: { id: string; hpath: string }[] = [];
    if (typeof this.deps.bridge.docTree === "function") {
      try {
        const tree = await this.deps.bridge.docTree(notebookId, cleanRoot);
        docs = Array.isArray(tree?.docs) ? tree.docs : [];
      } catch {
        docs = [];
      }
    }
    if (docs.length === 0 && typeof this.deps.bridge.sql === "function") {
      const box = notebookId.replace(/'/g, "''");
      const escapedRoot = cleanRoot.replace(/'/g, "''");
      const rows = await this.deps.bridge.sql<{ id: string; hpath: string }>(
        `SELECT id, hpath FROM blocks WHERE box='${box}' AND type='d' AND (hpath='${escapedRoot}' OR hpath LIKE '${escapedRoot}/%') ORDER BY hpath, id`,
      );
      docs = Array.isArray(rows)
        ? rows.map((r) => ({ id: String(r.id ?? ""), hpath: String(r.hpath ?? "") })).filter((d) => d.id)
        : [];
    }
    if (docs.length === 0) {
      throw new Error(`题库「${bank?.name || bankId}」下暂无可导出的文档`);
    }

    const docHPaths = new Set(docs.map((d) => d.hpath.replace(/\/+$/, "")));
    const exactRoot = docs.find((d) => d.hpath.replace(/\/+$/, "") === cleanRoot);
    const topIds = exactRoot
      ? [exactRoot.id]
      : docs
          .filter((d) => {
            const norm = d.hpath.replace(/\/+$/, "");
            const parent = norm.slice(0, norm.lastIndexOf("/"));
            return !docHPaths.has(parent);
          })
          .map((d) => d.id);
    const exportIds = topIds.length ? topIds : docs.map((d) => d.id);

    let zipPath = "";
    if (typeof this.deps.bridge.exportDocTreeSy === "function") {
      const res = await this.deps.bridge.exportDocTreeSy(exportIds);
      zipPath = res.zipPath;
    } else if (typeof this.deps.bridge.rawPost === "function") {
      let lastErr: unknown;
      try {
        const r = exportIds.length === 1
          ? await this.deps.bridge.rawPost("/api/export/exportSY", { id: exportIds[0] })
          : await this.deps.bridge.rawPost("/api/export/exportSYs", { ids: exportIds });
        zipPath = String((r.data as Record<string, unknown> | null)?.zip ?? "");
      } catch (e) {
        lastErr = e;
      }
      if (!zipPath) {
        try {
          const mdR = exportIds.length === 1
            ? await this.deps.bridge.rawPost("/api/export/exportMd", { id: exportIds[0], includeSubDocs: true })
            : await this.deps.bridge.rawPost("/api/export/exportMds", { ids: exportIds, includeSubDocs: true });
          zipPath = String((mdR.data as Record<string, unknown> | null)?.zip ?? "");
        } catch (e) {
          lastErr = lastErr ?? e;
        }
      }
      if (!zipPath && lastErr) throw lastErr;
    } else {
      throw new Error("当前宿主环境不支持导出题库文档子树");
    }

    if (!zipPath) {
      throw new Error("题库子树导出响应缺少 zip 路径");
    }
    const filename = decodeURIComponent(zipPath.split("/").pop() || `${bank?.name || "bank"}.sy.zip`);
    return { zipPath, filename };
  }

  private async notebookHasExamQuestions(notebookId: string): Promise<boolean> {
    if (typeof this.deps.bridge.sql === "function") {
      try {
        const escaped = notebookId.replace(/'/g, "''");
        const rows = await this.deps.bridge.sql<{ id: string }>(
          `SELECT a.block_id AS id FROM attributes a JOIN blocks b ON a.block_id = b.id WHERE b.box='${escaped}' AND a.name='custom-exam-id' LIMIT 1`,
        );
        if (Array.isArray(rows) && rows.length > 0) return true;
      } catch {
        /* 回退 listQuestions 探测 */
      }
    }
    if (typeof this.deps.bridge.listQuestions === "function") {
      try {
        const qs = await this.deps.bridge.listQuestions(notebookId);
        if (Array.isArray(qs) && qs.length > 0) return true;
      } catch {
        /* 忽略探测失败 */
      }
    }
    return false;
  }

  async importBankSyZip(file: Blob, filename = "bank.sy.zip"): Promise<{ registered: string[] }> {
    await this.deps.bridge.importSyUpload(file, filename);
    const all = await this.deps.bridge.listNotebooks();
    const known = new Set<string>();
    for (const b of this.banks) {
      known.add(b.id);
      if (b.notebookId) known.add(b.notebookId);
    }
    const registered: string[] = [];
    for (const nb of all) {
      if (known.has(nb.id)) continue;
      const isBankPrefixed = nb.name.startsWith("题库/");
      let shouldRegister = isBankPrefixed;
      if (!shouldRegister && !/^(🐴\s*)?小驴(生态|空间|笔记本)/.test(nb.name?.trim() || "")) {
        shouldRegister = await this.notebookHasExamQuestions(nb.id);
      }
      if (!shouldRegister) continue;
      this.banks.push({
        id: nb.id,
        name: isBankPrefixed ? (nb.name.replace(/^题库\//, "") || nb.name) : nb.name,
        createdAt: this.deps.now?.() ?? Date.now(),
      });
      known.add(nb.id);
      registered.push(nb.name);
    }
    if (registered.length) await this.saveBankRegistry();
    return { registered };
  }
}
