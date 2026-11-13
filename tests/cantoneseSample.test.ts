import { describe, it, expect } from "vitest";
import {
  cantoneseSampleQuestions,
  CANTONESE_SAMPLE_BANK_NAME,
  CANTONESE_SAMPLE_QUESTION_COUNT,
  CANTONESE_SAMPLE_BANK_INTRO,
} from "../src/core/cantoneseSample";

describe("粤语日常实用研学示范题库 (cantoneseSample)", () => {
  it("导出的题目数量与常量配置一致", () => {
    const qs = cantoneseSampleQuestions();
    expect(qs).toHaveLength(CANTONESE_SAMPLE_QUESTION_COUNT);
    expect(CANTONESE_SAMPLE_BANK_NAME).toContain("粤语");
    expect(CANTONESE_SAMPLE_BANK_INTRO).toContain("Jyutping");
  });

  it("题目完整携带 studyMeta 元数据（lang 为 zh-HK，含注音/粤拼）", () => {
    const qs = cantoneseSampleQuestions();
    for (const q of qs) {
      expect(q.studyMeta).toBeDefined();
      expect(q.studyMeta?.lang).toBe("zh-HK");
      expect(q.studyMeta?.phonetic).toBeDefined();
      expect(q.studyMeta?.phonetic?.length).toBeGreaterThan(0);
    }
  });

  it("包含问候、茶楼、语法、粤拼填空与判断题型", () => {
    const qs = cantoneseSampleQuestions();
    const types = new Set(qs.map((q) => q.type));
    expect(types.has("single")).toBe(true);
    expect(types.has("fill")).toBe(true);
    expect(types.has("judge")).toBe(true);

    const fillQ = qs.find((q) => q.type === "fill");
    expect(fillQ?.answer).toBe("dim2 gaai2");
    expect(fillQ?.alt).toContain("dim2gaai2");
  });
});
