/**
 * ============================================================
 * 外部知识图谱与课程分类体系适配器 (Taxonomy Adapter)
 * 适配标准：Marble os-taxonomy / cn-math-taxonomy / CnK12Taxonomy 规范
 * 能力：将外部学科知识点、先修边与诊断题转换为小驴考试考纲树、关系图与标准题目
 * ============================================================
 */

import type { Question, QuestionType } from "./types";
import type { SyllabusNode } from "./syllabus";
import type { KpRelation } from "./kpRelations";
import { questionHash } from "./answer";
import { newQuestionId } from "./ids";

export interface TaxonomyTopic {
  id: string;
  name: string;
  domain?: string;
  grade?: number;
  semester?: string;
  chapter?: string;
  type?: string;
  description?: string;
  mastery_criteria?: string[];
  diagnostic_question?: {
    question: string;
    answer: string;
    options?: string[];
    analysis?: string;
  };
  standards?: Array<{
    id: string;
    confidence?: string;
    note?: string;
  }>;
}

export interface TaxonomyDependency {
  topicId: string;
  prerequisiteId: string;
  strength?: "hard" | "soft";
  reason?: string;
}

export interface TaxonomyQuestionItem {
  id?: string;
  topic_id?: string;
  topicId?: string;
  stem?: string;
  question?: string;
  type?: string;
  options?: string[];
  answer: string | number;
  analysis?: string;
  difficulty?: string | number;
}

/**
 * 将外部扁平知识点数组解析构建为小驴考试分层考纲树 (SyllabusNode[])
 * 层次结构：大领域 (domain) -> 教材章节 (chapter) -> 微知识点 (title)
 */
export function convertTaxonomyToSyllabus(topics: readonly TaxonomyTopic[]): SyllabusNode[] {
  if (!topics || !topics.length) return [];

  const rootMap = new Map<string, { node: SyllabusNode; chapterMap: Map<string, SyllabusNode> }>();
  let domainSeq = 1;

  for (const topic of topics) {
    const domain = (topic.domain || "综合学科").trim();
    const chapter = (topic.chapter || "基础章节").trim();
    const name = (topic.name || topic.id).trim();

    // 1. 获取或创建领域根节点
    let domainEntry = rootMap.get(domain);
    if (!domainEntry) {
      const domainNode: SyllabusNode = {
        id: `d-${domainSeq++}`,
        title: domain,
        kpPrefix: domain,
        children: [],
      };
      domainEntry = { node: domainNode, chapterMap: new Map() };
      rootMap.set(domain, domainEntry);
    }

    // 2. 获取或创建章节子节点
    let chapterNode = domainEntry.chapterMap.get(chapter);
    if (!chapterNode) {
      const chIdx = domainEntry.node.children.length + 1;
      chapterNode = {
        id: `${domainEntry.node.id}-c${chIdx}`,
        title: chapter,
        kpPrefix: `${domain}/${chapter}`,
        children: [],
      };
      domainEntry.chapterMap.set(chapter, chapterNode);
      domainEntry.node.children.push(chapterNode);
    }

    // 3. 追加知识点叶子节点
    const leafIdx = chapterNode.children.length + 1;
    const leafNode: SyllabusNode = {
      id: `${chapterNode.id}-k${leafIdx}`,
      title: name,
      kpPrefix: `${domain}/${chapter}/${name}`,
      children: [],
    };
    chapterNode.children.push(leafNode);
  }

  return Array.from(rootMap.values()).map((e) => e.node);
}

/**
 * 构建知识点 ID 到小驴考试标准化考点路径 (kp) 的映射字典
 * 格式示例: "数与代数/七上 第一章 有理数/正数和负数"
 */
export function buildTaxonomyKpMap(topics: readonly TaxonomyTopic[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const t of topics) {
    const parts = [
      (t.domain || "综合").trim(),
      (t.chapter || "").trim(),
      (t.name || t.id).trim(),
    ].filter(Boolean);
    map.set(t.id, parts.join("/"));
  }
  return map;
}

/**
 * 将外部先修依赖数组转换为小驴考试先修关系集合 (KpRelation[])
 */
