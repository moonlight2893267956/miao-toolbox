# 阿渺工具箱 — 部署文档

> 自托管部署手册。当前生产实例:`https://tools.yunmiao.site/`,托管在腾讯云轻量服务器 `yunmiao@yunmiao.site`。

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
        │                                     ↑
        │ mysql:3306, redis:6379               │ /api/ 反代
        ↓                                     │
┌──────────────────────┐         ┌──────────────────────┐
│ miao-toolbox-mysql-1 │         │ miao-toolbox-web-1   │
│ MySQL 8.4            │         │ (前端 nginx 内反代)   │
│ 容器内 3306           │         └──────────────────────┘
│ 数据卷 mysql-data     │
└──────────────────────┘
┌──────────────────────┐
│ miao-toolbox-redis-1 │
│ Redis 7-alpine       │
│ 数据卷 redis-data    │
└──────────────────────┘
```

**为什么走宝塔**:服务器已用宝塔管理其他 7 个子域(yunmiao.site / blog / claw / clash / cloud / nps / cos),vhost 模板统一、SSL 续期自动、与运维习惯一致。

**为什么用 8088/8089**:8080 被 nps 占用,8088/8089 空闲。宝塔反代到 127.0.0.1,容器端口不对外暴露。

## 2. 服务器环境

| 项 | 值 |
|---|---|
| 主机 | 腾讯云轻量 `yunmiao@yunmiao.site`(出口 IP `81.70.216.46`) |
| 系统 | Ubuntu 22.04 LTS |
| CPU / 内存 | 4 核 / 3.6GB(可用 ~2.3GB) |
| 磁盘 | 69GB(已用 21GB,剩余 46GB) |
| Docker | 29.3.0 + Compose 5.1.0 |
| 宝塔 | 9.x,nginx 1.28.1 |
| Java | **未装**(纯靠 Docker) |
| 域名 | `tools.yunmiao.site`(A 记录 → 81.70.216.46) |
| SSL | 宝塔 → 网站 → Let's Encrypt 自动申请 |
| 部署目录 | `/opt/miao-toolbox/` |
| 日志目录 | 容器 stdout(`docker logs`),文件日志 `miao-toolbox-api-1:/app/logs/` |

## 3. 部署文件清单

```
miao-toolbox/
├── docker-compose.prod.yml          # 生产编排(4 服务 + 网络 + 卷)
├── .env.example                     # 环境变量模板(已补全 JWT_REFRESH_SECRET)
├── miao-toolbox-api/
│   ├── Dockerfile                   # 多阶段:maven:3.9 → eclipse-temurin:21-jre-alpine
│   └── src/main/resources/
│       ├── application.yml          # 含 forward-headers-strategy: framework
│       └── application-prod.yml     # cookie-secure: true(SSL 配好后)
├── miao-toolbox-web/
│   ├── Dockerfile                   # 多阶段:node:20-alpine → nginx:1.28-alpine
│   └── nginx.conf                   # 容器内 /api/ 反代到 api:8080
└── scripts/
    ├── deploy-to-yunmiao.sh         # 一键部署 / 更新 / 状态 / 日志
    └── check-deploy.sh              # 10 条 AC 验收
```

## 4. 首次部署

### 4.1 准备部署文件(本机)

```bash
cd /Users/wuxiangyi/Desktop/project/vibe-coding/miao-toolbox

# 合并开发分支到 main
git checkout main
git merge --no-ff story/1-8-frontend-format -m "merge: 合并 story 分支到 main"
git push origin main

