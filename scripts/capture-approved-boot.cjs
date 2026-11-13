/**
 * v2.9.6 试笔→开机转化承接 视觉采集（零外部通道）：
 * mock POST /api/generate 直接返回演示项目剧本（试笔零 LLM 成本），
 * 采集：①试笔后左列（首次开机主 CTA 常驻）②改梗概后（诚实翻转态）
 * 用法：node scripts/capture-approved-boot.cjs
 */
const { chromium } = require("playwright");
const fs = require("node:fs");

const SHOTS = "/tmp/audit-v296";
fs.mkdirSync(SHOTS, { recursive: true });

(async () => {
  const browser = await chromium.launch();
  const ctx = browser.newContext
    ? await browser.newContext({ viewport: { width: 1728, height: 1080 } })
    : null;
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));

  // 借演示项目剧本做试笔 mock 响应（零 LLM）
  const detailRes = await page.request.get(
    "http://localhost:3000/api/projects/cmwea3xq40002jbar4pipbb27"
  );
  const detail = (await detailRes.json()).data;

  await page.route("**/api/generate", async (route) => {
    await route.fulfill({
      json: { ok: true, data: { storyBeats: detail.storyBeats } },
    });
  });

  await page.goto("http://localhost:3000", { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(1500);

  await page.getByRole("button", { name: "填充示例梗概" }).click({ timeout: 8000 });
  await page.getByRole("button", { name: /先试笔 · 只推演剧本/ }).click({ timeout: 8000 });
  await page
    .getByRole("button", { name: /全组开机 · 按已过目剧本拍摄/ })
    .waitFor({ state: "visible", timeout: 30000 });
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${SHOTS}/12-trial-firstboot.png` });
  console.log("shot: 12-trial-firstboot");

  // 改梗概 → 诚实翻转态
  await page.getByRole("button", { name: /调整题材\/梗概/ }).click({ timeout: 8000 });
  await page.waitForTimeout(500);
  await page.locator("#synopsis-input").fill("赘婿隐忍三年，今日寿宴当众清算，反派跪地求饶，龙王身份震动全场！");
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${SHOTS}/13-trial-flip.png` });
  console.log("shot: 13-trial-flip");

  if (errors.length) console.log("ERRORS:\n" + errors.join("\n"));
  else console.log("no page errors");
  await browser.close();
})();
