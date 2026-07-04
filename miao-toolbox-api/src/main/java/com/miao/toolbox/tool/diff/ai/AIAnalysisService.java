package com.miao.toolbox.tool.diff.ai;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.miao.toolbox.common.exception.BusinessException;
import com.miao.toolbox.observability.MiaoAiClient;
import com.miao.toolbox.observability.MiaoAiProperties;
import com.miao.toolbox.observability.dto.MiaoAiInvokeResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.HashMap;
import java.util.Map;

/**
 * AI 分析服务 — 封装对 miao-ai invoke API 的调用。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AIAnalysisService {

    /** diff-explainer agent key */
    private static final String AGENT_KEY = "diff-explainer";

    private final MiaoAiProperties miaoAiProperties;
    private final MiaoAiClient miaoAiClient;
    private final ObjectMapper objectMapper;

    /**
     * 同步调用 miao-ai Agent（选中解释场景）。
     */
    public AIAnalysisResponse analyze(AIAnalysisRequest request) {
        MiaoAiProperties.AgentConfig agent = miaoAiProperties.getAgent(AGENT_KEY);
        if (!agent.isEnabled()) {
            throw new BusinessException("AI_SERVICE_DISABLED", "AI 分析功能未启用", 503);
        }

        Map<String, Object> input = buildInput(request);
        MiaoAiInvokeResponse result = miaoAiClient.invoke(AGENT_KEY, input, Map.of());

        // output 是 agent 返回的完整 Map，需提取 analysis 字段
        Object output = result.getOutput();
        Object analysis = null;
        if (output instanceof Map) {
            analysis = ((Map<?, ?>) output).get("analysis");
        }

        log.info("AI analysis completed: mode={}, model={}, traceId={}",
                request.getMode(), result.getModel(), result.getTraceId());

        return AIAnalysisResponse.builder()
                .mode(result.getMode())
                .analysis(analysis)
                .model(result.getModel())
                .traceId(result.getTraceId())
                .build();
    }

    public String getStreamUrl() {
        return miaoAiClient.getStreamUrl(AGENT_KEY);
    }

    public org.springframework.http.HttpHeaders getStreamHeaders() {
        return miaoAiClient.getStreamHeaders(AGENT_KEY);
    }

    public Map<String, Object> buildInvokeBody(AIAnalysisRequest request) {
        Map<String, Object> input = buildInputInternal(request);
        return miaoAiClient.buildStreamBody(input, Map.of());
    }

    public Map<String, Object> buildInput(AIAnalysisRequest request) {
        return buildInputInternal(request);
    }

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
