package com.miao.toolbox.tool.wubi;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.miao.toolbox.observability.AiInvocationRecorder;
import com.miao.toolbox.observability.MiaoAiClient;
import com.miao.toolbox.observability.MiaoAiProperties;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.atMost;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.asyncDispatch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.request;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 讲解台流式端点的**真实 HTTP 往返**测试（本机起 HttpServer 冒充 miao-ai）。
 *
 * <p>为什么必须走真实往返：这个 Controller 的价值与风险**全在「原样转发」上** ——
 * 把 `exec` 事件误判成正文、把未知事件名丢掉、把上游 410 映射错，这些都只有跑一次
 * 真的 SSE 才看得出来。纯 mock 的单元测试会把「我以为它转发了」当成「它转发了」。
 *
 * <p>覆盖的三类不变量：
 * <ol>
 *   <li><b>透传</b>：`exec` / `token` / 未知事件名 / `done` 事件一律到达客户端，
 *       顺序与内容与上游一致；</li>
 *   <li><b>语义</b>：上游非 200（410/429/5xx）翻译成与同步路径同一套业务码，放进
 *       `event: error` 的载荷里，前端才能复用「410 自动开新会话」那条链路；</li>
 *   <li><b>降级</b>：agent 未启用时立刻回错误事件，不让浏览器对着空流干等。</li>
 * </ol>
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
@DisplayName("WubiAiStreamController SSE 透传与错误码契约（真实 HTTP 往返）")
class WubiAiStreamControllerTest {

    private static final String AGENT = "wubi-explainer";

    private final List<HttpServer> servers = new ArrayList<>();
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Mock
    private MiaoAiClient miaoAiClient;

    private MiaoAiProperties properties;
    private MockMvc mvc;
    /** 最近一次转发给上游的请求体（断言 input 契约完整性用） */
    private Map<String, Object> upstreamBody;

    @BeforeEach
    void setUp() {
        properties = new MiaoAiProperties();
        AiInvocationRecorder.InvocationHandle handle =
                org.mockito.Mockito.mock(AiInvocationRecorder.InvocationHandle.class);
        lenient().when(miaoAiClient.recordStreamStart(anyString(), any())).thenReturn(handle);
    }

    @AfterEach
    void tearDown() {
        servers.forEach(server -> server.stop(0));
        servers.clear();
    }

    // ── 测试脚手架 ───────────────────────────────────────────

    /**
     * 起一个本机 miao-ai，`/invoke/stream` 返回给定的 SSE 原文。
     *
     * @param status       HTTP 状态码
     * @param body         SSE 正文（status=200 时）或错误体
     */
    private void startUpstream(int status, String body) throws IOException {
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        servers.add(server);
        server.createContext("/api/v1/agents/" + AGENT + "/invoke/stream", exchange -> {
            try {
                upstreamBody = objectMapper.readValue(
                        exchange.getRequestBody().readAllBytes(), Map.class);
            } catch (IOException e) {
                upstreamBody = null;
            }
            byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "text/event-stream; charset=utf-8");
            exchange.sendResponseHeaders(status, bytes.length);
            try (OutputStream os = exchange.getResponseBody()) {
                os.write(bytes);
            }
        });
        server.start();

        MiaoAiProperties.AgentConfig agent = new MiaoAiProperties.AgentConfig();
        agent.setEnabled(true);
        agent.setBaseUrl("http://127.0.0.1:" + server.getAddress().getPort());
        agent.setApiKey("test-key");
        agent.setConnectTimeout(2000);
        agent.setReadTimeout(5000);
        properties.setAgents(new LinkedHashMap<>(Map.of(AGENT, agent)));

        when(miaoAiClient.getStreamUrl(AGENT)).thenReturn(
                agent.getBaseUrl() + "/api/v1/agents/" + AGENT + "/invoke/stream");
        when(miaoAiClient.getStreamHeaders(AGENT)).thenReturn(new org.springframework.http.HttpHeaders());
        when(miaoAiClient.buildStreamBody(any(), any())).thenAnswer(inv -> {
            Map<String, Object> body2 = new LinkedHashMap<>();
            body2.put("input", inv.getArgument(0));
            body2.put("metadata", inv.getArgument(1));
            return body2;
        });

