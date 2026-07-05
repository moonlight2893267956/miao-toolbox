#!/usr/bin/env bash
# ===================================================================
# 阿渺工具箱 — 部署到 yunmiao.site
# ===================================================================
# 在本机执行,把仓库拉/推到服务器 /opt/miao-toolbox,启动服务
#
# 前置:
#   - 本机已配置 SSH 密钥登录 yunmiao@yunmiao.site (无密码登录)
#   - 服务器已装 Docker 29+ 和 Docker Compose v2+
#   - 仓库已经推到 origin/main
#
# 用法:
#   ./scripts/deploy-to-yunmiao.sh              # 完整流程(首次部署)
#   ./scripts/deploy-to-yunmiao.sh --skip-env   # 跳过 .env 生成(保留已有密钥,日常更新用)
#   ./scripts/deploy-to-yunmiao.sh update       # 仅更新代码并重启
#   ./scripts/deploy-to-yunmiao.sh env          # 仅重新生成 .env
#   ./scripts/deploy-to-yunmiao.sh status       # 查看服务状态
#   ./scripts/deploy-to-yunmiao.sh logs         # 查看日志
# ===================================================================

set -euo pipefail

# ===== 可配置 =====
REMOTE_HOST="yunmiao@yunmiao.site"
REMOTE_DIR="/opt/miao-toolbox"
GIT_REMOTE="origin"
GIT_BRANCH="main"
SSH_OPTS="-o ConnectTimeout=10 -o BatchMode=yes -o StrictHostKeyChecking=accept-new"

# 宝塔 vhost 路径
BT_VHOST="/www/server/panel/vhost/nginx/tools.yunmiao.site.conf"

# 临时模式:域名未注册时把 cookie-secure 改 false(后续 SSL 配好后改回)
TEMP_INSECURE_COOKIE="${TEMP_INSECURE_COOKIE:-1}"

# ===== 参数解析 =====
SKIP_ENV=0
for arg in "$@"; do
  case "$arg" in
    --skip-env) SKIP_ENV=1 ;;
  esac
done

# 过滤掉 --skip-env,保留第一个非 flag 参数作为命令名
cmd="${1:-all}"
for arg in "$@"; do
  case "$arg" in
    --skip-env) ;;
    *) cmd="$arg"; break ;;
  esac
done

# ===== 工具函数 =====
red() { printf "\033[31m%s\033[0m\n" "$*"; }
grn() { printf "\033[32m%s\033[0m\n" "$*"; }
ylw() { printf "\033[33m%s\033[0m\n" "$*"; }
hdr() { printf "\n\033[1;36m=== %s ===\033[0m\n" "$*"; }
ssh_run() { ssh $SSH_OPTS "$REMOTE_HOST" "$@"; }
scp_to() { scp $SSH_OPTS -r "$1" "$REMOTE_HOST:$2"; }

# ===== 工具函数 =====

sync_infra_secrets_to_env() {
  local env_file="$1"
  local miao_infra_env="/opt/miao-infra/.env"

  if ! ssh_run "test -f $miao_infra_env" 2>/dev/null; then
    ylw "  ⚠️ 未找到 $miao_infra_env，MYSQL_PASSWORD / REDIS_PASSWORD 需手动设置"
    return 0
  fi

  # 用 ssh 在服务器上读取 miao-infra .env 的密码行
  ssh_run "grep -E '^(MYSQL_PASSWORD|MYSQL_USER|REDIS_PASSWORD)=' $miao_infra_env" > /tmp/.infra-secrets.tmp 2>/dev/null

  if [ ! -s /tmp/.infra-secrets.tmp ]; then
    rm -f /tmp/.infra-secrets.tmp
    ylw "  ⚠️ miao-infra .env 中未找到密码信息"
    return 0
  fi

  python3 -c "
import pathlib
with open('/tmp/.infra-secrets.tmp') as f:
    infra = {}
    for line in f:
        line = line.strip()
        if '=' in line:
            k, v = line.split('=', 1)
            infra[k] = v

env = pathlib.Path('${env_file}')
text = env.read_text()
lines = text.splitlines()
result = []
for line in lines:
    if '=' in line:
        k = line.split('=', 1)[0]
        if k in infra:
            result.append(f'{k}={infra.pop(k)}')
            continue
    result.append(line)
for k, v in infra.items():
    result.append(f'{k}={v}')
env.write_text('\n'.join(result) + '\n')
" 2>/dev/null

  rm -f /tmp/.infra-secrets.tmp
  grn "  ✓ 已从 miao-infra 同步 MYSQL_USER / MYSQL_PASSWORD / REDIS_PASSWORD"
}

