import type { Question, QuestionType, QuestionLifecycleStatus } from "@/core/types";
import type { ExamApp } from "@/app";
import type { NumericAnswerSpec } from "@/core/structuredAnswer";
import { parseRubricFromText, validateRubric, type RubricSpec } from "@/core/rubric";
import { makeQuestion } from "@/core/blockTemplate";
import { parseOcrQuestionText } from "@/core/ocr";
import { normalizeLatexFormula } from "@/core/math";

export const MANUAL_DRAFT_KEY = "draft/manual";

export interface NumericSpecParams {
  unit?: string;
  absTol?: string;
  relPct?: string;
  altUnits?: string;
}

/**
 * 构造数值填空题的容差与单位规格规范（54-02）
 */
export function buildNumericAnswerSpec(params: NumericSpecParams): NumericAnswerSpec | undefined {
  const abs = parseFloat(params.absTol ?? "");
  const rel = parseFloat(params.relPct ?? "") / 100;
  const unit = (params.unit ?? "").trim();
  const alts = (params.altUnits ?? "").split(/[，,;；]/).map((x) => x.trim()).filter(Boolean);
  if (!Number.isFinite(abs) && !Number.isFinite(rel) && !unit && !alts.length) return undefined;

  const spec: NumericAnswerSpec = { v: 1, kind: "numeric" };
  if (Number.isFinite(abs) && abs > 0) spec.absTol = abs;
  if (Number.isFinite(rel) && rel > 0) spec.relTolerance = rel;
  if (unit) spec.unit = unit;
  if (alts.length > 0) {
    spec.altUnits = alts.map((u) => ({ unit: u, factor: 1 }));
  }
  return spec;
}

/**
 * 校验并解析作者简答题采分点量规（55-05）
 */
export function buildAuthorRubricSpec(
  rubricText: string,
  revision = 0,
): { rubric?: RubricSpec; error?: string } {
  if (!rubricText || !rubricText.trim()) return {};
  const parsed = parseRubricFromText(rubricText, 0, revision);
  if (parsed === null) {
    return { error: "采分点量规格式解析失败，请检查采分点行格式" };
  }
  const issues = validateRubric(parsed);
  const blocking = issues.filter((x) => !x.includes("满分必须为正数"));
  if (blocking.length > 0) {
    return { error: blocking.join("；") };
  }
  return { rubric: parsed };
}

/**
 * 根据保存校验错误信息定位对应的表单字段
 */
export function locateManualErrorField(q: Question, message: string, options: string[]): string {
  if (message.includes("题干")) return "stem";
  if (message.includes("空选项")) {
    const emptyIndex = options.findIndex((opt) => !opt.trim());
    return `option-${Math.max(0, emptyIndex)}`;
  }
  if (message.includes("选项内容重复")) {
    const duplicateIndex = options.findIndex((opt, idx) => options.findIndex((other) => other.trim() === opt.trim()) !== idx);
    return `option-${Math.max(0, duplicateIndex)}`;
  }
  if (message.includes("答案") || message.includes("越界")) return "answer";
  if (message.includes("选项")) return "option-0";
  if (q.type === "single" || q.type === "multiple") return "answer";
  return "stem";
}

/**
 * 快捷设置或切换单选/多选答案选项
 */
export function updateCorrectOptionIndex(currentAnswer: string, index: number, isMultiple: boolean): string {
  const letter = String.fromCharCode(65 + index);
  if (!isMultiple) return letter;
  return currentAnswer.includes(letter)
    ? currentAnswer.replace(letter, "")
    : (currentAnswer + letter).split("").sort().join("");
}

export interface ManualQuestionFormData {
  type: QuestionType;
  stem: string;
  options: string[];
  answer: string;
  analysis: string;
  expansion?: string;
  kp: string;
  secondaryKps?: string[];
  prerequisites?: string[];
  source: string;
  sourceBlockId?: string;
  group?: string;
  status: QuestionLifecycleStatus;
  numericSpec?: NumericSpecParams;
  orderIndependent?: boolean;
  rubricText?: string;
  studyLang?: string;
  studyPhonetic?: string;
  family?: Question["family"];
}

