package com.miao.toolbox.tool.diff.ai;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.miao.toolbox.common.response.ApiResponse;
import com.miao.toolbox.observability.AiInvocationRecorder;
import com.miao.toolbox.observability.MiaoAiClient;
import com.miao.toolbox.observability.MiaoAiProperties;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * AI 差异分析 Controller — 提供全局摘要和选中解释两个端点。
 */
@Slf4j
@RestController
@RequestMapping("/api/diff/ai")
@RequiredArgsConstructor
public class DiffAIController {

    private static final String AGENT_KEY = "diff-explainer";

    private final AIAnalysisService aiAnalysisService;
    private final MiaoAiProperties miaoAiProperties;
    private final MiaoAiClient miaoAiClient;

    private final ExecutorService sseExecutor = Executors.newCachedThreadPool();
    private final ObjectMapper objectMapper = new ObjectMapper();

    @PostMapping(value = "/summary", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter summary(@RequestBody AIAnalysisRequest request) {
        MiaoAiProperties.AgentConfig agent = miaoAiProperties.getAgent(AGENT_KEY);
        if (!agent.isEnabled()) {
            SseEmitter emitter = new SseEmitter(0L);
            try {
                emitter.send(SseEmitter.event()
                        .name("error")
                        .data("{\"message\":\"AI 分析功能未启用\"}"));
                emitter.complete();
            } catch (Exception ignored) {}
            return emitter;
        }

        request.setMode("summary");
        SecurityContext securityContext = SecurityContextHolder.getContext();
        SseEmitter emitter = new SseEmitter(180_000L);

        Map<String, Object> input = aiAnalysisService.buildInput(request);
        String requestSummary = safeToJson(input);
        String effectiveAgentName = miaoAiProperties.getEffectiveAgentName(AGENT_KEY);
        AiInvocationRecorder.InvocationHandle handle =
                miaoAiClient.recordStreamStart(effectiveAgentName, requestSummary);

        sseExecutor.execute(() -> {
            SecurityContextHolder.setContext(securityContext);
            try {
                doProxyStream(request, emitter, handle);
            } finally {
                SecurityContextHolder.clearContext();
            }
        });

        emitter.onTimeout(() -> {
            log.warn("SSE emitter timeout for summary");
            miaoAiClient.recordStreamFailure(handle, "SSE_TIMEOUT", "SSE 连接超时");
        });
        emitter.onError(ex -> {
            log.warn("SSE emitter error: {}", ex.getMessage());
            miaoAiClient.recordStreamFailure(handle, "SSE_ERROR", ex.getMessage());
        });

        return emitter;
    }

    @PostMapping("/explain")
    public ResponseEntity<ApiResponse<AIAnalysisResponse>> explain(@RequestBody AIAnalysisRequest request) {
        request.setMode("explain_selection");
        AIAnalysisResponse response = aiAnalysisService.analyze(request);
        return ResponseEntity.ok(ApiResponse.success(response));
    }

    private void doProxyStream(AIAnalysisRequest request, SseEmitter emitter,
                                AiInvocationRecorder.InvocationHandle handle) {
        HttpURLConnection conn = null;
        try {
            MiaoAiProperties.AgentConfig agent = miaoAiProperties.getAgent(AGENT_KEY);
            String streamUrl = aiAnalysisService.getStreamUrl();
            HttpHeaders headers = aiAnalysisService.getStreamHeaders();
            Map<String, Object> body = aiAnalysisService.buildInvokeBody(request);

            log.info("SSE proxy: connecting to miao-ai at {}", streamUrl);

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
                String jsonBody = objectMapper.writeValueAsString(body);
                os.write(jsonBody.getBytes(StandardCharsets.UTF_8));
                os.flush();
            }

            int responseCode = conn.getResponseCode();
            log.info("SSE proxy: miao-ai responded HTTP {}", responseCode);

            if (responseCode != 200) {
                String errorBody = readErrorBody(conn);
                log.error("SSE proxy: miao-ai error (HTTP {}): {}", responseCode, errorBody);
                miaoAiClient.recordStreamFailure(handle, "AI_HTTP_" + responseCode,
                        "miao-ai 返回错误: " + responseCode);
                emitter.send(SseEmitter.event()
                        .name("error")
                        .data("{\"message\":\"miao-ai 返回错误: " + responseCode + "\"}"));
                emitter.complete();
                return;
            }

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
                            try {
                                emitter.send(SseEmitter.event()
                                        .name(currentEvent)
                                        .data(currentData.toString()));

                                if ("done".equals(currentEvent)) {
                                    recordDoneEvent(handle, currentData.toString());
                                }
                                if ("token".equals(currentEvent)) {
                                    tokenCount++;
                                }
                            } catch (Exception sendEx) {
                                log.warn("SSE proxy: failed to send event to client: {}", sendEx.getMessage());
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

            log.info("SSE proxy: stream completed, forwarded {} token events", tokenCount);
            emitter.complete();

        } catch (Exception e) {
            log.error("SSE proxy error: {}", e.getMessage(), e);
            miaoAiClient.recordStreamFailure(handle, "SSE_PROXY_ERROR",
                    truncate(e.getMessage(), 512));
            try {
                emitter.send(SseEmitter.event()
                        .name("error")
                        .data("{\"message\":\"AI 分析服务异常: " + e.getMessage() + "\"}"));
            } catch (Exception ignored) {}
            try {
                emitter.completeWithError(e);
            } catch (Exception ignored) {}
        } finally {
            if (conn != null) {
                try { conn.disconnect(); } catch (Exception ignored) {}
            }
        }
    }

    private void recordDoneEvent(AiInvocationRecorder.InvocationHandle handle, String dataJson) {
        try {
            @SuppressWarnings("unchecked")
            Map<String, Object> doneData = objectMapper.readValue(dataJson, Map.class);

            String model = (String) doneData.get("model");
            String mode = (String) doneData.get("mode");
            String traceId = (String) doneData.get("trace_id");

            Integer promptTokens = null;
            Integer completionTokens = null;
            Integer totalTokens = null;
            @SuppressWarnings("unchecked")
            Map<String, Object> usage = (Map<String, Object>) doneData.get("usage");
            if (usage != null) {
                promptTokens = usage.get("prompt_tokens") instanceof Number n ? n.intValue() : null;
                completionTokens = usage.get("completion_tokens") instanceof Number n ? n.intValue() : null;
                totalTokens = usage.get("total_tokens") instanceof Number n ? n.intValue() : null;
            }

            miaoAiClient.recordStreamSuccess(handle, model, mode, traceId,
                    promptTokens, completionTokens, totalTokens,
                    truncate(String.valueOf(doneData.get("analysis")), 512));

        } catch (Exception e) {
            log.warn("Failed to parse SSE done event for recording: {}", e.getMessage());
            miaoAiClient.recordStreamSuccess(handle, null, null, null,
                    null, null, null, "done_event_parse_failed");
        }
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

    private String safeToJson(Object obj) {
        try {
            return truncate(objectMapper.writeValueAsString(obj), 512);
        } catch (Exception e) {
            return truncate(String.valueOf(obj), 512);
        }
    }
}
