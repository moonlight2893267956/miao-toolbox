---
title: '1.7: CORS、错误脱敏与全局异常处理'
type: 'feature'
created: '2026-06-07'
status: 'done'
---

## Intent

配置 CORS 白名单策略，实现全局异常处理和错误信息脱敏，确保所有 API 行为一致且安全。

**Problem:** 缺少跨域策略和统一错误处理，错误信息可能泄露内部细节。

**Approach:** SecurityConfig 集成 CorsConfigurationSource，GlobalExceptionHandler @ControllerAdvice 统一处理异常。

## Acceptance Criteria

- CORS 白名单可配置（miao.cors.allowed-origins）
- 允许方法：GET/POST/PUT/DELETE/OPTIONS
- 请求头白名单：Authorization/Content-Type/X-Request-*
- 暴露 X-Request-Id 响应头，allowCredentials=true，maxAge=3600s
- GlobalExceptionHandler 处理 BusinessException → 映射 HTTP 状态
- 500 SYSTEM_ERROR 不泄露堆栈和内部细节
- AccessDeniedException → 403 AUTH_UNAUTHORIZED
- MethodArgumentNotValidException → 400 VALIDATION_FAILED

## Code Map

- `config/SecurityConfig.java` — CorsConfigurationSource + 过滤器链
- `common/exception/GlobalExceptionHandler.java` — @ControllerAdvice 统一异常处理

## Verification

- `cd miao-toolbox-api && ./mvnw test` — 测试通过
