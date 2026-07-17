package com.miao.toolbox.tool.regex;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.miao.toolbox.observability.AiInvocationRecorder;
import com.miao.toolbox.observability.MiaoAiClient;
import com.miao.toolbox.observability.MiaoAiProperties;
import com.miao.toolbox.observability.dto.MiaoAiInvokeResponse;
import com.miao.toolbox.tool.regex.dto.RegexAIRequest;
import com.miao.toolbox.tool.regex.dto.RegexAIResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpHeaders;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URI;
import java.nio.charset.StandardCharsets;
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
    private final ObjectMapper objectMapper;

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

    /**
     * SSE 流式调用 regex-assistant Agent。
     *
     * <p>miao-ai 会把整个 output JSON 作为 token 逐段吐出，done 事件只携带 trace_id/latency_ms。
     * 因此这里把每个 token 片段拼回完整 output JSON，原样转发给前端；在 done 时解析出
     * pattern/explanation/suggestions 用于调用日志记录。
     */
    public void stream(RegexAIRequest request, SseEmitter emitter,
                       AiInvocationRecorder.InvocationHandle handle) {
        HttpURLConnection conn = null;
        try {
            MiaoAiProperties.AgentConfig agent = miaoAiProperties.getAgent(AGENT_KEY);
            String streamUrl = miaoAiClient.getStreamUrl(AGENT_KEY);
            HttpHeaders headers = miaoAiClient.getStreamHeaders(AGENT_KEY);
            Map<String, Object> body = miaoAiClient.buildStreamBody(buildInput(request), buildMetadata(request));

            URI uri = URI.create(streamUrl);
            conn = (HttpURLConnection) uri.toURL().openConnection();
            conn.setRequestMethod("POST");
            conn.setDoOutput(true);
            conn.setConnectTimeout(agent.getConnectTimeout());
            conn.setReadTimeout(0);
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setRequestProperty("Authorization", headers.getFirst("Authorization"));
            conn.setRequestProperty("Accept", "text/event-stream");

            try (OutputStream os = conn.getOutputStream()) {
                os.write(objectMapper.writeValueAsString(body).getBytes(StandardCharsets.UTF_8));
                os.flush();
            }

            int responseCode = conn.getResponseCode();
            if (responseCode != 200) {
                String errorBody = readErrorBody(conn);
                log.error("SSE proxy(regex): miao-ai error HTTP {}: {}", responseCode, errorBody);
                miaoAiClient.recordStreamFailure(handle, "AI_HTTP_" + responseCode,
                        "miao-ai 返回错误: " + responseCode);
                emitter.send(SseEmitter.event()
                        .name("error")
                        .data("{\"message\":\"miao-ai 返回错误: " + responseCode + "\"}"));
                emitter.complete();
                return;
            }

            StringBuilder fullOutput = new StringBuilder();
            int tokenCount = 0;
            try (BufferedReader reader = new BufferedReader(
                    new InputStreamReader(conn.getInputStream(), StandardCharsets.UTF_8))) {

                String line;
                String currentEvent = "message";
                StringBuilder currentData = new StringBuilder();

                while ((line = reader.readLine()) != null) {
                    if (line.startsWith("event:")) {
                        currentEvent = line.substring(6).trim();
                    } else if (line.startsWith("data:")) {
                        currentData.append(line.substring(5).trim());
                    } else if (line.isEmpty()) {
                        if (currentData.length() > 0) {
                            String dataStr = currentData.toString();
                            String event = currentEvent;
                            try {
                                emitter.send(SseEmitter.event().name(event).data(dataStr));

                                if ("token".equals(event)) {
                                    try {
                                        @SuppressWarnings("unchecked")
                                        Map<String, Object> tok = objectMapper.readValue(dataStr, Map.class);
                                        Object t = tok.get("token");
                                        if (t != null) {
                                            fullOutput.append(t);
                                            tokenCount++;
                                        }
                                    } catch (Exception ignored) {
                                        // 单 token 解析失败不阻断流
                                    }
                                } else if ("done".equals(event)) {
                                    recordStreamDone(handle, fullOutput.toString(), dataStr);
                                } else if ("error".equals(event)) {
                                    miaoAiClient.recordStreamFailure(handle, "AI_STREAM_ERROR",
                                            truncate(dataStr, 512));
                                }
                            } catch (Exception sendEx) {
                                log.warn("SSE proxy(regex): failed to send event: {}", sendEx.getMessage());
                                miaoAiClient.recordStreamFailure(handle, "SSE_CLIENT_DISCONNECTED",
                                        "客户端断开连接");
                                break;
                            }
                        }
                        currentEvent = "message";
                        currentData.setLength(0);
                    }
                }
            }

            log.info("SSE proxy(regex): stream completed, forwarded {} token events", tokenCount);
            emitter.complete();

        } catch (Exception e) {
            log.error("SSE proxy(regex) error: {}", e.getMessage(), e);
            miaoAiClient.recordStreamFailure(handle, "SSE_PROXY_ERROR", truncate(e.getMessage(), 512));
            try {
                emitter.send(SseEmitter.event()
                        .name("error")
                        .data("{\"message\":\"AI 助手服务异常: " + e.getMessage() + "\"}"));
            } catch (Exception ignored) {
            }
            try {
                emitter.completeWithError(e);
            } catch (Exception ignored) {
            }
        } finally {
            if (conn != null) {
                try {
                    conn.disconnect();
                } catch (Exception ignored) {
                }
            }
        }
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

    private String readErrorBody(HttpURLConnection conn) {
        try (BufferedReader errReader = new BufferedReader(
                new InputStreamReader(conn.getErrorStream(), StandardCharsets.UTF_8))) {
            StringBuilder sb = new StringBuilder();
            String line;
            while ((line = errReader.readLine()) != null) sb.append(line);
            return sb.toString();
        } catch (Exception e) {
            return "unable to read error body";
        }
    }

    private String truncate(String text, int maxLength) {
        if (text == null) return null;
        return text.length() > maxLength ? text.substring(0, maxLength - 3) + "..." : text;
    }
}
