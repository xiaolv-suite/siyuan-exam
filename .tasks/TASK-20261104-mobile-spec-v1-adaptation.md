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
   - 补充 7 项 Mobile Spec v1 自动化单元测试，覆盖移动端检测、全屏 Dialog 降级、单例聚焦、二级行动、穿透搜索、下拉关闭手势以及交卷成功/特训组卷完成的触感震动反馈。
9. 触感全面补齐：
   - 模考与练习“交卷成功”（`notifyMockFinishCard`、`notifyPracticeFinishCard`、`MockTab.svelte` finishExam）时调用 `lvLaunchpad.haptic(10)`；
   - “特训组卷完成”（`weakSpotDrill`、`startWeakSpotTraining`、`startWrongQuestionsDrill`）时调用 `lvLaunchpad.haptic(10)`。
10. 第二轮真机教训审计与深化：
   - **Esc-only 关闭面补全**：在 `Palette.svelte`（命令面板）、`MaterialsView.svelte`（划词工具栏）、`BrowseStudioView.svelte`（更多操作下拉项）等全面补充可见关闭按钮 ✕，避免手机无 Esc 键导致卡死；
   - **焦点移除卡死审计**：所有模态抽屉（`BankGalleryModal`、`ShortcutsHelpModal`、`SessionSheetModal`、`QuestionPeekDrawer`、`Palette`、`Rail`）焦点归还增加 `isConnected` 保护，销毁重算；
   - **svgIcon 一致性**：确认 `lvLaunchpad.register` 注册的 `icon-lv-exam` 与 `addIcons` 注入的真实 `<symbol id="icon-lv-exam">` 逐字完全一致；
   - **长会话进度保护（armExamHistory / disarmExamHistory）**：答题与模考进入时压入 `{ lvExam: true }`，监听 `popstate`，Android 返回手势触发时弹出思源确认框「考试进行中，确认退出？（进度将保存至草稿）」，取消则重压恢复占位，确认则存草稿后退出，交卷后回退清理；
   - **500ms 防抖落盘草稿**：答题与填空选定后 500ms 防抖持久化会话草稿，退出后重新进入随时可恢复「上次未交卷」；
   - **模考锁屏/切后台绝对时间戳补偿**：基于 `visibilitychange`、`onfocus` 与 `onpageshow` 在回前台时基于 `Date.now()` 绝对时间差补偿重算剩余时间，不依赖休眠时被冻结的 `setInterval`。
11. 手机端与全量细节自查打磨轮（12 类通用自查 + 2 项专项疑点）：
   - **资源生命周期**：复核并修正 `bankExportService.ts`、`PaperAssembleModal.svelte`、`printPaperService.ts`、`ReportTab.svelte` 中全部 8 处 `createObjectURL`，统一采用 `setTimeout(..., 0)` / `window.setTimeout(..., 1000)` 异步延迟销毁；
   - **竞态时序**：确认 `PracticeTab`（`questionLoadSeq`、`activeBankId`）与 `MockTab`（`runSaveRevision`）异步回调代际校验完备，布局测量均由 `requestAnimationFrame` 驱动；
   - **剪贴板反馈**：补齐 `bankDocSyncService.ts`、`challengeService.ts`、`PracticeTab.svelte` 外链复制等剪贴板失败分支及不可用 fallback 提示；
   - **焦点管理**：所有弹窗与抽屉均集成焦点陷阱，关闭时校验 `target?.isConnected` 安全回退；
   - **对比度令牌**：`--lv-on-accent` 升级为 `var(--b3-theme-on-primary, #ffffff)`，完美适应明亮/暗黑及第三方主题；
   - **移动端输入**：所有数字输入均带 `inputMode="numeric"`，框架层 `form-input.svelte` 已统一透传；
   - **时序边界**：`MockRecord` 增加 `submittedAt` 记录，模考跨日场次开考时刻（`startedAt`）与交卷时刻（`submittedAt`）双锚定无歧义；
   - **i18n 对齐**：1572 个键全量对齐（0 漂移、0 缺失）；
   - **HTML 规范**：通用弹窗按钮补齐 `type="button"` 显式声明；
   - **XSS 防御**：`PaperPresentationModal.svelte` 中所有试题题干、选项、解析插值补齐 `sanitizeRichHtml` 与 `renderInlineText` 消毒防护；
   - **渲染粒度**：`SessionSheetModal.svelte` 答题卡查题由 O(N²) 优化为 `Map` O(1) 瞬时查询；
   - **状态时效**：全量异步操作均在 `try...finally` 中按次可靠重置 busy/error 状态；
   - **专项疑点 1**：选项 `.lv-opt` 及其所有子节点全面配置 `-webkit-touch-callout: none !important; user-select: none !important;`，彻底杜绝 iOS Safari / Android Chrome 长按弹出系统菜单；
   - **专项疑点 2**：意外退出（进程被杀）后，通过 `resumeSession`、`loadMockRun` 与首页横幅三级联动，草稿完整可恢复。

---

## 三、 质量门禁与验收

- `pnpm run check`: 0 errors, 0 warnings (types, svelte, i18n, arch, styles 100% 通过)；
- `pnpm test`: 242 passed (1919 unit tests 全部绿灯通过)；
- `pnpm run build`: 生产打包成功。
