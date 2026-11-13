// 走查 v19 —— 单镜视频任务失败反馈链（noop 通道，零配额）
// scratch 项目：API 建项目+片段 → 提交视频任务 → 浏览器看任务中心失败卡呈现 → 删项目
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const DIR = '/tmp/uxwalk/w19';
mkdirSync(DIR, { recursive: true });
const log = (o) => console.log(JSON.stringify(o));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const J = (r) => r.json();

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1728, height: 1080 } });
const page = await ctx.newPage();
page.setDefaultTimeout(20000);
const body = async () => ((await page.locator('body').textContent().catch(() => '')) || '').replace(/\s+/g, ' ');
const shot = (n) => page.screenshot({ path: `${DIR}/${n}.png` }).catch(() => {});

try {
  // ===== A. API 搭 scratch 项目 =====
  const mk = await fetch('http://localhost:3000/api/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      genre: { id: 'xuanyi', name: '悬疑反转', badge: '高能烧脑 · 真相反转', hookTactic: '', musicMood: '', tonePrompt: '' },
      synopsis: '走查临时项目：验证单镜视频任务失败反馈链（noop 通道），验证后立即删除。',
      modelConfig: {},
    }),
  }).then(J);
  const pid = mk.data.id;
  log({ step: 'A-created', pid });

  const clip = await fetch(`http://localhost:3000/api/projects/${pid}/clips`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ beatIndex: 1, name: '走查单镜 · 开场', subtitle: '深夜电台，电流声来电', format: 'mp4' }),
  }).then(J);
  log({ step: 'A-clip', clipId: clip.data?.id });

  const task = await fetch(`http://localhost:3000/api/projects/${pid}/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind: 'video', clipId: clip.data.id }),
  }).then(J);
  log({ step: 'A-task', ok: task.ok, taskId: task.data?.id });

  // ===== B. 轮询任务落定（noop 同步失败） =====
  let final = null;
  for (let i = 0; i < 12; i++) {
    await sleep(2500);
    const tasks = await fetch(`http://localhost:3000/api/projects/${pid}/tasks`).then(J);
    const t = tasks.data?.find?.((x) => x.id === task.data.id) ?? tasks.data?.[0];
    if (t && (t.status === 'failed' || t.status === 'succeeded')) { final = t; break; }
  }
  log({ step: 'B-final', status: final?.status, reason: (final?.reason ?? final?.error ?? '').slice(0, 120) });

  // ===== C. 浏览器：任务中心失败卡呈现 =====
  await ctx.addInitScript((pid) => {
    window.localStorage.setItem('drama-workshop:last-project', pid);
  }, pid);
  await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(4500);
  let b = await body();
  // 打开剧组进程页签（任务中心在其中）
  const crewTab = page.locator('button, [role=tab]').filter({ hasText: /剧组进程|进程/ }).first();
  if (await crewTab.count()) { await crewTab.click().catch(() => {}); await sleep(1500); }
  b = await body();
  const failCard = b.includes('视频真机通道未启用');
  const hasGuide = b.includes('贴片') || b.includes('外部工具') || b.includes('回镜头轨');
  const hasRetryBtn = b.includes('重试');
  log({ step: 'C-task-center', failCard, hasGuide, hasRetryBtn });
  await shot('01-task-center');

  // 镜头轨行的状态徽标（失败态在镜头行可见）
  const tl = page.locator('button, [role=tab]').filter({ hasText: /镜头轨|时间轨/ }).first();
  if (await tl.count()) { await tl.click().catch(() => {}); await sleep(1200); }
  b = await body();
  const clipFailBadge = /失败/.test(b);
  log({ step: 'C-clip-row', clipFailBadge });
  await shot('02-clip-row');
} catch (err) {
  log({ step: 'FATAL', err: String(err).slice(0, 300) });
} finally {
  await browser.close();
}
console.log('walk19 done');
