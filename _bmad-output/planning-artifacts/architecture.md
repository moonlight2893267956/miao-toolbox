---
stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8]
inputDocuments:
  - prds/prd-miao-toolbox-2026-06-06/prd.md
  - ux-designs/ux-miao-toolbox-2026-06-07/DESIGN.md
  - ux-designs/ux-miao-toolbox-2026-06-07/EXPERIENCE.md
  - ux-designs/ux-miao-toolbox-2026-06-07/reconcile-prd.md
  - ux-designs/ux-miao-toolbox-2026-06-07/review-consistency.md
  - ux-designs/ux-miao-toolbox-2026-06-07/.decision-log.md
  - prds/prd-miao-toolbox-2026-06-06/.decision-log.md
workflowType: 'architecture'
lastStep: 8
status: 'complete'
completedAt: '2026-06-07'
project_name: 'miao-toolbox'
user_name: 'Wuxiangyi'
date: '2026-06-07'
---

# Architecture Decision Document

_This document builds collaboratively through step-by-step discovery. Sections are appended as we work through each architectural decision together._

## 项目上下文分析

### 需求概览

**功能需求（19 个 FR，5 个领域）：**

| 领域 | FR 编号 | 架构影响 |
|---|---|---|
| 用户认证 | FR-1, FR-2, FR-3 | JWT 基础设施、OAuth 流程、会话存储、中间件鉴权 |
| 接口防护 | FR-4, FR-5, FR-6, FR-7, FR-8, FR-19 | 网关过滤器链、限流器、Nonce 存储（Redis）、CORS 配置、密钥保险箱 |
| AI 代理层 | FR-9, FR-10, FR-11 | 代理路由引擎、输入净化器、错误包装器、调用日志器 |
| 工具接入框架 | FR-12, FR-13, FR-14 | 插件注册表、执行管道（责任链模式）、YAML schema 解析器、动态表单渲染器 |
| 管理监控 | FR-15, FR-16, FR-17, FR-18 | 审计日志存储、仪表盘聚合查询、用户管理 CRUD、管理员角色 RBAC |

**非功能需求：**

- **安全性：** JWT 轮换、HMAC-SHA256 请求签名、滑动窗口限流、服务端密钥托管、Prompt 注入防御、错误细节脱敏、输入净化、CORS 白名单强制执行
- **性能：** 限流不得增加 >10ms 请求延迟；仪表盘查询在小团队 30 天日志量下需 <2s 返回
- **可靠性：** Token 刷新需无缝（用户不可感知中断）；工具执行失败需保留用户输入以便重试
- **可访问性：** 所有响应式 Web 表面需达到 WCAG 2.2 AA
- **可扩展性：** 工具注册须声明式（YAML 配置，无需改代码）；管道中间件须可插拔，支持未来的日志/审计/配额阶段

**规模与复杂度：**

- 主要领域：全栈 Web 应用（Spring Boot API + React SPA）
- 复杂度等级：中等 — 用户量小（<10 人）但安全面显著、插件架构有设计复杂度
- 预估架构组件数：12–15（6–8 个后端服务/模块、4–5 个前端功能模块、2 个基础设施组件）

### 技术约束与依赖

| 约束 | 值 | 架构后果 |
|---|---|---|
| 后端 | Spring Boot | 过滤器链处理贯穿式关注点；Spring Security 处理认证 |
| 前端 | React + Ant Design 6 | ConfigProvider 主题系统；自定义 darkAlgorithm 注入品牌色 |
| 数据库 | MySQL | 关系型 schema 存储用户、工具、审计日志；此规模无需 NoSQL |
| 缓存 | Redis（隐含） | 防重放 nonce 存储；限流计数器；会话 token 元数据 |
| 部署 | Docker Compose | 多容器：api、web、mysql、redis；内部网络隔离服务 |
| 前端域名 | 与 API 分离 | 需 CORS 配置；JWT 通过 httpOnly cookie 或 Authorization header 传递 |
| OAuth | GitHub（v1） | OAuth2 客户端配置；用户创建/关联流程 |
| HTTPS | Let's Encrypt | TLS 终止在反向代理（Nginx）层 |

### 贯穿式关注点

1. **认证与授权** — 所有业务 API 端点需 JWT 校验。管理员端点需角色检查。实现方式：Spring Security 过滤器链 + 方法级 `@PreAuthorize`。
2. **速率限制** — 双维度（认证用户按用户限流，未认证按 IP 限流）。必须在业务逻辑前执行。实现方式：Redis 滑动窗口，作为网关过滤器应用。
3. **请求防重放** — 所有写操作请求须携带时间戳 + nonce + HMAC 签名。实现方式：Redis nonce 存储（带 TTL），签名校验过滤器。
4. **审计日志** — 所有 AI 工具调用和管理操作须记录。实现方式：AOP 拦截器或管道阶段，异步写入审计表。
5. **错误脱敏** — 所有错误响应须隐藏内部细节（堆栈、上游错误码、数据库错误）。实现方式：全局 `@ControllerAdvice` 异常处理器，统一错误格式。
6. **CORS 强制执行** — 基于白名单的来源验证。实现方式：Spring CORS 配置，按环境设定允许的来源。
7. **输入校验** — 大小限制、HTML 转义、文件类型白名单、基础注入检测。实现方式：请求体校验过滤器 + 工具执行管道中的 schema 校验。

## Starter 模板评估

### 主要技术领域

全栈 Web 应用（Spring Boot 4 后端 API + React 19 前端 SPA），基于项目需求分析。

### Starter 选项评估

#### 后端：Spring Initializr

Spring Boot 项目无第三方 starter 可选——官方 Spring Initializr 是唯一推荐方式。关键决策在于版本和依赖选择。

**版本选择分析：**

| 选项 | 版本 | 评估 |
|---|---|---|
| Spring Boot 3.5.x | 3.5.14 | ❌ OSS 支持于 2026-06-30 结束，新项目不适用 |
| Spring Boot 4.0.x | 4.0.6 | ✅ 当前 GA 分支，Spring Framework 7，长期支持 |
| Spring Boot 4.1.x | 4.1.0-M4 | ❌ 仍为 milestone，生产环境不推荐 |

**依赖选择分析：**

| Initializr 依赖 | 是否需要 | 理由 |
|---|---|---|
| Spring Web | ✅ | REST API 基础 |
| Spring Security | ✅ | JWT 认证 + 角色授权 |
| Spring Data JPA | ✅ | MySQL 数据访问 |
| MySQL Driver | ✅ | 数据库连接 |
| Spring Data Redis | ✅ | 限流计数器、nonce 存储、会话元数据 |
| Spring Validation | ✅ | 请求参数校验 |
| Lombok | ✅ | 减少 Java 样板代码 |
| Docker Compose Support | ✅ | 开发环境自动启动容器 |
| Spring Actuator | ✅ | 健康检查与监控端点 |

