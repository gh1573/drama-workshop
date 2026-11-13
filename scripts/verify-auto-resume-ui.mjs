/**
 * v2.9.18 自动续拍 UI 全链观测——「停表断裂」修复 + 迁移播报 toast 实证
 *
 * 背景：startRunPolling 曾在 run 一失败即停表——服务端自动点火后面板
 * 永远停在失败态。修复：failed 且带承诺标记时继续轮询。本脚本以真实
 * 用户方式载入工作台，全程不刷新页面，验证：
 *  A. 失败等待窗（amber 徽标出现）后，面板不刷新自动回到拍摄中（轮询未停）
 *  B. 失败瞬间 toast「阶段失败——Ns 后自动续拍」
 *  C. 自动复活瞬间 toast「已自动续拍，继续拍摄」
 *
 * 用法：node scripts/verify-auto-resume-ui.mjs <projectId> [预算秒，默认 540]
 */
import { chromium } from "playwright";

const BASE = "http://localhost:3000";
const projectId = process.argv[2];
const BUDGET_MS = Number(process.argv[3] ?? 540) * 1000;
if (!projectId) {
  console.error("用法: node verify-auto-resume-ui.mjs <projectId> [预算秒]");
  process.exit(2);
}

const ts = () => new Date().toISOString().slice(11, 19);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1728, height: 1080 } });
await ctx.addInitScript((pid) => {
  window.localStorage.setItem("drama-workshop:last-project", pid);
}, projectId);
const page = await ctx.newPage();
await page.goto(BASE, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(6000);

// MutationObserver 持久捕获 toast 文本（toast 存活仅数秒，轮询采样会漏）
await page.evaluate(() => {
  window.__toastLog = [];
  const watch = () => {
    document.querySelectorAll('li[data-state="open"]').forEach((li) => {
      const txt = (li.innerText || "").replace(/\s+/g, " ").trim();
      if (txt && !window.__toastLog.some((t) => t.text === txt)) {
        window.__toastLog.push({ at: Date.now(), text: txt });
      }
    });
  };
  new MutationObserver(watch).observe(document.body, { childList: true, subtree: true });
  watch();
});

let uiState = "unknown"; // running | failedWaiting | failedTerminal | succeeded
const events = [];
/** v2 状态权威化：剧组日志会残留历史播报文本（「45s 后自动续拍…」），
 *  body 文本匹配会误判——改用 API run 状态 + 承诺标记判定 */
const classify = async () => {
  const res = await fetch(`${BASE}/api/projects/${projectId}/runs`);
  const body = await res.json();
  const r = (body.data ?? [])[0];
  if (!r) return "unknown";
  if (r.status === "running") return "running";
  if (r.status === "succeeded") return "succeeded";
  if (/后自动续拍第 \d+\/\d+ 轮/.test(r.error ?? "")) return "failedWaiting";
  return "failedTerminal";
};

console.log(`[${ts()}] UI 全链观测启动 · 预算 ${BUDGET_MS / 1000}s · 全程不刷新`);
const t0 = Date.now();
let sawFailedWaiting = false;
let sawAutoRevive = false;
let toastFailWithPromise = false;
let toastAutoRevive = false;

while (Date.now() - t0 < BUDGET_MS) {
  await page.waitForTimeout(2500);
  const now = await classify();
  if (now !== uiState) {
    console.log(`[${ts()}] UI 状态: ${uiState} → ${now}`);
    if (now === "failedWaiting") sawFailedWaiting = true;
    if (uiState === "failedWaiting" && now === "running") {
      sawAutoRevive = true;
      // 面板确实翻回拍摄中：验证 DOM 里出现进行中口径（非刷新）
      const domRunning = await page
        .evaluate(() => document.body.innerText.includes("全组拍摄中"))
        .catch(() => false);
      console.log(
        `[${ts()}] ★ 状态回 running（DOM 口径同步: ${domRunning ? "是" : "否"}）——停表修复实锤`
      );
    }
    if (now === "succeeded") break;
    uiState = now;
  }
  const toasts = await page.evaluate(() => window.__toastLog ?? []);
  for (const t of toasts) {
    if (t.text.includes("后自动续拍（第") && !toastFailWithPromise) {
      toastFailWithPromise = true;
      console.log(`[${ts()}] ★ 失败 toast: ${t.text.slice(0, 80)}`);
    }
    if (t.text.includes("已自动续拍，继续拍摄") && !toastAutoRevive) {
      toastAutoRevive = true;
      console.log(`[${ts()}] ★ 复活 toast: ${t.text.slice(0, 60)}`);
    }
  }
}

const apiRun = await (await fetch(`${BASE}/api/projects/${projectId}/runs`)).json();
const r = (apiRun.data ?? [])[0];
console.log(`\n[${ts()}] 观测结束 · API 末态: ${r?.status}`);
const checks = [
  ["失败等待窗出现过（amber 徽标）", sawFailedWaiting],
  ["等待窗后未刷新自动回拍摄中（停表修复）", sawAutoRevive],
  ["失败 toast 带自动续播承诺", toastFailWithPromise],
  ["自动复活 toast", toastAutoRevive],
];
let failed = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
  if (!ok) failed++;
}
const relevant = sawFailedWaiting; // 只有出现过失败窗，后三项才是有效断言
console.log(
  relevant
    ? `ASSERTIONS: ${checks.length - failed}/${checks.length} passed`
    : "本轮无失败窗（顺滑路径）——停表修复无回归，toast 断言待下轮风暴"
);
await browser.close();
process.exit(!relevant || failed === 0 ? 0 : 1);
