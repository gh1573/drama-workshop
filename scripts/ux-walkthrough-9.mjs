// 走查 v9 —— 断点续拍点击反馈与到终态
import { chromium } from 'playwright';
import { appendFileSync } from 'fs';
const TL = '/tmp/uxwalk/tl9.jsonl';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1728, height: 1080 } });
const page = await ctx.newPage();
page.setDefaultTimeout(15000);
await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(2500);
// 会话恢复：lastProjectId 是失败项目 → 应自动载入
const body0 = (await page.locator('body').textContent() || '').replace(/\s+/g,' ');
const resume = page.locator('button').filter({ hasText: /断点续拍/ }).first();
if (!(await resume.count())) { console.log('会话未恢复失败项目，走项目库'); 
  await page.locator('button').filter({ hasText: '项目库' }).first().click();
  await page.waitForTimeout(1000);
  await page.locator('[role=dialog] button, [role=dialog] [class*=cursor-pointer]').filter({ hasText: '马甲大佬' }).first().click();
  await page.waitForTimeout(2200);
}
const t0 = Date.now();
await page.locator('button').filter({ hasText: /断点续拍/ }).first().click();
await page.waitForTimeout(1500);
const early = (await page.locator('body').textContent() || '').replace(/\s+/g,' ');
console.log('续拍点击反馈:', early.match(/(已续拍|断点续拍|拍摄中|继续)[^。]{0,40}/g)?.slice(0,3).join(' § ') || '(无反馈)');
appendFileSync(TL, `click: ${early.match(/(已续拍|断点续拍|拍摄中|继续)[^。]{0,40}/g)?.slice(0,3).join(' § ')}\n`);
for (let i = 0; i < 40; i++) {
  await page.waitForTimeout(10000);
  const t = Math.round((Date.now()-t0)/1000);
  const b = (await page.locator('body').textContent() || '').replace(/\s+/g,' ');
  const prog = b.match(/(\d{1,3}%)\s*·\s*当前[:：]\s*([^\s，。]{2,10})/);
  console.log(`t+${t}s ${prog ? prog[0] : '读不到'}`);
  appendFileSync(TL, JSON.stringify({t, prog: prog?.[0]})+'\n');
  if (i===2) await page.screenshot({ path: '/tmp/uxwalk/90-resume-clicked.png' });
  if (/全片杀青|制作包已就绪/.test(b)) { console.log('>>> 杀青'); await page.screenshot({path:'/tmp/uxwalk/91-resume-success.png'}); break; }
  if (/阶段失败/.test(b)) { console.log('>>> 再失败:', b.match(/阶段失败[^（]{0,60}/)?.[0]); await page.screenshot({path:'/tmp/uxwalk/91-resume-failed.png'}); break; }
}
browser.close();
console.log('walk9 done');
