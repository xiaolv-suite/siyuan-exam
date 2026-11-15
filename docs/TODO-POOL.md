# 小驴考试（siyuan-exam）当前待办池

> 唯一当前状态入口：[CURRENT-STATUS.md](CURRENT-STATUS.md)。下列历史基线、完成数量与版本不自动代表当前源码/安装/发布；未勾选项应先与当前实现对账。

- **建立日期**：2026-10-31
- **当前执行状态（核心闭环收敛后）**：
  - ✅ **已闭环**：`POOL-UI-01`、`POOL-UI-02`、`POOL-FUNC-01`、`POOL-FUNC-02`、`POOL-FUNC-03`、`POOL-FUNC-07`（`FlowDwellTracker` 死代码与白噪音一并清退，考点预露与受助提示跨重载持久化闭环，同时修复 `replayer.ts` 受助答对不计入错题消灭）。
  - 🗑️ **已按减法删除**：`POOL-FUNC-08`（6 组界面不可达孤立引擎已随功能冻结一并删除，不再排期接线）。
  - ⏸️ **暂缓等待真实反馈**：其余条目（`POOL-FUNC-04`、`POOL-FUNC-05`、`POOL-FUNC-06`、`POOL-UI-03` ~ `POOL-UI-08`）一律冻结，待 3–5 名真实用户使用两周（见 [BETA-TESTING.md](BETA-TESTING.md)）后按真实反馈重排优先级。
- **原排查统计留底**：
  - **UI 审查**：共查出 12 项具体问题，归并为 8 条 UI 待办（`POOL-UI-01` ~ `POOL-UI-08`）；
  - **功能实现审查**：枚举 138 个交互入口，其中 3 项受平台限制（`LIMIT-01` ~ `LIMIT-03`），其余归并为 8 条功能待办（`POOL-FUNC-01` ~ `POOL-FUNC-08`）。

---

## 一、 全量界面交互入口盘点与三态验证总表（覆盖一级 / 二级 / 三级）

对插件内全部按钮、菜单项、命令面板命令、键盘快捷键、设置项、拖拽区与右键菜单进行逐级枚举和行为确认，并对判定为「已实现且可用」的功能逐一核验 **「输入 → 处理 → 持久化 → 重载后仍在 → 异常后可恢复」** 完整五步链路：

### 1.1 宿主级入口、右键菜单、快捷键与 18 项插件设置

| 入口层级与位置 | 具体入口项 | 三态判定 | 五步全链路核验结果与异常点（断链项入池编号） |
| :--- | :--- | :--- | :--- |
| **一级：思源顶栏 / 命令 / 页签** | 顶栏图标（打开练习台）、全局快捷键 `⌥⌘P`（练习台）/ `⌥⌘M`（模考场）/ `⌥⌘R`（报告中心）/ `⌥⌘E`（错题本） | 已实现且可用 | 五步链路完整；`TabAppRegistry` 按页签实例隔离，重载恢复不串页签。 |
| **一级：全局命令面板 (`⌘K / Ctrl+K`)** | 练习台 13 条命令、模考场 5 条命令、报告中心 5 条命令（切换视图、开始快刷/背诵、同步文档、复制今日战报、恢复默认设置等） | 已实现且可用 | 输入过滤、键盘上下选择、回车执行、Esc 关闭归还焦点均完整。 |
| **二级：思源编辑器块菜单 (`onBlockIconEvent`)** | ① 查询块「加入练习集」<br>② 普通块「用此块 AI 出题」<br>③ 题目块「加入练习集 / 转闪卡 / 标记考点 / 编辑 / 在练习台打开」 | 已实现且可用 | 五步链路完整；跨库自动定位题目块，标记考点经 `SaveGate` 写入块属性。 |
| **二级：思源图片右键菜单 (`onImageMenu`)** | 正文图片右键「用小驴考试识别试题入库」 | 已实现且可用 | 调用内核 `/api/asset/ocr` 识别后以 `draft` 草稿写入题库并打开内联编辑表单（无库时存入录题草稿）。 |
| **二级：思源原生闪卡复习钩子 (`onFlashcardAction`)** | 在思源内置闪卡界面复习题目块时自动同步作答记录（`mode: "flashcard_sync"`） | 已实现且可用 | 自动追加 `AttemptEvent` 并节流落盘。 |
| **二级：插件设置面板 (`SettingUtils` 18 项)** | 考期与目标（4 项）、做题偏好（5 项）、算法调度（1 项）、AI 智能体（4 项）、语音音效（3 项）、生态联动（2 项） | 已实现且可用 | 18 项设置经 `SettingUtils` 持久化，`PracticeTab` 读取生效。**断链点**：做题会话内切换音效开关未回写 `SettingUtils`（入池 `POOL-FUNC-03`）。 |

### 1.2 练习台（`PracticeTab`）全部子视图与二/三级抽屉、弹窗入口

