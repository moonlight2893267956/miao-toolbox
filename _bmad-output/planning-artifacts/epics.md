---
stepsCompleted: [1, 2, 3, 4]
inputDocuments:
  - prds/prd-miao-toolbox-2026-06-06/prd.md
  - architecture.md
  - ux-designs/ux-miao-toolbox-2026-06-07/DESIGN.md
  - ux-designs/ux-miao-toolbox-2026-06-07/EXPERIENCE.md
---

# 阿渺工具箱 - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for 阿渺工具箱, decomposing the requirements from the PRD, UX Design if it exists, and Architecture requirements into implementable stories.

## Requirements Inventory

### Functional Requirements

FR-1: 账密注册与登录 — 用户可通过用户名+密码注册账号并登录。密码不少于8位且包含字母和数字。登录成功颁发 JWT access token + httpOnly refresh token。连续5次登录失败锁定账号15分钟。
FR-2: 第三方 OAuth 登录 — 用户可通过 GitHub OAuth 登录。首次 OAuth 登录自动创建本地账号。已有账密账号可绑定 GitHub。
FR-3: 会话管理与安全 — Access token 有效期15分钟，refresh token 有效期7天。Refresh token 轮换：每次刷新后旧 token 立即失效。单用户最多5个有效 refresh token，超出则最旧的失效。支持手动注销。禁用用户时通过鉴权中间件实时校验数据库状态。
FR-4: 统一 API 网关鉴权 — 所有业务 API 请求必须携带有效 JWT，网关层统一校验，未认证请求返回401。静态资源请求不经过鉴权。
FR-5: 速率限制 — 认证用户每分钟最多60次请求（可配置）。未认证请求按 IP 维度每分钟最多10次请求。超出返回429，响应头包含 Retry-After。限流基于滑动窗口算法。
FR-6: 请求防重放 — 请求必须携带 X-Timestamp 和 X-Signature（HMAC-SHA256）。时间戳与服务器时间偏差超过5分钟拒绝。相同 timestamp+nonce 的请求在窗口内只处理一次。
FR-7: CORS 与来源校验 — CORS 白名单仅包含已配置的前端域名。生产环境禁止 Access-Control-Allow-Origin: *。
FR-8: AI 密钥服务端托管 — 所有第三方 AI 服务的 API Key 仅存在于服务端环境变量或加密配置中，永不暴露给前端。
FR-9: AI 请求代理 — 前端仅调用 /api/tools/{toolId}/execute 统一入口。后端根据 toolId 路由到对应 AI 服务，注入密钥，转发请求。AI 服务原始错误码被后端统一包装。代理层记录每次调用信息。
FR-10: 输入安全校验 — 请求体大小限制：文本类≤10KB，文件类≤20MB（可配置）。文件类型白名单校验。输入内容经过 HTML 转义。AI 输出 XSS 过滤。
FR-11: 工具注册协议 — 工具配置包含：ID、名称、描述、图标、参数 schema、AI 服务类型、路由路径。工具注册后自动出现在用户可见的工具列表中。未注册的工具路径不可访问。
FR-12: 工具执行管道 — 所有工具调用走同一管道：认证→限流→参数校验→AI代理→结果返回。参数校验基于工具声明的 schema 自动执行。管道各环节可插拔。
FR-13: 工具管理界面 — 管理后台展示工具列表（名称、状态、近期调用量）。管理员可启用/禁用工具。v1 工具注册通过配置文件完成。
FR-14: 调用日志 — 日志包含：时间、用户 ID、工具 ID、请求摘要、响应状态、耗时、token 消耗。日志保留至少30天。日志不可被普通用户访问。日志脱敏。
FR-15: 管理仪表盘 — 展示今日总调用量、各工具调用量分布、近期异常请求趋势。展示当前在线用户数、速率限制触发次数。v1 数据来自直接查询日志表。
FR-16: 异常处置 — 管理员可禁用指定用户账号，禁用后该用户所有 token 立即失效。管理员可对指定用户设置更严格的限流策略。处置操作本身被记录在审计日志中。
FR-17: HTTPS 传输加密 — 生产环境强制 HTTPS，TLS 终止在 Nginx 层。
FR-18: 管理员角色定义 — 管理员角色通过用户表 role 字段标识。管理员端点通过 @PreAuthorize 权限校验。管理入口仅管理员可见。
FR-19: 错误信息安全 — 所有错误响应隐藏内部细节（堆栈、上游错误码、数据库错误）。统一错误响应格式 {"code", "message", "requestId"}。

### NonFunctional Requirements

NFR-1: 安全性 — JWT 轮换、HMAC-SHA256 请求签名、滑动窗口限流、服务端密钥托管、错误细节脱敏、输入净化、CORS 白名单强制执行、bcrypt 加盐哈希密码存储
NFR-2: 性能 — 限流不得增加>10ms 请求延迟；仪表盘查询在小团队30天日志量下需<2s返回
NFR-3: 可靠性 — Token 刷新需无缝（用户不可感知中断）；工具执行失败需保留用户输入以便重试
NFR-4: 可访问性 — 所有响应式 Web 表面需达到 WCAG 2.2 AA
NFR-5: 可扩展性 — 工具注册须声明式（YAML 配置，无需改代码）；管道中间件须可插拔

### Additional Requirements

