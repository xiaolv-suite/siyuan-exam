import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getQuestionScratchpadContent,
  copyScratchpadText,
  applyScratchpadInput,
  applyClearScratchpad,
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

  describe("applyScratchpadInput and applyClearScratchpad", () => {
    it("returns null when qid is falsy", () => {
      expect(applyScratchpadInput({}, undefined, "测试", "per_question", "")).toBeNull();
      expect(applyClearScratchpad({}, undefined, "per_question", "")).toBeNull();
    });

    it("updates and clears scratchpad store correctly", () => {
      const resInput = applyScratchpadInput({}, "q-1", "推导步骤", "per_question", "");
      expect(resInput?.store["q-1"]).toBe("推导步骤");

      const resClear = applyClearScratchpad(resInput!.store, "q-1", "per_question", "");
      expect(resClear?.store["q-1"]).toBeUndefined();
    });
  });
});
