/**
 * v2.7 场次化剧本术语回归（零配额，本地 dev）：
 * 载入种子演示项目 → 各页签断言「场」话术 / 零「三幕|第N幕」残留 / 零运行时错误。
 * 用法：node scripts/runtime-verify-v27.cjs
 */
const { chromium } = require("playwright");

const BASE = "http://localhost:3000";
const SHOTS = "/tmp/v27";
const fs = require("node:fs");
fs.mkdirSync(SHOTS, { recursive: true });

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.new_page ? ctx.new_page() : await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });

  const results = [];
  const log = (name, pass, detail = "") =>
    results.push(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? "  | " + detail : ""}`);

  await page.goto(BASE, { waitUntil: "networkidle", timeout: 60000 });

  // 1. 首页无三幕话术
  const homeText = await page.locator("body").innerText();
  log("home-no-sanmu", !/三幕|第\s*\d+\s*幕/.test(homeText));
  log("home-has-cichang", homeText.includes("场次"), "footer+副路径");

  // 2. 打开项目库 → 载入演示项目
  await page.getByRole("button", { name: "项目库" }).click({ timeout: 10000 });
  await page.waitForSelector('[role="dialog"]', { timeout: 10000 });
  await page.waitForTimeout(1200);
  const card = page.locator('[role="dialog"] [role="button"]').filter({ hasText: "战神逆袭" });
  log("library-card-scene-count", (await card.count()) >= 1 && (await card.innerText()).includes("场"));
  await card.first().click();
  await page.waitForTimeout(3500);
  await page.screenshot({ path: `${SHOTS}/01-cut.png` });

  // 3. 分镜剧本页签：场次卡
  await page.getByRole("tab", { name: /分镜剧本/ }).click({ timeout: 10000 });
  await page.waitForTimeout(1200);
  const scriptText = await page.locator("body").innerText();
  log("script-act-cards", scriptText.includes("【第 01 场】"), "act-card 标签");
  log("script-no-mu", !/第\s*\d+\s*幕/.test(scriptText));
  await page.screenshot({ path: `${SHOTS}/02-script.png` });

  // 4. 节奏轨道页签：场次时间占比 + 5 类功能
  await page.getByRole("tab", { name: /节奏轨道/ }).click({ timeout: 10000 });
  await page.waitForTimeout(1200);
  const rhythmText = await page.locator("body").innerText();
  log("rhythm-scene-ratio", rhythmText.includes("场次时间占比"));
  log("rhythm-no-sanmu", !rhythmText.includes("三幕"));
  log("rhythm-no-mu-label", !/第\s*\d+\s*幕/.test(rhythmText));
  await page.screenshot({ path: `${SHOTS}/03-rhythm.png` });

  // 5. 剧组进程页签：阶段产物计数用「场」
  await page.getByRole("tab", { name: /剧组进程/ }).click({ timeout: 10000 });
  await page.waitForTimeout(1200);
  const pipelineText = await page.locator("body").innerText();
  log("pipeline-artifact-scene", /\d+\s*场/.test(pipelineText));
  log("pipeline-journal-scene", pipelineText.includes("场次推演完成"), "seed 日志");
  log("pipeline-no-sanmu", !pipelineText.includes("三幕"));
  await page.screenshot({ path: `${SHOTS}/04-pipeline.png` });

  // 6. 分镜剧本页签内的分镜表（场次分组）
  await page.getByRole("tab", { name: /分镜剧本/ }).click({ timeout: 10000 });
  await page.waitForTimeout(1000);
  const trackText = await page.locator("body").innerText();
  log("timeline-scene-group", trackText.includes("场分组") || /第\s*\d+\s*场/.test(trackText));
  log("timeline-no-mu", !/第\s*\d+\s*幕/.test(trackText));
  await page.screenshot({ path: `${SHOTS}/05-timeline.png` });

  log("zero-runtime-errors", errors.length === 0, errors.slice(0, 3).join(" || "));

  console.log(results.join("\n"));
  const failed = results.filter((r) => r.startsWith("FAIL")).length;
  console.log(`\n${failed === 0 ? "== ALL PASS ==" : "== " + failed + " FAILED =="}`);
  await browser.close();
  process.exit(failed === 0 ? 0 : 1);
})().catch((e) => {
  console.error("SCRIPT ERROR:", e);
  process.exit(2);
});
