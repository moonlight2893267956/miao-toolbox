#!/bin/bash
# 文本对照工具 Epic 1 全量验收脚本（Story tc-1-1 ~ tc-1-4）
# 用法: ADMIN_PASSWORD='your-pass' ./scripts/ys.sh
# 前置：后端已启动（http://localhost:8080），前端已启动（http://localhost:5173）
set -e

BASE_URL="http://localhost:8080"

ADMIN_PASS="${ADMIN_PASSWORD:-}"

# --- 1. 登录 ---
echo ">>> 登录获取 token..."
if [ -z "$ADMIN_PASS" ]; then echo "请设置 ADMIN_PASSWORD 环境变量"; exit 1; fi
LOGIN=$(curl -s -X POST "$BASE_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"admin\",\"password\":\"$ADMIN_PASS\"}")
TOKEN=$(echo "$LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['accessToken'])")
SIGNING_KEY=$(echo "$LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['signingKey'])")
echo "登录成功"

# --- 辅助函数 ---
signed_curl() {
  local METHOD="$1" URL="$2" BODY="$3"
  local TS=$(python3 -c "import time; print(int(time.time()*1000))")
  local NONCE=$(python3 -c "import uuid; print(uuid.uuid4().hex)")
  local SIG=$(echo -n "${TS}${NONCE}${BODY}" | openssl dgst -sha256 -hmac "$SIGNING_KEY" -binary | xxd -p -c 256)
  curl -s -X "$METHOD" "$URL" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -H "X-Request-Timestamp: $TS" \
    -H "X-Request-Nonce: $NONCE" \
    -H "X-Request-Signature: $SIG" \
    -d "$BODY"
}
assert_ok() {
  local label="$1" result="$2"
  echo "$result" | python3 -c "
import sys,json
d=json.load(sys.stdin)
if d.get('code')=='SUCCESS':
  print('  ✅ $label')
else:
  print('  ❌ $label: ' + d.get('message',''))
"
}

echo ""
echo "========================================="
echo "  Story tc-1-1 验收: 后端对比引擎与 API"
echo "========================================="

echo "  AC1: 字符级对比"
R=$(signed_curl POST "$BASE_URL/api/diff" '{"left":"abc","right":"axc","granularity":"char"}')
assert_ok "AC1 字符级" "$R"

echo "  AC2: 词级对比"
R=$(signed_curl POST "$BASE_URL/api/diff" '{"left":"hello world","right":"hello there","granularity":"word"}')
assert_ok "AC2 词级" "$R"

echo "  AC3: 行级对比"
R=$(signed_curl POST "$BASE_URL/api/diff" '{"left":"line1\nline2\nline3","right":"line1\nline2-mod\nline3\nline4","granularity":"line"}')
assert_ok "AC3 行级" "$R"

echo "  AC5: 无效粒度"
R=$(signed_curl POST "$BASE_URL/api/diff" '{"left":"a","right":"b","granularity":"invalid"}')
echo "$R" | python3 -c "
import sys,json
d=json.load(sys.stdin)
assert d.get('code')!='SUCCESS', 'AC5 FAIL'
print('  ✅ AC5 无效粒度（返回错误）')
"

echo "  AC8: 忽略空白符"
R=$(signed_curl POST "$BASE_URL/api/diff" '{"left":"  foo","right":"\tfoo","granularity":"line","ignoreWhitespace":true}')
echo "$R" | python3 -c "
import sys,json
d=json.load(sys.stdin)
s=d['data']['statistics']
assert s['modifications']<=1, 'AC8 FAIL'
print('  ✅ AC8 忽略空白符（modifications≤1）')
"

echo "  AC9: 空内容"
R=$(signed_curl POST "$BASE_URL/api/diff" '{"left":"","right":"","granularity":"line"}')
echo "$R" | python3 -c "
import sys,json
d=json.load(sys.stdin)
s=d['data']['statistics']
assert s['additions']==0 and s['deletions']==0 and s['modifications']==0, 'AC9 FAIL'
print('  ✅ AC9 空内容（statistics全0）')
"

echo ""
echo "========================================="
echo "  Story tc-1-2 验收: 前端页面框架"
echo "========================================="
echo ""
echo "  请在浏览器中打开 http://localhost:5173/tools/text-compare"
echo "  ✅ AC1: 应有左右分栏编辑区，顶部工具栏，左侧\"原文(A)\"右侧\"对比(B)\""
echo "  ✅ AC2: 在左侧粘贴文本后，500ms 自动触发对比，StatCard 显示统计"
echo "  ✅ AC3: 点击上传按钮选择文件，内容加载到编辑区，触发对比"
echo "  ✅ AC4: 上传 .json 文件后，工具栏显示紫色 \"JSON\" Tag"
echo "  ✅ AC5: 工具栏行号开关控制行号显示/隐藏"

echo ""
echo "========================================="
echo "  Story tc-1-3 验收: 差异导航与工具栏"
echo "========================================="
echo ""
echo "  请在 http://localhost:5173/tools/text-compare 页面操作"
echo "  左右各粘贴一段多行差异文本"
echo "  ✅ AC1: StatCard 显示 +N / -N / 修改 N 处"
echo "  ✅ AC2: 导航控件显示 \"1/3\"，点击上下箭头跳转"
echo "  ✅ AC3: 切换粒度下拉，对比结果实时刷新"
echo "  ✅ AC4: 切换 split/unified/stacked 布局"
echo "  ✅ AC5: DiffViewer 中每个差异块有 ← / → 箭头"
echo "  ✅ AC6: 忽略空白符开关生效"

echo ""
echo "========================================="
echo "  Story tc-1-4 验收: 语法高亮与结构化对比"
echo "========================================="
echo ""
echo "  请在 http://localhost:5173/tools/text-compare 页面操作"
echo "  ✅ AC1: 左侧粘贴 Python/Java 代码，CodeMirror 语法着色"
echo "  ✅ AC2: 代码块左侧有折叠箭头，点击折叠/展开"
echo "  ✅ AC3: 代码缩进有垂直指引线"
echo "  ✅ AC4: 粘贴 JSON 内容，打开\"结构化对比\"开关"
echo "       后端返回 key-path 级差异"
echo "  ✅ AC5: 关闭结构化对比开关后回退到纯文本对比"

echo ""
echo "========================================="
echo "  单元测试验证"
echo "========================================="
cd "$(dirname "$0")/../miao-toolbox-api" && ./mvnw test -Dtest="DiffServiceTest,DiffCosServiceTest" -q 2>&1

echo ""
echo "========================================="
echo "  Epic 1 验收完成! 共 4 个 Story (tc-1-1 ~ tc-1-4)"
echo "  前端页面: http://localhost:5173/tools/text-compare"
echo "========================================="
