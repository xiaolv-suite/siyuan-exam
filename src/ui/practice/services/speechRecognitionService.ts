// ============================================================
// 语音朗读听辨与口语测评服务 (speechRecognitionService.ts)
// 承接 Web Speech API 录音调度、口语相似度评测与音效协同
// 纯逻辑解耦，不绑定 Svelte 渲染态
// ============================================================

import { evaluateSpeechSimilarity, type SpeechEvalResult } from "@/core/speechEval";
import type { MessageReporter } from "./printPaperService";

export { type SpeechEvalResult };

export interface SpeechRecognitionController {
  instance: any;
  stop: () => void;
}

/**
 * 启动或切换语音识别评测会话
 */
export function toggleSpeechRecognitionSession(options: {
  targetText: string;
  lang?: string;
  isRecording: boolean;
  currentInstance: any;
  onStart: (rec: any) => void;
  onEnd: () => void;
  onResult: (result: SpeechEvalResult) => void;
  showMessage: MessageReporter;
  windowObj?: any;
}): void {
  const {
    targetText,
    lang = "zh-CN",
    isRecording,
    currentInstance,
    onStart,
    onEnd,
    onResult,
    showMessage,
    windowObj = typeof window !== "undefined" ? window : undefined,
  } = options;

  if (!windowObj) return;
  const Recognition = windowObj.SpeechRecognition || windowObj.webkitSpeechRecognition;
  if (!Recognition) {
    showMessage("当前运行环境暂未开放语音识别接口，可使用伴学朗读听辨原声磨耳朵", 3500, "info");
    return;
  }

  if (isRecording && currentInstance) {
    try {
      currentInstance.stop();
    } catch {
      // 优雅静默
    }
    onEnd();
    return;
  }

  try {
    const rec = new Recognition();
    rec.lang = lang;
    rec.continuous = false;
    rec.interimResults = false;
    rec.maxAlternatives = 1;

    rec.onresult = (event: any) => {
      const transcript = event.results?.[0]?.[0]?.transcript ?? "";
      onEnd();
      if (transcript) {
        const res = evaluateSpeechSimilarity(transcript, targetText);
        onResult(res);
      }
    };
    rec.onerror = () => {
      onEnd();
    };
    rec.onend = () => {
      onEnd();
    };

    onStart(rec);
    rec.start();
  } catch {
    onEnd();
    showMessage("无法启动麦克风录音识别，请检查设备麦克风权限", 3500, "error");
  }
}
