import { describe, it, expect } from "vitest";
import type { Question } from "../src/core/types";
import {
  buildPrintProCss,
  buildCompactQuestionSheetPro,
  buildCompactAnswerSheetPro,
  buildTeacherLectureSheetPro,
  buildStudentHomeworkSheetPro,
  buildWrongbookRetestSheetPro,
  auditQuestionSheetSafety,
  computeOptionColumns,
  groupAndSortPaperQuestions,
  buildStandardAnswerCardPro,
  generatePaperVariant,
  auditPaperBeforePrint,
} from "../src/core/printPro";

function mkQ(id: string, overrides: Partial<Question> = {}): Question {
  return {
    id,
    type: "single",
    stem: `题干 ${id}`,
    options: ["选项甲", "选项乙", "选项丙", "选项丁"],
    answer: "B",
    analysis: `这是 ${id} 的详细解析说明内容`,
    score: 2,
    origin: "manual",
    hash: `h-${id}`,
    ...overrides,
  };
}

describe("PrintPro A4 双栏紧凑打印与分页防断引擎 (68-04 / 79-02)", () => {
  describe("buildPrintProCss (分栏与纸张规范)", () => {
    it("默认输出 A4 双栏紧凑 CSS，含分栏与页面尺寸规则", () => {
      const css = buildPrintProCss();
      expect(css).toContain("size: A4 portrait");
      expect(css).toContain("column-count: 2");
      expect(css).toContain("@page");
      expect(css).toContain("counter(page)");
    });

    it("可切换 Letter 纸张与单栏布局", () => {
      const css = buildPrintProCss({ paperSize: "Letter", columns: "single" });
      expect(css).toContain("size: Letter portrait");
      expect(css).toContain("column-count: 1");
      expect(css).not.toContain("column-count: 2");
    });

    it("包含材料卡片不分页与分栏断裂保护规则", () => {
      const css = buildPrintProCss();
      expect(css).toContain(".material-block");
      expect(css).toContain("page-break-inside: avoid");
      expect(css).toContain("break-inside: avoid");
      expect(css).toContain("page-break-after: avoid");
    });
  });

  describe("buildCompactQuestionSheetPro (作答卷安全红线)", () => {
    it("生成完整作答卷 HTML，含页眉页脚、题型与选项，绝不含答案与解析", () => {
      const qs = [mkQ("q1"), mkQ("q2", { type: "fill", options: [], answer: "氧气" })];
      const html = buildCompactQuestionSheetPro("模拟测试卷", qs, { paperNo: "P-2026-01", showScore: true });

      expect(html.startsWith("<!DOCTYPE html>")).toBe(true);
      expect(html).toContain("模拟测试卷");
      expect(html).toContain("试卷编号 P-2026-01");
      expect(html).toContain("A. 选项甲");
      expect(html).toContain("2 分");
      expect(html).toContain("answer-area");
      // 安全红线
      expect(html).not.toContain("这是 q1 的详细解析说明内容");
      // 审计
      const audit = auditQuestionSheetSafety(html, qs);
      expect(audit.safe).toBe(true);
    });

    it("材料题组只打印一次材料卡片，子题不重复且材料属题面", () => {
      const material: Question = {
        ...mkQ("m1", { type: "material", options: [], answer: "", stem: "材料母块" }),
        group: "grp-1",
        analysis: "这是一段很长很长的共用阅读理解材料正文内容。",
      };
      const sub1 = mkQ("s1", { group: "grp-1" });
      const sub2 = mkQ("s2", { group: "grp-1" });

      const html = buildCompactQuestionSheetPro("材料组卷", [material, sub1, sub2]);
      const occurrences = (html.match(/这是一段很长很长的共用阅读理解材料正文内容。/g) || []).length;
      expect(occurrences).toBe(1);
      expect(html).toContain("material-block");
    });

    it("XSS 注入被严格转义", () => {
      const q = mkQ("xss", { stem: `<script>alert("x")</script>` });
      const html = buildCompactQuestionSheetPro("注入卷", [q]);
      expect(html).not.toContain("<script>alert");
      expect(html).toContain("&lt;script&gt;");
    });

    it("安全审计能检出泄漏答案的非法卷面", () => {
      const qs = [mkQ("leak", { answer: "正确答案文本" })];
      const html = `<html><body><div>正确答案文本</div></body></html>`;
      const audit = auditQuestionSheetSafety(html, qs);
      expect(audit.safe).toBe(false);
      expect(audit.violations[0]).toContain("leak");
    });
  });

  describe("buildCompactAnswerSheetPro (详解答案册)", () => {
    it("答案册包含标准答案、考点与采分点，材料题跳过编号", () => {
      const material: Question = {
        ...mkQ("m1", { type: "material", options: [], answer: "", analysis: "材料" }),
        group: "g1",
      };
      const sub = mkQ("s1", { group: "g1", kp: "言语/主旨" });
      const shortQ = mkQ("short1", {
        type: "short",
        options: [],
        answer: "参考答案要点",
        rubric: {
          v: 1,
          kind: "rubric",
          fullScore: 10,
          criteria: [
            { id: "c1", label: "观点明确", weight: 0.6 },
            { id: "c2", label: "论证充分", weight: 0.4 },
          ],
        },
      });

      const html = buildCompactAnswerSheetPro("答案册测试", [material, sub, shortQ]);
      expect(html).toContain("答案册");
      expect(html).toContain("言语/主旨");
      expect(html).toContain("采分点：观点明确(60%) · 论证充分(40%)");
      expect(html).toContain("参考答案要点");
      // 材料题不占用题号：第一道真实题编号应为 1
      expect(html).toContain(`1. <strong>B</strong>`);
    });
  });

  describe("buildTeacherLectureSheetPro (教师授课与备课讲义卷)", () => {
    it("包含完整题干、选项、教师参考答案、考点星级难度、采分点标准与破题教学点拨", () => {
      const q: Question = {
        id: "q-lecture-1",
        type: "single",
        stem: "若 $x + 2 = 5$，则 $x$ 等于（ ）",
        options: ["1", "2", "3", "4"],
        answer: "C",
        kp: "初等代数 / 一元一次方程",
        difficulty: 3,
        analysis: "移项可得 $x = 5 - 2 = 3$，故选 C。",
      };

      const html = buildTeacherLectureSheetPro("2026 代数教学教案", [q]);
      expect(html).toContain("教师讲义教案卷");
      expect(html).toContain("教师授课讲义卷");
      expect(html).toContain("初等代数 / 一元一次方程");
      expect(html).toContain("★★★☆☆");
      expect(html).toContain("参考答案");
      expect(html).toContain("<strong>C</strong>");
      expect(html).toContain("教学点拨与破题分析");
      expect(html).toContain("移项可得");
      expect(html).toContain('class="teacher-box"');
    });

    it("groupByKp 开启时自动在题目跨章节考点时插入考点小标题", () => {
      const q1 = mkQ("q-kp-1", { kp: "常识/宪法" });
      const q2 = mkQ("q-kp-2", { kp: "常识/经济" });
      const html = buildCompactQuestionSheetPro("试卷", [q1, q2], { groupByKp: true });
      expect(html).toContain("section-divider");
      expect(html).toContain("📌 考点章节：常识/宪法");
      expect(html).toContain("📌 考点章节：常识/经济");
    });
  });

  describe("buildStudentHomeworkSheetPro (学生课后作业与导学单)", () => {
    it("输出包含班级姓名学生填写栏与课后自我反思订正栏", () => {
      const q = mkQ("q-hw-1", { type: "short", stem: "简述光合作用的两个阶段及场所。" });
      const html = buildStudentHomeworkSheetPro("生物每日分层作业", [q]);
      expect(html).toContain("课后作业导学单");
      expect(html).toContain("homework-student-bar");
      expect(html).toContain("姓名：___________");
      expect(html).toContain("班级：___________");
      expect(html).toContain("homework-reflection-box");
      expect(html).toContain("学生自我诊断与订正栏");
    });
  });

  describe("buildWrongbookRetestSheetPro (错题清零纯净重测卷)", () => {
    it("输出包含错题清零目标条、错题重练徽章与二次订正反思框，且绝不泄露答案", () => {
      const q = mkQ("q-retest-1", { type: "single", stem: "下列关于质能方程表述正确的是", answer: "C" });
      const html = buildWrongbookRetestSheetPro("物理错题重做", [q]);
      expect(html).toContain("错题清零重测卷");
      expect(html).toContain("本次目标：错题清零");
      expect(html).toContain("错题重练");
      expect(html).toContain("homework-reflection-box");
      expect(html).toContain("错题清零自我归因与二次反思");
      expect(html).not.toContain("这是 q-retest-1 的详细解析");

      const audit = auditQuestionSheetSafety(html, [q]);
      expect(audit.safe).toBe(true);
    });
  });

  describe("exam-zh & 出版级真卷排版扩展", () => {
    it("computeOptionColumns 根据选项长度智能自适应 4/2/1 列", () => {
      // 短选项：4 列
      expect(computeOptionColumns(["A", "B", "C", "D"])).toBe(4);
      expect(computeOptionColumns(["1", "2", "3", "4"])).toBe(4);
      expect(computeOptionColumns(["正确", "错误", "可能", "未知"])).toBe(4);

      // 中等长度选项：2 列
      expect(computeOptionColumns([
        "函数在区间上单调递增",
        "函数在区间上单调递减",
        "函数在区间上先增后减",
        "函数在区间上先减后增",
      ])).toBe(2);

      // 长选项：1 列
      expect(computeOptionColumns([
        "这是一个非常漫长详细且包含大量说明文字的选项A描述",
        "这是一个非常漫长详细且包含大量说明文字的选项B描述",
        "这是一个非常漫长详细且包含大量说明文字的选项C描述",
        "这是一个非常漫长详细且包含大量说明文字的选项D描述",
      ])).toBe(1);

      // 2 选项测试
      expect(computeOptionColumns(["对", "错"])).toBe(2);
      expect(computeOptionColumns([
        "这是一个非常漫长详细且包含大量说明文字的判断选项甲描述内容",
        "这是一个非常漫长详细且包含大量说明文字的判断选项乙描述内容",
      ])).toBe(1);
    });

    it("生成装订密封线 (showSealLine) 与 考生须知 (showExamNotice)", () => {
      const q = mkQ("q-opt-1", { options: ["1", "2", "3", "4"] });
      const html = buildCompactQuestionSheetPro("真卷测试", [q], {
        showSealLine: true,
        showExamNotice: true,
      });

      expect(html).toContain("seal-line-bar");
      expect(html).toContain("密封线内不要答题");
      expect(html).toContain("准考证号");
      expect(html).toContain("exam-notice-box");
      expect(html).toContain("考生须知 / 注意事项");
      expect(html).toContain("opt-grid opt-grid-4");
    });

    it("支持主观题厘米级预留作答空白高度 (shortAnswerSpaceCm)", () => {
      const q = mkQ("q-short-cm", { type: "short", stem: "请详细推导拉格朗日中值定理。" });
      const html = buildCompactQuestionSheetPro("主观题卷", [q], {
        shortAnswerSpaceCm: 6.5,
      });

      expect(html).toContain("answer-area-custom");
      expect(html).toContain("style=\"min-height:6.5cm\"");
    });

    it("支持卷首阅卷总分表格、考生信息栏、小题得分框与卷尾解析附录", () => {
      const q1 = mkQ("q-grid-1", { type: "single", score: 5 });
      const q2 = mkQ("q-grid-2", { type: "short", score: 10, analysis: "大题详细推导", expansion: "秒杀公式" });
      const html = buildCompactQuestionSheetPro("期中模拟考试", [q1, q2], {
        subtitle: "考试时长：120分钟 满分：100分",
        showStudentInfoBar: true,
        showScoreGrid: true,
        showPerQuestionScoreBox: true,
        appendSolutionsAtEnd: true,
        fontSizeMode: "compact",
      });

      expect(html).toContain("sheet-main-title");
      expect(html).toContain("期中模拟考试");
      expect(html).toContain("sheet-sub-title");
      expect(html).toContain("考试时长：120分钟 满分：100分");
      expect(html).toContain("student-info-bar");
      expect(html).toContain("score-grid-table");
      expect(html).toContain("核分人");
      expect(html).toContain("q-score-box");
      expect(html).toContain("solution-appendix-divider");
      expect(html).toContain("大题详细推导");
      expect(html).toContain("秒杀公式");
    });

    it("groupAndSortPaperQuestions 能够正确将试题按大题归类并生成正规指导语", () => {
      const qSingle = mkQ("q-s", { type: "single", score: 3 });
      const qJudge = mkQ("q-j", { type: "judge", score: 2 });
      const qShort = mkQ("q-sh", { type: "short", score: 10 });
      const groups = groupAndSortPaperQuestions([qShort, qSingle, qJudge]);

      expect(groups.length).toBe(3);
      // 应按标准考试顺序：单选 -> 判断 -> 解答
      expect(groups[0].type).toBe("single");
      expect(groups[0].sectionIndex).toBe("一");
      expect(groups[0].sectionTitle).toContain("单项选择题");
      expect(groups[0].sectionNotice).toContain("本大题共 1 小题");

      expect(groups[1].type).toBe("judge");
      expect(groups[1].sectionIndex).toBe("二");

      expect(groups[2].type).toBe("short");
      expect(groups[2].sectionIndex).toBe("三");
    });

    it("buildStandardAnswerCardPro 生成标准 A4 填涂答题卡 HTML", () => {
      const q1 = mkQ("q-ans-1", { type: "single" });
      const q2 = mkQ("q-ans-2", { type: "judge" });
      const q3 = mkQ("q-ans-3", { type: "short", score: 12 });
      const html = buildStandardAnswerCardPro("期末统一考试", [q1, q2, q3]);

      expect(html).toContain("期末统一考试 · 答题卡");
      expect(html).toContain("条形码粘贴区");
      expect(html).toContain("准考证号");
      expect(html).toContain("一、客观选择题填涂区");
      expect(html).toContain("bubble-matrix");
      expect(html).toContain("[A]");
      expect(html).toContain("[T]");
      expect(html).toContain("二、非选择题作答区");
      expect(html).toContain("card-subjective-box");
      expect(html).toContain("超出边框无效");
    });

    it("generatePaperVariant 能够为 A/B 卷打乱选项并正确重映射答案", () => {
      const q = mkQ("q-var-1", {
        type: "single",
        options: ["第一项", "第二项", "第三项", "第四项"],
        answer: "B",
      });

      const varB = generatePaperVariant([q], "B");
      expect(varB.length).toBe(1);
      expect(varB[0].options.length).toBe(4);
      // 答案字母必须在新选项列表中依然指向“第二项”
      const newAnsIndex = varB[0].answer.charCodeAt(0) - 65;
      expect(varB[0].options[newAnsIndex]).toBe("第二项");
    });

    it("generatePaperVariant 能够为连写多选题 (multiple: 'AC') 打乱选项并精准重映射多答案字母", () => {
      const q = mkQ("q-var-multi", {
        type: "multiple",
        options: ["第一项", "第二项", "第三项", "第四项"],
        answer: "AC",
      });

      const varB = generatePaperVariant([q], "B");
      expect(varB.length).toBe(1);
      const newLetters = varB[0].answer.split("");
      expect(newLetters.length).toBe(2);
      // 新答案字母列表映射的选项必须是“第一项”和“第三项”
      const mappedOpts = newLetters.map((l) => varB[0].options[l.charCodeAt(0) - 65]);
      expect(mappedOpts).toContain("第一项");
      expect(mappedOpts).toContain("第三项");
    });

    it("auditPaperBeforePrint 印刷前排版质检与总分统计", () => {
      const qOk = mkQ("q-ok", { score: 5, answer: "A", options: ["A", "B", "C", "D"] });
      const qErr = mkQ("q-err", { score: 0, answer: "Z", options: ["A", "B"] });

      const audit = auditPaperBeforePrint([qOk, qErr]);
      expect(audit.totalScore).toBe(5);
      expect(audit.questionCount).toBe(2);
      expect(audit.errors.length).toBeGreaterThan(0);
      expect(audit.errors.some((e) => e.includes("超出选项范围"))).toBe(true);
      expect(audit.warnings.some((w) => w.includes("0 分"))).toBe(true);
    });
  });
});
