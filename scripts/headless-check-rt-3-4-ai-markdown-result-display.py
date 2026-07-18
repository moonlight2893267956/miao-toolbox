#!/usr/bin/env python3
"""Story rt-3-4: AI 文本结果 Markdown 渲染 — 无头浏览器验收

前置：
  - 前端 :5173 已运行（npm run dev）
  - 不依赖真实后端登录（mock /api/auth/refresh 与 AI stream）

用法：
  python3 scripts/headless-check-rt-3-4-ai-markdown-result-display.py

可选环境变量：
  UI_BASE  默认 http://localhost:5173
"""
from __future__ import annotations

import json
import os
import sys

from playwright.sync_api import sync_playwright

UI = os.environ.get("UI_BASE", "http://localhost:5173")

passed = 0
failed = 0
ss_dir = "screenshots"
os.makedirs(ss_dir, exist_ok=True)

USER = {
    "id": 1,
    "username": "admin",
    "roles": [{"id": 1, "code": "SUPER_ADMIN", "name": "超级管理员"}],
}
ROUTES = [
    "TOOL_REGEX_TESTER",
    "TOOL_CRON_EDITOR",
    "TOOL_TEXT_COMPARE",
    "TOOL_JSON_WORKBENCH",
]


def ok(name: str, cond: bool, detail: str = "") -> None:
    global passed, failed
    if cond:
        print(f"  ✅ {name}")
        passed += 1
    else:
        print(f"  ❌ {name}" + (f" — {detail}" if detail else ""))
        failed += 1


