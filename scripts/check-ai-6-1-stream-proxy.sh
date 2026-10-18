#!/usr/bin/env bash
# Story ai-6-1: AI 流式代理统一契约 — 端到端验收
#
# ══════════════════════════════════════════════════════════════════════
# 前置条件
# ══════════════════════════════════════════════════════════════════════
#   1. 后端已启动，默认 http://localhost:8080（用 API_BASE 覆盖）
#        cd miao-toolbox-api && ./mvnw spring-boot:run
#   2. 登录密码必须通过环境变量传入，脚本内不出现任何明文口令
#        ADMIN_PASSWORD='***' bash scripts/check-ai-6-1-stream-proxy.sh
#   3. 依赖 python3（HMAC 签名 / JSON 解析 / SSE 解析）与 curl。
#   4. 记账类断言（AC-4a / AC-5 / AC-6）需要 SUPER_ADMIN 角色（默认 admin 满足），
#      因为要读 GET /api/admin/ai-invocations。非超管账号这几项会标为「跳过」。
#   5. **运行期间请勿并发使用任何 AI 功能**：记账断言按
#      「wubi-explainer 当日调用总数增量」统计，他人调用会造成假阳性。
#
# ══════════════════════════════════════════════════════════════════════
# 三种运行模式（决定哪些断言会跑、哪些会跳过）
# ══════════════════════════════════════════════════════════════════════
#   A) 只跑确定性部分（**不依赖 miao-ai，也不需要真实模型额度**）：
#        MIAO_AI=0 bash scripts/check-ai-6-1-stream-proxy.sh
#      会跑：鉴权签名自检、agent 未启用/请求非法时的 fail-fast、
#            「事件名不得设白名单」的静态源码防线、四条端点路由连通性。
#      会跳过：事件序列顺序、未知事件动态转发、上游非 2xx 记账、客户端中断记账。
#
#   B) 连真实 miao-ai（需要平台可达 + 有额度）：
#        ADMIN_PASSWORD='***' bash scripts/check-ai-6-1-stream-proxy.sh
#      MIAO_AI 默认 1。上游不可达时相关项标「跳过」而不是判失败。
#
#   C) 连脚本自带的**假上游 mock**（**完全确定性，推荐作为回归防线**）：
#        # 1) 先把后端配置里的 wubi-explainer base-url 指向 http://localhost:18099
#        #    （Nacos: miao.ai.agents.wubi-explainer.base-url）
#        # 2) 再执行：
#        ADMIN_PASSWORD='***' MIAO_AI_MOCK=1 bash scripts/check-ai-6-1-stream-proxy.sh
#      脚本会自己起一个假 miao-ai（只实现 /conversations 与 /invoke/stream），
#      它下发 conversation → exec → **一个契约外事件名** → token×2 → done，
#      并按 conversation_id 前缀（mock-404 / mock-429）构造上游非 2xx。
#      该模式下 6 条验收项全部可确定性验证，不花任何额度。
#      若后端没真正指向 mock，脚本会自动探测到并降级，不会误报。
#
# ══════════════════════════════════════════════════════════════════════
# 开关一览
# ══════════════════════════════════════════════════════════════════════
#   API_BASE          后端地址，默认 http://localhost:8080
#   ADMIN_USERNAME    登录用户名，默认 admin
#   ADMIN_PASSWORD    登录密码（必填，无默认值）
#   MIAO_AI           0 = 不跑依赖真实上游的断言（默认 1）
#   MIAO_AI_MOCK      1 = 启动假上游（默认 0）；启用后不受 MIAO_AI 限制
#   MOCK_PORT         假上游端口，默认 18099
#   MOCK_DELAY_MS     假上游事件间隔毫秒，默认 700（调大便于制造客户端中断）
#   FAIL_FAST_MAX_SEC fail-fast 最长允许耗时秒数，默认 8
#   STREAM_MAX_SEC    流式请求最长等待秒数，默认 180
#   LEDGER_WAIT_SEC   记账异步落库后轮询到「稳定」的最长秒数，默认 20
#
# 退出码：0 = 无失败项（允许有跳过项）；1 = 有失败项；2 = 前置条件不满足
#
# ──────────────────────────────────────────────────────────────────────
# 端点与鉴权（已逐个核对源码，勿凭记忆改）
# ──────────────────────────────────────────────────────────────────────
#   端点（五条 SSE 流）：
#     POST /api/wubi/ai/explain/stream     @RequireRoute("TOOL_WUBI_TUTOR")  最完整的参考实现
#     POST /api/wubi/ai/followup/stream    @RequireRoute("TOOL_WUBI_TUTOR")
#     POST /api/cron/ai/stream             @RequireRoute("TOOL_CRON_EDITOR")
#     POST /api/regex/ai/stream            @RequireRoute("TOOL_REGEX_TESTER")
#     POST /api/diff/ai/summary            @RequireRoute("TOOL_TEXT_COMPARE")  ← 注意不是 /stream
#
#   鉴权（AntiReplayFilter + JwtAuthFilter，缺一不可）：
#     - Authorization: Bearer <accessToken>
#     - X-Request-Timestamp: 毫秒时间戳（容差 5 分钟）
#     - X-Request-Nonce:     UUID v4（Redis SETNX，TTL 300s，一次性）
#     - X-Request-Signature: HMAC-SHA256(signingKey, timestamp + nonce + body) 的小写 hex
#       · body 计入摘要，且必须是**逐字节一致**的请求体原文
#       · GET/DELETE 的 body 视为空串；本脚本只用 POST，不涉及
#     - signingKey 来自 POST /api/auth/login 响应的 data.signingKey
#     - 缺任意一个签名头 → 400 REPLAY_PROTECTION_FAILED（**不是** 401）
#     - nonce 是一次性的：重跑时务必重新生成（脚本每次都现生成）
#
#   请求体形状：
#     explain/stream : {task?, char, code, positions:[{index,key,candidates:[{glyph,name}]}], notes?, conversationId?}
#       · 只做「形」校验（char/code 非空、positions 非空列表），取值域校验留给 agent
#         —— 所以非法 body 也可能先连一次上游
#     followup/stream: {char, question, conversationId}
#       · conversationId 会被原样写进 metadata 转发给上游（AC-4a 用它逼出上游 4xx）
#     cron/stream    : {task, expression, ...}（DTO @Valid 校验，失败直接 400 非 SSE）
#     regex/stream   : {task, pattern, ...}
#     diff/summary   : {language, statistics:{additions,deletions,modifications}, hunks:[...]}
#
#   记账查询：GET /api/admin/ai-invocations?agentName=&startTime=&pageSize=
#     （需要 SUPER_ADMIN；响应 data.total 是窗口内累计条数，
#       data.items[] 里有 request_id / status / error_code / latency_ms，
#       **没有** user_agent 字段 —— 别按它做过滤）
#
#   记账是 @Async 落库：调用结束后必须轮询到 total 稳定，才能断言增量。
# ══════════════════════════════════════════════════════════════════════

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API_SRC="$ROOT/miao-toolbox-api/src/main/java/com/miao/toolbox"

