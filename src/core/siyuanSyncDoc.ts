/**
 * 题库与组卷同步至思源笔记原生文档引擎 (SiYuan Native Doc Generator)
 * 职责：
 * 1. 将题库、全真模考卷或错题攻坚卷排版格式化为思源笔记标准原生文档内容；
 * 2. 答案与解析采用思源可交互折叠块（<details>）包裹，方便在思源中自测翻看，绝不默认透题；
 * 3. 题目挂载 custom-exam-id、custom-exam-type 块属性，支持卸载后永久阅读，重装后无损读回；
 * 4. 纯函数领域层，支持无头测试。
 */

import type { Question } from "./types";

export interface SiyuanDocExportOptions {
  subtitle?: string;
  isMockPaper?: boolean;
  durationMinutes?: number;
  passLine?: number;
  includeAttrs?: boolean;
}

const TYPE_CN_MAP: Record<string, string> = {
  single: "单项选择题",
  multiple: "多项选择题",
  judge: "判断是非题",
  fill: "填空题",
  short: "简答论述题",
  material: "材料题",
};

function escIal(v: string): string {
  return String(v ?? "").replace(/"/g, '\\"');
}

/**
 * 格式化思源笔记原生块引用 ((blockId "锚文本"))
 */
export function formatSiyuanBlockRef(
  blockId: string | undefined,
  anchorText: string,
  maxLen = 40,
): string {
  const cleanAnchor =
    String(anchorText ?? "")
      .replace(/\r?\n+/g, " ")
      .replace(/["()|[\]]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, maxLen) || "查看原题";
  const cleanId = String(blockId ?? "").trim();
  if (!cleanId || !/^[\w-]+$/.test(cleanId)) {
    return cleanAnchor;
  }
  return `((${cleanId} "${cleanAnchor}"))`;
}

/**
 * 将题目列表格式化为思源笔记原生文档 Markdown
 */
export function buildSiyuanExamDocMarkdown(
  title: string,
  questions: readonly Question[],
  options: SiyuanDocExportOptions = {},
): string {
  const lines: string[] = [];
  lines.push(`# 📚 ${title}`);

  const totalScore = questions.reduce((sum, q) => sum + (q.score || 1), 0);
  const durationText = options.durationMinutes ? ` | ⏱️ 建议限时：**${options.durationMinutes} 分钟**` : "";
  const passText = options.passLine ? ` | 及格线：**${options.passLine}%**` : "";

  lines.push(`> 卷面总分：**${totalScore} 分** | 题量：**${questions.length} 题**${durationText}${passText}`);
  lines.push(`> 📝 提示：本试卷已同步至思源笔记文档。答案与解析默认折叠，可直接在思源中展开自测；即使卸载插件，所有试题与笔记依然永久完整保留。\n`);

  let currentType = "";
  let typeSectionIndex = 1;
  const cnNums = ["一", "二", "三", "四", "五", "六", "七", "八"];

  questions.forEach((q, idx) => {
    // 题型分段大标题
    if (q.type !== currentType) {
      currentType = q.type;
      const typeLabel = TYPE_CN_MAP[q.type] || q.type;
      const secNo = cnNums[typeSectionIndex - 1] || `${typeSectionIndex}`;
      typeSectionIndex++;
      lines.push(`\n## ${secNo}、${typeLabel}\n`);
    }

    const no = idx + 1;
    const scoreText = q.score ? `（${q.score} 分）` : "";
    const stars = q.difficulty ? `★${q.difficulty} ` : "";

    // 题干
    lines.push(`### ${no}. ${String(q.stem ?? "").trim()} ${scoreText}`);

    // 选择题选项
    if (Array.isArray(q.options) && q.options.length > 0) {
      lines.push("");
      q.options.forEach((opt, oi) => {
        lines.push(`- **${String.fromCharCode(65 + oi)}.** ${String(opt ?? "").trim()}`);
      });
      lines.push("");
    }

    // 答案与解析折叠块（思源原生支持点击展开）
    lines.push(`<details>`);
    lines.push(`<summary><b>✔ 参考答案与核心解析点拨（点击展开）</b></summary>\n`);
    lines.push(`- **标准答案**：\`${String(q.answer ?? "").trim()}\``);
    if (q.kp) lines.push(`- **核心考点**：\`${q.kp}\``);
    if (q.difficulty) lines.push(`- **难度系数**：${stars}`);
    if (q.blockId) {
      const srcNote = q.sourceBlockId && q.sourceBlockId !== q.blockId
        ? ` · 来源笔记：${formatSiyuanBlockRef(q.sourceBlockId, "📖 原笔记段落")}`
        : "";
      lines.push(`- **思源原块溯源**：${formatSiyuanBlockRef(q.blockId, "🔗 定位题库源题块")}${srcNote}`);
    }
    if (q.analysis) {
      lines.push(`- **试题解析**：${String(q.analysis).trim()}`);
    }
    if (q.rubric?.criteria?.length) {
      lines.push(`- **主观采分点细则**：`);
      q.rubric.criteria.forEach((c) => {
        lines.push(`  - ${c.label}（${Math.round(c.weight * 100)}%）${c.example ? `：${c.example}` : ""}`);
      });
    }
    lines.push(`\n</details>`);

    // 思源块属性（供重装插件或块查询识别）
    if (options.includeAttrs !== false) {
      lines.push(`{: custom-exam-id="${escIal(q.id)}" custom-exam-type="${escIal(q.type)}" custom-exam-kp="${escIal(q.kp || "")}"}\n`);
    } else {
      lines.push("");
    }
  });

  return lines.join("\n");
}

/**
 * 将单个题目格式化为可直接嵌入思源普通笔记文档的折叠自测块
 */
export function formatQuestionForNoteEmbed(q: Question): string {
  const lines: string[] = [];
  const title = String(q.stem ?? "")
    .replace(/\r?\n.*/s, "")
    .replace(/[#`*]/g, "")
    .slice(0, 45)
    .trim() || "练习试题";

  lines.push(`\n::: details ❓ 试题自测：${title}（点击展开答案）`);
  lines.push(`**【题干】** ${String(q.stem ?? "").trim()}\n`);

  if (Array.isArray(q.options) && q.options.length > 0) {
    q.options.forEach((opt, oi) => {
      lines.push(`- **${String.fromCharCode(65 + oi)}.** ${String(opt ?? "").trim()}`);
    });
    lines.push("");
  }

  lines.push(`> **【参考答案】** \`${String(q.answer ?? "").trim()}\``);
  if (q.kp) lines.push(`> **【核心考点】** \`${q.kp}\``);
  if (q.analysis) lines.push(`> **【试题解析】** ${String(q.analysis).trim()}`);
  lines.push(`:::\n{: custom-exam-id="${escIal(q.id)}" custom-exam-type="${escIal(q.type)}" custom-exam-kp="${escIal(q.kp || "")}"}\n`);

  return lines.join("\n");
}

/**
 * 将错题本格式化为思源笔记错题攻坚手册文档
 */
export function buildSiyuanWrongbookDocMarkdown(
  bankName: string,
  wrongQuestions: readonly Question[],
): string {
  return buildSiyuanExamDocMarkdown(
    `${bankName} · 错题攻坚复盘手册（共 ${wrongQuestions.length} 题）`,
    wrongQuestions,
    {
      subtitle: "按考点与错题深度排版，可配合思源折叠块反复自测消灭错题",
      includeAttrs: true,
    },
  );
}

export interface BankOverviewDocParams {
  bankName: string;
  bankId: string;
  questions: readonly Question[];
  totalAttempts: number;
  correctAttempts: number;
  activeWrongCount: number;
  eliminatedWrongCount: number;
  mockCount: number;
  updatedAt?: Date;
}

/**
 * 构建《00 题库总览与考纲导航》思源常驻活文档 Markdown
 */
export function buildSiyuanBankOverviewDocMarkdown(params: BankOverviewDocParams): string {
  const {
    bankName,
    bankId,
    questions,
    totalAttempts,
    correctAttempts,
    activeWrongCount,
    eliminatedWrongCount,
    mockCount,
    updatedAt = new Date(),
  } = params;
  const ymd = updatedAt.toISOString().slice(0, 10);
  const accuracy = totalAttempts > 0 ? Math.round((correctAttempts / totalAttempts) * 100) : 0;

  const kpMap = new Map<string, { count: number; sample?: Question }>();
  for (const q of questions) {
    const rootKp = (q.kp || "未分类考点").split("/")[0].trim() || "未分类考点";
    const entry = kpMap.get(rootKp) ?? { count: 0, sample: q };
    entry.count += 1;
    if (!entry.sample?.blockId && q.blockId) entry.sample = q;
    kpMap.set(rootKp, entry);
  }
  const sortedKps = [...kpMap.entries()].sort((a, b) => b[1].count - a[1].count);

  const lines: string[] = [
    `# 🧭 ${bankName} · 题库总览与考纲导航`,
    ``,
    `> 📅 最近同步：\`${ymd}\` · 题库笔记本 ID：\`${bankId}\``,
    `> 💡 本页为小驴考试自动维护的**思源原生总览活文档**。包含核心备考指标、考纲章节分布与思源动态块引用，卸载插件亦永久可读。`,
    ``,
    `## 📊 题库核心备考指标`,
    ``,
    `| 总题量 | 累计作答人次 | 综合正确率 | 待攻坚错题 | 已消灭错题 | 全真模考场次 |`,
    `| :---: | :---: | :---: | :---: | :---: | :---: |`,
    `| **${questions.length} 题** | ${totalAttempts} 次 | **${accuracy}%** | **${activeWrongCount} 题** | ${eliminatedWrongCount} 题 | ${mockCount} 场 |`,
    ``,
    `## 🗺️ 考纲章节与代表母题双链索引`,
    ``,
  ];

  if (!sortedKps.length) {
    lines.push(`> 当前题库暂无试题，请先导入或录入题目。`, ``);
  } else {
    lines.push(
      `| 考点章节 | 题量 | 占比 | 代表题块双链（点击直达源题） |`,
      `| :--- | :---: | :---: | :--- |`,
    );
    for (const [kp, info] of sortedKps) {
      const pct = questions.length > 0 ? Math.round((info.count / questions.length) * 100) : 0;
      const sampleRef = info.sample
        ? formatSiyuanBlockRef(info.sample.blockId, info.sample.stem, 32)
        : "—";
      lines.push(`| **${kp.replace(/\|/g, "\\|")}** | ${info.count} 题 | ${pct}% | ${sampleRef} |`);
    }
    lines.push(``);
  }

  lines.push(
    `## 🔍 思源原生 SQL 动态检索视图（可复制到任意思源笔记中使用）`,
    ``,
    `- **实时聚合本题库所有在册错题块**（基于小驴自动回写的 \`custom-exam-wrong-status\` 块属性）：`,
    `  \`{{SELECT * FROM blocks WHERE box='${bankId}' AND ial LIKE '%custom-exam-wrong-status="active"%'}}\``,
    `- **实时聚合本题库所有重点收藏题块**（基于 \`custom-exam-fav\` 块属性）：`,
    `  \`{{SELECT * FROM blocks WHERE box='${bankId}' AND ial LIKE '%custom-exam-fav="1"%'}}\``,
    `- **实时聚合已写个人复盘反思的题块**（基于 \`custom-exam-reflection\` 块属性）：`,
    `  \`{{SELECT * FROM blocks WHERE box='${bankId}' AND ial LIKE '%custom-exam-reflection=%'}}\``,
    ``,
  );

  return lines.join("\n");
}

export interface ActionJournalDocParams {
  bankName: string;
  actions: readonly {
    id: string;
    kind: string;
    qid?: string;
    detail: string;
    status: string;
    createdAt: number;
  }[];
  reflections: readonly {
    qid: string;
    text: string;
    at: number;
    reason?: string;
  }[];
  questionMap: ReadonlyMap<string, Question>;
  updatedAt?: Date;
}

/**
 * 构建《03 备考行动与复盘日志》思源常驻活文档 Markdown
 */
export function buildSiyuanActionJournalDocMarkdown(params: ActionJournalDocParams): string {
  const { bankName, actions, reflections, questionMap, updatedAt = new Date() } = params;
  const ymd = updatedAt.toISOString().slice(0, 10);

  const lines: string[] = [
    `# 📋 ${bankName} · 备考行动与复盘日志`,
    ``,
    `> 📅 最近同步：\`${ymd}\` · 待办行动：**${actions.filter((a) => a.status === "open").length}** 项 · 复盘反思：**${reflections.length}** 条`,
    `> 💡 本页将备考过程中的**行动清单（任务块）**与**错题个人复盘反思**全部沉淀为思源原生笔记，并带有源题块双链引用。`,
    ``,
    `## 📌 一、 备考行动清单（思源原生任务列表）`,
    ``,
  ];

  if (!actions.length) {
    lines.push(`- [x] 当前暂无待办备考行动项，继续保持！`, ``);
  } else {
    for (const act of actions) {
      const checked = act.status === "done" ? "x" : " ";
      const q = act.qid ? questionMap.get(act.qid) : undefined;
      const qRef = q?.blockId ? ` · ${formatSiyuanBlockRef(q.blockId, q.stem, 28)}` : "";
      lines.push(
        `- [${checked}] ${act.detail.replace(/\r?\n/g, " ")}${qRef}`,
        `{: custom-exam-act-id="${escIal(act.id)}"}\n`,
      );
    }
    lines.push(``);
  }

  lines.push(`## ✍️ 二、 错题个人复盘反思汇编`, ``);

  if (!reflections.length) {
    lines.push(`> 暂无错题个人反思记录。在做题结算页或错题本点击「写反思」，你的思考将自动同步至原题块与本日志。`, ``);
  } else {
    reflections.forEach((r, idx) => {
      const q = questionMap.get(r.qid);
      const titleRef = q
        ? formatSiyuanBlockRef(q.blockId, q.stem, 44)
        : r.qid;
      const kpBadge = q?.kp ? ` · 考点：\`${q.kp}\`` : "";
      const reasonBadge = r.reason ? ` · 错因：\`${r.reason}\`` : "";
      const dateStr = new Date(r.at).toISOString().slice(0, 10);
      lines.push(
        `### ${idx + 1}. ${titleRef}`,
        `- **记录时间**：\`${dateStr}\`${kpBadge}${reasonBadge}`,
        `> 💡 **我的复盘反思**：${r.text.replace(/\r?\n/g, "\n> ")}`,
        ``,
      );
    });
  }

  return lines.join("\n");
}
