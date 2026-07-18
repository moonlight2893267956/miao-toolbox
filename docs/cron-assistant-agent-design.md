# cron-assistant Agent 设计文档

> 版本：v1.0 | 日期：2026-07-18 | 作者：AI Assistant

## 1. 概述

**cron-assistant** 是 miao-ai 平台上的一个 AI Agent，为阿渺工具箱的 Cron 表达式编辑器提供五种 AI 增强能力：自然语言生成 Cron、Cron 详解、优化建议、排错诊断、方言转换。

### 1.1 在系统中的位置

```
用户浏览器
    ↓ POST /api/cron/ai 或 /api/cron/ai/stream
miao-toolbox-api (CronAIController)
    ↓ MiaoAiClient.invoke("cron-assistant", input, metadata)
miao-ai 平台 (cron-assistant Agent)
    ↓ LLM 调用
大语言模型 (GPT-4o / Claude / DeepSeek 等)
```

### 1.2 设计原则

- **无状态**：每次请求独立，diagnose 的多轮对话由前端携带 `conversation` 历史传入，Agent 自身不维护会话。
- **结构化输出**：返回 JSON 格式（见 §2.3），miao-toolbox-api 解析后返回前端；前端（流式）将整个 `output` JSON 作为 token 逐段拼接后在 `done` 事件解析。
- **方言感知**：输入包含 `dialect`（`linux5` / `spring6`），Agent 据此生成/转换对应方言的字段顺序与特殊字符（`?`、`L`、`W`、`#` 等）。
- **安全边界**：输入校验在 miao-toolbox-api 层完成（见 `CronAIController.validateRequest`），Agent 只处理已验证的输入。

## 2. API 契约

### 2.1 调用方式

```
POST {base_url}/api/v1/agents/cron-assistant/invoke
Authorization: Bearer {api_key}
Content-Type: application/json
```

### 2.2 请求格式

```json
{
  "input": {
    "task": "generate | explain | optimize | diagnose | convert",
    "description": "自然语言描述（generate 时必填）",
    "expression": "Cron 表达式（explain/optimize/diagnose/convert 时必填）",
    "dialect": "linux5 | spring6（可选，当前表达式方言）",
    "targetDialect": "linux5 | spring6（convert 时必填）",
    "phenomenon": "现象描述（diagnose 时必填）",
    "conversation": [{ "role": "user|assistant", "content": "..." }]
  },
  "metadata": {
    "tool": "cron-editor",
    "action": "generate | explain | optimize | diagnose | convert"
  }
}
```

### 2.3 响应格式（output 契约）

Agent 的 `output` 字段必须包含以下结构中**对应任务所需的字段**（未涉及的字段可省略，省略即视为 null）：

```json
{
  "output": {
    "expression": "生成 / 优化后 / 排错修正后的 Cron 表达式",
    "dialect": "linux5 | spring6（与 expression 对应）",
    "originalExpression": "原文（optimize/convert/diagnose 可选回显）",
    "optimizedExpression": "（已废弃）旧 optimize 契约字段，仅前端兼容兜底；新 agent 用 suggestions 内嵌",
    "convertedExpression": "转换后的表达式（convert 必填）",
    "explanation": "解释 / 转换说明文本（Markdown 推荐：标题/列表/行内代码；前端 MarkdownView 安全渲染）",
    "suggestions": ["优化建议1", "优化建议2"],
    "diagnosis": "排错诊断文本（diagnose 必填）",
    "model": "gpt-4o",
    "mode": "sync | stream"
  },
  "trace_id": "abc-123",
  "latency_ms": 2345
}
```

### 2.4 各任务详细规格

#### generate — 自然语言生成 Cron

| 字段 | 必填 | 说明 |
|---|---|---|
| `input.task` | ✅ | `"generate"` |
| `input.description` | ✅ | 自然语言描述，如"每天工作日早上9点半" |
| `input.dialect` | ❌ | 目标方言，缺省默认 `linux5` |

**输出要求**：
- `expression`：生成的 Cron 表达式，字段间以单空格分隔，不含额外分隔符。
- `dialect`：与生成表达式对应的方言；未指定时返回 `linux5`。
- `explanation`：可选，简述表达式含义。

**示例**：

输入：
```json
{ "task": "generate", "description": "每天工作日早上9点半", "dialect": "linux5" }
```

输出：
```json
{
  "expression": "30 9 * * 1-5",
  "dialect": "linux5",
  "explanation": "工作日（周一至周五）每天 09:30 执行"
}
```

