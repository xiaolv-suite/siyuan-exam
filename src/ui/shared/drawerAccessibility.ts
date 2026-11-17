// ============================================================
// 抽屉与浮层模态无障碍辅助工具（drawerAccessibility.ts）
// 承接抽屉打开时的焦点捕获、关闭时的焦点还原、以及祖先链兄弟元素惰性（inert）标记
// ============================================================

export interface MarkedInertNode {
  node: HTMLElement;
  hadInert: boolean;
  ariaHidden: string | null;
}

/**
 * 沿抽屉祖先链将同级兄弟节点标记为 inert 与 aria-hidden，实现局部 DOM 内的严格模态屏障。
 * 返回清理回调函数，在抽屉关闭时自动还原原有状态。
 */
export function markAncestorSiblingsInert(
  drawer: HTMLElement,
  containerRoot: HTMLElement,
  backdropClass = "lv-peek-backdrop",
): () => void {
  const marked: MarkedInertNode[] = [];

  const mark = (node: HTMLElement) => {
    if (
      node === drawer ||
      node.classList.contains(backdropClass) ||
      marked.some((x) => x.node === node)
    ) {
      return;
    }
    marked.push({
      node,
      hadInert: node.hasAttribute("inert"),
      ariaHidden: node.getAttribute("aria-hidden"),
    });
    node.setAttribute("inert", "");
    node.setAttribute("aria-hidden", "true");
  };

  let current: HTMLElement | null = drawer;
  while (current && current !== containerRoot) {
    const parent = current.parentElement;
    if (!parent) break;
    for (const child of [...parent.children]) {
      if (child instanceof HTMLElement && child !== current && !child.contains(drawer)) {
        mark(child);
      }
    }
    current = parent;
  }

  return () => {
    for (const { node, hadInert, ariaHidden } of marked) {
      if (hadInert) node.setAttribute("inert", "");
      else node.removeAttribute("inert");

      if (ariaHidden === null) node.removeAttribute("aria-hidden");
      else node.setAttribute("aria-hidden", ariaHidden);
    }
  };
}

/**
 * 处理抽屉内部的 Tab / Shift+Tab 键盘焦点循环
 */
export function handleDrawerTabKey(drawer: HTMLElement, e: KeyboardEvent): void {
  if (e.key !== "Tab") return;

  const focusables = [
    ...drawer.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ].filter((el) => el.getClientRects().length);

  const first = focusables[0] ?? drawer;
  const last = focusables[focusables.length - 1] ?? drawer;
  const idx = focusables.indexOf(document.activeElement as HTMLElement);

  if (
    (e.shiftKey && (idx <= 0 || document.activeElement === drawer)) ||
    (!e.shiftKey && (idx === focusables.length - 1 || document.activeElement === drawer))
  ) {
    e.preventDefault();
    (e.shiftKey ? last : first).focus();
  }
}

/**
 * 判定点击事件是否发生在目标元素外部（常用于下拉菜单/弹出气泡点击外部关闭）
 */
export function isClickOutsideElement(
  container: HTMLElement | null,
  target: Node | null,
): boolean {
  if (!container || !target) return false;
  return !container.contains(target);
}

export interface DrawerNavHandlers {
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  onToggleFav?: () => void;
}

/**
 * 处理详情抽屉内部的键盘导航事件（Escape 退出、方向键与 j/k 切题、e 键收藏）
 */
export function handleDrawerNavKey(e: KeyboardEvent, handlers: DrawerNavHandlers): void {
  const isInput =
    e.target instanceof HTMLInputElement ||
    e.target instanceof HTMLTextAreaElement ||
    e.target instanceof HTMLSelectElement;

  if (isInput) {
    if (e.key === "Escape") {
      e.stopPropagation();
      handlers.onClose();
    }
    return;
  }

  if (e.key === "Escape") {
    e.stopPropagation();
    handlers.onClose();
  } else if ((e.key === "ArrowUp" || e.key === "k" || e.key === "ArrowLeft") && handlers.onPrev) {
    e.preventDefault();
    handlers.onPrev();
  } else if ((e.key === "ArrowDown" || e.key === "j" || e.key === "ArrowRight") && handlers.onNext) {
    e.preventDefault();
    handlers.onNext();
  } else if (e.key.toLowerCase() === "e" && handlers.onToggleFav) {
    e.preventDefault();
    handlers.onToggleFav();
  }
}

/**
 * 处理页面全局 onKeydown 时对打开中抽屉的拦截（包含 Escape 关闭、Tab 焦点圈定与外部 Dialog 优先级判定）
 */
export function handleModalDrawerKeydown(
  e: KeyboardEvent,
  drawerEl: HTMLElement | null,
  onClose: () => void,
): boolean {
  if (!drawerEl) return false;
  // A host confirmation/input dialog takes precedence over the page peek.
  if (typeof document !== "undefined") {
    const externalDialog = [...document.querySelectorAll<HTMLElement>('[role="dialog"]')].some((el) => el !== drawerEl);
    if (externalDialog) return true;
  }

  if (e.key === "Escape") {
    e.preventDefault();
    e.stopPropagation();
    onClose();
    return true;
  }
  if (e.key === "Tab") {
    handleDrawerTabKey(drawerEl, e);
    return true;
  }
  return true;
}