function resolveSourceBlockId(sourceBlockId?: string, sourceText?: string): string | undefined {
  if (sourceBlockId && /^[\w-]+$/.test(sourceBlockId.trim())) {
    return sourceBlockId.trim();
  }
  const match = String(sourceText ?? "").match(/\(\(\s*([\w-]+)/);
  if (match?.[1]) {
    return match[1].trim();
  }
  return undefined;
}

/**
 * 组装并保存手工录入的题目到题库
 */
export async function saveManualQuestion(
  app: ExamApp,
  bankId: string,
  data: ManualQuestionFormData,
): Promise<Question> {
  let answerSpec: NumericAnswerSpec | undefined;
  if (data.type === "fill" && data.numericSpec) {
    answerSpec = buildNumericAnswerSpec(data.numericSpec);
  }

  let rubric: RubricSpec | undefined;
  if (data.type === "short" && data.rubricText?.trim()) {
    const res = buildAuthorRubricSpec(data.rubricText);
    if (res.error) throw new Error(res.error);
    rubric = res.rubric;
  }

  const resolvedSourceBlock = resolveSourceBlockId(data.sourceBlockId, data.source);
  const q = makeQuestion({
    type: data.type,
    stem: data.stem,
    options: data.type === "single" || data.type === "multiple" ? data.options.map((o) => o.trim()) : [],
    answer: data.answer,
    analysis: data.analysis,
    expansion: data.expansion?.trim() || undefined,
    kp: data.kp,
    source: data.source,
    ...(resolvedSourceBlock ? { sourceBlockId: resolvedSourceBlock } : {}),
    group: data.group?.trim() || undefined,
    status: data.status,
    ...(answerSpec ? { answerSpec } : {}),
    ...(rubric ? { rubric } : {}),
    ...(data.studyPhonetic?.trim() || (data.studyLang && data.studyLang !== "zh-CN")
      ? { studyMeta: { lang: data.studyLang || "zh-CN", phonetic: data.studyPhonetic?.trim() || undefined } }
      : {}),
  });

  if (data.secondaryKps && data.secondaryKps.length > 0) {
    q.secondaryKps = data.secondaryKps;
  }
  if (data.prerequisites && data.prerequisites.length > 0) {
    q.prerequisites = data.prerequisites;
  }
  if (data.family) {
    q.family = data.family;
  }
  if (data.type === "fill" && data.orderIndependent && q.answerSpec?.kind === "multiBlank") {
    q.answerSpec.orderIndependent = true;
  }

  await app.writeManualQuestion(bankId, q);
  return q;
}

export interface ProcessManualQuestionResult {
  success: boolean;
  question?: Question;
  errorMsg?: string;
  errorField?: string;
}

/**
 * 校验、发布守卫检查并保存手工录入的题目到题库
 */
export async function processAndSaveManualQuestion(
  app: ExamApp,
  bankId: string,
  data: ManualQuestionFormData,
  revision = 1,
): Promise<ProcessManualQuestionResult> {
  let rubric: RubricSpec | undefined;
  if (data.type === "short" && data.rubricText?.trim()) {
    const res = buildAuthorRubricSpec(data.rubricText, revision);
    if (res.error) {
      return { success: false, errorMsg: res.error, errorField: "rubric" };
    }
    rubric = res.rubric;
  }

  let answerSpec: NumericAnswerSpec | undefined;
  if (data.type === "fill" && data.numericSpec) {
    answerSpec = buildNumericAnswerSpec(data.numericSpec);
  }

  const resolvedSourceBlock = resolveSourceBlockId(data.sourceBlockId, data.source);
  const q = makeQuestion({
    type: data.type,
    stem: data.stem,
    options: data.type === "single" || data.type === "multiple" ? data.options.map((o) => o.trim()) : [],
    answer: data.answer,
    analysis: data.analysis,
    expansion: data.expansion?.trim() || undefined,
    kp: data.kp,
    source: data.source,
    ...(resolvedSourceBlock ? { sourceBlockId: resolvedSourceBlock } : {}),
    group: data.group?.trim() || undefined,
    status: data.status,
    ...(answerSpec ? { answerSpec } : {}),
    ...(rubric ? { rubric } : {}),
    ...(data.studyPhonetic?.trim() || (data.studyLang && data.studyLang !== "zh-CN")
      ? { studyMeta: { lang: data.studyLang || "zh-CN", phonetic: data.studyPhonetic?.trim() || undefined } }
      : {}),
  });

  if (data.secondaryKps && data.secondaryKps.length > 0) {
    q.secondaryKps = data.secondaryKps;
  }
  if (data.prerequisites && data.prerequisites.length > 0) {
    q.prerequisites = data.prerequisites;
  }
  if (data.family) {
    q.family = data.family;
  }
  if (data.type === "fill" && data.orderIndependent && q.answerSpec?.kind === "multiBlank") {
    q.answerSpec.orderIndependent = true;
  }

  if (data.status === "published") {
    const { checkPublishGuard } = await import("@/core/revision");
    const guard = checkPublishGuard(q);
    if (!guard.valid) {
      const errorMsg = guard.errors.join("；");
      const errorField = locateManualErrorField(q, guard.errors[0], data.options);
      return { success: false, errorMsg, errorField };
    }
  }

  await app.writeManualQuestion(bankId, q);
  return { success: true, question: q };
}

/** 批量归一化题干、选项与解析中的 LaTeX 公式语法 */
export function normalizeDraftFormulas(
  stem: string,
  options: string[],
  analysis: string,
): { stem: string; options: string[]; analysis: string } {
  return {
    stem: stem ? normalizeLatexFormula(stem) : "",
    options: options.map((o) => (o ? normalizeLatexFormula(o) : "")),
    analysis: analysis ? normalizeLatexFormula(analysis) : "",
  };
}

/** 切换题型时是否需要确认弹窗（有已填内容时防误触丢失） */
export function shouldConfirmTypeSwitch(
  stem: string,
  options: string[],
  answer: string,
  analysis: string,
): boolean {
  return Boolean(
    stem.trim() ||
      answer.trim() ||
      analysis.trim() ||
      options.some((opt) => opt.trim()),
  );
}

/** 切换题型时重置对应选项与填空规格 */
export function getCleanStateOnTypeSwitch(nextType: QuestionType): {
  answer: string;
  options: string[];
  specOpen: boolean;
  specUnit: string;
  specAbsTol: string;
  specRelPct: string;
  specAltUnits: string;
} {
  const isChoice = nextType === "single" || nextType === "multiple";

  return {
    answer: "",
    options: isChoice ? ["", ""] : [],
    specOpen: false,
    specUnit: "",
    specAbsTol: "",
    specRelPct: "",
    specAltUnits: "",
  };
}

/** 保存录题草稿 */
export async function saveManualDraftAux(app: ExamApp, snap: any): Promise<void> {
  if (!app) return;
  try {
    await app.saveAux(MANUAL_DRAFT_KEY, snap);
  } catch {
    // 容错静默
  }
}

/** 加载录题草稿 */
export async function loadManualDraftAux(app: ExamApp): Promise<any | null> {
  if (!app) return null;
  try {
    return await app.loadAux(MANUAL_DRAFT_KEY);
  } catch {
    return null;
  }
}

/** 清理录题草稿 */
export async function clearManualDraftAux(app: ExamApp): Promise<void> {
  if (!app) return;
  try {
    await app.saveAux(MANUAL_DRAFT_KEY, null);
  } catch {
    // 容错静默
  }
}



/**
 * 将 OCR 文本解析并转化为录题表单字段
 */
export function parseOcrTextToForm(text: string): {
  type: "single" | "multiple" | "judge" | "fill" | "short";
  stem: string;
  options: string[];
  answer: string;
  analysis?: string;
  kp?: string;
} {
  const parsed = parseOcrQuestionText(text);
  const safeType = parsed.type === "material" ? "single" : parsed.type;
  return {
    type: safeType,
    stem: parsed.stem,
    options: parsed.options.length >= 2 ? parsed.options : ["", ""],
    answer: parsed.answer,
    analysis: parsed.analysis,
    kp: parsed.kp,
  };
}

export interface BlankManualFormState {
  type: QuestionType;
  stem: string;
  options: string[];
  answer: string;
  analysis: string;
  expansion?: string;
  kp: string;
  secondaryKps?: string;
  prerequisites?: string;
  source: string;
  group: string;
  specOpen: boolean;
  specUnit: string;
  specAbsTol: string;
  specRelPct: string;
  specAltUnits: string;
  orderIndependent?: boolean;
  rubricOpen: boolean;
  rubricText: string;
  rubricRevision: number;
  studyLang: string;
  studyPhonetic: string;
  status: QuestionLifecycleStatus;
  family?: Question["family"];
  sourceBlockId?: string;
}

/**
 * 构造录题表单初始空白状态（用于重置或提交成功后清空）
 */
export function createBlankManualFormState(): BlankManualFormState {
  return {
    type: "single",
    stem: "",
    options: ["", ""],
    answer: "",
    analysis: "",
    expansion: "",
    kp: "",
    secondaryKps: "",
    prerequisites: "",
    source: "",
    group: "",
    specOpen: false,
    specUnit: "",
    specAbsTol: "",
    specRelPct: "",
    specAltUnits: "",
    orderIndependent: false,
    rubricOpen: false,
    rubricText: "",
    rubricRevision: 1,
    studyLang: "zh-CN",
    studyPhonetic: "",
    status: "published",
    family: undefined,
    sourceBlockId: "",
  };
}

/**
 * 构造录题草稿持久化快照
 */
export function createManualDraftSnapshot(state: Partial<BlankManualFormState>): any {
  return {
    type: state.type ?? "single",
    stem: state.stem ?? "",
    options: [...(state.options ?? [])],
    answer: state.answer ?? "",
    analysis: state.analysis ?? "",
    expansion: state.expansion ?? "",
    kp: state.kp ?? "",
    secondaryKps: state.secondaryKps ?? "",
    prerequisites: state.prerequisites ?? "",
    source: state.source ?? "",
    group: state.group ?? "",
    savedAt: Date.now(),
    specOpen: state.specOpen ?? false,
    specUnit: state.specUnit ?? "",
    specAbsTol: state.specAbsTol ?? "",
    specRelPct: state.specRelPct ?? "",
    specAltUnits: state.specAltUnits ?? "",
    orderIndependent: state.orderIndependent ?? false,
    rubricOpen: state.rubricOpen ?? false,
    rubricText: state.rubricText ?? "",
    studyLang: state.studyLang ?? "zh-CN",
    studyPhonetic: state.studyPhonetic ?? "",
    status: state.status ?? "published",
    ...(state.sourceBlockId ? { sourceBlockId: state.sourceBlockId } : {}),
    ...(state.family ? { family: state.family } : {}),
  };
}

/**
 * 将录题状态字段组装为标准提交对象 ManualQuestionFormData
 */
export function assembleManualFormData(
  state: {
    type: QuestionType;
    stem: string;
    options: string[];
    answer: string;
    analysis: string;
    expansion?: string;
    kp: string;
    secondaryKps?: string;
    prerequisites?: string;
    source: string;
    group: string;
    status: QuestionLifecycleStatus;
    specOpen: boolean;
    specUnit: string;
    specAbsTol: string;
    specRelPct: string;
    specAltUnits: string;
    orderIndependent?: boolean;
    rubricOpen: boolean;
    rubricText: string;
    studyLang: string;
    studyPhonetic: string;
    family?: Question["family"];
  },
  overrideStatus?: QuestionLifecycleStatus,
): ManualQuestionFormData {
  const secondaryKpsList = state.secondaryKps
    ? state.secondaryKps.split(/[,，、;；]/).map((s) => s.trim()).filter(Boolean)
    : undefined;
  const prerequisitesList = state.prerequisites
    ? state.prerequisites.split(/[,，、;；]/).map((s) => s.trim()).filter(Boolean)
    : undefined;

  return {
    type: state.type,
    stem: state.stem,
    options: state.options,
    answer: state.answer,
    analysis: state.analysis,
    expansion: state.expansion?.trim() || undefined,
    kp: state.kp,
    secondaryKps: secondaryKpsList,
    prerequisites: prerequisitesList,
    source: state.source,
    group: state.group?.trim() || undefined,
    status: overrideStatus ?? state.status,
    ...(state.family ? { family: state.family } : {}),
    numericSpec:
      state.type === "fill" && state.specOpen
        ? { unit: state.specUnit, absTol: state.specAbsTol, relPct: state.specRelPct, altUnits: state.specAltUnits }
        : undefined,
    orderIndependent: state.type === "fill" && state.orderIndependent,
    rubricText: state.type === "short" && state.rubricOpen && state.rubricText.trim() ? state.rubricText : undefined,
    studyLang: state.studyLang,
    studyPhonetic: state.studyPhonetic,
  };
}

/**
 * 切换录题题型（含丢弃内容确认与表单清空）
 */
export async function executeSwitchManualTypeWithConfirm(options: {
  currentType: QuestionType;
  nextType: QuestionType;
  stem: string;
  options: string[];
  answer: string;
  analysis: string;
  confirmDialogSync: (opts: { title: string; content: string }) => Promise<boolean>;
  t: (k: string) => string;
}): Promise<{ confirmed: boolean; cleanState?: ReturnType<typeof getCleanStateOnTypeSwitch> }> {
  const { currentType, nextType, stem, options: opts, answer, analysis, confirmDialogSync, t } = options;
  if (nextType === currentType) return { confirmed: false };
  if (shouldConfirmTypeSwitch(stem, opts, answer, analysis)) {
    const ok = await confirmDialogSync({
      title: t("manual.switchTypeTitle"),
      content: t("manual.switchTypeConfirm"),
    });
    if (!ok) return { confirmed: false };
  }
  return { confirmed: true, cleanState: getCleanStateOnTypeSwitch(nextType) };
}

export interface PostSaveManualResetResult {
  stem: string;
  options: string[];
  answer: string;
  analysis: string;
  expansion: string;
  clearUnpinnedMeta: boolean;
}

/**
 * 计算保存成功后的表单重置策略（pinAttributes=true 时保留题型、考点、出处等属性）
 */
export function computePostSaveManualReset(
  type: QuestionType,
  pinAttributes: boolean,
): PostSaveManualResetResult {
  const isChoice = type === "single" || type === "multiple";
  return {
    stem: "",
    options: isChoice ? ["", ""] : [],
    answer: "",
    analysis: "",
    expansion: "",
    clearUnpinnedMeta: !pinAttributes,
  };
}

/**
 * 严格等待保存成功后执行表单重置与聚焦（保存失败或异常时完整保留草稿）
 */
export async function executeSaveAndContinueManual(options: {
  save: () => Promise<boolean>;
  resetForm: () => void | Promise<void>;
  focusStem: () => void;
}): Promise<boolean> {
  let ok = false;
  try {
    ok = (await options.save()) === true;
  } catch {
    return false;
  }
  if (!ok) return false;
  await options.resetForm();
  options.focusStem();
  return true;
}

const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  single: "单选题",
  multiple: "多选题",
  judge: "判断题",
  fill: "填空题",
  short: "简答题",
  material: "材料题",
};

/**
 * 构建用于追加到原笔记末尾的折叠题目引用块（不带 custom-exam-id，避免题库重复统计）
 */
export function buildFoldedQuestionNoteMarkdown(q: Question): string {
  const typeLabel = QUESTION_TYPE_LABELS[q.type] ?? q.type;
  const kpPart = q.kp ? ` · ${q.kp}` : "";
  const lines: string[] = [`> [!NOTE] 📝 随堂题库卡片（${typeLabel}${kpPart}）`];
  const stemLines = q.stem.trim().split(/\r?\n/);
  lines.push(`> **题干**：${stemLines[0] ?? ""}`);
  for (const extra of stemLines.slice(1)) {
    lines.push(`> ${extra}`);
  }
  if (q.options.length > 0) {
    lines.push(">");
    q.options.forEach((opt, i) => {
      lines.push(`> - ${String.fromCharCode(65 + i)}. ${opt}`);
    });
  }
  lines.push(">");
  lines.push(`> **参考答案**：${q.answer.replace(/\r?\n/g, " / ") || "（略）"}`);
  if (q.analysis?.trim()) {
    const analysisLines = q.analysis.trim().split(/\r?\n/);
    lines.push(`> **解析**：${analysisLines[0]}`);
    for (const extra of analysisLines.slice(1)) {
      lines.push(`> ${extra}`);
    }
  }
  const safeId = q.id.replace(/[^a-zA-Z0-9_-]/g, "");
  return `${lines.join("\n")}\n{: fold="1" custom-exam-mirror="${safeId}"}`;
}

/**
 * 将已保存题目的折叠卡片同步追加到原绑定笔记文档末尾
 */
export async function appendQuestionMirrorToSourceNote(
  app: ExamApp,
  sourceBlockId: string,
  q: Question,
): Promise<string | null> {
  const rawId = sourceBlockId.trim();
  if (!rawId || !app?.bridge?.appendBlock) return null;
  let targetDocId = rawId;
  if (typeof app.bridge.sql === "function") {
    try {
      const rows = await app.bridge.sql(
        `SELECT root_id FROM blocks WHERE id = '${rawId.replace(/'/g, "''")}' LIMIT 1`,
      );
      const rootId = rows?.[0]?.root_id;
      if (typeof rootId === "string" && rootId.trim()) {
        targetDocId = rootId.trim();
      }
    } catch {
      /* SQL 不可用时回退直接使用 sourceBlockId */
    }
  }
  const md = buildFoldedQuestionNoteMarkdown(q);
  await app.bridge.appendBlock(targetDocId, md);
  return targetDocId;
}


