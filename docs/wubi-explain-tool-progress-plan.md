# 五笔讲解台「工具调用过程可见」方案（跨仓库计划文档）

> 版本：v2.0（miao-ai 侧已实现并验证） | 日期：2026-10-17
> 范围：miao-ai（agent + runner + 平台） ↔ miao-toolbox（后端 SSE 代理 + 前端过程轨）
> 状态：**miao-ai 侧已完成并通过端到端实测；工具箱侧待实施**

---

## 0. 结论摘要（v2.0，据 miao-ai 现有实现修订）

> **v1 的判断已被 miao-ai 的实际实现取代**：miao-ai 不是只加了「一种进度块」，
> 而是抽出了平台通用的 **Agent SDK（`miao_sdk.py`）**，并把能力登记进
> `docs/integration-guide-exec-events.md`。事件名是 **`event: exec`**（不是 v1 草案的
> `event: progress`），事件模型是 **`tool_call` / `tool_result` + `call_id` 配对**，
> 比 v1 草案的「stage/status 单事件」更接近 coding agent 的形态，也更好用。
> **工具箱侧应以本文 v2 的契约实施，不要照 v1 草案写。**

| 问题 | 结论 |
|---|---|
| 能不能实现 | **已经实现了**。miao-ai 侧代码 + 3 组测试 + 端到端实测全部通过（见 §7） |
| 实测证据 | 真实平台调用：`tavily.search` 的 `tool_call` 在 **0.14s** 到达（实际阻塞 4.97s）；`llm.decide` 的 `tool_call` 在 5.11s 到达（实际阻塞 3.31s）——**等待期确实是实时的** |
| 平台 `app/api/invoke.py` 要不要改 | **零改动**。靠现有「未知事件名全量透传」成立，且已补 `test_invoke_exec_passthrough.py` 把这个隐式契约钉成有测试的契约 |
| 工具箱要改什么 | 只剩**消费侧**：后端加 SSE 代理端点（可直接复用 `DiffAIController` 范式，它对未知事件名同样全量转发）+ 前端过程轨。**约 2.5 ~ 3.5 人日** |
| 与既有决策冲突吗 | **不冲突**。原决策反对的是「用流式吐半截 JSON」；现在流的是**执行事件**，最终答案仍走 `done.output` 的一次性完整结构 |
| 部署前提 | 工具箱要吃到 exec 事件，**必须改用 `/invoke/stream`**（同步端点 `/invoke` 明确不返回执行事件） |

---

## 1. 背景：用户看到的现象

在五笔练习室「查码 → 讲解台」里，选中一个字之后，界面只有骨架 + 分阶段文案
（8s 提示预热、28s 提示可取消），**十几秒到一两分钟内什么都看不到**，而这段时间里
agent 其实正在：

1. 查内置码表（毫秒级）
2. **联网检索（Tavily，单次查询 4 ~ 7s，最多 2 次）** ← 主要不可见耗时
3. 调模型逐位挑字根（单次最多 70s，最多 2 次尝试）
4. 规则校验、拼装讲解

用户的诉求（原话）：「调工具的时候，比如说搜索这些我看不到……时长会特别久。
希望界面上能够看到，如果有工具调用这类能够显示出来。」

### 1.1 实测耗时构成（本机真实测量，2026-10-17）

| 步骤 | 实测 | 代码位置 |
|---|---|---|
| 内置码表 | **6 ~ 13ms** | `wubi/facts.py` `tables.lookup_code` |
| 联网检索 照（2 个查询） | **13.5s**（6.6s + 6.9s） | `wubi/facts.py` `tavily_lookup` |
| 联网检索 编（1 个查询，命中本地码后提前结束） | **4.8s** | 同上 |
| 模型一次尝试 | 未测（本机 key 401）；配置上限 **70s** | `wubi/llm.py` `LLM_TIMEOUT` |
| 校验 + 组句 | < 50ms | `wubi/verify.py`、`wubi/compose.py` |
| 单轮预算 | `TOTAL_BUDGET_SEC=120`、`MAX_ATTEMPTS=2` | `agent.py` |

超时三层口径（改动时不能破坏）：agent ≈145s → 后端 `read-timeout: 200000` → 前端 `REQUEST_TIMEOUT_MS = 240000`。

