import type { PluginHost } from "./pluginContext";

export function scheduleTier2Load(plugin: PluginHost): void {
  if (plugin.tier2Ready || plugin.tier2LoadingPromise || plugin.isUnloaded) return;
  cancelTier2Schedule(plugin);
  const trigger = () => {
    plugin.tier2ScheduledTimer = undefined;
    plugin.tier2IdleId = undefined;
    if (plugin.isUnloaded || plugin.tier2Ready) return;
    if (typeof document !== "undefined" && document.hidden) {
      scheduleTier2Load(plugin);
      return;
    }
    void ensureTier2Loaded(plugin).catch((err) => {
      console.warn(`[LvExam] Background Tier 2 load failed: ${err instanceof Error ? err.message : String(err)}`);
    });
  };

  plugin.tier2ScheduledTimer = setTimeout(() => {
    plugin.tier2ScheduledTimer = undefined;
    if (plugin.isUnloaded || plugin.tier2Ready) return;
    if (typeof document !== "undefined" && document.hidden) {
      scheduleTier2Load(plugin);
      return;
    }
    if (typeof window !== "undefined" && typeof (window as any).requestIdleCallback === "function") {
      try {
        plugin.tier2IdleId = (window as any).requestIdleCallback(() => trigger(), { timeout: 5000 });
        return;
      } catch { /* ignore and fallback */ }
    }
    plugin.tier2ScheduledTimer = setTimeout(trigger, 200);
  }, 15_000);
}

export function cancelTier2Schedule(plugin: PluginHost): void {
  if (plugin.tier2ScheduledTimer) {
    clearTimeout(plugin.tier2ScheduledTimer);
    plugin.tier2ScheduledTimer = undefined;
  }
  if (plugin.tier2IdleId !== undefined) {
    if (typeof window !== "undefined" && typeof (window as any).cancelIdleCallback === "function") {
      try {
        (window as any).cancelIdleCallback(plugin.tier2IdleId);
      } catch { /* ignore */ }
    }
    plugin.tier2IdleId = undefined;
  }
  if (typeof plugin.examApp?.cancelTier2Schedule === "function") {
    plugin.examApp.cancelTier2Schedule();
  }
}

export function ensureTier2Loaded(plugin: PluginHost): Promise<void> {
  if (plugin.isUnloaded) return Promise.resolve();
  if (plugin.tier2Ready) return Promise.resolve();
  if (plugin.tier2LoadingPromise) return plugin.tier2LoadingPromise;
  cancelTier2Schedule(plugin);
  let flight: Promise<void> | undefined;
  flight = (async () => {
    try {
      if (!plugin.examApp && !plugin.isUnloaded) {
        await plugin.onLayoutReady();
      }
      if (typeof plugin.examApp?.ensureTier2Loaded === "function") {
        await plugin.examApp.ensureTier2Loaded();
      }
      if (plugin.isUnloaded) return;
      plugin.tier2Ready = plugin.examApp?.tier2Ready ?? true;
    } catch (err) {
      plugin.tier2Ready = false;
      throw err;
    } finally {
      if (flight && plugin.tier2LoadingPromise === flight) {
        plugin.tier2LoadingPromise = undefined;
      }
    }
  })();
  plugin.tier2LoadingPromise = flight;
  return flight;
}
