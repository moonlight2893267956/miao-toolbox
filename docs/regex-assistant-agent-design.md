# regex-assistant Agent 设计文档

> 版本：v1.0 | 日期：2026-07-18 | 作者：AI Assistant
> 关联文档：[cron-assistant-agent-design.md](./cron-assistant-agent-design.md)（本文档结构与其对齐，便于两个 AI 助手保持一致）

## 1. 概述

**regex-assistant** 是 miao-ai 平台上的一个 AI Agent，为阿渺工具箱的正则测试器（regex-tester）提供五类 AI 增强能力：自然语言生成正则（generate）、正则解释（explain）、优化建议（optimize）、匹配诊断（diagnose）、引擎方言转换（convert）。五任务均已由 `regex-assistant/agent.py` 实现并与本契约对齐（**任何 agent 调整须先更新本文档**）。

### 1.1 在系统中的位置

```
用户浏览器
    ↓ POST /api/regex/ai 或 /api/regex/ai/stream
miao-toolbox-api (RegexAIController)
    ↓ MiaoAiClient.invoke("regex-assistant", input, metadata)
miao-ai 平台 (regex-assistant Agent)
    ↓ LLM 调用
大语言模型 (GPT-4o / Claude / DeepSeek 等)
```

### 1.2 设计原则（与 cron-assistant 对齐）

- **无状态**：每次请求独立。多轮诊断（diagnose）由前端携带 `conversation` 历史传入，Agent 自身不维护会话。
- **结构化输出**：返回 JSON 格式（见 §2.3）。miao-toolbox-api 解析后返回前端；前端（流式）将整个 `output` JSON 作为 token 逐段拼接后在 `done` 事件解析（逻辑同 cron，见 `useRegexAI.ts` / `useCronAI.ts`）。
- **引擎感知（方言感知）**：输入含 `engine`（`js` / `pcre` / `python` / `java` / `go` / `golang` / `rust` 等，缺省默认 `pcre`），Agent 据此生成/转换对应引擎的元字符与特性（如 JS 不支持后行断言、Python 的 `re` 默认不带 `re.DOTALL` 等）。对应 cron 的 `dialect` 概念。
- **安全边界**：输入校验在 miao-toolbox-api 层完成（`RegexAIController.validateRequest`），Agent 只处理已验证的输入。
- **优化契约对齐 cron**：`optimize` 任务的 `suggestions` 必须内嵌优化后表达式（格式见 §2.4c），以便前端逐条解析并提供「应用」按钮——这是当前正则助手与 cron 的主要差距。

## 2. API 契约

### 2.1 调用方式

```
POST {base_url}/api/v1/agents/regex-assistant/invoke
Authorization: Bearer {api_key}
Content-Type: application/json
```

### 2.2 请求格式

```json
{
  "input": {
    "task": "generate | explain | optimize | diagnose | convert",
    "description": "自然语言描述（generate 时必填）",
    "pattern": "正则表达式（explain/optimize/diagnose/convert 时必填）",
    "flags": "当前标志位，如 'gi'（可选，用于上下文）",
    "engine": "js | pcre | python | java | go | rust（可选，当前表达式引擎）",
    "targetEngine": "目标引擎（convert 时必填）",
    "samples": ["应匹配: <文本>", "不应匹配: <文本>"],
    "conversation": [{ "role": "user|assistant", "content": "..." }]
  },
  "metadata": {
    "tool": "regex-tester",
    "action": "generate | explain | optimize | diagnose | convert"
  }
}
```

### 2.3 响应格式（output 契约）

Agent 的 `output` 字段必须包含以下结构中**对应任务所需的字段**（未涉及的字段可省略，省略即视为 null）：

```json
{
  "output": {
    "answer": "顶层展示文本（generate/diagnose = pattern，explain = explanation，optimize = 首条 suggestion 或空，convert = convertedPattern），便于前端 Try Run 直接取用",
    "pattern": "生成 / 优化后 / 诊断修正后的正则表达式",
    "engine": "js | pcre | ...（与 pattern 对应）",
    "originalPattern": "原文（optimize/convert/diagnose 可选回显）",
    "convertedPattern": "转换后的表达式（convert 必填）",
    "explanation": "解释 / 转换说明文本（Markdown 推荐：标题/列表/行内代码；前端 MarkdownView 安全渲染）",
    "suggestions": ["优化建议1", "优化建议2"],
    "diagnosis": "匹配诊断文本（diagnose 必填）",
    "model": "gpt-4o",
    "mode": "sync | stream"
  },
  "trace_id": "abc-123",
  "latency_ms": 2345
}
```