# ===== 步骤函数 =====
step_ensure_remote_dir() {
  hdr "1. 准备服务器目录"
  ssh_run "sudo mkdir -p '$REMOTE_DIR' && sudo chown \$(whoami):\$(id -gn) '$REMOTE_DIR'"
  grn "  ✓ $REMOTE_HOST:$REMOTE_DIR 已就绪"
}

step_pull_code() {
  hdr "2. 本机打包代码 + SCP 传输(避免服务器 git clone 兼容问题)"
  local tar_file
  tar_file="/tmp/miao-toolbox-$(date +%s).tar.gz"
  local repo_root
  repo_root=$(git rev-parse --show-toplevel 2>/dev/null || pwd)

  tar -C "$repo_root" \
    --exclude='.git' --exclude='node_modules' --exclude='target' --exclude='dist' \
    --exclude='.env' --exclude='.env.*' --exclude='.agents' --exclude='.atomcode' \
    --exclude='.claude' --exclude='.qoder' --exclude='.omo' --exclude='.opencode' \
    --exclude='.playwright-mcp' --exclude='AGENTS.md' --exclude='CLAUDE.md' \
    --exclude='scripts/ys.sh' --exclude='scripts/final_qa.py' --exclude='scripts/headless_check.py' \
    --exclude='screenshots' --exclude='*.log' --exclude='logs' \
    -czf "$tar_file" .

  scp $SSH_OPTS "$tar_file" "$REMOTE_HOST:/tmp/$(basename $tar_file)"
  ssh_run "cd '$REMOTE_DIR' && \
    tar xzf /tmp/$(basename $tar_file) --strip-components=0 && \
    rm -f /tmp/$(basename $tar_file) && \
    echo '代码已解压:' && ls -la | head -15"
  rm -f "$tar_file"
  grn "  ✓ 代码已传输到 $REMOTE_DIR"
}

step_gen_env() {
  hdr "3. 生成 .env(JWT 密钥本机生成,DB/Redis 密码从 miao-infra 自动同步)"
  local env_file
  env_file="/tmp/miao-toolbox-$(date +%s).env"
  cp .env.example "$env_file"
  chmod 600 "$env_file"

  # 本机用 Python 生成安全随机 JWT 密钥
  python3 - "$env_file" <<'PY'
import secrets, sys, pathlib
path = pathlib.Path(sys.argv[1])
text = path.read_text()

def rand_secret(n=64):
    return secrets.token_urlsafe(n)

replacements = {
    'JWT_SECRET=': f'JWT_SECRET={rand_secret(64)}',
    'JWT_REFRESH_SECRET=': f'JWT_REFRESH_SECRET={rand_secret(64)}',
    'CORS_ALLOWED_ORIGINS=': 'CORS_ALLOWED_ORIGINS=https://tools.yunmiao.site,http://81.70.216.46:8089',
}

for key, val in replacements.items():
    needle = None
    for line in text.splitlines():
        if line.startswith(key):
            needle = line
            break
    if needle:
        text = text.replace(needle, val, 1)

path.write_text(text)
print(f"✓ JWT 密钥已生成")
PY

  # 从服务器 miao-infra .env 同步 DB/Redis 密码(首次部署前需确保 miao-infra 已启动)
  sync_infra_secrets_to_env "$env_file"

  scp $SSH_OPTS "$env_file" "$REMOTE_HOST:/opt/miao-toolbox/.env"
  rm -f "$env_file"
  grn "  ✓ .env 已上传到 $REMOTE_DIR/.env"
}

step_wait_infra() {
  hdr "3.5 等待 miao-infra 就绪(miao-mysql + miao-redis)"
  local max_wait=120
  local elapsed=0
  while [ $elapsed -lt $max_wait ]; do
    local mysql_status redis_status
    mysql_status=$(ssh_run "docker inspect --format='{{.State.Health.Status}}' miao-mysql 2>/dev/null" || echo "missing")
    redis_status=$(ssh_run "docker inspect --format='{{.State.Health.Status}}' miao-redis 2>/dev/null" || echo "missing")
    if [ "$mysql_status" = "healthy" ] && [ "$redis_status" = "healthy" ]; then
      grn "  ✓ miao-mysql / miao-redis 均 healthy(等待 ${elapsed}s)"
      return 0
    fi
    if [ $((elapsed % 10)) -eq 0 ] && [ $elapsed -gt 0 ]; then
      ylw "  等待中(${elapsed}s/${max_wait}s)  mysql=${mysql_status}  redis=${redis_status}"
    fi
    sleep 2
    elapsed=$((elapsed + 2))
  done
  red "  ✗ 等待 miao-infra 超时(${max_wait}s)"
  red "  请先在服务器上: cd /opt/miao-infra && docker compose up -d"
  exit 1
}

