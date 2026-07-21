#!/usr/bin/env python3
"""Story nt-2-3: IP/时间戳/HTTP状态码/MIME — 无头验收"""
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
        ["curl", "-s", "-X", "POST", f"{API}/api/auth/login",
         "-H", "Content-Type: application/json",
         "-d", json.dumps({"username": USER, "password": PASSWORD})],
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
        page.route("**/api/auth/refresh", lambda route: route.fulfill(
            status=200, content_type="application/json",
            body=json.dumps({"code": "SUCCESS", "data": {
                "accessToken": token, "signingKey": key, "user": user,
                "mustChangePassword": False, "accessibleRoutes": ["TOOL_NETWORK_TOOLBOX"],
            }})))
        page.route("**/api/auth/me/routes", lambda route: route.fulfill(
            status=200, content_type="application/json",
            body=json.dumps({"code": "SUCCESS", "data": ["TOOL_NETWORK_TOOLBOX"]})))
        page.add_init_script(
            f"localStorage.setItem('user',{json.dumps(json.dumps(user))});"
            f"localStorage.setItem('mustChangePassword','false');"
            f"localStorage.setItem('miao_routes',{json.dumps(json.dumps(['TOOL_NETWORK_TOOLBOX']))});"
        )

        print("\n=== IP /24 ===")
        page.goto(f"{UI}/tools/network/converter/ip-format", wait_until="domcontentloaded")
        page.wait_for_selector('[data-testid="ip-input"]')
        page.locator('[data-testid="ip-input"]').fill("192.168.1.0/24")
        page.locator('[data-testid="ntl-submit"]').click()
        page.wait_for_timeout(150)
        ip_out = page.locator('[data-testid="ntl-result"]').inner_text()
        ok("含网络/广播", "192.168.1.0" in ip_out and "192.168.1.255" in ip_out, ip_out[:80])

        print("\n=== 时间戳（站长工具风格）===")
        page.goto(f"{UI}/tools/network/converter/timestamp", wait_until="domcontentloaded")
        page.wait_for_selector('[data-testid="ts-live"]')
        ok("实时时钟存在", page.locator('[data-testid="ts-live-s"]').count() == 1)
        page.locator('[data-testid="ts-input"]').fill("1721318400")
        page.locator('[data-testid="ts-convert"]').click()
        page.wait_for_timeout(150)
        ts_out = page.locator('[data-testid="ts-result"]').inner_text()
        # 1721318400 = 2024-07-18 16:00:00 UTC = 2024-07-19 00:00:00 北京时间
        ok("UTC 含 2024-07-18 16:00:00", "2024-07-18 16:00:00" in ts_out, ts_out[:160])
        ok("北京时间含 2024-07-19 00:00:00", "2024-07-19 00:00:00" in ts_out, ts_out[:160])
        # 日期 → 时间戳
        page.locator('[data-testid="ts-date-input"]').fill("2024-07-19 00:00:00")
        page.locator('[data-testid="ts-date-convert"]').click()
        page.wait_for_timeout(150)
        date_out = page.locator('[data-testid="ts-date-result"]').inner_text()
        ok("日期转时间戳含 1721318400", "1721318400" in date_out, date_out[:120])

        print("\n=== HTTP 429 ===")
        page.goto(f"{UI}/tools/network/converter/http-status", wait_until="domcontentloaded")
        page.wait_for_selector('[data-testid="http-status-input"]')
        page.locator('[data-testid="http-status-input"]').fill("429")
        page.locator('[data-testid="ntl-submit"]').click()
        page.wait_for_timeout(150)
        st = page.locator('[data-testid="ntl-result"]').inner_text()
        ok("Too Many Requests", "Too Many Requests" in st and "429" in st, st[:100])

        print("\n=== MIME .json ===")
        page.goto(f"{UI}/tools/network/converter/mime-type", wait_until="domcontentloaded")
        page.wait_for_selector('[data-testid="mime-input"]')
        page.locator('[data-testid="mime-input"]').fill(".json")
        page.locator('[data-testid="ntl-submit"]').click()
        page.wait_for_timeout(150)
        mime = page.locator('[data-testid="ntl-result"]').inner_text()
        ok("application/json", "application/json" in mime, mime[:80])

        browser.close()

    print(f"\n通过: {passed}  失败: {failed}")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
