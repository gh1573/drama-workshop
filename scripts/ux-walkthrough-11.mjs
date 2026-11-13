// 走查 v11 —— factory 修复后复测：重试日志必须落库
import { chromium } from 'playwright';
import { appendFileSync } from 'fs';
const TL = '/tmp/uxwalk/tl11.jsonl';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1728, height: 1080 } });
const page = await ctx.newPage();
page.setDefaultTimeout(15000);
await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(2500);
const nb = page.locator('button').filter({ hasText: '另起新片' }).first();
if (await nb.count()) { await nb.click(); await page.waitForTimeout(1000); }
await page.locator('button, [role=button], div[class*=cursor-pointer]').filter({ hasText: '都市神豪' }).first().click({ timeout: 8000 });
await page.waitForTimeout(600);
const fb = page.locator('button').filter({ hasText: '填充示例梗概' }).first();
if (await fb.count()) { await fb.click(); await page.waitForTimeout(500); }
const t0 = Date.now();
await page.locator('button').filter({ hasText: /全组开机/ }).first().click();
console.log('clicked');
for (let i = 0; i < 54; i++) {
  await page.waitForTimeout(10000);
  const t = Math.round((Date.now()-t0)/1000);
  const b = (await page.locator('body').textContent() || '').replace(/\s+/g,' ');
  const prog = b.match(/(\d{1,3}%)\s*·\s*当前[:：]\s*([^\s，。]{2,10})/);
  const retryLog = b.match(/Xs 后自动重试（第 \d+ 轮）/g) || b.match(/\d+s 后自动重试/g);
  console.log(`t+${t}s ${prog ? prog[0].slice(0,26) : '读不到'} 重试日志=${retryLog ? retryLog.length : 0}`);
  appendFileSync(TL, JSON.stringify({t, prog: prog?.[0], retryLogs: retryLog})+'\n');
  if (i===5) await page.screenshot({ path: '/tmp/uxwalk/110-retrylog.png' });
  if (/全片杀青|制作包已就绪/.test(b)) { console.log('>>> 杀青!'); await page.screenshot({path:'/tmp/uxwalk/111-success.png'}); break; }
  if (/阶段失败/.test(b)) { console.log('>>> 失败'); await page.screenshot({path:'/tmp/uxwalk/111-failed.png'}); break; }
}
browser.close();
console.log('walk11 done');