API_BASE="${API_BASE:-http://localhost:8080}"
ADMIN_USERNAME="${ADMIN_USERNAME:-admin}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-}"
AI_ENABLED="${MIAO_AI:-1}"
MOCK_MODE="${MIAO_AI_MOCK:-0}"
MOCK_PORT="${MOCK_PORT:-18099}"
MOCK_DELAY_MS="${MOCK_DELAY_MS:-700}"
FAIL_FAST_MAX_SEC="${FAIL_FAST_MAX_SEC:-8}"
STREAM_MAX_SEC="${STREAM_MAX_SEC:-180}"
LEDGER_WAIT_SEC="${LEDGER_WAIT_SEC:-20}"

# mock 下发的两个特殊事件名（都**不在** miao-ai 的契约里）：
#   MOCK_UNKNOWN_EVENT — 夹在 exec 与 token 之间，用来验「未知事件名必须原样转发」
#   MOCK_TAIL_EVENT    — 放在 done **之后**，作为「这条流完整走完了」的证据。
#                       没有它就无法区分「上游没发未知事件」与「发了但被后端丢弃」，
#                       两者都会表现成「流里没有那个事件名」。
#                       ⚠️ 它在 done 之后，因此**不参与** AC-2 的顺序判定
#                       （契约只承诺 done 是收尾事件，之后是否还有内容由上游说了算）。
MOCK_UNKNOWN_EVENT="mock_unknown_probe_event"
MOCK_TAIL_EVENT="mock_tail_marker_event"

PASS=0
FAIL=0
SKIP=0
TMPDIR_RUN=""
MOCK_PID=""
LEDGER_WINDOW=""
LEDGER_BASE=-1
LEDGER_SNAP=""

# ── 输出与记账 ────────────────────────────────────────────────────────
ok()   { PASS=$((PASS+1)); echo "  ✅ $1"; }
bad()  { FAIL=$((FAIL+1)); echo "  ❌ $1"; }
warn() { echo "  ⚠️  $1"; }
skip() { SKIP=$((SKIP+1)); echo "  ⏭️  $1"; }
note() { echo "       ↳ $1"; }

cleanup() {
  [[ -n "$MOCK_PID" ]] && kill "$MOCK_PID" 2>/dev/null || true
  [[ -n "$TMPDIR_RUN" && -d "$TMPDIR_RUN" ]] && rm -rf "$TMPDIR_RUN"
}
trap cleanup EXIT

# ── 能力开关 ──────────────────────────────────────────────────────────
have_ledger=0   # 能否读 ai_invocations（需 SUPER_ADMIN）
upstream_ok=0   # 上游（含 mock）是否可达，能拿到 HTTP 200 的事件流

# ── 从 SSE 流里取第一个 error 事件的 code 字段 ───────────────────────
# ⚠️ 不要用 grep '"code":"..."' 抽取：
#    SSE 的 data 载荷由 SseEmitter 序列化，冒号后可能带空格
#    （`{"code": "AI_QUOTA_EXCEEDED"}`），那样一个正则就漏掉了，
#    现象是「明明发了 error 事件却报事件码为空」。这里按 SSE 规范解析：
#    先定位 event:error 事件块，再对其 data 做 JSON 解析。
sse_error_code() {  # $1=SSE 文件
  python3 - "$1" <<'PY'
import json, sys
try:
    raw = open(sys.argv[1], encoding="utf-8", errors="replace").read()
except Exception:
    print(""); raise SystemExit(0)

event, data = "", []
for line in raw.splitlines() + [""]:
    if line.startswith("event:"):
        event = line.split(":", 1)[1].strip()
    elif line.startswith("data:"):
        data.append(line.split(":", 1)[1].strip())
    elif line.strip() == "":
        if event == "error" and data:
            try:
                print(json.loads("".join(data)).get("code") or "")
            except Exception:
                print("")
            raise SystemExit(0)
        event, data = "", []
print("")
PY
}

# ──────────────────────────────────────────────────────────────────────
# 带 HMAC 签名发起一次 SSE POST，把流写到 $2，并输出 "<http_code>|<time_total>"
#
# ⚠️ 签名必须与**逐字节相同**的 body 一起算，所以这里绝不经过 shell 变量拼接：
#    body 先由 python 序列化到临时文件，再用 --data-binary @file 发送。
#    曾经有人写成 `-d "$BODY"` + 先算签名的组合，body 里只要多一个空格
#    签名就对不上，报 REPLAY_SIGNATURE_INVALID —— 且现象极难归因。
# ⚠️ nonce 是一次性的（Redis SETNX，TTL 300s），每次调用都必须现生成。
curl_json_stream() {  # $1=完整 URL  $2=输出文件  $3=最大秒数
  local url="$1" out="$2" secs="$3" body_file="$2.body"
  BODY="$BODY" python3 - <<'PY' > "$body_file"
import os
print(os.environ["BODY"], end="")
PY
  read -r ts nonce sig < <(BODY_FILE="$body_file" KEY="$SIGNING_KEY" python3 - <<'PY'
import hmac, hashlib, os, time, uuid
with open(os.environ["BODY_FILE"], encoding="utf-8") as fh:
    body = fh.read()
ts = str(int(time.time() * 1000))
nonce = str(uuid.uuid4())
sig = hmac.new(os.environ["KEY"].encode("utf-8"),
               (ts + nonce + body).encode("utf-8"), hashlib.sha256).hexdigest()
print(ts, nonce, sig)
PY
  )
  curl -sS -N --max-time "$secs" -o "$out" -w '%{http_code}|%{time_total}' \
    -X POST "$url" \
    -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
    -H 'Accept: text/event-stream' \
    -H "X-Request-Timestamp: $ts" -H "X-Request-Nonce: $nonce" -H "X-Request-Signature: $sig" \
    --data-binary "@$body_file" 2>/dev/null || echo "000|999"
}

# ──────────────────────────────────────────────────────────────────────
echo ">>> 0/7 环境自检与登录"
# ──────────────────────────────────────────────────────────────────────
[[ -n "$ADMIN_PASSWORD" ]] || {
  echo "❌ 请通过 ADMIN_PASSWORD 环境变量传入登录密码"
  exit 2
}
command -v python3 >/dev/null 2>&1 || { echo "❌ 需要 python3"; exit 2; }
command -v curl >/dev/null 2>&1 || { echo "❌ 需要 curl"; exit 2; }

HEALTH=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "${API_BASE}/actuator/health" || echo "000")
if [[ "$HEALTH" == "000" ]]; then
  echo "❌ 无法连接后端 ${API_BASE}（/actuator/health 无响应）"
  exit 2
