#!/usr/bin/env python3
"""Story nt-1-2: 前端 NetworkToolLayout 通用布局 — 无头浏览器验收

前置：
  - 前端 :5173 已运行（npm run dev）
  - 后端 :8080 已运行（登录用）

用法：
  ADMIN_USERNAME=test ADMIN_PASSWORD='xxx' \\
    python3 scripts/headless-check-nt-1-2-frontend-network-tool-layout.py

可选环境变量：
  UI_BASE   默认 http://localhost:5173
  API_BASE  默认 http://localhost:8080
"""
from __future__ import annotations

import json
import os
import subprocess
import sys

from playwright.sync_api import sync_playwright

UI = os.environ.get("UI_BASE", "http://localhost:5173")
API = os.environ.get("API_BASE", "http://localhost:8080")
USER = os.environ.get("ADMIN_USERNAME", "test")
PASSWORD = os.environ.get("ADMIN_PASSWORD", "")

passed = 0
failed = 0
ss_dir = "screenshots"
os.makedirs(ss_dir, exist_ok=True)


def ok(name: str, cond: bool, detail: str = "") -> None:
    global passed, failed
    if cond:
        print(f"  ✅ {name}")
        passed += 1
    else:
        print(f"  ❌ {name}" + (f" — {detail}" if detail else ""))
        failed += 1


def shot(page, name: str) -> None:
    page.screenshot(path=f"{ss_dir}/{name}.png", full_page=True)


def login_via_api() -> tuple[str, dict]:
    if not PASSWORD:
        print("ERROR: 请设置 ADMIN_PASSWORD")
        sys.exit(1)
    body = json.dumps({"username": USER, "password": PASSWORD})
    r = subprocess.run(
        [
            "curl",
            "-s",
            "-X",
            "POST",
            f"{API}/api/auth/login",
            "-H",
            "Content-Type: application/json",
            "-d",
            body,
        ],
        capture_output=True,
        text=True,
    )
    try:
        data = json.loads(r.stdout)["data"]
        token = data["accessToken"]
        user = data.get("user") or {
            "id": data.get("userId", 1),
            "username": USER,
            "roles": data.get("roles")
            or [{"id": 1, "code": "USER", "name": "用户"}],
        }
        return token, user
    except Exception:
        print(f"ERROR: 登录失败 — {r.stdout}")
        sys.exit(1)


def main() -> int:
    token, user_info = login_via_api()
    print(f">>> 登录成功 ({USER})")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1280, "height": 900})
        page = context.new_page()
        page.set_default_timeout(20000)

        # 注入 refresh mock + user，保证 RequireAuth 通过
        page.route(
            "**/api/auth/refresh",
            lambda route: route.fulfill(
                status=200,
                content_type="application/json",
                body=json.dumps(
                    {
                        "code": "SUCCESS",
                        "data": {
                            "accessToken": token,
                            "signingKey": "test-signing-key",
                            "user": user_info,
                            "mustChangePassword": False,
                            "accessibleRoutes": [],
                        },
                    }
                ),
            ),
        )
        page.add_init_script(
            f"""
            localStorage.setItem('user', {json.dumps(json.dumps(user_info))});
            localStorage.setItem('mustChangePassword', 'false');
            """
        )

        page.goto(f"{UI}/tools/network/_layout-preview", wait_until="domcontentloaded")
        page.wait_for_selector('[data-testid="ntl-root"]', timeout=15000)
        page.wait_for_timeout(500)
        shot(page, "nt12-00-layout")

        print("\n=== AC1: 统一布局结构 ===")
        ok("ntl-root 存在", page.locator('[data-testid="ntl-root"]').count() == 1)
        ok("标题包含布局组件预览", "布局组件预览" in page.locator(".tph-title").inner_text())
        ok("输入区 slot 存在", page.locator('[data-testid="ntl-input"]').count() == 1)
        ok("提交按钮存在", page.locator('[data-testid="ntl-submit"]').count() == 1)
        ok("结果区存在", page.locator('[data-testid="ntl-result"]').count() == 1)
        ok("复制按钮存在", page.locator('[data-testid="ntl-copy"]').count() == 1)

        print("\n=== AC3: Loading 态 ===")
        # 确保有输入
        page.locator('[data-testid="ntl-preview-input"]').fill("hello network")
        submit = page.locator('[data-testid="ntl-submit"]')
        submit.click()
        # loading 期间按钮应 disabled / 出现 spinner
        page.wait_for_timeout(100)
        loading_visible = page.locator('[data-testid="ntl-loading"]').count() > 0
        btn_disabled = submit.is_disabled()
        ok("执行中显示 loading 或按钮禁用", loading_visible or btn_disabled,
           f"loading={loading_visible} disabled={btn_disabled}")

        # 等待完成
        page.wait_for_function(
            """() => {
              const el = document.querySelector('[data-testid="ntl-result"]');
              return el && el.innerText.includes('ECHO:');
            }""",
            timeout=5000,
        )
        ok("执行完成后结果展示", "ECHO: hello network" in page.locator('[data-testid="ntl-result"]').inner_text())
        ok("完成后提交按钮恢复可点", not submit.is_disabled())
        shot(page, "nt12-01-after-run")

        print("\n=== AC2: 复制结果 ===")
        # 授权剪贴板权限
        context.grant_permissions(["clipboard-read", "clipboard-write"])
        copy_btn = page.locator('[data-testid="ntl-copy"]')
        ok("有结果后复制按钮可点", not copy_btn.is_disabled())
        copy_btn.click()
        page.wait_for_timeout(400)
        # 按钮文案或 message 提示
        btn_text = copy_btn.inner_text()
        toast = page.locator(".ant-message-notice").count() > 0
        ok("显示已复制提示", "已复制" in btn_text or toast, f"btn={btn_text!r} toast={toast}")

        # 读剪贴板（Chromium）
        clip = page.evaluate("async () => navigator.clipboard.readText()")
        ok("剪贴板内容为结果文本", clip == "ECHO: hello network", f"clip={clip!r}")
        shot(page, "nt12-02-copied")

        browser.close()

    print("\n==============================")
    print(f"通过: {passed}  失败: {failed}")
    if failed:
        return 1
    print("Story nt-1-2 验收全部通过")
    return 0


if __name__ == "__main__":
    sys.exit(main())
