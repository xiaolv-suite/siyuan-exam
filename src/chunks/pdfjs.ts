import * as pdfjsWorker from "pdfjs-dist/legacy/build/pdf.worker.mjs";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";

declare global {
  interface Window {
    __lvChunks?: Record<string, any>;
  }
}

if (typeof globalThis !== "undefined") {
  (globalThis as Record<string, unknown>).pdfjsWorker = pdfjsWorker;
}

if (typeof window !== "undefined") {
  window.__lvChunks = window.__lvChunks || {};
  window.__lvChunks["pdfjs"] = pdfjsLib;
}

export default pdfjsLib;