step_temp_insecure_cookie() {
  if [ "$TEMP_INSECURE_COOKIE" = "1" ]; then
    hdr "4. 临时关闭 cookie-secure(待 SSL 配好后改回)"
    ssh_run "cd '$REMOTE_DIR' && \
      if grep -q 'cookie-secure: true' miao-toolbox-api/src/main/resources/application-prod.yml; then \
        sed -i 's/cookie-secure: true/cookie-secure: false/' miao-toolbox-api/src/main/resources/application-prod.yml && \
        echo '  ✓ cookie-secure: false(临时,SSL 后改回 true)'; \
      else \
        echo '  ✓ 已经是 false 或不存在,跳过'; \
      fi"
  else
    ylw "  跳过(cookie-secure 保持原值)"
  fi
}

step_deploy_services() {
  hdr "5. 构建并启动 miao-toolbox 服务"
  ssh_run "cd '$REMOTE_DIR' && \
    docker compose -f docker-compose.prod.yml --env-file .env up -d --build"
  sleep 5
  ssh_run "cd '$REMOTE_DIR' && docker compose -f docker-compose.prod.yml ps"
}

step_ensure_vhost() {
  hdr "6. 配置宝塔 extension(主 vhost 由宝塔管理,这里只写我们的反代 + 静态资源)"

  # 写 extension 文件(包含所有 ^~ location + 静态资源 proxy_cache off)
  # 关键:宝塔主 vhost 有 location ~ .*\.png$ 和 ~ .*\.(js|css)?$ 两个静态资源 location,
  #      虽然没 proxy_pass 但设了 expires 30d/12h; 而且宝塔 proxy.conf 全局启用了
  #      proxy_cache cache_one(20m 内存,5G 磁盘,inactive=1d),会缓存所有 proxy_pass 响应
  #      → 部署后 favicon 等更新不及时就是被这个缓存拦截
  # 解决:用更具体的 ^~ location 抢前缀(长度比 ^~ / 2 长,带 ^~ 修饰会禁用正则);
  #      静态资源加 proxy_cache off,绕过全局缓存
  local ext_tmp
  ext_tmp=$(mktemp)
  cat > "$ext_tmp" <<'EXT_EOF'
# 阿渺工具箱反代 + 静态资源配置
# 放在宝塔 extension 目录,主 vhost 通过 include extension/*.conf 加载(主 vhost 重写时不影响)
# 关键:所有 location 都用 ^~ 前缀,长度 > ^~ / 长度 2,会作为最长前缀胜出,
#      带 ^~ 修饰后会禁用正则 location 检查(避免被主 vhost 的 png/js 静态资源 location 抢走)

# 静态资源(favicon + /assets/):不走 BT 全局 proxy_cache,直接打 web 容器,
# 否则部署后 favicon 等还会返回旧版(被 cache 拦截)
location ^~ /favicon-512.png {
    proxy_pass http://127.0.0.1:8089;
    proxy_cache off;
    proxy_set_header Host              $host;
    proxy_set_header X-Real-IP         $remote_addr;
    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
location ^~ /favicon.svg {
    proxy_pass http://127.0.0.1:8089;
    proxy_cache off;
    proxy_set_header Host              $host;
    proxy_set_header X-Real-IP         $remote_addr;
    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
location ^~ /favicon.ico {
    proxy_pass http://127.0.0.1:8089;
    proxy_cache off;
    proxy_set_header Host              $host;
    proxy_set_header X-Real-IP         $remote_addr;
    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
location ^~ /assets/ {
    proxy_pass http://127.0.0.1:8089;
    proxy_cache off;
    proxy_set_header Host              $host;
    proxy_set_header X-Real-IP         $remote_addr;
    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}

# /api/ 走后端(让 BT proxy_cache 缓存 API 响应,减轻后端压力)
location ^~ /api/ {
    proxy_pass http://127.0.0.1:8088/api/;
    proxy_set_header Host              $host;
    proxy_set_header X-Real-IP         $remote_addr;
    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-Host  $host;
    client_max_body_size 100M;
    proxy_read_timeout 180s;
    proxy_send_timeout 180s;
    proxy_connect_timeout 60s;
    proxy_http_version 1.1;
}

# 根路径反代到 web 容器(让 BT proxy_cache 缓存 HTML)
location ^~ / {
    proxy_pass http://127.0.0.1:8089;
    proxy_set_header Host              $host;
    proxy_set_header X-Real-IP         $remote_addr;
    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-Host  $host;
}
EXT_EOF

  scp_to "$ext_tmp" "/tmp/00-miao-toolbox.conf"
  rm -f "$ext_tmp"

  ssh_run "\
    sudo mkdir -p /www/server/panel/vhost/nginx/well-known/tools.yunmiao.site && \
    sudo touch /www/server/panel/vhost/nginx/well-known/tools.yunmiao.site/.keep && \
    sudo mkdir -p /www/server/panel/vhost/nginx/extension/tools.yunmiao.site && \
    sudo cp /tmp/00-miao-toolbox.conf /www/server/panel/vhost/nginx/extension/tools.yunmiao.site/00-miao-toolbox.conf && \
    sudo chown root:root /www/server/panel/vhost/nginx/extension/tools.yunmiao.site/00-miao-toolbox.conf && \
    sudo chmod 644 /www/server/panel/vhost/nginx/extension/tools.yunmiao.site/00-miao-toolbox.conf && \
    sudo mkdir -p /www/wwwlogs && \
    sudo touch /www/wwwlogs/tools.yunmiao.site.access.log /www/wwwlogs/tools.yunmiao.site.error.log && \
    echo '  ✓ extension 已写入 /www/server/panel/vhost/nginx/extension/tools.yunmiao.site/00-miao-toolbox.conf'"

  # 确保主 vhost 包含 extension include(主 vhost 由宝塔管理,我们只确保这一行存在)
  # 如果没有,在 well-known include 后插入
  if ssh_run "sudo grep -q 'include /www/server/panel/vhost/nginx/extension/tools.yunmiao.site/\\*\\.conf' '$BT_VHOST' 2>/dev/null"; then
    grn "  ✓ 主 vhost 已包含 extension include"
  else
    ssh_run "sudo sed -i '/include \\/www\\/server\\/panel\\/vhost\\/nginx\\/well-known\\/tools.yunmiao.site.conf;/a\\    include /www/server/panel/vhost/nginx/extension/tools.yunmiao.site/*.conf;' '$BT_VHOST'" || \
      ssh_run "sudo sed -i '/CERT-APPLY-CHECK--END/a\\    include /www/server/panel/vhost/nginx/extension/tools.yunmiao.site/*.conf;' '$BT_VHOST'"
    grn "  ✓ 主 vhost 已添加 extension include"
  fi

  ssh_run "sudo nginx -t && sudo nginx -s reload && echo '  ✓ nginx reload 完成'"
}

step_verify() {
  hdr "7. 验证"
  echo "  直连后端容器 8088:"
  ssh_run "curl -sI http://127.0.0.1:8088/actuator/health | head -2 || true"
  echo "  直连前端容器 8089:"
  ssh_run "curl -sI http://127.0.0.1:8089/ | head -2 || true"
  echo ""
  echo "  域名 + 宝塔 nginx:"
  echo "    在本机 hosts 添加:  81.70.216.46 tools.yunmiao.site"
  echo "    然后:               curl -I http://tools.yunmiao.site/"
  echo ""
  echo "  默认账号: admin / Admin123(首次登录强制改密)"
}

step_logs() {
  hdr "服务日志"
  ssh_run "cd '$REMOTE_DIR' && docker compose -f docker-compose.prod.yml logs --tail=50 -f"
}

step_status() {
  hdr "服务状态"
  ssh_run "cd '$REMOTE_DIR' && docker compose -f docker-compose.prod.yml ps"
}

# ===== 主流程 =====
usage() {
  cat <<EOF
用法: $0 [命令] [--skip-env]
  (无)        完整部署流程
  --skip-env  跳过 .env 生成(保留已有密钥,日常更新用)
  update      仅拉代码 + 重启服务
  env         仅重新生成 .env(慎用,会覆盖已有密钥)
  status      查看容器状态
  logs        查看实时日志
  vhost       仅重新配置宝塔 vhost
  verify      仅执行验证
EOF
}

case "$cmd" in
  all)
    step_ensure_remote_dir
    step_pull_code
    if [ "$SKIP_ENV" -eq 1 ]; then
      grn "  ⏭ 跳过 .env 生成(使用服务器已有的密钥)"
    else
      step_gen_env
    fi
    step_wait_infra
    step_temp_insecure_cookie
    step_deploy_services
    step_ensure_vhost
    step_verify
    grn "\n🎉 部署完成!默认账号 admin / Admin123"
    ;;
  update)
    step_pull_code
    step_deploy_services
    grn "\n✓ 更新完成"
    ;;
  env)
    step_gen_env
    ;;
  vhost)
    step_ensure_vhost
    ;;
  verify)
    step_verify
    ;;
  status)
    step_status
    ;;
  logs)
    step_logs
    ;;
  -h|--help|help)
    usage
    ;;
  *)
    red "未知命令: $cmd"
    usage
    exit 1
    ;;
esac