| 视图 / 面板层级 | 涵盖入口（按钮 / 下拉 / 拖拽 / 快捷键） | 三态判定 | 五步全链路核验结果与异常点（断链项入池编号） |
| :--- | :--- | :--- | :--- |
| **一级：导航侧栏 (`Rail`) 与顶栏 (`.block__icons`)** | 5 项主任务导航（今日/题库/出题/模考/复盘）、6 项子视图导航、紧凑态「快捷行动」浮层菜单、窄屏汉堡菜单抽屉、题库下拉切换、「题库管理中心」弹窗、学员/教师角色切换 | 已实现且可用 | **UI 缺陷**：① `Rail.svelte:554` 断点写为 `1080px` 而非 `1119px`，导致 `1081–1119px` 区间 72px 窄侧栏内文字未隐藏（入池 `POOL-UI-02`）；② 390px 下顶栏折成 5 行占高 218px（入池 `POOL-UI-03`）。 |
| **二级：题库管理中心弹窗 (`BankGalleryModal`)** | 6 类场景分类 Tab、关键词过滤、新建空库、6 类示范题库一键创建、重命名、切换分类、同步为文档、移出题库 | 已实现且可用 | 建库、改名、分类、删库持久化完整。**UI 缺陷**：弹窗无 `Tab` 焦点锁、`inert` 背景隔离与关闭焦点归还（入池 `POOL-UI-05`）。 |
| **一级：今日驾驶舱 (`EntryStudioView` · 学员模式)** | 艾宾浩斯临界抢救横幅、今日计划深色主卡（「开始今日练习」）、近 7 日节奏卡、6 大训练模式卡（快速刷题/每日一练/错题攻坚/纸面背诵/考前冲刺/收藏精练）、底部工具栏 | 已实现且可用（**含部分断链**） | **断链点**：① 首页初始化 `rebuildPlan()` 未传入 `dueQuestions`，导致今日计划卡不展示 FSRS 到期闪卡，且「每日一练」硬编码传入空到期列表 `[]`（入池 `POOL-FUNC-05`）；② 「考前冲刺」仍调旧版 `cramDrill` 而非 `emergencyCramDrill`（入池 `POOL-FUNC-05`）；③ 未提供 `createAdaptiveTargetSession`（CAT 自适应抽题）入口（入池 `POOL-FUNC-08`）。 |
| **一级：教师教研工作台 (`TeacherWorkspaceView` · 教师模式)** | 模块一（打印 A4 双栏卷 / 导出教师讲义 / 打印课后作业单 / 查看试题诊断）、模块二（6 个工坊导航卡）、模块三（同步题册至思源 / 复制挑战码 / 导入挑战码 / 导出备份包） | 已实现且可用（**含部分断链**） | **断链点**：① 点击「查看试题诊断」仅打开报告页默认概览，未切至 `quality` 区分度分面（入池 `POOL-FUNC-06`）；② 「导入挑战码」未走 `safeStart` 冲突守卫，且生成的临时题目在页面重载后全部丢失（入池 `POOL-FUNC-06`）；③ 可重建练习集 `.examset.json` 导出/重建方法未接 UI（入池 `POOL-FUNC-08`）。 |
| **一级：专注做题会话 (`PracticeSessionView`) + 三级浮层** | 题干渲染、遮挡图、共用材料卡、A–J 选答、数值/多空/简答输入、稿纸线/20×20 作文格预览、先回忆遮盖、1–3 把握度與 `G` 键盲猜、3 阶渐进解析折叠、1–3 错因标记、撤销作答 (`Z`)、采分点自评与 AI 对齐、AI 讲解/双环/STORM/提示/苏格拉底、1–4 划词快捷条、朗读/语速/字号/跟读评测、背题切换、收藏 (`E`)、速记标签、草稿纸浮层 (`ScratchpadDrawer`)、极速刷题开关、纯听题、音效开关、白噪音心流坞、快捷键弹窗 (`?`)、答题卡弹窗 (`SessionSheetModal`) | 已实现且可用（**含多处断链与半成品**） | **断链与半成品**：① 受助暴露 `exposures/helpShown` 未随 `session/active` 持久化，重载或退出续做后受助状态丢失变回独立作答（入池 `POOL-FUNC-03`）；② 第 1 阶考点提示未展开前右侧边栏已直接明文显示 `q.kp`（泄题），且展开第 1 阶提示未记录 `help: "hint"`（入池 `POOL-FUNC-03`）；③ `FlowDwellTracker` 仅实例化未接入 `submitAnswer` 耗时计算（入池 `POOL-FUNC-07`）；④ 草稿纸内容、极速刷题开关、会话音效开关修改后未持久化（入池 `POOL-FUNC-03`）；⑤ 第 3 阶「打开思源原块」使用裸 `siyuan://` 链接而非 `openTab`（入池 `POOL-FUNC-06`）。 |
| **二级：做题结算卡 (`PracticeDoneCard`)** | 总览统计、CBM 归集提示、薄弱标签排行榜与「一键 10 题智能特训」、错题回看折叠、写复盘反思、AI 错因假设与采纳、同考点举一反三、错题转闪卡、错题加待办、再来一组 | 已实现且可用（**含未接线能力**） | 基础结算、薄弱 10 题特训、AI 错因假设链路完整。**未接线点**：「写复盘反思」仍使用单行弹窗 `saveWrongReflection`，未接入已实现的四要素结构化自诊断 `saveWrongDiagnosis`（入池 `POOL-FUNC-08`）。 |
| **一级：纸面背诵视图 (`ReciteStudioView`)** | 进度条、伴读自动朗读、0.8x/1.0x 语速、字号切换、麦克风跟读评测、跳回源笔记、2 阶提示、空格翻开答案、1–4 级记忆自评、完成页「重记忘却题 / 推闪卡 / 加待办」 | **未做完（持久化与结算断链）** | **断链点**：① `assembleReciteQueue` 未调用 `app.recitePool()`，导致 4 连熟练题不毕业、争议题未过滤（入池 `POOL-FUNC-02`）；② `executeReciteRating` 将 `timeMs` 硬编码为 `0`（入池 `POOL-FUNC-02`）；③ 背诵进度无持久化快照（重载即丢）、中途退出无确认弹窗、完成时未触发 `app.flush()` 与小驴打卡同步 `runCheckinBridge()`（入池 `POOL-FUNC-02`）。 |
| **一级：题库浏览工坊 (`BrowseStudioView`) + 底部浮岛 (`BrowseBatchActionBar`)** | 搜索框、题型/来源/考点/标签/收藏/错题/争议/未审/孤儿/生命周期筛选、智能视图存/选/删、章节树开关、更多维护下拉菜单、批量勾选浮岛（开始特训/打印试卷/教师教案/作业单/推闪卡） | 已实现且可用 | 检索、筛选、智能视图持久化、分批加载（200 条/批）均完整。**UI 缺陷**：窄屏下 `BrowseBatchActionBar`（`bottom: 24px`）与底部任务导航栏重叠遮挡（入池 `POOL-UI-04`）。 |
| **二级：题库治理七大抽屉 (`BrowseMaintenanceDrawers`)** | ① 章节树过滤抽屉<br>② 考点同义合并与空考点填充抽屉<br>③ 考纲大纲导入与覆盖率缺口抽屉（含加载国家课标图谱）<br>④ 纸笔作答回录抽屉<br>⑤ 元数据 CSV 勘误回导抽屉<br>⑥ 批量修改属性与撤销抽屉<br>⑦ 题库健康体检、重复题簇合并、孤儿块诊断与导入批次回滚抽屉 | **部分断链 / 未接完** | **断链点**：① 元数据勘误 `executeApplyErrata` 预反转了 `undo.changes`，导致点击「撤销」时双重反转变成重新应用勘误新值，且未清空旧 `appliedChanges`（入池 `POOL-FUNC-01`）；② 纸笔回录 `applyPaperRecall` 追加流水后未调用 `app.flush()` 立即落盘（入池 `POOL-FUNC-01`）；③ 考纲两版对比 `assessSyllabusChange`、手动增删考点先修边 `addKpRelation`、完整性 CSV 导出 `exportIntegrityCsv` 已在 `app.ts` 实现但抽屉内无按钮入口（入池 `POOL-FUNC-08`）。 |
| **二级：题目详情检视抽屉 (`QuestionPeekDrawer`)** | 上一题/下一题、收藏、在思源中打开、答案遮挡自测、单题练习、内联编辑表单（含数值规格）、衍生变式题、争议标记/解决/清除、生命周期流转、反向链接查询、关联学习资料、单题 CTT 选项分布分析与 CSV、修订历史查看与恢复、作答回执下钻与 AI 错因回写、AI 闪卡候选生成与入库 | **部分断链** | **断链点**：① `updateQuestionContent` 首次编辑未保存编辑前原始基线快照，导致首次编辑无法通过「修订记录」恢复原貌（入池 `POOL-FUNC-01`）；② 「衍生变式题」(`cloneToManualStudio`) 未拷贝数值/多空规格、采分点、辅助考点，且未写入 `q.family.parentId`，导致衍生题无法被变式特训识别（入池 `POOL-FUNC-04`）；③ 「在思源中打开」(`openSiYuanTarget`) 在有 `blockId` 时直接 `window.open("siyuan://...")` 跳过 `openTab`（入池 `POOL-FUNC-06`）。 |
| **一级：错题本攻坚中心 (`WrongbookStudioView`)** | 五分栏切换（在册/已归档/已消灭/CBM 高危盲区/CBM 脆弱伪掌握）、错因筛选、顽疾筛选、考点筛选、排序切换、分栏一键重练、单题重练/推闪卡/溯源母题/练变式/延期 7 天/归档/同考点/标已掌握、导出重测卷/A4 卷/答案册/急救小抄/存思源文档/组卷模考/全部标已掌握 | 已实现且可用 | 五分栏切换、高危置顶、筛选排序持久化、单题与批量处置、错题组卷模考全链路完整。 |
| **一级：手工录题工坊 (`ManualStudioView`) + 遮挡图编辑器 (`OcclusionEditor`)** | 题型切换（含防丢确认）、发布状态、数理/拼音/音标符号坞、OCR 填单弹窗（粘贴文本/上传图片）、规范公式、插入 5 类数学图表、选项增删与设答案、多空无序开关、数值容差规格、主观题采分点量规、考点/辅助考点/来源/材料组/语种/注音、保存为块/保存草稿/换新题、实时题面预览、遮挡图框选与裂变入库 | **部分断链** | **断链点**：① 录题草稿自动保存 (`createManualDraftSnapshot`) 与恢复漏掉了 `secondaryKps`、`orderIndependent`、`studyLang`、`studyPhonetic`、`status` 五个字段，重载后丢失（入池 `POOL-FUNC-04`）；② OCR 弹窗内「上传图片识别」使用 `<label>` 包裹隐藏 `<input>`，键盘 `Tab` 无法聚焦（入池 `POOL-UI-06`）。 |
| **一级：批量导入工坊 (`ImportStudioView`)** | 三子分面（Excel/CSV/TSV/GIFT/Aiken 标准导入、思源文档搜索提取、正文划重点挖空出题）、拖拽上传、模板下载、读取剪贴板、重复策略（跳过/并存/更新）、手动列映射编辑器、命名映射保存/选用、多 Sheet 切换、随机 3 题抽查渲染、错误行单行修复、错误 CSV 导出、先导 5 行试导、确认入库（含进度/取消/断点续传/缺失重试） | 已实现且可用 | 文件选择、拖拽、解析、试导、断点续传、原文+SQL 双读回全链路完整。**UI 缺陷**：思源文档候选列表 `doc.title` 与 `doc.hpath` 省略号截断无 `title` 提示（入池 `POOL-UI-07`）。 |
| **一级：AI 命题工坊 (`AiStudioView`)** | 材料输入、「当前文档」载入、拾遗桥（`glean`）载入与标记已处理、题量/难度/风格/质量档位、考点/核心引文/自定义要求、生成与取消、待审队列（单题入库/编辑/单题重生成/剔除/全部入库/清空队列）、拒绝项一键重试修复 | 已实现且可用 | 生成、队列持久化 `ai/review-queue`、切库保护、单题编辑与修复全链路完整。 |
| **一级：学习资料伴读 (`MaterialsView`)** | 上传本地文件、登记外链、科目/章节元数据、搜索过滤、打开资料（外链隐私闸）、删除资料、定位笔记抽屉（页码/时间戳/引文/正文/标签增删改、草稿按资料隔离）、划词快捷条（1 挖空 / 2 摘录卡 / 3 AI 出题 / 4 记笔记）、一键带入手工录题/AI 出题 | 已实现且可用 | 资料注册、笔记增删改、关联题数响应式刷新与划词转题全链路完整。 |

### 1.3 全真模考场（`MockTab`）与学情报告中心（`ReportTab`）全部入口

| 视图 / 面板层级 | 涵盖入口 | 三态判定 | 五步全链路核验结果与异常点（断链项入池编号） |
| :--- | :--- | :--- | :--- |
| **一级：模考配卷视图 (`MockTab: config`)** | 顶栏题库切换、恢复/放弃未完模考卡、蓝图名称、模块增删与配额（题数/分值/来源/考点/辅考点/难度梯度）、配时策略提示、时长/分段计时/流锁/及格线、评分政策与 5 题样例验算、「开始模考」、20+ 考试预设下拉、「自适应冲刺密卷」、打印双栏卷/教师讲义/存思源文档/生成 AB 卷/导出大纲审计/保存与恢复蓝图、考后估分器（答案串比对/保存历史/删除） | 已实现且可用（**含 UI 与未接线问题**） | **问题点**：① 首屏主按钮「开始模考」排在最后（`y=1020px`），100%/125%/150% 下均需滚动才可见（入池 `POOL-UI-03`）；② 局部 `<style>` `.lv-chip` 覆盖全局令牌导致浅色对比度不达标且圆角不一致（入池 `POOL-UI-01`）；③ `app.ts` 已实现的冻结卷快照存档管理 `savePaperSnapshot / listPaperSnapshots` 未在模考界面接线（入池 `POOL-FUNC-08`）。 |
| **一级：全真模考作答视图 (`MockTab: exam`) + 快捷答题卡弹窗** | 倒计时与 +5 分钟延时、字号切换、全屏切换、标旗 (`F`)、草稿纸开关、朗读、题面与遮挡图渲染、选项/数值/多空/简答输入、20×20 作文方格纸模拟、上一题/下一题/跳未答/提前交卷、右侧答题卡矩阵（含分段过滤与行内快填）、底部浮动答题卡胶囊与弹窗 (`mockMiniSheetOpen`) | 已实现且可用（**含一致性与持久化缺口**） | **问题点**：① 模考内联草稿纸内容未随 `MockRunSnapshot` 持久化（重载丢失），且未复用 `<ScratchpadDrawer>` 组件（入池 `POOL-FUNC-03`、`POOL-UI-06`）；② `mockMiniSheetOpen` 弹窗无焦点锁与关闭焦点归还（入池 `POOL-UI-05`），窄屏下浮动胶囊遮挡底部导航栏（入池 `POOL-UI-04`）。 |
| **一级：模考成绩单视图 (`MockTab: report`)** | 总分与及格判定、与历史均值对比、百分位排名分布图与数据表/CSV、分段得分明细表与 CSV、错题回看（批量加待办/批量标错因）、打印本次错题卷/存为错题集笔记/导出成绩单 MD/打印详解答案册/打印教师讲义/写入思源成绩单/错题立即重练/再考一场 | 已实现且可用 | 成绩计算、历史保存、百分位模拟、错题重练跨页签启动全链路完整。 |
| **一级：学情报告中心 (`ReportTab`: 概览 / 考点与错题 / 记录与证据 / 试题区分度)** | 顶栏日期范围、刷新、题库切换、角色切换、区分度 CSV/通关导学案/勋章墙/完备度体检/AI 解读/AI 下一行动/全景 HTML 战报；概览（KPI、遗忘预警与一键抢救、三层认知画像、建议下一步、周对比、30 天双系列趋势图+表+CSV、53 周热力图+表+CSV）；考点与错题（掌握度雷达图/列表/通关拓扑地图、薄弱考点特训、错因分布）；记录与证据（信心校准、四象限下钻、改答轨迹、延迟复测、受助曝光、24 小时时段图+表+CSV、模考历史图+表+CSV、待办行动完成/取消/重练、写入今日战报、导出脱敏诊断、存储占用、只读数据体检、导出全部数据、清空全部数据）；试题区分度（D/P 统计、异常题排查、明细表） | 已实现且可用（**含 UI 覆盖与未接入口**） | **问题点**：① 局部 `<style>` `.lv-chip` 将全部 `.lv-chip--grn/.lv-chip--amb/.lv-chip--data` 抹成灰色（入池 `POOL-UI-01`）；② 顶栏 13 个控件在窄屏折成 7 行占高 315px（入池 `POOL-UI-03`）；③ 区分度明细表渲染裸英文枚举 `"single"` / `"insufficient_sample"`，「清空全部学习数据」无危险红样式（入池 `POOL-UI-07`）；④ 热力图误用 `--lv-accent`、`.lv-report-tab` 引用错误变量名 `--lv-duration-micro`（入池 `POOL-UI-08`）；⑤ `diagnoseQuestionMisconceptions`（高频思维陷阱分析）未在报告页接线展示（入池 `POOL-FUNC-08`）。 |

