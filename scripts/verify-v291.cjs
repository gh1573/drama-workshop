/** v2.9.1 修复验证：落地页（版本徽标/示例成片）+ 成片页签（口径说明行） */
const { chromium } = require("playwright");
const fs = require("node:fs");
const SHOTS = "/tmp/verify-shots";
fs.mkdirSync(SHOTS, { recursive: true });

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1728, height: 1080 } });
  const page = await ctx.newPage();
  await page.goto("http://localhost:3000", { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SHOTS}/v-home.png` });
  const badge = await page.getByText("DRAMA STUDIO v2.9.1").first().isVisible().catch(() => false);
  console.log(badge ? "PASS 版本徽标 v2.9.1" : "FAIL 版本徽标");

  await page.getByRole("button", { name: "项目库" }).click({ timeout: 10000 });
  await page.waitForSelector('[role="dialog"]', { timeout: 10000 });
  const card = page.locator('[role="dialog"] [role="button"]').filter({ hasText: "战神逆袭" }).first();
  await card.click({ timeout: 10000 });
  await page.waitForTimeout(3000);
  const cutTab = page.getByRole("tab", { name: /成片/ }).first();
  await cutTab.click().catch(() => {});
  await page.waitForTimeout(1800);
  const explainer = await page
    .getByText(/本版成片由/)
    .first()
    .isVisible()
    .catch(() => false);
  console.log(explainer ? "PASS 成片口径说明行" : "FAIL 成片口径说明行");
  await page.screenshot({ path: `${SHOTS}/v-cut.png` });
  await browser.close();
})();
