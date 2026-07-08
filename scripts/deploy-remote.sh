#!/usr/bin/env bash
# ===================================================================
# 阿渺工具箱 — 远程纯部署脚本（由 CI 通过 SSH 调用）
# ===================================================================
# 在服务器上执行，只做：探活 miao-infra → 登录 GHCR → 拉镜像 → 重启 → 健康检查
#
# 前提：/opt/miao-toolbox 已完成首次 bootstrap（有 .env、宝塔 vhost）
#       首次 bootstrap 请在本地运行: ./scripts/deploy-to-yunmiao.sh
#
# 用法（由 CI deploy.yml 自动调用，无需手动执行）:
#   GHCR_TOKEN=xxx GHCR_OWNER=xxx /tmp/deploy-remote.sh
# ===================================================================

set -euo pipefail

# ===== 配置 =====
REMOTE_DIR="/opt/miao-toolbox"
COMPOSE_FILE="$REMOTE_DIR/docker-compose.prod.yml"
ENV_FILE="$REMOTE_DIR/.env"
COMPOSE_CMD="docker compose -f $COMPOSE_FILE --env-file $ENV_FILE"

# 从环境变量读取（由 CI 注入）
GHCR_TOKEN="${GHCR_TOKEN:?必须设置 GHCR_TOKEN}"
GHCR_OWNER="${GHCR_OWNER:?必须设置 GHCR_OWNER}"

# 部署的镜像标签：默认 latest；回滚时由 CI 传入旧 sha 标签
IMAGE_TAG="${IMAGE_TAG:-latest}"
export IMAGE_TAG

# ===== 工具函数 =====
red() { printf "\033[31m%s\033[0m\n" "$*"; }
grn() { printf "\033[32m%s\033[0m\n" "$*"; }
ylw() { printf "\033[33m%s\033[0m\n" "$*"; }
hdr() { printf "\n\033[1;36m=== %s ===\033[0m\n" "$*"; }

# ===== 步骤 =====

step_check_prereqs() {
  hdr "0. 检查前置条件"
  if [ ! -f "$ENV_FILE" ]; then
    red "  ✗ 未找到 $ENV_FILE"
    red "  请先在本地运行: ./scripts/deploy-to-yunmiao.sh"
    exit 1
  fi
  if [ ! -f "$COMPOSE_FILE" ]; then
    red "  ✗ 未找到 $COMPOSE_FILE"
    exit 1
  fi
  grn "  ✓ 前置条件满足"
}

# 端口连通性探测(主机侧,适用于远端 IP/域名)
_tcp_ok() {
  (exec 3<>/dev/tcp/"$1"/"$2") 2>/dev/null
}

# 本地容器健康检查(适用于同机 miao-infra 容器名)
_container_healthy() {
  local s
  s=$(docker inspect --format='{{.State.Health.Status}}' "$1" 2>/dev/null || echo "missing")
  [ "$s" = "healthy" ]
}

step_wait_infra() {
  hdr "1. 检查数据库/缓存连通性 (MySQL/Redis)"
  # 读取 .env 中真实主机(与 docker-compose.prod.yml 默认值保持一致)
  if [ -f "$ENV_FILE" ]; then
    set -a; . "$ENV_FILE"; set +a
  fi
  local mysql_host="${MYSQL_HOST:-miao-mysql}"
  local mysql_port="${MYSQL_PORT:-3306}"
  local redis_host="${REDIS_HOST:-miao-redis}"
  local redis_port="${REDIS_PORT:-6379}"

  local max_wait=120
  local elapsed=0
  while [ $elapsed -lt $max_wait ]; do
    local ok_mysql="no" ok_redis="no"
    if _container_healthy "$mysql_host" || _tcp_ok "$mysql_host" "$mysql_port"; then
      ok_mysql="yes"
    fi
    if _container_healthy "$redis_host" || _tcp_ok "$redis_host" "$redis_port"; then
      ok_redis="yes"
    fi
    if [ "$ok_mysql" = "yes" ] && [ "$ok_redis" = "yes" ]; then
      grn "  ✓ MySQL($mysql_host:$mysql_port) / Redis($redis_host:$redis_port) 连通(等待 ${elapsed}s)"
      return 0
    fi
    if [ $((elapsed % 10)) -eq 0 ] && [ $elapsed -gt 0 ]; then
      ylw "  等待中(${elapsed}s/${max_wait}s)  mysql=${ok_mysql}  redis=${ok_redis}"
    fi
    sleep 2
    elapsed=$((elapsed + 2))
  done
  red "  ✗ 等待 MySQL/Redis 连通超时(${max_wait}s)"
  red "  当前配置: mysql=${mysql_host}:${mysql_port}  redis=${redis_host}:${redis_port}"
  red "  - 若用本地 miao-infra: 先 cd /opt/miao-infra && docker compose up -d"
  red "  - 若用远端: 确认 .env 的 MYSQL_HOST/REDIS_HOST 正确且防火墙放行"
  exit 1
}

