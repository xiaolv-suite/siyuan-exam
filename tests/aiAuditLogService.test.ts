import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  recordAiAuditTask,
  loadAiAuditTaskLogs,
  saveExplainConversationHistory,
  loadExplainConversationHistory,
} from "@/ui/practice/services/aiAuditLogService";

describe("aiAuditLogService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("recordAiAuditTask and loadAiAuditTaskLogs", () => {
    it("records task log entry and caps at 20 items", async () => {
      let savedLog: any[] = [];
      const mockApp = {
        loadAux: vi.fn().mockImplementation(() => Promise.resolve(savedLog)),
        saveAux: vi.fn().mockImplementation((_k, val) => {
          savedLog = val;
          return Promise.resolve();
        }),
      };

      await recordAiAuditTask(mockApp, {
        templateId: "practice.explain",
        qid: "q-1",
        status: "ok",
        tokens: 350,
        messages: [{ role: "user", content: "请讲解" }],
      });

      expect(savedLog).toHaveLength(1);
      expect(savedLog[0].qid).toBe("q-1");
      expect(savedLog[0].at).toBeDefined();

      const loaded = await loadAiAuditTaskLogs(mockApp);
      expect(loaded).toEqual(savedLog);
    });

    it("returns empty array on load failure", async () => {
      const mockApp = {
        loadAux: vi.fn().mockRejectedValue(new Error("损坏")),
      };
      expect(await loadAiAuditTaskLogs(mockApp)).toEqual([]);
    });
  });

  describe("saveExplainConversationHistory and loadExplainConversationHistory", () => {
    it("saves conversation history and caps at 10 items", async () => {
      let stored: any = null;
      const mockApp = {
        saveAux: vi.fn().mockImplementation((_k, v) => {
          stored = v;
          return Promise.resolve();
        }),
        loadAux: vi.fn().mockImplementation(() => Promise.resolve(stored)),
      };

      const history: Record<string, any[]> = {};
      for (let i = 1; i <= 15; i++) {
        history[`q-${i}`] = [{ role: "assistant", content: `讲解${i}` }];
      }

      await saveExplainConversationHistory(mockApp, history);
      expect(Object.keys(stored)).toHaveLength(10);
      expect(stored["q-15"]).toBeDefined();
      expect(stored["q-1"]).toBeUndefined(); // 前5个被切除

      const loaded = await loadExplainConversationHistory(mockApp);
      expect(Object.keys(loaded)).toHaveLength(10);
    });
  });
});