#### explain — Cron 详解

| 字段 | 必填 | 说明 |
|---|---|---|
| `input.task` | ✅ | `"explain"` |
| `input.expression` | ✅ | 待解释的 Cron 表达式 |
| `input.dialect` | ❌ | 当前方言 |

**输出要求**：
- `expression`：原样回显输入表达式（便于前端对照）。
- `explanation`：中文深度解读，包含触发频率、潜在陷阱（如"2月无31号"）、与常见需求的匹配度。

**示例**：

输入：
```json
{ "task": "explain", "expression": "0 0 1 1 *" }
```

输出：
```json
{
  "expression": "0 0 1 1 *",
  "explanation": "每年 1 月 1 日 00:00 执行一次。该表达式每年仅触发一次，适合年度统计类任务。"
}
```

#### optimize — 优化建议

| 字段 | 必填 | 说明 |
|---|---|---|
| `input.task` | ✅ | `"optimize"` |
| `input.expression` | ✅ | 待优化的 Cron 表达式 |
| `input.dialect` | ❌ | 当前方言 |

**输出要求（权威契约，见 `architecture/architecture-cron-ai-agent-2026-07-18/design-cron-ai-agent.md` §6）**：
- `suggestions`：字符串数组，**每条建议内嵌优化后的 Cron 表达式**，格式为 `"{优化后表达式} — {理由}"`，例如 `"*/5 * * * * — 原写法逐分钟列举，等价于每 5 分钟一次"`。前端逐条解析表达式并提供「应用」按钮（§5.2c）。
- `explanation`：解释优化了什么。
- `originalExpression`：可选，回显原文。
- 旧契约 `expression` / `optimizedExpression`：**已废弃**，前端仅作兼容兜底（当 `suggestions` 缺失时）。新 agent **不要**再单独返回这两个字段。

> 注意：前端对 optimize 的「应用」依赖 `suggestions` 中内嵌的表达式；请务必用 `"{表达式} — {理由}"` 格式，否则前端只能退回到兼容字段。

**示例**：

输入：
```json
{ "task": "optimize", "expression": "0,5,10,15,20,25,30,35,40,45,50,55 * * * *" }
```

输出：
```json
{
  "explanation": "原写法逐分钟列举，等价于每 5 分钟执行一次",
  "suggestions": [
    "*/5 * * * * — 使用步长写法更简洁且不易出错",
    "0 */1 * * * — 若需对齐整点外的特殊分钟，再考虑枚举写法"
  ]
}
```

#### diagnose — 排错诊断

| 字段 | 必填 | 说明 |
|---|---|---|
| `input.task` | ✅ | `"diagnose"` |
| `input.expression` | ✅ | 当前（疑似有问题）的 Cron 表达式 |
| `input.phenomenon` | ✅ | 现象描述，如"任务没按时触发" |
| `input.dialect` | ❌ | 当前方言 |
| `input.conversation` | ❌ | 多轮追问历史 |

**输出要求**：
- `diagnosis`：根因诊断文本（必填），说明为什么表达式不符合预期（如"2月没有31号"）。
- `expression`：**修正后的 Cron 表达式（必填）**。这是一键采纳回填的关键字段——前端会在排错结果顶部展示「采纳修正」按钮，点击即把该表达式回填主编辑器（经本地校验安全网）。若问题无需改动表达式（如仅是触发时机误解），返回原表达式。
- `originalExpression`：可选，回显原文，前端以删除线展示「原 → 修正」。
- `explanation`：可选，补充说明。

> ⚠️ **关键契约**：`diagnose` 应优先返回结构化 `expression`（修正结果），前端据此在排错结果顶部展示「采纳修正」按钮。
>
> 若 Agent 框架不便输出独立 `expression` 字段，也**允许把修正表达式嵌在 `diagnosis` 文本中**（如"建议改为 `0 0 L 2 *`"）——前端会正则提取其中的 5/6 段 Cron 作为采纳来源（前提是片段与原表达式不同、且形如合法 Cron）。两种返回方式前端均兼容，但**结构化 `expression` 字段优先级更高、最稳妥**。

**示例**：

输入：
```json
{ "task": "diagnose", "expression": "0 0 31 2 *", "phenomenon": "任务没按时触发" }
```

