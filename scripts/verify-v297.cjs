/**
 * v2.9.7 快速面验收（桌面端 1728×1080，不跑新流水线，仅 5 次 TTS 真实配音，视频 noop 零配额）：
 *
 * P0-1 noop 视频任务秒级落败：既有项目一键渲染，本批新视频任务全部落定 < 15s
 *     （修复前同批 ~7 分钟）、attempts 全 = 1（确定性失败零重试）、失败原因含贴片指引
 *     （批次落定 toast 的双场景验收在 verify-v297-batch.cjs——不在此重复，
 *      避免同项目无关在途任务（如流水线定妆照）拖长「全部落定」等待）
 * P1-4 占位模式文案：提交回执为「秒级落定 + 贴片指引」口径；成片面失败行给贴片去向
 * P1-6 断线重进：项目库载入 → 刷新自动恢复现场 + toast；另起新片清键回空态
 * P1-5 任务中心溢出计数：>12 任务显示「还有 N 个」
 *
 * 判定基线：会话态以「另起新片」按钮为标记（仅会话存在时渲染，营销文案零撞车）。
 * 前置：dev server 已在 localhost:3000 运行；项目库存在在制项目。
 * 夹具自包含（v2.9.9）：项目库无「v297回归夹具」在制项目时自动零配额重建，
 * 不再依赖手动跑 fixture-pending-project.cjs（亦避免误渲染用户真实项目）。
 * 用法：node scripts/verify-v297.cjs
 */
const { chromium } = require("playwright");
const { execSync } = require("child_process");

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
      await sleep(500);
    }
    return false;
  };
  const inSession = async () =>
    (await page.getByRole("button", { name: /另起新片/ }).count()) > 0;

  // ===== 0. 夹具自检：无「v297回归夹具」在制项目则零配额自动重建（v2.9.9）=====
  const fixtureReady = await (async () => {
    const r = await fetch(BASE + "/api/projects").then((x) => x.json());
    return (r?.data ?? []).some(
      (p) => p.status === "inProduction" && (p.title ?? "").includes("v297回归夹具")
    );
  })();
  if (!fixtureReady) {
    console.log("夹具缺失：零配额重建 15 镜待出片项目（fixture-pending-project.cjs）…");
    execSync("node scripts/fixture-pending-project.cjs", { stdio: "inherit" });
    await sleep(2000);
  }

  // ===== 0.5 冷启动：清 localStorage，无恢复 toast、无会话 =====
  await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 90000 });
  await sleep(3000);
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "domcontentloaded" });
  await sleep(2500);
  let body = await bodyText();
  ok("冷启动：无恢复 toast（localStorage 为空）", !body.includes("已恢复上次拍摄现场"));
  ok("冷启动：空态无会话（无另起新片按钮）", !(await inSession()));

  // ===== 1. 项目库载入夹具在制项目（toast「项目已载入」为载入完成信号） =====
  await page.getByRole("button", { name: "项目库" }).click({ timeout: 10000 });
  await sleep(1500);
  // 精确定位夹具项目（标题含专属标记，不误触用户真实项目）；15 镜未合成才有渲染按钮
  await page.locator('div[role="button"]').filter({ hasText: "v297回归夹具" }).first().click({ timeout: 8000 });
  ok("项目库：载入在制项目（项目已载入 toast）", await waitText("项目已载入", 20000));
  await sleep(1000);
  ok("项目库：载入后会话就位", await inSession());
  const pid = await page.evaluate(() => localStorage.getItem("drama-workshop:last-project"));
  ok("P1-6 载入即写恢复键", typeof pid === "string" && pid.length > 5, pid ?? "");

  // ===== 2. P1-6 断线重进：刷新 → 自动恢复 =====
  await page.reload({ waitUntil: "domcontentloaded" });
  ok("P1-6 恢复 toast：已恢复上次拍摄现场", await waitText("已恢复上次拍摄现场", 15000));
  await sleep(1500);
  ok("P1-6 恢复后会话就位（另起新片按钮可见）", await inSession());

  // ===== 3. 一键渲染全片：P0-1 秒级落败 + P0-3 批次播报 =====
  // 先记录既有任务 id，落定判定只看本批新任务（防旧失败任务假阳性）
  const beforeIds = new Set(
    (await page.evaluate(async (id) => {
      const r = await fetch(`/api/projects/${id}/tasks`).then((x) => x.json());
      return (r?.data ?? []).map((t) => t.id);
    }, pid)) ?? []
  );
  await page.getByRole("button", { name: /一键渲染全片/ }).first().click({ timeout: 10000 });
  ok("P1-4 提交回执：占位模式口径（秒级落定 + 贴片指引）", await waitText("占位模式：视频任务秒级落定", 10000));

  const t0 = Date.now();
  let settled = false;
  while (Date.now() - t0 < 30000) {
    const ts = await page.evaluate(async (id) => {
      const r = await fetch(`/api/projects/${id}/tasks`).then((x) => x.json());
      return r?.data ?? [];
    }, pid);
    const fresh = ts.filter((x) => !beforeIds.has(x.id));
    const vids = fresh.filter((x) => x.kind === "video");
    if (vids.length >= 5 && vids.every((x) => x.status !== "queued" && x.status !== "running")) {
      settled = true;
      const retried = vids.filter((x) => x.attempts > 1).length;
      const guided = vids.filter(
        (x) => (x.error ?? "").includes("粘贴成片地址") || (x.error ?? "").includes("贴片")
      ).length;
      const ms = Date.now() - t0;
      ok("P0-1 noop 视频任务秒级落定（<15s）", ms < 15000, `${(ms / 1000).toFixed(1)}s / ${vids.length} 镜`);
      ok("P0-1 确定性失败零重试（attempts 全 =1）", retried === 0, `retried=${retried}`);
      ok("P0-1 失败原因含贴片指引", guided === vids.length, `${guided}/${vids.length}`);
      break;
    }
    await sleep(500);
  }
  if (!settled) ok("P0-1 noop 视频任务秒级落定（<15s）", false, "30s 内未全部落定");
  body = await bodyText();
  ok("P1-4 成片面失败行：占位待处理 + 贴片入库指引（视频秒败即时可见）", body.includes("占位模式下待处理") && body.includes("贴片入库"));

  // ===== 4. 任务中心溢出计数（切到剧组进程页签后可见） =====
  await page.getByRole("tab", { name: "剧组进程" }).click({ timeout: 8000 });
  await sleep(1200);
  body = await bodyText();
  ok("P1-5 任务中心溢出计数（还有 N 个）", body.includes("个任务未展示"));

  // ===== 5. 另起新片：清键回空态 =====
  await page.getByRole("button", { name: /另起新片/ }).click({ timeout: 10000 });
  ok("另起新片：toast", await waitText("已另起新片", 8000));
  await sleep(1000);
  body = await bodyText();
  const keyAfter = await page.evaluate(() => localStorage.getItem("drama-workshop:last-project"));
  ok("另起新片：清恢复键", keyAfter === null, String(keyAfter));
  ok("另起新片：回到新片空态", !(await inSession()) && body.includes("全组开机 · AI 剧组流水线"));

  const pass = checks.filter(([, p]) => p).length;
  console.log(`\n结果：${pass}/${checks.length} 通过`);
  if (errors.length) {
    console.log("pageerror:");
    errors.forEach((e) => console.log("  " + e));
  }
  await browser.close();
  process.exit(pass === checks.length && errors.length === 0 ? 0 : 1);
})();