fi
# ⚠️ 中文全角括号紧跟变量名时，某些 bash 版本/区域设置会把「变量名的一部分」
#    一起吞掉（报 `API_BASE?: unbound variable`）。所有中文文案里引用变量
#    一律写成 ${VAR}，这是本脚本的硬性约定。
ok "后端可达：${API_BASE}（/actuator/health → ${HEALTH}）"

TMPDIR_RUN="$(mktemp -d)"

# ── 登录取 token / signingKey ─────────────────────────────────────────
LOGIN_FILE="$TMPDIR_RUN/login.json"
U="$ADMIN_USERNAME" P="$ADMIN_PASSWORD" python3 - <<'PY' > "$TMPDIR_RUN/login.body"
import json, os
print(json.dumps({"username": os.environ["U"], "password": os.environ["P"]}))
PY
curl -sS --max-time 20 -X POST "$API_BASE/api/auth/login" \
  -H 'Content-Type: application/json' \
  --data-binary "@$TMPDIR_RUN/login.body" \
  -o "$LOGIN_FILE" || true

# ⚠️ 不用 readarray：macOS 自带 bash 3.2 没有这个内建命令，
#    而验收脚本必须能在开发机上直接跑。用 sed 按行取，避免数组语法。
# ⚠️ 也不在 python 里输出分隔串再 cut：token 本身是 base64url，
#    理论上可能含分隔符；按行取不会。
LOGIN_VALS=$(python3 - "$LOGIN_FILE" <<'PY'
import json, sys
try:
    d = json.load(open(sys.argv[1], encoding="utf-8"))
except Exception:
    print(""); print(""); print("")
    raise SystemExit(0)
data = d.get("data") or {}
roles = [str(r.get("code") or "") for r in (data.get("user") or {}).get("roles") or []]
print(data.get("accessToken") or "")
print(data.get("signingKey") or "")
print(",".join(x for x in roles if x))
PY
)
TOKEN=$(printf '%s\n' "$LOGIN_VALS"     | sed -n '1p')
SIGNING_KEY=$(printf '%s\n' "$LOGIN_VALS" | sed -n '2p')
ROLES=$(printf '%s\n' "$LOGIN_VALS"      | sed -n '3p')

if [[ -z "$TOKEN" || -z "$SIGNING_KEY" ]]; then
  echo "❌ 登录失败或响应缺少 accessToken/signingKey（检查 ADMIN_PASSWORD 与后端状态）："
  head -c 300 "$LOGIN_FILE" >&2
  echo ""
  exit 2
fi
ok "登录成功：${ADMIN_USERNAME}（roles=${ROLES:-未知}）"

if [[ ",$ROLES," == *",SUPER_ADMIN,"* ]]; then
  have_ledger=1
  ok "账号具备 SUPER_ADMIN，可核对 ai_invocations 记账"
else
  warn "账号非 SUPER_ADMIN（roles=${ROLES:-未知}），所有「记账」断言将标为跳过"
fi

# ── 签名自检：缺签名头必须 400 REPLAY_PROTECTION_FAILED ────────────────
NOSIGN_CODE=$(curl -sS -o "$TMPDIR_RUN/nosign.json" -w '%{http_code}' --max-time 20 \
  -X POST "$API_BASE/api/wubi/ai/explain/stream" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"char":"照","code":"jvko","positions":[],"notes":[]}' || echo "000")
if [[ "$NOSIGN_CODE" == "400" ]] && grep -q 'REPLAY_PROTECTION_FAILED' "$TMPDIR_RUN/nosign.json"; then
  ok "防重放生效：缺签名头 → 400 REPLAY_PROTECTION_FAILED"
else
  bad "缺签名头期望 400 REPLAY_PROTECTION_FAILED，实际 ${NOSIGN_CODE}：$(head -c 160 "$TMPDIR_RUN/nosign.json")"
fi

# ──────────────────────────────────────────────────────────────────────
echo ""
echo ">>> 1/7 AC-1 agent 未启用 / 请求不成立时立刻返回错误事件（不挂起）"
# ──────────────────────────────────────────────────────────────────────
# 构造：故意省略 char 与 positions。
#   · agent 未启用 → explainStream 走 isAgentEnabled() 分支 → AI_AGENT_DISABLED
#   · agent 已启用 → prepareExplain 抛 VALIDATION_FAILED → 同一个 failFast 出口
# 两条路径都**不会**去连上游，因此本项与 miao-ai 是否可用无关，是确定性断言。
# 「不挂起」用 curl 的 time_total 卡死：SseEmitter(0L) 应在毫秒级内完成。
FF_BODY='{"code":"jvko"}'
FF_OUT="$TMPDIR_RUN/failfast.sse"
export BODY="$FF_BODY"
FF_META=$(curl_json_stream "$API_BASE/api/wubi/ai/explain/stream" "$FF_OUT" "$FAIL_FAST_MAX_SEC" || echo "000|999")
FF_CODE="${FF_META%%|*}"
FF_TIME="${FF_META##*|}"

if [[ "$FF_CODE" == "400" ]] && grep -q 'REPLAY_SIGNATURE_INVALID' "$FF_OUT"; then
  bad "签名头被拒（nonce 复用或时间戳越界），本次 fail-fast 结果无效，请重跑"
else
  FF_JUDGE=$(python3 - "$FF_OUT" <<'PY'
import json, sys
raw = open(sys.argv[1], encoding="utf-8", errors="replace").read()
events, code = [], ""
cur, buf = "", []
for line in raw.splitlines() + [""]:
    if line.startswith("event:"):
        cur = line.split(":", 1)[1].strip()
    elif line.startswith("data:"):
        buf.append(line.split(":", 1)[1].strip())
    elif line.strip() == "":
        if cur and buf:
            events.append(cur)
            if cur == "error" and not code:
                try:
                    code = json.loads("".join(buf)).get("code") or ""
                except Exception:
                    pass
        cur, buf = "", []
if "error" not in events:
    print("RESULT=fail")
    print("DETAIL=未收到 error 事件（events=%s）" % (events or "无"))
    raise SystemExit(0)
print("RESULT=%s" % ("pass" if code else "fail"))
print("DETAIL=事件序列 %s，错误码=%s" % (" → ".join(events), code or "(无 code 字段)"))
PY
  )
  J_STATE=$(sed -n 's/^RESULT=//p' <<<"$FF_JUDGE")
  J_DETAIL=$(sed -n 's/^DETAIL=//p' <<<"$FF_JUDGE")
  if [[ "$J_STATE" == "pass" ]] && [[ "${FF_TIME%%.*}" -le "$FAIL_FAST_MAX_SEC" ]]; then
    ok "AC-1a 立刻回 error 事件并结束流（耗时 ${FF_TIME}s ≤ ${FAIL_FAST_MAX_SEC}s）：$J_DETAIL"
  else
    bad "AC-1a fail-fast 失败（HTTP ${FF_CODE}，耗时 ${FF_TIME}s）：$J_DETAIL"
    note "流内容前 200 字节：$(head -c 200 "$FF_OUT" | tr '\n' '|')"
  fi

  # AC-1b：环境确实处于「agent 未启用」时，错误码必须是 AI_AGENT_DISABLED
  FF_CODE_VAL=$(sse_error_code "$FF_OUT")
  if [[ "$FF_CODE_VAL" == "AI_AGENT_DISABLED" ]]; then
    ok "AC-1b agent 未启用分支：错误码 = AI_AGENT_DISABLED"
  else
    skip "AC-1b agent 未启用分支（当前 agent 为启用状态，实际错误码 = ${FF_CODE_VAL:-无}）"
    note "验证办法：把 miao.ai.agents.wubi-explainer.enabled 置为 false（或删掉该 agent 配置）后重跑本脚本"
  fi
