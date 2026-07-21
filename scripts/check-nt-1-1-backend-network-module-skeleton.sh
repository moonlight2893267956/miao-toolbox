#!/usr/bin/env bash
# Story nt-1-1: 后端 network 模块骨架与工具元数据 API 验收脚本
#
# 前置条件:
#   - 后端已启动: http://localhost:8080 (或 BASE_URL 指定)
#   - 环境变量 ADMIN_PASSWORD 为管理员密码
#   - 可选 ADMIN_USERNAME (默认 admin)
#
# 用法:
#   ADMIN_PASSWORD='your-password' ./scripts/check-nt-1-1-backend-network-module-skeleton.sh
#
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:8080}"
ADMIN_USERNAME="${ADMIN_USERNAME:-admin}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-}"

PASS=0
FAIL=0

ok() { echo "  ✅ $1"; PASS=$((PASS + 1)); }
bad() { echo "  ❌ $1"; FAIL=$((FAIL + 1)); }

if [[ -z "$ADMIN_PASSWORD" ]]; then
  echo "请通过环境变量 ADMIN_PASSWORD 传入管理员密码"
  exit 1
fi

echo ">>> 登录获取 token + signingKey..."
LOGIN_RESP=$(curl -s -X POST "$BASE_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"${ADMIN_USERNAME}\",\"password\":\"${ADMIN_PASSWORD}\"}")

TOKEN=$(echo "$LOGIN_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('accessToken',''))" 2>/dev/null || true)
SIGNING_KEY=$(echo "$LOGIN_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('signingKey',''))" 2>/dev/null || true)

if [[ -z "$TOKEN" || -z "$SIGNING_KEY" ]]; then
  echo "登录失败，请检查账号密码或后端是否启动"
  echo "响应: $LOGIN_RESP"
  exit 1
fi
echo "登录成功"

echo ""
echo "=== AC3: GET /api/network/tools 返回工具元数据 ==="
TIMESTAMP=$(python3 -c "import time; print(int(time.time()*1000))")
NONCE=$(python3 -c "import uuid; print(uuid.uuid4().hex)")
# GET: body empty for signature payload per project convention
SIGNATURE=$(printf '%s' "${TIMESTAMP}${NONCE}" | openssl dgst -sha256 -hmac "$SIGNING_KEY" -binary | xxd -p -c 256)
HTTP_CODE=$(curl -s -o /tmp/nt11-body.json -w "%{http_code}" -X GET "$BASE_URL/api/network/tools" \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Request-Timestamp: $TIMESTAMP" \
  -H "X-Request-Nonce: $NONCE" \
  -H "X-Request-Signature: $SIGNATURE")
BODY=$(cat /tmp/nt11-body.json)
if [[ "$HTTP_CODE" == "200" ]]; then
  ok "HTTP 200"
else
  bad "期望 HTTP 200，实际 ${HTTP_CODE}，body=${BODY}"
fi

python3 - "$BODY" <<'PY' && ok "ApiResponse code=SUCCESS 且字段完整" || bad "响应格式/字段不符合 AC3"
import json,sys
body=sys.argv[1]
d=json.loads(body)
assert d.get("code")=="SUCCESS", d
assert isinstance(d.get("data"), list) and len(d["data"])>=1, d
required={"id","name","category","phase","description","icon","route"}
sample=d["data"][0]
missing=required-set(sample.keys())
assert not missing, f"missing fields: {missing}"
ids={t["id"] for t in d["data"]}
assert "dns-query" in ids and "base64-codec" in ids, ids
print(f"tools={len(d['data'])}")
PY

echo ""
echo "=== AC4: 过滤器链生效（防重放 + JWT 认证）==="
# 裸请求：先被防重放拦截（缺少签名头）→ 400
HTTP_BARE=$(curl -s -o /tmp/nt11-bare.json -w "%{http_code}" "$BASE_URL/api/network/tools")
if [[ "$HTTP_BARE" == "400" ]]; then
  ok "裸请求被防重放拦截 (400 REPLAY_PROTECTION_FAILED)"
else
  bad "裸请求期望 400，实际 ${HTTP_BARE}"
fi
# 有签名头、无 Authorization：应被 JWT 拦截 → 401
TS_U=$(python3 -c "import time; print(int(time.time()*1000))")
NONCE_U=$(python3 -c "import uuid; print(uuid.uuid4().hex)")
HTTP_UNAUTH=$(curl -s -o /tmp/nt11-unauth.json -w "%{http_code}" "$BASE_URL/api/network/tools" \
  -H "X-Request-Timestamp: $TS_U" \
  -H "X-Request-Nonce: $NONCE_U" \
  -H "X-Request-Signature: deadbeef")
if [[ "$HTTP_UNAUTH" == "401" ]]; then
  ok "无 Token 返回 401（JWT 认证生效）"
else
  bad "无 Token 期望 401，实际 ${HTTP_UNAUTH}"
fi

echo ""
echo "=== AC2 间接: 工具数量与 category 覆盖 ==="
python3 - "$BODY" <<'PY' && ok "至少覆盖 5 个 category 且 phase∈{1,2,3}" || bad "category/phase 覆盖不足"
import json,sys
d=json.loads(sys.argv[1])
cats={t["category"] for t in d["data"]}
phases={t["phase"] for t in d["data"]}
assert {"converter","generator","analyzer","inspector","ai"} <= cats, cats
assert phases <= {1,2,3} and 1 in phases and 2 in phases and 3 in phases, phases
print(f"categories={sorted(cats)} phases={sorted(phases)}")
PY

echo ""
echo "=============================="
echo "通过: $PASS  失败: $FAIL"
if [[ "$FAIL" -gt 0 ]]; then
  exit 1
fi
echo "Story nt-1-1 验收全部通过"