### 1.4 判定为「受平台限制无法实现」的 3 项条目说明

以下 3 项能力受限于浏览器安全沙箱、移动端 WebView 容器或思源宿主内核协议，无法在插件前端直接突破，已核实限制来源并确认现有降级方案完备：

1. **`LIMIT-01`：非安全上下文（HTTP 局域网 IP 访问思源浏览器端 / 受限 WebView）下无用户手势或脚本自动写入剪贴板**
   - **限制来源**：现代浏览器 W3C Clipboard API 规范强制要求 `navigator.clipboard.writeText` 仅在 HTTPS 或 `localhost` 安全上下文中可用；通过局域网 IP（如 `http://192.168.x.x:6806`）访问时浏览器内核直接拒绝权限。
   - **现有替代方案**：插件已捕获异常并展示明确提示（“当前环境不支持自动剪贴板，请长按或全选手动复制”），同时提供文件下载导出路径。
2. **`LIMIT-02`：移动端（Android / iOS 思源 App WebView）直接调起桌面级 A4 双栏分页打印预览或静默打印**
   - **限制来源**：Android/iOS 系统 WebView 不具备桌面浏览器的 CSS `@page` 双栏分页打印预览引擎，且浏览器沙箱禁止网页跳过系统确认直接静默驱动物理打印机。
   - **现有替代方案**：插件已支持将试卷、答案册、教师讲义一键保存为思源原生笔记文档（`saveMockExamAsDoc` / `saveWrongbookAsDoc`）或导出为独立 HTML/Markdown 文件，在移动端可通过思源文档阅读或发送至电脑端打印。
3. **`LIMIT-03`：思源内置 AI 通道（`/api/ai/chatGPT`）在途推理请求的物理中断与无桌面客户端环境下的 `siyuan://` 协议唤醒**
   - **限制来源**：思源内核 `/api/ai/chatGPT` 为阻塞式后端转发接口，未向前端插件暴露流式取消句柄；而 `siyuan://blocks/...` 属于操作系统级自定义协议，在纯网页端（`browser-desktop` / Docker 部署未安装桌面客户端）中操作系统无对应注册表处理器。
   - **现有替代方案**：AI 任务通过本地 `aiCancel.aborted` 标志与 `AiTaskContext.contextHash` 严格丢弃已取消或过期的迟到响应，绝不污染当前界面；思源块跳转应统一改为调用思源前端 SDK 的 `openTab({ app, doc: { id } })`（见 `POOL-FUNC-06`）。

---

## 二、 合并去重后的统一待办池（UI 8 条 + 功能 8 条 = 共 16 条）

### 2.1 优先级与成本评分标准
- **影响面（1~5 整数）**：`5`=阻断核心流程或全应用级视觉/数据失真；`4`=影响高频主流程或多面板一致性；`3`=影响单个二级工作坊或次级链路；`2`=局部边缘场景；`1`=纯代码卫生。
- **频率（1~5 整数）**：`5`=每次进入页面必现；`4`=日常高频操作常现；`3`=中频功能触发；`2`=低频维护或特定分辨率触发；`1`=极少触发。
- **成本（1~3 整数）**：`1（小）`=单文件或数行样式/逻辑修正（<30 分钟）；`2（中）`=跨 2~4 个组件/服务协同修改并补单测（30~90 分钟）；`3（大）`=涉及多个模块 UI 布局调整或新面板接线（>90 分钟）。
- **优先级计算公式**：`优先级 = (影响面 × 频率) / 成本`（保留两位小数，数值越高越优先；同分下缺陷优先于功能与体验）。

---

### 2.2 待办池详细条目（逐条含问题描述、解决方案、成本、风险）

#### 【POOL-UI-01】`ReportTab`、`MockTab` 与 `PracticeSessionView` 局部 `<style>` 重复定义 `.lv-chip` 覆盖全局令牌，抹杀语义色与药丸圆角
- **类型**：`缺陷`（UI 令牌与对比度回归 · 归并 3 处同根因问题）
- **优先级**：`(影响面 5 × 频率 5) / 成本 1 = 25.00`（必现且直接导致复盘页与模考页状态徽章全部变灰、浅色对比度跌破 WCAG AA）
- **问题描述（可复现）**：
  - **位置**：`src/ui/report/ReportTab.svelte:2239,2246-2248,2280`、`src/ui/mock/MockTab.svelte:2691-2704`、`src/ui/practice/PracticeSessionView.svelte:217-218`。
  - **复现步骤**：打开「报告中心」或「模考场」，观察页面上的绿色正向徽章（`.lv-chip--grn`，如周对比 `+24 题`、通关地图 `已牢固`）、琥珀色预警徽章（`.lv-chip--amb`，如 `15% 留存`）与晴空蓝数据徽章（`.lv-chip--data`）。
  - **当前表现**：由于 `ReportTab.svelte` 与 `MockTab.svelte` 在组件 `<style>` 内保留了早期版本的 `.lv-chip` 局部规则（Svelte 编译后附加 `.svelte-xxxx` 类，特异性 `0,2,0` 高于 `lv-base.scss` 中特异性 `0,1,0` 的 `.lv-chip--grn` / `.lv-chip--amb` / `.lv-chip--data`），导致报告页所有绿/黄/蓝徽章被强制覆盖为普通灰底灰字（实测 `color: rgb(63,61,82)`, `background: rgb(241,241,249)`），圆角也从 `9999px` 药丸形退化为 `6px` 方框；且三文件中的局部 `.lv-chip--amb` / `.lv-chip--red` 仍引用浅色下对比度仅 `2.8:1` / `4.0:1` 的 `--lv-amber` / `--lv-red`，未引用 `lv-base.scss` 的 `--lv-amber-deep` / `--lv-red-deep`。
  - **期望表现**：全应用三页签的 `.lv-chip`、`.lv-card`、`.lv-input`、`.lv-error`、`.lv-progress` 100% 统一继承 `src/scss/lv-base.scss` 的令牌样式，绿/黄/红/蓝语义色清晰可辨且浅色/深色对比度均 ≥ 4.5:1。
- **解决方案**：
  - 删除 `ReportTab.svelte`、`MockTab.svelte`、`PracticeSessionView.svelte` 局部 `<style>` 中与 `lv-base.scss` 重复的 `.lv-chip*`、`.lv-input*`、`.lv-card`、`.lv-error`、`.lv-skeleton` 规则，并将两文件中的 `.progress` 统一替换为全局 `.lv-progress`（在 `lv-base.scss` 为 `.lv-progress i.ok/.mid/.low` 补充语义色支持）。
- **成本**：`1（小）`——纯样式清理与类名对齐，改动集中在 3 个组件 `<style>` 块内，不超过 40 行删除。
- **风险**：`MockTab` 成绩单中的 `.lv-chip.grn` / `.lv-chip.red` 简写类需同步改为标准 `.lv-chip--grn` / `.lv-chip--red`，避免移除局部样式后失色。

---

#### 【POOL-UI-02】`Rail.svelte` 容器查询断点（`1080px`）与全局壳断点（`1119px`）不一致，导致 `1081px–1119px` 侧栏文字挤压溢出
- **类型**：`缺陷`（响应式布局错位）
- **优先级**：`(影响面 4 × 频率 4) / 成本 1 = 16.00`（桌面分屏或中等窗口必现）
- **问题描述（可复现）**：
  - **位置**：`src/ui/shared/Rail.svelte:554` 对照 `src/scss/lv-base.scss:1289` 与 `src/ui/shared/Rail.svelte:129`。
  - **复现步骤**：将思源窗口或插件分屏容器宽度调整至 `1081px ~ 1119px` 之间（如 `1100px`），观察左侧 `Rail` 导航栏。
  - **当前表现**：`lv-base.scss` 在 `≤1119px` 时已将 `.lv-rail` 列宽收缩为 `72px`（紧凑图标栏），但 `Rail.svelte:554` 的隐藏文字规则写为 `@container lv-exam (min-width: 760px) and (max-width: 1080px)`。在 `1081px–1119px` 区间内，`.lv-project`（当前题库卡）、`.lv-nav-label`（`我的备考工作台`）、`.lv-quick-create-text` 与底部隐私说明仍保持 `display: block`，在 `72px` 窄栏内被严重挤压换行与截断。
  - **期望表现**：`Rail.svelte:554` 容器查询上限与 `lv-base.scss` 及 `Rail.svelte:129` 严格同步为 `1119px`，在 `760px–1119px` 全区间稳定呈现紧凑图标侧栏。
