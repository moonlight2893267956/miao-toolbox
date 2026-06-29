# 阿渺工具箱 (Miao Toolbox)

> 自托管的 AI 工具集成门户。一次登录即可访问翻译、文生图、文生语音等独立 AI 工具。
>
> **📖 文档**：开发/部署/运维文档见 [docs/README.md](docs/README.md)
> **📋 变更**：[CHANGELOG.md](CHANGELOG.md)

## 技术栈

| 层级 | 技术 |
|---|---|
| 后端 | Spring Boot 4.0.x + Java 21 + Maven |
| 前端 | Vite 6 + React 19 + TypeScript + Ant Design 6 |
| 数据库 | MySQL 8.x + Flyway 迁移 |
| 缓存 | Redis 7.x |
| 认证 | JWT + bcrypt + OAuth2 (GitHub / Google) |
| 部署 | Docker Compose |

## 快速开始

### 前置条件

- JDK 21+
- Node.js 20+
- Docker & Docker Compose
- Maven (或使用项目自带的 `./mvnw`)

### 1. 配置环境变量

复制模板并填写（可选，大部分已有开发默认值）：

```bash
cp .env.example .env
```

开发环境核心配置（在 `application-dev.yml` 中已有默认值，通常无需修改）：

| 变量 | 默认值 | 说明 |
|---|---|---|
| `MYSQL_URL` | `jdbc:mysql://localhost:3306/miao_toolbox` | 数据库连接 |
| `MYSQL_USER` | `miao` | 数据库用户 |
| `MYSQL_PASSWORD` | `miao_dev` | 数据库密码 |
| `REDIS_HOST` | `localhost` | Redis 地址 |
| `REDIS_PORT` | `6379` | Redis 端口 |
| `REDIS_PASSWORD` | `miao_redis_dev` | Redis 密码 |
| `JWT_SECRET` | `dev-only-...` | JWT 签名密钥 |
| `CORS_ALLOWED_ORIGINS` | `http://localhost:5173` | 前端地址 |

OAuth2 配置（可选，不配置时登录页面不显示对应按钮）：

| 变量 | 说明 |
|---|---|
| `GITHUB_CLIENT_ID` | GitHub OAuth App Client ID |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth App Client Secret |
| `GOOGLE_CLIENT_ID` | Google OAuth Client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth Client Secret |

### 2. 启动依赖服务

> MySQL 和 Redis 由兄弟项目 `miao-infra` 统一提供,本仓库不再编排。

```bash
# 一次性:克隆 miao-infra(放在 miao-toolbox 同级目录)
cd ..
git clone <miao-infra-repo-url> miao-infra
cd miao-infra && docker compose up -d

# 验证
docker ps --format '{{.Names}}' | grep -E '^(miao-mysql|miao-redis)$'
docker exec miao-redis redis-cli -a miao_redis_dev ping   # 应返回 PONG
docker exec miao-mysql mysqladmin ping -h localhost -u miao -pmiao_dev  # 应返回 mysqld is alive
```

> 数据卷归 miao-infra 管理(`miao-infra_mysql-data` / `miao-infra_redis-data`),跨项目共享。

### 3. 启动后端

```bash
cd miao-toolbox-api
./mvnw spring-boot:run
```

应用启动后：

- API 地址：`http://localhost:8080`
- Swagger 文档：`http://localhost:8080/swagger-ui/index.html`
- 健康检查：`http://localhost:8080/actuator/health`

后端通过 `localhost:3306` / `localhost:6379` 连 miao-infra 暴露的端口(在 `application-dev.yml` 默认值)。

### 4. 启动前端

```bash
cd miao-toolbox-web
npm install
npm run dev
```

前端地址：`http://localhost:5173`

开发模式下 Vite 自动代理 `/api` 请求到后端 `http://localhost:8080`，无需配置跨域。

### 5. 登录

默认管理员账号：

| 用户名 | 密码 |
|---|---|
| `admin` | `Admin123` |

首次登录会提示修改密码。

## 目录结构

```
miao-toolbox/
├── miao-toolbox-api/          # Spring Boot 后端
│   ├── src/main/java/         # Java 源码
│   ├── src/main/resources/    # 配置 + Flyway 迁移
│   └── pom.xml
├── miao-toolbox-web/          # React 前端
│   ├── src/                   # TypeScript 源码
│   ├── vite.config.ts         # Vite 配置
│   └── package.json
├── docker-compose.dev.yml     # 开发环境 Docker 编排
└── .env.example               # 环境变量模板
```

## 常用命令

### 后端

```bash
# 启动开发服务器
cd miao-toolbox-api
./mvnw spring-boot:run

# 运行测试
./mvnw test

# 运行单个测试
./mvnw test -Dtest=UserManageServiceTest

# 数据库迁移（Flyway 会在启动时自动执行）
./mvnw flyway:migrate
```

### 前端

```bash
# 启动开发服务器
cd miao-toolbox-web
npm run dev

# 生产构建
npm run build

# 类型检查
npm run typecheck

# 代码检查
npm run lint
```

### Docker

```bash
# 启动依赖服务(由 miao-infra 提供,见上文 §2)
cd ../miao-infra && docker compose up -d

# 可选:在容器里跑 API(验证与生产一致的网络栈,默认 profile=containerized)
docker compose -f docker-compose.dev.yml --profile containerized up -d --build api
docker logs -f miao-toolbox-api-dev
docker compose -f docker-compose.dev.yml --profile containerized down
```

## 配置说明

### 后端 Profile 机制

| Profile | 用途 | 密钥处理 |
|---|---|---|
| `dev` | 开发环境默认值 | 环境变量占位符，带默认值 |
| `local` | 本地密钥覆盖（可选） | 明文写入，不提交到 Git |
| `prod` | 生产环境 | 环境变量无默认值 |

默认激活 `dev,local`，可通过 `SPRING_PROFILES_ACTIVE` 覆盖。

### 跨域配置

开发环境 CORS 默认允许 `http://localhost:5173`，通过 `CORS_ALLOWED_ORIGINS` 环境变量修改。

## 功能列表

- [x] 用户注册、登录、JWT 认证
- [x] OAuth2 登录（GitHub / Google）
- [x] Token 刷新与注销
- [x] 防重放攻击（HMAC-SHA256 签名 + Nonce）
- [x] 滑动窗口限流
- [x] 自定义用户限流策略
- [x] 用户禁用/启用
- [x] 管理员后台（用户管理、权限管理、仪表盘）
- [x] 文本对比工具（左右双栏 + 语法高亮 + 代码格式化）
- [x] AI 工具集成：miao-ai 平台对接（diff-explainer agent）
- [x] AI 调用记录（`ai_invocations` 表 + 仪表盘 + 调用日志）

## License

MIT

## 文档导航

| 我想... | 看哪份 |
|---|---|
| 跑起来开发环境 | [docs/README.md](docs/README.md) → 给所有人 |
| 改后端/前端代码 | [AGENTS.md](AGENTS.md) + [CLAUDE.md](CLAUDE.md) |
| 理解系统架构 | [docs/architecture.md](docs/architecture.md) |
| 部署到生产 | [docs/deployment.md](docs/deployment.md) |
| 日常运维/排查 | [docs/operations.md](docs/operations.md) + [docs/troubleshooting.md](docs/troubleshooting.md) |
| 看版本变更 | [CHANGELOG.md](CHANGELOG.md) |
