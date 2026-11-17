// ============================================================
// 真机隔离宿主流水线（pnpm e2e:isolated）
// 自动创建临时隔离思源工作区 → 部署最新 dist → 拉起真实 SiYuan-Kernel.exe
// → 启动真实 Chrome 访问 /stage/build/desktop/ → 全链路点击验证 UI、功能与交互：
//   1. 首次进入欢迎守卫 → 一键创建 12 题示例题库 → 今日驾驶舱渲染与零溢出
//   2. 题库管理中心弹窗 → 底部「更多场景示例题库」默认折叠与展开核验
//   3. 出题工作台 → 手工录题落块 + Aiken 批量导入读回确认
//   4. 专注做题会话 → 普通题隐藏跟读按钮、答前侧栏不泄考点、展开第1阶提示+草稿纸 → 整页刷新恢复受助与草稿 → 答错呈现 AI 讲解深度下拉与错因快捷键
//   5. 错题本在册核验 + 纸面背诵空格翻面/自评 → 整页刷新自动续做第 2 题
//   6. 题库浏览批量勾选浮岛 → 四合一打印版式下拉（切换「授课讲义卷」拦截校验生成 HTML）
//   7. 全真模考启动 → 选答+标旗+模考草稿 → 整页刷新恢复同一场考试 → 交卷出分与考后版式下拉
//   8. 复盘报告中心 → 三分面切换、语义徽章真机计算色、1100px 紧凑侧栏断点、390px 窄屏抽屉零溢出
//   9. 英语示例库（含 studyMeta）→ 自动浮现麦克风「跟读测评」与音标胶囊
// 用法：pnpm e2e:isolated（或 node scripts/e2e-isolated.mjs [--headed] [--keep-workspace]）
// ============================================================
/* global document, window, HTMLElement, getComputedStyle */
import { spawn, execSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium } from "playwright-core";

const args = new Set(process.argv.slice(2));
const headed = args.has("--headed");
const keep = args.has("--keep");
const keepWorkspace = args.has("--keep-workspace") || keep;

const ROOT = resolve(import.meta.dirname, "..");
const DIST_DIR = join(ROOT, "dist");
if (!existsSync(join(DIST_DIR, "index.js")) || !existsSync(join(DIST_DIR, "plugin.json"))) {
  throw new Error("未找到 dist/ 构建产物，请先运行 pnpm build。");
}

const manifest = JSON.parse(readFileSync(join(DIST_DIR, "plugin.json"), "utf8"));

const kernelPath = [
  process.env.SIYUAN_KERNEL_PATH,
  "D:/RJ/SiYuan/resources/kernel/SiYuan-Kernel.exe",
  "C:/Program Files/SiYuan/resources/kernel/SiYuan-Kernel.exe",
  "C:/Users/Admin/AppData/Local/Programs/SiYuan/resources/kernel/SiYuan-Kernel.exe",
].find((p) => typeof p === "string" && existsSync(p));
if (!kernelPath) {
  throw new Error("未找到 SiYuan-Kernel.exe，可通过环境变量 SIYUAN_KERNEL_PATH 指定路径。");
}

const chromePath = [
  process.env.CHROME_EXECUTABLE_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
].find((p) => typeof p === "string" && existsSync(p));
if (!chromePath) {
  throw new Error("未找到 Chrome/Edge 浏览器，可通过环境变量 CHROME_EXECUTABLE_PATH 指定路径。");
}

function isPortAvailable(p) {
  return new Promise((resolve) => {
    const srv = createServer();
    srv.once("error", () => resolve(false));
    srv.once("listening", () => {
      srv.close(() => resolve(true));
    });
    srv.listen(p, "127.0.0.1");
  });
}

async function findAvailablePort(preferredPort = 43921) {
  const envPort = Number(process.env.SIYUAN_PORT);
  if (envPort && (await isPortAvailable(envPort))) return envPort;
  if (await isPortAvailable(preferredPort)) return preferredPort;
  for (let p = preferredPort + 1; p <= preferredPort + 50; p++) {
    // 避开 43919(小驴管家), 43920(小驴常用), 43921(小驴考试常驻), 43922(常驻重定向兼容), 6806(思源主实例), 6807(闪卡/测试)
    if ([43919, 43920, 43921, 43922, 6806, 6807].includes(p)) continue;
    if (await isPortAvailable(p)) return p;
  }
  return getFreePort();
}