- ARCH-1: 项目初始化 — 使用 Spring Initializr (Spring Boot 4.0.6 + Java 21) 初始化后端项目；使用 Vite 6 + React 19 + TypeScript 初始化前端项目。这是第一个实现故事。
- ARCH-2: Docker Compose 开发环境 — MySQL 8.x + Redis 7.x 容器，docker-compose.dev.yml 配置，Spring Boot Docker Compose Support 自动启动
- ARCH-3: Flyway 数据迁移 — V1 users 表、V2 tools 表、V3 audit_logs 表、V4 refresh_tokens 表
- ARCH-4: Redis 用途 — nonce 存储（防重放）、限流计数器（滑动窗口）、用户状态缓存（禁用即时生效）、session 元数据
- ARCH-5: JWT 认证 — Access token 通过 Authorization Header 传递（15min 有效期），Refresh token 通过 httpOnly cookie 传递（7d 有效期），jjwt 库签发/解析
- ARCH-6: 用户禁用即时生效 — Redis 缓存用户状态 + DB 回退，鉴权过滤器先查 Redis
- ARCH-7: 请求签名密钥 — 登录响应返回 signingKey，前端存 sessionStorage，用于 HMAC-SHA256 签名
- ARCH-8: RESTful API — 路径 /api/... 无版本前缀，统一响应格式 {code, data/message, requestId}
- ARCH-9: AI 代理同步 HTTP — 后端通过 AiProxyService 同步转发 AI 请求，密钥注入在此完成
- ARCH-10: 前端状态管理 — React Context + useReducer（AuthContext、ThemeContext），统一 axios 实例 + 拦截器
- ARCH-11: Ant Design 6 主题 — ConfigProvider + 自定义 darkAlgorithm 注入品牌色 token（#5C4FD0 / #A29BFE 等）
- ARCH-12: Nginx 反向代理 — 静态文件 + API 代理 + TLS 终止（Let's Encrypt）
- ARCH-13: 环境配置 — Spring profiles（application-dev.yml / application-prod.yml）+ Docker Compose .env
- ARCH-14: 错误码体系 — AUTH_ / RATE_ / TOOL_ / USER_ / VALIDATION_ / SYSTEM_ 前缀分类
- ARCH-15: 工具 YAML 配置 — 通过 resources/tools/ 目录下的 YAML 文件注册工具，ToolConfigLoader 加载解析

### UX Design Requirements

UX-DR1: 品牌色主题系统 — 实现 Ant Design 6 ConfigProvider 主题定制，注入品牌主色 #5C4FD0（亮色）/ #A29BFE（暗色），强调色 #D97020（亮色）/ #FFB07A（暗色），语义色继承 antd 默认，自定义 darkAlgorithm 扩展（非 antd 默认 darkAlgorithm）
UX-DR2: 展示排版 — 实现 display 和 display-sm 排版 token 覆盖：Noto Sans SC 字体、32px/24px 字号、700/600 字重、对应行高和字距
UX-DR3: 圆角系统 — 实现 rounded/sm(6px)、rounded/md(10px)、rounded/lg(14px)、rounded/xl(20px) 四级圆角，略圆润于 antd 默认
UX-DR4: 暗色/亮色切换 — prefers-color-scheme 媒体查询作为默认值，用户可手动覆盖，切换即时生效（200-300ms CSS transition），侧栏底部或个人设置切换入口
UX-DR5: 工具卡片组件 — 品牌紫背景、白字、rounded/lg 圆角、24px 内边距、悬停上浮2px+品牌色阴影、focus-visible 2px 品牌紫 outline、role="button"+tabindex="0"+aria-label、暗色模式悬停阴影 rgba(162,155,254,0.3)
UX-DR6: 侧栏导航组件 — antd Menu，折叠时只显示图标，展开时图标+文字，当前页高亮（品牌紫10%透明度背景+品牌紫文字+rounded/md圆角），aria-current="page"
UX-DR7: 管理统计卡片组件 — 继承 antd Card 默认外观，1px 边框，rounded/md 圆角，可点击跳转，role="button"+tabindex="0"+aria-label
UX-DR8: 响应式布局 — ≥992px 固定侧栏240px+工具列表3列+管理表格全宽；768-991px 侧栏折叠64px+工具列表2列+管理表格横向滚动；<768px 侧栏变抽屉+工具列表1列+管理表格横向滚动+筛选折叠+手机顶栏头像图标
UX-DR9: 工具操作页响应式 — ≥768px 表单水平排列；<768px 表单垂直堆叠+提交按钮全宽+结果区 word-break:break-word+复制按钮固定右上角+顶部返回按钮
UX-DR10: 登录页 — 账密登录表单 + GitHub OAuth 按钮，失败态内联提示，锁定态提示，OAuth 失败提供账密备选
UX-DR11: 工具列表页 — 页面顶部 display-sm 问候语，工具卡片网格，无可用工具时 antd Empty 提示
UX-DR12: 工具操作页通用模板 — 标题区+参数表单+提交按钮+结果展示区，YAML 配置驱动参数表单渲染
UX-DR13: 管理后台 — 仪表盘（统计卡片+异常趋势）、工具管理（启用/禁用 Switch+确认 Popconfirm）、调用日志（antd Table+筛选+分页）、用户管理（禁用 Switch+限流 Popover+角色 Dropdown）
UX-DR14: 状态模式 — 未登录重定向登录页、登录失败内联提示、工具加载 Skeleton、工具执行中按钮 loading+Spin、工具执行失败 antd Message、请求被限流 antd Notification、Token 过期静默刷新、冷启动 Skeleton 占位、表单动态错误 aria-live="polite"
UX-DR15: 个人设置 — 修改密码、绑定 GitHub、登出，通过头像下拉菜单入口
UX-DR16: 用户下拉菜单 — 桌面/平板侧栏底部头像+用户名触发，手机端顶栏右侧头像图标触发
UX-DR17: 侧栏结构 — 普通用户：工具→[工具列表]；管理员：工具→[工具列表]/管理→[仪表盘/工具管理/调用日志/用户管理]；底部头像+用户名→下拉菜单

