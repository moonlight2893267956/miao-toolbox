#!/usr/bin/env python3
"""主题切换 transition 清理 验收脚本

验证 ThemeContext 修改:
  (1) 点击 Switch 后 <html> 的 style.transition 在 250ms 内被清空
  (2) 下拉菜单动画自然、无残留闪烁
  (3) 快速连点 3-4 次后无累积残留

用法: ADMIN_PASSWORD='Admin123' python3 scripts/headless_check_theme_transition.py
前置：后端 :8080、前端 :5173 均已运行
"""
import os, sys, time, subprocess
from playwright.sync_api import sync_playwright

API = "http://localhost:8080"
UI = "http://localhost:5173"
ADMIN_PASS = os.environ.get("ADMIN_PASSWORD", "Admin123")
ss_dir = "screenshots"
os.makedirs(ss_dir, exist_ok=True)

passed, failed = 0, 0
def ok(name, cond, detail=""):
    global passed, failed
    if cond:
        print(f"  ✅ {name}")
        passed += 1
    else:
        print(f"  ❌ {name} — {detail}" if detail else f"  ❌ {name}")
        failed += 1

# —— 登录拿 token ——
r = subprocess.run(
    ["curl", "-s", "-X", "POST", f"{API}/api/auth/login",
     "-H", "Content-Type: application/json",
     "-d", '{"username":"admin","password":"' + ADMIN_PASS + '"}'],
    capture_output=True, text=True, check=True,
)
login_data = subprocess.run(
    ["curl", "-s", "-X", "POST", f"{API}/api/auth/login",
     "-H", "Content-Type: application/json",
     "-d", '{"username":"admin","password":"' + ADMIN_PASS + '"}'],
    capture_output=True, text=True, check=True,
).stdout
login_json = __import__("json").loads(login_data)
if login_json.get("code") != "SUCCESS":
    print("ERROR: 登录失败 -", login_json); sys.exit(1)
TOKEN = login_json["data"]["accessToken"]
USER = login_json["data"]["user"]
SIGNING_KEY = login_json["data"]["signingKey"]
print(">>> 登录成功")

