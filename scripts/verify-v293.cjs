/**
 * v2.9.3 模型参数用户语言化验证——桌面端（移动端明确暂缓）：
 * 1. 新建流程第三步「拍摄配置」：4 个下拉展开实拍 + 剧组语言断言
 * 2. 导演讲戏开关区块
 * 3. 项目库载入会话 → 信息卡映射值断言（无裸工程值 low/medium/high 泄漏）
 * 用法：node scripts/verify-v293.cjs
 */
const { chromium } = require("playwright");
const fs = require("node:fs");

const BASE = "http://localhost:3000";
const SHOTS = "/tmp/v293-shots";
fs.mkdirSync(SHOTS, { recursive: true });

const assertions = [];
function check(name, ok, detail) {
  assertions.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? " — " + detail : ""}`);
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1728, height: 1080 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => m.type() === "error" && errors.push("console: " + m.text().slice(0, 200)));

  await page.goto(BASE, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(1500);

  // —— 1. 滚到第三步「拍摄配置」面板 ——
  const panelTitle = page.getByText("拍摄配置", { exact: true }).first();
  await panelTitle.scrollIntoViewIfNeeded({ timeout: 10000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${SHOTS}/01-shoot-config-panel.png` });
  check("第三步标题改为「拍摄配置」", await panelTitle.isVisible().catch(() => false));
  check("字段「拍摄机组」出现", await page.getByText("拍摄机组", { exact: true }).first().isVisible().catch(() => false));
  check("字段「编剧室深度」出现", await page.getByText("编剧室深度", { exact: true }).first().isVisible().catch(() => false));
  check("字段「成片规格」出现", await page.getByText("成片规格", { exact: true }).first().isVisible().catch(() => false));
  check("「导演讲戏」区块出现", await page.getByText("导演讲戏", { exact: true }).first().isVisible().catch(() => false));

  // —— 2. 依次展开 4 个下拉，断言剧组语言选项 ——
  const dropdowns = [
    { label: "拍摄机组", expect: ["主力机组 · Pro", "快拍机组 · Flash"], shot: "02-dd-unit" },
    { label: "编剧室深度", expect: ["初稿直拍", "两稿打磨", "围读深磨"], shot: "03-dd-writers" },
    { label: "单镜时长", expect: ["快切", "标准镜", "长镜头"], shot: "04-dd-duration" },
    { label: "成片规格", expect: ["样片粗剪", "流媒体成片", "高清母版"], shot: "05-dd-resolution" },
  ];
  for (const dd of dropdowns) {
    const trigger = page.locator("label", { hasText: dd.label }).first()
      .locator("xpath=following-sibling::button[1]");
    if (await trigger.isVisible().catch(() => false)) {
      await trigger.click({ timeout: 8000 });
      await page.waitForTimeout(700);
      await page.screenshot({ path: `${SHOTS}/${dd.shot}.png` });
      const listboxText = (await page.locator('[role="listbox"]').innerText().catch(() => "")) || "";
      const missing = dd.expect.filter((w) => !listboxText.includes(w));
      check(`下拉「${dd.label}」剧组语言选项`, missing.length === 0, missing.length ? "缺: " + missing.join("/") + " | 实际: " + listboxText.replace(/\n/g, "/") : listboxText.replace(/\n/g, " / "));
      await page.keyboard.press("Escape");
      await page.waitForTimeout(300);
    } else {
      check(`下拉「${dd.label}」触发器可寻址`, false, "label 相邻按钮未找到");
    }
  }

  // —— 3. 项目库载入会话 → 信息卡剧组语言值 ——
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByRole("button", { name: "项目库" }).click({ timeout: 10000 });
  await page.waitForSelector('[role="dialog"]', { timeout: 10000 });
  await page.waitForTimeout(1200);
  const card = page.locator('[role="dialog"] [role="button"]').filter({ hasText: /战神逆袭|复仇|逆袭/ }).first();
  if (await card.isVisible().catch(() => false)) {
    await card.click({ timeout: 10000 });
    await page.waitForTimeout(3000);
    const bodyText = await page.locator("body").innerText();
    const infoCardVisible = /拍摄机组|单镜规格|编剧深度/.test(bodyText);
    check("信息卡字段剧组语言化（拍摄机组/单镜规格/编剧深度）", infoCardVisible);
    const crewValue = (bodyText.match(/(主力机组 · Pro|快拍机组 · Flash)/) || [])[1];
    check("信息卡机组值走映射", !!crewValue, crewValue || "未找到机组映射值");
    // 裸工程值泄漏检查：信息卡里不应再有孤立 low/medium/high 值格
    const rawLeak = /\n(low|medium|high)\n/.test(bodyText);
    check("无裸思考深度工程值泄漏", !rawLeak);
    await page.screenshot({ path: `${SHOTS}/06-info-card.png` });
  } else {
    check("项目库存在可载入项目", false, "未找到种子项目卡");
  }

  console.log("ERRORS:", errors.length ? errors.join("\n") : "none");
  const failed = assertions.filter((a) => !a.ok).length;
  console.log(`ASSERTIONS: ${assertions.length - failed}/${assertions.length} passed`);
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
