# [TASK-20261103-phase4-full-backup-and-finale] 小驴考试 · 第四阶段：全家桶一键联合灾备与终局闭环工单

- **任务状态**: `completed`
- **目标插件**: `小驴考试 (siyuan-exam)`
- **核心库源**: `src/libs/lv-notice-kit.ts` (已升级至 Protocol v1.3.0 终局版)
- **标准协议**: Epoch 7 Phase 4 · 全生态联合灾备与自省闭环

---

## 一、 第四阶段核心改造目标

1. **全家桶一键联合灾备切面 (lvBackup)**：
   - 换机或备份时，用户可在任意小驴插件一键导出/导入全生态总包；
   - 本插件只需在 `onload` 中向总线登记备份生成与恢复函数：
     ```typescript
     this.backupCleaner = lvBackup.register(
         "siyuan-exam",
         async () => this.dumpData(),
         async (data) => this.restoreData(data)
     );
     ```
   - 在 `onunload` 时调用 `this.backupCleaner?.()` 干净注销。
2. **全生态健康自省与指示徽章 (lvEcosystem)**：
   - 在本插件的设置页或状态概览底部，嵌入调用 `lvEcosystem.getStatusBadgeText()`；
   - 动态呈现极精致的状态胶囊：`🐴 小驴全家桶协同正常 · 8 插件已联结 · 今日活动 12 项`。

---

## 二、 本插件专属改造重点

1. **注册全生态灾备切面 (lvBackup)**：注册题库索引、错题本数据与模拟考试历史记录的备份切面；
2. **考试主页展示协同徽章**：在题库管理页底部展示生态协同指示器。

---

## 三、 质量门禁与验收标准

1. **类型检查**：运行 `pnpm run check` 或 `tsc --noEmit`，确保 0 报错；
2. **测试门禁**：运行 `pnpm test` 确保全量测试通过；
3. **任务状态回写**：完成后将首行 `- **任务状态**: `pending`` 改为 `completed`；
4. **严格本地提交**：Conventional Commit 规范（如 `feat(finale): integrate lvBackup and lvEcosystem for phase 4`），**严禁 git push**。

---

## 四、 实施记录与验收结论

- **完成日期**: 2026-11-03
- **落地改造**:
  1. `src/core/attemptLog.ts`：实现 `mergeEvents(events: AttemptEvent[]): number`，支持批量合并历史作答流水并根据 `eid` 自动幂等去重；
  2. `src/app.ts`：实现 `dumpData(): Promise<Record<string, unknown>>` 与 `restoreData(data: Record<string, unknown>): Promise<boolean>`，覆盖题库索引 (`banks`)、答题流水 (`attempts`)、错题本数据 (`wrongbookOverlays`, `wrongReasons`, `wrongReflections`, `actions`, `misdiagnoses`) 与模拟考试历史记录 (`mockResults`, `mockBlueprint`)；
  3. `src/index.ts`：在 `onload` 中调用 `this.backupCleaner = lvBackup.register("siyuan-exam", ...)` 注册全生态灾备切面，在 `onunload` 中调用 `this.backupCleaner?.()` 规范注销；
  4. `src/ui/practice/BankGalleryModal.svelte`：在题库管理页（画廊模态框）底部嵌入展示全生态健康指示器徽章 `lvEcosystem.getStatusBadgeText()`；
  5. `src/ui/practice/EntryStudioView.svelte`：在考试主页底部同步嵌入展示生态协同徽章胶囊；
  6. `tests/noticeKit.test.ts`：补充 `lvBackup.register` 注册导出/恢复链路、`lvEcosystem.getDiagnostics` 诊断徽章及 `ExamApp.dumpData/restoreData` 全流程自动化单测。
- **质量门禁验证**:
  - `pnpm run check`: 0 errors, 0 warnings，全量类型/Svelte/i18n/架构/样式检查 100% 通过；
  - `npx vitest run`: 241 passed (241 test files, 1903 unit tests 全部通过)；
  - `pnpm run build`: 生产打包成功并输出 `dist` 与 `package.zip`；
  - 严格本地 Git Commit，严禁 git push。

