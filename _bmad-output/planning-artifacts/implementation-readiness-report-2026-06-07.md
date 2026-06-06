---
stepsCompleted:
  - step-01-document-discovery
  - step-02-prd-analysis
  - step-03-epic-coverage-validation
  - step-04-ux-alignment
  - step-05-epic-quality-review
  - step-06-final-assessment
documentInventory:
  prd:
    - prds/prd-miao-toolbox-2026-06-06/prd.md
  architecture:
    - architecture.md
  epics:
    - epics.md
  ux:
    - ux-designs/ux-miao-toolbox-2026-06-07/DESIGN.md
    - ux-designs/ux-miao-toolbox-2026-06-07/EXPERIENCE.md
    - ux-designs/ux-miao-toolbox-2026-06-07/reconcile-prd.md
    - ux-designs/ux-miao-toolbox-2026-06-07/review-accessibility.md
    - ux-designs/ux-miao-toolbox-2026-06-07/review-consistency.md
    - ux-designs/ux-miao-toolbox-2026-06-07/review-responsive.md
---

# 实现就绪评估报告

**日期：** 2026-06-07
**项目：** 阿渺工具箱（miao-toolbox）

## 文档清单

### 发现的 PRD 文件

**分片文档：**
- 目录：`prds/prd-miao-toolbox-2026-06-06/`
  - prd.md（17,539 字节，修改于 6月7日 00:13）

### 发现的架构文件

**完整文档：**
- architecture.md（49,668 字节，修改于 6月7日 01:09）

### 发现的 Epic 与 Story 文件

**完整文档：**
- epics.md（36,641 字节，修改于 6月7日 01:23）

### 发现的 UX 设计文件

**分片文档：**
- 目录：`ux-designs/ux-miao-toolbox-2026-06-07/`
  - DESIGN.md（8,925 字节，修改于 6月7日 00:36）
  - EXPERIENCE.md（14,391 字节，修改于 6月7日 00:36）
  - reconcile-prd.md（2,166 字节，修改于 6月7日 00:25）
  - review-accessibility.md（15,727 字节，修改于 6月7日 00:28）
  - review-consistency.md（8,459 字节，修改于 6月7日 00:28）
  - review-responsive.md（14,189 字节，修改于 6月7日 00:27）

### 发现的问题

**未检测到重复冲突** — 每种文档类型仅存在一种格式（完整或分片），无冲突。

**无关键文档缺失** — PRD、架构、Epics 和 UX 文档均已齐全。

## PRD 分析

### 功能需求

| 编号 | 需求描述 |
|---|---|
| FR-1 | 账密注册与登录 — 用户名（3-20 字符，字母数字+下划线，唯一）+ 密码（≥8 字符，字母+数字）；bcrypt 存储；JWT 令牌；5 次失败 → 锁定 15 分钟 |
| FR-2 | GitHub OAuth 登录 — OAuth 流程；首次登录自动创建本地账号；已有账号可绑定 GitHub |
| FR-3 | 会话管理与安全 — Access token 15 分钟 / refresh token 7 天；刷新轮换；最多 5 个并发会话；注销使所有令牌失效；被禁用用户通过数据库状态拦截 |
| FR-4 | 传输加密 — 生产环境：强制 HTTPS，HTTP→301 重定向；开发环境：允许 HTTP；Let's Encrypt 自动续期 |
| FR-5 | 统一 API 网关鉴权 — 所有业务 API 需要有效 JWT；缺失/过期返回 401；集中式网关；静态资源放行；被禁用用户拦截 |
| FR-6 | 速率限制 — 已认证：每用户 60 次/分钟；公开端点：每 IP 10 次/分钟；429 + Retry-After；滑动窗口 |
| FR-7 | 请求防重放 — 登录时下发 signingKey；X-Timestamp + X-Nonce + X-Signature（HMAC-SHA256）；±5 分钟窗口；nonce Redis 去重（TTL 5 分钟）；signingKey 刷新时 30 秒宽限期 |
| FR-8 | CORS 与来源校验 — 仅白名单；生产环境禁止通配符 |
| FR-9 | 错误信息安全 — 500 返回通用消息；不暴露堆栈/SQL/拓扑；AI 错误包装处理；完整错误仅记录到日志 |
| FR-10 | AI 密钥服务端托管 — API Key 仅存在于服务端环境变量/加密配置中；绝不出现在前端；生产环境使用 Docker secrets |
| FR-11 | AI 请求代理 — 前端调用 `/api/tools/{toolId}/execute`；后端路由、注入密钥、转发；记录用户/工具/耗时/token 消耗 |
| FR-12 | 输入输出安全 — 文本 ≤10KB，文件 ≤20MB；文件类型白名单；输入 HTML 转义；输出 DOMPurify XSS 过滤；v1 不做提示词注入检测 |
| FR-13 | 工具注册协议 — 声明式 YAML：ID、名称、描述、图标、参数 schema、AI 服务类型、路由；自动列出；未注册路由拦截 |
| FR-14 | 工具执行管道 — 统一链路：鉴权 → 限流 → 参数校验 → AI 代理 → 结果；基于 schema 自动校验；Spring HandlerInterceptor |
| FR-15 | 工具管理界面 — 管理员工具列表（名称、状态、调用量）；启用/禁用工具；禁用后不可见且不可调用；v1 不支持 UI 注册 |
| FR-16 | 调用审计日志 — 时间、用户 ID、工具 ID、请求摘要、状态、耗时、token 消耗；不记录密码/完整请求体；保留 ≥30 天；仅管理员可访问 |
| FR-17 | 管理仪表盘 — 日调用量、工具分布、异常趋势；在线用户、触发限流次数；手动刷新；直接查库 |
| FR-18 | 异常处置 — 管理员禁用用户（鉴权中间件拦截）；更严格的单用户限流；管理员操作记录审计 |
| FR-19 | 管理员身份 — 用户表 `role` 字段（ADMIN/USER）；迁移脚本创建首个管理员；管理员访问 `/admin/**`；非管理员返回 403；角色升降级 |

