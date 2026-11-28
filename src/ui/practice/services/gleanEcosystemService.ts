import {
  probeGlean,
  listLaterClips,
  formatClipsForSource,
  markClipDone,
  type GleanClip,
} from "@/core/gleanBridge";
import type { MessageReporter } from "./printPaperService";

/**
 * 安全列出稍后读剪藏（不弹提示框，用于导入工坊列表展示）
 */
export async function listGleanClipsSafely(
  win: Window = typeof window !== "undefined" ? window : ({} as Window),
  limit = 30,
): Promise<GleanClip[]> {
  const g = probeGlean(win);
  if (!g) return [];
  return await listLaterClips(g, limit);
}

/**
 * 探测拾遗插件并拉取稍后读剪藏素材
 */
export async function fetchGleanClips(
  win: Window = typeof window !== "undefined" ? window : ({} as Window),
  limit = 10,
  showMessage: MessageReporter,
  t: (k: string) => string,
): Promise<{ clips: GleanClip[]; sourceBlock: string; error?: string }> {
  const g = probeGlean(win);
  if (!g) {
    return { clips: [], sourceBlock: "", error: t("ai.gleanUnavailable") };
  }
  const clips = await listLaterClips(g, limit);
  if (!clips.length) {
    showMessage(t("ai.gleanEmpty"), 3200, "info");
    return { clips: [], sourceBlock: "" };
  }
  const sourceBlock = formatClipsForSource(clips);
  showMessage(t("ai.gleanImported").replace("{n}", String(clips.length)), 3200, "info");
  return { clips, sourceBlock };
}

/**
 * 将已用于出题的剪藏素材逐篇标记为已读
 */
export async function batchMarkGleanClipsDone(
  win: Window = typeof window !== "undefined" ? window : ({} as Window),
  clips: GleanClip[],
  showMessage: MessageReporter,
  t: (k: string) => string,
): Promise<{ okCount: number; note: string; error?: string }> {
  const g = probeGlean(win);
  if (!g) {
    return { okCount: 0, note: "", error: t("ai.gleanUnavailable") };
  }
  let ok = 0;
  for (const c of clips) {
    if (await markClipDone(g, c.id)) ok++;
  }
  const note =
    ok === clips.length
      ? t("ai.gleanDoneAll").replace("{n}", String(ok))
      : t("ai.gleanDonePartial").replace("{ok}", String(ok)).replace("{n}", String(clips.length));

  showMessage(note, 4600, ok ? "info" : "error");
  return { okCount: ok, note };
}
