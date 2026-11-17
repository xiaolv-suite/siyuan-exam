// ============================================================
// 成绩单导出 Markdown（可存档/打印；P2 成绩单导出）
// ============================================================
import type { MockScore } from "./mock";
import type { Blueprint } from "./mock";
import type { Question } from "./types";
import { formatSiyuanBlockRef } from "./siyuanSyncDoc";

export interface ScoreMarkdownDetails {
  wrongItems?: { q: Question; myAnswer: string | null; flagged?: boolean }[];
  flaggedItems?: { q: Question; myAnswer: string | null }[];
}

export function scoreToMarkdown(
  bp: Blueprint,
  score: MockScore,
  startedAt: number,
  details?: ScoreMarkdownDetails,
): string {
  const d = new Date(startedAt);
  const when = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const lines = [
    `# 模考成绩单 · ${bp.name}`,
    ``,
    `- 考试时间：${when} · 用时 ${Math.round((score.full ? score.total / score.full : 0) * 100)}%`,
    `- **总分：${score.total} / ${score.full}（${score.percent}%）**`,
    `- 判定：${score.pass ? "✅ 通过" : "❌ 未通过"}（及格线 ${bp.passLine}）`,
    ``,
    `## 分模块`,
    ``,
    `| 模块 | 得分 | 满分 | 正确 | 用时 |`,
    `|---|---|---|---|---|`,
  ];
  for (const s of score.sections) {
    lines.push(
      `| ${s.name} | ${s.score} | ${s.full} | ${s.correct}/${s.total} | ${Math.round(s.timeSpentMs / 1000)}s |`,
    );
  }
  lines.push(
    ``,
    `## 行为数据`,
    ``,
    `- 标旗 ${score.flagsUsed} · 改答 ${score.changes} · 切屏 ${score.screenSwitches}`,
    `- 最后 20 分钟：做 ${score.last20min.attempted} 对 ${score.last20min.correct}`,
  );
  if (details?.wrongItems?.length) {
    lines.push(
      ``,
      `## 本场失分题目订正清单（点击双链直达源题块）`,
      ``,
    );
    details.wrongItems.forEach((item, idx) => {
      const qRef = formatSiyuanBlockRef(item.q.blockId, item.q.stem, 38);
      const kpPart = item.q.kp ? ` · 考点：\`${item.q.kp}\`` : "";
      const flagPart = item.flagged ? ` · 🚩 考场存疑标旗` : "";
      lines.push(
        `- [ ] **#${idx + 1}** ${qRef} — 考生作答：\`${item.myAnswer || "未作答"}\` | 标准答案：\`${item.q.answer}\`${kpPart}${flagPart}`,
      );
    });
  }
  if (details?.flaggedItems?.length) {
    lines.push(
      ``,
      `## 考场标旗存疑但蒙对题目（警惕伪掌握）`,
      ``,
    );
    details.flaggedItems.forEach((item, idx) => {
      const qRef = formatSiyuanBlockRef(item.q.blockId, item.q.stem, 38);
      lines.push(
        `- [ ] **#${idx + 1}** ${qRef} — 作答：\`${item.myAnswer || "—"}\`（建议复核推导过程）`,
      );
    });
  }
  return lines.join("\n");
}
