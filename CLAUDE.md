# CLAUDE.md

本文档为 Claude Code (claude.ai/code) 在此仓库中工作时提供指导。

**语言要求：所有 AI 对话及文档产出必须使用中文。**

## 项目概述

**阿渺工具箱** — 自托管的 AI 工具集成门户。用户一次登录即可访问翻译、文生图、文生语音等独立 AI 工具。所有 AI 调用均通过服务端代理层转发，保护密钥安全并实现访问控制。

## 技术栈

| 层级 | 技术 |
|---|---|
| 后端 | Spring Boot 4.0.x + Java 21 + Maven |
| 前端 | Vite 6 + React 19 + TypeScript + Ant Design 6 |
| 数据库 | MySQL 8.x + Flyway 迁移 |
| 缓存 | Redis 7.x |
| 认证 | JWT (jjwt) + bcrypt + HMAC-SHA256 请求签名 |
| UI 状态 | React Context + useReducer |
| HTTP 客户端 | axios（拦截器实现 token 刷新与签名） |
| 部署 | Docker Compose (api, web, mysql, redis, nginx) |

## 项目结构

```
miao-toolbox/
├── miao-toolbox-api/         # Spring Boot 后端
│   ├── src/main/java/com/miao/toolbox/
│   │   ├── config/           # 安全、CORS、Redis 配置
│   │   ├── auth/             # JWT、OAuth、认证过滤器链
│   │   ├── gateway/          # 限流、防重放、CORS 过滤器
│   │   ├── proxy/            # AI 请求代理层
│   │   ├── tool/             # 工具注册与执行管道
│   │   ├── admin/            # 管理后台与用户管理
│   │   └── common/           # 错误处理、DTO、工具类
│   └── src/main/resources/
│       ├── db/migration/     # Flyway 数据库迁移脚本
│       ├── tools/            # 工具 YAML 配置文件
│       └── application.yml
└── miao-toolbox-web/         # React 前端
    └── src/
        ├── modules/
        │   ├── auth/         # 登录、注册、OAuth 回调
        │   ├── tools/        # 工具列表与操作页面
        │   └── admin/        # 仪表盘、用户管理、工具管理
        ├── services/         # Axios 实例、API 客户端
        ├── contexts/         # AuthContext、ThemeContext、SidebarContext
        └── components/       # 共享 UI 组件
```

## 架构要点

- **安全优先设计**：所有 AI API Key 仅存在于服务端。除登录/注册/刷新外，每个 API 请求依次经过 JWT 认证 → 限流 → 防重放 → 参数校验，才到达业务逻辑。
- **工具执行管道（责任链模式）**：每个工具通过 YAML 配置注册。所有工具调用流经同一管道：认证 → 限流 → 参数校验 → AI 代理 → 审计日志。
- **JWT 刷新轮换**：Access token（15 分钟）通过 `Authorization: Bearer` 头传递。Refresh token（7 天）存储在 httpOnly cookie 中。每次刷新轮换 token，最多 5 个并发会话。
- **用户状态缓存**：管理员禁用用户时，状态写入 Redis。认证过滤器优先查 Redis，回退到数据库。无需等待 JWT 过期。
- **请求防重放**：每个请求携带 HMAC-SHA256 签名（使用会话级 signingKey），以及时间戳和 nonce（Redis 中存储，TTL 5 分钟）。

## 核心 API 路由

| 路由 | 认证 | 描述 |
|---|---|---|
| `POST /api/auth/register` | 无需 | 用户注册 |
| `POST /api/auth/login` | 无需 | 账密登录 |
| `GET /api/auth/oauth/github` | 无需 | GitHub OAuth 入口 |
| `POST /api/auth/refresh` | 无需 | Token 刷新 |
| `POST /api/auth/logout` | 需要 | 注销 |
| `POST /api/tools/{toolId}/execute` | 需要 | 执行 AI 工具 |
| `GET /api/tools` | 需要 | 获取可用工具列表 |
| `GET /api/admin/**` | 管理员 | 仪表盘、用户管理、工具管理 |

## 开发命令

```bash
# 后端
cd miao-toolbox-api
./mvnw spring-boot:run                    # 启动开发服务器
./mvnw test                               # 运行全部测试
./mvnw test -Dtest=SomeTest#method        # 运行单个测试
./mvnw flyway:migrate                     # 运行数据库迁移

# 前端
cd miao-toolbox-web
npm run dev                               # 启动 Vite 开发服务器 (端口 5173)
npm run build                             # 生产构建
npm run lint                              # ESLint 检查
npm run typecheck                         # TypeScript 类型检查

# 完整环境
docker compose up -d                      # 启动 mysql + redis + api + web
```

## 实现顺序（来自架构文档）

1. 项目初始化（Spring Initializr + Vite 脚手架）
2. Docker Compose 开发环境（MySQL + Redis）
3. Flyway 初始迁移（用户表、工具表、审计日志表）
4. Spring Security + JWT 认证过滤器链
5. 统一错误处理器 + CORS 配置
6. 限流 + 防重放过滤器
7. AI 代理层 + 工具注册/执行管道
8. 前端认证流程（登录页 + token 管理）
9. 前端功能模块（工具列表、工具操作、管理后台）
10. Nginx 反向代理 + TLS 配置

## 关键设计决策

- **API 无版本前缀**（`/api/...` 而非 `/api/v1/...`）— v1 是唯一版本，后续有需要再引入
- **Access token 放请求头，Refresh token 放 httpOnly cookie** — 缩小 XSS 窗口，同时避免 CSRF 复杂度
- **登录响应返回 signingKey** — 前端存 sessionStorage（关闭标签页自动清除），与 JWT 生命周期解耦
- **仪表盘直接查库** — v1 用户量 < 10，无需数据仓库或查询缓存
- **工具通过 YAML 注册** — v1 不提供 UI 动态注册