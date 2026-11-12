/**
 * v2.7.1 首页视觉走查截图采集（空态 1440x900 / 1728x1080 + 会话态）
 * 用法：node scripts/capture-home.cjs
 */
const { chromium } = require("playwright");
const fs = require("node:fs");

const BASE = "http://localhost:3000";
const SHOTS = "/tmp/home-shots";
fs.mkdirSync(SHOTS, { recursive: true });

(async () => {
  const browser = await chromium.launch();
  for (const vp of [
    { name: "1440", width: 1440, height: 900 },
    { name: "1728", width: 1728, height: 1080 },
  ]) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const page = await ctx.newPage();
    await page.goto(BASE, { waitUntil: "networkidle", timeout: 60000 });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${SHOTS}/home-empty-${vp.name}.png` });

    // 移动端
    if (vp.name === "1440") {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.waitForTimeout(800);
      await page.screenshot({ path: `${SHOTS}/home-empty-mobile.png`, fullPage: true });
    }
    await ctx.close();
  }

  // 会话态（载入种子项目）
  const ctx = await browser.newContext({ viewport: { width: 1728, height: 1080 } });
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: "networkidle", timeout: 60000 });
  await page.getByRole("button", { name: "项目库" }).click({ timeout: 10000 });
  await page.waitForSelector('[role="dialog"]', { timeout: 10000 });
  await page.waitForTimeout(1200);
  const card = page.locator('[role="dialog"] [role="button"]').filter({ hasText: "战神逆袭" });
  await card.first().click();
  await page.waitForTimeout(3500);
  await page.screenshot({ path: `${SHOTS}/home-session-cut.png` });
  await page.getByRole("tab", { name: /节奏轨道/ }).click({ timeout: 10000 });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${SHOTS}/home-session-rhythm.png` });
  await browser.close();

  console.log("shots:", fs.readdirSync(SHOTS).join(", "));
})().catch((e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});