### FR Coverage Map

FR-1: Epic 1 — 账密注册与登录
FR-2: Epic 1 — GitHub OAuth 登录
FR-3: Epic 1 — 会话管理与安全
FR-4: Epic 1 — 统一 API 网关鉴权
FR-5: Epic 1 — 速率限制
FR-6: Epic 1 — 请求防重放
FR-7: Epic 1 — CORS 与来源校验
FR-8: Epic 1 — AI 密钥服务端托管
FR-9: Epic 2 — AI 请求代理
FR-10: Epic 2 — 输入安全校验（Story 2.3b）
FR-11: Epic 2 — 工具注册协议
FR-12: Epic 2 — 工具执行管道
FR-13: Epic 2 — 工具管理界面
FR-14: Epic 3 — 调用日志
FR-15: Epic 3 — 管理仪表盘
FR-16: Epic 3 — 异常处置
FR-17: Epic 1 — HTTPS 传输加密
FR-18: Epic 1 — 管理员角色定义
FR-19: Epic 1 — 错误信息安全

## Epic List

### Epic 1: 项目基础与安全骨架
用户可以注册、登录，所有 API 请求经过统一的认证和防护管道。这是整个平台的安全基座，完成后系统具备完整的用户认证、JWT 会话管理、速率限制、防重放、CORS 防护、错误脱敏能力，前端具备品牌主题系统和暗色模式。
**FRs covered:** FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8, FR-17, FR-18, FR-19

### Epic 2: AI 工具集成框架
用户可以看到可用的 AI 工具列表，选择工具并执行操作，系统通过安全代理层调用 AI 服务并返回结果。管理员可以在后台管理工具。完成后用户可浏览工具列表、使用工具执行 AI 操作、查看结果。
**FRs covered:** FR-9, FR-10, FR-11, FR-12, FR-13

### Epic 3: 管理与监控后台
管理员可以在后台查看系统运行状态、调用日志，并对异常用户进行处置。系统可通过 Nginx + Docker Compose 部署到生产环境。完成后管理员拥有完整的系统监控和用户管理能力。
**FRs covered:** FR-14, FR-15, FR-16

## Epic 1: 项目基础与安全骨架

用户可以注册、登录，所有 API 请求经过统一的认证和防护管道。这是整个平台的安全基座，完成后系统具备完整的用户认证、JWT 会话管理、速率限制、防重放、CORS 防护、错误脱敏能力，前端具备品牌主题系统和暗色模式。

### Story 1.1: 项目初始化与开发环境搭建

作为开发者，
我想要初始化前后端项目并配置开发环境，
以便后续所有故事都有可运行的基础框架。

**Acceptance Criteria:**

**Given** 开发者获得项目仓库
**When** 执行后端初始化命令（Spring Initializr, Spring Boot 4.0.6 + Java 21 + Maven, 包含 web/security/data-jpa/mysql/data-redis/validation/lombok/docker-compose/actuator 依赖 + jjwt + springdoc-openapi 额外依赖）
**Then** 后端项目可编译并通过 `mvn compile`
**And** 执行前端初始化命令（Vite 6 + React 19 + TypeScript + antd@^6 + @ant-design/icons + react-router-dom + axios + dayjs）
**Then** 前端项目可通过 `npm run dev` 启动并访问

**Given** 开发者执行 `docker compose -f docker-compose.dev.yml up`
**When** MySQL 8.x 和 Redis 7.x 容器启动
**Then** Spring Boot 应用自动连接 MySQL 和 Redis（Docker Compose Support）
**And** 后端可通过 `http://localhost:8080/actuator/health` 返回 UP

**Given** 项目初始化完成
**When** 查看 .env.example 文件
**Then** 包含所有必需环境变量模板（数据库连接、Redis 连接、JWT 密钥、GitHub OAuth 凭据、AI API Key 占位）

### Story 1.2: 数据库 Schema 与统一响应格式

作为开发者，
我想要创建数据库表和统一 API 响应格式，
以便后续所有故事有可用的数据存储和一致的 API 接口规范。

**Acceptance Criteria:**

**Given** Flyway 迁移脚本 V1__create_users_table.sql
**When** 应用启动
**Then** 创建 users 表（id, username, password_hash, email, role ENUM('USER','ADMIN'), is_enabled, github_id, signing_key, login_fail_count, locked_until, created_at, updated_at）
**And** username 列有唯一索引，email 列有唯一索引

