// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  markAncestorSiblingsInert,
  handleDrawerTabKey,
  isClickOutsideElement,
  handleDrawerNavKey,
  handleModalDrawerKeydown,
} from "@/ui/shared/drawerAccessibility";

describe("drawerAccessibility", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  describe("markAncestorSiblingsInert", () => {
    it("marks sibling nodes as inert and restores them on cleanup", () => {
      const container = document.createElement("div");
      const sibling1 = document.createElement("div");
      const drawerWrapper = document.createElement("div");
      const drawer = document.createElement("div");

      drawerWrapper.appendChild(drawer);
      container.appendChild(sibling1);
      container.appendChild(drawerWrapper);
      document.body.appendChild(container);

      expect(sibling1.hasAttribute("inert")).toBe(false);

      const cleanup = markAncestorSiblingsInert(drawer, container);
      expect(sibling1.hasAttribute("inert")).toBe(true);
      expect(sibling1.getAttribute("aria-hidden")).toBe("true");

      cleanup();
      expect(sibling1.hasAttribute("inert")).toBe(false);
      expect(sibling1.hasAttribute("aria-hidden")).toBe(false);
    });

    it("does not mark backdrop elements", () => {
      const container = document.createElement("div");
      const backdrop = document.createElement("div");
      backdrop.className = "lv-peek-backdrop";
      const drawer = document.createElement("div");

      container.appendChild(backdrop);
      container.appendChild(drawer);
      document.body.appendChild(container);

      const cleanup = markAncestorSiblingsInert(drawer, container);
      expect(backdrop.hasAttribute("inert")).toBe(false);
      cleanup();
    });
  });

  describe("handleDrawerTabKey", () => {
    it("cycles focus between first and last focusable element in drawer", () => {
      const drawer = document.createElement("div");
      const btn1 = document.createElement("button");
      const btn2 = document.createElement("button");

      // Mock getClientRects for jsdom
      btn1.getClientRects = () => [{ width: 10, height: 10 } as any] as any;
      btn2.getClientRects = () => [{ width: 10, height: 10 } as any] as any;

      drawer.appendChild(btn1);
      drawer.appendChild(btn2);
      document.body.appendChild(drawer);

      const focusSpy1 = vi.spyOn(btn1, "focus");
      const focusSpy2 = vi.spyOn(btn2, "focus");

      // Shift+Tab from first -> focus last
      vi.spyOn(document, "activeElement", "get").mockReturnValue(btn1);
      const shiftTabEvent = new KeyboardEvent("keydown", { key: "Tab", shiftKey: true });
      const preventSpy = vi.spyOn(shiftTabEvent, "preventDefault");
      handleDrawerTabKey(drawer, shiftTabEvent);
      expect(preventSpy).toHaveBeenCalled();
      expect(focusSpy2).toHaveBeenCalled();

      // Tab from last -> focus first
      vi.spyOn(document, "activeElement", "get").mockReturnValue(btn2);
      const tabEvent = new KeyboardEvent("keydown", { key: "Tab", shiftKey: false });
      handleDrawerTabKey(drawer, tabEvent);
      expect(focusSpy1).toHaveBeenCalled();
    });
  });

  describe("isClickOutsideElement", () => {
    it("detects clicks inside and outside", () => {
      const container = document.createElement("div");
      const inner = document.createElement("button");
      const outside = document.createElement("span");

      container.appendChild(inner);
      document.body.appendChild(container);
      document.body.appendChild(outside);

      expect(isClickOutsideElement(container, inner)).toBe(false);
      expect(isClickOutsideElement(container, outside)).toBe(true);
      expect(isClickOutsideElement(null, outside)).toBe(false);
    });
  });

  describe("handleDrawerNavKey", () => {
    it("handles escape and navigation shortcuts appropriately", () => {
      const handlers = {
        onClose: vi.fn(),
        onPrev: vi.fn(),
        onNext: vi.fn(),
        onToggleFav: vi.fn(),
      };

      // 1. Escape key
      const escEvent = new KeyboardEvent("keydown", { key: "Escape" });
      const stopSpy = vi.spyOn(escEvent, "stopPropagation");
      handleDrawerNavKey(escEvent, handlers);
      expect(stopSpy).toHaveBeenCalled();
      expect(handlers.onClose).toHaveBeenCalled();

      // 2. Navigation Up / k
      const kEvent = new KeyboardEvent("keydown", { key: "k" });
      const preventSpyK = vi.spyOn(kEvent, "preventDefault");
      handleDrawerNavKey(kEvent, handlers);
      expect(preventSpyK).toHaveBeenCalled();
      expect(handlers.onPrev).toHaveBeenCalled();

      // 3. Navigation Down / j
      const jEvent = new KeyboardEvent("keydown", { key: "j" });
      const preventSpyJ = vi.spyOn(jEvent, "preventDefault");
      handleDrawerNavKey(jEvent, handlers);
      expect(preventSpyJ).toHaveBeenCalled();
      expect(handlers.onNext).toHaveBeenCalled();

      // 4. Favorite toggle 'e'
      const eEvent = new KeyboardEvent("keydown", { key: "e" });
      const preventSpyE = vi.spyOn(eEvent, "preventDefault");
      handleDrawerNavKey(eEvent, handlers);
      expect(preventSpyE).toHaveBeenCalled();
      expect(handlers.onToggleFav).toHaveBeenCalled();

      // 5. Input elements should not trigger navigation shortcuts
      const inputEl = document.createElement("input");
      const inputKEvent = new KeyboardEvent("keydown", { key: "k" });
      Object.defineProperty(inputKEvent, "target", { value: inputEl });
      handlers.onPrev.mockClear();
      handleDrawerNavKey(inputKEvent, handlers);
      expect(handlers.onPrev).not.toHaveBeenCalled();
    });
  });

  describe("handleModalDrawerKeydown", () => {
    it("handles escape and tab within modal drawer", () => {
      const drawer = document.createElement("div");
      document.body.appendChild(drawer);
      const onClose = vi.fn();

      // 1. drawer 为空返回 false
      expect(handleModalDrawerKeydown(new KeyboardEvent("keydown"), null, onClose)).toBe(false);

      // 2. Escape 按键拦截并关闭
      const esc = new KeyboardEvent("keydown", { key: "Escape" });
      const preventSpy = vi.spyOn(esc, "preventDefault");
      const res = handleModalDrawerKeydown(esc, drawer, onClose);
      expect(res).toBe(true);
      expect(preventSpy).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });
  });
});
