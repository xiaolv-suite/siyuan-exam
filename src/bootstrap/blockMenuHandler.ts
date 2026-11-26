import type { Menu } from "siyuan";
import { showMessage } from "siyuan";
import { getCleanBlockText } from "@/libs/lv-notice-kit";
import { combineBlockSources } from "../core/blockSource";
import { openPracticeView } from "../core/pluginTab";
import { emitExamEvent } from "../core/bus";
import type { PluginHost } from "./pluginContext";

export async function handleBlockIconClick(
  plugin: PluginHost,
  detail?: { menu?: Menu; blockElements?: HTMLElement[] },
): Promise<void> {
  if (!detail?.menu) {
    return;
  }
  // 查询圈题（v0.2）：查询嵌入块 → 用此查询开始练习
  const el = detail.blockElements?.[0];
  if (el?.getAttribute?.("data-type") === "query_embed" && plugin.examApp) {
    // 3.8.5 实测：query_embed 的 content 为空、无 data-query 属性，SQL 只在 kramdown 的 {{...}} 内
    let stmt = (el.getAttribute("data-query") || "").trim();
    if (!stmt) {
      const text = getCleanBlockText(el);
      if (/^\s*SELECT\b/i.test(text)) stmt = text;
    }
    detail.menu.addItem({
      icon: "iconExam",
      label: plugin.i18n["blockMenu.queryPractice"] ?? "小驴考试：用此查询开始练习",
      click: async () => {
        try {
          const bank = plugin.examApp!.resolvePreferredBank();
          if (!bank) {
            showMessage(plugin.i18n["guard.needBankFirst"], 3600, "error");
            return;
          }
          if (!stmt) {
            const blockId = el.getAttribute("data-node-id") || el.dataset?.nodeId || "";
            if (blockId) {
              const kd = await plugin.examApp!.bridge.getBlockKramdown(blockId);
              stmt = (kd.match(/\{\{([\s\S]*?)\}\}/)?.[1] ?? "").trim();
            }
          }
          if (!stmt) {
            showMessage(plugin.i18n["query.empty"], 3600, "info");
            return;
          }
          const qs = await plugin.examApp!.queryQuestions(bank.id, stmt);
          if (!qs.length) {
            showMessage(plugin.i18n["query.empty"], 3600, "info");
            return;
          }
          plugin.pendingPractice = qs;
          plugin.pendingPracticeBankId = bank.id;
          emitExamEvent("open-practice-questions", { qids: qs.map((q) => q.id), bank: bank.id });
          plugin.openPractice();
        } catch (e) {
          showMessage(String(e instanceof Error ? e.message : e), 4800, "error");
        }
      },
    });
    return;
  }
  // 块菜单直通（TODO 2.2 真实化）：题目块 → 加入练习集 / 转卡 / 标记考点 / 编辑 / 在练习台打开
  const blockId = el?.getAttribute?.("data-node-id") || el?.dataset?.nodeId || "";
  if (blockId && plugin.examApp) {
    const exam = plugin.examApp;
    const blockTitle = (el?.getAttribute?.("aria-label") || el?.getAttribute?.("data-type") || "当前块").trim();
    detail.menu.addItem({
      icon: "iconExam",
      label: plugin.i18n["blockMenu.convertToQuestion"] ?? "小驴考试：转为小驴试题（录入题库）",
      click: async () => {
        let bank = exam.resolvePreferredBank();
        if (!bank) {
          try {
            bank = await exam.createBank("默认题库");
          } catch {
            showMessage(plugin.i18n["guard.needBankFirst"] ?? "请先创建一个题库", 3600, "error");
            return;
          }
        }
        try {
          const kramdown = await exam.bridge.getBlockKramdown(blockId);
          const source = combineBlockSources([kramdown]);
          openPracticeView(plugin, "manual", {
            bankId: bank.id,
            sourceText: source.text || getCleanBlockText(el),
            sourceTitle: blockTitle,
            sourceKind: "block",
            sourceBlockId: blockId,
          });
        } catch {
          openPracticeView(plugin, "manual", {
            bankId: bank.id,
            sourceText: getCleanBlockText(el),
            sourceTitle: blockTitle,
            sourceKind: "block",
            sourceBlockId: blockId,
          });
        }
      },
    });
    detail.menu.addItem({
      icon: "iconExam",
      label: "小驴考试：划词一键制填空卡",
      click: async () => {
        if (!exam.kernelOnline) {
          showMessage(plugin.i18n["state.offlineHint"], 3600, "error");
          return;
        }
        const bank = exam.resolvePreferredBank();
        if (!bank) {
          showMessage(plugin.i18n["guard.needBankFirst"], 3600, "error");
          return;
        }
        try {
          const kramdown = await exam.bridge.getBlockKramdown(blockId);
          const { extractCardsFromExcerpt } = await import("@/core/excerptCard");
          const res = extractCardsFromExcerpt(
            {
              text: kramdown,
              blockId,
              materialTitle: blockTitle,
            },
            { targetTypes: ["fill"] },
          );
          if (!res.questions.length) {
            showMessage("未检测到高亮（==挖空==）或加粗语法，请在重点词两侧添加 == 或 ** 后再试", 4000, "info");
            return;
          }
          const targetQ = res.questions[0];
          await exam.writeManualQuestion(bank.id, targetQ);
          showMessage(`已成功提取填空题并存入题库：《${targetQ.stem.slice(0, 20)}…》✓`, 3500, "info");
        } catch (e) {
          showMessage(`制卡失败：${String(e instanceof Error ? e.message : e)}`, 4000, "error");
        }
      },
    });
    detail.menu.addItem({
      icon: "iconExam",
      label: "小驴考试：扫描整篇笔记高亮批量制卡",
      click: async () => {
        if (!exam.kernelOnline) {
          showMessage(plugin.i18n["state.offlineHint"], 3600, "error");
          return;
        }
        const bank = exam.resolvePreferredBank();
        if (!bank) {
          showMessage(plugin.i18n["guard.needBankFirst"], 3600, "error");
          return;
        }
        try {
          const rows = await exam.bridge.sql(`SELECT root_id, content FROM blocks WHERE id='${blockId.replace(/'/g, "''")}' LIMIT 1`);
          const rootDocId = rows[0]?.root_id ? String(rows[0].root_id) : blockId;
          const doc = await exam.bridge.exportDocMarkdown(rootDocId);
          const { extractCardsFromExcerpt } = await import("@/core/excerptCard");
          const res = extractCardsFromExcerpt(
            {
              text: doc.content,
              blockId: rootDocId,
              materialTitle: doc.title || blockTitle,
            },
            { targetTypes: ["fill"] },
          );
          if (!res.questions.length) {
            showMessage("未在当前文档中检测到带有 ==重点== 或 **考点** 语法的挖空句", 3500, "info");
            return;
          }
          let count = 0;
          for (const q of res.questions) {
            try {
              await exam.writeManualQuestion(bank.id, q);
              count++;
            } catch {
              /* 忽略个别重复题目 */
            }
          }
          showMessage(`已从《${doc.title || "当前文档"}》扫描并成功批量录入 ${count} 道填空题！✓`, 4000, "info");
        } catch (e) {
          showMessage(`批量扫描制卡失败：${String(e instanceof Error ? e.message : e)}`, 4000, "error");
        }
      },
    });
    detail.menu.addItem({
      icon: "iconExam",
      label: plugin.i18n["blockMenu.generateFromBlock"],
      click: async () => {
        if (!exam.kernelOnline) {
          showMessage(plugin.i18n["state.offlineHint"], 3600, "error");
          return;
        }
        const bank = exam.resolvePreferredBank();
        if (!bank) {
          showMessage(plugin.i18n["guard.needBankFirst"], 3600, "error");
          return;
        }
        try {
          const kramdown = await exam.bridge.getBlockKramdown(blockId);
          const source = combineBlockSources([kramdown]);
          if (!source.text) {
            showMessage(plugin.i18n["blockMenu.blockSourceEmpty"], 3600, "info");
            return;
          }
          openPracticeView(plugin, "ai", {
            bankId: bank.id,
            sourceText: source.text,
            sourceTitle: blockTitle,
            sourceKind: "block",
            sourceTruncated: source.truncated,
            sourceBlockId: blockId,
          });
          if (source.truncated) {
            showMessage(plugin.i18n["blockMenu.blockSourceTruncated"].replace("{n}", String(source.text.length)), 4200, "info");
          }
        } catch (e) {
          const message = String(e instanceof Error ? e.message : e);
          showMessage(plugin.i18n["blockMenu.blockSourceFailed"].replace("{message}", message), 4800, "error");
        }
      },
    });
    detail.menu.addItem({
      icon: "iconExam",
      label: plugin.i18n["blockMenu.addToPractice"],
      click: async () => {
        try {
          const hit = await exam.findQuestionByBlock(blockId);
          if (!hit) {
            showMessage(
              plugin.examApp!.kernelOnline ? plugin.i18n["query.empty"] : plugin.i18n["state.offlineHint"],
              3600,
              "info",
            );
            return;
          }
          plugin.pendingPractice = [hit.q];
          plugin.pendingPracticeBankId = hit.bank.id;
          emitExamEvent("open-practice-questions", { qids: [hit.q.id], bank: hit.bank.id });
          plugin.openPractice();
        } catch (e) {
          showMessage(String(e instanceof Error ? e.message : e), 4800, "error");
        }
      },
    });
    detail.menu.addItem({
      icon: "iconExam",
      label: plugin.i18n["blockMenu.toCard"],
      click: async () => {
        try {
          const hit = await exam.findQuestionByBlock(blockId);
          if (!hit) {
            showMessage(
              plugin.examApp!.kernelOnline ? plugin.i18n["memory.toCardMissing"] : plugin.i18n["state.offlineHint"],
              3600,
              "info",
            );
            return;
          }
          const n = await exam.convertToCards(hit.bank.id, hit.bank.name, [hit.q]);
          showMessage(
            n ? `${plugin.i18n["memory.toCardDone"]} ${n}` : plugin.i18n["memory.toCardMissing"],
            3200,
            n ? "info" : "error",
          );
        } catch (e) {
          showMessage(String(e instanceof Error ? e.message : e), 4800, "error");
        }
      },
    });
    // 标记考点（2.2）：输入框直通 setExamAttrs（SaveGate 过闸），空值=清除
    detail.menu.addItem({
      icon: "iconExam",
      label: plugin.i18n["blockMenu.markKp"],
      click: async () => {
        try {
          const hit = await exam.findQuestionByBlock(blockId);
          if (!hit) {
            showMessage(
              plugin.examApp!.kernelOnline ? plugin.i18n["query.empty"] : plugin.i18n["state.offlineHint"],
              3600,
              "info",
            );
            return;
          }
          const { inputDialogSync } = await import("../libs/dialog");
          const kp = (
            await inputDialogSync({
              title: plugin.i18n["blockMenu.markKp"],
              placeholder: plugin.i18n["blockMenu.markKpPlaceholder"],
              defaultText: hit.q.kp ?? "",
            })
          )?.trim();
          if (kp == null) return; // 用户取消
          await exam.markQuestionKp(hit.q, kp);
          showMessage(
            kp ? `${plugin.i18n["blockMenu.markKpDone"]} ${kp}` : plugin.i18n["blockMenu.markKpCleared"],
            2800,
            "info",
          );
        } catch (e) {
          showMessage(String(e instanceof Error ? e.message : e), 4800, "error");
        }
      },
    });
    // 编辑 / 在练习台打开（2.2）：移交练习台浏览视图聚焦（qid+bankId；已开 Tab 经窗口事件补齐）
    detail.menu.addItem({
      icon: "iconExam",
      label: plugin.i18n["blockMenu.edit"],
      click: async () => {
        const hit = await exam.findQuestionByBlock(blockId).catch(() => null);
        if (!hit) {
          showMessage(
            plugin.examApp!.kernelOnline ? plugin.i18n["query.empty"] : plugin.i18n["state.offlineHint"],
            3600,
            "info",
          );
          return;
        }
        plugin.pendingEditQid = hit.q.id;
        plugin.pendingEditBank = hit.bank.id;
        emitExamEvent("edit-question", { qid: hit.q.id, bank: hit.bank.id });
        plugin.openPractice();
      },
    });
    detail.menu.addItem({
      icon: "iconExam",
      label: plugin.i18n["blockMenu.openInBrowse"],
      click: async () => {
        const hit = await exam.findQuestionByBlock(blockId).catch(() => null);
        if (!hit) {
          showMessage(
            plugin.examApp!.kernelOnline ? plugin.i18n["query.empty"] : plugin.i18n["state.offlineHint"],
            3600,
            "info",
          );
          return;
        }
        plugin.pendingBrowseQid = hit.q.id;
        plugin.pendingBrowseBank = hit.bank.id;
        emitExamEvent("open-in-browse", { qid: hit.q.id, bank: hit.bank.id });
        plugin.openPractice();
      },
    });
    return;
  }
  // 兜底项（25-P1 移动端入口）：移动端没有插件顶栏按钮，块菜单是稳定入口
  detail.menu.addItem({
    icon: "iconExam",
    label: plugin.i18n["blockMenu.addToPractice"],
    click: () => {
      plugin.openPractice();
    },
  });
}
