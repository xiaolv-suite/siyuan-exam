// ============================================================
// 反向链接与思源内核导航服务（backlinkNavigationService.ts）
// 承接思源块级反向链接查询、文档原生跳转与回退
// 纯逻辑解耦，不绑定 Svelte 渲染态
// ============================================================

export interface BacklinkItem {
  docId: string;
  title: string;
  content: string;
}

export interface BacklinkFetchResult {
  links?: BacklinkItem[];
  error?: string;
}

/** 查询思源块级反向链接列表 */
export async function fetchBlockBacklinks(
  app: any,
  blockId: string,
  t: (k: string) => string,
): Promise<BacklinkFetchResult> {
  if (!app?.kernelOnline) {
    return { error: t("state.offlineHint") };
  }
  try {
    const links = (await app.deps.client.backlinks(blockId)) as BacklinkItem[];
    return { links };
  } catch (e) {
    const error = t("browse.backlinksFailed").replace(
      "{message}",
      String(e instanceof Error ? e.message : e),
    );
    return { error };
  }
}

export interface OpenTargetOptions {
  position?: "right" | "bottom";
  openNewTab?: boolean;
  keepCursor?: boolean;
  event?: MouseEvent | KeyboardEvent;
}

/** 在思源中受控打开块或文档（优先使用思源原生 openTab 在工作区内打开，支持右侧分屏对照；无宿主 app 时回退 siyuan:// 深链） */
export function openSiYuanTarget(
  plugin: any,
  rootId: string,
  blockId?: string,
  showMessage?: (msg: string, time?: number, type?: string) => void,
  t?: (k: string) => string,
  options?: OpenTargetOptions,
): void {
  const targetId = blockId || rootId;
  if (!targetId) {
    if (showMessage && t) {
      showMessage(t("browse.docUnavailable"), 2600, "error");
    }
    return;
  }

  if (typeof document !== "undefined" && document.fullscreenElement) {
    try {
      void document.exitFullscreen().catch(() => {});
    } catch { /* ignore */ }
  }

  const isSplitModifier = options?.event
    ? options.event.ctrlKey || options.event.metaKey || options.event.altKey
    : false;
  const splitPosition = options?.position ?? (isSplitModifier ? "right" : undefined);

  const hostApp = plugin?.app;
  const isMobile = Boolean(
    plugin?.isMobile ||
    (typeof document !== "undefined" && document.getElementById("mobileTopBar"))
  );

  if (isMobile) {
    void (async () => {
      try {
        if (plugin?.closeMobileDialog) {
          const closed = await plugin.closeMobileDialog();
          if (closed === false) return;
        } else if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("lv-exam:close-mobile-dialog"));
        }
        const siyuanMod = await import("siyuan");
        if (typeof (siyuanMod as any).openMobileFileById === "function") {
          (siyuanMod as any).openMobileFileById(
            (hostApp ?? plugin) as import("siyuan").App,
            targetId,
            blockId ? ["cb-get-hl", "cb-get-focus", "cb-get-all"] : undefined,
          );
        } else {
          siyuanMod.openTab({
            app: (hostApp ?? plugin) as import("siyuan").App,
            doc: {
              id: targetId,
              ...(blockId ? { action: ["cb-get-hl", "cb-get-focus", "cb-get-all"] } : {}),
            },
          });
        }
      } catch (e) {
        if (showMessage) {
          showMessage(String(e instanceof Error ? e.message : e), 4200, "error");
        }
      }
    })();
    return;
  }

  if (!hostApp && blockId && typeof window !== "undefined" && !splitPosition) {
    try {
      window.open(`siyuan://blocks/${blockId}`);
      return;
    } catch {
      // 回退到 openTab
    }
  }

  void import("siyuan")
    .then(({ openTab }) => {
      openTab({
        app: (hostApp ?? plugin) as import("siyuan").App,
        doc: {
          id: targetId,
          ...(blockId ? { action: ["cb-get-hl", "cb-get-focus", "cb-get-all"] } : {}),
        },
        ...(splitPosition ? { position: splitPosition, openNewTab: true } : {}),
      });
    })
    .catch((e) => {
      if (targetId && typeof window !== "undefined") {
        try {
          window.open(`siyuan://blocks/${targetId}`);
          return;
        } catch {
          // ignore
        }
      }
      if (showMessage) {
        showMessage(String(e instanceof Error ? e.message : e), 4200, "error");
      }
    });
}

/** 在思源工作区中直接打开指定文档（如已生成的题册、错题本、成绩单、每日战报） */
export function openSiYuanDoc(
  plugin: any,
  docId: string,
  showMessage?: (msg: string, time?: number, type?: string) => void,
  t?: (k: string) => string,
): void {
  openSiYuanTarget(plugin, docId, undefined, showMessage, t);
}

/**
 * 更新反链缓存与错误字典
 */
export function applyBacklinkFetchResult(
  currentCache: Map<string, BacklinkItem[]>,
  currentError: Record<string, string>,
  blockId: string,
  res: BacklinkFetchResult,
): { nextCache: Map<string, BacklinkItem[]>; nextError: Record<string, string> } {
  if (res.links) {
    const nextCache = new Map(currentCache);
    nextCache.set(blockId, res.links);
    return { nextCache, nextError: { ...currentError, [blockId]: "" } };
  }
  return {
    nextCache: currentCache,
    nextError: { ...currentError, [blockId]: res.error || "" },
  };
}

