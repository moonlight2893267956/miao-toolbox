---
title: '1.4: Token 刷新与注销'
type: 'feature'
created: '2026-06-07'
status: 'done'
---

## Intent

实现 access token 刷新、refresh token 轮换、并发会话控制和注销功能，确保会话管理安全。

**Problem:** Access token 过期后需要无缝刷新，用户需要安全的注销机制。

**Approach:** AuthService 中 refresh() 实现 token 轮换 + 并发控制（最多5会话），logout() 删除 token。

## Acceptance Criteria

- POST /api/auth/refresh：httpOnly cookie 自动携带 refresh token，签发新 token 对
- Token 轮换：刷新后旧 refresh token 立即失效
- 单用户最多5个有效 refresh token，超出移除最旧会话
- POST /api/auth/logout：删除当前 refresh token，清除 cookie
- Refresh token SHA-256 哈希存储（不存明文）

## Code Map

- `auth/service/AuthService.java` — refresh() / logout() (与 Story 1.3 合并实现)
- `auth/controller/AuthController.java` — /refresh /logout 端点

## Verification

- `cd miao-toolbox-api && ./mvnw test` — 测试通过
