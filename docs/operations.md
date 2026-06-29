# 阿渺工具箱 — 日常运维 SOP

> 服务器：`yunmiao@yunmiao.site`
> 部署目录：`/opt/miao-toolbox/`
> 编排文件：`docker-compose.prod.yml`
> **MySQL/Redis 容器不在本编排内**,由兄弟项目 `miao-infra` 提供,容器名固定 `miao-mysql` / `miao-redis`
>
> 首次部署见 [deployment.md](deployment.md);常见报错见 [troubleshooting.md](troubleshooting.md)。

---

## 目录

1. [高频命令](#1-高频命令)
2. [更新代码](#2-更新代码)
3. [修改 .env（最容易踩的坑）](#3-修改-env最容易踩的坑)
4. [资源监控](#4-资源监控)
5. [数据备份](#5-数据备份)
6. [回滚方案](#6-回滚方案)
7. [部署脚本子命令](#7-部署脚本子命令)

---

## 1. 高频命令

```bash
ssh yunmiao@yunmiao.site
cd /opt/miao-toolbox

# 查看服务状态
docker compose -f docker-compose.prod.yml ps

# 实时日志
docker compose -f docker-compose.prod.yml logs -f api       # 后端
docker compose -f docker-compose.prod.yml logs -f web      # 前端 nginx
docker compose -f docker-compose.prod.yml logs -f mysql    # 数据库
docker compose -f docker-compose.prod.yml logs --tail=200  # 最近 200 行

# 重启单个服务
docker compose -f docker-compose.prod.yml restart api
docker compose -f docker-compose.prod.yml restart web

# 进入容器
docker exec -it miao-toolbox-api-1 sh
docker exec -it miao-mysql mysql -uroot -p"$MYSQL_ROOT_PASSWORD" miao_toolbox   # root 密码在 miao-infra 的 .env

# 直连健康检查（绕过反代）
curl http://127.0.0.1:8088/actuator/health
curl -sI http://127.0.0.1:8089/
```

---

## 2. 更新代码

```bash
# 本机
git push origin main

# 服务器（二选一）
./scripts/deploy-to-yunmiao.sh update       # 自动化：拉代码 + 重建 + 重启

# 或者手动重建特定服务
ssh yunmiao@yunmiao.site
cd /opt/miao-toolbox
docker compose -f docker-compose.prod.yml build api
docker compose -f docker-compose.prod.yml up -d api
```

---

## 3. 修改 .env（最容易踩的坑）

**这是最容易踩的坑**：

| 命令 | 是否重读 .env | 何时用 |
|---|---|---|
| `docker compose restart api` | ❌ **不会重读** | 只重启容器进程（代码 bug、内存问题等） |
| `docker compose up -d api` | ✅ **会重读** | 改了 `.env` 后**必须**用这个 |

**症状**：改了 `.env` 里的某个变量（比如 OAuth 的 `CLIENT_ID`），重启后发现容器内环境变量**还是旧值**。

**原因**：`restart` 只是给容器发 SIGHUP，容器进程还在，**不重新解析 docker-compose 配置**。`up -d` 会重新读 compose 文件 + `.env`，如果环境变量有变化，会自动 recreate 容器（看到输出 "Container ... Recreate" / "Recreated"）。

**诊断命令**：

```bash
# 查容器内环境变量实际值（权威）
docker exec miao-toolbox-api-1 printenv | grep GITHUB
# 或
docker inspect miao-toolbox-api-1 --format '{{range .Config.Env}}{{println .}}{{end}}' | grep GITHUB
```

---

## 4. 资源监控

```bash
# 容器资源占用
docker stats

# 磁盘 / 数据卷
docker system df
du -sh /var/lib/docker/volumes/miao-toolbox_*
du -sh /var/lib/docker/volumes/miao-infra_*       # DB/Redis 数据卷在 miao-infra 名下

# 当前生产实测值(2026-06-27 采样)
#   miao-toolbox-api-1  1.7GB(磁盘)  ~180MB(内存)
#   miao-toolbox-web-1  35MB         ~10MB
#   miao-mysql          1.12GB       ~256MB
#   miao-redis          57.8MB       ~10MB
#   总占用:内存 ~560MB / 3.6GB(15%),磁盘 ~3GB / 69GB(4%)
```

---

## 5. 数据备份

> **目前手动**,未自动化([troubleshooting.md §未来工作](troubleshooting.md#未来工作))。
> 备份目标: miao-toolbox 业务库 `miao_toolbox`,运行在 `miao-mysql` 容器里。

```bash
# MySQL 备份(root 密码在 miao-infra 的 .env 里)
ssh yunmiao@yunmiao.site
docker exec miao-mysql sh -c 'exec mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" miao_toolbox' \
  > backup-$(date +%Y%m%d-%H%M%S).sql

# Redis 备份(AOF 由 Redis 自动持久化;手动触发 BGSAVE)
docker exec miao-redis redis-cli -a "$REDIS_PASSWORD" BGSAVE
```

---

## 6. 回滚方案

```bash
ssh yunmiao@yunmiao.site
cd /opt/miao-toolbox

# 停服务（数据保留）
docker compose -f docker-compose.prod.yml down

# 停服务 + 删数据（危险！所有用户数据丢失）
# docker compose -f docker-compose.prod.yml down -v
```

**代码回滚**（回到上一个 main commit）：

```bash
# 本机
git log --oneline | head -5
git reset --hard <commit-sha>
git push origin main --force-with-lease   # 慎用

# 服务器
docker compose -f docker-compose.prod.yml build api web
docker compose -f docker-compose.prod.yml up -d
```

**宝塔 vhost 移除**：

```bash
sudo rm /www/server/panel/vhost/nginx/tools.yunmiao.site.conf
sudo nginx -s reload
```

---

## 7. 部署脚本子命令

```bash
./scripts/deploy-to-yunmiao.sh all       # 完整流程
./scripts/deploy-to-yunmiao.sh update    # 仅拉代码 + 重启（本机 push 后）
./scripts/deploy-to-yunmiao.sh env       # 仅重新生成 .env（慎用，会覆盖密钥）
./scripts/deploy-to-yunmiao.sh vhost     # 仅重配宝塔 vhost
./scripts/deploy-to-yunmiao.sh status    # 查看容器状态
./scripts/deploy-to-yunmiao.sh logs      # 实时日志
```

### 验收脚本选项

```bash
# 全套 10 条
ADMIN_PASSWORD=你的密码 bash scripts/check-deploy.sh

# 只跑指定 AC
ADMIN_PASSWORD=xxx bash scripts/check-deploy.sh ac1 ac4 ac6

# 指定域名
DOMAIN=staging.example.com bash scripts/check-deploy.sh
```

---

## 8. 关键文件路径速查

| 用途 | 路径 |
|---|---|
| miao-toolbox 部署根目录 | `/opt/miao-toolbox/` |
| miao-infra 部署根目录(兄弟项目) | `/opt/miao-infra/` |
| miao-toolbox 环境变量 | `/opt/miao-toolbox/.env`(chmod 600) |
| miao-infra 环境变量(含 MYSQL_ROOT_PASSWORD) | `/opt/miao-infra/.env` |
| 后端日志(容器) | `docker logs miao-toolbox-api-1` |
| 后端文件日志 | `miao-toolbox-api-1:/app/logs/miao-toolbox.log` |
| 前端 nginx 日志 | `docker exec miao-toolbox-web-1 cat /var/log/nginx/access.log` |
| 宝塔 vhost 主配置 | `/www/server/panel/vhost/nginx/tools.yunmiao.site.conf` |
| 宝塔 vhost 反代(我们控制) | `/www/server/panel/vhost/nginx/extension/tools.yunmiao.site/00-miao-toolbox.conf` |
| 宝塔 well-known(SSL 验证) | `/www/server/panel/vhost/nginx/well-known/tools.yunmiao.site/` |
| 宝塔 SSL 证书 | `/www/server/panel/vhost/cert/tools.yunmiao.site/` |
| MySQL 数据卷(在 miao-infra 名下) | `miao-infra_mysql-data` |
| Redis 数据卷(在 miao-infra 名下) | `miao-infra_redis-data` |
