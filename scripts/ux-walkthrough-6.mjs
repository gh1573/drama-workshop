// 用户视角走查 v6 —— 修复后全组开机复测：心跳/重试日志/人性化错误
import { chromium } from 'playwright';
import { mkdirSync, appendFileSync } from 'fs';

const BASE = 'http://localhost:3000';
const SHOTS = '/tmp/uxwalk';
mkdirSync(SHOTS, { recursive: true });
const TL = `${SHOTS}/tl6.jsonl`;
const note = (sev, where, what) => {
  const l = `[${sev}] ${where} :: ${what}`;
  appendFileSync(TL, l + '\n'); console.log(l);
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1728, height: 1080 } });
const page = await ctx.newPage();
page.setDefaultTimeout(15000);

await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(2500);

// 新会话：另起新片（若已有会话）→ 选题材 → 填梗概
const newBtn = page.locator('button').filter({ hasText: '另起新片' }).first();
if (await newBtn.count()) {
  await newBtn.click();
  await page.waitForTimeout(1000);
}
await page.locator('button, [role=button], div[class*=cursor-pointer]').filter({ hasText: '马甲大佬' }).first().click({ timeout: 8000 });
await page.waitForTimeout(600);
const fillBtn = page.locator('button').filter({ hasText: '填充示例梗概' }).first();
if (await fillBtn.count()) { await fillBtn.click(); await page.waitForTimeout(500); }

const launch = page.locator('button').filter({ hasText: /全组开机/ }).first();
const t0 = Date.now();
await launch.click();
console.log('clicked');
// 等 toast「剧组已开机」
await page.waitForTimeout(1500);
const early = (await page.locator('body').textContent() || '').replace(/\s+/g, ' ');
console.log('toast 开机:', early.match(/剧组已开机[^】]{0,50}/)?.[0]?.slice(0, 60) || '(未见)');

// 观察循环：记录进度 %、阶段、journal 增量；每 10s 打印一次，直到终态（≤ 9 分钟）
let lastJournalLen = 0;
let done = false;
for (let i = 0; i < 54; i++) {
  await page.waitForTimeout(10000);
  const t = Math.round((Date.now() - t0) / 1000);
  const bodyTxt = (await page.locator('body').textContent() || '').replace(/\s+/g, ' ');
  const prog = bodyTxt.match(/(\d{1,3}%)\s*·\s*当前[:：]\s*([^\s，。]{2,10})/);
  // journal 条目：从剧组进程面板抓时间戳行
  const journals = bodyTxt.match(/\d{2}:\d{2}:\d{2}\s*(编剧|制片|导演|场记|后期|选角)\s*[^；]{5,70}/g) || [];
  const fresh = journals.filter(j => !j.includes('正式开机') || true);
  console.log(`t+${t}s ${prog ? `${prog[1]} ${prog[2]}` : '进度未读'} journal行=${journals.length}`);
  appendFileSync(TL, JSON.stringify({ t, prog: prog?.[0], journals: journals.slice(0, 4) }) + '\n');
  if (i === 2 || i === 10) await page.screenshot({ path: `${SHOTS}/50-mid-${i}.png` });
  if (/全片杀青|制作包已就绪/.test(bodyTxt)) { note('INFO', '终态', '杀青'); await page.screenshot({ path: `${SHOTS}/51-success.png` }); done = true; break; }
  if (/阶段失败|流水线失败|中断/.test(bodyTxt)) {
    const errText = bodyTxt.match(/阶段失败[^（]{0,80}/)?.[0] || bodyTxt.match(/中断[^。]{0,80}/)?.[0];
    note('P1', '失败态', `失败文案: ${errText}`);
    await page.screenshot({ path: `${SHOTS}/51-failed.png` });
    done = true; break;
  }
}
if (!done) note('P1', '时长', '9 分钟未到终态');
browser.close();
console.log('walk6 done');
