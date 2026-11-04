import { describe, it, expect } from "vitest";
import type { Question } from "../src/core/types";
import {
  questionToLvPackageCard,
  questionsToLvCardsPackage,
  marketplaceItemToLvCardsPackage,
  serializeLvCardsPackage,
  parseLvCardsPackage,
  lvPackageCardToQuestion,
  lvCardsPackageToQuestions,
  parseLvCardsJsonToQuestions,
  LVCARDS_FORMAT_VERSION,
} from "../src/core/lvcardsBridge";
import { DEFAULT_MARKETPLACE_CATALOG } from "../src/core/marketplace";

describe("小驴考试与小驴闪卡跨插件桥接器 (lvcardsBridge)", () => {
  const sampleQuestion: Question = {
    id: "q-math-101",
    type: "single",
    stem: "已知函数 $f(x) = \\sin x$，求其导数 $f'(x)$。",
    options: ["\\cos x", "-\\cos x", "\\sin x", "-\\sin x"],
    answer: "A",
    analysis: "由基本初等函数求导公式可知：$(\\sin x)' = \\cos x$。",
    expansion: "【秒杀技巧】奇变偶不变，符号看象限；三角函数导数轮转周期为 4。",
    difficulty: 3,
    score: 3,
    kp: "微积分/导数公式",
    secondaryKps: ["高中数学", "三角函数"],
    tags: ["考研数学", "课标基础"],
    origin: "manual",
    hash: "h-sample-101",
  };

  it("1. questionToLvPackageCard 正确将考试题目转为闪卡结构", () => {
    const card = questionToLvPackageCard(sampleQuestion);
    expect(card.id).toBe("q-math-101");
    expect(card.kind).toBe("qa");
    expect(card.question).toContain("A. \\cos x");
    expect(card.answer).toContain("**正确答案**：A");
    expect(card.answer).toContain("基本初等函数求导公式");
    expect(card.memo).toBe("【秒杀技巧】奇变偶不变，符号看象限；三角函数导数轮转周期为 4。");
    expect(card.tags).toContain("微积分");
    expect(card.tags).toContain("导数公式");
    expect(card.tags).toContain("考研数学");
    expect(card.tags).toContain("高中数学");
    expect(card.fsrsParams?.difficulty).toBe(6); // 3 * 2
    expect(card.markdown).toContain("## 题目");
    expect(card.markdown).toContain("## 答案");
    expect(card.markdown).toContain("思路拓展与秒杀技巧");
  });

  it("2. 推断卡片类型：代码题与挖空题自动映射为 code 与 cloze", () => {
    const codeQ: Question = {
      ...sampleQuestion,
      stem: "运行以下代码：\n```python\nprint(2 ** 3)\n```\n输出结果为？",
    };
    const clozeQ: Question = {
      ...sampleQuestion,
      type: "fill",
      stem: "中华人民共和国实行依法治国，建设社会主义==法治国家==。",
    };

    expect(questionToLvPackageCard(codeQ).kind).toBe("code");
    expect(questionToLvPackageCard(clozeQ).kind).toBe("cloze");
  });

  it("3. questionsToLvCardsPackage 组装规范合规的 lvcards.v1 卡包", () => {
    const pkg = questionsToLvCardsPackage(
      { id: "deck-math", name: "高等数学冲刺卡包", description: "核心定理与公式" },
      [sampleQuestion],
    );

    expect(pkg.format).toBe(LVCARDS_FORMAT_VERSION);
    expect(pkg.version).toBe(1);
    expect(pkg.deck.name).toBe("高等数学冲刺卡包");
    expect(pkg.cards.length).toBe(1);
    expect(pkg.metadata?.cardCount).toBe(1);
    expect(pkg.metadata?.tags?.length).toBeGreaterThan(0);
  });

  it("4. marketplaceItemToLvCardsPackage 将集市资源无缝导出为闪卡包", () => {
    const mathItem = DEFAULT_MARKETPLACE_CATALOG.items.find((i) => i.id === "math-highschool-theorems")!;
    expect(mathItem).toBeDefined();

    const pkg = marketplaceItemToLvCardsPackage(mathItem);
    expect(pkg.format).toBe("lvcards.v1");
    expect(pkg.deck.name).toBe(mathItem.title);
    expect(pkg.cards.length).toBe(mathItem.embeddedQuestions!.length);
    expect(pkg.cards[0].question).toContain(mathItem.embeddedQuestions![0].stem);
  });

  it("5. serializeLvCardsPackage 与 parseLvCardsPackage 双向无损往返", () => {
    const pkg = questionsToLvCardsPackage(
      { id: "deck-test", name: "测试卡包" },
      [sampleQuestion],
    );

    const json = serializeLvCardsPackage(pkg);
    expect(typeof json).toBe("string");

    const parsed = parseLvCardsPackage(json);
    expect(parsed.valid).toBe(true);
    expect(parsed.package).toBeDefined();
    expect(parsed.package?.deck.name).toBe("测试卡包");
    expect(parsed.package?.cards.length).toBe(1);
    expect(parsed.package?.cards[0].id).toBe("q-math-101");
  });

  it("6. parseLvCardsPackage 严格拦截非法与不兼容格式", () => {
    expect(parseLvCardsPackage("not a json").valid).toBe(false);
    expect(parseLvCardsPackage(JSON.stringify({ format: "anki.v2" })).valid).toBe(false);
    expect(parseLvCardsPackage(JSON.stringify({ format: "lvcards.v1" })).valid).toBe(false);
    expect(parseLvCardsPackage(JSON.stringify({ format: "lvcards.v1", deck: { name: "无卡" }, cards: "not-array" })).valid).toBe(false);
  });

  it("7. lvPackageCardToQuestion 与 lvCardsPackageToQuestions 逆向保真还原为试题", () => {
    const card = questionToLvPackageCard(sampleQuestion);
    const restored = lvPackageCardToQuestion(card, "考研数学基础");

    expect(restored.id).toBe("q-math-101");
    expect(restored.type).toBe("single");
    expect(restored.stem).toBe(sampleQuestion.stem);
    expect(restored.options).toEqual(sampleQuestion.options);
    expect(restored.answer).toBe("A");
    expect(restored.analysis).toContain("基本初等函数求导公式");
    expect(restored.expansion).toContain("奇变偶不变");
    expect(restored.tags).toContain("微积分");
    expect(restored.tags).toContain("考研数学");

    const pkg = questionsToLvCardsPackage({ id: "deck-1", name: "微积分精选" }, [sampleQuestion]);
    const qs = lvCardsPackageToQuestions(pkg);
    expect(qs.length).toBe(1);
    expect(qs[0].stem).toBe(sampleQuestion.stem);
  });

  it("8. parseLvCardsJsonToQuestions 支持直接将 .lvcards 分享包文本还原为试题列表", () => {
    const pkg = questionsToLvCardsPackage(
      { id: "deck-cs", name: "计算机网络精要" },
      [sampleQuestion],
    );
    const json = serializeLvCardsPackage(pkg);
    const res = parseLvCardsJsonToQuestions(json);

    expect(res.valid).toBe(true);
    expect(res.count).toBe(1);
    expect(res.deckName).toBe("计算机网络精要");
    expect(res.questions[0].stem).toBe(sampleQuestion.stem);
    expect(res.questions[0].type).toBe("single");
  });
});

