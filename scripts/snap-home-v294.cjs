const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1728, height: 1080 } });
  const page = await ctx.newPage();
  await page.goto("http://localhost:3000", { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(1500);
  // 示例成片区（手机 mockup）
  await page.getByText("示例 · 实产").scrollIntoViewIfNeeded({ timeout: 10000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: "/tmp/snap-mockup.png" });
  // 亮点卡区
  await page.getByText("连续剧创作路径").first().scrollIntoViewIfNeeded({ timeout: 10000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: "/tmp/snap-props.png" });
  await browser.close();
  console.log("done");
})();
