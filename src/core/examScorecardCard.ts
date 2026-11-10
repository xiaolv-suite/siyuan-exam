/**
 * 小驴考试 · 思源原生 Bento 3.0 成绩单与错题回溯卡生成器
 * 遵循全生态统一 Native Document Integration Architecture：
 * 1. 原生 Callout 引述块语法 (">")
 * 2. 扁平化数据指标 (tabular-nums 友好)
 * 3. 原生块引用超链接 (( blockId '《锚文本》' ))
 * 4. 受控 IAL 属性注入 {: custom-type="exam-scorecard" }
 */

export interface ExamScorecardSection {
    name: string;
    score: number;
    full: number;
    correct?: number;
    total?: number;
}

export interface ExamScorecardWrongItem {
    blockId?: string;
    stem: string;
    myAnswer?: string | null;
    standardAnswer: string;
    kp?: string;
    flagged?: boolean;
}

export interface ExamScorecardCalloutInput {
    examId?: string;
    examTitle: string;
    date: string;               // YYYY-MM-DD
    totalScore: number;
    fullScore: number;
    passLine?: number;
    pass?: boolean;
    durationMinutes?: number;
    screenSwitches?: number;
    flagsUsed?: number;
    cognitiveFlow?: "stable" | "fatigued" | "peaked"; // 认知波浪心流状态
    sections?: readonly ExamScorecardSection[];
    wrongItems?: readonly ExamScorecardWrongItem[];
}

function escapeCalloutText(str: string): string {
    return str.replace(/[\r\n]+/g, " ").replace(/'/g, "’").trim();
}

/**
 * 组装思源文档原生 Bento 3.0 测评战报卡片 Markdown
 */
export function formatExamScorecardCalloutMarkdown(input: ExamScorecardCalloutInput): string {
    const {
        examId = "",
        examTitle,
        date: _date = "",
        totalScore,
        fullScore,
        passLine,
        pass,
        durationMinutes,
        screenSwitches = 0,
        flagsUsed = 0,
        cognitiveFlow,
        sections = [],
        wrongItems = [],
    } = input;

    const percent = fullScore > 0 ? Math.round((totalScore / fullScore) * 100) : 0;
    const isPass = pass !== undefined ? pass : (passLine !== undefined ? totalScore >= passLine : percent >= 60);
    const passBadge = isPass ? "🟢 通过" : "🔴 未通过";
    const passLinePart = passLine !== undefined ? ` (及格线: ${passLine}分)` : "";

    const lines: string[] = [
        `> 📝 **今日测评战报 · ${escapeCalloutText(examTitle)}**`,
        `> 成绩: **${totalScore}/${fullScore}** (${percent}%)${passLinePart} · ${passBadge} · 订正待办: **${wrongItems.length}** 项`,
        `>`,
    ];

    // 考试用时与行为数据
    const pacingParts: string[] = [];
    if (typeof durationMinutes === "number" && durationMinutes > 0) {
        pacingParts.push(`耗时 **${durationMinutes}** 分钟`);
    }
    if (screenSwitches > 0) {
        pacingParts.push(`切屏 **${screenSwitches}** 次`);
    }
    if (flagsUsed > 0) {
        pacingParts.push(`存疑标旗 **${flagsUsed}** 处`);
    }
    if (cognitiveFlow) {
        const flowDesc = cognitiveFlow === "stable" ? "🌊 认知心流平稳" : (cognitiveFlow === "peaked" ? "⚡ 状态绝佳" : "☕ 轻度认知疲劳");
        pacingParts.push(flowDesc);
    }
    if (pacingParts.length > 0) {
        lines.push(`> - ⏱️ **考场状态与节奏**: ${pacingParts.join(" · ")}`);
    }

    // 模块成绩概览
    if (sections.length > 0) {
        const secSummaries = sections.map((s) => {
            const secPercent = s.full > 0 ? Math.round((s.score / s.full) * 100) : 0;
            return `${escapeCalloutText(s.name)}: **${s.score}/${s.full}** (${secPercent}%)`;
        });
        lines.push(`> - 🎯 **模块概览**: ${secSummaries.join(" · ")}`);
    }

    // 失分题目订正清单（携带原题块反链 (( blockId '题目截取...' )) ）
    if (wrongItems.length > 0) {
        lines.push(`> - ❌ **失分题目订正清单 (点击双链直达源题块)**:`);
        wrongItems.forEach((item, idx) => {
            const shortStem = item.stem.length > 36 ? item.stem.slice(0, 36) + "…" : item.stem;
            const cleanStem = escapeCalloutText(shortStem);
            const ref = item.blockId ? `(( ${item.blockId} '${cleanStem}' ))` : cleanStem;
            const myAns = item.myAnswer ? `\`${escapeCalloutText(item.myAnswer)}\`` : "未作答";
            const stdAns = `\`${escapeCalloutText(item.standardAnswer)}\``;
            const kpPart = item.kp ? ` · 考点: \`${escapeCalloutText(item.kp)}\`` : "";
            const flagPart = item.flagged ? " · 🚩 考场标旗" : "";
            lines.push(`>   - [ ] **#${idx + 1}** ${ref} — 作答: ${myAns} | 标答: ${stdAns}${kpPart}${flagPart}`);
        });
    }

    const ialId = examId ? ` custom-exam-id="${examId}"` : "";
    lines.push(`{: custom-type="exam-scorecard"${ialId} custom-score="${totalScore}" custom-pass="${isPass}" }`);
    return lines.join("\n") + "\n";
}
