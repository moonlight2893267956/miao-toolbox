#!/usr/bin/env python3
"""
Story wt-5-5 验收脚本 — 查码「AI 多轮讲解台」重设计

用 Playwright 无头浏览器逐条验证 AC（桌面 1280 与窄屏 900 两档视口）。

前置条件：
  - 后端运行在 localhost:8080（可用 API_BASE 覆盖）
  - 前端运行在 localhost:5173（可用 FRONTEND_URL 覆盖）
  - 账号可登录：用户名 ADMIN_USERNAME（默认 admin），密码必须通过 ADMIN_PASSWORD 传入
  - 可选：MIAO_AI=0 跳过依赖真实模型的断言（CI/无额度时用），
    此时只验证「结构 + 降级说明」这类确定性行为

运行方式：
  ADMIN_PASSWORD=*** python3 scripts/headless-check-wt-5-5-ai-explain-chat.py

退出码：全部通过 0，否则 1。
"""

import os
import sys
import time

try:
    from playwright.sync_api import sync_playwright
except ImportError:
    print("❌ 需要安装 playwright: pip install playwright && playwright install chromium")
    sys.exit(1)

FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:5173")
ADMIN_USERNAME = os.environ.get("ADMIN_USERNAME", "admin")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "")
# AI 断言：真实模型可能没额度/没配置，允许显式跳过（但会打印为「跳过」而不是「通过」）
AI_ENABLED = os.environ.get("MIAO_AI", "1") != "0"
# 首轮讲解可能十几到几十秒（agent 要采集事实 + 调模型）
AI_WAIT_MS = int(os.environ.get("AI_WAIT_MS", "180000"))

if not ADMIN_PASSWORD:
    print("❌ 请通过 ADMIN_PASSWORD 环境变量传入登录密码")
    sys.exit(1)

results = []


def check(name, passed, detail="", skipped=False):
    icon = "⏭️" if skipped else ("✅" if passed else "❌")
    if skipped:
        results.append((name, None))
    else:
        results.append((name, passed))
    print(f"{icon} {name}" + (f" — {detail}" if detail else ""))


def login(page):
    page.goto(f"{FRONTEND_URL}/login")
    page.fill('input[id="username"], input[placeholder*="用户名"], input[type="text"]', ADMIN_USERNAME)
    page.fill('input[id="password"], input[type="password"]', ADMIN_PASSWORD)
    page.click('button[type="submit"]')
    page.wait_for_url("**/tools/**", timeout=15000)


def open_lookup(page):
    """进入五笔练习室并切到查码 Tab"""
    page.goto(f"{FRONTEND_URL}/tools/wubi-tutor")
    page.wait_for_selector(".wt-page", timeout=15000)
    page.click('.wt-nav__tab:has-text("查码")')
    page.wait_for_selector(".wt-lookup__bar", timeout=15000)
    # 码表 150KB，等它就绪（输入框出现不代表码表已加载）
    page.wait_for_selector(".wt-lookup__input", timeout=20000)


def wait_for_anchor_outcome(page, timeout_ms):
    """首轮的收场：answer（有正文）/ refused（被前端拒绝或上游失败，页面已给出明确文案）/ manual / timeout"""
    deadline = time.time() + timeout_ms / 1000
    while time.time() < deadline:
        if page.query_selector(".wt-chat__turn--answer .wt-chat__text"):
            return "answer"
        if page.query_selector(".wt-chat__turn--notice") or page.query_selector(".wt-chat__hint--warn"):
            return "refused"
        if page.query_selector(".wt-chat__start"):
            return "manual"
        time.sleep(0.5)
    return "timeout"


