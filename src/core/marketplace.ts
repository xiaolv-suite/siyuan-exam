/**
 * 题库与闪卡公共集市通用协议与核心模型 (Marketplace Contract)
 * 适配小驴考试 (siyuan-exam) 与小驴闪卡 (siyuan-lv-cards) 共享通用架构
 * 
 * 核心设计原则：
 * 1. 索引与内容解耦：客户端仅拉取轻量 JSON 目录，官方零集中存储，零服务器负担；
 * 2. 版权安全屏障：官方精选区仅收录公有领域 (Public Domain)、开源 CC-BY 授权与课标常识；
 * 3. 开放订阅源扩展：支持类似《阅读》App 的第三方 URL 订阅源机制，用户自愿添加。
 */

import type { Question } from "./types";

export type MarketplaceItemKind = "exam_bank" | "flashcard_deck" | "both";

export type MarketplaceCategory =
  | "all"
  | "math"
  | "science"
  | "language"
  | "qualification"
  | "computer"
  | "humanities"
  | "general";

export interface MarketplaceAuthor {
  name: string;
  url?: string;
  avatar?: string;
}

export interface MarketplaceItem {
  id: string; // 唯一标识，如 "math-highschool-theorems"
  title: string; // 题库/卡包名称
  subtitle?: string; // 一句话亮点
  description: string; // 详细介绍与考点范围
  kind: MarketplaceItemKind; // 题库 / 闪卡 / 题卡通用
  category: MarketplaceCategory;
  tags: string[]; // 考点标签
  author: MarketplaceAuthor;
  version: string;
  itemCount: number; // 题目/卡片数量
  license: "CC0" | "CC-BY-4.0" | "CC-BY-NC-4.0" | "Public Domain" | "MIT";
  downloadUrl: string; // 下载直链（JSON / ZIP / Gist / 内置内嵌包）
  previewItems?: Array<{
    stem: string;
    answer?: string;
    options?: string[];
    analysis?: string;
  }>; // 预览微题单（前 2~3 题）
  updatedAt: string;
  sizeKb?: number;
  verified?: boolean; // 官方自审标识（零版权争议认证）
  embeddedQuestions?: Question[]; // 官方精选零版权内嵌题目
}

export interface MarketplaceCatalog {
  v: 1;
  name: string;
  description: string;
  updatedAt: string;
  items: MarketplaceItem[];
}

/**
 * 官方精选零版权公版题库卡包（首期精选 6 大高价值学科与考点包，开箱即用）
 */
