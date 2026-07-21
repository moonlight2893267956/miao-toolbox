#!/usr/bin/env python3
"""Story nt-1-3: 网络工具列表页与路由 — 无头浏览器验收

前置：
  - 前端 :5173（npm run dev）
  - 后端 :8080（含 /api/network/tools 与 TOOL_NETWORK_TOOLBOX 路由）

用法：
  ADMIN_USERNAME=test ADMIN_PASSWORD='xxx' \\
    python3 scripts/headless-check-nt-1-3-network-tool-list-and-routing.py
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
    try:
        data = json.loads(r.stdout)["data"]
        return data["accessToken"], data["signingKey"], data["user"]
    except Exception:
        print(f"ERROR: 登录失败 — {r.stdout}")
        sys.exit(1)


def signed_get(token: str, signing_key: str, path: str) -> tuple[int, dict]:
    import time, uuid, hmac, hashlib
    ts = str(int(time.time() * 1000))
    nonce = uuid.uuid4().hex
    sig = hmac.new(signing_key.encode(), f"{ts}{nonce}".encode(), hashlib.sha256).hexdigest()
    r = subprocess.run(
        [
            "curl", "-s", "-o", "/tmp/nt13-api.json", "-w", "%{http_code}",
            "-X", "GET", f"{API}{path}",
            "-H", f"Authorization: Bearer {token}",
            "-H", f"X-Request-Timestamp: {ts}",
            "-H", f"X-Request-Nonce: {nonce}",
            "-H", f"X-Request-Signature: {sig}",
        ],
        capture_output=True, text=True,
    )
    code = int(r.stdout.strip() or "0")
    try:
        body = json.loads(open("/tmp/nt13-api.json").read())
    except Exception:
        body = {}
    return code, body


def main() -> int:
    token, signing_key, user_info = login_api()
    print(f">>> 登录成功 ({USER})")

    # API 冒烟：工具列表
    http, body = signed_get(token, signing_key, "/api/network/tools")
    tools = body.get("data") or []
    ok("API GET /api/network/tools = 200", http == 200, f"http={http} body={body}")
    ok("API 返回 ≥30 个工具", len(tools) >= 30, f"count={len(tools)}")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1400, "height": 900})
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
        # 可选：mock routes 接口，确保非超管也能进
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

        # —— AC1: 工具列表入口 ——
        print("\n=== AC1: 工具列表页入口卡片 ===")
        page.goto(f"{UI}/tools", wait_until="domcontentloaded")
        page.wait_for_timeout(1200)
        card = page.locator("text=网络工具箱").first
        ok("工具页出现「网络工具箱」", card.count() > 0)
        if card.count() > 0:
            card.click()
            page.wait_for_timeout(800)
        shot(page, "nt13-01-tools-entry")

        # —— AC2: 列表页分组 ——
        print("\n=== AC2: 网络工具列表（按 category 分组）===")
        # 若点击未跳转，直接打开
        if "/tools/network" not in page.url:
            page.goto(f"{UI}/tools/network", wait_until="domcontentloaded")
        page.wait_for_selector('[data-testid="network-tool-list"]', timeout=15000)
        page.wait_for_selector('[data-testid="network-tool-card-base64-codec"]', timeout=15000)
        shot(page, "nt13-02-list")

        ok("列表根节点存在", page.locator('[data-testid="network-tool-list"]').count() == 1)
        ok("converter 分组存在", page.locator('[data-testid="network-category-converter"]').count() == 1)
        ok("inspector 分组存在", page.locator('[data-testid="network-category-inspector"]').count() == 1)
        ok("ai 分组存在", page.locator('[data-testid="network-category-ai"]').count() == 1)
        card_count = page.locator('[data-testid^="network-tool-card-"]').count()
        ok("工具卡片数量 ≥ 30", card_count >= 30, f"count={card_count}")

        # —— 搜索 + 即将推出标记（不再暴露 Phase 筛选）——
        print("\n=== 搜索与即将推出标记 ===")
        filter_bar = page.locator('[data-testid="network-tool-filter"]')
        ok("搜索栏存在", filter_bar.count() == 1)
        ok("搜索输入存在", page.locator('[data-testid="network-tool-search"]').count() == 1)
        soon = page.locator('[data-testid^="network-soon-"]')
        ok("存在即将推出标记", soon.count() >= 1, f"soon={soon.count()}")
        shot(page, "nt13-03-list-soon")

        # —— AC3: 工具详情路由 ——
        print("\n=== AC3: 工具详情路由 ===")
        page.locator('[data-testid="network-tool-card-base64-codec"]').click()
        page.wait_for_url("**/tools/network/converter/base64-codec", timeout=10000)
        ok("URL 跳转到 /tools/network/converter/base64-codec",
           "/tools/network/converter/base64-codec" in page.url, page.url)
        page.wait_for_selector('[data-testid="network-tool-page"]', timeout=10000)
        ok("详情页存在", page.locator('[data-testid="network-tool-page"]').count() == 1)
        ok("输入区 slot 存在", page.locator('[data-testid="network-tool-input-slot"]').count() == 1)
        shot(page, "nt13-04-detail")

        # 即将推出工具详情
        page.locator('[data-testid="network-tool-back"]').click()
        page.wait_for_selector('[data-testid="network-tool-list"]', timeout=10000)
        page.locator('[data-testid="network-tool-card-dns-query"]').click()
        page.wait_for_selector('[data-testid="network-tool-page"]', timeout=10000)
        ok("未上线工具详情显示即将推出标记",
           page.locator('[data-testid="network-tool-soon-tag"]').count() == 1)
        shot(page, "nt13-05-soon-detail")

        browser.close()

    print("\n==============================")
    print(f"通过: {passed}  失败: {failed}")
    if failed:
        return 1
    print("Story nt-1-3 验收全部通过")
    return 0


if __name__ == "__main__":
    sys.exit(main())