**Given** Flyway 迁移脚本 V4__create_refresh_tokens_table.sql
**When** 应用启动
**Then** 创建 refresh_tokens 表（id, token_hash, user_id FK, expires_at, created_at）
**And** user_id 列有索引

**Given** 统一响应格式实现（ApiResponse、PagedResponse）
**When** 任何 API 返回成功响应
**Then** 响应体为 `{"code": "SUCCESS", "data": {...}, "requestId": "uuid"}`
**When** 任何 API 返回错误响应
**Then** 响应体为 `{"code": "ERROR_CODE", "message": "中文错误描述", "requestId": "uuid"}`

**Given** ErrorCode 常量类和 RedisKey 常量类
**When** 查看代码
**Then** ErrorCode 包含 AUTH_/RATE_/TOOL_/USER_/VALIDATION_/SYSTEM_ 前缀的错误码常量
**And** RedisKey 包含 `miao:nonce:`、`miao:ratelimit:`、`miao:user:status:`、`miao:session:` 前缀常量

### Story 1.3: JWT 认证与账密登录

作为用户，
我想要通过用户名和密码注册并登录，
以便获取访问系统的凭证。

**Acceptance Criteria:**

**Given** 用户访问 `POST /api/auth/register`
**When** 提交有效用户名（≥3字符）和密码（≥8位，包含字母和数字）
**Then** 创建用户（密码 bcrypt 加盐哈希存储），返回 201
**When** 提交弱密码（纯数字或不足8位）
**Then** 返回 400 `VALIDATION_FAILED`

**Given** 用户访问 `POST /api/auth/login`
**When** 提交正确的用户名和密码
**Then** 返回 access token（JWT, 15min 有效期, Authorization Header）+ httpOnly refresh token cookie（7d 有效期）+ signingKey
**And** signingKey 存储在登录响应的 data 字段中
**When** 提交错误密码
**Then** login_fail_count +1，返回 401 `AUTH_LOGIN_FAILED`，内联提示"用户名或密码错误"
**When** 连续5次登录失败
**Then** 账号锁定15分钟，返回 403 `USER_LOCKED`，提示"账号已锁定，请15分钟后重试"

**Given** JwtAuthFilter 和 JwtService 实现
**When** 请求携带有效 JWT
**Then** 过滤器解析用户 ID 和角色，设置 SecurityContext
**When** 请求携带过期或无效 JWT
**Then** 返回 401 `AUTH_TOKEN_EXPIRED`

### Story 1.4: Token 刷新与注销

作为用户，
我想要刷新过期的 access token 和注销会话，
以便无缝使用系统和安全退出。

**Acceptance Criteria:**

**Given** 用户访问 `POST /api/auth/refresh`（httpOnly cookie 自动携带 refresh token）
**When** refresh token 有效
**Then** 签发新 access token + 新 httpOnly refresh token cookie（旧 token 立即失效，轮换）
**And** 单用户最多5个有效 refresh token，超出则最旧的失效
**When** refresh token 无效或过期
**Then** 返回 401 `AUTH_TOKEN_EXPIRED`，清除 cookie

**Given** 用户访问 `POST /api/auth/logout`
**When** 请求携带有效 refresh token cookie
**Then** 当前 session 的 refresh token 失效，清除 cookie，返回 200

**Given** 用户被管理员禁用（is_enabled = false）
**When** 该用户的请求经过 JwtAuthFilter
**Then** 过滤器查询 Redis 用户状态缓存（key: `miao:user:status:{userId}`），若缓存未命中则查 DB 并回填
**When** 用户状态为禁用
**Then** 返回 401 `USER_DISABLED`

### Story 1.5: GitHub OAuth 登录

作为用户，
我想要通过 GitHub 账号登录，
以便无需记住额外密码。

**Acceptance Criteria:**

**Given** 用户点击"使用 GitHub 登录"
**When** GitHub OAuth 授权流程完成
**Then** 回调端点 `POST /api/auth/oauth/callback` 处理授权码，获取 GitHub 用户信息
**When** 首次 GitHub 登录
**Then** 自动创建本地账号（关联 github_id），返回 access token + refresh token + signingKey
**When** 已有关联账号的 GitHub 登录
**Then** 直接返回 access token + refresh token + signingKey
**When** GitHub OAuth 授权失败
**Then** 返回 401 `AUTH_LOGIN_FAILED`，前端显示"GitHub 授权失败，请重试"并提供账密登录备选

**Given** 已登录用户访问个人设置
**When** 绑定 GitHub 账号
**Then** 当前账号关联 github_id，绑定后两种方式均可登录

### Story 1.6: 速率限制与请求防重放

作为管理员，
我想要系统对 API 请求进行速率限制和防重放校验，
以便防止盗刷和重放攻击。

**Acceptance Criteria:**

**Given** 认证用户发起请求
**When** 1分钟内请求 ≤60 次
**Then** 请求正常处理
**When** 1分钟内请求 >60 次
**Then** 返回 429 `RATE_LIMIT_EXCEEDED`，响应头包含 `Retry-After`
**And** 限流基于 Redis 滑动窗口算法（key: `miao:ratelimit:user:{userId}`）

**Given** 未认证请求到达公开端点
**When** 单 IP 1分钟内请求 >10 次
**Then** 返回 429 `RATE_LIMIT_EXCEEDED`，响应头包含 `Retry-After`
**And** 限流 key: `miao:ratelimit:ip:{ip}`