---

## 2. 现状链路

**当前（同步，看不到过程）**：

```
浏览器
 └─ POST /api/wubi/ai/explain        （同步，axios，240s）
     └─ WubiAiService                 （形校验 / 会话懒创建 / 上游错误码映射）
         └─ MiaoAiClient.invoke       （Bearer 密钥只在后端）
             └─ miao-ai POST /api/v1/agents/wubi-explainer/invoke   ← 同步，无执行事件
                 └─ agent.invoke(input, config)  ← 同步跑完整条流水线
                     ├─ tables.lookup   ← 毫秒
                     ├─ tavily.search   ← 联网 4~13s（★ 不可见）
                     ├─ llm.decide      ← 最多 70s × 2 次（★ 不可见）
                     └─ verify / compose
```

**目标（流式，过程可见）**：

```
浏览器 ── POST /api/wubi/ai/explain/stream（SSE，新增）
  └─ WubiAiStreamController（新）── MiaoAiClient.getStreamUrl/getStreamHeaders（复用）
      └─ miao-ai POST /api/v1/agents/wubi-explainer/invoke/stream
          └─ miao_runner ── agent.invoke(config.stream=True)
              └─ miao_sdk.stream(_dispatch)   ← 后台线程跑，主线程转发
                  → event: exec   （工具调用，实时）→ 前端过程轨
                  → event: token  （正文分片，本项目**丢弃**）
                  → event: done   （output=完整结构化结果）→ 现有校验链路
```

**关键判断**：这里的「工具调用」**不是 LLM function calling**，而是 agent 内部
**确定性的外部调用**（Tavily HTTP、内置码表、模型客户端）。miao-ai 因此给的不是
「tool_calls 字段」，而是**平台级的执行事件通道**（`miao_sdk` + `event: exec`），
对所有长耗时 demo 通用。**这条通道现在已经实现并可用了**。

### 2.1 现状：miao-ai 侧通道已全线打通（v2 已实现）

| 层 | 现状 | 结论 |
|---|---|---|
| agent | `miao_sdk.stream()` 把 `_dispatch` 放后台线程，边跑边吐 `{"exec": …}` | ✅ 已实现 |
| `miao_runner.py` | `_is_exec_chunk` → `event: exec`；`_EventRelay` 兜住手写 generator 的事件 | ✅ 已实现 |
| 平台 `/invoke/stream` | 对未知事件名全量透传（`invoke.py` `yield line + "\n"`），只特判 `conversation`/`done`/`output`/`error` | ✅ **零改动**，且有测试钉住 |
| 平台会话记账 | 流式轮次 output 仍取自 `done.output` | ✅ 追问链路不受影响 |
| 工具箱后端 | `MiaoAiClient` 已有 `getStreamUrl` / `getStreamHeaders` / `buildStreamBody` / `recordStreamStart`；`DiffAIController` 已有成熟 SSE 代理范式（**且对未知事件名全量转发**） | 🔧 复用即可，待接线 |
| 工具箱前端 | 已有 `useSignedAiStream`（HMAC 签名 + fetch 读流）；讲解台已有骨架/取消/抢占 | 🔧 需加「过程轨」 |

### 2.2 「边跑边吐」的关键机制（miao-ai 已解决）

agent 的流水线是**同步阻塞**的：`_dispatch` 里联网与模型调用都会阻塞，
即使返回 generator，也只能算完才开始吐。
所以 SDK 的 `stream()` 做了两件事：**把 `_dispatch` 放后台线程**、
**主线程从队列取事件并转发**。这是「等待期看得见」的唯一实现方式，
实测证明有效（`tavily.search` 的 call 在 0.14s 到达，实际阻塞 4.97s —— 见 §7.2）。

### 2.3 工具箱侧真正要做的判断

**必须改用 `/invoke/stream`**：同步端点 `/invoke` 明确不返回执行事件
（见 miao-ai 对接文档 §2）。这带来一个架构决策：

- 现在讲解台是「同步 + 骨架 + 分阶段文案」；
- 改成流式后，**正文仍然不用流式渲染**（不用打字机，避免半截内容），
  只用流来收 `exec` 过程事件；`token` 事件可以直接丢弃，
  最终答案仍等 `done.output` 一次性校验后再展示。

