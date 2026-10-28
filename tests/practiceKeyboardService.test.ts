import { describe, it, expect } from "vitest";
import {
  shouldIgnoreKeyEvent,
  resolveKeyboardAction,
} from "@/ui/practice/services/practiceKeyboardService";
import type { Question } from "@/core/types";

describe("practiceKeyboardService", () => {
  describe("shouldIgnoreKeyEvent", () => {
    it("ignores composing input and defaultPrevented events", () => {
      expect(shouldIgnoreKeyEvent({ key: "a", isComposing: true })).toBe(true);
      expect(shouldIgnoreKeyEvent({ key: "a", keyCode: 229 })).toBe(true);
      expect(shouldIgnoreKeyEvent({ key: "Enter", defaultPrevented: true })).toBe(true);
      expect(shouldIgnoreKeyEvent({ key: "Enter" })).toBe(false);
    });
  });

  describe("resolveKeyboardAction - global help", () => {
    it("returns help action on question mark", () => {
      const res = resolveKeyboardAction({
        event: { key: "?" },
        view: "browse",
      });
      expect(res).toEqual({ type: "help" });
    });

    it("ignores question mark if modifier keys are pressed", () => {
      const res = resolveKeyboardAction({
        event: { key: "?", ctrlKey: true },
        view: "browse",
      });
      expect(res).toBeNull();
    });
  });

  describe("resolveKeyboardAction - session view", () => {
    const dummyChoiceQ: Question = {
      id: "q-1",
      type: "single",
      stem: "1+1=?",
      options: ["1", "2", "3", "4"],
      answer: "B",
    };

    it("returns exit_session on Escape", () => {
      const res = resolveKeyboardAction({
        event: { key: "Escape" },
        view: "session",
        session: {
          hasSession: true,
          isSessionDone: false,
          currentQuestion: dummyChoiceQ,
          hasFeedback: false,
          canSubmit: false,
          doneCount: 0,
        },
      });
      expect(res).toEqual({ type: "exit_session" });
    });

    it("handles answering state actions: choice pick, confidence, fav, submit, prev", () => {
      const baseSession = {
        hasSession: true,
        isSessionDone: false,
        currentQuestion: dummyChoiceQ,
        hasFeedback: false,
        canSubmit: true,
        doneCount: 2,
      };

      // 选选项 A-D
      expect(resolveKeyboardAction({ event: { key: "b" }, view: "session", session: baseSession }))
        .toEqual({ type: "pick_choice", key: "B" });

      // 答前置信度 1-3
      expect(resolveKeyboardAction({ event: { key: "1" }, view: "session", session: baseSession }))
        .toEqual({ type: "set_confidence", confidence: "sure" });
      expect(resolveKeyboardAction({ event: { key: "2" }, view: "session", session: baseSession }))
        .toEqual({ type: "set_confidence", confidence: "fuzzy" });
      expect(resolveKeyboardAction({ event: { key: "3" }, view: "session", session: baseSession }))
        .toEqual({ type: "set_confidence", confidence: "guess" });

      // 收藏 e
      expect(resolveKeyboardAction({ event: { key: "e" }, view: "session", session: baseSession }))
        .toEqual({ type: "toggle_fav" });

      // 草稿纸 Shift+S
      expect(resolveKeyboardAction({ event: { key: "S", shiftKey: true }, view: "session", session: baseSession }))
        .toEqual({ type: "toggle_scratchpad" });

      // 提交 Enter
      expect(resolveKeyboardAction({ event: { key: "Enter" }, view: "session", session: baseSession }))
        .toEqual({ type: "submit_answer" });

      // 上一题 k
      expect(resolveKeyboardAction({ event: { key: "k" }, view: "session", session: baseSession }))
        .toEqual({ type: "prev_question" });
    });

    it("handles feedback state actions: undo, next, prev, wrong reason", () => {
      const feedbackSession = {
        hasSession: true,
        isSessionDone: false,
        currentQuestion: dummyChoiceQ,
        hasFeedback: true,
        feedbackVerdict: "wrong",
        canSubmit: false,
        doneCount: 1,
      };

      // 撤回作答 Ctrl+Z / Meta+Z / u
      expect(resolveKeyboardAction({ event: { key: "z", ctrlKey: true }, view: "session", session: feedbackSession }))
        .toEqual({ type: "undo_submit" });
      expect(resolveKeyboardAction({ event: { key: "u" }, view: "session", session: feedbackSession }))
        .toEqual({ type: "undo_submit" });

      // 下一题 Enter / j
      expect(resolveKeyboardAction({ event: { key: "Enter" }, view: "session", session: feedbackSession }))
        .toEqual({ type: "next_question" });
      expect(resolveKeyboardAction({ event: { key: "j" }, view: "session", session: feedbackSession }))
        .toEqual({ type: "next_question" });

      // 上一题 k
      expect(resolveKeyboardAction({ event: { key: "k" }, view: "session", session: feedbackSession }))
        .toEqual({ type: "prev_question" });

      // 错因归因 1-3
      expect(resolveKeyboardAction({ event: { key: "1" }, view: "session", session: feedbackSession }))
        .toEqual({ type: "record_wrong_reason", reason: "careless" });
      expect(resolveKeyboardAction({ event: { key: "2" }, view: "session", session: feedbackSession }))
        .toEqual({ type: "record_wrong_reason", reason: "unknown" });
      expect(resolveKeyboardAction({ event: { key: "3" }, view: "session", session: feedbackSession }))
        .toEqual({ type: "record_wrong_reason", reason: "trap" });
    });
  });

  describe("resolveKeyboardAction - recite view", () => {
    it("handles recite flow: speak, reveal, hint, and ratings 1-4", () => {
      const unrevealedRecite = {
        isDone: false,
        hasQueue: true,
        hasCurrentQuestion: true,
        revealed: false,
        hintLevel: 1,
        hasAnalysis: true,
      };

      // 朗读 v
      expect(resolveKeyboardAction({ event: { key: "v" }, view: "recite", recite: unrevealedRecite }))
        .toEqual({ type: "tts_speak" });

      // 翻开 空格
      expect(resolveKeyboardAction({ event: { key: " " }, view: "recite", recite: unrevealedRecite }))
        .toEqual({ type: "reveal_recite" });

      // 提示 h
      expect(resolveKeyboardAction({ event: { key: "h" }, view: "recite", recite: unrevealedRecite }))
        .toEqual({ type: "recite_hint" });

      // 翻开后打分 1-4
      const revealedRecite = { ...unrevealedRecite, revealed: true };
      expect(resolveKeyboardAction({ event: { key: "1" }, view: "recite", recite: revealedRecite }))
        .toEqual({ type: "recite_rate", rating: 1 });
      expect(resolveKeyboardAction({ event: { key: "4" }, view: "recite", recite: revealedRecite }))
        .toEqual({ type: "recite_rate", rating: 4 });
    });
  });
});
