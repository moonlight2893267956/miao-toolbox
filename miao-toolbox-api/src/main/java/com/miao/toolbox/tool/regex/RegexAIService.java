package com.miao.toolbox.tool.regex;

import com.miao.toolbox.observability.MiaoAiClient;
import com.miao.toolbox.observability.MiaoAiProperties;
import com.miao.toolbox.observability.dto.MiaoAiInvokeResponse;
import com.miao.toolbox.tool.regex.dto.RegexAIRequest;
import com.miao.toolbox.tool.regex.dto.RegexAIResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 正则 AI 服务 — 封装对 miao-ai regex-assistant Agent 的调用。
 *
 * <p>三种任务类型：
 * <ul>
 *   <li>generate — 自然语言描述 → 生成正则 + 解释</li>
 *   <li>explain  — 正则 → 逐段解释</li>
 *   <li>optimize — 正则 → 优化后正则 + 建议</li>
 * </ul>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class RegexAIService {

    private static final String AGENT_KEY = "regex-assistant";

    private final MiaoAiClient miaoAiClient;
    private final MiaoAiProperties miaoAiProperties;

    /**
     * 调用 regex-assistant Agent。
     */
    public RegexAIResponse invoke(RegexAIRequest request) {
        MiaoAiProperties.AgentConfig agent = miaoAiProperties.getAgent(AGENT_KEY);
        if (!agent.isEnabled()) {
            throw new com.miao.toolbox.common.exception.BusinessException(
                    "AI_AGENT_DISABLED", "正则 AI 助手未启用", 503);
        }

        Map<String, Object> input = buildInput(request);
        Map<String, Object> metadata = buildMetadata(request);

        MiaoAiInvokeResponse result = miaoAiClient.invoke(AGENT_KEY, input, metadata);

        return parseResponse(request.getTask(), result);
    }

    private Map<String, Object> buildInput(RegexAIRequest request) {
        Map<String, Object> input = new HashMap<>();
        input.put("task", request.getTask());

        switch (request.getTask()) {
            case "generate" -> {
                input.put("description", request.getDescription());
                if (request.getEngine() != null) {
                    input.put("engine", request.getEngine());
                }
            }
            case "explain" -> {
                input.put("pattern", request.getPattern());
                if (request.getFlags() != null) {
                    input.put("flags", request.getFlags());
                }
                if (request.getEngine() != null) {
                    input.put("engine", request.getEngine());
                }
            }
            case "optimize" -> {
                input.put("pattern", request.getPattern());
                if (request.getFlags() != null) {
                    input.put("flags", request.getFlags());
                }
                if (request.getEngine() != null) {
                    input.put("engine", request.getEngine());
                }
            }
            default -> throw new com.miao.toolbox.common.exception.BusinessException(
                    "INVALID_REQUEST", "不支持的任务类型: " + request.getTask(), 400);
        }

        return input;
    }

    private Map<String, Object> buildMetadata(RegexAIRequest request) {
        Map<String, Object> metadata = new HashMap<>();
        metadata.put("tool", "regex-tester");
        metadata.put("action", request.getTask());
        return metadata;
    }

    @SuppressWarnings("unchecked")
    private RegexAIResponse parseResponse(String task, MiaoAiInvokeResponse result) {
        Object outputObj = result.getOutput();
        Map<String, Object> output;

        if (outputObj instanceof Map) {
            output = (Map<String, Object>) outputObj;
        } else {
            // Agent 返回格式不符合预期，兜底处理
            log.warn("Unexpected agent output format for task {}: {}", task, outputObj);
            return RegexAIResponse.builder()
                    .task(task)
                    .pattern(null)
                    .explanation(String.valueOf(outputObj))
                    .suggestions(List.of())
                    .model(result.getModel())
                    .traceId(result.getTraceId())
                    .build();
        }

        String pattern = (String) output.get("pattern");
        String explanation = (String) output.get("explanation");

        List<String> suggestions = new ArrayList<>();
        Object suggestionsObj = output.get("suggestions");
        if (suggestionsObj instanceof List<?> list) {
            for (Object item : list) {
                suggestions.add(String.valueOf(item));
            }
        }

        return RegexAIResponse.builder()
                .task(task)
                .pattern(pattern)
                .explanation(explanation)
                .suggestions(suggestions.isEmpty() ? null : suggestions)
                .model(result.getModel())
                .traceId(result.getTraceId())
                .build();
    }
}
