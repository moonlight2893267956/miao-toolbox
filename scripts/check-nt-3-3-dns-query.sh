#!/usr/bin/env bash
# Story nt-3-3: DNS 查询 — 验收
# 用法: bash scripts/check-nt-3-3-dns-query.sh
# 可选集成: API_BASE=http://localhost:8080 ADMIN_PASSWORD=xxx bash scripts/check-nt-3-3-dns-query.sh

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/miao-toolbox-api"

echo ">>> 单元测试"
./mvnw -q test -Dtest=DnsQueryServiceTest,DnsQueryControllerTest,DnsClientWrapperTest

API_BASE="${API_BASE:-}"
if [[ -n "$API_BASE" && -n "${ADMIN_PASSWORD:-}" ]]; then
  echo ""
  echo ">>> 集成: POST $API_BASE/api/network/inspector/dns-query"
  LOGIN=$(curl -s -X POST "$API_BASE/api/auth/login" \
    -H 'Content-Type: application/json' \
    -d "{\"username\":\"${ADMIN_USERNAME:-test}\",\"password\":\"$ADMIN_PASSWORD\"}")
  TOKEN=$(echo "$LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['accessToken'])")
  KEY=$(echo "$LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['signingKey'])")

  # 正常查询 A/AAAA
  BODY='{"domain":"www.baidu.com","types":["A","AAAA"]}'
  TS=$(python3 -c 'import time; print(int(time.time()*1000))')
  NONCE=$(python3 -c 'import uuid; print(uuid.uuid4())')
  SIG=$(python3 - <<PY
import hmac,hashlib
key=b'''$KEY'''
msg=f'''${TS}${NONCE}${BODY}'''.encode()
print(hmac.new(key, msg, hashlib.sha256).hexdigest())
PY
  )
  RESP=$(curl -s -X POST "$API_BASE/api/network/inspector/dns-query" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -H "X-Request-Timestamp: $TS" \
    -H "X-Request-Nonce: $NONCE" \
    -H "X-Request-Signature: $SIG" \
    -d "$BODY")
  echo "$RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d['code']=='SUCCESS', d; assert d['data']['total']>=1; print('  ✅ query A/AAAA total=', d['data']['total'], 'resolver=', d['data']['dnsServer'])"

  # 自定义 DNS 服务器（SSRF 校验）
  BODY2='{"domain":"www.baidu.com","types":["A"],"dnsServer":"8.8.8.8"}'
  TS=$(python3 -c 'import time; print(int(time.time()*1000))')
  NONCE=$(python3 -c 'import uuid; print(uuid.uuid4())')
  SIG=$(python3 - <<PY
import hmac,hashlib
key=b'''$KEY'''
msg=f'''${TS}${NONCE}${BODY2}'''.encode()
print(hmac.new(key, msg, hashlib.sha256).hexdigest())
PY
  )
  RESP2=$(curl -s -X POST "$API_BASE/api/network/inspector/dns-query" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -H "X-Request-Timestamp: $TS" \
    -H "X-Request-Nonce: $NONCE" \
    -H "X-Request-Signature: $SIG" \
    -d "$BODY2")
  echo "$RESP2" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d['code']=='SUCCESS', d; assert d['data']['dnsServer']=='8.8.8.8:53', d; print('  ✅ custom resolver 8.8.8.8:53 used')"

  # SSRF 拦截内部 DNS 服务器
  BODY3='{"domain":"www.baidu.com","types":["A"],"dnsServer":"10.0.0.1"}'
  TS=$(python3 -c 'import time; print(int(time.time()*1000))')
  NONCE=$(python3 -c 'import uuid; print(uuid.uuid4())')
  SIG=$(python3 - <<PY
import hmac,hashlib
key=b'''$KEY'''
msg=f'''${TS}${NONCE}${BODY3}'''.encode()
print(hmac.new(key, msg, hashlib.sha256).hexdigest())
PY
  )
  RESP3=$(curl -s -X POST "$API_BASE/api/network/inspector/dns-query" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -H "X-Request-Timestamp: $TS" \
    -H "X-Request-Nonce: $NONCE" \
    -H "X-Request-Signature: $SIG" \
    -d "$BODY3")
  echo "$RESP3" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d['code']=='NETWORK_SSRF_BLOCKED', d; print('  ✅ SSRF blocked 10.0.0.1')"
else
  echo ""
  echo "（跳过 HTTP 集成：未设置 API_BASE + ADMIN_PASSWORD）"
fi

echo ""
echo ">>> 汇总: 单元测试通过；DNS 查询 API + UI 已交付"
echo "  路由 UI: /tools/network/inspector/dns-query"
echo "  API: POST /api/network/inspector/dns-query"
