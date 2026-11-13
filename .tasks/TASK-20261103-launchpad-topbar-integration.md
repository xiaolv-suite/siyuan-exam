# [TASK-20261103-launchpad-topbar-integration] 小驴考试 · 小驴罗盘顶栏收敛与二级行动极速直达接入工单

- **任务状态**: `completed`
- **目标插件**: `小驴考试 (siyuan-exam)`
- **核心套件源**: `src/libs/lv-notice-kit.ts` (Protocol v1.4.0 Launchpad Standard)
- **标准协议**: Epoch 7 Phase 5 · 顶栏收敛与极速直达

---

## 一、 背景与改造目标

为了解决小驴系列 9 大插件在思源顶栏图标过度拥挤（一排 9 个小图标挤占顶栏）、找插件困难的痛点，全生态推行「小驴罗盘 · 家族极速弹射坞」：
1. **自动出场**：装有 >= 2 个小驴插件时，顶栏自动收拢并升起【🐴 小驴罗盘】主入口，顶栏空间节省 80%；只有 1 个插件时自动退化为普通独立图标；
2. **三态呈现权限**：用户可在罗盘设置中自主决定本插件【📌 置顶在外 / 📥 仅在坞内 / 👁️ 彻底隐藏】；
3. **图标为绝对第一主角**：采用思源原生 1.85px 纯线条矢量 SVG 图标，消灭遮挡；
4. **二级快捷行动常驻**：提供 4~5 项真实业务深度操作，默认展示前 3 项。

---

## 二、 本插件标准接入代码

```typescript
import { lvLaunchpad } from "./libs/lv-notice-kit";

// 在 onload 中注册到小驴罗盘：
this.launchpadCleaner = lvLaunchpad.register({
    id: "siyuan-exam",
    name: "考试",
    fullName: "小驴考试",
    svgIcon: "icon-lv-exam",
    color: "#3b82f6",
    desc: "题库刷题 · 错题特训",
    digit: 5,
    badge: "今日待测",
    badgeType: "primary",
    actions: ["开启薄弱知识点10题特训", "打开今日错题本复习", "开启全真计时模拟考试", "导入新试卷与Markdown题库"],
    onClick: () => this.openExamHome(),
    onAction: (action) => this.handleQuickAction(action),
});
// 在 onunload 中：
this.launchpadCleaner?.();
```

---

## 三、 质量门禁与验收标准

1. **类型检查**：运行 `pnpm run check` 或 `tsc --noEmit`，确保 0 报错；
2. **测试门禁**：运行 `pnpm test` 确保全量测试通过；
3. **任务状态回写**：完成后将首行 `- **任务状态**: `pending`` 改为 `completed`；
4. **严格本地提交**：Conventional Commit 规范（如 `feat(launchpad): integrate lvLaunchpad entry with secondary actions`），**严禁 git push**。

---

## 四、 实施记录与验收结论

- **完成日期**: 2026-11-03
- **落地改造**:
  1. `src/libs/lv-notice-kit.ts`：更新协议至 Protocol v1.4.0，集成 `lvLaunchpad` 罗盘坞引擎，支持三态呈现 (`pinned` / `docked` / `hidden`) 与 `lv_launchpad_states` 状态持久化；
  2. `src/index.ts`：
     - 在 `this.addIcons(...)` 中注册符合思源 1.85px 原生线条标准的矢量图标 `<symbol id="icon-lv-exam">`；
     - 在 `onload()` 中调用 `this.launchpadCleaner = lvLaunchpad.register({ ... })` 向小驴罗盘注册极速直达入口；
     - 实现 `openExamHome()` 直达考试主页，以及 `handleQuickAction(action)` 响应 4 大二级行动（薄弱知识点特训、今日错题本复习、全真模拟考试、导入题库）；
     - 实现 `startWeakSpotTraining(count)` 算法：基于全卷题库考点掌握度衰减与错题本提取 Top 薄弱根标签，利用 `sampleWeakSpotDrill` 智能组卷发起靶向特训；
     - 在 `onunload()` 中执行 `this.launchpadCleaner?.()` 规范注销；
  3. `tests/noticeKit.test.ts`：补充 `Epoch 7 Phase 5` 自动化单测，覆盖注册、三态切换、主入口点击与二级行动响应链路。
- **质量门禁验证**:
  - `pnpm run check`: 0 errors, 0 warnings，全量类型/Svelte/i18n/架构/样式检查 100% 通过；
  - `npx vitest run`: 241 passed (241 test files, 1904 unit tests 全部绿灯通过)；
  - `pnpm run build`: 生产打包成功并输出 `package.zip`；
  - 严格本地 Git Commit，严禁 git push。

