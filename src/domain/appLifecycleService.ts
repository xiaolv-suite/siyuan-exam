import type { AppHost } from "./appContext";
import { KernelError } from "../kernel/client";
import { safePerfMark, safePerfMeasure } from "../core/perf";
import { emitExamEvent } from "../core/bus";
import {
  BANK_REGISTRY_KEY,
  MATERIALS_KEY,
  MATERIAL_NOTES_KEY,
  MATERIAL_QREFS_KEY,
  MISDIAGNOSIS_KEY,
  SYLLABUS_KEY,
  KP_RELATIONS_KEY,
  WRONG_REASON_KEY,
} from "../constants";
import { parseRegistry } from "../core/materials";
import { parseNoteStore } from "../core/materialNotes";
import { parseLinkStore } from "../core/materialLinks";
import { parseMisdiagnosis } from "../core/misdiagnosis";
import { parseSyllabusDoc } from "../core/syllabus";
import { parseRelations } from "../core/kpRelations";
import type { BankInfo } from "./bankService";

export class AppLifecycleService {
  deviceId?: string;
  kernelOnline = false;
  probeMessage = "";
  lastKernelError: KernelError | null = null;
  tier2Ready = false;
  tier2LoadingPromise?: Promise<void>;
  tier2ScheduledTimer?: ReturnType<typeof setTimeout>;
  tier2IdleId?: number;
  tier2LoadGeneration = 0;

  kernelRecoveryHint(): string {
    switch (this.lastKernelError?.category) {
      case "auth": return "思源当前会话未授权，请先在思源中完成登录/解锁后重试。";
      case "permission": return "当前思源会话没有执行此操作的权限，请切换到有权限的工作区或检查只读状态。";
      case "not-found": return "思源未找到目标接口或数据，可能是版本不兼容；请重载插件后重试。";
      case "validation": return "提交的数据不符合思源接口要求，请检查输入后重试。";
      case "network": return "思源内核暂时不可达，请确认思源仍在运行后重试。";
      default: return "思源内核暂时不可用，请重试；若持续失败请重载插件。";
    }
  }
  private offlineProbeTimer: ReturnType<typeof setInterval> | null = null;
  private offlineProbeInFlight = false;
  private deferredProbePending = false;

  constructor(private app: AppHost) {}

  setKernelOnline(ok: boolean): void {
    if (this.kernelOnline === ok) return;
    this.kernelOnline = ok;
    if (ok) {
      this.lastKernelError = null;
      this.stopOfflineReprobe();
    } else {
      this.startOfflineReprobe();
    }
    emitExamEvent("kernel-connection", { online: ok });
  }

  setKernelError(error: KernelError): void {
    this.lastKernelError = error;
    // Fatal endpoint responses (auth/permission/validation/not-found) prove
    // the host is reachable; only retryable transport failures are offline.
    if (error.kind !== "fatal") this.setKernelOnline(false);
    emitExamEvent("kernel-connection", {
      online: this.kernelOnline,
      category: error.category,
      code: error.code,
      message: error.message,
    });
  }

  startOfflineReprobe(): void {
    if (this.offlineProbeTimer) return;
    this.offlineProbeTimer = setInterval(() => {
      if (this.app.isUnloaded || this.kernelOnline || this.offlineProbeInFlight) return;
      if (typeof document !== "undefined" && document.hidden) return;
      this.offlineProbeInFlight = true;
      void this.app.bridge.probe({ light: true }).then((probe: any) => {
        if (probe?.kernelOk) {
          this.setKernelOnline(true);
          this.app.invalidate?.();
        }
      }).catch(() => undefined).finally(() => {
        this.offlineProbeInFlight = false;
      });
    }, 60_000);
  }

  stopOfflineReprobe(): void {
    if (this.offlineProbeTimer) {
      clearInterval(this.offlineProbeTimer);
      this.offlineProbeTimer = null;
    }
    this.offlineProbeInFlight = false;
  }

  async init(deviceId?: string, options?: { deferTier2?: boolean }): Promise<void> {
    this.deviceId = deviceId;
    const isDeferred = Boolean(options?.deferTier2);
    try {
      const probe = await this.app.bridge.probe(isDeferred ? { light: true } : undefined);
      this.kernelOnline = probe.kernelOk;
      this.deferredProbePending = isDeferred && probe.kernelOk;
      this.lastKernelError = probe.kernelOk ? null : new KernelError("retryable", "probe", "内核不可达");
      this.probeMessage = probe.kernelOk
        ? (isDeferred
            ? `内核 ${probe.version} · 按需探测`
            : `内核 ${probe.version} · md2html ${probe.md2html ? "✓" : "✗"} · SQL ${probe.query ? "✓" : "✗"} · riff ${probe.riff ? "✓" : "✗"}`)
        : "内核不可达：将显示离线降级界面";
    } catch (e) {
      this.kernelOnline = false;
      this.deferredProbePending = false;
      this.lastKernelError = new KernelError("retryable", "probe", String(e));
      this.probeMessage = "内核不可达：离线降级";
    }
    if (!this.kernelOnline) this.startOfflineReprobe();

    if (options?.deferTier2) {
      this.tier2Ready = false;
      return;
    }
    await this.ensureTier2Loaded();
  }

