/**
 * v2.9.15 连续剧创作路径落地页表达验证（桌面端）：
 * 1. 示例成片徽标「示例实产 · 第 1 集」
 * 2. 语境条（实产连续剧第 1 集 / 创作路径延续）
 * 3. 亮点卡连续剧文案仍在（回归不破坏）
 * v2.9.15 叙事校准：不是「连载续写第 2 集」，是连续剧的创作路径——
 * 每一集都是一次完整开机，路径从第 1 集一直延伸下去
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
       v2.9.15：连续剧身份表达（连续剧第 1 集 / 创作路径延续） */
    ["语境条：同款梗概 · 默认快拍机组实产", body.includes("同款梗概 · 默认快拍机组实产")],
    ["语境条：连续剧第 1 集", body.includes("连续剧第 1 集")],
    ["语境条：创作路径延续", body.includes("每一集都走这条创作路径")],
    ["回归：亮点卡连续剧文案", body.includes("连续剧创作路径")],
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