**需额外添加的依赖（不在 Initializr 中）：**

| 依赖 | 用途 |
|---|---|
| jjwt (io.jsonwebtoken) | JWT 令牌签发与解析 |
| springdoc-openapi | API 文档自动生成 |

#### 前端：Vite + React + TypeScript

Vite 6 是当前 React 项目的标准构建工具，CRA 已废弃。使用 `create-vite` 脚手架初始化。

**选项分析：**

| 选项 | 评估 |
|---|---|
| Create React App | ❌ 已停止维护，不推荐 |
| Vite 6 + React + TypeScript | ✅ 标准选择，HMR 极速，原生 TS 支持 |
| Next.js | ❌ SSR/Routing 框架，本项目是 SPA + 独立后端 API，不需要 |
| Remix | ❌ 同上，全栈框架，不适合前后端分离架构 |

**需额外安装的依赖：**

| 依赖 | 用途 |
|---|---|
| antd (6.x) | UI 组件库 |
| @ant-design/icons | 图标库 |
| react-router-dom | 客户端路由 |
| axios | HTTP 客户端 |
| dayjs | 日期处理（antd 依赖） |

### 选定方案

#### 后端：Spring Boot 4.0.x + Java 21

**初始化命令：**

```bash
# 通过 Spring Initializr (https://start.spring.io)
# 或使用 cURL + unzip
curl https://start.spring.io/starter.zip \
  -d type=maven-project \
  -d language=java \
  -d bootVersion=4.0.6 \
  -d javaVersion=21 \
  -d groupId=com.miao \
  -d artifactId=miao-toolbox-api \
  -d name=miao-toolbox-api \
  -d packageName=com.miao.toolbox \
  -d dependencies=web,security,data-jpa,mysql,data-redis,validation,lombok,docker-compose,actuator \
  -o miao-toolbox-api.zip && unzip miao-toolbox-api.zip -d miao-toolbox-api
```

#### 前端：Vite 6 + React 19 + TypeScript + Ant Design 6

**初始化命令：**

```bash
npm create vite@latest miao-toolbox-web -- --template react-ts
cd miao-toolbox-web
npm install antd@^6 @ant-design/icons react-router-dom axios dayjs
```

### Starter 提供的架构决策

**语言与运行时：**
- 后端：Java 21 LTS（Virtual Threads 支持、成熟生态）
- 前端：TypeScript（类型安全、IDE 支持优秀）
- 构建：Maven（后端）、Vite 6（前端）

**UI 组件体系：**
- Ant Design 6 + ConfigProvider 主题定制
- 自定义 darkAlgorithm 注入品牌色 token（`#5C4FD0` / `#A29BFE` 等）
- 仅品牌层覆盖：`colorPrimary`、强调色、展示排版、自定义组件

**数据访问：**
- Spring Data JPA + Hibernate（ORM）
- Spring Data Redis（缓存/限流/nonce）

**安全基础：**
- Spring Security 过滤器链
- JWT（jjwt 库）— access token + refresh token 轮换

**开发体验：**
- Vite HMR（毫秒级前端热更新）
- Spring Boot DevTools（后端自动重启）
- Docker Compose Support（开发环境一键启动 MySQL + Redis）
- springdoc-openapi（API 文档自动生成）

**注意：** 使用这些命令初始化项目应是第一个实现故事。

## 核心架构决策

### 决策优先级分析

**关键决策（阻塞实现）：**

| 决策 | 选择 | 理由 |
|---|---|---|
| JWT 传递方式 | Authorization Header + httpOnly refresh cookie | Access token 短命（15min），XSS 窗口极小，避免 CSRF 复杂度 |
| 用户禁用即时生效 | Redis 状态缓存 + DB 回退 | 已有 Redis 基础设施，缓存命中率高，避免每请求查库 |
| API 风格 | RESTful API | Spring MVC 原生支持，v1 无复杂查询需求 |

**重要决策（塑造架构）：**

| 决策 | 选择 | 理由 |
|---|---|---|
| 数据迁移 | Flyway | SQL 脚本直观，Spring Boot 原生集成，MySQL 单库够用 |
| 缓存范围 | 仅基础用途（nonce/限流/session） | <10 用户无需查询缓存，仪表盘直接查库 |
| 请求签名密钥 | 登录响应返回 signingKey | 与 JWT 解耦，sessionStorage 页面关闭自动清除 |
| API 路径 | `/api/...`（无版本前缀） | v1 无版本化需求，后续变更再引入 |
| 前端状态管理 | React Context + useReducer | v1 状态简单，无需外部库 |
| 前端项目结构 | 按功能模块 | 与 UX IA 页面映射清晰，模块自包含 |

**推迟决策（Post-MVP）：**

| 决策 | 推迟理由 |
|---|---|
| 查询缓存层 | 用户量增长后再引入 |
| API 版本化 | v1 是唯一版本，无需版本前缀 |
| CI/CD 管道 | v1 手动部署即可，稳定后再引入 GitHub Actions |
| 微服务拆分 | v1 单体足够，用户量增长后再评估 |
| Token 黑名单全量方案 | v1 仅注销标记 + Redis 缓存，规模增长后引入 |

### 数据架构

| 决策 | 选择 | 版本 | 理由 |
|---|---|---|---|
| 数据库 | MySQL | 8.x | 用户决策，Docker Compose 部署 |
| ORM | Spring Data JPA + Hibernate | Starter 内置 | Spring Boot 4.0 默认 |
| 数据迁移 | Flyway | Starter 内置 | SQL 脚本版本化，Spring Boot 原生支持 |
| 连接池 | HikariCP | Starter 内置 | Spring Boot 默认，性能优异 |
| 缓存 | Redis | 7.x | 仅用于 nonce 存储、限流计数器、用户状态缓存、session 元数据 |
| 缓存策略 | 基础用途 | — | v1 用户量小，数据库查询不缓存，仪表盘直接查库 |

### 认证与安全

| 决策 | 选择 | 理由 |
|---|---|---|
| Access Token 传递 | `Authorization: Bearer xxx` Header | 短命 token（15min），XSS 窗口极小，避免 CSRF |
| Refresh Token 存储 | httpOnly cookie（7 天有效期） | 防 XSS 窃取，自动随请求发送 |
| Token 签发 | jjwt 库 | Spring Boot JWT 生态主流选择 |
| Refresh Token 轮换 | 每次刷新后旧 token 失效 | PRD FR-3 要求 |
| 并发会话限制 | 最多 5 个有效 refresh token | PRD FR-3 要求，Redis 存储计数 |
| 用户禁用即时生效 | Redis 缓存用户状态 + DB 回退 | 禁用时写 Redis 标记，鉴权过滤器先查 Redis |
| 请求签名密钥 | 登录响应返回 signingKey | 前端存 sessionStorage，HMAC-SHA256 签名 |
| 密码存储 | bcrypt 加盐哈希 | PRD 决策日志确认 |
| GitHub OAuth | Spring Security OAuth2 Client | Starter 内置 |
| CORS | Spring CORS 配置 + 白名单 | 按环境设定允许的来源 |
| HTTPS | Nginx TLS 终止 + Let's Encrypt | 生产环境强制 |