这样既拿到过程可见性，又**不改动现有的可信度分层与校验门槛**。

---

## 3. 方案对比

| 方案 | 做法 | 等待期可见？ | 复杂度 | 评价 |
|---|---|---|---|---|
| **A（推荐，唯一可行）** | 工具箱改走 `/invoke/stream`：`exec` → 过程轨；`token` 丢弃；`done.output` → 现有校验链路 | ✅ 实时 | 中（2.5~3.5 人日，**miao-ai 侧已完成**） | 完整满足诉求，且失败/跳过也如实显示，排障价值大 |
| B（事后复盘） | 不动链路，只把过程记进 `done.output` 里事后展示 | ❌ 只能事后看 | 小 | 解决不了「等得心慌」；且 miao-ai 同步端点根本不返回这些信息 |
| C（纯前端猜测） | 按已等待秒数猜文案 | ⚠️ 假信息 | 极小 | **否**。与本模块「只承认能被机器判定的东西」的纪律冲突，猜错反而误导 |

**结论：走 A。** miao-ai 侧能力已就绪，工具箱只差消费端接线。

---

## 4. 事件契约（以 `docs/integration-guide-exec-events.md` 为准）

> miao-ai 已经把这套能力写成**对外对接文档**：`miao-ai/docs/integration-guide-exec-events.md`。
> 下面是工具箱要消费的子集摘要，字段语义以该文档为准。

### 4.1 agent → runner：执行事件块

```python
{"exec": { "kind": ..., ... }}    # 与 {"token": ...} / {"output": ...} 并列的第三种块
```

判断顺序固定为 **收尾块 → 事件块 → 正文块**（实现见 `miao_runner.py::_is_exec_chunk`）。

### 4.2 runner → 客户端：`event: exec`

```
event: exec
data: {"kind":"tool_call","call_id":"c1","name":"tables.lookup","input":{"char":"编"},"seq":1}

event: exec
data: {"kind":"tool_result","call_id":"c1","name":"tables.lookup","ok":true,"output":{"hit":true,"code":"xyna"},"ms":13,"seq":2}
```

| 字段 | 出现在 | 说明 | 工具箱怎么用 |
|---|---|---|---|
| `kind` | 全部 | **不设白名单**，agent 可自定义 | 未知 kind → 降级为通用条目，不报错 |
| `seq` | 全部 | 流内单调递增（SDK 自动补） | 发现丢包/乱序（可只打日志） |
| `call_id` | tool_* | **配对键** | 按它把 call/result 折叠成一行 |
| `name` | tool_* | 工具名，`域.动作` | 直接显示（`tavily.search` / `llm.decide` / `tables.lookup`） |
| `input` / `output` | tool_call / tool_result | **JSON 对象，不是字符串** | 折叠态不显示；展开时看 |
| `ok` / `error` / `ms` | tool_result | 成败 / 失败原因 / 耗时 | 决定行的状态色与耗时文案 |
| `level` / `text` | log | 说明（降级、跳过、重试原因） | 按 level 着色 |
| `text` | thinking | **模型内容**，可能有错 | ⚠️ 必须与执行事实分开呈现 |
| `truncated` | 任意 | 该字段被体积上限截断 | 出现即提示「内容不完整」 |

### 4.3 兼容性规则（三条硬约束）

1. **老 agent 零影响**：不含 `exec` 键的块行为逐字节不变（仍走 `token`）。
2. **老客户端零影响**：未知事件名必须**忽略**而不是拼进正文 —— 这条对本项目尤其重要，
   因为当前工具箱若照 `DiffAIController` 的写法接，是能正确转发的；但**前端解析器**
   必须默认丢弃未知事件，不能把它当 token 拼。
3. **非流式路径零影响**：`/invoke`（同步）不产生任何执行事件，行为与改造前一致。

### 4.4 关键结论：`done.output` 仍然是唯一可信结果

执行事件里的 `tool_result.output` **不是**最终答案（例如 `llm.decide` 的出参是
「返回了多少字符、有没有解析成功」，不是拆字结论）。业务判断必须走 `done.output`。

---

## 5. 分层改动清单

