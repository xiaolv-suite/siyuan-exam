import { describe, it, expect } from "vitest";
import { englishSampleQuestions, ENGLISH_SAMPLE_BANK_NAME, ENGLISH_SAMPLE_QUESTION_COUNT } from "../src/core/englishSample";
import { qualificationSampleQuestions, QUALIFICATION_SAMPLE_BANK_NAME, QUALIFICATION_SAMPLE_QUESTION_COUNT } from "../src/core/qualificationSample";
import { k12SampleQuestions, K12_SAMPLE_BANK_NAME, K12_SAMPLE_QUESTION_COUNT } from "../src/core/k12Sample";
import { higherSampleQuestions, HIGHER_SAMPLE_BANK_NAME, HIGHER_SAMPLE_QUESTION_COUNT } from "../src/core/higherSample";
import { EXAM_BLUEPRINT_PRESETS, adaptPresetToBlueprint } from "../src/core/examPresets";
import { grade, pinyinToNumbered } from "../src/core/answer";
import { ExamApp } from "../src/app";
import { MemoryStorage } from "../src/core/attemptLog";
import type { KernelApiClient } from "../src/kernel/client";

function stubClient() {
  const docs = new Map<string, string>();
  return {
    createNotebook: async () => "nb-test",
    createDocWithMd: async (_nb: string, _path: string, md: string) => {
      const id = "doc-" + Math.random().toString(36).slice(2, 8);
      docs.set(id, md);
      return id;
    },
    appendQuestions: async (_docId: string, qs: unknown[]) => {
      return (qs as Array<{ id: string }>).map((q) => ({ qid: q.id, blockId: "block-" + q.id }));
    },
    getBlockKramdown: async (docId: string) => docs.get(docId) ?? "content",
    sql: async () => [],
  } as unknown as KernelApiClient;
}

