import type { Menu } from "siyuan";
import { showMessage } from "siyuan";
import { openPracticeView } from "../core/pluginTab";
import { emitExamEvent } from "../core/bus";
import { withLvAiWait } from "../libs/lv-notice-kit";
import type { PluginHost } from "./pluginContext";

export function handleImageMenu(
  plugin: PluginHost,
  detail?: { menu?: Menu; element?: HTMLElement },
): void {
  if (!detail?.menu || !detail?.element) return;
  const img = detail.element;
  const src = img.getAttribute("data-src") || img.getAttribute("src") || "";
  if (!src) return;

  detail.menu.addItem({
    icon: "iconExam",
    label: plugin.i18n["menu.ocrQuestion"] ?? "用小驴考试识别试题入库",
    click: async () => {
      let cancelled = false;
      try {
        if (!plugin.examApp) {
          showMessage(plugin.i18n["state.loading"] ?? "小驴考试正在启动，请稍候…", 2500, "info");
          return;
        }
        const cleanPath = src.startsWith("assets/") ? src : src.includes("/assets/") ? `assets/${src.split("/assets/").pop()}` : src;
        const q = await withLvAiWait(
          {
            scenario: "transform",
            defaultIcon: "📷",
            title: "📷 正在识别图片中的试题…",
            subtitle: "通过非阻塞 OCR 通道提取题干、选项与参考答案",
            cancelLabel: "⏹ 取消识题",
            onCancel: () => {
              cancelled = true;
            },
          },
          async (signal) => plugin.examApp!.ocrAndParseQuestion(cleanPath, { signal }),
        );
        if (cancelled) {
          showMessage("已取消图片识题", 2200, "info");
          return;
        }
        q.status = "draft";
        const bank = plugin.examApp.resolvePreferredBank();
        if (bank) {
          await plugin.examApp.writeManualQuestion(bank.id, q);
          plugin.pendingEditQid = q.id;
          plugin.pendingEditBank = bank.id;
          emitExamEvent("edit-question", { qid: q.id, bank: bank.id });
          plugin.openPractice();
          showMessage("已识别试题并以草稿入库，正在打开编辑表单…", 3000, "info");
        } else {
          await plugin.examApp.saveAux("draft/manual", {
            v: 1,
            type: q.type === "material" ? "single" : q.type,
            stem: q.stem,
            options: q.options.length ? q.options : ["", "", "", ""],
            answer: q.answer,
            analysis: q.analysis ?? "",
            kp: q.kp ?? "",
            source: q.source ?? cleanPath,
            group: q.group ?? "",
            specOpen: false,
            specUnit: "",
            specAbsTol: "",
            specRelPct: "",
            specAltUnits: "",
            rubricOpen: false,
            rubricText: "",
            at: Date.now(),
          });
          openPracticeView(plugin, "manual");
          showMessage("已识别试题内容并填入录题草稿，请先创建题库后保存…", 3200, "info");
        }
      } catch (e) {
        if (cancelled || (e instanceof Error && e.name === "AbortError")) {
          showMessage("已取消图片识题", 2200, "info");
          return;
        }
        showMessage(`识题失败：${String(e instanceof Error ? e.message : e)}`, 4000, "error");
      }
    },
  });
}

export function handleContentMenu(
  plugin: PluginHost,
  detail?: { menu?: Menu; range?: Range },
): void {
  if (!detail?.menu) return;
  const selectedText = detail.range ? detail.range.toString().trim() : "";
  if (!selectedText || selectedText.length < 2) return;

  detail.menu.addItem({
    icon: "iconExam",
    label: plugin.i18n["menu.convertToQuestion"] ?? "转为小驴试题（入库）",
    click: async () => {
      if (!plugin.examApp || !plugin.examApp.kernelOnline) {
        showMessage(plugin.i18n["state.offlineHint"] ?? "请稍候，应用初始化中…", 3000, "info");
        return;
      }
      let bank = plugin.examApp.resolvePreferredBank();
      if (!bank) {
        try {
          bank = await plugin.examApp.createBank("默认题库");
        } catch {
          showMessage(plugin.i18n["guard.needBankFirst"] ?? "请先创建一个题库", 3600, "error");
          return;
        }
      }
      openPracticeView(plugin, "manual", {
        bankId: bank.id,
        sourceText: selectedText,
        sourceTitle: "划选笔记文字",
        sourceKind: "block",
      });
    },
  });

  detail.menu.addItem({
    icon: "iconExam",
    label: plugin.i18n["menu.aiFromSelection"] ?? "以划选内容为材料 AI 出题",
    click: async () => {
      if (!plugin.examApp || !plugin.examApp.kernelOnline) {
        showMessage(plugin.i18n["state.offlineHint"] ?? "请稍候，应用初始化中…", 3000, "info");
        return;
      }
      const bank = plugin.examApp.resolvePreferredBank();
      if (!bank) {
        showMessage(plugin.i18n["guard.needBankFirst"] ?? "请先创建一个题库", 3600, "error");
        return;
      }
      openPracticeView(plugin, "ai", {
        bankId: bank.id,
        sourceText: selectedText,
        sourceTitle: "划选笔记文字",
        sourceKind: "block",
      });
    },
  });
}

export function handleBlockRefMenu(
  plugin: PluginHost,
  detail?: { menu?: Menu; target?: HTMLElement },
): void {
  if (!detail?.menu || !detail?.target) return;
  const refId = detail.target.getAttribute("data-id") || "";
  if (!refId || !plugin.examApp) return;

  detail.menu.addItem({
    icon: "iconExam",
    label: "在小驴考试中查看/练习此题",
    click: async () => {
      const hit = await plugin.examApp!.findQuestionByBlock(refId);
      if (hit) {
        plugin.pendingPractice = [hit.q];
        plugin.pendingPracticeBankId = hit.bank.id;
        emitExamEvent("open-practice-questions", { qids: [hit.q.id], bank: hit.bank.id });
        plugin.openPractice();
      } else {
        showMessage("该引用块未在小驴考试中登记为试题", 3000, "info");
      }
    },
  });
}

export function handleFlashcardAction(
  plugin: PluginHost,
  detail?: { card?: { blockID?: string }; type?: string },
): void {
  if (!detail?.card?.blockID || !detail.type || !plugin.examApp) return;
  const blockId = detail.card.blockID;
  const typeNum = Number(detail.type);
  if (![1, 2, 3, 4].includes(typeNum)) return;

  void (async () => {
    try {
      const hit = await plugin.examApp!.findQuestionByBlock(blockId);
      if (hit?.q) {
        const verdict = typeNum >= 3 ? "correct" : "wrong";
        plugin.examApp!.recordAttempt({
          qid: hit.q.id,
          kind: "practice",
          mode: "flashcard_sync",
          verdict,
          myAnswer: verdict === "correct" ? hit.q.answer : null,
          sessionId: "siyuan-riff",
        });
        void plugin.examApp!.saveSession().catch(() => undefined);
      }
    } catch {
      /* 容错静默 */
    }
  })();
}