> 与 cron 对照：`pattern` 对应 cron 的 `expression`；`engine` 对应 cron 的 `dialect`；`convertedPattern` 对应 cron 的 `convertedExpression`；`suggestions` / `explanation` / `diagnosis` 语义完全一致。

### 2.4 各任务详细规格

#### generate — 自然语言生成正则

| 字段 | 必填 | 说明 |
|---|---|---|
| `input.task` | ✅ | `"generate"` |
| `input.description` | ✅ | 自然语言描述，如"匹配中国大陆 11 位手机号" |
| `input.engine` | ❌ | 目标引擎，缺省默认 `pcre` |
| `input.samples` | ❌ | 期望匹配/不匹配的样例，提升生成准确率 |

**输出要求**：
- `pattern`：生成的正则表达式主体（不含分隔符 `/` 与 flags）。
- `engine`：与生成表达式对应的引擎；未指定时返回 `pcre`。
- `explanation`：可选，简述表达式含义与关键元字符。

**示例**：

输入：
```json
{ "task": "generate", "description": "匹配中国大陆 11 位手机号", "engine": "js" }
```

输出：
```json
{
  "pattern": "1[3-9]\\d{9}",
  "engine": "js",
  "explanation": "以 1 开头，第二位 3-9，后接 9 位数字，共 11 位。"
}
```

#### explain — 正则详解

| 字段 | 必填 | 说明 |
|---|---|---|
| `input.task` | ✅ | `"explain"` |
| `input.pattern` | ✅ | 待解释的正则表达式 |
| `input.flags` | ❌ | 当前 flags |
| `input.engine` | ❌ | 当前引擎 |

**输出要求**：
- `pattern`：原样回显输入表达式（便于前端对照）。
- `explanation`：中文深度解读，逐段拆解元字符，说明含义、潜在陷阱（如贪婪/懒惰、回溯爆炸、未转义的特殊字符）与适用场景。

**示例**：

输入：
```json
{ "task": "explain", "pattern": "^(?<year>\\d{4})-(\\d{2})-(\\d{2})$" }
```

输出：
```json
{
  "pattern": "^(?<year>\\d{4})-(\\d{2})-(\\d{2})$",
  "explanation": "整行锚定（^...$）；命名分组 <year> 捕获 4 位年；两个匿名分组分别捕获月、日；各段以 - 分隔。"
}
```

#### optimize — 优化建议（⚠️ 需对齐 cron 契约）

| 字段 | 必填 | 说明 |
|---|---|---|
| `input.task` | ✅ | `"optimize"` |
| `input.pattern` | ✅ | 待优化的正则表达式 |
| `input.flags` | ❌ | 当前 flags |
| `input.engine` | ❌ | 当前引擎 |

**输出要求（权威契约，对齐 cron 的 §2.4 optimize）**：
- `suggestions`：字符串数组，**每条建议内嵌优化后的正则**，格式为 `"{优化后表达式} — {理由}"`，例如 `"\\d+ — 用 \\d+ 替代 [0-9]+ 更简洁且意图更清晰"`。前端逐条解析表达式并提供「应用」按钮（对应 cron 的 §5.2c）。
- `explanation`：解释优化了什么。
- `originalPattern`：可选，回显原文。
- `pattern`：**不单独返回优化后表达式**（旧契约仅前端兼容兜底）。新 agent **只**用 `suggestions` 内嵌表达式，与 cron 保持一致。

> ⚠️ **当前差距（待 agent 调整，须先更新本文档）**：现有 `RegexAIService` / `useRegexAI` 将 optimize 的 `suggestions` 当作纯文本展示，`AIPanel` 也只对 generate 的 `result.pattern` 提供「应用」。对齐后需改动：Agent 输出内嵌表达式 → `AIPanel` 解析每条 suggestion 的表达式并提供「应用」按钮（见 §5 集成清单中的「待调整」项）。

**示例**：

输入：
```json
{ "task": "optimize", "pattern": "[0-9]+" }
```

输出：
```json
{
  "explanation": "数字匹配可用 \\d 简写",
  "suggestions": [
    "\\d+ — [0-9] 可简写为 \\d，语义更清晰",
    "[0-9]{1,} — 若需显式范围风格，等价于 + 量词"
  ]
}
```

#### diagnose — 匹配诊断（✅ 已实现 / 对齐 cron 的 `diagnose`）