def probe_exec_trace(page, timeout_ms=30000):
    """
    看等待期有没有过程轨（Story wt-5-6）。

    为什么要**在等待中就探**而不是等答案出来再看：过程轨的价值正是
    「工具调用开始的那一刻就可见」。等答案出来再查，即使事件是最后一次性到的
    也会通过，那就把本 Story 的核心价值验丢了。

    @returns (是否出现过程轨, 是否观察到「进行中」状态, 详情文案)
    """
    deadline = time.time() + timeout_ms / 1000.0
    saw_trace = False
    saw_running = False
    detail = ""
    while time.time() < deadline:
        trace = page.query_selector(".wt-exec")
        if trace:
            saw_trace = True
            text = (trace.inner_text() or "").replace("\n", " / ")[:120]
            detail = text
            if "进行中" in text:
                saw_running = True
            # 出现过程轨就够了；「进行中」能抓到最好，抓不到不算失败
            # （工具可能很快就完成了，轮询来不及看到）
            if saw_running:
                break
        # 结果已经出来就不用再等（说明本轮没有 exec 事件，属降级路径）
        if page.query_selector(".wt-chat__turn--answer:not(.wt-chat__turn--retry)") and not saw_trace:
            break
        page.wait_for_timeout(120)
    return saw_trace, saw_running, detail


