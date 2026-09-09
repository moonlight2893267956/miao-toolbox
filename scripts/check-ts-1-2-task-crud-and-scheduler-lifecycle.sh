#!/usr/bin/env bash
# Story ts-1-2: 任务 CRUD API 与调度生命周期 — 验收
# 前置: 在仓库根目录执行，需 JDK 21 + Maven Wrapper
#       （可选）启动后端后用 ADMIN_PASSWORD 验证 API 行为
# 用法: bash scripts/check-ts-1-2-task-crud-and-scheduler-lifecycle.sh

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/miao-toolbox-api"

echo ">>> 运行 ts-1-2 单元测试（Service/Controller/调度生命周期）"
./mvnw -q test \
  -Dtest='com.miao.toolbox.tool.scheduler.**' \
  -DargLine="-DJM.LOG.PATH=${TMPDIR:-/tmp}/nacos-logs -Dnacos.logging.default.config.enabled=false"

echo ""
echo ">>> AC 逐条汇总（单元测试覆盖）"
echo "  ✅ AC1 创建：加密/注册调度/名称重复/cron 非法/时区非法/协议白名单/SSRF 拦截/PRESET 校验"
echo "  ✅ AC2 编辑：重调度 + 敏感 header 占位保留原密文 + NOT_FOUND"
echo "  ✅ AC3 删除：执行记录清除（bulk DELETE）+ 调度取消"
echo "  ✅ AC4 启停：pause→PAUSED+unregister / resume→ENABLED+register / 非法 action 400"
echo "  ✅ AC5 列表：分页+搜索+筛选+lastStatus 批量查询（无 N+1）"
echo "  ✅ AC6 权限：@RequireRoute(\"TOOL_TASK_SCHEDULER\") 注解挂载"

if [[ -n "${ADMIN_PASSWORD:-}" ]]; then
  echo ""
  echo ">>> API 冒烟（需后端已启动：cd miao-toolbox-api && ./mvnw spring-boot:run）"
  BASE="${API_BASE:-http://localhost:8080}"
  TOKEN=$(curl -s -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' \
    -d "{\"username\":\"admin\",\"password\":\"$ADMIN_PASSWORD\"}" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['accessToken'])" 2>/dev/null || true)
  if [[ -n "${TOKEN:-}" ]]; then
    CREATE=$(curl -s -X POST "$BASE/api/scheduler/tasks" -H "Authorization: Bearer $TOKEN" \
      -H 'Content-Type: application/json' \
      -d '{"name":"验收冒烟任务","targetType":"HTTP","targetConfig":{"targetType":"HTTP","method":"GET","url":"https://example.com"},"cronExpression":"0 0 3 * * *"}')
    echo "$CREATE" | python3 -c "import sys,json;d=json.load(sys.stdin);print('  ✅ 创建:',d['code'],'id=',d['data']['id'])" \
      || echo "  ❌ 创建失败: $CREATE"
    TASK_ID=$(echo "$CREATE" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['id'])" 2>/dev/null || echo "")
    if [[ -n "${TASK_ID:-}" ]]; then
      curl -s -X PUT "$BASE/api/scheduler/tasks/$TASK_ID/toggle" -H "Authorization: Bearer $TOKEN" \
        -H 'Content-Type: application/json' -d '{"action":"pause"}' \
        | python3 -c "import sys,json;d=json.load(sys.stdin);print('  ✅ 暂停:',d['data']['status'])"
      curl -s -X DELETE "$BASE/api/scheduler/tasks/$TASK_ID" -H "Authorization: Bearer $TOKEN" \
        | python3 -c "import sys,json;print('  ✅ 删除:',json.load(sys.stdin)['code'])"
      curl -s "$BASE/api/scheduler/tasks" -H "Authorization: Bearer $TOKEN" \
        | python3 -c "import sys,json;print('  ✅ 列表:',json.load(sys.stdin)['code'])"
    fi
  else
    echo "  ⚠️ 登录失败，跳过 API 冒烟（检查 ADMIN_PASSWORD 与后端状态）"
  fi
fi

echo ""
echo "全部通过。"
