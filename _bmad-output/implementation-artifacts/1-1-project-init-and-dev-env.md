---
title: '1.1: 项目初始化与开发环境搭建'
type: 'feature'
created: '2026-06-07'
status: 'done'
---

## Intent

初始化 Spring Boot 4.0.x + Java 21 + Maven 后端和 Vite 6 + React 19 + TypeScript + Ant Design 6 前端项目，配置 Docker Compose 开发环境（MySQL 8.x + Redis 7.x），为后续所有故事提供可运行的基础框架。

**Problem:** 项目从零开始，没有基础框架代码和开发环境。

**Approach:** 使用 Spring Initializr 初始化后端、Vite CLI 初始化前端、Docker Compose 编排 MySQL+Redis 容器。

## Acceptance Criteria

- 后端项目可通过 `mvn compile` 编译
- 前端项目可通过 `npm run dev` 启动
- MySQL 8.x 和 Redis 7.x 容器可通过 docker compose 启动
- .env.example 文件包含所有必需环境变量模板

## Code Map

- `miao-toolbox-api/pom.xml` — Maven 配置，Spring Boot 4.0.5 + Java 21
- `miao-toolbox-api/src/main/resources/application.yml` — 主配置（JPA、Flyway、Jackson、CORS）
- `miao-toolbox-api/src/main/resources/application-dev.yml` — 开发配置（MySQL、Redis）
- `miao-toolbox-web/vite.config.ts` — Vite 配置（API 代理到 8080）
- `docker-compose.dev.yml` — MySQL 8.4 + Redis 7 容器编排
- `.env.example` — 环境变量模板
- `.gitignore` — Git 忽略规则

## Verification

- `cd miao-toolbox-api && ./mvnw compile -q` — 编译通过
- `cd miao-toolbox-web && npm run dev` — 启动成功