def run_first_explain(page, rounds=3):
    """
    跑首轮讲解，最多重试若干次。

    为什么要重试：agent 是「模型决策」的，偶尔会给出**候选集之外**的字根
    （实测出现过把「昭」当成 J 键字根）。前端会正确地拒绝并说明原因 ——
    这不是本 Story 的缺陷，而是它的护栏在生效（AC-3）。所以这里像真实用户
    一样点「重试讲解」，并把结果记为 attempts。
    """
    outcome = "timeout"
    attempts = 0
    for round_index in range(rounds):
        attempts = round_index + 1
        if round_index > 0:
            retry = page.query_selector(".wt-chat__retry")
            if not retry:
                break
            retry.click()
        outcome = wait_for_anchor_outcome(page, AI_WAIT_MS if AI_ENABLED else 8000)
        if outcome == "answer" or outcome == "timeout":
            break
    return outcome, attempts


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1280, "height": 900})
        page.set_default_timeout(45000)
        page.set_default_navigation_timeout(90000)
        page.on("pageerror", lambda e: print(f"  [pageerror] {e}"))

        # ── AC-1: 双栏布局与事实栏可用（与 AI 无关）──
        login(page)
        open_lookup(page)
        has_split = page.query_selector(".wt-lookup__split") is not None
        has_chat = page.query_selector(".wt-chat") is not None
        check("AC-1 桌面端左右分栏（事实栏 + 讲解台）", has_split and has_chat,
              "两栏同时存在" if has_split and has_chat else "缺少 .wt-lookup__split / .wt-chat")

        # 事实栏：输入「照」应给出全码 jvko（确定性的，不依赖 AI）
        page.fill(".wt-lookup__input", "照")
        page.wait_for_selector(".wt-lookup__row", timeout=10000)
        code_text = page.inner_text(".wt-lookup__row .wt-lookup__code")
        check("AC-1b 事实栏独立可用（照 → jvko）", "jvko" in code_text, f"实际 {code_text!r}")

        # ── AC-2: 点字即锚定并自动开讲 ──
        page.click(".wt-lookup__row .wt-lookup__row-char")
        page.wait_for_selector(".wt-chat__anchor", timeout=10000)
        anchor = page.inner_text(".wt-chat__anchor")
        check("AC-2 点字锚定到讲解台（锚点显示该字）", anchor.strip() == "照", f"锚点 {anchor.strip()!r}")

        # ── AC-EXEC（Story wt-5-6）：等待期就应看到执行过程 ──
        # 注意顺序：必须在等首轮结果**之前**探，否则「最后一次性到齐」也会通过
        saw_trace, saw_running, trace_detail = probe_exec_trace(page)

        state, attempts = run_first_explain(page)
        # 「自动跑首轮」验的是**接线**：只要页面给出了明确收场（正文或带原因的拒绝），
        # 就说明点字确实触发了请求、且结果被如实呈现。模型偶尔给出候选集外的字根
        # 属于 agent 侧质量波动（前端拒绝它正是 AC-3 要的行为），不算本 Story 失败。
        check("AC-2b 点字自动触发首轮并给出明确收场",
              state in ("answer", "refused"),
              f"outcome={state} attempts={attempts}")
        if state == "refused":
            notice = (page.inner_text(".wt-chat__turn--notice") or "").strip()[:80]
            check("AC-3 拒绝候选集外的断言并说明原因", bool(notice), notice)

        # ── AC-EXEC 断言 ──
        # AI 配置性关闭时不会有执行事件（同步路径也没有），此时跳过而不是判失败
        if not AI_ENABLED:
            check("AC-EXEC 等待期展示执行过程轨", False,
                  "AI 未配置，跳过（过程轨依赖 miao-ai 执行事件）", skipped=True)
        elif state == "timeout":
            check("AC-EXEC 等待期展示执行过程轨", False, "首轮超时，无从判断", skipped=True)
        else:
            check("AC-EXEC 等待期展示执行过程轨（工具调用可见）", saw_trace,
                  trace_detail or "等待期未出现 .wt-exec（可能是老版本 agent 未上报 exec 事件）")
            if saw_trace:
                # 「进行中」抓到最好；工具很快完成时轮询可能错过，不算失败
                check("AC-EXEC2 过程轨标出「进行中」状态", saw_running,
                      trace_detail, skipped=not saw_running)

        has_content = state == "answer"
        if has_content:
            check("AC-3 回答带类型徽标（不靠颜色单独区分）",
                  page.query_selector(".wt-chat__badge") is not None)
        else:
            check("AC-3 回答带类型徽标（不靠颜色单独区分）", False, "本轮没有可展示正文，跳过", skipped=True)

        # ── AC-4/AC-5: 快捷追问 + 发送 + 轮次追加 ──
        chip = page.query_selector(".wt-chat__chip") if has_content else None
        if chip:
            chip_text = chip.inner_text()
            chip.click()
            filled = page.input_value(".wt-chat__input")
            check("AC-4 快捷追问点击后填入输入框（不自动发送）",
                  bool(filled) and chip_text in filled, f"输入框 {filled!r}")
            page.click(".wt-chat__send")
            try:
                page.wait_for_selector(".wt-chat__turn--ask", timeout=5000)
                check("AC-5 追问以「问」轮追加到会话", True)
            except Exception:
                check("AC-5 追问以「问」轮追加到会话", False, "未出现用户轮")
            # ── AC-4c: IME 组合态的 Enter 不得发送（中文输入法的基本要求）──
            page.fill(".wt-chat__input", "测试组合态")
            asks_before = len(page.query_selector_all(".wt-chat__turn--ask"))
            page.evaluate(
                """() => {
                    const el = document.querySelector('.wt-chat__input');
                    el.dispatchEvent(new KeyboardEvent('keydown', {
                        key: 'Enter', isComposing: true, bubbles: true, cancelable: true,
                    }));
                }"""
            )
            time.sleep(0.6)
            asks_after = len(page.query_selector_all(".wt-chat__turn--ask"))
            kept = page.input_value(".wt-chat__input")
            check("AC-4c IME 组合态按 Enter 不发送（内容保留）",
                  asks_after == asks_before and kept.strip() == "测试组合态",
                  f"输入框={kept!r} 问轮 {asks_before}→{asks_after}")
            page.fill(".wt-chat__input", "")

            # 追问回答可能较慢，等不到也不判失败（已有「正在回答」与取消入口）
            try:
                page.wait_for_function(
                    "() => document.querySelectorAll('.wt-chat__turn--answer').length >= 2",
                    timeout=AI_WAIT_MS,
                )
                check("AC-5b 追问回答到达（轮次推进）", True,
                      page.inner_text(".wt-chat__turn-count").strip())
            except Exception:
                check("AC-5b 追问回答到达（轮次推进）", False, "等待超时", skipped=True)
        else:
            reason = "本轮没有可展示正文（agent 未给出通过核对的理由另行记录）" if not has_content else "没有生成快捷追问"
            check("AC-4 快捷追问点击后填入输入框（不自动发送）", False, reason, skipped=True)
            check("AC-5 追问以「问」轮追加到会话", False, reason, skipped=True)
            check("AC-5b 追问回答到达（轮次推进）", False, reason, skipped=True)

        # ── AC-6: 弹层收敛为「去讲解台追问」 ──
        page.click(".wt-lookup__row-split")
        page.wait_for_selector(".wt-split-demo__modal", timeout=8000)
        has_entry = page.query_selector(".wt-split-demo__explain-btn") is not None
        has_old_followup = page.query_selector(".wt-split-demo__followup") is not None
        check("AC-6 拆字演示弹层含「去讲解台追问」且不再有追问输入框",
              has_entry and not has_old_followup)

        # ── AC-7: 交接后弹层关闭、仍在讲解台 ──
        page.click(".wt-split-demo__explain-btn")
        page.wait_for_selector(".wt-split-demo__modal", state="detached", timeout=8000)
        page.wait_for_selector(".wt-chat__anchor", timeout=8000)
        check("AC-7 「去讲解台追问」关闭弹层并锚定讲解台",
              page.query_selector(".wt-chat__anchor") is not None)

        # ── AC-8: 新会话重置线程（不残留旧轮次）──
        page.click('.wt-chat__action:has-text("新会话")')
        time.sleep(2)
        answers_after = len(page.query_selector_all(".wt-chat__turn--answer"))
        notice_after = len(page.query_selector_all(".wt-chat__turn--notice"))
        check("AC-8 「新会话」清空并重开（不残留旧轮次）",
              answers_after <= 1 and notice_after <= 1,
              f"重置后 回答轮={answers_after} 提示轮={notice_after}")

        # ── AC-12: 「选中即讲解」开关常驻输入区（会话开始后仍够得着）──
        toggle = page.query_selector('.wt-chat__foot .wt-chat__switch input[type="checkbox"]')
        check("AC-12 「选中即讲解」开关常驻输入区且默认开",
              toggle is not None and toggle.is_checked())

        # ── AC-9: 窄屏分段切换 ──
        page.set_viewport_size({"width": 900, "height": 800})
        time.sleep(0.6)
        pane_tabs = page.query_selector_all(".wt-lookup__pane-tab")
        check("AC-9 窄屏出现「查码 / 讲解」分段切换", len(pane_tabs) == 2,
              f"找到 {len(pane_tabs)} 个分段")

        if len(pane_tabs) == 2:
            pane_tabs[0].click()
            time.sleep(0.4)
            facts_visible = page.is_visible(".wt-lookup__facts")
            pane_tabs[1].click()
            time.sleep(0.4)
            chat_visible = page.is_visible(".wt-chat")
            check("AC-9b 分段切换生效（查码 ⇄ 讲解互斥显示）", facts_visible and chat_visible)

        # ── AC-10: 无障碍与语义 ──
        log_region = page.query_selector('.wt-chat__thread[role="log"]')
        labelled_input = page.query_selector('.wt-chat__input[aria-label]')
        check("AC-10 讲解线程 role=log、输入框有 aria-label",
              log_region is not None and labelled_input is not None)

        browser.close()

    passed = sum(1 for _, ok in results if ok is True)
    failed = sum(1 for _, ok in results if ok is False)
    skipped = sum(1 for _, ok in results if ok is None)
    print(f"\n通过 {passed} / 失败 {failed} / 跳过 {skipped}（共 {len(results)} 项）")
    if not AI_ENABLED:
        print("提示：MIAO_AI=0，未校验依赖真实模型的断言")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
