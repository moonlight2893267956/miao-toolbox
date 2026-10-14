package com.miao.toolbox.tool.wubi;

import com.miao.toolbox.common.exception.BusinessException;
import com.miao.toolbox.observability.MiaoAiClient;
import com.miao.toolbox.observability.dto.MiaoAiInvokeResponse;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Captor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/**
 * {@link WubiAiService} 单元测试。
 *
 * <p>mock {@link MiaoAiClient}，用 ArgumentCaptor 捕获传给 agent 的 input / metadata，
 * 覆盖：会话创建与降级、输出结构校验、追问的输入裁剪、上游错误码映射。
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("WubiAiService 多轮会话与错误映射测试")
class WubiAiServiceTest {

    private static final String AGENT_KEY = "wubi-explainer";

    @Mock
    private MiaoAiClient aiClient;

    @InjectMocks
    private WubiAiService service;

    @Captor
    private ArgumentCaptor<Map<String, Object>> inputCaptor;

    @Captor
    private ArgumentCaptor<Map<String, Object>> metadataCaptor;

    // ── 测试数据 ────────────────────────────────────────────

    /** 一份合法的 explain 上下文（可变 Map，便于补 conversationId） */
    private Map<String, Object> explainBody() {
        Map<String, Object> body = new HashMap<>();
        body.put("char", "好");
        body.put("code", "vbg");
        body.put("positions", List.of(Map.of("index", 1, "key", "v", "candidates", List.of())));
        return body;
    }

    /** 构造一个 agent 返回结果 */
    private MiaoAiInvokeResponse response(Object output, String conversationId, Integer turn) {
        return MiaoAiInvokeResponse.builder()
                .mode("sync")
                .output(output)
                .model("gpt-4o")
                .traceId("trace-1")
                .conversationId(conversationId)
                .turn(turn)
                .build();
    }

    /** 构造一个「上游报错」的 BusinessException，错误码即 AiUpstreamErrors 的产物 */
    private BusinessException upstream(String errorCode) {
        return new BusinessException(errorCode, "miao-ai 返回 " + errorCode, 502);
    }

    // ── explain：会话创建 ───────────────────────────────────

    @Test
    @DisplayName("explain：无 conversationId 时建会话，metadata 带上平台返回的 id")
    void explain_withoutConversation_createsOne() {
        when(aiClient.createConversation(eq(AGENT_KEY), any())).thenReturn("conv-1");
        when(aiClient.invoke(eq(AGENT_KEY), any(), any()))
                .thenReturn(response(Map.of("explanation", "先打 v"), "conv-1", 1));

        Map<String, Object> result = service.explain(explainBody());

        verify(aiClient).createConversation(eq(AGENT_KEY), any());
        verify(aiClient).invoke(eq(AGENT_KEY), any(), metadataCaptor.capture());
        Map<String, Object> metadata = metadataCaptor.getValue();
        assertEquals("wubi-tutor", metadata.get("tool"));
        assertEquals("explain-split", metadata.get("action"));
        assertEquals("好", metadata.get("char"));
        assertEquals("conv-1", metadata.get("conversation_id"));

        assertEquals("先打 v", result.get("explanation"));
        assertEquals("conv-1", result.get("conversationId"));
        assertEquals(1, result.get("turn"));
        assertFalse(result.containsKey("historyTruncated"), "未裁剪时不该出现 historyTruncated");
    }

    @Test
    @DisplayName("explain：带 conversationId 时不新建会话，直接复用")
    void explain_withConversation_skipsCreate() {
        Map<String, Object> body = explainBody();
        body.put("conversationId", "conv-9");
        when(aiClient.invoke(eq(AGENT_KEY), any(), any()))
                .thenReturn(response(Map.of("explanation", "继续"), "conv-9", 2));

        service.explain(body);

        verify(aiClient, never()).createConversation(any(), any());
        verify(aiClient).invoke(eq(AGENT_KEY), any(), metadataCaptor.capture());
        assertEquals("conv-9", metadataCaptor.getValue().get("conversation_id"));
    }

    @Test
    @DisplayName("explain：建会话失败仍返回解释（降级单轮），且 metadata 无 conversation_id")
    void explain_createConversationFails_degradesToSingleTurn() {
        when(aiClient.createConversation(any(), any()))
                .thenThrow(upstream("AI_SERVICE_UNAVAILABLE"));
        when(aiClient.invoke(eq(AGENT_KEY), any(), any()))
                .thenReturn(response(Map.of("explanation", "降级回答"), null, null));

        Map<String, Object> result = service.explain(explainBody());

        assertEquals("降级回答", result.get("explanation"));
        assertNull(result.get("conversationId"), "没有会话时不该附 conversationId");
        verify(aiClient).invoke(eq(AGENT_KEY), any(), metadataCaptor.capture());
        assertFalse(metadataCaptor.getValue().containsKey("conversation_id"),
                "降级单轮时 metadata 不应带 conversation_id");
    }

    @Test
    @DisplayName("explain：agent 输出不是 Map → AI_RESPONSE_INVALID(502)")
    void explain_nonMapOutput_throwsInvalid() {
        when(aiClient.invoke(eq(AGENT_KEY), any(), any()))
                .thenReturn(response("这不是结构化输出", null, null));

        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.explain(explainBody()));

        assertEquals("AI_RESPONSE_INVALID", ex.getErrorCode());
        assertEquals(502, ex.getHttpStatus());
    }

    @Test
    @DisplayName("explain：非 BusinessException → AI_ANALYSIS_FAILED(502) 并保留原因")
    void explain_unexpectedException_wrapped() {
        when(aiClient.invoke(eq(AGENT_KEY), any(), any()))
                .thenThrow(new IllegalStateException("连接被重置"));

        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.explain(explainBody()));

        assertEquals("AI_ANALYSIS_FAILED", ex.getErrorCode());
        assertEquals(502, ex.getHttpStatus());
        assertEquals("连接被重置", ex.getMessage());
    }

    @Test
    @DisplayName("explain：char / code / positions 缺失或不合法 → VALIDATION_FAILED(400) 且不调 AI")
    void explain_invalidBody_rejected() {
        Map<String, Object> noChar = explainBody();
        noChar.remove("char");
        assertEquals("VALIDATION_FAILED", assertThrows(BusinessException.class,
                () -> service.explain(noChar)).getErrorCode());

        Map<String, Object> noCode = explainBody();
        noCode.remove("code");
        assertEquals("VALIDATION_FAILED", assertThrows(BusinessException.class,
                () -> service.explain(noCode)).getErrorCode());

        Map<String, Object> emptyPositions = explainBody();
        emptyPositions.put("positions", List.of());
        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.explain(emptyPositions));
        assertEquals("VALIDATION_FAILED", ex.getErrorCode());
        assertEquals(400, ex.getHttpStatus());

        Map<String, Object> wrongType = explainBody();
        wrongType.put("char", 123);
        assertEquals("VALIDATION_FAILED", assertThrows(BusinessException.class,
                () -> service.explain(wrongType)).getErrorCode());

        verifyNoInteractions(aiClient);
    }

    // ── followup ────────────────────────────────────────────

    @Test
    @DisplayName("followup：传给 agent 的 input 只含 char + question（不重发 code/positions）")
    void followup_inputOnlyCharAndQuestion() {
        when(aiClient.invoke(eq(AGENT_KEY), any(), any()))
                .thenReturn(response(Map.of("explanation", "因为…"), "conv-1", 3));

        Map<String, Object> result = service.followup(Map.of(
                "char", "好",
                "question", "为什么第一位是 v？",
                "conversationId", "conv-1"));

        verify(aiClient).invoke(eq(AGENT_KEY), inputCaptor.capture(), metadataCaptor.capture());
        Map<String, Object> input = inputCaptor.getValue();
        assertEquals(2, input.size(), "输入只应有 char 与 question：" + input.keySet());
        assertEquals("好", input.get("char"));
        assertEquals("为什么第一位是 v？", input.get("question"));

        Map<String, Object> metadata = metadataCaptor.getValue();
        assertEquals("wubi-tutor", metadata.get("tool"));
        assertEquals("followup", metadata.get("action"));
        assertEquals("conv-1", metadata.get("conversation_id"));

        assertEquals("因为…", result.get("explanation"));
        assertEquals("conv-1", result.get("conversationId"));
        assertEquals(3, result.get("turn"));
    }

    @Test
    @DisplayName("followup：缺 conversationId / question → VALIDATION_FAILED(400) 且不调 AI")
    void followup_missingFields_rejected() {
        BusinessException noConversation = assertThrows(BusinessException.class,
                () -> service.followup(Map.of("char", "好", "question", "为什么？")));
        assertEquals("VALIDATION_FAILED", noConversation.getErrorCode());
        assertEquals(400, noConversation.getHttpStatus());

        assertEquals("VALIDATION_FAILED", assertThrows(BusinessException.class,
                () -> service.followup(Map.of("char", "好", "conversationId", "conv-1"))).getErrorCode());

        assertEquals("VALIDATION_FAILED", assertThrows(BusinessException.class,
                () -> service.followup(Map.of("question", "为什么？", "conversationId", "conv-1")))
                .getErrorCode());

        verifyNoInteractions(aiClient);
    }

    // ── 上游错误码映射 ──────────────────────────────────────

    @Test
    @DisplayName("上游 410 → AI_CONVERSATION_EXPIRED(410)")
    void upstream410_mapsToConversationExpired() {
        when(aiClient.invoke(eq(AGENT_KEY), any(), any())).thenThrow(upstream("AI_UPSTREAM_410"));

        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.followup(Map.of("char", "好", "question", "q", "conversationId", "conv-1")));

        assertEquals("AI_CONVERSATION_EXPIRED", ex.getErrorCode());
        assertEquals(410, ex.getHttpStatus());
        assertEquals("AI 会话已失效，请重新开始讲解", ex.getMessage());
    }

    @Test
    @DisplayName("上游 404 → AI_CONVERSATION_NOT_FOUND(404)（与会话过期分开：合并会让排障时分不清是生命周期还是部署问题）")
    void upstream404_mapsToConversationNotFound() {
        when(aiClient.invoke(eq(AGENT_KEY), any(), any())).thenThrow(upstream("AI_UPSTREAM_404"));

        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.explain(explainBody()));

        assertEquals("AI_CONVERSATION_NOT_FOUND", ex.getErrorCode());
        assertEquals(404, ex.getHttpStatus());
    }

    @Test
    @DisplayName("上游 403 → AI_CONVERSATION_FORBIDDEN(403)")
    void upstream403_mapsToForbidden() {
        when(aiClient.invoke(eq(AGENT_KEY), any(), any())).thenThrow(upstream("AI_UPSTREAM_403"));

        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.followup(Map.of("char", "好", "question", "q", "conversationId", "conv-1")));

        assertEquals("AI_CONVERSATION_FORBIDDEN", ex.getErrorCode());
        assertEquals(403, ex.getHttpStatus());
    }

    @Test
    @DisplayName("上游 409 → AI_CONVERSATION_BUSY(409)")
    void upstream409_mapsToBusy() {
        when(aiClient.invoke(eq(AGENT_KEY), any(), any())).thenThrow(upstream("AI_UPSTREAM_409"));

        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.followup(Map.of("char", "好", "question", "q", "conversationId", "conv-1")));

        assertEquals("AI_CONVERSATION_BUSY", ex.getErrorCode());
        assertEquals(409, ex.getHttpStatus());
        assertEquals("上一轮还在处理中，请稍候", ex.getMessage());
    }

    @Test
    @DisplayName("上游 429 → AI_QUOTA_EXCEEDED(429)")
    void upstream429_mapsToQuotaExceeded() {
        when(aiClient.invoke(eq(AGENT_KEY), any(), any())).thenThrow(upstream("AI_UPSTREAM_429"));

        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.explain(explainBody()));

        assertEquals("AI_QUOTA_EXCEEDED", ex.getErrorCode());
        assertEquals(429, ex.getHttpStatus());
        assertEquals("AI 额度已用完", ex.getMessage());
    }

    @Test
    @DisplayName("上游 5xx → AI_SERVICE_UNAVAILABLE(503)")
    void upstream5xx_mapsToServiceUnavailable() {
        when(aiClient.invoke(eq(AGENT_KEY), any(), any())).thenThrow(upstream("AI_UPSTREAM_5XX"));

        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.explain(explainBody()));

        assertEquals("AI_SERVICE_UNAVAILABLE", ex.getErrorCode());
        assertEquals(503, ex.getHttpStatus());
    }

    @Test
    @DisplayName("未列举的上游错误码原样抛出（不做语义伪装）")
    void unknownUpstreamCode_passesThrough() {
        BusinessException original = upstream("AI_UPSTREAM_OTHER");
        when(aiClient.invoke(eq(AGENT_KEY), any(), any())).thenThrow(original);

        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.explain(explainBody()));

        assertSame(original, ex);
    }

    // ── 会话字段附加 ────────────────────────────────────────

    @Test
    @DisplayName("historyTruncated=true 时才附 historyTruncated")
    void historyTruncated_onlyWhenTrue() {
        when(aiClient.invoke(eq(AGENT_KEY), any(), any())).thenReturn(
                MiaoAiInvokeResponse.builder()
                        .output(Map.of("explanation", "被裁剪了"))
                        .conversationId("conv-1")
                        .turn(5)
                        .historyTruncated(true)
                        .build());

        Map<String, Object> truncated = service.followup(Map.of(
                "char", "好", "question", "q", "conversationId", "conv-1"));

        assertEquals(Boolean.TRUE, truncated.get("historyTruncated"));
        assertEquals(5, truncated.get("turn"));

        when(aiClient.invoke(eq(AGENT_KEY), any(), any())).thenReturn(
                MiaoAiInvokeResponse.builder()
                        .output(Map.of("explanation", "没裁剪"))
                        .conversationId("conv-1")
                        .turn(6)
                        .historyTruncated(false)
                        .build());

        Map<String, Object> notTruncated = service.followup(Map.of(
                "char", "好", "question", "q", "conversationId", "conv-1"));

        assertFalse(notTruncated.containsKey("historyTruncated"));
    }

    @Test
    @DisplayName("agent 输出的既有字段原样保留，附加字段不覆盖 agent 字段")
    void outputFieldsPreserved() {
        Map<String, Object> agentOutput = new HashMap<>();
        agentOutput.put("explanation", "解释");
        agentOutput.put("positions", List.of(Map.of("key", "v", "radical", "女")));
        agentOutput.put("suggestions", List.of("记忆口诀"));
        when(aiClient.invoke(eq(AGENT_KEY), any(), any()))
                .thenReturn(response(agentOutput, "conv-1", 1));

        Map<String, Object> result = service.explain(explainBody());

        assertEquals("解释", result.get("explanation"));
        assertEquals(1, ((List<?>) result.get("positions")).size());
        assertEquals(1, ((List<?>) result.get("suggestions")).size());
        assertTrue(result.containsKey("conversationId"));
    }
}