def sse_body_from_output(output: dict) -> str:
    payload = json.dumps(output, ensure_ascii=False)
    mid = max(1, len(payload) // 2)
    parts = [payload[:mid], payload[mid:]]
    lines: list[str] = []
    for p in parts:
        lines.append("event: token")
        lines.append(f"data: {json.dumps({'token': p}, ensure_ascii=False)}")
        lines.append("")
    lines.append("event: done")
    lines.append(f"data: {json.dumps({'trace_id': 'test-md-rt34'})}")
    lines.append("")
    return "\n".join(lines)


MD_EXPLAIN_REGEX = """## 分段说明

这是对 `\\d{11}` 的解释：

1. `\\d` 匹配数字
2. `{11}` 恰好 11 次

**注意**：贪婪量词可能影响性能。

<script>window.__xss=1</script>
"""

MD_EXPLAIN_CRON = """## 触发频率

- 每年 **1 月 1 日** `00:00` 执行一次
- 注意：2 月无 31 号等边界

<script>window.__xss_cron=1</script>
"""


def fulfill_sse(route, output: dict) -> None:
    route.fulfill(
        status=200,
        headers={
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-cache",
        },
        body=sse_body_from_output(output),
    )


def install_mocks(page) -> None:
    def on_refresh(route):
        route.fulfill(
            status=200,
            content_type="application/json",
            body=json.dumps(
                {
                    "code": "SUCCESS",
                    "data": {
                        "accessToken": "mock-access-token",
                        "signingKey": "mock-signing-key",
                        "user": USER,
                        "mustChangePassword": False,
                    },
                }
            ),
        )

    def on_routes(route):
        route.fulfill(
            status=200,
            content_type="application/json",
            body=json.dumps({"code": "SUCCESS", "data": {"routes": ROUTES}}),
        )

    def on_regex(route):
        try:
            body = route.request.post_data_json or {}
        except Exception:
            body = {}
        task = body.get("task", "explain")
        if task == "explain":
            fulfill_sse(
                route,
                {
                    "pattern": body.get("pattern") or r"\d{11}",
                    "explanation": MD_EXPLAIN_REGEX,
                    "model": "mock",
                },
            )
        else:
            fulfill_sse(
                route,
                {
                    "pattern": r"1[3-9]\d{9}",
                    "explanation": "纯文本一行说明。",
                    "model": "mock",
                },
            )

    def on_cron(route):
        try:
            body = route.request.post_data_json or {}
        except Exception:
            body = {}
        task = body.get("task", "explain")
        if task == "explain":
            fulfill_sse(
                route,
                {
                    "expression": body.get("expression") or "0 0 1 1 *",
                    "dialect": "linux5",
                    "explanation": MD_EXPLAIN_CRON,
                    "model": "mock",
                },
            )
        else:
            fulfill_sse(
                route,
                {
                    "expression": "30 9 * * 1-5",
                    "dialect": "linux5",
                    "explanation": "工作日 09:30。",
                    "model": "mock",
                },
            )

    page.route("**/api/auth/refresh", on_refresh)
    page.route("**/api/auth/me/routes", on_routes)
    page.route("**/api/regex/ai/stream", on_regex)
    page.route("**/api/cron/ai/stream", on_cron)


def bootstrap_auth(page) -> None:
    page.add_init_script(
        f"""
        localStorage.setItem('user', {json.dumps(json.dumps(USER))});
        localStorage.setItem('miao_routes', {json.dumps(json.dumps(ROUTES))});
        localStorage.removeItem('mustChangePassword');
        """
    )


def open_tool_and_ai(page, path: str, trigger_sel: str, panel_sel: str) -> None:
    page.goto(f"{UI}{path}", wait_until="domcontentloaded", timeout=30000)
    page.wait_for_timeout(1200)
    # 等待 rehydrate
    page.wait_for_selector(trigger_sel, timeout=15000)
    page.locator(trigger_sel).first.click()
    page.wait_for_selector(panel_sel, timeout=10000)
    page.wait_for_timeout(300)


def main() -> None:
    print(">>> 无头验收 rt-3-4（mock 认证 + mock AI SSE）")
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1440, "height": 900})
        page = context.new_page()
        page.set_default_timeout(20000)
        bootstrap_auth(page)
        install_mocks(page)

        # ── 正则 ──
        print("\n=== 正则测试器 AI Markdown ===")
        open_tool_and_ai(page, "/tools/regex-tester", ".rt-ai-trigger", ".rt-ai-panel")

        # 填入当前正则（React 受控输入：必须用 Playwright fill）
        page.locator("input.rt-regex-field").fill(r"\d{11}")
        page.wait_for_timeout(300)
        current = page.locator(".rt-ai-current").inner_text()
        ok("前置：当前正则已写入", r"\d{11}" in current or "d{11}" in current, current[:80])

        page.locator(".rt-ai-panel [role='tab']", has_text="解释").first.click()
        page.wait_for_timeout(200)
        run_explain = page.locator(".rt-ai-panel .rt-ai-run-btn")
        ok("前置：解释按钮可点", run_explain.count() >= 1 and not run_explain.first.is_disabled())
        run_explain.first.click()
        page.wait_for_selector(".rt-ai-panel .md-view", timeout=12000)

        md = page.locator(".rt-ai-panel .md-view")
        ok("AC1 正则：.md-view 出现", md.count() >= 1)
        ok("AC1 正则：渲染标题", md.locator("h3, h4, h5").count() >= 1, f"count={md.locator('h3,h4,h5').count()}")
        ok("AC1 正则：渲染列表项", md.locator("li").count() >= 1)
        ok("AC1 正则：渲染 code", md.locator("code").count() >= 1)
        ok("AC1 正则：渲染 strong", md.locator("strong").count() >= 1)
        ok("AC3 正则：无 window.__xss", page.evaluate("() => window.__xss !== 1"))
        ok("AC3 正则：.md-view 内无 script 元素", md.locator("script").count() == 0)
        page.screenshot(path=f"{ss_dir}/rt34-regex-explain-md.png", full_page=True)

        # 纯文本
        page.unroute("**/api/regex/ai/stream")

        def plain_regex(route):
            fulfill_sse(
                route,
                {
                    "pattern": r"\d+",
                    "explanation": "匹配一个或多个数字。\n第二行仍应保留。",
                    "model": "mock",
                },
            )

        page.route("**/api/regex/ai/stream", plain_regex)
        page.locator(".rt-ai-panel .rt-ai-run-btn").first.click()
        page.wait_for_selector(".rt-ai-panel .md-view", timeout=12000)
        text = page.locator(".rt-ai-panel .md-view").inner_text()
        ok("AC2 正则：纯文本可读", "匹配一个或多个数字" in text and "第二行" in text, text[:80])

        # ── Cron ──
        print("\n=== Cron 编辑器 AI Markdown ===")
        # 重新挂载 mock（regex unroute 不影响 cron）
        install_mocks(page)
        open_tool_and_ai(page, "/tools/cron-editor", ".ce-ai-trigger", ".ce-ai-panel")

        page.locator(".ce-ai-panel [role='tab']", has_text="详解").first.click()
        page.wait_for_timeout(200)
        expr = page.locator(".ce-ai-panel .ce-ai-input").first
        expr.fill("0 0 1 1 *")
        page.locator(".ce-ai-panel .ce-ai-run-btn").first.click()
        page.wait_for_selector(".ce-ai-panel .md-view", timeout=12000)
        cmd = page.locator(".ce-ai-panel .md-view")
        ok("AC1 Cron：.md-view 出现", cmd.count() >= 1)
        ok("AC1 Cron：渲染标题", cmd.locator("h3, h4, h5").count() >= 1)
        ok("AC1 Cron：渲染列表", cmd.locator("li").count() >= 1)
        ok("AC1 Cron：渲染 code", cmd.locator("code").count() >= 1)
        ok("AC1 Cron：渲染 strong", cmd.locator("strong").count() >= 1)
        ok("AC3 Cron：无 window.__xss_cron", page.evaluate("() => window.__xss_cron !== 1"))
        ok("AC3 Cron：.md-view 内无 script 元素", cmd.locator("script").count() == 0)
        page.screenshot(path=f"{ss_dir}/rt34-cron-explain-md.png", full_page=True)

        # AC5 接线
        print("\n=== 接线检查 ===")
        root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        regex_src = open(
            os.path.join(root, "miao-toolbox-web/src/modules/tools/regex-tester/components/AIPanel.tsx"),
            encoding="utf-8",
        ).read()
        cron_src = open(
            os.path.join(root, "miao-toolbox-web/src/modules/tools/cron-editor/components/AIPanel.tsx"),
            encoding="utf-8",
        ).read()
        ok("AC5 正则 AIPanel import MarkdownView", "MarkdownView" in regex_src)
        ok("AC5 Cron AIPanel import MarkdownView", "MarkdownView" in cron_src)
        ok(
            "AC5 共享组件存在",
            os.path.isfile(os.path.join(root, "miao-toolbox-web/src/components/shared/MarkdownView.tsx")),
        )

        # AC4：采纳按钮结构仍存在于结果区代码路径（静态）
        ok("AC4 正则仍保留应用按钮逻辑", "rt-ai-apply-btn" in regex_src and "handleApply" in regex_src)
        ok("AC4 Cron 仍保留采纳安全网", "acceptExpression" in cron_src and "validate(" in cron_src)

        context.close()
        browser.close()

    print("\n" + "=" * 40)
    total = passed + failed
    print(f"结果: {passed}/{total} 通过, {failed} 失败")
    sys.exit(0 if failed == 0 else 1)


if __name__ == "__main__":
    main()