**Given** 写操作请求（POST/PUT/DELETE）
**When** 请求携带 `X-Timestamp`、`X-Nonce`、`X-Signature`
**Then** 验证时间戳偏差 ≤5分钟，签名 HMAC-SHA256 正确
**When** 相同 nonce 在窗口内重复
**Then** 返回 400 `VALIDATION_FAILED`（Redis nonce 去重，key: `miao:nonce:{nonce}`，TTL 5分钟）
**When** 时间戳偏差 >5分钟或签名不正确
**Then** 返回 400 `VALIDATION_FAILED`

### Story 1.7: CORS、错误脱敏与全局异常处理

作为开发者，
我想要系统统一处理 CORS 策略和错误响应，
以便所有 API 行为一致且安全。

**Acceptance Criteria:**

**Given** CORS 配置（CorsConfig.java）
**When** 请求来自白名单域名（配置在 application-*.yml）
**Then** 响应包含正确的 CORS 头
**When** 请求来自非白名单域名
**Then** 请求被拒绝（生产环境禁止 `Access-Control-Allow-Origin: *`）

**Given** GlobalExceptionHandler（@ControllerAdvice）
**When** 业务逻辑抛出 AuthException / RateLimitException / ToolException 等
**Then** 统一转换为 `{"code": "ERROR_CODE", "message": "中文描述", "requestId": "uuid"}` 格式
**When** 发生未预期异常（NullPointerException、DB 异常等）
**Then** 返回 500 `SYSTEM_ERROR`，不泄露堆栈、上游错误码、数据库错误

**Given** 请求到达任何 API 端点
**When** 响应返回
**Then** 响应头包含 `X-Request-Id`（由 RequestIdGenerator 生成的 UUID）

### Story 1.8: 前端品牌主题系统与布局

作为用户，
我想要看到品牌化的界面并在亮色/暗色模式间切换，
以便获得友好舒适的使用体验。

**Acceptance Criteria:**

**Given** Ant Design 6 ConfigProvider 主题配置
**When** 应用加载
**Then** 品牌主色 #5C4FD0（亮色）/ #A29BFE（暗色）替换 colorPrimary
**And** 强调色 #D97020（亮色）/ #FFB07A（暗色）注入
**And** 语义色继承 antd 默认
**And** 圆角系统：rounded/sm(6px)、rounded/md(10px)、rounded/lg(14px)、rounded/xl(20px)
**And** 展示排版：display(32px/700) 和 display-sm(24px/600)，Noto Sans SC 字体

**Given** 自定义 darkAlgorithm 实现
**When** 系统检测 `prefers-color-scheme` 媒体查询
**Then** 自动应用对应的亮色或暗色主题
**When** 用户手动切换（侧栏底部或个人设置入口）
**Then** 切换即时生效（200-300ms CSS transition），用户偏好存储到 localStorage

**Given** AppLayout 组件实现
**When** 桌面端（≥992px）
**Then** 固定侧栏 240px + 内容区 max-w-5xl(1024px)
**When** 平板端（768-991px）
**Then** 侧栏折叠为图标模式 64px
**When** 手机端（<768px）
**Then** 侧栏变为 antd Drawer，顶栏右侧显示头像图标

### Story 1.9: 前端认证流程与登录页

作为用户，
我想要在登录页完成登录并自动跳转到工具列表，
以便快速开始使用系统。

**Acceptance Criteria:**

**Given** 登录页（LoginPage.tsx）
**When** 页面加载
**Then** 显示用户名+密码输入框 + "使用 GitHub 登录"按钮
**When** 提交有效账密
**Then** 调用 `POST /api/auth/login`，存储 access token 和 signingKey 到内存（tokenStorage.ts，使用 React Context + 闭包变量，不持久化到 sessionStorage/localStorage），跳转到工具列表页
**When** 账密错误
**Then** 表单内联提示"用户名或密码错误"
**When** 账号锁定
**Then** 提示"账号已锁定，请15分钟后重试"
**When** GitHub OAuth 失败
**Then** antd Message "GitHub 授权失败，请重试"，显示账密登录备选

**Given** 统一 axios 实例（axiosInstance.ts）
**When** 请求发出
**Then** 自动附加 Authorization Header + HMAC 签名（X-Timestamp/X-Nonce/X-Signature）
**When** 收到 401
**Then** 静默尝试 `POST /api/auth/refresh`（httpOnly cookie 自动发送），成功后用新 token 重试原请求
**When** 刷新也失败
**Then** 清除本地状态，重定向到登录页（携带来源路径）

**Given** 路由守卫（routes/index.tsx）
**When** 未登录用户访问受保护页面
**Then** 重定向到登录页
**When** 登录成功
**Then** 跳转到原目标页或工具列表页

### Story 1.10: 个人设置与用户菜单

作为用户，
我想要修改密码、绑定 GitHub、切换主题和登出，
以便管理我的账户和个性化体验。

**Acceptance Criteria:**

**Given** 侧栏底部（桌面/平板）或顶栏右侧（手机）显示头像+用户名
**When** 点击头像
**Then** 下拉菜单显示：个人设置 / 暗色模式切换 / 登出

