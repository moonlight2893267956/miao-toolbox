---
title: '1.6: 速率限制与请求防重放'
type: 'feature'
created: '2026-06-07'
status: 'done'
---

## Intent

实现基于 Redis 滑动窗口的速率限制和 HMAC-SHA256 请求防重放保护，防止 API 盗刷和重放攻击。

**Problem:** API 缺乏速率限制和防重放机制，易受攻击。

**Approach:** RateLimitFilter（Redis Sorted Set 滑动窗口）+ AntiReplayFilter（nonce 去重 + 时间戳校验）。

## Acceptance Criteria

- 认证用户：60req/60s，key = miao:ratelimit:user:{userId}
- 未认证 IP：10req/60s，key = miao:ratelimit:ip:{ip}
- 超出返回 429 RATE_LIMIT_EXCEEDED
- X-Request-Timestamp 时间戳偏差不超过5分钟
- X-Request-Nonce Redis 去重（TTL 5分钟）
- 认证端点跳过防重放检查
- Actuator/Swagger 端点跳过限流
- 过滤器 @ConditionalOnBean(RedisTemplate.class) 支持无 Redis 环境

## Code Map

- `gateway/filter/RateLimitFilter.java` — Redis ZSet 滑动窗口限流
- `gateway/filter/AntiReplayFilter.java` — TimeStamp + Nonce 防重放
- `config/SecurityConfig.java` — 注册过滤器到链

## Verification

- `cd miao-toolbox-api && ./mvnw test` — 测试通过