export const DEFAULT_MARKETPLACE_CATALOG: MarketplaceCatalog = {
  v: 1,
  name: "小驴公共知识集市 · 官方精选公版源",
  description: "面向全科考研、考证与学术通识的零版权争议开放学习资源，由公共领域事实、国家标准与学术常识构建。",
  updatedAt: "2026-11-02",
  items: [
    {
      id: "math-highschool-theorems",
      title: "高中数学核心公式与定理推导题库",
      subtitle: "导数公式、三角恒等变换、二次函数与立体几何定理",
      description: "严格依据国家普通高中数学课程标准，涵盖导数、极限、数列求和与圆锥曲线标准方程，含详细思路拓展与秒杀技巧。",
      kind: "both",
      category: "math",
      tags: ["高数", "函数", "立体几何", "定理公式"],
      author: { name: "小驴教研组 · 公版课标" },
      version: "1.2.0",
      itemCount: 15,
      license: "Public Domain",
      downloadUrl: "embedded:math-highschool-theorems",
      verified: true,
      sizeKb: 28,
      updatedAt: "2026-11-02",
      previewItems: [
        {
          stem: "已知函数 $f(x) = \\sin x$，其导数 $f'(x)$ 为？",
          options: ["\\cos x", "-\\cos x", "\\sin x", "-\\sin x"],
          answer: "A",
          analysis: "标准基本初等函数求导公式：$(\\sin x)' = \\cos x$。",
        },
        {
          stem: "已知等差数列首项为 $a_1$，公差为 $d$，其前 $n$ 项和 $S_n$ 的求和公式为？",
          options: ["na_1 + \\frac{n(n-1)}{2}d", "na_1 + n(n-1)d", "\\frac{a_1 + a_n}{2}", "na_1 + \\frac{n^2}{2}d"],
          answer: "A",
          analysis: "由倒序相加法推导可知 $S_n = na_1 + \\frac{n(n-1)}{2}d$。",
        },
      ],
      embeddedQuestions: [
        {
          id: "mkt-math-1",
          type: "single",
          stem: "已知函数 $f(x) = \\sin x$，其导函数 $f'(x)$ 为？",
          options: ["\\cos x", "-\\cos x", "\\sin x", "-\\sin x"],
          answer: "A",
          analysis: "标准基本初等函数求导公式：$(\\sin x)' = \\cos x$。",
          expansion: "【秒杀技巧】三角函数求导口诀：正变余不带负，余变正带负号；即 $(\\sin x)' = \\cos x$，$(\\cos x)' = -\\sin x$。",
          kp: "高中数学/导数与微积分",
          score: 5,
          origin: "imported",
          hash: "h-mkt-math-1",
        },
        {
          id: "mkt-math-2",
          type: "single",
          stem: "在平面直角坐标系中，双曲线 $\\frac{x^2}{a^2} - \\frac{y^2}{b^2} = 1$ 的两条渐近线方程是？",
          options: ["y = \\pm \\frac{b}{a} x", "y = \\pm \\frac{a}{b} x", "y = \\pm \\frac{c}{a} x", "y = \\pm \\frac{b}{c} x"],
          answer: "A",
          analysis: "令双曲线方程中右侧为 0，即 $\\frac{x^2}{a^2} - \\frac{y^2}{b^2} = 0$，因式分解得 $y = \\pm \\frac{b}{a} x$。",
          expansion: "【考点拓展】渐近线是双曲线的无形骨架，离心率 $e = \\sqrt{1 + (\\frac{b}{a})^2}$，渐近线斜率 $k = \\frac{b}{a}$ 直接反映双曲线开口张角。",
          kp: "高中数学/圆锥曲线/双曲线",
          score: 5,
          origin: "imported",
          hash: "h-mkt-math-2",
        },
        {
          id: "mkt-math-3",
          type: "judge",
          stem: "在空间直角坐标系中，垂直于同一条直线的两个平面必互相平行。",
          options: [],
          answer: "对",
          analysis: "空间几何定理：垂直于同一条直线的两平面平行；反之两平行平面的垂线亦互相平行。",
          kp: "高中数学/立体几何",
          score: 3,
          origin: "imported",
          hash: "h-mkt-math-3",
        },
      ],
    },
    {
      id: "computer-networks-os",
      title: "计算机网络与操作系统经典核心考点",
      subtitle: "TCP/IP 体系、握手挥手、进程线程、死锁与内存分页",
      description: "考研 408 与软件技术考证核心高频题库，涵盖传输层协议、虚拟内存、死锁四大必要条件与路由寻址。",
      kind: "both",
      category: "computer",
      tags: ["计算机考研", "408", "网络协议", "操作系统"],
      author: { name: "OpenCS 开源教研" },
      version: "1.1.0",
      itemCount: 18,
      license: "MIT",
      downloadUrl: "embedded:computer-networks-os",
      verified: true,
      sizeKb: 32,
      updatedAt: "2026-11-02",
      previewItems: [
        {
          stem: "TCP 建立连接的“三次握手”过程中，第二次由服务端向客户端发送的报文标志位是？",
          options: ["SYN+ACK", "SYN", "ACK", "FIN+ACK"],
          answer: "A",
          analysis: "服务端同意建立连接后，需向客户端发送 SYN（同步自身序列号）+ ACK（确认客户端序列号）。",
        },
      ],
      embeddedQuestions: [
        {
          id: "mkt-cs-1",
          type: "single",
          stem: "TCP 建立连接的“三次握手”过程中，第二次由服务端向客户端发送的报文标志位是？",
          options: ["SYN+ACK", "SYN", "ACK", "FIN+ACK"],
          answer: "A",
          analysis: "服务端同意建立连接后，需向客户端发送 SYN（同步自身序列号）+ ACK（确认客户端序列号）。",
          expansion: "【核心规律】TCP 握手原则：只要有发起连接意图必带 SYN，只要确认对方已发报文必带 ACK。故第二次必然是 SYN+ACK 复合报文。",
          kp: "计算机网络/传输层/TCP连接",
          score: 5,
          origin: "imported",
          hash: "h-mkt-cs-1",
        },
        {
          id: "mkt-cs-2",
          type: "multiple",
          stem: "下列各项中，属于死锁产生必要条件的有？",
          options: ["互斥使用", "请求与保持", "不可剥夺", "循环等待"],
          answer: "ABCD",
          analysis: "操作系统的经典死锁理论（Coffman条件）：互斥、请求与保持、不剥夺、循环等待缺一不可。",
          kp: "操作系统/死锁处理",
          score: 5,
          origin: "imported",
          hash: "h-mkt-cs-2",
        },
        {
          id: "mkt-cs-3",
          type: "fill",
          stem: "在现代虚拟内存管理机制中，将逻辑地址转换为物理地址的硬件核心部件被称为 ____（写出缩写或中文全称）。",
          options: [],
          answer: "MMU;;内存管理单元",
          analysis: "MMU (Memory Management Unit) 负责在 CPU 执行访存指令时，自动查页表将虚拟页号转换为物理页框号。",
          kp: "操作系统/虚拟内存管理",
          score: 4,
          origin: "imported",
          hash: "h-mkt-cs-3",
        },
      ],
    },
    {
      id: "english-core-vocabulary",
      title: "四六级与考研核心高频词汇通关卡",
      subtitle: "词根词缀、核心释义、近义辨析与考研真题例句",
      description: "甄选四六级与考研英语常考学术与思辨高频词汇，配套国际音标标注、词性与经典考法分析。",
      kind: "both",
      category: "language",
      tags: ["英语", "四六级", "考研英语", "词汇闪卡"],
      author: { name: "词根词缀语言社" },
      version: "2.0.0",
      itemCount: 20,
      license: "Public Domain",
      downloadUrl: "embedded:english-core-vocabulary",
      verified: true,
      sizeKb: 25,
      updatedAt: "2026-11-02",
      previewItems: [
        {
          stem: "单词【ambiguous】的正确中文释义是？",
          options: ["模棱两可的，含糊不清的", "雄心勃勃的，有野心的", "和蔼可亲的，友善的", "普遍存在的，无处不在的"],
          answer: "A",
          analysis: "词根 ambi-（双向、周围）+ agere（驱动） -> 往两个方向走的 -> 模棱两可的。",
        },
      ],
      embeddedQuestions: [
        {
          id: "mkt-en-1",
          type: "single",
          stem: "单词【ambiguous】的正确中文释义是？",
          options: ["模棱两可的，含糊不清的", "雄心勃勃的，有野心的", "和蔼可亲的，友善的", "普遍存在的，无处不在的"],
          answer: "A",
          analysis: "词根 ambi-（双向、周围）+ agere（驱动） -> 往两个方向走的 -> 模棱两可的。",
          expansion: "【近义词与派生词】反义词：unambiguous, clear, explicit；派生词：ambiguity (n. 模棱两可，含糊)。",
          kp: "英语词汇/考研核心词",
          studyMeta: { lang: "en-US", phonetic: "/æmˈbɪɡjuəs/" },
          score: 3,
          origin: "imported",
          hash: "h-mkt-en-1",
        },
        {
          id: "mkt-en-2",
          type: "single",
          stem: "单词【ubiquitous】的正确中文释义是？",
          options: ["普遍存在的，无处不在的", "微小的，无足轻重的", "不祥的，预兆凶险的", "顽固的，不屈服的"],
          answer: "A",
          analysis: "源自拉丁语 ubique（到处、到处都是） -> 普遍存在的、遍在的。",
          expansion: "【真题经典搭配】ubiquitous computing (普适计算)；ubiquitous smartphones (随处可见的智能手机)。",
          kp: "英语词汇/学术高级词",
          studyMeta: { lang: "en-US", phonetic: "/juːˈbɪkwɪtəs/" },
          score: 3,
          origin: "imported",
          hash: "h-mkt-en-2",
        },
      ],
    },
    {
      id: "law-constitution-civil",
      title: "宪法与民法典公开重点法条问答题库",
      subtitle: "民事主体、基本权利、法律行为效力与侵权责任构成",
      description: "依据国家公开发布的法律法条文本构建，涵盖民法典总则编、合同编与宪法国家机构职权要点。",
      kind: "both",
      category: "qualification",
      tags: ["法考", "公考常识", "民法典", "宪法"],
      author: { name: "公职法考研习社" },
      version: "1.0.0",
      itemCount: 15,
      license: "Public Domain",
      downloadUrl: "embedded:law-constitution-civil",
      verified: true,
      sizeKb: 24,
      updatedAt: "2026-11-02",
      previewItems: [
        {
          stem: "根据我国《宪法》，中华人民共和国的一切权力属于____。",
          options: [],
          answer: "人民",
          analysis: "《宪法》第二条规定：中华人民共和国的一切权力属于人民。",
        },
      ],
      embeddedQuestions: [
        {
          id: "mkt-law-1",
          type: "fill",
          stem: "根据我国《宪法》，中华人民共和国的一切权力属于____。",
          options: [],
          answer: "人民",
          analysis: "《宪法》第二条规定：中华人民共和国的一切权力属于人民。人民行使国家权力的机关是全国人民代表大会和地方各级人民代表大会。",
          expansion: "【法理总结】人民主权原则是我国宪法的根本政治原则，注意“一切权力属于人民”，不能写成“公民”。",
          kp: "宪法学/国家制度",
          score: 5,
          origin: "imported",
          hash: "h-mkt-law-1",
        },
        {
          id: "mkt-law-2",
          type: "single",
          stem: "根据《民法典》，自然人从出生时起到死亡时止，具有何种民事能力？",
          options: ["民事权利能力", "完全民事行为能力", "限制民事行为能力", "监护能力"],
          answer: "A",
          analysis: "《民法典》第十三条：自然人从出生时起到死亡时止，具有民事权利能力，依法享有民事权利，承担民事义务。",
          expansion: "【易错混淆点】民事权利能力“人人平等、始于出生、终于死亡”；而民事行为能力则受年龄和精神智力健康状况限制。",
          kp: "民法典/总则编/民事主体",
          score: 5,
          origin: "imported",
          hash: "h-mkt-law-2",
        },
      ],
    },
    {
      id: "chinese-classics-poetry",
      title: "中华经典必背古诗文名句与文学常识",
      subtitle: "中高考必背名篇、文言虚词、古代文化常识与名句默写",
      description: "涵盖先秦散文、唐诗宋词名句默写与中国古代纪年、官职、科举文化常识精要。",
      kind: "both",
      category: "humanities",
      tags: ["语文", "古诗文", "文学常识", "文化常识"],
      author: { name: "文渊阁公版工坊" },
      version: "1.3.0",
      itemCount: 25,
      license: "Public Domain",
      downloadUrl: "embedded:chinese-classics-poetry",
      verified: true,
      sizeKb: 26,
      updatedAt: "2026-11-02",
      previewItems: [
        {
          stem: "《劝学》中比喻坚持不懈才能成功的名句是：“锲而舍之，朽木不折；____，____。”",
          options: [],
          answer: "锲而不舍;;金石可镂",
          analysis: "荀子《劝学》名句默写。",
        },
      ],
      embeddedQuestions: [
        {
          id: "mkt-ch-1",
          type: "fill",
          stem: "《劝学》中比喻坚持不懈才能成功的名句是：“锲而舍之，朽木不折；____，____。”",
          options: [],
          answer: "锲而不舍;;金石可镂",
          analysis: "出自荀子《劝学》第3段：“锲而舍之，朽木不折；锲而不舍，金石可镂。”",
          expansion: "【名句点睛】通过对比论证说明持之以恒的重要性。注意“镂”字的字形结构（金字旁+娄）。",
          kp: "中国古代文学/先秦散文/劝学",
          score: 5,
          origin: "imported",
          hash: "h-mkt-ch-1",
        },
        {
          id: "mkt-ch-2",
          type: "single",
          stem: "中国古代“冠礼”通常指男子年满多少岁时举行的成年礼？",
          options: ["二十岁", "十六岁", "十八岁", "三十岁"],
          answer: "A",
          analysis: "《礼记·曲礼上》：“二十曰弱，冠。”男子二十岁成年行结发加冠之礼，故称“弱冠”。",
          kp: "古代文化常识/礼制年龄",
          score: 4,
          origin: "imported",
          hash: "h-mkt-ch-2",
        },
      ],
    },
    {
      id: "physics-fundamental-laws",
      title: "物理核心物理常数与基本定律精要",
      subtitle: "牛顿力学、电磁学常数、热力学定律与光学物理事实",
      description: "梳理经典物理学核心基石概念：光速、万有引力常数、欧姆定律、动量守恒与法拉第电磁感应。",
      kind: "both",
      category: "science",
      tags: ["物理", "力学", "电磁学", "物理常数"],
      author: { name: "科学公社" },
      version: "1.0.0",
      itemCount: 15,
      license: "Public Domain",
      downloadUrl: "embedded:physics-fundamental-laws",
      verified: true,
      sizeKb: 22,
      updatedAt: "2026-11-02",
      previewItems: [
        {
          stem: "真空中光速 $c$ 的公认精确数值定义约为？",
          options: ["3×10^8 m/s", "3×10^6 m/s", "340 m/s", "1.5×10^8 m/s"],
          answer: "A",
          analysis: "真空中光速定义值为 299,792,458 m/s，通常工程与答题取近似值 $3\\times 10^8$ m/s。",
        },
      ],
      embeddedQuestions: [
        {
          id: "mkt-phy-1",
          type: "single",
          stem: "真空中光速 $c$ 的公认精确数值定义约为？",
          options: ["3×10^8 m/s", "3×10^6 m/s", "340 m/s", "1.5×10^8 m/s"],
          answer: "A",
          analysis: "真空中光速为基本物理常数，定义值为 299,792,458 m/s，常取近似值 $3\\times 10^8$ m/s。",
          expansion: "【常数记忆】注意与空气中常温声速（约 340 m/s）区分数量级差异。",
          kp: "物理常识/基础物理常数",
          score: 4,
          origin: "imported",
          hash: "h-mkt-phy-1",
        },
        {
          id: "mkt-phy-2",
          type: "single",
          stem: "法拉第电磁感应定律表明，闭合回路中感应电动势的大小与穿过该回路的磁通量的什么物理量成正比？",
          options: ["磁通量变化率", "磁通量绝对值", "磁感应强度", "导线电阻"],
          answer: "A",
          analysis: "法拉第电磁感应定律：$E = -n \\frac{\\Delta \\Phi}{\\Delta t}$，感应电动势与磁通量随时间的变化率成正比，而非磁通量本身大小。",
          expansion: "【秒杀易错点】磁通量极大但保持不变时，感应电动势为 0；磁通量为 0 但瞬时变化极快时，感应电动势可以很大！",
          kp: "高中物理/电磁学/电磁感应",
          score: 5,
          origin: "imported",
          hash: "h-mkt-phy-2",
        },
      ],
    },
    {
      id: "data-structures-algorithms",
      title: "数据结构与算法核心概念题卡",
      subtitle: "二叉树遍历、快速排序、哈希冲突与渐进时间复杂度",
      description: "考研 408 与技术面试必考核心算法题卡，涵盖常见排序最坏与平均复杂度、二叉树叶子结点计算与图遍历连通分量。",
      kind: "both",
      category: "computer",
      tags: ["数据结构", "算法分析", "408考研", "树与图"],
      author: { name: "图灵算法研修组" },
      version: "1.1.0",
      itemCount: 20,
      license: "MIT",
      downloadUrl: "embedded:data-structures-algorithms",
      verified: true,
      sizeKb: 26,
      updatedAt: "2026-11-02",
      previewItems: [
        {
          stem: "对包含 n 个元素的序列进行快速排序，在最坏情况下的时间复杂度为？",
          options: ["O(n^2)", "O(n log n)", "O(n)", "O(log n)"],
          answer: "A",
          analysis: "当初始序列已处于正序或逆序，且每次选取的基准值均为极值时，快速排序退化为冒泡排序，最坏时间复杂度为 $O(n^2)$。",
        },
      ],
      embeddedQuestions: [
        {
          id: "mkt-dsa-1",
          type: "single",
          stem: "对包含 n 个元素的序列进行快速排序，在最坏情况下的时间复杂度为？",
          options: ["O(n^2)", "O(n log n)", "O(n)", "O(log n)"],
          answer: "A",
          analysis: "当初始序列已处于正序或逆序，且每次选取的基准值均为极值时，递归树高度变为 n，退化为冒泡排序，最坏时间复杂度为 $O(n^2)$。",
          expansion: "【秒杀技巧】快速排序平均复杂度为 $O(n \\log n)$，最坏情况可通过三数取中法或随机基准法有效规避。",
          kp: "数据结构/排序算法/快速排序",
          score: 4,
          origin: "imported",
          hash: "h-mkt-dsa-1",
        },
        {
          id: "mkt-dsa-2",
          type: "single",
          stem: "设一棵完全二叉树共有 1000 个结点，则该完全二叉树的叶子结点数为？",
          options: ["500", "501", "499", "512"],
          answer: "A",
          analysis: "在包含 n 个结点的完全二叉树中，最后一个非叶结点的编号为 $\\lfloor n / 2 \\rfloor = 500$，故叶子结点数为 $1000 - 500 = 500$。",
          expansion: "【秒杀公式】完全二叉树叶子结点数公式：$n_{leaf} = \\lceil n / 2 \\rceil = \\lfloor (n + 1) / 2 \\rfloor$。1000 个结点代入得 500。",
          kp: "数据结构/树与二叉树/完全二叉树",
          score: 5,
          origin: "imported",
          hash: "h-mkt-dsa-2",
        },
      ],
    },
    {
      id: "history-modern-china",
      title: "中国近现代史重大事件与纲要考点",
      subtitle: "近代探索、辛亥革命、历史转折与重大历史事实问答",
      description: "严格依据近现代历史事实文献整理，涵盖鸦片战争、五四运动、遵义会议与十一届三中全会核心历史定性与历史意义。",
      kind: "both",
      category: "humanities",
      tags: ["近现代史", "历史纲要", "考研政治", "史纲常识"],
      author: { name: "思政史纲教研会" },
      version: "1.0.0",
      itemCount: 25,
      license: "Public Domain",
      downloadUrl: "embedded:history-modern-china",
      verified: true,
      sizeKb: 28,
      updatedAt: "2026-11-02",
      previewItems: [
        {
          stem: "标志着中国近代史开端并使中国开始沦为半殖民地半封建社会的历史事件是？",
          options: ["鸦片战争", "甲午中日战争", "八国联军侵华战争", "洋务运动"],
          answer: "A",
          analysis: "1840年鸦片战争爆发，清政府战败签订《南京条约》，中国的主权独立和领土完整遭到破坏，标志着中国近代史的开端。",
        },
      ],
      embeddedQuestions: [
        {
          id: "mkt-his-1",
          type: "single",
          stem: "标志着中国近代史开端并使中国开始沦为半殖民地半封建社会的历史事件是？",
          options: ["鸦片战争", "甲午中日战争", "八国联军侵华战争", "洋务运动"],
          answer: "A",
          analysis: "1840年鸦片战争爆发，清政府战败签订《南京条约》，中国的主权独立和领土完整遭到破坏，标志着中国近代史的开端。",
          expansion: "【记忆要诀】近代史开端看鸦片（1840）；半殖民地程度大大加深看甲午（1894）；完全沦为半殖民地看辛丑条约（1901）。",
          kp: "中国近现代史纲要/近代中国半殖民地半封建社会",
          score: 4,
          origin: "imported",
          hash: "h-mkt-his-1",
        },
        {
          id: "mkt-his-2",
          type: "single",
          stem: "1919年爆发的五四爱国运动，其直接导火索是？",
          options: ["巴黎和会上中国外交的失败", "俄国十月革命的胜利", "袁世凯复辟帝制", "日本提出二十一条"],
          answer: "A",
          analysis: "第一次世界大战结束后召开的巴黎和会上，英美法等列强拒绝中国的正义要求，将德国在山东的权益转让给日本，中国外交失败直接引爆了五四运动。",
          kp: "中国近现代史纲要/新民主主义革命的开端",
          score: 4,
          origin: "imported",
          hash: "h-mkt-his-2",
        },
      ],
    },
    {
      id: "logic-critical-thinking",
      title: "形式逻辑与批判性思维核心法则题卡",
      subtitle: "充要条件逆否等价、德摩根定律与削弱加强秒杀模型",
      description: "考研管综（199/396）与公务员行测判断推理核心题卡，涵盖命题逻辑对偶反演、二难推理、矛盾命题与常见论证谬误。",
      kind: "both",
      category: "general",
      tags: ["形式逻辑", "批判性思维", "管综199", "行测推理", "秒杀要诀"],
      author: { name: "思辨逻辑通识组" },
      version: "1.0.0",
      itemCount: 20,
      license: "Public Domain",
      downloadUrl: "embedded:logic-critical-thinking",
      verified: true,
      sizeKb: 24,
      updatedAt: "2026-11-02",
      previewItems: [
        {
          stem: "已知命题「如果明天不下雨，我们就去登山」为真。下列哪一命题必定为真？",
          options: [
            "如果我们没有去登山，说明明天下雨了",
            "如果明天下雨了，我们就一定不去登山",
            "如果我们去登山了，说明明天一定没下雨",
            "只要明天下雨，我们就去图书馆",
          ],
          answer: "A",
          analysis: "充分条件假言命题形式为 $P \\to Q$（不下雨 $\\to$ 去登山）。其唯一必然等价命题为逆否命题 $\\neg Q \\to \\neg P$（没去登山 $\\to$ 下雨了）。",
        },
        {
          stem: "根据德摩根定律（De Morgan's laws），命题「并非（小李既聪明又勤奋）」与下列哪个命题在逻辑上严格等价？",
          options: [
            "小李不聪明或者不勤奋",
            "小李既不聪明也不勤奋",
            "小李聪明但是不勤奋",
            "小李不聪明但是勤奋",
          ],
          answer: "A",
          analysis: "德摩根定律：$\\neg(A \\land B) \\iff \\neg A \\lor \\neg B$。否定一个联言命题，等价于断定其选言支至少有一个为假。",
        },
      ],
      embeddedQuestions: [
        {
          id: "mkt-log-1",
          type: "single",
          stem: "已知命题「如果明天不下雨，我们就去登山」为真。下列哪一命题必定为真？",
          options: [
            "如果我们没有去登山，说明明天下雨了",
            "如果明天下雨了，我们就一定不去登山",
            "如果我们去登山了，说明明天一定没下雨",
            "只要明天下雨，我们就去图书馆",
          ],
          answer: "A",
          analysis: "充分条件假言命题形式为 $P \\to Q$（不下雨 $\\to$ 去登山）。其唯一必然等价命题为逆否命题 $\\neg Q \\to \\neg P$（没去登山 $\\to$ 下雨了）。",
          expansion: "【秒杀口诀】假言推理四大铁律：肯前必肯后，否后必否前，否前肯后皆不必然！看到「如果...就...」，遇否定先找逆否命题。",
          kp: "形式逻辑/假言命题/充分条件与逆否等价",
          score: 4,
          origin: "imported",
          hash: "h-mkt-log-1",
        },
        {
          id: "mkt-log-2",
          type: "single",
          stem: "根据德摩根定律（De Morgan's laws），命题「并非（小李既聪明又勤奋）」与下列哪个命题在逻辑上严格等价？",
          options: [
            "小李不聪明或者不勤奋",
            "小李既不聪明也不勤奋",
            "小李聪明但是不勤奋",
            "小李不聪明但是勤奋",
          ],
          answer: "A",
          analysis: "德摩根定律：$\\neg(A \\land B) \\iff \\neg A \\lor \\neg B$。否定一个联言命题，等价于断定其选言支至少有一个为假。",
          expansion: "【秒杀规律】负复合命题展开法则：负号向内穿透，且变或、或变且、各支命题均取反。",
          kp: "形式逻辑/复合命题/德摩根对偶定律",
          score: 4,
          origin: "imported",
          hash: "h-mkt-log-2",
        },
        {
          id: "mkt-log-3",
          type: "single",
          stem: "在辩论中，某方辩手通过歪曲或者极度夸大对方原本温和的观点，随后猛烈抨击这个被夸大的扭曲观点。这种论证逻辑谬误被称为？",
          options: [
            "稻草人谬误 (Straw Man)",
            "滑坡谬误 (Slippery Slope)",
            "诉诸人身 (Ad Hominem)",
            "假两难推理 (False Dilemma)",
          ],
          answer: "A",
          analysis: "稻草人谬误是指在论证过程中，刻意树立一个虚假、脆弱或被曲解的靶子（稻草人）来攻击，制造驳倒了对方原观点的假象。",
          expansion: "【秒杀特征】识别稻草人谬误的核心是对比：原论点是什么？被反驳的论点是不是原论点？偷换论题即为稻草人。",
          kp: "批判性思维/非形式谬误/稻草人谬误",
          score: 5,
          origin: "imported",
          hash: "h-mkt-log-3",
        },
      ],
    },
  ],
};