### 5.1 miao-ai 侧 —— ✅ **已完成，无需再做**

miao-ai 的实现比 v1 草案更彻底：抽出了**平台通用 SDK**，并写了对外对接文档。

| 文件 | 实际改动 | 状态 |
|---|---|---|
| `backend/agent_templates/miao_sdk.py`（新增，~430 行） | 平台 Agent SDK：`tool()` 上下文管理器（自动配对 call/result + 计时）、`thinking` / `log` / `emit`、`stream()` 线程化桥接、`threading.local()` sink 隔离、`seq`/`call_id` 自动编号、体积上限截断 | ✅ |
| `backend/agent_templates/miao_runner.py` | `_is_exec_chunk` → `event: exec`；`_EventRelay` 兜住「手写 generator 里用 SDK 上报」的事件；每请求 `_reset_sdk_sink()` 防串轮；exec 事件记入 Langfuse metadata（不记入 output） | ✅ |
| `backend/app/api/invoke.py` | **零改动**（靠现有全量透传）；新增 `tests/test_invoke_exec_passthrough.py` 把隐式契约钉死 | ✅ |
| `demos/wubi-explainer/wubi/progress.py`（新增） | SDK 的包内绑定层 + SDK 缺失时降级为空操作；上报 3 个真实工具：`tables.lookup` / `tavily.search` / `llm.decide` | ✅ |
| `demos/wubi-explainer/{agent,facts,answer,phrase,followup}.py` | 三个外部调用包成工具事件；校验不通过发 `log(warn)`（不伪装成工具事件）；**不发 thinking**（模型关了思维链，不编） | ✅ |
| `frontend/src/app/agents/[name]/page.tsx`（+316 行） | Try Run 渲染过程面板：按 `call_id` 折叠、未知 kind 降级、thinking 用引用样式与事实分开 | ✅ |
| `docs/integration-guide-exec-events.md`（新增，470 行） | 对外对接文档（本文 §4 以其为准） | ✅ |
| `docs/agent-sdk.md` | SDK 使用文档 | ✅ |
| `demos/wubi-explainer/evals/check_exec_events.py`（新增） | 5 组不变量自检（见 §7.2） | ✅ |

> ⚠️ 工作副本在 `/tmp/miao/agents/wubi-explainer`（平台解包 COS 产物）。
> 实测该目录**已是最新版本**（含 `miao_sdk` 引用），说明贵方已重新激活过。

### 5.2 工具箱后端（约 1 ~ 1.5 人日）

| # | 文件 | 改动 | 复杂度 |
|---|---|---|---|
| T1 | `tool/wubi/WubiAiStreamController.java`（新增） | `POST /api/wubi/ai/explain/stream`、`POST /api/wubi/ai/followup/stream`，`SseEmitter` 代理 miao-ai `/invoke/stream`。照抄 `DiffAIController.doProxyStream` 的成熟范式（`HttpURLConnection` + 逐行解析 `event:`/`data:` + 空行分割 + 客户端断连处理）。**已核实它对未知事件名全量转发**，`exec` 无需额外白名单 | M |
| T2 | `WubiAiService`（扩展） | 复用语义：会话懒创建（`ensureConversation`）、上游错误码映射（`mapUpstream`）。**流式端点要与同步端点给出同一套错误码**，前端才能复用 410 自动重开会话那条链路 | M |
| T3 | `MiaoAiClient`（小改/复用） | 已有 `getStreamUrl` / `getStreamHeaders` / `buildStreamBody` / `recordStreamStart` / `recordStreamSuccess|Failure`，基本可直接用 | XS |
| T4 | 测试 | `WubiAiStreamControllerTest`（@WebMvcTest）+ 起本机 `HttpServer` 做真实往返（照 `MiaoAiClientTest` 做法），覆盖：`exec` 透传、unknown 事件透传、上游 410/429 映射、`done` 携带 output、客户端断连 | M |

落地决策（建议）：**新增流式端点、同步端点保留**。理由：AI 是可选增强，
流式握手/读流任何一步失败都能回退同步路径，不必让用户看天书。

### 5.3 工具箱前端（约 1.5 ~ 2 人日）

