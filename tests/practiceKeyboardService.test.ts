// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import {
  shouldIgnoreKeyEvent,
  resolveKeyboardAction,
  isInputTarget,
  shouldBlockGlobalHotkeys,
  detectHorizontalSwipe,
  getNextStudyFontSize,
  tablistNextIndex,
  handleTablistKeydown,
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

  describe("isInputTarget and shouldBlockGlobalHotkeys", () => {
    it("identifies input targets correctly", () => {
      const input = document.createElement("input");
      const textarea = document.createElement("textarea");
      const div = document.createElement("div");

      expect(isInputTarget(input)).toBe(true);
      expect(isInputTarget(textarea)).toBe(true);
      expect(isInputTarget(div)).toBe(false);
      expect(isInputTarget(null)).toBe(false);
    });

    it("evaluates shouldBlockGlobalHotkeys accurately", () => {
      const tabRoot = document.createElement("div");
      tabRoot.getClientRects = () => [{ width: 100, height: 100 } as any] as any;
      const innerBtn = document.createElement("button");
      tabRoot.appendChild(innerBtn);
      document.body.appendChild(tabRoot);

      // 1. 正常容器与内部普通元素 -> 不拦截
      expect(shouldBlockGlobalHotkeys({
        tabRoot,
        target: innerBtn,
      })).toBe(false);

      // 2. 外部元素或无可见尺寸 -> 拦截
      const outsideEl = document.createElement("div");
      document.body.appendChild(outsideEl);
      expect(shouldBlockGlobalHotkeys({
        tabRoot,
        target: outsideEl,
      })).toBe(true);

      // 3. 模态窗口或调色板打开 -> 拦截
      expect(shouldBlockGlobalHotkeys({
        tabRoot,
        target: innerBtn,
        paletteOpen: true,
      })).toBe(true);
    });
  });

  describe("detectHorizontalSwipe and getNextStudyFontSize", () => {
    it("detectHorizontalSwipe：精确检测向左/向右滑动手势并过滤抖动", () => {
      const startState = { startX: 100, startY: 100, startTime: Date.now() - 100 };

      // 1. 多个 touch 或不是 1 个 -> null
      const multiTouch = { changedTouches: [{}, {}] } as any;
      expect(detectHorizontalSwipe(multiTouch, startState)).toBeNull();

      // 2. 水平向左划（deltaX < -60 且 deltaX 占主导）
      const swipeLeft = {
        changedTouches: [{ clientX: 30, clientY: 105 }],
      } as any;
      expect(detectHorizontalSwipe(swipeLeft, startState)).toBe("next");

      // 3. 水平向右划（deltaX > 60 且占主导）
      const swipeRight = {
        changedTouches: [{ clientX: 180, clientY: 102 }],
      } as any;
      expect(detectHorizontalSwipe(swipeRight, startState)).toBe("prev");

      // 4. 纵向滑动或幅度太小 -> null
      const verticalScroll = {
        changedTouches: [{ clientX: 105, clientY: 200 }],
      } as any;
      expect(detectHorizontalSwipe(verticalScroll, startState)).toBeNull();
    });

    it("getNextStudyFontSize：循环切换自习字号", () => {
      expect(getNextStudyFontSize("normal")).toBe("large");
      expect(getNextStudyFontSize("large")).toBe("xlarge");
      expect(getNextStudyFontSize("xlarge")).toBe("normal");
    });
  });
});

describe("practiceKeyboardService - G 键猜测直标 (benchmark-fusion CBM)", () => {
  // 选项数 ≤ 6 时 G 未被 A-J 选项键位占用 → 直标「猜测」
  const fourOptionQ: Question = {
    id: "q-g1",
    type: "single",
    stem: "4选项题",
    options: ["1", "2", "3", "4"],
    answer: "A",
  };
  // 7 选项题：G 是第 7 个选项键，置信度只能用 3 键
  const sevenOptionQ: Question = {
    id: "q-g2",
    type: "single",
    stem: "7选项题",
    options: ["1", "2", "3", "4", "5", "6", "7"],
    answer: "A",
  };
  // 非选择题（fill）：A-J 全部空闲
  const fillQ: Question = {
    id: "q-g3",
    type: "fill",
    stem: "____是细胞呼吸的主要场所",
    options: [],
    answer: "线粒体",
  };

  const sessionFor = (q: Question) => ({
    hasSession: true,
    isSessionDone: false,
    currentQuestion: q,
    hasFeedback: false,
    canSubmit: true,
    doneCount: 1,
  });

  it("G/g 键在 4 选项题上直标 guess", () => {
    expect(resolveKeyboardAction({ event: { key: "g" }, view: "session", session: sessionFor(fourOptionQ) }))
      .toEqual({ type: "set_confidence", confidence: "guess" });
    expect(resolveKeyboardAction({ event: { key: "G" }, view: "session", session: sessionFor(fourOptionQ) }))
      .toEqual({ type: "set_confidence", confidence: "guess" });
  });

  it("7 选项题上 G 仍是选项键（不抢占 A-J），置信度退回 3 键", () => {
    expect(resolveKeyboardAction({ event: { key: "g" }, view: "session", session: sessionFor(sevenOptionQ) }))
      .toEqual({ type: "pick_choice", key: "G" });
    expect(resolveKeyboardAction({ event: { key: "3" }, view: "session", session: sessionFor(sevenOptionQ) }))
      .toEqual({ type: "set_confidence", confidence: "guess" });
  });

  it("非选择题（fill）上 G 直标 guess", () => {
    expect(resolveKeyboardAction({ event: { key: "g" }, view: "session", session: sessionFor(fillQ) }))
      .toEqual({ type: "set_confidence", confidence: "guess" });
  });
});

