import { describe, it, expect, vi } from "vitest";
import {
  countSyllabusNodes,
  previewSyllabusText,
  importSyllabusToApp,
  planErrataFromText,
  previewKpMergePlan,
  previewKpFillPlan,
  executeClusterMergeToTarget,
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
});
