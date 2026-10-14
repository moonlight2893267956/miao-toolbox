package com.miao.toolbox.observability;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.miao.toolbox.common.exception.BusinessException;
import com.miao.toolbox.observability.dto.MiaoAiInvokeResponse;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * MiaoAiClient 与上游的**真实 HTTP 往返**（本机起一个 HttpServer 当上游）。
 *
 * <p>!! 这一层以前是空的，代价很实在 !!
 *
 * <p>旧实现把「非 2xx」的判断写在 {@code exchange} **之后**的 is2xxSuccessful 分支里，
 * 而 RestTemplate 默认的 {@code DefaultResponseErrorHandler} 会在 {@code exchange} 内部
 * **先抛** HttpStatusCodeException —— 那段判断因此不可达：上游 410（会话过期）与
 * 429（配额）全被吞成 503「服务不可用」，前端「会话过期自动开新会话」永远不触发。
 *
 * <p>只测 {@code AiUpstreamErrors} 这个纯函数抓不到它（纯函数是对的，错的是它没被调用），
 * 所以这里必须让请求真的走一遍 HTTP。
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("MiaoAiClient 上游状态码映射（真实 HTTP 往返）")
class MiaoAiClientTest {

    private static final String AGENT = "wubi-explainer";

    private final List<HttpServer> servers = new ArrayList<>();
    private final AtomicInteger requestCount = new AtomicInteger();

    @Mock
    private AiInvocationRecorder recorder;

    @AfterEach
    void tearDown() {
        servers.forEach(server -> server.stop(0));
        servers.clear();
    }

    /** 起一个本机上游，把 /invoke 与 /conversations 的响应固定成给定状态码与 body */
    private MiaoAiClient clientWith(int status, String body, int retryCount) throws IOException {
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        servers.add(server);
        handler(server, "/invoke", status, body);
        handler(server, "/conversations", status, body);
        server.start();

        MiaoAiProperties properties = new MiaoAiProperties();
        MiaoAiProperties.AgentConfig agent = new MiaoAiProperties.AgentConfig();
        agent.setEnabled(true);
        agent.setBaseUrl("http://127.0.0.1:" + server.getAddress().getPort());
        agent.setApiKey("test-key");
        agent.setConnectTimeout(2000);
        agent.setReadTimeout(3000);
        agent.setRetryCount(retryCount);
        agent.setRetryInterval(10);
        properties.setAgents(new LinkedHashMap<>(Map.of(AGENT, agent)));

        // lenient：建会话路径不经过 recordStart，严格桩会误报 UnnecessaryStubbing
        lenient().when(recorder.recordStart(any(), any(), any(), any(), any()))
                .thenReturn(mock(AiInvocationRecorder.InvocationHandle.class));
        return new MiaoAiClient(properties, recorder, new ObjectMapper());
    }

    private void handler(HttpServer server, String suffix, int status, String body) {
        server.createContext("/api/v1/agents/" + AGENT + suffix, exchange -> {
            if (suffix.equals("/invoke")) {
                requestCount.incrementAndGet();
            }
            byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(status, bytes.length);
            try (OutputStream out = exchange.getResponseBody()) {
                out.write(bytes);
            }
        });
    }

    private BusinessException invokeAndCatch(MiaoAiClient client) {
        return assertThrows(BusinessException.class,
                () -> client.invoke(AGENT, Map.of("char", "照"), Map.of("tool", "wubi-tutor")));
    }

    // ─── 非 2xx：这一组就是旧实现漏掉的那一跳 ───────────────

    @Test
    @DisplayName("上游 410（会话过期）→ AI_UPSTREAM_410，且**不重试**")
    void upstream410_mapsToUpstream410() throws IOException {
        MiaoAiClient client = clientWith(410, "{\"detail\":\"conversation expired\"}", 1);

        BusinessException e = invokeAndCatch(client);

        assertEquals("AI_UPSTREAM_410", e.getErrorCode(),
                "410 必须能被上层识别为「会话过期」，否则自动开新会话永远不触发");
        assertTrue(e.getMessage().contains("410"), "消息要保留状态码便于排障：" + e.getMessage());
        assertEquals(1, requestCount.get(), "状态码是上游的确定性答复，不该重试");
    }

    @Test
    @DisplayName("上游 404 → AI_UPSTREAM_404（与会话过期分开）")
    void upstream404_mapsToUpstream404() throws IOException {
        assertEquals("AI_UPSTREAM_404",
                invokeAndCatch(clientWith(404, "{\"detail\":\"not found\"}", 1)).getErrorCode());
    }

    @Test
    @DisplayName("上游 403 → AI_UPSTREAM_403")
    void upstream403_mapsToUpstream403() throws IOException {
        assertEquals("AI_UPSTREAM_403",
                invokeAndCatch(clientWith(403, "{\"detail\":\"forbidden\"}", 1)).getErrorCode());
    }

    @Test
    @DisplayName("上游 409（同会话并发）→ AI_UPSTREAM_409")
    void upstream409_mapsToUpstream409() throws IOException {
        assertEquals("AI_UPSTREAM_409",
                invokeAndCatch(clientWith(409, "{\"detail\":\"busy\"}", 1)).getErrorCode());
    }

    @Test
    @DisplayName("上游 429（配额）→ AI_UPSTREAM_429")
    void upstream429_mapsToUpstream429() throws IOException {
        assertEquals("AI_UPSTREAM_429",
                invokeAndCatch(clientWith(429, "{\"detail\":\"quota\"}", 1)).getErrorCode());
    }

    @Test
    @DisplayName("上游 5xx → AI_UPSTREAM_5XX（空 body 也不影响分类）")
    void upstream5xx_mapsToUpstream5xx() throws IOException {
        assertEquals("AI_UPSTREAM_5XX", invokeAndCatch(clientWith(503, "", 1)).getErrorCode());
    }

