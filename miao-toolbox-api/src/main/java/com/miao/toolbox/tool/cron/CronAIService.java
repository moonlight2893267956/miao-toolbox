package com.miao.toolbox.tool.cron;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.miao.toolbox.common.exception.BusinessException;
import com.miao.toolbox.observability.AiInvocationRecorder;
import com.miao.toolbox.observability.AiStreamProxy;
import com.miao.toolbox.observability.MiaoAiClient;
import com.miao.toolbox.observability.MiaoAiProperties;
import com.miao.toolbox.observability.dto.MiaoAiInvokeResponse;
import com.miao.toolbox.tool.cron.dto.CronAIRequest;
import com.miao.toolbox.tool.cron.dto.CronAIResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Cron AI 服务 — 封装对 miao-ai cron-assistant Agent 的调用。
 *
 * <p>五种任务类型：
 * <ul>
 *   <li>generate — 自然语言描述 → 生成 Cron 表达式 + 解释</li>
 *   <li>explain  — Cron 表达式 → 中文详解</li>
 *   <li>optimize — Cron 表达式 → 优化建议</li>
 *   <li>diagnose — Cron 表达式 + 现象 → 排错诊断（多轮）</li>
 *   <li>convert  — Cron 表达式 → 方言转换</li>
 * </ul>
 *
 * <p>SSE 流式逻辑完全复用 RegexAIService 的模式：miao-ai 把整个 output JSON 作为 token 逐段吐出，
 * done 事件仅携带 trace_id/latency_ms，因此这里把每个 token 片段拼回完整 output JSON，原样转发给前端，
 * 在 done 时解析出结构化字段用于调用日志记录。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class CronAIService {

    private static final String AGENT_KEY = "cron-assistant";

    private final MiaoAiClient miaoAiClient;
    private final MiaoAiProperties miaoAiProperties;
    private final ObjectMapper objectMapper;
    /** 流式转发的唯一实现：连接建立、事件解析、失败归因、记账幂等都在它那里 */
    private final AiStreamProxy aiStreamProxy;

    /**
     * 同步调用 cron-assistant Agent。
     */
    public CronAIResponse invoke(CronAIRequest request) {
        MiaoAiProperties.AgentConfig agent = miaoAiProperties.getAgent(AGENT_KEY);
        if (!agent.isEnabled()) {
            throw new BusinessException("AI_AGENT_DISABLED", "Cron AI 助手未启用", 503);
        }

        Map<String, Object> input = buildInput(request);
        Map<String, Object> metadata = buildMetadata(request);

        MiaoAiInvokeResponse result = miaoAiClient.invoke(AGENT_KEY, input, metadata);

        return parseResponse(request.getTask(), result);
    }

    private Map<String, Object> buildInput(CronAIRequest request) {
        Map<String, Object> input = new HashMap<>();
        input.put("task", request.getTask());

        if (request.getDescription() != null && !request.getDescription().isBlank()) {
            input.put("description", request.getDescription());
        }
        if (request.getExpression() != null && !request.getExpression().isBlank()) {
            input.put("expression", request.getExpression());
        }
        if (request.getDialect() != null && !request.getDialect().isBlank()) {
            input.put("dialect", request.getDialect());
        }
        if (request.getTargetDialect() != null && !request.getTargetDialect().isBlank()) {
            input.put("targetDialect", request.getTargetDialect());
        }
        if (request.getPhenomenon() != null && !request.getPhenomenon().isBlank()) {
            input.put("phenomenon", request.getPhenomenon());
        }
        if (request.getConversation() != null && !request.getConversation().isEmpty()) {
            input.put("conversation", request.getConversation());
        }

        return input;
    }

    private Map<String, Object> buildMetadata(CronAIRequest request) {
        Map<String, Object> metadata = new HashMap<>();
        metadata.put("tool", "cron-editor");
        metadata.put("action", request.getTask());
        return metadata;
    }

    @SuppressWarnings("unchecked")
    private CronAIResponse parseResponse(String task, MiaoAiInvokeResponse result) {
        Object outputObj = result.getOutput();
        Map<String, Object> output;

        if (outputObj instanceof Map) {
            output = (Map<String, Object>) outputObj;
        } else {
            log.warn("Unexpected cron agent output format for task {}: {}", task, outputObj);
            return CronAIResponse.builder()
                    .task(task)
                    .explanation(String.valueOf(outputObj))
                    .model(result.getModel())
                    .traceId(result.getTraceId())
                    .build();
        }

        String expression = (String) output.get("expression");
        String dialect = (String) output.get("dialect");
        String originalExpression = (String) output.get("originalExpression");
        String convertedExpression = (String) output.get("convertedExpression");
        String optimizedExpression = (String) output.get("optimizedExpression");
        String explanation = (String) output.get("explanation");
        String diagnosis = (String) output.get("diagnosis");

        List<String> suggestions = new ArrayList<>();
        Object suggestionsObj = output.get("suggestions");
        if (suggestionsObj instanceof List<?> list) {
            for (Object item : list) {
                suggestions.add(String.valueOf(item));
            }
        }

        // optimize 任务：Agent 可能将优化结果放在 optimizedExpression，统一回填到 expression 便于前端采纳
        if ("optimize".equals(task) && expression == null && optimizedExpression != null) {
            expression = optimizedExpression;
        }

        return CronAIResponse.builder()
                .task(task)
                .expression(expression)
                .dialect(dialect)
                .originalExpression(originalExpression)
                .convertedExpression(convertedExpression)
                .optimizedExpression(optimizedExpression)
                .explanation(explanation)
                .suggestions(suggestions.isEmpty() ? null : suggestions)
                .diagnosis(diagnosis)
                .model(result.getModel())
                .traceId(result.getTraceId())
                .build();
    }

    /**
     * SSE 流式调用 cron-assistant Agent。
     *
     * <p>转发本身委托 {@link AiStreamProxy}（全仓库唯一实现）；这里只保留
     * cron 特有的部分：逐 token 累加输出、收尾时按 cron 的字段记账。
     *
     * <p>收敛后顺带修掉两处原有缺陷：上游非 2xx / 上游断流不再与「用户关页面」
     * 记成同一个码，缺 {@code done} 的半截流也不再被当成成功。
     */
    public SseEmitter stream(CronAIRequest request) {
        Map<String, Object> input = buildInput(request);
        Map<String, Object> metadata = buildMetadata(request);

        // 逐 token 累加：cron 的 done 事件只给最终输出，中间结果要自己攒
        StringBuilder fullOutput = new StringBuilder();

        return aiStreamProxy.proxy(
                AiStreamProxy.Request.of(AGENT_KEY, input, metadata, "cron-assistant")
                        // 保留原 180s：cron 表达式生成通常远快于讲解，不动既有行为
                        .withTimeout(180_000L),
                new AiStreamProxy.Observer() {
                    @Override
                    public void onEvent(String name, String data, SseEmitter emitter) {
                        if (!"token".equals(name)) {
                            return;
                        }
                        try {
                            @SuppressWarnings("unchecked")
                            Map<String, Object> tok = objectMapper.readValue(data, Map.class);
                            Object t = tok.get("token");
                            if (t != null) {
                                synchronized (fullOutput) {
                                    fullOutput.append(t);
                                }
                            }
                        } catch (Exception ignored) {
                            // 单个 token 解析失败不该中断整条流
                        }
                    }


                    @Override
                    public void recordSuccess(AiStreamProxy.StreamStats stats,
                                              AiInvocationRecorder.InvocationHandle handle) {
                        String output;
                        synchronized (fullOutput) {
                            output = fullOutput.toString();
                        }
                        recordStreamDone(handle, output, stats.doneData());
                    }
                });
    }


    private void recordStreamDone(AiInvocationRecorder.InvocationHandle handle,
                                  String fullOutput, String doneData) {
        String model = null;
        String mode = null;
        String traceId = null;
        try {
            @SuppressWarnings("unchecked")
            Map<String, Object> done = objectMapper.readValue(doneData, Map.class);
            traceId = (String) done.get("trace_id");
        } catch (Exception ignored) {
        }
        try {
            @SuppressWarnings("unchecked")
            Map<String, Object> output = objectMapper.readValue(fullOutput, Map.class);
            model = (String) output.get("model");
            mode = (String) output.get("mode");
        } catch (Exception ignored) {
        }
        miaoAiClient.recordStreamSuccess(handle, model, mode, traceId,
                null, null, null, truncate(fullOutput, 512));
    }


    private String truncate(String text, int maxLength) {
        if (text == null) return null;
        return text.length() > maxLength ? text.substring(0, maxLength - 3) + "..." : text;
    }
}
