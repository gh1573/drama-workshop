/**
 * v2.9.7 端到端旅程验收·播报面（桌面端 1728×1080，真实 LLM/图像，视频 noop 零配额）：
 *
 * P2   试笔秒表：「已进行 Ns」出现且递增（活性信号，防「卡死」误判）
 * P0-2 运行终态播报：全组杀青 toast（此前完全静默——用户在别的页签只看到按钮禁用）
 * 承接 试笔→开机：过稿剧本主 CTA（keepScript 沿用）→ 开机 toast → 观测提示
 *
 * 前置：dev server 已在 localhost:3000 运行。
 * 用法：node scripts/verify-v297-journey.cjs
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

  // ===== 0. 冷启动 =====
  await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 90000 });
  await sleep(3000);
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "domcontentloaded" });
  await sleep(2000);

  // ===== 1. 试笔：秒表出现且递增 =====
  await page.getByRole("button", { name: "填充示例梗概" }).click({ timeout: 10000 });
  await page.getByRole("button", { name: /先试笔 · 只推演剧本/ }).click({ timeout: 10000 });
  ok("P2 试笔：秒表行出现（已进行 Ns）", await waitText("已进行", 12000));
  await sleep(2600);
  const t1 = await bodyText();
  await sleep(2200);
  const t2 = await bodyText();
  const grab = (s) => parseInt((s.match(/已进行 (\d+)s/) || [])[1] ?? "-1", 10);
  ok("P2 试笔：秒表递增（活性信号）", grab(t2) > grab(t1) && grab(t1) >= 0, `${grab(t1)}s → ${grab(t2)}s`);

  // ===== 2. 试笔完成（真实 LLM）→ 过稿开机承接 =====
  ok("试笔：完成 toast", await waitText("分镜推演完成", 150000));
  const bootBtn = page.getByRole("button", { name: /全组开机 · 按已过目剧本拍摄/ });
  await bootBtn.waitFor({ state: "visible", timeout: 10000 });
  ok("承接：过稿剧本开机主 CTA 常驻", true);

  // ===== 3. 开机 → 观测 → 终态 =====
  await bootBtn.click({ timeout: 10000 });
  ok("开机：剧组已开机 toast", await waitText("剧组已开机", 15000));
  ok("开机：拍摄中观测提示（勿离开 + 可恢复）", await waitText("全组拍摄中", 15000));

  const pid = await page.evaluate(() => localStorage.getItem("drama-workshop:last-project"));
  ok("开机：恢复键写入（断线重进承接）", typeof pid === "string" && pid.length > 5, pid ?? "");

  let runStatus = "running";
  const runDeadline = Date.now() + 300000;
  while (Date.now() < runDeadline) {
    runStatus = await page.evaluate(async (id) => {
      const r = await fetch(`/api/projects/${id}`).then((x) => x.json());
      return r?.data?.activeRun?.status ?? "unknown";
    }, pid);
    if (runStatus !== "running") break;
    await sleep(2500);
  }
  ok("流水线终态 = succeeded（真实编剧/选角/拆镜/锚定/成包）", runStatus === "succeeded", runStatus);
  ok("P0-2 运行终态播报：全组杀青 toast", await waitText("全组杀青", 10000));

  const pass = checks.filter(([, p]) => p).length;
  console.log(`\n结果：${pass}/${checks.length} 通过`);
  if (errors.length) {
    console.log("pageerror:");
    errors.forEach((e) => console.log("  " + e));
  }
  await browser.close();
  process.exit(pass === checks.length && errors.length === 0 ? 0 : 1);
})();
