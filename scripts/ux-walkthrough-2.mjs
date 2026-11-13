// 用户视角走查 v2 —— 全组开机全流程：重点盯「盲转圈」与过程反馈
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'fs';

const BASE = 'http://localhost:3000';
const SHOTS = '/tmp/uxwalk';
mkdirSync(SHOTS, { recursive: true });

const log = [];
function note(sev, where, what) {
  const line = `[${sev}] ${where} :: ${what}`;
  log.push(line); console.log(line);
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1728, height: 1080 } });
const page = await ctx.newPage();

// 网络监听：记录 POST 请求与响应时长
const apiCalls = [];
page.on('request', r => {
  if (r.url().includes('/api/') && r.method() !== 'GET')
    apiCalls.push({ url: r.url().replace(BASE, ''), method: r.method(), t0: Date.now() });
});
page.on('response', r => {
  const c = apiCalls.find(x => x.url === r.url().replace(BASE, '') && !x.status);
  if (c) { c.status = r.status(); c.ms = Date.now() - c.t0; }
});

await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 });

// ---------- 1. 用户选题材 + 填梗概 ----------
const genre = page.locator('button, [role=button], div').filter({ hasText: '战神逆袭' }).first();
await genre.click({ timeout: 5000 });
console.log('题材已选');

// 填充示例梗概按钮（用户可能自己写，也可能用示例）
const fillBtn = page.locator('button').filter({ hasText: '填充示例梗概' }).first();
if (await fillBtn.count()) {
  await fillBtn.click();
  await page.waitForTimeout(300);
  const val = await page.locator('textarea').first().inputValue().catch(() => '');
  console.log(`梗概字数: ${val.length}`);
  if (!val.length) note('P1', '填充示例梗概', '点击后梗概仍为空——按钮无效或目标错位');
}

await page.screenshot({ path: `${SHOTS}/10-before-launch.png` });

// ---------- 2. 点「全组开机」，开始计时盯反馈 ----------
const launch = page.locator('button').filter({ hasText: '全组开机' }).first();
if (!(await launch.count())) {
  note('P0', '全组开机', '找不到主按钮');
  await browser.close(); process.exit(1);
}

const tLaunch = Date.now();
await launch.click();
console.log('已点击全组开机');

// 盯 60 秒：每 2s 记录一次页面关键状态（按钮文案 / 进度条 / 流水线面板文字）
const snap = [];
for (let i = 0; i < 45; i++) {
  await page.waitForTimeout(2000);
  const btnText = await launch.textContent().catch(() => '(gone)');
  const bodyTxt = (await page.locator('body').textContent() || '').replace(/\s+/g, ' ');
  // 抓进度相关关键词
  const m = bodyTxt.match(/(正在|进行中|运行中|排队|等待|生成中|创作中|拆镜中|开机|progress|%\s*完成|完成度)[^。]{0,40}/g);
  snap.push({ t: Math.round((Date.now() - tLaunch) / 1000), btn: (btnText || '').trim().slice(0, 40), cues: (m || []).slice(0, 3).join(' § ') });
  const cur = snap[snap.length - 1];
  console.log(`t+${cur.t}s btn="${cur.btn}" cues="${cur.cues}"`);
  // 若出现明显的终态文案则提前结束
  if (/全组杀青|流水线完成|制作完成|已完成|查看成片|进入工作台/.test(bodyTxt) && i > 3) { console.log('>>> 检测到终态文案'); break; }
  if (page.url() !== BASE + '/') { console.log('>>> 跳转到', page.url()); break; }
}

await page.screenshot({ path: `${SHOTS}/11-after-launch.png` });

// 慢请求汇总
const slow = apiCalls.filter(c => (c.ms ?? 0) > 5000 || c.status === undefined);
for (const c of slow) note(c.status === undefined ? 'P0' : 'P1', 'API', `${c.method} ${c.url} status=${c.status} ${c.ms ?? '>pending'}ms`);

writeFileSync(`${SHOTS}/launch-timeline.json`, JSON.stringify(snap, null, 2));
console.log('\n===== 发现 =====');
for (const l of log) console.log(l);
await browser.close();