### API 与通信模式

| 决策 | 选择 | 理由 |
|---|---|---|
| API 风格 | RESTful API | Spring MVC 原生支持，标准 HTTP 方法 |
| API 路径 | `/api/...`（无版本前缀） | v1 无版本化需求 |
| 统一错误响应 | `{"code", "message", "requestId"}` | 前端统一处理 + 错误脱敏 |
| AI 代理通信 | 同步 HTTP | PRD 明确 v1 不做异步回调 |
| API 文档 | springdoc-openapi | 自动生成 Swagger UI |
| 限流 | Redis 滑动窗口 | 用户维度 60/min + IP 维度 10/min |
| 防重放 | Redis nonce + HMAC 签名验证 | 时间窗口 5 分钟，nonce 去重 |

### 前端架构

| 决策 | 选择 | 理由 |
|---|---|---|
| 状态管理 | React Context + useReducer | v1 状态简单（用户信息、主题、侧栏），无需外部库 |
| 路由 | React Router v7 | 成熟稳定，antd 集成案例丰富 |
| 项目结构 | 按功能模块 | `src/modules/{auth,tools,admin}/`，与 UX IA 映射清晰 |
| HTTP 客户端 | 统一 axios 实例 | baseURL + 拦截器（JWT 附加、错误处理、token 刷新） |
| 主题系统 | Ant Design 6 ConfigProvider + 自定义 darkAlgorithm | 注入品牌色 token（`#5C4FD0` / `#A29BFE` 等） |
| 暗色模式 | `prefers-color-scheme` 默认 + 手动切换 | 自定义 darkAlgorithm 扩展，精确品牌色值 |
| 响应式断点 | antd lg/md/sm（992/768px） | 与 UX 规格一致 |
| 构建工具 | Vite 6 | HMR 极速，原生 TypeScript 支持 |

### 基础设施与部署

| 决策 | 选择 | 理由 |
|---|---|---|
| 容器编排 | Docker Compose（4 容器） | api、web、mysql、redis |
| 反向代理 | Nginx | 静态文件 + API 代理 + TLS 终止 |
| 环境配置 | Spring profiles + .env 文件 | `application-{dev,prod}.yml` + Docker Compose `.env` |
| 密钥管理 | 环境变量注入（.env / Docker secrets） | 不硬编码，PRD FR-8 要求 |
| CI/CD | 暂不设置 | v1 手动 Docker Compose 部署 |
| 日志 | Spring Boot 默认 + 文件输出 | Docker 日志收集，审计日志存 MySQL |

### 决策影响分析

**实现顺序：**

1. 项目初始化（Spring Initializr + Vite 脚手架）
2. Docker Compose 开发环境（MySQL + Redis 容器）
3. Flyway 初始迁移（用户表、工具表、审计日志表）
4. Spring Security + JWT 认证过滤器链
5. 统一错误处理器 + CORS 配置
6. 限流 + 防重放过滤器
7. AI 代理层 + 工具注册/执行管道
8. 前端认证流程（登录页 + token 管理）
9. 前端功能模块（工具列表、工具操作、管理后台）
10. Nginx 反向代理 + TLS 配置

**跨组件依赖：**

- JWT 认证 ←→ 限流（需用户 ID）、←→ 审计日志（需用户 ID）、←→ 用户禁用（Redis 状态缓存）
- AI 代理层 ←→ 工具执行管道（责任链）、←→ 限流（管道前置）、←→ 审计日志（管道后置）
- 前端 axios 拦截器 ←→ token 刷新流程、←→ 统一错误格式、←→ 限流 429 处理
- Nginx ←→ CORS 配置、←→ 前端 SPA 路由（history API fallback）

## 实现模式与一致性规则

### 识别的潜在冲突点

共 **7 大类、28 个** AI agent 可能做出不同选择的领域。

### 命名模式

**数据库命名（MySQL）：**

| 规则 | 约定 | 示例 |
|---|---|---|
| 表名 | snake_case，复数 | `users`、`tools`、`audit_logs` |
| 列名 | snake_case | `user_id`、`created_at`、`is_enabled` |
| 主键 | `id` | 统一用 `id`，不用 `user_id` 作主键 |
| 外键列 | `{关联表单数}_id` | `user_id`、`tool_id` |
| 外键约束 | `fk_{当前表}_{关联表}` | `fk_audit_logs_users` |
| 索引 | `idx_{表名}_{列名}` | `idx_users_username`、`idx_audit_logs_created_at` |
| 布尔列 | `is_` 前缀 | `is_enabled`、`is_admin` |
| 时间列 | `_at` 后缀 | `created_at`、`updated_at` |

**API 命名：**

| 规则 | 约定 | 示例 |
|---|---|---|
| REST 端点 | kebab-case，复数名词 | `/api/users`、`/api/audit-logs` |
| 子资源 | 嵌套路径 | `/api/users/{id}/sessions` |
| 查询参数 | camelCase | `?pageSize=10&sortBy=createdAt` |
| 路径参数 | camelCase | `/api/tools/{toolId}` |
| 自定义请求头 | `X-` 前缀 | `X-Timestamp`、`X-Signature`、`X-Nonce` |

**后端代码命名（Java）：**

| 规则 | 约定 | 示例 |
|---|---|---|
| 类名 | PascalCase | `UserController`、`JwtAuthFilter` |
| 方法名 | camelCase | `findByUsername`、`validateToken` |
| 常量 | UPPER_SNAKE_CASE | `MAX_REFRESH_TOKENS`、`TOKEN_EXPIRY_MINUTES` |
| 包结构 | 按功能模块 | `com.miao.toolbox.auth`、`com.miao.toolbox.tool` |
| Entity | `{名词}` 无后缀 | `User`、`Tool`、`AuditLog` |
| Repository | `{Entity}Repository` | `UserRepository`、`ToolRepository` |
| Service | `{Entity}Service` | `UserService`、`ToolService` |
| Controller | `{Entity}Controller` | `UserController`、`ToolController` |
| DTO | `{动作}{实体}Request/Response` | `LoginRequest`、`ToolExecuteResponse` |
| Filter | `{功能}Filter` | `RateLimitFilter`、`AntiReplayFilter` |

**前端代码命名（TypeScript/React）：**

