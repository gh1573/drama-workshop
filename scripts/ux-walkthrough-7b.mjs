// 走查 v7b —— 从项目库进入失败项目 → 断点续拍
import { chromium } from 'playwright';
import { appendFileSync } from 'fs';
const SHOTS = '/tmp/uxwalk';
const TL = `${SHOTS}/tl7b.jsonl`;
const note = (sev, where, what) => { const l = `[${sev}] ${where} :: ${what}`; appendFileSync(TL, l+'\n'); console.log(l); };
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1728, height: 1080 } });
const page = await ctx.newPage();
page.setDefaultTimeout(15000);
await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(2500);
await page.locator('button').filter({ hasText: '项目库' }).first().click();
await page.waitForTimeout(1200);
await page.screenshot({ path: `${SHOTS}/70-library.png` });
// 项目库条目
const items = await page.locator('[role=dialog] button, [role=dialog] [class*=cursor-pointer]').allTextContents();
console.log('项目库条目:', items.map(t=>t.trim().replace(/\s+/g,' ').slice(0,40)).filter(Boolean).slice(0,10).join(' || '));
// 找失败项目（马甲大佬）
const failed = page.locator('[role=dialog] button, [role=dialog] [class*=cursor-pointer]').filter({ hasText: '马甲大佬' }).first();
if (!(await failed.count())) { note('P1','项目库','失败项目不在列表'); browser.close(); process.exit(0); }
await failed.click();
await page.waitForTimeout(2500);
const body1 = (await page.locator('body').textContent() || '').replace(/\s+/g,' ');
console.log('进入后断点续拍可见:', /断点续拍/.test(body1));
console.log('进入后失败徽标可见:', /中断|失败/.test(body1));
await page.screenshot({ path: `${SHOTS}/71-failed-project.png` });
// 点断点续拍
const resume = page.locator('button').filter({ hasText: /断点续拍/ }).first();
if (await resume.count()) {
  const t0 = Date.now();
  await resume.click();
  await page.waitForTimeout(1500);
  const early = (await page.locator('body').textContent() || '').replace(/\s+/g,' ');
  console.log('续拍点击后:', early.match(/(已续拍|拍摄中|续拍|正在)[^。]{0,40}/g)?.slice(0,3).join(' § ') || '(无反馈)');
  appendFileSync(TL, `续拍反馈: ${early.match(/(已续拍|拍摄中|续拍|正在)[^。]{0,40}/g)?.slice(0,3).join(' § ')}\n`);
  // 观察 6 分钟
  for (let i = 0; i < 36; i++) {
    await page.waitForTimeout(10000);
    const t = Math.round((Date.now()-t0)/1000);
    const b = (await page.locator('body').textContent() || '').replace(/\s+/g,' ');
    const prog = b.match(/(\d{1,3}%)\s*·\s*当前[:：]\s*([^\s，。]{2,10})/);
    console.log(`t+${t}s ${prog ? prog[0] : '进度未读'}`);
    appendFileSync(TL, JSON.stringify({t, prog: prog?.[0]})+'\n');
    if (i===2) await page.screenshot({ path: `${SHOTS}/72-resume-mid.png` });
    if (/全片杀青|制作包已就绪/.test(b)) { note('INFO','终态','续拍杀青'); await page.screenshot({path:`${SHOTS}/73-resume-success.png`}); break; }
    if (/阶段失败/.test(b)) { note('P1','续拍失败', b.match(/阶段失败[^（]{0,70}/)?.[0]); await page.screenshot({path:`${SHOTS}/73-resume-failed.png`}); break; }
  }
} else note('P1','断点续拍','按钮不可见');
browser.close();
console.log('walk7b done');