describe("tablistNextIndex — WAI-ARIA tabs 方向键导航 (benchmark-fusion)", () => {
  const n = 5;

  it("ArrowRight/ArrowLeft 循环移动", () => {
    expect(tablistNextIndex("ArrowRight", 0, n)).toBe(1);
    expect(tablistNextIndex("ArrowRight", n - 1, n)).toBe(0);
    expect(tablistNextIndex("ArrowLeft", 0, n)).toBe(n - 1);
    expect(tablistNextIndex("ArrowLeft", 2, n)).toBe(1);
  });

  it("Home/End 跳两端", () => {
    expect(tablistNextIndex("Home", 3, n)).toBe(0);
    expect(tablistNextIndex("End", 0, n)).toBe(n - 1);
  });

  it("非方向键与越界入参返回 -1 不处理", () => {
    expect(tablistNextIndex("Enter", 0, n)).toBe(-1);
    expect(tablistNextIndex("ArrowRight", -1, n)).toBe(-1);
    expect(tablistNextIndex("ArrowRight", 9, n)).toBe(-1);
    expect(tablistNextIndex("ArrowRight", 0, 0)).toBe(-1);
  });
});

describe("handleTablistKeydown — tablist 统一键盘处理 (benchmark-fusion)", () => {
  function buildTablist(count: number): { container: HTMLElement; buttons: HTMLButtonElement[]; clicks: number[] } {
    const container = document.createElement("div");
    container.setAttribute("role", "tablist");
    const clicks: number[] = [];
    const buttons: HTMLButtonElement[] = [];
    for (let i = 0; i < count; i++) {
      const b = document.createElement("button");
      b.setAttribute("role", "tab");
      b.addEventListener("click", () => clicks.push(i));
      container.appendChild(b);
      buttons.push(b);
    }
    document.body.appendChild(container);
    return { container, buttons, clicks };
  }

  function fire(container: HTMLElement, button: HTMLButtonElement, key: string): boolean {
    let consumed = false;
    const listener = (e: Event) => { consumed = handleTablistKeydown(e as KeyboardEvent); };
    container.addEventListener("keydown", listener);
    button.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
    container.removeEventListener("keydown", listener);
    return consumed;
  }

  it("ArrowRight 移动焦点并自动激活下一 tab", () => {
    const { container, buttons, clicks } = buildTablist(3);
    expect(fire(container, buttons[0]!, "ArrowRight")).toBe(true);
    expect(document.activeElement).toBe(buttons[1]!);
    expect(clicks).toEqual([1]);
    container.remove();
  });

  it("ArrowLeft 循环到末尾；Home/End 跳两端", () => {
    const { container, buttons, clicks } = buildTablist(3);
    expect(fire(container, buttons[0]!, "ArrowLeft")).toBe(true);
    expect(document.activeElement).toBe(buttons[2]!);
    expect(fire(container, buttons[2]!, "Home")).toBe(true);
    expect(document.activeElement).toBe(buttons[0]!);
    expect(fire(container, buttons[0]!, "End")).toBe(true);
    expect(document.activeElement).toBe(buttons[2]!);
    expect(clicks).toEqual([2, 0, 2]);
    container.remove();
  });

  it("非方向键 / 焦点不在 tab 上时不消费不扰动", () => {
    const { container, buttons, clicks } = buildTablist(2);
    expect(fire(container, buttons[0]!, "Enter")).toBe(false);
    const outsider = document.createElement("button");
    container.appendChild(outsider); // 无 role=tab
    expect(fire(container, outsider, "ArrowRight")).toBe(false);
    expect(clicks).toEqual([]);
    container.remove();
  });
});
