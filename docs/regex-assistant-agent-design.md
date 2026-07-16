# regex-assistant Agent 设计文档

> 版本：v1.0 | 日期：2026-07-16 | 作者：AI Assistant

## 1. 概述

**regex-assistant** 是 miao-ai 平台上的一个 AI Agent，为阿渺工具箱的正则测试器提供三种 AI 增强能力：自然语言生成正则、正则解释、优化建议。

### 1.1 在系统中的位置

```
用户浏览器
    ↓ POST /api/regex/ai
miao-toolbox-api (RegexAIController)
    ↓ MiaoAiClient.invoke("regex-assistant", input, metadata)
miao-ai 平台 (regex-assistant Agent)
    ↓ LLM 调用
大语言模型 (GPT-4o / Claude / DeepSeek 等)
```

### 1.2 设计原则

- **无状态**：每次请求独立，Agent 不维护会话上下文
- **结构化输出**：返回 JSON 格式，miao-toolbox-api 解析后返回给前端
- **引擎感知**：输入包含当前引擎信息，Agent 可据此调整输出（如 Go 不支持前瞻时给出替代方案）
- **安全边界**：输入校验在 miao-toolbox-api 层完成，Agent 只处理已验证的输入

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
    "task": "generate | explain | optimize",
    "description": "自然语言描述（generate 时必填）",
    "pattern": "正则表达式（explain/optimize 时必填）",
    "flags": "当前标志位（可选）",
    "engine": "当前引擎（可选，js/java/python/go/php）"
  },
  "metadata": {
    "tool": "regex-tester",
    "action": "generate | explain | optimize"
  }
}
```

### 2.3 响应格式

Agent 的 `output` 字段必须包含以下结构：

```json
{
  "output": {
    "pattern": "生成的/优化后的正则表达式",
    "explanation": "解释文本（Markdown 格式）",
    "suggestions": ["建议1", "建议2"],
    "usage": {
      "prompt_tokens": 1234,
      "completion_tokens": 567,
      "total_tokens": 1801
    },
    "model": "gpt-4o",
    "mode": "sync"
  },
  "trace_id": "abc-123",
  "latency_ms": 2345
}
```

### 2.4 各任务详细规格

#### generate — 自然语言生成正则

| 字段 | 必填 | 说明 |
|---|---|---|
| `input.task` | ✅ | `"generate"` |
| `input.description` | ✅ | 用户的自然语言描述，如"匹配中国大陆手机号" |
| `input.engine` | ❌ | 目标引擎，Agent 可据此避免生成不兼容的语法 |

**输出要求**：
- `pattern`：生成的正则表达式（不含 `/` 分隔符和标志位）
- `explanation`：解释该正则各部分的含义
- `suggestions`：可选，如建议添加的标志位

**示例**：

输入：
```json
{ "task": "generate", "description": "匹配中国大陆手机号", "engine": "js" }
```

输出：
```json
{
  "pattern": "1[3-9]\\d{9}",
  "explanation": "匹配以1开头，第二位为3-9，后跟9位数字的中国大陆手机号",
  "suggestions": ["建议添加 g 标志以匹配文本中所有手机号"]
}
```

#### explain — 正则解释

| 字段 | 必填 | 说明 |
|---|---|---|
| `input.task` | ✅ | `"explain"` |
| `input.pattern` | ✅ | 待解释的正则表达式 |
| `input.flags` | ❌ | 当前标志位 |
| `input.engine` | ❌ | 当前引擎 |

**输出要求**：
- `pattern`：原样返回输入的正则
- `explanation`：逐段解释，格式如 `(?<=@)` → "匹配 @ 后面的位置（后行断言）"
- `suggestions`：可选

**示例**：

输入：
```json
{ "task": "explain", "pattern": "(?<=@)\\w+\\.\\w+", "engine": "js" }
```

输出：
```json
{
  "pattern": "(?<=@)\\w+\\.\\w+",
  "explanation": "(?<=@) — 后行断言，匹配 @ 后面的位置\n\\w+ — 匹配一个或多个单词字符\n\\. — 匹配点号\n\\w+ — 匹配一个或多个单词字符\n\n整体含义：匹配 @ 符号后的域名部分，如 user@example.com 中的 example.com",
  "suggestions": []
}
```

#### optimize — 优化建议

| 字段 | 必填 | 说明 |
|---|---|---|
| `input.task` | ✅ | `"optimize"` |
| `input.pattern` | ✅ | 待优化的正则表达式 |
| `input.flags` | ❌ | 当前标志位 |
| `input.engine` | ❌ | 当前引擎 |

**输出要求**：
- `pattern`：优化后的正则（如无优化空间则返回原正则）
- `explanation`：解释优化了什么
- `suggestions`：优化建议列表

**示例**：

输入：
```json
{ "task": "optimize", "pattern": "(a|a|a)+", "engine": "js" }
```

输出：
```json
{
  "pattern": "a+",
  "explanation": "原正则 (a|a|a)+ 中三个分支完全相同，等价于 a+",
  "suggestions": [
    "避免重复的分支选择，(a|a|a) 等价于 (a)",
    "注意 (a)+ 和 a+ 的区别：前者捕获最后一个 a，后者不捕获",
    "如果不需要捕获组，可使用 (?:a)+ 或 a+"
  ]
}
```

## 3. Agent 实现指南

### 3.1 技术选型

推荐使用 **miao-ai 平台的 Agent 框架**，基于以下技术栈：

| 组件 | 推荐方案 |
|---|---|
| Agent 框架 | miao-ai Agent SDK (Python) |
| LLM | GPT-4o / Claude 3.5 Sonnet / DeepSeek V3 |
| 部署 | Docker 容器，注册到 miao-ai 平台 |

### 3.2 System Prompt 设计

```
你是一个正则表达式专家助手。用户会向你提出三种类型的请求：

