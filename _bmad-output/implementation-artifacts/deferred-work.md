# Deferred Work

## Deferred from: code review of Story 1.1-1.8 (2026-06-07)

- JPA 实体 `@Data` + `@Builder` 组合隐患 — equals/hashCode 含 id，Hibernate 代理下可能出问题
- `exchangeCodeForToken` 使用原始 Map 类型 — 未参数化 `Map`，运行时可能 ClassCastException
- 已过期 refresh token 无后台清理 — 无周期性清理任务，过期 token 持续占空间
- `isValidPassword` 双重验证 — DTO 层和服务层各有一套密码验证，逻辑分散
- OAuthProperties 默认 localhost — 生产部署需覆盖，可能被遗忘
- `extractRefreshTokenFromCookie` 死代码 — 从未被调用，`@CookieValue` 替代了其功能
- `User.loginFailCount` 为 Integer 可能 NPE — 数据库列无 `NOT NULL` 约束，null 时 `+1` 会 NPE
- `Boolean isEnabled` 为包装类型可能 NPE — 应使用基本类型 `boolean`
- RateLimitFilter 用 `instanceof User` 判断 — 将来改 UserDetails 会不匹配
- 测试用 H2 ddl-auto 而非 Flyway — 测试与生产数据库结构可能不一致
- 请求头命名与 PRD 不一致 — `X-Request-Timestamp` vs `X-Timestamp` 等
- CORS 配置在 SecurityConfig 而非独立 CorsConfig — 功能正常但偏离架构结构约定
- OAuth callback 用 GET 而非 POST — 功能正确但文档需更新
- 用户状态 Redis 缓存未实现 — 架构要求但 PRD 标注 v1 可接受
- `register` 返回 201 但 data: null — 前端注册流程可能需要用户信息
- GitHub 账号绑定功能 — 推迟到 Epic 1 Story 1.10 实现

## Deferred from: code review of 1-9-frontend-auth-flow-and-login-page (2026-06-07)

- BCrypt 截断 72 字节但 LoginRequest 允许 128 字符密码 — 密码超过 72 字节部分被静默忽略，`@Size(max=128)` 与 BCrypt 行为不一致。既有限制，与本次变更无关。
- Redis nonce 键无内存压力监控 — 高 QPS 下大量 nonce 键积累 5 分钟，无监控或告警。影响极低，可后续优化。

## Deferred from: code review of 1-10-personal-settings-and-user-menu (2026-06-07)

- LocalDateTime.now(ZoneOffset.UTC) 时区问题 — 当前所有时间戳使用 UTC 但数据库列无明确时区约束；后续 Story 统一改 Instant。
- AuthService/UserService 各有独立 BCryptPasswordEncoder — BCryptPasswordEncoder 无状态，实例独立不会出错，但应统一为 Spring Bean 便于配置切换。
- 文件末尾缺少换行符 — AppLayout.tsx、Sidebar.tsx、AuthController.java 等多个文件在末尾缺少换行符。工具问题，无功能影响。