- **解决方案**：
  - 将 `src/ui/shared/Rail.svelte:554` 的 `@container lv-exam (min-width: 760px) and (max-width: 1080px)` 修改为 `@container lv-exam (min-width: 760px) and (max-width: 1119px)`。
- **成本**：`1（小）`——单行 CSS 断点数值同步。
- **风险**：无副作用，可消除 `1081px–1119px` 盲区。

---

#### 【POOL-FUNC-01】元数据勘误（Errata）撤销双重反转导致回滚失效 + 题目首次编辑缺失初始基线快照无法恢复 + 纸笔回录未即时落盘
- **类型**：`缺陷`（数据持久化与回滚逆操作错误 · 归并 3 处同根因问题）
- **优先级**：`(影响面 5 × 频率 3) / 成本 1 = 15.00`（逆操作直接写错题库数据，破坏用户对撤销与历史恢复的信任）
- **问题描述（可复现）**：
  - **位置**：
    1. `src/ui/practice/services/bankGovernanceService.ts:317` 对照 `src/ui/practice/PracticeTab.svelte:1132-1135,1239`；
    2. `src/app.ts:1250-1269`（`updateQuestionContent`）；
    3. `src/ui/practice/PracticeTab.svelte:1260-1272`（`applyPaperRecall`）。
  - **复现步骤**：
    1. 在「题库 → 更多 → 元数据勘误」上传勘误 CSV（如将某题考点从 `旧考点` 改为 `新考点`）并点击应用，随后打开「批量编辑」点击「撤销上次批量修改」；
    2. 新建或导入一道题目（答案为 `A`），打开题目详情抽屉点击「编辑」将答案改为 `B` 保存，然后展开「修订记录（1）」点击「恢复此版本」；
    3. 在「纸笔回录」输入 2 道题作答并点击「记录到作答流水」，立即关闭或重载思源。
  - **当前表现**：
    1. `executeApplyErrata` 保存 `undo` 时已调用了一次 `invertPlan(plan.changes)`，而 `applyBatch(true)` 撤销时又对 `batchUndo.changes` 调用了一次 `invertPlan`，双重反转后实际执行的是正向 `plan.changes`（把 `新考点` 又写了一遍，根本无法恢复为 `旧考点`）！且若同会话此前做过普通批量编辑（`appliedChanges` 非空），`applyErrata` 与 `applyKpPlan` 未清空 `appliedChanges`，点撤销会误撤更早前的批量编辑；
    2. `updateQuestionContent` 仅在编辑后追加新版本 `draft`，当该题此前无修订记录时未先保存编辑前的原始状态 `q`，导致修订列表里唯一的记录就是刚改完的 `B`，用户无法恢复回初始的 `A`；
    3. `applyPaperRecall` 调用 `recordAttempt` 后未调用 `await app.flush()`，不足 10 条时需等 30 秒定时器，立即重载会丢失刚回录的纸笔成绩。
  - **期望表现**：勘误、考点合并与批量编辑的「撤销」均能准确恢复修改前的值；首次编辑题目时自动保留一条初始版本快照供随时回退；纸笔回录应用后立即 `await app.flush()` 落盘。
- **解决方案**：
  - 将 `bankGovernanceService.ts:317` 的 `invertPlan(plan.changes)` 改为 `plan.changes`（与 `executeApplyKpPlan` 保持同口径，由 `applyBatch(true)` 统一反转），并在 `applyErrata` 与 `applyKpPlan` 成功时重置 `appliedChanges = []`；
  - 在 `src/app.ts:1256` 调用 `appendRevision` 前，若 `(await this.questionRevisions(q.id)).length === 0`，先追加一条代表编辑前原貌的基线快照（`ts: (q as any).createdAt || (now - 1)`）；
  - 在 `PracticeTab.svelte:1265` 的 `applyPaperRecall` 中补齐 `await app.flush()`。
- **成本**：`1（小）`——逻辑清晰，涉及 3 个文件约 25 行代码。
- **风险**：需同步核对 `tests/bankGovernanceService.test.ts` 与 `tests/revision.test.ts` 中对修订条数的断言（首次编辑产生基线+新版本共 2 条，或恢复时支持回退基线）。

---

#### 【POOL-FUNC-02】纸面背诵模式（`ReciteStudioView`）未接入毕业出清池、耗时硬编码为 `0`、重载丢失进度且完成时不触发落盘与打卡同步
- **类型**：`缺陷`（核心学习模式五步链路断裂 + 写死数据 · 归并 4 处同根因问题）
- **优先级**：`(影响面 4 × 频率 4) / 成本 1 = 16.00`（背诵是三大核心学习模式之一，当前在抽题、计时、持久化、打卡四环均存在断点）
- **问题描述（可复现）**：
  - **位置**：`src/ui/practice/services/reciteStudioService.ts:9-19,37`、`src/ui/practice/PracticeTab.svelte:2545-2602`、`src/app.ts:3085`。
  - **复现步骤**：
    1. 对某题在背诵模式连续 4 次自评 Good/Easy（`reciteStreak >= 4`），或将某题标为未解决争议题，再次进入「纸面背诵」；
    2. 在背诵模式停留 15 秒后点击自评按钮，查看题目详情「作答回执」中的耗时；
    3. 背诵到第 8/15 题时按 `Esc` 键或刷新页面；或完成全部 15 题背诵后查看小驴打卡状态。
  - **当前表现**：
    1. `assembleReciteQueue` 绕过了 `app.recitePool()`，直接从 `wrongDrill` 或 `allQuestions` 抽题，导致已连续熟练 4 次的题目永不毕业出清，且当无错题时未过滤争议题；
    2. `executeReciteRating` 第 37 行调用 `app.reciteAnswer(bankName, q, rating, sessionId, 0)` 将耗时硬编码写死为 `0`，导致所有背诵流水 `timeMs` 恒为 `0`；
    3. 背诵会话无持久化快照（刷新页面进度全丢），按 `Esc` 退出无确认弹窗直接清空，且背诵完成（`adv.done === true`）时未调用 `await app.flush()`、`dataRev++`、`runCheckinBridge()` 与 `emitExamEvent("session-ended")`。
  - **期望表现**：背诵抽题统一走 `app.recitePool()`；真实计量每题背诵停留耗时 `timeMs`；支持背诵进度暂存恢复与中途退出确认；背诵完成时立即落盘并触发打卡桥与结算事件。
- **解决方案**：
  - 在 `reciteStudioService.ts:14` 改为调用 `const pool = app.recitePool(allQuestions)`；
  - 在 `PracticeTab.svelte` 为背诵模式记录单题起始时刻 `reciteAnswerStart = Date.now()`，传入真实耗时 `Date.now() - reciteAnswerStart` 给 `executeReciteRating`；
  - 在 `rateSelf` 中当 `adv.done` 为真时调用 `await app.flush(); dataRev++; void runCheckinBridge();`，并在 `exitRecite` 中当 `reciteCursor > 0 && !reciteDone` 时增加确认提示与 `await app.flush()`，同时将未完背诵进度写入 `recite/active` 辅助存储供恢复。
- **成本**：`1（小）`——复用现有 `recitePool`、`runCheckinBridge` 与 `flush` 机制，改动集中在 2 个文件。
- **风险**：需同步更新 `tests/reciteStudioService.test.ts` 中 `mockApp` 的 `recitePool` 桩方法。

---

#### 【POOL-FUNC-03】做题会话受助暴露（`exposures`）与草稿纸/偏好未持久化导致重载洗白独立资格，且第 1 阶考点提示存在侧栏泄题与漏记受助
- **类型**：`缺陷`（学习证据真实性与重载恢复断裂 · 归并 4 处同根因问题）
- **优先级**：`(影响面 4 × 频率 4) / 成本 2 = 8.00`（直接影响核心设计原则“独立初答与受助作答严格分算，不能靠返回页面恢复独立资格”）
- **问题描述（可复现）**：
  - **位置**：`src/ui/practice/PracticeTab.svelte:3133-3145,3200-3240`、`src/ui/practice/PracticeSessionView.svelte:437,439,615-631,845`、`src/core/session.ts`、`src/app.ts:1800`。
  - **复现步骤**：
    1. 进入练习会话，在未提交前观察右侧「本题」卡片，发现考点 `q.kp` 已直接显示；点击题面下方「考点提示（卡壳再看）」展开提示后作答提交，检查流水 `help` 字段；
    2. 在未提交前点击「逐步提示」获取 AI 提示，随后点击「退出练习」再点「继续本场」（或刷新页面恢复会话），然后提交答案，检查流水 `help` 与 `exposure` 字段；
    3. 在练习或模考中打开「草稿纸」写下演算过程，或开启「极速刷题」/ 切换「提示音效」，刷新页面。
  - **当前表现**：
    1. 未提交前右侧边栏（`PracticeSessionView.svelte:845`）无条件展示 `q.kp`，使题面下方的「第 1 阶：考点提示（默认折叠防弱化独立回忆）」失去意义；且点击展开第 1 阶考点提示未调用 `addExposure(q.id, "hint")`，提交后仍被计为无提示独立答对；
    2. `exposures`、`hintLevels`、`hintTexts`、`recallUsed` 仅保存在 `PracticeTab` 内存变量中，未写入 `SessionState`（`session/active`），退出重进或刷新后全部丢失，受助作答被误记为独立初答；
    3. `scratchpadStore` / `scratchpadShared`、`speedDrillEnabled` 未持久化，会话内点击音效按钮未写回 `settingUtils`，重载后全部丢失。
  - **期望表现**：未提交且未解锁第 1 阶提示前，右侧边栏隐藏 `q.kp`；展开第 1 阶提示即记录 `"hint"` 暴露；`exposures` / `recallUsed` / `scratchpadStore` 随会话快照持久化；`speedDrillEnabled` 与 `soundEnabled` 变更即时持久化。
