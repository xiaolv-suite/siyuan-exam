// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  markAncestorSiblingsInert,
  handleDrawerTabKey,
  isClickOutsideElement,
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
});