export function convertTaxonomyDependencies(
  dependencies: readonly TaxonomyDependency[],
  topicKpMap: ReadonlyMap<string, string>,
  options: { hardOnly?: boolean; nowMs?: number } = {},
): KpRelation[] {
  if (!dependencies || !dependencies.length) return [];

  const relations: KpRelation[] = [];
  const seen = new Set<string>();
  const createdAt = options.nowMs ?? Date.now();

  for (const dep of dependencies) {
    if (options.hardOnly && dep.strength === "soft") {
      continue;
    }

    const fromKp = topicKpMap.get(dep.topicId);
    const toPrereqKp = topicKpMap.get(dep.prerequisiteId);

    if (!fromKp || !toPrereqKp || fromKp === toPrereqKp) {
      continue;
    }

    const key = `${fromKp}-->${toPrereqKp}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);

    relations.push({
      from: fromKp,
      to: toPrereqKp,
      kind: "prereq",
      source: "syllabus",
      confirmed: true,
      createdAt,
    });
  }

  return relations;
}

/**
 * 将外部学科题库题目数组转换为小驴考试标准题目集合 (Question[])
 */
export function convertTaxonomyQuestions(
  rawQuestions: readonly TaxonomyQuestionItem[],
  topicKpMap: ReadonlyMap<string, string>,
  options: { source?: string; defaultScore?: number } = {},
): Question[] {
  if (!rawQuestions || !rawQuestions.length) return [];

  const questions: Question[] = [];

  for (const raw of rawQuestions) {
    const stem = (raw.stem || raw.question || "").trim();
    if (!stem) continue;

    const topicId = raw.topic_id || raw.topicId || "";
    const kp = (topicId ? topicKpMap.get(topicId) : "") || "通识/基础";

    let optionsList: string[] = [];
    let qType: QuestionType;
    let answerStr = String(raw.answer ?? "").trim();

    if (Array.isArray(raw.options) && raw.options.length > 0) {
      optionsList = raw.options.map((opt) => String(opt).trim());
      qType = "single";
      // 若答案是数字索引（0, 1, 2, 3），转换为大写字母 A, B, C, D
      if (/^\d+$/.test(answerStr)) {
        const idx = parseInt(answerStr, 10);
        if (idx >= 0 && idx < 26) {
          answerStr = String.fromCharCode(65 + idx);
        }
      }
    } else if (raw.type === "choice" || raw.type === "single") {
      qType = "single";
    } else if (raw.type === "judge") {
      qType = "judge";
    } else if (raw.type === "short") {
      qType = "short";
    } else {
      qType = "fill";
    }

    let diffLevel = 3;
    if (typeof raw.difficulty === "number") {
      diffLevel = Math.max(1, Math.min(5, Math.round(raw.difficulty)));
    } else if (raw.difficulty === "basic") {
      diffLevel = 2;
    } else if (raw.difficulty === "standard") {
      diffLevel = 3;
    } else if (raw.difficulty === "advanced") {
      diffLevel = 4;
    }

    const q: Question = {
      id: raw.id || newQuestionId(),
      type: qType,
      stem,
      options: optionsList,
      answer: answerStr,
      analysis: raw.analysis || "",
      kp,
      difficulty: diffLevel,
      score: options.defaultScore ?? (qType === "single" ? 2 : qType === "short" ? 10 : 3),
      source: options.source || "中国学科知识图谱精选",
      status: "published",
      origin: "imported",
      hash: questionHash(stem, optionsList),
    };

    questions.push(q);
  }

  return questions;
}

/**
 * ============================================================
 * 国家新课标中国初高中数学知识图谱核心预设 (cn-math-taxonomy 精选)
 * 遵循 2022/2025 义务教育与普通高中新课标架构
 * 拓扑图：无环 DAG，覆盖代数、方程、几何、函数四大模块先修链
 * ============================================================
 */
export const STANDARD_MATH_TAXONOMY_TOPICS: readonly TaxonomyTopic[] = [
  {
    id: "cnm_num_rational",
    name: "有理数概念与四则运算法则",
    domain: "数与代数",
    grade: 7,
    semester: "七上",
    chapter: "第一章 有理数",
    mastery_criteria: ["能熟练进行正负数、绝对值与有理数加减乘除乘方运算"],
  },
  {
    id: "cnm_alg_factor",
    name: "整式乘除与提公因式平方差十字相乘分解",
    domain: "数与代数",
    grade: 8,
    semester: "八上",
    chapter: "第十四章 整式的乘法与因式分解",
    mastery_criteria: ["熟练应用完全平方公式、平方差公式与十字相乘进行因式分解"],
  },
  {
    id: "cnm_eq_linear",
    name: "一元一次方程的解法与应用题模型",
    domain: "方程与不等式",
    grade: 7,
    semester: "七上",
    chapter: "第三章 一元一次方程",
    mastery_criteria: ["掌握去分母、去括号、移项、合并同类项求解一元一次方程"],
  },
  {
    id: "cnm_eq_quadratic",
    name: "一元二次方程根的判别式与配方法解法",
    domain: "方程与不等式",
    grade: 9,
    semester: "九上",
    chapter: "第二十一章 一元二次方程",
    mastery_criteria: ["掌握配方法、公式法求根及利用判别式判断根的分布"],
  },
  {
    id: "cnm_fn_linear",
    name: "一次函数的图像性质与待定系数法",
    domain: "函数与分析",
    grade: 8,
    semester: "八下",
    chapter: "第十九章 一次函数",
    mastery_criteria: ["理解斜率k与截距b的几何意义，能用待定系数法求解析式"],
  },
  {
    id: "cnm_fn_quadratic",
    name: "二次函数的图像性质极值与最值应用",
    domain: "函数与分析",
    grade: 9,
    semester: "九上",
    chapter: "第二十二章 二次函数",
    mastery_criteria: ["熟练求对称轴、顶点坐标及闭区间二次函数的最值"],
  },
  {
    id: "cnm_geo_triangle",
    name: "全等三角形的判定公理与性质",
    domain: "图形与几何",
    grade: 8,
    semester: "八上",
    chapter: "第十二章 全等三角形",
    mastery_criteria: ["掌握SSS/SAS/ASA/AAS公理判定全等并进行几何推导证明"],
  },
  {
    id: "cnm_geo_pythagoras",
    name: "勾股定理与其逆定理的综合运用",
    domain: "图形与几何",
    grade: 8,
    semester: "八下",
    chapter: "第十七章 勾股定理",
    mastery_criteria: ["掌握直角三角形三边关系a^2+b^2=c^2及折叠几何计算"],
  },
  {
    id: "cnm_geo_similar",
    name: "相似三角形的判定定理与相似比性质",
    domain: "图形与几何",
    grade: 9,
    semester: "九下",
    chapter: "第二十七章 相似",
    mastery_criteria: ["理解相似三角形边长比例关系，面积比等于相似比的平方"],
  },
  {
    id: "cnm_geo_trig",
    name: "锐角三角函数定义与特殊角函数值计算",
    domain: "图形与几何",
    grade: 9,
    semester: "九下",
    chapter: "第二十八章 锐角三角函数",
    mastery_criteria: ["掌握正弦sin、余弦cos、正切tan的边比定义与30°/45°/60°特值"],
  },
  {
    id: "cnm_hs_derivative",
    name: "导数的概念切线几何意义与单调极值分析",
    domain: "函数与分析",
    grade: 11,
    semester: "高二选必二",
    chapter: "第四章 一元函数的导数及其应用",
    mastery_criteria: ["能对初等函数求导，根据导数正负判断原函数单调区间与极值"],
  },
];

export const STANDARD_MATH_TAXONOMY_DEPENDENCIES: readonly TaxonomyDependency[] = [
  // 代数方程链：有理数 -> 因式分解 -> 一元二次方程 (hard)
  { topicId: "cnm_alg_factor", prerequisiteId: "cnm_num_rational", strength: "hard", reason: "因式分解建立在有理数运算法则基础上" },
  { topicId: "cnm_eq_quadratic", prerequisiteId: "cnm_alg_factor", strength: "hard", reason: "配方法与十字相乘解方程依赖因式分解基础" },
  { topicId: "cnm_eq_quadratic", prerequisiteId: "cnm_eq_linear", strength: "hard", reason: "一元二次方程降次后转化为一元一次方程" },

  // 函数链：一次函数 -> 二次函数 -> 高中导数 (hard)
  { topicId: "cnm_fn_quadratic", prerequisiteId: "cnm_eq_quadratic", strength: "hard", reason: "二次函数与坐标轴交点即对应一元二次方程根" },
  { topicId: "cnm_fn_quadratic", prerequisiteId: "cnm_fn_linear", strength: "soft", reason: "一次函数的单调性认知辅助二次函数学习" },
  { topicId: "cnm_hs_derivative", prerequisiteId: "cnm_fn_quadratic", strength: "hard", reason: "二次函数切线斜率与极值是导数理论的核心直观依托" },

  // 几何链：全等三角形 -> 勾股定理 / 相似三角形 -> 锐角三角函数 (hard)
  { topicId: "cnm_geo_pythagoras", prerequisiteId: "cnm_geo_triangle", strength: "hard", reason: "勾股定理建立在直角三角形基础性质上" },
  { topicId: "cnm_geo_similar", prerequisiteId: "cnm_geo_triangle", strength: "hard", reason: "相似三角形是全等三角形的比例推广" },
  { topicId: "cnm_geo_trig", prerequisiteId: "cnm_geo_similar", strength: "hard", reason: "三角函数的边长比值固定基于直角三角形相似原理" },
];

export const STANDARD_MATH_TAXONOMY_QUESTIONS: readonly TaxonomyQuestionItem[] = [
  {
    topicId: "cnm_num_rational",
    stem: "计算：-3 + 5 - (-2) 的结果是？",
    type: "single",
    options: ["4", "0", "2", "-6"],
    answer: "A",
    analysis: "-3 + 5 - (-2) = 2 + 2 = 4。",
    difficulty: "basic",
  },
  {
    topicId: "cnm_alg_factor",
    stem: "因式分解 x^2 - 4x + 4 的结果为？",
    type: "single",
    options: ["(x - 2)^2", "(x + 2)^2", "(x - 4)(x + 1)", "(x - 2)(x + 2)"],
    answer: "A",
    analysis: "由完全平方公式 a^2 - 2ab + b^2 = (a - b)^2 可得结果为 (x - 2)^2。",
    difficulty: "basic",
  },
  {
    topicId: "cnm_eq_quadratic",
    stem: "已知关于 x 的一元二次方程 x^2 - 2x + m = 0 有两个相等的实数根，则实数 m 的值为？",
    type: "single",
    options: ["1", "-1", "4", "0"],
    answer: "A",
    analysis: "方程有两相等实根，则判别式 Δ = b^2 - 4ac = (-2)^2 - 4(1)(m) = 4 - 4m = 0，解得 m = 1。",
    difficulty: "standard",
  },
  {
    topicId: "cnm_fn_quadratic",
    stem: "抛物线 y = (x - 1)^2 + 3 的对称轴与顶点坐标分别为？",
    type: "single",
    options: [
      "直线 x = 1，顶点为 (1, 3)",
      "直线 x = -1，顶点为 (-1, 3)",
      "直线 x = 1，顶点为 (1, -3)",
      "直线 x = 3，顶点为 (3, 1)",
    ],
    answer: "A",
    analysis: "顶点式 y = a(x - h)^2 + k 中，对称轴为直线 x = h，顶点坐标为 (h, k)。",
    difficulty: "standard",
  },
  {
    topicId: "cnm_geo_similar",
    stem: "若 △ABC 与 △DEF 相似且相似比为 1:2，则 △ABC 与 △DEF 的面积之比为？",
    type: "single",
    options: ["1:4", "1:2", "1:根号2", "2:1"],
    answer: "A",
    analysis: "相似三角形的面积比等于相似比的平方，故 (1/2)^2 = 1/4。",
    difficulty: "basic",
  },
  {
    topicId: "cnm_geo_trig",
    stem: "在 Rt△ABC 中，∠C = 90°，AC = 3，BC = 4，则 sin A 的值为？",
    type: "single",
    options: ["4/5", "3/5", "3/4", "4/3"],
    answer: "A",
    analysis: "根据勾股定理斜边 AB = 5，sin A = 对边 / 斜边 = BC / AB = 4/5。",
    difficulty: "standard",
  },
  {
    topicId: "cnm_hs_derivative",
    stem: "已知函数 f(x) = x^3 - 3x，则 f'(1) 的值为？",
    type: "single",
    options: ["0", "3", "-3", "1"],
    answer: "A",
    analysis: "求导得 f'(x) = 3x^2 - 3，代入 x = 1 得 f'(1) = 3(1)^2 - 3 = 0。",
    difficulty: "standard",
  },
];

/**
 * 获取开箱即用的标准国家新课标学科图谱预设套装
 * 包含：标准大纲树 (roots)、先修依赖拓扑 (relations)、示范试题 (sampleQuestions)
 */
export function getStandardMathTaxonomyPreset(): {
  topics: readonly TaxonomyTopic[];
  dependencies: readonly TaxonomyDependency[];
  syllabusRoots: SyllabusNode[];
  relations: KpRelation[];
  sampleQuestions: Question[];
} {
  const kpMap = buildTaxonomyKpMap(STANDARD_MATH_TAXONOMY_TOPICS);
  const syllabusRoots = convertTaxonomyToSyllabus(STANDARD_MATH_TAXONOMY_TOPICS);
  const relations = convertTaxonomyDependencies(STANDARD_MATH_TAXONOMY_DEPENDENCIES, kpMap, {
    nowMs: 1761600000000,
  });
  const sampleQuestions = convertTaxonomyQuestions(STANDARD_MATH_TAXONOMY_QUESTIONS, kpMap, {
    source: "国家新课标中国学科图谱(cn-math-taxonomy)",
    defaultScore: 3,
  });

  return {
    topics: STANDARD_MATH_TAXONOMY_TOPICS,
    dependencies: STANDARD_MATH_TAXONOMY_DEPENDENCIES,
    syllabusRoots,
    relations,
    sampleQuestions,
  };
}

/**
 * ============================================================
 * 国家公务员与省考行政职业能力测验 (行测) 知识图谱预设
 * 覆盖言语理解、数量关系、判断推理、资料分析四大核心考点先修链
 * ============================================================
 */
export const STANDARD_CIVIL_SERVICE_TAXONOMY_TOPICS: readonly TaxonomyTopic[] = [
  {
    id: "cs_verbal_context",
    name: "语境转折与呼应解释词义辨析",
    domain: "言语理解与表达",
    chapter: "第一章 逻辑填空",
    mastery_criteria: ["能根据转折关联词、递进关系及解释说明对应寻找文段提示词"],
  },
  {
    id: "cs_verbal_central_idea",
    name: "主旨概括与中心议题提炼",
    domain: "言语理解与表达",
    chapter: "第二章 片段阅读",
    mastery_criteria: ["能识别对策句、转折之后重点及反面论证推导作者意图"],
  },
  {
    id: "cs_quant_proportion",
    name: "比例法与特值法工程模型",
    domain: "数量关系",
    chapter: "第一章 比例与工程问题",
    mastery_criteria: ["能设工作总量为完工时间公倍数，用效率比求解多主体合作问题"],
  },
  {
    id: "cs_quant_itinerary",
    name: "路程速度时间正反比相遇追及模型",
    domain: "数量关系",
    chapter: "第二章 行程问题",
    mastery_criteria: ["掌握S=vt下两地相向而行与同向追及公式模型"],
  },
  {
    id: "cs_logic_syllogism",
    name: "假言命题与逆否命题等价推导",
    domain: "判断推理",
    chapter: "第一章 必然性推理",
    mastery_criteria: ["熟练掌握“如果P则Q”为真时，“非Q则非P”必然为真的推理规则"],
  },
  {
    id: "cs_logic_strengthen_weaken",
    name: "加强与削弱论证因果链分析",
    domain: "判断推理",
    chapter: "第二章 可能性推理",
    mastery_criteria: ["掌握因果倒置、另有他因、没因没果等削弱论题与论据方法"],
  },
  {
    id: "cs_data_growth_rate",
    name: "基期量与现期增长率逆向速算",
    domain: "资料分析",
    chapter: "第一章 增长与基期",
    mastery_criteria: ["掌握基期量=现期量/(1+增长率)，化除为乘公式及截位直除技巧"],
  },
  {
    id: "cs_data_proportion_change",
    name: "两期比重差值与升降方向判定",
    domain: "资料分析",
    chapter: "第二章 比重与倍数",
    mastery_criteria: ["掌握部分增长率a大于整体增长率b时，现期比重大于基期比重的定理"],
  },
];

export const STANDARD_CIVIL_SERVICE_TAXONOMY_DEPENDENCIES: readonly TaxonomyDependency[] = [
  // 言语：语境逻辑填空 -> 片段阅读主旨 (soft)
  { topicId: "cs_verbal_central_idea", prerequisiteId: "cs_verbal_context", strength: "soft", reason: "词义与关联词语境是读懂文段核心论述的基础" },
  // 数量：工程比例模型 -> 行程正反比 (soft)
  { topicId: "cs_quant_itinerary", prerequisiteId: "cs_quant_proportion", strength: "soft", reason: "工程效率比例法思维直接平移到速度与时间正反比" },
  // 判断：假言命题逆否推理 -> 加强与削弱逻辑 (hard)
  { topicId: "cs_logic_strengthen_weaken", prerequisiteId: "cs_logic_syllogism", strength: "hard", reason: "论证的前提假设推导依托命题假言充要条件理解" },
  // 资料：基期与增长率 -> 两期比重升降判定 (hard)
  { topicId: "cs_data_proportion_change", prerequisiteId: "cs_data_growth_rate", strength: "hard", reason: "两期比重比较公式严格建立在分子分母各自的增长率速算基础上" },
];

export const STANDARD_CIVIL_SERVICE_TAXONOMY_QUESTIONS: readonly TaxonomyQuestionItem[] = [
  {
    topicId: "cs_logic_syllogism",
    stem: "“只要努力拼搏，就一定能取得成功。”若上述断定为真，则下列各项中必然为真的是？",
    type: "single",
    options: [
      "如果不努力拼搏，就一定不能取得成功",
      "如果取得了成功，说明一定努力拼搏了",
      "如果不成功，说明一定没有努力拼搏",
      "努力拼搏了，但没有取得成功",
    ],
    answer: "C",
    analysis: "“只要P就Q”是充分条件假言命题，其等价逆否命题为“非Q则非P”，即“不成功则没有努力拼搏”。A和B犯了否前和肯后的逻辑错误，D与题干直接矛盾。",
    difficulty: "basic",
  },
  {
    topicId: "cs_data_proportion_change",
    stem: "2025年某市高新技术产业增加值同比增长12.5%，占全市规模以上工业增加值的比重为35.2%。已知同期该市规模以上工业增加值同比增长8.2%。问：2025年该市高新技术产业占规模以上工业增加值的比重比上年？",
    type: "single",
    options: ["上升了", "下降了", "持平", "无法判断"],
    answer: "A",
    analysis: "部分增长率 a = 12.5%，整体增长率 b = 8.2%。因为 a > b，所以两期比重必然上升。故选A。",
    difficulty: "standard",
  },
];

/**
 * 获取开箱即用的公考行测标准知识图谱预设套装
 */
export function getStandardCivilServiceTaxonomyPreset(): {
  topics: readonly TaxonomyTopic[];
  dependencies: readonly TaxonomyDependency[];
  syllabusRoots: SyllabusNode[];
  relations: KpRelation[];
  sampleQuestions: Question[];
} {
  const kpMap = buildTaxonomyKpMap(STANDARD_CIVIL_SERVICE_TAXONOMY_TOPICS);
  const syllabusRoots = convertTaxonomyToSyllabus(STANDARD_CIVIL_SERVICE_TAXONOMY_TOPICS);
  const relations = convertTaxonomyDependencies(STANDARD_CIVIL_SERVICE_TAXONOMY_DEPENDENCIES, kpMap, {
    nowMs: 1761600000000,
  });
  const sampleQuestions = convertTaxonomyQuestions(STANDARD_CIVIL_SERVICE_TAXONOMY_QUESTIONS, kpMap, {
    source: "国家公务员考试行政职业能力测验标准考纲",
    defaultScore: 2,
  });

  return {
    topics: STANDARD_CIVIL_SERVICE_TAXONOMY_TOPICS,
    dependencies: STANDARD_CIVIL_SERVICE_TAXONOMY_DEPENDENCIES,
    syllabusRoots,
    relations,
    sampleQuestions,
  };
}

/**
 * 统一获取指定学科领域的知识图谱预设套装
 */
export function getStandardTaxonomyPreset(kind: "math" | "civil_service" = "math"): {
  topics: readonly TaxonomyTopic[];
  dependencies: readonly TaxonomyDependency[];
  syllabusRoots: SyllabusNode[];
  relations: KpRelation[];
  sampleQuestions: Question[];
} {
  return kind === "civil_service" ? getStandardCivilServiceTaxonomyPreset() : getStandardMathTaxonomyPreset();
}