**Given** 个人设置页面
**When** 修改密码（需输入旧密码+新密码，新密码强度校验）
**Then** 调用 `PUT /api/users/me/password`，成功后 antd Message 确认
**When** 绑定 GitHub
**Then** 发起 GitHub OAuth 流程，绑定成功后显示已绑定状态

**Given** 暗色模式切换
**When** 点击切换
**Then** 即时切换主题（200-300ms CSS transition），偏好保存到 localStorage
**When** 使用键盘 Tab 切换焦点
**Then** 切换按钮有可见焦点环

## Epic 2: AI 工具集成框架

用户可以看到可用的 AI 工具列表，选择工具并执行操作，系统通过安全代理层调用 AI 服务并返回结果。管理员可以在后台管理工具。

### Story 2.1: Flyway 迁移与工具数据模型

作为开发者，
我想要创建 tools 表和 audit_logs 表，
以便工具注册和审计日志有可用的数据存储。

**Acceptance Criteria:**

**Given** Flyway 迁移脚本 V2__create_tools_table.sql
**When** 应用启动
**Then** 创建 tools 表（id, tool_id UNIQUE, name, description, icon, ai_service_type, route_path, is_enabled DEFAULT true, config_yaml TEXT, call_count DEFAULT 0, created_at, updated_at）
**And** tool_id 列有唯一索引

**Given** Flyway 迁移脚本 V3__create_audit_logs_table.sql
**When** 应用启动
**Then** 创建 audit_logs 表（id, user_id FK, tool_id, request_summary, response_status, duration_ms, token_consumption, created_at）
**And** created_at 列有索引，tool_id 列有索引，user_id 列有索引

### Story 2.2: 工具 YAML 配置与注册协议

作为开发者，
我想要通过 YAML 配置文件声明式注册工具，
以便新增工具时无需修改 Java 路由代码。

**Acceptance Criteria:**

**Given** 工具 YAML 配置文件（resources/tools/_example-tool.yaml）
**When** YAML 包含：toolId、name、description、icon、aiServiceType（BUILTIN_PROXY / EXTERNAL_API）、routePath、parameters schema（类型、校验规则、默认值）
**Then** ToolConfigLoader 在应用启动时加载所有 YAML 文件，解析为 ToolConfig 对象

**Given** ToolService 工具注册表
**When** YAML 配置的工具被加载
**Then** 工具自动同步到 tools 表（upsert：tool_id 匹配则更新，不匹配则插入）
**And** 已注册的工具出现在 `GET /api/tools` 列表中（仅 is_enabled=true 的工具）
**And** 未注册的 toolId 路径不可访问（返回 404 `TOOL_NOT_FOUND`）

### Story 2.3: 工具执行管道与 AI 代理层

作为用户，
我想要执行 AI 工具并获得结果，
以便完成 AI 辅助任务。

**Acceptance Criteria:**

**Given** 用户访问 `POST /api/tools/{toolId}/execute`（携带 JWT + HMAC 签名）
**When** 请求进入 ToolPipeline
**Then** 管道按序执行：认证校验 → 速率限制 → 参数校验 → AI 代理 → 审计日志 → 结果返回
**And** 参数校验基于工具 YAML 声明的 schema 自动执行，不匹配返回 400 `VALIDATION_FAILED`

**Given** AiProxyService 实现
**When** 管道到达 AI 代理阶段
**Then** 根据工具的 aiServiceType 路由到对应 AI 服务，从环境变量注入 API Key
**When** AI 服务返回成功
**Then** 响应原路返回给前端，错误码被后端统一包装（不泄露上游服务信息）
**When** AI 服务返回错误或超时
**Then** 返回 `TOOL_EXECUTION_FAILED`，消息为"请求失败，请稍后重试"

**Given** 审计日志记录
**When** 工具执行完成（成功或失败）
**Then** 异步写入 audit_logs 表：时间、用户 ID、工具 ID、请求摘要、响应状态、耗时、token 消耗（如可获取）

### Story 2.3b: 输入输出安全校验

作为用户，
我想要系统对输入输出进行安全过滤，
以便防止 XSS 攻击和异常输入。

**Acceptance Criteria:**

**Given** 输入大小校验
**When** 请求体文本 >10KB
**Then** 返回 400 `VALIDATION_FAILED`
**When** 文件上传 >20MB 或非白名单类型
**Then** 返回 400 `VALIDATION_FAILED`

**Given** 输入净化
**When** 输入内容含 HTML
**Then** 服务端执行 HTML 转义后再进入处理管道

**Given** 输出安全渲染
**When** AI 返回内容到达前端
**Then** 使用 DOMPurify 进行 XSS 过滤后渲染，禁止直接 innerHTML
**When** 渲染结果区
**Then** 应用 `word-break: break-word` 防止长文本溢出

### Story 2.4: 前端工具列表页

作为用户，
我想要看到所有可用工具的列表，
以便选择我要使用的工具。

**Acceptance Criteria:**

**Given** 用户登录后进入工具列表页（ToolListPage.tsx）
**When** 页面加载
**Then** 顶部显示 display-sm 问候语"你好，{用户名} 👋"
**And** 下方展示工具卡片网格

