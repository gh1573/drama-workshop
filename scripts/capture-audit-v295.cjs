/**
 * v2.9.5 全局产品走查截图采集——新用户空态动线 + 回访用户交付动线：
 * 空态首屏(左列题材+右列导览) → 右列中部(声明条/亮点卡) → 右列底部(示例成片/连载身份)
 * → 左列滚屏(剧本要素 → 拍摄配置[v2.9.3 语言化] → 机组下拉展开 → 全组开机 CTA)
 * → 项目库 → 载入会话(五页签) → 创作下一集 Dialog
 * 用法：node scripts/capture-audit-v295.cjs
 */
const { chromium } = require("playwright");
const fs = require("node:fs");

const BASE = "http://localhost:3000";
const SHOTS = "/tmp/audit-v295";
fs.mkdirSync(SHOTS, { recursive: true });

(async () => {
  const browser = await chromium.launch();
  const ctx = browser.newContext ? await browser.newContext({ viewport: { width: 1728, height: 1080 } }) : null;
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => m.type() === "error" && errors.push("console: " + m.text().slice(0, 200)));

  const shot = async (name) => {
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${SHOTS}/${name}.png` });
    console.log("shot:", name);
  };
  /** 滚动指定列（左列/右列都是 lg:overflow-y-auto 内滚容器） */
  const scrollCol = async (colIndex, ratio) => {
    await page.evaluate(([idx, r]) => {
      const cols = document.querySelectorAll("main .grid > div");
      const col = cols[idx];
      if (col) col.scrollTop = col.scrollHeight * r;
    }, [colIndex, ratio]);
  };

  await page.goto(BASE, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(1500);

  // ===== 空态：新用户 30 秒第一眼 =====
  await shot("01-empty-top");
  await scrollCol(1, 0.28);
  await shot("02-empty-right-mid");
  await scrollCol(1, 0.62);
  await shot("03-empty-right-lower");
  await scrollCol(1, 1);
  await shot("04-empty-right-bottom");
  await scrollCol(1, 0);

  // ===== 左列创作配置三步（开机前动线） =====
  await scrollCol(0, 0.18);
  await shot("05-config-genre-synopsis");
  await scrollCol(0, 0.55);
  await shot("06-config-model");
  // 机组下拉展开（v2.9.3 剧组语言选项的视觉呈现）
  try {
    const trigger = page.locator("text=拍摄机组").first();
    await trigger.scrollIntoViewIfNeeded({ timeout: 5000 });
    await page.waitForTimeout(300);
    await trigger.click({ timeout: 5000 });
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${SHOTS}/07-config-model-dropdown.png` });
    console.log("shot: 07-config-model-dropdown");
    await page.keyboard.press("Escape");
  } catch (e) {
    console.log("dropdown capture skipped:", e.message.slice(0, 80));
  }
  await scrollCol(0, 1);
  await shot("08-config-cta");

  // ===== 项目库（回访：已产出在哪） =====
  await scrollCol(0, 0);
  await page.getByRole("button", { name: "项目库" }).click({ timeout: 10000 });
  await page.waitForSelector('[role="dialog"]', { timeout: 10000 });
  await page.waitForTimeout(1200);
  await shot("09-library");

  // ===== 载入会话（演示项目） =====
  const card = page.locator('[role="dialog"] [role="button"]').filter({ hasText: "战神逆袭" }).first();
  await card.click({ timeout: 10000 });
  await page.waitForTimeout(3000);
  await shot("10-session-overview");

  // ===== 五页签 =====
  const tabs = [
    ["剧本", "11-tab-script"],
    ["资产", "12-tab-assets"],
    ["分镜|故事板", "13-tab-board"],
    ["节奏", "14-tab-rhythm"],
    ["成片", "15-tab-cut"],
  ];
  for (const [label, name] of tabs) {
    const tab = page.getByRole("tab", { name: new RegExp(label) }).first();
    try {
      await tab.click({ timeout: 8000 });
      await page.waitForTimeout(1300);
      await shot(name);
    } catch (e) {
      console.log(`tab ${label} skipped:`, e.message.slice(0, 60));
    }
  }

  // ===== 创作下一集 Dialog（连续剧创作路径动线） =====
  try {
    const cta = page.getByRole("button", { name: /创作下一集/ }).first();
    await cta.scrollIntoViewIfNeeded({ timeout: 6000 });
    await page.waitForTimeout(300);
    await cta.click({ timeout: 6000 });
    await page.waitForSelector('[role="dialog"]', { timeout: 8000 });
    await page.waitForTimeout(1000);
    await shot("16-next-episode-dialog");
  } catch (e) {
    console.log("next-episode dialog skipped:", e.message.slice(0, 80));
  }

  console.log("errors:", errors.length ? errors : "none");
  await browser.close();
})();
