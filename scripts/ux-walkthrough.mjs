// 用户视角端到端走查 v1 —— 模拟真实新用户，桌面 1728x1080
// 记录每个体验断点：盲转圈 / 看不懂 / 无反馈 / 阻碍
import { chromium } from 'playwright';

const BASE = 'http://localhost:3000';
const SHOTS = '/tmp/uxwalk';
import { mkdirSync } from 'fs';
mkdirSync(SHOTS, { recursive: true });

const findings = [];
function note(sev, where, what) {
  findings.push({ sev, where, what });
  console.log(`[${sev}] ${where} :: ${what}`);
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1728, height: 1080 } });
const page = await ctx.newPage();

// 收集网络里的"慢请求"，用于识别用户点击后无反馈的异步动作
let pending = new Map();
page.on('request', r => { if (r.method() !== 'GET') pending.set(r.url(), Date.now()); });
page.on('response', r => { if (pending.has(r.url())) pending.delete(r.url()); });
page.on('requestfailed', r => { pending.delete(r.url()); });

const t0 = Date.now();
async function step(name, fn) {
  const s = Date.now();
  try { await fn(); console.log(`OK  ${name} (${Date.now() - s}ms)`); }
  catch (e) { note('P0', name, `步骤失败: ${e.message.split('\n')[0]}`); }
}

// ---------- 1. 落地页第一印象 ----------
await step('落地页加载', async () => {
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 });
  await page.screenshot({ path: `${SHOTS}/01-landing.png` });
});

await step('落地页可懂度', async () => {
  const h1 = await page.locator('h1').first().textContent().catch(() => null);
  const buttons = await page.locator('button, a').allTextContents();
  console.log('H1:', (h1 || '').trim().slice(0, 60));
  console.log('CTA:', buttons.map(b => b.trim()).filter(Boolean).slice(0, 12).join(' | '));
  if (!h1 || !h1.trim()) note('P1', '落地页', '无主标题，新用户不知这是什么产品');
});

// ---------- 2. 新用户主线：找入口 ----------
let entered = false;
await step('点击主 CTA 进入', async () => {
  // 优先找「新建/开始/进入」类按钮
  const cands = page.locator('button, a').filter({ hasText: /新建|开始|进入|创建|打开|工作台|创作|示例/ }).first();
  if (await cands.count()) {
    await cands.click({ timeout: 5000 });
    await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${SHOTS}/02-after-cta.png` });
    entered = true;
    console.log('URL after CTA:', page.url());
  } else {
    note('P1', '落地页', '找不到清晰的主入口按钮');
  }
});

if (entered) {
  await page.screenshot({ path: `${SHOTS}/03-current-view.png` });
  const bodyText = (await page.locator('body').textContent() || '').slice(0, 400);
  console.log('页面概览:', bodyText.replace(/\s+/g, ' ').slice(0, 200));
}

// 输出未完成请求（点击后一直挂着 = 盲转圈证据）
setTimeout(() => {
  const now = Date.now();
  for (const [url, ts] of pending) {
    if (now - ts > 8000) note('P0', '网络层', `请求 >8s 未返回: ${url.slice(0, 120)}`);
  }
}, 9000);

console.log('\n===== 走查发现汇总 =====');
for (const f of findings) console.log(JSON.stringify(f));
await browser.close();
