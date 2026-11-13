/** v2.9.9 交付面视觉抽检：落地页 / 工作台 / 剧组进程 / 成片（1728×1080，零生成配额） */
const { chromium } = require("playwright");
const BASE = "http://localhost:3000";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1728, height: 1080 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));

  // 1. 落地页（空态新用户首屏）
  await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 90000 });
  await sleep(3500);
  await page.screenshot({ path: "/tmp/render/shot-landing.png" });

  // 2. 项目库载入种子项目 → 工作台
  await page.getByRole("button", { name: "项目库" }).click({ timeout: 10000 });
  await sleep(1500);
  await page.locator('div[role="button"]').filter({ hasText: "演示第一集" }).first().click({ timeout: 8000 });
  await sleep(4000);
  await page.screenshot({ path: "/tmp/render/shot-workbench.png", fullPage: false });

  // 3. 剧组进程页签
  await page.getByRole("tab", { name: "剧组进程" }).click({ timeout: 8000 });
  await sleep(2000);
  await page.screenshot({ path: "/tmp/render/shot-crew.png" });

  // 4. 成片页签
  await page.getByRole("tab", { name: "成片" }).click({ timeout: 8000 });
  await sleep(2500);
  await page.screenshot({ path: "/tmp/render/shot-final.png" });

  console.log("pageerror:", errors.length ? errors.join(" | ") : "none");
  await browser.close();
})();
