#!/usr/bin/env python3
"""
Story nt-2-7: OpenAPI/Swagger 查看器 — 无头验收

前置: UI 5173 / API 8080 / ADMIN_PASSWORD
用法: ADMIN_PASSWORD='xxx' python3 scripts/headless-check-nt-2-7-openapi-viewer.py
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

OAS3 = """openapi: 3.0.3
info:
  title: Demo Pet API
  version: 1.0.0
paths:
  /pets:
    get:
      tags: [pets]
      summary: 列出宠物
      parameters:
        - name: limit
          in: query
          schema:
            type: integer
      responses:
        "200":
          description: 成功
          content:
            application/json:
              example: [{id: 1, name: Fluffy}]
    post:
      tags: [pets]
      summary: 创建宠物
      requestBody:
        required: true
        content:
          application/json:
            example: {name: Fluffy}
      responses:
        "201":
          description: 已创建
"""

SWAGGER2 = json.dumps({
    "swagger": "2.0",
    "info": {"title": "Demo User API", "version": "1.0.0"},
    "host": "api.example.com",
    "basePath": "/v2",
    "schemes": ["https"],
    "paths": {
        "/users": {
            "get": {
                "tags": ["users"],
                "summary": "列出用户",
                "parameters": [{"name": "page", "in": "query", "type": "integer"}],
                "responses": {"200": {"description": "OK"}},
            },
            "post": {
                "tags": ["users"],
                "summary": "创建用户",
                "parameters": [{
                    "name": "body",
                    "in": "body",
                    "required": True,
                    "schema": {"type": "object", "properties": {"name": {"type": "string"}}},
                }],
                "responses": {"201": {"description": "Created"}},
            },
        }
    },
})


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

        print("\n=== OpenAPI 3 ===")
        page.goto(
            f"{UI}/tools/network/analyzer/openapi-viewer",
            wait_until="domcontentloaded",
        )
        page.wait_for_selector('[data-testid="openapi-input"]')
        page.locator('[data-testid="openapi-input"]').fill(OAS3)
        page.locator('[data-testid="ntl-submit"]').click()
        page.wait_for_timeout(250)

        ok("标题 Demo Pet API", "Demo Pet API" in page.locator('[data-testid="openapi-title"]').inner_text())
        ok("规范 OpenAPI 3", "OpenAPI 3" in page.locator('[data-testid="openapi-spec-version"]').inner_text())
        ok("端点数 2", "2" in page.locator('[data-testid="openapi-endpoint-count"]').inner_text())
        ok("tag pets", page.locator('[data-testid="openapi-tag-pets"]').count() == 1)

        # 点 POST 端点看请求体
        page.locator('[data-testid="openapi-ep-post-_pets"]').click()
        page.wait_for_timeout(100)
        detail = page.locator('[data-testid="openapi-detail"]').inner_text()
        ok("详情含创建宠物", "创建宠物" in detail or "创建" in detail, detail[:120])
        ok("请求体区域", page.locator('[data-testid="openapi-request-body"]').count() == 1)
        ok("响应区域", page.locator('[data-testid="openapi-responses"]').count() == 1)
        # GET 参数
        page.locator('[data-testid="openapi-ep-get-_pets"]').click()
        page.wait_for_timeout(100)
        params = page.locator('[data-testid="openapi-params"]').inner_text()
        ok("参数 limit", "limit" in params, params[:120])

        print("\n=== Swagger 2 ===")
        page.locator('[data-testid="openapi-input"]').fill(SWAGGER2)
        page.locator('[data-testid="ntl-submit"]').click()
        page.wait_for_timeout(250)
        ok("Swagger 标题", "Demo User API" in page.locator('[data-testid="openapi-title"]').inner_text())
        ok("Swagger 版本标记", "Swagger 2" in page.locator('[data-testid="openapi-spec-version"]').inner_text())
        ok("Swagger 端点 2", "2" in page.locator('[data-testid="openapi-endpoint-count"]').inner_text())
        ok("tag users", page.locator('[data-testid="openapi-tag-users"]').count() == 1)
        page.locator('[data-testid="openapi-ep-post-_users"]').click()
        page.wait_for_timeout(100)
        post_detail = page.locator('[data-testid="openapi-detail"]').inner_text()
        ok("Swagger POST 详情", "创建用户" in post_detail or "request" in post_detail.lower() or "请求" in post_detail, post_detail[:140])

        browser.close()

    print(f"\n>>> 通过 {passed} / 失败 {failed}")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
