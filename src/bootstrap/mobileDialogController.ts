import { Dialog } from "siyuan";
import { mount, unmount } from "svelte";
import manifest from "../../plugin.json";
import { lvLaunchpad, lvSurfaceStack } from "@/libs/lv-notice-kit";
import { watchSiYuanTheme } from "@/libs/lv-theme";
import { isExamHistoryArmed, requestExitExamWithConfirm, disarmExamHistory } from "@/core/examHistoryGuard";
import { loadTabComponent, rememberOpenTab } from "./tabRegistrars";
import type { PluginHost } from "./pluginContext";

interface MobileDialogSession {
  id: number;
  type: string;
  mountSeq: number;
  dialog: Dialog;
  component: any;
  disposed: boolean;
  surfaceCleaner?: () => void;
  viewportCleaner?: () => void;
  themeCleaner?: () => void;
  closeListener?: () => void;
}

export class MobileDialogController {
  private activeSession: MobileDialogSession | null = null;
  private nextSessionId = 0;

  get currentTabType(): string | null {
    return this.activeSession && !this.activeSession.disposed ? this.activeSession.type : null;
  }

  get dialogInstance(): Dialog | null {
    return this.activeSession && !this.activeSession.disposed ? this.activeSession.dialog : null;
  }

  get mobileComponent(): any {
    return this.activeSession && !this.activeSession.disposed ? this.activeSession.component : null;
  }

  get mobileDialog(): Dialog | null {
    return this.dialogInstance;
  }

  constructor(private plugin: PluginHost) {}

  private disposeSession(session: MobileDialogSession | null | undefined): void {
    if (!session || session.disposed) return;
    session.disposed = true;
    if (this.activeSession === session) {
      this.activeSession = null;
    }
    if (session.closeListener) {
      try {
        session.dialog.element?.removeEventListener("lv-exam:close-mobile-dialog", session.closeListener);
      } catch {
        /* ignore */
      }
      if (typeof window !== "undefined") {
        window.removeEventListener("lv-exam:close-mobile-dialog", session.closeListener);
      }
      session.closeListener = undefined;
    }
    session.viewportCleaner?.();
    session.viewportCleaner = undefined;
    session.themeCleaner?.();
    session.themeCleaner = undefined;
    session.surfaceCleaner?.();
    session.surfaceCleaner = undefined;
    if (session.component) {
      const comp = session.component;
      session.component = null;
      try {
        unmount(comp);
      } catch (err) {
        console.error("[LvExam] failed to unmount mobile dialog component:", err);
      }
    }
  }

  /** 移动端原生设置弹窗软键盘守卫：键盘弹起时按 visualViewport 收缩容器，
   *  保证被聚焦的输入框始终落在可视区内（思源原生 Setting 弹窗不自带避让）。 */
  installSettingKeyboardViewportGuard(): void {
    if (typeof window === "undefined" || !window.visualViewport) return;
    const vv = window.visualViewport;
    let baseHeight = Math.max(window.innerHeight || 0, Math.round(vv.height || 0));
    const sync = () => {
      const dialogEl =
        document.querySelector<HTMLElement>(".b3-dialog.lv-exam-setting-dialog") ??
        document.querySelector<HTMLElement>(".lv-exam-setting-control")?.closest<HTMLElement>(".b3-dialog") ??
        null;
      if (!dialogEl?.isConnected) return;
      const currentInner = window.innerHeight || 0;
      const currentH = Math.round(vv.height || currentInner);
      if (currentH > baseHeight) baseHeight = currentH;
      const keyboardOpen = Math.max(baseHeight, currentInner) - currentH > 110;
      dialogEl.classList.toggle("lv-keyboard-open", keyboardOpen);
      if (keyboardOpen) dialogEl.style.setProperty("--lv-vv-h", `${currentH}px`);
      else dialogEl.style.removeProperty("--lv-vv-h");
    };
    vv.addEventListener("resize", sync, { passive: true });
    vv.addEventListener("scroll", sync, { passive: true });
    window.addEventListener("resize", sync, { passive: true });
    this.plugin.disposer.add(() => {
      vv.removeEventListener("resize", sync);
      vv.removeEventListener("scroll", sync);
      window.removeEventListener("resize", sync);
    });
  }

