// 用户视角走查 v4 —— 项目库 → 工作台 → 手动异步动作反馈
import { chromium } from 'playwright';
import { mkdirSync, appendFileSync } from 'fs';

const BASE = 'http://localhost:3000';
const SHOTS = '/tmp/uxwalk';
mkdirSync(SHOTS, { recursive: true });
const TL = `${SHOTS}/tl4.jsonl`;
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

// 项目库
await page.locator('button').filter({ hasText: '项目库' }).first().click({ timeout: 6000 });
await page.waitForTimeout(1200);
await page.screenshot({ path: `${SHOTS}/30-library.png` });
const libText = (await page.locator('body').textContent() || '').replace(/\s+/g, ' ');
console.log('项目库可见:', libText.match(/悬疑反转[^。]{0,50}/)?.[0]?.slice(0, 60) || '(未见项目)');

// 打开第一个有内容的项目（杀青那条）
const item = page.locator('[role=dialog] button, [role=dialog] [class*=cursor-pointer]').filter({ hasText: /悬疑反转|战神/ }).first();
if (await item.count()) {
  await item.click();
  await page.waitForTimeout(2500);
} else {
  note('P1', '项目库', '找不到项目条目或抽屉未打开');
}
console.log('URL:', page.url());
await page.screenshot({ path: `${SHOTS}/31-workbench.png` });

// 工作台 tab 结构
const tabs = await page.locator('button, [role=tab]').allTextContents();
console.log('可见按钮/tab:', tabs.map(t => t.trim()).filter(t => t && t.length < 20).slice(0, 25).join(' | '));

// 找「资产定妆」tab 并点击
const assetTab = page.locator('button, [role=tab]').filter({ hasText: /资产定妆|资产/ }).first();
if (await assetTab.count()) {
  await assetTab.click();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${SHOTS}/32-assets.png` });
  const bodyTxt = (await page.locator('body').textContent() || '').replace(/\s+/g, ' ');
  console.log('资产面板关键词:', bodyTxt.match(/(定妆|出图|生成|锚定)[^。]{0,30}/g)?.slice(0, 5).join(' § '));
}

browser.close();
console.log('walk4 done');
