#!/usr/bin/env bash
# ===================================================================
# 阿渺工具箱 — 部署验收脚本
# ===================================================================
# 前置:
#   - 本机 /etc/hosts 已加: 81.70.216.46 tools.yunmiao.site
#     (或域名已注册并解析到服务器 IP)
#   - 服务已通过 deploy-to-yunmiao.sh 启动
#   - 端口 80/8088/8089 在服务器端可访问
#
# 用法:
#   ./scripts/check-deploy.sh                # 全套 10 条 AC
#   ./scripts/check-deploy.sh ac1 ac3 ac7    # 指定 AC
#   ./scripts/check-deploy.sh --url URL      # 自定义入口 URL
# ===================================================================

set -uo pipefail

# ===== 可配置 =====
DOMAIN="${DOMAIN:-tools.yunmiao.site}"
PROTO="${PROTO:-http}"
API_HEALTH="${PROTO}://${DOMAIN}/api/actuator/health"
API_LOGIN="${PROTO}://${DOMAIN}/api/auth/login"
FRONTEND_HOME="${PROTO}://${DOMAIN}/"
SERVER_HOST="yunmiao@yunmiao.site"
SERVER_DEPLOY_DIR="/opt/miao-toolbox"

# ===== 状态 =====
PASS=0
FAIL=0
FAIL_AC=""

# ===== 工具函数 =====
red() { printf "\033[31m%s\033[0m\n" "$*"; }
grn() { printf "\033[32m%s\033[0m\n" "$*"; }
ylw() { printf "\033[33m%s\033[0m\n" "$*"; }
hdr() { printf "\n\033[1;36m%s\033[0m\n" "$*"; }

record_pass() { PASS=$((PASS+1)); grn "  ✓ PASS: $1"; }
record_fail() { FAIL=$((FAIL+1)); FAIL_AC="$FAIL_AC $1"; red "  ✗ FAIL: $1"; }

# 解析自定义 --url
for arg in "$@"; do
  case "$arg" in
    --url) shift; FRONTEND_HOME="$1"; API_HEALTH="${1}api/actuator/health"; API_LOGIN="${1}api/auth/login";;
  esac
done

# 过滤:只跑用户指定的 AC
ONLY_AC="all"
for arg in "$@"; do
  case "$arg" in
    ac[0-9]) ONLY_AC="custom"; WANTED_AC="$WANTED_AC $arg";;
  esac
done

should_run() {
  if [ "$ONLY_AC" = "all" ]; then return 0; fi
  for w in $WANTED_AC; do [ "$w" = "$1" ] && return 0; done
  return 1
}

# ===== AC 实现 =====

ac1_frontend_200() {
  hdr "AC1: 前端首页 200"
  if curl -sf -m 10 "$FRONTEND_HOME" -o /dev/null -w '%{http_code}\n' | grep -q '^200$'; then
    record_pass "AC1 前端首页返回 200"
  else
    record_fail "AC1 前端首页未返回 200 (URL=$FRONTEND_HOME)"
  fi
}

ac2_backend_health() {
  hdr "AC2: 后端健康检查"
  # 走宝塔 vhost + /api/ 路径会被 AntiReplayFilter 拦截(actuator 不需要 nonce)
  # 直接 SSH 到服务器测后端容器,验证后端真实健康
  local body
  body=$(ssh -o ConnectTimeout=10 -o BatchMode=yes "$SERVER_HOST" \
    "curl -sf -m 10 http://127.0.0.1:8088/actuator/health 2>/dev/null" 2>/dev/null)
  if echo "$body" | grep -q '"status":"UP"'; then
    record_pass "AC2 后端健康: $body"
  else
    record_fail "AC2 后端未 UP (body=$body)"
  fi
}

ac3_frontend_indexhtml() {
  hdr "AC3: 前端返回 index.html(非 502/503)"
  local head
  head=$(curl -sI -m 10 "$FRONTEND_HOME" 2>&1 | head -1)
  if echo "$head" | grep -qi '200'; then
    record_pass "AC3 响应头: $head"
  else
    record_fail "AC3 异常响应头: $head"
  fi
}

ac4_login_admin() {
  hdr "AC4: admin/Admin123 登录"
  local resp
  resp=$(curl -s -m 10 -X POST "$API_LOGIN" \
    -H 'Content-Type: application/json' \
    -d '{"username":"admin","password":"Admin123"}' || echo "")
  if echo "$resp" | grep -q '"accessToken"'; then
    record_pass "AC4 登录成功,获取到 accessToken"
  elif echo "$resp" | grep -qi 'mustChangePassword'; then
    record_pass "AC4 登录成功(强制改密状态)"
  elif echo "$resp" | grep -qi 'invalid\|unauthorized\|密码错误\|用户不存在'; then
    record_fail "AC4 凭据错误: $resp"
  else
    record_fail "AC4 登录接口异常: $resp"
  fi
}

ac5_frontend_assets() {
  hdr "AC5: 前端资源(JS/CSS)能加载"
  local js
  js=$(curl -sf -m 10 "$FRONTEND_HOME" 2>/dev/null | grep -oE 'src="[^"]+\.js"' | head -1 | sed 's/src="//;s/"//')
  if [ -z "$js" ]; then
    record_fail "AC5 未在首页找到 JS 资源"
    return
  fi
  # 处理相对路径
  [[ "$js" != http* ]] && js="${FRONTEND_HOME}${js}"
  if curl -sf -m 10 -o /dev/null "$js"; then
    record_pass "AC5 资源可访问: $js"
  else
    record_fail "AC5 资源无法访问: $js"
  fi
}

