// ============================================================
// 题库浏览与复合条件过滤服务（browseFilterService.ts）
// 承接历史作答时间窗口、受助统计、错题本结合以及孤儿题靶向过滤
// 纯逻辑解耦，不绑定 Svelte 渲染态
// ============================================================

import type { Question, AttemptEvent } from "@/core/types";
import { matchesBrowseFilter } from "@/core/browseFilter";
import type { SectionRef } from "@/core/sectionTree";
import type { OrphanDiagnosis, OrphanKind } from "@/core/bankHealth";

export interface BrowseFilterCriteriaOptions {
  favOnly: boolean;
  filterOrphanKind?: OrphanKind | "";
  orphanDiag?: OrphanDiagnosis | null;
  filterType?: string;
  filterSource?: string;
  filterWrong?: boolean;
  filterStatus?: string;
  filterDispute?: boolean;
  filterHelp?: boolean;
  filterDays?: number;
  filterUserTag?: string;
  searchDebounced?: string;
  sectionSel?: SectionRef | null;
  attempts?: ReadonlyArray<AttemptEvent>;
  wrongbookMap?: ReadonlyMap<string, { wrongCount: number }> | null;
}

/** 执行全量题库多维度复合过滤 */
export function executeBrowseQuestionFilter(
  questions: Question[],
  options: BrowseFilterCriteriaOptions,
): Question[] {
  const {
    favOnly,
    filterOrphanKind,
    orphanDiag,
    filterType = "",
    filterSource = "",
    filterWrong = false,
    filterStatus = "",
    filterDispute = false,
    filterHelp = false,
    filterDays = 0,
    filterUserTag = "",
    searchDebounced = "",
    sectionSel = null,
    attempts = [],
    wrongbookMap = null,
  } = options;

  const base = favOnly ? questions.filter((q) => q.fav) : questions;

  const targetIds =
    filterOrphanKind && orphanDiag
      ? new Set(orphanDiag.byKind[filterOrphanKind].map((item) => item.qid))
      : null;

  let helped: Set<string> | null = null;
  let recent: Set<string> | null = null;

  if (filterWrong || filterHelp || filterDays > 0) {
    const cutoff = filterDays > 0 ? Date.now() - filterDays * 86_400_000 : 0;
    helped = new Set<string>();
    recent = new Set<string>();

    for (const e of attempts) {
      if (e.help) helped.add(e.qid);
      if (!cutoff || e.ts >= cutoff) recent.add(e.qid);
    }
  }

  const kw = searchDebounced.trim().toLowerCase();

  return base.filter((q) =>
    matchesBrowseFilter(q, {
      section: sectionSel,
      type: filterType,
      status: filterStatus,
      disputedOnly: filterDispute,
      targetIds,
      source: filterSource,
      wrongOnly: filterWrong,
      helpedOnly: filterHelp,
      recentOnly: filterDays > 0,
      userTag: filterUserTag || null,
      keyword: kw,
      wrongCountOf: (id) => wrongbookMap?.get(id)?.wrongCount ?? 0,
      helped,
      recent,
    }),
  );
}
