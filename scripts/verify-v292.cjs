/**
 * v2.9.2 批次 4+5 验证：交付可达性 + 分析→行动闭环
 *  1) 项目库卡片交付入口（成片/制作包，仅成片已合成项目出现）
 *  2) 资产库页成片入口条 + 点击跳成片页签
 *  3) 节奏页达标清单渲染（演示数据全达标态：4×达标、零行动按钮）
 */
const { chromium } = require("playwright");

const BASE = "http://localhost:3000";

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1728, height: 1080 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const results = [];
  const check = (name, ok) => results.push(`${ok ? "PASS" : "FAIL"} ${name}`);

  await page.goto(BASE, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(1200);

  // —— 1. 项目库卡片交付入口 ——
  await page.getByRole("button", { name: "项目库" }).click({ timeout: 10000 });
  await page.waitForSelector('[role="dialog"]', { timeout: 10000 });
  await page.waitForTimeout(1000);
  const dlChip = await page.locator('[role="dialog"] a:has-text("成片")').first().isVisible().catch(() => false);
  check("项目卡「成片」下载入口可见", dlChip);
  const pkgChip = await page.locator('[role="dialog"] a:has-text("制作包")').first().isVisible().catch(() => false);
  check("项目卡「制作包」下载入口可见", pkgChip);
  // 成片链接指向真实资产
  const href = await page.locator('[role="dialog"] a:has-text("成片")').first().getAttribute("href");
  const dlStatus = href ? await page.evaluate((u) => fetch(u, { method: "HEAD" }).then((r) => r.status), href) : 0;
  check(`成片链接可达（${href} → ${dlStatus}）`, dlStatus === 200);
  // 点击交付入口不触发载入（stopPropagation 语义）
  await page.locator('[role="dialog"] a:has-text("制作包")').first().click({ timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(800);
  const stillOnHome = page.url() === BASE + "/";
  check("点交付入口不离开当前页（不误触载入）", stillOnHome);
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);

  // 载入演示项目
  await page.getByRole("button", { name: "项目库" }).click({ timeout: 10000 });
  await page.waitForSelector('[role="dialog"]', { timeout: 10000 });
  await page.locator('[role="dialog"] div[role="button"]').filter({ hasText: "演示第一集" }).first().click({ timeout: 10000 });
  await page.waitForTimeout(2500);

  // —— 2. 资产库页成片入口条 ——
  await page.getByRole("tab", { name: /资产/ }).first().click({ timeout: 10000 });
  await page.waitForTimeout(1000);
  const bar = await page.getByText("本集成片已就绪", { exact: false }).first().isVisible().catch(() => false);
  check("资产页成片入口条可见", bar);
  await page.getByText("去成片 →", { exact: false }).first().click({ timeout: 10000 });
  await page.waitForTimeout(800);
  const cutActive = await page.getByRole("tab", { name: /成片/ }).first().getAttribute("data-state");
  check("点击入口条切到成片页签", cutActive === "active");

  // —— 3. 节奏页达标清单（全达标态） ——
  await page.getByRole("tab", { name: /节奏/ }).first().click({ timeout: 10000 });
  await page.waitForTimeout(1000);
  const okCount = await page.getByText("达标", { exact: true }).count();
  check(`达标清单 4 项全达标（实测 ${okCount}）`, okCount >= 4);
  const actionBtns = await page.getByText(/^去 (AI 拆解|分镜表|剧本)/).count();
  check("全达标态不渲染行动按钮", actionBtns === 0);

  if (errors.length) console.log("[console errors]\n" + errors.slice(0, 6).join("\n"));
  console.log(results.join("\n"));
  await browser.close();
  process.exit(results.some((r) => r.startsWith("FAIL")) ? 1 : 0);
})();