- **解决方案**：
  - 在 `PracticeSessionView.svelte:845` 仅当 `feedback || stageHintOpen` 时展示右侧边栏的 `q.kp`，并在点击展开 `stageHintOpen` 时触发 `onstageHintExpose?.(q.id)` 记录 `addExposure(q.id, "hint")`；
  - 在 `SessionState`（`src/core/session.ts`）与 `MockRunSnapshot`（`src/core/mock.ts`）中增加可选的 `exposures?: Record<string, string[]>`、`recallUsed?: string[]` 与 `scratchpad?: { store: ScratchpadStore; shared: string }` 字段，随 `saveSession` / `saveMockRun` 落盘并在恢复时还原；
  - 为 `speedDrillEnabled` 绑定 `readLocal/writeLocal("lv-exam/speed-drill")`，为会话内音效按钮绑定 `plugin.settingUtils?.set("soundEnabled", ...)`。
- **成本**：`2（中）`——涉及 `session.ts`、`PracticeTab.svelte`、`PracticeSessionView.svelte`、`MockTab.svelte` 四处状态同步。
- **风险**：`SessionState` 新增字段须设为可选（`?`），保持对已有旧版 `session/active.json` 快照的 100% 向后兼容。

---

#### 【POOL-UI-03】模考配卷页主操作「开始模考」深埋首屏折线以下（`y=1020px`），且窄屏与 125%/150% 缩放下复盘页/练习页顶栏折行高达 `218px~315px`
- **类型**：`体验`（首屏关键操作可达性与高缩放/窄屏空间占比 · 归并 2 处同根因问题）
- **优先级**：`(影响面 4 × 频率 4) / 成本 2 = 8.00`（直接违反“关键操作无需滚动即可看见”与 `ui-ux-pro-max` §5 `content-priority` / §9 `overflow-menu`）
- **问题描述（可复现）**：
  - **位置**：`src/ui/mock/MockTab.svelte:1754-1915`、`src/ui/report/ReportTab.svelte:1010-1094`、`src/ui/practice/PracticeTab.svelte:5176-5280`。
  - **复现步骤**：
    1. 在 1440×900（100% 缩放）或 125%/150% 系统缩放下打开「模考场」，不滚动页面，寻找「开始模考」按钮与「选择考试预设」下拉框；
    2. 在 390×844 窄屏或 150% 缩放分屏下打开「报告中心」与「练习台」，测量顶部工具栏 `.block__icons` 所占高度。
  - **当前表现**：
    1. 模考配卷页将「开始模考」、「选择考试预设」、「自适应冲刺密卷」排在说明卡、蓝图大表、配时策略卡、考试时长行和评分政策行之后，实测按钮底部位于 `y = 1020px`（125%/150% 缩放下超出视口底边 380px~620px），用户每次开考都必须滚到底部；
    2. 报告中心顶栏 `.block__icons` 平铺了 13 个控件（含 5 个低频导出/AI 按钮、角色切换、题库选择、日期选择等），在 1280px 桌面下即折成 2 行（95px），在 390px 窄屏下折成 7 行高达 `315px`（占屏幕高度 37%）；练习台顶栏在 390px 下也折成 5 行高达 `218px`。
  - **期望表现**：「开始模考」、预设选择与自适应组卷提升至蓝图配置表上方的首屏头部动作条，在 100%/125%/150% 下无需滚动直接可见；窄屏（`≤759px`）下顶栏将次级导出按钮与状态徽章收纳至页面内容区或折叠菜单，顶栏高度控制在 1~2 行（`≤88px`）以内。
- **解决方案**：
  - 在 `MockTab.svelte:1754` 蓝图标题行右侧直接放置「选择考试预设」、「自适应冲刺密卷」与主按钮「开始模考」（底部保留辅助打印/保存蓝图工具条）；
  - 在 `ReportTab.svelte` 将顶栏中的 5 个导出/AI 动作按钮移入页面正文标题区下方的紧凑操作栏（或窄屏下收敛进 `details` 更多菜单），并在 `@container lv-exam (max-width: 759px)` 下隐藏顶栏非核心装饰 chip（如 `数据来自本地作答流水`）。
- **成本**：`2（中）`——涉及 `MockTab.svelte` 与 `ReportTab.svelte` 局部 DOM 顺序微调与容器查询样式。
- **风险**：需确保 `smoke-ui.mjs`、`smoke-sample-ui.mjs` 等脚本对顶栏与开始模考按钮的选择器（`#app button:has-text(...)`）不受位置上移影响。

---

#### 【POOL-UI-04】窄屏（`≤759px`）与分屏下底部批量操作浮岛栏及浮动答题卡胶囊遮挡底部任务导航栏（`.lv-mobile-tasknav`）
- **类型**：`体验`（窄屏浮动层碰撞与焦点遮挡 · 归并 3 处同根因问题）
- **优先级**：`(影响面 3 × 频率 4) / 成本 1 = 12.00`（违反 `ui-ux-pro-max` §1 `focus-not-obscured` 与 §5 `fixed-element-offset`）
- **问题描述（可复现）**：
  - **位置**：`src/ui/practice/BrowseBatchActionBar.svelte:29`、`src/ui/practice/PracticeTab.svelte:6196`、`src/ui/mock/MockTab.svelte:2299`。
  - **复现步骤**：
    1. 将视口或分屏调至 `≤759px`（如 390×844），进入「题库」开启批量模式并勾选 1 道题，观察底部弹出的 `BrowseBatchActionBar`；
    2. 在 390×844 下进入练习会话或模考作答，观察右下角浮动的答题卡胶囊按钮。
  - **当前表现**：`BrowseBatchActionBar` 使用 `position: fixed; bottom: 24px; left: 50%; width: min(680px, calc(100vw - 32px)); z-index: 95`，而窄屏底部五项任务导航栏 `.lv-mobile-tasknav` 位于 `bottom: 0; height: ~64px; z-index: 80`，导致批量操作浮岛直接叠压在底部导航栏正上方，且在桌面分屏中 `left: 50%; 100vw` 按整个浏览器窗口居中而非插件面板居中；同时练习/模考右下角 `bottom: 22px` 的浮动答题卡胶囊在窄屏下也会与底部区域冲突。
  - **期望表现**：批量操作浮岛改为相对于插件主容器底部定位（或使用 `position: sticky; bottom: 16px`），在 `≤759px` 窄屏下自动抬升 `bottom: calc(74px + env(safe-area-inset-bottom))`，绝不遮挡 `.lv-mobile-tasknav`。
- **解决方案**：
  - 将 `BrowseBatchActionBar.svelte:29` 从内联 `position: fixed; bottom: 24px; width: min(680px, calc(100vw - 32px))` 提取为类 `.lv-batch-float-bar`，在 `@container lv-exam (max-width: 759px)` 下设置 `bottom: calc(76px + env(safe-area-inset-bottom))` 并限制宽度在容器内（`max-width: calc(100% - 24px)`）。
- **成本**：`1（小）`——纯 CSS 定位与容器断点适配。
- **风险**：无业务风险。

---

#### 【POOL-FUNC-04】手工录题草稿漏存 5 个扩展字段 +「衍生变式题」未继承规格与未绑定母题题族（`q.family.parentId`）
- **类型**：`缺陷`（功能链路断裂 · 归并 2 处同根因问题）
- **优先级**：`(影响面 3 × 频率 4) / 成本 1 = 12.00`（导致衍生变式题无法被「练变式题 / 溯源母题」识别，且录题草稿重载丢失扩展字段）
- **问题描述（可复现）**：
  - **位置**：`src/ui/practice/services/manualStudioService.ts:380-445`、`src/ui/practice/PracticeTab.svelte:1479-1488,3565-3578,4642-4649`、`src/ui/practice/services/bankGovernanceService.ts:440`。
  - **复现步骤**：
    1. 在「出题 → 手工录题」填写题干、辅助考点（`mSecondaryKps`）、勾选填空题「无序判分」（`mSpecOrderIndependent`）、选择朗读语言为「粤语」并填注音、切换状态为「草稿」，等待 1 秒后刷新页面；
    2. 在「题库」点开某道母题 `q-mother` 的详情抽屉，点击「衍生变式题」进入手工录题台修改题干并保存，随后在错题本或做题结算页对 `q-mother` 点击「练变式题」或对新题点击「溯源基石母题」。
  - **当前表现**：
    1. 刷新页面后，题干恢复了，但辅助考点、无序判分开关、朗读语种、注音和草稿发布状态 5 个字段全部丢失变回默认值；
    2. `cloneToManualStudio` 克隆题目时不仅漏拷了数值容差规格、多空无序、采分点、辅助考点、材料组和语种注音，更重要的是**完全未记录母题 ID（`mFamilyParentId`）**，保存新题时 `q.family` 为 `undefined`，导致系统的「练变式题」与「溯源母题」功能根本找不到这道衍生变式题！
  - **期望表现**：录题草稿完整保存并恢复全部表单字段；点击「衍生变式题」进入录题台时完整带入原题规格并持有母题 `parentId`（界面显示「衍生自母题 #xxx」提示标签），保存入库时自动写入 `q.family = { parentId: motherId, variantKind: "near_transfer", verified: true }`。
- **解决方案**：
  - 扩充 `createManualDraftSnapshot` 与 `PracticeTab.svelte:1480` 恢复逻辑，纳入 `secondaryKps`、`orderIndependent`、`studyLang`、`studyPhonetic`、`status`、`familyParentId`；
  - 在 `cloneToManualStudio(q)` 中完整回填原题的规格字段并设置 `mFamilyParentId = q.family?.parentId || q.id`，在 `processAndSaveManualQuestion` 中当 `data.familyParentId` 存在时挂载 `q.family`。
- **成本**：`1（小）`——数据结构已完备（`custom-exam-family` 已支持持久化），仅需在表单状态与草稿间补齐字段传递。
- **风险**：切换为全新空白题（`clearManualFormWithoutConfirm`）时需同步清空 `mFamilyParentId = ""`，防止后续无关新题误绑上一次的母题 ID。

---