| # | 文件 | 改动 | 复杂度 |
|---|---|---|---|
| F1 | `utils/wubi/explainStream.ts`（新增，**纯函数**） | SSE 行解析器 + `exec` 事件归一化：**按 `call_id` 把 tool_call/tool_result 折叠成一条**（沿用 miao-ai Try Run 的 `groupExecEvents` 思路）；未知 `kind` 降级为通用条目；**未知事件名必须丢弃**而不是拼进正文。放纯模块 → vitest `environment: 'node'` 可直接覆盖 | M |
| F2 | `utils/wubi/explainChat.ts`（扩展） | `ExplainThread` 增加 `execs: ExecEntry[]`；新增 `EXEC` action（按 `call_id` **就地更新** running→done，不是追加新行）；`RESTART`/`CANCEL` 清理 | S |
| F3 | `utils/wubi/useWubiAI.ts`（扩展） | `runAnchor` / `runFollowup` 改走 fetch + `ReadableStream`（HMAC 签名参照 `useSignedAiStream`；**不能直接用 EventSource**，因为 POST + 签名 + 需要中止）。保留现有令牌/抢占/过期重放逻辑 | M |
| F4 | `components/explain/ExplainConsole.tsx` + `wubi-tutor.css` | 「过程轨」：复用既有会话轨视觉（`.wt-chat__thread` / `__node`），每个工具调用一行 = 状态点 + 工具名 + 耗时 + 成败；`tool_call` 到了就显示「进行中」，`tool_result` 到了更新为完成态。**失败调用用现有 `--warn/--notice` 语义色如实显示**，不隐藏 | M |
| F5 | `ExplainConsole.render.test.tsx`（扩展） | SSR 结构断言（过程轨行数/状态文案/失败态） | S |
| F6 | `utils/wubi/explainStream.test.ts`（新增） | 纯解析单测：分包边界（一行被切成两块）、多行 data、call/result 配对、孤儿 result、未知事件名丢弃、未知 kind 降级、`truncated` | S |
| F7 | `scripts/headless-check-wt-5-5-ai-explain-chat.py`（扩展） | Playwright：断言等待期间出现过程轨（`tavily.search` 进行中），最终答案仍在 | S |

> **术语映射（实施时用这张表）**：miao-ai 的 3 个工具名 → 中文标签
> `tables.lookup` → 「查内置码表」、`tavily.search` → 「联网检索」、
> `llm.decide` → 「模型判断拆分」。**未知工具名直接显示原名**，不要猜中文。

---

## 6. 与现有文档/需求流程的衔接

按 `AGENTS.md` 的「需求迭代流程」，本方案落地前需要：

1. **PRD**：新增一条 FR（编号接续当前最大值）——「讲解台需展示执行过程（工具调用阶段）」，含变更原因/影响范围/优先级；
2. **架构**：新增 Decision ——「执行过程采用 `event: exec` 独立事件名，与正文 token 流解耦；
   工具箱只消费 `exec` 与 `done.output`，`token` 事件丢弃（正文仍等校验后一次性展示）」；
3. **UX**：在查码 Tab 的讲解台补「过程轨」的交互与视觉规范；
4. **Epic/Sprint**：新增 Story（建议 key `wt-5-6-ai-explain-exec-events`），验收标准见 §8；
5. 之后才进入 `create-story → dev-story → code-review → 用户验收`。

本文档是**工具箱侧的实施依据**；miao-ai 侧已实现，契约以
`miao-ai/docs/integration-guide-exec-events.md` 为准。

---

## 7. 实测证据（真实平台，2026-10-17）

> v1 用的是沙箱原型；**v2 直接打真实 miao-ai 平台（:8000）**，用临时 per-agent API Key
> 走 `/api/v1/agents/wubi-explainer/invoke/stream`。测完已删除临时 Key。

### 7.1 离线模式：「编」xyna（`online: false`）