输出：
```json
{
  "expression": "0 0 L 2 *",
  "originalExpression": "0 0 31 2 *",
  "diagnosis": "2 月没有 31 号，原表达式永远不会触发。改用 L（该月最后一天）即可在每年 2 月最后一天 00:00 执行。",
  "explanation": "L 表示月份中的最后一天，自动适配大小月与闰年。"
}
```

#### convert — 方言转换

| 字段 | 必填 | 说明 |
|---|---|---|
| `input.task` | ✅ | `"convert"` |
| `input.expression` | ✅ | 待转换的 Cron 表达式 |
| `input.targetDialect` | ✅ | 目标方言 `linux5` / `spring6` |
| `input.dialect` | ❌ | 源方言（可由表达式字段数推断） |

**输出要求**：
- `convertedExpression`：转换后的表达式（必填）。
- `originalExpression`：回显原文。
- `dialect`：等于 `targetDialect`。
- `explanation`：说明转换点（如"日字段替换为 ?，并在首位补秒字段 0"）。

**示例**：

输入：
```json
{ "task": "convert", "expression": "0 9 * * 1-5", "targetDialect": "spring6" }
```

输出：
```json
{
  "convertedExpression": "0 0 9 ? * 1-5",
  "originalExpression": "0 9 * * 1-5",
  "dialect": "spring6",
  "explanation": "Linux 5 位升为 Quartz 6 位：首位补秒 0，日字段在星期存在时改写为 ?（Quartz 中日与星期互斥）。"
}
```

## 3. Agent 实现指南

### 3.1 技术选型

| 组件 | 推荐方案 |
|---|---|
| Agent 框架 | miao-ai Agent SDK (Python) |
| LLM | GPT-4o / Claude 3.5 Sonnet / DeepSeek V3 |
| 部署 | 注册到 miao-ai 平台，由平台托管 |

### 3.2 System Prompt 设计

```
你是一个 Cron 表达式专家助手，服务于阿渺工具箱的 Cron 编辑器。用户会提出五类请求：

1. generate：根据自然语言描述生成 Cron 表达式
2. explain：解释给定 Cron 表达式的含义
3. optimize：对给定 Cron 表达式提出简化/优化建议
4. diagnose：结合现象描述诊断表达式为何不生效，并给出修正
5. convert：在 Linux 5 位（分 时 日 月 星期）与 Spring/Quartz 6 位（秒 分 时 日 月 星期）之间转换

## 输出规则（必须严格遵守）

你必须返回 JSON 格式（也可逐 token 流式输出同一 JSON）。字段按任务选择：

- generate：必须返回 expression（生成的表达式）；建议返回 dialect（linux5/spring6）；可返回 explanation
- explain：返回 expression（原样）+ explanation（中文详解）
- optimize：必须返回 `suggestions`（每条 `"{优化后表达式} — {理由}"`）；可返回 `explanation`、`originalExpression`。**不再使用** `expression`/`optimizedExpression` 单字段（旧字段仅前端兼容兜底）
- diagnose：必须返回 diagnosis（根因）+ expression（修正后的标准表达式）；可返回 originalExpression、explanation
- convert：必须返回 convertedExpression（转换结果）+ dialect（= targetDialect）；可返回 originalExpression、explanation

## 硬性要求

- diagnose 的 expression 必须是可直接使用的修正表达式，不要只把修正写在 diagnosis 文本里
- 表达式字段间以单空格分隔，不要包含 / 等包裹符或多余标点
- 6 位方言（spring6）首位为秒；日与星期同时存在时，其中一个必须用 ? 表示"不指定"
- L/W/# 仅用于日或星期字段
- 不要把解释文本塞进 expression 字段
- 优化时不要改变原表达式的触发语义
```

### 3.3 部署配置

在 miao-ai 平台注册 `cron-assistant`，并在 Nacos（`nacos-config/*/miao-ai.yaml`）配置 `base-url`、`api-key`、`read-timeout` 等。后端 `CronAIService` 通过 `MiaoAiProperties.getAgent("cron-assistant")` 读取。

### 3.4 字段映射（后端 → 前端）

