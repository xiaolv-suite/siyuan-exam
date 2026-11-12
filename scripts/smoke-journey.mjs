// ============================================================
// 真内核完整备考旅程入口脚本（docs/25 P0-02）
// 用法：SIYUAN_TOKEN=... SIYUAN_BASE_URL=http://127.0.0.1:6827 node scripts/smoke-journey.mjs [baseUrl] [token]
// ============================================================
import { resolve } from "node:path";
import { createServer } from "vite";
import { resolveTarget, makeApi, sweepOrphans, guardScratch } from "./lib/smoke-kernel.mjs";

const { base, token } = resolveTarget({ baseArg: process.argv[2], tokenArg: process.argv[3] });
const api = makeApi(base, token);

try {
  await api("/api/system/version", {});
} catch (e) {
  console.log(`SKIP  完整旅程冒烟需要运行中的思源内核（${base}）：${String(e).slice(0, 80)}`);
  process.exit(0);
}

await sweepOrphans(api);
await guardScratch(api, { base });

const vite = await createServer({
  configFile: false,
  logLevel: "error",
  appType: "custom",
  optimizeDeps: { noDiscovery: true, include: [] },
  resolve: {
    alias: {
      "@": resolve(import.meta.dirname, "../src"),
    },
  },
  server: { middlewareMode: true, hmr: false },
});

async function run() {
  try {
    const { runLiveJourney } = await vite.ssrLoadModule("./scripts/lib/journey-runner.ts");
    return await runLiveJourney({ base, token });
  } finally {
    await vite.close();
  }
}

process.exit(await run());