| 规则 | 约定 | 示例 |
|---|---|---|
| 组件文件 | PascalCase.tsx | `ToolCard.tsx`、`AdminDashboard.tsx` |
| 非组件文件 | camelCase.ts | `authService.ts`、`axiosInstance.ts` |
| 组件名 | PascalCase | `ToolCard`、`AdminStatCard` |
| 函数/变量 | camelCase | `fetchTools`、`isDarkMode` |
| 常量 | UPPER_SNAKE_CASE | `API_BASE_URL`、`TOKEN_KEY` |
| 自定义 Hook | `use` 前缀 | `useAuth`、`useTheme` |
| 类型/接口 | PascalCase | `ToolConfig`、`UserProfile` |
| CSS 类名 | kebab-case（antd token 优先） | `tool-card`、`sidebar-nav` |
| 模块目录 | kebab-case | `src/modules/tool-operation/` |

### 结构模式

**后端项目组织：**

```
com.miao.toolbox/
├── config/           # Spring 配置类（Security、Redis、CORS）
├── auth/             # 认证模块
│   ├── controller/
│   ├── service/
│   ├── repository/
│   ├── entity/
│   ├── dto/
│   └── filter/
├── tool/             # 工具模块
│   ├── controller/
│   ├── service/
│   ├── repository/
│   ├── entity/
│   ├── dto/
│   └── pipeline/     # 执行管道（责任链）
├── admin/            # 管理模块
│   ├── controller/
│   ├── service/
│   ├── repository/
│   ├── entity/
│   └── dto/
├── proxy/            # AI 代理层
│   ├── service/
│   └── client/       # 各 AI 服务的 HTTP 客户端
├── common/           # 跨模块共享
│   ├── exception/    # 自定义异常 + 全局异常处理器
│   ├── response/     # 统一响应格式
│   ├── util/         # 工具类
│   └── constant/     # 常量定义
└── ToolboxApplication.java
```

**前端项目组织：**

```
src/
├── modules/
│   ├── auth/         # 登录/注册/个人设置
│   │   ├── components/
│   │   ├── pages/
│   │   ├── services/   # API 调用
│   │   └── types/      # TypeScript 类型
│   ├── tools/        # 工具列表/工具操作
│   │   ├── components/
│   │   ├── pages/
│   │   ├── services/
│   │   └── types/
│   └── admin/        # 管理后台
│       ├── components/
│       ├── pages/
│       ├── services/
│       └── types/
├── shared/           # 跨模块共享
│   ├── components/   # 通用组件（AppLayout、ThemeSwitcher）
│   ├── hooks/        # 通用 Hook（useAuth、useTheme）
│   ├── services/     # axios 实例、API 基础
│   ├── types/        # 通用类型（ApiResponse、User）
│   └── utils/        # 工具函数
├── theme/            # Ant Design 主题配置
│   ├── brandTokens.ts  # 品牌色 token 定义
│   └── darkAlgorithm.ts # 自定义暗色算法
├── routes/           # 路由配置
│   └── index.tsx
├── App.tsx
└── main.tsx
```

**测试位置：**

| 层 | 位置 | 示例 |
|---|---|---|
| 后端单元测试 | `src/test/java/` 镜像 `src/main/java/` 结构 | `auth/service/UserServiceTest.java` |
| 后端集成测试 | `src/test/java/` 同包，`*IT.java` 后缀 | `auth/controller/AuthControllerIT.java` |
| 前端测试 | 与源文件同目录，`*.test.tsx` | `ToolCard.test.tsx` |

### 格式模式

**API 响应格式：**

成功响应：
```json
{
  "code": "SUCCESS",
  "data": { ... },
  "requestId": "uuid"
}
```

分页响应：
```json
{
  "code": "SUCCESS",
  "data": {
    "items": [...],
    "total": 100,
    "page": 1,
    "pageSize": 20
  },
  "requestId": "uuid"
}
```

错误响应：
```json
{
  "code": "ERROR_CODE",
  "message": "用户友好的错误描述（中文）",
  "requestId": "uuid"
}
```

**错误码体系：**

| 前缀 | 含义 | 示例 |
|---|---|---|
| `AUTH_` | 认证相关 | `AUTH_TOKEN_EXPIRED`、`AUTH_LOGIN_FAILED` |
| `RATE_` | 限流相关 | `RATE_LIMIT_EXCEEDED` |
| `TOOL_` | 工具相关 | `TOOL_NOT_FOUND`、`TOOL_DISABLED`、`TOOL_EXECUTION_FAILED` |
| `USER_` | 用户相关 | `USER_DISABLED`、`USER_LOCKED` |
| `VALIDATION_` | 校验相关 | `VALIDATION_FAILED` |
| `SYSTEM_` | 系统相关 | `SYSTEM_ERROR`、`SYSTEM_MAINTENANCE` |

**数据交换格式：**

| 规则 | 约定 |
|---|---|
| JSON 字段命名 | camelCase（前后端统一） |
| 日期时间 | ISO 8601（`2026-06-07T15:30:00Z`） |
| 布尔值 | `true`/`false`（不用 0/1） |
| 空值 | 省略字段（不用 `null`） |
| 枚举 | 字符串（不用数字） |

### 通信模式

**前端状态管理：**

| 模式 | 规则 |
|---|---|
| 全局状态 | AuthContext（用户信息、登录状态）、ThemeContext（暗色/亮色模式） |
| 局部状态 | `useState` 管理页面内状态（表单、筛选条件） |
| 服务端状态 | 不缓存——每次进入页面重新请求，依赖 axios 缓存控制头 |
| 状态更新 | 不可变更新（spread operator / immer 如后续需要） |

**Context 组织：**

```
<ConfigProvider>       ← Ant Design 主题
  <AuthProvider>       ← 用户认证状态
    <ThemeProvider>    ← 暗色/亮色模式
      <AppRoutes />    ← 路由
    </ThemeProvider>
  </AuthProvider>
</ConfigProvider>
```

### 流程模式

**错误处理：**

| 层 | 模式 |
|---|---|
| 后端全局 | `@ControllerAdvice` 捕获所有异常 → 统一错误响应格式 |
| 后端业务 | 抛出自定义异常（`AuthException`、`ToolException`）→ 全局处理器转换 |
| 前端全局 | axios 响应拦截器捕获 401/403/429/5xx → 统一处理 |
| 前端页面 | `try/catch` + antd Message 展示用户友好错误 |
| 前端表单 | antd Form 内联校验 + `aria-live="polite"` 通知 |

**加载状态：**

| 场景 | 模式 |
|---|---|
| 页面首次加载 | antd Skeleton 占位 |
| 按钮提交 | 按钮 `loading` 属性（防止重复提交） |
| 后台操作 | antd Spin 全局或区域遮罩 |
| 工具执行中 | 提交按钮 loading + 结果区 Spin |

**认证流程：**

