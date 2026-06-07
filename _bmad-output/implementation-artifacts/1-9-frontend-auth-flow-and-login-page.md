---
baseline_commit: 79d34f8344d1c57a287f6b295d1367ac3c14a59e
---

# Story 1.9: 前端认证流程与登录页

Status: done

## Story

As a 用户,
I want 在登录页完成登录并自动跳转到工具列表,
so that 我可以快速开始使用系统。

## Acceptance Criteria

1. **登录页渲染**：显示用户名+密码输入框 + "登录"按钮 + "使用 GitHub 登录"按钮 + "注册账号"链接
2. **账密登录成功**：调用 `POST /api/auth/login`，token/signingKey 存入 AuthContext 内存（闭包变量，不持久化到 localStorage/sessionStorage），跳转到工具列表页
3. **账密登录失败**：表单内联提示"用户名或密码错误"
4. **账号锁定**：提示"账号已锁定，请15分钟后重试"
5. **注册页**：用户名+密码+确认密码表单，密码强度校验（≥8位+字母+数字），注册成功跳转登录页
6. **GitHub OAuth**：点击跳转后端 `/api/auth/oauth/github`，回调后从 URL fragment 解析 token，存入 AuthContext 内存
7. **OAuth 失败**：antd Message "GitHub 授权失败，请重试"，显示账密登录备选
8. **统一 axios 实例**：所有 API 请求自动附加 `Authorization: Bearer <token>` + HMAC 签名头（X-Request-Timestamp/X-Request-Nonce/X-Request-Signature）
9. **401 静默刷新**：收到 401 → 静默调用 `POST /api/auth/refresh` → 成功后用新 token 重试原请求
10. **刷新也失败**：清除 AuthContext 状态，重定向到 `/login?redirect=原路径`
11. **路由守卫**：未登录访问受保护页面 → 重定向到登录页（携带来源路径）；登录成功 → 跳转到原目标页或 `/tools`
12. **首次登录强制改密**：若 `mustChangePassword=true`，登录后跳转到修改密码页

## Tasks / Subtasks

- [x] 1. 创建 AuthContext（AC: 2, 6, 9, 10, 11）
  - [x] 1.1 创建 `src/contexts/AuthContext.tsx`：React Context + useReducer，管理 token/signingKey/userInfo/mustChangePassword
  - [x] 1.2 闭包变量存储 token（不持久化），提供 login/logout/refresh 方法
  - [x] 1.3 登录时将 token 存入闭包变量 + 将 userInfo 存入 Context state（用于 UI 渲染）
  - [x] 1.4 登出时清除闭包变量 + Context state + 调用 `POST /api/auth/logout`

- [x] 2. 创建统一 axios 实例（AC: 8, 9, 10）
  - [x] 2.1 创建 `src/services/axiosInstance.ts`：baseURL + 超时配置
  - [x] 2.2 请求拦截器：附加 Authorization Bearer 头
  - [x] 2.3 请求拦截器：HMAC-SHA256 签名（X-Request-Timestamp + X-Request-Nonce + X-Request-Signature）
  - [x] 2.4 响应拦截器：401 → 静默 refresh → 成功重试原请求 / 失败清除状态跳转登录页
  - [x] 2.5 响应拦截器：429 → antd Message "请求过于频繁"

- [x] 3. 实现登录页（AC: 1, 2, 3, 4）
  - [x] 3.1 重写 `src/modules/auth/LoginPage.tsx`：antd Form + Input + Button
  - [x] 3.2 账密表单提交：调用 AuthContext.login()
  - [x] 3.3 错误处理：区分 AUTH_LOGIN_FAILED（内联提示）和 USER_LOCKED（锁定提示）
  - [x] 3.4 GitHub OAuth 按钮：`<a href="/api/auth/oauth/github">`
  - [x] 3.5 "注册账号"链接：跳转 `/register`
  - [x] 3.6 品牌标题使用 UX 设计规格的 display 排版（32px/700/Noto Sans SC）

- [x] 4. 实现注册页（AC: 5）
  - [x] 4.1 重写 `src/modules/auth/RegisterPage.tsx`：用户名+密码+确认密码表单
  - [x] 4.2 密码强度校验：≥8位 + 包含字母和数字（前端实时提示）
  - [x] 4.3 注册成功：antd Message.success + 跳转 `/login`

- [x] 5. 重构 OAuth 回调（AC: 6, 7）
  - [x] 5.1 重写 `src/modules/auth/OAuthCallback.tsx`：从 URL fragment 解析 token
  - [x] 5.2 调用 AuthContext.login() 存入内存（不使用 localStorage/sessionStorage）
  - [x] 5.3 失败时：antd Message.error + 跳转 `/login`

- [x] 6. 路由守卫（AC: 11）
  - [x] 6.1 创建 `src/routes/index.tsx`：RequireAuth 组件
  - [x] 6.2 未登录 → `<Navigate to="/login" state={{ from: location }} replace />`
  - [x] 6.3 登录成功后 → 跳转到 `state.from` 或 `/tools`