# 提交后跑验收(本地)
bash scripts/check-deploy.sh
```

### 4.2 一键部署到服务器

```bash
./scripts/deploy-to-yunmiao.sh all
```

脚本会依次:
1. 创建 `/opt/miao-toolbox/`(`sudo chown yunmiao`)
2. 本机 tar 打包代码 → scp 到服务器 → 解压
3. 本机 Python 生成强随机密钥 → 写入 `.env` → scp 到服务器(chmod 600)
4. 临时把 `cookie-secure` 改 `false`(SSL 申请前)
5. `docker compose -f docker-compose.prod.yml up -d --build`
6. 创建宝塔 well-known 目录 + wwwlogs 目录
7. 写宝塔 vhost(`/www/server/panel/vhost/nginx/tools.yunmiao.site.conf`)
8. `sudo nginx -t && sudo nginx -s reload`
9. 打印验证步骤

### 4.3 申请 SSL(宝塔面板)

登录宝塔 → 网站 → `tools.yunmiao.site` → **SSL** → **Let's Encrypt** → 申请

申请成功后宝塔自动:
- 生成 `listen 443 ssl` 块
- 写 80→443 强制跳转
- 改 `root` 指向 `/www/wwwroot/tools.yunmiao.site/`(放默认 index.html)

**关键:SSL 申请后,宝塔会重写 vhost,把我们之前的反代 location 冲掉。**

### 4.4 修复反代被冲掉(部署后必做)

在宝塔的 `extension` 目录加反代配置 — 这样**宝塔以后怎么改主 vhost 都不影响反代**:

```bash
# 把以下内容写到 /www/server/panel/vhost/nginx/extension/tools.yunmiao.site/00-miao-toolbox.conf
# (deploy-to-yunmiao.sh 已自动写,但如果宝塔主 vhost 里没有这个 include 行,需要手动补)

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

**关键细节**:`^~` 前缀让普通 location 优先级高于宝塔主 vhost 里的正则 location(`location ~ .*\.js$` 等),否则 `/assets/*.js`、`/favicon-512.png` 会被正则抢走,返回 404。

### 4.5 SSL 配好后的收尾

```bash
ssh yunmiao@yunmiao.site
cd /opt/miao-toolbox

# 1) 收紧 CORS 到只允许生产域名
sed -i "s|^CORS_ALLOWED_ORIGINS=.*|CORS_ALLOWED_ORIGINS=https://tools.yunmiao.site|" .env

# 2) 把 cookie-secure 改回 true
sed -i "s/cookie-secure: false/cookie-secure: true/" miao-toolbox-api/src/main/resources/application-prod.yml

# 3) 重新构建并重启 api(只重建 api,不影响 mysql/redis)
docker compose -f docker-compose.prod.yml build api
docker compose -f docker-compose.prod.yml up -d api
```

**关键依赖**:`miao-toolbox-api/src/main/resources/application.yml` 必须有:
```yaml
server:
  forward-headers-strategy: framework
```
否则 Spring 看不到 `X-Forwarded-Proto: https`,`cookie-secure: true` 在反代后面会失效,refresh token cookie 丢失,登录态立即断。

### 4.6 验收

```bash
# 改密后的密码通过环境变量传入
ADMIN_PASSWORD=你的密码 bash scripts/check-deploy.sh
```

预期:9/9 通过(AC8 改密为交互式,默认跳过)。

## 5. 日常运维

### 5.1 常用命令

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
docker exec -it miao-toolbox-mysql-1 mysql -uroot -p$MYSQL_ROOT_PASSWORD miao_toolbox