fi

# ──────────────────────────────────────────────────────────────────────
echo ""
echo ">>> 2/7 上游可达性探测（决定后续哪些断言可跑）"
# ──────────────────────────────────────────────────────────────────────
if [[ "$MOCK_MODE" == "1" ]]; then
  MOCK_PORT="$MOCK_PORT" MOCK_DELAY_MS="$MOCK_DELAY_MS" \
  MOCK_UNKNOWN_EVENT="$MOCK_UNKNOWN_EVENT" MOCK_TAIL_EVENT="$MOCK_TAIL_EVENT" \
    python3 - >"$TMPDIR_RUN/mock.log" 2>&1 <<'PY' &
import json, os, sys, time, uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PORT    = int(os.environ.get("MOCK_PORT", "18099"))
DELAY   = float(os.environ.get("MOCK_DELAY_MS", "700")) / 1000.0
UNKNOWN = os.environ.get("MOCK_UNKNOWN_EVENT", "mock_unknown_probe_event")
TAIL    = os.environ.get("MOCK_TAIL_EVENT", "mock_tail_marker_event")

# 事件顺序刻意贴合契约：conversation? → exec* → token* → done，
# 中间插入一个**契约外事件名**，用于验证「未知事件名不得被丢弃」；
# done 之后再补一个尾标记，用于证明整条流已完整转发。
EVENTS = [
    ("conversation", {"conversation_id": "mock-conv-0001", "turn": 1}),
    ("exec",         {"name": "mock_lookup", "status": "running", "input": {"char": "照"}}),
    (UNKNOWN,        {"probe": "unknown-event-passthrough",
                      "note": "后端不得丢弃未知事件名（miao-ai 契约：事件名只增不改）"}),
    ("token",        {"token": "mock-token-A"}),
    ("token",        {"token": "mock-token-B"}),
    ("done",         {"output": {"mock": True}, "trace_id": "mock-trace-0001",
                      "model": "mock-model", "usage": {"total_tokens": 7}}),
    # 尾标记：AC-3b 用它区分「上游没发未知事件」（跳过）与「发了但被中间层丢弃」（失败）
    (TAIL,           {"marker": True}),
]

class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):
        sys.stderr.write("[mock] " + (fmt % args) + "\n")

    def _json(self, status, payload):
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_POST(self):
        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length) if length else b"{}"
        try:
            body = json.loads(raw.decode("utf-8"))
        except Exception:
            body = {}
        meta = body.get("metadata") or {}
        conv = str(meta.get("conversation_id") or "")

        if self.path.endswith("/conversations"):
            self._json(200, json.dumps(
                {"conversation_id": "mock-conv-" + uuid.uuid4().hex[:8]}).encode())
            return
        if not self.path.endswith("/invoke/stream"):
            self._json(404, b'{"detail":"mock: unknown path"}')
            return

        # 上游非 2xx：按 conversation_id 前缀构造（后端把它写进 metadata 才转发给我们）
        if conv.startswith("mock-404"):
            self._json(404, b'{"detail":"mock forced: conversation not found"}')
            return
        if conv.startswith("mock-429"):
            self._json(429, b'{"detail":"mock forced: quota exceeded"}')
            return

        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream; charset=utf-8")
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        for name, data in EVENTS:
            chunk = "event: %s\ndata: %s\n\n" % (name, json.dumps(data, ensure_ascii=False))
            try:
                self.wfile.write(chunk.encode("utf-8"))
                self.wfile.flush()
            except (BrokenPipeError, ConnectionResetError):
                # 客户端断开 —— 这是本 mock 的正常收场之一（AC-5 场景）
                return
            time.sleep(DELAY)
        self.close_connection = True

class MockServer(ThreadingHTTPServer):
    """
    客户端主动断开时，BaseHTTPRequestHandler 会在 readline 上抛
    ConnectionResetError，socketserver 默认把整段 traceback 打到 stderr。
    在 AC-5 里这**是预期行为**（脚本就是要掐断客户端），
    让它刷一屏 traceback 只会淹没真正的验收输出，因此这里静默处理。
    """
    daemon_threads = True

    def handle_error(self, request, client_address):
        exc = sys.exc_info()[1]
        if isinstance(exc, (ConnectionResetError, BrokenPipeError)):
            return
        super().handle_error(request, client_address)


MockServer(("127.0.0.1", PORT), Handler).serve_forever()
PY
  MOCK_PID=$!
  sleep 1
  if kill -0 "$MOCK_PID" 2>/dev/null; then
    ok "已启动假上游 mock（127.0.0.1:${MOCK_PORT}，事件间隔 ${MOCK_DELAY_MS}ms）"
  else
    bad "mock 启动失败：$(head -5 "$TMPDIR_RUN/mock.log")"
    MOCK_PID=""
  fi
else
  note "未启用 MIAO_AI_MOCK=1，将直接探测真实上游"
fi

# 一次带正确签名的 explain 流（复用于 AC-2 / AC-3b）
#
# ⚠️ MIAO_AI=0 且未启用 mock 时**绝不发起这个请求** ——
#    它会真的连一次上游、真的消耗额度，而它服务的断言本来就要被跳过。
#    这正是「跳过 vs 通过」必须区分清楚的原因：这里如果照发，
#    一次「跳过」就变成了真实花费。
EXPLAIN_BODY='{"char":"照","code":"jvko","positions":[{"index":0,"key":"j","candidates":[{"glyph":"日","name":"日字"}]},{"index":1,"key":"v","candidates":[{"glyph":"刀","name":"刀字"}]},{"index":2,"key":"k","candidates":[{"glyph":"口","name":"口字"}]},{"index":3,"key":"o","candidates":[{"glyph":"灬","name":"四点底"}]}],"notes":[]}'
PROBE_OUT="$TMPDIR_RUN/probe.sse"
export BODY="$EXPLAIN_BODY"
if [[ "$AI_ENABLED" == "0" && "$MOCK_MODE" != "1" ]]; then
  PROBE_CODE="000"
  PROBE_META="000|0"
  : > "$PROBE_OUT"
  note "MIAO_AI=0 且未启用 mock：不发起任何真实上游调用（省额度），依赖上游的断言一律标跳过"