#### 【POOL-FUNC-05】首页今日计划未预拉取 FSRS 到期闪卡 +「每日一练」硬编码空到期列表 +「考前冲刺」未接入动态间隔压缩引擎
- **类型**：`缺陷`（核心调度引擎半成品未接通 · 归并 2 处同根因问题）
- **优先级**：`(影响面 4 × 频率 3) / 成本 1 = 12.00`（首页看板与两大训练模式入口未消费真实算法引擎）
- **问题描述（可复现）**：
  - **位置**：`src/ui/practice/PracticeTab.svelte:1759,2495`、`src/ui/practice/services/drillLauncherService.ts:40-61`。
  - **复现步骤**：
    1. 将题库中的题目转为思源闪卡且已有到期卡，打开练习台首页观察今日计划深色卡片的原因说明；再点击下方六宫格的「每日一练」卡片；
    2. 在设置中配置目标考期 `examDate`（如距今 5 天），点击下方六宫格的「考前冲刺」卡片。
  - **当前表现**：
    1. 首页初始化调用 `rebuildPlan()` 时未传入 `dueFirst`（仅在点击主卡 `startToday` 时才调 `app.dueQuestions`），导致首页展示时 `dueFirst` 恒为空，永远不会显示 `plan.due`（“今日有 N 张闪卡到期”）；而点击六宫格「每日一练」时，`pickDrillQuestions` 在无历史流水时直接调 `app.dailyDrill(qs, [], goal)` 传入硬编码空数组 `[]`，有流水时调 `dsrDailyDrill` 也忽略了思源 Riff 到期卡；
    2. 点击六宫格「考前冲刺」（`mode === "cram"`）时，`pickDrillQuestions` 仍调用早期 5 行代码的 `app.cramDrill(qs)`（仅简单过滤错次 ≥2），而 `src/core/cramScheduler.ts` 中专门实现的考前急救动态间隔压缩引擎 `app.emergencyCramDrill(qs, { examDate, maxQuestions: 20 })` 在 UI 中从未被调用！
  - **期望表现**：首页加载题库后异步拉取 `app.dueQuestions` 刷新今日计划卡；「每日一练」优先合并到期闪卡与 DSR 自适应抽样；「考前冲刺」调用 `app.emergencyCramDrill` 结合考期紧急度与顽疾错因加权组队（无顽疾时平滑回退 `cramDrill`）。
- **解决方案**：
  - 在 `PracticeTab.svelte` 新增 `async function refreshPlanWithDue()`，在 `loadQuestions` 完成后拉取 `app.dueQuestions(bankName, qs)` 再调用 `rebuildPlan(due)`，并将 `due` 缓存供 `pickDrillQuestions` 的 `daily` 模式使用；
  - 在 `drillLauncherService.ts:40` 的 `mode === "cram"` 分支优先调用 `app.emergencyCramDrill(qs, { examDate, maxQuestions: 20 }).questions`，若结果为空则回退 `app.cramDrill(qs)`。
- **成本**：`1（小）`——底层 `dueQuestions` 与 `emergencyCramDrill` 均已实现并有完整单测，仅需在 `PracticeTab` 与 `drillLauncherService` 接线。
- **风险**：`dueQuestions` 在离线模式下会抛错或返回空，需保留 `try/catch` 静默降级为 `[]`，不阻塞首页渲染。

---

#### 【POOL-FUNC-06】「在思源中打开」直接调 `window.open("siyuan://...")` 旁路原生 `openTab` + 教师台「查看试题诊断」未直达区分度分面 + 挑战码会话重载丢失
- **类型**：`缺陷`（跨面板/宿主跳转与恢复异常 · 归并 3 处同根因问题）
- **优先级**：`(影响面 3 × 频率 3) / 成本 1 = 9.00`
- **问题描述（可复现）**：
  - **位置**：
    1. `src/ui/practice/services/backlinkNavigationService.ts:54-71`、`src/ui/practice/PracticeSessionView.svelte:728`；
    2. `src/ui/practice/TeacherWorkspaceView.svelte:109`、`src/ui/practice/PracticeTab.svelte:5302`、`src/ui/report/ReportTab.svelte:1181`；
    3. `src/ui/practice/PracticeTab.svelte:2613-2624`、`src/ui/practice/services/challengeService.ts:66-87`。
  - **复现步骤**：
    1. 在浏览器桌面端（`browser-desktop`）打开题目详情抽屉点击「在思源中打开」（或做题后展开第 3 阶「思源原块溯源」点击「打开思源原块」）；
    2. 在练习台切换为「教师教研模式」，点击模块一第四张卡片「查看试题诊断」；
    3. 点击「导入挑战码试卷」粘贴挑战码进入答题，中途刷新页面。
  - **当前表现**：
    1. `openSiYuanTarget` 在 `blockId` 存在时直接执行 `window.open("siyuan://blocks/" + blockId); return;`，导致第 65 行的思源官方 API `openTab({ app, doc: { id } })` 永远无法执行；在浏览器前端或未注册 OS 协议的环境中会弹出空白页或系统协议报错；`PracticeSessionView:728` 也使用了裸 `<a href="siyuan://blocks/...">`；
    2. 点击「查看试题诊断」仅打开报告中心默认的「概览」分面，并未自动切至第 4 个分面「试题区分度与质量」（`reportSection = "quality"`）；
    3. `importChallengeCode` 未经过 `safeStart` 检查当前是否有未完成会话（若有则直接报错而非弹窗询问放弃/续做），且挑战码生成的临时 `Question[]` 不在题库 SQL 中，刷新页面时 `resumeSession` 查不到题块导致挑战赛直接静默丢失。
  - **期望表现**：在思源宿主内打开题块优先调用 `openTab({ app, doc: { id: blockId || rootId } })`，仅在无宿主 `app` 时回退 `siyuan://`；点击教师台「查看试题诊断」直接跳转报告中心并激活 `quality` 分面加载区分度数据；挑战码导入走 `safeStart` 守卫并在 `SessionState` 中内联保存挑战题快照以支持刷新续做。
- **解决方案**：
  - 修改 `backlinkNavigationService.ts:openSiYuanTarget`：优先使用 `import("siyuan").then(({ openTab }) => openTab({ app: plugin.app, doc: { id: blockId || rootId } }))`，并在 `PracticeSessionView.svelte:728` 将 `<a href="siyuan://...">` 改为调用 `onopenInSiYuan(q.rootId, q.blockId)` 的按钮；
  - 在 `pluginTab.ts` / `bus.ts` 支持 `openReport("quality")`（通过 `pendingReportSection` 与总线事件通知 `ReportTab` 切至 `quality` 并调用 `loadDiscriminationAudit()`）；
  - 在 `importChallengeCode` 中改用 `safeStart`，并在 `SessionState` 中增加可选 `inlineQuestions?: Question[]` 供 `challenge` 模式在 `resumeSession` 时直接还原题面。
- **成本**：`1（小）`——3 处均为清晰的调用链修正。
- **风险**：需确认 `tests/backlinkNavigationService.test.ts` 对 `openSiYuanTarget` 的单元测试断言并同步更新。

---

#### 【POOL-UI-05】四个模态弹窗（题库画廊 / 练习答题卡 / 模考快捷答题卡 / 快捷键指南）缺失焦点圈闭（Focus Trap）、背景 `inert` 与关闭焦点归还
- **类型**：`体验`（无障碍与键盘模态契约不一致 · 归并 4 处同根因问题）
- **优先级**：`(影响面 3 × 频率 3) / 成本 1 = 9.00`（违反 `ui-ux-pro-max` §1 `focus-states` / `keyboard-nav` 及组件间一致性）
- **问题描述（可复现）**：
  - **位置**：`src/ui/practice/BankGalleryModal.svelte:75`、`src/ui/practice/SessionSheetModal.svelte:33`、`src/ui/practice/ShortcutsHelpModal.svelte:21`、`src/ui/mock/MockTab.svelte:2317`、`src/ui/practice/QuestionPeekDrawer.svelte:236`。
  - **复现步骤**：打开「题库管理中心」弹窗、`?` 快捷键弹窗或做题/模考「快捷答题卡」弹窗，连续按 `Tab` 键，再按 `Esc` 关闭弹窗。
  - **当前表现**：虽然 `Palette.svelte` 和 `QuestionPeekDrawer.svelte` 实现了完整的模态契约（打开聚焦、Tab 循环锁、背景 `inert`、关闭归还触发钮焦点），但上述 4 个同样标有 `role="dialog" aria-modal="true"` 的弹窗均未接入 `handleModalDrawerKeydown` 与焦点管理——按 `Tab` 键焦点会穿透到弹窗背后的主页面控件上，按 `Esc` 关闭后焦点也未归还给打开弹窗的触发按钮；此外 `QuestionPeekDrawer.svelte:236` 的遮罩层使用了 `<div onclick={onclose} role="presentation">` 而非统一的 `<button type="button" class="lv-hotkeys-backdrop">`。
  - **期望表现**：全应用所有 `role="dialog"` 模态弹窗统一接入 `src/ui/shared/drawerAccessibility.ts` 的 `handleModalDrawerKeydown` 与初始聚焦/关闭归还焦点逻辑。
- **解决方案**：
  - 在 `BankGalleryModal.svelte`、`SessionSheetModal.svelte`、`ShortcutsHelpModal.svelte` 与 `MockTab.svelte`（`mockMiniSheetOpen`）中统一绑定 `dialogEl`，在打开时记录 `returnFocus = document.activeElement` 并聚焦弹窗首控件，绑定 `onkeydown={(e) => handleModalDrawerKeydown(e, dialogEl, onclose)}`，关闭时归还焦点。
- **成本**：`1（小）`——直接复用已有的 `src/ui/shared/drawerAccessibility.ts` 工具函数，无需重复造轮子。
- **风险**：在 `BankGalleryModal` 中当搜索框聚焦时，需确保 `handleModalDrawerKeydown` 仅拦截 `Escape` 和边界 `Tab`，不干扰正常输入。

---

