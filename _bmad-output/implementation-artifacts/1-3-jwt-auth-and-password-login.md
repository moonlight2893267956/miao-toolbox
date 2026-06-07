---
title: '1.3: JWT 认证与账密登录'
type: 'feature'
created: '2026-06-07'
status: 'done'
---

## Intent

实现账密注册和登录功能，包括 JWT 签发/验证、bcrypt 密码哈希、登录失败锁定、Spring Security 过滤器链和 SecurityContext 设置。

**Problem:** 用户无法注册和登录系统。

**Approach:** JwtService + AuthService + JwtAuthFilter + SecurityConfig 构成完整认证链。

## Acceptance Criteria

- POST /api/auth/register：注册（密码≥8位含字母数字），201 返回
- POST /api/auth/login：登录成功返回 access token + signingKey + httpOnly refresh cookie
- bcrypt 加盐哈希存储密码
- 连续5次登录失败锁定15分钟
- JwtAuthFilter 解析 Bearer token，设置 SecurityContext
- 公开端点白名单（register/login/refresh/actuator/swagger）
- SecurityConfig：CSRF 禁用，STATELESS session，ADMIN 角色限制

## Code Map

- `auth/dto/RegisterRequest.java` — 注册 DTO（@Valid 校验）
- `auth/dto/LoginRequest.java` — 登录 DTO
- `auth/dto/LoginResponse.java` — 登录响应 DTO（嵌套 UserInfo）
- `auth/service/JwtService.java` — JWT 签发/验证/解析（HMAC-SHA256，密钥≥256bit）
- `auth/service/AuthService.java` — 注册/登录/刷新/注销业务逻辑
- `auth/filter/JwtAuthFilter.java` — Bearer token 过滤器
- `auth/controller/AuthController.java` — /api/auth/register|login|refresh|logout
- `config/SecurityConfig.java` — Spring Security 配置
- `common/util/RequestIdFilter.java` — UUID 请求追踪
- `common/exception/GlobalExceptionHandler.java` — 统一异常处理

## Verification

- `cd miao-toolbox-api && ./mvnw test` — 测试通过