else
  PROBE_META=$(curl_json_stream "$API_BASE/api/wubi/ai/explain/stream" "$PROBE_OUT" "$STREAM_MAX_SEC" || echo "000|999")
  PROBE_CODE="${PROBE_META%%|*}"
fi
PROBE_ERR_CODE=$(sse_error_code "$PROBE_OUT")

if [[ "$PROBE_CODE" == "400" ]] && grep -q 'REPLAY_SIGNATURE_INVALID' "$PROBE_OUT"; then
  bad "上游探测请求被签名校验拒绝（nonce 复用或时间戳越界），请重跑"
elif [[ "$AI_ENABLED" == "0" && "$MOCK_MODE" != "1" ]]; then
  # 上面已经说过原因，这里只确认「探测未执行」这一事实，避免读输出的人
  # 误以为上游真的挂了（那会让人去查一个不存在的问题）。
  note "未探测上游可用性（按 MIAO_AI=0 主动跳过），AC-2 / AC-3b / AC-4a / AC-5 相应标为跳过"
elif [[ "$PROBE_CODE" == "200" ]] && grep -q '^event:' "$PROBE_OUT" 2>/dev/null; then
  upstream_ok=1
  if grep -q "^event: $MOCK_TAIL_EVENT\$" "$PROBE_OUT" 2>/dev/null; then
    MOCK_MODE=1
    note "确认后端已指向本地 mock —— 全部流式断言按确定性模式执行"
  else
    note "上游返回了事件流（真实上游或其他实现）"
  fi
  ok "上游可达：拿到 HTTP 200 的事件流"
elif grep -q '^event: error' "$PROBE_OUT" 2>/dev/null; then
  note "上游以 error 事件拒绝：${PROBE_ERR_CODE:-未知码}"
else
  note "未拿到事件流（HTTP ${PROBE_CODE:-000}），疑似上游不可达"
fi

# ──────────────────────────────────────────────────────────────────────
echo ""
echo ">>> 3/7 AC-3a 静态防线：四个流式转发器都不得设事件名白名单"
# ──────────────────────────────────────────────────────────────────────
# 这是 miao-ai「事件名只增不改」契约在本仓库唯一 100% 可靠的防线：
# 真实流里未必会出现未知事件，动态断言无从触发；一旦有人加了白名单，
# 这里立刻红。检查口径：转发调用 emitter.send 必须**无条件**先于
# `if ("exec".equals...)` 之类的分类计数，不能被事件名条件包住。
STATIC_ERR=$(API_SRC="$API_SRC" python3 - <<'PY'
import os, re, sys

root = os.environ["API_SRC"]
targets = [
    ("tool/wubi/WubiAiStreamController.java", "forwardEvents"),
    ("tool/cron/CronAIService.java", "stream"),
    ("tool/regex/RegexAIService.java", "stream"),
    ("tool/diff/ai/DiffAIController.java", "doProxyStream"),
]
errors = []
for rel, method in targets:
    path = os.path.join(root, rel)
    if not os.path.exists(path):
        errors.append("%s: 文件不存在（转发实现被移动/删除？）" % rel)
        continue
    src = open(path, encoding="utf-8").read()
    idx = src.find(method)
    if idx < 0:
        errors.append("%s: 找不到方法 %s" % (rel, method))
        continue
    body = src[idx:]
    sends = [m.start() for m in re.finditer(r"emitter\.send\(", body)]
    if not sends:
        errors.append("%s: %s 里没有 emitter.send，转发逻辑丢了？" % (rel, method))
        continue
    first_send = sends[0]
    window = body[:first_send]
    for kw in ("WHITELIST", "ALLOWED_EVENT", "SUPPORTED_EVENT", "KNOWN_EVENT"):
        if kw in window:
            errors.append("%s: %s 在转发前出现了事件名清单常量 %s" % (rel, method, kw))
    if re.search(r"switch\s*\(\s*(currentEvent|event|eventName)\s*\)", window):
        errors.append("%s: %s 在转发前对事件名做了 switch 分派（疑似白名单）" % (rel, method))
    # 转发前 600 字符内出现「只认这几个事件名」的过滤条件
    near = body[max(0, first_send - 600):first_send]
    if re.search(r'("conversation"|"exec"|"token"|"done")\s*\.equals\([^)]*\)\s*(&&|\|\|)', near):
        errors.append("%s: %s 的首个 emitter.send 落在事件名过滤条件内（疑似白名单）" % (rel, method))

# 类注释级别的纪律检查：转发器必须留下「不设白名单」的说明，
# 避免后来者以为白名单是遗漏而「顺手补上」
wubi = open(os.path.join(root, "tool/wubi/WubiAiStreamController.java"), encoding="utf-8").read()
if "不设白名单" not in wubi:
    errors.append("WubiAiStreamController.java: 类注释里「不设白名单」的纪律说明不见了")

for e in errors:
    print(e)
sys.exit(1 if errors else 0)
PY
) && STATIC_OK=1 || STATIC_OK=0

if [[ "$STATIC_OK" == "1" ]]; then
  ok "AC-3a 四个转发器均为无条件转发，未发现事件名白名单"
else
  bad "AC-3a 发现事件名白名单 / 条件转发："
  while IFS= read -r line; do [[ -n "$line" ]] && note "$line"; done <<<"$STATIC_ERR"
fi

# ──────────────────────────────────────────────────────────────────────
echo ""
echo ">>> 4/7 AC-4 上游非 2xx → event: error + 对应错误码记账"
# ──────────────────────────────────────────────────────────────────────
# WubiAiService.mapUpstream 的契约：**记账用上游码（AI_UPSTREAM_*），
# 事件里用映射后的面向用户码**。两者必须成对出现且一致，这正是同步/流式
# 共用一份映射的意义所在。
ledger_total() {
  curl -sS --max-time 20 -G "$API_BASE/api/admin/ai-invocations" \
    -H "Authorization: Bearer $TOKEN" \
    --data-urlencode "agentName=wubi-explainer" \
    --data-urlencode "startTime=$LEDGER_WINDOW" \
    --data-urlencode "page=1" \
    --data-urlencode "pageSize=200" 2>/dev/null \
  | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    print(int(((d.get('data') or {}).get('total')) or 0))
except Exception:
    print(-1)
" 2>/dev/null || echo -1
}

# 记账是 @Async 落库：轮询到 total 连续两次相同才算「稳定」
ledger_total_stable() {
  local prev=-2 cur last_seen=-2 stable=0 i
  for ((i = 0; i < LEDGER_WAIT_SEC; i++)); do
    cur=$(ledger_total)
    [[ "$cur" == "-1" ]] && { echo -1; return 0; }
    if [[ "$cur" == "$prev" ]]; then
      stable=$((stable+1))
      [[ "$stable" -ge 2 ]] && { echo "$cur"; return 0; }
    else
      stable=0
    fi
    prev="$cur"
    last_seen="$cur"
    sleep 1
  done
  echo "$last_seen"
}

