---
title: '1.5: GitHub OAuth 登录'
type: 'feature'
created: '2026-06-07'
status: 'done'
---

## Intent

实现 GitHub OAuth 登录流程，用户可通过 GitHub 账号授权登录，首次登录自动创建本地账号。

**Problem:** 用户需要通过第三方账号便捷登录。

**Approach:** 自定义 OAuth2 授权码流程（非 Spring Security 内置），GET /api/auth/oauth/github 重定向 + /github/callback 回调处理。

## Acceptance Criteria

- GET /api/auth/oauth/github — 重定向到 GitHub 授权页
- GET /api/auth/oauth/github/callback — 处理授权码，换取 access token
- 获取 GitHub 用户信息（id/login/email/avatar_url）
- 首次 OAuth 登录自动创建本地账号（关联 github_id）
- 已有账号直接返回 JWT token 三件套
- 用户名冲突自动去重（后缀 _1, _2...）
- OAuthProperties：@ConfigurationProperties 绑定 miao.oauth.github.*
- 前端 /oauth/callback 解析 URL 参数存储 token

## Code Map

- `auth/oauth/OAuthProperties.java` — GitHub OAuth 配置属性
- `auth/oauth/GitHubOAuthService.java` — code→token 交换 + 用户资料获取 + 自动注册
- `auth/oauth/GitHubUser.java` — GitHub API 用户 DTO
- `auth/controller/OAuthController.java` — GET /oauth/github + /oauth/github/callback
- `config/RestTemplateConfig.java` — RestTemplate Bean

## Verification

- `cd miao-toolbox-api && ./mvnw test` — 测试通过
