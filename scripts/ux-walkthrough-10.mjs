// 走查 v10 —— 修复后全新项目完整开机复测（正向路径终验）
import { chromium } from 'playwright';
import { appendFileSync } from 'fs';
const TL = '/tmp/uxwalk/tl10.jsonl';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1728, height: 1080 } });
const page = await ctx.newPage();
page.setDefaultTimeout(15000);
await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(2500);
// 另起新片（清掉失败会话）→ 选题材 → 填梗概 → 开机
const nb = page.locator('button').filter({ hasText: '另起新片' }).first();
if (await nb.count()) { await nb.click(); await page.waitForTimeout(1000); }
await page.locator('button, [role=button], div[class*=cursor-pointer]').filter({ hasText: '重生复仇' }).first().click({ timeout: 8000 });
await page.waitForTimeout(600);
const fb = page.locator('button').filter({ hasText: '填充示例梗概' }).first();
if (await fb.count()) { await fb.click(); await page.waitForTimeout(500); }
const t0 = Date.now();
await page.locator('button').filter({ hasText: /全组开机/ }).first().click();
console.log('clicked');
let lastCount = 0;
for (let i = 0; i < 54; i++) {
  await page.waitForTimeout(10000);
  const t = Math.round((Date.now()-t0)/1000);
  const b = (await page.locator('body').textContent() || '').replace(/\s+/g,' ');
  const prog = b.match(/(\d{1,3}%)\s*·\s*当前[:：]\s*([^\s，。]{2,10})/);
  const jl = (b.match(/\d{2}:\d{2}:\d{2}/g) || []).length;
  console.log(`t+${t}s ${prog ? prog[0].slice(0,30) : '进度未读'} journal≈${jl}`);
  appendFileSync(TL, JSON.stringify({t, prog: prog?.[0], journalLines: jl})+'\n');
  if (i===4 || i===16) await page.screenshot({ path: `/tmp/uxwalk/100-mid-${i}.png` });
  if (/全片杀青|制作包已就绪/.test(b)) { console.log('>>> 杀青!', Math.round((Date.now()-t0)/1000)+'s 总耗时'); await page.screenshot({path:'/tmp/uxwalk/101-success.png'}); break; }
  if (/阶段失败/.test(b)) {
    // 只把【最新】失败（journal 尾部）当终态：检查按钮是否变「断点续拍」且进度停滞 60s
    console.log('>>> 疑似失败', t+'s');
    await page.screenshot({path:'/tmp/uxwalk/101-failed.png'});
    appendFileSync(TL, 'failed\n'); break;
  }
}
browser.close();
console.log('walk10 done');
