/**
 * v2.9.6 全局走查截图采集——新用户「首屏转化」面深化：
 * 新用户第一眼（首屏整屏）→ 主 CTA 空点（toast 指引形态）→ 示例梗概填充后状态
 * → 拍摄配置全貌 → 机型下拉 → 时长预期表达 → 项目库空列表（若无）
 * 用法：node scripts/capture-audit-v296.cjs
 */
const { chromium } = require("playwright");
const fs = require("node:fs");

const BASE = "http://localhost:3000";
const SHOTS = "/tmp/audit-v296";
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
  const scrollCol = async (colIndex, ratio) => {
    await page.evaluate(([idx, r]) => {
      const cols = document.querySelectorAll("main .grid > div");
      const col = cols[idx];
      if (col) col.scrollTop = col.scrollHeight * r;
    }, [colIndex, ratio]);
  };

  await page.goto(BASE, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(1800);

  // ===== 1. 新用户第一眼：首屏整屏 =====
  await shot("01-first-paint");

  // ===== 2. 主 CTA 空点：新用户什么都没填直接点开机（最短路径试错） =====
  await page.getByRole("button", { name: /全组开机/ }).first().click({ timeout: 8000 });
  await page.waitForTimeout(700);
  await shot("02-cta-empty-click-toast");
  await page.waitForTimeout(2500); // 等 toast 消散

  // ===== 3. 左列输入区滚屏：题材 → 梗概 → 拍摄配置（转化表单全貌） =====
  await scrollCol(0, 0.12);
  await shot("03-left-genre");
  await scrollCol(0, 0.42);
  await shot("04-left-synopsis");
  await scrollCol(0, 0.75);
  await shot("05-left-model");
  await scrollCol(0, 1);
  await shot("06-left-cta-bottom");

  // ===== 4. 填充示例梗概 → 一键就绪态 =====
  await scrollCol(0, 0.3);
  await page.getByRole("button", { name: "填充示例梗概" }).click({ timeout: 8000 });
  await page.waitForTimeout(500);
  await shot("07-synopsis-filled");
  await scrollCol(0, 1);
  await shot("08-ready-to-roll");

  // ===== 5. 右列滚屏复核（首屏之下的价值证明链） =====
  await scrollCol(1, 0.3);
  await shot("09-right-mid");
  await scrollCol(1, 0.75);
  await shot("10-right-lower");

  // ===== 6. 示例成片播放态（第一价值时刻的声画验证） =====
  await scrollCol(1, 0.55);
  try {
    await page.locator("video").first().click({ timeout: 5000 });
    await page.waitForTimeout(1600);
    await shot("11-sample-video-playing");
    await page.locator("video").first().click().catch(() => {});
  } catch (e) {
    console.log("video play skipped:", e.message.slice(0, 60));
  }

  if (errors.length) console.log("ERRORS:\n" + errors.join("\n"));
  else console.log("no page errors");
  await browser.close();
})();
