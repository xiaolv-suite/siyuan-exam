import { makeQuestion } from "./blockTemplate";
import type { Question } from "./types";

export const ENGLISH_SAMPLE_BANK_NAME = "【示例】英语研学核心词汇与口语题库";
export const ENGLISH_SAMPLE_QUESTION_COUNT = 6;

/** 英语核心研学示范题库（带标准 IPA 国际音标、en-US 语音朗读与语境例句） */
export function englishSampleQuestions(): Question[] {
  const seeds: Parameters<typeof makeQuestion>[0][] = [
    {
      type: "single",
      stem: "In academic reading, what is the best definition for the word 'ubiquitous'?",
      options: [
        "Present, appearing, or found everywhere",
        "Extremely dangerous and harmful",
        "Rare and difficult to detect",
        "Temporary and fleeting in nature",
      ],
      answer: "A",
      kp: "雅思学术词汇/高频形容词",
      analysis: "'Ubiquitous' (/juːˈbɪkwɪtəs/) means present, appearing, or found everywhere. Example: 'Smartphones have become ubiquitous in daily life.'",
      studyMeta: {
        lang: "en-US",
        phonetic: "/juːˈbɪkwɪtəs/",
      },
    },
    {
      type: "single",
      stem: "Which of the following phrases is most commonly used in colloquial English to wish someone good luck before a stage performance?",
      options: [
        "Break a leg",
        "Hit the sack",
        "Bite the bullet",
        "Under the weather",
      ],
      answer: "A",
      kp: "日常口语/地道俚语习语",
      analysis: "'Break a leg' is a well-known theatrical idiom used to wish performers good luck, rooted in the superstition that saying 'good luck' brings bad luck.",
      studyMeta: {
        lang: "en-US",
        phonetic: "[idiom]",
      },
    },
    {
      type: "fill",
      stem: "The adjective 'meticulous' (/məˈtɪkjələs/) refers to showing great attention to detail. Its closest synonym starting with 'p' is ____ (such as precise / punctilious).",
      answer: "precise",
      alt: ["punctilious", "painstaking"],
      kp: "GRE/考研英语/同义词精辨",
      analysis: "'Meticulous' implies extreme care and excessive precision. 'Precise' and 'painstaking' are close synonyms in academic context.",
      studyMeta: {
        lang: "en-US",
        phonetic: "/məˈtɪkjələs/",
      },
    },
    {
      type: "judge",
      stem: "In formal writing, the word 'alleviate' (/əˈliːvieɪt/) means to make a problem, pain, or suffering more severe.",
      answer: "错",
      kp: "四六级重点词汇/反义辨析",
      analysis: "'Alleviate' actually means to lessen, relieve, or make pain and suffering less severe, not more severe. The antonym is 'aggravate' or 'exacerbate'.",
      studyMeta: {
        lang: "en-US",
        phonetic: "/əˈliːvieɪt/",
      },
    },
    {
      type: "single",
      stem: "When participating in a business meeting, which sentence is the most polite and professional way to express disagreement?",
      options: [
        "I see your point, but have we considered the alternative budget impact?",
        "You are completely wrong about the budget proposal.",
        "That idea makes no sense at all.",
        "I refuse to listen to your reasoning.",
      ],
      answer: "A",
      kp: "商务职场英语/礼貌沟通与谈判",
      analysis: "In international business etiquette, softening disagreement with phrases like 'I see your point, but...' maintains constructive rapport.",
      studyMeta: {
        lang: "en-US",
        phonetic: "[spoken discourse]",
      },
    },
    {
      type: "fill",
      stem: "Complete the collocation: 'take something for ____' (/ɡræntɪd/) means to fail to appreciate someone or something because you are so used to them.",
      answer: "granted",
      kp: "核心固定搭配/动介搭配",
      analysis: "'Take something for granted' is a high-frequency phrase meaning to assume something without question or fail to value it properly.",
      studyMeta: {
        lang: "en-US",
        phonetic: "/ɡræntɪd/",
      },
    },
  ];

  return seeds.map((seed) => ({
    ...makeQuestion({ ...seed, source: "小驴考试多语言示例（大学与雅思英语）", difficulty: 2 }),
    sourceKind: "real",
  }));
}

export const ENGLISH_SAMPLE_BANK_INTRO = `# 【示例】英语研学核心词汇与口语题库

> 本题库共 ${ENGLISH_SAMPLE_QUESTION_COUNT} 题，覆盖雅思核心词汇、国际音标、日常高频俚语、商务职场沟通与语法搭配，支持 en-US 真实发音朗读。
`;
