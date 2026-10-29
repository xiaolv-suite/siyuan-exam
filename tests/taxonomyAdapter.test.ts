import { describe, it, expect } from "vitest";
import {
  convertTaxonomyToSyllabus,
  buildTaxonomyKpMap,
  convertTaxonomyDependencies,
  convertTaxonomyQuestions,
  getStandardMathTaxonomyPreset,
  getStandardCivilServiceTaxonomyPreset,
  getStandardTaxonomyPreset,
  STANDARD_MATH_TAXONOMY_TOPICS,
  STANDARD_MATH_TAXONOMY_DEPENDENCIES,
  STANDARD_MATH_TAXONOMY_QUESTIONS,
  STANDARD_CIVIL_SERVICE_TAXONOMY_TOPICS,
  type TaxonomyTopic,
  type TaxonomyDependency,
  type TaxonomyQuestionItem,
} from "@/core/taxonomyAdapter";
import { detectPrereqCycles } from "@/core/kpRelations";

describe("中国学科知识图谱与课程标准适配器 (taxonomyAdapter)", () => {
  const sampleTopics: TaxonomyTopic[] = [
    {
      id: "cnm_001",
      name: "正数和负数",
      domain: "数与代数",
      chapter: "七上 第一章 有理数",
      grade: 7,
      description: "理解正数与负数的概念，会用正负数表示相反意义的量。",
      standards: [{ id: "cms-2022:4.NA.01" }],
    },
    {
      id: "cnm_002",
      name: "有理数的概念与分类",
      domain: "数与代数",
      chapter: "七上 第一章 有理数",
      grade: 7,
      description: "理解有理数的意义，会对有理数进行分类。",
    },
    {
      id: "cnm_003",
      name: "数轴",
      domain: "数与代数",
      chapter: "七上 第一章 有理数",
      grade: 7,
      description: "掌握数轴的三要素，会用数轴上的点表示有理数。",
    },
    {
      id: "cnm_010",
      name: "相反数与绝对值",
      domain: "数与代数",
      chapter: "七上 第一章 有理数",
      grade: 7,
    },
    {
      id: "cnm_050",
      name: "平行线的性质",
      domain: "图形与几何",
      chapter: "七下 第七章 相交线与平行线",
      grade: 7,
    },
  ];

  const sampleDependencies: TaxonomyDependency[] = [
    {
      topicId: "cnm_002",
      prerequisiteId: "cnm_001",
      strength: "hard",
      reason: "只有理解了负数，才能将数系扩充为有理数并分类。",
    },
    {
      topicId: "cnm_003",
      prerequisiteId: "cnm_001",
      strength: "hard",
      reason: "数轴的正负半轴需要正数和负数作为前置概念。",
    },
    {
      topicId: "cnm_010",
      prerequisiteId: "cnm_003",
      strength: "soft",
      reason: "借助数轴上点到原点的距离直观理解绝对值。",
    },
  ];

  const sampleQuestions: TaxonomyQuestionItem[] = [
    {
      id: "q_cnm_001_1",
      topic_id: "cnm_001",
      stem: "如果向东走 5 米记作 +5 米，那么向西走 3 米记作（ ）",
      options: ["+3 米", "-3 米", "+5 米", "-5 米"],
      answer: "1", // 索引 1 -> B
      analysis: "相反意义的量：向东为正，则向西为负，故记作 -3 米。",
      difficulty: "basic",
    },
    {
      id: "q_cnm_003_1",
      topic_id: "cnm_003",
      question: "数轴的三要素分别是原点、正方向和____。",
      answer: "单位长度",
      analysis: "数轴三要素规定为原点、正方向和单位长度。",
      difficulty: 2,
    },
  ];

  it("1. convertTaxonomyToSyllabus：构建多层级考纲树", () => {
    const roots = convertTaxonomyToSyllabus(sampleTopics);
    expect(roots).toHaveLength(2); // "数与代数", "图形与几何"

    const algebra = roots.find((r) => r.title === "数与代数");
    expect(algebra).toBeDefined();
    expect(algebra!.children).toHaveLength(1); // "七上 第一章 有理数"

    const chapter1 = algebra!.children[0];
    expect(chapter1.title).toBe("七上 第一章 有理数");
    expect(chapter1.children).toHaveLength(4); // 正数和负数, 有理数的概念与分类, 数轴, 相反数与绝对值

    const leaf1 = chapter1.children[0];
    expect(leaf1.title).toBe("正数和负数");
    expect(leaf1.kpPrefix).toBe("数与代数/七上 第一章 有理数/正数和负数");
  });

  it("2. buildTaxonomyKpMap：构建标准的全局考点路径字典", () => {
    const map = buildTaxonomyKpMap(sampleTopics);
    expect(map.get("cnm_001")).toBe("数与代数/七上 第一章 有理数/正数和负数");
    expect(map.get("cnm_050")).toBe("图形与几何/七下 第七章 相交线与平行线/平行线的性质");
  });

  it("3. convertTaxonomyDependencies：转换先修边并验证 DAG 无环拓扑", () => {
    const topicMap = buildTaxonomyKpMap(sampleTopics);

    // 全量转换（含 hard 与 soft）
    const allRelations = convertTaxonomyDependencies(sampleDependencies, topicMap);
    expect(allRelations).toHaveLength(3);
    expect(allRelations[0].from).toBe("数与代数/七上 第一章 有理数/有理数的概念与分类");
    expect(allRelations[0].to).toBe("数与代数/七上 第一章 有理数/正数和负数");
    expect(allRelations[0].kind).toBe("prereq");
    expect(allRelations[0].confirmed).toBe(true);

    // 仅保留硬门槛
    const hardRelations = convertTaxonomyDependencies(sampleDependencies, topicMap, { hardOnly: true });
    expect(hardRelations).toHaveLength(2);

    // 拓扑检环验证（确保图谱无循环依赖）
    const cycles = detectPrereqCycles(allRelations);
    expect(cycles).toEqual([]);
  });

  it("4. convertTaxonomyQuestions：将外部题库转换为小驴考试标准题目", () => {
    const topicMap = buildTaxonomyKpMap(sampleTopics);
    const questions = convertTaxonomyQuestions(sampleQuestions, topicMap, { source: "人教版精选诊断" });

    expect(questions).toHaveLength(2);

    // 单选题目转换
    const q1 = questions[0];
    expect(q1.type).toBe("single");
    expect(q1.options).toHaveLength(4);
    expect(q1.answer).toBe("B"); // 数字 1 转换为字母 B
    expect(q1.kp).toBe("数与代数/七上 第一章 有理数/正数和负数");
    expect(q1.source).toBe("人教版精选诊断");
    expect(q1.difficulty).toBe(2); // "basic" -> 2

    // 填空题目转换
    const q2 = questions[1];
    expect(q2.type).toBe("fill");
    expect(q2.stem).toContain("数轴的三要素");
    expect(q2.answer).toBe("单位长度");
    expect(q2.kp).toBe("数与代数/七上 第一章 有理数/数轴");
  });

  it("5. getStandardMathTaxonomyPreset：提供开箱即用的国家新课标初高中图谱套件", () => {
    expect(STANDARD_MATH_TAXONOMY_TOPICS.length).toBeGreaterThan(0);
    expect(STANDARD_MATH_TAXONOMY_DEPENDENCIES.length).toBeGreaterThan(0);
    expect(STANDARD_MATH_TAXONOMY_QUESTIONS.length).toBeGreaterThan(0);

    const preset = getStandardMathTaxonomyPreset();

    // 1. 考点与树状大纲
    expect(preset.topics.length).toBeGreaterThanOrEqual(10);
    expect(preset.syllabusRoots.length).toBeGreaterThan(0);
    const domainTitles = preset.syllabusRoots.map((r) => r.title);
    expect(domainTitles).toContain("数与代数");
    expect(domainTitles).toContain("方程与不等式");
    expect(domainTitles).toContain("函数与分析");
    expect(domainTitles).toContain("图形与几何");

    // 2. 先修边与拓扑检环
    expect(preset.dependencies.length).toBeGreaterThanOrEqual(8);
    expect(preset.relations.length).toBeGreaterThanOrEqual(8);
    const cycles = detectPrereqCycles(preset.relations);
    expect(cycles).toEqual([]); // 严格 DAG 无环

    // 3. 示范题目
    expect(preset.sampleQuestions.length).toBeGreaterThanOrEqual(5);
    for (const q of preset.sampleQuestions) {
      expect(q.kp).toBeTruthy();
      expect(q.stem).toBeTruthy();
      expect(q.answer).toBeTruthy();
      expect(q.status).toBe("published");
    }
  });

  it("6. getStandardCivilServiceTaxonomyPreset 与 getStandardTaxonomyPreset：公考行测知识图谱预设", () => {
    expect(STANDARD_CIVIL_SERVICE_TAXONOMY_TOPICS.length).toBeGreaterThan(0);

    const csPreset = getStandardCivilServiceTaxonomyPreset();
    expect(csPreset.topics.length).toBeGreaterThanOrEqual(8);
    expect(csPreset.syllabusRoots.length).toBeGreaterThan(0);
    const domainTitles = csPreset.syllabusRoots.map((r) => r.title);
    expect(domainTitles).toContain("言语理解与表达");
    expect(domainTitles).toContain("数量关系");
    expect(domainTitles).toContain("判断推理");
    expect(domainTitles).toContain("资料分析");

    // 拓扑检环
    const cycles = detectPrereqCycles(csPreset.relations);
    expect(cycles).toEqual([]); // 严格 DAG 无环

    // 题目
    expect(csPreset.sampleQuestions.length).toBeGreaterThanOrEqual(2);

    // 通用获取
    const math = getStandardTaxonomyPreset("math");
    expect(math.topics).toEqual(STANDARD_MATH_TAXONOMY_TOPICS);
    const cs = getStandardTaxonomyPreset("civil_service");
    expect(cs.topics).toEqual(STANDARD_CIVIL_SERVICE_TAXONOMY_TOPICS);
  });
});