**功能需求总数：19**

### 非功能需求

| 编号 | 类别 | 需求描述 |
|---|---|---|
| NFR-1 | 安全 — 密码 | bcrypt 加盐哈希；禁止明文/MD5/SHA256 |
| NFR-2 | 安全 — 令牌 | httpOnly refresh cookie；JWT 放 Authorization 头；轮换机制 |
| NFR-3 | 安全 — 完整性 | HMAC-SHA256 签名；nonce 防重放 |
| NFR-4 | 安全 — 传输 | 生产环境强制 HTTPS；Let's Encrypt 证书 |
| NFR-5 | 安全 — 密钥管理 | AI 密钥仅服务端存储；生产环境 Docker secrets |
| NFR-6 | 安全 — XSS | DOMPurify 输出过滤；输入 HTML 转义；禁止 innerHTML |
| NFR-7 | 安全 — 错误 | 客户端错误不暴露内部细节 |
| NFR-8 | 安全 — CORS | 仅白名单；生产环境禁止通配符 |
| NFR-9 | 性能 — 限流 | 滑动窗口；已认证 60 次/分钟，公开 10 次/分钟 |
| NFR-10 | 性能 — 时间窗口 | ±5 分钟时间戳容差；5 分钟 nonce TTL |
| NFR-11 | 可用性 — 刷新 | 30 秒 signingKey 宽限期 |
| NFR-12 | 审计 — 保留期 | ≥30 天 |
| NFR-13 | 审计 — 数据最小化 | 日志中不记录密码/完整请求体 |
| NFR-14 | 可扩展性 — 会话 | 每用户最多 5 个 refresh token |
| NFR-15 | 配置 — 限流 | application.yml 配置（需重启） |
| NFR-16 | 配置 — 输入限制 | 文本 ≤10KB，文件 ≤20MB；可配置 |
| NFR-17 | 部署 — Docker | Compose 一键部署 |
| NFR-18 | 可扩展性 — 工具 | 新工具集成 ≤2 小时 |

**非功能需求总数：18**

### 额外需求与约束

- **v1 明确排除项：** 微信 OAuth、提示词注入检测、单工具配额、UI 工具注册、日志数据仓库、邮箱验证、告警/通知、异步 AI 回调、仪表盘实时推送、移动端原生、多租户、计费、工作流编排
- **首个管理员** 通过 Flyway 迁移脚本创建
- **用户状态** 实时查库（Redis 缓存延后）
- **工具注册** 仅通过 YAML 配置文件
- **仪表盘** 数据来自直接查库，手动刷新

### PRD 完整性评估

PRD 结构良好且内容全面：
- ✅ 所有 FR 均有可验证的预期结果
- ✅ 假设条件使用 `[ASSUMPTION]` 标记明确标注
- ✅ 非目标已明确声明（§5）
- ✅ MVP 范围清晰界定（§6）
- ✅ 成功指标包含主要/次要/反向指标
- ✅ 关键决策已记录（§8）
- ✅ 假设条件已索引（§9）
- ⚠️ FR-2（GitHub OAuth）缺少"解绑"场景的可验证结果 — 仅提及绑定，未涉及解绑操作
- ⚠️ FR-18（异常处置）— "更严格的单用户限流"没有定义具体默认值或范围
- ℹ️ 未提供明确的错误码规范（例如，哪种具体错误场景对应哪个 HTTP 状态码）

## Epic 覆盖度验证

### 覆盖矩阵

