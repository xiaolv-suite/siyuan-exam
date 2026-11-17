// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import {
  toggleSpeechRecognitionSession,
} from "@/ui/practice/services/speechRecognitionService";

describe("语音朗读听辨与口语测评服务 (speechRecognitionService)", () => {
  it("1. toggleSpeechRecognitionSession：未开放语音识别接口时给出提示", () => {
    const showMessage = vi.fn();
    toggleSpeechRecognitionSession({
      targetText: "测试题干",
      isRecording: false,
      currentInstance: null,
      onStart: vi.fn(),
      onEnd: vi.fn(),
      onResult: vi.fn(),
      showMessage,
      windowObj: {}, // 无 SpeechRecognition
    });

    expect(showMessage).toHaveBeenCalledWith(
      expect.stringContaining("暂未开放语音识别接口"),
      3500,
      "info",
    );
  });

  it("2. toggleSpeechRecognitionSession：已在录音时再次点击触发停止", () => {
    const showMessage = vi.fn();
    const mockStop = vi.fn();
    const onEnd = vi.fn();

    toggleSpeechRecognitionSession({
      targetText: "测试题干",
      isRecording: true,
      currentInstance: { stop: mockStop },
      onStart: vi.fn(),
      onEnd,
      onResult: vi.fn(),
      showMessage,
      windowObj: {
        SpeechRecognition: vi.fn(),
      },
    });

    expect(mockStop).toHaveBeenCalled();
    expect(onEnd).toHaveBeenCalled();
  });

  it("3. toggleSpeechRecognitionSession：成功启动录音并注册监听", () => {
    const showMessage = vi.fn();
    const mockStart = vi.fn();
    let createdRec: any = null;

    class MockRecognition {
      lang = "";
      continuous = false;
      interimResults = false;
      maxAlternatives = 0;
      onresult: any = null;
      onerror: any = null;
      onend: any = null;
      start = mockStart;
      constructor() {
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        createdRec = this;
      }
    }

    const onStart = vi.fn();
    const onEnd = vi.fn();
    const onResult = vi.fn();

    toggleSpeechRecognitionSession({
      targetText: "测试标准读音",
      lang: "en-US",
      isRecording: false,
      currentInstance: null,
      onStart,
      onEnd,
      onResult,
      showMessage,
      windowObj: {
        webkitSpeechRecognition: MockRecognition,
      },
    });

    expect(onStart).toHaveBeenCalledWith(createdRec);
    expect(mockStart).toHaveBeenCalled();
    expect(createdRec.lang).toBe("en-US");

    // 模拟识别成功
    createdRec.onresult({
      results: [[{ transcript: "测试标准读音" }]],
    });

    expect(onEnd).toHaveBeenCalled();
    expect(onResult).toHaveBeenCalledWith(
      expect.objectContaining({
        score: expect.any(Number),
        grade: expect.any(String),
      }),
    );
  });

  it("4. toggleSpeechRecognitionSession：启动失败时提示检查麦克风权限", () => {
    const showMessage = vi.fn();
    const onEnd = vi.fn();

    class FailRecognition {
      start() {
        throw new Error("Permission denied");
      }
    }

    toggleSpeechRecognitionSession({
      targetText: "测试",
      isRecording: false,
      currentInstance: null,
      onStart: vi.fn(),
      onEnd,
      onResult: vi.fn(),
      showMessage,
      windowObj: {
        SpeechRecognition: FailRecognition,
      },
    });

    expect(onEnd).toHaveBeenCalled();
    expect(showMessage).toHaveBeenCalledWith(
      expect.stringContaining("请检查设备麦克风权限"),
      3500,
      "error",
    );
  });
});