```
前端 axios 请求拦截器：
1. 从内存获取 access token → 附加到 Authorization header
2. 请求失败 401 → 尝试 refresh token（httpOnly cookie 自动发送）
3. refresh 成功 → 用新 access token 重试原请求
4. refresh 失败 → 清除本地状态 → 重定向到登录页（携带来源路径）

前端路由守卫：
1. 未登录访问受保护页面 → 重定向到登录页
2. 登录后 → 跳转到原目标页或工具列表
3. 管理员路由 → 检查角色，非管理员重定向到工具列表
```

### 执行指南

**所有 AI Agent 必须遵守：**

1. **命名一致** — 严格遵循上述命名约定，不发明新风格
2. **响应格式一致** — 所有 API 返回统一 `{code, data/message, requestId}` 格式
3. **错误码规范** — 使用前缀分类的错误码，不使用裸 HTTP 状态码描述错误
4. **安全管道** — 新增 API 端点必须在 Spring Security 过滤器链中注册，不绕过认证
5. **工具注册** — 新增工具通过 YAML 配置注册，不硬编码路由
6. **主题纪律** — 不覆盖 antd 默认组件样式，品牌色仅通过 ConfigProvider token 注入
7. **中文界面** — 所有用户可见文案使用中文，错误消息使用中文
8. **审计追踪** — AI 工具调用和管理操作必须记录审计日志
9. **类型安全** — 前端 API 调用必须有 TypeScript 类型定义

**反模式（禁止）：**

| 反模式 | 为什么禁止 |
|---|---|
| 在 Controller 中写鉴权逻辑 | 鉴权属于过滤器链，不与业务耦合 |
| 自行加密/解密 AI API Key | 密钥仅通过环境变量注入，代码中不触碰 |
| 裸返回异常堆栈给前端 | 违反错误脱敏原则 |
| 直接操作 antd 组件内部 CSS | 违反品牌纪律，主题变更时不可控 |
| 在 localStorage 存储敏感信息 | access token 存内存，refresh token 用 httpOnly cookie |
| 新增工具时修改 Java 路由代码 | 工具通过 YAML 注册，代码不感知具体工具 |

## 项目结构与边界

### 完整项目目录结构

