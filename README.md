# 阿渺工具箱 (Miao Toolbox)

> 自托管的 AI 工具集成门户。一次登录即可访问翻译、文生图、文生语音等独立 AI 工具。

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

```bash
# 启动 MySQL 和 Redis
docker compose -f docker-compose.dev.yml up -d

# 验证
docker ps
docker exec miao-redis redis-cli -a miao_redis_dev ping   # 应返回 PONG
docker exec miao-mysql mysqladmin ping -h localhost -u miao -pmiao_dev  # 应返回 mysqld is alive
```

> MySQL 和 Redis 的数据分别存储在 `mysql-data` 和 `redis-data` 两个 Docker volume 中，容器重启数据不丢失。

### 3. 启动后端

```bash
cd miao-toolbox-api
./mvnw spring-boot:run
```

应用启动后：

- API 地址：`http://localhost:8080`
- Swagger 文档：`http://localhost:8080/swagger-ui/index.html`
- 健康检查：`http://localhost:8080/actuator/health`

Spring Boot Docker Compose 集成会自动检测已运行的容器，无需手动连接。

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
# 启动服务
docker compose -f docker-compose.dev.yml up -d

# 重启 Redis（修改密码后）
docker compose -f docker-compose.dev.yml up -d redis

# 查看日志
docker compose -f docker-compose.dev.yml logs -f

# 停止并清理
docker compose -f docker-compose.dev.yml down

# 清理数据（谨慎）
docker compose -f docker-compose.dev.yml down -v
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
- [x] 管理员后台（用户管理、权限管理）
- [x] 调用日志审计
- [x] 自定义用户限流策略
- [x] 用户禁用/启用
- [ ] AI 工具集成（翻译、文生图等）

## License

MIT
