// 用户视角走查 v3 —— 全组开机全程实测，快照实时落盘（防杀丢证据）
import { chromium } from 'playwright';
import { mkdirSync, appendFileSync, writeFileSync } from 'fs';

const BASE = 'http://localhost:3000';
const SHOTS = '/tmp/uxwalk';
mkdirSync(SHOTS, { recursive: true });
const TL = `${SHOTS}/tl3.jsonl`;
appendFileSync(TL, `=== start ${new Date().toISOString()}\n`);

function note(sev, where, what) {
  const line = `[${sev}] ${where} :: ${what}`;
  appendFileSync(TL, line + '\n'); console.log(line);
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1728, height: 1080 } });
const page = await ctx.newPage();
page.setDefaultTimeout(15000);

await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(2500);

// 选题材 + 填充示例梗概
await page.locator('button, [role=button], div[class*=cursor-pointer]').filter({ hasText: '悬疑反转' }).first().click({ timeout: 8000 }).catch(e => note('P0', '题材卡', e.message.split('\n')[0]));
await page.waitForTimeout(600);
const fillBtn = page.locator('button').filter({ hasText: '填充示例梗概' }).first();
if (await fillBtn.count()) {
  await fillBtn.click();
  await page.waitForTimeout(500);
  const val = await page.locator('textarea').first().inputValue().catch(() => '');
  console.log('梗概字数:', val.length);
}
await page.screenshot({ path: `${SHOTS}/20-ready.png` });

// 点击全组开机
const launch = page.locator('button').filter({ hasText: /全组开机/ }).first();
const t0 = Date.now();
await launch.click({ timeout: 6000 }).catch(e => note('P0', '全组开机点击', e.message.split('\n')[0]));
console.log('clicked at t0');

// 每 3s 快照，跑 5 分钟或检测终态
let done = false;
for (let i = 0; i < 100; i++) {
  await page.waitForTimeout(3000);
  const t = Math.round((Date.now() - t0) / 1000);
  const bodyTxt = (await page.locator('body').textContent().catch(() => '') || '').replace(/\s+/g, ' ');
  const btn = (await launch.textContent().catch(() => '(btn gone)') || '').trim().slice(0, 30);
  const prog = bodyTxt.match(/(\d{1,3}%)\s*·?\s*当前[:：]?\s*([^\s，。]{2,8})/);
  const stageCue = bodyTxt.match(/(编剧创作|选角定妆|导演拆镜|锚定组装|后期成包|剧本创作)/g);
  const toastErr = bodyTxt.match(/(失败|错误|出错|稍后重试)[^。]{0,30}/g);
  const rec = { t, btn, prog: prog ? `${prog[1]} ${prog[2]}` : null, stages: [...new Set(stageCue || [])].slice(0, 3), err: [...new Set(toastErr || [])].slice(0, 2) };
  appendFileSync(TL, JSON.stringify(rec) + '\n');
  console.log(`t+${t}s btn="${btn}" prog="${rec.prog}" stages="${rec.stages}" err="${rec.err}"`);
  if (i === 4 || i === 20 || i === 40) await page.screenshot({ path: `${SHOTS}/21-mid-${i}.png` });
  if (/全片杀青|制作包已就绪/.test(bodyTxt) || /流水线失败|阶段失败|开机失败/.test(bodyTxt)) {
    done = true;
    await page.screenshot({ path: `${SHOTS}/22-final.png` });
    note(done ? 'INFO' : 'P0', '终态', /杀青/.test(bodyTxt) ? '检测到杀青文案' : '检测到失败文案');
    break;
  }
}
if (!done) note('P1', '时长', '5 分钟内未到终态（LLM 限流可能拖长）——检查是否有过程反馈兜底');
writeFileSync(`${SHOTS}/done3.flag`, done ? 'done' : 'timeout');
await browser.close();