```
miao-toolbox/
├── docker-compose.yml
├── .env.example
├── .gitignore
├── README.md
│
├── miao-toolbox-api/                    # 后端 Spring Boot 项目
│   ├── pom.xml
│   ├── Dockerfile
│   ├── .env                             # 本地开发环境变量（gitignored）
│   ├── src/
│   │   ├── main/
│   │   │   ├── java/com/miao/toolbox/
│   │   │   │   ├── ToolboxApplication.java
│   │   │   │   │
│   │   │   │   ├── config/              # Spring 配置类
│   │   │   │   │   ├── SecurityConfig.java        # Spring Security 过滤器链配置
│   │   │   │   │   ├── RedisConfig.java           # Redis 连接与序列化配置
│   │   │   │   │   ├── CorsConfig.java            # CORS 白名单配置
│   │   │   │   │   ├── JacksonConfig.java         # JSON 序列化配置（日期格式、命名策略）
│   │   │   │   │   └── OpenApiConfig.java         # springdoc-openapi 配置
│   │   │   │   │
│   │   │   │   ├── auth/               # 认证模块（FR-1, FR-2, FR-3, FR-19）
│   │   │   │   │   ├── controller/
│   │   │   │   │   │   └── AuthController.java        # 登录/注册/刷新/注销端点
│   │   │   │   │   ├── service/
│   │   │   │   │   │   ├── AuthService.java            # 认证业务逻辑
│   │   │   │   │   │   ├── JwtService.java             # JWT 签发/解析/验证
│   │   │   │   │   │   └── OAuthService.java           # GitHub OAuth 流程
│   │   │   │   │   ├── repository/
│   │   │   │   │   │   ├── UserRepository.java
│   │   │   │   │   │   └── RefreshTokenRepository.java
│   │   │   │   │   ├── entity/
│   │   │   │   │   │   ├── User.java                  # 用户实体（含角色、状态）
│   │   │   │   │   │   └── RefreshToken.java          # Refresh token 实体
│   │   │   │   │   ├── dto/
│   │   │   │   │   │   ├── LoginRequest.java
│   │   │   │   │   │   ├── LoginResponse.java
│   │   │   │   │   │   ├── RegisterRequest.java
│   │   │   │   │   │   └── OAuthCallbackRequest.java
│   │   │   │   │   └── filter/
│   │   │   │   │       └── JwtAuthFilter.java          # JWT 校验 + 用户状态 Redis 缓存检查
│   │   │   │   │
│   │   │   │   ├── tool/               # 工具模块（FR-11, FR-12, FR-13, FR-14）
│   │   │   │   │   ├── controller/
│   │   │   │   │   │   └── ToolController.java        # 工具列表 + 工具执行端点
│   │   │   │   │   ├── service/
│   │   │   │   │   │   ├── ToolService.java            # 工具注册表 + 执行调度
│   │   │   │   │   │   └── ToolConfigLoader.java       # YAML 配置加载与解析
│   │   │   │   │   ├── repository/
│   │   │   │   │   │   └── ToolRepository.java
│   │   │   │   │   ├── entity/
│   │   │   │   │   │   └── Tool.java                  # 工具实体（元数据 + 状态）
│   │   │   │   │   ├── dto/
│   │   │   │   │   │   ├── ToolExecuteRequest.java
│   │   │   │   │   │   ├── ToolExecuteResponse.java
│   │   │   │   │   │   └── ToolConfig.java            # YAML 映射的配置对象
│   │   │   │   │   └── pipeline/                      # 工具执行管道（责任链）
│   │   │   │   │       ├── ToolPipeline.java           # 管道编排器
│   │   │   │   │       ├── PipelineContext.java        # 管道上下文（请求、响应、元数据）
│   │   │   │   │       └── PipelineStage.java          # 管道阶段接口
│   │   │   │   │
│   │   │   │   ├── admin/              # 管理模块（FR-15, FR-16, FR-17, FR-18）
│   │   │   │   │   ├── controller/
│   │   │   │   │   │   ├── AdminDashboardController.java  # 仪表盘统计端点
│   │   │   │   │   │   ├── AdminToolController.java       # 工具管理端点
│   │   │   │   │   │   ├── AdminLogController.java        # 调用日志端点
│   │   │   │   │   │   └── AdminUserController.java       # 用户管理端点
│   │   │   │   │   ├── service/
│   │   │   │   │   │   ├── DashboardService.java          # 仪表盘聚合查询
│   │   │   │   │   │   └── UserAdminService.java         # 用户禁用/限流管理
│   │   │   │   │   ├── repository/
│   │   │   │   │   │   └── AuditLogRepository.java
│   │   │   │   │   ├── entity/
│   │   │   │   │   │   └── AuditLog.java               # 审计日志实体
│   │   │   │   │   └── dto/
│   │   │   │   │       ├── DashboardStatsResponse.java
│   │   │   │   │       ├── LogQueryRequest.java
│   │   │   │   │       └── UserActionRequest.java
│   │   │   │   │
│   │   │   │   ├── proxy/             # AI 代理层（FR-8, FR-9, FR-10）
│   │   │   │   │   ├── service/
│   │   │   │   │   │   └── AiProxyService.java         # AI 请求代理 + 密钥注入
│   │   │   │   │   └── client/
│   │   │   │   │       └── AiServiceClient.java         # 通用 AI 服务 HTTP 客户端
│   │   │   │   │
│   │   │   │   └── common/            # 跨模块共享
│   │   │   │       ├── exception/
│   │   │   │       │   ├── BusinessException.java       # 业务异常基类
│   │   │   │       │   ├── AuthException.java
│   │   │   │       │   ├── RateLimitException.java
│   │   │   │       │   ├── ToolException.java
│   │   │   │       │   └── GlobalExceptionHandler.java  # @ControllerAdvice 统一处理
│   │   │   │       ├── response/
│   │   │   │       │   ├── ApiResponse.java             # 统一响应包装
│   │   │   │       │   └── PagedResponse.java           # 分页响应包装
│   │   │   │       ├── util/
│   │   │   │       │   ├── RequestIdGenerator.java      # requestId 生成
│   │   │   │       │   └── HmacUtil.java                # HMAC-SHA256 签名工具
│   │   │   │       └── constant/
│   │   │   │           ├── ErrorCode.java               # 错误码常量
│   │   │   │           └── RedisKey.java                # Redis key 前缀常量
│   │   │   │
│   │   │   └── resources/
│   │   │       ├── application.yml                     # 主配置
│   │   │       ├── application-dev.yml                 # 开发环境配置
│   │   │       ├── application-prod.yml                # 生产环境配置
│   │   │       ├── tools/                              # 工具 YAML 配置目录
│   │   │       │   └── _example-tool.yaml              # 工具配置示例
│   │   │       └── db/migration/                       # Flyway 迁移脚本
│   │   │           ├── V1__create_users_table.sql
│   │   │           ├── V2__create_tools_table.sql
│   │   │           ├── V3__create_audit_logs_table.sql
│   │   │           └── V4__create_refresh_tokens_table.sql
│   │   │
│   │   └── test/java/com/miao/toolbox/
│   │       ├── auth/
│   │       │   ├── service/UserServiceTest.java
│   │       │   └── controller/AuthControllerIT.java
│   │       ├── tool/
│   │       │   ├── service/ToolServiceTest.java
│   │       │   └── pipeline/ToolPipelineTest.java
│   │       ├── admin/
│   │       │   └── service/DashboardServiceTest.java
│   │       └── common/
│   │           └── response/ApiResponseTest.java
│   │
│   └── docker-compose.dev.yml           # 开发环境 Docker Compose（MySQL + Redis）
│
├── miao-toolbox-web/                    # 前端 React 项目
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   ├── index.html
│   ├── Dockerfile
│   ├── nginx.conf                       # 生产 Nginx 配置
│   ├── public/
│   │   └── favicon.ico
│   └── src/
│       ├── main.tsx                     # 入口
│       ├── App.tsx                      # 根组件（Provider 嵌套 + 路由）
│       ├── vite-env.d.ts
│       │
│       ├── modules/
│       │   ├── auth/                    # 认证模块
│       │   │   ├── components/
│       │   │   │   ├── LoginForm.tsx
│       │   │   │   ├── RegisterForm.tsx
│       │   │   │   └── OAuthButton.tsx
│       │   │   ├── pages/
│       │   │   │   └── LoginPage.tsx
│       │   │   ├── services/
│       │   │   │   └── authService.ts   # 登录/注册/刷新 API
│       │   │   └── types/
│       │   │       └── auth.ts          # LoginRequest/Response 类型
│       │   │
│       │   ├── tools/                   # 工具模块
│       │   │   ├── components/
│       │   │   │   ├── ToolCard.tsx      # 品牌紫工具卡片
│       │   │   │   ├── ToolList.tsx      # 工具列表网格
│       │   │   │   └── ToolForm.tsx      # YAML 驱动的动态表单
│       │   │   ├── pages/
│       │   │   │   ├── ToolListPage.tsx  # 工具列表页
│       │   │   │   └── ToolOperationPage.tsx  # 工具操作页
│       │   │   ├── services/
│       │   │   │   └── toolService.ts
│       │   │   └── types/
│       │   │       └── tool.ts
│       │   │
│       │   └── admin/                   # 管理后台模块
│       │       ├── components/
│       │       │   ├── AdminStatCard.tsx # 管理统计卡片
│       │       │   ├── LogTable.tsx      # 调用日志表格
│       │       │   └── UserActionMenu.tsx # 用户操作菜单
│       │       ├── pages/
│       │       │   ├── DashboardPage.tsx
│       │       │   ├── ToolManagePage.tsx
│       │       │   ├── LogPage.tsx
│       │       │   └── UserManagePage.tsx
│       │       ├── services/
│       │       │   └── adminService.ts
│       │       └── types/
│       │           └── admin.ts
│       │
│       ├── shared/                      # 跨模块共享
│       │   ├── components/
│       │   │   ├── AppLayout.tsx         # 侧栏 + 内容区布局
│       │   │   ├── SidebarNav.tsx        # 侧栏导航
│       │   │   ├── UserDropdown.tsx      # 头像下拉菜单
│       │   │   └── ThemeSwitcher.tsx     # 暗色/亮色切换
│       │   ├── hooks/
│       │   │   ├── useAuth.ts            # 认证状态 + token 管理
│       │   │   └── useTheme.ts           # 主题模式管理
│       │   ├── services/
│       │   │   └── axiosInstance.ts      # 统一 axios 实例 + 拦截器
│       │   ├── types/
│       │   │   └── api.ts               # ApiResponse、PagedResponse、User 类型
│       │   └── utils/
│       │       ├── requestSigner.ts      # HMAC 请求签名
│       │       └── tokenStorage.ts       # access token 内存存储
│       │
│       ├── theme/                       # Ant Design 主题
│       │   ├── brandTokens.ts           # 品牌色 token 定义（亮色 + 暗色）
│       │   └── darkAlgorithm.ts         # 自定义 darkAlgorithm 扩展
│       │
│       └── routes/
│           └── index.tsx                # React Router 路由配置 + 守卫
│
└── deploy/                              # 部署配置
    ├── docker-compose.yml               # 生产 Docker Compose（4 容器）
    ├── nginx/
    │   └── nginx.conf                   # 生产 Nginx 配置（TLS + 反向代理）
    └── .env.example                     # 生产环境变量模板
```

### 架构边界