# 直连健康检查(绕过反代)
curl http://127.0.0.1:8088/actuator/health
curl -sI http://127.0.0.1:8089/
```

### 5.2 修改 .env 后必须用 `up -d`,不要用 `restart`

**这是最容易踩的坑**:

| 命令 | 是否重读 .env | 何时用 |
|---|---|---|
| `docker compose restart api` | ❌ **不会重读** | 只重启容器进程(代码 bug、内存问题等) |
| `docker compose up -d api` | ✅ **会重读** | 改了 `.env` 后必须用这个 |

**症状**:改了 `.env` 里的某个变量(比如 OAuth 的 `CLIENT_ID`),重启后发现容器内环境变量**还是旧值**。

**原因**:`restart` 只是给容器发 SIGHUP,容器进程还在,**不重新解析 docker-compose 配置**。`up -d` 会重新读 compose 文件 + `.env`,如果环境变量有变化,会自动 recreate 容器(看到输出 "Container ... Recreate" / "Recreated")。

**诊断命令**:
```bash
# 查容器内环境变量实际值(权威)
docker exec miao-toolbox-api-1 printenv | grep GITHUB
# 或
docker inspect miao-toolbox-api-1 --format '{{range .Config.Env}}{{println .}}{{end}}' | grep GITHUB
```

### 5.3 部署脚本子命令

```bash
./scripts/deploy-to-yunmiao.sh all       # 完整流程
./scripts/deploy-to-yunmiao.sh update    # 仅拉代码 + 重启(本机 push 后)
./scripts/deploy-to-yunmiao.sh env       # 仅重新生成 .env(慎用,会覆盖密钥)
./scripts/deploy-to-yunmiao.sh vhost     # 仅重配宝塔 vhost
./scripts/deploy-to-yunmiao.sh status    # 查看容器状态
./scripts/deploy-to-yunmiao.sh logs      # 实时日志
```

### 5.4 验收脚本选项

```bash
# 全套 10 条
ADMIN_PASSWORD=你的密码 bash scripts/check-deploy.sh

# 只跑指定 AC
ADMIN_PASSWORD=xxx bash scripts/check-deploy.sh ac1 ac4 ac6

# 指定域名
DOMAIN=staging.example.com bash scripts/check-deploy.sh
```

## 6. 更新代码

```bash
# 本机
git push origin main

# 服务器
./scripts/deploy-to-yunmiao.sh update
```

或者在服务器上只重建特定服务:

```bash
ssh yunmiao@yunmiao.site
cd /opt/miao-toolbox
docker compose -f docker-compose.prod.yml build api
docker compose -f docker-compose.prod.yml up -d api
```

## 7. 关键配置文件

### 7.1 `docker-compose.prod.yml`

- 4 个服务:`api` / `web` / `mysql` / `redis`
- 网络:`miao-net`(bridge,服务间通信)
- 卷:`miao-toolbox_mysql-data`、`miao-toolbox_redis-data`
- 端口:`api` 8088,`web` 8089,**仅绑定 127.0.0.1**(宝塔反代)
- 资源限制:api 512M,web 64M
- 健康检查:每个服务都有,`api` 等 mysql/redis healthy 才启动

### 7.2 `miao-toolbox-api/Dockerfile`

```dockerfile
# 多阶段:第一阶段编译
FROM maven:3.9-eclipse-temurin-21 AS builder
WORKDIR /build
COPY pom.xml .
RUN mvn -B -q dependency:go-offline    # 单独 COPY 利用 Docker 缓存
COPY src ./src
RUN mvn -B -q clean package -DskipTests

# 第二阶段:运行时
FROM eclipse-temurin:21-jre-alpine
RUN addgroup -S miao && adduser -S miao -G miao
WORKDIR /app
RUN mkdir -p /app/logs && chown -R miao:miao /app   # USER miao 需要写 logs
COPY --from=builder /build/app.jar /app/app.jar
USER miao
ENV JAVA_OPTS="-Xms256m -Xmx384m -XX:+UseG1GC"
ENTRYPOINT ["sh", "-c", "exec java $JAVA_OPTS -jar /app/app.jar"]
```

### 7.3 `miao-toolbox-web/Dockerfile`

```dockerfile
# 多阶段:node 构建 → nginx serve
FROM node:20-alpine AS builder
WORKDIR /build
COPY package*.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM nginx:1.28-alpine
COPY --from=builder /build/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

### 7.4 `miao-toolbox-web/nginx.conf`(容器内)