| Agent output 字段 | 后端 CronAIResponse | 前端 CronAIResult | 用途 |
|---|---|---|---|
| `expression` | `expression` | `expression` | 生成/优化/排错修正表达式 |
| `optimizedExpression` | `optimizedExpression` | `optimizedExpression` | （已废弃）optimize 旧契约兼容兜底 |
| `originalExpression` | `originalExpression` | `originalExpression` | 原→修正对照展示 |
| `convertedExpression` | `convertedExpression` | `convertedExpression` | convert 结果 |
| `dialect` | `dialect` | `dialect` | 方言标识 |
| `explanation` | `explanation` | `explanation` | 说明文本 |
| `suggestions` | `suggestions` | `suggestions` | 优化建议列表 |
| `diagnosis` | `diagnosis` | `diagnosis` | 排错诊断文本 |
| `model` / `trace_id` | `model` / `traceId` | `model` / `traceId` | 审计与追踪 |

## 4. miao-toolbox 集成清单

### 4.1 后端（已完成）

| 文件 | 说明 |
|---|---|
| `tool/cron/CronAIController.java` | REST 端点 `POST /api/cron/ai`、`/api/cron/ai/stream`，`@RequireRoute("TOOL_CRON_EDITOR")` |
| `tool/cron/CronAIService.java` | 调用 `MiaoAiClient.invoke("cron-assistant", ...)`，解析 `output`；optimize 时 `optimizedExpression` 回填到 `expression` |
| `tool/cron/dto/CronAIRequest.java` | 请求 DTO：task + description/expression/dialect/targetDialect/phenomenon/conversation |
| `tool/cron/dto/CronAIResponse.java` | 响应 DTO：expression/optimizedExpression/originalExpression/convertedExpression/dialect/explanation/suggestions/diagnosis/model/traceId |

### 4.2 前端（已完成）

| 文件 | 说明 |
|---|---|
| `hooks/useCronAI.ts` | AI 调用 Hook：5 任务 + 流式/loading/error/result；解析 `expression`/`optimizedExpression` 等 |
| `components/AIPanel.tsx` | AI 面板：5 个 Tab；generate/optimize/diagnose 支持「采纳」回填，经本地 `validate()` 安全网 |
| `cron-editor.css` | AI 面板样式（`.ce-ai-*`） |

### 4.3 配置（已完成）

| 文件 | 说明 |
|---|---|
| `nacos-config/dev/miao-ai.yaml` | `cron-assistant` agent 配置（环境变量占位符） |
| `nacos-config/prod/miao-ai.yaml` | `cron-assistant` agent 配置（环境变量占位符） |

## 5. 错误处理

| 场景 | HTTP 状态码 | 错误码 | 处理方式 |
|---|---|---|---|
| 用户未登录 | 401 | — | Spring Security 拦截 |
| 用户无 TOOL_CRON_EDITOR 权限 | 403 | ROUTE_FORBIDDEN | @RequireRoute 拦截 |
| generate 缺 description / diagnose 缺 phenomenon 等 | 400 | INVALID_REQUEST | Controller 校验 |
| Agent 未配置 | 503 | AI_AGENT_NOT_CONFIGURED | MiaoAiProperties 抛出 |
| Agent 未启用 | 503 | AI_AGENT_DISABLED | CronAIService 校验 |
| miao-ai 服务不可用 | 503 | AI_SERVICE_UNAVAILABLE | MiaoAiClient 重试后抛出 |
| Agent 返回格式异常 | 200 | — | 后端兜底解析，前端命中「未获得有效结果，请重试」 |

## 6. 数据流

```
┌─────────────────────────────────────────────────────────────────┐
│ 前端                                                            │
│  AIPanel.tsx（5 Tab）                                           │
│    ↓ useCronAI.generate/explain/optimize/diagnose/convert       │
│  POST /api/cron/ai/stream { task, description/expression, ... } │
└──────────────────────────┬──────────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────────┐
│ 后端 (miao-toolbox-api)                                        │
│  CronAIController                                               │
│    ↓ 参数校验 + @RequireRoute                                   │
│  CronAIService                                                  │
│    ↓ buildInput() + buildMetadata()                             │
│  MiaoAiClient.invoke("cron-assistant", input, metadata)         │
│    ↓ HTTP POST + Bearer Auth + 重试                             │
│  AiInvocationRecorder（自动记录调用日志）                        │
└──────────────────────────┬──────────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────────┐
│ miao-ai 平台                                                    │
│  cron-assistant Agent                                           │
│    ↓ System Prompt + User Message                               │
│  LLM (GPT-4o / Claude / DeepSeek)                              │
│    ↓ JSON 输出（见 §2.3 各任务）                                 │
│  { expression/optimizedExpression/convertedExpression/          │
│    explanation/suggestions/diagnosis, ... }                     │
└─────────────────────────────────────────────────────────────────┘
```
