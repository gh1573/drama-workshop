"""补充验证：资产库三个类型页签的定妆图数量 + 导出角色定妆图为独立文件供 VLM 核验"""
import asyncio
from playwright.async_api import async_playwright

BASE = "http://localhost:3000"
TITLE = "龙王归来 · v2.4.1 验证集"


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        ctx = await browser.new_context(viewport={"width": 1440, "height": 900})
        page = await ctx.new_page()
        await page.goto(BASE, wait_until="networkidle")
        await page.get_by_role("button", name="项目库").click()
        await page.wait_for_selector('[role="dialog"]', timeout=8000)
        await page.wait_for_timeout(1200)
        await page.locator('[role="dialog"] [role="button"]').filter(has_text=TITLE).first.click()
        await page.wait_for_timeout(3000)

        await page.get_by_role("tab", name="资产定妆").click()
        await page.wait_for_timeout(1000)
        for kind in ["角色", "场景", "道具"]:
            await page.get_by_role("tab", name=f"{kind}").click()
            await page.wait_for_timeout(800)
            imgs = await page.locator('img[src*="/assets/asset_"]').count()
            print(f"  {kind}页签: {imgs} 张定妆图")
        # 回角色页签截图（供 VLM 核验人物面孔）
        await page.get_by_role("tab", name="角色").click()
        await page.wait_for_timeout(800)
        await page.screenshot(path="/tmp/ui-assets-char.png", full_page=False)
        print("已导出 /tmp/ui-assets-char.png")

        await browser.close()


asyncio.run(main())
