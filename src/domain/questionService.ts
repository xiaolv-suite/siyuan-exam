import type { AppHost } from "./appContext";
import type { Question } from "../core/types";
import { normalizeAnswer, questionHash } from "../core/answer";
import { questionToMarkdown } from "../core/blockTemplate";
import { inferAnswerSpec } from "../core/structuredAnswer";
import {
  appendRevision,
  checkPublishGuard,
  diffQuestion,
  formatDiffSummary,
  getQuestionLifecycle,
  LIFECYCLE_LABELS,
  specChanged,
  validateLifecycleTransition,
  type QuestionDiffField,
  type QuestionLifecycleStatus,
  type QuestionRevision,
  type RevisionStore,
} from "../core/revision";
import { planQuestionMerge } from "../core/duplicateMerger";
import { BATCH_FIELD_ATTR, type BatchField } from "../core/batchEdit";
import {
  createDisputeRecord,
  resolveDisputeRecord,
  DISPUTE_REASON_LABELS,
  type DisputeReason,
} from "../core/dispute";
import { REVISIONS_KEY } from "../constants";

export class QuestionDomainService {
  private revisionCache: RevisionStore | null = null;

  constructor(private app: AppHost) {}

  async syncQuestionStudyStateToBlock(qid: string, explicitBlockId?: string): Promise<void> {
    if (!qid || !this.app.kernelOnline || typeof this.app.bridge.setExamAttrs !== "function") return;
    const blockId = explicitBlockId || this.app.questionBlockMap.get(qid);
    if (!blockId) return;
    const d = this.app.derived();
    const stat = d.byQuestion.get(qid);
    const wrong = d.wrongbook.get(qid);
    const overlay = this.app.wrongOverlay.get(qid);
    const reason = this.app.wrongReasons.get(qid) ?? "";
    const reflection = this.app.wrongReflections[qid]?.text ?? "";
    let wrongStatus = wrong?.status ?? "";
    if (overlay?.status) {
      wrongStatus = overlay.status;
    }
    const attrs: Record<string, string> = {
      "exam-attempts": String(stat?.attempts ?? 0),
      "exam-correct": String(stat?.correct ?? 0),
      "exam-wrong-count": String(wrong?.wrongCount ?? 0),
      "exam-wrong-status": wrongStatus,
      "exam-wrong-reason": reason,
      "exam-reflection": reflection,
    };
    try {
      await this.app.bridge.setExamAttrs(blockId, attrs);
    } catch {
      /* 尽力而为 */
    }
  }

  async findQuestionByBlock(
    blockId: string,
  ): Promise<{ q: Question & { blockId: string; rootId: string; hpath: string }; bank: import("./bankService").BankInfo } | null> {
    if (!blockId || !this.app.kernelOnline) return null;
    let targetExamId = "";
    for (const bank of this.app.listBanks()) {
      try {
        const qs = await this.app.listQuestions(bank.id);
        const direct = qs.find((x) => x.blockId === blockId);
        if (direct) return { q: direct, bank };
      } catch {
        /* 继续 */
      }
    }
    if (typeof this.app.bridge.getBlockAttrs === "function") {
      try {
        const attrs = await this.app.bridge.getBlockAttrs(blockId);
        targetExamId = attrs["custom-exam-id"] || attrs["exam-id"] || "";
      } catch {
        /* 忽略 */
      }
    }
    if (targetExamId) {
      for (const bank of this.app.listBanks()) {
        try {
          const q = (await this.app.listQuestions(bank.id)).find((x) => x.id === targetExamId);
          if (q) return { q, bank };
        } catch {
          /* 继续 */
        }
      }
    }
    return null;
  }

  async docTree(bankId: string) {
    const { notebookId, rootHPath } = this.app.resolveBankScope(bankId);
    return rootHPath ? this.app.bridge.docTree(notebookId, rootHPath) : this.app.bridge.docTree(notebookId);
  }

  async markQuestionKp(q: Question & { blockId?: string }, kp: string): Promise<void> {
    if (q.blockId && this.app.kernelOnline) {
      await this.app.saves.run(`mark-kp/${q.blockId}`, () => this.app.bridge.setExamAttrs(q.blockId!, { "exam-kp": kp }));
    }
    q.kp = kp || undefined;
  }

