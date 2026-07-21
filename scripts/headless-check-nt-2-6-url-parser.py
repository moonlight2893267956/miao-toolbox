#!/usr/bin/env python3
"""
Story nt-2-6: URL 解析器 — 无头验收

前置: UI 5173 / API 8080 / ADMIN_PASSWORD
用法: ADMIN_PASSWORD='xxx' python3 scripts/headless-check-nt-2-6-url-parser.py
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

SAMPLE = "https://example.com:8080/api?q=hello&lang=zh#section"


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

        print("\n=== URL 解析器 ===")
        page.goto(f"{UI}/tools/network/analyzer/url-parser", wait_until="domcontentloaded")
        page.wait_for_selector('[data-testid="url-input"]')
        page.locator('[data-testid="url-input"]').fill(SAMPLE)
        page.locator('[data-testid="ntl-submit"]').click()
        page.wait_for_timeout(200)

        ok("protocol", page.locator('[data-testid="url-field-protocol"]').input_value() == "https")
        ok("hostname", page.locator('[data-testid="url-field-hostname"]').input_value() == "example.com")
        ok("port", page.locator('[data-testid="url-field-port"]').input_value() == "8080")
        ok("path", page.locator('[data-testid="url-field-pathname"]').input_value() == "/api")
        ok("hash", page.locator('[data-testid="url-field-hash"]').input_value() == "section")

        assembled = page.locator('[data-testid="url-assembled-text"]').inner_text()
        ok("重组含 query", "q=hello" in assembled and "lang=zh" in assembled, assembled[:120])

        # AC2: 改参数实时重组
        page.locator('[data-testid="url-param-value-0"]').fill("world")
        page.wait_for_timeout(100)
        assembled2 = page.locator('[data-testid="url-assembled-text"]').inner_text()
        ok("修改 q=world 后重组", "q=world" in assembled2, assembled2[:120])

        page.locator('[data-testid="url-param-add"]').click()
        page.wait_for_timeout(50)
        # 新行 index = 2 (原 2 个 params)
        page.locator('[data-testid="url-param-key-2"]').fill("page")
        page.locator('[data-testid="url-param-value-2"]').fill("2")
        page.wait_for_timeout(100)
        assembled3 = page.locator('[data-testid="url-assembled-text"]').inner_text()
        ok("新增 page=2", "page=2" in assembled3, assembled3[:140])

        page.locator('[data-testid="url-param-del-1"]').click()
        page.wait_for_timeout(100)
        assembled4 = page.locator('[data-testid="url-assembled-text"]').inner_text()
        ok("删除 lang 后不含 lang", "lang=" not in assembled4, assembled4[:140])

        browser.close()

    print(f"\n>>> 通过 {passed} / 失败 {failed}")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