**Given** 工具卡片组件（ToolCard.tsx）
**When** 卡片渲染
**Then** 品牌紫背景、白字、rounded/lg(14px) 圆角、24px 内边距
**When** 鼠标悬停
**Then** 卡片上浮 2px + 品牌色阴影（暗色模式阴影 rgba(162,155,254,0.3)）
**When** 键盘 Tab 聚焦
**Then** 显示 2px 品牌紫 outline（offset 2px）
**And** 卡片有 `role="button"` + `tabindex="0"` + `aria-label="{工具名称} — {工具简介}"`

**Given** 响应式网格
**When** 桌面端（≥992px）
**Then** 3 列网格
**When** 平板端（768-991px）
**Then** 2 列网格
**When** 手机端（<768px）
**Then** 1 列网格

**Given** 无可用工具时
**When** 工具列表为空
**Then** 显示 antd Empty "暂无可用工具"
**When** 当前用户为管理员
**Then** 追加提示"前往管理后台启用工具"

**Given** 冷启动加载
**When** 数据尚未到达
**Then** 显示 antd Skeleton 卡片占位（桌面3-4个，手机1-2个）

### Story 2.5: 前端工具操作页

作为用户，
我想要在工具操作页输入参数并执行 AI 工具，
以便获得 AI 处理结果。

**Acceptance Criteria:**

**Given** 用户从工具列表点击卡片进入工具操作页（ToolOperationPage.tsx）
**When** 页面加载
**Then** 显示：工具标题 + 参数表单（YAML 配置驱动渲染）+ 提交按钮 + 结果展示区
**When** 表单字段根据工具 YAML 的 parameters schema 动态生成（文本框、下拉选择等）

**Given** 用户填写参数并点击提交
**When** 请求发出
**Then** 提交按钮进入 loading 状态（防止重复提交），结果区显示 antd Spin
**When** 执行成功
**Then** 结果区直接展示结果，表单内容保留（可再次提交）
**When** 执行失败
**Then** antd Message (error) "请求失败，请稍后重试"，表单内容保留（可重试）

**Given** 响应式工具操作页
**When** 桌面端（≥768px）
**Then** 表单标签和输入框水平排列（antd labelCol: span 8）
**When** 手机端（<768px）
**Then** 表单标签和输入框垂直堆叠（antd labelCol: xs span 24），提交按钮全宽，结果区 word-break:break-word，页面顶部显示 ← 返回工具列表按钮

### Story 2.6: 管理员工具管理页面

作为管理员，
我想要在后台查看和管理已注册的工具，
以便控制哪些工具对用户可见。

**Acceptance Criteria:**

**Given** 管理员访问工具管理页面（ToolManagePage.tsx）
**When** 页面加载
**Then** 展示工具列表表格：名称、状态（启用/禁用）、近期调用量
**And** 侧栏"管理"入口仅管理员可见

**Given** 管理员点击工具的启用/禁用 Switch
**When** 操作触发
**Then** 弹出 antd Popconfirm "禁用后用户将无法看到此工具，确定？"
**When** 确认
**Then** 调用后端 API 更新工具状态，antd Message "已禁用"/"已启用"
**And** 禁用后用户不可见不可调用该工具

**Given** 侧栏导航组件（SidebarNav.tsx）
**When** 管理员侧栏展开
**Then** 显示：工具→[工具列表] / 管理→[仪表盘/工具管理/调用日志/用户管理]
**When** 当前页面高亮
**Then** 品牌紫10%透明度背景+品牌紫文字+rounded/md(10px)圆角+`aria-current="page"`

## Epic 3: 管理与监控后台

管理员可以在后台查看系统运行状态、调用日志，并对异常用户进行处置。系统可通过 Nginx + Docker Compose 部署到生产环境。

### Story 3.1: 调用日志后端 API 与前端页面

作为管理员，
我想要查看所有 AI 工具调用的审计日志，
以便了解系统使用情况和排查问题。

**Acceptance Criteria:**

**Given** 管理员访问 `GET /api/admin/logs`
**When** 请求携带有效 JWT + 管理员角色
**Then** 返回审计日志分页列表，包含：时间、用户 ID、工具 ID、请求摘要、响应状态、耗时、token 消耗
**When** 非管理员访问
**Then** 返回 403（权限不足）

**Given** 日志查询支持筛选
**When** 传入查询参数（时间范围、用户 ID、工具 ID、响应状态）
**Then** 返回过滤后的结果
**And** 默认展示最近24小时，日志保留至少30天

**Given** 日志脱敏
**When** 请求摘要中包含敏感信息（密码、token 等）
**Then** 脱敏后返回（如密码显示为 ***）

**Given** 管理员访问调用日志页面（LogPage.tsx）
**When** 页面加载
**Then** 展示 antd Table，支持按时间/用户/工具/状态筛选
**And** 分页加载，默认展示最近24小时
**When** 手机端
**Then** 表格横向滚动 + 分页使用 simple 模式 + 筛选折叠为 antd Collapse（默认收起）

**Given** 无日志数据时
**When** 查询结果为空
**Then** 显示 antd Empty "暂无数据"

### Story 3.2: 管理仪表盘

作为管理员，
我想要在仪表盘查看系统运行概览，
以便快速了解系统健康状况。

**Acceptance Criteria:**

**Given** 管理员访问 `GET /api/admin/dashboard/stats`
**When** 请求携带有效 JWT + 管理员角色
**Then** 返回：今日总调用量、各工具调用量分布、近期异常请求趋势（7天）、速率限制触发次数
**And** 数据来自直接查询 audit_logs 表

