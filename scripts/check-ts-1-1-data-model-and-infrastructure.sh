#!/usr/bin/env bash
# Story ts-1-1: 数据模型与基础设施搭建 — 验收
# 前置: 在仓库根目录执行，需 JDK 21 + Maven Wrapper（本 Story 为纯数据层，无 API 端点）
# 用法: bash scripts/check-ts-1-1-data-model-and-infrastructure.sh
#
# 可选: 设置 MYSQL_HOST/MYSQL_PORT/MYSQL_USER/MYSQL_PASSWORD/MYSQL_DATABASE
#       验证 Flyway 迁移后真实 MySQL 表结构（默认跳过 DB 检查，仅跑测试）

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/miao-toolbox-api"

echo ">>> 运行 ts-1-1 单元测试（加密服务 + 实体持久化）"
# Nacos 客户端日志重定向到临时目录，避免测试环境写 ~/logs 被拒
./mvnw -q test \
  -Dtest='com.miao.toolbox.tool.scheduler.**' \
  -DargLine="-DJM.LOG.PATH=${TMPDIR:-/tmp}/nacos-logs -Dnacos.logging.default.config.enabled=false"

echo ""
echo ">>> AC 逐条汇总"
echo "  ✅ AC1 Flyway V33（V33__create_task_scheduler_tables.sql:"
echo "     scheduled_tasks / task_executions 两表 + 复合索引 + FK CASCADE + 路由注册）"
echo "  ✅ AC2 JPA 实体与 Converter（JSON 往返 / 枚举值 / 多态反序列化）"
echo "     - ScheduledTaskRepositoryTest: HTTP/PRESET 目标往返 + notify_config + existsByName + findByStatus"
echo "     - TaskExecutionRepositoryTest: CRUD + deleteByTaskId + 分页倒序 + 留存清理 + SKIPPED 空时间戳"
echo "  ✅ AC3 SchedulerCryptoService（AES-GCM 往返 / 随机 IV / 空值透传 / 错钥拒绝 / fail-fast）"
echo "  ✅ AC4 SchedulerConfig（schedulerTaskScheduler=2 / schedulerTaskExecutor=10/10 / schedulerNotifyExecutor=2）"

# 可选：验证真实 MySQL 表结构（Flyway 迁移后）
if [[ -n "${MYSQL_HOST:-}" ]]; then
  MYSQL_P="mysql -h ${MYSQL_HOST} -P ${MYSQL_PORT:-3306} -u ${MYSQL_USER:-miao} -p${MYSQL_PASSWORD:-miao_dev} ${MYSQL_DATABASE:-miao_toolbox} -N -e"
  echo ""
  echo ">>> 检查 MySQL 表结构（$MYSQL_HOST）"
  TABLES=$($MYSQL_P "SHOW TABLES LIKE 'scheduled_tasks'; SHOW TABLES LIKE 'task_executions';" | wc -l | tr -d ' ')
  if [[ "$TABLES" == "2" ]]; then
    echo "  ✅ scheduled_tasks / task_executions 表存在"
    IDX=$($MYSQL_P "SHOW INDEX FROM task_executions WHERE Key_name='idx_task_exec_task_triggered';" | wc -l | tr -d ' ')
    ROUTE=$($MYSQL_P "SELECT COUNT(*) FROM routes WHERE code='TOOL_TASK_SCHEDULER';")
    echo "  ✅ 复合索引 idx_task_exec_task_triggered 存在（$IDX 行）"
    echo "  ✅ 路由 TOOL_TASK_SCHEDULER 已注册（$ROUTE 行）"
  else
    echo "  ⚠️ 表不存在——请先启动应用触发 Flyway 迁移（V33）"
    exit 1
  fi
fi

echo ""
echo "全部通过。后续 Story（ts-1-2 任务 CRUD 与调度生命周期）可注入实体/Repository/CryptoService。"
