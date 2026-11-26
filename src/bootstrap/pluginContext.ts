import type { Plugin } from "siyuan";
import type { ExamPluginLike } from "../core/pluginTab";
import type { SettingUtils } from "../libs/setting-utils";

export type PluginHost = Omit<Plugin, "i18n"> & Omit<ExamPluginLike, "settingUtils"> & {
  i18n: Record<string, string>;
  settingUtils: SettingUtils;
  [key: string]: any;
};