| PRD FR | PRD 需求 | Epic | Story 覆盖 | 状态 |
|---|---|---|---|---|
| FR-1 | 账密注册与登录 | Epic 1 | Story 1.3 | ✅ 已覆盖 |
| FR-2 | GitHub OAuth 登录 | Epic 1 | Story 1.5 | ✅ 已覆盖 |
| FR-3 | 会话管理与安全 | Epic 1 | Story 1.3, 1.4 | ✅ 已覆盖 |
| FR-4 | 传输加密（HTTPS） | Epic 1* | Story 3.4 | ⚠️ 已覆盖 — Epic 归属不匹配 |
| FR-5 | 统一 API 网关鉴权 | Epic 1 | Story 1.3 | ✅ 已覆盖 |
| FR-6 | 速率限制 | Epic 1 | Story 1.6 | ✅ 已覆盖 |
| FR-7 | 请求防重放 | Epic 1 | Story 1.6 | ✅ 已覆盖 |
| FR-8 | CORS 与来源校验 | Epic 1 | Story 1.7 | ✅ 已覆盖 |
| FR-9 | 错误信息安全 | Epic 1 | Story 1.7 | ✅ 已覆盖 |
| FR-10 | AI 密钥服务端托管 | Epic 1* | Story 2.3 | ⚠️ 已覆盖 — Epic 归属不匹配 |
| FR-11 | AI 请求代理 | Epic 2 | Story 2.3 | ✅ 已覆盖 |
| FR-12 | 输入输出安全 | Epic 2 | Story 2.3 | ✅ 已覆盖 |
| FR-13 | 工具注册协议 | Epic 2 | Story 2.2 | ✅ 已覆盖 |
| FR-14 | 工具执行管道 | Epic 2 | Story 2.3 | ✅ 已覆盖 |
| FR-15 | 工具管理界面 | Epic 2 | Story 2.6 | ✅ 已覆盖 |
| FR-16 | 调用审计日志 | Epic 3 | Story 3.1 | ✅ 已覆盖 |
| FR-17 | 管理仪表盘 | Epic 3 | Story 3.2 | ✅ 已覆盖 |
| FR-18 | 异常处置 | Epic 3 | Story 3.3 | ✅ 已覆盖 |
| FR-19 | 管理员身份 | Epic 1 | Story 1.2 | ✅ 已覆盖 |

### 缺失的需求

#### 关键 FR 缺失

**无 — 全部 19 个 PRD FR 均有 Story 覆盖。** ✅

#### 覆盖关注点（非缺失，但值得注意）

1. **FR-4（HTTPS/TLS）— Epic 归属不匹配：**
   - FR 覆盖矩阵标注为 Epic 1，但实际实现 Story（3.4）在 Epic 3 中
   - TLS 终结发生在 Nginx 层，而 Nginx 部署在 Story 3.4
   - **影响：** 如果仅部署 Epic 1 而不部署 Epic 3，则无 HTTPS 强制。开发环境下可接受（PRD 允许开发环境使用 HTTP），但增量部署时需注意。

2. **FR-10（AI 密钥服务端托管）— Epic 归属不匹配：**
   - FR 覆盖矩阵标注为 Epic 1，但实际实现在 Story 2.3（Epic 2）
   - 密钥托管属于架构层面（环境变量/secrets），并非独立 Story — 它融入了代理层实现
   - **影响：** 低 — 密钥无论如何不会出现在前端代码中。但覆盖矩阵中标注 Epic 1 具有误导性。

3. **FR-2（GitHub OAuth）— 解绑未覆盖：**
   - PRD 提及已有账号可绑定 GitHub（FR-2），但无 Story 覆盖解绑操作
   - Story 1.5 覆盖了绑定但未涉及反向操作
   - **影响：** 中 — 如果用户误绑了错误的 GitHub 账号，无自助恢复路径

4. **FR-19（管理员身份）— 角色升降级未覆盖：**
   - PRD FR-19 声明"管理员可升级/降级其他用户的角色"
   - Story 3.3（用户管理）覆盖了禁用/启用和限流，但未提及角色变更
   - **影响：** 中 — 缺少将用户提升为管理员或降级管理员的管理界面

5. **FR-7 signingKey 存储 — PRD 与 Story 不一致：**
   - PRD 声明 signingKey 存储在内存中（不持久化到 localStorage）
   - Story 1.9 声明 signingKey 存储在 sessionStorage 中
   - sessionStorage 在页面刷新后仍然存在，仅在标签页关闭时清除；与"仅内存"不同
   - **影响：** 低到中 — sessionStorage 可被同标签页中的 XSS 访问，相比纯内存存储略微扩大了攻击面

### NFR 在 Epic 中的覆盖

