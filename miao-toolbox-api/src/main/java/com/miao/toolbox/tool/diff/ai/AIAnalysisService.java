package com.miao.toolbox.tool.diff.ai;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.miao.toolbox.common.exception.BusinessException;
import com.miao.toolbox.observability.MiaoAiClient;
import com.miao.toolbox.observability.dto.MiaoAiInvokeResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.HashMap;
import java.util.Map;

/**
 * AI 分析服务 — 封装对 miao-ai invoke API 的调用。
 *
 * 支持两种调用方式：
 * 1. 同步调用 invoke — 用于选中解释（耗时较短）
 * 2. SSE 流式调用 invoke/stream — 用于全局摘要（耗时较长，逐 token 输出）
 *
 * 重构说明：所有 miao-ai 调用已统一通过 MiaoAiClient 进行，
 * MiaoAiClient 自动通过 AiInvocationRecorder 记录调用日志到 ai_invocations 表。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AIAnalysisService {

    private final MiaoAiProperties miaoAiProperties;
    private final MiaoAiClient miaoAiClient;
    private final ObjectMapper objectMapper;

    /**
     * 同步调用 miao-ai Agent（选中解释场景）。
     * MiaoAiClient 会自动记录调用日志。
     *
     * @param request AI 分析请求
     * @return AI 分析响应
     */
    public AIAnalysisResponse analyze(AIAnalysisRequest request) {
        if (!miaoAiProperties.isEnabled()) {
            throw new BusinessException("AI_SERVICE_DISABLED", "AI 分析功能未启用", 503);
        }

        Map<String, Object> input = buildInput(request);
        MiaoAiInvokeResponse result = miaoAiClient.invoke(
                miaoAiProperties.getAgentName(), input, Map.of());

        log.info("AI analysis completed: mode={}, model={}, traceId={}",
                request.getMode(), result.getModel(), result.getTraceId());

        return AIAnalysisResponse.builder()
                .mode(result.getMode())
                .analysis(result.getOutput())
                .model(result.getModel())
                .traceId(result.getTraceId())
                .build();
    }

    /**
     * 构建 SSE 流式调用 URL（全局摘要场景）。
     * 委托给 MiaoAiClient。
     */
    public String getStreamUrl() {
        return miaoAiClient.getStreamUrl(miaoAiProperties.getAgentName());
    }

    /**
     * 获取 miao-ai 请求头（用于 SSE 代理转发）。
     * 委托给 MiaoAiClient。
     */
    public org.springframework.http.HttpHeaders getStreamHeaders() {
        return miaoAiClient.getStreamHeaders();
    }

    /**
     * 构建 miao-ai invoke 请求体。
     * 委托给 MiaoAiClient，但保持向后兼容。
     */
    public Map<String, Object> buildInvokeBody(AIAnalysisRequest request) {
        Map<String, Object> input = buildInputInternal(request);
        return miaoAiClient.buildStreamBody(input, Map.of());
    }

    // ========== 公开方法 ==========

    /**
     * 仅构建 input 参数（用于 SSE 流调用摘要等场景）。
     */
    public Map<String, Object> buildInput(AIAnalysisRequest request) {
        return buildInputInternal(request);
    }

    // ========== 私有方法 ==========

    /**
     * 从 AIAnalysisRequest 构建 miao-ai 的 input 参数。
     */
    private Map<String, Object> buildInputInternal(AIAnalysisRequest request) {
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

        return input;
    }
}
