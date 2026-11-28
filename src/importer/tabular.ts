import type { Question, QuestionType } from "../core/types";
import { normalizeAnswer, questionHash, foldText, OPTION_LETTERS } from "../core/answer";
import { inferAnswerSpec } from "../core/structuredAnswer";
import { newQuestionId, newBatchId } from "../core/ids";
import { newGroupId } from "../core/cbt";
import type { ImportOptions, ImportError, ImportReport, ExcelColumnMap } from "./types";
import { validate } from "./validator";

export const TYPE_ALIASES: Record<string, QuestionType> = {
  单选: "single",
  单选题: "single",
  single: "single",
  单项选择题: "single",
  多选: "multiple",
  多选题: "multiple",
  multiple: "multiple",
  多项选择题: "multiple",
  判断: "judge",
  判断题: "judge",
  judge: "judge",
  truefalse: "judge",
  填空: "fill",
  填空题: "fill",
  fill: "fill",
  简答: "short",
  简答题: "short",
  short: "short",
  问答: "short",
  论述: "short",
  材料: "material",
  材料题: "material",
  material: "material",
  共用题干: "material",
  共用备选答案: "material",
};

export function parseType(raw: string): QuestionType | null {
  const s = foldText(raw).toLowerCase().replace(/\s/g, "");
  return TYPE_ALIASES[s] ?? null;
}

export function build(
  raw: Omit<Question, "id" | "hash" | "origin" | "score"> & { score?: number },
  opt: ImportOptions,
): Question {
  // 54 第三刀：填空答案的结构化识别（";;" 多空 / 纯数值±单位）→ answerSpec 随导入写块属性
  const spec = inferAnswerSpec(raw.type, raw.answer);
  return {
    ...raw,
    ...(spec ? { answerSpec: spec } : {}),
    id: newQuestionId(),
    score: raw.score ?? 1,
    origin: "imported",
    kp: raw.kp || opt.kp,
    difficulty: raw.difficulty ?? opt.difficulty,
    source: raw.source || opt.source,
    sourceKind: raw.sourceKind ?? opt.sourceKind,
    hash: questionHash(raw.stem, raw.options),
  };
}

export function parseExcelRows(rows: string[][], map: ExcelColumnMap, opt: ImportOptions = {}): ImportReport {
  const errors: ImportError[] = [];
  const ok: Question[] = [];
  const seenHash = new Set(opt.existingHashes);
  const dedupe = opt.dedupe !== false;
  let duplicates = 0;
  const dupeSamples: { row: number; stem: string }[] = [];
  const updates: { row: number; q: Question }[] = [];
  const batch = newBatchId();
  let lastKp = ""; // 材料组内子题沿用材料的考点

  rows.forEach((row, i) => {
    const rowNo = i + 2; // 首行表头
    // Alt+Enter 净化：选项/答案/属性单行化；题干与解析保留真实换行（\r\n 归一为 \n）
    const cell = (n?: number) => (n == null ? "" : String(row[n] ?? "").replace(/\r\n?/g, " ").replace(/\n/g, " ").trim());
    const multilineCell = (n?: number) => (n == null ? "" : String(row[n] ?? "").replace(/\r\n?/g, "\n").trim());
    try {
      const type = parseType(cell(map.type));
      if (!type) throw new Error(`题型无法识别："${cell(map.type)}"`);
      const stem = multilineCell(map.stem);
      const options = map.options.map((n) => cell(n)).filter((s) => s !== "");
      // 共用题干（医考材料组范式）：材料行开启新组；其后子题自动携带组 ID 与材料考点；
      // 子题带「不同」考点时结束该组（考点相同/为空 → 仍在组内）
      let group: string | undefined;
      if (type === "material") {
        group = newGroupId();
        opt._pendingGroup = group;
        lastKp = cell(map.kp);
      } else if (opt._pendingGroup != null) {
        group = opt._pendingGroup;
        if (cell(map.kp) && cell(map.kp) !== lastKp) {
          opt._pendingGroup = undefined; // 考点变化 → 出组（且本题不带组）
          group = undefined;
        }
      }
      const answer = type === "material" ? "" : normalizeAnswer(type, cell(map.answer));
      if (type !== "material" && !answer) throw new Error(`答案无法识别："${cell(map.answer)}"`);
      const diffRaw = parseInt(cell(map.difficulty) || "", 10);
      const scoreRaw = parseFloat(cell(map.score) || "0");
      const q = build(
        {
          type,
          stem,
          options,
          answer,
          analysis: multilineCell(map.analysis),
          difficulty: Number.isFinite(diffRaw) ? Math.min(5, Math.max(1, diffRaw)) : undefined,
          kp: cell(map.kp) || (group ? lastKp : ""),
          score: Number.isFinite(scoreRaw) && scoreRaw > 0 ? scoreRaw : undefined,
          source: cell(map.source),
          group,
        },
        opt,
      );
      if (type === "material") lastKp = q.kp;
      const bad = type === "material" ? (foldText(stem) ? null : "材料题干为空") : validate(q);
      if (bad) throw new Error(bad);
      if (dedupe && seenHash.has(q.hash)) {
        if (opt.duplicateStrategy === "update") {
          // 38-03 更新式重导：同指纹行进 updates（commit 按 hash 定位库内题，只更新答案/解析）
          updates.push({ row: rowNo, q });
        } else {
          duplicates++;
          // 已有题摘要回灌（TODO 2.3）：预览显示与题库重复的行，便于取消导入或删旧再导
          if (dupeSamples.length < 20) dupeSamples.push({ row: rowNo, stem: stem.slice(0, 40) });
        }
      } else {
        seenHash.add(q.hash);
        ok.push(q);
      }
    } catch (e) {
      errors.push({ row: rowNo, reason: (e as Error).message, raw: row.filter(Boolean).join(" | ").slice(0, 120) });
    }
  });
  return { ok, errors, duplicates, batch, dupeSamples, updates };
}

/** 官方 Excel 模板：自动列映射（按表头名识别，找不到的列报给上层；中英文别名，廿五批补 option X）。
 *  38-02：必填=题型/题干/答案；选项列不强制——仅判断/填空表可省略，选择题行由 validate 逐行报错 */
export function autoMapExcel(header: string[]): { map: ExcelColumnMap; missing: string[] } {
  const find = (...names: string[]) => header.findIndex((h) => names.includes(foldText(h).toLowerCase()));
  const options: number[] = [];
  for (const L of OPTION_LETTERS.split("")) {
    const idx = find(`选项${L.toLowerCase()}`, `选项${L}`, `option ${L.toLowerCase()}`, `option${L.toLowerCase()}`, L.toLowerCase());
    if (idx >= 0) options.push(idx);
  }
  const map: ExcelColumnMap = {
    type: find("题型", "type"),
    stem: find("题干", "stem", "题目", "question"),
    answer: find("答案", "answer"),
    options,
    analysis: find("解析", "analysis"),
    difficulty: find("难度", "difficulty"),
    kp: find("知识点", "考点", "kp"),
    score: find("分值", "score"),
    source: find("来源", "source"),
  };
  const missing: string[] = [];
  if (map.type < 0) missing.push("题型");
  if (map.stem < 0) missing.push("题干");
  if (map.answer < 0) missing.push("答案");
  return { map, missing };
}
