import { makeQuestion } from "./blockTemplate";
import type { Question } from "./types";

export const CANTONESE_SAMPLE_BANK_NAME = "【示例】粤语日常实用研学题库";
export const CANTONESE_SAMPLE_QUESTION_COUNT = 5;

/** 粤语泛语言学习原创示范题库（带标准 Jyutping 粤拼与 zh-HK 发音元数据） */
export function cantoneseSampleQuestions(): Question[] {
  const seeds: Parameters<typeof makeQuestion>[0][] = [
    {
      type: "single",
      stem: "粤语日常用语中，表达“劳驾、对不起、多谢帮忙”的通用高频词是？",
      options: ["唔该", "得闲", "埋单", "点解"],
      answer: "A",
      kp: "日常会话/礼貌用语",
      analysis: "在粤语中，“唔该 (m4 goi1)”多用于麻烦别人、请人让路或接受小型日常帮助时的道谢；“多谢”则用于接受正式礼物或大恩惠。",
      studyMeta: {
        lang: "zh-HK",
        phonetic: "m4 goi1",
      },
    },
    {
      type: "single",
      stem: "在广式茶楼喝早茶结账买单时，最地道的粤语表述是？",
      options: ["查账", "找数", "埋单", "清零"],
      answer: "C",
      kp: "日常会话/餐饮文化",
      analysis: "“埋单 (maai4 daan1)”是广府茶楼最具代表性的词汇，现已被全国广泛吸收使用。",
      studyMeta: {
        lang: "zh-HK",
        phonetic: "maai4 daan1",
      },
    },
    {
      type: "single",
      stem: "普通话表达“你先走吧”，在粤语中的地道倒装句式是？",
      options: ["你先走", "你行先", "你走早", "先行你"],
      answer: "B",
      kp: "语法结构/状语后置",
      analysis: "粤语副词后置十分常见，“行先 (haang4 sin1)”即“先走”；再如“食多啲 (多吃点)”。",
      studyMeta: {
        lang: "zh-HK",
        phonetic: "nei5 haang4 sin1",
      },
    },
    {
      type: "fill",
      stem: "粤语词汇“点解”在普通话中相当于“为什么”，它的标准粤拼声调写法是____（如 dim2 gaai2）。",
      answer: "dim2 gaai2",
      alt: ["dim2gaai2", "dim gaai"],
      kp: "粤拼认读/常用疑问词",
      analysis: "“点解 (dim2 gaai2)”是极高频的疑问词，相当于普通话的“为什么/怎么搞的”。",
      studyMeta: {
        lang: "zh-HK",
        phonetic: "dim2 gaai2",
      },
    },
    {
      type: "judge",
      stem: "粤语中的“得闲饮茶”，除了字面意思外，常作为朋友告别时的温暖客套话，不一定代表马上要约喝茶。",
      answer: "对",
      kp: "社交文化/俚语惯用",
      analysis: "“得闲饮茶 (dak1 haan4 jam2 caa4)”类似于普通话的“改天聚聚”，是一种温暖友好的告别客套用语。",
      studyMeta: {
        lang: "zh-HK",
        phonetic: "dak1 haan4 jam2 caa4",
      },
    },
  ];

  return seeds.map((seed) => ({
    ...makeQuestion({ ...seed, source: "小驴考试内置语言示例（粤语口语）", difficulty: 1 }),
    sourceKind: "real",
  }));
}

export const CANTONESE_SAMPLE_BANK_INTRO = `# 【示例】粤语日常实用研学题库

> 本题库共 ${CANTONESE_SAMPLE_QUESTION_COUNT} 题，覆盖粤语礼貌问候、茶楼文化、地道语法、粤拼认读与社交惯用语。
> 配套正宗粤语朗读 (zh-HK) 与 Jyutping 标准注音，展示小驴考试从狭义备考向广义终身研学的进化能力。
`;
