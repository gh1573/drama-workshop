// 用户视角走查 v7 —— 失败后断点续拍反馈实测（恢复动线）
import { chromium } from 'playwright';
import { appendFileSync } from 'fs';

const BASE = 'http://localhost:3000';
const SHOTS = '/tmp/uxwalk';
const TL = `${SHOTS}/tl7.jsonl`;
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

// 会话恢复：上次失败的 run 应还在（断线重进恢复自愈 v2.9.12）
const body0 = (await page.locator('body').textContent() || '').replace(/\s+/g, ' ');
const hasResume = /断点续拍/.test(body0);
console.log('失败态可见断点续拍按钮:', hasResume);
await page.screenshot({ path: `${SHOTS}/60-resume-ready.png` });

const resume = page.locator('button').filter({ hasText: /断点续拍/ }).first();
if (!hasResume || !(await resume.count())) {
  note('P1', '恢复动线', '进入页面未见断点续拍按钮（可能恢复了成功项目或会话丢失）');
  browser.close(); process.exit(0);
}

const t0 = Date.now();
await resume.click();
console.log('clicked 断点续拍');
await page.waitForTimeout(1200);
const early = (await page.locator('body').textContent() || '').replace(/\s+/g, ' ');
console.log('点击后 toast/状态:', early.match(/(已续拍|断点续拍|正在|拍摄中|重试)[^。]{0,40}/g)?.slice(0, 3).join(' § '));

// 观察到终态（≤ 8 分钟）
for (let i = 0; i < 48; i++) {
  await page.waitForTimeout(10000);
  const t = Math.round((Date.now() - t0) / 1000);
  const bodyTxt = (await page.locator('body').textContent() || '').replace(/\s+/g, ' ');
  const prog = bodyTxt.match(/(\d{1,3}%)\s*·\s*当前[:：]\s*([^\s，。]{2,10})/);
  console.log(`t+${t}s ${prog ? `${prog[1]} ${prog[2]}` : '进度未读'}`);
  appendFileSync(TL, JSON.stringify({ t, prog: prog?.[0] }) + '\n');
  if (i === 3) await page.screenshot({ path: `${SHOTS}/61-resume-mid.png` });
  if (/全片杀青|制作包已就绪/.test(bodyTxt)) { note('INFO', '终态', '续拍杀青'); await page.screenshot({ path: `${SHOTS}/62-resume-success.png` }); break; }
  if (/阶段失败/.test(bodyTxt)) { note('P1', '续拍失败', bodyTxt.match(/阶段失败[^（]{0,60}/)?.[0]); await page.screenshot({ path: `${SHOTS}/62-resume-failed.png` }); break; }
}
browser.close();
console.log('walk7 done');