latest_error_code() {  # 取窗口内最新一条（createdAt DESC 排序）的 error_code
  curl -sS --max-time 20 -G "$API_BASE/api/admin/ai-invocations" \
    -H "Authorization: Bearer $TOKEN" \
    --data-urlencode "agentName=wubi-explainer" \
    --data-urlencode "startTime=$LEDGER_WINDOW" \
    --data-urlencode "page=1" \
    --data-urlencode "pageSize=5" 2>/dev/null \
  | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    items = (d.get('data') or {}).get('items') or []
    print(items[0].get('error_code') or '' if items else '')
except Exception:
    print('')
" 2>/dev/null || echo ""
}

ledger_items() {  # 打印窗口内最近若干条，便于人工复核
  curl -sS --max-time 20 -G "$API_BASE/api/admin/ai-invocations" \
    -H "Authorization: Bearer $TOKEN" \
    --data-urlencode "agentName=wubi-explainer" \
    --data-urlencode "startTime=$LEDGER_WINDOW" \
    --data-urlencode "page=1" \
    --data-urlencode "pageSize=50" 2>/dev/null \
  | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    for it in ((d.get('data') or {}).get('items') or [])[:8]:
        print('       ↳ id=%s status=%s error_code=%s request_id=%s latency=%sms' % (
            it.get('id'), it.get('status'), it.get('error_code'),
            str(it.get('request_id') or '')[:8], it.get('latency_ms')))
except Exception:
    pass
" 2>/dev/null || true
}

LEDGER_WINDOW="$(date '+%Y-%m-%dT%H:%M:%S')"
if [[ "$have_ledger" == "1" ]]; then
  LEDGER_BASE=$(ledger_total)
  if [[ "$LEDGER_BASE" == "-1" ]]; then
    have_ledger=0
    warn "查询 ai_invocations 失败（账号权限或端点不可用），记账断言改为跳过"
  else
    ok "记账窗口起点：${LEDGER_WINDOW}（wubi-explainer 窗口内累计 $LEDGER_BASE 条）"
  fi
fi

# ── 4a：上游非 2xx（用不存在的会话 id 逼上游回 4xx）──────────────────
# explain 会先建会话，所以必须走 followup：它把 conversationId 原样写进
# metadata 转发给上游，上游对不存在的会话回 404 / 410。
# BODY 由调用方导出（curl_json_stream 读全局 BODY）。
run_followup_with_conv() {  # $1=conversationId  $2=输出文件  $3=最大秒数
  export BODY=$(CONV="$1" python3 - <<'PY'
import json, os
print(json.dumps({"char": "照", "question": "第 1 位为什么取「日」不取「曰」？",
                  "conversationId": os.environ["CONV"]}, ensure_ascii=False))
PY
)
  curl_json_stream "$API_BASE/api/wubi/ai/followup/stream" "$2" "$3"
}

if [[ "$MOCK_MODE" == "1" ]]; then
  UPSTREAM_CONV="mock-404-ai-6-1"
  AC4_SRC="mock 上游强制 404"
elif [[ "$AI_ENABLED" == "1" ]]; then
  UPSTREAM_CONV="conv_deadbeef00000000000000000000dead"
  AC4_SRC="真实上游（伪造不存在的 conversationId）"
else
  UPSTREAM_CONV=""
  AC4_SRC="未启用"
fi

AC4_OUT="$TMPDIR_RUN/upstream404.sse"
if [[ -n "$UPSTREAM_CONV" ]]; then
  AC4_HTTP=$(run_followup_with_conv "$UPSTREAM_CONV" "$AC4_OUT" 60 || echo "000|0")
  AC4_EVENT_CODE=$(sse_error_code "$AC4_OUT")

  if grep -q '^event: error' "$AC4_OUT" 2>/dev/null; then
    ok "AC-4a 上游非 2xx → 下发 event: error（${AC4_SRC}，事件码 ${AC4_EVENT_CODE:-空}）"
  else
    bad "AC-4a 上游非 2xx 时没有下发 event: error（HTTP ${AC4_HTTP%%|*}）：$(head -c 200 "$AC4_OUT" | tr '\n' '|')"
  fi

  if [[ "$have_ledger" == "1" ]]; then
    NEW_TOTAL=$(ledger_total_stable)
    LEDGER_CODE=$(latest_error_code)
    case "$LEDGER_CODE" in
      AI_UPSTREAM_410) EXPECT_USER=AI_CONVERSATION_EXPIRED ;;
      AI_UPSTREAM_404) EXPECT_USER=AI_CONVERSATION_NOT_FOUND ;;
      AI_UPSTREAM_403) EXPECT_USER=AI_CONVERSATION_FORBIDDEN ;;
      AI_UPSTREAM_409) EXPECT_USER=AI_CONVERSATION_BUSY ;;
      AI_UPSTREAM_429) EXPECT_USER=AI_QUOTA_EXCEEDED ;;
      AI_UPSTREAM_5XX) EXPECT_USER=AI_SERVICE_UNAVAILABLE ;;
      *)                 EXPECT_USER="$LEDGER_CODE" ;;   # OTHER 等原样冒泡
    esac
    if [[ -n "$LEDGER_CODE" ]]; then
      if [[ "$AC4_EVENT_CODE" == "$EXPECT_USER" ]]; then
        ok "AC-4a 记账码（${LEDGER_CODE}）与事件码（${AC4_EVENT_CODE}）符合 mapUpstream 映射"
      else
        bad "记账码 $LEDGER_CODE 应映射为事件码 ${EXPECT_USER}，实际事件码 ${AC4_EVENT_CODE:-空}"
      fi
    else
      skip "上游非 2xx 记账码（窗口内没查到记录，可能上游根本没返回非 2xx）"
      note "上游实际返回：$(head -c 120 "$AC4_OUT" | tr '\n' '|')"
    fi

    if [[ "$NEW_TOTAL" != "-1" && "$LEDGER_BASE" != "-1" ]]; then
      DELTA=$((NEW_TOTAL - LEDGER_BASE))
      if [[ "$DELTA" == "1" ]]; then
        ok "AC-6a 上游非 2xx 路径只留一条 ai_invocations 记录（增量 = 1）"
      else
        bad "AC-6a 上游非 2xx 路径记账增量 = ${DELTA}（期望 1；>1 说明 CAS 守卫失效，=0 说明没记账）"
        ledger_items
      fi
    fi
  else
    skip "AC-4a 记账码一致性与 AC-6a 幂等（无 SUPER_ADMIN，无法读 ai_invocations）"
  fi