#### 【POOL-UI-06】跨面板同类控件实现不一致（OCR 上传用不可聚焦 `<label>`、模考内联重复草稿纸）及 9 处表单控件/切换按钮缺失无障碍属性
- **类型**：`体验`（跨面板控件一致性与表单无障碍 · 归并 4 处同根因问题）
- **优先级**：`(影响面 3 × 频率 3) / 成本 1 = 9.00`（违反 `ui-ux-pro-max` §1 `form-labels` / `aria-labels` 与跨面板一致性要求）
- **问题描述（可复现）**：
  - **位置**：
    1. `src/ui/practice/ManualStudioView.svelte:164-167,427,434,446`；
    2. `src/ui/mock/MockTab.svelte:2045-2075,2134,2142,2146,2267`；
    3. `src/ui/practice/QuestionPeekDrawer.svelte:540,551,559`；
    4. `src/ui/report/ReportTab.svelte:1021,1324,1331`、`src/ui/practice/PracticeSessionView.svelte:423`。
  - **复现步骤**：
    1. 在「手工录题 → OCR 填单」面板中按 `Tab` 键尝试聚焦「上传图片识别」按钮；
    2. 对比练习台做题时的「草稿纸」浮层（`ScratchpadDrawer`）与模考考场内的「草稿纸」面板；
    3. 使用读屏软件或无障碍树检查器扫描题目详情抽屉的「标记争议」表单、模考填空/简答/机读卡输入框及报告页顶栏日期范围选择器。
  - **当前表现**：
    1. `ManualStudioView:164` 使用 `<label class="lv-btn"><input type="file" style="display:none"></label>`，因内部 input 为 `display:none` 且 label 无 tabindex，键盘 `Tab` 键完全无法聚焦该按钮（而导入页、资料页、遮挡编辑器均使用原生 `<button>`）；
    2. `MockTab:2045` 手写了一套简化版草稿纸 HTML，缺少 `<ScratchpadDrawer>` 的模式按钮 `aria-pressed`、文本框 `aria-label` 以及底部的「常用数理常数与公式速查表」；
    3. `QuestionPeekDrawer` 争议处理表单的 3 个输入框、`MockTab` 的 4 处作答输入框、`ManualStudioView` 右侧预览区的 3 个禁用输入框、`ReportTab:1021` 日期范围 `<select>` 缺少 `aria-label`；`PracticeSessionView:423` 语速按钮缺少 `aria-pressed`，`ReportTab:1324,1331` 四象限可展开块缺少 `aria-expanded`。
  - **期望表现**：所有文件上传入口统一使用原生 `<button type="button">` 触发隐藏 `<input type="file">`；`MockTab` 直接复用 `<ScratchpadDrawer>` 组件；全部表单控件与切换按钮 100% 具备 `aria-label`、`aria-pressed` 或 `aria-expanded`。
- **解决方案**：
  - 将 `ManualStudioView.svelte:164` 改为 `<button type="button" class="lv-btn sm lv-btn--ghost" onclick={() => ocrFileInput?.click()}>` + `<input bind:this={ocrFileInput} type="file" hidden ...>`；
  - 将 `MockTab.svelte:2045-2075` 替换为 `<ScratchpadDrawer>` 组件；
  - 为上述 9 处输入框/下拉框/切换按钮逐一补齐 `aria-label`、`aria-pressed` 与 `aria-expanded`。
- **成本**：`1（小）`——全为属性补齐与现有组件复用。
- **风险**：无风险。

---

#### 【POOL-UI-07】长文本省略号截断缺少 `title` 悬停全文提示 + 报告页「清空全部数据」缺少危险警示样式 + 区分度表暴露英文枚举值
- **类型**：`体验`（信息可读性与防误触安全 · 归并 3 处同根因问题）
- **优先级**：`(影响面 3 × 频率 3) / 成本 1 = 9.00`（违反 `ui-ux-pro-max` §6 `truncation-strategy` 与 §8 `destructive-emphasis`）
- **问题描述（可复现）**：
  - **位置**：
    1. `src/ui/practice/ImportStudioView.svelte:314-315`、`src/ui/report/ReportTab.svelte:1679`、`src/ui/shared/Rail.svelte:678,781`；
    2. `src/ui/report/ReportTab.svelte:2064`；
    3. `src/ui/report/ReportTab.svelte:2182,2190`。
  - **复现步骤**：
    1. 在 125%/150% 缩放或窄窗下打开「批量导入 → 从思源文档导入」查看长文档名与长路径，或在「报告中心 → 考点与错题」查看超过 6 个字的考点名称（宽度固定 `88px` / `72px` 被 `ellipsis` 截断），将鼠标悬停其上；
    2. 打开「报告中心 → 记录与证据」滚到底部，查看「导出全部数据」旁边的「清空全部学习数据」按钮；
    3. 切换为教师模式，在「报告中心 → 试题区分度与质量」查看底部全量题目明细表的「题型」与「质量评级」列。
  - **当前表现**：
    1. `doc.title`、`doc.hpath` 与 `.lv-mastery-row > span:first-child`（`{m.root}`）设置了 `overflow: hidden; text-overflow: ellipsis; white-space: nowrap` 却未绑定 `title` 属性，截断后无法得知完整名称；
    2. 「清空全部学习数据」使用普通 `<button class="lv-btn sm">`，与普通操作无视觉区分且紧挨「导出全部数据」；
    3. 区分度表格直接输出 `{it.type}`（显示 `"single"`）与 `{it.grade}`（显示 `"insufficient_sample"` / `"excellent"`），未映射中文名称。
  - **期望表现**：所有 `text-overflow: ellipsis` 元素均绑定 `title` 完整文本；「清空全部学习数据」使用红色危险按钮样式（`.lv-btn--danger`）并与导出按钮拉开间距；区分度表格的题型与评级显示规范中文（如 `单选题`、`优良`、`样本不足`）。
- **解决方案**：
  - 为 `ImportStudioView.svelte:314-315`、`ReportTab.svelte:1679` 补齐 `title={doc.title}`、`title={doc.hpath}`、`title={m.root}`；
  - 在 `lv-base.scss` 补充 `.lv-btn--danger`（红字淡红底细红边）并应用于 `ReportTab.svelte:2064`；
  - 在 `ReportTab.svelte:2182,2190` 将 `{it.type}` 改为 `{t("qtype." + it.type)}`，并为 `it.grade` 映射中文标签字典。
- **成本**：`1（小）`——3 处局部模板与样式增强。
- **风险**：注意 `smoke-sample-ui.mjs` 或其他测试若通过按钮文字匹配不受类名与中文表格映射影响。

---

#### 【POOL-UI-08】令牌规范收尾：修复 `--lv-duration-micro` 拼写错误与 `.lv-report-tab` 触控高度、热力图改用数据色 `--lv-data-accent`、清除残余虚线边框与裸 Emoji
- **类型**：`技术债`（设计系统令牌一致性 · 归并 4 处同根因问题）
- **优先级**：`(影响面 2 × 频率 4) / 成本 1 = 8.00`
- **问题描述（可复现）**：
  - **位置**：
    1. `src/ui/report/ReportTab.svelte:2221,2263-2266`；
    2. `src/ui/mock/MockTab.svelte:1799,2744`、`src/scss/lv-base.scss:2032`；
    3. `src/core/forgettingRisk.ts:225-293`、`public/i18n/zh-CN.json` & `zh_CN.json`（11 处键值）。
  - **复现步骤**：
    1. 检查 `ReportTab.svelte` 报告分区切换按钮 `.lv-report-tab` 的高度（仅 `32px`，低于 44px 标准）与过渡属性（引用了未定义的 `--lv-duration-micro`），以及 53 周热力图颜色（使用了操作紫色 `--lv-accent` 而非数据晴空蓝 `--lv-data-accent`，且 hover 放大 1.15 倍跳动）；
    2. 检查 `AiStudioView` 与 `MockTab` 空状态框 `.lv-empty` / `.lv-ai-empty`（仍为 `1.5px dashed` 虚线边框）；
    3. 查看报告页遗忘风险预警文案（含 `🚨`、`⚠️`、`⚡` 等系统 Emoji）。
  - **当前表现**：存在少量历史遗留的未定义令牌名、数据/操作色混用、虚线边框和文案内的系统 Emoji，与 R54 设计规范不完全一致。
  - **期望表现**：`.lv-report-tab` 最小高度拉齐至 `40px`（窄屏 `44px`）并使用 `--lv-dur-micro`；热力图改用 `--lv-data-accent`；空状态框统一为实线细边框；界面文案中的系统 Emoji 清理为纯文本（由组件内 `<Icon>` 承载图标）。
- **解决方案**：
  - 修正 `ReportTab.svelte:2221,2263`、`MockTab.svelte:2744`、`lv-base.scss:2032` 样式规则，并清理 `forgettingRisk.ts` 及 i18n 文案中的前缀 Emoji。
- **成本**：`1（小）`——纯样式与文案微调。
- **风险**：清理 `forgettingRisk.ts` 或 `zh-CN.json` 中的 Emoji 时，需同步检索 `tests/forgettingRisk.test.ts` 等单测是否对 Emoji 字符做了字面量 `toContain` 断言，若有则一并同步单测预期。

---

#### 【POOL-FUNC-07】将 `FlowDwellTracker`（60 秒防挂机有效学习驻留计时器）正式接入做题会话与模考耗时统计
- **类型**：`功能`（半成品闭环）
- **优先级**：`(影响面 3 × 频率 4) / 成本 1 = 12.00`（消除挂机离开导致单题平均用时与时间预算失真的问题，收口 `PracticeSessionView.svelte:331` 半成品实例）
- **问题描述（可复现）**：
  - **位置**：`src/ui/practice/PracticeSessionView.svelte:331,360`、`src/ui/practice/PracticeTab.svelte:3205`、`src/core/flowTimer.ts`。
  - **复现步骤**：进入做题会话，停留在第 1 题不做任何鼠标/键盘操作挂机 5 分钟，随后选 A 提交，查看该题作答事件 `timeMs`。
  - **当前表现**：`PracticeSessionView.svelte:331` 虽然实例化了 `const dwellTracker = new FlowDwellTracker(60_000)`，但从未调用 `dwellTracker.startQuestion()`、`dwellTracker.recordInteraction()` 或 `dwellTracker.consumeDwellMs()`；`PracticeTab.svelte:3205` 仍使用 `Date.now() - answerStart` 计算 `timeMs`，导致挂机 5 分钟被原样记入单题耗时（300,000ms），严重污染 `timeBudget.ts`（每日预计耗时）与 `stubborn.ts`（耗时超标顽疾判定）。
  - **期望表现**：切题时重置 `dwellTracker`，用户在会话界面产生指针/按键交互时更新活跃时间戳，提交作答时通过 `dwellTracker`（单次静默超 60 秒自动截断）获取真实有效驻留耗时 `timeMs`。
