# 变更日志

> 全部显著变更记录在此。格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)。
>
> 版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)：主版本.次版本.修订号
> - 主版本：不兼容的 API 变更
> - 次版本：向下兼容的功能新增
> - 修订号：向下兼容的 Bug 修复

---

## [未发布]

### 重构
- **基础设施分离**:MySQL / Redis 从本项目编排迁出,统一由兄弟项目 `miao-infra` 管理
  - `docker-compose.prod.yml` 移除 mysql/redis services + mysql-data/redis-data volumes
  - `docker-compose.dev.yml` 移除 mysql/redis services,改为引用 `miao-infra-net` external
  - 网络拓扑:本编排 `api` 容器加入 `miao-infra-net`,主机名 `miao-mysql` / `miao-redis`
  - 跨 compose 健康检查:部署脚本新增 `step_wait_infra` 轮询 miao-mysql/miao-redis healthy;`api` healthcheck 加 `start_period: 120s` 兜底
  - 部署脚本 `step_gen_env` 不再生成 MYSQL_PASSWORD / MYSQL_ROOT_PASSWORD / REDIS_PASSWORD(由 miao-infra 管)
  - `.env.example` 移除 MYSQL_ROOT_PASSWORD,加注释指向 miao-infra
- **文档同步**:`docs/deployment.md` 加 §4.2 服务器前置(确保 miao-infra 在前);`docs/operations.md` 容器名/数据卷名更新;`docs/architecture.md` §2 部署架构图更新;`docs/troubleshooting.md` §11 故障命令更新;`README.md` §2 启动依赖服务改写

### 计划
- 失败判定语义重做（HTTP 5xx / 连接失败 / SSE 断开三态区分）
- "活跃用户" 改成真实在线（Redis SET + JwtAuthFilter）

---

## [0.4.1] - 2026-06-28

### 修复
- 仪表盘精简：删除 4 个无数据块（总 Token 用量、模型分布、Token 趋势、异常趋势）
- "在线用户" 改名为 "活跃用户"（明确说明"30 分钟内有 AI 调用"）
- AI 调用日志删除模型/Token 列（miao-ai 未启动时拿不到数据，避免误以为系统有问题）
- Trace ID 完整展示 + 一键复制
- 限流设置不显示问题（4 处缺失：DTO 字段、Service 读取、前端类型、Stepper 回显）
- AuthService 写 lastLoginAt 字段
- 用户列表"最后登录"列显示真实时间
- 下掉旧 LogPage / AdminLogController（audit_logs 0 数据的死代码）
- DashboardService 改用 AiInvocationRepository

### 文档
- 文档目录统一为 `docs/`，原 `doc/` 废弃
- 新增 `docs/README.md` 文档索引
- 重写 `docs/deployment.md`：加 TL;DR + 目录，只保留首次部署
- 新增 `docs/operations.md`：日常运维 SOP
- 新增 `docs/troubleshooting.md`：故障排查手册（按问题查）
- 新增 `CHANGELOG.md`（本文件）

---

## [0.4.0] - 2026-06-27

### 新增
- **Epic 4 · AI 调用记录 & 仪表盘改版**（适配 miao-ai 接入）
- V11 数据库迁移：新建 `ai_invocations` 表（替代废弃的 `audit_logs`）
- 新建 `observability` 包：`AiInvocation` / `AiInvocationRecorder` / `MiaoAiClient` / `RetentionJob`
- 异步持久化（`@Async` 线程池），写库失败不抛业务异常
- 90 天数据保留策略（`@Scheduled` 清理任务）
- 新建 `AdminInvocationController`：5 个 API 端点（summary / invocations / agents / models / usage-summary）
- 仪表盘新增 4 张 AI 用量卡 + Agent 分布横向柱状图 + 模型饼图 + Token 折线图
- 新建 `InvocationsPage`（/admin/invocations 路由）
- 用户管理页 Drawer + Tabs 新增"AI 用量" Tab
- 侧边栏新增"AI 调用日志"菜单项

---

## [0.3.0] - 2026-06-19

### 新增
- **Epic 3 · 管理后台**
- 仪表盘（基础统计卡：今日调用量/异常/在线用户/总用户）
- 用户管理（列表/启用禁用/角色管理/限流设置）
- 异常处理（前端错误提示、Axios 拦截器）

### 修复
- 多处 bug 修复（详见 `_bmad-output/implementation-artifacts/3-*`）

---

## [0.2.0] - 2026-06-12

### 新增
- **Epic 2 · 工具系统**
- 工具数据模型（V3 迁移）
- 工具 YAML 配置注册（`resources/tools/*.yaml`）
- 工具执行管道（HandlerInterceptor 责任链模式）
- AI 代理层（输入净化、错误包装、调用日志）
- **文本对比工具**（Epic text-compare）：
  - 后端 diff 引擎（字符级 / 行级 / 字级）
  - 前端 diff 视图（左右双栏 + 内联高亮）
  - 代码编辑器装饰（CodeEditor decorations）
  - 语法高亮 + 结构化 diff
  - IDEA 风格视觉升级
  - 后端代码格式化 API（Story 1.6）
  - 前端格式化按钮与语言选择（Story 1.7）
  - 文本对照优化（Story 1.8）

---

## [0.1.0] - 2026-06-07

### 新增
- **Epic 1 · 基础设施**
- 项目初始化 + 开发环境（V1 迁移）
- 数据库 schema + 统一响应格式（V2 迁移）
- JWT 认证 + 密码登录
- Token 刷新与注销
- GitHub OAuth 登录
- 限流（滑动窗口）+ 防重放（HMAC-SHA256 签名 + Nonce）
- CORS + 错误掩码 + 全局异常处理
- 前端品牌主题与布局
- 前端认证流程 + 登录页
- 个人设置 + 用户菜单
- Google OAuth 登录
- 审计日志 API 与前端（后被 Epic 4 替代）

---

[未发布]: https://github.com/yourname/miao-toolbox/compare/v0.4.1...HEAD
[0.4.1]: https://github.com/yourname/miao-toolbox/compare/v0.4.0...v0.4.1
[0.4.0]: https://github.com/yourname/miao-toolbox/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/yourname/miao-toolbox/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/yourname/miao-toolbox/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/yourname/miao-toolbox/releases/tag/v0.1.0
