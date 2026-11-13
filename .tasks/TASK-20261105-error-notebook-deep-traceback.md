# [TASK-20261105-error-notebook-deep-traceback] 小驴考试 · 断点消除战役 · Error Notebook Deep Traceback 实施记录

- **任务状态**: `completed`
- **目标插件**: `小驴考试 (siyuan-exam)`
- **核心模块**: `src/ui/practice/services/tracebackService.ts`
- **联动契约**: 脉冲动画全局唯一类名 `.lv-exam-trace-pulse`，动画完成后彻底恢复原始属性；桌面/移动分流定位；已删笔记优雅容错。

---

## 一、 背景与业务目标

错题不应成为孤岛。当考生在错题本复习某道错题时，能够一键穿透秒切回该试题在思源笔记中摘录的原笔记段落或上下文块，使“错在哪”立刻联通“知识点讲什么”。

---

## 二、 落地改造清单

1. **定位按钮** (`src/ui/practice/WrongbookStudioView.svelte`)：
   - 在错题列表卡片来源行增加 `📍 笔记原块上下文` 可点击操作按钮；
   - 仅当试题存在思源原块血缘标识（`q.blockId`）时渲染，外部无血缘导入题目自动隐藏；
   - 覆盖在册错题 (`active`)、高危盲区 (`highrisk`)、脆弱伪掌握 (`fragile`)、已消灭 (`eliminated`) 与已归档 (`archived`) 全分栏。
2. **穿透执行与分流服务** (`src/ui/practice/services/tracebackService.ts`)：
   - **桌面端**：调用 `openTab({ app, doc: { id: blockId }, keepCursor: false })` 在工作区打开笔记，文档 DOM 就绪后为对应块定位滚动并添加临时脉冲类 `.lv-exam-trace-pulse`，2 秒后自动移除类名（若无其他类则直接 `removeAttribute("class")`，严防污染思源块属性序列化）；
   - **移动端**：调用 `openMobileFileById(hostApp, blockId)`；
   - **原笔记已删除容错**：内核在线时通过 SQL 先行探测存在性，若已被删除或 `openTab` 抛出异常，捕获并弹出微胶囊提示：「原笔记已移出，题目在考试库中安全保留」，绝不白屏崩溃。
3. **脉冲动画样式** (`src/scss/lv-base.scss`)：
   - 定义 `@keyframes lvExamTracePulse`，关键帧仅使用 `transform` 与 `opacity`，启用 GPU 合成层，零重排开销。
4. **来源文档聚合筛选** (`src/ui/practice/services/wrongbookDispositionService.ts` & `WrongbookStudioView.svelte`)：
   - 筛选栏新增「来源文档」下拉框，数据源自动提取错题集内去重 `docId` 与 `hpath` / `source`；
   - 与现有题型、考点、错因、顽疾筛选条件无缝组合过滤。
5. **自动化单测套件** (`tests/tracebackService.test.ts`)：
   - 9 项单测覆盖脉冲添加与恢复、桌面分流、移动分流、文档删除容错、异常捕获、文档聚合提取、组合过滤与条件按钮渲染分支。

---

## 三、 质量门禁与验收

- `pnpm run check`: 0 errors, 0 warnings (types, svelte, i18n, arch, styles 100% 全部通过)；
- `pnpm test`: 243 passed (1928 unit tests 全部绿灯通过)；
- `pnpm run build`: 生产打包成功输出 `package.zip`。
