# AGENTS.md

本文档为 Codex 在此仓库中工作时提供指导。

**语言要求：所有 AI 对话及文档产出必须使用中文。**

## 项目概述

**阿渺工具箱** — 自托管的 AI 工具集成门户。用户一次登录即可访问翻译、文生图、文生语音等独立 AI 工具。所有 AI 调用均通过服务端代理层转发，保护密钥安全并实现访问控制。

## 技术栈

| 层级 | 技术 |
|---|---|
| 后端 | Spring Boot 4.0.x + Java 21 + Maven |
| 前端 | Vite 6 + React 19 + TypeScript + Ant Design 6 |
| 数据库 | MySQL 8.x + Flyway 迁移 |
| 缓存 | Redis 7.x |
| 认证 | JWT (jjwt) + bcrypt + HMAC-SHA256 请求签名 |
| UI 状态 | React Context + useReducer |
| HTTP 客户端 | axios（拦截器实现 token 刷新与签名） |
| 部署 | Docker Compose (api, web, mysql, redis, nginx) |

## 项目结构

```
miao-toolbox/
├── miao-toolbox-api/         # Spring Boot 后端
│   ├── src/main/java/com/miao/toolbox/
│   │   ├── config/           # 安全、CORS、Redis 配置
│   │   ├── auth/             # JWT、OAuth、认证过滤器链
│   │   ├── gateway/          # 限流、防重放、CORS 过滤器
│   │   ├── proxy/            # AI 请求代理层
│   │   ├── tool/             # 工具注册与执行管道
│   │   ├── admin/            # 管理后台与用户管理
│   │   └── common/           # 错误处理、DTO、工具类
│   └── src/main/resources/
│       ├── db/migration/     # Flyway 数据库迁移脚本
│       ├── tools/            # 工具 YAML 配置文件
│       └── application.yml
└── miao-toolbox-web/         # React 前端
    └── src/
        ├── modules/
        │   ├── auth/         # 登录、注册、OAuth 回调
        │   ├── tools/        # 工具列表与操作页面
        │   └── admin/        # 仪表盘、用户管理、工具管理
        ├── services/         # Axios 实例、API 客户端
        ├── contexts/         # AuthContext、ThemeContext、SidebarContext
        └── components/       # 共享 UI 组件
```

## 开发命令

```bash
# 后端
cd miao-toolbox-api
./mvnw spring-boot:run                    # 启动开发服务器
./mvnw test                               # 运行全部测试
./mvnw test -Dtest=SomeTest#method        # 运行单个测试
./mvnw flyway:migrate                     # 运行数据库迁移

# 前端
cd miao-toolbox-web
npm run dev                               # 启动 Vite 开发服务器 (端口 5173)
npm run build                             # 生产构建
npm run lint                              # ESLint 检查
npm run typecheck                         # TypeScript 类型检查

# 完整环境
docker compose up -d                      # 启动 mysql + redis + api + web
```

## 开发流程

每个 Story 必须严格按以下三步顺序执行，**不得跳过任何步骤**：

### 1. `/bmad-create-story` — 创建 Story 文件

- 从 Epic 文件中选择下一个待开发的 Story
- 运行 `/bmad-create-story` 生成详细的 Story 实现文档
- Story 文件存放在 `_bmad-output/implementation-artifacts/` 目录
- 生成后 Story 状态自动从 `backlog` 变为 `ready-for-dev`
- **未创建 Story 文件前，不得开始编码**

### 2. `/bmad-dev-story` — 开发实现

- 基于 Story 文件中的验收标准和实现指导进行编码
- 开发过程中 Story 状态变为 `in-progress`
- 后端代码必须同步编写单元测试（见下方"后端自测要求"）
- 实现完成后运行相关测试确保通过
- **开发完成后，不得直接标记为 done，必须进入 Code Review**

### 3. `/code-review` — 代码审查

- 开发完成后运行 `/code-review` 审查变更
- 审查范围：正确性 Bug、代码复用、简化优化、效率问题
- 发现的问题必须修复后重新审查
- 审查通过后 Story 状态变更为 `done`
- **未经 Code Review 通过的 Story 不得标记为 done**

### 流程状态流转

```
backlog → ready-for-dev → in-progress → review → done
   ↑           ↑              ↑            ↑        ↑
   │      create-story    dev-story    code-review  │
   │                                                │
   └──────────── 全部完成 ──────────────────────────┘
```

## 开发约束

### 后端自测要求

- **新增或修改后端 Java 代码时，必须编写对应的单元测试**
- 测试放在 `src/test/java` 下，包路径与源码一致
- Service 层：使用 `@ExtendWith(MockitoExtension.class)` mock 依赖，覆盖正常路径和异常路径
- Controller 层：使用 `@WebMvcTest` + `@MockBean` 测试请求路由和响应格式
- 安全相关代码（认证、签名、限流）：必须覆盖边界条件（过期、无效、越权）
- 运行 `./mvnw test` 全部通过后才能标记任务完成

### 代码规范

- 后端遵循 Spring Boot 惯例：Controller 不写业务逻辑，Service 不依赖 HTTP 对象
- 统一响应格式：`{"code": "ERROR_CODE", "message": "中文描述", "requestId": "uuid"}`
- Flyway 迁移脚本命名：`V{N}__{描述}.sql`，只追加不修改已有脚本
- 前端组件遵循 Ant Design 6 默认样式，仅品牌层覆盖主色和强调色
- 前端状态管理使用 React Context + useReducer，不引入额外状态库
