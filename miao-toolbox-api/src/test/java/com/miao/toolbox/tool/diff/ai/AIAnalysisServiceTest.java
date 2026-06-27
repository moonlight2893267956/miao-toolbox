package com.miao.toolbox.tool.diff.ai;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.miao.toolbox.common.exception.BusinessException;
import com.miao.toolbox.observability.MiaoAiClient;
import com.miao.toolbox.observability.dto.MiaoAiInvokeResponse;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class AIAnalysisServiceTest {

    @Mock
    private MiaoAiProperties miaoAiProperties;

    @Mock
    private MiaoAiClient miaoAiClient;

    private AIAnalysisService service;

    private final ObjectMapper objectMapper = new ObjectMapper();

    @BeforeEach
    void setUp() {
        lenient().when(miaoAiProperties.isEnabled()).thenReturn(true);
        lenient().when(miaoAiProperties.getBaseUrl()).thenReturn("http://localhost:8000");
        lenient().when(miaoAiProperties.getApiKey()).thenReturn("test-key");
        lenient().when(miaoAiProperties.getAgentName()).thenReturn("diff-explainer");

        service = new AIAnalysisService(miaoAiProperties, miaoAiClient, objectMapper);
    }

    @Test
    void analyze_whenDisabled_throwsException() {
        when(miaoAiProperties.isEnabled()).thenReturn(false);

        AIAnalysisRequest request = AIAnalysisRequest.builder()
                .mode("summary")
                .build();

        BusinessException ex = assertThrows(BusinessException.class, () -> service.analyze(request));
        assertEquals("AI_SERVICE_DISABLED", ex.getErrorCode());
        assertEquals(503, ex.getHttpStatus());
    }

    @Test
    void analyze_whenEnabled_callsMiaoAiClient() {
        MiaoAiInvokeResponse mockResponse = MiaoAiInvokeResponse.builder()
                .mode("summary")
                .output(Map.of("result", "test"))
                .model("claude-sonnet-4-5")
                .traceId("trace-123")
                .build();

        when(miaoAiClient.invoke(eq("diff-explainer"), anyMap(), anyMap()))
                .thenReturn(mockResponse);

        AIAnalysisRequest request = AIAnalysisRequest.builder()
                .mode("summary")
                .language("java")
                .build();

        AIAnalysisResponse response = service.analyze(request);

        assertEquals("summary", response.getMode());
        assertEquals("claude-sonnet-4-5", response.getModel());
        assertEquals("trace-123", response.getTraceId());
        verify(miaoAiClient).invoke(eq("diff-explainer"), anyMap(), anyMap());
    }

    @Test
    void getStreamUrl_whenDisabled_throwsException() {
        when(miaoAiClient.getStreamUrl(anyString()))
                .thenThrow(new BusinessException("AI_SERVICE_DISABLED", "AI 分析功能未启用", 503));

        BusinessException ex = assertThrows(BusinessException.class, () -> service.getStreamUrl());
        assertEquals("AI_SERVICE_DISABLED", ex.getErrorCode());
    }

    @Test
    void getStreamUrl_delegatesToMiaoAiClient() {
        when(miaoAiClient.getStreamUrl("diff-explainer"))
                .thenReturn("http://localhost:8000/api/v1/agents/diff-explainer/invoke/stream");

        String url = service.getStreamUrl();
        assertEquals("http://localhost:8000/api/v1/agents/diff-explainer/invoke/stream", url);
    }

    @Test
    void buildInvokeBody_summaryMode_containsCorrectFields() {
        // buildInvokeBody 内部调用 buildInput + miaoAiClient.buildStreamBody
        // 由于 buildStreamBody 直接委托，需要 mock
        when(miaoAiClient.buildStreamBody(anyMap(), anyMap())).thenAnswer(invocation -> {
            Map<String, Object> input = invocation.getArgument(0);
            Map<String, Object> body = new HashMap<>();
            body.put("input", input);
            body.put("metadata", invocation.getArgument(1));
            return body;
        });

        AIAnalysisRequest request = AIAnalysisRequest.builder()
                .mode("summary")
                .language("java")
                .statistics(AIAnalysisRequest.DiffStatisticsDto.builder()
                        .additions(3).deletions(1).modifications(0).build())
                .hunks(List.of(Map.of("type", "modified")))
                .build();

        Map<String, Object> body = service.buildInvokeBody(request);

        @SuppressWarnings("unchecked")
        Map<String, Object> input = (Map<String, Object>) body.get("input");
        assertEquals("summary", input.get("mode"));
        assertEquals("java", input.get("language"));
        assertNotNull(input.get("statistics"));
        assertNotNull(input.get("hunks"));
    }

    @Test
    void buildInvokeBody_explainSelectionMode_containsCorrectFields() {
        when(miaoAiClient.buildStreamBody(anyMap(), anyMap())).thenAnswer(invocation -> {
            Map<String, Object> input = invocation.getArgument(0);
            Map<String, Object> body = new HashMap<>();
            body.put("input", input);
            body.put("metadata", invocation.getArgument(1));
            return body;
        });

        AIAnalysisRequest request = AIAnalysisRequest.builder()
                .mode("explain_selection")
                .language("java")
                .selectedHunks(List.of(Map.of("type", "modified")))
                .contextBefore("public class Foo {")
                .contextAfter("  public void bar() {")
                .build();

        Map<String, Object> body = service.buildInvokeBody(request);

        @SuppressWarnings("unchecked")
        Map<String, Object> input = (Map<String, Object>) body.get("input");
        assertEquals("explain_selection", input.get("mode"));
        assertEquals("java", input.get("language"));
        assertNotNull(input.get("selected_hunks"));
        assertEquals("public class Foo {", input.get("context_before"));
        assertEquals("  public void bar() {", input.get("context_after"));
    }

    @Test
    void buildInvokeBody_nullOptionalFields_omitsThem() {
        when(miaoAiClient.buildStreamBody(anyMap(), anyMap())).thenAnswer(invocation -> {
            Map<String, Object> input = invocation.getArgument(0);
            Map<String, Object> body = new HashMap<>();
            body.put("input", input);
            body.put("metadata", invocation.getArgument(1));
            return body;
        });

        AIAnalysisRequest request = AIAnalysisRequest.builder()
                .mode("summary")
                .build();

        Map<String, Object> body = service.buildInvokeBody(request);

        @SuppressWarnings("unchecked")
        Map<String, Object> input = (Map<String, Object>) body.get("input");
        assertEquals("summary", input.get("mode"));
        assertNull(input.get("language"));
        assertNull(input.get("statistics"));
        assertNull(input.get("hunks"));
    }

    @Test
    void getStreamHeaders_delegatesToMiaoAiClient() {
        HttpHeaders expectedHeaders = new HttpHeaders();
        expectedHeaders.setContentType(MediaType.APPLICATION_JSON);
        expectedHeaders.setBearerAuth("test-key");
        when(miaoAiClient.getStreamHeaders()).thenReturn(expectedHeaders);

        HttpHeaders headers = service.getStreamHeaders();
        assertEquals("Bearer test-key", headers.getFirst("Authorization"));
        assertEquals(MediaType.APPLICATION_JSON, headers.getContentType());
    }

    @Test
    void analyze_whenMiaoAiClientThrows_propagatesException() {
        when(miaoAiClient.invoke(eq("diff-explainer"), anyMap(), anyMap()))
                .thenThrow(new BusinessException("AI_SERVICE_UNAVAILABLE", "miao-ai 不可用", 503));

        AIAnalysisRequest request = AIAnalysisRequest.builder()
                .mode("summary")
                .language("java")
                .build();

        BusinessException ex = assertThrows(BusinessException.class, () -> service.analyze(request));
        assertEquals("AI_SERVICE_UNAVAILABLE", ex.getErrorCode());
        assertEquals(503, ex.getHttpStatus());
    }
}