else
  skip "AC-4a 上游非 2xx → event: error（MIAO_AI=0 且未启用 mock：需要真实上游或本地 mock 才能拿到非 2xx）"
  skip "AC-4a 记账码与事件码一致性（同上）"
  skip "AC-6a 上游非 2xx 路径幂等记账（同上；需要一次真实的失败流式调用）"
fi

# ── 4b：上游不可达时的错误事件（走 SSE_PROXY_ERROR 分支）────────────
if [[ "$upstream_ok" == "0" && "$AI_ENABLED" == "1" && "$MOCK_MODE" != "1" ]]; then
  DEAD_CODE=$(sse_error_code "$PROBE_OUT")
  if grep -q '^event: error' "$PROBE_OUT" 2>/dev/null; then
    ok "AC-4b 上游不可达 → 下发 event: error（事件码 ${DEAD_CODE:-空}）"
    note "这是 SSE_PROXY_ERROR 分支（连接失败），与 AC-4a 的「上游回了非 2xx」不是同一条路径"
  else
    bad "AC-4b 上游不可达时既没有事件也没有 error 事件：$(head -c 200 "$PROBE_OUT" | tr '\n' '|')"
  fi
fi

# ──────────────────────────────────────────────────────────────────────
echo ""
echo ">>> 5/7 AC-2 / AC-3b 事件序列顺序 + 未知事件名原样转发"
# ──────────────────────────────────────────────────────────────────────
if [[ "$upstream_ok" == "1" ]]; then
  SEQ=$(python3 - "$PROBE_OUT" "$MOCK_TAIL_EVENT" <<'PY'
import sys
raw = open(sys.argv[1], encoding="utf-8", errors="replace").read()
TAIL = sys.argv[2]
events = [l.split(":", 1)[1].strip() for l in raw.splitlines() if l.startswith("event:")]
if not events:
    print("RESULT=fail"); print("DETAIL=流里一个事件都没有")
    raise SystemExit(0)

# 契约顺序：conversation? → exec* → token* → done
# ⚠️ done 之后允许出现**本脚本 mock 专属的尾标记**，用于 AC-3b 判定转发完整性。
#    真实上游不会发这个事件名，所以这不是给真实现放水：
#    判定依然要求「done 之后不得再有任何 token」—— 那才是真正的乱序。
bad_seq = []
phase = 0
for idx, ev in enumerate(events):
    if ev == "conversation":
        if idx != 0:
            bad_seq.append("conversation 出现在第 %d 位" % idx)
        phase = max(phase, 1)
    elif ev == "exec":
        if phase > 2:
            bad_seq.append("exec 在 %s 之后" % events[idx - 1])
        phase = max(phase, 2)
    elif ev == "token":
        if phase >= 4:
            bad_seq.append("done 之后又出现 token（正文不得续写）")
        phase = max(phase, 3)
    elif ev == "done":
        if phase >= 4:
            bad_seq.append("done 出现了多次")
        tail = events[idx + 1:]
        illegal = [e for e in tail if e != TAIL]
        if illegal:
            bad_seq.append("done 之后还有非尾标记事件 %s" % illegal)
        phase = 4
    # 其他事件名不参与顺序判定（契约只承诺「原样转发」）
if "done" not in events:
    bad_seq.append("没有收到 done 事件（miao-ai 契约：done 是唯一收尾事件）")
if bad_seq:
    print("RESULT=fail")
    print("DETAIL=" + "；".join(bad_seq[:3]))
else:
    n_exec = events.count("exec")
    n_token = events.count("token")
    print("RESULT=pass")
    print("DETAIL=%s（exec×%d，token×%d，done 收尾）"
          % (" → ".join(events[:6]) + (" …" if len(events) > 6 else ""), n_exec, n_token))
PY
  )
  S1=$(sed -n 's/^RESULT=//p' <<<"$SEQ"); D1=$(sed -n 's/^DETAIL=//p' <<<"$SEQ")
  if [[ "$S1" == "pass" ]]; then
    ok "AC-2 事件序列顺序正确：$D1"
  else
    bad "AC-2 事件序列不合法：$D1"
    note "实际序列：$(grep '^event:' "$PROBE_OUT" | sed 's/event: *//' | tr '\n' ' ')"
  fi

  # AC-3b：区分「上游没发未知事件」与「上游发了但被后端丢弃」——
  # 只有前者才是跳过。两者的差别由 mock 追加的 known 尾标记给出：
  # 看到尾标记就证明流是完整到达的，此时未知事件缺席只能是「被丢了」。
  SAW_TAIL=$(grep -c "^event: $MOCK_TAIL_EVENT\$" "$PROBE_OUT" 2>/dev/null || echo 0)
  SAW_UNKNOWN=$(grep -c "^event: $MOCK_UNKNOWN_EVENT\$" "$PROBE_OUT" 2>/dev/null || echo 0)
  if [[ "$SAW_UNKNOWN" -ge 1 ]]; then
    ok "AC-3b 未知事件名被原样转发（收到 event: ${MOCK_UNKNOWN_EVENT}）"
  elif [[ "$SAW_TAIL" -ge 1 ]]; then
    # 流走完了（尾标记在），说明未知事件确实是被中间层吃掉的 —— 这是明确的回归
    bad "AC-3b 上游下发了未知事件名 ${MOCK_UNKNOWN_EVENT}，但流里没有它（尾标记在，说明是被丢弃而非未下发）"
    note "这是「事件名白名单」回归：miao-ai 契约承诺事件名只增不改，后端不得过滤"
    note "实际序列：$(grep '^event:' "$PROBE_OUT" | sed 's/event: *//' | tr '\n' ' ')"
  else
    skip "AC-3b 未知事件名动态转发（本次上游未下发契约外事件，无观测机会）"
    note "确定性验证办法：按顶部 MIAO_AI_MOCK=1 模式运行（假上游会下发一个契约外事件名 + 尾标记）"
  fi
else
  SKIP_REASON="上游不可达"
  [[ "$AI_ENABLED" == "0" && "$MOCK_MODE" != "1" ]] && SKIP_REASON="MIAO_AI=0，按约定不发起上游调用"
  skip "AC-2 正常 token 流的事件序列顺序（${SKIP_REASON}）"
  skip "AC-3b 未知事件名动态转发（同上；MIAO_AI=0 下可验的是 AC-3a 静态防线）"
fi

