# Reconcile — PRD Source

**Source:** `prd-miao-toolbox-2026-06-06/prd.md`

## FR Coverage

| FR | 覆盖状态 | 备注 |
|----|---------|------|
| FR-1 账密注册/登录 | ✅ | 登录页 + 状态模式覆盖 |
| FR-2 GitHub OAuth | ✅ | 登录页 OAuth 按钮 + 失败态 |
| FR-3 会话管理 | ✅ | Token 过期静默刷新 + 重定向 |
| FR-4 传输加密 | ➖ | 基础设施层，UX 不涉及 |
| FR-5 API 网关鉴权 | ✅ | 未登录重定向登录页 |
| FR-6 速率限制 | ✅ | 429 状态模式：Notification 提示 |
| FR-7 请求防重放 | ➖ | 协议层，前端签名逻辑 UX 不涉及 |
| FR-8 CORS | ➖ | 基础设施层 |
| FR-9 错误信息安全 | ✅ | 工具执行失败态：不暴露后端细节 |
| FR-10 AI 密钥托管 | ➖ | 后端实现层 |
| FR-11 AI 请求代理 | ✅ | 统一工具执行管道 |
| FR-12 输入输出安全 | ✅ | 结果区 XSS 过滤（行为层） |
| FR-13 工具注册协议 | ✅ | Tool operation template — YAML 驱动表单渲染 |
| FR-14 工具执行管道 | ✅ | 提交 → loading → 结果展示 流程 |
| FR-15 工具管理界面 | ✅ | 管理后台-工具管理页面 |
| FR-16 调用日志 | ✅ | 管理后台-调用日志页面 |
| FR-17 管理仪表盘 | ✅ | 管理后台-仪表盘页面 |
| FR-18 异常处置 | ✅ | 管理后台-用户管理：禁用/限流 |
| FR-19 管理员角色 | ✅ | 侧栏"管理"入口仅管理员可见 |

## UJ Coverage

| 旅程 | 覆盖状态 |
|------|---------|
| UJ-1 用户登录使用工具 | ✅ Key Flow 1 完整覆盖 |
| UJ-2 管理员监控异常 | ✅ Key Flow 2 完整覆盖 |

## Dropped Items

无。PRD 中所有 UX 相关的需求均已覆盖。未覆盖的 FR（4/7/8/10）属于基础设施/协议层，不涉及界面设计。

## Qualitative Notes

- PRD 明确 v1 是"安全骨架"，具体业务工具交互（翻译输入框设计、文生图画廊等）不在本版范围。UX spine 通过 Tool operation template（通用模板）覆盖了这个框架需求。
- PRD 的 `[ASSUMPTION]` 标注中涉及 UX 的均已在 State Patterns 中体现（如 Token 过期行为、仪表盘手动刷新、限流提示）。
