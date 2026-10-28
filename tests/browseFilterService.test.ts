import { describe, it, expect } from "vitest";
import {
  executeBrowseQuestionFilter,
} from "@/ui/practice/services/browseFilterService";
import type { Question } from "@/core/types";

describe("browseFilterService", () => {
  const q1: Question = {
    id: "q-1",
    type: "single",
    stem: "函数单调性判定",
    answer: "A",
    source: "2025期末",
    fav: true,
  };

  const q2: Question = {
    id: "q-2",
    type: "multiple",
    stem: "导数几何意义",
    answer: "B,C",
    source: "高考试卷",
    fav: false,
  };

  const q3: Question = {
    id: "q-3",
    type: "judge",
    stem: "奇函数的对称中心是原点",
    answer: "对",
    source: "教材习题",
    fav: true,
  };

  const allQuestions = [q1, q2, q3];

  it("filters by favOnly", () => {
    const res = executeBrowseQuestionFilter(allQuestions, {
      favOnly: true,
    });
    expect(res).toEqual([q1, q3]);
  });

  it("filters by keyword search", () => {
    const res = executeBrowseQuestionFilter(allQuestions, {
      favOnly: false,
      searchDebounced: "原点",
    });
    expect(res).toEqual([q3]);
  });

  it("filters by question type and source", () => {
    const res = executeBrowseQuestionFilter(allQuestions, {
      favOnly: false,
      filterType: "multiple",
      filterSource: "高考试卷",
    });
    expect(res).toEqual([q2]);
  });

  it("filters by wrongbook status and attempt history", () => {
    const wrongMap = new Map([
      ["q-2", { wrongCount: 3 }],
    ]);

    const res = executeBrowseQuestionFilter(allQuestions, {
      favOnly: false,
      filterWrong: true,
      wrongbookMap: wrongMap,
      attempts: [
        { qid: "q-2", help: true, ts: Date.now() },
      ],
    });
    expect(res).toEqual([q2]);
  });

  it("filters by recent days window", () => {
    const now = Date.now();
    const attempts = [
      { qid: "q-1", ts: now - 3600_000 }, // 1小时前
      { qid: "q-3", ts: now - 10 * 86_400_000 }, // 10天前
    ];

    const res = executeBrowseQuestionFilter(allQuestions, {
      favOnly: false,
      filterDays: 3,
      attempts,
    });
    expect(res).toEqual([q1]);
  });

  it("filters by orphan diagnosis targetIds", () => {
    const mockOrphanDiag: any = {
      byKind: {
        missing_kp: [{ qid: "q-2" }],
      },
    };

    const res = executeBrowseQuestionFilter(allQuestions, {
      favOnly: false,
      filterOrphanKind: "missing_kp",
      orphanDiag: mockOrphanDiag,
    });
    expect(res).toEqual([q2]);
  });
});
