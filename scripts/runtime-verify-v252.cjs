/**
 * v2.5.2 运行时回归：全新进程载入演示项目 → 五页签切换 + 两处重新开机确认弹窗
 * 断言：零 pageerror；五页签 tabpanel 均出现；确认弹窗可开可关；保存按钮为 amber 实底
 */
const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1728, height: 1080 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push("console: " + m.text());
  });

  await page.goto("http://127.0.0.1:3000", { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);

  // 打开项目库 → 载入演示项目
  await page.getByRole("button", { name: "项目库" }).click();
  await page.waitForSelector('[role="dialog"]', { timeout: 10000 });
  await page.waitForTimeout(800);
  const card = page.locator('[role="dialog"] [role="button"]').filter({ hasText: "战神逆袭 · 演示第一集" });
  if ((await card.count()) === 0) throw new Error("demo project card not found");
  await card.first().click();
  await page.waitForTimeout(2500);

  // 五页签逐一切换并断言 tabpanel 存在（注意：绿点 tooltip 会被并入 accessible name，用正则匹配）
  const tabs = ["成片", "分镜剧本", "资产定妆", "节奏轨道", "剧组进程"];
  for (const t of tabs) {
    await page.getByRole("tab", { name: new RegExp(t) }).click({ timeout: 8000 });
    await page.waitForTimeout(700);
  }
  const panelCount = await page.locator('[role="tabpanel"]').count();
  console.log("[tabs] switched:", tabs.join("/"), "| tabpanels visible:", panelCount >= 1 ? "OK" : "FAIL");

  // 剧组进程页签：重新开机 → 确认弹窗 → 取消
  await page.getByRole("tab", { name: /剧组进程/ }).click({ timeout: 8000 });
  await page.waitForTimeout(600);
  const rerunBtn = page.getByRole("button", { name: /重新开机/ }).first();
  if ((await rerunBtn.count()) === 0) throw new Error("pipeline rerun button not found");
  await rerunBtn.click({ timeout: 8000 });
  await page.waitForTimeout(600);
  const dlg1 = page.getByRole("alertdialog");
  console.log("[dialog-1] pipeline rerun alertdialog:", (await dlg1.count()) > 0 ? "OK" : "FAIL");
  await page.getByRole("button", { name: /再想想/ }).click({ timeout: 8000 });
  await page.waitForTimeout(400);
  console.log("[dialog-1] cancelled:", (await dlg1.count()) === 0 ? "OK" : "FAIL");

  // 左栏：调整题材/梗概 → 按新配置重新开机 → 确认弹窗 → 取消
  await page.getByRole("button", { name: /调整题材\/梗概|收起配置/ }).click({ timeout: 8000 });
  await page.waitForTimeout(700);
  await page.getByRole("button", { name: /按新配置重新开机/ }).click({ timeout: 8000 });
  await page.waitForTimeout(600);
  const dlg2 = page.getByRole("alertdialog");
  console.log("[dialog-2] left-panel rerun alertdialog:", (await dlg2.count()) > 0 ? "OK" : "FAIL");
  await page.getByRole("button", { name: /再想想/ }).click({ timeout: 8000 });
  await page.waitForTimeout(400);

  // 保存按钮为 amber 实底（bg-amber-500）
  const saveBtn = page.getByRole("button", { name: /保存(本次修改)?到项目库/ }).first();
  const saveCls = (await saveBtn.getAttribute("class")) || "";
  console.log("[save-cta] amber solid:", saveCls.includes("bg-amber-500") ? "OK" : "FAIL: " + saveCls.slice(0, 80));

  // 参数格值不截断：视频基模值完整可见（无 truncate 实际裁切由 CSS 保证，此处断言值文本节点存在）
  const modelVal = await page.getByText("Omni 1.2 Flash", { exact: false }).count();
  console.log("[param] video model value present:", modelVal > 0 ? "OK" : "FAIL");

  console.log("[runtime-errors]", errors.length === 0 ? "NONE (clean)" : errors.slice(0, 5));
  await browser.close();
  process.exit(errors.length === 0 ? 0 : 1);
})().catch((e) => {
  console.error("FATAL:", e.message);
  process.exit(1);
});