        WubiAiService syncService = new WubiAiService(miaoAiClient);
        WubiAiStreamService streamService =
                new WubiAiStreamService(miaoAiClient, properties, syncService);
        WubiAiStreamController controller =
                new WubiAiStreamController(streamService, syncService, miaoAiClient, properties);
        mvc = MockMvcBuilders.standaloneSetup(controller).build();
    }

    private void drain(HttpExchange exchange) {
        try (var is = exchange.getRequestBody()) {
            is.readAllBytes();
        } catch (IOException ignored) {
            // 读请求体失败不影响本测试的关注点
        }
    }

    /** 发一个流式请求并收齐 SSE 原文 */
    private String stream(String path, String jsonBody) throws Exception {
        MvcResult result = mvc.perform(post(path)
                        .contentType("application/json")
                        .accept("text/event-stream")
                        .content(jsonBody))
                .andExpect(request().asyncStarted())
                .andReturn();

        result.getAsyncResult(10_000L);
        MvcResult dispatched = mvc.perform(asyncDispatch(result))
                .andExpect(status().isOk())
                .andReturn();
        return dispatched.getResponse().getContentAsString(StandardCharsets.UTF_8);
    }

    private String explainBody() {
        return """
                {"char":"编","code":"xyna","positions":[{"index":1,"key":"y"}]}
                """;
    }

    /** 从 SSE 原文里拆出 [(event, data)] */
    private List<Map.Entry<String, String>> events(String sse) {
        List<Map.Entry<String, String>> out = new ArrayList<>();
        String event = "";
        for (String line : sse.split("\n")) {
            if (line.startsWith("event:")) {
                event = line.substring(6).trim();
            } else if (line.startsWith("data:")) {
                out.add(Map.entry(event, line.substring(5).trim()));
            }
        }
        return out;
    }

    private String eventNames(String sse) {
        List<Map.Entry<String, String>> list = events(sse);
        List<String> names = new ArrayList<>();
        list.forEach(e -> names.add(e.getKey()));
        return String.join(",", names);
    }

    // ── 1. 透传：exec / token / 未知事件 / done 全部到达 ─────

    @Test
    @DisplayName("exec 事件原样透传（工具过程可见的基础）")
    void execEventsPassThrough() throws Exception {
        startUpstream(200, """
                event: exec
                data: {"kind":"tool_call","call_id":"c1","name":"tavily.search","input":{"query":"编"},"seq":1}

                event: exec
                data: {"kind":"tool_result","call_id":"c1","name":"tavily.search","ok":true,"ms":4968,"seq":2}

                event: done
                data: {"trace_id":"t1","latency_ms":5000,"output":{"code":"xyna"}}

                """);

        String sse = stream("/api/wubi/ai/explain/stream", explainBody());
        List<Map.Entry<String, String>> list = events(sse);

        assertEquals(3, list.size(), "exec×2 + done，实际：" + sse);
        assertEquals("exec", list.get(0).getKey());
        assertTrue(list.get(0).getValue().contains("\"name\":\"tavily.search\""));
        assertTrue(list.get(0).getValue().contains("\"call_id\":\"c1\""));
        assertEquals("exec", list.get(1).getKey());
        assertTrue(list.get(1).getValue().contains("\"ok\":true"));
        assertEquals("done", list.get(2).getKey());
    }

    @Test
    @DisplayName("token 与未知事件名都透传，且顺序不变（不设白名单）")
    void unknownEventsAreForwardedInOrder() throws Exception {
        startUpstream(200, """
                event: token
                data: {"token":"「编」的"}

                event: conversation
                data: {"conversation_id":"conv_1","turn":1}

                event: some_future_event
                data: {"whatever":true}

                event: done
                data: {"trace_id":"t1","output":{}}

                """);

        String sse = stream("/api/wubi/ai/explain/stream", explainBody());
        assertEquals("token,conversation,some_future_event,done", eventNames(sse),
                "未知事件名被丢弃了 —— 平台将来新增事件会静默断掉");
    }

    @Test
    @DisplayName("done 事件保留完整 output（结论只认它，不认 exec 出参）")
    void doneCarriesFullOutput() throws Exception {
        startUpstream(200, """
                event: exec
                data: {"kind":"tool_result","call_id":"c2","name":"llm.decide","ok":true,"ms":3308,"output":{"chars":523}}

                event: done
                data: {"trace_id":"t9","latency_ms":9800,"output":{"code":"xyna","positions":[{"radical":"纟"}]}}

                """);

        String sse = stream("/api/wubi/ai/explain/stream", explainBody());
        String doneData = events(sse).stream()
                .filter(e -> "done".equals(e.getKey()))
                .findFirst().orElseThrow().getValue();

        Map<?, ?> done = objectMapper.readValue(doneData, Map.class);
        assertEquals("t9", done.get("trace_id"));
        Map<?, ?> output = (Map<?, ?>) done.get("output");
        assertEquals("xyna", output.get("code"));
        assertTrue(doneData.contains("positions"), "done 必须带完整结构化结果");
    }

    // ── 2. 语义：上游非 200 映射成与同步路径同一套业务码 ──────

    @Test
    @DisplayName("上游 410 → AI_CONVERSATION_EXPIRED（前端据此自动开新会话）")
    void upstream410MapsToConversationExpired() throws Exception {
        startUpstream(410, "{\"detail\":\"conversation expired\"}");

        String sse = stream("/api/wubi/ai/explain/stream", explainBody());
        Map.Entry<String, String> err = events(sse).stream()
                .filter(e -> "error".equals(e.getKey()))
                .findFirst().orElseThrow(() -> new AssertionError("没有 error 事件：" + sse));

        Map<?, ?> payload = objectMapper.readValue(err.getValue(), Map.class);
        assertEquals("AI_CONVERSATION_EXPIRED", payload.get("code"));
        assertTrue(String.valueOf(payload.get("message")).contains("410"),
                "消息里必须保留状态码，排障靠它：" + payload.get("message"));
    }

    @Test
    @DisplayName("上游 429 → AI_QUOTA_EXCEEDED；用尽配额不该说成服务不可用")
    void upstream429MapsToQuotaExceeded() throws Exception {
        startUpstream(429, "{\"detail\":\"rate limit\"}");

        String sse = stream("/api/wubi/ai/explain/stream", explainBody());
        Map<?, ?> payload = objectMapper.readValue(
                events(sse).stream().filter(e -> "error".equals(e.getKey()))
                        .findFirst().orElseThrow().getValue(), Map.class);

        assertEquals("AI_QUOTA_EXCEEDED", payload.get("code"));
    }

    @Test
    @DisplayName("上游 5xx → AI_SERVICE_UNAVAILABLE")
    void upstream5xxMapsToServiceUnavailable() throws Exception {
        startUpstream(502, "bad gateway");

        String sse = stream("/api/wubi/ai/explain/stream", explainBody());
        Map<?, ?> payload = objectMapper.readValue(
                events(sse).stream().filter(e -> "error".equals(e.getKey()))
                        .findFirst().orElseThrow().getValue(), Map.class);

        assertEquals("AI_SERVICE_UNAVAILABLE", payload.get("code"));
    }

    // ── 3. 校验与降级 ───────────────────────────────────────

    @Test
    @DisplayName("positions 为空 → 立刻回 VALIDATION_FAILED，不去连上游")
    void missingPositionsFailsFast() throws Exception {
        startUpstream(200, "event: done\ndata: {}\n\n");

        String sse = stream("/api/wubi/ai/explain/stream",
                "{\"char\":\"编\",\"code\":\"xyna\",\"positions\":[]}");
        Map<?, ?> payload = objectMapper.readValue(
                events(sse).stream().filter(e -> "error".equals(e.getKey()))
                        .findFirst().orElseThrow().getValue(), Map.class);

        assertEquals("VALIDATION_FAILED", payload.get("code"));
    }

    @Test
    @DisplayName("agent 未启用 → 立刻回 AI_AGENT_DISABLED，不让浏览器对着空流干等")
    void disabledAgentFailsFast() throws Exception {
        startUpstream(200, "event: done\ndata: {}\n\n");
        properties.getAgent(AGENT).setEnabled(false);

        String sse = stream("/api/wubi/ai/explain/stream", explainBody());
        Map<?, ?> payload = objectMapper.readValue(
                events(sse).stream().filter(e -> "error".equals(e.getKey()))
                        .findFirst().orElseThrow().getValue(), Map.class);

        assertEquals("AI_AGENT_DISABLED", payload.get("code"));
    }

    @Test
    @DisplayName("追问缺 conversationId → VALIDATION_FAILED")
    void followupRequiresConversationId() throws Exception {
        startUpstream(200, "event: done\ndata: {}\n\n");

        String sse = stream("/api/wubi/ai/followup/stream",
                "{\"char\":\"编\",\"question\":\"为什么第二位是讠\"}");
        Map<?, ?> payload = objectMapper.readValue(
                events(sse).stream().filter(e -> "error".equals(e.getKey()))
                        .findFirst().orElseThrow().getValue(), Map.class);

        assertEquals("VALIDATION_FAILED", payload.get("code"));
    }

    @Test
    @DisplayName("追问链路正常：exec 与 done 同样透传")
    void followupPassesEventsThrough() throws Exception {
        startUpstream(200, """
                event: conversation
                data: {"conversation_id":"conv_1","turn":2}

                event: exec
                data: {"kind":"tool_call","call_id":"c3","name":"llm.decide","seq":1}

                event: done
                data: {"trace_id":"t2","output":{"followup":{"kind":"reasoned"}}}

                """);

        String sse = stream("/api/wubi/ai/followup/stream",
                "{\"char\":\"编\",\"question\":\"为什么第二位是讠\",\"conversationId\":\"conv_1\"}");
        assertEquals("conversation,exec,done", eventNames(sse));
    }

    /**
     * input 契约完整性：流式路径的 input 是**显式白名单**拼出来的，
     * 漏一个键就是一条真实功能失效。历史上最容易漏的两处：
     * `task`（词组模式开关，漏了词组讲解全废）与词组相关字段。
     */
    @Test
    @DisplayName("词组模式的 input 字段一个都不能漏")
    void phraseInputKeysAllForwarded() throws Exception {
        startUpstream(200, "event: done\ndata: {}\n\n");

        String body = "{\"char\":\"编码\",\"task\":\"explain-phrase\",\"phrase\":\"编码\","
                + "\"code\":\"xydc\",\"ruleLabel\":\"二字词 · 每字取前 2 码\","
                + "\"derivedCode\":\"xydc\",\"matchesTable\":true,\"skippedChars\":[],"
                + "\"positions\":[{\"index\":0,\"key\":\"x\",\"fromChar\":\"编\"}],"
                + "\"conversationId\":\"conv_1\"}";
        stream("/api/wubi/ai/explain/stream", body);

        Map<?, ?> sent = (Map<?, ?>) upstreamBody.get("input");
        assertEquals("explain-phrase", sent.get("task"),
                "漏了 task：词组会被当成单字，讲解全废");
        assertEquals("编码", sent.get("phrase"));
        assertEquals("二字词 · 每字取前 2 码", sent.get("ruleLabel"));
        assertEquals("xydc", sent.get("derivedCode"));
        assertEquals(true, sent.get("matchesTable"));
        assertTrue(sent.containsKey("skippedChars"));
        assertFalse(sent.containsKey("conversationId"), "conversationId 必须走 metadata");
        Map<?, ?> meta = (Map<?, ?>) upstreamBody.get("metadata");
        assertEquals("conv_1", meta.get("conversation_id"));
    }

    /**
     * 一次调用只记一次账。
     *
     * `AiInvocationRecorder` 没有幂等保护（每次 record 都 `repository.save`），
     * 而 SSE 的失败路径天然会重叠：上游非 2xx → `recordStreamFailure`，
     * 随后 catch 里再记一次；`emitter.onTimeout` / `onError` 也会叠加。
     * 不守卫的话同一次调用在 `ai_invocations` 里出现多条记录，失败率虚高。
     */
    @Test
    @DisplayName("上游失败时只记录一次（不会既记失败又记失败）")
    void recordsExactlyOnceOnFailure() throws Exception {
        startUpstream(429, "{\"detail\":\"rate limit\"}");

        stream("/api/wubi/ai/explain/stream", explainBody());

        // 上游非 2xx 路径：只应有一次 recordStreamFailure
        verify(miaoAiClient, times(1)).recordStreamFailure(
                any(), eq("AI_UPSTREAM_429"), anyString());
        // 成功路径一次都不该触发
        verify(miaoAiClient, never()).recordStreamSuccess(
                any(), any(), any(), any(), any(), any(), any(), any());
    }

    @Test
    @DisplayName("成功时只记录一次成功")
    void recordsExactlyOnceOnSuccess() throws Exception {
        startUpstream(200, """
                event: exec
                data: {"kind":"tool_call","call_id":"c1","name":"tables.lookup","seq":1}

                event: done
                data: {"trace_id":"t1","output":{"code":"xyna"}}

                """);

        stream("/api/wubi/ai/explain/stream", explainBody());

        verify(miaoAiClient, times(1)).recordStreamSuccess(
                any(), any(), any(), eq("t1"), any(), any(), any(), any());
        verify(miaoAiClient, never()).recordStreamFailure(any(), anyString(), anyString());
    }

    /**
     * 客户端断开（关页面 / 取消请求）**不是故障**。
     *
     * <p>直接起一个**会断的上游**：写出半个事件就关闭连接 ——
     * `forwardEvents` 的 `readLine()` 立刻拿到 EOF（IOException），于是抛
     * `UpstreamGoneException`。这条路径必须被真实走到，否则
     * 「上游断流要告知用户」只是一句注释而不是被验证的行为。
     */
    @Test
    @DisplayName("上游中途断流 → 记 AI_UPSTREAM_BROKEN 并告知用户")
    void upstreamBrokenStreamIsReported() throws Exception {
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        servers.add(server);
        server.createContext("/api/v1/agents/" + AGENT + "/invoke/stream", exchange -> {
            drain(exchange);
            // 只写事件头、不写完整事件就断开：模拟连接被掐断
            byte[] partial = "event: exec\ndata: {\"kind\":\"log\"".getBytes(StandardCharsets.UTF_8);
            try {
                exchange.sendResponseHeaders(200, partial.length);
                try (OutputStream os = exchange.getResponseBody()) {
                    os.write(partial);
                    os.flush();
                }
            } catch (IOException ignored) {
                // 连接已断，正常
            }
        });
        server.start();

        MiaoAiProperties.AgentConfig agent = new MiaoAiProperties.AgentConfig();
        agent.setEnabled(true);
        agent.setBaseUrl("http://127.0.0.1:" + server.getAddress().getPort());
        agent.setApiKey("test-key");
        agent.setConnectTimeout(2000);
        agent.setReadTimeout(3000);
        properties.setAgents(new LinkedHashMap<>(Map.of(AGENT, agent)));
        when(miaoAiClient.getStreamUrl(AGENT)).thenReturn(
                agent.getBaseUrl() + "/api/v1/agents/" + AGENT + "/invoke/stream");
        when(miaoAiClient.getStreamHeaders(AGENT)).thenReturn(new org.springframework.http.HttpHeaders());
        when(miaoAiClient.buildStreamBody(any(), any())).thenAnswer(inv -> {
            Map<String, Object> b = new LinkedHashMap<>();
            b.put("input", inv.getArgument(0));
            b.put("metadata", inv.getArgument(1));
            return b;
        });
        WubiAiService sync = new WubiAiService(miaoAiClient);
        WubiAiStreamService svc = new WubiAiStreamService(miaoAiClient, properties, sync);
        mvc = MockMvcBuilders.standaloneSetup(
                new WubiAiStreamController(svc, sync, miaoAiClient, properties)).build();

        stream("/api/wubi/ai/explain/stream", explainBody());

        // 上游断流按 AI_UPSTREAM_BROKEN 记账（不是客户端断开，也不是通用代理错误）
        verify(miaoAiClient, times(1)).recordStreamFailure(
                any(), eq("AI_UPSTREAM_BROKEN"), anyString());
        verify(miaoAiClient, never()).recordStreamFailure(
                any(), eq("SSE_PROXY_ERROR"), anyString());
        verify(miaoAiClient, never()).recordStreamFailure(
                any(), eq("SSE_CLIENT_DISCONNECTED"), anyString());
    }

    @Test
    @DisplayName("流里没有 exec 事件时也正常工作（老版本 agent / 未上报）")
    void worksWithoutExecEvents() throws Exception {
        startUpstream(200, """
                event: token
                data: {"token":"讲解正文"}

                event: done
                data: {"trace_id":"t3","output":{"code":"xyna"}}

                """);

        String sse = stream("/api/wubi/ai/explain/stream", explainBody());
        assertFalse(sse.contains("event: exec"), "不该凭空造出 exec 事件");
        assertEquals("token,done", eventNames(sse));
    }
}
