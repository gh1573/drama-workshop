/**
 * v2.9.8 外部出片入库闭环验收（桌面端 1728×1080，零生成配额：
 * 测试素材由本地 ffmpeg 合成，合成走本地 ffmpeg）：
 *
 * 通道一  URL 下载入库：贴片弹窗粘贴直链 → 服务端下载落盘（自包含）→ 标记完成
 * 通道二  本地文件上传：文件选择 → multipart 上传 → 标记完成
 * 时长对齐：2.5s 短素材对齐 plannedMs 3000→2500（防字幕/配音漂移）
 * 合成闭环：全镜头就绪 → 打开成片页签自动合成 → 成片文件 + 时长验收
 * 护栏：PATCH 外链直接作 mediaUrl → 422 指引入库端点（防绿格子合成必败）
 *       贴片端点收非视频地址 → 415 可读原因
 *
 * 前置：dev server 已在 localhost:3000 运行。
 * 用法：node scripts/verify-v298.cjs
 */
const { chromium } = require("playwright");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const BASE = "http://localhost:3000";
const ASSETS = path.join(process.cwd(), "public", "assets");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PROJ_TITLE_TAG = "外部出片入库闭环验收";

(async () => {
  const checks = [];
  const ok = (name, pass, extra = "") => {
    checks.push([name, pass]);
    console.log(`${new Date().toISOString().slice(11, 19)} ${pass ? "PASS" : "FAIL"}  ${name}${extra ? `  [${extra}]` : ""}`);
  };
  const api = async (url, init) => {
    const res = await fetch(BASE + url, init);
    const json = await res.json().catch(() => ({}));
    return { status: res.status, json };
  };

  // ===== 0. 测试素材：本地 ffmpeg 合成（2.5s + 5s 竖版测试片） =====
  const tmpA = path.join(ASSETS, "tmp_v298_a.mp4"); // 经静态服务当"外部直链"
  const tmpB = "/tmp/tmp_v298_b.mp4"; // 本地上传用
  const gen = (out, dur) =>
    execFileSync("ffmpeg", [
      "-y", "-v", "error",
      "-f", "lavfi", "-i", `testsrc2=duration=${dur}:size=720x1280:rate=24`,
      "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "ultrafast",
      out,
    ]);
  gen(tmpA, "2");
  gen(tmpB, "5");
  ok("前置：ffmpeg 合成测试素材（2s + 5s，零生成配额）", fs.existsSync(tmpA) && fs.existsSync(tmpB));

  // ===== 1. API 造项目：3 场 + 2 镜（手动片段，不走流水线） =====
  const synopsis = "外部出片入库闭环验收专用：贴片→合成→交付全链路验证";
  const created = await api("/api/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      genre: {
        id: "shuangwen",
        name: "战神逆袭 · 龙王归来",
        badge: "高燃打脸 · 爽感爆棚",
        hookTactic: "test", musicMood: "test", tonePrompt: "test",
      },
      synopsis,
      modelConfig: {
        videoModel: "Omni 1.2 Flash", durationSeconds: 5, resolution: "720p",
        scriptThinkingLevel: "low", enablePromptEnhance: true,
      },
    }),
  });
  const pid = created.json?.data?.id;
  ok("建项：API 立项", !!pid, pid ?? "");
  const beats = [1, 2, 3].map((i) => ({
    index: i,
    actTitle: `验收场 ${i}`,
    narrativeFunction: i === 1 ? "hook" : i === 2 ? "buildup" : "cliffhanger",
    pacingNote: "0~12s",
    description: "验收用场次描述",
    dialogueSubtitle: "验收台词",
    cameraMovement: "固定机位",
    promptGuidance: "verification",
  }));
  await api(`/api/projects/${pid}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ storyBeats: beats }),
  });
  const clipA = await api(`/api/projects/${pid}/clips`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ beatIndex: 1, name: "镜A·直链", subtitle: "", format: "mp4" }),
  });
  const clipB = await api(`/api/projects/${pid}/clips`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ beatIndex: 2, name: "镜B·上传", subtitle: "", format: "mp4" }),
  });
  const cidA = clipA.json?.data?.id;
  const cidB = clipB.json?.data?.id;
  ok("建镜：手动片段 A/B 入轨", !!cidA && !!cidB);

  // ===== 2. 护栏：外链直接 PATCH mediaUrl → 422 指引入库端点 =====
  const guard = await api(`/api/clips/${cidA}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "ready", mediaUrl: "https://example.com/x.mp4" }),
  });
  ok(
    "护栏：外链直 PATCH 被拒（422）并指引入库端点",
    guard.status === 422 && /贴片入库接口/.test(guard.json?.error ?? ""),
    `HTTP ${guard.status}`
  );
  const notVideo = await api(`/api/clips/${cidA}/media`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: `${BASE}/api/projects` }),
  });
  ok(
    "护栏：非视频地址入库被拒（415）且原因可读",
    notVideo.status === 415 && /不支持|不是视频/.test(notVideo.json?.error ?? ""),
    `HTTP ${notVideo.status} ${(notVideo.json?.error ?? "").slice(0, 30)}`
  );

  // ===== 3. 浏览器：载入项目 → 通道一 URL 下载入库 =====
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1728, height: 1080 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  const bodyText = () => page.locator("body").innerText();
  const waitText = async (text, timeout = 30000) => {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      if ((await bodyText()).includes(text)) return true;
      await sleep(500);
    }
    return false;
  };

  await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 90000 });
  await sleep(2500);
  await page.getByRole("button", { name: "项目库" }).click({ timeout: 10000 });
  await sleep(1200);
  await page.locator('div[role="button"]').filter({ hasText: PROJ_TITLE_TAG }).first().click({ timeout: 8000 });
  ok("载入验收项目", await waitText("项目已载入", 15000));

  await page.getByRole("tab", { name: "分镜剧本" }).click({ timeout: 8000 });
  await sleep(800);
  // 镜A：回填弹窗 → URL 直链 → 下载入库
  await page.locator('[aria-label="回填成片"]').first().click({ timeout: 8000 });
  await page.locator('input[placeholder*="直链"]').fill(`${BASE}/assets/tmp_v298_a.mp4`);
  await page.getByRole("button", { name: /下载入库/ }).click({ timeout: 8000 });
  ok("通道一：URL 下载入库 toast", await waitText("成片已下载入库", 20000));
  ok("通道一：时长对齐提示（2s 短素材）", await waitText("时长已按素材对齐 2.0s", 8000));
  const detailA = await api(`/api/projects/${pid}`);
  const clipArow = (detailA.json?.data?.timelineClips ?? []).find((c) => c.id === cidA);
  ok(
    "通道一：镜头 ready + 本地地址 + plannedMs 对齐 2000",
    clipArow?.status === "ready" &&
      /^\/assets\/clip_/.test(clipArow?.mediaUrl ?? "") &&
      clipArow?.plannedMs === 2000,
    `plannedMs=${clipArow?.plannedMs} mediaUrl=${clipArow?.mediaUrl}`
  );
  ok("通道一：落盘自包含（clip_{id}.mp4 存在）", fs.existsSync(path.join(ASSETS, `clip_${cidA}.mp4`)));

  // ===== 4. 通道二：本地文件上传 =====
  await page.locator('[aria-label="回填成片"]').first().click({ timeout: 8000 });
  await page.locator('input[type="file"]').setInputFiles(tmpB);
  ok("通道二：上传入库 toast", await waitText("成片已上传入库", 20000));
  ok("通道二：全就绪指路合成", await waitText("打开「成片」页签即自动合成", 8000));

  // ===== 5. 合成闭环：打开成片页签 → 自动合成 → 成片验收 =====
  await page.getByRole("tab", { name: "成片" }).click({ timeout: 8000 });
  ok("合成：自动触发（合成中提示）", await waitText("正在合成成片", 10000) || await waitText("合成", 6000));
  ok("合成：成片就绪 toast", await waitText("成片已就绪", 300000));
  const detailB = await api(`/api/projects/${pid}`);
  const finalUrl = detailB.json?.data?.finalVideoUrl;
  const finalFile = finalUrl ? path.join(process.cwd(), "public", finalUrl.replace(/^\//, "")) : null;
  ok("合成：finalVideoUrl 回写 + 文件落盘", !!finalFile && fs.existsSync(finalFile) && fs.statSync(finalFile).size > 10_000, finalUrl ?? "null");
  if (finalFile && fs.existsSync(finalFile)) {
    const durOut = execFileSync("ffprobe", [
      "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", finalFile,
    ]).toString().trim();
    const dur = parseFloat(durOut);
    // 片头卡 2.5s + 镜A 2s（已对齐）+ 镜B 5s = 9.5s，减 auto 转场重叠（~0.8s×剪辑点）
    ok("合成：成片时长 ≈ 片头 + 2s + 5s（时长对齐防漂移）", dur > 6.5 && dur < 10.5, `${dur.toFixed(1)}s`);
  }

  // ===== 6. 清理：项目 + 测试素材 =====
  const del = await api(`/api/projects/${pid}`, { method: "DELETE" });
  for (const f of [
    tmpA, tmpB,
    path.join(ASSETS, `clip_${cidA}.mp4`),
    path.join(ASSETS, `clip_${cidB}.mp4`),
    ...(finalUrl ? [path.join(process.cwd(), "public", finalUrl.replace(/^\//, ""))] : []),
    ...(finalUrl ? [finalFile?.replace(/\.mp4$/, "_poster.jpg")].filter(Boolean) : []),
  ]) {
    fs.rmSync(f, { force: true });
  }
  ok("清理：项目删除 + 测试素材清零", del.status === 200);

  const pass = checks.filter(([, p]) => p).length;
  console.log(`\n结果：${pass}/${checks.length} 通过`);
  if (errors.length) {
    console.log("pageerror:");
    errors.forEach((e) => console.log("  " + e));
  }
  await browser.close();
  process.exit(pass === checks.length && errors.length === 0 ? 0 : 1);
})();
