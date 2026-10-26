import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ttsSupported, ttsSpeak, ttsStop, cleanTtsText, STUDY_LANGUAGES } from "../src/core/tts";

describe("TTS 语音朗读引擎 (tts)", () => {
  it("遇到空文本或空白文本安全返回 false 不调用语音合成", () => {
    expect(ttsSpeak("")).toBe(false);
    expect(ttsSpeak("   ")).toBe(false);
    expect(ttsSpeak(null as unknown as string)).toBe(false);
    expect(ttsSpeak(undefined as unknown as string)).toBe(false);
  });

  describe("有 SpeechSynthesis 环境时的调用与按句切分", () => {
    let mockSynth: any;

    beforeEach(() => {
      mockSynth = {
        cancel: vi.fn(),
        speak: vi.fn(),
      };
      (globalThis as any).speechSynthesis = mockSynth;
      (globalThis as any).SpeechSynthesisUtterance = function (this: any, text: string) {
        this.text = text;
      };
    });

    afterEach(() => {
      delete (globalThis as any).speechSynthesis;
      delete (globalThis as any).SpeechSynthesisUtterance;
    });

    it("ttsSupported 在支持环境下返回 true", () => {
      expect(ttsSupported()).toBe(true);
    });

    it("ttsSpeak 按标点切分并逐句朗读", () => {
      const ok = ttsSpeak("第一句。第二句！第三句？");
      expect(ok).toBe(true);
      expect(mockSynth.cancel).toHaveBeenCalledTimes(1);
      expect(mockSynth.speak).toHaveBeenCalledTimes(3);
    });

    it("ttsStop 调用 cancel 停止播放", () => {
      ttsStop();
      expect(mockSynth.cancel).toHaveBeenCalledTimes(1);
    });

    it("ttsSpeak 支持多语言（如粤语 zh-HK、英语 en-US）与选项对象入参", () => {
      expect(STUDY_LANGUAGES.some((l) => l.code === "zh-HK")).toBe(true);
      const ok = ttsSpeak("唔该晒，借借", { lang: "zh-HK", rate: 1.1 });
      expect(ok).toBe(true);
      expect(mockSynth.cancel).toHaveBeenCalledTimes(1);
      expect(mockSynth.speak).toHaveBeenCalledTimes(1);
    });

    it("cleanTtsText 自动剥离 HTML 标签、Markdown 符号、思源 IAL 与 LaTeX 标记", () => {
      const raw = '### 题目：已知 **函数** $f(x) = x^2$ <span class="tag">重点</span> {: id="2026"}，求导数。';
      const cleaned = cleanTtsText(raw);
      expect(cleaned).not.toContain("###");
      expect(cleaned).not.toContain("**");
      expect(cleaned).not.toContain('<span class="tag">');
      expect(cleaned).not.toContain('{: id="2026"}');
      expect(cleaned).not.toContain("$");
      expect(cleaned).toContain("题目：已知 函数 f(x) = x^2 重点 ，求导数。");
    });
  });
});
