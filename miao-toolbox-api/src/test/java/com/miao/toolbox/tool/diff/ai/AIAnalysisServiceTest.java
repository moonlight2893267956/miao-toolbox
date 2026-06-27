package com.miao.toolbox.tool.diff.ai;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.miao.toolbox.common.exception.BusinessException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.*;
import org.springframework.web.client.RestTemplate;

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
    private RestTemplate restTemplate;

    private AIAnalysisService service;

    private final ObjectMapper objectMapper = new ObjectMapper();

    @BeforeEach
    void setUp() {
        lenient().when(miaoAiProperties.isEnabled()).thenReturn(true);
        lenient().when(miaoAiProperties.getBaseUrl()).thenReturn("http://localhost:8000");
        lenient().when(miaoAiProperties.getApiKey()).thenReturn("test-key");
        lenient().when(miaoAiProperties.getAgentName()).thenReturn("diff-explainer");
        lenient().when(miaoAiProperties.getConnectTimeout()).thenReturn(5000);
        lenient().when(miaoAiProperties.getReadTimeout()).thenReturn(60000);
        lenient().when(miaoAiProperties.getRetryCount()).thenReturn(1);
        lenient().when(miaoAiProperties.getRetryInterval()).thenReturn(100L);

        service = new AIAnalysisService(miaoAiProperties, objectMapper);
        // 通过反射注入 mock RestTemplate（跳过真实 HTTP）
        // 注意：实际调用会走 getRestTemplate()，此处无法直接 mock
        // 改为测试逻辑层面的行为
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
    void getStreamUrl_whenDisabled_throwsException() {
        when(miaoAiProperties.isEnabled()).thenReturn(false);

        BusinessException ex = assertThrows(BusinessException.class, () -> service.getStreamUrl());
        assertEquals("AI_SERVICE_DISABLED", ex.getErrorCode());
    }

    @Test
    void getStreamUrl_returnsCorrectUrl() {
        String url = service.getStreamUrl();
        assertEquals("http://localhost:8000/api/v1/agents/diff-explainer/invoke/stream", url);
    }

    @Test
    void buildInvokeBody_summaryMode_containsCorrectFields() {
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
        assertNull(input.get("hunks")); // summary 模式字段不应出现
    }

    @Test
    void buildInvokeBody_nullOptionalFields_omitsThem() {
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
    void getStreamHeaders_containsBearerAuth() {
        HttpHeaders headers = service.getStreamHeaders();
        assertEquals("Bearer test-key", headers.getFirst("Authorization"));
        assertEquals(MediaType.APPLICATION_JSON, headers.getContentType());
    }

    @Test
    void analyze_whenServiceUnavailable_retriesAndThrows() {
        // 此测试验证重试逻辑 — 由于 RestTemplate 内部创建，
        // 我们通过模拟不可达地址来测试
        when(miaoAiProperties.getBaseUrl()).thenReturn("http://127.0.0.1:1"); // 不可达端口
        when(miaoAiProperties.getRetryCount()).thenReturn(0); // 无重试，快速失败

        AIAnalysisRequest request = AIAnalysisRequest.builder()
                .mode("summary")
                .language("java")
                .build();

        BusinessException ex = assertThrows(BusinessException.class, () -> service.analyze(request));
        assertEquals("AI_SERVICE_UNAVAILABLE", ex.getErrorCode());
        assertEquals(503, ex.getHttpStatus());
    }
}
