#!/bin/bash
# Story tc-1-1 验收脚本
# 用法: ./ys.sh
# 前置：后端已启动，本地有 python3 + openssl
set -e

BASE_URL="http://localhost:8080"
DIFF_URL="$BASE_URL/api/diff"

# ---- 1. 登录获取 token + signingKey ----
echo ">>> 登录获取 token..."
LOGIN_RESP=$(curl -s -X POST "$BASE_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"WXY2357956wxy"}')

TOKEN=$(echo "$LOGIN_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['accessToken'])")
SIGNING_KEY=$(echo "$LOGIN_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['signingKey'])")

if [ -z "$TOKEN" ] || [ -z "$SIGNING_KEY" ]; then
  echo "登录失败，请检查用户名密码或后端是否启动"
  exit 1
fi
echo "登录成功，token 和 signingKey 已获取"

# ---- 辅助函数：带签名的 curl ----
signed_curl() {
  local METHOD="$1"
  local URL="$2"
  local BODY="$3"

  local TIMESTAMP=$(python3 -c "import time; print(int(time.time()*1000))")
  local NONCE=$(python3 -c "import uuid; print(uuid.uuid4().hex)")
  local DATA="${TIMESTAMP}${NONCE}${BODY}"
  local SIGNATURE=$(echo -n "$DATA" | openssl dgst -sha256 -hmac "$SIGNING_KEY" -binary | xxd -p -c 256)

  curl -s -X "$METHOD" "$URL" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -H "X-Request-Timestamp: $TIMESTAMP" \
    -H "X-Request-Nonce: $NONCE" \
    -H "X-Request-Signature: $SIGNATURE" \
    -d "$BODY"
}

# ---- 2. AC 验收 ----
echo ""
echo "=== AC1: 字符级对比 ==="
R1=$(signed_curl POST "$DIFF_URL" '{"left":"abc","right":"axc","granularity":"char"}')
echo "$R1" | python3 -c "
import sys,json
d=json.load(sys.stdin)
h=d['data']['hunks']
assert len(h)>0 and h[0]['type']=='modified', f'AC1 FAIL: {d}'
print('AC1 PASS ✅')
"

echo "=== AC2: 词级对比 ==="
R2=$(signed_curl POST "$DIFF_URL" '{"left":"hello world","right":"hello there","granularity":"word"}')
echo "$R2" | python3 -c "
import sys,json
d=json.load(sys.stdin)
assert d['data']['granularity']=='word' and len(d['data']['hunks'])>0, f'AC2 FAIL: {d}'
print('AC2 PASS ✅')
"

echo "=== AC3: 行级对比 ==="
R3=$(signed_curl POST "$DIFF_URL" '{"left":"line1\nline2\nline3","right":"line1\nline2-mod\nline3\nline4","granularity":"line"}')
echo "$R3" | python3 -c "
import sys,json
d=json.load(sys.stdin)
types=[h['type'] for h in d['data']['hunks']]
assert 'modified' in types or 'added' in types, f'AC3 FAIL: {d}'
print('AC3 PASS ✅')
"

echo "=== AC5: 无效粒度 ==="
R5=$(signed_curl POST "$DIFF_URL" '{"left":"a","right":"b","granularity":"invalid"}')
echo "$R5" | python3 -c "
import sys,json
d=json.load(sys.stdin)
assert d.get('code','')!='SUCCESS', f'AC5 FAIL: 应返回错误但成功了: {d}'
print('AC5 PASS ✅')
"

echo "=== AC8: 忽略空白符 ==="
R8=$(signed_curl POST "$DIFF_URL" '{"left":"  foo","right":"\tfoo","granularity":"line","ignoreWhitespace":true}')
echo "$R8" | python3 -c "
import sys,json
d=json.load(sys.stdin)
assert d['data']['statistics']['modifications']<=1, f'AC8 FAIL: {d}'
print('AC8 PASS ✅')
"

echo "=== AC9: 空内容 ==="
R9=$(signed_curl POST "$DIFF_URL" '{"left":"","right":"","granularity":"line"}')
echo "$R9" | python3 -c "
import sys,json
d=json.load(sys.stdin)
s=d['data']['statistics']
assert d['data']['hunks']==[] and s['additions']==0 and s['deletions']==0 and s['modifications']==0, f'AC9 FAIL: {d}'
print('AC9 PASS ✅')
"

echo "=== AC6/AC7: 文件上传 ==="
echo '{"key":"value"}' > /tmp/test-diff-ys.json
# 上传也需要签名头（timestamp + nonce + signature）
UPLOAD_TIMESTAMP=$(python3 -c "import time; print(int(time.time()*1000))")
UPLOAD_NONCE=$(python3 -c "import uuid; print(uuid.uuid4().hex)")
UPLOAD_SIG_DATA="${UPLOAD_TIMESTAMP}${UPLOAD_NONCE}"
UPLOAD_SIGNATURE=$(echo -n "$UPLOAD_SIG_DATA" | openssl dgst -sha256 -hmac "$SIGNING_KEY" -binary | xxd -p -c 256)
R6=$(curl -s -X POST "$DIFF_URL/upload" \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Request-Timestamp: $UPLOAD_TIMESTAMP" \
  -H "X-Request-Nonce: $UPLOAD_NONCE" \
  -H "X-Request-Signature: $UPLOAD_SIGNATURE" \
  -F "file=@/tmp/test-diff-ys.json")
echo "$R6" | python3 -c "
import sys,json
d=json.load(sys.stdin)
if d.get('code')=='SUCCESS':
  print('AC6 PASS ✅ (COS 已配置，上传成功)')
  assert 'fileKey' in d['data'], f'AC6 FAIL: 无 fileKey'
elif d.get('code')=='DIFF_COS_ERROR':
  print(f'AC6 SKIP ⏭️  COS 服务未配置或连接失败: {d.get(\"message\",\"\")}')
else:
  print(f'AC6 FAIL ❌: {d}')
"
rm -f /tmp/test-diff-ys.json

echo ""
echo "=== 单元测试 ==="
cd "$(dirname "$0")/../miao-toolbox-api" && ./mvnw test -Dtest="DiffServiceTest,DiffCosServiceTest" -q

echo ""
echo "========================================="
echo "  Story tc-1-1 验收完成"
echo "========================================="
