#!/usr/bin/env python3
"""
Story nt-2-8: Email Header / 日志解析 / Diff — 无头验收
ADMIN_PASSWORD='xxx' python3 scripts/headless-check-nt-2-8-email-log-diff-tools.py
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

        # ── Email ──
        print("\n=== Email Header ===")
        page.goto(f"{UI}/tools/network/analyzer/email-header", wait_until="domcontentloaded")
        page.wait_for_selector('[data-testid="email-input"]')
        page.locator('[data-testid="ntl-submit"]').click()
        page.wait_for_timeout(200)
        auth = page.locator('[data-testid="email-auth"]').inner_text()
        ok("SPF", "spf" in auth.lower(), auth[:80])
        ok("DKIM", "dkim" in auth.lower(), auth[:80])
        ok("DMARC", "dmarc" in auth.lower(), auth[:80])
        ok("Received 链", page.locator('[data-testid="email-received"] [data-testid^="email-hop-"]').count() >= 2)
        fields = page.locator('[data-testid="email-fields"]').inner_text()
        ok("字段表含 Subject", "Subject" in fields, fields[:80])

        # ── Log ──
        print("\n=== 日志解析 ===")
        page.goto(f"{UI}/tools/network/analyzer/log-parser", wait_until="domcontentloaded")
        page.wait_for_selector('[data-testid="log-input"]')
        page.locator('[data-testid="ntl-submit"]').click()
        page.wait_for_timeout(200)
        ok("识别 nginx", "nginx" in page.locator('[data-testid="log-format"]').inner_text().lower())
        ok("有解析行", page.locator('[data-testid="log-lines"] [data-testid^="log-line-"]').count() >= 3)

        page.locator('[data-testid="log-keyword"]').fill("login")
        page.locator('[data-testid="ntl-submit"]').click()
        page.wait_for_timeout(200)
        count = page.locator('[data-testid="log-count"]').inner_text()
        ok("关键词筛选", "1 /" in count or count.startswith("1"), count)

        # ── Diff ──
        print("\n=== Diff ===")
        page.goto(f"{UI}/tools/network/analyzer/diff-checker", wait_until="domcontentloaded")
        page.wait_for_selector('[data-testid="diff-left"]')
        page.locator('[data-testid="ntl-submit"]').click()
        page.wait_for_timeout(200)
        added = page.locator('[data-testid="diff-added"]').inner_text()
        removed = page.locator('[data-testid="diff-removed"]').inner_text()
        ok("有新增", added.strip() != "+0", added)
        ok("有删除", removed.strip() != "−0" and removed.strip() != "-0", removed)
        ok("JSON 格式化标记", page.locator('[data-testid="diff-json-flag"]').count() == 1)
        ok("统一视图", page.locator('[data-testid="diff-unified"]').count() == 1)
        page.locator('[data-testid="diff-mode-split"]').click()
        page.wait_for_timeout(100)
        ok("并排视图", page.locator('[data-testid="diff-split"]').count() == 1)

        browser.close()

    print(f"\n>>> 通过 {passed} / 失败 {failed}")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
