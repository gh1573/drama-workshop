// 走查 v17b —— 断点续拍继续（真实用户路径：失败→稍等→续拍→杀青→交付→反馈链验证）
import { chromium } from 'playwright';
import { appendFileSync, mkdirSync, writeFileSync } from 'fs';

const DIR = '/tmp/uxwalk/w17';
mkdirSync(DIR, { recursive: true });
const TL = `${DIR}/tl17b.jsonl`;
const log = (o) => {
  const line = JSON.stringify({ t: Math.round(Date.now() / 1000), ...o });
  appendFileSync(TL, line + '\n');
  console.log(line);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const STAGE_NAMES = '剧本创作|选角定妆|导演拆镜|锚定组装|后期成包';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1728, height: 1080 } });
const page = await ctx.newPage();
page.setDefaultTimeout(20000);
const body = async () => ((await page.locator('body').textContent().catch(() => '')) || '').replace(/\s+/g, ' ');
const shot = (n) => page.screenshot({ path: `${DIR}/${n}.png` }).catch(() => {});

try {
  // ===== A. 重进页面：断线恢复回到中断现场 =====
  // （浏览器上下文重建后 localStorage 为空——真实用户 reload 是保留的，
  //   此处按真实口径预注入上次项目键，模拟「关页再进」）
  const LAST_PID = process.env.LAST_PID || 'cmwewsp120002ruy9hk3ij67b';
  await ctx.addInitScript((pid) => {
    window.localStorage.setItem('drama-workshop:last-project', pid);
  }, LAST_PID);
  await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(5000);
  let b = await body();
  const restored = b.includes('已恢复上次拍摄现场') || b.includes('剧组中断') || b.includes('拍摄中断');
  log({ step: 'A-restore', restored, hasResumeBtn: b.includes('断点续拍') });
  await shot('40-restored');

  // ===== B. 断点续拍（若 run 已在跑——上一轮已点过——则直接观测） =====
  const runState0 = async () =>
    page.evaluate(async (pid) => {
      const r = await fetch(`/api/projects/${pid}`).then((x) => x.json());
      const run = r?.data?.activeRun;
      return run ? { status: run.status, progress: run.progress, stage: run.stage } : { status: 'none' };
    }, LAST_PID);
  const st0 = await runState0();
  log({ step: 'B-run-state', status: st0.status, stage: st0.stage, pct: st0.progress });
  if (st0.status === 'running') {
    log({ step: 'B-skip-resume', note: 'run 已在跑，直接观测' });
  } else {
    await sleep(8000);
    const resume = page.locator('button').filter({ hasText: '断点续拍' }).first();
    if (!(await resume.count())) {
      log({ step: 'B-no-resume', note: '无续拍按钮，退出' });
      process.exit(0);
    }
    await resume.click();
    log({ step: 'B-resume-click' });
    await sleep(2500);
  }
  await shot('41-resumed');

  // ===== C. 观测到杀青（API 权威轮询 + 页面旁观；宽限 22 分钟容忍 429 多轮退避） =====
  const runState = async () =>
    page.evaluate(async (pid) => {
      const r = await fetch(`/api/projects/${pid}`).then((x) => x.json());
      const run = r?.data?.activeRun;
      return run
        ? { status: run.status, progress: run.progress, stage: run.stage }
        : { status: 'none' };
    }, LAST_PID);
  let lastStage = '';
  let delivered = false;
  let resumeCount = 0;
  const t0 = Date.now();
  while (true) {
    await sleep(10000);
    const s = Math.round((Date.now() - t0) / 1000);
    const st = await runState().catch(() => ({ status: 'none' }));
    if (st.stage && st.stage !== lastStage) { lastStage = st.stage; log({ step: 'C-stage', s, stage: st.stage, pct: st.progress }); await shot(`42-${st.stage}`); }
    if (Math.round(s / 10) % 6 === 0) log({ step: 'C-poll', s, status: st.status, stage: st.stage, pct: st.progress });
    if (st.status === 'succeeded') { delivered = true; log({ step: 'C-delivered', s }); await sleep(3000); await shot('43-delivered'); break; }
    if (st.status === 'failed') {
      if (resumeCount >= 3) { log({ step: 'C-fail-final', s, resumeCount }); await shot('44-fail-final'); break; }
      resumeCount++;
      log({ step: 'C-retry-user', s, round: resumeCount, note: '真实用户：等 90s 再续拍' });
      await sleep(90000);
      b = await body();
      const resume = page.locator('button').filter({ hasText: '断点续拍' }).first();
      if (await resume.count()) { await resume.click(); log({ step: 'C-resumed', round: resumeCount }); await sleep(2500); }
      else { log({ step: 'C-no-resume-btn' }); break; }
    }
    if (s > 1300) { log({ step: 'C-timeout', s }); break; }
  }

  // ===== D. 交付面 + 单镜失败反馈链 + 合成失败反馈链 + 下一集 =====
  await sleep(3000);
  b = await body();
  log({ step: 'D-surface', delivered, hasCutTab: b.includes('成片') });
  await shot('45-surface');

  // 单镜渲染（noop 失败反馈链验证）
  const renderBtn = page.locator('button[aria-label="渲染此镜"]').first();
  if (!(await renderBtn.count())) {
    const tab = page.locator('button, [role=tab]').filter({ hasText: /镜头轨/ }).first();
    if (await tab.count()) { await tab.click().catch(() => {}); await sleep(1200); }
  }
  if (await renderBtn.count()) {
    await renderBtn.first().click();
    log({ step: 'D-video-submit' });
    await sleep(2000);
    await shot('46-video-submitted');
    for (let i = 0; i < 10; i++) {
      await sleep(3000);
      b = await body();
      if (b.includes('视频真机通道未启用') || /失败/.test(b)) break;
    }
    b = await body();
    log({ step: 'D-video-feedback', failGuide: b.includes('视频真机通道未启用') });
    await shot('47-video-failed');
  } else {
    log({ step: 'D-no-render-btn' });
  }

  // 合成失败反馈链（无媒体）
  const composeBtn = page.locator('button').filter({ hasText: /合成成片|立即合成|一键合成/ }).first();
  if (await composeBtn.count()) {
    await composeBtn.click().catch(() => {});
    await sleep(2500);
    b = await body();
    const m = b.match(/(合成失败|无法合成|未能合成)[^"']{0,60}/);
    log({ step: 'D-compose-feedback', msg: m ? m[0].slice(0, 60) : null });
    await shot('48-compose');
  } else {
    log({ step: 'D-no-compose-btn' });
  }

  // 连续剧创作路径：创作第 2 集
  const nextEpBtn = page.locator('button').filter({ hasText: /创作第 2 集/ }).first();
  if (await nextEpBtn.count()) {
    await nextEpBtn.click();
    await sleep(1500);
    b = await body();
    log({ step: 'D-nextep-dialog', serialCopy: b.includes('连续剧') || b.includes('创作路径'), hook: b.includes('上集留钩') });
    await shot('49-nextep-dialog');
    const draftBtn = page.locator('button').filter({ hasText: /AI 起草/ }).first();
    if (await draftBtn.count()) {
      await draftBtn.click();
      for (let i = 0; i < 12; i++) {
        await sleep(4000);
        const v = await page.locator('[role=dialog] textarea').first().inputValue().catch(() => '');
        if (v.trim().length > 10) { log({ step: 'D-draft-ok', len: v.length }); break; }
        if (i === 11) log({ step: 'D-draft-timeout' });
      }
    }
    const dlgTextarea = page.locator('[role=dialog] textarea').first();
    const cur = await dlgTextarea.inputValue().catch(() => '');
    if (cur.trim().length < 10) {
      await dlgTextarea.fill('妹妹的第七盘录音带之后，林晚在广播塔顶发现一间点播室，签到簿上有妹妹的字迹——日期却是明天。她决定留守电台，等下一个来电，把替死者点播的人引出来。');
    }
    const createBtn = page.locator('[role=dialog] button').filter({ hasText: /创建第 2 集/ }).first();
    await createBtn.click();
    await sleep(4000);
    b = await body();
    log({ step: 'D-ep2-created', toast: b.includes('第 2 集已创建'), badge: b.includes('第 2 集') });
    await shot('50-ep2-created');
  } else {
    log({ step: 'D-no-nextep-entry' });
  }

  writeFileSync(`${DIR}/summary17b.json`, JSON.stringify({ delivered }, null, 2));
} catch (err) {
  log({ step: 'FATAL', err: String(err).slice(0, 300) });
  await shot('59-fatal');
} finally {
  await browser.close();
}
console.log('walk17b done');
