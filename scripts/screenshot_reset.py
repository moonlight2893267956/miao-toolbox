"""截图重置密码页面，验证设计效果"""
import os
from playwright.sync_api import sync_playwright

UI = "http://localhost:5179"
OUT = "/Users/wuxiangyi/Desktop/project/vibe-coding/miao-toolbox/screenshots"
os.makedirs(OUT, exist_ok=True)

with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(viewport={"width": 1440, "height": 900})
    page = ctx.new_page()

    # 1. 初始空状态（宽屏）
    page.goto(f"{UI}/reset-password", wait_until="networkidle")
    page.wait_for_timeout(700)
    page.screenshot(path=f"{OUT}/reset-1-wide-empty.png", full_page=False)
    print("✓ reset-1-wide-empty.png")

    # 2. 填邮箱 + 验证码 6 位 + 弱密码（中等屏）
    page.set_viewport_size({"width": 1024, "height": 720})
    page.wait_for_timeout(400)
    page.fill('input[placeholder="name@example.com"]', 'user@qq.com')
    page.wait_for_timeout(300)
    cells = page.locator('.miao-code-cell')
    for i, digit in enumerate('482913'):
        cells.nth(i).fill(digit)
    page.wait_for_timeout(300)
    page.fill('input[placeholder="字母 + 数字，至少 8 位"]', 'abc')
    page.wait_for_timeout(300)
    page.screenshot(path=f"{OUT}/reset-2-medium-weak.png", full_page=False)
    print("✓ reset-2-medium-weak.png")

    # 3. 强密码
    page.fill('input[placeholder="字母 + 数字，至少 8 位"]', 'MyStr0ng!Pass')
    page.fill('input[placeholder="再次输入新密码"]', 'MyStr0ng!Pass')
    page.wait_for_timeout(400)
    page.screenshot(path=f"{OUT}/reset-3-medium-strong.png", full_page=False)
    print("✓ reset-3-medium-strong.png")

    # 4. 窄屏 (mobile) 验证
    page.set_viewport_size({"width": 420, "height": 800})
    page.wait_for_timeout(400)
    page.screenshot(path=f"{OUT}/reset-4-mobile.png", full_page=True)
    print("✓ reset-4-mobile.png")

    browser.close()
print("DONE")