import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

describe("小驴考试 · 思源出题一级工作台与UI/UX契约验证", () => {
  const root = process.cwd();

  it("SiyuanStudioView.svelte 专属一级工作台组件存在且结构健全", () => {
    const file = join(root, "src/ui/practice/SiyuanStudioView.svelte");
    expect(existsSync(file)).toBe(true);
    const content = readFileSync(file, "utf8");

    // 验证核心标题与一级出题导航
    expect(content).toContain("从思源笔记提炼出题");
    expect(content).toContain("<StudioSubNav currentView=\"siyuan\"");

    // 验证聚合的 4 大思源原生出题模式
    expect(content).toContain("从思源文档提炼");
    expect(content).toContain("按标签与闪卡提炼");
    expect(content).toContain("划重点高光挖空");
    expect(content).toContain("小驴拾遗剪藏提题");

    // 验证 5 大识别场景引擎
    expect(content).toContain("🎯 智能全能");
    expect(content).toContain("📄 标准试卷");
    expect(content).toContain("📖 读书笔记");
    expect(content).toContain("⚡ 高光挖空");
    expect(content).toContain("📊 表格矩阵");

    // 验证安全只读承诺
    expect(content).toContain("只读安全保障");
  });

  it("StudioSubNav.svelte 顶部出题工作台导航将思源出题提升为一级TAB", () => {
    const file = join(root, "src/ui/practice/StudioSubNav.svelte");
    const content = readFileSync(file, "utf8");

    expect(content).toContain("currentView === \"manual\"");
    expect(content).toContain("currentView === \"siyuan\"");
    expect(content).toContain("currentView === \"import\"");
    expect(content).toContain("currentView === \"ai\"");
    expect(content).toContain("currentView === \"materials\"");
  });

  it("Rail.svelte 侧栏与快速行动包含思源出题入口", () => {
    const file = join(root, "src/ui/shared/Rail.svelte");
    const content = readFileSync(file, "utf8");

    expect(content).toContain("runQuickAction(\"siyuan\")");
    expect(content).toContain("openPracticeView(plugin, \"siyuan\")");
  });

  it("PracticeTab.svelte 一级视图路由包含 siyuan 并挂载 SiyuanStudioView", () => {
    const file = join(root, "src/ui/practice/PracticeTab.svelte");
    const content = readFileSync(file, "utf8");

    expect(content).toContain("import SiyuanStudioView from \"./SiyuanStudioView.svelte\"");
    expect(content).toContain("{:else if view === \"siyuan\"}");
    expect(content).toContain("<SiyuanStudioView");
  });

  it("ImportStudioView.svelte 外部导入页面包含前往【思源出题】工作台的互通导流卡片", () => {
    const file = join(root, "src/ui/practice/ImportStudioView.svelte");
    const content = readFileSync(file, "utf8");

    expect(content).toContain("想直接从思源笔记文档出题？");
    expect(content).toContain("onchangeView(\"siyuan\")");
  });

  it("i18n 语言字典 zh-CN 与 en 完整包含对应键", () => {
    const zh = JSON.parse(readFileSync(join(root, "public/i18n/zh-CN.json"), "utf8"));
    const en = JSON.parse(readFileSync(join(root, "public/i18n/en.json"), "utf8"));

    expect(zh["siyuan.title"]).toBe("思源出题");
    expect(en["siyuan.title"]).toBe("SiYuan Extraction");

    expect(zh["tab.siyuan"]).toBe("思源出题");
    expect(en["tab.siyuan"]).toBe("SiYuan Extraction");

    expect(zh["rail.quickSiyuan"]).toBe("思源出题");
    expect(en["rail.quickSiyuan"]).toBe("SiYuan Extraction");
  });
});