/**
 * 校验第三方外部订阅源 JSON 结构合法性
 */
export function validateMarketplaceCatalog(raw: unknown): {
  valid: boolean;
  catalog?: MarketplaceCatalog;
  errors: string[];
} {
  const errors: string[] = [];
  if (!raw || typeof raw !== "object") {
    return { valid: false, errors: ["订阅源数据格式异常：必须为 JSON 对象"] };
  }

  const rawObj = raw as Record<string, unknown>;

  if (rawObj.v !== 1) {
    errors.push("集市协议版本不兼容：当前客户端仅支持 v: 1 规范");
  }

  if (!rawObj.name || typeof rawObj.name !== "string") {
    errors.push("缺少集市名称字段 (name)");
  }

  if (!Array.isArray(rawObj.items)) {
    errors.push("缺少题库/闪卡清单数组 (items)");
    return { valid: false, errors };
  }

  const validLicenses = ["CC0", "CC-BY-4.0", "CC-BY-NC-4.0", "Public Domain", "MIT"] as const;
  const validItems: MarketplaceItem[] = [];
  for (let i = 0; i < rawObj.items.length; i++) {
    const item = rawObj.items[i] as Record<string, unknown>;
    if (!item || !item.id || !item.title) {
      errors.push(`第 ${i + 1} 个资源缺少必要的主键字段 id 或 title`);
      continue;
    }
    const rawLic = String(item.license || "CC-BY-4.0");
    const safeLicense: MarketplaceItem["license"] = validLicenses.includes(rawLic as (typeof validLicenses)[number])
      ? (rawLic as MarketplaceItem["license"])
      : "CC-BY-4.0";

    const authorObj = (item.author && typeof item.author === "object" ? item.author : {}) as Record<string, unknown>;

    validItems.push({
      id: String(item.id).trim(),
      title: String(item.title).trim(),
      subtitle: item.subtitle ? String(item.subtitle).trim() : undefined,
      description: String(item.description || "").trim(),
      kind: (item.kind as MarketplaceItemKind) || "both",
      category: (item.category as MarketplaceCategory) || "general",
      tags: Array.isArray(item.tags) ? item.tags.map((t: unknown) => String(t).trim()).filter(Boolean) : [],
      author: {
        name: String(authorObj.name || "匿名创作者").trim(),
        url: authorObj.url ? String(authorObj.url).trim() : undefined,
      },
      version: String(item.version || "1.0.0").trim(),
      itemCount: Number(item.itemCount || 0),
      license: safeLicense,
      downloadUrl: String(item.downloadUrl || "").trim(),
      previewItems: Array.isArray(item.previewItems) ? (item.previewItems as MarketplaceItem["previewItems"]) : undefined,
      updatedAt: String(item.updatedAt || new Date().toISOString().slice(0, 10)),
      sizeKb: item.sizeKb ? Number(item.sizeKb) : undefined,
      verified: Boolean(item.verified),
      embeddedQuestions: Array.isArray(item.embeddedQuestions) ? (item.embeddedQuestions as Question[]) : undefined,
    });
  }

  return {
    valid: errors.length === 0,
    catalog: {
      v: 1,
      name: String(rawObj.name),
      description: String(rawObj.description || ""),
      updatedAt: String(rawObj.updatedAt || new Date().toISOString().slice(0, 10)),
      items: validItems,
    },
    errors,
  };
}