**API 边界：**

| 边界 | 端点范围 | 鉴权要求 | 说明 |
|---|---|---|---|
| 公开端点 | `POST /api/auth/login`、`POST /api/auth/register`、`POST /api/auth/oauth/callback` | 无（IP 限流） | 登录/注册不需要 JWT |
| Token 刷新 | `POST /api/auth/refresh` | httpOnly cookie | 自动携带 refresh token |
| 用户端点 | `GET /api/users/me`、`PUT /api/users/me` | JWT + 用户本人 | 个人设置 |
| 工具端点 | `GET /api/tools`、`POST /api/tools/{toolId}/execute` | JWT + 用户角色 | 工具列表 + 执行 |
| 管理端点 | `/api/admin/**` | JWT + 管理员角色 | 仪表盘、日志、用户管理 |

**组件边界：**

| 边界 | 职责 | 通信方式 |
|---|---|---|
| 前端模块 ↔ 后端 API | 数据获取/提交 | REST HTTP（axios） |
| 前端模块 ↔ 前端模块 | 无直接通信 | 共享 AuthContext + ThemeContext |
| 后端模块 ↔ 后端模块 | 服务调用 | Spring 依赖注入（Service 层方法调用） |
| 后端 ↔ 第三方 AI | AI 请求代理 | 同步 HTTP（AiProxyService） |
| 后端 ↔ Redis | 限流/nonce/缓存 | Spring Data Redis |

**数据边界：**

| 边界 | 访问方式 | 说明 |
|---|---|---|
| MySQL | Repository 层（JPA） | 唯一数据访问入口，禁止绕过 Repository |
| Redis | Service 层（RedisTemplate） | 限流计数器、nonce 存储、用户状态缓存 |
| 第三方 AI | AiProxyService | 唯一 AI 调用入口，密钥注入在此完成 |
| 审计日志 | AuditLogRepository + AOP | 管道阶段或 AOP 拦截器写入，不手动插入 |

### 需求到结构映射

**FR 类别映射：**

| FR 类别 | 后端模块 | 前端模块 | 数据库表 | Flyway |
|---|---|---|---|---|
| 用户认证（FR-1/2/3/19） | `auth/` | `modules/auth/` | `users`、`refresh_tokens` | V1, V4 |
| 接口防护（FR-4/5/6/7/8） | `config/` + `auth/filter/` + `common/` | `shared/services/` | — | — |
| AI 代理层（FR-9/10/11） | `proxy/` | — | — | — |
| 工具接入（FR-12/13/14） | `tool/` + `resources/tools/` | `modules/tools/` | `tools` | V2 |
| 管理监控（FR-15/16/17/18） | `admin/` | `modules/admin/` | `audit_logs` | V3 |

**贯穿式关注点映射：**

| 关注点 | 后端位置 | 前端位置 |
|---|---|---|
| JWT 认证 | `auth/filter/JwtAuthFilter.java` | `shared/hooks/useAuth.ts` + `shared/services/axiosInstance.ts` |
| 速率限制 | `config/SecurityConfig.java`（过滤器注册） | `shared/services/axiosInstance.ts`（429 拦截） |
| 防重放 | `common/util/HmacUtil.java` | `shared/utils/requestSigner.ts` |
| 审计日志 | `tool/pipeline/` + `admin/entity/AuditLog.java` | — |
| 错误脱敏 | `common/exception/GlobalExceptionHandler.java` | `shared/services/axiosInstance.ts`（错误拦截） |
| CORS | `config/CorsConfig.java` | — |
| 输入校验 | Spring Validation + `tool/pipeline/` | antd Form 校验 |

### 集成点

**内部通信：**

```
前端 → [axios HTTPS] → Nginx → [反向代理] → Spring Boot API
                                            ├── auth/ → MySQL + Redis
                                            ├── tool/ → proxy/ → 第三方 AI
                                            └── admin/ → MySQL
```

**外部集成：**

| 集成 | 方向 | 协议 | 配置 |
|---|---|---|---|
| GitHub OAuth | 前端 → GitHub → 后端回调 | HTTPS OAuth2 | `application-*.yml` |
| AI 服务 | 后端 → 第三方 API | HTTPS REST | 环境变量（API Key） |
| Let's Encrypt | Nginx ↔ ACME | HTTPS | certbot 定时续签 |

**数据流（工具执行）：**

```
用户提交 → ToolForm → axios（签名+JWT）→ Nginx → Spring Boot
  → JwtAuthFilter（验证）→ RateLimitFilter（限流）→ AntiReplayFilter（防重放）
  → ToolController → ToolPipeline
    → 参数校验 → AiProxyService（注入密钥→转发请求→包装响应）→ 审计日志
  ← 统一响应格式 ← GlobalExceptionHandler（异常转换）
← axios 拦截器（错误处理）← ToolForm（结果展示）
```

## 架构验证结果

### 一致性验证 ✅

**决策兼容性：**

| 检查项 | 结果 | 说明 |
|---|---|---|
| Spring Boot 4.0 + Java 21 | ✅ | SB4 要求 Java 17+，Java 21 是 LTS，完全兼容 |
| Spring Boot 4.0 + MySQL 8 | ✅ | Spring Data JPA + MySQL Driver 原生支持 |
| Spring Boot 4.0 + Redis 7 | ✅ | Spring Data Redis 原生支持 |
| React 19 + Ant Design 6 | ✅ | antd 6 最低 React 18，原生支持 React 19 |
| Vite 6 + React 19 + TS | ✅ | Vite 模板直接支持 |
| JWT + Redis 状态缓存 | ✅ | 无矛盾，JwtAuthFilter 先校验 token 再查 Redis 用户状态 |
| Flyway + MySQL 8 | ✅ | Spring Boot 原生集成 |
| Docker Compose + 4 容器 | ✅ | 内部网络通信，无版本冲突 |

**模式一致性：**

| 检查项 | 结果 | 说明 |
|---|---|---|
| 命名约定跨层一致 | ✅ | DB snake_case、API kebab-case + camelCase、Java camelCase、TS camelCase — 各层遵循各自语言惯例 |
| 响应格式一致 | ✅ | 后端 `ApiResponse` 统一包装，前端 axios 拦截器统一解析 |
| 错误处理一致 | ✅ | 后端 `@ControllerAdvice` → 前端拦截器 → antd Message，全链路一致 |
| 结构模式与技术栈对齐 | ✅ | 后端按功能模块分包（Spring 惯例），前端按功能模块分目录（React 惯例） |

**结构对齐：**

| 检查项 | 结果 | 说明 |
|---|---|---|
| 项目结构支持所有决策 | ✅ | 每个决策都有对应的文件/目录 |
| 边界定义清晰 | ✅ | API 边界、组件边界、数据边界均已定义 |
| 集成点结构化 | ✅ | 内部通信、外部集成、数据流均已映射 |