- **解决方案**：
  - 将 `dwellTracker` 提升至 `PracticeTab.svelte`（或通过回调暴露），在 `restoreQuestionControls` / 切题时调用 `dwellTracker.start(Date.now())`，在会话区 `onpointerdown` / `onkeydown` 时调用 `dwellTracker.touch(Date.now())`，在 `submitAnswer` 时用 `dwellTracker.flush(Date.now())` 替代 `Date.now() - answerStart`。
- **成本**：`1（小）`——`src/core/flowTimer.ts` 核心类已实现并通过单测，仅需在 `PracticeTab.svelte` 替换 `answerStart` 差值。
- **风险**：需确保自动化测试中瞬时提交（`elapsed < 60_000`）时返回值与原 `Date.now() - answerStart` 完全一致。

---

#### 【POOL-FUNC-08】为 `ExamApp` 已实现的 6 组高阶备考引擎补齐前端 UI 入口（消除“有内核无界面”半成品状态）
- **类型**：`功能`（未接线半成品收口 · 归并 6 个同根因模块）
- **优先级**：`(影响面 4 × 频率 3) / 成本 3 = 4.00`（功能价值高，涉及多处二级面板 UI 入口补齐，适合作为独立功能批次推进）
- **问题描述（可复现）**：
  - **位置**：`src/app.ts` 第 `1512`、`2660`、`3284`、`3348`、`3417`、`3450` 行及对应 `src/core/` 模块。
  - **复现步骤**：在界面各面板寻找以下已在 `src/core/` 与 `src/app.ts` 完整实现并宣称闭环的 6 项能力入口：
    1. **错题四要素结构化自诊断**（`selfDiagnosis.ts`：`saveWrongDiagnosis` / `getLatestDiagnosis` / `exportDiagnosisMarkdown`）；
    2. **动态目标水平 CAT 自适应抽题**（`adaptiveTarget.ts`：`createAdaptiveTargetSession`）；
    3. **考纲两版结构化对比与变动分析**（`syllabusDiff.ts`：`assessSyllabusChange` / `exportSyllabusDiffMarkdown`）；
    4. **错因高频思维陷阱与干扰项挖掘**（`misconception.ts`：`diagnoseQuestionMisconceptions` / `exportQuestionMisconceptionMarkdown`）；
    5. **模考全真冻结卷快照存档管理**（`paperSnapshot.ts`：`savePaperSnapshot` / `listPaperSnapshots` / `deletePaperSnapshot`）；
    6. **可重建便携练习集存档（`.examset.json`）与完整性 CSV 导出**（`rebuildableSet.ts`：`savePracticeSetSpec` / `rebuildPracticeSet`；`dataIntegrity.ts`：`exportIntegrityCsv`）。
  - **当前表现**：上述 6 组能力在 `src/core/` 与 `src/app.ts` 中代码完备、单测齐全，但在 `src/ui/` 的 Svelte 组件中调用次数为 `0`，用户在界面上无法触发和使用。
  - **期望表现**：在对应的自然业务面板中提供简洁、非侵入的触发入口，打通从界面输入到结果展示/导出的完整闭环。
- **解决方案**：
  1. 在 `EntryStudioView` 训练模式区或智能特训入口增加「CAT 自适应水平测试」按钮，调用 `app.createAdaptiveTargetSession` 启动会话；
  2. 在 `PracticeDoneCard` 与 `WrongbookStudioView` 的「复盘反思」中支持四要素诊断填写（错因分类/盲区考点/突破口/防范举措）与 Markdown 导出，调用 `saveWrongDiagnosis` / `exportDiagnosisMarkdown`；
  3. 在 `BrowseMaintenanceDrawers` 的「考纲对照」抽屉增加「与旧版考纲对比」折叠区，调用 `assessSyllabusChange` 与 `exportSyllabusDiffMarkdown`；在「题库健康」孤儿诊断旁增加「导出完整性 CSV」（`exportIntegrityCsv`）；
  4. 在 `ReportTab` 的「考点与错题」分面增加「高频思维陷阱与干扰项诊断」卡片与导出按钮，调用 `diagnoseQuestionMisconceptions`；
  5. 在 `MockTab` 成绩单与历史记录中接入 `savePaperSnapshot` / `listPaperSnapshots` 查看冻结卷快照；在 `BrowseBatchActionBar` 或 `TeacherWorkspaceView` 增加「导出/载入便携练习集 (`.examset.json`)」。
- **成本**：`3（大）`——涉及 6 个子面板的 UI 按钮与结果展示接线，建议拆分为 2 个子批次或放在第三批集中完成。
- **风险**：新增二级入口时需严格遵守 R54 渐进式披露原则（`progressive-disclosure`），置于折叠面板或二级工具区，不得堆砌在首屏或顶栏。

---

## 三、 后续开发分批执行建议（可直接按批取用）

按 **「先修缺陷与数据/视觉失真 → 再补核心链路断裂与模态无障碍 → 最后收口未接线高阶功能与技术债」** 的原则，将全部 16 条待办划分为 4 个可在单轮对话内稳妥完成的批次：

### 第一批（最高优先：核心视觉失真与数据逆操作/持久化缺陷清零 · 共 4 项）
1. **`POOL-UI-01`**（优先级 `25.00` · 成本 `小`）：清理 `ReportTab`、`MockTab`、`PracticeSessionView` 局部重复 `.lv-chip*` / `.progress` 样式，恢复全应用语义色徽章与 4.5:1 无障碍对比度。
2. **`POOL-UI-02`**（优先级 `16.00` · 成本 `小`）：同步 `Rail.svelte` 容器查询断点至 `1119px`，修复 `1081px–1119px` 侧栏文字挤压溢出。
3. **`POOL-FUNC-02`**（优先级 `16.00` · 成本 `小`）：修复纸面背诵模式（接入 `recitePool` 毕业出清池、传入真实 `timeMs` 耗时、补齐进度暂存/退出确认与完成时 `flush` + 打卡同步）。
4. **`POOL-FUNC-01`**（优先级 `15.00` · 成本 `小`）：修复元数据勘误撤销双重反转 Bug、补齐题目首次编辑前的初始基线版本快照、补齐纸笔回录 `app.flush()`。

### 第二批（核心做题/录题/调度五步链路闭环 · 共 4 项）
1. **`POOL-FUNC-04`**（优先级 `12.00` · 成本 `小`）：补齐手工录题草稿 5 个扩展字段持久化，修复「衍生变式题」规格继承与 `q.family.parentId` 母题绑定。
2. **`POOL-FUNC-05`**（优先级 `12.00` · 成本 `小`）：打通首页今日计划与「每日一练」的 `dueQuestions` 到期闪卡供给，将「考前冲刺」切换至 `emergencyCramDrill` 引擎。
3. **`POOL-FUNC-07`**（优先级 `12.00` · 成本 `小`）：将 `FlowDwellTracker`（60s 防挂机有效驻留计时）正式接入做题会话 `submitAnswer`。
4. **`POOL-FUNC-03`**（优先级 `8.00` · 成本 `中`）：将受助暴露 `exposures`、草稿纸内容随会话快照持久化（防刷新洗白独立资格），修复第 1 阶考点提示侧栏提前泄题与受助记录。

### 第三批（跨面板导航、首屏可达性、窄屏防遮挡与无障碍统一 · 共 5 项）
1. **`POOL-UI-04`**（优先级 `12.00` · 成本 `小`）：修复窄屏（`≤759px`）下 `BrowseBatchActionBar` 与浮动答题卡胶囊遮挡底部任务导航栏问题。
2. **`POOL-FUNC-06`**（优先级 `9.00` · 成本 `小`）：修复 `openSiYuanTarget` 优先走原生 `openTab`、教师台「查看试题诊断」直达 `quality` 分面、挑战码导入接入 `safeStart` 与快照恢复。
3. **`POOL-UI-05`**（优先级 `9.00` · 成本 `小`）：为 `BankGalleryModal`、`SessionSheetModal`、`ShortcutsHelpModal` 与模考快捷答题卡统一补齐 Focus Trap、`inert` 与关闭焦点归还。
4. **`POOL-UI-06`**（优先级 `9.00` · 成本 `小`）：将手工录题 OCR 图片上传改为可聚焦 `<button>`，模考复用 `<ScratchpadDrawer>`，补齐 9 处控件 `aria-label` / `aria-pressed` / `aria-expanded`。
5. **`POOL-UI-03`**（优先级 `8.00` · 成本 `中`）：将模考配卷页「开始模考」与预设选择提升至首屏顶部动作行，收敛报告页与练习页顶栏在窄屏下的折行高度。

### 第四批（高阶未接线引擎 UI 收口与设计令牌技术债清理 · 共 3 项）
1. **`POOL-UI-07`**（优先级 `9.00` · 成本 `小`）：补齐长文本省略号 `title` 提示、报告页「清空全部数据」危险红样式隔离、区分度明细表枚举中文化。
2. **`POOL-UI-08`**（优先级 `8.00` · 成本 `小`）：修复 `--lv-duration-micro` 变量名拼写与 `.lv-report-tab` 高度、热力图改用 `--lv-data-accent`、清除残余虚线边框与文案 Emoji。
3. **`POOL-FUNC-08`**（优先级 `4.00` · 成本 `大`）：为 `ExamApp` 已实现的 6 组高阶方法（CAT 自适应抽题、四要素自诊断、考纲两版对比、高频思维陷阱分析、模考冻结卷快照管理、便携练习集 `.examset.json` 与完整性 CSV 导出）补齐二级 UI 入口。