| NFR | Story 覆盖 | 状态 |
|---|---|---|
| NFR-1（bcrypt） | Story 1.3 | ✅ |
| NFR-2（httpOnly/轮换） | Story 1.3, 1.4 | ✅ |
| NFR-3（HMAC 签名） | Story 1.6, 1.9 | ✅ |
| NFR-4（HTTPS） | Story 3.4 | ✅ |
| NFR-5（密钥管理） | Story 2.3 | ✅ |
| NFR-6（XSS/DOMPurify） | Story 2.3, 2.5 | ⚠️ Story 中未明确提及 DOMPurify |
| NFR-7（错误脱敏） | Story 1.7 | ✅ |
| NFR-8（CORS 白名单） | Story 1.7 | ✅ |
| NFR-9（滑动窗口） | Story 1.6 | ✅ |
| NFR-10（时间戳窗口） | Story 1.6 | ✅ |
| NFR-11（30 秒宽限） | Story 1.4, 1.9 | ⚠️ Story 中未明确提及 30 秒宽限期 |
| NFR-12（30 天保留） | Story 3.1 | ✅ |
| NFR-13（日志脱敏） | Story 3.1 | ✅ |
| NFR-14（最多 5 个会话） | Story 1.4 | ✅ |
| NFR-15（配置限流） | Story 1.6 | ✅ |
| NFR-16（输入限制） | Story 2.3 | ✅ |
| NFR-17（Docker 部署） | Story 3.4 | ✅ |
| NFR-18（2 小时工具集成） | 无 Story | ❌ 无法在 Story 中测试 |

### 覆盖统计

- **PRD FR 总数：** 19
- **Epic 中已覆盖的 FR：** 19/19（100%）
- **存在归属问题的 FR：** 2 个（FR-4、FR-10）
- **存在部分实现缺口的 FR：** 2 个（FR-2 解绑、FR-19 角色管理）
- **已覆盖的 NFR：** 16/18（明确覆盖）
- **仅隐式覆盖的 NFR：** 2 个（NFR-6 DOMPurify、NFR-11 宽限期）
- **Story 中未覆盖的 NFR：** 1 个（NFR-18 工具集成时间 — 无法直接测试）

## UX 对齐评估

### UX 文档状态

**已找到** — 包含 6 个文件的完整 UX 文档：
- DESIGN.md — 视觉识别、色彩 token、排版、组件规格
- EXPERIENCE.md — 信息架构、交互模式、状态模式、无障碍基线
- reconcile-prd.md — FR 覆盖映射（所有与 UX 相关的 FR 均已覆盖）
- review-accessibility.md — WCAG 2.2 AA 审计（5 个 GAP、5 个 WARNING、8 个 OK）
- review-consistency.md — DESIGN.md ↔ EXPERIENCE.md 交叉检查（1 个 ISSUE、13 个 OK）
- review-responsive.md — 响应式设计审查（2 个 ISSUE、8 个 WARNING、4 个 OK）

### UX ↔ PRD 对齐

**总体：强对齐。** reconcile-prd.md 确认所有与 UX 相关的 FR 均已覆盖。主要发现：

| 方面 | 状态 | 说明 |
|---|---|---|
| FR-1 账密登录 | ✅ | 登录页面 + 状态模式 |
| FR-2 GitHub OAuth | ✅ | OAuth 按钮 + 失败状态 |
| FR-3 会话管理 | ✅ | Token 刷新 + 重定向 |
| FR-5 API 网关鉴权 | ✅ | 未认证 → 重定向到登录页 |
| FR-6 速率限制 | ✅ | 429 通知模式 |
| FR-9 错误信息安全 | ✅ | 工具失败状态隐藏后端详情 |
| FR-12 输入输出安全 | ✅ | 结果区域 XSS 过滤 |
| FR-13 工具注册协议 | ✅ | YAML 驱动的表单渲染 |
| FR-14 工具执行管道 | ✅ | 提交 → 加载中 → 结果流程 |
| FR-15 工具管理界面 | ✅ | 管理员工具管理页面 |
| FR-16 调用日志 | ✅ | 管理员日志页面 |
| FR-17 管理仪表盘 | ✅ | 管理员仪表盘页面 |
| FR-18 异常处置 | ✅ | 管理员用户管理：禁用/限流 |
| FR-19 管理员角色 | ✅ | 侧边栏"管理"入口仅管理员可见 |
| FR-4/7/8/10 | ➖ | 基础设施层，无 UX 界面 — 正确排除 |

### UX ↔ 架构对齐

**总体：基本对齐，存在少量关注点。**

| 方面 | 状态 | 说明 |
|---|---|---|
| Ant Design 5 + ConfigProvider | ✅ | 架构指定 React + antd；UX 使用 ConfigProvider 主题系统 |
| 暗色模式机制 | ⚠️ | UX 指定自定义 darkAlgorithm；架构未详述主题实现 |
| 响应式断点 | ✅ | 架构和 UX 均使用 antd lg/md/sm 断点 |
| YAML 驱动的工具表单 | ✅ | 架构（ARCH-15 ToolConfigLoader）支持 UX（工具操作模板） |
| JWT + httpOnly cookie | ✅ | 架构（ARCH-5）匹配 UX 状态模式（token 刷新） |
| Redis nonce/限流 | ✅ | 架构（ARCH-4）支持 UX 交互模式 |
| XSS 过滤（DOMPurify） | ⚠️ | UX 指定 DOMPurify；架构提及输入净化但未指名具体库 |
| WCAG 2.2 AA | ⚠️ | UX 指定 AA 合规；架构确认但未指定无障碍测试方案 |

