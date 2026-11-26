import type { Question } from "../core/types";
import { foldText, OPTION_LETTERS } from "../core/answer";

export { OPTION_LETTERS };

/** 逐题校验：题干非空、答案在选项范围内、题型↔答案格式一致 */
export function validate(q: Question): string | null {
  if (!foldText(q.stem ?? "")) return "题干为空";
  const opts = Array.isArray(q.options) ? q.options : [];
  if (q.type === "single") {
    if (opts.length < 2) return "单选题至少需要 2 个选项";
    const idx = (q.answer ?? "").charCodeAt(0) - 65;
    if (!(idx >= 0 && idx < opts.length))
      return `答案 ${q.answer} 超出选项范围（A-${OPTION_LETTERS[opts.length - 1]}）`;
  }
  if (q.type === "multiple") {
    if (opts.length < 2) return "多选题至少需要 2 个选项";
    const ans = q.answer ?? "";
    if (ans.length < 2) return "多选题答案至少 2 个字母";
    for (const ch of ans) {
      const idx = ch.charCodeAt(0) - 65;
      if (!(idx >= 0 && idx < opts.length)) return `答案含越界选项 ${ch}`;
    }
  }
  // 选项区分度（"答案命中选项"核验的可检测面，AI 生成与导入共用）：
  // ① 空选项 ② 折叠后内容重复 ③ 正确答案选项文本在题干中逐字出现（题干泄漏答案；仅单选且文本 ≥4 字符防误伤）
  if (q.type === "single" || q.type === "multiple") {
    const folded = opts.map((o) => foldText(o ?? ""));
    if (folded.some((o) => !o)) return "存在空选项";
    const dup = folded.find((o, i) => folded.indexOf(o) !== i);
    if (dup) return `选项内容重复：${dup.slice(0, 20)}`;
    if (q.type === "single") {
      const ansIdx = (q.answer ?? "").charCodeAt(0) - 65;
      const ansText = folded[ansIdx] ?? "";
      if (ansText.length >= 4 && foldText(q.stem ?? "").includes(ansText)) return "题干泄漏答案（正确选项文本在题干中出现）";
    }
  }
  if (q.type === "judge" && q.answer !== "对" && q.answer !== "错") return "判断题答案必须为 对/错";
  if (q.type === "fill" && !q.answer) return "填空题答案为空";
  return null;
}