1. **generate**：根据自然语言描述生成正则表达式
2. **explain**：解释给定正则表达式的含义
3. **optimize**：对给定正则表达式提出优化建议

## 输出规则

你必须返回 JSON 格式，包含以下字段：
- pattern: 字符串，生成/优化后的正则表达式（不含分隔符和标志位）
- explanation: 字符串，对正则的解释说明
- suggestions: 字符串数组，优化建议（无建议时返回空数组）

## 注意事项

- 如果用户指定了 engine，确保生成的正则在该引擎中兼容
- Go 引擎使用 RE2，不支持前瞻/后顾断言和反向引用
- Java 不支持 s (dotAll) 标志（Java 8），但 Java 17+ 支持
- Python 的 \d 匹配 Unicode 数字，JS 仅匹配 [0-9]
- 优化时注意不要改变正则的匹配语义
- 解释时逐段拆解，用 → 标注每部分的含义
```

### 3.3 Agent 代码骨架（Python）

```python
from miao_ai import Agent, InputSchema, OutputSchema

class RegexAssistantAgent(Agent):
    name = "regex-assistant"
    version = "1.0.0"

    SYSTEM_PROMPT = """（见 3.2）"""

    @property
    def input_schema(self) -> InputSchema:
        return InputSchema({
            "task": {"type": "string", "enum": ["generate", "explain", "optimize"]},
            "description": {"type": "string", "optional": True},
            "pattern": {"type": "string", "optional": True},
            "flags": {"type": "string", "optional": True},
            "engine": {"type": "string", "optional": True, "enum": ["js", "java", "python", "go", "php"]},
        })

    @property
    def output_schema(self) -> OutputSchema:
        return OutputSchema({
            "pattern": {"type": "string"},
            "explanation": {"type": "string"},
            "suggestions": {"type": "array", "items": {"type": "string"}},
        })

    async def invoke(self, input_data: dict) -> dict:
        task = input_data["task"]
        user_message = self._build_user_message(input_data)

        response = await self.llm.chat(
            system=self.SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_message}],
            response_format="json",
        )

        return response.parsed

    def _build_user_message(self, input_data: dict) -> str:
        task = input_data["task"]

        if task == "generate":
            desc = input_data.get("description", "")
            engine = input_data.get("engine", "")
            engine_hint = f"（目标引擎：{engine}）" if engine else ""
            return f"请根据以下描述生成正则表达式{engine_hint}：\n{desc}"

        elif task == "explain":
            pattern = input_data.get("pattern", "")
            flags = input_data.get("flags", "")
            engine = input_data.get("engine", "")
            context = []
            if flags: context.append(f"标志位：{flags}")
            if engine: context.append(f"引擎：{engine}")
            ctx_str = f"（{', '.join(context)}）" if context else ""
            return f"请解释以下正则表达式{ctx_str}：\n/{pattern}/"

        elif task == "optimize":
            pattern = input_data.get("pattern", "")
            flags = input_data.get("flags", "")
            engine = input_data.get("engine", "")
            context = []
            if flags: context.append(f"标志位：{flags}")
            if engine: context.append(f"引擎：{engine}")
            ctx_str = f"（{', '.join(context)}）" if context else ""
            return f"请优化以下正则表达式{ctx_str}，如无优化空间则原样返回：\n/{pattern}/"

        return ""
```

### 3.4 部署配置

```yaml
# docker-compose.yml 中添加
regex-assistant:
  build: ./agents/regex-assistant
  environment:
    - MIAO_AI_API_KEY=${REGEX_ASSISTANT_API_KEY}
    - LLM_MODEL=gpt-4o
  ports:
    - "8004:8000"