  async updateQuestionContent(
    q: Question & { blockId: string },
    draft: {
      stem: string;
      options: string[];
      answer: string;
      analysis: string;
      kp: string;
      difficulty?: number;
      answerSpec?: any;
      status?: QuestionLifecycleStatus;
      studyMeta?: Question["studyMeta"];
    },
  ): Promise<Question> {
    if (!this.app.kernelOnline) throw new Error("离线：题目编辑需要内核可写");
    const answer = q.type === "material" ? "" : normalizeAnswer(q.type, draft.answer) ?? draft.answer;
    if (draft.status !== undefined) {
      const currentStatus = getQuestionLifecycle(q);
      if (draft.status !== currentStatus) {
        const candidate: Question = {
          ...q,
          stem: draft.stem,
          options: draft.options.map((o) => o.trim()).filter(Boolean),
          answer,
          analysis: draft.analysis || undefined,
          kp: draft.kp || undefined,
          difficulty: draft.difficulty,
          status: draft.status,
          hash: questionHash(draft.stem, draft.options),
        };
        const validation = validateLifecycleTransition(currentStatus, draft.status, candidate);
        if (!validation.ok) {
          const detail = validation.guardErrors?.length ? `：${validation.guardErrors.join("；")}` : "";
          throw new Error(`${validation.reason}${detail}`);
        }
      }
    }
    const next: Question = {
      ...q,
      stem: draft.stem,
      options: draft.options.map((o) => o.trim()).filter(Boolean),
      answer,
      analysis: draft.analysis || undefined,
      kp: draft.kp || undefined,
      difficulty: draft.difficulty,
      status: draft.status !== undefined ? draft.status : q.status,
      studyMeta: draft.studyMeta !== undefined ? draft.studyMeta : q.studyMeta,
      hash: questionHash(draft.stem, draft.options),
    };
    const oldMarkdown = questionToMarkdown(q);
    try {
      await this.app.saves.run(`edit-q/${q.blockId}`, () =>
        this.app.bridge.updateBlock(q.blockId, questionToMarkdown(next)),
      );
      const kd = await this.app.bridge.getBlockKramdown(q.blockId);
      if (!kd.includes(`exam-id="${q.id}"`) && !kd.includes(`exam-id='${q.id}'`)) {
        throw new Error("编辑读回异常：题目身份（exam-id）丢失");
      }
    } catch (error) {
      try {
        await this.app.saves.run(`edit-q-rollback/${q.blockId}`, () => this.app.bridge.updateBlock(q.blockId, oldMarkdown));
      } catch (rollbackError) {
        throw Object.assign(new Error(`题目编辑失败且回滚失败，请保留当前页面并重载思源后核对：${String(rollbackError)}`), { cause: error });
      }
      throw Object.assign(new Error(`题目编辑失败，已恢复编辑前内容：${error instanceof Error ? error.message : String(error)}`), { cause: error });
    }
    let specWasChanged = false;
    if (q.type === "fill" && draft.answerSpec !== undefined) {
      next.answerSpec = draft.answerSpec ?? undefined;
      specWasChanged = specChanged(q.answerSpec, draft.answerSpec);
      try {
        await this.app.bridge.setExamAttrs(q.blockId, {
          "exam-answer-spec": draft.answerSpec ? JSON.stringify(draft.answerSpec) : "",
        });
      } catch (error) {
        try { await this.app.saves.run(`edit-q-rollback/${q.blockId}`, () => this.app.bridge.updateBlock(q.blockId, oldMarkdown)); }
        catch (rollbackError) { throw Object.assign(new Error(`答案规格写入失败且回滚失败：${String(rollbackError)}`), { cause: error }); }
        throw Object.assign(new Error(`答案规格写入失败，已恢复编辑前内容：${error instanceof Error ? error.message : String(error)}`), { cause: error });
      }
    } else if (q.type === "fill" && answer !== q.answer) {
      const spec = inferAnswerSpec("fill", answer);
      if (spec?.kind === "multiBlank" && q.answerSpec?.kind === "multiBlank" && q.answerSpec.orderIndependent) {
        spec.orderIndependent = true;
      }
      specWasChanged = specChanged(q.answerSpec, spec);
      next.answerSpec = spec;
      try {
        await this.app.bridge.setExamAttrs(q.blockId, {
          "exam-answer-spec": spec ? JSON.stringify(spec) : "",
        });
      } catch { /* 尽力而为 */ }
    }
    if (draft.status !== undefined && draft.status !== q.status) {
      try {
        await this.app.bridge.setExamAttrs(q.blockId, {
          "exam-status": draft.status,
        });
      } catch { /* 尽力而为 */ }
    }
    if (draft.studyMeta !== undefined) {
      try {
        await this.app.bridge.setExamAttrs(q.blockId, {
          "exam-study-meta": draft.studyMeta ? JSON.stringify(draft.studyMeta) : "",
        });
      } catch { /* 尽力而为 */ }
    }
    // 43-01 全量：修订时间线快照（题干/选项/答案/解析/考点/难度/规格/生命周期变更，记录全量快照与 diff）
    const diffs = diffQuestion(
      {
        stem: q.stem,
        options: q.options,
        answer: q.answer,
        analysis: q.analysis,
        kp: q.kp,
        difficulty: q.difficulty,
        answerSpec: q.answerSpec,
        status: q.status,
      },
      {
        stem: draft.stem,
        options: draft.options,
        answer,
        analysis: draft.analysis,
        kp: draft.kp,
        difficulty: draft.difficulty,
        answerSpec: next.answerSpec,
        status: next.status,
      },
    );
    if (diffs.length > 0 || specWasChanged) {
      try {
        const changedFields: QuestionDiffField[] = diffs.map((d) => d.field);
        if (specWasChanged && !changedFields.includes("spec")) {
          changedFields.push("spec");
        }
        const nowTs = this.app.deps.now?.() ?? Date.now();
        const existingRevisions = await this.questionRevisions(q.id);
        if (existingRevisions.length === 0) {
          await this.appendRevision(q.id, {
            ts: Math.max(1, nowTs - 1),
            answer: q.answer,
            kp: (q.kp ?? "").trim(),
            stem: q.stem.trim(),
            options: [...q.options],
            analysis: (q.analysis ?? "").trim(),
            difficulty: q.difficulty ?? null,
            answerSpec: q.answerSpec ? JSON.parse(JSON.stringify(q.answerSpec)) : null,
            status: q.status,
            changedFields: [],
            summary: "初始基线版本",
          });
        }
        await this.appendRevision(q.id, {
          ts: nowTs,
          answer,
          kp: draft.kp.trim(),
          specChanged: specWasChanged || undefined,
          stem: draft.stem.trim(),
          options: [...draft.options],
          analysis: draft.analysis.trim(),
          difficulty: draft.difficulty ?? null,
          answerSpec: next.answerSpec ? JSON.parse(JSON.stringify(next.answerSpec)) : null,
          status: next.status,
          changedFields,
          summary: formatDiffSummary(diffs),
        });
      } catch (error) {
        try {
          await this.app.saves.run(`edit-q-rollback/${q.blockId}`, () => this.app.bridge.updateBlock(q.blockId, oldMarkdown));
          if (q.type === "fill") {
            await this.app.bridge.setExamAttrs(q.blockId, {
              "exam-answer-spec": q.answerSpec ? JSON.stringify(q.answerSpec) : "",
            });
          }
        } catch (rollbackError) {
          throw Object.assign(new Error(`修订记录保存失败且题目回滚失败：${String(rollbackError)}`), { cause: error });
        }
        throw Object.assign(new Error(`修订记录保存失败，已恢复编辑前内容：${error instanceof Error ? error.message : String(error)}`), { cause: error });
      }
    }
    // 69-04：题干若有改动，使旧题干渲染缓存立即失效
    if (draft.stem.trim() !== q.stem.trim()) {
      this.app.invalidateRenderCache(q.id);
    }
    return next;
  }

