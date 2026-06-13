#!/usr/bin/env python3
"""Story tc-1-5: IDEA 风格主视图升级 无头浏览器验收脚本
用法: ADMIN_PASSWORD='your-pass' python3 scripts/headless-check-tc-1-5-idea-style-visual-upgrade.py
前置：后端 :8080、前端 :5173 均已运行
"""
import json, os, sys, subprocess
from playwright.sync_api import sync_playwright

API = "http://localhost:8080"
UI = "http://localhost:5173"
ADMIN_PASS = os.environ.get("ADMIN_PASSWORD", "")
passed, failed = 0, 0
ss_dir = "screenshots"
os.makedirs(ss_dir, exist_ok=True)

def ok(name, cond, detail=""):
    global passed, failed
    if cond: print(f"  ✅ {name}"); passed += 1
    else: print(f"  ❌ {name} — {detail}" if detail else f"  ❌ {name}"); failed += 1

def shot(pg, name):
    pg.screenshot(path=f"{ss_dir}/{name}.png", full_page=True)

# ——— 登录 ———
r = subprocess.run(["curl", "-s", "-X", "POST", f"{API}/api/auth/login",
    "-H", "Content-Type: application/json",
    "-d", '{"username":"admin","password":"' + ADMIN_PASS + '"}'], capture_output=True, text=True)
if ADMIN_PASS == "":
    print("ERROR: 请设置 ADMIN_PASSWORD 环境变量"); sys.exit(1)
try:
    TOKEN = json.loads(r.stdout)["data"]["accessToken"]
    print(">>> 登录成功")
except Exception:
    print(f"ERROR: 登录失败 — {r.stdout}"); sys.exit(1)