```nginx
server {
    listen 80;
    server_name _;
    root /usr/share/nginx/html;

    # SPA fallback
    location / {
        try_files $uri $uri/ /index.html;
    }

    # /api/ 反代到 api 容器(同 docker-compose 网络)
    location /api/ {
        proxy_pass http://api:8080/api/;   # 注意是 api,不是 miao-api
        proxy_set_header Host $host;
        ...
    }
}
```

### 7.5 `.env`(服务器,`chmod 600`)

| 变量 | 用途 | 备注 |
|---|---|---|
| `MYSQL_ROOT_PASSWORD` | MySQL root | 24 字符随机 |
| `MYSQL_PASSWORD` | MySQL `miao` 用户 | 24 字符随机 |
| `REDIS_PASSWORD` | Redis | 24 字符随机 |
| `JWT_SECRET` | access token 签名 | `secrets.token_urlsafe(64)` |
| `JWT_REFRESH_SECRET` | refresh token 签名 | **必须独立于 access** |
| `CORS_ALLOWED_ORIGINS` | CORS 白名单 | 逗号分隔 |
| `GITHUB_CLIENT_ID/SECRET` | OAuth 登录(可选) | 留空则不显示按钮 |
| `GOOGLE_CLIENT_ID/SECRET` | OAuth 登录(可选) | 同上 |
| `COS_*` | 腾讯云 COS(可选) | 文本对比文件上传 |

## 8. 故障排查

### 8.1 后端容器一直 `Restarting (1)`

**症状**:`docker compose ps` 显示 api 状态 `Restarting (1)`,`docker logs` 里有 stacktrace。

**常见原因**:
- `logs/miao-toolbox.log: Permission denied` → Dockerfile 没 `chown miao:miao /app`
- `CharacterEncoding utf8mb4` → JDBC URL 必须是 `UTF-8`(Java charset),不是 `utf8mb4`
- `JWT_REFRESH_SECRET not set` → `.env` 缺这个变量
- `MYSQL_URL` 写错 → 检查容器网络用 `mysql:3306`,不是 `localhost:3306`

### 8.2 浏览器页面空白,Console 报 404

**症状**:`/assets/index-*.js`、`/favicon-512.png` 返回 404。

**根因**:宝塔主 vhost 里的正则 location(`location ~ .*\.(js|css)?$` 等)抢走了这些路径。

**修复**:在 `extension` 目录的 `00-miao-toolbox.conf` 里,所有 `location` 加 `^~` 前缀。

### 8.2b 部署后 favicon/assets 仍是旧版本(`size` 偏小、tab 图标不对)

**症状**:浏览器硬刷新后 `/favicon-512.png` 还是 71KB 旧版(本机新版 321KB),`/assets/index-*.js` 也是旧 hash。`/favicon.ico` 直接 404。`nginx -T` 显示 `^~ /favicon-512.png` 在加载,web 容器内文件也是新的。

**根因**:**宝塔 `proxy.conf` 全局启用了 `proxy_cache cache_one`**:

```nginx
# /www/server/nginx/conf/proxy.conf
proxy_cache_path /www/server/nginx/proxy_cache_dir levels=1:2 keys_zone=cache_one:20m inactive=1d max_size=5g;
proxy_cache cache_one;
```

宝塔默认在 `http { }` 块 `include proxy.conf;`,**所有 `proxy_pass` 响应都被缓存**(按响应头 `Cache-Control` / `Expires` 决定过期)。所以 deploy 后第一次请求 favicon,宝塔从 `proxy_cache_dir` 返回旧的 71KB,根本不会打到 web 容器。

**验证缓存就是元凶**:

```bash
# 加随机 query 绕过 cache
curl -k -s -o /dev/null -w 'size=%{size_download}\n' 'https://tools.yunmiao.site/favicon-512.png?bust=1'
#   → 321229(新版,打到了 web 容器)

curl -k -s -o /dev/null -w 'size=%{size_download}\n' 'https://tools.yunmiao.site/favicon-512.png'
#   → 71195(旧版,宝塔 proxy_cache 命中)
```