| 字段 | 必填 | 说明 |
|---|---|---|
| `input.task` | ✅ | `"diagnose"` |
| `input.pattern` | ✅ | 当前（疑似有问题）的正则表达式 |
| `input.samples` | ✅ | 文本样例数组，每条形如 `"应匹配: <文本>"` 或 `"不应匹配: <文本>"`，如 `["应匹配: abc123", "不应匹配: abc12"]` |
| `input.flags` | ❌ | 当前 flags |
| `input.engine` | ❌ | 当前引擎 |
| `input.conversation` | ❌ | 多轮追问历史 |

**输出要求（对齐 cron 的 diagnose）**：
- `diagnosis`：根因诊断文本（必填），说明为什么表达式没按预期匹配（如"缺少 `\\b` 词边界导致部分匹配"、"贪婪量词吞掉了结尾"）。
- `pattern`：**修正后的正则（必填）**。前端在诊断结果顶部展示「采纳修正」按钮，点击即把该表达式回填主编辑器（经本地 `test()` 安全网）。若问题无需改动表达式（如仅是 flags 误解），返回原表达式。
- `originalPattern`：可选，回显原文，前端以删除线展示「原 → 修正」。
- `explanation`：可选，补充说明。

> ⚠️ **关键契约**：`diagnose` 优先返回结构化 `pattern`（修正结果），便于前端「采纳修正」。若框架不便输出独立 `pattern` 字段，也允许把修正表达式嵌在 `diagnosis` 文本中（如"建议改为 `^\\d+$`"）——前端会提取其中合法正则作为采纳来源，但**结构化 `pattern` 字段优先级更高、最稳妥**。（与 cron §2.4 diagnose 的兜底策略一致）

**示例**：

输入：
```json
{ "task": "diagnose", "pattern": "\\d+", "samples": ["应匹配: abc123", "不应匹配: price: 9"] }
```

输出：
```json
{
  "pattern": ".*\\d+.*",
  "originalPattern": "\\d+",
  "diagnosis": "原表达式能匹配到数字片段，但你的样例 abc123 需要整行包含数字。若希望整行（含前后文）都算匹配，需放宽锚定；若只想要数字本身，原表达式已正确。",
  "explanation": "诊断需结合期望匹配范围，锚定方式决定匹配粒度。"
}
```

#### convert — 引擎方言转换（✅ 已实现 / 对齐 cron 的 `convert`）

| 字段 | 必填 | 说明 |
|---|---|---|
| `input.task` | ✅ | `"convert"` |
| `input.pattern` | ✅ | 待转换的正则表达式 |
| `input.targetEngine` | ✅ | 目标引擎 `js` / `pcre` / `python` / `java` / `go` / `rust` |
| `input.engine` | ❌ | 源引擎（可由调用方上下文推断） |
| `input.flags` | ❌ | 当前 flags |

**输出要求（对齐 cron 的 convert）**：
- `convertedPattern`：转换后的表达式（必填）。
- `originalPattern`：回显原文。
- `engine`：等于 `targetEngine`。
- `explanation`：说明转换点（如"JS 不支持后行断言 `(?<=...)`，需改写/去除"；"Python `re` 需显式 `re.DOTALL` 才能让 `.` 匹配换行"）。

> ⚠️ **契约边界（与 cron 的关键差异）**：cron 的 convert 是等价方言转换（linux5↔spring6 语义 100% 一致），但正则的 convert 是**引擎间转换，语义经常不等价**（JS 不支持后行断言、Go 的 RE2 不支持前瞻/后顾/反向引用、Python 的 `\d` 匹配 Unicode、Java 的 `\b` 行为不同等）。因此：
> - **可等价转换时**：`convertedPattern` 返回语义等价的合法正则。
> - **不可等价时**：返回"最接近的可执行改写"（合法正则），并在 `explanation` 中显式标注不兼容点与语义差异（如"JS 不支持后行断言，已改为捕获分组提取 @ 之后的内容"）。**不要返回纯文字方案或非正则文本**。
> - 前端「应用」按钮仅在 `convertedPattern` 为合法正则时启用（前端 `test()` 安全网兜底拦截非法）。

**示例**：

输入：
```json
{ "task": "convert", "pattern": "(?<=@)\\w+", "targetEngine": "js" }
```

输出：
```json
{
  "convertedPattern": "@(\\w+)",
  "originalPattern": "(?<=@)\\w+",
  "engine": "js",
  "explanation": "JavaScript 不支持后行断言 (?<=...)，无法等价转换；已改为捕获分组提取 @ 之后的内容（group 1 即原后行断言匹配到的词）。"
}
```