  openMobileDialog(type: string, title: string): boolean {
    const existing = this.activeSession;
    if (existing && !existing.disposed && existing.dialog?.element && document.body.contains(existing.dialog.element)) {
      if (existing.type === type) {
        rememberOpenTab(type);
        return true;
      }
      if (isExamHistoryArmed()) {
        void requestExitExamWithConfirm().then((ok) => {
          if (ok && !this.plugin.isUnloaded) {
            disarmExamHistory();
            this.switchSessionComponent(existing, type, title);
          }
        });
        return false;
      }
      this.switchSessionComponent(existing, type, title);
      return false;
    } else if (existing && !existing.disposed) {
      this.disposeSession(existing);
    }

    const sessionId = ++this.nextSessionId;
    let session!: MobileDialogSession;
    const dialog = new Dialog({
      title: title || manifest.displayName["zh-CN"] || "小驴考试",
      content: `<div class="lv-exam-mobile-dialog-host" style="width:100%;height:100%;display:flex;flex-direction:column;overflow:hidden;overscroll-behavior:contain;"></div>`,
      width: "100vw",
      height: "100dvh",
      destroyCallback: () => {
        // SiYuan Dialog.destroy() 在异步 setTimeout 中回调，必须按 session 实例隔离，
        // 严禁旧弹窗销毁回调误卸新切换出来的 MockTab/ReportTab 组件。
        this.disposeSession(session);
      },
    });

    session = {
      id: sessionId,
      type,
      mountSeq: 1,
      dialog,
      component: null,
      disposed: false,
    };
    this.activeSession = session;

    dialog.element.classList.add("lv-exam-mobile-dialog", "lv-exam-dialog-host");
    dialog.element.querySelector?.(".b3-dialog")?.classList.add("lv-exam-mobile-dialog", "lv-exam-dialog-host");
    const mobileContainer = dialog.element.querySelector?.(".b3-dialog__container");
    mobileContainer?.classList.add("lv-exam-dialog");
    session.themeCleaner = watchSiYuanTheme(dialog.element);

    const hostEl = dialog.element.querySelector(".lv-exam-mobile-dialog-host");
    if (hostEl) {
      const el = document.createElement("div");
      el.classList.add("fn__flex-1", "lv-exam-tab");
      el.style.width = "100%";
      el.style.height = "100%";
      el.style.display = "flex";
      el.style.flexDirection = "column";
      el.style.overflow = "hidden";
      hostEl.appendChild(el);

      const expectedSeq = session.mountSeq;
      void loadTabComponent(type)
        .then((ComponentClass) => {
          if (
            session.disposed ||
            this.activeSession !== session ||
            session.mountSeq !== expectedSeq ||
            !dialog.element.isConnected ||
            this.plugin.isUnloaded
          ) {
            return;
          }
          session.component = mount(ComponentClass, {
            target: el,
            props: { plugin: this.plugin, examApp: this.plugin.examApp },
          });
          if (mobileContainer && el.querySelector(".lv-mobile-close-btn")) {
            mobileContainer.classList.add("lv-has-mobile-close-btn");
          }
        })
        .catch((err) => {
          console.error(`[LvExam] failed to mount mobile dialog tab (${type}):`, err);
        });
    }

    // 交互统一：顶栏（原生头或自定义 .block__icons）下滑手势关闭 (Pull down to dismiss)
    const bindPullDownDismiss = (targetEl: HTMLElement | null, requireTopBar = false) => {
      if (!targetEl) return;
      let touchStartY = 0;
      let touchStartX = 0;
      let validStart = false;
      targetEl.addEventListener(
        "touchstart",
        (e: TouchEvent) => {
          const target = e.target as HTMLElement | null;
          const isInput = Boolean(target?.closest("input, textarea, select, [contenteditable='true']"));
          validStart = !isInput && (!requireTopBar || Boolean(target?.closest(".block__icons, .b3-dialog__header")));
          if (validStart && e.touches.length > 0) {
            touchStartY = e.touches[0].clientY;
            touchStartX = e.touches[0].clientX;
          }
        },
        { passive: true },
      );
      targetEl.addEventListener(
        "touchend",
        (e: TouchEvent) => {
          if (validStart && e.changedTouches.length > 0) {
            const deltaY = e.changedTouches[0].clientY - touchStartY;
            const deltaX = Math.abs(e.changedTouches[0].clientX - touchStartX);
            if (deltaY > 70 && deltaX < 60 && this.activeSession === session) {
              lvLaunchpad.haptic(10);
              void this.closeMobileDialog();
            }
          }
          validStart = false;
        },
        { passive: true },
      );
    };
    bindPullDownDismiss(dialog.element, true);
    session.closeListener = () => {
      if (this.activeSession === session) {
        void this.closeMobileDialog();
      }
    };
    dialog.element.addEventListener("lv-exam:close-mobile-dialog", session.closeListener);
    if (typeof window !== "undefined") {
      window.addEventListener("lv-exam:close-mobile-dialog", session.closeListener);
    }

    if (typeof window !== "undefined" && window.visualViewport) {
      const baseHeight = Math.max(window.innerHeight, window.visualViewport.height || 0);
      const syncMobileViewport = () => {
        if (session.disposed || !dialog.element.isConnected) return;
        const vv = window.visualViewport;
        if (!vv) return;
        const diff = Math.max(window.innerHeight, baseHeight) - vv.height;
        if (diff > 100) {
          dialog.element.style.setProperty("--lv-visual-viewport-h", `${vv.height}px`);
          dialog.element.style.setProperty("--lv-visual-viewport-top", `${Math.max(0, vv.offsetTop || 0)}px`);
          dialog.element.classList.add("lv-keyboard-open");
        } else {
          dialog.element.style.removeProperty("--lv-visual-viewport-h");
          dialog.element.style.removeProperty("--lv-visual-viewport-top");
          dialog.element.classList.remove("lv-keyboard-open");
        }
      };
      window.visualViewport.addEventListener("resize", syncMobileViewport, { passive: true });
      window.visualViewport.addEventListener("scroll", syncMobileViewport, { passive: true });
      session.viewportCleaner = () => {
        window.visualViewport?.removeEventListener("resize", syncMobileViewport);
        window.visualViewport?.removeEventListener("scroll", syncMobileViewport);
      };
    }

    rememberOpenTab(type);

    // 统一浮层栈 Esc 与 Android 原生返回键秒关
    session.surfaceCleaner = lvSurfaceStack.push({
      id: "lv-exam-mobile-dialog",
      type: "card",
      dismiss: () => {
        if (this.activeSession === session) {
          void this.closeMobileDialog();
        }
        return true;
      },
    });

    return false;
  }

