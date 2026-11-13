/**
 * 验证：载入系列第 1 集 → 成片页「续写下一集」CTA → 弹窗 → 创建第 N+1 集
 * 动线 + 项目库系列分组「续写」按钮直发 + 信息卡连载徽标。
 *
 * v2.9.2 脚本工程化整改：
 *  - 断言动态化：创建前经 API 查系列现有集数 N，断言新集徽标为「第 N+1 集」
 *    （旧版写死「第 3 集」，演示数据集数变化后必然误报 FAIL）；
 *  - 自清理：断言完成后 DELETE 本脚本创建的新集，并把项目库恢复到运行前状态——
 *    反复回归不再给演示库堆积空壳集（旧版每次运行净增 1 个 0 剧本空集）。
 */
const { chromium } = require("playwright");
const fs = require("node:fs");

const BASE = "http://localhost:3000";
const SHOTS = "/tmp/series-shots";
fs.mkdirSync(SHOTS, { recursive: true });

const api = async (path, init) => {
  const res = await fetch(`${BASE}${path}`, init);
  const body = await res.json();
  return body.data ?? body;
};

(async () => {
  const before = (await api("/api/projects")).filter((x) => x.seriesTitle === "战神逆袭");
  const maxEp = before.reduce((m, x) => Math.max(m, x.episodeNo ?? 0), 0);
  const expectedEp = maxEp + 1;
  if (before.length === 0) throw new Error("前置失败：演示系列不存在，先跑 seed-demo-project.mjs");

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1728, height: 1080 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

  const results = [];
  const check = (name, ok) => {
    results.push(`${ok ? "PASS" : "FAIL"} ${name}`);
    return ok;
  };

  await page.goto(BASE, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(1200);

  // 打开项目库
  await page.getByRole("button", { name: "项目库" }).click({ timeout: 10000 });
  await page.waitForSelector('[role="dialog"]', { timeout: 10000 });

  // 系列分组 + 分组「创作下一集」按钮
  const seriesHeader = await page.locator('[role="dialog"] li:has-text("连续剧")').first().isVisible().catch(() => false);
  check("项目库系列分组可见", seriesHeader);
  const contBtn = await page.locator('[role="dialog"] button:has-text("下一集")').first().isVisible().catch(() => false);
  check("分组「下一集」按钮存在", contBtn);

  // 载入第 1 集（剧集卡是 div[role=button]；系列组 li 包裹剧集卡，
  // 不能用 li 文本匹配——组 li 同样命中且不触发载入）
  await page.locator('[role="dialog"] div[role="button"]').filter({ hasText: "演示第一集" }).first().click({ timeout: 10000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${SHOTS}/01-session-ep1.png` });

  // 载入成功抽屉应自动收起（v2.9.2：与创建下一集后同语言，省一次手动关闭）
  const drawerClosed = (await page.locator('[role="dialog"]').count()) === 0;
  check("载入后项目库抽屉自动收起", drawerClosed);

  const badge = await page.getByText("战神逆袭 · 第 1 集", { exact: false }).first().isVisible().catch(() => false);
  check("信息卡连续剧徽标「战神逆袭 · 第 1 集」", badge);

  const nextBtn = await page.getByRole("button", { name: "创作下一集" }).isVisible().catch(() => false);
  check("成片页「创作下一集」CTA", nextBtn);

  await page.getByRole("button", { name: "创作下一集" }).click({ timeout: 10000 });
  const dlg = await page.locator('[role="dialog"]').isVisible().catch(() => false);
  const inheritNote = await page.locator('[role="dialog"]').getByText("沿用", { exact: false }).isVisible().catch(() => false);
  check("创作下一集弹窗打开（沿用说明 + 梗概输入）", dlg && inheritNote);
  await page.screenshot({ path: `${SHOTS}/02-next-episode-dialog.png` });

  // 提交创建（动态断言：第 N+1 集）
  await page.locator('[role="dialog"] textarea').fill("婚礼现场再起波澜，神秘来信揭开五年前车祸真相，战神身份面临暴露危机。");
  await page.locator('[role="dialog"] button:has-text("创建")').click({ timeout: 10000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${SHOTS}/03-after-create.png` });

  const newBadge = await page.getByText(`第 ${expectedEp} 集`, { exact: false }).first().isVisible().catch(() => false);
  check(`新集创建后自动切会话（第 ${expectedEp} 集徽标可见）`, newBadge);

  // —— 自清理：删除本次创建的新集，恢复运行前状态 ——
  const after = (await api("/api/projects")).filter((x) => x.seriesTitle === "战神逆袭");
  const created = after.find((x) => x.episodeNo === expectedEp);
  if (created) {
    await fetch(`${BASE}/api/projects/${created.id}`, { method: "DELETE" });
    const restored = (await api("/api/projects")).filter((x) => x.seriesTitle === "战神逆袭");
    check(`自清理完成（系列恢复 ${before.length} 集）`, restored.length === before.length);
  } else {
    check("自清理完成（系列恢复原集数）", false);
  }

  if (errors.length) console.log("[console errors]\n" + errors.slice(0, 8).join("\n"));
  console.log(results.join("\n"));
  await browser.close();
  process.exit(results.some((r) => r.startsWith("FAIL")) ? 1 : 0);
})();