### 需求覆盖验证 ✅

**功能需求覆盖：**

| FR | 架构支持 | 后端位置 | 前端位置 |
|---|---|---|---|
| FR-1 账密注册/登录 | ✅ | `auth/` 完整模块 | `modules/auth/` |
| FR-2 GitHub OAuth | ✅ | `auth/service/OAuthService.java` | `modules/auth/components/OAuthButton.tsx` |
| FR-3 会话管理 | ✅ | `auth/entity/RefreshToken.java` + Redis 并发计数 | `shared/hooks/useAuth.ts` + token 刷新 |
| FR-4 HTTPS | ✅ | Nginx TLS 终止 | — |
| FR-5 API 网关鉴权 | ✅ | `auth/filter/JwtAuthFilter.java` | axios 拦截器 401 处理 |
| FR-6 速率限制 | ✅ | `config/SecurityConfig.java` + Redis 滑动窗口 | axios 429 拦截 → antd Notification |
| FR-7 请求防重放 | ✅ | `common/util/HmacUtil.java` + Redis nonce | `shared/utils/requestSigner.ts` |
| FR-8 AI 密钥托管 | ✅ | `proxy/service/AiProxyService.java` | — |
| FR-9 错误信息安全 | ✅ | `common/exception/GlobalExceptionHandler.java` | — |
| FR-10 输入安全校验 | ✅ | Spring Validation + `tool/pipeline/` | antd Form 校验 |
| FR-11 AI 请求代理 | ✅ | `proxy/` 完整模块 | — |
| FR-12 工具注册协议 | ✅ | `tool/service/ToolConfigLoader.java` + YAML | — |
| FR-13 工具执行管道 | ✅ | `tool/pipeline/` 完整管道 | `modules/tools/components/ToolForm.tsx` |
| FR-14 工具管理界面 | ✅ | `admin/controller/AdminToolController.java` | `modules/admin/pages/ToolManagePage.tsx` |
| FR-15 调用日志 | ✅ | `admin/entity/AuditLog.java` + AOP | `modules/admin/pages/LogPage.tsx` |
| FR-16 管理仪表盘 | ✅ | `admin/controller/AdminDashboardController.java` | `modules/admin/pages/DashboardPage.tsx` |
| FR-17 异常处置 | ✅ | `admin/service/UserAdminService.java` + Redis | `modules/admin/components/UserActionMenu.tsx` |
| FR-18 管理员角色 | ✅ | `auth/entity/User.java` (role 字段) + `@PreAuthorize` | 路由守卫 |
| FR-19 CORS 校验 | ✅ | `config/CorsConfig.java` | — |

**19/19 FR 全部覆盖。** ✅

**非功能需求覆盖：**

| NFR | 覆盖 | 说明 |
|---|---|---|
| 安全性 | ✅ | JWT + HMAC + 限流 + 密钥托管 + 错误脱敏 + CORS + bcrypt — 完整安全栈 |
| 性能 | ✅ | Redis 限流 <10ms、仪表盘直接查库 <2s（<10 用户规模）、HikariCP 连接池 |
| 可靠性 | ✅ | Token 静默刷新（axios 拦截器）、工具执行失败保留输入 |
| 可访问性 | ✅ | antd 内建 ARIA + 品牌组件 aria 属性 + `aria-live` + WCAG AA 对比度 |
| 可扩展性 | ✅ | YAML 工具注册 + 责任链管道 + Spring profiles |

### 实现就绪验证 ✅

**决策完整性：** 所有关键决策已记录版本和理由 ✅
**结构完整性：** 完整目录树 + 每个文件有明确职责 ✅
**模式完整性：** 命名、结构、格式、通信、流程模式全覆盖 ✅

### 差距分析

**重要差距（非阻塞，但建议补充）：**

| # | 差距 | 严重度 | 建议 |
|---|---|---|---|
| G1 | Flyway 迁移脚本内容未定义 | 重要 | 需在第一个实现故事中定义 V1-V4 的 SQL |
| G2 | 工具 YAML 配置格式示例未定义 | 重要 | 需在 ToolConfigLoader 实现时定义 schema |
| G3 | Redis key 命名前缀未具体化 | 重要 | 需在 RedisKey 常量类中定义（如 `miao:nonce:`、`miao:ratelimit:`、`miao:user:status:`） |
| G4 | 环境变量清单未列出 | 重要 | 需在 `.env.example` 中定义所有必需变量 |

**次要差距（可推迟）：**

| # | 差距 | 说明 |
|---|---|---|
| G5 | API 端点完整清单 | 可在实现时由 Controller 定义自然生成 |
| G6 | 数据库 ER 图 | 表结构简单（4 张表），可在 Flyway 脚本中体现 |
| G7 | 前端路由完整配置 | 可在 routes/index.tsx 实现时定义 |

### 架构完整性清单

**需求分析**
- [x] 项目上下文全面分析
- [x] 规模与复杂度评估
- [x] 技术约束识别
- [x] 贯穿式关注点映射

**架构决策**
- [x] 关键决策已记录版本
- [x] 技术栈完全指定
- [x] 集成模式已定义
- [x] 性能考虑已处理

**实现模式**
- [x] 命名约定已建立
- [x] 结构模式已定义
- [x] 通信模式已指定
- [x] 流程模式已记录

**项目结构**
- [x] 完整目录结构已定义
- [x] 组件边界已建立
- [x] 集成点已映射
- [x] 需求到结构映射已完成

### 架构就绪评估

**总体状态：** ✅ 可以实施（有小差距，不阻塞实现）

**信心水平：** 高

**关键优势：**
- 安全面完整——19 个 FR 全部有架构支持，安全管道贯穿式设计
- 工具扩展性——YAML 注册 + 责任链管道，新增工具零代码改动
- 一致性保证——命名/格式/错误处理/主题全链路统一
- 版本前瞻——Spring Boot 4.0 + Ant Design 6 + React 19，无技术债

**后续增强方向：**
- CI/CD 管道（稳定运行后引入 GitHub Actions）
- 查询缓存层（用户量增长后）
- Token 黑名单全量方案（规模增长后）
- 微信 OAuth（获取企业资质后）
- 异步 AI 调用 + 回调（长耗时 AI 任务场景）

### 实现交接

**AI Agent 指南：**
- 严格按照本文档的架构决策实现
- 所有实现模式保持一致——命名、格式、错误处理
- 尊重项目结构和边界定义
- 遇到架构问题时参考本文档，不自行发明方案

**首个实现优先级：**
1. Spring Initializr + Vite 脚手架初始化
2. Docker Compose 开发环境（MySQL + Redis）
3. Flyway V1-V4 迁移脚本 + `.env.example` + Redis key 常量
4. Spring Security + JWT 认证过滤器链
5. 统一错误处理 + CORS
