#!/usr/bin/env bash
# Story nt-3-2: TCP Ping — 验收
# 用法: bash scripts/check-nt-3-2-tcp-ping.sh
# 可选集成: API_BASE=http://localhost:8080 ADMIN_PASSWORD=xxx bash scripts/check-nt-3-2-tcp-ping.sh

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/miao-toolbox-api"

echo ">>> 单元测试"
./mvnw -q test -Dtest=TcpPingServiceTest,TcpPingControllerTest,SsrfProtectorTest,NetworkClientFactoryTest

API_BASE="${API_BASE:-}"
if [[ -n "$API_BASE" && -n "${ADMIN_PASSWORD:-}" ]]; then
  echo ""
  echo ">>> 集成: POST $API_BASE/api/network/inspector/tcp-ping"
  LOGIN=$(curl -s -X POST "$API_BASE/api/auth/login" \
    -H 'Content-Type: application/json' \
    -d "{\"username\":\"${ADMIN_USERNAME:-test}\",\"password\":\"$ADMIN_PASSWORD\"}")
  TOKEN=$(echo "$LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['accessToken'])")
  KEY=$(echo "$LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['signingKey'])")
  BODY='{"host":"www.baidu.com","port":443,"count":2}'
  TS=$(python3 -c 'import time; print(int(time.time()*1000))')
  NONCE=$(python3 -c 'import uuid; print(uuid.uuid4())')
  SIG=$(python3 - <<PY
import hmac,hashlib
key=b'''$KEY'''
msg=f'''${TS}${NONCE}${BODY}'''.encode()
print(hmac.new(key, msg, hashlib.sha256).hexdigest())
PY
)
  RESP=$(curl -s -X POST "$API_BASE/api/network/inspector/tcp-ping" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -H "X-Request-Timestamp: $TS" \
    -H "X-Request-Nonce: $NONCE" \
    -H "X-Request-Signature: $SIG" \
    -d "$BODY")
  echo "$RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d['code']=='SUCCESS', d; assert d['data']['count']==2; print('  ✅ batch ping count=2 successCount=', d['data']['successCount'])"

  # SSRF
  BODY2='{"host":"127.0.0.1","port":443,"count":1}'
  TS=$(python3 -c 'import time; print(int(time.time()*1000))')
  NONCE=$(python3 -c 'import uuid; print(uuid.uuid4())')
  SIG=$(python3 - <<PY
import hmac,hashlib
key=b'''$KEY'''
msg=f'''${TS}${NONCE}${BODY2}'''.encode()
print(hmac.new(key, msg, hashlib.sha256).hexdigest())
PY
)
  RESP2=$(curl -s -X POST "$API_BASE/api/network/inspector/tcp-ping" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -H "X-Request-Timestamp: $TS" \
    -H "X-Request-Nonce: $NONCE" \
    -H "X-Request-Signature: $SIG" \
    -d "$BODY2")
  echo "$RESP2" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d['code']=='SUCCESS', d; assert d['data']['failCount']>=1; assert d['data']['probes'][0].get('errorCode')=='NETWORK_SSRF_BLOCKED'; print('  ✅ SSRF blocked 127.0.0.1')"
else
  echo ""
  echo "（跳过 HTTP 集成：未设置 API_BASE + ADMIN_PASSWORD）"
fi

echo ""
echo ">>> 汇总: 单元测试通过；TCP Ping API + UI 已交付"
echo "  路由 UI: /tools/network/inspector/tcp-ping"
echo "  API: POST /api/network/inspector/tcp-ping"
echo "  SSE: POST /api/network/inspector/tcp-ping/stream"
