/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-03-23 21:37:33
 * @FilePath     : /src/libs/dialog.ts
 * @LastEditTime : 2025-08-16 15:39:48
 * @Description  : Kits about dialogs
 */
import { Dialog } from "siyuan";
import { Component, mount, unmount } from "svelte";
import { escapeHtml, sanitizeRichHtml } from "./sanitize";
import { lvSurfaceStack } from "./lv-notice-kit";

export const inputDialog = (args: {
  title: string;
  placeholder?: string;
  defaultText?: string;
  confirm?: (text: string) => void;
  cancel?: () => void;
  width?: string;
  height?: string;
}) => {
  const dialog = new Dialog({
    title: args.title,
    content: `<div class="b3-dialog__content" role="region" aria-label="${escapeHtml(args.title)}">
    <div class="ft__breakword"><textarea class="b3-text-field fn__block" style="height: 100%;" placeholder="${escapeHtml(args?.placeholder ?? "")}" aria-label="${escapeHtml(args.title)}">${escapeHtml(args?.defaultText ?? "")}</textarea></div>
</div>
<div class="b3-dialog__action">
    <button type="button" class="b3-button b3-button--cancel">${window.siyuan.languages.cancel}</button><div class="fn__space"></div>
    <button type="button" class="b3-button b3-button--text" id="confirmDialogConfirmBtn">${window.siyuan.languages.confirm}</button>
</div>`,
    width: args.width ?? "520px",
    height: args.height,
  });
  dialog.element.addEventListener("click", (e) => {
    if (e.target === dialog.element || (e.target as HTMLElement).classList?.contains("b3-dialog__scrim")) {
      dialog.destroy();
    }
  });
  const target: HTMLTextAreaElement = dialog.element.querySelector(".b3-dialog__content>div.ft__breakword>textarea");
  const btnsElement = dialog.element.querySelectorAll(".b3-button");
  btnsElement[0].addEventListener("click", () => {
    if (args?.cancel) {
      args.cancel();
    }
    dialog.destroy();
  });
  btnsElement[1].addEventListener("click", () => {
    if (args?.confirm) {
      args.confirm(target.value);
    }
    dialog.destroy();
  });
};

export const inputDialogSync = async (args: {
  title: string;
  placeholder?: string;
  defaultText?: string;
  width?: string;
  height?: string;
}) => {
  return new Promise<string>((resolve) => {
    const newargs = {
      ...args,
      confirm: (text) => {
        resolve(text);
      },
      cancel: () => {
        resolve(null);
      },
    };
    inputDialog(newargs);
  });
};

interface IConfirmDialogArgs {
  title: string;
  content: string | HTMLElement;
  confirm?: (ele?: HTMLElement) => void;
  cancel?: (ele?: HTMLElement) => void;
  width?: string;
  height?: string;
}

export const confirmDialog = (args: IConfirmDialogArgs & { destroyCallback?: () => void }) => {
  const { title, content, confirm, cancel, width, height, destroyCallback } = args;

  const dialog = new Dialog({
    title,
    content: `<div class="b3-dialog__content" role="region" aria-label="${escapeHtml(title)}">
    <div class="ft__breakword" style="white-space:pre-wrap;line-height:1.6">
    </div>
</div>
<div class="b3-dialog__action">
    <button type="button" class="b3-button b3-button--cancel">${window.siyuan.languages.cancel}</button><div class="fn__space"></div>
    <button type="button" class="b3-button b3-button--text" id="confirmDialogConfirmBtn">${window.siyuan.languages.confirm}</button>
</div>`,
    width: width,
    height: height,
    destroyCallback: () => {
      if (destroyCallback) destroyCallback();
      else if (cancel) cancel(target);
    },
  });
  dialog.element.addEventListener("click", (e) => {
    if (e.target === dialog.element || (e.target as HTMLElement).classList?.contains("b3-dialog__scrim")) {
      dialog.destroy();
    }
  });

  const target: HTMLElement = dialog.element.querySelector(".b3-dialog__content>div.ft__breakword");
  if (typeof content === "string") {
    // Dialog content can include intentional formatting such as <br>, but it
    // must still pass the same allowlist as rendered question/AI HTML.
    target.innerHTML = sanitizeRichHtml(content);
  } else {
    target.appendChild(content);
  }

  const btnsElement = dialog.element.querySelectorAll(".b3-button");
  btnsElement[0].addEventListener("click", () => {
    if (cancel) {
      cancel(target);
    }
    dialog.destroy();
  });
  btnsElement[1].addEventListener("click", () => {
    if (confirm) {
      confirm(target);
    }
    dialog.destroy();
  });
};

