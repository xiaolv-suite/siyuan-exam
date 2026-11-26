import { showMessage } from "siyuan";
import { SettingUtils } from "../libs/setting-utils";
import { resolveAiKey, saveAiSecretToHost } from "../ai/secrets";
import { emitExamEvent } from "../core/bus";
import type { PluginHost } from "./pluginContext";

export function setupPluginSettings(plugin: PluginHost): Map<string, unknown> {
  plugin.settingUtils = new SettingUtils({
    plugin,
    callback: () => {
      plugin.examApp?.invalidate();
      emitExamEvent("bank-changed", { bank: "" });
      plugin.dispatchPublicStats();
      showMessage(plugin.i18n["settingSaved"], 2600, "info");
    },
    onSaveError: (error) => {
      showMessage((plugin.i18n["setting.saveFailed"] ?? "设置保存失败；输入已保留，重新打开插件设置后可再次保存。") + " " + String(error instanceof Error ? error.message : error), 6000, "error");
    },
  });

  plugin.settingUtils.addItem({
    title: `[考期与目标] ${plugin.i18n["setting.examDate.title"]}`,
    description: plugin.i18n["setting.examDate.desc"],
    type: "textinput",
    key: "examDate",
    value: "",
    placeholder: "YYYY-MM-DD",
    direction: "row",
  });
  plugin.settingUtils.addItem({
    title: `[考期与目标] ${plugin.i18n["setting.sprintDays.title"]}`,
    description: plugin.i18n["setting.sprintDays.desc"],
    type: "number",
    key: "sprintDays",
    value: 14,
    direction: "row",
  });
  plugin.settingUtils.addItem({
    title: `[考期与目标] ${plugin.i18n["setting.dailyGoal.title"]}`,
    description: plugin.i18n["setting.dailyGoal.desc"],
    type: "number",
    key: "dailyGoal",
    value: 10,
    direction: "row",
  });
  plugin.settingUtils.addItem({
    title: `[做题偏好] ${plugin.i18n["setting.reciteGroup.title"]}`,
    description: plugin.i18n["setting.reciteGroup.desc"],
    type: "number",
    key: "reciteGroupSize",
    value: 15,
    direction: "row",
  });
  plugin.settingUtils.addItem({
    title: `[做题偏好] ${plugin.i18n["setting.perQuestionTimeout.title"]}`,
    description: plugin.i18n["setting.perQuestionTimeout.desc"],
    type: "number",
    key: "perQuestionTimeoutS",
    value: 0,
    direction: "row",
  });
  plugin.settingUtils.addItem({
    title: `[做题偏好] ${plugin.i18n["setting.feedbackTiming.title"]}`,
    description: plugin.i18n["setting.feedbackTiming.desc"],
    type: "select",
    key: "feedbackTiming",
    value: "immediate",
    options: {
      immediate: plugin.i18n["setting.feedbackTiming.immediate"],
      group: plugin.i18n["setting.feedbackTiming.group"],
      end: plugin.i18n["setting.feedbackTiming.end"],
    },
    direction: "row",
  });
  plugin.settingUtils.addItem({
    title: `[做题偏好] ${plugin.i18n["setting.materialInterleave.title"]}`,
    description: plugin.i18n["setting.materialInterleave.desc"],
    type: "checkbox",
    key: "materialInterleave",
    value: false,
    direction: "row",
  });
  plugin.settingUtils.addItem({
    title: `[考期与目标] ${plugin.i18n["setting.examProfiles.title"]}`,
    description: plugin.i18n["setting.examProfiles.desc"],
    type: "textarea",
    key: "examProfiles",
    value: "",
    direction: "column",
  });
  plugin.settingUtils.addItem({
    title: `[做题偏好] ${plugin.i18n["setting.quickAvoidDays.title"]}`,
    description: plugin.i18n["setting.quickAvoidDays.desc"],
    type: "number",
    key: "quickAvoidDays",
    value: 3,
    direction: "row",
  });
  plugin.settingUtils.addItem({
    title: `[做题偏好] ${plugin.i18n["setting.eliminateStreak.title"] ?? "错题连对出库门槛"}`,
    description: plugin.i18n["setting.eliminateStreak.desc"] ?? "错题在独立重练中连续答对多少次自动移出错题本（默认 2 次，可设 1–5 次）",
    type: "number",
    key: "eliminateStreak",
    value: 2,
    direction: "row",
  });
  plugin.settingUtils.addItem({
    title: `[提醒与通知] ${plugin.i18n["setting.reviewReminder.title"] ?? "每日错题到期提醒"}`,
    description: plugin.i18n["setting.reviewReminder.desc"] ?? "题库中存在艾宾浩斯临界衰减期错题时，在桌面右上角弹窗提醒复习巩固（关闭后彻底静默）",
    type: "checkbox",
    key: "reviewReminderEnabled",
    value: true,
    direction: "row",
  });
  plugin.settingUtils.addItem({
    title: `[生态联动] ${plugin.i18n["setting.checkinItemId.title"]}`,
    description: plugin.i18n["setting.checkinItemId.desc"],
    type: "textinput",
    key: "checkinItemId",
    value: "",
    direction: "row",
  });
  plugin.settingUtils.addItem({
    title: `[生态联动] ${plugin.i18n["setting.checkinThreshold.title"]}`,
    description: plugin.i18n["setting.checkinThreshold.desc"],
    type: "number",
    key: "checkinThreshold",
    value: 0,
    direction: "row",
  });
  plugin.settingUtils.addItem({
    title: `[算法调度] ${plugin.i18n["setting.retention.title"]}`,
    description: plugin.i18n["setting.retention.desc"],
    type: "slider",
    key: "desiredRetention",
    value: 0.9,
    direction: "row",
    slider: { min: 0.85, max: 0.97, step: 0.01 },
  });
  plugin.settingUtils.addItem({
    title: `[AI智能体] ${plugin.i18n["setting.aiEndpoint.title"]}`,
    description: plugin.i18n["setting.aiEndpoint.desc"],
    type: "textinput",
    key: "aiEndpoint",
    value: "",
    direction: "row",
  });
  plugin.settingUtils.addItem({
    title: `[AI智能体] ${plugin.i18n["setting.aiModel.title"]}`,
    description: plugin.i18n["setting.aiModel.desc"],
    type: "textinput",
    key: "aiModel",
    value: "gpt-4o-mini",
    direction: "row",
  });
  plugin.settingUtils.addItem({
    title: `[AI智能体] ${plugin.i18n["setting.aiCustomHint.title"]}`,
    description: plugin.i18n["setting.aiCustomHint.desc"],
    type: "textarea",
    key: "aiCustomHint",
    value: "",
    direction: "row",
  });
  let pendingAiKeyInput: HTMLInputElement | null = null;
  let pendingAiKeyClear = false;
  const syncAiKeyPlaceholder = (el: HTMLInputElement) => {
    if (pendingAiKeyClear) {
      el.placeholder = "点击保存后将从密钥库清除";
    } else if (resolveAiKey(plugin)) {
      el.placeholder = "已存入思源加密密钥库（留空不变，输入可覆盖）";
    } else {
      el.placeholder = "输入 API Key（加密存入思源密钥库，不落盘明文）";
    }
  };

  plugin.settingUtils.addItem({
    title: `[AI智能体] ${plugin.i18n["setting.aiKey.title"]}`,
    description: "加密存入思源官方密钥库（设置 → 密钥和变量），不在本地配置或界面中保存明文。",
    type: "custom",
    key: "aiKey",
    value: undefined,
    direction: "row",
    createElement: () => {
      const wrap = document.createElement("div");
      wrap.className = "fn__flex fn__flex-center";
      wrap.style.gap = "6px";
      const input = document.createElement("input");
      input.type = "password";
      input.className = "b3-text-field fn__flex-center fn__size200";
      input.autocomplete = "new-password";
      input.setAttribute("aria-label", `[AI智能体] ${plugin.i18n["setting.aiKey.title"]}`);
      input.value = "";
      syncAiKeyPlaceholder(input);
      input.addEventListener("input", () => {
        if (input.value.trim()) pendingAiKeyClear = false;
      });
      input.addEventListener("keydown", (event: KeyboardEvent) => {
        if (event.isComposing || event.keyCode === 229 || event.key === "Enter") {
          if (event.key === "Enter") event.stopPropagation();
        }
      });
      const clearBtn = document.createElement("button");
      clearBtn.type = "button";
      clearBtn.className = "b3-button b3-button--outline";
      clearBtn.textContent = "清空";
      clearBtn.title = "保存时从思源密钥库清除 AI API Key";
      clearBtn.addEventListener("click", () => {
        input.value = "";
        pendingAiKeyClear = true;
        syncAiKeyPlaceholder(input);
      });
      pendingAiKeyInput = input;
      wrap.appendChild(input);
      wrap.appendChild(clearBtn);
      return wrap;
    },
    getEleVal: () => undefined,
    setEleVal: () => {
      if (pendingAiKeyInput) {
        pendingAiKeyInput.value = "";
        pendingAiKeyClear = false;
        syncAiKeyPlaceholder(pendingAiKeyInput);
      }
    },
    onConfirmSave: async () => {
      if (!pendingAiKeyInput) return;
      const typed = pendingAiKeyInput.value.trim();
      if (pendingAiKeyClear) {
        await saveAiSecretToHost("");
        pendingAiKeyClear = false;
      } else if (typed) {
        await saveAiSecretToHost(typed);
        pendingAiKeyInput.value = "";
      }
      syncAiKeyPlaceholder(pendingAiKeyInput);
    },
  });
  plugin.settingUtils.addItem({
    title: `[语音音效] ${plugin.i18n["setting.ttsLang.title"]}`,
    description: plugin.i18n["setting.ttsLang.desc"],
    type: "select",
    key: "ttsLang",
    value: "zh-CN",
    options: {
      "zh-CN": plugin.i18n["setting.ttsLang.mandarin"],
      "zh-HK": plugin.i18n["setting.ttsLang.cantonese"],
      "en-US": plugin.i18n["setting.ttsLang.english"],
      "ja-JP": plugin.i18n["setting.ttsLang.japanese"],
    },
    direction: "row",
  });
  plugin.settingUtils.addItem({
    title: `[语音音效] ${plugin.i18n["setting.ttsRate.title"]}`,
    description: plugin.i18n["setting.ttsRate.desc"],
    type: "slider",
    key: "ttsRate",
    value: 1.0,
    direction: "row",
    slider: { min: 0.8, max: 1.5, step: 0.05 },
  });
  plugin.settingUtils.addItem({
    title: `[语音音效] ${plugin.i18n["setting.soundEnabled.title"]}`,
    description: plugin.i18n["setting.soundEnabled.desc"],
    type: "checkbox",
    key: "soundEnabled",
    value: true,
    direction: "row",
  });
  plugin.settingUtils.addItem({
    title: `[语音音效] ${plugin.i18n["setting.speechEvalEnabled.title"]}`,
    description: plugin.i18n["setting.speechEvalEnabled.desc"],
    type: "checkbox",
    key: "speechEvalEnabled",
    value: false,
    direction: "row",
  });

  return new Map([...plugin.settingUtils.settings].map(([k, item]) => [k, item.value]));
}
