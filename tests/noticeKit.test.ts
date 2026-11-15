/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { lvNotify } from "../src/libs/lv-notice-kit";
import {
  showExamNotice,
  notifyInline,
  notifyMockFinishCard,
  notifyPracticeFinishCard,
  notifyDailyReviewCard,
} from "../src/libs/notice";

describe("小驴全生态统一通知套件 (Lv Notice Kit) 单元测试", () => {
  beforeEach(() => {
    // Browser fixture owns the same origin lock used by session export/restore.
    let lockTail: Promise<unknown> = Promise.resolve();
    vi.stubGlobal("navigator", { locks: { request: (_name: string, task: () => Promise<unknown>) => {
      const next = lockTail.then(task, task);
      lockTail = next.then(() => undefined, () => undefined);
      return next;
    } } });
    localStorage.clear();
    const host = document.getElementById("lv-notice-host");
    if (host) host.remove();
    delete (window as any).__LV_NOTICE_HUB__;
  });

  afterEach(() => {
    const hub = (window as any).__LV_NOTICE_HUB__;
    if (hub) hub.destroy();
    delete (window as any).__LV_AI_GATEWAY__;
    delete (window as any).__LV_ACTIVITY_STREAM__;
    delete (window as any).__LV_BACKUP_HUB__;
    delete (window as any).__LV_LAUNCHPAD__;
    delete (window as any).__LV_OMNISEARCH__;
    delete (window as any).__LV_AUTOMATION__;
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it("lvNotify.capsule 能够生成瞬时轻量微胶囊 DOM 元素", () => {
    const id = lvNotify.capsule({
      source: "小驴考试",
      message: "已加入星选题库",
      duration: 2000,
    });

    expect(id).toMatch(/^cap_/);
    const host = document.getElementById("lv-notice-host");
    expect(host).not.toBeNull();
    const capsule = host?.querySelector(".lv-notice-capsule");
    expect(capsule).not.toBeNull();
    expect(capsule?.textContent).toContain("已加入星选题库");
    expect(capsule?.textContent).toContain("小驴考试");
  });

  it("lvNotify.card 能够生成带标题、正文与动作按钮的 3D 毛玻璃卡片", () => {
    let actionTriggered = false;
    const id = lvNotify.card({
      source: "小驴考试",
      title: "模考交卷成功",
      message: "得分 92 / 100",
      actions: [
        {
          label: "查看错题本",
          primary: true,
          onClick: () => {
            actionTriggered = true;
          },
        },
      ],
    });

    expect(id).toMatch(/^card_/);
    const host = document.getElementById("lv-notice-host");
    const card = host?.querySelector(".lv-notice-card");
    expect(card).not.toBeNull();
    expect(card?.textContent).toContain("模考交卷成功");
    expect(card?.textContent).toContain("得分 92 / 100");

    const btn = card?.querySelector(".lv-notice-btn--primary") as HTMLButtonElement;
    expect(btn).not.toBeNull();
    expect(btn.textContent?.trim()).toBe("查看错题本");
    btn.click();
    expect(actionTriggered).toBe(true);
  });

  it("lvNotify.inline 原位微动效添加微弹动 CSS 类并在 1 秒后自动还原", () => {
    vi.useFakeTimers();
    const btn = document.createElement("button");
    btn.setAttribute("title", "原始提示");
    document.body.appendChild(btn);

    notifyInline(btn, "已标记本题");
    expect(btn.classList.contains("lv-inline-feedback-active")).toBe(true);
    expect(btn.getAttribute("title")).toBe("已标记本题");

    vi.advanceTimersByTime(1100);
    expect(btn.classList.contains("lv-inline-feedback-active")).toBe(false);
    expect(btn.getAttribute("title")).toBe("原始提示");

    btn.remove();
    vi.useRealTimers();
  });

  it("今日免打扰 (muteToday) 能够拦截同 category 的通知", () => {
    const cat = "test-mute-category";
    expect(lvNotify.isMutedToday(cat)).toBe(false);

    lvNotify.muteToday(cat);
    expect(lvNotify.isMutedToday(cat)).toBe(true);

    const id = lvNotify.card({
      source: "小驴",
      category: cat,
      message: "免打扰测试消息",
    });

    const host = document.getElementById("lv-notice-host");
    const card = host?.querySelector(`[data-id="${id}"]`);
    expect(card).toBeNull();
  });

  it("稍后提醒 (snooze) 在延期到达后会带 [稍后提醒] 前缀重新弹出", () => {
    vi.useFakeTimers();
    const id = lvNotify.card({
      source: "小驴考试",
      title: "背诵提醒",
      message: "还有 5 道词汇题待复盘",
    });

    lvNotify.snooze(id, 5000);

    // 原卡已被收起
    let host = document.getElementById("lv-notice-host");
    expect(host?.querySelector(`[data-id="${id}"]`)).toBeNull();

    // 5 秒后唤醒
    vi.advanceTimersByTime(5100);
    host = document.getElementById("lv-notice-host");
    const cards = host?.querySelectorAll(".lv-notice-card") ?? [];
    expect(cards.length).toBe(1);
    expect(cards[0].textContent).toContain("[稍后提醒] 背诵提醒");

    vi.useRealTimers();
  });

  it("registerPlugin 生命周期注册与注销交棒", () => {
    const unregister1 = lvNotify.registerPlugin("plugin-1");
    const unregister2 = lvNotify.registerPlugin("plugin-2");

    const hub = (window as any).__LV_NOTICE_HUB__;
    expect(hub).toBeDefined();
    expect(hub.hostPlugin).toBe("plugin-1");

    // 卸载 plugin-1，应无缝交棒给 plugin-2
    unregister1();
    expect(hub.hostPlugin).toBe("plugin-2");

    // 卸载 plugin-2，清理整个 Hub
    unregister2();
    expect((window as any).__LV_NOTICE_HUB__).toBeUndefined();
  });

  it("showExamNotice 对 error 输出 card，对 info 输出 capsule", () => {
    const errId = showExamNotice("存储写入失败", 5000, "error");
    expect(errId).toMatch(/^card_/);

    const infoId = showExamNotice("已更新考点", 2000, "info");
    expect(infoId).toMatch(/^cap_/);
  });

  it("notifyMockFinishCard 准确装配成绩单卡片与操作按钮", () => {
    let wrongClicked = false;
    let reportClicked = false;

    notifyMockFinishCard({
      paperName: "行测申论联合模考",
      totalScore: 78,
      fullScore: 100,
      percent: 78,
      pass: true,
      wrongCount: 6,
      onViewWrongbook: () => {
        wrongClicked = true;
      },
      onViewReport: () => {
        reportClicked = true;
      },
    });

    const host = document.getElementById("lv-notice-host");
    const card = host?.querySelector(".lv-notice-card");
    expect(card).not.toBeNull();
    expect(card?.textContent).toContain("行测申论联合模考");
    expect(card?.textContent).toContain("78 / 100");
    expect(card?.textContent).toContain("发现错题 6 道");

    const buttons = card?.querySelectorAll("[data-action-idx]");
    expect(buttons?.length).toBe(2);
    expect((buttons?.[0] as HTMLButtonElement).textContent?.trim()).toBe("查看错题解析");

    (buttons?.[0] as HTMLButtonElement).click();
    expect(wrongClicked).toBe(true);

    (buttons?.[1] as HTMLButtonElement).click();
    expect(reportClicked).toBe(true);
  });

  it("notifyPracticeFinishCard 准确装配练习结算卡片", () => {
    let wrongDrillStarted = false;
    let wrongbookViewed = false;
    notifyPracticeFinishCard({
      bankName: "微积分基础专练",
      total: 10,
      correct: 8,
      wrong: 2,
      onViewWrongbook: () => {
        wrongbookViewed = true;
      },
      onReviewWrongs: () => {
        wrongDrillStarted = true;
      },
    });

    const host = document.getElementById("lv-notice-host");
    const card = host?.querySelector(".lv-notice-card");
    expect(card?.textContent).toContain("微积分基础专练");
    expect(card?.textContent).toContain("正确率 80%");
    expect(card?.textContent).toContain("2 道错题已归集入库");

    const reviewBtn = Array.from(card?.querySelectorAll(".lv-notice-btn") || []).find((b) =>
      b.textContent?.includes("查看错题解析"),
    ) as HTMLButtonElement;
    expect(reviewBtn).toBeDefined();
    reviewBtn.click();
    expect(wrongbookViewed).toBe(true);

    const drillBtn = Array.from(card?.querySelectorAll(".lv-notice-btn") || []).find((b) =>
      b.textContent?.includes("立即消灭错题"),
    ) as HTMLButtonElement;
    expect(drillBtn).toBeDefined();
    drillBtn.click();
    expect(wrongDrillStarted).toBe(true);
  });

  it("notifyDailyReviewCard 生成带稍后提醒与今日免打扰的复习提醒卡片", () => {
    let reviewLaunched = false;
    const id = notifyDailyReviewCard({
      dueCount: 15,
      onStartReview: () => {
        reviewLaunched = true;
      },
    });

    expect(id).not.toBeNull();
    const host = document.getElementById("lv-notice-host");
    const card = host?.querySelector(".lv-notice-card");
    expect(card?.textContent).toContain("每日错题复习到期提醒");
    expect(card?.textContent).toContain("15 道待消灭错题");
    expect(card?.textContent).toContain("今日免打扰");
    expect(card?.textContent).toContain("稍后提醒");

    const startBtn = card?.querySelector(".lv-notice-btn--primary") as HTMLButtonElement;
    startBtn.click();
    expect(reviewLaunched).toBe(true);
  });

  describe("Epoch 7 Phase 3: 统一 AI 网关 (lvAi) 与今日活动流 (lvActivity)", () => {
    it("lvAi 支持全生态共享 AI 配置与 LvGatewayAiChannel 免填 Key 代理", async () => {
      const { lvAi } = await import("../src/libs/lv-notice-kit");
      const { LvGatewayAiChannel } = await import("../src/ai/client");

      lvAi.setConfig({
        endpoint: "https://api.deepseek.com/v1",
        apiKey: "sk-shared-test-key",
        model: "deepseek-chat",
      });

      const config = lvAi.getConfig();
      expect(config?.apiKey).toBe("sk-shared-test-key");
      expect(config?.endpoint).toBe("https://api.deepseek.com/v1");

      const channel = new LvGatewayAiChannel("考试");
      expect(channel.id).toBe("lv-ai");
    });

    it("lvActivity 能够正确记录交卷与做题活动并生成结构化 Markdown", async () => {
      const { lvActivity } = await import("../src/libs/lv-notice-kit");

      lvActivity.record({
        source: "考试",
        category: "exam",
        title: "完成模拟试卷交卷 (得分: 92/100)",
        detail: "正确率 92% · 达标合格",
        linkBlockId: "doc-20261103-mock-exam",
      });

      const todayList = lvActivity.getTodayRecords();
      expect(todayList.length).toBeGreaterThan(0);
      const last = todayList[todayList.length - 1];
      expect(last.source).toBe("考试");
      expect(last.category).toBe("exam");
      expect(last.title).toContain("得分: 92/100");
      expect(last.linkBlockId).toBe("doc-20261103-mock-exam");

      const md = lvActivity.formatAsMarkdown();
      expect(md).toContain("小驴全家桶 · 今日活动汇编");
      expect(md).toContain("[考试]");
      expect(md).toContain("完成模拟试卷交卷 (得分: 92/100)");
      expect(md).toContain("siyuan://blocks/doc-20261103-mock-exam");
    });
  });

  describe("Epoch 7 Phase 4: 全生态联合灾备 (lvBackup) 与健康自省 (lvEcosystem)", () => {
    it("lvBackup 能够注册备份切面、导出全家桶总包并一键恢复", async () => {
      const { lvBackup } = await import("../src/libs/lv-notice-kit");

      let restored = false;
      const unreg = lvBackup.register(
        "siyuan-test-plugin",
        async () => ({ mockKey: "mockVal", count: 42 }),
        async (data) => {
          if (data.mockKey === "mockVal") {
            restored = true;
            return true;
          }
          return false;
        },
      );

      const bundle = await lvBackup.exportFull();
      expect(bundle.ecosystem).toBe("xiaolv");
      expect(bundle.plugins["siyuan-test-plugin"]).toBeDefined();
      expect(bundle.plugins["siyuan-test-plugin"].data.mockKey).toBe("mockVal");
      expect(bundle.plugins["siyuan-test-plugin"].data.count).toBe(42);

      const restoreResult = await lvBackup.restoreFull(bundle);
      expect(restoreResult.success).toContain("siyuan-test-plugin");
      expect(restored).toBe(true);

      unreg();
    });

    it("lvEcosystem 能够返回运行态诊断与胶囊徽章文本", async () => {
      const { lvEcosystem, lvBackup } = await import("../src/libs/lv-notice-kit");

      const unreg = lvBackup.register(
        "siyuan-exam",
        async () => ({}),
        async () => true,
      );

      const diag = lvEcosystem.getDiagnostics();
      expect(diag.registeredPlugins).toContain("siyuan-exam");
      expect(diag.version).toBeGreaterThanOrEqual(130);

      const badgeText = lvEcosystem.getStatusBadgeText();
      expect(badgeText).toContain("🐴 小驴全家桶");
      expect(badgeText).toContain("插件已联结");
      expect(badgeText).toContain("今日活动");

      unreg();
    });

    it("ExamApp.dumpData 与 restoreData 支持题库、答题流水、错题本与模考记录的完整灾备恢复", async () => {
      const { ExamApp } = await import("../src/app");
      const { MemoryStorage } = await import("../src/core/attemptLog");

      const storage = new MemoryStorage();
      const app = new ExamApp({ client: { getRiffDecks: async () => [] } as any, storage });
      await app.init("test-device");

      // 准备初始数据：模考记录
      await app.saveMockResult({
        id: "mock-1",
        name: "全真模拟试卷一",
        startedAt: Date.now(),
        total: 85,
        full: 100,
        percent: 85,
        pass: true,
      });

      // 备份
      const backupData = await app.dumpData();
      expect(backupData.schema).toBe("lv-exam.backup/1");
      expect(Array.isArray(backupData.mockResults)).toBe(true);
      expect((backupData.mockResults as any[]).length).toBe(1);
      expect((backupData.mockResults as any[])[0].name).toBe("全真模拟试卷一");

      // 在新的空 App 实例中恢复
      const storage2 = new MemoryStorage();
      const app2 = new ExamApp({ client: { getRiffDecks: async () => [] } as any, storage: storage2 });
      await app2.init("test-device-2");

      expect((await app2.listMockResults()).length).toBe(0);

      const ok = await app2.restoreData(backupData);
      expect(ok).toBe(true);

      const restoredMocks = await app2.listMockResults();
      expect(restoredMocks.length).toBe(1);
      expect(restoredMocks[0].name).toBe("全真模拟试卷一");
      expect(restoredMocks[0].total).toBe(85);
    }, 15000);
  });

  describe("Epoch 7 Phase 5: 小驴罗盘 (lvLaunchpad) 注册与二级极速行动", () => {
    it("lvLaunchpad 支持注册小驴考试并提供三态属性与二级快捷行动", async () => {
      const { lvLaunchpad } = await import("../src/libs/lv-notice-kit");

      let homeOpened = false;
      let triggeredAction = "";

      const unreg = lvLaunchpad.register({
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
        onClick: () => {
          homeOpened = true;
        },
        onAction: (act) => {
          triggeredAction = act;
        },
      });

      const items = lvLaunchpad.getItems();
      const examItem = items.find((i) => i.id === "siyuan-exam");
      expect(examItem).toBeDefined();
      expect(examItem?.fullName).toBe("小驴考试");
      expect(examItem?.svgIcon).toBe("icon-lv-exam");
      expect(examItem?.color).toBe("#3b82f6");
      expect(examItem?.state).toBe("docked");
      expect(examItem?.actions?.length).toBe(4);

      // 测试三态切换 (pinned / docked / hidden)
      lvLaunchpad.setPluginState("siyuan-exam", "pinned");
      const updatedItems = lvLaunchpad.getItems();
      expect(updatedItems.find((i) => i.id === "siyuan-exam")?.state).toBe("pinned");

      // 点击主入口
      examItem?.onClick();
      expect(homeOpened).toBe(true);

      // 触发二级行动
      examItem?.onAction?.("开启全真计时模拟考试");
      expect(triggeredAction).toBe("开启全真计时模拟考试");

      // 卸载注销
      unreg();
      const afterUnreg = lvLaunchpad.getItems();
      expect(afterUnreg.find((i) => i.id === "siyuan-exam")).toBeUndefined();
    });
  });

  describe("Epoch 7 Phase 7: 穿透搜索 (lvOmnisearch) 与跨插件自动化联动 (lvAutomation)", () => {
    it("lvOmnisearch 能够检索已注册插件的试题与错题，并按匹配度排序", async () => {
      const { lvOmnisearch } = await import("../src/libs/lv-notice-kit");

      let clicked = false;
      const unreg = lvOmnisearch.registerProvider("siyuan-exam", async (kw) => {
        if (kw.includes("极限") || kw.includes("微积分")) {
          return [
            {
              id: "exam-q1",
              source: "考试",
              category: "错题本",
              badge: "错题",
              title: "高等数学极限计算典型题",
              snippet: "【解析】利用洛必达法则求未定式极限",
              linkBlockId: "block-q1-doc",
              onClick: () => {
                clicked = true;
              },
            },
          ];
        }
        return [];
      });

      const results = await lvOmnisearch.search("极限");
      expect(results.length).toBe(1);
      expect(results[0].title).toBe("高等数学极限计算典型题");
      expect(results[0].category).toBe("错题本");
      expect(results[0].badge).toBe("错题");

      results[0].onClick();
      expect(clicked).toBe(true);

      const emptyResults = await lvOmnisearch.search("无匹配关键字");
      expect(emptyResults.length).toBe(0);

      unreg();
      const afterUnreg = await lvOmnisearch.search("极限");
      expect(afterUnreg.length).toBe(0);
    });

    it("lvAutomation 能够触发 wrong-question 事件并通知跨插件联动规则", async () => {
      const { lvAutomation } = await import("../src/libs/lv-notice-kit");
      const { ExamApp } = await import("../src/app");
      const { MemoryStorage } = await import("../src/core/attemptLog");

      let receivedPayload: any = null;

      const unregRule = lvAutomation.registerRule({
        id: "rule-auto-card-on-wrong",
        name: "错题自动推送到闪卡复习",
        desc: "当考试插件判错时，自动制卡推送到闪卡库",
        enabled: true,
        triggerSource: "siyuan-exam",
        triggerType: "wrong-question",
        actionPlugin: "siyuan-lv-cards",
        actionName: "create-card",
        execute: (payload) => {
          receivedPayload = payload;
          return true;
        },
      });

      const storage = new MemoryStorage();
      const app = new ExamApp({ client: {} as any, storage });

      const res = await app.triggerWrongQuestionAutomation({
        id: "q-101",
        stem: "下列关于洛必达法则的描述正确的是？",
        analysis: "需满足 0/0 或 inf/inf 且导数商存在",
        docId: "doc-math-101",
      });

      expect(res.triggered).toBe(1);
      expect(res.success).toBe(1);
      expect(receivedPayload).not.toBeNull();
      expect(receivedPayload.questionId).toBe("q-101");
      expect(receivedPayload.title).toContain("洛必达法则");
      expect(receivedPayload.analysis).toContain("需满足 0/0");
      expect(receivedPayload.docId).toBe("doc-math-101");

      unregRule();
    });
  });
});