```

```bash
# 在 miao-ai 平台注册
miao-ai agent register regex-assistant \
  --base-url http://regex-assistant:8000 \
  --api-key ${REGEX_ASSISTANT_API_KEY}
```

## 4. miao-toolbox 集成清单

### 4.1 后端（已完成）

| 文件 | 说明 |
|---|---|
| `tool/regex/RegexAIController.java` | REST 端点 `POST /api/regex/ai`，`@RequireRoute("TOOL_REGEX_TESTER")` |
| `tool/regex/RegexAIService.java` | 调用 `MiaoAiClient.invoke("regex-assistant", ...)`，解析响应 |
| `tool/regex/dto/RegexAIRequest.java` | 请求 DTO：task + description/pattern/flags/engine |
| `tool/regex/dto/RegexAIResponse.java` | 响应 DTO：pattern + explanation + suggestions + model + traceId |

### 4.2 前端（已完成）

| 文件 | 说明 |
|---|---|
| `hooks/useRegexAI.ts` | AI 调用 Hook：generate/explain/optimize + loading/error/result 状态 |
| `components/AIPanel.tsx` | AI 面板组件：自然语言输入 + 解释/优化按钮 + 结果展示 + 应用按钮 |
| `regex-tester.css` | AI 面板样式（`.rt-ai-*`） |

### 4.3 配置（已完成）

| 文件 | 说明 |
|---|---|
| `nacos-config/dev/miao-ai.yaml` | 添加 `regex-assistant` agent 配置（环境变量占位符） |
| `nacos-config/prod/miao-ai.yaml` | 添加 `regex-assistant` agent 配置（环境变量占位符） |

### 4.4 待完成（Agent 上线后）

| 步骤 | 说明 |
|---|---|
| 1 | 在 miao-ai 平台部署 regex-assistant Agent |
| 2 | 在 Nacos 配置中填入真实的 base-url 和 api-key |
| 3 | 在 `RegexTesterPage.tsx` 中集成 AIPanel 组件 |
| 4 | 在 `RegexEditor.tsx` 命令条中添加 AI 助手按钮 |
| 5 | 在 `RegexProvider.tsx` 中添加 `showAI` 状态和 `toggleAI` 方法 |
| 6 | 端到端测试 |

## 5. 错误处理

| 场景 | HTTP 状态码 | 错误码 | 处理方式 |
|---|---|---|---|
| 用户未登录 | 401 | — | Spring Security 拦截 |
| 用户无 TOOL_REGEX_TESTER 权限 | 403 | ROUTE_FORBIDDEN | @RequireRoute 拦截 |
| generate 缺少 description | 400 | INVALID_REQUEST | Controller 校验 |
| explain/optimize 缺少 pattern | 400 | INVALID_REQUEST | Controller 校验 |
| Agent 未配置 | 503 | AI_AGENT_NOT_CONFIGURED | MiaoAiProperties 抛出 |
| Agent 未启用 | 503 | AI_AGENT_DISABLED | RegexAIService 校验 |
| miao-ai 服务不可用 | 503 | AI_SERVICE_UNAVAILABLE | MiaoAiClient 重试后抛出 |
| Agent 返回格式异常 | 200 | — | RegexAIService 兜底解析 |
| 输入超过大小限制 | 400 | AI_INPUT_TOO_LARGE | MiaoAiClient 校验 |

## 6. 数据流

```
┌─────────────────────────────────────────────────────────────────┐
│ 前端                                                            │
│                                                                 │
│  AIPanel.tsx                                                    │
│    ↓ useRegexAI.generate/explain/optimize                      │
│  POST /api/regex/ai { task, description/pattern, flags, engine }│
└──────────────────────────┬──────────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────────┐
│ 后端 (miao-toolbox-api)                                        │
│                                                                 │
│  RegexAIController                                              │
│    ↓ 参数校验 + @RequireRoute                                   │
│  RegexAIService                                                 │
│    ↓ buildInput() + buildMetadata()                             │
│  MiaoAiClient.invoke("regex-assistant", input, metadata)        │
│    ↓ HTTP POST + Bearer Auth + 重试                             │
│  AiInvocationRecorder (自动记录调用日志)                         │
└──────────────────────────┬──────────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────────┐
│ miao-ai 平台                                                    │
│                                                                 │
│  regex-assistant Agent                                          │
│    ↓ System Prompt + User Message                               │
│  LLM (GPT-4o / Claude / DeepSeek)                              │
│    ↓ JSON 输出                                                  │
│  { pattern, explanation, suggestions }                          │
└─────────────────────────────────────────────────────────────────┘
```
