import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  fetchBlockBacklinks,
  openSiYuanTarget,
} from "@/ui/practice/services/backlinkNavigationService";

describe("backlinkNavigationService", () => {
  const dummyT = (k: string) =>
    k === "browse.backlinksFailed" ? "获取反向链接失败：{message}" : `[${k}]`;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("fetchBlockBacklinks", () => {
    it("returns offline error when kernel is offline", async () => {
      const mockApp = { kernelOnline: false };
      const res = await fetchBlockBacklinks(mockApp, "block-1", dummyT);
      expect(res.error).toBe("[state.offlineHint]");
      expect(res.links).toBeUndefined();
    });

    it("fetches backlinks successfully from client", async () => {
      const mockLinks = [
        { docId: "doc-1", title: "错题集", content: "引用了题目" },
      ];
      const mockApp = {
        kernelOnline: true,
        deps: {
          client: {
            backlinks: vi.fn().mockResolvedValue(mockLinks),
          },
        },
      };

      const res = await fetchBlockBacklinks(mockApp, "block-1", dummyT);
      expect(res.links).toEqual(mockLinks);
      expect(res.error).toBeUndefined();
    });

    it("handles client error gracefully", async () => {
      const mockApp = {
        kernelOnline: true,
        deps: {
          client: {
            backlinks: vi.fn().mockRejectedValue(new Error("RPC Timeout")),
          },
        },
      };

      const res = await fetchBlockBacklinks(mockApp, "block-1", dummyT);
      expect(res.error).toContain("获取反向链接失败");
      expect(res.error).toContain("RPC Timeout");
    });
  });

  describe("openSiYuanTarget", () => {
    it("reports error when neither rootId nor blockId is given", () => {
      const showMsg = vi.fn();
      openSiYuanTarget({}, "", undefined, showMsg, dummyT);
      expect(showMsg).toHaveBeenCalledWith("[browse.docUnavailable]", 2600, "error");
    });

    it("opens siyuan protocol url when blockId is provided", () => {
      const openMock = vi.fn();
      vi.stubGlobal("window", { open: openMock });

      openSiYuanTarget({}, "doc-1", "block-2026");
      expect(openMock).toHaveBeenCalledWith("siyuan://blocks/block-2026");
    });
  });
});
