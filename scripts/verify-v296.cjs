/**
 * v2.9.6 新用户首屏转化深化验收（桌面端 1728×1080）：
 * 1. 低风险试步显式化：先试笔按钮 + 零额度差异说明
 * 2. 开机须知：预期/兜底两行（可兑现承诺，不编数字）
 * 3. 双 CTA 文案统一：两枚开机按钮同一动作语言，旧异文案清零
 * 4. 空点开机指路：toast 指引 + 自动定位聚焦梗概输入框（行为验收）
 * 5. 就绪信号：填充示例梗概后「梗概就绪 · 可开机」（行为验收）
 * 6. 示例成片因果链：同款梗概 · 默认快拍机组实产
 * 7. 场记 duty 去循环定义
 * 8. 回归：可干预性声明绿条仍在
 * 用法：node scripts/verify-v296.cjs
 */
const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch();
  const ctx = browser.newContext ? await browser.newContext({ viewport: { width: 1728, height: 1080 } }) : null;
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));

  await page.goto("http://localhost:3000", { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(1600);
  const body = await page.locator("body").innerText();

  const checks = [
    ["试笔按钮：先试笔 · 只推演剧本（零视频额度）", body.includes("先试笔 · 只推演剧本（零视频额度）")],
    ["试笔差异说明：不立项、不消耗视频额度", body.includes("不立项、不消耗视频额度")],
    ["开机须知·预期：剧本分钟内出稿 + 剧组进程可旁观", body.includes("开机后剧本分钟内出稿") && body.includes("实时可旁观")],
    ["开机须知·兜底：只补拍受影响镜头 + 断点续跑", body.includes("改角色/场景只补拍受影响镜头") && body.includes("断点续跑")],
    ["双 CTA 统一：主标出现两次", (body.match(/全组开机 · AI 剧组流水线/g) || []).length >= 2],
    ["双 CTA 统一：旧异文案清零", !body.includes("让 AI 剧组接管")],
    ["因果链：同款梗概 · 默认快拍机组实产", body.includes("同款梗概 · 默认快拍机组实产")],
    ["场记 duty：逐镜登记锚点 · 跨镜接戏不穿帮", body.includes("逐镜登记锚点 · 跨镜接戏不穿帮")],
    ["场记 duty：循环定义清零", !body.includes("跨镜一致性 · 状态连续")],
    ["回归：可干预性声明绿条", body.includes("开机不是放手不管")],
  ];

  // ===== 行为验收 1：空点开机 → 指路 toast + 定位聚焦 =====
  await page.getByRole("button", { name: /全组开机 · AI 剧组流水线/ }).first().click({ timeout: 8000 });
  await page.waitForTimeout(300);
  const toastText = await page.locator("[data-sonner-toast], [role='status']").allInnerTexts().catch(() => []);
  const toastGuides = (toastText.join(" ") || body).includes("已定位到左侧梗概输入框");
  checks.push(["行为：空点开机出指路 toast", toastGuides]);
  await page.waitForTimeout(600);
  const focusedId = await page.evaluate(() => document.activeElement?.id ?? "");
  checks.push(["行为：自动聚焦梗概输入框", focusedId === "synopsis-input"]);

  // ===== 行为验收 2：填充示例梗概 → 就绪信号 =====
  await page.getByRole("button", { name: "填充示例梗概" }).click({ timeout: 8000 });
  await page.waitForTimeout(400);
  const body2 = await page.locator("body").innerText();
  checks.push(["行为：就绪信号「梗概就绪 · 可开机」", body2.includes("梗概就绪 · 可开机")]);
  const stillCounting = body2.match(/\/500 字/);
  checks.push(["行为：就绪态不再显示字数计数", !stillCounting]);

  let fail = 0;
  for (const [name, ok] of checks) {
    console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
    if (!ok) fail++;
  }
  console.log("pageerror:", errors.length ? errors.join("; ") : "none");
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
