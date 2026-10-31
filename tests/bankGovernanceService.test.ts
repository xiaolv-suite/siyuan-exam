import { describe, it, expect, vi } from "vitest";
import {
  countSyllabusNodes,
  previewSyllabusText,
  importSyllabusToApp,
  planErrataFromText,
  previewKpMergePlan,
  previewKpFillPlan,
  executeClusterMergeToTarget,
  computePaperRecallPreview,
  executeApplyPaperRecall,
  executeApplyErrata,
  executeApplyKpPlan,
  computeBankHealthMetricsBundle,
  executeRollbackBatchWithConfirm,
  executeApplyBatchChanges,
  loadBatchUndoAux,
  saveBatchUndoAux,
  computeSyllabusKpStats,
  parseErrataFileInput,
} from "@/ui/practice/services/bankGovernanceService";
import type { ExamApp } from "@/app";
import type { Question } from "@/core/types";
import type { SyllabusNode } from "@/core/syllabus";

describe("题库治理与考纲服务 (bankGovernanceService)", () => {
  it("1. countSyllabusNodes：正确递归计算大纲节点总数", () => {
    const nodes: SyllabusNode[] = [
      {
        id: "d-1",
        title: "数与代数",
        children: [
          {
            id: "c-1",
            title: "第一章 有理数",
            children: [
              { id: "k-1", title: "正数和负数", children: [] },
              { id: "k-2", title: "数轴", children: [] },
            ],
          },
        ],
      },
      {
        id: "d-2",
        title: "几何",
        children: [],
      },
    ];

    expect(countSyllabusNodes(nodes)).toBe(5);
  });

  it("2. previewSyllabusText 与 importSyllabusToApp：语法解析与导入保存", async () => {
    const mockApp = {
      previewSyllabus: vi.fn().mockImplementation((text: string) => {
        if (!text.trim()) return [];
        return [{ id: "n-1", title: "第一章", children: [] }];
      }),
      setSyllabusDoc: vi.fn().mockResolvedValue(undefined),
    } as unknown as ExamApp;

    const t = (key: string) => `[${key}]`;

    // 1. 空文本解析
    const emptyRes = previewSyllabusText(mockApp, "", t);
    expect(emptyRes.roots).toBeNull();
    expect(emptyRes.error).toBe("[syl.empty]");

    // 2. 有效文本解析
    const validRes = previewSyllabusText(mockApp, "# 考纲文本", t);
    expect(validRes.roots).toHaveLength(1);
    expect(validRes.error).toBe("");

    // 3. 导入保存
    const importRes = await importSyllabusToApp(
      mockApp,
      validRes.roots!,
      { publisher: "人教社", year: "2025" },
      t,
    );
    expect(mockApp.setSyllabusDoc).toHaveBeenCalled();
    expect(importRes.note).toContain("[syl.imported]");
  });

  it("3. planErrataFromText：解析勘误 CSV 并生成变更计划", () => {
    const questions = [
      {
        id: "q-12345678",
        blockId: "b-1",
        type: "single",
        stem: "原题干",
        options: ["A", "B"],
        answer: "A",
        analysis: "原解析",
        kp: "考点",
        status: "published",
        origin: "manual",
        hash: "h1",
      },
    ] as (Question & { blockId: string })[];

    const csvText =
      "题目ID,题型,题干,选项,正确答案,解析,考点,难度,分值\n" +
      "q-12345678,单选,修改后题干,A;;B,B,修改后解析,新考点,3,2\n";

    const res = planErrataFromText(csvText, questions);
    expect(res.errors).toEqual([]);
    expect(res.plan).not.toBeNull();
    expect(res.plan?.changes.length).toBeGreaterThan(0);
  });

  it("4. previewKpMergePlan 与 previewKpFillPlan：考点合并与空考点回填计划", () => {
    const questions = [
      {
        id: "q-1",
        blockId: "b-1",
        type: "single",
        stem: "题1",
        options: [],
        answer: "A",
        kp: "旧考点",
        status: "published",
        origin: "manual",
        hash: "h1",
      },
      {
        id: "q-2",
        blockId: "b-2",
        type: "single",
        stem: "题2",
        options: [],
        answer: "B",
        kp: "",
        status: "published",
        origin: "manual",
        hash: "h2",
      },
    ] as (Question & { blockId: string })[];

    const t = (k: string) => `[${k}]`;

    // 1. 合并端点缺失
    expect(previewKpMergePlan(questions, "", "新考点", t).note).toBe("[kp.needBoth]");
    expect(previewKpMergePlan(questions, "相同", "相同", t).note).toBe("[kp.sameValue]");

    // 2. 有效合并
    const mergeRes = previewKpMergePlan(questions, "旧考点", "新考点", t);
    expect(mergeRes.note).toBe("");
    expect(mergeRes.plan?.changes.length).toBe(1);
    expect(mergeRes.plan?.changes[0].to).toBe("新考点");

    // 3. 空考点回填缺失
    expect(previewKpFillPlan(questions, "", t).note).toBe("[kp.needBoth]");

    // 4. 有效空考点回填
    const fillRes = previewKpFillPlan(questions, "通用基础", t);
    expect(fillRes.note).toBe("");
    expect(fillRes.plan?.changes.length).toBe(1);
    expect(fillRes.plan?.changes[0].qid).toBe("q-2");
    expect(fillRes.plan?.changes[0].to).toBe("通用基础");
  });

  it("5. executeClusterMergeToTarget：重复簇题目合并流程与作答流水迁移", async () => {
    const t = (k: string) => `[${k}]`;
    const targetQ: any = { id: "q-1", stem: "主保留题干", blockId: "b-1" };
    const otherQ: any = { id: "q-2", stem: "重复题干", blockId: "b-2" };
    const qMap = new Map<string, Question>([
      ["q-1", targetQ],
      ["q-2", otherQ],
    ]);

    const mockApp = {
      mergeDuplicateQuestions: vi.fn().mockResolvedValue({ mergedEventsCount: 3 }),
    } as unknown as ExamApp;

    // 1. 用户取消合并
    const confirmCancel = vi.fn().mockResolvedValue(false);
    const cancelRes = await executeClusterMergeToTarget(
      mockApp,
      targetQ,
      ["q-1", "q-2"],
      qMap,
      confirmCancel,
      t,
    );
    expect(cancelRes.success).toBe(false);
    expect(mockApp.mergeDuplicateQuestions).not.toHaveBeenCalled();

    // 2. 用户确认合并
    const confirmAgree = vi.fn().mockResolvedValue(true);
    const agreeRes = await executeClusterMergeToTarget(
      mockApp,
      targetQ,
      ["q-1", "q-2"],
      qMap,
      confirmAgree,
      t,
    );
    expect(agreeRes.success).toBe(true);
    expect(agreeRes.othersCount).toBe(1);
    expect(agreeRes.mergedAttemptsCount).toBe(3);
    expect(mockApp.mergeDuplicateQuestions).toHaveBeenCalledWith(targetQ, otherQ);
  });

  it("6. computePaperRecallPreview 与 executeApplyPaperRecall：纸笔回录解析预览与流水持久化", () => {
    const t = (k: string) => `[${k}]`;
    const q1: any = { id: "q-1", type: "single", answer: "A" };
    const q2: any = { id: "q-2", type: "single", answer: "B" };
    const qs = [q1, q2];

    // 1. 空输入返回 null
    expect(computePaperRecallPreview("   ", qs)).toBeNull();

    // 2. 有效回录文本解析与判分
    const text = "1 = A\n2 = C\n99 = A";
    const pv = computePaperRecallPreview(text, qs);
    expect(pv).not.toBeNull();
    expect(pv?.items).toHaveLength(2);
    expect(pv?.items[0].verdict).toBe("correct");
    expect(pv?.items[1].verdict).toBe("wrong");
    expect(pv?.outOfRange).toEqual([99]);

    // 3. 应用回录流水
    const mockApp = {
      recordAttempt: vi.fn(),
    } as unknown as ExamApp;
    const applyRes = executeApplyPaperRecall(mockApp, pv!.items, t);
    expect(applyRes.count).toBe(2);
    expect(applyRes.note).toContain("[paper.applied]");
    expect(mockApp.recordAttempt).toHaveBeenCalledTimes(2);

    // 4. 空项返回未录入
    const emptyApply = executeApplyPaperRecall(mockApp, [], t);
    expect(emptyApply.count).toBe(0);
    expect(emptyApply.note).toBe("[paper.none]");
  });

  it("7. executeApplyErrata：勘误批量应用、撤销基线与 applyBatch(true) 单次求逆一致", async () => {
    const t = (k: string) => `[${k}]`;
    const mockApp = {
      applyBatchEdit: vi.fn().mockResolvedValue({ ok: 2, failed: 0 }),
    } as unknown as ExamApp;

    const fakePlan: any = {
      changes: [
        { qid: "q-1", blockId: "b-1", field: "stem", from: "旧题干", to: "新题干" },
      ],
    };

    const res = await executeApplyErrata(mockApp, fakePlan, "bank-1", t);
    expect(res.ok).toBe(2);
    expect(res.failed).toBe(0);
    expect(res.undo.bankId).toBe("bank-1");
    expect(res.undo.changes).toEqual(fakePlan.changes);
    const { invertPlan } = await import("@/core/batchEdit");
    const undoApplied = invertPlan(res.undo.changes);
    expect(undoApplied[0].from).toBe("新题干");
    expect(undoApplied[0].to).toBe("旧题干");
    expect(res.note).toBe("[errata.applied]");
    expect(mockApp.applyBatchEdit).toHaveBeenCalledWith(fakePlan.changes);
  });

  it("8. executeApplyKpPlan：考点批量修改应用与撤销基线构造", async () => {
    const t = (k: string) => `[${k}]`;
    const mockApp = {
      applyBatchEdit: vi.fn().mockResolvedValue({ ok: 3, failed: 1 }),
    } as unknown as ExamApp;

    const fakePlan: any = {
      changes: [
        { qid: "q-1", blockId: "b-1", field: "kp", from: "旧考点", to: "新考点" },
      ],
    };

    const res = await executeApplyKpPlan(mockApp, fakePlan, "bank-1", t);
    expect(res.ok).toBe(3);
    expect(res.failed).toBe(1);
    expect(res.undo.bankId).toBe("bank-1");
    expect(res.undo.changes).toEqual(fakePlan.changes);
    expect(res.note).toBe("[batch.applied]");
    expect(mockApp.applyBatchEdit).toHaveBeenCalledWith(fakePlan.changes);
  });

  it("9. computeBankHealthMetricsBundle：聚合计算题库健康指标包", () => {
    const mockApp = {
      attempts: { all: () => [] },
      listMaterials: () => [],
      questionMaterialRef: () => null,
    } as unknown as ExamApp;

    // 1. healthOpen = false 时全部为 null
    const closed = computeBankHealthMetricsBundle(mockApp, [{ id: "q-1" } as any], false);
    expect(closed.health).toBeNull();
    expect(closed.orphanDiag).toBeNull();

    // 2. healthOpen = true 且有题目时返回完整指标包
    const qs = [
      { id: "q-1", type: "single", answer: "A", stem: "题1", options: ["A", "B"], status: "published", origin: "manual", hash: "h1" },
    ] as any;
    const opened = computeBankHealthMetricsBundle(mockApp, qs, true);
    expect(opened.health).not.toBeNull();
    expect(opened.answerDist).toBeDefined();
    expect(opened.unreviewed).toBeDefined();
    expect(opened.coverage).toBeDefined();
    expect(opened.orphanDiag).toBeDefined();
  });

  it("10. executeRollbackBatchWithConfirm：带弹窗确认的批次回滚", async () => {
    const showMessage = vi.fn();
    const t = (k: string) => `[${k}]`;
    const mockApp = {
      rollbackBatch: vi.fn().mockResolvedValue({ deleted: 2, failed: 0 }),
    } as unknown as ExamApp;
    const qs = [
      { id: "q-1", batch: "b-101" },
      { id: "q-2", batch: "b-101" },
    ] as any;

    // 1. 取消
    const cancelConfirm = vi.fn().mockResolvedValue(false);
    const cancelRes = await executeRollbackBatchWithConfirm({
      app: mockApp,
      activeBankId: "bank-1",
      batch: "b-101",
      questions: qs,
      confirmDialogSync: cancelConfirm,
      showMessage,
      offline: false,
      t,
    });
    expect(cancelRes).toBe(false);
    expect(mockApp.rollbackBatch).not.toHaveBeenCalled();

    // 2. 确认
    const okConfirm = vi.fn().mockResolvedValue(true);
    const okRes = await executeRollbackBatchWithConfirm({
      app: mockApp,
      activeBankId: "bank-1",
      batch: "b-101",
      questions: qs,
      confirmDialogSync: okConfirm,
      showMessage,
      offline: false,
      t,
    });
    expect(okRes).toBe(true);
    expect(mockApp.rollbackBatch).toHaveBeenCalledWith("bank-1", "b-101");
    expect(showMessage).toHaveBeenCalled();
  });

  it("11. executeApplyBatchChanges 与 undo 读写：批量编辑应用与撤销快照持久化", async () => {
    const t = (k: string) => `[${k}]`;
    const mockApp = {
      applyBatchEdit: vi.fn().mockResolvedValue({ ok: 5, failed: 0 }),
      loadAux: vi.fn().mockResolvedValue({ changes: [{ qid: "q-1" }], bankId: "b-1", at: 123 }),
      saveAux: vi.fn().mockResolvedValue(undefined),
    } as unknown as ExamApp;

    // 1. 正常应用
    const applyRes = await executeApplyBatchChanges({
      app: mockApp,
      changes: [{ qid: "q-1" } as any],
      undo: false,
      activeBankId: "b-1",
      t,
    });
    expect(applyRes.ok).toBe(5);
    expect(applyRes.undo).toBeDefined();

    // 2. 撤销应用
    const undoRes = await executeApplyBatchChanges({
      app: mockApp,
      changes: [{ qid: "q-1" } as any],
      undo: true,
      activeBankId: "b-1",
      t,
    });
    expect(undoRes.ok).toBe(5);
    expect(undoRes.undo).toBeNull();
    expect(undoRes.appliedChanges).toEqual([]);

    // 3. 撤销快照读写
    const undoLoaded = await loadBatchUndoAux(mockApp);
    expect(undoLoaded?.changes).toHaveLength(1);
    await saveBatchUndoAux(mockApp, undoLoaded);
    expect(mockApp.saveAux).toHaveBeenCalledWith("batchedit/last", undoLoaded);
  });

  it("12. computeSyllabusKpStats：计算考点覆盖度与掌握度统计", () => {
    const mockApp = {
      attempts: {
        all: () => [
          { qid: "q-1", verdict: "correct", help: null },
          { qid: "q-2", verdict: "wrong", help: null },
        ],
      },
    } as unknown as ExamApp;

    const qs = [
      { id: "q-1", kp: "代数/方程", source: "教材" },
      { id: "q-2", kp: "代数/方程", source: "" },
    ] as any;

    const stats = computeSyllabusKpStats(mockApp, qs);
    expect(stats["代数/方程"]).toBeDefined();
    expect(stats["代数/方程"].total).toBe(2);
    expect(stats["代数/方程"].learned).toBe(1);
    expect(stats["代数/方程"].noSource).toBe(1);
  });

  it("13. parseErrataFileInput：读取并解析勘误文件", async () => {
    const csvContent =
      "题目ID,考点,难度\n" +
      "q-12345678,新考点,4\n";
    const dummyFile = {
      text: vi.fn().mockResolvedValue(csvContent),
    } as unknown as File;
    const qs = [{ id: "q-12345678", blockId: "b-1", kp: "旧考点", difficulty: 3 }] as any;

    const res = await parseErrataFileInput(dummyFile, qs);
    expect(res.plan).toBeDefined();
    expect(res.errors).toHaveLength(0);
    expect(res.plan?.changes.length).toBe(2);
  });
});
