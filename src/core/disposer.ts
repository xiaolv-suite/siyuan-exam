// ============================================================
// DisposerRegistry: 组合式资源治理中枢（S3 切片）
// - 统一注销树与单一清理路径
// - 严格 LIFO 逆序释放，幂等注销，异常隔离
// - 支持 createChild() 级联子作用域并自动摘除引用防泄漏
// ============================================================

export interface IDisposable {
  dispose(): void | Promise<void>;
}

export type DisposableFunction = () => void | Promise<void>;
export type DisposableItem = IDisposable | DisposableFunction;

export class DisposerRegistry implements IDisposable {
  private readonly items = new Set<DisposableItem>();
  private readonly children = new Set<DisposerRegistry>();
  private _isDisposed = false;

  public get isDisposed(): boolean {
    return this._isDisposed;
  }

  public get size(): number {
    return this.items.size + this.children.size;
  }

  /**
   * 注册清理项，返回主动注销该单项的取消函数
   */
  public add(item: DisposableItem | undefined | null): () => void {
    if (!item || this._isDisposed) {
      if (item && this._isDisposed) {
        try {
          if (typeof item === "function") item();
          else item.dispose();
        } catch (e) {
          console.error("[DisposerRegistry] Late dispose failed:", e);
        }
      }
      return () => {};
    }

    this.items.add(item);
    let removed = false;
    return () => {
      if (removed) return;
      removed = true;
      this.items.delete(item);
      try {
        if (typeof item === "function") {
          item();
        } else if (item && typeof item.dispose === "function") {
          item.dispose();
        }
      } catch (e) {
        console.error("[DisposerRegistry] Single cancel error:", e);
      }
    };
  }

  /**
   * 纳管 setTimeout 句柄
   */
  public addTimeout(timerId: ReturnType<typeof setTimeout> | number | undefined | null): () => void {
    if (timerId === undefined || timerId === null) return () => {};
    const cancel = () => {
      if (typeof window !== "undefined") {
        window.clearTimeout(timerId as unknown as number);
      } else if (typeof clearTimeout !== "undefined") {
        clearTimeout(timerId as unknown as Parameters<typeof clearTimeout>[0]);
      }
    };
    return this.add(cancel);
  }

  /**
   * 纳管 setInterval 句柄
   */
  public addInterval(intervalId: ReturnType<typeof setInterval> | number | undefined | null): () => void {
    if (intervalId === undefined || intervalId === null) return () => {};
    const cancel = () => {
      if (typeof window !== "undefined") {
        window.clearInterval(intervalId as unknown as number);
      } else if (typeof clearInterval !== "undefined") {
        clearInterval(intervalId as unknown as Parameters<typeof clearInterval>[0]);
      }
    };
    return this.add(cancel);
  }

  /**
   * 纳管 DOM / EventTarget 事件监听
   */
  public addEvent(
    target: EventTarget | undefined | null,
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions,
  ): () => void {
    if (!target || typeof target.addEventListener !== "function") return () => {};
    target.addEventListener(type, listener, options);
    return this.add(() => {
      try {
        target.removeEventListener(type, listener, options);
      } catch {
        /* ignore */
      }
    });
  }

  /**
   * 创建附属于本节点的子注销器，支持作用域级联清理。
   * 当子注销器独立调用 dispose() 或 disposeAsync() 时，自动从父级注销摘除自身，杜绝引用泄漏。
   */
  public createChild(): DisposerRegistry {
    if (this._isDisposed) {
      const child = new DisposerRegistry();
      void child.disposeAsync();
      return child;
    }
    const child = new DisposerRegistry();
    this.children.add(child);

    // 关键防泄漏守卫：为子实例挂钩销毁回调，从父级 children 集合摘除自身
    const originalDispose = child.dispose.bind(child);
    const originalDisposeAsync = child.disposeAsync.bind(child);

    child.dispose = () => {
      this.children.delete(child);
      originalDispose();
    };

    child.disposeAsync = async () => {
      this.children.delete(child);
      await originalDisposeAsync();
    };

    return child;
  }

  /**
   * 异步逆序释放所有已注册资源 (LIFO)，完整等待异步清理任务（如 TabAppRegistry 卸载）完成
   */
  public async disposeAsync(): Promise<void> {
    if (this._isDisposed) return;
    this._isDisposed = true;

    // 1. 先释放所有子作用域（逆序）
    const childList = [...this.children];
    this.children.clear();
    for (let i = childList.length - 1; i >= 0; i--) {
      try {
        await childList[i].disposeAsync();
      } catch (e) {
        console.error("[DisposerRegistry] Child disposer error:", e);
      }
    }

    // 2. 逆序执行自身所有清理项 (LIFO)
    const itemList = [...this.items];
    this.items.clear();
    for (let i = itemList.length - 1; i >= 0; i--) {
      const item = itemList[i];
      try {
        if (typeof item === "function") {
          await item();
        } else if (item && typeof item.dispose === "function") {
          await item.dispose();
        }
      } catch (e) {
        console.error("[DisposerRegistry] Resource dispose error:", e);
      }
    }
  }

  /**
   * 逆序释放所有已注册资源 (LIFO) 同步执行方法
   */
  public dispose(): void {
    if (this._isDisposed) return;
    this._isDisposed = true;

    // 1. 先释放所有子作用域（逆序）
    const childList = [...this.children];
    this.children.clear();
    for (let i = childList.length - 1; i >= 0; i--) {
      try {
        childList[i].dispose();
      } catch (e) {
        console.error("[DisposerRegistry] Child disposer error:", e);
      }
    }

    // 2. 逆序执行自身所有清理项 (LIFO)
    const itemList = [...this.items];
    this.items.clear();
    for (let i = itemList.length - 1; i >= 0; i--) {
      const item = itemList[i];
      try {
        if (typeof item === "function") {
          const res = item();
          if (res && typeof (res as Promise<void>).catch === "function") {
            void (res as Promise<void>).catch((e) => console.error("[DisposerRegistry] Async error:", e));
          }
        } else if (item && typeof item.dispose === "function") {
          const res = item.dispose();
          if (res && typeof (res as Promise<void>).catch === "function") {
            void (res as Promise<void>).catch((e) => console.error("[DisposerRegistry] Async error:", e));
          }
        }
      } catch (e) {
        console.error("[DisposerRegistry] Resource dispose error:", e);
      }
    }
  }
}