**修复**:在 `extension/00-miao-toolbox.conf` 的静态资源 location 加 `proxy_cache off;`(API 和根路径可以保留缓存,减轻后端压力):

```nginx
location ^~ /favicon-512.png {
    proxy_pass http://127.0.0.1:8089;
    proxy_cache off;  # 关键:绕过宝塔全局 proxy_cache
    ...
}
location ^~ /favicon.svg    { proxy_pass http://127.0.0.1:8089; proxy_cache off; ... }
location ^~ /favicon.ico    { proxy_pass http://127.0.0.1:8089; proxy_cache off; ... }
location ^~ /assets/        { proxy_pass http://127.0.0.1:8089; proxy_cache off; ... }
```

然后 `sudo nginx -t && sudo nginx -s reload`,deploy 静态资源就能立即生效。

**`/favicon.ico` 兜底**:浏览器默认会请求 `/favicon.ico`,如果 web 容器没这文件就 404。**用 Pillow 从 512 PNG 生成 16/32/48 多尺寸 ICO 放 `public/`**:

```python
from PIL import Image
Image.open('public/favicon-512.png').save(
    'public/favicon.ico', format='ICO', sizes=[(48,48), (32,32), (16,16)])
```

`index.html` 加 3 个 link tag,浏览器按顺序选最匹配的:

```html
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
<link rel="icon" type="image/png" sizes="512x512" href="/favicon-512.png" />
<link rel="alternate icon" type="image/x-icon" href="/favicon.ico" />
```

### 8.3 登录后立即掉登录态(刷新就退出)

**症状**:能登录,但刷新页面就退出。

**根因**:`cookie-secure: true` 在反代后面没生效,refresh token cookie 没被设置(或没被发送)。

**修复**:`application.yml` 必须有 `forward-headers-strategy: framework`,让 Spring 解析 `X-Forwarded-Proto`。

### 8.4 CORS 报错

**症状**:Console 报 `Access to XMLHttpRequest ... has been blocked by CORS policy`。

**修复**:
- 确认 `CORS_ALLOWED_ORIGINS` 包含浏览器访问的实际 origin
- 注意协议(http vs https)、端口、域名都要完全一致

### 8.5 宝塔 vhost 改动后反代失效

**症状**:用宝塔"修改"站点后,反代失效。

**修复**:我们的反代放在 `extension/00-miao-toolbox.conf`,理论上不会失效。如果真的失效了,先检查:
- `include /www/server/panel/vhost/nginx/extension/tools.yunmiao.site/*.conf;` 在主 vhost 里
- 重新跑 `./scripts/deploy-to-yunmiao.sh vhost`

### 8.6 OAuth 回调超时(`SocketTimeoutException: Connect timed out`)

**症状**:OAuth authorize 重定向 URL 正确(用户能看到 GitHub/Google 授权页),但授权完成后回调接口 `GET /api/auth/oauth/{github|google}/callback?code=...&state=...` 报错,后端日志:

```
ERROR c.m.t.a.controller.OAuthController - OAuth callback failed
java.net.SocketTimeoutException: Connect timed out
    at com.miao.toolbox.auth.oauth.GitHubOAuthService.exchangeCodeForToken
    at com.miao.toolbox.auth.oauth.GitHubOAuthService.handleCallback
```

**根因**:腾讯云轻量服务器(国内出口)的国际访问被 GFW / 腾讯云边界防火墙屏蔽。验证方法:

```bash
# 宿主机直连测试(不走代理)
curl -v -m 8 -o /dev/null https://github.com/login/oauth/access_token
#   → TLS 握手中途被切断(github.com 根域)
curl -v -m 8 -o /dev/null https://oauth2.googleapis.com/token
#   → Connection timed out(googleapis.com 整个 IP 段)
curl -v -m 8 -o /dev/null https://api.github.com/zen
#   → 200 OK(api.github.com 子域的 IP 段是通的,容易误导)
```

