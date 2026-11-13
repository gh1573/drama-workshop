/**
 * v2.9.18 失败横幅 amber 自动续拍徽标——真实态视觉验证（状态猎手）
 *
 * 轮询 run 状态，捕捉「failed + error 带承诺标记」的等待窗（45~180s 宽），
 * 立即以真实用户方式载入工作台（localStorage 注入 + reload）截图，
 * 断言徽标文字「后自动续拍」与「无需值守」真实渲染。
 *
 * 用法：node scripts/verify-auto-resume-badge.mjs <projectId> [预算秒，默认 600]
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = "http://localhost:3000";
const projectId = process.argv[2];
const BUDGET_MS = Number(process.argv[3] ?? 600) * 1000;
if (!projectId) {
  console.error("用法: node verify-auto-resume-badge.mjs <projectId> [预算秒]");
  process.exit(2);
}
mkdirSync("/tmp/uxwalk/badge", { recursive: true });

const ts = () => new Date().toISOString().slice(11, 19);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getRun() {
  const res = await fetch(`${BASE}/api/projects/${projectId}/runs`);
  const body = await res.json();
  return (body.data ?? [])[0];
}

console.log(`[${ts()}] 状态猎手：等待 failed+承诺标记 窗口（预算 ${BUDGET_MS / 1000}s）`);
const t0 = Date.now();
let run;
while (Date.now() - t0 < BUDGET_MS) {
  run = await getRun();
  if (run?.status === "failed" && /后自动续拍第 \d+\/\d+ 轮/.test(run.error ?? "")) break;
  if (run?.status === "succeeded") {
    console.log(`[${ts()}] run 已杀青——无需徽标验证（顺滑路径）`);
    process.exit(0);
  }
  await sleep(4000);
}

if (!run || run.status !== "failed" || !/后自动续拍第 \d+\/\d+ 轮/.test(run.error ?? "")) {
  console.log(`[${ts()}] 预算内未捕捉到等待窗（末态 ${run?.status}）`);
  process.exit(1);
}
console.log(`[${ts()}] 捕捉到等待窗：${String(run.error).slice(-40)}`);

// 真实用户方式进入工作台
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1728, height: 1080 } });
await ctx.addInitScript((pid) => {
  window.localStorage.setItem("drama-workshop:last-project", pid);
}, projectId);
const page = await ctx.newPage();
await page.goto(BASE, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(6000); // 等 run 轮询刷新 + 面板渲染

await page.screenshot({ path: "/tmp/uxwalk/badge/waiting-window.png", fullPage: false });

const bodyText = await page.evaluate(() => document.body.innerText);
const checks = [
  ["amber 徽标文字·自动续拍", /后自动续拍（第 \d\/\d 轮）/.test(bodyText)],
  ["amber 徽标文字·无需值守", bodyText.includes("无需值守")],
  ["失败原因仍在（限流人话）", bodyText.includes("AI 创作通道繁忙")],
  ["人工续拍按钮在位", bodyText.includes("断点续拍")],
  ["剧组日志播报在位", /自动续拍（第 \d 轮，无人值守）|后自动续拍（第/.test(bodyText)],
];
let failed = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
  if (!ok) failed++;
}
console.log(`ASSERTIONS: ${checks.length - failed}/${checks.length} passed`);
await browser.close();
process.exit(failed === 0 ? 0 : 1);