export const confirmDialogSync = async (args: IConfirmDialogArgs) => {
  // 返回布尔：confirm=true / cancel=false（原实现两路都 resolve 元素，调用方无法区分）
  return new Promise<boolean>((resolve) => {
    let settled = false;
    const newargs = {
      ...args,
      confirm: () => {
        if (!settled) {
          settled = true;
          resolve(true);
        }
      },
      cancel: () => {
        if (!settled) {
          settled = true;
          resolve(false);
        }
      },
      destroyCallback: () => {
        if (!settled) {
          settled = true;
          resolve(false);
        }
      },
    };
    confirmDialog(newargs);
  });
};

export const simpleDialog = (args: {
  title: string;
  ele: HTMLElement | DocumentFragment;
  width?: string;
  height?: string;
  callback?: () => void;
}) => {
  let closed = false;
  const surfaceId = `dialog_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const popSurface = lvSurfaceStack.push({
    id: surfaceId,
    type: "dialog",
    dismiss: () => {
      if (closed) return false;
      closed = true;
      dialog.destroy();
      return true;
    },
  });

  const dialog = new Dialog({
    title: args.title,
    content: `<div class="dialog-content" style="display: flex; flex-direction: column; align-items: stretch; width: 100%; height: 100%; min-width: 0; min-height: 0; box-sizing: border-box;"/>`,
    width: args.width,
    height: args.height,
    destroyCallback: () => {
      if (!closed) {
        closed = true;
        popSurface();
      }
      args.callback?.();
    },
  });
  dialog.element.addEventListener("click", (e) => {
    if (e.target === dialog.element || (e.target as HTMLElement).classList?.contains("b3-dialog__scrim")) {
      if (!closed) {
        closed = true;
        popSurface();
        dialog.destroy();
      }
    }
  });
  dialog.element.querySelector(".dialog-content").appendChild(args.ele);
  try {
    const outerClose = dialog.element.querySelector<HTMLElement | SVGElement>(".b3-dialog__container > .b3-dialog__close");
    if (outerClose && outerClose.style) {
      outerClose.style.setProperty("display", "none", "important");
    }
    const header = dialog.element.querySelector<HTMLElement>(".b3-dialog__header");
    if (header && !header.querySelector(".b3-dialog__close")) {
      const closeBtn = document.createElement("button");
      closeBtn.type = "button";
      closeBtn.className = "b3-dialog__close lv-exam-dialog-close";
      closeBtn.setAttribute("aria-label", window.siyuan?.languages?.close ?? "关闭");
      closeBtn.textContent = "✕";
      closeBtn.style.cssText = "display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;margin-left:auto;border:none;background:transparent;color:var(--b3-theme-on-surface);cursor:pointer;border-radius:6px;";
      closeBtn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        if (!closed) {
          closed = true;
          popSurface();
          dialog.destroy();
        }
      });
      header.appendChild(closeBtn);
    }
  } catch { /* soft */ }
  return {
    dialog,
    close: () => {
      if (!closed) {
        closed = true;
        popSurface();
        dialog.destroy();
      }
    },
  };
};

export const svelteDialog = (args: {
  title: string;
  component: Component<any>; // Svelte 5 component constructor
  props?: Record<string, any>;
  width?: string;
  height?: string;
  callback?: () => void;
}) => {
  const container = document.createElement("div");
  container.style.display = "contents";

  // 内部处理 mount
  const componentInstance = mount(args.component, {
    target: container,
    props: args.props || {},
  });

  const { dialog, close } = simpleDialog({
    ...args,
    ele: container,
    callback: () => {
      // 内部处理 unmount
      unmount(componentInstance);
      if (args.callback) args.callback();
    },
  });

  return {
    component: componentInstance,
    dialog,
    close,
  };
};