ac6_containers_up() {
  hdr "AC6: 4 个 Docker 容器全 Up"
  # docker compose ps --services 在 ssh 嵌套里输出不稳定,改用 docker ps 直接读
  local running
  running=$(ssh -o ConnectTimeout=10 -o BatchMode=yes "$SERVER_HOST" \
    "docker ps --format '{{.Names}}'" 2>/dev/null | grep -E "^miao-toolbox-(api|web|mysql|redis)-1$" | sort)
  if [ -z "$running" ]; then
    record_fail "AC6 未检测到任何 miao-toolbox 容器(SSH 失败?)"
    return
  fi
  local expected="miao-toolbox-api-1 miao-toolbox-web-1 miao-toolbox-mysql-1 miao-toolbox-redis-1"
  local miss=""
  for s in $expected; do
    echo "$running" | grep -qx "$s" || miss="$miss $s"
  done
  if [ -z "$miss" ]; then
    record_pass "AC6 4 个容器都在运行"
  else
    record_fail "AC6 缺失:$miss(实际:$running)"
  fi
}

ac7_api_logs_no_error() {
  hdr "AC7: 后端无 ERROR 级别日志"
  # 通过 docker logs 直接读(避免 compose logs 嵌套的转义问题)
  local errs
  errs=$(ssh -o ConnectTimeout=10 -o BatchMode=yes "$SERVER_HOST" \
    "docker logs --tail 500 miao-toolbox-api-1 2>&1 | grep -c ' ERROR '" 2>/dev/null | tr -d '[:space:]')
  # 若 docker logs 没结果,fallback 到 docker compose logs
  if [ -z "$errs" ]; then
    errs=$(ssh -o ConnectTimeout=10 -o BatchMode=yes "$SERVER_HOST" \
      "cd '$SERVER_DEPLOY_DIR' && docker compose -f docker-compose.prod.yml logs --tail 500 api 2>/dev/null | grep -cE '^[a-z0-9-]+-1  \\| .* ERROR '" 2>/dev/null | tr -d '[:space:]')
  fi
  errs=${errs:-0}
  if [ "$errs" = "0" ]; then
    record_pass "AC7 后端最近 500 行无 ERROR"
  else
    record_fail "AC7 后端日志有 $errs 条 ERROR"
  fi
}

ac8_login_after_change_password() {
  hdr "AC8: 改密后可登录(交互式,默认跳过)"
  ylw "  此项需要交互式浏览器操作,默认跳过"
  ylw "  手动验证:登录后立即跳到改密页 → 输入新密码(>=8 位) → 登录成功"
}

ac9_text_compare_tool() {
  hdr "AC9: 文本对比工具可访问"
  # 前端 SPA,/tools/text-compare 路由应返回 index.html
  local url="${FRONTEND_HOME}tools/text-compare"
  if curl -sf -m 10 "$url" | grep -qi 'index.html\|<div id="root"'; then
    record_pass "AC9 文本对比路由可达"
  else
    record_fail "AC9 文本对比路由异常: $url"
  fi
}

ac10_db_tables() {
  hdr "AC10: 数据库表存在(Flyway 已迁移)"
  # 用 --raw-output 避免被 ssh 多层 shell 解释;按行 read 判断
  local tables
  tables=$(ssh -o ConnectTimeout=10 -o BatchMode=yes "$SERVER_HOST" \
    "cd '$SERVER_DEPLOY_DIR' && \
     ROOT=\$(grep '^MYSQL_ROOT_PASSWORD=' .env | cut -d= -f2-) && \
     docker exec miao-toolbox-mysql-1 mysql -uroot -p\"\$ROOT\" -N -B -e 'SHOW TABLES' miao_toolbox 2>/dev/null" 2>/dev/null)
  local expected="users refresh_tokens audit_logs"
  local miss=""
  for t in $expected; do
    echo "$tables" | grep -qx "$t" || miss="$miss $t"
  done
  if [ -z "$miss" ]; then
    record_pass "AC10 数据库表齐全(共 $(echo "$tables" | wc -l | tr -d ' ') 张表)"
  else
    record_fail "AC10 缺失表:$miss(实际表:$tables)"
  fi
}

# ===== 调度 =====
if [ "$ONLY_AC" = "all" ]; then
  WANTED_AC="ac1 ac2 ac3 ac4 ac5 ac6 ac7 ac8 ac9 ac10"
fi

for ac in $WANTED_AC; do
  case "$ac" in
    ac1) should_run ac1 && ac1_frontend_200;;
    ac2) should_run ac2 && ac2_backend_health;;
    ac3) should_run ac3 && ac3_frontend_indexhtml;;
    ac4) should_run ac4 && ac4_login_admin;;
    ac5) should_run ac5 && ac5_frontend_assets;;
    ac6) should_run ac6 && ac6_containers_up;;
    ac7) should_run ac7 && ac7_api_logs_no_error;;
    ac8) should_run ac8 && ac8_login_after_change_password;;
    ac9) should_run ac9 && ac9_text_compare_tool;;
    ac10) should_run ac10 && ac10_db_tables;;
  esac
done

# ===== 汇总 =====
TOTAL=$((PASS+FAIL))
hdr "验收汇总"
printf "  通过: \033[32m%d\033[0m / %d\n" "$PASS" "$TOTAL"
if [ "$FAIL" -gt 0 ]; then
  printf "  失败: \033[31m%d\033[0m (AC:%s)\n" "$FAIL" "$FAIL_AC"
  exit 1
fi
grn "🎉 全部通过"
exit 0
