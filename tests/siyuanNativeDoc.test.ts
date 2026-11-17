import { describe, it, expect } from "vitest";
import type { Question } from "../src/core/types";
import { ExamApp } from "../src/app";
import { MemoryStorage } from "../src/core/attemptLog";
import { KernelApiClient, type KernelTransport } from "../src/kernel/client";
import {
  cleanSiyuanDocMarkdown,
  parseQuestionsFromSiyuanDoc,
  parseQuestionsFromSiyuanDocBatch,
  parseInlineFlashcards,
  convertTaggedBlockToQuestion,
  buildReportFromTaggedBlocks,
} from "../src/core/siyuanDocImporter";
import {
  buildSiyuanExamDocMarkdown,
} from "../src/core/siyuanSyncDoc";

describe("思源原生文档导入与题库文档同步引擎 (siyuanNativeDoc)", () => {
  describe("1. 思源文档导入清洗与题目提取 (siyuanDocImporter)", () => {
    it("cleanSiyuanDocMarkdown 清洗 IAL 块属性与折叠块标记", () => {
      const raw = `
# 宪法学核心考点
{: id="20261022-doc1" updated="20261022"}

1. 中华人民共和国的根本制度是（ ）
A. 人民代表大会制度
B. 社会主义制度
C. 多党合作制
D. 民族区域自治制度
ANSWER: B
{: id="20261022-q1"}

::: details 答案与解析
【解析】宪法第一条明确规定社会主义制度是根本制度。
:::
{: id="20261022-fold1"}
      `;

      const cleaned = cleanSiyuanDocMarkdown(raw);
      expect(cleaned).not.toContain('{: id="20261022-doc1"');
      expect(cleaned).not.toContain("::: details");
      expect(cleaned).toContain("ANSWER: B");
      expect(cleaned).toContain("宪法第一条明确规定");
    });

    it("cleanSiyuanDocMarkdown 兼容引用块前缀、块引用与双链语法", () => {
      const raw = `
> ### 1. ((20261022123456-abcdefg "法的本质与特征"))
> - A. 统治阶级意志的体现
> - B. 全民意志的体现
> 答案：A
> 解析：参见 [[法理学讲义|第一章]]。
      `;
      const cleaned = cleanSiyuanDocMarkdown(raw);
      expect(cleaned).not.toContain(">");
      expect(cleaned).not.toContain("((20261022123456-abcdefg");
      expect(cleaned).toContain("法的本质与特征");
      expect(cleaned).toContain("第一章");
      expect(cleaned).not.toContain("[[法理学讲义|第一章]]");
    });

    it("parseQuestionsFromSiyuanDoc 成功提取思源文档试题并注入来源与考点元数据", async () => {
      const docMarkdown = `
1. 我国宪法的修改由全国人民代表大会以全体代表的（ ）以上的多数通过。
A. 二分之一
B. 三分之二
C. 四分之三
D. 五分之四
ANSWER: B
      `;

      const report = await parseQuestionsFromSiyuanDoc(docMarkdown, {
        docId: "20261022-doc-const",
        title: "2026年法考宪法精讲讲义",
        hpath: "/法律职业资格考试/宪法学/精讲讲义",
      });

      expect(report.ok.length).toBe(1);
      const q = report.ok[0];
      expect(q.answer).toBe("B");
      expect(q.source).toBe("2026年法考宪法精讲讲义");
      expect(q.sourceKind).toBe("real");
      expect(q.kp).toContain("法律职业资格考试/宪法学");
    });

    it("parseQuestionsFromSiyuanDoc 兼容引用块与列表项选择题，并具备幂等哈希一致性", async () => {
      const docMarkdown = `
> 1. 根据物权法律制度的规定，下列各项中，属于独立物权的是（ ）。
> - A. 建设用地使用权
> - B. 地役权
> - C. 抵押权
> - D. 留置权
> 【答案】A
      `;

      const meta = {
        docId: "doc-property-law",
        title: "民法物权精选",
        hpath: "/民法/物权法",
      };

      const report1 = await parseQuestionsFromSiyuanDoc(docMarkdown, meta);
      expect(report1.ok.length).toBe(1);
      const q1 = report1.ok[0];
      expect(q1.options.length).toBe(4);
      expect(q1.answer).toBe("A");

      // 再次提取，生成确定性 hash，保证幂等去重
      const report2 = await parseQuestionsFromSiyuanDoc(docMarkdown, meta, {
        existingHashes: new Set([q1.hash]),
      });
      expect(report2.duplicates).toBe(1);
      expect(report2.ok.length).toBe(0); // 幂等去重，不重复入库
    });

    it("parseQuestionsFromSiyuanDocBatch 并发从多篇文档批量提取试题并合并去重", async () => {
      const doc1 = {
        docId: "doc-ch1",
        title: "第一章 法的本体",
        hpath: "/法理学/第一章",
        markdown: `
1. 法的根本属性是（ ）。
A. 阶级性
B. 社会性
ANSWER: A
        `,
      };
      const doc2 = {
        docId: "doc-ch2",
        title: "第二章 法的运行",
        hpath: "/法理学/第二章",
        markdown: `
1. 法律适用的核心主体是（ ）。
A. 国家司法机关
B. 行政机关
ANSWER: A
        `,
      };

      const batchReport = await parseQuestionsFromSiyuanDocBatch([doc1, doc2]);
      expect(batchReport.ok.length).toBe(2);
      expect(batchReport.ok[0].source).toBe("第一章 法的本体");
      expect(batchReport.ok[1].source).toBe("第二章 法的运行");
      expect(batchReport.ok[0].kp).toBe("法理学");
      expect(batchReport.ok[1].kp).toBe("法理学");

      // 验证单篇内包含重复试题时，duplicates 计数准确无遗漏
      const docWithDupe = {
        docId: "doc-dupe",
        title: "含重复题文档",
        markdown: `
1. 试题一
A. 选项A
B. 选项B
ANSWER: A

2. 试题一
A. 选项A
B. 选项B
ANSWER: A
        `,
      };
      const dupeBatchReport = await parseQuestionsFromSiyuanDocBatch([docWithDupe]);
      expect(dupeBatchReport.ok.length).toBe(1);
      expect(dupeBatchReport.duplicates).toBe(1);
    });

    it("支持 Obsidian SR 规范单行极速制卡 (:: 单向卡 与 ::: 双向互逆卡)", () => {
      const meta = { docId: "doc-flash", title: "计算机网络术语" };
      const raw = `
# 笔记正文
HTTP :: 超文本传输协议
TCP ::: 传输控制协议
      `.trim();

      const questions = parseInlineFlashcards(raw, meta);
      // HTTP :: 超文本传输协议 生成 1 题
      // TCP ::: 传输控制协议 生成 2 题（正反向题族）
      expect(questions.length).toBe(3);

      const q1 = questions[0];
      expect(q1.stem).toBe("HTTP");
      expect(q1.answer).toBe("超文本传输协议");

      const q2 = questions[1];
      const q3 = questions[2];
      expect(q2.stem).toContain("【正向考查】TCP");
      expect(q2.answer).toBe("传输控制协议");
      expect(q3.stem).toContain("【逆向考查】");
      expect(q3.stem).toContain("传输控制协议");
      expect(q3.answer).toBe("TCP");

      // 验证双向卡正确绑定了 reverse 题族
      expect(q2.family?.variantKind).toBe("reverse");
      expect(q3.family?.variantKind).toBe("reverse");
      expect(q2.family?.parentId).toBe(q2.id);
      expect(q3.family?.parentId).toBe(q2.id);
    });

    it("支持 Obsidian SR 规范多行问答卡 (? 与 ?? 双向卡)", () => {
      const meta = { docId: "doc-qa", title: "操作系统核心原理" };
      const raw = `
死锁产生的四个必要条件是什么？
?
互斥条件、请求与保持条件、不剥夺条件、循环等待条件。

进程
??
计算机中程序关于某数据集合上的一次运行活动，是系统进行资源分配和调度的基本单位。
      `.trim();

      const questions = parseInlineFlashcards(raw, meta);
      expect(questions.length).toBe(3); // 1道单向多行卡 + 2道双向多行卡
      expect(questions[0].stem).toContain("死锁产生的四个必要条件是什么？");
      expect(questions[0].answer).toContain("互斥条件");
      expect(questions[1].stem).toContain("进程");
      expect(questions[2].stem).toContain("【逆向回忆】");
      expect(questions[2].answer).toBe("进程");
    });

    it("parseQuestionsFromSiyuanDoc 能自动识别并提取文档内的 :: 制卡语法", async () => {
      const meta = { docId: "doc-inline-doc", title: "英语考研词汇" };
      const docMarkdown = `
# 词汇打卡清单
abandon :: 放弃，抛弃
abundant :: 丰富的，充裕的
      `.trim();

      const report = await parseQuestionsFromSiyuanDoc(docMarkdown, meta);
      expect(report.ok.length).toBe(2);
      expect(report.ok[0].stem).toBe("abandon");
      expect(report.ok[0].answer).toBe("放弃,抛弃");
      expect(report.ok[1].stem).toBe("abundant");
      expect(report.ok[1].answer).toBe("丰富的,充裕的");
    });

    it("支持直接识别带有句末 (√)/(×)/(对)/(错) 的自然判断题", async () => {
      const docMarkdown = `
# 数学基础考点辨析
1. 质数只有两个因数。( √ )
2. 所有的偶数都是合数。( × )
      `.trim();
      const report = await parseQuestionsFromSiyuanDoc(docMarkdown, { docId: "doc-judge", title: "数学辨析" });
      expect(report.ok.length).toBe(2);
      expect(report.ok[0].type).toBe("judge");
      expect(report.ok[0].answer).toBe("对");
      expect(report.ok[1].type).toBe("judge");
      expect(report.ok[1].answer).toBe("错");
    });

    it("支持直接识别思源三级标题问答笔记（### 什么是死锁？）", async () => {
      const docMarkdown = `
### 什么是死锁？
死锁是指两个或两个以上的进程在执行过程中，因争夺资源而造成的一种互相等待的现象。

### 简述进程与线程的区别？
进程是资源分配的基本单位，线程是独立调度的基本单位。一个进程可以包含多个线程。
      `.trim();
      const report = await parseQuestionsFromSiyuanDoc(docMarkdown, { docId: "doc-qa", title: "操作系统核心笔记" });
      expect(report.ok.length).toBe(2);
      expect(report.ok[0].stem).toContain("什么是死锁？");
      expect(report.ok[0].answer).toContain("死锁是指两个或两个以上的进程");
      expect(report.ok[1].stem).toContain("简述进程与线程的区别？");
      expect(report.ok[1].answer).toContain("进程是资源分配的基本单位");
    });

    it("支持直接识别思源自然排版试卷（一行多选项与括号答案）", async () => {
      const docMarkdown = `
# 期末复习考题

1. 下列选项中不属于面向对象基本特征的是（ C ）
A. 封装  B. 继承  C. 递归  D. 多态
【解析】面向对象的三大基本特征为封装、继承、多态。

2、软件生命周期中时间最长的阶段是（   ）
A. 需求分析
B. 概要设计
C. 编码测试
D. 运行维护
【答案】D
【解析】维护阶段通常占据软件整个生命周期的绝大部分时间和成本。
      `.trim();
      const report = await parseQuestionsFromSiyuanDoc(docMarkdown, { docId: "doc-paper", title: "软件工程复习题" });
      expect(report.ok.length).toBe(2);
      expect(report.ok[0].type).toBe("single");
      expect(report.ok[0].answer).toBe("C");
      expect(report.ok[0].options).toHaveLength(4);
      expect(report.ok[0].options[0]).toBe("封装");
      expect(report.ok[0].options[2]).toBe("递归");
      expect(report.ok[0].analysis).toContain("面向对象的三大基本特征");

      expect(report.ok[1].type).toBe("single");
      expect(report.ok[1].answer).toBe("D");
      expect(report.ok[1].options).toHaveLength(4);
      expect(report.ok[1].options[3]).toBe("运行维护");
    });

    it("支持单篇思源笔记中多格式混合穷尽识别（选择题+自然判断+标题问答+列表定义+高亮挖空）", async () => {
      const docMarkdown = `
# 操作系统考点大集锦

## 一、客观选择题
1. 下列选项中属于进程通信方式的是（ A ）
A. 管道  B. 寄存器  C. 栈  D. 堆

## 二、基础判断题
1. 线程拥有自己独立的地址空间。( × )

## 三、核心概念速查
在 Linux 中，==fork()== 系统调用用于创建新进程。

### 什么是死锁？
死锁是指两个或两个以上的进程因争夺资源而无限等待。

- 临界区：进程中访问临界资源的那段代码。
- 信号量：用于进程同步与互斥的计数器变量。
      `.trim();

      const report = await parseQuestionsFromSiyuanDoc(docMarkdown, {
        docId: "doc-mixed",
        title: "操作系统全能笔记",
      });

      expect(report.ok.length).toBeGreaterThanOrEqual(6);
      const types = report.ok.map((q) => q.type);
      expect(types).toContain("single");
      expect(types).toContain("judge");
      expect(types).toContain("fill");
      expect(types).toContain("short");

      // 验证置信度与质检机制
      expect(report.ok[0].confidence).toBeGreaterThanOrEqual(0.8);
      expect(Array.isArray(report.ok[0].lintIssues)).toBe(true);
    });

    it("文档中的问答标题（如什么是死锁？/简述进程与线程区别？）提取为 short 简答题而非 fill 填空题", async () => {
      const docMarkdown = `
# 核心概念速查

### 什么是死锁？
死锁是指多个进程因争夺资源造成的互相等待。

### 简述进程与线程区别？
进程是资源分配单位，线程是调度单位。
      `.trim();

      const report = await parseQuestionsFromSiyuanDoc(docMarkdown, {
        docId: "20261031201017-dx9holn",
        title: "调试概念速查",
      });

      expect(report.ok.length).toBe(2);
      expect(report.ok[0].type).toBe("short");
      expect(report.ok[0].stem).toBe("什么是死锁？");
      expect(report.ok[0].answer).toContain("死锁是指多个进程因争夺资源造成的互相等待。");
      expect(report.ok[0].confidence).toBeGreaterThanOrEqual(0.85);

      expect(report.ok[1].type).toBe("short");
      expect(report.ok[1].stem).toBe("简述进程与线程区别？");
      expect(report.ok[1].answer).toContain("进程是资源分配单位");
      expect(report.ok[1].confidence).toBeGreaterThanOrEqual(0.85);
    });

    it("导入场景预设 (profile=paper) 仅识别严格试题，屏蔽正文概念与列表定义", async () => {
      const docMarkdown = `
# 软考真题与复习指南
注意事项：请将答案写在答题区。

1. 计算机中用于存放当前正在执行指令地址的寄存器是（   ）
A. 算术逻辑单元  B. 程序计数器  C. 指令寄存器  D. 累加器
【答案】B

- 软件危机：落后的软件生产方式无法满足迅速增长的计算机软件需求。
      `.trim();

      // 当使用 paper 模式时，列表定义等非试题被过滤，仅保留标准试卷试题
      const paperReport = await parseQuestionsFromSiyuanDoc(
        docMarkdown,
        { docId: "doc-paper-only", title: "软考真题" },
        { profile: "paper" },
      );

      expect(paperReport.ok.length).toBe(1);
      expect(paperReport.ok[0].stem).toContain("存放当前正在执行指令地址");
      expect(paperReport.ok[0].options).toHaveLength(4);
      expect(paperReport.ok[0].options[1]).toBe("程序计数器");
      expect(paperReport.ok[0].answer).toBe("B");
      expect(paperReport.ok[0].confidence).toBeGreaterThanOrEqual(0.85);
    });
  });

  describe("2. 题库与试卷同步为思源笔记原生文档 (siyuanSyncDoc)", () => {
    const testQuestions: Question[] = [
      {
        id: "q-sync-1",
        type: "single",
        stem: "平面向量的正交分解是指什么？",
        options: ["将向量沿两个互相垂直的方向分解", "将向量沿任意方向分解", "求向量的模长", "反向延长向量"],
        answer: "A",
        kp: "高等数学/平面向量",
        difficulty: 2,
        analysis: "正交是指垂直，正交分解即在互相垂直的直角坐标轴上投影分解。",
        score: 3,
      },
      {
        id: "q-sync-2",
        type: "short",
        stem: "简述全面推进依法治国的总目标。",
        options: [],
        answer: "建设中国特色社会主义法治体系，建设社会主义法治国家。",
        kp: "法理学/依法治国",
        difficulty: 4,
        score: 10,
        rubric: {
          v: 1,
          kind: "rubric",
          fullScore: 10,
          criteria: [
            { id: "c1", label: "法治体系要点", weight: 0.5 },
            { id: "c2", label: "法治国家要点", weight: 0.5 },
          ],
        },
      },
    ];

    it("buildSiyuanExamDocMarkdown 排版生成带折叠块答案与思源块属性的原生文档", () => {
      const qWithQuotes: Question = {
        id: 'q-"quote"-test',
        type: "single",
        stem: '测试带引号考点"物权法"',
        options: ["A", "B"],
        answer: "A",
        kp: '民法/"物权法"',
      };
      const docMd = buildSiyuanExamDocMarkdown("2026年考研高数与法理全真模考卷", [...testQuestions, qWithQuotes], {
        durationMinutes: 120,
        passLine: 60,
      });

      expect(docMd).toContain("# 📚 2026年考研高数与法理全真模考卷");
      expect(docMd).toContain('custom-exam-id="q-\\"quote\\"-test"');
      expect(docMd).toContain('custom-exam-kp="民法/\\"物权法\\""');
      expect(docMd).toContain("⏱️ 建议限时：**120 分钟**");
      expect(docMd).toContain("## 一、单项选择题");
      expect(docMd).toContain("## 二、简答论述题");
      // 答案折叠块
      expect(docMd).toContain("<details>");
      expect(docMd).toContain("参考答案与核心解析点拨（点击展开）");
      expect(docMd).toContain("`A`");
      expect(docMd).toContain("主观采分点细则");
      expect(docMd).toContain("</details>");
      // 思源块属性
      expect(docMd).toContain('{: custom-exam-id="q-sync-1"');
      expect(docMd).toContain('custom-exam-id="q-sync-2"');
    });

    it("cleanSiyuanDocMarkdown 兼容超级块、标题行前缀与任务列表勾选答案提取", async () => {
      const raw = `
{{{row
### 1. 下列属于行政行为的是（ ）。
- [ ] A. 气象局发布天气预报
- [x] B. 市场监管局吊销营业执照
- [ ] C. 机关采购办公电脑
- [ ] D. 街道办组织拔河比赛
}}}
      `;
      const report = await parseQuestionsFromSiyuanDoc(raw, {
        docId: "doc-admin-act",
        title: "行政法超级块笔记",
      });

      expect(report.ok.length).toBe(1);
      const q = report.ok[0];
      expect(q.stem).toContain("下列属于行政行为的是");
      expect(q.options.length).toBe(4);
      expect(q.answer).toBe("B");
    });

    it("parseQuestionsFromSiyuanDoc 在文档无标准试题时自动提取思源高亮挖空为填空题", async () => {
      const readingNote = `
# 刑法总论速记

在我国刑法中，==犯罪故意==是指明知自己的行为会发生危害社会的结果，并且希望或者放任这种结果发生的主观心理态度。
刑罚分为主刑和附加刑，主刑包括管制、拘役、有期徒刑、无期徒刑和==死刑==。
      `;

      const report = await parseQuestionsFromSiyuanDoc(readingNote, {
        docId: "doc-criminal-note",
        title: "刑法读书笔记",
        hpath: "/法学/刑法",
      });

      expect(report.ok.length).toBe(2);
      expect(report.ok[0].type).toBe("fill");
      expect(report.ok[0].answer).toBe("犯罪故意");
      expect(report.ok[1].type).toBe("fill");
      expect(report.ok[1].answer).toBe("死刑");
    });

    it("parseQuestionsFromSiyuanDoc 支持从 Markdown 表格自动提取选择题与生词填空题", async () => {
      const tableNote = `
# 经济法核心客观题汇总

| 题目 | 选项A | 选项B | 选项C | 选项D | 答案 | 解析 |
| 下列关于普通合伙企业的说法正确的是（ ）。 | 可以设立一人合伙 | 合伙人对债务承担无限连带责任 | 必须经全体合伙人决议解散 | 法人不得成为合伙人 | B | 依据合伙企业法第二条 |
| 根据证券法规定，公开发行证券必须符合法律规定并经（ ）核准或注册。 | 证券交易所 | 国务院证券监督管理机构 | 商务部 | 财政部 | B | 证券法第九条 |
      `;

      const report = await parseQuestionsFromSiyuanDoc(tableNote, {
        docId: "doc-econ-law",
        title: "经济法客观题表格",
      });

      expect(report.ok.length).toBe(2);
      expect(report.ok[0].type).toBe("single");
      expect(report.ok[0].options.length).toBe(4);
      expect(report.ok[0].answer).toBe("B");
      expect(report.ok[0].analysis).toContain("依据合伙企业法");
      expect(report.ok[1].answer).toBe("B");
    });

    it("cleanSiyuanDocMarkdown 兼容折叠问答块与粗体概念定义卡", async () => {
      const qaNote = `
# 民商法术语速查

<details>
<summary>什么是动产质权？</summary>
动产质权是指债务人或者第三人将其动产移交债权人占有，将该动产作为债权的担保。
</details>

**法定公积金**：公司分配当年税后利润时，应当提取利润的百分之十列入公司法定公积金。
      `;

      const report = await parseQuestionsFromSiyuanDoc(qaNote, {
        docId: "doc-qa-note",
        title: "民商法问答卡",
      });

      expect(report.ok.length).toBe(2);
      expect(report.ok[0].stem).toContain("什么是动产质权");
      expect(report.ok[0].answer).toContain("动产质权是指债务人");
      expect(report.ok[1].stem).toContain("法定公积金");
      expect(report.ok[1].answer).toContain("公司分配当年税后利润时");
    });

    it("parseQuestionsFromSiyuanDoc 处理纯日常日记等无试题文本时友好归一化错误，杜绝出现缺少ANSWER行报错", async () => {
      const dailyDiary = `
# 2026-10-27
今天天气晴朗，早上去图书馆借阅了两本书。
下午和团队讨论了产品设计方案，晚上整理了房间并早点休息。
`;
      const report = await parseQuestionsFromSiyuanDoc(dailyDiary, {
        docId: "doc-diary-20261027",
        title: "2026-10-27",
      });

      expect(report.ok.length).toBe(0);
      expect(report.errors.length).toBeGreaterThan(0);
      expect(report.errors[0].reason).toContain("未检测到题目内容");
      expect(report.errors[0].reason).not.toContain("缺少 ANSWER 行");
    });

    it("支持从思源笔记标签内容块（#考点#、#必考#）智能提取试题并保留源块链接", () => {
      const block1 = {
        id: "blk-tag-1",
        content: "#考点# 进程：拥有系统资源分配与保护的独立基本单位。",
        rootId: "doc-os",
        hpath: "/操作系统/第二章",
      };
      const block2 = {
        id: "blk-tag-2",
        content: "#必考# 什么是死锁？死锁是指两个或多个进程因争夺资源而无限等待。",
        rootId: "doc-os",
        hpath: "/操作系统/第二章",
      };

      const q1 = convertTaggedBlockToQuestion(block1, "考点");
      expect(q1).not.toBeNull();
      expect(q1?.stem).toContain("进程");
      expect(q1?.answer).toContain("拥有系统资源分配");
      expect(q1?.sourceBlockId).toBe("blk-tag-1");

      const q2 = convertTaggedBlockToQuestion(block2, "必考");
      expect(q2).not.toBeNull();
      expect(q2?.sourceBlockId).toBe("blk-tag-2");

      const report = buildReportFromTaggedBlocks([block1, block2], "考点");
      expect(report.ok.length).toBe(2);
      expect(report.duplicates).toBe(0);
    });
  });

  describe("3. 思源文档任务块状态反向同步回插件行动清单 (syncActionsFromDoc)", () => {
    it("思源文档任务块被勾选 - [x] 时反向同步将插件行动标记为 done", async () => {
      const sqlRows: Array<Record<string, unknown>> = [
        {
          id: "task-blk-1",
          root_id: "doc-journal-1",
          markdown: '- [x] 重练：算术/四则运算 · ((20261031100000-qblock1 "1+1等于几？"))',
          content: "重练：算术/四则运算",
          ial: '{: custom-exam-act-id="act-test-1"}',
          subtype: "t",
        },
      ];

      const transport: KernelTransport = {
        async post(endpoint, payload) {
          if (endpoint === "/api/query/sql") {
            const stmt = String((payload as any)?.stmt ?? "");
            if (stmt.includes("hpath='/小驴考试/03 备考行动与复盘日志'")) {
              return { code: 0, data: [{ id: "doc-journal-1" }] };
            }
            if (stmt.includes("custom-exam-act-id=")) {
              return { code: 0, data: sqlRows };
            }
          }
          return { code: 0, data: [] };
        },
      };

      const storage = new MemoryStorage();
      const app = new ExamApp({ client: new KernelApiClient(transport), storage });
      await app.init("d-t");

      // 预置行动项
      await app.addActions([
        { kind: "redo", qid: "q-1", detail: "重练：算术/四则运算" } as any,
      ]);
      const openBefore = await app.listOpenActions();
      expect(openBefore.length).toBe(1);
      const actId = openBefore[0].id;

      // 更新 mock 中的 action id
      sqlRows[0].ial = `{: custom-exam-act-id="${actId}"}`;

      // 执行反向同步
      const syncResult = await app.syncActionsFromDoc("nb-1");
      expect(syncResult.syncedCount).toBe(1);

      const openAfter = await app.listOpenActions();
      expect(openAfter.length).toBe(0);

      // 再次同步，幂等 0 项
      const syncAgain = await app.syncActionsFromDoc("nb-1");
      expect(syncAgain.syncedCount).toBe(0);
    });
  });
});
