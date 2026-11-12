/**
 * v2.7.1 UI 修复回归：CTA 常显 + 下载动作上移 + 题材徽标中性化
 * 用法：node scripts/runtime-verify-v271.cjs
 */
const { chromium } = require("playwright");
const fs = require("node:fs");
const SHOTS = "/tmp/v271";
fs.mkdirSync(SHOTS, { recursive: true });
const BASE = "http://localhost:3000";

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1728, height: 1080 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  const results = [];
  const log = (name, pass, detail = "") =>
    results.push(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? "  | " + detail : ""}`);

  // 1. 空态：主 CTA 不再禁用（梗概为空也保持品牌渐变醒目态）
  //    v2.8：双开机入口——左栏品牌渐变主 CTA + 右栏导览 amber 次 CTA（VLM P3：空态视线落点缺显式开机入口）
  await page.goto(BASE, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(1200);
  const cta = page.getByRole("button", { name: /全组开机/ });
  log("cta-visible", (await cta.count()) >= 1);
  log("cta-dual-entry", (await cta.count()) === 2, "左栏主 CTA + 右栏导览次 CTA");
  const ctaDisabled = await cta.first().isDisabled();
  log("cta-not-disabled-by-synopsis", !ctaDisabled, "空梗概下仍可点击，校验交给 toast");
  await page.screenshot({ path: `${SHOTS}/01-empty-cta.png` });

  // 2. 点击空梗概 CTA → 应弹 toast 而非无响应
  await cta.first().click();
  await page.waitForTimeout(1200);
  const toastVisible = await page.locator("text=梗概太短").count();
  log("cta-click-validates-toast", toastVisible >= 1);
  await page.screenshot({ path: `${SHOTS}/02-cta-toast.png` });

  // 3. 载入种子项目 → 成片页：下载 CTA 紧随播放器（视口内可见）
  await page.keyboard.press("Escape").catch(() => {});
  await page.waitForTimeout(600);
  await page.getByRole("button", { name: "项目库" }).click({ timeout: 10000 });
  await page.waitForSelector('[role="dialog"]', { timeout: 10000 });
  await page.waitForTimeout(1200);
  const card = page.locator('[role="dialog"] [role="button"]').filter({ hasText: "战神逆袭" });
  await card.first().click();
  await page.waitForTimeout(3500);
  const dl = page.getByRole("link", { name: /下载成片 MP4/ });
  log("download-cta-exists", (await dl.count()) === 1);
  if ((await dl.count()) === 1) {
    const box = await dl.first().boundingBox();
    const vp = page.viewportSize();
    log(
      "download-cta-in-viewport",
      !!box && box.y + box.height <= vp.height && box.y >= 0,
      box ? `y=${Math.round(box.y)} h=${Math.round(box.height)} vp=${vp.height}` : "no box"
    );
    // 播放器与下载 CTA 的相对位置：CTA 应在后期风格块之前
    const styleBlock = page.locator("text=后期风格").first();
    const styleBox = await styleBlock.boundingBox();
    log(
      "download-cta-above-poststyle",
      !!box && !!styleBox && box.y < styleBox.y,
      `cta.y=${box ? Math.round(box.y) : "?"} style.y=${styleBox ? Math.round(styleBox.y) : "?"}`
    );
  }
  await page.screenshot({ path: `${SHOTS}/03-session-cut.png` });

  // 4. 题材徽标中性化：直接定位工程信息卡内的题材徽标节点
  const genreBadge = page.locator("span, div").filter({ hasText: /^战神逆袭 · 龙王归来$/ }).first();
  const badgeClass = await genreBadge.getAttribute("class").catch(() => "");
  log("genre-badge-neutral", !badgeClass.includes("bg-gradient"), `class=${(badgeClass || "").slice(0, 60)}`);

  // 5. 状态三层去重：成片下载行不再带绿勾图标（正文纯文本）
  const mergedLine = page.locator("p").filter({ hasText: /已合入成片/ }).first();
  const mergedHtml = await mergedLine.innerHTML().catch(() => "");
  log("merged-line-no-check-icon", !mergedHtml.includes("svg"), mergedHtml.slice(0, 50));

  log("zero-runtime-errors", errors.length === 0, errors.slice(0, 2).join(" || "));

  console.log(results.join("\n"));
  const failed = results.filter((r) => r.startsWith("FAIL")).length;
  console.log(`\n${failed === 0 ? "== ALL PASS ==" : "== " + failed + " FAILED =="}`);
  await browser.close();
  process.exit(failed === 0 ? 0 : 1);
})().catch((e) => {
  console.error("SCRIPT ERROR:", e.message);
  process.exit(2);
});
