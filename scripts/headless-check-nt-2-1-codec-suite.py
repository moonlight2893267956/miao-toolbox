#!/usr/bin/env python3
"""Story nt-2-1: 编码解码全家桶 — 无头浏览器验收

前置：前端 :5173、后端 :8080

用法：
  ADMIN_USERNAME=test ADMIN_PASSWORD='xxx' \\
    python3 scripts/headless-check-nt-2-1-codec-suite.py
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


def ok(name: str, cond: bool, detail: str = "") -> None:
    global passed, failed
    if cond:
        print(f"  ✅ {name}")
        passed += 1
    else:
        print(f"  ❌ {name}" + (f" — {detail}" if detail else ""))
        failed += 1


def login_api():
    if not PASSWORD:
        print("ERROR: 请设置 ADMIN_PASSWORD")
        sys.exit(1)
    body = json.dumps({"username": USER, "password": PASSWORD})
    r = subprocess.run(
        [
            "curl", "-s", "-X", "POST", f"{API}/api/auth/login",
            "-H", "Content-Type: application/json", "-d", body,
        ],
        capture_output=True, text=True,
    )
    data = json.loads(r.stdout)["data"]
    return data["accessToken"], data["signingKey"], data["user"]


def main() -> int:
    token, signing_key, user_info = login_api()
    print(f">>> 登录成功 ({USER})")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1280, "height": 900})
        page = context.new_page()
        page.set_default_timeout(20000)

        page.route(
            "**/api/auth/refresh",
            lambda route: route.fulfill(
                status=200,
                content_type="application/json",
                body=json.dumps({
                    "code": "SUCCESS",
                    "data": {
                        "accessToken": token,
                        "signingKey": signing_key,
                        "user": user_info,
                        "mustChangePassword": False,
                        "accessibleRoutes": ["TOOL_NETWORK_TOOLBOX"],
                    },
                }),
            ),
        )
        page.route(
            "**/api/auth/me/routes",
            lambda route: route.fulfill(
                status=200,
                content_type="application/json",
                body=json.dumps({"code": "SUCCESS", "data": ["TOOL_NETWORK_TOOLBOX"]}),
            ),
        )
        page.add_init_script(
            f"""
            localStorage.setItem('user', {json.dumps(json.dumps(user_info))});
            localStorage.setItem('mustChangePassword', 'false');
            localStorage.setItem('miao_routes', {json.dumps(json.dumps(["TOOL_NETWORK_TOOLBOX"]))});
            """
        )

        page.goto(f"{UI}/tools/network/converter/base64-codec", wait_until="domcontentloaded")
        page.wait_for_selector('[data-testid="ntl-root"]', timeout=15000)
        page.wait_for_selector('[data-testid="codec-input"]', timeout=10000)

        print("\n=== AC1: Base64 编码 hello world ===")
        page.locator('[data-testid="codec-kind-base64"]').click()
        page.locator('[data-testid="codec-dir-encode"]').click()
        page.locator('[data-testid="codec-input"]').fill("hello world")
        page.locator('[data-testid="ntl-submit"]').click()
        page.wait_for_timeout(200)
        result = page.locator('[data-testid="ntl-result"]').inner_text()
        ok("输出 aGVsbG8gd29ybGQ=", "aGVsbG8gd29ybGQ=" in result, f"got={result!r}")

        print("\n=== AC2: 中文 UTF-8 Base64 ===")
        page.locator('[data-testid="codec-input"]').fill("你好")
        page.locator('[data-testid="ntl-submit"]').click()
        page.wait_for_timeout(200)
        result_cn = page.locator('[data-testid="ntl-result"]').inner_text().strip()
        # 5L2g5aW9 is common for 你好
        ok("中文编码有输出且可解码", len(result_cn) > 0 and "功能开发中" not in result_cn, f"got={result_cn!r}")
        # 解码校验
        page.locator('[data-testid="codec-dir-decode"]').click()
        page.locator('[data-testid="codec-input"]').fill(result_cn)
        page.locator('[data-testid="ntl-submit"]').click()
        page.wait_for_timeout(200)
        decoded = page.locator('[data-testid="ntl-result"]').inner_text()
        ok("中文解码还原", "你好" in decoded, f"got={decoded!r}")

        print("\n=== AC3: 截断 Base64 错误位置 ===")
        page.locator('[data-testid="codec-dir-decode"]').click()
        page.locator('[data-testid="codec-input"]').fill("aGVsb")  # len%4==1 截断
        page.locator('[data-testid="ntl-submit"]').click()
        page.wait_for_timeout(200)
        err = ""
        if page.locator('[data-testid="ntl-error"]').count():
            err = page.locator('[data-testid="ntl-error"]').inner_text()
        ok("显示错误提示", bool(err) and ("截断" in err or "长度" in err or "位" in err), f"err={err!r}")

        print("\n=== 扩展: URL 编码 ===")
        page.locator('[data-testid="codec-kind-url"]').click()
        page.locator('[data-testid="codec-dir-encode"]').click()
        page.locator('[data-testid="codec-input"]').fill("a=1")
        page.locator('[data-testid="ntl-submit"]').click()
        page.wait_for_timeout(200)
        url_out = page.locator('[data-testid="ntl-result"]').inner_text()
        ok("URL 编码含 %", "%" in url_out or "a%3D1" in url_out, f"got={url_out!r}")

        browser.close()

    print("\n==============================")
    print(f"通过: {passed}  失败: {failed}")
    if failed:
        return 1
    print("Story nt-2-1 验收全部通过")
    return 0


if __name__ == "__main__":
    sys.exit(main())
