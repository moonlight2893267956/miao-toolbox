package com.miao.toolbox.tool.regex;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.miao.toolbox.observability.AiInvocationRecorder;
import com.miao.toolbox.observability.AiStreamProxy;
import com.miao.toolbox.observability.MiaoAiClient;
import com.miao.toolbox.observability.MiaoAiProperties;
import com.miao.toolbox.observability.dto.MiaoAiInvokeResponse;
import com.miao.toolbox.tool.regex.dto.RegexAIRequest;
import com.miao.toolbox.tool.regex.dto.RegexAIResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 正则 AI 服务 — 封装对 miao-ai regex-assistant Agent 的调用。
 *
 * <p>五种任务类型：
 * <ul>
 *   <li>generate — 自然语言描述 → 生成正则 + 解释</li>
 *   <li>explain  — 正则 → 逐段解释</li>
 *   <li>optimize — 正则 → 优化建议（suggestions 内嵌优化后表达式）</li>
 *   <li>diagnose — 正则 + 样例 → 匹配诊断与修正表达式</li>
 *   <li>convert  — 正则 → 指定引擎方言转换</li>
 * </ul>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class RegexAIService {

    private static final String AGENT_KEY = "regex-assistant";

    private final MiaoAiClient miaoAiClient;
    private final MiaoAiProperties miaoAiProperties;
    private final ObjectMapper objectMapper;
    /** 流式转发唯一实现：连接建立、事件解析、失败归因、记账幂等都在它那里 */
    private final AiStreamProxy aiStreamProxy;

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
            case "diagnose" -> {
                input.put("pattern", request.getPattern());
                if (request.getFlags() != null) {
                    input.put("flags", request.getFlags());
                }
                if (request.getEngine() != null) {
                    input.put("engine", request.getEngine());
                }
                if (request.getSamples() != null && !request.getSamples().isEmpty()) {
                    input.put("samples", request.getSamples());
                }
                if (request.getConversation() != null && !request.getConversation().isEmpty()) {
                    input.put("conversation", request.getConversation());
                }
            }
            case "convert" -> {
                input.put("pattern", request.getPattern());
                if (request.getEngine() != null) {
                    input.put("engine", request.getEngine());
                }
                if (request.getTargetEngine() != null) {
                    input.put("targetEngine", request.getTargetEngine());
                }
                if (request.getFlags() != null) {
                    input.put("flags", request.getFlags());
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
        String originalPattern = (String) output.get("originalPattern");
        String convertedPattern = (String) output.get("convertedPattern");
        String diagnosis = (String) output.get("diagnosis");
        String engine = (String) output.get("engine");
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
                .originalPattern(originalPattern)
                .convertedPattern(convertedPattern)
                .diagnosis(diagnosis)
                .engine(engine)
                .explanation(explanation)
                .suggestions(suggestions.isEmpty() ? null : suggestions)
                .model(result.getModel())
                .traceId(result.getTraceId())
                .build();
    }

    /**
     * SSE 流式调用 regex-assistant Agent。
     *
     * <p>miao-ai 会把整个 output JSON 作为 token 逐段吐出，done 事件只携带 trace_id/latency_ms。
     * 因此这里把每个 token 片段拼回完整 output JSON，原样转发给前端；在 done 时解析出
     * pattern/explanation/suggestions 用于调用日志记录。
     */
    /**
     * SSE 流式调用 regex-assistant Agent。
     *
     * <p>转发委托 {@link AiStreamProxy}（全仓库唯一实现）；此处只保留 regex 特有的
     * 部分：逐 token 累加输出、收尾时按 regex 的字段记账。
     *
     * <p>收敛后顺带修掉两处原有缺陷：上游断流曾被记成「用户自己断开」（归因反了），
     * 缺 {@code done} 的半截流曾被当成成功。
     */
    public SseEmitter stream(RegexAIRequest request) {
        Map<String, Object> input = buildInput(request);
        Map<String, Object> metadata = buildMetadata(request);

        // 逐 token 累加：done 事件只给最终输出，中间结果要自己攒
        StringBuilder fullOutput = new StringBuilder();

        return aiStreamProxy.proxy(
                AiStreamProxy.Request.of(AGENT_KEY, input, metadata, "regex-assistant")
                        // 保留原 180s，不动既有行为
                        .withTimeout(180_000L),
                new AiStreamProxy.Observer() {
                    @Override
                    public String serviceLabel() {
                        // 与同步路径、未启用提示保持同一自称（见 RegexAIController）
                        return "正则 AI 助手";
                    }

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
