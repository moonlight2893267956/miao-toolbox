package com.miao.toolbox.observability;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.miao.toolbox.common.exception.BusinessException;
import com.miao.toolbox.observability.dto.MiaoAiInvokeResponse;
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
 * <p>封装所有对 miao-ai 的 HTTP 调用，并自动通过 AiInvocationRecorder 记录调用日志。
 * 所有配置（base-url、api-key、超时、重试）均按 Agent 独立管理。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class MiaoAiClient {

    private final MiaoAiProperties miaoAiProperties;
    private final AiInvocationRecorder recorder;
    private final ObjectMapper objectMapper;

    /**
     * 同步调用 miao-ai Agent（自动记录调用日志）。
     *
     * @param agentKey  Agent 标识（如 diff-explainer、json-repairer）
     * @param input     业务输入参数
     * @param metadata  元数据（可为空 Map）
     * @return miao-ai 响应
     */
    public MiaoAiInvokeResponse invoke(String agentKey, Map<String, Object> input,
                                       Map<String, Object> metadata) {
        MiaoAiProperties.AgentConfig agent = miaoAiProperties.getAgent(agentKey);
        if (!agent.isEnabled()) {
            throw new BusinessException("AI_AGENT_DISABLED",
                    "Agent '" + agentKey + "' 未启用", 503);
        }

        String effectiveAgentName = miaoAiProperties.getEffectiveAgentName(agentKey);
        String effectiveApiKey = agent.getApiKey();
        Long userId = getCurrentUserId();
        String clientIp = getClientIp();
        String userAgent = getUserAgent();
        String requestSummary = safeToJson(input);

        // 输入大小校验（所有 AI 端点统一）
        validateInputSize(input);

        AiInvocationRecorder.InvocationHandle handle =
                recorder.recordStart(userId, effectiveAgentName, requestSummary, clientIp, userAgent);

        try {
            RestTemplate rt = buildRestTemplate(agent);
            String url = buildInvokeUrl(agent.getBaseUrl(), effectiveAgentName);
            HttpHeaders headers = buildHeaders(effectiveApiKey);
            Map<String, Object> body = new HashMap<>();
            body.put("input", input);
            body.put("metadata", metadata != null ? metadata : Map.of());

            MiaoAiInvokeResponse result = executeWithRetry(rt, url, headers, body,
                    effectiveAgentName, agent.getRetryCount(), agent.getRetryInterval());

            handle.recordSuccess(
                    result.getModel(), result.getMode(), result.getTraceId(),
                    result.getPromptTokens(), result.getCompletionTokens(),
                    result.getTotalTokens(),
                    truncate(String.valueOf(result.getOutput()), 512));

            log.info("MiaoAiClient invoke success: agent={}, model={}, traceId={}, latencyMs={}",
                    effectiveAgentName, result.getModel(), result.getTraceId(), result.getLatencyMs());
            return result;

        } catch (BusinessException e) {
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
    public String getStreamUrl(String agentKey) {
        MiaoAiProperties.AgentConfig agent = miaoAiProperties.getAgent(agentKey);
        String effectiveAgentName = miaoAiProperties.getEffectiveAgentName(agentKey);
        return String.format("%s/api/v1/agents/%s/invoke/stream",
                agent.getBaseUrl(), effectiveAgentName);
    }

    /**
     * 获取指定 Agent 的认证请求头。
     */
    public HttpHeaders getStreamHeaders(String agentKey) {
        MiaoAiProperties.AgentConfig agent = miaoAiProperties.getAgent(agentKey);
        return buildHeaders(agent.getApiKey());
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

    /** SSE 流调用成功后，由 DiffAIController 调用。 */
    public void recordStreamSuccess(AiInvocationRecorder.InvocationHandle handle,
                                     String model, String mode, String traceId,
                                     Integer promptTokens, Integer completionTokens,
                                     Integer totalTokens, String responseSummary) {
        handle.recordSuccess(model, mode, traceId,
                promptTokens, completionTokens, totalTokens, responseSummary);
    }

    /** SSE 流调用失败后，由 DiffAIController 调用。 */
    public void recordStreamFailure(AiInvocationRecorder.InvocationHandle handle,
                                     String errorCode, String responseSummary) {
        handle.recordFailure(errorCode, responseSummary);
    }

    /** 为 SSE 流式调用创建 InvocationHandle。 */
    public AiInvocationRecorder.InvocationHandle recordStreamStart(String agentName,
                                                                     String requestSummary) {
        Long userId = getCurrentUserId();
        String clientIp = getClientIp();
        String userAgent = getUserAgent();
        return recorder.recordStart(userId, agentName, requestSummary, clientIp, userAgent);
    }

    // ========== 私有方法 ==========

    private RestTemplate buildRestTemplate(MiaoAiProperties.AgentConfig agent) {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(agent.getConnectTimeout());
        factory.setReadTimeout(agent.getReadTimeout());
        return new RestTemplate(factory);
    }

    private String buildInvokeUrl(String baseUrl, String agentName) {
        return String.format("%s/api/v1/agents/%s/invoke", baseUrl, agentName);
    }

    private HttpHeaders buildHeaders(String apiKey) {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.setBearerAuth(apiKey);
        return headers;
    }

    private MiaoAiInvokeResponse executeWithRetry(RestTemplate rt, String url,
                                                   HttpHeaders headers,
                                                   Map<String, Object> body,
                                                   String agentName,
                                                   int retryCount, long retryInterval) {
        int maxAttempts = retryCount + 1;

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
                    Thread.sleep(retryInterval);
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
                    .output(output)
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

    private Long getCurrentUserId() {
        try {
            var auth = org.springframework.security.core.context.SecurityContextHolder
                    .getContext().getAuthentication();
            if (auth != null && auth.getPrincipal() != null) {
                if (auth.getPrincipal() instanceof com.miao.toolbox.auth.entity.User u) {
                    return u.getId();
                }
            }
            var attrs = (ServletRequestAttributes) RequestContextHolder.getRequestAttributes();
            if (attrs != null) {
                Object userIdAttr = attrs.getRequest().getAttribute("userId");
                if (userIdAttr instanceof Long l) return l;
            }
            return null;
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
            if (ip == null || ip.isBlank()) ip = request.getRemoteAddr();
            else ip = ip.split(",")[0].trim();
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

    /**
     * 校验 AI 输入大小，超过 {@link MiaoAiProperties#getMaxInputBytes()} 则抛异常。
     */
    private void validateInputSize(Map<String, Object> input) {
        long maxBytes = miaoAiProperties.getMaxInputBytes();
        try {
            byte[] bytes = objectMapper.writeValueAsBytes(input);
            if (bytes.length > maxBytes) {
                throw new BusinessException("AI_INPUT_TOO_LARGE",
                        "输入内容超过最大限制（" + (maxBytes / 1024) + "KB）", 400);
            }
        } catch (BusinessException e) {
            throw e;
        } catch (Exception e) {
            // 序列化失败说明输入包含不可序列化对象，直接拒绝
            throw new BusinessException("AI_INPUT_INVALID",
                    "输入内容无法序列化: " + e.getMessage(), 400);
        }
    }
}
