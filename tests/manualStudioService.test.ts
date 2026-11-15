import { describe, it, expect, vi } from "vitest";
import {
  buildNumericAnswerSpec,
  buildAuthorRubricSpec,
  locateManualErrorField,
  updateCorrectOptionIndex,
  saveManualQuestion,
  processAndSaveManualQuestion,
  parseOcrTextToForm,
  normalizeDraftFormulas,
  shouldConfirmTypeSwitch,
  getCleanStateOnTypeSwitch,
  saveManualDraftAux,
  loadManualDraftAux,
  clearManualDraftAux,
  createBlankManualFormState,
  createManualDraftSnapshot,
  assembleManualFormData,
  executeSwitchManualTypeWithConfirm,
} from "@/ui/practice/services/manualStudioService";
import type { ExamApp } from "@/app";
import type { Question } from "@/core/types";

describe("手工录题与规格校验服务 (manualStudioService)", () => {
  it("1. buildNumericAnswerSpec：解析绝对容差、相对误差与单位规格", () => {
    // 1. 全空 -> undefined
    expect(buildNumericAnswerSpec({})).toBeUndefined();

    // 2. 有效配置
    const spec = buildNumericAnswerSpec({
      absTol: "0.05",
      relPct: "5",
      unit: "kg",
      altUnits: "g; 千克",
    });
    expect(spec).not.toBeUndefined();
    expect(spec?.absTol).toBe(0.05);
    expect(spec?.relTolerance).toBe(0.05);
    expect(spec?.unit).toBe("kg");
    expect(spec?.altUnits).toHaveLength(2);
  });

  it("2. buildAuthorRubricSpec：主观题量规规格解析与格式校验", () => {
    // 1. 空文本
    expect(buildAuthorRubricSpec("")).toEqual({});

    // 2. 有效采分点
    const rubricText = "1. 准确阐述基本概念 (2分)\n2. 逻辑论证完整 (3分)";
    const res = buildAuthorRubricSpec(rubricText);
    expect(res.error).toBeUndefined();
    expect(res.rubric?.criteria.length).toBeGreaterThanOrEqual(1);

    // 3. 无效格式
    const badRes = buildAuthorRubricSpec("这是没有任何采分点格式的纯文本");
    expect(badRes.error).toBeDefined();
  });

  it("3. locateManualErrorField 与 updateCorrectOptionIndex：错误字段定位与选项切换", () => {
    const fakeQ = { type: "single" } as Question;

    // 错误定位
    expect(locateManualErrorField(fakeQ, "题干不能为空", [])).toBe("stem");
    expect(locateManualErrorField(fakeQ, "存在空选项", ["A", ""])).toBe("option-1");
    expect(locateManualErrorField(fakeQ, "选项内容重复", ["A", "A"])).toBe("option-1");
    expect(locateManualErrorField(fakeQ, "答案越界", ["A", "B"])).toBe("answer");

    // 单选切换
    expect(updateCorrectOptionIndex("", 0, false)).toBe("A");
    expect(updateCorrectOptionIndex("A", 1, false)).toBe("B");

    // 多选切换（累加与反选剔除）
    expect(updateCorrectOptionIndex("", 0, true)).toBe("A");
    expect(updateCorrectOptionIndex("A", 1, true)).toBe("AB");
    expect(updateCorrectOptionIndex("AB", 0, true)).toBe("B");
  });

  it("4. saveManualQuestion：组装题目对象并持久化入库", async () => {
    let writtenQuestion: Question | null = null;
    const mockApp = {
      writeManualQuestion: vi.fn().mockImplementation((_b, q) => {
        writtenQuestion = q;
        return Promise.resolve();
      }),
    } as unknown as ExamApp;

    const saved = await saveManualQuestion(mockApp, "bank-1", {
      type: "single",
      stem: "手录单选题干",
      options: ["选项1", "选项2"],
      answer: "A",
      analysis: "手录解析",
      kp: "数学/代数",
      source: "原创试题",
      status: "published",
    });

    expect(mockApp.writeManualQuestion).toHaveBeenCalledWith("bank-1", expect.any(Object));
    expect(saved.stem).toBe("手录单选题干");
    expect(saved.options).toEqual(["选项1", "选项2"]);
    expect(saved.status).toBe("published");
    expect(writtenQuestion).not.toBeNull();
  });

  it("5. parseOcrTextToForm：OCR 文本结构化映射为表单数据", () => {
    const ocrSample = `
下列属于一次函数的是？
A. y = 2x + 1
B. y = x^2
答案：A
解析：一次函数最高次数为 1。
考点：函数/一次函数
`;
    const form = parseOcrTextToForm(ocrSample);
    expect(form.type).toBe("single");
    expect(form.stem).toContain("一次函数");
    expect(form.options).toEqual(["y = 2x + 1", "y = x^2"]);
    expect(form.answer).toBe("A");
    expect(form.analysis).toContain("最高次数为 1");
    expect(form.kp).toBe("函数/一次函数");
  });

  it("6. processAndSaveManualQuestion：校验守卫、错误定位与成功持久化", async () => {
    let savedQuestion: Question | null = null;
    const mockApp = {
      writeManualQuestion: vi.fn().mockImplementation((_b, q) => {
        savedQuestion = q;
        return Promise.resolve();
      }),
    } as unknown as ExamApp;

    // 1. 成功保存 published 题目
    const okRes = await processAndSaveManualQuestion(mockApp, "bank-1", {
      type: "single",
      stem: "若 x=1，则 2x 等于多少？",
      options: ["A. 1", "B. 2"],
      answer: "B",
      analysis: "2*1=2",
      kp: "代数",
      source: "模拟试题",
      status: "published",
    });
    expect(okRes.success).toBe(true);
    expect(okRes.question?.id).toBeDefined();
    expect(savedQuestion).not.toBeNull();

    // 2. 拦截发布守卫错误（如发布态下选项缺失）
    const failRes = await processAndSaveManualQuestion(mockApp, "bank-1", {
      type: "single",
      stem: "无效单选题",
      options: ["仅一个选项"],
      answer: "A",
      analysis: "",
      kp: "",
      source: "",
      status: "published",
    });
    expect(failRes.success).toBe(false);
    expect(failRes.errorMsg).toBeDefined();
    expect(failRes.errorField).toBeDefined();

    // 3. 保存多空无序判分与辅助考点不丢失
    const fillRes = await processAndSaveManualQuestion(mockApp, "bank-1", {
      type: "fill",
      stem: "两座城市：____ 与 ____",
      options: [],
      answer: "北京;;上海",
      analysis: "",
      kp: "地理",
      secondaryKps: ["常识/城市", "历史"],
      orderIndependent: true,
      source: "真题",
      status: "published",
    });
    expect(fillRes.success).toBe(true);
    expect(fillRes.question?.secondaryKps).toEqual(["常识/城市", "历史"]);
    expect(fillRes.question?.answerSpec?.kind).toBe("multiBlank");
    if (fillRes.question?.answerSpec?.kind === "multiBlank") {
      expect(fillRes.question.answerSpec.orderIndependent).toBe(true);
    }
  });

  it("7. normalizeDraftFormulas：清洗题干与选项 LaTeX 公式", () => {
    const raw = normalizeDraftFormulas(
      "已知 $a = 1$，求 $b$",
      ["$x \\le 2$", "常数项"],
      "$\\alpha + \\beta$",
    );
    expect(raw.stem).toBe("已知 $a = 1$，求 $b$");
    expect(raw.options[0]).toContain("le");
    expect(raw.analysis).toContain("alpha");
  });

  it("8. shouldConfirmTypeSwitch 与 getCleanStateOnTypeSwitch：题型切换守卫与状态初始化", () => {
    // 空内容不弹窗
    expect(shouldConfirmTypeSwitch("", ["", ""], "", "")).toBe(false);
    // 有题干或选项时提示确认
    expect(shouldConfirmTypeSwitch("题干已填", ["", ""], "", "")).toBe(true);
    expect(shouldConfirmTypeSwitch("", ["选项A已填"], "", "")).toBe(true);

    // 切到单选/多选初始化两项空选项
    const singleState = getCleanStateOnTypeSwitch("single");
    expect(singleState.options).toEqual(["", ""]);
    expect(singleState.specOpen).toBe(false);

    // 切到判断题选项为空
    const judgeState = getCleanStateOnTypeSwitch("judge");
    expect(judgeState.options).toEqual([]);
  });

  it("9. saveManualDraftAux, loadManualDraftAux 与 clearManualDraftAux：草稿持久化操作", async () => {
    let storedVal: any = null;
    const mockApp = {
      saveAux: vi.fn().mockImplementation((_k, val) => {
        storedVal = val;
        return Promise.resolve();
      }),
      loadAux: vi.fn().mockImplementation(() => Promise.resolve(storedVal)),
    } as unknown as ExamApp;

    await saveManualDraftAux(mockApp, { stem: "草稿题干" });
    expect(storedVal).toEqual({ stem: "草稿题干" });

    const loaded = await loadManualDraftAux(mockApp);
    expect(loaded).toEqual({ stem: "草稿题干" });

    await clearManualDraftAux(mockApp);
    expect(storedVal).toBeNull();
  });

  it("10. createBlankManualFormState 与 createManualDraftSnapshot：录题表单初始态与草稿快照组装", () => {
    const blank = createBlankManualFormState();
    expect(blank.type).toBe("single");
    expect(blank.stem).toBe("");
    expect(blank.options).toEqual(["", ""]);
    expect(blank.status).toBe("published");
    expect(blank.rubricRevision).toBe(1);

    const snap = createManualDraftSnapshot({
      type: "fill",
      stem: "待填空题干",
      specOpen: true,
      specUnit: "米",
    });
    expect(snap.type).toBe("fill");
    expect(snap.stem).toBe("待填空题干");
    expect(snap.specOpen).toBe(true);
    expect(snap.specUnit).toBe("米");
    expect(snap.savedAt).toBeTypeOf("number");
  });

  it("11. assembleManualFormData：表单字段聚合与规格构造", () => {
    const rawState = {
      type: "fill" as const,
      stem: "圆周率约等于",
      options: [],
      answer: "3.14",
      analysis: "几何常数",
      kp: "数学/几何",
      source: "教材",
      group: " 常识组 ",
      status: "draft" as const,
      specOpen: true,
      specUnit: "",
      specAbsTol: "0.01",
      specRelPct: "",
      specAltUnits: "",
      secondaryKps: "平面几何, 导数, 极限",
      orderIndependent: true,
      rubricOpen: false,
      rubricText: "",
      studyLang: "zh-CN",
      studyPhonetic: "",
    };

    const res = assembleManualFormData(rawState, "published");
    expect(res.type).toBe("fill");
    expect(res.status).toBe("published");
    expect(res.group).toBe("常识组");
    expect(res.numericSpec?.absTol).toBe("0.01");
    expect(res.secondaryKps).toEqual(["平面几何", "导数", "极限"]);
    expect(res.orderIndependent).toBe(true);
  });

  it("12. executeSwitchManualTypeWithConfirm：弹窗确认与干净状态流转", async () => {
    const t = (k: string) => `[${k}]`;
    const confirmFn = vi.fn().mockResolvedValue(true);

    // 1. 同类型不切换
    const sameRes = await executeSwitchManualTypeWithConfirm({
      currentType: "single",
      nextType: "single",
      stem: "题干",
      options: ["A"],
      answer: "A",
      analysis: "",
      confirmDialogSync: confirmFn,
      t,
    });
    expect(sameRes.confirmed).toBe(false);

    // 2. 跨类型切换且确认
    const okRes = await executeSwitchManualTypeWithConfirm({
      currentType: "single",
      nextType: "fill",
      stem: "有内容的题干",
      options: ["A", "B"],
      answer: "A",
      analysis: "解析",
      confirmDialogSync: confirmFn,
      t,
    });
    expect(okRes.confirmed).toBe(true);
    expect(okRes.cleanState?.options).toEqual([]);
    expect(confirmFn).toHaveBeenCalled();
  });
});
