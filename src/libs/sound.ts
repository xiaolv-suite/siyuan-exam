// ============================================================
// 微音效引擎（基于 Web Audio API 纯代码合成，零外部音频文件，零网络开销）
// 供做题答对与错题消灭时触发正向多巴胺激励反馈，自带静音守卫
// ============================================================

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return null;
  if (!audioCtx) audioCtx = new AudioCtx();
  if (audioCtx.state === "suspended") void audioCtx.resume();
  return audioCtx;
}

/** 答对微音效：双音微和弦 (D5 -> A5)，清脆悦耳 */
export function playSuccessChime(): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    osc1.type = "sine";
    osc2.type = "sine";

    osc1.frequency.setValueAtTime(587.33, now);
    osc1.frequency.exponentialRampToValueAtTime(880, now + 0.12);

    osc2.frequency.setValueAtTime(880, now);
    osc2.frequency.exponentialRampToValueAtTime(1174.66, now + 0.12);

    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 0.32);
    osc2.stop(now + 0.32);
  } catch {
    /* 静默忽略音频错误 */
  }
}

/** 错题消灭/通关成就音效：四音琶音 (C5 -> E5 -> G5 -> C6) */
export function playCelebrationChord(): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, now + idx * 0.05);
      gain.gain.setValueAtTime(0.06, now + idx * 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.05 + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.05);
      osc.stop(now + idx * 0.05 + 0.35);
    });
  } catch {
    /* 忽略 */
  }
}

// ============================================================
// 专注心流白噪音引擎 (Web Audio 实时积分滤波合成，零外部音频文件，零体积，CAND-05)
// ============================================================

export type WhiteNoiseKind = "rain" | "waves" | "stream" | "whitenoise";

let noiseNode: AudioNode | null = null;
let noiseGainNode: GainNode | null = null;
let isNoisePlaying = false;

/**
 * 启动 Web Audio 代码实时合成的离线专注白噪音（零外部音频文件，零体积，带 800ms 平滑淡入）
 */
export function startFocusNoise(kind: WhiteNoiseKind = "rain", volume = 0.05, fadeMs = 800): void {
  try {
    stopFocusNoise(0);
    const ctx = getAudioContext();
    if (!ctx) return;

    const bufferSize = ctx.sampleRate * 2;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let lastOut = 0.0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      lastOut = (lastOut + 0.02 * white) / 1.02;
      data[i] = lastOut * 3.5;
    }

    const noiseSource = ctx.createBufferSource();
    noiseSource.buffer = buffer;
    noiseSource.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(kind === "rain" ? 750 : kind === "waves" ? 400 : 600, ctx.currentTime);

    const gain = ctx.createGain();
    const targetVol = Math.max(0.01, Math.min(0.2, volume));
    if (fadeMs > 0) {
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(targetVol, ctx.currentTime + fadeMs / 1000);
    } else {
      gain.gain.setValueAtTime(targetVol, ctx.currentTime);
    }

    noiseSource.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    noiseSource.start();
    noiseNode = noiseSource;
    noiseGainNode = gain;
    isNoisePlaying = true;
  } catch {
    /* 忽略音频错误 */
  }
}

/** 停止专注白噪音并平滑淡出释放音频节点（默认 600ms 淡出，消除耳膜突兀感） */
export function stopFocusNoise(fadeMs = 600): void {
  try {
    const ctx = getAudioContext();
    if (noiseGainNode && ctx && fadeMs > 0) {
      const curVol = noiseGainNode.gain.value;
      noiseGainNode.gain.cancelScheduledValues(ctx.currentTime);
      noiseGainNode.gain.setValueAtTime(curVol, ctx.currentTime);
      noiseGainNode.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + fadeMs / 1000);
      const prevSource = noiseNode;
      const prevGain = noiseGainNode;
      noiseNode = null;
      noiseGainNode = null;
      isNoisePlaying = false;
      setTimeout(() => {
        try {
          (prevSource as AudioBufferSourceNode)?.stop?.();
          prevSource?.disconnect();
          prevGain?.disconnect();
        } catch {
          /* 忽略释放错误 */
        }
      }, fadeMs + 60);
    } else {
      if (noiseNode) {
        (noiseNode as AudioBufferSourceNode).stop?.();
        noiseNode.disconnect();
        noiseNode = null;
      }
      if (noiseGainNode) {
        noiseGainNode.disconnect();
        noiseGainNode = null;
      }
      isNoisePlaying = false;
    }
  } catch {
    /* 忽略错误 */
  }
}

export function isFocusNoiseActive(): boolean {
  return isNoisePlaying;
}