| 端点 | 直连结果 |
|---|---|
| `api.github.com:443` | ✅ 通(20.205.243.168) |
| `github.com:443` | ❌ TLS 握手中断(20.205.243.166) |
| `oauth2.googleapis.com:443` | ❌ Connection timed out |
| `accounts.google.com:443` | ❌ Connection timed out |

**修复**:让 JVM 走宿主机的 HTTP 代理(如 Clash 监听 `0.0.0.0:7890`)。改 `docker-compose.prod.yml` 的 `api` service:

```yaml
  api:
    extra_hosts:
      - "host.docker.internal:host-gateway"   # 让容器能解析到宿主机
    environment:
      HTTP_PROXY: http://host.docker.internal:7890
      HTTPS_PROXY: http://host.docker.internal:7890
      JAVA_OPTS: >-
        -Xms256m -Xmx384m -XX:+UseG1GC
        -Dhttp.proxyHost=host.docker.internal
        -Dhttp.proxyPort=7890
        -Dhttps.proxyHost=host.docker.internal
        -Dhttps.proxyPort=7890
        -Dhttp.nonProxyHosts=mysql|redis|api|web|localhost|127.*|*.yunmiao.site|10.*|172.16.*|172.17.*|172.18.*|192.168.*
```

**为什么这样能解决**:
- `RestTemplate` 用 `SimpleClientHttpRequestFactory` → JDK `HttpURLConnection`
- JVM 启动时 `-Dhttp(s).proxyHost/Port` 属性会自动设置 `ProxySelector` 给对应协议
- `HttpURLConnection` 自动用代理,**不用改 Java 代码**
- `nonProxyHosts` 排除内网服务(`mysql`/`redis`/`api`/`web`/宿主机反代/私网),免得这些连接绕一圈到代理

**验证步骤**:

```bash
# 1. 同步 compose 文件到服务器 + 重建
scp docker-compose.prod.yml yunmiao@yunmiao.site:/opt/miao-toolbox/
ssh yunmiao@yunmiao.site "cd /opt/miao-toolbox && docker compose -f docker-compose.prod.yml up -d api"

# 2. 确认 java 进程命令行有代理参数
ssh yunmiao@yunmiao.site "docker exec miao-toolbox-api-1 ps -ef | grep app.jar | grep -v grep"
#   应看到 -Dhttp.proxyHost=host.docker.internal -Dhttp.proxyPort=7890 ...

# 3. 容器内 nc 测 HTTP CONNECT 隧道(Java 走代理时用的协议)
ssh yunmiao@yunmiao.site "docker exec miao-toolbox-api-1 sh -c '
printf \"CONNECT github.com:443 HTTP/1.1\\r\\nHost: github.com\\r\\n\\r\\n\" | nc -w 8 host.docker.internal 7890 | head -1
printf \"CONNECT oauth2.googleapis.com:443 HTTP/1.1\\r\\nHost: oauth2.googleapis.com\\r\\n\\r\\n\" | nc -w 8 host.docker.internal 7890 | head -1
'"
#   应都返回 HTTP/1.1 200 Connection established

# 4. 端到端实测:浏览器走一遍 GitHub/Google 授权,看后端日志
ssh yunmiao@yunmiao.site "cd /opt/miao-toolbox && docker compose -f docker-compose.prod.yml logs -f api"
#   应看到 OAuth callback success: userId=..., username=...
#   整流程 2~5 秒完成
```

**如果不希望走代理**(接受 OAuth 不可用):把 `.env` 里 `GITHUB_CLIENT_ID` / `GOOGLE_CLIENT_ID` 等 OAuth 变量清空(注释掉 `# ` 前缀),`up -d api` 后前端登录页会自动隐藏 OAuth 按钮,用户只能用账号密码登录。

## 9. 数据备份

目前**没有自动备份**。建议手动定期备份:

