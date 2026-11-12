# [TASK-20261103-phase7-omnisearch-and-automation] 小驴考试 · 第七阶段：穿透搜索与跨插件自动化联动工单

- **任务状态**: `completed`
- **目标插件**: `小驴考试 (siyuan-exam)`
- **核心套件源**: `src/libs/lv-notice-kit.ts` (Protocol v1.6.0 Omnisearch & Automation Standard)
- **标准协议**: Epoch 7 Phase 7 · 穿透搜索与跨插件自动化联动

---

## 一、 背景与改造目标

1. **接入全生态万物穿透搜索 (lvOmnisearch)**：
   - 用户在任意小驴插件呼起全局穿透搜索时，本插件提供题库试题与错题本试题的毫秒级全文匹配；
   - 支持返回题目题干、解析、考点标签与所属分类，并支持点击直达（错题直达错题本，题库试题直达浏览台）；
   - 在 `onload` 中向总线注册搜索提供者：
     ```typescript
     this.omnisearchCleaner = lvOmnisearch.registerProvider(
         "siyuan-exam",
         (keyword) => this.searchOmni(keyword)
     );
     ```
   - 在 `onunload` 中调用 `this.omnisearchCleaner?.()` 干净注销。

2. **触发跨插件智能自动化联动 (lvAutomation)**：
   - 答题判错产生错题时，自动广播 `wrong-question` 自动化事件：
     ```typescript
     import { lvAutomation } from "./libs/lv-notice-kit";

     await lvAutomation.trigger("siyuan-exam", "wrong-question", {
         questionId: q.id,
         title: q.title,
         analysis: q.analysis,
         docId: q.docId,
     });
     ```
   - 供下游插件（如闪卡、今日打卡、常用知识库）监听并自动执行制卡、扣减掌握度或归集。

---

## 二、 实施记录与验收结论

- **完成日期**: 2026-11-03
- **落地改造**:
  1. `src/libs/lv-notice-kit.ts`：更新协议至 Protocol v1.6.0，提供 `lvOmnisearch` 穿透搜索引擎与 `lvAutomation` IFTTT 联动引擎；
  2. `src/app.ts`：在控制器层提供 `triggerWrongQuestionAutomation(q)` 统一联动触发接口；
  3. `src/ui/practice/services/sessionLifecycleService.ts`：在日常练习单题作答判错（`verdict === "wrong"`）时触发 `app.triggerWrongQuestionAutomation(q)`；
  4. `src/ui/mock/MockTab.svelte`：在全真模拟考试交卷作答判错（`verdict === "wrong"`）时触发 `app.triggerWrongQuestionAutomation(q)`；
  5. `src/libs/notice.ts`：对外导出便捷包装方法 `triggerWrongQuestionAutomation(q)`；
  6. `src/index.ts`：
     - 在 `onload()` 中调用 `lvOmnisearch.registerProvider("siyuan-exam", ...)` 注册穿透搜索提供者；
     - 实现 `searchOmni(keyword)`：并发遍历各题库并索引题干、解析与考点，对活跃错题标记「错题本」分类与「错题」徽标，支持点击精准直达；
     - 在 `onunload()` 中调用 `this.omnisearchCleaner?.()` 规范注销；
  7. `tests/noticeKit.test.ts`：补充 `Epoch 7 Phase 7` 单元测试，覆盖 `lvOmnisearch` 题目检索与 `lvAutomation` 跨插件错题联动触发。
- **质量门禁验证**:
  - `pnpm run check`: 0 errors, 0 warnings，全量类型/Svelte/i18n/架构/样式检查 100% 通过；
  - `npx vitest run`: 241 passed (241 test files, 1906 unit tests 全部绿灯通过)；
  - `pnpm run build`: 生产打包成功并输出 `package.zip`；
  - 严格本地 Git Commit，严禁 git push。
