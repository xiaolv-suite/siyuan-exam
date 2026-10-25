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

export function ttsSpeak(text: string, optionsOrRate: number | TtsOptions = 1): boolean {
  if (!text || !text.trim() || !ttsSupported()) return false;
  const synth = globalThis.speechSynthesis;
  synth.cancel();

  const rate = typeof optionsOrRate === "number" ? optionsOrRate : optionsOrRate?.rate ?? 1;
  const lang = (typeof optionsOrRate === "object" ? optionsOrRate?.lang : undefined) || "zh-CN";

  // 按句切分（引擎对超长文本不稳；docs/11 §听学）
  const sentences = text.split(/(?<=[。？！?!.;；])\s*/).filter((s) => s.trim());
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