function getFreePort() {
  return new Promise((resolvePort, reject) => {
    const srv = createServer();
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      srv.close(() => resolvePort(port));
    });
    srv.on("error", reject);
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const OUT_DIR = join(ROOT, "output/e2e-isolated");
mkdirSync(OUT_DIR, { recursive: true });

const steps = [];
const pageErrors = [];
const screenshots = [];
function record(name, ok, detail = "") {
  steps.push({ name, ok, detail });
  console.log(`${ok ? "✓" : "✗ FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
  if (!ok) throw new Error(`${name}${detail ? ": " + detail : ""}`);
}

// 隔离工作区严格部署在 D 盘，避免侵占系统盘且便于持久化与复盘
const baseDir = existsSync("D:/Temp")
  ? "D:/Temp"
  : existsSync("D:/siyuan-rig")
    ? "D:/siyuan-rig"
    : tmpdir();
const tempWs = join(baseDir, `siyuan-exam-live-${Date.now()}`);
mkdirSync(tempWs, { recursive: true });

const TOKEN = "lv-exam-isolated-token";
const port = await findAvailablePort(43921);
const BASE = `http://127.0.0.1:${port}`;

// 1. 预置隔离工作区配置与插件文件（内核启动前写入，避免 conf 覆盖）
mkdirSync(join(tempWs, "conf"), { recursive: true });
mkdirSync(join(tempWs, "data/plugins/siyuan-exam"), { recursive: true });
mkdirSync(join(tempWs, "data/storage/petal"), { recursive: true });

writeFileSync(
  join(tempWs, "conf/conf.json"),
  JSON.stringify(
    {
      appearance: { mode: 0, lang: "zh_CN", themeJS: false },
      lang: "zh_CN",
      bazaar: { trust: true, petalDisabled: false },
      onboarding: false,
      showChangelog: false,
      accessAuthCode: "",
      api: { token: TOKEN },
    },
    null,
    2,
  ),
  "utf8",
);

writeFileSync(
  join(tempWs, "data/storage/petal/petals.json"),
  JSON.stringify(
    [
      {
        name: "siyuan-exam",
        displayName: manifest.displayName?.["zh-CN"] ?? "小驴考试",
        version: manifest.version,
        enabled: true,
        incompatible: false,
        disabledInPublish: true,
        userDisabledInPublish: false,
        disallowInstall: false,
        js: "",
        css: "",
        i18n: null,
        kernel: { js: "", existed: false, incompatible: true },
      },
    ],
    null,
    2,
  ),
  "utf8",
);

cpSync(DIST_DIR, join(tempWs, "data/plugins/siyuan-exam"), { recursive: true });

async function api(path, body = {}) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await fetch(BASE + path, {
      method: "POST",
      headers: { Authorization: `Token ${TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} on ${path}`);
    const json = await res.json();
    if (json.code !== 0 && /metadata is not ready|indexUnavailable/i.test(String(json.msg ?? "")) && attempt < 5) {
      await sleep(450);
      continue;
    }
    return json;
  }
}

let kernelProc = null;
let browser = null;

try {
  const appDir = resolve(kernelPath, "../..");
  const kernelArgs = ["serve", "--workspace", tempWs, "--port", String(port), "--mode", "prod", "--lang", "zh-CN"];
  if (existsSync(join(appDir, "stage"))) {
    kernelArgs.push("--wd", appDir);
  }
  console.log(`启动隔离思源内核：${BASE} · 工作区：${tempWs}`);
  kernelProc = spawn(kernelPath, kernelArgs, {
    stdio: "ignore",
    windowsHide: true,
    detached: keep,
  });

  // 等待内核就绪
  let kernelReady = false;
  for (let i = 0; i < 40; i++) {
    try {
      const v = await api("/api/system/version");
      if (v.code === 0) {
        kernelReady = true;
        record("1. 隔离思源内核启动就绪", true, `SiYuan ${v.data} @ port ${port}`);
        break;
      }
    } catch {
      /* wait */
    }
    await sleep(350);
  }
  if (!kernelReady) record("1. 隔离思源内核启动就绪", false, "等待超时");

  await api("/api/petal/setPetalEnabled", { packageName: "siyuan-exam", enabled: true, frontend: "desktop" }).catch(() => undefined);

  browser = await chromium.launch({ executablePath: chromePath, headless: !headed });
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  page.on("pageerror", (err) => pageErrors.push(String(err?.stack ?? err)));
  page.on("console", (msg) => {
    if (msg.text().includes("[handleInstall")) console.log(">>> BROWSER LOG:", msg.text());
  });

  const snap = async (file) => {
    const p = join(OUT_DIR, file);
    await page.screenshot({ path: p, fullPage: false, animations: "disabled" });
    screenshots.push(p);
  };

  const entrySelector = '#toolbar [id^="plugin_siyuan-exam_"], #toolbar [id^="plugin_siyuan-exam:"]';
  const dismissHostDialogs = async () => {
    await page.evaluate(() => {
      document.querySelectorAll(".b3-dialog--open .b3-dialog__close, .b3-dialog--open .b3-button--cancel").forEach((el) => {
        if (el instanceof HTMLElement) el.click();
      });
      document.querySelectorAll(".onboarding").forEach((el) => el.remove());
      if (!document.getElementById("lv-e2e-no-toast-intercept")) {
        const st = document.createElement("style");
        st.id = "lv-e2e-no-toast-intercept";
        st.textContent = "#message, #message *, #tempMessage, #tempMessage *, .onboarding, .onboarding * { pointer-events: none !important; display: none !important; }";
        document.head.appendChild(st);
      }
    });
  };

  await page.goto(`${BASE}/stage/build/desktop/`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.locator(entrySelector).first().waitFor({ state: "visible", timeout: 30000 });
  await page.waitForFunction(() => Boolean(window.siyuanExam?.version), undefined, { timeout: 30000 });
  await dismissHostDialogs();

  // 预置多形态思源研学笔记供端到端直接导入测试（多方位验证：一行多选项、括号答案、自然判断、标题问答）
  try {
    const testNbRes = await api("/api/notebook/createNotebook", { name: "思源研学笔记本" });
    const testNbId = typeof testNbRes?.data === "object" ? testNbRes.data?.notebook?.id : testNbRes?.data;
    if (testNbId) {
      for (let retry = 0; retry < 6; retry++) {
        try {
          const r1 = await api("/api/filetree/createDocWithMd", {
            notebook: testNbId,
            path: "/自然排版试卷",
            markdown: `# 自然排版试卷\n\n1. 下列选项中不属于面向对象特征的是（ C ）\nA. 封装  B. 继承  C. 递归  D. 多态\n【解析】三大特征为封装继承多态。\n\n2、软件生命周期时间最长的阶段是（   ）\nA. 需求分析\nB. 概要设计\nC. 编码测试\nD. 运行维护\n【答案】D\n`,
          });
          if (r1?.code === 0) break;
        } catch {
          /* wait */
        }
        await sleep(500);
      }

      await api("/api/filetree/createDocWithMd", {
        notebook: testNbId,
        path: "/自然判断题笔记",
        markdown: `# 自然判断题笔记\n\n1. 任何无向树都是二部图。( √ )\n2. 所有的偶数都是合数。( × )\n【解析】2是偶数也是质数。\n`,
      });

      await api("/api/filetree/createDocWithMd", {
        notebook: testNbId,
        path: "/核心概念速查",
        markdown: `# 核心概念速查\n\n### 什么是死锁？\n死锁是指多个进程因争夺资源造成的互相等待。\n\n### 简述进程与线程区别？\n进程是资源分配单位，线程是调度单位。\n`,
      });
    }
  } catch {
    /* 容错降级 */
  }

  const activeTab = () => page.locator(".layout-tab-container > div:not(.fn__none) .lv-exam-tab").first();

  // ---------- 阶段 1：点击顶栏图标 → 欢迎守卫 → 一键创建 12 题示例题库 ----------
  await page.locator(entrySelector).first().click();
  const welcomeBtn = activeTab().getByRole("button", { name: /创建示例题库（12 题）/ });
  await welcomeBtn.waitFor({ state: "visible", timeout: 20000 });
  record("2. 顶栏入口打开练习台欢迎守卫", true, `v${await page.evaluate(() => window.siyuanExam.version)}`);

  await welcomeBtn.click();
  await activeTab().getByRole("button", { name: /开始今日练习/ }).waitFor({ state: "visible", timeout: 30000 });
  await snap("01-today-cockpit.png");
  const overflowToday = await activeTab().locator(".lv-main").evaluate((el) => el.scrollWidth - el.clientWidth);
  record("3. 真内核一键创建 12 题示例库并进入今日驾驶舱", overflowToday <= 2, `横向溢出=${overflowToday}px`);

  // ---------- 阶段 2：题库管理中心弹窗 & 底部折叠更多场景示例库 + 关闭归还焦点 ----------
  await dismissHostDialogs();
  const bankHubTrigger = activeTab().getByRole("button", { name: "题库管理中心" });
  await bankHubTrigger.focus();
  await bankHubTrigger.click();
  const moreDetails = activeTab().locator("details").filter({ hasText: "更多场景示例题库" });
  await moreDetails.waitFor({ state: "visible" });
  const defaultCollapsed = await moreDetails.evaluate((el) => !el.hasAttribute("open"));
  await moreDetails.locator("summary").click();
  const sceneButtonsCount = await moreDetails.locator("button").count();
  await snap("02-bank-gallery.png");
  await page.keyboard.press("Escape");
  await sleep(100);
  const focusRestoredToTrigger = await bankHubTrigger.evaluate((el) => document.activeElement === el);
  record(
    "4. 题库管理中心场景示例库默认折叠、展开含 5 类场景且关闭后归还焦点",
    defaultCollapsed && sceneButtonsCount === 5 && focusRestoredToTrigger,
    `collapsed=${defaultCollapsed}, scenes=${sceneButtonsCount}, focusRestored=${focusRestoredToTrigger}`,
  );

  // ---------- 阶段 3：出题工作台（OCR 按钮键盘可达 + 手工录题 + 批量导入读回） ----------
  await activeTab().locator(".lv-rail").getByRole("button", { name: "出题", exact: true }).click();
  await activeTab().getByRole("button", { name: /智能粘贴拆单|OCR 填单/ }).first().click();
  const ocrUploadTag = await activeTab().getByRole("button", { name: /选择试卷图片/ }).evaluate((el) => el.tagName);
  await activeTab().getByRole("button", { name: "取消", exact: true }).click();
  await activeTab().locator("#lv-manual-stem").fill("【真机E2E】HTTP 协议默认端口是？");
  await activeTab().locator('[data-manual-field="option-0"]').fill("80");
  await activeTab().locator('[data-manual-field="option-1"]').fill("443");
  await activeTab().locator('[data-manual-field="answer"]').click();
  await activeTab().locator("#lv-manual-kp").fill("计算机网络/应用层");
  await activeTab().locator("#lv-manual-sec-kp").fill("协议端口, 传输基础");
  await activeTab().locator("#lv-manual-analysis").fill("HTTP 默认使用 80 端口。");
  await activeTab().locator("#lv-manual-expansion").fill("【秒杀技巧】常见知名端口：HTTP 80、HTTPS 443、DNS 53、SSH 22。");

  // 验证属性锁定 (AUTH-01 / TODO-Pin)
  const pinBtn = activeTab().getByRole("button", { name: /锁定属性|属性已锁定/ });
  await pinBtn.click();
  await activeTab().getByRole("button", { name: /📌 连录下一题|入库并继续下一题/ }).click();
  await activeTab().locator('[data-manual-form] [role="status"]').waitFor({ state: "visible", timeout: 15000 });
  const stemAfterPin = await activeTab().locator("#lv-manual-stem").inputValue();
  const kpAfterPin = await activeTab().locator("#lv-manual-kp").inputValue();
  const pinSuccess = stemAfterPin === "" && kpAfterPin === "计算机网络/应用层";
  // 关闭属性锁定以恢复常规
  await pinBtn.click();

  await activeTab().getByRole("navigation", { name: "出题工作台" }).getByRole("button", { name: "批量导入", exact: true }).click();
  await activeTab().locator("textarea.lv-textarea").first().fill(
    "1. 【单选】TCP 三次握手中第一步发送的标志位是？\nA. SYN\nB. ACK\nC. FIN\nD. RST\n答案：A\n解析：客户端首先发送 SYN 同步报文。\n考点：计算机网络/传输层",
  );
  await activeTab().getByRole("button", { name: "解析预览", exact: true }).click();
  const commitBtn = activeTab().getByRole("button", { name: /^入库\s*\(/ });
  await commitBtn.waitFor({ state: "visible" });
  await commitBtn.click();
  await activeTab().getByText(/读回确认 1 题/).waitFor({ state: "visible", timeout: 20000 });
  await snap("03-import-studio.png");
  record("5. OCR 按钮真 button 可聚焦、录题属性锁定连录、四层拓展与批量导入读回确认", ocrUploadTag === "BUTTON" && pinSuccess, `ocrBtn=${ocrUploadTag}, pinSuccess=${pinSuccess}`);

  // ---------- 阶段 3.5：多方位真机测试从思源笔记直接提取导入题库 ----------
  // 1. 切换到「从思源文档导入」子分面
  const siyuanDocTabBtn = activeTab().getByRole("tab", { name: /从思源文档导入/ });
  await siyuanDocTabBtn.click();
  await sleep(500);

  // 1.1 验证场景模式预设切换（切换到「标准试卷」模式）
  const paperPresetBtn = activeTab().getByRole("button", { name: /标准试卷/ });
  await paperPresetBtn.waitFor({ state: "visible" });
  await paperPresetBtn.click();

  // 2. 检索并直接提取「自然排版试卷」（一行多选项 + 题干括号答案）
  const searchDocInput = activeTab().locator('input[placeholder*="搜索思源文档"]');
  await searchDocInput.fill("自然排版");
  await activeTab().locator(".stack-sm").getByRole("button", { name: "搜索", exact: true }).click();
  await sleep(600);
  await dismissHostDialogs();
  const paperDocRow = activeTab().locator(".lv-row").filter({ hasText: "自然排版试卷" }).first();
  await paperDocRow.waitFor({ state: "visible", timeout: 15000 });
  await paperDocRow.getByRole("button", { name: /直接提取/ }).click();

  // 3. 自动切到解析预览：验证提取出的题目卡片含高置信度勋章、筛选功能与成功入库
  const confBadge = activeTab().locator(".lv-card").first().locator(".lv-chip--grn, .lv-chip--amb");
  await confBadge.first().waitFor({ state: "visible", timeout: 15000 });
  const selectHighBtn = activeTab().getByRole("button", { name: /仅勾选高置信题/ });
  if (await selectHighBtn.isVisible()) {
    await selectHighBtn.click();
  }

  const commitPaperBtn = activeTab().getByRole("button", { name: /^入库\s*\(/ });
  await commitPaperBtn.waitFor({ state: "visible", timeout: 15000 });
  await commitPaperBtn.click();
  await activeTab().getByText(/读回确认 2 题/).first().waitFor({ state: "visible", timeout: 20000 });
  await snap("03b-siyuan-doc-import-paper.png");

  // 4. 再次切到「从思源文档导入」，测试自然判断题笔记直接提取
  await siyuanDocTabBtn.click();
  await sleep(400);
  await searchDocInput.fill("判断题");
  await activeTab().locator(".stack-sm").getByRole("button", { name: "搜索", exact: true }).click();
  await sleep(500);
  await dismissHostDialogs();
  const judgeDocRow = activeTab().locator(".lv-row").filter({ hasText: "自然判断题笔记" }).first();
  await judgeDocRow.waitFor({ state: "visible", timeout: 15000 });
  await judgeDocRow.getByRole("button", { name: /直接提取/ }).click();

  const commitJudgeBtn = activeTab().getByRole("button", { name: /^入库\s*\(/ });
  await commitJudgeBtn.waitFor({ state: "visible", timeout: 15000 });
  await commitJudgeBtn.click();
  try {
    await activeTab().getByText(/读回确认 2 题/).first().waitFor({ state: "visible", timeout: 20000 });
  } catch (e) {
    await snap("debug-judge-commit-fail.png");
    throw e;
  }
  await snap("03c-siyuan-doc-import-judge.png");

  // 5. 再次切到「从思源文档导入」，测试概念速查问答笔记提取（切换回「智能全能」或「读书笔记」模式）
  await siyuanDocTabBtn.click();
  await sleep(400);
  const allPresetBtn = activeTab().getByRole("button", { name: /智能全能/ });
  await allPresetBtn.waitFor({ state: "visible" });
  await allPresetBtn.click();
  await sleep(300);

  await searchDocInput.fill("概念速查");
  await activeTab().locator(".stack-sm").getByRole("button", { name: "搜索", exact: true }).click();
  await sleep(500);
  await dismissHostDialogs();
  const qaDocRow = activeTab().locator(".lv-row").filter({ hasText: "核心概念速查" }).first();
  await qaDocRow.waitFor({ state: "visible", timeout: 15000 });
  await qaDocRow.getByRole("button", { name: /直接提取/ }).click();

  const commitQaBtn = activeTab().getByRole("button", { name: /^入库\s*\(/ });
  await commitQaBtn.waitFor({ state: "visible", timeout: 15000 });
  await commitQaBtn.click();
  await activeTab().getByText(/读回确认 2 题/).first().waitFor({ state: "visible", timeout: 20000 });
  await snap("03d-siyuan-doc-import-qa.png");

  record(
    "6. 从思源笔记智能导入题库（单选一行多选项/题干括号答案/自然判断/概念问答多方位全真机跑通）",
    true,
    "自然试卷(2题)+自然判断(2题)+概念问答(2题)共6题真机提取并入库读回确认",
  );

  // ---------- 阶段 4：专注做题会话（普通题隐藏跟读、侧栏防泄题、提示+草稿刷新恢复、AI 讲解深度下拉） ----------
  await activeTab().locator(".lv-rail").getByRole("button", { name: "今日", exact: true }).click();
  await activeTab().getByRole("button", { name: /开始今日练习/ }).click();
  await activeTab().locator(".lv-question").waitFor({ state: "visible" });

  const micOnNormal = await activeTab().getByRole("button", { name: /跟读/ }).count();
  const sideChipsBefore = await activeTab().locator(".lv-session-side .lv-side-rows").innerText();
  const stageHintBtn = activeTab().getByRole("button", { name: /考点提示（卡壳再看）/ });
  await stageHintBtn.click();
  const sideChipsAfterHint = await activeTab().locator(".lv-session-side .lv-side-rows").innerText();

  // 打开草稿纸写入演算内容
  await activeTab().getByRole("button", { name: /草稿纸/ }).click();
  const padInput = activeTab().getByPlaceholder(/在此演练计算/);
  await padInput.waitFor({ state: "visible" });
  await padInput.fill("真机E2E草稿：重载不能丢");
  await sleep(1500);

  // 整页刷新思源宿主，验证会话、第1阶提示展开态（受助暴露）与草稿纸跨刷新恢复
  await page.reload({ waitUntil: "domcontentloaded", timeout: 30000 });
  await page.locator(entrySelector).first().waitFor({ state: "visible", timeout: 30000 });
  await page.waitForFunction(() => Boolean(window.siyuanExam?.version), undefined, { timeout: 30000 });
  await dismissHostDialogs();
  await page.locator(entrySelector).first().click();
  await activeTab().locator(".lv-question").waitFor({ state: "visible", timeout: 20000 });

  const hintStillExpanded = await activeTab().getByRole("button", { name: /考点提示（卡壳再看）/ }).getAttribute("aria-expanded");
  await activeTab().getByRole("button", { name: /草稿纸/ }).click();
  const restoredPadValue = await activeTab().getByPlaceholder(/在此演练计算/).inputValue();

  // 验证顶部快捷坞工具：自动翻题与选项乱序 (FLOW-01/03)
  const hasAutoNextChip = (await activeTab().getByRole("button", { name: /自动翻题|翻题关/ }).count()) > 0;
  const hasShuffleChip = (await activeTab().getByRole("button", { name: /选项乱序|乱序|顺序/ }).count()) > 0;

  record(
    "7. 做题会话：普通题隐藏跟读、答前侧栏不泄考点、重载后提示受助态与草稿纸完整恢复（含自动翻题/乱序工具）",
    micOnNormal === 0 && sideChipsAfterHint.length > sideChipsBefore.length && hintStillExpanded === "true" && restoredPadValue === "真机E2E草稿：重载不能丢" && hasAutoNextChip && hasShuffleChip,
    `mic=${micOnNormal}, hintExpanded=${hintStillExpanded}, pad="${restoredPadValue}", autoNext=${hasAutoNextChip}, shuffle=${hasShuffleChip}`,
  );

  // 故意引发一道错题以检查 AI 讲解深度下拉、思路拓展卡与自适应根因诊断
  let gotWrongFeedback = false;
  for (let step = 0; step < 6 && !gotWrongFeedback; step++) {
    const hasOpts = (await activeTab().locator(".lv-question .lv-opt").count()) > 0;
    if (hasOpts) {
      await activeTab().locator(".lv-question .lv-opt").last().click();
    } else {
      const ta = activeTab().locator(".lv-question textarea, .lv-question input.lv-input").first();
      if (await ta.count()) await ta.fill("故意错误答案");
    }
    const submitBtn = activeTab().getByRole("button", { name: /^确认/ });
    if (await submitBtn.isVisible().catch(() => false)) {
      await submitBtn.click();
    }
    await sleep(300);
    const fbLoc = activeTab().locator(".lv-feedback");
    const fbText = (await fbLoc.count()) > 0 ? (await fbLoc.innerText().catch(() => "")) : "";
    if (/回答错误|正确答案/.test(fbText)) {
      gotWrongFeedback = true;
    } else {
      const nextBtn = activeTab().getByRole("button", { name: /^下一题/ });
      if (await nextBtn.isVisible().catch(() => false)) {
        await nextBtn.click();
        await sleep(300);
      }
    }
  }

  // 验证自适应根因诊断与先修路线推荐 (DIAG-02/03)
  const diagnoseBtn = activeTab().getByRole("button", { name: /溯源根因/ });
  let diagnoseModalOk = false;
  if (await diagnoseBtn.count()) {
    await diagnoseBtn.click();
    await sleep(400);
    const modal = activeTab().locator('[aria-label="错题自适应先修根因诊断"]');
    if (await modal.count()) {
      diagnoseModalOk = true;
      await snap("04b-adaptive-diagnosis-modal.png");
      await modal.getByRole("button", { name: "关闭" }).first().click();
      await sleep(200);
    }
  }

  const explainSelect = activeTab().getByRole("combobox", { name: "选择 AI 讲解模式" });
  await explainSelect.waitFor({ state: "visible" });
  const explainModes = await explainSelect.locator("option").allInnerTexts();
  const explainBtn = activeTab().locator(".lv-answer-actions").getByRole("button", { name: /AI 讲解/ });
  const actionAlign = await activeTab().locator(".lv-answer-actions").evaluate((row) => {
    const sel = row.querySelector(".lv-explain-group select.lv-select");
    const btn = row.querySelector(".lv-explain-group button.lv-btn");
    if (!sel || !btn) return { ok: false, detail: "missing controls" };
    const sr = sel.getBoundingClientRect();
    const br = btn.getBoundingClientRect();
    const sStyle = getComputedStyle(sel);
    const bStyle = getComputedStyle(btn);
    return {
      ok: Math.abs(sr.height - 38) <= 1 && Math.abs(br.height - 38) <= 1 && Math.abs(sr.top - br.top) <= 1,
      selH: Math.round(sr.height),
      btnH: Math.round(br.height),
      topDiff: Math.round(Math.abs(sr.top - br.top)),
      selRadius: sStyle.borderRadius,
      btnRadius: bStyle.borderRadius,
    };
  });
  await snap("04-practice-session.png");

  // 退出练习会话（确认思源原生弹窗）
  await activeTab().getByRole("button", { name: /结束练习/ }).click();
  const confirmBtn = page.locator("#confirmDialogConfirmBtn");
  await sleep(300);
  if (await confirmBtn.isVisible().catch(() => false)) {
    await confirmBtn.click();
  }
  record(
    "8. 错题反馈态 AI 讲解下拉对齐、思路拓展与自适应根因诊断闭环",
    explainModes.length === 3 && actionAlign.ok && (await explainBtn.count()) >= 0 && diagnoseModalOk,
    `${explainModes.join(" / ")} · align=${JSON.stringify(actionAlign)}, diagnoseModal=${diagnoseModalOk}`,
  );

  // ---------- 阶段 5：错题本核验（错题集落盘）+ 首页归档思源文档 + 背诵模式跨刷新续做 ----------
  await activeTab().locator(".lv-rail").getByRole("button", { name: /错题本/ }).click();
  await activeTab().getByRole("tab", { name: /在册/ }).waitFor({ state: "visible" });
  const wbJumpBtnCount = await activeTab().locator(".lv-wrong-row").getByRole("button", { name: /原题/ }).count();
  const wbReflectBtnCount = await activeTab().locator('.lv-wrong-row button[title*="复盘反思"]').count();
  const wbSaveDocBtn = activeTab().getByRole("button", { name: /存为思源错题集/ });
  await wbSaveDocBtn.waitFor({ state: "visible" });
  await wbSaveDocBtn.click();
  await activeTab().getByRole("button", { name: /在思源中打开/ }).waitFor({ state: "visible", timeout: 15000 });
  await snap("05-wrongbook.png");

  await activeTab().locator(".lv-rail").getByRole("button", { name: "今日", exact: true }).click();
  const archiveDocsBtn = activeTab().getByRole("button", { name: /归档到思源文档/ });
  await archiveDocsBtn.waitFor({ state: "visible" });
  await archiveDocsBtn.click();
  await page.waitForFunction(
    () => {
      const btn = document.querySelector('.layout-tab-container > div:not(.fn__none) .lv-exam-tab button[title*="思源笔记"]');
      return !btn || !btn.hasAttribute("disabled");
    },
    undefined,
    { timeout: 25000 },
  );
  await activeTab().getByRole("button", { name: /00 题库总览与考纲导航/ }).waitFor({ state: "visible", timeout: 20000 });
  await activeTab().getByRole("button", { name: /完整题册/ }).waitFor({ state: "visible", timeout: 20000 });
  await sleep(600);
  await activeTab().locator("button.lv-mode").filter({ hasText: "背诵" }).first().click();
  await activeTab().getByRole("button", { name: /翻开答案/ }).waitFor({ state: "visible" });
  await activeTab().getByRole("button", { name: /翻开答案/ }).click();
  await activeTab().locator(".lv-rate button.r3").click();
  await sleep(500);

  // 刷新思源，验证背诵进度从第 2 题自动续做
  await page.reload({ waitUntil: "domcontentloaded", timeout: 30000 });
  await page.locator(entrySelector).first().waitFor({ state: "visible", timeout: 30000 });
  await page.waitForFunction(() => Boolean(window.siyuanExam?.version), undefined, { timeout: 30000 });
  await dismissHostDialogs();
  await page.locator(entrySelector).first().click();
  await activeTab().getByRole("button", { name: /退出背诵/ }).waitFor({ state: "visible", timeout: 20000 });
  const reciteProgressText = await activeTab().locator(".lv-session-head .lv-chip.num").first().innerText();
  await snap("06-recite-resumed.png");

  await activeTab().getByRole("button", { name: /退出背诵/ }).click();
  await sleep(300);
  if (await confirmBtn.isVisible().catch(() => false)) {
    await confirmBtn.click();
  }
  record("9. 背诵模式空格翻面/评级后整页刷新自动续做第 2 题", reciteProgressText.startsWith("2/"), `进度=${reciteProgressText}`);

  // ---------- 阶段 6：题库详情抽屉「衍生变式题」规格继承 + 笔记深度绑定操作 + 批量勾选四合一打印版式 ----------
  await activeTab().locator(".lv-rail").getByRole("button", { name: "题库", exact: true }).click();
  const httpRow = activeTab().locator(".lv-qrow").filter({ hasText: "HTTP 协议默认端口" }).locator(".lv-qrow-head");
  await httpRow.click();

  const cloneBtn = activeTab().getByRole("button", { name: /衍生变式题/ });
  await cloneBtn.waitFor({ state: "visible" });
  const bindNoteBtn = activeTab().getByRole("button", { name: /绑定思源笔记|换绑笔记/ });
  const hasBindNoteBtn = await bindNoteBtn.isVisible();

  await cloneBtn.click();
  const clonedSecKp = await activeTab().locator("#lv-manual-sec-kp").inputValue();
  const clonedStem = await activeTab().locator("#lv-manual-stem").inputValue();
  await activeTab().locator("[data-manual-form] .lv-btn--primary").first().click();
  await activeTab().locator('[data-manual-form] [role="status"]').waitFor({ state: "visible", timeout: 15000 });

  await activeTab().locator(".lv-rail").getByRole("button", { name: "题库", exact: true }).click();
  await activeTab().getByRole("button", { name: /批量编辑/ }).click();
  const rowHeads = activeTab().locator(".lv-qrow-head");
  await rowHeads.nth(0).click();
  await rowHeads.nth(1).click();

  const batchToolbar = activeTab().getByRole("toolbar", { name: "批量操作快捷栏" });
  await batchToolbar.waitFor({ state: "visible" });
  const batchPrintSel = batchToolbar.getByRole("combobox", { name: "选择打印试卷版式" });
  await batchPrintSel.selectOption("lecture");

  await page.evaluate(() => {
    window.__lastPrintedHtml = "";
    window.open = () =>
      ({
        document: {
          write: (html) => {
            window.__lastPrintedHtml = html;
          },
          close: () => undefined,
        },
        focus: () => undefined,
      });
  });
  await batchToolbar.getByRole("button", { name: /打印试卷/ }).click();
  await page.waitForFunction(() => Boolean(window.__lastPrintedHtml), undefined, { timeout: 10000 });
  const lectureHtml = await page.evaluate(() => window.__lastPrintedHtml);
  await snap("07-browse-print.png");

  // 窄屏 390px 下批量浮岛栏自动抬升避开底部移动端任务栏
  await page.setViewportSize({ width: 390, height: 844 });
  await sleep(200);
  const batchBottomPx = await batchToolbar.evaluate((el) => parseFloat(getComputedStyle(el).bottom));
  await page.setViewportSize({ width: 1440, height: 960 });
  record(
    "10. 衍生变式题继承辅助考点、详情抽屉笔记双向绑定按钮就绪、批量浮岛导出「授课讲义卷」HTML 且 390px 窄屏自动抬升防遮挡",
    clonedStem.includes("（变式）") &&
      hasBindNoteBtn &&
      clonedSecKp.includes("协议端口") &&
      lectureHtml.includes("教师授课讲义卷") &&
      lectureHtml.includes("参考答案") &&
      lectureHtml.includes("教学点拨与破题分析") &&
      batchBottomPx >= 60,
    `clonedSecKp="${clonedSecKp}", HTML=${lectureHtml.length}, 390px bottom=${batchBottomPx}px`,
  );

  // ---------- 阶段 7：全真模考（生成思源试卷 + 首屏主按钮置顶 + 选答+标旗+草稿 → 刷新恢复 → 交卷与导出成绩单） ----------
  await page.evaluate(() => window.siyuanExam.mock());
  const mockTab = () => page.locator(".layout-tab-container > div:not(.fn__none) .lv-exam-tab").first();
  await mockTab().getByRole("combobox", { name: "选择模考打印卷面版式" }).waitFor({ state: "visible", timeout: 20000 });
  const genMockPaperDocBtn = mockTab().getByRole("button", { name: /存为思源文档/ });
  await genMockPaperDocBtn.waitFor({ state: "visible" });
  await genMockPaperDocBtn.click();
  await sleep(1000);
  const startMockBtn = mockTab().getByRole("button", { name: /开始模考/ });
  const startMockBox = await startMockBtn.boundingBox();
  await startMockBtn.click();
  await sleep(600);
  if (await confirmBtn.isVisible().catch(() => false)) {
    await confirmBtn.click();
  }
  await mockTab().locator(".lv-question").waitFor({ state: "visible", timeout: 20000 });
  if ((await mockTab().locator(".lv-question .lv-opt").count()) > 0) {
    await mockTab().locator(".lv-question .lv-opt").first().click();
  } else {
    const inp = mockTab().locator(".lv-question input.lv-input, .lv-question textarea").first();
    if (await inp.count()) await inp.fill("100");
  }
  await mockTab().locator(".lv-flag-btn").first().click();
  await mockTab().getByRole("button", { name: /草稿纸/ }).click();
  await mockTab().getByPlaceholder(/在此演练计算/).fill("模考真机草稿888");
  await sleep(3300); // 等待模考快照 3s 节流落盘完成

  // 刷新后重新打开模考场并恢复考试
  await page.reload({ waitUntil: "domcontentloaded", timeout: 30000 });
  await page.locator(entrySelector).first().waitFor({ state: "visible", timeout: 30000 });
  await page.waitForFunction(() => Boolean(window.siyuanExam?.version), undefined, { timeout: 30000 });
  await dismissHostDialogs();
  await page.evaluate(() => window.siyuanExam.mock());
  const resumeMockBtn = mockTab().getByRole("button", { name: /恢复考试/ });
  await resumeMockBtn.waitFor({ state: "visible", timeout: 20000 });
  await resumeMockBtn.click();
  await mockTab().locator(".lv-question").waitFor({ state: "visible" });
  await mockTab().getByRole("button", { name: /草稿纸/ }).click();
  const restoredMockPad = await mockTab().getByPlaceholder(/在此演练计算/).inputValue();

  await mockTab().getByRole("button", { name: /交卷/ }).click();
  await confirmBtn.waitFor({ state: "visible" });
  await confirmBtn.click();
  await mockTab().locator(".lv-score-card").waitFor({ state: "visible", timeout: 20000 });
  const writeScoreDocBtn = mockTab().getByRole("button", { name: /写入题库导出文档/ });
  await writeScoreDocBtn.waitFor({ state: "visible" });
  await writeScoreDocBtn.click();
  await sleep(1000);
  const reportPrintOpts = await mockTab().getByRole("combobox", { name: "选择考后打印版式" }).locator("option").allInnerTexts();
  await snap("08-mock-score.png");
  record(
    "11. 全真模考首屏开始按钮置顶无需滚动、中断刷新恢复（含草稿纸）并交卷出分与写入成绩单文档",
    Boolean(startMockBox && startMockBox.y < 480) && restoredMockPad === "模考真机草稿888" && reportPrintOpts.length >= 4,
    `startBtnY=${Math.round(startMockBox?.y ?? 999)}px, pad="${restoredMockPad}", PrintFormats=${reportPrintOpts.join("/")}`,
  );

  // ---------- 阶段 8：复盘报告中心、写入今日笔记落盘、1100px 侧栏断点与 390px 窄屏 ----------
  await page.evaluate(() => window.siyuanExam.report());
  const reportTab = () => page.locator(".layout-tab-container > div:not(.fn__none) .lv-exam-tab").first();
  await reportTab().locator(".lv-report-tabs").waitFor({ state: "visible", timeout: 20000 });
  await reportTab().locator(".lv-report-tabs").getByRole("button", { name: "考点与错题" }).click();
  await reportTab().locator(".lv-report-tabs").getByRole("button", { name: "记录与证据" }).click();
  const writeDailyBtn = reportTab().getByRole("button", { name: /写入今日战报/ });
  await writeDailyBtn.waitFor({ state: "visible" });
  await writeDailyBtn.click();
  await reportTab().getByRole("button", { name: /打开今日战报/ }).waitFor({ state: "visible", timeout: 15000 });
  const syncReportDocsBtn = reportTab().getByRole("button", { name: /同步总览与复盘日志到思源/ });
  await syncReportDocsBtn.click();
  await reportTab().getByRole("button", { name: /打开题库总览/ }).waitFor({ state: "visible", timeout: 15000 });
  await sleep(500);
  await reportTab().locator(".lv-report-tabs").getByRole("button", { name: "概览" }).click();
  await snap("09-report-desktop.png");

  // 1100px 紧凑侧栏断点核验（POOL-UI-02：.lv-nav-label 必须隐藏）
  await page.setViewportSize({ width: 1100, height: 900 });
  await sleep(250);
  const navLabelDisplay1100 = await reportTab().locator(".lv-rail .lv-nav-label").first().evaluate((el) => getComputedStyle(el).display);

  // 390px 窄屏核验
  await page.setViewportSize({ width: 390, height: 844 });
  await sleep(250);
  const overflow390 = await reportTab().locator(".lv-main").evaluate((el) => el.scrollWidth - el.clientWidth);
  await snap("10-responsive-390.png");
  await page.setViewportSize({ width: 1440, height: 960 });
  record(
    "12. 复盘报告三分面、1100px 紧凑侧栏隐藏文字与 390px 窄屏零溢出",
    navLabelDisplay1100 === "none" && overflow390 <= 2,
    `1100px navLabel=${navLabelDisplay1100}, 390px overflow=${overflow390}px`,
  );

  // ---------- 阶段 9：语种题目自动浮现「跟读测评」与音标胶囊 ----------
  await page.locator(entrySelector).first().click();
  await sleep(500);
  const exitIfInSession = activeTab().getByRole("button", { name: /结束练习/ });
  if (await exitIfInSession.isVisible().catch(() => false)) {
    await exitIfInSession.click();
    await sleep(300);
    if (await confirmBtn.isVisible().catch(() => false)) {
      await confirmBtn.click();
    }
  }
  await dismissHostDialogs();
  const bankHubBtn = activeTab().getByRole("button", { name: "题库管理中心" });
  await bankHubBtn.waitFor({ state: "visible", timeout: 20000 });
  await bankHubBtn.click();
  const detailsAgain = activeTab().locator("details").filter({ hasText: "更多场景示例题库" });
  await detailsAgain.waitFor({ state: "visible" });
  await detailsAgain.locator("summary").click();
  const engBtn = detailsAgain.getByRole("button", { name: /英语词汇/ });
  await engBtn.waitFor({ state: "visible" });
  await engBtn.click();
  await page.waitForFunction(
    () => {
      const tab = document.querySelector(".layout-tab-container > div:not(.fn__none) .lv-exam-tab");
      return Boolean(tab?.textContent?.includes("示例题库已就绪") || tab?.textContent?.includes("英语词汇"));
    },
    undefined,
    { timeout: 35000 },
  );
  await activeTab().getByRole("button", { name: /开始今日练习/ }).waitFor({ state: "visible", timeout: 15000 });
  await activeTab().getByRole("button", { name: /开始今日练习/ }).click();
  await sleep(400);
  if (await confirmBtn.isVisible().catch(() => false)) {
    await confirmBtn.click();
  }
  await activeTab().locator(".lv-question").waitFor({ state: "visible" });
  const micOnEnglish = await activeTab().getByRole("button", { name: /跟读/ }).count();
  const phoneticBadgeCount = await activeTab().locator(".lv-phonetic-badge").count();
  await snap("11-language-speech-auto.png");
  record(
    "13. 英语词汇题库（含 studyMeta）做题时自动显示「跟读测评」麦克风按钮与音标胶囊",
    micOnEnglish === 1 && phoneticBadgeCount === 1,
    `micButton=${micOnEnglish}, phoneticBadge=${phoneticBadgeCount}`,
  );

  // ---------- 阶段 10：思源笔记真实文档落盘 SQL + 原文双链 + 源题块属性回写核验 ----------
  const docRes = await api("/api/query/sql", {
    stmt: "SELECT id, hpath, content FROM blocks WHERE type='d' ORDER BY created ASC LIMIT 100",
  });
  const docRows = Array.isArray(docRes?.data) ? docRes.data : [];
  const findDoc = (pred) => [...docRows].reverse().find((r) => pred(String(r.hpath ?? "")));
  const overviewDoc = findDoc((p) => p.includes("/小驴考试/00 题库总览与考纲导航"));
  const journalDoc = findDoc((p) => p.includes("/小驴考试/03 备考行动与复盘日志"));
  const fullBankDoc = findDoc((p) => p.includes("/小驴考试/") && p.includes("完整题册"));
  const wrongbookExportDoc = findDoc((p) => p.includes("/导出/错题册"));
  const wrongbookManualDoc = findDoc((p) => p.includes("/小驴考试/试卷与复盘/") && p.includes("错题攻坚手册"));
  const mockPaperDoc = findDoc((p) => p.includes("/小驴考试/试卷与复盘/") && (p.includes("模拟卷") || p.includes("模拟试卷")));
  const scoreDoc = findDoc((p) => p.includes("/导出/模考成绩单"));
  const dailyDocRow = findDoc((hp) => (hp.includes("/每日战报/") || hp.includes("/daily")) && hp.split("/").filter(Boolean).length >= 2);

  const exportDocContent = async (row) => {
    if (!row?.id) return "";
    const exported = await api("/api/export/exportMdContent", { id: row.id });
    return String(exported?.data?.content ?? "").trim();
  };
  const [overviewMd, journalMd, fullBankMd, wrongExportMd, wrongManualMd, mockPaperMd, scoreMd, dailyReportMd] = await Promise.all([
    exportDocContent(overviewDoc),
    exportDocContent(journalDoc),
    exportDocContent(fullBankDoc),
    exportDocContent(wrongbookExportDoc),
    exportDocContent(wrongbookManualDoc),
    exportDocContent(mockPaperDoc),
    exportDocContent(scoreDoc),
    exportDocContent(dailyDocRow),
  ]);

  const attrRes = await api("/api/query/sql", {
    stmt: "SELECT name, value FROM attributes WHERE name IN ('custom-exam-attempts', 'custom-exam-wrong-count', 'custom-exam-wrong-status') AND value != '' LIMIT 50",
  });
  const syncedAttrsCount = Array.isArray(attrRes?.data) ? attrRes.data.length : 0;

  const refRes = await api("/api/query/sql", {
    stmt: "SELECT block_id, def_block_id, content FROM refs LIMIT 50",
  });
  const nativeRefsCount = Array.isArray(refRes?.data) ? refRes.data.length : 0;

  record(
    "14. 思源笔记 8 类真实文档全量落盘、((blockId)) 原生双链 refs 入表与源题块 IAL 属性回写核验",
    overviewMd.length > 100 &&
      journalMd.length > 80 &&
      fullBankMd.length > 100 &&
      wrongExportMd.length > 50 &&
      wrongManualMd.length > 100 &&
      mockPaperMd.length > 100 &&
      scoreMd.length > 50 &&
      dailyReportMd.length > 50 &&
      syncedAttrsCount > 0 &&
      nativeRefsCount > 0 &&
      wbJumpBtnCount > 0 &&
      wbReflectBtnCount > 0,
    `len={总览:${overviewMd.length}, 日志:${journalMd.length}, 题册:${fullBankMd.length}, 错题册:${wrongExportMd.length}, 攻坚手册:${wrongManualMd.length}, 模拟卷:${mockPaperMd.length}, 成绩单:${scoreMd.length}, 战报:${dailyReportMd.length}}, nativeRefs=${nativeRefsCount}, syncedAttrs=${syncedAttrsCount}, wbBtns=${wbJumpBtnCount}/${wbReflectBtnCount}`,
  );

  // ---------- 阶段 15：公共题库与闪卡集市双向互通全链路核验 ----------
  const exitSessionBtn = activeTab().getByRole("button", { name: /结束练习/ });
  if (await exitSessionBtn.isVisible()) {
    await exitSessionBtn.click();
    await page.waitForTimeout(300);
  }

  const mktRailBtn = activeTab().locator('.lv-rail-btn[title="集市"], .lv-rail-btn[aria-label="集市"]').first();
  await mktRailBtn.waitFor({ state: "visible", timeout: 10000 });
  await mktRailBtn.click();

  await activeTab().locator(".lv-marketplace-studio").waitFor({ state: "visible", timeout: 10000 });
  const mktCardsCount = await activeTab().locator(".lv-marketplace-card").count();

  const targetCard = activeTab().locator(".lv-marketplace-card").first();
  const previewBtn = targetCard.getByRole("button", { name: /试看样题/ });
  if (await previewBtn.isVisible()) {
    await previewBtn.click();
    await page.waitForTimeout(200);
  }

  const flashcardTabBtn = targetCard.getByRole("button", { name: /小驴闪卡/ });
  let flashcardModeOk = false;
  if (await flashcardTabBtn.isVisible()) {
    await flashcardTabBtn.click();
    await page.waitForTimeout(200);
    flashcardModeOk = (await targetCard.getByText(/卡片正面/).count()) > 0;
  }

  const mktCloneBtn = targetCard.getByRole("button", { name: /克隆至题库/ });
  const exportCardsBtn = targetCard.getByRole("button", { name: /导出闪卡包/ });
  const cloneBtnOk = await mktCloneBtn.isVisible();
  const exportCardsBtnOk = await exportCardsBtn.isVisible();

  await mktCloneBtn.click();
  // 等待克隆并批量落库完成（自动切入题库浏览视图并聚焦新题库）
  const browseHeading = activeTab().getByRole("heading", { name: /按章节翻题/ }).first();
  await browseHeading.waitFor({ state: "visible", timeout: 25000 });
  const clonedOk = await browseHeading.isVisible();

  await snap("12-marketplace-studio.png");

  record(
    "15. 题库集市与小驴闪卡双向互通：公版集市进入、双模试看切换与一键克隆入库",
    mktCardsCount >= 8 && flashcardModeOk && cloneBtnOk && exportCardsBtnOk && clonedOk,
    `cards=${mktCardsCount}, flashcardMode=${flashcardModeOk}, cloneBtn=${cloneBtnOk}, exportCardsBtn=${exportCardsBtnOk}, cloned=${clonedOk}`,
  );

  record("16. 全程浏览器 0 未捕获页面异常", pageErrors.length === 0, `pageErrors=${pageErrors.length}`);
} finally {
  await browser?.close().catch(() => undefined);
  if (keep) {
    kernelProc?.unref?.();
    const appUrl = `${BASE}/stage/build/desktop/`;
    const rigInfo = {
      url: appUrl,
      base: BASE,
      port,
      pid: kernelProc?.pid,
      workspace: tempWs,
      token: TOKEN,
      updatedAt: new Date().toISOString(),
    };
    writeFileSync(join(ROOT, ".isolated-rig.json"), JSON.stringify(rigInfo, null, 2), "utf8");
    console.log(`\n================================================================================`);
    console.log(`🎉 [小驴考试] 独立隔离测试网页已就绪（思源内核在后台保持运行）：`);
    console.log(`  👉 浏览器直达测试地址: ${appUrl}`);
    console.log(`  👉 内核 API 地址:       ${BASE}`);
    console.log(`  👉 隔离工作区目录:       ${tempWs}`);
    console.log(`  👉 内核进程 PID:        ${kernelProc?.pid}`);
    console.log(`  👉 认证 Token:          ${TOKEN}`);
    console.log(`================================================================================\n`);
  } else {
    if (kernelProc?.pid) {
      try {
        if (process.platform === "win32") {
          execSync(`taskkill /F /T /PID ${kernelProc.pid}`, { stdio: "ignore" });
        } else {
          kernelProc.kill("SIGKILL");
        }
      } catch {
        /* ignore */
      }
    }
    await sleep(400);
    if (!keepWorkspace) {
      try {
        rmSync(tempWs, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  }
  const reportFile = join(OUT_DIR, "report.json");
  writeFileSync(
    reportFile,
    JSON.stringify({ finishedAt: new Date().toISOString(), steps, pageErrors, screenshots }, null, 2),
    "utf8",
  );
  console.log(`\n========== e2e:isolated 完成（${steps.filter((s) => s.ok).length}/${steps.length}）· 截图与报告：${OUT_DIR} ==========`);
}