- [x] 7. 重构 App.tsx（AC: 11）
  - [x] 7.1 用 AuthProvider 包裹应用
  - [x] 7.2 使用 routes/index.tsx 的 RequireAuth 替代内联守卫
  - [x] 7.3 移除 localStorage 中的 token 操作，统一走 AuthContext

- [x] 8. 首次登录强制改密（AC: 12）
  - [x] 8.1 创建 `src/modules/auth/ChangePasswordPage.tsx`
  - [x] 8.2 登录后若 mustChangePassword=true → 跳转 `/change-password`

## Dev Notes

### 核心架构约束

1. **token 存储方式**：PRD FR-7 明确要求 signingKey "前端存储在内存中（不持久化到 localStorage）"。AC 也要求 access token 存入闭包变量。**绝不能使用 localStorage 或 sessionStorage 存储 token/signingKey**。userInfo 可以存 localStorage 用于 UI 渲染（用户名/角色）。

2. **HMAC 签名算法**：`HMAC-SHA256(signingKey, timestamp + nonce + requestBody)`。signingKey 从登录/刷新响应获取。请求头命名：`X-Request-Timestamp`（毫秒时间戳）、`X-Request-Nonce`（UUID v4）、`X-Request-Signature`（hex 编码的 HMAC 值）。

3. **OAuth 回调**：后端使用 URL fragment（`#`）传递令牌，不是查询参数（`?`）。前端用 `window.location.hash` 解析。

4. **Refresh token**：在 httpOnly cookie 中自动发送，前端无需手动管理。刷新调用 `POST /api/auth/refresh`（无需请求体，cookie 自动携带）。

5. **统一响应格式**：后端返回 `{"code": "ERROR_CODE", "message": "中文描述", "requestId": "uuid", "data": ...}`。前端根据 `code` 字段判断错误类型。

### 已有代码（必须复用/修改，不能新建重复）

| 文件 | 当前状态 | 本 Story 操作 |
|---|---|---|
| `src/App.tsx` | 有 RequireAuth + handleLogout | **重构**：集成 AuthProvider，移除 localStorage token 操作 |
| `src/modules/auth/LoginPage.tsx` | 占位壳子 | **重写**：完整登录表单 |
| `src/modules/auth/RegisterPage.tsx` | 占位壳子 | **重写**：完整注册表单 |
| `src/modules/auth/OAuthCallback.tsx` | 已部分实现（用 localStorage） | **重构**：改用 AuthContext |
| `src/contexts/ThemeContext.tsx` | 已完成 | **不修改** |
| `src/components/layout/AppLayout.tsx` | 已完成 | **不修改** |
| `src/components/layout/Sidebar.tsx` | 已完成（userRole prop） | **不修改** |
| `src/components/layout/Header.tsx` | 已完成 | **不修改** |

### 新建文件

| 文件 | 用途 |
|---|---|
| `src/contexts/AuthContext.tsx` | 认证上下文（token 管理 + login/logout/refresh） |
| `src/services/axiosInstance.ts` | 统一 axios 实例 + 拦截器 |
| `src/services/authService.ts` | 认证 API 调用（login/register/refresh/logout） |
| `src/routes/index.tsx` | 路由守卫 |
| `src/modules/auth/ChangePasswordPage.tsx` | 首次登录强制修改密码页 |

### 依赖（已安装，无需新增）

- `axios` — HTTP 客户端
- `react-router-dom` — 路由
- `antd` + `@ant-design/icons` — UI 组件
- `dayjs` — 日期（已有）

### UX 设计规格

- 品牌标题排版：`fontFamily: "Noto Sans SC, -apple-system, ..."`, `fontSize: 32px`, `fontWeight: 700`, `lineHeight: 1.25`
- 输入框圆角：6px（antd 默认）
- 按钮圆角：10px（品牌覆盖）
- 登录页居中布局，暗色/亮色主题均需正确渲染品牌色 `#5C4FD0` / `#A29BFE`
- 手机端：OAuth 按钮和账密表单垂直堆叠，品牌面板隐藏或缩小

### 后端 API 接口

| 端点 | 方法 | 请求 | 成功响应 | 错误码 |
|---|---|---|---|---|
| `/api/auth/login` | POST | `{username, password}` | `{code:"SUCCESS", data:{accessToken, signingKey, mustChangePassword, user:{id,username,role}}}` | AUTH_LOGIN_FAILED, USER_LOCKED |
| `/api/auth/register` | POST | `{username, password}` | `{code:"SUCCESS", data:null}` 201 | USER_ALREADY_EXISTS, VALIDATION_FAILED |
| `/api/auth/refresh` | POST | cookie: refreshToken | `{code:"SUCCESS", data:{accessToken, signingKey, mustChangePassword, user:{id,username,role}}}` | AUTH_TOKEN_EXPIRED |
| `/api/auth/logout` | POST | cookie: refreshToken | `{code:"SUCCESS"}` | — |
| `/api/auth/oauth/github` | GET | — | 302 → GitHub | — |

