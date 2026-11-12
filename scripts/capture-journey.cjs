/**
 * v2.9.1 全局产品走查截图采集——完整用户旅程：
 * 落地页(空态+锚点) → 项目库 → 载入会话(六页签) → 移动端
 * 用法：node scripts/capture-journey.cjs
 */
const { chromium } = require("playwright");
const fs = require("node:fs");

const BASE = "http://localhost:3000";
const SHOTS = "/tmp/journey-shots";
fs.mkdirSync(SHOTS, { recursive: true });

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1728, height: 1080 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => m.type() === "error" && errors.push("console: " + m.text().slice(0, 200)));

  // 1. 落地页首屏
  await page.goto(BASE, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SHOTS}/01-home-fold.png` });

  // 2. 落地页滚动锚点（示例成片区）
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight * 0.35));
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${SHOTS}/02-home-mid.png` });

  // 3. 落地页底部（步骤卡+亮点+底条）
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${SHOTS}/03-home-bottom.png` });

  // 4. 项目库抽屉
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByRole("button", { name: "项目库" }).click({ timeout: 10000 });
  await page.waitForSelector('[role="dialog"]', { timeout: 10000 });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${SHOTS}/04-library.png` });

  // 5. 载入种子项目 → 剧组进程页签
  const card = page.locator('[role="dialog"] [role="button"]').filter({ hasText: "战神逆袭" }).first();
  await card.click({ timeout: 10000 });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${SHOTS}/05-session-pipeline.png` });

  // 6. 剧本页签
  const tabScript = page.getByRole("tab", { name: /剧本/ }).first();
  if (await tabScript.isVisible().catch(() => false)) {
    await tabScript.click();
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${SHOTS}/06-tab-script.png` });
  }

  // 7. 资产库页签
  const tabAssets = page.getByRole("tab", { name: /资产/ }).first();
  if (await tabAssets.isVisible().catch(() => false)) {
    await tabAssets.click();
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${SHOTS}/07-tab-assets.png` });
  }

  // 8. 分镜页签（可能在剧本页签内，跳过找不到时）
  const tabBoard = page.getByRole("tab", { name: /分镜|故事板/ }).first();
  if (await tabBoard.isVisible().catch(() => false)) {
    await tabBoard.click();
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${SHOTS}/08-tab-board.png` });
  }

  // 9. 节奏页签
  const tabRhythm = page.getByRole("tab", { name: /节奏/ }).first();
  if (await tabRhythm.isVisible().catch(() => false)) {
    await tabRhythm.click();
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${SHOTS}/09-tab-rhythm.png` });
  }

  // 10. 成片页签
  const tabCut = page.getByRole("tab", { name: /成片/ }).first();
  if (await tabCut.isVisible().catch(() => false)) {
    await tabCut.click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${SHOTS}/10-tab-cut.png` });
  }

  // 11. 移动端落地页（390 视口，全页）
  const mctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const mpage = await mctx.newPage();
  await mpage.goto(BASE, { waitUntil: "networkidle", timeout: 60000 });
  await mpage.waitForTimeout(1500);
  await mpage.screenshot({ path: `${SHOTS}/11-home-mobile-full.png`, fullPage: true });
  await mctx.close();

  console.log("SHOTS:", fs.readdirSync(SHOTS).join(", "));
  console.log("ERRORS:", errors.length ? errors.join("\n") : "none");
  await browser.close();
})();
