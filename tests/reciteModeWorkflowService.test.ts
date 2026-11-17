import { describe, it, expect } from "vitest";
import {
  loadReciteModeSetting,
  saveReciteModeSetting,
  buildQuestionTtsText,
  canScheduleReciteSubmit,
} from "@/ui/practice/services/reciteModeWorkflowService";
import type { Question } from "@/core/types";

describe("reciteModeWorkflowService", () => {
  describe("loadReciteModeSetting and saveReciteModeSetting", () => {
    it("reads and writes recite mode toggle correctly", () => {
      const store = new Map<string, string>();
      const readLocal = (k: string) => store.get(k) ?? null;
      const writeLocal = (k: string, v: string) => { store.set(k, v); };

      expect(loadReciteModeSetting(readLocal)).toBe(false);

      saveReciteModeSetting(writeLocal, true);
      expect(loadReciteModeSetting(readLocal)).toBe(true);

      saveReciteModeSetting(writeLocal, false);
      expect(loadReciteModeSetting(readLocal)).toBe(false);
    });
  });

  describe("buildQuestionTtsText", () => {
    it("returns empty string on empty question", () => {
      expect(buildQuestionTtsText(null)).toBe("");
      expect(buildQuestionTtsText(undefined)).toBe("");
    });

    it("joins stem and options for speech", () => {
      const q: Question = {
        id: "q-1",
        type: "single",
        stem: "三角形内角和是多少度？",
        options: ["A. 90度", "B. 180度", "C. 360度"],
        answer: "B",
      };

      const speech = buildQuestionTtsText(q);
      expect(speech).toBe("三角形内角和是多少度？ A. 90度 B. 180度 C. 360度");
    });
  });

  describe("canScheduleReciteSubmit", () => {
    const dummySession = {
      current: { id: "q-1" },
      state: { cursor: 0 },
    };

    it("returns true when session is active and no blocking states", () => {
      expect(canScheduleReciteSubmit({
        view: "session",
        session: dummySession,
        targetSession: dummySession,
        targetQuestionId: "q-1",
        targetCursor: 0,
        reciteToggle: true,
        hasFeedback: false,
        exitBusy: false,
      })).toBe(true);
    });

    it("returns false when view is not session or feedback/exit is present", () => {
      expect(canScheduleReciteSubmit({
        view: "browse",
        session: dummySession,
        targetSession: dummySession,
        reciteToggle: true,
        hasFeedback: false,
        exitBusy: false,
      })).toBe(false);

      expect(canScheduleReciteSubmit({
        view: "session",
        session: dummySession,
        targetSession: dummySession,
        reciteToggle: true,
        hasFeedback: true,
        exitBusy: false,
      })).toBe(false);

      expect(canScheduleReciteSubmit({
        view: "session",
        session: dummySession,
        targetSession: dummySession,
        reciteToggle: true,
        hasFeedback: false,
        exitBusy: true,
      })).toBe(false);
    });

    it("returns false when session instance or cursor has diverged", () => {
      const otherSession = { ...dummySession };
      expect(canScheduleReciteSubmit({
        view: "session",
        session: dummySession,
        targetSession: otherSession,
        reciteToggle: true,
        hasFeedback: false,
        exitBusy: false,
      })).toBe(false);
    });
  });
});
