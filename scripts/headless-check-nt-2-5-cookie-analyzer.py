#!/usr/bin/env python3
"""
Story nt-2-5: Cookie 分析器 — 无头验收

前置: UI 5173 / API 8080 / ADMIN_PASSWORD
用法: ADMIN_PASSWORD='xxx' python3 scripts/headless-check-nt-2-5-cookie-analyzer.py
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
passed = failed = 0

SAMPLE = "session=abc123; Domain=.example.com; Path=/; HttpOnly; Secure; SameSite=Lax"
MULTI = (
    "session=abc123; Domain=.example.com; HttpOnly; Secure; SameSite=Lax\n"
    "theme=dark; Path=/; SameSite=Strict"
)


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
        capture_output=True, text=True,
    )
    d = json.loads(r.stdout)["data"]
    return d["accessToken"], d["signingKey"], d["user"]


def main() -> int:
    token, key, user = login()
    print(f">>> 登录成功 ({USER})")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(viewport={"width": 1280, "height": 900})
        page = ctx.new_page()
        page.set_default_timeout(20000)
        page.route(
            "**/api/auth/refresh",
            lambda route: route.fulfill(
                status=200, content_type="application/json",
                body=json.dumps({"code": "SUCCESS", "data": {
                    "accessToken": token, "signingKey": key, "user": user,
                    "mustChangePassword": False,
                    "accessibleRoutes": ["TOOL_NETWORK_TOOLBOX"],
                }}),
            ),
        )
        page.route(
            "**/api/auth/me/routes",
            lambda route: route.fulfill(
                status=200, content_type="application/json",
                body=json.dumps({"code": "SUCCESS", "data": ["TOOL_NETWORK_TOOLBOX"]}),
            ),
        )
        page.add_init_script(
            f"localStorage.setItem('user',{json.dumps(json.dumps(user))});"
            f"localStorage.setItem('mustChangePassword','false');"
            f"localStorage.setItem('miao_routes',{json.dumps(json.dumps(['TOOL_NETWORK_TOOLBOX']))});"
        )

        print("\n=== Cookie 分析器 ===")
        page.goto(
            f"{UI}/tools/network/analyzer/cookie-analyzer",
            wait_until="domcontentloaded",
        )
        page.wait_for_selector('[data-testid="cookie-input"]')
        page.locator('[data-testid="cookie-input"]').fill(SAMPLE)
        page.locator('[data-testid="ntl-submit"]').click()
        page.wait_for_timeout(200)

        result = page.locator('[data-testid="cookie-result"]').inner_text()
        ok("AC1 含 name session", "session" in result, result[:120])
        ok("AC1 含 value abc123", "abc123" in result, result[:120])
        ok("AC1 含 Domain", ".example.com" in result, result[:120])
        ok("AC1 含 SameSite Lax", "Lax" in result, result[:120])
        # HttpOnly/Secure 以表格 flag 或文本 true 呈现
        row0 = page.locator('[data-testid="cookie-row-0"]').inner_text()
        ok("AC1 行内含 session", "session" in row0 and "abc123" in row0, row0[:100])

        page.locator('[data-testid="cookie-input"]').fill(MULTI)
        page.locator('[data-testid="ntl-submit"]').click()
        page.wait_for_timeout(200)
        count = page.locator('[data-testid="cookie-count"]').inner_text()
        ok("AC2 两条 Cookie", "2" in count, count)
        ok(
            "AC2 两行表格",
            page.locator('[data-testid^="cookie-row-"]').count() >= 2,
        )
        body = page.locator('[data-testid="cookie-result"]').inner_text()
        ok("AC2 含 theme", "theme" in body and "dark" in body, body[:160])

        browser.close()

    print(f"\n>>> 通过 {passed} / 失败 {failed}")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
