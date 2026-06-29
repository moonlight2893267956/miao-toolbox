# 阿渺工具箱 — 部署文档

> 当前生产实例：`https://tools.yunmiao.site/`，托管在腾讯云轻量服务器 `yunmiao@yunmiao.site`。
> 部署脚本：`scripts/deploy-to-yunmiao.sh`
> 验收脚本：`scripts/check-deploy.sh`
>
> **本文档只讲首次部署**。日常运维、命令、回滚见 [operations.md](operations.md)，故障排查见 [troubleshooting.md](troubleshooting.md)。

---

## TL;DR · 6 行版本

```bash
# 1) 本机:推代码到 main
git push origin main

# 2) 服务器:先确认 miao-infra 已就绪(提供 miao-mysql / miao-redis)
#    首次部署见 §4.2,从旧版升级(有旧数据)先跑 §4.2a 迁移步骤

# 3) 本机:一键部署(日常更新加 --skip-env 保留已有密钥)
./scripts/deploy-to-yunmiao.sh --skip-env all   # 日常更新(不覆盖 JWT + DB 密码)
# ./scripts/deploy-to-yunmiao.sh all            # 首次部署(生成全新 .env)

# 4) 服务器:申请 SSL(宝塔面板)
# 登录宝塔 → 网站 → tools.yunmiao.site → SSL → Let's Encrypt → 申请

# 5) 服务器:SSL 配好后的 3 步收尾(见 [§4.6](#46-ssl-配好后的收尾))
# 6) 验收
ADMIN_PASSWORD=你的密码 bash scripts/check-deploy.sh
```