## 3. Agent 实现指南

### 3.1 技术选型（与 cron 一致）

| 组件 | 推荐方案 |
|---|---|
| Agent 框架 | miao-ai Agent SDK (Python) |
| LLM | GPT-4o / Claude 3.5 Sonnet / DeepSeek V3 |
| 部署 | 注册到 miao-ai 平台，由平台托管 |

### 3.2 System Prompt 设计

```
你是一个正则表达式专家助手，服务于阿渺工具箱的正则测试器。用户会提出五类请求：

1. generate：根据自然语言描述生成正则表达式
2. explain：解释给定正则表达式的含义（逐段拆解元字符）
3. optimize：对给定正则提出简化/优化建议
4. diagnose：结合样例文本诊断表达式为何不匹配预期，并给出修正
5. convert：在不同引擎方言之间转换（js / pcre / python / java / go / rust）

## 输出规则（必须严格遵守）

你必须返回 JSON 格式（也可逐 token 流式输出同一 JSON）。字段按任务选择：

- generate：必须返回 pattern（生成的表达式，不含 / 与 flags）；建议返回 engine；可返回 explanation
- explain：返回 pattern（原样）+ explanation（中文详解）
- optimize：必须返回 `suggestions`（每条 `"{优化后表达式} — {理由}"`）；可返回 `explanation`、`originalPattern`。**不要再单独返回** `pattern` 单字段（旧字段仅前端兼容兜底）
- diagnose：必须返回 diagnosis（根因）+ pattern（修正后的标准正则）；可返回 originalPattern、explanation
- convert：必须返回 convertedPattern（转换结果）+ engine（= targetEngine）；可返回 originalPattern、explanation

## 硬性要求

- 引擎感知：根据 engine / targetEngine 调整元字符与特性（如 JS 后行断言限制、Python re 的默认行为）
- pattern 字段不要包含 / 分隔符与 flags（flags 单独通过 flags 字段传入）
- diagnose 的 pattern 必须是可直接使用的修正表达式，不要只写在 diagnosis 文本里
- 优化时不要改变原表达式的匹配语义
- 不要把解释文本塞进 pattern 字段
```

### 3.3 部署配置

在 miao-ai 平台注册 `regex-assistant`，并在 Nacos（`nacos-config/*/miao-ai.yaml`）配置 `base-url`、`api-key`、`read-timeout` 等。后端 `RegexAIService` 通过 `MiaoAiProperties.getAgent("regex-assistant")` 读取。

### 3.4 字段映射（后端 → 前端）

| Agent output 字段 | 后端 RegexAIResponse | 前端 RegexAIResult | 用途 |
|---|---|---|---|
| `pattern` | `pattern` | `pattern` | generate/optimize/诊断修正表达式 |
| `originalPattern` | `originalPattern` | `originalPattern` | 原→修正对照展示 |
| `convertedPattern` | `convertedPattern` | `convertedPattern` | convert 结果 |
| `engine` | `engine` | `engine` | 引擎标识 |
| `explanation` | `explanation` | `explanation` | 说明文本 |
| `suggestions` | `suggestions` | `suggestions` | 优化建议列表（内嵌表达式供「应用」） |
| `diagnosis` | `diagnosis` | `diagnosis` | 匹配诊断文本 |
| `model` / `trace_id` | `model` / `traceId` | `model` / `traceId` | 审计与追踪 |

## 4. miao-toolbox 集成清单

### 4.1 后端（已完成）

| 文件 | 说明 |
|---|---|
| `tool/regex/RegexAIController.java` | REST 端点 `POST /api/regex/ai`、`/api/regex/ai/stream`，`@RequireRoute("TOOL_REGEX_TESTER")` |
| `tool/regex/RegexAIService.java` | 调用 `MiaoAiClient.invoke("regex-assistant", ...)`，解析 `output`；SSE 流式拼接 token 并在 `done` 解析 |
| `tool/regex/dto/RegexAIRequest.java` | 请求 DTO：task + description/pattern/flags/engine |
| `tool/regex/dto/RegexAIResponse.java` | 响应 DTO：pattern/explanation/suggestions/model/traceId |

> 待调整（与 cron 对齐）：`RegexAIRequest` 增加 `targetEngine`、`samples`、`conversation`；`RegexAIResponse` 增加 `originalPattern`、`convertedPattern`、`diagnosis`、`engine`、`mode`。

### 4.2 前端（已完成）

