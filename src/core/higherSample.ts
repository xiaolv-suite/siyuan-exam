import { makeQuestion } from "./blockTemplate";
import type { Question } from "./types";

export const HIGHER_SAMPLE_BANK_NAME = "【示例】大学与考研硕博高等学术题库（高数/线代/考研政治/英语六级）";
export const HIGHER_SAMPLE_QUESTION_COUNT = 8;

/** 大学与硕博高阶学术研学示范题库（涵盖高等数学、线性代数、考研政治与学术英语） */
export function higherSampleQuestions(): Question[] {
  const seeds: Parameters<typeof makeQuestion>[0][] = [
    // ---------- 高等数学与微积分 ----------
    {
      type: "single",
      stem: "【大学高数 · 微积分基础】根据微积分基本定理（牛顿-莱布尼茨公式），若 f(x) 在 [a, b] 上连续，且 F(x) 是 f(x) 的一个原函数，则定积分 ∫[a, b] f(x)dx 等于？",
      options: [
        "F(b) - F(a)",
        "F(a) - F(b)",
        "F'(b) - F'(a)",
        "f(b) - f(a)",
      ],
      answer: "A",
      kp: "大学高等数学/定积分/微积分基本定理",
      analysis: "牛顿-莱布尼茨公式（Newton-Leibniz Formula）表达为：∫[a, b] f(x)dx = F(b) - F(a)，建立了微分与积分之间的桥梁。",
    },
    {
      type: "fill",
      stem: "【大学高数 · 极值判别】设函数 f(x) 在点 x0 处二阶可导，且 f'(x0) = 0。若 f''(x0) > 0，则函数 f(x) 在点 x0 处取得____值（填“极小”或“极大”）。",
      answer: "极小",
      alt: ["极小值"],
      kp: "大学高等数学/导数应用/函数极值判定",
      analysis: "根据二阶导数极值判定法：当驻点处二阶导数 f''(x0) > 0 时，函数图像局部呈凹形，取极小值；若 f''(x0) < 0 则取极大值。",
    },

    // ---------- 线性代数 ----------
    {
      type: "single",
      stem: "【线性代数 · 矩阵理论】设 A 为 n 阶方阵，下列哪一项与“方阵 A 是可逆矩阵”等价？",
      options: [
        "行列式 det(A) ≠ 0",
        "行列式 det(A) = 0",
        "A 的秩 rank(A) < n",
        "齐次线性方程组 Ax = 0 存在非零解",
      ],
      answer: "A",
      kp: "线性代数/矩阵与方程组/可逆矩阵的等价条件",
      analysis: "n 阶方阵 A 可逆的充分必要条件包括：det(A) ≠ 0、rank(A) = n、A 的列（行）向量组线性无关、Ax = 0 仅有零解等。",
    },
    {
      type: "judge",
      stem: "【线性代数 · 向量空间】若向量组 α1, α2, ..., αm 线性相关，则其中至少有一个向量可以由其余 m-1 个向量线性表出。",
      answer: "对",
      kp: "线性代数/向量组/线性相关性",
      analysis: "这是线性相关性的核心充要条件：向量组线性相关 ⇔ 至少有一个向量是其余向量的线性组合。",
    },

    // ---------- 考研政治（马克思主义基本原理）----------
    {
      type: "single",
      stem: "【考研政治 · 马克思主义哲学】在唯物辩证法的科学体系中，揭示事物联系的普遍性和发展的动力与源泉的根本规律，被视为唯物辩证法的实质和核心的是？",
      options: [
        "对立统一规律",
        "质量互变规律",
        "否定之否定规律",
        "世界物质统一性原理",
      ],
      answer: "A",
      kp: "考研思想政治/马哲/唯物辩证法三大规律",
      analysis: "对立统一规律是唯物辩证法的实质和核心。它揭示了普遍联系的根本内容和永恒发展的内在动力，是贯穿质量互变规律和否定之否定规律的中心线索。",
    },
    {
      type: "short",
      stem: "【考研政治 · 论述】简述认识发展过程中的“两次飞跃”分别是指什么？",
      answer: "第一次飞跃是从感性认识到理性认识的飞跃；第二次飞跃是从理性认识到实践的飞跃，其中第二次飞跃意义更为重大。",
      kp: "考研思想政治/认识论/认识的两次飞跃",
      analysis: "第一次飞跃使认识由现象深入到本质；第二次飞跃不仅检验和发展了真理，更实现了改造世界的根本目的。",
    },

    // ---------- 大学英语六级 & 考研英语 ----------
    {
      type: "single",
      stem: "【学术英语 · 连接词辨析】In scientific literature, which transitional phrase is best suited to introduce an inevitable logical consequence that directly stems from proven premises?",
      options: [
        "Consequently",
        "On the contrary",
        "Admittedly",
        "By contrast",
      ],
      answer: "A",
      kp: "大学英语CET/学术写作/逻辑衔接与因果论述",
      analysis: "'Consequently' (as a result / therefore) introduces a direct, inevitable logical deduction. 'On the contrary' introduces negation, while 'Admittedly' concedes a counterpoint.",
      studyMeta: {
        lang: "en-US",
        phonetic: "/ˈkɑːnsəkwentli/",
      },
    },
    {
      type: "judge",
      stem: "【大学英语 · 语法结构】In English formal grammar, when a negative adverbial like 'Hardly' or 'Seldom' is placed at the very beginning of a sentence, the subject and auxiliary verb must undergo partial inversion.",
      answer: "对",
      kp: "英语语法/句式精讲/否定词前置倒装",
      analysis: "When negative or restrictive adverbs (hardly, scarcely, seldom, rarely) head a clause, subject-auxiliary inversion is mandatory (e.g., 'Seldom have we witnessed such breakthroughs.').",
      studyMeta: {
        lang: "en-US",
        phonetic: "[grammar rule]",
      },
    },
  ];

  return seeds.map((seed) => ({
    ...makeQuestion({ ...seed, source: "小驴考试大学与考研示范（高数/线代/考研）", difficulty: 3 }),
    sourceKind: "real",
  }));
}

export const HIGHER_SAMPLE_BANK_INTRO = `# 【示例】大学与考研硕博高等学术题库（高数/线代/考研政治/英语六级）

> 本题库共 ${HIGHER_SAMPLE_QUESTION_COUNT} 题，涵盖高等数学微积分基本定理与极值、线性代数可逆矩阵与线性相关性、考研马哲辩证法核心规律与大学学术英语逻辑，助力大学期末通关与考研硕博深造。
`;
