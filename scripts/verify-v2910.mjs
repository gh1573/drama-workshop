/**
 * v2.9.10 异步动作反馈完备性验收（桌面端 1728×1080，零外部通道配额）：
 *
 * 审计定位 8 缺口 + 4 可疑项的修复验证：
 * P0  一键渲染全片在途态：POST /render-all 慢网下按钮转圈/禁用/文案变化 + 防重入
 * P1  断点续拍在途态：POST /runs/retry 在途禁用 + 转圈 + 文案变化
 * P1  任务重试失败播报：500 时 destructive toast（此前 catch 静默吞）
 * P1  任务取消失败播报：500 时 destructive toast（此前 catch 静默吞）
 * P1  项目删除二次确认：AlertDialog（不可逆动作，与「重新开机」同纪律）+ 在途态
 * P2  载入防重入（行为级，代码 guard 已加；UI 断言以删除/重试为主不重复测）
 *
 * 配额纪律：重试/取消/续拍/渲染提交全部 Playwright route mock（不触真实通道）；
 * 项目创建/删除走本地 API + Prisma 直写（零 LLM/图像/视频/TTS）。
 * 用法：bun scripts/verify-v2910.mjs
 */
import { chromium } from "playwright";
import { PrismaClient } from "@prisma/client";

const BASE = "http://localhost:3000";
const db = new PrismaClient();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0;
let fail = 0;
function check(name, ok, extra = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? `  [${extra}]` : ""}`);
  ok ? pass++ : fail++;
}

const api = async (url, init) => {
  const res = await fetch(BASE + url, init);
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json?.ok === false)
    throw new Error(`${url} -> HTTP ${res.status}: ${json?.error ?? ""}`);
  return json?.data ?? json;
};
const jpost = (body) => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

(async () => {
  // ===== 0. 夹具（零外部配额）：A 删除目标 / B 在制（failed run + failed/queued task + 2 镜）=====
  const cleanup = async (pid) => {
    try {
      await api(`/api/projects/${pid}`, { method: "DELETE" });
    } catch {}
  };
  const old = await api("/api/projects");
  for (const p of old.filter((x) => (x.title ?? "").includes("v2910夹具"))) {
    await cleanup(p.id);
  }

  const mkProject = async (title) =>
    api("/api/projects", jpost({
      title,
      genre: {
        id: "shuangwen", name: "战神逆袭 · 龙王归来", badge: "fixture",
        hookTactic: "fixture", musicMood: "fixture", tonePrompt: "fixture",
      },
      synopsis: `${title}：异步反馈验收夹具（零配额，验收后自动删除）`,
      modelConfig: {
        videoModel: "Omni 1.2 Flash", durationSeconds: 5, resolution: "720p",
        scriptThinkingLevel: "low", enablePromptEnhance: true,
      },
    }));

  const A = await mkProject("v2910夹具·删除目标");
  const B = await mkProject("v2910夹具·在制项目");

  await api(`/api/projects/${B.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      storyBeats: [1, 2, 3].map((i) => ({
        index: i, actTitle: `夹具场 ${i}`,
        narrativeFunction: i === 1 ? "hook" : i === 2 ? "buildup" : "cliffhanger",
        pacingNote: "0~12s", description: "验收夹具", dialogueSubtitle: "夹具台词",
        cameraMovement: "固定机位", promptGuidance: "fixture",
      })),
    }),
  });
  const clipIds = [];
  for (let i = 1; i <= 2; i++) {
    const c = await api(`/api/projects/${B.id}/clips`, jpost({
      beatIndex: 1, name: `镜0${i}`, subtitle: "", format: "mp4",
    }));
    await api(`/api/clips/${c.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ finalPrompt: "[Fixture] v2910 render-all in-flight test." }),
    });
    clipIds.push(c.id);
  }
  // failed run（断点续拍按钮出现的前提）+ 1 failed + 1 queued 任务（行内重试/取消图标的前提）
  const run = await db.productionRun.create({
    data: {
      projectId: B.id, status: "failed", progress: 30, stage: "casting",
      stages: JSON.stringify([
        { key: "screenwriting", name: "编剧室", role: "编剧", status: "succeeded" },
        { key: "casting", name: "选角定妆", role: "选角导演", status: "failed", error: "夹具注入的失败" },
      ]),
      journal: "[]", error: "夹具注入的失败（验收断点续拍在途态）",
    },
  });
  const taskFailed = await db.renderTask.create({
    data: {
      projectId: B.id, kind: "video", status: "failed",
      payload: JSON.stringify({ clipId: clipIds[0] }),
      attempts: 1, error: "夹具注入失败（验收重试播报）",
    },
  });
  const taskQueued = await db.renderTask.create({
    data: {
      projectId: B.id, kind: "video", status: "queued",
      payload: JSON.stringify({ clipId: clipIds[1] }), attempts: 0,
    },
  });

  // ===== 浏览器走查 =====
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1728, height: 1080 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  const waitText = async (text, timeout = 15000) => {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      if ((await page.locator("body").innerText()).includes(text)) return true;
      await sleep(400);
    }
    return false;
  };

  await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await sleep(3000);

  // 载入在制项目 B
  await page.getByRole("button", { name: "项目库", exact: true }).click();
  await sleep(1200);
  await page.locator('div[role="button"]').filter({ hasText: "v2910夹具·在制项目" }).first().click();
  check("载入在制夹具（项目已载入 toast）", await waitText("项目已载入", 20000));

  // —— P1 任务重试失败播报（mock 500，此前静默吞）——
  await page.route("**/api/tasks/*/retry", (route) =>
    route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ ok: false, error: "mock：重试通道 500" }),
    })
  );
  await page.getByRole("tab", { name: "剧组进程" }).click();
  await sleep(1500);
  const retryBtn = page.getByRole("button", { name: "重试任务" }).first();
  check("任务中心：failed 任务有重试入口", (await retryBtn.count()) > 0);
  await retryBtn.click();
  check("P1 重试失败播报：destructive toast「重试未成功」", await waitText("重试未成功", 8000));
  check("P1 重试失败播报：含 mock 原因", await waitText("mock：重试通道 500", 5000));

  // —— P1 任务取消失败播报（mock 500）——
  await page.route("**/api/tasks/*/cancel", (route) =>
    route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ ok: false, error: "mock：取消通道 500" }),
    })
  );
  const cancelBtn = page.getByRole("button", { name: "取消任务" }).first();
  check("任务中心：queued 任务有取消入口", (await cancelBtn.count()) > 0);
  await cancelBtn.click();
  check("P1 取消失败播报：destructive toast「取消未成功」", await waitText("取消未成功", 8000));
  /* 取消 mock 500 后任务仍 queued（activeVideoTasks>0 会隐藏一键渲染入口）——
     夹具任务直接置 cancelled，任务轮询（~2.5s）自动吸收，零真实通道调用 */
  await db.renderTask.update({ where: { id: taskQueued.id }, data: { status: "cancelled" } });
  await sleep(4000);

  // —— P1 断点续拍在途态（mock 延迟 1.2s，返回真实 run id 防 404 轮询）——
  const runDTO = {
    id: run.id, projectId: B.id, status: "running", progress: 40, stage: "casting",
    stages: [], journal: [], error: null,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
  await page.route("**/api/runs/*/retry", async (route) => {
    await sleep(1200);
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, data: runDTO }) });
  });
  await page.getByRole("button", { name: /断点续拍/ }).click();
  await sleep(400); // mock 在途窗口内
  const inFlight = await page.getByRole("button", { name: /续拍启动中/ }).count();
  check("P1 断点续拍在途态：按钮转「续拍启动中…」", inFlight > 0);
  check("P1 断点续拍在途态：按钮禁用", await page.getByRole("button", { name: /续拍启动中/ }).isDisabled().catch(() => false));
  check("P1 断点续拍落定：toast「断点续拍已启动」", await waitText("断点续拍已启动", 10000));
  /* mock 返回 running 后，真实 run 轮询会立刻翻回 failed 并触发 v2.9.7 的
     「中断自动切剧组进程页签」——等产品行为落定后再切成片，避免竞态拽走页签 */
  await waitText("剧组中断", 10000);
  await sleep(1500);

  // —— P0 一键渲染全片在途态（mock 延迟 1.2s，零真实任务提交）——
  await page.getByRole("tab", { name: "成片" }).click();
  await sleep(1500);
  await page.route("**/render-all", async (route) => {
    await sleep(1200);
    await route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({ ok: true, data: { submitted: 2, skipped: 0, totalClips: 2 } }),
    });
  });
  const renderBtn = page.getByRole("button", { name: /一键渲染全片/ });
  check("成片面：一键渲染全片入口在位", (await renderBtn.count()) > 0);
  await renderBtn.click();
  await sleep(400); // mock 在途窗口内
  check("P0 一键渲染在途态：按钮转「正在提交渲染任务…」", (await page.getByRole("button", { name: /正在提交渲染任务/ }).count()) > 0);
  check("P0 一键渲染在途态：按钮禁用（防重入）", await page.getByRole("button", { name: /正在提交渲染任务/ }).isDisabled().catch(() => false));
  check("P0 一键渲染落定：toast「全片渲染已提交」", await waitText("全片渲染已提交", 10000));

  // —— P1 删除二次确认（真实 DELETE，本地 API 零配额）——
  await page.getByRole("button", { name: "项目库", exact: true }).click();
  await sleep(1500);
  const cardA = page.locator('div[role="button"]').filter({ hasText: "v2910夹具·删除目标" }).first();
  check("项目库：删除目标卡片在位", (await cardA.count()) > 0);
  await cardA.getByRole("button", { name: "删除" }).click();
  await sleep(600);
  const dialogText = await page.locator("body").innerText();
  check("P1 删除二次确认：AlertDialog 弹出", dialogText.includes("删除项目「v2910夹具·删除目标」"));
  check("P1 删除二次确认：说明不可撤销 + 确认按钮", dialogText.includes("不可撤销") && dialogText.includes("确认删除"));
  await page.getByRole("button", { name: "取消" }).click();
  await sleep(800);
  check("P1 取消删除：项目保留", (await page.locator('div[role="button"]').filter({ hasText: "v2910夹具·删除目标" }).count()) > 0);
  await page.locator('div[role="button"]').filter({ hasText: "v2910夹具·删除目标" }).first().getByRole("button", { name: "删除" }).click();
  await sleep(600);
  await page.getByRole("button", { name: "确认删除" }).click();
  check("P1 确认删除：toast「项目已删除」", await waitText("项目已删除", 10000));
  await sleep(800);
  check("P1 确认删除：卡片消失", (await page.locator('div[role="button"]').filter({ hasText: "v2910夹具·删除目标" }).count()) === 0);

  // ===== 清理 =====
  await cleanup(B.id);
  await db.$disconnect();
  await browser.close();

  console.log(`\n断言: ${pass} passed, ${fail} failed`);
  console.log("pageerror:", errors.length ? errors.join(" | ") : "none");
  process.exit(fail === 0 && errors.length === 0 ? 0 : 1);
})();