### 对齐问题

#### 严重 — 颜色对比度不达标（来自 review-accessibility.md）

1. **GAP-04：亮色模式主色 `#6C5CE7` 在白底上未达到 AA 对比度（3.88:1，要求 4.5:1）**
   - DESIGN.md 前言中指定 `primary: '#5C4FD0'`，但无障碍审查引用的是 `#6C5CE7`
   - DESIGN.md 前言中的值 `#5C4FD0` 在白底上约 4.5:1 对比度 — 大文本可能通过 AA
   - **但是：** 无障碍审查基于较早的颜色值进行。当前 DESIGN.md 使用的 `#5C4FD0` 更深，更接近通过标准。
   - **影响：** 需要验证 — 如果 `#5C4FD0` 在白底上达到 4.5:1，则此缺口已解决。否则，主色需进一步加深。
   - **建议：** 在实现前通过程序化方式验证 `#5C4FD0` 在 `#FFFFFF` 上的对比度。

2. **GAP-05：亮色模式强调色未达到 AA 对比度**
   - 与 GAP-04 类似 — 需验证当前 `#D97020` 是否通过，审查使用的是 `#FF8C42`
   - `#D97020` 在白底上 ≈ 3.6:1 — 大文本（3:1）和非文本 UI（3:1）通过 AA，但正文文本（4.5:1）未通过
   - **建议：** 仅接受强调色用于非文本用途（徽章、异常标记），确保不用于正文文本

#### 高 — 暗色模式机制矛盾（来自 review-consistency.md）

3. **ISSUE-1：标准 antd `darkAlgorithm` 无法生成 DESIGN.md 指定的精确暗色 token**
   - EXPERIENCE.md 描述使用 antd 5 ConfigProvider + `darkAlgorithm`
   - DESIGN.md 指定了精确的暗色 token（`primary-dark: '#A29BFE'`、`accent-dark: '#FFB07A'`）
   - antd 默认 `darkAlgorithm` 从亮色 token 自动计算暗色变体 — 不会从 `#5C4FD0` 生成 `#A29BFE`
   - **需要解决：** EXPERIENCE.md 必须指定使用**自定义** darkAlgorithm 手动注入 DESIGN.md 的暗色 token，而非标准 `darkAlgorithm`
   - **影响：** 不做此澄清，开发者将实现错误的暗色模式颜色
   - **备注：** Epic（Story 1.8）和 UX-DR1 已指定"自定义 darkAlgorithm 扩展（非 antd 默认 darkAlgorithm）" — 如按此执行则可解决该问题

#### 中 — 响应式设计缺口（来自 review-responsive.md）

4. **ISSUE：移动端侧边栏抽屉关闭时无用户菜单入口**
   - UX 指定头像位于侧边栏底部；移动端（<768px）侧边栏为抽屉式
   - 抽屉关闭时，无法访问个人设置或注销
   - **但是：** UX-DR16 和 EXPERIENCE.md 指定了"手机端顶栏右侧头像图标触发" — 这似乎已解决该问题
   - **影响：** UX 文档中已处理，但 Story 必须实现移动端顶栏头像

5. **ISSUE：工具操作页面在 EXPERIENCE.md 中缺少明确的响应式规则**
   - 响应式部分覆盖了侧边栏、工具网格和管理表格 — 但未涉及工具操作页面
   - 而工具操作页面是核心用户交互界面
   - **但是：** Epic 中的 UX-DR9 提供了工具操作页面的具体响应式规则
   - **影响：** Epic 中已处理，但 UX 文档应更新以保持一致性

6. **WARNING：移动端管理筛选器折叠行为未充分定义**
   - 移动端管理筛选器缺少明确的 Collapse 组件规格
   - **建议：** 补充到 EXPERIENCE.md 或 Story 验收标准中

### 警告

1. **signingKey 存储差异** — PRD 声明"仅内存"，Story 1.9 使用 sessionStorage。UX 未涉及此问题，但它影响防重放安全模型。
2. **WCAG 测试方案** — UX 指定 WCAG 2.2 AA 合规，但架构和 Epic 中均未记录自动化或手动测试计划。
3. **Ant Design 版本** — DESIGN.md 引用"Ant Design 5"，但 CLAUDE.md/架构指定"Ant Design 6"。这是一个**关键版本不匹配**，影响 ConfigProvider API、darkAlgorithm 行为和组件可用性。
4. **DOMPurify 无对应 Story** — XSS 输出过滤（NFR-6）在 UX 中有规定，但无 Story 明确要求在前端集成 DOMPurify。