with sync_playwright() as p:
    # 用非持久化 context,避免 stale localStorage
    browser = p.chromium.launch(headless=True)
    ctx = browser.new_context(viewport={"width": 1400, "height": 900})
    page = ctx.new_page()
    page.set_default_timeout(15000)

    # 捕获 pageerror / console error(从首屏开始)
    errors = []
    page.on("pageerror", lambda err: errors.append(f"[pageerror] {err}"))
    page.on("console", lambda msg: errors.append(f"[console.error] {msg.text}")
            if msg.type == "error" else None)

    # 1) Mock /api/auth/refresh 避免 401 链
    page.route("**/api/auth/refresh", lambda route: route.fulfill(
        status=200, content_type="application/json",
        body=__import__("json").dumps(
            {"code": "SUCCESS", "data": {"accessToken": TOKEN, "signingKey": SIGNING_KEY}}),
    ))

    # 2) 通过 UI 走真实登录流(因为 token 存在闭包,无法 localStorage 注入)
    page.goto(f"{UI}/login", wait_until="domcontentloaded")
    page.wait_for_timeout(800)
    # AntD Form 用 id 关联,这里按 name 选择
    page.fill('input[placeholder="用户名"]', "admin")
    page.fill('input[placeholder="密码"]', ADMIN_PASS)
    # 登录按钮是 "登录" 文本
    page.locator('button:has-text("登录")').first.click()
    # 等待登录成功跳转
    page.wait_for_url(lambda url: "/login" not in url, timeout=10000)
    page.wait_for_timeout(1500)

    # 3) 验证已登录
    body_text = page.evaluate("() => document.body.innerText")
    ok("AC0-登录后跳转到主页面", len(body_text.strip()) > 100,
       detail=f"body 长度={len(body_text)}")
    # 检查无白屏 + 无 console 错误
    if errors:
        print("  ⚠️  加载阶段捕获到错误:")
        for e in errors[:5]:
            print(f"    {e}")
    ok("AC0-加载阶段无 pageerror/console.error", len(errors) == 0,
       detail=f"{len(errors)} 个错误")

    # 4) 打开下拉菜单
    # 头像在 sidebar footer 中,先找 .miao-sidebar-footer 内的元素
    avatar = page.locator(".miao-sidebar-footer .ant-avatar").first
    ok("AC1-侧栏底部头像存在", avatar.count() > 0)
    avatar.click()
    page.wait_for_timeout(500)  # dropdown slide 动画
    page.screenshot(path=f"{ss_dir}/theme-01-dropdown-open.png", full_page=True)

    # 5) 检查下拉菜单展开
    dropdown_menu = page.locator(".miao-user-dropdown .ant-dropdown-menu")
    ok("AC1-下拉菜单已展开", dropdown_menu.count() > 0)
    # 检查暗色模式 Switch 存在
    theme_switch = page.locator('.miao-user-dropdown .ant-switch').first
    ok("AC1-暗色模式 Switch 存在", theme_switch.count() > 0)

    # 6) 读初始 transition(应该是空,因为只是打开了 dropdown)
    initial_transition = page.evaluate("() => document.documentElement.style.transition")
    ok("AC2-初始 <html>.style.transition 为空", initial_transition == "",
       detail=f"实际: '{initial_transition}'")

    # 7) 记录当前 data-theme
    theme_before = page.evaluate("() => document.documentElement.getAttribute('data-theme')")
    print(f"  [info] 切换前 data-theme={theme_before}")

    # 8) 点击 Switch
    theme_switch.click()

    # 9) 立即(50ms 内)读 transition — 应该已被设上
    page.wait_for_timeout(50)
    trans_at_50ms = page.evaluate("() => document.documentElement.style.transition")
    print(f"  [info] 点击后 50ms: transition='{trans_at_50ms}'")
    ok("AC3-点击后 <html> 立即获得 transition",
       "background-color" in trans_at_50ms and "color" in trans_at_50ms,
       detail=f"实际: '{trans_at_50ms}'")

    # 10) data-theme 已经被切换
    theme_after = page.evaluate("() => document.documentElement.getAttribute('data-theme')")
    print(f"  [info] 切换后 data-theme={theme_after}")
    ok("AC3-data-theme 已被切换", theme_before != theme_after,
       detail=f"{theme_before} -> {theme_after}")

    # 11) 关键断言: 等 350ms 后(超过 250ms 清理窗口),transition 已被清空
    page.wait_for_timeout(350)
    trans_after_cleanup = page.evaluate("() => document.documentElement.style.transition")
    print(f"  [info] 点击后 400ms: transition='{trans_after_cleanup}'")
    ok("AC3-250ms 后 <html>.style.transition 被自动清空(核心修复)",
       trans_after_cleanup == "",
       detail=f"实际: '{trans_after_cleanup}'")

    # 12) 下拉菜单在切换后仍保持打开/可交互
    page.screenshot(path=f"{ss_dir}/theme-02-after-toggle.png", full_page=True)
    dropdown_still = page.locator(".miao-user-dropdown .ant-dropdown-menu")
    ok("AC4-下拉菜单切换后仍可访问", dropdown_still.count() > 0)

    # 13) 快速连点 4 次,每次后清空
    print("  [info] 开始快速连点 4 次")
    for i in range(4):
        theme_switch.click()
        page.wait_for_timeout(80)  # 80ms 间隔,远小于 250ms
    # 等最后一次切换后 350ms
    page.wait_for_timeout(350)
    trans_rapid = page.evaluate("() => document.documentElement.style.transition")
    print(f"  [info] 连点 4 次后 350ms: transition='{trans_rapid}'")
    ok("AC5-快速连点 4 次后 <html>.style.transition 仍为空(无累积残留)",
       trans_rapid == "",
       detail=f"实际: '{trans_rapid}'")
    page.screenshot(path=f"{ss_dir}/theme-03-after-rapid-toggle.png", full_page=True)

    # 14) 最终 data-theme 状态应该与初始相反(偶数次回到原色)或相同(偶数次相同) — 4 次切换 = 原色
    theme_final = page.evaluate("() => document.documentElement.getAttribute('data-theme')")
    print(f"  [info] 4 次切换后 data-theme={theme_final}")
    ok("AC5-4 次连点后 data-theme 与初始一致(回到原色)",
       theme_final == theme_before,
       detail=f"{theme_before} -> ... -> {theme_final}")

    # 15) 关闭下拉菜单,确认 slide 动画无残留闪烁
    page.keyboard.press("Escape")
    page.wait_for_timeout(400)  # slide 动画 + 250ms 留白
    trans_after_close = page.evaluate("() => document.documentElement.style.transition")
    ok("AC6-关闭下拉菜单后 transition 仍为空",
       trans_after_close == "",
       detail=f"实际: '{trans_after_close}'")

    # 16) 总错误检查
    if errors:
        print("  ⚠️  本次运行错误清单:")
        for e in errors[:10]:
            print(f"    {e}")
    ok("AC0-全程无新增 pageerror/console.error", len(errors) == 0,
       detail=f"{len(errors)} 个错误")

    print(f"\n结果: {passed}✅ / {failed}❌ / 共{passed+failed}项")
    ctx.close()
    browser.close()
    sys.exit(0 if failed == 0 else 1)
