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
#   ./scripts/deploy-to-yunmiao.sh           # 完整流程(首次部署)
#   ./scripts/deploy-to-yunmiao.sh update    # 仅更新代码并重启
#   ./scripts/deploy-to-yunmiao.sh env       # 仅重新生成 .env
#   ./scripts/deploy-to-yunmiao.sh status    # 查看服务状态
#   ./scripts/deploy-to-yunmiao.sh logs      # 查看日志
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

# ===== 工具函数 =====
red() { printf "\033[31m%s\033[0m\n" "$*"; }
grn() { printf "\033[32m%s\033[0m\n" "$*"; }
ylw() { printf "\033[33m%s\033[0m\n" "$*"; }
hdr() { printf "\n\033[1;36m=== %s ===\033[0m\n" "$*"; }
ssh_run() { ssh $SSH_OPTS "$REMOTE_HOST" "$@"; }
scp_to() { scp $SSH_OPTS -r "$1" "$REMOTE_HOST:$2"; }

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
  hdr "3. 生成 .env(本机生成密钥,避开嵌套 sed 坑)"
  local env_file
  env_file="/tmp/miao-toolbox-$(date +%s).env"
  cp .env.example "$env_file"
  chmod 600 "$env_file"

  # 本机用 Python 生成安全随机密码(避免 base64 的 /+= 干扰 sed)
  python3 - "$env_file" <<'PY'
import secrets, string, sys, pathlib
path = pathlib.Path(sys.argv[1])
text = path.read_text()

def rand_secret(n=64):
    # URL-safe base64(用 - _ 替代 + /),避免 sed 分隔符冲突
    return secrets.token_urlsafe(n)

def rand_password(n=24):
    # 字母数字,排除容易混淆的 0/O/1/l/I
    alpha = ''.join(c for c in string.ascii_letters + string.digits if c not in '0O1lI')
    return ''.join(secrets.choice(alpha) for _ in range(n))

replacements = {
    'JWT_SECRET=': f'JWT_SECRET={rand_secret(64)}',
    'JWT_REFRESH_SECRET=': f'JWT_REFRESH_SECRET={rand_secret(64)}',
    'MYSQL_PASSWORD=': f'MYSQL_PASSWORD={rand_password(24)}',
    'MYSQL_ROOT_PASSWORD=': f'MYSQL_ROOT_PASSWORD={rand_password(24)}',
    'REDIS_PASSWORD=': f'REDIS_PASSWORD={rand_password(24)}',
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
print(f"✓ .env 已生成: {path}")
PY

  scp $SSH_OPTS "$env_file" "$REMOTE_HOST:/opt/miao-toolbox/.env"
  rm -f "$env_file"
  grn "  ✓ .env 已上传到 $REMOTE_DIR/.env"
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
  hdr "5. 构建并启动服务"
  ssh_run "cd '$REMOTE_DIR' && \
    docker compose -f docker-compose.prod.yml --env-file .env up -d --build"
  sleep 5
  ssh_run "cd '$REMOTE_DIR' && docker compose -f docker-compose.prod.yml ps"
}

step_ensure_vhost() {
  hdr "6. 配置宝塔 vhost"

  # 渲染 vhost 模板
  local vhost_tmp
  vhost_tmp=$(mktemp)
  cat > "$vhost_tmp" <<EOF
server {
    listen 80;
    server_name tools.yunmiao.site;

    # 临时:80/443 还没配 SSL,先只走 80
    # 域名+SSL 配好后,在此 server 内追加 listen 443 ssl + 80 -> 443 跳转
    #CERT-APPLY-CHECK--START
    # 用于 SSL 证书申请时的文件验证(SSL 申请前需要先存在此目录)
    include /www/server/panel/vhost/nginx/well-known/tools.yunmiao.site.conf;
    #CERT-APPLY-CHECK--END

    # API 反代(后端容器 8088)
    # 用 ^~ 前缀,优先级高于主 vhost 里的正则 location(location ~ .*\.js$ 等)
    location ^~ /api/ {
        proxy_pass http://127.0.0.1:8088/api/;
        proxy_set_header Host              \$host;
        proxy_set_header X-Real-IP         \$remote_addr;
        proxy_set_header X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        client_max_body_size 100M;
        proxy_read_timeout 60s;
    }

    # 前端反代(nginx 容器 8089)
    location ^~ / {
        proxy_pass http://127.0.0.1:8089;
        proxy_set_header Host              \$host;
        proxy_set_header X-Real-IP         \$remote_addr;
        proxy_set_header X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    access_log /www/wwwlogs/tools.yunmiao.site.access.log;
    error_log  /www/wwwlogs/tools.yunmiao.site.error.log;
}
EOF

  scp_to "$vhost_tmp" "/tmp/tools.yunmiao.site.conf"
  rm -f "$vhost_tmp"
  ssh_run "\
    sudo mkdir -p /www/server/panel/vhost/nginx/well-known/tools.yunmiao.site && \
    sudo touch /www/server/panel/vhost/nginx/well-known/tools.yunmiao.site/.keep && \
    sudo mkdir -p /www/wwwlogs && \
    sudo touch /www/wwwlogs/tools.yunmiao.site.access.log /www/wwwlogs/tools.yunmiao.site.error.log && \
    sudo cp /tmp/tools.yunmiao.site.conf '$BT_VHOST' && \
    sudo nginx -t && \
    sudo nginx -s reload && \
    echo '  ✓ 宝塔 vhost 已生效'"
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
用法: $0 [命令]
  (无)        完整部署流程
  update      仅拉代码 + 重启服务
  env         仅重新生成 .env(慎用,会覆盖现有密钥)
  status      查看容器状态
  logs        查看实时日志
  vhost       仅重新配置宝塔 vhost
  verify      仅执行验证
EOF
}

cmd="${1:-all}"
case "$cmd" in
  all)
    step_ensure_remote_dir
    step_pull_code
    step_gen_env
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
