#!/usr/bin/env bash
# Story nt-3-4: WHOIS 查询 — 验收
# 用法: bash scripts/check-nt-3-4-whois.sh
# 可选集成: API_BASE=http://localhost:8080 ADMIN_PASSWORD=xxx bash scripts/check-nt-3-4-whois.sh

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/miao-toolbox-api"

echo ">>> 单元测试"
./mvnw -q test -Dtest=WhoisQueryServiceTest,WhoisQueryControllerTest,WhoisClientWrapperTest

API_BASE="${API_BASE:-}"
if [[ -n "$API_BASE" && -n "${ADMIN_PASSWORD:-}" ]]; then
  echo ""
  echo ">>> 集成: POST $API_BASE/api/network/inspector/whois"
  LOGIN=$(curl -s -X POST "$API_BASE/api/auth/login" \
    -H 'Content-Type: application/json' \
    -d "{\"username\":\"${ADMIN_USERNAME:-test}\",\"password\":\"$ADMIN_PASSWORD\"}")
  TOKEN=$(echo "$LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['accessToken'])")
  KEY=$(echo "$LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['signingKey'])")

  sign() {
    local body="$1"
    local ts nonce sig
    ts=$(python3 -c 'import time; print(int(time.time()*1000))')
    nonce=$(python3 -c 'import uuid; print(uuid.uuid4())')
    sig=$(python3 - "$KEY" "$ts" "$nonce" "$body" <<'PY'
import sys,hmac,hashlib
key=sys.argv[1].encode(); ts=sys.argv[2]; nonce=sys.argv[3]; body=sys.argv[4]
msg=f"{ts}{nonce}{body}".encode()
print(hmac.new(key, msg, hashlib.sha256).hexdigest())
PY
    )
    echo "$ts|$nonce|$sig"
  }

  # 域名 WHOIS
  BODY='{"target":"example.com"}'
  IFS='|' read -r TS NONCE SIG <<< "$(sign "$BODY")"
  RESP=$(curl -s -X POST "$API_BASE/api/network/inspector/whois" \
    -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
    -H "X-Request-Timestamp: $TS" -H "X-Request-Nonce: $NONCE" -H "X-Request-Signature: $SIG" \
    -d "$BODY")
  echo "$RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d['code']=='SUCCESS', d; assert d['data']['queryType']=='DOMAIN'; print('  ✅ domain whois queryType=', d['data']['queryType'], 'server=', d['data']['whoisServer'])"

  # IP WHOIS
  BODY='{"target":"8.8.8.8"}'
  IFS='|' read -r TS NONCE SIG <<< "$(sign "$BODY")"
  RESP=$(curl -s -X POST "$API_BASE/api/network/inspector/whois" \
    -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
    -H "X-Request-Timestamp: $TS" -H "X-Request-Nonce: $NONCE" -H "X-Request-Signature: $SIG" \
    -d "$BODY")
  echo "$RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d['code']=='SUCCESS', d; assert d['data']['queryType']=='IP'; print('  ✅ ip whois queryType=', d['data']['queryType'])"

  # SSRF 拦截内部 WHOIS 服务器
  BODY='{"target":"example.com","whoisServer":"10.0.0.1:43"}'
  IFS='|' read -r TS NONCE SIG <<< "$(sign "$BODY")"
  RESP=$(curl -s -X POST "$API_BASE/api/network/inspector/whois" \
    -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
    -H "X-Request-Timestamp: $TS" -H "X-Request-Nonce: $NONCE" -H "X-Request-Signature: $SIG" \
    -d "$BODY")
  echo "$RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d['code']=='NETWORK_SSRF_BLOCKED', d; print('  ✅ SSRF blocked 10.0.0.1:43')"
else
  echo ""
  echo "（跳过 HTTP 集成：未设置 API_BASE + ADMIN_PASSWORD）"
fi

echo ""
echo ">>> 汇总: 单元测试通过；WHOIS 查询 API + UI 已交付"
echo "  路由 UI: /tools/network/inspector/whois"
echo "  API: POST /api/network/inspector/whois"