step_ensure_net() {
  hdr "1.5 确保 miao-infra-net 网络存在"
  if docker network inspect miao-infra-net >/dev/null 2>&1; then
    grn "  ✓ miao-infra-net 已存在(由 miao-infra 提供)"
  else
    ylw "  ⚠ miao-infra-net 不存在,创建空网络(远端 DB 场景,api 不依赖它)"
    docker network create miao-infra-net >/dev/null 2>&1 || true
    grn "  ✓ 已创建 miao-infra-net"
  fi
}

step_login_ghcr() {
  hdr "2. 登录 GHCR(拉取私有镜像)"
  echo "$GHCR_TOKEN" | docker login ghcr.io -u "$GHCR_OWNER" --password-stdin
  grn "  ✓ GHCR 登录成功(user=$GHCR_OWNER)"
}

step_pull_and_up() {
  hdr "3. 拉取镜像并重启服务"
  cd "$REMOTE_DIR"
  $COMPOSE_CMD pull
  $COMPOSE_CMD up -d --no-build
  grn "  ✓ 镜像已更新,服务已重启"
}

step_health_check() {
  hdr "4. 健康检查"

  # 获取容器 ID
  local api_cid web_cid
  api_cid=$($COMPOSE_CMD ps -q api 2>/dev/null || echo "")
  web_cid=$($COMPOSE_CMD ps -q web 2>/dev/null || echo "")

  if [ -z "$api_cid" ]; then
    red "  ✗ API 容器未启动"
    $COMPOSE_CMD logs --tail=30 api
    exit 1
  fi

  # 等待 API healthy（最多 180s，与 compose healthcheck start_period 对齐）
  local max_wait=180
  local elapsed=0
  while [ $elapsed -lt $max_wait ]; do
    local api_health
    api_health=$(docker inspect --format='{{.State.Health.Status}}' "$api_cid" 2>/dev/null || echo "unknown")
    if [ "$api_health" = "healthy" ]; then
      grn "  ✓ API 容器 healthy(等待 ${elapsed}s)"
      break
    fi
    if [ $((elapsed % 15)) -eq 0 ] && [ $elapsed -gt 0 ]; then
      ylw "  等待 API 就绪(${elapsed}s/${max_wait}s)  health=${api_health}"
    fi
    sleep 5
    elapsed=$((elapsed + 5))
    if [ $elapsed -ge $max_wait ]; then
      red "  ✗ API 健康检查超时(${max_wait}s)"
      red "  最近日志:"
      $COMPOSE_CMD logs --tail=30 api
      exit 1
    fi
  done

  # 检查 Web 容器状态
  if [ -n "$web_cid" ]; then
    local web_status
    web_status=$(docker inspect --format='{{.State.Status}}' "$web_cid" 2>/dev/null || echo "unknown")
    if [ "$web_status" = "running" ]; then
      grn "  ✓ Web 容器 running"
    else
      red "  ✗ Web 容器异常(status=${web_status})"
      $COMPOSE_CMD logs --tail=30 web
      exit 1
    fi
  fi

  # HTTP 探测
  if curl -sf http://127.0.0.1:8088/actuator/health > /dev/null 2>&1; then
    grn "  ✓ API HTTP 健康端点 200"
  else
    ylw "  ⚠ API HTTP 探测未通过(可能仍在启动)"
  fi
  if curl -sf -o /dev/null http://127.0.0.1:8089/ 2>&1; then
    grn "  ✓ Web HTTP 响应正常"
  else
    ylw "  ⚠ Web HTTP 探测未通过"
  fi
}

step_summary() {
  hdr "5. 部署摘要"
  echo "  本次部署镜像标签: IMAGE_TAG=${IMAGE_TAG}"
  $COMPOSE_CMD ps
  echo ""
  echo "  当前镜像:"
  $COMPOSE_CMD images 2>/dev/null || true
  echo ""
  if [ "$IMAGE_TAG" != "latest" ]; then
    ylw "  ⚠ 当前为回滚/指定版本($IMAGE_TAG),下次推 main 会自动拉回 latest"
  fi
  grn "🎉 部署完成!"
}

# ===== 主流程 =====
step_check_prereqs
step_wait_infra
step_ensure_net
step_login_ghcr
step_pull_and_up
step_health_check
step_summary
