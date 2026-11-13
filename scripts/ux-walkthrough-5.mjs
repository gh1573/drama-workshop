// 用户视角走查 v5 —— 手动异步动作（生成定妆照）反馈实测
import { chromium } from 'playwright';
import { mkdirSync, appendFileSync } from 'fs';

const BASE = 'http://localhost:3000';
const SHOTS = '/tmp/uxwalk';
mkdirSync(SHOTS, { recursive: true });
const TL = `${SHOTS}/tl5.jsonl`;
const note = (sev, where, what) => {
  const l = `[${sev}] ${where} :: ${what}`;
  appendFileSync(TL, l + '\n'); console.log(l);
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1728, height: 1080 } });
const page = await ctx.newPage();
page.setDefaultTimeout(15000);

// 记录任务 API 调用
page.on('request', r => {
  if (r.url().includes('/tasks') && r.method() === 'POST') console.log('>> POST task', r.url().slice(-40));
});

await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(2500);

// 直接打开项目库 → 点项目
await page.locator('button').filter({ hasText: '项目库' }).first().click();
await page.waitForTimeout(1000);
const item = page.locator('[role=dialog] button, [role=dialog] [class*=cursor-pointer]').filter({ hasText: /悬疑反转|战神/ }).first();
await item.click();
await page.waitForTimeout(2500);

// 找资产 tab
const assetTab = page.locator('button, [role=tab]').filter({ hasText: /资产定妆/ }).first();
await assetTab.click();
await page.waitForTimeout(1200);
await page.screenshot({ path: `${SHOTS}/40-assets.png` });

// 找「生成定妆照/重新出图/生成定妆」按钮
const btnTexts = await page.locator('button').allTextContents();
const assetBtns = btnTexts.map(t => t.trim()).filter(t => /定妆|出图|重绘|生成图|锚点/.test(t));
console.log('资产相关按钮:', assetBtns.join(' | ') || '(无)');
appendFileSync(TL, `按钮: ${assetBtns.join(' | ')}\n`);

// 点第一个重新出图类按钮
const regen = page.locator('button').filter({ hasText: /重新出图|重绘|出图|生成定妆照/ }).first();
if (await regen.count()) {
  const t0 = Date.now();
  await regen.click();
  // 0.5s / 1.5s / 3s 三次快照观察反馈
  for (const wait of [500, 1000, 1500]) {
    await page.waitForTimeout(wait);
    const bodyTxt = (await page.locator('body').textContent() || '').replace(/\s+/g, ' ');
    const cues = bodyTxt.match(/(排队|进行中|生成中|已提交|任务|出图中|处理中)[^。]{0,25}/g);
    console.log(`t+${Math.round((Date.now() - t0) / 100) / 10}s 反馈: ${(cues || []).slice(0, 3).join(' § ') || '(无任何反馈文案!)'}`);
    if (!(cues || []).length && wait === 1500) {
      note('P0', '生成定妆照', '点击 1.5s 后页面无任何过程反馈（toast/任务条/状态文案）');
    }
  }
  await page.screenshot({ path: `${SHOTS}/41-after-regen.png` });
  // 等 5s 再看任务是否出现在列表
  await page.waitForTimeout(4000);
  const bodyTxt2 = (await page.locator('body').textContent() || '').replace(/\s+/g, ' ');
  console.log('t+7s:', bodyTxt2.match(/(排队|进行中|生成中|已完成|失败)[^。]{0,25}/g)?.slice(0, 4).join(' § '));
} else {
  note('P1', '资产定妆', '未找到出图类按钮（可能定妆图已生成，按钮叫别的名字）');
}
browser.close();
console.log('walk5 done');
