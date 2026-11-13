/**
 * v2.9.7 批次落定播报验收（P0-3 收口）：
 *
 * 场景 A（成功播报）：载入仍有活跃定妆照任务的项目 → 接管观测 → 全部落定时
 *   「渲染任务完成 · N 项」toast（此前任务结果静默躺在任务中心）
 * 场景 B（失败播报）：单镜渲染（noop 秒败）→ 「本批渲染 1 项未成功」toast
 *   + 占位指引 + 首条原因
 *
 * 前置：dev server 运行中；目标项目存在（15 片段、部分定妆照在途或已完成）。
 * 用法：node scripts/verify-v297-batch.cjs
 */
const { chromium } = require("playwright");

const BASE = "http://localhost:3000";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1728, height: 1080 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  const checks = [];
  const ok = (name, pass, extra = "") => {
    checks.push([name, pass]);
    console.log(`${new Date().toISOString().slice(11, 19)} ${pass ? "PASS" : "FAIL"}  ${name}${extra ? `  [${extra}]` : ""}`);
  };
  const bodyText = () => page.locator("body").innerText();
  const waitText = async (text, timeout = 30000) => {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const t = await bodyText();
      if (t.includes(text)) return true;
      await sleep(600);
    }
    return false;
  };

  await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 90000 });
  await sleep(3000);
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "domcontentloaded" });
  await sleep(2000);

  // ===== 载入 15 片段在制项目 =====
  await page.getByRole("button", { name: "项目库" }).click({ timeout: 10000 });
  await sleep(1500);
  await page.locator('div[role="button"]').filter({ hasText: "15 片段" }).filter({ hasText: /制作中/ }).first().click({ timeout: 8000 });
  ok("载入在制项目", await waitText("项目已载入", 20000));
  const pid = await page.evaluate(() => localStorage.getItem("drama-workshop:last-project"));

  // ===== 场景 A：接管观测中的活跃定妆照 → 成功播报 =====
  const activeAtLoad = await page.evaluate(async (id) => {
    const r = await fetch(`/api/projects/${id}/tasks`).then((x) => x.json());
    return (r?.data ?? []).filter((t) => t.status === "queued" || t.status === "running").length;
  }, pid);
  if (activeAtLoad > 0) {
    ok(`场景A前提：载入时 ${activeAtLoad} 个任务在途（接管观测）`, true);
    ok("P0-3 成功播报：渲染任务完成 · N 项", await waitText("渲染任务完成", 360000));
  } else {
    console.log("场景A跳过：载入时已无在途任务（此前批次已落定，无迁移可播报）");
  }

  // ===== 场景 B：单镜渲染（noop 秒败）→ 失败播报 =====
  await page.getByRole("tab", { name: "分镜剧本" }).click({ timeout: 8000 });
  await sleep(800);
  // 展开第一场，找首个可渲染镜头（未就绪且有最终提示词）
  await page.locator('button, [role="button"]').filter({ hasText: /第 ?0?1|场 1/ }).first().click({ timeout: 5000 }).catch(() => {});
  await sleep(800);
  const renderBtn = page.locator('button[aria-label="渲染此镜"]').first();
  await renderBtn.click({ timeout: 10000 });
  ok("单镜渲染：占位口径提交回执", await waitText("已提交渲染", 10000));
  ok("P0-3 失败播报：本批渲染 1 项未成功", await waitText("本批渲染 1 项未成功", 30000));
  const body = await bodyText();
  ok("P0-3 播报含占位指引与首条原因", (body.includes("逐镜贴片") || body.includes("启用真机通道")) && body.includes("首条原因"));

  const pass = checks.filter(([, p]) => p).length;
  console.log(`\n结果：${pass}/${checks.length} 通过`);
  if (errors.length) {
    console.log("pageerror:");
    errors.forEach((e) => console.log("  " + e));
  }
  await browser.close();
  process.exit(pass === checks.length && errors.length === 0 ? 0 : 1);
})();
