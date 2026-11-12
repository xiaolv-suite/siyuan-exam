# [TASK-20261103-phase3-ai-and-activity] 小驴考试 · 第三阶段：AI统一网关与全生态今日活动流工单

- **任务状态**: `completed`
- **目标插件**: `小驴考试 (siyuan-exam)`
- **核心库源**: `src/libs/lv-notice-kit.ts` (已升级至 Protocol v1.2.0)
- **标准协议**: Epoch 7 Phase 3 · AI 网关与今日活动流

---

## 一、 第三阶段核心改造目标

1. **统一 AI 凭据与并发限流网关 (lvAi)**：
   - 彻底告别每个插件重复填 Key；在任一插件配置好的共享 API Key，通过 `lvAi.chat({ source, messages })` 自动继承复用；
   - 全局令牌桶自动限制最大并发（<=2），遇到 429 自动按指数退避重试，调用方零额外容灾代码；
2. **今日全生态活动主干流 (lvActivity)**：
   - 各插件的关键产出（打卡记录、剪藏文章、试卷交卷、卡片复习、人脉互动）通过 `lvActivity.record({ source, category, title })` 统一汇报；
   - 今日打卡/工作台可直接读取 `lvActivity.getTodayRecords()`，并调用 `lvActivity.formatAsMarkdown()` 一键将今日全家桶成果汇编入 Daily Note！

---

## 二、 本插件专属改造重点

1. **接入统一 AI 网关 (lvAi)**：错题 AI 解析、题目考点答疑改用 lvAi.chat({ source: "考试", messages })，无需用户单独在本插件填 Key；
2. **今日活动广播 (lvActivity)**：交卷完成出分时，广播 lvActivity.record({ source: "考试", category: "exam", title: "完成模拟试卷交卷 (得分: 92/100)", linkBlockId: examDocId })。

---

## 三、 质量门禁与验收标准

1. **类型检查**：运行 `pnpm run check` 或 `tsc --noEmit`，确保 0 报错；
2. **测试门禁**：运行 `pnpm test` 确保全量测试通过；
3. **任务状态回写**：完成后将首行 `- **任务状态**: `pending`` 改为 `completed`；
4. **严格本地提交**：Conventional Commit 规范（如 `feat(synergy): integrate lvAi and lvActivity for phase 3`），**严禁 git push**。

---

## 四、 实施记录与验收结论

- **完成日期**: 2026-11-03
- **落地改造**:
  1. `src/ai/client.ts`：实现通道 C `LvGatewayAiChannel`，直通 `lvAi.chat({ source: "考试", messages })`，享受全局并发限制（<=2）与 429 自动重试；
  2. `src/ui/practice/services/aiWorkflowService.ts`：升级 `createAiChannel` 通道分流，自动继承全生态共享 API Key，同时本插件配置专属 Key 时也自动同步回馈生态；
  3. `src/ui/practice/services/reflectionMisdiagnosisService.ts`：错题 AI 归因诊断全面接入统一网关，免配置直连大模型；
  4. `src/ui/mock/MockTab.svelte`：模考交卷出分与归档时，自动调用 `lvActivity.record({ source: "考试", category: "exam", title: "完成模拟试卷交卷 (得分: 92/100)", linkBlockId: docId })`；
  5. `src/ui/practice/PracticeTab.svelte`：练习结算出分时，自动调用 `lvActivity.record` 广播做题记录；
  6. `tests/noticeKit.test.ts`：补充 `lvAi.setConfig`、`LvGatewayAiChannel` 与 `lvActivity` 记录/汇编 Markdown 的自动化单测。
- **质量门禁验证**:
  - `pnpm run check`: 0 errors, 0 warnings，类型/Svelte/i18n/架构一致性 100% 通过；
  - `npx vitest run`: 241 passed (241 test files, 1900 unit tests 全部绿灯通过)；
  - `pnpm run build`: 生产构建成功，生成 `package.zip`；
  - 严格本地 Git Commit，严禁 git push。