  async questionRevisions(qid: string): Promise<QuestionRevision[]> {
    if (!this.revisionCache) {
      this.revisionCache = (await this.app.loadAux<RevisionStore>(REVISIONS_KEY)) ?? {};
    }
    return this.revisionCache[qid] ?? [];
  }

  async appendRevision(qid: string, entry: QuestionRevision): Promise<void> {
    await this.app.queueStorageWrite(REVISIONS_KEY, async (token) => {
      if (!this.revisionCache) {
        this.revisionCache = (await this.app.loadAux<RevisionStore>(REVISIONS_KEY)) ?? {};
      }
      const previous = this.revisionCache;
      this.revisionCache = appendRevision(this.revisionCache, qid, entry);
      try {
        await this.app.storageGateway.save(REVISIONS_KEY, this.revisionCache, token);
      } catch (e) {
        this.revisionCache = previous;
        throw e;
      }
    });
  }

  clearRevisionCache(): void {
    this.revisionCache = {};
  }

  async mergeDuplicateQuestions(
    targetQ: Question & { blockId: string },
    sourceQ: Question & { blockId: string },
  ): Promise<{ mergedEventsCount: number; enrichedFields: string[] }> {
    if (!this.app.kernelOnline) throw new Error("离线：合并题目需要内核可写");
    if (targetQ.id === sourceQ.id) throw new Error("不能合并同一道题目");
    if (!sourceQ.blockId) throw new Error("待合并题目缺少块 ID");

    const plan = planQuestionMerge(targetQ, sourceQ);
    if (plan.enrichedFields.length > 0) {
      await this.updateQuestionContent(targetQ, {
        stem: plan.enrichedQuestion.stem,
        options: plan.enrichedQuestion.options,
        answer: plan.enrichedQuestion.answer,
        analysis: plan.enrichedQuestion.analysis ?? "",
        kp: plan.enrichedQuestion.kp ?? "",
        difficulty: plan.enrichedQuestion.difficulty,
        status: plan.enrichedQuestion.status,
      });
      Object.assign(targetQ, plan.enrichedQuestion);
    }

    const mergedEventsCount = this.app.attempts.remapQuestionId(sourceQ.id, targetQ.id);
    await this.app.bridge.removeBlock(sourceQ.blockId);
    await this.app.flush();
    this.app.invalidate();
    return { mergedEventsCount, enrichedFields: plan.enrichedFields };
  }

