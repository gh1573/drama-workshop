/**
 * v2.9.6 剧本过稿开机——E2E 转化动线验收（桌面端 1728×1080）：
 * 1. 真实试笔（文本通道一次）→ 首次开机主 CTA 常驻折叠区外（品牌渐变），
 *    红色破坏性「按新配置重新开机」不再出现（没开过机何来「重新」）
 * 2. 点击开机 → POST /runs body.keepScript === true（过稿剧本不重写契约），
 *    且开机前有 PATCH storyBeats 把已过目剧本入库
 * 3. 项目库载入草稿 → CTA 仍为「按已过目剧本拍摄」
 * 4. 改梗概 → CTA 翻转为「AI 剧组流水线」+ 诚实提示重写 → keepScript === false
 * 网络：POST /runs 与 GET /runs/* 被 mock（流水线不真跑，零视频/图像配额）；
 *       试笔 / 立项 / PATCH 均走真实接口（本地 DB，无外部生成通道）
 * 清理：DELETE 本次创建的草稿项目
 * 用法：node scripts/verify-approved-boot.cjs
 */
const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch();
  const ctx = browser.newContext
    ? await browser.newContext({ viewport: { width: 1728, height: 1080 } })
    : null;
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));

  const checks = [];
  const check = (name, ok) => {
    checks.push([name, ok]);
    console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
  };
  const body = async () => page.locator("body").innerText();

  await page.goto("http://localhost:3000", { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(1500);

  // ===== 1. 真实试笔 =====
  await page.getByRole("button", { name: "填充示例梗概" }).click({ timeout: 8000 });
  await page.getByRole("button", { name: /先试笔 · 只推演剧本/ }).click({ timeout: 8000 });
  const firstBootCTA = page.getByRole("button", { name: /全组开机 · 按已过目剧本拍摄/ });
  await firstBootCTA.waitFor({ state: "visible", timeout: 150000 });
  await page.waitForTimeout(600);

  let text = await body();
  check("试笔后：首次开机主 CTA「按已过目剧本拍摄」常驻可见", text.includes("全组开机 · 按已过目剧本拍摄"));
  check("试笔后：红色破坏性「按新配置重新开机」不再出现", !text.includes("按新配置重新开机"));
  check("试笔后：副行承诺「开机不重写」", text.includes("开机不重写"));
  check("试笔后：三段式承接说明（选角定妆 → 导演拆镜 → 后期成片）", text.includes("直接选角定妆 → 导演拆镜 → 后期成片"));

  // ===== 2. mock 开机请求，捕获契约 =====
  const runsBodies = [];
  const patchBodies = [];
  const mockRun = {
    ok: true,
    data: {
      id: "mock-run-e2e",
      status: "running",
      progress: 5,
      stage: "screenwriting",
      stages: [],
      journal: [],
    },
  };
  await page.route("**/api/projects/*/runs", async (route) => {
    if (route.request().method() === "POST") {
      runsBodies.push(route.request().postDataJSON());
      await route.fulfill({ json: mockRun });
    } else {
      await route.fulfill({ json: { ok: true, data: [mockRun.data] } });
    }
  });
  await page.route("**/api/runs/*", async (route) => {
    await route.fulfill({ json: mockRun });
  });
  await page.route("**/api/projects/*", async (route) => {
    if (route.request().method() === "PATCH") {
      try {
        patchBodies.push(route.request().postDataJSON());
      } catch {}
    }
    await route.continue();
  });

  await firstBootCTA.click({ timeout: 8000 });
  await page.waitForTimeout(2500);
  check("开机契约：POST /runs body.keepScript === true", runsBodies.length === 1 && runsBodies[0].keepScript === true);
  check(
    "开机契约：已过目剧本随开机入库（PATCH 含 storyBeats）",
    patchBodies.some((b) => Array.isArray(b.storyBeats) && b.storyBeats.length > 0)
  );

  // ===== 3. 重载 → 项目库载入草稿（回访动线） =====
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await page.getByRole("button", { name: "项目库" }).click({ timeout: 10000 });
  await page.waitForSelector('[role="dialog"]', { timeout: 10000 });
  await page.waitForTimeout(1200);
  const draftCard = page
    .locator('[role="dialog"] [role="button"]')
    .filter({ hasText: /龙王归来 · 赘婿隐忍/ })
    .first();
  await draftCard.click({ timeout: 10000 });
  await page.waitForTimeout(1500);

  text = await body();
  check("载入草稿：首次开机主 CTA 仍为「按已过目剧本拍摄」", text.includes("全组开机 · 按已过目剧本拍摄"));

  // ===== 4. 改梗概 → 诚实翻转（配置折叠区需先展开） =====
  await page.getByRole("button", { name: /调整题材\/梗概/ }).click({ timeout: 8000 });
  await page.waitForTimeout(500);
  const textarea = page.locator("#synopsis-input");
  await textarea.waitFor({ state: "visible", timeout: 8000 });
  await textarea.fill("赘婿隐忍三年，今日寿宴当众清算，反派跪地求饶，龙王身份震动全场！");
  await page.waitForTimeout(600);
  text = await body();
  check("改梗概后：CTA 翻转为「AI 剧组流水线」（将重写）", text.includes("全组开机 · AI 剧组流水线"));
  check("改梗概后：副行诚实提示「重写剧本」", text.includes("重写剧本"));

  const flipCTA = page.getByRole("button", { name: /全组开机 · AI 剧组流水线/ }).first();
  await flipCTA.scrollIntoViewIfNeeded({ timeout: 8000 });
  await flipCTA.click({ timeout: 8000 });
  await page.waitForTimeout(2000);
  check(
    "开机契约：改梗概后 keepScript === false（重写路径）",
    runsBodies.length === 2 && runsBodies[1].keepScript === false
  );

  // ===== 清理：删除本次草稿 =====
  let deleted = false;
  try {
    const res = await page.request.get("http://localhost:3000/api/projects");
    const list = (await res.json()).data || [];
    const draft = list.find((p) => /龙王归来 · 赘婿隐忍/.test(p.title));
    if (draft) {
      const del = await page.request.delete(`http://localhost:3000/api/projects/${draft.id}`);
      deleted = del.ok();
    }
  } catch {}
  check("清理：草稿项目已删除（零残留）", deleted);

  let fail = 0;
  for (const [, ok] of checks) if (!ok) fail++;
  console.log("pageerror:", errors.length ? errors.join("; ") : "none");
  console.log(`\n断言: ${checks.length - fail} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