  private switchSessionComponent(session: MobileDialogSession, type: string, title?: string): void {
    if (session.disposed || this.activeSession !== session || !session.dialog?.element?.isConnected) return;
    if (session.component) {
      const comp = session.component;
      session.component = null;
      try {
        unmount(comp);
      } catch (err) {
        console.error("[LvExam] failed to unmount previous mobile component:", err);
      }
    }

    const headerEl = session.dialog.element.querySelector<HTMLElement>(".b3-dialog__header");
    if (headerEl) {
      headerEl.textContent = title || manifest.displayName["zh-CN"] || "小驴考试";
    }

    const hostEl = session.dialog.element.querySelector<HTMLElement>(".lv-exam-mobile-dialog-host");
    if (!hostEl) return;
    hostEl.innerHTML = "";

    const el = document.createElement("div");
    el.classList.add("fn__flex-1", "lv-exam-tab");
    el.style.width = "100%";
    el.style.height = "100%";
    el.style.display = "flex";
    el.style.flexDirection = "column";
    el.style.overflow = "hidden";
    hostEl.appendChild(el);

    session.type = type;
    const expectedSeq = ++session.mountSeq;
    rememberOpenTab(type);

    const mobileContainer = session.dialog.element.querySelector<HTMLElement>(".b3-dialog__container");
    if (mobileContainer) {
      mobileContainer.classList.remove("lv-has-mobile-close-btn");
    }

    void loadTabComponent(type)
      .then((ComponentClass) => {
        if (
          session.disposed ||
          this.activeSession !== session ||
          session.mountSeq !== expectedSeq ||
          !session.dialog.element?.isConnected ||
          this.plugin.isUnloaded
        ) {
          return;
        }
        session.component = mount(ComponentClass, {
          target: el,
          props: { plugin: this.plugin, examApp: this.plugin.examApp },
        });
        if (mobileContainer && el.querySelector(".lv-mobile-close-btn")) {
          mobileContainer.classList.add("lv-has-mobile-close-btn");
        }
      })
      .catch((err) => {
        console.error(`[LvExam] failed to mount mobile dialog tab (${type}):`, err);
      });
  }

  async closeMobileDialog(): Promise<boolean> {
    const target = this.activeSession;
    if (!target || target.disposed) return true;
    if (isExamHistoryArmed()) {
      const ok = await requestExitExamWithConfirm();
      if (!ok) return false; // 用户取消退出，保持弹窗继续考试
    }
    if (target.disposed) return true;
    this.disposeSession(target);
    if (target.dialog.element instanceof HTMLElement) {
      target.dialog.element.style.pointerEvents = "none";
    }
    try {
      target.dialog.destroy();
    } catch (err) {
      console.warn("[LvExam] closeMobileDialog error:", err);
    }
    return true;
  }

  forceDestroyMobileDialog(): void {
    disarmExamHistory();
    const target = this.activeSession;
    if (target) {
      this.disposeSession(target);
      try {
        target.dialog.destroy();
      } catch (err) {
        console.warn("[LvExam] forceDestroyMobileDialog error:", err);
      }
    }
  }

  cleanupMobileDialog(): void {
    this.disposeSession(this.activeSession);
  }
}
