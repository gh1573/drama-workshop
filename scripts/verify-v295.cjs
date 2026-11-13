/**
 * v2.9.5 连载生产线会话态表达验证（桌面端 1728×1080）：
 * 1. 信息卡「系列连载」区块：系列标题 / 集数 / 当前集 chip
 * 2. 跨页签续写可达：剧本页签（非成片页签）也能从信息卡发起续写
 * 3. 续写弹窗「上集留钩」回顾条（卡点留钩场摘录）
 * 4. 弹窗「AI 接钩子写本集走向」按钮存在
 * 5. 成片页签制作包清单行常显
 * 6. 载入已合成项目默认落「成片」页签（终点是交付物）
 * 7. 空态拍摄配置「默认即可开机」提示行（消除必选项焦虑）
 * 8. AI 接钩子 API 合约：POST → { synopsis }（承接上集钩子的中文走向，可创建）
 * 用法：node scripts/verify-v295.cjs
 */
const { chromium } = require("playwright");

const BASE = "http://localhost:3000";
let fail = 0;
let pass = 0;
const check = (ok, msg) => {
  if (ok) {
    pass++;
    console.log("PASS", msg);
  } else {
    fail++;
    console.error("FAIL", msg);
  }
};

(async () => {
  const browser = await chromium.launch();

  // ===== 会话态：载入演示项目（已合成） =====
  const ctx = await browser.newContext({ viewport: { width: 1728, height: 1080 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));

  await page.goto(BASE, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(1500);
  await page.getByRole("button", { name: "项目库" }).click({ timeout: 10000 });
  await page.waitForSelector('[role="dialog"]', { timeout: 10000 });
  const card = page.locator('[role="dialog"] [role="button"]').filter({ hasText: "战神逆袭" }).first();
  await card.click({ timeout: 10000 });
  await page.waitForTimeout(3000);

  // 6) 载入已合成项目默认落成片页签
  check(
    await page.getByRole("button", { name: "下载成片 MP4" }).isVisible().catch(() => false),
    "载入已合成项目默认落「成片」页签（交付物直达）"
  );

  // 1) 信息卡连续剧区块
  const infoText = await page.locator("body").innerText();
  check(infoText.includes("连续剧 · 战神逆袭"), "信息卡：连续剧区块（系列标题）");
  check(/\d\s*集$|\d\s*集\s|1 集/.test(infoText.replace(/\u00a0/g, " ")), "信息卡：集数统计");
  check(await page.locator("button", { hasText: "第 1 集" }).first().isVisible().catch(() => false), "信息卡：第 1 集 chip 可见");

  // 2) 跨页签创作下一集：切到剧本页签，信息卡创作下一集按钮仍可用
  await page.getByRole("tab", { name: /剧本/ }).first().click({ timeout: 8000 });
  await page.waitForTimeout(900);
  const contBtn = page.locator("button", { hasText: "创作第 2 集 · 沿用角色定妆" }).first();
  check(await contBtn.isVisible().catch(() => false), "剧本页签：信息卡「创作第 2 集」入口可达（跨页签主动线）");
  await contBtn.click({ timeout: 8000 });
  await page.waitForSelector('[role="dialog"]', { timeout: 8000 });
  await page.waitForTimeout(800);
  const dialogText = await page.locator('[role="dialog"]').innerText();

  // 3) 上集留钩回顾条
  check(dialogText.includes("上集留钩"), "弹窗：上集留钩回顾条");
  check(dialogText.includes("旧账新算"), "弹窗：回顾条取卡点留钩场（第 3 场「旧账新算」）");

  // 4) AI 接钩子按钮
  check(
    await page.locator('[role="dialog"] button', { hasText: "AI 接钩子写本集走向" }).isVisible().catch(() => false),
    "弹窗：AI 接钩子写本集走向（降门槛不代笔）"
  );
  check(dialogText.includes("同一角色跨集同一张脸"), "弹窗：继承说明保留（回归不破坏）");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);

  // 5) 成片页签制作包清单
  const cutTab = page.getByRole("tab", { name: /成片/ }).first();
  await cutTab.click({ timeout: 8000 });
  await page.waitForTimeout(1200);
  const cutText = await page.locator("body").innerText();
  check(
    cutText.includes("制作包含：镜头素材 · 定妆图 · 分镜表 · 字幕 · 配音 · 工程档案"),
    "成片页签：制作包清单常显（ZIP 内容可见）"
  );
  check(cutText.includes("创作下一集"), "成片页签：创作下一集 CTA 回归保留");
  await ctx.close();

  // ===== 空态：拍摄配置提示行 =====
  const ctx2 = await browser.newContext({ viewport: { width: 1728, height: 1080 } });
  const page2 = await ctx2.newPage();
  page2.on("pageerror", (e) => errors.push("empty pageerror: " + e.message));
  await page2.goto(BASE, { waitUntil: "networkidle", timeout: 60000 });
  await page2.waitForTimeout(1500);
  const emptyText = await page2.locator("body").innerText();
  check(
    emptyText.includes("拿不准就用默认机组直接开机"),
    "空态：拍摄配置「默认即可开机」提示行（进阶微调定位）"
  );
  await ctx2.close();

  // ===== API 合约：AI 接钩子 =====
  try {
    const list = await (await fetch(`${BASE}/api/projects`)).json();
    const demo = list.data.find((p) => p.title.includes("演示第一集"));
    if (!demo) throw new Error("演示项目不在库");
    const res = await fetch(`${BASE}/api/projects/${demo.id}/next-episode-synopsis`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    const json = await res.json();
    const okShape = res.ok && json.ok && typeof json.data.synopsis === "string";
    check(okShape, "API：AI 接钩子返回 { synopsis }（HTTP " + res.status + "）");
    if (okShape) {
      const s = json.data.synopsis;
      check(s.length >= 30 && s.length <= 300, `API：梗概长度合理（${s.length} 字）`);
      check(!s.startsWith("{") && !s.includes("```"), "API：输出为正文（无 JSON/代码块污染）");
      console.log("    AI 草稿预览：" + s.slice(0, 80) + "…");
    }
  } catch (e) {
    check(false, "API：AI 接钩子合约 — " + e.message);
  }

  check(errors.length === 0, "零 pageerror" + (errors.length ? "：" + errors[0] : ""));
  console.log(`\nASSERTIONS: ${pass}/${pass + fail} passed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