  async writeManualQuestion(bankId: string, q: Question): Promise<void> {
    const status = getQuestionLifecycle(q);
    if (status === "published") {
      const guard = checkPublishGuard(q);
      if (!guard.valid) {
        throw new Error(`发布守卫阻断：${guard.errors.join("；")}`);
      }
    }
    const docId = await this.app.ensureDoc(bankId, q.kp ? `/${q.kp.split("/")[0]}` : "/手工录入");
    const writtenBlocks = await this.app.bridge.appendQuestions(docId, [q]);
    const blockId = writtenBlocks[0]?.blockId;
    if (blockId) {
      const attrs: Record<string, string> = {
        "exam-status": status,
      };
      if (q.answerSpec) attrs["exam-answer-spec"] = JSON.stringify(q.answerSpec);
      if (q.rubric) attrs["exam-rubric"] = JSON.stringify(q.rubric);
      if (q.secondaryKps?.length) attrs["exam-secondary-kps"] = q.secondaryKps.join(",");
      if (q.occlusion) attrs["exam-occlusion"] = JSON.stringify(q.occlusion);
      if (q.family) attrs["exam-family"] = JSON.stringify(q.family);
      if (q.studyMeta) attrs["exam-study-meta"] = JSON.stringify(q.studyMeta);
      if (q.sourceBlockId) attrs["exam-source-block"] = q.sourceBlockId;
      try {
        await this.app.bridge.setExamAttrs(blockId, attrs);
      } catch { /* 尽力而为 */ }
    }
    this.app.invalidate();
    if (this.app.kernelOnline) {
      for (let i = 0; i < 5; i++) {
        await new Promise((r) => setTimeout(r, 700));
        try {
          if (await this.app.listQuestions(bankId).then((qs) => qs.some((x) => x.id === q.id))) break;
        } catch {
          /* 等待 */
        }
      }
    }
  }

