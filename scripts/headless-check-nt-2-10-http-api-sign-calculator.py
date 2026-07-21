#!/usr/bin/env python3
"""
Story nt-2-10: HTTP API 签名计算器 — 无头验收

前置: UI 5173 / API 8080 / ADMIN_PASSWORD
用法: ADMIN_PASSWORD='xxx' python3 scripts/headless-check-nt-2-10-http-api-sign-calculator.py
"""
from __future__ import annotations

import hashlib
import json
import os
import subprocess
import sys

from playwright.sync_api import sync_playwright

UI = os.environ.get("UI_BASE", "http://localhost:5173")
API = os.environ.get("API_BASE", "http://localhost:8080")
USER = os.environ.get("ADMIN_USERNAME", "test")
PASSWORD = os.environ.get("ADMIN_PASSWORD", "")
passed = failed = 0


def ok(name: str, cond: bool, detail: str = "") -> None:
    global passed, failed
    if cond:
        print(f"  ✅ {name}")
        passed += 1
    else:
        print(f"  ❌ {name}" + (f" — {detail}" if detail else ""))
        failed += 1


def login():
    if not PASSWORD:
        print("ERROR: ADMIN_PASSWORD required")
        sys.exit(1)
    r = subprocess.run(
        [
            "curl", "-s", "-X", "POST", f"{API}/api/auth/login",
            "-H", "Content-Type: application/json",
            "-d", json.dumps({"username": USER, "password": PASSWORD}),
        ],
        capture_output=True,
        text=True,
    )
    d = json.loads(r.stdout)["data"]
    return d["accessToken"], d["signingKey"], d["user"]


def main() -> int:
    token, key, user = login()
    print(f">>> 登录成功 ({USER})")

    expected_md5 = hashlib.md5(b"a=1&b=2&c=3&key=SECRET").hexdigest()

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(viewport={"width": 1280, "height": 900})
        page = ctx.new_page()
        page.set_default_timeout(20000)
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
                            "signingKey": key,
                            "user": user,
                            "mustChangePassword": False,
                            "accessibleRoutes": ["TOOL_NETWORK_TOOLBOX"],
                        },
                    }
                ),
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
            f"localStorage.setItem('user',{json.dumps(json.dumps(user))});"
            f"localStorage.setItem('mustChangePassword','false');"
            f"localStorage.setItem('miao_routes',{json.dumps(json.dumps(['TOOL_NETWORK_TOOLBOX']))});"
        )

        print("\n=== AC1 开放平台-MD5 ===")
        page.goto(
            f"{UI}/tools/network/generator/http-api-sign",
            wait_until="domcontentloaded",
        )
        page.wait_for_selector('[data-testid="api-sign-form"]')
        page.locator('[data-testid="ntl-submit"]').click()
        page.wait_for_timeout(200)
        sign = page.locator('[data-testid="api-sign-value"]').inner_text().strip()
        sts = page.locator('[data-testid="api-sign-string-to-sign"]').inner_text().strip()
        ok("待签串", sts == "a=1&b=2&c=3&key=SECRET", sts)
        ok("MD5 sign", sign == expected_md5, f"got={sign} want={expected_md5}")

        print("\n=== AC2 排除 sign ===")
        # 添加 sign 参数
        page.get_by_role("button", name="添加参数").click()
        # 找到最后一行
        keys = page.locator('[data-testid^="api-sign-key-"]')
        n = keys.count()
        keys.nth(n - 1).fill("sign")
        page.locator(f'[data-testid="api-sign-value-{n - 1}"]').fill("should-exclude")
        page.locator('[data-testid="ntl-submit"]').click()
        page.wait_for_timeout(200)
        sts2 = page.locator('[data-testid="api-sign-string-to-sign"]').inner_text().strip()
        ok("sign 不参与", "should-exclude" not in sts2 and "sign=" not in sts2.replace("&key=", ""), sts2)

        print("\n=== AC4 导入 URL ===")
        page.locator('[data-testid="api-sign-import"]').fill(
            "https://api.example.com/pay?amount=100&appId=demo&timestamp=1"
        )
        page.locator('[data-testid="api-sign-import-btn"]').click()
        page.wait_for_timeout(200)
        # 检查参数 key
        all_keys = [
            page.locator(f'[data-testid="api-sign-key-{i}"]').input_value()
            for i in range(page.locator('[data-testid^="api-sign-key-"]').count())
        ]
        ok("导入 amount/appId", "amount" in all_keys and "appId" in all_keys, str(all_keys))

        print("\n=== AC5 验签 ===")
        # 重置 demo 并验签
        page.reload(wait_until="domcontentloaded")
        page.wait_for_selector('[data-testid="api-sign-form"]')
        page.locator('[data-testid="ntl-submit"]').click()
        page.wait_for_timeout(150)
        sign = page.locator('[data-testid="api-sign-value"]').inner_text().strip()
        page.locator('[data-testid="api-sign-expected"]').fill(sign)
        page.locator('[data-testid="ntl-submit"]').click()
        page.wait_for_timeout(150)
        ok("验签匹配", page.locator('[data-testid="api-sign-match"]').count() == 1)

        browser.close()

    print(f"\n>>> 汇总: {passed} passed, {failed} failed, total {passed + failed}")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
