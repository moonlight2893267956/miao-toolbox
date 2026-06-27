package com.miao.toolbox.observability;

import com.miao.toolbox.admin.util.SanitizeUtil;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * AI 调用记录器 — 统一拦截所有 miao-ai 调用并持久化到 ai_invocations 表。
 *
 * 使用方式：
 * <pre>
 *   InvocationHandle handle = recorder.recordStart(userId, agentName, requestSummary, clientIp, userAgent);
 *   try {
 *       // ... 调用 miao-ai ...
 *       handle.recordSuccess(model, mode, traceId, promptTokens, completionTokens, totalTokens, responseSummary);
 *   } catch (Exception e) {
 *       handle.recordFailure("ERROR_CODE", e.getMessage());
 *   }
 * </pre>
 *
 * 关键设计决策：
 *   - 异步持久化（@Async），不阻塞业务请求
 *   - 写入失败只落错误日志，不抛异常（兜底策略）
 *   - request_id = UUID v4，唯一键兜底防重复
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class AiInvocationRecorder {

    private final AiInvocationRepository repository;

    /**
     * 记录调用开始，返回 InvocationHandle 供后续填写结果。
     */
    public InvocationHandle recordStart(Long userId, String agentName,
                                        String requestSummary, String clientIp, String userAgent) {
        return new InvocationHandle(this, userId, agentName,
                sanitize(requestSummary, 512), clientIp, userAgent);
    }

    /**
     * 异步持久化一条调用记录。
     * 写入失败时只落日志，不影响业务。
     */
    @Async("aiInvocationExecutor")
    public void persist(AiInvocation invocation) {
        try {
            repository.save(invocation);
        } catch (Exception e) {
            // 兜底：写入失败不抛异常，只落错误日志
            log.error("Failed to persist ai_invocation: requestId={}, agent={}, userId={}",
                    invocation.getRequestId(), invocation.getAgentName(), invocation.getUserId(), e);
        }
    }

    /**
     * 截断 + 脱敏
     */
    private String sanitize(String text, int maxLength) {
        if (text == null) return null;
        String sanitized = SanitizeUtil.sanitize(text);
        if (sanitized.length() > maxLength) {
            return sanitized.substring(0, maxLength - 3) + "...";
        }
        return sanitized;
    }

    /**
     * 调用句柄 — 封装一次 miao-ai 调用的 start/success/failure 生命周期。
     */
    public static class InvocationHandle {

        private final AiInvocationRecorder recorder;
        private final String requestId;
        private final Long userId;
        private final String agentName;
        private final String requestSummary;
        private final String clientIp;
        private final String userAgent;
        private final long startTimeMs;

        private InvocationHandle(AiInvocationRecorder recorder, Long userId, String agentName,
                                 String requestSummary, String clientIp, String userAgent) {
            this.recorder = recorder;
            this.requestId = UUID.randomUUID().toString();
            this.userId = userId;
            this.agentName = agentName;
            this.requestSummary = requestSummary;
            this.clientIp = clientIp;
            this.userAgent = userAgent;
            this.startTimeMs = System.currentTimeMillis();
        }

        /**
         * 调用成功时调用。
         */
        public void recordSuccess(String model, String mode, String traceId,
                                  Integer promptTokens, Integer completionTokens,
                                  Integer totalTokens, String responseSummary) {
            int latencyMs = (int) (System.currentTimeMillis() - startTimeMs);
            AiInvocation invocation = AiInvocation.builder()
                    .requestId(requestId)
                    .userId(userId)
                    .agentName(agentName)
                    .model(model)
                    .mode(mode)
                    .status("SUCCESS")
                    .latencyMs(latencyMs)
                    .promptTokens(promptTokens != null ? promptTokens : 0)
                    .completionTokens(completionTokens != null ? completionTokens : 0)
                    .totalTokens(totalTokens != null ? totalTokens : 0)
                    .traceId(traceId)
                    .requestSummary(requestSummary)
                    .responseSummary(recorder.sanitize(responseSummary, 512))
                    .clientIp(clientIp)
                    .userAgent(userAgent)
                    .createdAt(LocalDateTime.now())
                    .build();
            recorder.persist(invocation);
        }

        /**
         * 调用失败时调用。
         */
        public void recordFailure(String errorCode, String responseSummary) {
            int latencyMs = (int) (System.currentTimeMillis() - startTimeMs);
            AiInvocation invocation = AiInvocation.builder()
                    .requestId(requestId)
                    .userId(userId)
                    .agentName(agentName)
                    .status("FAILURE")
                    .errorCode(errorCode)
                    .latencyMs(latencyMs)
                    .promptTokens(0)
                    .completionTokens(0)
                    .totalTokens(0)
                    .requestSummary(requestSummary)
                    .responseSummary(recorder.sanitize(responseSummary, 512))
                    .clientIp(clientIp)
                    .userAgent(userAgent)
                    .createdAt(LocalDateTime.now())
                    .build();
            recorder.persist(invocation);
        }
    }
}
