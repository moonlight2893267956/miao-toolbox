# 阿渺工具箱 — 文档索引

> 全部文档按角色分组，新人请按"我属于哪个角色"直接跳。

## 给所有人

| 文档 | 说明 |
|---|---|
| [README.md](../README.md) | 项目门面：技术栈、快速开始、功能列表 |
| [CHANGELOG.md](../CHANGELOG.md) | 版本变更记录 |

## 给开发者（接入 / 改代码）

| 文档 | 说明 |
|---|---|
| [AGENTS.md](../AGENTS.md) | AI 代理通用开发指南（Codex / 通用） |
| [CLAUDE.md](../CLAUDE.md) | Claude Code 专属补充（验收方案/验收脚本） |
| [architecture.md](architecture.md) | 系统架构（模块、请求链、安全、数据模型） |

**开发流程、编码规范、测试要求、提交规范、敏感信息红线** 全部在 `AGENTS.md` 和 `CLAUDE.md` 里。

## 给运维（部署 / 维护）

| 文档 | 场景 | 大致阅读时间 |
|---|---|---|
| [deployment.md](deployment.md) | 首次部署到生产 | 30 分钟 |
| [operations.md](operations.md) | 日常运维 SOP（高频命令、回滚、监控） | 10 分钟 |
| [troubleshooting.md](troubleshooting.md) | 故障排查手册（按问题查） | 按需 |

**遇到报错先查** [troubleshooting.md](troubleshooting.md) **，不查文档先问 AI 会浪费半小时**。

## 给架构师 / 交接

| 文档 | 场景 |
|---|---|
| [architecture.md](architecture.md) | 系统全貌、技术决策、数据模型 |
| [../_bmad-output/planning-artifacts/](../_bmad-output/planning-artifacts/) | 完整需求/Epic/Story 历史归档（**只读参考**） |

---

## 目录结构（已收敛）

```
miao-toolbox/
├── README.md                # 项目门面
├── CHANGELOG.md             # 版本变更
├── AGENTS.md                # AI 代理通用指南
├── CLAUDE.md                # Claude Code 专属补充
│
├── docs/                    # 统一为复数
│   ├── README.md            # ← 你在这里
│   ├── architecture.md      # 系统架构
│   ├── deployment.md        # 首次部署
│   ├── operations.md        # 日常运维
│   └── troubleshooting.md   # 故障排查
│
├── scripts/                 # 部署/验收脚本
└── _bmad-output/            # 历史规划产物（PRD/Epic/Story）
```

> 历史说明：原 `doc/architecture.md`（单数）已迁移到 `docs/architecture.md`，`doc/` 目录废弃。
