package com.miao.toolbox.observability;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.miao.toolbox.common.exception.BusinessException;
import com.miao.toolbox.observability.dto.MiaoAiInvokeRequest;
import com.miao.toolbox.observability.dto.MiaoAiInvokeResponse;
import com.miao.toolbox.tool.diff.ai.MiaoAiProperties;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.*;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import java.util.HashMap;
import java.util.Map;

/**
 * miao-ai 统一调用客户端。
 *
 * 封装所有对 miao-ai 的 HTTP 调用，并自动通过 AiInvocationRecorder 记录调用日志。
 * 所有业务代码必须通过此类调 miao-ai，禁止直接使用 RestTemplate 调用。
 *
 * 支持两种调用方式：
 * 1. 同步调用 invoke — 用于选中解释等耗时较短场景
 * 2. SSE 流式调用 — 通过 getStreamUrl / getStreamHeaders / buildStreamBody 获取连接参数，
 *    由 DiffAIController 做代理转发，在 SSE done 事件触发时调用 recordStreamSuccess/recordStreamFailure
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class MiaoAiClient {

    private final MiaoAiProperties miaoAiProperties;
    private final AiInvocationRecorder recorder;
    private final ObjectMapper objectMapper;

    private RestTemplate restTemplate;

    /**
     * 同步调用 miao-ai Agent（自动记录调用日志）。
     *
     * @param agentName    Agent 名称（如 diff-explainer）
     * @param input        业务输入参数
     * @param metadata     元数据（可为空 Map）
     * @return miao-ai 响应
     */
    public MiaoAiInvokeResponse invoke(String agentName, Map<String, Object> input,
                                       Map<String, Object> metadata) {
        if (!miaoAiProperties.isEnabled()) {
            throw new BusinessException("AI_SERVICE_DISABLED", "AI 分析功能未启用", 503);
        }

        Long userId = getCurrentUserId();
        String clientIp = getClientIp();
        String userAgent = getUserAgent();
        String requestSummary = safeToJson(input);

        // 记录调用开始
        AiInvocationRecorder.InvocationHandle handle =
                recorder.recordStart(userId, agentName, requestSummary, clientIp, userAgent);

        try {
            String url = buildInvokeUrl(agentName);
            HttpHeaders headers = buildHeaders();
            Map<String, Object> body = new HashMap<>();
            body.put("input", input);
            body.put("metadata", metadata != null ? metadata : Map.of());

            MiaoAiInvokeResponse result = executeWithRetry(url, headers, body, agentName);

            // 记录成功
            handle.recordSuccess(
                    result.getModel(),
                    result.getMode(),
                    result.getTraceId(),
                    result.getPromptTokens(),
                    result.getCompletionTokens(),
                    result.getTotalTokens(),
                    truncate(String.valueOf(result.getOutput()), 512)
            );

            log.info("MiaoAiClient invoke success: agent={}, model={}, traceId={}, latencyMs={}",
                    agentName, result.getModel(), result.getTraceId(), result.getLatencyMs());
            return result;

        } catch (BusinessException e) {
            // 记录失败
            handle.recordFailure(e.getErrorCode(), truncate(e.getMessage(), 512));
            throw e;
        } catch (Exception e) {
            handle.recordFailure("AI_INVOKE_ERROR", truncate(e.getMessage(), 512));
            throw new BusinessException("AI_SERVICE_UNAVAILABLE", "miao-ai 服务不可用", 503);
        }
    }

    /**
     * 获取 SSE 流式调用 URL。
     */
    public String getStreamUrl(String agentName) {
        if (!miaoAiProperties.isEnabled()) {
            throw new BusinessException("AI_SERVICE_DISABLED", "AI 分析功能未启用", 503);
        }
        return String.format("%s/api/v1/agents/%s/invoke/stream",
                miaoAiProperties.getBaseUrl(), agentName);
    }

    /**
     * 获取 miao-ai 认证请求头。
     */
    public HttpHeaders getStreamHeaders() {
        return buildHeaders();
    }

    /**
     * 构建 SSE 流式请求体。
     */
    public Map<String, Object> buildStreamBody(Map<String, Object> input,
                                                Map<String, Object> metadata) {
        Map<String, Object> body = new HashMap<>();
        body.put("input", input);
        body.put("metadata", metadata != null ? metadata : Map.of());
        return body;
    }

    /**
     * SSE 流调用成功后，由 DiffAIController 在 done 事件触发时调用。
     */
    public void recordStreamSuccess(AiInvocationRecorder.InvocationHandle handle,
                                     String model, String mode, String traceId,
                                     Integer promptTokens, Integer completionTokens,
                                     Integer totalTokens, String responseSummary) {
        handle.recordSuccess(model, mode, traceId,
                promptTokens, completionTokens, totalTokens, responseSummary);
    }

    /**
     * SSE 流调用失败后，由 DiffAIController 调用。
     */
    public void recordStreamFailure(AiInvocationRecorder.InvocationHandle handle,
                                     String errorCode, String responseSummary) {
        handle.recordFailure(errorCode, responseSummary);
    }

    /**
     * 为 SSE 流式调用创建 InvocationHandle。
     * 在 DiffAIController.doProxyStream 开始时调用，在 done/error 事件时关闭。
     */
    public AiInvocationRecorder.InvocationHandle recordStreamStart(String agentName,
                                                                     String requestSummary) {
        Long userId = getCurrentUserId();
        String clientIp = getClientIp();
        String userAgent = getUserAgent();
        return recorder.recordStart(userId, agentName, requestSummary, clientIp, userAgent);
    }

    // ========== 私有方法 ==========

    private String buildInvokeUrl(String agentName) {
        return String.format("%s/api/v1/agents/%s/invoke",
                miaoAiProperties.getBaseUrl(), agentName);
    }

    private HttpHeaders buildHeaders() {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.setBearerAuth(miaoAiProperties.getApiKey());
        return headers;
    }

    private MiaoAiInvokeResponse executeWithRetry(String url, HttpHeaders headers,
                                                   Map<String, Object> body, String agentName) {
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
                throw e;
            } catch (RestClientException e) {
                log.warn("MiaoAiClient attempt {}/{} failed for agent {}: {}",
                        attempt, maxAttempts, agentName, e.getMessage());
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

    private MiaoAiInvokeResponse parseInvokeResponse(String responseBody) {
        try {
            Map<String, Object> responseMap = objectMapper.readValue(
                    responseBody, new TypeReference<>() {});

            @SuppressWarnings("unchecked")
            Map<String, Object> output = (Map<String, Object>) responseMap.get("output");
            String traceId = (String) responseMap.get("trace_id");
            Integer latencyMs = responseMap.get("latency_ms") instanceof Number n
                    ? n.intValue() : null;

            if (output == null) {
                throw new BusinessException("AI_ANALYSIS_FAILED", "miao-ai 返回空 output", 502);
            }

            // 解析 usage（可能缺失）
            Integer promptTokens = null;
            Integer completionTokens = null;
            Integer totalTokens = null;
            @SuppressWarnings("unchecked")
            Map<String, Object> usage = (Map<String, Object>) output.get("usage");
            if (usage != null) {
                promptTokens = usage.get("prompt_tokens") instanceof Number n ? n.intValue() : null;
                completionTokens = usage.get("completion_tokens") instanceof Number n ? n.intValue() : null;
                totalTokens = usage.get("total_tokens") instanceof Number n ? n.intValue() : null;
            }

            return MiaoAiInvokeResponse.builder()
                    .mode((String) output.get("mode"))
                    .output(output.get("analysis"))
                    .model((String) output.get("model"))
                    .traceId(traceId)
                    .latencyMs(latencyMs)
                    .promptTokens(promptTokens)
                    .completionTokens(completionTokens)
                    .totalTokens(totalTokens)
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

    private Long getCurrentUserId() {
        try {
            var attrs = (ServletRequestAttributes) RequestContextHolder.getRequestAttributes();
            if (attrs == null) return null;
            HttpServletRequest request = attrs.getRequest();
            Object userIdAttr = request.getAttribute("userId");
            return userIdAttr instanceof Long l ? l : null;
        } catch (Exception e) {
            return null;
        }
    }

    private String getClientIp() {
        try {
            var attrs = (ServletRequestAttributes) RequestContextHolder.getRequestAttributes();
            if (attrs == null) return null;
            HttpServletRequest request = attrs.getRequest();
            String ip = request.getHeader("X-Forwarded-For");
            if (ip == null || ip.isBlank()) {
                ip = request.getRemoteAddr();
            } else {
                ip = ip.split(",")[0].trim();
            }
            return ip;
        } catch (Exception e) {
            return null;
        }
    }

    private String getUserAgent() {
        try {
            var attrs = (ServletRequestAttributes) RequestContextHolder.getRequestAttributes();
            if (attrs == null) return null;
            HttpServletRequest request = attrs.getRequest();
            String ua = request.getHeader("User-Agent");
            return ua != null && ua.length() > 255 ? ua.substring(0, 255) : ua;
        } catch (Exception e) {
            return null;
        }
    }

    private String truncate(String text, int maxLength) {
        if (text == null) return null;
        return text.length() > maxLength ? text.substring(0, maxLength - 3) + "..." : text;
    }

    private String safeToJson(Object obj) {
        try {
            return truncate(objectMapper.writeValueAsString(obj), 512);
        } catch (Exception e) {
            return truncate(String.valueOf(obj), 512);
        }
    }
}