```
conversation: turn=1 history_truncated=False
exec seq=1 kind=tool_call    {"call_id":"c1","name":"tables.lookup","input":{"char":"编"}}
exec seq=2 kind=tool_result  {"call_id":"c1","name":"tables.lookup","ok":true,
                              "output":{"hit":true,"code":"xyna","table":"86-1/2026-09-17"},"ms":13}
exec seq=3 kind=log          {"level":"info","text":"调用方要求离线，跳过联网核验"}
exec seq=4 kind=tool_call    {"call_id":"c2","name":"llm.decide",
                              "input":{"model":"deepseek-v4-flash-0731","attempt":1,"prompt_chars":272}}
exec seq=5 kind=tool_result  {"call_id":"c2","name":"llm.decide","ok":true,
                              "output":{"chars":523,"parsed":true},"ms":3447}
done: latency_ms=5615  output.code=xyna  positions=['纟','讠','尸','艹']
```

### 7.2 联网模式：「编」xyna（`online: true`）—— **关键证据在时序**

| 到达时刻 | 事件 | 它实际阻塞多久 |
|---|---|---|
| **0.14s** | `tool_call  tavily.search` | 4.97s（`tool_result` 在 5.10s 才到） |
| 5.11s | `tool_call  llm.decide` | 3.31s（`tool_result` 在 8.41s 才到） |
| 9.79s | `done` | — |

```
[  0.13s] exec seq=1 tool_call    tables.lookup  ← 开始
[  0.13s] exec seq=2 tool_result  tables.lookup  ms=0
[  0.14s] exec seq=3 tool_call    tavily.search  ← 开始
[  5.10s] exec seq=4 tool_result  tavily.search  ms=4968
[  5.11s] exec seq=5 tool_call    llm.decide     ← 开始
[  8.41s] exec seq=6 tool_result  llm.decide     ms=3308
[  9.79s] done
```

**这就是「等待期可见」的证明**：工具名与「进行中」状态在阻塞**开始那一刻**就到了，
不是算完一次性到达。工具箱「等十几秒什么都看不到」的根因因此被彻底解决。

### 7.3 多轮追问（第 4 轮，注入 3 轮历史）

```
[  0.10s] conversation turn=4 injected=[1, 2, 3]
[  0.10s] exec tool_call    llm.decide  ← 开始
[  2.33s] exec tool_result  llm.decide  ms=2232
[  3.26s] done kind=reasoned
```

追问轮同样有完整事件流，且 `conversation` 事件仍是第一条、`done.output` 仍是结构化结果。

### 7.4 miao-ai 侧测试与自检（本次全部实跑）

| 命令 | 结果 |
|---|---|
| `pytest tests/test_agent_sdk_exec.py tests/test_runner_stream_exec.py` | **37 passed** |
| `pytest tests/test_invoke_exec_passthrough.py` | **5 passed** |
| `python evals/check_exec_events.py` | **全部通过**（5 组不变量：成对/seq 单调/入参出参真实、阻塞期先到、失败如实上报、非流式零影响、事件不来自模型） |

### 7.5 复现方式

```bash
# miao-ai 侧自检（无需模型/网络）
cd miao-ai/demos/wubi-explainer && ../../backend/.venv/bin/python evals/check_exec_events.py
cd miao-ai/backend && .venv/bin/python -m pytest tests/test_*exec*.py -q

# 端到端（需平台 :8000 在跑 + 一个 per-agent API Key）
curl -sN -X POST http://127.0.0.1:8000/api/v1/agents/wubi-explainer/invoke/stream \
  -H "Authorization: Bearer $WUBI_KEY" -H 'Content-Type: application/json' \
  -H 'Accept: text/event-stream' \
  -d '{"input":{"char":"编","code":"xyna","online":true,"positions":[...]},
       "metadata":{"conversation_id":"conv_xxx"}}'
```

> ⚠️ 本机联调踩坑：macOS 系统代理含 `[::1]` 条目时，httpx 解析 proxy mount 会抛
> `InvalidURL: Invalid port: ':1]'`（`httpx/_utils.py` 的 `all://*[::1]`）。
> 这与平台无关（平台进程本身不受影响），但用 Python 脚本直连时需清代理变量。

---


## 8. 验收方式（Story 建议验收标准）

环境：
```bash
cd miao-toolbox-api && ./mvnw spring-boot:run          # :8080
cd miao-toolbox-web && npm run dev                     # :5173
# miao-ai 平台 :8000，wubi-explainer 已激活含执行事件的版本（本次实测已确认可用）
```