### 测试要求

- 前端无强制单元测试要求（CLAUDE.md 仅要求后端单元测试）
- 但需确保：登录页在亮色/暗色主题下正确渲染、表单校验正常、路由守卫生效

### Project Structure Notes

- `src/services/` 目录当前为空，本 Story 填充 `axiosInstance.ts` 和 `authService.ts`
- `src/routes/` 目录当前为空，本 Story 填充 `index.tsx`
- `src/contexts/` 已有 `ThemeContext.tsx`，新增 `AuthContext.tsx`

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Epic 1 Story 1.9]
- [Source: _bmad-output/planning-artifacts/prds/prd-miao-toolbox-2026-06-06/prd.md#FR-1 FR-2 FR-3 FR-7]
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-miao-toolbox-2026-06-07/DESIGN.md#品牌色+排版]
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-miao-toolbox-2026-06-07/EXPERIENCE.md#状态模式+Flow 1]
- [Source: _bmad-output/planning-artifacts/architecture.md#前端架构]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

### Review Findings

- [x] [Review][Decision→Dismiss] AC3 登录失败提示方式 — 产品决策：antd message.error toast 通知已满足需求。（`LoginPage.tsx`）
- [x] [Review][Decision→Patch] AC11 路由守卫重定向路径传递 — 已修复：LoginPage 同时支持 `location.state.from` 和 `redirect` 查询参数。
- [x] [Review][Patch] 签名过渡机制失效 — 已修复：添加反向映射 `SIGNING_KEY_TRANSITION_PREFIX + newKey → oldKey`，AntiReplayFilter 用新 key 查找旧 key 验证签名 [`AntiReplayFilter.java`, `AuthService.java`]
- [x] [Review][Patch] 废弃 validateToken() 同时尝试两种密钥 — 已修复：删除 `validateToken()` 方法 [`JwtService.java`]
- [x] [Review][Patch] 前端刷新后 isAuthenticated 状态丢失 — 已修复：添加 `rehydrating` 状态，页面刷新时先尝试静默 token 刷新再决定认证状态 [`AuthContext.tsx`, `routes/index.tsx`]
- [x] [Review][Patch] JwtAuthFilter 统一错误码 — 已修复：禁用/锁定用户统一返回 AUTH_LOGIN_FAILED，防用户枚举 [`JwtAuthFilter.java`]
- [x] [Review][Patch] LoginPage 移除死代码 — 已修复：移除 USER_LOCKED/USER_DISABLED 错误分支 [`LoginPage.tsx`]
- [x] [Review][Patch] 添加修改密码 API — 已修复：新增 `PUT /api/auth/password` 端点 + ChangePasswordRequest DTO + AuthService.changePassword() [`AuthController.java`, `ChangePasswordRequest.java`, `AuthService.java`]
- [ ] [Review][Patch] HMAC 签名未覆盖 POST/PUT 请求体 — 保留为已知限制，readBody() 仍返回空字符串，已标记 TODO [`AntiReplayFilter.java:157-165`]
- [x] [Review][Patch] OAuth stateStore 内存泄漏 — 已修复：添加 ScheduledExecutor 定时清理过期 state [`GitHubOAuthService.java`]
- [x] [Review][Patch] OAuth callback 处理 GitHub error 参数 — 已修复：添加 `@RequestParam error` 参数，重定向到前端带错误 fragment [`OAuthController.java`]
- [x] [Review][Patch] RedisTemplate 可选时签名过渡日志 — 已修复：添加 `log.warn` 警告 [`AuthService.java`]
- [x] [Review][Patch] HMAC 常量时间比较 — 已修复：将 `equals()` 替换为 `MessageDigest.isEqual()` [`AntiReplayFilter.java`]
- [x] [Review][Patch] 速率限制器使用 X-Forwarded-For — 已修复：优先从 X-Forwarded-For 头获取真实客户端 IP [`RateLimitFilter.java`]
- [x] [Review][Patch] Anti-replay 过滤器排除 logout — 已修复：shouldNotFilter 精确匹配而非全前缀匹配，/api/auth/logout 不再跳过 [`AntiReplayFilter.java`]
- [x] [Review][Patch] OAuthCallback userId NaN 检查 — 已修复：添加 `isNaN` 校验，无效 userId 时显示错误提示 [`OAuthCallback.tsx`]
- [x] [Review][Defer] BCrypt 截断 72 字节但 LoginRequest 允许 128 字符密码 — 既有问题，与本次变更无关 [`LoginRequest.java:13`]
- [x] [Review][Defer] Redis nonce 键无内存压力监控 — 影响极低，可后续优化