  async appendQuestionNote(
    qid: string,
    blockId: string | undefined,
    text: string,
    kind: "mnemonic" | "note" | "ai-explain",
  ): Promise<void> {
    const resolvedBlockId = blockId || this.app.questionBlockMap.get(qid);
    if (!resolvedBlockId) throw new Error("题目块不存在（先完成导入）");
    const prefix = kind === "ai-explain" ? "🤖 【AI 破题讲解】" : kind === "mnemonic" ? "🧠 【记忆口诀】" : "📝 【题目笔记】";
    const quoted = text
      .split(/\r?\n/)
      .map((line, idx) => {
        const clean = line.replace(/^>\s?/, "");
        return idx === 0 ? `> ${prefix}${clean}` : `> ${clean}`;
      })
      .join("\n");
    const md = `{{{row\n${quoted}\n}}}\n{: custom-exam-note-id="${qid}-n-${Date.now().toString(36)}" custom-exam-note-kind="${kind}"}`;
    await this.app.bridge.appendBlock(resolvedBlockId, md);
  }

  async toggleFav(q: Question & { blockId?: string }): Promise<boolean> {
    if (!this.app.kernelOnline) throw new Error("离线：收藏题目需要内核可写");
    const next = !q.fav;
    if (q.blockId) {
      await this.app.saves.run(`fav/${q.blockId}`, () =>
        this.app.bridge.setExamFav(q.blockId!, next),
      );
    }
    q.fav = next;
    return next;
  }

  async applyBatchEdit(
    changes: { blockId: string; field: BatchField; to: string }[],
  ): Promise<{ ok: number; failed: number }> {
    if (!this.app.kernelOnline) throw new Error("离线：批量编辑需要内核可写");
    let ok = 0,
      failed = 0;
    for (const c of changes) {
      try {
        await this.app.saves.run(`batch-edit/${c.blockId}`, () =>
          this.app.bridge.setExamAttrs(c.blockId, { [BATCH_FIELD_ATTR[c.field]]: c.to }),
        );
        ok++;
      } catch {
        failed++;
      }
    }
    return { ok, failed };
  }

  listBatches(questions: (Question & { batch?: string })[]): { batch: string; count: number }[] {
    const counts = new Map<string, number>();
    for (const q of questions) {
      if (!q.batch || q.origin !== "imported") continue;
      counts.set(q.batch, (counts.get(q.batch) ?? 0) + 1);
    }
    return [...counts.entries()].map(([batch, count]) => ({ batch, count })).reverse();
  }

