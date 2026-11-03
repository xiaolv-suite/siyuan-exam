# [TASK-20261103-phase2-resource-concurrency] 小驴考试 · 第二阶段：系统资源与并发加固落地工单

- **任务状态**: `completed`
- **目标插件**: `小驴考试 (siyuan-exam)`
- **核心库源**: `src/libs/lv-notice-kit.ts` (或 `src/render/lv-notice-kit.ts`)，已升级至 Protocol v1.1.0 标准
- **标准协议**: Epoch 7 Phase 2 · 资源节约与并发排队

---

## 一、 第二阶段核心改造目标

1. **消除定时器风暴 (lvTicker)**：
   - 彻底拔除本插件内原本散乱的 `setInterval`；
   - 接入统一后台主时钟，由单例主时钟按周期或每分钟统一对齐触发；
   - 思源窗口最小化时自动享受 60 秒降频节电（Low Power Mode），降低 75% CPU 唤醒耗电；
   - 接入 `lvTicker.onDateCross`，零点精准触发跨日，不再自行反复轮询算日期。
2. **消除内核写锁死 (withDocLock)**：
   - 思源内核文档写入是非线程安全的，并发写入会抛出 `document is locked`；
   - 向思源文档（特别是当天同一篇 Daily Note 或大纲）执行 `appendBlock` / `putFile` 等异步写操作时，使用 `withDocLock(docId, async () => { ... })` 排队串行执行。
3. **统一 Esc 键浮层栈 (lvSurfaceStack)**：
   - 菜单、抽屉、自定义弹窗打开时压栈 `lvSurfaceStack.push({ id, dismiss })`；
   - 捕获阶段拦截 Esc，只关栈顶，绝不穿透误关底层窗口。

---

## 二、 本插件专属改造重点

1. **巡检定时器收敛**：将 src/core/reviewReminder.ts 的 reviewReminder 巡检定时器替换为 lvTicker.onMinute("siyuan-exam", () => checkAndNotify())；
2. **跨日刷新**：接入 lvTicker.onDateCross，零点自动更新今日待复习错题集；
3. **交卷归档锁**：自动交卷保存成绩与错题快照时，使用 withDocLock 保护文档写入。

---

## 三、 质量门禁与验收标准

1. **类型检查**：运行 `pnpm run check` 或 `tsc --noEmit`，确保 0 报错；
2. **测试门禁**：运行 `pnpm test` 确保全量测试 100% 通过；
3. **任务状态回写**：完成后将本文首行 `- **任务状态**: `pending`` 改为 `completed`；
4. **严格本地提交**：使用 Conventional Commit 规范（如 `feat(core): integrate lvTicker and withDocLock for phase 2 resource hardening`），**严禁 git push**。

---

## 四、 实施记录与验收结论

- **完成日期**: 2026-11-03
- **落地改造**:
  1. `src/core/reviewReminder.ts`：将独立的 `setInterval` 定时器收敛至全局单例 `lvTicker.onMinute("siyuan-exam", () => checkAndNotify())`；
  2. `src/core/reviewReminder.ts` & `src/index.ts` & `src/ui/practice/PracticeTab.svelte`：接入 `lvTicker.onDateCross`，零点精准触发跨日广播，自动刷新今日待复习错题集与学习计划；
  3. `src/app.ts` & `src/ui/mock/MockTab.svelte`：在模考交卷写入成绩单文档、追加今日日记文档（`appendBlock`）、生成错题集文档（`saveQuestionsToSiyuanDoc`）时，全面使用 `withDocLock` 互斥排队串行写保护，彻底消除 `document is locked` 冲突；
  4. `src/core/bus.ts`：登记 `date-crossed` 总线事件，确保事件分发类型安全。
- **质量门禁验证**:
  - `pnpm run check`: 0 errors, 0 warnings，类型/Svelte/i18n/架构一致性 100% 通过；
  - `npx vitest run`: 241 passed (241 test files, 1898 unit tests green)；
  - `pnpm run build`: 生产构建成功，生成 `package.zip`；
  - 严格本地 Git Commit，严禁 git push。
