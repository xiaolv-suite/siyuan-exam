import { describe, it, expect, vi } from "vitest";
import {
  fetchGleanClips,
  batchMarkGleanClipsDone,
  listGleanClipsSafely,
} from "@/ui/practice/services/gleanEcosystemService";
import type { GleanClip } from "@/core/gleanBridge";

describe("拾遗剪藏生态服务 (gleanEcosystemService)", () => {
  const fakeClip: GleanClip = {
    id: "clip-1",
    title: "论文笔记摘要",
    url: "https://example.com/p1",
    site: "知网",
    text: "知识点详细论述内容...",
    tags: ["考研", "重点"],
    time: 123456,
  };

  it("1. fetchGleanClips：拾遗未安装或无剪藏时的降级与提示", async () => {
    const msgs: string[] = [];
    const showMessage = (m: string) => msgs.push(m);
    const t = (k: string) => `[${k}]`;

    // 1. 无拾遗插件
    const r1 = await fetchGleanClips({} as Window, 10, showMessage, t);
    expect(r1.error).toBe("[ai.gleanUnavailable]");
    expect(r1.clips).toHaveLength(0);

    // 2. 有拾遗插件但无剪藏
    const mockWinEmpty = {
      siyuanGlean: {
        apiVersion: 1,
        listClips: vi.fn().mockResolvedValue([]),
      },
    } as unknown as Window;

    const r2 = await fetchGleanClips(mockWinEmpty, 10, showMessage, t);
    expect(r2.clips).toHaveLength(0);
    expect(msgs).toContain("[ai.gleanEmpty]");
  });

  it("2. fetchGleanClips 与 batchMarkGleanClipsDone：剪藏拉取与已读标记闭环", async () => {
    const msgs: string[] = [];
    const showMessage = (m: string) => msgs.push(m);
    const t = (k: string) => `[${k}]`;

    const markMock = vi.fn().mockResolvedValue(undefined);
    const mockWin = {
      siyuanGlean: {
        apiVersion: 1,
        listClips: vi.fn().mockResolvedValue([fakeClip]),
        setClipStatus: markMock,
      },
    } as unknown as Window;

    // 1. 拉取剪藏
    const res = await fetchGleanClips(mockWin, 10, showMessage, t);
    expect(res.clips).toHaveLength(1);
    expect(res.sourceBlock).toContain("论文笔记摘要");
    expect(msgs[0]).toContain("[ai.gleanImported]");

    // 2. 批量标记已读
    const doneRes = await batchMarkGleanClipsDone(mockWin, res.clips, showMessage, t);
    expect(doneRes.okCount).toBe(1);
    expect(markMock).toHaveBeenCalledWith("clip-1", "done");
    expect(msgs[1]).toContain("[ai.gleanDoneAll]");

    // 3. listGleanClipsSafely
    const safeClips = await listGleanClipsSafely(mockWin, 5);
    expect(safeClips).toHaveLength(1);
    expect(safeClips[0].title).toBe("论文笔记摘要");
    const emptySafe = await listGleanClipsSafely({} as Window, 5);
    expect(emptySafe).toEqual([]);
  });
});
