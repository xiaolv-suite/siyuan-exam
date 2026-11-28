import * as XLSX from "xlsx";

declare global {
  interface Window {
    __lvChunks?: Record<string, any>;
  }
}

if (typeof window !== "undefined") {
  window.__lvChunks = window.__lvChunks || {};
  window.__lvChunks["sheetjs"] = XLSX;
}

export default XLSX;