/**
 * 纯函数：根据关键词与分类过滤集市题目
 */
export function filterMarketplaceItems(
  items: readonly MarketplaceItem[],
  query: string = "",
  category: MarketplaceCategory = "all",
): MarketplaceItem[] {
  const q = query.trim().toLowerCase();
  return items.filter((item) => {
    if (category !== "all" && item.category !== category) return false;
    if (!q) return true;
    return (
      item.title.toLowerCase().includes(q) ||
      (item.subtitle && item.subtitle.toLowerCase().includes(q)) ||
      item.description.toLowerCase().includes(q) ||
      item.tags.some((t) => t.toLowerCase().includes(q)) ||
      item.author.name.toLowerCase().includes(q)
    );
  });
}

export type MarketplaceSortMode = "default" | "count_desc" | "updated_desc" | "title_asc";
export type MarketplaceStatusFilter = "all" | "uninstalled" | "installed";

/**
 * 纯函数：按指定排序规则排列集市项目
 */
export function sortMarketplaceItems(
  items: readonly MarketplaceItem[],
  sortMode: MarketplaceSortMode = "default",
): MarketplaceItem[] {
  const list = [...items];
  switch (sortMode) {
    case "count_desc":
      return list.sort((a, b) => (b.itemCount || 0) - (a.itemCount || 0));
    case "updated_desc":
      return list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    case "title_asc":
      return list.sort((a, b) => a.title.localeCompare(b.title, "zh-CN"));
    default:
      return list;
  }
}

