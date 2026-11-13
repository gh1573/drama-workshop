// 走查 v18 —— 连续剧创作路径 UI 全链验证（零 LLM/零视频/零开机）
// 路径：项目库分组 → 载入第 1 集 → 信息卡连续剧面 → 创作第 2 集弹窗 →
//       创建第 2 集（资产克隆）→ 会话切换 → 库分组更新
import { chromium } from 'playwright';
import { appendFileSync, mkdirSync } from 'fs';

const DIR = '/tmp/uxwalk/w18';
mkdirSync(DIR, { recursive: true });
const TL = `${DIR}/tl.jsonl`;
const log = (o) => {
  const line = JSON.stringify({ t: Math.round(Date.now() / 1000), ...o });
  appendFileSync(TL, line + '\n');
  console.log(line);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const SEED_PID = 'cmwewsp120002ruy9hk3ij67b';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1728, height: 1080 } });
const page = await ctx.newPage();
page.setDefaultTimeout(20000);
const body = async () => ((await page.locator('body').textContent().catch(() => '')) || '').replace(/\s+/g, ' ');
const shot = (n) => page.screenshot({ path: `${DIR}/${n}.png` }).catch(() => {});

try {
  // ===== A. 落地页 → 项目库抽屉：连续剧分组 =====
  await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(2500);
  await page.locator('button').filter({ hasText: '项目库' }).first().click();
  await sleep(1500);
  let b = await body();
  log({
    step: 'A-library',
    seriesBadge: b.includes('连续剧 1 集'),
    nextEpBtn: b.includes('下一集'),
    epBadge: b.includes('第 1 集'),
    delivered: b.includes('已交付'),
  });
  await shot('01-library');
  await page.keyboard.press('Escape');
  await sleep(800);

  // ===== B. 载入种子第 1 集 =====
  await page.locator('button').filter({ hasText: '项目库' }).first().click();
  await sleep(1200);
  await page.locator('div[role=button]').filter({ hasText: '战神逆袭' }).first().click();
  await sleep(3500);
  b = await body();
  log({
    step: 'B-loaded',
    seriesChip: b.includes('连续剧 · '),
    ep1Badge: b.includes('第 1 集'),
    cutTab: b.includes('成片'),
    nextEpEntry: b.includes('创作第 2 集 · 沿用角色定妆'),
  });
  await shot('02-ep1-loaded');

  // ===== C. 创作下一集弹窗（叙事+上集钩子） =====
  const nextEpBtn = page.locator('button').filter({ hasText: /创作第 2 集/ }).first();
  if (!(await nextEpBtn.count())) {
    log({ step: 'C-no-entry', note: '信息卡无创作第 2 集入口——检查成片页签' });
    const cutTab = page.locator('button, [role=tab]').filter({ hasText: '成片' }).first();
    if (await cutTab.count()) { await cutTab.click(); await sleep(1500); }
    const alt = page.locator('button').filter({ hasText: /创作第 2 集/ }).first();
    if (await alt.count()) { await alt.click(); await sleep(1500); }
  } else {
    await nextEpBtn.click();
    await sleep(1500);
  }
  b = await body();
  const dlg = b.includes('创作下一集');
  log({
    step: 'C-dialog',
    dlg,
    serialCopy: b.includes('走同一条创作路径'),
    hook: b.includes('上集留钩'),
    hookScene: b.includes('旧账新算'),
    ep2Label: b.includes('第 2 集'),
    aiDraft: b.includes('AI 起草'),
  });
  await shot('03-nextep-dialog');

  // ===== D. 手动填梗概创建第 2 集（跳过 AI 起草，零 LLM） =====
  const dlgTextarea = page.locator('[role=dialog] textarea').first();
  await dlgTextarea.fill(
    '旧账新算的酒局上，那纸婚书被当众撕碎，战北辰冷笑立誓：三年后我要让全场跪着还回来。' +
      '他当场签下离婚协议，转身踏入军区大院的征兵处，从此隐姓埋名——直到一纸调令把他调回她的婚礼安保组。'
  );
  const createBtn = page.locator('[role=dialog] button').filter({ hasText: /创建第 2 集/ }).first();
  await createBtn.click();
  await sleep(4000);
  b = await body();
  log({
    step: 'D-created',
    toast: b.includes('第 2 集已创建'),
    inheritMsg: b.includes('已继承') && b.includes('资产定妆'),
    ep2Badge: b.includes('第 2 集'),
    bootCta: b.includes('全组开机'),
  });
  await shot('04-ep2-created');

  // ===== E. 会话确为第 2 集 + 资产克隆（同脸铁律载体） =====
  const assets = await page.evaluate(async () => {
    const list = await fetch('/api/projects').then((r) => r.json());
    return list.data.filter((p) => p.episodeNo === 2).map((p) => ({ id: p.id, title: p.title, series: p.seriesId, beats: p.beatCount, clips: p.clipCount }));
  });
  log({ step: 'E-ep2-in-library', projects: assets });
  if (assets.length) {
    const detail = await page.evaluate(async (pid) => {
      const d = await fetch(`/api/projects/${pid}`).then((r) => r.json());
      const a = d.data.assets ?? [];
      return { title: d.data.title, seriesId: d.data.seriesId, episodeNo: d.data.episodeNo, assets: a.length, portraits: a.filter((x) => x.portraitUrl).length };
    }, assets[0].id);
    log({ step: 'E-ep2-detail', ...detail });
  }
  await shot('05-ep2-session');

  // ===== F. 项目库分组更新（连续剧 2 集） =====
  await page.locator('button').filter({ hasText: '项目库' }).first().click();
  await sleep(1500);
  b = await body();
  log({
    step: 'F-regroup',
    series2: b.includes('连续剧 2 集'),
    bothEps: b.includes('第 1 集') && b.includes('第 2 集'),
    nextNo3: b.includes('下一集'),
  });
  await shot('06-library-2eps');
  await page.keyboard.press('Escape');

  // ===== G. 回到落地页语境条（连续剧叙事校准回归） =====
  await sleep(800);
  b = await body();
  log({
    step: 'G-landing-context',
    contextBar: b.includes('同款梗概'),
    ep1Label: b.includes('连续剧第 1 集'),
    pathCopy: b.includes('第 2 集、第 3 集') && b.includes('每一集都走这条创作路径'),
  });
  await shot('07-landing-context');
} catch (err) {
  log({ step: 'FATAL', err: String(err).slice(0, 300) });
  await shot('99-fatal');
} finally {
  await browser.close();
}
console.log('walk18 done');