with sync_playwright() as p:
    ctx = p.chromium.launch_persistent_context(
        user_data_dir="/tmp/miao-test-tc15-v2",
        headless=True, viewport={"width": 1440, "height": 900})
    page = ctx.pages[0] if ctx.pages else ctx.new_page()
    page.set_default_timeout(15000)
    console_errors = []
    page.on("pageerror", lambda err: console_errors.append(f"pageerror:{err}"))
    page.on("console", lambda msg: console_errors.append(f"[{msg.type}]{msg.text}") if msg.type == "error" else None)

    # 注入 localStorage（AuthContext 读取 token + user）
    USER = {"id": 1, "username": "admin", "role": "ADMIN", "mustChangePassword": False}
    page.add_init_script(f"""localStorage.setItem('token','{TOKEN}');localStorage.setItem('user',JSON.stringify({json.dumps(json.dumps(USER))}));""")
    # Mock refresh
    page.route("**/api/auth/refresh", lambda route: route.fulfill(
        status=200, content_type="application/json",
        body=json.dumps({"code": "SUCCESS", "data": {"accessToken": TOKEN, "signingKey": "test"}})))

    # ——— 导航 ———
    page.goto(f"{UI}/tools/text-compare", wait_until="networkidle", timeout=20000)
    page.wait_for_timeout(2000)
    shot(page, "tc15-00-initial")

    # ═══════════════════════════════════════
    # AC1 — 工具栏语义化
    # ═══════════════════════════════════════
    print("\n--- AC1: 工具栏语义化 ---")

    toolbar = page.locator(".dt-toolbar")
    ok("工具栏存在", toolbar.count() == 1, f"找到 {toolbar.count()} 个工具栏")

    # 布局组 chip（icon-only = 非激活态仅图标）
    layout_chips = page.locator(".dt-pill-group .dt-pill.is-icon-only")
    ok("布局组 chip 含 is-icon-only 类", layout_chips.count() >= 1, f"找到 {layout_chips.count()} 个 icon-only chip")

    # 行号 chip
    ok("行号 chip 存在", page.locator("[aria-label='切换行号显示']").count() == 1)
    # 忽略空白 chip
    ok("忽略空白 chip 存在", page.locator("[aria-label='切换忽略空白']").count() == 1)

    shot(page, "tc15-01-toolbar-icon-only")

    # ═══════════════════════════════════════
    # AC2 — 状态条 + IDEA shell
    # ═══════════════════════════════════════
    print("\n--- AC2: 状态条 ---")

    ok("无输入时状态条隐藏", page.locator("[data-testid='dt-status-bar']").count() == 0)
    ok("IDEA diff shell 存在", page.locator(".dt-diff-shell").count() == 1)
    ok("中心 gutter 存在", page.locator(".dt-center-gutter").count() == 1)

    # 输入两段差异文本
    inputs = page.locator(".dt-idea-input")
    ok("输入区存在", inputs.count() >= 2, f"找到 {inputs.count()} 个")
    inputs.nth(0).click(); page.wait_for_timeout(200)
    page.keyboard.type("x\ny\nz\nhello world")
    inputs.nth(1).click(); page.wait_for_timeout(200)
    page.keyboard.type("x\ny2\nz\nhello there")
    page.wait_for_timeout(3000)

    ok("有输入后状态条出现", page.locator("[data-testid='dt-status-bar']").count() == 1)

    count_el = page.locator("[data-testid='dt-status-bar-count']")
    count_text = count_el.inner_text() if count_el.count() else ""
    ok("状态条显示 N differences", "differences" in count_text, f"count: {count_text!r}")

    included_el = page.locator("[data-testid='dt-status-bar-included']")
    if included_el.count():
        ok("状态条显示 included 计数", "included" in included_el.inner_text())
    shot(page, "tc15-02-status-bar")

    # ═══════════════════════════════════════
    # AC3 — 差异块勾选
    # ═══════════════════════════════════════
    print("\n--- AC3: 差异块勾选 ---")

    checkboxes = page.locator("[data-testid='dt-hunk-checkbox']")
    cb_count = checkboxes.count()
    ok("差异块 checkbox 渲染", cb_count >= 1, f"找到 {cb_count} 个 checkbox")

    if cb_count >= 1:
        before_text = included_el.inner_text() if included_el.count() else "0 included"
        before_num = int(before_text.split()[0]) if before_text.split()[0].isdigit() else 0

        checkboxes.nth(0).click(); page.wait_for_timeout(500)
        after_text = included_el.inner_text() if included_el.count() else "0 included"
        after_num = int(after_text.split()[0]) if after_text.split()[0].isdigit() else 0
        ok(f"勾选后 included +1 ({before_num}→{after_num})", after_num == before_num + 1)

        checkboxes.nth(0).click(); page.wait_for_timeout(500)
        cancel_text = included_el.inner_text() if included_el.count() else "0 included"
        cancel_num = int(cancel_text.split()[0]) if cancel_text.split()[0].isdigit() else 0
        ok(f"取消勾选 included -1 ({after_num}→{cancel_num})", cancel_num == after_num - 1)

        checkboxes.nth(0).click(); page.wait_for_timeout(500)  # 勾回 1 个截图
    shot(page, "tc15-03-hunk-reviewed")

    # ═══════════════════════════════════════
    # AC4 — Space 快捷键
    # ═══════════════════════════════════════
    print("\n--- AC4: Space 快捷键 ---")
    # 焦点必须在编辑器外（工具栏区域）才能触发全局 Space handler
    page.locator(".dt-toolbar").first.click(); page.wait_for_timeout(300)

    before_sp = int(included_el.inner_text().split()[0]) if included_el.count() and included_el.inner_text().split()[0].isdigit() else 0
    page.keyboard.press("Space"); page.wait_for_timeout(500)
    after_sp = int(included_el.inner_text().split()[0]) if included_el.count() and included_el.inner_text().split()[0].isdigit() else 0
    ok(f"Space 切换 hunk ({before_sp}→{after_sp})", abs(after_sp - before_sp) == 1)

    page.keyboard.press("Space"); page.wait_for_timeout(500)
    final_sp = int(included_el.inner_text().split()[0]) if included_el.count() and included_el.inner_text().split()[0].isdigit() else 0
    ok(f"再次 Space 切换回 ({after_sp}→{final_sp})", abs(final_sp - after_sp) == 1, f"{after_sp}→{final_sp}")

    # 变更输入清空 reviewed
    print("\n--- 变更输入清空 reviewed ---")
    # 确保有至少 1 个 included（如果 Space 把状态切到 0 就再切回来）
    cur = int(included_el.inner_text().split()[0]) if included_el.count() and included_el.inner_text().split()[0].isdigit() else 0
    if cur == 0:
        checkboxes.nth(0).click(); page.wait_for_timeout(500)
    pre_n = int(included_el.inner_text().split()[0]) if included_el.count() and included_el.inner_text().split()[0].isdigit() else 0
    ok(f"勾选后 included={pre_n}", pre_n >= 1)

    inputs.nth(0).click(); page.wait_for_timeout(200)
    page.keyboard.press("End"); page.keyboard.type(" //edit")
    page.wait_for_timeout(3000)
    after_n = int(included_el.inner_text().split()[0]) if included_el.count() and included_el.inner_text().split()[0].isdigit() else 0
    ok(f"输入变更后 reviewed 清空 ({pre_n}→{after_n})", after_n == 0)

    # ═══════════════════════════════════════
    # 控制台错误
    # ═══════════════════════════════════════
    print("\n--- 控制台检查 ---")
    real_errors = [e for e in console_errors if "Dropdown" not in e and "deprecated" not in e]
    ok(f"无 real console error", len(real_errors) == 0, f"errors: {real_errors[:3]}")

    total = passed + failed
    print(f"\n=== 总结: {passed}✅ / {failed}❌ / 共{total}项 ===")
    sys.exit(0 if failed == 0 else 1)
