// 走查 v17 —— 用户视角端到端全旅程（真实创作流程，视频仅验证反馈链路不消耗配额）
// 阶段：落地页→试笔→过稿→开机→流水线→交付→单镜失败链→合成失败链→连续剧下一集
import { chromium } from 'playwright';
import { appendFileSync, mkdirSync, writeFileSync } from 'fs';

const DIR = '/tmp/uxwalk/w17';
mkdirSync(DIR, { recursive: true });
const TL = `${DIR}/tl.jsonl`;
const log = (o) => {
  const line = JSON.stringify({ t: Math.round(Date.now() / 1000), ...o });
  appendFileSync(TL, line + '\n');
  console.log(line);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1728, height: 1080 } });
const page = await ctx.newPage();
page.setDefaultTimeout(20000);
const body = async () => ((await page.locator('body').textContent().catch(() => '')) || '').replace(/\s+/g, ' ');
const shot = (n) => page.screenshot({ path: `${DIR}/${n}.png` }).catch(() => {});

const SYNOPSIS =
  '深夜电台主播林晚接到一通只有电流声的来电，对方报出的地址正是她亡故妹妹的家。' +
  '她循线追查，发现妹妹生前留下的七盘录音带，每盘对应一个陌生人临终前的秘密。' +
  '当第七盘带子播出她自己的声音时，她终于明白：广播塔顶有人一直在替死者点播。';

