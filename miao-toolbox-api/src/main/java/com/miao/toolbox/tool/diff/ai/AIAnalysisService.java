package com.miao.toolbox.tool.diff.ai;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.miao.toolbox.common.exception.BusinessException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.*;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

import java.time.Duration;
import java.util.HashMap;
import java.util.Map;

/**
 * AI 分析服务 — 封装对 miao-ai invoke API 的调用。
 *
 * 支持两种调用方式：
 * 1. 同步调用 invoke — 用于选中解释（耗时较短）
 * 2. SSE 流式调用 invoke/stream — 用于全局摘要（耗时较长，逐 token 输出）
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AIAnalysisService {

    private final MiaoAiProperties miaoAiProperties;
    private final ObjectMapper objectMapper;

    private RestTemplate restTemplate;

    /**
     * 同步调用 miao-ai Agent（选中解释场景）。
     *
     * @param request AI 分析请求
     * @return AI 分析响应
     */
    public AIAnalysisResponse analyze(AIAnalysisRequest request) {
        if (!miaoAiProperties.isEnabled()) {
            throw new BusinessException("AI_SERVICE_DISABLED", "AI 分析功能未启用", 503);
        }

        String url = buildInvokeUrl();
        HttpHeaders headers = buildHeaders();
        Map<String, Object> body = buildInvokeBody(request);

        AIAnalysisResponse result = executeWithRetry(url, headers, body, "invoke");
        log.info("AI analysis completed: mode={}, model={}, traceId={}",
                request.getMode(), result.getModel(), result.getTraceId());
        return result;
    }

    /**
     * 构建 SSE 流式调用 URL（全局摘要场景）。
     * 前端通过此 URL 直接消费 SSE 流，后端做代理转发。
     *
     * @return SSE 流式 invoke URL
     */
    public String getStreamUrl() {
        if (!miaoAiProperties.isEnabled()) {
            throw new BusinessException("AI_SERVICE_DISABLED", "AI 分析功能未启用", 503);
        }
        return String.format("%s/api/v1/agents/%s/invoke/stream",
                miaoAiProperties.getBaseUrl(), miaoAiProperties.getAgentName());
    }

    /**
     * 获取 miao-ai 请求头（用于 SSE 代理转发）。
     */
    public HttpHeaders getStreamHeaders() {
        return buildHeaders();
    }

    /**
     * 构建 miao-ai invoke 请求体。
     */
    public Map<String, Object> buildInvokeBody(AIAnalysisRequest request) {
        Map<String, Object> input = new HashMap<>();
        input.put("mode", request.getMode());

        if (request.getLanguage() != null) {
            input.put("language", request.getLanguage());
        }

        if ("summary".equals(request.getMode())) {
            if (request.getStatistics() != null) {
                Map<String, Object> stats = new HashMap<>();
                stats.put("additions", request.getStatistics().getAdditions());
                stats.put("deletions", request.getStatistics().getDeletions());
                stats.put("modifications", request.getStatistics().getModifications());
                input.put("statistics", stats);
            }
            if (request.getHunks() != null) {
                input.put("hunks", request.getHunks());
            }
        } else if ("explain_selection".equals(request.getMode())) {
            if (request.getSelectedHunks() != null) {
                input.put("selected_hunks", request.getSelectedHunks());
            }
            if (request.getContextBefore() != null) {
                input.put("context_before", request.getContextBefore());
            }
            if (request.getContextAfter() != null) {
                input.put("context_after", request.getContextAfter());
            }
        }

        Map<String, Object> body = new HashMap<>();
        body.put("input", input);
        body.put("metadata", Map.of());
        return body;
    }

    // ========== 私有方法 ==========

    private String buildInvokeUrl() {
        return String.format("%s/api/v1/agents/%s/invoke",
                miaoAiProperties.getBaseUrl(), miaoAiProperties.getAgentName());
    }

    private HttpHeaders buildHeaders() {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.setBearerAuth(miaoAiProperties.getApiKey());
        return headers;
    }

    private AIAnalysisResponse executeWithRetry(String url, HttpHeaders headers,
                                                 Map<String, Object> body, String operation) {
        RestTemplate rt = getRestTemplate();
        int maxAttempts = miaoAiProperties.getRetryCount() + 1;

        for (int attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                HttpEntity<Map<String, Object>> entity = new HttpEntity<>(body, headers);
                ResponseEntity<String> response = rt.exchange(url, HttpMethod.POST, entity, String.class);

                if (response.getStatusCode().is2xxSuccessful() && response.getBody() != null) {
                    return parseInvokeResponse(response.getBody());
                }
                throw new BusinessException("AI_ANALYSIS_FAILED",
                        "miao-ai 返回非 2xx: " + response.getStatusCode(), 502);

            } catch (BusinessException e) {
                throw e; // 业务异常直接抛出
            } catch (RestClientException e) {
                log.warn("AI analysis attempt {}/{} failed: {}", attempt, maxAttempts, e.getMessage());
                if (attempt == maxAttempts) {
                    throw new BusinessException("AI_SERVICE_UNAVAILABLE",
                            "miao-ai 服务不可用，请稍后重试", 503);
                }
                try {
                    Thread.sleep(miaoAiProperties.getRetryInterval());
                } catch (InterruptedException ie) {
                    Thread.currentThread().interrupt();
                    throw new BusinessException("AI_ANALYSIS_FAILED", "请求被中断", 503);
                }
            }
        }
        throw new BusinessException("AI_ANALYSIS_FAILED", "重试次数耗尽", 503);
    }

    private AIAnalysisResponse parseInvokeResponse(String responseBody) {
        try {
            // miao-ai invoke 响应格式: {"output": {...}, "trace_id": "..."}
            Map<String, Object> responseMap = objectMapper.readValue(
                    responseBody, new TypeReference<>() {});

            @SuppressWarnings("unchecked")
            Map<String, Object> output = (Map<String, Object>) responseMap.get("output");
            String traceId = (String) responseMap.get("trace_id");

            if (output == null) {
                throw new BusinessException("AI_ANALYSIS_FAILED", "miao-ai 返回空 output", 502);
            }

            return AIAnalysisResponse.builder()
                    .mode((String) output.get("mode"))
                    .analysis(output.get("analysis"))
                    .model((String) output.get("model"))
                    .traceId(traceId)
                    .build();

        } catch (BusinessException e) {
            throw e;
        } catch (Exception e) {
            log.error("Failed to parse miao-ai response: {}", e.getMessage());
            throw new BusinessException("AI_ANALYSIS_FAILED", "解析 miao-ai 响应失败", 502);
        }
    }

    private RestTemplate getRestTemplate() {
        if (restTemplate == null) {
            SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
            factory.setConnectTimeout(miaoAiProperties.getConnectTimeout());
            factory.setReadTimeout(miaoAiProperties.getReadTimeout());
            restTemplate = new RestTemplate(factory);
        }
        return restTemplate;
    }
}