### UX 对齐总结

| 类别 | OK | Issue | Warning |
|---|---|---|---|
| UX ↔ PRD 对齐 | 14 | 0 | 0 |
| UX ↔ 架构对齐 | 5 | 0 | 2 |
| 颜色对比度（无障碍） | 1 | 1 | 1 |
| 暗色模式机制 | 0 | 1 | 0 |
| 响应式设计 | 2 | 0 | 2 |
| 版本一致性 | 0 | 0 | 1 |
| **合计** | **22** | **2** | **6** |

## Epic 质量审查

### Epic 结构验证

#### 用户价值聚焦

| Epic | 标题 | 用户价值？ | 评估 |
|---|---|---|---|
| Epic 1 | 项目基础与安全骨架 | ⚠️ 混合 | 描述以用户为中心（"用户可以注册、登录"），但标题偏基础设施。10 个 Story 中 6 个有用户画像；4 个面向开发者。 |
| Epic 2 | AI 工具集成框架 | ✅ 是 | 用户成果清晰：浏览工具、执行 AI、查看结果。6 个 Story 中 4 个面向用户。 |
| Epic 3 | 管理与监控后台 | ✅ 是 | 管理员价值清晰：监控、审计、管理用户、部署。4 个 Story 中 3 个面向管理员。 |

#### Epic 独立性

| 测试 | 结果 | 说明 |
|---|---|---|
| Epic 1 可独立运行？ | ✅ | 完整的鉴权 + 安全 + 主题 UI。自包含。 |
| Epic 2 仅依赖 Epic 1？ | ✅ | 工具框架仅需 Epic 1 的鉴权。 |
| Epic 3 独立于 Epic 2？ | ❌ | Story 3.1 读取 Story 2.1 创建的 audit_logs。Story 3.2 查询 Epic 2 的工具执行数据。Story 3.4 部署包含 Epic 2 的完整系统。 |

### 🔴 严重违规

#### CV-1：Epic 3 依赖 Epic 2 的数据

**Epic 3 无法独立于 Epic 2 部署：**
- Story 3.1（调用日志）需要 `audit_logs` 表（Story 2.1）和工具执行数据（Story 2.3）
- Story 3.2（仪表盘）查询工具执行产生的审计数据（Epic 2）
- Story 3.4（生产部署）打包包含 Epic 2 组件的完整系统

**修复选项：**
1. **合并 Epic 2 和 3** 为一个"AI 工具与管理" Epic — 消除虚假的分离
2. **重组：** 将 audit_logs 建表（Story 2.1）和审计日志记录（Story 2.3 的审计步骤）移入 Epic 3 作为前置条件，使 Epic 3 仅依赖 Epic 1
3. **接受依赖** 作为务实选择 — Epic 3 在逻辑上扩展 Epic 2，对于 <10 用户的系统，顺序交付完全可行

**建议：** 选项 3（接受）对本项目规模最为务实，但应在 Epic 描述中明确记录该依赖关系。

### 🟠 主要问题

#### MI-1：Story 2.3 过大（合并了 5+ 个 FR）

Story 2.3（工具执行管道与 AI 代理层）覆盖了：
- FR-9：AI 请求代理
- FR-10：AI 密钥服务端托管
- FR-11：AI 请求代理（路由）
- FR-12：输入输出安全
- FR-14：工具执行管道
- 以及：审计日志

这实质上是一个**伪装成 Story 的迷你 Epic**。它合并了后端管道、代理服务、输入校验、输出过滤和审计日志。

**修复方案：** 拆分为至少 2 个 Story：
- Story 2.3a：工具执行管道 + AI 代理（FR-9、FR-10、FR-11、FR-14）
- Story 2.3b：输入输出安全 + 审计日志（FR-12、FR-16 部分）

#### MI-2：Story 1.6 合并了限流和防重放（2 个不同的 FR）

Story 1.6（速率限制与请求防重放）合并了 FR-6 和 FR-7。两者均为复杂的、可独立测试的功能。限流使用 Redis 滑动窗口；防重放使用 HMAC 签名 + nonce 去重。实现路径不同，测试策略不同。

**修复方案：** 拆分为：
- Story 1.6a：速率限制（FR-6）— Redis 滑动窗口、单用户/单 IP、429 响应
- Story 1.6b：请求防重放（FR-7）— HMAC-SHA256 签名、nonce Redis 去重、时间戳校验

#### MI-3：Story 1.7 合并了 CORS + 错误脱敏 + 全局异常处理

Story 1.7（CORS、错误脱敏与全局异常处理）合并了 FR-8（CORS）、FR-19（错误安全）和全局异常处理。三个独立关注点。

**修复方案：** 拆分为：
- Story 1.7a：CORS 配置（FR-8）
- Story 1.7b：错误脱敏 + 全局异常处理器（FR-19）+ 请求 ID 生成

