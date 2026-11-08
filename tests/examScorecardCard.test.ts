import { describe, it, expect } from "vitest";
import { formatExamScorecardCalloutMarkdown, type ExamScorecardCalloutInput } from "../src/core/examScorecardCard";

describe("小驴考试 · 思源原生 Bento 3.0 成绩单与错题回溯卡契约测试", () => {
    it("1. 基础战报渲染：及格判定、百分比换算与标准 IAL 元数据", () => {
        const input: ExamScorecardCalloutInput = {
            examTitle: "2026年上半年软件设计师模拟考",
            date: "2026-11-08",
            totalScore: 54,
            fullScore: 75,
            passLine: 45,
        };

        const md = formatExamScorecardCalloutMarkdown(input);

        expect(md.startsWith("> 📝 **今日测评战报 · 2026年上半年软件设计师模拟考**")).toBe(true);
        expect(md).toContain("成绩: **54/75** (72%) (及格线: 45分) · 🟢 通过");
        expect(md).toContain('{: custom-type="exam-scorecard" custom-score="54" custom-pass="true" }');
    });

    it("2. 完整战报渲染：考场节奏、模块细分与失分双链订正清单", () => {
        const input: ExamScorecardCalloutInput = {
            examId: "exam-20261108-01",
            examTitle: "前端高级架构师专项测评",
            date: "2026-11-08",
            totalScore: 82,
            fullScore: 100,
            passLine: 80,
            durationMinutes: 45,
            screenSwitches: 1,
            flagsUsed: 3,
            cognitiveFlow: "stable",
            sections: [
                { name: "JavaScript/TypeScript 深度", score: 28, full: 30 },
                { name: "工程化与打包构建", score: 24, full: 30 },
                { name: "系统架构与性能优化", score: 30, full: 40 },
            ],
            wrongItems: [
                {
                    blockId: "block-q1",
                    stem: "关于 ES Module 与 CommonJS 的循环依赖处理机制，下列说法正确的是",
                    myAnswer: "A",
                    standardAnswer: "C",
                    kp: "模块加载规范",
                    flagged: true,
                },
                {
                    blockId: "block-q2",
                    stem: "在 Chrome V8 引擎中，Inline Cache (IC) 的三种状态转换顺序是",
                    myAnswer: "B",
                    standardAnswer: "D",
                    kp: "V8 引擎原理",
                },
            ],
        };

        const md = formatExamScorecardCalloutMarkdown(input);

        // 考场状态
        expect(md).toContain("⏱️ **考场状态与节奏**: 耗时 **45** 分钟 · 切屏 **1** 次 · 存疑标旗 **3** 处 · 🌊 认知心流平稳");

        // 模块概览
        expect(md).toContain("JavaScript/TypeScript 深度: **28/30** (93%)");
        expect(md).toContain("工程化与打包构建: **24/30** (80%)");
        expect(md).toContain("系统架构与性能优化: **30/40** (75%)");

        // 错题双链反向订正清单
        expect(md).toContain(">   - [ ] **#1** (( block-q1 '关于 ES Module 与 CommonJS 的循环依赖处理机制，下列…' )) — 作答: `A` | 标答: `C` · 考点: `模块加载规范` · 🚩 考场标旗");
        expect(md).toContain(">   - [ ] **#2** (( block-q2 '在 Chrome V8 引擎中，Inline Cache (IC) 的三…' )) — 作答: `B` | 标答: `D` · 考点: `V8 引擎原理`");

        // IAL 包含 examId
        expect(md).toContain('custom-exam-id="exam-20261108-01"');
    });

    it("3. 未通过场景渲染：红色警示标识与未作答兜底", () => {
        const input: ExamScorecardCalloutInput = {
            examTitle: "初级计算机基础测验",
            date: "2026-11-08",
            totalScore: 35,
            fullScore: 100,
            passLine: 60,
            cognitiveFlow: "fatigued",
            wrongItems: [
                {
                    stem: "简述二进制补码的表示范围",
                    myAnswer: null,
                    standardAnswer: "-128 ~ 127",
                },
            ],
        };

        const md = formatExamScorecardCalloutMarkdown(input);
        expect(md).toContain("🔴 未通过");
        expect(md).toContain("☕ 轻度认知疲劳");
        expect(md).toContain("作答: 未作答 | 标答: `-128 ~ 127`");
        expect(md).toContain('custom-pass="false"');
    });
});