| 文件 | 说明 |
|---|---|
| `hooks/useRegexAI.ts` | AI 调用 Hook：3 任务 + 流式/loading/error/result；解析 `pattern`/`explanation`/`suggestions` |
| `components/AIPanel.tsx` | AI 面板：generate / explain / optimize 三个区块；generate 支持「应用」回填，经本地 `test()` 安全网 |
| `regex-tester.css` | AI 面板样式（`.rt-ai-*`） |

> 待调整（与 cron 对齐）：
> - `AIPanel` 对 optimize 的 `suggestions` 逐条解析内嵌表达式，提供「应用」按钮（对齐 cron 的 diagnose/optimize「采纳」）。
> - 新增 `diagnose` Tab，支持 `samples` 输入与「采纳修正」回填。
> - 新增 `convert` Tab，选择 `targetEngine` 并展示 `convertedPattern` 与「应用」。

### 4.3 配置（已完成）

| 文件 | 说明 |
|---|---|
| `nacos-config/dev/miao-ai.yaml` | `regex-assistant` agent 配置（环境变量占位符） |
| `nacos-config/prod/miao-ai.yaml` | `regex-assistant` agent 配置（环境变量占位符） |

## 5. 与 cron-assistant 的对照与对齐点

| 维度 | cron-assistant | regex-assistant（现状） | 对齐建议 |
|---|---|---|---|
| 任务数 | 5（generate/explain/optimize/diagnose/convert） | 3（generate/explain/optimize） | 增补 diagnose、convert 两个任务 |
| 方言概念 | `dialect`（linux5/spring6） | `engine`（js/pcre/python/...） | 概念一致，复用同一套「方言感知」设计 |
| optimize 契约 | `suggestions` 内嵌 `"{表达式} — {理由}"`，前端逐条「应用」 | `suggestions` 纯文本展示，无「应用」 | **改为内嵌表达式格式**（优先级最高） |
| 修正回填 | diagnose 返回结构化 `expression` + 前端「采纳修正」 | 无 diagnose | 新增 diagnose + 「采纳修正」 |
| 安全网 | 本地 `validate()` | 本地 `test()` | 一致，回填前均经本地校验 |
| 流式协议 | SSE token/event/done，output JSON 拼回 | SSE token/event/done，output JSON 拼回 | 已一致，无需调整 |

## 6. 错误处理（与 cron 对齐）

| 场景 | HTTP 状态码 | 错误码 | 处理方式 |
|---|---|---|---|
| 用户未登录 | 401 | — | Spring Security 拦截 |
| 用户无 TOOL_REGEX_TESTER 权限 | 403 | ROUTE_FORBIDDEN | @RequireRoute 拦截 |
| generate 缺 description / diagnose 缺 samples 等 | 400 | INVALID_REQUEST | Controller 校验 |
| Agent 未配置 | 503 | AI_AGENT_NOT_CONFIGURED | MiaoAiProperties 抛出 |
| Agent 未启用 | 503 | AI_AGENT_DISABLED | RegexAIService 校验 |
| miao-ai 服务不可用 | 503 | AI_SERVICE_UNAVAILABLE | MiaoAiClient 重试后抛出 |
| Agent 返回格式异常 | 200 | — | 后端兜底解析，前端命中「未获得有效结果，请重试」 |

## 7. 数据流

```
┌─────────────────────────────────────────────────────────────────┐
│ 前端                                                            │
│  AIPanel.tsx（generate / explain / optimize[+ 待增补 diagnose /convert]）│
│    ↓ useRegexAI.generate/explain/optimize[/diagnose/convert]     │
│  POST /api/regex/ai/stream { task, description/pattern, ... }    │
└──────────────────────────┬──────────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────────┐
│ 后端 (miao-toolbox-api)                                        │
│  RegexAIController                                               │
│    ↓ 参数校验 + @RequireRoute                                   │
│  RegexAIService                                                  │
│    ↓ buildInput() + buildMetadata()                             │
│  MiaoAiClient.invoke("regex-assistant", input, metadata)         │
│    ↓ HTTP POST + Bearer Auth + 重试                             │
│  AiInvocationRecorder（自动记录调用日志）                        │
└──────────────────────────┬──────────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────────┐
│ miao-ai 平台                                                    │
│  regex-assistant Agent                                           │
│    ↓ System Prompt + User Message                               │
│  LLM (GPT-4o / Claude / DeepSeek)                              │
│    ↓ JSON 输出（见 §2.3 各任务）                                 │
│  { pattern/originalPattern/convertedPattern/                    │
│    explanation/suggestions/diagnosis, ... }                      │
└─────────────────────────────────────────────────────────────────┘
```
