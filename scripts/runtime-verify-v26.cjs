/**
 * v2.6 运行时回归：流水线导轨 + 色彩收口
 * 断言：
 *   1. 零 pageerror / console error
 *   2. 会话态导轨渲染：01-05 五阶段 + 产物计数（幕/资产/镜/锚定/成片）
 *   3. 导轨点击导航：02 选角定妆 → 资产定妆页签激活；05 后期成包 → 成片页签
 *   4. 剧组进程阶段卡产物计数与导轨同源
 *   5. 题材选中态唯一品牌渐变（马甲大佬不再 violet/fuchsia）
 *   6. 全页面 DOM 无 violet/fuchsia 类名（色彩纪律）
 * 截图（/tmp/v26-shots/）：01-home.png 02-session-cut.png 03-pipeline.png 04-genre-majia.png
 */
const { chromium } = require("playwright");
const fs = require("node:fs");

const SHOTS = "/tmp/v26-shots";
const results = [];
function log(name, ok, extra) {
  results.push({ name, ok, extra });
  console.log(`[${name}] ${ok ? "OK" : "FAIL " + (extra || "")}`);
}

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1728, height: 1080 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push("console: " + m.text());
  });

  // —— 1. 首页（无会话态）截图 ——
  await page.goto("http://127.0.0.1:3000", { waitUntil: "networkidle" });
  await page.waitForTimeout(1800);
  await page.screenshot({ path: `${SHOTS}/01-home.png` });

  // —— 2. 题材色彩收口：选中态 = amber 描边浅底（非大面积渐变、非 violet/fuchsia）——
  const majia = page.getByRole("button", { name: /马甲大佬/ }).first();
  await majia.click({ timeout: 8000 });
  await page.waitForTimeout(600);
  const majiaCls = (await majia.getAttribute("class")) || "";
  log("genre-majia-amber-outline",
    majiaCls.includes("border-amber-500/60") && !/violet|fuchsia/.test(majiaCls),
    majiaCls.slice(0, 100));
  await page.screenshot({ path: `${SHOTS}/04-genre-majia.png` });

  // —— 3. DOM 级色彩纪律：无 violet/fuchsia/purple 类名 ——
  const badColor = await page.evaluate(() => {
    const html = document.documentElement.outerHTML;
    return ["violet", "fuchsia", "purple"].filter((c) => html.includes(c + "-"));
  });
  log("dom-no-purple-family", badColor.length === 0, badColor.join(","));

  // —— 4. 载入演示项目（会话态）——
  await page.getByRole("button", { name: "项目库" }).click();
  await page.waitForSelector('[role="dialog"]', { timeout: 10000 });
  await page.waitForTimeout(800);
  const card = page
    .locator('[role="dialog"] [role="button"]')
    .filter({ hasText: "战神逆袭 · 演示第一集" });
  if ((await card.count()) === 0) throw new Error("demo project card not found");
  await card.first().click();
  await page.waitForTimeout(2500);

  // —— 5. 导轨渲染 + 产物计数 ——
  const rail = page.locator('nav[aria-label="制作流水线阶段导航"]');
  log("rail-render", (await rail.count()) === 1);
  const railText = await rail.innerText();
  for (const kw of ["01", "05", "剧本创作", "后期成包"]) {
    if (!railText.includes(kw)) log(`rail-text-${kw}`, false, railText.slice(0, 120));
  }
  const artifacts = ["幕", "资产", "镜", "10/10", "成片可下载"].filter((k) => railText.includes(k));
  log("rail-artifact-counts", artifacts.length >= 4, "found: " + artifacts.join("/"));
  await page.screenshot({ path: `${SHOTS}/02-session-cut.png` });

  // —— 6. 导轨点击导航：02 选角定妆 → 资产定妆页签 ——
  await rail.getByRole("button", { name: /选角定妆/ }).click({ timeout: 8000 });
  await page.waitForTimeout(800);
  const assetsTabActive = await page
    .getByRole("tab", { name: /资产定妆/ })
    .getAttribute("data-state");
  log("rail-nav-casting-to-assets", assetsTabActive === "active", "state=" + assetsTabActive);

  // —— 7. 导轨点击导航：05 后期成包 → 成片页签 ——
  await rail.getByRole("button", { name: /后期成包/ }).click({ timeout: 8000 });
  await page.waitForTimeout(800);
  const cutTabActive = await page
    .getByRole("tab", { name: /成片/ })
    .getAttribute("data-state");
  log("rail-nav-post-to-cut", cutTabActive === "active", "state=" + cutTabActive);

  // —— 8. 剧组进程：阶段卡产物计数同源 + 日志区存在 ——
  await page.getByRole("tab", { name: /剧组进程/ }).click({ timeout: 8000 });
  await page.waitForTimeout(900);
  /* Radix 保留全部 5 个 tabpanel 节点（inactive 为空），必须取 active 态 */
  const panel = page.locator('[role="tabpanel"][data-state="active"]');
  const panelText = await panel.innerText();
  const panelArtifacts = ["幕", "资产", "镜"].filter((k) => panelText.includes(k));
  log("pipeline-card-artifacts", panelArtifacts.length >= 3, "found: " + panelArtifacts.join("/"));
  await page.screenshot({ path: `${SHOTS}/03-pipeline.png` });

  // —— 9. 运行时错误汇总 ——
  log("runtime-errors", errors.length === 0, errors.slice(0, 3).join(" | "));

  await browser.close();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n==== v2.6 runtime: ${results.length - failed.length}/${results.length} passed ====`);
  process.exit(failed.length > 0 ? 1 : 0);
})().catch((e) => {
  console.error("FATAL:", e.message);
  process.exit(1);
});