  scheduleTier2Load(): void {
    if (this.tier2Ready || this.tier2LoadingPromise || this.app.isUnloaded) return;
    this.cancelTier2Schedule();
    const trigger = () => {
      this.tier2ScheduledTimer = undefined;
      this.tier2IdleId = undefined;
      if (this.app.isUnloaded || this.tier2Ready) return;
      if (typeof document !== "undefined" && document.hidden) {
        this.scheduleTier2Load();
        return;
      }
      void this.ensureTier2Loaded().catch((err) => {
        console.warn(`[LvExam] Background Tier 2 load failed: ${err instanceof Error ? err.message : String(err)}`);
      });
    };

    this.tier2ScheduledTimer = setTimeout(() => {
      this.tier2ScheduledTimer = undefined;
      if (this.app.isUnloaded || this.tier2Ready) return;
      if (typeof document !== "undefined" && document.hidden) {
        this.scheduleTier2Load();
        return;
      }
      if (typeof window !== "undefined" && typeof (window as any).requestIdleCallback === "function") {
        try {
          this.tier2IdleId = (window as any).requestIdleCallback(() => trigger(), { timeout: 5000 });
          return;
        } catch { /* ignore */ }
      }
      this.tier2ScheduledTimer = setTimeout(trigger, 200);
    }, 15_000);
  }

  cancelTier2Schedule(): void {
    if (this.tier2ScheduledTimer) {
      clearTimeout(this.tier2ScheduledTimer);
      this.tier2ScheduledTimer = undefined;
    }
    if (this.tier2IdleId !== undefined) {
      if (typeof window !== "undefined" && typeof (window as any).cancelIdleCallback === "function") {
        try {
          (window as any).cancelIdleCallback(this.tier2IdleId);
        } catch { /* ignore */ }
      }
      this.tier2IdleId = undefined;
    }
  }

  ensureTier2Loaded(): Promise<void> {
    if (this.tier2Ready) return Promise.resolve();
    if (this.tier2LoadingPromise) return this.tier2LoadingPromise;
    this.cancelTier2Schedule();
    let flight: Promise<void> | undefined;
    flight = (async () => {
      try {
        await this.loadTier2Storage();
      } finally {
        if (flight && this.tier2LoadingPromise === flight) {
          this.tier2LoadingPromise = undefined;
        }
      }
    })();
    this.tier2LoadingPromise = flight;
    return flight;
  }