**Given** 仪表盘页面（DashboardPage.tsx）
**When** 页面加载
**Then** 顶部展示管理统计卡片（AdminStatCard.tsx）：今日总调用量、异常请求数、在线用户数
**And** 下方展示近期异常请求趋势（7天），异常调用量用暖深橙（#D97020）标记

**Given** 管理统计卡片组件
**When** 卡片渲染
**Then** 继承 antd Card 默认外观，1px 边框，rounded/md(10px) 圆角
**And** `role="button"` + `tabindex="0"` + `aria-label="{指标名称}: {数值}"`
**And** 点击可跳转关联详情页（如异常数卡片跳转到调用日志页）

**Given** 仪表盘手动刷新
**When** 管理员点击刷新按钮
**Then** 重新请求数据，无自动刷新

**Given** 仪表盘无数据时
**When** 统计数据为零
**Then** 显示 antd Empty "暂无数据"

### Story 3.3: 用户管理与异常处置

作为管理员，
我想要查看用户列表并对异常用户进行处置，
以便保护系统安全。

**Acceptance Criteria:**

**Given** 管理员访问 `GET /api/admin/users`
**When** 请求携带有效 JWT + 管理员角色
**Then** 返回用户分页列表：用户名、角色、状态（启用/禁用）、最后登录时间

**Given** 管理员禁用用户 `PUT /api/admin/users/{userId}/disable`
**When** 确认操作
**Then** 用户 is_enabled 设为 false，Redis 写入禁用标记（key: `miao:user:status:{userId}`，value: "disabled"）
**And** 该用户后续请求经 JwtAuthFilter 检查 Redis 缓存后返回 401 `USER_DISABLED`
**And** 操作记录在审计日志中

**Given** 管理员启用用户 `PUT /api/admin/users/{userId}/enable`
**When** 确认操作
**Then** 用户 is_enabled 设为 true，Redis 清除禁用标记
**And** 操作记录在审计日志中

**Given** 管理员设置限流策略 `PUT /api/admin/users/{userId}/rate-limit`
**When** 提交限流参数（如每分钟最大请求数）
**Then** 该用户的限流阈值更新，Redis 写入自定义限流配置（key: `miao:ratelimit:custom:{userId}`）
**And** 操作记录在审计日志中

**Given** 管理员变更用户角色 `PUT /api/admin/users/{userId}/role`
**When** 提交新角色（ADMIN / USER）
**Then** 用户 role 字段更新
**When** 将用户升级为管理员
**Then** 该用户可访问 `/admin/**` 路径
**When** 将管理员降级为普通用户
**Then** 该用户访问 `/admin/**` 返回 403
**And** 操作记录在审计日志中
**When** 尝试降级最后一个管理员
**Then** 返回 400 `VALIDATION_FAILED`，消息为"系统至少需要保留一个管理员"

**Given** 用户管理页面（UserManagePage.tsx）
**When** 页面加载
**Then** 展示用户表格，每行操作列包含：启用/禁用 Switch、设置限流 Popover 表单、角色切换 Dropdown
**When** 点击禁用 Switch
**Then** 弹出 antd Popconfirm "确定禁用该用户？禁用后该用户将无法登录和使用任何工具。"
**When** 确认
**Then** antd Message "已禁用"
**When** 点击角色 Dropdown 选择新角色
**Then** 弹出 antd Popconfirm "确定将此用户角色变更为{新角色}？"
**When** 确认
**Then** antd Message "角色已变更"
**And** 所有操作控件带 `aria-label` 包含用户名（如 `aria-label="禁用用户 张三"`、`aria-label="变更角色 张三"`）

### Story 3.4: 生产环境部署配置

作为管理员，
我想要通过 Docker Compose 一键部署整个系统到生产环境，
以便快速上线和运维。

**Acceptance Criteria:**

**Given** 生产 Docker Compose（deploy/docker-compose.yml）
**When** 执行 `docker compose up -d`
**Then** 启动4个容器：api（Spring Boot JAR）、web（Nginx + 前端静态文件）、mysql、redis
**And** 内部网络隔离服务，仅 web 容器暴露端口

**Given** 生产 Nginx 配置（deploy/nginx/nginx.conf）
**When** Nginx 启动
**Then** 静态文件服务前端 SPA
**And** `/api/` 路径反向代理到 api 容器
**And** 前端 SPA 路由 history API fallback（所有非文件请求返回 index.html）

**Given** TLS 配置
**When** 生产环境部署
**Then** Nginx 配置 Let's Encrypt TLS 证书，强制 HTTPS 重定向
**And** 使用 certbot 自动续签

**Given** 环境配置
**When** 查看 deploy/.env.example
**Then** 包含：MYSQL_ROOT_PASSWORD、MYSQL_DATABASE、REDIS_PASSWORD、JWT_SECRET、GITHUB_CLIENT_ID、GITHUB_CLIENT_SECRET、AI_API_KEYS（逗号分隔）、CORS_ALLOWED_ORIGINS、SERVER_PORT

**Given** 后端 Dockerfile
**When** 构建镜像
**Then** 多阶段构建：Maven 编译 → JRE 21 运行镜像

**Given** 前端 Dockerfile
**When** 构建镜像
**Then** 多阶段构建：npm build → Nginx 静态文件服务镜像
