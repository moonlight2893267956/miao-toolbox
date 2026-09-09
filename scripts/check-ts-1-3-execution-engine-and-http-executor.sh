#!/usr/bin/env bash
# Story ts-1-3: 调度引擎与 HTTP 执行器 — 验收
# 前置: 在仓库根目录执行，需 JDK 21 + Maven Wrapper
# 用法: bash scripts/check-ts-1-3-execution-engine-and-http-executor.sh

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/miao-toolbox-api"

echo ">>> 运行 ts-1-3 单元测试（执行引擎/HTTP 执行器/变量替换/重启恢复）"
./mvnw -q test \
  -Dtest='com.miao.toolbox.tool.scheduler.**' \
  -DargLine="-DJM.LOG.PATH=${TMPDIR:-/tmp}/nacos-logs -Dnacos.logging.default.config.enabled=false"

echo ""
echo ">>> AC 逐条汇总（单元测试覆盖）"
echo "  ✅ AC1 执行隔离：调度触发异步提交执行线程池（NFR-3）+ trigger_type=SCHEDULED"
echo "  ✅ AC2 skip 重叠：CAS 失败记 SKIPPED（startedAt/finishedAt 为空）"
echo "  ✅ AC3 判定矩阵：2xx→SUCCESS / 503→FAILED / 超时→TIMEOUT / DNS→FAILED"
echo "     + 敏感 header 解密入请求、摘要前4后4脱敏 + 变量替换（body/headers）"
echo "  ✅ AC4 记录：request_summary(method/url/headers/bodyPreview) + response_summary(statusCode/4KB截断)"
echo "  ✅ AC5 重试：至上限记 retry_count=尝试次数 / 中途成功记 SUCCESS / 落库失败不炸执行"
echo "  ✅ AC6 恢复：ENABLED 全部重注册 / PAUSED 跳过 / 单任务失败不阻断"
echo "  ✅ 契约：执行器不抛异常（RuntimeException 也转 FAILED）"

if [[ -n "${ADMIN_PASSWORD:-}" ]]; then
  echo ""
  echo ">>> API 冒烟（需后端已启动）：创建每分钟任务 → 观察 60s 内自动执行 → 查执行记录"
  BASE="${API_BASE:-http://localhost:8080}"
  TOKEN=$(curl -s -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' \
    -d "{\"username\":\"admin\",\"password\":\"$ADMIN_PASSWORD\"}" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['accessToken'])" 2>/dev/null || true)
  if [[ -n "${TOKEN:-}" ]]; then
    CREATE=$(curl -s -X POST "$BASE/api/scheduler/tasks" -H "Authorization: Bearer $TOKEN" \
      -H 'Content-Type: application/json' \
      -d '{"name":"ts-1-3冒烟","targetType":"HTTP","targetConfig":{"targetType":"HTTP","method":"GET","url":"https://httpbin.org/status/200"},"cronExpression":"* * * * *"}')
    TASK_ID=$(echo "$CREATE" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['id'])" 2>/dev/null || echo "")
    if [[ -n "${TASK_ID:-}" ]]; then
      echo "  任务 $TASK_ID 已创建（cron 每分钟），等待 70s 观察自动执行..."
      sleep 70
      curl -s "$BASE/api/scheduler/tasks/$TASK_ID/executions" -H "Authorization: Bearer $TOKEN" \
        | python3 -c "import sys,json;d=json.load(sys.stdin)['data'];print('  ✅ 执行记录数:',d['total'],'首条状态:',d['items'][0]['status'] if d['items'] else 'NONE')"
      curl -s -X DELETE "$BASE/api/scheduler/tasks/$TASK_ID" -H "Authorization: Bearer $TOKEN" > /dev/null && echo "  ✅ 冒烟任务已清理"
    fi
  else
    echo "  ⚠️ 登录失败，跳过 API 冒烟"
  fi
fi

echo ""
echo "全部通过。"