  async loadTier2Storage(): Promise<void> {
    if (this.app.isUnloaded) return;
    const currentGen = ++this.tier2LoadGeneration;
    safePerfMark("siyuan-exam-tier2-start");
    try {
      const deviceId = this.deviceId;
      const readErrors: Array<{ key: string; error: unknown }> = [];

      await Promise.allSettled([
        (async () => {
          try {
            await this.app.attempts.load(deviceId);
            this.app.storageReadErrors.delete("attempts/log");
          } catch (e) {
            this.app.noteStorageReadError("attempts/log", e);
            readErrors.push({ key: "attempts/log", error: e });
          }
        })(),
        (async () => {
          try {
            await this.app.wrongbook.loadWrongOverlay();
            this.app.storageReadErrors.delete("wrongbook/overlays");
          } catch (e) {
            this.app.noteStorageReadError("wrongbook/overlays", e);
            readErrors.push({ key: "wrongbook/overlays", error: e });
          }
        })(),
        (async () => {
          try {
            await this.app.wrongbook.loadWrongReasons();
            this.app.storageReadErrors.delete(WRONG_REASON_KEY);
          } catch (e) {
            this.app.noteStorageReadError(WRONG_REASON_KEY, e);
            readErrors.push({ key: WRONG_REASON_KEY, error: e });
          }
        })(),
        (async () => {
          try {
            await this.app.wrongbook.loadWrongReflections();
            this.app.storageReadErrors.delete("wrongbook/reflections");
          } catch (e) {
            this.app.noteStorageReadError("wrongbook/reflections", e);
            readErrors.push({ key: "wrongbook/reflections", error: e });
          }
        })(),
        (async () => {
          try {
            await this.app.wrongbook.loadDiagnosisDoc();
            this.app.storageReadErrors.delete("wrongbook/diagnosis");
          } catch (e) {
            this.app.noteStorageReadError("wrongbook/diagnosis", e);
            readErrors.push({ key: "wrongbook/diagnosis", error: e });
          }
        })(),
        (async () => {
          try {
            const banks = await this.app.storageGateway.load<BankInfo[]>(BANK_REGISTRY_KEY);
            if (Array.isArray(banks)) this.app.banks = banks;
          } catch (e) {
            readErrors.push({ key: BANK_REGISTRY_KEY, error: e });
          }
        })(),
        (async () => {
          try {
            const parsed = parseRegistry(await this.app.storageGateway.load<string>(MATERIALS_KEY));
            this.app.materialsRegistry = parsed.registry;
            this.app.materialsVersionTooNew = parsed.versionTooNew;
          } catch {
            /* 错误已在 storageGateway 内记录 */
          }
        })(),
        (async () => {
          try {
            const parsedNotes = parseNoteStore(await this.app.storageGateway.load<string>(MATERIAL_NOTES_KEY));
            this.app.materialNoteStore = parsedNotes.store;
          } catch {
            /* 错误已在 storageGateway 内记录 */
          }
        })(),
        (async () => {
          try {
            const parsedLinks = parseLinkStore(await this.app.storageGateway.load<string>(MATERIAL_QREFS_KEY));
            this.app.materialLinkStore = parsedLinks.store;
          } catch {
            /* 错误已在 storageGateway 内记录 */
          }
        })(),
        (async () => {
          try {
            const parsedMis = parseMisdiagnosis(await this.app.storageGateway.load<string>(MISDIAGNOSIS_KEY));
            this.app.misdiagnosisStore = parsedMis.store;
          } catch {
            /* 错误已在 storageGateway 内记录 */
          }
        })(),
        (async () => {
          try {
            const parsedSyl = parseSyllabusDoc(await this.app.storageGateway.load<string>(SYLLABUS_KEY));
            this.app.syllabus = parsedSyl.doc;
            this.app.syllabusTooNew = parsedSyl.versionTooNew;
          } catch {
            /* 错误已在 storageGateway 内记录 */
          }
        })(),
        (async () => {
          try {
            const parsedKpRel = parseRelations(await this.app.storageGateway.load<string>(KP_RELATIONS_KEY));
            this.app.kpRelations = parsedKpRel.doc;
            this.app.kpRelationsTooNew = parsedKpRel.versionTooNew;
          } catch {
            /* 错误已在 storageGateway 内记录 */
          }
        })(),
      ]);

      if (this.app.isUnloading || this.app.isUnloaded || currentGen !== this.tier2LoadGeneration) {
        return;
      }

      if (readErrors.length > 0) {
        this.tier2Ready = false;
        const first = readErrors[0];
        throw first.error instanceof Error ? first.error : new Error(`Failed to load Tier 2 slot: ${first.key}`);
      }

      if (this.kernelOnline && this.app.banks.length > 0 && typeof this.app.bridge.listAllNotebooks === "function") {
        try {
          const allNotebooks = await this.app.bridge.listAllNotebooks();
          if (Array.isArray(allNotebooks) && allNotebooks.length > 0) {
            const nbMap = new Map(allNotebooks.map((n: { id: string; closed?: boolean }) => [n.id, n]));
            const aliveBanks = this.app.banks.filter((b) => nbMap.has(b.notebookId || b.id));
            if (aliveBanks.length !== this.app.banks.length) {
              this.app.banks = aliveBanks;
              void this.app.bankService.saveBankRegistry().catch(() => undefined);
            }
          }
        } catch {
          /* 忽略 */
        }
      }

      this.tier2Ready = true;
      if (this.deferredProbePending && this.kernelOnline && typeof this.app.bridge?.probe === "function") {
        this.deferredProbePending = false;
        void this.app.bridge.probe().then((probe) => {
          if (this.app.isUnloaded || !probe?.kernelOk) return;
          this.probeMessage = `内核 ${probe.version} · md2html ${probe.md2html ? "✓" : "✗"} · SQL ${probe.query ? "✓" : "✗"} · riff ${probe.riff ? "✓" : "✗"}`;
        }).catch(() => undefined);
      }
      safePerfMark("siyuan-exam-tier2-end");
      safePerfMeasure("siyuan-exam-tier2-load", "siyuan-exam-tier2-start", "siyuan-exam-tier2-end");
      this.app.invalidate();
    } catch (err) {
      if (this.tier2LoadGeneration === currentGen && !this.app.isUnloaded) {
        this.tier2Ready = false;
      }
      throw err;
    }
  }
}
