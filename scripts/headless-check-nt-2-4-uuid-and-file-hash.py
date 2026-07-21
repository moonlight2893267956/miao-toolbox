#!/usr/bin/env python3
"""
Story nt-2-4: 文件哈希计算器 — 无头验收

注：UUID 已从网络工具箱移除（由 /tools/crypto 提供），本脚本仅验 FR-8。

前置:
  - 前端 http://localhost:5173 (UI_BASE)
  - 后端 http://localhost:8080 (API_BASE)
  - 环境变量 ADMIN_PASSWORD（及可选 ADMIN_USERNAME，默认 test）

用法:
  ADMIN_PASSWORD='xxx' python3 scripts/headless-check-nt-2-4-uuid-and-file-hash.py
"""
from __future__ import annotations

import hashlib
import json
import os
import subprocess
import sys
import tempfile

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

    hello = b"hello"
    expect_md5 = hashlib.md5(hello).hexdigest()
    expect_sha256 = hashlib.sha256(hello).hexdigest()

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

        print("\n=== 列表不再展示 UUID（已下架）===")
        page.goto(f"{UI}/tools/network", wait_until="domcontentloaded")
        page.wait_for_timeout(400)
        body = page.locator("body").inner_text()
        ok("列表无 UUID 生成器入口文案", "UUID 生成器" not in body, body[:200])

        print("\n=== 文件哈希计算器 ===")
        page.goto(f"{UI}/tools/network/converter/file-hash", wait_until="domcontentloaded")
        page.wait_for_selector('[data-testid="file-hash-input"]')

        with tempfile.NamedTemporaryFile(suffix=".txt", delete=False) as tf:
            tf.write(hello)
            path = tf.name
        try:
            page.locator('[data-testid="file-hash-input"]').set_input_files(path)
            page.wait_for_selector('[data-testid="file-hash-md5"]', timeout=15000)
            page.wait_for_timeout(200)

            md5_text = page.locator('[data-testid="file-hash-md5"]').inner_text()
            sha1_text = page.locator('[data-testid="file-hash-sha1"]').inner_text()
            sha256_text = page.locator('[data-testid="file-hash-sha256"]').inner_text()
            sha512_text = page.locator('[data-testid="file-hash-sha512"]').inner_text()

            ok("AC 含 MD5", expect_md5 in md5_text.lower(), md5_text[:80])
            ok("AC 含 SHA-1 标签", "SHA-1" in sha1_text, sha1_text[:40])
            ok("AC 含 SHA-256", expect_sha256 in sha256_text.lower(), sha256_text[:80])
            ok("AC 含 SHA-512 标签", "SHA-512" in sha512_text, sha512_text[:40])

            page.locator('[data-testid="file-hash-expect"]').fill(expect_md5.upper())
            page.wait_for_timeout(100)
            cmp_ok = page.locator('[data-testid="file-hash-compare"]').inner_text()
            ok("AC 匹配 MD5", "匹配" in cmp_ok and "MD5" in cmp_ok, cmp_ok)

            page.locator('[data-testid="file-hash-expect"]').fill("deadbeef")
            page.wait_for_timeout(100)
            cmp_bad = page.locator('[data-testid="file-hash-compare"]').inner_text()
            ok("AC 不匹配提示", "不匹配" in cmp_bad, cmp_bad)
        finally:
            try:
                os.unlink(path)
            except OSError:
                pass

        browser.close()

    print(f"\n>>> 通过 {passed} / 失败 {failed}")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