  async rollbackBatch(bankId: string, batch: string): Promise<{ deleted: number; failed: number }> {
    if (!this.app.kernelOnline) throw new Error("离线：批次回滚需要内核可写");
    const escaped = batch.replace(/'/g, "''");
    const { notebookId, rootHPath } = this.app.resolveBankScope(bankId);
    const escRoot = (rootHPath ?? "").replace(/'/g, "''");
    const hpathCond = rootHPath ? ` AND (hpath='${escRoot}' OR hpath LIKE '${escRoot}/%')` : "";
    const rows = await this.app.bridge.sqlPaged<{ id?: string }>(
      `SELECT b.id AS id FROM blocks b
       JOIN attributes a ON a.block_id = b.id
       WHERE b.root_id IN (SELECT id FROM blocks WHERE box='${notebookId.replace(/'/g, "''")}' AND type='d'${hpathCond})
         AND a.name='custom-exam-batch' AND a.value='${escaped}'
       ORDER BY b.id`,
    );
    const ids = rows.map((r) => String(r.id ?? "")).filter(Boolean);
    let deleted = 0,
      failed = 0;
    for (const id of ids) {
      try {
        await this.app.saves.run(`rollback/${id}`, () => this.app.bridge.removeBlock(id));
        deleted++;
      } catch {
        failed++;
      }
    }
    this.app.invalidate();
    return { deleted, failed };
  }

  async updateQuestionLifecycle(
    q: Question & { blockId: string },
    targetStatus: QuestionLifecycleStatus,
  ): Promise<Question> {
    if (!this.app.kernelOnline) throw new Error("离线：生命周期变更需要内核可写");
    const currentStatus = getQuestionLifecycle(q);
    if (currentStatus === targetStatus) return q;

    const validation = validateLifecycleTransition(currentStatus, targetStatus, q);
    if (!validation.ok) {
      const detail = validation.guardErrors?.length ? `：${validation.guardErrors.join("；")}` : "";
      throw new Error(`${validation.reason}${detail}`);
    }

    const prevStatus = q.status;
    q.status = targetStatus;
    try {
      await this.app.bridge.setExamAttrs(q.blockId, { "exam-status": targetStatus });
      await this.appendRevision(q.id, {
        ts: this.app.deps.now?.() ?? Date.now(),
        answer: q.answer,
        kp: q.kp,
        stem: q.stem,
        options: [...q.options],
        analysis: q.analysis,
        difficulty: q.difficulty,
        answerSpec: q.answerSpec,
        status: targetStatus,
        changedFields: ["status"],
        summary: `状态: ${LIFECYCLE_LABELS[currentStatus]} → ${LIFECYCLE_LABELS[targetStatus]}`,
      });
    } catch (e) {
      q.status = prevStatus;
      throw e;
    }
    this.app.invalidate();
    return q;
  }

  async flagQuestionDispute(
    q: Question & { blockId: string },
    reason: DisputeReason,
    note: string,
  ): Promise<Question> {
    if (!this.app.kernelOnline) throw new Error("离线：标记争议需要内核可写");
    const dispute = createDisputeRecord(reason, note, this.app.deps.now?.() ?? Date.now());
    q.dispute = dispute;
    await this.app.bridge.setExamAttrs(q.blockId, {
      "exam-dispute": JSON.stringify(dispute),
    });
    try {
      await this.appendRevision(q.id, {
        ts: this.app.deps.now?.() ?? Date.now(),
        answer: q.answer,
        kp: q.kp,
        stem: q.stem,
        options: [...q.options],
        analysis: q.analysis,
        difficulty: q.difficulty,
        answerSpec: q.answerSpec,
        status: q.status,
        summary: `标记争议: ${DISPUTE_REASON_LABELS[reason] ?? reason}（${note.slice(0, 30)}）`,
      });
    } catch { /* 尽力而为 */ }
    this.app.invalidate();
    return q;
  }

  async resolveQuestionDispute(
    q: Question & { blockId: string },
    resolution: string,
  ): Promise<Question> {
    if (!this.app.kernelOnline) throw new Error("离线：解决争议需要内核可写");
    if (!q.dispute) return q;
    const resolved = resolveDisputeRecord(q.dispute, resolution, this.app.deps.now?.() ?? Date.now());
    q.dispute = resolved;
    await this.app.bridge.setExamAttrs(q.blockId, {
      "exam-dispute": JSON.stringify(resolved),
    });
    try {
      await this.appendRevision(q.id, {
        ts: this.app.deps.now?.() ?? Date.now(),
        answer: q.answer,
        kp: q.kp,
        stem: q.stem,
        options: [...q.options],
        analysis: q.analysis,
        difficulty: q.difficulty,
        answerSpec: q.answerSpec,
        status: q.status,
        summary: `解决争议: ${resolution.slice(0, 30)}`,
      });
    } catch { /* 尽力而为 */ }
    this.app.invalidate();
    return q;
  }

  async clearQuestionDispute(q: Question & { blockId: string }): Promise<Question> {
    if (!this.app.kernelOnline) throw new Error("离线：清除争议需要内核可写");
    delete q.dispute;
    await this.app.bridge.setExamAttrs(q.blockId, {
      "exam-dispute": "",
    });
    this.app.invalidate();
    return q;
  }

  async tagQuestion(
    q: Question & { blockId: string },
    tag: string,
    action: "add" | "remove" | "toggle" = "toggle",
  ): Promise<Question & { blockId: string }> {
    if (!this.app.kernelOnline) throw new Error("离线：设置标签需要内核可写");
    const cleanTag = tag.trim();
    if (!cleanTag) return q;

    const currentTags = new Set(q.userTags ?? []);
    if (action === "add") {
      currentTags.add(cleanTag);
    } else if (action === "remove") {
      currentTags.delete(cleanTag);
    } else {
      if (currentTags.has(cleanTag)) currentTags.delete(cleanTag);
      else currentTags.add(cleanTag);
    }

    const nextList = Array.from(currentTags);
    q.userTags = nextList.length > 0 ? nextList : undefined;

    await this.app.bridge.setExamAttrs(q.blockId, {
      "exam-tags": nextList.join(","),
    });
    this.app.invalidate();
    return q;
  }
}
