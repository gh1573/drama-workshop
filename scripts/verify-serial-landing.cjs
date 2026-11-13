/**
 * v2.9.4 连载身份落地页表达验证（桌面端）：
 * 1. 示例成片徽标「示例实产 · 第 1 集」
 * 2. 语境条两行（实产系列第 1 集 / 一键续写下一集）
 * 3. 亮点卡连载文案仍在（回归不破坏）
 * 用法：node scripts/verify-serial-landing.cjs
 */
const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1728, height: 1080 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("http://localhost:3000", { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(1500);
  const body = await page.locator("body").innerText();

  const checks = [
    ["徽标：示例实产 · 第 1 集", body.includes("示例实产 · 第 1 集")],
    /* v2.9.6：语境条升级为输入→输出因果链（同款梗概 · 默认快拍机组实产），
       连载身份表达（系列第 1 集 / 一键续写下一集）保留 */
    ["语境条：同款梗概 · 默认快拍机组实产", body.includes("同款梗概 · 默认快拍机组实产")],
    ["语境条：系列第 1 集", body.includes("系列第 1 集")],
    ["语境条：一键续写下一集", body.includes("并可一键续写下一集")],
    ["回归：亮点卡连载文案", body.includes("系列连载 · 一键续集")],
    ["回归：EP.01 徽标保留", body.includes("EP.01")],
    ["回归：mono 技术行保留", body.includes("片头卡 / 字幕 / 配音 / 转场 / 调色")],
  ];
  let fail = 0;
  for (const [name, ok] of checks) {
    console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
    if (!ok) fail++;
  }
  console.log("pageerror:", errors.length ? errors.join("; ") : "none");
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
