# [TASK-20261104-mobile-spec-v1-adaptation] 小驴考试 · 手机端完整开发 Mobile Spec v1 实施记录

- **任务状态**: `completed`
- **目标插件**: `小驴考试 (siyuan-exam)`
- **核心依赖**: `src/libs/lv-notice-kit.ts` (Protocol v1.6.0 Mobile Launchpad Standard)
- **标准协议**: Epoch 7 Phase 5/7 · Mobile Spec v1

---

## 一、 背景与改造目标

针对思源手机端环境下插件无入口、不支持 custom tab 以及移动端触控交互体验缺陷，执行 Mobile Spec v1 全面适配：
1. **阻断级宿主修复**：思源手机端不支持 `openTab` custom tab；检测 `isMobile` 时将 `openTabByType` 降级为全屏 Dialog 承载 `PracticeTab.svelte`（`100vw/100dvh` + safe-area + touch-action + 统一浮层栈 Esc/返回键及下拉关闭）；桌面端保持原自定义页签逻辑不变；
2. **手机入口统一**：保留桌面原有 topBar，移动端自动挂载 `lvLaunchpad.ensureMobileEntry()`（罗盘顶栏+悬浮球双入口），并在 `onunload` 规范注销；
3. **罗盘二级行动重写**：将 `lvLaunchpad.register` 的二级行动重写为 4 个手机直办动作（`继续上次练习`、`错题复仇特训`、`每日一练`、`全真计时模拟考试`），并在 `lvOmnisearch` 穿透搜索中补齐题库高频实体；
4. **答题页移动化**：选项采用纵向大按钮排布（`≥52px`）、支持单题纵向滚动、CBM 确定度 G 键改为长按选项 600ms 或双击快捷标记（触发 `haptic(10)` 与胶囊提示）；草稿纸入口收进工具栏并支持放大全屏；
5. **主界面前显与后收**：前显快速练习三卡、每日一练英雄卡、成绩速览；题库管理、录题工坊、批量导入向导、模考历史在移动端折叠；列表分页首屏限制为 `≤50` 条。

---

## 二、 落地改造清单

1. `src/index.ts`：
   - 增加移动端检测逻辑：`this.isMobile = getFrontend() === "mobile" || getFrontend() === "browser-mobile" || lvLaunchpad.isMobileFrontend()`;
   - `openTabByType` 降级逻辑：`isMobile` 时调用 `openMobileDialog` 渲染全屏 Dialog，支持单例聚焦、统一浮层栈 Esc / Android 返回键与顶部下拉下滑关闭手势；
   - 挂载 `lvLaunchpad.ensureMobileEntry()` 补齐手机端罗盘入口，并在 `onunload` 中统一清理 `closeMobileDialog()` 与 `launchpadMobileCleaner`；
   - 重写 `lvLaunchpad.register` actions 为 4 个手机直办快捷行动；
   - 实现 `resumeLastPractice()` 与 `startWrongQuestionsDrill()` 快捷调度方法；
   - 增强 `searchOmni` 穿透搜索：覆盖题库名称与分类等高频实体。
2. `src/index.scss`：
   - 增加 `.lv-exam-mobile-dialog` 样式规则：`100vw/100dvh`、safe-area 边距填充、`touch-action: manipulation` 与紧凑 44px 标题栏。
3. `src/ui/practice/PracticeSessionView.svelte`：
   - 选项 `.lv-opt` 增加 `min-height: 52px;`、`touch-action: manipulation;`、纵向排布；
   - 新增 `handleOptionTouchStart` / `handleOptionTouchEnd`（长按 600ms）与 `handleOptionDblClick`（双击）快捷标为 CBM 确定度“蒙的/猜测”，并派发 `lvLaunchpad.haptic(10)`；
   - 作答提交与切题操作增加轻触感振动 `haptic(10)`；
   - 单题容器 `.lv-session-grid` 在窄屏下支持自适应纵向平滑滚动。
4. `src/ui/practice/ScratchpadDrawer.svelte`：
   - 新增 `isExpanded` 全屏/放大模式切换按钮，支持文本演算与数理草图画布尺寸自适应放大。
5. `src/ui/shared/Rail.svelte`：
   - 底部任务导航收敛为严格 5 项（`today`、`bank`、`create`、`mock`、`report`），触控尺寸 `52px`（≥44px），点击派发 `lvLaunchpad.haptic(10)`。
6. `src/ui/practice/EntryStudioView.svelte`：
   - 首页前显“快速练习三卡”（继续上次练习、错题复仇特训、薄弱10题特训）、每日一练与成绩速览；
   - 题库管理、录题工坊、导入向导在移动端收折叠至 `<details class="lv-mobile-folded-section">`，桌面端网格平铺保持不变。
7. `src/ui/practice/PracticeTab.svelte`：
   - 题库浏览与错题本列表分页上限由 200 调整为 `50`，严格执行首屏 `<= 50` 条性能纪律。
8. `tests/mobileSpecV1.test.ts`：
   - 补充 6 项 Mobile Spec v1 自动化单元测试，覆盖移动端检测、全屏 Dialog 降级、单例聚焦、二级行动、穿透搜索及下拉关闭手势。

---

## 三、 质量门禁与验收

- `pnpm run check`: 0 errors, 0 warnings (types, svelte, i18n, arch, styles 100% 通过)；
- `pnpm test`: 242 passed (1915 unit tests 全部绿灯通过)；
- `pnpm run build`: 生产打包成功。