# ──────────────────────────────────────────────────────────────────────
echo ""
echo ">>> 6/7 AC-5 客户端中断 → 记 SSE_CLIENT_DISCONNECTED，不记上游故障"
# ──────────────────────────────────────────────────────────────────────
# 这是本次要修的真实 Bug 的回归防线。构造方式：
#   1) 发起流式请求，但 --max-time 设为「够收到前几个事件、够不到 done」；
#      curl 被超时杀掉 → TCP 连接关闭 = 浏览器关页面/取消请求的等价物。
#   2) 上游仍在继续发事件 → 后端下次 emitter.send 写失败
#      → WubiAiStreamController 抛 ClientGoneException（**不是** UpstreamGoneException）
#      → 记账 SSE_CLIENT_DISCONNECTED。
#   3) 关键反例：绝不能出现 SSE_PROXY_ERROR / SSE_ERROR / AI_UPSTREAM_BROKEN /
#      SSE_TIMEOUT —— 那说明客户端断开被当成了上游故障（失败率虚高）。
#      所以 emitter.onTimeout / onError 也必须有 CAS 守卫，与断开路径只能有一条记录。
if [[ "$upstream_ok" == "1" ]] || [[ "$MOCK_MODE" == "1" ]]; then
  # 掐在「已收到至少 1 个事件、但远不到 done」的时刻
  CUT_SEC=$(python3 -c "print(max(1.0, ($MOCK_DELAY_MS / 1000.0) * 1.5))")
  DIS_BASE=$(ledger_total)
  export BODY="$EXPLAIN_BODY"
  curl_json_stream "$API_BASE/api/wubi/ai/explain/stream" "$TMPDIR_RUN/cut.sse" "$CUT_SEC" >/dev/null || true
  # 给后端线程一点时间撞上 EPIPE 并异步落库
  sleep 3

  if [[ "$have_ledger" == "1" ]]; then
    STABLE=$(ledger_total_stable)
    NEW_CODE=$(latest_error_code)
    if [[ "$NEW_CODE" == "SSE_CLIENT_DISCONNECTED" ]]; then
      ok "AC-5 客户端中断记为 SSE_CLIENT_DISCONNECTED（不是上游故障）"
    else
      bad "AC-5 客户端中断的记账码为 ${NEW_CODE:-无}，期望 SSE_CLIENT_DISCONNECTED"
      note "若记成 SSE_ERROR/SSE_PROXY_ERROR/SSE_TIMEOUT/AI_UPSTREAM_BROKEN，说明断开被当成故障或 CAS 守卫失效"
      ledger_items
    fi
    if [[ "$STABLE" != "-1" && "$DIS_BASE" != "-1" ]]; then
      DELTA=$((STABLE - DIS_BASE))
      if [[ "$DELTA" == "1" ]]; then
        ok "AC-6c 客户端中断只留一条记录（增量 = 1）"
      else
        bad "AC-6c 客户端中断记账增量 = ${DELTA}（期望 1）"
        ledger_items
      fi
    fi
  else
    skip "AC-5 客户端中断记账 / AC-6c 幂等（无 SUPER_ADMIN，无法读 ai_invocations）"
  fi
else
  skip "AC-5 客户端中断记 SSE_CLIENT_DISCONNECTED"
  if [[ "$AI_ENABLED" == "0" && "$MOCK_MODE" != "1" ]]; then
    note "跳过原因：MIAO_AI=0 —— 本项**必须**真发一次请求并在半路掐断，无法只靠静态判定"
  else
    note "跳过原因：上游不可达 —— 上游不吐事件，后端就撞不上写失败，只会把这次记账成 SSE_PROXY_ERROR，测不到目标分支"
  fi
  note "确定性验证办法：按顶部 MIAO_AI_MOCK=1 模式运行（假上游持续吐事件，脚本会在中途掐断客户端）"
fi

# ──────────────────────────────────────────────────────────────────────
echo ""
echo ">>> 7/7 五条 SSE 端点连通性（路由与签名链路）"
# ──────────────────────────────────────────────────────────────────────
# 逐个发一个**必然失败**的请求：只要拿到 200 / 400 的业务错误（而不是 401/403/404），
# 就说明路由存在、鉴权链路通。故意不构造合法业务参数，是为了不消耗额度。
declare -a ENDPOINTS=(
  "/api/wubi/ai/explain/stream|{\"code\":\"jvko\"}"
  "/api/wubi/ai/followup/stream|{\"char\":\"照\"}"
  "/api/cron/ai/stream|{\"task\":\"explain\"}"
  "/api/regex/ai/stream|{\"task\":\"explain\"}"
  "/api/diff/ai/summary|{\"language\":\"java\"}"
)
EP_OK=0
EP_TOTAL=0
for entry in "${ENDPOINTS[@]}"; do
  path="${entry%%|*}"
  body="${entry#*|}"
  EP_TOTAL=$((EP_TOTAL+1))
  OUT="$TMPDIR_RUN/ep-$(echo "$path" | tr '/.' '__').out"
  export BODY="$body"
  CODE=$(curl_json_stream "$API_BASE$path" "$OUT" 20 | cut -d'|' -f1 || echo "000")
  if [[ "$CODE" == "401" || "$CODE" == "403" ]]; then
    bad "$path → ${CODE}（路由存在但当前账号无权访问该工具，请确认角色授权）"
  elif [[ "$CODE" == "404" ]]; then
    bad "$path → 404（端点路径已变更，请更新本脚本）"
  elif grep -q 'REPLAY_SIGNATURE_INVALID' "$OUT" 2>/dev/null; then
    bad "$path 签名被拒（nonce 复用或时间戳越界，重跑即可）"
  elif [[ "$CODE" == "000" ]]; then
    bad "$path 无响应（超时）"
  else
    EP_OK=$((EP_OK+1))
    note "$path → HTTP ${CODE}（路由与签名链路通）"
  fi
done
if [[ "$EP_OK" == "$EP_TOTAL" ]]; then
  ok "五条 SSE 端点路由与签名链路全部可达"
else
  bad "五条端点中仅 $EP_OK 条连通"
fi

# ──────────────────────────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
TOTAL=$((PASS + FAIL + SKIP))
if [[ "$TOTAL" -gt 0 ]]; then
  RATE=$(python3 -c "print(f'{($PASS/$TOTAL)*100:.1f}')")
else
  RATE="0.0"
fi
echo "通过 $PASS / 失败 $FAIL / 跳过 ${SKIP}（共 $TOTAL 项，通过率 ${RATE}%）"
echo ""
echo "说明："
echo "  · 「跳过」表示该断言依赖真实上游（可达 + 有额度）或需要 mock 配置，本次未验证，"
echo "    **不等于通过**。要把它变成可验证项，见脚本顶部 MIAO_AI=0 / MIAO_AI_MOCK=1 两种模式。"
if [[ "$MOCK_MODE" != "1" && "$AI_ENABLED" == "1" ]]; then
  echo "  · 本次按「真实上游」模式运行。上游不可用时 AC-2 / AC-3b / AC-4a / AC-5 会被跳过。"
fi
if [[ "$MOCK_MODE" == "1" ]]; then
  echo "  · 本次按「本地 mock」模式运行（不消耗任何额度）。"
fi
echo "  · 记账类断言按「wubi-explainer 当日窗口内调用总数增量」统计，运行期间请勿并发使用 AI 功能。"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

[[ "$FAIL" -gt 0 ]] && exit 1
exit 0
