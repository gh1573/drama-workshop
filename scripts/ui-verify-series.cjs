/**
 * v2.9 连载产品化 UI 走查：载入系列第 1 集 → 成片页「续写下一集」→ 弹窗 → 项目库分组
 * 用法：node scripts/ui-verify-series.cjs
 */
const { chromium } = require("playwright");
const fs = require("node:fs");

const BASE = "http://localhost:3000";
const SHOTS = "/tmp/series-shots";
fs.mkdirSync(SHOTS, { recursive: true });

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1728, height: 1080 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => m.type() === "error" && errors.push("console: " + m.text()));

  const results = [];
  const check = (name, ok) => {
    results.push(`${ok ? "PASS" : "FAIL"} ${name}`);
    if (!ok) process.exitCode = 1;
  };

  await page.goto(BASE, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(1200);

  // 打开项目库
  await page.getByRole("button", { name: "项目库" }).click({ timeout: 10000 });
  await page.waitForSelector('[role="dialog"]', { timeout: 10000 });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${SHOTS}/01-library-series.png` });

  // 系列分组 + 续写按钮存在
  const seriesHeader = await page.locator('[role="dialog"] li', { hasText: "连载" }).first().isVisible().catch(() => false);
  check("项目库系列分组可见", seriesHeader);
  const contBtn = page.locator('[role="dialog"] button', { hasText: "续写" }).first();
  check("分组「续写」按钮存在", await contBtn.isVisible().catch(() => false));

  // 载入第 1 集（系列组内第一张卡）
  const ep1 = page.locator('[role="dialog"] [role="button"]', { hasText: "第 1 集" }).first();
  await ep1.click({ timeout: 10000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${SHOTS}/02-session-ep1.png` });

  // 信息卡连载徽标
  const badge = await page.getByText("战神逆袭 · 第 1 集", { exact: false }).first().isVisible().catch(() => false);
  check("信息卡连载徽标「系列 · 第 1 集」", badge);

  // 成片页签：续写下一集按钮
  const nextBtn = page.getByRole("button", { name: "续写下一集" });
  check("成片页「续写下一集」CTA", await nextBtn.isVisible().catch(() => false));

  // 打开续写弹窗
  await nextBtn.click();
  await page.waitForTimeout(800);
  const dialogVisible = await page.locator('[role="dialog"]', { hasText: "续写" }).isVisible().catch(() => false);
  check("续写弹窗打开（继承说明 + 梗概输入）", dialogVisible);
  await page.screenshot({ path: `${SHOTS}/03-next-episode-dialog.png` });

  // 输入梗概并提交（走 series 入口或项目入口，由组件决定）
  await page.locator('[role="dialog"] textarea').fill("婚书风波后主角身份彻底曝光，反派背后势力浮出水面，一场更大的阴谋正在逼近。");
  await page.locator('[role="dialog"] button', { hasText: "创建第" }).click();
  // 等待会话切换（新集标题出现）
  await page.waitForTimeout(4000);
  await page.screenshot({ path: `${SHOTS}/04-after-create.png` });
  const newEpBadge = await page.getByText("第 3 集", { exact: false }).first().isVisible().catch(() => false);
  check("新集创建后自动切会话（第 3 集徽标可见）", newEpBadge);

  console.log(results.join("\n"));
  if (errors.length) console.log("\n[console errors]\n" + errors.slice(0, 8).join("\n"));
  await browser.close();
})();
