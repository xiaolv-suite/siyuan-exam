import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getQuestionScratchpadContent,
  copyScratchpadText,
} from "@/ui/practice/services/scratchpadWorkflowService";

describe("scratchpadWorkflowService", () => {
  const dummyT = (k: string) => `[${k}]`;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getQuestionScratchpadContent", () => {
    it("returns empty string when qid is falsy", () => {
      expect(getQuestionScratchpadContent({}, undefined, "per_question", "")).toBe("");
      expect(getQuestionScratchpadContent({}, "", "per_question", "")).toBe("");
    });

    it("retrieves content based on mode", () => {
      const store = { "q-1": "题目1演算过程" };
      expect(getQuestionScratchpadContent(store, "q-1", "per_question", "全局共享")).toBe("题目1演算过程");
      expect(getQuestionScratchpadContent(store, "q-1", "shared", "全局共享")).toBe("全局共享");
    });
  });

  describe("copyScratchpadText", () => {
    it("returns false for blank text", async () => {
      const showMsg = vi.fn();
      const res = await copyScratchpadText("   ", showMsg, dummyT);
      expect(res).toBe(false);
      expect(showMsg).not.toHaveBeenCalled();
    });

    it("copies text and triggers toast message", async () => {
      const writeTextMock = vi.fn().mockResolvedValue(undefined);
      vi.stubGlobal("navigator", {
        clipboard: {
          writeText: writeTextMock,
        },
      });

      const showMsg = vi.fn();
      const res = await copyScratchpadText("公式推导：E=mc^2", showMsg, dummyT);

      expect(res).toBe(true);
      expect(writeTextMock).toHaveBeenCalledWith("公式推导：E=mc^2");
      expect(showMsg).toHaveBeenCalledWith("[scratchpad.copied]", 2000, "info");
    });
  });
});
