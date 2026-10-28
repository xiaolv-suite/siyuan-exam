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

/** 在思源中受控打开块或文档 */
export function openSiYuanTarget(
  plugin: any,
  rootId: string,
  blockId?: string,
  showMessage?: (msg: string, time?: number, type?: string) => void,
  t?: (k: string) => string,
): void {
  if (!rootId && !blockId) {
    if (showMessage && t) {
      showMessage(t("browse.docUnavailable"), 2600, "error");
    }
    return;
  }

  if (blockId) {
    try {
      if (typeof window !== "undefined") {
        window.open(`siyuan://blocks/${blockId}`);
        return;
      }
    } catch {
      // 容错回退到 openTab
    }
  }

  void import("siyuan")
    .then(({ openTab }) => {
      openTab({
        app: (plugin?.app ?? plugin) as import("siyuan").App,
        doc: { id: rootId },
      });
    })
    .catch((e) => {
      if (showMessage) {
        showMessage(String(e instanceof Error ? e.message : e), 4200, "error");
      }
    });
}
