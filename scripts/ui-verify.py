"""一次性 UI 验证：载入成片项目 → 5 个页签逐一检查 → 截图 + 滚动高度测量"""
import asyncio
from playwright.async_api import async_playwright

BASE = "http://localhost:3000"
OUT = "/tmp/ui"


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        ctx = await browser.new_context(viewport={"width": 1440, "height": 900})
        page = await ctx.new_page()
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        await page.goto(BASE, wait_until="networkidle")

        # 1. 打开项目库
        await page.get_by_role("button", name="项目库").click()
        await page.wait_for_selector('[role="dialog"]', timeout=8000)
        await page.wait_for_timeout(1200)

        # 2. 点目标项目卡（最新成片项目：11 片段）
        card = page.locator('[role="dialog"] [role="button"]').filter(
            has_text="赘婿隐忍三年受尽欺凌"
        ).filter(has_text="11 片段")
        n = await card.count()
        print(f"[1] 项目卡片匹配数: {n}")
        await card.first.click()
        await page.wait_for_timeout(3500)

        # 3. 验证工作台页签出现
        tabs = await page.locator('[role="tab"]').all_inner_texts()
        print(f"[2] 页签: {tabs}")

        # 4. 成片页签（载入后默认应在 cut）
        await page.wait_for_timeout(1000)
        video = page.locator("video")
        vn = await video.count()
        if vn:
            src = await video.first.get_attribute("src")
            print(f"[3] 成片播放器: src={src}")
        else:
            print("[3] 成片播放器: 未找到 video 元素!")

        # 滚动高度测量（成片页签）
        sh = await page.evaluate("document.documentElement.scrollHeight")
        ih = await page.evaluate("window.innerHeight")
        print(f"[4] 成片页 滚动高度 {sh}px / 视口 {ih}px = {sh/ih:.2f} 屏")

        await page.screenshot(path=f"{OUT}-cut.png")

        # 5. 资产定妆页签
        await page.get_by_role("tab", name="资产定妆").click()
        await page.wait_for_timeout(1200)
        imgs = await page.locator('img[src*="/assets/asset_"]').count()
        print(f"[5] 资产定妆图数量: {imgs}")
        await page.screenshot(path=f"{OUT}-assets.png")

        # 6. 分镜剧本页签
        await page.get_by_role("tab", name="分镜剧本").click()
        await page.wait_for_timeout(1000)
        sh2 = await page.evaluate("document.documentElement.scrollHeight")
        print(f"[6] 分镜剧本 滚动高度 {sh2}px = {sh2/ih:.2f} 屏")
        await page.screenshot(path=f"{OUT}-script.png")

        # 7. 剧组进程页签
        await page.get_by_role("tab", name="剧组进程").click()
        await page.wait_for_timeout(1000)
        body = await page.locator("main").inner_text()
        ok_stages = all(k in body for k in ["编剧", "选角", "导演", "场记", "后期"])
        print(f"[7] 剧组进程 六角色齐全: {ok_stages}")
        await page.screenshot(path=f"{OUT}-pipeline.png")

        # 8. 节奏轨道
        await page.get_by_role("tab", name="节奏轨道").click()
        await page.wait_for_timeout(1000)
        await page.screenshot(path=f"{OUT}-rhythm.png")

        # 9. 首页垂直高度（初始态）
        await page.goto(BASE + "/?fresh=1", wait_until="networkidle")
        await page.wait_for_timeout(800)
        sh3 = await page.evaluate("document.documentElement.scrollHeight")
        print(f"[8] 初始页 滚动高度 {sh3}px = {sh3/ih:.2f} 屏")
        await page.screenshot(path=f"{OUT}-home.png")

        print(f"[9] 页面运行时错误: {len(errors)} 条")
        for e in errors[:5]:
            print("   -", e[:160])

        await browser.close()


asyncio.run(main())