#### MI-4：FR-19 角色升降级未在任何 Story 中覆盖

PRD FR-19 声明"管理员可升级/降级其他用户的角色"。Story 3.3 覆盖了禁用/启用和限流，但完全未提及角色管理。Epic FR 覆盖矩阵声称 FR-19 由 Epic 1（Story 1.2）覆盖，但 Story 1.2 仅在数据库中创建 `role` 列 — 并未实现任何变更角色的 UI 或 API。

**修复方案：** 在 Story 3.3（用户管理）中添加角色管理：
- 添加 API：`PUT /api/admin/users/{userId}/role`
- 添加 UI：用户操作菜单中的角色下拉框
- 添加 AC：管理员可将用户提升为 ADMIN / 将 ADMIN 降级为 USER

#### MI-5：FR-2 GitHub OAuth 解绑未覆盖

PRD FR-2 声明"已有账密账号可绑定 GitHub"。绑定在 Story 1.5 中覆盖，但无 Story 覆盖解绑 GitHub 账号。如果用户误绑了错误的 GitHub 账号，无自助恢复路径。

**修复方案：** 在 Story 1.10（个人设置）中添加解绑功能：
- 添加 API：`DELETE /api/users/me/github`
- 添加 UI：个人设置中的"解绑 GitHub"按钮（GitHub 已绑定时可见）
- 添加 AC：解绑后，GitHub 登录不再适用于该账号

### 🟡 次要关注

#### MC-1：Story 1.8 合并了主题系统 + 暗色模式 + 响应式布局

Story 1.8（前端品牌主题系统与布局）覆盖了 UX-DR1 到 UX-DR4 以及完整的 AppLayout 组件和三个响应式断点。这是一个较大的 Story，但这些关注点紧密耦合（主题影响布局，暗色模式是主题的一部分）。

**建议：** 可保持现状，但需确保开发者分配充足时间。建议设定时间盒。

#### MC-2：Story 1.2 提前创建了 refresh_tokens 表

Story 1.2（数据库 Schema）创建了 `refresh_tokens` 表，但刷新逻辑在 Story 1.4 中。这与"首次需要时建表"的最佳实践略有偏差，但该表体量小且与用户表 schema 紧密耦合，可以接受。

**建议：** 保持现状。将其拆分到 Story 1.4 反而会使迁移历史不够连贯。

#### MC-3：Epic 1 中的 Story 用户画像不一致

Epic 1 的 Story 在用户画像间交替：
- 1.1、1.2、1.6、1.7："作为开发者"
- 1.3、1.4、1.5："作为用户"
- 1.8、1.9、1.10："作为用户"

Story 1.6 使用"作为管理员"，但限流功能惠及所有用户，而不仅是管理员。

**建议：** 考虑将 1.6 的用户画像改为"作为系统使用者"，或拆分为面向用户和面向管理员两方面。

#### MC-4：无明确的 CI/CD Story

对于一个使用 Docker Compose 部署的全新项目，没有 CI/CD 流水线搭建的 Story。Story 3.4 覆盖了生产部署配置，但不涉及自动化构建/测试/部署流水线。

**建议：** 对于 v1 且 <10 用户的场景，手动部署可以接受。在后续迭代中添加 CI/CD Story。

### 最佳实践合规总结

| 检查项 | Epic 1 | Epic 2 | Epic 3 |
|---|---|---|---|
| Epic 交付用户价值 | ✅ | ✅ | ✅ |
| Epic 可独立运行 | ✅ | ✅ | ❌ |
| Story 规模适当 | ⚠️（1.6、1.7、1.8 偏大） | ❌（2.3 过大） | ✅ |
| 无前向依赖 | ✅ | ✅ | ⚠️ |
| 数据表按需创建 | ✅ | ✅ | ✅ |
| 验收标准清晰 | ✅ | ✅ | ✅ |
| FR 可追溯性维护 | ✅ | ✅ | ⚠️（FR-19、FR-2 部分） |

## 总结与建议

### 总体就绪状态

## ⚠️ 需要修改 — 有条件就绪

阿渺工具箱的规划文档**整体全面且对齐良好**。PRD 内容扎实，UX 文档成熟度罕见（配有专项无障碍、一致性和响应式审查），架构文档覆盖了所有主要关注点。Epic 实现了 100% 的 FR 覆盖。

但**有 5 个问题必须在实现前解决**以避免返工，另有 **4 个问题建议处理**以确保交付质量。

### 需立即处理的严重问题（实现前必须修复）

