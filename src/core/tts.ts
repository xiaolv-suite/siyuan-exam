// TTS 读题与语言学习朗读（v0.5+）：Web Speech API 封装（支持多语言与粤语等方言）
// 不支持的环境返回 false；UI 由调用方禁用朗读按钮并展示能力边界。

export const STUDY_LANGUAGES = [
  { code: "zh-CN", label: "普通话 (Mandarin)" },
  { code: "zh-HK", label: "粤语 (Cantonese)" },
  { code: "en-US", label: "英语 (English)" },
  { code: "ja-JP", label: "日语 (Japanese)" },
] as const;

export type StudyLanguageCode = (typeof STUDY_LANGUAGES)[number]["code"] | string;

export interface TtsOptions {
  rate?: number;
  lang?: StudyLanguageCode;
}

export const ttsSupported = (): boolean =>
  typeof globalThis.speechSynthesis !== "undefined" && typeof globalThis.SpeechSynthesisUtterance !== "undefined";

/**
 * 净化朗读文本：剥离 Markdown 符号、HTML 标签、思源 IAL 块属性与 LaTeX 标记，
 * 避免语音合成引擎将格式符误读为怪音杂音。
 */
export function cleanTtsText(raw: string): string {
  if (!raw) return "";
  return raw
    .replace(/<[^>]+>/g, " ") // 剥离 HTML 标签
    .replace(/\{:[^}]*\}/g, "") // 剥离 IAL 属性
    .replace(/\$([^$]+)\$/g, "$1") // 剥离 LaTeX 行内美元符号
    .replace(/==/g, "") // 剥离思源高亮标记
    .replace(/[*_#~`]/g, "") // 剥离 Markdown 格式符（保留单等号 =）
    .replace(/\s+/g, " ")
    .trim();
}

export function ttsSpeak(text: string, optionsOrRate: number | TtsOptions = 1): boolean {
  if (!text || !text.trim() || !ttsSupported()) return false;
  const cleaned = cleanTtsText(text);
  if (!cleaned) return false;

  const synth = globalThis.speechSynthesis;
  synth.cancel();

  const rate = typeof optionsOrRate === "number" ? optionsOrRate : optionsOrRate?.rate ?? 1;
  const lang = (typeof optionsOrRate === "object" ? optionsOrRate?.lang : undefined) || "zh-CN";

  // 按句切分（引擎对超长文本不稳；docs/11 §听学）
  const sentences = cleaned.split(/(?<=[。？！?!.;；])\s*/).filter((s) => s.trim());
  for (const sentence of sentences) {
    const u = new SpeechSynthesisUtterance(sentence);
    u.lang = lang;
    u.rate = Math.min(2, Math.max(0.8, rate));
    synth.speak(u);
  }
  return true;
}

export function ttsStop(): void {
  globalThis.speechSynthesis?.cancel();
}