describe("全场景多维研学体系升级 (多语言/资格证/K12升学)", () => {
  it("英语核心研学题库 (englishSample) 具备标准音标与 en-US 语言元数据", () => {
    const questions = englishSampleQuestions();
    expect(questions.length).toBe(ENGLISH_SAMPLE_QUESTION_COUNT);
    expect(ENGLISH_SAMPLE_BANK_NAME).toContain("英语研学");

    const ubiQ = questions.find((q) => q.stem.includes("ubiquitous"));
    expect(ubiQ).toBeDefined();
    expect(ubiQ?.studyMeta?.lang).toBe("en-US");
    expect(ubiQ?.studyMeta?.phonetic).toContain("/juːˈbɪkwɪtəs/");
    expect(ubiQ?.answer).toBe("A");

    const meticQ = questions.find((q) => q.stem.includes("meticulous"));
    expect(meticQ).toBeDefined();
    expect(meticQ?.type).toBe("fill");
    expect(meticQ?.answer).toBe("precise");
  });

  it("职业资格与K12升学题库 (qualificationSample) 包含教资、中级会计、高数与物理考点", () => {
    const questions = qualificationSampleQuestions();
    expect(questions.length).toBe(QUALIFICATION_SAMPLE_QUESTION_COUNT);
    expect(QUALIFICATION_SAMPLE_BANK_NAME).toContain("考证题库");

    // 教师资格证
    const teacherQ = questions.find((q) => q.stem.includes("素质教育"));
    expect(teacherQ).toBeDefined();
    expect(teacherQ?.kp).toContain("教师资格证");
    expect(teacherQ?.answer).toBe("A");

    // 中级职称
    const midQ = questions.find((q) => q.stem.includes("中级会计"));
    expect(midQ).toBeDefined();
    expect(midQ?.kp).toContain("中级职称");
    expect(midQ?.answer).toBe("A");

    // 大学高等数学
    const mathQ = questions.find((q) => q.stem.includes("大学高数"));
    expect(mathQ).toBeDefined();
    expect(mathQ?.kp).toContain("高等数学");
    expect(mathQ?.answer).toBe("A");

    // 基金从业资格
    const fundQ = questions.find((q) => q.stem.includes("信义义务"));
    expect(fundQ).toBeDefined();
    expect(fundQ?.type).toBe("fill");
    expect(fundQ?.answer).toBe("勤勉");

    // K12 物理
    const physicsQ = questions.find((q) => q.kp?.includes("浮力原理") || q.stem.includes("浮力"));
    expect(physicsQ).toBeDefined();
    expect(physicsQ?.kp).toContain("初高中物理");
    expect(physicsQ?.answer).toBe("A");
  });

  it("试卷蓝图预设包含教资、基金从业资格、大学英语与K12综合卷", () => {
    const presetIds = EXAM_BLUEPRINT_PRESETS.map((p) => p.id);
    expect(presetIds).toContain("teacher_qualification");
    expect(presetIds).toContain("fund_qualification");
    expect(presetIds).toContain("intermediate_qualification");
    expect(presetIds).toContain("higher_calculus_exam");
    expect(presetIds).toContain("english_cet_sprint");
    expect(presetIds).toContain("k12_sprint");

    const teacherPreset = EXAM_BLUEPRINT_PRESETS.find((p) => p.id === "teacher_qualification")!;
    expect(teacherPreset.category).toBe("qualification");
    expect(teacherPreset.durationMinutes).toBe(120);
    expect(teacherPreset.passLine).toBe(70);

    const fundPreset = EXAM_BLUEPRINT_PRESETS.find((p) => p.id === "fund_qualification")!;
    expect(fundPreset.category).toBe("qualification");
    expect(fundPreset.passLine).toBe(60);

    // 自适应组卷验证
    const allSampleQs = [...qualificationSampleQuestions(), ...englishSampleQuestions()];
    const bp = adaptPresetToBlueprint("teacher_qualification", allSampleQs);
    expect(bp.sections.length).toBeGreaterThan(0);
    expect(bp.durationS).toBe(120 * 60);
  });

  it("ExamApp 支持一键创建 english 与 qualification 示范题库并正确绑定场景分类", async () => {
    const client = stubClient();
    const app = new ExamApp({ client, storage: new MemoryStorage(), now: () => 1_800_000_000_000 });
    app.kernelOnline = true;

    // 1. 英语题库
    const engBank = await app.createSampleBank("english");
    expect(engBank.name).toBe(ENGLISH_SAMPLE_BANK_NAME);
    expect(engBank.category).toBe("language");
    expect(engBank.sampleState).toBe("ready");

    // 2. 从业资格题库
    const qualBank = await app.createSampleBank("qualification");
    expect(qualBank.name).toBe(QUALIFICATION_SAMPLE_BANK_NAME);
    expect(qualBank.category).toBe("certificate");
    expect(qualBank.sampleState).toBe("ready");

    // 3. K12全科题库
    const k12Bank = await app.createSampleBank("k12");
    expect(k12Bank.name).toBe(K12_SAMPLE_BANK_NAME);
    expect(k12Bank.category).toBe("k12");
    expect(k12Bank.sampleState).toBe("ready");

    // 4. 大学与硕博高阶学术题库
    const higherBank = await app.createSampleBank("higher");
    expect(higherBank.name).toBe(HIGHER_SAMPLE_BANK_NAME);
    expect(higherBank.category).toBe("higher");
    expect(higherBank.sampleState).toBe("ready");

    const allBanks = app.listBanks();
    expect(allBanks.length).toBe(4);
  });

  it("K12全科题库 (k12Sample) 覆盖小学古诗拼音、初中理化与高中导数", () => {
    const questions = k12SampleQuestions();
    expect(questions.length).toBe(K12_SAMPLE_QUESTION_COUNT);
    expect(K12_SAMPLE_BANK_NAME).toContain("K12基础教育");

    const poemQ = questions.find((q) => q.stem.includes("春眠不觉晓"));
    expect(poemQ).toBeDefined();
    expect(poemQ?.studyMeta?.phonetic).toBe("chūn mián bù jué xiǎo");
    expect(poemQ?.answer).toBe("A");

    const mathQ = questions.find((q) => q.stem.includes("切线斜率"));
    expect(mathQ).toBeDefined();
    expect(mathQ?.kp).toContain("高中数学");
    expect(mathQ?.answer).toBe("A");

    // 拼音填空与声调转换判分 (如 qie4 与 qiè 互通)
    const pinyinQ = questions.find((q) => q.stem.includes("锲而不舍"));
    expect(pinyinQ).toBeDefined();
    expect(pinyinToNumbered("qiè")).toBe("qie4");
    expect(pinyinToNumbered("chūn")).toBe("chun1");
    // 学生输入带数字声调 qie4 或带调字母 qiè 均判对
    expect(grade(pinyinQ!, "qie4").verdict).toBe("correct");
    expect(grade(pinyinQ!, "qiè").verdict).toBe("correct");
  });

  it("大学与考研硕博题库 (higherSample) 覆盖微积分、线代、马哲与学术英语", () => {
    const questions = higherSampleQuestions();
    expect(questions.length).toBe(HIGHER_SAMPLE_QUESTION_COUNT);
    expect(HIGHER_SAMPLE_BANK_NAME).toContain("大学与考研硕博");

    const calcQ = questions.find((q) => q.stem.includes("牛顿-莱布尼茨公式"));
    expect(calcQ).toBeDefined();
    expect(calcQ?.kp).toContain("高等数学");
    expect(calcQ?.answer).toBe("A");

    const matrixQ = questions.find((q) => q.stem.includes("可逆矩阵"));
    expect(matrixQ).toBeDefined();
    expect(matrixQ?.kp).toContain("线性代数");
    expect(matrixQ?.answer).toBe("A");

    const marxQ = questions.find((q) => q.stem.includes("唯物辩证法") || q.kp?.includes("马哲"));
    expect(marxQ).toBeDefined();
    expect(marxQ?.kp).toContain("考研思想政治");
    expect(marxQ?.answer).toBe("A");
  });
});
