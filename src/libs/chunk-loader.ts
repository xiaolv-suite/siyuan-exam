/**
 * 根绝对路径独立 IIFE chunk 加载器（S7 切片架构分包）
 * 映射: /plugins/siyuan-exam/chunks/[name].js
 */
const BASE = "/plugins/siyuan-exam";

export type ChunkName = "sheetjs" | "pdfjs";

declare global {
  interface Window {
    __lvChunks?: Record<string, any>;
  }
}

const pending: Partial<Record<ChunkName, Promise<any>>> = {};

export function invalidateChunk(name: ChunkName): void {
  delete pending[name];
  if (typeof document !== "undefined" && typeof document.getElementById === "function") {
    document.getElementById(`lv-chunk-js-${name}`)?.remove();
  }
  if (typeof window !== "undefined" && window.__lvChunks) {
    delete window.__lvChunks[name];
  }
}

function injectScript(name: ChunkName, version: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof document === "undefined" || typeof document.getElementById !== "function" || !document.head) {
      return resolve();
    }
    const id = `lv-chunk-js-${name}`;
    const src = `${BASE}/chunks/${name}.js?v=${version}`;
    const existing = document.getElementById(id) as HTMLScriptElement | null;
    if (existing) {
      const currentSrc = existing.getAttribute("src");
      if (!currentSrc || new URL(currentSrc, document.baseURI).href === new URL(src, document.baseURI).href) {
        return resolve();
      }
      existing.remove();
      if (typeof window !== "undefined" && window.__lvChunks) {
        delete window.__lvChunks[name];
      }
    }
    const s = document.createElement("script");
    s.id = id;
    s.src = src;
    s.async = false;
    const timer = setTimeout(() => {
      s.remove();
      invalidateChunk(name);
      reject(new Error(`lv chunk load timeout: ${name}`));
    }, 15000);
    s.onload = () => {
      clearTimeout(timer);
      resolve();
    };
    s.onerror = () => {
      clearTimeout(timer);
      s.remove();
      invalidateChunk(name);
      reject(new Error(`lv chunk load failed: ${name}`));
    };
    document.head.appendChild(s);
  });
}

/**
 * 动态加载独立 IIFE chunk
 */
export async function loadChunk<T = any>(name: ChunkName): Promise<T> {
  if (typeof window !== "undefined" && window.__lvChunks?.[name]) {
    return window.__lvChunks[name] as T;
  }
  if (typeof document === "undefined" || typeof document.getElementById !== "function" || !document.head) {
    if (name === "sheetjs") {
      const mod = await import("xlsx");
      return (mod.default || mod) as unknown as T;
    }
    if (name === "pdfjs") {
      const worker = await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
      (globalThis as Record<string, unknown>).pdfjsWorker = worker;
      const mod = await import("pdfjs-dist/legacy/build/pdf.mjs");
      return mod as unknown as T;
    }
    throw new Error(`unsupported chunk in headless environment: ${name}`);
  }
  return (pending[name] ??= (async () => {
    const version = "0.15.8";
    await injectScript(name, version);
    const reg = typeof window !== "undefined" ? window.__lvChunks : undefined;
    const mod = reg?.[name];
    if (!mod) {
      invalidateChunk(name);
      throw new Error(`lv chunk missing export: ${name}`);
    }
    return mod as T;
  })().catch((e) => {
    delete pending[name];
    throw e;
  }));
}