    @Test
    @DisplayName("上游 2xx 但空 body → AI_RESPONSE_INVALID（不是「未预期的状态码」）")
    void upstreamEmptyBody_mapsToResponseInvalid() throws IOException {
        assertEquals("AI_RESPONSE_INVALID", invokeAndCatch(clientWith(200, "", 1)).getErrorCode());
    }

    @Test
    @DisplayName("上游 2xx 但 output 缺失 / body 非法 JSON → AI_ANALYSIS_FAILED")
    void upstreamBadPayload_mapsToAnalysisFailed() throws IOException {
        assertEquals("AI_ANALYSIS_FAILED", invokeAndCatch(clientWith(200, "{\"trace_id\":\"t\"}", 1)).getErrorCode());
        assertEquals("AI_ANALYSIS_FAILED", invokeAndCatch(clientWith(200, "not-json", 1)).getErrorCode());
    }

    // ─── 成功路径与会话字段 ──────────────────────────────

    @Test
    @DisplayName("上游 200 正常返回 → output 原样透出，顶层会话字段被解析")
    void upstreamSuccess_parsesOutputAndConversation() throws IOException {
        MiaoAiClient client = clientWith(200, """
                {"output":{"code":"jvko","explanation":"讲清楚了"},
                 "trace_id":"trace-1","conversation_id":"conv_1","turn":2,"history_truncated":true}
                """, 1);

        MiaoAiInvokeResponse response = client.invoke(AGENT, Map.of("char", "照"), Map.of());

        assertEquals("conv_1", response.getConversationId());
        assertEquals(2, response.getTurn());
        assertEquals(Boolean.TRUE, response.getHistoryTruncated());
        assertTrue(response.getOutput() instanceof Map, "output 应原样透出");
    }

    @Test
    @DisplayName("createConversation 解析 conversation_id / 上游错误时报建会话失败")
    void createConversation_parsesIdAndFailsLoudly() throws IOException {
        assertEquals("conv_new",
                clientWith(201, "{\"conversation_id\":\"conv_new\"}", 1).createConversation(AGENT, Map.of()));

        assertEquals("AI_CONVERSATION_FAILED",
                assertThrows(BusinessException.class,
                        () -> clientWith(500, "boom", 1).createConversation(AGENT, Map.of())).getErrorCode());
    }

    // ─── 本地拒绝（不发请求）───────────────────────────

    @Test
    @DisplayName("Agent 未启用 / 未配置 → 本地直接拒绝，不发起请求")
    void disabledOrMissingAgent_isRejectedLocally() {
        ObjectMapper mapper = new ObjectMapper();

        MiaoAiProperties disabledProps = new MiaoAiProperties();
        MiaoAiProperties.AgentConfig disabled = new MiaoAiProperties.AgentConfig();
        disabled.setEnabled(false);
        disabledProps.setAgents(new LinkedHashMap<>(Map.of(AGENT, disabled)));
        MiaoAiClient disabledClient = new MiaoAiClient(disabledProps, recorder, mapper);

        assertEquals("AI_AGENT_DISABLED", invokeAndCatch(disabledClient).getErrorCode());

        MiaoAiProperties emptyProps = new MiaoAiProperties();
        emptyProps.setAgents(new LinkedHashMap<>());
        MiaoAiClient missingClient = new MiaoAiClient(emptyProps, recorder, mapper);

        assertEquals("AI_AGENT_NOT_CONFIGURED", invokeAndCatch(missingClient).getErrorCode());
        assertEquals(0, requestCount.get(), "本地拒绝不该发起任何请求");
    }

    @Test
    @DisplayName("输入超过 max-input-bytes → AI_INPUT_TOO_LARGE（本地拒绝）")
    void oversizedInput_isRejectedLocally() throws IOException {
        MiaoAiProperties properties = new MiaoAiProperties();
        MiaoAiProperties.AgentConfig agent = new MiaoAiProperties.AgentConfig();
        agent.setEnabled(true);
        agent.setBaseUrl("http://127.0.0.1:1");
        agent.setApiKey("k");
        properties.setAgents(new LinkedHashMap<>(Map.of(AGENT, agent)));
        properties.setMaxInputBytes(16);
        MiaoAiClient client = new MiaoAiClient(properties, recorder, new ObjectMapper());

        BusinessException e = assertThrows(BusinessException.class,
                () -> client.invoke(AGENT, Map.of("char", "照".repeat(32)), Map.of()));

        assertEquals("AI_INPUT_TOO_LARGE", e.getErrorCode());
    }

    @Test
    @DisplayName("连不上上游 → AI_SERVICE_UNAVAILABLE(503)")
    void connectionFailure_mapsToServiceUnavailable() {
        when(recorder.recordStart(any(), any(), any(), any(), any()))
                .thenReturn(mock(AiInvocationRecorder.InvocationHandle.class));
        MiaoAiProperties properties = new MiaoAiProperties();
        MiaoAiProperties.AgentConfig agent = new MiaoAiProperties.AgentConfig();
        agent.setEnabled(true);
        agent.setBaseUrl("http://127.0.0.1:1");   // 未监听的端口：连接必被拒
        agent.setApiKey("k");
        agent.setConnectTimeout(500);
        agent.setReadTimeout(500);
        agent.setRetryCount(0);
        properties.setAgents(new LinkedHashMap<>(Map.of(AGENT, agent)));
        MiaoAiClient client = new MiaoAiClient(properties, recorder, new ObjectMapper());

        BusinessException e = invokeAndCatch(client);

        assertEquals("AI_SERVICE_UNAVAILABLE", e.getErrorCode());
        assertEquals(503, e.getHttpStatus());
    }
}
