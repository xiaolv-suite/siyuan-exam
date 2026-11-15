import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  executeCommitImport,
  executeAnswerUpdates,
  buildRetryMissingReport,
} from "@/ui/practice/services/importExecutionService";
import type { ImportReport } from "@/importer/pipeline";

describe("importExecutionService", () => {
  const dummyT = (k: string) => `[${k}]`;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("executeCommitImport", () => {
    it("handles successful import with readback confirmation", async () => {
      const mockReport: ImportReport = {
        ok: [
          { id: "q-1", stem: "题1" } as any,
          { id: "q-2", stem: "题2" } as any,
        ],
        errors: [],
        duplicates: 0,
        batch: "batch-2026",
      };

      const mockApp = {
        commitImport: vi.fn().mockResolvedValue({
          written: 2,
          readback: {
            confirmed: ["q-1", "q-2"],
            missing: [],
            verified: true,
          },
        }),
      };

      const res = await executeCommitImport(mockApp, "bank-1", mockReport, 1);
      expect(mockApp.commitImport).toHaveBeenCalled();
      expect(res.importResult.written).toBe(3); // 2 + 1 试导
      expect(res.importResult.confirmed).toBe(3);
      expect(res.importResult.missing).toBe(0);
      expect(res.importResult.verified).toBe(true);
      expect(res.retryPool).toEqual([]);
      expect(res.cancelled).toBe(false);
    });

    it("populates retryPool when there are missing questions", async () => {
      const mockReport: ImportReport = {
        ok: [
          { id: "q-1", stem: "题1" } as any,
          { id: "q-2", stem: "题2" } as any,
        ],
        errors: [],
        duplicates: 0,
        batch: "batch-fail",
      };

      const mockApp = {
        commitImport: vi.fn().mockResolvedValue({
          written: 2,
          readback: {
            confirmed: ["q-1"],
            missing: ["q-2"],
            verified: false,
          },
        }),
      };

      const res = await executeCommitImport(mockApp, "bank-1", mockReport, 0);
      expect(res.importResult.confirmed).toBe(1);
      expect(res.importResult.missing).toBe(1);
      expect(res.retryPool).toHaveLength(1);
      expect(res.retryPool[0].id).toBe("q-2");
    });
  });

  describe("executeAnswerUpdates", () => {
    it("applies answer updates and formats success message", async () => {
      const mockApp = {
        listQuestions: vi.fn().mockResolvedValue([{ id: "q-1" }]),
        applyAnswerUpdates: vi.fn().mockResolvedValue({
          ok: 5,
          failed: 0,
          missing: 0,
        }),
      };

      const res = await executeAnswerUpdates(
        mockApp,
        "bank-1",
        [{ row: 2, q: { id: "q-1" } as any }],
        [],
        dummyT,
      );

      expect(mockApp.applyAnswerUpdates).toHaveBeenCalled();
      expect(res.hasIssue).toBe(false);
      expect(res.messageType).toBe("info");
      expect(res.updateResult.ok).toBe(5);
    });

    it("signals issue when updates have failures or missing items", async () => {
      const mockApp = {
        listQuestions: vi.fn().mockResolvedValue([]),
        applyAnswerUpdates: vi.fn().mockResolvedValue({
          ok: 1,
          failed: 1,
          missing: 1,
          unprocessed: 1,
        }),
      };

      const res = await executeAnswerUpdates(
        mockApp,
        "bank-1",
        [],
        [],
        dummyT,
      );

      expect(res.hasIssue).toBe(true);
      expect(res.messageType).toBe("error");
    });

    it("builds retry missing report accurately", () => {
      const retryPool = [{ id: "q-retry" }] as any;
      const report = buildRetryMissingReport(retryPool, "b-batch-1");
      expect(report.ok).toEqual(retryPool);
      expect(report.batch).toBe("b-batch-1");
      expect(report.errors).toEqual([]);
    });
  });
});
