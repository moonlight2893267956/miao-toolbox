#!/usr/bin/env python3
"""Story nt-2-2: 数据格式转换器 — 无头验收

前置：前端 :5173、后端 :8080
用法：
  ADMIN_USERNAME=test ADMIN_PASSWORD='xxx' \\
    python3 scripts/headless-check-nt-2-2-data-format-converter.py
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

        page.goto(f"{UI}/tools/network/converter/data-format", wait_until="domcontentloaded")
        page.wait_for_selector('[data-testid="ntl-root"]', timeout=15000)
        page.wait_for_selector('[data-testid="df-input"]', timeout=10000)

        print("\n=== AC1: JSON → YAML ===")
        page.locator('[data-testid="df-from-json"]').click()
        page.locator('[data-testid="df-to-yaml"]').click()
        page.locator('[data-testid="df-input"]').fill('{"name":"miao","enabled":true}')
        page.locator('[data-testid="ntl-submit"]').click()
        page.wait_for_timeout(200)
        out = page.locator('[data-testid="ntl-result"]').inner_text()
        ok("YAML 含 name/miao", "name" in out and "miao" in out, f"got={out!r}")
        ok("YAML 含 enabled", "enabled" in out, f"got={out!r}")

        print("\n=== AC2: 非法 JSON 行号 ===")
        page.locator('[data-testid="df-input"]').fill('{\n  "a": 1,\n  bad\n}')
        page.locator('[data-testid="ntl-submit"]').click()
        page.wait_for_timeout(200)
        err = page.locator('[data-testid="ntl-error"]').inner_text() if page.locator('[data-testid="ntl-error"]').count() else ""
        ok("错误含行号", "行" in err, f"err={err!r}")

        print("\n=== AC3: CSV → JSON 引号转义 ===")
        page.locator('[data-testid="df-from-csv"]').click()
        page.locator('[data-testid="df-to-json"]').click()
        csv_text = 'name,note\nAlice,"hello, world"\nBob,"say ""hi"""\n'
        page.locator('[data-testid="df-input"]').fill(csv_text)
        page.locator('[data-testid="ntl-submit"]').click()
        page.wait_for_timeout(250)
        jout = page.locator('[data-testid="ntl-result"]').inner_text()
        ok("JSON 含 Alice 与逗号字段", "Alice" in jout and "hello, world" in jout, f"got={jout!r}")
        ok("JSON 含转义引号 hi", 'say "hi"' in jout or 'say \\"hi\\"' in jout, f"got={jout!r}")

        browser.close()

    print("\n==============================")
    print(f"通过: {passed}  失败: {failed}")
    if failed:
        return 1
    print("Story nt-2-2 验收全部通过")
    return 0


if __name__ == "__main__":
    sys.exit(main())