| # | 操作 | 预期 |
|---|---|---|
| AC-1 | 查码 Tab 选「编」 | 等待期出现过程轨，且**联网那一步在等待开始时就显示「进行中」**（不是结束后才出现）；随后依次完成 |
| AC-2 | 断网 / 把 `TAVILY_API_KEY` 置空 | 「联网检索」显示**失败或跳过**（`log` 里的说明），但讲解仍按内置码表 + 模型给出（AI 是可选增强） |
| AC-3 | 模型两次尝试都不通过校验 | 过程轨如实显示失败与原因摘要（来自 `log(warn)`），不伪装成成功 |
| AC-4 | 等待中点「取消」 | 流中断，过程轨停止，线程进入可重试态（不残留永久 busy） |
| AC-5 | 等待中切换到另一个字 | 旧字过程轨冻结并标注「已取消」，新字开始新过程轨（沿用现有抢占语义） |
| AC-6 | 追问一轮 | 追问也有过程轨（实测：`llm.decide` 一条）；`conversationId` / 410 自动重开会话链路行为与同步版一致 |
| AC-7 | 前端主动关掉流式端点 / 后端返回 5xx | 自动回退同步端点，用户仍能拿到讲解（不因流式失败而失去功能） |
| AC-8 | 老版本 agent（不上报 exec） | 过程轨不出现，其余行为与现在完全一致 |
| AC-9 | 未知 `kind` / 未知工具名 | 降级为通用条目显示（不报错、不中断流） |
| AC-10 | 未知事件名（如未来新增） | **丢弃**，不拼进正文（这条最容易写错，必须有单测） |
| AC-11 | `done.output` 与过程轨同时存在 | 讲解正文/断言仍只取 `done.output`；`tool_result.output` 绝不被当作拆字结论 |

一键脚本：扩展 `scripts/headless-check-wt-5-5-ai-explain-chat.py`；
后端往返测试：`WubiAiStreamControllerTest`；前端纯解析测试：`explainStream.test.ts`。

---

## 9. 风险与待决问题

| 风险 | 说明 | 处置 |
|---|---|---|
| **sink 串轮** | SDK 用 `threading.local()` 存 sink，runner 已在每个请求开头 `_reset_sdk_sink()` 兜底；agent 侧非流式路径也主动 `progress.clear()` | 已由 miao-ai 侧处理；工具箱侧只需保证不复用同一 SseEmitter 跑两轮 |
| **未知事件名被拼进正文** | 这是最典型的写错方式（把 `exec` 当 `token` 拼） | 前端解析器**必须**：只处理 `exec`/`token`/`done`/`error`/`conversation`，其余丢弃；F6 单测覆盖 |
| 工具箱双端点维护成本 | 同步 + 流式两套路径 | 流式端点复用 `WubiAiService` 的会话与错误映射，只复用不复制；同步端点保留并纳入回归 |
| 代理/缓冲 | 生产 nginx 可能缓冲 SSE | 已有先例（diff/regex/cron 已跑通 SSE），沿用其 `X-Accel-Buffering: no` 等配置；miao-ai 侧响应头已带 `x-accel-buffering: no` |
| 过程轨信息过载 | 一般一轮 2~6 条工具事件，可接受 | 一行一次调用（按 `call_id` 折叠），`running` 高亮，完成态收敛为「工具名 + 耗时」 |
| 工具名是英文 | `tables.lookup` / `tavily.search` / `llm.decide` | 固定映射成中文标签（见 §5.3 术语映射），未知工具名显示原名 |

**待用户确认的决策点**

1. 是否现在就做工具箱侧（方案 A：实时过程轨）？miao-ai 侧已就绪，只差消费端。
2. 工具箱是否保留同步端点作自动回退（**建议保留**，AI 是可选增强）。
3. 过程轨的展示粒度：只显示当前进行中的一步，还是完整列出本轮所有调用（**建议完整列出**，miao-ai 文档也这么建议）。
4. 是否同步更新 `docs/wubi-tutor.md` §7「为什么不做流式」—— 那段结论需要改写为「过程走流式、答案仍走一次性结构化结果」。

---

## 附录 A：工具箱侧实现要点（可直接照抄的范式）

