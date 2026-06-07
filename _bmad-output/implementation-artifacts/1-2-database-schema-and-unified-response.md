---
title: '1.2: 数据库 Schema 与统一响应格式'
type: 'feature'
created: '2026-06-07'
status: 'done'
---

## Intent

创建 users 表和 refresh_tokens 表（Flyway 迁移），实现统一 API 响应格式（ApiResponse/PagedResponse）、ErrorCode/RedisKey 常量以及实体和 Repository 层。

**Problem:** 没有数据持久化结构和统一的 API 响应规范。

**Approach:** Flyway 迁移创建表结构，通用 DTO 定义响应格式，JPA 实体映射数据库表。

## Acceptance Criteria

- Flyway V1 创建 users 表（含唯一索引）
- Flyway V4 创建 refresh_tokens 表（含外键索引）
- ApiResponse 统一格式：`{code, data/message, requestId}`
- ErrorCode 包含 AUTH_/RATE_/USER_/VALIDATION_/SYSTEM_ 错误码前缀
- RedisKey 包含 nonce/ratelimit/user:status/session 前缀
- User/RefreshToken JPA 实体 + Repository

## Code Map

- `db/migration/V1__create_users_table.sql` — users 表（含默认管理员 admin/Admin123）
- `db/migration/V4__create_refresh_tokens_table.sql` — refresh_tokens 表
- `auth/entity/User.java` — JPA 实体（含 Role 枚举）
- `auth/entity/RefreshToken.java` — JPA 实体
- `auth/repository/UserRepository.java` — findByUsername/findByGithubId/findByEmail/existsByUsername
- `auth/repository/RefreshTokenRepository.java` — findByTokenHash/findByUserIdOrderByCreatedAtAsc/deleteByUserId
- `common/response/ApiResponse.java` — 统一响应格式
- `common/response/PagedResponse.java` — 分页响应
- `common/constant/ErrorCode.java` — 错误码常量
- `common/constant/RedisKey.java` — Redis key 前缀
- `common/exception/BusinessException.java` — 业务异常基类
- `common/exception/AuthException.java` — 认证异常（工厂方法）
- `config/JacksonConfig.java` — ObjectMapper 配置（JavaTimeModule）
- `config/RedisConfig.java` — RedisTemplate 序列化配置

## Verification

- `cd miao-toolbox-api && ./mvnw test` — 测试通过
