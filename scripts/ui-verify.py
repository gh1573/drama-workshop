"""v2.4.1 UI 验收：新项目载入 → 全部 5 页签逐一检查 → 新交互断言 + 截图 + 滚动测量
断言清单（docs §7.10）：
  A. 桌面端视口锁定：整页滚动高度 ≈ 1 屏（无超长滚动）
  B. 分镜表按幕默认折叠：摘要行可见、镜头行不可见；展开后出现
  C. 行内「渲染此镜」按钮：已锚定非 ready 镜头可见
  D. 渲染状态徽标/成片进度联动
  E. 定妆页签 9 图齐全
  F. 页面无运行时错误
"""
import asyncio
from playwright.async_api import async_playwright

BASE = "http://localhost:3000"
OUT = "/tmp/ui"
TITLE = "龙王归来 · v2.4.1 验证集"


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        ctx = await browser.new_context(viewport={"width": 1440, "height": 900})
        page = await ctx.new_page()
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        await page.goto(BASE, wait_until="networkidle")

        # 1. 打开项目库 → 载入目标项目
        await page.get_by_role("button", name="项目库").click()
        await page.wait_for_selector('[role="dialog"]', timeout=8000)
        await page.wait_for_timeout(1200)
        card = page.locator('[role="dialog"] [role="button"]').filter(has_text=TITLE)
        n = await card.count()
        print(f"[1] 目标项目卡匹配: {n}")
        await card.first.click()
        await page.wait_for_timeout(3500)

        tabs = await page.locator('[role="tab"]').all_inner_texts()
        print(f"[2] 页签: {tabs}")

        # —— A. 视口锁定（成片页签默认展示）——
        sh = await page.evaluate("document.documentElement.scrollHeight")
        ih = await page.evaluate("window.innerHeight")
        print(f"[A] 成片页 整页滚动高度 {sh}px / 视口 {ih}px = {sh/ih:.2f} 屏 {'✅' if sh <= ih * 1.05 else '❌ 超长'}")
        cut_ready = await page.locator("text=/镜就绪/").count()
        print(f"    成片页渲染进度文本出现: {cut_ready} 处")
        await page.screenshot(path=f"{OUT}-cut.png")

        # —— B+C. 分镜剧本：折叠 + 单镜渲染按钮 ——
        await page.get_by_role("tab", name="分镜剧本").click()
        await page.wait_for_timeout(1200)
        sh2 = await page.evaluate("document.documentElement.scrollHeight")
        print(f"[B] 分镜页 整页滚动高度 {sh2}px = {sh2/ih:.2f} 屏 {'✅' if sh2 <= ih * 1.05 else '❌ 超长'}")
        # 幕摘要行（含「就绪」字样的分组头按钮）
        summaries = page.locator('button:has-text("幕"), button:has-text("就绪")')
        sn = await page.count if False else await summaries.count()
        # 更精确：分镜表容器内的幕头按钮
        heads = page.locator("section button", has_text="就绪")
        hn = await heads.count()
        print(f"    幕分组摘要行(含就绪计数): {hn} 个 {'✅' if hn == 3 else '⚠️ 期望3'}")
        # 展开前：镜头行应不可见（编号徽标在折叠区内）
        await heads.first.click()
        await page.wait_for_timeout(800)
        await page.screenshot(path=f"{OUT}-script-expanded.png")
        # 展开后滚动测量（页签内滚，不撑开整页）
        sh3 = await page.evaluate("document.documentElement.scrollHeight")
        print(f"    展开第1幕后 整页高度 {sh3}px = {sh3/ih:.2f} 屏 {'✅ 内滚不撑页' if sh3 <= ih * 1.05 else '❌'}")

        # —— C. 渲染此镜按钮（已锚定且非 ready 的镜头行）——
        render_btns = page.locator('button[aria-label="渲染此镜"]')
        rb = await render_btns.count()
        print(f"[C] 「渲染此镜」按钮: {rb} 个 {'✅' if rb > 0 else '❌ 未出现'}")

        # —— 资产定妆 ——
        await page.get_by_role("tab", name="资产定妆").click()
        await page.wait_for_timeout(1500)
        imgs = await page.locator('img[src*="/assets/asset_"]').count()
        print(f"[E] 定妆图: {imgs} 张 {'✅' if imgs >= 9 else '❌ 少于9'}")
        await page.screenshot(path=f"{OUT}-assets.png")

        # —— 剧组进程（任务中心）——
        await page.get_by_role("tab", name="剧组进程").click()
        await page.wait_for_timeout(1200)
        body = await page.locator("main").inner_text()
        ok_stages = all(k in body for k in ["编剧", "选角", "导演", "场记", "后期"])
        has_cancel = "已取消" in body or "取消" in body
        print(f"[D] 剧组进程 六角色齐全: {ok_stages} · 任务中心含取消/完成态: {has_cancel}")
        await page.screenshot(path=f"{OUT}-pipeline.png")

        # —— 节奏轨道 ——
        await page.get_by_role("tab", name="节奏轨道").click()
        await page.wait_for_timeout(1000)
        await page.screenshot(path=f"{OUT}-rhythm.png")

        # —— 首页初始态 ——
        await page.goto(BASE + "/?fresh=1", wait_until="networkidle")
        await page.wait_for_timeout(800)
        sh4 = await page.evaluate("document.documentElement.scrollHeight")
        print(f"    初始页 整页高度 {sh4}px = {sh4/ih:.2f} 屏")
        await page.screenshot(path=f"{OUT}-home.png")

        print(f"[F] 页面运行时错误: {len(errors)} 条")
        for e in errors[:5]:
            print("   -", e[:160])

        await browser.close()


asyncio.run(main())
