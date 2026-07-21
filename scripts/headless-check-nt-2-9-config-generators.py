#!/usr/bin/env python3
"""
Story nt-2-9: Curl/CIDR/JWT/HMAC/Nginx/Docker 配置生成器 — 无头验收

前置:
  - 前端 http://localhost:5173
  - 后端 http://localhost:8080
  - 环境变量 ADMIN_PASSWORD（及可选 ADMIN_USERNAME，默认 test）

用法:
  ADMIN_PASSWORD='xxx' python3 scripts/headless-check-nt-2-9-config-generators.py
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
        capture_output=True,
        text=True,
    )
    d = json.loads(r.stdout)["data"]
    return d["accessToken"], d["signingKey"], d["user"]


def setup_auth(page, token, key, user):
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


def main() -> int:
    token, key, user = login()
    print(f">>> 登录成功 ({USER})")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(viewport={"width": 1280, "height": 900})
        page = ctx.new_page()
        page.set_default_timeout(20000)
        setup_auth(page, token, key, user)

        # ── AC1 Curl ──
        print("\n=== AC1 Curl 命令生成器 ===")
        page.goto(f"{UI}/tools/network/generator/curl-generator", wait_until="domcontentloaded")
        page.wait_for_selector('[data-testid="curl-generator-form"]')
        out = page.locator('[data-testid="curl-output"]').inner_text()
        ok("默认 JSON 生成 curl", "curl" in out and "POST" in out, out[:100])
        ok("JSON Content-Type", "application/json" in out or "-d" in out, out[:100])
        # Body 类型切换 Form
        page.locator('[data-testid="curl-body-type"]').get_by_text("Form", exact=True).click()
        page.wait_for_timeout(150)
        form_out = page.locator('[data-testid="curl-output"]').inner_text()
        ok(
            "Form 模式 -d 与 urlencoded",
            "x-www-form-urlencoded" in form_out and "-d" in form_out,
            form_out[:120],
        )
        # Raw
        page.locator('[data-testid="curl-body-type"]').get_by_text("Raw", exact=True).click()
        page.wait_for_timeout(100)
        page.locator('[data-testid="curl-raw-content-type"]').fill("application/xml")
        page.locator('[data-testid="curl-body-raw"]').fill("<root/>")
        page.wait_for_timeout(100)
        raw_out = page.locator('[data-testid="curl-output"]').inner_text()
        ok("Raw application/xml", "application/xml" in raw_out and "<root/>" in raw_out, raw_out[:120])
        # 无
        page.locator('[data-testid="curl-body-type"]').get_by_text("无", exact=True).click()
        page.wait_for_timeout(100)
        none_out = page.locator('[data-testid="curl-output"]').inner_text()
        ok("Body=无 不带 -d", "-d " not in none_out and "-d'" not in none_out, none_out[:100])
        page.locator('[data-testid="curl-import"]').fill(
            "curl -X GET -H 'Accept: text/plain' 'https://example.com/ping'"
        )
        page.locator('[data-testid="curl-import-btn"]').click()
        page.wait_for_timeout(300)
        url_val = page.locator('[data-testid="curl-url"]').input_value()
        ok("导入 curl 填充 URL", "example.com/ping" in url_val, url_val)

        # ── AC2 CIDR ──
        print("\n=== AC2 CIDR 计算器 ===")
        page.goto(f"{UI}/tools/network/generator/cidr-calculator", wait_until="domcontentloaded")
        page.wait_for_selector('[data-testid="cidr-input"]')
        page.locator('[data-testid="cidr-input"]').fill("10.0.0.0/24")
        page.locator('[data-testid="ntl-submit"]').click()
        page.wait_for_timeout(200)
        res = page.locator('[data-testid="cidr-result"]').inner_text()
        ok("网络/广播", "10.0.0.0" in res and "10.0.0.255" in res, res[:120])
        ok("可用主机 254", "254" in res, res[:120])
        ok("子网划分表", page.locator('[data-testid="cidr-subnets"]').count() == 1)

        # ── AC3 JWT ──
        print("\n=== AC3 JWT 调试器 ===")
        page.goto(f"{UI}/tools/network/generator/jwt-debugger", wait_until="domcontentloaded")
        page.wait_for_selector('[data-testid="jwt-form"]')
        # 切到构建
        page.get_by_role("tab", name="构建 HS256").click()
        page.locator('[data-testid="jwt-secret"]').fill("test-secret")
        page.locator('[data-testid="ntl-submit"]').click()
        page.wait_for_timeout(300)
        built = page.locator('[data-testid="jwt-built-token"]')
        ok("生成 JWT 分色展示", built.count() == 1 and built.inner_text().count(".") == 2)
        token_text = built.inner_text().replace("\n", "").strip() if built.count() else ""
        # 去掉图例可能混入的空白，保留三段
        token_text = ".".join([p for p in token_text.split(".") if p.strip()][:3]) if token_text else ""
        ok("状态条", page.locator('[data-testid="jwt-status"]').count() == 1)
        # 解码
        page.get_by_role("tab", name="解码 / 验签").click()
        page.locator('[data-testid="jwt-token-input"]').fill(token_text)
        page.locator('[data-testid="jwt-secret"]').fill("test-secret")
        page.locator('[data-testid="ntl-submit"]').click()
        page.wait_for_timeout(300)
        dec = page.locator('[data-testid="jwt-decoded"]').inner_text()
        ok("解码 Payload", "sub" in dec or "user" in dec.lower() or "阿渺" in dec, dec[:120])
        ok(
            "签名有效 chip",
            page.locator('[data-testid="jwt-status"]').inner_text().find("签名有效") >= 0
            or "签名有效" in page.locator('[data-testid="jwt-result"]').inner_text(),
        )

        # ── AC4 HMAC ──
        print("\n=== AC4 HMAC 签名 ===")
        page.goto(f"{UI}/tools/network/generator/hmac-signer", wait_until="domcontentloaded")
        page.wait_for_selector('[data-testid="hmac-message"]')
        page.locator('[data-testid="hmac-message"]').fill("message")
        page.locator('[data-testid="hmac-key"]').fill("key")
        page.locator('[data-testid="ntl-submit"]').click()
        page.wait_for_timeout(200)
        sig = page.locator('[data-testid="hmac-signature"]').inner_text().strip()
        sig_clean = "".join(sig.split()).lower()
        ok("HMAC hex 64 位", len(sig_clean) == 64 and all(c in "0123456789abcdef" for c in sig_clean), sig)
        ok("双编码展示", page.locator('[data-testid="hmac-hex"]').count() == 1 and page.locator('[data-testid="hmac-base64"]').count() == 1)
        page.locator('[data-testid="hmac-expected"]').fill(sig_clean)
        page.locator('[data-testid="ntl-submit"]').click()
        page.wait_for_timeout(200)
        ok("验签匹配", page.locator('[data-testid="hmac-match"]').count() == 1)

        # ── AC5 Nginx ──
        print("\n=== AC5 Nginx 配置 ===")
        page.goto(f"{UI}/tools/network/generator/nginx-config", wait_until="domcontentloaded")
        page.wait_for_selector('[data-testid="nginx-form"]')
        page.locator('[data-testid="nginx-upstream"]').fill("http://127.0.0.1:3000")
        page.wait_for_timeout(150)
        ng = page.locator('[data-testid="nginx-output"]').inner_text()
        ok("proxy_pass", "proxy_pass http://127.0.0.1:3000" in ng, ng[:150])
        ok("location", "location /" in ng, ng[:80])

        # ── AC6 Docker ──
        print("\n=== AC6 Docker 网络 ===")
        page.goto(f"{UI}/tools/network/generator/docker-network", wait_until="domcontentloaded")
        page.wait_for_selector('[data-testid="docker-subnet"]')
        page.locator('[data-testid="docker-subnet"]').fill("172.20.0.0/16")
        page.wait_for_timeout(150)
        dy = page.locator('[data-testid="docker-output"]').inner_text()
        ok("compose networks", "networks:" in dy and "subnet: 172.20.0.0/16" in dy, dy[:150])
        # 冲突：切到 docker 默认 bridge
        page.locator('[data-testid="docker-subnet"]').fill("172.17.0.0/16")
        page.wait_for_timeout(150)
        ok("冲突检测", page.locator('[data-testid="docker-conflicts"]').count() == 1)

        browser.close()

    print(f"\n>>> 汇总: {passed} passed, {failed} failed, total {passed + failed}")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