> 重复部署/更新代码 → 看 [operations.md §1](operations.md#1-高频命令)

---

## 目录

1. [架构总览](#1-架构总览)
2. [服务器环境](#2-服务器环境)
3. [部署文件清单](#3-部署文件清单)
4. [首次部署](#4-首次部署)
   - 4.1 [本机准备](#41-本机准备)
   - 4.2 [服务器前置：miao-infra 必须先就绪](#42-服务器前置miao-infra-必须先就绪)
   - 4.2a [已有数据库迁移（仅升级用户）](#42a-已有数据库迁移仅从旧版升级用户需关注)
   - 4.3 [一键部署到服务器](#43-一键部署到服务器)
   - 4.4 [申请 SSL](#44-申请-ssl宝塔面板)
   - 4.5 [修复反代被冲掉](#45-修复反代被冲掉部署后必做)
   - 4.6 [SSL 配好后的收尾](#46-ssl-配好后的收尾)
   - 4.7 [验收](#47-验收)

---

## 1. 架构总览

```
Internet
  ↓
┌────────────────────────────────────────────────────────┐
│  宝塔 nginx (80/443,SSL 终结)                            │
│  /www/server/panel/vhost/nginx/tools.yunmiao.site.conf  │
│  extension/00-miao-toolbox.conf(反代)                    │
└────────────────────────────────────────────────────────┘
        │                                     │
        │ /api/                               │ /
        ↓                                     ↓
┌──────────────────────┐         ┌──────────────────────┐
│ miao-toolbox-api-1   │         │ miao-toolbox-web-1   │
│ Spring Boot 4 + JRE21│         │ nginx 1.28 + dist/   │
│ 容器内 8080           │         │ 容器内 80            │
│ 宿主机 127.0.0.1:8088 │         │ 宿主机 127.0.0.1:8089 │
└──────────────────────┘         └──────────────────────┘
        │
        │ miao-infra-net(external)
        ↓
┌──────────────────────┐
│ miao-infra(独立项目) │
│  ├─ miao-mysql       │  MySQL 8.4, 容器内 3306
│  └─ miao-redis       │  Redis 7-alpine, 容器内 6379
│ 数据卷 miao-infra_mysql-data / miao-infra_redis-data
└──────────────────────┘
```

**MySQL / Redis 由 miao-infra 提供**：本项目仓库不再包含 DB / 缓存编排，统一交给兄弟项目 `miao-infra` 管理。容器名固定为 `miao-mysql` / `miao-redis`，跨 compose 网络 `miao-infra-net` 由本项目 compose 引用为 external。

**为什么走宝塔**：服务器已用宝塔管理其他 7 个子域（yunmiao.site / blog / claw / clash / cloud / nps / cos），vhost 模板统一、SSL 续期自动、与运维习惯一致。

**为什么用 8088/8089**：8080 被 nps 占用，8088/8089 空闲。宝塔反代到 127.0.0.1，容器端口不对外暴露。

---

## 2. 服务器环境

| 项 | 值 |
|---|---|
| 主机 | 腾讯云轻量 `yunmiao@yunmiao.site`（出口 IP `81.70.216.46`） |
| 系统 | Ubuntu 22.04 LTS |
| CPU / 内存 | 4 核 / 3.6GB（可用 ~2.3GB） |
| 磁盘 | 69GB（已用 21GB，剩余 46GB） |
| Docker | 29.3.0 + Compose 5.1.0 |
| 宝塔 | 9.x，nginx 1.28.1 |
| Java | **未装**（纯靠 Docker） |
| 域名 | `tools.yunmiao.site`（A 记录 → 81.70.216.46） |
| SSL | 宝塔 → 网站 → Let's Encrypt 自动申请 |
| 部署目录 | `/opt/miao-toolbox/` |
| 日志目录 | 容器 stdout（`docker logs`），文件日志 `miao-toolbox-api-1:/app/logs/` |

---

## 3. 部署文件清单

```
miao-toolbox/                          # 本项目
├── docker-compose.prod.yml            # 生产编排(2 服务 + miao-infra-net external 引用)
├── docker-compose.dev.yml             # 开发编排(可选 api 容器,DB 走 miao-infra)
├── .env.example                       # 环境变量模板
├── miao-toolbox-api/
│   ├── Dockerfile                     # 多阶段:maven:3.9 → eclipse-temurin:21-jre-alpine
│   └── src/main/resources/
│       ├── application.yml            # 含 forward-headers-strategy: framework
│       └── application-prod.yml       # cookie-secure: true(SSL 配好后)
├── miao-toolbox-web/
│   ├── Dockerfile                     # 多阶段:node:20-alpine → nginx:1.28-alpine
│   └── nginx.conf                     # 容器内 /api/ 反代到 api:8080
└── scripts/
    ├── deploy-to-yunmiao.sh           # 一键部署 / 更新 / 状态 / 日志
    └── check-deploy.sh                # 10 条 AC 验收

/opt/miao-infra/                       # 兄弟项目,独立仓库
├── docker-compose.yml                 # miao-mysql + miao-redis + miao-infra-net
└── .env                                # MYSQL_ROOT_PASSWORD / MYSQL_PASSWORD / REDIS_PASSWORD 在这里
```

**职责划分**：
- miao-infra 管 DB / 缓存的生命周期(版本、数据卷、备份、密码轮换)
- miao-toolbox 只关心业务容器(API + Web),通过 miao-infra-net 共享基础设施

---

## 4. 首次部署

### 4.1 本机准备

```bash
cd /Users/wuxiangyi/Desktop/project/vibe-coding/miao-toolbox

# 合并开发分支到 main
git checkout main
git merge --no-ff story/你的分支 -m "merge: 合并 story 分支到 main"
git push origin main

# 提交后跑验收(本地)
bash scripts/check-deploy.sh
```

### 4.2 服务器前置：miao-infra 必须先就绪

```bash
ssh yunmiao@yunmiao.site

# 一次性:克隆 miao-infra 仓库到 /opt/miao-infra(只做一次)
sudo git clone git@github.com:moonlight2893267956/miao-infra.git /opt/miao-infra
sudo chown -R $USER:$USER /opt/miao-infra

# 启动 miao-infra(miao-mysql + miao-redis)
cd /opt/miao-infra
docker compose up -d
docker ps --format '{{.Names}}' | grep -E '^(miao-mysql|miao-redis)$'   # 确认容器在跑
```

> 如果 `/opt/miao-infra` 已存在且 `docker compose up -d` 报 "already up to date" 即可,无需重新拉。
> 升级 miao-infra(改密码、升级 MySQL 版本等)请在 miao-infra 仓库维护,不在本项目范围。

### 4.2a 已有数据库迁移（仅从旧版升级用户需关注）

如果你的服务器上已经有旧的 `miao-toolbox-mysql-1` / `miao-toolbox-redis-1` 容器在跑（老版本自己管理数据库），需先把数据迁到 miao-infra 管理的容器里。

```bash
ssh yunmiao@yunmiao.site =>

# 1) 备份旧 mysql 数据
docker exec miao-toolbox-mysql-1 mysqldump -u root -p"$MYSQL_ROOT_PASSWORD" \
  --all-databases --single-transaction --routines --triggers --events \
  > /tmp/miao-dump-$(date +%Y%m%d).sql

# 2) 停旧 miao-toolbox 全家桶
cd /opt/miao-toolbox
docker compose -f docker-compose.prod.yml down

# 3) 部署 miao-infra(如已存在则跳过 clone)
cd /opt
sudo git clone git@github.com:moonlight2893267956/miao-infra.git miao-infra
sudo chown -R $USER:$USER miao-infra
cd miao-infra

# 4) 写 miao-infra .env(密码沿用旧值)
cat > .env <<'EOF'
MYSQL_USER=miao
MYSQL_PASSWORD=<你的旧 mysql 密码>
MYSQL_ROOT_PASSWORD=<你的旧 root 密码>
REDIS_PASSWORD=<你的旧 redis 密码>
EOF
# 也可从旧 miao-toolbox .env 复制对应行:
# grep -E '^(MYSQL_USER|MYSQL_PASSWORD|MYSQL_ROOT_PASSWORD|REDIS_PASSWORD)=' /opt/miao-toolbox/.env >> .env

# 5) 起 miao-infra
docker compose up -d

# 6) 等 miao-mysql healthy(约 30s)
until docker inspect --format='{{.State.Health.Status}}' miao-mysql | grep -q healthy; do sleep 2; done

# 7) 导入数据
docker exec -i miao-mysql mysql -u root -p"$(grep MYSQL_ROOT_PASSWORD .env | cut -d= -f2)" < /tmp/miao-dump-*.sql

# 8) 修复 miao 用户的库级授权(dump 恢复不会自动应用 mysql.db 的 grant)
docker exec miao-mysql mysql -u root -p"$(grep MYSQL_ROOT_PASSWORD .env | cut -d= -f2)" -e "
  GRANT ALL PRIVILEGES ON miao_toolbox.* TO 'miao'@'%';
  FLUSH PRIVILEGES;
"

# 9) 验证数据
docker exec miao-mysql mysql -u miao -p"$(grep MYSQL_PASSWORD .env | cut -d= -f2)" miao_toolbox \
  -e "SELECT COUNT(*) AS users FROM users; SELECT COUNT(*) AS tools FROM tools;"
# 应返回你的实际行数
```

> 完成以上步骤后，miao-infra 已就绪。接下来跑本机 `./scripts/deploy-to-yunmiao.sh all` 自动部署 miao-toolbox（密码会自动从 miao-infra .env 同步）。

### 4.3 一键部署到服务器

```bash
# 日常更新(保留已有 JWT 密钥 + DB 密码):
./scripts/deploy-to-yunmiao.sh --skip-env all

# 首次部署(生成全新 .env):
./scripts/deploy-to-yunmiao.sh all
```

脚本会依次：

1. 创建 `/opt/miao-toolbox/`(`sudo chown yunmiao`)
2. 本机 tar 打包代码 → scp 到服务器 → 解压
3. 本机 Python 生成强随机 JWT 密钥 → 写入 `.env` → scp 到服务器(chmod 600)
4. **轮询 miao-infra 状态**(检查 `miao-mysql` / `miao-redis` 容器 healthy,最多等 120s)
5. 临时把 `cookie-secure` 改 `false`(SSL 申请前)
6. `docker compose -f docker-compose.prod.yml up -d --build`
7. 创建宝塔 well-known 目录 + wwwlogs 目录
8. 写宝塔 vhost(`/www/server/panel/vhost/nginx/tools.yunmiao.site.conf`)
9. `sudo nginx -t && sudo nginx -s reload`
10. 打印验证步骤

> 步骤 4 失败会立即退出,不会启动业务容器。常见失败原因:服务器上没 miao-infra → 见 [§4.2](#42-服务器前置miao-infra-必须先就绪)

### 4.4 申请 SSL（宝塔面板）

登录宝塔 → 网站 → `tools.yunmiao.site` → **SSL** → **Let's Encrypt** → 申请

申请成功后宝塔自动：

- 生成 `listen 443 ssl` 块
- 写 80→443 强制跳转
- 改 `root` 指向 `/www/wwwroot/tools.yunmiao.site/`（放默认 index.html）

**关键：SSL 申请后，宝塔会重写 vhost，把我们之前的反代 location 冲掉。**

### 4.5 修复反代被冲掉（部署后必做）

在宝塔的 `extension` 目录加反代配置 — 这样**宝塔以后怎么改主 vhost 都不影响反代**：

```bash
# 把以下内容写到 /www/server/panel/vhost/nginx/extension/tools.yunmiao.site/00-miao-toolbox.conf
# (deploy-to-yunmiao.sh 已自动写，但如果宝塔主 vhost 里没有这个 include 行，需要手动补)

location ^~ /api/ {
    proxy_pass http://127.0.0.1:8088/api/;
    proxy_set_header Host              $host;
    proxy_set_header X-Real-IP         $remote_addr;
    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-Host  $host;
    client_max_body_size 100M;
    proxy_read_timeout 60s;
    proxy_http_version 1.1;
}

location ^~ / {
    proxy_pass http://127.0.0.1:8089;
    proxy_set_header Host              $host;
    proxy_set_header X-Real-IP         $remote_addr;
    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-Host  $host;
}
```

**关键细节**：`^~` 前缀让普通 location 优先级高于宝塔主 vhost 里的正则 location（`location ~ .*\.js$` 等），否则 `/assets/*.js`、`/favicon-512.png` 会被正则抢走，返回 404。

### 4.6 SSL 配好后的收尾

```bash
ssh yunmiao@yunmiao.site
cd /opt/miao-toolbox

# 1) 收紧 CORS 到只允许生产域名
sed -i "s|^CORS_ALLOWED_ORIGINS=.*|CORS_ALLOWED_ORIGINS=https://tools.yunmiao.site|" .env

# 2) 把 cookie-secure 改回 true
sed -i "s/cookie-secure: false/cookie-secure: true/" miao-toolbox-api/src/main/resources/application-prod.yml

# 3) 重新构建并重启 api(只重建 api/web,不影响 miao-infra)
docker compose -f docker-compose.prod.yml build api
docker compose -f docker-compose.prod.yml up -d api
```

**关键依赖**：`miao-toolbox-api/src/main/resources/application.yml` 必须有：

```yaml
server:
  forward-headers-strategy: framework
```

否则 Spring 看不到 `X-Forwarded-Proto: https`，`cookie-secure: true` 在反代后面会失效，refresh token cookie 丢失，登录态立即断。

### 4.7 验收

```bash
# 改密后的密码通过环境变量传入
ADMIN_PASSWORD=你的密码 bash scripts/check-deploy.sh
```

预期：9/9 通过（AC8 改密为交互式，默认跳过）。