try {
  // ============ A. 落地页 ============
  await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(2500);
  let b = await body();
  log({ step: 'A-landing', serialCard: b.includes('连续剧创作路径'), epBadge: b.includes('示例实产'), cta: b.includes('全组开机') });
  await shot('01-landing');

  // ============ B. 选题材 + 填梗概 ============
  const genreCard = page.locator('button, [role=button], div[class*=cursor-pointer]').filter({ hasText: '悬疑' }).first();
  await genreCard.click({ timeout: 10000 });
  await sleep(500);
  await page.fill('#synopsis-input', SYNOPSIS);
  await sleep(400);
  b = await body();
  log({ step: 'B-input', ready: b.includes('梗概就绪') });
  await shot('02-input');

  // ============ C. 先试笔（过程反馈采样） ============
  await page.locator('button').filter({ hasText: '先试笔' }).first().click();
  log({ step: 'C-generate-click' });
  const t0 = Date.now();
  let genPanelSeen = false;
  for (let i = 0; i < 40; i++) {
    await sleep(3000);
    b = await body();
    const elapsed = Math.round((Date.now() - t0) / 1000);
    const panel = b.includes('编剧室推演中');
    if (panel) genPanelSeen = true;
    const stepTxt = b.match(/编剧室推演中(.{0,120}?)已进行/)?.[1]?.trim();
    if (i % 5 === 0) log({ step: 'C-gen-wait', s: elapsed, panel, stepTxt: stepTxt?.slice(0, 40) });
    if (i === 3) await shot('03-generating');
    if (i === 12) await shot('04-generating-late');
    if (b.includes('【第 01 场】') || (panel === false && elapsed > 15 && b.includes('三幕'))) break;
    if (elapsed > 200) { log({ step: 'C-timeout' }); break; }
    if (elapsed > 194) await shot('04b-generating-190s');
  }
  b = await body();
  const acts = (b.match(/【第 \d+ 场】/g) || []).length;
  log({ step: 'C-done', acts, genPanelSeen });
  await shot('05-script-ready');

  // ============ D. 全组开机（等可点再点：试笔在途时按钮正确禁用） ============
  const bootBtn = page.locator('button').filter({ hasText: /全组开机/ }).first();
  for (let i = 0; i < 70; i++) {
    if (await bootBtn.isEnabled().catch(() => false)) break;
    await sleep(3000);
  }
  await bootBtn.click({ timeout: 15000 });
  log({ step: 'D-boot-click' });
  await sleep(2500);
  b = await body();
  log({ step: 'D-boot-feedback', starting: b.includes('全组开机中') || b.includes('剧组拍摄中'), rail: b.includes('剧组进程') || b.includes('编剧') });
  await shot('06-boot');

  // ============ E. 流水线观测（盲转圈重点排查） ============
  let lastStage = '';
  let delivered = false;
  const t1 = Date.now();
  for (let i = 0; i < 110; i++) {
    await sleep(8000);
    const s = Math.round((Date.now() - t1) / 1000);
    b = await body();
    const prog = b.match(/(\d{1,3})%\s*·\s*当前[:：]\s*([^\s，。]{2,12})/);
    const stages = ['screenwriting', 'casting', 'directing', 'anchoring', 'postproduction']
      .filter((k) => !k) // 占位：阶段名以中文展示，无法按 key 匹配
      .length;
    const stageZh = ['编剧', '选角', '导戏', '分镜', '锚定', '后期', '杀青'].find((z) => b.includes(`${z}·`) || b.includes(`${z} ·`));
    const retries = (b.match(/\d+s 后自动重试/g) || []).length;
    if (prog) {
      const cur = prog[2];
      if (cur !== lastStage) { lastStage = cur; log({ step: 'E-stage', s, cur, pct: prog[1] }); await shot(`10-stage-${cur}`); }
    }
    if (i % 6 === 0) log({ step: 'E-poll', s, prog: prog ? prog[0].slice(0, 30) : null, stageZh: stageZh || null, retries });
    if (i === 10) await shot('11-pipeline-mid');
    if (/全片杀青|制作包已就绪|成片已就绪/.test(b)) { delivered = true; log({ step: 'E-delivered', s }); await shot('12-delivered'); break; }
    if (/阶段失败|流水线失败/.test(b)) { log({ step: 'E-failed', s }); await shot('13-failed'); break; }
    if (s > 850) { log({ step: 'E-timeout', s }); await shot('13-timeout'); break; }
  }

  // ============ F. 交付面核查 ============
  await sleep(3000);
  b = await body();
  const portraitImgs = await page.locator('img[alt*="定妆"], img[src*="assets"]').count();
  const videoTabs = b.includes('成片');
  log({ step: 'F-deliver-surface', delivered, portraitImgs, videoTabs });
  await shot('20-after-run');

  // ============ G. 单镜渲染失败反馈链（noop 占位，零配额） ============
  const renderBtn = page.locator('button[aria-label="渲染此镜"]').first();
  if (await renderBtn.count()) {
    // 前往镜头轨页签（若按钮不可见）
    const timelineTab = page.locator('button, [role=tab]').filter({ hasText: /镜头轨|分镜/ }).first();
    if (!(await renderBtn.isVisible().catch(() => false))) {
      await timelineTab.click().catch(() => {});
      await sleep(1200);
    }
    if (await renderBtn.count()) {
      await renderBtn.first().click();
      log({ step: 'G-video-submit' });
      await sleep(2000);
      await shot('21-video-submitted');
      // noop 同步终态：数秒内落 failed，任务中心应有失败卡 + 贴片指引
      for (let i = 0; i < 10; i++) {
        await sleep(3000);
        b = await body();
        if (b.includes('视频真机通道未启用') || /任务失败/.test(b)) break;
      }
      b = await body();
      const failGuide = b.includes('视频真机通道未启用');
      const failCard = /失败/.test(b);
      log({ step: 'G-video-feedback', failGuide, failCard });
      await shot('22-video-failed');
    } else {
      log({ step: 'G-no-render-btn', note: '渲染按钮不可达' });
    }
  } else {
    log({ step: 'G-no-clip', note: '无镜头或无渲染按钮' });
  }

  // ============ H. 合成失败反馈链（无媒体合成，验证报错可读性） ============
  const composeBtn = page.locator('button').filter({ hasText: /合成成片|立即合成|一键合成/ }).first();
  if (await composeBtn.count()) {
    await composeBtn.click().catch(() => {});
    await sleep(2500);
    b = await body();
    const composeErr = b.match(/合成失败[^"]{0,80}|无法合成[^"]{0,80}/)?.[0];
    log({ step: 'H-compose-feedback', composeErr: composeErr?.slice(0, 60) || null });
    await shot('23-compose');
  } else {
    log({ step: 'H-no-compose-btn' });
  }

  // ============ I. 连续剧创作路径：创作第 2 集 ============
  const nextEpBtn = page.locator('button').filter({ hasText: /创作第 2 集/ }).first();
  if (await nextEpBtn.count()) {
    await nextEpBtn.click();
    await sleep(1500);
    b = await body();
    log({ step: 'I-dialog-open', copy: b.includes('连续剧') || b.includes('创作路径'), hook: b.includes('上集留钩') });
    await shot('30-nextep-dialog');
    // AI 起草（真实 LLM，接上集钩子）
    const draftBtn = page.locator('button').filter({ hasText: /AI 起草/ }).first();
    if (await draftBtn.count()) {
      await draftBtn.click();
      await sleep(4000);
      b = await body();
      log({ step: 'I-draft', textareaFilled: await page.locator('textarea').first().inputValue().then((v) => v.length > 10).catch(() => false) });
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
    const ep2Toast = b.includes('第 2 集已创建');
    const ep2Badge = b.includes('第 2 集');
    log({ step: 'I-created', ep2Toast, ep2Badge });
    await shot('31-ep2-created');
  } else {
    log({ step: 'I-no-entry', note: '未找到创作第 2 集入口' });
  }

  // ============ J. 汇总 ============
  b = await body();
  const summary = {
    step: 'J-summary',
    delivered,
    serialPathOk: b.includes('连续剧') || b.includes('创作第 2 集'),
  };
  log(summary);
  writeFileSync(`${DIR}/summary.json`, JSON.stringify(summary, null, 2));
} catch (err) {
  log({ step: 'FATAL', err: String(err).slice(0, 300) });
  await shot('99-fatal');
} finally {
  await browser.close();
}
console.log('walk17 done');