| # | 问题 | 类别 | 影响 |
|---|---|---|---|
| 1 | **Ant Design 版本不匹配** — DESIGN.md 标注"Ant Design 5"，CLAUDE.md/架构标注"Ant Design 6" | 跨文档一致性 | ConfigProvider API 不同、darkAlgorithm 行为差异、组件可用性不同。开发者无法确定安装哪个版本。 |
| 2 | **Story 2.3 过大** — 单个 Story 合并了 5+ 个 FR（管道、代理、安全、审计） | Story 规模 | 需要多个迭代才能完成。阻塞 Story 2.4、2.5、2.6。 |
| 3 | **FR-19 角色管理缺失** — PRD 声明管理员可升降级角色，但无 Story 实现此功能 | FR 缺口 | 无角色变更管理界面。仅迁移脚本创建首个管理员。 |
| 4 | **signingKey 存储冲突** — PRD 声明"仅内存"，Story 1.9 使用 sessionStorage | PRD↔Story 不一致 | 安全模型不匹配。sessionStorage 可被 XSS 访问；PRD 明确避免此情况。 |
| 5 | **颜色对比度需验证** — 无障碍审查基于较早颜色标记了对比度不达标；当前 DESIGN.md 值（`#5C4FD0`、`#D97020`）需程序化验证 | 无障碍 | WCAG 2.2 AA 合规存在风险。必须在构建主题系统前验证。 |

### 建议的后续步骤

1. **确定 Ant Design 版本** — 将 DESIGN.md 更新为引用"Ant Design 6"，与 CLAUDE.md 和 architecture.md 保持一致。验证 antd 6 的 ConfigProvider API 和 darkAlgorithm 行为是否匹配 UX 规格。

2. **拆分 Story 2.3** 为两个 Story：
   - Story 2.3a：工具执行管道 + AI 代理（FR-9、FR-10、FR-11、FR-14）
   - Story 2.3b：输入输出安全 + 审计日志（FR-12、FR-14 的审计步骤）
   - 这可更早解锁 Story 2.4/2.5，并使每个 Story 可独立测试。

3. **在 Story 3.3 中添加角色管理** — 添加 `PUT /api/admin/users/{userId}/role` API + 角色下拉 UI + 升降级 AC。填补 FR-19 缺口。

4. **解决 signingKey 存储问题** — 两种方案：
   - 更新 PRD 接受 sessionStorage（承认 XSS 权衡），或
   - 更新 Story 1.9 使用 React context/state 变量（纯内存）替代 sessionStorage
   - 建议：使用 React context + 闭包存储，页面刷新后不保留但对 XSS 不可访问。

5. **程序化验证颜色对比度** — 对 `#5C4FD0` 在 `#FFFFFF` 上和 `#D97020` 在 `#FFFFFF` 上执行对比度检查，然后再构建主题系统。如果 `#5C4FD0` 未达到 4.5:1，加深至 `#5545C5` 或类似值。将强调色标注为"仅非文本用途"以满足 AA 合规。

6. **在 Story 1.10 中添加 GitHub 解绑** — 添加 `DELETE /api/users/me/github` + "解绑 GitHub" UI + AC。工作量小，用户价值高。

7. **考虑拆分 Story 1.6 和 1.7** — 各合并了 2-3 个不同的 FR。拆分可提高可测试性和并行性。如果团队资源有限，可保持现状但设定时间盒。

8. **在 Epic 描述中明确记录 Epic 3 → Epic 2 的依赖**。作为本项目规模的务实选择予以接受。

### 按严重程度分类的问题

| 严重程度 | 数量 | 关键项 |
|---|---|---|
| 🔴 严重（必须修复） | 5 | Ant Design 版本、Story 2.3 规模、FR-19 缺口、signingKey 冲突、颜色对比度 |
| 🟠 主要（应该修复） | 5 | Story 1.6 拆分、Story 1.7 拆分、FR-2 解绑、Epic 3 依赖、DOMPurify Story |
| 🟡 次要（锦上添花） | 4 | Story 1.8 规模、Story 1.2 建表时机、用户画像不一致、CI/CD Story |
| ℹ️ 信息 | 3 | FR-4/FR-10 Epic 归属不匹配、NFR-18 不可测试、WCAG 测试方案 |

### 当前规划的优势

- **PRD 质量出色** — 全部 19 个 FR 具有可验证结果，假设明确标注，非目标已声明，MVP 范围清晰
- **UX 文档成熟** — 专项无障碍审计、一致性审查和响应式审查在项目中少见且有价值
- **Epic 100% FR 覆盖**，配有详细的 BDD 验收标准
- **架构范围合理** — 为 <10 用户系统正确识别了 12-15 个组件
- **安全优先设计** — 每个 FR 的安全影响均已处理
- **YAML 驱动的工具注册** — 配置与代码的清晰分离

### 结语

本次评估在 5 个类别中发现了 **17 个问题**：文档一致性、FR 覆盖缺口、Story 规模、安全模型和无障碍合规。5 个严重问题均可直接解决 — 无需根本性重构。规划文档基础扎实，一旦解决这些问题，项目即可进入实现阶段。

**评估方：** 实现就绪检查（bmad-check-implementation-readiness）
**日期：** 2026-06-07