```bash
# 备份 MySQL
ssh yunmiao@yunmiao.site
cd /opt/miao-toolbox
docker exec miao-toolbox-mysql-1 mysqldump \
  -uroot -p"$MYSQL_ROOT_PASSWORD" \
  --single-transaction --routines --triggers \
  miao_toolbox > /opt/backup/miao_toolbox-$(date +%F).sql

# 备份 Redis(可选,数据可重建)
docker exec miao-toolbox-redis-1 redis-cli -a "$REDIS_PASSWORD" SAVE
docker cp miao-toolbox-redis-1:/data/dump.rdb /opt/backup/redis-$(date +%F).rdb
```

后续可加 cron 每日凌晨 3 点自动备份,保留 30 天。

## 10. 资源占用

实测(4 容器全 Up):

| 容器 | 镜像大小 | 运行内存 | 备注 |
|---|---|---|---|
| miao-toolbox-api-1 | ~300MB(构建后) | ~280MB | 含 JRE 21 + 应用 |
| miao-toolbox-web-1 | 97.7MB | ~10MB | nginx 静态 serve |
| miao-toolbox-mysql-1 | 1.12GB(磁盘) | ~256MB | 数据卷独立 |
| miao-toolbox-redis-1 | 57.8MB | ~10MB | 持久化 AOF |

**总占用**:内存 ~560MB / 3.6GB(15%),磁盘 ~3GB / 69GB(4%)。

## 11. 已知限制 & 后续优化

- [ ] **数据备份自动化**(目前手动)
- [ ] **监控/告警**(Prometheus + Grafana,可选)
- [ ] **CI/CD**(GitHub Actions 自动构建推送,目前手动)
- [ ] **资源限制更精细**(目前只设内存上限,没设 CPU)
- [ ] **日志收集**(目前 `docker logs`,无集中)
- [ ] **OAuth 接入**(GitHub / Google,需申请 Client ID)
- [ ] **COS 接入**(文本对比文件上传,需腾讯云密钥)
- [ ] **AI 工具接入**(目前只有文本对比,其他工具待开发)

## 12. 关键文件路径速查

| 用途 | 路径 |
|---|---|
| 部署根目录(服务器) | `/opt/miao-toolbox/` |
| 环境变量 | `/opt/miao-toolbox/.env`(chmod 600) |
| 后端日志(容器) | `docker logs miao-toolbox-api-1` |
| 后端文件日志 | `miao-toolbox-api-1:/app/logs/miao-toolbox.log` |
| 前端 nginx 日志 | `docker exec miao-toolbox-web-1 cat /var/log/nginx/access.log` |
| 宝塔 vhost 主配置 | `/www/server/panel/vhost/nginx/tools.yunmiao.site.conf` |
| 宝塔 vhost 反代(我们控制) | `/www/server/panel/vhost/nginx/extension/tools.yunmiao.site/00-miao-toolbox.conf` |
| 宝塔 well-known(SSL 验证) | `/www/server/panel/vhost/nginx/well-known/tools.yunmiao.site/` |
| 宝塔 SSL 证书 | `/www/server/panel/vhost/cert/tools.yunmiao.site/` |
| MySQL 数据卷 | `miao-toolbox_mysql-data` |
| Redis 数据卷 | `miao-toolbox_redis-data` |

## 13. 回滚方案

```bash
ssh yunmiao@yunmiao.site
cd /opt/miao-toolbox

# 停服务(数据保留)
docker compose -f docker-compose.prod.yml down

# 停服务 + 删数据(危险!所有用户数据丢失)
# docker compose -f docker-compose.prod.yml down -v

# 移除宝塔 vhost
sudo rm /www/server/panel/vhost/nginx/tools.yunmiao.site.conf
sudo nginx -s reload
```

代码回滚(回到上一个 main commit):

```bash
# 找到上一个稳定版本
git log --oneline | head -5

# 临时回滚(不修改历史)
git reset --hard <commit-sha>
docker compose -f docker-compose.prod.yml build api web
docker compose -f docker-compose.prod.yml up -d
```