> v1 附录是沙箱原型的 diff；v2 起 **miao-ai 侧已落地**，这里改成工具箱侧要写的代码范式。
> 参考实现见 `miao-ai/frontend/src/app/agents/[name]/page.tsx` 的 `parseExecEvent` /
> `groupExecEvents` / `ExecTrace`（同一套折叠逻辑，只是换成 React + TS 而已）。

### A.1 后端 SSE 代理骨架（照 `DiffAIController.doProxyStream`）

```java
// 关键点：逐个 SSE 事件原样转发，不设事件名白名单 —— exec 才能透过去
while ((line = reader.readLine()) != null) {
    if (line.startsWith("event:")) {
        currentEvent = line.substring(6).trim();
    } else if (line.startsWith("data:")) {
        currentData.append(line.substring(5).trim());
    } else if (line.isEmpty()) {
        if (currentData.length() > 0) {
            emitter.send(SseEmitter.event()
                    .name(currentEvent)          // ← exec / token / done / error / conversation
                    .data(currentData.toString()));
            if ("done".equals(currentEvent)) {
                // 只有 done 需要额外处理：记录 output 供会话记账/可观测
                recordDoneEvent(handle, currentData.toString());
            }
        }
        currentEvent = "message";
        currentData.setLength(0);
    }
}
```

### A.2 前端事件折叠（纯函数，可单测）

```ts
export type ExecEntry = {
  callId: string;
  name: string;          // 工具名原样（tables.lookup / tavily.search / llm.decide）
  status: 'running' | 'ok' | 'failed';
  ms?: number;
  error?: string;
};

/** tool_call 到了先建行（进行中），tool_result 到了**就地更新**它 —— 不追加新行 */
export function foldExec(entries: ExecEntry[], ev: ExecEvent): ExecEntry[] {
  if (ev.kind === 'tool_call' && ev.call_id) {
    return [...entries, { callId: ev.call_id, name: ev.name ?? ev.call_id, status: 'running' }];
  }
  if (ev.kind === 'tool_result' && ev.call_id) {
    const idx = entries.findIndex((e) => e.callId === ev.call_id);
    const done: ExecEntry = {
      callId: ev.call_id,
      name: ev.name ?? entries[idx]?.name ?? ev.call_id,
      status: ev.ok === false ? 'failed' : 'ok',
      ms: ev.ms,
      error: ev.error,
    };
    // 孤儿 result（没等到 call）：照样显示，不能静默丢
    return idx < 0 ? [...entries, done] : entries.map((e, i) => (i === idx ? done : e));
  }
  return entries;   // log / thinking / 自定义 kind：按需单独列，不混进工具行
}

/** 工具名 → 中文标签；未知工具名原样显示，不要猜 */
export function toolLabel(name: string): string {
  return ({ 'tables.lookup': '查内置码表',
            'tavily.search': '联网检索',
            'llm.decide': '模型判断拆分' } as Record<string, string>)[name] ?? name;
}
```

### A.3 前端的三个「必须」

1. **未知事件名丢弃**，绝不拼进正文（否则 `exec` 的 JSON 会混进讲解文字）；
2. **业务结果只认 `done.output`**：`tool_result.output` 是过程信息，不是拆字结论；
3. **`tool_call` 到了就渲染「进行中」**：这是等待期唯一真实的进度信息，
   等 result 再渲染等于又回到「转圈 5 秒」。

---

## 附录 B：为什么本方案不违反「只承认可机器判定的东西」

- 过程轨展示的是**服务端确定性上报的执行事实**（调用了什么工具、耗时、成功/失败），
  由 agent 代码产生（`tables.lookup` / `tavily.search` / `llm.decide`），
  不是模型生成的叙述，因此不引入新的「不可核验断言」；
- `thinking` 类事件（模型内容）本 agent **不发**；即使将来发，UI 也必须与执行事实
  分开呈现（miao-ai Try Run 已用引用样式区分）；
- 最终答案仍然必须过候选集核对（`isExplanationDisplayable` / `verifyTurn`）才展示，
  过程轨的出现**不降低**任何现有校验门槛；
- 工具失败（联网拿不到码、模型重试被拒）在过程轨上**如实显示**，
  这比现在「转圈到超时」更诚实，也让「编/照」这类问题一眼看出卡在哪一步。
